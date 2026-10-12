# Council Brief

Council Brief is AICorps Team 3's prototype for an AI-assisted City Council meeting-preparation system. The system is intended to help authorized City staff review meeting agendas, identify items requiring additional preparation, examine supporting sources, and create source-grounded briefing material.

## Current Capabilities

The project currently includes:

- A React and Vite frontend prototype
- A FastAPI backend
- Searchable PDF, TXT, and Markdown agenda uploads
- Automatic extraction of numbered agenda items
- SQLite persistence for agendas and agenda items
- Agenda retrieval through a REST API
- Structured error responses for invalid files
- Automated backend tests
- Interactive API documentation

The frontend is not yet connected to the FastAPI backend. AI briefing generation, source retrieval, authentication, and live City data connectors are also still under development.

## Repository Structure

```text
ECEN-Capstone-Github/
├── backend/             FastAPI backend and automated tests
├── council-brief/       React and Vite frontend
├── .github/             GitHub Actions configuration
└── README.md
```

## Frontend Setup

Install Node.js 22.13 or later and pnpm.

From the repository root:

```bash
cd council-brief
pnpm install
pnpm dev
```

Open the local address displayed by Vite, normally:

```text
http://localhost:5173
```

To create and preview a production build:

```bash
pnpm build
pnpm preview
```

## Backend Setup

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Start the FastAPI development server:

```bash
python -m uvicorn app.main:app --reload
```

The backend will be available at:

```text
http://127.0.0.1:8000
```

Interactive API documentation is available at:

```text
http://127.0.0.1:8000/docs
```

## Current API Endpoints

```text
GET  /api/v1/health
POST /api/v1/agendas
GET  /api/v1/agendas/{agenda_id}
```

The agenda-upload endpoint accepts searchable PDF, TXT, and Markdown files up to 25 MB.

## Database Storage

Agenda metadata and parsed agenda items are stored in SQLite.

The default development database is:

```text
backend/data/council_brief.db
```

The database location can be changed with the `COUNCIL_BRIEF_DB_PATH` environment variable.

Database files are excluded from Git and should not be committed.

## Run the Backend Tests

From the `backend` directory with the virtual environment activated:

```bash
python -m pytest -q
```

The current tests verify:

- API health
- Agenda upload and parsing
- SQLite agenda persistence
- Agenda retrieval
- Rejection of unsupported file types

## Current Limitations

- The frontend and backend are not yet connected.
- Scanned or image-only PDFs require OCR before upload.
- Supporting-source upload and retrieval are not yet implemented.
- AI-generated briefings and follow-up questions are not yet implemented.
- Authentication and authorization are not yet implemented.
- The backend currently runs only in the local development environment.
- The application does not yet connect to live City data sources.

## Security

LLM or external-service API keys must remain on the backend. Secrets must never be stored in the React source code, committed to Git, or sent directly from the browser to an external AI provider.

## Human Review Requirement

All generated analysis and briefing material must remain in draft form until reviewed by an authorized person. The system is intended to support City staff preparation and does not make policy decisions or voting recommendations.