# Power Consumption Analytics - Complete Fix Guide

## Issues Identified

### 1. **Offline Device Consumption Not Persisting**
**Problem**: When a device goes offline, the consumption data tracked while it was online is not properly stored.
**Impact**: Lost consumption data, incorrect monthly totals

### 2. **Inconsistent Data Between Dashboard and Charts**
**Problem**: Dashboard cards show different values than analytics charts
**Root Cause**: Multiple calculation methods not synchronized

### 3. **Calendar View Shows Wrong Data**
**Problem**: Monthly calendar aggregation doesn't match daily totals
**Root Cause**: Timezone issues and aggregation logic

### 4. **Power Settings Changes Not Reflected**
**Problem**: Changing electricity rate doesn't update existing cost calculations
**Impact**: Historical cost data remains stale

## Fix Implementation

### Phase 1: Fix Offline Consumption Storage

#### File: `backend/services/powerConsumptionTracker.js`

**Line 287-360**: Update `handleDeviceOffline` function

```javascript
async handleDeviceOffline(deviceId, macAddress) {
  try {
    logger.info(`[PowerTracker] Device going offline: ${macAddress} - FINALIZING ALL CONSUMPTION`);
    
    const device = await Device.findById(deviceId).lean();
    if (!device) return;
    
    // Find all active switches for this device
    const deviceSwitches = Array.from(this.activeSwitches.entries())
      .filter(([_, data]) => data.deviceId.toString() === deviceId.toString());
    
    if (deviceSwitches.length === 0) {
      logger.debug(`[PowerTracker] No active switches for offline device`);
      return;
    }

    const offlineTime = new Date();
    let totalEnergyKwh = 0;
    let totalCost = 0;

    // Process each active switch - STORE CONSUMPTION BEFORE CLEARING
    for (const [switchId, trackingData] of deviceSwitches) {
      const runtimeMs = offlineTime - trackingData.startTime;
      const runtimeHours = runtimeMs / (1000 * 60 * 60);
      const energyKwh = (trackingData.powerWatts * runtimeHours) / 1000;
      const cost = energyKwh * this.electricityRate;
      
      totalEnergyKwh += energyKwh;
      totalCost += cost;

      // CRITICAL: Store consumption in EnergyConsumption collection
      await EnergyConsumption.incrementConsumption({
        deviceId: trackingData.deviceId,
        deviceName: trackingData.deviceName,
        macAddress: trackingData.macAddress,
        classroom: trackingData.classroom,
        location: trackingData.location,
        date: trackingData.startTime,
        switchType: trackingData.switchType,
        energyKwh,
        runtimeHours,
        cost,
        electricityRate: this.electricityRate,
        wasOnline: true // Was online when consumption happened
      });
      
      // Create activity log with OFFLINE context
      await this.createActivityLog({
        deviceId,
        deviceName: device.name,
        switchId,
        switchName: trackingData.switchName,
        action: 'offline_consumption_stored',
        triggeredBy: 'system',
        classroom: device.classroom,
        location: device.location,
        powerConsumption: trackingData.powerWatts,
        switchType: trackingData.switchType,
        macAddress,
        duration: runtimeMs / 1000,
        deviceStatus: { isOnline: false },
        context: {
          reason: 'device_offline',
          energyKwh,
          cost,
          runtimeHours,
          message: `Stored ${energyKwh.toFixed(4)} kWh consumed while online before disconnect`
        }
      });
      
      // Remove from active tracking
      this.activeSwitches.delete(switchId);
      
      logger.info(`[PowerTracker] ✅ STORED: ${trackingData.switchName} - ${energyKwh.toFixed(4)} kWh (₹${cost.toFixed(2)})`);
    }

    logger.info(`[PowerTracker] ✅ OFFLINE COMPLETE: ${device.name} - ${deviceSwitches.length} switches, Total: ${totalEnergyKwh.toFixed(4)} kWh (₹${totalCost.toFixed(2)})`);
  } catch (error) {
    logger.error('[PowerTracker] Error handling device offline:', error);
  }
}
```

### Phase 2: Fix Energy Summary Calculation

#### File: `backend/metricsService.js`

**Line 2556-2710**: Replace `getEnergySummary` function

