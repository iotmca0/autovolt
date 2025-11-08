const DeviceConsumptionLedger = require('../models/DeviceConsumptionLedger');
const DailyAggregate = require('../models/DailyAggregate');
const MonthlyAggregate = require('../models/MonthlyAggregate');
const Device = require('../models/Device');

// Simple logger replacement
const logger = {
  info: (msg, ...args) => console.log(`[AggregationService] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[AggregationService ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[AggregationService WARN] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[AggregationService DEBUG] ${msg}`, ...args)
};

/**
 * Aggregation Service
 * 
 * Generates timezone-aware daily and monthly aggregates from the ledger.
 * Timezone: Asia/Kolkata (UTC+5:30) by default
 */
class AggregationService {
  constructor() {
    this.timezone = 'Asia/Kolkata';
    this.timezoneOffsetMinutes = 5 * 60 + 30; // UTC+5:30
  }
  
  /**
   * Initialize aggregation service.
   * Performs immediate aggregation for today + current month so dashboards have data
   * and schedules cron jobs for ongoing daily + monthly aggregation.
   */
  async initialize(options = {}) {
    try {
      const { skipInitial = false } = options;
      logger.info('[Aggregation] initialize() starting (skipInitial=%s)', skipInitial);
      const cron = require('node-cron');
      // Schedule daily aggregation at 00:10 IST (allow ledger to finish day rollover)
      cron.schedule('10 0 * * *', async () => {
        try {
          logger.info('[Aggregation] Daily scheduled aggregation starting');
          await this.aggregateToday();
          logger.info('[Aggregation] Daily scheduled aggregation complete');
          // Also refresh current month totals after daily completes
          const now = new Date();
          await this.aggregateMonthly(now.getFullYear(), now.getMonth() + 1);
          logger.info('[Aggregation] Monthly partial refresh complete');
        } catch (err) {
          logger.error('[Aggregation] Scheduled daily aggregation error:', err);
        }
      }, { timezone: 'Asia/Kolkata' });
      
      // Schedule full month aggregation on first day of month at 00:20 IST
      cron.schedule('20 0 1 * *', async () => {
        try {
          const now = new Date();
          logger.info('[Aggregation] First-of-month full monthly aggregation starting');
          await this.aggregateMonthly(now.getFullYear(), now.getMonth() + 1);
          logger.info('[Aggregation] First-of-month full monthly aggregation complete');
        } catch (err) {
          logger.error('[Aggregation] First-of-month aggregation error:', err);
        }
      }, { timezone: 'Asia/Kolkata' });
      
      if (!skipInitial) {
        // Perform immediate aggregation so UI doesn't show zeros on fresh start
        await this.aggregateToday();
        await this.aggregateCurrentMonth();
        logger.info('[Aggregation] Initial aggregation (today + month) complete');
      }
      logger.info('[Aggregation] initialize() completed successfully');
    } catch (error) {
      logger.error('[Aggregation] initialize() failed:', error);
    }
  }
  
  /**
   * Convert UTC date to local timezone start-of-day
   */
  getLocalDayStart(date) {
    const utcDate = new Date(date);
    // Subtract timezone offset to get local midnight in UTC
    const localMidnight = new Date(utcDate);
    localMidnight.setUTCHours(0, 0, 0, 0);
    localMidnight.setUTCMinutes(localMidnight.getUTCMinutes() - this.timezoneOffsetMinutes);
    return localMidnight;
  }
  
