// energyBreakdownService.js
// High-level breakdown endpoints for hourly/daily/monthly/yearly energy consumption
// Uses new immutable aggregate collections first; falls back to ActivityLog reconstruction when needed.

const moment = require('moment-timezone');
const DailyAggregate = require('../models/DailyAggregate');
const MonthlyAggregate = require('../models/MonthlyAggregate');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');
const { calculatePreciseEnergyConsumption, getBasePowerConsumption, calculateDevicePowerConsumption } = require('../metricsService');

const TIMEZONE = 'Asia/Kolkata';

function parseDateInput(dateStr) {
  if (!dateStr) return null;
  const m = moment.tz(dateStr, 'YYYY-MM-DD', true, TIMEZONE);
  if (!m.isValid()) return null;
  return m;
}

async function getElectricityRate() {
  try {
    // Power settings stored in file via settings route; load lazily.
    const fs = require('fs').promises;
    const path = require('path');
    const settingsPath = path.join(__dirname, '../data/powerSettings.json');
    const raw = await fs.readFile(settingsPath, 'utf8');
    const json = JSON.parse(raw);
    return json.electricityPrice || 7.5;
  } catch {
    return 7.5;
  }
}

/**
 * Build device filter predicate
 */
function deviceMatches(device, classroom, deviceId) {
  if (classroom && device.classroom !== classroom) return false;
  if (deviceId && device._id.toString() !== deviceId) return false;
  return true;
}

/**
 * Aggregate DailyAggregate rows for a given date with optional filters.
 */
async function dailyAggregateBreakdown(dateStr, classroom, deviceId) {
  const query = { date_string: dateStr };
  if (classroom) query.classroom = classroom;
  if (deviceId) query.device_id = deviceId; // if deviceId provided fetch only that device aggregate

  const rows = await DailyAggregate.find(query).lean();
  return rows;
}

/**
 * Fallback: reconstruct per-device consumption for a date from ActivityLog events if no aggregate rows present.
 * Only counts periods when device was ONLINE (from ActivityLog switch events).
 * When a device goes offline, consumption stops - historical data is preserved in ActivityLog.
 */
async function reconstructDailyFromActivity(dateMoment, classroom, deviceId) {
  const start = dateMoment.clone().tz(TIMEZONE).startOf('day').toDate();
  const end = dateMoment.clone().tz(TIMEZONE).endOf('day').toDate();
  const devices = await Device.find({}, { switches: 1, classroom: 1, status: 1, name: 1, onlineSince: 1, macAddress: 1 }).lean();

  const filtered = devices.filter(d => deviceMatches(d, classroom, deviceId));
  const results = [];
  
  for (const d of filtered) {
    // Only count consumption from ActivityLog - when device was online
    const kwh = await calculatePreciseEnergyConsumption(d._id, start, end);
    
    if (kwh > 0) {
      results.push({
        classroom: d.classroom || 'unassigned',
        device_id: d._id.toString(),
        esp32_name: d.name,
        mac_address: d.macAddress || null,
        total_kwh: kwh,
        total_wh: kwh * 1000,
        cost_at_calc_time: 0, // will fill later (rate applied upstream)
        on_time_sec: 0 // runtime calculated from ActivityLog
      });
    }
  }
  return results;
}

/**
 * Hourly breakdown for a given date (24 buckets). Uses precise reconstruction per hour.
 * Only counts consumption while devices were ONLINE (from ActivityLog events).
 * When a device goes offline, consumption stops - but historical data is preserved.
 */
async function hourlyBreakdown(dateStr, classroom, deviceId) {
  const dateMoment = parseDateInput(dateStr) || moment.tz(TIMEZONE);
  const startOfDay = dateMoment.clone().startOf('day');
  const buckets = [];
  const devices = await Device.find({}, { switches: 1, classroom: 1, status: 1, name: 1, macAddress: 1 }).lean();
  const filtered = devices.filter(d => deviceMatches(d, classroom, deviceId));
  const rate = await getElectricityRate();

  for (let h = 0; h < 24; h++) {
    const bucketStart = startOfDay.clone().add(h, 'hours').toDate();
    const bucketEnd = startOfDay.clone().add(h + 1, 'hours').toDate();
    let totalKwh = 0;
    const byDevice = [];
    
    for (const d of filtered) {
      // Only count consumption from ActivityLog - when device was online
      const kwh = await calculatePreciseEnergyConsumption(d._id, bucketStart, bucketEnd);
      
      if (kwh > 0) {
        totalKwh += kwh;
        byDevice.push({ 
          device_id: d._id.toString(), 
          name: d.name, 
          mac_address: d.macAddress || null, 
          kwh: parseFloat(kwh.toFixed(4)), 
          cost: parseFloat((kwh * rate).toFixed(2))
        });
      }
    }
    
    buckets.push({
      hour: h,
      start: bucketStart.toISOString(),
      end: bucketEnd.toISOString(),
      consumption_kwh: parseFloat(totalKwh.toFixed(4)),
      cost: parseFloat((totalKwh * rate).toFixed(2)),
      devices: byDevice
    });
  }
  
  return { date: startOfDay.format('YYYY-MM-DD'), rate, buckets };
}

