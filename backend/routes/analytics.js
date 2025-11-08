// routes/analytics.js
// Analytics routes for Prometheus metrics and Grafana dashboard data

const express = require('express');
const router = express.Router();
const metricsService = require('../metricsService');
const {
  getDailyBreakdown,
  hourlyBreakdown,
  getMonthlyBreakdown,
  getYearlyBreakdown
} = require('../services/energyBreakdownService');
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

// Get monthly energy consumption chart data (last 6 months)
// NOTE: This route MUST be defined BEFORE /energy/:timeframe to avoid matching conflicts
// UPDATED: Now uses MonthlyAggregate (NEW POWER SYSTEM) with FALLBACK to match energy summary cards
router.get('/energy/monthly-chart', async (req, res) => {
  try {
    const MonthlyAggregate = require('../models/MonthlyAggregate');
    const PowerSettings = require('../models/PowerSettings');
    const Device = require('../models/Device');
    const moment = require('moment-timezone');
    const timezone = 'Asia/Kolkata';
    
    console.log('[Monthly Chart] Using NEW POWER SYSTEM (MonthlyAggregate) with FALLBACK - matches energy summary cards');
    
    // Get electricity rate from power settings (same as energy summary)
    let electricityRate = 7.0; // Default ₹7 per kWh
    try {
      const settings = await PowerSettings.findOne();
      if (settings && settings.electricityPrice) {
        electricityRate = settings.electricityPrice;
      }
    } catch (err) {
      console.log('[Monthly Chart] Using default electricity rate:', electricityRate);
    }
    
    const monthlyData = [];
    const now = new Date();
    const currentMonthNum = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    // Generate data for last 6 months
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1; // MongoDB months are 1-12
      
      // Get month name
      const monthName = targetDate.toLocaleString('default', { month: 'short', year: 'numeric' });
      
      console.log(`[Monthly Chart] Fetching ${monthName} from MonthlyAggregate (year=${year}, month=${month})`);
      
      try {
        // Get all monthly aggregates for this month (all classrooms/devices)
        const aggregates = await MonthlyAggregate.find({ 
          year: year,
          month: month
        }).lean();
        
        let totalConsumption = 0;
        let totalCost = 0;
        let usedFallback = false;
        
        if (aggregates.length === 0) {
          // FALLBACK: No aggregates found - use calculatePreciseEnergyConsumption (same as energy summary)
          console.log(`[Monthly Chart] ${monthName}: No aggregates found, using FALLBACK calculation`);
          usedFallback = true;
          
          const monthStartMoment = moment().tz(timezone).year(year).month(month - 1).startOf('month');
          const monthEndMoment = moment().tz(timezone).year(year).month(month - 1).endOf('month');
          
          // If it's a future month, skip
          if (monthStartMoment.isAfter(moment().tz(timezone))) {
            console.log(`[Monthly Chart] ${monthName}: Future month, skipping`);
            monthlyData.push({ month: monthName, consumption: 0, cost: 0 });
            continue;
          }
          
          // If it's current month, only calculate up to now
          const endDate = (month === currentMonthNum && year === currentYear) 
            ? new Date() 
            : monthEndMoment.toDate();
          
          const devices = await Device.find({}, { switches: 1, status: 1, onlineSince: 1, classroom: 1, name: 1 }).lean();
          
          // Calculate consumption for each day in the month
          const daysInRange = Math.min(monthEndMoment.date(), moment(endDate).date());
          
          for (const device of devices) {
            let deviceConsumption = 0;
            
            // Use calculatePreciseEnergyConsumption for each device
            const { calculatePreciseEnergyConsumption, calculateDevicePowerConsumption, calculateOfflineDevicePowerConsumption } = require('../metricsService');
            
            deviceConsumption = await calculatePreciseEnergyConsumption(
              device._id,
              monthStartMoment.toDate(),
              endDate
            );
            
            // If no consumption from ActivityLog and device is offline with active switches, estimate
            if (deviceConsumption === 0 && device.status === 'offline') {
              const activeSwitches = device.switches.filter(s => s.state === true);
              if (activeSwitches.length > 0) {
                const devicePower = calculateOfflineDevicePowerConsumption(device);
                if (devicePower > 0) {
                  // Estimate for this month
                  const hoursInMonth = daysInRange * 24;
                  deviceConsumption = (devicePower * hoursInMonth) / 1000;
                  console.log(`[Monthly Chart] ${monthName} - ${device.name}: Offline estimation ${devicePower}W × ${hoursInMonth}h = ${deviceConsumption.toFixed(3)} kWh`);
                }
              }
            }
            
            if (deviceConsumption > 0) {
              totalConsumption += deviceConsumption;
              console.log(`[Monthly Chart] ${monthName} - ${device.name}: ${deviceConsumption.toFixed(3)} kWh`);
            }
          }
          
          totalCost = totalConsumption * electricityRate;
        } else {
          // Use aggregates (NEW POWER SYSTEM)
          for (const agg of aggregates) {
            const kwh = (agg.total_kwh || agg.total_wh / 1000 || 0);
            totalConsumption += kwh;
            totalCost += (agg.cost_at_calc_time || (kwh * electricityRate));
          }
        }
        
        console.log(`[Monthly Chart] ${monthName}: ${totalConsumption.toFixed(3)} kWh, ₹${totalCost.toFixed(2)} (${aggregates.length} aggregates, fallback=${usedFallback})`);
        
        monthlyData.push({
          month: monthName,
          consumption: Number(totalConsumption.toFixed(2)),
          cost: Number(totalCost.toFixed(2))
        });
        
      } catch (err) {
        console.error(`[Monthly Chart] Error fetching month ${monthName}:`, err);
        // Add zero data for this month
        monthlyData.push({
          month: monthName,
          consumption: 0,
          cost: 0
        });
      }
    }
    
    console.log('[Monthly Chart] Final data (with FALLBACK):', JSON.stringify(monthlyData, null, 2));
    res.json(monthlyData);
  } catch (error) {
    console.error('[Monthly Chart] Error:', error);
    res.status(500).json({ error: 'Failed to get monthly chart data' });
  }
});

