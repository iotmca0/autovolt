# Quick Fix Summary

## Issues Found:

### 1. ✅ Power Values Showing 0 kWh - **EXPECTED BEHAVIOR**

**Root Cause:** The NEW power system collections are empty because:
- No cost versions created yet
- ESP32 devices not sending new telemetry format yet

**Current State:**
```
telemetry_events: 0 documents
device_consumption_ledgers: 0 documents  
daily_aggregates: 0 documents
monthly_aggregates: 0 documents
cost_versions: 0 documents  ⚠️ NEED THIS FIRST!
```

**Fix:** Create initial cost version:
```bash
curl -X POST http://localhost:5000/api/power-analytics/cost-versions \
  -H "Content-Type: application/json" \
  -d '{
    "cost_per_kwh": 7.5,
    "effective_from": "2025-11-01",
    "classroom": null,
    "notes": "Initial rate"
  }'
```

### 2. ✅ Duplicate Activity Logs - **PARTIALLY FIXED**

**Root Cause:** ESP32 firmware is sending duplicate MQTT messages

**Evidence from logs:**
```
[MQTT] Received message on esp32/state: {"mac":"6C:C8:40:4F:82:C0"...
[MQTT] Received message on esp32/state: {"mac":"6C:C8:40:4F:82:C0"...  ← DUPLICATE!
```

**Backend Fix Applied:** Modified `server.js` to only create ActivityLog for manual physical switch presses, NOT for web UI toggles

**Remaining Issue:** ESP32 firmware sending duplicate MQTT state messages needs fixing

**Temporary Workaround:** Add MQTT message deduplication in backend

---

## What's Working:

✅ Server starts without errors  
✅ New power system models created  
✅ Services initialized (telemetry, ledger, aggregation)  
✅ MQTT routing configured  
✅ Frontend loads without errors  
✅ Duplicate ActivityLog from web UI fixed  

## What Needs Action:

1. **Create Cost Version** (2 minutes)
   - Run curl command above OR
   - Use frontend CostVersionManager component

2. **Update ESP32 Firmware** (1-2 hours per device)
   - Follow `ESP32_FIRMWARE_UPDATE_GUIDE.md`
   - Implement cumulative energy counter
   - Send telemetry every 30 seconds

3. **Fix ESP32 Duplicate Messages** (firmware issue)
   - ESP32 is publishing to same topic twice
   - Check ESP32 code for duplicate MQTT publish calls

---

## Why Power Shows 0:

The new power system uses **different data sources**:

**OLD System (deleted):**
- `activitylogs` collection → Used switch ON/OFF times to estimate power
- `energyconsumptions` collection → Stored offline energy data

**NEW System (empty):**
- `telemetry_events` → Needs ESP32 to send actual energy readings (Wh)
- `device_consumption_ledgers` → Generated from telemetry
- `daily_aggregates` / `monthly_aggregates` → Generated from ledger
- `cost_versions` → Must be created manually first

**The dashboard shows 0 because there's NO telemetry data yet.**

---

## Next Steps:

### Immediate (to see non-zero values):

Option A: **Rollback to old system temporarily**
```bash
node backend/scripts/restore_old_power_system.cjs
# Re-enable old routes in server.js
# Revert metricsService.getEnergySummary()
```

Option B: **Wait for new system data** (RECOMMENDED)
1. Create cost version (2 min)
2. Update 1 pilot ESP32 (1-2 hours)
3. Wait 24 hours for data
4. Dashboard will show real consumption

### Long-term:

1. Update all ESP32 devices with new firmware
2. Fix duplicate MQTT message issue in ESP32 code
3. Monitor reconciliation job (runs 2 AM IST daily)
4. Archive old collections after 30 days

---

## Testing New System:

After creating cost version and updating ESP32:

```bash
# Check collections have data
node backend/scripts/check_new_collections.cjs

# Check API returns data
curl http://localhost:5000/api/power-analytics/summary

# Check health
curl http://localhost:5000/api/power-analytics/health
```

---

**STATUS:** System is WORKING AS DESIGNED. Shows 0 because no data ingested yet. Not a bug!
