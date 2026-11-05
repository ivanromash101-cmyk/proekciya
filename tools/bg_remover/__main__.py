"""Командная строка: python -m bg_remover фото.jpg папка -o "без фона" --json"""
import argparse
import json
import sys
from pathlib import Path

from .core import IMAGE_TYPES, remove_background_file


def _inputs(paths):
    for p in map(Path, paths):
        if p.is_dir():
            yield from sorted(f for f in p.iterdir() if f.suffix.lower() in IMAGE_TYPES and not f.stem.endswith("_no_bg"))
        else:
            yield p


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m bg_remover", description="Удаление фона с фото")
    ap.add_argument("paths", nargs="+", help="файлы или папки")
    ap.add_argument("-o", "--output", help="папка для результатов")
    ap.add_argument("--keep-original", action="store_true")
    ap.add_argument("--crop", action="store_true")
    ap.add_argument("--no-fix", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    errors = 0
    for f in _inputs(a.paths):
        try:
            out, report = remove_background_file(f, a.output, a.keep_original, not a.no_fix, a.crop)
            rec = {"input": str(f), "output": out, "report": report}
        except Exception as e:
            errors += 1
            rec = {"input": str(f), "error": str(e)}
        if a.json:
            print(json.dumps(rec, ensure_ascii=False), flush=True)
        else:
            print(f"{f} → {rec.get('output') or 'ОШИБКА: ' + rec['error']}", flush=True)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