// Get energy consumption data (with timeframe parameter)
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

// NEW: Detailed daily breakdown (classroom/device filters)
// /api/analytics/energy-breakdown/daily?date=YYYY-MM-DD&classroom=lab201&deviceId=...
router.get('/energy-breakdown/daily', async (req, res) => {
  try {
    const { date, classroom, deviceId } = req.query;
    const breakdown = await getDailyBreakdown(date, classroom, deviceId);
    res.json(breakdown);
  } catch (error) {
    console.error('Error getting daily breakdown:', error);
    res.status(500).json({ error: 'Failed to get daily breakdown' });
  }
});

// NEW: Hourly breakdown for a given date (24 buckets)
router.get('/energy-breakdown/hourly', async (req, res) => {
  try {
    const { date, classroom, deviceId } = req.query;
    const hourly = await hourlyBreakdown(date, classroom, deviceId);
    res.json(hourly);
  } catch (error) {
    console.error('Error getting hourly breakdown:', error);
    res.status(500).json({ error: 'Failed to get hourly breakdown' });
  }
});

// NEW: Monthly breakdown (per-day list from MonthlyAggregate.daily_totals)
router.get('/energy-breakdown/monthly', async (req, res) => {
  try {
    const { year, month, classroom, deviceId } = req.query;
    if (!year || !month) {
      return res.status(400).json({ error: 'year and month are required' });
    }
    const monthly = await getMonthlyBreakdown(parseInt(year), parseInt(month), classroom, deviceId);
    res.json(monthly);
  } catch (error) {
    console.error('Error getting monthly breakdown:', error);
    res.status(500).json({ error: 'Failed to get monthly breakdown' });
  }
});

