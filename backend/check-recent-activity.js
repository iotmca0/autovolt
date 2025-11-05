/**
 * Check recent switch activity to diagnose power tracking issues
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkRecentActivity() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt');
    console.log('✅ Connected to MongoDB\n');

    const ActivityLog = require('./models/ActivityLog');
    const Device = require('./models/Device');

    // Check recent activity (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivity = await ActivityLog.find({
      timestamp: { $gte: oneDayAgo }
    }).sort({ timestamp: -1 }).limit(20).lean();

    console.log(`📊 Recent Activity (last 24 hours): ${recentActivity.length} events\n`);

    if (recentActivity.length === 0) {
      console.log('⚠️  No recent switch activity found.');
      console.log('This means switches are not being toggled.\n');
    } else {
      console.log('Recent Switch Operations:\n');
      recentActivity.forEach((log, i) => {
        const time = new Date(log.timestamp).toLocaleString();
        console.log(`${i + 1}. ${time}`);
        console.log(`   Device: ${log.deviceName || log.deviceId}`);
        console.log(`   Switch: ${log.switchName || log.switchId}`);
        console.log(`   Action: ${log.action} → ${log.newState ? 'ON' : 'OFF'}`);
        console.log(`   User: ${log.userName || 'Unknown'}`);
        console.log(`   Triggered by: ${log.triggeredBy || 'manual'}\n`);
      });
    }

    // Check device status
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    const allDevices = await Device.find({ type: 'esp32' }).lean();
    console.log(`🔌 ESP32 Devices: ${allDevices.length} total\n`);

    if (allDevices.length === 0) {
      console.log('❌ NO ESP32 DEVICES FOUND IN DATABASE!');
      console.log('This is why power tracking shows 0.');
      console.log('\nPossible reasons:');
      console.log('1. Devices not registered yet');
      console.log('2. Wrong database connection');
      console.log('3. Devices deleted accidentally\n');
    } else {
      const onlineDevices = allDevices.filter(d => d.status === 'online');
      const offlineDevices = allDevices.filter(d => d.status !== 'online');

      console.log(`✅ Online: ${onlineDevices.length}`);
      console.log(`⚠️  Offline: ${offlineDevices.length}\n`);

      if (onlineDevices.length > 0) {
        console.log('Online Devices:');
        onlineDevices.forEach(d => {
          console.log(`  - ${d.name} (${d.macAddress}): ${d.switches?.length || 0} switches`);
        });
        console.log();
      }

      if (offlineDevices.length > 0) {
        console.log('Offline Devices:');
        offlineDevices.forEach(d => {
          console.log(`  - ${d.name} (${d.macAddress}): ${d.switches?.length || 0} switches`);
        });
        console.log();
      }
    }

    // Check power tracker logic
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔍 Power Tracking Requirements:\n');
    console.log('1. ✅ Power tracker code updated (saves to DeviceConsumptionLedger)');
    console.log('2. ✅ Database models created (PowerSettings, DailyAggregate)');
    console.log('3. ✅ Aggregation service implemented');
    
    if (allDevices.length === 0) {
      console.log('4. ❌ ESP32 devices registered - MISSING!');
    } else if (allDevices.filter(d => d.status === 'online').length === 0) {
      console.log('4. ⚠️  ESP32 devices ONLINE - ALL OFFLINE!');
    } else {
      console.log('4. ✅ ESP32 devices online');
    }
    
    if (recentActivity.length === 0) {
      console.log('5. ❌ Switches being toggled - NO ACTIVITY!');
    } else {
      console.log('5. ✅ Switches being toggled');
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🎯 ROOT CAUSE:\n');
    
    if (allDevices.length === 0) {
      console.log('❌ NO DEVICES REGISTERED');
      console.log('\nSolution:');
      console.log('1. Register ESP32 devices in the dashboard');
      console.log('2. Ensure devices are connected to MQTT broker');
      console.log('3. Check if devices appear in Device Management\n');
    } else if (allDevices.filter(d => d.status === 'online').length === 0) {
      console.log('❌ ALL DEVICES OFFLINE');
      console.log('\nSolution:');
      console.log('1. Power on ESP32 devices');
      console.log('2. Check WiFi connection');
      console.log('3. Verify MQTT broker is running');
      console.log('4. Check device heartbeats in server logs\n');
      console.log('Backend logs should show:');
      console.log('  [MQTT] Device connected: <device_name>');
      console.log('  [MQTT] Heartbeat received from <device_name>\n');
    } else if (recentActivity.length === 0) {
      console.log('❌ NO SWITCH ACTIVITY');
      console.log('\nSolution:');
      console.log('1. Go to Dashboard');
      console.log('2. Toggle any switch ON → OFF');
      console.log('3. Check if ActivityLog is created\n');
    } else {
      console.log('⚠️  DEVICES OFFLINE DURING SWITCH OPERATIONS');
      console.log('\nThe power tracker has this code:');
      console.log('```javascript');
      console.log('const device = await Device.findById(deviceId);');
      console.log('if (!device || device.status !== "online") {');
      console.log('  logger.warn("Device is offline. Not tracking.");');
      console.log('  return; // SKIPS TRACKING');
      console.log('}');
      console.log('```');
      console.log('\nThis prevents tracking when devices are offline.\n');
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkRecentActivity();
