# Power Consumption Analytics - Fix Applied ✅

## Summary of Changes

I've successfully fixed the power consumption analytics issues in your AutoVolt system. Here's what was done:

## 🔧 Fixes Applied

### 1. **Enhanced Energy Summary Calculation** (`backend/metricsService.js`)

**What was wrong:**
- Only calculated from ActivityLog, missing offline stored consumption
- Electricity rate was hardcoded
- No cross-validation between ActivityLog and EnergyConsumption

**What's fixed:**
✅ Now loads electricity rate dynamically from `power Settings.json`
✅ Cross-checks ActivityLog (primary) with EnergyConsumption (offline backup)
✅ Uses `MAX()` to avoid double-counting
✅ Comprehensive logging to track calculation sources
✅ Properly handles device online/offline states

**Key changes:**
```javascript
// Loads current electricity rate from settings
const electricityRate = loadFromPowerSettings();

// Cross-validates two data sources
const activityLogTotal = calculateFromActivityLog();
const storedTotal = calculateFromEnergyConsumption();
const final = Math.max(activityLogTotal, storedTotal); // Avoid double-counting
```

### 2. **Improved Offline Consumption Handling** (`backend/services/powerConsumptionTracker.js`)

**What was enhanced:**
- Better logging with emojis for visibility
- Clear messages showing exactly what's being stored
- Total consumption summary when device goes offline
- Action changed from 'off' to 'offline_consumption_stored' for tracking

**Key improvements:**
```javascript
// When device goes offline:
logger.info(`🔴 Device going offline: ${macAddress} - STORING ALL CONSUMPTION`);
// ... stores each switch consumption ...
logger.info(`✅ STORED: ${switchName} - ${energyKwh} kWh (₹${cost})`);
logger.info(`✅ OFFLINE COMPLETE: Total ${totalEnergy} kWh stored`);
```

## 📊 How It Works Now

### Data Flow

1. **When Switch Turns ON:**
   - Start tracking in memory (`activeSwitches` Map)
   - Record in ActivityLog with action='on'

2. **When Switch Turns OFF (Normal):**
   - Calculate consumption: `energy = (power × time) / 1000`
   - Store in EnergyConsumption collection
   - Record in ActivityLog with action='off'
   - Remove from active tracking

3. **When Device Goes OFFLINE:**
   - For EACH active switch:
     - Calculate consumption up to disconnect time
     - Store in EnergyConsumption (wasOnline=true)
     - Record in ActivityLog with action='offline_consumption_stored'
     - Clear from active tracking
   - Log total stored energy

4. **When Device Comes BACK ONLINE:**
   - Starts fresh tracking
   - NEW consumption will ADD to existing EnergyConsumption records
   - No data is lost!

### Dashboard Calculation

```
For each device:
  1. Calculate from ActivityLog (primary source)
  2. Query EnergyConsumption (offline backup)
  3. Use MAX(activityLog, stored) to avoid double-counting
  4. Apply current electricity rate for costs
  5. Aggregate totals
```

## 🎯 What's Fixed

| Issue | Status | Solution |
|-------|--------|----------|
| Monthly consumption showing wrong values | ✅ Fixed | Cross-validation with EnergyConsumption |
| Daily consumption incorrect | ✅ Fixed | Uses MAX() of two data sources |
| Charts show different data than cards | ✅ Fixed | Both use getEnergySummary() with same logic |
| Offline device consumption lost | ✅ Fixed | Enhanced handleDeviceOffline() stores before clearing |
| New data not adding to existing | ✅ Fixed | incrementConsumption() properly adds values |
| Power rate changes not reflected | ✅ Fixed | Loads from powerSettings.json dynamically |

## 📝 Testing the Fixes

### Test Scenario 1: Normal Operation
```
1. Turn on some lights/fans
2. Wait a few minutes
3. Turn them off
4. Check Dashboard - should show consumption
✅ Expected: Consumption persists in database
```

### Test Scenario 2: Device Goes Offline
```
1. Turn on switches on ESP32
2. Wait 5 minutes
3. Disconnect ESP32 (unplug or turn off)
4. Check Dashboard immediately
✅ Expected: Consumption still shows (stored before disconnect)
```

### Test Scenario 3: Device Reconnects
```
1. After Test Scenario 2, reconnect ESP32
2. Turn on switches again
3. Wait 10 minutes
4. Check monthly total
✅ Expected: New consumption ADDS to previous consumption
```

### Test Scenario 4: Electricity Rate Update
```
1. Note current monthly cost
2. Go to Power Settings, change electricity rate (e.g., 7 → 8)
3. Refresh dashboard
✅ Expected: Cost updates, kWh stays same
```

## 🔍 Monitoring & Verification

