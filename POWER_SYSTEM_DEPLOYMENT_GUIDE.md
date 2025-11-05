# Power System Integration & Deployment Guide

## Overview
This guide covers the complete integration, testing, and deployment of the new immutable power consumption tracking system.

## ✅ Integration Status

### **Completed Integrations** (in `backend/server.js`):

1. **Service Initialization** (Lines ~870-925)
   ```javascript
   // Initialize telemetry ingestion service
   await telemetryIngestionService.initialize();
   
   // Initialize ledger generation service
   await ledgerGenerationService.initialize();
   
   // Initialize aggregation service
   await aggregationService.initialize();
   
   // Schedule reconciliation job (2 AM IST daily)
   const reconciliationJob = require('./jobs/reconciliationJob');
   const cron = require('node-cron');
   reconciliationJob.schedule(cron);
   ```

2. **MQTT Message Routing** (Lines ~705-770)
   ```javascript
   // Routes messages to appropriate handlers:
   - autovolt/<esp32_name>/telemetry → telemetryIngestionService
   - autovolt/<esp32_name>/status → Device status updates (LWT)
   - autovolt/<esp32_name>/heartbeat → Health monitoring
   ```

3. **API Routes Mounted** (Line ~1485)
   ```javascript
   apiRouter.use('/power-analytics', apiLimiter, require('./routes/powerAnalytics'));
   ```

---

## 🧪 Testing

### **1. Run Integration Tests**

```bash
# Navigate to backend directory
cd backend

# Run integration test suite
node tests/integration/power-system-integration.test.js
```

**Expected Output:**
```
✅ Test 1: Telemetry Ingestion with Deduplication - PASSED
✅ Test 2: Ledger Generation with Delta Calculation - PASSED
✅ Test 3: Reset Detection - PASSED
✅ Test 4: Daily Aggregation with Timezone - PASSED
✅ Test 5: Cost Versioning - PASSED
✅ Test 6: Timezone Conversion (Asia/Kolkata) - PASSED

✅ All tests passed!
```

### **2. Manual API Testing**

#### Health Check
```bash
curl http://localhost:3001/api/power-analytics/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "telemetry": {
    "total_events": 0,
    "unprocessed_events": 0,
    "events_last_hour": 0,
    "online_devices": 0
  },
  "ledger": {
    "events_processed": 0,
    "entries_created": 0,
    "resets_detected": 0,
    "errors": 0,
    "is_processing": false
  },
  "aggregation": {
    "last_run": null,
    "last_run_id": null
  },
  "timestamp": "2025-11-05T10:30:00.000Z"
}
```

#### Create Cost Version
```bash
curl -X POST http://localhost:3001/api/power-analytics/cost-versions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "cost_per_kwh": 7.50,
    "effective_from": "2024-11-01T00:00:00+05:30",
    "notes": "Standard electricity rate"
  }'
```

#### Get Daily Summary
```bash
curl "http://localhost:3001/api/power-analytics/summary?classroom=CSE-301&date=2024-11-05" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🚀 Deployment Checklist

### **Phase 1: Pre-Deployment (Week 1)**

- [x] ✅ All services implemented and tested
- [x] ✅ API routes created and mounted
- [x] ✅ MQTT handlers integrated
- [x] ✅ Integration tests written
- [ ] ⏳ Run integration tests in staging environment
- [ ] ⏳ Create initial cost version (set electricity rate)
- [ ] ⏳ Update 1 ESP32 firmware for testing (see ESP32_FIRMWARE_UPDATE_GUIDE.md)

**Commands:**
```bash
# Create initial cost version
curl -X POST http://localhost:3001/api/power-analytics/cost-versions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "cost_per_kwh": 7.50,
    "effective_from": "'$(date -u +%Y-%m-%dT%H:%M:%S)+05:30'",
    "notes": "Production electricity rate - Q4 2024"
  }'
