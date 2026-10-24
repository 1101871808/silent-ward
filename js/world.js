/* ============================================================
   静默病栋 SILENT WARD — 关卡构建核心 world.js
   - 用程序化几何体搭建医院场景（含 PBR 贴图 UV 世界坐标映射）
   - 静态几何按材质合并，把 draw call 压到最低
   - 动态点光源池（固定 6 盏，避免着色器反复编译导致卡顿）
   - 门、可交互物、触发区、躲藏柜、寻路导航
   ============================================================ */
(function () {
  'use strict';
  function isFirstRun() { return !!(window.HGame && window.HGame.run === 1); }

  var T = THREE;
  var HW = window.HW = {};
  var WALL_T = 0.12;
  var DOOR_H = 2.05;
  var DOOR_W = 1.06;

  function M(name, opts) { return HT.mat(name, opts); }
  function v3(x, y, z) { return new T.Vector3(x, y, z); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ============================================================
     UV：让贴图按"真实世界尺寸"平铺，而不是每个面拉伸
     ============================================================ */
  function boxUV(geo, w, h, d, tile) {
    tile = tile || 1;
    var uv = geo.attributes.uv;
    var faceU = [d, d, w, w, w, w];
    var faceV = [h, h, d, d, h, h];
    for (var f = 0; f < 6; f++) {
      for (var i = 0; i < 4; i++) {
        var k = (f * 4 + i) * 2;
        uv.setXY(k, uv.getX(k) * faceU[f] / tile, uv.getY(k) * faceV[f] / tile);
      }
    }
    uv.needsUpdate = true;
    return geo;
  }

  function planeUV(geo, w, h, tile) {
    tile = tile || 1;
    var uv = geo.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
    uv.needsUpdate = true;
    return geo;
  }

  function disposeGeo(geo) { if (geo) geo.dispose(); }

  /* ============================================================
     静态几何合并：按材质 uuid 合并，极大降低 draw call
     ============================================================ */
  function isNoMerge(mesh, root) {
    var o = mesh;
    while (o && o !== root) {
      if (o.userData && o.userData.noMerge) return true;
      o = o.parent;
    }
    return false;
  }

  function mergeMeshes(meshes) {
    var total = 0;
    var prepared = [];
    for (var i = 0; i < meshes.length; i++) {
      var m = meshes[i];
      m.updateWorldMatrix(true, false);
      var g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) {
        var n = g.attributes.position.count;
        var arr = new Float32Array(n * 2);
        g.setAttribute('uv', new T.BufferAttribute(arr, 2));
      }
      prepared.push(g);
      total += g.attributes.position.count;
    }
    var pos = new Float32Array(total * 3);
    var nor = new Float32Array(total * 3);
    var uv = new Float32Array(total * 2);
    var off = 0;
    for (var j = 0; j < prepared.length; j++) {
      var gg = prepared[j];
      pos.set(gg.attributes.position.array, off * 3);
      nor.set(gg.attributes.normal.array, off * 3);
      uv.set(gg.attributes.uv.array, off * 2);
      off += gg.attributes.position.count;
      disposeGeo(gg);
    }
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  function bakeStatic(level) {
    var root = level.mergeRoot;
    if (!root) return;
    root.updateMatrixWorld(true);
    // 把标记了 noMerge 的子树整体移出（保持世界变换）
    var moveOut = [];
    root.traverse(function (o) {
      if (o === root) return;
      if (o.userData && o.userData.noMerge) {
        var parent = o.parent;
        var skip = false;
        while (parent && parent !== root) {
          if (parent.userData && parent.userData.noMerge) { skip = true; break; }
          parent = parent.parent;
        }
        if (!skip) moveOut.push(o);
      }
    });
    for (var i = 0; i < moveOut.length; i++) {
      if (moveOut[i].parent === root || moveOut[i].parent) level.group.attach(moveOut[i]);
    }
    // 收集剩余 mesh 按材质分组
    var groups = new Map();
    var list = [];
    root.traverse(function (o) {
      if (!o.isMesh) return;
      if (o.userData && o.userData.noMerge) return;
      list.push(o);
    });
    for (var k = 0; k < list.length; k++) {
      var mesh = list[k];
      var mat = mesh.material;
      if (!mat) continue;
      var key = mat.uuid + '|' + (mesh.castShadow ? 1 : 0);
      if (!groups.has(key)) groups.set(key, { mat: mat, cast: mesh.castShadow, meshes: [] });
      groups.get(key).meshes.push(mesh);
    }
    var bakedMeshes = [];
    groups.forEach(function (g) {
      var geo = mergeMeshes(g.meshes);
      var mm = new T.Mesh(geo, g.mat);
      mm.castShadow = g.cast;
      mm.receiveShadow = true;
      mm.frustumCulled = false;
      level.group.add(mm);
      bakedMeshes.push(mm);
      for (var i = 0; i < g.meshes.length; i++) {
        var om = g.meshes[i];
        if (om.parent) om.parent.remove(om);
      }
    });
    level.group.remove(root);
    level.baked = bakedMeshes;
    // 清理
    root.traverse(function (o) {
      if (o.isMesh && o.geometry && level.baked.indexOf(o) < 0) disposeGeo(o.geometry);
    });
  }

  /* ============================================================
     LevelBuilder
     ============================================================ */
  function LevelBuilder(id, scene) {
    this.id = id;
    this.scene = scene;
    this.group = new T.Group();
    this.group.name = 'level_' + id;
    scene.add(this.group);
    this.mergeRoot = new T.Group();
    this.group.add(this.mergeRoot);

    this.colliders = [];
    this.doors = {};
    this.doorList = [];
    this.interactables = [];
    this.interactMeshes = [];
    this.triggers = [];
    this.fixtures = [];
    this.lights = [];
    this.navNodes = [];
    this.lockers = {};
    this.lightsPool = [];
    this.poolIndex = 0;
    this.story = {};
    this.markerPoints = null;
    this.markerGeo = null;
    this.time = 0;
    this.playerSpawn = { x: 0, z: 0, yaw: 0 };
    this.ambient = {
      fogColor: 0x050a0b,
      fogDensity: 0.045,
      ambientColor: 0x152024,
      ambientIntensity: 0.42,
      hemiSky: 0x1d2c30, hemiGround: 0x0a0d0c, hemiIntensity: 0.32,
      flashlight: true
    };
    this.level = null;
  }

  LevelBuilder.prototype._addMesh = function (geo, mat, x, y, z, opts) {
    opts = opts || {};
    var mesh = new T.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (opts.rotX) mesh.rotation.x = opts.rotX;
    if (opts.rotY) mesh.rotation.y = opts.rotY;
    if (opts.rotZ) mesh.rotation.z = opts.rotZ;
    mesh.receiveShadow = opts.receive !== false;
    mesh.castShadow = opts.cast === true;
    if (opts.noMerge) mesh.userData.noMerge = true;
    if (opts.parent) opts.parent.add(mesh);
    else if (opts.noMerge) this.group.add(mesh);
    else this.mergeRoot.add(mesh);
    if (opts.collide) {
      var b = new T.Box3().setFromObject(mesh);
      this.colliders.push({
        minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z,
        // 只有墙/门这类明确指定的大障碍才阻挡交互视线；家具默认不阻挡
        blocksSight: opts.blocksSight === true, active: true, tag: opts.tag || null
      });
    }
    return mesh;
  };

  // 立方体（世界边界坐标）
  LevelBuilder.prototype.box = function (cfg) {
    var w = cfg.x2 - cfg.x1, h = cfg.y2 - cfg.y1, d = cfg.z2 - cfg.z1;
    if (w <= 0 || h <= 0 || d <= 0) return null;
    var tile = cfg.tile || (cfg.mat && cfg.mat.userData && cfg.mat.userData.tile) || 1;
    var geo = boxUV(new T.BoxGeometry(w, h, d), w, h, d, tile);
    var mesh = this._addMesh(geo, cfg.mat, (cfg.x1 + cfg.x2) / 2, (cfg.y1 + cfg.y2) / 2, (cfg.z1 + cfg.z2) / 2, cfg);
    if (cfg.collide) {
      this.colliders[this.colliders.length - 1].minX = cfg.x1;
      this.colliders[this.colliders.length - 1].maxX = cfg.x2;
      this.colliders[this.colliders.length - 1].minZ = cfg.z1;
      this.colliders[this.colliders.length - 1].maxZ = cfg.z2;
    }
    return mesh;
  };

  // 平面
  LevelBuilder.prototype.plane = function (cfg) {
    var tile = cfg.tile || 1;
    var geo = planeUV(new T.PlaneGeometry(cfg.w, cfg.h), cfg.w, cfg.h, tile);
    return this._addMesh(geo, cfg.mat, cfg.x, cfg.y, cfg.z, {
      rotX: cfg.rotX, rotY: cfg.rotY, rotZ: cfg.rotZ,
      noMerge: cfg.noMerge, receive: cfg.receive, cast: false, parent: cfg.parent
    });
  };

  // 放置 props.js 生成的道具
  /* ---------------- 道具接触阴影（落地物） ---------------- */
  LevelBuilder.prototype._initContactShadow = function () {
    if (this._contactMat) return;
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.62)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    var tex = new T.CanvasTexture(c);
    tex.needsUpdate = true;
    this._contactMat = new T.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.9, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
  };

  LevelBuilder.prototype._addContactShadow = function (obj) {
    if (!obj || !obj.userData || obj.userData.mount !== 'floor') return;
    if (obj.userData.noContactShadow) return;
    obj.updateMatrixWorld(true);
    var bb = new T.Box3().setFromObject(obj);
    if (!isFinite(bb.min.x) || bb.max.x <= bb.min.x) return;
    var w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
    if (w < 0.08 || d < 0.08 || w > 9 || d > 9) return;
    this._initContactShadow();
    var geo = new T.PlaneGeometry(w * 1.3, d * 1.3);
    var m = new T.Mesh(geo, this._contactMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((bb.min.x + bb.max.x) / 2, 0.0075, (bb.min.z + bb.max.z) / 2);
    m.userData.noMerge = false;
    this.mergeRoot.add(m);
  };

  LevelBuilder.prototype.prop = function (obj, x, z, opts) {
    opts = opts || {};
    obj.position.set(x, opts.y || 0, z);
    obj.rotation.y = opts.rotY || 0;
    if (opts.rotX) obj.rotation.x = opts.rotX;
    if (opts.rotZ) obj.rotation.z = opts.rotZ;
    if (opts.noMerge) obj.userData.noMerge = true;
    if (!opts.noContactShadow) this._addContactShadow(obj);
    if (opts.collide !== false) {
      this.group.add(obj);
      obj.updateWorldMatrix(true, true);
      var b = new T.Box3().setFromObject(obj);
      if (isFinite(b.min.x) && isFinite(b.min.z) && b.max.x > b.min.x && b.max.z > b.min.z) {
        this.colliders.push({
          minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z,
          blocksSight: opts.blocksSight === true, active: true
        });
      }
      this.group.remove(obj);
    }
    if (opts.noMerge) this.group.add(obj);
    else this.mergeRoot.add(obj);
    return obj;
  };

  // 不可见的交互代理盒（视觉物体可能被静态合并，用它做射线拾取）
  LevelBuilder.prototype.proxy = function (x, y, z, w, h, d) {
    var mat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    mat.visible = false;
    var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.userData.noMerge = true;
    m.userData.isProxy = true;
    this.group.add(m);
    return m;
  };

  // 带门窗洞的墙
  LevelBuilder.prototype.wall = function (cfg) {
    var axis = cfg.axis || 'x';
    var fixed = cfg.fixed;
    var from = cfg.from, to = cfg.to;
    var t = cfg.thickness || WALL_T;
    var y0 = cfg.y0 || 0, y1 = cfg.y1 !== undefined ? cfg.y1 : 3.0;
    var openings = (cfg.openings || []).slice().sort(function (a, b) { return a.center - b.center; });
    var layers = cfg.layers || [{ y0: y0, y1: y1, mat: cfg.mat, tile: cfg.tile }];
    var self = this;
    var segs = [{ a: from, b: to }];
    openings.forEach(function (op) {
      var a = op.center - op.width / 2, b = op.center + op.width / 2;
      var next = [];
      segs.forEach(function (s) {
        if (b <= s.a || a >= s.b) { next.push(s); return; }
        if (a > s.a) next.push({ a: s.a, b: a });
        if (b < s.b) next.push({ a: b, b: s.b });
      });
      segs = next;
    });
    layers.forEach(function (layer) {
      var ly0 = layer.y0, ly1 = layer.y1;
      segs.forEach(function (s) {
        if (s.b - s.a < 0.005) return;
        self._wallBox(axis, fixed, s.a, s.b, ly0, ly1, t, layer, cfg, false);
      });
      openings.forEach(function (op) {
        var top = op.height !== undefined ? op.height : DOOR_H;
        var a = op.center - op.width / 2, b = op.center + op.width / 2;
        var startY = Math.max(ly0, top);
        if (ly1 > startY + 0.005) {
          // 门洞上方的过梁只做视觉，不加碰撞（否则会把门洞堵死）
          self._wallBox(axis, fixed, a, b, startY, ly1, t, layer, cfg, true);
        }
      });
    });
  };

  LevelBuilder.prototype._wallBox = function (axis, fixed, a, b, y0, y1, t, layer, cfg, noCollider) {
    var h = y1 - y0;
    var geo, mesh;
    var tile = layer.tile || cfg.tile || 1;
    if (axis === 'x') {
      var w = b - a;
      geo = boxUV(new T.BoxGeometry(w, h, t), w, h, t, tile);
      mesh = this._addMesh(geo, layer.mat, (a + b) / 2, (y0 + y1) / 2, fixed, { noMerge: cfg.noMerge, receive: true, cast: cfg.cast !== false });
      if (cfg.collide !== false && !noCollider) {
        this.colliders.push({ minX: a, maxX: b, minZ: fixed - t / 2, maxZ: fixed + t / 2, blocksSight: cfg.blocksSight !== false, active: true, tag: 'wall' });
      }
    } else {
      var d = b - a;
      geo = boxUV(new T.BoxGeometry(t, h, d), t, h, d, tile);
      mesh = this._addMesh(geo, layer.mat, fixed, (y0 + y1) / 2, (a + b) / 2, { noMerge: cfg.noMerge, receive: true, cast: cfg.cast !== false });
      if (cfg.collide !== false && !noCollider) {
        this.colliders.push({ minX: fixed - t / 2, maxX: fixed + t / 2, minZ: a, maxZ: b, blocksSight: cfg.blocksSight !== false, active: true, tag: 'wall' });
      }
    }
    return mesh;
  };

  // 地面 / 天花板
  LevelBuilder.prototype.floor = function (x1, z1, x2, z2, mat, tile) {
    var w = x2 - x1, d = z2 - z1;
    var geo = planeUV(new T.PlaneGeometry(w, d), w, d, tile || 1);
    var mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    mesh.receiveShadow = true;
    this.mergeRoot.add(mesh);
    return mesh;
  };

  LevelBuilder.prototype.ceiling = function (x1, z1, x2, z2, mat, y, tile) {
    var w = x2 - x1, d = z2 - z1;
    var geo = planeUV(new T.PlaneGeometry(w, d), w, d, tile || 1);
    var mesh = new T.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set((x1 + x2) / 2, y === undefined ? 2.95 : y, (z1 + z2) / 2);
    this.mergeRoot.add(mesh);
    return mesh;
  };

  // 房间外壳（不包含与走廊共用的那面墙）
  LevelBuilder.prototype.room = function (cfg) {
    var x1 = cfg.x1, x2 = cfg.x2, z1 = cfg.z1, z2 = cfg.z2;
    var H = cfg.height || 2.95;
    var floorMat = cfg.floorMat || M('tileFloor');
    var ceilMat = cfg.ceilMat || M('ceiling');
    var wallMat = cfg.wallMat || M('wallPaint');
    var lowerMat = cfg.lowerMat || cfg.tileMat || M('tileWall');
    var lowerH = cfg.lowerH !== undefined ? cfg.lowerH : 1.15;
    var floorTile = cfg.floorTile || HT.tileSize.tileFloor;
    var wallTile = cfg.wallTile || HT.tileSize.wallPaint;
    var tileSize = cfg.tileWall || HT.tileSize.tileWall;

    this.floor(x1, z1, x2, z2, floorMat, floorTile);
    this.ceiling(x1, z1, x2, z2, ceilMat, H, cfg.ceilTile || HT.tileSize.ceiling);

    var layers = cfg.plainWall ? [{ y0: 0, y1: H, mat: wallMat, tile: wallTile }] : [
      { y0: 0, y1: lowerH, mat: lowerMat, tile: tileSize },
      { y0: lowerH, y1: H, mat: wallMat, tile: wallTile }
    ];
    var t = WALL_T;
    // 左右侧墙
    this.wall({ axis: 'z', fixed: x1 - t / 2, from: z1 - t, to: z2 + t, y1: H, layers: layers });
    this.wall({ axis: 'z', fixed: x2 + t / 2, from: z1 - t, to: z2 + t, y1: H, layers: layers });
    // 外侧墙
    if (cfg.side === 'north') {
      this.wall({ axis: 'x', fixed: z1 - t / 2, from: x1 - t, to: x2 + t, y1: H, layers: layers });
    } else if (cfg.side === 'south') {
      this.wall({ axis: 'x', fixed: z2 + t / 2, from: x1 - t, to: x2 + t, y1: H, layers: layers });
    } else if (cfg.side === 'west') {
      this.wall({ axis: 'z', fixed: x1 - t / 2, from: z1 - t, to: z2 + t, y1: H, layers: layers });
    } else if (cfg.side === 'east') {
      this.wall({ axis: 'z', fixed: x2 + t / 2, from: z1 - t, to: z2 + t, y1: H, layers: layers });
    }
    // 踢脚线
    if (cfg.skirting !== false) {
      var sk = M('metalDark');
      var skH = 0.09;
      this.box({ x1: x1, x2: x2, y1: 0, y2: skH, z1: z1, z2: z1 + 0.025, mat: sk, tile: 1, collide: false });
      this.box({ x1: x1, x2: x2, y1: 0, y2: skH, z1: z2 - 0.025, z2: z2, mat: sk, tile: 1, collide: false });
      this.box({ x1: x1, x2: x1 + 0.025, y1: 0, y2: skH, z1: z1, z2: z2, mat: sk, tile: 1, collide: false });
      this.box({ x1: x2 - 0.025, x2: x2, y1: 0, y2: skH, z1: z1, z2: z2, mat: sk, tile: 1, collide: false });
    }
  };

  /* ------------------------------------------------------------
     门
  ------------------------------------------------------------ */
  LevelBuilder.prototype.door = function (cfg) {
    // 一周目：只允许 302 房门和白房门打开，其他门全部锁死
    if (isFirstRun() && cfg) {
      var openIds = ['door302', 'doorWhite', 'doorFire1', 'doorFire2'];
      if (openIds.indexOf(cfg.id) >= 0) { cfg.locked = false; cfg.lockedMsg = ''; }
      else { cfg.locked = true; cfg.lockedMsg = '门锁着。'; }
    }
    var self = this;
    var id = cfg.id;
    var axis = cfg.axis || 'x';
    var width = cfg.width || DOOR_W;
    var height = cfg.height || DOOR_H;
    var fixed = cfg.fixed;
    var center = cfg.center;
    var swing = cfg.swing || 1;
    var hingeMin = cfg.hinge !== 'max';
    var openAngle = cfg.openAngle || 1.7;
    var leafMat = cfg.mat || M('paintCream');
    var frameMat = M('metalDark');

    var pivot = new T.Group();
    var leaf, collider;
    var leafCenterX = width / 2;

    // 门框
    var ft = 0.07;
    var jambMat = frameMat;
    if (axis === 'x') {
      var hx = hingeMin ? center - width / 2 : center + width / 2;
      pivot.position.set(hx, 0, fixed);
      pivot.rotation.y = hingeMin ? 0 : Math.PI;
      // 门框内侧稍微伸进门洞 4mm，避免和墙体切断面共面产生闪烁
      this.box({ x1: center - width / 2 - ft, x2: center - width / 2 + 0.004, y1: 0, y2: height + 0.06, z1: fixed - 0.09, z2: fixed + 0.09, mat: jambMat, tile: 1, collide: false });
      this.box({ x1: center + width / 2 - 0.004, x2: center + width / 2 + ft, y1: 0, y2: height + 0.06, z1: fixed - 0.09, z2: fixed + 0.09, mat: jambMat, tile: 1, collide: false });
      this.box({ x1: center - width / 2 + 0.004, x2: center + width / 2 - 0.004, y1: height - 0.004, y2: height + 0.07, z1: fixed - 0.09, z2: fixed + 0.09, mat: jambMat, tile: 1, collide: false });
    } else {
      var hz = hingeMin ? center - width / 2 : center + width / 2;
      pivot.position.set(fixed, 0, hz);
      pivot.rotation.y = hingeMin ? -Math.PI / 2 : Math.PI / 2;
      this.box({ x1: fixed - 0.09, x2: fixed + 0.09, y1: 0, y2: height + 0.06, z1: center - width / 2 - ft, z2: center - width / 2 + 0.004, mat: jambMat, tile: 1, collide: false });
      this.box({ x1: fixed - 0.09, x2: fixed + 0.09, y1: 0, y2: height + 0.06, z1: center + width / 2 - 0.004, z2: center + width / 2 + ft, mat: jambMat, tile: 1, collide: false });
      this.box({ x1: fixed - 0.09, x2: fixed + 0.09, y1: height - 0.004, y2: height + 0.07, z1: center - width / 2 + 0.004, z2: center + width / 2 - 0.004, mat: jambMat, tile: 1, collide: false });
    }

    // 门板
    var leafGeo = boxUV(new T.BoxGeometry(width, height, 0.05), width, height, 0.05, HT.tileSize.paintMetal || 1);
    leaf = new T.Mesh(leafGeo, leafMat);
    leaf.position.set(leafCenterX, height / 2, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    pivot.add(leaf);

    // 门上的观察窗
    var winW = Math.min(0.38, width * 0.42), winH = 0.5;
    var winGeo = new T.BoxGeometry(winW, winH, 0.012);
    var win = new T.Mesh(winGeo, M('glass'));
    win.position.set(leafCenterX, height - 0.55, 0.032);
    pivot.add(win);
    var winFrameGeo = new T.BoxGeometry(winW + 0.07, winH + 0.07, 0.02);
    var winFrame = new T.Mesh(winFrameGeo, M('metalDark'));
    winFrame.position.set(leafCenterX, height - 0.55, 0.012);
    pivot.add(winFrame);

    // 踢脚金属板
    var kickGeo = new T.BoxGeometry(width * 0.94, 0.24, 0.012);
    var kick = new T.Mesh(kickGeo, M('stainless'));
    kick.position.set(leafCenterX, 0.18, 0.032);
    pivot.add(kick);

    // 门把手
    var handleGeo = new T.BoxGeometry(0.13, 0.03, 0.06);
    var handle = new T.Mesh(handleGeo, M('stainless'));
    handle.position.set(width - 0.14, 1.02, 0.05);
    pivot.add(handle);

    // 门槛（遮住门洞处地板缝隙）
    var thMat = cfg.thresholdMat || M('tileFloor');
    if (axis === 'x') {
      this.box({ x1: center - width / 2, x2: center + width / 2, y1: 0, y2: 0.012, z1: fixed - 0.13, z2: fixed + 0.13, mat: thMat, tile: HT.tileSize.tileFloor || 1.2, collide: false });
    } else {
      this.box({ x1: fixed - 0.13, x2: fixed + 0.13, y1: 0, y2: 0.012, z1: center - width / 2, z2: center + width / 2, mat: thMat, tile: HT.tileSize.tileFloor || 1.2, collide: false });
    }

    this.group.add(pivot);

    if (axis === 'x') {
      collider = { minX: center - width / 2, maxX: center + width / 2, minZ: fixed - 0.08, maxZ: fixed + 0.08, blocksSight: true, active: true, tag: 'door' };
    } else {
      collider = { minX: fixed - 0.08, maxX: fixed + 0.08, minZ: center - width / 2, maxZ: center + width / 2, blocksSight: true, active: true, tag: 'door' };
    }
    this.colliders.push(collider);

    var door = {
      id: id, axis: axis, center: center, fixed: fixed, width: width, height: height,
      pivot: pivot, leaf: leaf, baseRot: pivot.rotation.y, swing: swing,
      openAngle: openAngle, open: false, locked: !!cfg.locked, lockedMsg: cfg.lockedMsg || '',
      requires: cfg.requires || null, collider: collider, anim: 1,
      targetOpen: false, speed: cfg.speed || 2.2, silent: false,
      centerPos: axis === 'x' ? v3(center, height * 0.5, fixed) : v3(fixed, height * 0.5, center)
    };
    door.prompt = function () {
      if (door.locked) return door.lockedMsg || '门锁着';
      return door.open ? '关门' : '开门';
    };
    door.setOpen = function (open, opts) {
      opts = opts || {};
      if (door.locked && open && !opts.force) return false;
      door.open = open;
      door.targetOpen = open;
      collider.active = !open;
      if (!opts.silent && window.HA && HA.ready) {
        try { HA.sfx(open ? 'door_open' : 'door_close', { pan: self.panTo(door.centerPos) }); } catch (e) {}
      }
      return true;
    };
    door.toggle = function () { return door.setOpen(!door.open); };
    door.unlock = function () { door.locked = false; door.lockedMsg = ''; };
    door.lock = function (msg) { door.locked = true; door.lockedMsg = msg || '门锁着'; if (door.open) door.setOpen(false); };

    this.doors[id] = door;
    this.doorList.push(door);
    // 门作为可交互物
    this.addInteractable({
      id: 'door_' + id,
      kind: 'door',
      doorId: id,
      object: pivot,
      prompt: function () { return door.prompt(); },
      radius: 3.0,
      pos: door.centerPos.clone(),
      data: door
    });
    return door;
  };

  /* ------------------------------------------------------------
     交互物
  ------------------------------------------------------------ */
  LevelBuilder.prototype.addInteractable = function (opt) {
    if (isFirstRun()) {
      var keep = (opt.kind === 'elevator' || opt.kind === 'door');
      if (opt.kind === 'note' && String(opt.id || '').indexOf('note_first_run') === 0) keep = true;
      if (opt.kind === 'pickup' && opt.id === 'item_flashlight') keep = true;
      if (!keep) {
        // 返回一个哑对象，避免调用方（如 locker）对 null 取属性
        return { id: opt.id, kind: opt.kind, object: opt.object, prompt: '', radius: 0, enabled: false, data: opt.data || {}, pos: opt.pos };
      }
    }
    var it = {
      id: opt.id,
      kind: opt.kind,
      object: opt.object,
      prompt: opt.prompt || '查看',
      radius: opt.radius || 2.4,
      enabled: opt.enabled !== false,
      oneShot: !!opt.oneShot,
      hidden: !!opt.hidden,
      data: opt.data || {},
      pos: opt.pos ? opt.pos.clone() : new T.Vector3(),
      glint: opt.glint || null,
      lockerId: opt.lockerId || null,
      doorId: opt.doorId || null,
      onRemove: opt.onRemove || null
    };
    if (it.object) {
      if (!opt.pos) {
        it.object.updateWorldMatrix(true, false);
        it.pos.setFromMatrixPosition(it.object.matrixWorld);
      }
      it.object.traverse(function (o) { o.userData.interactId = it.id; });
      if (it.object.isMesh) {
        it.object.userData.interactId = it.id;
        this.interactMeshes.push(it.object);
      } else {
        var meshes = [];
        it.object.traverse(function (o) { if (o.isMesh) meshes.push(o); });
        for (var i = 0; i < meshes.length; i++) this.interactMeshes.push(meshes[i]);
      }
    }
    this.interactables.push(it);
    return it;
  };

  LevelBuilder.prototype.getInteractable = function (id) {
    for (var i = 0; i < this.interactables.length; i++) if (this.interactables[i].id === id) return this.interactables[i];
    return null;
  };

  // 射线拾取（带墙体遮挡判定）
  LevelBuilder.prototype.findInteraction = function (raycaster) {
    var hits = raycaster.intersectObjects(this.interactMeshes, true);
    for (var i = 0; i < hits.length; i++) {
      var hit = hits[i];
      var o = hit.object;
      var iid = null;
      while (o) {
        if (o.userData && o.userData.interactId) { iid = o.userData.interactId; break; }
        o = o.parent;
      }
      if (!iid) continue;
      var it = this.getInteractable(iid);
      if (!it || !it.enabled || it.hidden) continue;
      if (hit.distance > it.radius) continue;
      if (it.kind !== 'door') {
        var from = raycaster.ray.origin, to = it.pos;
        if (this.occluded(from, to)) continue;
      }
      return { item: it, distance: hit.distance, point: hit.point };
    }
    // 精确射线没命中时，用"锥形容错"找视野中心附近最近的交互物
    // （手电、纸条这类小物件不用像素级瞄准也能按 E）
    var cam = raycaster.ray.origin;
    var dir = raycaster.ray.direction;
    var best = null, bestScore = 1e9;
    for (var k = 0; k < this.interactables.length; k++) {
      var it2 = this.interactables[k];
      if (!it2.enabled || it2.hidden) continue;
      var vx = it2.pos.x - cam.x, vy = it2.pos.y - cam.y, vz = it2.pos.z - cam.z;
      var dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (dist > (it2.radius || 2.4) || dist < 0.01) continue;
      var dot = (vx * dir.x + vy * dir.y + vz * dir.z) / dist;
      var ang = Math.acos(dot < -1 ? -1 : (dot > 1 ? 1 : dot));
      var maxAng = it2.kind === 'door' ? 0.16 : (dist < 1.3 ? 0.40 : 0.26);
      if (ang > maxAng) continue;
      if (it2.kind !== 'door' && this.occluded(cam, it2.pos)) continue;
      var score = ang * 2.2 + dist * 0.06;
      if (it2.kind === 'pickup') score -= 0.06;
      if (score < bestScore) { bestScore = score; best = it2; }
    }
    if (best) return { item: best, distance: cam.distanceTo(best.pos), point: best.pos.clone() };
    return null;
  };

  // 两点之间是否被墙挡住（2D 线段-AABB 判定，只考虑阻挡视线的碰撞体）
  LevelBuilder.prototype._markerCanSee = function (camPos, it) {
    var tx = it.pos.x, tz = it.pos.z;
    var dx = tx - camPos.x, dz = tz - camPos.z;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    // 检测点向玩家方向浮出一点：贴在墙面上的便签/海报不会被所在的墙误判为遮挡
    var pull = Math.min(0.30, len * 0.5);
    var probe = { x: tx - dx / len * pull, z: tz - dz / len * pull };
    return !this.occluded(camPos, probe);
  };

  LevelBuilder.prototype.occluded = function (from, to) {
    var ax = from.x, az = from.z, bx = to.x, bz = to.z;
    var dx = bx - ax, dz = bz - az;
    for (var i = 0; i < this.colliders.length; i++) {
      var c = this.colliders[i];
      if (!c.active || !c.blocksSight) continue;
      var tmin = 0, tmax = 1;
      if (Math.abs(dx) < 1e-8) {
        if (ax < c.minX || ax > c.maxX) continue;
      } else {
        var t1 = (c.minX - ax) / dx, t2 = (c.maxX - ax) / dx;
        tmin = Math.max(tmin, Math.min(t1, t2));
        tmax = Math.min(tmax, Math.max(t1, t2));
        if (tmin > tmax) continue;
      }
      if (Math.abs(dz) < 1e-8) {
        if (az < c.minZ || az > c.maxZ) continue;
      } else {
        var t3 = (c.minZ - az) / dz, t4 = (c.maxZ - az) / dz;
        tmin = Math.max(tmin, Math.min(t3, t4));
        tmax = Math.min(tmax, Math.max(t3, t4));
        if (tmin > tmax) continue;
      }
      if (tmin < 1 && tmax > 0.001 && tmin <= tmax) return true;
    }
    return false;
  };

  LevelBuilder.prototype.panTo = function (pos) {
    // 简易声像：根据当前相机朝向（由 player 写入）估算左右
    var cam = this.cameraPos || { x: 0, z: 0 };
    var dx = pos.x - cam.x, dz = pos.z - cam.z;
    var yaw = this.cameraYaw || 0;
    var rx = Math.cos(yaw), rz = -Math.sin(yaw);
    var right = dx * rx + dz * rz;
    var dist = Math.max(0.6, Math.hypot(dx, dz));
    return clamp(right / dist, -1, 1) * 0.85;
  };

  /* ------------------------------------------------------------
     拾取物 / 纸条 / 录音带 / 海报
  ------------------------------------------------------------ */
  LevelBuilder.prototype._glint = function (x, y, z, color) {
    var mat = new T.SpriteMaterial({
      map: HT.dustSprite(), color: color || 0xa9d6c2, transparent: true,
      opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending
    });
    var sp = new T.Sprite(mat);
    sp.scale.set(0.42, 0.42, 0.42);
    sp.position.set(x, y, z);
    sp.userData.noMerge = true;
    this.group.add(sp);
    return sp;
  };

  // 小物件（保险丝、卡片、电池、手电、钥匙...）
  LevelBuilder.prototype.pickup = function (cfg) {
    if (isFirstRun() && cfg && cfg.id !== 'item_flashlight') return null;
    var g = new T.Group();
    var kind = cfg.kind || 'item';
    if (kind === 'fuse') {
      var fb = new T.Mesh(new T.CylinderGeometry(0.036, 0.036, 0.16, 16), M('ceramic'));
      fb.rotation.z = Math.PI / 2;
      g.add(fb);
      for (var fs = -1; fs <= 1; fs += 2) {
        var fcap = new T.Mesh(new T.CylinderGeometry(0.039, 0.039, 0.032, 16), M('stainless'));
        fcap.rotation.z = Math.PI / 2;
        fcap.position.x = fs * 0.086;
        g.add(fcap);
        var fring = new T.Mesh(new T.TorusGeometry(0.035, 0.0035, 6, 16), M('metal'));
        fring.rotation.y = Math.PI / 2;
        fring.position.x = fs * 0.066;
        g.add(fring);
      }
      var flabel = new T.Mesh(new T.PlaneGeometry(0.08, 0.05), M('paper', { color: 0xd8d2b8 }));
      flabel.position.set(0, 0.037, 0.0);
      flabel.rotation.x = -Math.PI / 2;
      g.add(flabel);
    } else if (kind === 'card') {
      var cbody = new T.Mesh(new T.BoxGeometry(0.14, 0.006, 0.09), M('plastic', { color: 0x24443c, roughness: 0.38 }));
      g.add(cbody);
      var clabel = new T.Mesh(new T.PlaneGeometry(0.085, 0.055), M('paper', { color: 0xe8e4d4 }));
      clabel.position.y = 0.0035;
      clabel.rotation.x = -Math.PI / 2;
      g.add(clabel);
      var cstripe = new T.Mesh(new T.BoxGeometry(0.14, 0.0062, 0.018), M('plasticDark'));
      cstripe.position.z = -0.028;
      g.add(cstripe);
      var cchip = new T.Mesh(new T.BoxGeometry(0.026, 0.008, 0.02), M('emissiveAmber', { emissiveIntensity: 0.45 }));
      cchip.position.set(-0.038, 0.004, 0.006);
      g.add(cchip);
    } else if (kind === 'battery') {
      var bwrap = new T.Mesh(new T.CylinderGeometry(0.0155, 0.0155, 0.05, 14), M('paper', { color: 0x2f3833 }));
      g.add(bwrap);
      var bband = new T.Mesh(new T.CylinderGeometry(0.0158, 0.0158, 0.016, 14), M('paper', { color: 0xd8bd4e }));
      g.add(bband);
      for (var bt = -1; bt <= 1; bt += 2) {
        var bterm = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 0.004, 12), M('stainless'));
        bterm.position.y = bt * 0.027;
        g.add(bterm);
      }
    } else if (kind === 'flashlight') {
      var fmat = M('metal', { color: 0x23272a, roughness: 0.52, metalness: 0.75 });
      var fbody = new T.Mesh(new T.CylinderGeometry(0.028, 0.031, 0.2, 16), fmat);
      fbody.rotation.z = Math.PI / 2;
      g.add(fbody);
      for (var gi = 0; gi < 3; gi++) {
        var grip = new T.Mesh(new T.CylinderGeometry(0.0325, 0.0325, 0.012, 16), M('rubber'));
        grip.rotation.z = Math.PI / 2;
        grip.position.x = -0.07 + gi * 0.035;
        g.add(grip);
      }
      var tail = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.022, 14), M('metalDark'));
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.11;
      g.add(tail);
      var fhead = new T.Mesh(new T.CylinderGeometry(0.041, 0.031, 0.062, 16), M('stainless'));
      fhead.rotation.z = Math.PI / 2;
      fhead.position.x = 0.118;
      g.add(fhead);
      var bezel = new T.Mesh(new T.TorusGeometry(0.039, 0.005, 8, 18), M('stainless'));
      bezel.rotation.y = Math.PI / 2;
      bezel.position.x = 0.15;
      g.add(bezel);
      var lens = new T.Mesh(new T.CircleGeometry(0.034, 18), M('emissiveWhite', { emissiveIntensity: 0.3 }));
      lens.rotation.y = Math.PI / 2;
      lens.position.x = 0.152;
      g.add(lens);
      var fbtn = new T.Mesh(new T.BoxGeometry(0.022, 0.008, 0.016), M('emissiveAmber', { emissiveIntensity: 0.35 }));
      fbtn.position.set(-0.02, 0.03, 0);
      g.add(fbtn);
    } else if (kind === 'crowbar') {
      var cbShaft = new T.Mesh(new T.BoxGeometry(0.52, 0.03, 0.03), M('rust', { color: 0x8d2f26, roughness: 0.62 }));
      g.add(cbShaft);
      var cbHook = new T.Mesh(new T.BoxGeometry(0.09, 0.03, 0.03), M('rust', { color: 0x8d2f26, roughness: 0.62 }));
      cbHook.position.set(0.28, 0.04, 0);
      cbHook.rotation.z = 0.85;
      g.add(cbHook);
      var cbTip = new T.Mesh(new T.BoxGeometry(0.07, 0.012, 0.026), M('metalDark'));
      cbTip.position.set(-0.28, 0.0, 0);
      g.add(cbTip);
      var cbGrip = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.16, 10), M('rubber'));
      cbGrip.rotation.z = Math.PI / 2;
      cbGrip.position.set(-0.12, 0, 0);
      g.add(cbGrip);
    } else if (kind === 'string') {
      var rs = new T.Mesh(new T.TorusGeometry(0.052, 0.009, 8, 18), M('rust', { color: 0x9c2f28, roughness: 0.78, metalness: 0.0 }));
      rs.rotation.x = Math.PI / 2;
      g.add(rs);
      var rsknot = new T.Mesh(new T.SphereGeometry(0.013, 8, 8), M('rust', { color: 0x9c2f28, roughness: 0.78 }));
      rsknot.position.set(0.05, 0.005, 0.02);
      g.add(rsknot);
    } else if (kind === 'key') {
      var kring = new T.Mesh(new T.TorusGeometry(0.017, 0.004, 6, 14), M('stainless'));
      kring.rotation.x = Math.PI / 2;
      kring.position.x = -0.045;
      g.add(kring);
      var kshaft = new T.Mesh(new T.BoxGeometry(0.075, 0.006, 0.011), M('stainless'));
      g.add(kshaft);
      var kteeth = new T.Mesh(new T.BoxGeometry(0.024, 0.008, 0.03), M('stainless'));
      kteeth.position.set(0.052, 0, 0.012);
      g.add(kteeth);
    } else {
      var defbox = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.1), M('paper'));
      g.add(defbox);
    }
    g.position.set(cfg.x, cfg.y, cfg.z);
    g.rotation.y = cfg.rotY || 0;
    if (cfg.scale) g.scale.set(cfg.scale, cfg.scale, cfg.scale);
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.noMerge = true; } });
    this.group.add(g);
    var glint = this._glint(cfg.x, cfg.y + 0.12, cfg.z, cfg.glintColor || 0x9fd8c0);
    if (cfg.glintScale && glint) glint.scale.set(cfg.glintScale, cfg.glintScale, cfg.glintScale);
    var it = this.addInteractable({
      id: cfg.id, kind: 'pickup', object: g, prompt: '拾取 ' + (cfg.name || '物品'), radius: cfg.radius || 2.2,
      data: { itemId: cfg.itemId || cfg.id, name: cfg.name || '物品', pickupKind: kind },
      glint: glint
    });
    it.meshGroup = g;
    return it;
  };

  // 纸条 / 文件：贴在墙上或放在桌面
  LevelBuilder.prototype.paper = function (cfg) {
    if (isFirstRun() && cfg && (cfg.kind === 'file' || cfg.kind === 'note') && String(cfg.id || '').indexOf('note_first_run') !== 0) return null;
    var w = cfg.w || 0.3, h = cfg.h || 0.4;
    var texKind = cfg.tex || (cfg.kind === 'file' ? 'patientcard' : 'note');
    var mat = HT.decalMat(texKind, { doubleSide: true });
    var geo = new T.PlaneGeometry(w, h);
    var mesh = new T.Mesh(geo, mat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    mesh.userData.noMerge = true;
    if (cfg.wall) {
      // wall: 'n' 面朝 +Z, 's' 面朝 -Z, 'w' 面朝 +X, 'e' 面朝 -X
      if (cfg.wall === 's') mesh.rotation.y = 0;
      else if (cfg.wall === 'n') mesh.rotation.y = Math.PI;
      else if (cfg.wall === 'e') mesh.rotation.y = Math.PI / 2;
      else if (cfg.wall === 'w') mesh.rotation.y = -Math.PI / 2;
      if (cfg.rotZ) mesh.rotation.z = cfg.rotZ;
    } else {
      mesh.rotation.x = -Math.PI / 2 + (cfg.tilt || 0);
      if (cfg.rotY) mesh.rotation.z = cfg.rotY;
    }
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    var glint = null;   // 便签统一用白色交互光圈提示
    var it = this.addInteractable({
      id: cfg.id, kind: cfg.kind === 'file' ? 'file' : 'note',
      object: mesh, prompt: cfg.kind === 'file' ? '查看病历' : '阅读', radius: 2.2,
      data: cfg.data || {}, glint: glint
    });
    it.meshGroup = mesh;
    return it;
  };

  // 录音带（桌上的小磁带）
  LevelBuilder.prototype.tape = function (cfg) {
    if (isFirstRun()) return null;
    var g = new T.Group();
    var shell = new T.Mesh(new T.BoxGeometry(0.14, 0.022, 0.09), M('plasticDark'));
    g.add(shell);
    var label = new T.Mesh(new T.BoxGeometry(0.1, 0.002, 0.055), M('paper'));
    label.position.y = 0.012;
    g.add(label);
    for (var s = -1; s <= 1; s += 2) {
      var reel = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.004, 12), M('metalLight'));
      reel.position.set(s * 0.03, 0.013, 0);
      g.add(reel);
    }
    g.position.set(cfg.x, cfg.y, cfg.z);
    g.rotation.y = cfg.rotY || 0;
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.noMerge = true; } });
    this.group.add(g);
    var glint = null;   // 磁带统一用白色交互光圈提示
    var it = this.addInteractable({
      id: cfg.id, kind: 'tape', object: g, prompt: '播放录音带', radius: 2.2,
      data: cfg.data || {}, glint: glint
    });
    it.meshGroup = g;
    return it;
  };

  // 海报 / 告示
  LevelBuilder.prototype.poster = function (cfg) {
    if (isFirstRun()) return null;
    var mat = cfg.read ? HT.decalMat(cfg.tex, { doubleSide: false }) : HT.decalMat(cfg.tex, {});
    var geo = new T.PlaneGeometry(cfg.w, cfg.h);
    var mesh = new T.Mesh(geo, mat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    if (cfg.wall === 's') mesh.rotation.y = 0;
    else if (cfg.wall === 'n') mesh.rotation.y = Math.PI;
    else if (cfg.wall === 'e') mesh.rotation.y = Math.PI / 2;
    else if (cfg.wall === 'w') mesh.rotation.y = -Math.PI / 2;
    if (cfg.rotZ) mesh.rotation.z = cfg.rotZ;
    mesh.receiveShadow = true;
    mesh.userData.noMerge = true;
    this.group.add(mesh);
    if (cfg.read) {
      this.addInteractable({ id: cfg.id, kind: 'note', object: mesh, prompt: '阅读', radius: 2.2, data: cfg.data || {} });
    }
    return mesh;
  };

  LevelBuilder.prototype.sign = function (cfg) {
    var mat;
    if (cfg.text) {
      var tex = HT.signTexture(cfg.text, cfg.signOpts || { bg: cfg.bg, fg: cfg.fg, sub: cfg.sub });
      mat = new T.MeshStandardMaterial({
        map: tex, roughness: 0.6, metalness: 0.0,
        emissive: new T.Color(cfg.emissive !== undefined ? cfg.emissive : 0x22331e),
        emissiveMap: tex,
        emissiveIntensity: cfg.emissiveIntensity !== undefined ? cfg.emissiveIntensity : 0.14
      });
    } else {
      mat = HT.signMat(cfg.tex, { emissiveIntensity: cfg.emissiveIntensity !== undefined ? cfg.emissiveIntensity : 0.16 });
    }
    var w = cfg.w || 0.6, h = cfg.h || 0.2;
    var geo = new T.PlaneGeometry(w, h);
    var mesh = new T.Mesh(geo, mat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    if (cfg.wall === 's') mesh.rotation.y = 0;
    else if (cfg.wall === 'n') mesh.rotation.y = Math.PI;
    else if (cfg.wall === 'e') mesh.rotation.y = Math.PI / 2;
    else if (cfg.wall === 'w') mesh.rotation.y = -Math.PI / 2;
    if (cfg.mount !== false) {
      var back = new T.Mesh(new T.BoxGeometry(w + 0.04, h + 0.04, 0.02), M('metalDark'));
      back.position.copy(mesh.position);
      back.rotation.copy(mesh.rotation);
      var dir = new T.Vector3(0, 0, -0.015).applyEuler(mesh.rotation);
      back.position.add(dir);
      back.userData.noMerge = true;
      this.group.add(back);
    }
    mesh.userData.noMerge = true;
    this.group.add(mesh);
    return mesh;
  };

  // 血迹/污渍/裂纹等透明贴花
  LevelBuilder.prototype.decal = function (cfg) {
    var mat = HT.decalMat(cfg.tex, { transparent: true, opacity: cfg.opacity !== undefined ? cfg.opacity : 0.85, alphaTest: 0.01, doubleSide: !!cfg.doubleSide });
    var geo = new T.PlaneGeometry(cfg.w, cfg.h);
    var mesh = new T.Mesh(geo, mat);
    this._decalN = (this._decalN || 0) + 1;
    var nudge = (this._decalN % 9) * 0.0006;
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    if (cfg.onFloor) {
      mesh.position.y = (cfg.y === undefined ? 0.012 : cfg.y) + nudge;
      mesh.rotation.x = -Math.PI / 2;
      if (cfg.rotZ) mesh.rotation.z = cfg.rotZ;
    } else if (cfg.onCeiling) {
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = (cfg.y === undefined ? 2.93 : cfg.y) - nudge;
      if (cfg.rotZ) mesh.rotation.z = cfg.rotZ;
    } else {
      // 墙面贴花沿法线方向再抬 0.4~4mm，防止与墙面或其它贴花共面闪烁
      var off = 0.004 + nudge;
      if (cfg.wall === 's') mesh.position.z += off;
      else if (cfg.wall === 'n') mesh.position.z -= off;
      else if (cfg.wall === 'e') mesh.position.x += off;
      else if (cfg.wall === 'w') mesh.position.x -= off;
      if (cfg.wall === 's') mesh.rotation.y = 0;
      else if (cfg.wall === 'n') mesh.rotation.y = Math.PI;
      else if (cfg.wall === 'e') mesh.rotation.y = Math.PI / 2;
      else if (cfg.wall === 'w') mesh.rotation.y = -Math.PI / 2;
      if (cfg.rotZ) mesh.rotation.z = cfg.rotZ;
    }
    mesh.receiveShadow = true;
    mesh.userData.noMerge = true;
    this.group.add(mesh);
    return mesh;
  };

  LevelBuilder.prototype.mirror = function (cfg) {
    var w = cfg.w || 0.9, h = cfg.h || 1.6;
    var frame = new T.Mesh(new T.BoxGeometry(w + 0.08, h + 0.08, 0.05), M('metalDark'));
    frame.position.set(cfg.x, cfg.y, cfg.z);
    if (cfg.wall === 's') frame.rotation.y = 0;
    else if (cfg.wall === 'n') frame.rotation.y = Math.PI;
    else if (cfg.wall === 'e') frame.rotation.y = Math.PI / 2;
    else if (cfg.wall === 'w') frame.rotation.y = -Math.PI / 2;
    frame.userData.noMerge = true;
    this.group.add(frame);
    var glass = new T.Mesh(new T.PlaneGeometry(w, h), M('mirror'));
    glass.position.copy(frame.position);
    glass.rotation.copy(frame.rotation);
    var dir = new T.Vector3(0, 0, 0.03).applyEuler(glass.rotation);
    glass.position.add(dir);
    glass.userData.noMerge = true;
    this.group.add(glass);
    return glass;
  };

  /* ------------------------------------------------------------
     灯光
  ------------------------------------------------------------ */
  // type: 'ceiling' | 'emergency' | 'desk'
  LevelBuilder.prototype.fixture = function (cfg) {
    var type = cfg.type || 'ceiling';
    var circuit = cfg.circuit || 'main';
    var color = cfg.color !== undefined ? cfg.color : (type === 'emergency' ? 0xff2a1a : 0xd8e8dd);
    var intensity = cfg.intensity !== undefined ? cfg.intensity : (type === 'emergency' ? 0.6 : 1.0);
    var x = cfg.x, z = cfg.z, y = cfg.y !== undefined ? cfg.y : 2.95;
    var tubeMat, tubeMesh = null;

    if (type === 'ceiling') {
      var housing = new T.Mesh(new T.BoxGeometry(1.22, 0.09, 0.3), cfg.housingMat || M('metalDark'));
      housing.position.set(x, y - 0.045, z);
      housing.rotation.y = cfg.rotY || 0;
      this.mergeRoot.add(housing);
      tubeMat = M('emissiveWhite').clone();
      tubeMat.color.setHex(0xe4eee6);
      tubeMat.emissive = new T.Color(color);
      tubeMat.emissiveIntensity = 0;
      tubeMesh = new T.Mesh(new T.BoxGeometry(1.14, 0.03, 0.24), tubeMat);
      tubeMesh.position.set(x, y - 0.095, z);
      tubeMesh.rotation.y = cfg.rotY || 0;
      tubeMesh.userData.noMerge = true;
      tubeMesh.castShadow = false;
      tubeMesh.receiveShadow = false;
      this.group.add(tubeMesh);
      // 墙上的开关面板（装饰）
      if (cfg.switchPanel) {
        var panel = new T.Mesh(new T.BoxGeometry(0.12, 0.18, 0.02), M('plastic'));
        panel.position.set(x + 0.5, 1.25, z + (cfg.panelZ || 0));
        this.mergeRoot.add(panel);
      }
    } else if (type === 'emergency') {
      var base = new T.Mesh(new T.BoxGeometry(0.22, 0.16, 0.08), M('metalDark'));
      base.position.set(x, y, z);
      if (cfg.wall === 's') base.rotation.y = 0;
      else if (cfg.wall === 'n') base.rotation.y = Math.PI;
      else if (cfg.wall === 'e') base.rotation.y = Math.PI / 2;
      else if (cfg.wall === 'w') base.rotation.y = -Math.PI / 2;
      this.mergeRoot.add(base);
      tubeMat = M('emissiveRed').clone();
      tubeMat.emissiveIntensity = 1.5;
      var lens = new T.Mesh(new T.SphereGeometry(0.055, 10, 8), tubeMat);
      lens.position.set(x, y, z);
      lens.userData.noMerge = true;
      var dir = new T.Vector3(0, 0, 0.055).applyEuler(base.rotation);
      lens.position.add(dir);
      this.group.add(lens);
      tubeMesh = lens;
    } else {
      if (!cfg.noMesh) {
        // 桌面灯 / 工作灯：底座 + 灯杆 + 灯罩 + 发光灯芯（不再是悬空光球）
        var lamp = new T.Group();
        var baseMat = M('metalDark');
        var lampBase = new T.Mesh(new T.CylinderGeometry(0.085, 0.095, 0.022, 14), baseMat);
        lampBase.position.set(0, -0.24, 0);
        lamp.add(lampBase);
        var stem = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.2, 8), M('metalLight'));
        stem.position.set(0, -0.13, 0);
        lamp.add(stem);
        var shade = new T.Mesh(new T.CylinderGeometry(0.055, 0.115, 0.105, 16, 1, true), M('metalDark', { side: T.DoubleSide }));
        shade.position.set(0, 0.02, 0);
        lamp.add(shade);
        tubeMat = M('emissiveAmber').clone();
        tubeMat.emissiveIntensity = 1.0;
        tubeMesh = new T.Mesh(new T.SphereGeometry(0.042, 10, 8), tubeMat);
        tubeMesh.position.set(0, -0.012, 0);
        lamp.add(tubeMesh);
        lamp.position.set(x, y, z);
        lamp.userData.noMerge = true;
        tubeMesh.userData.noMerge = true;
        lamp.traverse(function (o) { if (o.isMesh) o.userData.noMerge = true; });
        this.group.add(lamp);
      }
    }

    var fx = {
      type: type, circuit: circuit, pos: v3(x, y, z), color: new T.Color(color),
      intensity: intensity, dist: cfg.dist || (type === 'ceiling' ? 7.5 : 5.0),
      on: !!cfg.on, tubeMat: tubeMat, baseEmissive: type === 'ceiling' ? (cfg.emissive !== undefined ? cfg.emissive : 1.35) : 1.0,
      tubeMesh: tubeMesh, flicker: cfg.flicker === undefined ? 0 : cfg.flicker, factor: cfg.on ? 1 : 0,
      phase: Math.random() * 100, noPool: !!cfg.noPool
    };
    if (tubeMat) {
      if (!fx.on) { tubeMat.emissiveIntensity = 0; }
      else tubeMat.emissiveIntensity = fx.baseEmissive;
    }
    this.fixtures.push(fx);
    return fx;
  };

  LevelBuilder.prototype.setCircuit = function (circuit, on, opts) {
    opts = opts || {};
    for (var i = 0; i < this.fixtures.length; i++) {
      var f = this.fixtures[i];
      if (circuit !== 'all' && f.circuit !== circuit) continue;
      if (f.type === 'emergency' && !opts.includeEmergency && !on) continue;
      f.on = on;
      f.factor = on ? 1 : 0;
      if (f.tubeMat) f.tubeMat.emissiveIntensity = on ? f.baseEmissive * (opts.scale || 1) : 0;
    }
  };

  LevelBuilder.prototype.flickerCircuit = function (circuit, duration, opts) {
    opts = opts || {};
    this._flickerEvents = this._flickerEvents || [];
    this._flickerEvents.push({ circuit: circuit, t: 0, duration: duration, opts: opts });
  };

  /* ------------------------------------------------------------
     灯光池 + 更新
  ------------------------------------------------------------ */
  LevelBuilder.prototype._setupLights = function () {
    var scene = this.scene;
    var POOL = 6;
    for (var i = 0; i < POOL; i++) {
      var l = new T.PointLight(0xffffff, 0, 9, 2);
      l.castShadow = false;
      scene.add(l);
      this.lightsPool.push({ light: l, target: 0 });
    }
  };

  LevelBuilder.prototype._updateLights = function (dt, camPos) {
    var self = this;
    // 闪烁事件
    if (this._flickerEvents && this._flickerEvents.length) {
      for (var e = this._flickerEvents.length - 1; e >= 0; e--) {
        var ev = this._flickerEvents[e];
        ev.t += dt;
        if (ev.t > ev.duration) { this._flickerEvents.splice(e, 1); continue; }
        for (var i = 0; i < this.fixtures.length; i++) {
          var f = this.fixtures[i];
          if (ev.circuit !== 'all' && f.circuit !== ev.circuit) continue;
          if (!f.on) continue;
          var r = Math.random();
          var th = ev.opts.threshold !== undefined ? ev.opts.threshold : 0.35;
          if (r < th) f.factor = Math.random() < 0.5 ? 0 : Math.random() * 0.6;
          else f.factor = 1;
          if (f.tubeMat) f.tubeMat.emissiveIntensity = f.baseEmissive * f.factor;
        }
      }
    }
    // 常驻轻微不稳定
    for (var k = 0; k < this.fixtures.length; k++) {
      var fi = this.fixtures[k];
      if (!fi.on) { fi.factor = 0; continue; }
      if (fi.flicker > 0 && !(this._flickerEvents && this._flickerEvents.length)) {
        var t = this.time * 0.9 + fi.phase;
        var n = Math.sin(t * 3.1) * Math.sin(t * 1.7 + 1.3) * 0.5 + 0.5;
        var drop = (Math.sin(t * 7.3) > 0.985) ? 0.15 : 1;
        fi.factor = lerp(1 - fi.flicker * 0.5, 1, n) * drop;
        if (fi.tubeMat) fi.tubeMat.emissiveIntensity = fi.baseEmissive * clamp(fi.factor, 0, 1.2);
      } else if (fi.tubeMat && !(this._flickerEvents && this._flickerEvents.length)) {
        fi.tubeMat.emissiveIntensity = fi.baseEmissive * fi.factor;
      }
    }
    // 点光源池：把最近的光源分配给固定数量的灯，避免光源数量变化导致着色器重编译
    var cand = [];
    for (var j = 0; j < this.fixtures.length; j++) {
      var fx = this.fixtures[j];
      if (!fx.on || fx.noPool) continue;
      var d2 = (fx.pos.x - camPos.x) * (fx.pos.x - camPos.x) + (fx.pos.z - camPos.z) * (fx.pos.z - camPos.z);
      if (d2 > 26 * 26) continue;
      cand.push({ f: fx, d2: d2 });
    }
    cand.sort(function (a, b) { return a.d2 - b.d2; });
    for (var p = 0; p < this.lightsPool.length; p++) {
      var slot = this.lightsPool[p];
      var c = cand[p];
      if (c) {
        var l = slot.light;
        l.position.set(c.f.pos.x, c.f.pos.y - 0.12, c.f.pos.z);
        l.color.copy(c.f.color);
        var want = c.f.intensity * clamp(c.f.factor, 0, 1.3) * (c.f.type === 'ceiling' ? 1.0 : 0.9);
        l.distance = c.f.dist;
        slot.target = want;
      } else {
        slot.target = 0;
      }
      slot.light.intensity = lerp(slot.light.intensity, slot.target, clamp(dt * 8, 0, 1));
    }
  };

  /* ------------------------------------------------------------
     门窗 / 柜子 / 导航
  ------------------------------------------------------------ */
  LevelBuilder.prototype.locker = function (cfg) {
    var props = HP.locker({ open: false });
    props.position.set(cfg.x, 0, cfg.z);
    props.rotation.y = cfg.rotY || 0;
    var dims = props.userData.dims || { w: 0.5, h: 1.85, d: 0.45 };
    var leafPivot = props.userData.leafPivot;
    var rot = cfg.rotY || 0;
    // 柜体静态合并，柜门保留单独（开合动画）
    if (leafPivot) leafPivot.userData.noMerge = true;
    this.mergeRoot.add(props);
    var hw = Math.abs(Math.cos(rot)) > 0.5 ? dims.w : dims.d;
    var hd = Math.abs(Math.cos(rot)) > 0.5 ? dims.d : dims.w;
    this.colliders.push({ minX: cfg.x - hw / 2, maxX: cfg.x + hw / 2, minZ: cfg.z - hd / 2, maxZ: cfg.z + hd / 2, blocksSight: true, active: true, tag: 'prop' });
    // 躲藏点：柜内（柜体中心略靠后），朝外看
    var hidePos = v3(cfg.x - Math.sin(rot) * 0.16, 0, cfg.z - Math.cos(rot) * 0.16);
    var lookYaw = rot + Math.PI;
    var proxy = this.proxy(cfg.x, 0.95, cfg.z, dims.w + 0.16, dims.h, dims.d + 0.16);
    proxy.rotation.y = rot;
    var it = this.addInteractable({
      id: cfg.id, kind: 'hide', object: proxy, prompt: '躲进储物柜', radius: 2.4,
      data: { hidePos: hidePos, hideYaw: lookYaw, dims: dims },
      pos: v3(cfg.x, 1.1, cfg.z)
    });
    it.locker = { group: props, leafPivot: leafPivot, open: false, hidePos: hidePos, hideYaw: lookYaw };
    this.lockers[cfg.id] = it;
    return it;
  };

  // 导航节点
  LevelBuilder.prototype.nav = function (x, z) {
    this.navNodes.push({ x: x, z: z, idx: this.navNodes.length, edges: [] });
  };

  LevelBuilder.prototype.buildNav = function (maxDist, exclude) {
    var nodes = this.navNodes;
    var self = this;
    function free(a, b) {
      // 导航连线不允许穿墙
      var steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.35);
      for (var s = 1; s < steps; s++) {
        var t = s / steps;
        var x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        for (var i = 0; i < self.colliders.length; i++) {
          var c = self.colliders[i];
          if (exclude && exclude.indexOf(c.tag) >= 0) continue;
          if (c.tag === 'door' || c.tag === 'prop') continue;
          if (!c.active) continue;
          if (x > c.minX - 0.16 && x < c.maxX + 0.16 && z > c.minZ - 0.16 && z < c.maxZ + 0.16) return false;
        }
      }
      return true;
    }
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (d > maxDist) continue;
        if (free(nodes[i], nodes[j])) {
          nodes[i].edges.push(j);
          nodes[j].edges.push(i);
        }
      }
    }
  };

  LevelBuilder.prototype.pathFind = function (from, to) {
    var nodes = this.navNodes;
    if (!nodes.length) return null;
    function nearest(p) {
      var best = -1, bd = 1e9;
      for (var i = 0; i < nodes.length; i++) {
        var d = Math.hypot(nodes[i].x - p.x, nodes[i].z - p.z);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    var a = nearest(from), b = nearest(to);
    if (a < 0 || b < 0) return null;
    var dist = new Array(nodes.length).fill(1e9);
    var prev = new Array(nodes.length).fill(-1);
    var visited = new Array(nodes.length).fill(false);
    dist[a] = 0;
    for (var it = 0; it < nodes.length; it++) {
      var u = -1, best = 1e9;
      for (var i = 0; i < nodes.length; i++) if (!visited[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      visited[u] = true;
      if (u === b) break;
      for (var e = 0; e < nodes[u].edges.length; e++) {
        var v = nodes[u].edges[e];
        var w = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z);
        if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
      }
    }
    if (dist[b] >= 1e9) return null;
    var path = [];
    var cur = b;
    while (cur >= 0) { path.unshift({ x: nodes[cur].x, z: nodes[cur].z }); cur = prev[cur]; }
    return path;
  };

  /* ------------------------------------------------------------
     触发区
  ------------------------------------------------------------ */
  LevelBuilder.prototype.trigger = function (cfg) {
    var tr = {
      id: cfg.id, minX: cfg.x1, maxX: cfg.x2, minZ: cfg.z1, maxZ: cfg.z2,
      once: cfg.once !== false, fired: false, enabled: true,
      data: cfg.data || {}
    };
    this.triggers.push(tr);
    return tr;
  };

  LevelBuilder.prototype.checkTriggers = function (pos) {
    var out = [];
    for (var i = 0; i < this.triggers.length; i++) {
      var t = this.triggers[i];
      if (!t.enabled || t.fired) continue;
      if (pos.x >= t.minX && pos.x <= t.maxX && pos.z >= t.minZ && pos.z <= t.maxZ) {
        t.fired = true;
        out.push(t);
      }
    }
    return out;
  };

  /* ------------------------------------------------------------
     杂项
  ------------------------------------------------------------ */
  LevelBuilder.prototype.dust = function (cfg) {
    cfg = cfg || {};
    var count = cfg.count || 420;
    var cx = cfg.x || 0, cz = cfg.z || 0;
    var pos = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      pos[i * 3] = cx + (Math.random() - 0.5) * (cfg.w || 18);
      pos[i * 3 + 1] = Math.random() * 2.8;
      pos[i * 3 + 2] = cz + (Math.random() - 0.5) * (cfg.d || 14);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      size: 0.022, color: 0x9fb4ab, transparent: true, opacity: 0.32,
      depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true,
      map: HT.dustSprite()
    });
    var points = new T.Points(geo, mat);
    points.frustumCulled = false;
    points.userData.noMerge = true;
    this.group.add(points);
    this.dustPoints = points;
    return points;
  };

  /* ---------------- 可交互物白点提示 ---------------- */
  LevelBuilder.prototype._createMarkers = function () {
    var max = Math.min(160, this.interactables.length + 10);
    var geo = new T.BufferGeometry();
    var pos = new Float32Array(max * 3);
    var alpha = new Float32Array(max);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aAlpha', new T.BufferAttribute(alpha, 1));
    geo.setDrawRange(0, 0);
    var mat = new T.ShaderMaterial({
      uniforms: { uProj: { value: 320.0 } },
      vertexShader: [
        'attribute float aAlpha;',
        'varying float vAlpha;',
        'uniform float uProj;',
        'void main() {',
        '  vAlpha = aAlpha;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = max(7.0, uProj * 0.052 / max(0.25, -mv.z));',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying float vAlpha;',
        'void main() {',
        '  vec2 d = gl_PointCoord - vec2(0.5);',
        '  float r = length(d);',
        // 清晰的白光圈：只保留一圈硬边，不做柔光晕染
        '  float outer = 1.0 - smoothstep(0.33, 0.37, r);',
        '  float inner = 1.0 - smoothstep(0.22, 0.26, r);',
        '  float ring = outer * (1.0 - inner);',
        '  float core = (1.0 - smoothstep(0.075, 0.11, r)) * 0.55;',
        '  float a = clamp(ring + core, 0.0, 1.0);',
        '  gl_FragColor = vec4(1.0, 1.0, 1.0, a * vAlpha);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, depthTest: false,
      blending: T.AdditiveBlending
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.userData.noMerge = true;
    pts.renderOrder = 6;
    this.group.add(pts);
    this.markerPoints = pts;
    this.markerGeo = geo;
    this.markerMax = max;
    this._markerFades = [];
    for (var i = 0; i < this.interactables.length; i++) this._markerFades.push(0);
    this._markerTmp = new T.Vector3();
  };

  LevelBuilder.prototype._updateMarkers = function (dt, camPos) {
    if (!this.markerPoints || !this.markerGeo) return;
    var arr = this.markerGeo.attributes.position.array;
    var alphas = this.markerGeo.attributes.aAlpha.array;
    var max = this.markerMax;
    var list = this.interactables;
    var tmp = this._markerTmp;
    var fadeSpeed = Math.min(1, (dt || 0.016) * 2.4);
    var count = 0;
    // 视线检测节流，避免每帧对全部交互物做射线
    this._sightTimer = (this._sightTimer || 0) - (dt || 0.016);
    if (this._sightTimer <= 0) {
      this._sightTimer = 0.14;
      for (var si = 0; si < list.length; si++) {
        var sit = list[si];
        if (!sit.enabled || sit.hidden) { sit._markerVisible = false; continue; }
        var sdx = sit.pos.x - camPos.x, sdz = sit.pos.z - camPos.z;
        if (sdx * sdx + sdz * sdz > 30.25) { sit._markerVisible = false; continue; }
        // 门和电梯本身永远显示；其它可交互物必须没有被墙/门挡住
        sit._markerVisible = this._markerCanSee(camPos, sit);
      }
    }
    for (var i = 0; i < list.length && count < max; i++) {
      var it = list[i];
      var f = this._markerFades[i] || 0;
      var target = 0;
      var mx = it.pos.x, my = it.pos.y, mz = it.pos.z;
      if (it.enabled && !it.hidden) {
        // 门的提示点跟随门板（开门/关门时一起移动，不会悬在门洞空中）
        if (it.kind === 'door' && it.doorId && this.doors[it.doorId]) {
          var dd = this.doors[it.doorId];
          if (dd.leaf) {
            dd.leaf.getWorldPosition(tmp);
            mx = tmp.x; my = tmp.y; mz = tmp.z;
            // 光点朝玩家方向浮出门板一点，避免被门板挡住
            var tox = camPos.x - mx, toz = camPos.z - mz;
            var tl = Math.sqrt(tox * tox + toz * toz) || 1;
            mx += tox / tl * 0.09;
            mz += toz / tl * 0.09;
          }
        }
        var dx = mx - camPos.x, dz = mz - camPos.z;
        if (dx * dx + dz * dz < 30.25 && it._markerVisible !== false) {
          target = 1;
        }
      }
      f += (target - f) * fadeSpeed;
      if (f < 0.02) f = 0;
      this._markerFades[i] = f;
      if (f > 0) {
        // 所有交互点都朝玩家方向浮出一点，避免嵌进墙面/柜面被深度测试挡住
        var ox = camPos.x - mx, oz = camPos.z - mz;
        var ol = Math.sqrt(ox * ox + oz * oz) || 1;
        arr[count * 3] = mx + ox / ol * 0.075;
        arr[count * 3 + 1] = my + 0.09;
        arr[count * 3 + 2] = mz + oz / ol * 0.075;
        alphas[count] = f * 0.68;
        count++;
      }
    }
    this.markerGeo.setDrawRange(0, count);
    this.markerGeo.attributes.position.needsUpdate = true;
    this.markerGeo.attributes.aAlpha.needsUpdate = true;
    var h = (window.HGame && window.HGame.renderer) ? window.HGame.renderer.domElement.height : 720;
    var cam = (window.HGame && window.HGame.camera) ? window.HGame.camera : null;
    var fov = (cam && cam.fov) ? cam.fov : 75;
    this.markerPoints.material.uniforms.uProj.value = h / (2 * Math.tan(fov * Math.PI / 360));
  };

  LevelBuilder.prototype._updateDust = function (dt, camPos) {
    if (!this.dustPoints) return;
    var g = this.dustPoints.geometry;
    var arr = g.attributes.position.array;
    var n = arr.length / 3;
    var t = this.time;
    for (var i = 0; i < n; i++) {
      var ix = i * 3;
      arr[ix] += Math.sin(t * 0.4 + i) * dt * 0.04;
      arr[ix + 1] += Math.sin(t * 0.31 + i * 1.7) * dt * 0.03 + dt * 0.006;
      arr[ix + 2] += Math.cos(t * 0.27 + i * 0.7) * dt * 0.04;
      if (arr[ix + 1] > 3.0) arr[ix + 1] = 0.05;
      // 跟随玩家（相对包裹）
      if (arr[ix] - camPos.x > 9) arr[ix] -= 18;
      if (arr[ix] - camPos.x < -9) arr[ix] += 18;
      if (arr[ix + 2] - camPos.z > 7) arr[ix + 2] -= 14;
      if (arr[ix + 2] - camPos.z < -7) arr[ix + 2] += 14;
    }
    g.attributes.position.needsUpdate = true;
  };

  LevelBuilder.prototype.updateDoors = function (dt) {
    for (var i = 0; i < this.doorList.length; i++) {
      var d = this.doorList[i];
      var targetRot = d.baseRot + (d.open ? d.swing * d.openAngle : 0);
      var cur = d.pivot.rotation.y;
      var next = lerp(cur, targetRot, clamp(dt * 6.5, 0, 1));
      if (Math.abs(next - targetRot) < 0.004) next = targetRot;
      d.pivot.rotation.y = next;
    }
  };

  LevelBuilder.prototype.glowInteractables = function (dt) {
    var t = this.time;
    for (var i = 0; i < this.interactables.length; i++) {
      var it = this.interactables[i];
      if (!it.glint) continue;
      if (!it.enabled || it.hidden) { it.glint.visible = false; continue; }
      it.glint.visible = true;
      it.glint.material.opacity = 0.28 + Math.sin(t * 1.7 + i) * 0.12;
      it.glint.position.y = it.pos.y + 0.12 + Math.sin(t * 0.9 + i) * 0.015;
    }
  };

  LevelBuilder.prototype._makeLevelObject = function () {
    var self = this;
    var level = {
      id: this.id,
      scene: this.scene,
      group: this.group,
      colliders: this.colliders,
      doors: this.doors,
      doorList: this.doorList,
      interactables: this.interactables,
      interactMeshes: this.interactMeshes,
      triggers: this.triggers,
      fixtures: this.fixtures,
      lightsPool: this.lightsPool,
      lockers: this.lockers,
      navNodes: this.navNodes,
      story: this.story,
      playerSpawn: this.playerSpawn,
      ambient: this.ambient,
      time: 0,

      getInteractable: function (id) { return self.getInteractable(id); },
      findInteraction: function (raycaster) { return self.findInteraction(raycaster); },
      occluded: function (a, b) { return self.occluded(a, b); },
      pathFind: function (a, b) { return self.pathFind(a, b); },
      setDoor: function (id, open, opts) {
        var d = self.doors[id];
        if (!d) return false;
        return d.setOpen(open, opts || {});
      },
      toggleDoor: function (id) { var d = self.doors[id]; return d ? d.toggle() : false; },
      unlockDoor: function (id) { var d = self.doors[id]; if (d) d.unlock(); },
      lockDoor: function (id, msg) { var d = self.doors[id]; if (d) d.lock(msg); },
      setCircuit: function (c, on, o) { self.setCircuit(c, on, o); },
      flicker: function (c, dur, o) { self.flickerCircuit(c, dur, o); },
      setPanSource: function (pos, yaw) { self.cameraPos = pos; self.cameraYaw = yaw; },
      checkTriggers: function (pos) { return self.checkTriggers(pos); },
      addInteractable: function (o) { return self.addInteractable(o); },
      removeInteractable: function (id) {
        var it = self.getInteractable(id);
        if (!it) return;
        it.enabled = false;
        it.hidden = true;
        if (it.object && it.object.parent) it.object.parent.remove(it.object);
        if (it.glint && it.glint.parent) it.glint.parent.remove(it.glint);
      },
      update: function (dt, camPos) {
        self.time += dt;
        level.time = self.time;
        self.updateDoors(dt);
        self._updateLights(dt, camPos);
        self._updateDust(dt, camPos);
        self.glowInteractables(dt);
        self._updateMarkers(dt, camPos);
      },
      dispose: function () {
        self.scene.remove(self.group);
        if (self.ambientLight) self.scene.remove(self.ambientLight);
        if (self.hemiLight) self.scene.remove(self.hemiLight);
        for (var i = 0; i < self.lightsPool.length; i++) self.scene.remove(self.lightsPool[i].light);
        self.group.traverse(function (o) {
          if (o.isMesh && o.geometry) { try { o.geometry.dispose(); } catch (e) {} }
        });
      }
    };
    this.level = level;
    return level;
  };

  /* ------------------------------------------------------------
     出口：构建
  ------------------------------------------------------------ */
  HW.build = function (levelId, scene) {
    var builder = new LevelBuilder(levelId, scene);
    var def = HW.LEVELS[levelId];
    if (!def) throw new Error('未知关卡: ' + levelId);
    def(builder);
    builder._setupLights();
    builder.buildNav(6.5);
    bakeStatic(builder);
    builder._createMarkers();
    var level = builder._makeLevelObject();
    // 初始灯光状态
    return level;
  };

  HW.LevelBuilder = LevelBuilder;
  HW.M = M;
  HW.v3 = v3;
  HW.util = { clamp: clamp, lerp: lerp, disposeGeo: disposeGeo };
  HW.LEVELS = {};
})();
