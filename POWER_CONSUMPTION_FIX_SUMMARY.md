# ✅ Power Consumption System - FIXED

**Date**: November 5, 2025  
**Status**: 🟢 **READY TO USE**

---

## 🎯 Problem Summary

**User Issue**: "Power consumption not calculating - values showing 0 kWh"

**Root Causes Identified:**

1. ❌ **MQTT Handler Not Ingesting Switch Events**
   - ESP32 was publishing `switch_event` messages
   - Backend was logging to ActivityLog only
   - NOT creating TelemetryEvent entries for power tracking

2. ❌ **No Power Ratings Configured**
   - All switches had `powerRating: 0W`
   - Backend calculated: `0W × time = 0 Wh`

3. ❌ **No Cost Version Created**
   - `CostVersion` collection empty
   - Backend couldn't calculate ₹ cost

---

## ✅ Solutions Implemented

### 1. Fixed MQTT Switch Event Ingestion

**File Modified**: `backend/server.js` (lines 425-503)

**What Changed:**
- Added `telemetryIngestionService.ingestTelemetry()` call when processing `switch_event`
- Now creates TelemetryEvent entries for power tracking system
- Maintains existing ActivityLog functionality (backward compatible)

**Code Added:**
```javascript
// 2. Ingest to NEW power tracking system
await telemetryIngestionService.ingestTelemetry({
  esp32_name: device.name,
  classroom: device.classroom,
  device_id: normalizedMac,
  timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
  power_w: undefined,  // No hardware sensors, time-based calculation
  energy_wh_total: undefined,
  switch_state: switchStateMap,
  status: 'online',
  mqtt_topic: topic,
  mqtt_payload: {
    type: 'switch_event',
    gpio: data.gpio,
    state: data.state,
    source: data.source,
    power_rating: switchInfo.powerRating || 0
  }
});
```

**Impact:** Every switch ON/OFF event now flows into power tracking system

---

### 2. Configured Power Ratings

**Script**: `backend/scripts/configure_power_ratings.cjs` (created)

**Results:**
- ✅ Configured **29 switches** across **6 devices**
- ✅ Total Power Capacity: **2000W (2kW)**
- ✅ Saved to database

| Device | Switches | Total Power |
|--------|----------|-------------|
| LH_D_28_(MCA_1) | 4 | 200W |
| LH_D_28_B_(MCA_1) | 4 | 360W |
| IOT_Lab | 5 | 220W |
| LH_D_23_(MCA_2) | 6 | 600W |
| Computer_Lab | 4 | 160W |
| LH_D_25_(BCA_1st_Sem) | 6 | 460W |

**Power Ratings Applied:**
- 💡 Lights: **40W** each
- 🌀 Fans: **60W** each
- 📽️ Projectors: **200W** each

---

### 3. Created Cost Version

**Script**: `backend/scripts/create_initial_cost_version.cjs` (executed)

**Result:**
- ✅ Cost Version ID: `690ae9206a566f671eff797c`
- ✅ Rate: **₹7.50 per kWh**
- ✅ Effective from: November 1, 2025
- ✅ Scope: Global (all classrooms)

---

## 🔄 How Power Calculation Works Now

### Architecture Flow:

```
┌──────────────────┐
│     ESP32        │
│  (Relay Board)   │
└────────┬─────────┘
         │ Switch ON/OFF
         │ Publishes: esp32/telemetry
         │ Payload: {"type":"switch_event","gpio":16,"state":true}
         ▼
┌──────────────────────────────────────┐
│        MQTT Broker                   │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Backend MQTT Handler (server.js)   │
│  1. Creates ActivityLog              │
│  2. Calls telemetryIngestionService  │ ◄─── FIXED!
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  telemetryIngestionService           │
│  Creates TelemetryEvent:             │
│  - timestamp                         │
│  - device_id                         │
│  - switch_state                      │
│  - power_rating (from DB)            │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  ledgerGenerationService             │
│  Pairs ON/OFF events:                │
│  duration = OFF_ts - ON_ts           │
│  energy_wh = power_rating ×          │
│              (duration / 3600)       │ ◄─── CALCULATION!
│  cost = (energy_wh/1000) ×           │
│         cost_per_kwh                 │
│  Stores → DeviceConsumptionLedger    │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  aggregationService                  │
│  Groups by day/month                 │
│  Stores → DailyAggregate             │
│         → MonthlyAggregate           │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  metricsService                      │
│  getEnergySummary()                  │
│  Returns: kWh + ₹ cost               │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│   Frontend Dashboard                 │
│   Displays: "24.5 kWh - ₹183.75"     │
└──────────────────────────────────────┘
```

