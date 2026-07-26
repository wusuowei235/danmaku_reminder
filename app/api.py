"""JS Bridge API — methods exposed to the WebView2 settings page."""

from typing import Optional, Callable

from . import db
from .scheduler import Scheduler


class DanmakuApi:
    """Python-side API that JavaScript in the settings page can call.

    All methods are exposed via pywebview's js_api mechanism.
    """

    def __init__(self, scheduler: Scheduler):
        self._scheduler = scheduler
        self._on_reload_callback = None
        self._on_hide_window = None
        self._on_clickthru_toggle = None
        self._on_update_overlay = None

    def set_on_reload(self, callback):
        """Set callback to reload scheduler when settings change."""
        self._on_reload_callback = callback

    def set_on_hide_window(self, callback):
        """Set callback to hide the settings window."""
        self._on_hide_window = callback

    def hide_window(self):
        """Called from JS to hide settings window (minimize to tray)."""
        if self._on_hide_window:
            self._on_hide_window()

    def _reload_scheduler(self):
        if self._on_reload_callback:
            self._on_reload_callback()

    # ── Reminders ──

    def get_reminders(self) -> list:
        return db.get_all_reminders()

    def add_reminder(self, name: str, message: str, interval_minutes: int = 60,
                     style: str = "fullscreen_attack", sound_enabled: bool = False,
                     sound_path: str = None, repeat_count: int = 0,
                     snooze_minutes: int = 5) -> int:
        rid = db.add_reminder(name, message, interval_minutes, style,
                              sound_enabled, sound_path, repeat_count,
                              snooze_minutes)
        self._reload_scheduler()
        return rid

    def update_reminder(self, reminder_id: int, data: dict = None, **kwargs):
        """Update a reminder. Accepts kwargs or a dict as second arg (from JS)."""
        if data:
            kwargs.update(data)
        db.update_reminder(reminder_id, **kwargs)
        self._reload_scheduler()

    def delete_reminder(self, reminder_id: int):
        db.delete_reminder(reminder_id)
        self._reload_scheduler()

    def toggle_reminder(self, reminder_id: int, enabled: bool):
        db.update_reminder(reminder_id, enabled=int(enabled))
        self._reload_scheduler()

    # ── Schedule Rules ──

    def get_rules_for_reminder(self, reminder_id: int) -> list:
        return db.get_rules_for_reminder(reminder_id)

    def add_schedule_rule(self, reminder_id: int, day_of_week: str = "*",
                          start_time: str = "09:00", end_time: str = "18:00") -> int:
        rid = db.add_schedule_rule(reminder_id, day_of_week, start_time, end_time)
        self._reload_scheduler()
        return rid

    def delete_schedule_rule(self, rule_id: int):
        db.delete_schedule_rule(rule_id)
        self._reload_scheduler()

    def save_schedule_rules(self, reminder_id: int, rules: list):
        """Save a complete set of schedule rules for a reminder.

        Args:
            reminder_id: The reminder ID
            rules: List of dicts with keys: day_of_week, start_time, end_time
        """
        db.delete_rules_for_reminder(reminder_id)
        for rule in rules:
            db.add_schedule_rule(
                reminder_id,
                rule.get("day_of_week", "*"),
                rule.get("start_time", "09:00"),
                rule.get("end_time", "18:00")
            )
        self._reload_scheduler()

    # ── Blacklist ──

    def get_blacklist(self) -> list:
        return db.get_blacklist()

    def add_blacklist_entry(self, process_name: str, window_title: str = "") -> int:
        eid = db.add_blacklist_entry(process_name, window_title or None)
        return eid

    def delete_blacklist_entry(self, entry_id: int):
        db.delete_blacklist_entry(entry_id)

    # ── Settings ──

    def get_settings(self) -> dict:
        return db.get_all_settings()

    def update_setting(self, key: str, value: str):
        db.set_setting(key, value)

    def set_on_clickthru_toggle(self, callback: Callable[[bool], None]):
        """Set callback to enable/disable overlay click-through."""
        self._on_clickthru_toggle = callback

    def set_on_update_overlay(self, callback: Callable[[str, str], None]):
        """Set callback to push a setting to the overlay window."""
        self._on_update_overlay = callback

    def update_overlay_setting(self, key: str, value: str):
        """Called from settings JS to propagate a setting to overlay."""
        if self._on_update_overlay:
            self._on_update_overlay(key, value)

    def snooze_bar_hide(self):
        """Called from overlay JS when snooze bar hides (timeout or after snooze)."""
        if self._on_clickthru_toggle:
            self._on_clickthru_toggle(True)

    # ── Snooze ──

    def snooze_last_reminder(self) -> bool:
        """Snooze the last fired reminder by its snooze_minutes."""
        result = self._scheduler.snooze_last()
        if result and self._on_clickthru_toggle:
            self._on_clickthru_toggle(True)
        return result

    # ── App Control ──

    def pause_reminders(self):
        self._scheduler.pause()

    def resume_reminders(self):
        self._scheduler.resume()

    def get_status(self) -> dict:
        return {
            "paused": self._scheduler.is_paused(),
            "reminder_count": len(db.get_enabled_reminders()),
        }