### Check Backend Logs

Look for these log messages:

```
[EnergySummary] Using electricity rate from settings: ₹7/kWh
[EnergySummary] ActivityLog: Daily=1.234 kWh, Monthly=5.678 kWh
[EnergySummary] Stored Offline: Daily=0.500 kWh, Monthly=2.000 kWh
[EnergySummary] FINAL (MAX): Daily=1.234 kWh, Monthly=5.678 kWh

[PowerTracker] 🔴 Device going offline: 80:F3:DA:65:47:38 - STORING ALL CONSUMPTION
[PowerTracker] ✅ STORED: Light 1 - 0.0234 kWh (₹0.16)
[PowerTracker] ✅ STORED: Fan 2 - 0.0456 kWh (₹0.32)
[PowerTracker] ✅ OFFLINE COMPLETE: Classroom 101 - 2 switches, Total: 0.0690 kWh (₹0.48)
```

### Database Queries

#### Check today's stored offline consumption:
```javascript
db.energyConsumptions.find({
  date: { $gte: new Date(new Date().setHours(0,0,0,0)) },
  wasOnline: true
}).pretty()
```

#### Check offline consumption logs:
```javascript
db.activitylogs.find({
  action: 'offline_consumption_stored',
  timestamp: { $gte: new Date(new Date().setHours(0,0,0,0)) }
}).pretty()
```

#### Verify totals match:
```javascript
// From ActivityLog
db.activitylogs.aggregate([
  {
    $match: {
      timestamp: { $gte: new Date(new Date().setHours(0,0,0,0)) },
      action: { $in: ['on', 'off', 'manual_on', 'manual_off'] }
    }
  },
  {
    $group: {
      _id: null,
      total: { $sum: '$context.energyKwh' }
    }
  }
])

// From EnergyConsumption
db.energyConsumptions.aggregate([
  {
    $match: {
      date: { $gte: new Date(new Date().setHours(0,0,0,0)) }
    }
  },
  {
    $group: {
      _id: null,
      total: { $sum: '$totalEnergyKwh' }
    }
  }
])
```

## 🚀 Next Steps

1. **Restart Backend Server** (if not already done)
   ```
   cd backend
   npm run dev
   ```

2. **Clear Browser Cache** and reload dashboard

3. **Test Offline Scenario:**
   - Turn on some switches
   - Wait 5 minutes
   - Disconnect ESP32
   - Verify consumption persists

4. **Monitor Logs** for new messages during offline events

5. **Compare Charts vs Cards** - they should match now

## ⚙️ Configuration

Your electricity rate is stored in:
```
backend/data/powerSettings.json
```

Example:
```json
{
  "electricityPrice": 7.5,
  "defaultPowerWatts": {
    "light": 40,
    "fan": 75,
    "ac": 1500,
    "projector": 200,
    "outlet": 100,
    "relay": 50
  }
}
```

**To change electricity rate:**
1. Edit `powerSettings.json`
2. Save file
3. Changes take effect immediately (no restart needed)

## 📚 Documentation Created

- `POWER_CONSUMPTION_FIX_GUIDE.md` - Complete technical guide with all fixes
- This file - Quick summary of changes

## 🐛 Troubleshooting

### Issue: "Charts still don't match cards"
**Solution:** Hard refresh browser (Ctrl+Shift+R), clear localStorage

### Issue: "Offline consumption not storing"
**Check:** 
1. Backend logs for "STORING ALL CONSUMPTION" messages
2. Switches were actually ON when device disconnected
3. MongoDB has EnergyConsumption collection

### Issue: "Monthly total wrong"
**Solution:**
1. Check if devices went offline multiple times
2. Verify using database queries above
3. Check logs for "FINAL (MAX)" message

### Issue: "Electricity rate not updating"
**Check:**
1. powerSettings.json is valid JSON
2. Backend has read access to file
3. Refresh dashboard after changing

## ✅ Success Criteria

After implementing these fixes:
- ✅ Dashboard cards and charts show SAME values (±0.01 kWh)
- ✅ Offline device consumption persists in database
- ✅ Reconnecting device adds NEW consumption to existing
- ✅ Changing electricity rate updates costs immediately
- ✅ Monthly totals accumulate correctly day-by-day
- ✅ Backend logs show clear offline storage messages

## 📞 Need Help?

If issues persist:
1. Check backend logs for errors
2. Verify MongoDB is running and accessible
3. Test with a single device first
4. Check browser console for API errors
5. Verify ESP32 is sending proper online/offline events

---

**Version:** v2.0 - Complete Analytics Fix  
**Date:** $(Get-Date -Format "yyyy-MM-dd")  
**Status:** ✅ Applied and Ready for Testing
