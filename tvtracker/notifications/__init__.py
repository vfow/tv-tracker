"""Notification domain policy."""

from __future__ import annotations

from typing import Any

from . import engine as _engine


_original_collect_metadata_notification_candidates = (
    _engine.collect_metadata_notification_candidates
)


def _collect_metadata_notification_candidates_without_ended(
    *args: Any,
    **kwargs: Any,
) -> list[dict[str, Any]]:
    """Keep cancellation alerts, but suppress low-value TMDB `Ended` status alerts."""
    candidates = _original_collect_metadata_notification_candidates(*args, **kwargs)
    return [
        candidate
        for candidate in candidates
        if str(candidate.get("kind") or "").strip().lower() != "ended"
    ]


_collect_metadata_notification_candidates_without_ended.__tvtracker_ended_suppressed__ = True

if not getattr(
    _engine.collect_metadata_notification_candidates,
    "__tvtracker_ended_suppressed__",
    False,
):
    _engine.collect_metadata_notification_candidates = (
        _collect_metadata_notification_candidates_without_ended
    )