```javascript
async function getEnergySummary() {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    
    const Device = require('./models/Device');
    const ActivityLog = require('./models/ActivityLog');
    const EnergyConsumption = require('./models/EnergyConsumption');
    
    // Load current electricity rate from settings
    const fs = require('fs').promises;
    const path = require('path');
    let electricityRate = 7.5; // Default
    
    try {
      const settingsPath = path.join(__dirname, 'data', 'powerSettings.json');
      const settingsData = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData);
      if (settings.electricityPrice) {
        electricityRate = settings.electricityPrice;
      }
    } catch (err) {
      console.warn('[EnergySummary] Using default electricity rate');
    }

    // Get all devices
    const devices = await Device.find({}).lean();
    
    let dailyConsumption = 0;
    let dailyRuntime = 0;
    let monthlyConsumption = 0;
    let monthlyRuntime = 0;
    const deviceBreakdown = [];

    // === METHOD 1: Calculate from ActivityLog (Primary Source) ===
    for (const device of devices) {
      // DAILY CONSUMPTION
      const todayPrecise = await calculatePreciseEnergyConsumption(
        device._id,
        todayStart,
        now
      );
      dailyConsumption += todayPrecise;

      // DAILY RUNTIME
      const todayActivities = await ActivityLog.find({
        deviceId: device._id,
        timestamp: { $gte: todayStart, $lte: now },
        action: { $in: ['on', 'off', 'switch_on', 'switch_off', 'manual_on', 'manual_off'] }
      }).sort({ timestamp: 1 }).lean();

      let deviceDailyRuntime = 0;
      let onTime = null;
      for (const activity of todayActivities) {
        if (['on', 'switch_on', 'manual_on'].includes(activity.action)) {
          onTime = activity.timestamp;
        } else if (['off', 'switch_off', 'manual_off'].includes(activity.action) && onTime) {
          deviceDailyRuntime += (activity.timestamp - onTime) / (1000 * 60 * 60);
          onTime = null;
        }
      }
      if (onTime && device.status === 'online') {
        deviceDailyRuntime += (now - onTime) / (1000 * 60 * 60);
      }
      dailyRuntime += deviceDailyRuntime;

      // MONTHLY CONSUMPTION
      const monthPrecise = await calculatePreciseEnergyConsumption(
        device._id,
        monthStart,
        now
      );
      monthlyConsumption += monthPrecise;

      // MONTHLY RUNTIME
      const monthActivities = await ActivityLog.find({
        deviceId: device._id,
        timestamp: { $gte: monthStart, $lte: now },
        action: { $in: ['on', 'off', 'switch_on', 'switch_off', 'manual_on', 'manual_off'] }
      }).sort({ timestamp: 1 }).lean();

      let deviceMonthlyRuntime = 0;
      onTime = null;
      for (const activity of monthActivities) {
        if (['on', 'switch_on', 'manual_on'].includes(activity.action)) {
          onTime = activity.timestamp;
        } else if (['off', 'switch_off', 'manual_off'].includes(activity.action) && onTime) {
          deviceMonthlyRuntime += (activity.timestamp - onTime) / (1000 * 60 * 60);
          onTime = null;
        }
      }
      if (onTime && device.status === 'online') {
        deviceMonthlyRuntime += (now - onTime) / (1000 * 60 * 60);
      }
      monthlyRuntime += deviceMonthlyRuntime;
      
      deviceBreakdown.push({
        deviceId: device._id.toString(),
        deviceName: device.name,
        classroom: device.classroom || 'unassigned',
        status: device.status,
        daily: {
          consumption: parseFloat(todayPrecise.toFixed(3)),
          cost: parseFloat((todayPrecise * electricityRate).toFixed(2)),
          runtime: parseFloat(deviceDailyRuntime.toFixed(2))
        },
        monthly: {
          consumption: parseFloat(monthPrecise.toFixed(3)),
          cost: parseFloat((monthPrecise * electricityRate).toFixed(2)),
          runtime: parseFloat(deviceMonthlyRuntime.toFixed(2))
        }
      });
    }

    // === METHOD 2: Check EnergyConsumption for offline-stored data ===
    const todayStored = await EnergyConsumption.aggregate([
      { $match: { date: { $gte: todayStart, $lte: now } } },
      { $group: { _id: null, totalEnergy: { $sum: '$totalEnergyKwh' }, totalRuntime: { $sum: '$totalRuntimeHours' } } }
    ]);

    const monthStored = await EnergyConsumption.aggregate([
      { $match: { date: { $gte: monthStart, $lte: now } } },
      { $group: { _id: null, totalEnergy: { $sum: '$totalEnergyKwh' }, totalRuntime: { $sum: '$totalRuntimeHours' } } }
    ]);

    const todayStoredEnergy = todayStored.length > 0 ? todayStored[0].totalEnergy : 0;
    const monthStoredEnergy = monthStored.length > 0 ? monthStored[0].totalEnergy : 0;

    // Use MAX to avoid double-counting (ActivityLog is primary, EnergyConsumption is backup)
    const finalDailyConsumption = Math.max(dailyConsumption, todayStoredEnergy);
    const finalMonthlyConsumption = Math.max(monthlyConsumption, monthStoredEnergy);

    console.log(`[EnergySummary] ActivityLog: Daily=${dailyConsumption.toFixed(3)} kWh, Monthly=${monthlyConsumption.toFixed(3)} kWh`);
    console.log(`[EnergySummary] Stored: Daily=${todayStoredEnergy.toFixed(3)} kWh, Monthly=${monthStoredEnergy.toFixed(3)} kWh`);
    console.log(`[EnergySummary] FINAL: Daily=${finalDailyConsumption.toFixed(3)} kWh, Monthly=${finalMonthlyConsumption.toFixed(3)} kWh`);

    return {
      daily: {
        consumption: parseFloat(finalDailyConsumption.toFixed(3)),
        cost: parseFloat((finalDailyConsumption * electricityRate).toFixed(2)),
        runtime: parseFloat(dailyRuntime.toFixed(2)),
        devices: devices.length,
        onlineDevices: devices.filter(d => d.status === 'online').length
      },
      monthly: {
        consumption: parseFloat(finalMonthlyConsumption.toFixed(3)),
        cost: parseFloat((finalMonthlyConsumption * electricityRate).toFixed(2)),
        runtime: parseFloat(monthlyRuntime.toFixed(2)),
        devices: devices.length,
        onlineDevices: devices.filter(d => d.status === 'online').length
      },
      deviceBreakdown,
      electricityRate,
      timestamp: now
    };
  } catch (error) {
    console.error('[EnergySummary] Error:', error);
    return {
      daily: { consumption: 0, cost: 0, runtime: 0, devices: 0, onlineDevices: 0 },
      monthly: { consumption: 0, cost: 0, runtime: 0, devices: 0, onlineDevices: 0 },
      deviceBreakdown: [],
      electricityRate: 7.5,
      timestamp: new Date()
    };
  }
}
```

