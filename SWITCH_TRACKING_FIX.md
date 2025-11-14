# Switch Tracking Current State Duration Fix

## Problem Description

The switch tracking feature was showing incorrect "current state duration" data:
- Switches turned OFF at 6:52 PM were showing as "OFF for 19 hours"
- The system was not properly tracking when the **current** state started
- The displayed duration was cumulative time in the timeframe, not current state duration

## Root Cause

The backend logic had two major issues:

### Issue 1: Wrong Log Query Logic
```javascript
// OLD (INCORRECT) - Looking for logs matching current state
const currentStateActions = deviceCurrentState ? ON_ACTIONS : OFF_ACTIONS;
const currentStateLog = await ActivityLog.findOne({
  action: { $in: currentStateActions },
  timestamp: { $lte: now }
}).sort({ timestamp: -1 }).lean();
```

This was finding the most recent ON action when switch was ON, or most recent OFF action when switch was OFF, which could be from any time in history.

### Issue 2: Frontend Using Wrong Data
```javascript
// OLD (INCORRECT) - Using cumulative timeframe data
const currentDuration = isOn ? stat.totalOnTime : stat.totalOffTime;
const lastChangeTime = isOn ? stat.lastOnAt : stat.lastOffAt;
```

The frontend was displaying `totalOnTime` (cumulative ON time in the timeframe) instead of the actual current state duration.

## Solution Implemented

### Backend Fix (`backend/routes/analytics.js`)

**Changed the logic to find the MOST RECENT log (any action type):**

```javascript
// NEW (CORRECT) - Find most recent log regardless of action type
const mostRecentLog = await ActivityLog.findOne({
  deviceId: device._id,
  $or: [
    { switchId: switchItem._id },
    { switchId: switchIdStr }
  ],
  action: { $in: ALL_SWITCH_ACTIONS },
  timestamp: { $lte: now }
}).sort({ timestamp: -1 }).lean();
```

**Properly calculate when current state started:**

```javascript
if (mostRecentLog) {
  const mostRecentState = ON_ACTIONS.includes(mostRecentLog.action);
  
  if (mostRecentState === deviceCurrentState) {
    // Most recent log confirms current state
    currentStateSinceTime = new Date(mostRecentLog.timestamp);
    lastStateChangeAt = mostRecentLog.timestamp;
    
    if (deviceCurrentState) {
      lastOnAt = mostRecentLog.timestamp;
    } else {
      lastOffAt = mostRecentLog.timestamp;
    }
  }
}

// Calculate duration from most recent state change to now
const currentStateDurationSeconds = Math.max(0, Math.floor((now - currentStateSinceTime) / 1000));
```

**Added detailed logging for debugging:**

```javascript
console.log(`[Switch Stats] ${switchItem.name} final:`);
console.log(`  - ON time in timeframe: ${formatDuration(onDuration)}`);
console.log(`  - OFF time in timeframe: ${formatDuration(offDuration)}`);
console.log(`  - Toggle count: ${toggleCount}`);
console.log(`  - Current state: ${deviceCurrentState ? 'ON' : 'OFF'}`);
console.log(`  - Current state since: ${currentStateSinceTime.toISOString()}`);
console.log(`  - Current state duration: ${formatDuration(currentStateDurationSeconds)}`);
```

### Frontend Fix (`src/components/DeviceUptimeTracker.tsx`)

**Changed to use the correct state duration data:**

```javascript
// NEW (CORRECT) - Using actual current state duration
const currentDuration = stat.currentStateDuration || '0s';
// When did the CURRENT state start (most recent state change)
const lastChangeTime = stat.lastStateChangeAt;
```

## What This Fixes

### Before Fix:
- ❌ Switch OFF at 6:52 PM showed "OFF for 19 hours" (cumulative OFF time from entire day)
- ❌ Confusing data showing accumulated time instead of current state time
- ❌ No clear indication of when the switch was last toggled

### After Fix:
- ✅ Switch OFF at 6:52 PM shows "OFF for 2h 15m" (actual time since 6:52 PM)
- ✅ Clear display of how long switch has been in CURRENT state (ON or OFF)
- ✅ Accurate last state change timestamp
- ✅ Cumulative ON/OFF times still shown separately in the summary section

## Data Flow

```
ActivityLog Collection
  ↓
Most recent log (any action: on, off, manual_on, manual_off, bulk_on, bulk_off)
  ↓
Determine current state start time
  ↓
Calculate: NOW - currentStateSinceTime = currentStateDuration
  ↓
Display: "Been ON/OFF for [currentStateDuration]"
```

