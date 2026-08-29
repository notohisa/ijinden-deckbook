"""Build the bundled official Ijinden card catalogue from published Excel files.

The application intentionally links to the official image URLs instead of
copying card art into this repository.  This keeps the user's browser cache
useful and leaves image delivery under the official site's control.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import pandas as pd


SOURCE_DIR = Path(__file__).resolve().parents[2] / "official-card-source"
OUTPUT = Path(__file__).resolve().parents[1] / "app" / "ijinden-cards.ts"
OFFICIAL_BASE = "https://one-draw.jp/ijinden/cardlist"


def text(value: object) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return str(value).strip()


def number(value: object) -> int | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def column(row: pd.Series, *names: str) -> str:
    for name in names:
        if name in row.index:
            value = text(row[name])
            if value:
                return value
    return ""


def image_details(file_number: str, card_number: str) -> tuple[str, str, str]:
    numeric = number(card_number)
    if numeric is not None:
        prefix = f"{int(file_number):02d}"
        return (
            f"{prefix}-{numeric:03d}",
            f"第{int(file_number)}弾ブースター",
            f"{OFFICIAL_BASE}/{file_number}/card/{prefix}_{numeric:03d}.png",
        )

    normalized = card_number.replace(" ", "").upper()
    match = re.fullmatch(r"([RBGYP])-?(\d+)", normalized)
    deck_code = match.group(1) if match else ""
    suffix = int(match.group(2)) if match else None
    if deck_code not in {"R", "B", "G", "Y", "P"} or suffix is None:
        raise ValueError(f"Unsupported card number: {file_number} / {card_number}")
    deck_pages = {"R": "R01", "B": "B01", "G": "G01", "Y": "Y01", "P": "P01"}
    deck_names = {
        "R": "伝説の武将デッキ",
        "B": "知と美の革命デッキ",
        "G": "日本の大天才デッキ",
        "Y": "三国の英傑デッキ",
        "P": "発展する医学",
    }
    return (
        f"{deck_code}-{suffix:03d}",
        deck_names[deck_code],
        f"{OFFICIAL_BASE}/{deck_pages[deck_code]}/card/{deck_code}_{suffix:03d}.png",
    )


def read_file(file_number: str) -> list[dict[str, object]]:
    workbook = SOURCE_DIR / f"{file_number}.xlsx"
    table = pd.read_excel(workbook, header=0).dropna(how="all")
    card_number_column = table.columns[0]
    cards: list[dict[str, object]] = []
    for _, row in table.iterrows():
        card_number = text(row[card_number_column])
        name = column(row, "名称", "名称（上部）")
        if not card_number or not name:
            continue
        card_id, default_set, image_url = image_details(file_number, card_number)
        release = column(row, "収録") or default_set
        color = column(row, "色").replace("-", "無") or "無"
        rule_text = column(row, "ルールテキスト")
        legacy_text = column(row, "遺業能力")
        description = "\n\n".join(part for part in (rule_text, legacy_text) if part)
        cards.append(
            {
                "id": card_id,
                "number": card_number,
                "name": name,
                "release": release,
                "rarity": column(row, "レアリティ", "レアリティ\n") or "-",
                "color": color,
                "level": number(row.get("レベル")),
                "power": number(row.get("パワー")),
                "trait": column(row, "特性"),
                "description": description,
                "imageUrl": image_url,
            }
        )
    return cards


def main() -> None:
    cards = [card for file_number in ("001", "002", "003", "004", "005", "006") for card in read_file(file_number)]
    ids = [str(card["id"]) for card in cards]
    if len(cards) != len(set(ids)):
        raise ValueError("Duplicate official card identifiers found")
    header = """// Generated from official Ijinden card-list Excel files. Do not edit by hand.\n\nexport type IjindenCard = {\n  id: string;\n  number: string;\n  name: string;\n  release: string;\n  rarity: string;\n  color: string;\n  level: number | null;\n  power: number | null;\n  trait: string;\n  description: string;\n  imageUrl: string;\n};\n\nexport const ijindenCards: IjindenCard[] = """
    OUTPUT.write_text(header + json.dumps(cards, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Wrote {len(cards)} cards to {OUTPUT}")


if __name__ == "__main__":
    main()
