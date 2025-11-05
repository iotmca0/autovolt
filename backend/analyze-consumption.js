const mongoose = require('mongoose');
const moment = require('moment-timezone');

async function analyzeConsumption() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');
    
    const DailyAggregate = require('./models/DailyAggregate');
    const Device = require('./models/Device');
    
    const todayStr = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    
    console.log('ANALYZING TODAY\'S CONSUMPTION (Nov 5, 2025)');
    console.log('='.repeat(60));
    
    const aggregates = await DailyAggregate.find({ date_string: todayStr }).lean();
    
    console.log(`\nFound ${aggregates.length} device records:\n`);
    
    let totalKwh = 0;
    
    for (const agg of aggregates) {
      const kwh = agg.total_kwh || agg.total_wh / 1000 || 0;
      totalKwh += kwh;
      
      console.log(`Device: ${agg.esp32_name}`);
      console.log(`  Classroom: ${agg.classroom}`);
      console.log(`  Energy: ${kwh.toFixed(3)} kWh`);
      console.log(`  Runtime: ${(agg.on_time_sec / 3600).toFixed(2)} hours`);
      
      // Try to get device info to see switch count
      const device = await Device.findOne({ name: agg.esp32_name }).lean();
      if (device) {
        const switchCount = device.switches ? device.switches.length : 0;
        const avgPowerPerSwitch = switchCount > 0 ? (kwh * 1000) / ((agg.on_time_sec / 3600) * switchCount) : 0;
        console.log(`  Switches: ${switchCount}`);
        if (agg.on_time_sec > 0 && switchCount > 0) {
          console.log(`  Avg power/switch: ~${avgPowerPerSwitch.toFixed(0)}W`);
        }
      }
      console.log('-'.repeat(60));
    }
    
    console.log(`\nTOTAL: ${totalKwh.toFixed(3)} kWh\n`);
    
    // Analysis
    console.log('ANALYSIS:');
    console.log('='.repeat(60));
    
    if (totalKwh > 0 && aggregates.some(a => a.on_time_sec === 0)) {
      console.log('⚠️  WARNING: Some devices show energy consumption but 0 runtime!');
      console.log('   This suggests the data might be test data or incorrectly calculated.');
    }
    
    console.log('\nTo verify if 16 kWh is realistic:');
    console.log('- Check if devices were actually ON today');
    console.log('- Verify switch states in the dashboard');
    console.log('- Check ActivityLog for actual switch operations');
    
    // Check activity logs
    const ActivityLog = require('./models/ActivityLog');
    const todayStart = moment().tz('Asia/Kolkata').startOf('day').toDate();
    const todayEnd = moment().tz('Asia/Kolkata').endOf('day').toDate();
    
    const activityCount = await ActivityLog.countDocuments({
      timestamp: { $gte: todayStart, $lte: todayEnd },
      action: { $in: ['on', 'off', 'switch_on', 'switch_off'] }
    });
    
    console.log(`\n✓ Activity logs today: ${activityCount} switch operations`);
    
    if (activityCount === 0 && totalKwh > 0) {
      console.log('⚠️  No switch activity but energy recorded = likely TEST DATA');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

analyzeConsumption();
