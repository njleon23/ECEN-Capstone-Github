"""The analysis models must stay compatible with the backend's own models.

If someone renames a field or adds a review status in backend/app/models.py, these tests
fail and tell us to update backend/app/analysis/models.py in the same pull request.
"""

import dataclasses
import typing

import pytest

from app.analysis.models import PRIORITY_CATEGORIES, REVIEW_STATUSES, AgendaItem
from app.models import AgendaItem as BackendAgendaItem


def test_field_names_match_backend_agenda_item():
    ours = [f.name for f in dataclasses.fields(AgendaItem)]
    theirs = list(BackendAgendaItem.model_fields)
    assert ours == theirs


def test_review_statuses_match_backend():
    backend_statuses = typing.get_args(BackendAgendaItem.model_fields["review_status"].annotation)
    assert set(REVIEW_STATUSES) == set(backend_statuses) == {"needs_review", "confirmed"}


def test_default_review_status_is_needs_review():
    item = AgendaItem(item_id="i1", agenda_id="a1", item_number="4.4", title="t", source_text="s")
    assert item.review_status == "needs_review"


def test_backend_item_converts_without_translation():
    backend = BackendAgendaItem(item_id="i1", agenda_id="a1", item_number="4.4", title="t",
                                source_text="s", order=3, review_status="confirmed")
    ours = AgendaItem(**backend.model_dump())
    assert ours.review_status == "confirmed" and ours.order == 3


def test_unknown_review_status_is_rejected():
    with pytest.raises(ValueError):
        AgendaItem(item_id="i", agenda_id="a", item_number="1", title="t", source_text="s",
                   review_status="draft")


def test_category_labels_are_capitalized_for_the_frontend():
    assert PRIORITY_CATEGORIES == ("Low", "Moderate", "High")
