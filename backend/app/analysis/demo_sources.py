"""FICTIONAL supporting sources that go with council-brief/examples/Sample_City_Council_
Agenda_2026-10-08.txt. They exist only so the AI and Analytics demos have something to
retrieve (FSR SUP-003). Nothing here is an official City record. Every source is labeled "fictional" or "synthetic" in its title only: the
label is kept out of the searchable text so it cannot match the sample agenda's own
footer ("END OF FICTIONAL DEMONSTRATION AGENDA").
"""

from __future__ import annotations

from typing import List

from .models import SourceRecord


def demo_sources() -> List[SourceRecord]:
    return [
        SourceRecord(
            source_id="min-2025-11", title="City Council Minutes, November 13, 2025 (fictional)",
            source_type="minutes", source_date="2025-11-13", approved=True,
            text=(
                "Item 5. Public hearing on a request to rezone 12 acres near University "
                "Drive for a mixed-use development with apartments and ground-floor retail.\n\n"
                "Eight residents spoke. Five residents expressed concern about traffic on University "
                "Drive and noise from student housing. Two business owners spoke in favor. After "
                "discussion the Council approved the rezoning by a vote of 5 to 2 with a condition "
                "requiring a landscaped buffer next to the neighborhood.")),
        SourceRecord(
            source_id="min-2026-02", title="City Council Minutes, February 26, 2026 (fictional)",
            source_type="minutes", source_date="2026-02-26", approved=True,
            text=(
                "Item 9. Discussion of short-term rental complaints.\n\n"
                "Staff reported 41 neighborhood complaints about short-term rentals in the past year, "
                "mostly about noise, parking, and trash. Six residents spoke. Several residents "
                "objected to parties and inspections that came too late. Two property owners "
                "asked the Council not to add costly registration requirements. The Council directed "
                "staff to return with proposed amendments to the short-term rental regulations.")),
        SourceRecord(
            source_id="min-2025-06", title="City Council Minutes, June 12, 2025 (fictional)",
            source_type="minutes", source_date="2025-06-12", approved=True,
            text=(
                "Item 8. Eastside flooding and drainage improvements.\n\n"
                "Residents of the Eastside neighborhood described repeated street flooding and asked "
                "for the project to move faster. Several residents were frustrated by earlier delays. "
                "The Council adopted the drainage project into the capital plan and asked staff to "
                "report cost updates before awarding a construction contract.")),
        SourceRecord(
            source_id="bud-drain", title="Capital Improvement Projects Budget, FY2027 (fictional)",
            source_type="budget", source_date="2026-09-01", approved=True,
            text=(
                "Eastside Drainage Improvement Project: original estimate $9.6 million. "
                "The revised estimate of $12.8 million reflects higher than expected channel "
                "excavation, right-of-way acquisition, and material costs. Funding is from "
                "stormwater utility revenue and certificates of obligation.")),
        SourceRecord(
            source_id="chk-civil", title="Open Checkbook, Brazos Valley Civil Works payments (fictional)",
            source_type="checkbook", source_date="2026-08-31", approved=True,
            text=(
                "Payments to Brazos Valley Civil Works, Public Works, fiscal year 2026: "
                "$620,000 for drainage design and $210,000 for survey work. A change order of "
                "$310,000 was approved in July for additional utility relocation.")),
        SourceRecord(
            source_id="bud-water", title="FY2027 Budget Amendment Staff Summary (fictional)",
            source_type="budget", source_date="2026-09-15", approved=True,
            text=(
                "The proposed budget amendment adds $4.1 million for water system "
                "maintenance. The proposed utility rate adjustment is 6.5 percent, which would raise "
                "the average residential water bill by about $4.20 per month. Staff cite aging "
                "pipes and rising treatment costs.")),
        SourceRecord(
            source_id="disc-parking", title="Downtown business survey comments (synthetic sample)",
            source_type="survey", source_date="2026-09-30", approved=True,
            text=(
                "Several downtown business owners oppose paid parking and worry customers "
                "will shop elsewhere. Some residents also object to parking fees near their homes. "
                "A few respondents support paid parking if it increases turnover. Many ask how the "
                "six-month pilot would be measured.")),
        SourceRecord(
            source_id="disc-str", title="Neighborhood forum posts on short-term rentals (synthetic sample)",
            source_type="public_discussion", source_date="2026-09-22", approved=True,
            text=(
                "Residents are frustrated by noise, parking, and trash at short-term "
                "rentals and ask for stronger enforcement and inspections. Property owners are "
                "concerned about registration costs and occupancy limits.")),
        SourceRecord(
            source_id="news-transit", title="Regional transit plan news summary (synthetic sample)",
            source_type="news", source_date="2026-09-18", approved=True,
            text=(
                "Regional partners are developing a long-range transit and bicycle plan. "
                "Coverage describes early public meetings and general support for safer bicycle "
                "routes. No cost figures have been released.")),
        SourceRecord(
            source_id="bud-fire", title="Capital Plan: Fire and Rescue Equipment (fictional)",
            source_type="budget", source_date="2025-09-01", approved=True,
            text=(
                "The adopted capital plan includes $2.4 million for replacement fire and "
                "rescue equipment, including emergency-response vehicles, funded from the "
                "general capital fund.")),
        SourceRecord(
            source_id="min-draft-unapproved", title="DRAFT minutes, September 24, 2026 (not yet approved)",
            source_type="minutes", source_date="2026-09-24", approved=False,
            text=(
                "Draft only. Residents objected strongly to downtown paid parking and "
                "asked the Council to cancel the pilot.")),
    ]
