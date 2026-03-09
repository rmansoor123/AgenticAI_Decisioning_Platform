"""Letta memory service — self-editing memory blocks + archival storage."""

import os
import httpx

LETTA_BASE_URL = os.getenv("LETTA_BASE_URL", "http://localhost:8283")
LETTA_API_KEY = os.getenv("LETTA_API_KEY", "")
TIMEOUT = 10

_agent_cache: dict[str, str] = {}  # maps our agent_id -> Letta agent_id


def _headers() -> dict:
    """Build request headers."""
    h = {"Content-Type": "application/json"}
    if LETTA_API_KEY:
        h["Authorization"] = f"Bearer {LETTA_API_KEY}"
    return h


def _letta_url(path: str) -> str:
    return f"{LETTA_BASE_URL}/v1{path}"


def create_or_get_agent(agent_id: str) -> dict:
    """Create a Letta agent per fraud-detection agent, or return cached ID."""
    if agent_id in _agent_cache:
        return {"agent_id": _agent_cache[agent_id], "cached": True}

    try:
        # Check if agent already exists by listing and matching name
        resp = httpx.get(
            _letta_url("/agents"),
            headers=_headers(),
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            agents = resp.json()
            for a in agents:
                if a.get("name") == f"fraud-{agent_id}":
                    _agent_cache[agent_id] = a["id"]
                    return {"agent_id": a["id"], "cached": False, "existing": True}

        # Create new agent with core memory blocks
        create_payload = {
            "name": f"fraud-{agent_id}",
            "memory": {
                "memory": {
                    "persona": {
                        "value": f"I am {agent_id}, a fraud detection agent. I analyze patterns, assess risks, and make decisions.",
                        "limit": 2000,
                    },
                    "case_context": {
                        "value": "No active case context.",
                        "limit": 2000,
                    },
                }
            },
        }
        resp = httpx.post(
            _letta_url("/agents"),
            json=create_payload,
            headers=_headers(),
            timeout=TIMEOUT,
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            _agent_cache[agent_id] = data["id"]
            return {"agent_id": data["id"], "created": True}
        return {"error": f"HTTP {resp.status_code}", "body": resp.text}
    except Exception as e:
        return {"error": str(e)}


def add_to_archival(agent_id: str, content: str, metadata: dict | None = None) -> dict:
    """Insert into Letta archival memory."""
    agent_info = create_or_get_agent(agent_id)
    letta_id = agent_info.get("agent_id")
    if not letta_id:
        return {"success": False, "reason": agent_info.get("error", "no agent")}

    try:
        payload = {"text": content}
        if metadata:
            payload["text"] = f"{content}\n\nMetadata: {metadata}"

        resp = httpx.post(
            _letta_url(f"/agents/{letta_id}/archival"),
            json=payload,
            headers=_headers(),
            timeout=TIMEOUT,
        )
        if resp.status_code in (200, 201):
            return {"success": True, "data": resp.json()}
        return {"success": False, "reason": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "reason": str(e)}


def search_archival(agent_id: str, query: str, limit: int = 5) -> dict:
    """Search Letta archival memory."""
    agent_info = create_or_get_agent(agent_id)
    letta_id = agent_info.get("agent_id")
    if not letta_id:
        return {"success": False, "results": [], "reason": agent_info.get("error", "no agent")}

    try:
        resp = httpx.get(
            _letta_url(f"/agents/{letta_id}/archival"),
            params={"query": query, "limit": limit},
            headers=_headers(),
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            return {"success": True, "results": resp.json()}
        return {"success": False, "results": [], "reason": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "results": [], "reason": str(e)}


def get_core_memory(agent_id: str) -> dict:
    """Read core memory blocks for a Letta agent."""
    agent_info = create_or_get_agent(agent_id)
    letta_id = agent_info.get("agent_id")
    if not letta_id:
        return {"success": False, "reason": agent_info.get("error", "no agent")}

    try:
        resp = httpx.get(
            _letta_url(f"/agents/{letta_id}/memory"),
            headers=_headers(),
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            return {"success": True, "memory": resp.json()}
        return {"success": False, "reason": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "reason": str(e)}


def update_core_memory(agent_id: str, block: str, content: str) -> dict:
    """Update a core memory block for a Letta agent."""
    agent_info = create_or_get_agent(agent_id)
    letta_id = agent_info.get("agent_id")
    if not letta_id:
        return {"success": False, "reason": agent_info.get("error", "no agent")}

    try:
        resp = httpx.patch(
            _letta_url(f"/agents/{letta_id}/memory"),
            json={block: {"value": content}},
            headers=_headers(),
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            return {"success": True, "memory": resp.json()}
        return {"success": False, "reason": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "reason": str(e)}


def health() -> dict:
    """Check Letta connectivity."""
    try:
        resp = httpx.get(
            f"{LETTA_BASE_URL}/v1/health",
            headers=_headers(),
            timeout=5,
        )
        return {
            "status": "ok" if resp.status_code == 200 else "error",
            "http_status": resp.status_code,
        }
    except Exception as e:
        return {"status": "error", "reason": str(e)}
