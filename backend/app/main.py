from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.agendas import router as agendas_router

app = FastAPI(
    title="Council Brief API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agendas_router)


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Council Brief API",
    }
    