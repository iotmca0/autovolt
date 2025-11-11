const Device = require('../models/Device');
const gpioUtils = require('../utils/gpioUtils');
const { logger } = require('../middleware/logger');
const powerTracker = require('../services/powerConsumptionTracker'); // Power tracking service
// Per-device command sequence for strict ordering to devices
const _cmdSeqMap = new Map(); // mac -> last seq
function nextCmdSeq(mac) {
  if (!mac) return 0;
  const key = mac.toUpperCase();
  const prev = _cmdSeqMap.get(key) || 0;
  const next = prev + 1;
  _cmdSeqMap.set(key, next);
  return next;
}
const crypto = require('crypto');
const ActivityLog = require('../models/ActivityLog');
const SecurityAlert = require('../models/SecurityAlert');
// Access io via req.app.get('io') where needed instead of legacy socketService

// Helper function to build device access query based on user permissions
function buildDeviceAccessQuery(user) {
  if (user.role === 'admin' || user.role === 'super-admin') {
    return {}; // Admin can access all devices
  }

  // Allow security personnel and users explicitly granted monitoring access to view all devices/classrooms
  if (user.role === 'security' || (user.permissions && user.permissions.canMonitorSecurity) || (user.classroomPermissions && user.classroomPermissions.canAccessAllClassrooms)) {
    return {};
  }

  const accessConditions = [];

  // Direct device assignments
  if (user.assignedDevices && user.assignedDevices.length > 0) {
    accessConditions.push({ _id: { $in: user.assignedDevices } });
  }

  // Classroom-based access
  if (user.assignedRooms && user.assignedRooms.length > 0) {
    accessConditions.push({ classroom: { $in: user.assignedRooms } });
  }

  // Department-based access for management and faculty roles
  if ((user.role === 'principal' || user.role === 'dean' || user.role === 'hod' || user.role === 'faculty') && user.department) {
    accessConditions.push({
      classroom: { $regex: `^${user.department}-`, $options: 'i' }
    });
  }

  if (accessConditions.length === 0) {
    return null; // No access to any devices
  }

  return { $or: accessConditions };
}

// Per-device access check. Returns true if user may view/control the specific device.
function userHasAccessToDevice(user, device) {
  if (!user || !device) return false;
  // Admins and security personnel have blanket access/control
  if (user.role === 'admin' || user.role === 'super-admin' || user.role === 'security') return true;

  // Explicit permission flags
  if (user.permissions && (user.permissions.canMonitorSecurity || user.permissions.canControlDevices)) return true;
  if (user.classroomPermissions && user.classroomPermissions.canAccessAllClassrooms) return true;

  // Direct device assignment
  if (Array.isArray(user.assignedDevices) && user.assignedDevices.some(d => d && d.toString() === (device._id ? device._id.toString() : device.toString()))) return true;

  // Room / classroom assignment
  if (Array.isArray(user.assignedRooms) && device.classroom && user.assignedRooms.includes(device.classroom)) return true;

  // Department-level access for management/faculty
  if ((user.role === 'principal' || user.role === 'dean' || user.role === 'hod' || user.role === 'faculty') && user.department && device.classroom) {
    try {
      return device.classroom.toLowerCase().startsWith(`${user.department.toLowerCase()}-`);
    } catch (e) {
      return false;
    }
  }

  return false;
}

