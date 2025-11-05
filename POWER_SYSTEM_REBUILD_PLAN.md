# AutoVolt Power Consumption System Rebuild - Implementation Plan

## 🎯 Current Status

**Date:** November 5, 2025
**Phase:** Data Models & Ingestion Service Created
**System:** Running (backend on port 3001, frontend on port 5173)

## ⚠️ CRITICAL NOTES

This is a **MAJOR REFACTORING** that completely rebuilds the power consumption tracking system. The old system will remain operational during migration.

### Backup Status
✅ Old system backed up to: `backend/scripts/backup_old_power_system/`
- 14 EnergyConsumption documents
- 7284 ActivityLog documents with power data

## 📦 Components Created (Phase 1)

### 1. New Data Models ✅
- **TelemetryEvent.js** - Immutable event store for all incoming telemetry
- **DeviceConsumptionLedger.js** - Append-only ledger (single source of truth)
- **CostVersion.js** - Electricity rate versioning with effective dates
- **DailyAggregate.js** - Pre-computed daily totals
- **MonthlyAggregate.js** - Pre-computed monthly totals

### 2. Telemetry Ingestion Service ✅
- **telemetryIngestionService.js** - MQTT message handler with:
  - Deduplication (hash-based)
  - Quality checks (time drift, out-of-order, gaps)
  - Immutable event storage
  - QoS 1 support

## 📋 Remaining Components (Phases 2-10)

### Phase 2: Ledger Generation Engine 🔨
**File:** `backend/services/ledgerGenerationService.js`

**Responsibilities:**
- Process unprocessed telemetry events
- Calculate energy deltas:
  - **Cumulative meter method**: `delta = new.energy_wh_total - last.energy_wh_total`
  - **Power integration method**: `delta = power_w * (t2 - t1 in hours)`
- Handle switch state logic (only count when switch is ON)
- Detect firmware resets (cumulative counter wraps)
- Create ledger entries with cost calculation
- Link back to raw telemetry events

**Key Functions:**
```javascript
async processEvent(event) {
  // Get last ledger entry
  // Detect reset
  // Calculate delta
  // Apply switch state filter
  // Get cost rate
  // Create ledger entry
  // Mark event as processed
}

async detectReset(event, lastEntry) {
  // Check if energy_wh_total < last.energy_wh_total
  // Create reset marker
}

async calculateDelta(event, lastEntry, method) {
  // Cumulative: new - old
  // Power integration: power * time
}
```

### Phase 3: Aggregation Pipeline 🔨
**File:** `backend/services/aggregationService.js`

**Responsibilities:**
- Read from device_consumption_ledger
- Generate timezone-aware daily/monthly aggregates
- Handle Asia/Kolkata timezone (UTC+5:30)
- Quality metrics summary
- Store to daily_aggregates and monthly_aggregates

**Key Functions:**
```javascript
async aggregateDaily(date, classroom = null) {
  // Get ledger entries for date range
  // Group by device_id
  // Sum delta_wh, on_time_sec, cost
  // Store to daily_aggregates
}

async aggregateMonthly(year, month, classroom = null) {
  // Can use daily_aggregates or ledger
  // Group by device_id
  // Store to monthly_aggregates
}
```

### Phase 4: Reconciliation Job 🔨
**File:** `backend/jobs/reconciliationJob.js`

**Responsibilities:**
- Run nightly
- Detect anomalies:
  - Negative deltas
  - Missing heartbeats
  - Large gaps (> 10 min)
  - Out-of-order events
- Auto-fix safe issues
- Create review tickets for manual intervention
- Re-aggregate affected periods

**Schedule:** Cron job at 2:00 AM daily

### Phase 5: New Analytics API 🔨
**File:** `backend/routes/powerAnalytics.js`

