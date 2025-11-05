const ActivityLog = require('../models/ActivityLog');
const Device = require('../models/Device');
const DeviceConsumptionLedger = require('../models/DeviceConsumptionLedger'); // NEW SYSTEM
const EnergyConsumption = require('../models/EnergyConsumption'); // OLD SYSTEM (keeping for compatibility)
const { logger } = require('../middleware/logger');
const fs = require('fs').promises;
const path = require('path');

// Import PowerSettings for centralized configuration management
const PowerSettings = require('../models/PowerSettings');


/**
 * Power Consumption Tracker Service
 * 
 * Tracks power consumption in real-time when devices are ON and ESP32 is ONLINE
 * Stores data incrementally by:
 * - ESP32 Device
 * - Classroom/Location
 * - Switch Type (light, fan, ac, etc.)
 */

class PowerConsumptionTracker {
  constructor() {
    this.activeSwitches = new Map(); // Track active switches: switchId -> { startTime, power, type, deviceId, ... }
    this.electricityRate = 7.5; // Default: ₹7.5 per kWh (loaded from settings)
    this.devicePowerSettings = {}; // Power consumption by device type
    this.isInitialized = false;
    this.settingsTimestamp = null; // To track when settings were last loaded
  }

  /**
   * Initialize the tracker - load power settings
   */
  async initialize() {
    if (this.isInitialized) {
      logger.debug('[PowerTracker] Already initialized. Skipping.');
      return;
    }
    
    try {
      await this.loadPowerSettings();
      logger.info('[PowerTracker] Initialized successfully');
      this.isInitialized = true;
      
      // Reload settings periodically
      setInterval(() => this.loadPowerSettings({ force: false }), 60000); // Check for updates every minute
    } catch (error) {
      logger.error('[PowerTracker] Initialization error:', error);
      this.isInitialized = false; // Ensure we can re-initialize if it fails
    }
  }

  /**
   * Load power settings from the database
   */
  async loadPowerSettings({ force = false } = {}) {
    try {
      const settings = await PowerSettings.getSingleton();

      // If settings haven't changed since last load, skip update
      if (!force && this.settingsTimestamp && settings.updatedAt <= this.settingsTimestamp) {
        return;
      }

      this.electricityRate = settings.electricityPrice;
      this.devicePowerSettings = settings.deviceTypes.reduce((acc, deviceType) => {
        acc[deviceType.type.toLowerCase()] = deviceType.powerConsumption;
        return acc;
      }, {});
      
      this.settingsTimestamp = settings.updatedAt;

      logger.info(`[PowerTracker] Power settings loaded/reloaded. Electricity Rate: ₹${this.electricityRate}/kWh`);
      logger.debug('[PowerTracker] Loaded device power settings:', this.devicePowerSettings);

    } catch (error) {
      logger.error('[PowerTracker] Failed to load power settings from DB:', error);
      // Fallback to default settings if DB load fails
      this.loadDefaultPowerSettings();
    }
  }

  /**
   * Fallback to default power settings if DB is unavailable
   */
  loadDefaultPowerSettings() {
    logger.warn('[PowerTracker] Using default power settings as a fallback.');
    this.electricityRate = 7.5;
    this.devicePowerSettings = {
      'light': 40,
      'fan': 75,
      'projector': 200,
      'ac': 1500,
      'outlet': 100,
      'default': 50
    };
  }

  /**
   * Get power consumption for a switch type
   */
  getPowerConsumption(switchName, switchType) {
    const type = (switchType || '').toLowerCase();
    const name = (switchName || '').toLowerCase();

    // 1. Exact match on switch type (e.g., 'light', 'fan')
    if (this.devicePowerSettings[type]) {
      return this.devicePowerSettings[type];
    }

    // 2. Keyword matching for common names if type is generic (e.g., 'relay')
    const keywords = {
      'light': 'light', 'led': 'light', 'bulb': 'light',
      'fan': 'fan',
      'projector': 'projector',
      'ac': 'ac', 'air conditioner': 'ac',
      'outlet': 'outlet', 'socket': 'outlet'
    };

    for (const [keyword, deviceType] of Object.entries(keywords)) {
      if (name.includes(keyword)) {
        const power = this.devicePowerSettings[deviceType];
        if (power) return power;
      }
    }
    
    // 3. Fallback to a default value if no match is found
    const defaultPower = this.devicePowerSettings['default'] || 50;
    logger.warn(`[PowerTracker] No power setting for '${type}' or name '${name}'. Using default ${defaultPower}W.`);
    return defaultPower;
  }

