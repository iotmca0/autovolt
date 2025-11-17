const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
console.log('[startup] Starting server.js ...');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { authLimiter, apiLimiter } = require('./middleware/rateLimiter');
const { logger } = require('./middleware/logger');
const routeMonitor = require('./middleware/routeMonitor');


// --- MQTT client for Mosquitto broker (for ESP32 communication) ---
const mqtt = require('mqtt');
const MOSQUITTO_PORT = process.env.MQTT_PORT || 1883; // Use standard MQTT port
const MOSQUITTO_HOST = process.env.MQTT_BROKER || '172.16.3.171'; // Use network MQTT broker

const mqttClient = mqtt.connect(`mqtt://${MOSQUITTO_HOST}:${MOSQUITTO_PORT}`, {
  clientId: 'backend_server',
  clean: true,
  connectTimeout: 10000, // Increased from 4000ms to 10 seconds
  reconnectPeriod: 5000, // Increased from 1000ms to 5 seconds to reduce reconnection spam
  keepalive: 60, // Add 60-second keepalive heartbeat
  protocolVersion: 4,
  resubscribe: true, // Automatically resubscribe on reconnect
  queueQoSZero: false, // Don't queue QoS 0 messages during disconnect
});

// Import models
const Device = require('./models/Device');
const ActivityLog = require('./models/ActivityLog');
const Counter = require('./models/Counter');

mqttClient.on('connect', () => {
  console.log(`[MQTT] Connected to Aedes broker on port ${MOSQUITTO_PORT}`);
  mqttClient.subscribe('#', (err) => {
    if (!err) {
      console.log('[MQTT] Subscribed to all topics (#) to receive from all devices');
    }
  });
});

mqttClient.on('error', (error) => {
  console.error('[MQTT] Connection error:', error.message);
});

mqttClient.on('offline', () => {
  console.log('[MQTT] Client offline - will attempt reconnection');
});

mqttClient.on('reconnect', () => {
  console.log('[MQTT] Attempting reconnection...');
});

mqttClient.on('close', () => {
  console.log('[MQTT] Connection closed');
});

