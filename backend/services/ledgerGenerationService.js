const TelemetryEvent = require('../models/TelemetryEvent');
const DeviceConsumptionLedger = require('../models/DeviceConsumptionLedger');
const CostVersion = require('../models/CostVersion');

// Simple logger replacement
const logger = {
  info: (msg, ...args) => console.log(`[LedgerGenerationService] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[LedgerGenerationService ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[LedgerGenerationService WARN] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[LedgerGenerationService DEBUG] ${msg}`, ...args)
};

/**
 * Ledger Generation Service
 * 
 * Processes telemetry events and generates consumption ledger entries.
 * Handles:
 * - Cumulative meter readings
 * - Power integration
 * - Firmware resets
 * - Switch state logic
 * - Offline periods
 */
class LedgerGenerationService {
  constructor() {
    this.processingInterval = null;
    this.isProcessing = false;
    this.stats = {
      eventsProcessed: 0,
      ledgerEntriesCreated: 0,
      resetsDetected: 0,
      errors: 0
    };
  }
  
  /**
   * Initialize and start automatic processing
   */
  initialize(intervalSeconds = 30) {
    logger.info('[LedgerGeneration] Service initializing...');
    
    // Start processing loop
    this.processingInterval = setInterval(() => {
      this.processUnprocessedEvents();
    }, intervalSeconds * 1000);
    
    // Do initial processing
    this.processUnprocessedEvents();
    
    logger.info(`[LedgerGeneration] Service initialized (processing every ${intervalSeconds}s)`);
  }
  