### Phase 3: Fix Chart Data Calculation

#### File: `backend/metricsService.js`

**Line 2516-2550**: Update `getEnergyData` function

Add electricity rate loading at the start:

```javascript
async function getEnergyData(timeframe = '24h') {
  try {
    // Load current electricity rate
    const fs = require('fs').promises;
    const path = require('path');
    let electricityRate = 7.5;
    
    try {
      const settingsPath = path.join(__dirname, 'data', 'powerSettings.json');
      const settingsData = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData);
      if (settings.electricityPrice) {
        electricityRate = settings.electricityPrice;
      }
    } catch (err) {
      console.warn('[EnergyData] Using default electricity rate');
    }

    // ... rest of function
    // Update cost calculations to use loaded electricityRate
```

### Phase 4: Fix Calendar View

#### File: `backend/metricsService.js`

**Line 2712-2830**: Update `getEnergyCalendar` function

Ensure timezone handling and proper aggregation:

```javascript
async function getEnergyCalendar(year, month) {
  try {
    // Load current electricity rate
    const fs = require('fs').promises;
    const path = require('path');
    let electricityRate = 7.5;
    
    try {
      const settingsPath = path.join(__dirname, 'data', 'powerSettings.json');
      const settingsData = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(settingsData);
      if (settings.electricityPrice) {
        electricityRate = settings.electricityRate;
      }
    } catch (err) {
      console.warn('[EnergyCalendar] Using default electricity rate');
    }

    // Use local timezone for date boundaries
    const startDate = new Date(year, month - 1, 1, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const daysInMonth = new Date(year, month, 0).getDate();

    const Device = require('./models/Device');
    const devices = await Device.find({}).lean();

    const dailyData = [];

    // Calculate consumption for each day
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStart = new Date(year, month - 1, day, 0, 0, 0);
      const dayEnd = new Date(year, month - 1, day, 23, 59, 59);

      let dayConsumption = 0;
      let dayRuntime = 0;

      for (const device of devices) {
        const consumption = await calculatePreciseEnergyConsumption(
          device._id,
          dayStart,
          dayEnd
        );
        dayConsumption += consumption;

        // Calculate runtime for this day
        const ActivityLog = require('./models/ActivityLog');
        const activities = await ActivityLog.find({
          deviceId: device._id,
          timestamp: { $gte: dayStart, $lte: dayEnd },
          action: { $in: ['on', 'off', 'switch_on', 'switch_off', 'manual_on', 'manual_off'] }
        }).sort({ timestamp: 1 }).lean();

        let deviceRuntime = 0;
        let onTime = null;
        for (const activity of activities) {
          if (['on', 'switch_on', 'manual_on'].includes(activity.action)) {
            onTime = activity.timestamp;
          } else if (['off', 'switch_off', 'manual_off'].includes(activity.action) && onTime) {
            deviceRuntime += (activity.timestamp - onTime) / (1000 * 60 * 60);
            onTime = null;
          }
        }
        dayRuntime += deviceRuntime;
      }

      const cost = dayConsumption * electricityRate;
      
      dailyData.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        consumption: parseFloat(dayConsumption.toFixed(3)),
        cost: parseFloat(cost.toFixed(2)),
        runtime: parseFloat(dayRuntime.toFixed(2)),
        category: cost < 50 ? 'low' : cost < 100 ? 'medium' : 'high'
      });
    }

    const totalConsumption = dailyData.reduce((sum, d) => sum + d.consumption, 0);
    const totalCost = dailyData.reduce((sum, d) => sum + d.cost, 0);

    return {
      month: `${year}-${String(month).padStart(2, '0')}`,
      year,
      monthNumber: month,
      days: dailyData,
      totalConsumption: parseFloat(totalConsumption.toFixed(3)),
      totalCost: parseFloat(totalCost.toFixed(2)),
      electricityRate
    };
  } catch (error) {
    console.error('[EnergyCalendar] Error:', error);
    return {
      month: `${year}-${String(month).padStart(2, '0')}`,
      year,
      monthNumber: month,
      days: [],
      totalConsumption: 0,
      totalCost: 0,
      electricityRate: 7.5
    };
  }
}
```

