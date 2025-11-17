# Module 2: Backend API & Authentication

## Overview
The Backend API & Authentication module provides the server-side API infrastructure for the AutoVolt IoT classroom automation system. Built with Node.js and Express.js, it handles authentication, authorization, real-time communication, and API endpoints for device management and user operations.

## Technology Stack

### Core Framework
- **Node.js** - JavaScript runtime environment
- **Express.js** - Web application framework
- **TypeScript** - Type-safe backend development
- **Socket.io** - Real-time bidirectional communication

### Authentication & Security
- **JWT (JSON Web Tokens)** - Stateless authentication
- **bcrypt** - Password hashing
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Rate Limiting** - API request throttling

### Database Integration
- **MongoDB** - NoSQL database
- **Mongoose** - MongoDB object modeling
- **Redis** - Caching and session storage

### API Documentation
- **Swagger/OpenAPI** - API documentation
- **JSDoc** - Code documentation
- **Postman Collections** - API testing

## Architecture

### Server Structure
```
backend/
├── server.js              # Main application entry point
├── app.js                 # Express application setup
├── config/                # Configuration files
│   ├── database.js        # Database connection
│   ├── redis.js          # Redis configuration
│   └── mqtt.js           # MQTT broker config
├── controllers/           # Route controllers
│   ├── authController.js # Authentication logic
│   ├── deviceController.js # Device management
│   └── userController.js # User management
├── middleware/            # Express middleware
│   ├── auth.js           # Authentication middleware
│   ├── validation.js     # Request validation
│   └── error.js          # Error handling
├── models/                # Database models
│   ├── User.js           # User schema
│   ├── Device.js         # Device schema
│   └── Session.js        # Session schema
├── routes/                # API route definitions
│   ├── auth.js           # Authentication routes
│   ├── devices.js        # Device routes
│   └── users.js          # User routes
├── services/              # Business logic services
│   ├── authService.js    # Authentication service
│   ├── deviceService.js  # Device operations
│   └── notificationService.js # Notification handling
├── utils/                 # Utility functions
└── tests/                 # Test files
```

### Main Application Setup
```javascript
// server.js - Main entry point
const app = require('./app');
const { connectDB } = require('./config/database');
const { initializeMQTT } = require('./config/mqtt');
const { initializeSocket } = require('./socket');

const PORT = process.env.PORT || 3001;

// Connect to database
connectDB();

// Initialize MQTT broker
initializeMQTT();

// Initialize Socket.io
const server = require('http').createServer(app);
initializeSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## Authentication System

### JWT Authentication
```javascript
// middleware/auth.js - Authentication middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
```

### User Registration & Login
```javascript
// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const register = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
      email,
      password: hashedPassword,
      name,
      role: role || 'student'
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { register, login };
```

## API Routes

### Authentication Routes
```javascript
// routes/auth.js
const express = require('express');
const { register, login } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', authenticate, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role
    }
  });
});

module.exports = router;
```

### Device Management Routes
```javascript
// routes/devices.js
const express = require('express');
const {
  getDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  toggleSwitch
} = require('../controllers/deviceController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All device routes require authentication
router.use(authenticate);

// Get all devices (filtered by user permissions)
router.get('/', getDevices);

// Get specific device
router.get('/:id', getDevice);

// Create new device (admin only)
router.post('/', authorize('admin', 'super-admin'), createDevice);

// Update device (admin only)
router.put('/:id', authorize('admin', 'super-admin'), updateDevice);

// Delete device (admin only)
router.delete('/:id', authorize('admin', 'super-admin'), deleteDevice);

// Toggle device switch
router.post('/:deviceId/switches/:switchId/toggle', toggleSwitch);

module.exports = router;
```

## Real-time Communication

### Socket.io Integration
```javascript
// socket/index.js
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const initializeSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST']
    }
  });

  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.userId} connected`);

    // Join user-specific room
    socket.join(`user_${socket.userId}`);

    // Handle device control events
    socket.on('switch_intent', async (data) => {
      try {
        // Process switch intent
        const result = await processSwitchIntent(data, socket.userId);

        // Broadcast to all clients viewing this device
        io.to(`device_${data.deviceId}`).emit('device_state_changed', result);

        // Confirm to sender
        socket.emit('switch_intent_ack', { success: true });
      } catch (error) {
        socket.emit('switch_intent_ack', { success: false, error: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User ${socket.userId} disconnected`);
    });
  });

  return io;
};

module.exports = { initializeSocket };
```

### MQTT Integration
```javascript
// config/mqtt.js
const mqtt = require('mqtt');
const Device = require('../models/Device');

let mqttClient;

