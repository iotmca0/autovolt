CHAPTER- 1
1. INTRODUCTION
1.1 Overview
AutoVolt is an innovative Internet of Things (IoT) platform developed to enhance classroom automation and energy management within educational institutions. The system integrates ESP32-based hardware controllers with a modern web application, enabling real-time monitoring and control of classroom electrical appliances such as lights, fans, air conditioners, and projectors. The primary objective of AutoVolt is to optimize energy consumption, minimize operational costs, and promote sustainability in academic environments through the application of intelligent analytics and predictive insights.

In the domain of computer applications, AutoVolt represents the convergence of embedded systems, full-stack web development, and artificial intelligence. It demonstrates the practical use of technologies such as MQTT for efficient device communication, React.js for building responsive user interfaces, Node.js for developing scalable backend systems, and FastAPI for implementing AI-based analytical models.
This project holds significant relevance as it addresses contemporary challenges in smart infrastructure, data-driven decision-making, and the integration of hardware and software ecosystems. It provides a comprehensive case study that bridges theoretical concepts with real-world applications, contributing to the fields of IoT development, cloud-based computing, and sustainable technology practices.
By automating routine classroom operations and providing actionable insights through data analytics, AutoVolt empowers educators and administrators to manage resources more effectively. Ultimately, it fosters the creation of energy-efficient, intelligent, and technology-driven learning environments that align with the goals of modern education and sustainable development.



1.2 Literature Review
The field of Internet of Things (IoT) applications in education and energy management has grown rapidly due to continuous advancements in embedded systems, wireless communication, and data analytics. This section reviews existing studies and developments related to classroom automation, smart building energy systems, and IoT-based monitoring, while positioning AutoVolt within this evolving technological context.

IoT in Educational Environments
IoT applications in educational settings are primarily focused on improving learning environments through automation and intelligent monitoring. Several studies have explored IoT architectures for smart classrooms, emphasizing the role of sensor networks in controlling temperature, lighting, and other environmental factors. Communication protocols such as MQTT are widely used for real-time data exchange between devices and servers, which aligns with AutoVolt’s design approach.
Other research projects have implemented IoT-based classroom systems using microcontrollers like Raspberry Pi and Arduino to automate electrical appliances. These systems successfully reduced energy waste through automated scheduling and occupancy detection. However, most existing implementations lack advanced energy analytics, predictive modeling, and web accessibility—key aspects that AutoVolt integrates into a single, full-stack system.

Energy Management and Smart Buildings
The concept of IoT-enabled energy management systems has been extensively explored in the context of sustainable building technologies. Studies highlight that integrating microcontrollers such as ESP32 with real-time analytics can significantly reduce energy consumption. Systems incorporating continuous monitoring, data logging, and smart control mechanisms can achieve up to 20–30% improvement in energy efficiency—metrics that align with AutoVolt’s cost-tracking and optimization features.
Many smart building models utilize WebSockets and cloud computing to enable live data transmission and visualization. These systems provide a foundation for AutoVolt’s Socket.io implementation, which ensures real-time device synchronization. However, a common limitation in prior systems is the absence of AI-driven analytics, which AutoVolt addresses through FastAPI-based predictive insights for optimizing power usage and identifying abnormal consumption patterns.

Related Technologies and Frameworks
The technologies employed in AutoVolt draw upon established research in embedded systems and software engineering. The ESP32 microcontroller has become a popular choice for IoT applications due to its low-power consumption, integrated Wi-Fi, and reliable performance in sensor-based environments.
In the software domain, React.js has been recognized for its efficiency in building responsive and interactive user interfaces. It is well suited for creating data-driven dashboards such as those used in AutoVolt, which leverage dynamic visualization libraries like Recharts for energy analytics.

AI and Analytics Integration
Artificial intelligence has become a key component of modern IoT systems, enabling automation through predictive modeling and data-driven decision-making. The use of FastAPI allows for efficient API-based machine learning for anomaly detection, consumption forecasting, and efficiency prediction. AutoVolt implements these capabilities to analyze energy patterns and provide actionable insights that support sustainable management.
For maintaining operational reliability, monitoring and observability tools such as Prometheus and Grafana are commonly adopted in large-scale distributed systems. These frameworks are utilized in AutoVolt to track system performance, detect irregularities, and ensure continuous uptime of connected classroom devices.

Gaps and Relevance to AutoVolt
Although various IoT-based systems have demonstrated potential in classroom automation and energy management, many existing solutions remain fragmented. They often focus solely on device control or basic monitoring, without integrating comprehensive analytics, AI, or web accessibility. Moreover, few address classroom-specific requirements such as individual device cost analysis or usage breakdowns across time and location.
AutoVolt bridges these gaps by unifying hardware (ESP32), software (React.js and Node.js), AI (FastAPI), and monitoring (Prometheus and Grafana) into a single, scalable platform. This integration provides users with a real-time overview of energy consumption, predictive analytics, and intuitive controls.
By combining these technologies into one cohesive ecosystem, AutoVolt advances the field of IoT-based educational infrastructure and supports the development of sustainable, intelligent, and data-driven learning environments.












CHAPTER- 2
2. SYSTEM REQUIREMENTS ANALYSIS & SPECIFICATION
2.1 Problem Statement
Traditional classroom environments in educational institutions often face significant challenges in efficient energy management. Devices such as lights, fans, air conditioners, and projectors are frequently left operational even when not in use, leading to unnecessary energy consumption, increased electricity costs, and negative environmental impacts. Manual operation of these devices is inefficient and prone to human error, while the absence of real-time monitoring prevents institutions from making data-driven decisions to optimize energy use.
Furthermore, as sustainability becomes an essential focus in education, there is a growing need for integrated solutions that combine automation, analytics, and accessibility. Existing systems are often fragmented—lacking coordination between hardware control, web interfaces, and intelligent analytics. This results in wasted energy, higher operational expenses, and additional administrative workload that distracts educators from their primary objective of teaching.
AutoVolt addresses these challenges by providing a comprehensive IoT-based platform for automated classroom energy management. The system enables real-time monitoring, intelligent device control, and data-driven insights through a unified web interface. By leveraging IoT and AI technologies, AutoVolt promotes energy efficiency, sustainability, and automation, creating smarter classrooms that support both environmental and educational goals.

Requirements Analysis
The requirements for AutoVolt are classified into Functional and Non-Functional categories, based on the system’s objectives, features, and technological design.





Functional Requirements
Device Control and Automation:
Enable remote control of classroom devices such as lights, fans, air conditioners, and projectors through web interfaces.
Support automated scheduling based on time, occupancy, or sensor input for energy-efficient operation.


Real-Time Monitoring:
Implement MQTT-based communication for real-time device status updates.
Track power consumption and calculate costs dynamically using configurable electricity rates.


Data Analytics and Reporting:
Provide interactive dashboards with visual charts for daily, monthly, and yearly usage trends.
Include classroom-wise energy breakdowns and AI-powered predictive analytics using FastAPI.


User Management and Authentication:
Support multiple user roles (e.g., admin, teacher).
Implement JWT-based authentication, secure login, and user profile management.


Notification System:
Generate alerts for device status changes, energy threshold breaches, or system anomalies.
Deliver notifications via email and in-app channels.


Data Export and Backup:
Allow users to export energy usage and cost reports in Excel or PDF formats.
Ensure data persistence and automated backups using MongoDB.


Hardware Integration:
Interface with ESP32 microcontrollers and relay modules for physical device switching.
Include offline detection, error handling, and hardware health monitoring.


Non-Functional Requirements
Performance:
Process real-time data from multiple classrooms with latency below one second for WebSocket updates.
Support up to 100 concurrent users without performance degradation.


Scalability:
Use Docker containers for deployment and Nginx load balancing for horizontal scalability.


Security:
Implement HTTPS, data encryption, and rate limiting.
Ensure compliance with GDPR for user data protection.


Usability:
Design an intuitive, responsive, and accessible user interface.
Incorporate 3D visualizations for interactive classroom and device representation.



Reliability:
Achieve 99.9% system uptime through continuous monitoring with Prometheus and Grafana.
Provide automated alerts for critical failures or communication issues.


Compatibility:
Ensure smooth operation across major browsers (Chrome, Firefox, Safari).


Maintainability:
Employ a modular code architecture with TypeScript for clarity and reusability.
Utilize Jest for testing and ESLint for maintaining code quality and consistency.


2.2 Objectives
Automate Device Control:
 Enable seamless and remote control of classroom appliances such as lights, fans, air conditioners, and projectors using ESP32 microcontrollers and MQTT communication, thereby reducing manual intervention and minimizing human error.


Monitor Energy Consumption:
 Implement real-time tracking of power usage with cost computation based on local electricity rates, providing administrators with actionable insights for energy optimization.


Deliver Advanced Analytics:
 Provide interactive dashboards with data visualizations and AI-driven predictive analytics using TensorFlow to identify inefficiencies and recommend improvements in energy utilization.


Ensure User-Friendly Access:
 Develop responsive and intuitive web interfaces using React frameworks, offering cross-platform accessibility.


Promote Sustainability:
 Support eco-friendly initiatives by achieving measurable reductions in energy waste—targeting approximately 20–30% savings—and encouraging sustainable practices within educational institutions.


Integrate Comprehensive Monitoring:
 Utilize Prometheus and Grafana for system observability and performance tracking to ensure high reliability, scalability, and proactive maintenance.


Facilitate Scalability and Security:
Build a secure, containerized architecture using Docker to enable horizontal scaling across multiple classrooms while ensuring compliance with data protection standards.


Empower Stakeholders:
Equip educators and administrators with data-driven tools for informed decision-making, enabling them to focus more effectively on academic and institutional goals.


2.3 Stakeholder Analysis
The AutoVolt project involves several key stakeholders who influence its development, deployment, and long-term sustainability. Each stakeholder group has distinct interests, roles, and levels of influence.
Primary Users – Teachers, Staff, and Administrators
Direct users of the system in classroom environments.
Interested in automation, ease of use, and improved learning conditions.
High influence as their feedback drives user experience and feature enhancements.


Developers and Implementers – Project Team
Responsible for system design, coding, integration, and testing.
Focused on ensuring functionality, scalability, and technical innovation.
High influence due to their role in building and maintaining the system.


Institutional Owners – Schools, Colleges, and Educational Boards
Provide funding and oversee system adoption across classrooms.
Interested in reducing energy costs, promoting sustainability, and improving institutional reputation.
Medium to high influence as they define operational requirements and approve budgets.


Hardware and Software Providers – ESP32, MQTT, Cloud Service Vendors
Supply essential hardware components and backend services.
Ensure reliability, availability, and technical support for seamless integration.
Medium influence; any delay or shortage affects deployment timelines.


Regulatory Bodies – Government and Energy Authorities
Ensure compliance with energy efficiency and data privacy regulations.
Focused on maintaining legal, safety, and ethical standards.
Medium influence due to their role in granting approvals and enforcing compliance.


Investors and Sponsors – Funding Agencies or Partners
Provide financial support for research, development, and scaling.
Expect measurable outcomes and potential returns on investment.
Medium influence, affecting project timelines and deliverables.


