# Calendar Consumption Display Issue - Complete Analysis

## 🔍 Issue Identified

The Energy Monitoring Dashboard calendar shows **ALL DAYS WITH 0 kWh** consumption (gray cells with "-" showing).

### Current Calendar Behavior

```
Calendar Display for November 2025:
┌─────────────────────────────────────┐
│  Sun Mon Tue Wed Thu Fri Sat        │
│  [0]  [0]  [0]  [0]  [0]  [0]  [0] │ ← All days show 0 kWh (gray)
│  [0]  [0]  [0]  [0]  [0]  ...       │
└─────────────────────────────────────┘
Total: 0 kWh | Cost: ₹0.00
```

**Color Legend:**
- 🔲 **Gray** (current state): No data / 0 consumption
- 🔵 **Blue**: ≤1 kWh (low consumption)
- 🟡 **Yellow**: 1-2 kWh (medium consumption)  
- 🔴 **Red**: >2 kWh (high consumption)

---

## 🔎 Root Cause Analysis

### 1. Data Flow Chain

```
Switch Activity → DeviceConsumptionLedger → DailyAggregate → Calendar Display
     ❌              ❌                           ❌              ❌
```

**API Call:** `GET /api/analytics/energy-calendar/2025/11`

**Returns:**
```json
{
  "month": "November",
  "year": 2025,
  "days": [
    { "date": "2025-11-01", "consumption": 0, "cost": 0, "runtime": 0, "category": "none" },
    { "date": "2025-11-02", "consumption": 0, "cost": 0, "runtime": 0, "category": "none" },
    ...
  ],
  "totalCost": 0,
  "totalConsumption": 0
}
```

### 2. Backend Code Analysis

**File:** `backend/metricsService.js` → `getEnergyCalendar(year, month)`

