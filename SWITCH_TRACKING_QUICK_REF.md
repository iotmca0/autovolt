# Switch Tracking Quick Reference

## The Fix in Simple Terms

### Problem
When switches were turned OFF at 6:52 PM, the system showed "OFF for 19 hours" instead of the actual time since 6:52 PM.

### Solution
Changed the logic to:
1. Find the **most recent** switch action (ON or OFF)
2. Calculate time from that action to **now**
3. Display the **actual** current state duration

## Key Changes

### Backend (`backend/routes/analytics.js`)
```javascript
// Find most recent log of ANY type
const mostRecentLog = await ActivityLog.findOne({
  action: { $in: ALL_SWITCH_ACTIONS },
  timestamp: { $lte: now }
}).sort({ timestamp: -1 }).lean();

// Calculate duration from most recent change to now
const currentStateDurationSeconds = Math.floor((now - currentStateSinceTime) / 1000);
```

### Frontend (`src/components/DeviceUptimeTracker.tsx`)
```javascript
// Use actual current state duration
const currentDuration = stat.currentStateDuration || '0s';
const lastChangeTime = stat.lastStateChangeAt;
```

## What You'll See Now

### Correct Display:
- **Switch OFF at 6:52 PM** → Shows "OFF for 2h 15m" (if viewed at 9:07 PM)
- **Switch ON at 10:00 AM** → Shows "ON for 9h 7m" (if viewed at 7:07 PM)
- **Auto-refresh enabled** → Duration increments in real-time every 30 seconds

### Display Sections:

1. **Prominent Box** (Top):
   - **"Been ON/OFF for"**: Current state duration (✅ FIXED)
   - **"Last turned ON/OFF"**: When current state started (✅ FIXED)

2. **Summary Stats** (Below):
   - **"Total ON Time Today/This Month"**: Cumulative ON time in timeframe
   - **"Total OFF Time Today/This Month"**: Cumulative OFF time in timeframe
   - **Toggle count**: Number of state changes

3. **Recent Activity** (Bottom):
   - Last turned ON: Most recent ON action timestamp
   - Last turned OFF: Most recent OFF action timestamp

## Testing Steps

1. Go to **Analytics & Monitoring → Devices**
2. Select any device (e.g., "IOT" classroom device)
3. Check the prominent box showing current state
4. Verify:
   - ✅ Duration makes sense (matches time since last change)
   - ✅ Timestamp is accurate
   - ✅ Auto-refresh updates every 30 seconds

## Example Scenarios

### Scenario 1: Evening Shutdown
```
Action: All switches turned OFF at 6:52 PM
Expected: "Been OFF for [time since 6:52 PM]"
Result: ✅ Shows correct duration from 6:52 PM to now
```

### Scenario 2: Morning Startup
```
Action: Switch turned ON at 8:00 AM
Expected: "Been ON for [time since 8:00 AM]"
Result: ✅ Shows correct duration from 8:00 AM to now
```

### Scenario 3: Multiple Toggles
```
Timeline:
- 9:00 AM: ON
- 11:00 AM: OFF
- 2:00 PM: ON
- Current time: 5:00 PM

Expected: "Been ON for 3h" (since 2:00 PM)
Result: ✅ Shows 3h, not cumulative ON time
```

## API Response Structure

```json
{
  "switchStats": [
    {
      "switchName": "Light 1",
      "currentState": false,
      "currentStateDuration": "2h 15m",
      "currentStateDurationSeconds": 8100,
      "lastStateChangeAt": "2025-11-12T18:52:00.000Z",
      "totalOnTime": "5h 32m",
      "totalOffTime": "18h 28m",
      "toggleCount": 12
    }
  ]
}
```

## Key Differences

| Metric | What It Shows | When To Use |
|--------|---------------|-------------|
| **currentStateDuration** | How long switch has been in CURRENT state | "Switch is ON for..." |
| **totalOnTime** | Total ON time in selected timeframe (day/month) | "Total ON time today" |
| **totalOffTime** | Total OFF time in selected timeframe | "Total OFF time today" |
| **lastStateChangeAt** | When CURRENT state started | "Last changed at..." |
| **lastOnAt** | When switch was last turned ON | "Last ON action" |
| **lastOffAt** | When switch was last turned OFF | "Last OFF action" |

## Troubleshooting

### Duration still looks wrong?
1. Check backend console logs for `[Switch Stats]` entries
2. Verify activity logs exist for the device
3. Ensure auto-refresh is enabled
4. Clear browser cache and reload

### No data showing?
1. Verify device has activity logs in database
2. Check device is not offline
3. Ensure correct timeframe selected (day/month)

### Old data in cache?
1. Disable auto-refresh, then re-enable
2. Switch to different timeframe, then back
3. Hard reload browser (Ctrl+F5)

---

**Status**: ✅ FIXED  
**Servers**: Backend (port 3001), Frontend (port 5174)  
**Date**: November 12, 2025