const getAllDevices = async (req, res) => {
  try {
    const query = buildDeviceAccessQuery(req.user);
    if (query === null) {
      return res.json({
        success: true,
        data: []
      });
    }

    // Filter devices based on access control
    const deviceQuery = query;

    const devices = await Device.find(deviceQuery).populate('assignedUsers', 'name email role').lean();

    res.json({
      success: true,
      data: devices
    });
  } catch (error) {
    if (error && error.code === 11000) {
      const dupField = Object.keys(error.keyPattern || {})[0];
      return res.status(400).json({
        error: 'Validation failed',
        details: `Device with this ${dupField || 'value'} already exists`
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const createDevice = async (req, res) => {
  try {
    const {
      name,
      macAddress,
      ipAddress,
      location,
      classroom,
      deviceType = 'esp32',
      pirEnabled = false,
      pirGpio,
      pirAutoOffDelay = 300, // 5 minutes default
      pirSensorType = 'hc-sr501',
      pirSensitivity = 50,
      pirDetectionRange = 5,
      motionDetectionLogic = 'and',
      pirDetectionSchedule,
      switches = []
    } = req.body;

    // Validate required fields (ipAddress also required by schema)
    if (!name || !macAddress || !location || !ipAddress) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Name, MAC address, IP address, and location are required'
      });
    }

    // Accept any non-empty string for MAC address (let model normalization handle it)
    if (!macAddress || typeof macAddress !== 'string' || macAddress.length < 6) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'MAC address is required.'
      });
    }
    // Check for existing device with same MAC address (normalize to colon format for comparison)
    const normalizeMacForCheck = (mac) => {
      const cleanMac = mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
      return cleanMac.replace(/(.{2})(?=.)/g, '$1:');
    };
    const normalizedMacForCheck = normalizeMacForCheck(macAddress);
    
    const existingDevice = await Device.findOne({
      $or: [
        { macAddress },
        { macAddress: macAddress.toUpperCase() },
        { macAddress: macAddress.toLowerCase() },
        { macAddress: macAddress.replace(/[^a-fA-F0-9]/g, '').toLowerCase() },
        { macAddress: macAddress.replace(/[^a-fA-F0-9]/g, '').toUpperCase() },
        { macAddress: normalizedMacForCheck }
      ]
    });
    if (existingDevice) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Device with this MAC address already exists'
      });
    }

    // Validate IP address format & duplicates
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ipAddress)) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Invalid IP address format'
      });
    }
    const octetsOk = ipAddress.split('.').every(o => Number(o) >= 0 && Number(o) <= 255);
    if (!octetsOk) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Each IP octet must be between 0 and 255'
      });
    }
    const existingIP = await Device.findOne({ ipAddress });
    if (existingIP) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Device with this IP address already exists'
      });
    }

    // Validate GPIO configuration using comprehensive validation
    const gpioConfig = {
      switches,
      pirEnabled,
      pirGpio
    };
    const gpioValidation = gpioUtils.validateGpioConfiguration(gpioConfig);

    if (!gpioValidation.valid) {
      return res.status(400).json({
        error: 'GPIO Validation Failed',
        details: 'Invalid GPIO pin configuration',
        errors: gpioValidation.errors,
        warnings: gpioValidation.warnings
      });
    }

    // Log warnings if any (but don't block creation)
    if (gpioValidation.warnings.length > 0) {
      console.warn('[createDevice] GPIO warnings:', gpioValidation.warnings);
    }

    // Create new device
    // Generate a secure device secret (48 hex chars) if not provided
    const deviceSecret = crypto.randomBytes(24).toString('hex');

    const device = new Device({
      name,
  macAddress,
      ipAddress,
      location,
      classroom,
      deviceType,
      pirEnabled,
      pirGpio,
      pirAutoOffDelay,
      pirSensorType,
      pirSensitivity,
      pirDetectionRange,
      motionDetectionLogic,
      pirDetectionSchedule,
      switches: switches.map(sw => ({
        name: sw.name,
        gpio: sw.gpio,
        relayGpio: sw.relayGpio ?? sw.gpio, // Ensure relayGpio is set
        type: sw.type || 'relay',
        state: false, // force default off; ignore provided state
        icon: sw.icon || 'lightbulb',
        manualSwitchEnabled: !!sw.manualSwitchEnabled,
        manualSwitchGpio: sw.manualSwitchGpio,
        manualMode: sw.manualMode || 'maintained',
        manualActiveLow: sw.manualActiveLow !== undefined ? sw.manualActiveLow : true,
        lastStateChange: new Date()
      })),
      deviceSecret,
      createdBy: req.user.id,
      lastModifiedBy: req.user.id
    });

    await device.save();
    // Log activity with new action type
    try {
      await ActivityLog.create({
        deviceId: device._id,
        action: 'device_created',
        triggeredBy: 'system',
        userId: req.user.id,
        userName: req.user.name,
        deviceName: device.name,
        classroom: device.classroom,
        location: device.location
      });
    } catch (logErr) {
      if (process.env.NODE_ENV !== 'production') console.warn('[deviceController] activity log failed', logErr.message);
    }

    // Broadcast new device
    const emitDeviceStateChanged = req.app.get('emitDeviceStateChanged');
    if (emitDeviceStateChanged) {
      emitDeviceStateChanged(device, { source: 'controller:createDevice' });
    } else {
      req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device, ts: Date.now() });
    }

    // Emit notification to all connected users with appropriate permissions
    if (req.app.get('io')) {
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.notifyDeviceStatusChange(device._id, 'created', device.name, device.location);
      } else {
        req.app.get('io').emit('device_notification', {
          type: 'device_created',
          message: `New device "${device.name}" created in ${device.location}`,
          deviceId: device._id,
          deviceName: device.name,
          location: device.location,
          metadata: {
            deviceId: device._id,
            deviceName: device.name,
            deviceLocation: device.location,
            deviceClassroom: device.classroom,
            createdBy: req.user.name,
            switchCount: device.switches.length
          },
          timestamp: new Date()
        });
      }
    }

    // Push updated config to ESP32 if connected (include manual fields)
    try {
      if (global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) {
          const cfgMsg = {
            type: 'config_update',
            mac: device.macAddress,
            switches: device.switches.map((sw, idx) => ({
              order: idx,
              gpio: sw.relayGpio ?? sw.gpio,
              relayGpio: sw.relayGpio ?? sw.gpio,
              name: sw.name,
              manualGpio: sw.manualSwitchGpio ?? sw.manualGpio,
              manualSwitchGpio: sw.manualSwitchGpio ?? sw.manualGpio,
              manualSwitchEnabled: sw.manualSwitchEnabled,
              manualMode: sw.manualMode,
              manualActiveLow: sw.manualActiveLow,
              state: sw.state
            })),
            pirEnabled: device.pirEnabled,
            pirGpio: device.pirGpio,
            pirAutoOffDelay: device.pirAutoOffDelay,
            pirSensorType: device.pirSensorType,
            pirSensitivity: device.pirSensitivity,
            pirDetectionRange: device.pirDetectionRange,
            motionDetectionLogic: device.motionDetectionLogic
          };
          ws.send(JSON.stringify(cfgMsg));
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[device_update config_update push failed]', e.message);
    }
    // Broadcast new configuration as separate config_update
    try {
      const cfgMsg = {
        type: 'config_update',
        deviceId: device.id,
        switches: device.switches.map((sw, idx) => ({
          order: idx,
          gpio: sw.relayGpio ?? sw.gpio,
          relayGpio: sw.relayGpio ?? sw.gpio,
          name: sw.name,
          manualGpio: sw.manualSwitchGpio ?? sw.manualGpio,
          manualSwitchGpio: sw.manualSwitchGpio ?? sw.manualGpio,
          manualSwitchEnabled: sw.manualSwitchEnabled,
          manualMode: sw.manualMode,
          manualActiveLow: sw.manualActiveLow,
          state: sw.state
        })),
        pirEnabled: device.pirEnabled,
        pirGpio: device.pirGpio,
        pirAutoOffDelay: device.pirAutoOffDelay,
        pirSensorType: device.pirSensorType,
        pirSensitivity: device.pirSensitivity,
        pirDetectionRange: device.pirDetectionRange,
        motionDetectionLogic: device.motionDetectionLogic
      };
      req.app.get('io').emit('config_update', cfgMsg);
      if (global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(cfgMsg));
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[config_update emit failed]', e.message);
    }

    // Include secret separately so API clients can capture it (model hides it by select:false in future fetches)
    res.status(201).json({
      success: true,
      data: device,
      deviceSecret // expose once on create
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      name,
      macAddress,
      ipAddress,
      location,
      classroom,
      deviceType,
      pirEnabled,
      pirGpio,
      pirAutoOffDelay,
      pirSensorType,
      pirSensitivity,
      pirDetectionRange,
      motionDetectionLogic,
      pirDetectionSchedule,
      switches,
      status,
      lastSeen
    } = req.body;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    function normalizeMac(mac) {
      // Normalize MAC address: ensure proper colon formatting (AA:BB:CC:DD:EE:FF)
      // Remove all non-alphanumeric characters first
      const cleanMac = mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
      // Format with colons: every 2 characters, separated by colons
      return cleanMac.replace(/(.{2})(?=.)/g, '$1:');
    }
    let normalizedMac = macAddress ? normalizeMac(macAddress) : undefined;
    if (macAddress && (typeof macAddress !== 'string' || macAddress.length < 6)) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'MAC address is required.'
      });
    }
    // Check for duplicate MAC address if changed
    if (macAddress && normalizedMac !== device.macAddress) {
      const existingDeviceMAC = await Device.findOne({
        $or: [
          { macAddress },
          { macAddress: macAddress.toUpperCase() },
          { macAddress: macAddress.toLowerCase() },
          { macAddress: macAddress.replace(/[^a-fA-F0-9]/g, '').toLowerCase() },
          { macAddress: macAddress.replace(/[^a-fA-F0-9]/g, '').toUpperCase() },
          { macAddress: normalizedMac }
        ],
        _id: { $ne: deviceId }
      });
      if (existingDeviceMAC) {
        return res.status(400).json({ message: 'Device with this MAC address already exists' });
      }
    }

    // Check for duplicate IP address if changed
    if (ipAddress && ipAddress !== device.ipAddress) {
      const existingDeviceIP = await Device.findOne({ ipAddress });
      if (existingDeviceIP) {
        return res.status(400).json({ message: 'Device with this IP address already exists' });
      }
    }

    // Update device
    device.name = name || device.name;
  device.macAddress = macAddress || device.macAddress;
    device.ipAddress = ipAddress || device.ipAddress;
    device.location = location || device.location;
    device.classroom = classroom || device.classroom;
    device.deviceType = deviceType || device.deviceType;
    device.pirEnabled = pirEnabled !== undefined ? pirEnabled : device.pirEnabled;
    device.pirGpio = pirGpio || device.pirGpio;
    device.pirAutoOffDelay = pirAutoOffDelay || device.pirAutoOffDelay;
    device.pirSensorType = pirSensorType || device.pirSensorType;
    device.pirSensitivity = pirSensitivity !== undefined ? pirSensitivity : device.pirSensitivity;
    device.pirDetectionRange = pirDetectionRange !== undefined ? pirDetectionRange : device.pirDetectionRange;
    device.motionDetectionLogic = motionDetectionLogic || device.motionDetectionLogic;
    device.pirDetectionSchedule = pirDetectionSchedule !== undefined ? pirDetectionSchedule : device.pirDetectionSchedule;
    device.status = status || device.status;
    device.lastSeen = lastSeen ? new Date(lastSeen) : device.lastSeen;

    let removedSwitches = [];
    const oldSwitchesSnapshot = device.switches ? device.switches.map(sw => sw.toObject ? sw.toObject() : { ...sw }) : [];
    if (switches && Array.isArray(switches)) {
    // Validate GPIO configuration using comprehensive validation
    const gpioConfig = {
      switches,
      pirEnabled: pirEnabled !== undefined ? pirEnabled : device.pirEnabled,
      pirGpio: pirGpio !== undefined ? pirGpio : device.pirGpio,
      deviceType: device.deviceType || 'esp32',
      isUpdate: true, // Allow existing problematic pins for updates
      existingConfig: device.switches, // Pass existing config for comparison
      existingPirGpio: device.pirGpio // Pass existing PIR GPIO
    };
    const gpioValidation = gpioUtils.validateGpioConfiguration(gpioConfig);      if (!gpioValidation.valid) {
        return res.status(400).json({
          error: 'GPIO Validation Failed',
          details: 'Invalid GPIO pin configuration',
          errors: gpioValidation.errors,
          warnings: gpioValidation.warnings
        });
      }

      // Log warnings if any (but don't block update)
      if (gpioValidation.warnings.length > 0) {
        console.warn('[updateDevice] GPIO warnings:', gpioValidation.warnings);
      }

      // Build new ordered switch array preserving state if gpio changed; capture warnings
      const warnings = [];
      device.switches = switches.map((sw, idx) => {
        const existing = device.switches.id(sw.id) || device.switches.find(s => s.name === sw.name);
        // Preserve existing state; new switches default to false. Ignore any incoming sw.state (initial state not user-settable here).
        const state = existing ? existing.state : false;
        if (existing) {
          if (existing.gpio !== sw.gpio && existing.state === true) {
            warnings.push({ type: 'gpio_changed_active', switchName: existing.name, from: existing.gpio, to: sw.gpio });
          }
        }
        return {
          name: sw.name,
          gpio: sw.gpio,
          relayGpio: sw.relayGpio ?? sw.gpio, // Ensure relayGpio is set
          type: sw.type || (existing && existing.type) || 'relay',
          state,
          icon: sw.icon || (existing && existing.icon) || 'lightbulb',
          manualSwitchEnabled: !!sw.manualSwitchEnabled,
          manualSwitchGpio: sw.manualSwitchGpio,
          manualMode: sw.manualMode || (existing && existing.manualMode) || 'maintained',
          manualActiveLow: sw.manualActiveLow !== undefined ? sw.manualActiveLow : (existing ? existing.manualActiveLow : true),
          usePir: sw.usePir !== undefined ? sw.usePir : (existing ? existing.usePir : false),
          dontAutoOff: sw.dontAutoOff !== undefined ? sw.dontAutoOff : (existing ? existing.dontAutoOff : false)
        };
      });
      // Determine removed switches (by id or name fallback)
      removedSwitches = oldSwitchesSnapshot.filter(osw => !device.switches.some(nsw => (osw._id && nsw._id && osw._id.toString() === nsw._id.toString()) || (osw.name && nsw.name && osw.name === nsw.name)));
      // Attach warnings to response later
      req._switchWarnings = warnings;
    }

    device.lastModifiedBy = req.user.id;
    await device.save();

    // Send updated configuration to ESP32 if device is online
    if (global.sendDeviceConfigToESP32) {
      global.sendDeviceConfigToESP32(device.macAddress);
    }

    // Log activity with new action
    try {
      await ActivityLog.create({
        deviceId: device._id,
        deviceName: device.name,
        action: 'device_updated',
        triggeredBy: 'user',
        userId: req.user.id,
        userName: req.user.name,
        classroom: device.classroom,
        location: device.location,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    } catch (logErr) {
      if (process.env.NODE_ENV !== 'production') console.warn('[deviceController] activity log failed', logErr.message);
    }

    const emitDeviceStateChanged = req.app.get('emitDeviceStateChanged');
    if (emitDeviceStateChanged) {
      emitDeviceStateChanged(device, { source: 'controller:updateDevice' });
    } else {
      req.app.get('io').emit('device_state_changed', { deviceId: device.id, state: device, ts: Date.now() });
    }

    // Emit notification to all connected users with appropriate permissions
    if (req.app.get('io')) {
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.notifyDeviceStatusChange(device._id, 'updated', device.name, device.location);
      } else {
        req.app.get('io').emit('device_notification', {
          type: 'device_updated',
          message: `Device "${device.name}" was updated in ${device.location}`,
          deviceId: device._id,
          deviceName: device.name,
          location: device.location,
          metadata: {
            deviceId: device._id,
            deviceName: device.name,
            deviceLocation: device.location,
            deviceClassroom: device.classroom,
            updatedBy: req.user.name,
            switchCount: device.switches.length
          },
          timestamp: new Date()
        });
      }
    }

    // If any switches were removed, proactively send OFF command for their relay gpios to ensure hardware deactivates them
    try {
      if (removedSwitches.length && global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) {
          removedSwitches.forEach(rsw => {
            const gpio = rsw.relayGpio || rsw.gpio;
            if (gpio !== undefined) {
              try {
                logger.info('[hw] switch_command (removed->OFF) push', { mac: device.macAddress, gpio, state: false });
              } catch { }
              ws.send(JSON.stringify({ type: 'switch_command', mac: device.macAddress, gpio, state: false, removed: true, seq: nextCmdSeq(device.macAddress) }));
            }
          });
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[removedSwitches off push failed]', e.message);
    }

    // Broadcast updated configuration (mirrors createDevice flow) so frontend & firmware can reconcile list
    try {
      const cfgMsg = {
        type: 'config_update',
        deviceId: device.id,
        switches: device.switches.map((sw, idx) => ({
          order: idx,
          gpio: sw.relayGpio ?? sw.gpio,
          relayGpio: sw.relayGpio ?? sw.gpio,
          name: sw.name,
          manualGpio: sw.manualSwitchGpio ?? sw.manualGpio,
          manualSwitchGpio: sw.manualSwitchGpio ?? sw.manualGpio,
          manualSwitchEnabled: sw.manualSwitchEnabled,
          manualMode: sw.manualMode,
          manualActiveLow: sw.manualActiveLow,
          state: sw.state
        })),
        pirEnabled: device.pirEnabled,
        pirGpio: device.pirGpio,
        pirAutoOffDelay: device.pirAutoOffDelay,
        pirSensorType: device.pirSensorType,
        pirSensitivity: device.pirSensitivity,
        pirDetectionRange: device.pirDetectionRange,
        motionDetectionLogic: device.motionDetectionLogic
      };
      req.app.get('io').emit('config_update', cfgMsg);
      if (global.wsDevices && device.macAddress) {
        const ws = global.wsDevices.get(device.macAddress.toUpperCase());
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(cfgMsg));
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[config_update emit failed updateDevice]', e.message);
    }

    res.json({
      success: true,
      message: 'Device updated successfully',
      data: device,
      warnings: req._switchWarnings || []
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const lastToggleTimestamps = {};

const toggleSwitch = async (req, res) => {
  const { deviceId, switchId } = req.params;
  const { state, triggeredBy = 'user' } = req.body;

  const uniqueSwitchIdentifier = `${deviceId}-${switchId}`;
  const requestTime = Date.now();
  const lastToggle = lastToggleTimestamps[uniqueSwitchIdentifier] || 0;

  if (requestTime - lastToggle < 2000) { // 2-second debounce window
    console.log(`[DEBOUNCE] Ignoring duplicate toggle request for ${uniqueSwitchIdentifier}`);
    return res.status(429).json({ message: 'Duplicate request, please wait a moment.' });
  }

  lastToggleTimestamps[uniqueSwitchIdentifier] = requestTime;

  const startTime = Date.now();
  let dbQueryTime = 0, dbUpdateTime = 0, activityLogTime = 0, wsSendTime = 0;
  try {
    const device = await Device.findById(deviceId);
    dbQueryTime = Date.now() - startTime;
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Authorization: ensure user has access to control this device. Security role is allowed to control any device.
    if (!userHasAccessToDevice(req.user, device)) {
      return res.status(403).json({ message: 'You do not have permission to control this device' });
    }

    // Check device connectivity with MQTT-based logic
    const isDeviceOnline = () => {
      // Check database status with time-based validation for MQTT devices
      if (device.status === 'online' && device.lastSeen) {
        const timeSinceLastSeen = Date.now() - new Date(device.lastSeen).getTime();
        const offlineThreshold = 2 * 60 * 1000; // 2 minutes
        return timeSinceLastSeen < offlineThreshold;
      }

      return false;
    };

    const deviceOnline = isDeviceOnline();

    // Block toggle if device is offline to ensure consistency with UI
    if (!deviceOnline) {
      // queue intent instead of hard blocking
      const targetSw = device.switches.find(sw => sw._id.toString() === switchId);
      if (!targetSw) return res.status(404).json({ message: 'Switch not found' });
      const desired = state !== undefined ? state : !targetSw.state;
      // replace any existing intent for same gpio
      device.queuedIntents = (device.queuedIntents || []).filter(q => q.switchGpio !== (targetSw.relayGpio || targetSw.gpio));
      device.queuedIntents.push({ switchGpio: targetSw.relayGpio || targetSw.gpio, desiredState: desired, createdAt: new Date() });
      await device.save();
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[toggleSwitch] queued intent while offline', {
          deviceId: device._id.toString(), mac: device.macAddress, switchId, desired,
          lastSeen: device.lastSeen, status: device.status
        });
      }
      try { req.app.get('io').emit('device_toggle_queued', { deviceId, switchId, desired }); } catch { }
      return res.status(202).json({ message: 'Device offline. Toggle queued.', queued: true });
    }

    const switchIndex = device.switches.findIndex(sw => sw._id.toString() === switchId);
    if (switchIndex === -1) {
      return res.status(404).json({ message: 'Switch not found' });
    }

    // Compute desired state based on current snapshot, but persist atomically
    const desiredState = state !== undefined ? state : !device.switches[switchIndex].state;
    const updateTime = new Date();
    const updated = await Device.findOneAndUpdate(
      { _id: deviceId, 'switches._id': switchId },
      { $set: { 'switches.$.state': desiredState, 'switches.$.lastStateChange': updateTime, lastModifiedBy: req.user.id } },
      { new: true }
    );
    const dbUpdateTime = Date.now() - startTime - dbQueryTime;
    if (!updated) {
      return res.status(404).json({ message: 'Switch not found' });
    }

    // Log activity
    // Resolve updated switch for logging and push
    const updatedSwitch = updated.switches.find(sw => sw._id.toString() === switchId) || updated.switches[switchIndex];
    const activityLogStart = Date.now();
    
    // Determine triggeredBy based on how the switch was actually triggered
    // Web switches are triggered by 'user', manual switches are handled via MQTT telemetry
    const logTriggeredBy = 'user'; // Web interface switches are always triggered by user
    const logAction = desiredState ? 'on' : 'off';
    const logUserId = req.user.id;
    const logUserName = req.user.name;
    const logIp = req.ip;
    const logUserAgent = req.get('User-Agent');
    
    // Get power consumption at the time of the event for historical accuracy
    const { getBasePowerConsumption } = require('../metricsService');
    const switchPowerConsumption = getBasePowerConsumption(
      updatedSwitch?.name || 'unknown',
      updatedSwitch?.type || 'relay'
    );
    
    // ActivityLog creation is now handled by the MQTT switch_event handler in server.js
    // to ensure a single, authoritative log entry for every action.
    // The user info is passed via the MQTT command payload.
    const activityLogTime = Date.now() - activityLogStart;
    
    // Track power consumption in real-time
    try {
      const trackingOptions = {
        switchName: updatedSwitch?.name,
        switchType: updatedSwitch?.type || 'other',
        deviceId: updated._id,
        classroomId: updated.classroom,
        deviceName: updated.name,
        userId: logUserId,
        userName: logUserName,
        triggeredBy: logTriggeredBy
      };

      if (desiredState) {
        // Switch turned ON - start tracking
        await powerTracker.trackSwitchOn(switchId, trackingOptions);
      } else {
        // Switch turned OFF - stop tracking and record consumption
        await powerTracker.trackSwitchOff(switchId);
      }
    } catch (trackingError) {
      logger.error('[toggleSwitch] Power tracking error:', trackingError);
      // Don't fail the request if tracking fails
    }

    // Do not broadcast device_state_changed immediately to avoid UI desync if hardware fails.
    // Instead, emit a lightweight intent event; authoritative updates will come from switch_result/state_update.
    try {
      req.app.get('io').emit('switch_intent', {
        deviceId: updated.id,
        switchId,
        gpio: (updatedSwitch && (updatedSwitch.relayGpio || updatedSwitch.gpio)) || (device.switches[switchIndex].relayGpio || device.switches[switchIndex].gpio),
        desiredState,
        ts: Date.now()
      });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[switch_intent emit failed]', e.message);
    }

    // Send MQTT command to ESP32
    try {
      const gpio = (updatedSwitch && (updatedSwitch.relayGpio || updatedSwitch.gpio)) || (device.switches[switchIndex].relayGpio || device.switches[switchIndex].gpio);
      if (global.sendMqttSwitchCommand) {
        global.sendMqttSwitchCommand(updated.macAddress, gpio, desiredState, { id: req.user.id, name: req.user.name });
        console.log(`[MQTT] Published switch command for device ${updated.macAddress}: gpio=${gpio}, state=${desiredState}`);
      } else {
        console.warn('[MQTT] sendMqttSwitchCommand not available');
      }
    } catch (e) {
      console.error('[MQTT] Error publishing switch command:', e.message);
    }

    // Log performance timing
    const totalTime = Date.now() - startTime;
    process.stderr.write(`[PERF] toggleSwitch timing - Total: ${totalTime}ms, DB Query: ${dbQueryTime}ms, DB Update: ${dbUpdateTime}ms, Activity Log: ${activityLogTime}ms\n`);

    res.json({
      success: true,
      data: updated,
      hardwareDispatch: true, // MQTT command was sent
      hardwareDispatchReason: 'mqtt_published'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getDeviceStats = async (req, res) => {
  try {
    const matchQuery = buildDeviceAccessQuery(req.user);
    if (matchQuery === null) {
      return res.json({
        totalDevices: 0,
        onlineDevices: 0,
        offlineDevices: 0,
        totalSwitches: 0,
        switchesOn: 0,
        switchesOff: 0,
        pirEnabled: 0,
        pirTriggered: 0
      });
    }

    const devices = await Device.find(matchQuery)
      .select('status switches pirEnabled pirGpio pirAutoOffDelay pirSensorLastTriggered')
      .lean();

    const now = Date.now();
    const toMs = (s) => Math.max(0, ((typeof s === 'number' ? s : 30) || 30) * 1000);

    const totalDevices = devices.length;
    const onlineDevices = devices.filter(d => d.status === 'online').length;
    const totalSwitches = devices.reduce((sum, d) => sum + (Array.isArray(d.switches) ? d.switches.length : 0), 0);
    const activeSwitches = devices.reduce((sum, d) => {
      if (d.status !== 'online') return sum;
      const on = (Array.isArray(d.switches) ? d.switches : []).filter(sw => !!sw.state).length;
      return sum + on;
    }, 0);
    // Count PIR sensors: devices with pirEnabled=true (GPIO pin is optional, can be fixed at 34 for PIR, 35 for Microwave)
    const totalPirSensors = devices.filter(d => d.pirEnabled === true).length;
    const activePirSensors = devices.filter(d => {
      if (d.pirEnabled !== true) return false;
      const last = d.pirSensorLastTriggered ? new Date(d.pirSensorLastTriggered).getTime() : 0;
      const windowMs = toMs(d.pirAutoOffDelay);
      return last && (now - last) <= windowMs;
    }).length;

    res.json({
      success: true,
      data: {
        totalDevices,
        onlineDevices,
        totalSwitches,
        activeSwitches,
        totalPirSensors,
        activePirSensors
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getDeviceById = async (req, res) => {
  try {
    // If admin wants secret, explicitly select it
    const includeSecret = req.query.includeSecret === '1' || req.query.includeSecret === 'true';
    let query = Device.findById(req.params.deviceId);
    if (includeSecret && req.user && (req.user.role === 'admin' || req.user.role === 'super-admin')) {
      query = query.select('+deviceSecret');
    }
    let device = await query;
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }
    // Optional PIN gate for secret (set DEVICE_SECRET_PIN in env). If set, must match ?secretPin=.
    if (includeSecret && req.user && (req.user.role === 'admin' || req.user.role === 'super-admin')) {
      const requiredPin = process.env.DEVICE_SECRET_PIN;
      if (requiredPin && (req.query.secretPin !== requiredPin)) {
        return res.status(403).json({ message: 'Invalid PIN' });
      }
    }
    // Auto-generate a secret if missing and admin requested it
    if (includeSecret && req.user && (req.user.role === 'admin' || req.user.role === 'super-admin') && !device.deviceSecret) {
      const crypto = require('crypto');
      device.deviceSecret = crypto.randomBytes(24).toString('hex');
      await device.save();
    }
    // Avoid leaking secret unless explicitly requested
    const raw = device.toObject();
    if (!(includeSecret && req.user && (req.user.role === 'admin' || req.user.role === 'super-admin'))) {
      delete raw.deviceSecret;
    }
    res.json({ success: true, data: raw, deviceSecret: includeSecret && req.user && (req.user.role === 'admin' || req.user.role === 'super-admin') ? raw.deviceSecret : undefined });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.params.deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    await device.deleteOne();

    await ActivityLog.create({
      deviceId: device._id,
      deviceName: device.name,
      action: 'device_deleted',
      triggeredBy: 'user',
      userId: req.user.id,
      userName: req.user.name,
      classroom: device.classroom,
      location: device.location,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const emitDeviceStateChanged = req.app.get('emitDeviceStateChanged');
    if (emitDeviceStateChanged) {
      emitDeviceStateChanged({ id: device.id, deleted: true }, { source: 'controller:deleteDevice' });
    } else {
      req.app.get('io').emit('device_state_changed', { deviceId: device.id, deleted: true, ts: Date.now() });
    }

    // Emit notification to all connected users with appropriate permissions
    if (req.app.get('io')) {
      const socketService = req.app.get('socketService');
      if (socketService) {
        socketService.notifyDeviceStatusChange(device._id, 'deleted', device.name, device.location);
      } else {
        req.app.get('io').emit('device_notification', {
          type: 'device_deleted',
          message: `Device "${device.name}" was deleted from ${device.location}`,
          deviceId: device._id,
          deviceName: device.name,
          location: device.location,
          metadata: {
            deviceId: device._id,
            deviceName: device.name,
            deviceLocation: device.location,
            deviceClassroom: device.classroom,
            deletedBy: req.user.name,
            switchCount: device.switches.length
          },
          timestamp: new Date()
        });
      }
    }

    res.json({ success: true, message: 'Device deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Bulk toggle all switches (or all accessible devices for non-admin roles)
const bulkToggleSwitches = async (req, res) => {
  try {
    const { state } = req.body; // required boolean
    if (typeof state !== 'boolean') {
      return res.status(400).json({ message: 'state boolean required' });
    }

    // Scope devices based on user role using the same logic as getAllDevices
    const match = buildDeviceAccessQuery(req.user);
    if (match === null) {
      return res.status(403).json({ message: 'No devices accessible for bulk operations' });
    }

    const devices = await Device.find(match);
    let switchesChanged = 0;
    let devicesCommanded = 0;
    let devicesOffline = 0;
    const offlineDevices = [];
    const commandedDevices = [];

    for (const device of devices) {
      let deviceModified = false;
      device.switches.forEach(sw => {
        if (sw.state !== state) {
          sw.state = state;
          deviceModified = true;
          switchesChanged++;
        }
      });

      if (deviceModified) {
        await device.save();

        // Check if device is online using MQTT-based logic
        const isDeviceOnline = () => {
          // Check database status with time-based validation for MQTT devices
          if (device.status === 'online' && device.lastSeen) {
            const timeSinceLastSeen = Date.now() - new Date(device.lastSeen).getTime();
            const offlineThreshold = 2 * 60 * 1000; // 2 minutes
            return timeSinceLastSeen < offlineThreshold;
          }
          return false;
        };

        const deviceOnline = isDeviceOnline();

        if (deviceOnline) {
          // Device is online, send MQTT commands immediately
          try {
            for (const sw of device.switches) {
              // Send MQTT command to ESP32
              const gpio = sw.relayGpio || sw.gpio;
              if (global.sendMqttSwitchCommand) {
                global.sendMqttSwitchCommand(device.macAddress, gpio, sw.state);
                console.log(`[MQTT] Bulk command sent for device ${device.macAddress}: gpio=${gpio}, state=${sw.state}`);
              } else {
                console.warn('[MQTT] sendMqttSwitchCommand not available for bulk operation');
              }
            }
            devicesCommanded++;
            commandedDevices.push({
              id: device._id,
              name: device.name,
              macAddress: device.macAddress,
              switches: device.switches.length
            });
          } catch (e) {
            logger.error('[bulkToggleSwitches] MQTT command failed for online device', {
              deviceId: device._id.toString(),
              mac: device.macAddress,
              error: e.message
            });
            // Queue the command for later delivery
            device.queuedIntents = (device.queuedIntents || []).filter(q => q.gpio !== (device.switches[0]?.relayGpio || device.switches[0]?.gpio));
            device.queuedIntents.push({
              gpio: device.switches[0]?.relayGpio || device.switches[0]?.gpio,
              desiredState: state,
              createdAt: new Date(),
              bulkOperation: true
            });
            await device.save();
          }
        } else {
          // Device is offline, queue the command for when it comes back online
          logger.info('[bulkToggleSwitches] queuing command for offline device', {
            deviceId: device._id.toString(),
            mac: device.macAddress,
            state
          });

          // Clear any existing queued intents for these switches
          device.queuedIntents = (device.queuedIntents || []).filter(q =>
            !device.switches.some(sw => (sw.relayGpio || sw.gpio) === q.gpio)
          );

          // Queue new intents for all switches
          device.switches.forEach(sw => {
            device.queuedIntents.push({
              gpio: sw.relayGpio || sw.gpio,
              desiredState: state,
              createdAt: new Date(),
              bulkOperation: true
            });
          });

          await device.save();
          devicesOffline++;
          offlineDevices.push({
            id: device._id,
            name: device.name,
            macAddress: device.macAddress,
            switches: device.switches.length,
            lastSeen: device.lastSeen
          });
        }

        // Log one aggregated activity entry per device to limit log volume
        try {
          await ActivityLog.create({
            deviceId: device._id,
            deviceName: device.name,
            action: state ? 'bulk_on' : 'bulk_off',
            triggeredBy: 'user',
            userId: req.user.id,
            userName: req.user.name,
            classroom: device.classroom,
            location: device.location,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            details: deviceOnline ? 'Command sent to device' : 'Command queued for offline device'
          });
        } catch (logErr) {
          if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleSwitches] log failed', logErr.message);
        }
      }
    }

    // Emit a bulk intent so UI can show pending without flipping state
    try {
      const affectedIds = devices.filter(d => d.switches.some(sw => true)).map(d => d._id.toString());
      req.app.get('io').emit('bulk_switch_intent', {
        desiredState: state,
        deviceIds: affectedIds,
        commandedDevices: commandedDevices.length,
        offlineDevices: offlineDevices.length,
        ts: Date.now()
      });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleSwitches bulk_switch_intent emit failed]', e.message);
    }

    // Emit notification about bulk operation results
    try {
      const socketService = req.app.get('socketService');
      if (socketService && typeof socketService.notifyBulkOperation === 'function') {
        const results = commandedDevices.map(device => ({
          deviceId: device.id,
          deviceName: device.name,
          success: true,
          switchesChanged: device.switches.length
        })).concat(offlineDevices.map(device => ({
          deviceId: device.id,
          deviceName: device.name,
          success: false,
          reason: 'device_offline'
        })));

        socketService.notifyBulkOperation(
          req.user.id,
          'bulk_toggle',
          results,
          devices.length
        );
      } else {
        req.app.get('io').emit('bulk_operation_complete', {
          operation: 'master_toggle',
          desiredState: state,
          totalDevices: devices.length,
          commandedDevices: commandedDevices.length,
          offlineDevices: offlineDevices.length,
          switchesChanged,
          offlineDeviceList: offlineDevices,
          timestamp: new Date()
        });
      }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleSwitches notification emit failed]', e.message);
    }

    const message = `Bulk toggled switches ${state ? 'on' : 'off'}. ${devicesCommanded} devices commanded, ${devicesOffline} devices offline (commands queued).`;

    logger.info('[bulkToggleSwitches] completed', {
      totalDevices: devices.length,
      commandedDevices: devicesCommanded,
      offlineDevices: devicesOffline,
      switchesChanged,
      state
    });

    res.json({
      success: true,
      message,
      devices: devices.length,
      commandedDevices: devicesCommanded,
      offlineDevices: devicesOffline,
      switchesChanged,
      offlineDeviceList: offlineDevices,
      commandedDeviceList: commandedDevices
    });
  } catch (error) {
    logger.error('[bulkToggleSwitches] error', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Bulk toggle by switch type
const bulkToggleByType = async (req, res) => {
  try {
    const { type } = req.params;
    const { state } = req.body;
    if (typeof state !== 'boolean') {
      return res.status(400).json({ message: 'state boolean required' });
    }
    const match = buildDeviceAccessQuery(req.user);
    if (match === null) {
      return res.status(403).json({ message: 'No devices accessible for bulk operations' });
    }
    const devices = await Device.find(match);
    logger.info(`[bulkToggleByType] Found ${devices.length} devices for type ${type}, state ${state}`);
    let switchesChanged = 0;
    let devicesModified = 0;
    for (const device of devices) {
      try {
        let modified = false;
        device.switches.forEach(sw => {
          if (sw.type === type && sw.state !== state) {
            sw.state = state;
            switchesChanged++;
            modified = true;
          }
        });
        if (modified) {
          await device.save();
          devicesModified++;
          try {
            await ActivityLog.create({
              deviceId: device._id,
              deviceName: device.name,
              action: state ? 'bulk_on' : 'bulk_off',
              triggeredBy: 'user',
              userId: req.user.id,
              userName: req.user.name,
              classroom: device.classroom,
              location: device.location
            });
          } catch (logErr) {
            logger.warn(`[bulkToggleByType] Activity log failed for device ${device._id}: ${logErr.message}`);
          }
          // Send MQTT commands to ESP32 for type-based bulk change
          try {
            for (const sw of device.switches.filter(sw => sw.type === type)) {
              const gpio = sw.relayGpio || sw.gpio;
              if (global.sendMqttSwitchCommand) {
                global.sendMqttSwitchCommand(device.macAddress, gpio, sw.state);
                console.log(`[MQTT] Bulk by type command sent for device ${device.macAddress}: gpio=${gpio}, state=${sw.state}, type=${type}`);
              } else {
                console.warn('[MQTT] sendMqttSwitchCommand not available for bulk by type operation');
              }
            }
          } catch (e) {
            logger.warn(`[bulkToggleByType] MQTT push failed for device ${device.macAddress}: ${e.message}`);
          }
        }
      } catch (deviceErr) {
        logger.error(`[bulkToggleByType] Error processing device ${device._id}: ${deviceErr.message}`);
        // Continue with other devices
      }
    }
    try {
      const ids = devices.map(d => d._id.toString());
      req.app.get('io').emit('bulk_switch_intent', { desiredState: state, deviceIds: ids, filter: { type }, ts: Date.now() });
    } catch (emitErr) {
      logger.warn(`[bulkToggleByType] Emit failed: ${emitErr.message}`);
    }
    logger.info(`[bulkToggleByType] Completed: ${devicesModified} devices modified, ${switchesChanged} switches changed`);
    res.json({ success: true, type, state, switchesChanged, devicesModified });
  } catch (error) {
    logger.error(`[bulkToggleByType] Error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Bulk toggle by location
const bulkToggleByLocation = async (req, res) => {
  try {
    const { location } = req.params;
    const { state } = req.body;
    if (typeof state !== 'boolean') {
      return res.status(400).json({ message: 'state boolean required' });
    }
    
    // Build base access query
    const accessQuery = buildDeviceAccessQuery(req.user);
    if (accessQuery === null) {
      return res.status(403).json({ message: 'No devices accessible for bulk operations' });
    }
    
    // Combine access control with location filter
    const match = {
      ...accessQuery,
      location
    };
    const devices = await Device.find(match);
    let switchesChanged = 0;
    for (const device of devices) {
      let modified = false;
      device.switches.forEach(sw => {
        if (sw.state !== state) {
          sw.state = state;
          switchesChanged++;
          modified = true;
        }
      });
      if (modified) {
        await device.save();
        try {
          await ActivityLog.create({
            deviceId: device._id,
            deviceName: device.name,
            action: state ? 'bulk_on' : 'bulk_off',
            triggeredBy: 'user',
            userId: req.user.id,
            userName: req.user.name,
            classroom: device.classroom,
            location: device.location
          });
        } catch { }
        // Send MQTT commands to ESP32 for location-based bulk change
        try {
          for (const sw of device.switches) {
            const gpio = sw.relayGpio || sw.gpio;
            if (global.sendMqttSwitchCommand) {
              global.sendMqttSwitchCommand(device.macAddress, gpio, sw.state);
              console.log(`[MQTT] Bulk by location command sent for device ${device.macAddress}: gpio=${gpio}, state=${sw.state}, location=${location}`);
            } else {
              console.warn('[MQTT] sendMqttSwitchCommand not available for bulk by location operation');
            }
          }
        } catch (e) { if (process.env.NODE_ENV !== 'production') console.warn('[bulkToggleByLocation MQTT push failed]', e.message); }
      }
    }
    try {
      const ids = devices.map(d => d._id.toString());
      req.app.get('io').emit('bulk_switch_intent', { desiredState: state, deviceIds: ids, filter: { location }, ts: Date.now() });
    } catch { }
    res.json({ success: true, location, state, switchesChanged });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Control device settings (brightness, fan speed, etc.)
const controlDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { brightness, fanSpeed, inputSource } = req.body;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Authorization: allow security and admins to control device settings as well
    if (!userHasAccessToDevice(req.user, device)) {
      return res.status(403).json({ message: 'You do not have permission to control this device' });
    }

    // Update device settings
    const updates = {};
    if (brightness !== undefined) updates.brightness = brightness;
    if (fanSpeed !== undefined) updates.fanSpeed = fanSpeed;
    if (inputSource !== undefined) updates.inputSource = inputSource;

    const updatedDevice = await Device.findByIdAndUpdate(deviceId, updates, { new: true });

    // Log activity
    await ActivityLog.create({
      user: req.user._id,
      action: 'DEVICE_CONTROL',
      details: `Controlled device ${device.name}: ${JSON.stringify(updates)}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Device controlled successfully',
      device: updatedDevice
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Schedule device operations
const scheduleDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { schedule } = req.body;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Here you would implement scheduling logic
    // For now, just return success
    res.json({
      success: true,
      message: 'Device scheduled successfully',
      deviceId,
      schedule
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get device history/logs
const getDeviceHistory = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 50, page = 1 } = req.query;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Get activity logs for this device
    const logs = await ActivityLog.find({
      details: { $regex: deviceId, $options: 'i' }
    })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await ActivityLog.countDocuments({
      details: { $regex: deviceId, $options: 'i' }
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Configure PIR sensor
const configurePir = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { sensitivity, timeout, enabled } = req.body;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Update PIR configuration
    const pirConfig = {
      sensitivity: sensitivity || device.pirConfig?.sensitivity || 50,
      timeout: timeout || device.pirConfig?.timeout || 30,
      enabled: enabled !== undefined ? enabled : device.pirConfig?.enabled || true
    };

    const updatedDevice = await Device.findByIdAndUpdate(deviceId, {
      pirConfig
    }, { new: true });

    res.json({
      success: true,
      message: 'PIR sensor configured successfully',
      device: updatedDevice
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get PIR sensor data
const getPirData = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 100, startDate, endDate } = req.query;

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Here you would query PIR sensor data from database
    // For now, return mock data
    const mockPirData = {
      deviceId,
      deviceName: device.name,
      data: [
        {
          timestamp: new Date(),
          motionDetected: true,
          sensorValue: 85
        }
      ],
      totalRecords: 1
    };

    res.json({
      success: true,
      data: mockPirData
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get GPIO pin information and validation
const getGpioPinInfo = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { includeUsed = 'true', deviceType = 'esp32' } = req.query;

    let device = null;
    if (deviceId && deviceId !== 'new') {
      device = await Device.findById(deviceId);
      if (!device) {
        return res.status(404).json({ message: 'Device not found' });
      }
    }

    // Get all used pins for this device
    const usedPins = new Set();
    if (device) {
      device.switches.forEach(sw => {
        usedPins.add(sw.gpio);
        if (sw.manualSwitchEnabled && sw.manualSwitchGpio !== undefined) {
          usedPins.add(sw.manualSwitchGpio);
        }
      });
      if (device.pirEnabled && device.pirGpio !== undefined) {
        usedPins.add(device.pirGpio);
      }
    }

    // Generate pin information based on device type
    const maxPin = deviceType === 'esp8266' ? 16 : 39;
    const pins = [];
    for (let pin = 0; pin <= maxPin; pin++) {
      const status = gpioUtils.getGpioPinStatus(pin, deviceType);
      const isUsed = usedPins.has(pin);

      pins.push({
        pin,
        ...status,
        used: isUsed,
        available: status.safe && !isUsed
      });
    }

    // Group pins by status
    const grouped = {
      safe: pins.filter(p => p.status === 'safe'),
      problematic: pins.filter(p => p.status === 'problematic'),
      reserved: pins.filter(p => p.status === 'reserved'),
      used: pins.filter(p => p.used),
      available: pins.filter(p => p.available)
    };

    // Recommended safe pins for different purposes
    const recommendations = {
      relayPins: gpioUtils.getRecommendedPins('relay', 'primary', deviceType),
      manualPins: gpioUtils.getRecommendedPins('manual', 'primary', deviceType),
      pirPins: gpioUtils.getRecommendedPins('pir', 'primary', deviceType)
    };

    res.json({
      success: true,
      data: {
        pins,
        grouped,
        recommendations,
        deviceType,
        summary: {
          totalPins: pins.length,
          safePins: grouped.safe.length,
          problematicPins: grouped.problematic.length,
          reservedPins: grouped.reserved.length,
          usedPins: grouped.used.length,
          availablePins: grouped.available.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Validate GPIO pin configuration
const validateGpioConfig = async (req, res) => {
  try {
    const { switches = [], pirEnabled = false, pirGpio, deviceType = 'esp32', isUpdate = false, existingConfig = [], existingPirGpio } = req.body;

    const result = gpioUtils.validateGpioConfiguration({
      switches,
      pirEnabled,
      pirGpio,
      deviceType,
      isUpdate,
      existingConfig,
      existingPirGpio
    }, deviceType);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAllDevices,
  createDevice,
  toggleSwitch,
  getDeviceStats,
  getDeviceById,
  updateDevice,
  deleteDevice,
  bulkToggleSwitches,
  bulkToggleByType,
  bulkToggleByLocation,
  controlDevice,
  scheduleDevice,
  getDeviceHistory,
  configurePir,
  getPirData,
  getGpioPinInfo,
  validateGpioConfig
};
