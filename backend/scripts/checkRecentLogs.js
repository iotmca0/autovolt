// Check recent activity logs for Computer_Lab
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Device = require('../models/Device');

async function checkRecentLogs() {
  try {
    await mongoose.connect('mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    // Find Computer_Lab device
    const computerLab = await Device.findOne({ name: 'Computer_Lab' });
    if (!computerLab) {
      console.log('❌ Computer_Lab device not found');
      return;
    }

    console.log('📊 Computer_Lab Device Info:');
    console.log(`   ID: ${computerLab._id}`);
    console.log(`   Status: ${computerLab.status}`);
    console.log(`   Last Seen: ${computerLab.lastSeen || 'Never'}`);
    console.log(`   Switches: ${computerLab.switches.length}\n`);

    // Check activity logs for Computer_Lab
    const logs = await ActivityLog.find({ deviceId: computerLab._id })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    console.log(`📝 Found ${logs.length} activity logs for Computer_Lab\n`);

    if (logs.length > 0) {
      console.log('Recent logs:');
      logs.forEach((log, index) => {
        console.log(`${index + 1}. ${log.timestamp} - ${log.switchName || 'N/A'} - ${log.action} (triggered by: ${log.triggeredBy})`);
      });
    } else {
      console.log('⚠️  NO ACTIVITY LOGS FOUND for Computer_Lab!');
      console.log('   This explains why cumulative time is showing 0s.');
      console.log('   The device may be:');
      console.log('   1. Not sending MQTT messages properly');
      console.log('   2. Using a different device name/ID');
      console.log('   3. Activity logs being deleted/not saved\n');
    }

    // Check all recent logs (any device)
    console.log('\n📊 Last 20 activity logs (all devices):');
    const allLogs = await ActivityLog.find()
      .sort({ timestamp: -1 })
      .limit(20)
      .populate('deviceId', 'name')
      .lean();

    allLogs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.timestamp} - ${log.deviceId?.name || 'Unknown'} - ${log.switchName || 'N/A'} - ${log.action}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

checkRecentLogs();
