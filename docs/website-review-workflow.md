# Website review workflow

How a signed-in reviewer uses the website to analyze an agenda item, review the briefing and adjust the
priority score. Every step below saves to the backend, so the results are still there after a page refresh or
a backend restart.

The briefing is written by the labeled rule-based writer unless a live model is configured (see
`docs/llm-setup.md` once the live provider work is merged). Scoring, source grounding, review and history
work the same way either way.

## Steps

1. **Sign in.** The token is kept in memory only, so a refresh signs the user out. Saved results are still
   shown, because reading them is public. Changing anything needs a sign-in again.
2. **Upload an agenda.** The backend parses it into numbered items.
3. **Source Library.** Add a source, then press **Approve source**. New sources always start unapproved.
4. **Evidence tab.** Press **Attach** to attach an approved source to the open item.
   An item with no approved attached source returns INSUFFICIENT_EVIDENCE instead of a score.
5. **Analyze this item.** The score, category, factor explanations and briefing appear. If the model fails,
   the score is kept and the last good briefing stays on screen with the error message.
6. **Briefing tab.** Add a comment, then **Approve** or **Reject / Flag**. The review is saved under the
   signed-in account name, and the review history lists every decision, newest first.
7. **Priority factors tab.** Move a factor slider, type a reason, then **Save adjustment**. The backend
   recomputes the score and category and saves old and new values, the reason and the account name.
8. **Refresh the page.** The score, briefing, review status, attached sources and both histories come back.

## API calls used

| Action | Call | Needs sign-in |
|---|---|---|
| Restore the latest saved analysis | `GET /api/v1/items/{id}/analysis` | No |
| Load the last good briefing | `GET /api/v1/items/{id}/briefing` | No |
| List attached sources | `GET /api/v1/agenda-items/{id}/sources` | No |
| Attach or detach a source | `POST` or `DELETE /api/v1/agenda-items/{id}/sources/{source_id}` | Yes |
| Review history | `GET /api/v1/briefings/{id}/reviews` | No |
| Save a review | `PATCH /api/v1/briefings/{id}/review` | Yes |
| Adjustment history | `GET /api/v1/items/{id}/priority/adjustments` | No |
| Save an adjustment | `POST /api/v1/items/{id}/priority/adjustments` | Yes |

The website never sends a reviewer name. The backend records the signed-in account.

## Manual check (about 5 minutes)

- [ ] Signed out, press **Analyze this item**: the sign-in dialog opens.
- [ ] Sign in, upload `backend/validation/agendas/exampleville_2026-11-12.txt`: items appear.
- [ ] Approve a source, attach it to an item, analyze: a score appears.
- [ ] Attach nothing to another item and analyze: INSUFFICIENT_EVIDENCE, no score.
- [ ] Approve the briefing: the history shows your username.
- [ ] Adjust a factor with a reason: the score changes and the history shows the reason.
- [ ] Refresh: score, briefing, review status and both histories are still there.
- [ ] Sign out: write buttons ask for sign-in again.
