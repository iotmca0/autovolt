# Module 3: Database & Data Models

## Overview
The Database & Data Models module manages all data persistence, aggregation, and analytics for the AutoVolt IoT classroom automation system. Built around MongoDB with Mongoose ODM, it implements dual power tracking systems, comprehensive data validation, and efficient querying for real-time and historical data.

## Technology Stack

### Database Engine
- **MongoDB** - NoSQL document database
- **Mongoose** - MongoDB object modeling for Node.js
- **MongoDB Atlas** - Cloud database service (production)

### Data Processing
- **Aggregation Framework** - Complex data processing pipelines
- **Change Streams** - Real-time data change notifications
- **GridFS** - Large file storage for firmware updates

### Performance & Monitoring
- **Database Indexing** - Optimized query performance
- **Connection Pooling** - Efficient database connections
- **Profiling** - Query performance monitoring
- **Backup & Recovery** - Data durability and restoration

## Database Architecture

### Schema Design
```
Database: autovolt
├── users                    # User accounts and permissions
├── devices                  # IoT device configurations
├── power_consumption        # Energy usage tracking (legacy)
├── power_consumption_ledger # Immutable power tracking (new)
├── device_logs              # Device operation logs
├── user_sessions            # Authentication sessions
├── notifications            # System notifications
├── firmware_updates         # OTA update tracking
└── analytics_cache          # Computed analytics data
```

### Connection Management
```javascript
// config/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      bufferMaxEntries: 0,
      retryWrites: true,
      retryReads: true
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Enable mongoose debugging in development
    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', true);
    }

  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// Close connection on app termination
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed through app termination');
  process.exit(0);
});

module.exports = { connectDB };
```

## Core Data Models

### User Model
```javascript
// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    enum: ['student', 'faculty', 'admin', 'super-admin'],
    default: 'student',
    index: true
  },
  assignedClassrooms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    index: true
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastLogin: {
    type: Date,
    index: true
  },
  preferences: {
    theme: { type: String, default: 'light' },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      telegram: { type: Boolean, default: false }
    },
    language: { type: String, default: 'en' }
  },
  profile: {
    avatar: String,
    phone: String,
    department: String,
    studentId: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return this.name;
});

// Index for efficient queries
userSchema.index({ email: 1, isActive: 1 });
userSchema.index({ role: 1, assignedClassrooms: 1 });
userSchema.index({ createdAt: -1 });

// Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method for password comparison
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Static method to find active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

module.exports = mongoose.model('User', userSchema);
```

