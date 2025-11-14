/**
 * Advanced Monitoring & Observability System for AutoVolt
 * Includes APM, error tracking, distributed tracing, and business metrics
 */

const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');
const jaeger = require('jaeger-client');
const opentracing = require('opentracing');
const newrelic = require('newrelic');
const APM = require('elastic-apm-node');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const NodeCache = require('node-cache');
const Redis = require('ioredis');
const Queue = require('bull');
const Agenda = require('agenda');
const schedule = require('node-schedule');
const os = require('os');
const { EventEmitter } = require('events');

class AutoVoltMonitoringSystem extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            sentry: {
                dsn: process.env.SENTRY_DSN,
                environment: process.env.NODE_ENV || 'development',
                tracesSampleRate: 1.0,
                profilesSampleRate: 1.0,
            },
            jaeger: {
                serviceName: 'autovolt-backend',
                sampler: {
                    type: 'const',
                    param: 1,
                },
                reporter: {
                    collector: {
                        endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
                    },
                },
            },
            newrelic: {
                license_key: process.env.NEW_RELIC_LICENSE_KEY,
                app_name: 'AutoVolt Backend',
            },
            elastic: {
                serviceName: 'autovolt-backend',
                secretToken: process.env.ELASTIC_APM_SECRET_TOKEN,
                serverUrl: process.env.ELASTIC_APM_SERVER_URL,
            },
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD,
            },
            ...config
        };

        this.initialized = false;
        this.tracer = null;
        this.cache = null;
        this.redis = null;
        this.jobQueue = null;
        this.scheduler = null;

        // Metrics storage
        this.metrics = {
            requests: new Map(),
            errors: new Map(),
            performance: new Map(),
            business: new Map(),
        };

        this.init();
    }

    async init() {
        try {
            await this.initErrorTracking();
            await this.initDistributedTracing();
            await this.initAPM();
            await this.initLogging();
            await this.initCaching();
            await this.initJobQueue();
            await this.initScheduler();
            await this.initHealthMonitoring();

            this.initialized = true;
            this.emit('initialized');
            console.log('✅ AutoVolt Monitoring System initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize monitoring system:', error);
            this.emit('error', error);
        }
    }

    // ===== ERROR TRACKING =====

    async initErrorTracking() {
        if (this.config.sentry.dsn) {
            Sentry.init({
                dsn: this.config.sentry.dsn,
                environment: this.config.sentry.environment,
                integrations: [
                    new Sentry.Integrations.Http({ tracing: true }),
                    new Sentry.Integrations.Console(),
                    new Sentry.Integrations.OnUncaughtException(),
                    new Sentry.Integrations.OnUnhandledRejection(),
                    nodeProfilingIntegration(),
                ],
                tracesSampleRate: this.config.sentry.tracesSampleRate,
                profilesSampleRate: this.config.sentry.profilesSampleRate,
            });

            console.log('✅ Sentry error tracking initialized');
        }
    }

    captureError(error, context = {}) {
        if (Sentry.getCurrentHub().getClient()) {
            Sentry.withScope(scope => {
                scope.setTags(context.tags || {});
                scope.setUser(context.user || {});
                scope.setExtras(context.extra || {});
                Sentry.captureException(error);
            });
        }

        // Also log to our custom logging system
        this.logError(error, context);
    }

    captureMessage(message, level = 'info', context = {}) {
        if (Sentry.getCurrentHub().getClient()) {
            Sentry.withScope(scope => {
                scope.setLevel(level);
                scope.setTags(context.tags || {});
                scope.setExtras(context.extra || {});
                Sentry.captureMessage(message);
            });
        }
    }

    // ===== DISTRIBUTED TRACING =====

    async initDistributedTracing() {
        if (this.config.jaeger.reporter.collector.endpoint) {
            const jaegerConfig = this.config.jaeger;
            const tracer = jaeger.initTracer(jaegerConfig);

            opentracing.initGlobalTracer(tracer);
            this.tracer = tracer;

            console.log('✅ Jaeger distributed tracing initialized');
        }
    }

    startSpan(operationName, parentSpan = null) {
        if (!this.tracer) return null;

        const span = parentSpan
            ? this.tracer.startSpan(operationName, { childOf: parentSpan })
            : this.tracer.startSpan(operationName);

        return span;
    }

    injectSpan(span, carrier) {
        if (span && this.tracer) {
            this.tracer.inject(span, opentracing.FORMAT_HTTP_HEADERS, carrier);
        }
    }

    extractSpan(carrier) {
        if (this.tracer) {
            return this.tracer.extract(opentracing.FORMAT_HTTP_HEADERS, carrier);
        }
        return null;
    }

    // ===== APPLICATION PERFORMANCE MONITORING =====

    async initAPM() {
        // New Relic APM
        if (this.config.newrelic.license_key) {
            // New Relic is auto-initialized when required
            console.log('✅ New Relic APM initialized');
        }

        // Elastic APM
        if (this.config.elastic.serverUrl) {
            APM.start({
                serviceName: this.config.elastic.serviceName,
                secretToken: this.config.elastic.secretToken,
                serverUrl: this.config.elastic.serverUrl,
                environment: process.env.NODE_ENV || 'development',
            });
            console.log('✅ Elastic APM initialized');
        }
    }

    startTransaction(name, type = 'request') {
        if (APM.isStarted()) {
            return APM.startTransaction(name, type);
        }
        return null;
    }

    // ===== ADVANCED LOGGING =====

    async initLogging() {
        const logFormat = winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
        );

        const transports = [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }),
            new DailyRotateFile({
                filename: 'logs/autovolt-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: logFormat
            }),
            new DailyRotateFile({
                filename: 'logs/autovolt-error-%DATE%.log',
                datePattern: 'YYYY-MM-DD',
                level: 'error',
                maxSize: '20m',
                maxFiles: '30d',
                format: logFormat
            })
        ];

        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: logFormat,
            transports,
            exceptionHandlers: [
                new DailyRotateFile({
                    filename: 'logs/exceptions-%DATE%.log',
                    datePattern: 'YYYY-MM-DD'
                })
            ]
        });

        console.log('✅ Advanced logging system initialized');
    }

    logError(error, context = {}) {
        this.logger.error('Application Error', {
            error: error.message,
            stack: error.stack,
            ...context,
            timestamp: new Date().toISOString()
        });
    }

    logPerformance(metric, value, tags = {}) {
        this.logger.info('Performance Metric', {
            metric,
            value,
            tags,
            timestamp: new Date().toISOString()
        });
    }

    // ===== CACHING SYSTEM =====

    async initCaching() {
        // In-memory cache
        this.cache = new NodeCache({
            stdTTL: 300, // 5 minutes default
            checkperiod: 60, // Check for expired keys every 60 seconds
            useClones: false
        });

        // Redis cache (if available)
        try {
            this.redis = new Redis(this.config.redis);
            this.redis.on('connect', () => console.log('✅ Redis cache connected'));
            this.redis.on('error', (err) => console.warn('⚠️ Redis connection error:', err.message));
        } catch (error) {
            console.warn('⚠️ Redis not available, using in-memory cache only');
        }
    }

    async get(key) {
        // Try Redis first, then in-memory cache
        if (this.redis) {
            try {
                const value = await this.redis.get(key);
                if (value) return JSON.parse(value);
            } catch (error) {
                // Fall back to in-memory cache
            }
        }
        return this.cache.get(key);
    }

    async set(key, value, ttl = 300) {
        const serializedValue = JSON.stringify(value);

        // Set in both caches
        if (this.redis) {
            try {
                await this.redis.setex(key, ttl, serializedValue);
            } catch (error) {
                // Continue with in-memory cache
            }
        }
        this.cache.set(key, value, ttl);
    }

    // ===== JOB QUEUE SYSTEM =====

    async initJobQueue() {
        if (this.redis) {
            this.jobQueue = new Queue('autovolt-jobs', {
                redis: this.config.redis
            });

            // Define job processors
            this.jobQueue.process('send-notification', async (job) => {
                const { userId, message, type } = job.data;
                // Process notification job
                await this.processNotificationJob(userId, message, type);
            });

            this.jobQueue.process('process-analytics', async (job) => {
                const { data, type } = job.data;
                // Process analytics job
                await this.processAnalyticsJob(data, type);
            });

            console.log('✅ Job queue system initialized');
        }
    }

    async addJob(jobType, data, options = {}) {
        if (this.jobQueue) {
            return await this.jobQueue.add(jobType, data, options);
        }
        // Fallback: process immediately
        console.warn('⚠️ Job queue not available, processing immediately');
        return null;
    }

    // ===== SCHEDULER SYSTEM =====

    async initScheduler() {
        if (this.redis) {
            this.scheduler = new Agenda({
                db: {
                    address: `redis://${this.config.redis.host}:${this.config.redis.port}`,
                    collection: 'agendaJobs'
                }
            });

            // Define scheduled jobs
            this.scheduler.define('daily-analytics-report', async (job) => {
                await this.generateDailyAnalyticsReport();
            });

            this.scheduler.define('hourly-health-check', async (job) => {
                await this.performHealthCheck();
            });

            await this.scheduler.start();
            console.log('✅ Scheduler system initialized');
        }
    }

    // ===== HEALTH MONITORING =====

    async initHealthMonitoring() {
        // Schedule health checks
        schedule.scheduleJob('*/5 * * * *', async () => { // Every 5 minutes
            await this.performHealthCheck();
        });

        // Schedule daily reports
        schedule.scheduleJob('0 2 * * *', async () => { // Daily at 2 AM
            await this.generateDailyAnalyticsReport();
        });

        console.log('✅ Health monitoring initialized');
    }

    async performHealthCheck() {
        const health = {
            timestamp: new Date().toISOString(),
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                platform: process.platform,
                nodeVersion: process.version
            },
            services: {
                redis: this.redis ? await this.checkRedisHealth() : false,
                database: await this.checkDatabaseHealth(),
                mqtt: await this.checkMQTTHealth(),
                aiService: await this.checkAIServiceHealth()
            },
            metrics: {
                activeConnections: 0, // Would be populated by actual metrics
                requestRate: 0,
                errorRate: 0
            }
        };

        // Store health data
        await this.set(`health:${Date.now()}`, health, 3600); // Keep for 1 hour

        // Emit health event
        this.emit('health-check', health);

        return health;
    }

    async checkRedisHealth() {
        try {
            await this.redis.ping();
            return true;
        } catch {
            return false;
        }
    }

    async checkDatabaseHealth() {
        // Implement database health check
        return true; // Placeholder
    }

    async checkMQTTHealth() {
        // Implement MQTT health check
        return true; // Placeholder
    }

    async checkAIServiceHealth() {
        // Implement AI service health check
        return true; // Placeholder
    }

    // ===== BUSINESS METRICS =====

    recordBusinessMetric(metricName, value, tags = {}) {
        const key = `${metricName}:${JSON.stringify(tags)}`;
        const timestamp = Date.now();

        if (!this.metrics.business.has(key)) {
            this.metrics.business.set(key, []);
        }

        this.metrics.business.get(key).push({
            value,
            timestamp,
            tags
        });

        // Keep only last 1000 entries per metric
        const entries = this.metrics.business.get(key);
        if (entries.length > 1000) {
            entries.splice(0, entries.length - 1000);
        }
    }

    getBusinessMetrics(metricName, tags = {}, timeRange = 3600000) { // 1 hour default
        const key = `${metricName}:${JSON.stringify(tags)}`;
        const cutoff = Date.now() - timeRange;

        const entries = this.metrics.business.get(key) || [];
        return entries.filter(entry => entry.timestamp >= cutoff);
    }

    // ===== PERFORMANCE MONITORING =====

    startRequestMonitoring(req, res) {
        const startTime = Date.now();
        const span = this.startSpan('http-request');

        if (span) {
            span.setTag('http.method', req.method);
            span.setTag('http.url', req.url);
            span.setTag('http.user_agent', req.get('User-Agent'));
        }

        // Monitor response
        const originalEnd = res.end;
        res.end = (...args) => {
            const duration = Date.now() - startTime;

            // Record metrics
            this.recordBusinessMetric('request_duration', duration, {
                method: req.method,
                route: req.route?.path || req.url,
                status: res.statusCode
            });

            this.recordBusinessMetric('request_count', 1, {
                method: req.method,
                route: req.route?.path || req.url,
                status: res.statusCode
            });

            // Finish span
            if (span) {
                span.setTag('http.status_code', res.statusCode);
                span.setTag('http.duration', duration);
                span.finish();
            }

            originalEnd.apply(res, args);
        };

        return span;
    }

    // ===== ANALYTICS & REPORTING =====

    async generateDailyAnalyticsReport() {
        const report = {
            date: new Date().toISOString().split('T')[0],
            metrics: {
                totalRequests: this.getBusinessMetrics('request_count').length,
                averageResponseTime: this.calculateAverageResponseTime(),
                errorRate: this.calculateErrorRate(),
                userActivity: this.getUserActivityMetrics(),
                deviceMetrics: this.getDeviceMetrics(),
                energyMetrics: this.getEnergyMetrics()
            },
            alerts: await this.generateAlerts(),
            recommendations: await this.generateRecommendations()
        };

        // Store report
        await this.set(`daily-report:${report.date}`, report);

        // Emit report event
        this.emit('daily-report', report);

        return report;
    }

    calculateAverageResponseTime() {
        const durations = this.getBusinessMetrics('request_duration');
        if (durations.length === 0) return 0;

        const total = durations.reduce((sum, entry) => sum + entry.value, 0);
        return total / durations.length;
    }

    calculateErrorRate() {
        const requests = this.getBusinessMetrics('request_count');
        const errors = requests.filter(req => req.tags.status >= 400).length;
        return requests.length > 0 ? errors / requests.length : 0;
    }

    getUserActivityMetrics() {
        // Implement user activity tracking
        return {
            activeUsers: 0,
            newUsers: 0,
            sessionDuration: 0
        };
    }

    getDeviceMetrics() {
        // Implement device metrics
        return {
            totalDevices: 0,
            onlineDevices: 0,
            offlineDevices: 0
        };
    }

    getEnergyMetrics() {
        // Implement energy metrics
        return {
            totalConsumption: 0,
            averageConsumption: 0,
            peakConsumption: 0
        };
    }

    async generateAlerts() {
        const alerts = [];

        const errorRate = this.calculateErrorRate();
        if (errorRate > 0.05) { // 5% error rate
            alerts.push({
                type: 'error_rate_high',
                severity: 'high',
                message: `Error rate is ${errorRate.toFixed(2)}%, above threshold of 5%`
            });
        }

        const avgResponseTime = this.calculateAverageResponseTime();
        if (avgResponseTime > 2000) { // 2 seconds
            alerts.push({
                type: 'response_time_high',
                severity: 'medium',
                message: `Average response time is ${avgResponseTime.toFixed(0)}ms, above threshold of 2000ms`
            });
        }

        return alerts;
    }

    async generateRecommendations() {
        const recommendations = [];

        const errorRate = this.calculateErrorRate();
        if (errorRate > 0.02) {
            recommendations.push('Consider implementing additional error handling and monitoring');
        }

        const avgResponseTime = this.calculateAverageResponseTime();
        if (avgResponseTime > 1000) {
            recommendations.push('Consider optimizing database queries and implementing caching');
        }

        return recommendations;
    }

    // ===== UTILITY METHODS =====

    async cleanup() {
        if (this.redis) {
            await this.redis.quit();
        }
        if (this.jobQueue) {
            await this.jobQueue.close();
        }
        if (this.scheduler) {
            await this.scheduler.stop();
        }
        if (this.tracer) {
            this.tracer.close();
        }
    }

    getMetrics() {
        return {
            requests: Object.fromEntries(this.metrics.requests),
            errors: Object.fromEntries(this.metrics.errors),
            performance: Object.fromEntries(this.metrics.performance),
            business: Object.fromEntries(this.metrics.business)
        };
    }

    getHealth() {
        return {
            initialized: this.initialized,
            services: {
                sentry: !!Sentry.getCurrentHub().getClient(),
                jaeger: !!this.tracer,
                redis: !!this.redis,
                jobQueue: !!this.jobQueue,
                scheduler: !!this.scheduler,
                cache: !!this.cache
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        };
    }
}

// Global monitoring instance
const monitoring = new AutoVoltMonitoringSystem();

module.exports = {
    AutoVoltMonitoringSystem,
    monitoring
};