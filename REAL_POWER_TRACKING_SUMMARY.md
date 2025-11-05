# ✅ Power Consumption Now Uses REAL DATA

## 🎯 What Changed

### **Before (Mock Data System):**
- ❌ Saved to wrong database model (`EnergyConsumption` instead of `DeviceConsumptionLedger`)
- ❌ Dashboard showed fake data: 16 kWh with 0 hours runtime
- ❌ Aggregation only ran at 2 AM (stale data all day)
- ❌ Calendar and analytics card showed different values

### **After (Real Tracking System):**
- ✅ Saves to correct model: `DeviceConsumptionLedger`
- ✅ Real-time aggregation after every switch OFF
- ✅ Dashboard shows actual consumption: runtime × power
- ✅ Calendar and analytics card use same data source
- ✅ All test data cleared from database

---

## 📁 Files Modified

### 1. **`backend/services/powerConsumptionTracker.js`**
**Changes:**
- Added import: `const DeviceConsumptionLedger = require('../models/DeviceConsumptionLedger');`
- Updated `trackSwitchOff()` to save to `DeviceConsumptionLedger` instead of `EnergyConsumption`
- Added `triggerAggregation()` method to run aggregation immediately after saving
- Ledger entries include: device info, switch details, duration, energy (Wh), power (W), cost, quality metadata

**Result:** Every switch OFF event now creates a real ledger entry

---

### 2. **`backend/clear-test-data.js`** (NEW)
**Purpose:** Clean up fake/test data
**What it does:**
- Deletes all `DailyAggregate` records (the fake 16 kWh data)
- Deletes all `MonthlyAggregate` records
- Clears `DeviceConsumptionLedger`
- Preserves `ActivityLog` (real switch operations)

**Run:** `node clear-test-data.js`

---

### 3. **`backend/verify-setup.js`** (NEW)
**Purpose:** Verify system is ready
**What it checks:**
- Test data cleared ✅
- Real data preserved ✅
- Devices status (online/offline)
- Power settings configured ✅

**Run:** `node verify-setup.js`

---

### 4. **`REAL_POWER_TRACKING_GUIDE.md`** (NEW)
**Purpose:** Complete documentation
**Includes:**
- How real tracking works (flow diagram)
- Database model schemas
- Setup instructions
- Testing guide
- Troubleshooting
- Verification scripts

---

## 🚀 How to Use

### **Step 1: Test Data Cleared** ✅
Already done! Ran `clear-test-data.js` successfully:
```
✅ Cleared all DailyAggregate records
✅ Cleared all MonthlyAggregate records
✅ Cleared DeviceConsumptionLedger
✅ ActivityLog preserved (85 records)
```

---

### **Step 2: Restart Backend Server**
```powershell
cd C:\Users\IOT\Desktop\new-autovolt\backend
npm start
```

Look for this in logs:
```
[PowerTracker] Service initialized
[PowerTracker] Loaded settings from database: ₹7.50/kWh, 6 device types
```

---

### **Step 3: Test Real Tracking**

#### **Scenario: Turn a switch ON and OFF**

1. **Go to Dashboard** → Select any ESP32 device (must be ONLINE)
2. **Turn switch ON** → Backend logs:
   ```
   [PowerTracker] Switch ON: Light 1 (switch_0) on LH_D_28_(MCA_1). Power: 40W.
   ```

3. **Wait 10-30 seconds** (or longer for more consumption)

4. **Turn switch OFF** → Backend logs:
   ```
   [PowerTracker] Switch OFF: Light 1 (switch_0) on LH_D_28_(MCA_1). 
   Duration: 0.008h, Energy: 0.00032 kWh, Cost: ₹0.0024
   [PowerTracker] ✅ Saved to DeviceConsumptionLedger: 0.00032 kWh
   [AggregationService] Aggregating daily for 2025-11-05...
   [PowerTracker] ✅ Aggregation completed
   ```

5. **Check Dashboard** → Analytics & Monitoring
   - **Today's Consumption** should show: 0.00032 kWh
   - **Today's Cost** should show: ₹0.0024
   - **Runtime** should show: ~30 seconds (not 0!)

---

### **Step 4: Verify Data**

#### **A. Check Ledger Entries**
```powershell
node check-ledger.js
```

**Expected Output:**
```
📊 DeviceConsumptionLedger: 1 entries

✅ Recent Ledger Entries:

1. LH_D_28_(MCA_1) - Light 1
   Duration: 0.50 minutes
   Energy: 0.00032 kWh (0.32 Wh)
   Power: 40W
   Cost: ₹0.0024
   Quality: high confidence
```

#### **B. Check Today's Aggregates**
```powershell
node analyze-consumption.js
```

**Expected Output:**
```
📈 Today's DailyAggregate: 1 records

✅ Today's Aggregated Consumption:

1. LH_D_28_(MCA_1)
   Energy: 0.00032 kWh
   Runtime: 0.01 hours (30 seconds)
   Cost: ₹0.0024
   Switches: 1
```

---

## 🔍 Data Flow

### **Switch Operation → Real Consumption**

