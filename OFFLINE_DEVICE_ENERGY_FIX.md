# Offline Device Energy Data Display Fix

## Issue
Users reported that when devices go offline, their historical power consumption data doesn't show in the Energy tab charts or cards.

## Root Cause Analysis
After thorough investigation, the **backend was already working correctly**:
- Historical power consumption data IS preserved in ActivityLog, DailyAggregate, and MonthlyAggregate collections
- The `calculatePreciseEnergyConsumption()` function correctly reads historical data for offline devices
- Energy breakdown services (`hourlyBreakdown`, `getDailyBreakdown`, `getMonthlyBreakdown`) all include offline device data

The real issue was a **UX problem**:
- Users couldn't tell which devices were offline in the device dropdown
- No clear indication that historical data is preserved for offline devices
- Users assumed offline devices = no data visible

## Solution Implemented

### 1. Visual Device Status Indicators
**File**: `src/components/EnergyMonitoringDashboard.tsx`

Added status badges to the device dropdown:
- **● (filled circle)** = Online device
- **○ (hollow circle)** = Offline device (historical data available)

```tsx
<SelectItem key={device.id} value={device.id}>
  <div className="flex items-center justify-between w-full gap-2">
    <span className="truncate">{device.name}</span>
    <Badge 
      variant={device.status === 'online' ? 'default' : 'secondary'} 
      className="text-[10px] px-1 py-0 h-4 shrink-0"
    >
      {device.status === 'online' ? '●' : '○'}
    </Badge>
  </div>
</SelectItem>
```

### 2. Dropdown Legend
Added explanatory text at the top of device dropdown:
```
● Online  ○ Offline (historical data shown)
```

### 3. Offline Device Warning Banner
When a user filters by an offline device, show a prominent info banner:
```tsx
{selectedDevice !== 'all' && devices.find(d => d.id === selectedDevice)?.status === 'offline' && (
  <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-300">
    <CardContent className="pt-4">
      <div className="flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            Viewing offline device: {devices.find(d => d.id === selectedDevice)?.name}
          </p>
          <p className="text-amber-800 dark:text-amber-200 mt-1">
            Historical power consumption data is being displayed. Real-time tracking will resume when the device comes back online.
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

### 4. Enhanced Info Card
Added explanation in the info card:
```
Offline devices: Historical power consumption data is preserved and shown in charts even when devices are offline (marked with ○)
```

## How It Works Now

### User Experience
1. **Device Dropdown**: Users can see all devices with clear online/offline status
2. **Filtering**: Selecting an offline device shows historical data in:
   - Summary cards (Today's Usage, This Month)
   - Hourly/Daily/Monthly charts
   - Calendar view
3. **Clear Communication**: Multiple visual cues explain that offline = historical data shown

### Technical Flow
```
User selects offline device
    ↓
Frontend: energyAPI.hourlyBreakdown(date, classroom, deviceId)
    ↓
Backend: energyBreakdownService.hourlyBreakdown()
    ↓
Queries DailyAggregate collection (or reconstructs from ActivityLog)
    ↓
Returns historical consumption data (kwh, cost, runtime)
    ↓
Frontend: Displays data in charts + shows amber warning banner
    ↓
User understands: "This is historical data, device is offline"
```

## Testing Checklist

### Scenario 1: View All Devices Energy
- [ ] Open Energy tab
- [ ] Verify both online and offline devices show in dropdown with status badges
- [ ] Check that summary cards show total consumption (all devices)
- [ ] Confirm charts display historical data for all devices

### Scenario 2: Filter by Offline Device
- [ ] Select an offline device from dropdown (marked with ○)
- [ ] Verify amber warning banner appears
- [ ] Check that Today's Usage card shows historical consumption
- [ ] Check that This Month card shows cumulative historical data
- [ ] View hourly chart - should show consumption from when device was last online
- [ ] View monthly chart - should show daily totals including offline periods

### Scenario 3: Device Goes Offline Mid-Day
- [ ] Device has been online and consuming power
- [ ] Device goes offline
- [ ] Check Energy tab - should still show consumption from morning hours
- [ ] Historical data preserved in charts
- [ ] No new consumption added while offline

### Scenario 4: Device Comes Back Online
- [ ] Previously offline device reconnects
- [ ] Status changes from ○ to ● in dropdown
- [ ] Warning banner disappears
- [ ] New consumption starts tracking again
- [ ] Historical data + new data both visible

## Database Collections Used

### ActivityLog
- Stores every switch ON/OFF event with timestamp
- Power consumption calculated from these events
- Historical data preserved indefinitely

### DailyAggregate
- Daily rollups per device/classroom
- Includes: total_kwh, cost_at_calc_time, on_time_sec
- Generated by aggregation jobs

### MonthlyAggregate
- Monthly rollups per device/classroom
- Includes: total_kwh, cost_at_calc_time, daily_totals array
- Generated by aggregation jobs

## Key Backend Functions

### `calculatePreciseEnergyConsumption(deviceId, startDate, endDate)`
**File**: `backend/metricsService.js`
- Reads ActivityLog for switch events in date range
- Calculates exact consumption based on ON duration × power rating
- Works for both online and offline devices

### `hourlyBreakdown(dateStr, classroom, deviceId)`
**File**: `backend/services/energyBreakdownService.js`
- Returns 24 hourly buckets for a given date
- Uses `calculatePreciseEnergyConsumption()` per bucket
- Includes offline device historical data

### `getMonthlyBreakdown(year, month, classroom, deviceId)`
**File**: `backend/services/energyBreakdownService.js`
- Returns per-day consumption for a month
- Queries MonthlyAggregate or reconstructs from ActivityLog
- Includes offline device historical data

## Files Modified

### Frontend
- `src/components/EnergyMonitoringDashboard.tsx`
  - Added device status badges to dropdown
  - Added legend explaining online/offline indicators
  - Added amber warning banner for offline device filtering
  - Enhanced info card with offline device explanation

### Backend
No backend changes required - already working correctly!

## Configuration
No configuration changes needed. System automatically:
- Tracks device online/offline status
- Preserves historical data in ActivityLog
- Generates daily/monthly aggregates via cron jobs
- Serves historical data via energy API endpoints

## Monitoring
Check these metrics to verify correct operation:
- `device_online_count` - Number of online devices
- `device_offline_count` - Number of offline devices
- `esp32_energy_consumption_total_daily_kwh` - Daily energy (all devices)
- `esp32_energy_consumption_total_monthly_kwh` - Monthly energy (all devices)

## Support Notes
If users report "no data showing for offline device":
1. Check ActivityLog for switch events during the time period
2. Verify DailyAggregate/MonthlyAggregate collections exist
3. Confirm aggregation jobs are running (check cron logs)
4. Ensure date range selected includes when device was last online
5. Check browser console for API errors

## Future Enhancements
- [ ] Add "Last Seen" timestamp to device dropdown
- [ ] Show cumulative "offline duration" in device cards
- [ ] Add "Data Completeness" percentage per device
- [ ] Export historical data for offline devices as CSV
- [ ] Add device status history timeline view
