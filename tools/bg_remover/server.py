"""HTTP-сервер: python -m bg_remover.server --port 8765
POST /remove-background (тело — байты фото) → image/png; ?crop=1, ?fix=0
GET /health → {"status": "ok", "model": "..."}"""
import argparse
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from . import core

MAX_BYTES = 40 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    server_version = "bg_remover/1.0"

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "X-Report")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code, msg):
        self._send(code, json.dumps({"error": msg}, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            self._send(200, json.dumps({"status": "ok", "model": core.MODEL}).encode())
        else:
            self._error(404, "not found")

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/remove-background":
            return self._error(404, "not found")
        size = int(self.headers.get("Content-Length") or 0)
        if size <= 0:
            return self._error(400, "пустой запрос")
        if size > MAX_BYTES:
            return self._error(413, "файл больше 40 МБ")
        data = self.rfile.read(size)
        q = parse_qs(url.query)
        crop = q.get("crop", ["0"])[0] == "1"
        fix = q.get("fix", ["1"])[0] != "0"
        try:
            image = core.load_image(data)
        except Exception as e:
            return self._error(415, f"не изображение: {e}")
        try:
            result, report = core.remove_background(image, fix=fix, crop=crop)
            png = core._png_bytes(result)
        except Exception as e:
            return self._error(422, f"не удалось обработать: {e}")
        self._send(200, png, "image/png", {"X-Report": json.dumps(report, ensure_ascii=True)})

    def log_message(self, fmt, *args):
        sys.stderr.write("[bg_remover] " + (fmt % args) + "\n")


def main(argv=None):
    p = argparse.ArgumentParser(description="Сервер удаления фона")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    args = p.parse_args(argv)
    server = ThreadingHTTPServer((args.host, args.port), Handler)  # сначала слушаем порт, модель грузится параллельно
    print("Загружаю модель (первый раз скачивается ~930 МБ, подождите)…", flush=True)

    def load():
        try:
            core.warmup()
            print(f"Готово. Сервер удаления фона: http://{args.host}:{args.port}", flush=True)
        except Exception as e:
            print(f"Ошибка загрузки модели: {e}", flush=True)

    threading.Thread(target=load, daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
