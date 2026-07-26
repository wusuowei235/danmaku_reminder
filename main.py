"""Danmaku Reminder — Main entry point."""

import os
import sys
import threading
import ctypes
import ctypes.wintypes
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import webview

from app.db import init_db
from app.scheduler import Scheduler
from app.api import DanmakuApi
from app.tray import TrayApp


def _find_hwnd(title_contain: str):
    """Find a window HWND by partial title match."""
    try:
        user32 = ctypes.windll.user32
        hwnds = []

        WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool,
                                          ctypes.c_size_t,  # HWND
                                          ctypes.c_size_t)  # LPARAM

        def enum_proc(hwnd, _):
            buf = ctypes.create_unicode_buffer(256)
            user32.GetWindowTextW(hwnd, buf, 256)
            if title_contain in buf.value:
                hwnds.append(hwnd)
            return True

        user32.EnumWindows(WNDENUMPROC(enum_proc), 0)
        return hwnds[0] if hwnds else None
    except Exception:
        return None


def _set_overlay_styles(hwnd, enable_clickthru):
    """Set overlay window to tool window (no taskbar) + optional click-through."""
    try:
        user32 = ctypes.windll.user32
        GWL_EXSTYLE = -20
        WS_EX_APPWINDOW = 0x40000
        WS_EX_TOOLWINDOW = 0x80
        WS_EX_LAYERED = 0x80000
        WS_EX_TRANSPARENT = 0x20

        current = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        # Remove APPWINDOW, add TOOLWINDOW + LAYERED
        style = (current & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_LAYERED
        if enable_clickthru:
            style |= WS_EX_TRANSPARENT
        else:
            style &= ~WS_EX_TRANSPARENT

        # Hide → change style → re-show (forces taskbar refresh)
        user32.ShowWindow(hwnd, 0)  # SW_HIDE
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style)

        rect = ctypes.wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        SWP_FRAMECHANGED = 0x0020
        user32.SetWindowPos(hwnd, 0,
                            rect.left, rect.top,
                            rect.right - rect.left,
                            rect.bottom - rect.top,
                            SWP_FRAMECHANGED)
        user32.ShowWindow(hwnd, 1)  # SW_SHOWNORMAL
    except Exception:
        pass


class App:
    def __init__(self):
        init_db()

        self.scheduler = Scheduler(on_danmaku=self._on_danmaku, on_sound=self._on_sound)
        self.api = DanmakuApi(self.scheduler)
        self.tray = TrayApp()
        self.overlay = None
        self.settings = None
        self._is_quitting = False

        base_dir = Path(__file__).parent
        self._danmaku_url = str(base_dir / "web" / "danmaku" / "index.html")
        self._settings_url = str(base_dir / "web" / "settings" / "index.html")

    def _on_danmaku(self, msg, style):
        if self.overlay:
            safe = msg.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")
            try:
                self.overlay.evaluate_js(f"showDanmaku('{safe}', '{style}');")
            except Exception:
                pass

    def _on_sound(self, path):
        if path and os.path.exists(path):
            try:
                import winsound
                winsound.PlaySound(path, winsound.SND_ASYNC)
            except Exception:
                pass

    def _toggle_overlay_clickthru(self, enable: bool):
        """Enable or disable mouse click-through on the overlay window."""
        try:
            hwnd = ctypes.windll.user32.FindWindowW(None, "DanmakuReminder")
            if hwnd:
                user32 = ctypes.windll.user32
                GWL_EXSTYLE = -20
                WS_EX_TRANSPARENT = 0x20
                current = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
                if enable:
                    new_style = current | WS_EX_TRANSPARENT
                else:
                    new_style = current & ~WS_EX_TRANSPARENT
                user32.SetWindowLongW(hwnd, GWL_EXSTYLE, new_style)
        except Exception:
            pass

    def _toggle_pause(self):
        if self.scheduler.is_paused():
            self.scheduler.resume()
            self.tray.set_paused(False)
        else:
            self.scheduler.pause()
            self.tray.set_paused(True)

    def _show_settings(self):
        """Restore settings window from hidden state."""
        try:
            self.settings.show()
        except Exception:
            # Fallback: use Win32 API if pywebview show() fails
            try:
                hwnd = ctypes.windll.user32.FindWindowW(None, "Settings")
                if hwnd:
                    ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                    ctypes.windll.user32.SetForegroundWindow(hwnd)
            except Exception:
                pass

    def _quit(self):
        self._is_quitting = True
        self.scheduler.stop_all()
        self.tray.stop()
        if self.settings:
            try:
                self.settings.destroy()
            except Exception:
                pass
        os._exit(0)

    def _on_startup(self):
        """Post-GUI-init setup."""
        # Hide settings to tray on startup
        if self.settings:
            try:
                self.settings.hide()
            except Exception:
                pass

        # Hide overlay from taskbar after a short delay
        def _apply():
            try:
                hwnd = ctypes.windll.user32.FindWindowW(None, "DanmakuReminder")
                if hwnd:
                    _set_overlay_styles(hwnd, True)
            except Exception:
                pass
        threading.Timer(0.5, _apply).start()

        # Wire up API — hide_window hides settings to tray
        self.api.set_on_hide_window(lambda: self.settings.hide())
        self.api.set_on_reload(self.scheduler.load_reminders)
        self.api.set_on_clickthru_toggle(self._toggle_overlay_clickthru)
        self.api.set_on_update_overlay(
            lambda key, value: (
                self.overlay.evaluate_js(
                    f"updateSetting('{key}', '{value}');"
                ) if self.overlay else None
            )
        )

        # Wire up snooze — show snooze bar in overlay when a reminder fires
        _snooze_timer = [None]  # mutable box for closure

        def _on_snooze_available(rid, minutes):
            if not self.overlay:
                return
            self._toggle_overlay_clickthru(False)
            self.overlay.evaluate_js(f"showSnoozeBar({rid}, {minutes});")
            # Cancel previous timer if any
            if _snooze_timer[0]:
                _snooze_timer[0].cancel()
            # Auto-hide snooze bar after 8 seconds
            _snooze_timer[0] = threading.Timer(8.0, lambda: (
                self.overlay.evaluate_js("hideSnoozeBar();") if self.overlay else None,
                self._toggle_overlay_clickthru(True)
            ))
            _snooze_timer[0].daemon = True
            _snooze_timer[0].start()

        self.scheduler.set_on_snooze_available(_on_snooze_available)

        self.scheduler.load_reminders()

        # Tray icon
        self.tray.set_callbacks(
            on_open_settings=self._show_settings,
            on_toggle_pause=self._toggle_pause,
            on_snooze=lambda: self.api.snooze_last_reminder(),
            on_quit=self._quit,
        )
        threading.Thread(target=self.tray.run, daemon=True).start()

    def run(self):
        self.overlay = webview.create_window(
            "DanmakuReminder", self._danmaku_url,
            transparent=True, fullscreen=True, on_top=True,
            easy_drag=False,
            js_api=self.api,
        )
        self.settings = webview.create_window(
            "Settings", self._settings_url,
            width=900, height=700, resizable=True,
            js_api=self.api,
            frameless=True,
            easy_drag=False,
        )
        webview.start(func=self._on_startup, debug=False,
                      http_server=True, private_mode=False)


def main():
    App().run()


if __name__ == "__main__":
    main()