mqttClient.on('message', (topic, message) => {
  try {
    console.log(`[MQTT] Received message on ${topic}: ${message.toString()}`);
    // Handle ESP32 state updates
    if (topic === 'esp32/state') {
      try {
        const payload = message.toString();
        let data;
        try {
          data = JSON.parse(payload);
        } catch (e) {
          console.warn('[MQTT] esp32/state: Not JSON, skipping device update');
          return;
        }
        if (!data.mac) {
          console.warn('[MQTT] esp32/state: No mac field in payload, skipping');
          return;
        }
        // Normalize MAC address: remove colons, make lowercase
        function normalizeMac(mac) {
          return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
        }
        const normalizedMac = normalizeMac(data.mac);
        Device.findOne({
          $or: [
            { macAddress: data.mac },
            { macAddress: data.mac.toUpperCase() },
            { macAddress: data.mac.toLowerCase() },
            { macAddress: normalizedMac },
            { macAddress: normalizedMac.toUpperCase() },
            { macAddress: normalizedMac.toLowerCase() }
          ]
        }).select('+deviceSecret').then(device => {
          if (!device) {
            console.warn('[MQTT] esp32/state: Device not found for MAC:', data.mac);
            return;
          }

          if (data.secret && data.secret !== device.deviceSecret) {
            console.warn('[MQTT] esp32/state: Invalid secret for device:', device.macAddress);
            return;
          }

          // Update device status
          const wasOnline = device.status === 'online';
          device.status = 'online';
          device.lastSeen = new Date();
          // Only set onlineSince if device was previously offline or onlineSince is missing
          if (!wasOnline || !device.onlineSince) {
            device.onlineSince = new Date();
          }

          let stateChanged = false;
          const stateChanges = []; // Track state changes for ActivityLog

          // Update switch states from ESP32 payload if switches array is present
          if (data.switches && Array.isArray(data.switches)) {
            data.switches.forEach(esp32Switch => {
              try {
                const deviceSwitch = device.switches.find(s => (s.relayGpio || s.gpio) === esp32Switch.gpio);
                if (deviceSwitch) {
                  // Ensure relayGpio is set if missing (for backward compatibility)
                  if (!deviceSwitch.relayGpio) {
                    deviceSwitch.relayGpio = deviceSwitch.gpio;
                  }
                  if (deviceSwitch.state !== esp32Switch.state) {
                    // Record state change for ActivityLog
                    stateChanges.push({
                      switchId: deviceSwitch._id,
                      switchName: deviceSwitch.name,
                      oldState: deviceSwitch.state,
                      newState: esp32Switch.state,
                      manualOverride: esp32Switch.manual_override || false
                    });
                    
                    deviceSwitch.state = esp32Switch.state;
                    deviceSwitch.manualOverride = esp32Switch.manual_override || false;
                    deviceSwitch.lastStateChange = new Date();
                    stateChanged = true;
                    console.log(`[MQTT] Updated switch GPIO ${esp32Switch.gpio} to state ${esp32Switch.state} for device ${device.macAddress}`);
                  }
                }
              } catch (switchError) {
                console.error('[MQTT] Error updating switch state:', switchError);
              }
            });
          }

          // Save device
          device.save().then(async () => {
            console.log(`[MQTT] Marked device ${device.macAddress} as online`);

            // Log ESP32 status update to database
            try {
              const DeviceStatusLog = require('./models/DeviceStatusLog');
              
              // Prepare switch states for logging
              const switchStates = [];
              if (data.switches && Array.isArray(data.switches)) {
                data.switches.forEach(esp32Switch => {
                  const deviceSwitch = device.switches.find(s => (s.relayGpio || s.gpio) === esp32Switch.gpio);
                  if (deviceSwitch) {
                    switchStates.push({
                      switchId: deviceSwitch._id.toString(),
                      switchName: deviceSwitch.name,
                      physicalPin: esp32Switch.gpio,
                      expectedState: deviceSwitch.state,
                      actualState: esp32Switch.state,
                      isMatch: deviceSwitch.state === esp32Switch.state,
                      lastChanged: deviceSwitch.lastStateChange || new Date(),
                      changeReason: esp32Switch.manual_override ? 'manual' : 'esp32_status'
                    });
                  }
                });
              }

              // Calculate summary
              const totalSwitchesOn = switchStates.filter(s => s.actualState).length;
              const totalSwitchesOff = switchStates.length - totalSwitchesOn;

              // Create status log entry
              const logEntry = await DeviceStatusLog.create({
                deviceId: device._id,
                deviceName: device.name,
                deviceMac: device.macAddress,
                checkType: 'scheduled_check',
                switchStates: switchStates,
                deviceStatus: {
                  isOnline: true,
                  lastSeen: device.lastSeen,
                  freeHeap: data.heap || 0,
                  responseTime: 0 // Could be calculated if needed
                },
                summary: {
                  totalSwitchesOn: totalSwitchesOn,
                  totalSwitchesOff: totalSwitchesOff,
                  inconsistenciesFound: switchStates.filter(s => !s.isMatch).length
                },
                classroom: device.classroom,
                location: device.location,
                timestamp: new Date()
              });

              console.log(`[MQTT] ✅ Successfully logged ESP32 status update for device ${device.macAddress}: ${totalSwitchesOn} ON, ${totalSwitchesOff} OFF (Log ID: ${logEntry._id})`);
            } catch (logError) {
              console.error('[MQTT] ❌ Error logging ESP32 status update:', logError.message);
              console.error('[MQTT] Log error details:', logError);
            }

            // DISABLED: ActivityLog creation moved to avoid duplicates
            // ActivityLog is created in deviceController.js when user toggles via web UI
            // Only create logs here for MANUAL physical switch presses (manualOverride flag)
            if (stateChanges.length > 0) {
              try {
                const ActivityLog = require('./models/ActivityLog');
                
                for (const change of stateChanges) {
                  // Only log if this was a MANUAL physical switch press, not a web UI toggle
                  if (change.manualOverride) {
                    const action = change.newState ? 'manual_on' : 'manual_off';
                    
                    await ActivityLog.create({
                      deviceId: device._id,
                      deviceName: device.name,
                      switchId: change.switchId,
                      switchName: change.switchName,
                      action: action,
                      triggeredBy: 'manual_switch',
                      classroom: device.classroom,
                      location: device.location,
                      timestamp: new Date(),
                      context: {
                        source: 'esp32_physical_switch',
                        previousState: change.oldState,
                        newState: change.newState,
                        manualOverride: true
                      }
                    });
                    
                    console.log(`[MQTT] ✅ Created ActivityLog for MANUAL switch: ${device.name} - ${change.switchName}: ${action}`);
                  } else {
                    // State change was from web UI - log is already created by deviceController
                    console.log(`[MQTT] ℹ️  Skipping ActivityLog (web UI toggle): ${device.name} - ${change.switchName}`);
                  }
                }
              } catch (activityError) {
                console.error('[MQTT] ❌ Error creating ActivityLog entries:', activityError.message);
              }
            }

            // Send current configuration to ESP32
            sendDeviceConfigToESP32(device.macAddress);

            // Only emit events if state actually changed or this is the first time we're seeing the device online
            if (stateChanged || device.status !== 'online') {
              // Emit to frontend via Socket.IO if available
              if (global.io) {
                // 1. Legacy event for backward compatibility
                global.io.emit('deviceStatusUpdate', {
                  macAddress: device.macAddress,
                  status: 'online',
                  lastSeen: device.lastSeen
                });
                // 2. device_state_changed for React UI (with debouncing)
                // Re-enable the debounced, sequence-aware device state emitter so the UI reflects
                // changes when the ESP publishes updated switch states.
                try {
                  emitDeviceStateChanged(device, { source: 'mqtt_online' });
                } catch (e) {
                  logger.error('[emitDeviceStateChanged] error', e && e.message ? e.message : e);
                }
                // 3. device_connected event for real-time UI feedback
                global.io.emit('device_connected', {
                  deviceId: device.id || device._id?.toString(),
                  deviceName: device.name,
                  location: device.location || '',
                  macAddress: device.macAddress,
                  lastSeen: device.lastSeen
                });
              }
            }
          }).catch(err => {
            console.error('[MQTT] Error saving device:', err);
          });
        }).catch(err => {
          console.error('[MQTT] Error finding device:', err);
        });
      } catch (e) {
        console.error('[MQTT] Exception in esp32/state handler:', e);
      }
    }
    if (topic === 'esp32/telemetry') {
      // Parse and process telemetry
      const telemetry = message.toString();
      console.log('[MQTT] ESP32 telemetry:', telemetry);

      try {
        const data = JSON.parse(telemetry);
        if (data.type === 'manual_switch') {
          // Handle manual switch event for logging and state update
          console.log('[MQTT] Manual switch event:', data);
          // Find the device and update switch state + log the manual operation
          const Device = require('./models/Device');
          const ActivityLog = require('./models/ActivityLog');
          const ManualSwitchLog = require('./models/ManualSwitchLog');

          // Normalize MAC address: remove colons, make lowercase (same as esp32/state handler)
          function normalizeMac(mac) {
            return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
          }
          // Basic validations to help debug missing telemetry
          if (!data.mac) {
            console.warn('[MQTT] manual_switch telemetry missing mac:', telemetry);
            return;
          }
          if (typeof data.gpio === 'undefined' || data.gpio === null) {
            console.warn('[MQTT] manual_switch telemetry missing gpio:', telemetry);
            return;
          }

          const normalizedMac = normalizeMac(data.mac);

          Device.findOne({ $or: [
            { macAddress: data.mac },
            { macAddress: data.mac.toUpperCase() },
            { macAddress: data.mac.toLowerCase() },
            { macAddress: normalizedMac },
            { macAddress: normalizedMac.toUpperCase() },
            { macAddress: normalizedMac.toLowerCase() }
          ] })
            .then(async (device) => {
              if (device) {
                console.log(`[DEBUG] Found device: ${device.name}, switches: ${device.switches.length}`);
                // Find the switch by GPIO
                const switchInfo = device.switches.find(sw => (sw.relayGpio || sw.gpio) === data.gpio);
                console.log(`[DEBUG] Looking for switch with GPIO ${data.gpio}, found:`, switchInfo ? switchInfo.name : 'NOT FOUND');
                if (!switchInfo) {
                  console.warn('[MQTT] manual_switch telemetry: switch not found for device. Payload:', telemetry, 'Device switches:', device.switches.map(s=>({name:s.name,gpio:s.gpio,relayGpio:s.relayGpio}))); 
                }
                if (switchInfo) {
                  // Update the switch state in database
                  const updatedDevice = await Device.findOneAndUpdate(
                    { _id: device._id, 'switches._id': switchInfo._id },
                    {
                      $set: {
                        'switches.$.state': data.state,
                        'switches.$.lastStateChange': new Date(),
                        lastModifiedBy: null, // Manual switch from ESP32
                        lastSeen: new Date(),
                        status: 'online'
                      }
                    },
                    { new: true }
                  );

                  // Log the manual operation
                  // Persist ActivityLog and ManualSwitchLog with raw telemetry for reliable mapping
                  await ActivityLog.create({
                    deviceId: device._id,
                    deviceName: device.name,
                    switchId: switchInfo._id,
                    switchName: switchInfo.name,
                    action: data.state ? 'manual_on' : 'manual_off',
                    triggeredBy: 'manual_switch',
                    classroom: device.classroom,
                    location: device.location,
                    ip: 'ESP32',
                    userAgent: 'ESP32 Manual Switch',
                    context: {
                      telemetry: {
                        gpio: data.gpio,
                        physicalPin: data.physicalPin || null,
                        mac: data.mac,
                        heap: data.heap || null
                      }
                    }
                  });

                  try {
                    // Use centralized EnhancedLoggingService to persist manual switch logs
                    const EnhancedLoggingService = require('./services/enhancedLoggingService');
                    await EnhancedLoggingService.logManualSwitch({
                      deviceId: device._id,
                      deviceName: device.name,
                      deviceMac: data.mac,
                      switchId: switchInfo._id,
                      switchName: switchInfo.name,
                      physicalPin: data.physicalPin || data.gpio,
                      action: data.state ? 'manual_on' : 'manual_off',
                      previousState: 'unknown',
                      newState: data.state ? 'on' : 'off',
                      classroom: device.classroom,
                      location: device.location,
                      timestamp: new Date(),
                      context: {
                        heap: data.heap || null,
                        rawPayload: data
                      }
                    });
                  } catch (msErr) {
                    console.error('[MQTT] EnhancedLoggingService.logManualSwitch failed:', msErr && msErr.stack ? msErr.stack : msErr);
                  }

                  console.log(`[ACTIVITY] Logged manual switch: ${device.name} - ${switchInfo.name} -> ${data.state ? 'ON' : 'OFF'}`);

                  // Emit real-time update to frontend
                  console.log(`[DEBUG] global.io available: ${!!global.io}, updatedDevice available: ${!!updatedDevice}`);
                  if (global.io && updatedDevice) {
                    console.log('[DEBUG] Emitting device_state_changed for manual switch:', {
                      deviceId: updatedDevice._id,
                      switchId: switchInfo._id,
                      newState: data.state,
                      source: 'mqtt_manual_switch'
                    });
                    try {
                      emitDeviceStateChanged(updatedDevice, {
                        source: 'mqtt_manual_switch',
                        note: `Manual switch ${switchInfo.name} changed to ${data.state ? 'ON' : 'OFF'}`
                      });
                    } catch (e) {
                      logger.error('[emitDeviceStateChanged] manual switch emit error', e && e.message ? e.message : e);
                    }
                    console.log(`[MQTT] Emitted device_state_changed for manual switch: ${device.name}`);
                  } else {
                    console.log(`[DEBUG] NOT emitting - global.io: ${!!global.io}, updatedDevice: ${!!updatedDevice}`);
                  }
                }
              }
            })
            .catch(err => console.error('[MQTT] Error processing manual switch:', err.message));
        } else if (data.type === 'switch_event') {
          // Handle switch event for both ActivityLog AND new power tracking system
          console.log('[MQTT] Switch event:', data);
          const Device = require('./models/Device');
          const ActivityLog = require('./models/ActivityLog');
          const telemetryIngestionService = require('./services/telemetryIngestionService');

          // Normalize MAC address
          function normalizeMac(mac) {
            return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
          }

          if (!data.mac) {
            console.warn('[MQTT] switch_event telemetry missing mac:', telemetry);
            return;
          }
          if (typeof data.gpio === 'undefined' || data.gpio === null) {
            console.warn('[MQTT] switch_event telemetry missing gpio:', telemetry);
            return;
          }

          const normalizedMac = normalizeMac(data.mac);

          Device.findOne({ $or: [
            { macAddress: data.mac },
            { macAddress: data.mac.toUpperCase() },
            { macAddress: data.mac.toLowerCase() },
            { macAddress: normalizedMac },
            { macAddress: normalizedMac.toUpperCase() },
            { macAddress: normalizedMac.toLowerCase() }
          ] })
            .then(async (device) => {
              if (device) {
                // Find the switch by GPIO
                const switchInfo = device.switches.find(sw => (sw.relayGpio || sw.gpio) === data.gpio);
                if (switchInfo) {
                  // 1. Centralized logging for all switch events.
                  // The source determines how we attribute the action.
                  const source = data.source || 'unknown';
                  const isFromBackend = source === 'backend';

                  await ActivityLog.create({
                    deviceId: device._id,
                    deviceName: device.name,
                    switchId: switchInfo._id,
                    switchName: switchInfo.name,
                    action: data.state ? 'on' : 'off',
                    // If it's from the backend, it's a 'user' action, otherwise it's based on the source (e.g., 'pir', 'manual_switch')
                    triggeredBy: isFromBackend ? 'user' : (source === 'motion' ? 'pir' : 'manual_switch'),
                    // Use user details from the MQTT payload if available (for backend-initiated actions)
                    userId: data.userId,
                    userName: data.userName,
                    classroom: device.classroom,
                    location: device.location,
                    // If not from the backend, the IP is the ESP32 itself. If from the backend, we don't have IP here, so mark as 'Web UI'.
                    ip: isFromBackend ? 'Web UI' : 'ESP32',
                    userAgent: isFromBackend ? 'Web Application' : (source === 'motion' ? 'ESP32 Motion Sensor' : 'ESP32 Manual Switch'),
                    context: {
                      source: source,
                      gpio: data.gpio,
                      physicalPin: data.physicalPin || null,
                      heap: data.heap || null,
                      telemetry: data,
                      sensorTriggered: source === 'motion'
                    }
                  });

                  console.log(`[ACTIVITY] Logged '${source}' switch event: ${device.name} - ${switchInfo.name} -> ${data.state ? 'ON' : 'OFF'} by ${data.userName || source}`);

                  // Monitoring rule: Turn off switches if turned on between 8 AM and 9 AM IST
                  const now = new Date();
                  const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
                  const istTime = new Date(now.getTime() + istOffset);
                  const hour = istTime.getUTCHours();
                  if (hour >= 8 && hour < 9 && data.state === true) {
                    console.log(`[MONITORING RULE] Turning off switch ${switchInfo.name} on device ${device.name} during 8-9 AM monitoring period`);
                    
                    // Send off command
                    sendMqttSwitchCommand(normalizedMac, data.gpio, false, { id: 'system', name: 'Monitoring System' });
                    
                    // Log the automated off action
                    await ActivityLog.create({
                      deviceId: device._id,
                      deviceName: device.name,
                      switchId: switchInfo._id,
                      switchName: switchInfo.name,
                      action: 'off',
                      triggeredBy: 'monitoring',
                      userId: null,
                      userName: 'Monitoring System',
                      classroom: device.classroom,
                      location: device.location,
                      ip: 'System',
                      userAgent: 'Automated Monitoring',
                      context: {
                        source: 'monitoring_rule',
                        gpio: data.gpio,
                        reason: 'Switched on during 8-9 AM monitoring period'
                      }
                    });
                  }

                  // 2. Ingest to NEW power tracking system
                  try {
                    // Build switch state map for all switches on this device
                    const switchStateMap = {};
                    for (const sw of device.switches) {
                      switchStateMap[`relay${sw.gpio}`] = sw.state;
                    }
                    // Update the changed switch
                    switchStateMap[`relay${data.gpio}`] = data.state;

                    await telemetryIngestionService.ingestTelemetry({
                      esp32_name: device.name,
                      classroom: device.classroom,
                      device_id: normalizedMac,
                      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
                      // We don't have actual power measurement hardware, so leave these undefined
                      // Backend will calculate based on time-based estimation
                      power_w: undefined,
                      energy_wh_total: undefined,
                      switch_state: switchStateMap,
                      status: 'online',
                      mqtt_topic: topic,
                      mqtt_payload: {
                        type: 'switch_event',
                        gpio: data.gpio,
                        state: data.state,
                        source: data.source,
                        power_rating: switchInfo.powerRating || 0
                      }
                    });

                    console.log(`[POWER_TRACKING] Ingested switch event: ${device.name} GPIO${data.gpio}=${data.state ? 'ON' : 'OFF'} (${switchInfo.powerRating || 0}W)`);
                  } catch (powerError) {
                    console.error('[POWER_TRACKING] Error ingesting switch event:', powerError.message);
                  }

                  // 3. Emit real-time update to frontend
                  if (global.io) {
                    try {
                      emitDeviceStateChanged(device, {
                        source: 'mqtt_sensor_switch',
                        note: `Sensor switch ${switchInfo.name} changed to ${data.state ? 'ON' : 'OFF'}`
                      });
                    } catch (e) {
                      logger.error('[emitDeviceStateChanged] sensor switch emit error', e && e.message ? e.message : e);
                    }
                  }
                } else {
                  console.warn('[MQTT] switch_event telemetry: switch not found for device. Payload:', telemetry, 'Device switches:', device.switches.map(s=>({name:s.name,gpio:s.gpio,relayGpio:s.relayGpio})));
                }
              }
            })
            .catch(err => console.error('[MQTT] Error processing switch_event:', err.message));
        }
      } catch (err) {
        console.warn('[MQTT] Failed to parse telemetry JSON:', err.message);
      }
    }
  } catch (error) {
    console.error('[MQTT] Unhandled error in message handler:', error);
  }
});

