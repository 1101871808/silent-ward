/* ============================================================
   静默病栋 SILENT WARD — 贴图与材质库 HT
   - PBR 贴图来自 CC0 素材（ambientCG），已内嵌为 data URI（js/tex_data.js）
   - 其余污渍/血迹/标牌/海报/X 光片/Jump Scare 脸全部由 Canvas 程序化实时绘制
   - 所有材质共用缓存，减少 draw call 与显存占用
   ============================================================ */
(function () {
  'use strict';

  const HT = {};
  window.HT = HT;

  /* ----------------------------------------------------------
     基础工具
  ---------------------------------------------------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // 简易可重复随机（用于生成稳定的噪点图案）
  let seed = 1337;
  function srand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function reseed(s) { seed = s; }

  // 值噪声
  function makeNoise(seedVal) {
    const s = seedVal || 1;
    const perm = new Uint8Array(512);
    const r = (function (x) { return function () { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; })(s);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    function grad(h, x, y) { const u = (h & 1) ? x : -x; const v = (h & 2) ? y : -y; return u + v; }
    return function noise2(x, y) {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      const fx = x - Math.floor(x), fy = y - Math.floor(y);
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = perm[X] + Y, b = perm[X + 1] + Y;
      const aa = perm[a], ab = perm[a + 1], ba = perm[b], bb = perm[b + 1];
      return lerp(lerp(grad(perm[aa], fx, fy), grad(perm[ba], fx - 1, fy), u),
                  lerp(grad(perm[ab], fx, fy - 1), grad(perm[bb], fx - 1, fy - 1), u), v);
    };
  }
  function fbm(noise, x, y, oct, gain) {
    let v = 0, a = 0.5, f = 1, sum = 0;
    for (let i = 0; i < oct; i++) { v += noise(x * f, y * f) * a; sum += a; a *= (gain || 0.5); f *= 2; }
    return v / sum;
  }

  // 斑驳噪点叠加（给 canvas 增加"真实脏污"）
  function addGrain(ctx, w, h, amount, dark) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      d[i] = clamp(d[i] + n, 0, 255);
      d[i + 1] = clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = clamp(d[i + 2] + n, 0, 255);
      if (dark && Math.random() < 0.02) { d[i] *= 0.6; d[i + 1] *= 0.6; d[i + 2] *= 0.6; }
    }
    ctx.putImageData(img, 0, 0);
  }

  /* ----------------------------------------------------------
     PBR 贴图加载
  ---------------------------------------------------------- */
  const texCache = new Map();
  const matCache = new Map();
  HT.ready = false;
  HT.renderer = null;
  HT.maxAniso = 4;
  HT.textures = {};     // key -> {color, normal}
  HT.envMap = null;

  function loadImageTexture(uri, srgb, aniso) {
    return new Promise(function (resolve) {
      if (!uri) return resolve(null);
      const img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        const t = new THREE.Texture(img);
        t.needsUpdate = true;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
        if (srgb) t.encoding = THREE.sRGBEncoding;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = true;
        resolve(t);
      };
      img.onerror = function () { resolve(null); };
      img.src = uri;
    });
  }

  // 程序化环境贴图（反射用，很小，不重要但能提升金属/地面的写实感）
  function buildEnvMap() {
    const size = 64;
    const faces = [];
    for (let f = 0; f < 6; f++) {
      const c = canvas(size, size);
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, size);
      if (f === 2) { grd.addColorStop(0, '#1a2225'); grd.addColorStop(1, '#0a0f10'); }
      else if (f === 3) { grd.addColorStop(0, '#0a0e0e'); grd.addColorStop(1, '#050807'); }
      else { grd.addColorStop(0, '#131b1d'); grd.addColorStop(0.55, '#0b1112'); grd.addColorStop(1, '#070b0b'); }
      g.fillStyle = grd; g.fillRect(0, 0, size, size);
      // 几盏远处灯管的高光
      g.globalAlpha = 0.85;
      g.fillStyle = '#d6e8da';
      if (f === 2 || f === 0 || f === 1) {
        g.fillRect(size * 0.18, size * 0.30, size * 0.20, 2.5);
        g.fillRect(size * 0.66, size * 0.36, size * 0.14, 2);
      }
      if (f === 4) { g.fillStyle = '#7d2b24'; g.fillRect(size * 0.10, size * 0.55, size * 0.08, 2); }
      g.globalAlpha = 1;
      faces.push(c);
    }
    const cube = new THREE.CubeTexture(faces);
    cube.needsUpdate = true;
    cube.encoding = THREE.sRGBEncoding;
    return cube;
  }

  HT.init = function (renderer) {
    HT.renderer = renderer;
    try { HT.maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy()); } catch (e) { HT.maxAniso = 8; }
    HT.envMap = buildEnvMap();

    const data = window.TEXTURE_DATA || {};
    const jobs = [];
    Object.keys(data).forEach(function (key) {
      const d = data[key] || {};
      jobs.push((async function () {
        const color = await loadImageTexture(d.color, true, HT.maxAniso);
        const normal = await loadImageTexture(d.normal, false, HT.maxAniso);
        HT.textures[key] = { color: color, normal: normal, meta: d };
      })());
    });
    // 用数据里标注的"每张图覆盖米数"校准 UV 密度
    Object.keys(data).forEach(function (key) {
      if (data[key] && data[key].size) HT.tileSize[key] = data[key].size;
    });
    return Promise.all(jobs).then(function () {
      HT.ready = true;
      return true;
    });
  };

  /* ----------------------------------------------------------
     材质定义
  ---------------------------------------------------------- */
  // 贴图资产的尺寸（米 / 一张贴图），仅用于世界构建时计算 UV（init 时会被数据文件覆盖）
  HT.tileSize = {
    tileFloor: 1.2, tileWall: 1.2, wallPaint: 1.6, ceiling: 1.2,
    concrete: 2.2, concreteDark: 2.2, metal: 1.0, metalOld: 1.0,
    rust: 1.2, wood: 1.4, woodDark: 1.4, fabric: 1.0,
    paintMetal: 1.0, paper: 0.6
  };

  const MATS = {
    // ---- 建筑表面 ----
    tileFloor:   { tex: 'tileFloor', normalScale: 1.0, roughness: 0.30, metalness: 0.04, color: 0xdfe3dd, envInt: 0.18 },
    tileFloorDark:{tex: 'tileFloor', normalScale: 1.0, roughness: 0.42, metalness: 0.02, color: 0x8e948d, envInt: 0.1 },
    tileWall:    { tex: 'tileWall', normalScale: 0.55, roughness: 0.28, metalness: 0.02, color: 0xe8ebe4, envInt: 0.22 },
    tileWallOld: { tex: 'tileWall', normalScale: 1.0, roughness: 0.5, metalness: 0.0, color: 0xb7b9ac, envInt: 0.1 },
    wallPaint:   { tex: 'wallPaint', normalScale: 0.35, roughness: 0.88, metalness: 0.0, color: 0xd8d9cf, envInt: 0.05 },
    wallPaintGreen:{tex:'wallPaint', normalScale: 0.8, roughness: 0.9, metalness: 0.0, color: 0x9fb3a8, envInt: 0.04 },
    wallPaintDark:{tex: 'wallPaint', normalScale: 0.9, roughness: 0.92, metalness: 0.0, color: 0x6f746c, envInt: 0.03 },
    ceiling:     { tex: 'ceiling', normalScale: 0.4, roughness: 0.96, metalness: 0.0, color: 0xd5d8d0, envInt: 0.02 },
    ceilingDark: { tex: 'ceiling', normalScale: 0.8, roughness: 0.96, metalness: 0.0, color: 0x7d8279, envInt: 0.02 },
    concrete:    { tex: 'concrete', normalScale: 1.0, roughness: 0.94, metalness: 0.0, color: 0xa8a9a2, envInt: 0.03 },
    concreteDark:{ tex: 'concreteDark', normalScale: 1.0, roughness: 0.92, metalness: 0.0, color: 0x8f918c, envInt: 0.03 },
    concreteWet: { tex: 'concrete', normalScale: 1.0, roughness: 0.55, metalness: 0.05, color: 0x8b8f8a, envInt: 0.12 },
    // ---- 金属 ----
    metal:       { tex: 'metal', normalScale: 0.34, roughness: 0.46, metalness: 0.86, color: 0xb7c0bc, envInt: 0.55 },
    metalDark:   { tex: 'metalOld', normalScale: 0.34, roughness: 0.63, metalness: 0.68, color: 0x79817b, envInt: 0.4 },
    metalOld:    { tex: 'metalOld', normalScale: 0.40, roughness: 0.75, metalness: 0.55, color: 0x8d938c, envInt: 0.25 },
    metalLight:  { tex: 'metal', normalScale: 0.5, roughness: 0.3, metalness: 0.92, color: 0xdfe4e0, envInt: 0.7 },
    stainless:   { tex: 'metal', normalScale: 0.4, roughness: 0.22, metalness: 1.0, color: 0xe6e9e6, envInt: 0.85 },
    rust:        { tex: 'rust', normalScale: 0.55, roughness: 0.88, metalness: 0.22, color: 0x9c8a78, envInt: 0.2 },
    // ---- 木 / 布 / 塑 ----
    wood:        { tex: 'wood', normalScale: 0.7, roughness: 0.68, metalness: 0.0, color: 0xa89278, envInt: 0.06 },
    woodDark:    { tex: 'woodDark', normalScale: 0.7, roughness: 0.72, metalness: 0.0, color: 0x7a6852, envInt: 0.05 },
    fabricWhite: { tex: 'fabric', normalScale: 0.9, roughness: 0.96, metalness: 0.0, color: 0xe4e7df, envInt: 0.02 },
    fabricBlue:  { tex: 'fabric', normalScale: 0.9, roughness: 0.96, metalness: 0.0, color: 0x7893a4, envInt: 0.02 },
    fabricGrey:  { tex: 'fabric', normalScale: 0.9, roughness: 0.97, metalness: 0.0, color: 0x8e948e, envInt: 0.02 },
    fabricGreen: { tex: 'fabric', normalScale: 0.9, roughness: 0.96, metalness: 0.0, color: 0x6e8d80, envInt: 0.02 },
    plastic:     { color: 0xd9dbcF, roughness: 0.5, metalness: 0.02, envInt: 0.2 },
    plasticDark: { color: 0x2b3330, roughness: 0.45, metalness: 0.05, envInt: 0.25 },
    rubber:      { color: 0x191d1c, roughness: 0.9, metalness: 0.0, envInt: 0.02 },
    paper:       { tex: 'paper', normalScale: 0.4, roughness: 0.94, metalness: 0.0, color: 0xd9d2c2, envInt: 0.02 },
    // ---- 特殊 ----
    ceramic:     { tex: 'tileWall', normalScale: 0.5, roughness: 0.2, metalness: 0.0, color: 0xf0f2ea, envInt: 0.3 },
    mirror:      { color: 0x8d999c, roughness: 0.05, metalness: 1.0, envInt: 1.2, mirror: true },
    glass:       { color: 0xb8ccc6, roughness: 0.08, metalness: 0.1, envInt: 1.0, glass: true },
    screen:      { color: 0x0a1210, emissive: 0x4fae86, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.2 },
    screenOff:   { color: 0x101614, roughness: 0.35, metalness: 0.2, envInt: 0.3 },
    emissiveWhite:{ color: 0xffffff, emissive: 0xdfeee4, emissiveIntensity: 2.4, roughness: 0.6 },
    emissiveCool: { color: 0xd9e8e2, emissive: 0xbfe5d8, emissiveIntensity: 1.6, roughness: 0.5 },
    emissiveRed: { color: 0x3a0b0b, emissive: 0xc0281e, emissiveIntensity: 1.4, roughness: 0.5 },
    emissiveGreen:{color: 0x0b2016, emissive: 0x39b56e, emissiveIntensity: 1.1, roughness: 0.5 },
    emissiveAmber:{color: 0x2a1c06, emissive: 0xd08a28, emissiveIntensity: 1.2, roughness: 0.5 },
    bodyBag:     { color: 0x101214, roughness: 0.26, metalness: 0.08, envInt: 0.4 },
    paintWhite:  { tex: 'paintMetal', normalScale: 0.4, roughness: 0.5, metalness: 0.08, color: 0xeef0e9, envInt: 0.12 },
    paintGreen:  { tex: 'paintMetal', normalScale: 0.4, roughness: 0.55, metalness: 0.06, color: 0x8fae9f, envInt: 0.1 },
    paintCream:  { tex: 'paintMetal', normalScale: 0.4, roughness: 0.55, metalness: 0.06, color: 0xe2dcc4, envInt: 0.1 },
    // 白色病房：几乎无贴图，高亮
    whiteWall:   { color: 0xf2f5f1, roughness: 0.82, metalness: 0.0, envInt: 0.14 },
    whiteFloor:  { tex: 'tileFloor', normalScale: 0.2, roughness: 0.18, metalness: 0.02, color: 0xffffff, envInt: 0.3 },
    whiteLeather:{ color: 0xeceee9, roughness: 0.42, metalness: 0.0, envInt: 0.2 }
  };
  // 兼容 props.js 的命名
  MATS.paintedWhite = MATS.paintWhite;
  MATS.paintedGreen = MATS.paintGreen;
  MATS.paintedCream = MATS.paintCream;

  HT.mat = function (name, opts) {
    opts = opts || {};
    const key = name + '|' + JSON.stringify(opts);
    if (matCache.has(key)) return matCache.get(key);
    const def = MATS[name] || { color: 0x888888, roughness: 0.8 };
    const params = {
      color: (opts.color !== undefined ? opts.color : def.color) !== undefined ? (opts.color !== undefined ? opts.color : def.color) : 0xffffff,
      roughness: opts.roughness !== undefined ? opts.roughness : (def.roughness !== undefined ? def.roughness : 0.8),
      metalness: opts.metalness !== undefined ? opts.metalness : (def.metalness !== undefined ? def.metalness : 0.0)
    };
    if (def.emissive !== undefined) { params.emissive = new THREE.Color(def.emissive); params.emissiveIntensity = def.emissiveIntensity !== undefined ? def.emissiveIntensity : 1; }
    if (opts.emissive !== undefined) { params.emissive = new THREE.Color(opts.emissive); params.emissiveIntensity = opts.emissiveIntensity || 1; }

    let mat;
    if (def.glass) {
      mat = new THREE.MeshPhysicalMaterial({
        color: params.color, roughness: params.roughness, metalness: params.metalness,
        transparent: true, opacity: opts.opacity !== undefined ? opts.opacity : 0.22,
        envMap: HT.envMap, envMapIntensity: def.envInt || 0.8, depthWrite: false,
        side: THREE.DoubleSide
      });
    } else {
      const tex = def.tex ? HT.textures[def.tex] : null;
      if (tex && tex.color) { params.map = tex.color; }
      if (tex && tex.normal) { params.normalMap = tex.normal; params.normalScale = new THREE.Vector2(def.normalScale || 1, def.normalScale || 1); }
      if (def.envInt !== undefined) { params.envMap = HT.envMap; params.envMapIntensity = def.envInt; }
      mat = new THREE.MeshStandardMaterial(params);
    }
    if (opts.transparent) { mat.transparent = true; }
    if (opts.opacity !== undefined && !def.glass) { mat.transparent = true; mat.opacity = opts.opacity; }
    if (opts.side !== undefined) mat.side = opts.side;
    if (opts.depthWrite !== undefined) mat.depthWrite = opts.depthWrite;
    if (opts.alphaTest !== undefined) { mat.alphaTest = opts.alphaTest; mat.transparent = true; }
    if (opts.emissiveIntensity !== undefined && mat.emissive) mat.emissiveIntensity = opts.emissiveIntensity;
    if (mat.envMap && mat.envMapIntensity !== undefined) {
      mat.envMapIntensity = Math.min(1.8, mat.envMapIntensity * 1.3);
    }
    mat.userData = { name: name, tile: (def.tex ? (HT.tileSize[def.tex] || 1) : 1) };
    matCache.set(key, mat);
    return mat;
  };

  /* ----------------------------------------------------------
     程序化 Canvas 贴图
  ---------------------------------------------------------- */
  const procCache = new Map();

  function procCanvas(key, w, h, draw) {
    if (procCache.has(key)) return procCache.get(key);
    const c = canvas(w, h);
    const g = c.getContext('2d');
    draw(g, w, h);
    procCache.set(key, c);
    return c;
  }

  function toTexture(c, srgb) {
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = HT.maxAniso;
    if (srgb !== false) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ---------- 血迹 ---------- */
  function drawBloodSplat(g, w, h, seedV) {
    reseed(seedV || 7);
    const cx = w * 0.5, cy = h * 0.52;
    const n = 26 + Math.floor(Math.random() * 20);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.pow(Math.random(), 1.6) * w * 0.42;
      const x = cx + Math.cos(a) * dist;
      const y = cy + Math.sin(a) * dist * 0.82;
      const r = rnd(w * 0.012, w * 0.11) * (1 - dist / (w * 0.55));
      const grd = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
      grd.addColorStop(0, 'rgba(58,8,8,0.95)');
      grd.addColorStop(0.55, 'rgba(42,5,5,0.8)');
      grd.addColorStop(1, 'rgba(20,2,2,0)');
      g.fillStyle = grd;
      g.beginPath();
      // 不规则边缘
      const seg = 12;
      for (let s = 0; s <= seg; s++) {
        const aa = (s / seg) * Math.PI * 2;
        const rr = r * rnd(0.72, 1.22);
        const px = x + Math.cos(aa) * rr, py = y + Math.sin(aa) * rr * 0.9;
        if (s === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
    }
    // 流挂
    for (let i = 0; i < 7; i++) {
      const x = cx + rnd(-w * 0.34, w * 0.34);
      const y = cy + rnd(-h * 0.1, h * 0.24);
      const len = rnd(h * 0.12, h * 0.46);
      const grd = g.createLinearGradient(x, y, x, y + len);
      grd.addColorStop(0, 'rgba(48,6,6,0.8)');
      grd.addColorStop(1, 'rgba(28,3,3,0)');
      g.fillStyle = grd;
      g.fillRect(x, y, rnd(1.2, 4.5), len);
    }
    // 飞溅小点
    for (let i = 0; i < 120; i++) {
      g.fillStyle = 'rgba(' + (30 + Math.floor(Math.random() * 40)) + ',4,4,' + rnd(0.25, 0.85) + ')';
      const x = Math.random() * w, y = Math.random() * h;
      const r = Math.pow(Math.random(), 2) * w * 0.012 + 0.4;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 湿光
    for (let i = 0; i < 18; i++) {
      g.fillStyle = 'rgba(150,120,110,' + rnd(0.02, 0.07) + ')';
      g.beginPath(); g.arc(rnd(0, w), rnd(0, h), rnd(2, 14), 0, Math.PI * 2); g.fill();
    }
  }

  /* ---------- 霉菌 / 污渍 ---------- */
  function drawMold(g, w, h, seedV) {
    reseed(seedV || 21);
    const noise = makeNoise(seedV || 3);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w * 5, ny = y / h * 5;
        let v = fbm(noise, nx, ny, 5, 0.55);
        v = clamp((v + 0.15) * 1.6, 0, 1);
        const edge = Math.max(0, 1 - Math.pow(Math.hypot(x / w - 0.5, y / h - 0.5) * 2.1, 2));
        const a = clamp((v - 0.35) * 2.0, 0, 1) * edge;
        const i = (y * w + x) * 4;
        img.data[i] = 32 + v * 26;
        img.data[i + 1] = 38 + v * 30;
        img.data[i + 2] = 30 + v * 18;
        img.data[i + 3] = a * 205;
      }
    }
    // 用离屏画布做柔和
    const tmp = canvas(w, h);
    tmp.getContext('2d').putImageData(img, 0, 0);
    g.filter = 'blur(2px)';
    g.drawImage(tmp, 0, 0);
    g.filter = 'none';
    // 深色霉点
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      g.fillStyle = 'rgba(10,14,9,' + rnd(0.1, 0.5) + ')';
      g.beginPath(); g.ellipse(x, y, rnd(2, 16), rnd(2, 10), Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
  }

  /* ---------- 手印拖痕 ---------- */
  function drawHandprint(g, w, h) {
    reseed(99);
    const cx = w * 0.5, cy = h * 0.55;
    g.fillStyle = 'rgba(50,6,6,0.85)';
    // 手掌
    g.beginPath();
    g.ellipse(cx, cy + h * 0.10, w * 0.10, h * 0.13, -0.15, 0, Math.PI * 2);
    g.fill();
    // 手指
    for (let i = 0; i < 4; i++) {
      const fx = cx - w * 0.09 + i * w * 0.058;
      const fy = cy - h * 0.17 + Math.abs(i - 1.5) * h * 0.02;
      g.save();
      g.translate(fx, fy);
      g.rotate(-0.45 + i * 0.28);
      g.beginPath();
      g.ellipse(0, 0, w * 0.021, h * 0.09, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // 拇指
    g.save();
    g.translate(cx - w * 0.14, cy + h * 0.04);
    g.rotate(-0.9);
    g.beginPath(); g.ellipse(0, 0, w * 0.026, h * 0.075, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    // 拖拽条纹
    for (let i = 0; i < 9; i++) {
      const x = cx - w * 0.10 + Math.random() * w * 0.2;
      const grd = g.createLinearGradient(x, cy, x + rnd(-20, 20), cy + h * 0.5);
      grd.addColorStop(0, 'rgba(48,5,5,0.55)');
      grd.addColorStop(1, 'rgba(30,2,2,0)');
      g.fillStyle = grd;
      g.fillRect(x, cy + h * 0.12, rnd(2, 7), h * 0.42);
    }
    g.filter = 'blur(0.6px)';
    g.drawImage(g.canvas, 0, 0);
    g.filter = 'none';
  }

  /* ---------- 纸张纹理（空白便签） ---------- */
  function drawPaper(g, w, h) {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#d9d2bf'); grd.addColorStop(0.5, '#cfc7b2'); grd.addColorStop(1, '#c2b9a2');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // 纤维
    for (let i = 0; i < 900; i++) {
      g.strokeStyle = 'rgba(120,108,82,' + rnd(0.03, 0.12) + ')';
      g.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y); g.lineTo(x + rnd(-6, 6), y + rnd(-6, 6));
      g.stroke();
    }
    // 折痕
    g.strokeStyle = 'rgba(90,80,60,0.18)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h * 0.33); g.lineTo(w, h * 0.31); g.stroke();
    g.beginPath(); g.moveTo(w * 0.52, 0); g.lineTo(w * 0.53, h); g.stroke();
    // 边缘泛黄
    const vg = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(70,55,30,0.25)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 14);
  }

  /* ---------- 儿童蜡笔画（恐怖涂鸦） ---------- */
  function drawChildDrawing(g, w, h) {
    g.fillStyle = '#e7e2d2'; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 10);
    // 房子/医院
    g.strokeStyle = '#3c5a8a'; g.lineWidth = 5; g.lineJoin = 'round';
    g.strokeRect(w * 0.12, h * 0.42, w * 0.36, h * 0.36);
    g.beginPath(); g.moveTo(w * 0.08, h * 0.42); g.lineTo(w * 0.30, h * 0.26); g.lineTo(w * 0.52, h * 0.42); g.stroke();
    // 窗户（很多窗）
    g.strokeStyle = '#6a86a8'; g.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 1; j++) {
        g.strokeRect(w * (0.17 + i * 0.10), h * (0.50 + j * 0.12), w * 0.06, h * 0.08);
      }
    }
    // 红十字
    g.strokeStyle = '#b03a30'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(w * 0.30, h * 0.31); g.lineTo(w * 0.30, h * 0.39);
    g.moveTo(w * 0.26, h * 0.35); g.lineTo(w * 0.34, h * 0.35); g.stroke();
    // 太阳
    g.strokeStyle = '#c9a13a'; g.lineWidth = 4;
    g.beginPath(); g.arc(w * 0.82, h * 0.16, w * 0.07, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      g.beginPath();
      g.moveTo(w * 0.82 + Math.cos(a) * w * 0.09, h * 0.16 + Math.sin(a) * w * 0.09);
      g.lineTo(w * 0.82 + Math.cos(a) * w * 0.13, h * 0.16 + Math.sin(a) * w * 0.13);
      g.stroke();
    }
    // 小女孩
    g.strokeStyle = '#2f2f2f'; g.lineWidth = 4;
    const px = w * 0.62, py = h * 0.70;
    g.beginPath(); g.arc(px, py - h * 0.16, w * 0.045, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(px, py - h * 0.115); g.lineTo(px, py + h * 0.02);
    g.moveTo(px - w * 0.06, py - h * 0.06); g.lineTo(px + w * 0.06, py - h * 0.08);
    g.moveTo(px, py + h * 0.02); g.lineTo(px - w * 0.05, py + h * 0.12);
    g.moveTo(px, py + h * 0.02); g.lineTo(px + w * 0.05, py + h * 0.12); g.stroke();
    // 很高的黑影子
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 7;
    g.beginPath();
    g.moveTo(w * 0.72, h * 0.84);
    g.lineTo(w * 0.72, h * 0.34);
    g.stroke();
    g.beginPath(); g.arc(w * 0.72, h * 0.28, w * 0.05, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(w * 0.72, h * 0.45); g.lineTo(w * 0.86, h * 0.60);
    g.moveTo(w * 0.72, h * 0.45); g.lineTo(w * 0.58, h * 0.55);
    g.stroke();
    // 两个黑眼睛（用力涂）
    g.fillStyle = '#111';
    g.beginPath(); g.arc(w * 0.70, h * 0.27, 2.5, 0, 7); g.fill();
    g.beginPath(); g.arc(w * 0.74, h * 0.27, 2.5, 0, 7); g.fill();
    // 红色圈（蜡烛笔迹）
    g.strokeStyle = 'rgba(160,30,24,0.85)'; g.lineWidth = 3.5;
    g.beginPath(); g.ellipse(px, py - h * 0.16, w * 0.09, h * 0.12, 0.3, 0, Math.PI * 2); g.stroke();
    // 底部潦草字
    g.fillStyle = 'rgba(40,40,55,0.8)';
    g.font = 'bold 22px "Microsoft YaHei", sans-serif';
    g.save(); g.translate(w * 0.5, h * 0.93); g.rotate(-0.03);
    g.textAlign = 'center'; g.fillText('姐姐 别去 白房间', 0, 0); g.restore();
  }

  /* ---------- 通用标牌 ---------- */
  function drawSign(g, w, h, text, opt) {
    opt = opt || {};
    const bg = opt.bg || '#dfe6dd';
    const fg = opt.fg || '#173b32';
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 12);
    // 斑驳
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(60,55,40,' + rnd(0.02, 0.10) + ')';
      g.beginPath(); g.ellipse(rnd(0, w), rnd(0, h), rnd(2, 30), rnd(2, 16), Math.random() * 3, 0, 7); g.fill();
    }
    if (opt.border !== false) {
      g.strokeStyle = 'rgba(20,30,25,0.55)'; g.lineWidth = Math.max(2, w * 0.012);
      g.strokeRect(w * 0.035, h * 0.07, w * 0.93, h * 0.86);
    }
    g.fillStyle = fg;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (opt.vertical) {
      const ch = text.split('');
      const size = Math.min(h / (ch.length + 1), w * 0.7);
      g.font = 'bold ' + size + 'px "Microsoft YaHei", sans-serif';
      ch.forEach(function (c, i) { g.fillText(c, w / 2, h * 0.06 + size * (i + 0.7)); });
    } else {
      let fs = opt.fontSize || h * 0.42;
      g.font = 'bold ' + fs + 'px "Microsoft YaHei", sans-serif';
      while (g.measureText(text).width > w * 0.86 && fs > 8) {
        fs -= 2; g.font = 'bold ' + fs + 'px "Microsoft YaHei", sans-serif';
      }
      g.fillText(text, w / 2, h / 2 + (opt.sub ? -h * 0.08 : 0));
      if (opt.sub) {
        g.font = Math.max(9, fs * 0.38) + 'px "Microsoft YaHei", sans-serif';
        g.fillStyle = opt.subColor || 'rgba(25,40,33,0.7)';
        g.fillText(opt.sub, w / 2, h * 0.72);
      }
    }
    return g;
  }

  /* ---------- 海报：静默疗法 ---------- */
  function drawTherapyPoster(g, w, h) {
    g.fillStyle = '#ded9c8'; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 16);
    g.fillStyle = '#1c3f38';
    g.fillRect(0, 0, w, h * 0.16);
    g.fillStyle = '#e8ede5';
    g.font = 'bold ' + (w * 0.105) + 'px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('静 默 疗 法', w / 2, h * 0.082);
    g.fillStyle = 'rgba(25,45,40,0.85)';
    g.font = 'bold ' + (w * 0.045) + 'px "Microsoft YaHei", sans-serif';
    g.fillText('第三期志愿者招募', w / 2, h * 0.23);
    // 头部剪影 + 手
    const cx = w * 0.5, cy = h * 0.45;
    g.fillStyle = 'rgba(40,55,52,0.65)';
    g.beginPath(); g.ellipse(cx, cy, w * 0.17, h * 0.14, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(40,55,52,0.45)';
    for (let s = 0; s < 2; s++) {
      g.save();
      g.translate(cx + (s ? 1 : -1) * w * 0.02, cy + h * 0.10);
      g.rotate((s ? 1 : -1) * 0.5);
      g.beginPath(); g.ellipse(0, h * 0.06, w * 0.05, h * 0.16, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.fillStyle = 'rgba(20,30,28,0.8)';
    g.font = (w * 0.032) + 'px "Microsoft YaHei", sans-serif';
    g.textAlign = 'left';
    const lines = ['· 免除全部治疗费用', '· 全程无痛，无需服药', '· 一次治疗，告别恐惧', '· 名额有限，自愿报名'];
    lines.forEach(function (t, i) { g.fillText(t, w * 0.10, h * (0.64 + i * 0.058)); });
    // 红章
    g.save(); g.translate(w * 0.80, h * 0.83); g.rotate(-0.18);
    g.strokeStyle = 'rgba(150,32,26,0.75)'; g.lineWidth = w * 0.008;
    g.beginPath(); g.arc(0, 0, w * 0.08, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(150,32,26,0.75)';
    g.font = 'bold ' + (w * 0.028) + 'px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center'; g.fillText('仁和医院', 0, -w * 0.008); g.fillText('研究组', 0, w * 0.028);
    g.restore();
    // 底部小字
    g.fillStyle = 'rgba(40,50,45,0.6)';
    g.font = (w * 0.018) + 'px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.fillText('请前往三楼东翼护士站登记  ·  研究编号 MIRROR-03', w / 2, h * 0.965);
  }

  /* ---------- 海报：消防疏散图 ---------- */
  function drawEvacMap(g, w, h) {
    g.fillStyle = '#e2e4da'; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 10);
    g.strokeStyle = '#243a35'; g.lineWidth = 3;
    g.strokeRect(w * 0.03, h * 0.03, w * 0.94, h * 0.94);
    g.fillStyle = '#1d3a33';
    g.font = 'bold ' + (w * 0.05) + 'px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.fillText('三 楼 东 翼 · 疏 散 图', w / 2, h * 0.10);
    // 走廊
    g.strokeStyle = 'rgba(30,50,45,0.75)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w * 0.08, h * 0.48); g.lineTo(w * 0.92, h * 0.48); g.stroke();
    // 房间
    g.lineWidth = 2.5;
    const rooms = [[0.10, 0.18, 0.14, 0.18], [0.28, 0.18, 0.12, 0.18], [0.44, 0.18, 0.14, 0.18], [0.62, 0.18, 0.12, 0.18], [0.78, 0.18, 0.12, 0.18],
                   [0.10, 0.56, 0.14, 0.2], [0.28, 0.56, 0.12, 0.2], [0.44, 0.56, 0.14, 0.2], [0.62, 0.56, 0.12, 0.2], [0.78, 0.56, 0.12, 0.2]];
    rooms.forEach(function (r) { g.strokeRect(w * r[0], h * r[1], w * r[2], h * r[3]); });
    // 红色出口
    g.fillStyle = 'rgba(170,40,32,0.85)';
    g.fillRect(w * 0.90, h * 0.44, w * 0.05, h * 0.08);
    g.fillStyle = '#fff'; g.font = 'bold ' + (w * 0.022) + 'px sans-serif';
    g.fillText('EXIT', w * 0.925, h * 0.495);
    // 你在这里
    g.fillStyle = 'rgba(200,30,30,0.9)';
    g.beginPath(); g.arc(w * 0.30, h * 0.48, w * 0.014, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#243a35'; g.font = (w * 0.02) + 'px "Microsoft YaHei", sans-serif';
    g.fillText('你在这里', w * 0.385, h * 0.475);
    // 备注
    g.textAlign = 'left'; g.fillStyle = 'rgba(40,50,45,0.75)';
    g.font = (w * 0.024) + 'px "Microsoft YaHei", sans-serif';
    g.fillText('※ 发生紧急情况时，请勿使用电梯', w * 0.08, h * 0.84);
    g.fillText('※ 听从工作人员指挥，有序撤离', w * 0.08, h * 0.88);
    g.fillStyle = 'rgba(140,35,28,0.85)';
    g.fillText('※ 地下一层为限制区域，禁止通行', w * 0.08, h * 0.92);
  }

  /* ---------- 海报：病房须知 ---------- */
  function drawRulesPoster(g, w, h) {
    g.fillStyle = '#e6e5d9'; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 12);
    g.fillStyle = '#203b34';
    g.font = 'bold ' + (w * 0.085) + 'px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.fillText('病 房 须 知', w / 2, h * 0.12);
    g.strokeStyle = 'rgba(30,55,48,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(w * 0.12, h * 0.16); g.lineTo(w * 0.88, h * 0.16); g.stroke();
    g.textAlign = 'left'; g.fillStyle = 'rgba(30,45,40,0.9)';
    g.font = (w * 0.032) + 'px "Microsoft YaHei", sans-serif';
    const rules = ['一、请勿在夜间离开病房。', '二、走廊灯熄灭时，请留在原地。', '三、听到呼唤您名字的声音，不要回应。', '四、镜子里的您，如果动作慢了一拍，', '      请立即闭上眼睛。', '五、护士站没有夜班护士。', '六、如见到穿病号服的高个子，', '      不要看他，不要跑。'];
    rules.forEach(function (t, i) { g.fillText(t, w * 0.10, h * (0.255 + i * 0.082)); });
    // 血色手印覆盖一角
    g.globalAlpha = 0.5;
    const hpc = procCanvas('np_handprint_hint', 256, 256, function (gg, ww, hh) { drawHandprint(gg, ww, hh); });
    g.drawImage(hpc, w * 0.58, h * 0.66, w * 0.36, h * 0.36);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(120,25,20,0.8)';
    g.font = 'bold ' + (w * 0.026) + 'px "KaiTi", serif';
    g.save(); g.translate(w * 0.22, h * 0.95); g.rotate(-0.06);
    g.fillText('不要相信记录', 0, 0); g.restore();
  }

  /* ---------- X 光片 ---------- */
  function drawXray(g, w, h) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#0a1216'); grd.addColorStop(0.5, '#0d171c'); grd.addColorStop(1, '#070d10');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 18);
    g.globalAlpha = 0.75;
    // 胸腔轮廓
    g.strokeStyle = 'rgba(190,215,220,0.55)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(w * 0.34, h * 0.16);
    g.bezierCurveTo(w * 0.20, h * 0.30, w * 0.20, h * 0.60, w * 0.32, h * 0.80);
    g.moveTo(w * 0.66, h * 0.16);
    g.bezierCurveTo(w * 0.80, h * 0.30, w * 0.80, h * 0.60, w * 0.68, h * 0.80);
    g.stroke();
    // 脊柱
    g.strokeStyle = 'rgba(210,230,235,0.5)'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(w * 0.5, h * 0.10); g.lineTo(w * 0.5, h * 0.86); g.stroke();
    // 肋骨
    g.strokeStyle = 'rgba(200,225,230,0.42)'; g.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      const y = h * (0.20 + i * 0.062);
      g.beginPath();
      g.moveTo(w * 0.5, y);
      g.quadraticCurveTo(w * 0.34, y + h * 0.02, w * 0.28, y + h * 0.055);
      g.moveTo(w * 0.5, y);
      g.quadraticCurveTo(w * 0.66, y + h * 0.02, w * 0.72, y + h * 0.055);
      g.stroke();
    }
    // 心影
    g.fillStyle = 'rgba(150,190,200,0.16)';
    g.beginPath(); g.ellipse(w * 0.56, h * 0.55, w * 0.13, h * 0.13, 0.3, 0, Math.PI * 2); g.fill();
    // 肺部的"高个子"阴影
    g.globalAlpha = 0.32;
    g.fillStyle = '#050a0c';
    g.beginPath();
    g.ellipse(w * 0.40, h * 0.44, w * 0.045, h * 0.055, 0, 0, 7);
    g.fill();
    g.fillRect(w * 0.385, h * 0.48, w * 0.03, h * 0.22);
    g.beginPath();
    g.moveTo(w * 0.39, h * 0.52); g.lineTo(w * 0.32, h * 0.66);
    g.moveTo(w * 0.41, h * 0.53); g.lineTo(w * 0.49, h * 0.64);
    g.lineWidth = 7; g.strokeStyle = '#050a0c'; g.stroke();
    g.globalAlpha = 1;
    // 顶部信息
    g.fillStyle = 'rgba(170,200,205,0.6)';
    g.font = '16px "Consolas", monospace';
    g.fillText('RENHE HOSPITAL  /  CHEST PA  /  P-047', w * 0.06, h * 0.07);
    g.fillText('2023-03-12  02:37', w * 0.06, h * 0.935);
    // 定位线
    g.strokeStyle = 'rgba(150,190,200,0.25)'; g.lineWidth = 1.5;
    g.strokeRect(w * 0.04, h * 0.05, w * 0.92, h * 0.9);
  }

  /* ---------- 值班表 / 日历 ---------- */
  function drawCalendar(g, w, h) {
    g.fillStyle = '#dfdccd'; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 10);
    g.fillStyle = '#233c35';
    g.font = 'bold ' + (w * 0.06) + 'px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.fillText('三 月', w * 0.5, h * 0.10);
    g.font = (w * 0.022) + 'px "Microsoft YaHei", sans-serif';
    g.fillStyle = 'rgba(35,55,48,0.75)';
    g.fillText('2023 年   东翼护理组', w * 0.5, h * 0.15);
    // 星期
    const days = ['一', '二', '三', '四', '五', '六', '日'];
    g.font = (w * 0.024) + 'px "Microsoft YaHei", sans-serif';
    for (let i = 0; i < 7; i++) g.fillText(days[i], w * (0.12 + i * 0.122), h * 0.22);
    // 日期格子
    g.strokeStyle = 'rgba(35,55,48,0.3)'; g.lineWidth = 1;
    for (let d = 0; d < 31; d++) {
      const col = (d + 2) % 7, row = Math.floor((d + 2) / 7);
      const x = w * (0.07 + col * 0.122), y = h * (0.26 + row * 0.098);
      g.strokeRect(x, y, w * 0.10, h * 0.078);
      g.fillStyle = 'rgba(35,55,48,0.8)';
      g.font = (w * 0.022) + 'px "Microsoft YaHei", sans-serif';
      g.fillText(String(d + 1), x + w * 0.05, y + h * 0.048);
      if (d + 1 === 12) {
        g.strokeStyle = 'rgba(150,30,24,0.85)'; g.lineWidth = 3;
        g.beginPath(); g.arc(x + w * 0.05, y + h * 0.039, w * 0.055, 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(150,30,24,0.9)';
        g.font = 'bold ' + (w * 0.019) + 'px "Microsoft YaHei", sans-serif';
        g.fillText('事故', x + w * 0.05, y + h * 0.075);
        g.strokeStyle = 'rgba(35,55,48,0.3)'; g.lineWidth = 1;
      }
    }
    // 手写
    g.fillStyle = 'rgba(40,40,45,0.85)';
    g.font = 'italic ' + (w * 0.028) + 'px "KaiTi", serif';
    g.save(); g.translate(w * 0.16, h * 0.93); g.rotate(-0.04);
    g.fillText('3.12 之后，东翼不再排班', 0, 0); g.restore();
  }

  /* ---------- 旧报纸 ---------- */
  function drawNewspaper(g, w, h) {
    g.fillStyle = '#d8d3c2'; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 20);
    // 头版报头
    g.strokeStyle = 'rgba(40,40,40,0.8)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w * 0.05, h * 0.13); g.lineTo(w * 0.95, h * 0.13); g.stroke();
    g.fillStyle = '#2a2723';
    g.font = 'bold ' + (w * 0.075) + 'px "SimSun", serif';
    g.textAlign = 'center';
    g.fillText('仁 和 医 院 院 报', w * 0.5, h * 0.09);
    g.font = 'bold ' + (w * 0.042) + 'px "SimSun", serif';
    g.textAlign = 'left';
    g.fillText('东翼病区火灾：3 人遇难，12 人失踪', w * 0.05, h * 0.22);
    g.fillStyle = 'rgba(30,28,25,0.85)';
    g.font = (w * 0.021) + 'px "SimSun", serif';
    const lines = [
      '本报讯  3 月 12 日凌晨，我院东翼三楼病区',
      '发生一起不明原因火灾。消防部门于 02:51',
      '接警，03:20 明火被扑灭。据院方通报，火',
      '灾造成 3 名患者死亡，另有 12 名患者及 2',
      '名医护人员下落不明。',
      '  院方表示，起火原因正在调查中，受损病区',
      '已封闭停用。对于失踪人员，院方称"部分',
      '患者已于事发前转院"。但多名家属向本报',
      '反映，从未收到任何转院通知。',
      '  记者调查发现，东翼三楼此前长期用于开',
      '展一项名为"静默疗法"的临床研究。研究',
      '负责人沈某已于事发后离职，去向不明。',
      '  截至发稿，院方未就"静默疗法"作出回应。'
    ];
    lines.forEach(function (t, i) { g.fillText(t, w * 0.05, h * (0.28 + i * 0.036)); });
    // 照片框
    g.strokeStyle = 'rgba(30,28,25,0.5)'; g.lineWidth = 2;
    g.strokeRect(w * 0.55, h * 0.50, w * 0.40, h * 0.28);
    g.fillStyle = 'rgba(60,60,55,0.35)';
    g.fillRect(w * 0.55, h * 0.50, w * 0.40, h * 0.28);
    g.fillStyle = 'rgba(30,28,25,0.55)';
    g.font = (w * 0.017) + 'px "SimSun", serif';
    g.textAlign = 'center';
    g.fillText('（资料图：被烧毁的东翼走廊）', w * 0.75, h * 0.81);
    g.textAlign = 'left';
    // 红笔圈
    g.strokeStyle = 'rgba(150,25,20,0.8)'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(w * 0.42, h * 0.235, w * 0.30, h * 0.028, 0, 0, Math.PI * 2); g.stroke();
  }

  /* ---------- 患者信息卡 ---------- */
  function drawPatientCard(g, w, h) {
    g.fillStyle = '#1a2a26'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#dfe8e2'; g.fillRect(w * 0.03, h * 0.05, w * 0.94, h * 0.90);
    addGrain(g, w, h, 8);
    g.fillStyle = '#1c3730';
    g.font = 'bold ' + (w * 0.06) + 'px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.fillText('仁和医院 · 住院患者卡', w / 2, h * 0.16);
    g.strokeStyle = 'rgba(30,50,45,0.4)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(w * 0.08, h * 0.19); g.lineTo(w * 0.92, h * 0.19); g.stroke();
    // 照片位
    g.fillStyle = 'rgba(70,80,75,0.5)'; g.fillRect(w * 0.08, h * 0.26, w * 0.22, h * 0.30);
    g.fillStyle = 'rgba(220,225,218,0.25)';
    g.beginPath(); g.arc(w * 0.19, h * 0.36, w * 0.045, 0, 7); g.fill();
    g.beginPath(); g.ellipse(w * 0.19, h * 0.48, w * 0.07, h * 0.06, 0, 0, 7); g.fill();
    const rows = [['姓名', '林 晚'], ['性别', '女'], ['年龄', '23'], ['科室', '东翼 · 精神科'], ['床号', '302'], ['住院号', 'RH-23-0312-047'], ['诊断', '创伤后应激障碍'], ['治疗方案', '静默疗法 · 第三期']];
    g.textAlign = 'left';
    rows.forEach(function (r, i) {
      const y = h * (0.30 + i * 0.078);
      g.fillStyle = 'rgba(30,50,45,0.65)';
      g.font = (w * 0.030) + 'px "Microsoft YaHei", sans-serif';
      g.fillText(r[0], w * 0.38, y);
      g.fillStyle = '#1c3730';
      g.font = 'bold ' + (w * 0.032) + 'px "Microsoft YaHei", sans-serif';
      g.fillText(r[1], w * 0.52, y);
    });
    // 红色手写
    g.fillStyle = 'rgba(150,25,20,0.85)';
    g.font = 'bold ' + (w * 0.032) + 'px "KaiTi", serif';
    g.save(); g.translate(w * 0.36, h * 0.90); g.rotate(-0.03);
    g.fillText('她不是病人。她是你。', 0, 0); g.restore();
    // 条形码
    g.fillStyle = 'rgba(25,35,32,0.85)';
    for (let i = 0; i < 46; i++) {
      g.fillRect(w * (0.60 + i * 0.0075), h * 0.84, i % 3 === 0 ? w * 0.004 : w * 0.002, h * 0.10);
    }
  }

  /* ---------- 手写便签（空白，文字由交互 UI 显示） ---------- */
  function drawNote(g, w, h) {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#e2dcc9'); grd.addColorStop(1, '#c9c0a8');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    addGrain(g, w, h, 12);
    // 横线
    g.strokeStyle = 'rgba(90,80,60,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const y = h * (0.14 + i * 0.058);
      g.beginPath(); g.moveTo(w * 0.08, y); g.lineTo(w * 0.92, y); g.stroke();
    }
    // 红边
    g.strokeStyle = 'rgba(150,40,35,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w * 0.08, 0); g.lineTo(w * 0.08, h); g.stroke();
    // 折痕
    g.strokeStyle = 'rgba(100,90,70,0.25)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h * 0.52); g.lineTo(w, h * 0.50); g.stroke();
  }

  /* ---------- 瓷砖/地面细节叠加（用于世界里的局部污迹） ---------- */
  function drawFloorStain(g, w, h, seedV) {
    reseed(seedV || 5);
    const noise = makeNoise(seedV || 5);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = fbm(noise, x / w * 4, y / h * 4, 5, 0.6);
        const a = clamp((v - 0.1) * 1.5, 0, 1) * 0.5;
        const i = (y * w + x) * 4;
        img.data[i] = 28; img.data[i + 1] = 26; img.data[i + 2] = 20;
        img.data[i + 3] = a * 180;
      }
    }
    const tmp = canvas(w, h); tmp.getContext('2d').putImageData(img, 0, 0);
    g.filter = 'blur(3px)'; g.drawImage(tmp, 0, 0); g.filter = 'none';
  }

  /* ---------- 弹孔 / 裂纹 ---------- */
  function drawCrack(g, w, h, seedV) {
    reseed(seedV || 13);
    g.strokeStyle = 'rgba(12,12,12,0.8)';
    for (let b = 0; b < 5; b++) {
      let x = w * (0.3 + Math.random() * 0.4), y = h * (0.3 + Math.random() * 0.4);
      let a = Math.random() * Math.PI * 2;
      g.lineWidth = rnd(1, 3.5);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 26; s++) {
        a += rnd(-0.5, 0.5);
        x += Math.cos(a) * rnd(3, 14); y += Math.sin(a) * rnd(3, 14);
        g.lineTo(x, y);
        if (Math.random() < 0.18) { g.stroke(); g.beginPath(); g.moveTo(x, y); }
      }
      g.stroke();
    }
    // 中心冲击点
    const cx = w * 0.5, cy = h * 0.5;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, w * 0.06);
    rg.addColorStop(0, 'rgba(5,5,5,0.9)'); rg.addColorStop(0.5, 'rgba(20,20,18,0.5)'); rg.addColorStop(1, 'rgba(30,30,28,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, w * 0.06, 0, 7); g.fill();
  }

  /* ----------------------------------------------------------
     程序化贴图对外 API
  ---------------------------------------------------------- */
  const PROC_DEFS = {
    blood1: ['blood1', 512, 512, function (g, w, h) { drawBloodSplat(g, w, h, 7); }],
    blood2: ['blood2', 512, 512, function (g, w, h) { drawBloodSplat(g, w, h, 77); }],
    blood3: ['blood3', 512, 512, function (g, w, h) { drawBloodSplat(g, w, h, 311); }],
    handprint: ['handprint', 512, 512, function (g, w, h) { g.clearRect(0, 0, w, h); drawHandprint(g, w, h); }],
    mold1: ['mold1', 512, 512, function (g, w, h) { g.clearRect(0, 0, w, h); drawMold(g, w, h, 21); }],
    mold2: ['mold2', 512, 512, function (g, w, h) { g.clearRect(0, 0, w, h); drawMold(g, w, h, 88); }],
    crack: ['crack', 512, 512, function (g, w, h) { g.clearRect(0, 0, w, h); drawCrack(g, w, h, 13); }],
    floorstain: ['floorstain', 512, 512, function (g, w, h) { g.clearRect(0, 0, w, h); drawFloorStain(g, w, h, 5); }],
    paper: ['paper', 512, 512, drawPaper],
    childdrawing: ['childdrawing', 512, 640, drawChildDrawing],
    postertherapy: ['postertherapy', 512, 768, drawTherapyPoster],
    posterevac: ['posterevac', 512, 640, drawEvacMap],
    posterrules: ['posterrules', 512, 700, drawRulesPoster],
    xray: ['xray', 512, 640, drawXray],
    calendar: ['calendar', 512, 700, drawCalendar],
    newspaper: ['newspaper', 640, 512, drawNewspaper],
    patientcard: ['patientcard', 512, 340, drawPatientCard],
    note: ['note', 512, 640, drawNote],
    // 标牌
    signNurse: ['signNurse', 512, 170, function (g, w, h) { drawSign(g, w, h, '护士站', { bg: '#dfe6dd', fg: '#173b32', sub: 'NURSE STATION' }); }],
    signPharmacy: ['signPharmacy', 512, 170, function (g, w, h) { drawSign(g, w, h, '药 房', { bg: '#d8e2d8', fg: '#1d3b31', sub: 'PHARMACY · 仅限授权人员' }); }],
    sign302: ['sign302', 256, 256, function (g, w, h) { drawSign(g, w, h, '302', { bg: '#dfe6dd', fg: '#173b32', sub: '观察病房' }); }],
    sign301: ['sign301', 256, 256, function (g, w, h) { drawSign(g, w, h, '301', { bg: '#dfe6dd', fg: '#173b32' }); }],
    sign303: ['sign303', 256, 256, function (g, w, h) { drawSign(g, w, h, '303', { bg: '#dfe6dd', fg: '#173b32' }); }],
    sign304: ['sign304', 256, 256, function (g, w, h) { drawSign(g, w, h, '304', { bg: '#dfe6dd', fg: '#173b32' }); }],
    sign305: ['sign305', 256, 256, function (g, w, h) { drawSign(g, w, h, '305', { bg: '#dfe6dd', fg: '#173b32' }); }],
    sign306: ['sign306', 256, 256, function (g, w, h) { drawSign(g, w, h, '306', { bg: '#dfe6dd', fg: '#173b32' }); }],
    signStair: ['signStair', 256, 256, function (g, w, h) { drawSign(g, w, h, '安全出口', { bg: '#1f5c46', fg: '#eaf4ec', sub: 'EXIT · 楼梯间' }); }],
    signMorgue: ['signMorgue', 512, 170, function (g, w, h) { drawSign(g, w, h, '太平间', { bg: '#c9d2c9', fg: '#132420', sub: 'MORGUE · B1' }); }],
    signCold: ['signCold', 512, 170, function (g, w, h) { drawSign(g, w, h, '尸体冷藏', { bg: '#c9d2c9', fg: '#132420', sub: 'COLD STORAGE · 禁止入内' }); }],
    signWhite: ['signWhite', 512, 170, function (g, w, h) { drawSign(g, w, h, '静默治疗室', { bg: '#eef1ec', fg: '#1a2b26', sub: 'PROJECT MIRROR · ROOM 0' }); }],
    signIsolation: ['signIsolation', 512, 170, function (g, w, h) { drawSign(g, w, h, '隔离区', { bg: '#d8c9b8', fg: '#5c1e18', sub: 'AUTHORIZED PERSONNEL ONLY' }); }],
    signFire: ['signFire', 256, 256, function (g, w, h) { drawSign(g, w, h, '消防栓', { bg: '#a8342a', fg: '#f2e9e2' }); }],
    signExit: ['signExit', 512, 180, function (g, w, h) { drawSign(g, w, h, '安 全 出 口', { bg: '#175c40', fg: '#e6f4ea', sub: 'EXIT' }); }]
  };

  HT.procCanvas = function (kind) {
    const def = PROC_DEFS[kind];
    if (!def) return null;
    return procCanvas(def[0], def[1], def[2], def[3]);
  };

  HT.procTexture = function (kind, opts) {
    opts = opts || {};
    const c = HT.procCanvas(kind);
    if (!c) return null;
    const key = 'tex|' + kind + '|' + (opts.repeat ? 'r' + opts.repeat : '');
    if (texCache.has(key)) return texCache.get(key);
    const t = toTexture(c);
    if (opts.repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(opts.repeat, opts.repeat);
    }
    texCache.set(key, t);
    return t;
  };

  // 交互物表面贴图（海报/X光片/标牌/纸张等），带自发光开关
  HT.decalMat = function (kind, opts) {
    opts = opts || {};
    const key = 'decal|' + kind + '|' + JSON.stringify(opts);
    if (matCache.has(key)) return matCache.get(key);
    const tex = HT.procTexture(kind);
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: !!opts.transparent,
      opacity: opts.opacity !== undefined ? opts.opacity : 1,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.FrontSide,
      emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : 0x000000,
      emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 0,
      emissiveMap: opts.emissive ? tex : null,
      alphaTest: opts.alphaTest || 0,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
    if (opts.doubleSide) m.side = THREE.DoubleSide;
    matCache.set(key, m);
    return m;
  };

  HT.signMat = function (kind, opts) {
    opts = opts || {};
    const key = 'sign|' + kind + '|' + JSON.stringify(opts);
    if (matCache.has(key)) return matCache.get(key);
    const tex = HT.procTexture(kind);
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.6,
      metalness: 0.0,
      emissive: new THREE.Color(opts.emissive !== undefined ? opts.emissive : 0x22331e),
      emissiveMap: tex,
      emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 0.12
    });
    matCache.set(key, m);
    return m;
  };

  /* ----------------------------------------------------------
     Jump Scare 脸（Canvas 绘制，1024 全屏）
  ---------------------------------------------------------- */
  const faceCache = new Map();
  function drawFace(kind) {
    const S = 1024;
    const c = canvas(S, S);
    const g = c.getContext('2d');
    const cx = S * 0.5, cy = S * 0.5;
    if (kind === 'stitched') {
      // 无眼、缝合的白脸
      g.fillStyle = '#050607'; g.fillRect(0, 0, S, S);
      const rg = g.createRadialGradient(cx, cy, S * 0.06, cx, cy, S * 0.62);
      rg.addColorStop(0, '#c9c8bd'); rg.addColorStop(0.42, '#a7a89d'); rg.addColorStop(1, '#101211');
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(cx, cy + S * 0.03, S * 0.29, S * 0.38, 0, 0, Math.PI * 2); g.fill();
      // 额头高光 / 凹陷
      const hg = g.createRadialGradient(cx - S * 0.08, cy - S * 0.16, 10, cx, cy - S * 0.1, S * 0.35);
      hg.addColorStop(0, 'rgba(240,240,230,0.35)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hg; g.beginPath(); g.ellipse(cx, cy + S * 0.03, S * 0.29, S * 0.38, 0, 0, 7); g.fill();
      // 缝合的眼睛
      g.strokeStyle = 'rgba(30,24,22,0.95)'; g.lineWidth = 7;
      for (let s = -1; s <= 1; s += 2) {
        g.beginPath(); g.moveTo(cx + s * S * 0.17, cy - S * 0.05);
        g.quadraticCurveTo(cx + s * S * 0.10, cy - S * 0.09, cx + s * S * 0.06, cy - S * 0.04); g.stroke();
        // 缝线
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          const x = cx + s * (0.17 - 0.11 * t) * S, y = cy - S * (0.05 + 0.035 * Math.sin(t * Math.PI));
          g.beginPath(); g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.stroke();
        }
        // 眼下缝线延伸
        g.beginPath(); g.moveTo(cx + s * S * 0.20, cy - S * 0.02); g.lineTo(cx + s * S * 0.24, cy + S * 0.05); g.stroke();
      }
      // 嘴：细长的缝
      g.beginPath(); g.moveTo(cx - S * 0.14, cy + S * 0.22); g.quadraticCurveTo(cx, cy + S * 0.215, cx + S * 0.14, cy + S * 0.22); g.stroke();
      for (let i = 0; i < 11; i++) {
        const x = cx - S * 0.14 + i * S * 0.028;
        const y = cy + S * 0.218;
        g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke();
      }
      // 鼻孔
      g.fillStyle = 'rgba(20,16,14,0.9)';
      g.beginPath(); g.ellipse(cx - S * 0.035, cy + S * 0.10, S * 0.012, S * 0.02, 0.2, 0, 7); g.fill();
      g.beginPath(); g.ellipse(cx + S * 0.035, cy + S * 0.10, S * 0.012, S * 0.02, -0.2, 0, 7); g.fill();
      // 头发
      g.strokeStyle = 'rgba(8,8,8,0.85)'; g.lineWidth = 4;
      for (let i = 0; i < 90; i++) {
        const a = -Math.PI * 0.85 + Math.random() * Math.PI * 0.7;
        const r0 = S * 0.30, r1 = S * 0.44;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0 * 1.02, cy + Math.sin(a) * r0 * 1.25 + S * 0.03);
        g.quadraticCurveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 1.3 + S * 0.03,
                           cx + Math.cos(a + 0.06) * r1 * 1.12, cy + Math.sin(a + 0.1) * r1 * 1.5 + S * 0.05);
        g.stroke(); g.lineWidth = rnd(2, 5);
      }
      // 裂纹
      g.strokeStyle = 'rgba(70,25,20,0.5)'; g.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        let x = cx + rnd(-S * 0.2, S * 0.2), y = cy + rnd(-S * 0.2, S * 0.25);
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += rnd(-18, 18); y += rnd(4, 20); g.lineTo(x, y); }
        g.stroke();
      }
      addGrain(g, S, S, 26);
      // 暗角
      const vg = g.createRadialGradient(cx, cy, S * 0.2, cx, cy, S * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.92)');
      g.fillStyle = vg; g.fillRect(0, 0, S, S);
      return c;
    }
    // 普通尖叫脸
    g.fillStyle = '#040506'; g.fillRect(0, 0, S, S);
    const bg = g.createRadialGradient(cx, cy, S * 0.05, cx, cy, S * 0.7);
    bg.addColorStop(0, '#2a2f2c'); bg.addColorStop(1, '#040506');
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    // 脸型
    const skin = g.createRadialGradient(cx - S * 0.05, cy - S * 0.10, S * 0.02, cx, cy, S * 0.42);
    skin.addColorStop(0, '#d8d4c4'); skin.addColorStop(0.45, '#b9b6a6'); skin.addColorStop(0.8, '#8e9084'); skin.addColorStop(1, '#4a4c46');
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(cx, cy + S * 0.02, S * 0.27, S * 0.37, 0, 0, Math.PI * 2);
    g.fill();
    // 颧骨阴影
    const shade = g.createRadialGradient(cx, cy + S * 0.12, S * 0.05, cx, cy + S * 0.16, S * 0.35);
    shade.addColorStop(0, 'rgba(40,42,38,0.55)'); shade.addColorStop(1, 'rgba(40,42,38,0)');
    g.fillStyle = shade;
    g.beginPath(); g.ellipse(cx, cy + S * 0.05, S * 0.27, S * 0.37, 0, 0, 7); g.fill();
    // 眼窝
    for (let s = -1; s <= 1; s += 2) {
      const ex = cx + s * S * 0.115, ey = cy - S * 0.075;
      const eg = g.createRadialGradient(ex, ey, S * 0.005, ex, ey, S * 0.105);
      eg.addColorStop(0, '#000000'); eg.addColorStop(0.55, 'rgba(6,6,6,0.92)'); eg.addColorStop(1, 'rgba(30,25,22,0)');
      g.fillStyle = eg;
      g.beginPath(); g.ellipse(ex, ey, S * 0.105, S * 0.085, 0, 0, 7); g.fill();
      // 眼白/瞳孔微光
      g.fillStyle = 'rgba(190,190,175,0.55)';
      g.beginPath(); g.arc(ex + s * S * 0.012, ey + S * 0.005, S * 0.016, 0, 7); g.fill();
      g.fillStyle = '#000';
      g.beginPath(); g.arc(ex + s * S * 0.012, ey + S * 0.005, S * 0.010, 0, 7); g.fill();
      // 开裂红肿的眼眶
      g.strokeStyle = 'rgba(90,25,20,0.6)'; g.lineWidth = 3;
      g.beginPath();
      g.ellipse(ex, ey, S * 0.105, S * 0.085, 0, 0, 7);
      g.stroke();
    }
    // 鼻孔
    g.fillStyle = 'rgba(20,15,12,0.95)';
    g.beginPath(); g.ellipse(cx - S * 0.04, cy + S * 0.08, S * 0.016, S * 0.026, 0.25, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + S * 0.04, cy + S * 0.08, S * 0.016, S * 0.026, -0.25, 0, 7); g.fill();
    // 嘴：张大的黑洞
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(cx, cy + S * 0.245, S * 0.10, S * 0.155, 0, 0, Math.PI * 2);
    g.fill();
    // 撕裂缝合的嘴部边缘
    g.strokeStyle = 'rgba(70,20,16,0.8)'; g.lineWidth = 5;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const rx = S * (0.10 + 0.012 * Math.sin(i * 1.7));
      const ry = S * (0.155 + 0.012 * Math.cos(i * 2.1));
      const x = cx + Math.cos(a) * rx, y = cy + S * 0.245 + Math.sin(a) * ry;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.stroke();
    // 牙齿
    g.fillStyle = 'rgba(215,212,190,0.85)';
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.9 + (i / 8) * Math.PI * 1.8;
      const x = cx + Math.cos(a) * S * 0.085;
      const y = cy + S * 0.245 + Math.sin(a) * S * 0.12;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      g.fillRect(-S * 0.011, -S * 0.012, S * 0.022, S * 0.024);
      g.restore();
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.9 - (i / 8) * Math.PI * 1.8;
      const x = cx + Math.cos(a) * S * 0.085;
      const y = cy + S * 0.245 + Math.sin(a) * S * 0.12;
      g.save(); g.translate(x, y); g.rotate(a - Math.PI / 2);
      g.fillStyle = 'rgba(180,178,160,0.75)';
      g.fillRect(-S * 0.010, -S * 0.011, S * 0.020, S * 0.022);
      g.restore();
    }
    // 嘴角血
    g.fillStyle = 'rgba(70,8,8,0.75)';
    for (let i = 0; i < 8; i++) {
      const x = cx + rnd(-S * 0.12, S * 0.12);
      const y = cy + S * rnd(0.36, 0.42);
      g.fillRect(x, y, rnd(2, 6), rnd(10, 90));
    }
    // 血管
    g.strokeStyle = 'rgba(80,30,30,0.45)';
    for (let i = 0; i < 26; i++) {
      let x = cx + rnd(-S * 0.24, S * 0.24), y = cy + rnd(-S * 0.3, S * 0.25);
      g.lineWidth = rnd(0.8, 2.2);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += rnd(-12, 12); y += rnd(-6, 14); g.lineTo(x, y); }
      g.stroke();
    }
    // 头发
    g.strokeStyle = 'rgba(6,6,7,0.9)';
    for (let i = 0; i < 120; i++) {
      const a = -Math.PI * 0.86 + Math.random() * Math.PI * 0.72;
      const r0 = S * 0.28, r1 = S * 0.46;
      g.lineWidth = rnd(1.5, 4.5);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 1.28 + S * 0.03);
      g.quadraticCurveTo(cx + Math.cos(a + 0.05) * r1 * 1.05, cy + Math.sin(a + 0.05) * r1 * 1.3 + S * 0.03,
                         cx + Math.cos(a + 0.1) * r1 * 1.2, cy + Math.sin(a + 0.12) * r1 * 1.55 + S * 0.06);
      g.stroke();
    }
    addGrain(g, S, S, 34, true);
    // 暗角，压住边缘只留脸
    const vg = g.createRadialGradient(cx, cy, S * 0.18, cx, cy, S * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.98)');
    g.fillStyle = vg; g.fillRect(0, 0, S, S);
    return c;
  }

  HT.face = function (kind) {
    kind = kind || 'face';
    if (faceCache.has(kind)) return faceCache.get(kind);
    const c = drawFace(kind);
    faceCache.set(kind, c);
    return c;
  };

  /* ----------------------------------------------------------
     屏幕噪点纹理（CSS 背景）+ 环境反射
  ---------------------------------------------------------- */
  HT.buildGrain = function () {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = Math.random() < 0.5 ? 30 : 0;
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };

  // 生成"手电筒光斑/尘埃"用的圆形 sprite
  HT.dustSprite = function () {
    const c = canvas(64, 64);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    return toTexture(c);
  };

  // 任意文字标牌（缓存）
  var signTexCache = new Map();
  HT.signTexture = function (text, opts) {
    opts = opts || {};
    var key = 'sign|' + text + '|' + JSON.stringify(opts);
    if (signTexCache.has(key)) return signTexCache.get(key);
    var c = canvas(512, 170);
    var g = c.getContext('2d');
    drawSign(g, 512, 170, text, opts);
    var t = toTexture(c);
    signTexCache.set(key, t);
    return t;
  };

  HT.dispose = function () {
    texCache.forEach(function (t) { if (t && t.dispose && t !== t) t.dispose(); });
    texCache.clear();
  };
})();
