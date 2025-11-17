# Module 5: AI/ML Analytics & Monitoring

## Overview
The AI/ML Analytics & Monitoring module provides intelligent data analysis, predictive modeling, and comprehensive system monitoring for the AutoVolt IoT system. It combines machine learning algorithms with real-time monitoring to optimize energy usage, predict maintenance needs, and provide actionable insights.

## Technology Stack

### AI/ML Framework
- **Python FastAPI** - High-performance async web framework
- **scikit-learn** - Machine learning algorithms
- **pandas** - Data manipulation and analysis
- **NumPy** - Numerical computing
- **MLflow** - Experiment tracking and model management

### Monitoring Stack
- **Prometheus** - Metrics collection and storage
- **Grafana** - Visualization and dashboards
- **Alertmanager** - Alert handling and notifications
- **Node Exporter** - System metrics collection

### Time Series & Analytics
- **Prophet** - Time series forecasting (Facebook)
- **statsmodels** - Statistical modeling
- **plotly** - Interactive visualizations
- **seaborn** - Statistical data visualization

## Architecture

### AI/ML Service Structure
```
ai_ml_service/
├── main.py                  # FastAPI application entry point
├── main_improved.py         # Enhanced AI features
├── advanced_ai_features.py  # Advanced ML algorithms
├── mlflow_manager.py        # MLflow integration
├── requirements.txt         # Python dependencies
├── Dockerfile               # Container configuration
├── models/                  # Trained ML models
│   ├── energy_forecaster.pkl
│   ├── anomaly_detector.pkl
│   └── voice_processor.pkl
├── test_main.py             # Unit tests
└── pytest.ini               # Test configuration
```

### Monitoring Infrastructure
```
monitoring/
├── prometheus.yml           # Prometheus configuration
├── alert.rules.yml          # Alert rules
├── dashboards/              # Grafana dashboard JSON files
│   ├── autovolt-overview.json
│   ├── device-metrics.json
│   └── energy-analytics.json
├── grafana/                 # Grafana provisioning
│   ├── dashboards/
│   ├── datasources/
│   └── notifiers/
└── alertmanager.yml         # Alertmanager configuration
```

## AI/ML Capabilities

### 1. Predictive Analytics

#### Energy Forecasting
```python
# services/energy_forecaster.py
from prophet import Prophet
import pandas as pd
import numpy as np
from typing import Dict, List, Optional
import pickle
import os

class EnergyForecaster:
    def __init__(self, model_dir: str = "models"):
        self.model_dir = model_dir
        self.models = {}
        os.makedirs(model_dir, exist_ok=True)

    def train_prophet_model(self, device_id: str, data: pd.DataFrame) -> Prophet:
        """Train Facebook Prophet model for energy forecasting"""
        # Prepare data for Prophet
        prophet_data = data.rename(columns={
            'timestamp': 'ds',
            'consumption': 'y'
        })

        # Initialize Prophet with custom settings
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=True,
            seasonality_mode='multiplicative',
            changepoint_prior_scale=0.05,
            seasonality_prior_scale=10.0
        )

        # Add custom seasonalities for classroom usage patterns
        model.add_seasonality(
            name='class_schedule',
            period=7,  # Weekly pattern
            fourier_order=3
        )

        # Add holidays for academic calendar
        model.add_country_holidays(country_name='IN')  # India holidays

        # Fit the model
        model.fit(prophet_data)

        # Save the model
        model_path = os.path.join(self.model_dir, f"{device_id}_prophet.pkl")
        with open(model_path, 'wb') as f:
            pickle.dump(model, f)

        self.models[device_id] = model
        return model

    def forecast_energy(self, device_id: str, periods: int = 24,
                       freq: str = 'H') -> Dict:
        """Generate energy consumption forecast"""
        if device_id not in self.models:
            model_path = os.path.join(self.model_dir, f"{device_id}_prophet.pkl")
            if os.path.exists(model_path):
                with open(model_path, 'rb') as f:
                    self.models[device_id] = pickle.load(f)
            else:
                raise ValueError(f"No trained model for device {device_id}")

        model = self.models[device_id]

        # Create future dataframe
        future = model.make_future_dataframe(
            periods=periods,
            freq=freq,
            include_history=False
        )

        # Generate forecast
        forecast = model.predict(future)

        # Calculate confidence intervals
        result = {
            'forecast': forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].to_dict('records'),
            'components': {
                'trend': forecast['trend'].tolist(),
                'weekly': forecast['weekly'].tolist() if 'weekly' in forecast.columns else [],
                'yearly': forecast['yearly'].tolist() if 'yearly' in forecast.columns else []
            },
            'metadata': {
                'device_id': device_id,
                'periods': periods,
                'frequency': freq,
                'generated_at': pd.Timestamp.now().isoformat()
            }
        }

        return result

    def get_forecast_accuracy(self, device_id: str,
                            test_data: pd.DataFrame) -> Dict:
        """Calculate forecast accuracy metrics"""
        if device_id not in self.models:
            raise ValueError(f"No trained model for device {device_id}")

        model = self.models[device_id]

        # Prepare test data
        test_prophet = test_data.rename(columns={
            'timestamp': 'ds',
            'consumption': 'y'
        })

        # Make predictions
        forecast = model.predict(test_prophet[['ds']])

        # Calculate metrics
        actual = test_prophet['y'].values
        predicted = forecast['yhat'].values

        mae = np.mean(np.abs(actual - predicted))
        rmse = np.sqrt(np.mean((actual - predicted) ** 2))
        mape = np.mean(np.abs((actual - predicted) / actual)) * 100

        return {
            'mae': mae,
            'rmse': rmse,
            'mape': mape,
            'accuracy_score': max(0, 100 - mape)  # Simple accuracy score
        }
```

