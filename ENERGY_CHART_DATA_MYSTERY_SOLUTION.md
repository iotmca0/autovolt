# Energy Consumption Chart Data Mystery - SOLUTION

## 🔍 Investigation Summary

### What We Found:
1. **Database**: Using `autovolt` (not `iot-classroom-automation`)
2. **Data Status**:
   - ✅ 2 EnergyConsumption records exist
   - ❌ 0 ActivityLog switch events
   - ❌ 0 DeviceConsumptionLedger entries
   - ❌ 0 Daily/Monthly Aggregates
3. **Devices**: 3 online, 3 offline
4. **Today's consumption**: 0.020 kWh (calculated from recent activity)

### Why Charts Show Different Data:

The **"2143.16 kWh over 6 months"** is likely coming from:
1. **Old cached browser data** - Clear cache with Ctrl+Shift+Delete
2. **Frontend fallback/demo data** - Check EnergyCharts component
3. **Different calculation method** - Cards use `getEnergySummary()`, charts use `yearlyBreakdown()`

## ✅ Confirmed Root Cause

**NO AGGREGATES EXIST** because:
- Aggregation service uses `DeviceConsumptionLedger` (new system)
- Your database only has `EnergyConsumption` (legacy system)
- Migration between systems never happened

## 🔧 SOLUTION

### Immediate Fix: Clear Browser Cache
```bash
# In your browser:
1. Press Ctrl+Shift+Delete
2. Select "Cached images and files"
3. Select "All time"
4. Click "Clear data"
5. Hard refresh page: Ctrl+F5
```

### Check What API Actually Returns
Open browser DevTools (F12) → Network tab → Filter: energy

Look for these API calls:
- `/api/analytics/energy-summary` - Should return current values
- `/api/analytics/energy-breakdown/yearly` - Should return year data
- Compare responses with chart display

### If Data Still Mismatches:

The issue is that `energyAPI.yearlyBreakdown()` returns data from `MonthlyAggregate` collection which is empty.

But `getEnergySummary()` has FALLBACK logic that calculates from `calculatePreciseEnergyConsumption()` which uses ActivityLog.

**However, ActivityLog is also empty!**

## 🎯 Real Solution

**Your database appears to have been recently reset or is not receiving consumption data.**

### To Generate Fresh Data:

1. **Turn devices ON/OFF** - This creates activity logs
2. **Wait 1 minute** - Backend processes events
3. **Check activity logs**:
   ```bash
   node check_data_sources.js
   ```
4. **If activity logs created, run aggregation**:
   ```bash
   node create_all_aggregates.js
   ```
5. **Refresh frontend**

### To Debug Current State:

1. **Check backend logs** for consumption tracking:
   ```bash
   # Start backend with verbose logging
   npm run dev

   # In another terminal, turn a switch ON/OFF from UI
   # Watch backend logs for:
   # - "Switch state change"
   # - "Creating activity log"
   # - "Power consumption updated"
   ```

2. **Verify MQTT is working**:
   ```bash
   # Backend should show:
   # [MQTT] Connected to broker
   # [MQTT] Subscribed to esp32/#
   ```

3. **Check device status**:
   - Are ESP32 devices connected to MQTT broker?
   - Can backend send commands to devices?
   - Do devices respond?

## 🔍 Where is "2143.16 kWh" Coming From?

Let me check if there's hardcoded data or if it's calculating from somewhere...

### Theory 1: Old Browser Cache
Most likely - browser cached old API responses

### Theory 2: Different Database
You might have multiple databases or database instances

### Theory 3: Frontend Mock Data
Check if EnergyCharts has fallback data

### Theory 4: Legacy EnergyConsumption Records
The 2 records in `energyconsumptions` might sum to that value

Let me check what those 2 records contain:

```bash
# Run this to see the 2 EnergyConsumption records:
mongo autovolt
> db.energyconsumptions.find().pretty()
```

## 📊 Expected vs Actual

### Expected Behavior:
- **Cards** (Today/Month): Calculate from ActivityLog OR fallback estimation
- **Charts** (Day/Month/Year): Use DailyAggregate/MonthlyAggregate
- **Both should match** after aggregation runs

### Actual Behavior:
- **Cards**: Showing tiny values (0.003 kWh, ₹0.02) - Correct for limited data
- **Charts**: Showing 2143.16 kWh - **WRONG** - Should show 0 or small value

## 🚀 Action Plan

1. **Clear browser cache** → See if chart changes
2. **Check backend is running** → Ensure it's tracking consumption
3. **Turn switches ON/OFF** → Generate activity logs
4. **Run aggregation** → Create aggregates
5. **Verify data flow** → Backend logs → Database → API → Frontend

## 📝 Next Steps

Please provide:
1. Screenshot of browser DevTools → Network → `/api/analytics/energy-breakdown/yearly` response
2. Output of: `mongo autovolt --eval "db.energyconsumptions.find().pretty()"`
3. Backend console logs when you turn a switch ON

This will help us understand where the "2143.16 kWh" is coming from!
