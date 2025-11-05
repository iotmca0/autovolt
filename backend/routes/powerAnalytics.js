const express = require('express');
const router = express.Router();
const DeviceConsumptionLedger = require('../models/DeviceConsumptionLedger');
const DailyAggregate = require('../models/DailyAggregate');
const MonthlyAggregate = require('../models/MonthlyAggregate');
const CostVersion = require('../models/CostVersion');
const TelemetryEvent = require('../models/TelemetryEvent');
const aggregationService = require('../services/aggregationService');
const { auth } = require('../middleware/auth');

// Apply authentication to all routes except health
router.use((req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  auth(req, res, next);
});

/**
 * GET /api/power-analytics/summary
 * Get daily summary for a classroom
 */
router.get('/summary', async (req, res) => {
  try {
    const { classroom, date } = req.query;
    
    if (!classroom) {
      return res.status(400).json({ error: 'classroom is required' });
    }
    
    const targetDate = date ? new Date(date) : new Date();
    const dateString = aggregationService.getLocalDateString(targetDate);

    const isToday = dateString === aggregationService.getLocalDateString(new Date());

    // Get from daily aggregates
    let aggregates = await DailyAggregate.find({
      classroom,
      date_string: dateString
    });
    
    // If no data exists, or if we are requesting today's data, re-run aggregation.
    if (aggregates.length === 0 || isToday) {
      // Try to aggregate now
      await aggregationService.aggregateDaily(targetDate, classroom);
      aggregates = await DailyAggregate.find({
        classroom,
        date_string: dateString
      });
      
      if (aggregates.length === 0) {
        return res.json({
          classroom,
          date: dateString,
          total_wh: 0,
          total_kwh: 0,
          total_cost: 0,
          on_time_hours: 0,
          devices: []
        });
      }
    }
    
    res.json(formatSummary(classroom, dateString, aggregates));
    
  } catch (error) {
    console.error('[PowerAnalytics] Error getting summary:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function formatSummary(classroom, dateString, aggregates) {
  const totalWh = aggregates.reduce((sum, a) => sum + a.total_wh, 0);
  const totalCost = aggregates.reduce((sum, a) => sum + a.cost_at_calc_time, 0);
  const totalOnTimeSec = aggregates.reduce((sum, a) => sum + a.on_time_sec, 0);
  
  return {
    classroom,
    date: dateString,
    total_wh: totalWh,
    total_kwh: totalWh / 1000,
    total_cost: totalCost,
    on_time_hours: totalOnTimeSec / 3600,
    devices: aggregates.map(a => ({
      device_id: a.device_id,
      esp32_name: a.esp32_name,
      total_wh: a.total_wh,
      total_kwh: a.total_kwh,
      cost: a.cost_at_calc_time,
      on_time_hours: a.on_time_sec / 3600,
      quality: a.quality_summary
    }))
  };
}

/**
 * GET /api/power-analytics/timeline
 * Get time-series consumption data for charts
 */
router.get('/timeline', async (req, res) => {
  try {
    const { classroom, start, end, bucket = 60 } = req.query;
    
    if (!classroom || !start || !end) {
      return res.status(400).json({ error: 'classroom, start, and end are required' });
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    const bucketMinutes = parseInt(bucket);
    
    const timeline = await DeviceConsumptionLedger.getTimeline(
      classroom,
      startDate,
      endDate,
      bucketMinutes
    );
    
    res.json({
      classroom,
      start: startDate,
      end: endDate,
      bucket_minutes: bucketMinutes,
      data_points: timeline.length,
      timeline
    });
    
  } catch (error) {
    console.error('[PowerAnalytics] Error getting timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/power-analytics/device-breakdown
 * Get per-device consumption breakdown
 */
router.get('/device-breakdown', async (req, res) => {
  try {
    const { classroom, date } = req.query;
    
    if (!classroom) {
      return res.status(400).json({ error: 'classroom is required' });
    }
    
    const targetDate = date ? new Date(date) : new Date();
    const dateString = aggregationService.getLocalDateString(targetDate);
    
    const devices = await DailyAggregate.getDeviceBreakdown(classroom, dateString);
    
    res.json({
      classroom,
      date: dateString,
      device_count: devices.length,
      devices: devices.map(d => ({
        device_id: d.device_id,
        esp32_name: d.esp32_name,
        total_wh: d.total_wh,
        total_kwh: d.total_kwh,
        cost: d.cost_at_calc_time,
        on_time_hours: d.on_time_sec / 3600,
        quality: d.quality_summary
      }))
    });
    
  } catch (error) {
    console.error('[PowerAnalytics] Error getting device breakdown:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/power-analytics/monthly
 * Get monthly consumption data
 */
router.get('/monthly', async (req, res) => {
  try {
    const { classroom, year, month } = req.query;
    
    if (!classroom || !year || !month) {
      return res.status(400).json({ error: 'classroom, year, and month are required' });
    }
    
    const y = parseInt(year);
    const m = parseInt(month);
    const monthString = `${y}-${String(m).padStart(2, '0')}`;
    
    const today = new Date();
    const isCurrentMonth = y === today.getFullYear() && m === (today.getMonth() + 1);

    // Get from monthly aggregates
    let aggregates = await MonthlyAggregate.find({
      classroom,
      month_string: monthString
    });
    
    // If no data exists, or if we are requesting the current month, re-run aggregation.
    if (aggregates.length === 0 || isCurrentMonth) {
      // Try to aggregate now
      await aggregationService.aggregateMonthly(y, m, classroom);
      aggregates = await MonthlyAggregate.find({
        classroom,
        month_string: monthString
      });
    }
    
    const totalWh = aggregates.reduce((sum, a) => sum + a.total_wh, 0);
    const totalCost = aggregates.reduce((sum, a) => sum + a.cost_at_calc_time, 0);
    const totalOnTimeSec = aggregates.reduce((sum, a) => sum + a.on_time_sec, 0);
    
    res.json({
      classroom,
      year: y,
      month: m,
      month_string: monthString,
      total_wh: totalWh,
      total_kwh: totalWh / 1000,
      total_cost: totalCost,
      on_time_hours: totalOnTimeSec / 3600,
      devices: aggregates.map(a => ({
        device_id: a.device_id,
        esp32_name: a.esp32_name,
        total_wh: a.total_wh,
        total_kwh: a.total_kwh,
        cost: a.cost_at_calc_time,
        on_time_hours: a.on_time_sec / 3600,
        daily_totals: a.daily_totals,
        quality: a.quality_summary
      }))
    });
    
  } catch (error) {
    console.error('[PowerAnalytics] Error getting monthly data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/power-analytics/calendar
 * Get all daily aggregates for a given month, for populating a calendar view.
 */
router.get('/calendar', async (req, res) => {
  try {
    const { classroom, year, month } = req.query;

    if (!classroom || !year || !month) {
      return res.status(400).json({ error: 'classroom, year, and month are required' });
    }

    const y = parseInt(year);
    const m = parseInt(month);

    // 1. Force a monthly aggregation to ensure all daily data for the month is up-to-date.
    // This is crucial for consistency.
    await aggregationService.aggregateMonthly(y, m, classroom);

    // 2. Fetch all daily aggregate records for the specified month.
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0); // Last day of the month

    const dailyRecords = await DailyAggregate.find({
      classroom,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    }).sort({ date: 1 });

    // 3. Group the records by date string for easy consumption by the frontend calendar.
    const calendarData = dailyRecords.reduce((acc, record) => {
      const dateStr = record.date_string;
      if (!acc[dateStr]) {
        acc[dateStr] = {
          date: dateStr,
          total_kwh: 0,
          total_cost: 0,
          device_count: 0,
        };
      }
      acc[dateStr].total_kwh += record.total_kwh;
      acc[dateStr].total_cost += record.cost_at_calc_time;
      acc[dateStr].device_count += 1; // Assuming one record per device
      return acc;
    }, {});

    // 4. Format the output as an array of daily summaries.
    const formattedData = Object.values(calendarData).map(day => ({
      ...day,
      total_cost: parseFloat(day.total_cost.toFixed(2)),
      total_kwh: parseFloat(day.total_kwh.toFixed(3)),
    }));

    res.json({
      classroom,
      year: y,
      month: m,
      calendar: formattedData,
    });

  } catch (error) {
    console.error('[PowerAnalytics] Error getting calendar data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * GET /api/power-analytics/cost-versions
 * Get electricity cost version history
 */
router.get('/cost-versions', async (req, res) => {
  try {
    const { classroom } = req.query;
    
    const query = { is_active: true };
    if (classroom) {
      query.$or = [
        { scope: 'global' },
        { scope: 'classroom', classroom }
      ];
    } else {
      query.scope = 'global';
    }
    
    const versions = await CostVersion.find(query)
      .sort({ effective_from: -1 })
      .limit(50);
    
    res.json({
      versions: versions.map(v => ({
        id: v._id,
        cost_per_kwh: v.cost_per_kwh,
        effective_from: v.effective_from,
        effective_until: v.effective_until,
        classroom: v.classroom,
        scope: v.scope,
        notes: v.notes,
        created_by: v.created_by,
        created_at: v.createdAt
      }))
    });
    
  } catch (error) {
    console.error('[PowerAnalytics] Error getting cost versions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/power-analytics/cost-versions
 * Create new electricity cost version
 */
router.post('/cost-versions', async (req, res) => {
  try {
    const { cost_per_kwh, effective_from, classroom, notes } = req.body;
    
    if (!cost_per_kwh || !effective_from) {
      return res.status(400).json({ error: 'cost_per_kwh and effective_from are required' });
    }
    
    const version = await CostVersion.createVersion({
      cost_per_kwh: parseFloat(cost_per_kwh),
      effective_from: new Date(effective_from),
      classroom: classroom || null,
      scope: classroom ? 'classroom' : 'global',
      created_by: {
        user_id: req.user?._id,
        username: req.user?.username || 'system'
      },
      notes
    });
    
    res.status(201).json({
      success: true,
      version: {
        id: version._id,
        cost_per_kwh: version.cost_per_kwh,
        effective_from: version.effective_from,
        effective_until: version.effective_until,
        classroom: version.classroom,
        scope: version.scope,
        notes: version.notes
      }
    });
    
  } catch (error) {
    console.error('[PowerAnalytics] Error creating cost version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/power-analytics/recalculate
 * Recalculate aggregates for a date range (for cost updates)
 */
router.post('/recalculate', async (req, res) => {
  try {
    const { classroom, start, end } = req.body;
    
    if (!classroom || !start || !end) {
      return res.status(400).json({ error: 'classroom, start, and end are required' });
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // This is a long-running operation, ideally should be queued
    const results = await aggregationService.reAggregateClassroom(classroom, startDate, endDate);
    
    res.json({
      success: true,
      message: 'Recalculation complete',
      classroom,
      start: startDate,
      end: endDate,
      daily_aggregates: results.daily.length,
      monthly_aggregates: results.monthly.length
    });
    
  } catch (error) {
    console.error('[PowerAnalytics] Error recalculating:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/power-analytics/export-csv
 * Export consumption data as CSV
 */
router.get('/export-csv', async (req, res) => {
  try {
    const { classroom, start, end } = req.query;
    
    if (!classroom || !start || !end) {
      return res.status(400).json({ error: 'classroom, start, and end are required' });
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    const ledgerEntries = await DeviceConsumptionLedger.find({
      classroom,
      start_ts: { $gte: startDate },
      end_ts: { $lte: endDate }
    }).sort({ start_ts: 1 });
    
    // Generate CSV
    const headers = ['Date', 'Time', 'ESP32 Name', 'Device ID', 'Energy (Wh)', 'Energy (kWh)', 'Cost (INR)', 'Duration (sec)', 'Switch State', 'Method', 'Confidence'];
    const rows = ledgerEntries.map(entry => [
      entry.start_ts.toISOString().split('T')[0],
      entry.start_ts.toISOString().split('T')[1].split('.')[0],
      entry.esp32_name,
      entry.device_id,
      entry.delta_wh.toFixed(2),
      (entry.delta_wh / 1000).toFixed(4),
      entry.cost_calculation.cost_inr.toFixed(2),
      entry.duration_seconds,
      entry.switch_state,
      entry.method,
      entry.quality.confidence
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="power-consumption-${classroom}-${start}-${end}.csv"`);
    res.send(csv);
    
  } catch (error) {
    console.error('[PowerAnalytics] Error exporting CSV:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/power-analytics/health
 * Get system health status
 */
router.get('/health', async (req, res) => {
  try {
    const telemetryIngestionService = require('../services/telemetryIngestionService');
    const ledgerGenerationService = require('../services/ledgerGenerationService');
    
    const telemetryStats = telemetryIngestionService.getStats();
    const ledgerStats = ledgerGenerationService.getStats();
    
    const lastAggregation = await DailyAggregate.findOne()
      .sort({ calculated_at: -1 })
      .select('calculated_at calc_run_id');
    
    res.json({
      status: 'healthy',
      telemetry: {
        total_events: telemetryStats.total_events,
        unprocessed_events: telemetryStats.unprocessed_events,
        events_last_hour: telemetryStats.events_last_hour,
        online_devices: telemetryStats.online_devices
      },
      ledger: {
        events_processed: ledgerStats.eventsProcessed,
        entries_created: ledgerStats.ledgerEntriesCreated,
        resets_detected: ledgerStats.resetsDetected,
        errors: ledgerStats.errors,
        is_processing: ledgerStats.isProcessing
      },
      aggregation: {
        last_run: lastAggregation?.calculated_at,
        last_run_id: lastAggregation?.calc_run_id
      },
      timestamp: new Date()
    });
    
  } catch (error) {
    console.error('[PowerAnalytics] Error getting health:', error);
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

module.exports = router;