#### Usage Pattern Analysis
```python
# services/pattern_analyzer.py
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple

class UsagePatternAnalyzer:
    def __init__(self, n_clusters: int = 4):
        self.n_clusters = n_clusters
        self.scaler = StandardScaler()
        self.kmeans = None

    def extract_features(self, consumption_data: pd.DataFrame) -> np.ndarray:
        """Extract features for pattern analysis"""
        features = []

        for device_id, device_data in consumption_data.groupby('device_id'):
            # Daily usage patterns
            daily_pattern = device_data.groupby(
                device_data['timestamp'].dt.hour
            )['consumption'].mean()

            # Weekly patterns
            weekly_pattern = device_data.groupby(
                device_data['timestamp'].dt.dayofweek
            )['consumption'].mean()

            # Statistical features
            stats = device_data['consumption'].describe()

            # Combine features
            feature_vector = np.concatenate([
                daily_pattern.values,
                weekly_pattern.values,
                [
                    stats['mean'],
                    stats['std'],
                    stats['min'],
                    stats['max'],
                    stats['50%'],  # median
                    len(device_data)  # total readings
                ]
            ])

            features.append(feature_vector)

        return np.array(features)

    def cluster_devices(self, consumption_data: pd.DataFrame) -> Dict:
        """Cluster devices based on usage patterns"""
        features = self.extract_features(consumption_data)

        # Scale features
        scaled_features = self.scaler.fit_transform(features)

        # Perform clustering
        self.kmeans = KMeans(
            n_clusters=self.n_clusters,
            random_state=42,
            n_init=10
        )

        clusters = self.kmeans.fit_predict(scaled_features)

        # Analyze cluster characteristics
        cluster_analysis = {}
        device_ids = consumption_data['device_id'].unique()

        for cluster_id in range(self.n_clusters):
            cluster_devices = device_ids[clusters == cluster_id]
            cluster_data = consumption_data[
                consumption_data['device_id'].isin(cluster_devices)
            ]

            cluster_analysis[cluster_id] = {
                'device_count': len(cluster_devices),
                'devices': cluster_devices.tolist(),
                'avg_daily_consumption': cluster_data['consumption'].mean(),
                'peak_usage_hour': cluster_data.groupby(
                    cluster_data['timestamp'].dt.hour
                )['consumption'].mean().idxmax(),
                'weekend_usage_ratio': self._calculate_weekend_ratio(cluster_data)
            }

        return {
            'clusters': cluster_analysis,
            'cluster_labels': clusters.tolist(),
            'feature_importance': self._get_feature_importance(features, clusters)
        }

    def _calculate_weekend_ratio(self, data: pd.DataFrame) -> float:
        """Calculate weekend vs weekday usage ratio"""
        data['is_weekend'] = data['timestamp'].dt.dayofweek >= 5

        weekend_avg = data[data['is_weekend']]['consumption'].mean()
        weekday_avg = data[~data['is_weekend']]['consumption'].mean()

        return weekend_avg / weekday_avg if weekday_avg > 0 else 0

    def _get_feature_importance(self, features: np.ndarray,
                              clusters: np.ndarray) -> Dict:
        """Calculate feature importance for clustering"""
        feature_names = [f'hour_{i}' for i in range(24)] + \
                       [f'day_{i}' for i in range(7)] + \
                       ['mean', 'std', 'min', 'max', 'median', 'count']

        importance_scores = {}
        for i, feature_name in enumerate(feature_names):
            # Calculate variance between clusters for this feature
            cluster_means = []
            for cluster_id in range(self.n_clusters):
                cluster_mask = clusters == cluster_id
                if np.any(cluster_mask):
                    cluster_means.append(np.mean(features[cluster_mask, i]))

            importance_scores[feature_name] = np.var(cluster_means)

        return importance_scores
```

### 2. Anomaly Detection