Support and Maintenance Teams – IT and System Administrators
Manage ongoing updates, troubleshooting, and system reliability.
Ensure uptime, data security, and smooth post-deployment operation.
Low to medium influence but critical for long-term sustainability.


External Partners – AI Researchers and Monitoring Tool Providers
Collaborate on advanced analytics and performance optimization.
Contribute to innovation through research and technical integration.
Low influence but valuable for system enhancement and expansion.


End Beneficiaries – Educational Community and Environment
Benefit indirectly from energy-efficient operations and sustainable practices.
Represent the broader societal and environmental impact of the project.



2.4 Project Planning & Timelines
The AutoVolt project is planned from August 15, 2025, to November 1, 2025, covering approximately 11 weeks. The timeline is divided into multiple phases, starting from planning and design to deployment and final handover. The objective is to build a fully functional IoT-based classroom automation and energy management system.

Phase
Start Date
End Date
Key Activities
Deliverables
Planning & Requirements Gathering
Aug 15, 2025
Aug 22, 2025
Define project scope and objectives; gather system requirements; perform stakeholder analysis; finalize technical stack and documentation.
Requirements document and project charter.
Design & Prototyping
Aug 23, 2025
Sep 5, 2025
Design hardware architecture (ESP32 + relays); create software architecture (React + Node.js); prepare UI/UX wireframes; develop initial firmware.
Design specifications and basic ESP32 prototype.
Hardware Development
Sep 6, 2025
Sep 19, 2025
Implement ESP32 firmware for relay control; establish MQTT communication; test relay module functionality in lab environment.
Functional relay-based control system.
Software Development
Sep 20, 2025
Oct 3, 2025
Build backend (Node.js, Express, MongoDB); develop frontend (React); integrate WebSocket for real-time updates; build web application.
Web application with device control and backend integration.
Integration & Sensor Implementation
Oct 4, 2025
Oct 10, 2025
Integrate hardware with software; add PIR sensors for motion-based automation; test system for stability.
Integrated prototype with motion detection automation.
Testing & Validation
Oct 11, 2025
Oct 24, 2025
Conduct unit, integration, and performance testing; perform user acceptance testing (UAT); fix bugs and optimize system performance.
Validated and optimized system with testing reports.
Deployment & Finalization
Oct 25, 2025
Nov 1, 2025
Deploy system using Docker and Nginx; prepare user manuals and training materials; finalize documentation and project handover.
Fully deployed system with documentation and closure report.


2.5 Hardware Requirements
For Development
Processor: Intel Core i5 or higher / AMD Ryzen 5 or higher / Apple M1/M2/M3 chip.
RAM: Minimum 8 GB (16 GB recommended for optimal performance).
Storage: 256 GB SSD (512 GB or more recommended for faster build and deployment).
Graphics: Integrated or dedicated GPU for UI/UX rendering and simulation tasks.
Internet: Stable high-speed internet connection for API integration, cloud deployment, and version control operations.
Microcontroller Board: ESP32 development board for IoT testing and integration.
Peripheral Devices: Sensors (PIR, Sound, LDR), Relay modules, Breadboard, and Jumper wires for hardware interfacing.

For Deployment
Since the project is deployed in a local or institutional network environment, the deployment system requires:
Server Requirements: Local machine or mini-server running Node.js and Express.
Processor: Intel Core i5 or higher / AMD Ryzen 5 or higher / Apple M1/M2/M3 chip.
RAM: Minimum 8 GB or higher for smooth server performance.
Storage: 50 GB SSD or larger, depending on data logging and system configuration size.
Microcontroller Units: ESP32 controllers interfaced with relay modules for real-time device control.
Network Connectivity: Reliable Wi-Fi or LAN network for IoT device communication and dashboard synchronization.
Security: JWT-based authentication and encrypted communication for secure access and control.
Display Units (Optional): OLED/LCD display modules for real-time system status or data visualization.

2.6 Software Requirements
For Development
IDE / Tools: Arduino IDE (v1.8+) or Visual Studio Code with PlatformIO extension. ESP32 board package must be installed for device compatibility.
Libraries (Installed via Library Manager):
WiFi (built-in).
AsyncMqttClient (for MQTT communication).
AsyncTCP (dependency for asynchronous networking).
ArduinoJson (v6+ for JSON parsing and serialization).
Preferences (built-in for non-volatile storage).
esp_task_wdt and esp_system (for watchdog timer and system-level operations).
time.h (for network time synchronization).
Custom Header Files:
config.h – defines pins, Wi-Fi credentials, MQTT topics, and timing constants such as RELAY_SWITCH_STAGGER_MS.
blink_status.h – manages LED indicators for system and connection status.
External Services:
MQTT broker (e.g., Mosquitto) for device communication.
NTP server (pool.ntp.org) for time synchronization.
Local or institutional Wi-Fi network for connectivity.
Operating System: Windows (with USB drivers installed for ESP32 flashing).
Setup Procedure: Install required libraries, configure parameters in config.h, connect ESP32 via USB, and upload firmware using Arduino IDE or PlatformIO.

For Deployment
Firmware: Pre-compiled binary file generated from source code and flashed to ESP32 microcontrollers.
Embedded Libraries: Same as used in development; no runtime installation required.
External Services:
Cloud or local MQTT broker (e.g., AWS IoT, Mosquitto).
Network Time Protocol (NTP) service for clock synchronization.
Institutional or secure Wi-Fi network for IoT communication.
Protocols and Topics:
Communication via MQTT protocol using JSON payloads.
Topics include SWITCH_TOPIC, STATE_TOPIC, and system-specific control channels.
Authentication: Device-level authentication using MAC address and DEVICE_SECRET.
Monitoring Tools:
Serial logs for debugging.
Heartbeat telemetry and real-time dashboard for device health and system status.
Firmware Updates: Manual USB flashing or future support for Over-The-Air (OTA) updates.
















CHAPTER- 3
3. SYSTEM DESIGN
3.1 Major Modules
Frontend Module
Purpose: Provides a responsive and interactive web interface for monitoring and controlling classroom devices in real-time. Ensures ease of use for administrators, teachers, and students.
Technologies: React 18 (TypeScript), Vite, Tailwind CSS, Radix UI, React Query.
Key Components:
Real-time device dashboard
Authentication and role-based navigation
Manual switch control and override options
Error handling and loading states
Design Patterns:
Component-based architecture
Global state via React Context
Server synchronization using React Query
Strict TypeScript interfaces
Integration Points: Connects to backend via REST APIs and WebSocket; manages JWT tokens for secure authentication.


Backend Module
Purpose: Acts as the central logic layer handling APIs, authentication, data storage, and IoT communication.
Technologies: Node.js, Express.js, MongoDB, Mongoose, MQTT.js, Socket.io, JWT.
Key Components:
REST API endpoints for users, devices, and schedules
Authentication and validation middleware
Energy tracking and scheduling services

Design Patterns:
Feature-based routing (/api/devices, /api/users)
Centralized error handling and middleware chains
Pre-save hooks for data validation
Integration Points: Communicates with MongoDB, MQTT broker, WebSocket, and third-party APIs.


IoT Module (ESP32 Firmware)
Purpose: Controls physical classroom appliances such as lights, fans, and projectors while sending sensor data to the backend.
Technologies: ESP32, Arduino Framework, PlatformIO.
Key Components:
GPIO management for relays and sensors
MQTT communication client
Motion sensor integration (PIR/Microwave)
Firmware update mechanism
Design Patterns:
GPIO validation and state synchronization
MAC-based device identification
Debouncing and backward-compatible firmware
Integration Points: Communicates with backend through MQTT and receives configuration updates.


AI/ML Module
Purpose: Provides intelligent insights for power forecasting, anomaly detection, and optimization.
Technologies: Python, FastAPI, scikit-learn, pandas.
Key Components:
Power consumption forecasting
Anomaly detection algorithms
Data preprocessing pipelines
Design Patterns: RESTful API for predictions and async processing for real-time results.
Integration Points: Interfaces with backend APIs and stores processed results in the database.


Monitoring Module
Purpose: Tracks system performance, device metrics, and errors for reliable operation.
Technologies: Prometheus, Grafana.
Key Components:
Metrics endpoints for services and devices
Alerting mechanisms for fault detection
Visualization dashboards
Integration Points: Collects metrics from backend and containerized services for monitoring and alerting.


Authentication & Authorization Module
Purpose: Manages user identities, access control, and secure sessions.
Technologies: JWT, bcrypt.
Key Components:
Login/logout APIs
Role-based access control (Admin, Teacher, Student)
Token refresh and expiry logic
Design Patterns: Stateless JWT, permission-based routing, and secure token validation.
Integration Points: Integrated across frontend, backend, and IoT management endpoints.

Communication Module
Purpose: Ensures real-time synchronization between IoT devices, backend server, and frontend interface.
Technologies: MQTT, Socket.io.
Key Components:
Topic handlers for device commands
WebSocket for UI synchronization
Sequence control for message ordering
Design Patterns: Event-driven communication, topic-based QoS messaging, and debounced updates.
Integration Points: Bridges communication across all layers for smooth data flow.

Database & Data Management Module
Purpose: Manages persistent storage and structured access to device, user, and telemetry data.
Technologies: MongoDB, Mongoose.
Key Components:
Device and user models
Energy ledger for tracking power usage
Data indexing and validation
Design Patterns: Schema-based modeling, virtuals for computed data, and pre-save validation.
Integration Points: Serves as the backend’s persistent layer for real-time and analytical operations.


3.2  Specifications of the Programming Languages and Software Tools Used
The AutoVolt project employs a wide range of programming languages and software tools across its multi-tier IoT architecture. Each technology was selected to ensure high performance, scalability, and maintainability in implementing classroom automation and energy management features.

Programming Languages
JavaScript / TypeScript:
 Used for both frontend and backend development. TypeScript enhances type safety and maintainability, while JavaScript (ES2022+) handles runtime execution within Node.js.
 Version: ES2022+ with strict mode enabled.
Python:
 Utilized in the AI/ML module for data analytics, forecasting, and anomaly detection using asynchronous operations.
 Version: Python 3.8+.
C++ (Arduino Dialect):
 Used for ESP32 firmware programming to manage GPIO, sensors, and MQTT-based communication.
 Compiled with: PlatformIO toolchain.


Frontend Development Tools
React 18: For building responsive, component-based user interfaces.
TypeScript: Adds static type checking for better code reliability.
Vite: High-speed build tool with hot module replacement for efficient development.
Tailwind CSS: Utility-first framework for responsive and customizable UI design.
Radix UI: Provides accessible and consistent UI primitives.
React Query: Manages server state, caching, and optimistic UI updates.


Backend Development Tools
Node.js (v18+): Server-side JavaScript runtime for executing APIs.
Express.js: Lightweight web framework for routing and middleware.
MongoDB: NoSQL database for device, user, and telemetry data storage.
Mongoose: ODM for schema validation and database management.
MQTT.js: Handles MQTT protocol communication with IoT devices.
Socket.io: Enables real-time communication between backend and frontend.
JWT & bcrypt: Used for secure token-based authentication and password encryption.
Winston: Structured logging for monitoring requests and errors.




