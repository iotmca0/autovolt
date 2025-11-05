const mongoose = require('mongoose');
const moment = require('moment-timezone');

async function fixTodaysCosts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');
    
    const DailyAggregate = require('./models/DailyAggregate');
    const CostVersion = require('./models/CostVersion');
    
    // Get the active cost version
    const costVersion = await CostVersion.findOne({
      is_active: true,
      scope: 'global'
    }).sort({ effective_from: -1 });
    
    if (!costVersion) {
      console.error('No active cost version found!');
      process.exit(1);
    }
    
    const costPerKwh = costVersion.cost_per_kwh;
    console.log('Using electricity rate: ₹', costPerKwh, 'per kWh');
    
    const todayStr = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    console.log('\nFixing costs for:', todayStr);
    console.log('='.repeat(60));
    
    // Get all daily aggregates for today
    const aggregates = await DailyAggregate.find({ date_string: todayStr });
    
    console.log('Found', aggregates.length, 'records to update\n');
    
    let totalKwhBefore = 0;
    let totalCostBefore = 0;
    let totalKwhAfter = 0;
    let totalCostAfter = 0;
    
    // Update each record with correct cost
    for (const agg of aggregates) {
      const kwhBefore = agg.total_kwh || agg.total_wh / 1000 || 0;
      const costBefore = agg.cost_at_calc_time || 0;
      
      totalKwhBefore += kwhBefore;
      totalCostBefore += costBefore;
      
      // Calculate correct cost
      const correctCost = kwhBefore * costPerKwh;
      
      // Update the record with all required fields
      agg.cost_at_calc_time = correctCost;
      agg.total_cost_inr = correctCost;
      agg.cost_per_kwh_at_calc = costPerKwh;
      agg.cost_per_kwh_used = costPerKwh;
      
      // Ensure required fields exist
      if (!agg.calc_run_id) {
        agg.calc_run_id = `manual-fix-${Date.now()}`;
      }
      
      await agg.save();
      
      totalKwhAfter += kwhBefore;
      totalCostAfter += correctCost;
      
      console.log('Updated:', agg.esp32_name);
      console.log('  Energy:', kwhBefore.toFixed(3), 'kWh');
      console.log('  Cost: ₹', costBefore.toFixed(2), '→ ₹', correctCost.toFixed(2));
      console.log('-'.repeat(60));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY:');
    console.log('='.repeat(60));
    console.log('BEFORE:');
    console.log('  Total Energy:', totalKwhBefore.toFixed(3), 'kWh');
    console.log('  Total Cost: ₹', totalCostBefore.toFixed(2));
    console.log('\nAFTER:');
    console.log('  Total Energy:', totalKwhAfter.toFixed(3), 'kWh');
    console.log('  Total Cost: ₹', totalCostAfter.toFixed(2));
    console.log('='.repeat(60));
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

fixTodaysCosts();