```javascript
async function getEnergyCalendar(year, month) {
  const DailyAggregate = require('./models/DailyAggregate');
  
  // For each day in the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${month}-${day}`; // e.g., "2025-11-11"
    
    // ❌ Query DailyAggregate collection
    const dayAggregates = await DailyAggregate.find({ date_string: dateStr }).lean();
    
    // Sum up consumption from all aggregates
    for (const agg of dayAggregates) {
      dayConsumption += (agg.total_kwh || 0);
      dayCost += (agg.cost_at_calc_time || 0);
    }
  }
}
```

### 3. Database State

**Current State:**
```bash
DailyAggregate Collection: 0 documents
DeviceConsumptionLedger Collection: 0 documents
ActivityLog Collection: 0 documents
```

**Why empty?**
- ❌ No switches have been toggled to generate activity logs
- ❌ Aggregation service hasn't run (needs source data)
- ❌ System has no historical consumption data

---

## ✅ What SHOULD Be Displayed

### Calendar with Real Data Example

If switches were toggled and aggregates generated:

```
November 2025
┌─────────────────────────────────────────────┐
│  Sun   Mon   Tue   Wed   Thu   Fri   Sat    │
│  [🔵1.2] [🔵0.8] [🟡1.5] [🔴2.3] [🔵0.5]    │
│  [🟡1.8] [🔴2.7] [🔵0.9] [🔲0]   [🔵1.1]    │
└─────────────────────────────────────────────┘
Total: 15.3 kWh | Cost: ₹122.40
```

**Hover tooltip shows:**
```
November 5, 2025
Consumption: 1.12 kWh
Cost: ₹8.96
Runtime: 3h 25m
```

### Data Structure for Calendar Day

```javascript
{
  date: "2025-11-11",
  consumption: 1.234,      // ← kWh consumed that day
  cost: 9.87,              // ← Cost in rupees
  runtime: 3.5,            // ← Hours devices were ON
  category: "medium"       // ← Color category (low/medium/high)
}
```

---

## 🔧 Frontend Implementation (Working Correctly)

**File:** `src/components/EnergyMonitoringDashboard.tsx`

### Calendar Grid Rendering

```tsx
{calendarData.days.map((day, index) => (
  <div
    key={index}
    className={cn(
      "aspect-square rounded flex flex-col items-center justify-center",
      getCategoryColor(day.consumption, day.category),
      "text-white text-[10px] font-semibold group relative"
    )}
    title={`${day.consumption.toFixed(2)} kWh - ₹${day.cost.toFixed(2)}`}
  >
    <span className="text-[11px]">{new Date(day.date).getDate()}</span>
    <span className="text-[9px] opacity-75">
      {day.consumption === 0 ? '-' : day.consumption.toFixed(1)}
    </span>
    
    {/* Hover tooltip */}
    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-black text-white text-xs rounded p-2 whitespace-nowrap z-10">
      <div>{day.consumption.toFixed(2)} kWh</div>
      <div>₹{day.cost.toFixed(2)}</div>
      <div>{formatRuntime(day.runtime)}</div>
    </div>
  </div>
))}
```

### Color Coding Logic

```tsx
const getCategoryColor = (consumption: number, category: 'low' | 'medium' | 'high') => {
  // Show gray for zero consumption (no data for that day)
  if (consumption === 0) {
    return 'bg-gray-300 hover:bg-gray-400'; // ← Currently ALL days
  }
  
  switch (category) {
    case 'low': return 'bg-blue-500';    // ≤1 kWh
    case 'medium': return 'bg-yellow-500'; // 1-2 kWh
    case 'high': return 'bg-red-500';    // >2 kWh
  }
};
```

**✅ Frontend is working correctly** - it's displaying exactly what the API provides (all zeros).

---

## 📊 Complete Solution

### Step 1: Generate Activity Data

**Option A - Manual Switch Toggle (Quickest)**

1. Navigate to dashboard → Devices page
2. Toggle switches ON then OFF (generates activity logs)
3. Repeat for multiple devices over several hours/days

**Option B - Run Test Data Script**

```powershell
# Create test activity logs
cd C:\Users\IOT\Desktop\new-autovolt\backend
node generate_test_activity.js
```

### Step 2: Generate Aggregates

Once activity logs exist, run aggregation:

```powershell
cd C:\Users\IOT\Desktop\new-autovolt\backend
node create_all_aggregates.js
```

**Expected Output:**
```
✅ Generated daily aggregates: 15 records
✅ Generated monthly aggregates: 1 record
✅ Calendar now has data for 15 days
```

### Step 3: Verify Calendar Data

```powershell
# Check what calendar will show
Invoke-RestMethod -Uri "http://172.16.3.171:3001/api/analytics/energy-calendar/2025/11" | Select-Object -ExpandProperty days | Select-Object -First 5
```

**Expected Output:**
```
date         consumption cost  runtime category
----         ----------- ----  ------- --------
2025-11-01   0           0     0       none
2025-11-02   1.234       9.87  3.5     medium
2025-11-03   0.876       7.01  2.1     low
2025-11-04   2.456      19.65  5.8     high
2025-11-05   1.123       8.98  2.9     medium
```

### Step 4: Refresh Frontend

Clear browser cache and reload:
```
Ctrl + F5 (hard refresh)
```

---

## 🎯 Expected Calendar Display After Fix

### Before (Current - No Data)
```
All 30 days: 🔲 0 kWh (gray)
Total: 0 kWh | ₹0.00
```

### After (With Real Data)
```
Nov 1:  🔲 0     (no activity)
Nov 2:  🔵 1.2   (low - fan only)
Nov 3:  🟡 1.8   (medium - lights + fan)
Nov 4:  🔴 2.3   (high - projector + lights)
Nov 5:  🔵 0.9   (low)
...
Nov 11: 🟡 1.5   (today - partial day)

Total: 18.7 kWh | ₹149.60
```

---

## 📝 What Each Day Cell Shows

### Visual Breakdown

```
┌─────────────┐
│     11      │ ← Day number (large)
│    1.2      │ ← Consumption in kWh (small)
└─────────────┘
  Background color based on consumption:
  - Gray: 0 kWh (no data)
  - Blue: ≤1 kWh
  - Yellow: 1-2 kWh  
  - Red: >2 kWh
