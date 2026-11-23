"""Agenda parsing validation (FSR ING-004, PER-002).

The FSR requires at least 90% precision and recall over 10 agendas. Each agenda
is a text, markdown or PDF file in validation/agendas/ with a matching
<name>.expected.json holding the item numbers and titles a person read from the
agenda. This script runs Nick's parser on every file and compares the result
with the saved key.

Run from backend/:

    python3 -m validation.validate_parsing
    python3 -m validation.validate_parsing --json     # machine-readable

Exit code 0 only when at least 10 agendas were evaluated and both precision and
recall are 90% or higher. See validation/README.md for how to add agendas.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from app.analysis.evaluation import parser_precision_recall, _norm_item
from app.services.agenda_parser import AgendaParserError, extract_text, parse_agenda_items

HERE = Path(__file__).resolve().parent
AGENDA_DIR = HERE / "agendas"
REQUIRED_AGENDAS = 10
REQUIRED_RATE = 0.90


def evaluate_agenda(expected_path: Path) -> Dict[str, Any]:
    spec = json.loads(expected_path.read_text(encoding="utf-8"))
    agenda_path = (expected_path.parent / spec["file"]).resolve()
    expected = [(i["item_number"], i["title"]) for i in spec["items"]]
    parse_error = None
    try:
        text = extract_text(agenda_path.name, agenda_path.read_bytes())
        parsed = parse_agenda_items(text, agenda_id="validation")
    except AgendaParserError as error:
        # A rejected agenda contributes every expected item as a miss; it must
        # not abort the run or be silently omitted from the denominator.
        parsed = []
        parse_error = str(error)
    extracted = [(i.item_number, i.title) for i in parsed]
    scores = parser_precision_recall(expected, extracted)

    expected_keys = {_norm_item(*e) for e in expected}
    extracted_keys = {_norm_item(*e) for e in extracted}
    return {
        "agenda": expected_path.name.replace(".expected.json", ""),
        "labeled_by": spec.get("labeled_by", ""),
        "parse_error": parse_error,
        **scores,
        "missed": sorted(" ".join(k) for k in expected_keys - extracted_keys),
        "extra": sorted(" ".join(k) for k in extracted_keys - expected_keys),
    }


def evaluate_all(directory: Path = AGENDA_DIR) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = [
        evaluate_agenda(path) for path in sorted(directory.glob("*.expected.json"))
    ]
    tp = sum(r["true_positives"] for r in rows)
    expected = sum(r["expected"] for r in rows)
    extracted = sum(r["extracted"] for r in rows)
    precision = tp / extracted if extracted else 0.0
    recall = tp / expected if expected else 0.0
    meets_rate = precision >= REQUIRED_RATE and recall >= REQUIRED_RATE
    enough = len(rows) >= REQUIRED_AGENDAS
    if not rows:
        status = "Open"
    elif enough and meets_rate:
        status = "Passed"
    else:
        status = "Partial"
    return {
        "agendas_evaluated": len(rows),
        "agendas_required": REQUIRED_AGENDAS,
        "items_expected": expected,
        "items_extracted": extracted,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "meets_rate": meets_rate,
        "enough_agendas": enough,
        "status": status,
        "agendas": rows,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="print JSON instead of a table")
    args = ap.parse_args()
    result = evaluate_all()

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"{'Agenda':<34} {'Expected':>8} {'Parsed':>7} {'Precision':>10} {'Recall':>7}")
        for r in result["agendas"]:
            print(f"{r['agenda']:<34} {r['expected']:>8} {r['extracted']:>7} "
                  f"{r['precision']:>10.0%} {r['recall']:>7.0%}")
            if r["parse_error"]:
                print(f"    parser error: {r['parse_error']}")
            for m in r["missed"]:
                print(f"    missed: {m}")
            for e in r["extra"]:
                print(f"    extra:  {e}")
        print(f"\nOverall: precision {result['precision']:.1%}, recall {result['recall']:.1%} "
              f"(requirement: {REQUIRED_RATE:.0%} or higher)")
        print(f"Agendas evaluated: {result['agendas_evaluated']} of {result['agendas_required']} required")
        print(f"Status: {result['status']}"
              + ("" if result["enough_agendas"]
                 else "  (add more agendas: see validation/README.md)"))

    return 0 if result["status"] == "Passed" else 1


if __name__ == "__main__":
    sys.exit(main())
