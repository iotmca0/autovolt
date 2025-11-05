const mongoose = require('mongoose');

/**
 * Daily Aggregates - Pre-computed Daily Consumption Totals
 * 
 * Generated from device_consumption_ledger on a daily basis.
 * Timezone-aware aggregation (Asia/Kolkata by default).
 * Used for fast dashboard queries.
 */
const dailyAggregateSchema = new mongoose.Schema({
  // Time period (in specified timezone)
  date: {
    type: Date,
    required: true,
    index: true,
    comment: 'Start of day in UTC (converted from Asia/Kolkata)'
  },
  date_string: {
    type: String,
    required: true,
    index: true,
    comment: 'YYYY-MM-DD in local timezone'
  },
  
  // Grouping
  classroom: {
    type: String,
    required: true,
    index: true
  },
  device_id: {
    type: String,
    index: true,
    comment: 'null for classroom-level aggregates'
  },
  esp32_name: {
    type: String,
    index: true
  },
  
  // Aggregated values
  total_wh: {
    type: Number,
    required: true,
    default: 0
  },
  total_kwh: {
    type: Number,
    required: true,
    default: 0
  },
  on_time_sec: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Cost
  cost_at_calc_time: {
    type: Number,
    required: true,
    default: 0,
    comment: 'Cost in INR at time of calculation'
  },
  cost_per_kwh_used: {
    type: Number,
    required: true,
    comment: 'Rate used for this calculation'
  },
  
  // Quality metrics
  quality_summary: {
    high_confidence_pct: Number,
    medium_confidence_pct: Number,
    low_confidence_pct: Number,
    total_entries: Number,
    gap_count: Number,
    reset_count: Number
  },
  
  // Processing metadata
  calc_run_id: {
    type: String,
    required: true,
    index: true
  },
  calculated_at: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Timezone
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  }
  
}, {
  timestamps: false,
  collection: 'daily_aggregates'
});

// Compound indexes
dailyAggregateSchema.index({ date: -1, classroom: 1 });
dailyAggregateSchema.index({ date: -1, classroom: 1, device_id: 1 });
dailyAggregateSchema.index({ classroom: 1, device_id: 1, date: -1 });
dailyAggregateSchema.index({ date_string: 1, classroom: 1 });

// Ensure only one aggregate per date/classroom/device
dailyAggregateSchema.index(
  { date_string: 1, classroom: 1, device_id: 1 },
  { unique: true }
);

// Static method: Get daily totals for classroom
dailyAggregateSchema.statics.getClassroomDaily = async function(classroom, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        classroom,
        date: { $gte: startDate, $lte: endDate },
        device_id: { $ne: null } // Only device-level aggregates
      }
    },
    {
      $group: {
        _id: '$date_string',
        total_wh: { $sum: '$total_wh' },
        total_kwh: { $sum: '$total_kwh' },
        total_cost: { $sum: '$cost_at_calc_time' },
        on_time_sec: { $sum: '$on_time_sec' },
        device_count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// Static method: Get device breakdown for a date
dailyAggregateSchema.statics.getDeviceBreakdown = async function(classroom, dateString) {
  return this.find({
    classroom,
    date_string: dateString,
    device_id: { $ne: null }
  }).sort({ total_wh: -1 });
};

module.exports = mongoose.model('DailyAggregate', dailyAggregateSchema);