```

### Hover Tooltip (Detailed Info)

```
┌─────────────────────────┐
│  1.23 kWh              │ ← Precise consumption
│  ₹9.84                 │ ← Cost
│  3h 15m                │ ← Runtime (devices ON)
└─────────────────────────┘
```

---

## 🔍 Debugging Commands

### Check Database Collections
```powershell
cd C:\Users\IOT\Desktop\new-autovolt\backend

# Check DailyAggregate
node -e "require('./check_data_sources.js')"

# Check ActivityLog
node -e "const mongoose = require('mongoose'); const ActivityLog = require('./models/ActivityLog'); mongoose.connect(process.env.MONGODB_URI).then(async () => { const count = await ActivityLog.countDocuments(); console.log('ActivityLog count:', count); process.exit(0); });"
```

### Test Calendar API
```powershell
# Current month
Invoke-RestMethod -Uri "http://172.16.3.171:3001/api/analytics/energy-calendar/2025/11"

# Specific month (e.g., October)
Invoke-RestMethod -Uri "http://172.16.3.171:3001/api/analytics/energy-calendar/2025/10"
```

### Check Console Logs
Browser console shows calendar data fetch:
```javascript
[Calendar] Fetching data for: 2025 11
[Calendar] Received data: {month: 'November', year: 2025, days: Array(30), totalCost: 0, totalConsumption: 0}
```

---

## 🎓 Understanding the Data Flow

### Complete Consumption Tracking Chain

```
1. USER ACTION
   ↓
   User toggles switch ON/OFF via dashboard
   ↓
2. MQTT MESSAGE
   ↓
   Backend publishes to esp32/switches topic
   ↓
3. ESP32 DEVICE
   ↓
   Changes GPIO pin state, sends confirmation
   ↓
4. DATABASE WRITE
   ↓
   backend/services/powerConsumptionTracker.js
   - Calculates duration (ON time)
   - Calculates consumption (power × time)
   - Writes to DeviceConsumptionLedger
   ↓
5. AGGREGATION (Daily @ midnight IST)
   ↓
   backend/services/aggregationService.js
   - Groups ledger entries by date
   - Sums consumption per day
   - Writes to DailyAggregate
   ↓
6. CALENDAR API
   ↓
   GET /api/analytics/energy-calendar/:year/:month
   - Reads DailyAggregate for each day
   - Returns array of 30 days with consumption
   ↓
7. FRONTEND DISPLAY
   ↓
   EnergyMonitoringDashboard.tsx
   - Renders calendar grid
   - Colors cells based on consumption
   - Shows tooltips on hover
```

### Current Broken Point

```
❌ Step 4: DeviceConsumptionLedger is EMPTY
   ↓
❌ Step 5: Aggregation has no source data
   ↓  
❌ Step 6: Calendar API returns all zeros
   ↓
✅ Step 7: Frontend correctly displays zeros as gray
```

---

## 📋 Quick Fix Checklist

- [ ] **Check device status**: At least one ESP32 online?
- [ ] **Toggle switches**: Turn ON, wait 30 sec, turn OFF
- [ ] **Verify ledger entries**: Run `node check_data_sources.js`
- [ ] **Run aggregation**: `node create_all_aggregates.js`
- [ ] **Verify API**: Test `/api/analytics/energy-calendar/2025/11`
- [ ] **Refresh browser**: Ctrl+F5 to clear cache
- [ ] **Check calendar**: Should show colored cells with kWh values

---

## 🎯 Summary

**What's Working:**
- ✅ Calendar component UI renders correctly
- ✅ Color coding logic is correct
- ✅ Tooltip display works
- ✅ API endpoint responds correctly
- ✅ Backend aggregation logic is sound

**What's Missing:**
- ❌ **Source data in database** (root cause)
- ❌ No switch activity logs
- ❌ No daily aggregates generated
- ❌ Calendar has nothing to display

**Solution:**
1. Toggle switches to generate activity
2. Run aggregation to populate DailyAggregate
3. Calendar will automatically display consumption data with proper colors

**Time to Fix:** 5-10 minutes (toggle switches + run script)
