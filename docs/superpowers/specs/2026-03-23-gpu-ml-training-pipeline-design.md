# GPU-Accelerated ML + Training Pipeline + Multi-Backend Model Serving

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Real model training, MLflow tracking, Triton/ONNX/TF.js serving factory

See full design in conversation — this is the commit anchor.
Spec covers: synthetic data generation, PyTorch training with MLflow,
ONNX export, Triton Inference Server (CPU Docker), ONNX Runtime with
CoreML (Apple Silicon), model serving factory pattern, training UI,
benchmark endpoints.