  /**
   * Get local date string (YYYY-MM-DD)
   */
  getLocalDateString(date) {
    const localDate = new Date(date.getTime() + this.timezoneOffsetMinutes * 60 * 1000);
    const year = localDate.getUTCFullYear();
    const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(localDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  /**
   * Get local month string (YYYY-MM)
   */
  getLocalMonthString(date) {
    const localDate = new Date(date.getTime() + this.timezoneOffsetMinutes * 60 * 1000);
    const year = localDate.getUTCFullYear();
    const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
  
  /**
   * Aggregate daily consumption for a specific date
   */
  async aggregateDaily(date, classroom = null) {
    try {
      const localDayStart = this.getLocalDayStart(date);
      const localDayEnd = new Date(localDayStart.getTime() + 24 * 60 * 60 * 1000);
      const dateString = this.getLocalDateString(date);
      
      logger.info(`[Aggregation] Aggregating daily for ${dateString} (${classroom || 'all classrooms'})`);
      
      // Build match query
      const matchQuery = {
        start_ts: { $gte: localDayStart },
        end_ts: { $lt: localDayEnd }
      };
      
      if (classroom) {
        matchQuery.classroom = classroom;
      }
      
      // Get ledger entries for this day
      const ledgerEntries = await DeviceConsumptionLedger.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              classroom: '$classroom',
              device_id: '$device_id',
              esp32_name: '$esp32_name'
            },
            total_wh: { $sum: '$delta_wh' },
            on_time_sec: { $sum: '$switch_on_duration_seconds' },
            total_cost: { $sum: '$cost_calculation.cost_inr' },
            avg_cost_per_kwh: { $avg: '$cost_calculation.cost_per_kwh' },
            high_confidence_count: {
              $sum: {
                $cond: [{ $eq: ['$quality.confidence', 'high'] }, 1, 0]
              }
            },
            medium_confidence_count: {
              $sum: {
                $cond: [{ $eq: ['$quality.confidence', 'medium'] }, 1, 0]
              }
            },
            low_confidence_count: {
              $sum: {
                $cond: [{ $eq: ['$quality.confidence', 'low'] }, 1, 0]
              }
            },
            total_entries: { $sum: 1 },
            gap_count: {
              $sum: {
                $cond: ['$quality.flags.gap_filled', 1, 0]
              }
            },
            reset_count: {
              $sum: {
                $cond: ['$is_reset_marker', 1, 0]
              }
            }
          }
        }
      ]);
      
      // Create or update daily aggregates
      const calcRunId = `daily_${Date.now()}`;
      const results = [];
      
      for (const entry of ledgerEntries) {
        const totalEntries = entry.total_entries;
        const qualitySummary = {
          high_confidence_pct: (entry.high_confidence_count / totalEntries) * 100,
          medium_confidence_pct: (entry.medium_confidence_count / totalEntries) * 100,
          low_confidence_pct: (entry.low_confidence_count / totalEntries) * 100,
          total_entries: totalEntries,
          gap_count: entry.gap_count,
          reset_count: entry.reset_count
        };
        
        const aggregate = await DailyAggregate.findOneAndUpdate(
          {
            date_string: dateString,
            classroom: entry._id.classroom,
            device_id: entry._id.device_id
          },
          {
            $set: {
              date: localDayStart,
              date_string: dateString,
              classroom: entry._id.classroom,
              device_id: entry._id.device_id,
              esp32_name: entry._id.esp32_name,
              total_wh: entry.total_wh,
              total_kwh: entry.total_wh / 1000,
              on_time_sec: entry.on_time_sec,
              cost_at_calc_time: entry.total_cost,
              cost_per_kwh_used: entry.avg_cost_per_kwh,
              quality_summary: qualitySummary,
              calc_run_id: calcRunId,
              calculated_at: new Date(),
              timezone: this.timezone
            }
          },
          { upsert: true, new: true }
        );
        
        results.push(aggregate);
      }
      
      logger.info(`[Aggregation] ✅ Created ${results.length} daily aggregates for ${dateString}`);
      
