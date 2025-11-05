// routes/analytics.js
// Analytics routes for Prometheus metrics and Grafana dashboard data

const express = require('express');
const router = express.Router();
const metricsService = require('../metricsService');
const { handleValidationErrors } = require('../middleware/validationHandler');
const { param } = require('express-validator');

// Get Prometheus metrics
router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsService.getContentType());
    res.end(await metricsService.getMetrics());
  } catch (error) {
    console.error('Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Get analytics dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const dashboardData = await metricsService.getDashboardData();
    res.json(dashboardData);
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// Get energy consumption data
router.get('/energy/:timeframe', 
  param('timeframe').isIn(['1h', '24h', '7d', '30d', '90d']).withMessage('Invalid timeframe'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { timeframe } = req.params;
    const energyData = await metricsService.getEnergyData(timeframe);
    res.json(energyData);
  } catch (error) {
    console.error('Error getting energy data:', error);
    res.status(500).json({ error: 'Failed to get energy data' });
  }
});

// Get energy consumption summary (daily and monthly totals, excluding offline devices)
router.get('/energy-summary', async (req, res) => {
  try {
    const summary = await metricsService.getEnergySummary();
    res.json(summary);
  } catch (error) {
    console.error('Error getting energy summary:', error);
    res.status(500).json({ error: 'Failed to get energy summary' });
  }
});

// Get monthly energy consumption chart data (last 6 months)
router.get('/energy/monthly-chart', async (req, res) => {
  try {
    const Device = require('../models/Device');
    const ActivityLog = require('../models/ActivityLog');
    const PowerSettings = require('../models/PowerSettings');
    
    console.log('[Monthly Chart] Starting monthly chart data calculation...');
    
    // Get electricity rate
    let electricityRate = 7.0; // Default ₹7 per kWh
    let devicePowerRatings = {
      light: 40,
      fan: 75,
      projector: 200,
      ac: 1500,
      outlet: 100,
      relay: 50
    };
    
    try {
      const settings = await PowerSettings.findOne();
      if (settings) {
        if (settings.electricityPrice) {
          electricityRate = settings.electricityPrice;
        }
        if (settings.devicePowerRatings) {
          devicePowerRatings = { ...devicePowerRatings, ...settings.devicePowerRatings };
        }
      }
    } catch (err) {
      console.log('[Monthly Chart] Using default electricity rate and power settings');
    }
    
    console.log('[Monthly Chart] Using electricity rate:', electricityRate, '₹/kWh');
    
    const monthlyData = [];
    const now = new Date();
    
    // Generate data for last 6 months
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth();
      
      // Calculate start and end of month
      const startOfMonth = new Date(year, month, 1);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
      
      // Get month name
      const monthName = targetDate.toLocaleString('default', { month: 'short', year: 'numeric' });
      
      console.log(`[Monthly Chart] Processing ${monthName} (${startOfMonth.toISOString()} to ${endOfMonth.toISOString()})`);
      
      try {
        let totalConsumption = 0;
        
        // Get all devices
        const devices = await Device.find({}).lean();
        console.log(`[Monthly Chart] Found ${devices.length} devices for ${monthName}`);
        
        // Calculate consumption for each device using ActivityLog
        for (const device of devices) {
          for (const sw of device.switches || []) {
            // Get all ON logs for this switch in this month
            const onLogs = await ActivityLog.find({
              deviceId: device._id,
              switchId: sw.id,
              action: 'on',
              timestamp: { $gte: startOfMonth, $lte: endOfMonth }
            }).sort({ timestamp: 1 }).lean();
            
            if (onLogs.length > 0) {
              console.log(`[Monthly Chart] Device ${device.name}, Switch ${sw.name}: Found ${onLogs.length} ON events in ${monthName}`);
            }
            
            // Calculate total ON duration
            for (const onLog of onLogs) {
              const onTime = new Date(onLog.timestamp);
              
              // Find the next OFF log after this ON
              const offLog = await ActivityLog.findOne({
                deviceId: device._id,
                switchId: sw.id,
                action: 'off',
                timestamp: { $gt: onTime, $lte: endOfMonth }
              }).sort({ timestamp: 1 }).lean();
              
              let offTime;
              if (offLog) {
                offTime = new Date(offLog.timestamp);
              } else {
                // If still on at end of month, use end of month
                // or current time if it's the current month
                if (month === now.getMonth() && year === now.getFullYear()) {
                  // Check if switch is currently on
                  const currentDevice = await Device.findById(device._id);
                  const currentSwitch = currentDevice?.switches.find(s => s.id === sw.id);
                  if (currentSwitch && currentSwitch.state) {
                    offTime = now;
                  } else {
                    continue; // Skip if we can't find matching OFF
                  }
                } else {
                  offTime = endOfMonth;
                }
              }
              
              // Calculate duration in hours
              const durationMs = offTime.getTime() - onTime.getTime();
              const durationHours = durationMs / (1000 * 60 * 60);
              
              // Get power rating for this switch type
              const powerRating = devicePowerRatings[sw.type] || devicePowerRatings.relay || 50;
              
              // Calculate consumption in kWh
              const consumption = (durationHours * powerRating) / 1000;
              totalConsumption += consumption;
              
              if (consumption > 0) {
                console.log(`[Monthly Chart] ${device.name} - ${sw.name}: ${durationHours.toFixed(2)}h × ${powerRating}W = ${consumption.toFixed(4)} kWh`);
              }
            }
          }
        }
        
        // Calculate cost
        const totalCost = totalConsumption * electricityRate;
        
        console.log(`[Monthly Chart] ${monthName} Total: ${totalConsumption.toFixed(2)} kWh, ₹${totalCost.toFixed(2)}`);
        
        monthlyData.push({
          month: monthName,
          consumption: Number(totalConsumption.toFixed(2)),
          cost: Number(totalCost.toFixed(2))
        });
        
      } catch (err) {
        console.error(`[Monthly Chart] Error calculating month ${monthName}:`, err);
        // Add zero data for this month
        monthlyData.push({
          month: monthName,
          consumption: 0,
          cost: 0
        });
      }
    }
    
    console.log('[Monthly Chart] Final data:', JSON.stringify(monthlyData, null, 2));
    res.json(monthlyData);
  } catch (error) {
    console.error('[Monthly Chart] Error:', error);
    res.status(500).json({ error: 'Failed to get monthly chart data' });
  }
});

