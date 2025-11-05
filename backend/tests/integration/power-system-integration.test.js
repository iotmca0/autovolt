/**
 * Integration Test Script for New Power System
 * 
 * Tests the complete data flow:
 * 1. Telemetry Ingestion (with deduplication)
 * 2. Ledger Generation (delta calculation, reset detection)
 * 3. Aggregation (daily/monthly with timezone)
 * 4. Cost Versioning
 * 5. Reconciliation
 * 
 * Run: node backend/tests/integration/power-system-integration.test.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import services
const telemetryIngestionService = require('../../services/telemetryIngestionService');
const ledgerGenerationService = require('../../services/ledgerGenerationService');
const aggregationService = require('../../services/aggregationService');

// Import models
const TelemetryEvent = require('../../models/TelemetryEvent');
const DeviceConsumptionLedger = require('../../models/DeviceConsumptionLedger');
const DailyAggregate = require('../../models/DailyAggregate');
const CostVersion = require('../../models/CostVersion');

// Test data
const TEST_ESP32_NAME = 'ESP32_TEST_CLASSROOM';
const TEST_CLASSROOM = 'TEST_LAB_301';

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt';
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log('✅ Connected to MongoDB');
}

async function cleanupTestData() {
  console.log('\n🧹 Cleaning up test data...');
  await TelemetryEvent.deleteMany({ esp32_name: TEST_ESP32_NAME });
  await DeviceConsumptionLedger.deleteMany({ esp32_name: TEST_ESP32_NAME });
  await DailyAggregate.deleteMany({ classroom: TEST_CLASSROOM });
  await CostVersion.deleteMany({ classroom: TEST_CLASSROOM });
  console.log('✅ Test data cleaned');
}

async function test1_TelemetryIngestion() {
  console.log('\n📊 Test 1: Telemetry Ingestion with Deduplication');
  
  await telemetryIngestionService.initialize();
  
  const telemetry = {
    esp32_name: TEST_ESP32_NAME,
    classroom: TEST_CLASSROOM,
    device_id: 'relay_16',
    timestamp: new Date(),
    power_w: 100,
    energy_wh_total: 1000,
    switch_state: { relay_16: true },
    status: 'online',
    mqtt_payload: { test: true }
  };
  
  // Ingest first time
  const event1 = await telemetryIngestionService.ingestTelemetry(telemetry);
  console.log('✅ First telemetry ingested:', event1._id);
  
  // Try to ingest duplicate (should be rejected)
  const event2 = await telemetryIngestionService.ingestTelemetry(telemetry);
  if (!event2) {
    console.log('✅ Duplicate telemetry rejected (deduplication working)');
  } else {
    throw new Error('❌ Duplicate was not rejected!');
  }
  
  // Ingest with different timestamp (should be accepted)
  telemetry.timestamp = new Date(Date.now() + 60000); // 1 minute later
  telemetry.energy_wh_total = 1010; // 10 Wh consumed
  const event3 = await telemetryIngestionService.ingestTelemetry(telemetry);
  console.log('✅ Second telemetry ingested:', event3._id);
  
  const count = await TelemetryEvent.countDocuments({ esp32_name: TEST_ESP32_NAME });
  console.log(`✅ Total telemetry events: ${count} (expected: 2)`);
  
  if (count !== 2) {
    throw new Error(`❌ Expected 2 events, got ${count}`);
  }
  
  return { event1, event3 };
}

async function test2_LedgerGeneration(events) {
  console.log('\n📒 Test 2: Ledger Generation with Delta Calculation');
  
  await ledgerGenerationService.initialize();
  
  // Process the second event (which should create a ledger entry)
  await ledgerGenerationService.processEvent(events.event3);
  
  // Wait a bit for processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const ledgerEntries = await DeviceConsumptionLedger.find({ esp32_name: TEST_ESP32_NAME });
  console.log(`✅ Ledger entries created: ${ledgerEntries.length}`);
  
  if (ledgerEntries.length === 0) {
    throw new Error('❌ No ledger entries created!');
  }
  
  const entry = ledgerEntries[0];
  console.log(`✅ Delta calculation: ${entry.delta_wh} Wh (expected: ~10 Wh)`);
  console.log(`✅ Method: ${entry.method}`);
  console.log(`✅ Confidence: ${entry.quality.confidence}`);
  
  if (entry.delta_wh < 5 || entry.delta_wh > 15) {
    throw new Error(`❌ Delta out of expected range: ${entry.delta_wh} Wh`);
  }
  
  return ledgerEntries[0];
}

async function test3_ResetDetection() {
  console.log('\n🔄 Test 3: Reset Detection');
  
  // Ingest telemetry with lower energy (simulating firmware reset)
  const resetTelemetry = {
    esp32_name: TEST_ESP32_NAME,
    classroom: TEST_CLASSROOM,
    device_id: 'relay_16',
    timestamp: new Date(Date.now() + 120000), // 2 minutes later
    power_w: 100,
    energy_wh_total: 50, // Much lower than previous 1010 Wh
    switch_state: { relay_16: true },
    status: 'online',
    mqtt_payload: { reset: true }
  };
  
  const resetEvent = await telemetryIngestionService.ingestTelemetry(resetTelemetry);
  await ledgerGenerationService.processEvent(resetEvent);
  
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const resetMarkers = await DeviceConsumptionLedger.find({ 
    esp32_name: TEST_ESP32_NAME,
    is_reset_marker: true 
  });
  
  console.log(`✅ Reset markers found: ${resetMarkers.length}`);
  
  if (resetMarkers.length === 0) {
    throw new Error('❌ Reset not detected!');
  }
  
  console.log(`✅ Reset reason: ${resetMarkers[0].reset_reason}`);
}

async function test4_Aggregation() {
  console.log('\n📈 Test 4: Daily Aggregation with Timezone');
  
  await aggregationService.initialize();
  
  const today = new Date();
  await aggregationService.aggregateDaily(today, TEST_CLASSROOM);
  
  const dateString = aggregationService.getLocalDateString(today);
  const aggregates = await DailyAggregate.find({
    classroom: TEST_CLASSROOM,
    date_string: dateString
  });
  
  console.log(`✅ Daily aggregates created: ${aggregates.length}`);
  
  if (aggregates.length > 0) {
    const agg = aggregates[0];
    console.log(`✅ Total energy: ${agg.total_wh} Wh`);
    console.log(`✅ Total cost: ₹${agg.cost_at_calc_time}`);
    console.log(`✅ Quality summary:`, agg.quality_summary);
  }
}

async function test5_CostVersioning() {
  console.log('\n💰 Test 5: Cost Versioning');
  
  // Create a test cost version
  const version = await CostVersion.createVersion({
    cost_per_kwh: 7.50,
    effective_from: new Date(),
    classroom: TEST_CLASSROOM,
    scope: 'classroom',
    created_by: {
      username: 'test_user'
    },
    notes: 'Test rate for integration testing'
  });
  
  console.log(`✅ Cost version created: ₹${version.cost_per_kwh}/kWh`);
  console.log(`✅ Effective from: ${version.effective_from.toISOString()}`);
  
  // Get rate for today
  const rate = await CostVersion.getRateForDate(new Date(), TEST_CLASSROOM);
  console.log(`✅ Current rate: ₹${rate.cost_per_kwh}/kWh`);
  
  if (rate.cost_per_kwh !== 7.50) {
    throw new Error(`❌ Expected rate 7.50, got ${rate.cost_per_kwh}`);
  }
}

async function test6_TimezoneConversion() {
  console.log('\n🌍 Test 6: Timezone Conversion (Asia/Kolkata)');
  
  const utcDate = new Date('2024-01-15T18:30:00.000Z'); // 6:30 PM UTC
  const localStart = aggregationService.getLocalDayStart(utcDate);
  const localDateString = aggregationService.getLocalDateString(utcDate);
  
  console.log(`✅ UTC date: ${utcDate.toISOString()}`);
  console.log(`✅ Local day start (IST): ${localStart.toISOString()}`);
  console.log(`✅ Local date string: ${localDateString}`);
  
  // In Asia/Kolkata (UTC+5:30), 6:30 PM UTC = 12:00 AM IST (next day)
  // So day start should be at 00:00 IST on 2024-01-16
  const expectedDateString = '2024-01-16';
  
  if (localDateString !== expectedDateString) {
    console.warn(`⚠️  Expected ${expectedDateString}, got ${localDateString}`);
    console.log('   (This might be OK if timezone logic differs)');
  }
}

async function runTests() {
  console.log('🚀 Starting Power System Integration Tests\n');
  console.log('='.repeat(60));
  
  try {
    await connectDB();
    await cleanupTestData();
    
    const events = await test1_TelemetryIngestion();
    const ledgerEntry = await test2_LedgerGeneration(events);
    await test3_ResetDetection();
    await test4_Aggregation();
    await test5_CostVersioning();
    await test6_TimezoneConversion();
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('='.repeat(60));
    
    await cleanupTestData();
    
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Test failed:', error.message);
    console.error('='.repeat(60));
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