**Endpoints:**
```
GET /api/power-analytics/summary
  ?classroom=CR-101&date=2025-11-05
  → Returns: daily totals from daily_aggregates

GET /api/power-analytics/timeline
  ?classroom=CR-101&start=2025-11-01&end=2025-11-05&bucket=60
  → Returns: time-series from ledger

GET /api/power-analytics/device-breakdown
  ?classroom=CR-101&date=2025-11-05
  → Returns: per-device consumption

GET /api/power-analytics/monthly
  ?classroom=CR-101&year=2025&month=11
  → Returns: monthly totals from monthly_aggregates

GET /api/power-analytics/cost-versions
  → Returns: cost rate history

POST /api/power-analytics/cost-versions
  body: { cost_per_kwh, effective_from, classroom, notes }
  → Create new cost version

GET /api/power-analytics/export-csv
  ?classroom=CR-101&start=2025-11-01&end=2025-11-30
  → Returns: CSV export
```

### Phase 6: ESP32 Firmware Updates 🔨
**Files:** `esp32/src/main.cpp`, `esp32/src/telemetry.cpp`

**Required Changes:**
1. Add cumulative energy counter (`energy_wh_total`)
2. Implement proper LWT (Last Will Testament)
3. Send heartbeat messages every 30 seconds
4. Include switch_state in telemetry
5. Add sequence numbers
6. Publish to new MQTT topics:
   - `autovolt/<esp32_name>/telemetry` (QoS 1)
   - `autovolt/<esp32_name>/status` (LWT, retained, QoS 1)
   - `autovolt/<esp32_name>/heartbeat` (QoS 1)

**Example Telemetry Payload:**
```json
{
  "esp32_name": "ESP01",
  "classroom": "CR-101",
  "device_id": "light_1",
  "timestamp": "2025-11-05T06:12:34Z",
  "power_w": 40,
  "energy_wh_total": 12345.67,
  "switch_state": {
    "sw1": true,
    "sw2": false
  },
  "uptime_seconds": 86400,
  "status": "online",
  "sequence_no": 12345,
  "firmware_ver": "v2.0.0",
  "wifi_rssi": -45
}
```

### Phase 7: Frontend Updates 🔨
**Files:**
- `src/components/EnergyMonitoringDashboard.tsx`
- `src/components/AnalyticsPanel.tsx`
- `src/components/CostVersionManager.tsx` (new)

**Changes:**
1. Update API calls to use new endpoints
2. Add cost version manager UI
3. Add "recalculate" button for historical data
4. Show quality indicators (confidence levels)
5. Add "estimated" labels for low-confidence data
6. Unified chart/card data source

### Phase 8: Migration Script 🔨
**File:** `backend/scripts/migrate_to_new_power_system.cjs`

**Process:**
1. Read old ActivityLog power consumption data
2. Create synthetic telemetry events
3. Run ledger generation
4. Run aggregation
5. Verify totals match
6. Mark old system as deprecated

### Phase 9: Testing 🔨
**Files:** `backend/tests/power-analytics/`

**Test Suites:**
1. **Unit Tests:**
   - Delta calculation (cumulative vs power integration)
   - Reset detection
   - Switch state filtering
   - Cost calculation
   - Timezone conversion

2. **Integration Tests:**
   - Device goes offline then online
   - Firmware reset scenario
   - Large gap handling
   - Out-of-order events
   - Duplicate messages

3. **Visual Acceptance:**
   - Dashboard cards = aggregation query
   - Charts = same data source
   - Offline device shows historical data

### Phase 10: Cutover & Cleanup 🔨
1. Deploy new system in parallel
2. Monitor for 1 week
3. Verify data consistency
4. Switch frontend to new API
5. Deprecate old models:
   - EnergyConsumption
   - Old ActivityLog power fields
   - powerConsumptionTracker service
6. Update documentation

## 🚀 Deployment Strategy

### Option A: Gradual Migration (Recommended)
```
Week 1: Deploy new models & ingestion (parallel to old system)
Week 2: Deploy ledger generation & aggregation
Week 3: Deploy new API endpoints (coexist with old)
Week 4: Update 1-2 classrooms to use new system
Week 5: Monitor & fix issues
Week 6: Migrate all classrooms
Week 7: Deprecate old system
```

