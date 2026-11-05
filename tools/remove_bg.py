"""Окно программы удаления фона: просмотр результата и ручная правка кистью.

Вся обработка — в модуле bg_remover. Для пакетной обработки без окна:
    python -m bg_remover фото.jpg папка_с_фото
"""

import sys
import threading
from pathlib import Path

from PIL import Image, ImageDraw, ImageTk

from bg_remover import IMAGE_TYPES, crop_to_subject, load_image, remove_background


def checkerboard(size, cell=12):
    """Шахматный фон, чтобы было видно прозрачность."""
    board = Image.new("RGB", size, (255, 255, 255))
    gray = Image.new("RGB", (cell, cell), (204, 204, 204))
    for y in range(0, size[1], cell):
        for x in range((y // cell % 2) * cell, size[0], cell * 2):
            board.paste(gray, (x, y))
    return board


class App:
    PREVIEW = 560
    HISTORY = 15

    def __init__(self, root):
        import tkinter as tk
        from tkinter import ttk

        self.root = root
        self.source = None
        self.result = None
        self.source_path = None
        self.history = []
        self.scale = 1.0
        self.offset = (0, 0)
        self.last_point = None

        root.title("Удаление фона")
        root.minsize(1180, 760)

        bar = ttk.Frame(root, padding=(8, 8, 8, 2))
        bar.pack(fill="x")
        ttk.Button(bar, text="Открыть фото…", command=self.open_image).pack(side="left")
        self.remove_btn = ttk.Button(bar, text="Удалить фон", command=self.start_removal, state="disabled")
        self.remove_btn.pack(side="left", padx=6)
        self.save_btn = ttk.Button(bar, text="Сохранить PNG…", command=self.save_image, state="disabled")
        self.save_btn.pack(side="left")

        self.matting = tk.BooleanVar(value=False)
        ttk.Checkbutton(bar, text="Мягкие края (волосы)", variable=self.matting).pack(side="left", padx=(16, 8))
        self.fix = tk.BooleanVar(value=True)
        ttk.Checkbutton(bar, text="Проверять и исправлять", variable=self.fix).pack(side="left")
        self.crop = tk.BooleanVar(value=False)
        ttk.Checkbutton(bar, text="Обрезать по объекту", variable=self.crop).pack(side="left", padx=8)

        tools = ttk.Frame(root, padding=(8, 2, 8, 0))
        tools.pack(fill="x")
        ttk.Label(tools, text="Ручная правка:").pack(side="left")
        self.tool = tk.StringVar(value="none")
        for value, text in (("none", "Выкл"), ("restore", "Вернуть"), ("erase", "Стереть")):
            ttk.Radiobutton(tools, text=text, value=value, variable=self.tool, command=self._update_cursor).pack(
                side="left", padx=4
            )
        ttk.Label(tools, text="Размер кисти:").pack(side="left", padx=(16, 4))
        self.brush = tk.IntVar(value=12)
        ttk.Scale(tools, from_=2, to=60, variable=self.brush, length=160).pack(side="left")
        self.undo_btn = ttk.Button(tools, text="Отменить (Ctrl+Z)", command=self.undo, state="disabled")
        self.undo_btn.pack(side="left", padx=12)
        ttk.Label(tools, text="Рисуйте мышью по правой картинке", foreground="gray").pack(side="left")

        panes = ttk.Frame(root, padding=8)
        panes.pack(fill="both", expand=True)
        left_frame = ttk.LabelFrame(panes, text="Исходное фото", padding=6)
        left_frame.pack(side="left", fill="both", expand=True, padx=4)
        self.left = ttk.Label(left_frame, anchor="center")
        self.left.pack(fill="both", expand=True)
        right_frame = ttk.LabelFrame(panes, text="Без фона", padding=6)
        right_frame.pack(side="left", fill="both", expand=True, padx=4)
        self.canvas = tk.Canvas(right_frame, highlightthickness=0, background="#f0f0f0")
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<ButtonPress-1>", self._stroke_start)
        self.canvas.bind("<B1-Motion>", self._stroke_move)
        self.canvas.bind("<ButtonRelease-1>", self._stroke_end)
        self.canvas.bind("<Configure>", lambda e: self._show_result())
        root.bind("<Control-z>", lambda e: self.undo())
        root.bind("<Control-Cyrillic_ya>", lambda e: self.undo())

        self.report = tk.StringVar()
        ttk.Label(root, textvariable=self.report, padding=(12, 0, 8, 4), justify="left").pack(fill="x")
        self.status = tk.StringVar(value="Откройте фото, чтобы начать.")
        ttk.Label(root, textvariable=self.status, padding=(8, 0, 8, 8)).pack(fill="x")

    def _preview(self, image):
        preview = image.copy()
        preview.thumbnail((self.PREVIEW, self.PREVIEW))
        if preview.mode == "RGBA":
            board = checkerboard(preview.size)
            board.paste(preview, mask=preview.getchannel("A"))
            preview = board
        return preview

    def _show_source(self):
        photo = ImageTk.PhotoImage(self._preview(self.source))
        self.left.configure(image=photo)
        self.left.image = photo

    def _show_result(self):
        self.canvas.delete("all")
        if self.result is None:
            return
        preview = self._preview(self.result)
        self.scale = preview.width / self.result.width
        self.offset = (
            max((self.canvas.winfo_width() - preview.width) // 2, 0),
            max((self.canvas.winfo_height() - preview.height) // 2, 0),
        )
        self.photo = ImageTk.PhotoImage(preview)
        self.canvas.create_image(*self.offset, image=self.photo, anchor="nw")

    def _update_cursor(self):
        self.canvas.configure(cursor="" if self.tool.get() == "none" else "circle")

    def _stroke_start(self, event):
        if self.result is None or self.tool.get() == "none":
            return
        self.history = self.history[-(self.HISTORY - 1):] + [self.result.copy()]
        self.undo_btn.configure(state="normal")
        self.last_point = (event.x, event.y)
        self._paint(event.x, event.y)

    def _stroke_move(self, event):
        if self.last_point is None:
            return
        # Заполняем промежутки, если мышь двигалась быстро
        x0, y0 = self.last_point
        step = max(self.brush.get() / 3, 1)
        steps = max(int(max(abs(event.x - x0), abs(event.y - y0)) / step), 1)
        for i in range(1, steps + 1):
            self._paint(x0 + (event.x - x0) * i / steps, y0 + (event.y - y0) * i / steps)
        self.last_point = (event.x, event.y)

    def _stroke_end(self, event):
        if self.last_point is None:
            return
        self.last_point = None
        self._show_result()

    def _paint(self, cx, cy):
        """Рисует кистью в точке холста: возвращает пиксели оригинала или стирает их."""
        radius = self.brush.get() / 2
        color = "#3c3" if self.tool.get() == "restore" else "#e33"
        self.canvas.create_oval(cx - radius, cy - radius, cx + radius, cy + radius, fill=color, outline="")

        x = (cx - self.offset[0]) / self.scale
        y = (cy - self.offset[1]) / self.scale
        r = radius / self.scale
        box = (
            max(int(x - r), 0),
            max(int(y - r), 0),
            min(int(x + r) + 1, self.result.width),
            min(int(y + r) + 1, self.result.height),
        )
        if box[0] >= box[2] or box[1] >= box[3]:
            return
        mask = Image.new("L", (box[2] - box[0], box[3] - box[1]), 0)
        ImageDraw.Draw(mask).ellipse((x - r - box[0], y - r - box[1], x + r - box[0], y + r - box[1]), fill=255)
        region = self.result.crop(box)
        if self.tool.get() == "restore":
            region.paste(self.source.crop(box).convert("RGBA"), (0, 0), mask)
        else:
            region.paste((0, 0, 0, 0), (0, 0, *region.size), mask)
        self.result.paste(region, box[:2])

    def undo(self):
        if not self.history:
            return
        self.result = self.history.pop()
        if not self.history:
            self.undo_btn.configure(state="disabled")
        self._show_result()

    def open_image(self):
        from tkinter import filedialog, messagebox

        path = filedialog.askopenfilename(
            title="Выберите фото",
            filetypes=[("Изображения", " ".join(f"*{e}" for e in IMAGE_TYPES)), ("Все файлы", "*.*")],
        )
        if not path:
            return
        try:
            self.source = load_image(path)
        except Exception as e:
            messagebox.showerror("Ошибка", f"Не удалось открыть файл:\n{e}")
            return
        self.source_path = Path(path)
        self.result = None
        self.history.clear()
        self.undo_btn.configure(state="disabled")
        self._show_source()
        self._show_result()
        self.report.set("")
        self.remove_btn.configure(state="normal")
        self.save_btn.configure(state="disabled")
        self.status.set(f"{self.source_path.name} — {self.source.width}×{self.source.height}")

    def start_removal(self):
        self.remove_btn.configure(state="disabled")
        self.save_btn.configure(state="disabled")
        self.status.set("Удаляю фон… (около минуты)")
        self.report.set("")
        # Обрезаем только при сохранении, чтобы кисть совпадала с пикселями оригинала
        options = (self.source, self.fix.get(), False, self.matting.get())
        threading.Thread(target=self._worker, args=options, daemon=True).start()

    def _worker(self, *options):
        try:
            result, report = remove_background(*options)
            self.root.after(0, self._done, result, report, None)
        except Exception as e:
            self.root.after(0, self._done, None, [], e)

    def _done(self, result, report, error):
        from tkinter import messagebox

        self.remove_btn.configure(state="normal")
        if error:
            self.status.set("Ошибка при удалении фона.")
            messagebox.showerror("Ошибка", str(error))
            return
        self.result = result
        self.history.clear()
        self.undo_btn.configure(state="disabled")
        self._show_result()
        self.save_btn.configure(state="normal")
        if report:
            self.report.set("Проверка:\n" + "\n".join(f"• {line}" for line in report))
        self.status.set("Готово. Если что-то не так — поправьте кистью, затем сохраните PNG.")

    def save_image(self):
        from tkinter import filedialog

        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            initialfile=f"{self.source_path.stem}_no_bg.png",
            filetypes=[("PNG", "*.png")],
        )
        if path:
            image = crop_to_subject(self.result) if self.crop.get() else self.result
            image.save(path)
            self.status.set(f"Сохранено: {path}")


def main():
    import tkinter as tk

    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    sys.exit(main())
