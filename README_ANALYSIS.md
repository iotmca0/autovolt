
# AutoVolt: Intelligent IoT Classroom Automation

AutoVolt is a comprehensive IoT solution designed for smart classroom management. It integrates hardware (ESP32), a full-stack web application, and an AI/ML service to automate, monitor, and optimize energy consumption in an educational environment.

## Core Features

### 1. Real-time Device Control & Monitoring
- **Remote Control:** Control lights, fans, ACs, and other appliances via a web dashboard.
- **Live Status:** Real-time status updates for all devices (online/offline, on/off).
- **Master Switches:** Group controls for entire classrooms or device types.
- **Scheduling:** Create complex schedules for devices to operate automatically.

### 2. Energy Management & Analytics
- **Power Consumption Tracking:** Live and historical power usage data for each device.
- **Cost Analysis:** Calculates energy costs based on configurable rates.
- **Data Visualization:** Interactive charts and graphs for energy trends, usage patterns, and cost breakdowns.
- **Reporting:** Export analytics data to PDF/CSV.

### 3. AI/ML Insights
- **Energy Forecasting:** Predicts future energy consumption using advanced time-series models (Prophet).
- **Anomaly Detection:** Identifies unusual energy usage or device behavior using models like Isolation Forest, KNN, and LOF.
- **Predictive Maintenance:** Forecasts potential device failures, allowing for proactive maintenance.
- **Voice Analytics:** Analyzes voice commands for intent, success rate, and usage patterns.

### 4. Voice Control & Assistant
- **Hands-Free Operation:** Control devices using voice commands.
- **Natural Language Processing (NLP):** Understands natural language to parse intents and entities (e.g., "Turn on the lights in Classroom A").
- **Multi-platform Support:** Works in the browser and on Android devices.
- **TTS Feedback:** Provides audible feedback for actions.

### 5. IoT & Hardware Integration
- **ESP32 Firmware:** Custom Arduino-based firmware for ESP32 microcontrollers.
- **MQTT Communication:** Robust and low-latency communication between the backend and IoT devices.
- **Motion Sensing:** Dual-sensor (PIR + Microwave) support for automated presence detection.
- **Over-the-Air (OTA) Updates:** Remotely update ESP32 firmware.

### 6. User & Access Management
- **Role-Based Access Control (RBAC):** Granular permissions for Admins, Faculty, and Students.
- **Device & Classroom Permissions:** Assign users to specific classrooms or devices.
- **JWT Authentication:** Secure authentication with JSON Web Tokens.

### 7. System Health & Monitoring
- **Real-time Monitoring:** Integrated with Prometheus and Grafana for monitoring system and device metrics.
- **Activity Logging:** Detailed logs of all user and system actions.
- **Notification System:** In-app and push notifications for important events (e.g., device offline, high energy usage).
- **Support Ticketing System:** Integrated helpdesk for users to report issues.

## Technology Stack

### Frontend
- **Framework:** React 18 with Vite
- **Language:** TypeScript
- **UI Components:** Radix UI & Shadcn UI
- **Styling:** Tailwind CSS
- **State Management:** React Query (for server state), Zustand & Context API (for global state)
- **Charting:** Recharts
- **Routing:** React Router
- **Form Handling:** React Hook Form with Zod for validation
- **Mobile:** Capacitor for Android integration

### Backend
- **Framework:** Node.js with Express
- **Language:** JavaScript (ESM)
- **Database:** MongoDB with Mongoose
- **Real-time Communication:**
    - **MQTT:** Aedes broker for IoT device communication
    - **WebSockets:** Socket.IO for real-time UI updates
- **Authentication:** JWT (JSON Web Tokens)
- **API Validation:** express-validator
- **Logging:** Winston & Morgan
- **Job Scheduling:** node-cron, Agenda

### AI/ML Service
- **Framework:** Python with FastAPI
- **Core Libraries:**
    - **ML/DL:** TensorFlow, PyTorch, Scikit-learn
    - **Forecasting:** Prophet, Statsmodels
    - **NLP:** spaCy, NLTK, Transformers (Hugging Face)
    - **Computer Vision:** OpenCV, Ultralytics (YOLO)
    - **Anomaly Detection:** PyOD
- **Model Management:** MLflow
- **API:** Pydantic for data validation

### IoT Layer
- **Hardware:** ESP32 Microcontrollers
- **Firmware:** Arduino (C++)
- **Communication Protocol:** MQTT
- **Build System:** PlatformIO

### DevOps & Monitoring
- **Containerization:** Docker, Docker Compose
- **Web Server/Proxy:** Nginx
- **Monitoring:** Prometheus, Grafana
- **Process Management:** PM2 (ecosystem.config.js)
- **CI/CD:** (Implied via scripts, but no formal CI config file present)

## Potential Areas for Improvement

### 1. Codebase & Architecture
- **Backend Language:** Migrate the Node.js backend from JavaScript to **TypeScript**. This would improve type safety, reduce runtime errors, and align it with the frontend's tech stack.
- **Monorepo Structure:** The project is split into `frontend`, `backend`, and `ai_ml_service`. Adopting a formal monorepo structure using tools like **Turborepo** or **Nx** would simplify dependency management, streamline builds, and improve code sharing.
- **Configuration Management:** Centralize configuration. Currently, settings are spread across `.env` files, `config.ts`, and hardcoded values. A unified config service would be beneficial.

### 2. Testing & Quality Assurance
- **Increase Test Coverage:** The project has a testing setup (Jest, React Testing Library, Supertest), but coverage can be expanded, especially for critical backend services and UI components.
- **End-to-End (E2E) Testing:** Implement E2E tests using a framework like **Cypress** or **Playwright**. This would automate testing of user flows from the UI to the database.
- **Static Analysis:** Enhance ESLint rules and introduce tools like **SonarLint** to catch code quality and security issues earlier.

### 3. DevOps & Deployment
- **CI/CD Pipeline:** Create a formal CI/CD pipeline using **GitHub Actions**. This could automate linting, testing, building Docker images, and deploying to a staging/production environment.
- **Database Migrations:** The current `createIndexes.js` script is manual. A proper migration framework (like `migrate-mongo-ose`) would provide versioning and better control over database schema changes.
- **Kubernetes Deployment:** For better scalability and resilience, consider deploying the services to a **Kubernetes** cluster instead of using Docker Compose for production.

### 4. AI/ML Enhancements
- **Online Learning:** Implement online learning for the anomaly detection models, allowing them to adapt to new data patterns in real-time without full retraining.
- **Optimized Models:** For computer vision on edge devices (if applicable), use optimized models like **YOLOv8-Nano** or **MobileNet** to reduce resource consumption.
- **MLOps Pipeline:** Formalize the MLOps pipeline. While MLflow is used, a full pipeline could include automated data validation (e.g., with `Great Expectations`), continuous training, and model monitoring.

### 5. User Experience & Features
- **Internationalization (i18n):** Add support for multiple languages in the frontend.
- **Web3/Blockchain:** For auditing and security, a private blockchain could be used to create an immutable ledger of all device state changes and commands.
- **Advanced 3D Visuals:** The stubs for 3D components exist. Fully implementing a 3D digital twin of the classroom using **Three.js** or **Babylon.js** would provide a highly intuitive interface.