```

### **Phase 2: Pilot Testing (Week 2)**

- [ ] ⏳ Flash 1 ESP32 with new firmware (cumulative energy tracking)
- [ ] ⏳ Monitor telemetry ingestion for 24 hours
- [ ] ⏳ Verify ledger entries are created correctly
- [ ] ⏳ Check daily aggregates match expectations
- [ ] ⏳ Test dashboard displays new data correctly
- [ ] ⏳ Validate cost calculations

**Monitoring Commands:**
```bash
# Check telemetry events
mongosh autovolt --eval "db.telemetry_events.find().sort({received_at:-1}).limit(5).pretty()"

# Check ledger entries
mongosh autovolt --eval "db.device_consumption_ledgers.find().sort({start_ts:-1}).limit(5).pretty()"

# Check aggregates
mongosh autovolt --eval "db.daily_aggregates.find().sort({date:-1}).limit(5).pretty()"
```

### **Phase 3: Gradual Rollout (Week 3-4)**

- [ ] ⏳ Flash 10% of ESP32 devices (start with least critical classrooms)
- [ ] ⏳ Monitor for 1 week
- [ ] ⏳ Compare data quality between old and new systems
- [ ] ⏳ Fix any issues discovered
- [ ] ⏳ Flash remaining ESP32 devices

**Rollout Strategy:**
```
Week 3: Flash 10% of devices
  - Monitor daily
  - Check reconciliation job reports
  - Validate energy totals
  
Week 4: Flash remaining 90%
  - Classroom-by-classroom rollout
  - Keep old system running in parallel
  - Compare totals for validation
```

### **Phase 4: Cutover (Week 5)**

- [ ] ⏳ All ESP32 devices running new firmware
- [ ] ⏳ Validate data consistency across all classrooms
- [ ] ⏳ Run reconciliation job manually to check for anomalies
- [ ] ⏳ Update frontend to use new `/api/power-analytics` endpoints
- [ ] ⏳ Deprecate old `/api/analytics/energy-*` endpoints (mark as deprecated)

**Frontend Updates Required:**
```typescript
// File: src/components/EnergyMonitoringDashboard.tsx
// Change from:
const summary = await fetch('/api/analytics/energy-summary');

// To:
const summary = await fetch('/api/power-analytics/summary?classroom=XXX&date=YYYY-MM-DD');

// File: src/components/AnalyticsPanel.tsx
// Change from:
const timeline = await fetch('/api/analytics/energy/24h');

// To:
const timeline = await fetch('/api/power-analytics/timeline?classroom=XXX&start=...&end=...');
```

### **Phase 5: Cleanup (Week 6)**

- [ ] ⏳ Archive old `ActivityLog` collection (with powerConsumption field)
- [ ] ⏳ Archive old `EnergyConsumption` collection
- [ ] ⏳ Remove old power tracking code from `metricsService.js`
- [ ] ⏳ Remove old `powerConsumptionTracker.js`
- [ ] ⏳ Update documentation

**Archive Commands:**
```bash
# Export old data for archival
mongodump --db autovolt --collection activitylogs --out /backup/old_power_system/
mongodump --db autovolt --collection energyconsumptions --out /backup/old_power_system/