// Get energy calendar view data (daily breakdown for a specific month)
router.get('/energy-calendar/:year/:month', 
  param('year').isInt({ min: 2020, max: 2100 }).withMessage('Invalid year'),
  param('month').isInt({ min: 1, max: 12 }).withMessage('Invalid month'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { year, month } = req.params;
    const calendarData = await metricsService.getEnergyCalendar(parseInt(year), parseInt(month));
    res.json(calendarData);
  } catch (error) {
    console.error('Error getting energy calendar data:', error);
    res.status(500).json({ error: 'Failed to get energy calendar data' });
  }
});

// Get device health data
router.get('/health/:deviceId?', 
  param('deviceId').optional().isMongoId().withMessage('Invalid device ID'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { deviceId } = req.params;
    const healthData = await metricsService.getDeviceHealth(deviceId);
    res.json(healthData);
  } catch (error) {
    console.error('Error getting device health data:', error);
    res.status(500).json({ error: 'Failed to get device health data' });
  }
});

// Get occupancy data
router.get('/occupancy/:classroomId?', 
  param('classroomId').optional().isString().isLength({ min: 1 }).withMessage('Invalid classroom ID'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { classroomId } = req.params;
    const occupancyData = await metricsService.getOccupancyData(classroomId);
    res.json(occupancyData);
  } catch (error) {
    console.error('Error getting occupancy data:', error);
    res.status(500).json({ error: 'Failed to get occupancy data' });
  }
});

// Get anomaly history
router.get('/anomalies/:timeframe?', 
  param('timeframe').optional().isIn(['1h', '24h', '7d', '30d']).withMessage('Invalid timeframe'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { timeframe = '7d' } = req.params;
    const anomalyData = await metricsService.getAnomalyHistory(timeframe);
    res.json(anomalyData);
  } catch (error) {
    console.error('Error getting anomaly data:', error);
    res.status(500).json({ error: 'Failed to get anomaly data' });
  }
});