      return results;
      
    } catch (error) {
      logger.error('[Aggregation] Error aggregating daily:', error);
      throw error;
    }
  }
  
  /**
   * Aggregate monthly consumption for a specific month
   */
  async aggregateMonthly(year, month, classroom = null) {
    try {
      const monthString = `${year}-${String(month).padStart(2, '0')}`;
      
      logger.info(`[Aggregation] Aggregating monthly for ${monthString} (${classroom || 'all classrooms'})`);
      
      // Build match query
      const matchQuery = {
        date_string: { $regex: `^${monthString}` }
      };
      
      if (classroom) {
        matchQuery.classroom = classroom;
      }
      
      // Aggregate from daily aggregates
      const monthlyData = await DailyAggregate.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: {
              classroom: '$classroom',
              device_id: '$device_id',
              esp32_name: '$esp32_name'
            },
            total_wh: { $sum: '$total_wh' },
            total_kwh: { $sum: '$total_kwh' },
            on_time_sec: { $sum: '$on_time_sec' },
            total_cost: { $sum: '$cost_at_calc_time' },
            total_entries: { $sum: '$quality_summary.total_entries' },
            gap_count: { $sum: '$quality_summary.gap_count' },
            reset_count: { $sum: '$quality_summary.reset_count' },
            high_confidence_sum: { $sum: '$quality_summary.high_confidence_pct' },
            daily_count: { $sum: 1 },
            daily_totals: {
              $push: {
                date_string: '$date_string',
                total_wh: '$total_wh',
                total_kwh: '$total_kwh',
                cost: '$cost_at_calc_time',
                on_time_sec: '$on_time_sec'
              }
            }
          }
        }
      ]);
      
      // Create or update monthly aggregates
      const calcRunId = `monthly_${Date.now()}`;
      const results = [];
      
      for (const entry of monthlyData) {
        const qualitySummary = {
          high_confidence_pct: entry.high_confidence_sum / entry.daily_count,
          total_entries: entry.total_entries,
          gap_count: entry.gap_count,
          reset_count: entry.reset_count
        };
        
        const aggregate = await MonthlyAggregate.findOneAndUpdate(
          {
            month_string: monthString,
            classroom: entry._id.classroom,
            device_id: entry._id.device_id
          },
          {
            $set: {
              year,
              month,
              month_string: monthString,
              classroom: entry._id.classroom,
              device_id: entry._id.device_id,
              esp32_name: entry._id.esp32_name,
              total_wh: entry.total_wh,
              total_kwh: entry.total_kwh,
              on_time_sec: entry.on_time_sec,
              cost_at_calc_time: entry.total_cost,
              daily_totals: entry.daily_totals,
              quality_summary: qualitySummary,
              calc_run_id: calcRunId,
              calculated_at: new Date(),
              timezone: this.timezone
            }
          },
          { upsert: true, new: true }
        );
        
        results.push(aggregate);
      }
      
      logger.info(`[Aggregation] ✅ Created ${results.length} monthly aggregates for ${monthString}`);
      
      return results;
      
    } catch (error) {
      logger.error('[Aggregation] Error aggregating monthly:', error);
      throw error;
    }
  }
  
  /**
   * Aggregate for date range (convenience method)
   */
  async aggregateDateRange(startDate, endDate, classroom = null) {
    const results = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dailyResults = await this.aggregateDaily(currentDate, classroom);
      results.push(...dailyResults);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return results;
  }
  
  /**
   * Aggregate today for all classrooms
   */
  async aggregateToday() {
    const today = new Date();
    return this.aggregateDaily(today);
  }
  
  /**
   * Aggregate current month for all classrooms
   */
  async aggregateCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return this.aggregateMonthly(year, month);
  }
  
  /**
   * Re-aggregate everything for a classroom (for cost recalculation)
   */
  async reAggregateClassroom(classroom, startDate, endDate) {
    logger.info(`[Aggregation] Re-aggregating ${classroom} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Aggregate daily
    const dailyResults = await this.aggregateDateRange(startDate, endDate, classroom);
    
    // Find affected months
    const months = new Set();
    let currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      months.add(`${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`);
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    // Aggregate monthly
    const monthlyResults = [];
    for (const monthKey of months) {
      const [year, month] = monthKey.split('-').map(Number);
      const results = await this.aggregateMonthly(year, month, classroom);
      monthlyResults.push(...results);
    }
    
    logger.info(`[Aggregation] ✅ Re-aggregation complete: ${dailyResults.length} days, ${monthlyResults.length} months`);
    
    return {
      daily: dailyResults,
      monthly: monthlyResults
    };
  }
  
  /**
   * Get quick summary without creating aggregates
   */
  async getQuickSummary(classroom, startDate, endDate) {
    const result = await DeviceConsumptionLedger.aggregate([
      {
        $match: {
          classroom,
          start_ts: { $gte: startDate },
          end_ts: { $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          total_wh: { $sum: '$delta_wh' },
          total_cost: { $sum: '$cost_calculation.cost_inr' },
          on_time_sec: { $sum: '$switch_on_duration_seconds' },
          device_count: { $addToSet: '$device_id' }
        }
      }
    ]);
    
    if (result.length === 0) {
      return {
        total_wh: 0,
        total_kwh: 0,
        total_cost: 0,
        on_time_hours: 0,
        device_count: 0
      };
    }
    
    return {
      total_wh: result[0].total_wh,
      total_kwh: result[0].total_wh / 1000,
      total_cost: result[0].total_cost,
      on_time_hours: result[0].on_time_sec / 3600,
      device_count: result[0].device_count.length
    };
  }
}

// Singleton instance
const aggregationService = new AggregationService();

module.exports = aggregationService;
