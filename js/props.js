/* =============================================================================
 * 《静默病栋》(Silent Ward) 程序化医院道具库  props.js  v1.0.0
 * -----------------------------------------------------------------------------
 * 目标：仅用 Three.js 基础几何体 + 程序化 Canvas 贴图，拼装写实比例的医院道具。
 * 环境：file:// 下运行的经典 script；需先加载 lib/three.min.js（全局 THREE, r147）。
 *       不使用任何 import/export、外部模型、贴图或网络请求。
 *
 * 全局接口：window.HP
 *   HP.bed(opts) ...                 每个工厂返回 THREE.Group
 *   HP.mat(name, opts)               取材质（优先 HT.mat，回退内置材质表）
 *   HP.clearCache()                   释放本库缓存（重建场景前调用）
 *
 * 统一约定
 *  1) 原点：地面 / 桌面 / 吊顶道具 —— 包围盒“底部中心”，y = 0；
 *     壁挂道具 —— 背面贴墙 z = 0、x 居中、y = 0 为最低点，正面朝 +Z。
 *  2) 朝向：+Z 为正面（病床床头在 -Z、床尾在 +Z；柜门朝 +Z）。
 *  3) group.userData.dims = {w,h,d} 为实测包围盒尺寸（米，用于自动碰撞）；
 *     group.userData.mount = 'floor' | 'surface' | 'wall' | 'ceiling'。
 *  4) 大件 castShadow/receiveShadow，小件只 receiveShadow；透明材质不投影。
 *  5) 几何、材质、Canvas 贴图全部按 key 缓存；同类道具共享资源，降低显存与状态切换。
 *  6) 不创建任何灯光；发光只通过材质的 emissive / emissiveMap 表达。
 *
 * 典型关卡用法（放在关卡脚本里）：
 *   var bed = HP.bed({ occupied: true, disheveled: true, side: 'right' });
 *   bed.position.set(-3.2, 0, -1.5); bed.rotation.y = Math.PI / 2;
 *   scene.add(bed);
 *   var locker = HP.locker({ open: true });
 *   locker.position.set(2.2, 0, -4.9);
 *   locker.userData.leafPivot.rotation.y = -1.9;   // 开/关动画用
 *   var light = HP.ceilingLight();
 *   light.position.y = 2.7 - light.userData.dims.h; // 贴天花板
 *
 * 工厂一览（38 个必需 + 1 个补充，参数均有默认值）
 *   病区家具：bed / gurney / wheelchair / ivStand / locker / cabinet / nurseDesk / desk /
 *             chair / stool / monitorStand / sink / morgueUnit / operatingTable / whiteRoomBed /
 *             nightstand（补充：0.45 x 0.45 x 0.65 床头柜）
 *   灯光与建筑：ceilingLight / wallLight / ceilingVent / curtainRail / curtain / pipes /
 *             elevatorDoor / doorFrame / sign / pictureFrame / mirror
 *   陈设与杂物：trashBin / medicalCart / fireExtinguisher / clock / phone / plant /
 *             paperStack / fileBox / tapeRecorder / keypad / bodyBag / labCoat
 *
 * 尺寸备注：病床总高约 0.65 m（低床，老东翼精神科病床），床面高约 0.45 m；
 *          壁挂件 y 均为“从最低点起算”，摆放时按设计高度定位即可。
 * ============================================================================= */