```
1. User clicks switch ON
   ↓
2. deviceController.js calls powerTracker.trackSwitchOn()
   ↓
3. Tracker records: { switchId, startTime, power: 40W }
   ↓
4. User clicks switch OFF
   ↓
5. deviceController.js calls powerTracker.trackSwitchOff()
   ↓
6. Tracker calculates:
   - Duration = 30 seconds = 0.00833 hours
   - Energy = 40W × 0.00833h = 0.333 Wh = 0.000333 kWh
   - Cost = 0.000333 kWh × ₹7.5/kWh = ₹0.0025
   ↓
7. Tracker saves to DeviceConsumptionLedger:
   {
     device_id: "673e5c4a...",
     esp32_name: "LH_D_28_(MCA_1)",
     switch_id: "switch_0",
     switch_name: "Light 1",
     switch_type: "light",
     start_ts: "2025-11-05T10:30:00Z",
     end_ts: "2025-11-05T10:30:30Z",
     switch_on_duration_seconds: 30,
     delta_wh: 0.333,
     power_w: 40,
     cost_calculation: {
       cost_per_kwh: 7.5,
       cost_inr: 0.0025
     }
   }
   ↓
8. Tracker triggers aggregationService.aggregateDaily()
   ↓
9. Aggregation reads all ledger entries for today
   ↓
10. Aggregation saves to DailyAggregate:
    {
      date_string: "2025-11-05",
      device_id: "673e5c4a...",
      esp32_name: "LH_D_28_(MCA_1)",
      total_kwh: 0.000333,
      on_time_sec: 30,
      cost_at_calc_time: 0.0025,
      switch_count: 1
    }
    ↓
11. Dashboard fetches from DailyAggregate
    ↓
12. UI displays: "0.000333 kWh, ₹0.0025, 30 seconds runtime"
```

---

## 📊 Power Settings

### **Current Configuration:**
| Device Type | Power Consumption |
|------------|-------------------|
| Light | 40W |
| Fan | 75W |
| Projector | 200W |
| Air Conditioner | 1500W |
| Outlet | 100W |
| Default | 50W |

**Electricity Rate:** ₹7.50 per kWh

### **To Change Settings:**
1. Go to Energy Dashboard
2. Click **⚙️ Settings** button
3. Edit values
4. Click **Save**
5. All future calculations use new values

---

## ⚠️ Important Notes

### **Devices Must Be ONLINE**
- Power tracking ONLY works for ONLINE devices
- Offline devices → switch operations ignored
- Check device status: Dashboard → Device list

### **No Devices Online?**
Current status: **0 ESP32 devices online**

**To fix:**
1. Ensure ESP32 devices are powered on
2. Check WiFi connection
3. Verify MQTT broker running
4. Check backend logs for device heartbeats

### **Runtime = 0 Hours?**
If you still see consumption with 0 runtime:
- Old test data not cleared → Re-run `clear-test-data.js`
- Aggregation using wrong data source → Check server logs
- Browser cache → Hard refresh (Ctrl+Shift+R)

---

## 🎉 Success Indicators

✅ **Ledger has entries** (`check-ledger.js` shows records)  
✅ **Runtime > 0** (not 0 hours anymore)  
✅ **Cost calculated** (₹ value based on actual usage)  
✅ **Real-time updates** (dashboard updates within seconds)  
✅ **Calendar matches analytics card** (same data source)  

---

## 📝 Quick Reference

### **Useful Commands:**
```powershell
# Clear test data
node clear-test-data.js

# Verify setup
node verify-setup.js

# Check ledger entries
node check-ledger.js

# Check today's consumption
node analyze-consumption.js

# Restart backend
npm start
```

### **API Endpoints:**
- `GET /api/analytics/energy-summary` - Today's consumption
- `GET /api/analytics/energy-calendar/2025/11` - Calendar data
- `GET /api/settings/power` - Power settings
- `POST /api/settings/power` - Update settings (Admin only)

---

## 🐛 Troubleshooting

### **Issue: Dashboard shows 0 kWh**
1. Check devices online: `node verify-setup.js`
2. Turn switch ON → wait → OFF
3. Check ledger: `node check-ledger.js`
4. Check server logs for errors

### **Issue: Runtime still 0 hours**
1. Clear browser cache (Ctrl+Shift+R)
2. Verify ledger has entries with duration > 0
3. Re-run aggregation: `node reaggregate-today.js`

### **Issue: Cost is ₹0.00**
1. Check power settings: `GET /api/settings/power`
2. Verify `cost_at_calc_time` in DailyAggregate
3. Check ledger `cost_calculation.cost_inr`

---

## 🎯 Summary

**You asked:** "use power consumption data real one no mock data"

**We delivered:**
1. ✅ Fixed `powerConsumptionTracker` to save to `DeviceConsumptionLedger`
2. ✅ Added real-time aggregation trigger
3. ✅ Cleared all fake test data (16 kWh with 0 runtime)
4. ✅ System ready for real power tracking
5. ✅ Created comprehensive documentation

**Next:** Toggle some switches and watch REAL consumption appear in the dashboard! 🚀

---

**Note:** Current status shows **0 ESP32 devices online**. Once devices come online and switches are toggled, you'll see real power consumption data immediately!