/**
 * Daily breakdown entry point.
 */
async function getDailyBreakdown(dateStr, classroom, deviceId) {
  const dateMoment = parseDateInput(dateStr) || moment.tz(TIMEZONE);
  const dateString = dateMoment.format('YYYY-MM-DD');
  let rows = await dailyAggregateBreakdown(dateString, classroom, deviceId);
  const rate = await getElectricityRate();

  if (!rows || rows.length === 0) {
    rows = await reconstructDailyFromActivity(dateMoment, classroom, deviceId);
  }

  // Group by classroom
  const byClassroom = {};
  for (const r of rows) {
    const room = r.classroom || 'unassigned';
    if (!byClassroom[room]) {
      byClassroom[room] = { classroom: room, total_kwh: 0, total_cost: 0, runtime_hours: 0, devices: [] };
    }
    const kwh = r.total_kwh || (r.total_wh / 1000) || 0;
    const cost = r.cost_at_calc_time || (kwh * rate);
    const runtimeHours = (r.on_time_sec || 0) / 3600;
    byClassroom[room].total_kwh += kwh;
    byClassroom[room].total_cost += cost;
    byClassroom[room].runtime_hours += runtimeHours;
    if (r.device_id) {
      byClassroom[room].devices.push({
        device_id: r.device_id,
        name: r.esp32_name || r.device_id,
        kwh: parseFloat(kwh.toFixed(4)),
        cost: parseFloat(cost.toFixed(2)),
        runtime_hours: parseFloat(runtimeHours.toFixed(3))
      });
    }
  }

  const classrooms = Object.values(byClassroom).map(c => ({
    ...c,
    total_kwh: parseFloat(c.total_kwh.toFixed(4)),
    total_cost: parseFloat(c.total_cost.toFixed(2)),
    runtime_hours: parseFloat(c.runtime_hours.toFixed(3)),
    device_count: c.devices.length
  }));

  const totals = classrooms.reduce((acc, c) => {
    acc.total_kwh += c.total_kwh;
    acc.total_cost += c.total_cost;
    acc.runtime_hours += c.runtime_hours;
    return acc;
  }, { total_kwh: 0, total_cost: 0, runtime_hours: 0 });

  totals.total_kwh = parseFloat(totals.total_kwh.toFixed(4));
  totals.total_cost = parseFloat(totals.total_cost.toFixed(2));
  totals.runtime_hours = parseFloat(totals.runtime_hours.toFixed(3));

  return { date: dateString, rate, classrooms, totals, source: rows.length ? 'aggregate_or_reconstructed' : 'empty' };
}

/**
 * Monthly breakdown: return per-day totals and aggregate; filters supported.
 */