#### Isolation Forest Implementation
```python
# services/anomaly_detector.py
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
import pickle
import os

class AnomalyDetector:
    def __init__(self, model_dir: str = "models", contamination: float = 0.1):
        self.model_dir = model_dir
        self.contamination = contamination
        self.models = {}
        self.scalers = {}
        os.makedirs(model_dir, exist_ok=True)

    def extract_features(self, data: pd.DataFrame) -> np.ndarray:
        """Extract relevant features for anomaly detection"""
        features = []

        for _, row in data.iterrows():
            timestamp = pd.to_datetime(row['timestamp'])

            feature_vector = [
                row['consumption'],           # Raw consumption
                timestamp.hour,               # Time-based features
                timestamp.dayofweek,
                1 if timestamp.dayofweek >= 5 else 0,  # Weekend flag
                timestamp.month,
                row.get('temperature', 25),   # Environmental factors
                row.get('occupancy', 0),
                row.get('device_count', 1)
            ]

            features.append(feature_vector)

        return np.array(features)

    def train_model(self, device_id: str, data: pd.DataFrame) -> IsolationForest:
        """Train isolation forest for anomaly detection"""
        features = self.extract_features(data)

        # Scale features
        scaler = StandardScaler()
        scaled_features = scaler.fit_transform(features)

        # Train isolation forest
        model = IsolationForest(
            contamination=self.contamination,
            random_state=42,
            n_estimators=100,
            max_samples='auto'
        )

        model.fit(scaled_features)

        # Save model and scaler
        model_path = os.path.join(self.model_dir, f"{device_id}_anomaly.pkl")
        scaler_path = os.path.join(self.model_dir, f"{device_id}_scaler.pkl")

        with open(model_path, 'wb') as f:
            pickle.dump(model, f)
        with open(scaler_path, 'wb') as f:
            pickle.dump(scaler, f)

        self.models[device_id] = model
        self.scalers[device_id] = scaler

        return model

    def detect_anomalies(self, device_id: str, data: pd.DataFrame) -> List[Dict]:
        """Detect anomalies in energy consumption data"""
        if device_id not in self.models:
            model_path = os.path.join(self.model_dir, f"{device_id}_anomaly.pkl")
            scaler_path = os.path.join(self.model_dir, f"{device_id}_scaler.pkl")

            if os.path.exists(model_path) and os.path.exists(scaler_path):
                with open(model_path, 'rb') as f:
                    self.models[device_id] = pickle.load(f)
                with open(scaler_path, 'rb') as f:
                    self.scalers[device_id] = pickle.load(f)
            else:
                raise ValueError(f"No trained model for device {device_id}")

        model = self.models[device_id]
        scaler = self.scalers[device_id]

        features = self.extract_features(data)
        scaled_features = scaler.transform(features)

        # Get anomaly scores and predictions
        anomaly_scores = model.decision_function(scaled_features)
        predictions = model.predict(scaled_features)

        # Convert to human-readable format
        anomalies = []
        for i, (pred, score) in enumerate(zip(predictions, anomaly_scores)):
            if pred == -1:  # Anomaly
                confidence = self._calculate_confidence(score, model)

                anomalies.append({
                    'timestamp': data.iloc[i]['timestamp'].isoformat(),
                    'consumption': data.iloc[i]['consumption'],
                    'anomaly_score': float(score),
                    'confidence': float(confidence),
                    'features': {
                        'hour': data.iloc[i]['timestamp'].hour,
                        'day_of_week': data.iloc[i]['timestamp'].dayofweek,
                        'is_weekend': data.iloc[i]['timestamp'].dayofweek >= 5,
                        'temperature': data.iloc[i].get('temperature'),
                        'occupancy': data.iloc[i].get('occupancy')
                    }
                })

        return anomalies

    def _calculate_confidence(self, score: float, model: IsolationForest) -> float:
        """Calculate confidence score for anomaly detection"""
        # Convert anomaly score to confidence (0-1 scale)
        # Lower (more negative) scores indicate higher confidence anomalies
        min_score = np.min(model.decision_function(model.X_))
        max_score = np.max(model.decision_function(model.X_))

        # Normalize to 0-1 scale (1 = high confidence anomaly)
        if max_score == min_score:
            return 1.0

        normalized_score = (score - min_score) / (max_score - min_score)
        return 1.0 - normalized_score  # Invert so higher values = more anomalous

    def get_anomaly_statistics(self, device_id: str,
                             anomalies: List[Dict]) -> Dict:
        """Generate statistics about detected anomalies"""
        if not anomalies:
            return {'total_anomalies': 0}

        df = pd.DataFrame(anomalies)
        df['timestamp'] = pd.to_datetime(df['timestamp'])

        stats = {
            'total_anomalies': len(anomalies),
            'avg_confidence': df['confidence'].mean(),
            'max_confidence': df['confidence'].max(),
            'anomalies_by_hour': df.groupby(df['timestamp'].dt.hour).size().to_dict(),
            'anomalies_by_day': df.groupby(df['timestamp'].dt.dayofweek).size().to_dict(),
            'avg_consumption_anomalous': df['consumption'].mean(),
            'anomaly_frequency': len(anomalies) / len(df) if len(df) > 0 else 0
        }

        return stats
```

