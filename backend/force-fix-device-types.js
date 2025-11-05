/**
 * Fix device types - Force update all devices to esp32 type
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function forceFixDeviceTypes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    const Device = require('./models/Device');

    // Get ALL devices
    const allDevices = await Device.find();

    console.log(`📊 Found ${allDevices.length} devices total\n`);

    console.log('Current state:\n');
    allDevices.forEach(d => {
      console.log(`  - ${d.name}: type = "${d.type}", status = "${d.status}"`);
    });

    console.log('\n🔧 Updating ALL devices to type: "esp32"...\n');

    // Update each device individually
    let updated = 0;
    for (const device of allDevices) {
      device.type = 'esp32';
      await device.save();
      updated++;
      console.log(`  ✅ Updated ${device.name}`);
    }

    console.log(`\n✅ Updated ${updated} devices!\n`);

    // Verify
    const verifyDevices = await Device.find().lean();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 After Fix:\n');
    verifyDevices.forEach(d => {
      console.log(`  - ${d.name}: type = "${d.type}", status = "${d.status}"`);
    });

    const esp32Count = await Device.countDocuments({ type: 'esp32' });
    const onlineCount = await Device.countDocuments({ type: 'esp32', status: 'online' });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ SUCCESS!\n');
    console.log(`  Total ESP32 devices: ${esp32Count}`);
    console.log(`  Online ESP32 devices: ${onlineCount}`);
    console.log('\n🎯 Power tracking is now enabled!');
    console.log('\nNext steps:');
    console.log('1. Turn any switch ON');
    console.log('2. Wait 10-30 seconds');
    console.log('3. Turn the switch OFF');
    console.log('4. Run: node check-ledger.js');
    console.log('5. Check Analytics dashboard\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

forceFixDeviceTypes();
