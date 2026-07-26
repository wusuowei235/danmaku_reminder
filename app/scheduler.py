"""Scheduling engine — manages timers for enabled reminders."""

import threading
import time
from datetime import datetime, time as dt_time
from typing import Optional, Callable

from . import db
from .window_manager import WindowManager


class Scheduler:
    """Manages per-reminder timers with schedule rule checking."""

    def __init__(self, on_danmaku: Callable[[str, str], None],
                 on_sound: Callable[[Optional[str]], None]):
        self._on_danmaku = on_danmaku
        self._on_sound = on_sound
        self._on_snooze_available: Callable[[int, int], None] = None
        self._window_manager = WindowManager()
        self._timers: dict[int, threading.Timer] = {}
        self._last_reminder: Optional[dict] = None
        self._paused = False
        self._lock = threading.Lock()

    def set_on_snooze_available(self, callback: Callable[[int, int], None]):
        """Set callback when a reminder fires and snooze becomes available."""
        self._on_snooze_available = callback

    def load_reminders(self):
        """Load all enabled reminders and start their timers."""
        self.stop_all()
        reminders = db.get_enabled_reminders()
        for rem in reminders:
            self._start_timer(rem)

    def _start_timer(self, reminder: dict):
        """Start a single reminder's timer."""
        with self._lock:
            if self._paused:
                return
            timer = threading.Timer(
                reminder["interval_minutes"] * 60,
                self._on_timer_tick,
                args=[reminder]
            )
            timer.daemon = True
            timer.start()
            self._timers[reminder["id"]] = timer

    def _on_timer_tick(self, reminder: dict):
        """Called when a reminder's timer fires."""
        try:
            # 1. Check schedule rules
            if not self._is_in_schedule(reminder["id"]):
                self._start_timer(reminder)
                return

            # 2. Check window blacklist
            if not self._window_manager.should_show():
                self._start_timer(reminder)
                return

            # 3. Fire the danmaku (repeat if repeat_count > 0)
            self._on_danmaku(reminder["message"], reminder["style"])
            repeat = reminder.get("repeat_count", 0) or 0
            for i in range(repeat):
                threading.Timer(
                    (i + 1) * 0.6,  # stagger each repeat by 0.6s
                    self._on_danmaku,
                    args=[reminder["message"], reminder["style"]]
                ).start()

            # 4. Track for snooze
            self._last_reminder = reminder
            if self._on_snooze_available:
                snooze_min = reminder.get("snooze_minutes", 5) or 5
                self._on_snooze_available(reminder["id"], snooze_min)

            # 5. Sound if enabled
            if reminder["sound_enabled"]:
                self._on_sound(reminder.get("sound_path"))

        finally:
            # Restart the timer for next cycle
            self._start_timer(reminder)

    def snooze_last(self) -> bool:
        """Snooze the last triggered reminder by its snooze_minutes."""
        if not self._last_reminder:
            return False
        reminder = self._last_reminder
        minutes = reminder.get("snooze_minutes", 5) or 5
        rid = reminder["id"]
        # Cancel existing timer
        with self._lock:
            if rid in self._timers:
                self._timers[rid].cancel()
                del self._timers[rid]
        # Schedule one-shot after snooze
        threading.Timer(
            minutes * 60,
            self._on_snooze_fire,
            args=[reminder]
        ).start()
        return True

    def _on_snooze_fire(self, reminder: dict):
        """Fire a snoozed reminder, then restart normal timer."""
        self._on_danmaku(reminder["message"], reminder["style"])
        if reminder["sound_enabled"]:
            self._on_sound(reminder.get("sound_path"))
        self._last_reminder = reminder
        if self._on_snooze_available:
            snooze_min = reminder.get("snooze_minutes", 5) or 5
            self._on_snooze_available(reminder["id"], snooze_min)
        self._start_timer(reminder)

    def _is_in_schedule(self, reminder_id: int) -> bool:
        """Check if current time falls within any schedule rule."""
        rules = db.get_rules_for_reminder(reminder_id)
        if not rules:
            return True  # No rules = always active
        now = datetime.now()
        today_num = str(now.isoweekday())  # 1=Mon ... 7=Sun
        current_time = now.strftime("%H:%M")
        for rule in rules:
            if rule["day_of_week"] != "*":
                days = [d.strip() for d in rule["day_of_week"].split(",")]
                if today_num not in days:
                    continue
            if rule["start_time"] <= current_time <= rule["end_time"]:
                return True
        return False

    def pause(self):
        """Pause all timers."""
        with self._lock:
            self._paused = True
            self.stop_all()

    def resume(self):
        """Resume all timers."""
        with self._lock:
            self._paused = False
            self.load_reminders()

    def stop_all(self):
        """Cancel all running timers."""
        with self._lock:
            for tid, timer in self._timers.items():
                timer.cancel()
            self._timers.clear()

    def is_paused(self) -> bool:
        return self._paused
