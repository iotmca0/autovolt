const mongoose = require('mongoose');

/**
 * Device Consumption Ledger - Append-Only Consumption Records
 * 
 * Computed from telemetry_events. Each entry represents an accepted energy delta.
 * Never updated or deleted - append-only for immutable audit trail.
 * 
 * This is the single source of truth for all consumption calculations.
 * Aggregations, dashboards, and charts all read from this ledger.
 */
const deviceConsumptionLedgerSchema = new mongoose.Schema({
  // Device identification
  esp32_name: {
    type: String,
    required: true,
    index: true
  },
  classroom: {
    type: String,
    required: true,
    index: true
  },
  device_id: {
    type: String,
    required: true,
    index: true,
    comment: 'e.g., "light_1", "fan_2"'
  },
  
  // Time period this delta covers
  start_ts: {
    type: Date,
    required: true,
    index: true,
    comment: 'Start of measurement period (UTC)'
  },
  end_ts: {
    type: Date,
    required: true,
    index: true,
    comment: 'End of measurement period (UTC)'
  },
  duration_seconds: {
    type: Number,
    required: true,
    comment: 'end_ts - start_ts in seconds'
  },
  
  // Energy delta
  delta_wh: {
    type: Number,
    required: true,
    comment: 'Energy consumed in this period (Watt-hours)'
  },
  
  // Calculation method
  method: {
    type: String,
    enum: ['cumulative_meter', 'power_integration', 'estimated', 'manual_correction'],
    required: true,
    index: true
  },
  
  // Method-specific data
  calculation_data: {
    // For cumulative_meter method
    energy_start_wh: Number,
    energy_end_wh: Number,
    
    // For power_integration method
    average_power_w: Number,
    power_samples: Number,
    
    // For estimated method
    estimation_basis: String,
    confidence_score: Number
  },
  
  // Switch state during period
  switch_state: {
    type: String,
    enum: ['on', 'off', 'mixed', 'unknown'],
    default: 'unknown'
  },
  switch_on_duration_seconds: {
    type: Number,
    default: 0,
    comment: 'Time switch was ON during this period'
  },
  
  // Device status
  device_status: {
    type: String,
    enum: ['online', 'offline', 'reconnecting', 'reset'],
    default: 'online'
  },
  
  // Quality & confidence
  quality: {
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'high'
    },
    flags: {
      gap_filled: Boolean,
      interpolated: Boolean,
      post_reset: Boolean,
      negative_delta_corrected: Boolean,
      manual_adjustment: Boolean
    },
    gap_duration_ms: Number
  },
  
  // Cost calculation (versioned)
  cost_calculation: {
    cost_per_kwh: {
      type: Number,
      required: true
    },
    cost_inr: {
      type: Number,
      required: true,
      comment: 'Cost in Indian Rupees'
    },
    cost_version_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CostVersion'
    }
  },
  
  // Notes & audit
  notes: {
    type: String,
    comment: 'Human-readable description of calculation'
  },
  
  // Traceability - link back to raw events
  raw_event_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TelemetryEvent'
  }],
  
  // Reset tracking
  is_reset_marker: {
    type: Boolean,
    default: false,
    index: true,
    comment: 'Marks firmware reset or counter wrap'
  },
  reset_reason: {
    type: String,
    enum: ['firmware_update', 'power_cycle', 'counter_wrap', 'manual', 'unknown']
  },
  
  // Reconciliation tracking
  reconciliation: {
    is_reconciled: Boolean,
    reconciliation_run_id: mongoose.Schema.Types.ObjectId,
    original_delta_wh: Number,
    adjustment_reason: String
  },
  
  // Processing metadata
  created_by: {
    type: String,
    enum: ['realtime_processor', 'reconciliation_job', 'manual_entry', 'migration'],
    default: 'realtime_processor'
  },
  calc_run_id: {
    type: String,
    comment: 'ID of the processing batch that created this entry'
  }
  
}, {
  timestamps: true,
  collection: 'device_consumption_ledger'
});

