"""The parsing validation harness (FSR ING-004, PER-002)."""

import json

from validation.validate_parsing import evaluate_agenda, evaluate_all, AGENDA_DIR


def test_saved_agendas_match_their_hand_written_keys():
    result = evaluate_all()

    assert result["agendas_evaluated"] >= 2
    assert result["precision"] == 1.0
    assert result["recall"] == 1.0
    for row in result["agendas"]:
        assert row["missed"] == []
        assert row["extra"] == []


def test_status_is_partial_until_ten_agendas_are_saved():
    result = evaluate_all()

    if result["agendas_evaluated"] < result["agendas_required"]:
        assert result["status"] == "Partial"
        assert result["enough_agendas"] is False
    else:
        assert result["status"] == "Passed"


def test_harness_reports_a_missed_and_an_extra_item(tmp_path):
    agenda = tmp_path / "agenda.txt"
    agenda.write_text("1. Call to Order\n\n2. Adjourn\n", encoding="utf-8")
    key = tmp_path / "agenda.expected.json"
    key.write_text(
        json.dumps({
            "file": "agenda.txt",
            "items": [
                {"item_number": "1", "title": "Call to Order"},
                {"item_number": "2", "title": "Approval of Minutes"},
                {"item_number": "3", "title": "Budget"},
            ],
        }),
        encoding="utf-8",
    )

    row = evaluate_agenda(key)

    assert row["true_positives"] == 1
    assert row["recall"] < 0.5
    assert row["precision"] == 0.5
    assert "3 budget" in row["missed"]
    assert "2 adjourn" in row["extra"]


def test_every_saved_agenda_has_a_key_file():
    agendas = {p.stem for p in AGENDA_DIR.glob("*.txt")}
    keys = {p.name.replace(".expected.json", "") for p in AGENDA_DIR.glob("*.expected.json")}

    assert agendas <= keys