### 3. Voice Command Processing

#### Natural Language Processing
```python
# services/voice_processor.py
import re
import spacy
from typing import Dict, List, Tuple, Optional
from datetime import datetime, time
import json

class VoiceCommandProcessor:
    def __init__(self):
        # Load spaCy model for NLP
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            # Fallback if model not available
            self.nlp = None

        # Command patterns and keywords
        self.intent_patterns = {
            'device_control': [
                r'\bturn\s+(on|off)\b',
                r'\bswitch\s+(on|off)\b',
                r'\bpower\s+(on|off)\b',
                r'\bactivate\b',
                r'\bdeactivate\b'
            ],
            'status_query': [
                r'\bstatus\b',
                r'\bstate\b',
                r'\bis\s+(on|off)\b',
                r'\bhow\s+is\b',
                r'\bcheck\b'
            ],
            'energy_query': [
                r'\bconsumption\b',
                r'\busage\b',
                r'\benergy\b',
                r'\bpower\b',
                r'\belectricity\b'
            ],
            'schedule_query': [
                r'\bschedule\b',
                r'\bwhen\b',
                r'\btime\b',
                r'\btimer\b'
            ]
        }

        # Device and location mappings
        self.device_keywords = {
            'lights': ['light', 'lights', 'lamp', 'lamps'],
            'fans': ['fan', 'fans', 'ceiling fan'],
            'projectors': ['projector', 'projectors', 'screen'],
            'ac': ['ac', 'air conditioner', 'cooling']
        }

        self.location_keywords = [
            'classroom', 'lab', 'office', 'hall', 'auditorium'
        ]

    def process_command(self, text: str, context: Optional[Dict] = None) -> Dict:
        """Process natural language voice commands"""
        text = text.lower().strip()

        # Intent classification
        intent = self._classify_intent(text)

        # Entity extraction
        entities = self._extract_entities(text)

        # Context integration
        enriched_command = self._enrich_with_context(entities, context or {})

        # Command validation
        validation = self._validate_command(enriched_command)

        # Generate response
        response = {
            'intent': intent,
            'entities': entities,
            'command': enriched_command,
            'validation': validation,
            'confidence': self._calculate_confidence(text, intent, entities),
            'timestamp': datetime.now().isoformat(),
            'original_text': text
        }

        return response

    def _classify_intent(self, text: str) -> str:
        """Classify user intent from voice command"""
        for intent, patterns in self.intent_patterns.items():
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    return intent

        return 'unknown'

    def _extract_entities(self, text: str) -> Dict:
        """Extract entities like device names, locations, actions, etc."""
        entities = {
            'devices': [],
            'locations': [],
            'actions': [],
            'times': [],
            'numbers': []
        }

        # Extract device types
        for device_type, keywords in self.device_keywords.items():
            for keyword in keywords:
                if keyword in text:
                    entities['devices'].append(device_type)
                    break

        # Extract locations
        for location in self.location_keywords:
            if location in text:
                entities['locations'].append(location)

        # Extract room numbers
        room_matches = re.findall(r'\b\d+\b', text)
        entities['numbers'].extend(room_matches)

        # Extract actions
        action_keywords = ['on', 'off', 'up', 'down', 'increase', 'decrease']
        for action in action_keywords:
            if action in text:
                entities['actions'].append(action)

        # Extract times
        time_patterns = [
            r'\b\d{1,2}:\d{2}\b',  # HH:MM
            r'\b\d{1,2}\s*(am|pm)\b',  # 3 pm
            r'\bin\s+\d+\s+(minutes?|hours?)\b'  # in 5 minutes
        ]

        for pattern in time_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            entities['times'].extend(matches)

        # Remove duplicates
        for key in entities:
            entities[key] = list(set(entities[key]))

        return entities

    def _enrich_with_context(self, entities: Dict, context: Dict) -> Dict:
        """Enrich command with contextual information"""
        enriched = entities.copy()

        # Add current location if available
        if 'current_location' in context and not entities['locations']:
            enriched['locations'].append(context['current_location'])

        # Add preferred devices if available
        if 'preferred_devices' in context and not entities['devices']:
            enriched['devices'].extend(context['preferred_devices'])

        # Add time context
        if 'current_time' in context:
            enriched['current_time'] = context['current_time']

        return enriched

    def _validate_command(self, command: Dict) -> Dict:
        """Validate the parsed command for completeness and feasibility"""
        validation = {
            'is_valid': True,
            'errors': [],
            'warnings': [],
            'suggestions': []
        }

        # Check for required entities based on intent
        if command.get('intent') == 'device_control':
            if not command.get('devices'):
                validation['errors'].append('No device specified')
                validation['suggestions'].append('Try: "turn on the lights"')
            if not command.get('actions'):
                validation['errors'].append('No action specified')
                validation['suggestions'].append('Try: "turn on" or "turn off"')

        elif command.get('intent') == 'status_query':
            if not command.get('devices') and not command.get('locations'):
                validation['warnings'].append('Consider specifying a device or location')

        # Check for conflicting actions
        actions = command.get('actions', [])
        conflicting_pairs = [('on', 'off'), ('up', 'down')]
        for pair in conflicting_pairs:
            if all(action in actions for action in pair):
                validation['errors'].append(f'Conflicting actions: {pair[0]} and {pair[1]}')

        validation['is_valid'] = len(validation['errors']) == 0

        return validation

    def _calculate_confidence(self, text: str, intent: str, entities: Dict) -> float:
        """Calculate confidence score for the command interpretation"""
        confidence = 0.0

        # Base confidence from intent matching
        if intent != 'unknown':
            confidence += 0.4

        # Add confidence from entity extraction
        entity_count = sum(len(v) for v in entities.values())
        confidence += min(entity_count * 0.2, 0.4)

        # Length-based confidence (very short commands are less reliable)
        if len(text.split()) >= 3:
            confidence += 0.2

        return min(confidence, 1.0)
```

