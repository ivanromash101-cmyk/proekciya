"""Модель, обработка, сохранение."""
import io
import os
import threading
from pathlib import Path

from PIL import Image, ImageOps

from .fix import fix_result

MODEL = os.environ.get("BG_REMOVER_MODEL", "birefnet-portrait")
IMAGE_TYPES = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".heic")
MAX_SIDE = 4096  # очень большие фото уменьшаем: быстрее и без нехватки памяти

_session = None
_lock = threading.Lock()


def _get_session():
    global _session
    if _session is None:
        with _lock:
            if _session is None:
                from rembg import new_session
                _session = new_session(MODEL)
    return _session


def warmup():
    """Загрузить модель заранее (при первом запуске — скачать ~930 МБ)."""
    _get_session()


def load_image(source):
    """Путь, байты или PIL.Image → RGB-картинка с правильным поворотом (EXIF)."""
    if isinstance(source, Image.Image):
        img = source
    elif isinstance(source, (bytes, bytearray)):
        img = Image.open(io.BytesIO(source))
    else:
        img = Image.open(source)
    img = ImageOps.exif_transpose(img)
    img.load()
    if img.mode == "RGBA":
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.getchannel("A"))
        img = bg
    elif img.mode != "RGB":
        img = img.convert("RGB")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return img


def crop_to_subject(image, margin=8):
    """Обрезать прозрачные поля вокруг объекта."""
    box = image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if not box:
        return image
    x0, y0, x1, y1 = box
    return image.crop((max(x0 - margin, 0), max(y0 - margin, 0),
                       min(x1 + margin, image.width), min(y1 + margin, image.height)))


def remove_background(image, fix=True, crop=False, matting=False):
    """PIL.Image → (RGBA без фона, отчёт — список строк)."""
    from rembg import remove
    image = load_image(image)
    kwargs = {"session": _get_session()}
    if matting:
        kwargs.update(alpha_matting=True, alpha_matting_foreground_threshold=240,
                      alpha_matting_background_threshold=10, alpha_matting_erode_size=10)
    try:
        result = remove(image, **kwargs)
    except Exception:
        if not matting:
            raise
        kwargs = {"session": _get_session()}
        result = remove(image, **kwargs)
    result = result.convert("RGBA")
    report = []
    if fix:
        result, report = fix_result(result)
    if crop:
        result = crop_to_subject(result)
    return result, report


def _png_bytes(image):
    buf = io.BytesIO()
    image.save(buf, "PNG", optimize=False, compress_level=6)
    return buf.getvalue()


def remove_background_bytes(data, fix=True, crop=False, matting=False):
    """Байты фото → (байты PNG без фона, отчёт). На диск ничего не пишется."""
    result, report = remove_background(load_image(bytes(data)), fix, crop, matting)
    return _png_bytes(result), report


def remove_background_file(path, output_dir=None, keep_original=False, fix=True, crop=False, matting=False):
    """Файл → файл «имя_no_bg.png». Оригинал удаляется только после успешной записи."""
    path = Path(path)
    out_dir = Path(output_dir) if output_dir else path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{path.stem}_no_bg.png"
    result, report = remove_background(load_image(path), fix, crop, matting)
    tmp = out.with_suffix(".tmp.png")
    result.save(tmp, "PNG")
    os.replace(tmp, out)
    if not keep_original and path.resolve() != out.resolve():
        try:
            path.unlink()
        except OSError as e:
            report.append(f"⚠ Оригинал не удалён: {e}")
    return str(out), report
