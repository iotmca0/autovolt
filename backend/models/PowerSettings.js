const mongoose = require('mongoose');
const { logger } = require('../middleware/logger');

/**
 * Power Settings Schema
 *
 * This schema defines the structure for storing power consumption settings.
 * It follows a singleton pattern to ensure there is only one settings document
 * in the database, making it easy to manage global configurations.
 */
const powerSettingsSchema = new mongoose.Schema({
  // Singleton key to ensure only one document exists
  singleton: {
    type: String,
    default: 'power_settings',
    unique: true,
    required: true,
  },
  
  // Price of electricity per kilowatt-hour (kWh) in local currency (e.g., ₹)
  electricityPrice: {
    type: Number,
    required: [true, 'Electricity price is required.'],
    min: [0, 'Electricity price cannot be negative.'],
    default: 7.5,
  },

  // Currency symbol
  currency: {
    type: String,
    required: true,
    default: '₹',
  },

  // Array of device types and their power consumption in Watts
  deviceTypes: [
    {
      // Unique identifier for the device type (e.g., 'light', 'fan', 'ac')
      type: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },
      // Name for display purposes (e.g., 'LED Light', 'Ceiling Fan')
      name: {
        type: String,
        required: true,
        trim: true,
      },
      // Power consumption in Watts (W)
      powerConsumption: {
        type: Number,
        required: true,
        min: 0,
      },
      // Unit of power (e.g., 'W' for Watts, 'kW' for Kilowatts)
      unit: {
        type: String,
        default: 'W',
      },
    },
  ],
  
  // Timestamps for tracking changes
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save hook to update the `updatedAt` timestamp
powerSettingsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get the singleton settings document
powerSettingsSchema.statics.getSingleton = async function () {
  try {
    let settings = await this.findOne({ singleton: 'power_settings' });

    if (!settings) {
      logger.info('[PowerSettings] No settings found, creating default settings.');
      settings = await this.create({
        singleton: 'power_settings',
        electricityPrice: 7.5,
        currency: '₹',
        deviceTypes: [
          { type: 'light', name: 'Light', powerConsumption: 40, unit: 'W' },
          { type: 'fan', name: 'Fan', powerConsumption: 75, unit: 'W' },
          { type: 'projector', name: 'Projector', powerConsumption: 200, unit: 'W' },
          { type: 'ac', name: 'Air Conditioner', powerConsumption: 1500, unit: 'W' },
          { type: 'outlet', name: 'Outlet', powerConsumption: 100, unit: 'W' },
          { type: 'default', name: 'Default', powerConsumption: 50, unit: 'W' },
        ],
      });
    }
    return settings;
  } catch (error) {
    logger.error('[PowerSettings] Error getting or creating settings:', error);
    throw error;
  }
};

const PowerSettings = mongoose.model('PowerSettings', powerSettingsSchema);

module.exports = PowerSettings;