## Monitoring & Alerting System

### Prometheus Metrics Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert.rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'autovolt-backend'
    static_configs:
      - targets: ['backend:3001']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'autovolt-ai-service'
    static_configs:
      - targets: ['ai-ml-service:8002']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
    scrape_interval: 15s

  - job_name: 'mongodb-exporter'
    static_configs:
      - targets: ['mongodb-exporter:9216']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Alert Rules
```yaml
# alert.rules.yml
groups:
  - name: autovolt_alerts
    rules:
      # Device offline alerts
      - alert: DeviceOffline
        expr: esp32_uptime_seconds{device_id=~".+"} < 300
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Device {{ $labels.device_id }} is offline"
          description: "Device {{ $labels.device_id }} has been offline for more than 5 minutes"

      # High energy consumption alerts
      - alert: HighEnergyConsumption
        expr: rate(energy_consumption_watts{device_id=~".+"}[5m]) > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High energy consumption detected"
          description: "Energy consumption rate is {{ $value }} watts for device {{ $labels.device_id }}"

      # AI service performance alerts
      - alert: AIModelAccuracyLow
        expr: ai_model_accuracy < 0.8
        for: 15m
        labels:
          severity: warning
        annotations:
          summary: "AI model accuracy is low"
          description: "AI model accuracy dropped below 80%"

      # System resource alerts
      - alert: HighMemoryUsage
        expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is {{ $value | humanizePercentage }}"

      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is {{ $value }}%"
```

### Grafana Dashboards

#### System Overview Dashboard
```json
{
  "dashboard": {
    "title": "AutoVolt System Overview",
    "tags": ["autovolt", "overview"],
    "timezone": "browser",
    "panels": [
      {
        "title": "Active Devices",
        "type": "stat",
        "targets": [
          {
            "expr": "count(esp32_uptime_seconds{device_id=~\".+\"})",
            "legendFormat": "Active Devices"
          }
        ]
      },
      {
        "title": "Total Energy Consumption",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(energy_consumption_watts[5m]))",
            "legendFormat": "Total Consumption (W)"
          }
        ]
      },
      {
        "title": "System CPU Usage",
        "type": "graph",
        "targets": [
          {
            "expr": "100 - (avg(irate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
            "legendFormat": "CPU Usage %"
          }
        ]
      }
    ]
  }
}
```

## Smart Notification System

