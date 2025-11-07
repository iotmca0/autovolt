const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const PowerReading = require('../models/PowerReading');
const EnhancedLoggingService = require('../services/enhancedLoggingService');
const { logger } = require('../middleware/logger');
const securityService = require('../services/securityService');

const DEVICE_TIMEOUT = 60000; // 1 minute timeout
const MAX_RETRIES = 3;
const RECONNECT_INTERVAL = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 5;

class SecurityError extends Error {
    constructor(message = 'Security check failed') {
        super(message);
        this.name = 'SecurityError';
    }
}

class WebSocketHandler {
    constructor(io) {
        this.io = io;
        this.connectedDevices = new Map();
        this.reconnectAttempts = new Map();
        
        // Start security service cleanup
        setInterval(() => securityService.cleanup(), 3600000); // Clean every hour
    }

    async handleConnection(socket) {
        logger.info(`New WebSocket connection attempt`);
        const clientIp = socket.handshake.address;
        
        // Check rate limiting for IP
        if (!await securityService.checkRateLimit(clientIp, 100, 60000)) {
            logger.warn(`Rate limit exceeded for IP ${clientIp}`);
            socket.disconnect(true);
            return;
        }
        
        socket.on('identify', async (data) => {
            try {
                // Validate device token
                const deviceId = data.deviceId;
                if (!deviceId || !data.token || securityService.isBlacklisted(deviceId)) {
                    throw new SecurityError('Invalid device identification');
                }

                const verified = securityService.verifyDeviceToken(data.token, process.env.DEVICE_SECRET);
                if (!verified) {
                    await securityService.trackActivity(deviceId, { type: 'auth_failure' });
                    
                    // Log authentication failure
                    await EnhancedLoggingService.logError({
                        errorType: 'authentication_failed',
                        severity: 'high',
                        message: 'ESP32 device authentication failed',
                        details: { deviceId, ip: socket.handshake.address },
                        deviceMac: data.mac,
                        ip: socket.handshake.address,
                        context: {
                            userAgent: socket.handshake.headers['user-agent'],
                            timestamp: new Date().toISOString()
                        }
                    });
                    
                    throw new SecurityError('Invalid device token');
                }
                await this.handleIdentify(socket, data);
            } catch (err) {
                logger.error('Identification error:', err);
                socket.emit('error', { code: 'identify_failed', message: err.message });
            }
        });

        socket.on('disconnect', () => this.handleDisconnect(socket));
        socket.on('heartbeat', (data) => this.handleHeartbeat(socket, data));
        socket.on('state_update', (data) => this.handleStateUpdate(socket, data));
        socket.on('manual_switch', (data) => this.handleManualSwitch(socket, data));
    }

    async handleIdentify(socket, data) {
        const { mac, secret } = data;
        if (!mac || !secret) {
            throw new Error('Missing mac or secret');
        }

        const device = await Device.findOne({ macAddress: mac });
        if (!device || device.secret !== secret) {
            // Log device credential error
            await EnhancedLoggingService.logError({
                errorType: 'authentication_failed',
                severity: 'high',
                message: 'Invalid ESP32 device credentials',
                details: { mac, hasDevice: !!device, secretMatch: device?.secret === secret },
                deviceMac: mac,
                ip: socket.handshake.address
            });
            throw new Error('Invalid device credentials');
        }

        // Reset reconnection attempts on successful identification
        this.reconnectAttempts.delete(mac);
        this.connectedDevices.set(mac, { socket, device });

        device.isIdentified = true;
        device.lastSeen = new Date();
        device.connectionStatus = 'online';
        await device.save();

        logger.info(`Device identified: ${mac}`);
        
        socket.deviceMac = mac;
        socket.emit('identified', {
            success: true,
            config: await this.generateDeviceConfig(device)
        });

        // Notify frontend about device connection
        this.io.emit('device_status', {
            mac,
            status: 'online',
            timestamp: new Date()
        });
    }

    async handleDisconnect(socket) {
        if (!socket.deviceMac) return;

        const device = await Device.findOne({ macAddress: socket.deviceMac });
        if (device) {
            device.connectionStatus = 'disconnected';
            device.isIdentified = false;
            await device.save();

            // Start reconnection process
            this.attemptReconnect(socket.deviceMac);
        }

        this.connectedDevices.delete(socket.deviceMac);
        logger.info(`Device disconnected: ${socket.deviceMac}`);
    }

