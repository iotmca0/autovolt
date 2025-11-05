/**
 * Delete incorrect migration ActivityLog entries
 */

const mongoose = require('mongoose');
const ActivityLog = require('./models/ActivityLog');

async function deleteMigrationLogs() {
  try {
    await mongoose.connect('mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');

    // Delete the migration logs created at 7:19 PM (between 1:45 PM - 2:30 PM IST)
    const result = await ActivityLog.deleteMany({
      triggeredBy: 'system',
      action: { $in: ['device_online', 'device_offline'] },
      timestamp: { 
        $gte: new Date('2025-11-05T13:45:00'), 
        $lte: new Date('2025-11-05T14:30:00') 
      }
    });

    console.log(`Deleted ${result.deletedCount} migration logs`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

deleteMigrationLogs();
