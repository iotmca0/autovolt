// Test switch statistics for Computer_Lab
const mongoose = require('mongoose');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

async function testSwitchStats() {
  try {
    await mongoose.connect('mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    // Find Computer_Lab device
    const device = await Device.findOne({ name: 'Computer_Lab' }).lean();
    if (!device) {
      console.log('❌ Computer_Lab device not found');
      return;
    }

    console.log('📊 Computer_Lab Device:');
    console.log(`   ID: ${device._id}`);
    console.log(`   Status: ${device.status}`);
    console.log(`   Last Seen: ${device.lastSeen}\n`);

    // Calculate switch statistics for today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const analysisEnd = now;

    console.log('⏰ Analysis Window:');
    console.log(`   Start: ${startOfDay}`);
    console.log(`   End: ${analysisEnd}\n`);

    for (const switchItem of device.switches) {
      console.log(`\n🔌 Switch: ${switchItem.name}`);
      console.log(`   Current State: ${switchItem.state ? 'ON' : 'OFF'}`);
      console.log(`   lastStateChange: ${switchItem.lastStateChange || 'Not set'}`);

      // Find activity logs for this switch
      const switchLogs = await ActivityLog.find({
        deviceId: device._id,
        switchId: switchItem._id,
        action: { $in: ['on', 'off', 'manual_on', 'manual_off', 'bulk_on', 'bulk_off'] },
        timestamp: { $gte: startOfDay, $lte: analysisEnd }
      }).sort({ timestamp: 1 }).lean();

      console.log(`   Logs in timeframe: ${switchLogs.length}`);

      // Find log before timeframe to determine initial state
      const logBeforeTimeframe = await ActivityLog.findOne({
        deviceId: device._id,
        switchId: switchItem._id,
        action: { $in: ['on', 'off', 'manual_on', 'manual_off', 'bulk_on', 'bulk_off'] },
        timestamp: { $lt: startOfDay }
      }).sort({ timestamp: -1 }).lean();

      if (logBeforeTimeframe) {
        console.log(`   Log before timeframe: ${logBeforeTimeframe.timestamp} - ${logBeforeTimeframe.action}`);
      } else {
        console.log(`   Log before timeframe: None found`);
      }

      // Determine initial state at start of day
      let currentState;
      if (logBeforeTimeframe) {
        const action = logBeforeTimeframe.action;
        currentState = ['on', 'manual_on', 'bulk_on'].includes(action);
        console.log(`   Initial state at ${startOfDay}: ${currentState ? 'ON' : 'OFF'} (from log)`);
      } else {
        currentState = switchItem.state;
        console.log(`   Initial state at ${startOfDay}: ${currentState ? 'ON' : 'OFF'} (from current state)`);
      }

      // Calculate durations
      let onDuration = 0;
      let offDuration = 0;
      let lastTimestamp = startOfDay.getTime();

      for (const log of switchLogs) {
        const logTime = new Date(log.timestamp).getTime();
        const duration = (logTime - lastTimestamp) / 1000; // seconds

        if (currentState) {
          onDuration += duration;
          console.log(`   ✓ ON period: ${duration.toFixed(1)}s (${new Date(lastTimestamp).toLocaleTimeString()} to ${new Date(logTime).toLocaleTimeString()})`);
        } else {
          offDuration += duration;
          console.log(`   ✗ OFF period: ${duration.toFixed(1)}s (${new Date(lastTimestamp).toLocaleTimeString()} to ${new Date(logTime).toLocaleTimeString()})`);
        }

        // Update state based on log action
        const action = log.action;
        currentState = ['on', 'manual_on', 'bulk_on'].includes(action);
        lastTimestamp = logTime;
      }

      // Add remaining time from last log to analysis end
      const remainingDuration = (analysisEnd.getTime() - lastTimestamp) / 1000;
      if (currentState) {
        onDuration += remainingDuration;
        console.log(`   ✓ ON period (remaining): ${remainingDuration.toFixed(1)}s (${new Date(lastTimestamp).toLocaleTimeString()} to ${analysisEnd.toLocaleTimeString()})`);
      } else {
        offDuration += remainingDuration;
        console.log(`   ✗ OFF period (remaining): ${remainingDuration.toFixed(1)}s (${new Date(lastTimestamp).toLocaleTimeString()} to ${analysisEnd.toLocaleTimeString()})`);
      }

      console.log(`\n   📈 Summary:`);
      console.log(`      Total ON time: ${(onDuration / 60).toFixed(2)} minutes (${(onDuration / 3600).toFixed(2)} hours)`);
      console.log(`      Total OFF time: ${(offDuration / 60).toFixed(2)} minutes`);
      console.log(`      Current state duration: ${currentState ? onDuration : offDuration}s`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
  }
}

testSwitchStats();
