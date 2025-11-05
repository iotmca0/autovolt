const mongoose = require('mongoose');

/**
 * Monthly Aggregates - Pre-computed Monthly Consumption Totals
 * 
 * Generated from device_consumption_ledger or daily_aggregates monthly.
 * Timezone-aware aggregation (Asia/Kolkata by default).
 */
const monthlyAggregateSchema = new mongoose.Schema({
  // Time period (in specified timezone)
  year: {
    type: Number,
    required: true,
    index: true
  },
  month: {
    type: Number,
    required: true,
    index: true
  },
  month_string: {
    type: String,
    required: true,
    index: true,
    comment: 'YYYY-MM'
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
    default: 0
  },
  
  // Daily breakdown
  daily_totals: [{
    date_string: String,
    total_wh: Number,
    total_kwh: Number,
    cost: Number,
    on_time_sec: Number
  }],
  
  // Quality metrics
  quality_summary: {
    high_confidence_pct: Number,
    total_entries: Number,
    gap_count: Number,
    reset_count: Number
  },
  
  // Processing metadata
  calc_run_id: String,
  calculated_at: Date,
  timezone: {
    type: String,
    default: 'Asia/Kolkata'
  }
  
}, {
  timestamps: false,
  collection: 'monthly_aggregates'
});

// Compound indexes
monthlyAggregateSchema.index({ year: -1, month: -1, classroom: 1 });
monthlyAggregateSchema.index({ year: -1, month: -1, classroom: 1, device_id: 1 });
monthlyAggregateSchema.index({ month_string: 1, classroom: 1 });

// Ensure only one aggregate per month/classroom/device
monthlyAggregateSchema.index(
  { month_string: 1, classroom: 1, device_id: 1 },
  { unique: true }
);

module.exports = mongoose.model('MonthlyAggregate', monthlyAggregateSchema);
