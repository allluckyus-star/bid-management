"""CLI: python -m scripts.seed_sample [--reset]"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import get_connection, init_db
from app.services.seed_data import seed_sample_data


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed sample job bid data")
    parser.add_argument("--reset", action="store_true", help="Delete existing jobs before seeding")
    args = parser.parse_args()

    init_db()
    with get_connection() as conn:
        result = seed_sample_data(conn, reset=args.reset)
        conn.commit()
    print(result)


if __name__ == "__main__":
    main()
