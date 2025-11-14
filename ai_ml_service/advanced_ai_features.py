"""
Advanced AI Features for AutoVolt
Includes anomaly detection, predictive maintenance, NLP, and computer vision
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any, Tuple
import logging
from datetime import datetime, timedelta
import json
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor
import cv2
# Lazy import heavy frameworks
_torch = None
_tensorflow = None

def _get_torch():
    global _torch
    if _torch is None:
        try:
            import torch
            _torch = torch
        except ImportError as e:
            logging.warning(f"PyTorch not available: {e}")
            _torch = None
    return _torch

def _get_tensorflow():
    global _tensorflow
    if _tensorflow is None:
        try:
            import tensorflow as tf
            _tensorflow = tf
        except ImportError as e:
            logging.warning(f"TensorFlow not available: {e}")
            _tensorflow = None
    return _tensorflow
import joblib

# Lazy imports for heavy libraries
def _import_transformers():
    """Lazy import for transformers to avoid startup issues"""
    try:
        from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
        from transformers import AutoModelForObjectDetection, AutoImageProcessor
        return pipeline, AutoTokenizer, AutoModelForSequenceClassification, AutoModelForObjectDetection, AutoImageProcessor
    except ImportError as e:
        logging.warning(f"Transformers not available: {e}")
        return None, None, None, None, None

def _import_nltk():
    """Lazy import for NLTK"""
    try:
        import nltk
        from nltk.tokenize import word_tokenize
        from nltk.corpus import stopwords
        return nltk, word_tokenize, stopwords
    except ImportError as e:
        logging.warning(f"NLTK not available: {e}")
        return None, None, None

# Import other libraries
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import pyod
from pyod.models.knn import KNN
from pyod.models.lof import LOF
from pyod.models.iforest import IForest
from pyod.models.ocsvm import OCSVM
# Lazy import spaCy
_spacy = None

def _get_spacy():
    global _spacy
    if _spacy is None:
        try:
            import spacy
            _spacy = spacy
        except ImportError as e:
            logging.warning(f"spaCy not available: {e}")
            _spacy = None
    return _spacy

from ultralytics import YOLO
import mlflow
from mlflow_manager import get_mlflow_manager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AdvancedAnomalyDetector:
    """Advanced anomaly detection using multiple algorithms"""

    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.mlflow_manager = get_mlflow_manager()

    def train_isolation_forest(self, data: pd.DataFrame, contamination: float = 0.1) -> IsolationForest:
        """
        Train Isolation Forest for anomaly detection

        Args:
            data: Training data
            contamination: Expected proportion of anomalies

        Returns:
            Trained Isolation Forest model
        """
        scaler = StandardScaler()
        scaled_data = scaler.fit_transform(data)

        model = IsolationForest(contamination=contamination, random_state=42)
        model.fit(scaled_data)

        return model, scaler

    def train_multiple_models(self, data: pd.DataFrame, device_type: str) -> Dict[str, Any]:
        """
        Train multiple anomaly detection models

        Args:
            data: Training data with features
            device_type: Type of device (fan, light, etc.)

        Returns:
            Dictionary of trained models
        """
        models = {}
        scalers = {}

        # Prepare data
        feature_cols = [col for col in data.columns if col not in ['timestamp', 'device_id', 'anomaly_label']]
        X = data[feature_cols]

        # Isolation Forest
        if_model, if_scaler = self.train_isolation_forest(X)
        models['isolation_forest'] = if_model
        scalers['isolation_forest'] = if_scaler

        # KNN-based anomaly detection
        knn_model = KNN(contamination=0.1)
        knn_scaler = StandardScaler()
        X_scaled = knn_scaler.fit_transform(X)
        knn_model.fit(X_scaled)
        models['knn'] = knn_model
        scalers['knn'] = knn_scaler

        # Local Outlier Factor
        lof_model = LOF(contamination=0.1)
        lof_scaler = StandardScaler()
        X_scaled_lof = lof_scaler.fit_transform(X)
        lof_model.fit(X_scaled_lof)
        models['lof'] = lof_model
        scalers['lof'] = lof_scaler

        # Store models
        self.models[device_type] = models
        self.scalers[device_type] = scalers

        # Log to MLflow
        run_id = self.mlflow_manager.start_run(
            f"anomaly_detection_training_{device_type}",
            tags={"model_type": "anomaly_detection", "device_type": device_type}
        )

        self.mlflow_manager.log_model_params({
            "contamination": 0.1,
            "algorithms": list(models.keys()),
            "feature_count": len(feature_cols)
        })

        self.mlflow_manager.end_run()

        logger.info(f"Trained anomaly detection models for {device_type}")
        return models

    def detect_anomalies(self, data: pd.DataFrame, device_type: str) -> pd.DataFrame:
        """
        Detect anomalies using ensemble of models

        Args:
            data: Data to analyze for anomalies
            device_type: Type of device

        Returns:
            DataFrame with anomaly scores and predictions
        """
        if device_type not in self.models:
            logger.warning(f"No trained models for device type: {device_type}")
            return data

        models = self.models[device_type]
        scalers = self.scalers[device_type]

        feature_cols = [col for col in data.columns if col not in ['timestamp', 'device_id']]
        X = data[feature_cols]

        # Get predictions from all models
        predictions = {}
        scores = {}

        for model_name, model in models.items():
            scaler = scalers[model_name]
            X_scaled = scaler.transform(X)

            if hasattr(model, 'predict'):
                pred = model.predict(X_scaled)
                score = model.decision_function(X_scaled) if hasattr(model, 'decision_function') else pred
            else:
                pred = model.predict(X_scaled)
                score = pred

            predictions[model_name] = pred
            scores[model_name] = score

        # Ensemble prediction (majority vote)
        all_predictions = np.array(list(predictions.values()))
        ensemble_pred = np.apply_along_axis(lambda x: np.bincount(x).argmax(), axis=0, arr=all_predictions)

        # Average anomaly score
        ensemble_score = np.mean(list(scores.values()), axis=0)

        # Add results to dataframe
        result_df = data.copy()
        result_df['anomaly_score'] = ensemble_score
        result_df['anomaly_prediction'] = ensemble_pred
        result_df['is_anomaly'] = (ensemble_pred == -1).astype(int)

        # Log detection results
        anomaly_rate = result_df['is_anomaly'].mean()
        logger.info(f"Detected {result_df['is_anomaly'].sum()} anomalies in {len(result_df)} samples ({anomaly_rate:.2%})")

        return result_df

class PredictiveMaintenanceEngine:
    """Predictive maintenance using time series forecasting and ML"""

    def __init__(self):
        self.models = {}
        self.mlflow_manager = get_mlflow_manager()

    def train_failure_prediction_model(self, historical_data: pd.DataFrame,
                                     device_type: str) -> Dict[str, Any]:
        """
        Train model to predict device failures

        Args:
            historical_data: Historical device data with failure labels
            device_type: Type of device

        Returns:
            Dictionary with trained models and metadata
        """
        # Feature engineering
        features = self._extract_failure_features(historical_data)

        # Prepare target variable (time to failure or failure probability)
        if 'failure_date' in historical_data.columns:
            # Survival analysis approach
            historical_data['days_to_failure'] = (
                pd.to_datetime(historical_data['failure_date']) -
                pd.to_datetime(historical_data['timestamp'])
            ).dt.days

            # For simplicity, convert to binary classification (will fail in next 30 days)
            historical_data['will_fail_30d'] = (historical_data['days_to_failure'] <= 30).astype(int)
            target = 'will_fail_30d'
        else:
            # Use anomaly scores as proxy for failure likelihood
            target = 'failure_risk'

        # Train model
        X = features.drop(['device_id', 'timestamp', target], axis=1, errors='ignore')
        y = features[target] if target in features.columns else historical_data[target]

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Use ensemble model for better performance
        from sklearn.ensemble import RandomForestClassifier
        model = RandomForestClassifier(n_estimators=100, random_state=42)
        model.fit(X_train, y_train)

        # Evaluate model
        from sklearn.metrics import classification_report, roc_auc_score
        y_pred = model.predict(X_test)
        y_pred_proba = model.predict_proba(X_test)[:, 1]

        # Log to MLflow
        run_id = self.mlflow_manager.start_run(
            f"predictive_maintenance_{device_type}",
            tags={"model_type": "predictive_maintenance", "device_type": device_type}
        )

        self.mlflow_manager.log_model_params({
            "algorithm": "RandomForest",
            "n_estimators": 100,
            "features": list(X.columns)
        })

        # Calculate metrics
        try:
            auc_score = roc_auc_score(y_test, y_pred_proba)
            self.mlflow_manager.log_model_metrics({"auc_score": auc_score})
        except:
            pass

        self.mlflow_manager.log_model(model, "sklearn", "predictive_maintenance_model")
        self.mlflow_manager.end_run()

        # Store model
        self.models[device_type] = {
            'model': model,
            'features': list(X.columns),
            'target': target,
            'trained_at': datetime.now()
        }

        logger.info(f"Trained predictive maintenance model for {device_type}")
        return self.models[device_type]

    def _extract_failure_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """
        Extract features relevant for failure prediction

        Args:
            data: Raw device data

        Returns:
            DataFrame with extracted features
        """
        df = data.copy()

        # Rolling statistics
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            if col not in ['device_id']:
                # Rolling means and standard deviations
                df[f'{col}_rolling_mean_24h'] = df.groupby('device_id')[col].rolling(
                    window=24, min_periods=1).mean().reset_index(0, drop=True)
                df[f'{col}_rolling_std_24h'] = df.groupby('device_id')[col].rolling(
                    window=24, min_periods=1).std().reset_index(0, drop=True)

                # Rate of change
                df[f'{col}_rate_of_change'] = df.groupby('device_id')[col].diff()

        # Usage patterns
        if 'power_consumption' in df.columns:
            df['daily_consumption'] = df.groupby(['device_id', pd.Grouper(key='timestamp', freq='D')])['power_consumption'].transform('sum')
            df['consumption_trend'] = df.groupby('device_id')['power_consumption'].pct_change()

        # Time-based features
        df['hour'] = pd.to_datetime(df['timestamp']).dt.hour
        df['day_of_week'] = pd.to_datetime(df['timestamp']).dt.dayofweek
        df['month'] = pd.to_datetime(df['timestamp']).dt.month

        return df.fillna(0)

    def predict_maintenance_needs(self, current_data: pd.DataFrame,
                                device_type: str) -> pd.DataFrame:
        """
        Predict maintenance needs for devices

        Args:
            current_data: Current device data
            device_type: Type of device

        Returns:
            DataFrame with maintenance predictions
        """
        if device_type not in self.models:
            logger.warning(f"No trained model for device type: {device_type}")
            return current_data

        model_info = self.models[device_type]
        model = model_info['model']
        features = model_info['features']

        # Extract features
        feature_data = self._extract_failure_features(current_data)

        # Prepare prediction data
        X_pred = feature_data[features] if all(feat in feature_data.columns for feat in features) else feature_data

        # Make predictions
        predictions = model.predict_proba(X_pred)[:, 1]  # Probability of failure

        # Add predictions to data
        result_df = current_data.copy()
        result_df['failure_probability'] = predictions
        result_df['maintenance_priority'] = pd.cut(
            predictions,
            bins=[0, 0.3, 0.7, 1.0],
            labels=['Low', 'Medium', 'High']
        )

        # Calculate recommended maintenance schedule
        result_df['days_to_maintenance'] = np.where(
            predictions > 0.7, 7,  # High risk: 7 days
            np.where(predictions > 0.3, 30, 90)  # Medium: 30 days, Low: 90 days
        )

        logger.info(f"Generated maintenance predictions for {len(result_df)} devices")
        return result_df

class ConversationalAIAssistant:
    """Conversational AI assistant for voice and text interaction"""

    def __init__(self):
        # Lazy load transformers
        pipeline, AutoTokenizer, AutoModelForCausalLM, _ = self._import_conversational_libs()

        self.device_entities = []
        self.location_entities = []
        self.action_entities = [
            'turn on', 'turn off', 'switch on', 'switch off', 'dim', 'brighten',
            'increase', 'decrease', 'set', 'schedule', 'cancel', 'status', 'what is', 'is the'
        ]
        
        self.nlp = None
        self.conversational_pipeline = None
        self.tokenizer = None
        self.model = None

        try:
            # Load a small conversational model
            model_name = "microsoft/DialoGPT-small"
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForCausalLM.from_pretrained(model_name)
            self.conversational_pipeline = pipeline("conversational", model=self.model, tokenizer=self.tokenizer)
            logger.info("Conversational AI model (DialoGPT-small) loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load conversational model: {e}")

        # Fallback to spaCy for basic entity recognition if conversational model fails
        spacy = _get_spacy()
        if spacy:
            try:
                self.nlp = spacy.load("en_core_web_sm")
            except Exception:
                import subprocess
                subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"])
                self.nlp = spacy.load("en_core_web_sm")
        
        logger.info("Conversational AI Assistant initialized.")

    def _import_conversational_libs(self):
        """Lazy import for conversational AI libraries"""
        try:
            from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM
            return pipeline, AutoTokenizer, AutoModelForCausalLM, True
        except ImportError as e:
            logging.warning(f"Transformers library not available: {e}")
            return None, None, None, False

    def update_entities(self, devices: List[str], locations: List[str]):
        """Dynamically update the list of known devices and locations."""
        self.device_entities = list(set([d.lower() for d in devices]))
        self.location_entities = list(set([l.lower() for l in locations]))
        logger.info(f"AI Assistant entities updated. Devices: {len(self.device_entities)}, Locations: {len(self.location_entities)}")

    def _is_action_command(self, text: str) -> bool:
        """Check if the text contains an action keyword."""
        return any(action in text.lower() for action in self.action_entities)

    def _is_greeting(self, text: str) -> bool:
        """Check if the text is a simple greeting."""
        greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening']
        return text.lower().strip() in greetings

    def parse_action_command(self, text: str) -> Dict[str, Any]:
        """Parse a command to extract action, device, and location."""
        text_lower = text.lower()
        
        # More robust entity extraction
        action = next((act for act in self.action_entities if act in text_lower), None)
        device = next((dev for dev in self.device_entities if dev in text_lower), None)
        location = next((loc for loc in self.location_entities if loc in text_lower), None)

        # Handle status queries
        if action in ['status', 'what is', 'is the']:
            action = 'status'

        if not action and ('on' in text_lower or 'off' in text_lower):
             action = 'turn on' if 'on' in text_lower else 'turn off'

        return {
            "type": "action",
            "action": action,
            "device": device,
            "location": location,
            "original_text": text
        }

    def generate_conversational_response(self, text: str, conversation_history: List[Dict[str, str]]) -> str:
        """Generate a response using the conversational model."""
        if not self.conversational_pipeline:
            return "I'm sorry, my conversational abilities are currently offline."

        from transformers.pipelines.conversational import Conversation
        
        # Reconstruct conversation history for the model
        conversation = Conversation()
        for turn in conversation_history:
            conversation.add_user_input(turn['user'])
            if 'assistant' in turn and turn['assistant']:
                 conversation.append_response(turn['assistant'])

        conversation.add_user_input(text)
        result = self.conversational_pipeline(conversation)
        
        # The pipeline might add the new response to the conversation object
        # The last generated response is what we need
        response = result.generated_responses[-1]
        
        return response

    def process_command(self, text: str, conversation_history: List[Dict[str, str]] = []) -> Dict[str, Any]:
        """
        Process a command, deciding whether to treat it as an action or a conversation.
        """
        if self._is_action_command(text) and not self._is_greeting(text):
            # It's likely an action
            parsed_action = self.parse_action_command(text)
            if parsed_action['action'] and parsed_action['device']:
                return parsed_action
        
        # If not a clear action, treat as conversation
        response_text = self.generate_conversational_response(text, conversation_history)
        return {
            "type": "conversation",
            "response": response_text,
            "original_text": text
        }

class ComputerVisionMonitor:
    """Computer vision for device monitoring and defect detection"""

    def __init__(self):
        self.device_models = {}
        self.defect_detector = None
        self.mlflow_manager = get_mlflow_manager()

        # Lazy load transformers components
        self.pipeline, self.AutoTokenizer, self.AutoModelForSequenceClassification, self.AutoModelForObjectDetection, self.AutoImageProcessor = _import_transformers()

        # Initialize YOLO for object detection
        try:
            self.yolo_model = YOLO('yolov8n.pt')  # Load pretrained model
            logger.info("YOLO model loaded for computer vision")
        except Exception as e:
            logger.warning(f"Failed to load YOLO model: {e}. Computer vision features will be limited.")
            self.yolo_model = None

    def detect_devices(self, image_path: str) -> List[Dict[str, Any]]:
        """
        Detect devices in image using computer vision

        Args:
            image_path: Path to image file

        Returns:
            List of detected devices with bounding boxes
        """
        if not self.yolo_model:
            return []

        try:
            results = self.yolo_model(image_path)

            detections = []
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    detection = {
                        'class': result.names[int(box.cls)],
                        'confidence': float(box.conf),
                        'bbox': box.xyxy[0].tolist(),
                        'device_type': self._map_to_device_type(result.names[int(box.cls)])
                    }
                    detections.append(detection)

            logger.info(f"Detected {len(detections)} objects in image")
            return detections

        except Exception as e:
            logger.error(f"Computer vision detection failed: {e}")
            return []

    def _map_to_device_type(self, detected_class: str) -> str:
        """Map detected object class to AutoVolt device type"""
        class_mapping = {
            'light': 'light',
            'fan': 'fan',
            'tv': 'display',
            'monitor': 'display',
            'laptop': 'computer',
            'keyboard': 'computer',
            'chair': 'furniture',
            'table': 'furniture'
        }
        return class_mapping.get(detected_class.lower(), 'unknown')

    def detect_defects(self, image_path: str, device_type: str) -> Dict[str, Any]:
        """
        Detect defects in device images

        Args:
            image_path: Path to device image
            device_type: Type of device being inspected

        Returns:
            Dictionary with defect detection results
        """
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            return {'error': 'Failed to load image'}

        results = {
            'device_type': device_type,
            'timestamp': datetime.now().isoformat(),
            'defects': [],
            'overall_health': 'good'
        }

        # Basic image analysis for defects
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Check for blur (potential focus issues)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        if laplacian_var < 100:  # Threshold for blur detection
            results['defects'].append({
                'type': 'blur',
                'severity': 'medium',
                'description': 'Image appears blurry, may indicate camera issues'
            })

        # Check for unusual brightness patterns
        mean_brightness = np.mean(gray)
        if mean_brightness < 50:  # Too dark
            results['defects'].append({
                'type': 'low_light',
                'severity': 'low',
                'description': 'Image is too dark, may affect monitoring accuracy'
            })

        # Color analysis for device status
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        if device_type == 'light':
            # Check if light appears to be on/off based on brightness
            light_region = hsv[:, :, 2]  # Value channel
            avg_brightness = np.mean(light_region)
            if avg_brightness < 100:
                results['status'] = 'off'
            else:
                results['status'] = 'on'

        # Determine overall health
        if len(results['defects']) > 2:
            results['overall_health'] = 'poor'
        elif len(results['defects']) > 0:
            results['overall_health'] = 'fair'

        logger.info(f"Defect analysis completed for {device_type}: {results['overall_health']}")
        return results

    def monitor_device_status(self, image_path: str, device_id: str) -> Dict[str, Any]:
        """
        Monitor device status using computer vision

        Args:
            image_path: Path to device image
            device_id: Unique device identifier

        Returns:
            Dictionary with device status information
        """
        detections = self.detect_devices(image_path)

        status_info = {
            'device_id': device_id,
            'timestamp': datetime.now().isoformat(),
            'detected_objects': detections,
            'device_present': len(detections) > 0,
            'status': 'unknown'
        }

        # Analyze device status based on detections
        if detections:
            # Check for device-specific indicators
            for detection in detections:
                if detection['device_type'] == 'light':
                    # Additional analysis for lights
                    defect_analysis = self.detect_defects(image_path, 'light')
                    status_info.update(defect_analysis)

        return status_info

# Global instances - lazy loaded
_anomaly_detector = None
_predictive_maintenance = None
_conversational_assistant = None
_vision_monitor = None

def get_ai_components():
    """Get all AI component instances with lazy loading"""
    global _anomaly_detector, _predictive_maintenance, _conversational_assistant, _vision_monitor

    if _anomaly_detector is None:
        _anomaly_detector = AdvancedAnomalyDetector()

    if _predictive_maintenance is None:
        _predictive_maintenance = PredictiveMaintenanceEngine()

    if _conversational_assistant is None:
        _conversational_assistant = ConversationalAIAssistant()

    if _vision_monitor is None:
        _vision_monitor = ComputerVisionMonitor()

    return {
        'anomaly_detector': _anomaly_detector,
        'predictive_maintenance': _predictive_maintenance,
        'conversational_assistant': _conversational_assistant,
        'vision_monitor': _vision_monitor
    }