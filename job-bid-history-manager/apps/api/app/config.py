from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_API_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="JBHM_",
        env_file=(
            _API_ROOT / ".env",
            _API_ROOT.parent.parent / ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Job Bid History Manager API"
    host: str = "127.0.0.1"
    port: int = 5123
    database_path: Path = _API_ROOT / "data" / "jbhm.db"
    storage_dir: Path = _API_ROOT / "data" / "storage"
    max_resume_bytes: int = 10 * 1024 * 1024
    # Groq (OpenAI-compatible) — tried first when API key is set
    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.3-70b-versatile"
    # Local Ollama — fallback when Groq fails or no key
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
