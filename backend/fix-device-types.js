/**
 * Fix device types - Set all devices to type 'esp32'
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixDeviceTypes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    const Device = require('./models/Device');

    // Find devices with undefined or missing type
    const devicesWithoutType = await Device.find({
      $or: [
        { type: { $exists: false } },
        { type: null },
        { type: undefined },
        { type: '' }
      ]
    });

    console.log(`📊 Found ${devicesWithoutType.length} devices without proper type\n`);

    if (devicesWithoutType.length === 0) {
      console.log('✅ All devices already have correct types!');
    } else {
      console.log('Devices to fix:\n');
      devicesWithoutType.forEach(d => {
        console.log(`  - ${d.name} (${d.macAddress}) - Current type: ${d.type}`);
      });

      console.log('\n🔧 Updating all devices to type: "esp32"...\n');

      // Update all devices
      const result = await Device.updateMany(
        {
          $or: [
            { type: { $exists: false } },
            { type: null },
            { type: undefined },
            { type: '' }
          ]
        },
        {
          $set: { type: 'esp32' }
        }
      );

      console.log(`✅ Updated ${result.modifiedCount} devices!\n`);

      // Verify
      const allDevices = await Device.find().lean();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📊 After Fix:\n');
      allDevices.forEach(d => {
        console.log(`  - ${d.name}: type = "${d.type}", status = "${d.status}"`);
      });

      const esp32Count = await Device.countDocuments({ type: 'esp32' });
      const onlineCount = await Device.countDocuments({ type: 'esp32', status: 'online' });

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('✅ SUCCESS!\n');
      console.log(`  Total ESP32 devices: ${esp32Count}`);
      console.log(`  Online ESP32 devices: ${onlineCount}`);
      console.log('\n🎯 Power tracking should now work!');
      console.log('   Toggle switches ON → OFF to generate consumption data.\n');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixDeviceTypes();
