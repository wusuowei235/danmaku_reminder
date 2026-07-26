"""SQLite database layer for Danmaku Reminder."""

import sqlite3
import os
from datetime import datetime
from typing import Optional


DB_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "DanmakuReminder")
DB_PATH = os.path.join(DB_DIR, "reminders.db")


def get_connection() -> sqlite3.Connection:
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            message TEXT NOT NULL,
            interval_minutes INTEGER NOT NULL DEFAULT 60,
            style TEXT NOT NULL DEFAULT 'fullscreen_attack',
            sound_enabled INTEGER NOT NULL DEFAULT 0,
            sound_path TEXT,
            repeat_count INTEGER NOT NULL DEFAULT 0,
            snooze_minutes INTEGER NOT NULL DEFAULT 5,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS schedule_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reminder_id INTEGER NOT NULL,
            day_of_week TEXT NOT NULL DEFAULT '*',
            start_time TEXT NOT NULL DEFAULT '09:00',
            end_time TEXT NOT NULL DEFAULT '18:00',
            FOREIGN KEY (reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS window_blacklist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            process_name TEXT NOT NULL,
            window_title TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        INSERT OR IGNORE INTO settings (key, value) VALUES ('autostart', 'false');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('danmaku_opacity', '0.85');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('danmaku_speed', '8');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('danmaku_font_size', '36');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('danmaku_count', '100');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('danmaku_color', 'gradient');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('danmaku_sphere_radius', '400');
    """)
    # Migrate existing scroll-style reminders to fullscreen_attack
    conn.execute("UPDATE reminders SET style = 'fullscreen_attack' WHERE style = 'scroll'")
    conn.commit()
    conn.close()


# ── Reminders CRUD ──

def add_reminder(name: str, message: str, interval_minutes: int = 60,
                 style: str = "fullscreen_attack", sound_enabled: bool = False,
                 sound_path: str = None, repeat_count: int = 0,
                 snooze_minutes: int = 5) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO reminders (name, message, interval_minutes, style,
           sound_enabled, sound_path, repeat_count, snooze_minutes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (name, message, interval_minutes, style, int(sound_enabled),
         sound_path, repeat_count, snooze_minutes)
    )
    conn.commit()
    reminder_id = cur.lastrowid
    conn.close()
    return reminder_id


def get_all_reminders() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM reminders ORDER BY created_at").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_enabled_reminders() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM reminders WHERE enabled=1 ORDER BY created_at"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_reminder(reminder_id: int, **kwargs):
    allowed = {"name", "message", "interval_minutes", "style",
               "sound_enabled", "sound_path", "repeat_count",
               "snooze_minutes", "enabled"}
    sets = []
    params = []
    for k, v in kwargs.items():
        if k in allowed:
            sets.append(f"{k}=?")
            params.append(v)
    if not sets:
        return
    params.append(reminder_id)
    conn = get_connection()
    conn.execute(f"UPDATE reminders SET {', '.join(sets)} WHERE id=?", params)
    conn.commit()
    conn.close()


def delete_reminder(reminder_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM reminders WHERE id=?", (reminder_id,))
    conn.commit()
    conn.close()


# ── Schedule Rules CRUD ──

def add_schedule_rule(reminder_id: int, day_of_week: str = "*",
                      start_time: str = "09:00", end_time: str = "18:00") -> int:
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO schedule_rules (reminder_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)",
        (reminder_id, day_of_week, start_time, end_time)
    )
    conn.commit()
    rule_id = cur.lastrowid
    conn.close()
    return rule_id


def get_rules_for_reminder(reminder_id: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM schedule_rules WHERE reminder_id=?", (reminder_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_schedule_rule(rule_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM schedule_rules WHERE id=?", (rule_id,))
    conn.commit()
    conn.close()


def delete_rules_for_reminder(reminder_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM schedule_rules WHERE reminder_id=?", (reminder_id,))
    conn.commit()
    conn.close()


# ── Window Blacklist CRUD ──

def add_blacklist_entry(process_name: str, window_title: Optional[str] = None) -> int:
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO window_blacklist (process_name, window_title) VALUES (?, ?)",
        (process_name, window_title)
    )
    conn.commit()
    entry_id = cur.lastrowid
    conn.close()
    return entry_id


def get_blacklist() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM window_blacklist ORDER BY process_name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_blacklist_entry(entry_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM window_blacklist WHERE id=?", (entry_id,))
    conn.commit()
    conn.close()


# ── Settings CRUD ──

def get_setting(key: str, default: str = "") -> str:
    conn = get_connection()
    row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default


def set_setting(key: str, value: str):
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, value)
    )
    conn.commit()
    conn.close()


def get_all_settings() -> dict:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM settings").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}