    async attemptReconnect(mac) {
        const attempts = this.reconnectAttempts.get(mac) || 0;
        if (attempts >= MAX_RECONNECT_ATTEMPTS) {
            logger.error(`Max reconnection attempts reached for device: ${mac}`);
            return;
        }

        this.reconnectAttempts.set(mac, attempts + 1);
        setTimeout(async () => {
            const device = await Device.findOne({ macAddress: mac });
            if (device && !this.connectedDevices.has(mac)) {
                // Device still not reconnected, try again
                this.attemptReconnect(mac);
            }
        }, RECONNECT_INTERVAL);
    }

    async handleHeartbeat(socket, data) {
        if (!socket.deviceMac) return;

        const device = await Device.findOne({ macAddress: socket.deviceMac });
        if (device) {
            device.lastSeen = new Date();
            device.connectionStatus = 'online';
            await device.save();
        }
    }

    async handleManualSwitch(socket, data) {
        if (!socket.deviceMac) return;

        try {
            const { switchId, action, previousState, newState, detectedBy, responseTime, physicalPin } = data;
            
            const device = await Device.findOne({ macAddress: socket.deviceMac });
            if (!device) {
                await EnhancedLoggingService.logError({
                    errorType: 'device_connection_failed',
                    severity: 'medium',
                    message: 'Manual switch event from unknown device',
                    details: { mac: socket.deviceMac, switchId, action },
                    deviceMac: socket.deviceMac
                });
                return;
            }

            // Check for conflicts
            const conflictWith = {
                webCommand: false,
                scheduleCommand: false,
                pirCommand: false
            };

            // Check if there was a recent web command for this switch
            const recentWebCommand = device.pendingCommands.find(cmd => 
                cmd.payload?.switchId === switchId && 
                cmd.timestamp > new Date(Date.now() - 30000) // 30 seconds
            );
            
            if (recentWebCommand) {
                conflictWith.webCommand = true;
                // Remove the conflicting web command
                device.pendingCommands = device.pendingCommands.filter(cmd => cmd.id !== recentWebCommand.id);
            }

            // Update device switch state
            const switchToUpdate = device.switches.find(s => s.gpio === parseInt(switchId) || s.relayGpio === parseInt(switchId) || s.id === switchId);
            if (switchToUpdate) {
                switchToUpdate.state = newState;
                switchToUpdate.lastChanged = new Date();
                switchToUpdate.lastChangedBy = 'manual';
            }

            device.lastSeen = new Date();
            await device.save();

            // Log manual switch operation
            await EnhancedLoggingService.logManualSwitch({
                deviceId: device._id,
                deviceName: device.name,
                deviceMac: device.macAddress,
                switchId: switchId,
                switchName: switchToUpdate?.name || `Switch ${switchId}`,
                physicalPin: physicalPin,
                action: action,
                previousState: previousState,
                newState: newState,
                conflictWith: conflictWith,
                detectedBy: detectedBy || 'gpio_interrupt',
                responseTime: responseTime || 0,
                classroom: device.classroom,
                location: device.location,
                context: {
                    activeWebUsers: this.getActiveWebUsers(),
                    socketId: socket.id,
                    ipAddress: socket.handshake.address,
                    timestamp: new Date().toISOString()
                }
            });

            // Emit state change to frontend
            this.io.emit('switchStateChanged', {
                deviceId: device._id,
                deviceName: device.name,
                switchId: switchId,
                state: newState,
                triggeredBy: 'manual_switch',
                hasConflict: conflictWith.webCommand || conflictWith.scheduleCommand || conflictWith.pirCommand,
                timestamp: new Date()
            });

            // Send acknowledgment to ESP32
            socket.emit('manual_switch_ack', {
                switchId: switchId,
                acknowledged: true,
                newState: newState,
                timestamp: new Date()
            });

            logger.info(`Manual switch: ${device.name} - ${switchId} - ${action}`);

        } catch (error) {
            console.error('[MANUAL-SWITCH-ERROR]', error);
            await EnhancedLoggingService.logError({
                errorType: 'system_error',
                severity: 'medium',
                message: 'Failed to process manual switch event',
                details: { error: error.message, data },
                deviceMac: socket.deviceMac
            });
            
            socket.emit('error', { 
                code: 'manual_switch_failed', 
                message: 'Failed to process manual switch event' 
            });
        }
    }