  /**
   * Shutdown service
   */
  shutdown() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    logger.info('[LedgerGeneration] Service shutdown');
  }
  
  /**
   * Process all unprocessed events
   */
  async processUnprocessedEvents(limit = 100) {
    if (this.isProcessing) {
      logger.debug('[LedgerGeneration] Already processing, skipping...');
      return;
    }
    
    try {
      this.isProcessing = true;
      
      const events = await TelemetryEvent.getUnprocessed(limit);
      
      if (events.length === 0) {
        return;
      }
      
      logger.info(`[LedgerGeneration] Processing ${events.length} unprocessed events`);
      
      for (const event of events) {
        try {
          await this.processEvent(event);
          this.stats.eventsProcessed++;
        } catch (error) {
          logger.error(`[LedgerGeneration] Error processing event ${event._id}:`, error);
          this.stats.errors++;
          
          // Mark event as processed with error flag
          await TelemetryEvent.updateOne(
            { _id: event._id },
            { $set: { processed: true, 'quality_flags.processing_error': true } }
          );
        }
      }
      
      logger.info(`[LedgerGeneration] Batch complete: ${this.stats.eventsProcessed} processed, ${this.stats.ledgerEntriesCreated} ledger entries`);
      
    } catch (error) {
      logger.error('[LedgerGeneration] Error in processing loop:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Process a single telemetry event
   */
  async processEvent(event) {
    const { esp32_name, device_id, classroom } = event;
    
    // Get last ledger entry for this device
    const lastEntry = await DeviceConsumptionLedger.getLastEntry(esp32_name, device_id);
    
    // Check if this is a firmware reset
    if (await this.detectReset(event, lastEntry)) {
      await this.createResetMarker(event, lastEntry);
      this.stats.resetsDetected++;
      
      // Mark event as processed
      await TelemetryEvent.updateOne(
        { _id: event._id },
        { $set: { processed: true } }
      );
      return;
    }
    
    // Determine calculation method
    const method = this.determineCalculationMethod(event, lastEntry);
    
    if (!method) {
      // Not enough data to calculate, mark as processed
      await TelemetryEvent.updateOne(
        { _id: event._id },
        { $set: { processed: true } }
      );
      return;
    }
    
    // Calculate energy delta
    const delta = await this.calculateDelta(event, lastEntry, method);
    
    if (delta === null || delta < 0) {
      // Invalid delta, skip
      logger.warn(`[LedgerGeneration] Invalid delta for ${esp32_name}/${device_id}: ${delta}`);
      await TelemetryEvent.updateOne(
        { _id: event._id },
        { $set: { processed: true, 'quality_flags.invalid_delta': true } }
      );
      return;
    }
    
    // Apply switch state filter
    const { filteredDelta, switchState, onDuration } = await this.applySwitchStateFilter(
      delta,
      event,
      lastEntry
    );
    
    // Get cost rate for this period
    const costPerKwh = await CostVersion.getRateForDate(event.timestamp, classroom);
    const costInr = (filteredDelta / 1000) * costPerKwh; // Convert Wh to kWh
    
    // Create ledger entry
    const ledgerEntry = await this.createLedgerEntry({
      event,
      lastEntry,
      delta: filteredDelta,
      method,
      switchState,
      onDuration,
      costPerKwh,
      costInr
    });
    
    this.stats.ledgerEntriesCreated++;
    
    // Update event with ledger reference
    await TelemetryEvent.updateOne(
      { _id: event._id },
      { 
        $set: { 
          processed: true,
          ledger_entry_id: ledgerEntry._id
        }
      }
    );
    
    logger.debug(`[LedgerGeneration] ✅ Created ledger entry: ${esp32_name}/${device_id} | ${filteredDelta.toFixed(2)}Wh | ₹${costInr.toFixed(2)}`);
  }
  
  /**
   * Detect firmware reset or counter wrap
   */
  async detectReset(event, lastEntry) {
    if (!event.energy_wh_total || !lastEntry) {
      return false;
    }
    
    const currentReading = event.energy_wh_total;
    const lastReading = lastEntry.calculation_data?.energy_end_wh;
    
    if (!lastReading) {
      return false;
    }
    
    // Reset detected if current reading < last reading
    if (currentReading < lastReading) {
      logger.warn(`[LedgerGeneration] 🔄 Reset detected: ${event.esp32_name}/${event.device_id} | ${lastReading}Wh → ${currentReading}Wh`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Create a reset marker in the ledger
   */
  async createResetMarker(event, lastEntry) {
    const resetReason = this.inferResetReason(event, lastEntry);
    
    await DeviceConsumptionLedger.create({
      esp32_name: event.esp32_name,
      classroom: event.classroom,
      device_id: event.device_id,
      start_ts: lastEntry ? lastEntry.end_ts : event.timestamp,
      end_ts: event.timestamp,
      duration_seconds: 0,
      delta_wh: 0,
      method: 'cumulative_meter',
      calculation_data: {
        energy_start_wh: lastEntry?.calculation_data?.energy_end_wh || 0,
        energy_end_wh: event.energy_wh_total || 0
      },
      switch_state: 'unknown',
      switch_on_duration_seconds: 0,
      device_status: 'reset',
      quality: {
        confidence: 'high',
        flags: {
          post_reset: true
        }
      },
      cost_calculation: {
        cost_per_kwh: 0,
        cost_inr: 0
      },
      notes: `Firmware reset detected: counter wrapped from ${lastEntry?.calculation_data?.energy_end_wh}Wh to ${event.energy_wh_total}Wh`,
      raw_event_ids: [event._id],
      is_reset_marker: true,
      reset_reason: resetReason,
      created_by: 'realtime_processor'
    });
    
    logger.info(`[LedgerGeneration] ✅ Created reset marker for ${event.esp32_name}/${event.device_id}`);
  }
  
  /**
   * Infer reset reason from event data
   */
  inferResetReason(event, lastEntry) {
    if (!lastEntry) return 'unknown';
    
    const timeSinceLastMs = event.timestamp - lastEntry.end_ts;
    const timeSinceLastMin = timeSinceLastMs / (1000 * 60);
    
    // Power cycle if device was offline and gap < 5 minutes
    if (event.status !== 'online' && timeSinceLastMin < 5) {
      return 'power_cycle';
    }
    
    // Firmware update if uptime is low
    if (event.uptime_seconds && event.uptime_seconds < 300) { // < 5 minutes
      return 'firmware_update';
    }
    
    // Counter wrap if reading is near zero
    if (event.energy_wh_total < 1000) {
      return 'counter_wrap';
    }
    
    return 'unknown';
  }
  
  /**
   * Determine which calculation method to use
   */
  determineCalculationMethod(event, lastEntry) {
    // Prefer cumulative meter if available
    if (event.energy_wh_total !== undefined && event.energy_wh_total !== null) {
      if (!lastEntry || lastEntry.calculation_data?.energy_end_wh !== undefined) {
        return 'cumulative_meter';
      }
    }
    
    // Fall back to power integration if power_w is available
    if (event.power_w !== undefined && event.power_w !== null) {
      if (lastEntry) {
        return 'power_integration';
      }
    }
    
    // Not enough data
    return null;
  }
  
  /**
   * Calculate energy delta based on method
   */
  async calculateDelta(event, lastEntry, method) {
    if (method === 'cumulative_meter') {
      return this.calculateCumulativeDelta(event, lastEntry);
    } else if (method === 'power_integration') {
      return this.calculatePowerIntegrationDelta(event, lastEntry);
    }
    return null;
  }
  
  /**
   * Calculate delta from cumulative meter readings
   */
  calculateCumulativeDelta(event, lastEntry) {
    const currentReading = event.energy_wh_total;
    
    if (!lastEntry) {
      // First reading, assume zero consumption
      return 0;
    }
    
    const lastReading = lastEntry.calculation_data?.energy_end_wh;
    
    if (lastReading === undefined || lastReading === null) {
      // No previous reading
      return 0;
    }
    
    const delta = currentReading - lastReading;
    
    // Validate delta
    if (delta < 0) {
      logger.warn(`[LedgerGeneration] Negative delta detected: ${event.esp32_name}/${event.device_id} | ${lastReading}→${currentReading}`);
      return null;
    }
    
    // Check for unreasonably large delta (> 100kWh in one period)
    if (delta > 100000) {
      logger.warn(`[LedgerGeneration] Suspiciously large delta: ${delta}Wh for ${event.esp32_name}/${event.device_id}`);
      return null;
    }
    
    return delta;
  }
  
  /**
   * Calculate delta from power integration
   */
  calculatePowerIntegrationDelta(event, lastEntry) {
    const powerW = event.power_w;
    const currentTime = new Date(event.received_at);
    const lastTime = new Date(lastEntry.end_ts);
    
    // Calculate time difference in hours
    const durationMs = currentTime - lastTime;
    const durationHours = durationMs / (1000 * 60 * 60);
    
    // Check for reasonable time gap (< 1 hour)
    if (durationHours > 1) {
      logger.warn(`[LedgerGeneration] Large time gap: ${durationHours.toFixed(2)}h for ${event.esp32_name}/${event.device_id}`);
      // Still calculate but mark as low confidence
    }
    
    // Energy = Power × Time
    const energyWh = powerW * durationHours;
    
    // Validate
    if (energyWh < 0 || energyWh > 10000) {
      logger.warn(`[LedgerGeneration] Invalid power integration: ${energyWh}Wh for ${event.esp32_name}/${event.device_id}`);
      return null;
    }
    
    return energyWh;
  }
  
  /**
   * Apply switch state filtering - only count energy when switch is ON
   */
  async applySwitchStateFilter(delta, event, lastEntry) {
    // Get switch state for this device
    const switchState = this.getSwitchState(event);
    
    if (switchState === 'off') {
      // Switch was OFF entire period, zero out consumption
      return {
        filteredDelta: 0,
        switchState: 'off',
        onDuration: 0
      };
    }
    
    if (switchState === 'on') {
      // Switch was ON entire period
      const durationSeconds = lastEntry 
        ? (new Date(event.received_at) - new Date(lastEntry.end_ts)) / 1000
        : 0;
      
      return {
        filteredDelta: delta,
        switchState: 'on',
        onDuration: durationSeconds
      };
    }
    
    // Mixed or unknown state - use full delta but mark as uncertain
    const durationSeconds = lastEntry 
      ? (new Date(event.received_at) - new Date(lastEntry.end_ts)) / 1000
      : 0;
    
    return {
      filteredDelta: delta,
      switchState: switchState || 'unknown',
      onDuration: durationSeconds
    };
  }
  
  /**
   * Get switch state from event
   */
  getSwitchState(event) {
    if (!event.switch_state || event.switch_state.size === 0) {
      return 'unknown';
    }
    
    const states = Array.from(event.switch_state.values());
    const allOn = states.every(s => s === true);
    const allOff = states.every(s => s === false);
    
    if (allOn) return 'on';
    if (allOff) return 'off';
    return 'mixed';
  }
  
  /**
   * Create ledger entry
   */
  async createLedgerEntry(data) {
    const { event, lastEntry, delta, method, switchState, onDuration, costPerKwh, costInr } = data;
    
    const startTs = lastEntry ? lastEntry.end_ts : event.timestamp;
    const endTs = event.received_at;
    const durationSeconds = (new Date(endTs) - new Date(startTs)) / 1000;
    
    // Determine device status
    const deviceStatus = event.status === 'online' ? 'online' : 
                        event.status === 'offline-heartbeat' ? 'offline' : 
                        'offline';
    
    // Calculate confidence based on method and quality flags
    const confidence = this.calculateConfidence(event, method, durationSeconds);
    
    // Build calculation data
    const calculationData = method === 'cumulative_meter' ? {
      energy_start_wh: lastEntry?.calculation_data?.energy_end_wh || 0,
      energy_end_wh: event.energy_wh_total
    } : {
      average_power_w: event.power_w,
      power_samples: 1
    };
    
    // Create quality flags
    const qualityFlags = {
      gap_filled: durationSeconds > 600, // > 10 minutes
      interpolated: method === 'power_integration',
      post_reset: false,
      negative_delta_corrected: false,
      manual_adjustment: false
    };
    
    return await DeviceConsumptionLedger.create({
      esp32_name: event.esp32_name,
      classroom: event.classroom,
      device_id: event.device_id,
      start_ts: startTs,
      end_ts: endTs,
      duration_seconds: durationSeconds,
      delta_wh: delta,
      method,
      calculation_data: calculationData,
      switch_state: switchState,
      switch_on_duration_seconds: onDuration,
      device_status: deviceStatus,
      quality: {
        confidence,
        flags: qualityFlags,
        gap_duration_ms: durationSeconds * 1000
      },
      cost_calculation: {
        cost_per_kwh: costPerKwh,
        cost_inr: costInr
      },
      notes: `Calculated using ${method}`,
      raw_event_ids: [event._id],
      is_reset_marker: false,
      created_by: 'realtime_processor',
      calc_run_id: `realtime_${Date.now()}`
    });
  }
  
  /**
   * Calculate confidence level
   */
  calculateConfidence(event, method, durationSeconds) {
    let confidence = 'high';
    
    // Lower confidence for power integration
    if (method === 'power_integration') {
      confidence = 'medium';
    }
    
    // Lower confidence for large gaps
    if (durationSeconds > 600) { // > 10 minutes
      confidence = 'low';
    }
    
    // Lower confidence if time drift detected
    if (event.quality_flags?.time_drift_detected) {
      confidence = confidence === 'high' ? 'medium' : 'low';
    }
    
    // Lower confidence if out of order
    if (event.quality_flags?.out_of_order) {
      confidence = 'low';
    }
    
    return confidence;
  }
  
  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      isProcessing: this.isProcessing
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      eventsProcessed: 0,
      ledgerEntriesCreated: 0,
      resetsDetected: 0,
      errors: 0
    };
  }
}

// Singleton instance
const ledgerGenerationService = new LedgerGenerationService();

module.exports = ledgerGenerationService;