// Get forecasting data
router.get('/forecast/:type/:timeframe', 
  param('type').isIn(['energy', 'occupancy', 'health']).withMessage('Invalid forecast type'),
  param('timeframe').isIn(['1h', '24h', '7d', '30d']).withMessage('Invalid timeframe'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { type, timeframe } = req.params;
    const forecastData = await metricsService.getForecastData(type, timeframe);
    res.json(forecastData);
  } catch (error) {
    console.error('Error getting forecast data:', error);
    res.status(500).json({ error: 'Failed to get forecast data' });
  }
});

// Get predictive maintenance data
router.get('/predictive-maintenance', async (req, res) => {
  try {
    const maintenanceData = await metricsService.getPredictiveMaintenance();
    res.json(maintenanceData);
  } catch (error) {
    console.error('Error getting predictive maintenance data:', error);
    res.status(500).json({ error: 'Failed to get predictive maintenance data' });
  }
});

// Get real-time metrics for Grafana-style dashboard
router.get('/realtime-metrics', async (req, res) => {
  try {
    const realtimeData = await metricsService.getRealtimeMetrics();
    res.json(realtimeData);
  } catch (error) {
    console.error('Error getting realtime metrics:', error);
    res.status(500).json({ error: 'Failed to get realtime metrics' });
  }
});

// Get comparative analytics
router.get('/comparative/:period1/:period2', async (req, res) => {
  try {
    const { period1, period2 } = req.params;
    const comparativeData = await metricsService.getComparativeAnalytics(period1, period2);
    res.json(comparativeData);
  } catch (error) {
    console.error('Error getting comparative analytics:', error);
    res.status(500).json({ error: 'Failed to get comparative analytics' });
  }
});

// Get efficiency metrics
router.get('/efficiency/:timeframe', async (req, res) => {
  try {
    const { timeframe } = req.params;
    const efficiencyData = await metricsService.getEfficiencyMetrics(timeframe);
    res.json(efficiencyData);
  } catch (error) {
    console.error('Error getting efficiency metrics:', error);
    res.status(500).json({ error: 'Failed to get efficiency metrics' });
  }
});

// Get device usage patterns
router.get('/device-usage/:timeframe', 
  param('timeframe').isIn(['1h', '24h', '7d', '30d']).withMessage('Invalid timeframe'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { timeframe } = req.params;
    const usageData = await metricsService.getDeviceUsageData(timeframe);
    res.json(usageData);
  } catch (error) {
    console.error('Error getting device usage data:', error);
    res.status(500).json({ error: 'Failed to get device usage data' });
  }
});

// Get matrix-based classroom power analytics
router.get('/classroom-power-matrix/:timeframe?', 
  param('timeframe').optional().isIn(['1h', '24h', '7d', '30d']).withMessage('Invalid timeframe'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { timeframe = '24h' } = req.params;
    const matrixAnalytics = await metricsService.getClassroomPowerMatrixAnalytics(timeframe);
    res.json(matrixAnalytics);
  } catch (error) {
    console.error('Error getting matrix-based classroom analytics:', error);
    res.status(500).json({ error: 'Failed to get matrix-based classroom analytics' });
  }
});

// Get behavioral analysis data
router.get('/behavioral-analysis/:deviceId?', 
  param('deviceId').optional().isMongoId().withMessage('Invalid device ID'),
  handleValidationErrors,
  async (req, res) => {
  try {
    const { deviceId } = req.params;
    // Use ActivityLog for behavioral analysis
    const ActivityLog = require('../models/ActivityLog');
    
    let query = {};
    if (deviceId) {
      query.deviceId = deviceId;
    }
    
    const activities = await ActivityLog.find(query)
      .sort({ timestamp: -1 })
      .limit(1000)
      .lean();
    
    // Analyze patterns
    const patterns = {
      totalActivities: activities.length,
      byAction: {},
      byHour: new Array(24).fill(0),
      byDay: {},
      mostActiveDevice: null,
      peakHours: [],
      usagePatterns: []
    };
    
    activities.forEach(activity => {
      // Count by action
      if (!patterns.byAction[activity.action]) {
        patterns.byAction[activity.action] = 0;
      }
      patterns.byAction[activity.action]++;
      
      // Count by hour
      const hour = new Date(activity.timestamp).getHours();
      patterns.byHour[hour]++;
      
      // Count by day
      const day = new Date(activity.timestamp).toDateString();
      if (!patterns.byDay[day]) {
        patterns.byDay[day] = 0;
      }
      patterns.byDay[day]++;
    });
    
    // Find peak hours
    const avgHourlyActivity = patterns.byHour.reduce((a, b) => a + b, 0) / 24;
    patterns.peakHours = patterns.byHour
      .map((count, hour) => ({ hour, count }))
      .filter(item => item.count > avgHourlyActivity * 1.5)
      .map(item => item.hour);
    
    res.json(patterns);
  } catch (error) {
    console.error('Error getting behavioral analysis data:', error);
    res.status(500).json({ error: 'Failed to get behavioral analysis data' });
  }
});

