
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true
  },
  deviceName: String,
  switchId: String,
  switchName: String,
  action: {
    type: String,
    enum: [
      'on', 'off', 'toggle', 
      'manual_on', 'manual_off', 'manual_toggle',
      'device_created', 'device_updated', 'device_deleted', 
      'device_online', 'device_offline', 'device_connected', 'device_disconnected',
      'bulk_on', 'bulk_off',
      'status_check', 'heartbeat',
      'voice_command',
      'conflict_resolved'
    ],
    required: true
  },
  triggeredBy: {
    type: String,
    enum: ['user', 'schedule', 'pir', 'master', 'system', 'manual_switch', 'monitoring', 'voice_assistant'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: String,
  classroom: String,
  location: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  ip: String,
  userAgent: String,
  duration: Number,
  powerConsumption: Number, // Power rating in Watts at the time of action
  switchType: String, // Type of switch (light, fan, ac, etc.)
  macAddress: String, // ESP32 MAC address for tracking by device
  conflictResolution: {
    hasConflict: { type: Boolean, default: false },
    conflictType: String,
    resolution: String,
    responseTime: Number
  },
  deviceStatus: {
    isOnline: Boolean,
    responseTime: Number,
    signalStrength: Number
  },
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: false
});

// ============================================
// Database Indexes for Performance
// ============================================
// Compound index for device activity queries (most common query pattern)
activityLogSchema.index({ deviceId: 1, timestamp: -1 });

// Index for user activity history
activityLogSchema.index({ userId: 1, timestamp: -1 });

// Index for classroom-based queries
activityLogSchema.index({ classroom: 1, timestamp: -1 });

// Index for action-based queries (e.g., finding all 'on' actions)
activityLogSchema.index({ action: 1, timestamp: -1 });

// Index for time-based queries (e.g., logs from last 24 hours)
activityLogSchema.index({ timestamp: -1 });

// Index for trigger source queries (e.g., all schedule-triggered actions)
activityLogSchema.index({ triggeredBy: 1, timestamp: -1 });

// Compound index for switch-specific queries
activityLogSchema.index({ deviceId: 1, switchId: 1, timestamp: -1 });

// Index for conflict detection queries
activityLogSchema.index({ 'conflictResolution.hasConflict': 1, timestamp: -1 });

// Composite index for energy consumption calculation queries (CRITICAL for performance)
activityLogSchema.index({ deviceId: 1, action: 1, timestamp: -1 });

// Index for classroom-wise consumption aggregation
activityLogSchema.index({ classroom: 1, action: 1, timestamp: -1 });

// Index for ESP32 device tracking
activityLogSchema.index({ macAddress: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
