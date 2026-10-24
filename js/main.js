/* ============================================================
   静默病栋 SILENT WARD — 主程序 main.js
   启动 / 渲染循环 / 场景与关卡管理 / UI / 存档 / 设置 / 调试
   ============================================================ */
(function () {
  'use strict';

  var T = THREE;
  var HW = window.HW;
  var STORY = window.HStory;
  var $ = function (id) { return document.getElementById(id); };
  var clamp = HW.util.clamp;
  var lerp = HW.util.lerp;

  var SAVE_KEY = 'silentward_save_v2';
  var SETTINGS_KEY = 'silentward_settings_v1';

  var QUALITY = {
    low: { dpr: 1.0, shadows: false, shadowSize: 512, anisoCap: 2, fov: 78 },
    medium: { dpr: 1.5, shadows: true, shadowSize: 1024, anisoCap: 4, fov: 75 },
    high: { dpr: 2.0, shadows: true, shadowSize: 2048, anisoCap: 8, fov: 75 }
  };

  var RUN_KEY = 'silentward_run_v1';
  var G = window.HGame = {
    run: 1,
    RUN_KEY: RUN_KEY,
    state: 'boot',         // boot | menu | intro | playing | paused | overlay | dead | ending
    chapterIdx: 0,
    scene: null,
    camera: null,
    renderer: null,
    player: null,
    level: null,
    entity: null,
    levelId: null,
    items: {},
    files: {},
    tapes: {},
    notesRead: {},
    objective: '',
    playTime: 0,
    settings: null,
    checkpoint: null,
    errors: [],
    debug: false,
    testMode: false,
    shotMode: false,
    quality: 'medium',
    fpsAvg: 60,
    _fpsT: 0,
    _fpsCount: 0,
    _interactT: 0,
    _currentHit: null,
    _promptVisible: false,
    _subQueue: [],
    _subTimer: null,
    _overlayOpen: null,
    _hintFadeT: 0,
    _menuT: 0
  };

  // 周目状态：默认第一周目；结束后写入 2；可用 ?run=1 / ?run=2 强制
  (function () {
    var q = /[?&]run=([12])/.exec(location.search);
    if (q) { try { localStorage.setItem(RUN_KEY, q[1]); } catch (e) {} }
    var v = 1;
    try { v = parseInt(localStorage.getItem(RUN_KEY) || '1', 10) || 1; } catch (e) { v = 1; }
    G.run = v >= 2 ? 2 : 1;
  })();

  /* ============================================================
     错误收集 & 调试
     ============================================================ */
  window.addEventListener('error', function (e) {
    G.errors.push(String(e.message) + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0));
    if (G.debug) {
      var el = $('error-overlay');
      el.classList.remove('hidden');
      el.textContent = 'JS ERROR:\n' + G.errors.join('\n') + '\n\n' + (e.error && e.error.stack ? e.error.stack : '');
    }
    try { updateDiag(); } catch (err) {}
  });
  window.addEventListener('unhandledrejection', function (e) {
    G.errors.push('Promise: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });

  function updateDiag() {
    if (!G.debug) return;
    var d = $('diag');
    d.classList.remove('hidden');
    var info = rendererInfo();
    d.textContent =
      'FPS ' + G.fpsAvg.toFixed(0) + '  | ' + (info.calls || 0) + ' calls  | ' + (info.tris || 0) + ' tris\n' +
      'state=' + G.state + '  chapter=' + G.chapterIdx + '  level=' + (G.levelId || '-') + '\n' +
      'pos=' + (G.player ? G.player.pos.x.toFixed(2) + ',' + G.player.pos.z.toFixed(2) : '-') +
      '  sanity=' + (G.player ? G.player.sanity.toFixed(2) : '-') +
      '  flashlight=' + (G.player && G.player.flashlightOn ? 'on' : 'off') + '\n' +
      'errors=' + G.errors.length + (G.errors.length ? ' :: ' + G.errors[G.errors.length - 1] : '');
  }
  function rendererInfo() {
    if (!G.renderer) return {};
    return { calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, fps: G.fpsAvg };
  }
  G.updateDiag = updateDiag;

  /* ============================================================
     设置
     ============================================================ */
  function defaultSettings() {
    return {
      sens: 1.0, fov: 75, brightness: 0.9, master: 0.8, ambient: 0.55, music: 0.55, sfx: 0.85,
      quality: 'auto', scare: 'normal', invert: false, shake: true, hints: true, fps: false
    };
  }
  function loadSettings() {
    var s = defaultSettings();
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        for (var k in o) if (o.hasOwnProperty(k)) s[k] = o[k];
      }
    } catch (e) {}
    return s;
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(G.settings)); } catch (e) {}
  }
  G.applySettings = function () {
    var s = G.settings;
    var q = s.quality === 'auto' ? (G.autoQuality || 'medium') : s.quality;
    G.quality = q;
    var conf = QUALITY[q] || QUALITY.medium;
    if (G.renderer) {
      var dpr = Math.min(window.devicePixelRatio || 1, conf.dpr);
      G.renderer.setPixelRatio(dpr);
      var shadowsChanged = G.renderer.shadowMap.enabled !== conf.shadows;
      G.renderer.shadowMap.enabled = conf.shadows;
      G.renderer.shadowMap.type = T.PCFSoftShadowMap;
      // 阴影开关切换后需要让材质重新编译，否则画面不会立即生效
      if (shadowsChanged && G.scene) {
        G.scene.traverse(function (o) {
          if (o.isMesh && o.material) {
            if (Array.isArray(o.material)) o.material.forEach(function (m) { m.needsUpdate = true; });
            else o.material.needsUpdate = true;
          }
        });
      }
    }
    if (G.player) {
      G.player.sensitivity = s.sens;
      G.player.invertY = s.invert;
      G.player.shakeEnabled = s.shake;
      G.player.fov = s.fov;
      G.player.shadows = conf.shadows;
      if (G.player.flashlight) {
        G.player.flashlight.shadow.mapSize.set(conf.shadowSize, conf.shadowSize);
        if (G.player.flashlight.shadow.map) {
          G.player.flashlight.shadow.map.dispose();
          G.player.flashlight.shadow.map = null;
        }
      }
    }
    if (G.camera) {
      G.camera.fov = s.fov;
      G.camera.updateProjectionMatrix();
    }
    if (G.renderer) {
      var baseExp = (G.level && G.level.ambient && G.level.ambient.exposure !== undefined) ? G.level.ambient.exposure : 0.9;
      G.renderer.toneMappingExposure = baseExp * (s.brightness || 1);
    }
    if (window.HA && HA.ready) {
      try {
        HA.setVolume('master', s.master);
        HA.setVolume('ambient', s.ambient);
        HA.setVolume('music', s.music);
        HA.setVolume('sfx', s.sfx);
      } catch (e) {}
    }
    $('hint-bar').style.display = s.hints ? '' : 'none';
    $('set-fps') && null;
  };

  function bindSettingsUI() {
    var s = G.settings;
    function setVal(id, v) { var el = $(id); if (el) el.textContent = v; }
    var map = [
      ['set-sens', 'sens', 'v-sens', function (v) { return Number(v).toFixed(2); }],
      ['set-brightness', 'brightness', 'v-brightness', function (v) { return Math.round(v * 100) + '%'; }],
      ['set-fov', 'fov', 'v-fov', function (v) { return Math.round(v); }],
      ['set-master', 'master', 'v-master', function (v) { return Math.round(v * 100) + '%'; }],
      ['set-ambient', 'ambient', 'v-ambient', function (v) { return Math.round(v * 100) + '%'; }],
      ['set-music', 'music', 'v-music', function (v) { return Math.round(v * 100) + '%'; }],
      ['set-sfx', 'sfx', 'v-sfx', function (v) { return Math.round(v * 100) + '%'; }]
    ];
    map.forEach(function (m) {
      var input = $(m[0]);
      if (!input) return;
      input.value = s[m[1]];
      setVal(m[2], m[3](s[m[1]]));
      input.addEventListener('input', function () {
        s[m[1]] = parseFloat(input.value);
        setVal(m[2], m[3](input.value));
        saveSettings();
        G.applySettings();
      });
    });
    $('#x') // noop
    var q = $('set-quality');
    if (q) { q.value = s.quality; q.addEventListener('change', function () { s.quality = q.value; G.autoQuality = null; saveSettings(); G.applySettings(); }); }
    var sc = $('set-scare');
    if (sc) { sc.value = s.scare; sc.addEventListener('change', function () { s.scare = sc.value; saveSettings(); }); }
    var inv = $('set-invert'); if (inv) { inv.checked = s.invert; inv.addEventListener('change', function () { s.invert = inv.checked; saveSettings(); G.applySettings(); }); }
    var shk = $('set-shake'); if (shk) { shk.checked = s.shake; shk.addEventListener('change', function () { s.shake = shk.checked; saveSettings(); G.applySettings(); }); }
    var hin = $('set-hints'); if (hin) { hin.checked = s.hints; hin.addEventListener('change', function () { s.hints = hin.checked; saveSettings(); G.applySettings(); }); }
    var fps = $('set-fps'); if (fps) { fps.checked = s.fps; fps.addEventListener('change', function () { s.fps = fps.checked; saveSettings(); updateDiag(); }); }
    var back = $('btn-settings-back');
    if (back) back.addEventListener('click', function () { showSettings(false); });
    var def = $('btn-settings-default');
    if (def) def.addEventListener('click', function () {
      G.settings = defaultSettings();
      G.applySettings(); saveSettings(); syncSettingsUI();
      G.toast('设置已恢复默认');
    });
  }
  function syncSettingsUI() {
    var s = G.settings;
    var pairs = [['set-sens', 'sens'], ['set-fov', 'fov'], ['set-brightness', 'brightness'], ['set-master', 'master'], ['set-ambient', 'ambient'], ['set-music', 'music'], ['set-sfx', 'sfx']];
    pairs.forEach(function (p) { var el = $(p[0]); if (el) el.value = s[p[1]]; });
    var map = [['set-sens', 'v-sens', function (v) { return Number(v).toFixed(2); }], ['set-fov', 'v-fov', function (v) { return Math.round(v); }], ['set-brightness', 'v-brightness', function (v) { return Math.round(v * 100) + '%'; }],
      ['set-master', 'v-master', function (v) { return Math.round(v * 100) + '%'; }], ['set-ambient', 'v-ambient', function (v) { return Math.round(v * 100) + '%'; }],
      ['set-music', 'v-music', function (v) { return Math.round(v * 100) + '%'; }], ['set-sfx', 'v-sfx', function (v) { return Math.round(v * 100) + '%'; }]];
    map.forEach(function (m) { var el = $(m[1]), inp = $(m[0]); if (el && inp) el.textContent = m[2](parseFloat(inp.value)); });
    var q = $('set-quality'); if (q) q.value = s.quality;
    var sc = $('set-scare'); if (sc) sc.value = s.scare;
    var inv = $('set-invert'); if (inv) inv.checked = s.invert;
    var shk = $('set-shake'); if (shk) shk.checked = s.shake;
    var hin = $('set-hints'); if (hin) hin.checked = s.hints;
    var fps = $('set-fps'); if (fps) fps.checked = s.fps;
  }

  function showSettings(on) {
    $('settings').classList.toggle('hidden', !on);
  }

  /* ============================================================
     渲染器 / 场景
  ============================================================ */
  function initRenderer() {
    var renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 1);
    $('viewport').appendChild(renderer.domElement);
    renderer.domElement.id = 'game-canvas';
    G.renderer = renderer;

    G.camera = new T.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 90);
    G.camera.rotation.order = 'YXZ';
    G.scene = new T.Scene();
    G.scene.add(G.camera);

    window.addEventListener('resize', function () {
      renderer.setSize(window.innerWidth, window.innerHeight);
      G.camera.aspect = window.innerWidth / window.innerHeight;
      G.camera.updateProjectionMatrix();
    });
  }

  function applyLevelAmbient(level) {
    var a = level.ambient;
    G.scene.fog = new T.FogExp2(a.fogColor, a.fogDensity);
    if (a.background !== undefined && a.background !== null) {
      G.scene.background = new T.Color(a.background);
    } else {
      G.scene.background = new T.Color(0x000000);
    }
    G.renderer.setClearColor(a.background !== undefined && a.background !== null ? a.background : 0x000000, 1);
    G.renderer.toneMappingExposure = (a.exposure !== undefined ? a.exposure : 0.9) * ((G.settings && G.settings.brightness) || 1);
    if (G.ambientLight) G.scene.remove(G.ambientLight);
    if (G.hemiLight) G.scene.remove(G.hemiLight);
    G.ambientLight = new T.AmbientLight(a.ambientColor, a.ambientIntensity);
    G.hemiLight = new T.HemisphereLight(a.hemiSky, a.hemiGround, a.hemiIntensity);
    G.scene.add(G.ambientLight);
    G.scene.add(G.hemiLight);
    G.scene.environment = HT.envMap;
    var conf = QUALITY[G.quality] || QUALITY.medium;
    G.renderer.shadowMap.enabled = conf.shadows;
    // 手电筒
    G.player.shadows = conf.shadows;
    if (G.player.flashlight) {
      G.player.flashlight.shadow.mapSize.set(conf.shadowSize, conf.shadowSize);
      G.player.flashlight.castShadow = conf.shadows;
      G.player.flashlight.shadow.bias = -0.0012;
    }
  }

  /* ============================================================
     关卡加载
  ============================================================ */
  var SPAWNS = {
    0: { x: -16.8, z: 4.35, yaw: 0 },
    1: { x: -16.8, z: 0.4, yaw: -Math.PI / 2 },
    2: { x: 12.5, z: 2.7, yaw: 0 },
    3: { x: 16.6, z: -2.6, yaw: Math.PI },
    4: { x: 0.8, z: 0, yaw: -Math.PI / 2 },
    5: { x: 0, z: 4.7, yaw: 0 }
  };
  function levelForChapter(idx) {
    if (idx >= 5) return 'white';
    if (idx === 4) return 'basement';
    return 'ward';
  }
  G.levelForChapter = levelForChapter;

  G.loadLevel = function (levelId, spawn, cb) {
    try {
      G._suppressPause = true;
      if (G.entity) { G.entity.dispose(); G.entity = null; }
      if (G.level) { G.level.dispose(); G.level = null; }
      G.scene = new T.Scene();
      G.scene.add(G.camera);
      G.levelId = levelId;
      G.level = HW.build(levelId, G.scene);
      G.entity = new HW.Entity(G.scene);
      G.entity.setLevel(G.level);
      G.entity.onCatch = function () { STORY.onCatch(); };
      G.entity.onVanish = function () {};
      applyLevelAmbient(G.level);
      var sp = spawn || G.level.playerSpawn;
      G.player.setLevel(G.level, sp);
      G.player.pos.set(sp.x, 0, sp.z);
      G.player.yaw = sp.yaw || 0;
      G.player.pitch = 0;
      G.player.eyeHeight = 1.62;
      G.player.setEnabled(true);
      G.player.setPaused(false);
      // 章节切换/电梯/白房过场时不要主动释放指针锁定，否则会触发"自动暂停"
      if (G.state !== 'playing') G.player.releaseLock();
      G.player._applyCamera(0);
      G._suppressPause = false;
      $('chapter-tag').textContent = '';
      if (cb) cb();
    } catch (e) {
      G._suppressPause = false;
      G.errors.push('loadLevel: ' + e.message);
      console.error(e);
      if (G.debug) {
        var el = $('error-overlay');
        el.classList.remove('hidden');
        el.textContent = 'LOAD ERROR: ' + e.message + '\n' + (e.stack || '');
      }
    }
  };

  // 根据存档标记恢复关卡状态
  G.restoreLevelState = function () {
    var L = G.level;
    if (!L) return;
    var st = STORY.flags;
    if (L.id === 'ward') {
      L.unlockDoor('door302');
      if (st.noted) L.unlockDoor('door302');
      if (st.powerOn) {
        L.setCircuit('corridor', true);
        L.setCircuit('ward', true);
        L.setCircuit('hall', true);
      }
      if (st.pharmacyOpen) { L.unlockDoor('doorPharmacy'); }
      if (st.elevatorUsed) { /* 已到过地下 */ }
    }
    if (L.id === 'basement') {
      if (st.b1PowerOn) {
        L.setCircuit('main', true);
        L.setCircuit('morgue', true);
        L.setCircuit('cold', true);
        L.unlockDoor('doorMorgue');
        L.unlockDoor('doorCold');
      }
    }
    // 已经撬开的旧货运梯木板，重进三楼时不要重新出现
    if (L.id === 'ward' && STORY.flags && STORY.flags.boardsPried && L.story && L.story.oldBoards) {
      L.story.oldBoards.forEach(function (m) { if (m && m.parent) m.parent.remove(m); });
    }
    // 移除已拾取物品 / 已读文件
    var toRemove = [];
    L.interactables.forEach(function (it) {
      if (it.kind === 'pickup') {
        var itemId = (it.data && it.data.itemId) || it.id;
        if (G.items[itemId]) toRemove.push(it.id);
      } else if (it.kind === 'file' && G.files[it.id]) {
        toRemove.push(it.id);
      } else if (it.kind === 'tape' && G.tapes[it.id]) {
        // 磁带可以重复播放，不移除
      } else if (it.kind === 'note' && G.notesRead[it.id]) {
        // 纸条保留
      }
    });
    toRemove.forEach(function (id) { L.removeInteractable(id); });
    // 手电
    if (G.items.flashlight) G.player.giveFlashlight();
  };

  /* ============================================================
     HUD / UI
     ============================================================ */
  var UI = {
    hud: null, objective: null, prompt: null, subtitle: null, toast: null,
    crosshair: null, battery: null, sanity: null, stamina: null, hintbar: null
  };
  function initUI() {
    UI.hud = $('hud');
    UI.objText = document.querySelector('#objective .obj-text');
    UI.prompt = $('prompt');
    UI.pText = document.querySelector('#prompt .p-text');
    UI.subtitle = $('subtitle');
    UI.toast = $('toast');
    UI.crosshair = $('crosshair');
    UI.battery = document.querySelector('#flashlight-status .battery');
    UI.batteryFill = document.querySelector('#flashlight-status .battery i');
    UI.sanity = document.querySelector('#sanity-meter .sanity-track i');
    UI.stamina = document.querySelector('#stamina-meter i');
  }

  G.setObjective = function (text) {
    G.objective = text;
    if (!UI.objText) return;
    UI.objText.style.opacity = '0';
    UI.objText.textContent = text;
    requestAnimationFrame(function () { UI.objText.style.opacity = '1'; });
    UI.objText.style.transition = 'opacity .5s';
  };

  G.toast = function (text, dur) {
    if (!UI.toast) return;
    UI.toast.textContent = text;
    UI.toast.classList.remove('hidden');
    UI.toast.style.opacity = '1';
    clearTimeout(UI._toastT);
    UI._toastT = setTimeout(function () {
      UI.toast.style.opacity = '0';
      UI._toastT2 = setTimeout(function () { UI.toast.classList.add('hidden'); }, 600);
    }, (dur || 3) * 1000);
  };

  G.subtitleDur = function (text, dur) {
    // 按字数给停留时间；比之前更短一些，避免长时间压屏
    var n = String(text || '').length;
    var byText = 3.0 + n * 0.12;
    var byDur = dur ? dur * 1.2 : 0;
    return Math.max(3.2, byText, byDur);
  };
  G.subtitle = function (text, dur, opts) {
    opts = opts || {};
    G._subQueue.push({ text: text, dur: G.subtitleDur(text, dur), opts: opts });
    if (!G._subTimer) playNextSubtitle();
  };
  // 逐句播放一串台词，全部读完后执行回调
  G.tellLines = function (lines, done) {
    var i = 0;
    function next() {
      if (i >= lines.length) { if (done) done(); return; }
      var L = lines[i++];
      var text = (L && L.text !== undefined) ? L.text : L;
      var opts = (L && L.opts) || {};
      var d = G.subtitleDur(text, L && L.dur);
      G.subtitle(text, d, opts);
      G.after(d + 0.95, next);
    }
    next();
  };
  G._subToken = 0;
  G._subShowing = false;
  function playNextSubtitle() {
    if (!G._subQueue.length) { G._subTimer = null; return; }
    var item = G._subQueue.shift();
    var el = UI.subtitle;
    var token = ++G._subToken;
    var html = '';
    if (item.opts.speaker) html += '<span class="spk">' + item.opts.speaker + '</span>';
    html += item.text;
    el.innerHTML = html;
    el.classList.remove('hidden', 'whisper');
    if (item.opts.whisper) el.classList.add('whisper');
    G._subShowing = true;
    // 慢慢浮现
    el.style.transition = 'opacity 0.75s ease';
    el.style.opacity = '0';
    void el.offsetWidth;
    requestAnimationFrame(function () {
      if (token === G._subToken) el.style.opacity = '1';
    });
    // 停留足够久后慢慢消失
    G._subTimer = setTimeout(function () {
      if (token !== G._subToken) return;
      el.style.opacity = '0';
      G._subTimer = setTimeout(function () {
        if (token !== G._subToken) return;
        el.classList.add('hidden');
        G._subShowing = false;
        G._subTimer = setTimeout(function () {
          if (token === G._subToken) playNextSubtitle();
        }, 700);
      }, 850);
    }, item.dur * 1000);
  }
  G.clearSubtitle = function () {
    G._subQueue = [];
    G._subShowing = false;
    G._subToken = (G._subToken || 0) + 1;
    if (G._subTimer) { clearTimeout(G._subTimer); G._subTimer = null; }
    if (UI.subtitle) {
      UI.subtitle.style.transition = 'opacity .3s ease';
      UI.subtitle.style.opacity = '0';
      UI.subtitle.classList.add('hidden');
    }
  };

  G.whenSubtitlesIdle = function (cb) {
    var check = function () {
      if (!G._subQueue.length && !G._subShowing) cb();
      else setTimeout(check, 350);
    };
    check();
  };

  G.chapterCard = function (num, name, cb) {
    var card = $('chapter-card');
    card.querySelector('.chapter-num').textContent = num + ' · 仁 和 医 院 东 翼';
    card.querySelector('.chapter-name').textContent = name;
    card.classList.remove('hidden');
    requestAnimationFrame(function () { card.classList.add('show'); });
    if (cb) setTimeout(cb, 1300);
    setTimeout(function () {
      card.classList.remove('show');
      setTimeout(function () { card.classList.add('hidden'); }, 1000);
    }, 3400);
  };

  G.fadeTo = function (black, ms, cb) {
    var fade = $('fade');
    if (black) { fade.classList.add('on'); }
    else { fade.classList.remove('on'); }
    if (cb) setTimeout(cb, ms || 800);
  };

  G.cinema = function (on) {
    $('cinema').classList.toggle('on', !!on);
  };

  G.lockPlayer = function (lock) {
    if (!G.player) return;
    G.player.setEnabled(!lock);
    G.cinema(lock);
  };

  G.shake = function (amp, dur) {
    if (G.player) G.player.triggerShake(amp, dur);
  };
  G.addSanity = function (v) {
    if (G.player) G.player.addSanity(v);
    G._sanityPulse = 1;
  };
  G.setSanity = function (v) {
    if (G.player) G.player.sanity = clamp(v, 0, 1);
  };

  /* ---------------- 便签/文件阅读 ---------------- */
  G.showNote = function (data, cb) {
    G.openOverlay('note');
    var ov = $('note-overlay');
    ov.classList.remove('hidden');
    ov.querySelector('.note-title').textContent = (data.type ? data.type + ' · ' : '') + (data.title || '');
    ov.querySelector('.note-body').textContent = data.body || '';
    var close = function (e) {
      if (e && e.type === 'keydown' && e.code !== 'KeyE' && e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'Space') return;
      ov.classList.add('hidden');
      ov.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
      G.closeOverlay();
      if (window.HA && HA.ready) { try { HA.sfx('paper_slide', { volume: 0.4 }); } catch (err) {} }
      if (cb) cb();
    };
    ov.addEventListener('click', close);
    document.addEventListener('keydown', close);
  };

  /* ---------------- 录音带 ---------------- */
  G._tapeStop = null;
  G._tapeLoopId = 0;
  G.showTape = function (data, onEnd) {
    // 如果上一盘还在播放，先彻底结束（避免声音叠加）
    if (G._tapeStop) { try { G._tapeStop(true); } catch (e) {} G._tapeStop = null; }
    if (G._overlayOpen === 'tape') { $('tape-overlay').classList.add('hidden'); G._overlayOpen = null; if (G.state === 'overlay') G.state = 'playing'; }
    G.openOverlay('tape');
    var ov = $('tape-overlay');
    ov.classList.remove('hidden');
    ov.querySelector('.tape-name').textContent = (data.type || '') + ' · ' + (data.title || '');
    var wave = $('tape-wave');
    wave.innerHTML = '';
    for (var i = 0; i < 48; i++) {
      var bar = document.createElement('i');
      bar.style.animationDelay = (Math.random() * 0.9).toFixed(2) + 's';
      bar.style.height = (4 + Math.random() * 46) + 'px';
      wave.appendChild(bar);
    }
    var linesEl = $('tape-lines');
    linesEl.innerHTML = '';
    var timer = ov.querySelector('.tape-time') || ov.querySelector('.tape-name');
    var t = 0, idx = 0, stopped = false;
    var timers = [], tick = null, loopId = 0;

    function clearTimers() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
      if (tick) { clearInterval(tick); tick = null; }
    }
    function schedule(fn, ms) {
      var id = setTimeout(function () { if (!stopped) fn(); }, ms);
      timers.push(id);
      return id;
    }
    function finish(silent) {
      if (stopped) return;
      stopped = true;
      clearTimers();
      if (window.HA && HA.ready) {
        try {
          if (loopId) HA.stopLoop(loopId, 0.35);
          if (G._tapeLoopId) { HA.stopLoop(G._tapeLoopId, 0.35); G._tapeLoopId = 0; }
          loopId = 0;
          if (!silent) HA.sfx('tape_stop', { volume: 0.5 });
        } catch (e) {}
      }
      ov.classList.add('hidden');
      ov.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      G._tapeStop = null;
      G.closeOverlay();
      if (!silent && onEnd) onEnd();
    }
    G._tapeStop = finish;
    ov.classList.remove('hidden');
    if (window.HA && HA.ready) {
      try {
        if (G._tapeLoopId) { HA.stopLoop(G._tapeLoopId, 0.05); G._tapeLoopId = 0; }
        G._tapeLoopId = HA.startLoop('tape_loop', { volume: 0.22 });
        loopId = G._tapeLoopId;
        HA.duck(2.0);
        HA.sfx('tape_play');
      } catch (e) {}
    }
    var showNext = function () {
      if (stopped) return;
      if (idx >= data.lines.length) { schedule(function () { finish(); }, 900); return; }
      var line = data.lines[idx++];
      var div = document.createElement('div');
      div.className = 'tape-line' + (line.noise ? ' noise' : '');
      div.innerHTML = (line.who ? '<span class="who">' + line.who + '</span>' : '') + line.text;
      linesEl.appendChild(div);
      requestAnimationFrame(function () { div.classList.add('on'); });
      if (linesEl.children.length > 6) linesEl.removeChild(linesEl.firstChild);
      schedule(showNext, 1400 + line.text.length * 48);
    };
    function onClick() { finish(); }
    function onKey(e) {
      if (e.code === 'KeyE' || e.code === 'Escape' || e.code === 'Space') { e.preventDefault(); finish(); }
    }
    ov.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    tick = setInterval(function () {
      t += 0.5;
      var mm = String(Math.floor(t / 60)).padStart(2, '0');
      var ss = String(Math.floor(t % 60)).padStart(2, '0');
      timer.textContent = mm + ':' + ss;
    }, 500);
    showNext();
  };

  /* ---------------- 密码键盘 ---------------- */
  G.openKeypad = function (cfg) {
    G.openOverlay('keypad');
    var ov = $('keypad-overlay');
    ov.classList.remove('hidden');
    var dotsEl = $('keypad-dots');
    var hintEl = $('keypad-hint');
    var code = cfg.code || '0312';
    var input = '';
    var tries = 0;
    var panel = ov.querySelector('.keypad');
    hintEl.textContent = cfg.hint || '';
    function render() {
      dotsEl.textContent = input.split('').join(' ') + (input.length < 4 ? ' ' + '_'.repeat(4 - input.length).split('').join(' ') : '');
    }
    render();
    var close = function () {
      ov.classList.add('hidden');
      document.removeEventListener('keydown', onKey);
      ov.removeEventListener('click', onPanelClick);
      G.closeOverlay();
    };
    var correct = function () {
      if (window.HA && HA.ready) { try { HA.sfx('keypad_ok'); } catch (e) {} }
      close();
      if (cfg.onSuccess) cfg.onSuccess();
    };
    var wrong = function () {
      tries++;
      if (window.HA && HA.ready) { try { HA.sfx('keypad_err'); } catch (e) {} }
      hintEl.textContent = '密码错误。';
      panel.classList.add('shake');
      setTimeout(function () { panel.classList.remove('shake'); }, 400);
      input = '';
      render();
      if (cfg.onFail) cfg.onFail(tries);
    };
    var press = function (k) {
      if (k === 'C') { input = ''; render(); return; }
      if (k === 'E') {
        if (input.length < 4) { hintEl.textContent = '请输入四位数字。'; return; }
        if (input === code) correct(); else wrong();
        return;
      }
      if (input.length >= 4) return;
      input += k;
      render();
      if (window.HA && HA.ready) { try { HA.sfx('keypad_beep', { volume: 0.4 }); } catch (e) {} }
      if (input.length === 4) setTimeout(function () { if (input === code) correct(); }, 260);
    };
    var onPanelClick = function (e) {
      var btn = e.target.closest('button[data-k]');
      if (!btn) return;
      press(btn.getAttribute('data-k'));
    };
    var onKey = function (e) {
      if (e.code === 'Escape') { close(); return; }
      if (e.code.indexOf('Digit') === 0) { press(e.code.slice(5)); return; }
      if (e.code === 'Numpad' + e.code.slice(-1)) { press(e.code.slice(-1)); return; }
      if (e.code === 'Backspace') { input = input.slice(0, -1); render(); return; }
      if (e.code === 'Enter') press('E');
    };
    ov.addEventListener('click', onPanelClick);
    document.addEventListener('keydown', onKey);
  };

  /* ---------------- 选择 ---------------- */
  G.showChoice = function (cfg, cb) {
    G.openOverlay('choice');
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'choice-overlay';
    var inner = document.createElement('div');
    inner.style.cssText = 'text-align:center;padding:30px;max-width:640px;pointer-events:auto';
    var title = document.createElement('div');
    title.textContent = cfg.title || '你要怎么做？';
    title.style.cssText = 'font:30px/1.4 "STZhongsong","SimSun",serif;letter-spacing:.3em;color:#dbe6df;margin-bottom:14px';
    inner.appendChild(title);
    if (cfg.desc) {
      var desc = document.createElement('div');
      desc.textContent = cfg.desc;
      desc.style.cssText = 'font-size:13px;color:#8fa39b;letter-spacing:.1em;margin-bottom:34px';
      inner.appendChild(desc);
    }
    (cfg.options || []).forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.display = 'block';
      btn.style.margin = '12px auto';
      btn.style.minWidth = '340px';
      btn.innerHTML = opt.label + (opt.desc ? '<div style="font-size:11px;color:#7d918a;letter-spacing:.05em;margin-top:6px">' + opt.desc + '</div>' : '');
      btn.addEventListener('click', function () {
        document.body.removeChild(ov);
        G.closeOverlay();
        if (window.HA && HA.ready) { try { HA.sfx('ui_click'); } catch (e) {} }
        if (cb) cb(opt.id);
      });
      inner.appendChild(btn);
    });
    ov.appendChild(inner);
    document.body.appendChild(ov);
  };

  /* ---------------- 遮罩状态 ---------------- */
  G.openOverlay = function (kind) {
    G._overlayOpen = kind;
    if (G.state === 'playing') {
      G.state = 'overlay';
      if (G.player) { G.player.setPaused(true); G.player.releaseLock(); }
    }
  };
  G.showLockHint = function () {
    var hint = document.getElementById('lock-hint');
    if (!hint) return;
    var canvas = document.getElementById('game-canvas');
    var locked = document.pointerLockElement === canvas;
    if (locked || G.state !== 'playing') {
      hint.classList.add('hidden');
    } else {
      hint.classList.remove('hidden');
    }
  };
  G.openFloorMenu = function (cfg) {
    cfg = cfg || {};
    var menu = document.getElementById('floor-menu');
    var list = document.getElementById('floor-list');
    var sub = document.getElementById('floor-sub');
    if (!menu || !list) return;
    if (sub) sub.textContent = cfg.subtitle || '选择要去的楼层';
    list.innerHTML = '';
    (cfg.options || []).forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'floor-btn';
      btn.innerHTML = '<span>' + opt.label + '</span>' + (opt.hint ? '<em>' + opt.hint + '</em>' : '');
      btn.disabled = !opt.enabled;
      btn.addEventListener('click', function () {
        if (!opt.enabled) return;
        G.closeFloorMenu();
        if (G._floorPick) G._floorPick(opt.id);
      });
      list.appendChild(btn);
    });
    menu.classList.remove('hidden');
    if (G.state === 'playing' && G.player) {
      G.state = 'overlay';
      G._overlayOpen = 'floor';
      G.player.setPaused(true);
      G.player.releaseLock();
    }
  };
  G.closeFloorMenu = function () {
    var menu = document.getElementById('floor-menu');
    if (menu) menu.classList.add('hidden');
    if (G.state === 'overlay' && G._overlayOpen === 'floor') {
      G._overlayOpen = null;
      G.state = 'playing';
      if (G.player) { G.player.setPaused(false); G.player.requestLock(document.getElementById('game-canvas')); }
      G.showLockHint();
    }
  };
  G.closeOverlay = function () {
    G._overlayOpen = null;
    if (G.state === 'overlay') {
      G.state = 'playing';
      if (G.player) {
        G.player.setPaused(false);
        G.player.setEnabled(true);
        G.player.requestLock($('game-canvas'));
      }
      G.showLockHint();
      setTimeout(function () {
        if (G.state === 'playing' && G.player && G.player.locked) $('lock-hint').classList.add('hidden');
      }, 220);
    }
  };

  /* ---------------- Jump Scare ---------------- */
  var scareTime = 0;
  G.playJumpScare = function (kind, opts) {
    opts = opts || {};
    var el = $('jumpscare');
    var canvas = $('scare-canvas');
    var soft = G.settings && G.settings.scare === 'soft';
    var isFlash = kind === 'flash';
    var faceKind = kind === 'stitched' ? 'stitched' : (kind === 'mirror' ? 'stitched' : 'face');
    if (!isFlash) try {
      var face = HT.face(faceKind);
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // 随机偏移/缩放，避免重复感
      var zoom = 1 + Math.random() * 0.22;
      var ox = (Math.random() - 0.5) * 120;
      ctx.save();
      ctx.translate(canvas.width / 2 + ox, canvas.height / 2 + (Math.random() - 0.5) * 80);
      ctx.scale(zoom, zoom);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      ctx.drawImage(face, 0, 0);
      ctx.restore();
    } catch (e) {}
    if (!isFlash) {
      el.classList.remove('hidden', 'shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
    if (window.HA && HA.ready && !opts.silent) {
      try {
        var style = kind === 'mirror' ? 'mirror' : (kind === 'stitched' ? 'reveal' : (kind === 'slam' || kind === 'flash' ? 'slam' : 'face'));
        HA.jumpScare(style);
      } catch (e) {}
    }
    var fl = $('light-flash');
    fl.style.opacity = soft ? '0.25' : '0.95';
    setTimeout(function () { fl.style.opacity = '0'; }, 110);
    if (G.player) G.player.triggerShake(soft ? 0.05 : 0.11, 0.7);
    var t = opts.duration || 0.9;
    clearTimeout(scareTime);
    scareTime = setTimeout(function () {
      el.classList.add('hidden');
      el.classList.remove('shake');
    }, t * 1000);
  };

  /* ---------------- 物品 / 档案 ---------------- */
  G.giveItem = function (id, name) {
    G.items[id] = true;
    if (window.HA && HA.ready) { try { HA.sfx('pickup_item', { volume: 0.6 }); } catch (e) {} }
  };
  G.hasItem = function (id) { return !!G.items[id]; };
  G.setFlag = function (k, v) {
    if (STORY && STORY.flags) STORY.flags[k] = v;
  };
  G.getFlag = function (k) {
    return (STORY && STORY.flags) ? STORY.flags[k] : undefined;
  };
  G.collectFile = function (id) {
    var first = !G.files[id];
    G.files[id] = true;
    if (first && window.HA && HA.ready) { try { HA.sfx('paper_slide', { volume: 0.5 }); } catch (e) {} }
    var title = (STORY.FILES[id] && STORY.FILES[id].title) ? STORY.FILES[id].title : '病历';
    G.toast('病历 ' + G.fileCount() + ' / ' + Object.keys(STORY.FILES).length + '：' + title + '（Tab 查看）', 4);
  };
  G.collectTape = function (id) {
    G.tapes[id] = true;
  };
  G.markNote = function (id) {
    G.notesRead[id] = true;
  };
  G.fileCount = function () {
    var n = 0;
    for (var k in G.files) if (G.files[k] && STORY.FILES[k]) n++;
    return n;
  };

  /* ---------------- 实体控制 ---------------- */
  G.spawnEntityScript = function (opts) {
    if (!G.entity) return;
    G.entity.scriptAppear(opts);
  };
  G.setEntityPosition = function (x, z) {
    if (G.entity) { G.entity.pos.set(x, 0, z); G.entity.group.position.set(x, 0, z); }
  };
  G.despawnEntity = function () {
    if (G.entity) G.entity.despawn();
    if (G.player) G.player.danger = 0;
  };
  G.startChase = function (opts) {
    if (!G.entity) return;
    opts = opts || {};
    G.entity.startChase(opts);
    if (G.player) G.player.danger = 1;
  };
  G.stopChase = function () {
    if (G.entity) G.entity.stopChase();
    if (G.player) G.player.danger = 0;
    if (G.chapterIdx === 4 && window.HA && HA.ready) { try { HA.setMusicMode('abyss', 2.0); } catch (e) {} }
  };
  G.isChasing = function () {
    return !!(G.entity && G.entity.isActive() && G.entity.state === 'chase');
  };
  G.entityDistance = function () {
    if (!G.entity || !G.player) return 99;
    return Math.hypot(G.entity.pos.x - G.player.pos.x, G.entity.pos.z - G.player.pos.z);
  };
  G.entityOpenDoorSoon = function () {
    var self = this;
    setTimeout(function () {
      if (G.entity && G.entity.isActive()) G.entity._tryOpenDoor();
    }, 500);
  };
  G.removeInteractable = function (id) {
    if (G.level) G.level.removeInteractable(id);
  };
  G.isPaused = function () { return G.state !== 'playing'; };
  G.isLookingAt = function (x, y, z, fov) {
    if (!G.player) return false;
    var cam = G.camera;
    var v = new T.Vector3(x, y, z).sub(cam.position);
    var len = v.length();
    if (len > 14) return false;
    v.normalize();
    var dir = new T.Vector3(0, 0, -1).applyEuler(cam.rotation);
    var dot = v.dot(dir);
    return dot > Math.cos((fov || 30) * Math.PI / 180);
  };
  G.after = function (delay, fn) {
    // 自动测试模式下加速剧情计时器（无头虚拟时间中 rAF 帧数不足以推进长计时器）
    STORY._after(delay * (G.autoMode ? 0.1 : 1), fn);
  };

  /* ---------------- 音乐/环境音 ---------------- */
  G.setAmbience = function (p) {
    if (window.HA && HA.ready) { try { HA.setAmbience(p); } catch (e) {} }
  };
  G.setMusic = function (m) {
    if (window.HA && HA.ready) { try { HA.setMusicMode(m); } catch (e) {} }
  };

  /* ============================================================
     死亡 / 结局
  ============================================================ */
  G.killPlayer = function () {
    if (G.state === 'dead') return;
    G.state = 'dead';
    G.stopChase();
    if (G.player) { G.player.setEnabled(false); G.player.releaseLock(); G.player.addSanity(-0.3); }
    // 地下一层：不要 jump scare / 死亡界面，直接回最近的检查点重来
    if (G.chapterIdx === 4) {
      $('death-screen').classList.add('hidden');
      $('blood-flash').style.opacity = '0';
      if (window.HA && HA.ready) { try { HA.setMusicMode('none', 0.6); } catch (e) {} }
      setTimeout(function () {
        G.retry();
        G.toast('……它把你拖回了记忆的起点。', 3.5);
      }, 320);
      return;
    }
    G.playJumpScare('face', { duration: 1.5 });
    if (window.HA && HA.ready) { try { HA.jumpScare('grab'); HA.setMusicMode('none', 0.5); } catch (e) {} }
    $('blood-flash').style.opacity = '1';
    setTimeout(function () {
      $('blood-flash').style.opacity = '0';
      $('death-screen').classList.remove('hidden');
      var tip = '';
      if (G.chapterIdx === 4) tip = '追逐中不要停下。关门可以拖住它一会儿。';
      else if (G.chapterIdx === 3) tip = '不要盯着镜子看太久。';
      else tip = '黑暗里，它会靠声音找到你。';
      $('death-tip').textContent = tip;
    }, 1500);
  };

  G.showEnding = function (id) {
    G.state = 'ending';
    var e = STORY.ENDINGS[id] || STORY.ENDINGS.loop;
    if (G.player) { G.player.releaseLock(); G.player.setEnabled(false); }
    $('hud').classList.add('hidden');
    $('cinema').classList.remove('on');
    $('ending-screen').classList.remove('hidden');
    $('ending-title').textContent = e.label + ' · ' + e.title;
    $('ending-body').textContent = e.body;
    var mins = Math.floor(G.playTime / 60);
    var n = G.fileCount();
    var total = Object.keys(STORY.FILES).length;
    var tapeCount = 0;
    for (var k in G.tapes) if (G.tapes[k]) tapeCount++;
    var firstRunLoop = (id === 'loop' && G.run === 1);
    if (firstRunLoop) {
      G.run = 2;
      try { localStorage.setItem(RUN_KEY, '2'); } catch (e) {}
    }
    var note = (id === 'hidden')
      ? '你找到了那条没有写在疏散图上的路。'
      : (firstRunLoop ? '第一周目结束。窗口外面，天还没有亮。'
        : (n >= 6 ? '你找到了足够的真相。' : '你还没有找到足够的真相——也许下一次。'));
    var EK = 'silentward_endings_v1';
    var prog = {};
    try { prog = JSON.parse(localStorage.getItem(EK) || '{}') || {}; } catch (e) { prog = {}; }
    prog[id] = true;
    try { localStorage.setItem(EK, JSON.stringify(prog)); } catch (e) {}
    var endingNames = { truth: '真相', escape: '逃离', loop: '循环', hidden: '回家' };
    var allEndings = Object.keys(endingNames);
    var doneCount = allEndings.filter(function (k) { return !!prog[k]; }).length;
    var missing = allEndings.filter(function (k) { return !prog[k]; }).map(function (k) { return endingNames[k]; });
    var progressHtml = '<br><span style="color:#7f948c">结局收集：' + doneCount + ' / ' + allEndings.length + '</span>' +
      (missing.length ? '<br><span style="color:#4f5f58">还没看到：' + missing.join('、') + '</span>' : '<br><span style="color:#8fb8a6">所有结局都已见过。</span>');
    if (firstRunLoop) progressHtml += '<br><span style="color:#6f8a80">再次醒来时，医院不会像这一次一样安静。</span>';
    $('ending-stats').innerHTML =
      '游玩时长 ' + mins + ' 分钟　·　收集病历 ' + n + ' / ' + total + '　·　录音 ' + tapeCount + ' / ' + Object.keys(STORY.TAPES).length +
      '<br><span style="color:#4f5f58">' + note + '</span>' + progressHtml;
    $('btn-ending-menu').textContent = firstRunLoop ? '再次醒来' : '返回主菜单';
    G._endingNextRun = firstRunLoop;
    if (window.HA && HA.ready) {
      try {
        HA.setAmbience('none', 1.5);
        HA.setMusicMode((id === 'truth' || id === 'hidden') ? 'ending_good' : 'ending_bad', 2.0);
      } catch (err) {}
    }
    try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
    updateMenuContinue();
  };

  /* ============================================================
     存档 / 检查点
     ============================================================ */
  G.saveCheckpoint = function () {
    var save = {
      chapterIdx: STORY.chapterIdx,
      flags: JSON.parse(JSON.stringify(STORY.flags || {})),
      items: JSON.parse(JSON.stringify(G.items)),
      files: JSON.parse(JSON.stringify(G.files)),
      tapes: JSON.parse(JSON.stringify(G.tapes)),
      notesRead: JSON.parse(JSON.stringify(G.notesRead)),
      playTime: G.playTime,
      run: G.run,
      time: Date.now()
    };
    G.checkpoint = save;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
    updateMenuContinue();
  };
  G.loadCheckpoint = function () {
    var save = G.checkpoint;
    if (!save) {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (raw) save = JSON.parse(raw);
      } catch (e) {}
    }
    return save;
  };

  function restoreFromSave(save, cb) {
    // 继续游戏 = 继续当前周目；旧存档没有 run 字段时按二周目处理
    if (save.run === 1 || save.run === 2) G.run = save.run;
    else G.run = 2;
    try { localStorage.setItem(RUN_KEY, String(G.run)); } catch (e) {}
    G.items = save.items || {};
    G.files = save.files || {};
    G.tapes = save.tapes || {};
    G.notesRead = save.notesRead || {};
    G.playTime = save.playTime || 0;
    STORY.applySave(save);
    var idx = save.chapterIdx || 0;
    G.chapterIdx = idx;
    var levelId = levelForChapter(idx);
    var spawn = SPAWNS[idx] || { x: 0, z: 0, yaw: 0 };
    if (idx === 4 && save.flags && save.flags.chaseStarted) spawn = { x: 10.0, z: 0, yaw: -Math.PI / 2 };
    $('loading').classList.remove('hidden');
    $('load-tip').textContent = '正在回到病栋……';
    G.loadLevel(levelId, spawn, function () {
      G.restoreLevelState();
      $('loading').classList.add('hidden');
      STORY.startChapter(idx, true);
      G.state = 'playing';
      $('hud').classList.remove('hidden');
      G.showLockHint();
      G.setMusic(idx === 4 ? 'abyss' : (idx >= 5 ? 'white' : 'explore'));
      if (cb) cb();
    });
  }

  G.retry = function () {
    $('death-screen').classList.add('hidden');
    var save = G.loadCheckpoint();
    if (!save) {
      G.startNewGame();
      return;
    }
    G.fadeTo(true, 500, function () {
      restoreFromSave(save, function () { G.fadeTo(false, 900); });
    });
  };

  G.continueGame = function () {
    var save = G.loadCheckpoint();
    if (!save) { G.toast('没有可用的存档'); return; }
    startPlaying();
    $('loading').classList.remove('hidden');
    $('load-tip').textContent = '正在读取存档……';
    setTimeout(function () {
      restoreFromSave(save, function () {
        $('fade').classList.remove('on');
      });
    }, 100);
  };

  G.startFirstRun = function () {
    try { localStorage.setItem(RUN_KEY, '1'); } catch (e) {}
    G.run = 1;
    G.startNewGame();
  };
  G.startSecondRun = function () {
    try { localStorage.setItem(RUN_KEY, '2'); } catch (e) {}
    G.run = 2;
    G.startNewGame();
  };
  G.startNewGame = function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    G.items = {}; G.files = {}; G.tapes = {}; G.notesRead = {};
    G._fileShown = -1;
    G.playTime = 0;
    STORY.flags = {};
    G.checkpoint = null;
    var objEl = $('objective'); if (objEl) objEl.classList.remove('hidden');
    startPlaying();
    loadChapterLevel(0);
  };

  function loadChapterLevel(idx) {
    var levelId = levelForChapter(idx);
    var spawn = SPAWNS[idx] || { x: 0, z: 0, yaw: 0 };
    $('loading').classList.remove('hidden');
    $('load-tip').textContent = '正在进入病栋……';
    G.state = 'playing';
    $('hud').classList.remove('hidden');
    setTimeout(function () {
      G.loadLevel(levelId, spawn, function () {
        G.restoreLevelState();
        $('loading').classList.add('hidden');
        G.fadeTo(false, 900);
        STORY.start();
        if (window.HA && HA.ready) {
          try {
            HA.setAmbience('room');
            HA.setMusicMode('explore');
          } catch (e) {}
        }
        G.showLockHint();
        G._hintFadeT = 0;
      });
    }, 120);
  }

  /* ============================================================
     交互
  ============================================================ */
  function doInteract() {
    if (G.state !== 'playing' || !G.player || !G.player.enabled) return;
    if (G.player.hidden) { G.player.exitHide(); return; }
    var hit = G._currentHit;
    if (!hit) return;
    var it = hit.item;
    // 门：交给剧情优先处理
    if (it.kind === 'door') {
      var door = it.data;
      if (STORY.interactDoor(door)) return;
      if (STORY.interact(it) === true) return;
      if (door.locked) { G.toast(door.lockedMsg || '门锁着'); if (window.HA && HA.ready) { try { HA.sfx('door_locked'); } catch (e) {} } return; }
      door.toggle();
      STORY.onDoorToggle(door);
      return;
    }
    if (it.kind === 'hide') {
      G.player.hideIn(it);
      $('hide-indicator').classList.remove('hidden');
      return;
    }
    var handled = STORY.interact(it);
    if (!handled && it.onDefault) it.onDefault();
  }

  function updateInteraction(dt) {
    if (!G.player || !G.player.enabled || G.player.hidden) {
      setPrompt(null);
      if (G.player && G.player.hidden) {
        setPrompt({ text: '离开储物柜', key: 'E' });
      }
      return;
    }
    G._interactT += dt;
    if (G._interactT < 0.06) return;
    G._interactT = 0;
    var hit = G.player.raycast();
    G._currentHit = hit;
    if (hit) {
      var p = hit.item.prompt;
      var text = typeof p === 'function' ? p() : p;
      setPrompt({ text: text, key: 'E' });
    } else {
      setPrompt(null);
    }
  }

  function setPrompt(data) {
    if (!UI.prompt) return;
    if (!data) {
      if (!G._promptVisible) return;
      G._promptVisible = false;
      UI.prompt.classList.add('hidden');
      UI.crosshair.classList.remove('active');
      return;
    }
    G._promptVisible = true;
    UI.pText.textContent = data.text;
    UI.prompt.classList.remove('hidden');
    UI.crosshair.classList.add('active');
  }

  function updateHUD(dt) {
    if (!G.player) return;
    var p = G.player;
    if (UI.sanity) UI.sanity.style.width = (p.sanity * 100).toFixed(1) + '%';
    if (UI.stamina) {
      UI.stamina.style.width = (p.stamina * 100).toFixed(1) + '%';
      UI.stamina.parentElement.classList.toggle('exhausted', p.exhausted);
    }
    if (UI.batteryFill) {
      UI.batteryFill.style.width = (p.battery * 100).toFixed(1) + '%';
      UI.battery.parentElement.classList.toggle('low', p.battery < 0.18);
    }
    var fc = $('file-counter');
    if (fc) {
      var nf = G.fileCount();
      if (G._fileShown !== nf) {
        G._fileShown = nf;
        fc.textContent = '病历档案 ' + nf + ' / ' + Object.keys(STORY.FILES).length + ' · 按 Tab 查看';
        fc.style.color = nf >= 6 ? '#a9c6b4' : '#7e948a';
      }
    }
    if (!p.hasFlashlight) {
      $('flashlight-status').style.opacity = '0.28';
    } else {
      $('flashlight-status').style.opacity = '0.9';
    }
    $('hide-indicator').classList.toggle('hidden', !p.hidden);
  }

  function updateVisualEffects(dt) {
    var p = G.player;
    if (!p) return;
    var lowSan = 1 - p.sanity;
    var edge = clamp((lowSan - 0.35) * 1.7, 0, 0.9);
    $('sanity-edge').style.opacity = edge.toFixed(3);
    $('chroma').style.opacity = clamp((lowSan - 0.55) * 1.2, 0, 0.85).toFixed(3);
    var grain = $('grain');
    grain.style.opacity = (0.07 + lowSan * 0.13).toFixed(3);
    var lowEl = $('lowbattery');
    if (lowEl) lowEl.classList.toggle('on', !!(p.hasFlashlight && p.battery < 0.16 && p.flashlightOn));
    if (window.HA && HA.ready) {
      try {
        HA.setSanity(p.sanity);
        HA.setTension(clamp(p.danger * 0.8 + (1 - p.sanity) * 0.4, 0, 1));
      } catch (e) {}
    }
    if (p.sanity < 0.25 && Math.random() < dt * 0.25) {
      if (window.HA && HA.ready) { try { HA.sfx('sanity_whisper', { volume: 0.4 }); } catch (e) {} }
      p.triggerShake(0.012, 0.6);
    }
  }

  /* ============================================================
     主循环
     ============================================================ */
  var lastT = 0;
  var menuScene = null;

  function animate(now) {
    requestAnimationFrame(animate);
    var dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0.016;
    lastT = now;
    G._fpsCount++;
    G._fpsT += dt;
    if (G._fpsT > 0.5) {
      G.fpsAvg = lerp(G.fpsAvg, G._fpsCount / G._fpsT, 0.4);
      G._fpsT = 0;
      G._fpsCount = 0;
      autoQualityTick();
      updateDiag();
    }
    try {
      update(dt);
    } catch (e) {
      G.errors.push('update: ' + e.message + ' | ' + (e.stack || '').split('\n')[1]);
      console.error(e);
    }
    if (G.renderer && G.scene) {
      try { G.renderer.render(G.scene, G.camera); } catch (e) { G.errors.push('render: ' + e.message); }
    }
  }

  function update(dt) {
    if (G.state === 'menu') {
      G._menuT += dt;
      if (G.camera) {
        G.camera.position.set(Math.sin(G._menuT * 0.05) * 0.4, 1.5 + Math.sin(G._menuT * 0.1) * 0.02, 0);
        G.camera.rotation.set(0, Math.sin(G._menuT * 0.05) * 0.03, 0);
      }
      return;
    }
    if (G.state !== 'playing') {
      if (G.player) G.player._applyCamera(dt);
      return;
    }
    G.playTime += dt;
    var p = G.player;
    if (!p || !G.level) return;
    G._hintFadeT += dt;
    if (G._hintFadeT > 16) $('hint-bar').classList.add('fade');
    safeCall('player', function () { p.update(dt); });
    safeCall('level', function () { G.level.update(dt, p.camera.position); });
    if (G.entity) safeCall('entity', function () { G.entity.update(dt, p); });
    // 触发区
    safeCall('triggers', function () {
      var trigs = G.level.checkTriggers(p.pos);
      if (trigs.length) trigs.forEach(function (t) { STORY.onTrigger(t.id); });
    });
    // 眼神高度更新后的枪口位置
    safeCall('interaction', function () { updateInteraction(dt); });
    safeCall('hud', function () { updateHUD(dt); });
    safeCall('fx', function () { updateVisualEffects(dt); });
    safeCall('story', function () { STORY.update(dt); });
    // 第一章之后的灯光/环境音随玩家区域变化（音效由章节驱动，这里只做音像）
    if (p.danger > 0.6 && window.HA && HA.ready) { /* tension 已在 visualEffects 设置 */ }
    // 自动画质
    if (!G._menuBtnShown && G.state === 'playing' && G._hintFadeT > 2) {
      G._menuBtnShown = true;
    }
  }

  function safeCall(name, fn) {
    try { fn(); } catch (e) {
      G._safeErrors = G._safeErrors || {};
      var n = G._safeErrors[name] || 0;
      G._safeErrors[name] = n + 1;
      if (n < 4) {
        G.errors.push(name + ': ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' / '));
      }
    }
  }

  function autoQualityTick() {
    if (!G.settings || G.settings.quality !== 'auto') return;
    if (G.state !== 'playing' || G._autoT === undefined) { G._autoT = 0; G._autoSamples = []; return; }
    G._autoSamples = G._autoSamples || [];
    G._autoSamples.push(G.fpsAvg);
    if (G._autoSamples.length > 6) G._autoSamples.shift();
    if (G._autoSamples.length < 6) return;
    var avg = G._autoSamples.reduce(function (a, b) { return a + b; }, 0) / G._autoSamples.length;
    if (avg < 45 && G.autoQuality !== 'low') {
      G.autoQuality = 'low';
      G.applySettings();
    } else if (avg > 58 && G.autoQuality === 'low' && G._autoSamples.every(function (v) { return v > 55; })) {
      G.autoQuality = 'medium';
      G.applySettings();
    }
  }

  /* ============================================================
     菜单与启动流程
     ============================================================ */
  function startPlaying() {
    $('main-menu').classList.add('hidden');
    $('intro').classList.add('hidden');
    $('settings').classList.add('hidden');
    $('pause-menu').classList.add('hidden');
    $('chapter-card').classList.add('hidden');
    $('death-screen').classList.add('hidden');
    $('ending-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('boot-screen').classList.add('hidden');
    $('fade').classList.remove('on');
    G.state = 'playing';
    G.showLockHint();
    $('hint-bar').classList.remove('fade');
    G.clearSubtitle();
    if (G.player) { G.player.setEnabled(true); G.player.setPaused(false); }
  }

  function showMainMenu() {
    G.state = 'menu';
    $('boot-screen').classList.add('hidden');
    $('main-menu').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('lock-hint').classList.add('hidden');
    if (G.player) G.player.releaseLock();
    updateMenuContinue();
    var rl = document.getElementById('menu-run-label');
    if (rl) rl.textContent = (G.run === 1 ? '当前：第一周目' : '当前：第二周目');
    var rf = document.getElementById('menu-replay-first');
    if (rf) rf.textContent = (G.run === 1 ? '重新开始本周目' : '重玩第一周目');
    if (window.HA && HA.ready) {
      try { HA.setAmbience('menu'); HA.setMusicMode('menu'); } catch (e) {}
    }
  }

  function updateMenuContinue() {
    var has = false;
    try { has = !!localStorage.getItem(SAVE_KEY); } catch (e) {}
    var btn = $('menu-continue');
    if (btn) btn.classList.toggle('disabled', !has);
  }

  function initAudio() {
    if (window.HA && typeof HA.init === 'function') {
      try {
        HA.init({
          masterVolume: G.settings.master,
          musicVolume: G.settings.music,
          sfxVolume: G.settings.sfx,
          ambientVolume: G.settings.ambient
        }).then(function (ok) {
          if (ok) {
            G.applySettings();
            if (G.state === 'menu') { try { HA.setAmbience('menu'); HA.setMusicMode('menu'); } catch (e) {} }
          }
        });
      } catch (e) {}
    }
  }

  function bindMenu() {
    var bootLeaving = false;
    function enterFromBoot() {
      if (!G.assetsReady || bootLeaving) return;
      bootLeaving = true;
      initAudio();
      var boot = $('boot-screen');
      boot.classList.add('leaving');
      setTimeout(function () {
        showMainMenu();
        var mm = $('main-menu');
        mm.classList.remove('hidden');
        mm.classList.remove('menu-enter');
        void mm.offsetWidth;
        mm.classList.add('menu-enter');
        boot.classList.add('hidden');
        boot.classList.remove('leaving');
      }, 760);
    }
    $('boot-screen').addEventListener('click', enterFromBoot);
    document.addEventListener('keydown', function (e) {
      if (bootLeaving) return;
      if (!G.assetsReady) return;
      if (e.code === 'F5' || e.code === 'F12' || e.code === 'Tab') return;
      enterFromBoot();
    });
    $('menu-start').addEventListener('click', function () {
      if (window.HA && HA.ready) { try { HA.sfx('ui_click'); } catch (e) {} }
      // 点击「开始新游戏」永远从第一周目开始
      try { localStorage.setItem(RUN_KEY, '1'); } catch (e) {}
      G.run = 1;
      $('main-menu').classList.add('hidden');
      $('intro').classList.remove('hidden');
    });
    $('menu-continue').addEventListener('click', function () {
      if ($('menu-continue').classList.contains('disabled')) { G.toast('没有可继续的存档'); return; }
      if (window.HA && HA.ready) { try { HA.sfx('ui_click'); } catch (e) {} }
      G.continueGame();
    });
    $('menu-settings').addEventListener('click', function () {
      $('settings').classList.remove('hidden');
    });
    $('menu-about').addEventListener('click', function () {
      $('about').classList.remove('hidden');
    });
    $('btn-about-back').addEventListener('click', function () { $('about').classList.add('hidden'); });
    $('btn-intro-go').addEventListener('click', function () {
      $('intro').classList.add('hidden');
      if (window.HA && HA.ready) { try { HA.sfx('ui_click'); } catch (e) {} }
      G.startNewGame();
    });
    // 暂停菜单
    $('btn-resume').addEventListener('click', function () { resumeGame(); });
    $('btn-settings-pause').addEventListener('click', function () { $('settings').classList.remove('hidden'); });
    $('btn-quit').addEventListener('click', function () {
      $('pause-menu').classList.add('hidden');
      $('hud').classList.add('hidden');
      showMainMenu();
    });
    $('btn-retry').addEventListener('click', function () { G.retry(); });
    $('btn-death-menu').addEventListener('click', function () {
      $('death-screen').classList.add('hidden');
      $('hud').classList.add('hidden');
      showMainMenu();
    });
    $('btn-ending-menu').addEventListener('click', function () {
      $('ending-screen').classList.add('hidden');
      $('hud').classList.add('hidden');
      if (G._endingNextRun) {
        G._endingNextRun = false;
        G.startSecondRun();
        return;
      }
      G.state = 'menu';
      showMainMenu();
    });
    // 指针锁定提示
    $('lock-hint').addEventListener('click', function () {
      if (G.state !== 'playing' || !G.player) return;
      if (document.pointerLockElement === $('game-canvas')) {
        $('lock-hint').classList.add('hidden');
        return;
      }
      G.player.requestLock($('game-canvas'));
      setTimeout(function () {
        if (document.pointerLockElement === $('game-canvas')) $('lock-hint').classList.add('hidden');
      }, 260);
    });
    // 画布点击
    $('viewport').addEventListener('click', function () {
      if (G.state === 'playing' && G.player && !G.player.locked) {
        G.player.requestLock($('game-canvas'));
      }
    });
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    $('pause-menu').classList.remove('hidden');
    $('lock-hint').classList.add('hidden');
    if (G.player) { G.player.setPaused(true); G.player.releaseLock(); }
    saveCheckpointIfNeeded();
  }
  function resumeGame() {
    $('pause-menu').classList.add('hidden');
    $('settings').classList.add('hidden');
    $('about').classList.add('hidden');
    if (G.state === 'paused' || G.state === 'overlay') {
      G.state = 'playing';
      if (G.player) {
        G.player.setPaused(false);
        G.player.setEnabled(true);
        G.player.requestLock($('game-canvas'));
      }
      G.showLockHint();
      setTimeout(function () {
        if (G.state === 'playing' && G.player && G.player.locked) $('lock-hint').classList.add('hidden');
      }, 220);
    }
  }
  function saveCheckpointIfNeeded() {
    // 暂停时静默保存当前进度（章节起点或最近检查点）
    if (STORY.chapterIdx >= 0 && G.checkpoint) {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.checkpoint)); } catch (e) {}
    }
  }

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      if (G.state === 'playing') {
        if (e.code === 'KeyE') { doInteract(); e.preventDefault(); }
        else if (e.code === 'Tab' || e.code === 'KeyJ') { openJournal(); e.preventDefault(); }
        else if (e.code === 'Escape') { pauseGame(); e.preventDefault(); }
        else if (e.code === 'KeyF') { /* player 自己处理 */ }
      } else if (G.state === 'paused') {
        if (e.code === 'Escape') { resumeGame(); e.preventDefault(); }
      } else if (G.state === 'overlay') {
        // 档案打开时，Esc / Tab / J 只关闭档案，不会弹出暂停菜单
        if (G._overlayOpen === 'journal' && (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyJ')) { closeJournal(); e.preventDefault(); }
        else if (G._overlayOpen === 'floor' && e.code === 'Escape') { G.closeFloorMenu(); e.preventDefault(); }
      } else if (G.state === 'dead') {
        if (e.code === 'KeyR' || e.code === 'Enter') { G.retry(); }
      }
    });
    document.addEventListener('pointerlockchange', function () {
      var locked = document.pointerLockElement === $('game-canvas');
      if (G.player) G.player.locked = locked;
      var suppress = G._suppressPause || (G.player && G.player.enabled === false) || document.getElementById('cinema').classList.contains('on');
      if (G.state === 'playing' && !locked && !suppress) {
        pauseGame();
      } else if (G.state === 'playing' && locked) {
        $('lock-hint').classList.add('hidden');
      }
    });
  }

  /* ---------------- 档案界面 ---------------- */
  var journalTab = 'files';
  function openJournal() {
    if (G.state !== 'playing') return;
    G.openOverlay('journal');
    $('journal').classList.remove('hidden');
    G.player.releaseLock();
    renderJournalList();
  }
  function closeJournal() {
    $('journal').classList.add('hidden');
    G.closeOverlay();
  }
  function renderJournalList() {
    var list = $('journal-list');
    list.innerHTML = '';
    var items = [];
    if (journalTab === 'files') {
      Object.keys(STORY.FILES).forEach(function (id) {
        if (G.files[id]) items.push({ id: id, kind: 'file', data: STORY.FILES[id] });
      });
    } else if (journalTab === 'tapes') {
      Object.keys(STORY.TAPES).forEach(function (id) {
        if (G.tapes[id]) items.push({ id: id, kind: 'tape', data: STORY.TAPES[id] });
      });
    } else {
      Object.keys(G.notesRead || {}).forEach(function (id) {
        if (STORY.NOTES[id]) items.push({ id: id, kind: 'note', data: STORY.NOTES[id] });
      });
    }
    if (!items.length) {
      $('journal-empty').classList.remove('hidden');
      $('journal-doc').classList.add('hidden');
      return;
    }
    $('journal-empty').classList.add('hidden');
    $('journal-doc').classList.add('hidden');
    items.forEach(function (item, i) {
      var div = document.createElement('div');
      div.className = 'j-item' + (i === 0 ? ' active' : '');
      var type = item.kind === 'file' ? item.data.type : (item.data.type || '录音');
      var title = item.kind === 'file' ? item.data.title : (item.data.title || '录音');
      div.innerHTML = '<div class="ji-type">' + type + '</div><div class="ji-title">' + title + '</div>';
      div.addEventListener('click', function () {
        list.querySelectorAll('.j-item').forEach(function (x) { x.classList.remove('active'); });
        div.classList.add('active');
        showJournalDoc(item.data);
      });
      list.appendChild(div);
    });
    showJournalDoc(items[0].data);
  }
  function showJournalDoc(data) {
    var doc = $('journal-doc');
    doc.classList.remove('hidden');
    doc.querySelector('.doc-type').textContent = data.type || '';
    doc.querySelector('.doc-title').textContent = data.title || '';
    doc.querySelector('.doc-body').textContent = data.body || (data.lines ? data.lines.map(function (l) { return '「' + l.text + '」'; }).join('\n') : '');
  }
  function bindJournal() {
    $('journal').addEventListener('click', function (e) {
      if (e.target === $('journal')) closeJournal();
    });
    document.querySelectorAll('.journal-tabs .tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.journal-tabs .tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        journalTab = tab.getAttribute('data-tab');
        renderJournalList();
      });
    });
    $('journal').addEventListener('keydown', function (e) {
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyJ') closeJournal();
    });
  }

  /* ============================================================
     启动
  ============================================================ */
  function boot() {
    G.debug = /[?&]debug=1/.test(location.search);
    G.testMode = /[?&]test=1/.test(location.search);
    G.autoMode = /[?&]auto=1/.test(location.search);
    G.shotMode = /[?&]shot=1/.test(location.search);
    G.settings = loadSettings();
    initRenderer();
    initUI();
    bindMenu();
    bindKeys();
    bindJournal();
    bindSettingsUI();
    bindDeath();
    $('grain').style.backgroundImage = 'url(' + HT.buildGrain() + ')';
    HT.init(G.renderer).then(function () {
      G.player = new HW.Player(G.camera, {});
      G.player.sensitivity = G.settings.sens;
      G.player.invertY = G.settings.invert;
      G.player.shakeEnabled = G.settings.shake;
      G.player.onLockChange = function (locked) {
        if (G.state === 'playing') $('lock-hint').classList.toggle('hidden', locked);
      };
      G.player.onHideChange = function (hidden) {
        $('hide-indicator').classList.toggle('hidden', !hidden);
      };
      G.player.onFootstep = function () {};
      STORY.init(G);
      G.applySettings();
      // 主菜单底图：一个很暗的病房场景（真实 3D，用于菜单氛围）
      G.assetsReady = true;
      $('boot-screen').classList.remove('hidden');
      var bootHint = $('boot-screen') && $('boot-screen').querySelector('.boot-hint');
      if (bootHint) bootHint.textContent = '点击任意位置进入';
      if (/[?&]menu=1/.test(location.search)) {
        initAudio();
        showMainMenu();
        return;
      }
      var loadingHint = $('boot-screen').querySelector('.boot-hint');
      if (loadingHint) loadingHint.textContent = '点击任意位置进入';
      animate(performance.now());
      // 调试 / 自动测试
      if (G.debug) { $('diag').classList.remove('hidden'); updateDiag(); }
      if (G.shotMode || G.testMode || G.autoMode) {
        setTimeout(function () { autoStartForTest(); }, 200);
      }
    });
  }

  function autoStartForTest() {
    // 无头浏览器模式：跳过菜单直接进入游戏
    // 注意：无头 + 虚拟时间模式下不初始化音频（AudioContext 实时线程会让 virtual-time 预算卡住）
    G.settings.scare = 'standard';
    if (G.autoMode) {
      startPlaying();
      $('loading').classList.remove('hidden');
      loadChapterLevel(0);
      setTimeout(runWalkthrough, 3200);
      return;
    }
    startPlaying();
    var params = new URLSearchParams(location.search);
    var chapter = parseInt(params.get('chapter') || '0', 10);
    var levelParam = params.get('level');
    if (levelParam) {
      G.state = 'playing';
      $('hud').classList.remove('hidden');
      G.loadLevel(levelParam, { x: parseFloat(params.get('x') || '0'), z: parseFloat(params.get('z') || '0'), yaw: parseFloat(params.get('yaw') || '0') }, function () {
        STORY.startChapter(chapter, true);
        if (params.get('light') === '1') G.level.setCircuit('all', true, { includeEmergency: true });
        if (params.get('fl') === '1') { G.player.giveFlashlight(); G.player.setFlashlight(true); }
        var px = params.get('x'), pz = params.get('z');
        if (px !== null && pz !== null) G.player.teleport(parseFloat(px), parseFloat(pz), parseFloat(params.get('yaw') || '0'), parseFloat(params.get('pitch') || '0'));
        if (G.shotMode) { $('lock-hint').classList.add('hidden'); $('hint-bar').classList.add('fade'); }
        G.state = 'playing';
        // 截图辅助：恐怖演出/实体/UI
        var scareParam = params.get('scare');
        if (scareParam) setTimeout(function () { G.playJumpScare(scareParam === 'stitched' ? 'stitched' : 'face', { duration: 60, silent: true }); }, 500);
        if (params.get('entity') === '1') {
          var ey = G.player.yaw;
          var efx = -Math.sin(ey), efz = -Math.cos(ey);
          G.spawnEntityScript({ x: G.player.pos.x + efx * 3.2, z: G.player.pos.z + efz * 3.2, duration: 120, facePlayer: true });
        }
        var uiParam = params.get('ui');
        if (uiParam) setTimeout(function () {
          if (uiParam === 'note') G.showNote({ type: '档案', title: '测试文档标题', body: '这是一段用于检查排版的中文正文。\n第二行。\n第三行。' }, function () {});
          else if (uiParam === 'journal') { G.collectFile('file_302'); openJournal(); }
          else if (uiParam === 'pause') pauseGame();
          else if (uiParam === 'settings') { pauseGame(); $('settings').classList.remove('hidden'); }
          else if (uiParam === 'keypad') G.openKeypad({ code: '0312' });
          else if (uiParam === 'ending') G.showEnding('truth');
          else if (uiParam === 'death') { G.killPlayer(); }
          else if (uiParam === 'map') { }
        }, 900);
        if (G.testMode) runSelfTest();
      });
      return;
    }
    loadChapterLevel(chapter);
    if (G.testMode) setTimeout(runSelfTest, 2500);
  }

  function bindDeath() {
    // 死亡界面按钮已在 bindMenu 绑定
  }

  // 调试用：直接推进剧情计时器（补偿无头虚拟时间中 rAF 帧不足）
  G.pump = function (sec) {
    var n = Math.max(1, Math.ceil(sec / 0.05));
    for (var i = 0; i < n; i++) {
      try { STORY.update(0.05); } catch (e) { G.errors.push('pump: ' + e.message); }
    }
  };

  /* ---------------- 全流程自动测试（?auto=1） ---------------- */
  function wlog(msg) {
    G.testLog = G.testLog || [];
    G.testLog.push(msg);
    try { console.log('[WALK] ' + msg); } catch (e) {}
  }
  function wfail(msg) {
    G.walkFails = G.walkFails || [];
    G.walkFails.push(msg);
    wlog('FAIL ' + msg);
  }
  function wok(cond, msg) { if (cond) wlog('ok ' + msg); else wfail(msg); return !!cond; }
  function wt(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pressKey(code) {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { code: code, key: code, bubbles: true })); } catch (e) {}
  }
  function clickEl(sel) {
    var el = document.querySelector(sel);
    if (!el) return false;
    el.click();
    return true;
  }
  function tp(x, z, yaw, pitch) {
    if (!G.player) return;
    G.player.setEnabled(true);
    G.player.teleport(x, z, yaw || 0, pitch || 0);
  }
  function lookAt(x, y, z) {
    if (!G.player || !G.camera) return;
    var cam = G.camera.position;
    var dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    var yaw = Math.atan2(-dx, -dz);
    var pitch = Math.atan2(dy, Math.hypot(dx, dz));
    G.player.yaw = yaw;
    G.player.pitch = Math.max(-1.2, Math.min(1.2, pitch));
    G.player._applyCamera(0);
    G.camera.updateMatrixWorld(true);
  }
  function act(id) {
    if (!G.level) { wfail('no level for ' + id); return false; }
    var it = G.level.getInteractable(id);
    if (!it) { wfail('missing interactable ' + id); return false; }
    if (it.pos) lookAt(it.pos.x, it.pos.y, it.pos.z);
    if (it.kind === 'door') {
      var d = it.data;
      if (STORY.interactDoor(d)) return true;
      if (STORY.interact(it) === true) return true;
      if (d.locked) { G.toast(d.lockedMsg || 'lock'); return false; }
      d.toggle();
      STORY.onDoorToggle(d);
      return true;
    }
    if (it.kind === 'hide') {
      if (G.player.hideIn(it)) { setTimeout(function () { G.player.exitHide(); }, 150); }
      return true;
    }
    var handled = STORY.interact(it);
    if (handled === false && it.onDefault) it.onDefault();
    return handled !== false;
  }
  async function runWalkthrough() {
    G.testLog = [];
    G.walkFails = [];
    var report = document.createElement('div');
    report.id = 'walkreport';
    report.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;font:10px monospace;color:#0f0;background:rgba(0,0,0,.7);max-height:40vh;overflow:auto;white-space:pre-wrap;pointer-events:none';
    document.body.appendChild(report);
    report.textContent = 'WALK STARTING';
    try {
      wlog('begin');
      await wt(1200);
      wok(G.chapterIdx === 0, 'chapter0 loaded');
      act('item_flashlight'); await wt(400);
      wok(G.hasItem('flashlight'), 'pick flashlight');
      // 真实射线拾取检查：看向床头柜上的手电残影位置附近（已被拾取，改为检查纸条）
      lookAt(-16.1, 0.2, 4.35); await wt(200);
      var rh = G.player.raycast();
      wok(!!(rh && rh.item && rh.item.id === 'note302'), 'raycast interaction hit note302');
      act('note302'); await wt(500);
      pressKey('KeyE'); await wt(1300);
      wok(STORY.flags.noted, 'note302 read');
      wok(!G.level.doors.door302.locked, 'door302 unlocked');
      wlog('before tp: state=' + G.state + ' chapter=' + STORY.chapterIdx + ' chId=' + (STORY.chapter && STORY.chapter.id) + ' ticks=' + (G._storyTicks || 0) + ' pos=' + G.player.pos.x.toFixed(1) + ',' + G.player.pos.z.toFixed(1));
      tp(-16.8, 0.5, -Math.PI / 2); await wt(200); G.pump(4); await wt(400);
      wok(G.chapterIdx === 1, 'chapter1 entered');
      act('item_fuse'); await wt(200); G.pump(1);
      wok(G.hasItem('fuse'), 'pick fuse');
      // 先装保险丝，再按 西(3) → 中(2) → 东(1) 的顺序合闸
      act('switch_3'); G.pump(0.4);
      wok(!!STORY.flags.fuseInstalled, 'fuse installed');
      act('switch_3'); G.pump(0.4);
      wok(STORY.chapter.progress === 1, 'switch order 1/3');
      act('switch_2'); G.pump(0.4);
      act('switch_1'); await wt(200); G.pump(4); await wt(300);
      wok(STORY.flags.powerOn, 'power restored');
      tp(-8.0, 0.2, -Math.PI / 2); await wt(200); G.pump(8); await wt(400);
      wok(STORY.flags.powerScare, 'corridor scare done');
      tp(12.6, 2.2, 0); await wt(200); G.pump(3); await wt(300);
      wok(G.chapterIdx === 2, 'chapter2 entered');
      act('note_nurse_code'); await wt(400);
      pressKey('KeyE'); await wt(400); G.pump(1.5);
      wok(STORY.flags.knowCode, 'nurse code known');
      act('keypad_pharmacy'); await wt(500);
      clickEl('#keypad-overlay button[data-k="0"]');
      clickEl('#keypad-overlay button[data-k="3"]');
      clickEl('#keypad-overlay button[data-k="1"]');
      clickEl('#keypad-overlay button[data-k="2"]');
      await wt(1500);
      wok(STORY.flags.pharmacyOpen, 'pharmacy opened');
      if (STORY.flags.knowCode) G.setObjective('进入药房，寻找电梯卡。');
      tp(16.6, -2.4, 0); await wt(200); G.pump(3); await wt(300);
      wok(G.chapterIdx === 3, 'chapter3 entered');
      act('item_elevatorCard'); await wt(200); G.pump(6); await wt(400);
      wok(G.hasItem('elevatorCard'), 'elevator card picked');
      tp(20.8, 0.4, -1.5708); lookAt(22.2, 1.55, -3.2); G.pump(4); await wt(500);
      wok(STORY.flags.mirrorScare, 'mirror scare done');
      act('elevator'); await wt(500); G.pump(8); await wt(2600); G.pump(3); await wt(800);
      wok(G.chapterIdx === 4, 'chapter4 basement');
      wok(G.levelId === 'basement', 'basement level');
      tp(12.8, -5.0, 0); await wt(400);
      act('item_whiteCard'); await wt(300); G.pump(6); await wt(400);
      wok(G.hasItem('whiteCard'), 'white card picked');
      tp(33.4, 0, -Math.PI / 2); await wt(300); G.pump(3); await wt(400);
      wok(STORY.flags.chaseStarted, 'chase started');
      wok(STORY.flags.reachWhite, 'reached white corridor end');
      act('door_doorWhite'); await wt(3000); G.pump(3); await wt(800);
      wok(G.chapterIdx === 5, 'chapter5 white room');
      wok(G.levelId === 'white', 'white level');
      tp(0, 3.6, 0); await wt(300); G.pump(40); await wt(600);
      wok(!!document.getElementById('choice-overlay'), 'final choice shown');
      clickEl('#choice-overlay button');
      await wt(2000);
      wok(G.state === 'ending', 'ending screen shown');
      try { wlog('audio state: ' + (window.HA && HA.getState ? JSON.stringify(HA.getState()) : 'none')); wok(!!(window.HA && HA.ready), 'audio engine ready'); } catch (e) { wfail('audio ' + e.message); }
      wok((G.walkFails || []).length === 0, 'no failures');
    } catch (e) {
      wfail('exception ' + e.message);
    }
    var ok = (G.walkFails || []).length === 0;
    report.textContent = 'WALK_RESULT ' + (ok ? 'OK' : 'FAIL') + '\n' + (G.testLog || []).join('\n') + '\n' +
      '--- ERRORS ---\n' + (G.errors || []).slice(0, 12).join('\n');
    document.title = ok ? 'WALK_OK' : 'WALK_FAIL';
  }

  /* ---------------- 自动自测 ---------------- */
  function runSelfTest() {
    var results = { ok: true, steps: [], errors: [] };
    try {
      var levelIds = ['ward', 'basement', 'white'];
      var chapterMap = { ward: 0, basement: 4, white: 5 };
      var shots = [
        { level: 'ward', x: -16.8, z: 3.2, yaw: 1.5 },
        { level: 'ward', x: -8.0, z: 0.0, yaw: -Math.PI / 2 },
        { level: 'ward', x: 22.5, z: 0.0, yaw: -Math.PI / 2 },
        { level: 'basement', x: 11.2, z: -3.0, yaw: 0.4 },
        { level: 'basement', x: 22.0, z: 0.0, yaw: -Math.PI / 2 },
        { level: 'white', x: 0, z: 3.0, yaw: 0 }
      ];
      var idx = 0;
      function next() {
        if (idx >= shots.length) {
          // 测试 UI 覆盖层
          try {
            G.showNote({ type: '测试', title: '测试便签', body: '测试内容' }, function () {
              G.showTape({ type: '测试', title: '测试录音', lines: [{ who: '测试', text: '测试一行' }, { who: '测试', text: '测试两行' }] }, function () {
                G.playJumpScare('stitched', { duration: 0.5, silent: true });
                results.steps.push('ui overlays');
                setTimeout(function () {
                  results.ok = G.errors.length === 0;
                  results.errors = G.errors.slice(0, 5);
                  results.calls = G.renderer.info.render.calls;
                  results.tris = G.renderer.info.render.triangles;
                  var d = $('diag');
                  if (d) { d.classList.remove('hidden'); d.textContent = 'TEST ' + JSON.stringify(results); }
                  document.title = results.ok ? ('TEST_OK calls=' + results.calls + ' tris=' + results.tris) : 'TEST_FAIL';
                }, 500);
              });
            });
          } catch (e) { results.errors.push('ui: ' + e.message); }
          return;
        }
        var sc = shots[idx++];
        G.loadLevel(sc.level, { x: sc.x, z: sc.z, yaw: sc.yaw }, function () {
          STORY.startChapter(chapterMap[sc.level], true);
          G.player.teleport(sc.x, sc.z, sc.yaw, 0);
          G.state = 'playing';
          setTimeout(next, 180);
        });
      }
      next();
    } catch (e) {
      results.ok = false;
      results.errors.push(e.message);
      document.title = 'TEST_FAIL';
    }
  }

  // 启动
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    window.addEventListener('DOMContentLoaded', boot);
  }

  // 测试/调试用的镜头辅助
  G.setCamera = function (x, y, z, yaw, pitch) {
    if (!G.camera) return;
    G.player.teleport(x, z, yaw || 0, pitch || 0);
    if (y !== undefined) G.player.eyeHeight = y;
    G.player._applyCamera(0);
  };
})();
