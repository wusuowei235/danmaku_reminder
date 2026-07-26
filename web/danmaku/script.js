/* DanmakuOverlay - script logic */

(function () {
    'use strict';

    // ---- Runtime settings ----
    var settings = {
        danmaku_opacity: 1,
        danmaku_speed: 8,        // seconds for scroll to cross screen
        danmaku_font_size: 36,   // px, affects scroll danmaku
        danmaku_count: 100,      // how many bullets in fullscreen_attack
        danmaku_color: 'gradient', // 'gradient' or 'solid,#hex'
        danmaku_sphere_radius: 400, // sphere radius in px
    };

    // ---- Apply color setting to a danmaku element ----
    function applyColor(el, colorSetting) {
        if (!colorSetting || colorSetting === 'gradient') return; // use default gradient behavior
        if (colorSetting.startsWith('solid,')) {
            var c = colorSetting.split(',')[1];
            el.style.backgroundImage = 'none';
            el.style.setProperty('-webkit-text-fill-color', c);
            el.style.color = c;
            el.style.setProperty('-webkit-text-stroke', '1px rgba(0,0,0,0.3)');
        }
    }

    // ---- Gradient styles for scroll danmaku (randomly cycled) ----
    // ---- Attack-mode colors (vibrant "full-screen attack" palette) ----
    var attackColors = [
        'linear-gradient(135deg, #ff0040, #ff6b6b)',
        'linear-gradient(135deg, #ff4500, #ff8c00)',
        'linear-gradient(135deg, #ffd700, #ffaa00)',
        'linear-gradient(135deg, #00ff88, #00cc66)',
        'linear-gradient(135deg, #00bfff, #0080ff)',
        'linear-gradient(135deg, #8a2be2, #da70d6)',
        'linear-gradient(135deg, #ff1493, #ff69b4)',
        'linear-gradient(135deg, #00ffff, #00bcd4)',
        'linear-gradient(135deg, #ff6347, #ffa07a)',
        'linear-gradient(135deg, #7fff00, #32cd32)',
    ];

    var scrollGradients = [
        {
            gradient: 'linear-gradient(90deg, #ff6b6b, #ffd93d, #6bcbff, #c084fc)',
            glow: 'drop-shadow(0 0 5px rgba(255, 107, 107, 0.45)) drop-shadow(0 0 12px rgba(192, 132, 252, 0.3))'
        },
        {
            gradient: 'linear-gradient(90deg, #00f5d4, #00bbf9, #9b5de5)',
            glow: 'drop-shadow(0 0 5px rgba(0, 245, 212, 0.45)) drop-shadow(0 0 12px rgba(155, 93, 229, 0.3))'
        },
        {
            gradient: 'linear-gradient(90deg, #f72585, #b5179e, #7209b7)',
            glow: 'drop-shadow(0 0 5px rgba(247, 37, 133, 0.45)) drop-shadow(0 0 12px rgba(114, 9, 183, 0.3))'
        },
        {
            gradient: 'linear-gradient(90deg, #ffd60a, #ff8500, #ff5400)',
            glow: 'drop-shadow(0 0 5px rgba(255, 214, 10, 0.45)) drop-shadow(0 0 12px rgba(255, 84, 0, 0.3))'
        }
    ];

    // ---- Lane system for scroll danmaku ----
    var LANE_HEIGHT = 56;        // vertical slot per scroll danmaku
    var laneCount = 0;           // computed on first use
    var laneOccupiedUntil = [];  // timestamp when lane becomes free

    // ---- Queue management ----
    var MAX_DANMAKU = 200;
    var activeDanmaku = [];      // array of DOM elements

    var layer = document.getElementById('danmaku-layer');

    function computeLaneCount() {
        laneCount = Math.max(1, Math.floor(window.innerHeight / LANE_HEIGHT));
        laneOccupiedUntil = new Array(laneCount).fill(0);
    }

    function findFreeLane(durationMs) {
        var now = performance.now();
        for (var i = 0; i < laneCount; i++) {
            if (now >= laneOccupiedUntil[i]) {
                // reserve lane: estimate when this danmaku fully clears
                laneOccupiedUntil[i] = now + durationMs;
                return i;
            }
        }
        // all lanes busy — pick the one that frees earliest
        var minIdx = 0;
        var minTime = laneOccupiedUntil[0];
        for (var j = 1; j < laneCount; j++) {
            if (laneOccupiedUntil[j] < minTime) {
                minTime = laneOccupiedUntil[j];
                minIdx = j;
            }
        }
        laneOccupiedUntil[minIdx] = now + durationMs;
        return minIdx;
    }

    function removeDanmaku(el) {
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
        var idx = activeDanmaku.indexOf(el);
        if (idx !== -1) {
            activeDanmaku.splice(idx, 1);
        }
    }

    function enforceQueueLimit() {
        while (activeDanmaku.length > MAX_DANMAKU) {
            var oldest = activeDanmaku.shift();
            removeDanmaku(oldest);
        }
    }

    // ---- Public API ----

    /**
     * Show a danmaku.
     * @param {string} text  - the message text
     * @param {string} style - 'scroll' or 'center_pop'
     */
    window.showDanmaku = function (text, style) {
        if (!text) return;
        style = style || 'scroll';

        if (laneCount === 0) computeLaneCount();

        var el = document.createElement('div');

        if (style === 'center_pop') {
            el.className = 'danmaku-center-pop';
            el.textContent = text;
            // opacity is driven via CSS variable so the keyframe animation
            // respects the user's danmaku_opacity setting during hold phase
            el.style.opacity = settings.danmaku_opacity;
            el.style.setProperty('--danmaku-opacity', settings.danmaku_opacity);
            applyColor(el, settings.danmaku_color);
            layer.appendChild(el);
            activeDanmaku.push(el);
            enforceQueueLimit();

            // animation is 4s (defined in CSS)
            setTimeout(function () {
                removeDanmaku(el);
            }, 4100);

        } else if (style === 'fullscreen_attack') {
            // ── Full-screen 3D attack: gather → 3D sphere spin → explode ──
            var ATTACK_COUNT = settings.danmaku_count || 100;
            var W = window.innerWidth, H = window.innerHeight;
            var cx = W / 2, cy = H / 2;
            var DURATION = settings.danmaku_speed * 700; // speed 8 → 5600ms
            var T_GATHER  = 0.15;  // 15%  converge to center
            var T_SPIN    = 0.54;  // 54%  3D sphere rotation
            var T_EXPLODE = 0.31;  // 31%  fly outward

            var baseSize = settings.danmaku_font_size || 36;
            var baseOpacity = settings.danmaku_opacity;

            // ── Pre-compute all particle positions using Fibonacci sphere for even distribution ──
            var goldenRatio = (1 + Math.sqrt(5)) / 2;
            var particles = [];
            for (var a = 0; a < ATTACK_COUNT; a++) {
                // Fibonacci sphere on unit sphere → perfectly even distribution (no pole clustering)
                var fi = a / ATTACK_COUNT;
                var uy = 1 - 2 * fi;
                var rAtY = Math.sqrt(1 - uy * uy);
                var theta_fib = 2 * Math.PI * a / goldenRatio;
                var ux = rAtY * Math.cos(theta_fib);
                var uz = rAtY * Math.sin(theta_fib);
                // Surface: all particles at nearly same radius so sphere looks clean
                var baseR = settings.danmaku_sphere_radius || 400;
                var radius = baseR + (Math.random() - 0.5) * 40; // ±20 jitter
                var edge = Math.floor(Math.random() * 4);
                particles.push({
                    nx: ux, ny: uy, nz: uz,       // unit direction on sphere
                    sR: radius,
                    rotDir: Math.random() > 0.5 ? 1 : -1,
                    edge: edge,
                    explodeAngle: Math.random() * 2 * Math.PI,
                    explodeDist: 500 + Math.random() * 700,
                    explodeRise: (Math.random() - 0.5) * 400,
                    fontSize: Math.round(baseSize * (0.7 + Math.random() * 0.95)),
                });
            }

            // ── Start position from a random off-screen edge ──
            function startPos(edge) {
                if (edge === 0) return { x: -140 - Math.random() * 140, y: Math.random() * H };
                if (edge === 1) return { x: W + 140 + Math.random() * 140, y: Math.random() * H };
                if (edge === 2) return { x: Math.random() * W, y: -140 - Math.random() * 140 };
                return { x: Math.random() * W, y: H + 140 + Math.random() * 140 };
            }

            // ── Project 3D sphere point to 2D given a Y-axis rotation angle ──
            function spherePoint(p, rotAngle) {
                var r = p.sR;
                var cosA = Math.cos(rotAngle), sinA = Math.sin(rotAngle);
                // Rotate direction vector around Y axis
                var rx = r * p.nx, ry = r * p.ny, rz = r * p.nz;
                var xr =  rx * cosA + rz * sinA;
                var zr = -rx * sinA + rz * cosA;
                return { x: cx + xr, y: cy + ry, z: zr };
            }

            // ── Spawn particles ──
            for (var a = 0; a < ATTACK_COUNT; a++) {
                (function () {
                    var p = particles[a];
                    var el = document.createElement('div');
                    el.className = 'danmaku-attack';
                    el.textContent = text;
                    el.style.fontSize = p.fontSize + 'px';
                    el.style.backgroundImage = attackColors[Math.floor(Math.random() * attackColors.length)];
                    el.style['-webkit-text-stroke'] = '1.5px rgba(0,0,0,0.6)';
                    el.style.opacity = baseOpacity;
                    applyColor(el, settings.danmaku_color);

                    var sp = startPos(p.edge);
                    var sx = sp.x, sy = sp.y;

                    // ── Pre-compute keyframes ──
                    var frames = 90; // smoother with more rotations
                    var kf = [];
                    for (var i = 0; i <= frames; i++) {
                        var t = i / frames;
                        var x, y, sc = 1, deg = 0, op = baseOpacity;

                        if (t < T_GATHER) {
                            // Phase 1: edge → sphere + text shrinks to a dot (ease-in-out)
                            var pct = t / T_GATHER;
                            var ease = pct < 0.5 ? 2 * pct * pct : 1 - Math.pow(-2 * pct + 2, 2) / 2;
                            var sp3 = spherePoint(p, 0);
                            x = sx + (sp3.x - sx) * ease;
                            y = sy + (sp3.y - sy) * ease;
                            sc = 1 - ease * 0.99; // 1.0 → 0.01 shrink to near-invisible dot
                        } else if (t < T_GATHER + T_SPIN) {
                            // Phase 2: 3D sphere rotation (2 slow revolutions around Y axis)
                            var pct = (t - T_GATHER) / T_SPIN;
                            var rotAngle = p.rotDir * pct * Math.PI * 2; // 1 revolution (slow)
                            var sp3 = spherePoint(p, rotAngle);
                            x = sp3.x;
                            y = sp3.y;
                            // Tiny dots on sphere surface with depth variation
                            var zNorm = (sp3.z / (p.sR || 1) + 1) / 2; // 0..1
                            sc = 0.04 + 0.16 * zNorm;    // 0.04..0.20 — visible dots on sphere
                            op = baseOpacity * (0.08 + 0.92 * zNorm); // 0.08..1.00
                            deg = pct * p.rotDir * 720 * 3; // spin on own axis
                        } else {
                            // Phase 3: explode outward + text grows from dot to full size
                            var pct = (t - T_GATHER - T_SPIN) / T_EXPLODE;
                            var ease = 1 - Math.pow(1 - pct, 3);
                            var sp3 = spherePoint(p, p.rotDir * Math.PI * 4);
                            x = sp3.x + Math.cos(p.explodeAngle) * p.explodeDist * ease;
                            y = sp3.y + Math.sin(p.explodeAngle) * p.explodeDist * ease + p.explodeRise * ease;
                            deg = p.rotDir * 1080 + pct * p.rotDir * 360;
                            sc = 0.01 + 1.59 * ease;   // 0.01 → 1.60 text grows from dot
                            op = baseOpacity * (1 - pct * 0.5);
                        }

                        kf.push({
                            transform: 'translate(' + x + 'px, ' + y + 'px) rotate(' + deg + 'deg) scale(' + sc + ')',
                            opacity: op,
                            offset: t
                        });
                    }

                    el.animate(kf, { duration: DURATION, easing: 'linear', fill: 'forwards' });
                    layer.appendChild(el);
                    activeDanmaku.push(el);

                    setTimeout(function () { removeDanmaku(el); }, DURATION + 300);
                })();
            }
        } else {
            // scroll
            el.className = 'danmaku-scroll';
            el.textContent = text;
            el.style.fontSize = settings.danmaku_font_size + 'px';
            el.style.opacity = settings.danmaku_opacity;
            applyColor(el, settings.danmaku_color);

            // pick a random gradient + glow style so danmaku are visually varied
            var sg = scrollGradients[Math.floor(Math.random() * scrollGradients.length)];
            el.style.backgroundImage = sg.gradient;
            el.style.filter = sg.glow;

            // measure text width before positioning
            layer.appendChild(el);
            var textWidth = el.offsetWidth;
            var screenWidth = window.innerWidth;
            // distance to travel: from right edge to fully off left
            var scrollDistance = screenWidth + textWidth;

            var durationSec = settings.danmaku_speed;
            var durationMs = durationSec * 1000;

            // pick a lane
            var lane = findFreeLane(durationMs);
            var yPos = lane * LANE_HEIGHT + 8; // small top padding

            el.style.top = yPos + 'px';
            el.style.left = '0px';

            // set CSS variables for animation start and end positions
            el.style.setProperty('--scroll-start', screenWidth + 'px');
            el.style.setProperty('--scroll-distance', '-' + scrollDistance + 'px');

            // force reflow so CSS variables are applied before animation starts
            void el.offsetWidth;

            // start animation via shorthand (name duration timing fill)
            el.style.animation = 'danmaku-scroll-anim ' + durationSec + 's linear forwards';

            activeDanmaku.push(el);
            enforceQueueLimit();

            // auto-remove after animation
            el.addEventListener('animationend', function () {
                removeDanmaku(el);
            });
            // fallback timeout in case animationend doesn't fire
            setTimeout(function () {
                removeDanmaku(el);
            }, durationMs + 200);
        }
    };

    /**
     * Update a runtime setting.
     * @param {string} key   - 'danmaku_opacity' | 'danmaku_speed' | 'danmaku_font_size' | 'danmaku_count'
     * @param {*}      value
     */
    window.updateSetting = function (key, value) {
        if (!key || !(key in settings)) return;
        switch (key) {
            case 'danmaku_opacity':
                settings.danmaku_opacity = Math.max(0, Math.min(1, parseFloat(value)));
                break;
            case 'danmaku_speed':
                settings.danmaku_speed = Math.max(1, parseFloat(value));
                break;
            case 'danmaku_font_size':
                settings.danmaku_font_size = Math.max(8, parseInt(value, 10));
                break;
            case 'danmaku_count':
                settings.danmaku_count = Math.max(1, parseInt(value, 10));
                break;
            case 'danmaku_color':
                settings.danmaku_color = String(value);
                break;
            case 'danmaku_sphere_radius':
                settings.danmaku_sphere_radius = Math.max(50, Math.min(1200, parseInt(value, 10)));
                break;
            default:
                settings[key] = value;
        }
    };

    // ---- Load persisted settings from API ----
    function loadPersistedSettings() {
        try {
            if (window.pywebview && pywebview.api) {
                pywebview.api.get_settings().then(function (s) {
                    if (s.danmaku_opacity) updateSetting('danmaku_opacity', s.danmaku_opacity);
                    if (s.danmaku_speed)   updateSetting('danmaku_speed', s.danmaku_speed);
                    if (s.danmaku_font_size) updateSetting('danmaku_font_size', s.danmaku_font_size);
                    if (s.danmaku_count)   updateSetting('danmaku_count', s.danmaku_count);
                    if (s.danmaku_color)   updateSetting('danmaku_color', s.danmaku_color);
                    if (s.danmaku_sphere_radius) updateSetting('danmaku_sphere_radius', s.danmaku_sphere_radius);
                });
            }
        } catch (e) {}
    }

    // ---- Snooze bar ----
    var snoozeBar = document.getElementById('snooze-bar');
    var snoozeText = document.getElementById('snooze-text');
    var snoozeBtn = document.getElementById('snooze-btn');

    window.showSnoozeBar = function (reminderId, snoozeMinutes) {
        snoozeText.textContent = '弹幕将在 ' + snoozeMinutes + ' 分钟后再次提醒';
        snoozeBar.style.display = 'flex';
    };

    window.hideSnoozeBar = function () {
        snoozeBar.style.display = 'none';
    };

    snoozeBtn.addEventListener('click', function () {
        try {
            if (window.pywebview && pywebview.api) {
                pywebview.api.snooze_last_reminder();
            }
        } catch (e) {}
        // Also notify Python to re-enable click-through (in case API call failed)
        try {
            if (window.pywebview && pywebview.api) {
                pywebview.api.snooze_bar_hide();
            }
        } catch (e) {}
        snoozeBar.style.display = 'none';
    });

    // ---- Init ----
    computeLaneCount();
    window.addEventListener('resize', function () {
        computeLaneCount();
    });
    // Load persisted settings once the page is ready
    setTimeout(loadPersistedSettings, 300);
})();