async function getMonthlyBreakdown(year, month, classroom, deviceId) {
  const monthString = `${year}-${String(month).padStart(2, '0')}`;
  const query = { month: parseInt(month), year: parseInt(year) };
  if (classroom) query.classroom = classroom;
  if (deviceId) query.device_id = deviceId;
  let rows = await MonthlyAggregate.find(query).lean();
  const rate = await getElectricityRate();

  const dayMap = {}; // date_string -> { kwh, cost }
  let totalKwh = 0; let totalCost = 0; let totalRuntime = 0;
  for (const r of rows) {
    const kwh = r.total_kwh || (r.total_wh / 1000) || 0;
    const cost = r.cost_at_calc_time || (kwh * rate);
    totalKwh += kwh;
    totalCost += cost;
    totalRuntime += (r.on_time_sec || 0) / 3600;
    if (Array.isArray(r.daily_totals)) {
      for (const d of r.daily_totals) {
        if (!dayMap[d.date_string]) dayMap[d.date_string] = { kwh: 0, cost: 0 };
        dayMap[d.date_string].kwh += d.total_kwh || (d.total_wh / 1000) || 0;
        dayMap[d.date_string].cost += d.cost || ( (d.total_kwh || 0) * rate );
      }
    }
  }

  // Fallback reconstruction if no monthly aggregates exist (e.g., early day or aggregation job not yet run)
  // Only counts consumption from ActivityLog - when devices were ONLINE
  if (rows.length === 0) {
    const moment = require('moment-timezone');
    const startOfMonth = moment.tz(`${year}-${String(month).padStart(2,'0')}-01`, 'YYYY-MM-DD', 'Asia/Kolkata').startOf('day');
    const today = moment.tz('Asia/Kolkata');
    const endDay = (startOfMonth.month() === today.month() && startOfMonth.year() === today.year()) ? today.date() : startOfMonth.daysInMonth();
    const devices = await Device.find({}, { switches:1, classroom:1, status:1, name:1, onlineSince:1, macAddress:1 }).lean();
    const filtered = devices.filter(d => deviceMatches(d, classroom, deviceId));
    
    for (let day = 1; day <= endDay; day++) {
      const dateMoment = startOfMonth.clone().date(day);
      const dateStr = dateMoment.format('YYYY-MM-DD');
      const start = dateMoment.clone().startOf('day').toDate();
      const end = dateMoment.clone().endOf('day').toDate();
      let dayKwh = 0; let dayCost = 0;
      
      for (const d of filtered) {
        // Only count consumption from ActivityLog - stops when device goes offline
        const kwh = await calculatePreciseEnergyConsumption(d._id, start, end);
        dayKwh += kwh;
      }
      
      if (dayKwh > 0) {
        dayCost = parseFloat((dayKwh * rate).toFixed(2));
        dayMap[dateStr] = { kwh: (dayMap[dateStr]?.kwh || 0) + dayKwh, cost: (dayMap[dateStr]?.cost || 0) + dayCost };
        totalKwh += dayKwh; totalCost += dayCost; // runtime unknown in fallback
      }
    }
  }
  const days = Object.keys(dayMap).sort().map(ds => ({
    date: ds,
    kwh: parseFloat(dayMap[ds].kwh.toFixed(4)),
    cost: parseFloat(dayMap[ds].cost.toFixed(2))
  }));

  return {
    month: monthString,
    rate,
    total_kwh: parseFloat(totalKwh.toFixed(4)),
    total_cost: parseFloat(totalCost.toFixed(2)),
    runtime_hours: parseFloat(totalRuntime.toFixed(3)),
    days
  };
}

/**
 * Yearly breakdown: sum monthly aggregates; deliver per-month list.
 */
async function getYearlyBreakdown(year, classroom) {
  const query = { year: parseInt(year) };
  if (classroom) query.classroom = classroom;
  const rows = await MonthlyAggregate.find(query).lean();
  const rate = await getElectricityRate();
  const monthMap = {};
  let totalKwh = 0; let totalCost = 0; let totalRuntime = 0;
  for (const r of rows) {
    const kwh = r.total_kwh || (r.total_wh / 1000) || 0;
    const cost = r.cost_at_calc_time || (kwh * rate);
    const key = r.month;
    if (!monthMap[key]) monthMap[key] = { kwh: 0, cost: 0 };
    monthMap[key].kwh += kwh;
    monthMap[key].cost += cost;
    totalKwh += kwh; totalCost += cost; totalRuntime += (r.on_time_sec || 0)/3600;
  }
  const months = Object.keys(monthMap).sort((a,b)=>parseInt(a)-parseInt(b)).map(m => ({
    month: parseInt(m),
    kwh: parseFloat(monthMap[m].kwh.toFixed(4)),
    cost: parseFloat(monthMap[m].cost.toFixed(2))
  }));
  return {
    year: parseInt(year),
    rate,
    total_kwh: parseFloat(totalKwh.toFixed(4)),
    total_cost: parseFloat(totalCost.toFixed(2)),
    runtime_hours: parseFloat(totalRuntime.toFixed(3)),
    months
  };
}

module.exports = {
  getDailyBreakdown,
  hourlyBreakdown,
  getMonthlyBreakdown,
  getYearlyBreakdown
};
