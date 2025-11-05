#!/usr/bin/env node
/**
 * Configure Power Ratings for Devices
 * 
 * This script adds power ratings (watts) to each switch in your devices.
 * Power ratings are used by the backend to calculate energy consumption:
 * 
 * Energy (Wh) = Power Rating (W) × Time ON (hours)
 * Cost (₹) = Energy (kWh) × Cost per kWh
 * 
 * Usage:
 *   node backend/scripts/configure_power_ratings.cjs
 * 
 * Default Power Ratings:
 * - LED Bulb: 40W
 * - Tube Light: 40W
 * - Fan: 60W
 * - Projector: 200W
 * - Computer: 100W
 * - AC Unit: 1500W
 * - Other: 50W (default)
 */

const mongoose = require('mongoose');
const readline = require('readline');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt';

// Default power ratings by switch type
const DEFAULT_POWER_RATINGS = {
  'light': 40,      // LED bulb
  'fan': 60,        // Ceiling fan
  'projector': 200, // Classroom projector
  'outlet': 100,    // Generic outlet (computer/device)
  'ac': 1500,       // Air conditioner
  'relay': 50       // Generic relay (default)
};

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

/**
 * Main execution
 */
async function main() {
  console.log('\n========================================');
  console.log('⚡ Configure Power Ratings for Devices');
  console.log('========================================\n');
  
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const Device = require('../models/Device');
    
    // Get all devices
    const devices = await Device.find({});
    
    if (devices.length === 0) {
      console.log('❌ No devices found in database');
      console.log('   Please add devices first via the web UI');
      await cleanup();
      return;
    }
    
    console.log(`Found ${devices.length} device(s):\n`);
    
    // Show current configuration
    for (const device of devices) {
      console.log(`📱 Device: ${device.name}`);
      console.log(`   MAC: ${device.macAddress}`);
      console.log(`   Location: ${device.location}`);
      console.log(`   Switches: ${device.switches.length}`);
      console.log('');
      
      for (let i = 0; i < device.switches.length; i++) {
        const sw = device.switches[i];
        const currentRating = sw.powerRating || 0;
        const hasRating = currentRating > 0 ? '✅' : '❌';
        console.log(`   ${hasRating} Switch ${i + 1}: ${sw.name} (GPIO ${sw.gpio})`);
        console.log(`      Type: ${sw.type} | Current: ${currentRating}W`);
      }
      console.log('');
    }
    
    // Ask user how to proceed
    console.log('How would you like to configure power ratings?\n');
    console.log('1. Auto-configure (use defaults based on switch type)');
    console.log('2. Manual entry (enter rating for each switch)');
    console.log('3. Cancel\n');
    
    const choice = await question('Choose option (1-3): ');
    
    if (choice === '1') {
      await autoConfigureRatings(devices);
    } else if (choice === '2') {
      await manualConfigureRatings(devices);
    } else {
      console.log('\n❌ Operation cancelled');
      await cleanup();
      return;
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await cleanup();
  }
}

/**
 * Auto-configure using defaults
 */
async function autoConfigureRatings(devices) {
  console.log('\n⚙️ Auto-configuring power ratings...\n');
  
  const Device = require('../models/Device');
  let totalConfigured = 0;
  
  for (const device of devices) {
    let updated = false;
    
    for (const sw of device.switches) {
      const defaultRating = DEFAULT_POWER_RATINGS[sw.type] || 50;
      
      // Only update if not already set or set to 0
      if (!sw.powerRating || sw.powerRating === 0) {
        sw.powerRating = defaultRating;
        updated = true;
        totalConfigured++;
        console.log(`✅ ${device.name} → ${sw.name}: ${defaultRating}W (${sw.type})`);
      } else {
        console.log(`⏭️  ${device.name} → ${sw.name}: ${sw.powerRating}W (already set)`);
      }
    }
    
    if (updated) {
      await device.save();
    }
  }
  
  console.log(`\n✅ Auto-configuration complete!`);
  console.log(`   Configured ${totalConfigured} switch(es)\n`);
  
  // Show summary
  await showSummary(devices);
}

