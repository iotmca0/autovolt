/**
 * Reconciliation Job
 * 
 * Runs nightly to detect and fix data quality issues in the power consumption system.
 * 
 * Features:
 * - Detects anomalies: negative deltas, missing heartbeats, large gaps
 * - Auto-fixes safe issues: interpolate small gaps, mark suspicious entries
 * - Creates review tickets for manual intervention
 * - Triggers re-aggregation for affected periods
 * - Sends notifications for critical issues
 * 
 * Schedule: Runs at 2:00 AM IST daily
 */

const TelemetryEvent = require('../models/TelemetryEvent');
const DeviceConsumptionLedger = require('../models/DeviceConsumptionLedger');
const DailyAggregate = require('../models/DailyAggregate');
const ledgerGenerationService = require('../services/ledgerGenerationService');
const aggregationService = require('../services/aggregationService');

class ReconciliationJob {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.stats = {
      totalChecks: 0,
      anomaliesDetected: 0,
      autoFixed: 0,
      reviewTickets: 0,
      reAggregations: 0
    };
  }

  /**
   * Main reconciliation job entry point
   */
  async run() {
    if (this.isRunning) {
      console.log('[ReconciliationJob] Already running, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      const startTime = Date.now();
      console.log('[ReconciliationJob] Starting reconciliation at', new Date().toISOString());

      // Reset stats
      this.stats = {
        totalChecks: 0,
        anomaliesDetected: 0,
        autoFixed: 0,
        reviewTickets: 0,
        reAggregations: 0,
        startTime: new Date(),
        errors: []
      };

      // Get date range for reconciliation (last 7 days)
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);

      // Run all reconciliation checks
      await this.checkMissingHeartbeats(startDate, endDate);
      await this.checkNegativeDeltas(startDate, endDate);
      await this.checkLargeGaps(startDate, endDate);
      await this.checkAnomalousConsumption(startDate, endDate);
      await this.checkUnprocessedTelemetry();
      await this.checkOrphanedLedgerEntries();
      await this.validateDailyAggregates(startDate, endDate);

      // Generate summary report
      const duration = Date.now() - startTime;
      this.stats.endTime = new Date();
      this.stats.durationMs = duration;

      console.log('[ReconciliationJob] Completed in', duration, 'ms');
      console.log('[ReconciliationJob] Stats:', JSON.stringify(this.stats, null, 2));

      this.lastRun = new Date();

      // Send notification if critical issues found
      if (this.stats.reviewTickets > 0) {
        await this.sendNotification();
      }

      return this.stats;

    } catch (error) {
      console.error('[ReconciliationJob] Error:', error);
      this.stats.errors.push({
        message: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check for missing heartbeats (devices that should be online but aren't sending data)
   */
  async checkMissingHeartbeats(startDate, endDate) {
    console.log('[ReconciliationJob] Checking missing heartbeats...');

    try {
      // Get all unique ESP32 devices from telemetry
      const devices = await TelemetryEvent.distinct('esp32_name', {
        received_at: { $gte: startDate, $lte: endDate }
      });

      for (const esp32_name of devices) {
        this.stats.totalChecks++;

        // Get last telemetry for this device
        const lastTelemetry = await TelemetryEvent.findOne({
          esp32_name,
          received_at: { $lte: endDate }
        }).sort({ received_at: -1 });

        if (!lastTelemetry) continue;

        const timeSinceLastTelemetry = endDate - lastTelemetry.received_at;
        const minutesSince = timeSinceLastTelemetry / (1000 * 60);

        // If more than 10 minutes since last heartbeat, flag as anomaly
        if (minutesSince > 10) {
          this.stats.anomaliesDetected++;

          // Check if this is a known offline period (LWT status = offline)
          const offlineStatus = await TelemetryEvent.findOne({
            esp32_name,
            status: 'offline',
            received_at: { $gte: lastTelemetry.received_at, $lte: endDate }
          });

          if (!offlineStatus) {
            // No offline status found - this is suspicious
            console.warn(`[ReconciliationJob] Missing heartbeat: ${esp32_name}, last seen ${minutesSince.toFixed(0)} minutes ago`);

            // Create review ticket
            await this.createReviewTicket({
              type: 'missing_heartbeat',
              severity: minutesSince > 60 ? 'high' : 'medium',
              esp32_name,
              description: `Device ${esp32_name} has not sent telemetry for ${minutesSince.toFixed(0)} minutes`,
              last_seen: lastTelemetry.received_at,
              data: {
                minutes_since_last_telemetry: minutesSince,
                last_telemetry_id: lastTelemetry._id
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('[ReconciliationJob] Error checking missing heartbeats:', error);
      this.stats.errors.push({ check: 'missing_heartbeats', error: error.message });
    }
  }

  /**
   * Check for negative energy deltas (impossible - indicates counter reset or data corruption)
   */
  async checkNegativeDeltas(startDate, endDate) {
    console.log('[ReconciliationJob] Checking negative deltas...');

    try {
      // Find ledger entries with negative deltas
      const negativeDeltas = await DeviceConsumptionLedger.find({
        start_ts: { $gte: startDate, $lte: endDate },
        delta_wh: { $lt: 0 }
      });

      for (const entry of negativeDeltas) {
        this.stats.totalChecks++;
        this.stats.anomaliesDetected++;

        console.warn(`[ReconciliationJob] Negative delta found: ${entry.esp32_name}, delta=${entry.delta_wh} Wh`);

        // Check if this is already marked as a reset
        if (entry.is_reset_marker) {
          // Already handled, skip
          continue;
        }

        // Auto-fix: Mark as reset marker if not already
        await DeviceConsumptionLedger.updateOne(
          { _id: entry._id },
          {
            $set: {
              is_reset_marker: true,
              reset_reason: 'negative_delta_detected_by_reconciliation',
              'quality.confidence': 'low',
              'quality.flags': [...(entry.quality.flags || []), 'reconciliation_marked_as_reset']
            }
          }
        );

        this.stats.autoFixed++;
        console.log(`[ReconciliationJob] Auto-fixed: Marked entry ${entry._id} as reset marker`);
      }
    } catch (error) {
      console.error('[ReconciliationJob] Error checking negative deltas:', error);
      this.stats.errors.push({ check: 'negative_deltas', error: error.message });
    }
  }

  /**
   * Check for large gaps in telemetry (>10 minutes)
   */
  async checkLargeGaps(startDate, endDate) {
    console.log('[ReconciliationJob] Checking large gaps...');

    try {
      // Get all unique ESP32 devices
      const devices = await TelemetryEvent.distinct('esp32_name', {
        received_at: { $gte: startDate, $lte: endDate }
      });

      for (const esp32_name of devices) {
        this.stats.totalChecks++;

        // Get telemetry sorted by time
        const telemetry = await TelemetryEvent.find({
          esp32_name,
          received_at: { $gte: startDate, $lte: endDate }
        }).sort({ received_at: 1 });

        // Check gaps between consecutive telemetry events
        for (let i = 1; i < telemetry.length; i++) {
          const prev = telemetry[i - 1];
          const curr = telemetry[i];

          const gap = curr.received_at - prev.received_at;
          const gapMinutes = gap / (1000 * 60);

          // If gap > 10 minutes, investigate
          if (gapMinutes > 10) {
            this.stats.anomaliesDetected++;

            // Check if there's a corresponding offline status
            const offlineStatus = await TelemetryEvent.findOne({
              esp32_name,
              status: 'offline',
              received_at: { $gte: prev.received_at, $lte: curr.received_at }
            });

            if (offlineStatus) {
              // Known offline period, this is OK
              continue;
            }

            console.warn(`[ReconciliationJob] Large gap found: ${esp32_name}, gap=${gapMinutes.toFixed(0)} minutes`);

            // If gap is small enough (10-30 min), try to interpolate
            if (gapMinutes <= 30) {
              await this.interpolateGap(prev, curr, esp32_name);
              this.stats.autoFixed++;
            } else {
              // Too large to interpolate, create review ticket
              await this.createReviewTicket({
                type: 'large_gap',
                severity: 'medium',
                esp32_name,
                description: `Large gap (${gapMinutes.toFixed(0)} minutes) in telemetry for ${esp32_name}`,
                start_time: prev.received_at,
                end_time: curr.received_at,
                data: {
                  gap_minutes: gapMinutes,
                  prev_telemetry_id: prev._id,
                  curr_telemetry_id: curr._id
                }
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('[ReconciliationJob] Error checking large gaps:', error);
      this.stats.errors.push({ check: 'large_gaps', error: error.message });
    }
  }

  /**
   * Interpolate small gaps in telemetry data
   */
  async interpolateGap(prevTelemetry, currTelemetry, esp32_name) {
    try {
      console.log(`[ReconciliationJob] Interpolating gap for ${esp32_name}...`);

      // Calculate average power during this period
      const timeDiff = currTelemetry.received_at - prevTelemetry.received_at;
      const hours = timeDiff / (1000 * 3600);

      // If we have energy_wh_total, calculate delta
      if (prevTelemetry.energy_wh_total != null && currTelemetry.energy_wh_total != null) {
        const energyDelta = currTelemetry.energy_wh_total - prevTelemetry.energy_wh_total;
        const avgPower = energyDelta / hours;

        // Create interpolated ledger entry
        const interpolatedEntry = {
          esp32_name,
          classroom: prevTelemetry.classroom,
          device_id: 'all_devices', // Aggregate for all devices
          start_ts: prevTelemetry.received_at,
          end_ts: currTelemetry.received_at,
          start_energy_wh_total: prevTelemetry.energy_wh_total,
          end_energy_wh_total: currTelemetry.energy_wh_total,
          delta_wh: energyDelta,
          duration_seconds: timeDiff / 1000,
          method: 'interpolated',
          calculation_data: {
            interpolated_by_reconciliation: true,
            avg_power_w: avgPower,
            original_gap_minutes: timeDiff / (1000 * 60)
          },
          switch_state: 'unknown',
          switch_on_duration_seconds: 0,
          device_status: 'online_with_gap',
          quality: {
            confidence: 'low',
            flags: ['interpolated', 'large_gap'],
            time_drift_seconds: 0,
            out_of_order: false
          },
          source_telemetry_ids: [prevTelemetry._id, currTelemetry._id],
          is_reset_marker: false
        };

        // Check if similar entry already exists
        const existing = await DeviceConsumptionLedger.findOne({
          esp32_name,
          start_ts: interpolatedEntry.start_ts,
          end_ts: interpolatedEntry.end_ts
        });

        if (!existing) {
          await DeviceConsumptionLedger.create(interpolatedEntry);
          console.log(`[ReconciliationJob] Created interpolated ledger entry for ${esp32_name}`);
        }
      }
    } catch (error) {
      console.error('[ReconciliationJob] Error interpolating gap:', error);
    }
  }

  /**
   * Check for anomalous consumption values (unreasonably high or low)
   */
  async checkAnomalousConsumption(startDate, endDate) {
    console.log('[ReconciliationJob] Checking anomalous consumption...');

    try {
      // Find ledger entries with unusually high power (>10 kW per device)
      const highConsumption = await DeviceConsumptionLedger.find({
        start_ts: { $gte: startDate, $lte: endDate },
        delta_wh: { $gt: 10000 }, // >10 kWh in one reading
        is_reset_marker: false
      });

      for (const entry of highConsumption) {
        this.stats.totalChecks++;
        this.stats.anomaliesDetected++;

        console.warn(`[ReconciliationJob] Anomalous high consumption: ${entry.esp32_name}, delta=${entry.delta_wh} Wh`);

        // Flag for manual review
        await this.createReviewTicket({
          type: 'anomalous_consumption',
          severity: 'high',
          esp32_name: entry.esp32_name,
          description: `Unusually high consumption detected: ${(entry.delta_wh / 1000).toFixed(2)} kWh`,
          timestamp: entry.start_ts,
          data: {
            delta_wh: entry.delta_wh,
            duration_seconds: entry.duration_seconds,
            calculated_power_w: (entry.delta_wh / (entry.duration_seconds / 3600)),
            ledger_entry_id: entry._id
          }
        });

        // Lower confidence level
        await DeviceConsumptionLedger.updateOne(
          { _id: entry._id },
          {
            $set: {
              'quality.confidence': 'low',
              'quality.flags': [...(entry.quality.flags || []), 'anomalous_high_consumption']
            }
          }
        );
        this.stats.autoFixed++;
      }
    } catch (error) {
      console.error('[ReconciliationJob] Error checking anomalous consumption:', error);
      this.stats.errors.push({ check: 'anomalous_consumption', error: error.message });
    }
  }

  /**
   * Check for unprocessed telemetry events (processed=false)
   */
  async checkUnprocessedTelemetry() {
    console.log('[ReconciliationJob] Checking unprocessed telemetry...');

    try {
      // Find telemetry events that are older than 1 hour but still unprocessed
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const unprocessed = await TelemetryEvent.find({
        processed: false,
        received_at: { $lt: oneHourAgo }
      }).limit(100);

      if (unprocessed.length > 0) {
        console.warn(`[ReconciliationJob] Found ${unprocessed.length} unprocessed telemetry events`);
        this.stats.anomaliesDetected += unprocessed.length;

        // Try to process them now
        for (const event of unprocessed) {
          try {
            await ledgerGenerationService.processEvent(event);
            this.stats.autoFixed++;
          } catch (error) {
            console.error(`[ReconciliationJob] Failed to process event ${event._id}:`, error);
            
            // Create review ticket for failed events
            await this.createReviewTicket({
              type: 'unprocessed_telemetry',
              severity: 'medium',
              esp32_name: event.esp32_name,
              description: `Failed to process telemetry event from ${event.received_at.toISOString()}`,
              timestamp: event.received_at,
              data: {
                telemetry_event_id: event._id,
                error: error.message
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('[ReconciliationJob] Error checking unprocessed telemetry:', error);
      this.stats.errors.push({ check: 'unprocessed_telemetry', error: error.message });
    }
  }

  /**
   * Check for orphaned ledger entries (no corresponding telemetry)
   */
  async checkOrphanedLedgerEntries() {
    console.log('[ReconciliationJob] Checking orphaned ledger entries...');

    try {
      // Sample check: Find ledger entries without source telemetry
      const ledgerEntries = await DeviceConsumptionLedger.find({
        source_telemetry_ids: { $exists: true, $ne: [] }
      }).limit(100);

      for (const entry of ledgerEntries) {
        this.stats.totalChecks++;

        // Check if source telemetry still exists
        if (entry.source_telemetry_ids && entry.source_telemetry_ids.length > 0) {
          const telemetryExists = await TelemetryEvent.countDocuments({
            _id: { $in: entry.source_telemetry_ids }
          });

          if (telemetryExists === 0) {
            // Orphaned entry - telemetry was deleted
            this.stats.anomaliesDetected++;
            console.warn(`[ReconciliationJob] Orphaned ledger entry: ${entry._id}`);

            // Flag but don't delete (preserve audit trail)
            await DeviceConsumptionLedger.updateOne(
              { _id: entry._id },
              {
                $set: {
                  'quality.flags': [...(entry.quality.flags || []), 'orphaned_source_telemetry']
                }
              }
            );
            this.stats.autoFixed++;
          }
        }
      }
    } catch (error) {
      console.error('[ReconciliationJob] Error checking orphaned entries:', error);
      this.stats.errors.push({ check: 'orphaned_entries', error: error.message });
    }
  }

  /**
   * Validate daily aggregates match ledger totals
   */
  async validateDailyAggregates(startDate, endDate) {
    console.log('[ReconciliationJob] Validating daily aggregates...');

    try {
      // Get all daily aggregates in date range
      const aggregates = await DailyAggregate.find({
        date: { $gte: startDate, $lte: endDate }
      });

      for (const aggregate of aggregates) {
        this.stats.totalChecks++;

        // Calculate actual total from ledger
        const ledgerTotal = await DeviceConsumptionLedger.aggregate([
          {
            $match: {
              classroom: aggregate.classroom,
              device_id: aggregate.device_id,
              start_ts: {
                $gte: new Date(aggregate.date_string + 'T00:00:00+05:30'),
                $lt: new Date(new Date(aggregate.date_string + 'T00:00:00+05:30').getTime() + 24 * 3600 * 1000)
              },
              is_reset_marker: false
            }
          },
          {
            $group: {
              _id: null,
              total_wh: { $sum: '$delta_wh' }
            }
          }
        ]);

        const actualTotal = ledgerTotal.length > 0 ? ledgerTotal[0].total_wh : 0;
        const aggregateTotal = aggregate.total_wh;

        // Allow 1% tolerance for floating point errors
        const tolerance = Math.max(1, aggregateTotal * 0.01);
        const diff = Math.abs(actualTotal - aggregateTotal);

        if (diff > tolerance) {
          this.stats.anomaliesDetected++;
          console.warn(`[ReconciliationJob] Aggregate mismatch: ${aggregate.classroom}/${aggregate.device_id} on ${aggregate.date_string}, aggregate=${aggregateTotal} Wh, ledger=${actualTotal} Wh, diff=${diff.toFixed(2)} Wh`);

          // Trigger re-aggregation
          await this.triggerReAggregation(aggregate.classroom, new Date(aggregate.date_string));
          this.stats.reAggregations++;
        }
      }
    } catch (error) {
      console.error('[ReconciliationJob] Error validating aggregates:', error);
      this.stats.errors.push({ check: 'validate_aggregates', error: error.message });
    }
  }

  /**
   * Trigger re-aggregation for a specific date
   */
  async triggerReAggregation(classroom, date) {
    try {
      console.log(`[ReconciliationJob] Triggering re-aggregation for ${classroom} on ${date.toISOString()}`);
      await aggregationService.aggregateDaily(date, classroom);
      console.log(`[ReconciliationJob] Re-aggregation completed for ${classroom}`);
    } catch (error) {
      console.error('[ReconciliationJob] Error triggering re-aggregation:', error);
    }
  }

  /**
   * Create a review ticket for manual intervention
   */
  async createReviewTicket(ticket) {
    try {
      this.stats.reviewTickets++;

      // In production, this would create a ticket in a ticketing system
      // For now, we'll log to console and could store in a ReviewTickets collection
      console.log('[ReconciliationJob] Review Ticket Created:', JSON.stringify(ticket, null, 2));

      // TODO: Store in ReviewTickets collection or send to external ticketing system
      // await ReviewTicket.create({
      //   ...ticket,
      //   status: 'open',
      //   created_at: new Date(),
      //   assigned_to: null
      // });

    } catch (error) {
      console.error('[ReconciliationJob] Error creating review ticket:', error);
    }
  }

  /**
   * Send notification for critical issues
   */
  async sendNotification() {
    try {
      console.log('[ReconciliationJob] Sending notification for', this.stats.reviewTickets, 'review tickets');

      // TODO: Implement notification via email, Slack, Telegram, etc.
      // Example:
      // await emailService.send({
      //   to: 'admin@autovolt.com',
      //   subject: 'Power System Reconciliation Report',
      //   body: `Found ${this.stats.reviewTickets} issues requiring review`
      // });

    } catch (error) {
      console.error('[ReconciliationJob] Error sending notification:', error);
    }
  }

  /**
   * Get job statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      lastRun: this.lastRun
    };
  }

  /**
   * Schedule the job to run at 2:00 AM IST daily
   */
  schedule(cronJob) {
    // Using node-cron: '0 2 * * *' = 2:00 AM daily
    cronJob.schedule('0 2 * * *', async () => {
      console.log('[ReconciliationJob] Scheduled run starting...');
      try {
        await this.run();
      } catch (error) {
        console.error('[ReconciliationJob] Scheduled run failed:', error);
      }
    });

    console.log('[ReconciliationJob] Scheduled to run daily at 2:00 AM IST');
  }
}

// Export singleton instance
module.exports = new ReconciliationJob();