# Drop old collections (after confirming new system works)
# mongosh autovolt --eval "db.energyconsumptions.drop()"
# Note: Keep ActivityLog for other purposes, just ignore powerConsumption field
```

---

## 📊 Monitoring & Maintenance

### **Daily Checks**

1. **Health Status**
   ```bash
   curl http://localhost:3001/api/power-analytics/health | jq
   ```

2. **Reconciliation Job Status**
   - Check logs at 2:00 AM IST for reconciliation job output
   - Review any anomalies detected
   - Address review tickets

3. **Data Quality Metrics**
   ```javascript
   // Check confidence distribution
   db.device_consumption_ledgers.aggregate([
     { $group: { 
       _id: "$quality.confidence", 
       count: { $sum: 1 } 
     }}
   ])
   
   // Expected: >90% should be "high" confidence
   ```

### **Weekly Maintenance**

1. **Review Reconciliation Reports**
   - Check for recurring anomalies
   - Investigate patterns in missing heartbeats
   - Fix firmware issues if detected

2. **Validate Aggregates**
   ```bash
   # Run manual reconciliation for last week
   curl -X POST http://localhost:3001/api/power-analytics/recalculate \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{
       "classroom": "CSE-301",
       "start": "2024-10-28",
       "end": "2024-11-04"
     }'
   ```

3. **Cost Version Management**
   - Update rates if electricity prices change
   - Trigger recalculation for affected periods

### **Monthly Maintenance**

1. **Database Cleanup**
   ```javascript
   // Check telemetry_events size (should have TTL index of 2 years)
   db.telemetry_events.stats().size
   
   // Manually delete old events if needed
   db.telemetry_events.deleteMany({
     received_at: { $lt: new Date(Date.now() - 2*365*24*60*60*1000) }
   })
   ```

2. **Performance Tuning**
   - Check index usage
   - Optimize slow queries
   - Monitor MongoDB CPU/Memory

---

## 🔧 Troubleshooting

### **Issue 1: No Telemetry Events Received**

**Symptoms:**
- `telemetry_events` collection is empty
- Health check shows 0 events

**Solutions:**
1. Check ESP32 firmware is sending to correct topic:
   ```
   Topic: autovolt/<esp32_name>/telemetry
   Payload: { energy_wh_total, power_w, switch_state, ... }
   ```

2. Check MQTT broker logs:
   ```bash
   docker logs mosquitto
   ```

3. Verify MQTT client in server.js is connected:
   ```bash
   # Check backend logs for:
   [MQTT] Connected to Aedes broker on port 1883
   ```

### **Issue 2: Ledger Entries Not Generated**

**Symptoms:**
- Telemetry events exist but no ledger entries

**Solutions:**
1. Check if ledger service is processing:
   ```javascript
   db.telemetry_events.find({ processed: false }).count()
   // Should be 0 or very few
   ```

2. Check for errors in backend logs:
   ```bash
   grep "LedgerGeneration" backend.log
   ```

3. Manually trigger processing:
   ```javascript
   const ledgerGenerationService = require('./services/ledgerGenerationService');
   await ledgerGenerationService.processUnprocessedEvents();
   ```

### **Issue 3: Negative Deltas**

**Symptoms:**
- Ledger entries with negative `delta_wh`

**Solutions:**
1. Check if it's a firmware reset:
   ```javascript
   db.device_consumption_ledgers.find({ 
     delta_wh: { $lt: 0 }, 
     is_reset_marker: false 
   })
   // These should be marked as reset markers
   ```

2. Run reconciliation job manually:
   ```javascript
   const reconciliationJob = require('./jobs/reconciliationJob');
   await reconciliationJob.run();
   ```

### **Issue 4: Aggregates Don't Match Ledger**

**Symptoms:**
- Daily aggregate total ≠ sum of ledger entries for that day

**Solutions:**
1. Trigger re-aggregation:
   ```bash
   curl -X POST http://localhost:3001/api/power-analytics/recalculate \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{
       "classroom": "CLASSROOM_NAME",
       "start": "YYYY-MM-DD",
       "end": "YYYY-MM-DD"
     }'
   ```

2. Check timezone issues:
   - Verify aggregationService uses Asia/Kolkata (UTC+5:30)
   - Check day boundaries are correct

---

## 📈 Performance Benchmarks

### **Expected Performance:**

| Metric | Target | Acceptable | Critical |
|--------|--------|------------|----------|
| Telemetry ingestion | <100ms | <500ms | >1s |
| Ledger generation | <200ms | <1s | >5s |
| Daily aggregation | <2s | <10s | >30s |
| API response time | <200ms | <1s | >2s |
| Reconciliation job | <5min | <15min | >30min |

### **Load Testing:**

```bash
# Test telemetry ingestion rate
# Goal: Handle 100 messages/second from all ESP32 devices
ab -n 1000 -c 10 -T application/json -p telemetry.json \
   http://localhost:3001/api/power-analytics/telemetry

