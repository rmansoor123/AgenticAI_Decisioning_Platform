"""
Onboarding Risk Model Training Pipeline
Trains a PyTorch neural network, logs to MLflow, exports to ONNX + TF.js formats.
"""
import os
import json
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score, confusion_matrix
import mlflow
import mlflow.pytorch
import onnx

# ─── Model Architecture ─────────────────────────────────────────────

class OnboardingRiskModel(nn.Module):
    """25 → 128 → 64 → 32 → 1 (sigmoid) with dropout and L2 regularization."""

    def __init__(self, input_size=25):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_size, 128),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Dropout(0.15),
            nn.Linear(32, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.network(x)

# ─── Training ────────────────────────────────────────────────────────

def train_model(
    train_path='data/train.csv',
    test_path='data/test.csv',
    epochs=50,
    batch_size=256,
    learning_rate=0.001,
    weight_decay=0.01,
    experiment_name='onboarding-risk-model'
):
    """Train model, log to MLflow, export to ONNX."""

    base_dir = os.path.dirname(__file__)
    train_path = os.path.join(base_dir, train_path)
    test_path = os.path.join(base_dir, test_path)

    # Load data
    print("Loading data...")
    train_df = pd.read_csv(train_path)
    test_df = pd.read_csv(test_path)

    feature_cols = [c for c in train_df.columns if c != 'is_fraud']

    X_train = torch.tensor(train_df[feature_cols].values, dtype=torch.float32)
    y_train = torch.tensor(train_df['is_fraud'].values, dtype=torch.float32).unsqueeze(1)
    X_test = torch.tensor(test_df[feature_cols].values, dtype=torch.float32)
    y_test = torch.tensor(test_df['is_fraud'].values, dtype=torch.float32).unsqueeze(1)

    train_loader = DataLoader(TensorDataset(X_train, y_train), batch_size=batch_size, shuffle=True)

    # Setup MLflow
    tracking_uri = os.environ.get('MLFLOW_TRACKING_URI', 'http://localhost:5001')
    try:
        mlflow.set_tracking_uri(tracking_uri)
        mlflow.set_experiment(experiment_name)
        print(f"MLflow tracking: {tracking_uri}")
    except Exception as e:
        print(f"MLflow not available ({e}), logging locally")
        mlflow.set_tracking_uri('file://' + os.path.join(base_dir, 'mlruns'))
        mlflow.set_experiment(experiment_name)

    with mlflow.start_run(run_name=f"train-{pd.Timestamp.now().strftime('%Y%m%d-%H%M%S')}"):
        # Log parameters
        mlflow.log_params({
            'architecture': '25-128-64-32-1',
            'activation': 'relu',
            'output_activation': 'sigmoid',
            'dropout': '0.3/0.2/0.15',
            'epochs': epochs,
            'batch_size': batch_size,
            'learning_rate': learning_rate,
            'weight_decay': weight_decay,
            'train_samples': len(train_df),
            'test_samples': len(test_df),
            'fraud_rate': float(train_df['is_fraud'].mean()),
            'features': len(feature_cols)
        })

        # Train
        model = OnboardingRiskModel(input_size=len(feature_cols))
        criterion = nn.BCELoss()
        optimizer = optim.Adam(model.parameters(), lr=learning_rate, weight_decay=weight_decay)
        scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

        print(f"Training for {epochs} epochs...")
        best_auc = 0
        best_model_state = None

        for epoch in range(epochs):
            model.train()
            total_loss = 0

            for X_batch, y_batch in train_loader:
                optimizer.zero_grad()
                output = model(X_batch)
                loss = criterion(output, y_batch)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()

            avg_loss = total_loss / len(train_loader)

            # Evaluate every 5 epochs
            if (epoch + 1) % 5 == 0 or epoch == epochs - 1:
                model.eval()
                with torch.no_grad():
                    y_pred = model(X_test).numpy()
                    y_true = y_test.numpy()

                    auc = roc_auc_score(y_true, y_pred)
                    precision = precision_score(y_true, (y_pred > 0.5).astype(int), zero_division=0)
                    recall = recall_score(y_true, (y_pred > 0.5).astype(int), zero_division=0)
                    f1 = f1_score(y_true, (y_pred > 0.5).astype(int), zero_division=0)

                scheduler.step(avg_loss)

                mlflow.log_metrics({
                    'loss': avg_loss,
                    'auc': auc,
                    'precision': precision,
                    'recall': recall,
                    'f1': f1,
                    'learning_rate': optimizer.param_groups[0]['lr']
                }, step=epoch)

                print(f"  Epoch {epoch+1}/{epochs} — loss: {avg_loss:.4f}, AUC: {auc:.4f}, F1: {f1:.4f}")

                if auc > best_auc:
                    best_auc = auc
                    best_model_state = model.state_dict().copy()

        # Load best model
        if best_model_state:
            model.load_state_dict(best_model_state)

        # Final evaluation
        model.eval()
        with torch.no_grad():
            y_pred = model(X_test).numpy()
            y_true = y_test.numpy()
            y_pred_binary = (y_pred > 0.5).astype(int)

            final_metrics = {
                'final_auc': roc_auc_score(y_true, y_pred),
                'final_precision': precision_score(y_true, y_pred_binary, zero_division=0),
                'final_recall': recall_score(y_true, y_pred_binary, zero_division=0),
                'final_f1': f1_score(y_true, y_pred_binary, zero_division=0)
            }

            cm = confusion_matrix(y_true, y_pred_binary)
            final_metrics['true_negatives'] = int(cm[0][0])
            final_metrics['false_positives'] = int(cm[0][1])
            final_metrics['false_negatives'] = int(cm[1][0])
            final_metrics['true_positives'] = int(cm[1][1])

        mlflow.log_metrics(final_metrics)
        print(f"\nFinal — AUC: {final_metrics['final_auc']:.4f}, Precision: {final_metrics['final_precision']:.4f}, Recall: {final_metrics['final_recall']:.4f}, F1: {final_metrics['final_f1']:.4f}")
        print(f"Confusion Matrix: TP={final_metrics['true_positives']}, FP={final_metrics['false_positives']}, FN={final_metrics['false_negatives']}, TN={final_metrics['true_negatives']}")

        # ─── Export Models ───────────────────────────────────────

        output_dir = os.path.join(base_dir, 'trained-models')
        os.makedirs(output_dir, exist_ok=True)

        # 1. PyTorch
        torch_path = os.path.join(output_dir, 'onboarding-risk-v2.pt')
        torch.save(model.state_dict(), torch_path)
        mlflow.log_artifact(torch_path)
        print(f"PyTorch model saved: {torch_path}")

        # 2. ONNX
        onnx_path = os.path.join(output_dir, 'onboarding-risk-v2.onnx')
        dummy_input = torch.randn(1, len(feature_cols))
        torch.onnx.export(
            model, dummy_input, onnx_path,
            input_names=['features'],
            output_names=['risk_score'],
            dynamic_axes={'features': {0: 'batch_size'}, 'risk_score': {0: 'batch_size'}},
            opset_version=17
        )
        onnx_model = onnx.load(onnx_path)
        onnx.checker.check_model(onnx_model)
        mlflow.log_artifact(onnx_path)
        print(f"ONNX model saved and verified: {onnx_path}")

        # 3. Copy ONNX to Triton model repository
        triton_dir = os.path.join(base_dir, 'model-repository', 'onboarding-risk-v1', '1')
        os.makedirs(triton_dir, exist_ok=True)
        import shutil
        shutil.copy2(onnx_path, os.path.join(triton_dir, 'model.onnx'))
        print(f"ONNX model copied to Triton repository")

        # 4. Log model to MLflow registry
        mlflow.pytorch.log_model(model, 'model')

        # Save training report
        report = {
            'model_version': '2.0.0',
            'architecture': '25→128→64→32→1 (sigmoid)',
            'framework': 'PyTorch',
            'trained_at': pd.Timestamp.now().isoformat(),
            'metrics': final_metrics,
            'parameters': {
                'epochs': epochs, 'batch_size': batch_size,
                'learning_rate': learning_rate, 'weight_decay': weight_decay
            },
            'exports': ['pytorch (.pt)', 'onnx (.onnx)', 'triton (model-repository)'],
            'training_data': {
                'train_samples': len(train_df),
                'test_samples': len(test_df),
                'fraud_rate': float(train_df['is_fraud'].mean())
            }
        }

        report_path = os.path.join(output_dir, 'training-report.json')
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        mlflow.log_artifact(report_path)
        print(f"\nTraining report: {report_path}")

        return final_metrics

if __name__ == '__main__':
    train_model()