// Compound indexes for efficient queries
deviceConsumptionLedgerSchema.index({ esp32_name: 1, device_id: 1, start_ts: -1 });
deviceConsumptionLedgerSchema.index({ classroom: 1, start_ts: -1 });
deviceConsumptionLedgerSchema.index({ start_ts: 1, end_ts: 1 }); // time-range queries
deviceConsumptionLedgerSchema.index({ method: 1, quality: 1 }); // quality analysis
deviceConsumptionLedgerSchema.index({ is_reset_marker: 1, start_ts: -1 });

// Static method: Get total consumption for device in range
deviceConsumptionLedgerSchema.statics.getTotalConsumption = async function(esp32_name, device_id, startTime, endTime) {
  const result = await this.aggregate([
    {
      $match: {
        esp32_name,
        device_id,
        start_ts: { $gte: startTime },
        end_ts: { $lte: endTime }
      }
    },
    {
      $group: {
        _id: null,
        total_wh: { $sum: '$delta_wh' },
        total_cost: { $sum: '$cost_calculation.cost_inr' },
        total_on_time_sec: { $sum: '$switch_on_duration_seconds' },
        entry_count: { $sum: 1 }
      }
    }
  ]);
  
  return result[0] || {
    total_wh: 0,
    total_cost: 0,
    total_on_time_sec: 0,
    entry_count: 0
  };
};

// Static method: Get total consumption for classroom in range
deviceConsumptionLedgerSchema.statics.getClassroomConsumption = async function(classroom, startTime, endTime) {
  const result = await this.aggregate([
    {
      $match: {
        classroom,
        start_ts: { $gte: startTime },
        end_ts: { $lte: endTime }
      }
    },
    {
      $group: {
        _id: '$device_id',
        esp32_name: { $first: '$esp32_name' },
        device_id: { $first: '$device_id' },
        total_wh: { $sum: '$delta_wh' },
        total_cost: { $sum: '$cost_calculation.cost_inr' },
        total_on_time_sec: { $sum: '$switch_on_duration_seconds' }
      }
    },
    {
      $sort: { total_wh: -1 }
    }
  ]);
  
  const overall = result.reduce((acc, device) => {
    acc.total_wh += device.total_wh;
    acc.total_cost += device.total_cost;
    acc.total_on_time_sec += device.total_on_time_sec;
    return acc;
  }, { total_wh: 0, total_cost: 0, total_on_time_sec: 0 });
  
  return {
    classroom,
    ...overall,
    devices: result
  };
};

// Static method: Get last ledger entry for device
deviceConsumptionLedgerSchema.statics.getLastEntry = async function(esp32_name, device_id) {
  return this.findOne({ esp32_name, device_id })
    .sort({ end_ts: -1 });
};

// Static method: Check for reset between two timestamps
deviceConsumptionLedgerSchema.statics.hasResetBetween = async function(esp32_name, device_id, startTime, endTime) {
  const reset = await this.findOne({
    esp32_name,
    device_id,
    is_reset_marker: true,
    start_ts: { $gte: startTime, $lte: endTime }
  });
  return !!reset;
};

// Static method: Get consumption timeline (for charts)
deviceConsumptionLedgerSchema.statics.getTimeline = async function(classroom, startTime, endTime, bucketSizeMinutes = 60) {
  const bucketSizeMs = bucketSizeMinutes * 60 * 1000;
  
  const result = await this.aggregate([
    {
      $match: {
        classroom,
        start_ts: { $gte: startTime },
        end_ts: { $lte: endTime }
      }
    },
    {
      $addFields: {
        bucket: {
          $toDate: {
            $subtract: [
              { $toLong: '$start_ts' },
              { $mod: [{ $toLong: '$start_ts' }, bucketSizeMs] }
            ]
          }
        }
      }
    },
    {
      $group: {
        _id: '$bucket',
        total_wh: { $sum: '$delta_wh' },
        total_cost: { $sum: '$cost_calculation.cost_inr' },
        device_count: { $addToSet: '$device_id' }
      }
    },
    {
      $addFields: {
        device_count: { $size: '$device_count' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
  
  return result.map(r => ({
    timestamp: r._id,
    total_wh: r.total_wh,
    total_kwh: r.total_wh / 1000,
    total_cost: r.total_cost,
    device_count: r.device_count
  }));
};

module.exports = mongoose.model('DeviceConsumptionLedger', deviceConsumptionLedgerSchema);
