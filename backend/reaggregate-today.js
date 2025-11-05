const mongoose = require('mongoose');
const moment = require('moment-timezone');

async function reAggregateToday() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');
    
    const aggregationService = require('./services/aggregationService');
    const today = new Date();
    
    console.log('='.repeat(60));
    console.log('Re-aggregating data for today:', moment().tz('Asia/Kolkata').format('YYYY-MM-DD'));
    console.log('='.repeat(60));
    
    // Get all classrooms
    const DailyAggregate = require('./models/DailyAggregate');
    const todayStr = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    const existing = await DailyAggregate.find({ date_string: todayStr }).distinct('classroom');
    
    console.log('Found classrooms:', existing);
    
    // Re-aggregate for each classroom
    for (const classroom of existing) {
      console.log('\nAggregating for classroom:', classroom);
      await aggregationService.aggregateDaily(today, classroom);
      console.log('✓ Done');
    }
    
    // Also try aggregating without specifying classroom (for all)
    console.log('\nAggregating for all classrooms...');
    await aggregationService.aggregateDaily(today);
    
    console.log('\n' + '='.repeat(60));
    console.log('Re-aggregation complete!');
    console.log('='.repeat(60));
    
    // Check results
    const updated = await DailyAggregate.find({ date_string: todayStr }).lean();
    let totalKwh = 0;
    let totalCost = 0;
    
    updated.forEach(agg => {
      const kwh = agg.total_kwh || agg.total_wh / 1000 || 0;
      const cost = agg.cost_at_calc_time || 0;
      totalKwh += kwh;
      totalCost += cost;
    });
    
    console.log('\nUPDATED RESULTS:');
    console.log('Total Energy:', totalKwh.toFixed(3), 'kWh');
    console.log('Total Cost: ₹', totalCost.toFixed(2));
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

reAggregateToday();
