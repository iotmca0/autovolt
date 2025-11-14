// Check actual timestamp storage format
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Device = require('../models/Device');

async function checkTimestamps() {
  try {
    await mongoose.connect('mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    const device = await Device.findOne({ name: 'Computer_Lab' }).lean();
    
    const logs = await ActivityLog.find({
      deviceId: device._id,
      switchName: 'Light 1'
    }).sort({ timestamp: -1 }).limit(5).lean();

    console.log('📊 Light 1 Recent Logs (RAW from database):\n');
    logs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.action}`);
      console.log(`   timestamp field: ${log.timestamp}`);
      console.log(`   timestamp.toISOString(): ${new Date(log.timestamp).toISOString()}`);
      console.log(`   timestamp (local): ${new Date(log.timestamp).toString()}`);
      console.log(`   timestamp (epoch ms): ${new Date(log.timestamp).getTime()}\n`);
    });

    // Check what "today" means
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    console.log('⏰ Analysis Window:');
    console.log(`   Current time: ${now} (${now.toISOString()})`);
    console.log(`   Start of day (IST midnight): ${startOfDay} (${startOfDay.toISOString()})`);
    console.log(`   Start of day epoch: ${startOfDay.getTime()}\n`);

    // Find logs in today's timeframe
    const todayLogs = await ActivityLog.find({
      deviceId: device._id,
      switchName: 'Light 1',
      timestamp: { $gte: startOfDay, $lte: now }
    }).sort({ timestamp: 1 }).lean();

    console.log(`📝 Found ${todayLogs.length} logs for Light 1 in today's timeframe\n`);
    
    if (todayLogs.length > 0) {
      todayLogs.forEach((log, index) => {
        console.log(`${index + 1}. ${log.timestamp} - ${log.action}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkTimestamps();
