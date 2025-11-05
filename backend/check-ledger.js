const mongoose = require('mongoose');
const moment = require('moment-timezone');

async function checkLedgerEntries() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');
    
    const DeviceConsumptionLedger = require('./models/DeviceConsumptionLedger');
    
    const todayStart = moment().tz('Asia/Kolkata').startOf('day').toDate();
    const todayEnd = moment().tz('Asia/Kolkata').endOf('day').toDate();
    
    console.log('Checking ledger entries for:', moment().tz('Asia/Kolkata').format('YYYY-MM-DD'));
    console.log('Time range:', todayStart, 'to', todayEnd);
    console.log('='.repeat(60));
    
    const entries = await DeviceConsumptionLedger.find({
      start_ts: { $gte: todayStart, $lte: todayEnd }
    }).lean();
    
    console.log('Ledger entries found:', entries.length);
    
    if (entries.length === 0) {
      console.log('\nNO LEDGER ENTRIES FOUND!');
      console.log('This explains why aggregation is creating 0 records.');
      console.log('\nThe DailyAggregate records you see might be from a different source');
      console.log('or were created manually/incorrectly.');
    } else {
      let totalWh = 0;
      entries.slice(0, 5).forEach(entry => {
        console.log('\nEntry:', entry._id);
        console.log('  Device:', entry.esp32_name);
        console.log('  Energy:', entry.delta_wh, 'Wh');
        console.log('  Cost: ₹', entry.cost_calculation?.cost_inr || 0);
        totalWh += entry.delta_wh;
      });
      if (entries.length > 5) {
        console.log(`\n... and ${entries.length - 5} more entries`);
      }
      console.log('\nTotal from ledger:', (totalWh / 1000).toFixed(3), 'kWh');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkLedgerEntries();
