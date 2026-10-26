"""FICTIONAL sample agenda and source set for demos and regression tests (FSR SUP-003).

Every name, amount, date, and quotation below is invented. None of it is real City
of College Station data. Replace with real public records as the City approves them.
"""

from __future__ import annotations

from typing import List

from .models import AgendaItem, SourceRecord

AGENDA_ID = "agenda-2026-10-fictional"


def sample_items() -> List[AgendaItem]:
    return [
        AgendaItem(
            item_id="item-2", agenda_id=AGENDA_ID, item_number="2",
            title="Approval of the prior meeting minutes",
            source_text="Consider approval of the minutes of the previous regular meeting.",
            order=2),
        AgendaItem(
            item_id="item-4", agenda_id=AGENDA_ID, item_number="4",
            title="Main Street redevelopment construction contract",
            source_text=(
                "Presentation, possible action, and discussion on awarding a construction "
                "contract for the Main Street redevelopment project to Lone Star Civil LLC "
                "in the amount of $8.5 million, including streetscape, utilities, and "
                "downtown traffic management during construction."),
            order=4),
        AgendaItem(
            item_id="item-7", agenda_id=AGENDA_ID, item_number="7",
            title="Zoning change request from Brazos Ridge Development",
            source_text=(
                "Public hearing and possible action on a request by Brazos Ridge Development "
                "to rezone 6.2 acres on Elm Road from agricultural to planned development "
                "district for a mixed-use project."),
            order=7),
        AgendaItem(
            item_id="item-9", agenda_id=AGENDA_ID, item_number="9",
            title="Parks recreation fee schedule update",
            source_text=("Consider an update to the Parks and Recreation fee schedule "
                         "for youth athletic leagues and pool admission."),
            order=9),
    ]


def sample_sources() -> List[SourceRecord]:
    return [
        SourceRecord(
            source_id="min-2024-03", title="City Council Minutes, March 12, 2024",
            source_type="minutes", source_date="2024-03-12", approved=True,
            text=(
                "Item 6. Public hearing on a request by Brazos Ridge Development to rezone "
                "4.1 acres on Wellborn Road for a planned development district.\n\n"
                "Three residents spoke. Two residents expressed concern about noise from "
                "the proposed commercial uses and asked that the noise ordinance be applied. "
                "One resident spoke in favor. After discussion the Council approved the "
                "rezoning by a vote of 6 to 1 with a condition on hours of operation.")),
        SourceRecord(
            source_id="min-2023-09", title="City Council Minutes, September 26, 2023",
            source_type="minutes", source_date="2023-09-26", approved=True,
            text=(
                "Item 11. Downtown streetscape improvements, phase one.\n\n"
                "Twelve residents and business owners spoke. Many objected to the expected "
                "traffic delays and loss of downtown parking during construction. Several "
                "complained that notice to businesses had been inadequate. The Council "
                "postponed the item two weeks and directed staff to return with a traffic "
                "management plan for downtown construction.")),
        SourceRecord(
            source_id="chk-lsc", title="Open Checkbook, Lone Star Civil LLC payments",
            source_type="checkbook", source_date="2026-08-31", approved=True,
            text=(
                "Payments to Lone Star Civil LLC, Public Works, fiscal year 2026: $412,300 "
                "for utility design, $186,000 for survey work, and $1,250,000 for Phase 1 "
                "construction. A change order of $240,000 was approved in June for "
                "additional utility relocation.")),
        SourceRecord(
            source_id="bud-cip", title="Capital Improvement Projects Budget, FY2026",
            source_type="budget", source_date="2025-09-01", approved=True,
            text=(
                "Main Street redevelopment: original estimate $6.8 million. A revised "
                "estimate of $8.5 million reflects higher than expected utility relocation "
                "and downtown traffic management costs. Funding is from certificates of "
                "obligation and utility fund transfers.")),
        SourceRecord(
            source_id="disc-1", title="Neighborhood forum discussion (synthetic sample)",
            source_type="public_discussion", source_date="2026-09-20", approved=True,
            text=(
                "Residents are frustrated about the cost of the Main Street redevelopment "
                "and ask why the estimate went up. Several posts raise concern about downtown "
                "traffic and parking during construction and whether small businesses will "
                "survive the disruption.")),
        SourceRecord(
            source_id="disc-2", title="Community survey comments (synthetic sample)",
            source_type="survey", source_date="2026-09-28", approved=True,
            text=(
                "Survey respondents oppose long road closures downtown and want a clear "
                "construction schedule. Respondents also asked how the contractor for the "
                "Main Street redevelopment was selected and why costs increased.")),
        SourceRecord(
            source_id="bud-parks", title="Parks Fee History, FY2022 to FY2026",
            source_type="budget", source_date="2025-09-01", approved=True,
            text=(
                "Youth athletic league fees were $45 per player in FY2025 and $48 in FY2026. "
                "Pool admission was $4 for residents. Fees are reviewed annually and adjusted "
                "for inflation.")),
        SourceRecord(
            source_id="min-draft-unapproved", title="Draft minutes, not yet approved",
            source_type="minutes", source_date="2026-10-01", approved=False,
            text=(
                "Zoning change request from Brazos Ridge Development drew strong opposition "
                "from neighbors. This source is deliberately NOT approved and must never "
                "appear in analysis.")),
    ]
