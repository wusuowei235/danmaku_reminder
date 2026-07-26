"""System tray icon with context menu."""

import threading
import pystray
from PIL import Image, ImageDraw
from typing import Callable, Optional


def _create_icon() -> Image.Image:
    """Create a simple 64x64 tray icon (a water drop / bell shape)."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Draw a simple bell/notification icon
    draw.ellipse([16, 8, 48, 40], fill="#0f3460")
    draw.rectangle([20, 40, 44, 48], fill="#0f3460")
    draw.ellipse([24, 48, 40, 56], fill="#0f3460")
    # Yellow highlight dot
    draw.ellipse([22, 18, 34, 30], fill="#e94560")
    return img


class TrayApp:
    """System tray icon manager."""

    def __init__(self):
        self._icon: Optional[pystray.Icon] = None
        self._on_open_settings: Callable = lambda: None
        self._on_toggle_pause: Callable = lambda: None
        self._on_snooze: Callable = lambda: None
        self._on_quit: Callable = lambda: None
        self._paused = False
        self._running = threading.Event()

    def set_callbacks(self, on_open_settings: Callable = None,
                      on_toggle_pause: Callable = None,
                      on_quit: Callable = None,
                      on_snooze: Callable = None):
        if on_open_settings is not None:
            self._on_open_settings = on_open_settings
        if on_toggle_pause is not None:
            self._on_toggle_pause = on_toggle_pause
        if on_quit is not None:
            self._on_quit = on_quit
        if on_snooze is not None:
            self._on_snooze = on_snooze

    def set_paused(self, paused: bool):
        self._paused = paused
        self.update_menu()

    def _build_menu(self):
        return pystray.Menu(
            pystray.MenuItem("打开设置", lambda: self._on_open_settings()),
            pystray.MenuItem(
                "暂停提醒" if not self._paused else "恢复提醒",
                lambda: self._on_toggle_pause()
            ),
            pystray.MenuItem("推迟当前提醒", lambda: self._on_snooze()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("退出", lambda: self._on_quit()),
        )

    def run(self):
        """Start the tray icon (blocks until stopped)."""
        icon = pystray.Icon(
            "DanmakuReminder",
            _create_icon(),
            "全屏弹幕提醒",
            menu=self._build_menu()
        )
        self._icon = icon
        self._running.set()
        icon.run()

    def stop(self):
        """Stop the tray icon."""
        if self._icon:
            self._icon.stop()
        self._running.clear()

    def update_menu(self):
        """Refresh the context menu (call after pause state changes)."""
        if self._icon:
            self._icon.menu = self._build_menu()
