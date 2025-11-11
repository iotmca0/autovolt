# Energy Consumption Offline Devices - Quick Fix Guide

## 🚨 Issue Report
"When all devices went offline, historical energy consumption data is not showing in frontend. It shows less consumed data."

## ✅ Quick Diagnosis (5 minutes)

### Step 1: Run the Debug Script
```bash
cd backend
node debug_energy_offline.js
```

This will show you:
- ✅ Which devices are online/offline
- ✅ If DailyAggregate and MonthlyAggregate collections have data
- ✅ If ActivityLog has historical switch events
- ✅ Calculated consumption from activity logs for each device
- ✅ Data consistency check

### Step 2: Check Backend Logs
```bash
# Start backend in verbose mode
cd backend
npm run dev

# In another terminal, trigger the energy API
curl http://localhost:3001/api/analytics/energy-summary

# Watch for these log patterns:
# [EnergySummary] Device Status: X total (🟢 Y online, ⚪ Z offline)
# [EnergySummary] Found N DailyAggregate(s) for YYYY-MM-DD
# [EnergySummary] Using FALLBACK for daily calculation...
```

**Expected Logs** (when all devices offline):
```
[EnergySummary] Device Status: 5 total (🟢 0 online, ⚪ 5 offline)
[EnergySummary] Found 0 DailyAggregate(s) for 2024-01-15
[EnergySummary] Using FALLBACK for daily calculation (no DailyAggregates found)
  ⚪ Lab201_ESP32 (offline): 2.3456 kWh from activity logs
     ↳ ✅ Added to total: 2.3456 kWh, ₹18.76
  ⚪ Lab202_ESP32 (offline): 1.8900 kWh from activity logs
     ↳ ✅ Added to total: 1.8900 kWh, ₹15.12
```

### Step 3: Check Frontend Browser Console
```
F12 → Console Tab → Look for errors

Expected behavior:
- No 401 Unauthorized errors
- No 500 Server errors
- Response from /api/analytics/energy-summary should have:
  {
    "daily": { "consumption": X, "cost": Y },
    "monthly": { "consumption": A, "cost": B }
  }
```

## 🎯 Common Causes & Solutions

### Cause 1: Aggregation Job Not Running ⚠️
**Symptom**: Debug script shows "NO DAILY AGGREGATES FOUND"

**Solution**:
```bash
# Manually run aggregation
cd backend
node aggregate_energy.js

# Or set up cron job (Linux/Mac):
crontab -e
# Add: 0 */6 * * * cd /path/to/backend && node aggregate_energy.js

# Or use PM2 (recommended):
pm2 start ecosystem.config.js
```

**Expected Result**: DailyAggregate and MonthlyAggregate collections will be populated.

---

### Cause 2: Activity Logs Missing/Cleared 🗑️
**Symptom**: Debug script shows "No consumption found in activity logs"

**Root Causes**:
- Database was reset or cleared
- ActivityLog collection was truncated
- Devices went offline BEFORE today started (no events today)

**Solution**:
```bash
# Check activity log count
mongo iot-classroom-automation
> db.activity_logs.countDocuments()
> db.activity_logs.find({action:{$in:['on','off','switch_on','switch_off']}}).limit(5)

# If logs are missing, they cannot be recovered
# Going forward:
# 1. Ensure devices stay online OR
# 2. Run aggregation job before devices go offline
```

**Prevention**:
- Schedule aggregation job to run every 6 hours
- Add database backup automation
- Monitor device connectivity

---

### Cause 3: Frontend Cache Issue 🌐
**Symptom**: Backend shows correct data but frontend shows 0 or old data

**Solution**:
```bash
# Clear browser cache
# Chrome: Ctrl+Shift+Delete → Clear all data

# Hard refresh
# Chrome: Ctrl+F5

# Or use incognito mode to test
# Chrome: Ctrl+Shift+N
```

---

### Cause 4: System Working as Designed ✅
**Symptom**: Consumption shows same value while devices are offline

**Explanation**: This is **CORRECT** behavior!

**Timeline Example**:
```
8 AM  - Devices online, consumption growing: 2.5 kWh
10 AM - Devices online, consumption growing: 4.8 kWh
12 PM - DEVICES GO OFFLINE - consumption stops: 4.8 kWh
2 PM  - Devices still offline: 4.8 kWh (unchanged)
4 PM  - Devices still offline: 4.8 kWh (unchanged)
6 PM  - Devices back online: 4.8 kWh + new consumption
```

**Why This Is Correct**:
- Offline devices physically consume ZERO power
- Historical data (4.8 kWh) is preserved
- Dashboard accurately reflects reality
- When devices come back online, consumption resumes

---

### Cause 5: Comparing Different Time Periods ⏰
**Symptom**: "Yesterday showed 10 kWh, today shows only 2 kWh"

**Explanation**: Devices may have been online for different durations

**Example**:
```
Yesterday:
  Devices online: 8 AM - 6 PM (10 hours)
  Consumption: 10 kWh

Today:
  Devices online: 8 AM - 10 AM (2 hours)
  Then went offline
  Consumption: 2 kWh (correct for 2 hours)
```

## 🔧 Advanced Troubleshooting

### Check Database Collections Directly

