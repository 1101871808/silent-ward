/* ============================================================
   静默病栋 SILENT WARD — 实体 "静默者" entity.js
   程序化生成的高瘦人形，具备：
   - 脚本惊吓（站立/逼近/消失）
   - 追击 AI（视线追踪 + 导航寻路 + 开门）
   - 抓取处决（由主程序接管死亡演出）
   ============================================================ */
(function () {
  'use strict';

  var T = THREE;
  var HW = window.HW;
  var clamp = HW.util.clamp;
  var lerp = HW.util.lerp;
  var M = HW.M;

  function buildModel() {
    var group = new T.Group();
    var skin = new T.MeshStandardMaterial({ color: 0xa8a79a, roughness: 0.62, metalness: 0.02, emissive: new T.Color(0x141613), emissiveIntensity: 0.55 });
    var skinDark = new T.MeshStandardMaterial({ color: 0x8d8c80, roughness: 0.7, metalness: 0.0 });
    var gown = new T.MeshStandardMaterial({ color: 0x8b9691, roughness: 0.93, metalness: 0.0 });
    var gownDark = new T.MeshStandardMaterial({ color: 0x6b7672, roughness: 0.95, metalness: 0.0 });
    var black = new T.MeshStandardMaterial({ color: 0x050606, roughness: 0.9, metalness: 0.0 });
    var blood = new T.MeshStandardMaterial({ color: 0x2a0707, roughness: 0.8, metalness: 0.0 });

    // 躯干（极瘦、拉长）
    var torso = new T.Mesh(new T.CylinderGeometry(0.13, 0.17, 0.72, 10), gown);
    torso.position.y = 1.28;
    torso.castShadow = true;
    group.add(torso);
    var chest = new T.Mesh(new T.CylinderGeometry(0.16, 0.14, 0.34, 10), gownDark);
    chest.position.y = 1.62;
    chest.castShadow = true;
    group.add(chest);
    // 病号服下摆
    var hem = new T.Mesh(new T.CylinderGeometry(0.18, 0.28, 0.5, 10, 1, true), gown);
    hem.position.y = 0.92;
    group.add(hem);
    // 血迹
    var stain = new T.Mesh(new T.CircleGeometry(0.1, 8), blood);
    stain.position.set(0.06, 1.4, 0.15);
    group.add(stain);

    // 头部组
    var headPivot = new T.Group();
    headPivot.position.set(0, 1.86, 0);
    group.add(headPivot);
    var neck = new T.Mesh(new T.CylinderGeometry(0.045, 0.06, 0.22, 8), skin);
    neck.position.y = 0.0;
    headPivot.add(neck);
    var head = new T.Mesh(new T.SphereGeometry(0.125, 14, 12), skin);
    head.position.y = 0.19;
    head.scale.set(0.82, 1.25, 0.9);
    head.castShadow = true;
    headPivot.add(head);
    var jaw = new T.Mesh(new T.CylinderGeometry(0.055, 0.075, 0.14, 8), skinDark);
    jaw.position.set(0, 0.09, 0.03);
    jaw.rotation.x = 0.1;
    headPivot.add(jaw);
    // 眼窝
    for (var s = -1; s <= 1; s += 2) {
      var eye = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), black);
      eye.position.set(s * 0.045, 0.22, 0.095);
      headPivot.add(eye);
      var socket = new T.Mesh(new T.SphereGeometry(0.035, 8, 6), black);
      socket.position.set(s * 0.045, 0.22, 0.08);
      socket.scale.set(1.2, 1.4, 0.5);
      headPivot.add(socket);
    }
    // 嘴
    var mouth = new T.Mesh(new T.BoxGeometry(0.055, 0.10, 0.03), black);
    mouth.position.set(0, 0.075, 0.10);
    headPivot.add(mouth);
    // 头发（几缕）
    for (var h = 0; h < 12; h++) {
      var strand = new T.Mesh(new T.CylinderGeometry(0.004, 0.002, 0.22 + Math.random() * 0.16, 4), black);
      strand.position.set((Math.random() - 0.5) * 0.16, 0.26 + Math.random() * 0.05, (Math.random() - 0.5) * 0.12);
      strand.rotation.z = (Math.random() - 0.5) * 0.5;
      headPivot.add(strand);
    }

    // 手臂
    function makeArm(side) {
      var pivot = new T.Group();
      pivot.position.set(side * 0.19, 1.62, 0);
      var upper = new T.Mesh(new T.CylinderGeometry(0.042, 0.036, 0.5, 8), skin);
      upper.position.y = -0.25;
      upper.castShadow = true;
      pivot.add(upper);
      var elbow = new T.Group();
      elbow.position.y = -0.5;
      pivot.add(elbow);
      var fore = new T.Mesh(new T.CylinderGeometry(0.034, 0.026, 0.52, 8), skin);
      fore.position.y = -0.26;
      fore.castShadow = true;
      elbow.add(fore);
      // 细长的手指
      for (var f = 0; f < 3; f++) {
        var finger = new T.Mesh(new T.CylinderGeometry(0.008, 0.004, 0.2, 4), skinDark);
        finger.position.set((f - 1) * 0.02, -0.62, 0);
        finger.rotation.x = 0.1;
        elbow.add(finger);
      }
      group.add(pivot);
      return { pivot: pivot, elbow: elbow };
    }
    var armL = makeArm(-1);
    var armR = makeArm(1);

    // 腿
    function makeLeg(side) {
      var pivot = new T.Group();
      pivot.position.set(side * 0.09, 0.95, 0);
      var upper = new T.Mesh(new T.CylinderGeometry(0.05, 0.04, 0.48, 8), gownDark);
      upper.position.y = -0.24;
      upper.castShadow = true;
      pivot.add(upper);
      var knee = new T.Group();
      knee.position.y = -0.48;
      pivot.add(knee);
      var shin = new T.Mesh(new T.CylinderGeometry(0.038, 0.028, 0.48, 8), skin);
      shin.position.y = -0.24;
      shin.castShadow = true;
      knee.add(shin);
      var foot = new T.Mesh(new T.BoxGeometry(0.09, 0.05, 0.22), skinDark);
      foot.position.set(0, -0.5, 0.05);
      knee.add(foot);
      group.add(pivot);
      return { pivot: pivot, knee: knee };
    }
    var legL = makeLeg(-1);
    var legR = makeLeg(1);

    group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return {
      group: group,
      parts: {
        torso: torso, chest: chest, headPivot: headPivot, head: head,
        armL: armL, armR: armR, legL: legL, legR: legR,
        mats: [skin, skinDark, gown, gownDark, black, blood]
      }
    };
  }

  function HEntity(scene) {
    var model = buildModel();
    this.scene = scene;
    this.group = model.group;
    this.parts = model.parts;
    this.group.visible = false;
    this.group.scale.set(1.06, 1.12, 1.06);
    scene.add(this.group);
    this.pos = new T.Vector3(0, 0, 0);
    this.state = 'dormant';
    this.level = null;
    this.speed = 3.15;
    this.chaseSpeed = 3.35;
    this.walkPhase = 0;
    this.thinkT = 0;
    this.path = null;
    this.pathT = 0;
    this.script = null;
    this.visibleT = 0;
    this.killT = 0;
    this.activatedAt = 0;
    this.onCatch = null;
    this.onVanish = null;
    this.footT = 0;
    this.lastSeen = new T.Vector3();
    this.openDoorT = 0;
    this.hadSightWhenHidden = false;
    this.animT = 0;
    this.time = 0;
    this.breathLoopId = 0;
  }

  HEntity.prototype.setLevel = function (level) {
    this.level = level;
  };

  HEntity.prototype._audio = function () {
    return (window.HA && HA.ready) ? HA : null;
  };

  HEntity.prototype.spawn = function (x, z, opts) {
    opts = opts || {};
    this.pos.set(x, 0, z);
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.state = opts.state || 'script';
    this.script = opts;
    this.visibleT = 0;
    this.animT = 0;
    this.lastSeen.copy(this.pos);
    this.hadSightWhenHidden = false;
    this.openDoorT = 0;
    this._applyTransform(0, opts.faceYaw || 0);
    var a = this._audio();
    if (a) {
      try {
        a.setTension(0.6);
        if (opts.state === 'chase') { a.setMusicMode('chase', 1.2); this.breathLoopId = a.startLoop('entity_breath', { volume: 0.5 }); }
        else { a.sfx('entity_breath', { volume: 0.5 }); }
        a.sfx('entity_growl', { volume: opts.quiet ? 0.2 : 0.55 });
      } catch (e) {}
    }
    this.activatedAt = performance.now();
  };

  HEntity.prototype.despawn = function (opts) {
    opts = opts || {};
    this.group.visible = false;
    this.state = 'dormant';
    this.script = null;
    this.path = null;
    var a = this._audio();
    if (a) {
      try {
        if (this.breathLoopId) { a.stopLoop(this.breathLoopId, 1.2); this.breathLoopId = 0; }
        if (opts.silent !== true) a.sfx('entity_click', { volume: 0.5 });
      } catch (e) {}
    }
  };

  HEntity.prototype.isActive = function () {
    return this.state !== 'dormant';
  };

  HEntity.prototype.setPosition = function (x, z) {
    this.pos.set(x, 0, z);
    this.group.position.set(x, 0, z);
  };

  // 面朝玩家并缓慢逼近（非致命）
  HEntity.prototype.scriptAppear = function (opts) {
    opts = opts || {};
    this.spawn(opts.x, opts.z, { state: 'script', faceYaw: opts.faceYaw });
    this.script = {
      mode: 'appear',
      duration: opts.duration || 2.6,
      walkSpeed: opts.walkSpeed || 0,
      walkDir: opts.walkDir || null,
      vanishAtEnd: opts.vanishAtEnd !== false,
      vanishOnLook: opts.vanishOnLook || false,
      lookLimit: opts.lookLimit || 0
    };
    this.visibleT = 0;
  };

  // 让实体从正面冲向玩家（用于贴脸 Jump Scare / 死亡）
  HEntity.prototype.rush = function (player, opts) {
    opts = opts || {};
    this.group.visible = true;
    this.state = 'rush';
    this.script = opts;
    var camPos = player.camera.position;
    var yaw = player.yaw;
    var fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    this.pos.set(camPos.x + fx * 1.35, 0, camPos.z + fz * 1.35);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.faceYaw = Math.atan2(-fx, -fz) + Math.PI;
    this.group.rotation.y = this.faceYaw;
    this.animT = 0;
    var a = this._audio();
    if (a) { try { a.jumpScare(opts.style || 'grab'); } catch (e) {} }
  };

  HEntity.prototype.startChase = function (opts) {
    opts = opts || {};
    this.state = 'chase';
    this.script = opts;
    if (opts.x !== undefined) this.setPosition(opts.x, opts.z);
    this.group.visible = true;
    this.chaseSpeed = opts.speed || 3.35;
    this.path = null;
    this.pathT = 0;
    this.thinkT = 0;
    this.activatedAt = performance.now();
    var a = this._audio();
    if (a) {
      try {
        a.setMusicMode('chase', 1.5);
        a.setTension(0.9);
        if (this.breathLoopId) { a.stopLoop(this.breathLoopId, 0.2); this.breathLoopId = 0; }
        this.breathLoopId = a.startLoop('entity_breath', { volume: 0.55 });
        a.sfx('entity_growl', { volume: 0.8 });
      } catch (e) {}
    }
  };

  HEntity.prototype.stopChase = function (opts) {
    opts = opts || {};
    this.state = 'dormant';
    this.group.visible = false;
    this.path = null;
    var a = this._audio();
    if (a) {
      try {
        if (this.breathLoopId) { a.stopLoop(this.breathLoopId, 1.0); this.breathLoopId = 0; }
        a.setMusicMode('explore', 2.0);
        a.setTension(0.2);
      } catch (e) {}
    }
  };

  /* ---------------- 感知 ---------------- */
  HEntity.prototype.canSee = function (player) {
    if (!this.level) return false;
    var dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    var d = Math.hypot(dx, dz);
    if (d > 20) return false;
    if (player.hidden) return false;
    return !this.level.occluded(this.pos, player.pos);
  };

  HEntity.prototype._tryOpenDoor = function () {
    if (!this.level) return false;
    var doors = this.level.doorList;
    for (var i = 0; i < doors.length; i++) {
      var d = doors[i];
      if (d.open || d.locked) continue;
      if (Math.hypot(d.center - this.pos.x, (d.axis === 'x' ? d.fixed : 0) - this.pos.z) < 4) {
        // 距离中心
      }
      var cx = d.axis === 'x' ? d.center : d.fixed;
      var cz = d.axis === 'x' ? d.fixed : d.center;
      var dist = Math.hypot(cx - this.pos.x, cz - this.pos.z);
      if (dist < 1.9) {
        d.setOpen(true, { silent: false });
        this.openDoorT = 1.1;
        var a = this._audio();
        if (a) { try { a.sfx('door_creak', { volume: 0.8 }); } catch (e) {} }
        return true;
      }
    }
    return false;
  };

  HEntity.prototype._moveToward = function (tx, tz, speed, dt) {
    if (!this.level) return;
    var dx = tx - this.pos.x, dz = tz - this.pos.z;
    var d = Math.hypot(dx, dz);
    if (d < 0.001) return;
    dx /= d; dz /= d;
    var step = speed * dt;
    var col = this.level.colliders;
    var r = 0.34;
    function hit(x, z) {
      for (var i = 0; i < col.length; i++) {
        var c = col[i];
        if (!c.active) continue;
        if (c.tag === 'prop') continue;
        var nx = clamp(x, c.minX, c.maxX);
        var nz = clamp(z, c.minZ, c.maxZ);
        var ddx = x - nx, ddz = z - nz;
        if (ddx * ddx + ddz * ddz < r * r) return true;
      }
      return false;
    }
    var moved = false;
    var nx = this.pos.x + dx * step;
    if (!hit(nx, this.pos.z)) { this.pos.x = nx; moved = true; }
    var nz = this.pos.z + dz * step;
    if (!hit(this.pos.x, nz)) { this.pos.z = nz; moved = true; }
    if (!moved) {
      // 尝试侧移绕开
      var sx = this.pos.x - dz * step, sz = this.pos.z + dx * step;
      if (!hit(sx, sz)) { this.pos.x = sx; this.pos.z = sz; moved = true; }
    }
    if (!moved) this._tryOpenDoor();
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.faceYaw = Math.atan2(-dx, -dz) + Math.PI;
    this.walkPhase += dt * (speed > 2.5 ? 7.5 : 4.0);
    this.animT += dt;
  };

  HEntity.prototype._animate = function (dt, mode) {
    var p = this.parts;
    var phase = this.walkPhase;
    var amp = mode === 'chase' ? 0.75 : (mode === 'walk' ? 0.42 : 0.06);
    p.legL.pivot.rotation.x = Math.sin(phase) * amp;
    p.legR.pivot.rotation.x = -Math.sin(phase) * amp;
    p.legL.knee.rotation.x = Math.max(0, Math.sin(phase + 1.2)) * 0.5 * amp;
    p.legR.knee.rotation.x = Math.max(0, -Math.sin(phase + 1.2)) * 0.5 * amp;
    p.armL.pivot.rotation.x = -Math.sin(phase) * amp * (mode === 'chase' ? 0.9 : 0.55);
    p.armR.pivot.rotation.x = Math.sin(phase) * amp * (mode === 'chase' ? 0.9 : 0.55);
    p.armL.pivot.rotation.z = 0.08;
    p.armR.pivot.rotation.z = -0.08;
    if (mode === 'chase') {
      // 追击时前倾、手臂前伸
      p.armL.pivot.rotation.x = lerp(p.armL.pivot.rotation.x, -1.2, 0.5);
      p.armR.pivot.rotation.x = lerp(p.armR.pivot.rotation.x, -1.2, 0.5);
      this.group.rotation.x = 0.12;
    } else {
      this.group.rotation.x = 0;
    }
    // 头部不规则抽动
    var tw = Math.sin(this.animT * 3.1) * Math.sin(this.animT * 7.3);
    p.headPivot.rotation.z = tw * 0.14;
    p.headPivot.rotation.x = Math.sin(this.animT * 1.7) * 0.06;
    // 呼吸起伏
    p.chest.scale.y = 1 + Math.sin(this.animT * 2.2) * 0.03;
    this.group.rotation.y = this.faceYaw;
  };

  HEntity.prototype._applyTransform = function (dt, faceYaw) {
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.faceYaw = faceYaw || 0;
    this.group.rotation.y = this.faceYaw;
  };

  /* ---------------- 主更新 ---------------- */
  HEntity.prototype.update = function (dt, player) {
    if (this.state === 'dormant') return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.visibleT += dt;
    var a = this._audio();
    var dist = player ? Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) : 99;

    if (this.state === 'script') {
      var sc = this.script || {};
      // 面向玩家
      if (player && sc.facePlayer !== false) {
        var dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
        var want = Math.atan2(-dx, -dz) + Math.PI;
        var diff = ((want - this.faceYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        this.faceYaw += diff * clamp(dt * 2.5, 0, 1);
      }
      if (sc.walkSpeed && sc.walkDir) {
        this._moveToward(this.pos.x + sc.walkDir.x * 10, this.pos.z + sc.walkDir.z * 10, sc.walkSpeed, dt);
      }
      this._animate(dt, sc.walkSpeed ? 'walk' : 'idle');
      this.group.position.set(this.pos.x, 0, this.pos.z);
      // 注视玩家太久就消失（抑制被看清）
      if (sc.vanishOnLook && player && player.lookingAtEntity && this.visibleT > (sc.lookLimit || 0.6)) {
        this._vanish();
        return;
      }
      if (sc.duration && this.visibleT > sc.duration) {
        this._vanish();
        return;
      }
      if (dist < 1.4 && sc.lethal) this._catch(player);
      return;
    }

    if (this.state === 'rush') {
      // 冲到玩家面前（死亡/贴脸）
      if (player) {
        var fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
        var tx = player.camera.position.x + fx * 1.05;
        var tz = player.camera.position.z + fz * 1.05;
        this.pos.x = lerp(this.pos.x, tx, clamp(dt * 14, 0, 1));
        this.pos.z = lerp(this.pos.z, tz, clamp(dt * 14, 0, 1));
        this.faceYaw = Math.atan2(-(player.camera.position.x - this.pos.x), -(player.camera.position.z - this.pos.z)) + Math.PI;
        this.group.position.set(this.pos.x, 0, this.pos.z);
        this.group.rotation.y = this.faceYaw;
        this.parts.armL.pivot.rotation.x = -1.5 + Math.sin(this.time * 20) * 0.2;
        this.parts.armR.pivot.rotation.x = -1.5 - Math.sin(this.time * 20) * 0.2;
        this.parts.headPivot.rotation.z = Math.sin(this.time * 15) * 0.2;
      }
      return;
    }

    if (this.state === 'chase') {
      if (!player) return;
      var see = this.canSee(player);
      if (see) this.lastSeen.set(player.pos.x, 0, player.pos.z);
      var target = see ? player.pos : this.lastSeen;
      var targetDist = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
      // 玩家躲藏且在附近：搜索后离开
      if (player.hidden && dist < 6) {
        this.state = 'search';
        this.searchT = 5.0;
        return;
      }
      if (!see && targetDist < 0.9) {
        this.state = 'search';
        this.searchT = 4.0;
        this.searchTarget = { x: player.pos.x, z: player.pos.z };
        return;
      }
      // 直接移动
      var speed = this.chaseSpeed;
      if (targetDist > 0.5) this._moveToward(target.x, target.z, speed, dt);
      this._animate(dt, 'chase');
      this.group.position.set(this.pos.x, 0, this.pos.z);
      // 脚步与呼吸
      this.footT += dt;
      if (a && this.footT > 0.42) {
        this.footT = 0;
        try { a.footstep('concrete', true, { volume: 0.45, pan: 0.2 }); } catch (e) {}
      }
      // 抓捕判定
      if (dist < 1.25 && (see || dist < 0.8)) this._catch(player);
      return;
    }

    if (this.state === 'search') {
      this.searchT -= dt;
      this._animate(dt, 'walk');
      var st = this.searchTarget || this.lastSeen;
      if (st) {
        var d2 = Math.hypot(st.x - this.pos.x, st.z - this.pos.z);
        if (d2 > 1.0) this._moveToward(st.x, st.z, 2.0, dt);
        else this.walkPhase += dt * 2.0;
      }
      this.group.position.set(this.pos.x, 0, this.pos.z);
      if (a && Math.random() < dt * 0.6) { try { a.sfx('entity_click', { volume: 0.35, pan: 0.4 }); } catch (e) {} }
      if (this.searchT <= 0) {
        // 失去目标，消失
        this._vanish();
      }
      return;
    }
  };

  HEntity.prototype._vanish = function () {
    this.group.visible = false;
    this.state = 'dormant';
    var a = this._audio();
    if (a) { try { a.sfx('entity_click', { volume: 0.6 }); if (this.breathLoopId) { a.stopLoop(this.breathLoopId, 1.0); this.breathLoopId = 0; } a.setMusicMode('explore', 2.0); a.setTension(0.25); } catch (e) {} }
    if (this.onVanish) this.onVanish();
  };

  HEntity.prototype._catch = function (player) {
    if (this.state === 'killing') return;
    this.state = 'killing';
    this.killT = 0;
    var a = this._audio();
    if (a) { try { a.jumpScare('grab'); } catch (e) {} }
    if (this.onCatch) this.onCatch(player);
  };

  HEntity.prototype.dispose = function () {
    if (this.group.parent) this.group.parent.remove(this.group);
  };

  // 供剧情判断玩家是否正看着实体
  HEntity.isLooking = function (player, entity, fov) {
    if (!player || !entity) return false;
    var dirX = Math.sin(player.yaw), dirZ = Math.cos(player.yaw);
    var vx = entity.pos.x - player.camera.position.x, vz = entity.pos.z - player.camera.position.z;
    var len = Math.hypot(vx, vz);
    if (len < 0.01) return true;
    var dot = (vx / len) * -dirX + (vz / len) * -dirZ;
    return dot > Math.cos((fov || 35) * Math.PI / 180);
  };

  HW.Entity = HEntity;
})();
