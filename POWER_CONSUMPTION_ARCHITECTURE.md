# ⚡ Power Consumption Architecture - How It Works

## 🎯 Answer: Where Power is Calculated?

**Power consumption is calculated in the BACKEND SERVER**, not in the ESP32.

## 🏗️ Architecture Overview

```
┌─────────────────┐
│     ESP32       │
│  (No Sensors)   │
└────────┬────────┘
         │ Publishes MQTT switch_event
         │ Topic: esp32/telemetry
         │
         ▼
┌─────────────────────────────────────────┐
│          MQTT Broker (Mosquitto)        │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│      Backend Server (Node.js)           │
│                                         │
│  ┌────────────────────────────────┐   │
│  │  telemetryIngestionService     │   │
│  │  Receives switch_event         │   │
│  │  Stores → TelemetryEvent       │   │
│  └──────────┬─────────────────────┘   │
│             │                          │
│             ▼                          │
│  ┌────────────────────────────────┐   │
│  │  ledgerGenerationService       │   │
│  │  Pairs ON/OFF events           │   │
│  │  Calculates:                   │   │
│  │  duration = OFF_time - ON_time │   │
│  │  energy_wh = power_rating ×    │   │
│  │             duration_hours     │   │
│  │  Stores → DeviceConsumption    │   │
│  │           Ledger               │   │
│  └──────────┬─────────────────────┘   │
│             │                          │
│             ▼                          │
│  ┌────────────────────────────────┐   │
│  │  aggregationService            │   │
│  │  Groups by day/month           │   │
│  │  Stores → DailyAggregate       │   │
│  │         → MonthlyAggregate     │   │
│  └──────────┬─────────────────────┘   │
│             │                          │
│             ▼                          │
│  ┌────────────────────────────────┐   │
│  │  metricsService                │   │
│  │  getEnergySummary()            │   │
│  │  Returns kWh + ₹ cost          │   │
│  └────────────────────────────────┘   │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   Frontend      │
│   Dashboard     │
│   Shows kWh     │
└─────────────────┘
```

## 📊 Power Calculation Formula

### Time-Based Estimation (Current Method)

```javascript
// For each switch ON/OFF pair:
duration_seconds = off_timestamp - on_timestamp
duration_hours = duration_seconds / 3600
power_watts = device.switches[gpio].powerRating  // From DB
energy_wh = power_watts × duration_hours
energy_kwh = energy_wh / 1000
cost_inr = energy_kwh × cost_per_kwh  // ₹7.50/kWh
```

### Example Calculation

**Switch 1: LED Bulb (40W)**
- Turned ON: 10:00:00 AM
- Turned OFF: 12:30:00 PM
- Duration: 2.5 hours
- Energy: 40W × 2.5h = 100 Wh = 0.1 kWh
- Cost: 0.1 kWh × ₹7.50 = ₹0.75

**Switch 2: Projector (200W)**
- Turned ON: 9:00:00 AM
- Turned OFF: 11:00:00 AM
- Duration: 2 hours
- Energy: 200W × 2h = 400 Wh = 0.4 kWh
- Cost: 0.4 kWh × ₹7.50 = ₹3.00

## 🔧 What ESP32 Does

### ESP32 Responsibilities:
✅ Controls relays (ON/OFF)
✅ Handles manual switches
✅ Handles motion sensors
✅ **Publishes switch_event when state changes**

### ESP32 Does NOT:
❌ Measure actual current/voltage
❌ Calculate power consumption
❌ Track energy usage
❌ Calculate costs

### Switch Event Format (ESP32 → Backend)

```json
{
  "mac": "6C:C8:40:4F:82:C0",
  "secret": "your-device-secret",
  "type": "switch_event",
  "gpio": 16,
  "state": true,
  "source": "manual",
  "timestamp": 1730812345000
}
```

Published to: `esp32/telemetry` topic

## 💾 What Backend Does

### Backend Responsibilities:
✅ Receives switch events via MQTT
✅ Stores events in `TelemetryEvent` collection
✅ Pairs ON/OFF events
✅ **Calculates power using configured power ratings**
✅ Applies cost per kWh rate
✅ Aggregates daily/monthly totals
✅ Serves data to frontend

### Data Flow:

