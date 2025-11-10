# AutoVolt - AI Coding Agent Instructions

## System Architecture Overview

AutoVolt is an IoT classroom automation system with a device-centric architecture:

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Radix UI components
- **Backend**: Node.js + Express + MongoDB + MQTT + WebSocket + JWT auth
- **IoT Layer**: ESP32 devices with Arduino firmware controlling classroom appliances
- **AI/ML**: Python FastAPI service for energy analytics and anomaly detection
- **Monitoring**: Prometheus + Grafana stack with custom dashboards
- **Communication**: MQTT for device control, WebSocket for real-time UI updates

## Critical Developer Workflows

### Development Servers
```bash
# Frontend (port 5173)
npm run dev

# Backend (port 3001)
cd backend && npm run dev

# Full stack with Docker
docker-compose up -d
```

### Testing Commands
```bash
# Frontend tests
npm test

# Backend tests
cd backend && npm test

# ESP32 firmware build
pio run -e esp32dev
```

### Database Operations
```bash
# Create indexes
cd backend && node scripts/createIndexes.js

# Reset test data
cd backend && node scripts/clear-test-data.js
```

## Project-Specific Patterns

### Device-Centric Data Model
- **Primary Entity**: `Device` model with embedded `switches` array
- **MAC Address**: Always normalize to colon format (AA:BB:CC:DD:EE:FF)
- **GPIO Validation**: Use `gpioUtils.validateGpioPin()` for ESP32 safety
- **State Management**: Switches have `state`, `manualOverride`, and `lastStateChange`

### Power Consumption Tracking
- **Dual Systems**: Legacy tracker + new immutable ledger system
- **Real-time Tracking**: Start on switch ON, calculate on switch OFF
- **Rate Configuration**: Load from `powerSettings.json` with fallback rates
- **Aggregation**: Daily → Monthly → Classroom summaries

### Real-Time Communication
- **MQTT Topics**: `esp32/switches`, `esp32/config`, `esp32/state`, `esp32/telemetry`
- **WebSocket Events**: `device_state_changed`, `switch_intent`, `bulk_switch_intent`
- **Sequence Numbers**: Use `nextDeviceSeq()` for deterministic UI updates
- **Debouncing**: 500ms debounce window for MQTT state changes

### Authentication & Authorization
- **JWT Tokens**: Stored in localStorage with automatic refresh
- **Role-Based Access**: `admin`, `super-admin`, `faculty`, `student`
- **Device Permissions**: Check `assignedUsers` array + role permissions
- **Route Guards**: Use `authorize()` middleware for API protection

## Integration Points

### ESP32 Device Communication
- **Firmware Updates**: Via MQTT `esp32/config` topic with device secrets
- **State Synchronization**: Bidirectional sync between database and physical devices
- **Motion Sensors**: PIR (GPIO 34) + Microwave (GPIO 35) with configurable logic
- **Manual Switches**: Per-switch GPIO configuration with momentary/maintained modes

### External Services
- **Telegram Bot**: Webhook integration at `/api/telegram/webhook`
- **AI/ML Service**: REST API calls to port 8002 for forecasting/anomaly detection
- **Grafana**: Embedded dashboards with authentication bypass for internal views
- **Prometheus**: Metrics endpoint at `/metrics` with custom device metrics

### Database Patterns
- **Connection**: MongoDB with retry logic and fallback URIs
- **Indexes**: Composite indexes for classroom + status queries
- **Virtuals**: Device model includes `id` virtual for API responses
- **Middleware**: Pre-save validation for GPIO pins and MAC address normalization

## Code Quality Standards

### Frontend Patterns
- **Component Structure**: Use Radix UI primitives with Tailwind styling
- **State Management**: React Query for server state, Context for global state
- **Error Handling**: Try-catch in async operations, error boundaries for components
- **TypeScript**: Strict typing with proper interface definitions

### Backend Patterns
- **Route Organization**: Feature-based routing with middleware chains
- **Error Handling**: Centralized error middleware with status code mapping
- **Logging**: Winston logger with request/response tracking
- **Validation**: Express-validator with custom sanitizers

### Testing Patterns
- **Unit Tests**: Jest with jsdom for frontend, supertest for API routes
- **Integration Tests**: Full request/response cycles with test database
- **Mock Data**: Use test utilities for consistent test data generation
- **Coverage**: Target 80%+ coverage with meaningful assertions

## Common Development Tasks

### Adding New Device Types
1. Update `switchTypes` array in Device model
2. Add power ratings to `powerSettings.json`
3. Update frontend UI components for new type icons
4. Add validation in device creation forms

### Implementing New API Endpoints
1. Create controller function in appropriate controller file
2. Add route in corresponding routes file with auth middleware
3. Update frontend service functions and React Query hooks
4. Add comprehensive tests with error scenarios

### Adding Real-Time Features
1. Define WebSocket event types in frontend SocketContext
2. Implement server-side emission in appropriate service
3. Add sequence numbering for deterministic ordering
4. Update UI components with real-time state management

### ESP32 Firmware Changes
1. Test GPIO configurations with `gpioUtils` validation
2. Update MQTT topic handlers for new message types
3. Maintain backward compatibility with existing device configurations
4. Add comprehensive logging for debugging device issues

## Debugging Commands

### Device Connectivity
```bash
# Check MQTT broker
netstat -ano | findstr :1883

# Test device API
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/devices
```

### Database Issues
```bash
# Check MongoDB connection
mongosh --eval "db.adminCommand('ping')"

# View recent activity logs
cd backend && node check_recent_tickets.js
```

### Real-Time Issues
```bash
# Monitor WebSocket connections
# Check browser Network tab for WebSocket frames

# Test MQTT messages
cd backend && node debug_telegram_registration.js
```

## Deployment Considerations

### Environment Variables
- **Database**: `MONGODB_URI` with fallback support
- **Security**: `JWT_SECRET` (32+ chars), bcrypt rounds = 12
- **MQTT**: Broker host/port with authentication
- **External APIs**: Telegram bot token, SMTP credentials

### Docker Services
- **Dependencies**: Start MongoDB before backend
- **Networking**: Use `iot-network` for service communication
- **Volumes**: Persistent data for Grafana, Prometheus, MongoDB

### Production Hardening
- **Rate Limiting**: API routes protected with express-rate-limit
- **CORS**: Configured for development vs production origins
- **Helmet**: Security headers for all responses
- **Monitoring**: Health checks and metrics endpoints

## Key Files to Reference

### Architecture Understanding
- `README.md`: System overview and quick start
- `backend/server.js`: Main application setup and MQTT integration
- `backend/models/Device.js`: Core data model with validation logic
- `esp32/warp_esp32_stable.ino`: ESP32 firmware implementation

### Development Workflow
- `package.json`: Frontend scripts and dependencies
- `backend/package.json`: Backend scripts and dependencies
- `docker-compose.yml`: Full-stack development environment
- `jest.config.js`: Testing configuration

### Business Logic
- `backend/services/scheduleService.js`: Automated device scheduling
- `backend/services/powerConsumptionTracker.js`: Energy tracking logic
- `ai_ml_service/main.py`: AI/ML analytics implementation
- `backend/services/telegramService.js`: Bot integration logic

Remember: This is a production IoT system controlling physical devices. Always test GPIO configurations, handle device offline states gracefully, and maintain backward compatibility with existing ESP32 firmware versions.