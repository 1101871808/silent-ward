/* 《静默病栋》HA 程序化恐怖音频引擎 v1.0.0 —— window.HA
 * 纯 Web Audio 实时合成：无音频文件/网络/第三方库；经典 script，file:// 可用。
 * 加载不创建 AudioContext；用户点击后 HA.init()；每帧 HA.update(dt)。
 * 图：voice/track → StereoPanner → 子总线 → duck → master → Compressor → destination
 *     reverb send → 程序生成 IR Convolver → master；music root → delay → master。
 * 用法：HA.init({masterVolume:.8}); HA.setAmbience('ward',2.5); HA.setMusicMode('menu',3);
 *       HA.sfx('door_creak',{volume:.7,pan:-.5}); HA.footstep('tile',true);
 *       var id = HA.startLoop('wind_loop',{volume:.5}); HA.stopLoop(id,1);
 * 未 init 时所有方法安全 no-op；节点由 25ms tick 统一回收；音乐 25ms 前瞻调度。 */
(function () {
  'use strict'; if (typeof window === 'undefined') return;

  /* ---------- 0. 工具 / 全局状态 ---------- */
  var DEFAULTS = { master: 0.8, music: 0.55, sfx: 0.85, ambient: 0.5, ui: 0.7 }; var HA = { ready: false, version: '1.0.0' };

  var state = {
    inited: false, hidden: false, paused: false, hiddenSuspend: false,
    hideTimer: 0, tension: 0.25, tensionTarget: 0.25, sanity: 1,
    sanityTarget: 1,
    volumes: { master: DEFAULTS.master, music: DEFAULTS.music, sfx: DEFAULTS.sfx, ambient: DEFAULTS.ambient, ui: DEFAULTS.ui },
    musicMode: 'none', ambience: 'none', duckUntil: 0, ducked: false,
    ambTimer: 0, whisperTimer: 5,
    proxTimer: 8
  };

  var ctx = null, master = null, compressor = null, buses = {}, reverbIn = null, delayIn = null;
  var NOISE_WHITE = null, NOISE_BROWN = null; var cleanups = [], initPromise = null, tickTimer = null, visBound = false;
  var curRate = 1, curBus = 'sfx'; var music = { current: null }; var loops = {}, loopSeq = 0;
  var heart = { active: false, bpm: 62, timer: 0 }; var breath = { active: false, mode: 'calm', timer: 0 }; var tin = null;
  // 环境床
  var ambRoot, droneA, droneB, droneC, droneFilter, droneMix, noiseBed, noiseGain; var humA, humB, humGain, airSrc, airGain, windSrc, windBP, windGain, waterSrc, waterGain;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function R(hz) { return hz * curRate; }        // sfx(rate) 的临时音高系数
  var warned = 0;
  function warn(e) { if (warned++ < 4 && window.console) window.console.warn('[HA]', e); }
  function later(fn, ms) { return window.setTimeout(fn, ms); }

  /* ---------- 1. 图构建 / init ---------- */
  function buildGraph() {
    var c = ctx; master = c.createGain();
    master.gain.value = 0.0001;                       // 淡入，杜绝开机爆音
    compressor = c.createDynamicsCompressor(); compressor.threshold.value = -18; compressor.knee.value = 20;
    compressor.ratio.value = 5; compressor.attack.value = 0.004; compressor.release.value = 0.25; master.connect(compressor);
    compressor.connect(c.destination);                // master → 压缩 → 输出

    // ---- 程序生成混响 IR：3.1s 暗色衰减 + 早期反射 ----
    reverbIn = c.createGain(); reverbIn.gain.value = 1; var pre = c.createDelay(0.12); pre.delayTime.value = 0.035; var conv = c.createConvolver(); conv.buffer = makeIR(3.1);
    var damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 3800;
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170; var wet = c.createGain(); wet.gain.value = 0.9;
    reverbIn.connect(pre); pre.connect(conv); conv.connect(damp); damp.connect(hp); hp.connect(wet); wet.connect(master);

    // ---- 可选延迟 send：暗色反馈延迟，用于八音盒/滴水 ----
    delayIn = c.createGain(); var dly = c.createDelay(1.0); dly.delayTime.value = 0.37; var fb = c.createGain(); fb.gain.value = 0.32;
    var dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
    var dret = c.createGain(); dret.gain.value = 0.5; delayIn.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(dret); dret.connect(master);

    NOISE_WHITE = makeNoise(false); NOISE_BROWN = makeNoise(true);

    // ---- 四条子总线，全部汇入 master ----
    buses.music = makeBus(0.55); buses.sfx = makeBus(0.85); buses.ambient = makeBus(0.5); buses.ui = makeBus(0.7); applyAllVolumes(0.01);
  }
  function makeBus(level) {
    var input = ctx.createGain(); input.gain.value = level; var duck = ctx.createGain(); duck.gain.value = 1; input.connect(duck); duck.connect(master);
    return { input: input, duck: duck };
  }
  function makeIR(seconds) {
    var rate = ctx.sampleRate, len = Math.floor(rate * seconds); var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), last = 0;
      for (var i = 0; i < len; i++) {
        var x = i / len; var env = Math.pow(1 - x, 2.4) * (0.55 + 0.45 * Math.pow(1 - x, 6)); var n = Math.random() * 2 - 1;
        last = last * 0.55 + n * 0.45;                 // 一阶低通 → 阴冷暗色
        d[i] = last * env * 0.6;
      }
      // 稀疏早期反射，制造走廊/空房间的空间轮廓
      var refl = [[0.017, 0.5], [0.029, -0.42], [0.047, 0.33], [0.071, -0.27], [0.113, 0.2], [0.157, -0.14], [0.23, 0.1]];
      for (var r = 0; r < refl.length; r++) {
        var idx = Math.floor(refl[r][0] * rate); if (idx < len) d[idx] += refl[r][1] * (ch ? 0.82 : 1);
      }
    }
    return buf;
  }
  function makeNoise(brown) {
    var len = Math.floor(ctx.sampleRate * 2.5); var b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 2.6; }
      else d[i] = w;
    }
    return b;
  }
  function init(opts) {
    if (state.inited) return Promise.resolve(true); if (initPromise) return initPromise;
    var p = new Promise(function (resolve) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { resolve(false); return; }
        opts = opts || {}; if (opts.masterVolume != null) state.volumes.master = clamp(+opts.masterVolume, 0, 1);
        if (opts.musicVolume != null) state.volumes.music = clamp(+opts.musicVolume, 0, 1); if (opts.sfxVolume != null) state.volumes.sfx = clamp(+opts.sfxVolume, 0, 1);
        if (opts.ambientVolume != null) state.volumes.ambient = clamp(+opts.ambientVolume, 0, 1);
        if (opts.uiVolume != null) state.volumes.ui = clamp(+opts.uiVolume, 0, 1); var c = new AC(); ctx = c; buildGraph();
        buildAmbience(); buildTinnitus(); state.inited = true; HA.ready = true;
        state.hidden = !!(window.document && window.document.hidden); applyMaster(); if (state.ambience !== 'none') applyAmbience(state.ambience, 0.4);
        if (state.musicMode !== 'none') setMusicMode(state.musicMode, 0.8); bindVisibility(); if (!tickTimer) tickTimer = window.setInterval(tick, 25);
        try { var pr = c.state === 'suspended' && c.resume ? c.resume() : null; if (pr && pr.catch) pr.catch(function () { /* 等待用户手势 */ }); } catch (e) { /* 忽略 */ }
        resolve(true);
      } catch (e) {
        warn(e); state.inited = false; HA.ready = false; ctx = null; resolve(false);
      }
    });
    initPromise = p; p.then(function (ok) { if (!ok) initPromise = null; });
    return p;
  }
  function bindVisibility() {
    if (visBound || !window.document || !window.document.addEventListener) return; visBound = true;
    window.document.addEventListener('visibilitychange', function () {
      state.hidden = !!window.document.hidden; if (!state.inited) return;
      if (state.hidden) {
        applyMaster(); window.clearTimeout(state.hideTimer);
        state.hideTimer = later(function () {
          if (state.hidden && state.inited && ctx && ctx.state === 'running') {
            try { var sp = ctx.suspend(); if (sp && sp.catch) sp.catch(function () { /* 忽略 */ }); state.hiddenSuspend = true; } catch (e) { /* 忽略 */ }
          }
        }, 2200);
      } else {
        window.clearTimeout(state.hideTimer);
        if (state.hiddenSuspend) {
          state.hiddenSuspend = false;
          try { var rp = ctx.resume(); if (rp && rp.catch) rp.catch(function () { /* 忽略 */ }); } catch (e) { /* 忽略 */ }
        }
        applyMaster(); resyncMusic();
      }
    });
  }
  function resyncMusic() {
    if (!ctx || !music.current) return; music.current.nextTime = ctx.currentTime + 0.08; music.current.heartNext = ctx.currentTime + 0.4;
  }

  /* ---------- 2. 音量 / 暂停 / duck / 清理 ---------- */
  function applyMaster() {
    if (!ctx || !master) return; var v = state.hidden ? 0 : state.volumes.master; master.gain.setTargetAtTime(v, ctx.currentTime, 0.18);
  }
  function applyAllVolumes() {
    if (!ctx) return; applyMaster();
    for (var k in buses) {
      if (buses[k]) buses[k].input.gain.setTargetAtTime(state.volumes[k], ctx.currentTime, 0.08);
    }
  }
  function setVolume(bus, value) {
    if (!bus || state.volumes[bus] == null) return; state.volumes[bus] = clamp(+value || 0, 0, 1); if (state.inited) applyAllVolumes();
  }
  function getVolume(bus) {
    return bus && state.volumes[bus] != null ? state.volumes[bus] : 0;
  }
  function duck(seconds) {
    if (!state.inited) return; var s = clamp(+seconds || 1.5, 0.1, 20); state.duckUntil = Math.max(state.duckUntil, ctx.currentTime + s);
    if (buses.music && !state.ducked) {
      state.ducked = true; buses.music.duck.gain.setTargetAtTime(0.22, ctx.currentTime, 0.08); buses.ambient.duck.gain.setTargetAtTime(0.4, ctx.currentTime, 0.1);
    }
  }
  function updateDuck(now) {
    var active = state.duckUntil > now + 0.02; if (active === state.ducked || !buses.music) return; state.ducked = active;
    buses.music.duck.gain.setTargetAtTime(active ? 0.22 : 1, now, active ? 0.08 : 0.6); buses.ambient.duck.gain.setTargetAtTime(active ? 0.4 : 1, now, active ? 0.1 : 0.7);
  }
  function scheduleCleanup(nodes, endTime) {
    cleanups.push({ n: nodes, t: endTime }); if (cleanups.length > 500) sweepCleanups(-1, true);
  }
  function sweepCleanups(nowT, force) {
    for (var i = cleanups.length - 1; i >= 0; i--) {
      if (!force && nowT < cleanups[i].t + 0.1) continue; var arr = cleanups[i].n;
      for (var j = 0; j < arr.length; j++) {
        try { if (arr[j] && arr[j].disconnect) arr[j].disconnect(); } catch (e) { /* 已断开 */ }
      }
      cleanups.splice(i, 1);
    }
  }
  function resume() {
    if (!state.inited) return; state.paused = false;
    try { if (ctx.state === 'suspended') { var rp = ctx.resume(); if (rp && rp.catch) rp.catch(function () { /* 忽略 */ }); } } catch (e) { /* 忽略 */ }
    applyMaster(); resyncMusic();
  }
  function suspend() {
    if (!state.inited) return; state.paused = true;
    try { var sp = ctx.suspend(); if (sp && sp.catch) sp.catch(function () { /* 忽略 */ }); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 3. 合成基元：轨道 / 振荡器 / 噪声 / 包络 / 金属 / 低语 ---------- */
  function mk(busName, vol, pan, rev, dly, dest, clip) {
    var inG = ctx.createGain(); var level = ctx.createGain(); level.gain.value = vol; var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; var nodes = [inG, level], head = inG;
    if (clip) {
      var ws = softClipNode(clip); inG.connect(ws); head = ws; nodes.push(ws);
    }
    head.connect(level);
    if (p) { p.pan.value = clamp(pan || 0, -1, 1); level.connect(p); nodes.push(p); }
    var out = p || level; out.connect(dest || buses[busName].input);
    if (rev) {
      var rs = ctx.createGain(); rs.gain.value = rev; out.connect(rs); rs.connect(reverbIn); nodes.push(rs);
    }
    if (dly) {
      var ds = ctx.createGain(); ds.gain.value = dly; out.connect(ds); ds.connect(delayIn); nodes.push(ds);
    }
    return {
      in: inG, level: level, pan: p, nodes: nodes, end: 0, add: function (n) { nodes.push(n); return n; },
      until: function (x) { if (x > this.end) this.end = x; },
      done: function (extra) { scheduleCleanup(nodes, this.end + (extra == null ? 0.3 : extra)); }
    };
  }
  function bq(type, f, q) {
    var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = Math.max(20, R(f)); b.Q.value = q == null ? 1 : q;
    return b;
  }

  // 振荡器音色：包络 + 可选滤波/扫频/滑音/颤音
  function TONE(tr, o) {
    var t = o.t, dur = o.dur == null ? 0.25 : Math.max(0.02, o.dur); var a = o.a == null ? 0.004 : Math.max(0.002, o.a);
    var os = ctx.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(Math.max(8, R(o.f || 440)), t);
    if (o.to) os.frequency.exponentialRampToValueAtTime(Math.max(8, R(o.to)), t + Math.max(0.02, o.glide == null ? dur : o.glide)); if (o.detune) os.detune.value = o.detune; var head = os;
    if (o.filter) {
      var flt = ctx.createBiquadFilter(); flt.type = o.filter.t || 'lowpass'; flt.frequency.setValueAtTime(Math.max(30, R(o.filter.f || 900)), t);
      if (o.filter.to) flt.frequency.exponentialRampToValueAtTime(Math.max(30, R(o.filter.to)), t + dur);
      flt.Q.value = o.filter.q == null ? 0.9 : o.filter.q; if (o.filter.gain != null) flt.gain.value = o.filter.gain; head.connect(flt); head = flt; tr.add(flt);
    }
    var g = ctx.createGain(); head.connect(g); g.connect(tr.in); var lv = Math.max(0.0002, o.level == null ? 0.12 : o.level);
    var end = t + a + dur; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lv, t + a); g.gain.exponentialRampToValueAtTime(0.0001, end);
    if (o.vib) {
      var l = ctx.createOscillator(); l.type = 'sine'; l.frequency.value = o.vib;
      var lg = ctx.createGain(); lg.gain.value = o.vibd == null ? 8 : o.vibd; l.connect(lg); lg.connect(os.detune); l.start(t); l.stop(end + 0.1); tr.add(l); tr.add(lg);
    }
    os.start(t); os.stop(end + 0.08); tr.add(os); tr.add(g); tr.until(end + 0.12);
    return { g: g, os: os, end: end };
  }

  // 噪声：共享 buffer 随机偏移；支持 hp/bp/lp、扫频、AM 由外部添加
  function NOISE(tr, o) {
    var t = o.t, dur = o.dur == null ? 0.15 : Math.max(0.02, o.dur); var a = o.a == null ? 0.004 : Math.max(0.002, o.a);
    var src = ctx.createBufferSource(); src.buffer = o.brown ? NOISE_BROWN : NOISE_WHITE; src.loop = dur > 1.7;
    src.playbackRate.value = (o.rate == null ? 1 : o.rate) * curRate; var head = src, f;
    if (o.hp) { f = bq('highpass', o.hp, o.q); head.connect(f); head = f; tr.add(f); }
    if (o.bp) {
      f = bq('bandpass', o.bp, o.q == null ? 1.1 : o.q); if (o.bpTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, R(o.bpTo)), t + (o.sweep || dur));
      head.connect(f); head = f; tr.add(f);
    } else if (o.lp) {
      f = bq('lowpass', o.lp, o.q == null ? 0.9 : o.q); if (o.lpTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, R(o.lpTo)), t + (o.sweep || dur));
      head.connect(f); head = f; tr.add(f);
    }
    var g = ctx.createGain(); head.connect(g); g.connect(tr.in); var lv = Math.max(0.0002, o.level == null ? 0.1 : o.level);
    var end = t + a + dur; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lv, t + a); g.gain.exponentialRampToValueAtTime(0.0001, end); var off = Math.random();
    if (!src.loop) off = Math.random() * Math.max(0.01, src.buffer.duration - Math.min(dur, 1.8) - 0.05);
    try { src.start(t, off); } catch (e) { src.start(t); }
    src.stop(end + 0.08); tr.add(src); tr.add(g); tr.until(end + 0.12);
    return { g: g, src: src };
  }
  function AM(tr, param, hz, depth, t, dur, type) {
    var l = ctx.createOscillator(); l.type = type || 'sine'; l.frequency.value = hz; var g = ctx.createGain(); g.gain.value = depth;
    l.connect(g); g.connect(param); l.start(t); l.stop(t + dur + 0.08); tr.add(l); tr.add(g); tr.until(t + dur + 0.12);
  }
  function movePan(tr, t, dur, a, b) {
    if (!tr.pan) return; tr.pan.pan.setValueAtTime(clamp(a, -1, 1), t); tr.pan.pan.linearRampToValueAtTime(clamp(b, -1, 1), t + Math.max(0.02, dur));
  }
  function softClipNode(k) {
    var n = 1024, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = i * 2 / (n - 1) - 1; curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    var ws = ctx.createWaveShaper(); ws.curve = curve; ws.oversample = '2x';
    return ws;
  }
  function CLICK(tr, t, lv, f) {
    var fr = f || 2000; NOISE(tr, { t: t, dur: 0.028, level: lv * 0.7, hp: fr, a: 0.001, d: 0.02 }); TONE(tr, { t: t, f: fr * 0.5, to: fr * 0.28, dur: 0.035, level: lv * 0.4, a: 0.001 });
  }
  function THUMP(tr, t, lv, f) {
    var fr = f || 64; TONE(tr, { t: t, f: fr, to: fr * 0.45, dur: 0.3, glide: 0.14, level: lv, a: 0.005, filter: { t: 'lowpass', f: 170, q: 1 } });
    NOISE(tr, { t: t, dur: 0.11, level: lv * 0.18, lp: 190, a: 0.003, d: 0.09 });
  }
  function METAL(tr, t, base, lv, dur, n) {
    var ratios = [1, 2.17, 3.39, 4.83, 6.71, 8.31]; n = n || 4;
    for (var i = 0; i < n; i++) {
      TONE(tr, {
        t: t, f: base * ratios[i] * rnd(0.985, 1.015), dur: dur * (1 - i * 0.11),
        level: lv * 0.85 / Math.pow(1.6, i), a: 0.002
      });
    }
    NOISE(tr, { t: t, dur: Math.min(0.16, dur), level: lv * 0.55, bp: base * 3.2, q: 0.9, a: 0.001, d: 0.1 });
  }

  // 气声低语：三段共振峰带通噪声 + 轻微调幅（音节感），不刺耳
  function WHISPER(tr, t, dur, lv) {
    var fs = [520, 1350, 2450];
    for (var i = 0; i < fs.length; i++) {
      var n = NOISE(tr, {
        t: t + rnd(0, 0.05), dur: dur, level: lv * (i === 0 ? 0.55 : 0.32),
        a: 0.012, d: dur * 0.9, bp: fs[i] * rnd(0.96, 1.04), q: 8, rate: rnd(0.92, 1.08)
      });
      AM(tr, n.g.gain, rnd(4.5, 7.5), lv * 0.22, t, dur);
    }
    var b = NOISE(tr, { t: t, dur: dur, level: lv * 0.22, a: 0.05, d: dur * 0.8, bp: 900, q: 1.2 }); AM(tr, b.g.gain, rnd(2.5, 4), lv * 0.07, t, dur);
  }

  /* ---------- 4. 一次性音效库（注册表：未知名安全 no-op） ---------- */
  var SFX = {};
  function S(name, fn, bus) { SFX[name] = { f: fn, bus: bus || 'sfx' }; }
  function playSfx(name, opts) {
    if (!state.inited || !ctx) return; var def = SFX[name]; if (!def || cleanups.length > 320) return; opts = opts || {};
    var t = ctx.currentTime + Math.max(0, +opts.delay || 0); var lv = clamp(opts.volume == null ? 1 : +opts.volume, 0, 2);
    var pan = clamp(opts.pan == null ? 0 : +opts.pan, -1, 1); var old = curRate; curRate = clamp(opts.rate == null ? 1 : +opts.rate, 0.3, 4); curBus = def.bus;
    try { def.f(t, lv, pan); } catch (e) { warn(e); }
    curBus = 'sfx'; curRate = old;
  }

  /* ---- 门 / 柜 ---- */
  S('door_open', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.45); CLICK(tr, t, 0.5, 1900); NOISE(tr, { t: t + 0.03, dur: 0.9, level: 0.09, a: 0.14, d: 0.78, bp: 700, bpTo: 1500, q: 1.6, rate: 0.85 });
    TONE(tr, { t: t + 0.05, type: 'sawtooth', f: 55, to: 140, dur: 0.85, glide: 0.7, level: 0.032, a: 0.25, filter: { t: 'bandpass', f: 420, q: 7 } });
    TONE(tr, { t: t + 0.72, f: 95, to: 42, dur: 0.28, level: 0.3, a: 0.004 }); tr.done();
  });
  S('door_close', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.4); NOISE(tr, { t: t, dur: 0.35, level: 0.12, a: 0.05, d: 0.3, bp: 900, bpTo: 400, q: 1.2 });
    CLICK(tr, t + 0.18, 0.35, 1700); THUMP(tr, t + 0.19, 0.55, 58); TONE(tr, { t: t + 0.2, f: 180, to: 70, dur: 0.18, level: 0.16, a: 0.004 }); tr.done();
  });
  S('door_locked', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.35); CLICK(tr, t, 0.4, 2400); for (var i = 0; i < 3; i++) CLICK(tr, t + 0.07 + i * rnd(0.05, 0.09), 0.28, rnd(2600, 3600));
    METAL(tr, t + 0.08, 320, 0.14, 0.25, 2); THUMP(tr, t + 0.12, 0.28, 55); tr.done();
  });
  S('door_creak', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.6);
    var v = TONE(tr, { t: t, type: 'sawtooth', f: rnd(80, 110), to: rnd(150, 200), dur: 1.25, glide: 1.1, level: 0.05, a: 0.18, filter: { t: 'bandpass', f: 820, q: 9 } });
    AM(tr, v.g.gain, rnd(9, 15), 0.028, t, 1.2); NOISE(tr, { t: t, dur: 1.3, level: 0.04, a: 0.2, d: 1.0, bp: 1400, q: 2, rate: 0.8 }); tr.done();
  });
  S('locker_open', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.4); TONE(tr, { t: t, type: 'sawtooth', f: 420, to: 640, dur: 0.22, level: 0.035, a: 0.02, filter: { t: 'bandpass', f: 1800, q: 8 } });
    CLICK(tr, t + 0.18, 0.3, 2200); METAL(tr, t + 0.2, 260, 0.16, 0.45, 3); tr.done();
  });
  S('locker_close', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.4); METAL(tr, t, 230, 0.2, 0.5, 3); CLICK(tr, t + 0.005, 0.3, 2600); THUMP(tr, t + 0.02, 0.22, 70); tr.done();
  });
  S('locker_slam', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.55); METAL(tr, t, 210, 0.32, 0.9, 5); NOISE(tr, { t: t, dur: 0.25, level: 0.3, a: 0.001, d: 0.2, bp: 1800, q: 0.8 }); THUMP(tr, t, 0.55, 52);
    TONE(tr, { t: t + 0.01, f: 320, to: 120, dur: 0.3, level: 0.1, a: 0.002 }); tr.done();
  });

  /* ---- 拾取 / 纸张 / 开关 ---- */
  S('pickup_item', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.35); TONE(tr, { t: t, f: 880, dur: 0.35, level: 0.1, a: 0.003 });
    TONE(tr, { t: t, f: 1320, dur: 0.28, level: 0.06, a: 0.003, detune: 6 }); CLICK(tr, t + 0.01, 0.2, 2600); tr.done();
  });
  S('pickup_paper', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.25);
    for (var i = 0; i < 5; i++) NOISE(tr, { t: t + rnd(0, 0.32), dur: rnd(0.03, 0.07), level: rnd(0.09, 0.16), hp: 1800, bp: rnd(2800, 4200), q: 1.6, a: 0.003, d: rnd(0.02, 0.05) });
    tr.done();
  });
  S('paper_slide', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.3); NOISE(tr, { t: t, dur: 0.45, level: 0.11, a: 0.06, d: 0.35, bp: 2400, bpTo: 1500, q: 1.2 });
    NOISE(tr, { t: t + 0.08, dur: 0.25, level: 0.05, a: 0.04, d: 0.2, hp: 3000 }); tr.done();
  });
  S('switch_click', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.15); CLICK(tr, t, 0.35, 2800); CLICK(tr, t + 0.055, 0.22, 2100); tr.done();
  });
  S('fuse_switch', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.3); CLICK(tr, t, 0.35, 1500); THUMP(tr, t + 0.01, 0.25, 70);
    var v = TONE(tr, { t: t + 0.03, type: 'sawtooth', f: 100, dur: 0.4, level: 0.07, a: 0.005, filter: { t: 'lowpass', f: 900 } }); AM(tr, v.g.gain, 30, 0.03, t + 0.03, 0.38); tr.done();
  });
  S('machine_hum', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.35); TONE(tr, { t: t, f: 52, dur: 1.5, level: 0.12, a: 0.2 }); TONE(tr, { t: t, f: 104, dur: 1.4, level: 0.04, a: 0.25, detune: 4 });
    TONE(tr, { t: t, type: 'sawtooth', f: 208, dur: 1.2, level: 0.025, a: 0.3, filter: { t: 'lowpass', f: 700 } });
    NOISE(tr, { t: t, dur: 1.4, level: 0.035, a: 0.25, d: 1.1, lp: 400 }); tr.done();
  });

  /* ---- 灯具 / 玻璃 / 金属 ---- */
  S('bulb_buzz', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.3); var v = TONE(tr, { t: t, type: 'sawtooth', f: 120, dur: 0.8, level: 0.07, a: 0.01, filter: { t: 'bandpass', f: 1600, q: 2.5 } });
    AM(tr, v.g.gain, 100, 0.035, t, 0.78); AM(tr, v.g.gain, 5.3, 0.015, t, 0.78); NOISE(tr, { t: t, dur: 0.7, level: 0.04, a: 0.01, d: 0.6, hp: 3000 }); tr.done();
  });
  S('bulb_pop', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.5); CLICK(tr, t, 0.45, 3000); NOISE(tr, { t: t, dur: 0.35, level: 0.18, a: 0.001, d: 0.3, hp: 3500 }); METAL(tr, t + 0.01, 1800, 0.1, 0.5, 3); tr.done();
  });
  S('glass_break', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.55); NOISE(tr, { t: t, dur: 0.35, level: 0.22, a: 0.001, d: 0.3, hp: 2500 });
    for (var i = 0; i < 6; i++) TONE(tr, { t: t + rnd(0, 0.12), f: rnd(2400, 7200), dur: rnd(0.1, 0.35), level: rnd(0.025, 0.06), a: 0.001 }); tr.done();
  });
  S('metal_impact', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.6); var base = rnd(160, 380); METAL(tr, t, base, 0.3, 1.0, 4);
    NOISE(tr, { t: t, dur: 0.12, level: 0.16, a: 0.001, d: 0.1, bp: base * 6, q: 1.2 }); THUMP(tr, t, 0.25, 58); tr.done();
  });
  S('gurney_squeak', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.35);
    for (var i = 0; i < 2; i++) {
      var v = TONE(tr, { t: t + i * 0.28, f: rnd(620, 760), to: rnd(1050, 1250), dur: 0.3, level: 0.055, a: 0.02, filter: { t: 'bandpass', f: 1800, q: 6 } });
      AM(tr, v.g.gain, rnd(8, 12), 0.02, t + i * 0.28, 0.28);
    }
    CLICK(tr, t + 0.05, 0.16, 1800); NOISE(tr, { t: t + 0.1, dur: 0.4, level: 0.035, bp: 2200, q: 1.5, a: 0.1, d: 0.3 }); tr.done();
  });
  S('wheelchair_squeak', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.4); var v = TONE(tr, { t: t, f: rnd(1150, 1350), to: rnd(1700, 1950), dur: 0.35, level: 0.05, a: 0.03, filter: { t: 'bandpass', f: 2400, q: 7 } });
    AM(tr, v.g.gain, 9, 0.02, t, 0.33); for (var i = 0; i < 3; i++) CLICK(tr, t + 0.2 + i * rnd(0.12, 0.2), 0.12, rnd(1600, 2400)); tr.done();
  });
  S('drip', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.85, 0.12); TONE(tr, { t: t, f: rnd(1100, 1500), to: rnd(380, 520), dur: 0.09, glide: 0.07, level: 0.2, a: 0.001 });
    NOISE(tr, { t: t + 0.01, dur: 0.05, level: 0.07, bp: 2800, q: 2, a: 0.001, d: 0.04 }); tr.done();
  });

  /* ---- 磁带 / 无线电 ---- */
  S('tape_static', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.3); var n = NOISE(tr, { t: t, dur: 1.2, level: 0.1, a: 0.03, d: 1.0, bp: 2800, q: 0.7 });
    AM(tr, n.g.gain, 23, 0.03, t, 1.15); TONE(tr, { t: t, f: 50, dur: 1.1, level: 0.03, a: 0.1 }); tr.done();
  });
  S('tape_play', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.3); CLICK(tr, t, 0.35, 1800); var n = NOISE(tr, { t: t + 0.04, dur: 1.0, level: 0.08, a: 0.08, d: 0.85, bp: 2400, q: 0.8 });
    AM(tr, n.g.gain, 17, 0.02, t + 0.04, 0.95); TONE(tr, { t: t + 0.04, type: 'sawtooth', f: 58, dur: 1.0, level: 0.02, a: 0.2, filter: { t: 'lowpass', f: 300 } }); tr.done();
  });
  S('tape_stop', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.3); CLICK(tr, t, 0.35, 1500); NOISE(tr, { t: t + 0.02, dur: 0.3, level: 0.09, a: 0.01, d: 0.25, bp: 2200, bpTo: 500, q: 1 });
    TONE(tr, { t: t + 0.03, type: 'sawtooth', f: 320, to: 60, dur: 0.35, level: 0.035, a: 0.01, filter: { t: 'lowpass', f: 900 } }); tr.done();
  });
  S('radio_noise', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.4); var n = NOISE(tr, { t: t, dur: 1.4, level: 0.09, a: 0.05, d: 1.2, bp: 1400, bpTo: 2600, q: 2.5 }); AM(tr, n.g.gain, 7.3, 0.025, t, 1.35);
    var h = TONE(tr, { t: t + 0.15, f: rnd(1500, 2200), dur: 0.9, level: 0.015, a: 0.2, filter: { t: 'bandpass', f: 1900, q: 12 } }); AM(tr, h.g.gain, 4.1, 0.01, t + 0.15, 0.85); tr.done();
  });

  /* ---- UI / 手电 / 键盘 ---- */
  S('ui_click', function (t, lv, pan) {
    var tr = mk('ui', lv, pan, 0.05); TONE(tr, { t: t, f: 1450, to: 900, dur: 0.045, level: 0.16, a: 0.002 });
    NOISE(tr, { t: t, dur: 0.02, level: 0.05, hp: 3000, a: 0.001, d: 0.015 }); tr.done();
  }, 'ui');
  S('ui_hover', function (t, lv, pan) {
    var tr = mk('ui', lv, pan, 0.03); TONE(tr, { t: t, f: 2100, dur: 0.03, level: 0.07, a: 0.002 }); tr.done();
  }, 'ui');
  S('ui_back', function (t, lv, pan) {
    var tr = mk('ui', lv, pan, 0.05); TONE(tr, { t: t, f: 900, dur: 0.05, level: 0.1, a: 0.002 }); TONE(tr, { t: t + 0.06, f: 620, dur: 0.07, level: 0.09, a: 0.002 }); tr.done();
  }, 'ui');
  S('flashlight_on', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.15); CLICK(tr, t, 0.3, 1800); TONE(tr, { t: t + 0.01, type: 'sawtooth', f: 2100, dur: 0.07, level: 0.018, a: 0.005, filter: { t: 'highpass', f: 1200 } });
    tr.done();
  });
  S('flashlight_off', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.15); CLICK(tr, t, 0.28, 1400); tr.done();
  });
  S('battery_low', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.1); TONE(tr, { t: t, f: 320, dur: 0.09, level: 0.1, a: 0.004, filter: { t: 'lowpass', f: 1200 } });
    TONE(tr, { t: t + 0.14, f: 260, dur: 0.12, level: 0.09, a: 0.004, filter: { t: 'lowpass', f: 1000 } }); tr.done();
  });
  S('keypad_beep', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.1); TONE(tr, { t: t, f: 1046, dur: 0.07, level: 0.12, a: 0.003 }); tr.done();
  });
  S('keypad_ok', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.12); TONE(tr, { t: t, f: 880, dur: 0.06, level: 0.11, a: 0.003 }); TONE(tr, { t: t + 0.09, f: 1320, dur: 0.1, level: 0.1, a: 0.003 }); tr.done();
  });
  S('keypad_err', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.12); var v = TONE(tr, { t: t, type: 'sawtooth', f: 180, dur: 0.22, level: 0.09, a: 0.005, filter: { t: 'lowpass', f: 700 } });
    AM(tr, v.g.gain, 30, 0.04, t, 0.2); tr.done();
  });
  S('elevator_ding', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.85); TONE(tr, { t: t, f: 1244, dur: 1.8, level: 0.1, a: 0.002 }); TONE(tr, { t: t, f: 1866, dur: 1.4, level: 0.05, a: 0.002, detune: 4 });
    TONE(tr, { t: t, f: 2489, dur: 1.0, level: 0.025, a: 0.002 }); tr.done();
  });
  S('elevator_open', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.55); NOISE(tr, { t: t, dur: 0.9, level: 0.08, a: 0.15, d: 0.7, bp: 600, bpTo: 1300, q: 1.1 });
    TONE(tr, { t: t, f: 48, dur: 1.1, level: 0.12, a: 0.2 }); CLICK(tr, t + 0.7, 0.2, 1800); tr.done();
  });
  S('door_heavy', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.7); THUMP(tr, t, 0.5, 44); METAL(tr, t, 95, 0.2, 1.2, 3);
    NOISE(tr, { t: t, dur: 0.4, level: 0.12, a: 0.005, d: 0.35, lp: 500 }); CLICK(tr, t + 0.03, 0.3, 1200); tr.done();
  });
  S('chair_scrape', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.3); var n = NOISE(tr, { t: t, dur: 0.55, level: 0.12, a: 0.04, d: 0.48, bp: 1000, bpTo: 1900, q: 2.4 }); AM(tr, n.g.gain, 8.5, 0.035, t, 0.5);
    TONE(tr, { t: t + 0.05, f: rnd(900, 1200), to: rnd(1400, 1700), dur: 0.3, level: 0.02, a: 0.03, filter: { t: 'bandpass', f: 2000, q: 8 } }); tr.done();
  });
  S('bodybag_zip', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.25); var n = NOISE(tr, { t: t, dur: 0.65, level: 0.12, a: 0.02, d: 0.58, bp: 4800, q: 0.9 }); AM(tr, n.g.gain, 38, 0.05, t, 0.6);
    for (var i = 0; i < 6; i++) NOISE(tr, { t: t + rnd(0, 0.55), dur: 0.02, level: 0.05, hp: 4000, a: 0.001, d: 0.015 }); tr.done();
  });

  /* ---- 遥远人声 / 实体 ---- */
  S('whistle_distant', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.95);
    TONE(tr, { t: t, f: rnd(660, 760), to: rnd(600, 660), dur: 1.7, glide: 1.4, level: 0.045, a: 0.3, vib: 5.4, vibd: 12, filter: { t: 'lowpass', f: 2200 } });
    TONE(tr, { t: t + 0.02, f: rnd(1320, 1500), dur: 1.2, level: 0.012, a: 0.35 }); tr.done();
  });
  S('child_giggle', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.8);
    for (var i = 0; i < 4; i++) {
      var f = rnd(480, 700) * (1 - i * 0.05);
      var v = TONE(tr, { t: t + i * 0.17 + rnd(0, 0.03), type: 'triangle', f: f, to: f * rnd(0.8, 0.9), dur: 0.13, level: 0.06, a: 0.008, filter: { t: 'bandpass', f: rnd(900, 1500), q: 4 }, vib: 16, vibd: 20 });
      AM(tr, v.g.gain, 18, 0.03, t + i * 0.17, 0.12);
    }
    NOISE(tr, { t: t, dur: 0.6, level: 0.025, a: 0.05, d: 0.5, bp: 1600, q: 1.4 }); tr.done();
  });
  S('woman_whisper', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.85); movePan(tr, t, 1.3, clamp(pan - 0.5, -1, 1), clamp(pan + 0.5, -1, 1)); WHISPER(tr, t, rnd(1.1, 1.5), 0.5); tr.done();
  });
  S('distant_cry', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.92);
    for (var i = 0; i < 3; i++) {
      var f = rnd(500, 650) - i * 35;
      TONE(tr, { t: t + i * 0.55 + rnd(0, 0.08), f: f, to: f * rnd(0.75, 0.88), dur: rnd(0.4, 0.6), level: 0.035, a: 0.12, vib: 5.5, vibd: 18, filter: { t: 'bandpass', f: 900, q: 2 } });
      NOISE(tr, { t: t + i * 0.55, dur: 0.5, level: 0.02, a: 0.15, d: 0.35, bp: 1200, q: 1.5 });
    }
    tr.done();
  });
  S('entity_breath', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.45); movePan(tr, t, 1.4, clamp(pan + (pan < 0 ? -0.45 : 0.45), -1, 1), pan * 0.2);
    NOISE(tr, { t: t, dur: 0.55, level: 0.12, a: 0.25, d: 0.3, bp: 520, q: 1.1 });
    NOISE(tr, { t: t + 0.65, dur: 0.7, level: 0.15, a: 0.06, d: 0.6, bp: 380, bpTo: 300, q: 1.2 });
    TONE(tr, { t: t + 0.65, f: 70, to: 52, dur: 0.6, level: 0.03, a: 0.1, filter: { t: 'lowpass', f: 200 } }); tr.done();
  });
  S('entity_growl', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.5, 0, null, 1.7);
    var v = TONE(tr, { t: t, type: 'sawtooth', f: 52, to: 38, dur: 1.35, level: 0.13, a: 0.06, filter: { t: 'lowpass', f: 320, to: 220, q: 2 } }); AM(tr, v.g.gain, 23, 0.05, t, 1.3);
    TONE(tr, { t: t, type: 'sawtooth', f: 96, to: 70, dur: 1.2, level: 0.04, a: 0.08, filter: { t: 'lowpass', f: 400 } });
    NOISE(tr, { t: t, dur: 1.3, level: 0.05, a: 0.1, d: 1.1, bp: 420, q: 1.3 }); tr.done();
  });
  S('entity_scream', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.65, 0, null, 1.8);
    for (var i = 0; i < 3; i++) TONE(tr, { t: t, type: 'sawtooth', f: rnd(380, 560), to: rnd(180, 900), dur: 1.1, level: 0.11, a: 0.01, vib: rnd(20, 36), vibd: 60, filter: { t: 'bandpass', f: rnd(1000, 1800), q: 2 } });
    NOISE(tr, { t: t, dur: 1.0, level: 0.16, a: 0.01, d: 0.9, bp: 1800, q: 0.8 }); NOISE(tr, { t: t, dur: 1.3, level: 0.08, a: 0.02, d: 1.1, bp: 3200, q: 0.6 });
    TONE(tr, { t: t + 0.05, f: rnd(2400, 3200), to: rnd(1200, 1800), dur: 0.7, level: 0.04, a: 0.005 }); tr.done();
  });
  S('heartbeat_once', function (t, lv, pan) {
    heartPair(t, 1.15 * lv, pan);
  });
  S('alarm_distant', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.9);
    for (var i = 0; i < 3; i++) {
      TONE(tr, { t: t + i * 0.42, type: 'square', f: i % 2 ? 880 : 660, dur: 0.3, level: 0.035, a: 0.01, filter: { t: 'lowpass', f: 1300 } });
    }
    tr.done();
  });
  S('phone_ring', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.45);
    for (var r = 0; r < 2; r++) {
      var t0 = t + r * 0.95; var v = TONE(tr, { t: t0, f: 1180, dur: 0.45, level: 0.06, a: 0.005 });
      AM(tr, v.g.gain, 19, 0.05, t0, 0.44); var v2 = TONE(tr, { t: t0, f: 1770, dur: 0.4, level: 0.03, a: 0.005 }); AM(tr, v2.g.gain, 19, 0.025, t0, 0.4);
    }
    tr.done();
  });
  S('clock_tick', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.35); var f = Math.random() < 0.5 ? 2400 : 1900; NOISE(tr, { t: t, dur: 0.018, level: 0.06, hp: 2800, a: 0.001, d: 0.012 });
    TONE(tr, { t: t, f: f, dur: 0.03, level: 0.035, a: 0.001 }); tr.done();
  });
  S('wind_gust', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.5); movePan(tr, t, 2.4, clamp(pan - 0.35, -1, 1), clamp(pan + 0.35, -1, 1));
    NOISE(tr, { t: t, dur: 2.6, level: 0.11, a: 0.9, d: 1.5, bp: 320, bpTo: 900, q: 0.7, brown: true });
    NOISE(tr, { t: t + 0.3, dur: 1.8, level: 0.03, a: 0.7, d: 1.0, hp: 2000 }); tr.done();
  });
  S('chain_rattle', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.55); for (var i = 0; i < 9; i++) METAL(tr, t + rnd(0, 0.7), rnd(420, 1300), rnd(0.02, 0.06), 0.25, 2); tr.done();
  });
  S('pipe_bang', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.9); var base = rnd(120, 190); METAL(tr, t, base, 0.28, 2.0, 5); THUMP(tr, t, 0.3, 50);
    NOISE(tr, { t: t, dur: 0.25, level: 0.12, a: 0.001, d: 0.2, bp: 1500, q: 0.7 }); tr.done();
  });
  S('scare_hit', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.5, 0, null, 1.6); THUMP(tr, t, 0.5, 55); NOISE(tr, { t: t, dur: 0.4, level: 0.3, a: 0.001, d: 0.35, bp: 1200, q: 0.7 }); METAL(tr, t, 220, 0.28, 0.7, 4);
    TONE(tr, { t: t, type: 'sawtooth', f: 90, to: 30, dur: 0.8, level: 0.2, a: 0.003, filter: { t: 'lowpass', f: 500 } }); tr.done();
  });
  S('sanity_whisper', function (t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.85); movePan(tr, t, 1.8, clamp(pan - 0.7, -1, 1), clamp(pan + 0.7, -1, 1));
    WHISPER(tr, t, rnd(1.3, 2.0), 0.42); NOISE(tr, { t: t + 0.2, dur: 1.2, level: 0.03, a: 0.3, d: 0.9, bp: 3200, q: 0.8 }); tr.done();
  });

  /* ---------- 5. 循环音效 ---------- */
  var LOOPS = {};
  function L(name, fn) { LOOPS[name] = fn; }
  function lsrc(tr, loop, brown) {
    var s = ctx.createBufferSource(); s.buffer = brown ? NOISE_BROWN : NOISE_WHITE; s.loop = true; s.start(); tr.add(s); loop.srcs.push(s);
    return s;
  }
  function losc(tr, loop, type, f) {
    var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); tr.add(o); loop.srcs.push(o);
    return o;
  }
  function lfilt(tr, type, f, q) {
    var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.8 : q; tr.add(b);
    return b;
  }
  function lgn(tr, v) { var g = ctx.createGain(); g.gain.value = v; tr.add(g); return g; }
  function llfo(tr, loop, hz, depth, target) {
    var o = losc(tr, loop, 'sine', hz), g = lgn(tr, depth); o.connect(g); g.connect(target);
    return o;
  }

  L('tape_loop', function (tr, loop) {
    var n = lsrc(tr, loop, false); var hp = lfilt(tr, 'highpass', 350, 0.7), bp = lfilt(tr, 'bandpass', 2600, 0.9), g = lgn(tr, 0.3);
    n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(tr.in); llfo(tr, loop, 0.37, 400, bp.frequency);
    llfo(tr, loop, 0.23, 0.03, n.playbackRate); var am = lgn(tr, 0.1), al = losc(tr, loop, 'sine', 13);
    al.connect(am); am.connect(g.gain); var hum = losc(tr, loop, 'sine', 50), hg = lgn(tr, 0.03); hum.connect(hg); hg.connect(tr.in);
  });
  L('radio_loop', function (tr, loop) {
    var n = lsrc(tr, loop, false); var bp = lfilt(tr, 'bandpass', 1600, 4), g = lgn(tr, 0.26); n.connect(bp); bp.connect(g); g.connect(tr.in); llfo(tr, loop, 0.13, 500, bp.frequency);
    var am = lgn(tr, 0.09), al = losc(tr, loop, 'sine', 7.3); al.connect(am); am.connect(g.gain);
    var wh = losc(tr, loop, 'sine', 1900), wg = lgn(tr, 0.018); wh.connect(wg); wg.connect(tr.in); llfo(tr, loop, 0.31, 40, wh.frequency);
  });
  L('elevator_hum', function (tr, loop) {
    var a = losc(tr, loop, 'sine', 55), b = losc(tr, loop, 'sawtooth', 110), lp = lfilt(tr, 'lowpass', 400, 1);
    var g = lgn(tr, 0.16); a.connect(g); b.connect(lp); lp.connect(g); g.connect(tr.in); var n = lsrc(tr, loop, true), nl = lfilt(tr, 'lowpass', 260, 0.7), ng = lgn(tr, 0.1);
    n.connect(nl); nl.connect(ng); ng.connect(tr.in); var am = lgn(tr, 0.03), al = losc(tr, loop, 'sine', 0.17); al.connect(am); am.connect(g.gain);
  });
  L('machine_hum', function (tr, loop) {
    var a = losc(tr, loop, 'sawtooth', 58), b = losc(tr, loop, 'sine', 116);
    var lp = lfilt(tr, 'lowpass', 700, 1.4), g = lgn(tr, 0.13); a.connect(lp); lp.connect(g); b.connect(g); g.connect(tr.in);
    var n = lsrc(tr, loop, false), bp = lfilt(tr, 'bandpass', 1200, 1.5), ng = lgn(tr, 0.06);
    n.connect(bp); bp.connect(ng); ng.connect(tr.in); var am = lgn(tr, 0.035), al = losc(tr, loop, 'sine', 7); al.connect(am); am.connect(g.gain);
  });
  L('fluorescent_buzz', function (tr, loop) {
    var a = losc(tr, loop, 'sawtooth', 120), b = losc(tr, loop, 'square', 240);
    var bp = lfilt(tr, 'bandpass', 1700, 2.2), g = lgn(tr, 0.08); a.connect(bp); b.connect(bp); bp.connect(g); g.connect(tr.in);
    var am = lgn(tr, 0.04), al = losc(tr, loop, 'sine', 100); al.connect(am); am.connect(g.gain);
    var fl = lgn(tr, 0.025), fls = losc(tr, loop, 'sine', 2.7); fls.connect(fl); fl.connect(g.gain); var n = lsrc(tr, loop, false), hp = lfilt(tr, 'highpass', 3200, 0.7), ng = lgn(tr, 0.02);
    n.connect(hp); hp.connect(ng); ng.connect(tr.in);
  });
  L('wind_loop', function (tr, loop) {
    var n = lsrc(tr, loop, true), bp = lfilt(tr, 'bandpass', 420, 0.6), g = lgn(tr, 0.4); n.connect(bp); bp.connect(g); g.connect(tr.in); llfo(tr, loop, 0.063, 240, bp.frequency);
    var am = lgn(tr, 0.12), al = losc(tr, loop, 'sine', 0.09); al.connect(am); am.connect(g.gain);
  });
  L('water_loop', function (tr, loop) {
    var n = lsrc(tr, loop, false), bp = lfilt(tr, 'bandpass', 1100, 5), g = lgn(tr, 0.2); n.connect(bp); bp.connect(g); g.connect(tr.in);
    var n2 = lsrc(tr, loop, true), lp = lfilt(tr, 'lowpass', 260, 0.8), g2 = lgn(tr, 0.12); n2.connect(lp); lp.connect(g2); g2.connect(tr.in); llfo(tr, loop, 0.21, 0.07, g.gain);
  });
  L('alarm_loop', function (tr, loop) {
    var a = losc(tr, loop, 'square', 660), b = losc(tr, loop, 'square', 880);
    var lp = lfilt(tr, 'lowpass', 1500, 0.8), g = lgn(tr, 0.055); a.connect(lp); b.connect(lp); lp.connect(g); g.connect(tr.in);
    var am = lgn(tr, 0.05), al = losc(tr, loop, 'sine', 1.2); al.connect(am); am.connect(g.gain);
  });
  L('breath_loop', function (tr, loop) {
    var n = lsrc(tr, loop, false), bp = lfilt(tr, 'bandpass', 700, 1.1), g = lgn(tr, 0.16); n.connect(bp); bp.connect(g); g.connect(tr.in); llfo(tr, loop, 0.24, 0.13, g.gain);
    var n2 = lsrc(tr, loop, false), bp2 = lfilt(tr, 'bandpass', 430, 1), g2 = lgn(tr, 0.09); n2.connect(bp2); bp2.connect(g2); g2.connect(tr.in); llfo(tr, loop, 0.235, 0.07, g2.gain);
  });
  function startLoop(name, opts) {
    if (!state.inited) return 0; var fn = LOOPS[name]; if (!fn) return 0; opts = opts || {};
    var id = ++loopSeq; var pan = clamp(opts.pan == null ? 0 : +opts.pan, -1, 1);
    var busName = buses[opts.bus] ? opts.bus : 'sfx'; var tr = mk(busName, 0.0001, pan, 0.3);
    var loop = { id: id, name: name, tr: tr, srcs: [] }; var v = clamp(opts.volume == null ? 0.7 : +opts.volume, 0, 2);
    try {
      fn(tr, loop, opts);
    } catch (e) {
      warn(e);
    }
    var t = ctx.currentTime; tr.level.gain.cancelScheduledValues(t); tr.level.gain.setValueAtTime(0.0001, t);
    tr.level.gain.linearRampToValueAtTime(Math.max(0.0002, v), t + 0.35); loops[id] = loop;
    return id;
  }
  function stopLoop(loopId, fade) {
    if (!state.inited) return; var l = loops[loopId]; if (!l) return; delete loops[loopId];
    var t = ctx.currentTime, f = clamp(fade == null ? 1 : +fade, 0.03, 10); l.tr.level.gain.cancelScheduledValues(t); l.tr.level.gain.linearRampToValueAtTime(0.0001, t + f);
    for (var i = 0; i < l.srcs.length; i++) {
      try { l.srcs[i].stop(t + f + 0.05); } catch (e) { /* 已停止 */ }
    }
    scheduleCleanup(l.tr.nodes, t + f + 0.3);
  }

  /* ---------- 6. 环境床与随机环境事件 ---------- */
  function oscRaw(type, f) { var o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  function gainRaw(v) { var g = ctx.createGain(); g.gain.value = v; return g; }
  function loopSourceRaw(brown) {
    var s = ctx.createBufferSource(); s.buffer = brown ? NOISE_BROWN : NOISE_WHITE; s.loop = true;
    return s;
  }
  function buildAmbience() {
    ambRoot = gainRaw(0.0001); ambRoot.connect(buses.ambient.input);
    var rev = gainRaw(0.4); ambRoot.connect(rev); rev.connect(reverbIn);   // 环境也送入混响

    droneFilter = ctx.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 150; droneFilter.Q.value = 1.1; droneMix = gainRaw(0.5);
    droneFilter.connect(droneMix); droneMix.connect(ambRoot);

    droneA = oscRaw('sine', 41.2); droneB = oscRaw('sine', 55); droneC = oscRaw('triangle', 82.4);
    droneA.detune.value = -4; droneB.detune.value = 6;   // 轻微失谐 → 缓慢拍频，压迫感
    var ga = gainRaw(0.5), gb = gainRaw(0.38), gc = gainRaw(0.16); droneA.connect(ga); ga.connect(droneFilter);
    droneB.connect(gb); gb.connect(droneFilter); droneC.connect(gc); gc.connect(droneFilter); droneA.start(); droneB.start(); droneC.start();
    // 缓慢 LFO：呼吸般的滤波起伏 + 音量起伏
    var l1 = oscRaw('sine', 0.047), lg1 = gainRaw(55); l1.connect(lg1); lg1.connect(droneFilter.frequency); l1.start();
    var l2 = oscRaw('sine', 0.031), lg2 = gainRaw(0.16); l2.connect(lg2); lg2.connect(droneMix.gain); l2.start();

    // 低频噪声床
    noiseBed = loopSourceRaw(true); var nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 420; nf.Q.value = 0.7; noiseGain = gainRaw(0);
    noiseBed.connect(nf); nf.connect(noiseGain); noiseGain.connect(ambRoot); noiseBed.start();

    // 电流嗡鸣（50/100Hz）
    humA = oscRaw('sine', 50); humB = oscRaw('sine', 100); var hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 320; humGain = gainRaw(0);
    humA.connect(hf); humB.connect(hf); hf.connect(humGain); humGain.connect(ambRoot); humA.start(); humB.start();

    // 空气感高频
    airSrc = loopSourceRaw(false); var ah = ctx.createBiquadFilter(); ah.type = 'highpass'; ah.frequency.value = 4200;
    airGain = gainRaw(0); airSrc.connect(ah); ah.connect(airGain); airGain.connect(ambRoot); airSrc.start();

    // 风
    windSrc = loopSourceRaw(true); windBP = ctx.createBiquadFilter(); windBP.type = 'bandpass'; windBP.frequency.value = 500; windBP.Q.value = 0.6;
    windGain = gainRaw(0); windSrc.connect(windBP); windBP.connect(windGain); windGain.connect(ambRoot); windSrc.start();
    var wl = oscRaw('sine', 0.063), wlg = gainRaw(260); wl.connect(wlg); wlg.connect(windBP.frequency); wl.start();

    // 水 / 湿气
    waterSrc = loopSourceRaw(false); var wb = ctx.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 1100; wb.Q.value = 4; waterGain = gainRaw(0);
    waterSrc.connect(wb); wb.connect(waterGain); waterGain.connect(ambRoot); waterSrc.start();
  }

  // 环境档案：低频对、滤波、各层增益、随机事件池与平均间隔
  var AMB = {
    none: { bed: 0, drone: [41.2,55], cutoff: 120, noise: 0, hum: 0, air: 0, wind: 0, water: 0, events: [], rate: [30,60] },
    menu: { bed: 0.42, drone: [41.2,61.7], cutoff: 150, noise: 0.15, hum: 0, air: 0.05, wind: 0.03, water: 0,
      events: [['whistle_distant',0.5],['clock_tick',0.25],['heartbeat_once',0.4],['wind_gust',0.35],['child_giggle',0.2]], rate: [9,16] },
    room: { bed: 0.4, drone: [49,73.4], cutoff: 170, noise: 0.18, hum: 0.22, air: 0.03, wind: 0, water: 0.02,
      events: [['machine_hum',0.5],['bulb_buzz',0.4],['clock_tick',0.22],['drip',0.35],['metal_impact',0.25],['chair_scrape',0.3],['pipe_bang',0.22]], rate: [6,11] },
    corridor: { bed: 0.5, drone: [36.7,55], cutoff: 140, noise: 0.22, hum: 0.05, air: 0.05, wind: 0.16, water: 0.02,
      events: [['metal_impact',0.55],['pipe_bang',0.5],['drip',0.4],['door_creak',0.45],['wheelchair_squeak',0.35],['wind_gust',0.4],['whistle_distant',0.3]], rate: [5,9] },
    ward: { bed: 0.32, drone: [43.65,65.4], cutoff: 160, noise: 0.12, hum: 0.06, air: 0.1, wind: 0.03, water: 0.05,
      events: [['drip',0.4],['bulb_buzz',0.3],['gurney_squeak',0.4],['woman_whisper',0.3],['clock_tick',0.2],['entity_breath',0.25],['paper_slide',0.25]], rate: [7,12] },
    nurse: { bed: 0.4, drone: [46.25,69.3], cutoff: 150, noise: 0.16, hum: 0.08, air: 0.08, wind: 0.04, water: 0.04,
      events: [['child_giggle',0.42],['woman_whisper',0.45],['wheelchair_squeak',0.35],['door_creak',0.4],['bodybag_zip',0.3],['clock_tick',0.2],['heartbeat_once',0.35],['distant_cry',0.3]], rate: [5,9] },
    basement: { bed: 0.55, drone: [32.7,49], cutoff: 120, noise: 0.3, hum: 0.06, air: 0.03, wind: 0.1, water: 0.14,
      events: [['drip',0.5],['pipe_bang',0.5],['chain_rattle',0.4],['metal_impact',0.35],['wind_gust',0.35],['door_heavy',0.35],['entity_growl',0.2]], rate: [4,7] },
    cold: { bed: 0.38, drone: [38.9,58.3], cutoff: 130, noise: 0.2, hum: 0.03, air: 0.14, wind: 0.28, water: 0.02,
      events: [['wind_gust',0.5],['glass_break',0.25],['metal_impact',0.3],['drip',0.35],['whistle_distant',0.4],['entity_breath',0.25],['distant_cry',0.22]], rate: [4,8] },
    white: { bed: 0.2, drone: [55,82.4], cutoff: 240, noise: 0.05, hum: 0.02, air: 0.2, wind: 0.02, water: 0,
      events: [['clock_tick',0.2],['whistle_distant',0.25],['entity_breath',0.2],['heartbeat_once',0.25]], rate: [12,20] },
    chase: { bed: 0.5, drone: [41.2,43.65], cutoff: 200, noise: 0.3, hum: 0.08, air: 0.06, wind: 0.12, water: 0.04,
      events: [['metal_impact',0.55],['pipe_bang',0.5],['entity_growl',0.55],['chair_scrape',0.45],['alarm_distant',0.4],['entity_breath',0.5],['locker_slam',0.4]], rate: [2,4.5] }
  };
  function applyAmbience(name, fade) {
    if (!AMB[name]) name = 'none'; var p = AMB[name]; var t = ctx.currentTime; var f = clamp(fade == null ? 2.5 : +fade, 0.05, 15);
    var k = Math.max(0.03, f / 2.5); state.ambience = name; ambRoot.gain.setTargetAtTime(Math.max(0.0001, p.bed), t, k);
    droneA.frequency.setTargetAtTime(p.drone[0], t, k * 1.8); droneB.frequency.setTargetAtTime(p.drone[1], t, k * 1.8);
    droneC.frequency.setTargetAtTime(p.drone[1] * 1.5, t, k * 1.8); droneFilter.frequency.setTargetAtTime(p.cutoff, t, k);
    noiseGain.gain.setTargetAtTime(p.noise, t, k); humGain.gain.setTargetAtTime(p.hum, t, k); airGain.gain.setTargetAtTime(p.air, t, k); windGain.gain.setTargetAtTime(p.wind, t, k);
    waterGain.gain.setTargetAtTime(p.water, t, k); state.ambTimer = rnd(p.rate[0], p.rate[1]) * 0.5;
  }
  function setAmbience(profile, fade) {
    if (!state.inited) { state.ambience = profile || 'none'; return; }
    applyAmbience(profile, fade);
  }
  function updateAmbience(dt, now) {
    if (state.ambience === 'none') return; var p = AMB[state.ambience]; if (!p) return;
    if (p.events.length) {
      state.ambTimer -= dt;
      if (state.ambTimer <= 0) {
        if (cleanups.length < 240) {
          var ev = pick(p.events); var scale = (0.6 + state.tension * 0.5) * (1 + (1 - state.sanity) * 0.35) * rnd(0.75, 1.2);
          playSfx(ev[0], { volume: ev[1] * scale, pan: rnd(-0.85, 0.85), rate: rnd(0.88, 1.12) });
        }
        state.ambTimer = rnd(p.rate[0], p.rate[1]) * (0.75 + 0.5 * Math.random()) * (1 - 0.25 * state.tension);
      }
    }
    // 低理智：不定时的贴耳低语
    if (state.sanity < 0.42) {
      state.whisperTimer -= dt;
      if (state.whisperTimer <= 0) {
        playSfx('sanity_whisper', { volume: 0.3 + (0.42 - state.sanity) * 1.4, pan: rnd(-0.9, 0.9), rate: rnd(0.85, 1.1) }); state.whisperTimer = rnd(6, 14);
      }
    } else state.whisperTimer = Math.max(state.whisperTimer, 3);
    // 高紧张 / 低理智：近处呼吸
    if (state.tension > 0.6 || state.sanity < 0.35) {
      state.proxTimer -= dt;
      if (state.proxTimer <= 0) {
        playSfx('entity_breath', { volume: clamp(0.25 + state.tension * 0.45, 0.2, 0.8), pan: rnd(-0.55, 0.55), rate: rnd(0.9, 1.05) });
        state.proxTimer = rnd(5, 11) / (0.6 + state.tension);
      }
    } else state.proxTimer = Math.max(state.proxTimer, 4);
  }

  /* ---------- 7. 音乐系统（调式 / 主题 / 张力层） ---------- */
  var MENU_SCORE = [[0,76,6],[6,72,4],[12,71,3],[15,69,5],[21,67,3],[24,69,5],[30,64,5],[36,72,4],[40,71,4],[44,69,4],
    [48,77,4],[52,76,4],[56,72,4],[60,74,4],[64,71,5],[72,72,3],[75,69,3],[78,71,3],[81,74,5],[84,69,10]];
  var WHITE_SCORE = [[3,81,4],[8,79,3],[15,84,5],[20,81,3],[27,79,4],[32,76,4],[39,84,5],[44,81,4]]; var WHITE_CHORDS = [[57,60,64,71],[53,57,60,64],[48,52,55,59],[55,59,62,64]];
  var GOOD_CHORDS = [[60,64,67,71],[59,62,67,71],[57,60,64,67],[53,57,60,64],[52,55,60,64],[50,53,57,62],
    [55,59,62,67],[60,64,67,72],[57,60,64,67],[53,57,60,64],[55,59,62,65],[60,64,67,72]];
  var GOOD_SCORE = [[0,79,4],[4,76,4],[8,74,4],[12,71,4],[16,72,4],[20,69,4],[24,69,4],[28,72,4],[32,76,4],[36,79,4],[40,77,4],
    [44,74,4],[48,74,4],[52,71,4],[56,72,8],[64,81,4],[68,79,4],[72,76,4],[76,72,4],[80,74,4],[84,71,4],[88,72,8]];
  var BAD_CHORDS = [[57,60,64],[53,57,60],[57,60,64],[52,56,59],[57,60,64],[53,57,60],[50,53,57],[52,56,59],[57,60,64],[57,60,64]];
  var BAD_SCORE = [[0,69,8],[8,72,4],[12,71,4],[16,69,4],[20,64,4],[24,62,8],[32,69,4],[36,68,4],[40,72,6],
    [48,65,4],[52,64,4],[56,61,8],[64,57,8],[72,69,4],[76,68,4],[80,57,4]];
  var CREDITS_CHORDS = [[57,60,64],[53,57,60],[48,52,55],[55,59,62],[57,60,64],[52,56,59],[53,57,60],[48,52,55],
    [50,53,57],[57,60,64],[53,57,60],[52,56,59],[57,60,64],[55,59,62],[53,57,60],[57,60,64]];
  var CREDITS_SCORE = [[0,76,6],[6,72,4],[12,71,3],[18,69,5],[24,67,4],[30,69,4],[36,72,4],[42,76,4],[48,77,5],[54,76,4],
    [60,72,4],[66,74,4],[72,71,6],[80,72,6],[88,76,4],[94,79,4],[100,77,4],[106,74,4],[112,72,8],[120,69,8]];
  var CHASE_BASS = [33, 33, 36, 34, 33, 31, 36, 34];
  function mTrack(m, pan) { return mk('music', 1, pan, 0, 0, m.root); }

  // 八音盒：基音 + 轻微失谐泛音 + 机械触碰噪声
  function mbox(m, midi, t, dur, level, pan) {
    var tr = mTrack(m, pan); var f = mtof(midi); var det = rnd(-18, 18); TONE(tr, { t: t, f: f, dur: dur, level: level, a: 0.003, detune: det, filter: { t: 'lowpass', f: 4800 } });
    TONE(tr, { t: t, f: f * 2.004, dur: dur * 0.65, level: level * 0.33, a: 0.002, detune: det * 1.7 });
    TONE(tr, { t: t, f: f * 3.01, dur: dur * 0.4, level: level * 0.1, a: 0.002, detune: rnd(-12, 12) });
    NOISE(tr, { t: t, dur: 0.03, level: level * 0.05, hp: 4000, a: 0.001, d: 0.025 }); tr.done();
  }
  function subVoice(m, midi, t, dur, level) {
    var tr = mTrack(m, 0); TONE(tr, { t: t, f: mtof(midi), dur: dur, level: level, a: 0.5 });
    TONE(tr, { t: t, type: 'triangle', f: mtof(midi + 12), dur: dur * 0.7, level: level * 0.2, a: 1.2 }); tr.done();
  }

  // 空灵/神圣 pad：每个音两根失谐振荡器，慢起音长衰减
  function padVoice(m, midis, t, dur, level, pan) {
    var tr = mTrack(m, pan); var per = level / (midis.length * 2);
    for (var i = 0; i < midis.length; i++) {
      var f = mtof(midis[i]);
      for (var k = 0; k < 2; k++) {
        TONE(tr, {
          t: t + k * 0.03, type: k ? 'triangle' : 'sine', f: f, dur: dur,
          level: per, a: Math.max(0.4, dur * 0.32), detune: k ? rnd(5, 13) : rnd(-13, -5),
          filter: { t: 'lowpass', f: 1800, q: 0.5 }
        });
      }
    }
    NOISE(tr, { t: t, dur: dur * 0.6, level: level * 0.05, a: dur * 0.3, d: dur * 0.5, bp: 3000, q: 0.7 }); tr.done();
  }

  // 弦乐式持续音：锯齿 + 慢颤音 + 滤波上升
  function stringVoice(m, midi, t, dur, level, pan) {
    var tr = mTrack(m, pan);
    TONE(tr, {
      t: t, type: 'sawtooth', f: mtof(midi), dur: dur, level: level, a: Math.max(0.4, dur * 0.35), vib: 5.2, vibd: 7,
      filter: { t: 'lowpass', f: 280, to: 1400, q: 1.6 }
    });
    TONE(tr, { t: t, type: 'sawtooth', f: mtof(midi) * 1.006, dur: dur, level: level * 0.55, a: Math.max(0.5, dur * 0.45), filter: { t: 'lowpass', f: 320, q: 1 } }); tr.done();
  }
  function musicMetal(m, t, level, pan) {
    var tr = mTrack(m, pan); METAL(tr, t, rnd(180, 420), level, 0.6, 3); NOISE(tr, { t: t, dur: 0.07, level: level * 0.4, bp: rnd(1800, 4000), q: 2, a: 0.001, d: 0.06 }); tr.done();
  }
  function musicStab(m, t, level) {
    var tr = mTrack(m, rnd(-0.4, 0.4)); var notes = [69, 70, 75];
    for (var i = 0; i < notes.length; i++) {
      TONE(tr, { t: t, type: 'sawtooth', f: mtof(notes[i]), dur: 0.35, level: level, a: 0.002, filter: { t: 'bandpass', f: 1200, q: 2 }, vib: 22, vibd: 30 });
    }
    NOISE(tr, { t: t, dur: 0.16, level: level * 0.8, bp: 2600, q: 1.5, a: 0.001, d: 0.13 }); tr.done();
  }
  function pulseBass(m, midi, t, level) {
    var tr = mTrack(m, 0); TONE(tr, { t: t, type: 'sawtooth', f: mtof(midi), to: mtof(midi) * 0.94, dur: 0.17, level: level, a: 0.004, filter: { t: 'lowpass', f: 520, to: 180, q: 4 } });
    TONE(tr, { t: t, type: 'square', f: mtof(midi - 12), dur: 0.13, level: level * 0.35, a: 0.003, filter: { t: 'lowpass', f: 180 } }); tr.done();
  }
  function modeHeart(m, t, level) {
    var tr = mTrack(m, rnd(-0.2, 0.2)); THUMP(tr, t, level * 1.4, 58); THUMP(tr, t + 0.17, level * 0.85, 55); tr.done();
  }
  function score(m, list, level, spread, s, t, skip) {
    for (var i = 0; i < list.length; i++) {
      var n = list[i]; if (n[0] !== s) continue; if (skip && Math.random() < skip) continue;
      mbox(m, n[1], t + rnd(-0.012, 0.012), Math.min(4.5, n[2] * m.def.stepDur * 0.9), level * (n[3] || 1), rnd(-spread, spread));
    }
  }
  function bedTone(m, freq, level, cutoff, detune, q, type) {
    var o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq; if (detune) o.detune.value = detune;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = q == null ? 0.8 : q;
    var g = ctx.createGain(); g.gain.value = 0.0001; o.connect(f); f.connect(g); g.connect(m.root); o.start();
    g.gain.setTargetAtTime(level, ctx.currentTime, 1.5); m.nodes.push(o, f, g); m.srcs.push(o);
    return { o: o, f: f, g: g };
  }
  function addLfo(m, param, hz, depth) {
    var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = hz; g.gain.value = depth; o.connect(g); g.connect(param); o.start(); m.nodes.push(o, g); m.srcs.push(o);
  }

  /* ---- 各模式构建 ---- */
  function menuBuild(m) {
    bedTone(m, 41.2, 0.05, 160, 0, 0.8); bedTone(m, 61.7, 0.025, 220, 5, 0.6);
  }
  function exploreBuild(m) {
    bedTone(m, 55, 0.075, 170, 0, 0.7); bedTone(m, 82.4, 0.05, 240, -6, 0.5); bedTone(m, 110, 0.02, 320, 4, 0.4);
    var g = gainRaw(0.0001); g.connect(m.root); var o = oscRaw('sine', 55); o.connect(g); o.start(); addLfo(m, g.gain, 0.68, 0.05); m.nodes.push(g, o); m.srcs.push(o);
    m.layers.push({ g: g, v: -1, map: function (ten) { return Math.min(0.22, Math.pow(ten, 1.7) * 0.3); } });
    var hg = gainRaw(0.0001); hg.connect(m.root); var ho = oscRaw('sine', 1760); ho.connect(hg); ho.start(); addLfo(m, hg.gain, 0.09, 0.008); m.nodes.push(hg, ho); m.srcs.push(ho);
    m.layers.push({ g: hg, v: -1, map: function (ten) { return ten * ten * 0.02; } });
  }
  function dreadBuild(m) {
    var notes = [33, 34, 40, 41];
    for (var i = 0; i < notes.length; i++) {
      var d = bedTone(m, mtof(notes[i]), 0.032, 190, rnd(-8, 8), 0.9, 'sawtooth');
      d.f.frequency.setTargetAtTime(720 + i * 90, ctx.currentTime + 2, 7);   // 缓慢上升的弦乐
    }
    var hg = gainRaw(0.0001); hg.connect(m.root); var o1 = oscRaw('sine', 2637), o2 = oscRaw('sine', 2794);
    o1.connect(hg); o2.connect(hg); o1.start(); o2.start(); addLfo(m, hg.gain, 0.13, 0.012); m.nodes.push(hg, o1, o2); m.srcs.push(o1, o2);
    m.layers.push({ g: hg, v: -1, map: function (ten) { return ten * ten * 0.05; } });
  }
  function chaseBuild(m) {
    bedTone(m, 41.2, 0.1, 220, 0, 1.2, 'sawtooth'); bedTone(m, 43.65, 0.06, 260, 8, 1.0, 'sawtooth');
    var hg = gainRaw(0.0001); hg.connect(m.root); var o1 = oscRaw('sine', 3150), o2 = oscRaw('sine', 3210);
    o1.connect(hg); o2.connect(hg); o1.start(); o2.start(); addLfo(m, hg.gain, 0.7, 0.01); m.nodes.push(hg, o1, o2); m.srcs.push(o1, o2);
    m.layers.push({ g: hg, v: -1, map: function (ten) { return Math.pow(ten, 1.5) * 0.03; } });
  }
  function whiteBuild(m) {
    var hg = gainRaw(0.0001); hg.connect(m.root); var fs = [2093, 2637, 3136];
    for (var i = 0; i < fs.length; i++) {
      var o = oscRaw('sine', fs[i]), g = gainRaw(0.33); o.connect(g); g.connect(hg); o.start(); m.nodes.push(o, g); m.srcs.push(o);
    }
    addLfo(m, hg.gain, 0.09, 0.012); m.nodes.push(hg); m.layers.push({ g: hg, v: -1, map: function (ten) { return 0.03 + ten * 0.025; } });
    var n = loopSourceRaw(false), f = ctx.createBiquadFilter(), ng = gainRaw(0.018); f.type = 'highpass'; f.frequency.value = 5000;
    n.connect(f); f.connect(ng); ng.connect(m.root); n.start(); m.nodes.push(n, f, ng); m.srcs.push(n);
  }
  function endingBuild(m) {
    bedTone(m, 41.2, 0.05, 150, 0, 0.8); bedTone(m, 82.4, 0.03, 260, -5, 0.6);
  }
  function badBuild(m) {
    endingBuild(m); bedTone(m, 43.65, 0.045, 180, 7, 1.1, 'sawtooth'); bedTone(m, 34, 0.04, 120, -9, 1, 'sawtooth');
  }

  function abyssBuild(m) {
    // B1 专属：极低频地鸣 + 很轻的金属高频 + 低通噪声，节奏比楼上慢一倍
    bedTone(m, 27.5, 0.055, 95, 0, 1.4, 'sawtooth');
    bedTone(m, 36.71, 0.038, 110, 7, 1.1, 'triangle');
    bedTone(m, 55.0, 0.016, 150, -4, 0.8, 'sine');
    var hg = gainRaw(0.0001); hg.connect(m.root);
    var o1 = oscRaw('sine', 1990), o2 = oscRaw('sine', 2016);
    o1.connect(hg); o2.connect(hg); o1.start(); o2.start();
    addLfo(m, hg.gain, 0.067, 0.008);
    m.nodes.push(hg, o1, o2); m.srcs.push(o1, o2);
    m.layers.push({ g: hg, v: -1, map: function (ten) { return ten * ten * 0.028; } });
    var n = loopSourceRaw(true), f = ctx.createBiquadFilter(), ng = gainRaw(0.045);
    f.type = 'lowpass'; f.frequency.value = 125;
    n.connect(f); f.connect(ng); ng.connect(m.root); n.start();
    m.nodes.push(n, f, ng); m.srcs.push(n);
  }
  function abyssStep(m, s, t) {
    var b = s % 96;
    if (b % 24 === 0) { var tr = mTrack(m, 0); THUMP(tr, t, 0.55, 34); tr.done(); subVoice(m, 27, t, 6, 0.07); }
    if (b === 52) { var tr2 = mTrack(m, 0); THUMP(tr2, t, 0.4, 30); tr2.done(); }
    if (b % 12 === 7 && Math.random() < 0.55) musicMetal(m, t + rnd(0, 0.4), 0.028, rnd(-0.9, 0.9));
    if (b === 84) { var nr = mTrack(m, 0); NOISE(nr, { t: t, dur: 1.1, level: 0.055, a: 0.6, d: 0.2, bp: 260, bpTo: 900, q: 1.1 }); nr.done(); }
    if (Math.random() < 0.14) stringVoice(m, pick([26, 27, 33]), t, 4.5, 0.018, rnd(-0.6, 0.6));
  }

  /* ---- 各模式步进 ---- */
  function menuStep(m, s, t) {
    var b = s % 96;
    if (b % 24 === 0) {
      var roots = [45, 40, 41, 40], r = roots[(b / 24) | 0]; subVoice(m, r, t, 9.5, 0.14); subVoice(m, r - 12, t, 9.5, 0.06);
    }
    score(m, MENU_SCORE, 0.15, 0.22, b, t, 0.05); if (b % 24 === 12 && Math.random() < 0.45) mbox(m, pick([84, 86, 88]), t + 0.08, 2.2, 0.04, rnd(-0.5, 0.5));
    if (b % 48 === 24) mbox(m, 88, t + 0.15, 1.8, 0.025, -0.4);
  }
  function exploreStep(m, s, t) {
    if (Math.random() < 0.13) mbox(m, pick([69, 72, 74, 76, 79, 81]), t + rnd(0, 0.05), rnd(2.4, 4.5), 0.075, rnd(-0.65, 0.65));
    if (Math.random() < 0.05) musicMetal(m, t + rnd(0.1, 0.4), 0.025, rnd(-0.8, 0.8)); if (s % 8 === 0) mbox(m, pick([57, 60, 64]), t, 3.5, 0.03, rnd(-0.3, 0.3));
  }
  function dreadStep(m, s, t) {
    var b = s % 64; if (b % 8 === 0) stringVoice(m, pick([33, 34, 40, 41]), t, 3.0, 0.03, rnd(-0.4, 0.4));
    if (b === 0 || b === 32) {
      var cl = pick([[61, 62, 68], [62, 68, 73], [60, 61, 67]]); for (var i = 0; i < cl.length; i++) stringVoice(m, cl[i], t, 4.5, 0.026, rnd(-0.5, 0.5));
      var tr = mTrack(m, 0); THUMP(tr, t, 0.3, 48); tr.done();
    }
    if (b % 16 === 8) { var tr2 = mTrack(m, 0); THUMP(tr2, t, 0.22, 46); tr2.done(); }
    if (Math.random() < 0.3) musicMetal(m, t + rnd(0, 0.2), 0.02, rnd(-0.8, 0.8));
  }
  function chaseStep(m, s, t) {
    var b = s % 64; if (b % 2 === 0) pulseBass(m, CHASE_BASS[((b / 2) | 0) % 8], t, 0.22);
    if (b % 4 === 0) { var tr = mTrack(m, 0); THUMP(tr, t, 0.35, 48); tr.done(); }
    if (b % 2 === 1 && Math.random() < 0.38) musicMetal(m, t, rnd(0.02, 0.045), rnd(-0.7, 0.7)); if (b === 16 || b === 48) musicStab(m, t, 0.055);
    if (b === 56) {
      var nr = mTrack(m, 0); NOISE(nr, { t: t, dur: 0.75, level: 0.08, a: 0.55, d: 0.15, bp: 400, bpTo: 4200, q: 1.4 }); nr.done();
    }
    if (state.tension > 0.55 && b % 2 === 0) musicMetal(m, t + 0.03, 0.014, -0.8);
  }
  function whiteStep(m, s, t) {
    var b = s % 48;
    if (b % 12 === 0) {
      var ch = WHITE_CHORDS[((b / 12) | 0) % 4]; padVoice(m, ch, t, 7.5, 0.1, 0); subVoice(m, ch[0] - 12, t, 7.5, 0.06);
    }
    score(m, WHITE_SCORE, 0.105, 0.3, b, t, 0.1); if (b % 24 === 6) mbox(m, pick([88, 91]), t, 3, 0.03, rnd(-0.4, 0.4));
  }
  function endingStep(m, s, t) {
    var d = m.def, b = s % d.loop;
    if (b % 8 === 0) {
      var ch = d.chords[((b / 8) | 0) % d.chords.length]; padVoice(m, ch, t, 8 * d.stepDur * 1.02, d.padLevel || 0.085, 0); subVoice(m, ch[0] - 24, t, 8 * d.stepDur, 0.1);
    }
    score(m, d.score, d.scoreLevel || 0.13, 0.25, b, t, 0); if (d.broken && Math.random() < 0.08) mbox(m, pick([68, 69, 70]), t + rnd(0, 0.2), 1.8, 0.035, rnd(-0.4, 0.4));
  }

  var MODES = {
    menu: { stepDur: 0.25, gain: 0.9, rev: 0.5, dly: 0.12, heart: 56, heartLevel: 0.05, build: menuBuild, step: menuStep },
    explore: { stepDur: 0.9, gain: 0.75, rev: 0.62, build: exploreBuild, step: exploreStep },
    dread: { stepDur: 0.3, gain: 0.8, rev: 0.5, heart: 72, heartLevel: 0.1, build: dreadBuild, step: dreadStep },
    chase: { stepDur: 0.1, gain: 0.85, rev: 0.35, build: chaseBuild, step: chaseStep },
    abyss: { stepDur: 0.46, gain: 0.8, rev: 0.62, heart: 50, heartLevel: 0.04, build: abyssBuild, step: abyssStep },
    white: { stepDur: 0.55, gain: 0.85, rev: 0.68, build: whiteBuild, step: whiteStep },
    ending_good: { stepDur: 0.5, gain: 0.85, rev: 0.6, duration: 48, loop: 96, chords: GOOD_CHORDS, score: GOOD_SCORE,
      build: endingBuild, step: endingStep, padLevel: 0.09, scoreLevel: 0.13 },
    ending_bad: { stepDur: 0.55, gain: 0.8, rev: 0.62, duration: 46.2, loop: 84, chords: BAD_CHORDS, score: BAD_SCORE,
      build: badBuild, step: endingStep, padLevel: 0.075, scoreLevel: 0.12, broken: true, heart: 46, heartLevel: 0.05 },
    credits: { stepDur: 0.45, gain: 0.8, rev: 0.55, duration: 57.6, loop: 128, chords: CREDITS_CHORDS, score: CREDITS_SCORE,
      step: endingStep, padLevel: 0.08, scoreLevel: 0.13 }
  };
  function createMusicMode(name, fade) {
    var def = MODES[name]; var t = ctx.currentTime;
    var m = { name: name, def: def, root: ctx.createGain(), nodes: [], srcs: [], layers: [],
      step: 0, nextTime: t + 0.2, startTime: t + 0.2, heartNext: t + 1.5, lastLayer: 0, ended: false };
    m.root.gain.value = 0.0001; m.root.connect(buses.music.input); var rs = ctx.createGain(); rs.gain.value = def.rev == null ? 0.5 : def.rev;
    m.root.connect(rs); rs.connect(reverbIn); m.nodes.push(rs);
    if (def.dly) {
      var ds = ctx.createGain(); ds.gain.value = def.dly; m.root.connect(ds); ds.connect(delayIn); m.nodes.push(ds);
    }
    m.nodes.push(m.root); m.root.gain.linearRampToValueAtTime(def.gain == null ? 0.85 : def.gain, t + Math.max(0.2, fade)); if (def.build) def.build(m);
    return m;
  }
  function stopMusicMode(m, fade) {
    if (!m || m.ended) return; m.ended = true; var t = ctx.currentTime, f = Math.max(0.05, fade);
    try {
      m.root.gain.cancelScheduledValues(t); m.root.gain.linearRampToValueAtTime(0.0001, t + f);
    } catch (e) { /* 忽略 */ }
    for (var i = 0; i < m.srcs.length; i++) {
      try { m.srcs[i].stop(t + f + 0.1); } catch (e) { /* 已停止 */ }
    }
    scheduleCleanup(m.nodes, t + f + 0.4);
  }
  function setMusicMode(mode, fade) {
    mode = mode || 'none'; if (!MODES[mode]) mode = 'none';
    if (!state.inited) { state.musicMode = mode; return; }
    if (mode === state.musicMode && music.current && !music.current.ended) return;
    var f = clamp(fade == null ? 3 : +fade, 0.05, 12); if (music.current) stopMusicMode(music.current, Math.min(f, 2.5));
    music.current = null; state.musicMode = mode; if (mode !== 'none') music.current = createMusicMode(mode, f);
  }
  function scheduleMusic(now) {
    var m = music.current; if (!m || m.ended) return; var def = m.def;
    if (m.nextTime < now - 0.4) m.nextTime = now + 0.05;      // 卡顿后重同步，避免爆发
    var guard = 0;
    while (m.nextTime < now + 0.12 && guard++ < 48) {
      if (def.duration && m.nextTime - m.startTime >= def.duration) { fadeOutMusic(m); return; }
      try { def.step(m, m.step, m.nextTime); } catch (e) { warn(e); }
      m.step++; m.nextTime += def.stepDur;
    }
    if (def.heart) {
      if (m.heartNext < now - 2) m.heartNext = now + 0.2; var hg = 0;
      while (m.heartNext < now + 0.12 && hg++ < 8) {
        modeHeart(m, m.heartNext, def.heartLevel == null ? 0.06 : def.heartLevel); m.heartNext += 60 / def.heart;
      }
    }
  }
  function fadeOutMusic(m) {
    if (!m || m.ended) return; m.ended = true; var t = ctx.currentTime;
    try {
      m.root.gain.cancelScheduledValues(t); m.root.gain.linearRampToValueAtTime(0.0001, t + 4);
    } catch (e) { /* 忽略 */ }
    for (var i = 0; i < m.srcs.length; i++) {
      try { m.srcs[i].stop(t + 4.3); } catch (e) { /* 已停止 */ }
    }
    scheduleCleanup(m.nodes, t + 4.8);
  }
  function updateMusicLayers(now) {
    var m = music.current; if (!m || !m.layers.length) return; if (now - m.lastLayer < 0.22) return; m.lastLayer = now;
    for (var i = 0; i < m.layers.length; i++) {
      var ly = m.layers[i]; if (!ly.g) continue; var target = clamp(ly.map(state.tension, state.sanity), 0, 1);
      if (Math.abs(target - ly.v) > 0.015) {
        ly.g.gain.setTargetAtTime(target, now, 0.8); ly.v = target;
      }
    }
  }

  /* ---------- 8. 心跳 / 呼吸 / 耳鸣 ---------- */
  function heartBeat(level) {
    var t = ctx.currentTime; var tr = mk('sfx', level, rnd(-0.12, 0.12), 0.15); THUMP(tr, t, 0.75, 60);
    THUMP(tr, t + 0.16, 0.5, 57); THUMP(tr, t + 0.31, 0.3, 55); if (state.tension > 0.7) THUMP(tr, t + 0.46, 0.2, 53); tr.done();
  }
  function heartPair(t, lv, pan) {
    var tr = mk(curBus, lv, pan, 0.18); THUMP(tr, t, 0.7, 60); THUMP(tr, t + 0.16, 0.45, 57); THUMP(tr, t + 0.31, 0.28, 55); tr.done();
  }
  function heartbeatStart(bpm) {
    heart.active = true; heart.bpm = clamp(bpm || 62, 40, 190); heart.timer = 0;
  }
  function heartbeatSet(bpm) {
    if (!heart.active) return; heart.bpm = clamp(+bpm || 62, 40, 190);
  }
  function heartbeatStop() { heart.active = false; }
  function updateHeart(dt) {
    if (!heart.active) return; heart.timer -= dt; if (heart.timer > 0) return; heartBeat(0.5 + state.tension * 0.45);
    var bpm = clamp(heart.bpm * (1 + state.tension * 0.28 + (1 - state.sanity) * 0.1), 40, 200); heart.timer = 60 / bpm;
  }
  function breathCycle(t, mode) {
    var cycle = mode === 'panic' ? 1.35 : mode === 'run' ? 2.05 : 4.2; var lv = mode === 'panic' ? 0.3 : mode === 'run' ? 0.22 : 0.11; var tr = mk('sfx', lv, rnd(-0.15, 0.15), 0.25);
    var inh = cycle * 0.34, hold = cycle * 0.08, exh = cycle * 0.46; var a = NOISE(tr, { t: t, dur: inh, level: 0.5, a: inh * 0.75, d: inh * 0.4, bp: 900, bpTo: 1600, q: 1.3, rate: 1 });
    AM(tr, a.g.gain, rnd(12, 18), 0.08, t, inh); NOISE(tr, { t: t + inh + hold, dur: exh, level: 0.55, a: 0.05, d: exh * 0.8, bp: 520, bpTo: 360, q: 1.2, rate: 0.95 });
    TONE(tr, { t: t + inh + hold, f: 68, to: 50, dur: exh * 0.7, level: 0.03, a: 0.08, filter: { t: 'lowpass', f: 180 } }); tr.done();
  }
  function breathStart(mode) {
    breath.active = true; breath.mode = mode || 'calm'; breath.timer = 0;
  }
  function breathStop() { breath.active = false; }
  function updateBreath(dt) {
    if (!breath.active) return; breath.timer -= dt; if (breath.timer > 0) return; var mode = breath.mode;
    breathCycle(ctx.currentTime + 0.02, mode); breath.timer = mode === 'panic' ? 1.35 : mode === 'run' ? 2.05 : 4.2;
  }
  function buildTinnitus() {
    tin = { g: gainRaw(0.0001), oscs: [] };
    tin.g.connect(master);                                     // 耳鸣不受 duck 影响
    var o1 = oscRaw('sine', 4180), o2 = oscRaw('sine', 4235); var g1 = gainRaw(0.5), g2 = gainRaw(0.32);
    o1.connect(g1); g1.connect(tin.g); o2.connect(g2); g2.connect(tin.g); o1.start(); o2.start();
    var l = oscRaw('sine', 0.21), lg = gainRaw(5); l.connect(lg); lg.connect(o2.detune); l.start(); tin.oscs.push(o1, o2, l);
  }
  function updateTinnitus(now) {
    if (!tin) return; var lvl = clamp((state.tension - 0.42) * 0.1 + (0.5 - state.sanity) * 0.08, 0, 0.05); tin.g.gain.setTargetAtTime(Math.max(0.0001, lvl), now, 0.5);
  }

  /* ---------- 9. 组合事件：脚步 / stinger / jumpScare ---------- */
  function footstep(surface, running) {
    if (!state.inited) return; surface = surface || 'tile'; var t = ctx.currentTime + rnd(0, 0.015); var tr = mk('sfx', running ? 0.85 : 0.6, rnd(-0.22, 0.22), 0.12);
    if (surface === 'metal') {
      METAL(tr, t, rnd(180, 260), 0.2, 0.4, 3); NOISE(tr, { t: t, dur: 0.08, level: 0.12, bp: 1800, q: 1.5, a: 0.001, d: 0.07 });
    } else if (surface === 'carpet') {
      NOISE(tr, { t: t, dur: 0.14, level: 0.11, lp: 500, a: 0.005, d: 0.11 }); THUMP(tr, t, 0.12, 70);
    } else if (surface === 'concrete') {
      NOISE(tr, { t: t, dur: 0.1, level: 0.18, bp: 900, q: 0.9, a: 0.002, d: 0.09 }); THUMP(tr, t, 0.2, 58);
    } else {
      NOISE(tr, { t: t, dur: 0.06, level: 0.16, hp: 1600, a: 0.001, d: 0.05 }); TONE(tr, { t: t, f: 2400, to: 1200, dur: 0.04, level: 0.05, a: 0.001 }); THUMP(tr, t, 0.15, 65);
    }
    if (running) NOISE(tr, { t: t + 0.03, dur: 0.2, level: 0.07, bp: 1200, q: 0.6, a: 0.03, d: 0.15 }); tr.done();
  }
  function stinger(kind) {
    if (!state.inited) return; kind = kind || 'soft'; var t = ctx.currentTime; var tr = mk('sfx', 0.85, rnd(-0.35, 0.35), 0.75);
    try {
      if (kind === 'soft') {
        NOISE(tr, { t: t, dur: 2.6, level: 0.1, a: 1.4, d: 1.2, bp: 500, bpTo: 2200, q: 1.2 });
        TONE(tr, { t: t + 0.6, f: mtof(69), dur: 2.2, level: 0.05, a: 0.3, filter: { t: 'lowpass', f: 1600 } });
        TONE(tr, { t: t + 0.65, f: mtof(70), dur: 2.0, level: 0.032, a: 0.4, detune: 9 });
        TONE(tr, { t: t + 0.7, f: mtof(81), dur: 2.5, level: 0.05, a: 0.004, filter: { t: 'lowpass', f: 4800 } });
        TONE(tr, { t: t + 0.7, f: mtof(81) * 2.004, dur: 1.6, level: 0.017, a: 0.003 });
      } else if (kind === 'hard') {
        var cl = [61, 62, 68, 73];
        for (var i = 0; i < cl.length; i++) TONE(tr, { t: t, type: 'sawtooth', f: mtof(cl[i]), dur: 1.6, level: 0.05, a: 0.012, filter: { t: 'lowpass', f: 2200, to: 900, q: 1.6 }, vib: 5.5, vibd: 14 });
        METAL(tr, t, 240, 0.18, 0.7, 4); THUMP(tr, t, 0.45);
      } else if (kind === 'riser') {
        NOISE(tr, { t: t, dur: 2.4, level: 0.13, a: 2.1, d: 0.25, bp: 280, bpTo: 5200, q: 1.6 });
        TONE(tr, { t: t, type: 'sawtooth', f: 110, to: 880, dur: 2.3, glide: 2.2, level: 0.04, a: 1.8, filter: { t: 'lowpass', f: 800, to: 3000 } }); METAL(tr, t + 2.25, 300, 0.18, 0.9, 3);
      } else {
        TONE(tr, { t: t, f: 72, to: 24, dur: 2.4, glide: 1.4, level: 0.4, a: 0.006, filter: { t: 'lowpass', f: 180 } }); THUMP(tr, t, 0.5); METAL(tr, t, 90, 0.16, 1.6, 3);
        NOISE(tr, { t: t, dur: 1.2, level: 0.1, a: 0.01, d: 1.0, bp: 700, bpTo: 200, q: 0.8 });
      }
    } catch (e) { warn(e); }
    tr.done(0.4);
  }
  function jumpScare(style) {
    if (!state.inited) return; duck(1.5); var t = ctx.currentTime; var tr = mk('sfx', 1.2, rnd(-0.25, 0.25), 0.5, 0, null, 2.2);
    TONE(tr, { t: t, type: 'sawtooth', f: 120, to: 27, dur: 1.7, glide: 1.1, level: 0.42, a: 0.002, filter: { t: 'lowpass', f: 1000, to: 120, q: 2 } });
    NOISE(tr, { t: t, dur: 0.8, level: 0.5, a: 0.002, d: 0.7, bp: 900, q: 0.7 });
    NOISE(tr, { t: t + 0.01, dur: 0.45, level: 0.3, a: 0.001, d: 0.4, hp: 2400 }); THUMP(tr, t + 0.02, 0.55, 52);
    for (var i = 0; i < 4; i++) {
      TONE(tr, {
        t: t + rnd(0, 0.05), type: 'sawtooth', f: rnd(700, 2300), to: rnd(260, 700),
        dur: rnd(0.5, 0.95), level: 0.05, a: 0.002, vib: rnd(16, 30), vibd: 40,
        filter: { t: 'bandpass', f: rnd(900, 2600), q: 2.5 }
      });
    }
    if (style === 'face') {
      for (var j = 0; j < 3; j++) TONE(tr, { t: t + 0.01, type: 'square', f: rnd(1400, 2600), to: rnd(500, 900), dur: 1.0, level: 0.035, a: 0.002, filter: { t: 'bandpass', f: 2400, q: 3 } });
      NOISE(tr, { t: t + 0.05, dur: 1.1, level: 0.12, a: 0.01, d: 1.0, bp: 3000, q: 0.7, rate: 1.2 });
    } else if (style === 'slam') {
      THUMP(tr, t + 0.03, 0.7, 45); METAL(tr, t + 0.02, 70, 0.3, 1.8, 5);
    } else if (style === 'grab') {
      NOISE(tr, { t: t, dur: 0.9, level: 0.3, a: 0.006, d: 0.8, bp: 2600, q: 0.6, rate: 0.7 });
      TONE(tr, { t: t, type: 'sawtooth', f: 58, to: 38, dur: 1.2, level: 0.22, a: 0.02, filter: { t: 'lowpass', f: 260 } });
    } else if (style === 'mirror') {
      NOISE(tr, { t: t, dur: 0.5, level: 0.25, a: 0.002, d: 0.4, hp: 3000 });
      for (var k = 0; k < 5; k++) TONE(tr, { t: t + rnd(0, 0.15), f: rnd(2600, 6800), dur: rnd(0.15, 0.4), level: rnd(0.02, 0.045), a: 0.001 });
    } else {
      var ch = [61, 62, 68, 69, 75];
      for (var q = 0; q < ch.length; q++) TONE(tr, { t: t, type: 'sawtooth', f: mtof(ch[q]), dur: 1.6, level: 0.06, a: 0.005, filter: { t: 'lowpass', f: 3000 } });
    }
    tr.done(0.5);
  }

  /* ---------- 10. 主循环与对外 API ---------- */
  function tick() {
    if (!state.inited || !ctx) return; var now = ctx.currentTime; sweepCleanups(now); if (state.hidden || state.paused || state.hiddenSuspend) return; if (ctx.state !== 'running') return;
    if (state.volumes.master < 0.002) return;         // 静音时停止调度
    updateDuck(now); if (state.volumes.music > 0.002) scheduleMusic(now);
  }
  function update(dt) {
    if (!state.inited || !ctx) return; dt = clamp(+dt || 0, 0, 0.25); if (state.hidden) return; var now = ctx.currentTime;
    var k = 1 - Math.exp(-dt * 1.1); state.tension += (state.tensionTarget - state.tension) * k;
    state.sanity += (state.sanityTarget - state.sanity) * k; updateDuck(now);
    if (state.paused || state.volumes.master < 0.002) return;   // 暂停/静音：停止声音调度
    updateAmbience(dt, now); updateHeart(dt); updateBreath(dt); updateTinnitus(now); updateMusicLayers(now);
  }
  function setTension(v) {
    state.tensionTarget = clamp(+v || 0, 0, 1); if (!state.inited) state.tension = state.tensionTarget;
  }
  function setSanity(v) {
    state.sanityTarget = clamp(+v || 0, 0, 1); if (!state.inited) state.sanity = state.sanityTarget;
  }
  function stopAll() {
    if (!state.inited) return; for (var id in loops) stopLoop(+id, 0.12); heart.active = false; breath.active = false;
    if (music.current) stopMusicMode(music.current, 0.1); music.current = null; state.musicMode = 'none'; state.duckUntil = 0;
    state.ambience = 'none'; applyAmbience('none', 0.12); if (tin) tin.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); var t = ctx.currentTime;
    try { master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0.0001, t, 0.04); } catch (e) { /* 忽略 */ }
    later(function () {
      if (!state.inited || !ctx) return; sweepCleanups(0, true); applyMaster(); for (var k in buses) buses[k].duck.gain.setTargetAtTime(1, ctx.currentTime, 0.05); state.ducked = false;
    }, 220);
  }
  function getState() {
    return {
      inited: state.inited, ctxState: ctx ? ctx.state : 'none', tension: Math.round(state.tension * 1000) / 1000,
      sanity: Math.round(state.sanity * 1000) / 1000, musicMode: state.musicMode,
      ambience: state.ambience
    };
  }

  /* ---- 公开 API（统一 try/catch，任何情况下不抛异常） ---- */
  function api(name, fn) {
    HA[name] = function () {
      try { return fn.apply(HA, arguments); }
      catch (e) { warn(e); }
    };
  }

  HA.init = function (opts) {
    try {
      return init(opts);
    } catch (e) {
      warn(e);
      return Promise.resolve(false);
    }
  };

  api('resume', resume); api('suspend', suspend); api('setVolume', setVolume); api('getVolume', getVolume);
  api('setAmbience', setAmbience); api('setMusicMode', setMusicMode); api('setTension', setTension); api('setSanity', setSanity);
  api('sfx', playSfx); api('startLoop', startLoop); api('stopLoop', stopLoop); api('footstep', footstep);
  api('heartbeatStart', heartbeatStart); api('heartbeatSet', heartbeatSet); api('heartbeatStop', heartbeatStop);
  api('breathStart', breathStart); api('breathStop', breathStop); api('stinger', stinger); api('jumpScare', jumpScare);
  api('duck', duck); api('update', update); api('stopAll', stopAll); api('getState', getState);

  window.HA = HA;
})();
