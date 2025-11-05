/**
 * Script to delete old power consumption collections
 * Run this ONLY after backup_old_power_system.cjs has been successfully executed
 */

const mongoose = require('mongoose');

async function deleteOldCollections() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect('mongodb://localhost:27017/autovolt');
    console.log('✓ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    // Collections to delete
    const collectionsToDelete = ['activitylogs', 'energyconsumptions'];
    
    // Check if collections exist
    const existingCollections = await db.listCollections().toArray();
    const existingNames = existingCollections.map(c => c.name);
    
    console.log('=== DELETING OLD POWER CONSUMPTION COLLECTIONS ===\n');
    
    for (const collectionName of collectionsToDelete) {
      if (existingNames.includes(collectionName)) {
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        
        console.log(`📦 Collection: ${collectionName}`);
        console.log(`   Documents: ${count}`);
        
        // Delete the collection
        await collection.drop();
        console.log(`   ✓ DELETED\n`);
      } else {
        console.log(`⚠️  Collection '${collectionName}' not found (already deleted?)\n`);
      }
    }
    
    console.log('=== CLEANUP COMPLETE ===\n');
    console.log('Old power consumption collections have been removed.');
    console.log('The new power system uses:');
    console.log('  - telemetry_events');
    console.log('  - device_consumption_ledgers');
    console.log('  - daily_aggregates');
    console.log('  - monthly_aggregates');
    console.log('  - cost_versions\n');
    
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deleteOldCollections();