(function (root) {
  'use strict';

  var THREE = root.THREE;
  if (!THREE) {
    if (root.console && root.console.error) {
      root.console.error('[HP] props.js 需要先加载 lib/three.min.js');
    }
    return;
  }

  var HP = root.HP = root.HP || {};
  HP.VERSION = '1.0.0';

  var PI = Math.PI;
  var DEG = PI / 180;
  var UP = new THREE.Vector3(0, 1, 0);

  /* ===========================================================================
   * 0. 小工具
   * ======================================================================== */
  function r3(n) { return Math.round(n * 1000) / 1000; }
  function r4(n) { return Math.round(n * 10000) / 10000; }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function bool(v, d) { return v === undefined ? d : !!v; }
  function pick(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }

  // 确定性伪随机：同一 seed 每次结果一致，“凌乱”细节不会每帧/每个实例跳变。
  function hash(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function jitter(seed) { return hash(seed) * 2 - 1; }

  var warned = {};
  function warnOnce(key, msg) {
    if (warned[key]) return;
    warned[key] = true;
    if (root.console && root.console.warn) root.console.warn('[HP] ' + msg);
  }

  /* ===========================================================================
   * 1. 几何缓存
   *    同一个尺寸只创建一次几何体：几十张病床共用同一批 geometry。
   * ======================================================================== */
  var GEO_CACHE = new Map();

  function cachedGeo(key, build) {
    var g = GEO_CACHE.get(key);
    if (!g) {
      g = build();
      GEO_CACHE.set(key, g);
    }
    return g;
  }

  // 几何尺寸不允许出现 0 / 负数 / NaN（避免 NaN 顶点污染包围盒）
  function size(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0.001;
    n = Math.abs(n);
    return n < 0.0005 ? 0.0005 : n;
  }

  function boxGeo(w, h, d) {
    w = size(w); h = size(h); d = size(d);
    return cachedGeo('box|' + r4(w) + '|' + r4(h) + '|' + r4(d), function () {
      return new THREE.BoxGeometry(w, h, d);
    });
  }

  function cylGeo(rTop, rBot, h, seg, open) {
    rTop = Math.max(0.0002, size(rTop));
    rBot = Math.max(0.0002, size(rBot));
    h = size(h);
    seg = Math.max(4, Math.round(seg || 10));
    var key = 'cyl|' + r4(rTop) + '|' + r4(rBot) + '|' + r4(h) + '|' + seg + '|' + (open ? 1 : 0);
    return cachedGeo(key, function () {
      return new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!open);
    });
  }

  function sphereGeo(r, seg) {
    r = size(r);
    seg = Math.max(6, Math.round(seg || 12));
    var hs = Math.max(4, Math.round(seg / 2));
    return cachedGeo('sph|' + r4(r) + '|' + seg, function () {
      return new THREE.SphereGeometry(r, seg, hs);
    });
  }

  function capsuleGeo(r, len, capSeg, radSeg) {
    r = size(r);
    len = Math.max(0.0005, Math.abs(Number(len) || 0.0005));
    capSeg = Math.max(2, Math.round(capSeg || 3));
    radSeg = Math.max(6, Math.round(radSeg || 10));
    var key = 'cap|' + r4(r) + '|' + r4(len) + '|' + capSeg + '|' + radSeg;
    return cachedGeo(key, function () {
      if (typeof THREE.CapsuleGeometry === 'function') {
        return new THREE.CapsuleGeometry(r, len, capSeg, radSeg);
      }
      // 极端兜底（r147 已有 CapsuleGeometry）：用拉长球体近似
      var g = new THREE.SphereGeometry(r, radSeg, radSeg / 2);
      g.scale(1, (len / (2 * r)) + 1, 1);
      return g;
    });
  }

  function torusGeo(r, tube, radSeg, tubSeg, arc) {
    r = size(r); tube = Math.max(0.0005, size(tube));
    radSeg = Math.max(4, Math.round(radSeg || 6));
    tubSeg = Math.max(6, Math.round(tubSeg || 16));
    var a = (arc === undefined) ? PI * 2 : arc;
    var key = 'tor|' + r4(r) + '|' + r4(tube) + '|' + radSeg + '|' + tubSeg + '|' + r4(a);
    return cachedGeo(key, function () {
      return new THREE.TorusGeometry(r, tube, radSeg, tubSeg, a);
    });
  }

  function planeGeo(w, h) {
    w = size(w); h = size(h);
    return cachedGeo('pln|' + r4(w) + '|' + r4(h), function () {
      return new THREE.PlaneGeometry(w, h);
    });
  }

  function circleGeo(r, seg) {
    r = size(r);
    seg = Math.max(6, Math.round(seg || 16));
    return cachedGeo('cir|' + r4(r) + '|' + seg, function () {
      return new THREE.CircleGeometry(r, seg);
    });
  }

  // 细线/软管：按 key 缓存 TubeGeometry（曲线点固定，不随实例变化）
  function tubeGeo(key, points, radius, radialSeg, tubularSeg) {
    radius = Math.max(0.0008, size(radius));
    radialSeg = Math.max(4, Math.round(radialSeg || 5));
    tubularSeg = Math.max(8, Math.round(tubularSeg || 24));
    return cachedGeo('tube|' + key + '|' + r4(radius) + '|' + radialSeg + '|' + tubularSeg, function () {
      var v = [];
      for (var i = 0; i < points.length; i++) {
        v.push(new THREE.Vector3(points[i][0], points[i][1], points[i][2]));
      }
      var curve = new THREE.CatmullRomCurve3(v);
      return new THREE.TubeGeometry(curve, tubularSeg, radius, radialSeg, false);
    });
  }

  // 沿指定轴的圆柱旋转（cylinder 默认沿 Y 轴）
  function axisRot(axis) {
    if (axis === 'x') return [0, 0, PI / 2];
    if (axis === 'z') return [PI / 2, 0, 0];
    return [0, 0, 0];
  }

  /* ===========================================================================
   * 2. 材质：优先 HT.mat(name, opts)，不存在/失败时回退到内置 PBR 材质表
   *    —— 任何情况下都不会因为 HT 缺失而抛错。
   * ======================================================================== */
  var FALLBACK_MAT = {
    metal:         { color: 0x8b9398, metalness: 0.85, roughness: 0.45 },
    metalDark:     { color: 0x3c4245, metalness: 0.80, roughness: 0.52 },
    metalLight:    { color: 0xb4bcc0, metalness: 0.78, roughness: 0.34 },
    stainless:     { color: 0xc6ccce, metalness: 0.95, roughness: 0.24 },
    paintedWhite:  { color: 0xd9dbd4, metalness: 0.08, roughness: 0.66 },
    paintedGreen:  { color: 0x7a8b80, metalness: 0.05, roughness: 0.72 },
    paintedCream:  { color: 0xd5cbb4, metalness: 0.04, roughness: 0.74 },
    wood:          { color: 0x8a6a48, metalness: 0.00, roughness: 0.82 },
    woodDark:      { color: 0x4b3629, metalness: 0.00, roughness: 0.85 },
    fabricWhite:   { color: 0xd7d8d0, metalness: 0.00, roughness: 1.00 },
    fabricBlue:    { color: 0x5d7385, metalness: 0.00, roughness: 1.00 },
    fabricGrey:    { color: 0x8f9294, metalness: 0.00, roughness: 1.00 },
    fabricGreen:   { color: 0x62786c, metalness: 0.00, roughness: 1.00 },
    plastic:       { color: 0xcfd2cd, metalness: 0.05, roughness: 0.46 },
    plasticDark:   { color: 0x2c3133, metalness: 0.10, roughness: 0.55 },
    glass:         { color: 0xb6c8cc, metalness: 0.00, roughness: 0.06, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false },
    paper:         { color: 0xe4dfce, metalness: 0.00, roughness: 0.95 },
    rubber:        { color: 0x1d1e1f, metalness: 0.00, roughness: 0.90 },
    ceramic:       { color: 0xe8e7e2, metalness: 0.04, roughness: 0.28 },
    tileFloor:     { color: 0x707368, metalness: 0.02, roughness: 0.78 },
    tileWall:      { color: 0xa7b0a8, metalness: 0.02, roughness: 0.62 },
    ceiling:       { color: 0xc2c6bd, metalness: 0.00, roughness: 0.92 },
    mirror:        { color: 0x171d20, metalness: 1.00, roughness: 0.08 },
    screen:        { color: 0x0b1210, metalness: 0.15, roughness: 0.28, emissive: 0x0d1f18, emissiveIntensity: 0.50 },
    emissiveWhite: { color: 0xf6f3e6, metalness: 0.00, roughness: 0.40, emissive: 0xfff1cf, emissiveIntensity: 0.90 },
    emissiveRed:   { color: 0x4a0b0b, metalness: 0.00, roughness: 0.40, emissive: 0xff2a1e, emissiveIntensity: 1.00 },
    emissiveGreen: { color: 0x0e2418, metalness: 0.00, roughness: 0.40, emissive: 0x3dff9a, emissiveIntensity: 0.90 },
    rust:          { color: 0x6d4527, metalness: 0.20, roughness: 0.95 },
    bodyBag:       { color: 0x141516, metalness: 0.12, roughness: 0.34 },
    concrete:      { color: 0x8b8b84, metalness: 0.00, roughness: 0.96 }
  };

  var MAT_CACHE = new Map();

  // 这些字段由本库强制覆盖（HT 若只认自己的参数，我们仍能保证外观可控）
  var OVERRIDE_KEYS = [
    'color', 'metalness', 'roughness', 'emissive', 'emissiveIntensity',
    'opacity', 'transparent', 'side', 'map', 'emissiveMap',
    'depthWrite', 'flatShading', 'alphaTest', 'envMapIntensity'
  ];

  function optsKey(opts) {
    if (!opts) return '';
    var keys = Object.keys(opts).sort();
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = opts[k];
      if (v === undefined) continue;
      if (v && v.isTexture) out.push(k + '=tex:' + (v.uuid || 'x'));
      else if (v && v.isColor) out.push(k + '=#' + v.getHexString());
      else if (typeof v === 'number') out.push(k + '=' + r4(v));
      else if (typeof v === 'object') out.push(k + '=obj');
      else out.push(k + '=' + v);
    }
    return out.join(',');
  }

  function hasOverrides(opts) {
    if (!opts) return false;
    for (var i = 0; i < OVERRIDE_KEYS.length; i++) {
      if (opts[OVERRIDE_KEYS[i]] !== undefined) return true;
    }
    return false;
  }

  function applyTo(m, o) {
    if (!o) return m;
    if (o.color !== undefined && m.color) m.color = new THREE.Color(o.color);
    if (o.metalness !== undefined && 'metalness' in m) m.metalness = o.metalness;
    if (o.roughness !== undefined && 'roughness' in m) m.roughness = o.roughness;
    if (o.map !== undefined) m.map = o.map || null;
    if (o.emissiveMap !== undefined) m.emissiveMap = o.emissiveMap || null;
    if (o.emissive !== undefined && m.emissive) m.emissive = new THREE.Color(o.emissive);
    if (o.emissiveIntensity !== undefined && 'emissiveIntensity' in m) m.emissiveIntensity = o.emissiveIntensity;
    if (o.opacity !== undefined) {
      m.opacity = o.opacity;
      if (o.transparent === undefined) m.transparent = o.opacity < 1;
    }
    if (o.transparent !== undefined) m.transparent = !!o.transparent;
    if (o.side !== undefined) m.side = o.side;
    if (o.depthWrite !== undefined) m.depthWrite = !!o.depthWrite;
    if (o.flatShading !== undefined && 'flatShading' in m) m.flatShading = !!o.flatShading;
    if (o.alphaTest !== undefined) m.alphaTest = o.alphaTest;
    if (o.envMapIntensity !== undefined && 'envMapIntensity' in m) m.envMapIntensity = o.envMapIntensity;
    m.needsUpdate = true;
    return m;
  }

  // HT 返回的若不是 Standard 材质，但我们又需要 emissive（灯管/屏幕），则升级为 Standard
  function ensureStandard(m) {
    if (m.isMeshStandardMaterial) return m;
    var s = new THREE.MeshStandardMaterial();
    if (m.color) s.color.copy(m.color);
    if (m.map) s.map = m.map;
    s.transparent = !!m.transparent;
    s.opacity = (m.opacity === undefined) ? 1 : m.opacity;
    s.side = (m.side === undefined) ? THREE.FrontSide : m.side;
    s.depthWrite = (m.depthWrite === undefined) ? true : m.depthWrite;
    s.__hpOwned = true;
    return s;
  }

  function fallbackMaterial(name, opts) {
    var b = FALLBACK_MAT[name] || FALLBACK_MAT.metal;
    var m = new THREE.MeshStandardMaterial({
      color: b.color,
      metalness: b.metalness !== undefined ? b.metalness : 0.0,
      roughness: b.roughness !== undefined ? b.roughness : 0.7
    });
    if (b.emissive !== undefined) {
      m.emissive = new THREE.Color(b.emissive);
      m.emissiveIntensity = (b.emissiveIntensity !== undefined) ? b.emissiveIntensity : 1;
    }
    if (b.transparent) {
      m.transparent = true;
      m.opacity = (b.opacity !== undefined) ? b.opacity : 0.5;
    }
    if (b.side !== undefined) m.side = b.side;
    if (b.depthWrite !== undefined) m.depthWrite = b.depthWrite;
    m.__hpOwned = true;
    m.name = 'HP.fallback.' + name;
    return applyTo(m, opts);
  }

  function tryHTMat(name, opts) {
    var HT = root.HT;
    if (!HT || typeof HT.mat !== 'function') return null;
    try {
      var m = HT.mat(name, opts || {});
      if (m && m.isMaterial) return m;
      return null;
    } catch (err) {
      warnOnce('ht-mat', 'HT.mat("' + name + '") 调用异常，已回退内置材质：' + (err && err.message ? err.message : err));
      return null;
    }
  }

  /**
   * 取材质（缓存）
   * @param {string} name 材质名（见 FALLBACK_MAT 表）
   * @param {object} [opts] 可覆盖 color/map/emissive/opacity/side...
   * @returns {THREE.Material}
   */
  function mat(name, opts) {
    var key = name + '|' + optsKey(opts);
    var hit = MAT_CACHE.get(key);
    if (hit) return hit;

    var m = tryHTMat(name, opts);
    if (m) {
      if (hasOverrides(opts)) {
        // 需要自发光 / 金属度 / 粗糙度时，确保是 Standard 材质
        if (opts.emissive !== undefined || opts.metalness !== undefined || opts.roughness !== undefined) {
          m = ensureStandard(m);
        }
        // HT 的共享材质不能就地改属性，否则会串到其他道具上
        m = m.clone();
        m.__hpOwned = true;
        applyTo(m, opts);
      }
    } else {
      m = fallbackMaterial(name, opts);
    }

    if (!m.name || m.name.indexOf('HP.') !== 0) {
      if (!m.name) m.name = 'HP.' + name;
    }
    MAT_CACHE.set(key, m);
    return m;
  }

  // 需要单独控制（闪烁、变色）的材质：克隆一份，避免影响同类道具
  function uniqueMat(name, opts) {
    var m = mat(name, opts).clone();
    m.__hpOwned = true;
    m.name = 'HP.unique.' + name;
    return m;
  }

  /* ===========================================================================
   * 3. Canvas 贴图（只在工厂函数被调用时创建，不在脚本加载阶段访问 document）
   * ======================================================================== */
  var TEX_CACHE = new Map();

  function canvasTex(key, w, h, draw) {
    var hit = TEX_CACHE.get(key);
    if (hit) return hit;
    if (typeof document === 'undefined' || !document.createElement) return null;

    var cv = document.createElement('canvas');
    cv.width = Math.max(8, Math.round(w));
    cv.height = Math.max(8, Math.round(h));
    var ctx = cv.getContext('2d');
    if (!ctx) return null;
    draw(ctx, cv.width, cv.height);

    var tex = new THREE.CanvasTexture(cv);
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    TEX_CACHE.set(key, tex);
    return tex;
  }

  // 按宽高比选择合适的画布像素尺寸（保持文字清晰，又不浪费显存）
  function texSize(w, h, baseH) {
    var pxH = Math.max(64, Math.round(baseH || 128));
    var pxW = Math.max(64, Math.round(pxH * (w / Math.max(h, 0.001))));
    if (pxW > 1024) { pxW = 1024; }
    return [pxW, pxH];
  }

  /* ===========================================================================
   * 4. 网格拼装辅助：所有零件都加在传入的父节点下
   * ======================================================================== */
  function box(parent, w, h, d, x, y, z, material, rot) {
    var m = new THREE.Mesh(boxGeo(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    parent.add(m);
    return m;
  }

  function cyl(parent, rTop, rBot, h, x, y, z, material, seg, rot) {
    var m = new THREE.Mesh(cylGeo(rTop, rBot, h, seg), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    parent.add(m);
    return m;
  }

  function sphere(parent, r, x, y, z, material, seg, scale) {
    var m = new THREE.Mesh(sphereGeo(r, seg), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m);
    return m;
  }

  function capsule(parent, r, len, x, y, z, material, rot, scale) {
    var m = new THREE.Mesh(capsuleGeo(r, len, 3, 10), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m);
    return m;
  }

  function torus(parent, r, tube, x, y, z, material, rot, radSeg, tubSeg, arc) {
    var m = new THREE.Mesh(torusGeo(r, tube, radSeg, tubSeg, arc), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    parent.add(m);
    return m;
  }

  function plane(parent, w, h, x, y, z, material, rot) {
    var m = new THREE.Mesh(planeGeo(w, h), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    parent.add(m);
    return m;
  }

  function circle(parent, r, x, y, z, material, rot, seg) {
    var m = new THREE.Mesh(circleGeo(r, seg), material);
    m.position.set(x || 0, y || 0, z || 0);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    parent.add(m);
    return m;
  }

  // 任意两点之间的圆杆（床栏、推车把手、管道支架、输液架挂钩等）
  function rod(parent, a, b, radius, material, seg) {
    var va = new THREE.Vector3(a[0], a[1], a[2]);
    var vb = new THREE.Vector3(b[0], b[1], b[2]);
    var dir = new THREE.Vector3().subVectors(vb, va);
    var len = dir.length();
    if (len < 0.0008) return null;
    var m = new THREE.Mesh(cylGeo(radius, radius, len, seg || 8), material);
    m.position.copy(va).add(vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    parent.add(m);
    return m;
  }

  function tube(parent, key, points, radius, material, radialSeg, tubularSeg) {
    var m = new THREE.Mesh(tubeGeo(key, points, radius, radialSeg, tubularSeg), material);
    parent.add(m);
    return m;
  }

  // 小螺丝（壁挂件背板/设备外壳）
  function screw(parent, x, y, z, r, axis) {
    return cyl(parent, r || 0.006, r || 0.006, 0.006, x, y, z,
      mat('metalDark'), 6, axisRot(axis || 'z'));
  }

  /* ===========================================================================
   * 5. 组、包围盒、阴影
   * ======================================================================== */
  function makeGroup(kind, mount) {
    var g = new THREE.Group();
    g.name = 'HP.' + kind;
    g.userData.kind = kind;
    g.userData.mount = mount || 'floor';
    return g;
  }

  /**
   * 收尾：把整个组的最低点对齐到 y=0，写入 userData.dims，统一阴影设置。
   * @param {THREE.Group} g
   * @param {boolean} cast 大件为 true，小件为 false（只接收阴影）
   */
  function finish(g, cast) {
    g.updateMatrixWorld(true);
    var bb = new THREE.Box3().setFromObject(g);
    var minY = bb.min.y;
    if (isFinite(minY) && Math.abs(minY) > 0.0005) {
      for (var i = 0; i < g.children.length; i++) {
        g.children[i].position.y -= minY;
      }
      g.updateMatrixWorld(true);
      bb.setFromObject(g);
    }

    var s = new THREE.Vector3();
    bb.getSize(s);
    g.userData.dims = { w: r3(s.x), h: r3(s.y), d: r3(s.z) };
    g.userData.bounds = {
      min: { x: r3(bb.min.x), y: r3(bb.min.y), z: r3(bb.min.z) },
      max: { x: r3(bb.max.x), y: r3(bb.max.y), z: r3(bb.max.z) }
    };

    cast = bool(cast, true);
    g.traverse(function (o) {
      if (!o.isMesh) return;
      var m = o.material;
      var seeThrough = !!(m && m.transparent && (m.opacity === undefined ? true : m.opacity < 0.9));
      o.castShadow = cast && !seeThrough;
      o.receiveShadow = true;
    });
    return g;
  }

  /* ===========================================================================
   * 6. 通用零件：脚轮、床栏锁扣、把手
   * ======================================================================== */
  // 万向脚轮：轮子 + 轮毂 + 叉架 + 安装板，返回总高（约 0.125 m）
  function addCaster(parent, x, z, R) {
    R = R || 0.05;
    var w = R * 0.62;
    var rubber = mat('rubber');
    var hub = mat('metalLight');
    var forkMat = mat('metalDark');

    cyl(parent, R, R, w, x, R, z, rubber, 14, [0, 0, PI / 2]);
    cyl(parent, R * 0.34, R * 0.34, w + 0.002, x, R, z, hub, 8, [0, 0, PI / 2]);
    box(parent, 0.044, R * 1.35, R * 1.55, x, R * 1.15, z, forkMat);
    box(parent, 0.048, 0.008, 0.048, x, R * 1.55 + 0.045, z, forkMat);
    return R * 1.55 + 0.049;
  }

  // 推车/病床侧面的折叠护栏（pivot 在床沿，绕 Z 轴折下）
  function addBedRail(parent, xSign, x, hingeY, raised) {
    var light = mat('metalLight');
    var dark = mat('metalDark');
    var pivot = new THREE.Group();
    pivot.position.set(xSign * x, hingeY, 0);
    if (!raised) pivot.rotation.z = xSign * 1.38;
    parent.add(pivot);

    var zs = [-0.62, -0.12, 0.42];
    for (var i = 0; i < zs.length; i++) {
      rod(pivot, [0, 0, zs[i]], [0, 0.178, zs[i]], 0.011, light, 6);
    }
    rod(pivot, [0, 0.182, -0.62], [0, 0.182, 0.42], 0.013, light, 8);
    rod(pivot, [0, 0.095, -0.62], [0, 0.095, 0.42], 0.010, light, 8);
    box(pivot, 0.05, 0.035, 0.09, 0, 0.03, 0.42, dark);
    box(pivot, 0.03, 0.04, 0.05, 0, 0.0, -0.62, dark);
    return pivot;
  }

  /* ===========================================================================
   * 7. 病床  bed(opts)  {occupied, disheveled, side}
   *    外形约 1.02 x 0.65 x 2.05 m（低床，老东翼精神科病床）
   * ======================================================================== */
  function bed(opts) {
    opts = opts || {};
    var occupied = bool(opts.occupied, false);
    var disheveled = bool(opts.disheveled, false);
    var side = pick(opts.side, ['left', 'right', 'both', 'none'], 'right');

    var g = makeGroup('bed', 'floor');

    var W = 1.00;       // 床架宽
    var railX = 0.49;   // 护栏铰点 x
    var headZ = -1.005; // 床头板 z
    var footZ = 1.005;  // 床尾板 z

    var frameMat = mat('metalDark');
    var lightMat = mat('metalLight');
    var panelMat = mat('paintedWhite');
    var sheetMat = mat('fabricWhite');
    var sheetShade = mat('fabricWhite', { color: 0xc4c6bd });
    var blanketMat = mat('fabricBlue');
    var blanketDark = mat('fabricBlue', { color: 0x46586b });
    var rubberMat = mat('rubber');
    var paperMat = mat('paper');
    var rustMat = mat('rust');

    // —— 脚轮与床腿 ——
    var cx = 0.42;
    var cz = 0.82;
    addCaster(g, -cx, -cz, 0.05);
    addCaster(g, cx, -cz, 0.05);
    addCaster(g, -cx, cz, 0.05);
    addCaster(g, cx, cz, 0.05);
    var legXs = [-0.445, 0.445];
    var legZs = [-0.80, 0.80];
    for (var li = 0; li < legXs.length; li++) {
      for (var lj = 0; lj < legZs.length; lj++) {
        rod(g, [legXs[li], 0.115, legZs[lj]], [legXs[li] * 1.01, 0.285, legZs[lj]], 0.021, frameMat, 8);
      }
    }

    // —— 床架（H 型）——
    rod(g, [-0.455, 0.272, -0.86], [-0.455, 0.272, 0.86], 0.022, frameMat, 8);
    rod(g, [0.455, 0.272, -0.86], [0.455, 0.272, 0.86], 0.022, frameMat, 8);
    rod(g, [-0.455, 0.272, -0.86], [0.455, 0.272, -0.86], 0.020, frameMat, 8);
    rod(g, [-0.455, 0.272, 0.86], [0.455, 0.272, 0.86], 0.020, frameMat, 8);
    rod(g, [0, 0.235, -0.86], [0, 0.235, 0.86], 0.016, frameMat, 8);

    // —— 床板 + 床垫 ——
    box(g, 0.90, 0.035, 1.88, 0, 0.2975, 0, lightMat);
    for (var si = 0; si < 4; si++) {
      box(g, 0.055, 0.006, 1.86, -0.30 + si * 0.20, 0.317, 0, frameMat);
    }
    box(g, 0.94, 0.02, 1.94, 0, 0.335, 0, mat('fabricGrey'));
    box(g, 0.94, 0.135, 1.94, 0, 0.3825, 0, sheetMat);
    // 床垫滚边
    rod(g, [-0.472, 0.44, -0.96], [-0.472, 0.44, 0.96], 0.006, sheetShade, 5);
    rod(g, [0.472, 0.44, -0.96], [0.472, 0.44, 0.96], 0.006, sheetShade, 5);

    // —— 床头/床尾板（上沿做圆角，下缘连到床架）——
    box(g, 0.98, 0.43, 0.04, 0, 0.415, headZ, panelMat);
    box(g, 0.98, 0.37, 0.04, 0, 0.385, footZ, panelMat);
    rod(g, [-0.485, 0.63, headZ], [0.485, 0.63, headZ], 0.019, panelMat, 8);
    rod(g, [-0.485, 0.57, footZ], [0.485, 0.57, footZ], 0.019, panelMat, 8);
    // 床尾板橡胶防撞条
    box(g, 0.70, 0.045, 0.012, 0, 0.31, footZ + 0.024, rubberMat);
    // 床头板内侧的划线（老式搪瓷板拼缝）
    box(g, 0.96, 0.008, 0.006, 0, 0.53, headZ + 0.022, frameMat);
    box(g, 0.96, 0.008, 0.006, 0, 0.34, headZ + 0.022, frameMat);
    // 床尾标签贴纸
    plane(g, 0.11, 0.065, 0.22, 0.45, footZ + 0.021, paperMat);

    // 床头输液杆插座（贴在床头板内侧）
    cyl(g, 0.016, 0.016, 0.075, 0.415, 0.585, headZ + 0.03, frameMat, 6);
    torus(g, 0.022, 0.005, 0.415, 0.622, headZ + 0.03, frameMat, [PI / 2, 0, 0], 4, 10);

    // —— 两侧折叠护栏 ——
    var railR = addBedRail(g, 1, railX, 0.455, side === 'right' || side === 'both');
    var railL = addBedRail(g, -1, railX, 0.455, side === 'left' || side === 'both');

    // —— 枕头 ——
    var pillow = sphere(g, 0.26, 0, 0.505, -0.72, sheetMat, 14, [1.0, 0.24, 0.55]);
    // 枕套缝线
    box(g, 0.44, 0.006, 0.006, 0, 0.556, -0.72, sheetShade);

    // —— 床单（上片 + 两侧/床尾垂布）——
    box(g, 0.93, 0.012, 1.52, 0, 0.456, 0.12, sheetMat);
    box(g, 0.014, 0.26, 1.50, -0.468, 0.335, 0.12, sheetMat, [0, 0, 0.02]);
    box(g, 0.014, 0.26, 1.50, 0.468, 0.335, 0.12, sheetMat, [0, 0, -0.02]);
    box(g, 0.93, 0.25, 0.014, 0, 0.335, 0.885, sheetMat);

    // —— 被褥（盖住下半身）——
    var blanket = box(g, 0.96, 0.045, 0.82, 0, 0.475, 0.55, blanketMat);
    rod(g, [-0.47, 0.49, 0.145], [0.47, 0.49, 0.145], 0.022, blanketMat, 8);
    var blanketL = box(g, 0.02, 0.30, 0.82, -0.478, 0.33, 0.55, blanketMat, [0, 0, 0.03]);
    var blanketR = box(g, 0.02, 0.30, 0.82, 0.478, 0.33, 0.55, blanketMat, [0, 0, -0.03]);
    var blanketF = box(g, 0.96, 0.28, 0.02, 0, 0.33, 0.965, blanketMat);
    // 被褶
    box(g, 0.72, 0.006, 0.014, 0, 0.500, 0.33, blanketDark);
    box(g, 0.66, 0.006, 0.014, 0.02, 0.501, 0.58, blanketDark);
    box(g, 0.60, 0.006, 0.014, -0.01, 0.500, 0.80, blanketDark);

    // —— 磨损与锈迹 ——
    box(g, 0.018, 0.07, 0.03, -0.445, 0.19, -0.80, rustMat);
    box(g, 0.03, 0.05, 0.012, 0.452, 0.30, 0.84, rustMat);
    plane(g, 0.05, 0.02, -0.43, 0.58, headZ + 0.023, rustMat);

    // —— 床单下的人形隆起（只表现布料起伏，不露人体）——
    if (occupied) {
      capsule(g, 0.15, 0.92, 0, 0.535, -0.05, sheetMat, [PI / 2, 0, 0], [1.05, 1.0, 0.78]);
      sphere(g, 0.115, 0, 0.55, -0.735, sheetMat, 14, [0.95, 0.80, 1.05]);
      sphere(g, 0.135, 0, 0.552, -0.52, sheetMat, 12, [1.15, 0.85, 1.0]);
      sphere(g, 0.09, 0.03, 0.548, 0.44, sheetMat, 10, [1.0, 0.85, 1.2]);
      sphere(g, 0.075, -0.02, 0.548, 0.79, sheetMat, 10, [1.3, 0.85, 0.9]);
      // 被褥盖到膝部（略高于床单隆起，避免穿模）
      capsule(g, 0.165, 0.60, 0, 0.552, 0.45, blanketMat, [PI / 2, 0, 0], [1.02, 1.0, 0.72]);
      // 布料褶皱线
      for (var wi = 0; wi < 4; wi++) {
        box(g, 0.68, 0.005, 0.012, jitter(wi + 3) * 0.03, 0.640,
          -0.3 + wi * 0.24, sheetShade);
      }
      // 垂下的床单（被身体顶起后搭在床沿）
      box(g, 0.014, 0.22, 0.55, 0.50, 0.56, 0.12, sheetMat, [0.05, 0, 0.16]);
    }

    // —— 凌乱状态 ——
    if (disheveled) {
      pillow.position.set(0.17, 0.515, -0.58);
      pillow.rotation.set(0.12, 0.55, 0.18);
      blanket.position.set(0.03, 0.473, 0.66);
      blanket.rotation.set(0, 0.07, 0.025);
      blanketL.rotation.y = 0.12;
      blanketR.position.x = 0.492;
      blanketF.rotation.x = -0.18;
      // 被角翻起、床单被扯到一边
      box(g, 0.52, 0.012, 0.30, -0.16, 0.468, 0.78, sheetMat, [0.06, 0.22, -0.10]);
      box(g, 0.016, 0.20, 0.40, -0.505, 0.40, 0.62, sheetMat, [0.10, 0, -0.22]);
      // 床尾揉成一团的布
      sphere(g, 0.16, 0.20, 0.50, 0.86, sheetMat, 10, [1.2, 0.55, 0.9]);
      sphere(g, 0.12, -0.05, 0.49, 0.90, blanketMat, 10, [1.15, 0.5, 0.85]);
      // 一侧护栏半折（有故障的旧床）
      var halfRail = (side === 'left') ? railL : railR;
      if (side !== 'none' && halfRail.rotation.z === 0) {
        halfRail.rotation.z = halfRail.position.x * 0.62;
      }
      // 床垫一角露出
      box(g, 0.20, 0.012, 0.22, 0.37, 0.451, -0.42, mat('fabricWhite', { color: 0xb9b5a6 }));
    }

    return finish(g, true);
  }

  /* ===========================================================================
   * 8. 推床 / 担架车  gurney(opts)  {bodyBag, strap}
   *    0.72 x 0.80 x 1.95 m（含裹尸袋约 1.0 m 高）
   * ======================================================================== */
  function gurney(opts) {
    opts = opts || {};
    var withBag = bool(opts.bodyBag, false);
    var withStrap = bool(opts.strap, false);

    var g = makeGroup('gurney', 'floor');
    var W = 0.72;
    var L = 1.95;
    var padTop = 0.75;

    var frameMat = mat('metal'),
      darkMat = mat('metalDark'),
      stainless = mat('stainless'),
      padMat = mat('fabricBlue', { color: 0x3f5263 }),
      rubberMat = mat('rubber'),
      rustMat = mat('rust');

    // 脚轮
    var cx = 0.30, cz = 0.82;
    addCaster(g, -cx, -cz, 0.05);
    addCaster(g, cx, -cz, 0.05);
    addCaster(g, -cx, cz, 0.05);
    addCaster(g, cx, cz, 0.05);

    // 四立柱 + 上下框
    var px = 0.335, pz = 0.85;
    var posts = [[-px, -pz], [px, -pz], [-px, pz], [px, pz]];
    for (var i = 0; i < posts.length; i++) {
      rod(g, [posts[i][0], 0.12, posts[i][1]], [posts[i][0], 0.64, posts[i][1]], 0.017, stainless, 8);
    }
    rod(g, [-0.345, 0.60, -0.90], [-0.345, 0.60, 0.90], 0.016, frameMat, 8);
    rod(g, [0.345, 0.60, -0.90], [0.345, 0.60, 0.90], 0.016, frameMat, 8);
    rod(g, [-0.345, 0.60, -0.90], [0.345, 0.60, -0.90], 0.015, frameMat, 8);
    rod(g, [-0.345, 0.60, 0.90], [0.345, 0.60, 0.90], 0.015, frameMat, 8);
    // 下层置物板
    box(g, 0.64, 0.018, 1.45, 0, 0.345, 0, darkMat);
    box(g, 0.60, 0.012, 0.55, 0, 0.365, -0.35, mat('stainless'));
    // 床面框
    box(g, 0.70, 0.05, 1.90, 0, 0.625, 0, frameMat);

    // 床垫（深蓝人造革，带横向缝线）
    box(g, 0.68, 0.09, 1.88, 0, 0.705, 0, padMat);
    for (var s = 0; s < 3; s++) {
      box(g, 0.66, 0.004, 0.012, 0, 0.751, -0.5 + s * 0.5, mat('fabricBlue', { color: 0x334453 }));
    }
    rod(g, [-0.34, 0.735, -0.94], [-0.34, 0.735, 0.94], 0.019, padMat, 8);
    rod(g, [0.34, 0.735, -0.94], [0.34, 0.735, 0.94], 0.019, padMat, 8);

    // 推手（床头端）：两根斜杆 + 横向握杆，最高点 0.80
    rod(g, [-0.30, 0.63, -0.88], [-0.30, 0.79, -1.01], 0.016, stainless, 8);
    rod(g, [0.30, 0.63, -0.88], [0.30, 0.79, -1.01], 0.016, stainless, 8);
    rod(g, [-0.31, 0.79, -1.01], [0.31, 0.79, -1.01], 0.017, stainless, 8);
    // 推手橡胶握套
    cyl(g, 0.021, 0.021, 0.40, 0, 0.79, -1.01, rubberMat, 8, [0, 0, PI / 2]);

    // 侧面短护栏
    rod(g, [-0.352, 0.70, -0.55], [-0.352, 0.76, -0.55], 0.011, stainless, 6);
    rod(g, [-0.352, 0.76, -0.55], [-0.352, 0.76, 0.18], 0.011, stainless, 6);
    rod(g, [-0.352, 0.76, 0.18], [-0.352, 0.70, 0.18], 0.011, stainless, 6);
    rod(g, [0.352, 0.70, -0.55], [0.352, 0.76, -0.55], 0.011, stainless, 6);
    rod(g, [0.352, 0.76, -0.55], [0.352, 0.76, 0.18], 0.011, stainless, 6);
    rod(g, [0.352, 0.76, 0.18], [0.352, 0.70, 0.18], 0.011, stainless, 6);

    // 束缚带（放裹尸袋时跨过袋体）
    if (withStrap) {
      var strapMat = mat('rubber');
      var strapY = withBag ? 1.02 : 0.757;
      box(g, 0.70, 0.014, 0.05, 0, strapY, 0.25, strapMat);
      box(g, 0.016, 0.16, 0.05, -0.35, strapY - 0.08, 0.25, strapMat);
      box(g, 0.016, 0.16, 0.05, 0.35, strapY - 0.08, 0.25, strapMat);
      box(g, 0.05, 0.045, 0.06, 0.18, strapY + 0.005, 0.25, mat('metalDark'));
    }

    // 车架上的锈与划痕
    box(g, 0.012, 0.05, 0.025, -0.34, 0.30, -0.55, rustMat);
    box(g, 0.04, 0.012, 0.02, 0.33, 0.58, 0.40, rustMat);

    // 裹尸袋（放在床面，落点由本函数决定；单独使用时 y 由调用方决定）
    if (withBag) {
      var bag = bodyBag({ onGurney: true });
      bag.position.set(0, padTop + 0.005, 0.02);
      g.add(bag);
    }

    return finish(g, true);
  }

  /* ===========================================================================
   * 9. 轮椅  wheelchair(opts)
   *    0.63 x 0.95 x 1.00 m
   * ======================================================================== */
  function wheelchair(opts) {
    var g = makeGroup('wheelchair', 'floor');
    var chrome = mat('stainless');
    var dark = mat('metalDark');
    var rubber = mat('rubber');
    var vinyl = mat('fabricBlue', { color: 0x2f3d46 });
    var fabric = mat('fabricGrey');

    var wheelR = 0.27;
    var wheelY = wheelR;
    var wx = 0.29;

    // —— 大轮 + 手轮圈 + 辐条 ——
    for (var s = -1; s <= 1; s += 2) {
      var x = s * wx;
      cyl(g, wheelR, wheelR, 0.042, x, wheelY, -0.02, rubber, 22, [0, 0, PI / 2]);
      cyl(g, wheelR - 0.035, wheelR - 0.035, 0.046, x, wheelY, -0.02, chrome, 20, [0, 0, PI / 2]);
      cyl(g, 0.045, 0.045, 0.055, x, wheelY, -0.02, mat('metalLight'), 10, [0, 0, PI / 2]);
      // 手推圈装在外侧，用 3 个连接片与轮圈相连
      torus(g, wheelR - 0.02, 0.011, x + s * 0.026, wheelY, -0.02, chrome, [0, PI / 2, 0], 5, 24);
      for (var k = 0; k < 3; k++) {
        var a = k * PI * 2 / 3 + 0.26;
        var rx = (wheelR - 0.02) * Math.sin(a);
        var rz = (wheelR - 0.02) * Math.cos(a);
        rod(g, [x, wheelY + rx, -0.02 + rz],
          [x + s * 0.026, wheelY + rx, -0.02 + rz], 0.005, chrome, 4);
      }
      for (var k2 = 0; k2 < 6; k2++) {
        var a2 = k2 * PI / 3 + 0.26;
        rod(g,
          [x, wheelY + 0.04 * Math.sin(a2), -0.02 + 0.04 * Math.cos(a2)],
          [x, wheelY + (wheelR - 0.035) * Math.sin(a2), -0.02 + (wheelR - 0.035) * Math.cos(a2)],
          0.004, chrome, 4);
      }
    }

    // —— 前小轮 ——
    for (var f = -1; f <= 1; f += 2) {
      var fx = f * 0.21;
      cyl(g, 0.06, 0.06, 0.03, fx, 0.06, 0.37, rubber, 12, [0, 0, PI / 2]);
      cyl(g, 0.02, 0.02, 0.034, fx, 0.06, 0.37, dark, 8, [0, 0, PI / 2]);
      rod(g, [fx, 0.09, 0.37], [fx, 0.16, 0.35], 0.012, chrome, 6);
      box(g, 0.012, 0.10, 0.06, fx, 0.13, 0.37, dark);
    }

    // —— 车架 ——
    rod(g, [-0.25, 0.50, -0.30], [-0.25, 0.50, 0.30], 0.016, chrome, 8);
    rod(g, [0.25, 0.50, -0.30], [0.25, 0.50, 0.30], 0.016, chrome, 8);
    rod(g, [-0.25, 0.50, 0.30], [0.21, 0.50, 0.34], 0.014, chrome, 8);
    rod(g, [0.25, 0.50, 0.30], [-0.21, 0.50, 0.34], 0.014, chrome, 8);
    rod(g, [-0.25, 0.50, -0.30], [-0.25, 0.18, -0.40], 0.014, chrome, 8);
    rod(g, [0.25, 0.50, -0.30], [0.25, 0.18, -0.40], 0.014, chrome, 8);
    rod(g, [-0.25, 0.18, -0.40], [0.25, 0.18, -0.40], 0.013, chrome, 8);

    // 座面
    box(g, 0.46, 0.045, 0.42, 0, 0.515, 0.02, vinyl);
    box(g, 0.44, 0.006, 0.40, 0, 0.54, 0.02, mat('fabricBlue', { color: 0x26333b }));

    // 靠背立柱 + 靠背 + 推手
    rod(g, [-0.24, 0.50, -0.30], [-0.24, 0.90, -0.34], 0.015, chrome, 8);
    rod(g, [0.24, 0.50, -0.30], [0.24, 0.90, -0.34], 0.015, chrome, 8);
    box(g, 0.44, 0.36, 0.035, 0, 0.72, -0.335, vinyl, [-0.06, 0, 0]);
    box(g, 0.40, 0.006, 0.006, 0, 0.72, -0.316, mat('fabricBlue', { color: 0x26333b }));
    rod(g, [-0.24, 0.90, -0.34], [-0.24, 0.945, -0.44], 0.015, chrome, 8);
    rod(g, [0.24, 0.90, -0.34], [0.24, 0.945, -0.44], 0.015, chrome, 8);
    rod(g, [-0.25, 0.945, -0.44], [0.25, 0.945, -0.44], 0.015, chrome, 8);
    // 推手握套
    cyl(g, 0.018, 0.018, 0.10, -0.18, 0.945, -0.44, rubber, 8, [0, 0, PI / 2]);
    cyl(g, 0.018, 0.018, 0.10, 0.18, 0.945, -0.44, rubber, 8, [0, 0, PI / 2]);

    // 扶手
    rod(g, [-0.26, 0.66, -0.26], [-0.26, 0.66, 0.16], 0.012, chrome, 6);
    rod(g, [0.26, 0.66, -0.26], [0.26, 0.66, 0.16], 0.012, chrome, 6);
    rod(g, [-0.26, 0.60, -0.26], [-0.26, 0.66, -0.26], 0.010, chrome, 6);
    rod(g, [0.26, 0.60, -0.26], [0.26, 0.66, -0.26], 0.010, chrome, 6);
    box(g, 0.06, 0.03, 0.34, -0.26, 0.685, -0.05, fabric);
    box(g, 0.06, 0.03, 0.34, 0.26, 0.685, -0.05, fabric);

    // 脚踏板
    rod(g, [-0.24, 0.48, 0.30], [-0.20, 0.24, 0.46], 0.012, chrome, 6);
    rod(g, [0.24, 0.48, 0.30], [0.20, 0.24, 0.46], 0.012, chrome, 6);
    box(g, 0.40, 0.018, 0.17, 0, 0.185, 0.47, dark, [0.12, 0, 0]);
    // 脚踏板防滑纹
    for (var t = 0; t < 4; t++) {
      box(g, 0.36, 0.005, 0.012, 0, 0.196, 0.41 + t * 0.035, mat('metal'));
    }

    // 侧面刹车
    for (var b = -1; b <= 1; b += 2) {
      rod(g, [b * 0.265, 0.52, 0.24], [b * 0.305, 0.40, 0.30], 0.010, dark, 6);
      box(g, 0.025, 0.02, 0.11, b * 0.312, 0.39, 0.30, rubber);
    }

    // 座下储物袋
    box(g, 0.40, 0.20, 0.30, 0, 0.39, 0.02, mat('fabricGreen', { color: 0x4d5f55 }));

    return finish(g, true);
  }

  /* ===========================================================================
   * 10. 程序化 Canvas 贴图（标牌 / 文书 / 屏幕 / 钟面 / 标签）
   * ======================================================================== */
  var FONT_CJK = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Heiti SC",sans-serif';
  var FONT_MONO = '"Consolas","Courier New",monospace';

  function font(size, bold, mono) {
    return (bold ? 'bold ' : '') + Math.max(8, Math.round(size)) + 'px ' + (mono ? FONT_MONO : FONT_CJK);
  }

  // 标牌（中文）：底色 + 边框 + 居中文字 + 做旧斑点；返回 CanvasTexture
  function signTexture(text, w, h, bg, color) {
    var px = texSize(w, h, 160);
    var key = 'sign|' + text + '|' + bg + '|' + color + '|' + px[0] + 'x' + px[1];
    return canvasTex(key, px[0], px[1], function (ctx, W, H) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = Math.max(3, H * 0.045);
      ctx.strokeRect(H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14);
      ctx.globalAlpha = 1;

      // 做旧暗斑
      ctx.fillStyle = '#000';
      for (var i = 0; i < 24; i++) {
        ctx.globalAlpha = 0.03 + hash(i + 5) * 0.035;
        var x = hash(i * 3 + 11) * W;
        var y = hash(i * 7 + 29) * H;
        var r = (0.02 + hash(i * 5 + 7) * 0.09) * H;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 文字：自动缩放到安全宽度
      var size = Math.round(H * 0.52);
      var maxW = W - H * 0.55;
      ctx.font = font(size, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      while (size > H * 0.18 && ctx.measureText(text).width > maxW) {
        size -= 2;
        ctx.font = font(size, true);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, W / 2, H * 0.535);
    });
  }

  // 小铭牌 / 标签 / 抽屉牌
  function plateTexture(text, sub, bg, fg, w, h) {
    var px = texSize(w, h, 128);
    var key = 'plate|' + text + '|' + (sub || '') + '|' + bg + '|' + fg + '|' + px[0] + 'x' + px[1];
    return canvasTex(key, px[0], px[1], function (ctx, W, H) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = Math.max(2, H * 0.04);
      ctx.strokeRect(H * 0.08, H * 0.08, W - H * 0.16, H - H * 0.16);
      ctx.globalAlpha = 1;

      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var size = Math.round(H * 0.44);
      ctx.font = font(size, true);
      var maxW = W - H * 0.30;
      while (size > H * 0.16 && ctx.measureText(text).width > maxW) {
        size -= 2;
        ctx.font = font(size, true);
      }
      ctx.fillText(text, W / 2, H * (sub ? 0.40 : 0.53));
      if (sub) {
        ctx.font = font(H * 0.20, false);
        ctx.fillText(sub, W / 2, H * 0.74);
      }
    });
  }

  // A4 文书：页眉、文字行、褪色红章
  function paperTexture() {
    return canvasTex('paper.a4', 256, 330, function (ctx, W, H) {
      ctx.fillStyle = '#e7e1cf';
      ctx.fillRect(0, 0, W, H);

      // 纸纤维与黄斑
      for (var i = 0; i < 30; i++) {
        ctx.globalAlpha = 0.025 + hash(i + 2) * 0.04;
        ctx.fillStyle = i % 3 === 0 ? '#8a7a52' : '#b7ad93';
        var x = hash(i * 5 + 3) * W;
        var y = hash(i * 9 + 7) * H;
        ctx.beginPath();
        ctx.arc(x, y, (0.01 + hash(i + 21) * 0.08) * H, 0, PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 页眉
      ctx.fillStyle = '#34352f';
      ctx.fillRect(28, 30, 116, 3);
      ctx.font = font(15, true);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#4a4a42';
      ctx.fillText('静默病栋 · 东翼病区', 28, 58);

      // 正文行
      ctx.fillStyle = '#6b6b62';
      for (var l = 0; l < 11; l++) {
        var y2 = 84 + l * 17;
        var w2 = (W - 56) * (0.52 + hash(l * 3 + 5) * 0.42);
        ctx.fillRect(28, y2, w2, 3);
        if (l === 4) ctx.fillRect(28, y2 + 7, (W - 56) * 0.30, 2);
      }

      // 褪色红章
      ctx.save();
      ctx.translate(W - 66, H - 66);
      ctx.rotate(-0.13);
      ctx.strokeStyle = 'rgba(146,42,36,0.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(-32, -32, 64, 64);
      ctx.fillStyle = 'rgba(146,42,36,0.45)';
      ctx.font = font(15, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('病案室', 0, 0);
      ctx.restore();
    });
  }

  // 病人监护仪屏幕（开/关）
  function patientScreenTexture(on) {
    return canvasTex('screen.patient.' + (on ? 'on' : 'off'), 320, 200, function (ctx, W, H) {
      ctx.fillStyle = on ? '#04100b' : '#070c0a';
      ctx.fillRect(0, 0, W, H);

      if (!on) {
        // 关机：一条斜向反光 + 待机字样
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#9fd6c0';
        ctx.save();
        ctx.translate(W * 0.5, H * 0.5);
        ctx.rotate(-0.5);
        ctx.fillRect(-W, -18, W * 2, 36);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#1d2f27';
        ctx.font = font(11, false, true);
        ctx.textAlign = 'left';
        ctx.fillText('STANDBY', 12, H - 12);
        return;
      }

      // 网格
      ctx.strokeStyle = 'rgba(64,168,116,0.16)';
      ctx.lineWidth = 1;
      for (var gx = 0; gx <= W; gx += 32) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (var gy = 0; gy <= H; gy += 25) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      // 心电波形（含 QRS 尖峰）
      ctx.beginPath();
      ctx.strokeStyle = '#4dff9b';
      ctx.lineWidth = 2;
      for (var i = 0; i <= W; i++) {
        var t = i / W;
        var base = 128 + Math.sin(t * PI * 7.0) * 2.5;
        var spike = Math.pow(Math.max(0, Math.sin(t * PI * 9.0 - 1.2)), 14) * -46;
        var dip = Math.pow(Math.max(0, Math.sin(t * PI * 9.0 - 1.55)), 26) * 18;
        var yy = base + spike + dip;
        if (i === 0) ctx.moveTo(i, yy); else ctx.lineTo(i, yy);
      }
      ctx.stroke();

      // 第二条（呼吸/血氧）波形
      ctx.beginPath();
      ctx.strokeStyle = '#57cfe0';
      ctx.lineWidth = 1.5;
      for (var j = 0; j <= W; j++) {
        var t2 = j / W;
        var y2 = 172 + Math.sin(t2 * PI * 4.0) * 7 + Math.sin(t2 * PI * 13.0) * 1.5;
        if (j === 0) ctx.moveTo(j, y2); else ctx.lineTo(j, y2);
      }
      ctx.stroke();

      // 读数
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#9dffc6';
      ctx.font = font(14, true, true);
      ctx.fillText('HR   62', 12, 22);
      ctx.fillText('SpO2 98', 118, 22);
      ctx.fillText('NIBP 118/74', 222, 22);
      ctx.fillStyle = '#4f8f74';
      ctx.font = font(9, false, true);
      ctx.fillText('LEAD II', 12, 36);
      ctx.fillText('BED 04', W - 66, 36);

      // 扫描光标
      ctx.fillStyle = 'rgba(120,255,190,0.30)';
      ctx.fillRect(W - 44, 46, 2, H - 58);
    });
  }

  // 护士站电脑（暗色系统界面）
  function deskScreenTexture() {
    return canvasTex('screen.desk', 320, 200, function (ctx, W, H) {
      ctx.fillStyle = '#08131b';
      ctx.fillRect(0, 0, W, H);

      // 主窗口
      ctx.fillStyle = '#122533';
      ctx.fillRect(18, 18, W - 36, H - 46);
      ctx.strokeStyle = '#36596d';
      ctx.lineWidth = 1;
      ctx.strokeRect(18, 18, W - 36, H - 46);
      ctx.fillStyle = '#1b3748';
      ctx.fillRect(18, 18, W - 36, 18);

      // 左侧列表
      ctx.fillStyle = '#2a4a5c';
      ctx.fillRect(26, 44, 92, H - 80);
      for (var i = 0; i < 7; i++) {
        ctx.fillStyle = i === 2 ? '#4e7f93' : '#33566a';
        ctx.fillRect(32, 52 + i * 17, 78, 11);
      }

      // 右侧表单行
      ctx.fillStyle = '#7d9dad';
      for (var r = 0; r < 6; r++) {
        ctx.fillRect(132, 52 + r * 18, 120 - (r % 3) * 26, 5);
      }
      ctx.fillStyle = '#cfe2ec';
      ctx.font = font(13, true);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('东翼 · 病人档案', 26, 32);
      ctx.font = font(9, false);
      ctx.fillStyle = '#9fb6c4';
      ctx.fillText('03:17  /  夜班', 236, 32);

      // 底部状态栏
      ctx.fillStyle = '#16303f';
      ctx.fillRect(18, H - 25, W - 36, 15);
      ctx.fillStyle = '#5c8a9e';
      ctx.fillRect(24, H - 21, 54, 7);
      ctx.fillStyle = '#3f6c80';
      ctx.fillRect(84, H - 21, 34, 7);

      // 暗角
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, 4);
      ctx.fillRect(0, H - 4, W, 4);
      ctx.globalAlpha = 1;
    });
  }

  function keyboardTexture() {
    return canvasTex('keyboard', 256, 96, function (ctx, W, H) {
      ctx.fillStyle = '#202628';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#3b4446';
      ctx.fillRect(3, 3, W - 6, H - 6);

      var rows = 4, x0 = 8, y0 = 8, kw = 13, kh = 15, gap = 3;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < 15; c++) {
          if (r === 3 && c > 3 && c < 10) continue;   // 空格键单独画
          ctx.fillStyle = '#586264';
          ctx.fillRect(x0 + c * (kw + gap), y0 + r * (kh + gap), kw, kh);
          ctx.fillStyle = '#3d4648';
          ctx.fillRect(x0 + c * (kw + gap), y0 + r * (kh + gap) + kh - 3, kw, 3);
        }
      }
      // 空格键
      ctx.fillStyle = '#586264';
      ctx.fillRect(x0 + 4 * (kw + gap), y0 + 3 * (kh + gap), 98, kh);
      // 小键盘区
      ctx.fillStyle = '#4c5658';
      ctx.fillRect(W - 52, 8, 44, 80);
    });
  }

  // 老挂钟表盘（指针用几何体，2:37）
  function clockFaceTexture() {
    return canvasTex('clock.face', 256, 256, function (ctx, W, H) {
      var cx = W / 2, cy = H / 2, R = W / 2 - 8;
      ctx.fillStyle = '#0c0e0d';
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, PI * 2);
      ctx.fillStyle = '#e5e0d0';
      ctx.fill();

      // 老化黄斑
      for (var i = 0; i < 12; i++) {
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#6d5b39';
        ctx.beginPath();
        ctx.arc(hash(i * 3 + 1) * W, hash(i * 5 + 2) * H, (0.04 + hash(i + 8) * 0.12) * W, 0, PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 60 格分度
      for (var m = 0; m < 60; m++) {
        var a = m / 60 * PI * 2;
        var r1 = (m % 5 === 0) ? R * 0.86 : R * 0.905;
        var r2 = R * 0.945;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
        ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
        ctx.strokeStyle = '#2c2f2b';
        ctx.lineWidth = (m % 5 === 0) ? 4 : 1.4;
        ctx.stroke();
      }

      // 数字
      ctx.fillStyle = '#24261f';
      ctx.font = 'bold 22px Georgia,serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var n = 1; n <= 12; n++) {
        var a2 = n / 12 * PI * 2;
        ctx.fillText(String(n), cx + Math.sin(a2) * R * 0.70, cy - Math.cos(a2) * R * 0.70 + 1);
      }

      ctx.font = '9px Arial,sans-serif';
      ctx.fillStyle = '#5c5c50';
      ctx.fillText('SILENT WARD', cx, cy + R * 0.44);

      // 玻璃反光
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.55);
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-R, -R * 0.55, R * 2, R * 0.28);
      ctx.restore();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, PI * 2);
      ctx.fillStyle = '#1f211c';
      ctx.fill();
    });
  }

  // 医疗废物标识
  function biohazardTexture() {
    return canvasTex('biohazard', 128, 128, function (ctx, W, H) {
      ctx.fillStyle = '#e6e4dc';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#20221f';
      ctx.lineWidth = 4;
      ctx.strokeRect(5, 5, W - 10, H - 10);

      var cx = W / 2, cy = H * 0.40, r = 20;
      ctx.fillStyle = '#20221f';
      for (var i = 0; i < 3; i++) {
        var a = i * PI * 2 / 3 - PI / 2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, r * 0.62, 0, PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.34, 0, PI * 2);
      ctx.fill();
      // 中间挖白，形成三叶草
      ctx.fillStyle = '#e6e4dc';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.19, 0, PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.52, r * 0.20, 0, PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - r * 0.45, cy + r * 0.27, r * 0.20, 0, PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.45, cy + r * 0.27, r * 0.20, 0, PI * 2);
      ctx.fill();

      ctx.fillStyle = '#20221f';
      ctx.font = font(17, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('医疗废物', cx, H * 0.78);
      ctx.font = font(9, false);
      ctx.fillText('MEDICAL WASTE', cx, H * 0.89);
    });
  }

  // 相框里的“走廊”照片
  function corridorPictureTexture() {
    return canvasTex('picture.corridor', 256, 340, function (ctx, W, H) {
      ctx.fillStyle = '#0b1112';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1a2a2a';
      ctx.fillRect(0, 0, W, H * 0.56);

      var vx = W * 0.5, vy = H * 0.52;
      // 地面
      ctx.fillStyle = '#2a3330';
      ctx.beginPath();
      ctx.moveTo(-30, H);
      ctx.lineTo(vx - 24, vy);
      ctx.lineTo(vx + 24, vy);
      ctx.lineTo(W + 30, H);
      ctx.fill();
      // 天花板
      ctx.fillStyle = '#090e0f';
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(vx - 24, vy);
      ctx.lineTo(vx + 24, vy);
      ctx.lineTo(W + 30, 0);
      ctx.fill();
      // 左右墙
      ctx.fillStyle = '#16211f';
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(vx - 24, vy);
      ctx.lineTo(vx - 24, H);
      ctx.lineTo(-30, H);
      ctx.fill();
      ctx.fillStyle = '#141d1c';
      ctx.beginPath();
      ctx.moveTo(W + 30, 0);
      ctx.lineTo(vx + 24, vy);
      ctx.lineTo(vx + 24, H);
      ctx.lineTo(W + 30, H);
      ctx.fill();

      // 门洞
      ctx.fillStyle = '#080c0c';
      ctx.fillRect(38, H * 0.30, 44, H * 0.34);
      ctx.fillRect(W - 82, H * 0.30, 44, H * 0.34);
      // 走廊尽头的门
      ctx.fillStyle = '#7b9384';
      ctx.fillRect(vx - 18, vy - 34, 36, 38);
      ctx.fillStyle = '#465a51';
      ctx.fillRect(vx - 15, vy - 3, 30, 3);

      // 顶灯（冷光）
      ctx.fillStyle = 'rgba(160,190,170,0.22)';
      ctx.fillRect(vx - 52, H * 0.17, 104, 5);
      ctx.fillStyle = 'rgba(160,190,170,0.08)';
      ctx.beginPath();
      ctx.moveTo(vx - 52, H * 0.175);
      ctx.lineTo(vx - 18, vy);
      ctx.lineTo(vx + 18, vy);
      ctx.lineTo(vx + 52, H * 0.175);
      ctx.fill();

      // 噪点
      for (var i = 0; i < 260; i++) {
        ctx.globalAlpha = 0.02 + hash(i + 4) * 0.07;
        ctx.fillStyle = i % 4 === 0 ? '#d9e6d8' : '#000000';
        ctx.fillRect(hash(i * 3 + 1) * W, hash(i * 7 + 2) * H, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;

      // 暗角
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, 10);
      ctx.fillRect(0, H - 10, W, 10);
      ctx.fillRect(0, 0, 8, H);
      ctx.fillRect(W - 8, 0, 8, H);
      ctx.globalAlpha = 1;
    });
  }

  // 密码键盘小屏
  function keypadScreenTexture() {
    return canvasTex('screen.keypad', 96, 48, function (ctx, W, H) {
      ctx.fillStyle = '#06120c';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#1f5a3c';
      ctx.lineWidth = 2;
      ctx.strokeRect(4, 4, W - 8, H - 8);
      ctx.fillStyle = '#5dffa8';
      ctx.font = font(22, true, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('- - - -', W / 2, H / 2 + 1);
    });
  }

  // 老电话拨号盘
  function phoneDialTexture() {
    return canvasTex('phone.dial', 256, 256, function (ctx, W, H) {
      var cx = W / 2, cy = H / 2, R = W * 0.47;
      ctx.fillStyle = '#141714';
      ctx.fillRect(0, 0, W, H);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, PI * 2);
      ctx.fillStyle = '#242825';
      ctx.fill();

      for (var i = 0; i < 10; i++) {
        var a = (i / 10) * PI * 2 - PI / 2 + 0.32;
        // 指孔
        var hx = cx + Math.cos(a) * R * 0.60;
        var hy = cy + Math.sin(a) * R * 0.60;
        ctx.beginPath();
        ctx.arc(hx, hy, R * 0.095, 0, PI * 2);
        ctx.fillStyle = '#0b0d0b';
        ctx.fill();
        // 数字
        ctx.fillStyle = '#d7d3c3';
        ctx.font = font(20, true);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String((i + 1) % 10), cx + Math.cos(a) * R * 0.84, cy + Math.sin(a) * R * 0.84);
      }

      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.33, 0, PI * 2);
      ctx.fillStyle = '#333630';
      ctx.fill();
      ctx.fillStyle = '#aaa694';
      ctx.font = font(11, true);
      ctx.fillText('PULSE', cx, cy);

      ctx.strokeStyle = '#4a4d45';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.985, 0, PI * 2);
      ctx.stroke();
    });
  }

  // 录音机喇叭格栅
  function grilleTexture() {
    return canvasTex('grille', 128, 64, function (ctx, W, H) {
      ctx.fillStyle = '#202523';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#0c0f0e';
      for (var x = 8; x < W - 6; x += 9) ctx.fillRect(x, 7, 4, H - 14);
      ctx.strokeStyle = '#4a504c';
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, W - 6, H - 6);
    });
  }

  /* 材质辅助：带 Canvas 贴图的材质（浏览器无 canvas 时自动退化为纯色） */
  function mapMat(name, texture, opts) {
    if (!texture) return mat(name, opts);
    var o = {};
    if (opts) {
      for (var k in opts) {
        if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
      }
    }
    o.map = texture;
    return mat(name, o);
  }

  // 屏幕材质：贴图 + 自发光（供微光/关屏切换）
  function screenMaterial(texture, on, emissiveColor) {
    if (!texture) return mat('screen');
    return mat('screen', {
      map: texture,
      color: 0xffffff,
      roughness: 0.32,
      metalness: 0.06,
      emissive: on ? (emissiveColor || 0xffffff) : 0x000000,
      emissiveMap: on ? texture : null,
      emissiveIntensity: on ? 0.85 : 0
    });
  }

  /* ===========================================================================
   * 11. 输液架  ivStand(opts)  {bag}
   * ======================================================================== */
  function ivStand(opts) {
    opts = opts || {};
    var withBag = bool(opts.bag, true);

    var g = makeGroup('ivStand', 'floor');
    var steel = mat('stainless');
    var dark = mat('metalDark');
    var rubber = mat('rubber');

    // 五爪底座
    for (var i = 0; i < 5; i++) {
      var a = i * PI * 2 / 5 + 0.31;
      var ex = Math.cos(a) * 0.26;
      var ez = Math.sin(a) * 0.26;
      rod(g, [0, 0.085, 0], [ex, 0.085, ez], 0.013, dark, 6);
      cyl(g, 0.015, 0.021, 0.028, ex, 0.062, ez, dark, 6);
      sphere(g, 0.03, ex, 0.03, ez, rubber, 8);
    }
    cyl(g, 0.045, 0.05, 0.05, 0, 0.085, 0, dark, 10);

    // 立杆 + 升降锁紧环
    cyl(g, 0.0125, 0.0125, 1.72, 0, 0.95, 0, steel, 10);
    cyl(g, 0.019, 0.019, 0.045, 0, 1.20, 0, dark, 8);
    cyl(g, 0.0165, 0.0165, 0.10, 0, 1.26, 0, steel, 8);

    // 顶部横臂 + 左右挂钩
    box(g, 0.09, 0.025, 0.05, 0, 1.795, 0, dark);
    function hook(sign) {
      var x1 = sign * 0.15, x2 = sign * 0.19;
      rod(g, [sign * 0.04, 1.79, 0], [x1, 1.79, 0], 0.007, steel, 5);
      rod(g, [x1, 1.79, 0], [x1, 1.85, 0], 0.007, steel, 5);
      rod(g, [x1, 1.85, 0], [x2, 1.85, 0], 0.007, steel, 5);
      rod(g, [x2, 1.85, 0], [x2, 1.80, 0], 0.007, steel, 5);
    }
    hook(1);
    hook(-1);

    if (withBag) {
      var bagMat = mat('plastic', {
        color: 0xd8e6cf, transparent: true, opacity: 0.55,
        side: THREE.DoubleSide, depthWrite: false, roughness: 0.25
      });
      var fluidMat = mat('plastic', {
        color: 0xa9c6a2, transparent: true, opacity: 0.78,
        roughness: 0.2
      });
      var plastic = mat('plastic', { color: 0xdfe4dc });

      // 挂环 + 袋体 + 液面
      box(g, 0.045, 0.05, 0.012, 0.19, 1.795, 0, plastic);
      box(g, 0.15, 0.22, 0.035, 0.19, 1.645, 0, bagMat);
      box(g, 0.13, 0.145, 0.026, 0.19, 1.585, 0, fluidMat);
      box(g, 0.12, 0.012, 0.03, 0.19, 1.735, 0, plastic);

      // 药名标签
      var ltex = plateTexture('0.9% NaCl', '静默病栋', '#e8e7dc', '#24352c', 0.09, 0.055);
      plane(g, 0.09, 0.055, 0.19, 1.645, 0.019, mapMat('paper', ltex));

      // 滴斗 + 输液管 + 调节夹
      cyl(g, 0.024, 0.024, 0.055, 0.19, 1.505, 0, bagMat, 8);
      cyl(g, 0.010, 0.010, 0.02, 0.19, 1.47, 0, plastic, 6);
      tube(g, 'iv.tube', [
        [0.19, 1.47, 0.0],
        [0.17, 1.30, 0.015],
        [0.10, 1.02, 0.03],
        [0.045, 0.72, 0.02],
        [0.03, 0.42, 0.0]
      ], 0.0045, mat('plastic', { color: 0xdfe7d9 }), 4, 26);
      box(g, 0.018, 0.03, 0.014, 0.105, 1.05, 0.032, plastic);

      // 备用手套/胶带挂在另一侧
      box(g, 0.06, 0.05, 0.02, -0.19, 1.77, 0, mat('paper', { color: 0xcfc7ae }));
    }

    return finish(g, false);
  }

  /* ===========================================================================
   * 12. 金属储物柜  locker(opts)  {open}
   *     0.5 x 1.85 x 0.45 m；userData.leafPivot 为门枢轴
   * ======================================================================== */
  function locker(opts) {
    opts = opts || {};
    var open = bool(opts.open, false);

    var g = makeGroup('locker', 'floor');
    var w = 0.50, d = 0.40, h = 1.85;

    var bodyMat = mat('paintedGreen');
    var bodyDark = mat('paintedGreen', { color: 0x5b6c62 });
    var metal = mat('metalLight');
    var dark = mat('metalDark');
    var rust = mat('rust');
    var sheetMat = mat('fabricWhite');

    // 外壳（背板 + 两侧 + 顶底），开门时能看到内部；总深 0.40 + 门把手约 0.45
    box(g, 0.48, 1.74, 0.018, 0, 0.965, -0.191, bodyDark);
    box(g, 0.024, 1.725, 0.38, -0.238, 0.9675, 0, bodyMat);
    box(g, 0.024, 1.725, 0.38, 0.238, 0.9675, 0, bodyMat);
    box(g, 0.50, 0.03, 0.40, 0, 0.125, 0, bodyMat);
    box(g, 0.50, 0.03, 0.40, 0, 1.835, 0, bodyMat);
    // 顶部封板/防尘盖
    box(g, 0.50, 0.012, 0.40, 0, 1.856, 0, bodyDark);

    // 四只可调脚（脚顶到柜底）
    for (var fx = -1; fx <= 1; fx += 2) {
      for (var fz = -1; fz <= 1; fz += 2) {
        cyl(g, 0.016, 0.018, 0.10, fx * 0.20, 0.06, fz * 0.15, dark, 8);
        cyl(g, 0.024, 0.024, 0.01, fx * 0.20, 0.005, fz * 0.15, mat('rubber'), 8);
      }
    }

    // 内部：两层搁板 + 挂衣杆 + 杂物
    box(g, 0.456, 0.016, 0.34, 0, 1.22, 0.005, metal);
    box(g, 0.456, 0.016, 0.34, 0, 0.72, 0.005, metal);
    rod(g, [-0.20, 1.64, 0.05], [0.20, 1.64, 0.05], 0.010, metal, 6);
    box(g, 0.30, 0.05, 0.24, -0.03, 1.255, 0.03, sheetMat);
    box(g, 0.28, 0.045, 0.22, -0.01, 1.302, 0.02, sheetMat);
    box(g, 0.30, 0.04, 0.24, 0.02, 0.748, 0.02, mat('fabricBlue'));
    cyl(g, 0.035, 0.035, 0.11, -0.14, 0.786, 0.06, mat('ceramic'), 10);
    cyl(g, 0.024, 0.024, 0.17, 0.13, 0.813, 0.02, mat('plastic', { color: 0x9fb0a4 }), 8);

    // 门（枢轴在左前侧；绕 Y 旋转 -1.9 rad 为开）
    var pivot = new THREE.Group();
    pivot.position.set(-0.238, 0.11, 0.21);
    pivot.rotation.y = open ? -1.9 : 0;
    g.add(pivot);

    box(pivot, 0.472, 1.72, 0.02, 0.236, 0.86, 0, bodyMat);
    // 门板包边
    box(pivot, 0.472, 0.022, 0.006, 0.236, 1.700, 0.011, bodyDark);
    box(pivot, 0.472, 0.022, 0.006, 0.236, 0.020, 0.011, bodyDark);
    box(pivot, 0.022, 1.70, 0.006, 0.012, 0.86, 0.011, bodyDark);
    box(pivot, 0.022, 1.70, 0.006, 0.460, 0.86, 0.011, bodyDark);
    // 门内凹面板（用略深的平面表现凹槽）
    plane(pivot, 0.42, 1.60, 0.236, 0.86, 0.0112, bodyDark);

    // 通风百叶
    for (var v = 0; v < 3; v++) {
      box(pivot, 0.22, 0.012, 0.008, 0.236, 1.575 + v * 0.032, 0.0125, mat('plasticDark'));
    }

    // 名牌
    var nameTex = plateTexture('东翼 07', 'EAST WING', '#dfe3dc', '#22312b', 0.13, 0.05);
    plane(pivot, 0.13, 0.05, 0.236, 1.42, 0.0152, mapMat('paper', nameTex));
    box(pivot, 0.14, 0.06, 0.004, 0.236, 1.42, 0.0125, metal);

    // 把手 + 锁芯
    rod(pivot, [0.405, 0.80, 0.035], [0.405, 1.02, 0.035], 0.010, metal, 6);
    rod(pivot, [0.405, 0.80, 0.012], [0.405, 0.80, 0.035], 0.008, metal, 5);
    rod(pivot, [0.405, 1.02, 0.012], [0.405, 1.02, 0.035], 0.008, metal, 5);
    cyl(pivot, 0.014, 0.014, 0.014, 0.405, 1.10, 0.018, dark, 10, [PI / 2, 0, 0]);
    // 铰链
    box(pivot, 0.022, 0.075, 0.030, 0.004, 0.45, 0.006, metal);
    box(pivot, 0.022, 0.075, 0.030, 0.004, 1.48, 0.006, metal);

    // 锈迹
    box(g, 0.006, 0.05, 0.025, -0.251, 0.10, 0.10, rust);
    box(g, 0.006, 0.03, 0.02, 0.251, 0.10, -0.08, rust);
    box(pivot, 0.03, 0.012, 0.004, 0.10, 0.075, 0.012, rust);

    g.userData.leafPivot = pivot;
    g.userData.leafAngleOpen = -1.9;
    g.userData.open = open;

    return finish(g, true);
  }

  /* ===========================================================================
   * 13. 医疗柜  cabinet(opts)  {wall}
   * ======================================================================== */
  function cabinet(opts) {
    opts = opts || {};
    var wall = bool(opts.wall, false);
    var g = makeGroup('cabinet', wall ? 'wall' : 'floor');

    var frameMat = mat('paintedWhite');
    var trimMat = mat('metalLight');
    // 柜门玻璃用不透明深度写入，柜内搁板改成不透明材质：
    // 否则多层透明面在移动时排序变化，会一直闪烁
    var glassMat = mat('glass', { opacity: 0.32, depthWrite: true });
    var darkMat = mat('metalDark');
    var shelfMat = mat('metalLight', { color: 0xc7d0ca, roughness: 0.38 });
    var bottleColors = [0xb8c9b4, 0xd0c9b6, 0xa9bcc4];

    if (!wall) {
      // —— 落地医疗柜 0.9 x 1.6 x 0.4 ——
      var w = 0.90, d = 0.40, bottom = 0.06, top = 1.60;

      // 四脚
      for (var lx = -1; lx <= 1; lx += 2) {
        for (var lz = -1; lz <= 1; lz += 2) {
          cyl(g, 0.014, 0.018, 0.06, lx * 0.40, 0.03, lz * 0.16, darkMat, 6);
          cyl(g, 0.026, 0.026, 0.012, lx * 0.40, 0.006, lz * 0.16, mat('rubber'), 8);
        }
      }

      // 柜体
      box(g, 0.88, 1.50, 0.02, 0, 0.83, -0.19, frameMat);
      box(g, 0.025, 1.50, 0.36, -0.4375, 0.83, 0, frameMat);
      box(g, 0.025, 1.50, 0.36, 0.4375, 0.83, 0, frameMat);
      box(g, 0.90, 0.03, 0.40, 0, 1.585, 0, frameMat);
      box(g, 0.90, 0.03, 0.40, 0, 0.075, 0, frameMat);
      box(g, 0.84, 1.44, 0.012, 0, 0.83, -0.182, mat('paintedWhite', { color: 0xc3c7bf }));

      // 玻璃搁板 + 前挡边
      var shelfYs = [0.52, 0.94, 1.36];
      for (var s = 0; s < shelfYs.length; s++) {
        box(g, 0.84, 0.012, 0.34, 0, shelfYs[s], 0, shelfMat);
        rod(g, [-0.42, shelfYs[s] + 0.016, 0.165], [0.42, shelfYs[s] + 0.016, 0.165], 0.006, trimMat, 5);
      }

      // 柜内药品/器械
      for (var b = 0; b < 3; b++) {
        cyl(g, 0.032, 0.032, 0.15, -0.24 + b * 0.12, 0.60, 0.02, mat('plastic', { color: bottleColors[b] }), 10);
        cyl(g, 0.018, 0.018, 0.03, -0.24 + b * 0.12, 0.69, 0.02, mat('plasticDark'), 8);
      }
      box(g, 0.20, 0.11, 0.12, 0.24, 1.005, 0.02, mat('paper', { color: 0xc8bfa5 }));
      box(g, 0.16, 0.14, 0.11, 0.05, 1.02, 0.01, mat('paper', { color: 0xd2cbb6 }));
      cyl(g, 0.05, 0.05, 0.10, -0.20, 0.575, 0.02, mat('ceramic'), 12);
      box(g, 0.24, 0.07, 0.16, -0.16, 1.405, 0.01, mat('fabricWhite'));

      // 双开玻璃门（带铝框）
      for (var door = -1; door <= 1; door += 2) {
        var hingeX = door * 0.4375;
        var grp = new THREE.Group();
        grp.position.set(hingeX, 0.10, 0.188);
        g.add(grp);
        var dw = 0.428;
        // 门框
        box(grp, dw, 0.026, 0.022, -door * dw / 2, 1.442, 0, trimMat);
        box(grp, dw, 0.026, 0.022, -door * dw / 2, 0.026, 0, trimMat);
        box(grp, 0.026, 1.468, 0.022, 0, 0.734, 0, trimMat);
        box(grp, 0.026, 1.468, 0.022, -door * dw, 0.734, 0, trimMat);
        // 玻璃
        box(grp, dw - 0.05, 1.41, 0.008, -door * dw / 2, 0.734, 0, glassMat);
        // 把手（两门在中缝处各一竖杆）
        rod(grp, [-door * (dw - 0.035), 0.62, 0.033], [-door * (dw - 0.035), 1.02, 0.033], 0.009, trimMat, 6);
        rod(grp, [-door * (dw - 0.035), 0.62, 0.011], [-door * (dw - 0.035), 0.62, 0.033], 0.007, trimMat, 5);
        rod(grp, [-door * (dw - 0.035), 1.02, 0.011], [-door * (dw - 0.035), 1.02, 0.033], 0.007, trimMat, 5);
      }
      // 门缝
      box(g, 0.006, 1.44, 0.01, 0, 0.82, 0.198, darkMat);
      // 锁
      cyl(g, 0.012, 0.012, 0.012, 0.035, 0.92, 0.202, trimMat, 8, [PI / 2, 0, 0]);
      // 顶部标签
      var ltex = plateTexture('药品柜', 'MEDICINE', '#dfe3dc', '#263a30', 0.22, 0.06);
      plane(g, 0.22, 0.06, -0.30, 1.50, 0.202, mapMat('paper', ltex));
      // 柜脚锈
      box(g, 0.03, 0.02, 0.02, -0.40, 0.075, 0.17, mat('rust'));

    } else {
      // —— 壁挂医疗柜 0.62 x 0.72 x 0.28，背面贴墙 z=0 ——
      var ww = 0.62, hh = 0.72, dd = 0.28;
      box(g, ww, hh, 0.02, 0, hh / 2, 0.01, frameMat);
      box(g, 0.02, hh - 0.02, dd - 0.02, -ww / 2 + 0.01, hh / 2, dd / 2, frameMat);
      box(g, 0.02, hh - 0.02, dd - 0.02, ww / 2 - 0.01, hh / 2, dd / 2, frameMat);
      box(g, ww, 0.02, dd, 0, 0.01, dd / 2, frameMat);
      box(g, ww, 0.02, dd, 0, hh - 0.01, dd / 2, frameMat);

      // 搁板
      box(g, ww - 0.05, 0.012, dd - 0.06, 0, 0.37, dd / 2 + 0.01, shelfMat);
      rod(g, [-ww / 2 + 0.05, 0.379, dd - 0.04], [ww / 2 - 0.05, 0.379, dd - 0.04], 0.005, trimMat, 5);

      // 内容物
      for (var wb = 0; wb < 4; wb++) {
        cyl(g, 0.026, 0.026, 0.13, -0.20 + wb * 0.13, 0.076, 0.15, mat('plastic', { color: bottleColors[wb % 3] }), 8);
        cyl(g, 0.014, 0.014, 0.025, -0.20 + wb * 0.13, 0.153, 0.15, mat('plasticDark'), 6);
      }
      box(g, 0.18, 0.09, 0.10, 0.12, 0.435, 0.15, mat('paper', { color: 0xc9c0a8 }));

      // 门（左侧铰链）
      var wp = new THREE.Group();
      wp.position.set(-ww / 2 + 0.02, 0.02, dd - 0.005);
      g.add(wp);
      var wdw = ww - 0.05;
      box(wp, wdw, 0.026, 0.018, wdw / 2, hh - 0.045, 0.006, trimMat);
      box(wp, wdw, 0.026, 0.018, wdw / 2, 0.012, 0.006, trimMat);
      box(wp, 0.026, hh - 0.02, 0.018, 0.002, hh / 2, 0.006, trimMat);
      box(wp, 0.026, hh - 0.02, 0.018, wdw, hh / 2, 0.006, trimMat);
      box(wp, wdw - 0.05, hh - 0.10, 0.007, wdw / 2, hh / 2, 0.006, glassMat);
      // 门把手
      rod(wp, [wdw - 0.04, 0.30, 0.034], [wdw - 0.04, 0.42, 0.034], 0.008, trimMat, 5);
      // 铭牌（贴在柜门玻璃外侧）
      var wltex = plateTexture('急救', 'EMERGENCY', '#dfe3dc', '#4a2320', 0.16, 0.05);
      plane(g, 0.16, 0.05, -0.14, 0.63, 0.286, mapMat('paper', wltex));

      g.userData.leafPivot = wp;
    }

    return finish(g, true);
  }

  /* ===========================================================================
   * 14. 护士站工作台  nurseDesk(opts)  {w:2.4, d:0.9}
   * ======================================================================== */
  function nurseDesk(opts) {
    opts = opts || {};
    var w = Math.max(1.4, num(opts.w, 2.4));
    var d = Math.max(0.6, num(opts.d, 0.9));

    var g = makeGroup('nurseDesk', 'floor');
    var body = mat('paintedGreen');
    var bodyDark = mat('paintedGreen', { color: 0x54645b });
    var topMat = mat('wood', { color: 0x6d6250 });
    var metal = mat('metalLight');
    var dark = mat('metalDark');

    // 台面
    box(g, w, 0.04, d, 0, 0.76, 0, topMat);
    box(g, w, 0.03, 0.018, 0, 0.745, d / 2 + 0.002, bodyDark);

    // 踢脚 + 柜体
    box(g, w - 0.10, 0.10, d - 0.12, 0, 0.05, -0.02, dark);
    box(g, w - 0.06, 0.62, 0.02, 0, 0.43, -d / 2 + 0.03, body);
    box(g, 0.03, 0.62, d - 0.04, -(w / 2 - 0.015), 0.43, 0, body);
    box(g, 0.03, 0.62, d - 0.04, w / 2 - 0.015, 0.43, 0, body);

    // 两侧抽屉柜
    var stacks = [-1, 1];
    for (var si = 0; si < stacks.length; si++) {
      var sx = stacks[si] * (w / 2 - 0.31);
      box(g, 0.56, 0.60, d - 0.10, sx, 0.41, 0.01, bodyDark);
      for (var dr = 0; dr < 3; dr++) {
        var dy = 0.20 + dr * 0.19;
        box(g, 0.50, 0.165, 0.02, sx, dy, d / 2 - 0.032, body);
        box(g, 0.50, 0.006, 0.012, sx, dy + 0.075, d / 2 - 0.015, dark);
        rod(g, [sx - 0.14, dy, d / 2 - 0.011], [sx + 0.14, dy, d / 2 - 0.011], 0.008, metal, 5);
        rod(g, [sx - 0.14, dy, d / 2 - 0.019], [sx - 0.14, dy, d / 2 - 0.011], 0.006, metal, 5);
        rod(g, [sx + 0.14, dy, d / 2 - 0.019], [sx + 0.14, dy, d / 2 - 0.011], 0.006, metal, 5);
        // 锁孔
        cyl(g, 0.007, 0.007, 0.008, sx, dy + 0.035, d / 2 - 0.018, dark, 6, [PI / 2, 0, 0]);
      }
    }

    // 后挡板 / 内侧矮柜
    box(g, w, 0.36, 0.035, 0, 0.96, -d / 2 + 0.09, body);
    box(g, w, 0.028, 0.11, 0, 1.152, -d / 2 + 0.09, topMat);
    box(g, w, 0.02, 0.02, 0, 1.168, -d / 2 + 0.035, bodyDark);
    // 内侧开放格
    box(g, w - 0.10, 0.02, 0.22, 0, 0.86, -d / 2 + 0.22, bodyDark);

    // —— 显示器 ——
    var scrTex = deskScreenTexture();
    var scrMat = screenMaterial(scrTex, true, 0xbfe9ff);
    var monX = -w / 2 + 0.62, monZ = -0.16;
    box(g, 0.24, 0.018, 0.17, monX, 0.789, monZ + 0.02, dark);
    box(g, 0.055, 0.15, 0.04, monX, 0.868, monZ + 0.01, dark);
    var screen = new THREE.Group();
    screen.position.set(monX, 1.06, monZ);
    screen.rotation.x = -0.06;
    g.add(screen);
    box(screen, 0.46, 0.30, 0.035, 0, 0, 0, mat('plasticDark'));
    box(screen, 0.47, 0.012, 0.038, 0, 0.152, 0, mat('plastic', { color: 0x1b2022 }));
    plane(screen, 0.425, 0.265, 0, 0.004, 0.019, scrMat);
    // 电源指示灯
    cyl(screen, 0.004, 0.004, 0.004, 0.20, -0.13, 0.02, mat('emissiveGreen'), 5, [PI / 2, 0, 0]);
    // 线缆
    tube(g, 'desk.monitor.cable', [
      [monX, 1.00, monZ - 0.03],
      [monX + 0.04, 0.90, monZ - 0.10],
      [monX + 0.02, 0.79, monZ - 0.06],
      [monX - 0.10, 0.77, monZ - 0.12]
    ], 0.005, dark, 4, 16);

    // —— 键盘 + 鼠标 ——
    var kbTex = keyboardTexture();
    box(g, 0.44, 0.012, 0.16, monX, 0.786, 0.15, mat('plasticDark'));
    plane(g, 0.42, 0.145, monX, 0.793, 0.15, mapMat('plasticDark', kbTex, { color: 0xffffff }), [-PI / 2, 0, 0]);
    var mouse = sphere(g, 0.05, monX + 0.30, 0.797, 0.15, mat('plasticDark'), 12, [0.7, 0.45, 1.0]);

    // —— 散落纸张 ——
    var docTex = paperTexture();
    var docMat = mapMat('paper', docTex);
    for (var p = 0; p < 5; p++) {
      var px = monX + 0.48 + hash(p + 3) * 0.45;
      var pz = -0.20 + hash(p + 8) * 0.42;
      plane(g, 0.21, 0.297, px, 0.781 + p * 0.0015, pz,
        docMat, [-PI / 2, 0, hash(p + 11) * 1.2 - 0.6]);
    }
    // 一个斜放的信封
    box(g, 0.16, 0.004, 0.11, monX + 0.52, 0.789, 0.30, mat('paper', { color: 0xcfc7b0 }), [0, 0.4, 0]);

    // —— 台灯 ——
    var lampX = w / 2 - 0.34, lampZ = -0.22;
    cyl(g, 0.085, 0.095, 0.02, lampX, 0.79, lampZ, mat('metalDark'), 12);
    rod(g, [lampX, 0.79, lampZ], [lampX - 0.02, 1.00, lampZ], 0.011, metal, 6);
    sphere(g, 0.018, lampX - 0.02, 1.00, lampZ, dark, 8);
    rod(g, [lampX - 0.02, 1.00, lampZ], [lampX - 0.14, 1.12, lampZ + 0.10], 0.011, metal, 6);
    sphere(g, 0.018, lampX - 0.14, 1.12, lampZ + 0.10, dark, 8);
    var shade = cyl(g, 0.055, 0.105, 0.13, lampX - 0.18, 1.08, lampZ + 0.14, mat('paintedGreen', { color: 0x546b5d }), 12);
    shade.rotation.x = 0.55;
    // 灯口暖光（仅自发光，不放光源）
    circle(g, 0.075, lampX - 0.18, 1.015, lampZ + 0.145, mat('emissiveWhite', { emissive: 0xffcf92, emissiveIntensity: 0.55 }), [PI / 2 + 0.55, 0, 0], 12);

    // 笔筒 + 笔 + 搪瓷杯
    cyl(g, 0.035, 0.032, 0.095, monX + 0.75, 0.828, -0.30, mat('ceramic', { color: 0x9aa79c }), 10);
    for (var pen = 0; pen < 3; pen++) {
      cyl(g, 0.004, 0.004, 0.15, monX + 0.75 + jitter(pen + 1) * 0.012, 0.87, -0.30 + jitter(pen + 5) * 0.012,
        pen === 0 ? mat('rust', { color: 0x8a3a30 }) : mat('plasticDark'), 4);
    }
    cyl(g, 0.042, 0.038, 0.09, monX + 0.20, 0.825, 0.32, mat('ceramic'), 10);
    torus(g, 0.025, 0.006, monX + 0.255, 0.83, 0.32, mat('ceramic'), [0, PI / 2, 0], 4, 10, PI);

    return finish(g, true);
  }

  /* ===========================================================================
   * 15. 办公桌  desk(opts)  {w:1.4, d:0.7}
   * ======================================================================== */
  function desk(opts) {
    opts = opts || {};
    var w = Math.max(0.9, num(opts.w, 1.4));
    var d = Math.max(0.5, num(opts.d, 0.7));

    var g = makeGroup('desk', 'floor');
    var topMat = mat('wood', { color: 0x6a5a44 });
    var woodDark = mat('woodDark');
    var metal = mat('metalDark');
    var metalLight = mat('metalLight');

    // 桌面
    box(g, w, 0.042, d, 0, 0.751, 0, topMat);
    box(g, w, 0.022, 0.014, 0, 0.742, d / 2 + 0.002, woodDark);

    // 桌腿 + 脚垫
    var lx = w / 2 - 0.07, lz = d / 2 - 0.07;
    var legs = [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]];
    for (var i = 0; i < legs.length; i++) {
      rod(g, [legs[i][0], 0.06, legs[i][1]], [legs[i][0], 0.73, legs[i][1]], 0.019, metal, 8);
      cyl(g, 0.024, 0.026, 0.06, legs[i][0], 0.03, legs[i][1], mat('rubber'), 8);
    }

    // 背板
    box(g, w - 0.16, 0.42, 0.018, 0, 0.51, -d / 2 + 0.06, woodDark);
    // 横撑
    rod(g, [-lx, 0.16, -lz], [lx, 0.16, -lz], 0.012, metalLight, 6);

    // 右侧抽屉柜
    var px = w / 2 - 0.28;
    box(g, 0.44, 0.58, d - 0.14, px, 0.43, 0.01, topMat);
    for (var dr = 0; dr < 3; dr++) {
      var dy = 0.21 + dr * 0.18;
      box(g, 0.39, 0.155, 0.02, px, dy, d / 2 - 0.032, topMat);
      rod(g, [px - 0.11, dy, d / 2 - 0.012], [px + 0.11, dy, d / 2 - 0.012], 0.008, metalLight, 5);
      rod(g, [px - 0.11, dy, d / 2 - 0.022], [px - 0.11, dy, d / 2 - 0.012], 0.006, metalLight, 5);
      rod(g, [px + 0.11, dy, d / 2 - 0.022], [px + 0.11, dy, d / 2 - 0.012], 0.006, metalLight, 5);
    }

    // 穿线孔 + 划痕
    cyl(g, 0.035, 0.035, 0.006, 0.34, 0.773, -d / 2 + 0.14, mat('plasticDark'), 12);
    for (var sc = 0; sc < 4; sc++) {
      box(g, 0.12 + hash(sc + 2) * 0.2, 0.002, 0.004,
        -0.3 + hash(sc + 6) * 0.6, 0.7755, -0.1 + hash(sc + 9) * 0.3,
        woodDark, [0, hash(sc + 4) * 2.5, 0]);
    }

    return finish(g, true);
  }

  /* ===========================================================================
   * 16. 候诊椅  chair(opts)
   * ======================================================================== */
  function chair(opts) {
    var g = makeGroup('chair', 'floor');
    var shell = mat('plastic', { color: 0x93a6a1 });
    var shellDark = mat('plastic', { color: 0x7d908b });
    var metal = mat('metalDark');
    var chrome = mat('metalLight');

    // 座面
    var seat = box(g, 0.46, 0.035, 0.43, 0, 0.452, 0.01, shell, [-0.035, 0, 0]);
    rod(g, [-0.225, 0.44, 0.225], [0.225, 0.44, 0.225], 0.017, shell, 8);
    // 靠背
    box(g, 0.46, 0.40, 0.032, 0, 0.66, -0.215, shell, [-0.11, 0, 0]);
    box(g, 0.42, 0.28, 0.004, 0, 0.66, -0.198, shellDark, [-0.11, 0, 0]);
    // 靠背两侧竖框
    rod(g, [-0.215, 0.46, -0.19], [-0.215, 0.845, -0.255], 0.012, shell, 6);
    rod(g, [0.215, 0.46, -0.19], [0.215, 0.845, -0.255], 0.012, shell, 6);
    // 座面支撑
    rod(g, [-0.20, 0.42, 0.16], [-0.20, 0.42, -0.20], 0.012, chrome, 6);
    rod(g, [0.20, 0.42, 0.16], [0.20, 0.42, -0.20], 0.012, chrome, 6);

    // 四腿（前腿略外撇）
    var feet = [[-0.20, 0.17], [0.20, 0.17], [-0.19, -0.17], [0.19, -0.17]];
    for (var i = 0; i < feet.length; i++) {
      rod(g, [feet[i][0] * 0.82, 0.41, feet[i][1] * 0.82], [feet[i][0], 0.02, feet[i][1]], 0.012, metal, 6);
      cyl(g, 0.016, 0.018, 0.02, feet[i][0], 0.01, feet[i][1], mat('rubber'), 6);
    }
    // 横撑
    rod(g, [-0.19, 0.17, 0.14], [0.19, 0.17, 0.14], 0.010, chrome, 5);
    rod(g, [-0.18, 0.14, -0.14], [0.18, 0.14, -0.14], 0.010, chrome, 5);
    // 座面裂缝
    box(g, 0.10, 0.003, 0.006, 0.09, 0.471, 0.08, mat('plastic', { color: 0x6f817c }), [0, 0.3, 0]);

    return finish(g, false);
  }

  /* ===========================================================================
   * 17. 圆凳  stool(opts)
   * ======================================================================== */
  function stool(opts) {
    var g = makeGroup('stool', 'floor');
    var seatMat = mat('paintedCream', { color: 0xc8bda4 });
    var metal = mat('metalDark');
    var rubber = mat('rubber');

    cyl(g, 0.17, 0.165, 0.045, 0, 0.492, 0, seatMat, 20);
    torus(g, 0.17, 0.012, 0, 0.505, 0, seatMat, [PI / 2, 0, 0], 5, 20);
    // 四条外撇腿
    for (var i = 0; i < 4; i++) {
      var a = i * PI / 2 + PI / 4;
      var bx = Math.cos(a) * 0.215;
      var bz = Math.sin(a) * 0.215;
      rod(g, [Math.cos(a) * 0.075, 0.47, Math.sin(a) * 0.075], [bx, 0.02, bz], 0.013, metal, 6);
      cyl(g, 0.018, 0.020, 0.022, bx, 0.011, bz, rubber, 6);
    }
    // 脚踏圈
    torus(g, 0.155, 0.010, 0, 0.225, 0, metal, [PI / 2, 0, 0], 4, 18);
    // 座下加强环
    torus(g, 0.10, 0.008, 0, 0.455, 0, metal, [PI / 2, 0, 0], 4, 14);

    return finish(g, false);
  }

  /* ===========================================================================
   * 18. 病人监护仪  monitorStand(opts)  {on}
   * ======================================================================== */
  function monitorStand(opts) {
    opts = opts || {};
    var on = bool(opts.on, true);

    var g = makeGroup('monitorStand', 'floor');
    var steel = mat('stainless');
    var dark = mat('metalDark');
    var plastic = mat('plastic', { color: 0xb9beb8 });
    var plasticDark = mat('plasticDark');

    // 五爪底座
    for (var i = 0; i < 5; i++) {
      var a = i * PI * 2 / 5 + 0.15;
      var ex = Math.cos(a) * 0.29, ez = Math.sin(a) * 0.29;
      rod(g, [0, 0.10, 0], [ex, 0.10, ez], 0.016, dark, 6);
      cyl(g, 0.022, 0.026, 0.03, ex, 0.07, ez, dark, 6);
      sphere(g, 0.032, ex, 0.034, ez, mat('rubber'), 8);
    }
    cyl(g, 0.055, 0.06, 0.07, 0, 0.115, 0, dark, 10);

    // 主杆
    cyl(g, 0.019, 0.022, 1.30, 0, 0.79, 0, steel, 10);
    for (var c = 0; c < 3; c++) {
      cyl(g, 0.026, 0.026, 0.025, 0, 0.55 + c * 0.22, 0, dark, 8);
    }

    // 挂篮
    box(g, 0.22, 0.03, 0.14, 0, 0.62, 0.02, plasticDark);
    rod(g, [-0.11, 0.62, 0.09], [0.11, 0.62, 0.09], 0.006, steel, 5);
    rod(g, [-0.11, 0.72, 0.02], [-0.11, 0.62, 0.02], 0.006, steel, 5);
    rod(g, [0.11, 0.72, 0.02], [0.11, 0.62, 0.02], 0.006, steel, 5);

    // 显示器
    var head = new THREE.Group();
    head.position.set(0, 1.25, 0.04);
    head.rotation.x = -0.10;
    g.add(head);

    box(head, 0.38, 0.31, 0.055, 0, 0, 0, plastic);
    box(head, 0.355, 0.285, 0.02, 0, 0.01, 0.032, plasticDark);
    // 屏幕
    var scrTex = patientScreenTexture(on);
    var scrMat = screenMaterial(scrTex, on, 0xffffff);
    plane(head, 0.335, 0.238, 0, 0.015, 0.043, scrMat);
    // 按键
    for (var b = 0; b < 6; b++) {
      box(head, 0.035, 0.018, 0.012, -0.13 + b * 0.052, -0.135, 0.045, b === 0 ? mat('paintedGreen') : plasticDark);
    }
    // 顶部提手
    rod(head, [-0.09, 0.16, -0.01], [-0.09, 0.20, 0.01], 0.010, dark, 5);
    rod(head, [0.09, 0.16, -0.01], [0.09, 0.20, 0.01], 0.010, dark, 5);
    rod(head, [-0.09, 0.20, 0.01], [0.09, 0.20, 0.01], 0.012, dark, 6);
    // 侧面接口
    box(head, 0.02, 0.10, 0.03, 0.195, -0.03, 0.0, dark);
    // 背部挂架
    box(head, 0.06, 0.10, 0.05, 0, -0.02, -0.045, dark);

    // 线缆（背部垂到地面）
    tube(g, 'monitor.cable.a', [
      [0.02, 1.16, -0.03],
      [0.10, 0.95, -0.10],
      [0.07, 0.55, -0.06],
      [0.12, 0.22, 0.0],
      [0.18, 0.03, 0.05]
    ], 0.007, mat('plasticDark', { color: 0x1b1e1f }), 4, 26);
    tube(g, 'monitor.cable.b', [
      [-0.03, 1.16, -0.03],
      [-0.12, 0.90, -0.12],
      [-0.16, 0.45, -0.05],
      [-0.22, 0.06, 0.02]
    ], 0.005, mat('plasticDark', { color: 0x23282a }), 4, 22);
    // 接地夹
    box(g, 0.03, 0.02, 0.04, 0.18, 0.05, 0.06, mat('metalDark'));

    g.userData.on = on;
    g.userData.screenMat = scrMat;

    return finish(g, false);
  }

  /* ===========================================================================
   * 19. 不锈钢洗手池  sink(opts)
   * ======================================================================== */
  function sink(opts) {
    var g = makeGroup('sink', 'floor');
    var steel = mat('stainless');
    var steelDark = mat('metal', { color: 0x7a8387 });
    var dark = mat('metalDark');
    var rust = mat('rust');

    // 四腿（带横撑）
    var legs = [[-0.22, -0.17], [0.22, -0.17], [-0.22, 0.17], [0.22, 0.17]];
    for (var i = 0; i < legs.length; i++) {
      rod(g, [legs[i][0], 0.02, legs[i][1]], [legs[i][0], 0.80, legs[i][1]], 0.017, steel, 8);
      cyl(g, 0.024, 0.026, 0.02, legs[i][0], 0.01, legs[i][1], mat('rubber'), 6);
    }
    rod(g, [-0.22, 0.18, -0.17], [-0.22, 0.18, 0.17], 0.010, steel, 5);
    rod(g, [0.22, 0.18, -0.17], [0.22, 0.18, 0.17], 0.010, steel, 5);

    // 池体 + 台面
    box(g, 0.56, 0.22, 0.44, 0, 0.84, 0, steel);
    box(g, 0.60, 0.03, 0.48, 0, 0.955, 0, steel);
    // 池内凹槽（深色内壁 + 底）
    box(g, 0.48, 0.15, 0.36, 0, 0.90, 0, mat('metal', { color: 0x5f6a6e }));
    box(g, 0.48, 0.01, 0.36, 0, 0.83, 0, steelDark);
    // 排水口
    cyl(g, 0.035, 0.035, 0.012, 0, 0.837, 0, dark, 12);
    cyl(g, 0.014, 0.014, 0.05, 0, 0.80, 0, steelDark, 8);
    // 溢流孔
    cyl(g, 0.018, 0.018, 0.008, 0, 0.90, -0.185, dark, 8, [PI / 2, 0, 0]);

    // 挡水板
    box(g, 0.60, 0.20, 0.025, 0, 1.055, -0.225, steel);
    box(g, 0.60, 0.018, 0.05, 0, 1.155, -0.22, steelDark);

    // 鹅颈龙头（底座落在台面上）
    tube(g, 'sink.faucet', [
      [0.0, 0.97, -0.20],
      [0.0, 1.12, -0.20],
      [0.0, 1.18, -0.14],
      [0.0, 1.17, -0.06],
      [0.0, 1.11, -0.04]
    ], 0.014, steel, 8, 20);
    // 龙头底座 + 两个十字手柄
    cyl(g, 0.035, 0.04, 0.025, 0, 0.983, -0.20, dark, 10);
    for (var h = -1; h <= 1; h += 2) {
      cyl(g, 0.025, 0.025, 0.02, h * 0.16, 0.985, -0.20, dark, 8);
      rod(g, [h * 0.16, 0.987, -0.23], [h * 0.16, 0.987, -0.17], 0.007, steel, 6);
      rod(g, [h * 0.16 - 0.03, 0.987, -0.20], [h * 0.16 + 0.03, 0.987, -0.20], 0.007, steel, 6);
    }

    // 皂液器
    box(g, 0.07, 0.13, 0.055, 0.20, 1.09, -0.185, steel);
    rod(g, [0.20, 1.155, -0.185], [0.20, 1.20, -0.185], 0.008, steel, 5);
    rod(g, [0.20, 1.20, -0.185], [0.20, 1.20, -0.15], 0.008, steel, 5);

    // 锈迹与水渍
    box(g, 0.02, 0.06, 0.02, -0.222, 0.33, 0.17, rust);
    box(g, 0.05, 0.006, 0.03, 0.24, 0.956, 0.12, mat('rust', { color: 0x5b432c }));

    return finish(g, false);
  }

  /* ===========================================================================
   * 20. 太平间冰柜墙  morgueUnit(opts)  {cols:3, rows:3}
   *     2.4 x 2.0 x 0.65 m
   * ======================================================================== */
  function morgueUnit(opts) {
    opts = opts || {};
    var cols = Math.min(6, Math.max(1, Math.round(num(opts.cols, 3))));
    var rows = Math.min(4, Math.max(1, Math.round(num(opts.rows, 3))));

    var g = makeGroup('morgueUnit', 'floor');
    var w = 2.4, h = 2.0, d = 0.65;

    var steel = mat('stainless');
    var steelFace = mat('metal', { color: 0x8e989c });
    var dark = mat('metalDark');
    var bodyMat = mat('paintedWhite', { color: 0xb9c0bb });
    var rust = mat('rust');

    // 柜体深度 0.58，加把手总深约 0.62（0.65 规格含拉手）
    var bodyD = 0.58;
    var frontZ = bodyD / 2;

    // 底座与柜体
    box(g, w - 0.08, 0.10, bodyD - 0.06, 0, 0.05, 0, dark);
    box(g, w, h - 0.20, bodyD, 0, h / 2 - 0.01, 0, bodyMat);
    box(g, w, 0.06, bodyD, 0, h - 0.03, 0, steel);
    // 顶沿（严格控制在 2.0 m 总高内）
    box(g, w, 0.03, bodyD, 0, h - 0.015, 0, dark);

    // 抽屉面网格
    var gap = 0.014;
    var cellW = (w - 0.04) / cols;
    var cellH = (h - 0.20 - 0.05) / rows;
    var y0 = 0.10;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var x = -w / 2 + 0.02 + cellW * (c + 0.5);
        var y = y0 + cellH * (r + 0.5);
        var fw = cellW - gap;
        var fh = cellH - gap;
        var face = box(g, fw, fh, 0.03, x, y, frontZ + 0.008, steelFace);

        // 抽屉面板的折边
        box(g, fw, 0.012, 0.036, x, y + fh / 2 - 0.006, frontZ + 0.024, steel);
        box(g, fw, 0.012, 0.036, x, y - fh / 2 + 0.006, frontZ + 0.024, steel);

        // 把手：横杆 + 两个支脚
        var hz = frontZ + 0.055;
        var hy = y + fh * 0.22;
        var half = Math.min(0.16, fw * 0.34);
        rod(g, [x - half, hy, hz], [x + half, hy, hz], 0.011, steel, 6);
        rod(g, [x - half, hy, hz], [x - half, hy, frontZ], 0.008, steel, 5);
        rod(g, [x + half, hy, hz], [x + half, hy, frontZ], 0.008, steel, 5);
        // 有一个把手是歪的
        if (r === 1 && c === cols - 1) {
          face.rotation.z = 0.006;
        }

        // 标签牌 + 编号
        var code = String.fromCharCode(65 + (r % 4)) + '-' + (r * cols + c + 1);
        var ltex = plateTexture(code, 'PATHOLOGY', '#dfe3dc', '#20302a', 0.14, 0.055);
        plane(g, 0.14, 0.055, x, y - fh * 0.20, frontZ + 0.040, mapMat('paper', ltex));
        // 锁孔
        cyl(g, 0.009, 0.009, 0.012, x + fw * 0.38, y - fh * 0.20, frontZ + 0.035, dark, 6, [PI / 2, 0, 0]);
      }
    }

    // （分缝条删除：它与抽屉面板相交，是闪烁源）

    // 面板上的小温度表（放正面，避免超出 2.0 m 总高）
    cyl(g, 0.040, 0.040, 0.018, -w / 2 + 0.18, h - 0.14, frontZ + 0.009, steel, 14, [PI / 2, 0, 0]);
    plane(g, 0.050, 0.014, -w / 2 + 0.18, h - 0.14, frontZ + 0.019, mat('paper', { color: 0xd8ded8 }));

    // 底部锈水痕（底座与面板下缘）
    box(g, 0.26, 0.08, 0.004, -0.52, 0.06, bodyD / 2 - 0.031, rust);
    box(g, 0.06, 0.20, 0.004, 0.86, 0.19, frontZ + 0.003, rust);
    box(g, 0.04, 0.05, 0.004, -1.10, 0.055, bodyD / 2 - 0.031, rust);

    return finish(g, true);
  }

  /* ===========================================================================
   * 21. 吊顶灯  ceilingLight(opts)  {kind:'fluorescent'}
   *     userData.tubes / userData.tubeMat 供闪烁控制
   * ======================================================================== */
  function ceilingLight(opts) {
    opts = opts || {};
    var kind = pick(opts.kind, ['fluorescent', 'panel'], 'fluorescent');

    var g = makeGroup('ceilingLight', 'ceiling');
    var housingMat = mat('paintedWhite');
    var metalMat = mat('metalLight');
    var darkMat = mat('metalDark');
    var plasticDark = mat('plasticDark');
    var rustMat = mat('rust');

    // 每盏灯独立材质，才能单独闪烁
    var tubeMat = uniqueMat('emissiveWhite', {
      color: 0xfff7e6, emissive: 0xfff1cf, emissiveIntensity: 1.15, roughness: 0.35
    });
    var tubes = [];

    if (kind === 'panel') {
      // —— LED 平板灯 ——
      box(g, 1.22, 0.05, 0.34, 0, 0.095, 0, housingMat);
      box(g, 1.20, 0.02, 0.32, 0, 0.062, 0, metalMat);
      var diff = plane(g, 1.14, 0.26, 0, 0.022, 0, tubeMat, [PI / 2, 0, 0]);
      tubes.push(diff);
      // 四周压框
      box(g, 1.22, 0.02, 0.03, 0, 0.03, 0.165, housingMat);
      box(g, 1.22, 0.02, 0.03, 0, 0.03, -0.165, housingMat);
      box(g, 0.03, 0.02, 0.30, 0.595, 0.03, 0, housingMat);
      box(g, 0.03, 0.02, 0.30, -0.595, 0.03, 0, housingMat);
      // 吊装螺栓
      box(g, 0.08, 0.012, 0.08, 0.35, 0.126, 0, metalMat);
      box(g, 0.08, 0.012, 0.08, -0.35, 0.126, 0, metalMat);
    } else {
      // —— 双管荧光灯盘 ——
      box(g, 1.18, 0.02, 0.28, 0, 0.086, 0, metalMat);                    // 反光底板
      box(g, 1.18, 0.055, 0.012, 0, 0.055, 0.14, housingMat);             // 侧壁
      box(g, 1.18, 0.055, 0.012, 0, 0.055, -0.14, housingMat);
      box(g, 0.05, 0.10, 0.30, 0.585, 0.075, 0, housingMat);              // 端盖
      box(g, 0.05, 0.10, 0.30, -0.585, 0.075, 0, housingMat);
      box(g, 1.22, 0.035, 0.32, 0, 0.112, 0, housingMat);                 // 顶壳

      for (var t = -1; t <= 1; t += 2) {
        var tube = cyl(g, 0.016, 0.016, 1.10, 0, 0.036, t * 0.07, tubeMat, 10, [0, 0, PI / 2]);
        tubes.push(tube);
        // 灯脚
        cyl(g, 0.021, 0.021, 0.045, 0.572, 0.036, t * 0.07, plasticDark, 7, [0, 0, PI / 2]);
        cyl(g, 0.021, 0.021, 0.045, -0.572, 0.036, t * 0.07, plasticDark, 7, [0, 0, PI / 2]);
      }
      // 固定吊码
      box(g, 0.07, 0.012, 0.07, 0.40, 0.135, 0, metalMat);
      box(g, 0.07, 0.012, 0.07, -0.40, 0.135, 0, metalMat);
      // 灯盘上的锈斑与积尘
      box(g, 0.06, 0.008, 0.03, 0.16, 0.147, 0.06, rustMat);
      box(g, 0.03, 0.004, 0.02, -0.48, 0.095, -0.05, rustMat);
    }

    g.userData.tubes = tubes;
    g.userData.tubeMat = tubeMat;
    g.userData.kind = kind;

    return finish(g, false);
  }

  /* ===========================================================================
   * 22. 墙灯 / 应急灯  wallLight(opts)  {kind:'emergency'}
   * ======================================================================== */
  function wallLight(opts) {
    opts = opts || {};
    var kind = pick(opts.kind, ['emergency', 'night'], 'emergency');

    var g = makeGroup('wallLight', 'wall');
    var bodyMat = mat('paintedCream');
    var metalMat = mat('metalDark');
    var lensMat = uniqueMat(kind === 'emergency' ? 'emissiveRed' : 'emissiveWhite', {
      color: kind === 'emergency' ? 0x5a100c : 0xf0e7cc,
      emissive: kind === 'emergency' ? 0xff2a1e : 0xffd9a0,
      emissiveIntensity: kind === 'emergency' ? 1.15 : 0.38,
      roughness: 0.32
    });

    // 背板 + 灯体
    box(g, 0.30, 0.20, 0.02, 0, 0.10, 0.01, bodyMat);
    box(g, 0.26, 0.13, 0.10, 0, 0.10, 0.07, bodyMat);
    // 红色灯罩
    box(g, 0.18, 0.075, 0.015, 0, 0.10, 0.124, lensMat);
    // 顶部遮光檐
    box(g, 0.30, 0.02, 0.14, 0, 0.176, 0.075, bodyMat);
    // 金属护罩
    for (var i = -1; i <= 1; i++) {
      rod(g, [i * 0.072, 0.055, 0.138], [i * 0.072, 0.145, 0.138], 0.004, metalMat, 4);
    }
    rod(g, [-0.10, 0.138, 0.138], [0.10, 0.138, 0.138], 0.004, metalMat, 4);
    // 底部线管
    cyl(g, 0.012, 0.012, 0.05, 0.09, 0.025, 0.02, metalMat, 6);
    // 侧面的检修螺丝
    screw(g, 0.115, 0.155, 0.135, 0.005);
    screw(g, -0.115, 0.155, 0.135, 0.005);

    g.userData.lensMat = lensMat;
    g.userData.kind = kind;

    return finish(g, false);
  }

  /* ===========================================================================
   * 23. 天花板通风口  ceilingVent(opts)
   * ======================================================================== */
  function ceilingVent(opts) {
    var g = makeGroup('ceilingVent', 'ceiling');
    var frameMat = mat('paintedWhite');
    var bladeMat = mat('metalLight');
    var darkMat = mat('metalDark');
    var rustMat = mat('rust');

    // 外框
    box(g, 0.60, 0.03, 0.04, 0, 0.015, 0.28, frameMat);
    box(g, 0.60, 0.03, 0.04, 0, 0.015, -0.28, frameMat);
    box(g, 0.04, 0.03, 0.52, 0.28, 0.015, 0, frameMat);
    box(g, 0.04, 0.03, 0.52, -0.28, 0.015, 0, frameMat);
    // 百叶
    for (var i = 0; i < 6; i++) {
      var z = -0.22 + i * 0.088;
      box(g, 0.52, 0.006, 0.055, 0, 0.018, z, bladeMat, [0.55, 0, 0]);
    }
    // 上部风管
    box(g, 0.50, 0.09, 0.50, 0, 0.075, 0, darkMat);
    box(g, 0.54, 0.012, 0.54, 0, 0.033, 0, frameMat);
    // 固定螺丝
    screw(g, 0.245, 0.031, 0.245, 0.005, 'y');
    screw(g, -0.245, 0.031, 0.245, 0.005, 'y');
    screw(g, 0.245, 0.031, -0.245, 0.005, 'y');
    screw(g, -0.245, 0.031, -0.245, 0.005, 'y');
    // 锈迹
    box(g, 0.07, 0.004, 0.025, -0.10, 0.031, 0.26, rustMat);

    return finish(g, false);
  }

  /* ===========================================================================
   * 24. 隔帘轨道  curtainRail(opts)  {w:1.8}
   * ======================================================================== */
  function curtainRail(opts) {
    opts = opts || {};
    var w = Math.max(0.6, num(opts.w, 1.8));

    var g = makeGroup('curtainRail', 'ceiling');
    var metal = mat('metalLight');
    var dark = mat('metalDark');

    // 轨道
    box(g, w, 0.04, 0.05, 0, 0.072, 0, metal);
    box(g, w, 0.008, 0.048, 0, 0.05, 0, dark);
    box(g, 0.03, 0.05, 0.06, w / 2, 0.072, 0, metal);
    box(g, 0.03, 0.05, 0.06, -w / 2, 0.072, 0, metal);

    // 吊架
    var bx = [-w / 2 + 0.14, 0, w / 2 - 0.14];
    for (var i = 0; i < bx.length; i++) {
      rod(g, [bx[i], 0.092, 0], [bx[i], 0.198, 0], 0.008, metal, 5);
      box(g, 0.075, 0.012, 0.075, bx[i], 0.206, 0, metal);
      screw(g, bx[i], 0.213, 0, 0.006, 'y');
    }

    // 挂钩环
    var n = Math.max(4, Math.round(w / 0.22));
    for (var r = 0; r < n; r++) {
      var x = -w / 2 + 0.10 + r * ((w - 0.20) / Math.max(1, n - 1));
      torus(g, 0.018, 0.004, x, 0.044, 0, metal, [0, PI / 2, 0], 4, 8);
    }

    return finish(g, false);
  }

  /* ===========================================================================
   * 25. 病床隔帘  curtain(opts)  {w:1.8, h:2.0, color:'#8ba7a0', halfOpen:false}
   * ======================================================================== */
  function curtain(opts) {
    opts = opts || {};
    var w = Math.max(0.4, num(opts.w, 1.8));
    var h = Math.max(0.4, num(opts.h, 2.0));
    var color = typeof opts.color === 'string' ? opts.color : '#8ba7a0';
    var halfOpen = bool(opts.halfOpen, false);

    var g = makeGroup('curtain', 'floor');
    var clothW = halfOpen ? w * 0.58 : w;
    var clothH = Math.max(0.2, h - 0.02);

    var cloth = mat('fabricWhite', {
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
      roughness: 1.0,
      metalness: 0.0
    });

    // 褶皱帘布（顶点位移，兼顾褶皱与轻微不规则）
    function curtainGeo() {
      var folds = Math.max(6, Math.round(clothW * (halfOpen ? 16 : 10)));
      var key = 'curtain|' + r3(clothW) + '|' + r3(clothH) + '|' + (halfOpen ? 1 : 0);
      return cachedGeo(key, function () {
        var segX = Math.min(64, Math.max(16, folds * 4));
        var geo = new THREE.PlaneGeometry(clothW, clothH, segX, 6);
        var pos = geo.attributes.position;
        for (var i = 0; i < pos.count; i++) {
          var x = pos.getX(i);
          var y = pos.getY(i);
          var t = x / clothW + 0.5;
          var up = y / clothH + 0.5;         // 0 底，1 顶
          var wave = Math.sin(t * PI * 2 * folds) * (halfOpen ? 0.055 : 0.042);
          var amp = 0.5 + 0.5 * up;          // 顶部褶更明显
          var z = wave * amp + Math.sin(t * 33.0 + up * 2.4) * 0.004;
          pos.setZ(i, z);
        }
        geo.computeVertexNormals();
        return geo;
      });
    }

    var mesh = new THREE.Mesh(curtainGeo(), cloth);
    mesh.position.set(0, clothH / 2, 0);
    g.add(mesh);

    // 上/下包边
    box(g, clothW, 0.035, 0.022, 0, h - 0.02, 0, cloth);
    box(g, clothW, 0.018, 0.012, 0, 0.012, 0, cloth);

    // 顶部挂环
    var rings = Math.max(4, Math.round(clothW / 0.20));
    for (var i = 0; i < rings; i++) {
      var x = -clothW / 2 + 0.06 + i * ((clothW - 0.12) / Math.max(1, rings - 1));
      torus(g, 0.017, 0.0045, x, h - 0.017, 0, mat('metalLight'), [0, PI / 2, 0], 4, 8);
    }

    // 收拢时的系带
    if (halfOpen) {
      box(g, 0.03, 0.05, 0.14, 0, h * 0.58, 0, cloth);
      box(g, 0.012, 0.22, 0.012, 0, h * 0.58 - 0.11, 0.055, cloth, [0.2, 0, 0]);
    }

    return finish(g, false);
  }

  /* ===========================================================================
   * 26. 地下室吊顶管道  pipes(opts)  {length:6, axis:'x'}
   * ======================================================================== */
  function pipes(opts) {
    opts = opts || {};
    var L = Math.max(1.0, num(opts.length, 6));
    var axis = pick(opts.axis, ['x', 'z'], 'x');

    var g = makeGroup('pipes', 'ceiling');
    var steel = mat('metal', { color: 0x6f777a });
    var steel2 = mat('metal', { color: 0x8a8170 });
    var dark = mat('metalDark');
    var rust = mat('rust');

    // 局部坐标：a=沿管道方向，b=高度，c=横向
    function P(a, b, c) {
      return axis === 'x' ? [a, b, c] : [c, b, a];
    }

    var defs = [
      { y: 0.046, z: -0.085, r: 0.045, mat: steel, len: L },
      { y: 0.042, z: 0.105, r: 0.032, mat: steel2, len: L },
      { y: 0.155, z: -0.015, r: 0.022, mat: dark, len: L * 0.92 },
      { y: 0.232, z: 0.06, r: 0.016, mat: mat('metal', { color: 0x7f6f5a }), len: L * 0.86 }
    ];

    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      rod(g, P(-d.len / 2, d.y, d.z), P(d.len / 2, d.y, d.z), d.r, d.mat, 12);
      // 端部法兰
      for (var e = -1; e <= 1; e += 2) {
        cyl(g, d.r * 1.45, d.r * 1.45, 0.035, P(e * d.len / 2, d.y, d.z)[0],
          P(e * d.len / 2, d.y, d.z)[1], P(e * d.len / 2, d.y, d.z)[2],
          dark, 12, axisRot(axis));
      }
      // 中部法兰 / 接头
      var fl = P(0, d.y, d.z);
      cyl(g, d.r * 1.35, d.r * 1.35, 0.03, fl[0], fl[1], fl[2], dark, 12, axisRot(axis));
      // 锈迹（贴在管壁上）
      var rp = P(L * 0.22, d.y + d.r * 0.6, d.z + d.r * 0.7);
      if (axis === 'x') {
        box(g, d.r * 1.4, d.r * 0.5, 0.012, rp[0], rp[1], rp[2], rust);
      } else {
        box(g, 0.012, d.r * 0.5, d.r * 1.4, rp[0], rp[1], rp[2], rust);
      }
    }

    // 吊架（每 1.5 m 一组）
    var count = Math.max(2, Math.round(L / 1.5) + 1);
    for (var k = 0; k < count; k++) {
      var a = -L / 2 + 0.15 + k * ((L - 0.30) / Math.max(1, count - 1));
      var top = P(a, 0.34, -0.01);
      var mid = P(a, 0.046, -0.085);
      rod(g, [top[0], top[1], top[2]], [mid[0], mid[1] + 0.045, mid[2]], 0.010, dark, 5);
      // 天花板固定板
      var plate = P(a, 0.345, -0.01);
      box(g, 0.09, 0.012, 0.09, plate[0], plate[1], plate[2], dark);
      // 管卡
      var cl = P(a, 0.046, -0.085);
      if (axis === 'x') {
        box(g, 0.06, 0.012, 0.16, cl[0], cl[1] + 0.05, cl[2], dark);
      } else {
        box(g, 0.16, 0.012, 0.06, cl[0], cl[1] + 0.05, cl[2], dark);
      }
      // 横担，托住另外两根小管
      var bar = P(a, 0.20, 0.02);
      if (axis === 'x') {
        box(g, 0.04, 0.012, 0.28, bar[0], bar[1], bar[2], dark);
      } else {
        box(g, 0.28, 0.012, 0.04, bar[0], bar[1], bar[2], dark);
      }
    }

    // 阀门（小手轮）
    var vp = P(L * 0.18, 0.155, -0.015);
    cyl(g, 0.018, 0.018, 0.13, vp[0], vp[1] + 0.065, vp[2], dark, 8);
    torus(g, 0.075, 0.008, vp[0], vp[1] + 0.13, vp[2], mat('rust', { color: 0x7e3328 }), [PI / 2, 0, 0], 5, 14);
    rod(g, [vp[0] - 0.07, vp[1] + 0.13, vp[2]], [vp[0] + 0.07, vp[1] + 0.13, vp[2]], 0.006, dark, 5);
    rod(g, [vp[0], vp[1] + 0.13, vp[2] - 0.07], [vp[0], vp[1] + 0.13, vp[2] + 0.07], 0.006, dark, 5);

    g.userData.axis = axis;
    g.userData.length = L;

    return finish(g, true);
  }

  /* ===========================================================================
   * 27. 医疗垃圾桶  trashBin(opts)
   * ======================================================================== */
  function trashBin(opts) {
    var g = makeGroup('trashBin', 'floor');
    var steel = mat('stainless');
    var dark = mat('metalDark');
    var lidMat = mat('plastic', { color: 0x7c2a25 });
    var bagMat = mat('plastic', { color: 0xa5332c, roughness: 0.6 });

    // 桶身
    cyl(g, 0.145, 0.152, 0.50, 0, 0.28, 0, steel, 18);
    // 底部加强圈 + 脚
    cyl(g, 0.150, 0.150, 0.025, 0, 0.045, 0, dark, 18);
    for (var i = 0; i < 3; i++) {
      var a = i * PI * 2 / 3 + 0.4;
      cyl(g, 0.018, 0.018, 0.02, Math.cos(a) * 0.10, 0.012, Math.sin(a) * 0.10, mat('rubber'), 6);
    }
    // 桶内红色垃圾袋口
    cyl(g, 0.138, 0.138, 0.03, 0, 0.548, 0, bagMat, 16);
    // 桶盖
    var lid = cyl(g, 0.158, 0.152, 0.032, 0, 0.565, 0, lidMat, 18);
    lid.rotation.x = 0.03;
    torus(g, 0.150, 0.010, 0, 0.548, 0, steel, [PI / 2, 0, 0], 5, 18);
    // 盖上的提手
    rod(g, [-0.04, 0.585, 0], [0.04, 0.585, 0], 0.008, dark, 5);
    // 脚踏板与连杆
    box(g, 0.07, 0.018, 0.14, 0, 0.02, 0.155, dark);
    rod(g, [0.0, 0.03, 0.155], [-0.0, 0.24, 0.135], 0.008, dark, 5);
    rod(g, [0.0, 0.24, 0.135], [0.0, 0.555, 0.155], 0.007, dark, 5);
    // 医疗废物标签
    var btex = biohazardTexture();
    plane(g, 0.15, 0.15, 0, 0.33, 0.152, mapMat('paper', btex));
    // 侧面擦痕
    box(g, 0.02, 0.13, 0.004, 0.135, 0.22, 0.05, mat('rust', { color: 0x5b4a3a }));

    return finish(g, false);
  }

  /* ===========================================================================
   * 28. 医疗推车  medicalCart(opts)
   * ======================================================================== */
  function medicalCart(opts) {
    var g = makeGroup('medicalCart', 'floor');
    var steel = mat('stainless');
    var dark = mat('metalDark');
    var plastic = mat('plastic', { color: 0xcfd4cd });
    var plasticDark = mat('plasticDark');

    // 脚轮
    addCaster(g, -0.24, -0.16, 0.04);
    addCaster(g, 0.24, -0.16, 0.04);
    addCaster(g, -0.24, 0.16, 0.04);
    addCaster(g, 0.24, 0.16, 0.04);

    // 四立柱
    var px = 0.27, pz = 0.19;
    var posts = [[-px, -pz], [px, -pz], [-px, pz], [px, pz]];
    for (var i = 0; i < posts.length; i++) {
      rod(g, [posts[i][0], 0.10, posts[i][1]], [posts[i][0], 0.88, posts[i][1]], 0.014, steel, 8);
    }

    // 两层搁板（带围边）
    for (var s = 0; s < 2; s++) {
      var y = 0.30 + s * 0.44;
      box(g, 0.58, 0.018, 0.42, 0, y, 0, steel);
      box(g, 0.58, 0.03, 0.012, 0, y + 0.022, 0.21, steel);
      box(g, 0.58, 0.03, 0.012, 0, y + 0.022, -0.21, steel);
      box(g, 0.012, 0.03, 0.42, 0.29, y + 0.022, 0, steel);
      box(g, 0.012, 0.03, 0.42, -0.29, y + 0.022, 0, steel);
      // 搁板下的加强折边
      box(g, 0.56, 0.02, 0.02, 0, y - 0.018, 0, dark);
    }

    // 上层抽屉（悬在搁板下方，避免与台面物品穿插）
    box(g, 0.52, 0.11, 0.34, 0, 0.66, -0.02, plastic);
    box(g, 0.50, 0.09, 0.02, 0, 0.66, 0.155, plasticDark);
    rod(g, [-0.14, 0.66, 0.172], [0.14, 0.66, 0.172], 0.008, steel, 5);

    // 推手（后侧）
    rod(g, [-0.25, 0.88, -0.20], [-0.25, 0.95, -0.27], 0.013, steel, 6);
    rod(g, [0.25, 0.88, -0.20], [0.25, 0.95, -0.27], 0.013, steel, 6);
    rod(g, [-0.27, 0.95, -0.27], [0.27, 0.95, -0.27], 0.014, steel, 6);
    cyl(g, 0.018, 0.018, 0.34, 0, 0.95, -0.27, mat('rubber'), 8, [0, 0, PI / 2]);

    // 药瓶 / 托盘 / 纱布
    var bottleColors = [0xc8d3c4, 0xd9cdb3, 0xa9bbc6];
    for (var b = 0; b < 6; b++) {
      var bx = -0.16 + (b % 3) * 0.11;
      var bz = -0.10 + Math.floor(b / 3) * 0.12;
      cyl(g, 0.022, 0.022, 0.10, bx, 0.365, bz, mat('plastic', { color: bottleColors[b % 3] }), 8);
      cyl(g, 0.012, 0.012, 0.022, bx, 0.426, bz, plasticDark, 6);
    }
    box(g, 0.16, 0.028, 0.12, 0.16, 0.322, 0.02, plastic);
    box(g, 0.14, 0.02, 0.10, 0.16, 0.346, 0.02, mat('fabricWhite'));
    for (var r = 0; r < 3; r++) {
      cyl(g, 0.03, 0.03, 0.055, -0.16 + r * 0.055, 0.779, -0.10, mat('fabricWhite'), 8, [PI / 2, 0, 0]);
    }
    // 侧面挂篮
    box(g, 0.10, 0.16, 0.10, 0.325, 0.60, 0.02, plastic);
    // 锈点
    box(g, 0.015, 0.03, 0.02, -0.27, 0.14, -0.19, mat('rust'));

    return finish(g, true);
  }

  /* ===========================================================================
   * 29. 灭火器  fireExtinguisher(opts)  （壁挂，背面贴墙 z=0）
   * ======================================================================== */
  function fireExtinguisher(opts) {
    var g = makeGroup('fireExtinguisher', 'wall');
    var red = mat('plastic', { color: 0x962f27, metalness: 0.35, roughness: 0.38 });
    var dark = mat('metalDark');
    var steel = mat('metalLight');
    var paperMat = mat('paper');

    // 壁挂背板 + 抱箍
    box(g, 0.15, 0.34, 0.012, 0, 0.36, 0.006, dark);
    box(g, 0.10, 0.02, 0.05, 0, 0.30, 0.036, dark);
    box(g, 0.10, 0.02, 0.05, 0, 0.46, 0.036, dark);
    torus(g, 0.085, 0.010, 0, 0.30, 0.075, steel, [PI / 2, 0, 0], 4, 14, PI);
    torus(g, 0.085, 0.010, 0, 0.46, 0.075, steel, [PI / 2, 0, 0], 4, 14, PI);

    // 瓶体：圆筒 + 半球底
    cyl(g, 0.075, 0.075, 0.34, 0, 0.37, 0.075, red, 16);
    sphere(g, 0.075, 0, 0.20, 0.075, red, 14, [1, 0.55, 1]);
    cyl(g, 0.045, 0.045, 0.025, 0, 0.545, 0.075, dark, 12);
    // 瓶颈 / 阀门 / 压把
    cyl(g, 0.028, 0.028, 0.06, 0, 0.575, 0.075, dark, 10);
    box(g, 0.07, 0.05, 0.05, 0.005, 0.615, 0.075, dark);
    box(g, 0.15, 0.014, 0.024, 0.01, 0.642, 0.075, dark, [0, 0, -0.05]);
    box(g, 0.13, 0.012, 0.020, 0.0, 0.626, 0.075, steel, [0, 0, -0.12]);
    // 保险销 + 铅封
    rod(g, [-0.045, 0.628, 0.075], [-0.045, 0.596, 0.075], 0.004, steel, 5);
    torus(g, 0.012, 0.003, -0.045, 0.646, 0.075, mat('rust', { color: 0x9a7a2c }), [0, PI / 2, 0], 4, 8);
    // 压力表
    cyl(g, 0.019, 0.019, 0.016, 0.048, 0.605, 0.075, steel, 10, [0, 0, PI / 2]);
    circle(g, 0.015, 0.058, 0.605, 0.075, mat('paper', { color: 0xd9dcc9 }), [0, PI / 2, 0], 10);
    // 喷管
    tube(g, 'extinguisher.hose', [
      [0.045, 0.60, 0.075],
      [0.10, 0.57, 0.075],
      [0.115, 0.47, 0.078],
      [0.10, 0.38, 0.082],
      [0.075, 0.34, 0.086]
    ], 0.009, mat('rubber'), 5, 16);
    // 喇叭口
    cyl(g, 0.022, 0.014, 0.05, 0.075, 0.315, 0.086, dark, 8);
    // 标签
    var ltex = plateTexture('灭火器', 'FIRE', '#e6e3d6', '#7d211a', 0.09, 0.15);
    plane(g, 0.09, 0.15, 0, 0.36, 0.151, mapMat('paper', ltex));

    return finish(g, false);
  }

  /* ===========================================================================
   * 30. 挂钟  clock(opts)  （壁挂，静止在 2:37）
   * ======================================================================== */
  function clock(opts) {
    var g = makeGroup('clock', 'wall');
    var steel = mat('metalDark');
    var dark = mat('metalDark');
    var red = mat('rust', { color: 0x9e3228 });

    // 背板 + 表壳
    cyl(g, 0.156, 0.156, 0.012, 0, 0.16, 0.006, dark, 20, [PI / 2, 0, 0]);
    cyl(g, 0.16, 0.16, 0.055, 0, 0.16, 0.04, steel, 24, [PI / 2, 0, 0]);
    // 表圈
    torus(g, 0.158, 0.010, 0, 0.16, 0.068, mat('metalLight'), [0, 0, 0], 5, 24);

    // 表盘
    var faceTex = clockFaceTexture();
    var faceMat = mapMat('paper', faceTex, { roughness: 0.62 });
    circle(g, 0.148, 0, 0.16, 0.069, faceMat, null, 28);
    // 玻璃（在指针之前，指针位于玻璃内侧）
    circle(g, 0.150, 0, 0.16, 0.079, mat('glass'), null, 24);

    // 指针（2:37）
    var hourAng = ((2 + 37 / 60) / 12) * PI * 2;
    var minAng = (37 / 60) * PI * 2;
    var secAng = (12 / 60) * PI * 2;

    var hour = new THREE.Group();
    hour.position.set(0, 0.16, 0.0715);
    hour.rotation.z = -hourAng;
    g.add(hour);
    box(hour, 0.012, 0.075, 0.004, 0, 0.036, 0, dark);

    var minute = new THREE.Group();
    minute.position.set(0, 0.16, 0.0735);
    minute.rotation.z = -minAng;
    g.add(minute);
    box(minute, 0.008, 0.116, 0.003, 0, 0.056, 0, dark);

    var second = new THREE.Group();
    second.position.set(0, 0.16, 0.0755);
    second.rotation.z = -secAng;
    g.add(second);
    box(second, 0.003, 0.125, 0.002, 0, 0.058, 0, red);

    cyl(g, 0.010, 0.010, 0.004, 0, 0.16, 0.077, mat('metalLight'), 8, [PI / 2, 0, 0]);

    // 悬挂螺钉
    screw(g, 0, 0.325, 0.004, 0.006);

    return finish(g, false);
  }

  /* ===========================================================================
   * 31. 墙上老式电话  phone(opts)  （背面贴墙 z=0）
   * ======================================================================== */
  function phone(opts) {
    var g = makeGroup('phone', 'wall');
    var body = mat('plastic', { color: 0x2a2f2c, roughness: 0.48 });
    var dark = mat('plasticDark');
    var steel = mat('metalLight');
    var cordMat = mat('plasticDark', { color: 0x191c1a });

    // 背板
    box(g, 0.20, 0.30, 0.014, 0, 0.15, 0.007, body);
    // 机体
    box(g, 0.20, 0.21, 0.10, 0, 0.135, 0.064, body);
    box(g, 0.21, 0.012, 0.11, 0, 0.043, 0.064, dark);
    // 拨号盘
    var dialTex = phoneDialTexture();
    cyl(g, 0.064, 0.064, 0.012, 0, 0.125, 0.112, dark, 24, [PI / 2, 0, 0]);
    circle(g, 0.062, 0, 0.125, 0.119, mapMat('plasticDark', dialTex), null, 24);
    // 指挡
    box(g, 0.012, 0.02, 0.018, 0.052, 0.155, 0.125, steel);
    // 听筒（搁在顶部叉簧上）
    box(g, 0.055, 0.06, 0.06, -0.077, 0.268, 0.09, body);
    box(g, 0.055, 0.06, 0.06, 0.077, 0.268, 0.09, body);
    box(g, 0.10, 0.028, 0.045, 0, 0.272, 0.09, body);
    // 叉簧
    box(g, 0.018, 0.022, 0.035, -0.06, 0.238, 0.09, dark);
    box(g, 0.018, 0.022, 0.035, 0.06, 0.238, 0.09, dark);
    // 螺旋听筒线（挂在机体右侧）
    var pts = [];
    for (var i = 0; i <= 30; i++) {
      var t = i / 30;
      var ang = t * PI * 2 * 4.0;
      pts.push([0.112 + Math.cos(ang) * 0.011, 0.255 - t * 0.135, 0.10 + Math.sin(ang) * 0.011]);
    }
    tube(g, 'phone.cord', pts, 0.0045, cordMat, 4, 40);
    // 号码卡
    var ctex = plateTexture('东翼 217', '', '#e6e0cc', '#2b2c28', 0.075, 0.035);
    plane(g, 0.075, 0.035, 0, 0.212, 0.118, mapMat('paper', ctex));
    // 挂墙螺钉
    screw(g, -0.075, 0.275, 0.016, 0.005);
    screw(g, 0.075, 0.275, 0.016, 0.005);

    return finish(g, false);
  }

  /* ===========================================================================
   * 32. 枯死绿植  plant(opts)
   * ======================================================================== */
  function plant(opts) {
    var g = makeGroup('plant', 'floor');
    var potMat = mat('ceramic', { color: 0x8a6247, roughness: 0.85 });
    var soilMat = mat('woodDark', { color: 0x2e241c });
    var stemMat = mat('woodDark', { color: 0x5b4632, roughness: 0.95 });
    var leafMat = mat('fabricGreen', {
      color: 0x686b45, side: THREE.DoubleSide, roughness: 1.0
    });
    var deadLeafMat = mat('fabricGreen', {
      color: 0x6f5a3b, side: THREE.DoubleSide, roughness: 1.0
    });

    // 花盆
    cyl(g, 0.13, 0.10, 0.26, 0, 0.13, 0, potMat, 16);
    cyl(g, 0.135, 0.135, 0.025, 0, 0.265, 0, potMat, 16);
    cyl(g, 0.118, 0.118, 0.02, 0, 0.272, 0, soilMat, 14);
    // 盆底碟
    cyl(g, 0.145, 0.14, 0.012, 0, 0.006, 0, potMat, 16);

    // 主干 + 分枝
    var trunkTop = 0.55;
    rod(g, [0, 0.27, 0], [0.015, trunkTop, 0.01], 0.014, stemMat, 6);
    var branches = [
      [0.015, 0.50, 0.01, -0.14, 0.72, 0.06],
      [0.01, 0.44, 0.0, 0.16, 0.66, -0.04],
      [0.012, 0.48, 0.0, -0.05, 0.80, -0.12],
      [0.0, 0.38, 0.0, 0.10, 0.56, 0.14],
      [0.01, 0.52, 0.0, 0.02, 0.88, 0.04]
    ];
    for (var b = 0; b < branches.length; b++) {
      var br = branches[b];
      rod(g, [br[0], br[1], br[2]], [br[3], br[4], br[5]], 0.007, stemMat, 5);
      // 末端细枝
      rod(g, [br[3], br[4], br[5]],
        [br[3] + (br[3] > 0 ? 0.09 : -0.09), br[4] + 0.10, br[5] + 0.04],
        0.004, stemMat, 4);

      // 枯叶
      for (var l = 0; l < 3; l++) {
        var seed = b * 7 + l * 3 + 1;
        var lx = br[3] + jitter(seed) * 0.11;
        var ly = br[4] - 0.02 + jitter(seed + 1) * 0.10;
        var lz = br[5] + jitter(seed + 2) * 0.10;
        var leaf = plane(g, 0.10, 0.055, lx, ly, lz,
          l % 2 === 0 ? leafMat : deadLeafMat,
          [jitter(seed + 3) * 0.9, jitter(seed + 4) * 2.2, jitter(seed + 5) * 0.7]);
        leaf.rotation.z += 0.5;
      }
    }
    // 盆土上的落叶
    for (var d = 0; d < 4; d++) {
      plane(g, 0.08, 0.045, jitter(d + 20) * 0.10, 0.284, jitter(d + 30) * 0.10,
        deadLeafMat, [-PI / 2, 0, jitter(d + 40) * 2.0]);
    }
    // 盆沿裂纹
    box(g, 0.006, 0.10, 0.004, 0.128, 0.15, 0.03, mat('rust', { color: 0x4a3a2a }), [0, 0, 0.06]);

    return finish(g, false);
  }

  /* ===========================================================================
   * 33. 散落纸张  paperStack(opts)
   * ======================================================================== */
  function paperStack(opts) {
    var g = makeGroup('paperStack', 'surface');
    var docTex = paperTexture();
    var docMat = mapMat('paper', docTex, { side: THREE.DoubleSide, roughness: 0.95 });
    var plainMat = mat('paper', { side: THREE.DoubleSide });

    // 几层散开的纸
    for (var i = 0; i < 10; i++) {
      var a = hash(i + 2) * PI * 1.6 - 0.8;
      var x = jitter(i + 7) * 0.10;
      var z = jitter(i + 13) * 0.09;
      var y = 0.001 + i * 0.0012;
      plane(g, 0.21, 0.297, x, y, z, (i % 3 === 0) ? plainMat : docMat, [-PI / 2, 0, a]);
    }
    // 一小叠对齐的纸
    for (var s = 0; s < 5; s++) {
      plane(g, 0.21, 0.297, 0.10, 0.014 + s * 0.0011, -0.05,
        docMat, [-PI / 2, 0, 0.12]);
    }
    // 翻开的一页
    plane(g, 0.21, 0.15, -0.04, 0.024, 0.09, docMat, [-PI / 2, 0, 0.55]);
    // 揉皱的一团
    sphere(g, 0.05, -0.11, 0.022, -0.05, plainMat, 10, [1.2, 0.5, 1.0]);

    return finish(g, false);
  }

  /* ===========================================================================
   * 34. 档案纸箱  fileBox(opts)
   * ======================================================================== */
  function fileBox(opts) {
    var g = makeGroup('fileBox', 'surface');
    var cardboard = mat('paper', { color: 0xa88e69, roughness: 0.94 });
    var cardboardDark = mat('paper', { color: 0x8e7554, roughness: 0.94 });
    var paperMat = mat('paper', { color: 0xd6cfba });
    var dark = mat('metalDark');

    var w = 0.42, d = 0.32, h = 0.25;

    // 箱体
    box(g, w, 0.012, d, 0, 0.006, 0, cardboardDark);
    box(g, w, h, 0.012, 0, h / 2, -d / 2 + 0.006, cardboard);
    box(g, w, h, 0.012, 0, h / 2, d / 2 - 0.006, cardboard);
    box(g, 0.012, h, d - 0.024, -w / 2 + 0.006, h / 2, 0, cardboard);
    box(g, 0.012, h, d - 0.024, w / 2 - 0.006, h / 2, 0, cardboard);
    // 侧提手
    box(g, 0.012, 0.05, 0.10, -w / 2 + 0.002, 0.15, 0, dark);
    box(g, 0.012, 0.05, 0.10, w / 2 - 0.002, 0.15, 0, dark);
    // 打开的箱盖（两片向外翻）
    box(g, w, 0.008, 0.16, 0, h + 0.012, -d / 2 + 0.02, cardboard, [0.55, 0, 0]);
    box(g, w, 0.008, 0.16, 0, h + 0.012, d / 2 - 0.02, cardboard, [-0.55, 0, 0]);
    // 箱内档案
    for (var f = 0; f < 6; f++) {
      box(g, 0.30, 0.22, 0.008, jitter(f + 3) * 0.04, 0.13 + f * 0.002, -0.09 + f * 0.028,
        f % 2 === 0 ? paperMat : mat('paper', { color: 0xb7ad95 }), [0.03 * jitter(f + 8), 0, 0.02 * jitter(f + 4)]);
    }
    // 标签
    var ltex = plateTexture('病案 1994', 'ARCHIVE', '#e4deca', '#3a352a', 0.14, 0.06);
    plane(g, 0.14, 0.06, 0, 0.17, d / 2 + 0.001, mapMat('paper', ltex));
    // 封箱胶带
    box(g, 0.07, h + 0.005, 0.004, -0.12, h / 2, d / 2 + 0.001, mat('paper', { color: 0xc2b28a }));

    return finish(g, false);
  }

  /* ===========================================================================
   * 35. 磁带录音机  tapeRecorder(opts)  （桌上可交互道具）
   * ======================================================================== */
  function tapeRecorder(opts) {
    var g = makeGroup('tapeRecorder', 'surface');
    var shell = mat('plasticDark', { color: 0x2b2f2d, roughness: 0.5 });
    var top = mat('plastic', { color: 0x3a3f3c, roughness: 0.55 });
    var metal = mat('metalLight');
    var dark = mat('metalDark');
    var paperMat = mat('paper', { color: 0xd8d3c1 });

    // 机身
    box(g, 0.30, 0.065, 0.20, 0, 0.0325, 0, shell);
    box(g, 0.30, 0.012, 0.20, 0, 0.071, 0, top);
    // 底部脚垫
    for (var f = -1; f <= 1; f += 2) {
      for (var fz = -1; fz <= 1; fz += 2) {
        cyl(g, 0.012, 0.014, 0.01, f * 0.13, 0.005, fz * 0.085, mat('rubber'), 6);
      }
    }

    // 磁带仓
    box(g, 0.13, 0.006, 0.075, -0.05, 0.078, -0.02, mat('plasticDark', { color: 0x111513 }));
    cyl(g, 0.023, 0.023, 0.008, -0.085, 0.083, -0.02, metal, 10);
    cyl(g, 0.023, 0.023, 0.008, -0.015, 0.083, -0.02, metal, 10);
    cyl(g, 0.009, 0.009, 0.012, -0.085, 0.086, -0.02, dark, 6);
    cyl(g, 0.009, 0.009, 0.012, -0.015, 0.086, -0.02, dark, 6);
    box(g, 0.05, 0.004, 0.012, -0.05, 0.082, 0.005, mat('plasticDark', { color: 0x1a1d1b }));
    // 磁带标签
    var ltex = plateTexture('E-04', '东翼', '#ddd6bc', '#39352a', 0.08, 0.03);
    plane(g, 0.08, 0.03, -0.09, 0.083, 0.012, mapMat('paper', ltex), [-PI / 2, 0, 0]);
    // 透明仓盖
    box(g, 0.14, 0.006, 0.085, -0.05, 0.089, -0.02, mat('glass'));

    // 按键排
    for (var b = 0; b < 6; b++) {
      box(g, 0.022, 0.012, 0.022, 0.015 + b * 0.028, 0.082, 0.065,
        b === 2 ? mat('rust', { color: 0x8d3a2c }) : metal);
    }
    // 音量旋钮
    cyl(g, 0.017, 0.017, 0.014, 0.115, 0.083, -0.055, metal, 10);
    box(g, 0.003, 0.004, 0.014, 0.115, 0.091, -0.055, dark);
    // VU 表
    box(g, 0.075, 0.005, 0.035, 0.075, 0.079, -0.03, paperMat);
    box(g, 0.070, 0.002, 0.030, 0.075, 0.0815, -0.03, mat('paper', { color: 0xe6e1d2 }));
    box(g, 0.002, 0.001, 0.024, 0.065, 0.0835, -0.03, mat('rust', { color: 0x7d2f25 }), [0, 0, 0.25]);
    // 扬声器格栅
    var gtex = grilleTexture();
    plane(g, 0.10, 0.055, 0.075, 0.0775, 0.067, mapMat('plasticDark', gtex, { color: 0xffffff }), [-PI / 2, 0, 0]);

    // 提手
    rod(g, [0.09, 0.077, -0.10], [0.09, 0.077, 0.10], 0.007, metal, 5);
    rod(g, [0.09, 0.077, -0.10], [0.09, 0.10, -0.085], 0.007, metal, 5);
    rod(g, [0.09, 0.077, 0.10], [0.09, 0.10, 0.085], 0.007, metal, 5);
    rod(g, [0.09, 0.10, -0.085], [0.09, 0.10, 0.085], 0.008, mat('rubber'), 6);

    // 电源线
    tube(g, 'recorder.cable', [
      [-0.14, 0.04, -0.06],
      [-0.20, 0.03, -0.11],
      [-0.26, 0.015, -0.09],
      [-0.29, 0.004, -0.02]
    ], 0.0045, mat('plasticDark', { color: 0x1b1e1c }), 4, 14);

    return finish(g, false);
  }

  /* ===========================================================================
   * 36. 电子密码键盘  keypad(opts)  （背面贴墙 z=0）
   * ======================================================================== */
  function keypad(opts) {
    var g = makeGroup('keypad', 'wall');
    var shell = mat('plastic', { color: 0xb9beb7 });
    var dark = mat('plasticDark');
    var metal = mat('metalLight');

    // 底座
    box(g, 0.11, 0.16, 0.02, 0, 0.085, 0.01, dark);
    box(g, 0.105, 0.15, 0.03, 0, 0.085, 0.025, shell);
    // 斜面
    box(g, 0.10, 0.02, 0.035, 0, 0.158, 0.028, shell);
    // 小屏
    var stex = keypadScreenTexture();
    box(g, 0.075, 0.032, 0.004, 0, 0.132, 0.041, dark);
    plane(g, 0.068, 0.026, 0, 0.132, 0.0435, mapMat('screen', stex, {
      color: 0xffffff, emissive: 0x5dffa8, emissiveMap: stex, emissiveIntensity: 0.55
    }));
    // 12 按键
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 3; c++) {
        box(g, 0.017, 0.014, 0.007, -0.026 + c * 0.026, 0.108 - r * 0.022, 0.041,
          r === 3 && c === 0 ? mat('rust', { color: 0x8a3a30 }) : metal);
      }
    }
    // 指示灯
    cyl(g, 0.004, 0.004, 0.004, 0.038, 0.148, 0.044, mat('emissiveRed'), 5, [PI / 2, 0, 0]);
    // 铭牌
    var ltex = plateTexture('东翼', 'EAST', '#d9ded8', '#303a33', 0.06, 0.018);
    plane(g, 0.06, 0.018, 0, 0.017, 0.042, mapMat('paper', ltex));
    // 顶部线管
    cyl(g, 0.011, 0.011, 0.045, 0, 0.185, 0.02, metal, 6);
    // 固定螺丝
    screw(g, -0.043, 0.155, 0.041, 0.004);
    screw(g, 0.043, 0.015, 0.041, 0.004);

    return finish(g, false);
  }

  /* ===========================================================================
   * 37. 裹尸袋  bodyBag(opts)  {onGurney:true}
   *     平放，长 1.9 m；onGurney=true 时落点由调用方决定（本组底部仍在 y=0）
   * ======================================================================== */
  function bodyBag(opts) {
    opts = opts || {};
    var onGurney = bool(opts.onGurney, false);

    var g = makeGroup('bodyBag', 'floor');
    var bagMat = mat('bodyBag');
    var bagMatDark = mat('bodyBag', { color: 0x0b0c0d, roughness: 0.28 });
    var metal = mat('metalLight');
    var dark = mat('metalDark');

    // 袋体：胶囊压扁，头/脚略收
    var bodyMesh = capsule(g, 0.20, 1.48, 0, 0.145, 0, bagMat, [PI / 2, 0, 0], [1.52, 1.0, 0.66]);
    // 头部与脚部的轮廓隆起（仍在袋内）
    sphere(g, 0.135, 0, 0.185, -0.70, bagMat, 14, [1.15, 0.55, 1.05]);
    sphere(g, 0.12, 0, 0.165, 0.70, bagMat, 12, [1.2, 0.5, 1.0]);
    // 手臂轮廓
    sphere(g, 0.10, 0.22, 0.15, -0.18, bagMat, 10, [0.9, 0.42, 1.5]);

    // 拉链（顶部中线）
    box(g, 0.012, 0.006, 1.30, 0, 0.280, 0.02, bagMatDark);
    for (var z = 0; z < 10; z++) {
      box(g, 0.018, 0.004, 0.012, 0, 0.284, -0.58 + z * 0.13, metal);
    }
    // 拉链头
    box(g, 0.03, 0.012, 0.025, 0, 0.286, 0.58, metal);
    torus(g, 0.018, 0.004, 0, 0.292, 0.605, metal, [PI / 2, 0, 0], 4, 8, PI);

    // 两侧提手（4 对）
    for (var hz = -0.6; hz <= 0.6; hz += 0.4) {
      for (var hx = -1; hx <= 1; hx += 2) {
        box(g, 0.03, 0.012, 0.13, hx * 0.305, 0.19, hz, bagMatDark);
        box(g, 0.02, 0.05, 0.012, hx * 0.315, 0.165, hz - 0.05, bagMatDark);
        box(g, 0.02, 0.05, 0.012, hx * 0.315, 0.165, hz + 0.05, bagMatDark);
      }
    }
    // 束带（绕过袋体截面）
    for (var s = 0; s < 3; s++) {
      var sz = -0.40 + s * 0.40;
      box(g, 0.52, 0.012, 0.035, 0, 0.278, sz, bagMatDark);
      box(g, 0.012, 0.13, 0.035, -0.27, 0.215, sz, bagMatDark);
      box(g, 0.012, 0.13, 0.035, 0.27, 0.215, sz, bagMatDark);
    }
    // 脚牌：从袋尾垂下
    var ltex = plateTexture('无名', 'DOE-0417', '#e3dfcf', '#2b2a24', 0.11, 0.07);
    plane(g, 0.10, 0.06, 0.02, 0.155, 0.963, mapMat('paper', ltex), [0, 0, 0.06]);
    rod(g, [0.02, 0.215, 0.90], [0.02, 0.19, 0.958], 0.002, metal, 4);

    // 表面反光条（拉链边的塑料高光）
    box(g, 0.03, 0.002, 1.20, -0.05, 0.281, 0.0, mat('bodyBag', { color: 0x33383a, roughness: 0.2 }));
    box(g, 0.02, 0.002, 0.9, 0.08, 0.279, 0.12, mat('bodyBag', { color: 0x2c3032, roughness: 0.22 }));

    g.userData.onGurney = onGurney;
    // 放在推床上时略微压实
    if (onGurney) {
      bodyMesh.scale.z *= 0.94;
    }

    return finish(g, true);
  }

  /* ===========================================================================
   * 38. 手术台  operatingTable(opts)
   * ======================================================================== */
  function operatingTable(opts) {
    var g = makeGroup('operatingTable', 'floor');
    var steel = mat('stainless');
    var steelDark = mat('metal', { color: 0x7a8387 });
    var dark = mat('metalDark');
    var padMat = mat('fabricGrey', { color: 0x4e5655 });
    var strapMat = mat('rubber', { color: 0x2a2b28 });
    var rust = mat('rust');

    // 底座 + 液压柱
    box(g, 0.52, 0.10, 0.72, 0, 0.05, 0, steelDark);
    box(g, 0.44, 0.06, 0.60, 0, 0.12, 0, dark);
    box(g, 0.30, 0.40, 0.36, 0, 0.33, 0, steel);
    cyl(g, 0.075, 0.085, 0.42, 0, 0.55, 0, steelDark, 12);
    // 脚踏升降
    box(g, 0.16, 0.03, 0.10, 0.18, 0.015, 0.24, dark, [0.1, 0, 0]);
    rod(g, [0.18, 0.03, 0.24], [0.18, 0.12, 0.30], 0.009, steel, 5);

    // 台面框架
    box(g, 0.70, 0.09, 1.92, 0, 0.815, 0, steel);
    box(g, 0.60, 0.03, 1.80, 0, 0.87, 0, dark);
    // 三段床垫
    var sections = [
      { z: -0.63, l: 0.60, y: 0.8885 },
      { z: 0.0, l: 0.62, y: 0.8885 },
      { z: 0.63, l: 0.62, y: 0.8885 }
    ];
    for (var s = 0; s < sections.length; s++) {
      box(g, 0.64, 0.055, sections[s].l, 0, sections[s].y, sections[s].z, padMat);
      // 分段缝
      box(g, 0.66, 0.006, 0.012, 0, sections[s].y + 0.031, sections[s].z + sections[s].l / 2, dark);
    }
    // 头枕
    box(g, 0.26, 0.06, 0.18, 0, 0.934, -0.72, padMat, [0.08, 0, 0]);
    // 排水槽
    box(g, 0.18, 0.006, 0.05, 0, 0.9195, 0.08, dark);
    for (var d = 0; d < 5; d++) {
      box(g, 0.016, 0.003, 0.045, -0.06 + d * 0.03, 0.9225, 0.08, steelDark);
    }

    // 侧边金属护栏
    for (var side = -1; side <= 1; side += 2) {
      rod(g, [side * 0.345, 0.885, -0.72], [side * 0.345, 0.885, 0.72], 0.012, steel, 8);
      for (var p = -1; p <= 1; p++) {
        rod(g, [side * 0.345, 0.86, p * 0.55], [side * 0.345, 0.885, p * 0.55], 0.010, steel, 5);
      }
    }

    // 束缚带（3 条，落在床垫上表面）
    for (var b = 0; b < 3; b++) {
      var bz = -0.42 + b * 0.42;
      box(g, 0.66, 0.012, 0.06, 0, 0.923, bz, strapMat);
      box(g, 0.016, 0.24, 0.06, -0.345, 0.83, bz, strapMat);
      box(g, 0.016, 0.24, 0.06, 0.345, 0.83, bz, strapMat);
      // 金属扣
      box(g, 0.05, 0.025, 0.07, -0.16, 0.931, bz, steelDark);
    }

    // 侧挂控制盒
    box(g, 0.10, 0.08, 0.14, 0.40, 0.78, -0.30, dark);
    cyl(g, 0.018, 0.018, 0.014, 0.455, 0.78, -0.30, steel, 8, [0, 0, PI / 2]);
    // 锈
    box(g, 0.03, 0.02, 0.02, -0.24, 0.11, 0.34, rust);
    box(g, 0.02, 0.06, 0.01, 0.33, 0.42, -0.04, rust);

    return finish(g, true);
  }

  /* ===========================================================================
   * 39. 电梯门  elevatorDoor(opts)  {w:1.6, h:2.1, open:false}
   *     userData.leaves=[左,右]；用户可自行插值 position.x 做开门动画
   * ======================================================================== */
  function elevatorDoor(opts) {
    opts = opts || {};
    var w = Math.max(0.9, num(opts.w, 1.6));
    var h = Math.max(1.6, num(opts.h, 2.1));
    var open = bool(opts.open, false);

    var g = makeGroup('elevatorDoor', 'wall');
    var steel = mat('stainless');
    var brushed = mat('metal', { color: 0xa9b1b4 });
    var dark = mat('metalDark');
    var glass = mat('glass');

    // 门套
    var jambW = 0.12, depth = 0.18;
    box(g, jambW, h + 0.12, depth, -(w / 2 + jambW / 2), (h + 0.12) / 2, depth / 2, dark);
    box(g, jambW, h + 0.12, depth, w / 2 + jambW / 2, (h + 0.12) / 2, depth / 2, dark);
    box(g, w + jambW * 2, 0.14, depth, 0, h + 0.05, depth / 2, dark);
    // 门套内衬不锈钢
    box(g, 0.02, h, depth - 0.02, -(w / 2 - 0.01), h / 2, depth / 2, steel);
    box(g, 0.02, h, depth - 0.02, w / 2 - 0.01, h / 2, depth / 2, steel);
    box(g, w, 0.02, depth - 0.02, 0, h - 0.01, depth / 2, steel);
    // 门槛
    box(g, w + 0.02, 0.02, depth, 0, 0.01, depth / 2, brushed);

    // 楼层显示
    box(g, 0.32, 0.07, 0.012, 0, h + 0.065, depth + 0.004, dark);
    var dispMat = mat('emissiveWhite', { color: 0x1a130a, emissive: 0xffb14a, emissiveIntensity: 0.55 });
    plane(g, 0.26, 0.04, 0, h + 0.065, depth + 0.011, dispMat);

    // 两扇门（Group 便于滑动）
    var leafW = w / 2 - 0.008;
    var leafH = h - 0.06;
    var closedX = [-w / 4, w / 4];
    var openX = [closedX[0] - leafW, closedX[1] + leafW];

    function makeLeaf(sign) {
      var leaf = new THREE.Group();
      leaf.position.set(sign < 0 ? closedX[0] : closedX[1], 0.025, 0.055);
      g.add(leaf);

      box(leaf, leafW, leafH, 0.032, 0, leafH / 2, 0, brushed);
      // 竖向拉丝
      for (var i = -2; i <= 2; i++) {
        box(leaf, 0.002, leafH - 0.10, 0.002, i * 0.10, leafH / 2, 0.017, mat('metal', { color: 0x939b9e }));
      }
      // 踢脚板
      box(leaf, leafW, 0.16, 0.036, 0, 0.10, 0, steel);
      box(leaf, leafW, 0.012, 0.042, 0, 0.185, 0, dark);
      // 中缝
      box(leaf, 0.006, leafH, 0.036, -sign * (leafW / 2 - 0.003), leafH / 2, 0, dark);
      // 小凹痕
      box(leaf, 0.06, 0.008, 0.002, -sign * 0.11, 0.72, 0.017, mat('metal', { color: 0x8b9396 }));
      box(leaf, 0.02, 0.05, 0.002, sign * 0.08, 0.52, 0.017, mat('metal', { color: 0x8b9396 }));
      return leaf;
    }

    var left = makeLeaf(-1);
    var right = makeLeaf(1);

    if (open) {
      left.position.x = openX[0];
      right.position.x = openX[1];
    }

    g.userData.leaves = [left, right];
    g.userData.leafW = leafW;
    g.userData.closedX = closedX;
    g.userData.openX = openX;
    g.userData.open = open;

    return finish(g, true);
  }

  /* ===========================================================================
   * 40. 门框  doorFrame(opts)  {w:1.1, h:2.05}  （不含门板，背面贴墙 z=0）
   * ======================================================================== */
  function doorFrame(opts) {
    opts = opts || {};
    var w = Math.max(0.7, num(opts.w, 1.1));
    var h = Math.max(1.6, num(opts.h, 2.05));

    var g = makeGroup('doorFrame', 'wall');
    var frameMat = mat('paintedCream');
    var frameDark = mat('paintedCream', { color: 0xbdb298 });
    var metal = mat('metalDark');

    var depth = 0.16;
    var jambW = 0.06;
    var headH = 0.09;

    // 侧框
    box(g, jambW, h - headH, depth, -(w / 2 + jambW / 2), (h - headH) / 2, depth / 2, frameMat);
    box(g, jambW, h - headH, depth, w / 2 + jambW / 2, (h - headH) / 2, depth / 2, frameMat);
    // 顶框
    box(g, w + jambW * 2, headH, depth, 0, h - headH / 2, depth / 2, frameMat);
    // 门挡（内侧止口）
    box(g, w + jambW * 2, 0.015, 0.02, 0, h - headH - 0.01, depth - 0.01, frameDark);
    box(g, 0.015, h - headH, 0.02, -(w / 2 + 0.0075), (h - headH) / 2, depth - 0.01, frameDark);
    box(g, 0.015, h - headH, 0.02, w / 2 + 0.0075, (h - headH) / 2, depth - 0.01, frameDark);

    // 前脸贴脸线（architrave）
    var archW = 0.085;
    box(g, archW, h, 0.022, -(w / 2 + jambW + archW / 2), h / 2, depth + 0.011, frameMat);
    box(g, archW, h, 0.022, w / 2 + jambW + archW / 2, h / 2, depth + 0.011, frameMat);
    box(g, w + (jambW + archW) * 2, archW, 0.022, 0, h - archW / 2, depth + 0.011, frameMat);
    // 贴脸线凹槽
    box(g, 0.012, h - 0.04, 0.006, -(w / 2 + jambW + 0.012), h / 2, depth + 0.024, frameDark);
    box(g, 0.012, h - 0.04, 0.006, w / 2 + jambW + 0.012, h / 2, depth + 0.024, frameDark);

    // 合页（门已拆除，只剩铰链，装在门框内侧面）
    box(g, 0.022, 0.10, 0.028, -(w / 2 - 0.005), 0.40, depth - 0.03, metal);
    box(g, 0.022, 0.10, 0.028, -(w / 2 - 0.005), 1.35, depth - 0.03, metal);
    // 锁舌孔
    box(g, 0.026, 0.05, 0.012, w / 2 - 0.005, 1.02, depth - 0.03, metal);

    // 漆面磕碰
    box(g, 0.02, 0.07, 0.004, -(w / 2 + 0.065), 0.55, depth + 0.022, mat('rust', { color: 0x5c4c3c }));
    box(g, 0.05, 0.012, 0.004, w / 2 + 0.065, 1.75, depth + 0.022, frameDark);

    return finish(g, true);
  }

  /* ===========================================================================
   * 41. 标牌  sign(opts)  {text, w, h, color, bg, glow}
   * ======================================================================== */
  function sign(opts) {
    opts = opts || {};
    var text = (typeof opts.text === 'string' && opts.text.length) ? opts.text : '护士站';
    var w = Math.max(0.12, num(opts.w, 0.6));
    var h = Math.max(0.06, num(opts.h, 0.2));
    var color = (typeof opts.color === 'string') ? opts.color : '#0b3d2e';
    var bg = (typeof opts.bg === 'string') ? opts.bg : '#d8e6df';
    var glow = bool(opts.glow, false);

    var g = makeGroup('sign', 'wall');
    var frameMat = mat('metalDark');
    var tex = signTexture(text, w, h, bg, color);

    // 边框底板
    box(g, w + 0.03, h + 0.03, 0.018, 0, h / 2, 0.009, frameMat);
    // 面板
    var faceMat;
    if (glow) {
      faceMat = tex ? mat('paper', {
        map: tex,
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 1.0,
        roughness: 0.5,
        metalness: 0.0
      }) : mat('emissiveWhite');
    } else {
      faceMat = mapMat('paper', tex, { roughness: 0.55 });
    }
    plane(g, w, h, 0, h / 2, 0.019, faceMat);

    // 固定螺丝
    screw(g, -(w / 2 + 0.006), 0.008, 0.02, 0.004);
    screw(g, w / 2 + 0.006, 0.008, 0.02, 0.004);
    screw(g, -(w / 2 + 0.006), h - 0.008, 0.02, 0.004);
    screw(g, w / 2 + 0.006, h - 0.008, 0.02, 0.004);

    g.userData.text = text;
    g.userData.glow = glow;

    return finish(g, false);
  }

  /* ===========================================================================
   * 42. 相框  pictureFrame(opts)  {w:0.5, h:0.7}
   * ======================================================================== */
  function pictureFrame(opts) {
    opts = opts || {};
    var w = Math.max(0.15, num(opts.w, 0.5));
    var h = Math.max(0.15, num(opts.h, 0.7));

    var g = makeGroup('pictureFrame', 'wall');
    var wood = mat('woodDark');
    var backing = mat('paper', { color: 0x35302a });
    var tex = corridorPictureTexture();

    box(g, w, h, 0.02, 0, h / 2, 0.01, backing);
    plane(g, w - 0.06, h - 0.06, 0, h / 2, 0.021,
      mapMat('paper', tex, { roughness: 0.7, metalness: 0.0 }));
    // 玻璃
    box(g, w - 0.055, h - 0.055, 0.004, 0, h / 2, 0.025, mat('glass'));
    // 木框四条
    box(g, w, 0.035, 0.03, 0, h - 0.0175, 0.026, wood);
    box(g, w, 0.035, 0.03, 0, 0.0175, 0.026, wood);
    box(g, 0.035, h - 0.07, 0.03, -(w / 2 - 0.0175), h / 2, 0.026, wood);
    box(g, 0.035, h - 0.07, 0.03, w / 2 - 0.0175, h / 2, 0.026, wood);
    // 框角接缝
    box(g, 0.012, 0.012, 0.004, -w / 2 + 0.035, h - 0.035, 0.041, mat('woodDark', { color: 0x352418 }));
    box(g, 0.012, 0.012, 0.004, w / 2 - 0.035, h - 0.035, 0.041, mat('woodDark', { color: 0x352418 }));

    return finish(g, false);
  }

  /* ===========================================================================
   * 43. 镜子  mirror(opts)  {w:0.9, h:1.6}  （深色高反射，不做真实反射）
   * ======================================================================== */
  function mirror(opts) {
    opts = opts || {};
    var w = Math.max(0.2, num(opts.w, 0.9));
    var h = Math.max(0.2, num(opts.h, 1.6));

    var g = makeGroup('mirror', 'wall');
    var mirrorMat = mat('mirror', { metalness: 1.0, roughness: 0.08 });
    var frameMat = mat('metalDark');
    var backMat = mat('paintedWhite', { color: 0x9aa099 });

    // 背板
    box(g, w, h, 0.014, 0, h / 2, 0.007, backMat);
    // 镜面
    box(g, w - 0.028, h - 0.028, 0.012, 0, h / 2, 0.019, mirrorMat);
    // 金属包边
    box(g, w, 0.022, 0.024, 0, h - 0.011, 0.032, frameMat);
    box(g, w, 0.022, 0.024, 0, 0.011, 0.032, frameMat);
    box(g, 0.022, h - 0.044, 0.024, -(w / 2 - 0.011), h / 2, 0.032, frameMat);
    box(g, 0.022, h - 0.044, 0.024, w / 2 - 0.011, h / 2, 0.032, frameMat);
    // 四角固定件 + 螺丝
    var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var i = 0; i < corners.length; i++) {
      var cx = corners[i][0] * (w / 2 - 0.012);
      var cy = h / 2 + corners[i][1] * (h / 2 - 0.012);
      cyl(g, 0.016, 0.016, 0.008, cx, cy, 0.044, frameMat, 10, [PI / 2, 0, 0]);
      screw(g, cx, cy, 0.049, 0.004);
    }
    // 镜面下沿的水渍
    box(g, w - 0.06, 0.08, 0.002, 0, 0.06, 0.026, mat('paintedWhite', { color: 0x6d736c }));

    return finish(g, false);
  }

  /* ===========================================================================
   * 44. 白房治疗床  whiteRoomBed(opts)  {straps:false}
   * ======================================================================== */
  function whiteRoomBed(opts) {
    opts = opts || {};
    var withStraps = bool(opts.straps, false);

    var g = makeGroup('whiteRoomBed', 'floor');
    var white = mat('plastic', { color: 0xf0efe7, roughness: 0.44, metalness: 0.02 });
    var whiteSeam = mat('plastic', { color: 0xd8d7cd, roughness: 0.5 });
    var steel = mat('stainless');
    var metal = mat('metalLight');
    var strapMat = mat('fabricGrey', { color: 0xd9d8cf, roughness: 0.9 });
    var buckle = mat('metalLight');

    // 四腿
    var lx = 0.31, lz = 0.84;
    var legs = [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]];
    for (var i = 0; i < legs.length; i++) {
      rod(g, [legs[i][0], 0.065, legs[i][1]], [legs[i][0], 0.70, legs[i][1]], 0.020, steel, 8);
      // 脚轮（轮底与地面齐平）
      box(g, 0.05, 0.045, 0.05, legs[i][0], 0.058, legs[i][1], metal);
      cyl(g, 0.035, 0.035, 0.028, legs[i][0], 0.035, legs[i][1], mat('rubber'), 10, [0, 0, PI / 2]);
      cyl(g, 0.012, 0.012, 0.032, legs[i][0], 0.035, legs[i][1], mat('metalLight'), 8, [0, 0, PI / 2]);
    }
    // 上下框
    rod(g, [-lx, 0.64, -lz], [lx, 0.64, -lz], 0.018, steel, 8);
    rod(g, [-lx, 0.64, lz], [lx, 0.64, lz], 0.018, steel, 8);
    rod(g, [-lx, 0.64, -lz], [-lx, 0.64, lz], 0.018, steel, 8);
    rod(g, [lx, 0.64, -lz], [lx, 0.64, lz], 0.018, steel, 8);
    rod(g, [-lx, 0.20, -lz], [lx, 0.20, -lz], 0.012, metal, 6);
    rod(g, [-lx, 0.20, lz], [lx, 0.20, lz], 0.012, metal, 6);
    // 床板框
    box(g, 0.68, 0.055, 1.88, 0, 0.695, 0, metal);

    // 纯白皮革床垫
    box(g, 0.68, 0.13, 1.88, 0, 0.7825, 0, white);
    // 头枕段（略抬）
    box(g, 0.60, 0.055, 0.34, 0, 0.876, -0.73, white, [0.09, 0, 0]);
    // 皮革拼缝
    for (var s = -1; s <= 1; s++) {
      box(g, 0.66, 0.004, 0.012, 0, 0.849, s * 0.52, whiteSeam);
    }
    box(g, 0.012, 0.004, 1.80, 0, 0.849, 0, whiteSeam);
    // 金属包边
    rod(g, [-0.342, 0.836, -0.94], [-0.342, 0.836, 0.94], 0.010, steel, 6);
    rod(g, [0.342, 0.836, -0.94], [0.342, 0.836, 0.94], 0.010, steel, 6);
    // 床尾金属挡板
    rod(g, [-0.32, 0.70, 0.95], [-0.32, 0.86, 0.95], 0.012, steel, 6);
    rod(g, [0.32, 0.70, 0.95], [0.32, 0.86, 0.95], 0.012, steel, 6);
    rod(g, [-0.32, 0.86, 0.95], [0.32, 0.86, 0.95], 0.012, steel, 6);

    // 束缚带
    if (withStraps) {
      for (var b = 0; b < 3; b++) {
        var bz = -0.48 + b * 0.48;
        box(g, 0.70, 0.012, 0.06, 0, 0.856, bz, strapMat);
        box(g, 0.016, 0.26, 0.06, -(0.35), 0.72, bz, strapMat);
        box(g, 0.016, 0.26, 0.06, 0.35, 0.72, bz, strapMat);
        box(g, 0.045, 0.03, 0.07, -0.18, 0.865, bz, buckle);
      }
    } else {
      // 预留的金属扣环
      for (var c = 0; c < 3; c++) {
        var cz = -0.48 + c * 0.48;
        box(g, 0.03, 0.02, 0.05, 0.348, 0.79, cz, metal);
        box(g, 0.03, 0.02, 0.05, -0.348, 0.79, cz, metal);
      }
    }

    // 排水孔
    cyl(g, 0.022, 0.022, 0.008, 0, 0.852, 0.10, mat('metalDark'), 10);
    // 皮革磨损
    box(g, 0.10, 0.002, 0.03, 0.12, 0.850, 0.36, mat('plastic', { color: 0xdedcd2 }), [0, 0.3, 0]);

    return finish(g, true);
  }

  /* ===========================================================================
   * 45. 挂在墙上的白大褂  labCoat(opts)  （背面贴墙 z=0）
   * ======================================================================== */
  function labCoat(opts) {
    var g = makeGroup('labCoat', 'wall');
    var clothMat = mat('fabricWhite', { color: 0xdedfd6, roughness: 0.95, metalness: 0.0 });
    var clothDark = mat('fabricWhite', { color: 0xc4c6bc, roughness: 0.95 });
    var wire = mat('metalLight');
    var dark = mat('metalDark');

    // 墙钩与挂杆
    box(g, 0.06, 0.10, 0.012, 0, 1.15, 0.006, dark);
    rod(g, [0, 1.18, 0.01], [0, 1.18, 0.075], 0.006, wire, 5);
    rod(g, [0, 1.18, 0.075], [0, 1.205, 0.078], 0.006, wire, 5);

    // 衣架
    torus(g, 0.032, 0.0045, 0, 1.215, 0.082, wire, [0, 0, 0], 4, 10, PI);
    rod(g, [-0.17, 1.045, 0.078], [0, 1.185, 0.082], 0.005, wire, 4);
    rod(g, [0.17, 1.045, 0.078], [0, 1.185, 0.082], 0.005, wire, 4);
    rod(g, [-0.17, 1.045, 0.078], [0.17, 1.045, 0.078], 0.0045, wire, 4);

    // 大褂轮廓（正面剪影拉伸，带小倒角）
    var bodyGeo = cachedGeo('labcoat.body', function () {
      var s = new THREE.Shape();
      s.moveTo(-0.24, 0.02);
      s.lineTo(-0.16, 0.000);
      s.lineTo(-0.08, 0.016);
      s.lineTo(0.00, 0.002);
      s.lineTo(0.08, 0.016);
      s.lineTo(0.16, 0.000);
      s.lineTo(0.24, 0.02);
      s.lineTo(0.245, 0.55);
      s.lineTo(0.262, 0.72);
      s.lineTo(0.252, 0.86);
      s.lineTo(0.12, 1.02);
      s.lineTo(0.055, 1.062);
      s.lineTo(0.045, 1.00);
      s.lineTo(-0.045, 1.00);
      s.lineTo(-0.055, 1.062);
      s.lineTo(-0.12, 1.02);
      s.lineTo(-0.252, 0.86);
      s.lineTo(-0.262, 0.72);
      s.lineTo(-0.245, 0.55);
      s.closePath();
      var geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.045,
        bevelEnabled: true,
        bevelSize: 0.005,
        bevelThickness: 0.004,
        bevelSegments: 2,
        steps: 1,
        curveSegments: 2
      });
      geo.translate(0, 0, 0.055);
      return geo;
    });
    g.add(new THREE.Mesh(bodyGeo, clothMat));

    // 袖子
    for (var s2 = -1; s2 <= 1; s2 += 2) {
      box(g, 0.10, 0.52, 0.048, s2 * 0.285, 0.60, 0.078, clothMat, [0, 0, s2 * 0.055]);
      box(g, 0.105, 0.05, 0.052, s2 * 0.30, 0.345, 0.078, clothDark);
      // 袖褶
      box(g, 0.004, 0.30, 0.05, s2 * 0.245, 0.55, 0.080, clothDark, [0, 0, s2 * 0.055]);
    }

    // 领子与翻领
    box(g, 0.20, 0.055, 0.03, 0, 1.045, 0.088, clothMat);
    box(g, 0.09, 0.19, 0.018, -0.062, 0.955, 0.103, clothDark, [0, 0.08, 0.30]);
    box(g, 0.09, 0.19, 0.018, 0.062, 0.955, 0.103, clothDark, [0, -0.08, -0.30]);

    // 门襟 + 纽扣
    box(g, 0.02, 0.72, 0.012, 0, 0.60, 0.101, clothDark);
    for (var b = 0; b < 3; b++) {
      cyl(g, 0.012, 0.012, 0.006, 0.035, 0.80 - b * 0.16, 0.106, mat('plastic', { color: 0xe6e6dd }), 8, [PI / 2, 0, 0]);
    }

    // 口袋
    for (var p = -1; p <= 1; p += 2) {
      box(g, 0.11, 0.11, 0.006, p * 0.13, 0.52, 0.103, clothMat);
      box(g, 0.11, 0.008, 0.008, p * 0.13, 0.575, 0.107, clothDark);
    }
    // 胸牌
    var tagTex = plateTexture('林', '夜班', '#e7e4d8', '#3a3c35', 0.06, 0.022);
    plane(g, 0.06, 0.022, 0.145, 0.88, 0.104, mapMat('paper', tagTex));

    // 衣褶
    for (var f = 0; f < 4; f++) {
      box(g, 0.006, 0.34 - f * 0.04, 0.004, -0.13 + f * 0.085, 0.29 + f * 0.06, 0.104, clothDark, [0, 0, 0.02 * jitter(f + 2)]);
    }
    // 污渍
    plane(g, 0.05, 0.04, -0.10, 0.36, 0.105, mat('rust', { color: 0x6e4b34 }));
    plane(g, 0.03, 0.05, 0.16, 0.68, 0.104, mat('rust', { color: 0x5c4632 }));

    return finish(g, false);
  }

  /* ===========================================================================
   * 46. 床头柜  nightstand(opts)  （补充道具：尺寸按需求中的 0.45 x 0.45 x 0.65）
   * ======================================================================== */
  function nightstand(opts) {
    var g = makeGroup('nightstand', 'floor');
    var bodyMat = mat('paintedCream', { color: 0xc7c1ae });
    var bodyDark = mat('paintedCream', { color: 0xa9a390 });
    var topMat = mat('wood', { color: 0x7d6d55 });
    var metal = mat('metalLight');
    var dark = mat('metalDark');
    var rust = mat('rust');
    var paperMat = mat('paper');

    // 四只小脚轮
    addCaster(g, -0.16, -0.16, 0.026);
    addCaster(g, 0.16, -0.16, 0.026);
    addCaster(g, -0.16, 0.16, 0.026);
    addCaster(g, 0.16, 0.16, 0.026);

    // 柜体（顶面 0.44 + 圆角包边 ≈ 0.45）
    box(g, 0.41, 0.02, 0.41, 0, 0.10, 0, bodyDark);
    box(g, 0.02, 0.51, 0.41, -0.205, 0.365, 0, bodyMat);
    box(g, 0.02, 0.51, 0.41, 0.205, 0.365, 0, bodyMat);
    box(g, 0.41, 0.51, 0.018, 0, 0.365, -0.196, bodyDark);
    box(g, 0.42, 0.02, 0.42, 0, 0.61, 0, bodyDark);
    box(g, 0.44, 0.03, 0.44, 0, 0.635, 0, topMat);
    rod(g, [-0.213, 0.646, 0.213], [0.213, 0.646, 0.213], 0.008, topMat, 6);
    rod(g, [-0.213, 0.646, -0.213], [0.213, 0.646, -0.213], 0.008, topMat, 6);
    rod(g, [-0.213, 0.646, -0.213], [-0.213, 0.646, 0.213], 0.008, topMat, 6);
    rod(g, [0.213, 0.646, -0.213], [0.213, 0.646, 0.213], 0.008, topMat, 6);

    // 上部抽屉
    box(g, 0.34, 0.14, 0.02, 0, 0.54, 0.216, bodyMat);
    box(g, 0.34, 0.008, 0.012, 0, 0.603, 0.228, bodyDark);
    rod(g, [-0.085, 0.545, 0.235], [0.085, 0.545, 0.235], 0.009, metal, 6);
    rod(g, [-0.085, 0.545, 0.225], [-0.085, 0.545, 0.235], 0.007, metal, 5);
    rod(g, [0.085, 0.545, 0.225], [0.085, 0.545, 0.235], 0.007, metal, 5);

    // 下部柜门
    box(g, 0.36, 0.34, 0.02, 0, 0.285, 0.216, bodyMat);
    box(g, 0.36, 0.01, 0.014, 0, 0.445, 0.229, bodyDark);
    box(g, 0.36, 0.01, 0.014, 0, 0.125, 0.229, bodyDark);
    rod(g, [0.12, 0.24, 0.24], [0.12, 0.33, 0.24], 0.009, metal, 6);
    rod(g, [0.12, 0.24, 0.229], [0.12, 0.24, 0.24], 0.007, metal, 5);
    rod(g, [0.12, 0.33, 0.229], [0.12, 0.33, 0.24], 0.007, metal, 5);
    // 通风槽
    box(g, 0.18, 0.012, 0.006, 0, 0.39, 0.228, dark);
    box(g, 0.18, 0.012, 0.006, 0, 0.36, 0.228, dark);
    // 铰链与锁
    box(g, 0.018, 0.05, 0.024, -0.185, 0.20, 0.23, metal);
    box(g, 0.018, 0.05, 0.024, -0.185, 0.37, 0.23, metal);
    cyl(g, 0.010, 0.010, 0.010, -0.14, 0.285, 0.229, dark, 8, [PI / 2, 0, 0]);

    // 顶面：病历纸 + 笔
    for (var p = 0; p < 3; p++) {
      plane(g, 0.16, 0.22, 0.05 + jitter(p + 2) * 0.03, 0.652 + p * 0.0015,
        -0.03 + jitter(p + 5) * 0.03, paperMat, [-PI / 2, 0, jitter(p + 7) * 0.5]);
    }
    rod(g, [-0.03, 0.657, 0.12], [0.10, 0.657, 0.14], 0.004, mat('plasticDark'), 4);

    // 侧面的毛巾钩 + 病历卡插槽
    rod(g, [0.215, 0.46, -0.12], [0.235, 0.46, -0.12], 0.006, metal, 5);
    box(g, 0.005, 0.08, 0.10, 0.216, 0.52, 0.06, bodyDark);
    // 底部锈水与磕碰
    box(g, 0.03, 0.02, 0.004, -0.12, 0.115, 0.207, rust);
    box(g, 0.05, 0.008, 0.004, 0.10, 0.615, 0.222, bodyDark);

    return finish(g, true);
  }

  /* ===========================================================================
   * 47. 缓存与全局导出
   * ======================================================================== */
  /**
   * 清空几何 / 材质 / Canvas 贴图缓存。
   * 注意：调用后，已创建的道具几何体会失效，请先移除旧道具再重建场景。
   */
  HP.clearCache = function () {
    GEO_CACHE.forEach(function (g) {
      if (g && typeof g.dispose === 'function') g.dispose();
    });
    GEO_CACHE.clear();

    MAT_CACHE.forEach(function (m) {
      if (m && m.__hpOwned && typeof m.dispose === 'function') m.dispose();
    });
    MAT_CACHE.clear();

    TEX_CACHE.forEach(function (t) {
      if (t && typeof t.dispose === 'function') t.dispose();
    });
    TEX_CACHE.clear();

    return HP;
  };

  HP.mat = mat;
  HP.bed = bed;
  HP.gurney = gurney;
  HP.wheelchair = wheelchair;
  HP.ivStand = ivStand;
  HP.locker = locker;
  HP.cabinet = cabinet;
  HP.nurseDesk = nurseDesk;
  HP.desk = desk;
  HP.chair = chair;
  HP.stool = stool;
  HP.monitorStand = monitorStand;
  HP.sink = sink;
  HP.morgueUnit = morgueUnit;
  HP.ceilingLight = ceilingLight;
  HP.wallLight = wallLight;
  HP.ceilingVent = ceilingVent;
  HP.curtainRail = curtainRail;
  HP.curtain = curtain;
  HP.pipes = pipes;
  HP.trashBin = trashBin;
  HP.medicalCart = medicalCart;
  HP.fireExtinguisher = fireExtinguisher;
  HP.clock = clock;
  HP.phone = phone;
  HP.plant = plant;
  HP.paperStack = paperStack;
  HP.fileBox = fileBox;
  HP.tapeRecorder = tapeRecorder;
  HP.keypad = keypad;
  HP.bodyBag = bodyBag;
  HP.operatingTable = operatingTable;
  HP.elevatorDoor = elevatorDoor;
  HP.doorFrame = doorFrame;
  HP.sign = sign;
  HP.pictureFrame = pictureFrame;
  HP.mirror = mirror;
  HP.whiteRoomBed = whiteRoomBed;
  HP.labCoat = labCoat;
  HP.nightstand = nightstand;   // 补充道具（0.45 x 0.45 x 0.65）

  HP.PROP_NAMES = [
    'bed', 'gurney', 'wheelchair', 'ivStand', 'locker', 'cabinet', 'nurseDesk', 'desk',
    'chair', 'stool', 'monitorStand', 'sink', 'morgueUnit', 'ceilingLight', 'wallLight',
    'ceilingVent', 'curtainRail', 'curtain', 'pipes', 'trashBin', 'medicalCart',
    'fireExtinguisher', 'clock', 'phone', 'plant', 'paperStack', 'fileBox', 'tapeRecorder',
    'keypad', 'bodyBag', 'operatingTable', 'elevatorDoor', 'doorFrame', 'sign',
    'pictureFrame', 'mirror', 'whiteRoomBed', 'labCoat', 'nightstand'
  ];

})(typeof window !== 'undefined' ? window : this);