// Get energy history for AI/ML forecasting
router.get('/energy-history', async (req, res) => {
  try {
    const { deviceId, days = 7 } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required' });
    }
    
    const Device = require('../models/Device');
    const PowerConsumptionLog = require('../models/PowerConsumptionLog');
    
    // Verify device exists
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // Get power consumption logs from last N days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const logs = await PowerConsumptionLog.find({
      deviceId: deviceId,
      timestamp: { $gte: startDate }
    }).sort({ timestamp: 1 }).lean();
    
    // Format for AI service
    const history = logs.map(log => ({
      timestamp: log.timestamp,
      consumption: log.totalPowerUsage || 0,
      voltage: log.voltage || 0,
      current: log.current || 0,
      switches: log.switchData || []
    }));
    
    res.json(history);
    
  } catch (error) {
    console.error('Error fetching energy history:', error);
    res.status(500).json({ message: 'Error fetching energy history', error: error.message });
  }
});

// Get device uptime/downtime statistics
router.get('/device-uptime', async (req, res) => {
  try {
    const { date, deviceId } = req.query;
    const ActivityLog = require('../models/ActivityLog');
    const Device = require('../models/Device');
    
    // Parse date or use today
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Get devices to track
    let devices = [];
    if (deviceId) {
      const device = await Device.findById(deviceId);
      if (device) devices = [device];
    } else {
      devices = await Device.find({});
    }
    
    const uptimeStats = [];
    
    for (const device of devices) {
      // Get all status change logs for this device on this date
      const statusLogs = await ActivityLog.find({
        deviceId: device._id,
        action: { $in: ['device_online', 'device_offline', 'device_connected', 'device_disconnected'] },
        timestamp: { $gte: startOfDay, $lte: endOfDay }
      }).sort({ timestamp: 1 }).lean();
      
      let onlineDuration = 0;
      let offlineDuration = 0;
      let lastStatus = device.status === 'online' ? 'online' : 'offline';
      let lastTimestamp = startOfDay;
      let lastOnlineAt = device.status === 'online' && device.lastSeen ? device.lastSeen : null;
      let lastOfflineAt = device.status === 'offline' && device.lastSeen ? device.lastSeen : null;
      
      // ALWAYS calculate based on MOST RECENT status change (ignore daily boundaries)
      // This ensures continuous uptime/downtime tracking across multiple days
      if (true) { // Force this path for all devices
        const now = new Date();
        const currentTime = now; // Use actual current time, not limited by endOfDay
        
        // Find the MOST RECENT status change event (from any time) to determine when status actually changed
        const lastStatusChangeLog = await ActivityLog.findOne({
          deviceId: device._id,
          action: { $in: ['device_online', 'device_connected', 'device_offline', 'device_disconnected'] },
          timestamp: { $lte: currentTime } // Look for any status change up to now
        })
        .sort({ timestamp: -1 })
        .limit(1);
        
        if (lastStatusChangeLog) {
          // Use the timestamp when status actually changed (not lastSeen heartbeat)
          const statusChangeDate = new Date(lastStatusChangeLog.timestamp);
          const isOnlineAction = lastStatusChangeLog.action === 'device_online' || lastStatusChangeLog.action === 'device_connected';
          
          // Verify that the log action matches current device status
          if ((device.status === 'online' && isOnlineAction) || (device.status === 'offline' && !isOnlineAction)) {
            // Status matches - use this as the authoritative timestamp
            // CALCULATE TOTAL CONTINUOUS UPTIME/DOWNTIME FROM ACTUAL STATUS CHANGE TIME
            
            if (device.status === 'online') {
              // Device came online at statusChangeDate - calculate TOTAL time online
              onlineDuration = (currentTime - statusChangeDate) / 1000;
              lastOnlineAt = lastStatusChangeLog.timestamp;
              
              // Don't calculate offlineDuration - device is currently ONLINE
              // onlineDuration already contains the total time online from statusChangeDate
            } else {
              // Device went offline at statusChangeDate - calculate TOTAL time offline
              offlineDuration = (currentTime - statusChangeDate) / 1000;
              lastOfflineAt = lastStatusChangeLog.timestamp;
              
              // Don't calculate onlineDuration - device is currently OFFLINE
              // offlineDuration already contains the total time offline from statusChangeDate
            }
          } else {
            // Status mismatch - the log doesn't match current status
            // This means there might be a status change we don't have logged yet
            // Fall back to device.lastSeen cautiously
            if (device.lastSeen) {
              const lastSeenDate = new Date(device.lastSeen);
              
              if (device.status === 'online') {
                if (lastSeenDate < startOfDay) {
                  onlineDuration = (currentTime - startOfDay) / 1000;
                  lastOnlineAt = startOfDay.toISOString();
                } else if (lastSeenDate >= startOfDay && lastSeenDate <= currentTime) {
                  offlineDuration = (lastSeenDate - startOfDay) / 1000;
                  onlineDuration = (currentTime - lastSeenDate) / 1000;
                  lastOnlineAt = device.lastSeen;
                }
              } else {
                if (lastSeenDate < startOfDay) {
                  offlineDuration = (currentTime - startOfDay) / 1000;
                  lastOfflineAt = startOfDay.toISOString();
                } else if (lastSeenDate >= startOfDay && lastSeenDate <= currentTime) {
                  onlineDuration = (lastSeenDate - startOfDay) / 1000;
                  offlineDuration = (currentTime - lastSeenDate) / 1000;
                  lastOfflineAt = device.lastSeen;
                }
              }
            } else {
              // Absolute fallback
              const totalDuration = (currentTime - startOfDay) / 1000;
              if (device.status === 'online') {
                onlineDuration = totalDuration;
                lastOnlineAt = startOfDay.toISOString();
              } else {
                offlineDuration = totalDuration;
                lastOfflineAt = startOfDay.toISOString();
              }
            }
          }
        } else {
          // No status change logs found at all - use device.lastSeen as fallback
          if (device.lastSeen) {
            const lastSeenDate = new Date(device.lastSeen);
            
            if (device.status === 'online') {
              // Device is currently online
              if (lastSeenDate < startOfDay) {
                // Device has been online since before this day started
                onlineDuration = (currentTime - startOfDay) / 1000;
                lastOnlineAt = startOfDay.toISOString();
              } else if (lastSeenDate >= startOfDay && lastSeenDate <= currentTime) {
                // Device came online during this day
                offlineDuration = (lastSeenDate - startOfDay) / 1000;
                onlineDuration = (currentTime - lastSeenDate) / 1000;
                lastOnlineAt = device.lastSeen;
              }
            } else {
              // Device is currently offline
              if (lastSeenDate < startOfDay) {
                // Device has been offline since before this day started
                offlineDuration = (currentTime - startOfDay) / 1000;
                lastOfflineAt = startOfDay.toISOString();
              } else if (lastSeenDate >= startOfDay && lastSeenDate <= currentTime) {
                // Device went offline during this day
                onlineDuration = (lastSeenDate - startOfDay) / 1000;
                offlineDuration = (currentTime - lastSeenDate) / 1000;
                lastOfflineAt = device.lastSeen;
              }
            }
          } else {
            // No lastSeen timestamp, assume current status for entire day
            const totalDuration = (currentTime - startOfDay) / 1000;
            
            if (device.status === 'online') {
              onlineDuration = totalDuration;
              lastOnlineAt = startOfDay.toISOString();
            } else {
              offlineDuration = totalDuration;
              lastOfflineAt = startOfDay.toISOString();
            }
          }
        }
      } else {
        // Process logs if they exist
        statusLogs.forEach(log => {
          const duration = (new Date(log.timestamp) - lastTimestamp) / 1000; // in seconds
          
          if (lastStatus === 'online') {
            onlineDuration += duration;
          } else {
            offlineDuration += duration;
          }
          
          // Update status based on action
          if (log.action === 'device_online' || log.action === 'device_connected') {
            lastStatus = 'online';
            lastOnlineAt = log.timestamp;
          } else {
            lastStatus = 'offline';
            lastOfflineAt = log.timestamp;
          }
          
          lastTimestamp = new Date(log.timestamp);
        });
        
        // Add duration from last log to current time (or end of day)
        const now = new Date();
        const currentTime = now > endOfDay ? endOfDay : now;
        const remainingDuration = (currentTime - lastTimestamp) / 1000;
        
        if (lastStatus === 'online') {
          onlineDuration += remainingDuration;
        } else {
          offlineDuration += remainingDuration;
        }
      }
      
      // Format durations
      const formatDuration = (seconds) => {
        if (seconds < 60) return `${Math.floor(seconds)}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
        if (seconds < 86400) {
          const hours = Math.floor(seconds / 3600);
          const mins = Math.floor((seconds % 3600) / 60);
          return `${hours}h ${mins}m`;
        }
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        return `${days}d ${hours}h`;
      };
      
      uptimeStats.push({
        deviceId: device._id,
        deviceName: device.name,
        onlineDuration: Math.floor(onlineDuration),
        offlineDuration: Math.floor(offlineDuration),
        lastOnlineAt: lastOnlineAt || 'N/A',
        lastOfflineAt: lastOfflineAt || 'N/A',
        totalUptime: formatDuration(onlineDuration),
        totalDowntime: formatDuration(offlineDuration),
        currentStatus: device.status,
        lastSeen: device.lastSeen || null
      });
    }
    
    res.json({ uptimeStats });
  } catch (error) {
    console.error('Error getting device uptime stats:', error);
    res.status(500).json({ error: 'Failed to get device uptime statistics' });
  }
});

// Get switch on/off statistics
router.get('/switch-stats', async (req, res) => {
  try {
    const { date, deviceId } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ error: 'Device ID is required' });
    }
    
    const ActivityLog = require('../models/ActivityLog');
    const Device = require('../models/Device');
    
    // Parse date or use today
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Get device
    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    const switchStats = [];
    
    // Process each switch
    if (device.switches && device.switches.length > 0) {
      for (const switchItem of device.switches) {
        // Get all switch toggle logs for this switch on this date
        const switchLogs = await ActivityLog.find({
          deviceId: device._id,
          action: { $in: ['on', 'off'] }, // Actions are 'on'/'off', not 'switch_on'/'switch_off'
          switchId: switchItem._id, // Switch logs use switchId field, not details.switchId
          timestamp: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ timestamp: 1 }).lean();
        
        let onDuration = 0;
        let offDuration = 0;
        let toggleCount = switchLogs.length;
        let lastState = switchItem.state ? 'on' : 'off';
        let currentState = switchItem.state ? 'on' : 'off'; // Current state
        let lastTimestamp = startOfDay;
        let lastOnAt = null;
        let lastOffAt = null;
        let lastStateChangeAt = null; // When did current state start
        
        // ALWAYS find the most recent switch log (from any time, not just today)
        // This ensures we have accurate "when did current state start" information
        const mostRecentLog = await ActivityLog.findOne({
          deviceId: device._id,
          action: { $in: ['on', 'off'] }, // Actions are 'on'/'off', not 'switch_on'/'switch_off'
          switchId: switchItem._id // Switch logs use switchId field, not details.switchId
        }).sort({ timestamp: -1 }).limit(1).lean();
        
        // If no logs exist FOR TODAY, calculate based on current switch state
        if (switchLogs.length === 0) {
          const now = new Date();
          const currentTime = now; // Use actual current time for continuous tracking
          
          // Determine when current state started
          let stateStartTime = startOfDay;
          
          if (mostRecentLog) {
            const mostRecentLogDate = new Date(mostRecentLog.timestamp);
            const mostRecentLogAction = mostRecentLog.action;
            
            // Check if most recent log matches current state
            const logStateIsOn = mostRecentLogAction === 'on'; // Action is 'on', not 'switch_on'
            const currentStateIsOn = switchItem.state;
            
            if (logStateIsOn === currentStateIsOn) {
              // Most recent log matches current state - use it as start time
              stateStartTime = mostRecentLogDate;
              
              if (currentStateIsOn) {
                lastOnAt = mostRecentLog.timestamp;
              } else {
                lastOffAt = mostRecentLog.timestamp;
              }
            } else {
              // State changed since last log, but no log recorded
              // This shouldn't happen, but fall back to startOfDay
              stateStartTime = startOfDay;
            }
          }
          
          // Calculate duration from when state actually started
          const stateDuration = (currentTime - stateStartTime) / 1000;
          
          if (switchItem.state) {
            // Switch is currently ON
            onDuration = stateDuration;
            if (!lastOnAt) lastOnAt = stateStartTime.toISOString();
            lastStateChangeAt = stateStartTime.toISOString();
            
            // If state started before today, add offline time from midnight to start of day
            if (stateStartTime < startOfDay) {
              // Was already ON at midnight, so today's ON time is from midnight to now
              onDuration = (currentTime - startOfDay) / 1000;
              lastStateChangeAt = startOfDay.toISOString(); // Show as "since midnight"
            }
          } else {
            // Switch is currently OFF
            offDuration = stateDuration;
            if (!lastOffAt) lastOffAt = stateStartTime.toISOString();
            lastStateChangeAt = stateStartTime.toISOString();
            
            // If state started before today, add offline time from midnight to start of day
            if (stateStartTime < startOfDay) {
              // Was already OFF at midnight, so today's OFF time is from midnight to now
              offDuration = (currentTime - startOfDay) / 1000;
              lastStateChangeAt = startOfDay.toISOString(); // Show as "since midnight"
            }
          }
        } else {
          // Process each toggle
          switchLogs.forEach(log => {
            const duration = (new Date(log.timestamp) - lastTimestamp) / 1000; // in seconds
            
            if (lastState === 'on') {
              onDuration += duration;
            } else {
              offDuration += duration;
            }
            
            // Update state (actions are 'on'/'off', not 'switch_on'/'switch_off')
            if (log.action === 'on') {
              lastState = 'on';
              lastOnAt = log.timestamp;
            } else {
              lastState = 'off';
              lastOffAt = log.timestamp;
            }
            
            lastTimestamp = new Date(log.timestamp);
          });
          
          // Add duration from last log to current time
          const now = new Date();
          const currentTime = now; // Use actual current time for continuous tracking
          const remainingDuration = (currentTime - lastTimestamp) / 1000;
          
          if (lastState === 'on') {
            onDuration += remainingDuration;
            lastStateChangeAt = lastOnAt; // When switch turned ON last time
          } else {
            offDuration += remainingDuration;
            lastStateChangeAt = lastOffAt; // When switch turned OFF last time
          }
        }
        
        // Format durations
        const formatDuration = (seconds) => {
          if (seconds < 60) return `${Math.floor(seconds)}s`;
          if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
          if (seconds < 86400) {
            const hours = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${mins}m`;
          }
          const days = Math.floor(seconds / 86400);
          const hours = Math.floor((seconds % 86400) / 3600);
          return `${days}d ${hours}h`;
        };
        
        switchStats.push({
          switchId: switchItem.id,
          switchName: switchItem.name,
          onDuration: Math.floor(onDuration),
          offDuration: Math.floor(offDuration),
          toggleCount,
          lastOnAt: lastOnAt || 'N/A',
          lastOffAt: lastOffAt || 'N/A',
          lastStateChangeAt: lastStateChangeAt || 'N/A', // When current state started
          totalOnTime: formatDuration(onDuration),
          totalOffTime: formatDuration(offDuration),
          currentState: switchItem.state, // true = ON, false = OFF
          currentStateDuration: formatDuration(switchItem.state ? onDuration : offDuration) // Duration in current state
        });
      }
    }
    
    // Add device status and last seen information
    const deviceStatus = {
      status: device.status, // 'online' or 'offline'
      lastSeen: device.lastSeen,
      name: device.name
    };
    
    res.json({ 
      switchStats,
      deviceStatus // Include device status so frontend can show warning if offline
    });
  } catch (error) {
    console.error('Error getting switch stats:', error);
    res.status(500).json({ error: 'Failed to get switch statistics' });
  }
});

module.exports = router;