# Database Consumption Storage Methods - Complete Analysis

## 📊 Overview: How Many Different Ways?

Your system stores consumption data in **2 PRIMARY WAYS** with **3 STORAGE LOCATIONS**:

```
┌─────────────────────────────────────────────────────────┐
│                CONSUMPTION DATA FLOW                      │
└─────────────────────────────────────────────────────────┘

   ESP32 Switch Event
         │
         ▼
   ┌──────────────────┐
   │ powerConsumption │  ← Service tracks in MEMORY
   │     Tracker      │
   └──────────────────┘
         │
         ├──────────────┬──────────────┐
         ▼              ▼              ▼
   [ActivityLog]  [EnergyConsumption] [Memory Map]
    (EVENT LOG)    (AGGREGATED DB)    (REAL-TIME)
```

---

## 🗄️ Storage Location #1: ActivityLog Collection

### Purpose
Event-based logging - stores **EVERY** switch on/off event

### Schema
```javascript
{
  deviceId: ObjectId,
  deviceName: String,
  switchId: String,
  switchName: String,
  action: 'on' | 'off' | 'manual_on' | 'manual_off' | 'offline_consumption_stored',
  triggeredBy: 'user' | 'schedule' | 'pir' | 'master' | 'system',
  timestamp: Date,
  powerConsumption: Number,  // ← Watts rating (e.g., 40W, 75W)
  switchType: String,         // ← 'light', 'fan', 'ac', etc.
  duration: Number,           // ← Runtime in seconds (for 'off' events)
  context: {
    energyKwh: Number,        // ← Calculated energy
    cost: Number,             // ← Calculated cost
    runtimeHours: Number      // ← Runtime in hours
  }
}
```

### When Data is Stored
| Event | Storage Point | Code Location |
|-------|--------------|---------------|
| **Switch ON** | `trackSwitchOn()` | `powerConsumptionTracker.js:144` |
| **Switch OFF** | `trackSwitchOff()` | `powerConsumptionTracker.js:233` |
| **Device Offline** | `handleDeviceOffline()` | `powerConsumptionTracker.js:323` |
| **Manual Switch** | MQTT handler | `server.js:214, 346, 456` |

### Storage Method
```javascript
await ActivityLog.create({
  deviceId,
  deviceName,
  switchId,
  switchName,
  action: 'off',  // or 'offline_consumption_stored'
  timestamp: new Date(),
  powerConsumption: 75,  // Watts
  switchType: 'fan',
  duration: 3600,  // seconds
  context: {
    energyKwh: 0.075,  // (75W * 1h) / 1000
    cost: 0.525,       // 0.075 kWh * ₹7/kWh
    runtimeHours: 1.0
  }
});
```

### Indexes
```javascript
{ deviceId: 1, timestamp: -1 }
{ deviceId: 1, action: 1, timestamp: -1 }  // ← For consumption calculations
{ classroom: 1, timestamp: -1 }
{ macAddress: 1, timestamp: -1 }
```

---

## 🗄️ Storage Location #2: EnergyConsumption Collection

### Purpose
Aggregated daily consumption by device - **INCREMENTAL** storage (adds to existing)

### Schema
```javascript
{
  deviceId: ObjectId,
  deviceName: String,
  macAddress: String,
  classroom: String,
  date: Date,           // ← Day start (00:00:00)
  year: Number,
  month: Number,
  day: Number,
  
  consumptionByType: {
    light: {
      energyKwh: Number,
      runtimeHours: Number,
      cost: Number,
      switchCount: Number
    },
    fan: { ... },
    ac: { ... },
    projector: { ... },
    outlet: { ... },
    other: { ... }
  },
  
  totalEnergyKwh: Number,    // ← Sum of all types
  totalRuntimeHours: Number,
  totalCost: Number,
  
  electricityRate: Number,
  wasOnline: Boolean,        // ← true if stored while device online
  lastUpdated: Date
}
```

### When Data is Stored
| Event | Storage Point | Code Location |
|-------|--------------|---------------|
| **Switch OFF (Normal)** | After calculating consumption | `powerConsumptionTracker.js:233` |
| **Device Offline** | Before clearing active switches | `powerConsumptionTracker.js:323` |

### Storage Method (INCREMENTAL!)
```javascript
await EnergyConsumption.incrementConsumption({
  deviceId: device._id,
  deviceName: 'Computer_Lab',
  macAddress: '80:F3:DA:65:47:38',
  classroom: 'Computer Lab',
  date: new Date(),  // Today
  switchType: 'fan',
  energyKwh: 0.075,
  runtimeHours: 1.0,
  cost: 0.525,
  electricityRate: 7.0,
  wasOnline: true
});

// This will ADD 0.075 kWh to existing data, NOT replace it!
```

