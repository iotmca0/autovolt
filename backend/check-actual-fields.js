const mongoose = require('mongoose');
const moment = require('moment-timezone');

async function checkActualFields() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');
    
    const DailyAggregate = require('./models/DailyAggregate');
    const todayStr = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    
    const aggregates = await DailyAggregate.find({ date_string: todayStr }).lean();
    
    console.log('Checking actual field values in database:');
    console.log('='.repeat(60));
    
    aggregates.forEach(agg => {
      console.log('\nDevice:', agg.esp32_name);
      console.log('  total_kwh:', agg.total_kwh);
      console.log('  cost_at_calc_time:', agg.cost_at_calc_time);
      console.log('  cost_per_kwh_used:', agg.cost_per_kwh_used);
      console.log('  total_cost_inr:', agg.total_cost_inr);
    });
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkActualFields();
