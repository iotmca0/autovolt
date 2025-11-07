const Device = require('../models/Device');
const PowerConsumptionLog = require('../models/PowerConsumptionLog');
const EnhancedLoggingService = require('./enhancedLoggingService');
const DeviceStatusLog = require('../models/DeviceStatusLog');
const ActivityLog = require('../models/ActivityLog');
const Settings = require('../models/Settings');

// Import metrics functions from metricsService
const { timeLimitExceededCount, switchTimeOnMinutes } = require('../metricsService');

class DeviceMonitoringService {
  constructor() {
    this.monitoringInterval = null;
    this.isRunning = false;
    this.checkIntervalMs = 30 * 1000; // 30 seconds
    this.offlineThresholdMs = 2 * 60 * 1000; // default 2 minutes
    this.lastThresholdRefresh = 0;
  }

  async getOfflineThresholdMs(force = false) {
    const now = Date.now();
    if (!force && now - this.lastThresholdRefresh < 60 * 1000) {
      return this.offlineThresholdMs;
    }

    try {
      const settings = await Settings.findOne({}, { 'security.deviceOfflineThreshold': 1 }).lean();
      const thresholdSeconds = settings?.security?.deviceOfflineThreshold;
      if (typeof thresholdSeconds === 'number' && thresholdSeconds > 0) {
        this.offlineThresholdMs = thresholdSeconds * 1000;
      } else {
        this.offlineThresholdMs = 2 * 60 * 1000;
      }
    } catch (error) {
      console.error('[MONITORING] Failed to load offline threshold from settings:', error.message);
      this.offlineThresholdMs = 2 * 60 * 1000;
    }

    this.lastThresholdRefresh = now;
    return this.offlineThresholdMs;
  }

  // Start the monitoring service
  start() {
    if (this.isRunning) {
      console.log('[MONITORING] Service already running');
      return;
    }

    this.isRunning = true;
    console.log('[MONITORING] Starting device monitoring service (30-second intervals)');
    
    // Run initial check
    this.performMonitoringCheck();
    
    // Set up recurring checks
    console.log(`[MONITORING] Setting up interval with ${this.checkIntervalMs}ms`);
    this.monitoringInterval = setInterval(() => {
      console.log('[MONITORING] Interval triggered - running monitoring check');
      this.performMonitoringCheck();
    }, this.checkIntervalMs);
    
    console.log('[MONITORING] Interval set up successfully');
  }