mqttClient.on('error', (error) => {
  console.error('[MQTT] Connection error:', error);
});

// Make MQTT client available globally (routes will access it after app init)
global.mqttClient = mqttClient;

// -----------------------------------------------------------------------------
// Device state sequencing & unified emit helper
// -----------------------------------------------------------------------------
// Adds a monotonically increasing per-device sequence number to every
// device_state_changed event for deterministic ordering + easier debug of
// stale/ out-of-order UI updates.
const deviceSeqMap = new Map(); // deviceId -> last seq
function nextDeviceSeq(deviceId) {
  const prev = deviceSeqMap.get(deviceId) || 0;
  const next = prev + 1;
  deviceSeqMap.set(deviceId, next);
  return next;
}

// Debouncing for MQTT state messages to prevent spam
const deviceStateDebounce = new Map(); // deviceId -> {timeoutId, lastStateHash}
const DEBOUNCE_MS = 500; // 500ms debounce window for faster UI updates

function emitDeviceStateChanged(device, meta = {}) {
  console.log(`[DEBUG] emitDeviceStateChanged called for device: ${device?.name || 'unknown'}`);
  if (!device) return;
  const deviceId = device.id || device._id?.toString();
  if (!deviceId) return;

  // Create a simple hash of the device state for debouncing
  const stateHash = JSON.stringify({
    status: device.status,
    switches: device.switches?.map(s => ({ id: s.id, state: s.state })) || []
  });

  // Check if we have a pending debounce for this device
  const existing = deviceStateDebounce.get(deviceId);
  if (existing) {
    // If state hasn't changed, extend the debounce
    if (existing.lastStateHash === stateHash) {
      clearTimeout(existing.timeoutId);
      existing.timeoutId = setTimeout(() => {
        deviceStateDebounce.delete(deviceId);
        emitDeviceStateChangedNow(device, meta);
      }, DEBOUNCE_MS);
      return;
    }
    // If state changed, clear the old timeout
    clearTimeout(existing.timeoutId);
  }

  // Set up new debounce
  const timeoutId = setTimeout(() => {
    deviceStateDebounce.delete(deviceId);
    emitDeviceStateChangedNow(device, meta);
  }, DEBOUNCE_MS);

  deviceStateDebounce.set(deviceId, { timeoutId, lastStateHash: stateHash });
}

function emitDeviceStateChangedNow(device, meta = {}) {
  const deviceId = device.id || device._id?.toString();
  if (!deviceId) return;

  const seq = nextDeviceSeq(deviceId);
  const payload = {
    deviceId,
    state: device,
    ts: Date.now(),
    seq,
    source: meta.source || 'unknown',
    note: meta.note
  };
  console.log(`[DEBUG] Emitting device_state_changed payload:`, { deviceId, seq, source: payload.source });
  io.emit('device_state_changed', payload);
  // Focused debug log (avoid dumping entire device doc unless explicitly enabled)
  if (process.env.DEVICE_SEQ_LOG === 'verbose') {
    logger.info('[emitDeviceStateChanged]', { deviceId, seq, source: payload.source, note: payload.note });
  } else if (process.env.DEVICE_SEQ_LOG === 'basic') {
    logger.debug('[emitDeviceStateChanged]', { deviceId, seq, source: payload.source });
  }
}

