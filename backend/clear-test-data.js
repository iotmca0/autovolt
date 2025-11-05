/**
 * Clear Test Data and Reset to Real Power Tracking
 * 
 * This script:
 * 1. Removes all fake/test DailyAggregate and MonthlyAggregate records
 * 2. Clears DeviceConsumptionLedger (will be populated by real switch events)
 * 3. Keeps ActivityLog intact (real switch operations)
 * 4. Prepares system for real power consumption tracking
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function clearTestData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');

    const DailyAggregate = require('./models/DailyAggregate');
    const MonthlyAggregate = require('./models/MonthlyAggregate');
    const DeviceConsumptionLedger = require('./models/DeviceConsumptionLedger');
    const ActivityLog = require('./models/ActivityLog');
    const EnergyConsumption = require('./models/EnergyConsumption');

    console.log('\n📊 Current Data Status:');
    const dailyCount = await DailyAggregate.countDocuments();
    const monthlyCount = await MonthlyAggregate.countDocuments();
    const ledgerCount = await DeviceConsumptionLedger.countDocuments();
    const activityCount = await ActivityLog.countDocuments();
    const oldEnergyCount = await EnergyConsumption.countDocuments();

    console.log(`- DailyAggregate: ${dailyCount} records`);
    console.log(`- MonthlyAggregate: ${monthlyCount} records`);
    console.log(`- DeviceConsumptionLedger: ${ledgerCount} records`);
    console.log(`- ActivityLog: ${activityCount} records (KEEPING)`);
    console.log(`- EnergyConsumption (old): ${oldEnergyCount} records`);

    console.log('\n🗑️  Clearing test/mock data...');
    
    // Delete all aggregates (test data)
    await DailyAggregate.deleteMany({});
    console.log('✅ Cleared all DailyAggregate records');
    
    await MonthlyAggregate.deleteMany({});
    console.log('✅ Cleared all MonthlyAggregate records');
    
    await DeviceConsumptionLedger.deleteMany({});
    console.log('✅ Cleared DeviceConsumptionLedger');

    // Optional: Clear old EnergyConsumption if you want to start fresh
    const oldEnergyCountFinal = await EnergyConsumption.countDocuments();
    if (oldEnergyCountFinal > 0) {
      console.log(`\n⚠️  Found ${oldEnergyCountFinal} old EnergyConsumption records (OLD SYSTEM)`);
      console.log('These will be ignored by the new power system.');
      // Uncomment to delete:
      // await EnergyConsumption.deleteMany({});
      // console.log('✅ Cleared old EnergyConsumption records');
    }

    console.log('\n✅ Test data cleared successfully!');
    console.log('\n📝 Next Steps:');
    console.log('1. ✅ ActivityLog is preserved (63 switch operations)');
    console.log('2. ✅ Power tracking system is ready');
    console.log('3. 🔄 Turn switches ON/OFF to generate REAL consumption data');
    console.log('4. 📊 Aggregation will run automatically every 5 minutes');
    console.log('5. 🎯 Dashboard will show real kWh based on actual runtime');
    console.log('\n🎯 When switches turn ON → OFF:');
    console.log('   - powerConsumptionTracker saves to DeviceConsumptionLedger');
    console.log('   - aggregationService creates DailyAggregate from ledger');
    console.log('   - Dashboard displays real consumption!');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearTestData();
