const mongoose = require('mongoose');
const ActivityLog = require('./models/ActivityLog');

async function fixTimestamps() {
  await mongoose.connect('mongodb://localhost:27017/autovolt');
  
  // Update online devices - set timestamp to start of today (00:00)
  const startOfToday = new Date('2025-11-05T00:00:00+05:30'); // IST midnight
  
  const result1 = await ActivityLog.updateMany(
    {
      action: 'device_online',
      triggeredBy: 'system',
      timestamp: { $gte: new Date('2025-11-05T13:00:00'), $lte: new Date('2025-11-05T20:00:00') }
    },
    {
      $set: { timestamp: startOfToday }
    }
  );
  
  console.log(`Updated ${result1.modifiedCount} online device logs to start of day`);
  
  // Check the results
  const logs = await ActivityLog.find({
    action: { $in: ['device_online', 'device_offline'] },
    timestamp: { $gte: new Date('2025-11-04T00:00:00') }
  }).sort({ timestamp: -1 });
  
  console.log('\nAll device status logs for today:');
  logs.forEach(l => {
    console.log(`${l.deviceName}: ${l.action} at ${l.timestamp}`);
  });
  
  process.exit(0);
}

fixTimestamps();