// Function to send switch commands to ESP32 via MQTT
function sendMqttSwitchCommand(macAddress, gpio, state, user = {}) {
  console.log(`[MQTT] sendMqttSwitchCommand called: MAC=${macAddress}, GPIO=${gpio}, state=${state}`);
  
  // Get device secret from database
  Device.findOne({ macAddress: new RegExp('^' + macAddress + '$', 'i') }).select('+deviceSecret').then(device => {
    console.log(`[MQTT] Database query result: device found=${!!device}`);
    
    if (!device || !device.deviceSecret) {
      console.warn('[MQTT] Device not found or no secret for MAC:', macAddress);
      return;
    }
    
    const normalizedMac = (macAddress || '').toString();
    const command = {
      mac: normalizedMac, // Include MAC address to target specific device
      secret: device.deviceSecret, // Include device secret for authentication
      gpio: gpio,           // Physical relay GPIO expected by firmware
      relayGpio: gpio,      // Duplicate field for backward compatibility
      state: state,
      source: 'backend', // Explicitly set source to 'backend'
      // Include a userId so firmware will accept the command. Use default_user to
      // match the lightweight firmware auth check (it accepts 'default_user' or 'admin').
      userId: user.id || process.env.MQTT_COMMAND_USER || 'default_user',
      userName: user.name || 'System',
    };
    const message = JSON.stringify(command);

    console.log(`[MQTT] Publishing to esp32/switches (qos=1):`, message);
    // Publish with QoS=1 to increase delivery reliability to the device
    mqttClient.publish('esp32/switches', message, { qos: 1, retain: false }, (err) => {
      if (err) {
        console.error('[MQTT] Error publishing switch command to esp32/switches:', err.message || err);
      } else {
        console.log('[MQTT] switch command published successfully');
      }
    });
  }).catch(err => {
    console.error('[MQTT] Error getting device secret:', err.message, err.stack);
  });
}

// Send device configuration to ESP32 via MQTT
function sendDeviceConfigToESP32(macAddress) {
  try {
    // Get device config from database
    Device.findOne({ macAddress: new RegExp('^' + macAddress + '$', 'i') }).select('+deviceSecret').then(device => {
      if (!device || !device.deviceSecret) {
        console.warn('[MQTT] Device not found or no secret for MAC:', macAddress);
        return;
      }

      try {
        const config = {
          mac: macAddress,
          secret: device.deviceSecret,
          // Include userId 'admin' for configuration pushes so the firmware
          // accepts and applies configuration updates.
          userId: process.env.MQTT_CONFIG_USER || 'admin',
          // Include both gpio and relayGpio as well as both manualGpio and
          // manualSwitchGpio to ensure both firmware and frontend consumers
          // can read the pin mapping regardless of the field name they expect.
          switches: device.switches.map(sw => ({
            gpio: sw.relayGpio || sw.gpio,
            relayGpio: sw.relayGpio || sw.gpio,
            manualGpio: sw.manualSwitchGpio !== undefined ? sw.manualSwitchGpio : sw.manualGpio,
            manualSwitchGpio: sw.manualSwitchGpio !== undefined ? sw.manualSwitchGpio : sw.manualGpio,
            manualMode: sw.manualMode || 'maintained',
            usePir: sw.usePir || false,           // ✅ Per-switch PIR control
            dontAutoOff: sw.dontAutoOff || false  // ✅ Prevent auto-off for this switch
          })),
          // Motion sensor configuration (Fixed GPIO: 34 for PIR, 35 for Microwave)
          motionSensor: {
            enabled: device.pirEnabled || false,
            type: device.pirSensorType || 'hc-sr501',
            gpio: device.pirSensorType === 'rcwl-0516' ? 35 : 34,  // Fixed: GPIO 34 for PIR, 35 for Microwave
            autoOffDelay: device.pirAutoOffDelay || 30,
            sensitivity: device.pirSensitivity || 50,
            detectionRange: device.pirDetectionRange || 7,
            dualMode: device.pirSensorType === 'both',
            secondaryGpio: 35,  // Fixed: GPIO 35 for secondary sensor
            secondaryType: 'rcwl-0516',  // Always microwave for secondary
            detectionLogic: device.motionDetectionLogic || 'and',
            // PIR Detection Schedule
            scheduleEnabled: device.pirDetectionSchedule?.enabled || false,
            activeStartTime: device.pirDetectionSchedule?.activeStartTime || '18:00',
            activeEndTime: device.pirDetectionSchedule?.activeEndTime || '22:00',
            activeDays: device.pirDetectionSchedule?.daysOfWeek || [],
            timezone: 'IST-5:30IST' // POSIX format with no DST: IST is UTC+5:30
          }
        };

        const message = JSON.stringify(config);
        // Publish config with QoS=1 so device receives reliable config updates
        mqttClient.publish('esp32/config', message, { qos: 1, retain: false }, (err) => {
          if (err) {
            console.error('[MQTT] Error publishing device config to esp32/config:', err.message || err);
          } else {
            console.log('[MQTT] Device config published to esp32/config successfully');
          }
        });
      } catch (jsonError) {
        console.error('[MQTT] Error creating/configuring device config:', jsonError);
      }
    }).catch(err => {
      console.error('[MQTT] Error getting device config:', err.message);
    });
  } catch (error) {
    console.error('[MQTT] Error in sendDeviceConfigToESP32:', error);
  }
}

// ========================================
// NEW POWER SYSTEM: MQTT Message Routing
// ========================================
// Route new telemetry format to ingestion service
mqttClient.on('message', async (topic, message) => {
  try {
    // Handle new power system telemetry: autovolt/<esp32_name>/telemetry
    if (topic.startsWith('autovolt/') && topic.endsWith('/telemetry')) {
      const parts = topic.split('/');
      const esp32_name = parts[1];
      
      try {
        const payload = JSON.parse(message.toString());
        
        // Only process if it has the new telemetry format
        if (payload.energy_wh_total !== undefined || payload.power_w !== undefined) {
          const telemetryIngestionService = require('./services/telemetryIngestionService');
          
          await telemetryIngestionService.ingestTelemetry({
            esp32_name: payload.esp32_name || esp32_name,
            classroom: payload.classroom,
            device_id: payload.device_id || 'all_devices',
            timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
            power_w: payload.power_w,
            energy_wh_total: payload.energy_wh_total,
            switch_state: payload.switch_state || {},
            status: payload.status || 'online',
            mqtt_topic: topic,
            mqtt_payload: payload
          });
          
          console.log(`[NEW_POWER] Processed telemetry from ${esp32_name}: energy=${payload.energy_wh_total} Wh`);
        }
      } catch (error) {
        console.error(`[NEW_POWER] Error processing telemetry from ${topic}:`, error);
      }
    }
    
    // Handle device status (LWT): autovolt/<esp32_name>/status
    if (topic.startsWith('autovolt/') && topic.endsWith('/status')) {
      const parts = topic.split('/');
      const esp32_name = parts[1];
      
      try {
        const payload = JSON.parse(message.toString());
        console.log(`[NEW_POWER] Device status update: ${esp32_name} = ${payload.status}`);
        
        // TODO: Update device online/offline status in Device model
        // This will be used by the reconciliation job to detect missing heartbeats
        
      } catch (error) {
        console.error(`[NEW_POWER] Error processing status from ${topic}:`, error);
      }
    }
    
    // Handle heartbeat: autovolt/<esp32_name>/heartbeat
    if (topic.startsWith('autovolt/') && topic.endsWith('/heartbeat')) {
      const parts = topic.split('/');
      const esp32_name = parts[1];
      
      try {
        const payload = JSON.parse(message.toString());
        console.log(`[NEW_POWER] Heartbeat from ${esp32_name}: heap=${payload.heap} bytes`);
        
      } catch (error) {
        console.error(`[NEW_POWER] Error processing heartbeat from ${topic}:`, error);
      }
    }
  } catch (error) {
    // Ignore errors from non-JSON messages or unrelated topics
  }
});
// ========================================

// Make MQTT functions available globally (if needed elsewhere)
global.sendMqttSwitchCommand = sendMqttSwitchCommand;
global.sendDeviceConfigToESP32 = sendDeviceConfigToESP32;

console.log('[MQTT] Using Mosquitto broker for all ESP32 device communication');

// Load secure configuration if available
let secureConfig = {};
try {
    // Temporarily disable secure config loading for debugging
    console.log('⚠️  Secure configuration loading disabled for debugging');
    /*
    const SecureConfigManager = require('./scripts/secure-config');
    const configManager = new SecureConfigManager();
    secureConfig = configManager.loadSecureConfig();
    console.log('✅ Secure configuration loaded successfully');
    */
} catch (error) {
    console.log('⚠️  Secure configuration not available, using environment variables');
    console.log('   Run: node scripts/secure-config.js setup');
}

