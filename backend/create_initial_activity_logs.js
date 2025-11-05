/**
 * One-time script to create initial ActivityLog entries for all devices
 * This establishes baseline status change timestamps for the uptime tracker
 */

const mongoose = require('mongoose');
const Device = require('./models/Device');
const ActivityLog = require('./models/ActivityLog');

async function createInitialActivityLogs() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/autovolt', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Get all devices
    const devices = await Device.find({});
    console.log(`Found ${devices.length} devices`);

    let created = 0;
    let skipped = 0;

    for (const device of devices) {
      // Check if device already has a status change log
      const existingLog = await ActivityLog.findOne({
        deviceId: device._id,
        action: { $in: ['device_online', 'device_offline', 'device_connected', 'device_disconnected'] }
      }).sort({ timestamp: -1 });

      if (existingLog) {
        console.log(`${device.name}: Already has activity logs, skipping`);
        skipped++;
        continue;
      }

      // Create initial ActivityLog entry based on current status
      const action = device.status === 'online' ? 'device_online' : 'device_offline';
      const timestamp = device.lastSeen || new Date();

      await ActivityLog.create({
        deviceId: device._id,
        deviceName: device.name,
        action: action,
        triggeredBy: 'system',
        classroom: device.classroom,
        location: device.location,
        timestamp: timestamp
      });

      console.log(`${device.name}: Created ${action} log at ${timestamp}`);
      created++;
    }

    console.log(`\nSummary:`);
    console.log(`- Created: ${created} initial logs`);
    console.log(`- Skipped: ${skipped} devices (already have logs)`);
    console.log(`\nMigration complete!`);

    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

createInitialActivityLogs();
