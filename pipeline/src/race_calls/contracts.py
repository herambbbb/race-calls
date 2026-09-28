"""Writes contracts/prediction-record.schema.json, the shape the site reads.

Run after changing models.PredictionRecord: uv run python -m race_calls.contracts
"""

import json

from race_calls.models import PredictionRecord
from race_calls.settings import PROJECT_ROOT

SCHEMA_PATH = PROJECT_ROOT / "contracts" / "prediction-record.schema.json"


def main() -> None:
    schema = PredictionRecord.model_json_schema()
    SCHEMA_PATH.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
