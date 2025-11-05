const crypto = require('crypto');
const TelemetryEvent = require('../models/TelemetryEvent');

// Simple logger replacement
const logger = {
  info: (msg, ...args) => console.log(`[TelemetryIngestionService] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[TelemetryIngestionService ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[TelemetryIngestionService WARN] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[TelemetryIngestionService DEBUG] ${msg}`, ...args)
};

/**
 * Telemetry Ingestion Service
 * 
 * Receives telemetry messages from MQTT and stores them as immutable events.
 * Handles deduplication, quality checks, and marks events for processing.
 */
class TelemetryIngestionService {
  constructor() {
    this.recentHashes = new Set(); // In-memory dedup cache
    this.cacheCleanupInterval = null;
  }
  
  /**
   * Initialize service and start cache cleanup
   */
  initialize() {
    // Clean cache every 5 minutes
    this.cacheCleanupInterval = setInterval(() => {
      this.recentHashes.clear();
      logger.debug('[TelemetryIngestion] Cleared dedup cache');
    }, 5 * 60 * 1000);
    
    logger.info('[TelemetryIngestion] Service initialized');
  }
  
  /**
   * Shutdown service
   */
  shutdown() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    logger.info('[TelemetryIngestion] Service shutdown');
  }
  
  /**
   * Calculate event hash for deduplication
   */
  calculateEventHash(esp32_name, device_id, timestamp, payload) {
    const data = `${esp32_name}|${device_id}|${timestamp}|${JSON.stringify(payload)}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Perform quality checks on incoming telemetry
   */
  async performQualityChecks(event, lastEvent) {
    const qualityFlags = {
      time_drift_detected: false,
      out_of_order: false,
      duplicate_suspected: false,
      gap_before_ms: 0,
      confidence: 'high'
    };
    
    const now = new Date();
    const timestamp = new Date(event.timestamp);
    const receivedAt = new Date(event.received_at);
    
    // Check for time drift (> 5 minutes)
    const driftMs = Math.abs(receivedAt - timestamp);
    if (driftMs > 5 * 60 * 1000) {
      qualityFlags.time_drift_detected = true;
      qualityFlags.confidence = 'medium';
      logger.warn(`[TelemetryIngestion] Time drift detected: ${driftMs}ms for ${event.esp32_name}/${event.device_id}`);
    }
    
    // Check for out of order
    if (lastEvent && timestamp < new Date(lastEvent.timestamp)) {
      qualityFlags.out_of_order = true;
      qualityFlags.confidence = 'low';
      logger.warn(`[TelemetryIngestion] Out-of-order event for ${event.esp32_name}/${event.device_id}`);
    }
    
    // Calculate gap from last event
    if (lastEvent) {
      const lastReceived = new Date(lastEvent.received_at);
      const gapMs = receivedAt - lastReceived;
      qualityFlags.gap_before_ms = gapMs;
      
      // Large gap (> 10 minutes)
      if (gapMs > 10 * 60 * 1000) {
        logger.info(`[TelemetryIngestion] Large gap detected: ${gapMs}ms for ${event.esp32_name}/${event.device_id}`);
      }
    }
    
    return qualityFlags;
  }
  
  /**
   * Ingest a single telemetry message
   * 
   * @param {Object} data - Telemetry data from MQTT
   * @param {Object} metadata - MQTT metadata (topic, qos, retained)
   * @returns {Promise<Object>} - Stored event document or null if duplicate
   */
  async ingestTelemetry(data, metadata = {}) {
    try {
      // Validate required fields
      if (!data.esp32_name || !data.classroom || !data.device_id) {
        logger.error('[TelemetryIngestion] Missing required fields:', data);
        return null;
      }
      
      // Ensure timestamp
      const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();
      const received_at = new Date();
      
      // Calculate event hash
      const eventHash = this.calculateEventHash(
        data.esp32_name,
        data.device_id,
        timestamp.toISOString(),
        data
      );
      
      // Check for recent duplicate (in-memory cache)
      if (this.recentHashes.has(eventHash)) {
        logger.debug(`[TelemetryIngestion] Duplicate detected (cache): ${data.esp32_name}/${data.device_id}`);
        return null;
      }
      
      // Check for duplicate in DB (last 5 minutes)
      const isDupe = await TelemetryEvent.isDuplicate(eventHash, 5);
      if (isDupe) {
        logger.debug(`[TelemetryIngestion] Duplicate detected (DB): ${data.esp32_name}/${data.device_id}`);
        return null;
      }
      
      // Add to cache
      this.recentHashes.add(eventHash);
      
      // Get last event for quality checks
      const lastEvent = await TelemetryEvent.getLastEvent(data.esp32_name, data.device_id);
      
      // Perform quality checks
      const qualityFlags = await this.performQualityChecks(
        { ...data, timestamp, received_at },
        lastEvent
      );
      
      // Prepare event document
      const eventDoc = {
        esp32_name: data.esp32_name,
        classroom: data.classroom,
        device_id: data.device_id,
        timestamp,
        received_at,
        power_w: data.power_w,
        energy_wh_total: data.energy_wh_total,
        switch_state: data.switch_state ? new Map(Object.entries(data.switch_state)) : new Map(),
        uptime_seconds: data.uptime_seconds,
        status: data.status || 'online',
        meta: {
          firmware_ver: data.firmware_ver || data.meta?.firmware_ver,
          signal_strength: data.signal_strength || data.meta?.signal_strength,
          free_heap: data.free_heap || data.meta?.free_heap,
          wifi_rssi: data.wifi_rssi || data.meta?.wifi_rssi
        },
        quality_flags: qualityFlags,
        event_hash: eventHash,
        sequence_no: data.sequence_no,
        processed: false,
        mqtt_topic: metadata.topic,
        mqtt_qos: metadata.qos,
        mqtt_retained: metadata.retained
      };
      
      // Store event
      const storedEvent = await TelemetryEvent.create(eventDoc);
      
      logger.info(`[TelemetryIngestion] ✅ Stored event: ${data.esp32_name}/${data.device_id} | ${data.power_w}W | ${data.energy_wh_total}Wh | ${data.status}`);
      
      return storedEvent;
      
    } catch (error) {
      logger.error('[TelemetryIngestion] Error ingesting telemetry:', error);
      return null;
    }
  }
  
  /**
   * Ingest batch of telemetry messages
   */
  async ingestBatch(messages) {
    const results = {
      total: messages.length,
      stored: 0,
      duplicates: 0,
      errors: 0
    };
    
    for (const msg of messages) {
      const result = await this.ingestTelemetry(msg.data, msg.metadata);
      if (result) {
        results.stored++;
      } else if (result === null) {
        results.duplicates++;
      } else {
        results.errors++;
      }
    }
    
    logger.info(`[TelemetryIngestion] Batch complete: ${results.stored} stored, ${results.duplicates} dupes, ${results.errors} errors`);
    
    return results;
  }
  
  /**
   * Handle MQTT telemetry message
   * Wrapper for use with MQTT subscriptions
   */
  async handleMQTTMessage(topic, message, packet) {
    try {
      const data = JSON.parse(message.toString());
      
      const metadata = {
        topic,
        qos: packet.qos,
        retained: packet.retain
      };
      
      return await this.ingestTelemetry(data, metadata);
      
    } catch (error) {
      logger.error('[TelemetryIngestion] Error parsing MQTT message:', error);
      return null;
    }
  }
  
  /**
   * Get statistics
   */
  async getStats() {
    const stats = {
      total_events: await TelemetryEvent.countDocuments(),
      unprocessed_events: await TelemetryEvent.countDocuments({ processed: false }),
      events_last_hour: await TelemetryEvent.countDocuments({
        received_at: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
      }),
      online_devices: await TelemetryEvent.distinct('esp32_name', {
        status: 'online',
        received_at: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 min
      }).then(arr => arr.length)
    };
    
    return stats;
  }
}

// Singleton instance
const telemetryIngestionService = new TelemetryIngestionService();

module.exports = telemetryIngestionService;
