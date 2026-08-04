"""Graph assembly.

    ingest → extract → categorize → verify → write → critique ─┐
                                                 ▲              │
                                                 └── retry ─────┘ (max 2)
                                                                │ approved
                                                                ▼
                                                             persist

The critique node loops back to `write` when it finds unsupported claims, up to
MAX_CONTENT_RETRIES. Everything is checkpointed so a run can be paused for the
human-in-the-loop approval gate (draft → published happens outside the graph).
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .nodes import (
    MAX_CONTENT_RETRIES,
    categorize_node,
    critique_content_node,
    extract_facts_node,
    ingest_node,
    persist_node,
    verify_facts_node,
    write_content_node,
)
from .state import EnrichmentState


def _after_ingest(state: EnrichmentState) -> str:
    return "failed" if state.get("status") == "failed" else "extract"


def _after_critique(state: EnrichmentState) -> str:
    """Loop back to writer while the current critique still flags claims."""
    if state.get("content_flags") and state.get("retries", 0) <= MAX_CONTENT_RETRIES:
        return "write"
    return "persist"


def build_graph():
    g = StateGraph(EnrichmentState)

    g.add_node("ingest", ingest_node)
    g.add_node("extract", extract_facts_node)
    g.add_node("categorize", categorize_node)
    g.add_node("verify", verify_facts_node)
    g.add_node("write", write_content_node)
    g.add_node("critique", critique_content_node)
    g.add_node("persist", persist_node)

    g.add_edge(START, "ingest")
    g.add_conditional_edges("ingest", _after_ingest, {"extract": "extract", "failed": END})
    g.add_edge("extract", "categorize")
    g.add_edge("categorize", "verify")
    g.add_edge("verify", "write")
    g.add_edge("write", "critique")
    g.add_conditional_edges("critique", _after_critique, {"write": "write", "persist": "persist"})
    g.add_edge("persist", END)

    return g.compile()
