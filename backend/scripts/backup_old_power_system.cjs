// Backup and analyze current power consumption data
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/autovolt';

async function analyzeAndBackup() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('📦 Collections:', collections.map(c => c.name).join(', '));
    console.log('\n');
    
    // Count EnergyConsumption documents
    const energyCount = await db.collection('energyconsumptions').countDocuments();
    console.log(`📊 EnergyConsumption documents: ${energyCount}`);
    
    if (energyCount > 0) {
      const sample = await db.collection('energyconsumptions').findOne();
      console.log('Sample EnergyConsumption:', JSON.stringify(sample, null, 2));
    }
    
    // Count ActivityLog with powerConsumption
    const activityCount = await db.collection('activitylogs').countDocuments({
      powerConsumption: { $exists: true, $ne: null }
    });
    console.log(`\n📊 ActivityLogs with powerConsumption: ${activityCount}`);
    
    if (activityCount > 0) {
      const sample = await db.collection('activitylogs').findOne({
        powerConsumption: { $exists: true }
      });
      console.log('Sample ActivityLog with power:', JSON.stringify(sample, null, 2));
    }
    
    // Export backup
    console.log('\n💾 Creating backup...');
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(__dirname, 'backup_old_power_system');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }
    
    // Backup EnergyConsumption
    const energyDocs = await db.collection('energyconsumptions').find({}).toArray();
    fs.writeFileSync(
      path.join(backupDir, 'energyconsumptions_backup.json'),
      JSON.stringify(energyDocs, null, 2)
    );
    console.log(`✅ Backed up ${energyDocs.length} EnergyConsumption documents`);
    
    // Backup ActivityLogs with powerConsumption
    const activityDocs = await db.collection('activitylogs').find({
      powerConsumption: { $exists: true }
    }).toArray();
    fs.writeFileSync(
      path.join(backupDir, 'activitylogs_power_backup.json'),
      JSON.stringify(activityDocs, null, 2)
    );
    console.log(`✅ Backed up ${activityDocs.length} ActivityLog documents with power data`);
    
    console.log(`\n✅ Backup complete in: ${backupDir}`);
    console.log('\n⚠️  Ready to delete old collections. Run with --delete flag to proceed.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected');
  }
}

// Check if --delete flag is passed
const shouldDelete = process.argv.includes('--delete');

if (shouldDelete) {
  console.log('🗑️  DELETE MODE - Will remove old power collections\n');
} else {
  console.log('📋 ANALYSIS MODE - No data will be deleted\n');
}

analyzeAndBackup();