# Test API query performance
ab -n 100 -c 5 \
   "http://localhost:3001/api/power-analytics/summary?classroom=CSE-301&date=2024-11-05"
```

---

## 🎯 Success Criteria

### **System is considered stable when:**

1. ✅ All ESP32 devices sending telemetry (>95% uptime)
2. ✅ >95% of telemetry events processed within 1 minute
3. ✅ >90% of ledger entries have "high" confidence
4. ✅ Daily aggregates match ledger totals (within 1% tolerance)
5. ✅ Reconciliation job completes successfully every night
6. ✅ <5 review tickets per week requiring manual intervention
7. ✅ Dashboard displays consistent data (cards = charts)
8. ✅ No data loss during ESP32 offline periods
9. ✅ Cost recalculation completes in <10 minutes
10. ✅ API response times <500ms for 95th percentile

---

## 📝 Post-Deployment Documentation

After successful deployment, update:

1. **API Documentation**: Document all `/api/power-analytics/*` endpoints
2. **Admin Guide**: How to create cost versions, trigger recalculation
3. **Troubleshooting Guide**: Common issues and solutions
4. **Architecture Diagram**: Updated with new system flow
5. **ESP32 Firmware Guide**: Mark as completed once all devices updated

---

## 🚨 Rollback Plan

If critical issues are discovered:

### **Emergency Rollback Steps:**

1. **Disable New System Integration**
   ```javascript
   // In server.js, comment out:
   // await telemetryIngestionService.initialize();
   // await ledgerGenerationService.initialize();
   // await aggregationService.initialize();
   ```

2. **Revert ESP32 Firmware**
   - Flash old firmware without energy_wh_total tracking
   - Devices will continue sending to old topics

3. **Re-enable Old System**
   ```javascript
   // Uncomment in server.js:
   const powerTracker = require('./services/powerConsumptionTracker');
   await powerTracker.initialize();
   ```

4. **Frontend Rollback**
   - Revert API endpoint changes
   - Use old `/api/analytics/energy-*` endpoints

5. **Database Restoration**
   ```bash
   # Restore from backup if needed
   mongorestore --db autovolt /backup/old_power_system/
   ```

**Rollback Decision Criteria:**
- >10% data loss
- System downtime >4 hours
- Critical calculation errors affecting billing
- Performance degradation >50%

---

## 📞 Support & Escalation

**Issues Requiring Immediate Attention:**
- Data loss or corruption
- System crashes or errors
- Billing calculation errors
- Security vulnerabilities

**Contact:**
- System Administrator: [admin@autovolt.com]
- On-Call Engineer: [oncall@autovolt.com]
- Escalation: [escalation@autovolt.com]

---

## ✅ Final Integration Summary

**What's Integrated:**
- ✅ 3 core services initialized in server.js
- ✅ MQTT message routing for new telemetry format
- ✅ API routes mounted and accessible
- ✅ Reconciliation job scheduled (2 AM IST daily)
- ✅ Integration test suite created
- ✅ Health monitoring endpoint

**What's Remaining:**
- ⏳ ESP32 firmware updates (per ESP32_FIRMWARE_UPDATE_GUIDE.md)
- ⏳ Frontend updates to use new endpoints
- ⏳ Create initial cost version
- ⏳ Production validation and monitoring
- ⏳ Old system deprecation and cleanup

**System Ready For:** Pilot testing with 1-2 ESP32 devices

---

*Last Updated: 2024-11-05*
*Version: 1.0*
*Status: Ready for Pilot Testing*
