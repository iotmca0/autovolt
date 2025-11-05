#!/usr/bin/env node
/**
 * Migrate ActivityLog to New Power System
 * 
 * Converts existing ActivityLog entries to TelemetryEvent format
 * so power consumption shows in dashboard immediately
 */

const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt';

async function migrate() {
  console.log('🔄 Migrating ActivityLog to TelemetryEvent...\n');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const ActivityLog = require('../models/ActivityLog');
    const Device = require('../models/Device');
    const telemetryIngestionService = require('../services/telemetryIngestionService');
    
    // Initialize services
    await telemetryIngestionService.initialize();
    
    // Get all activity logs (switch ON/OFF events)
    const logs = await ActivityLog.find({
      action: { $in: ['on', 'off'] }
    }).sort({ timestamp: 1 }).lean();
    
    console.log(`📊 Found ${logs.length} activity logs\n`);
    
    if (logs.length === 0) {
      console.log('❌ No activity logs to migrate');
      process.exit(0);
    }
    
    let migrated = 0;
    let errors = 0;
    
    for (const log of logs) {
      try {
        // Get device info
        const device = await Device.findById(log.deviceId).lean();
        if (!device) {
          console.log(`⚠️  Device not found for log ${log._id}`);
          continue;
        }
        
        // Get switch info
        const switchInfo = device.switches.find(s => s._id.toString() === log.switchId.toString());
        if (!switchInfo) {
          console.log(`⚠️  Switch not found for log ${log._id}`);
          continue;
        }
        
        // Build switch state map
        const switchStateMap = {};
        for (const sw of device.switches) {
          switchStateMap[`relay${sw.gpio}`] = sw.state;
        }
        // Update the changed switch
        switchStateMap[`relay${switchInfo.gpio}`] = (log.action === 'on');
        
        // Ingest as telemetry event
        await telemetryIngestionService.ingestTelemetry({
          esp32_name: device.name,
          classroom: device.classroom,
          device_id: device.macAddress.replace(/:/g, '').toLowerCase(),
          timestamp: new Date(log.timestamp),
          power_w: undefined,
          energy_wh_total: undefined,
          switch_state: switchStateMap,
          status: 'online',
          mqtt_topic: 'migration/activitylog',
          mqtt_payload: {
            type: 'switch_event',
            gpio: switchInfo.gpio,
            state: (log.action === 'on'),
            source: log.triggeredBy || 'user',
            power_rating: switchInfo.powerRating || 0,
            migrated_from: 'activitylog'
          }
        });
        
        migrated++;
        if (migrated % 10 === 0) {
          process.stdout.write(`\r✅ Migrated: ${migrated}/${logs.length}`);
        }
      } catch (error) {
        errors++;
        console.error(`\n❌ Error migrating log ${log._id}:`, error.message);
      }
    }
    
    console.log(`\n\n✅ Migration complete!`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`\n⏳ Processing telemetry events...`);
    console.log(`   Wait 30 seconds for backend services to process`);
    console.log(`   Then check dashboard\n`);
    
    // Trigger immediate processing
    const ledgerGenerationService = require('../services/ledgerGenerationService');
    const aggregationService = require('../services/aggregationService');
    
    console.log('🔄 Processing events into ledger...');
    await ledgerGenerationService.processUnprocessedEvents(1000);
    
    console.log('🔄 Aggregating into daily/monthly totals...');
    await aggregationService.aggregateAll();
    
    console.log('\n✅ All done! Check dashboard now.\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