### Intelligent Alerting Service
```python
# services/smart_notifications.py
from typing import Dict, List, Optional
import asyncio
from datetime import datetime, timedelta
import json
import aiohttp

class SmartNotificationService:
    def __init__(self, telegram_token: str, cooldown_minutes: int = 5):
        self.telegram_token = telegram_token
        self.cooldown_period = timedelta(minutes=cooldown_minutes)
        self.alert_history: Dict[str, datetime] = {}
        self.base_url = f"https://api.telegram.org/bot{telegram_token}"

    async def send_smart_alert(self, alert_type: str, data: Dict,
                             priority: str = 'normal') -> bool:
        """Send intelligent alert with spam prevention"""
        try:
            # Generate alert key for deduplication
            alert_key = f"{alert_type}:{data.get('device_id', 'system')}"

            # Check cooldown period
            last_alert = self.alert_history.get(alert_key)
            if last_alert and (datetime.now() - last_alert) < self.cooldown_period:
                print(f"Alert {alert_key} suppressed due to cooldown")
                return False

            # Determine recipients based on alert type and priority
            recipients = await self._determine_recipients(alert_type, data, priority)

            if not recipients:
                print(f"No recipients found for alert type: {alert_type}")
                return False

            # Generate personalized message
            message = await self._generate_personalized_message(alert_type, data)

            # Send notifications
            success = await self._deliver_alerts(recipients, message, priority)

            # Update alert history
            if success:
                self.alert_history[alert_key] = datetime.now()

            return success

        except Exception as e:
            print(f"Error sending smart alert: {e}")
            return False

    async def _determine_recipients(self, alert_type: str, data: Dict,
                                  priority: str) -> List[str]:
        """Determine who should receive the alert"""
        recipients = []

        # Critical alerts go to admins
        if priority == 'critical':
            recipients.extend(await self._get_admin_chat_ids())

        # Device-specific alerts
        device_id = data.get('device_id')
        if device_id:
            device_owners = await self._get_device_owners(device_id)
            recipients.extend(device_owners)

        # Location-based alerts
        classroom = data.get('classroom')
        if classroom:
            faculty = await self._get_classroom_faculty(classroom)
            recipients.extend(faculty)

        # Remove duplicates and return
        return list(set(recipients))

    async def _generate_personalized_message(self, alert_type: str, data: Dict) -> str:
        """Generate personalized alert message"""
        templates = {
            'device_offline': "🚨 Device {device_name} in {classroom} is offline since {last_seen}",
            'high_energy': "⚡ High energy usage: {consumption}W in {classroom} ({device_name})",
            'motion_detected': "👤 Motion detected in {classroom} after hours",
            'anomaly_detected': "🔍 Unusual energy pattern detected in {classroom}",
            'maintenance_needed': "🔧 Device {device_name} requires maintenance: {issue}",
            'forecast_accuracy_low': "📊 Energy forecast accuracy dropped below threshold"
        }

        template = templates.get(alert_type, f"System alert: {alert_type}")

        # Replace placeholders with actual data
        message = template
        for key, value in data.items():
            placeholder = f"{{{key}}}"
            if placeholder in message:
                message = message.replace(placeholder, str(value))

        return message

    async def _deliver_alerts(self, recipients: List[str], message: str,
                            priority: str) -> bool:
        """Deliver alerts via Telegram"""
        success_count = 0

        for chat_id in recipients:
            try:
                await self._send_telegram_message(chat_id, message)
                success_count += 1
                await asyncio.sleep(0.1)  # Rate limiting
            except Exception as e:
                print(f"Failed to send alert to {chat_id}: {e}")

        return success_count > 0

    async def _send_telegram_message(self, chat_id: str, message: str) -> None:
        """Send message via Telegram Bot API"""
        url = f"{self.base_url}/sendMessage"

        payload = {
            'chat_id': chat_id,
            'text': message,
            'parse_mode': 'HTML',
            'disable_notification': False
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as response:
                if response.status != 200:
                    error_data = await response.json()
                    raise Exception(f"Telegram API error: {error_data}")

    # Placeholder methods for recipient determination
    async def _get_admin_chat_ids(self) -> List[str]:
        # In real implementation, fetch from database
        return ['123456789', '987654321']  # Example admin chat IDs

    async def _get_device_owners(self, device_id: str) -> List[str]:
        # In real implementation, query database for device owners
        return ['111111111']  # Example owner chat ID

    async def _get_classroom_faculty(self, classroom: str) -> List[str]:
        # In real implementation, query database for faculty assigned to classroom
        return ['222222222']  # Example faculty chat ID
```

## MLflow Experiment Tracking

