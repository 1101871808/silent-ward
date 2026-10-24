/* ============================================================
   静默病栋 SILENT WARD — 第一人称控制 player.js
   - 指针锁定视角 / 行走碰撞 / 蹲伏奔跑 / 体力
   - 手电筒（带阴影的聚光灯 + 电量）
   - 精神值、镜头晃动、呼吸、脚步、躲藏
   ============================================================ */
(function () {
  'use strict';

  var T = THREE;
  var HW = window.HW;
  var clamp = HW.util.clamp;
  var lerp = HW.util.lerp;

  var PLAYER_RADIUS = 0.28;

  function HPlayer(camera, opts) {
    opts = opts || {};
    this.camera = camera;
    this.level = null;
    this.pos = new T.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.enabled = false;
    this.paused = true;
    this.keys = {};
    this.crouch = false;
    this.crouchAmount = 0;
    this.stamina = 1;
    this.sanity = 1;
    this.staminaRegenWait = 0;
    this.exhausted = false;
    this.bobT = 0;
    this.stepDist = 0;
    this.surface = 'tile';
    this.hidden = false;
    this.hideRef = null;
    this.preHide = null;
    this.shakeT = 0;
    this.shakeDur = 0;
    this.shakeAmp = 0;
    this.danger = 0;
    this.inDarkZone = false;
    this.hasFlashlight = false;
    this.flashlightOn = false;
    this.battery = 1;
    this.batteryDrain = 1 / 420;   // 约 7 分钟
    this.batteryLow = false;
    this.locked = false;
    this.sensitivity = 1.0;
    this.invertY = false;
    this.shakeEnabled = true;
    this.fov = 75;
    this.hitFlash = 0;
    this.breathState = 'calm';
    this._audioReady = false;

    // 手电筒
    var spot = new T.SpotLight(0xfff1d8, 0, 22, 0.35, 0.4, 1.45);
    spot.position.set(0, -0.04, 0.08);
    spot.castShadow = false;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.25;
    spot.shadow.camera.far = 24;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.035;
    var target = new T.Object3D();
    target.position.set(0, 0, -8);
    this.flashlight = spot;
    this.flashlightTarget = target;
    camera.add(spot);
    camera.add(target);
    spot.target = target;

    // 极弱的近场补光：模拟手电环境反射，避免纯黑死区
    var fill = new T.PointLight(0xa9bdb2, 0.16, 2.8, 2);
    fill.position.set(0, 0.05, 0.15);
    fill.castShadow = false;
    camera.add(fill);
    this.fillLight = fill;

    this._bindInput();
  }

  HPlayer.prototype._audio = function () {
    return (window.HA && HA.ready) ? HA : null;
  };

  HPlayer.prototype._bindInput = function () {
    var self = this;
    document.addEventListener('keydown', function (e) {
      var code = e.code;
      if (code === 'KeyC' && !e.repeat) { self.crouchToggle = !self.crouchToggle; }
      if (code === 'KeyF') { if (!e.repeat) self.toggleFlashlight(); }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyC', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(code) >= 0) {
        self.keys[code] = true;
        if (self.enabled && self.locked) e.preventDefault();
      }
      
    });
    document.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
    });
    document.addEventListener('mousemove', function (e) {
      if (!self.enabled || !self.locked || self.paused) return;
      var sens = self.sensitivity * 0.0022;
      self.yaw -= e.movementX * sens;
      self.pitch -= (self.invertY ? -e.movementY : e.movementY) * sens;
      self.pitch = clamp(self.pitch, -1.35, 1.35);
      if (self.yaw > Math.PI * 8 || self.yaw < -Math.PI * 8) self.yaw = self.yaw % (Math.PI * 2);
    });
    // 丢失指针锁定
    document.addEventListener('pointerlockchange', function () {
      var locked = document.pointerLockElement === self.camera.parent ? false : document.pointerLockElement !== null;
      self.locked = document.pointerLockElement === (self.canvas || null);
      if (self.onLockChange) self.onLockChange(self.locked);
    });
    window.addEventListener('blur', function () {
      self.keys = {};
    });
  };

  HPlayer.prototype.requestLock = function (canvas) {
    this.canvas = canvas;
    if (!canvas) return;
    try { var pl = canvas.requestPointerLock(); if (pl && pl.catch) pl.catch(function () {}); } catch (e) {}
  };

  HPlayer.prototype.releaseLock = function () {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
    this.locked = false;
  };

  HPlayer.prototype.setLevel = function (level, spawn) {
    this.level = level;
    this.surface = level.id === 'basement' ? 'concrete' : 'tile';
    this.setSpawn(spawn || level.playerSpawn);
  };

  HPlayer.prototype.setSpawn = function (sp) {
    this.pos.set(sp.x, 0, sp.z);
    this.yaw = sp.yaw || 0;
    this.pitch = sp.pitch || 0;
    this.crouch = false;
    this.crouchToggle = false;
    this.stamina = 1;
    this.hidden = false;
    this.hideRef = null;
    if (this.level) {
      this._unstick();
      this.level.setPanSource(this.pos, this.yaw);
    }
    this._applyCamera(0);
  };

  HPlayer.prototype.setPaused = function (p) {
    this.paused = p;
    if (p) this.keys = {};
  };

  HPlayer.prototype.setEnabled = function (e) {
    this.enabled = e;
    if (!e) { this.keys = {}; }
  };

  HPlayer.prototype.toggleFlashlight = function () {
    if (!this.hasFlashlight) return;
    this.flashlightOn = !this.flashlightOn;
    var a = this._audio();
    if (a) { try { a.sfx(this.flashlightOn ? 'flashlight_on' : 'flashlight_off'); } catch (e) {} }
  };

  HPlayer.prototype.setFlashlight = function (on) {
    this.flashlightOn = !!on;
  };

  HPlayer.prototype.giveFlashlight = function () {
    this.hasFlashlight = true;
    this.flashlightOn = true;
  };

  HPlayer.prototype.addBattery = function (v) {
    this.battery = clamp(this.battery + v, 0, 1);
  };

  HPlayer.prototype.addSanity = function (v) {
    this.sanity = clamp(this.sanity + v, 0, 1);
  };

  HPlayer.prototype.triggerShake = function (amp, dur) {
    if (!this.shakeEnabled) return;
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeDur = Math.max(this.shakeDur, dur || 0.4);
    this.shakeT = 0;
  };

  HPlayer.prototype.teleport = function (x, z, yaw, pitch) {
    this.pos.set(x, 0, z);
    if (yaw !== undefined) this.yaw = yaw;
    if (pitch !== undefined) this.pitch = pitch;
    this.crouch = false;
    this.crouchToggle = false;
    if (this.level) this.level.setPanSource(this.pos, this.yaw);
    this._applyCamera(0);
  };

  /* ---------------- 躲藏 ---------------- */
  HPlayer.prototype.hideIn = function (interactable) {
    if (this.hidden) return false;
    var d = interactable.data || {};
    if (!d.hidePos) return false;
    this.preHide = { x: this.pos.x, z: this.pos.z, yaw: this.yaw, pitch: this.pitch };
    this.hidden = true;
    this.hideRef = interactable;
    this.pos.set(d.hidePos.x, 0, d.hidePos.z);
    this.yaw = d.hideYaw;
    this.pitch = 0;
    this.crouch = true;
    this.crouchToggle = true;
    var locker = interactable.locker;
    if (locker && locker.leafPivot) {
      locker.leafPivot.rotation.y = -1.75;
      var self = this;
      setTimeout(function () {
        if (self.hidden && locker.leafPivot) locker.leafPivot.rotation.y = 0;
      }, 420);
    }
    var a = this._audio();
    if (a) { try { a.sfx('locker_open'); } catch (e) {} }
    if (this.onHideChange) this.onHideChange(true);
    return true;
  };

  HPlayer.prototype.exitHide = function () {
    if (!this.hidden) return false;
    this.hidden = false;
    if (this.preHide) {
      this.pos.set(this.preHide.x, 0, this.preHide.z);
      this.yaw = this.preHide.yaw;
      this.pitch = this.preHide.pitch;
    }
    this.crouch = false;
    this.crouchToggle = false;
    if (this.hideRef && this.hideRef.locker && this.hideRef.locker.leafPivot) {
      this.hideRef.locker.leafPivot.rotation.y = 0;
    }
    this.hideRef = null;
    var a = this._audio();
    if (a) { try { a.sfx('locker_close'); } catch (e) {} }
    if (this.onHideChange) this.onHideChange(false);
    return true;
  };

  /* ---------------- 脱困 ---------------- */
  HPlayer.prototype._hasOverlap = function () {
    if (!this.level) return false;
    var col = this.level.colliders;
    for (var i = 0; i < col.length; i++) {
      var c = col[i];
      if (!c.active) continue;
      var nx = clamp(this.pos.x, c.minX, c.maxX);
      var nz = clamp(this.pos.z, c.minZ, c.maxZ);
      var dx = this.pos.x - nx, dz = this.pos.z - nz;
      if (dx * dx + dz * dz < (PLAYER_RADIUS - 0.01) * (PLAYER_RADIUS - 0.01)) return true;
    }
    return false;
  };

  // 把玩家从碰撞体内部推到最近的空位（出生点保护 / 关门保护）
  HPlayer.prototype._unstick = function () {
    if (!this.level) return false;
    var col = this.level.colliders;
    var r = PLAYER_RADIUS + 0.02;
    var moved = false;
    for (var iter = 0; iter < 10; iter++) {
      var found = null, bestPen = 0, bestNx = 0, bestNz = 0;
      for (var i = 0; i < col.length; i++) {
        var c = col[i];
        if (!c.active) continue;
        var nx = clamp(this.pos.x, c.minX, c.maxX);
        var nz = clamp(this.pos.z, c.minZ, c.maxZ);
        var dx = this.pos.x - nx, dz = this.pos.z - nz;
        var d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          var pen = r - Math.sqrt(d2);
          if (pen > bestPen) { bestPen = pen; found = c; bestNx = nx; bestNz = nz; }
        }
      }
      if (!found) break;
      var ddx = this.pos.x - bestNx, ddz = this.pos.z - bestNz;
      var dd = Math.hypot(ddx, ddz);
      if (dd > 1e-4) {
        this.pos.x = bestNx + ddx / dd * (r + 0.03);
        this.pos.z = bestNz + ddz / dd * (r + 0.03);
      } else {
        // 完全在内部：往最近的边推出去
        var toL = this.pos.x - found.minX, toR = found.maxX - this.pos.x;
        var toT = this.pos.z - found.minZ, toB = found.maxZ - this.pos.z;
        var m = Math.min(toL, toR, toT, toB);
        if (m === toL) this.pos.x = found.minX - r - 0.03;
        else if (m === toR) this.pos.x = found.maxX + r + 0.03;
        else if (m === toT) this.pos.z = found.minZ - r - 0.03;
        else this.pos.z = found.maxZ + r + 0.03;
      }
      moved = true;
    }
    if (moved && this.level) this.level.setPanSource(this.pos, this.yaw);
    return moved;
  };

  /* ---------------- 碰撞 ---------------- */
  function circleHits(colliders, x, z, r) {
    for (var i = 0; i < colliders.length; i++) {
      var c = colliders[i];
      if (!c.active) continue;
      var nx = clamp(x, c.minX, c.maxX);
      var nz = clamp(z, c.minZ, c.maxZ);
      var dx = x - nx, dz = z - nz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  HPlayer.prototype._move = function (dx, dz) {
    if (!this.level) return;
    var col = this.level.colliders;
    var r = PLAYER_RADIUS;
    var nx = this.pos.x + dx;
    if (!circleHits(col, nx, this.pos.z, r)) this.pos.x = nx;
    var nz = this.pos.z + dz;
    if (!circleHits(col, this.pos.x, nz, r)) this.pos.z = nz;
  };

  /* ---------------- 每帧更新 ---------------- */
  HPlayer.prototype.update = function (dt, ctx) {
    ctx = ctx || {};
    if (!this.enabled || !this.level) { this._applyCamera(dt); return; }
    dt = Math.min(dt, 0.1);
    // 如果因为关门/道具移动导致卡进碰撞体，自动脱困
    if (this.level) {
      this._stuckT = (this._stuckT || 0) + dt;
      if (this._stuckT > 0.25) {
        this._stuckT = 0;
        if (this._hasOverlap()) this._unstick();
      }
    }
    var k = this.keys;
    var fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    var strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    // Shift 奔跑
    var wantRun = (k.ShiftLeft || k.ShiftRight) && fwd > 0 && !this.crouch && !this.hidden && this.stamina > 0.02;
    if (wantRun) {
      this.stamina = clamp(this.stamina - dt * 0.20, 0, 1);
      this.staminaRegenWait = 0.9;
      if (this.stamina <= 0.02) { this.exhausted = true; }
    } else {
      this.staminaRegenWait = Math.max(0, this.staminaRegenWait - dt);
      if (this.staminaRegenWait <= 0) {
        this.stamina = clamp(this.stamina + dt * (this.exhausted ? 0.24 : 0.15), 0, 1);
        if (this.stamina > 0.28) this.exhausted = false;
      }
    }
    // 蹲下（C 切换，拿手电时也可）
    this.crouch = !!this.crouchToggle || this.hidden;
    var running = wantRun && !this.crouch && this.stamina > 0.02;

    var speed = this.hidden ? 0 : (this.crouch ? 1.15 : (running ? 4.6 : 2.55));
    if (!this.hidden) {
      var len = Math.hypot(fwd, strafe);
      if (len > 0.001) {
        var sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
        // 前向 = (-sin, -cos)，右向 = (cos, -sin)
        var mx = (-sinY * fwd + cosY * strafe) / len * speed * dt;
        var mz = (-cosY * fwd - sinY * strafe) / len * speed * dt;
        this._move(mx, mz);
        // 脚步
        this.stepDist += Math.hypot(mx, mz);
        var stepLen = running ? 1.05 : (this.crouch ? 0.62 : 0.82);
        if (this.stepDist >= stepLen) {
          this.stepDist = 0;
          var a = this._audio();
          if (a) { try { a.footstep(this.surface, running, { volume: this.crouch ? 0.32 : 0.6 }); } catch (e) {} }
          if (this.onFootstep) this.onFootstep(running);
        }
        this.bobT += dt * (running ? 11.5 : (this.crouch ? 5.5 : 7.5));
      } else {
        this.bobT += dt * 1.2;
      }
    }
    // 呼吸声
    this._updateBreath(dt, running);

    // 蹲伏高度
    var targetEye = this.crouch ? 1.08 : 1.62;
    this.eyeHeight = this.eyeHeight === undefined ? targetEye : lerp(this.eyeHeight, targetEye, clamp(dt * 9, 0, 1));
    // 镜头晃动
    this.shakeT += dt;
    var shakeK = 0;
    if (this.shakeT < this.shakeDur && this.shakeDur > 0) {
      shakeK = this.shakeAmp * (1 - this.shakeT / this.shakeDur);
    } else {
      this.shakeAmp = 0; this.shakeDur = 0;
    }
    var bob = Math.sin(this.bobT) * (this.crouch ? 0.012 : 0.022);
    var bobX = Math.cos(this.bobT * 0.5) * 0.008;
    // 呼吸起伏（紧张时更明显）
    var breath = Math.sin(performance.now() * 0.0018) * 0.006 * (1 + (1 - this.sanity) * 2.5);

    var cam = this.camera;
    cam.position.set(this.pos.x, (this.eyeHeight || 1.62) + bob + breath, this.pos.z);
    var sx = (Math.sin(this.shakeT * 61.7) + Math.sin(this.shakeT * 39.3)) * 0.5 * shakeK;
    var sy = Math.sin(this.shakeT * 71.3) * shakeK;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + sy, this.yaw + sx * 0.6, (Math.sin(this.bobT * 0.5) * 0.008) + sx * 0.25);
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);

    // 手电筒
    this._updateFlashlight(dt);
    // 精神值
    this._updateSanity(dt);
    // 声像参考
    this.level.setPanSource(this.pos, this.yaw);
    // 手电低电量提示
    var a = this._audio();
    if (this.battery < 0.14 && !this.batteryLow) {
      this.batteryLow = true;
      if (a) { try { a.sfx('battery_low'); } catch (e) {} }
    } else if (this.battery > 0.2) this.batteryLow = false;
  };

  HPlayer.prototype._updateFlashlight = function (dt) {
    var on = this.hasFlashlight && this.flashlightOn && this.battery > 0;
    var intake = 0;
    if (on) {
      this.battery = clamp(this.battery - this.batteryDrain * dt, 0, 1);
      intake = 1.7;
      if (this.battery < 0.15) intake *= (0.65 + Math.random() * 0.7);
      if ((this.battery < 0.06) && Math.random() < 0.25) intake *= Math.random();
    }
    var fl = this.flashlight;
    fl.intensity = lerp(fl.intensity, intake, clamp(dt * 10, 0, 1));
    fl.castShadow = !!(this.shadows);
  };

  HPlayer.prototype._updateSanity = function (dt) {
    var drain = 0;
    if (this.danger > 0.02) drain += 0.0055 * this.danger;
    if (this.inDarkZone) drain += 0.0022;
    if (!this.hasFlashlight || !this.flashlightOn) drain += 0.0018;
    if (this.hidden) drain += 0.0016;
    if (drain > 0) {
      this.sanity = clamp(this.sanity - drain * dt * 12, 0, 1);
    } else {
      this.sanity = clamp(this.sanity + 0.006 * dt, 0, 1);
    }
  };

  HPlayer.prototype._updateBreath = function (dt, running) {
    if (this.hidden) { this.breathState = 'calm'; return; }
    var mode = 'calm';
    if (running) mode = 'run';
    else if (this.sanity < 0.4 || this.danger > 0.5) mode = 'panic';
    else if (this.stamina < 0.5) mode = 'run';
    if (mode !== this.breathState) {
      this.breathState = mode;
      var a = this._audio();
      if (a) {
        try {
          if (mode === 'calm') a.breathStop();
          else a.breathStart(mode);
        } catch (e) {}
      }
    }
  };

  HPlayer.prototype._applyCamera = function (dt) {
    var cam = this.camera;
    cam.position.set(this.pos.x, this.eyeHeight || 1.62, this.pos.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, 0);
  };

  // 由主循环调用的射线检测
  var _ray = new T.Raycaster();
  HPlayer.prototype.raycast = function () {
    var ray = _ray;
    ray.far = 3.6;
    this.camera.updateMatrixWorld();
    ray.setFromCamera({ x: 0, y: 0 }, this.camera);
    if (!this.level) return null;
    var hit = this.level.findInteraction(ray);
    return hit;
  };

  // 隐藏/显示手电筒光源（切场景用）
  HPlayer.prototype.dispose = function () {
    this.camera.remove(this.flashlight);
    this.camera.remove(this.flashlightTarget);
  };

  HW.Player = HPlayer;
})();