const initializeMQTT = () => {
  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';

  mqttClient = mqtt.connect(brokerUrl, {
    clientId: 'autovolt_backend_' + Date.now(),
    clean: true,
    connectTimeout: 4000,
    reconnectPeriod: 1000,
  });

  mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker');

    // Subscribe to device topics
    mqttClient.subscribe('esp32/#', (err) => {
      if (!err) {
        console.log('Subscribed to ESP32 topics');
      }
    });
  });

  mqttClient.on('message', async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      await handleMQTTMessage(topic, payload);
    } catch (error) {
      console.error('Error processing MQTT message:', error);
    }
  });

  mqttClient.on('error', (error) => {
    console.error('MQTT connection error:', error);
  });
};

const handleMQTTMessage = async (topic, payload) => {
  const topicParts = topic.split('/');
  const deviceId = topicParts[1];
  const messageType = topicParts[2];

  switch (messageType) {
    case 'state':
      await handleDeviceStateUpdate(deviceId, payload);
      break;
    case 'telemetry':
      await handleDeviceTelemetry(deviceId, payload);
      break;
    case 'config':
      await handleDeviceConfigUpdate(deviceId, payload);
      break;
    default:
      console.log(`Unknown message type: ${messageType}`);
  }
};

const publishToDevice = (deviceId, topic, payload) => {
  const fullTopic = `esp32/${deviceId}/${topic}`;
  mqttClient.publish(fullTopic, JSON.stringify(payload));
};

module.exports = { initializeMQTT, publishToDevice };
```

## Database Models

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
    trim: true
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
    default: 'student'
  },
  assignedClassrooms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Device'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true
});

// Hash password before saving
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

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
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
    required: true
  },
  gpioPin: {
    type: Number,
    required: true,
    min: 0,
    max: 39
  },
  state: {
    type: Boolean,
    default: false
  },
  manualOverride: {
    type: Boolean,
    default: false
  },
  lastStateChange: {
    type: Date,
    default: Date.now
  },
  powerRating: {
    type: Number,
    default: 0
  }
});

const deviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  macAddress: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(v);
      },
      message: 'MAC address must be in format AA:BB:CC:DD:EE:FF'
    }
  },
  classroom: {
    type: String,
    required: true
  },
  switches: [switchSchema],
  status: {
    type: String,
    enum: ['online', 'offline', 'maintenance'],
    default: 'offline'
  },
  firmwareVersion: {
    type: String,
    default: '1.0.0'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  assignedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  config: {
    motionSensorEnabled: { type: Boolean, default: true },
    autoOffTimeout: { type: Number, default: 3600000 }, // 1 hour
    energyTrackingEnabled: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

// Virtual for device ID
deviceSchema.virtual('id').get(function() {
  return this._id.toHexString();
});

// Ensure virtual fields are serialized
deviceSchema.set('toJSON', {
  virtuals: true
});

// Index for efficient queries
deviceSchema.index({ classroom: 1, status: 1 });
deviceSchema.index({ macAddress: 1 });
deviceSchema.index({ assignedUsers: 1 });

module.exports = mongoose.model('Device', deviceSchema);
```

## Error Handling & Validation

### Global Error Handler
```javascript
// middleware/error.js
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  console.error(err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
```

### Request Validation
```javascript
// middleware/validation.js
const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long'),
  handleValidationErrors
];

const validateDeviceCreation = [
  body('name')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Device name is required'),
  body('macAddress')
    .matches(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)
    .withMessage('Invalid MAC address format'),
  body('classroom')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Classroom is required'),
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateDeviceCreation,
  handleValidationErrors
};
```

## Security Features

### Rate Limiting
```javascript
// middleware/rateLimit.js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, apiLimiter };
```

### CORS Configuration
```javascript
// middleware/cors.js
const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:5173', // Vite dev server
      'http://localhost:3000', // Production build
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

module.exports = cors(corsOptions);
```

## Testing Strategy

### Unit Testing
```javascript
// tests/authController.test.js
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');

describe('Auth Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(userData.email);
    });

    it('should not register user with existing email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      };

      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.error).toBe('User already exists');
    });
  });
});
```

### Integration Testing
```javascript
// tests/deviceRoutes.test.js
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Device = require('../models/Device');

describe('Device Routes', () => {
  let token;
  let user;

  beforeEach(async () => {
    // Create test user
    user = await User.create({
      email: 'admin@example.com',
      password: 'password123',
      name: 'Admin User',
      role: 'admin'
    });

    // Generate token
    const jwt = require('jsonwebtoken');
    token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET
    );
  });

  describe('GET /api/devices', () => {
    it('should get all devices for authenticated user', async () => {
      const response = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });
});
```

## Performance Optimization

### Caching Strategy
```javascript
// services/cacheService.js
const redis = require('redis');

class CacheService {
  constructor() {
    this.client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });
  }

  async get(key) {
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }
}

module.exports = new CacheService();
```

### Database Optimization
```javascript
// config/database.js
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      bufferCommands: false, // Disable mongoose buffering
      bufferMaxEntries: 0 // Disable mongoose buffering
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

module.exports = { connectDB };
```

This comprehensive backend API module provides a robust, secure, and scalable server-side infrastructure for the AutoVolt IoT classroom automation system, handling authentication, real-time communication, and device management operations.