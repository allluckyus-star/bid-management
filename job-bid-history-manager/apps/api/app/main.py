from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import analytics, capture, dev, jobs, resumes, tags


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(capture.router)
app.include_router(jobs.router)
app.include_router(tags.router)
app.include_router(resumes.router)
app.include_router(analytics.router)
app.include_router(dev.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "mock_extraction": settings.use_mock_extraction,
        "ollama_url": settings.ollama_base_url,
        "ollama_model": settings.ollama_model,
        "port": settings.port,
    }
