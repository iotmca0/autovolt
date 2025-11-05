const mongoose = require('mongoose');

/**
 * Telemetry Events Collection - Immutable Event Store
 * 
 * Stores every incoming telemetry message from ESP32 devices.
 * Never updated or deleted - append-only for audit trail and reprocessing.
 * 
 * MQTT Topics:
 * - autovolt/<esp32_name>/telemetry (JSON), QoS 1
 * - autovolt/<esp32_name>/switches (JSON), QoS 1
 * - autovolt/<esp32_name>/heartbeat, QoS 1
 * - autovolt/<esp32_name>/status (LWT retained), QoS 1
 */
const telemetryEventSchema = new mongoose.Schema({
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
    index: true
  },
  
  // Timestamps
  timestamp: {
    type: Date,
    required: true,
    index: true,
    comment: 'ISO8601 UTC from ESP32 (if provided)'
  },
  received_at: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
    comment: 'Server receive timestamp (authoritative)'
  },
  
  // Power & Energy data
  power_w: {
    type: Number,
    comment: 'Instantaneous power in watts'
  },
  energy_wh_total: {
    type: Number,
    comment: 'Cumulative Wh total since device power-up (meter reading)'
  },
  
  // Switch states
  switch_state: {
    type: Map,
    of: Boolean,
    comment: 'Map of switch IDs to boolean states, e.g. {"sw1":true,"sw2":false}'
  },
  
  // Device metadata
  uptime_seconds: {
    type: Number,
    comment: 'Device uptime in seconds'
  },
  status: {
    type: String,
    enum: ['online', 'offline-heartbeat', 'offline-lost'],
    required: true,
    index: true
  },
  
  // Additional metadata
  meta: {
    firmware_ver: String,
    signal_strength: Number,
    free_heap: Number,
    wifi_rssi: Number
  },
  
  // Quality tracking
  quality_flags: {
    time_drift_detected: Boolean, // timestamp differs from received_at by > 5 min
    out_of_order: Boolean, // timestamp < last known timestamp
    duplicate_suspected: Boolean, // hash matches recent event
    gap_before_ms: Number, // milliseconds since last event
    confidence: { type: String, enum: ['high', 'medium', 'low'], default: 'high' }
  },
  
  // Deduplication
  event_hash: {
    type: String,
    index: true,
    comment: 'SHA256(esp32+device+timestamp+payload) for deduplication'
  },
  sequence_no: {
    type: Number,
    comment: 'ESP32 sequence number if provided'
  },
  
  // Processing tracking
  processed: {
    type: Boolean,
    default: false,
    index: true
  },
  ledger_entry_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DeviceConsumptionLedger',
    comment: 'Link to ledger entry created from this event'
  },
  
  // MQTT metadata
  mqtt_topic: String,
  mqtt_qos: Number,
  mqtt_retained: Boolean
  
}, {
  timestamps: true, // adds createdAt, updatedAt
  collection: 'telemetry_events'
});

// Compound indexes for efficient queries
telemetryEventSchema.index({ esp32_name: 1, device_id: 1, received_at: -1 });
telemetryEventSchema.index({ classroom: 1, received_at: -1 });
telemetryEventSchema.index({ event_hash: 1, received_at: -1 }); // deduplication
telemetryEventSchema.index({ processed: 1, received_at: 1 }); // processing queue
telemetryEventSchema.index({ status: 1, received_at: -1 });

// TTL index - optional, keep events for 2 years
telemetryEventSchema.index({ received_at: 1 }, { expireAfterSeconds: 63072000 }); // 2 years

// Static method: Find unprocessed events
telemetryEventSchema.statics.getUnprocessed = async function(limit = 100) {
  return this.find({ processed: false })
    .sort({ received_at: 1 })
    .limit(limit);
};

// Static method: Get last event for device
telemetryEventSchema.statics.getLastEvent = async function(esp32_name, device_id) {
  return this.findOne({ esp32_name, device_id })
    .sort({ received_at: -1 });
};

// Static method: Check for duplicate
telemetryEventSchema.statics.isDuplicate = async function(eventHash, withinMinutes = 5) {
  const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
  const existing = await this.findOne({
    event_hash: eventHash,
    received_at: { $gte: cutoff }
  });
  return !!existing;
};

// Static method: Get events in time range
telemetryEventSchema.statics.getEventsInRange = async function(esp32_name, device_id, startTime, endTime) {
  return this.find({
    esp32_name,
    device_id,
    received_at: { $gte: startTime, $lte: endTime }
  }).sort({ received_at: 1 });
};

module.exports = mongoose.model('TelemetryEvent', telemetryEventSchema);
