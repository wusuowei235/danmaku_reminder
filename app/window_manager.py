"""Active window detection and blacklist matching."""

import psutil
import pygetwindow as gw
from typing import Optional

from . import db


class WindowManager:
    """Detects the current active window and checks against blacklist."""

    def get_active_window_info(self) -> Optional[dict]:
        """Return {process_name, window_title} of the active window, or None."""
        try:
            active = gw.getActiveWindow()
            if active is None:
                return None
            title = active.title or ""
            # Find process by window handle
            # pygetwindow doesn't give PID directly; use a heuristic
            # We'll match by window title and process name separately
            # For process name, we check all running processes
            return {"window_title": title}
        except Exception:
            return None

    def get_active_process_name(self) -> Optional[str]:
        """Return the executable name of the foreground window's process."""
        try:
            import ctypes
            user32 = ctypes.windll.user32
            hwnd = user32.GetForegroundWindow()
            pid = ctypes.c_ulong()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            proc = psutil.Process(pid.value)
            return proc.name()
        except Exception:
            return None

    def is_blacklisted(self, process_name: str, window_title: str = "") -> bool:
        """Check if a window matches any blacklist entry."""
        entries = db.get_blacklist()
        for entry in entries:
            if entry["process_name"].lower() == process_name.lower():
                # If entry has a window_title filter, check that too
                if entry["window_title"]:
                    if entry["window_title"].lower() in window_title.lower():
                        return True
                else:
                    return True
        return False

    def should_show(self) -> bool:
        """Returns True if danmaku should show on current active window."""
        proc_name = self.get_active_process_name()
        win_info = self.get_active_window_info()
        if proc_name is None:
            return True  # can't detect, show anyway
        title = win_info["window_title"] if win_info else ""
        return not self.is_blacklisted(proc_name, title)
