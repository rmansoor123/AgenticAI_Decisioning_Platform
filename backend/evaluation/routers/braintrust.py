"""BrainTrust router — experiment tracking and dataset management."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/experiments", tags=["experiments"])


class LogRequest(BaseModel):
    project: str = "fraud-detection"
    experiment: str
    input_data: dict
    output: str
    scores: dict[str, float]
    metadata: dict = {}


class DatasetRequest(BaseModel):
    project: str = "fraud-detection"
    name: str
    records: list[dict]


@router.post("/log")
async def log_experiment(req: LogRequest):
    """Log an evaluation to BrainTrust."""
    from services.braintrust_service import log_evaluation

    result = log_evaluation(
        project=req.project,
        experiment=req.experiment,
        input_data=req.input_data,
        output=req.output,
        scores=req.scores,
        metadata=req.metadata,
    )
    return {"success": result.get("logged", False), "data": result}


@router.post("/datasets")
async def create_dataset(req: DatasetRequest):
    """Create a BrainTrust dataset."""
    from services.braintrust_service import create_dataset as bt_create_dataset

    result = bt_create_dataset(
        project=req.project,
        name=req.name,
        records=req.records,
    )
    return {"success": result.get("created", False), "data": result}


@router.get("/list/{project}")
async def list_project_experiments(project: str):
    """List experiments for a BrainTrust project."""
    from services.braintrust_service import list_experiments

    return list_experiments(project)


@router.get("/results/{experiment_id}")
async def get_results(experiment_id: str):
    """Get results for a specific experiment."""
    from services.braintrust_service import get_experiment_results

    return get_experiment_results(experiment_id)


@router.get("/health")
async def experiments_health():
    """Check BrainTrust connectivity."""
    from services.braintrust_service import health

    return health()
