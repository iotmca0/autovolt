# 🔋 Real Power Consumption Tracking - Implementation Guide

## 📋 Overview
Converted the power tracking system from **test/mock data** to **real consumption tracking** based on actual switch operations.

---

## ✅ What Was Fixed

### 1. **Power Tracker Now Saves to Correct Database**
**Problem:** `powerConsumptionTracker.js` was saving to the OLD `EnergyConsumption` model instead of the NEW `DeviceConsumptionLedger`.

**Fix:** Updated to save ledger entries with:
- ✅ Device ID, ESP32 name, classroom
- ✅ Switch details (ID, name, type)
- ✅ Timestamps (start_ts, end_ts)
- ✅ Duration in seconds
- ✅ Energy in Wh (delta_wh)
- ✅ Power in Watts (power_w)
- ✅ Cost calculation (₹ per kWh, total cost)
- ✅ Quality metadata (high confidence, real-time tracking)

**File:** `backend/services/powerConsumptionTracker.js`

---

### 2. **Real-Time Aggregation Trigger**
**Problem:** Aggregation only ran at 2:00 AM daily, so dashboard showed stale data.

**Fix:** Added automatic aggregation trigger:
- ⚡ Runs immediately when a switch turns OFF
- ⚡ Updates `DailyAggregate` in real-time
- ⚡ Dashboard shows consumption within seconds

**How it works:**
```
Switch OFF → Save to Ledger → Trigger Aggregation → Update Dashboard
```

---

### 3. **Test Data Cleanup Script**
**Script:** `backend/clear-test-data.js`

**What it does:**
- 🗑️ Deletes fake `DailyAggregate` records (16 kWh with 0 runtime)
- 🗑️ Deletes fake `MonthlyAggregate` records
- 🗑️ Clears empty `DeviceConsumptionLedger`
- ✅ Preserves real `ActivityLog` (63 switch operations)

**Run it:**
```powershell
cd backend
node clear-test-data.js
```

---

## 🎯 How Real Tracking Works

### **Flow:**
1. **User/Schedule Turns Switch ON**
   - `deviceController.js` calls `powerTracker.trackSwitchOn()`
   - Tracker records: switchId, startTime, power (Watts), device info

2. **User/Schedule Turns Switch OFF**
   - `deviceController.js` calls `powerTracker.trackSwitchOff()`
   - Tracker calculates:
     - Duration = endTime - startTime
     - Energy (kWh) = (Power × Duration) / 1000
     - Cost (₹) = Energy × Electricity Rate
   - Saves to `DeviceConsumptionLedger`
   - **Triggers aggregation immediately**

3. **Aggregation Service**
   - Reads all ledger entries for today
   - Groups by device and classroom
   - Calculates totals: energy, runtime, cost
   - Saves to `DailyAggregate`
   - Updates `MonthlyAggregate`

4. **Dashboard Displays**
   - Analytics card reads `DailyAggregate`
   - Calendar reads `DailyAggregate`
   - Shows real kWh based on actual runtime

---

## 📊 Database Models

### **DeviceConsumptionLedger** (Source of Truth)
```javascript
{
  device_id: "673e5c4a...",
  esp32_name: "LH_D_28_(MCA_1)",
  classroom: "673e5c0d...",
  switch_id: "switch_0",
  switch_name: "Light 1",
  switch_type: "light",
  start_ts: "2025-11-05T10:30:00Z",
  end_ts: "2025-11-05T12:45:00Z",
  switch_on_duration_seconds: 8100,  // 2.25 hours
  delta_wh: 225,                     // 100W × 2.25h = 225 Wh
  power_w: 100,
  cost_calculation: {
    cost_per_kwh: 7.5,
    cost_inr: 1.6875                 // ₹1.69
  },
  quality: {
    confidence: "high",
    data_source: "power_tracker"
  }
}
```

### **DailyAggregate** (Dashboard Display)
```javascript
{
  date_string: "2025-11-05",
  classroom: "673e5c0d...",
  device_id: "673e5c4a...",
  esp32_name: "LH_D_28_(MCA_1)",
  total_kwh: 2.4,                    // Sum of all switches today
  on_time_sec: 28800,                // 8 hours total runtime
  cost_at_calc_time: 18.0,           // ₹18.00
  cost_per_kwh_used: 7.5,
  switch_count: 4,
  switch_breakdown: [...]
}
```

---

## 🚀 Setup Instructions

### **Step 1: Clear Test Data**
```powershell
cd C:\Users\IOT\Desktop\new-autovolt\backend
node clear-test-data.js
```

**Output:**
```
📊 Current Data Status:
- DailyAggregate: 6 records
- MonthlyAggregate: 1 records
- DeviceConsumptionLedger: 0 records
- ActivityLog: 63 records (KEEPING)

🗑️  Clearing test/mock data...
✅ Cleared all DailyAggregate records
✅ Cleared all MonthlyAggregate records
✅ Cleared DeviceConsumptionLedger

✅ Test data cleared successfully!
```

---

### **Step 2: Restart Backend**
```powershell
cd C:\Users\IOT\Desktop\new-autovolt\backend
npm start
```