// Merge secure config with environment variables
process.env = { ...process.env, ...secureConfig };

// Initialize error tracking
process.on('uncaughtException', (error) => {
  if (error.code === 'EPIPE') {
    // Silently ignore EPIPE errors from logging
    return;
  }
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.code === 'EPIPE') {
    // Silently ignore EPIPE errors from logging
    return;
  }
  console.error('Unhandled Rejection:', reason);
  console.error('Promise:', promise);
  console.error('Stack:', reason?.stack);
  process.exit(1);
});

// Enable request logging
const requestLogger = morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
});

// Override console methods in production to prevent EPIPE errors
if (process.env.NODE_ENV === 'production') {
  const noop = () => { };
  console.log = noop;
  console.error = noop;
  console.warn = noop;
  console.info = noop;
  console.debug = noop;
}
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');

// Import routes
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const deviceApiRoutes = require('./routes/deviceApi');
const esp32Routes = require('./routes/esp32');
const scheduleRoutes = require('./routes/schedules');
const userRoutes = require('./routes/users');  // Using the new users route
const activityRoutes = require('./routes/activities');
const activityLogRoutes = require('./routes/activityLogs');
const logsRoutes = require('./routes/logs');
const systemHealthRoutes = require('./routes/systemHealth');
const aimlRoutes = require('./routes/aiml');
const settingsRoutes = require('./routes/settings');
const ticketRoutes = require('./routes/tickets');
const devicePermissionRoutes = require('./routes/devicePermissions');
const deviceCategoryRoutes = require('./routes/deviceCategories');
const classExtensionRoutes = require('./routes/classExtensions');

// Voice Assistant Integration
const voiceAssistantRoutes = require('./routes/voiceAssistant');
console.log('[DEBUG] Voice assistant routes loaded:', typeof voiceAssistantRoutes);

// Import auth middleware
// Import auth middleware
const { auth, authorize } = require('./middleware/auth');

// Import services (only those actively used)
const scheduleService = require('./services/scheduleService');
// const contentSchedulerService = require('./services/contentScheduler'); // DISABLED - board functionality removed
const deviceMonitoringService = require('./services/deviceMonitoringService');
const EnhancedLoggingService = require('./services/enhancedLoggingService');
const ESP32CrashMonitor = require('./services/esp32CrashMonitor'); // Import ESP32 crash monitor service
// Removed offlineCleanupService - board functionality removed
// Import integration services (commented out - services not yet implemented)
// const rssService = require('./services/rssService');
// const socialMediaService = require('./services/socialMediaService');
// const weatherService = require('./services/weatherService');
// const webhookService = require('./services/webhookService');
// const databaseService = require('./services/databaseService');
// Removed legacy DeviceSocketService/TestSocketService/ESP32SocketService for cleanup

// Initialize ESP32 crash monitoring
const crashMonitor = new ESP32CrashMonitor();
crashMonitor.start();

// --- SOCKET.IO SERVER SETUP ---
// Remove duplicate setup. Use the main app/server/io instance below.
// ...existing code...

// --- MongoDB Connection with retry logic and fallback ---
let dbConnected = false;
const connectDB = async (retries = 5) => {
  const primaryUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt';
  console.log('Connecting to MongoDB:', primaryUri);
  const fallbackUri = process.env.MONGODB_URI_FALLBACK || process.env.MONGODB_URI_DIRECT; // optional
  const opts = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000, // Increased from 4000ms to 10 seconds
    socketTimeoutMS: 60000, // Increased from 45000ms to 60 seconds
    maxPoolSize: 10, // Reduced from 20 to prevent connection exhaustion
    minPoolSize: 2,  // Reduced from 5 to be more conservative
    maxIdleTimeMS: 60000, // Increased from 30000ms to 60 seconds
    bufferCommands: true, // Enable command buffering
    directConnection: primaryUri.startsWith('mongodb://') ? true : undefined,
    heartbeatFrequencyMS: 10000, // Check connection every 10 seconds
    maxConnecting: 2, // Limit concurrent connection attempts
  };
  try {
    await mongoose.connect(primaryUri, opts);
    dbConnected = true;
    logger.info('Connected to MongoDB');
    try {
      await createAdminUser();
    } catch (adminError) {
      logger.error('Admin user creation error:', adminError);
    }
    // Initialize schedule service after DB connection
    logger.info('[DEBUG] About to initialize schedule service...');
    try {
      await scheduleService.initialize();
      logger.info('[DEBUG] Schedule service initialization completed');
    } catch (scheduleError) {
      logger.error('Schedule service initialization error:', scheduleError);
    }
    
    // Initialize metrics service after DB connection
    logger.info('[DEBUG] About to initialize metrics service...');
    try {
      const metricsService = require('./metricsService');
      await metricsService.initializeMetricsAfterDB();
      logger.info('[DEBUG] Metrics service initialization completed');
    } catch (metricsError) {
      logger.error('Metrics service initialization error:', metricsError);
    }
    
    // Initialize power consumption tracker after DB connection (OLD SYSTEM - will be deprecated)
    logger.info('[DEBUG] About to initialize power tracker...');
    try {
      const powerTracker = require('./services/powerConsumptionTracker');
      await powerTracker.initialize();
      logger.info('[DEBUG] Power tracker initialization completed');
    } catch (powerTrackerError) {
      logger.error('Power tracker initialization error:', powerTrackerError);
    }

    // ========================================
    // NEW POWER SYSTEM INITIALIZATION
    // ========================================
    logger.info('[NEW_POWER] Initializing new immutable power consumption system...');
    
    // Initialize telemetry ingestion service
    try {
      const telemetryIngestionService = require('./services/telemetryIngestionService');
      await telemetryIngestionService.initialize();
      logger.info('[NEW_POWER] Telemetry ingestion service initialized');
    } catch (error) {
      logger.error('[NEW_POWER] Telemetry ingestion service initialization error:', error);
    }
    
    // Initialize ledger generation service
    try {
      const ledgerGenerationService = require('./services/ledgerGenerationService');
      await ledgerGenerationService.initialize();
      logger.info('[NEW_POWER] Ledger generation service initialized');
    } catch (error) {
      logger.error('[NEW_POWER] Ledger generation service initialization error:', error);
    }
    
    // Initialize aggregation service
    try {
      const aggregationService = require('./services/aggregationService');
      await aggregationService.initialize();
      logger.info('[NEW_POWER] Aggregation service initialized');
    } catch (error) {
      logger.error('[NEW_POWER] Aggregation service initialization error:', error);
    }
    
    // Schedule reconciliation job (runs nightly at 2 AM IST)
    try {
      const reconciliationJob = require('./jobs/reconciliationJob');
      const cron = require('node-cron');
      reconciliationJob.schedule(cron);
      logger.info('[NEW_POWER] Reconciliation job scheduled (2:00 AM IST daily)');
    } catch (error) {
      logger.error('[NEW_POWER] Reconciliation job scheduling error:', error);
    }
    
    logger.info('[NEW_POWER] New power system initialization complete');
    // ========================================

    // Initialize RSS service after DB connection
    logger.info('[DEBUG] About to initialize RSS service...');
    try {
      // await rssService.initializeFeeds();
      logger.info('[DEBUG] RSS service initialization skipped (service not available)');
    } catch (rssError) {
      logger.error('RSS service initialization error:', rssError);
    }

    // Initialize weather service after DB connection
    logger.info('[DEBUG] About to initialize weather service...');
    try {
      // await weatherService.initializeFeeds();
      logger.info('[DEBUG] Weather service initialization skipped (service not available)');
    } catch (weatherError) {
      logger.error('Weather service initialization error:', weatherError);
    }
  } catch (err) {
    const msg = err && (err.message || String(err));
    logger.error('MongoDB connection error (continuing in LIMITED MODE):', msg);
    // If SRV lookup fails or DNS issues occur and a fallback URI is provided, try it once per attempt
    const isSrvIssue = /querySrv|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/i.test(msg || '');
    if (fallbackUri && isSrvIssue) {
      try {
        logger.warn('Trying fallback MongoDB URI...');
        await mongoose.connect(fallbackUri, {
          ...opts,
          directConnection: true,
        });
        dbConnected = true;
        logger.info('Connected to MongoDB via fallback URI');
        try { await createAdminUser(); } catch (adminError) { logger.error('Admin user creation error:', adminError); }
        return;
      } catch (fallbackErr) {
        logger.error('Fallback MongoDB URI connection failed:', fallbackErr.message || fallbackErr);
      }
    }
    if (retries > 0) {
      logger.info(`Retrying connection... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectDB(retries - 1);
    } else {
      logger.warn('MongoDB not connected. API running in LIMITED MODE (DB-dependent routes may fail).');
      return; // Return undefined to indicate failure but don't throw
    }
  }
};

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB error:', err);
  dbConnected = false;
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
  dbConnected = false;
});

mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected');
  dbConnected = true;
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
  dbConnected = true;
});

const app = express();
const server = http.createServer(app);

console.log('[DEBUG] HTTP server created');
console.log('[DEBUG] Server object type:', typeof server);
console.log('[DEBUG] Server listening method exists:', typeof server.listen);

// Check if app is properly configured
console.log('[DEBUG] App object type:', typeof app);
console.log('[DEBUG] App has _router:', typeof app._router);
console.log('[DEBUG] App stack length:', app._router ? app._router.stack.length : 'no router');

// Make MQTT client available to routes
app.set('mqttClient', mqttClient);

// Add request logging to the HTTP server
server.on('request', (req, res) => {
  logger.info(`[HTTP Server] ${req.method} ${req.url}`);
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// TEST ROUTE - Add this at the very beginning
app.get('/test-connection', (req, res) => {
  console.log('[TEST] Test route hit!');
  console.log('[TEST] Request details:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    ip: req.ip
  });
  res.json({ message: 'Server is responding', timestamp: new Date().toISOString() });
});

// DEBUG ROUTE: Trigger an MQTT switch command from the server for quick testing
// Usage (development only): /debug/push-switch?mac=AA:BB:CC:DD:EE:FF&gpio=16&state=1
app.get('/debug/push-switch', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Disabled in production' });
  }
  try {
    const { mac, gpio, state } = req.query;
    if (!mac || typeof gpio === 'undefined') {
      return res.status(400).json({ error: 'mac and gpio query params required' });
    }
    const parsedGpio = parseInt(gpio, 10);
    const parsedState = (state === '1' || state === 'true' || state === 'on');
    console.log('[DEBUG] push-switch called', { mac, gpio: parsedGpio, state: parsedState });
    if (global.sendMqttSwitchCommand) {
      global.sendMqttSwitchCommand(mac, parsedGpio, parsedState);
      return res.json({ success: true, mac, gpio: parsedGpio, state: parsedState });
    } else {
      console.warn('[DEBUG] sendMqttSwitchCommand not available');
      return res.status(500).json({ error: 'sendMqttSwitchCommand not available on server' });
    }
  } catch (err) {
    console.error('[DEBUG] push-switch error', err && err.message ? err.message : err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// Catch-all middleware to debug requests
app.use((req, res, next) => {
  console.log('[DEBUG] Request received:', req.method, req.url, 'from', req.ip);
  next();
});

// Manual preflight handler (before cors) to guarantee PATCH visibility
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    // Allow all LAN origins for development
    const devOrigins = [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
      'http://172.16.3.171:5173', // Windows network IP
      'http://172.16.3.171:5174', // Windows network IP
      'http://172.16.3.171:5175', // Windows network IP
      `http://${require('os').networkInterfaces()['en0']?.find(i => i.family === 'IPv4')?.address}:5173`, // Mac WiFi
      `http://${require('os').networkInterfaces()['eth0']?.find(i => i.family === 'IPv4')?.address}:5173`, // Ethernet
      'http://192.168.1.100:5173', // Example extra network host
      '*'
    ];
    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? [process.env.FRONTEND_URL || 'https://your-frontend-domain.com']
      : devOrigins;
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Vary', 'Origin');
    } else {
      // Allow cross-origin requests from localhost and 127.0.0.1
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, User-Agent, DNT, Cache-Control, X-Mx-ReqToken, Keep-Alive, X-Requested-With, If-Modified-Since, X-CSRF-Token');
    // Silenced verbose preflight logging
    return res.status(204).end();
  }
  next();
});

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins for network access in development
    if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      // In production, restrict origins
      const allowedOrigins = [process.env.FRONTEND_URL || 'https://your-frontend-domain.com'];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'User-Agent', 'DNT', 'Cache-Control', 'X-Mx-ReqToken', 'Keep-Alive', 'X-Requested-With', 'If-Modified-Since', 'X-CSRF-Token', 'access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods']
}));