## Example Output

For a switch turned OFF at 6:52 PM (18:52):

```javascript
{
  "switchName": "Light 1",
  "currentState": false,  // OFF
  "lastStateChangeAt": "2025-11-12T18:52:00.000Z",  // 6:52 PM
  "currentStateDuration": "2h 15m",  // How long it's been OFF
  "totalOnTime": "5h 32m",  // Total ON time during the selected day/month
  "totalOffTime": "18h 28m",  // Total OFF time during the selected day/month
  "lastOnAt": "2025-11-12T17:30:00.000Z",  // When it was last turned ON
  "lastOffAt": "2025-11-12T18:52:00.000Z"  // When it was last turned OFF (matches lastStateChangeAt)
}
```

## Testing

### To Verify the Fix:

1. **Navigate to**: Analytics & Monitoring → Devices → Select a device
2. **Look at the prominent box** showing "Been ON for" or "Been OFF for"
3. **Verify**:
   - Duration matches the time since the last state change
   - Timestamp shows when the switch was last turned ON/OFF
   - "Total ON Time Today" and "Total OFF Time Today" show cumulative times
   - Current state duration updates in real-time with auto-refresh

### Test Scenarios:

1. **Switch turned OFF at 6:52 PM**: Should show "OFF for [time since 6:52 PM]"
2. **Switch turned ON at 10:00 AM**: Should show "ON for [time since 10:00 AM]"
3. **Auto-refresh enabled**: Duration should increment every 30 seconds
4. **Monthly view**: Should still show current state duration (not monthly cumulative)

## Files Modified

1. **Backend**: `backend/routes/analytics.js`
   - Fixed switch-stats endpoint logic
   - Added comprehensive logging
   - Corrected most recent log query

2. **Frontend**: `src/components/DeviceUptimeTracker.tsx`
   - Updated to use `currentStateDuration` instead of cumulative times
   - Fixed `lastChangeTime` to use `lastStateChangeAt`

## Related Features

This fix maintains all existing functionality:
- ✅ Daily and monthly timeframe selection
- ✅ Auto-refresh every 30 seconds
- ✅ Toggle count tracking
- ✅ Recent activity timestamps
- ✅ Total ON/OFF time calculations
- ✅ Device offline warnings
- ✅ Real-time updates via WebSocket

## Technical Details

### Backend Response Structure:
```javascript
{
  "switchStats": [
    {
      "switchId": "...",
      "switchName": "Light 1",
      "switchType": "light",
      "currentState": true,  // Current physical state
      "currentStateDuration": "2h 15m",  // Formatted duration
      "currentStateDurationSeconds": 8100,  // Raw seconds
      "lastStateChangeAt": "2025-11-12T18:52:00.000Z",  // When current state started
      "lastOnAt": "2025-11-12T18:52:00.000Z",  // Most recent ON action
      "lastOffAt": "2025-11-12T17:30:00.000Z",  // Most recent OFF action
      "onDuration": 19920,  // Total ON seconds in timeframe
      "offDuration": 66480,  // Total OFF seconds in timeframe
      "totalOnTime": "5h 32m",  // Formatted
      "totalOffTime": "18h 28m",  // Formatted
      "toggleCount": 12,  // Number of state changes
      "timeframe": "day",
      "timeframeName": "Nov 12, 2025"
    }
  ],
  "deviceStatus": { ... },
  "startTime": "2025-11-12T00:00:00.000Z",
  "endTime": "2025-11-12T23:59:59.999Z"
}
```

## Deployment Notes

- ✅ No database migrations required
- ✅ No API contract changes
- ✅ Backward compatible
- ✅ No frontend build changes needed
- ✅ Works with existing activity logs

## Performance Impact

- **No significant performance impact**
- Query optimizations:
  - Single query for most recent log (indexed by timestamp)
  - Efficient date range filtering
  - Proper use of MongoDB indexes

## Future Enhancements

Possible improvements for future iterations:
1. Add WebSocket real-time updates for current state duration
2. Cache current state duration calculations
3. Add push notifications for prolonged ON/OFF states
4. Historical state duration graphs
5. Anomaly detection for unusual state durations

---

**Date Fixed**: November 12, 2025  
**Issue**: Switch tracking showing wrong "current state duration"  
**Status**: ✅ RESOLVED
