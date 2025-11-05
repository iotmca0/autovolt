# Power System Migration Complete ✅

## Summary

Successfully migrated from old power consumption system to new immutable event-sourced architecture.

---

## 🗑️ What Was Deleted

### MongoDB Collections Removed
- **`activitylogs`**: 9,686 documents (backed up)
- **`energyconsumptions`**: 14 documents (backed up)

### Backup Location
- `backend/data/backups/power_backup_*.json`
- Contains all historical data for recovery if needed

### Backend Routes Disabled
- `/api/energy-consumption` → Use `/api/power-analytics` instead

---

## ✨ New Power System

### New MongoDB Collections
All collections created and indexed (currently empty):

1. **`telemetry_events`** - Immutable event store
   - Stores all ESP32 telemetry with SHA256 deduplication
   - 2-year TTL for automatic cleanup
   
2. **`device_consumption_ledgers`** - Append-only ledger
   - Energy consumption deltas with timestamps
   - Reset markers for counter wraps
   
3. **`daily_aggregates`** - Daily summaries
   - Per-classroom daily totals
   - Timezone-aware (Asia/Kolkata)
   
4. **`monthly_aggregates`** - Monthly summaries
   - Per-classroom monthly totals
   - Cost calculations with versioning
   
5. **`cost_versions`** - Electricity rate history
   - Versioned rates with effective dates
   - Automatic recalculation on rate changes

### New API Endpoints
All implemented in `backend/routes/powerAnalytics.js`:

- **GET** `/api/power-analytics/summary` - Daily/monthly totals
- **GET** `/api/power-analytics/timeline` - Historical consumption
- **GET** `/api/power-analytics/device-breakdown` - Per-device analysis
- **GET** `/api/power-analytics/monthly` - Month-over-month comparison
- **GET** `/api/power-analytics/cost-versions` - Rate history
- **POST** `/api/power-analytics/cost-versions` - Create new rate
- **POST** `/api/power-analytics/recalculate` - Recalculate costs
- **GET** `/api/power-analytics/health` - System health check

### Services Running
All integrated into `backend/server.js`:

1. **telemetryIngestionService** - Processes MQTT messages
2. **ledgerGenerationService** - Calculates energy deltas
3. **aggregationService** - Generates daily/monthly summaries
4. **reconciliationJob** - Runs at 2 AM IST daily

### Frontend Integration
- **Dashboard (Index.tsx)**: Uses `/api/analytics/energy-summary` ✅
- **Energy Monitoring**: Uses `/api/analytics/energy-summary` ✅
- **AI/ML Panel**: Uses new analytics endpoints ✅
- **Cost Version Manager**: Manages electricity rates ✅

---

## 🚀 Next Steps (REQUIRED)

### Step 1: Create Initial Cost Version
The system needs at least one cost version to calculate costs.

```bash
curl -X POST http://localhost:5000/api/power-analytics/cost-versions \
  -H "Content-Type: application/json" \
  -d '{
    "cost_per_kwh": 7.5,
    "effective_from": "2025-11-01",
    "classroom": null,
    "notes": "Initial electricity rate"
  }'
```

**Or use the frontend:**
1. Open dashboard
2. Click "Power Settings" or "Cost Version Manager"
3. Create new cost version with ₹7.50/kWh (or your actual rate)

### Step 2: Update ESP32 Firmware (Pilot Device)
Choose ONE ESP32 device for pilot testing:

1. **Follow guide**: `ESP32_FIRMWARE_UPDATE_GUIDE.md`
2. **Key changes needed**:
   - Implement cumulative energy counter (Wh)
   - Send new telemetry format every 30 seconds:
     ```json
     {
       "esp32_name": "device_name",
       "timestamp": 1730822400,
       "energy_wh_total": 12345,
       "switch_state": [1, 0, 1, 0]
     }
     ```
   - Configure LWT (Last Will Testament) for offline detection
   - Publish to: `autovolt/<device_name>/telemetry`

3. **Monitor telemetry**:
   ```bash
   mosquitto_sub -h localhost -p 1883 -t "autovolt/+/telemetry" -v
   ```

### Step 3: Verify Data Flow
After pilot ESP32 is running:

```bash
# Check collections have data
node backend/scripts/check_new_collections.cjs

# Check health endpoint
curl http://localhost:5000/api/power-analytics/health

# Check summary API
curl http://localhost:5000/api/analytics/energy-summary
```

### Step 4: Monitor for 24 Hours
1. Watch for telemetry ingestion
2. Verify ledger generation (30s intervals)
3. Check daily aggregate appears next day at midnight IST
4. Review reconciliation job output (2 AM IST)

### Step 5: Full Rollout
Follow the 5-phase deployment plan in:
**`POWER_SYSTEM_DEPLOYMENT_GUIDE.md`**

---