// Body parser (single instance)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Debug middleware to log all requests (moved after body parser)
app.use((req, res, next) => {
  logger.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  logger.debug('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    logger.debug('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Serve static files for uploads with CORS headers
app.use('/uploads', (req, res, next) => {
  // Set CORS headers for static files
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Initialize main Socket.IO instance
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      // Allow all origins for network access in development
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        const allowedOrigins = [process.env.FRONTEND_URL || 'https://your-frontend-domain.com'];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'User-Agent', 'DNT', 'Cache-Control', 'X-Mx-ReqToken', 'Keep-Alive', 'X-Requested-With', 'If-Modified-Since', 'X-CSRF-Token', 'access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods']
  },
  // More conservative WebSocket settings to prevent frame corruption
  perMessageDeflate: false, // Disable compression to avoid frame issues
  httpCompression: false, // Disable HTTP compression
  // Force polling initially, allow WebSocket upgrade
  transports: ['polling', 'websocket'],
  // More conservative timeouts and buffer sizes
  pingTimeout: 60000, // 60 seconds (increased)
  pingInterval: 25000, // 25 seconds (increased)
  upgradeTimeout: 30000, // 30 seconds (increased)
  maxHttpBufferSize: 1e6, // 1MB (reduced from 100MB)
  // Connection stability settings
  allowEIO3: true,
  forceNew: false, // Don't force new connections
  // Additional stability options
  connectTimeout: 45000, // 45 seconds (increased)
  timeout: 45000, // 45 seconds (increased)
  // Disable WebSocket upgrade initially to avoid frame issues
  allowUpgrades: true,
  cookie: false,
  // Add session handling
  allowRequest: (req, callback) => {
    // Allow all requests in development
    callback(null, true);
  }
});

io.engine.on('connection_error', (err) => {
  logger.error('[engine] connection_error', {
    code: err.code,
    message: err.message,
    context: err.context,
    type: err.type,
    description: err.description
  });
});

// Make MQTT client available globally for services
global.mqttClient = mqttClient;

// Log unexpected upgrade attempts that may corrupt websocket frames
server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (url.startsWith('/socket.io/')) {
    logger.info('[upgrade] Socket.IO upgrade request', {
      url,
      headers: req.headers,
      remoteAddress: req.socket.remoteAddress
    });
    return; // Let Socket.IO handle this
  }
  if (url.startsWith('/esp32-ws')) {
    logger.info('[upgrade] ESP32 WebSocket upgrade request', {
      url,
      headers: req.headers,
      remoteAddress: req.socket.remoteAddress
    });
    return; // Let WebSocketServer handle this
  }
  logger.warn('[upgrade] unexpected websocket upgrade path', { url });
  // Do not write to socket, just let it close if not handled
});

// Additional low-level Engine.IO diagnostics to help trace "Invalid frame header" issues
// These logs are lightweight and only emit on meta events (not every packet) unless NODE_ENV=development
if (process.env.NODE_ENV === 'development') {
  io.engine.on('initial_headers', (headers, req) => {
    logger.info('[engine] initial_headers', {
      ua: req.headers['user-agent'],
      url: req.url,
      transport: req._query && req._query.transport,
      sid: req._query && req._query.sid
    });
  });
  io.engine.on('headers', (headers, req) => {
    // This fires on each HTTP long-polling request; keep it quiet in production
    if (process.env.NODE_ENV === 'development') {
      logger.debug('[engine] headers', {
        transport: req._query && req._query.transport,
        sid: req._query && req._query.sid,
        upgrade: req._query && req._query.upgrade
      });
    }
  });
} else {
  // In production, only log connection events, not every polling request
  io.engine.on('initial_headers', () => {});
  io.engine.on('headers', () => {});
}
io.engine.on('connection', (rawSocket) => {
  logger.info('[engine] connection', {
    id: rawSocket.id,
    transport: rawSocket.transport ? rawSocket.transport.name : 'unknown',
    remoteAddress: rawSocket.request?.socket?.remoteAddress
  });
  rawSocket.on('upgrade', (newTransport) => {
    logger.info('[engine] transport upgrade', {
      id: rawSocket.id,
      from: rawSocket.transport ? rawSocket.transport.name : 'unknown',
      to: newTransport && newTransport.name
    });
  });
  rawSocket.on('transport', (t) => {
    logger.info('[engine] transport set', {
      id: rawSocket.id,
      transport: t && t.name
    });
  });
  rawSocket.on('close', (reason) => {
    logger.info('[engine] connection closed', {
      id: rawSocket.id,
      reason
    });
  });
  rawSocket.on('error', (error) => {
    logger.error('[engine] socket error', {
      id: rawSocket.id,
      error: error.message,
      transport: rawSocket.transport ? rawSocket.transport.name : 'unknown'
    });
  });
});

