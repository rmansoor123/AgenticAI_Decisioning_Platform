"""BrainTrust experiment tracking service."""

import os
import uuid
from datetime import datetime, timezone

_braintrust_client = None
_api_key = os.getenv("BRAINTRUST_API_KEY", "")


def _get_client():
    """Lazy-init BrainTrust client."""
    global _braintrust_client
    if _braintrust_client is not None:
        return _braintrust_client
    if not _api_key:
        return None
    try:
        import braintrust

        _braintrust_client = braintrust
        return _braintrust_client
    except ImportError:
        return None


def log_evaluation(
    project: str,
    experiment: str,
    input_data: dict,
    output: str,
    scores: dict[str, float],
    metadata: dict | None = None,
) -> dict:
    """Log a single evaluation to BrainTrust."""
    bt = _get_client()
    if bt is None:
        return {"logged": False, "reason": "braintrust not configured"}

    try:
        exp = bt.init(project=project, experiment=experiment, api_key=_api_key)
        exp.log(
            input=input_data,
            output=output,
            scores=scores,
            metadata=metadata or {},
        )
        exp.flush()
        return {"logged": True, "project": project, "experiment": experiment}
    except Exception as e:
        return {"logged": False, "reason": str(e)}


def create_dataset(project: str, name: str, records: list[dict]) -> dict:
    """Create or update a BrainTrust dataset."""
    bt = _get_client()
    if bt is None:
        return {"created": False, "reason": "braintrust not configured"}

    try:
        dataset = bt.init_dataset(project=project, name=name, api_key=_api_key)
        for record in records:
            dataset.insert(
                input=record.get("input", {}),
                expected=record.get("expected", ""),
                metadata=record.get("metadata", {}),
            )
        dataset.flush()
        return {"created": True, "project": project, "name": name, "count": len(records)}
    except Exception as e:
        return {"created": False, "reason": str(e)}


def list_experiments(project: str) -> dict:
    """List experiments in a BrainTrust project."""
    if not _api_key:
        return {"success": False, "experiments": [], "reason": "braintrust not configured"}

    try:
        import httpx

        resp = httpx.get(
            "https://api.braintrust.dev/v1/experiment",
            params={"project_name": project},
            headers={"Authorization": f"Bearer {_api_key}"},
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            experiments = data.get("objects", data) if isinstance(data, dict) else data
            return {"success": True, "experiments": experiments}
        return {"success": False, "experiments": [], "reason": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "experiments": [], "reason": str(e)}


def get_experiment_results(experiment_id: str) -> dict:
    """Fetch results for a specific experiment."""
    if not _api_key:
        return {"success": False, "results": [], "reason": "braintrust not configured"}

    try:
        import httpx

        resp = httpx.get(
            f"https://api.braintrust.dev/v1/experiment/{experiment_id}/fetch",
            headers={"Authorization": f"Bearer {_api_key}"},
            timeout=10,
        )
        if resp.status_code == 200:
            return {"success": True, "results": resp.json()}
        return {"success": False, "results": [], "reason": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "results": [], "reason": str(e)}


def health() -> dict:
    """Check BrainTrust connectivity."""
    if not _api_key:
        return {"status": "unconfigured", "reason": "BRAINTRUST_API_KEY not set"}

    try:
        import httpx

        resp = httpx.get(
            "https://api.braintrust.dev/v1/project",
            headers={"Authorization": f"Bearer {_api_key}"},
            timeout=5,
        )
        return {
            "status": "ok" if resp.status_code == 200 else "error",
            "http_status": resp.status_code,
        }
    except Exception as e:
        return {"status": "error", "reason": str(e)}
