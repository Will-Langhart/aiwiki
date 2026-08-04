"""Graph state and fact models.

The anti-fabrication core lives here: every extracted fact is an *envelope*
carrying the value **plus the verbatim source quote that supports it** and a
confidence. A field with no `evidence` is treated as unknown (null) downstream —
the writer never sees it, so it cannot be woven into prose. This is the
structural guarantee the single-shot extractor could not give us.
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional, TypedDict

from pydantic import BaseModel, Field

# Category slugs must match public.categories.slug — validated in the categorize
# node against the live table, but we constrain the enum here too for a fast path.
CATEGORY_SLUGS = [
    "chat-assistants", "coding", "image-generation", "video", "audio-music",
    "search-research", "writing", "presentations-docs", "design",
    "data-analytics", "automation", "infrastructure", "voice", "marketing-sales",
    "vector-databases", "mlops-training", "agent-frameworks", "ai-observability",
    "productivity", "customer-support", "education", "no-code",
    "security", "legal", "hr-recruiting", "finance", "healthcare",
]

PricingTier = Literal["free", "freemium", "paid", "enterprise"]
AudienceFit = Literal["technical", "non_technical", "both"]
TrafficTier = Literal["small", "medium", "large", "xlarge"]


# --- Evidence envelopes -----------------------------------------------------
# One per primitive type. Anthropic structured output handles nested objects
# cleanly, so these keep the schema explicit and self-documenting.

class StrFact(BaseModel):
    value: Optional[str] = None
    evidence: Optional[str] = Field(
        None, description="Verbatim quote from the source that supports this value. Null if the source does not state it."
    )
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class IntFact(BaseModel):
    value: Optional[int] = None
    evidence: Optional[str] = Field(None, description="Verbatim supporting quote, or null.")
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class NumFact(BaseModel):
    value: Optional[float] = None
    evidence: Optional[str] = Field(None, description="Verbatim supporting quote, or null.")
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class BoolFact(BaseModel):
    value: Optional[bool] = None
    evidence: Optional[str] = Field(None, description="Verbatim supporting quote, or null.")
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class StrListFact(BaseModel):
    value: list[str] = Field(default_factory=list)
    evidence: Optional[str] = Field(None, description="Verbatim supporting quote, or null.")
    confidence: float = Field(0.0, ge=0.0, le=1.0)


class ExtractedFacts(BaseModel):
    """Structured facts destined for the `tools` row. Extraction only — no prose."""

    name: StrFact
    tagline: StrFact
    pricing_tier: StrFact  # one of PricingTier; validated later
    has_free_tier: BoolFact
    pricing_starts_at: NumFact
    pricing_detail: StrFact
    audience_fit: StrFact  # one of AudienceFit
    model_provider: StrFact
    open_source: BoolFact
    self_hostable: BoolFact
    api_available: BoolFact
    github_stars: IntFact
    integrations: StrListFact
    traffic_tier: StrFact  # one of TrafficTier or null
    founded_year: IntFact
    hq_country: StrFact
    hq_city: StrFact
    key_strengths: StrListFact


class GeneratedContent(BaseModel):
    """The 6 dual-audience prose blocks → content_blocks rows."""

    overview_technical: str
    overview_general: str
    docs_technical: str
    docs_general: str
    use_cases_technical: str
    use_cases_general: str


class Source(TypedDict):
    origin_url: str
    kind: Literal["homepage", "pricing", "github", "search"]
    text: str


def _merge_flags(a: list[str], b: list[str]) -> list[str]:
    return [*a, *b]


class EnrichmentState(TypedDict, total=False):
    """LangGraph state threaded through every node."""

    job_id: str
    url: str
    dry_run: bool  # skip the DB write in persist (used by shadow-diff)
    raw_sources: list[Source]

    facts: ExtractedFacts
    category_slug: str
    content: GeneratedContent

    # critic output
    flags: Annotated[list[str], _merge_flags]  # accumulating audit log → job row
    content_flags: list[str]  # overwrite semantics: the CURRENT critique verdict only
    confidence: float
    retries: int

    # terminal
    tool_id: Optional[str]
    status: Literal["needs_review", "failed"]
    error: Optional[str]