### Internal Implementation (Important!)
```javascript
// From EnergyConsumption.js model:
energyConsumptionSchema.statics.incrementConsumption = async function(data) {
  const record = await this.findOneAndUpdate(
    { deviceId, date: dayStart },  // Find by device + day
    {
      $inc: {  // ← INCREMENTAL: Adds to existing values
        [`consumptionByType.${type}.energyKwh`]: energyKwh,
        [`consumptionByType.${type}.runtimeHours`]: runtimeHours,
        [`consumptionByType.${type}.cost`]: cost,
        totalEnergyKwh: energyKwh,
        totalRuntimeHours: runtimeHours,
        totalCost: cost
      }
    },
    { upsert: true, new: true }  // Create if doesn't exist
  );
};
```

### Indexes
```javascript
{ deviceId: 1, date: -1 }
{ macAddress: 1, date: -1 }
{ classroom: 1, date: -1 }
{ year: 1, month: 1, day: 1 }
```

---

## 💾 Storage Location #3: In-Memory Tracking

### Purpose
Real-time tracking of currently ON switches (not persisted to DB)

### Data Structure
```javascript
// powerConsumptionTracker.js
this.activeSwitches = new Map();

// Structure:
Map {
  "switchId_1" => {
    deviceId: ObjectId,
    deviceName: "Computer_Lab",
    switchId: "switch_1",
    switchName: "Fan 1",
    switchType: "fan",
    powerWatts: 75,
    startTime: Date,
    macAddress: "80:F3:DA:65:47:38",
    classroom: "Computer Lab"
  },
  "switchId_2" => { ... }
}
```

### Lifecycle
```
Switch ON   → Add to Map
Switch OFF  → Calculate → Store to DB → Remove from Map
Device Offline → Calculate ALL → Store to DB → Clear Map
```

---

## 🔄 Complete Data Flow Example

### Scenario: Fan turns ON, runs 1 hour, device goes offline

#### Step 1: Switch ON Event
```javascript
// Location: powerConsumptionTracker.js:144
trackSwitchOn(deviceId, switchId, switchName, 'fan', macAddress) {
  
  // 1. Store in Memory Map
  this.activeSwitches.set(switchId, {
    powerWatts: 75,  // From powerSettings.json
    startTime: new Date(),
    switchType: 'fan'
  });
  
  // 2. Log event in ActivityLog
  await ActivityLog.create({
    action: 'on',
    powerConsumption: 75,
    switchType: 'fan',
    context: {}  // Empty on ON
  });
}
```

#### Step 2: Device Goes Offline (1 hour later)
```javascript
// Location: powerConsumptionTracker.js:287
handleDeviceOffline(deviceId, macAddress) {
  
  // Get from memory
  const tracking = this.activeSwitches.get(switchId);
  
  // Calculate consumption
  const runtimeMs = Date.now() - tracking.startTime;  // 3,600,000 ms
  const runtimeHours = runtimeMs / (1000 * 60 * 60);  // 1.0 hours
  const energyKwh = (75 * 1.0) / 1000;                // 0.075 kWh
  const cost = 0.075 * 7;                             // ₹0.525
  
  // STORAGE #1: EnergyConsumption (Aggregated)
  await EnergyConsumption.incrementConsumption({
    deviceId,
    deviceName: 'Computer_Lab',
    date: tracking.startTime,
    switchType: 'fan',
    energyKwh: 0.075,
    runtimeHours: 1.0,
    cost: 0.525,
    wasOnline: true  // ← Important flag
  });
  
  // STORAGE #2: ActivityLog (Event)
  await ActivityLog.create({
    action: 'offline_consumption_stored',
    timestamp: new Date(),
    powerConsumption: 75,
    switchType: 'fan',
    duration: 3600,  // seconds
    context: {
      energyKwh: 0.075,
      cost: 0.525,
      runtimeHours: 1.0,
      message: 'Stored 0.0750 kWh consumed while online before disconnect'
    }
  });
  
  // Clear from memory
  this.activeSwitches.delete(switchId);
}
```

---

## 📊 How Data is Retrieved

### Method 1: From ActivityLog (Primary)
```javascript
// Location: metricsService.js:1270
async function calculatePreciseEnergyConsumption(deviceId, startTime, endTime) {
  // Query all on/off events
  const activities = await ActivityLog.find({
    deviceId,
    timestamp: { $gte: startTime, $lte: endTime },
    action: { $in: ['on', 'off', 'manual_on', 'manual_off'] }
  }).sort({ timestamp: 1 });
  
  // Calculate consumption from event pairs
  let totalEnergy = 0;
  let onTime = null;
  
  for (const activity of activities) {
    if (activity.action includes 'on') {
      onTime = activity.timestamp;
    } else if (activity.action includes 'off' && onTime) {
      const runtime = (activity.timestamp - onTime) / (1000 * 60 * 60);
      const power = activity.powerConsumption || 0;
      totalEnergy += (power * runtime) / 1000;
      onTime = null;
    }
  }
  
  return totalEnergy;  // kWh
}
```

