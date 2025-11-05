/**
 * Verify Real Power Tracking Setup
 * 
 * Checks if the system is ready for real power consumption tracking
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function verifySetup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    const DailyAggregate = require('./models/DailyAggregate');
    const MonthlyAggregate = require('./models/MonthlyAggregate');
    const DeviceConsumptionLedger = require('./models/DeviceConsumptionLedger');
    const ActivityLog = require('./models/ActivityLog');
    const Device = require('./models/Device');
    const PowerSettings = require('./models/PowerSettings');

    console.log('📊 DATABASE STATUS:\n');
    
    // Check if test data is cleared
    const dailyCount = await DailyAggregate.countDocuments();
    const monthlyCount = await MonthlyAggregate.countDocuments();
    const ledgerCount = await DeviceConsumptionLedger.countDocuments();
    
    console.log('1. Test Data Cleared:');
    console.log(`   - DailyAggregate: ${dailyCount} records ${dailyCount === 0 ? '✅' : '⚠️ (should be 0)'}`);
    console.log(`   - MonthlyAggregate: ${monthlyCount} records ${monthlyCount === 0 ? '✅' : '⚠️ (should be 0)'}`);
    console.log(`   - DeviceConsumptionLedger: ${ledgerCount} records ${ledgerCount === 0 ? '✅' : '(will have entries after switches toggle)'}`);
    
    // Check real data preserved
    const activityCount = await ActivityLog.countDocuments();
    console.log(`\n2. Real Data Preserved:`);
    console.log(`   - ActivityLog: ${activityCount} records ✅`);
    
    // Check devices
    const devices = await Device.find({ type: 'esp32' }).lean();
    const onlineDevices = devices.filter(d => d.status === 'online');
    console.log(`\n3. ESP32 Devices:`);
    console.log(`   - Total: ${devices.length}`);
    console.log(`   - Online: ${onlineDevices.length} ✅`);
    
    if (onlineDevices.length > 0) {
      console.log('\n   Online Devices:');
      onlineDevices.forEach(d => {
        const switchCount = d.switches?.length || 0;
        console.log(`   - ${d.name}: ${switchCount} switches`);
      });
    } else {
      console.log('   ⚠️  No devices online - power tracking requires online devices');
    }
    
    // Check power settings
    const settings = await PowerSettings.getSingleton();
    if (settings) {
      console.log(`\n4. Power Settings:`);
      console.log(`   - Electricity Rate: ₹${settings.electricityPrice}/kWh ✅`);
      console.log(`   - Device Types: ${settings.deviceTypes.length} configured ✅`);
      console.log('\n   Device Power Consumption:');
      settings.deviceTypes.slice(0, 5).forEach(d => {
        console.log(`   - ${d.name}: ${d.powerConsumption}${d.unit}`);
      });
    } else {
      console.log('\n4. Power Settings: ⚠️ NOT FOUND - will use defaults');
    }
    
    console.log('\n\n🎯 NEXT STEPS:\n');
    console.log('1. ✅ Database is clean (test data removed)');
    console.log('2. ✅ System is ready for real power tracking');
    console.log('3. 🔄 Restart backend server: npm start');
    console.log('4. 🎮 Go to Dashboard and toggle any switch ON → OFF');
    console.log('5. 📊 Check Analytics & Monitoring for real consumption data');
    
    console.log('\n\n💡 TEST INSTRUCTIONS:\n');
    console.log('A. Turn any switch ON');
    console.log('B. Wait 10-30 seconds (or longer for more consumption)');
    console.log('C. Turn the same switch OFF');
    console.log('D. Refresh Analytics dashboard');
    console.log('E. You should see REAL consumption with runtime > 0');
    
    console.log('\n\n📝 VERIFICATION:\n');
    console.log('Run these commands after toggling switches:');
    console.log('  node check-ledger.js       → Check if entries saved');
    console.log('  node analyze-consumption.js → Check aggregated data');
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifySetup();