## Testing Checklist

### 1. Offline Consumption Test
```bash
# Steps:
1. Turn on switches on a device
2. Wait 5 minutes
3. Disconnect device (unplug/turn off ESP32)
4. Check Dashboard - consumption should still show
5. Check Analytics charts - data should be there
6. Reconnect device - new data should ADD to existing
```

### 2. Dashboard vs Charts Consistency Test
```bash
# Steps:
1. Note daily consumption on dashboard card
2. Open Analytics tab
3. Check 24h chart total
4. Both should match within 0.01 kWh
```

### 3. Calendar View Test
```bash
# Steps:
1. Open Energy Monitoring
2. Select Calendar view
3. Click on today's date
4. Compare with dashboard daily total
5. They should match
```

### 4. Power Settings Update Test
```bash
# Steps:
1. Note current monthly cost
2. Change electricity rate (e.g., from 7.5 to 8.0)
3. Refresh dashboard
4. Cost should update proportionally
5. Historical kWh should stay same, only cost changes
```

## Database Queries for Verification

### Check Today's Consumption
```javascript
// In MongoDB
db.activityLogs.aggregate([
  {
    $match: {
      timestamp: { 
        $gte: new Date(new Date().setHours(0,0,0,0)),
        $lte: new Date()
      },
      action: { $in: ['on', 'off', 'manual_on', 'manual_off'] }
    }
  },
  {
    $group: {
      _id: '$deviceId',
      events: { $sum: 1 }
    }
  }
])
```

### Check Stored Offline Consumption
```javascript
db.energyConsumptions.find({
  date: { $gte: new Date(new Date().setHours(0,0,0,0)) },
  wasOnline: false
}).sort({ date: -1 })
```

## Performance Optimization

### Add Indexes
```javascript
// In MongoDB shell
db.activityLogs.createIndex({ deviceId: 1, timestamp: -1 })
db.activityLogs.createIndex({ timestamp: -1, action: 1 })
db.energyConsumptions.createIndex({ deviceId: 1, date: -1 })
db.energyConsumptions.createIndex({ date: -1, wasOnline: 1 })
```

## Rollback Plan

If issues occur after implementing fixes:

1. **Backup Database**: `mongodump --db autovolt --out /backup`
2. **Git Revert**: `git revert HEAD`
3. **Restore**: `mongorestore --db autovolt /backup/autovolt`

## Success Criteria

- ✅ Offline devices consumption persists in database
- ✅ Dashboard cards match analytics charts (±0.01 kWh)
- ✅ Calendar daily totals match dashboard daily total
- ✅ Power rate changes update costs immediately
- ✅ Monthly totals accumulate correctly day-by-day
- ✅ No double-counting of consumption
- ✅ All charts use same data source

## Monitoring

Add logging to track consumption calculations:

```javascript
logger.info('[Consumption] Daily=${daily} kWh, Monthly=${monthly} kWh, Source=${source}');
```

Check logs daily for inconsistencies.