### Model Management
```python
# services/mlflow_manager.py
import mlflow
import mlflow.sklearn
from typing import Dict, Any, Optional
import pandas as pd
from datetime import datetime
import os

class MLflowManager:
    def __init__(self, tracking_uri: str = "sqlite:///mlflow.db",
                 experiment_name: str = "autovolt-analytics"):
        mlflow.set_tracking_uri(tracking_uri)
        self.experiment_name = experiment_name
        self._ensure_experiment()

    def _ensure_experiment(self):
        """Create experiment if it doesn't exist"""
        try:
            experiment = mlflow.get_experiment_by_name(self.experiment_name)
            if experiment is None:
                mlflow.create_experiment(self.experiment_name)
        except Exception as e:
            print(f"Error creating experiment: {e}")

    def log_experiment(self, model_name: str, model: Any, metrics: Dict[str, float],
                      params: Dict[str, Any], artifacts: Optional[Dict[str, str]] = None,
                      tags: Optional[Dict[str, str]] = None) -> str:
        """Log ML experiment to MLflow"""
        with mlflow.start_run(experiment_id=self._get_experiment_id()) as run:

            # Log parameters
            mlflow.log_params(params)

            # Log metrics
            mlflow.log_metrics(metrics)

            # Log model
            mlflow.sklearn.log_model(model, model_name)

            # Log artifacts
            if artifacts:
                for artifact_name, artifact_path in artifacts.items():
                    if os.path.exists(artifact_path):
                        mlflow.log_artifact(artifact_path, artifact_name)

            # Set default tags
            default_tags = {
                "model_type": model_name,
                "framework": "scikit-learn",
                "version": "1.0.0",
                "logged_at": datetime.now().isoformat()
            }

            if tags:
                default_tags.update(tags)

            mlflow.set_tags(default_tags)

            run_id = run.info.run_id
            print(f"Experiment logged with run ID: {run_id}")

            return run_id

    def _get_experiment_id(self) -> str:
        """Get experiment ID"""
        experiment = mlflow.get_experiment_by_name(self.experiment_name)
        return experiment.experiment_id

    def load_best_model(self, model_name: str, metric: str = "accuracy",
                       mode: str = "max") -> Optional[Any]:
        """Load best performing model based on metric"""
        try:
            client = mlflow.tracking.MlflowClient()

            # Search for runs in the experiment
            experiment = mlflow.get_experiment_by_name(self.experiment_name)
            runs = client.search_runs(
                experiment.experiment_id,
                order_by=[f"metrics.{metric} {'DESC' if mode == 'max' else 'ASC'}"],
                max_results=1
            )

            if runs:
                run_id = runs[0].info.run_id
                model_uri = f"runs:/{run_id}/{model_name}"
                model = mlflow.sklearn.load_model(model_uri)
                print(f"Loaded best model from run {run_id}")
                return model

        except Exception as e:
            print(f"Error loading best model: {e}")

        return None

    def get_experiment_runs(self, n_runs: int = 10) -> pd.DataFrame:
        """Get recent experiment runs"""
        client = mlflow.tracking.MlflowClient()
        experiment = mlflow.get_experiment_by_name(self.experiment_name)

        runs = client.search_runs(
            experiment.experiment_id,
            order_by=["attributes.start_time DESC"],
            max_results=n_runs
        )

        run_data = []
        for run in runs:
            run_info = {
                'run_id': run.info.run_id,
                'status': run.info.status,
                'start_time': datetime.fromtimestamp(run.info.start_time / 1000),
                'end_time': datetime.fromtimestamp(run.info.end_time / 1000) if run.info.end_time else None,
                'metrics': run.data.metrics,
                'params': run.data.params,
                'tags': run.data.tags
            }
            run_data.append(run_info)

        return pd.DataFrame(run_data)

    def compare_models(self, model_names: List[str], metric: str) -> pd.DataFrame:
        """Compare performance of different models"""
        client = mlflow.tracking.MlflowClient()
        experiment = mlflow.get_experiment_by_name(self.experiment_name)

        comparison_data = []

        for model_name in model_names:
            # Find runs with this model
            filter_string = f"tags.model_type = '{model_name}'"
            runs = client.search_runs(
                experiment.experiment_id,
                filter_string=filter_string,
                order_by=[f"metrics.{metric} DESC"],
                max_results=1
            )

            if runs:
                run = runs[0]
                comparison_data.append({
                    'model_name': model_name,
                    'best_metric': run.data.metrics.get(metric),
                    'run_id': run.info.run_id,
                    'params': run.data.params
                })

        return pd.DataFrame(comparison_data)
```

## Performance Optimization

### Model Optimization Techniques
```python
# services/model_optimizer.py
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV
from sklearn.ensemble import IsolationForest
from sklearn.metrics import make_scorer
import numpy as np
from typing import Dict, Any, Optional

class ModelOptimizer:
    def __init__(self):
        self.param_grids = {
            'isolation_forest': {
                'n_estimators': [50, 100, 200],
                'contamination': [0.05, 0.1, 0.15, 0.2],
                'max_samples': ['auto', 0.6, 0.8],
                'random_state': [42]
            }
        }

    def optimize_isolation_forest(self, X_train: np.ndarray,
                                cv_folds: int = 3,
                                scoring: str = 'neg_mean_squared_error') -> Dict[str, Any]:
        """Optimize Isolation Forest parameters"""
        param_grid = self.param_grids['isolation_forest']

        # Create base model
        base_model = IsolationForest()

        # Use RandomizedSearchCV for efficiency
        search_cv = RandomizedSearchCV(
            base_model,
            param_grid,
            n_iter=20,
            cv=cv_folds,
            scoring=scoring,
            random_state=42,
            n_jobs=-1
        )

        # Fit the model
        search_cv.fit(X_train)

        # Get best parameters and score
        best_params = search_cv.best_params_
        best_score = search_cv.best_score_

        # Train final model with best parameters
        optimized_model = IsolationForest(**best_params)
        optimized_model.fit(X_train)

        return {
            'model': optimized_model,
            'best_params': best_params,
            'best_score': best_score,
            'cv_results': search_cv.cv_results_
        }

    def optimize_energy_forecaster(self, data: pd.DataFrame,
                                 param_ranges: Optional[Dict] = None) -> Dict[str, Any]:
        """Optimize energy forecasting model parameters"""
        from prophet import Prophet

        if param_ranges is None:
            param_ranges = {
                'changepoint_prior_scale': [0.01, 0.05, 0.1, 0.5],
                'seasonality_prior_scale': [1.0, 5.0, 10.0, 15.0],
                'holidays_prior_scale': [1.0, 5.0, 10.0],
                'seasonality_mode': ['additive', 'multiplicative']
            }

        # Prepare data
        prophet_data = data.rename(columns={
            'timestamp': 'ds',
            'consumption': 'y'
        })

        best_model = None
        best_score = float('inf')
        best_params = {}

        # Grid search over parameters
        from itertools import product
        param_combinations = list(product(*param_ranges.values()))
        param_names = list(param_ranges.keys())

        for param_values in param_combinations:
            params = dict(zip(param_names, param_values))

            try:
                # Train model
                model = Prophet(**params)
                model.fit(prophet_data)

                # Cross-validation score (simplified)
                # In practice, use Prophet's cross_validation
                score = self._evaluate_prophet_model(model, prophet_data)

                if score < best_score:
                    best_score = score
                    best_model = model
                    best_params = params

            except Exception as e:
                print(f"Error with params {params}: {e}")
                continue

        return {
            'model': best_model,
            'best_params': best_params,
            'best_score': best_score
        }

    def _evaluate_prophet_model(self, model: Prophet, data: pd.DataFrame) -> float:
        """Evaluate Prophet model performance"""
        # Simple evaluation - in practice use proper cross-validation
        forecast = model.predict(data[['ds']])
        actual = data['y'].values
        predicted = forecast['yhat'].values

        # Mean Absolute Percentage Error
        mape = np.mean(np.abs((actual - predicted) / actual)) * 100
        return mape
```

