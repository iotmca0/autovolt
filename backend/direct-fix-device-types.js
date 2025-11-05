/**
 * Fix device types using direct MongoDB update
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function directFixDeviceTypes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    // Use direct MongoDB collection
    const db = mongoose.connection.db;
    const devicesCollection = db.collection('devices');

    // Check current state
    const before = await devicesCollection.find().toArray();
    console.log(`📊 Found ${before.length} devices\n`);
    console.log('Before fix:\n');
    before.forEach(d => {
      console.log(`  - ${d.name}: type = ${typeof d.type} (${d.type}), status = ${d.status}`);
    });

    console.log('\n🔧 Updating ALL devices to type: "esp32"...\n');

    // Update all documents
    const result = await devicesCollection.updateMany(
      {}, // Match all documents
      { $set: { type: 'esp32' } }
    );

    console.log(`✅ Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}\n`);

    // Verify
    const after = await devicesCollection.find().toArray();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 After Fix:\n');
    after.forEach(d => {
      console.log(`  - ${d.name}: type = "${d.type}", status = "${d.status}"`);
    });

    const esp32Count = await devicesCollection.countDocuments({ type: 'esp32' });
    const onlineCount = await devicesCollection.countDocuments({ type: 'esp32', status: 'online' });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ SUCCESS!\n');
    console.log(`  Total ESP32 devices: ${esp32Count}`);
    console.log(`  Online ESP32 devices: ${onlineCount}`);
    console.log('\n🎯 Power tracking is now FIXED!');
    console.log('\nTest it:');
    console.log('1. Turn any switch ON');
    console.log('2. Wait 10-30 seconds');
    console.log('3. Turn the switch OFF');
    console.log('4. Run: node check-ledger.js');
    console.log('5. You should see a ledger entry!\n');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

directFixDeviceTypes();