    getActiveWebUsers() {
        // Count active socket.io connections (rough estimate)
        return this.io.engine.clientsCount || 0;
    }

    async handleStateUpdate(socket, data) {
        if (!socket.deviceMac) return;

        try {
            const device = await Device.findOne({ macAddress: socket.deviceMac });
            if (!device) return;

            // Update switch states
            if (data.switches) {
                for (const sw of data.switches) {
                    const deviceSwitch = device.switches.find(s => s.gpio === parseInt(sw.gpio) || s.relayGpio === parseInt(sw.gpio));
                    if (deviceSwitch) {
                        deviceSwitch.state = sw.state;
                        if (sw.manual_override !== undefined) {
                            deviceSwitch.manualOverride = sw.manual_override;
                        }
                    }
                }
                await device.save();
            }

            // Broadcast state update to connected clients
            this.io.emit('device_state_update', {
                mac: socket.deviceMac,
                states: data.switches,
                timestamp: new Date()
            });
        } catch (err) {
            logger.error('State update error:', err);
        }
    }

    async generateDeviceConfig(device) {
        return {
            deviceId: device._id,
            name: device.name,
            switches: device.switches.map(sw => ({
                id: sw._id,
                name: sw.name,
                relayGpio: sw.relayGpio,
                manualSwitchEnabled: sw.manualSwitchEnabled,
                manualSwitchGpio: sw.manualSwitchGpio,
                state: sw.state,
                manualOverride: sw.manualOverride
            }))
        };
    }
}

/**
 * Get device configuration for ESP32
 * GET /api/esp32/config/:macAddress
 */