### Device Model
```javascript
// models/Device.js
const mongoose = require('mongoose');

const switchSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  gpioPin: {
    type: Number,
    required: true,
    min: 0,
    max: 39,
    validate: {
      validator: function(v) {
        // Validate GPIO pin availability
        const reservedPins = [1, 3, 6, 7, 8, 9, 10, 11]; // UART, etc.
        return !reservedPins.includes(v);
      },
      message: 'GPIO pin {VALUE} is reserved or unavailable'
    }
  },
  state: {
    type: Boolean,
    default: false,
    index: true
  },
  manualOverride: {
    type: Boolean,
    default: false
  },
  lastStateChange: {
    type: Date,
    default: Date.now,
    index: true
  },
  powerRating: {
    type: Number,
    default: 0,
    min: 0
  },
  switchType: {
    type: String,
    enum: ['light', 'fan', 'projector', 'socket', 'custom'],
    default: 'light'
  },
  schedule: {
    enabled: { type: Boolean, default: false },
    onTime: String, // HH:MM format
    offTime: String, // HH:MM format
    daysOfWeek: [Number] // 0-6, Sunday = 0
  }
}, { _id: true });

const deviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  macAddress: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        return /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/.test(v);
      },
      message: 'MAC address must be in format AA:BB:CC:DD:EE:FF'
    },
    index: true
  },
  classroom: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  building: {
    type: String,
    trim: true,
    index: true
  },
  floor: {
    type: Number,
    min: 0
  },
  switches: [switchSchema],
  status: {
    type: String,
    enum: ['online', 'offline', 'maintenance', 'error'],
    default: 'offline',
    index: true
  },
  firmwareVersion: {
    type: String,
    default: '1.0.0'
  },
  lastSeen: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipAddress: {
    type: String,
    validate: {
      validator: function(v) {
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(v);
      },
      message: 'Invalid IP address format'
    }
  },
  assignedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }],
  config: {
    motionSensorEnabled: { type: Boolean, default: true },
    motionSensorPin: { type: Number, default: 34, min: 0, max: 39 },
    microwaveSensorEnabled: { type: Boolean, default: false },
    microwaveSensorPin: { type: Number, default: 35, min: 0, max: 39 },
    autoOffTimeout: { type: Number, default: 3600000, min: 60000 }, // 1 hour min
    energyTrackingEnabled: { type: Boolean, default: true },
    heartbeatInterval: { type: Number, default: 30000, min: 5000 }, // 30 seconds
    wifi: {
      ssid: String,
      password: String, // Encrypted
      staticIP: String,
      gateway: String,
      subnet: String
    }
  },
  hardware: {
    boardType: { type: String, default: 'esp32dev' },
    flashSize: { type: Number, default: 4194304 }, // 4MB
    psramSize: { type: Number, default: 0 },
    cpuFreq: { type: Number, default: 240 }, // MHz
  },
  telemetry: {
    uptime: { type: Number, default: 0 }, // seconds
    freeHeap: { type: Number, default: 0 }, // bytes
    wifiSignalStrength: { type: Number, default: 0 }, // dBm
    temperature: { type: Number }, // Celsius
    humidity: { type: Number } // Percentage
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for device ID
deviceSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Virtual for online status based on last seen
deviceSchema.virtual('isOnline').get(function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.lastSeen > fiveMinutesAgo && this.status === 'online';
});

// Compound indexes for efficient queries
deviceSchema.index({ classroom: 1, status: 1 });
deviceSchema.index({ building: 1, floor: 1, classroom: 1 });
deviceSchema.index({ assignedUsers: 1, status: 1 });
deviceSchema.index({ lastSeen: -1, status: 1 });
deviceSchema.index({ 'switches.state': 1, 'switches.lastStateChange': -1 });

// Pre-save middleware for data validation
deviceSchema.pre('save', function(next) {
  // Normalize MAC address format
  if (this.macAddress) {
    this.macAddress = this.macAddress.replace(/-/g, ':').toUpperCase();
  }

  // Validate GPIO pin conflicts
  const gpioPins = this.switches.map(s => s.gpioPin);
  const uniquePins = [...new Set(gpioPins)];
  if (gpioPins.length !== uniquePins.length) {
    next(new Error('Duplicate GPIO pins detected'));
  }

  next();
});

// Instance method to get active switches
deviceSchema.methods.getActiveSwitches = function() {
  return this.switches.filter(switch => switch.state);
};

// Instance method to calculate total power consumption
deviceSchema.methods.getTotalPowerConsumption = function() {
  return this.switches.reduce((total, switch) => {
    return total + (switch.state ? switch.powerRating : 0);
  }, 0);
};

// Static method to find devices by classroom
deviceSchema.statics.findByClassroom = function(classroom) {
  return this.find({ classroom, status: { $ne: 'maintenance' } });
};

module.exports = mongoose.model('Device', deviceSchema);
```

## Power Consumption Tracking

### Legacy Power Tracking System
```javascript
// models/PowerConsumption.js
const mongoose = require('mongoose');

const powerConsumptionSchema = new mongoose.Schema({
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  switchId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  classroom: {
    type: String,
    required: true,
    index: true
  },
  startTime: {
    type: Date,
    required: true,
    index: true
  },
  endTime: {
    type: Date,
    index: true
  },
  duration: {
    type: Number, // milliseconds
    required: true
  },
  powerRating: {
    type: Number,
    required: true,
    min: 0
  },
  energyConsumed: {
    type: Number, // watt-hours
    required: true,
    min: 0
  },
  cost: {
    type: Number, // currency units
    default: 0
  },
  ratePerKwh: {
    type: Number,
    default: 0
  },
  manualEntry: {
    type: Boolean,
    default: false
  },
  notes: String
}, {
  timestamps: true
});

// Compound indexes for analytics queries
powerConsumptionSchema.index({ deviceId: 1, startTime: -1 });
powerConsumptionSchema.index({ classroom: 1, startTime: -1 });
powerConsumptionSchema.index({ startTime: -1, endTime: -1 });

// Virtual for duration in hours
powerConsumptionSchema.virtual('durationHours').get(function() {
  return this.duration / (1000 * 60 * 60); // Convert to hours
});

// Instance method to calculate cost
powerConsumptionSchema.methods.calculateCost = function(rate) {
  const kwh = this.energyConsumed / 1000; // Convert Wh to kWh
  return kwh * (rate || this.ratePerKwh);
};

module.exports = mongoose.model('PowerConsumption', powerConsumptionSchema);
```