/**
 * Manual configuration
 */
async function manualConfigureRatings(devices) {
  console.log('\n📝 Manual configuration...\n');
  
  const Device = require('../models/Device');
  
  for (const device of devices) {
    console.log(`\n📱 Device: ${device.name}`);
    
    for (let i = 0; i < device.switches.length; i++) {
      const sw = device.switches[i];
      const defaultRating = DEFAULT_POWER_RATINGS[sw.type] || 50;
      
      console.log(`\n   Switch ${i + 1}: ${sw.name} (GPIO ${sw.gpio})`);
      console.log(`   Type: ${sw.type}`);
      console.log(`   Current: ${sw.powerRating || 0}W`);
      console.log(`   Suggested: ${defaultRating}W`);
      
      const answer = await question(`   Enter power rating in Watts [${defaultRating}]: `);
      
      if (answer.trim() === '') {
        sw.powerRating = defaultRating;
      } else {
        const rating = parseInt(answer);
        if (isNaN(rating) || rating < 0) {
          console.log('   ❌ Invalid input, using default');
          sw.powerRating = defaultRating;
        } else {
          sw.powerRating = rating;
        }
      }
      
      console.log(`   ✅ Set to ${sw.powerRating}W`);
    }
    
    await device.save();
    console.log(`\n✅ ${device.name} saved`);
  }
  
  console.log('\n✅ Manual configuration complete!\n');
  
  // Show summary
  await showSummary(devices);
}

/**
 * Show configuration summary
 */
async function showSummary(devices) {
  const Device = require('../models/Device');
  
  // Reload devices to get fresh data
  const updatedDevices = await Device.find({});
  
  console.log('\n========================================');
  console.log('📊 Power Rating Summary');
  console.log('========================================\n');
  
  let totalWatts = 0;
  let totalSwitches = 0;
  
  for (const device of updatedDevices) {
    console.log(`📱 ${device.name}:`);
    
    let deviceTotal = 0;
    for (const sw of device.switches) {
      console.log(`   ${sw.name}: ${sw.powerRating}W`);
      deviceTotal += sw.powerRating;
      totalSwitches++;
    }
    
    console.log(`   Device Total: ${deviceTotal}W`);
    console.log('');
    totalWatts += deviceTotal;
  }
  
  console.log(`Total Power Capacity: ${totalWatts}W (${(totalWatts / 1000).toFixed(2)}kW)`);
  console.log(`Total Switches: ${totalSwitches}`);
  console.log('');
  
  // Calculate daily cost if all switches run 8 hours
  const dailyKwh = (totalWatts * 8) / 1000;
  const dailyCost = dailyKwh * 7.5; // ₹7.50 per kWh
  
  console.log('💡 Estimated Costs (if all switches run 8 hours/day):');
  console.log(`   Daily: ${dailyKwh.toFixed(2)} kWh → ₹${dailyCost.toFixed(2)}`);
  console.log(`   Monthly: ${(dailyKwh * 30).toFixed(2)} kWh → ₹${(dailyCost * 30).toFixed(2)}`);
  console.log('');
  
  console.log('✅ Configuration saved to database');
  console.log('');
  console.log('📌 Next Steps:');
  console.log('   1. Create cost version: node backend/scripts/create_initial_cost_version.cjs');
  console.log('   2. Toggle switches via web UI');
  console.log('   3. Wait 30 seconds for backend to process');
  console.log('   4. Check dashboard for power consumption data');
  console.log('');
}

/**
 * Cleanup and exit
 */
async function cleanup() {
  rl.close();
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
  process.exit(0);
}

// Handle Ctrl+C
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Operation cancelled by user');
  await cleanup();
});

// Run
main();