  /**
   * Track when a switch is turned ON
   * Only tracks if ESP32 device is ONLINE
   */
  async trackSwitchOn(switchId, options = {}) {
    if (!this.isInitialized) await this.initialize();

    const { switchName, switchType, deviceId, classroomId, deviceName } = options;
    
    // Ensure device is online before tracking
    try {
      const device = await Device.findById(deviceId);
      if (!device || device.status !== 'online') {
        logger.warn(`[PowerTracker] Device ${deviceName || deviceId} is offline. Not tracking switch ON for ${switchName}.`);
        return;
      }
    } catch (error) {
      logger.error(`[PowerTracker] Error checking device status for ${deviceId}:`, error);
      return; // Do not track if device status is uncertain
    }

    if (this.activeSwitches.has(switchId)) {
      logger.warn(`[PowerTracker] Switch ${switchId} is already ON. Ignoring duplicate ON event.`);
      return;
    }

    // Get power consumption for this switch
    const power = this.getPowerConsumption(switchName, switchType);

    this.activeSwitches.set(switchId, {
      startTime: Date.now(),
      power, // Power in Watts
      type: switchType,
      deviceId,
      classroomId,
      deviceName,
      switchName
    });

    logger.info(`[PowerTracker] Switch ON: ${switchName} (${switchId}) on device ${deviceName}. Power: ${power}W.`);
    logger.debug('[PowerTracker] Active switches:', this.activeSwitches.size);
  }

  /**
   * Track when a switch is turned OFF
   * Calculates and stores consumption from ON to OFF
   */
  async trackSwitchOff(switchId) {
    if (!this.activeSwitches.has(switchId)) {
      logger.warn(`[PowerTracker] Switch OFF event for untracked or already stopped switch: ${switchId}`);
      return null;
    }

    const switchData = this.activeSwitches.get(switchId);
    const endTime = Date.now();
    const startTime = switchData.startTime;
    
    // Duration in hours
    const durationMs = endTime - startTime;
    if (durationMs <= 0) {
      logger.warn(`[PowerTracker] Invalid duration (${durationMs}ms) for switch ${switchId}. Skipping.`);
      this.activeSwitches.delete(switchId);
      return null;
    }
    const durationHours = durationMs / (1000 * 60 * 60);

    const { power, type, deviceId, classroomId, deviceName, switchName } = switchData;

    // Energy in kWh
    const energyKwh = (power * durationHours) / 1000;
    
    // Cost in local currency
    const cost = energyKwh * this.electricityRate;

    this.activeSwitches.delete(switchId);

    logger.info(`[PowerTracker] Switch OFF: ${switchName} (${switchId}) on ${deviceName}. Duration: ${durationHours.toFixed(3)}h, Energy: ${energyKwh.toFixed(5)} kWh, Cost: ₹${cost.toFixed(4)}`);
    logger.debug('[PowerTracker] Active switches:', this.activeSwitches.size);

    // Save to NEW SYSTEM: DeviceConsumptionLedger
    try {
      const ledgerEntry = new DeviceConsumptionLedger({
        device_id: deviceId.toString(),
        esp32_name: deviceName,
        classroom: classroomId,
        switch_id: switchId,
        switch_name: switchName,
        switch_type: type,
        start_ts: new Date(startTime),
        end_ts: new Date(endTime),
        switch_on_duration_seconds: durationMs / 1000,
        delta_wh: energyKwh * 1000, // Convert kWh to Wh
        power_w: power,
        cost_calculation: {
          cost_per_kwh: this.electricityRate,
          cost_inr: cost
        },
        quality: {
          confidence: 'high', // Direct tracking = high confidence
          data_source: 'power_tracker',
          notes: 'Real-time switch tracking'
        }
      });
      await ledgerEntry.save();
      
      logger.info(`[PowerTracker] ✅ Saved to DeviceConsumptionLedger: ${energyKwh.toFixed(5)} kWh`);
      
      // Trigger real-time aggregation for today
      this.triggerAggregation(classroomId).catch(err => {
        logger.error('[PowerTracker] Aggregation trigger failed:', err);
      });
      
      return {
        deviceId,
        switchId,
        durationHours,
        energyKwh,
        cost
      };
    } catch (error) {
      logger.error(`[PowerTracker] Failed to save consumption data for switch ${switchId}:`, error);
      return null;
    }
  }

  /**
   * Handle device going offline - stop tracking all its switches
   */
  handleDeviceOffline(deviceId) {
    logger.warn(`[PowerTracker] Device ${deviceId} went offline. Stopping tracking for all its active switches.`);
    let stoppedCount = 0;
    for (const [switchId, switchData] of this.activeSwitches.entries()) {
      if (switchData.deviceId === deviceId) {
        this.trackSwitchOff(switchId);
        stoppedCount++;
      }
    }
    logger.info(`[PowerTracker] Stopped tracking for ${stoppedCount} switches on offline device ${deviceId}.`);
  }

  /**
   * Get the number of currently active (ON) switches
   */
  getActiveSwitchCount() {
    return this.activeSwitches.size;
  }

  /**
   * Trigger aggregation for today (called after ledger entry)
   * Runs in background to avoid blocking switch operations
   */
  async triggerAggregation(classroom) {
    try {
      const aggregationService = require('./aggregationService');
      const today = new Date();
      
      logger.debug(`[PowerTracker] Triggering aggregation for ${classroom || 'all'} on ${today.toDateString()}`);
      
      // Run aggregation in background
      await aggregationService.aggregateDaily(today, classroom);
      
      logger.info(`[PowerTracker] ✅ Aggregation completed for ${classroom || 'all'}`);
    } catch (error) {
      // Don't throw - aggregation failures shouldn't break switch tracking
      logger.error('[PowerTracker] Aggregation failed:', error.message);
    }
  }
}

// Export singleton instance
// The tracker is initialized in the main server file after DB connection
const powerTracker = new PowerConsumptionTracker();

module.exports = powerTracker;
