const mongoose = require('mongoose');
const gpioUtils = require('../utils/gpioUtils');

const switchTypes = ['relay', 'light', 'fan', 'outlet', 'projector', 'ac'];

const switchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Switch name is required'],
    trim: true
  },
  voiceAliases: {
    type: [String],
    default: [],
    set: (aliases) => Array.isArray(aliases)
      ? aliases.map((alias) => alias?.trim()).filter(Boolean)
      : []
  },
  gpio: {
    type: Number,
    required: false, // Make GPIO optional for flexible device configuration
    min: [0, 'GPIO pin must be >= 0'],
    max: [39, 'GPIO pin must be <= 39'], // Will be validated in pre-save
    validate: {
      validator: function(v) {
        if (v === undefined || v === null) return true; // Allow undefined GPIOs
        // Allow problematic pins for existing devices during updates to prevent bulk toggle failures
        // Only enforce strict validation for new devices
        return gpioUtils.validateGpioPin(v, true, 'esp32'); // Default to ESP32, will be re-validated in pre-save
      },
      message: function(props) {
        const status = gpioUtils.getGpioPinStatus(props.value, 'esp32');
        return status.reason;
      }
    }
  },
  relayGpio: {
    type: Number,
    // Not required for backward compatibility - will be set to gpio value if missing
    min: [0, 'GPIO pin must be >= 0'],
    max: [39, 'GPIO pin must be <= 39'], // Will be validated in pre-save
    validate: {
      validator: function(v) {
        if (v === undefined || v === null) return true; // Allow undefined for backward compatibility
        // Allow problematic pins for existing devices during updates to prevent bulk toggle failures
        // Only enforce strict validation for new devices
        return gpioUtils.validateGpioPin(v, true, 'esp32'); // Default to ESP32, will be re-validated in pre-save
      },
      message: function(props) {
        const status = gpioUtils.getGpioPinStatus(props.value, 'esp32');
        return status.reason;
      }
    }
  },
  type: {
    type: String,
    required: [true, 'Switch type is required'],
    enum: {
      values: switchTypes,
      message: 'Invalid switch type. Must be one of: ' + switchTypes.join(', ')
    }
  },
  state: {
    type: Boolean,
    default: false,
    index: true // Index for state queries
  },
  icon: {
    type: String,
    default: 'lightbulb'
  },
  manualSwitchEnabled: {
    type: Boolean,
    default: false
  },
  manualSwitchGpio: {
    type: Number,
    min: [0, 'GPIO pin must be >= 0'],
    max: [39, 'GPIO pin must be <= 39'], // Will be validated in pre-save
    validate: {
      validator: function(v) {
        if (v === undefined || v === null) return true;
        // Allow problematic pins for existing devices during updates
        return gpioUtils.validateGpioPin(v, true, 'esp32'); // Default to ESP32, will be re-validated in pre-save
      },
      message: function(props) {
        const status = gpioUtils.getGpioPinStatus(props.value, 'esp32');
        return status.reason;
      }
    }
  },
  manualMode: {
    type: String,
    enum: ['maintained', 'momentary'],
    default: 'maintained'
  },
  manualActiveLow: {
    type: Boolean,
    default: true
  },
  usePir: {
    type: Boolean,
    default: false
  },
  dontAutoOff: {
    type: Boolean,
    default: false
  },
  manualOverride: {
    type: Boolean,
    default: false
  },
  powerRating: {
    type: Number,
    default: 0,
    min: 0
    // Power consumption in Watts when this switch is ON
    // Examples: 40W for LED bulb, 75W for fan, 1500W for AC, 300W for projector
  },
  lastStateChange: {
    type: Date,
    default: null
    // Tracks when this specific switch last changed state (ON <-> OFF)
    // Updated automatically when switch state changes
    // Used for accurate uptime/downtime calculations
  }
}, { timestamps: true });

const deviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Device name is required'],
    trim: true
  },
  deviceType: {
    type: String,
    enum: ['esp32', 'esp8266'],
    default: 'esp32'
  },
  macAddress: {
    type: String,
    required: [true, 'MAC address is required'],
    unique: true,
    // Accept both colon/dash and normalized (no separator) MACs
    match: [/^([0-9A-Fa-f]{2}[:-]?){5}([0-9A-Fa-f]{2})$/, 'Please enter a valid MAC address']
  },
  ipAddress: {
    type: String,
    required: [true, 'IP address is required'],
    unique: true,
    match: [/^(\d{1,3}\.){3}\d{1,3}$/, 'Please enter a valid IP address']
  },
  deviceSecret: {
    type: String,
    required: false,
    select: false,
    minlength: 16,
    maxlength: 128
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  classroom: {
    type: String,
    trim: true,
    optional: true
  },
  voiceAliases: {
    type: [String],
    default: [],
    set: (aliases) => Array.isArray(aliases)
      ? aliases.map((alias) => alias?.trim()).filter(Boolean)
      : []
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'error'],
    default: 'offline'
  },
  blocked: {
    type: Boolean,
    default: false,
    index: true // Index for blocked device queries
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  onlineSince: {
    type: Date,
    default: null
  },
  offlineSince: {
    type: Date,
    default: null
  },
  switches: {
    type: [switchSchema],
    validate: [
      {
        validator: function(switches) {
          const deviceType = this.deviceType || 'esp32';
          const maxSwitches = deviceType === 'esp8266' ? 6 : 8;
          return switches.length <= maxSwitches;
        },
        message: function() {
          const deviceType = this.deviceType || 'esp32';
          const maxSwitches = deviceType === 'esp8266' ? 6 : 8;
          return `Maximum ${maxSwitches} switches allowed per ${deviceType.toUpperCase()} device`;
        }
      },
      {
        validator: function(switches) {
          const gpios = switches.map(s => s.gpio).filter(g => g !== undefined && g !== null);
          const relayGpios = switches.map(s => s.relayGpio).filter(g => g !== undefined && g !== null);
          const manual = switches.filter(s => s.manualSwitchEnabled && s.manualSwitchGpio !== undefined && s.manualSwitchGpio !== null).map(s => s.manualSwitchGpio);
          // Only check uniqueness if relayGpio is different from gpio
          const uniqueRelayGpios = relayGpios.filter(g => !gpios.includes(g));
          const all = [...gpios, ...uniqueRelayGpios, ...manual];
          return new Set(all).size === all.length;
        },
        message: 'Each switch (including relay GPIOs and manual switch GPIOs) must use a unique GPIO pin'
      }
    ],
    required: true
  },
  pirEnabled: {
    type: Boolean,
    default: false
  },
  pirGpio: {
    type: Number,
    required: false, // OPTIONAL - GPIO pins are now FIXED (34 for PIR, 35 for Microwave)
    min: [0, 'GPIO pin must be >= 0'],
    max: [39, 'GPIO pin must be <= 39']
  },
  pirAutoOffDelay: {
    type: Number,
    min: 0,
    default: 30 // 30 seconds default
  },
  // PIR Detection Schedule - Time-based control
  pirDetectionSchedule: {
    enabled: {
      type: Boolean,
      default: false
    },
    activeStartTime: {
      type: String,
      match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (24-hour)'],
      default: '18:00' // Detection starts at 6 PM by default
    },
    activeEndTime: {
      type: String,
      match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (24-hour)'],
      default: '22:00' // Detection ends at 10 PM by default
    },
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6,
      enum: [0, 1, 2, 3, 4, 5, 6] // 0 = Sunday, 1 = Monday, etc.
    }]
  },
  // Dual Sensor Configuration
  // Note: GPIO pins are FIXED (GPIO 34 for PIR, GPIO 35 for Microwave)
  pirSensorType: {
    type: String,
    enum: ['hc-sr501', 'rcwl-0516', 'both'],
    default: 'hc-sr501'
  },
  pirSensitivity: {
    type: Number,
    min: 0,
    max: 100,
    default: 50 // 50% sensitivity default
  },
  pirDetectionRange: {
    type: Number,
    min: 1,
    max: 10,
    default: 7 // 7 meters default
  },
  motionDetectionLogic: {
    type: String,
    enum: ['and', 'or', 'weighted'],
    default: 'and'
  },
  notificationSettings: {
    afterTime: {
      type: String,
      match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Time must be in HH:MM format (24-hour)']
    },
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6,
      enum: [0, 1, 2, 3, 4, 5, 6] // 0 = Sunday, 1 = Monday, etc.
    }],
    enabled: {
      type: Boolean,
      default: false
    },
    lastTriggered: {
      type: Date,
      default: null
    }
  },
  assignedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
  ,
  // Store queued toggle intents when user tries while offline
  queuedIntents: {
    type: [new mongoose.Schema({
      switchGpio: Number,
      desiredState: Boolean,
      createdAt: { type: Date, default: Date.now }
    }, { _id: false })],
    default: []
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
deviceSchema.index({ macAddress: 1 }, { unique: true });
deviceSchema.index({ ipAddress: 1 }, { unique: true });
deviceSchema.index({ assignedUsers: 1 });
deviceSchema.index({ classroom: 1 }); // Index for classroom-based queries
deviceSchema.index({ status: 1 }); // Index for status filtering
deviceSchema.index({ location: 1 }); // Index for location-based queries
deviceSchema.index({ lastSeen: -1 }); // Index for recent device queries

// Pre-save middleware to ensure switches have unique names and normalize MAC address
deviceSchema.pre('save', function(next) {
  // Normalize MAC address: ensure proper colon formatting (AA:BB:CC:DD:EE:FF)
  if (this.macAddress) {
    // Remove all non-alphanumeric characters first
    const cleanMac = this.macAddress.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    // Format with colons: every 2 characters, separated by colons
    this.macAddress = cleanMac.replace(/(.{2})(?=.)/g, '$1:');
  }

  const deviceType = this.deviceType || 'esp32';
  const maxPin = deviceType === 'esp8266' ? 16 : 39;

  // Ensure relayGpio is set for backward compatibility
  for (const sw of this.switches) {
    if (sw.relayGpio === undefined || sw.relayGpio === null) {
      sw.relayGpio = sw.gpio;
    }
  }

  // Validate GPIO pins based on device type
  for (const sw of this.switches) {
    // Skip GPIO validation if gpio is undefined (optional for flexible configuration)
    if (sw.gpio !== undefined && sw.gpio !== null) {
      if (sw.gpio > maxPin) {
        next(new Error(`GPIO pin ${sw.gpio} exceeds maximum for ${deviceType.toUpperCase()} (${maxPin})`));
        return;
      }
      // Validate pin safety
      if (!gpioUtils.validateGpioPin(sw.gpio, true, deviceType)) {
        const status = gpioUtils.getGpioPinStatus(sw.gpio, deviceType);
        next(new Error(`Switch GPIO ${sw.gpio}: ${status.reason}`));
        return;
      }
    }

    // Skip relay GPIO validation if relayGpio is undefined
    if (sw.relayGpio !== undefined && sw.relayGpio !== null) {
      if (sw.relayGpio > maxPin) {
        next(new Error(`Relay GPIO pin ${sw.relayGpio} exceeds maximum for ${deviceType.toUpperCase()} (${maxPin})`));
        return;
      }
      // Validate pin safety
      if (!gpioUtils.validateGpioPin(sw.relayGpio, true, deviceType)) {
        const status = gpioUtils.getGpioPinStatus(sw.relayGpio, deviceType);
        next(new Error(`Switch relay GPIO ${sw.relayGpio}: ${status.reason}`));
        return;
      }
    }

    // Skip manual switch GPIO validation if not enabled or undefined
    if (sw.manualSwitchEnabled && sw.manualSwitchGpio !== undefined && sw.manualSwitchGpio !== null) {
      if (sw.manualSwitchGpio > maxPin) {
        next(new Error(`Manual switch GPIO pin ${sw.manualSwitchGpio} exceeds maximum for ${deviceType.toUpperCase()} (${maxPin})`));
        return;
      }
      if (!gpioUtils.validateGpioPin(sw.manualSwitchGpio, true, deviceType)) {
        const status = gpioUtils.getGpioPinStatus(sw.manualSwitchGpio, deviceType);
        next(new Error(`Manual switch GPIO ${sw.manualSwitchGpio}: ${status.reason}`));
        return;
      }
    }
  }

  // Validate PIR GPIO
  if (this.pirEnabled && this.pirGpio !== undefined) {
    if (this.pirGpio > maxPin) {
      next(new Error(`PIR GPIO pin ${this.pirGpio} exceeds maximum for ${deviceType.toUpperCase()} (${maxPin})`));
      return;
    }
    if (!gpioUtils.validateGpioPin(this.pirGpio, true, deviceType)) {
      const status = gpioUtils.getGpioPinStatus(this.pirGpio, deviceType);
      next(new Error(`PIR GPIO ${this.pirGpio}: ${status.reason}`));
      return;
    }
  }

  // Handle status change timestamps
  // Only auto-set timestamps if they weren't explicitly set by the caller
  if (this.isModified('status')) {
    const now = new Date();
    
    if (this.status === 'online') {
      // Only set onlineSince if it wasn't already set by the caller
      if (!this.onlineSince) {
        this.onlineSince = now;
      }
      // Clear offlineSince when coming online (unless explicitly set)
      if (!this.isModified('offlineSince')) {
        this.offlineSince = null;
      }
    } else if (this.status === 'offline') {
      // Only set offlineSince if it wasn't already set by the caller
      if (!this.offlineSince) {
        this.offlineSince = now;
      }
      // Clear onlineSince when going offline (unless explicitly set)
      if (!this.isModified('onlineSince')) {
        this.onlineSince = null;
      }
    }
  }

  const switchNames = new Set();
  for (const sw of this.switches) {
    if (switchNames.has(sw.name)) {
      next(new Error('Switch names must be unique within a device'));
      return;
    }
    switchNames.add(sw.name);
  }
  next();
});

function normalizeStatusUpdate(update) {
  if (!update) {
    return { nextStatus: undefined, update };
  }

  let nextStatus;
  if (Object.prototype.hasOwnProperty.call(update, 'status')) {
    nextStatus = update.status;
    update.$set = { ...(update.$set || {}), status: update.status };
    delete update.status;
  } else if (update.$set && Object.prototype.hasOwnProperty.call(update.$set, 'status')) {
    nextStatus = update.$set.status;
  } else if (update.$setOnInsert && Object.prototype.hasOwnProperty.call(update.$setOnInsert, 'status')) {
    nextStatus = update.$setOnInsert.status;
  }

  return { nextStatus, update };
}

async function applyStatusTimestamps(next) {
  const update = this.getUpdate();
  if (!update) {
    return next();
  }

  const { nextStatus } = normalizeStatusUpdate(update);
  if (!nextStatus || (nextStatus !== 'online' && nextStatus !== 'offline')) {
    return next();
  }

  const set = update.$set || (update.$set = {});
  const unset = update.$unset || (update.$unset = {});

  let existingDevice;
  try {
    existingDevice = await this.model.findOne(this.getQuery()).select('status onlineSince offlineSince');
  } catch (err) {
    return next(err);
  }

  const now = new Date();

  if (nextStatus === 'online') {
    if (!existingDevice || existingDevice.status !== 'online') {
      if (set.onlineSince === undefined) {
        set.onlineSince = now;
      }
    } else if (!existingDevice.onlineSince && set.onlineSince === undefined) {
      set.onlineSince = now;
    }
    if (set.offlineSince === undefined) {
      set.offlineSince = null;
    }
    if (Object.prototype.hasOwnProperty.call(unset, 'offlineSince')) {
      delete unset.offlineSince;
    }
  } else if (nextStatus === 'offline') {
    if (!existingDevice || existingDevice.status !== 'offline') {
      if (set.offlineSince === undefined) {
        set.offlineSince = now;
      }
    } else if (!existingDevice.offlineSince && set.offlineSince === undefined) {
      set.offlineSince = now;
    }
    if (set.onlineSince === undefined) {
      set.onlineSince = null;
    }
    if (Object.prototype.hasOwnProperty.call(unset, 'onlineSince')) {
      delete unset.onlineSince;
    }
  }

  this.setUpdate(update);
  return next();
}

deviceSchema.pre('findOneAndUpdate', applyStatusTimestamps);
deviceSchema.pre('updateOne', applyStatusTimestamps);

// ============================================
// Database Indexes for Performance Optimization
// ============================================
// Unique index on macAddress for fast device lookups
deviceSchema.index({ macAddress: 1 }, { unique: true });

// Unique index on ipAddress
deviceSchema.index({ ipAddress: 1 }, { unique: true });

// Compound index for status and lastSeen queries (e.g., finding offline devices)
deviceSchema.index({ status: 1, lastSeen: -1 });

// Index for classroom-based queries (frequently used in access control)
deviceSchema.index({ classroom: 1 });

// Index for location-based queries
deviceSchema.index({ location: 1 });

// Index for device type queries
deviceSchema.index({ deviceType: 1 });

// Index for blocked device queries
deviceSchema.index({ blocked: 1 });

// Index for assigned users (for permission checks)
deviceSchema.index({ assignedUsers: 1 });

// Compound index for location-based filtering
deviceSchema.index({ location: 1, status: 1 });

// Compound index for classroom and status
deviceSchema.index({ classroom: 1, status: 1 });

// Text index for search functionality
deviceSchema.index({ 
  name: 'text', 
  location: 'text', 
  classroom: 'text' 
});

// Index for switch state queries (finding devices with switches on/off)
deviceSchema.index({ 'switches.state': 1 });

const Device = mongoose.model('Device', deviceSchema);

module.exports = Device;
module.exports.GPIOUtils = gpioUtils;
