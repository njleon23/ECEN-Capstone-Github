# Authentication foundation (backend)

This is a demonstration foundation, not production security approval.

## Accounts and sessions

Apply migrations, then create an account from a trusted backend terminal:

```bash
cd backend
alembic upgrade head
python -m app.create_user --username nick --display-name "Nick Leon" --role admin
```

The command prompts privately for the password. Never put passwords in CLI
arguments, commit them, or screenshot login responses with real tokens.
Accounts exist in the database selected by DATABASE_URL: a local account does
not automatically exist in Render. There is no public registration endpoint.

* Passwords are salted Argon2id hashes, with a 15–128 character creation policy.
* POST /api/v1/auth/login returns an opaque Bearer token with a one-hour absolute
  expiration. PostgreSQL stores only its SHA-256 hash.
* GET /api/v1/auth/me checks expiration, revocation, current role, and active status.
* POST /api/v1/auth/logout revokes the token. It is safe to repeat logout.
* Login has independent per-username and per-client limits. Counters are bounded,
  thread-safe, in memory, and per process; they reset on restart. These settings
  are not a replacement for shared production limits and trusted proxy setup.
* Login validation responses omit the submitted input, avoiding password echoes.

## Permission boundary

Reviewer and admin accounts may upload agendas, create sources, change source
approval, attach/detach sources, start analyses, ask follow-up questions, review
briefings, and adjust factors. Every existing non-auth POST/PATCH/DELETE action
requires authentication. Admin-only checks are available for future account
management; there is currently no public account-management API.

GET endpoints, including lists, briefings, histories, health, and docs, remain
public for the fictional-data demonstration. Authentication here does NOT provide
confidentiality, per-meeting ownership, or restricted access to City documents.
Do not upload confidential data or treat CORS as access control.

New sources always start unapproved, even if the request says approved=true.
Use the separately protected approval endpoint. Agenda uploader, briefing reviewer,
and adjustment reviewer are taken from the session's account username. Optional
legacy reviewer fields are deprecated and ignored. History stores username
snapshots; immutable account-ID audit links and approval audit records remain
future work. Retain/disable accounts instead of casually deleting them.

## Frontend coordination — deployment gate

Do not deploy these guards until the website can log in and attach
`Authorization: Bearer <access_token>` to protected requests. Otherwise existing
uploads, source approval, analysis, and review buttons will return 401.
Handle 401 with a sign-in prompt, 403 with a permission message, and 429 using
Retry-After. Never place credentials in VITE variables or commit a shared token.
For initial UI integration keep tokens in memory, not URLs or localStorage.
Persistent browser sign-in needs a separate cookie/CSRF or equivalent design.

Create the intended accounts in the hosted database through a trusted workflow;
do not add default passwords or automatic admin creation to server startup.
Verify HTTPS, trusted proxy/client addresses, and account ownership before rollout.

## Authenticated demos

```bash
python -m demos.demo_05_end_to_end --username nick
python -m validation.collect_evidence --username nick
python -m validation.collect_evidence --check-persisted
```

The two write demos prompt privately for the password; their session tokens are
not written to evidence files. Remote credential submission requires HTTPS.
The read-only restart check remains public in this demonstration configuration.

## Remaining security work

Frontend sign-in, centralized/distributed login limits, request-size limits,
additional analysis/cost limits, account recovery/password changes, explicit
account administration, stronger password checks/MFA or City SSO, private-data
authorization, durable audit IDs, operational logging, backups, and a formal
security review are not claimed complete by the passing regression suite.
