"""Writes the JSON schemas of the records the site reads, under contracts/.

Run after changing models.PredictionRecord or models.ScoreRecord:
uv run python -m race_calls.contracts
"""

import json

from race_calls.models import PredictionRecord, ScoreRecord
from race_calls.settings import PROJECT_ROOT

SCHEMA_PATH = PROJECT_ROOT / "contracts" / "prediction-record.schema.json"
SCORE_SCHEMA_PATH = PROJECT_ROOT / "contracts" / "score-record.schema.json"


def main() -> None:
    for model, path in ((PredictionRecord, SCHEMA_PATH), (ScoreRecord, SCORE_SCHEMA_PATH)):
        schema = model.model_json_schema()
        path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