// (Removed old namespace socket services)

// Rate limiting - Very permissive for development
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production'
    ? (parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100)  // 100 requests per minute in production
    : 1000000,  // Essentially unlimited in development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting only in production
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
}

// (removed duplicate simple health route; see consolidated one below)

// Public stats endpoint for landing page (no auth required)
app.get('/api/public/stats', async (req, res) => {
  try {
    const Device = require('./models/Device');
    
    // Get all devices count
    const totalDevices = await Device.countDocuments();
    const onlineDevices = await Device.countDocuments({ status: 'online' });
    
    // Get all switches count from devices
    const devices = await Device.find().select('switches');
    let totalSwitches = 0;
    let switchesOn = 0;
    
    devices.forEach(device => {
      if (device.switches && Array.isArray(device.switches)) {
        totalSwitches += device.switches.length;
        switchesOn += device.switches.filter(sw => sw.state === true).length;
      }
    });
    
    // Calculate energy savings (example calculation)
    // Assuming average switch is 100W, and automation saves 40% of unnecessary usage
    const estimatedEnergySaved = Math.round((switchesOn * 0.1 * 24 * 365 * 0.4) / 1000); // kWh per year
    const energySavedPercentage = 40; // Fixed percentage as per AutoVolt value proposition
    
    // System uptime (example - can be calculated from server start time)
    const uptime = process.uptime();
    const uptimePercentage = 99.9; // Can be calculated from actual monitoring data
    
    res.json({
      success: true,
      data: {
        totalDevices,
        onlineDevices,
        totalSwitches,
        switchesOn,
        energySavedPercentage,
        estimatedEnergySaved,
        uptimePercentage,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching public stats:', error);
    // Return default values on error
    res.json({
      success: false,
      data: {
        totalDevices: 0,
        onlineDevices: 0,
        totalSwitches: 0,
        switchesOn: 0,
        energySavedPercentage: 40,
        estimatedEnergySaved: 0,
        uptimePercentage: 99.9,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Mount routes with rate limiting
const apiRouter = express.Router();

// Apply rate limiting only to sensitive auth mutation endpoints (not profile)
apiRouter.use('/auth/register', authLimiter);
apiRouter.use('/auth/login', authLimiter);
apiRouter.use('/auth/forgot-password', authLimiter);
apiRouter.use('/auth/reset-password', authLimiter);
apiRouter.use('/auth', authRoutes);

// Apply API rate limiting to other routes
apiRouter.use('/helper', apiLimiter, require('./routes/helper'));
apiRouter.use('/devices', apiLimiter, deviceRoutes);
apiRouter.use('/device-api', apiLimiter, deviceApiRoutes);
apiRouter.use('/esp32', apiLimiter, esp32Routes);
apiRouter.use('/schedules', apiLimiter, scheduleRoutes);
apiRouter.use('/users', apiLimiter, userRoutes);
apiRouter.use('/activities', apiLimiter, activityRoutes);
apiRouter.use('/activity-logs', apiLimiter, activityLogRoutes);
apiRouter.use('/logs', apiLimiter, logsRoutes);
apiRouter.use('/system-health', apiLimiter, auth, authorize('admin', 'super-admin'), systemHealthRoutes);
apiRouter.use('/analytics', apiLimiter, require('./routes/analytics'));
apiRouter.use('/aiml', apiLimiter, aimlRoutes);
apiRouter.use('/settings', apiLimiter, settingsRoutes);
apiRouter.use('/tickets', apiLimiter, ticketRoutes);
apiRouter.use('/device-permissions', apiLimiter, devicePermissionRoutes);
apiRouter.use('/telegram', require('./routes/telegram'));
apiRouter.use('/device-categories', apiLimiter, deviceCategoryRoutes);
apiRouter.use('/class-extensions', apiLimiter, classExtensionRoutes);
apiRouter.use('/voice-assistant', voiceAssistantRoutes);
apiRouter.use('/role-permissions', apiLimiter, require('./routes/rolePermissions'));
apiRouter.use('/power-analytics', apiLimiter, require('./routes/powerAnalytics'));
apiRouter.use('/power-settings', apiLimiter, require('./routes/powerSettings'));
apiRouter.use('/device-analytics', apiLimiter, require('./routes/deviceAnalytics'));
// apiRouter.use('/energy-consumption', apiLimiter, require('./routes/energyConsumption')); // DISABLED - Old power system, use /power-analytics instead
// apiRouter.use('/notices', apiLimiter, require('./routes/notices')); // DISABLED - notice board functionality removed
// apiRouter.use('/content', apiLimiter, require('./routes/contentScheduler')); // DISABLED - board functionality removed
// apiRouter.use('/integrations', apiLimiter, require('./routes/integrations')); // DISABLED - integrations route not yet implemented

// Catch-all route for debugging (must be last)
apiRouter.use('*', (req, res) => {
  console.log('[DEBUG] API catch-all reached:', req.method, req.url);
  res.status(404).json({ message: 'API Route not found', path: req.url, method: req.method });
});

// Mount all routes under /api
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbConnected ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV || 'development'
  });
});

console.log('[DEBUG] Routes mounted, app stack length:', app._router ? app._router.stack.length : 'no router');

// Debug middleware for API routes
app.use('/api', (req, res, next) => {
  console.log(`[DEBUG] API route hit: ${req.method} ${req.url}`);
  next();
});

app.use('/api', apiRouter);

// Public webhook routes (no authentication required) - DISABLED until webhookService is implemented
// app.use('/webhooks', require('./routes/publicWebhooks'));

// Optional same-origin static serving (set SERVE_FRONTEND=1 after building frontend into ../dist)
try {
  if (process.env.SERVE_FRONTEND === '1') {
    const distPath = path.join(__dirname, '..', 'dist');
    const fs = require('fs');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('/', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
      logger.info('[static] Serving frontend dist/ assets same-origin');
    } else {
      logger.warn('[static] SERVE_FRONTEND=1 but dist folder not found at', distPath);
    }
  }
} catch (e) {
  logger.error('[static] error enabling same-origin serving', e.message);
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}


// Create default admin user
const createAdminUser = async () => {
  try {
    const User = require('./models/User');
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (!existingAdmin) {
      // IMPORTANT: Provide the plain password here so the pre-save hook hashes it ONCE.
      // Previously this code hashed manually AND the pre-save hook re-hashed, breaking login.
      await User.create({
        name: process.env.ADMIN_NAME || 'System Administrator',
        email: process.env.ADMIN_EMAIL || 'admin@company.com',
        password: process.env.ADMIN_PASSWORD || 'admin123456',
        role: 'admin',
        department: 'IT Department',
        accessLevel: 'full'
      });
      logger.info('Default admin user created (single-hash)');
    }
  } catch (error) {
    logger.error('Error creating admin user:', error);
  }
};

// Socket.IO for real-time updates with additional diagnostics
io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id);
  // Emit a hello for quick handshake debug
  socket.emit('server_hello', { ts: Date.now() });

  // Join user-specific room if authenticated
  if (socket.handshake.auth && socket.handshake.auth.token) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET);
      if (decoded && decoded.id) {
        socket.join(`user_${decoded.id}`);
        logger.info(`Socket ${socket.id} joined user room: user_${decoded.id}`);
      }
    } catch (error) {
      logger.warn(`Failed to join user room for socket ${socket.id}:`, error.message);
    }
  }

  socket.on('join-room', (room) => {
    try {
      socket.join(room);
      logger.info(`Socket ${socket.id} joined room ${room}`);
    } catch (e) {
      logger.error('[join-room error]', e.message);
    }
  });

  socket.on('ping_test', (cb) => {
    if (typeof cb === 'function') cb({ pong: Date.now() });
  });

  // Handle individual switch commands from frontend
  socket.on('switch_intent', async (data) => {
    console.log('[DEBUG] switch_intent handler called with:', data);
    try {
      console.log('[SOCKET] Received switch_intent:', data);
      const { deviceId, switchId, gpio, desiredState, ts } = data;

      if (!deviceId || gpio === undefined || desiredState === undefined) {
        console.warn('[SOCKET] Invalid switch_intent data:', data);
        return;
      }

      // Get device from database to find MAC address
      const Device = require('./models/Device');
      const device = await Device.findById(deviceId).select('+deviceSecret');

      if (!device || !device.macAddress) {
        console.warn('[SOCKET] Device not found or no MAC address:', deviceId);
        return;
      }

      // Use centralized helper so the published payload includes required fields
      // (mac, secret, userId) and consistent logging.
      try {
        sendMqttSwitchCommand(device.macAddress, gpio, desiredState);
        console.log('[MQTT] Sent switch command (via helper) to ESP32:', device.macAddress, { gpio, state: desiredState });
      } catch (err) {
        console.error('[MQTT] Error sending switch command via helper:', err && err.message ? err.message : err);
      }

    } catch (error) {
      console.error('[SOCKET] Error processing switch_intent:', error.message);
    }
  });

  // Handle bulk switch commands from frontend
  socket.on('bulk_switch_intent', async (data) => {
    try {
      console.log('[SOCKET] Received bulk_switch_intent:', data);
      const { desiredState, deviceIds, filter, ts } = data;

      if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
        console.warn('[SOCKET] Invalid bulk_switch_intent data:', data);
        return;
      }

      // Get devices from database
      const Device = require('./models/Device');
      const devices = await Device.find({ _id: { $in: deviceIds } }).select('+deviceSecret');

      if (!devices || devices.length === 0) {
        console.warn('[SOCKET] No devices found for bulk operation:', deviceIds);
        return;
      }

      // Send MQTT commands to each device
      let commandCount = 0;
      for (const device of devices) {
        if (!device.macAddress) continue;

        // For bulk operations, we need to determine which switches to toggle
        // This depends on the filter (type, location, etc.)
        let switchesToToggle = [];

        if (filter && filter.type) {
          // Toggle all switches of a specific type
          switchesToToggle = device.switches.filter(s => s.type === filter.type);
        } else if (filter && filter.location) {
          // Toggle all switches in a specific location
          switchesToToggle = device.switches.filter(s => s.location === filter.location);
        } else {
          // Toggle all switches on the device
          switchesToToggle = device.switches;
        }

        // Send MQTT command for each switch, using helper so required fields are included
        for (const switchInfo of switchesToToggle) {
          try {
            const gpio = switchInfo.gpio;
            // Use centralized helper that will attach secret and userId
            sendMqttSwitchCommand(device.macAddress, gpio, desiredState);
            commandCount++;
            console.log('[MQTT] Sent bulk switch command (via helper) to ESP32:', device.macAddress, { gpio, state: desiredState });
          } catch (err) {
            console.error('[MQTT] Error sending bulk switch command via helper:', err && err.message ? err.message : err);
          }
        }
      }

      console.log(`[MQTT] Sent ${commandCount} bulk switch commands to ${devices.length} devices`);

    } catch (error) {
      console.error('[SOCKET] Error processing bulk_switch_intent:', error.message);
    }
  });

  socket.on('disconnect', (reason) => {
    logger.info('Client disconnected:', socket.id, 'reason:', reason);
  });
});

