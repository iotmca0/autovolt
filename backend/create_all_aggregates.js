/**
 * Full Historical Energy Aggregation Script
 * 
 * This script creates Daily and Monthly aggregates for all historical data
 * from activity logs, ensuring charts and cards show correct consumption
 * even when devices are offline.
 * 
 * Usage: node create_all_aggregates.js
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/iot-classroom-automation';
const TIMEZONE = 'Asia/Kolkata';

const Device = require('./models/Device');
const ActivityLog = require('./models/ActivityLog');
const aggregationService = require('./services/aggregationService');

async function createAllAggregates() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('📊 FULL HISTORICAL ENERGY AGGREGATION');
    console.log('='.repeat(80) + '\n');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Find date range from activity logs
    console.log('🔍 Analyzing activity logs...\n');
    
    const oldestLog = await ActivityLog.findOne({
      action: { $in: ['on', 'off', 'manual_on', 'manual_off', 'switch_on', 'switch_off'] }
    }).sort({ timestamp: 1 }).lean();

    const newestLog = await ActivityLog.findOne({
      action: { $in: ['on', 'off', 'manual_on', 'manual_off', 'switch_on', 'switch_off'] }
    }).sort({ timestamp: -1 }).lean();

    if (!oldestLog || !newestLog) {
      console.log('⚠️  No switch activity logs found in database');
      console.log('   Cannot create aggregates without historical data\n');
      await mongoose.disconnect();
      return;
    }

    const startDate = moment(oldestLog.timestamp).tz(TIMEZONE).startOf('day');
    const endDate = moment(newestLog.timestamp).tz(TIMEZONE).endOf('day');
    const daysDiff = endDate.diff(startDate, 'days') + 1;

    console.log(`Oldest activity: ${startDate.format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`Newest activity: ${endDate.format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`Date range: ${daysDiff} days\n`);

    // 2. Get all devices
    const devices = await Device.find({}, { name: 1, classroom: 1 }).lean();
    console.log(`Found ${devices.length} devices\n`);

    // 3. Create daily aggregates for each day
    console.log('─'.repeat(80));
    console.log('📅 CREATING DAILY AGGREGATES');
    console.log('─'.repeat(80) + '\n');

    const currentDay = startDate.clone();
    let successCount = 0;
    let errorCount = 0;

    while (currentDay.isSameOrBefore(endDate, 'day')) {
      try {
        const dateStr = currentDay.format('YYYY-MM-DD');
        process.stdout.write(`  Processing ${dateStr}... `);
        
        // Aggregate for all classrooms on this day
        await aggregationService.aggregateDaily(currentDay.toDate());
        
        console.log('✅');
        successCount++;
      } catch (error) {
        console.log('❌', error.message);
        errorCount++;
      }
      
      currentDay.add(1, 'day');
    }

    console.log(`\n✅ Daily aggregation complete: ${successCount} days processed, ${errorCount} errors\n`);

    // 4. Create monthly aggregates
    console.log('─'.repeat(80));
    console.log('📅 CREATING MONTHLY AGGREGATES');
    console.log('─'.repeat(80) + '\n');

    const currentMonth = startDate.clone().startOf('month');
    const endMonth = endDate.clone().startOf('month');
    
    successCount = 0;
    errorCount = 0;

    while (currentMonth.isSameOrBefore(endMonth, 'month')) {
      try {
        const monthStr = currentMonth.format('YYYY-MM');
        process.stdout.write(`  Processing ${monthStr}... `);
        
        // Aggregate for all classrooms for this month
        await aggregationService.aggregateMonthly(
          currentMonth.year(),
          currentMonth.month() + 1
        );
        
        console.log('✅');
        successCount++;
      } catch (error) {
        console.log('❌', error.message);
        errorCount++;
      }
      
      currentMonth.add(1, 'month');
    }

    console.log(`\n✅ Monthly aggregation complete: ${successCount} months processed, ${errorCount} errors\n`);

    // 5. Verify results
    console.log('─'.repeat(80));
    console.log('📊 VERIFICATION');
    console.log('─'.repeat(80) + '\n');

    const DailyAggregate = require('./models/DailyAggregate');
    const MonthlyAggregate = require('./models/MonthlyAggregate');

    const dailyCount = await DailyAggregate.countDocuments();
    const monthlyCount = await MonthlyAggregate.countDocuments();

    console.log(`Daily Aggregates: ${dailyCount} records`);
    console.log(`Monthly Aggregates: ${monthlyCount} records\n`);

    // Show current month totals
    const now = moment().tz(TIMEZONE);
    const currentYear = now.year();
    const currentMonthNum = now.month() + 1;

    const monthlyAggs = await MonthlyAggregate.find({
      year: currentYear,
      month: currentMonthNum
    }).lean();

    if (monthlyAggs.length > 0) {
      let totalKwh = 0;
      let totalCost = 0;

      console.log(`Current Month (${currentYear}-${String(currentMonthNum).padStart(2, '0')}) Summary:`);
      for (const agg of monthlyAggs) {
        const kwh = agg.total_kwh || agg.total_wh / 1000 || 0;
        const cost = agg.cost_at_calc_time || 0;
        totalKwh += kwh;
        totalCost += cost;
        console.log(`  ${agg.classroom}/${agg.esp32_name}: ${kwh.toFixed(3)} kWh, ₹${cost.toFixed(2)}`);
      }
      console.log(`\n  Total: ${totalKwh.toFixed(3)} kWh, ₹${totalCost.toFixed(2)}\n`);
    } else {
      console.log('⚠️  No aggregates found for current month\n');
    }

    // Show last 6 months totals (for chart verification)
    console.log('─'.repeat(80));
    console.log('📊 LAST 6 MONTHS SUMMARY (for chart verification)');
    console.log('─'.repeat(80) + '\n');

    const sixMonthsAgo = now.clone().subtract(6, 'months').startOf('month');
    const last6MonthsAggs = await MonthlyAggregate.find({
      $or: [
        { year: { $gt: sixMonthsAgo.year() } },
        { year: sixMonthsAgo.year(), month: { $gte: sixMonthsAgo.month() + 1 } }
      ]
    }).sort({ year: 1, month: 1 }).lean();

    if (last6MonthsAggs.length > 0) {
      const monthlyTotals = {};
      let grandTotal = 0;
      let grandCost = 0;

      for (const agg of last6MonthsAggs) {
        const kwh = agg.total_kwh || agg.total_wh / 1000 || 0;
        const cost = agg.cost_at_calc_time || 0;
        const key = `${agg.year}-${String(agg.month).padStart(2, '0')}`;
        
        if (!monthlyTotals[key]) {
          monthlyTotals[key] = { kwh: 0, cost: 0 };
        }
        monthlyTotals[key].kwh += kwh;
        monthlyTotals[key].cost += cost;
        grandTotal += kwh;
        grandCost += cost;
      }

      const months = Object.keys(monthlyTotals).sort();
      for (const month of months) {
        const data = monthlyTotals[month];
        console.log(`  ${month}: ${data.kwh.toFixed(3)} kWh, ₹${data.cost.toFixed(2)}`);
      }

      console.log(`\n  📊 6-Month Total: ${grandTotal.toFixed(3)} kWh, ₹${grandCost.toFixed(2)}`);
      console.log(`     (This should match your chart totals)\n`);
    } else {
      console.log('⚠️  No data for last 6 months\n');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');

    console.log('='.repeat(80));
    console.log('✅ AGGREGATION COMPLETE');
    console.log('='.repeat(80) + '\n');

    console.log('Next Steps:');
    console.log('  1. Refresh your browser (Ctrl+F5)');
    console.log('  2. Check the energy dashboard');
    console.log('  3. Charts should now show historical data even for offline devices');
    console.log('  4. Set up cron job to run aggregation regularly:\n');
    console.log('     # Linux/Mac crontab:');
    console.log('     0 */6 * * * cd /path/to/backend && node reaggregate-today.js\n');
    console.log('     # Or use PM2 for continuous monitoring\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error(error.stack);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createAllAggregates()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
