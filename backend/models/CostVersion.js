const mongoose = require('mongoose');

/**
 * Cost Version - Electricity Rate Versioning
 * 
 * Tracks changes to electricity cost over time with effective dates.
 * Allows historical recalculation without retroactively altering stored data.
 */
const costVersionSchema = new mongoose.Schema({
  cost_per_kwh: {
    type: Number,
    required: true,
    comment: 'Cost in INR per kWh'
  },
  
  effective_from: {
    type: Date,
    required: true,
    index: true,
    comment: 'When this rate becomes effective (UTC)'
  },
  
  effective_until: {
    type: Date,
    index: true,
    comment: 'When this rate expires (null = current rate)'
  },
  
  classroom: {
    type: String,
    index: true,
    comment: 'Specific classroom, or null for global default'
  },
  
  scope: {
    type: String,
    enum: ['global', 'classroom', 'device'],
    default: 'global',
    index: true
  },
  
  created_by: {
    user_id: mongoose.Schema.Types.ObjectId,
    username: String
  },
  
  notes: String,
  
  is_active: {
    type: Boolean,
    default: true,
    index: true
  }
  
}, {
  timestamps: true,
  collection: 'cost_versions'
});

// Compound indexes
costVersionSchema.index({ scope: 1, classroom: 1, effective_from: -1 });
costVersionSchema.index({ effective_from: 1, effective_until: 1 });

// Static method: Get rate for specific date and classroom
costVersionSchema.statics.getRateForDate = async function(date, classroom = null) {
  const query = {
    is_active: true,
    effective_from: { $lte: date },
    $or: [
      { effective_until: { $gte: date } },
      { effective_until: null }
    ]
  };
  
  // Try classroom-specific rate first
  if (classroom) {
    const classroomRate = await this.findOne({
      ...query,
      classroom,
      scope: 'classroom'
    }).sort({ effective_from: -1 });
    
    if (classroomRate) {
      return classroomRate.cost_per_kwh;
    }
  }
  
  // Fall back to global rate
  const globalRate = await this.findOne({
    ...query,
    scope: 'global'
  }).sort({ effective_from: -1 });
  
  return globalRate ? globalRate.cost_per_kwh : 7.0; // default 7.0 INR/kWh
};

// Static method: Get current rate
costVersionSchema.statics.getCurrentRate = async function(classroom = null) {
  return this.getRateForDate(new Date(), classroom);
};

// Static method: Create new rate version
costVersionSchema.statics.createVersion = async function(data) {
  const { cost_per_kwh, effective_from, classroom, scope, created_by, notes } = data;
  
  // Mark previous versions as inactive
  if (scope === 'global' && !classroom) {
    await this.updateMany(
      {
        scope: 'global',
        classroom: null,
        is_active: true,
        effective_from: { $lt: effective_from }
      },
      {
        $set: { effective_until: effective_from }
      }
    );
  } else if (classroom) {
    await this.updateMany(
      {
        scope: 'classroom',
        classroom,
        is_active: true,
        effective_from: { $lt: effective_from }
      },
      {
        $set: { effective_until: effective_from }
      }
    );
  }
  
  // Create new version
  return this.create({
    cost_per_kwh,
    effective_from,
    classroom: classroom || null,
    scope: scope || (classroom ? 'classroom' : 'global'),
    created_by,
    notes
  });
};

module.exports = mongoose.model('CostVersion', costVersionSchema);
