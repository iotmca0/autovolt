// backfillSwitchLastStateChange.js
// One-time script to backfill lastStateChange field for existing switches
// Run this after adding the lastStateChange field to the switch schema

const mongoose = require('mongoose');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt';

async function backfillLastStateChange() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB');

    const devices = await Device.find({});
    console.log(`📊 Found ${devices.length} devices`);

    let devicesUpdated = 0;
    let switchesUpdated = 0;

    for (const device of devices) {
      let deviceModified = false;

      for (const switchItem of device.switches) {
        // Skip if lastStateChange already exists
        if (switchItem.lastStateChange) {
          console.log(`⏭️  Skipping ${device.name} - ${switchItem.name} (already has lastStateChange)`);
          continue;
        }

        // Find the most recent activity log for this switch
        const mostRecentLog = await ActivityLog.findOne({
          deviceId: device._id,
          switchId: switchItem._id,
          action: { $in: ['on', 'off', 'manual_on', 'manual_off', 'bulk_on', 'bulk_off'] }
        }).sort({ timestamp: -1 }).lean();

        if (mostRecentLog) {
          // Set lastStateChange to the most recent activity log timestamp
          switchItem.lastStateChange = new Date(mostRecentLog.timestamp);
          deviceModified = true;
          switchesUpdated++;
          
          console.log(`✅ Updated ${device.name} - ${switchItem.name}: lastStateChange = ${mostRecentLog.timestamp}`);
        } else {
          // No activity logs found - set to device's lastSeen or current time
          if (device.lastSeen) {
            switchItem.lastStateChange = device.lastSeen;
          } else {
            switchItem.lastStateChange = new Date();
          }
          deviceModified = true;
          switchesUpdated++;
          
          console.log(`⚠️  No logs for ${device.name} - ${switchItem.name}, using fallback timestamp`);
        }
      }

      if (deviceModified) {
        await device.save();
        devicesUpdated++;
        console.log(`💾 Saved device: ${device.name}`);
      }
    }

    console.log('\n📈 Backfill Summary:');
    console.log(`   Devices updated: ${devicesUpdated}`);
    console.log(`   Switches updated: ${switchesUpdated}`);
    console.log('\n✅ Backfill completed successfully!');

  } catch (error) {
    console.error('❌ Error during backfill:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
  }
}

// Run the script
backfillLastStateChange();
