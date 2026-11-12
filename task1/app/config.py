import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Application configuration settings loaded strictly from environment variables.
    No production secrets are hardcoded here.
    """
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./test.db")
    WEBHOOK_SECRET: str = os.getenv("WEBHOOK_SECRET", "")
    API_KEY: str = os.getenv("API_KEY", "")
    DEFAULT_MONTHLY_CAP_CENTS: int = int(os.getenv("DEFAULT_MONTHLY_CAP_CENTS", "5000"))

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

settings = Settings()