**Look for:**
```
[PowerTracker] Service initialized
[PowerTracker] Loaded settings from database: ₹7.50/kWh, 8 device types
```

---

### **Step 3: Test Real Tracking**

#### **A. Turn Switch ON**
- Go to Dashboard → Any ESP32 device
- Click a switch to turn it ON
- Backend logs:
  ```
  [PowerTracker] Switch ON: Light 1 (switch_0) on LH_D_28_(MCA_1). Power: 100W.
  ```

#### **B. Wait (or Turn OFF Immediately)**
- Let it run for a few seconds/minutes
- Click the switch to turn it OFF
- Backend logs:
  ```
  [PowerTracker] Switch OFF: Light 1 (switch_0) on LH_D_28_(MCA_1). Duration: 0.002h, Energy: 0.00020 kWh, Cost: ₹0.0015
  [PowerTracker] ✅ Saved to DeviceConsumptionLedger: 0.00020 kWh
  [AggregationService] Aggregating daily for 2025-11-05...
  [PowerTracker] ✅ Aggregation completed
  ```

#### **C. Check Dashboard**
- Go to Analytics & Monitoring
- **Today's Consumption** should show the real energy
- **Calendar** should match the analytics card
- **Example:** 0.2 Wh = ₹0.0015 (for a 2-second test)

---

## 🔍 Verification Scripts

### **Check Ledger Entries**
```javascript
// backend/check-ledger.js
const DeviceConsumptionLedger = require('./models/DeviceConsumptionLedger');
const ledger = await DeviceConsumptionLedger.find().lean();
console.log('Ledger entries:', ledger.length);
ledger.forEach(e => {
  console.log(`${e.esp32_name} - ${e.switch_name}: ${e.delta_wh}Wh, ₹${e.cost_calculation.cost_inr}`);
});
```

### **Check Daily Aggregates**
```javascript
// Run: node check-today-consumption.js
const DailyAggregate = require('./models/DailyAggregate');
const today = new Date().toISOString().split('T')[0];
const aggs = await DailyAggregate.find({ date_string: today }).lean();
console.log('Today aggregates:', aggs.length);
aggs.forEach(a => {
  console.log(`${a.esp32_name}: ${a.total_kwh} kWh, ${a.on_time_sec}s, ₹${a.cost_at_calc_time}`);
});
```

---

## 📈 Expected Results

### **Before (Test Data):**
```
DailyAggregate: 16.000 kWh, 0 hours runtime ❌
Calendar: Different values than analytics ❌
Cost: ₹0.00 everywhere ❌
```

### **After (Real Data):**
```
DailyAggregate: 0.225 kWh, 2.25 hours runtime ✅
Calendar: Matches analytics card exactly ✅
Cost: ₹1.69 (based on actual usage) ✅
```

---

## 🎯 Power Settings Configuration

### **Current Settings:**
- **Electricity Rate:** ₹7.50 per kWh
- **Device Power Consumption:**
  - Light: 100W
  - Fan: 75W
  - AC: 1500W
  - Projector: 250W
  - Computer: 200W
  - Smart Board: 150W
  - Speaker: 50W
  - Camera: 10W

### **How to Change:**
1. Go to Energy Dashboard
2. Click **⚙️ Settings** button
3. Edit electricity price or device wattage
4. Click **Save**
5. New values apply to all future tracking

**API:** `POST /api/settings/power` (Admin only)

---

## 🐛 Troubleshooting

### **Issue: Dashboard shows 0 kWh**
**Check:**
1. Are devices online? (Dashboard → Device status)
2. Are switches being toggled? (Check ActivityLog)
3. Are ledger entries created? (Run `node check-ledger.js`)
4. Is aggregation running? (Check server logs for `[AggregationService]`)

### **Issue: Calendar shows different data than card**
**Check:**
- Both now use `DailyAggregate` - if they differ, clear browser cache
- Verify API: `GET /api/analytics/energy-summary`
- Verify API: `GET /api/analytics/energy-calendar/2025/11`

### **Issue: Cost is ₹0.00**
**Check:**
1. Power settings loaded? `GET /api/settings/power`
2. Ledger has `cost_calculation.cost_inr`? (Check DB)
3. Aggregation copying cost correctly? (Check `DailyAggregate.cost_at_calc_time`)

---

## 🎉 Success Criteria

✅ `DeviceConsumptionLedger` populated after each switch OFF  
✅ `DailyAggregate` shows non-zero runtime hours  
✅ Dashboard displays consumption within seconds of switch OFF  
✅ Calendar matches analytics card exactly  
✅ Cost calculated correctly: Energy × ₹7.50/kWh  
✅ No more 16 kWh with 0 hours runtime paradox  

---

## 📝 Summary

**Before:** Mock data (16 kWh, 0 runtime) → Confusing, inaccurate  
**After:** Real tracking (runtime × power) → Accurate, real-time  

**Key Change:** `powerConsumptionTracker.js` now saves to `DeviceConsumptionLedger` and triggers immediate aggregation.

**Result:** Dashboard shows **REAL** power consumption based on **ACTUAL** switch operations! 🚀