### Option B: Big Bang (Risky)
```
Day 1: Deploy everything
Day 2: Migrate all data
Day 3: Switch frontend
Day 4: Remove old system
```

## 📊 Data Migration Strategy

### Step 1: Keep Both Systems Running
- Old system continues tracking in ActivityLog/EnergyConsumption
- New system starts collecting telemetry events
- No data loss

### Step 2: Historical Data Migration
```javascript
// Pseudo-code
for each ActivityLog entry with powerConsumption:
  create synthetic TelemetryEvent
  process through ledger generation
  
verify totals match old system
```

### Step 3: Dual-Write Period
- ESP32 sends telemetry to both old and new MQTT topics
- Both systems operate in parallel
- Compare results daily

### Step 4: Switch Over
- Frontend uses new API
- Old system goes read-only
- Monitor for 1 week

### Step 5: Cleanup
- Archive old data
- Remove old models
- Remove old endpoints

## ⚡ Quick Start (Development/Testing)

### 1. Initialize Cost Versions
```javascript
const CostVersion = require('./models/CostVersion');
await CostVersion.createVersion({
  cost_per_kwh: 7.0,
  effective_from: new Date('2025-01-01'),
  scope: 'global',
  notes: 'Initial rate'
});
```

### 2. Start Ingestion Service
```javascript
const telemetryIngestion = require('./services/telemetryIngestionService');
telemetryIngestion.initialize();

// In MQTT handler:
mqttClient.on('message', (topic, message, packet) => {
  if (topic.endsWith('/telemetry')) {
    telemetryIngestion.handleMQTTMessage(topic, message, packet);
  }
});
```

### 3. Test with Sample Data
```javascript
// Send test telemetry
await telemetryIngestion.ingestTelemetry({
  esp32_name: 'ESP01',
  classroom: 'CR-101',
  device_id: 'light_1',
  timestamp: new Date().toISOString(),
  power_w: 40,
  energy_wh_total: 1000,
  switch_state: { sw1: true },
  status: 'online'
});
```

## 🔍 Monitoring & Health Checks

### Key Metrics to Track:
```
- Telemetry events received per hour
- Unprocessed events count (should be < 100)
- Ledger entries created per hour
- Aggregation job success rate
- Data consistency checks (daily vs ledger totals)
- API response times
```

### Health Check Endpoints:
```
GET /api/power-analytics/health
  → {
      telemetry_events_unprocessed: 42,
      ledger_entries_today: 1234,
      last_aggregation: "2025-11-05T02:00:00Z",
      online_devices: 6
    }
```

## 📚 Documentation Needed

1. **ESP32 Firmware Guide** - How to implement cumulative counters
2. **API Documentation** - New endpoints with examples
3. **Admin Guide** - Cost version management
4. **Troubleshooting Guide** - Common issues and fixes
5. **Migration Guide** - Step-by-step for existing installations

## ⚠️ Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data loss during migration | HIGH | Keep old system running in parallel |
| ESP32 firmware bugs | MEDIUM | Gradual rollout, test with 1 device first |
| Performance issues | MEDIUM | Pre-aggregate data, add indexes |
| Timezone calculation errors | MEDIUM | Extensive testing with multiple timezones |
| Cost recalculation errors | LOW | Require confirmation, backup before recalc |

## ✅ Next Steps

**Immediate (Today):**
1. Create ledger generation service
2. Test ingestion → ledger flow with sample data
3. Create initial cost version

**This Week:**
1. Build aggregation service
2. Create new API endpoints
3. Test end-to-end flow

**Next Week:**
1. Update ESP32 firmware
2. Test on one device
3. Monitor for issues

## 📞 Support & Questions

If you have questions about any part of this implementation:
1. Check the inline documentation in model files
2. Review the test scenarios
3. Test with sample data before production

---

**Status:** Phase 1 Complete ✅
**Next:** Implement Ledger Generation Service
**Timeline:** 2-3 weeks for full rollout
**Last Updated:** 2025-11-05