## Deployment & Scaling

### FastAPI Application
```python
# main.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import uvicorn
import prometheus_client
from prometheus_client import Counter, Histogram, Gauge

# Import services
from services.energy_forecaster import EnergyForecaster
from services.anomaly_detector import AnomalyDetector
from services.voice_processor import VoiceCommandProcessor
from services.smart_notifications import SmartNotificationService

# Create FastAPI app
app = FastAPI(
    title="AutoVolt AI/ML Service",
    description="AI/ML analytics service for AutoVolt IoT system",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics
REQUEST_COUNT = Counter('ai_requests_total', 'Total AI service requests', ['endpoint'])
REQUEST_LATENCY = Histogram('ai_request_duration_seconds', 'AI request duration', ['endpoint'])
ACTIVE_MODELS = Gauge('ai_active_models', 'Number of active ML models')

# Initialize services
energy_forecaster = EnergyForecaster()
anomaly_detector = AnomalyDetector()
voice_processor = VoiceCommandProcessor()
notification_service = SmartNotificationService(
    telegram_token=os.getenv('TELEGRAM_BOT_TOKEN', '')
)

# Pydantic models for request/response
class ForecastRequest(BaseModel):
    device_id: str
    periods: Optional[int] = 24
    freq: Optional[str] = 'H'

class AnomalyDetectionRequest(BaseModel):
    device_id: str
    data: List[Dict]

class VoiceCommandRequest(BaseModel):
    command: str
    context: Optional[Dict] = None

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    ACTIVE_MODELS.set(3)  # Number of active model types

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "ai-ml-service"}

@app.post("/api/forecast/energy")
async def forecast_energy(request: ForecastRequest, background_tasks: BackgroundTasks):
    """Generate energy consumption forecast"""
    REQUEST_COUNT.labels(endpoint='forecast').inc()
    with REQUEST_LATENCY.labels(endpoint='forecast').time():
        try:
            # Get historical data (in practice, fetch from database)
            # historical_data = await get_device_history(request.device_id)

            # For demo, return mock response
            forecast_result = {
                "forecast": [
                    {"ds": "2025-01-15T10:00:00", "yhat": 150.5, "yhat_lower": 140.0, "yhat_upper": 161.0},
                    {"ds": "2025-01-15T11:00:00", "yhat": 145.2, "yhat_lower": 135.0, "yhat_upper": 155.5}
                ],
                "device_id": request.device_id,
                "periods": request.periods,
                "status": "success"
            }

            return forecast_result

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/anomaly/detect")
async def detect_anomalies(request: AnomalyDetectionRequest):
    """Detect anomalies in energy consumption data"""
    REQUEST_COUNT.labels(endpoint='anomaly').inc()
    with REQUEST_LATENCY.labels(endpoint='anomaly').time():
        try:
            # Process anomaly detection
            anomalies = anomaly_detector.detect_anomalies(
                request.device_id,
                pd.DataFrame(request.data)
            )

            return {
                "device_id": request.device_id,
                "anomalies": anomalies,
                "total_anomalies": len(anomalies),
                "status": "success"
            }

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/voice/process")
async def process_voice_command(request: VoiceCommandRequest):
    """Process voice command"""
    REQUEST_COUNT.labels(endpoint='voice').inc()
    with REQUEST_LATENCY.labels(endpoint='voice').time():
        try:
            result = voice_processor.process_command(
                request.command,
                request.context
            )

            return result

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return prometheus_client.generate_latest()

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=True,
        log_level="info"
    )
```

### Docker Configuration
```dockerfile
# Dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8002/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
```

This comprehensive AI/ML Analytics & Monitoring module provides intelligent data analysis, predictive modeling, and system monitoring capabilities for the AutoVolt IoT classroom automation system, enabling proactive energy management and automated optimization.