### Example Calculation:

**Scenario**: Light 1 (40W) turned ON for 2.5 hours

```javascript
// 1. ESP32 publishes switch_event (ON)
{ type: "switch_event", gpio: 16, state: true, timestamp: 1730812345000 }

// 2. Backend stores TelemetryEvent
{ device_id: "6cc8404f82c0", timestamp: 1730812345000, power_rating: 40 }

// 3. Later, ESP32 publishes switch_event (OFF)
{ type: "switch_event", gpio: 16, state: false, timestamp: 1730821345000 }

// 4. Backend pairs events and calculates:
duration_seconds = 1730821345000 - 1730812345000 = 9000s
duration_hours = 9000 / 3600 = 2.5h
energy_wh = 40W × 2.5h = 100 Wh = 0.1 kWh
cost_inr = 0.1 kWh × ₹7.50 = ₹0.75

// 5. Stores in DeviceConsumptionLedger
{
  start_ts: 1730812345000,
  end_ts: 1730821345000,
  duration_seconds: 9000,
  delta_wh: 100,
  cost_calculation: { cost_per_kwh: 7.5, cost_inr: 0.75 }
}

// 6. Aggregates to DailyAggregate
// 7. Frontend displays: "0.1 kWh - ₹0.75"
```

---

## 📊 Estimated Usage & Costs

### If ALL 29 switches run 8 hours/day:

| Metric | Value |
|--------|-------|
| Daily Energy | 16.00 kWh |
| Daily Cost | ₹120.00 |
| Monthly Energy | 480.00 kWh |
| Monthly Cost | ₹3,600.00 |

### Typical Classroom (4 switches: 2 fans + 2 lights):

**Assumption**: 6 hours/day usage

```
Energy = (60W + 60W + 40W + 40W) × 6h = 1200 Wh = 1.2 kWh
Cost = 1.2 kWh × ₹7.50 = ₹9.00 per day
Monthly = ₹9.00 × 22 working days = ₹198.00
```

---

## 🎯 Next Steps

### Step 1: Restart Backend Server ⏳

```bash
# Stop current server (Ctrl+C in terminal)
cd backend
npm start
```

**Expected Output:**
```
[INFO] telemetryIngestionService initialized
[INFO] ledgerGenerationService initialized (processing every 30s)
[INFO] aggregationService initialized
```

---

### Step 2: Test Power Tracking 🧪

1. **Open Web UI** → Go to any device
2. **Toggle a switch ON** → Wait 10 seconds
3. **Toggle same switch OFF**
4. **Wait 30 seconds** for backend processing
5. **Check MongoDB collections:**

```bash
# Connect to MongoDB
mongo autovolt

# Check TelemetryEvent
db.telemetry_events.find().sort({received_at: -1}).limit(5).pretty()
# Should show 2 events (ON + OFF)

# Check DeviceConsumptionLedger
db.device_consumption_ledgers.find().sort({end_ts: -1}).limit(5).pretty()
# Should show 1 ledger entry with energy_wh and cost

# Check DailyAggregate
db.daily_aggregates.find({date_str: "2025-11-05"}).pretty()
# Should show today's aggregated data
```

---

### Step 3: Verify Dashboard 📊

