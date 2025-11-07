const mqtt = require('mqtt');
const { logger } = require('../middleware/logger');
const { MQTTError } = require('../middleware/errorHandler');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const DeviceStatusLog = require('../models/DeviceStatusLog');
const ManualSwitchLog = require('../models/ManualSwitchLog');

class MQTTService {
  constructor() {
    this.client = null;
    this.messageQueue = new Map(); // Queue for offline devices
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.isConnected = false;
    this.messageHandlers = new Map();
  }

  /**
   * Initialize MQTT connection
   */
  connect(config = {}) {
    const {
      host = process.env.MQTT_BROKER || 'localhost',
      port = process.env.MQTT_PORT || 1883,
      clientId = 'backend_server',
      username = process.env.MQTT_USER,
      password = process.env.MQTT_PASSWORD
    } = config;

    const options = {
      clientId,
      clean: true,
      connectTimeout: 10000,
      reconnectPeriod: 5000,
      keepalive: 60,
      protocolVersion: 4,
      resubscribe: true,
      queueQoSZero: false,
      will: {
        topic: 'backend/status',
        payload: 'offline',
        qos: 1,
        retain: true
      }
    };

    if (username) options.username = username;
    if (password) options.password = password;

    try {
      this.client = mqtt.connect(`mqtt://${host}:${port}`, options);
      this.setupEventHandlers();
      logger.info(`[MQTT] Connecting to broker at ${host}:${port}`);
    } catch (error) {
      logger.error('[MQTT] Connection failed', { error: error.message });
      throw new MQTTError('Failed to connect to MQTT broker', error);
    }

    return this;
  }