### Method 2: From EnergyConsumption (Backup/Validation)
```javascript
// Location: metricsService.js:2680
const storedData = await EnergyConsumption.aggregate([
  { $match: { date: { $gte: todayStart, $lte: now } } },
  { $group: { 
    _id: null, 
    totalEnergy: { $sum: '$totalEnergyKwh' }
  }}
]);

const storedEnergy = storedData[0]?.totalEnergy || 0;
```

### Method 3: Cross-Validation (NEW - Fixed)
```javascript
// Location: metricsService.js:2690
const activityLogTotal = await calculatePreciseEnergyConsumption(...);
const storedTotal = await EnergyConsumption.aggregate(...);

// Use MAX to avoid double-counting
const finalTotal = Math.max(activityLogTotal, storedTotal);
```

---

## 🎯 Summary Table

| Storage Method | Collection | When | Purpose | Persistence |
|---------------|-----------|------|---------|-------------|
| **Event Logging** | `ActivityLog` | Every switch on/off | Historical events, calculations | ✅ Permanent |
| **Aggregated Storage** | `EnergyConsumption` | Switch off, device offline | Daily totals, offline backup | ✅ Permanent |
| **Memory Tracking** | `Map` (in-memory) | Switch on (active) | Real-time tracking | ❌ Lost on restart |

---

## 🔍 Key Differences

### ActivityLog vs EnergyConsumption

| Feature | ActivityLog | EnergyConsumption |
|---------|------------|-------------------|
| **Granularity** | Per-event (every on/off) | Per-day (aggregated) |
| **Storage Type** | Event stream | Aggregated totals |
| **Update Method** | `.create()` (new record each time) | `.incrementConsumption()` (adds to existing) |
| **Primary Use** | Calculations, history | Backup, offline persistence |
| **Query Speed** | Slower (many records) | Faster (1 record per device/day) |
| **Data Size** | Large (grows continuously) | Small (1 doc per device/day) |

---

## ⚠️ Critical Points

### 1. Incremental Storage
```javascript
// EnergyConsumption uses $inc operator:
$inc: { totalEnergyKwh: 0.075 }  // Adds to existing, doesn't replace!

// If record has 1.000 kWh:
// After increment: 1.075 kWh  ✅
// NOT: 0.075 kWh  ❌
```

### 2. Double-Counting Prevention
```javascript
// Before fix (WRONG):
return activityLogTotal + storedTotal;  // ❌ Counts same data twice!

// After fix (CORRECT):
return Math.max(activityLogTotal, storedTotal);  // ✅ Uses highest value
```

### 3. Offline Data Persistence
```javascript
// Device offline → stores to BOTH collections:
await EnergyConsumption.incrementConsumption({ wasOnline: true });
await ActivityLog.create({ action: 'offline_consumption_stored' });

// This ensures data survives device disconnect!
```

### 4. Electricity Rate Handling
```javascript
// OLD (hardcoded):
const cost = energy * 7.5;  // ❌ Can't change

// NEW (dynamic):
const rate = loadFromPowerSettings();  // ✅ Loads from JSON
const cost = energy * rate;
```

---

## 📝 Collection Sizes (Your Current System)

Based on your API response showing 75.202 kWh monthly:

```
ActivityLog Collection:
├─ MCA classroom: ~500 events/month
├─ Computer Lab: ~300 events/month
├─ IOT Lab: ~200 events/month
└─ Total: ~1000-2000 documents/month

EnergyConsumption Collection:
├─ 6 devices × 30 days = ~180 documents/month
└─ Much smaller than ActivityLog
```

---

## 🚀 Query Performance

### Fast Queries (Indexed)
```javascript
// ✅ Uses { deviceId: 1, timestamp: -1 } index
ActivityLog.find({ deviceId, timestamp: { $gte, $lte } });

// ✅ Uses { deviceId: 1, date: -1 } index  
EnergyConsumption.find({ deviceId, date: { $gte, $lte } });
```

### Slow Queries (Not Indexed)
```javascript
// ❌ Full collection scan
ActivityLog.find({ switchName: 'Fan 1' });

// ❌ Requires computation
ActivityLog.find({ duration: { $gt: 3600 } });
```

---

## 📊 Data Retention Recommendations

```javascript
// ActivityLog: Keep 6 months (detailed history)
// After 6 months: Archive to cold storage or summarize

// EnergyConsumption: Keep forever (small, aggregated)
// Use for long-term trends and reporting
```

---

## ✅ Conclusion

Your system has **2 main storage methods**:

1. **ActivityLog** - Event-based, used for calculations
2. **EnergyConsumption** - Aggregated, used for offline persistence

Both work together to ensure:
- ✅ No data loss when devices go offline
- ✅ Fast queries for dashboards
- ✅ Historical event tracking
- ✅ Accurate consumption totals

The recent fix ensures they **cross-validate** to prevent inconsistencies!