// Make io accessible to routes and globally (for services without req)
app.set('io', io);
global.io = io;

// Initialize Socket Service for user tracking
const SocketService = require('./services/socketService');
const socketService = new SocketService(io);
io.socketService = socketService;

// Expose sequence-aware emitter to controllers
app.set('emitDeviceStateChanged', emitDeviceStateChanged);



// Offline detection every 60s (mark devices offline if stale)
setInterval(async () => {
  try {
    const Device = require('./models/Device');

    // Use consistent 2-minute threshold to match monitoring service
    const thresholdSeconds = 120; // 2 minutes (consistent with monitoring service)
    const cutoff = Date.now() - (thresholdSeconds * 1000);

    const stale = await Device.find({ lastSeen: { $lt: new Date(cutoff) }, status: { $ne: 'offline' } });
    for (const d of stale) {
      d.status = 'offline';
      await d.save();
      emitDeviceStateChanged(d, { source: 'offline-scan' });
      logger.info(`[offline-scan] marked device offline: ${d.macAddress} (lastSeen: ${d.lastSeen})`);
    }

    if (stale.length > 0) {
      logger.info(`[offline-scan] marked ${stale.length} devices as offline`);
    }
  } catch (e) {
    logger.error('[offline-scan] error', e.message);
  }
}, 60000);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const metricsService = require('./metricsService');
    res.set('Content-Type', metricsService.getContentType());
    const metrics = await metricsService.getMetrics();
    res.end(metrics);
  } catch (error) {
    logger.error('Error fetching metrics:', error);
    res.status(500).send('Error fetching metrics');
  }
});

// Simple test endpoint
app.get('/test', (req, res) => {
  res.send('Server is running!');
});

// Global error handling middleware
app.use((error, req, res, next) => {
  // Log the error
  logger.error('Global error handler:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    user: req.user ? req.user.id : 'unauthenticated'
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // Handle different types of errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: isDevelopment ? error.message : 'Invalid input data',
      details: isDevelopment ? error.errors : undefined
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID',
      message: isDevelopment ? error.message : 'Invalid resource ID'
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      error: 'Duplicate Entry',
      message: 'Resource already exists'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? error.message : 'Something went wrong',
    ...(isDevelopment && { stack: error.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.info('404 handler reached for:', req.method, req.url);
  res.status(404).json({ message: 'Route not found' });
});

// Start the server (single attempt)
const PORT = process.env.PORT || 3001; // Changed back to 3001 after debugging
const HOST = process.env.HOST || '172.16.3.171'; // Bind to specific IP for multi-user access

console.log('[DEBUG] About to call server.listen...');
console.log(`[DEBUG] PORT: ${PORT}, HOST: ${HOST}`);
console.log(`[DEBUG] Server object:`, typeof server);
console.log(`[DEBUG] App object:`, typeof app);

// Connect to database BEFORE starting the server
logger.info('[DEBUG] Connecting to database before starting server...');
(async () => {
  try {
    await connectDB();
    console.log('[DEBUG] Database connected, now starting server...');

    // Initialize Telegram service AFTER database connection
    const telegramService = require('./services/telegramService');
    telegramService.initialize().catch(error => {
      console.error('Failed to initialize Telegram service:', error);
    });

    // Initialize Smart Notification service
    const smartNotificationService = require('./services/smartNotificationService');
    smartNotificationService.setTelegramService(telegramService);
    smartNotificationService.start();

    // Initialize Evening Lights Monitor service (checks at 10 AM daily)
    const eveningLightsMonitor = require('./services/eveningLightsMonitor');
    eveningLightsMonitor.start();

    // Initialize After-Hours Lights Monitor service (real-time monitoring)
    const afterHoursLightsMonitor = require('./services/afterHoursLightsMonitor');
    afterHoursLightsMonitor.start();

    // Load blocked devices into security service
    const securityService = require('./services/securityService');
    await securityService.loadBlockedDevices();

    try {
      server.listen(PORT, HOST, () => {
        console.log(`[SERVER] Listen callback STARTED - PID: ${process.pid}`);
        console.log(`[SERVER] Listen callback executed`);
        console.log(`[DEBUG] Server listening on ${HOST}:${PORT}`);
        console.log(`Server running on ${HOST}:${PORT}`);
        console.log(`Server accessible on localhost:${PORT} and all network interfaces`);
        console.log(`Environment: ${process.env.NODE_ENV}`);

        // Debug: Check if server is actually listening
        console.log(`[DEBUG] Server address:`, server.address());
      });
    } catch (listenError) {
      console.error('[DEBUG] Error in server.listen():', listenError);
      console.error('[DEBUG] Listen error stack:', listenError.stack);
      process.exit(1);
    }
  } catch (dbError) {
    console.error('[DEBUG] Database connection failed, exiting:', dbError);
    process.exit(1);
  }
})();

server.on('listening', () => {
  console.log('[SERVER] Server is now listening event fired');
  console.log('[SERVER] Listening address:', server.address());
});

server.on('error', (error) => {
  console.error('Server error event:', error);
});

process.on('uncaughtException', (error) => {
  console.error('=== UNCAUGHT EXCEPTION ===');
  console.error('Error:', error);
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  console.error('Name:', error.name);
  console.error('Code:', error.code);
  console.error('===========================');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('=== UNHANDLED REJECTION ===');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('Reason Message:', reason?.message);
  console.error('Reason Stack:', reason?.stack);
  console.error('Reason Name:', reason?.name);
  console.error('Reason Code:', reason?.code);
  console.error('===========================');
  process.exit(1);
});


module.exports = { app, io, server };
