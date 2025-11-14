// Check Computer_Lab switch IDs vs activity log switch IDs
const mongoose = require('mongoose');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

async function checkSwitchIds() {
  try {
    await mongoose.connect('mongodb://localhost:27017/autovolt');

    const device = await Device.findOne({ name: 'Computer_Lab' }).lean();
    console.log('📊 Computer_Lab switches:\n');
    device.switches.forEach(s => {
      console.log(`  ${s.name}:`);
      console.log(`    _id: ${s._id}`);
      console.log(`    state: ${s.state ? 'ON' : 'OFF'}`);
      console.log(`    lastStateChange: ${s.lastStateChange || 'Not set'}\n`);
    });

    console.log('\n📝 Activity logs for Computer_Lab:\n');
    const logs = await ActivityLog.find({ deviceId: device._id })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    logs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.timestamp} - ${log.switchName} - ${log.action}`);
      console.log(`    deviceId: ${log.deviceId}`);
      console.log(`    switchId: ${log.switchId || 'NOT SET'}`);
      
      // Check if switchId matches any switch in the device
      const matchingSwitch = device.switches.find(s => s._id.toString() === log.switchId?.toString());
      if (matchingSwitch) {
        console.log(`    ✅ Matches switch: ${matchingSwitch.name}`);
      } else {
        console.log(`    ❌ NO MATCH in current device switches!`);
        console.log(`       This log is orphaned (switch ID doesn't exist in device anymore)`);
      }
      console.log('');
    });

    // Check if activity logs exist with the current switch IDs
    console.log('\n🔍 Checking if current switch IDs have any activity logs:\n');
    for (const switchItem of device.switches) {
      const count = await ActivityLog.countDocuments({
        deviceId: device._id,
        switchId: switchItem._id
      });
      console.log(`  ${switchItem.name} (${switchItem._id}): ${count} logs`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkSwitchIds();
