# Council Brief

Council Brief is AICorps Team 3's prototype for an AI-assisted City Council meeting-preparation system. It is intended to help authorized City staff review meeting agendas, organize supporting public sources, identify items requiring additional preparation, and eventually produce source-grounded briefing material.

The system is currently developed under documented assumptions because final City requirements and data access have not yet been confirmed.

## Current Capabilities

The current integrated prototype includes:

- A React and Vite web dashboard
- A FastAPI REST backend
- Local frontend-to-backend integration
- Searchable PDF, TXT, and Markdown agenda uploads
- Automatic extraction of numbered agenda items
- PostgreSQL persistence for agendas, agenda items, and source records
- SQLAlchemy ORM models and repositories
- Alembic database schema migrations
- Separate Docker-based development and test databases
- Agenda listing and individual agenda retrieval
- Supporting-source registration and retrieval
- Structured API error responses
- Backend health-status reporting
- An AI provider and data-model foundation
- Automated backend tests against PostgreSQL
- Interactive FastAPI documentation

## System Architecture

The current prototype uses the following data flow:

```text
React Dashboard
      |
      | HTTP / JSON and multipart uploads
      v
FastAPI REST API
      |
      +-- Agenda Parser
      +-- Agenda Repository
      +-- Source Repository
      +-- AI Provider Foundation
      |
      | SQLAlchemy
      v
PostgreSQL Database
```

The browser communicates only with the FastAPI backend. Database credentials, future LLM credentials, and external-service credentials remain server-side.

## Repository Structure

```text
ECEN-Capstone-Github/
├── backend/             FastAPI backend, repositories, migrations, and tests
├── council-brief/       React and Vite frontend
├── .github/             GitHub Actions and Pages deployment
├── compose.yaml         Local PostgreSQL development and test services
├── .env.example         Local environment-variable template
└── README.md
```

## Requirements

### Frontend

- Node.js 22.13 or later
- npm
- pnpm 11.25.0, invoked directly or through `npx`

### Backend and Database

- Python 3.12 or later
- Python virtual environment support
- Docker with Docker Compose
- PostgreSQL is supplied locally through `compose.yaml`

## Initial Setup

From the repository root, create the local environment file:

```bash
cp .env.example .env
```

The included values are for local development only. Do not commit `.env` or reuse its credentials in production.

Start the development and test databases:

```bash
docker compose up -d db test-db
docker compose ps
```

Create the backend virtual environment and install dependencies:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Apply the database migrations:

```bash
alembic upgrade head
alembic current
```

The development database is available locally on port `5432`. The isolated test database is available on port `5433`.

## Running the Application

### Unified startup

With the backend virtual environment active:

```bash
cd council-brief
npx --yes pnpm@11.25.0 install
npx --yes pnpm@11.25.0 dev:all
```

This starts:

- React at `http://localhost:5173`
- FastAPI at `http://127.0.0.1:8000`
- Interactive API documentation at `http://127.0.0.1:8000/docs`

Stop both development servers with `Ctrl+C`.

### Separate startup

To run the backend separately:

```bash
cd backend
source .venv/bin/activate
python -m uvicorn app.main:app --reload
```

In a second terminal, run the frontend:

```bash
cd council-brief
npx --yes pnpm@11.25.0 install
npx --yes pnpm@11.25.0 dev
```

The frontend defaults to `http://localhost:8000/api/v1`. A different backend address can be supplied with the `VITE_API_BASE_URL` environment variable.

Create a production frontend build with:

```bash
cd council-brief
npx --yes pnpm@11.25.0 build
```

## Current API Endpoints

```text
GET  /api/v1/health
POST /api/v1/agendas
GET  /api/v1/agendas
GET  /api/v1/agendas/{agenda_id}
POST /api/v1/sources
GET  /api/v1/sources
```

The agenda-upload endpoint accepts searchable PDF, TXT, and Markdown files up to 25 MB.

## Database Storage

Agenda metadata, parsed agenda items, and source records are stored in PostgreSQL.

