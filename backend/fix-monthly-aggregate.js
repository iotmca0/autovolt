const mongoose = require('mongoose');
const moment = require('moment-timezone');

async function fixMonthlyAggregate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');
    
    const MonthlyAggregate = require('./models/MonthlyAggregate');
    const CostVersion = require('./models/CostVersion');
    
    const costVersion = await CostVersion.findOne({
      is_active: true,
      scope: 'global'
    }).sort({ effective_from: -1 });
    
    const costPerKwh = costVersion.cost_per_kwh;
    console.log('Using electricity rate: ₹', costPerKwh, 'per kWh');
    
    const currentMonth = moment().tz('Asia/Kolkata').month() + 1;
    const currentYear = moment().tz('Asia/Kolkata').year();
    
    console.log('\nFixing costs for:', currentYear, '-', currentMonth);
    console.log('='.repeat(60));
    
    const aggregates = await MonthlyAggregate.find({ 
      month: currentMonth,
      year: currentYear
    });
    
    console.log('Found', aggregates.length, 'records to update\n');
    
    for (const agg of aggregates) {
      const kwhBefore = agg.total_kwh || agg.total_wh / 1000 || 0;
      const costBefore = agg.cost_at_calc_time || 0;
      const correctCost = kwhBefore * costPerKwh;
      
      agg.cost_at_calc_time = correctCost;
      agg.cost_per_kwh_used = costPerKwh;
      
      if (!agg.calc_run_id) {
        agg.calc_run_id = `manual-fix-${Date.now()}`;
      }
      
      if (!agg.month_string) {
        agg.month_string = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      }
      
      await agg.save();
      
      console.log('Updated:', agg.esp32_name || 'classroom aggregate');
      console.log('  Energy:', kwhBefore.toFixed(3), 'kWh');
      console.log('  Cost: ₹', costBefore.toFixed(2), '→ ₹', correctCost.toFixed(2));
      console.log('-'.repeat(60));
    }
    
    console.log('\n✅ Monthly aggregates fixed!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

fixMonthlyAggregate();
