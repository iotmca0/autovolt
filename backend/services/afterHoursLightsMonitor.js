const ActivityLog = require('../models/ActivityLog');
const Device = require('../models/Device');
const telegramService = require('./telegramService');

/**
 * After Hours Switches Monitoring Service
 * 
 * Monitors for switches turned on after 5 PM (17:00) and sends real-time
 * alerts to security personnel via Telegram.
 * 
 * Features:
 * - Real-time monitoring of activity logs
 * - Detects switches turned on after 5 PM
 * - Sends immediate alerts to security personnel
 * - Tracks alert history to avoid spam
 * - Configurable time threshold
 */
class AfterHoursLightsMonitor {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 2 * 60 * 1000; // Check every 2 minutes
    this.intervalId = null;
    this.afterHoursThreshold = 17; // 5 PM (17:00 in 24-hour format)
    this.lastCheckedTimestamp = new Date();
    // Track recently alerted devices to avoid spam
    // Map<deviceId_switchId, timestamp>
    this.recentAlerts = new Map();
    this.alertCooldown = 60 * 60 * 1000; // 1 hour cooldown between alerts for same device
  }

  /**
   * Start the after-hours lights monitoring service
   */
  start() {
    if (this.isRunning) {
      console.log('[AFTER-HOURS] Service already running');
      return;
    }

    this.isRunning = true;
    this.lastCheckedTimestamp = new Date();
    console.log(`[AFTER-HOURS] Starting after-hours switches monitoring (threshold: ${this.afterHoursThreshold}:00)`);

    // Run initial check
    this.checkAfterHoursLights();

    // Schedule recurring checks
    this.intervalId = setInterval(() => {
      this.checkAfterHoursLights();
    }, this.checkInterval);

    // Cleanup old entries from recentAlerts map every 30 minutes
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupRecentAlerts();
    }, 30 * 60 * 1000);

    console.log(`[AFTER-HOURS] Service started - checking every ${this.checkInterval / 1000} seconds`);
  }

  /**
   * Stop the monitoring service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.isRunning = false;
    console.log('[AFTER-HOURS] After-hours switches monitoring service stopped');
  }

  /**
   * Check for lights turned on after hours since last check
   */
  async checkAfterHoursLights() {
    try {
      console.log(`[AFTER-HOURS] Checking for lights turned on after ${this.afterHoursThreshold}:00 since ${this.lastCheckedTimestamp.toISOString()}`);

      // Query activity logs for lights turned on after our last check
      const recentLightActivations = await ActivityLog.find({
        timestamp: { $gt: this.lastCheckedTimestamp },
        action: { $in: ['on', 'manual_on'] },
        // Removed switch name filter to monitor ALL switches after hours
      })
      .sort({ timestamp: 1 })
      .populate('deviceId', 'name classroom location')
      .limit(100); // Limit to prevent overload

      console.log(`[AFTER-HOURS] Found ${recentLightActivations.length} recent switch activations`);

      // Update last checked timestamp
      const newTimestamp = new Date();

      // Filter for switches turned on after hours
      const afterHoursActivations = recentLightActivations.filter(log => {
        const hour = new Date(log.timestamp).getHours();
        return hour >= this.afterHoursThreshold || hour < 7; // After 5 PM or before 7 AM
      });

      console.log(`[AFTER-HOURS] ${afterHoursActivations.length} switches turned on after ${this.afterHoursThreshold}:00 or before 07:00`);

      if (afterHoursActivations.length > 0) {
        // Group by device and classroom for better alert organization
        const groupedAlerts = this.groupActivationsByLocation(afterHoursActivations);
        
        for (const group of groupedAlerts) {
          await this.sendAfterHoursAlert(group);
        }
      }

      this.lastCheckedTimestamp = newTimestamp;

    } catch (error) {
      console.error('[AFTER-HOURS] Error checking after-hours lights:', error);
    }
  }

  /**
   * Group light activations by classroom/location for organized alerts
   */
  groupActivationsByLocation(activations) {
    const grouped = {};

    for (const log of activations) {
      // Check cooldown
      const alertKey = `${log.deviceId?._id}_${log.switchId}`;
      const lastAlertTime = this.recentAlerts.get(alertKey);
      
      if (lastAlertTime && (Date.now() - lastAlertTime) < this.alertCooldown) {
        console.log(`[AFTER-HOURS] Skipping alert for ${alertKey} - cooldown active`);
        continue;
      }

      const classroom = log.classroom || log.deviceId?.classroom || 'Unknown Location';
      
      if (!grouped[classroom]) {
        grouped[classroom] = {
          classroom: classroom,
          activations: []
        };
      }

      grouped[classroom].activations.push({
        deviceName: log.deviceId?.name || log.deviceName || 'Unknown Device',
        switchName: log.switchName || 'Light',
        location: log.location || log.deviceId?.location || '',
        timestamp: log.timestamp,
        triggeredBy: log.triggeredBy,
        userName: log.userName || 'Unknown User',
        alertKey: alertKey
      });
    }

    return Object.values(grouped);
  }

  /**
   * Send after-hours alert to security personnel
   */
  async sendAfterHoursAlert(group) {
    try {
      const { classroom, activations } = group;
      
      console.log(`[AFTER-HOURS] Sending alert for ${activations.length} lights in ${classroom}`);

      // Build detailed alert message
      let message = `🚨 *After-Hours Switch Alert*\n\n`;
      message += `⚠️ ${activations.length} switch(es) turned ON after ${this.afterHoursThreshold}:00\n\n`;
      message += `*Location:* ${classroom}\n\n`;

      // Add details for each activation
      message += `*Details:*\n`;
      activations.forEach((activation, index) => {
        const time = new Date(activation.timestamp).toLocaleTimeString();
        message += `${index + 1}. *${activation.switchName}* (${activation.deviceName})\n`;
        if (activation.location) {
          message += `   📍 ${activation.location}\n`;
        }
        message += `   ⏰ Time: ${time}\n`;
        message += `   👤 By: ${activation.userName} (${activation.triggeredBy})\n`;
      });

      message += `\n*Timestamp:* ${new Date().toLocaleString()}\n\n`;
      message += `Please verify if these lights should remain on or take appropriate action.`;

      // Prepare alert data for Telegram service
      const alertData = {
        alertname: 'Switches Turned On After Hours',
        summary: `${activations.length} switch(es) turned on in ${classroom} after ${this.afterHoursThreshold}:00`,
        description: message,
        severity: 'warning',
        instance: 'after_hours_switches_monitor',
        value: activations.length,
        classroom: classroom
      };

      // Send alert to security personnel (using switchesOnAfter5PM alert type)
      const results = await telegramService.sendAlert('switchesOnAfter5PM', alertData);

      const successCount = results.filter(r => r.success).length;
      console.log(`[AFTER-HOURS] Alert sent to ${successCount}/${results.length} security personnel`);

      // Mark alerts as sent (record in cooldown map)
      activations.forEach(activation => {
        this.recentAlerts.set(activation.alertKey, Date.now());
      });

      return results;

    } catch (error) {
      console.error('[AFTER-HOURS] Error sending after-hours alert:', error);
      return [];
    }
  }

  /**
   * Clean up old entries from recent alerts map
   */
  cleanupRecentAlerts() {
    const cutoff = Date.now() - this.alertCooldown;
    let cleaned = 0;

    for (const [key, timestamp] of this.recentAlerts.entries()) {
      if (timestamp < cutoff) {
        this.recentAlerts.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[AFTER-HOURS] Cleaned up ${cleaned} old alert entries`);
    }
  }

  /**
   * Manual trigger for testing
   */
  async triggerManualCheck() {
    console.log('[AFTER-HOURS] Manual check triggered');
    await this.checkAfterHoursLights();
    return { 
      success: true, 
      message: 'After-hours lights check completed',
      lastChecked: this.lastCheckedTimestamp
    };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      afterHoursThreshold: `${this.afterHoursThreshold}:00`,
      checkInterval: `${this.checkInterval / 1000} seconds`,
      lastCheckedTimestamp: this.lastCheckedTimestamp,
      alertCooldown: `${this.alertCooldown / (60 * 1000)} minutes`,
      recentAlertsCount: this.recentAlerts.size
    };
  }

  /**
   * Update the after-hours threshold (e.g., change from 17:00 to 18:00)
   */
  setAfterHoursThreshold(hour) {
    if (typeof hour !== 'number' || hour < 0 || hour > 23) {
      throw new Error('Hour must be a number between 0 and 23');
    }

    console.log(`[AFTER-HOURS] Changing threshold from ${this.afterHoursThreshold}:00 to ${hour}:00`);
    this.afterHoursThreshold = hour;
  }

  /**
   * Update the alert cooldown period
   */
  setAlertCooldown(minutes) {
    if (typeof minutes !== 'number' || minutes < 1) {
      throw new Error('Cooldown must be a positive number of minutes');
    }

    console.log(`[AFTER-HOURS] Changing alert cooldown to ${minutes} minutes`);
    this.alertCooldown = minutes * 60 * 1000;
  }
}

module.exports = new AfterHoursLightsMonitor();