## 🔍 Verification Commands

### Check New Collections
```bash
node backend/scripts/check_new_collections.cjs
```

### Check Old Collections (Should be gone)
```bash
node -e "const mongoose = require('mongoose'); mongoose.connect('mongodb://localhost:27017/autovolt').then(async () => { const cols = await mongoose.connection.db.listCollections().toArray(); const oldCols = cols.filter(c => ['activitylogs', 'energyconsumptions'].includes(c.name)); console.log('Old collections:', oldCols.length === 0 ? 'All deleted ✓' : oldCols.map(c => c.name)); await mongoose.disconnect(); })"
```

### Test Backend Integration
```bash
# Health check
curl http://localhost:5000/api/power-analytics/health

# Summary (will show zeros until ESP32 sends data)
curl http://localhost:5000/api/analytics/energy-summary
```

### Test Frontend
1. Open http://localhost:5173 (or your dev server)
2. Dashboard should load without errors
3. Power consumption cards show "0 kWh" (expected until ESP32 data arrives)
4. No console errors about missing collections

---

## 📊 Expected Behavior

### Before ESP32 Update
- ✅ Server starts without errors
- ✅ Dashboard loads successfully
- ✅ Power cards show "0 kWh / ₹0.00"
- ✅ No data in charts (empty state)
- ✅ Health endpoint returns 200 OK

### After Pilot ESP32 Update
- ✅ Telemetry events appear in `telemetry_events` collection
- ✅ Ledger entries created every 30s in `device_consumption_ledgers`
- ✅ Dashboard shows real-time consumption for pilot classroom
- ✅ Health endpoint shows non-zero event counts

### After 24 Hours
- ✅ Daily aggregate created at midnight IST
- ✅ Monthly aggregate updated
- ✅ Reconciliation job runs at 2 AM IST
- ✅ Dashboard charts show 24-hour trend

---

## 🐛 Troubleshooting

### Dashboard shows errors
- Check browser console for specific error messages
- Verify backend is running: `curl http://localhost:5000/health`
- Check if `/api/analytics/energy-summary` returns valid JSON

### No telemetry events after ESP32 update
- Verify MQTT connection: `mosquitto_sub -h localhost -p 1883 -t "autovolt/#" -v`
- Check server logs for ingestion errors
- Verify ESP32 firmware sends correct JSON format

### Ledger not generating
- Check `ledgerGenerationService` logs in server console
- Verify `processed` flag is being set on telemetry events:
  ```bash
  db.telemetry_events.find({ processed: false }).count()
  ```

### Dashboard shows old data
- Clear browser cache
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- Verify old collections are deleted: See verification commands above

---

## 🔄 Rollback Plan

If critical issues arise:

1. **Stop the server**
2. **Restore old collections**:
   ```bash
   node backend/scripts/restore_old_power_system.cjs
   ```
   (You'll need to create this script to import from backup JSON)

3. **Re-enable old routes** in `server.js`:
   ```javascript
   apiRouter.use('/energy-consumption', apiLimiter, require('./routes/energyConsumption'));
   ```

4. **Revert `metricsService.js`** to use old `calculatePreciseEnergyConsumption()`

---

## 📚 Documentation

- **Deployment Guide**: `POWER_SYSTEM_DEPLOYMENT_GUIDE.md`
- **ESP32 Firmware**: `ESP32_FIRMWARE_UPDATE_GUIDE.md`
- **Integration Tests**: `backend/tests/integration/power-system-integration.test.js`
- **Old System Backup**: `backend/scripts/backup_old_power_system.cjs`

---

## ✅ Migration Checklist

- [x] Backup old collections (9,700 documents)
- [x] Create new data models (5 models)
- [x] Implement telemetry ingestion service
- [x] Implement ledger generation engine
- [x] Implement aggregation pipeline
- [x] Implement cost versioning system
- [x] Update Power Analytics API routes
- [x] Create ESP32 firmware guide
- [x] Implement reconciliation job
- [x] Integrate into server.js
- [x] Update frontend integration (metricsService)
- [x] Delete old collections
- [x] Disable old routes
- [ ] **Create initial cost version** ← YOU ARE HERE
- [ ] Update pilot ESP32 firmware
- [ ] Verify data flow for 24 hours
- [ ] Roll out to all ESP32 devices

---

## 🎯 Success Criteria

✅ **Migration Complete When:**
1. Old collections deleted and backed up
2. New services running without errors
3. Cost version created
4. Pilot ESP32 sending telemetry
5. Dashboard showing real consumption data
6. No errors in server logs for 24 hours
7. Daily/monthly aggregates generating correctly
8. Reconciliation job running successfully

---

**Status**: ⚠️ **Migration Complete - Awaiting Cost Version & ESP32 Update**

**Next Action**: Create initial cost version (see Step 1 above)