### Immutable Power Ledger System
```javascript
// models/PowerConsumptionLedger.js
const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true
  },
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device',
    required: true,
    index: true
  },
  switchId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  classroom: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true,
    immutable: true
  },
  eventType: {
    type: String,
    enum: ['switch_on', 'switch_off', 'power_reading', 'manual_adjustment'],
    required: true,
    index: true
  },
  powerState: {
    type: Boolean,
    required: true
  },
  powerRating: {
    type: Number,
    required: true,
    min: 0
  },
  cumulativeEnergy: {
    type: Number, // watt-seconds accumulated
    required: true,
    min: 0
  },
  ratePerKwh: {
    type: Number,
    required: true,
    min: 0
  },
  calculatedCost: {
    type: Number, // cost accumulated
    required: true,
    min: 0
  },
  metadata: {
    firmwareVersion: String,
    voltage: Number,
    current: Number,
    powerFactor: Number,
    temperature: Number,
    source: {
      type: String,
      enum: ['mqtt', 'api', 'manual', 'calculated'],
      default: 'mqtt'
    }
  },
  hash: {
    type: String,
    index: true
  },
  previousHash: {
    type: String,
    index: true
  }
}, {
  timestamps: true,
  collection: 'power_consumption_ledger'
});

// Make certain fields immutable
ledgerEntrySchema.pre('save', function(next) {
  if (!this.isNew) {
    // Prevent updates to immutable fields
    const immutableFields = ['timestamp', 'eventType', 'powerState', 'cumulativeEnergy'];
    immutableFields.forEach(field => {
      if (this.isModified(field)) {
        next(new Error(`Field ${field} is immutable`));
      }
    });
  }

  // Generate hash for immutability verification
  this.hash = this.generateHash();

  next();
});

// Instance method to generate hash
ledgerEntrySchema.methods.generateHash = function() {
  const crypto = require('crypto');
  const data = `${this.deviceId}${this.switchId}${this.timestamp}${this.eventType}${this.powerState}${this.cumulativeEnergy}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

// Static method to verify chain integrity
ledgerEntrySchema.statics.verifyChainIntegrity = async function(deviceId, switchId) {
  const entries = await this.find({ deviceId, switchId }).sort({ timestamp: 1 });

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].previousHash !== entries[i-1].hash) {
      return { valid: false, invalidEntry: entries[i] };
    }
  }

  return { valid: true };
};

// Compound indexes for efficient queries
ledgerEntrySchema.index({ deviceId: 1, switchId: 1, timestamp: -1 });
ledgerEntrySchema.index({ classroom: 1, timestamp: -1 });
ledgerEntrySchema.index({ eventType: 1, timestamp: -1 });

module.exports = mongoose.model('PowerConsumptionLedger', ledgerEntrySchema);
```

## Data Aggregation Pipelines

### Daily Energy Consumption Report
```javascript
// services/analyticsService.js
const mongoose = require('mongoose');
const PowerConsumption = require('../models/PowerConsumption');

class AnalyticsService {
  // Daily energy consumption by classroom
  async getDailyConsumptionByClassroom(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const pipeline = [
      {
        $match: {
          startTime: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: '$classroom',
          totalEnergy: { $sum: '$energyConsumed' },
          totalCost: { $sum: '$cost' },
          switchCount: { $addToSet: '$switchId' },
          recordCount: { $sum: 1 }
        }
      },
      {
        $project: {
          classroom: '$_id',
          totalEnergy: 1,
          totalCost: 1,
          uniqueSwitches: { $size: '$switchCount' },
          recordCount: 1,
          averageEnergyPerSwitch: {
            $divide: ['$totalEnergy', { $size: '$switchCount' }]
          }
        }
      },
      {
        $sort: { totalEnergy: -1 }
      }
    ];

    return PowerConsumption.aggregate(pipeline);
  }

