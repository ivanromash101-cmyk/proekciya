"""Проверка и исправление результата: оторванные куски фона, бледный шум,
мелкие дырки, цветная кайма, рваные края."""
import numpy as np
from PIL import Image, ImageFilter

try:
    from scipy import ndimage
except Exception:  # scipy обычно ставится вместе с rembg; без него — только простые исправления
    ndimage = None


def fix_result(image):
    """RGBA → (исправленное RGBA, отчёт)."""
    report = []
    rgba = np.array(image.convert("RGBA"))
    a = rgba[..., 3].astype(np.float32)
    total = a.size

    # 1. Бледный шум: почти прозрачные пиксели обнуляем
    faint = (a > 0) & (a < 24)
    n = int(faint.sum())
    if n > total * 0.001:
        report.append(f"Убран бледный шум ({n} точек)")
    a[faint] = 0

    solid = a >= 128
    if not solid.any():
        report.append("⚠ Человек на фото не найден — проверьте результат")
        rgba[..., 3] = a.astype(np.uint8)
        return Image.fromarray(rgba, "RGBA"), report

    if ndimage is not None:
        # 2. Оторванные куски: оставляем главный объект и крупные части рядом с ним
        lab, cnt = ndimage.label(solid)
        if cnt > 1:
            sizes = ndimage.sum(solid, lab, range(1, cnt + 1))
            keep = np.zeros(cnt + 1, bool)
            keep[1:] = sizes >= sizes.max() * 0.04
            dropped = int((~keep[1:]).sum())
            if dropped:
                near = ndimage.binary_dilation(keep[lab], iterations=3)
                a[~near] = 0
                report.append(f"Убраны оторванные куски фона: {dropped}")
            solid = a >= 128
        # 3. Мелкие дырки внутри фигуры
        filled = ndimage.binary_fill_holes(solid)
        holes = filled & ~solid
        if holes.any():
            hl, hc = ndimage.label(holes)
            hs = ndimage.sum(holes, hl, range(1, hc + 1))
            small = np.zeros(hc + 1, bool)
            small[1:] = hs <= max(64, solid.sum() * 0.0015)
            fill = small[hl]
            if fill.any():
                a[fill] = 255
                report.append(f"Заделаны мелкие дырки: {int(small[1:].sum())}")
            if (~small[1:]).any():
                report.append("⚠ Внутри фигуры есть крупные прозрачные места — проверьте глазами")

    # 4. Цветная кайма: полупрозрачные края подтягиваем к цвету соседних непрозрачных точек
    edge = (a > 0) & (a < 230)
    if edge.any():
        rgb = rgba[..., :3].astype(np.float32)
        w = (a >= 230).astype(np.float32)
        k = ImageFilter.BoxBlur(3)
        wb = np.array(Image.fromarray((w * 255).astype(np.uint8)).filter(k)).astype(np.float32) / 255
        for c in range(3):
            ch = Image.fromarray((rgb[..., c] * w).clip(0, 255).astype(np.uint8)).filter(k)
            avg = np.array(ch).astype(np.float32) / np.maximum(wb, 1e-3)
            sel = edge & (wb > 0.05)
            rgb[..., c][sel] = rgb[..., c][sel] * 0.35 + avg[sel] * 0.65
        rgba[..., :3] = rgb.clip(0, 255).astype(np.uint8)
        report.append("Убрана цветная кайма")

    # 5. Сглаживание краёв (только альфа, лёгкое)
    alpha = Image.fromarray(a.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    rgba[..., 3] = np.array(alpha)
    report.append("Края сглажены")
    return Image.fromarray(rgba, "RGBA"), report