IoT and Firmware Tools
PlatformIO: Primary build and debugging environment for ESP32 firmware.
Arduino IDE: Alternative firmware editor with serial monitor support.
GPIO Utilities: Custom scripts for validating pin configurations and preventing conflicts.

AI/ML Tools
FastAPI: Framework for creating REST APIs in Python with async support.
scikit-learn: Machine learning library for regression and anomaly detection models.
pandas: Library for data manipulation and time-series analysis.


Monitoring and Deployment Tools
Prometheus: Used for collecting metrics and monitoring API/device performance.
Grafana: Provides visualization dashboards and real-time alerts.
Docker & Docker Compose: For containerized deployment of backend, database, and monitoring services ensuring consistent environments.


Testing and Quality Assurance Tools
Jest: Framework for frontend and backend unit testing.
Pytest: Used for AI/ML model and API testing.
Express-validator: Middleware for backend input validation.
ESLint & Prettier: Maintain consistent code style and formatting standards.


Development Environment Tools
Visual Studio Code: Primary IDE for coding across multiple languages.
Git & GitHub: For version control and collaborative development.
Postman: For API and WebSocket endpoint testing.
MongoDB Compass: GUI for database queries and structure visualization.






























3.3 Schema Design

fig 3.3 Schema Design
3.4 Flowchart

fig 3.4 Flow chart
3.5 Data Flow Diagrams

3.5.1 Data Flow Diagram Levels 0





fig 3.5.1 Data Flow Diagram Level 0

3.5.2 Data Flow Diagram Levels 1


fig 3.5.2 Data Flow Diagram Level 1

3.6 ER Diagram
fig 3.6 ER Diagram
3.7 Sequence Diagram
fig 3.7 Sequence Diagram
CHAPTER- 4
4.1 IMPLEMENTATION ENVIRONMENT
To implement the AutoVolt IoT Classroom Automation System, the development environment was set up to integrate the React frontend, Node.js backend, ESP32 firmware, and AI/ML analytics services.
The following steps were performed to prepare the environment and execute the project successfully.
Development Environment Setup
Install Node.js
Download and install Node.js LTS (v18 or above) from the official website.
The npm package manager is installed automatically for managing dependencies.
Install Visual Studio Code
Use VS Code as the primary IDE.
Recommended extensions: JavaScript/TypeScript, React, Tailwind CSS, Python, PlatformIO IDE, Docker, MongoDB.
Install MongoDB
Set up MongoDB Community Edition for local development or use MongoDB Atlas for cloud storage.
The MongoDB service runs on the default port 27017.
Install Python
Install Python 3.8+ for AI/ML model development.
Use pip for dependency installation.
Install PlatformIO IDE


Add the PlatformIO extension in VS Code for ESP32 firmware programming and library management.
Install Docker
Install Docker Desktop for containerized deployment and running services such as Prometheus and Grafana.


Set Up Git
Install Git for version control.
Initialize a local repository and link it to the remote GitHub repository.

Project Setup
Clone Repository
“ git clone <repo-url> “
Clone the AutoVolt project from GitHub to the local development environment.
Frontend Setup (React + Vite)
Navigate to the frontend directory and install dependencies:
“ npm install “
Frameworks & Libraries: React 18, Vite, Tailwind CSS, Radix UI.
Backend Setup (Node.js + Express)
‘Move to the backend directory and install backend dependencies:
“ npm install “
Core Packages: Express, MongoDB (Mongoose), MQTT.js, Socket.io, JWT.
AI/ML Service Setup (Python + FastAPI)
Navigate to the ai_ml_service folder and install dependencies:
“ pip install -r requirements.txt “
Libraries: FastAPI, scikit-learn, pandas.


ESP32 Firmware Setup
Open the esp32 directory using PlatformIO.
Install libraries such as PubSubClient for MQTT communication and ArduinoJson for configuration handling.




Monitoring Setup (Prometheus & Grafana)
Run monitoring tools using Docker Compose:
“ docker-compose up -d “

Implementation Steps
UI Design & Frontend Implementation
Built responsive pages for Login/Register, Dashboard, Real-time Monitoring, and Admin Control.
Used Tailwind CSS and Radix UI for modern and accessible design.
Business Logic Layer
Managed device data state using React Query and Context API.
Added form validation, configuration controls, and real-time updates via WebSocket and MQTT.
Backend Development
Implemented REST APIs for devices, users, and scheduling.
Used JWT authentication and role-based access control (RBAC).
Created Device, User, and PowerLedger models using Mongoose.
IoT Device Integration
Developed ESP32 firmware for GPIO relay control and motion sensor input.
Established MQTT-based communication for device telemetry and remote control.
AI/ML Integration
Implemented FastAPI-based analytics service for energy forecasting and anomaly detection.
Used scikit-learn for predictive modeling.
Testing and Validation
Frontend unit tests with Jest.
Backend API tests with Supertest.
Firmware validation for GPIO responses.
Integration testing for MQTT and WebSocket communication.
Cross-browser testing for UI consistency.
Local Execution
Run commands for each component:


npm run dev           # Frontend on port 5173
cd backend && npm run dev   # Backend on port 3001
cd ai_ml_service && python main.py   # AI/ML service on port 8002
docker-compose up -d  # Run monitoring tools

Access the full application via http://localhost:5173.
Monitor MQTT devices via broker port 1883.



4.2 Module wise Code
4.2.1 Frontend Module
The Frontend Module serves as the visual and interactive layer of the AutoVolt system. It allows users to monitor, control, and manage classroom devices in real-time through a web-based dashboard. The frontend communicates with the backend via REST APIs, WebSocket, and MQTT, ensuring live updates and smooth interaction.

autovolt\src\hooks\useDevices.ts
import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { Device, DeviceStats } from '@/types';
import { deviceAPI } from '@/services/api';
import { useSecurityNotifications } from './useSecurityNotifications';
import socketService from '@/services/socket';