```bash
mongo iot-classroom-automation

# Check today's daily aggregates
> db.daily_aggregates.find({date_string: "2024-01-15"}).pretty()

# Check current month's aggregates
> db.monthly_aggregates.find({year: 2024, month: 1}).pretty()

# Check recent activity logs
> db.activity_logs.find({
    action: {$in: ['on','off','switch_on','switch_off']},
    timestamp: {$gte: ISODate("2024-01-15T00:00:00Z")}
  }).sort({timestamp:-1}).limit(10)

# Count device status events today
> db.activity_logs.countDocuments({
    action: {$in: ['device_online','device_offline']},
    timestamp: {$gte: ISODate("2024-01-15T00:00:00Z")}
  })
```

### Test Backend API Directly

```bash
# Get JWT token from browser (Application → Local Storage → token)
TOKEN="your-jwt-token-here"

# Test energy summary endpoint
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3001/api/analytics/energy-summary

# Test hourly breakdown
curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:3001/api/analytics/energy-breakdown/hourly?date=2024-01-15"

# Test device list
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3001/api/analytics/dashboard
```

### Enable Verbose Backend Logging

Edit `backend/metricsService.js` to enable detailed logs (already added in latest version):
- Logs show device status summary
- Logs show which devices contribute consumption
- Logs show fallback vs aggregate usage
- Logs show per-device calculations

## 📊 Expected Data Flow

### Normal Operation (Devices Online)
```
ESP32 Device
    ↓ (Switch ON event via MQTT)
ActivityLog.create({action: 'switch_on', powerConsumption: 60W, timestamp: now})
    ↓ (calculatePreciseEnergyConsumption reads this)
DailyAggregate.create({total_kwh: X, date_string: today})
    ↓ (getEnergySummary reads this)
Frontend API Response: {daily: {consumption: X kWh}}
    ↓
Energy Dashboard displays: "X kWh consumed today"
```

### Offline Scenario (Devices Offline)
```
ESP32 Device (offline)
    ↓ (No new MQTT messages)
NO new ActivityLog entries
    ↓ (calculatePreciseEnergyConsumption reads OLD logs)
DailyAggregate OR calculated from historical logs
    ↓ (getEnergySummary uses fallback if needed)
Frontend API Response: {daily: {consumption: X kWh}} (historical)
    ↓
Energy Dashboard displays: "X kWh consumed today" (up until offline)
```

## 🎓 Understanding the System

**Key Principle**: The system tracks **actual physical consumption**, not estimated consumption.

- ✅ **When online**: Tracks real-time consumption from active switches
- ⚪ **When offline**: Preserves historical data, stops accumulating new consumption
- 🔄 **When back online**: Resumes tracking from that point forward

**Historical Data Preservation**:
- ActivityLog: Permanent record of all events
- DailyAggregate: Daily summaries (generated by job)
- MonthlyAggregate: Monthly summaries (generated by job)

**What Gets Lost**:
- Nothing! Historical data is never deleted automatically
- Only NEW consumption tracking stops during offline periods

## 🚀 Recommended Actions

### Immediate Actions
1. ✅ Run `node debug_energy_offline.js` to diagnose
2. ✅ Check backend logs during `/api/analytics/energy-summary` call
3. ✅ Verify aggregation job is scheduled/running
4. ✅ Clear browser cache and test

### Preventive Actions
1. ✅ Set up PM2 for backend process management
2. ✅ Schedule aggregation job (every 6 hours)
3. ✅ Monitor device connectivity (alerts for offline)
4. ✅ Set up database backups (daily)
5. ✅ Add Grafana dashboard for system health

### Long-term Actions
1. ✅ Implement real-time aggregation (on switch events)
2. ✅ Add data validation checks
3. ✅ Create user-friendly "offline mode" indicator in UI
4. ✅ Add historical data export feature
5. ✅ Implement data retention policies

## 📞 Still Having Issues?

If after following this guide you still see missing data:

1. **Collect logs**:
   ```bash
   # Run debug script and save output
   node debug_energy_offline.js > debug_output.txt
   
   # Get backend logs
   tail -n 500 backend/logs/app.log > backend_logs.txt
   
   # Get browser console logs (F12 → Console → right-click → Save As)
   ```

2. **Check these specific values**:
   - Total devices vs online devices
   - DailyAggregate document count for today
   - ActivityLog document count for today
   - Calculated consumption vs displayed consumption
   - API response vs UI display

3. **Provide context**:
   - When did devices go offline?
   - What was the consumption before offline?
   - What is the consumption showing now?
   - Have devices been back online since?
   - Any errors in browser console?

## 📚 Related Documentation

- `ENERGY_OFFLINE_DEVICES_GUIDE.md` - Comprehensive user guide
- `backend/debug_energy_offline.js` - Diagnostic script
- `POWER_CONSUMPTION_ARCHITECTURE.md` - System architecture
- `CONSUMPTION_API_MAP.md` - API endpoint reference

## ✅ Success Criteria

**System is working correctly if**:
- ✅ Historical data visible for offline devices
- ✅ Consumption stops growing when devices offline
- ✅ Consumption resumes when devices online
- ✅ No data loss or corruption
- ✅ Backend logs show correct calculations
- ✅ Frontend displays match backend calculations

**Remember**: Lower consumption numbers when devices are offline is EXPECTED and CORRECT behavior, as long as historical data from before offline is still visible.
