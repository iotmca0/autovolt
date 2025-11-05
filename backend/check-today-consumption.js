const mongoose = require('mongoose');
const DailyAggregate = require('./models/DailyAggregate');
const moment = require('moment-timezone');

async function checkTodayConsumption() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');
    
    const today = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    console.log('Checking consumption for:', today);
    console.log('='.repeat(60));
    
    const aggregates = await DailyAggregate.find({ date_string: today }).lean();
    console.log('Records found:', aggregates.length);
    
    if (aggregates.length === 0) {
      console.log('NO DATA FOUND for today');
      console.log('This means no power consumption has been recorded yet.');
    } else {
      let totalKwh = 0;
      let totalCost = 0;
      
      aggregates.forEach(agg => {
        const kwh = agg.total_kwh || agg.total_wh / 1000 || 0;
        const cost = agg.cost_at_calc_time || 0;
        totalKwh += kwh;
        totalCost += cost;
        
        console.log('Device:', agg.esp32_name || agg.device_id);
        console.log('  Classroom:', agg.classroom);
        console.log('  Energy:', kwh.toFixed(3), 'kWh');
        console.log('  Cost: ₹', cost.toFixed(2));
        console.log('  Runtime:', (agg.on_time_sec / 3600).toFixed(2), 'hours');
        console.log('-'.repeat(60));
      });
      
      console.log('='.repeat(60));
      console.log('TOTAL FOR TODAY:', today);
      console.log('Total Energy:', totalKwh.toFixed(3), 'kWh');
      console.log('Total Cost: ₹', totalCost.toFixed(2));
      console.log('='.repeat(60));
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTodayConsumption();
