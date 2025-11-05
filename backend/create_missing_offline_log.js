const mongoose = require('mongoose');
require('dotenv').config();

const ActivityLog = require('./models/ActivityLog');
const Device = require('./models/Device');

async function createMissingOfflineLog() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find LH_D_25_(BCA_1st_Sem) device
    const device = await Device.findOne({ name: /LH_D_25.*BCA.*1st.*Sem/ });
    
    if (!device) {
      console.log('Device LH_D_25_(BCA_1st_Sem) not found!');
      await mongoose.disconnect();
      return;
    }

    console.log(`Found device: ${device.name}`);
    console.log(`Status: ${device.status}`);
    console.log(`Last Seen: ${device.lastSeen}`);

    // Check if offline log already exists
    const existingLog = await ActivityLog.findOne({
      deviceId: device._id,
      action: { $in: ['device_offline', 'device_disconnected'] }
    });

    if (existingLog) {
      console.log(`\nOffline log already exists:`, existingLog.timestamp);
      await mongoose.disconnect();
      return;
    }

    // Create offline log using device.lastSeen as timestamp
    const offlineLog = await ActivityLog.create({
      deviceId: device._id,
      action: 'device_offline',
      timestamp: device.lastSeen, // Use the actual time device went offline
      triggeredBy: 'system',
      details: {
        classroom: device.classroom,
        location: device.location
      }
    });

    console.log(`\n✅ Created offline log:`);
    console.log(`  Timestamp: ${offlineLog.timestamp}`);
    console.log(`  Action: ${offlineLog.action}`);

    await mongoose.disconnect();
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createMissingOfflineLog();