  // Monthly consumption trends
  async getMonthlyConsumptionTrends(classroom, year) {
    const pipeline = [
      {
        $match: {
          classroom: classroom,
          startTime: {
            $gte: new Date(year, 0, 1),
            $lt: new Date(year + 1, 0, 1)
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$startTime' },
            month: { $month: '$startTime' }
          },
          totalEnergy: { $sum: '$energyConsumed' },
          totalCost: { $sum: '$cost' },
          daysActive: { $addToSet: { $dayOfMonth: '$startTime' } }
        }
      },
      {
        $project: {
          month: '$_id.month',
          year: '$_id.year',
          totalEnergy: 1,
          totalCost: 1,
          activeDays: { $size: '$daysActive' },
          averageDailyEnergy: {
            $divide: ['$totalEnergy', { $size: '$daysActive' }]
          }
        }
      },
      {
        $sort: { 'year': 1, 'month': 1 }
      }
    ];

    return PowerConsumption.aggregate(pipeline);
  }

  // Peak usage hours analysis
  async getPeakUsageHours(classroom, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const pipeline = [
      {
        $match: {
          classroom: classroom,
          startTime: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: { $hour: '$startTime' },
          totalEnergy: { $sum: '$energyConsumed' },
          switchCount: { $sum: 1 }
        }
      },
      {
        $project: {
          hour: '$_id',
          totalEnergy: 1,
          switchCount: 1,
          averageEnergyPerSwitch: {
            $divide: ['$totalEnergy', '$switchCount']
          }
        }
      },
      {
        $sort: { totalEnergy: -1 }
      }
    ];

    return PowerConsumption.aggregate(pipeline);
  }

  // Device efficiency analysis
  async getDeviceEfficiencyReport() {
    const pipeline = [
      {
        $lookup: {
          from: 'devices',
          localField: 'deviceId',
          foreignField: '_id',
          as: 'device'
        }
      },
      {
        $unwind: '$device'
      },
      {
        $group: {
          _id: '$deviceId',
          deviceName: { $first: '$device.name' },
          classroom: { $first: '$device.classroom' },
          totalEnergy: { $sum: '$energyConsumed' },
          totalDuration: { $sum: '$duration' },
          switchCount: { $addToSet: '$switchId' }
        }
      },
      {
        $project: {
          deviceName: 1,
          classroom: 1,
          totalEnergy: 1,
          totalDurationHours: {
            $divide: ['$totalDuration', 3600000] // Convert to hours
          },
          uniqueSwitches: { $size: '$switchCount' },
          averagePower: {
            $divide: ['$totalEnergy', { $divide: ['$totalDuration', 3600000] }]
          }
        }
      },
      {
        $sort: { totalEnergy: -1 }
      }
    ];

    return PowerConsumption.aggregate(pipeline);
  }
}

module.exports = new AnalyticsService();
```

### Real-time Analytics Cache
```javascript
// models/AnalyticsCache.js
const mongoose = require('mongoose');

const analyticsCacheSchema = new mongoose.Schema({
  cacheKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  cacheType: {
    type: String,
    enum: ['daily_consumption', 'monthly_trends', 'peak_hours', 'efficiency_report'],
    required: true,
    index: true
  },
  parameters: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  },
  computationTime: {
    type: Number, // milliseconds
    required: true
  },
  dataSize: {
    type: Number, // bytes
    required: true
  }
}, {
  timestamps: true
});

// Static method to get cached data
analyticsCacheSchema.statics.getCachedData = async function(cacheKey) {
  const cached = await this.findOne({
    cacheKey,
    expiresAt: { $gt: new Date() }
  });

  return cached ? cached.data : null;
};

// Static method to set cached data
analyticsCacheSchema.statics.setCachedData = async function(cacheKey, cacheType, parameters, data, ttlMinutes = 60) {
  const computationTime = Date.now();
  const dataSize = JSON.stringify(data).length;

  await this.findOneAndUpdate(
    { cacheKey },
    {
      cacheType,
      parameters,
      data,
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      lastUpdated: new Date(),
      computationTime: Date.now() - computationTime,
      dataSize
    },
    { upsert: true, new: true }
  );
};