  /**
   * Setup MQTT event handlers
   */
  setupEventHandlers() {
    this.client.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('[MQTT] Connected to broker successfully');
      
      // Subscribe to all topics
      this.client.subscribe('#', (err) => {
        if (!err) {
          logger.info('[MQTT] Subscribed to all topics (#)');
          // Publish online status
          this.client.publish('backend/status', 'online', { qos: 1, retain: true });
          // Process queued messages
          this.processMessageQueue();
        } else {
          logger.error('[MQTT] Subscription failed', { error: err.message });
        }
      });
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      logger.error('[MQTT] Connection error', { error: error.message });
    });

    this.client.on('offline', () => {
      this.isConnected = false;
      logger.warn('[MQTT] Client offline - will attempt reconnection');
    });

    this.client.on('reconnect', () => {
      this.reconnectAttempts++;
      logger.info(`[MQTT] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        logger.error('[MQTT] Max reconnection attempts reached');
        this.client.end(true);
      }
    });

    this.client.on('close', () => {
      this.isConnected = false;
      logger.warn('[MQTT] Connection closed');
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });
  }

  /**
   * Handle incoming MQTT messages
   */
  async handleMessage(topic, message) {
    try {
      logger.debug(`[MQTT] Message received on ${topic}`);
      
      // Route to appropriate handler
      if (topic === 'esp32/state') {
        await this.handleDeviceState(message);
      } else if (topic === 'esp32/telemetry') {
        await this.handleTelemetry(message);
      } else if (this.messageHandlers.has(topic)) {
        await this.messageHandlers.get(topic)(message);
      }
    } catch (error) {
      logger.error('[MQTT] Error handling message', {
        topic,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Handle ESP32 device state updates
   */
  async handleDeviceState(message) {
    try {
      const payload = message.toString();
      let data;
      
      try {
        data = JSON.parse(payload);
      } catch (e) {
        logger.warn('[MQTT] esp32/state: Invalid JSON, skipping');
        return;
      }

      if (!data.mac) {
        logger.warn('[MQTT] esp32/state: No MAC address in payload');
        return;
      }

      const normalizedMac = this.normalizeMac(data.mac);
      const device = await Device.findOne({
        $or: [
          { macAddress: data.mac },
          { macAddress: data.mac.toUpperCase() },
          { macAddress: data.mac.toLowerCase() },
          { macAddress: normalizedMac },
          { macAddress: normalizedMac.toUpperCase() },
          { macAddress: normalizedMac.toLowerCase() }
        ]
      }).select('+deviceSecret');

      if (!device) {
        logger.warn('[MQTT] Device not found', { mac: data.mac });
        return;
      }

      if (data.secret && data.secret !== device.deviceSecret) {
        logger.warn('[MQTT] Invalid device secret', { mac: device.macAddress });
        return;
      }

      // Update device status
      const previousStatus = device.status;
      const now = new Date();
      
      // Update lastSeen on every heartbeat
      device.lastSeen = now;
      
      // Only update onlineSince when device transitions from offline to online
      if (previousStatus !== 'online') {
        device.status = 'online';
        device.onlineSince = now;
        device.offlineSince = null;
        logger.info(`[MQTT] Device ${device.macAddress} came online at ${now.toISOString()}`);
      } else {
        // Already online, just update lastSeen (don't touch onlineSince)
        device.status = 'online';
        logger.debug(`[MQTT] Device ${device.macAddress} heartbeat - online since ${device.onlineSince?.toISOString()}`);
      }

      const stateChanges = [];

      // Update switch states
      if (data.switches && Array.isArray(data.switches)) {
        data.switches.forEach(esp32Switch => {
          const deviceSwitch = device.switches.find(
            s => (s.relayGpio || s.gpio) === esp32Switch.gpio
          );
          
          if (deviceSwitch) {
            if (!deviceSwitch.relayGpio) {
              deviceSwitch.relayGpio = deviceSwitch.gpio;
            }
            
            if (deviceSwitch.state !== esp32Switch.state) {
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
            }
          }
        });
      }

      await device.save();
      logger.info(`[MQTT] Device ${device.macAddress} marked as online`);

      // Log device status change to ActivityLog if status changed from offline to online
      if (previousStatus !== 'online') {
        try {
          await ActivityLog.create({
            deviceId: device._id,
            deviceName: device.name,
            action: 'device_online',
            triggeredBy: 'heartbeat',
            classroom: device.classroom,
            location: device.location,
            timestamp: new Date()
          });
          logger.info(`[MQTT] ActivityLog created: ${device.name} came online`);
        } catch (logError) {
          logger.error('[MQTT] Failed to create ActivityLog:', logError);
        }
      }

      // Log device status
      await this.logDeviceStatus(device, data);

      // Log activity changes
      if (stateChanges.length > 0) {
        await this.logActivityChanges(device, stateChanges);
      }

      // Send configuration to ESP32
      this.sendDeviceConfig(device.macAddress);

      // Emit Socket.IO events if available
      this.emitDeviceUpdate(device, stateChanges.length > 0);

    } catch (error) {
      logger.error('[MQTT] Error handling device state', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Handle telemetry data
   */
  async handleTelemetry(message) {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'manual_switch') {
        await this.handleManualSwitch(data);
      }
    } catch (error) {
      logger.error('[MQTT] Error handling telemetry', {
        error: error.message
      });
    }
  }

  /**
   * Handle manual switch events
   */
  async handleManualSwitch(data) {
    if (!data.mac || typeof data.gpio === 'undefined') {
      logger.warn('[MQTT] Manual switch event missing required fields');
      return;
    }

    const normalizedMac = this.normalizeMac(data.mac);
    const device = await Device.findOne({
      $or: [
        { macAddress: data.mac },
        { macAddress: normalizedMac }
      ]
    });

    if (!device) {
      logger.warn('[MQTT] Device not found for manual switch', { mac: data.mac });
      return;
    }

    const switchInfo = device.switches.find(
      sw => (sw.relayGpio || sw.gpio) === data.gpio
    );

    if (!switchInfo) {
      logger.warn('[MQTT] Switch not found', { 
        mac: data.mac, 
        gpio: data.gpio 
      });
      return;
    }

    // Update switch state
    await Device.findOneAndUpdate(
      { _id: device._id, 'switches._id': switchInfo._id },
      {
        $set: {
          'switches.$.state': data.state,
          'switches.$.lastStateChange': new Date(),
          lastSeen: new Date(),
          status: 'online'
        }
      },
      { new: true }
    );

    // Log manual switch activity
    await ActivityLog.create({
      deviceId: device._id,
      deviceName: device.name,
      switchId: switchInfo._id,
      switchName: switchInfo.name,
      action: data.state ? 'manual_on' : 'manual_off',
      triggeredBy: 'manual_switch',
      classroom: device.classroom,
      location: device.location,
      timestamp: new Date()
    });

    logger.info(`[MQTT] Manual switch event logged for ${device.name}`);
  }

  /**
   * Log device status
   */
  async logDeviceStatus(device, data) {
    try {
      const switchStates = [];
      
      if (data.switches && Array.isArray(data.switches)) {
        data.switches.forEach(esp32Switch => {
          const deviceSwitch = device.switches.find(
            s => (s.relayGpio || s.gpio) === esp32Switch.gpio
          );
          
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

      const totalSwitchesOn = switchStates.filter(s => s.actualState).length;
      const totalSwitchesOff = switchStates.length - totalSwitchesOn;

      await DeviceStatusLog.create({
        deviceId: device._id,
        deviceName: device.name,
        deviceMac: device.macAddress,
        checkType: 'scheduled_check',
        switchStates,
        deviceStatus: {
          isOnline: true,
          lastSeen: device.lastSeen,
          freeHeap: data.heap || 0,
          responseTime: 0
        },
        summary: {
          totalSwitchesOn,
          totalSwitchesOff,
          inconsistenciesFound: switchStates.filter(s => !s.isMatch).length
        },
        classroom: device.classroom,
        location: device.location,
        timestamp: new Date()
      });

      logger.debug(`[MQTT] Status logged: ${totalSwitchesOn} ON, ${totalSwitchesOff} OFF`);
    } catch (error) {
      logger.error('[MQTT] Error logging device status', { error: error.message });
    }
  }

  /**
   * Log activity changes
   */
  async logActivityChanges(device, stateChanges) {
    try {
      for (const change of stateChanges) {
        const action = change.newState
          ? (change.manualOverride ? 'manual_on' : 'on')
          : (change.manualOverride ? 'manual_off' : 'off');
        
        const timestamp = new Date();
        const hour = timestamp.getHours();
        
        await ActivityLog.create({
          deviceId: device._id,
          deviceName: device.name,
          switchId: change.switchId,
          switchName: change.switchName,
          action,
          triggeredBy: change.manualOverride ? 'manual_switch' : 'system',
          classroom: device.classroom,
          location: device.location,
          timestamp,
          context: {
            source: 'esp32_state_update',
            previousState: change.oldState,
            newState: change.newState,
            manualOverride: change.manualOverride
          }
        });

        // Check for lights turned on after 5 PM (17:00)
        if (change.newState && change.switchName && change.switchName.toLowerCase().includes('light')) {
          if (hour >= 17 || hour < 6) { // After 5 PM or before 6 AM
            await this.sendAfterHoursLightAlert(device, change, timestamp);
          }
        }
      }
      
      logger.debug(`[MQTT] Logged ${stateChanges.length} activity changes`);
    } catch (error) {
      logger.error('[MQTT] Error logging activity changes', { error: error.message });
    }
  }

  /**
   * Send immediate alert for lights turned on after hours
   */
  async sendAfterHoursLightAlert(device, change, timestamp) {
    try {
      const telegramService = require('./telegramService');
      
      const hour = timestamp.getHours();
      const isAfterHours = hour >= 17 || hour < 6;
      
      if (!isAfterHours) return; // Should not happen, but double-check
      
      logger.info(`[MQTT] Light turned on after hours: ${change.switchName} in ${device.classroom || 'Unknown'} at ${timestamp.toLocaleTimeString()}`);
      
      // Create alert message
      let message = `🚨 *Light Turned On After Hours*\n\n`;
      message += `⚠️ A light switch was activated after 5:00 PM\n\n`;
      message += `*Device:* ${device.name}\n`;
      message += `*Switch:* ${change.switchName}\n`;
      message += `*Location:* ${device.classroom || 'Unknown Classroom'}\n`;
      if (device.location) {
        message += `*Room:* ${device.location}\n`;
      }
      message += `*Time:* ${timestamp.toLocaleTimeString()}\n`;
      message += `*Triggered by:* ${change.manualOverride ? 'Manual Switch' : 'System/Automation'}\n\n`;
      message += `Please verify if this light should remain on for security or maintenance purposes.`;
      
      // Prepare alert data
      const alertData = {
        alertname: 'Light Activated After Hours',
        summary: `${change.switchName} turned on in ${device.classroom || 'Unknown'} after 5 PM`,
        description: message,
        severity: 'warning',
        instance: 'realtime_light_monitor',
        value: 1,
        classroom: device.classroom,
        deviceName: device.name,
        switchName: change.switchName
      };

      // Send alert to security personnel
      const results = await telegramService.sendAlert('switchesOnAfter5PM', alertData);
      
      const successCount = results.filter(r => r.success).length;
      logger.info(`[MQTT] After-hours light alert sent to ${successCount}/${results.length} security personnel`);
      
    } catch (error) {
      logger.error('[MQTT] Error sending after-hours light alert', { error: error.message });
    }
  }

  /**
   * Publish message with retry logic
   */
  publish(topic, message, options = {}, retries = 3) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        // Queue message for later
        this.queueMessage(topic, message, options);
        logger.warn(`[MQTT] Message queued (offline): ${topic}`);
        return resolve({ queued: true });
      }

      const attempt = (retriesLeft) => {
        this.client.publish(topic, message, options, (error) => {
          if (error) {
            if (retriesLeft > 0) {
              logger.warn(`[MQTT] Publish failed, retrying... (${retriesLeft} left)`);
              setTimeout(() => attempt(retriesLeft - 1), 1000);
            } else {
              logger.error('[MQTT] Publish failed after retries', { 
                topic, 
                error: error.message 
              });
              reject(new MQTTError('Failed to publish message', error));
            }
          } else {
            logger.debug(`[MQTT] Published to ${topic}`);
            resolve({ success: true });
          }
        });
      };

      attempt(retries);
    });
  }

  /**
   * Queue message for offline device
   */
  queueMessage(topic, message, options) {
    if (!this.messageQueue.has(topic)) {
      this.messageQueue.set(topic, []);
    }
    
    this.messageQueue.get(topic).push({
      message,
      options,
      timestamp: Date.now()
    });

    // Limit queue size
    const queue = this.messageQueue.get(topic);
    if (queue.length > 100) {
      queue.shift(); // Remove oldest message
    }
  }

  /**
   * Process queued messages
   */
  async processMessageQueue() {
    if (!this.isConnected || this.messageQueue.size === 0) return;

    logger.info(`[MQTT] Processing ${this.messageQueue.size} queued topics`);

    for (const [topic, messages] of this.messageQueue.entries()) {
      for (const { message, options } of messages) {
        try {
          await this.publish(topic, message, options, 1);
        } catch (error) {
          logger.error('[MQTT] Failed to process queued message', {
            topic,
            error: error.message
          });
        }
      }
      this.messageQueue.delete(topic);
    }
  }

  /**
   * Send device configuration
   */
  sendDeviceConfig(macAddress) {
    // Implementation will be added based on your config structure
    const topic = `esp32/${macAddress}/config`;
    // Add your config logic here
    logger.debug(`[MQTT] Config sent to ${macAddress}`);
  }

  /**
   * Emit device update via Socket.IO
   */
  emitDeviceUpdate(device, stateChanged) {
    if (global.io) {
      if (stateChanged) {
        global.io.emit('deviceStatusUpdate', {
          macAddress: device.macAddress,
          status: 'online',
          lastSeen: device.lastSeen
        });

        global.io.emit('device_connected', {
          deviceId: device._id.toString(),
          deviceName: device.name,
          location: device.location || '',
          macAddress: device.macAddress,
          lastSeen: device.lastSeen
        });
      }
    }
  }

  /**
   * Register custom message handler
   */
  registerHandler(topic, handler) {
    this.messageHandlers.set(topic, handler);
    logger.info(`[MQTT] Handler registered for topic: ${topic}`);
  }

  /**
   * Normalize MAC address
   */
  normalizeMac(mac) {
    return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  }

  /**
   * Disconnect from MQTT broker
   */
  disconnect() {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
      logger.info('[MQTT] Disconnected from broker');
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.size
    };
  }
}

// Export singleton instance
module.exports = new MQTTService();