exports.getDeviceConfig = async (req, res) => {
  try {
    const { macAddress } = req.params;
    
    const device = await Device.findOne({ macAddress });
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Format configuration for ESP32
    const config = {
      deviceId: device._id,
      name: device.name,
      pirEnabled: device.pirEnabled,
      pirGpio: device.pirGpio,
      pirAutoOffDelay: device.pirAutoOffDelay,
      // PIR Detection Schedule
      pirDetectionSchedule: device.pirDetectionSchedule || {
        enabled: false,
        activeStartTime: '18:00',
        activeEndTime: '22:00',
        daysOfWeek: []
      },
      switches: device.switches.map(sw => ({
        id: sw._id,
        name: sw.name,
        relayGpio: sw.relayGpio,
        usePir: sw.usePir,
        dontAutoOff: sw.dontAutoOff,
        manualSwitchEnabled: sw.manualSwitchEnabled,
        manualSwitchGpio: sw.manualSwitchGpio,
        manualMode: sw.manualMode || 'maintained'
      }))
    };

    res.json(config);
  } catch (error) {
    console.error('Error getting device config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Update device state from ESP32
 * POST /api/esp32/state/:macAddress
 */
exports.updateDeviceStatus = async (req, res) => {
  try {
    const { macAddress } = req.params;
    const { switchId, state } = req.body;

    const device = await Device.findOne({ macAddress });
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Update switch state
    const switchToUpdate = device.switches.id(switchId);
    if (!switchToUpdate) {
      return res.status(404).json({ error: 'Switch not found' });
    }

    switchToUpdate.state = state;
    device.lastSeen = new Date();
    await device.save();

    // Get power consumption at event time
    const { getBasePowerConsumption } = require('../metricsService');
    const switchPowerConsumption = getBasePowerConsumption(
      switchToUpdate.name || 'unknown',
      switchToUpdate.type || 'relay'
    );
    
    // Log activity with power consumption
    await ActivityLog.create({
      deviceId: device._id,
      deviceName: device.name,
      switchId,
      switchName: switchToUpdate.name,
      action: state ? 'on' : 'off',
      triggeredBy: 'system',
      classroom: device.classroom,
      location: device.location,
      powerConsumption: switchPowerConsumption,
      context: { source: 'esp32' }
    });

    // Emit state change via WebSocket
    req.app.get('io').emit('switchStateChanged', {
      deviceId: device._id,
      switchId,
      state
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating device state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Send command to ESP32
 * POST /api/esp32/command/:macAddress
 */
exports.sendCommand = async (req, res) => {
  try {
    const { macAddress } = req.params;
    const { switchId, state } = req.body;

    const device = await Device.findOne({ macAddress });
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const switchToUpdate = device.switches.id(switchId);
    if (!switchToUpdate) {
      return res.status(404).json({ error: 'Switch not found' });
    }

    // Add command to pending queue
    device.pendingCommands.push({
      type: 'setState',
      payload: {
        switchId,
        state
      }
    });

    await device.save();

    // Get power consumption at event time
    const { getBasePowerConsumption } = require('../metricsService');
    const switchPowerConsumption = getBasePowerConsumption(
      switchToUpdate.name || 'unknown',
      switchToUpdate.type || 'relay'
    );
    
    // Log activity with power consumption
    await ActivityLog.create({
      deviceId: device._id,
      deviceName: device.name,
      switchId,
      switchName: switchToUpdate.name,
      action: 'command_sent',
      triggeredBy: 'user',
      classroom: device.classroom,
      location: device.location,
      powerConsumption: switchPowerConsumption,
      context: { state, source: 'web' }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error sending command:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Submit power reading from ESP32 (live data)
 * POST /api/esp32/power-reading/:macAddress
 */
exports.submitPowerReading = async (req, res) => {
  try {
    const { macAddress } = req.params;
    const { voltage, current, power, activeSwitches, totalSwitches, metadata } = req.body;

    // Find device
    const device = await Device.findOne({ macAddress });
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Update device last seen
    device.lastSeen = new Date();
    device.connectionStatus = 'online';
    await device.save();

    // Get device settings for price and calibration
    const pricePerUnit = device.powerSettings?.pricePerUnit || 7.5;
    const consumptionFactor = device.powerSettings?.consumptionFactor || 1.0;

    // Get last reading to calculate incremental energy
    const lastReading = await PowerReading.findOne({ deviceId: device._id })
      .sort({ timestamp: -1 })
      .limit(1);

    // Calculate actual interval between readings (dynamic calculation)
    const now = new Date();
    let intervalHours = 1/60; // Default 1 minute
    
    if (lastReading) {
      // Calculate actual interval
      const intervalMs = now - lastReading.timestamp;
      intervalHours = intervalMs / (1000 * 60 * 60);
      
      // Sanity checks
      if (intervalHours > 1) {
        logger.warn(`Large interval detected for device ${device.name}: ${intervalHours.toFixed(2)} hours`);
      }
      
      // Cap at 24 hours to prevent huge energy values from long disconnections
      if (intervalHours > 24) {
        logger.warn(`Interval capped at 24 hours for device ${device.name}. Actual: ${intervalHours.toFixed(2)} hours`);
        intervalHours = 24;
      }
      
      // Minimum interval of 10 seconds to prevent calculation errors
      if (intervalHours < (10/3600)) {
        intervalHours = 10/3600; // 10 seconds
      }
    }
    
    const actualPower = power || (voltage * current);
    const energy = actualPower * intervalHours; // Wh
    
    logger.info(`Energy calculation for ${device.name}: Power=${actualPower.toFixed(2)}W, Interval=${(intervalHours*60).toFixed(2)}min, Energy=${energy.toFixed(4)}Wh`);

    // Get cumulative energy
    const totalEnergy = lastReading ? lastReading.totalEnergy + (energy / 1000) : (energy / 1000);

    // Create power reading
    const reading = new PowerReading({
      deviceId: device._id,
      deviceName: device.name,
      classroom: device.classroom || 'unassigned',
      timestamp: new Date(),
      voltage: voltage || 0,
      current: current || 0,
      power: power || voltage * current,
      energy,
      totalEnergy,
      status: 'online',
      activeSwitches: activeSwitches || 0,
      totalSwitches: totalSwitches || 0,
      pricePerUnit,
      cost: 0, // Will be calculated in pre-save hook
      consumptionFactor,
      metadata
    });

    await reading.save();

    logger.info(`Power reading saved for device ${device.name}: ${power}W, ${energy}Wh`);

    // Emit to dashboard
    req.app.get('io').emit('powerReading', {
      deviceId: device._id,
      deviceName: device.name,
      power: reading.power,
      energy: reading.energy,
      cost: reading.cost,
      timestamp: reading.timestamp
    });

    res.json({ 
      success: true, 
      readingId: reading.readingId,
      totalEnergy: reading.totalEnergy 
    });

  } catch (error) {
    console.error('Error submitting power reading:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};

/**
 * Sync offline power readings from ESP32
 * POST /api/esp32/sync-readings/:macAddress
 * 
 * Body: {
 *   readings: [
 *     { timestamp, voltage, current, power, activeSwitches, totalSwitches },
 *     ...
 *   ]
 * }
 */
exports.syncOfflineReadings = async (req, res) => {
  try {
    const { macAddress } = req.params;
    const { readings } = req.body;

    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: 'Invalid readings array' });
    }

    // Find device
    const device = await Device.findOne({ macAddress });
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Update device status
    device.lastSeen = new Date();
    device.connectionStatus = 'online';
    await device.save();

    // Get device settings
    const pricePerUnit = device.powerSettings?.pricePerUnit || 7.5;
    const consumptionFactor = device.powerSettings?.consumptionFactor || 1.0;

    // Get last known cumulative energy before offline period
    const lastReading = await PowerReading.findOne({ deviceId: device._id })
      .sort({ timestamp: -1 })
      .limit(1);

    let cumulativeEnergy = lastReading ? lastReading.totalEnergy : 0;

    // Process readings in chronological order
    const sortedReadings = readings.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Prepare bulk insert data
    const powerReadings = [];
    let previousTimestamp = lastReading ? lastReading.timestamp : new Date(sortedReadings[0].timestamp);

    for (const reading of sortedReadings) {
      const timestamp = new Date(reading.timestamp);
      
      // Calculate time interval
      const intervalMs = timestamp - previousTimestamp;
      let intervalHours = intervalMs / (1000 * 60 * 60);
      
      // Apply same sanity checks as live readings
      if (intervalHours > 24) {
        logger.warn(`Offline reading interval capped at 24 hours. Actual: ${intervalHours.toFixed(2)} hours`);
        intervalHours = 24;
      }
      
      if (intervalHours < (10/3600)) {
        intervalHours = 10/3600; // Minimum 10 seconds
      }

      // Calculate energy for this interval
      const power = reading.power || (reading.voltage * reading.current);
      const energy = power * intervalHours; // Wh
      cumulativeEnergy += energy / 1000; // Add to cumulative in kWh

      powerReadings.push({
        deviceId: device._id,
        deviceName: device.name,
        classroom: device.classroom || 'unassigned',
        timestamp,
        voltage: reading.voltage || 0,
        current: reading.current || 0,
        power,
        energy,
        totalEnergy: cumulativeEnergy,
        status: 'offline',
        activeSwitches: reading.activeSwitches || 0,
        totalSwitches: reading.totalSwitches || 0,
        pricePerUnit,
        cost: (energy / 1000) * pricePerUnit,
        consumptionFactor,
        readingId: `${device._id}_${timestamp.getTime()}`,
        syncedAt: new Date(),
        metadata: reading.metadata || { synced: true }
      });

      previousTimestamp = timestamp;
    }

    // Bulk insert with duplicate handling
    const result = await PowerReading.bulkInsertReadings(powerReadings);

    logger.info(`Synced ${result.inserted} readings for device ${device.name} (${result.duplicates} duplicates skipped)`);

    // Emit sync complete to dashboard
    req.app.get('io').emit('readingsSynced', {
      deviceId: device._id,
      deviceName: device.name,
      count: result.inserted,
      duplicates: result.duplicates
    });

    res.json({ 
      success: true, 
      inserted: result.inserted,
      duplicates: result.duplicates,
      totalEnergy: cumulativeEnergy
    });

  } catch (error) {
    console.error('Error syncing offline readings:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
};
