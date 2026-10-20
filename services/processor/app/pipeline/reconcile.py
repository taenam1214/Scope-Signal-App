"""Event clustering and change-order register reconciliation.

Clustering merges extracted candidates that refer to the same underlying event
(primarily by explicit reference like RFI-042). Reconciliation compares each
cluster to the supplied register using a deterministic pass (explicit references)
then a conservative text-similarity pass.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.extraction.adapter import REF_RE
from app.pipeline.models import ExtractedCandidate, RegisterEntryIn, RegisterMatchOut

_WORD_RE = re.compile(r"[a-z0-9]+")
_STOP = {
    "the", "and", "for", "with", "that", "this", "potential", "scope", "change",
    "order", "additional", "please", "will", "from", "have", "has", "was", "were",
    "our", "your", "their", "are", "not", "any", "per", "all", "may",
}


def _tokens(*texts: str | None) -> set[str]:
    out: set[str] = set()
    for t in texts:
        if not t:
            continue
        out.update(w for w in _WORD_RE.findall(t.lower()) if len(w) > 2 and w not in _STOP)
    return out


def _norm_ref(ref: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", ref.lower()) if ref else ""


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


@dataclass
class Cluster:
    refs: set[str] = field(default_factory=set)
    candidates: list[ExtractedCandidate] = field(default_factory=list)

    @property
    def title(self) -> str:
        return self.candidates[0].title

    @property
    def description(self) -> str:
        return max((c.description for c in self.candidates), key=len, default="")

    @property
    def change_type(self) -> str | None:
        return self.candidates[0].change_type

    @property
    def event_date(self) -> str | None:
        return next((c.event_date for c in self.candidates if c.event_date), None)

    @property
    def parties(self) -> list[str]:
        seen: list[str] = []
        for c in self.candidates:
            for p in c.parties:
                if p not in seen:
                    seen.append(p)
        return seen

    @property
    def confidence(self) -> float:
        return max((c.confidence for c in self.candidates), default=0.5)

    @property
    def uncertainty(self) -> str:
        return next((c.uncertainty for c in self.candidates if c.uncertainty), "")


def cluster_candidates(candidates: list[ExtractedCandidate]) -> list[Cluster]:
    """Group by explicit reference; candidates with no ref stay as singletons.

    Do not merge unrelated events solely because descriptions look similar.
    """
    clusters: list[Cluster] = []
    by_ref: dict[str, Cluster] = {}

    for cand in candidates:
        refs = {_norm_ref(r) for r in REF_RE.findall(f"{cand.title} {cand.description}")}
        refs.discard("")
        target: Cluster | None = None
        for r in refs:
            if r in by_ref:
                target = by_ref[r]
                break
        if target is None:
            target = Cluster()
            clusters.append(target)
        target.candidates.append(cand)
        target.refs |= refs
        for r in refs:
            by_ref[r] = target

    return clusters


def reconcile_cluster(
    cluster: Cluster, register: list[RegisterEntryIn]
) -> tuple[str, list[RegisterMatchOut]]:
    """Return (reconciliation_status, matches) for a cluster against the register."""
    if not register:
        # Nothing in the supplied register to match against.
        return "no_match_found", []

    # 1) Deterministic: explicit reference match.
    for entry in register:
        entry_refs = {_norm_ref(entry.external_reference)}
        entry_refs |= {_norm_ref(r) for r in REF_RE.findall(f"{entry.title or ''} {entry.description or ''}")}
        entry_refs.discard("")
        if cluster.refs & entry_refs:
            return "matched", [
                RegisterMatchOut(
                    register_entry_id=entry.id,
                    matching_method="explicit_reference",
                    match_score=0.95,
                    explanation=(
                        f"Explicit reference {sorted(cluster.refs & entry_refs)[0]} "
                        f"matches register entry {entry.external_reference or entry.id}."
                    ),
                )
            ]

    # 2) Conservative text similarity -> possible match (never a hard match).
    cluster_tokens = _tokens(cluster.title, cluster.description)
    best: tuple[float, RegisterEntryIn] | None = None
    for entry in register:
        entry_tokens = _tokens(entry.title, entry.description, entry.external_reference)
        score = _jaccard(cluster_tokens, entry_tokens)
        shared = len(cluster_tokens & entry_tokens)
        if score >= 0.2 and shared >= 2 and (best is None or score > best[0]):
            best = (score, entry)

    if best is not None:
        score, entry = best
        return "possible_match", [
            RegisterMatchOut(
                register_entry_id=entry.id,
                matching_method="text_similarity",
                match_score=round(score, 3),
                explanation=(
                    "Similar work description to register entry "
                    f"{entry.external_reference or entry.id}; needs reviewer confirmation."
                ),
            )
        ]

    # 3) Nothing matched in the supplied register.
    return "no_match_found", []