// NEW: Yearly breakdown (per-month totals aggregated)
router.get('/energy-breakdown/yearly', async (req, res) => {
  try {
    const { year, classroom } = req.query;
    if (!year) {
      return res.status(400).json({ error: 'year is required' });
    }
    const yearly = await getYearlyBreakdown(parseInt(year), classroom);
    res.json(yearly);
  } catch (error) {
    console.error('Error getting yearly breakdown:', error);
    res.status(500).json({ error: 'Failed to get yearly breakdown' });
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

// ==============================
// Voice Control Analytics (AIML)
// ==============================

// Summary KPIs for voice usage over a time window
// GET /api/analytics/voice/summary?days=7
router.get('/voice/summary', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const ActivityLog = require('../models/ActivityLog');
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    // Fetch voice command logs
    const voiceCommands = await ActivityLog.find({
      action: 'voice_command',
      timestamp: { $gte: since }
    }, {
      userId: 1,
      deviceId: 1,
      context: 1,
      timestamp: 1
    }).lean();

    const totalCommands = voiceCommands.length;
    let successCount = 0;
    const byAssistant = {};
    const users = new Set();
    const devices = new Set();

    const perDevice = {};
    let latencyTotal = 0; let latencyCount = 0;
    for (const cmd of voiceCommands) {
      users.add(String(cmd.userId || ''));
      devices.add(String(cmd.deviceId || ''));
      const assistant = cmd.context?.assistant || 'web';
      byAssistant[assistant] = (byAssistant[assistant] || 0) + 1;
      if (cmd.context?.success === true) successCount++;
      const devId = String(cmd.deviceId || 'unknown');
      if (!perDevice[devId]) {
        perDevice[devId] = { total: 0, success: 0, failures: 0, lastCommand: cmd.timestamp, assistants: new Set(), latencySum: 0, latencyCount: 0 };
      }
      perDevice[devId].total++;
      if (cmd.context?.success === true) perDevice[devId].success++; else perDevice[devId].failures++;
      perDevice[devId].assistants.add(assistant);
      perDevice[devId].lastCommand = cmd.timestamp;
      if (typeof cmd.context?.latencyMs === 'number') {
        perDevice[devId].latencySum += cmd.context.latencyMs;
        perDevice[devId].latencyCount++;
        latencyTotal += cmd.context.latencyMs; latencyCount++;
      }
    }

    const successRate = totalCommands > 0 ? +(successCount / totalCommands * 100).toFixed(2) : 0;
    const avgLatencyMs = latencyCount > 0 ? +(latencyTotal / latencyCount).toFixed(1) : 0;

    const devicesExpanded = Object.entries(perDevice).map(([deviceId, data]) => ({
      deviceId,
      total: data.total,
      success: data.success,
      failures: data.failures,
      successRate: data.total ? +(data.success / data.total * 100).toFixed(2) : 0,
      assistants: Array.from(data.assistants),
      lastCommand: data.lastCommand,
      avgLatencyMs: data.latencyCount ? +(data.latencySum / data.latencyCount).toFixed(1) : 0
    })).sort((a,b)=>b.total - a.total);

    res.json({
      range: { days: parseInt(days) },
      totals: {
        totalCommands,
        successCount,
        successRate,
        uniqueUsers: users.has('') ? users.size - 1 : users.size,
        uniqueDevices: devices.has('') ? devices.size - 1 : devices.size,
        avgLatencyMs
      },
      byAssistant,
      devices: devicesExpanded
    });
  } catch (error) {
    console.error('Error getting voice summary:', error);
    res.status(500).json({ error: 'Failed to get voice summary' });
  }
});

// Time series of voice commands (hourly or daily)
// GET /api/analytics/voice/timeseries?granularity=hour&days=7
router.get('/voice/timeseries', async (req, res) => {
  try {
    const { granularity = 'day', days = 7 } = req.query;
    const ActivityLog = require('../models/ActivityLog');
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const logs = await ActivityLog.find({
      action: 'voice_command',
      timestamp: { $gte: since }
    }, { timestamp: 1, context: 1 }).lean();

    const buckets = {};
    const formatKey = (d) => {
      const dt = new Date(d);
      if (granularity === 'hour') {
        return dt.toISOString().slice(0, 13) + ':00:00Z'; // hour bucket
      }
      return dt.toISOString().slice(0, 10); // day bucket
    };

    for (const log of logs) {
      const key = formatKey(log.timestamp);
      if (!buckets[key]) buckets[key] = { total: 0, success: 0, latencySum: 0, latencyCount: 0 };
      buckets[key].total += 1;
      if (log.context?.success === true) buckets[key].success += 1;
      if (typeof log.context?.latencyMs === 'number') {
        buckets[key].latencySum += log.context.latencyMs;
        buckets[key].latencyCount += 1;
      }
    }

    const series = Object.keys(buckets).sort().map(k => ({
      bucket: k,
      total: buckets[k].total,
      success: buckets[k].success,
      successRate: buckets[k].total ? +(buckets[k].success / buckets[k].total * 100).toFixed(2) : 0,
      avgLatencyMs: buckets[k].latencyCount ? +(buckets[k].latencySum / buckets[k].latencyCount).toFixed(1) : 0
    }));

    res.json({ granularity, days: parseInt(days), series });
  } catch (error) {
    console.error('Error getting voice timeseries:', error);
    res.status(500).json({ error: 'Failed to get voice timeseries' });
  }
});

// Top intents (derived from actionType / desiredState)
// GET /api/analytics/voice/top-intents?limit=10&days=7
router.get('/voice/top-intents', async (req, res) => {
  try {
    const { limit = 10, days = 7 } = req.query;
    const ActivityLog = require('../models/ActivityLog');
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const logs = await ActivityLog.find({
      action: 'voice_command',
      timestamp: { $gte: since }
    }, { context: 1 }).lean();

    const intentCounts = {};
    for (const log of logs) {
      const actionType = log.context?.actionType || (log.context?.desiredState === true ? 'turn_on' : (log.context?.desiredState === false ? 'turn_off' : 'other'));
      intentCounts[actionType] = (intentCounts[actionType] || 0) + 1;
    }

    const top = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json({ days: parseInt(days), top });
  } catch (error) {
    console.error('Error getting top intents:', error);
    res.status(500).json({ error: 'Failed to get top intents' });
  }
});

// Top voice errors
// GET /api/analytics/voice/top-errors?limit=10&days=7
router.get('/voice/top-errors', async (req, res) => {
  try {
    const { limit = 10, days = 7 } = req.query;
    const ActivityLog = require('../models/ActivityLog');
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const logs = await ActivityLog.find({
      action: 'voice_command',
      timestamp: { $gte: since }
    }, { context: 1 }).lean();

    const errorCounts = {};
    for (const log of logs) {
      if (log.context?.success === false) {
        const key = log.context?.error || log.context?.message || 'Unknown error';
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      }
    }

    const top = Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json({ days: parseInt(days), top });
  } catch (error) {
    console.error('Error getting top voice errors:', error);
    res.status(500).json({ error: 'Failed to get top voice errors' });
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
  const Settings = require('../models/Settings');
    
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
    
    const settings = await Settings.findOne({}, { 'security.deviceOfflineThreshold': 1 }).lean();
    let offlineThresholdSeconds = settings?.security?.deviceOfflineThreshold;
    if (!offlineThresholdSeconds || offlineThresholdSeconds <= 0) {
      offlineThresholdSeconds = 120; // Default 2 minutes
    }
    const offlineThresholdMs = offlineThresholdSeconds * 1000;

    const uptimeStats = [];
    
    const statusActions = ['device_online', 'device_offline', 'device_connected', 'device_disconnected'];
    const onlineActions = ['device_online', 'device_connected'];
    const offlineActions = ['device_offline', 'device_disconnected'];

    const formatDuration = (seconds) => {
      if (!seconds || seconds <= 0) return '0s';
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
    
    for (const device of devices) {
      const now = new Date();
      const analysisEnd = endOfDay > now ? now : endOfDay;

      const parseDate = (value) => {
        if (!value) return null;
        if (value instanceof Date) {
          return Number.isNaN(value.getTime()) ? null : value;
        }
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      };

      const latestDate = (...values) => {
        const valid = values.map(parseDate).filter(Boolean);
        if (!valid.length) return null;
        valid.sort((a, b) => b - a);
        return valid[0];
      };

      const lastSeenDate = parseDate(device.lastSeen);
      const onlineSinceDate = parseDate(device.onlineSince);
      const offlineSinceDate = parseDate(device.offlineSince);

      const timeSinceLastSeenMs = lastSeenDate ? (now - lastSeenDate) : Infinity;
      let effectiveStatus = timeSinceLastSeenMs <= offlineThresholdMs ? 'online' : 'offline';
      if (device.status === 'offline' && !lastSeenDate) {
        effectiveStatus = 'offline';
      }
      if (device.status === 'error') {
        effectiveStatus = 'offline';
      }

      const fallbackCurrentSinceDate = effectiveStatus === 'online'
        ? (onlineSinceDate || lastSeenDate)
        : (offlineSinceDate || lastSeenDate);

      const fallbackDurationSeconds = fallbackCurrentSinceDate
        ? Math.max(0, Math.floor((now - fallbackCurrentSinceDate) / 1000))
        : 0;

      if (analysisEnd < startOfDay) {
        uptimeStats.push({
          deviceId: device._id,
          deviceName: device.name,
          onlineDuration: 0,
          offlineDuration: 0,
          lastOnlineAt: onlineSinceDate ? onlineSinceDate.toISOString() : null,
          lastOfflineAt: offlineSinceDate ? offlineSinceDate.toISOString() : null,
          totalUptime: '0s',
          totalDowntime: '0s',
          currentStatus: effectiveStatus,
          lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
          currentStatusSince: fallbackCurrentSinceDate ? fallbackCurrentSinceDate.toISOString() : null,
          currentStatusDurationSeconds: fallbackDurationSeconds,
          currentStatusDurationFormatted: formatDuration(fallbackDurationSeconds)
        });
        continue;
      }

      const lastLogBeforeDay = await ActivityLog.findOne({
        deviceId: device._id,
        action: { $in: statusActions },
        timestamp: { $lt: startOfDay }
      })
      .sort({ timestamp: -1 })
      .lean();

      const dayLogs = await ActivityLog.find({
        deviceId: device._id,
        action: { $in: statusActions },
        timestamp: { $gte: startOfDay, $lte: analysisEnd }
      })
      .sort({ timestamp: 1 })
      .lean();

      const toStatus = (action) => onlineActions.includes(action) ? 'online' : 'offline';

      let statusAtStart = lastLogBeforeDay ? toStatus(lastLogBeforeDay.action) : null;
      if (!statusAtStart) {
        if (onlineSinceDate && onlineSinceDate <= startOfDay && (!offlineSinceDate || offlineSinceDate < onlineSinceDate)) {
          statusAtStart = 'online';
        } else if (offlineSinceDate && offlineSinceDate <= startOfDay && (!onlineSinceDate || onlineSinceDate < offlineSinceDate)) {
          statusAtStart = 'offline';
        } else {
          statusAtStart = effectiveStatus;
        }
      }
      if (!statusAtStart) {
        statusAtStart = 'offline';
      }

      const events = dayLogs.map(log => ({
        time: new Date(log.timestamp),
        status: toStatus(log.action),
        source: 'activity_log'
      }));

      const addEvent = (time, status, source) => {
        const eventTime = parseDate(time);
        if (!eventTime) return;
        if (eventTime < startOfDay || eventTime > analysisEnd) return;
        if (events.some(evt => Math.abs(evt.time - eventTime) < 1000 && evt.status === status)) return;
        events.push({ time: eventTime, status, source });
      };

      addEvent(onlineSinceDate, 'online', 'device_state');
      addEvent(offlineSinceDate, 'offline', 'device_state');

      events.sort((a, b) => a.time - b.time);

      let currentTimelineStatus = statusAtStart;
      let lastTimestamp = startOfDay;
      let onlineDuration = 0;
      let offlineDuration = 0;

      for (const event of events) {
        if (event.time < lastTimestamp) {
          currentTimelineStatus = event.status;
          lastTimestamp = event.time;
          continue;
        }

        const duration = (event.time - lastTimestamp) / 1000;
        if (duration > 0) {
          if (currentTimelineStatus === 'online') {
            onlineDuration += duration;
          } else {
            offlineDuration += duration;
          }
        }

        currentTimelineStatus = event.status;
        lastTimestamp = event.time;
      }

      const remainingDuration = (analysisEnd - lastTimestamp) / 1000;
      if (remainingDuration > 0) {
        if (currentTimelineStatus === 'online') {
          onlineDuration += remainingDuration;
        } else {
          offlineDuration += remainingDuration;
        }
      }

      const lastOnlineLog = await ActivityLog.findOne({
        deviceId: device._id,
        action: { $in: onlineActions },
        timestamp: { $lte: now }
      })
      .sort({ timestamp: -1 })
      .lean();

      const lastOfflineLog = await ActivityLog.findOne({
        deviceId: device._id,
        action: { $in: offlineActions },
        timestamp: { $lte: now }
      })
      .sort({ timestamp: -1 })
      .lean();

      const lastOnlineLogDate = parseDate(lastOnlineLog?.timestamp);
      const lastOfflineLogDate = parseDate(lastOfflineLog?.timestamp);

      let currentStatusSinceDate;
      if (effectiveStatus === 'online') {
        if (onlineSinceDate) {
          currentStatusSinceDate = onlineSinceDate;
        } else if (lastOnlineLogDate && (!lastOfflineLogDate || lastOnlineLogDate >= lastOfflineLogDate)) {
          currentStatusSinceDate = lastOnlineLogDate;
        } else if (lastSeenDate) {
          currentStatusSinceDate = lastSeenDate;
        } else {
          currentStatusSinceDate = null;
        }
      } else {
        if (offlineSinceDate) {
          currentStatusSinceDate = offlineSinceDate;
        } else if (lastOfflineLogDate && (!lastOnlineLogDate || lastOfflineLogDate >= lastOnlineLogDate)) {
          currentStatusSinceDate = lastOfflineLogDate;
        } else if (lastSeenDate) {
          currentStatusSinceDate = lastSeenDate;
        } else {
          currentStatusSinceDate = null;
        }
      }

      const currentStatusDurationSeconds = currentStatusSinceDate
        ? Math.max(0, Math.floor((now - currentStatusSinceDate) / 1000))
        : 0;

      const lastOnlineAtDate = latestDate(lastOnlineLogDate, onlineSinceDate);
      const lastOfflineAtDate = latestDate(lastOfflineLogDate, offlineSinceDate);

      uptimeStats.push({
        deviceId: device._id,
        deviceName: device.name,
        onlineDuration: Math.max(0, Math.floor(onlineDuration)),
        offlineDuration: Math.max(0, Math.floor(offlineDuration)),
        lastOnlineAt: lastOnlineAtDate ? lastOnlineAtDate.toISOString() : null,
        lastOfflineAt: lastOfflineAtDate ? lastOfflineAtDate.toISOString() : null,
        totalUptime: formatDuration(onlineDuration),
        totalDowntime: formatDuration(offlineDuration),
        currentStatus: effectiveStatus,
        lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
        currentStatusSince: currentStatusSinceDate ? currentStatusSinceDate.toISOString() : null,
        currentStatusDurationSeconds,
        currentStatusDurationFormatted: formatDuration(currentStatusDurationSeconds)
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