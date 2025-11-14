"""
Advanced MLflow Model Management System for AutoVolt
Implements model versioning, A/B testing, and performance monitoring
"""

import os
import mlflow
import mlflow.sklearn
# Lazy import heavy ML frameworks
_mlflow_pytorch = None
_mlflow_tensorflow = None

def _get_mlflow_pytorch():
    global _mlflow_pytorch
    if _mlflow_pytorch is None:
        import mlflow.pytorch
        _mlflow_pytorch = mlflow.pytorch
    return _mlflow_pytorch

def _get_mlflow_tensorflow():
    global _mlflow_tensorflow
    if _mlflow_tensorflow is None:
        import mlflow.tensorflow
        _mlflow_tensorflow = mlflow.tensorflow
    return _mlflow_tensorflow

from mlflow.tracking import MlflowClient
from mlflow.entities.model_registry import ModelVersion
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import json
import logging
from pathlib import Path
import joblib
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
# Lazy import heavy frameworks
_torch = None
_tensorflow = None

def _get_torch():
    global _torch
    if _torch is None:
        import torch
        _torch = torch
    return _torch

def _get_tensorflow():
    global _tensorflow
    if _tensorflow is None:
        import tensorflow as tf
        _tensorflow = tf
    return _tensorflow

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AutoVoltMLflowManager:
    """Advanced MLflow manager for AutoVolt AI/ML service"""

    def __init__(self, tracking_uri: str = "sqlite:///mlflow.db", experiment_name: str = "AutoVolt_AI"):
        """
        Initialize MLflow manager

        Args:
            tracking_uri: MLflow tracking server URI
            experiment_name: Name of the MLflow experiment
        """
        self.tracking_uri = tracking_uri
        self.experiment_name = experiment_name

        # Set MLflow tracking URI
        mlflow.set_tracking_uri(tracking_uri)

        # Create or get experiment
        try:
            self.experiment_id = mlflow.create_experiment(experiment_name)
            logger.info(f"Created new experiment: {experiment_name}")
        except mlflow.exceptions.MlflowException:
            self.experiment_id = mlflow.get_experiment_by_name(experiment_name).experiment_id
            logger.info(f"Using existing experiment: {experiment_name}")

        # Initialize MLflow client
        self.client = MlflowClient(tracking_uri)

        # Model registry setup
        self.model_name = "AutoVolt_Predictive_Models"

        # Create model registry if it doesn't exist
        try:
            self.client.get_registered_model(self.model_name)
        except mlflow.exceptions.MlflowException:
            self.client.create_registered_model(self.model_name)

        # A/B testing configuration
        self.ab_test_configs = {}

        logger.info("MLflow manager initialized successfully")

    def start_run(self, run_name: str, tags: Dict[str, Any] = None) -> str:
        """
        Start a new MLflow run

        Args:
            run_name: Name for the run
            tags: Additional tags for the run

        Returns:
            Run ID
        """
        mlflow.start_run(experiment_id=self.experiment_id, run_name=run_name)

        # Add default tags
        mlflow.set_tag("model_type", "predictive")
        mlflow.set_tag("service", "autovolt_ai")
        mlflow.set_tag("created_at", datetime.now().isoformat())

        if tags:
            for key, value in tags.items():
                mlflow.set_tag(key, str(value))

        run_id = mlflow.active_run().info.run_id
        logger.info(f"Started MLflow run: {run_id}")
        return run_id

    def log_model_metrics(self, metrics: Dict[str, float], step: int = None):
        """
        Log model performance metrics

        Args:
            metrics: Dictionary of metric names and values
            step: Step number for logging
        """
        for metric_name, value in metrics.items():
            mlflow.log_metric(metric_name, value, step=step)

    def log_model_params(self, params: Dict[str, Any]):
        """
        Log model parameters

        Args:
            params: Dictionary of parameter names and values
        """
        for param_name, value in params.items():
            mlflow.log_param(param_name, str(value))

    def log_model(self, model: Any, model_type: str = "sklearn", artifact_path: str = "model"):
        """
        Log model to MLflow

        Args:
            model: Trained model object
            model_type: Type of model (sklearn, pytorch, tensorflow)
            artifact_path: Path to store model artifacts
        """
        if model_type == "sklearn":
            mlflow.sklearn.log_model(model, artifact_path)
        elif model_type == "pytorch":
            _get_mlflow_pytorch().log_model(model, artifact_path)
        elif model_type == "tensorflow":
            _get_mlflow_tensorflow().log_model(model, artifact_path)
        else:
            # Generic model logging
            mlflow.log_artifact(str(model), artifact_path)

        logger.info(f"Logged {model_type} model to MLflow")

    def register_model(self, run_id: str, model_name: str = None) -> ModelVersion:
        """
        Register model in MLflow Model Registry

        Args:
            run_id: MLflow run ID
            model_name: Name for the registered model

        Returns:
            ModelVersion object
        """
        if model_name is None:
            model_name = self.model_name

        model_uri = f"runs:/{run_id}/model"
        model_version = mlflow.register_model(model_uri, model_name)

        logger.info(f"Registered model version: {model_version.version}")
        return model_version

    def transition_model_stage(self, model_name: str, version: str, stage: str):
        """
        Transition model to different stage (None, Staging, Production, Archived)

        Args:
            model_name: Name of the registered model
            version: Model version
            stage: Target stage
        """
        self.client.transition_model_version_stage(
            name=model_name,
            version=version,
            stage=stage
        )
        logger.info(f"Transitioned model {model_name} v{version} to {stage}")

    def compare_models(self, run_ids: List[str]) -> pd.DataFrame:
        """
        Compare multiple model runs

        Args:
            run_ids: List of MLflow run IDs to compare

        Returns:
            DataFrame with comparison results
        """
        runs_data = []

        for run_id in run_ids:
            run = self.client.get_run(run_id)
            run_data = {
                'run_id': run_id,
                'run_name': run.data.tags.get('mlflow.runName', 'Unknown'),
                'start_time': datetime.fromtimestamp(run.info.start_time / 1000),
                'status': run.info.status,
                'metrics': run.data.metrics,
                'params': run.data.params
            }
            runs_data.append(run_data)

        return pd.DataFrame(runs_data)

    def setup_ab_testing(self, experiment_name: str, variants: Dict[str, str]) -> str:
        """
        Set up A/B testing configuration

        Args:
            experiment_name: Name of the A/B test
            variants: Dictionary mapping variant names to model versions

        Returns:
            Experiment ID
        """
        experiment_id = f"ab_test_{experiment_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        self.ab_test_configs[experiment_id] = {
            'experiment_name': experiment_name,
            'variants': variants,
            'created_at': datetime.now(),
            'traffic_distribution': {variant: 1/len(variants) for variant in variants.keys()},
            'metrics': {}
        }

        logger.info(f"Set up A/B testing experiment: {experiment_id}")
        return experiment_id

    def get_model_for_inference(self, model_name: str = None, stage: str = "Production") -> Any:
        """
        Get model for inference from Model Registry

        Args:
            model_name: Name of the registered model
            stage: Model stage (Production, Staging, etc.)

        Returns:
            Loaded model object
        """
        if model_name is None:
            model_name = self.model_name

        try:
            model_version = self.client.get_latest_versions(model_name, stages=[stage])[0]
            model_uri = f"models:/{model_name}/{model_version.version}"
            model = mlflow.sklearn.load_model(model_uri)
            logger.info(f"Loaded model {model_name} v{model_version.version} from {stage}")
            return model
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return None

    def log_prediction_metrics(self, predictions: np.ndarray, actuals: np.ndarray,
                             model_name: str, run_id: str = None):
        """
        Log prediction performance metrics

        Args:
            predictions: Model predictions
            actuals: Actual values
            model_name: Name of the model
            run_id: MLflow run ID (optional)
        """
        mse = mean_squared_error(actuals, predictions)
        mae = mean_absolute_error(actuals, predictions)
        r2 = r2_score(actuals, predictions)

        metrics = {
            'mse': mse,
            'mae': mae,
            'r2_score': r2,
            'rmse': np.sqrt(mse)
        }

        if run_id:
            # Log to specific run
            with mlflow.start_run(run_id=run_id):
                self.log_model_metrics(metrics)
        else:
            # Log to current run
            self.log_model_metrics(metrics)

        logger.info(f"Logged prediction metrics for {model_name}: MSE={mse:.4f}, R²={r2:.4f}")

    def monitor_model_drift(self, reference_data: pd.DataFrame, current_data: pd.DataFrame,
                          model_name: str) -> Dict[str, float]:
        """
        Monitor model drift using reference vs current data

        Args:
            reference_data: Reference dataset
            current_data: Current production data
            model_name: Name of the model being monitored

        Returns:
            Dictionary with drift metrics
        """
        from scipy.stats import ks_2samp

        drift_metrics = {}

        # Compare distributions for numerical columns
        numerical_cols = reference_data.select_dtypes(include=[np.number]).columns

        for col in numerical_cols:
            if col in current_data.columns:
                stat, p_value = ks_2samp(reference_data[col], current_data[col])
                drift_metrics[f"{col}_drift_stat"] = stat
                drift_metrics[f"{col}_drift_p_value"] = p_value

        # Log drift metrics
        with mlflow.start_run(experiment_id=self.experiment_id,
                            run_name=f"drift_monitoring_{model_name}_{datetime.now().strftime('%Y%m%d')}"):
            mlflow.set_tag("monitoring_type", "drift_detection")
            mlflow.set_tag("model_name", model_name)
            self.log_model_metrics(drift_metrics)

        logger.info(f"Model drift monitoring completed for {model_name}")
        return drift_metrics

    def create_model_card(self, model_name: str, version: str, metadata: Dict[str, Any]):
        """
        Create a model card with comprehensive model documentation

        Args:
            model_name: Name of the registered model
            version: Model version
            metadata: Model metadata and documentation
        """
        model_card = {
            "model_name": model_name,
            "version": version,
            "created_at": datetime.now().isoformat(),
            "metadata": metadata,
            "performance_metrics": {},
            "intended_use": "",
            "limitations": "",
            "ethical_considerations": "",
            "data_sources": [],
            "training_details": {}
        }

        # Save model card as artifact
        with mlflow.start_run(experiment_id=self.experiment_id,
                            run_name=f"model_card_{model_name}_v{version}"):
            mlflow.set_tag("model_card", "true")
            mlflow.log_dict(model_card, "model_card.json")

        logger.info(f"Created model card for {model_name} v{version}")

    def end_run(self):
        """End the current MLflow run"""
        mlflow.end_run()
        logger.info("Ended MLflow run")

# Global MLflow manager instance - lazy loaded
_mlflow_manager = None

def get_mlflow_manager() -> AutoVoltMLflowManager:
    """Get the global MLflow manager instance with lazy loading"""
    global _mlflow_manager
    if _mlflow_manager is None:
        _mlflow_manager = AutoVoltMLflowManager()
    return _mlflow_manager