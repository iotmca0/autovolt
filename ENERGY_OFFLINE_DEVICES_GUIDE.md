# Energy Consumption & Offline Devices - User Guide

## 📊 How Energy Tracking Works

### When Devices Are ONLINE ✅
```
Device Status: 🟢 Online
Energy Tracking: ✅ Active
What's Tracked:
  - Real-time power consumption from active switches
  - Activity logs for every switch ON/OFF event
  - Telemetry data with timestamps
  - Hourly/daily/monthly aggregations
```

### When Devices Go OFFLINE ⚪
```
Device Status: ⚪ Offline
Energy Tracking: ⏸️ Paused
What Happens:
  - Historical data PRESERVED in database
  - Current consumption stops immediately
  - No new activity logs created
  - Aggregates remain intact
  - Frontend shows historical data
```

## 🔍 Understanding the User Interface

### Energy Cards Display Rules

**Daily Consumption Card**
- Shows: Total kWh consumed TODAY
- Includes: Both online and offline devices' historical consumption
- Formula: Sum of all activity logs from start of day until now
- **Important**: If devices went offline at 2 PM, consumption only counts until 2 PM

**Monthly Consumption Card**
- Shows: Total kWh consumed THIS MONTH
- Includes: All days from start of month to now
- Source: MonthlyAggregate collection OR calculated from activity logs
- **Important**: Offline periods contribute ZERO consumption

### Device Status Indicators

| Icon | Status | Meaning |
|------|--------|---------|
| 🟢 | Online | Device is connected and tracking consumption |
| ⚪ | Offline | Device is disconnected, showing historical data only |

## ❓ Common Questions

### Q1: Why does consumption show less after devices went offline?
**Answer**: This is **correct and expected behavior**. When devices go offline:
- Energy consumption actually STOPS (physically)
- The system accurately reflects this by stopping consumption tracking
- Historical data from BEFORE offline is still preserved and displayed

**Example Scenario**:
```
Morning (8 AM - 12 PM):
  - All devices online
  - Fans/Lights consuming power
  - Dashboard shows: 5.2 kWh

Afternoon (12 PM):
  - Internet/power outage
  - All devices go offline
  - Physical consumption stops

Evening (6 PM):
  - Check dashboard
  - Still shows: 5.2 kWh (unchanged since 12 PM)
  - This is CORRECT - no consumption happened while offline
```

### Q2: Is historical data lost when devices go offline?
**Answer**: **NO** - Historical data is permanently preserved in:

1. **ActivityLog Collection**
   - Every switch ON/OFF event
   - Every device online/offline event
   - Timestamps and power consumption values

2. **DailyAggregate Collection**
   - Daily summaries per device/classroom
   - Total kWh, cost, runtime hours
   - Persisted forever

3. **MonthlyAggregate Collection**
   - Monthly summaries per device/classroom
   - Day-by-day breakdown
   - Persisted forever

### Q3: What happens when devices come back online?
**Answer**: Consumption tracking **resumes immediately**:
```
Device Reconnects (8 PM):
  - Status changes to 🟢 Online
  - Activity logging starts again
  - Switches that are ON start consuming power
  - Dashboard updates in real-time
  
Next Day Check (9 AM):
  - Yesterday's data shows: 5.2 kWh (until 12 PM offline)
  - Today's data shows: NEW consumption from 8 PM onwards
```

### Q4: Why do switches show "ON" when device is offline?
**Answer**: The switch **state** (ON/OFF) is stored separately from **actual consumption**:

```
Switch State:     🔵 ON   (database record)
Device Status:    ⚪ Offline
Power Consumption: 0W     (not connected)
Tracked Energy:   0 kWh  (no consumption)
```

When the device comes back online:
```
Switch State:     🔵 ON   (still ON)
Device Status:    🟢 Online
Power Consumption: 60W    (fan running)
Tracked Energy:   ✅ Starts accumulating
```

## 🛠️ Troubleshooting

### Issue: "Historical data disappeared after devices went offline"

**Diagnosis Steps**:

1. **Check if data actually disappeared or just stopped growing**
   ```bash
   # Run debug script
   cd backend
   node debug_energy_offline.js
   ```
   - Look for "CALCULATED CONSUMPTION FROM ACTIVITY LOGS"
   - If it shows kWh > 0, historical data exists

2. **Verify aggregates are running**
   ```bash
   # Check last aggregation time
   mongo iot-classroom-automation
   db.daily_aggregates.find().sort({date_string:-1}).limit(1)
   db.monthly_aggregates.find().sort({year:-1,month:-1}).limit(1)
   ```

3. **Check frontend API calls**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Look for `/api/analytics/energy-summary`
   - Check response data

4. **Manual refresh**
   - Clear browser cache (Ctrl+Shift+Delete)
   - Hard refresh page (Ctrl+F5)
   - Re-login to app

### Issue: "Consumption shows 0 kWh even though devices were ON before offline"

**Possible Causes**:

1. **Aggregation job not running**
   ```bash
   # Manually run aggregation
   cd backend
   node aggregate_energy.js
   ```

2. **Activity logs missing**
   ```bash
   # Check activity log count
   mongo iot-classroom-automation
   db.activity_logs.countDocuments()
   db.activity_logs.find({action:{$in:['on','off','switch_on','switch_off']}}).limit(5)
   ```

3. **Database connection issue**
   - Check backend logs: `tail -f backend/logs/app.log`
   - Verify MongoDB is running: `systemctl status mongod`

