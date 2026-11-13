"""Poprawia polskie znaki w tekstach redakcyjnych zapisanych w modułach TS.

Użycie:
    python scripts/seo/fix-diacritics.py --check src/lib/mvp/publisher-content.ts
    python scripts/seo/fix-diacritics.py --write src/lib/mvp/publisher-content.ts

Zmienia WYŁĄCZNIE literały napisowe zawierające spację (zdania, tytuły).
Slugi, klucze i identyfikatory (literały bez spacji) zostają nietknięte —
slug z polskim znakiem bywa kluczem kategorii i jego zmiana zmieniłaby adres.
Słownik: scripts/seo/diacritics-map.json (tylko formy jednoznaczne).
"""

import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MAPPING = {
    key: value
    for key, value in json.load(io.open(os.path.join(HERE, "diacritics-map.json"), encoding="utf-8")).items()
    if not key.startswith("_")
}

WORD = re.compile(r"[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+")
LITERAL = re.compile(r'"((?:[^"\\]|\\.)*)"')


def fix_word(match):
    word = match.group(0)
    target = MAPPING.get(word.lower())
    if target is None:
        return word
    # Nazwy własne w słowniku mają już wielką literę; reszta dziedziczy ją ze źródła.
    if target[0].isupper():
        return target
    return target[0].upper() + target[1:] if word[0].isupper() else target


def fix_literal(match):
    body = match.group(1)
    if " " not in body:
        return match.group(0)
    return '"' + WORD.sub(fix_word, body) + '"'


def main():
    mode, paths = sys.argv[1], sys.argv[2:]
    sys.stdout.reconfigure(encoding="utf-8")
    total = 0
    for path in paths:
        source = io.open(path, encoding="utf-8", newline="").read()
        fixed = LITERAL.sub(fix_literal, source)
        changed = sum(1 for a, b in zip(source.splitlines(), fixed.splitlines()) if a != b)
        total += changed
        print(f"{path}: {changed} zmienionych wierszy")
        if mode == "--write" and fixed != source:
            io.open(path, "w", encoding="utf-8", newline="").write(fixed)
    if mode == "--check" and total:
        sys.exit(1)


if __name__ == "__main__":
    main()