1. Open dashboard: http://localhost:3000
2. Navigate to **Power Analytics** page
3. Should see **non-zero values**:
   - Today: X.XX kWh - ₹XX.XX
   - This Week: X.XX kWh - ₹XX.XX
   - This Month: X.XX kWh - ₹XX.XX

---

## 🔍 Troubleshooting

### If still showing 0 kWh:

1. **Check Backend Logs:**
```
[POWER_TRACKING] Ingested switch event: IOT_Lab GPIO16=ON (40W)
[LedgerGeneration] Processing 2 unprocessed events
[LedgerGeneration] Created ledger entry: delta_wh=100, cost=₹0.75
```

2. **Verify Power Ratings in Database:**
```bash
mongo autovolt
db.devices.find({}, {"name": 1, "switches.name": 1, "switches.powerRating": 1}).pretty()
```
Should show non-zero values

3. **Check Services Running:**
```bash
# Backend logs should show:
[TelemetryIngestionService] Service initialized
[LedgerGenerationService] Service initialized (processing every 30s)
[AggregationService] Service initialized
```

4. **Verify Cost Version:**
```bash
db.cost_versions.find().pretty()
```
Should show cost_per_kwh: 7.5

---

## 📁 Files Modified/Created

### Modified:
- ✅ `backend/server.js` (lines 425-503) - Added TelemetryEvent ingestion

### Created:
- ✅ `backend/scripts/configure_power_ratings.cjs` - Power rating configuration tool
- ✅ `POWER_CONSUMPTION_ARCHITECTURE.md` - System architecture documentation
- ✅ `POWER_CONSUMPTION_FIX_SUMMARY.md` - This document

---

## 🎓 Key Learnings

### 1. **Power Calculation Location**
**Answer**: Power is calculated in the **BACKEND SERVER**, not ESP32

### 2. **Calculation Method**
**Time-based estimation**:
```
Energy (Wh) = Power Rating (W) × Duration (hours)
Cost (₹) = Energy (kWh) × Cost per kWh
```

### 3. **ESP32 Role**
- Controls relays (ON/OFF)
- Publishes switch events to MQTT
- Does NOT measure actual power

### 4. **Backend Role**
- Receives switch events
- Pairs ON/OFF events
- Calculates duration
- Applies power ratings
- Computes energy & cost

### 5. **Data Flow**
ESP32 → MQTT → Backend MQTT Handler → Telemetry Ingestion → Ledger Generation → Aggregation → Dashboard

---

## ✅ System Status

| Component | Status | Notes |
|-----------|--------|-------|
| ESP32 Firmware | 🟢 Working | Publishing switch_event correctly |
| MQTT Broker | 🟢 Working | Messages flowing |
| Backend MQTT Handler | 🟢 **FIXED** | Now ingests to power system |
| Power Ratings | 🟢 **CONFIGURED** | 29 switches, 2kW total |
| Cost Version | 🟢 **CREATED** | ₹7.50/kWh |
| Telemetry Ingestion | 🟡 **Pending Restart** | Service ready |
| Ledger Generation | 🟡 **Pending Restart** | Service ready |
| Aggregation | 🟡 **Pending Restart** | Service ready |
| Frontend | 🟢 Working | Ready to display data |

---

## 🚀 Final Checklist

- [x] Fix MQTT handler to ingest switch events
- [x] Configure power ratings for all switches
- [x] Create cost version (₹7.50/kWh)
- [ ] **Restart backend server**
- [ ] Test by toggling switches
- [ ] Verify data in MongoDB
- [ ] Check dashboard showing values

---

## 📞 Support

If power consumption still shows 0 after following all steps:

1. Check backend terminal for error messages
2. Verify MongoDB collections have data
3. Check ESP32 serial monitor for MQTT publishes
4. Review `POWER_CONSUMPTION_ARCHITECTURE.md` for detailed flow
5. Run `backend/scripts/check_new_collections.cjs` for diagnostics

---

**Status**: ✅ **POWER TRACKING SYSTEM READY**  
**Action Required**: Restart backend server and test

---

*Generated: November 5, 2025*  
*System: AutoVolt Classroom Automation*
