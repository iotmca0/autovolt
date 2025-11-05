/**
 * Quick script to create initial cost version
 * Run this to enable cost calculations in the new power system
 */

const mongoose = require('mongoose');
const CostVersion = require('../models/CostVersion');

async function createInitialCostVersion() {
  try {
    await mongoose.connect('mongodb://localhost:27017/autovolt');
    console.log('✓ Connected to MongoDB\n');

    // Check if cost version already exists
    const existing = await CostVersion.findOne({});
    if (existing) {
      console.log('⚠️  Cost version already exists:');
      console.log(`   Rate: ₹${existing.cost_per_kwh}/kWh`);
      console.log(`   Effective from: ${existing.effective_from}`);
      console.log(`   Classroom: ${existing.classroom || 'All (Global)'}`);
      await mongoose.disconnect();
      return;
    }

    // Create initial cost version
    const costVersion = await CostVersion.create({
      cost_per_kwh: 7.5, // ₹7.50 per kWh - adjust this to your actual rate
      effective_from: new Date('2025-11-01'),
      effective_until: null, // Open-ended
      classroom: null, // Global rate
      notes: 'Initial electricity rate for all classrooms',
      created_by: 'system'
    });

    console.log('✅ Created initial cost version:');
    console.log(`   ID: ${costVersion._id}`);
    console.log(`   Rate: ₹${costVersion.cost_per_kwh}/kWh`);
    console.log(`   Effective from: ${costVersion.effective_from}`);
    console.log(`   Classroom: ${costVersion.classroom || 'All (Global)'}\n`);

    console.log('✓ Cost version created successfully!');
    console.log('\nNext steps:');
    console.log('1. Update ESP32 firmware to send telemetry (see ESP32_FIRMWARE_UPDATE_GUIDE.md)');
    console.log('2. Wait for telemetry data to flow');
    console.log('3. Dashboard will show real power consumption values\n');

    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createInitialCostVersion();