1. **TelemetryEvent** (raw events)
   ```json
   {
     "esp32_name": "Lab_ESP32",
     "device_id": "6c:c8:40:4f:82:c0",
     "timestamp": 1730812345000,
     "payload": {
       "gpio": 16,
       "state": true,
       "source": "manual"
     }
   }
   ```

2. **DeviceConsumptionLedger** (paired ON/OFF)
   ```json
   {
     "esp32_name": "Lab_ESP32",
     "device_id": "6c:c8:40:4f:82:c0",
     "start_ts": 1730812345000,
     "end_ts": 1730821345000,
     "duration_seconds": 9000,
     "delta_wh": 100,  // 40W × 2.5h
     "cost_calculation": {
       "cost_per_kwh": 7.5,
       "cost_inr": 0.75
     }
   }
   ```

3. **DailyAggregate** (daily totals)
   ```json
   {
     "date_str": "2025-11-05",
     "esp32_name": "Lab_ESP32",
     "total_wh": 2400,  // 2.4 kWh
     "total_cost_inr": 18.00,  // ₹18.00
     "switch_breakdown": {
       "16": { "wh": 100, "cost": 0.75 },
       "17": { "wh": 400, "cost": 3.00 }
     }
   }
   ```

## 🔍 Why You're Seeing 0 kWh

### Current Problems:

1. **❌ No Power Ratings Configured**
   - Each switch needs a `powerRating` field in the database
   - Without this, backend calculates: `0W × time = 0 Wh`

2. **❌ No Cost Version Created**
   - `CostVersion` collection is empty
   - Backend can't calculate cost without ₹/kWh rate

3. **❌ New Collections Empty**
   - `TelemetryEvent`: 0 documents
   - `DeviceConsumptionLedger`: 0 documents
   - `DailyAggregate`: 0 documents
   - No data = 0 kWh (expected!)

## ✅ How to Fix

### Step 1: Configure Power Ratings

Run this script to set power ratings for your devices:

```bash
node backend/scripts/configure_power_ratings.cjs
```

This will add power ratings like:
- Switch 1 (GPIO 16): 40W (LED bulb)
- Switch 2 (GPIO 17): 60W (Fan)
- Switch 3 (GPIO 18): 200W (Projector)
- Switch 4 (GPIO 19): 40W (LED panel)
- Switch 5 (GPIO 21): 1500W (AC unit)
- Switch 6 (GPIO 22): 100W (Computer)

### Step 2: Create Cost Version

```bash
node backend/scripts/create_initial_cost_version.cjs
```

Creates: ₹7.50 per kWh rate

### Step 3: Verify ESP32 Publishing

Check ESP32 serial monitor - should see:
```
[CMD] Applied: GPIO 16 -> ON
[TELEM] Published switch_event gpio=16 source=manual
```

### Step 4: Toggle Some Switches

Use the web UI to toggle switches ON and OFF. Each toggle creates:
- 1 TelemetryEvent (ON)
- 1 TelemetryEvent (OFF)
- 1 DeviceConsumptionLedger (paired)

### Step 5: Wait for Aggregation

Backend runs aggregation every 30 seconds. After a few minutes:
- Check `DailyAggregate` collection
- Refresh frontend dashboard
- Should see kWh and cost values

## 🎯 Accuracy

### Time-Based Method (Current):
- **Accuracy**: ±10-20%
- **Pros**: 
  - No hardware needed
  - Easy to implement
  - Good for estimation
- **Cons**:
  - Assumes constant power rating
  - Doesn't account for actual load
  - Can't detect partial loads (dimmed lights)

### Hardware Method (Alternative):
- **Accuracy**: ±2-5%
- **Requires**: ACS712 or PZEM-004T current sensor
- **Pros**:
  - Measures actual consumption
  - Detects partial loads
  - Very accurate
- **Cons**:
  - Hardware modification needed
  - More complex firmware
  - Higher cost

## 📝 Summary

**WHERE**: Power consumption is calculated in the **BACKEND SERVER**

**HOW**: Time-based estimation using:
```
Energy = Power Rating (W) × Time ON (hours)
Cost = Energy (kWh) × Cost per kWh (₹)
```

**WHAT ESP32 DOES**: Publishes switch ON/OFF events with timestamps

**WHAT BACKEND DOES**: Calculates duration, applies power rating, computes cost

**WHY 0 kWh**: No power ratings configured + no cost version + no data yet

**FIX**: Configure power ratings → Create cost version → Toggle switches → See results
