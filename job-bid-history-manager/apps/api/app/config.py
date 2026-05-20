from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="JBHM_")

    app_name: str = "Job Bid History Manager API"
    host: str = "127.0.0.1"
    port: int = 5123
    database_path: Path = Path(__file__).resolve().parent.parent / "data" / "jbhm.db"
    storage_dir: Path = Path(__file__).resolve().parent.parent / "data" / "storage"
    max_resume_bytes: int = 10 * 1024 * 1024
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2"
    use_mock_extraction: bool = False
    cors_origins: list[str] = [
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "chrome-extension://*",
    ]


settings = Settings()
