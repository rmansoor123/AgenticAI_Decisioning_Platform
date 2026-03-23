"""
Synthetic Fraud Dataset Generator
Generates realistic labeled data for training the onboarding risk model.
"""
import pandas as pd
import numpy as np
import os
import json
from datetime import datetime

FEATURE_NAMES = [
    'businessAgeDays', 'businessAgeLog', 'countryRiskScore', 'categoryRiskScore',
    'identityVerificationScore', 'documentAuthenticityScore', 'emailRiskScore',
    'phoneRiskScore', 'addressVerificationScore', 'bankVerificationScore',
    'taxIdVerificationScore', 'watchlistMatchScore', 'velocityScore',
    'deviceTrustScore', 'ipReputationScore', 'duplicateDetectionScore',
    'businessRegistrationScore', 'revenueEstimate', 'employeeCount',
    'webPresenceScore', 'socialMediaScore', 'industryFraudRate',
    'geographicAnomalyScore', 'historicalFraudFlags', 'networkRiskScore'
]

def generate_dataset(n_samples=10000, fraud_rate=0.15, seed=42):
    """Generate synthetic seller data with realistic fraud patterns."""
    np.random.seed(seed)

    data = {}
    labels = np.zeros(n_samples)

    # Generate base features (normalized 0-1)
    data['businessAgeDays'] = np.random.beta(2, 5, n_samples)  # Skewed toward newer
    data['businessAgeLog'] = np.log1p(data['businessAgeDays'] * 3650) / np.log1p(3650)
    data['countryRiskScore'] = np.random.beta(2, 8, n_samples)  # Most are low risk
    data['categoryRiskScore'] = np.random.beta(2, 8, n_samples)
    data['identityVerificationScore'] = np.random.beta(5, 2, n_samples)  # Most pass
    data['documentAuthenticityScore'] = np.random.beta(5, 2, n_samples)
    data['emailRiskScore'] = np.random.beta(2, 8, n_samples)
    data['phoneRiskScore'] = np.random.beta(2, 8, n_samples)
    data['addressVerificationScore'] = np.random.beta(5, 2, n_samples)
    data['bankVerificationScore'] = np.random.beta(5, 2, n_samples)
    data['taxIdVerificationScore'] = np.random.beta(5, 2, n_samples)
    data['watchlistMatchScore'] = np.random.beta(1, 20, n_samples)  # Very rare matches
    data['velocityScore'] = np.random.beta(2, 8, n_samples)
    data['deviceTrustScore'] = np.random.beta(5, 3, n_samples)
    data['ipReputationScore'] = np.random.beta(2, 5, n_samples)
    data['duplicateDetectionScore'] = np.random.beta(1, 15, n_samples)
    data['businessRegistrationScore'] = np.random.beta(5, 2, n_samples)
    data['revenueEstimate'] = np.random.beta(2, 5, n_samples)
    data['employeeCount'] = np.random.beta(2, 8, n_samples)
    data['webPresenceScore'] = np.random.beta(3, 3, n_samples)
    data['socialMediaScore'] = np.random.beta(3, 4, n_samples)
    data['industryFraudRate'] = np.random.beta(2, 10, n_samples)
    data['geographicAnomalyScore'] = np.random.beta(1, 10, n_samples)
    data['historicalFraudFlags'] = np.random.beta(1, 15, n_samples)
    data['networkRiskScore'] = np.random.beta(1, 10, n_samples)

    # Create fraud patterns (realistic rules)
    n_fraud = int(n_samples * fraud_rate)
    fraud_indices = np.random.choice(n_samples, n_fraud, replace=False)

    for idx in fraud_indices:
        labels[idx] = 1
        pattern = np.random.choice(['synthetic_id', 'high_risk_geo', 'velocity_abuse', 'network_fraud', 'document_fraud'])

        if pattern == 'synthetic_id':
            data['identityVerificationScore'][idx] = np.random.uniform(0.1, 0.4)
            data['documentAuthenticityScore'][idx] = np.random.uniform(0.1, 0.3)
            data['emailRiskScore'][idx] = np.random.uniform(0.6, 0.9)
            data['businessAgeDays'][idx] = np.random.uniform(0, 0.05)

        elif pattern == 'high_risk_geo':
            data['countryRiskScore'][idx] = np.random.uniform(0.7, 1.0)
            data['geographicAnomalyScore'][idx] = np.random.uniform(0.5, 0.9)
            data['ipReputationScore'][idx] = np.random.uniform(0.5, 0.8)

        elif pattern == 'velocity_abuse':
            data['velocityScore'][idx] = np.random.uniform(0.7, 1.0)
            data['duplicateDetectionScore'][idx] = np.random.uniform(0.4, 0.8)
            data['deviceTrustScore'][idx] = np.random.uniform(0.1, 0.4)

        elif pattern == 'network_fraud':
            data['networkRiskScore'][idx] = np.random.uniform(0.6, 1.0)
            data['historicalFraudFlags'][idx] = np.random.uniform(0.3, 0.8)
            data['watchlistMatchScore'][idx] = np.random.uniform(0.3, 0.7)

        elif pattern == 'document_fraud':
            data['documentAuthenticityScore'][idx] = np.random.uniform(0.05, 0.25)
            data['businessRegistrationScore'][idx] = np.random.uniform(0.1, 0.3)
            data['taxIdVerificationScore'][idx] = np.random.uniform(0.1, 0.3)

    df = pd.DataFrame(data)
    df['is_fraud'] = labels.astype(int)

    return df

def main():
    output_dir = os.path.join(os.path.dirname(__file__), 'data')
    os.makedirs(output_dir, exist_ok=True)

    # Generate train and test sets
    print("Generating training data (8000 samples)...")
    train_df = generate_dataset(n_samples=8000, seed=42)

    print("Generating test data (2000 samples)...")
    test_df = generate_dataset(n_samples=2000, seed=123)

    train_path = os.path.join(output_dir, 'train.csv')
    test_path = os.path.join(output_dir, 'test.csv')

    train_df.to_csv(train_path, index=False)
    test_df.to_csv(test_path, index=False)

    # Stats
    print(f"\nTraining set: {len(train_df)} samples, {train_df['is_fraud'].sum():.0f} fraud ({train_df['is_fraud'].mean()*100:.1f}%)")
    print(f"Test set: {len(test_df)} samples, {test_df['is_fraud'].sum():.0f} fraud ({test_df['is_fraud'].mean()*100:.1f}%)")
    print(f"\nSaved to {train_path} and {test_path}")

    # Save metadata
    metadata = {
        'generated_at': datetime.now().isoformat(),
        'features': FEATURE_NAMES,
        'feature_count': len(FEATURE_NAMES),
        'train_samples': len(train_df),
        'test_samples': len(test_df),
        'fraud_rate': float(train_df['is_fraud'].mean()),
        'fraud_patterns': ['synthetic_id', 'high_risk_geo', 'velocity_abuse', 'network_fraud', 'document_fraud']
    }
    with open(os.path.join(output_dir, 'metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2)

    print("Metadata saved to data/metadata.json")

if __name__ == '__main__':
    main()