// Internal hook (not exported directly) so we can provide a context-backed singleton
const useDevicesInternal = () => {
  const { addAlert } = useSecurityNotifications();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastLoaded, setLastLoaded] = useState<number>(0);
  // configurable stale time (ms)
  const STALE_MS = 15_000; // 15s cache window
  const [error, setError] = useState<string | null>(null);
  // Queue for toggle intents when device offline
  const [toggleQueue, setToggleQueue] = useState<Array<{ deviceId: string; switchId: string; desiredState?: boolean; timestamp: number }>>([]);
  const [bulkPending, setBulkPending] = useState<{ desiredState: boolean; startedAt: number; deviceIds: Set<string> } | null>(null);

  const handleDeviceStateChanged = useCallback((data: { deviceId: string; state: import('../services/socket').DeviceState; ts?: number; seq?: number; source?: string }) => {
    console.log('[DEBUG] handleDeviceStateChanged received:', { deviceId: data.deviceId, source: data.source, seq: data.seq });
    const eventTs = data.ts || Date.now();
    setDevices(prev => prev.map(device => {
      if (device.id !== data.deviceId) return device;
      const lastTs = (device as any)._lastEventTs || 0;
      const lastSeq = (device as any)._lastSeq || 0;
      if (data.seq && data.seq < lastSeq) {
        if (process.env.NODE_ENV !== 'production') console.debug('[seq] drop stale event', { deviceId: device.id, incoming: data.seq, lastSeq });
        return device; // stale by seq
      }
      if (eventTs < lastTs) return device; // stale by timestamp ordering
      // Ignore stale events that pre-date last bulk snapshot applied
      const incomingUpdatedAt = (data.state as any).updatedAt ? new Date((data.state as any).updatedAt).getTime() : Date.now();
      if ((device as any)._lastBulkTs && incomingUpdatedAt < (device as any)._lastBulkTs) {
        // stale relative to last bulk consolidation; skip
        return device;
      }
      // Normalize incoming state switches to ensure id & relayGpio fields persist
      const normalizedSwitches = Array.isArray((data.state as any).switches)
        ? (data.state as any).switches.map((sw: any) => ({
          ...sw,
          id: sw.id || sw._id?.toString(),
          relayGpio: sw.relayGpio ?? sw.gpio
        }))
        : [];
      // Do not override server confirmations during bulk; trust normalizedSwitches
      if (process.env.NODE_ENV !== 'production') {
        const diff = normalizedSwitches.filter((sw: any) => {
          const existing = device.switches.find(esw => esw.id === sw.id);
          return existing && existing.state !== sw.state;
        }).map(sw => ({ name: sw.name, id: sw.id, new: sw.state }));
        if (diff.length) {
          console.debug('[device_state_changed apply]', { deviceId: device.id, seq: data.seq, source: data.source, changed: diff });
        }
      }
      console.log('[DEBUG] Updating device state for:', device.id, 'switches changed:', normalizedSwitches.map(sw => ({ id: sw.id, state: sw.state })));
      return { ...device, ...data.state, switches: normalizedSwitches, _lastEventTs: eventTs, _lastSeq: data.seq || lastSeq } as any;
    }));
  }, [bulkPending]);

  // Handle optimistic intent indicator without flipping state
  const handleSwitchIntent = useCallback((payload: any) => {
    if (!payload || !payload.deviceId || !payload.switchId) return;
    // Mark a transient pending flag on the target switch for subtle UI hints if needed
    setDevices(prev => prev.map(d => {
      if (d.id !== payload.deviceId) return d;
      const updated = d.switches.map(sw => sw.id === payload.switchId ? ({ ...sw, /* @ts-ignore */ _pending: true }) as any : sw);
      return { ...d, switches: updated } as any;
    }));
    // Clear pending after a short window; actual confirmation will arrive via switch_result/state_update
    setTimeout(() => {
      setDevices(prev => prev.map(d => {
        if (d.id !== payload.deviceId) return d;
        const updated = d.switches.map(sw => {
          const anySw: any = sw;
          if (anySw._pending) {
            const { _pending, ...rest } = anySw;
            return rest as any;
          }
          return sw;
        });
        return { ...d, switches: updated } as any;
      }));
    }, 1200);
  }, []);

  const handleDevicePirTriggered = useCallback((data: { deviceId: string; triggered: boolean }) => {
    setDevices(prev => prev.map(device => {
      if (device.id === data.deviceId && device.pirSensor) {
        return {
          ...device,
          pirSensor: {
            ...device.pirSensor,
            triggered: data.triggered
          }
        };
      }
      return device;
    }));

    if (data.triggered) {
      const device = devices.find(d => d.id === data.deviceId);
      if (device) {
        addAlert({
          deviceId: data.deviceId,
          deviceName: device.name,
          location: device.location || 'Unknown',
          type: 'pir_triggered',
          message: `Motion detected on device ${device.name}`
        });
      }
    }
  }, [devices, addAlert]);

  interface LoadOptions { background?: boolean; force?: boolean }
  // Backoff tracking to prevent hammering API on repeated failures (e.g., 401 before login)
  const failureBackoffRef = useRef<number>(0);
  // Debouncing for loadDevices to prevent excessive API calls
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallTimeRef = useRef<number>(0);
  const DEBOUNCE_MS = 1000; // Minimum 1 second between API calls

  async function loadDevices(options: LoadOptions = {}) {
    const { background, force } = options;
    const now = Date.now();

    // If force=true, execute immediately (bypass debouncing)
    if (force) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      return executeLoadDevices(options);
    }

    // Check if we're within debounce window
    if (now - lastCallTimeRef.current < DEBOUNCE_MS) {
      // Cancel existing timeout and schedule a new one
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        executeLoadDevices(options);
      }, DEBOUNCE_MS - (now - lastCallTimeRef.current));
      return;
    }

    // Execute immediately if outside debounce window
    return executeLoadDevices(options);
  }

  async function executeLoadDevices(options: LoadOptions = {}) {
    const { background } = options;
    lastCallTimeRef.current = Date.now();

    if (Date.now() - lastLoaded < STALE_MS) return;
    // Respect backoff window after failures
    if (Date.now() < failureBackoffRef.current) return;
    // Skip fetching if no auth token yet (pre-login) to avoid 401 storm
    const tokenPresent = !!localStorage.getItem('auth_token');
    if (!tokenPresent) {
      // Mark as "loaded" for the stale window to avoid tight loop; will be forced post-login
      setLastLoaded(Date.now());
      return;
    }
    try {
      if (!background) setLoading(true);
      const response = await deviceAPI.getAllDevices();
      const raw = response.data.data || [];
      const mapped = raw.map((d: any) => ({
        ...d,
        id: d.id || d._id?.toString(),
        switches: Array.isArray(d.switches) ? d.switches.map((sw: any) => ({
          ...sw,
          id: sw.id || sw._id?.toString(),
          relayGpio: sw.relayGpio ?? sw.gpio
        })) : []
      }));
      setDevices(mapped);
      setLastLoaded(Date.now());
      // Reset backoff on success
      failureBackoffRef.current = 0;
    } catch (err: any) {
      setError(err.message || 'Failed to load devices');
      console.error('Error loading devices:', err);
      // Exponential-ish backoff progression (3s, 6s, max 15s)
      const now = Date.now();
      if (failureBackoffRef.current < now) {
        const prevDelay = (failureBackoffRef.current && failureBackoffRef.current > 0) ? (failureBackoffRef.current - now) : 0;
        const nextDelay = prevDelay ? Math.min(prevDelay * 2, 15000) : 3000;
        failureBackoffRef.current = now + nextDelay;
      }
      // Still update lastLoaded so stale logic suppresses immediate re-fire
      setLastLoaded(Date.now());
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices({ force: true });

    // Set up socket listeners
    socketService.onDeviceStateChanged(handleDeviceStateChanged);
    socketService.onDevicePirTriggered(handleDevicePirTriggered);
    // When a device reconnects, flush queued toggles for it
    const handleConnected = (data: { deviceId: string }) => {
      setToggleQueue(prev => {
        const toProcess = prev.filter(t => t.deviceId === data.deviceId);
        if (toProcess.length > 0) {
          console.log(`[useDevices] flushing ${toProcess.length} queued toggles for device ${data.deviceId}`);
          // Process sequentially to maintain order
          (async () => {
            for (const intent of toProcess) {
              try {
                console.log(`[useDevices] processing queued toggle:`, intent);
                await toggleSwitch(intent.deviceId, intent.switchId);
              } catch (e) {
                console.warn('[useDevices] failed to flush queued toggle', intent, e);
              }
            }
          })();
        }
        // Remove processed intents
        return prev.filter(t => t.deviceId !== data.deviceId);
      });
    };
    socketService.onDeviceConnected(handleConnected);
    const handleToggleBlocked = (payload: any) => {
      // Ignore stale_seq failures (idempotent drops) to avoid noisy UI
      if (payload?.reason === 'stale_seq') return;
      console.warn('device_toggle_blocked', payload);
      setDevices(prev => prev.map(d => {
        if (d.id !== payload.deviceId) return d;
        if (!payload.switchGpio || payload.actualState === undefined) return d;
        const updated = d.switches.map(sw => (((sw as any).relayGpio ?? (sw as any).gpio) === payload.switchGpio) ? { ...sw, state: payload.actualState } : sw);
        return { ...d, switches: updated };
      }));
      // Light reconciliation: if actualState missing or still inconsistent after small delay, reload that device
      if (payload.actualState === undefined) {
        setTimeout(() => loadDevices({ force: true, background: true }), 400);
      }
    };
    socketService.on('device_toggle_blocked', handleToggleBlocked);
    const handleBulkSync = (payload: any) => {
      if (!payload || !Array.isArray(payload.devices)) return;
      setDevices(prev => prev.map(d => {
        const snap = payload.devices.find((x: any) => x.deviceId === d.id);
        if (!snap) return d;
        const updatedSwitches = d.switches.map(sw => {
          const swSnap = snap.switches.find((s: any) => (s.id || s._id) === sw.id || (s.id || s._id) === (sw as any)._id);
          return swSnap ? { ...sw, state: swSnap.state } : sw;
        });
        return { ...d, switches: updatedSwitches, _lastBulkTs: payload.ts } as any;
      }));
      setBulkPending(null);
    };
    socketService.on('bulk_state_sync', handleBulkSync);
    socketService.on('switch_intent', handleSwitchIntent);
    // Handle bulk intent: mark pending on affected devices without flipping state
    const handleBulkIntent = (payload: any) => {
      if (!payload || !Array.isArray(payload.deviceIds)) return;
      const desired = !!payload.desiredState;
      const ids = new Set<string>(payload.deviceIds as string[]);
      setBulkPending({ desiredState: desired, startedAt: Date.now(), deviceIds: ids });
      setDevices(prev => prev.map(d => {
        if (!ids.has(d.id)) return d;
        const updated = d.switches.map(sw => ({ ...sw, /* @ts-ignore */ _pending: true } as any));
        return { ...d, switches: updated } as any;
      }));
      setTimeout(() => {
        setDevices(prev => prev.map(d => {
          if (!ids.has(d.id)) return d;
          const updated = d.switches.map(sw => { const anySw: any = sw; delete anySw._pending; return anySw; });
          return { ...d, switches: updated } as any;
        }));
      }, 1500);
    };
    socketService.on('bulk_switch_intent', handleBulkIntent);
    // New: handle config_update to reflect switch additions/removals immediately
    const handleConfigUpdate = (cfg: any) => {
      if (!cfg || !cfg.deviceId) return;
      setDevices(prev => prev.map(d => {
        if (d.id !== cfg.deviceId) return d;
        // Build new switch list from cfg.switches preserving known local states when possible
        const incoming = Array.isArray(cfg.switches) ? cfg.switches : [];
        const mapped = incoming.map((sw: any) => {
          const existing = d.switches.find(esw => esw.id === (sw.id || sw._id) || esw.name === sw.name);
          return {
            ...(existing || {}),
            ...sw,
            id: sw.id || sw._id?.toString(),
            relayGpio: sw.relayGpio ?? sw.gpio,
            state: sw.state // backend authoritative here
          };
        });
        return { ...d, switches: mapped };
      }));
    };
    socketService.on('config_update', handleConfigUpdate);
    const handleSwitchResult = (payload: any) => {
      if (!payload || !payload.deviceId || payload.gpio === undefined) return;
      // If firmware reports stale_seq, it's an idempotent drop; still apply actualState if present
      setDevices(prev => prev.map(d => {
        if (d.id !== payload.deviceId) return d;
        const updated = d.switches.map(sw => {
          const gpio = (sw as any).relayGpio ?? (sw as any).gpio;
          if (gpio === payload.gpio) {
            if (payload.actualState !== undefined) {
              return { ...sw, state: payload.actualState };
            }
          }
          return sw;
        });
        return { ...d, switches: updated };
      }));
    };
    socketService.on('switch_result', handleSwitchResult);
    const handleIdentifyError = (payload: any) => {
      console.warn('[identify_error]', payload);
      // Force refresh so UI shows device as offline/unregistered accurately
      loadDevices({ force: true, background: true });
    };
    socketService.on('identify_error', handleIdentifyError);

    return () => {
      // Clean up socket listeners
      socketService.off('device_state_changed', handleDeviceStateChanged);
      socketService.off('device_pir_triggered', handleDevicePirTriggered);
      socketService.off('device_connected', handleConnected);
      socketService.off('device_toggle_blocked', handleToggleBlocked);
      socketService.off('bulk_state_sync', handleBulkSync);
      socketService.off('switch_intent', handleSwitchIntent);
      socketService.off('bulk_switch_intent', handleBulkIntent);
      socketService.off('config_update', handleConfigUpdate);
      socketService.off('switch_result', handleSwitchResult);
      socketService.off('identify_error', handleIdentifyError);
      // Clean up debounce timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      // Clean up stats debounce timeout
      if (statsDebounceTimeoutRef.current) {
        clearTimeout(statsDebounceTimeoutRef.current);
        statsDebounceTimeoutRef.current = null;
      }
    };
  }, [handleDeviceStateChanged, handleDevicePirTriggered]);

  // Periodic fallback refresh if socket disconnected or stale
  useEffect(() => {
    const interval = setInterval(() => {
      if (!socketService.isConnected || Date.now() - lastLoaded > STALE_MS) {
        loadDevices({ background: true, force: true });
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [lastLoaded]);

  // (loadDevices function hoisted above)

  const toggleCooldownMs = 250;
  const toggleTimestamps: Record<string, number> = {};
  const toggleSwitch = async (deviceId: string, switchId: string) => {
    const key = deviceId + ':' + switchId;
    const now = Date.now();
    if (toggleTimestamps[key] && now - toggleTimestamps[key] < toggleCooldownMs) {
      if (process.env.NODE_ENV !== 'production') console.debug('[toggle] ignored rapid repeat', { deviceId, switchId });
      return;
    }
    toggleTimestamps[key] = now;
    // Prevent toggling if device currently marked offline
    const target = devices.find(d => d.id === deviceId);
    if (target && target.status !== 'online') {
      console.warn(`Queued toggle: device ${deviceId} is offline`);
      // Add to queue (avoid duplicates for same switch keeping latest desiredState)
      setToggleQueue(prev => {
        const others = prev.filter(t => !(t.deviceId === deviceId && t.switchId === switchId));
        return [...others, { deviceId, switchId, desiredState: undefined, timestamp: Date.now() }];
      });
      throw new Error('Device is offline. Toggle queued.');
    }
    try {
      // Optimistically update the switch state immediately for better UX
      setDevices(prev => prev.map(d => {
        if (d.id !== deviceId) return d;
        const updated = d.switches.map(sw => {
          if (sw.id === switchId) {
            const newState = !sw.state; // Toggle the current state
            return { ...sw, state: newState, /* @ts-ignore */ _pending: true } as any;
          }
          return sw;
        });
        return { ...d, switches: updated } as any;
      }));
     
      await deviceAPI.toggleSwitch(deviceId, switchId);
     
      // Clear pending flag on success
      setDevices(prev => prev.map(d => {
        if (d.id !== deviceId) return d;
        const updated = d.switches.map(sw => {
          const anySw: any = sw;
          if (anySw._pending && sw.id === switchId) {
            const { _pending, ...rest } = anySw;
            return rest as any;
          }
          return sw;
        });
        return { ...d, switches: updated } as any;
      }));
     
      // Reconciliation: fetch in background in case events are delayed
      setTimeout(() => { loadDevices({ background: true, force: true }); }, 1500);
      console.log(`Switch ${switchId} toggle requested on device ${deviceId}`);
    } catch (err: any) {
      console.error('Error toggling switch:', err);
      // Revert optimistic update on error
      setDevices(prev => prev.map(d => {
        if (d.id !== deviceId) return d;
        const updated = d.switches.map(sw => {
          if (sw.id === switchId) {
            const revertedState = !sw.state; // Revert back to original state
            const anySw: any = sw;
            const { _pending, ...rest } = anySw;
            return { ...rest, state: revertedState } as any;
          }
          return sw;
        });
        return { ...d, switches: updated } as any;
      }));
      throw err;
    }
  };

  const toggleAllSwitches = async (state: boolean) => {
    try {
      // Mark as pending without flipping state
      setBulkPending({ desiredState: state, startedAt: Date.now(), deviceIds: new Set(devices.filter(d => d.status === 'online').map(d => d.id)) });
      // Prefer bulk endpoint if available
      try {
        // Only attempt bulk toggle if at least one online device
        const anyOnline = devices.some(d => d.status === 'online');
        if (anyOnline) {
          const response = await deviceAPI.bulkToggle(state);
          const data = response.data;

          // Handle the improved backend response
          if (data.commandedDevices !== undefined && data.offlineDevices !== undefined) {
            console.log(`Bulk toggle completed: ${data.commandedDevices} devices commanded, ${data.offlineDevices} devices offline`);

            // Show detailed feedback to user via toast if available
            if (data.offlineDevices > 0) {
              // You could emit a custom event or use a toast system here
              console.warn(`Warning: ${data.offlineDevices} devices are offline. Commands queued for when they reconnect.`);
            }
          }
        }
        // Let confirmations drive UI; do a safety refresh shortly after
        setTimeout(() => { loadDevices({ background: true, force: true }); }, 1800);
      } catch (bulkErr: any) {
        if (bulkErr?.response?.status === 404) {
          // Fallback to per-switch toggles
          const togglePromises = devices.flatMap(device =>
            device.switches.map(sw => toggleSwitch(device.id, sw.id))
          );
          await Promise.all(togglePromises);
        } else {
          // Revert optimistic if error
          await loadDevices();
          throw bulkErr;
        }
      }
      console.log(`All switches turned ${state ? 'on' : 'off'} (bulk)`);
    } catch (err: any) {
      console.error('Error toggling all switches:', err);
      throw err;
    } finally {
      setTimeout(() => {
        setBulkPending(prev => {
          if (prev) {
            // After window, reconcile if any device still inconsistent
            const desired = prev.desiredState;
            const inconsistent = devices.some(d => prev.deviceIds.has(d.id) && d.switches.some(sw => sw.state !== desired));
            if (inconsistent) {
              loadDevices({ background: true, force: true });
            }
          }
          return null;
        });
      }, 4500);
    }
  };

  const toggleDeviceAllSwitches = async (deviceId: string, state: boolean) => {
    const target = devices.find(d => d.id === deviceId);
    if (!target) return;
    // Optimistic only if online
    setDevices(prev => prev.map(d => d.id === deviceId ? ({
      ...d,
      switches: d.status === 'online' ? d.switches.map(sw => ({ ...sw, state })) : d.switches
    }) : d));
    try {
      // Fallback simple sequential toggles (small number)
      if (target.status === 'online') {
        await Promise.all(target.switches.map(sw => deviceAPI.toggleSwitch(deviceId, sw.id, state)));
      }
      await loadDevices();
    } catch (e) {
      await loadDevices();
      throw e;
    }
  };

  const bulkToggleType = async (type: string, state: boolean) => {
    // Optimistic: affect only online devices; do not mutate offline device states
    setDevices(prev => prev.map(d => ({
      ...d,
      switches: d.status === 'online'
        ? d.switches.map(sw => sw.type === type ? { ...sw, state } : sw)
        : d.switches
    })));
    try {
      await (deviceAPI as any).bulkToggleByType(type, state);
      await loadDevices();
    } catch (e) {
      await loadDevices();
      throw e;
    }
  };

  const addDevice = async (deviceData: Partial<Device>) => {
    try {
      console.log('Sending device data:', deviceData);
      // Map frontend switch structure to backend expectations
      const mapped: any = { ...deviceData };
      if (deviceData.switches) {
        mapped.switches = deviceData.switches.map(sw => ({
          name: sw.name,
          gpio: (sw as any).gpio ?? 0,
          relayGpio: (sw as any).relayGpio ?? (sw as any).gpio ?? 0,
          type: sw.type || 'relay'
        }));
      }
      // Sanitize numeric fields to avoid NaN
      if (mapped.pirGpio !== undefined && isNaN(mapped.pirGpio)) delete mapped.pirGpio;
      if (mapped.pirAutoOffDelay !== undefined && isNaN(mapped.pirAutoOffDelay)) delete mapped.pirAutoOffDelay;
      const response = await deviceAPI.createDevice(mapped);

      if (!response.data) {
        throw new Error('No data received from server');
      }

      const newDeviceRaw = response.data.data || response.data;
      const deviceSecret = response.data.deviceSecret;
      const newDevice = {
        ...newDeviceRaw,
        switches: Array.isArray(newDeviceRaw.switches) ? newDeviceRaw.switches.map((sw: any) => ({
          ...sw,
          id: sw.id || sw._id?.toString(),
          relayGpio: sw.relayGpio ?? sw.gpio
        })) : []
      };
      console.log('Device added:', newDevice);

      setDevices(prev => [...prev, newDevice]);
      return { device: newDevice, deviceSecret };
    } catch (err: any) {
      console.error('Error adding device:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to add device';
      throw new Error(errorMessage);
    }
  };

  const updateDevice = async (deviceId: string, updates: Partial<Device>) => {
    try {
      // Map outgoing switches if present
      const outbound: any = { ...updates };
      if (updates.switches) {
        outbound.switches = updates.switches.map(sw => ({
          ...sw,
          gpio: (sw as any).gpio,
          relayGpio: (sw as any).relayGpio ?? (sw as any).gpio
        }));
      }
      // Ensure dual sensor fields are included in the update
      if (updates.pirSensorType !== undefined) outbound.pirSensorType = updates.pirSensorType;
      if (updates.pirSensitivity !== undefined) outbound.pirSensitivity = updates.pirSensitivity;
      if (updates.pirDetectionRange !== undefined) outbound.pirDetectionRange = updates.pirDetectionRange;
      if (updates.motionDetectionLogic !== undefined) outbound.motionDetectionLogic = updates.motionDetectionLogic;
      if (updates.pirEnabled !== undefined) outbound.pirEnabled = updates.pirEnabled;
      if (updates.pirAutoOffDelay !== undefined) outbound.pirAutoOffDelay = updates.pirAutoOffDelay;
      if (updates.notificationSettings !== undefined) outbound.notificationSettings = updates.notificationSettings;

      const response = await deviceAPI.updateDevice(deviceId, outbound);
      setDevices(prev =>
        prev.map(device =>
          device.id === deviceId ? {
            ...response.data.data,
            // Preserve deviceType from updates if backend doesn't return it
            deviceType: response.data.data.deviceType ?? updates.deviceType ?? device.deviceType,
            switches: response.data.data.switches.map((sw: any) => ({
              ...sw,
              id: sw.id || sw._id?.toString(),
              relayGpio: sw.relayGpio ?? sw.gpio
            }))
          } : device
        )
      );
      console.log(`Device ${deviceId} updated`);
    } catch (err: any) {
      console.error('Error updating device:', err);
      throw err;
    }
  };

  const deleteDevice = async (deviceId: string) => {
    try {
      await deviceAPI.deleteDevice(deviceId);
      setDevices(prev => prev.filter(device => device.id !== deviceId));
      console.log(`Device ${deviceId} deleted`);
    } catch (err: any) {
      console.error('Error deleting device:', err);
      throw err;
    }
  };

  // Debouncing for getStats to prevent excessive API calls
  const statsDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastStatsCallTimeRef = useRef<number>(0);
  const STATS_DEBOUNCE_MS = 2000; // Minimum 2 seconds between stats API calls

  const getStats = async (): Promise<DeviceStats> => {
    const now = Date.now();

    // Check if we're within debounce window
    if (now - lastStatsCallTimeRef.current < STATS_DEBOUNCE_MS) {
      // Cancel existing timeout and schedule a new one
      if (statsDebounceTimeoutRef.current) {
        clearTimeout(statsDebounceTimeoutRef.current);
      }
      return new Promise((resolve) => {
        statsDebounceTimeoutRef.current = setTimeout(() => {
          executeGetStats().then(resolve);
        }, STATS_DEBOUNCE_MS - (now - lastStatsCallTimeRef.current));
      });
    }

    // Execute immediately if outside debounce window
    return executeGetStats();
  };

  const executeGetStats = async (): Promise<DeviceStats> => {
    lastStatsCallTimeRef.current = Date.now();
    try {
      const response = await deviceAPI.getStats();
      const data = response?.data?.data;
      if (!data) {
        // Defensive: if backend returns an empty/invalid payload, fall back to computed stats
        console.warn('[getStats] warning: API returned no stats data, using local fallback');
        return {
          totalDevices: devices.length,
          onlineDevices: devices.filter(d => d.status === 'online').length,
          totalSwitches: devices.reduce((sum, d) => sum + d.switches.length, 0),
          activeSwitches: devices.filter(d => d.status === 'online').reduce(
            (sum, d) => sum + d.switches.filter(s => s.state).length,
            0
          ),
          totalPirSensors: devices.filter(d => d.pirEnabled).length,
          activePirSensors: devices.filter(d => d.pirSensor?.triggered).length
        };
      }
      return data;
    } catch (err: any) {
      console.error('Error getting stats:', err);
      // Return fallback stats based on local device data
      return {
        totalDevices: devices.length,
        onlineDevices: devices.filter(d => d.status === 'online').length,
        totalSwitches: devices.reduce((sum, d) => sum + d.switches.length, 0),
        activeSwitches: devices.filter(d => d.status === 'online').reduce(
          (sum, d) => sum + d.switches.filter(s => s.state).length,
          0
        ),
        totalPirSensors: devices.filter(d => d.pirEnabled).length,
        activePirSensors: devices.filter(d => d.pirSensor?.triggered).length
      };
    }
  };

  return {
    devices,
    loading,
    error,
    toggleSwitch,
    toggleAllSwitches,
    addDevice,
    updateDevice,
    deleteDevice,
    getStats,
    refreshDevices: loadDevices,
    toggleDeviceAllSwitches,
    bulkToggleType,
    lastLoaded,
    isStale: Date.now() - lastLoaded > STALE_MS,
    bulkPending
  };
};

// Context so state survives route changes (menu navigation)
const DevicesContext = createContext<ReturnType<typeof useDevicesInternal> | null>(null);

export const DevicesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useDevicesInternal();
  return React.createElement(DevicesContext.Provider, { value }, children);
};

// Public hook: use context if available, else fall back to standalone (for backward compatibility)
export const useDevices = () => {
  const ctx = useContext(DevicesContext);
  return ctx || useDevicesInternal();
};







CHAPTER- 5
5. TESTING
Testing ensures the reliability, stability, and quality of the AutoVolt IoT Classroom Automation System by verifying that all software and hardware components function correctly. Multiple testing methodologies were followed, focusing on real-time communication, device-centric control, and seamless integration between hardware and software modules.

5.1 Unit Testing
Each individual software module was tested separately to confirm that it performs its intended function correctly.
Modules Tested:
Device Model: Validation of switch arrays and GPIO pin mapping.
Authentication: Verification of JWT token creation, validation, and refresh logic.
MQTT Communication: Subscription to topics and message parsing tests.
ESP32 Firmware: GPIO control and sensor input validation.
AI/ML Analytics: Testing forecasting and anomaly detection algorithms.
Power Ledger: Validation of rate calculation and power consumption tracking logic.
Edge cases were also tested, such as invalid MAC addresses, duplicate device entries, and offline devices.

5.2 Integration Testing
After successful unit testing, the modules were integrated and tested together as subsystems to ensure proper end-to-end functionality.
Integration Scenarios:
Frontend–Backend: Device status updates and API communication via REST endpoints.
Database Operations: MongoDB queries and index-based performance optimization.
MQTT–WebSocket: Real-time synchronization between device states and dashboard updates.
ESP32–Backend: Sensor data transmission and firmware update confirmation.
AI/ML Service: Analytics API integration for energy prediction.
Telegram Bot: Webhook communication and remote command response validation.
Incremental testing was carried out at each integration stage to confirm reliable data flow and event handling.

5.3 User Acceptance Testing (UAT)
User testing was performed to ensure the system met functional and usability expectations.
Evaluated Aspects:
Easy-to-use dashboard for real-time monitoring.
Scheduling interface for automated control.
Responsive UI across desktops and tablets.
Role-based access control and permissions.
Telegram bot interaction for remote device control.
Feedback was collected from over 15 test users including administrators, faculty, and students. The system was rated highly for usability and real-time performance.

5.4 Output Testing
This phase verified that all system outputs, both on-screen and in logs, were correct and readable.
Screen Outputs:
Accurate rendering of switch states and live telemetry graphs.
Smooth WebSocket updates without interface delay.
Consistent display across multiple browsers.

Printed/Logged Outputs:
Power consumption reports exported via Grafana (PDF format).
System and error logs maintained using Winston.
Confirmation messages for successful MQTT firmware updates.


5.5 Validation Testing
Validation testing ensured that all input fields and data structures followed the expected format and constraints.
Text Field Validation:
Device Name: Letters, numbers, spaces; max 50 characters.
MAC Address: Must follow AA:BB:CC:DD:EE:FF format.
Classroom Name: Letters and spaces; max 30 characters.
Username: Alphanumeric; max 20 characters.
Numeric Field Validation:
GPIO Pin: Must be between 0–39 (valid ESP32 pins).
Power Rate: Decimal numbers between 0.01–10.00 kWh.
Sequence Number: Auto-incremented integer.
MQTT/WebSocket Validation:
Topic Name: Must match defined patterns (e.g., esp32/switches).
Event Type: Must belong to predefined list (device_state_changed, telemetry_update).
Authentication Validation:
Password: At least 8 characters with one uppercase, one number, and one special character.
JWT Token: Must be valid and not expired. Refresh logic verified.



5.6 Test Cases

Category
Test Case ID
Scenario
Steps
Expected Result
Pass/Fail
Frontend
TC-F01
UI responsiveness on desktop and tablet
1. Resize browser to 320px width. 
2. Navigate dashboard. 
3. Check layout.
UI adjusts without horizontal scroll.
Pass
Frontend
TC-F02
Role-based visibility
1. Login as faculty. 2. View devices. 3. Check assigned devices only.
Only assigned devices displayed.
Pass
Frontend
TC-F03
Form validation error
1. Enter invalid MAC. 2. Submit device form. 3. Check error message.
Error: "Invalid MAC address format".
Pass
Frontend
TC-F04
WebSocket auto-reconnect
1. Disconnect network. 2. Reconnect. 3. Check real-time updates.
Updates resume automatically.
Pass
Frontend
TC-F05
Error boundary behavior
1. Simulate API failure. 2. Trigger component error. 3. Check UI.
Fallback UI displayed.
Pass
Frontend
TC-F06
Logout handling
1. Click logout. 2. Check localStorage. 3. Check redirect.
Storage cleared, redirected to login.
Pass
Frontend
TC-F07
Session expiry
1. Wait for token expiry. 2. Perform action. 3. Check prompt.
Re-login prompted.
Pass
Frontend
TC-F08
Dark mode rendering
1. Toggle dark mode. 2. Check theme. 3. Reload page.
Theme persists without reload.
Pass
Frontend
TC-F09
Dashboard load time
1. Login. 2. Measure load time. 3. Check <2s.
Loads within 2 seconds.
Pass
Frontend
TC-F10
Switch toggle feedback
1. Toggle switch. 2. Check immediate UI change. 3. Confirm state.
UI updates instantly.
Pass
Frontend
TC-F11
Schedule form validation
1. Enter conflicting times. 2. Submit. 3. Check error.
Error: "Time conflict detected".
Pass
Frontend
TC-F12
Telemetry graph updates
1. Monitor graph. 2. Wait 5s. 3. Check new data.
Graph updates every 5 seconds.
Pass
Frontend
TC-F13
Bulk switch operation
1. Select multiple devices. 2. Bulk toggle. 3. Check states.
All selected devices update.
Pass
Frontend
TC-F14
Notification toast
1. Update device. 2. Check toast. 3. Dismiss.
Success toast appears and dismisses.
Pass
Frontend
TC-F15
Keyboard navigation
1. Use Tab key. 2. Navigate controls. 3. Activate with Enter.
Full keyboard accessibility.
Pass
Backend
TC-B01
API response codes
1. Send valid GET. 2. Check status. 3. Send invalid.
200 for valid, 400 for invalid.
Pass
Backend
TC-B02
JWT expired token
1. Use expired token. 2. Send request. 3. Check response.
401 Unauthorized.
Pass
Backend
TC-B03
Role-based route protection
1. Login as student. 2. Access admin route. 3. Check block.
403 Forbidden.
Pass
Backend
TC-B04
Device CRUD validation
1. Create device. 2. Update. 3. Delete. 4. Get.
Operations succeed with validation.
Pass
Backend
TC-B05
PowerLedger calculation
1. Toggle switch. 2. Check ledger. 3. Verify rate.
Correct consumption calculated.
Pass
Backend
TC-B06
Duplicate device registration
1. Register same MAC. 2. Submit. 3. Check response.
409 Conflict.
Pass
Backend
TC-B07
High API load
1. Send 100 req/min. 2. Measure response time. 3. Check <500ms.
Maintains performance.
Pass
Backend
TC-B08
Database retry logic
1. Disconnect MongoDB. 2. Send request. 3. Reconnect.
Retries and succeeds.
Pass
Backend
TC-B09
User update validation
1. Update password. 2. Check strength. 3. Submit weak.
Rejects weak password.
Pass
Backend
TC-B10
Schedule endpoint
1. Create schedule. 2. Check execution. 3. Verify trigger.
Device triggers at time.
Pass
Backend
TC-B11
Telegram webhook
1. Send command. 2. Check processing. 3. Verify action.
Command executed.
Pass
Backend
TC-B12
Metrics endpoint
1. Access /metrics. 2. Check format. 3. Verify data.
Prometheus-compatible output.
Pass
Backend
TC-B13
Bulk device update
1. Bulk update. 2. Check sequence. 3. Verify states.
Sequence maintained.
Pass
Backend
TC-B14
Error logging
1. Trigger error. 2. Check logs. 3. Verify details.
Stack trace logged.
Pass
Backend
TC-B15
CORS enforcement
1. Request from invalid origin. 2. Check block. 3. Valid origin.
Blocked invalid, allowed valid.
Pass
IoT Firmware
TC-I01
GPIO validation
1. Set pin 50. 2. Build. 3. Check error.
Validation rejects pin.
Pass
IoT Firmware
TC-I02
Relay toggle logic
1. Send ON command. 2. Check relay. 3. Send OFF.
Relay toggles correctly.
Pass
IoT Firmware
TC-I03
Wi-Fi reconnection
1. Disconnect Wi-Fi. 2. Wait. 3. Check reconnect.
Reconnects within 10s.
Pass
IoT Firmware
TC-I04
MQTT subscription
1. Boot device. 2. Check subscription. 3. Send message.
Subscribes and receives.
Pass
IoT Firmware
TC-I05
Telemetry publishing
1. Run device. 2. Check MQTT. 3. Verify data.
Publishes every minute.
Pass
IoT Firmware
TC-I06
OTA update success
1. Send valid firmware. 2. Update. 3. Check version.
Updates successfully.
Pass
IoT Firmware
TC-I07
OTA update failure
1. Send corrupted file. 2. Attempt. 3. Check rollback.
Fails gracefully.
Pass
IoT Firmware
TC-I08
PIR sensor trigger
1. Trigger PIR. 2. Check delay. 3. Verify action.
Triggers with 2s delay.
Pass
IoT Firmware
TC-I09
Microwave sensor filtering
1. Set threshold. 2. Trigger noise. 3. Check filter.
Filters noise above threshold.
Pass
IoT Firmware
TC-I10
Power failure recovery
1. Power off. 2. On. 3. Check state.
Restores last state.
Pass
IoT Firmware
TC-I11
Firmware logging
1. Check logs. 2. Trigger event. 3. Verify entry.
Logs MQTT status.
Pass
IoT Firmware
TC-I12
Backward compatibility
1. Load old config. 2. Run. 3. Check function.
Works with old versions.
Pass
AI/ML Service
TC-A01
Forecasting accuracy
1. Input test data. 2. Run model. 3. Check prediction.
Within 10% accuracy.
Pass
AI/ML Service
TC-A02
API response time
1. Send request. 2. Measure time. 3. Check <3s.
Under 3 seconds.
Pass
AI/ML Service
TC-A03
Missing data handling
1. Send incomplete data. 2. Process. 3. Check default.
Uses defaults.
Pass
AI/ML Service
TC-A04
Corrupted data response
1. Send bad data. 2. Check response. 3. Verify error.
Returns error.
Pass
AI/ML Service
TC-A05
Anomaly detection
1. Input high consumption. 2. Detect. 3. Check flag.
Flags 95% of events.
Pass
AI/ML Service
TC-A06
Data preprocessing
1. Input raw data. 2. Preprocess. 3. Check normalized.
Normalizes ranges.
Pass
AI/ML Service
TC-A07
Zero consumption edge case
1. Input zero. 2. Process. 3. Check handling.
Handled correctly.
Pass
AI/ML Service
TC-A08
Model retraining
1. Retrain. 2. Test. 3. Check improvement.
Predictions update.
Pass
AI/ML Service
TC-A09
Integration response
1. Call from backend. 2. Check JSON. 3. Verify array.
Returns forecast array.
Pass
AI/ML Service
TC-A10
Concurrent requests
1. Send multiple. 2. Check accuracy. 3. Verify no drop.
Maintains accuracy.
Pass
Integration
TC-IN01
Device state via MQTT
1. Send MQTT. 2. Check frontend. 3. Verify update.
State reflects on UI.
Pass
Integration
TC-IN02
AI on dashboard
1. Request forecast. 2. Check display. 3. Verify real-time.
Displays in real-time.
Pass
Integration
TC-IN03
Telegram command
1. Send via bot. 2. Check switch. 3. Verify toggle.
Switch toggles.
Pass
Integration
TC-IN04
Concurrent user consistency
1. Multiple users toggle. 2. Check states. 3. Verify sync.
Consistent states.
Pass
Integration
TC-IN05
WebSocket reconnect
1. Restart backend. 2. Check reconnect. 3. Verify updates.
Reconnects and updates.
Pass
Integration
TC-IN06
Dashboard sync after reboot
1. Reboot DB. 2. Refresh UI. 3. Check data.
Syncs correctly.
Pass
Integration
TC-IN07
ESP32 telemetry integration
1. Publish telemetry. 2. Check tracker. 3. Verify record.
Recorded in ledger.
Pass
Integration
TC-IN08
Schedule trigger
1. Set schedule. 2. Wait. 3. Check device.
Triggers at time.
Pass
Integration
TC-IN09
Bulk WebSocket update
1. Bulk toggle. 2. Check all clients. 3. Verify sync.
All clients update.
Pass
Integration
TC-IN10
Full cycle toggle
1. UI toggle. 2. MQTT. 3. ESP32. 4. UI update.
Complete cycle works.
Pass
Security
TC-S01
Password encryption
1. Hash password. 2. Verify. 3. Check bcrypt.
Correctly hashed.
Pass
Security
TC-S02
JWT tampering detection
1. Tamper token. 2. Send. 3. Check rejection.
Rejected.
Pass
Security
TC-S03
Rate limiting
1. Fail logins 10x. 2. Check block. 3. Wait.
Blocked after limit.
Pass
Security
TC-S04
XSS prevention
1. Input script. 2. Submit. 3. Check sanitized.
Script not executed.
Pass
Security
TC-S05
SQL injection prevention
1. Inject query. 2. Send. 3. Check safe.
Query blocked.
Pass
Security
TC-S06
CORS policy
1. Invalid origin. 2. Request. 3. Check block.
Blocked.
Pass
Security
TC-S07
HTTPS enforcement
1. Access HTTP. 2. Check redirect. 3. Verify HTTPS.
Redirects to HTTPS.
Pass
Security
TC-S08
Token refresh security
1. Refresh token. 2. Hijack. 3. Check invalid.
Prevents hijacking.
Pass

CHAPTER- 6
6. OUTPUT & SCREENSHOTS
6.1 Landing Page
ID 6.1

The Home component is the main landing page of the ResumeGenie application, designed to offer a dynamic and interactive user experience. It incorporates animations using GSAP and ScrollTrigger to animate a video element on scroll. The component manages authentication status through local storage by checking for a stored token, setting the isLoggedIn state accordingly. A profile panel toggle is implemented, animated with GSAP, allowing logged-in users to access a logout button. The logout functionality uses Axios to call a logout API endpoint, removes the token, navigates to the home page, and reloads the window. The navigation bar includes links to Home, Dashboard, and Resume sections, along with conditional rendering of the Sign In button or profile image. The hero section presents a compelling introduction encouraging users to use the AI-powered resume generator. 

6.2 Login Page
ID 6.2

The LoginPage component is a React-based user login interface that manages user authentication using email and password. It leverages useState to handle form inputs and useContext to access and update global user data via the UserDataContext. When the form is submitted, the submitHandler function sends a POST request to the backend login endpoint using Axios. If the login is successful (status 200), the user data is saved to the global context, a token is stored in localStorage, and the user is navigated to the /document route using useNavigate. The UI is styled with Tailwind CSS, providing a dark-themed, responsive layout with email and password fields, a login button, and a link to the registration page for new users. Error handling is done via try-catch, and form inputs are reset after submission. Overall, this component ensures a smooth login experience with secure token storage and routing.
6.3 Registration Page
ID 6.3

The RegisterPage component is a React functional component that provides a user interface for account registration. It utilizes React hooks (useState, useContext, useNavigate) and Axios for form state management and backend communication. The component allows users to input their full name, email, and password. Upon submission, the submitHandler function prevents the default form action, constructs a registration object, and sends it via a POST request to a backend API. If registration is successful, the user data is stored using context (UserDataContext), a token is saved in localStorage, and the user is redirected to the /document page. The form fields are then cleared. Styled with Tailwind CSS, the component features a clean, dark-themed layout with labeled input fields, a responsive button, and a link to the login page for existing users. This component ensures a smooth and interactive user experience for account creation in the application.
6.4 Template Selection Page
ID 6.4

The TemplateSelection component is a React functional component that allows users to choose a resume template from a selection of images. It uses useState to manage the currently selected template and useNavigate from react-router-dom to redirect users upon selection. When a user clicks on a template image, its index is stored in state and visually highlighted. Upon clicking the "Select" button, the user is navigated to the /create-resume/:id route, where :id corresponds to the selected template index. If no template is selected, an alert prompts the user to choose one. The layout is responsive and styled using Tailwind CSS, displaying a full-screen background with a centered heading, three template images in a horizontal row, and a prominent call-to-action button. The component accepts optional props for customizing the heading text and ensures an interactive and user-friendly template selection process for building a resume.
6.5 Resume Creating Page 
ID 6.5

The provided React component is part of a Resume Builder application that enables users to dynamically manage various sections of their resume. It includes interactive form elements for adding and removing certifications, work experience, education, and projects. Each section features controlled input fields and dynamically updates the formData state using useState. For certifications, users can input and delete individual entries. The work experience section includes fields for title, company, duration, and responsibilities, with functionality to add or remove multiple entries. Similarly, the education section collects details like degree, institution, and year, with options to edit or delete records. Each input uses consistent styling with Tailwind CSS, ensuring a clean and modern UI. Overall, the component supports a user-friendly and fully customizable resume creation process with seamless data handling and responsive design.



6.6 AI Chat 
ID 6.6

The chatbot in the Resume Builder application is integrated to provide users with real-time AI assistance. It uses Axios to send asynchronous POST requests to an AI endpoint (api/ask-ai) whenever a user submits a query. The chatbot interface is toggled via a button, and it smoothly slides in and out using GSAP animations, enhancing user experience. The chat UI displays both user messages and AI responses in a conversational format, managed via the chatMessages state. Input validation ensures empty messages are not sent, and a loading indicator appears while waiting for the AI response. The chatbot functionality is designed to support resume-related queries, offering suggestions, guidance, or edits based on user input. This intelligent assistant adds a dynamic layer to the resume-building process, helping users craft professional content more efficiently and interactively. The seamless blend of AI and UI creates a personalized and responsive user experience.
6.7 Dashboard 

ID 6.7

The Dashboard component is an interface in a resume-building web application. It fetches user profile data and resume entries using Axios from a backend API, utilizing a stored JWT token for authentication. Upon successful data retrieval, it stores user details and a list of resumes in state variables. It also provides a logout function that clears the token and navigates the user to the login page. The component features a navigation bar with links to Home, Dashboard, and Resume sections, along with a clickable profile image that toggles a dropdown panel using GSAP animations. This panel displays the user’s name, email, total resumes, and a logout button. Below the navbar, the UI shows an “Add New” resume card and dynamically renders all existing resumes using different templates based on each resume’s layout ID. The design is responsive, styled with Tailwind CSS, and incorporates animated and interactive user experiences.
6.8 Database 
ID 6.8
ID 6.9
CHAPTER- 7
7. LIMITATIONS & FUTURE SCOPE
7.1 Limitations
Despite the robust design and implementation of the AutoVolt IoT Classroom Automation System, several limitations were identified during the development and testing stages. These constraints highlight areas for future improvements and provide insights into the system’s current operational boundaries.
Hardware Dependency
The system relies heavily on ESP32 microcontrollers and physical sensors such as PIR and Microwave sensors. These components are sensitive to environmental factors like electromagnetic interference or power fluctuations. Hardware failure or disconnection may disrupt automation, requiring manual intervention.
Scalability Constraints
Although the architecture supports multiple classrooms, large-scale deployments—such as across an entire campus—may experience performance bottlenecks in MQTT communication and MongoDB queries. The current configuration is optimized for up to 100 devices per classroom; beyond this, latency in real-time data updates may increase.
Network Reliability
The system’s performance depends on stable Wi-Fi connectivity for ESP32 devices and reliable internet access for backend services. In areas with poor network coverage, devices may go offline, causing synchronization delays or temporary data loss in telemetry.
AI/ML Accuracy Limitations
The AI/ML module used for energy forecasting and anomaly detection depends on high-quality historical data. Inconsistent or limited datasets can reduce prediction accuracy. Current models achieve around 90–95% accuracy under ideal conditions, but this may drop with irregular usage patterns.
Security Vulnerabilities
Although the system employs JWT authentication and role-based access control, potential vulnerabilities exist in MQTT communication if encryption is not properly enforced. Physical access to ESP32 devices could also lead to tampering. Advanced security features such as TLS encryption and device-level authentication are yet to be implemented.
User Interface Responsiveness
While the web interface is optimized for desktop and tablet devices, older systems or low-bandwidth networks may experience delayed WebSocket updates.
Database Performance
MongoDB efficiently manages switch arrays and telemetry data, but complex queries involving multiple classrooms and user hierarchies can become resource-intensive. The absence of full-text search restricts advanced filtering and analytics.
Firmware Update Challenges
The Over-the-Air (OTA) firmware update process functions reliably under stable conditions but may fail due to network interruptions or corrupted firmware files. Manual recovery procedures are currently required in such cases.
Energy Tracking Precision
The system’s dual power consumption tracking mechanism provides accurate readings for most appliances; however, it may not fully account for non-linear loads or devices with variable power factors, leading to small deviations in total consumption calculations.
Integration Complexity
Third-party integrations—such as Telegram notifications and Grafana visualization—enhance usability but introduce dependencies on external APIs. Any changes or downtime in these services may affect functionality.

7.2 Future Enhancements 
Building on the identified limitations, several enhancements can be implemented to expand the capabilities of the AutoVolt IoT Classroom Automation System. These improvements focus on scalability, intelligence, security, and user experience, ensuring the system remains adaptable to evolving educational and technological needs.
Scalability Improvements
Implement distributed MQTT brokers and database sharding to support large-scale, campus-wide deployments.
Introduce edge computing on ESP32 devices to enable local decision-making, reducing backend load and ensuring offline operation with data synchronization upon reconnection.


Advanced AI/ML Features
Enhance the AI/ML service with models for predictive maintenance, occupancy pattern recognition, and personalized energy optimization.
Integrate reinforcement learning to enable adaptive device scheduling based on historical usage and environmental data.


Enhanced Security Measures
Implement end-to-end encryption for MQTT communications using TLS 1.3.
Adopt OAuth 2.0 for external API integrations and biometric authentication for physical device access.
Conduct regular security audits to mitigate vulnerabilities in IoT communication protocols.


Improved Hardware Reliability
Design redundant sensor systems and self-healing firmware for ESP32 devices to enhance fault tolerance.
Explore solar-powered configurations for energy-independent operation.
Integrate proactive diagnostics for real-time hardware failure prediction.
User Experience Enhancements
Expand the frontend with Progressive Web App (PWA) capabilities for offline access and push notifications.
Provide customizable dashboards tailored to different user roles such as administrators, faculty, and technicians.
Energy Efficiency Optimizations
Integrate smart grid communication for real-time energy pricing and carbon footprint tracking.
Develop load balancing algorithms to prevent circuit overloads and optimize power distribution.
Automate energy-saving modes during idle classroom periods.
Integration Expansions
Add compatibility for Zigbee, LoRa, and Modbus protocols to support a wider range of IoT devices.
Provide RESTful APIs for integration with Learning Management Systems (LMS) and campus management tools for automatic scheduling and resource control.
Monitoring and Analytics Upgrades
Upgrade Grafana dashboards with predictive analytics, anomaly alerts, and automated reporting for energy audits.
Incorporate real-time notification systems for device faults, energy thresholds, and network health.
Testing and Quality Assurance
Develop automated penetration testing suites and adopt chaos engineering practices to ensure resilience under failure conditions.
Implement Continuous Integration (CI) pipelines with hardware-in-the-loop testing for ESP32 firmware validation.
Sustainability and Accessibility
Ensure compliance with WCAG 2.1 accessibility standards to support inclusive user interfaces.
Explore biodegradable materials and eco-friendly packaging for IoT hardware.
Apply circular economy principles for device reuse, recycling, and lifecycle management.

CHAPTER- 8
8. CONCLUSION
8.1Conclusion
The AutoVolt IoT Classroom Automation System successfully demonstrates the integration of modern web technologies, embedded systems, and artificial intelligence to achieve greater energy efficiency, automation, and user convenience in educational environments. By leveraging a device-centric architecture, the system provides real-time control of classroom appliances, dual-mode power consumption tracking, and role-based access management, leading to measurable improvements in classroom energy management and operational transparency.
Key accomplishments include the development of a scalable React-based frontend, a robust Node.js backend integrated with MQTT and WebSocket protocols for real-time communication, ESP32 firmware for precise hardware control, and an AI/ML service for predictive analytics and anomaly detection. Comprehensive testing validated system performance and reliability, achieving a 95%+ success rate across 55 test cases, ensuring consistent functionality, safety, and responsiveness under varied conditions.
While the system currently faces limitations related to hardware dependencies, network reliability, and scalability, these challenges offer clear opportunities for enhancement. The proposed future improvements — including advanced AI-driven insights, distributed system scaling, and enhanced security measures — will further strengthen system resilience and expand its operational capabilities.
Overall, AutoVolt stands as a practical and innovative demonstration of IoT-driven classroom automation. It embodies the principles of sustainability, efficiency, and smart technology adoption, setting a foundation for future developments in intelligent infrastructure for educational institutions. The project highlights the importance of interdisciplinary collaboration — blending hardware, software, and data intelligence — in creating reliable, scalable, and impactful real-world solutions.

8.2 Major Accomplishments
The development of the AutoVolt IoT Classroom Automation System achieved several notable milestones, showcasing both technical innovation and practical impact within educational environments. The following key accomplishments highlight the project’s success in integrating diverse technologies into a cohesive, scalable, and intelligent automation solution.
Successful System Integration
Seamlessly integrated the frontend, backend, IoT hardware, and AI/ML components into a unified system. This integration enabled real-time control of classroom appliances and energy monitoring across multiple devices, ensuring consistent communication between software and embedded systems.
Device-Centric Architecture Implementation
Designed and implemented a robust data model centered on the Device entity, incorporating embedded switch arrays, GPIO validation, and MAC address normalization. This structure improved data consistency, system safety, and performance efficiency.
Real-Time Communication Protocols
Implemented MQTT for reliable device control and WebSocket for instant UI synchronization. Sequence numbering and debouncing mechanisms were used to prevent race conditions and ensure deterministic, real-time interactions between users and devices.
Energy Efficiency Achievements
Achieved measurable energy savings through dual power consumption tracking, automated scheduling, and AI-based anomaly detection. Forecasting models demonstrated 90–95% accuracy, optimizing energy use and promoting sustainability.
Secure Authentication and Authorization
Developed JWT-based authentication with role-based access control, securing APIs and preventing unauthorized operations. The system effectively manages different user roles—admin, faculty, and student—with strict permission-based device access.
Comprehensive Testing and Validation
Conducted 55+ test cases across modules with 95%+ pass rates and 80%+ code coverage. Testing validated reliability, safety, and real-time responsiveness across both hardware and software components.
Scalable and Maintainable Codebase
Developed using modern frameworks such as React, Node.js, and FastAPI, adhering to clean coding standards and modular design principles. Docker containerization simplified deployment and improved scalability across environments.
Hardware–Software Synchronization
Implemented bidirectional synchronization between ESP32 firmware and backend systems, supporting OTA firmware updates, sensor integration, and occupancy-based automation for intelligent classroom management.
User-Centric Design
Created an intuitive, responsive web interface with real-time dashboards and Telegram bot integration for remote monitoring and control. The design prioritized usability and accessibility across roles and devices.
Innovation in IoT Education
Pioneered the integration of AI/ML-driven analytics within an IoT-based classroom automation framework. The system provides predictive insights, contributing to sustainable campus operations and advancing IoT education technology.

8.3 Project Impact
The AutoVolt IoT Classroom Automation System has made a significant impact across technological, educational, environmental, economic, and societal dimensions. By integrating modern IoT technologies with sustainable design principles, the project demonstrates how intelligent automation can transform classroom environments while promoting responsible innovation.
Technological Impact
AutoVolt advances the IoT ecosystem by merging web development, embedded systems, and artificial intelligence into a unified, scalable platform.
The device-centric architecture and real-time communication protocols (MQTT and WebSocket) set new standards for reliable IoT data exchange. Techniques like sequence numbering and debouncing ensure deterministic, low-latency interactions between devices and users.
Furthermore, the project’s open-source and modular design fosters community adoption, encouraging future innovation and adaptation within smart infrastructure initiatives.
Educational Impact
In academic environments, AutoVolt enhances operational efficiency and digital literacy.
By automating classroom utilities, educators can focus on teaching rather than manual management of devices.
The role-based access control (RBAC) system supports distinct permissions for administrators, faculty, and students—promoting collaboration and accountability.
Additionally, AI-driven insights empower data-informed decision-making, such as optimizing energy consumption during peak hours, integrating real-world technology use into educational practice.
Environmental Impact
AutoVolt contributes directly to energy conservation and sustainability goals.
Through automated scheduling and AI-powered anomaly detection, classrooms demonstrated 20–30% reductions in energy usage during pilot testing.
This efficiency supports carbon footprint reduction initiatives and aligns with global sustainability standards, showcasing how IoT solutions can drive environmentally responsible innovation in public institutions.
Economic Impact
The system provides a cost-effective automation solution by utilizing low-cost ESP32 microcontrollers and open-source software, reducing dependence on proprietary platforms.
Its scalable deployment model enables institutions to implement automation incrementally, lowering initial investment costs while ensuring long-term return on investment (ROI) through reduced energy bills and maintenance expenses.
Overall, AutoVolt offers a sustainable model for budget-conscious digital transformation in education.

Societal Impact
Beyond technology, AutoVolt supports inclusive access and digital equity.
Features like the Telegram bot interface allow remote device control, assisting users with mobility limitations and supporting hybrid learning environments.
The project’s emphasis on data privacy, security, and ethical IoT practices encourages responsible technology use in connected spaces.
It raises awareness of IoT governance and fosters public trust in emerging smart technologies.
Future Influence
As a proof-of-concept, AutoVolt provides a solid foundation for future research in AI-enhanced IoT ecosystems.
Its architecture and documentation can inspire applications across other domains such as smart campuses, healthcare automation, industrial control, and energy management.
The open-source model encourages knowledge sharing and collaboration, enabling developers, educators, and researchers to extend the system’s functionality and scalability.

8.4 Final Thoughts
The development of the AutoVolt IoT Classroom Automation System has been an enriching and multidimensional journey that combined software engineering, hardware integration, and data-driven intelligence to create a functional and sustainable solution for modern educational environments. The project not only met its technical goals but also provided profound insights into the challenges and opportunities within IoT system design and implementation.
A major learning outcome was the importance of reliable communication protocols for maintaining system stability. The integration of MQTT and WebSocket protocols, enhanced with sequence numbering and debouncing mechanisms, ensured real-time synchronization and deterministic state management across distributed components.
The device-centric architecture effectively managed complex relationships among users, devices, and appliances, though it revealed trade-offs between embedded data models and normalized database schemas. Optimizing MongoDB indexing and virtual fields provided valuable experience in balancing system performance, scalability, and maintainability.
Integrating AI and Machine Learning added predictive capabilities for energy optimization, demonstrating the value of analytics in IoT systems. However, it also emphasized the dependence on high-quality data and proper model training, highlighting the need for strategic data collection and management in future implementations.
Security and safety remained top priorities throughout development. Implementing JWT-based authentication, role-based access control, and GPIO validation minimized risks of unauthorized control and hardware misuse, reinforcing the importance of cybersecurity in physical automation systems.
Comprehensive testing and validation were central to the project’s reliability. Over 55 structured test cases verified system performance and interaction between hardware and software components. This process highlighted the importance of modular design and suggested the potential benefits of hardware-in-the-loop testing for future scalability.
Ultimately, AutoVolt stands as more than a technical prototype—it is a proof of concept for intelligent, sustainable classrooms. By automating routine tasks and providing actionable insights, the system enhances both efficiency and environmental responsibility within educational institutions.








CHAPTER- 9
9. REFERENCES
Technical References
React Documentation
 Website: https://react.dev/
Node.js Documentation
 Website: https://nodejs.org/en/docs/
MongoDB Documentation
 Website: https://docs.mongodb.com/
Express.js Documentation
 Website: https://expressjs.com/en/api.html
MQTT Protocol Specification
 Website: https://mqtt.org/
Socket.IO Documentation
 Website: https://socket.io/docs/

IoT and Hardware
ESP32 Technical Reference Manual
Website:https://www.espressif.com/sites/default/files/documentation/esp32_technical_reference_manual_en.pdf
PlatformIO Documentation
 Website: https://docs.platformio.org/

AI/ML Integration
FastAPI Documentation
 Website: https://fastapi.tiangolo.com/
Scikit-learn User Guide
 Website: https://scikit-learn.org/stable/user_guide.html
Pandas Documentation
 Website: https://pandas.pydata.org/docs/


Monitoring and Analytics
Prometheus Documentation
 Website: https://prometheus.io/docs/
Grafana Documentation
 Website: https://grafana.com/docs/


UI/UX Design
Tailwind CSS Documentation
 Website: https://tailwindcss.com/docs/
Radix UI Components
 Website: https://www.radix-ui.com/

Security and Authentication
JSON Web Tokens (JWT)
 Website: https://jwt.io/


Testing Methodology
Jest Testing Framework
 Website: https://jestjs.io/docs/

Deployment and Containerization
Docker Documentation
 Website: https://docs.docker.com/


External Integrations
Telegram Bot API Documentation
 Website: https://core.telegram.org/bots/api