The local development connection is configured with `DATABASE_URL`. The automated tests use `TEST_DATABASE_URL`. Both values are loaded from the repository-level `.env` file during local development.

SQLAlchemy provides the application persistence layer. Alembic owns the database schema and must be used for schema changes:

```bash
cd backend
alembic upgrade head
alembic check
```

Local PostgreSQL data is stored in Docker named volumes. Removing a container does not remove its named volume, but running `docker compose down --volumes` permanently deletes the local database volumes.

Inspect development records with:

```bash
docker compose exec db psql -U council_brief -d council_brief
```

Useful PostgreSQL commands include:

```sql
\dt
SELECT COUNT(*) FROM agendas;
SELECT COUNT(*) FROM agenda_items;
SELECT COUNT(*) FROM sources;
\q
```

For a production deployment, the same backend can connect to a City-managed or cloud-hosted PostgreSQL service by providing a secured production `DATABASE_URL` and applying the Alembic migrations.

## Running Backend Tests

Ensure both PostgreSQL services are healthy:

```bash
docker compose up -d db test-db
docker compose ps
```

Then run:

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

The test configuration requires a database name containing `test` and automatically redirects application persistence to the dedicated test database. This prevents the suite from deleting or modifying development records.

The current automated tests cover:

- API health reporting
- Agenda upload and parsing
- Agenda listing and individual retrieval
- PostgreSQL agenda and agenda-item persistence
- Source creation and listing
- Source-type validation
- Unsupported agenda-file rejection
- AI provider and model-foundation behavior

## Current Demonstration Workflow

The current integrated demonstration supports the following sequence:

1. Start the PostgreSQL development database.
2. Apply all Alembic migrations.
3. Start the FastAPI backend and React frontend.
4. Upload a searchable agenda file.
5. Parse the agenda into numbered items.
6. Store the agenda and extracted items in PostgreSQL.
7. Retrieve and display persisted agenda items in the dashboard.
8. Register a supporting-source record.
9. Retrieve and display the source in the Source Library.
10. Restart the application and verify that the records remain available.

## Current Limitations

The following capabilities are still under development:

- Meetings are not yet separated in the frontend; items from all stored agendas are currently combined.
- Source records are not yet persistently attached to individual agenda items.
- Original supporting-source files are not yet preserved by the backend.
- Passage-level retrieval and citation generation are not yet integrated into the current MVP.
- The AI analysis foundation is not yet connected to a live REST analysis endpoint.
- Source-grounded briefing generation is not yet implemented end-to-end in the integrated application.
- The documented 0-to-10 preparation-priority score is not yet returned through the integrated backend API.
- Review, approval, revision history, and feedback are not yet persisted.
- Authentication and role-based authorization are not yet implemented.
- The FastAPI backend and PostgreSQL database currently run in local development environments.
- Live City data connectors and social-media ingestion are not part of the current baseline.

## Git Workflow

Development changes should not be committed directly to `main`.

The team uses the following workflow:

```text
Feature branch
      |
      v
integration/mvp
      |
      v
main
```

Create feature branches from the latest `integration/mvp` branch:

```bash
git switch integration/mvp
git pull --ff-only origin integration/mvp
git switch -c feature/short-description
```

After implementation and testing, push the branch and open a pull request targeting `integration/mvp`. The integration branch is merged into `main` after the combined system is tested.

## GitHub Pages

GitHub Pages hosts only the static React frontend. It cannot run FastAPI or PostgreSQL.

Full functionality currently requires running the frontend, backend, and database locally. A deployed backend and production PostgreSQL connection will be required before the hosted frontend can provide the complete workflow.

## Security

Database, LLM, and external-service credentials must remain on the backend. Secrets must never be stored in React source code, committed to Git, or sent directly from the browser to an external provider.

Only public or explicitly team-approved test records should be used until the City authorizes additional data. A production deployment will also require authentication, authorization, encrypted connections, backups, and a City-approved data-retention policy.

## Human Review Requirement

All generated analysis and briefing material must remain in draft form until reviewed by an authorized person. Council Brief is intended to support meeting preparation and does not make policy decisions, voting recommendations, or automatically publish official communications.
