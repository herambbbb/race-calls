from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class JevTransport(StrEnum):
    GATEWAY = "gateway"
    TYPESAFE = "typesafe"
    OPENROUTER = "openrouter"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ai_gateway_api_key: SecretStr | None = None
    typesafe_api_key: SecretStr | None = None
    openrouter_api_key: SecretStr | None = None
    jev_transport: JevTransport = JevTransport.OPENROUTER

    # data_dir is a local, gitignored cache of API responses; the other two are committed.
    data_dir: Path = PROJECT_ROOT / "data"
    predictions_dir: Path = PROJECT_ROOT / "predictions"
    scores_dir: Path = PROJECT_ROOT / "scores"

    def jev_api_key(self) -> SecretStr | None:
        if self.jev_transport is JevTransport.GATEWAY:
            return self.ai_gateway_api_key
        if self.jev_transport is JevTransport.OPENROUTER:
            return self.openrouter_api_key
        return self.typesafe_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
