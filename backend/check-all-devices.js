/**
 * Check all devices in database
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkAllDevices() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    const Device = require('./models/Device');

    // Get ALL devices (not just esp32)
    const allDevices = await Device.find().lean();
    
    console.log(`📊 Total Devices in Database: ${allDevices.length}\n`);

    if (allDevices.length === 0) {
      console.log('❌ NO DEVICES AT ALL!');
      console.log('Database is empty.\n');
    } else {
      // Group by type
      const byType = {};
      allDevices.forEach(d => {
        const type = d.type || 'unknown';
        if (!byType[type]) byType[type] = [];
        byType[type].push(d);
      });

      console.log('Devices by Type:\n');
      Object.keys(byType).forEach(type => {
        console.log(`${type}: ${byType[type].length} devices`);
        byType[type].forEach(d => {
          console.log(`  - ${d.name || d._id} (${d.macAddress || 'no MAC'}) - Status: ${d.status || 'unknown'}`);
        });
        console.log();
      });

      // Check if ActivityLog devices match
      const ActivityLog = require('./models/ActivityLog');
      const recentLogs = await ActivityLog.find().sort({ timestamp: -1 }).limit(5).lean();
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🔍 Checking ActivityLog → Device Mapping:\n');
      
      for (const log of recentLogs) {
        const deviceInDb = allDevices.find(d => 
          d._id.toString() === log.deviceId?.toString() || 
          d.name === log.deviceName
        );
        
        console.log(`ActivityLog: ${log.deviceName}`);
        console.log(`  DeviceId in log: ${log.deviceId}`);
        console.log(`  Found in devices: ${deviceInDb ? '✅ YES' : '❌ NO'}`);
        if (deviceInDb) {
          console.log(`  Device type: ${deviceInDb.type}`);
          console.log(`  Device status: ${deviceInDb.status}`);
        }
        console.log();
      }
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAllDevices();