  // Stop the monitoring service
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('[MONITORING] Device monitoring service stopped');
  }

  // Perform monitoring check for all devices
  async performMonitoringCheck() {
    try {
      console.log('[MONITORING] Starting scheduled device status check...');

      const offlineThresholdMs = await this.getOfflineThresholdMs();
      const devices = await Device.find({}).sort({ name: 1 });
      console.log(`[MONITORING] Found ${devices.length} devices to check`);

      for (const device of devices) {
        console.log(`[STATUS-CHECK] Checking device: ${device.name} (${device.macAddress}) - Status: ${device.status}, LastSeen: ${device.lastSeen}`);
        await this.checkDeviceStatus(device, offlineThresholdMs);
        // Small delay between devices to prevent overwhelming
        await this.sleep(1000);
      }

      // Store power consumption data by device and classroom
      await this.storePowerConsumptionData(devices);

      console.log(`[MONITORING] Completed status check for ${devices.length} devices`);
    } catch (error) {
      console.error('[MONITORING-ERROR]', error);
      await EnhancedLoggingService.logError({
        errorType: 'system_error',
        severity: 'high',
        message: 'Device monitoring check failed',
        details: { error: error.message }
      });
    }
  }

  // Check individual device status
  async checkDeviceStatus(device, offlineThresholdMs) {
    try {
      const statusData = {
        deviceId: device._id,
        deviceName: device.name,
        deviceMac: device.mac,
        checkType: 'scheduled_check',
        classroom: device.classroom,
        location: device.location
      };

      // Get current switch states (this would come from ESP32 in real implementation)
      const switchStates = await this.getSwitchStates(device);
      statusData.switchStates = switchStates;

      // Get device status
  const deviceStatus = await this.getDeviceStatus(device, offlineThresholdMs);
      statusData.deviceStatus = deviceStatus;

      console.log(`[STATUS-CHECK] ${device.name} - isOnline: ${deviceStatus.isOnline}, timeSinceLastSeen: ${device.lastSeen ? (new Date() - device.lastSeen) / 1000 : 'never'} seconds`);

      // Get network info
      const networkInfo = await this.getNetworkInfo(device);
      statusData.networkInfo = networkInfo;

      // Check for alerts
      const alerts = await this.checkForAlerts(device, deviceStatus, switchStates);
      statusData.alerts = alerts;

      // Generate summary
      const summary = this.generateSummary(switchStates, alerts);
      statusData.summary = summary;

      // Log the status
      await EnhancedLoggingService.logDeviceStatus(statusData);

      // Check if device status changed and send real-time notification
  const previousStatus = device.status;
  const newStatus = deviceStatus.isOnline ? 'online' : 'offline';
  const statusChangeTime = new Date();
      
      if (previousStatus !== newStatus) {
        console.log(`[MONITORING] Device ${device.name} status changed: ${previousStatus} -> ${newStatus}`);
        
        const changeTimestamp = deviceStatus.lastSeen || statusChangeTime;

        // Log status change to ActivityLog for uptime tracking
        try {
          await ActivityLog.create({
            deviceId: device._id,
            deviceName: device.name,
            action: newStatus === 'online' ? 'device_online' : 'device_offline',
            triggeredBy: 'system',
            classroom: device.classroom,
            location: device.location,
            timestamp: changeTimestamp
          });
          console.log(`[MONITORING] ActivityLog created: ${device.name} is now ${newStatus}`);
        } catch (logError) {
          console.error('[MONITORING] Failed to create ActivityLog:', logError);
        }
        
        // Handle power tracking when device goes offline
        if (newStatus === 'offline') {
          try {
            const powerTracker = require('./powerConsumptionTracker');
            await powerTracker.handleDeviceOffline(device._id, device.macAddress);
            console.log(`[MONITORING] Power tracker notified of offline: ${device.name}`);
          } catch (trackError) {
            console.error('[MONITORING] Power tracker offline handling error:', trackError);
          }
        }
        
        // Send real-time notification
        if (global.io) {
          global.io.emit('device_state_changed', {
            deviceId: device._id,
            state: {
              id: device._id,
              name: device.name,
              status: newStatus,
              switches: device.switches || [],
              lastSeen: deviceStatus.lastSeen,
              macAddress: device.macAddress,
              location: device.location,
              classroom: device.classroom
            },
            ts: Date.now(),
            source: 'monitoring_check'
          });
          
          // Also emit device_connected/disconnected for compatibility
          if (newStatus === 'online') {
            global.io.emit('device_connected', {
              deviceId: device._id,
              deviceName: device.name,
              location: device.location,
              macAddress: device.macAddress,
              lastSeen: deviceStatus.lastSeen
            });
          } else {
            global.io.emit('device_disconnected', {
              deviceId: device._id,
              deviceName: device.name,
              macAddress: device.macAddress,
              lastSeen: device.lastSeen
            });
          }
        }
      }

      // Update device last checked timestamp and status
      const updatePayload = {
        lastStatusCheck: statusChangeTime,
        status: newStatus
      };

      if (previousStatus !== newStatus) {
        if (newStatus === 'online') {
          // Device came back online - set onlineSince to when we detected it
          updatePayload.onlineSince = statusChangeTime;
          updatePayload.offlineSince = null;
          device.onlineSince = updatePayload.onlineSince;
          device.offlineSince = null;
        } else if (newStatus === 'offline') {
          // Device went offline - offlineSince should be when the last heartbeat was received (lastSeen)
          // NOT the current time when we detected the timeout
          const offlineSince = device.lastSeen ? new Date(device.lastSeen) : statusChangeTime;
          updatePayload.offlineSince = offlineSince;
          updatePayload.onlineSince = null;
          device.offlineSince = offlineSince;
          device.onlineSince = null;
        }
      } else if (newStatus === 'offline' && !device.offlineSince) {
        // Already offline but offlineSince not set - backfill it
        const offlineSince = device.lastSeen ? new Date(device.lastSeen) : statusChangeTime;
        updatePayload.offlineSince = offlineSince;
        device.offlineSince = offlineSince;
      }

      await Device.findByIdAndUpdate(device._id, updatePayload);

    } catch (error) {
      console.error(`[MONITORING] Error checking device ${device.name}:`, error);
      await EnhancedLoggingService.logDeviceError(device, 'device_timeout', 
        `Failed to get status from device ${device.name}`, { error: error.message });
    }
  }

  // Get switch states from device (placeholder - would use WebSocket in real implementation)
  async getSwitchStates(device) {
    try {
      // In a real implementation, this would query the ESP32 via WebSocket
      // For now, we'll use the stored states from the device model
      
      const switchStates = [];
      
      // Use actual switches from device if available
      if (device.switches && Array.isArray(device.switches)) {
        for (const switchData of device.switches) {
          const currentState = switchData.state ? 'on' : 'off'; // Convert boolean to string
          const expectedState = currentState; // Would come from schedule/commands
          
          // Calculate duration (simulated)
          const currentSession = Math.floor(Math.random() * 120); // 0-120 minutes
          const totalToday = Math.floor(Math.random() * 480); // 0-8 hours
          const totalWeek = totalToday * 7 + Math.floor(Math.random() * 1000);
          
          // Calculate power consumption using improved function
          const basePower = getBasePowerConsumption(switchData.name, switchData.type);
          const currentPower = currentState === 'on' ? basePower : 0;
          const totalTodayPower = (totalToday / 60) * basePower;
          const totalWeekPower = (totalWeek / 60) * basePower;

          switchStates.push({
            switchId: switchData._id?.toString() || switchData.id,
            switchName: switchData.name,
            physicalPin: switchData.gpio,
            expectedState: expectedState,
            actualState: currentState,
            isMatch: expectedState === currentState,
            duration: {
              currentSession: currentSession,
              totalToday: totalToday,
              totalWeek: totalWeek
            },
            powerConsumption: {
              current: currentPower,
              totalToday: totalTodayPower,
              totalWeek: totalWeekPower
            },
            lastChanged: switchData.lastChanged || new Date(),
            changeReason: switchData.lastChangedBy || 'unknown'
          });
        }
      }

      return switchStates;
    } catch (error) {
      console.error(`[SWITCH-STATES] Error getting switch states for ${device.name}:`, error);
      return [];
    }
  }

  // Get device status (placeholder - would query ESP32)
  async getDeviceStatus(device, offlineThresholdMs) {
    try {
      const now = new Date();
      const threshold = typeof offlineThresholdMs === 'number' && offlineThresholdMs > 0
        ? offlineThresholdMs
        : this.offlineThresholdMs;
      const timeSinceLastSeen = device.lastSeen ? now - device.lastSeen : Infinity;
      const isOnline = timeSinceLastSeen < threshold;

      return {
        isOnline: isOnline,
        wifiSignalStrength: Math.floor(Math.random() * 100), // -100 to 0 dBm
        uptime: Math.floor(Math.random() * 86400), // seconds
        freeHeap: Math.floor(Math.random() * 50000) + 10000, // bytes
        temperature: Math.floor(Math.random() * 20) + 20, // 20-40°C
  lastSeen: device.lastSeen || now,
        responseTime: Math.floor(Math.random() * 500) + 50, // milliseconds
        powerStatus: isOnline ? 'stable' : 'unknown'
      };
    } catch (error) {
      return {
        isOnline: false,
        responseTime: -1,
        powerStatus: 'unknown'
      };
    }
  }

  // Get network information
  async getNetworkInfo(device) {
    return {
      ipAddress: device.ipAddress || '192.168.1.100',
      gateway: '192.168.1.1',
      subnet: '255.255.255.0',
      dns: '8.8.8.8',
      macAddress: device.mac
    };
  }

  // Check for alerts and issues
  async checkForAlerts(device, deviceStatus, switchStates) {
    const alerts = [];
    const now = new Date();

    // Check if device is offline
    if (!deviceStatus.isOnline) {
      alerts.push({
        type: 'device_offline',
        message: `Device ${device.name} is offline`,
        severity: 'high',
        timestamp: now
      });
    }

    // Check for high response time
    if (deviceStatus.responseTime > 2000) {
      alerts.push({
        type: 'high_latency',
        message: `High response time: ${deviceStatus.responseTime}ms`,
        severity: 'medium',
        timestamp: now
      });
    }

    // Check for low memory
    if (deviceStatus.freeHeap < 5000) {
      alerts.push({
        type: 'low_memory',
        message: `Low free heap: ${deviceStatus.freeHeap} bytes`,
        severity: 'high',
        timestamp: now
      });
    }

    // Check for temperature issues
    if (deviceStatus.temperature > 60) {
      alerts.push({
        type: 'overheating',
        message: `High temperature: ${deviceStatus.temperature}°C`,
        severity: 'critical',
        timestamp: now
      });
    }

    // Check for state inconsistencies
    const inconsistentSwitches = switchStates.filter(s => !s.isMatch);
    if (inconsistentSwitches.length > 0) {
      alerts.push({
        type: 'state_inconsistency',
        message: `${inconsistentSwitches.length} switches have inconsistent states`,
        severity: 'medium',
        timestamp: now
      });
    }

    // Check for excessive power consumption
    const totalPower = switchStates.reduce((sum, s) => sum + s.powerConsumption.current, 0);
    if (totalPower > 3000) { // 3kW threshold
      alerts.push({
        type: 'high_power_consumption',
        message: `High power consumption: ${totalPower}W`,
        severity: 'medium',
        timestamp: now
      });
    }

    // Check for device notifications
    const deviceAlerts = await this.checkDeviceNotifications(device);
    alerts.push(...deviceAlerts);

    return alerts;
  }

  // Check for device-level notifications based on time and switch states
  async checkDeviceNotifications(device) {
    const alerts = [];
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    try {
      const settings = device.notificationSettings;
      if (!settings || !settings.enabled || !settings.afterTime) {
        return alerts;
      }

      // Check if current day is included
      if (settings.daysOfWeek && settings.daysOfWeek.length > 0) {
        if (!settings.daysOfWeek.includes(currentDay)) {
          return alerts;
        }
      }

      // Check if current time is after the notification time
      if (currentTime <= settings.afterTime) {
        return alerts;
      }

      // Check if we already triggered this notification today
      const lastTriggered = settings.lastTriggered;
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastTriggeredDate = lastTriggered ? new Date(lastTriggered.getFullYear(), lastTriggered.getMonth(), lastTriggered.getDate()) : null;

      // Only trigger if not already triggered today
      if (lastTriggeredDate && lastTriggeredDate >= today) {
        return alerts;
      }

      // Get active switches (switches that are currently on)
      const activeSwitches = device.switches.filter(sw => sw.state);
      const totalSwitches = device.switches.length;

      let message = '';
      let shouldNotify = false;

      if (activeSwitches.length === 0) {
        // No switches are on - no notification needed
        return alerts;
      } else if (activeSwitches.length === totalSwitches) {
        // All switches are on
        message = `All ${totalSwitches} switches are still ON in ${device.name}${device.classroom ? ` (${device.classroom})` : ''}`;
        shouldNotify = true;
      } else if (activeSwitches.length === 1) {
        // Only one switch is on
        const switchName = activeSwitches[0].name;
        message = `Switch "${switchName}" is still ON in ${device.name}${device.classroom ? ` (${device.classroom})` : ''}`;
        shouldNotify = true;
      } else {
        // Multiple switches are on (but not all)
        const switchNames = activeSwitches.map(sw => sw.name).join(', ');
        message = `${activeSwitches.length} switches (${switchNames}) are still ON in ${device.name}${device.classroom ? ` (${device.classroom})` : ''}`;
        shouldNotify = true;
      }

      if (shouldNotify) {
        alerts.push({
          type: 'device_notification',
          message: message,
          severity: 'warning',
          timestamp: now,
          notificationTime: settings.afterTime,
          customMessage: message
        });

        // Send real-time notification
        if (global.io) {
          global.io.emit('device_notification', {
            deviceId: device._id.toString(),
            deviceName: device.name,
            classroom: device.classroom,
            location: device.location,
            message: message,
            notificationTime: settings.afterTime,
            timestamp: now,
            activeSwitches: activeSwitches.map(sw => ({ id: sw.id, name: sw.name })),
            totalSwitches: totalSwitches
          });
        }

        // Update last triggered time
        await Device.findByIdAndUpdate(device._id, {
          $set: { 'notificationSettings.lastTriggered': now }
        });
      }
    } catch (error) {
      console.error(`[DEVICE-NOTIFICATIONS] Error checking device notifications for device ${device.name}:`, error);
    }

    return alerts;
  }

  // Generate summary statistics
  generateSummary(switchStates, alerts) {
    const totalSwitchesOn = switchStates.filter(s => s.actualState === 'on').length;
    const totalSwitchesOff = switchStates.filter(s => s.actualState === 'off').length;
    const totalPowerConsumption = switchStates.reduce((sum, s) => sum + s.powerConsumption.current, 0);
    const averageResponseTime = switchStates.length > 0 ? 
      switchStates.reduce((sum, s) => sum + (s.responseTime || 0), 0) / switchStates.length : 0;
    const inconsistenciesFound = switchStates.filter(s => !s.isMatch).length;

    return {
      totalSwitchesOn,
      totalSwitchesOff,
      totalPowerConsumption,
      averageResponseTime,
      inconsistenciesFound,
      alertsCount: alerts.length,
      criticalAlertsCount: alerts.filter(a => a.severity === 'critical').length
    };
  }

  // Store power consumption data by device and classroom
  async storePowerConsumptionData(devices) {
    try {
      const powerData = {
        timestamp: new Date(),
        totalConsumption: 0,
        byDevice: {},
        byClassroom: {},
        byDeviceType: {}
      };

      // Calculate power consumption for each device
      devices.forEach(device => {
        const devicePower = calculateDevicePowerConsumption(device);
        const classroom = device.classroom || 'unassigned';
        const deviceType = device.switches.length > 0 ? device.switches[0].type : 'unknown';

        // Store by device
        powerData.byDevice[device._id.toString()] = {
          deviceId: device._id.toString(),
          deviceName: device.name,
          classroom: classroom,
          powerConsumption: devicePower,
          switches: device.switches.length,
          activeSwitches: device.switches.filter(sw => sw.state).length,
          status: device.status
        };

        // Aggregate by classroom
        if (!powerData.byClassroom[classroom]) {
          powerData.byClassroom[classroom] = {
            classroom: classroom,
            totalPower: 0,
            deviceCount: 0,
            onlineDevices: 0,
            activeDevices: 0,
            devices: []
          };
        }

        powerData.byClassroom[classroom].totalPower += devicePower;
        powerData.byClassroom[classroom].deviceCount += 1;
        powerData.byClassroom[classroom].devices.push(device._id.toString());

        if (device.status === 'online') {
          powerData.byClassroom[classroom].onlineDevices += 1;
        }

        if (devicePower > 0) {
          powerData.byClassroom[classroom].activeDevices += 1;
        }

        // Aggregate by device type
        if (!powerData.byDeviceType[deviceType]) {
          powerData.byDeviceType[deviceType] = {
            type: deviceType,
            totalPower: 0,
            deviceCount: 0,
            activeDevices: 0
          };
        }

        powerData.byDeviceType[deviceType].totalPower += devicePower;
        powerData.byDeviceType[deviceType].deviceCount += 1;
        if (devicePower > 0) {
          powerData.byDeviceType[deviceType].activeDevices += 1;
        }

        // Add to total consumption
        powerData.totalConsumption += devicePower;
      });

      // Store in database using PowerConsumptionLog model
      const powerLog = new PowerConsumptionLog({
        timestamp: powerData.timestamp,
        totalConsumption: powerData.totalConsumption,
        byDevice: powerData.byDevice,
        byClassroom: powerData.byClassroom,
        byDeviceType: powerData.byDeviceType
      });

      await powerLog.save();

      console.log(`[POWER-MONITORING] Stored power consumption data: ${powerData.totalConsumption}W total`);

      return powerData;
    } catch (error) {
      console.error('[POWER-MONITORING] Error storing power consumption data:', error);
      return null;
    }
  }

  // Get due monitoring checks
  async getDueMonitoringChecks() {
    try {
      const fiveMinutesAgo = new Date(Date.now() - this.checkIntervalMs);
      
      const dueDevices = await Device.find({
        $or: [
          { lastStatusCheck: { $exists: false } },
          { lastStatusCheck: { $lt: fiveMinutesAgo } }
        ]
      }).sort({ lastStatusCheck: 1 });

      return dueDevices;
    } catch (error) {
      console.error('[DUE-CHECKS-ERROR]', error);
      return [];
    }
  }

  // Force check specific device
  async forceCheckDevice(deviceId) {
    try {
      const device = await Device.findById(deviceId);
      if (!device) {
        throw new Error('Device not found');
      }

      await this.checkDeviceStatus(device);
      return true;
    } catch (error) {
      console.error(`[FORCE-CHECK-ERROR]`, error);
      await EnhancedLoggingService.logError({
        errorType: 'system_error',
        severity: 'medium',
        message: 'Failed to force check device',
        details: { deviceId, error: error.message }
      });
      return false;
    }
  }

  // Utility function for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkIntervalMs,
      nextCheck: this.monitoringInterval ? 
        new Date(Date.now() + this.checkIntervalMs) : null
    };
  }
}

// Export singleton instance
const deviceMonitoringService = new DeviceMonitoringService();
module.exports = deviceMonitoringService;