// Clean expired cache entries
analyticsCacheSchema.statics.cleanExpired = function() {
  return this.deleteMany({
    expiresAt: { $lt: new Date() }
  });
};

module.exports = mongoose.model('AnalyticsCache', analyticsCacheSchema);
```

## Database Optimization

### Indexing Strategy
```javascript
// scripts/createIndexes.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Device = require('../models/Device');
const PowerConsumption = require('../models/PowerConsumption');

async function createIndexes() {
  try {
    console.log('Creating database indexes...');

    // User indexes
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await User.collection.createIndex({ role: 1 });
    await User.collection.createIndex({ isActive: 1 });
    await User.collection.createIndex({ lastLogin: -1 });

    // Device indexes
    await Device.collection.createIndex({ macAddress: 1 }, { unique: true });
    await Device.collection.createIndex({ classroom: 1, status: 1 });
    await Device.collection.createIndex({ assignedUsers: 1 });
    await Device.collection.createIndex({ lastSeen: -1 });
    await Device.collection.createIndex({ 'switches.state': 1 });
    await Device.collection.createIndex({ 'switches.lastStateChange': -1 });

    // Power consumption indexes
    await PowerConsumption.collection.createIndex({ deviceId: 1, startTime: -1 });
    await PowerConsumption.collection.createIndex({ classroom: 1, startTime: -1 });
    await PowerConsumption.collection.createIndex({ startTime: -1, endTime: -1 });

    // Compound indexes for complex queries
    await Device.collection.createIndex({
      building: 1,
      floor: 1,
      classroom: 1
    });

    await PowerConsumption.collection.createIndex({
      classroom: 1,
      startTime: -1,
      endTime: -1
    });

    console.log('All indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGODB_URI);
  createIndexes();
}

module.exports = { createIndexes };
```

### Performance Monitoring
```javascript
// services/databaseMonitor.js
const mongoose = require('mongoose');

class DatabaseMonitor {
  async getConnectionStats() {
    const admin = mongoose.connection.db.admin();
    const stats = await admin.serverStatus();

    return {
      connections: {
        current: stats.connections.current,
        available: stats.connections.available,
        totalCreated: stats.connections.totalCreated
      },
      memory: {
        resident: stats.mem.resident,
        virtual: stats.mem.virtual,
        mapped: stats.mem.mapped
      },
      operations: {
        insert: stats.opcounters.insert,
        query: stats.opcounters.query,
        update: stats.opcounters.update,
        delete: stats.opcounters.delete
      },
      network: {
        bytesIn: stats.network.bytesIn,
        bytesOut: stats.network.bytesOut,
        numRequests: stats.network.numRequests
      }
    };
  }

  async getSlowQueries(threshold = 100) {
    // Enable profiling
    await mongoose.connection.db.setProfilingLevel(2, { slowms: threshold });

    // Get recent slow queries
    const systemProfile = mongoose.connection.db.collection('system.profile');
    const slowQueries = await systemProfile
      .find({ millis: { $gt: threshold } })
      .sort({ ts: -1 })
      .limit(10)
      .toArray();

    return slowQueries.map(query => ({
      operation: query.op,
      collection: query.ns,
      duration: query.millis,
      timestamp: query.ts,
      query: query.query,
      planSummary: query.planSummary
    }));
  }

  async getIndexUsage() {
    const admin = mongoose.connection.db.admin();
    const indexStats = await admin.command({ indexStats: 1 });

    return indexStats.cursor.firstBatch.map(stat => ({
      collection: stat.ns,
      index: stat.name,
      usage: {
        accesses: stat.accesses?.ops || 0,
        since: stat.accesses?.since || null
      }
    }));
  }

  async optimizeCollection(collectionName) {
    const collection = mongoose.connection.db.collection(collectionName);
    const result = await collection.optimize();

    return {
      collection: collectionName,
      optimized: result.ok === 1,
      details: result
    };
  }
}

module.exports = new DatabaseMonitor();
```

## Data Migration & Backup

### Migration Framework
```javascript
// scripts/migratePowerData.js
const mongoose = require('mongoose');
const PowerConsumption = require('../models/PowerConsumption');
const PowerConsumptionLedger = require('../models/PowerConsumptionLedger');

async function migratePowerData() {
  try {
    console.log('Starting power consumption data migration...');

    const batchSize = 1000;
    let processed = 0;
    let migrated = 0;

    // Get all power consumption records
    const totalRecords = await PowerConsumption.countDocuments();
    console.log(`Found ${totalRecords} records to migrate`);

    while (processed < totalRecords) {
      const records = await PowerConsumption
        .find({})
        .skip(processed)
        .limit(batchSize)
        .sort({ startTime: 1 });

      if (records.length === 0) break;

      const ledgerEntries = [];

      for (const record of records) {
        // Create ledger entries for switch on and off events
        const switchOnEntry = {
          deviceId: record.deviceId,
          switchId: record.switchId,
          classroom: record.classroom,
          timestamp: record.startTime,
          eventType: 'switch_on',
          powerState: true,
          powerRating: record.powerRating,
          cumulativeEnergy: 0, // Will be calculated
          ratePerKwh: record.ratePerKwh,
          calculatedCost: 0,
          metadata: {
            source: 'migration',
            originalRecordId: record._id
          }
        };

        const switchOffEntry = {
          ...switchOnEntry,
          timestamp: record.endTime || new Date(record.startTime.getTime() + record.duration),
          eventType: 'switch_off',
          powerState: false,
          cumulativeEnergy: record.energyConsumed,
          calculatedCost: record.cost
        };

        ledgerEntries.push(switchOnEntry, switchOffEntry);
      }

      // Insert ledger entries
      if (ledgerEntries.length > 0) {
        await PowerConsumptionLedger.insertMany(ledgerEntries);
        migrated += ledgerEntries.length;
      }

      processed += records.length;
      console.log(`Processed ${processed}/${totalRecords} records, migrated ${migrated} ledger entries`);
    }

    console.log('Migration completed successfully');
    console.log(`Total records processed: ${processed}`);
    console.log(`Total ledger entries created: ${migrated}`);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

module.exports = { migratePowerData };
```

### Backup Strategy
```javascript
// scripts/backupDatabase.js
const mongoose = require('mongoose');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class DatabaseBackup {
  constructor() {
    this.backupDir = process.env.BACKUP_DIR || './backups';
    this.retentionDays = process.env.BACKUP_RETENTION_DAYS || 30;
  }

  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `autovolt_backup_${timestamp}`;
      const backupPath = path.join(this.backupDir, backupName);

      // Ensure backup directory exists
      await fs.mkdir(backupPath, { recursive: true });

      // Create MongoDB dump
      const dumpCommand = `mongodump --db autovolt --out ${backupPath}`;

      await this.executeCommand(dumpCommand);
      console.log(`Database backup created: ${backupPath}`);

      // Compress backup
      const archivePath = `${backupPath}.tar.gz`;
      const compressCommand = `tar -czf ${archivePath} -C ${this.backupDir} ${backupName}`;

      await this.executeCommand(compressCommand);

      // Remove uncompressed backup
      await fs.rmdir(backupPath, { recursive: true });

      console.log(`Backup compressed: ${archivePath}`);

      // Clean old backups
      await this.cleanOldBackups();

      return archivePath;

    } catch (error) {
      console.error('Backup creation failed:', error);
      throw error;
    }
  }

  async restoreBackup(backupPath) {
    try {
      console.log(`Restoring backup from: ${backupPath}`);

      // Extract backup if compressed
      if (backupPath.endsWith('.tar.gz')) {
        const extractCommand = `tar -xzf ${backupPath} -C ${this.backupDir}`;
        await this.executeCommand(extractCommand);

        // Update backup path to extracted directory
        backupPath = backupPath.replace('.tar.gz', '');
      }

      // Restore MongoDB dump
      const restoreCommand = `mongorestore --db autovolt --drop ${backupPath}`;

      await this.executeCommand(restoreCommand);
      console.log('Database restored successfully');

    } catch (error) {
      console.error('Database restoration failed:', error);
      throw error;
    }
  }

  async cleanOldBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          console.log(`Deleted old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning old backups:', error);
    }
  }

  executeCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }
}

module.exports = new DatabaseBackup();
```

This comprehensive database module provides robust data persistence, advanced analytics capabilities, and efficient data management for the AutoVolt IoT classroom automation system, supporting both legacy and modern immutable data tracking approaches.