## 📈 Expected Behavior Examples

### Scenario A: Normal Operation
```
Time    | Status   | Consumption | Cumulative
--------|----------|-------------|------------
8 AM    | 🟢 Online | 0.5 kWh     | 0.5 kWh
10 AM   | 🟢 Online | 1.2 kWh     | 1.7 kWh
12 PM   | 🟢 Online | 0.8 kWh     | 2.5 kWh
2 PM    | 🟢 Online | 1.0 kWh     | 3.5 kWh

Dashboard at 3 PM: 3.5 kWh ✅
```

### Scenario B: Devices Go Offline
```
Time    | Status    | Consumption | Cumulative
--------|-----------|-------------|------------
8 AM    | 🟢 Online  | 0.5 kWh     | 0.5 kWh
10 AM   | 🟢 Online  | 1.2 kWh     | 1.7 kWh
12 PM   | ⚪ OFFLINE | 0 kWh       | 1.7 kWh
2 PM    | ⚪ Offline | 0 kWh       | 1.7 kWh

Dashboard at 3 PM: 1.7 kWh ✅ (not lost, just stopped)
```

### Scenario C: Devices Come Back Online
```
Time    | Status    | Consumption | Cumulative
--------|-----------|-------------|------------
8 AM    | 🟢 Online  | 0.5 kWh     | 0.5 kWh
10 AM   | 🟢 Online  | 1.2 kWh     | 1.7 kWh
12 PM   | ⚪ Offline | 0 kWh       | 1.7 kWh
2 PM    | ⚪ Offline | 0 kWh       | 1.7 kWh
4 PM    | 🟢 Online  | 0.8 kWh     | 2.5 kWh
6 PM    | 🟢 Online  | 1.3 kWh     | 3.8 kWh

Dashboard at 7 PM: 3.8 kWh ✅ (resumed tracking)
```

## 🔧 Developer Notes

### Backend Logic

**Energy Calculation Priority** (backend/metricsService.js):
1. **Primary Source**: DailyAggregate/MonthlyAggregate collections
   - Pre-calculated summaries
   - Faster queries
   - Includes devices that were online during the period

2. **Fallback Source**: ActivityLog + calculatePreciseEnergyConsumption()
   - When aggregates don't exist
   - Reconstructs from switch on/off events
   - Respects device online/offline status from activity logs

**Key Function**: `calculatePreciseEnergyConsumption(deviceId, startTime, endTime)`
```javascript
// Logic:
// 1. Fetch all switch on/off events in time period
// 2. Fetch all device online/offline events
// 3. Only count consumption when device was ONLINE
// 4. Stop counting when device goes OFFLINE
// 5. Resume counting when device comes back ONLINE
```

### Frontend Filtering

**Energy Dashboard** (src/components/EnergyMonitoringDashboard.tsx):
- Fetches ALL devices (online + offline) from `/api/analytics/dashboard`
- Displays device status indicators (🟢 / ⚪)
- Allows filtering by offline devices (shows ⚪ in dropdown)
- Historical data for offline devices is queryable and displayed

**API Endpoints**:
- `GET /api/analytics/energy-summary` - Does NOT filter by online status
- `GET /api/analytics/energy-breakdown/hourly` - Does NOT filter by online status
- `GET /api/analytics/energy-breakdown/monthly` - Does NOT filter by online status

**Chart Behavior**:
- Shows consumption for ALL devices (online + offline)
- Offline devices show historical consumption up until they went offline
- No estimation is made for offline periods

## 📚 Related Files

### Backend
- `backend/metricsService.js` - Core calculation logic
- `backend/routes/analytics.js` - API endpoints
- `backend/services/energyBreakdownService.js` - Hourly/daily/monthly breakdowns
- `backend/models/DailyAggregate.js` - Daily summary schema
- `backend/models/MonthlyAggregate.js` - Monthly summary schema
- `backend/models/ActivityLog.js` - Event tracking schema

### Frontend
- `src/components/EnergyMonitoringDashboard.tsx` - Main energy UI
- `src/components/EnergyCharts.tsx` - Chart visualizations
- `src/services/api.ts` - API client (energyAPI methods)

### Scripts
- `backend/aggregate_energy.js` - Manual aggregation trigger
- `backend/debug_energy_offline.js` - Diagnostic tool (new)

## ✅ System Health Checklist

Run this checklist if energy data seems incorrect:

- [ ] MongoDB is running and accessible
- [ ] Backend server is running (port 3001)
- [ ] Aggregation job scheduled (cron or manual)
- [ ] ActivityLog collection has recent events
- [ ] DailyAggregate collection has today's date
- [ ] MonthlyAggregate collection has current month
- [ ] Device status shows correct online/offline state
- [ ] Frontend API calls return 200 status codes
- [ ] Browser console has no errors
- [ ] No CORS or authentication issues

## 🎯 Summary

**Energy consumption tracking is working correctly if**:
✅ Historical data is preserved when devices go offline
✅ Consumption stops accumulating when devices are offline
✅ Consumption resumes when devices come back online
✅ Dashboard shows accurate cumulative totals
✅ Device status indicators match physical device state

**What is NOT a bug**:
- Consumption showing same value while devices are offline
- No new consumption added during offline period
- Charts showing flat line during offline period
- Offline devices showing lower consumption than expected

**What IS a bug**:
- Historical data completely disappearing
- Consumption showing 0 when devices were online for hours
- Activity logs missing switch events
- Aggregates not being created daily
- API returning errors or empty responses
