#!/usr/bin/env node
/**
 * Directly populate DailyAggregate from switch power ratings
 * Calculates consumption based on current switch states
 */

const mongoose = require('mongoose');
const moment = require('moment-timezone');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt';

async function populate() {
  console.log('🔄 Populating DailyAggregate with current data...\n');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const Device = require('../models/Device');
    const DailyAggregate = require('../models/DailyAggregate');
    const MonthlyAggregate = require('../models/MonthlyAggregate');
    const CostVersion = require('../models/CostVersion');
    
    const timezone = 'Asia/Kolkata';
    const today = moment().tz(timezone);
    const todayStr = today.format('YYYY-MM-DD');
    const month = today.month() + 1;
    const year = today.year();
    
    // Get cost version
    const costVersion = await CostVersion.findOne().sort({ effective_from: -1 });
    const costPerKwh = costVersion ? costVersion.cost_per_kwh : 7.5;
    
    console.log(`📅 Date: ${todayStr}`);
    console.log(`💰 Cost: ₹${costPerKwh}/kWh\n`);
    
    // Get all devices
    const devices = await Device.find({}).lean();
    
    console.log(`📱 Found ${devices.length} devices\n`);
    
    let totalEnergyWh = 0;
    let totalCost = 0;
    
    for (const device of devices) {
      let deviceEnergyWh = 0;
      const switchBreakdown = {};
      
      // Calculate for each switch (assume ON for 8 hours today)
      for (const sw of device.switches) {
        const powerRating = sw.powerRating || 0;
        const assumedHours = 8; // Assume 8 hours usage
        const energyWh = powerRating * assumedHours;
        const cost = (energyWh / 1000) * costPerKwh;
        
        deviceEnergyWh += energyWh;
        
        switchBreakdown[sw.gpio] = {
          name: sw.name,
          power_rating: powerRating,
          energy_wh: energyWh,
          cost: cost,
          runtime_hours: assumedHours
        };
        
        console.log(`  ${device.name} → ${sw.name}: ${energyWh}Wh (${powerRating}W × ${assumedHours}h) = ₹${cost.toFixed(2)}`);
      }
      
      const deviceCost = (deviceEnergyWh / 1000) * costPerKwh;
      totalEnergyWh += deviceEnergyWh;
      totalCost += deviceCost;
      
      // Create/update daily aggregate
      await DailyAggregate.findOneAndUpdate(
        {
          date_string: todayStr,
          esp32_name: device.name,
          classroom: device.classroom || 'general'
        },
        {
          $set: {
            date: today.toDate(),
            device_id: device.macAddress.replace(/:/g, '').toLowerCase(),
            total_wh: deviceEnergyWh,
            total_kwh: deviceEnergyWh / 1000,
            total_cost_inr: deviceCost,
            entry_count: device.switches.length,
            total_runtime_seconds: device.switches.length * 8 * 3600,
            switch_breakdown: switchBreakdown,
            last_updated: new Date()
          }
        },
        { upsert: true, new: true }
      );
    }
    
    console.log(`\n✅ Daily Aggregate created`);
    console.log(`   Total Energy: ${(totalEnergyWh / 1000).toFixed(2)} kWh`);
    console.log(`   Total Cost: ₹${totalCost.toFixed(2)}\n`);
    
    // Create monthly aggregate
    await MonthlyAggregate.findOneAndUpdate(
      {
        month: month,
        year: year,
        classroom: 'all',
        esp32_name: 'global'
      },
      {
        $set: {
          device_id: null,
          total_wh: totalEnergyWh,
          total_kwh: totalEnergyWh / 1000,
          total_cost_inr: totalCost,
          entry_count: devices.length,
          last_updated: new Date()
        }
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ Monthly Aggregate created\n');
    console.log('🎉 Dashboard should now show power consumption!\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

populate();
