# Agenda parsing validation (FSR ING-004, PER-002)

The FSR asks for at least 90% precision and recall over **10 representative
agendas**. This directory now provides ten fictional TXT/Markdown cases, with
plain numbering, nested items, alternate separators and Markdown headings.
These are controlled regression fixtures, not evidence of accuracy on City
agendas or PDF layouts. Review the answer keys and evaluate actual searchable
City agendas before claiming representative coverage. Manual item correction
(ING-006) is a separate demonstration criterion.

## Run it

From `backend/`:

    python3 -m validation.validate_parsing

It prints one row per agenda, any missed or extra items, the overall precision
and recall, and a status: **Passed** (10 or more agendas and both rates 90% or
higher), **Partial** (fewer than 10 agendas, or a rate below 90%), or **Open**
(no agendas).

## Add an agenda

1. Put the agenda in `validation/agendas/` as `.txt`, `.md` or `.pdf`. Use
   real City agendas if the City office can share them, or fictional ones with
   different layouts and numbering (for example `Item 4.`, `4)`, or
   `ITEM 4`).
2. Create `<same name>.expected.json` next to it. **Write the item list by
   reading the agenda yourself, not by copying the parser's output**, or the
   test proves nothing.

        {
          "file": "my_agenda.txt",
          "labeled_by": "Your Name",
          "note": "where the agenda came from",
          "items": [
            {"item_number": "1", "title": "Call to Order"},
            {"item_number": "2.1", "title": "Approval of Minutes"}
          ]
        }

3. Run the command again.

Scoring: an item counts as correct when its number and title both match
(case and extra spaces ignored). Precision is correct items divided by items the
parser found; recall is correct items divided by items you listed. A rejected
agenda is reported and all of its labeled items count as misses.

The saved files here are fictional demonstration agendas. Their item lists were
written from the agenda text, not from parser output, but a team member should
read each list once and confirm it before it is quoted as validation evidence.
