/* ============================================================
   Danmaku Reminder — Settings UI logic
   Communicates with Python via pywebview.api.*
   ============================================================ */

(function () {
  'use strict';

  // ── State ──
  const state = {
    reminders: [],
    blacklist: [],
    settings: {},
    status: {},
    editingId: null,        // null = adding, number = editing
    rules: [],              // schedule rules for the form being edited
  };

  const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const DAY_MAP = { '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 7 };

  // ── DOM helpers ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // pywebview may not be ready immediately on page load
  function api() {
    if (window.pywebview && window.pywebview.api) return window.pywebview.api;
    return null;
  }

  function waitForApi(cb, tries = 0) {
    if (api()) { cb(); return; }
    if (tries > 100) { toast('API 不可用', true); return; }
    setTimeout(() => waitForApi(cb, tries + 1), 50);
  }

  // ── Toast ──
  let toastTimer = null;
  function toast(msg, isError) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ── Navigation ──
  function switchView(name) {
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $$('.view').forEach(v => v.classList.remove('active'));
    const target = name === 'edit' ? 'view-edit' : 'view-' + name;
    const el = $('#' + target);
    if (el) el.classList.add('active');
  }

  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // ── Reminders ──
  async function loadReminders() {
    const a = api(); if (!a) return;
    try {
      state.reminders = await a.get_reminders();
      renderReminders();
    } catch (e) { toast('加载提醒失败', true); }
  }

  function renderReminders() {
    const list = $('#reminder-list');
    const empty = $('#reminder-empty');
    list.innerHTML = '';
    if (!state.reminders.length) {
      list.appendChild(empty);
      return;
    }
    state.reminders.forEach(r => list.appendChild(buildReminderCard(r)));
  }

  function buildReminderCard(r) {
    const card = document.createElement('div');
    card.className = 'reminder-card' + (r.enabled ? '' : ' disabled');

    const main = document.createElement('div');
    main.className = 'card-main';
    main.innerHTML =
      '<div class="card-name"></div>' +
      '<div class="card-msg"></div>' +
      '<div class="card-meta"></div>';

    main.querySelector('.card-name').textContent = r.name;
    main.querySelector('.card-msg').textContent = r.message;
    const meta = main.querySelector('.card-meta');
    meta.innerHTML = '';
    const interval = document.createElement('span');
    interval.textContent = '每 ' + r.interval_minutes + ' 分钟';
    meta.appendChild(interval);
    const sep = document.createElement('span');
    sep.textContent = '·';
    sep.style.color = 'var(--text-mute)';
    meta.appendChild(sep);
    const badge = document.createElement('span');
    badge.className = 'badge badge-' + r.style;
    badge.textContent = r.style === 'scroll' ? '滚动' : (r.style === 'center_pop' ? '居中' : (r.style === 'fullscreen_attack' ? '全屏攻击' : r.style));
    meta.appendChild(badge);
    if (r.repeat_count > 0) {
      const rep = document.createElement('span');
      rep.textContent = '· 重复 ' + r.repeat_count + ' 次';
      meta.appendChild(rep);
    }

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    // toggle
    const sw = document.createElement('label');
    sw.className = 'switch';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!r.enabled;
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => toggleReminder(r.id, cb.checked));
    const track = document.createElement('span');
    track.className = 'switch-track';
    const thumb = document.createElement('span');
    thumb.className = 'switch-thumb';
    track.appendChild(thumb);
    sw.appendChild(cb);
    sw.appendChild(track);
    actions.appendChild(sw);

    // delete
    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
    del.title = '删除';
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteReminder(r.id); });
    actions.appendChild(del);

    card.appendChild(main);
    card.appendChild(actions);
    card.addEventListener('click', () => openEdit(r.id));
    return card;
  }

  async function toggleReminder(id, enabled) {
    const a = api(); if (!a) return;
    try {
      await a.toggle_reminder(id, enabled);
      const r = state.reminders.find(x => x.id === id);
      if (r) r.enabled = enabled ? 1 : 0;
      renderReminders();
      refreshStatus();
    } catch (e) { toast('开关失败', true); }
  }

  async function deleteReminder(id) {
    if (!confirm('确认删除此提醒？')) return;
    const a = api(); if (!a) return;
    try {
      await a.delete_reminder(id);
      state.reminders = state.reminders.filter(r => r.id !== id);
      renderReminders();
      refreshStatus();
      toast('提醒已删除');
    } catch (e) { toast('删除失败', true); }
  }

  // ── Edit form ──
  function openAdd() {
    state.editingId = null;
    state.rules = [];
    $('#edit-title').textContent = '添加提醒';
    $('#edit-id').value = '';
    $('#f-name').value = '';
    $('#f-message').value = '';
    $('#f-interval').value = 60;
    $('#f-style').value = 'fullscreen_attack';
    $('#f-sound-enabled').checked = false;
    $('#f-sound-path').value = '';
    $('#f-repeat').value = 0;
    $('#f-snooze').value = 5;
    $('#f-enabled').checked = true;
    renderRules();
    switchView('edit');
  }

  async function openEdit(id) {
    const r = state.reminders.find(x => x.id === id);
    if (!r) return;
    state.editingId = id;
    $('#edit-title').textContent = '编辑提醒';
    $('#edit-id').value = id;
    $('#f-name').value = r.name;
    $('#f-message').value = r.message;
    $('#f-interval').value = r.interval_minutes;
    $('#f-style').value = r.style;
    $('#f-sound-enabled').checked = !!r.sound_enabled;
    $('#f-sound-path').value = r.sound_path || '';
    $('#f-repeat').value = r.repeat_count;
    $('#f-snooze').value = r.snooze_minutes;
    $('#f-enabled').checked = !!r.enabled;

    // load rules
    const a = api();
    try { state.rules = await a.get_rules_for_reminder(id); }
    catch (e) { state.rules = []; }
    state.rules = state.rules.map(rule => ({
      day_of_week: rule.day_of_week || '*',
      start_time: rule.start_time || '09:00',
      end_time: rule.end_time || '18:00',
    }));
    renderRules();
    switchView('edit');
  }

  // ── Schedule rules editor ──
  function renderRules() {
    const container = $('#rules-container');
    container.innerHTML = '';
    state.rules.forEach((rule, idx) => container.appendChild(buildRuleRow(rule, idx)));
  }

  function buildRuleRow(rule, idx) {
    const row = document.createElement('div');
    row.className = 'rule-row';

    // Parse day_of_week into selected set
    const dow = rule.day_of_week || '*';
    let selectedDays = new Set();
    if (dow === '*') {
      // all selected
      DAYS.forEach(d => selectedDays.add(d));
    } else {
      dow.split(',').forEach(tok => {
        const t = tok.trim();
        // numeric 1-7
        const num = parseInt(t, 10);
        if (!isNaN(num)) {
          const name = Object.keys(DAY_MAP).find(k => DAY_MAP[k] === num);
          if (name) selectedDays.add(name);
        } else if (DAYS.includes(t)) {
          selectedDays.add(t);
        }
      });
    }

    const daysWrap = document.createElement('div');
    daysWrap.className = 'rule-days';
    DAYS.forEach(d => {
      const chip = document.createElement('label');
      chip.className = 'day-chip' + (selectedDays.has(d) ? ' active' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedDays.has(d);
      cb.addEventListener('change', () => {
        chip.classList.toggle('active', cb.checked);
      });
      chip.appendChild(cb);
      chip.appendChild(document.createTextNode(d));
      daysWrap.appendChild(chip);
    });
    row.appendChild(daysWrap);

    const times = document.createElement('div');
    times.className = 'rule-times';

    const startField = document.createElement('div');
    startField.className = 'field';
    startField.innerHTML = '<label class="field-label">开始时间</label>';
    const startInput = document.createElement('input');
    startInput.className = 'input';
    startInput.type = 'time';
    startInput.value = rule.start_time || '09:00';
    startField.appendChild(startInput);
    times.appendChild(startField);

    const endField = document.createElement('div');
    endField.className = 'field';
    endField.innerHTML = '<label class="field-label">结束时间</label>';
    const endInput = document.createElement('input');
    endInput.className = 'input';
    endInput.type = 'time';
    endInput.value = rule.end_time || '18:00';
    endField.appendChild(endInput);
    times.appendChild(endField);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'rule-remove';
    removeBtn.textContent = '删除';
    removeBtn.addEventListener('click', () => {
      state.rules.splice(idx, 1);
      renderRules();
    });
    times.appendChild(removeBtn);

    row.appendChild(times);

    // store references for collection
    row._getDays = () => {
      const chips = daysWrap.querySelectorAll('.day-chip');
      const checked = [];
      chips.forEach((chip, i) => {
        const cb = chip.querySelector('input');
        if (cb.checked) checked.push(DAYS[i]);
      });
      return checked;
    };
    row._getStart = () => startInput.value;
    row._getEnd = () => endInput.value;

    return row;
  }

  function collectRules() {
    const rows = $$('#rules-container .rule-row');
    const out = [];
    rows.forEach(row => {
      const days = row._getDays();
      let dow;
      if (days.length === 0) {
        dow = '*';
      } else if (days.length === 7) {
        dow = '*';
      } else {
        dow = days.map(d => DAY_MAP[d]).join(',');
      }
      out.push({
        day_of_week: dow,
        start_time: row._getStart() || '09:00',
        end_time: row._getEnd() || '18:00',
      });
    });
    return out;
  }

  $('#btn-add-rule').addEventListener('click', () => {
    state.rules.push({ day_of_week: '*', start_time: '09:00', end_time: '18:00' });
    renderRules();
  });

  // ── Save reminder ──
  $('#reminder-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = api(); if (!a) return;

    const name = $('#f-name').value.trim();
    const message = $('#f-message').value.trim();
    if (!name || !message) { toast('名称和文案不能为空', true); return; }

    const data = {
      name: name,
      message: message,
      interval_minutes: parseInt($('#f-interval').value, 10) || 60,
      style: $('#f-style').value,
      sound_enabled: $('#f-sound-enabled').checked ? 1 : 0,
      sound_path: $('#f-sound-path').value.trim() || null,
      repeat_count: parseInt($('#f-repeat').value, 10) || 0,
      snooze_minutes: parseInt($('#f-snooze').value, 10) || 0,
      enabled: $('#f-enabled').checked ? 1 : 0,
    };

    const rules = collectRules();

    try {
      if (state.editingId === null) {
        const id = await a.add_reminder(
          data.name, data.message, data.interval_minutes, data.style,
          !!data.sound_enabled, data.sound_path, data.repeat_count, data.snooze_minutes
        );
        // set enabled state (add_reminder defaults to enabled=1)
        if (!data.enabled) await a.update_reminder(id, { enabled: 0 });
        if (rules.length) await a.save_schedule_rules(id, rules);
        toast('提醒已添加');
      } else {
        await a.update_reminder(state.editingId, data);
        await a.save_schedule_rules(state.editingId, rules);
        toast('提醒已更新');
      }
      await loadReminders();
      refreshStatus();
      switchView('reminders');
    } catch (err) {
      toast('保存失败：' + (err.message || err), true);
    }
  });

  $('#btn-cancel').addEventListener('click', () => switchView('reminders'));
  $('#btn-edit-back').addEventListener('click', () => switchView('reminders'));
  $('#btn-add-reminder').addEventListener('click', openAdd);

  // ── Blacklist ──
  async function loadBlacklist() {
    const a = api(); if (!a) return;
    try {
      state.blacklist = await a.get_blacklist();
      renderBlacklist();
    } catch (e) { toast('加载黑名单失败', true); }
  }

  function renderBlacklist() {
    const list = $('#blacklist-list');
    const empty = $('#blacklist-empty');
    list.innerHTML = '';
    if (!state.blacklist.length) {
      list.appendChild(empty);
      return;
    }
    state.blacklist.forEach(e => list.appendChild(buildBlacklistCard(e)));
  }

  function buildBlacklistCard(e) {
    const card = document.createElement('div');
    card.className = 'blacklist-card';

    const info = document.createElement('div');
    info.className = 'bl-info';
    const proc = document.createElement('div');
    proc.className = 'bl-process';
    proc.textContent = e.process_name;
    info.appendChild(proc);
    if (e.window_title) {
      const title = document.createElement('div');
      title.className = 'bl-title';
      title.textContent = '标题：' + e.window_title;
      info.appendChild(title);
    }
    card.appendChild(info);

    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
    del.title = '删除';
    del.addEventListener('click', () => deleteBlacklist(e.id));
    card.appendChild(del);
    return card;
  }

  $('#blacklist-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = api(); if (!a) return;
    const proc = $('#bl-process').value.trim();
    const title = $('#bl-title').value.trim();
    if (!proc) { toast('进程名不能为空', true); return; }
    try {
      await a.add_blacklist_entry(proc, title);
      $('#bl-process').value = '';
      $('#bl-title').value = '';
      await loadBlacklist();
      toast('已添加到黑名单');
    } catch (err) { toast('添加失败', true); }
  });

  async function deleteBlacklist(id) {
    const a = api(); if (!a) return;
    try {
      await a.delete_blacklist_entry(id);
      state.blacklist = state.blacklist.filter(e => e.id !== id);
      renderBlacklist();
      toast('已删除');
    } catch (e) { toast('删除失败', true); }
  }

  // ── Settings ──
  async function loadSettings() {
    const a = api(); if (!a) return;
    try {
      state.settings = await a.get_settings();
      applySettings();
    } catch (e) { toast('加载设置失败', true); }
  }

  function applySettings() {
    const s = state.settings;
    $('#set-autostart').checked = s.autostart === 'true';
    const opacity = parseFloat(s.danmaku_opacity) || 0.85;
    $('#set-opacity').value = opacity;
    $('#set-opacity-val').textContent = opacity.toFixed(2);
    $('#set-speed').value = s.danmaku_speed || 8;
    $('#set-fontsize').value = s.danmaku_font_size || 36;
    $('#set-count').value = s.danmaku_count || 100;
    $('#set-count-val').textContent = s.danmaku_count || '100';
    const radius = parseInt(s.danmaku_sphere_radius, 10) || 400;
    $('#set-sphere-radius').value = radius;
    $('#set-sphere-radius-val').textContent = radius;

    // ── Restore color setting ──
    const raw = s.danmaku_color || 'gradient';
    colorValue = raw;
    if (raw === 'gradient' || raw.startsWith('gradient')) {
      colorMode = 'gradient';
      document.querySelectorAll('.color-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === 'gradient'));
      $('#color-custom').style.display = 'none';
    } else if (raw.startsWith('solid')) {
      colorMode = 'solid';
      document.querySelectorAll('.color-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === 'solid'));
      // Show custom picker
      const customDiv = $('#color-custom');
      customDiv.style.display = 'flex';
      const hex = raw.split(',')[1] || '#ff0040';
      $('#set-color-custom').value = hex;
      $('#color-hex-label').textContent = hex;
    }
    buildColorPresets();
  }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  $('#set-autostart').addEventListener('change', async (e) => {
    const a = api(); if (!a) return;
    try {
      await a.update_setting('autostart', e.target.checked ? 'true' : 'false');
      toast('开机自启已' + (e.target.checked ? '启用' : '禁用'));
    } catch (err) { toast('更新失败', true); }
  });

  const debouncedOpacity = debounce(async (val) => {
    const a = api(); if (!a) return;
    try {
      await a.update_setting('danmaku_opacity', String(val));
      await a.update_overlay_setting('danmaku_opacity', String(val));
    }
    catch (err) { toast('更新失败', true); }
  }, 300);
  $('#set-opacity').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    $('#set-opacity-val').textContent = v.toFixed(2);
    debouncedOpacity(v);
  });

  const debouncedSpeed = debounce(async (val) => {
    const a = api(); if (!a) return;
    try {
      await a.update_setting('danmaku_speed', String(val));
      await a.update_overlay_setting('danmaku_speed', String(val));
    }
    catch (err) { toast('更新失败', true); }
  }, 400);
  $('#set-speed').addEventListener('change', (e) => {
    debouncedSpeed(parseInt(e.target.value, 10) || 8);
  });

  const debouncedFont = debounce(async (val) => {
    const a = api(); if (!a) return;
    try {
      await a.update_setting('danmaku_font_size', String(val));
      await a.update_overlay_setting('danmaku_font_size', String(val));
    }
    catch (err) { toast('更新失败', true); }
  }, 400);
  $('#set-fontsize').addEventListener('change', (e) => {
    debouncedFont(parseInt(e.target.value, 10) || 36);
  });

  const debouncedCount = debounce(async (val) => {
    const a = api(); if (!a) return;
    try {
      await a.update_setting('danmaku_count', String(val));
      await a.update_overlay_setting('danmaku_count', String(val));
    } catch (err) { toast('更新失败', true); }
  }, 200);
  $('#set-count').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('#set-count-val').textContent = v;
    debouncedCount(v);
  });

  const debouncedRadius = debounce(async (val) => {
    const a = api(); if (!a) return;
    try {
      await a.update_setting('danmaku_sphere_radius', String(val));
      await a.update_overlay_setting('danmaku_sphere_radius', String(val));
    } catch (err) { toast('更新失败', true); }
  }, 200);
  $('#set-sphere-radius').addEventListener('input', (e) => {
    const v = parseInt(e.target.value, 10);
    $('#set-sphere-radius-val').textContent = v;
    debouncedRadius(v);
  });

  // ── Color picker ──
  const COLOR_PRESETS = {
    gradient: [
      { label: '随机', css: 'gradient-random' },
      { label: '红橙', css: 'linear-gradient(135deg, #ff0040, #ff6b6b)' },
      { label: '橙',   css: 'linear-gradient(135deg, #ff4500, #ff8c00)' },
      { label: '金',   css: 'linear-gradient(135deg, #ffd700, #ffaa00)' },
      { label: '翠绿', css: 'linear-gradient(135deg, #00ff88, #00cc66)' },
      { label: '天蓝', css: 'linear-gradient(135deg, #00bfff, #0080ff)' },
      { label: '紫',   css: 'linear-gradient(135deg, #8a2be2, #da70d6)' },
      { label: '粉',   css: 'linear-gradient(135deg, #ff1493, #ff69b4)' },
      { label: '青',   css: 'linear-gradient(135deg, #00ffff, #00bcd4)' },
      { label: '珊瑚', css: 'linear-gradient(135deg, #ff6347, #ffa07a)' },
      { label: '亮绿', css: 'linear-gradient(135deg, #7fff00, #32cd32)' },
    ],
    solid: [
      { label: '红',   css: '#ff0040' },
      { label: '橙',   css: '#ff8c00' },
      { label: '金',   css: '#ffd700' },
      { label: '翠绿', css: '#00ff88' },
      { label: '天蓝', css: '#00bfff' },
      { label: '紫',   css: '#8a2be2' },
      { label: '粉',   css: '#ff1493' },
      { label: '青',   css: '#00ffff' },
      { label: '白',   css: '#ffffff' },
    ],
  };

  let colorMode = 'gradient';  // 'gradient' | 'solid'
  let colorValue = 'gradient'; // 'gradient' or 'solid,#hex'

  function buildColorPresets() {
    const container = $('#color-presets');
    container.innerHTML = '';

    const presets = colorMode === 'gradient' ? COLOR_PRESETS.gradient : COLOR_PRESETS.solid;

    presets.forEach((p, idx) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      if (colorMode === 'gradient' && idx === 0) swatch.classList.add('gradient-swatch');

      if (colorMode === 'gradient' && idx === 0) {
        // "random" swatch — multi-color
        swatch.style.background = 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)';
        swatch.title = '随机渐变';
      } else if (p.css.startsWith('linear-gradient')) {
        swatch.style.background = p.css;
        swatch.title = p.label;
      } else {
        swatch.style.background = p.css;
        swatch.title = p.label;
      }

      // Check if this swatch matches the current colorValue
      const isActive = (colorMode === 'gradient' && idx === 0 && colorValue === 'gradient') ||
        (colorMode === 'gradient' && idx > 0 && colorValue === 'gradient,' + idx) ||
        (colorMode === 'solid' && colorValue === 'solid,' + p.css);

      if (isActive) swatch.classList.add('active');

      swatch.addEventListener('click', () => {
        // Clear active
        container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');

        // Hide custom color picker for presets
        const customDiv = $('#color-custom');
        customDiv.style.display = 'none';

        let val;
        if (colorMode === 'gradient') {
          val = idx === 0 ? 'gradient' : 'gradient,' + idx;
        } else {
          val = 'solid,' + p.css;
        }
        colorValue = val;
        debouncedColor(val);
      });

      container.appendChild(swatch);
    });
  }

  function buildCustomSolidPicker() {
    const customDiv = $('#color-custom');
    const colorInput = $('#set-color-custom');
    const hexLabel = $('#color-hex-label');

    // Extract current color if in solid mode
    if (colorMode === 'solid' && colorValue.startsWith('solid,')) {
      const hex = colorValue.split(',')[1];
      colorInput.value = hex;
      hexLabel.textContent = hex;
    }

    colorInput.addEventListener('input', (e) => {
      const hex = e.target.value;
      hexLabel.textContent = hex;
      // Also add a swatch for this custom color
      const container = $('#color-presets');
      container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));

      const val = 'solid,' + hex;
      colorValue = val;
      debouncedColor(val);
    });
  }

  const debouncedColor = debounce(async (val) => {
    const a = api(); if (!a) return;
    try {
      await a.update_setting('danmaku_color', val);
      await a.update_overlay_setting('danmaku_color', val);
    } catch (err) { toast('更新失败', true); }
  }, 200);

  // Tab switching
  document.querySelectorAll('.color-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.color-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const mode = tab.dataset.mode;
      colorMode = mode;

      const customDiv = $('#color-custom');
      if (mode === 'solid') {
        customDiv.style.display = 'flex';
        // Set default solid color if current value is gradient
        if (colorValue === 'gradient' || colorValue.startsWith('gradient')) {
          colorValue = 'solid,#ff0040';
        }
      } else {
        customDiv.style.display = 'none';
        if (colorValue.startsWith('solid')) {
          colorValue = 'gradient';
        }
      }

      buildColorPresets();
      debouncedColor(colorValue);
    });
  });

  // ── Pause / Resume ──
  $('#btn-pause').addEventListener('click', async () => {
    const a = api(); if (!a) return;
    const btn = $('#btn-pause');
    try {
      if (state.status.paused) {
        await a.resume_reminders();
        toast('提醒已恢复');
      } else {
        await a.pause_reminders();
        toast('提醒已暂停');
      }
      await refreshStatus();
    } catch (e) { toast('操作失败', true); }
  });

  // ── Status ──
  async function refreshStatus() {
    const a = api(); if (!a) return;
    try {
      state.status = await a.get_status();
      const dot = $('#status-dot');
      const text = $('#status-text');
      const meta = $('#status-meta');
      if (state.status.paused) {
        dot.className = 'status-dot paused';
        text.textContent = '已暂停';
      } else {
        dot.className = 'status-dot';
        text.textContent = '运行中';
      }
      meta.textContent = '已启用 ' + (state.status.reminder_count || 0) + ' 个提醒';
      // update pause button label
      const btn = $('#btn-pause');
      if (btn) btn.textContent = state.status.paused ? '恢复全部' : '暂停全部';
    } catch (e) { /* silent */ }
  }

  // ── Close settings ──
  const btnClose = $('#btn-close-settings');
  btnClose.addEventListener('click', () => {
    const a = api();
    if (a && a.hide_window) {
      a.hide_window();
    }
  });
  // Prevent drag-region from capturing mousedown on the close button
  btnClose.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  // ── Init ──
  waitForApi(() => {
    Promise.all([loadReminders(), loadBlacklist(), loadSettings(), refreshStatus()]);
  });

  // periodic status refresh
  setInterval(() => { if (api()) refreshStatus(); }, 15000);

})();