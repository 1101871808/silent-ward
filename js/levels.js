/* ============================================================
   静默病栋 SILENT WARD — 关卡布局 levels.js
   ward    : 三楼东翼（序章 ~ 第三章）
   basement: 地下一层（第四章）
   white   : 白房（终章）
   ============================================================ */
(function () {
  'use strict';

  var HW = window.HW;
  var T = THREE;
  var HT = window.HT;
  var M = function (n, o) { return HT.mat(n, o); };
  var P = function (name, opts) {
    if (window.HP && typeof HP[name] === 'function') {
      try { return HP[name](opts || {}); } catch (e) { console.warn('[levels] 道具生成失败:', name, e); }
    }
    var g = new T.Group();
    g.userData.dims = { w: 0.5, h: 0.5, d: 0.5 };
    return g;
  };

  // 房间号 / 指示牌
  function roomSign(b, tex, x, y, z, wall, w, h) {
    return b.sign({ tex: tex, x: x, y: y, z: z, wall: wall, w: w || 0.34, h: h || 0.34, mount: false });
  }
  function textSign(b, text, x, y, z, wall, w, h, opts) {
    opts = opts || {};
    return b.sign({ text: text, x: x, y: y, z: z, wall: wall, w: w || 0.55, h: h || 0.18, mount: false, signOpts: opts, emissiveIntensity: opts.emissiveIntensity });
  }

  /* ============================================================
     三楼东翼
     ============================================================ */
  HW.LEVELS.ward = function (b) {
    var H = 2.95;
    var floorMat = M('tileFloor', { color: 0x9aa096 });
    var ceilMat = M('ceiling', { color: 0xa6aaa0 });
    var wallMat = M('wallPaint', { color: 0x9daa9f });
    var tileMat = M('tileWall', { color: 0xa9b0a4 });
    var metalDark = M('metalDark');
    var paintDoor = M('paintCream', { color: 0x6f7b6f, roughness: 0.72 });
    var wardLayers = [
      { y0: 0, y1: 1.15, mat: tileMat, tile: HT.tileSize.tileWall },
      { y0: 1.15, y1: H, mat: wallMat, tile: HT.tileSize.wallPaint }
    ];
    b.ambient.fogColor = 0x040708;
    b.ambient.fogDensity = 0.085;
    b.ambient.ambientColor = 0x1d2c31;
    b.ambient.ambientIntensity = 0.20;
    b.ambient.hemiSky = 0x1c2b2e; b.ambient.hemiGround = 0x080b0a; b.ambient.hemiIntensity = 0.10;
    b.ambient.exposure = 0.70;
    b.ambient.flashlight = true;

    /* ---------------- 走廊 ---------------- */
    b.floor(-20, -1.45, 20, 1.45, floorMat, HT.tileSize.tileFloor);
    b.ceiling(-20, -1.45, 20, 1.45, ceilMat, H, HT.tileSize.ceiling);
    // 北墙（走廊一侧法线 +Z）
    b.wall({
      axis: 'x', fixed: -1.51, from: -20, to: 20.2, y1: H, layers: wardLayers, openings: [
        { center: -15.0, width: 1.06, height: 2.05 },
        { center: -8.6, width: 1.06, height: 2.05 },
        { center: -1.7, width: 1.06, height: 2.05 },
        { center: 16.6, width: 1.06, height: 2.05 }
      ]
    });
    // 南墙（法线 -Z）
    b.wall({
      axis: 'x', fixed: 1.51, from: -20, to: 20.2, y1: H, layers: wardLayers, openings: [
        { center: -16.8, width: 1.06, height: 2.05 },
        { center: -11.5, width: 1.06, height: 2.05 },
        { center: -4.5, width: 1.06, height: 2.05 },
        { center: 2.7, width: 1.06, height: 2.05 },
        { center: 12.5, width: 3.0, height: 2.3 }
      ]
    });
    // 西端墙 + 安全出口
    b.wall({
      axis: 'z', fixed: -20.06, from: -1.51, to: 1.51, y1: H, layers: wardLayers,
      openings: [{ center: 0, width: 1.06, height: 2.05 }]
    });
    // 东端电梯厅
    b.floor(20, -3.3, 25.2, 3.3, floorMat, HT.tileSize.tileFloor);
    b.ceiling(20, -3.3, 25.2, 3.3, ceilMat, H, HT.tileSize.ceiling);
    b.wall({ axis: 'z', fixed: 20.06, from: -3.36, to: -1.51, y1: H, layers: wardLayers });
    b.wall({ axis: 'z', fixed: 20.06, from: 1.51, to: 3.36, y1: H, layers: wardLayers });
    b.wall({ axis: 'x', fixed: -3.36, from: 20, to: 25.2, y1: H, layers: wardLayers });
    b.wall({ axis: 'x', fixed: 3.36, from: 20, to: 25.2, y1: H, layers: wardLayers });
    b.wall({ axis: 'z', fixed: 25.26, from: -3.36, to: 3.36, y1: H, layers: wardLayers });
    // 护士站宽门洞的门槛
    b.box({ x1: 11.0, x2: 14.0, y1: 0, y2: 0.012, z1: 1.40, z2: 1.62, mat: floorMat, tile: HT.tileSize.tileFloor, collide: false });
    // 走廊踢脚线
    b.box({ x1: -20, x2: 20.2, y1: 0, y2: 0.09, z1: -1.45, z2: -1.425, mat: metalDark, tile: 1, collide: false });
    b.box({ x1: -20, x2: 20.2, y1: 0, y2: 0.09, z1: 1.425, z2: 1.45, mat: metalDark, tile: 1, collide: false });

    /* ---------------- 房间外壳 ---------------- */
    function roomShell(cfg) {
      return b.room({
        x1: cfg.x1, x2: cfg.x2, z1: cfg.z1, z2: cfg.z2, side: cfg.side, height: H,
        floorMat: cfg.floorMat || floorMat, ceilMat: cfg.ceilMat || ceilMat,
        wallMat: cfg.wallMat || wallMat, lowerMat: cfg.lowerMat || tileMat,
        lowerH: cfg.lowerH !== undefined ? cfg.lowerH : 1.15,
        plainWall: cfg.plainWall
      });
    }

    /* ---------------- 302 起始病房 ---------------- */
    roomShell({ x1: -19.4, x2: -14.2, z1: 1.57, z2: 5.6, side: 'south' });
    b.prop(P('bed', { disheveled: false }), -18.2, 3.1, { rotY: Math.PI / 2 });
    // 床头柜
    b.box({ x1: -14.75, x2: -14.25, y1: 0, y2: 0.6, z1: 2.70, z2: 3.20, mat: M('woodDark'), collide: true });
    b.box({ x1: -14.77, x2: -14.23, y1: 0.6, y2: 0.64, z1: 2.68, z2: 3.22, mat: M('wood'), collide: false });
    b.box({ x1: -14.73, x2: -14.70, y1: 0.18, y2: 0.46, z1: 2.74, z2: 3.16, mat: M('wood'), collide: false });
    b.pickup({ id: 'item_flashlight', itemId: 'flashlight', name: '老式手电筒', kind: 'flashlight', x: -14.5, y: 0.648, z: 3.05, rotY: 0.3, scale: 1.35, glintScale: 0.6, radius: 3.1 });
    b.paper({ id: 'file_302', tex: 'patientcard', kind: 'file', x: -14.45, y: 0.648, z: 2.9, w: 0.34, h: 0.24, rotY: 0.4 });
    b.paper({ id: 'note302', tex: 'note', kind: 'note', x: -16.1, y: 0.014, z: 4.35, w: 0.3, h: 0.38, rotY: 0.5, glint: true });
    b.prop(P('ivStand', { bag: true }), -18.55, 4.25, { rotY: 0.3, collide: false });
    b.prop(P('chair'), -15.15, 5.15, { rotY: Math.PI * 2.3 });
    b.prop(P('desk'), -15.4, 2.05, { rotY: 0 });
    b.prop(P('chair'), -15.4, 2.85, { rotY: Math.PI });
    b.paper({ id: 'note_desk302', tex: 'note', kind: 'note', x: -15.75, y: 0.775, z: 2.0, w: 0.26, h: 0.34, rotY: 0.3 });
    // 窗户（南墙，朝房间内 = -Z）
    b.box({ x1: -18.0, x2: -15.6, y1: 1.0, y2: 2.3, z1: 5.535, z2: 5.565, mat: M('glass'), collide: false });
    b.box({ x1: -18.05, x2: -15.55, y1: 0.97, y2: 1.0, z1: 5.52, z2: 5.58, mat: metalDark, collide: false });
    b.box({ x1: -18.05, x2: -15.55, y1: 2.3, y2: 2.35, z1: 5.52, z2: 5.58, mat: metalDark, collide: false });
    b.plane({ w: 2.3, h: 1.25, x: -16.8, y: 1.65, z: 5.61, mat: M('emissiveCool', { emissiveIntensity: 0.22 }), rotY: Math.PI, noMerge: true });
    b.prop(P('curtainRail', { w: 2.4 }), -16.8, 5.38, { rotY: Math.PI, y: 2.73, collide: false });
    b.prop(P('curtain', { w: 1.1, h: 2.5, color: '#6e837d' }), -17.6, 5.52, { rotY: Math.PI, y: 0.25, collide: false });
    b.prop(P('clock'), -14.19, 3.1, { rotY: -Math.PI / 2, y: 2.1, collide: false });
    b.mirror({ x: -14.19, y: 1.55, z: 4.35, wall: 'w', w: 0.6, h: 0.95 });
    b.decal({ tex: 'mold2', x: -15.3, y: 2.3, z: 1.57, wall: 's', w: 1.2, h: 0.8, opacity: 0.4 });
    b.fixture({ x: -16.8, z: 3.5, circuit: 'ward', on: true, flicker: 0, intensity: 0.55, color: 0xcfdccf });
    b.fixture({ x: -16.8, y: 2.3, z: 1.585, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.35 });
    b.fixture({ x: -16.8, y: 1.9, z: 5.35, type: 'desk', circuit: 'moon', on: true, intensity: 1.05, color: 0x6f93b8, noMesh: true });
    b.fixture({ x: -15.4, y: 1.02, z: 2.05, type: 'desk', circuit: 'emergency', on: true, intensity: 0.6, color: 0xffb066 });
    textSign(b, '302', -16.8, 2.35, 1.44, 'n', 0.3, 0.3);

    /* ---------------- 301 储物 / 治疗室 ---------------- */
    roomShell({ x1: -18.6, x2: -13.4, z1: -5.4, z2: -1.57, side: 'north' });
    b.prop(P('cabinet'), -17.3, -5.05, { rotY: 0 });
    b.prop(P('cabinet'), -16.25, -5.05, { rotY: 0 });
    b.prop(P('cabinet'), -15.2, -5.05, { rotY: 0 });
    b.pickup({ id: 'item_fuse', itemId: 'fuse', name: '保险丝', kind: 'fuse', x: -16.25, y: 1.66, z: -5.05 });
    // 货架
    b.box({ x1: -18.5, x2: -18.1, y1: 0, y2: 2.1, z1: -4.8, z2: -3.2, mat: M('metalDark'), collide: true });
    for (var sh = 0; sh < 3; sh++) {
      b.box({ x1: -18.5, x2: -18.05, y1: 0.55 + sh * 0.65, y2: 0.6 + sh * 0.65, z1: -4.8, z2: -3.2, mat: M('metal'), collide: false });
    }
    b.prop(P('medicalCart'), -14.3, -4.6, { rotY: -0.4 });
    b.prop(P('desk'), -17.4, -2.55, { rotY: Math.PI });
    b.paper({ id: 'note301', tex: 'note', kind: 'note', x: -17.4, y: 0.775, z: -2.6, w: 0.3, h: 0.38, rotY: 0.1 });
    b.prop(P('chair'), -17.4, -3.3, { rotY: 0, collide: false });
    b.prop(P('wheelchair'), -13.85, -3.95, { rotY: -0.6 });
    b.prop(P('fileBox'), -13.75, -4.9, { rotY: 0.2, collide: false });
    b.prop(P('fileBox'), -13.7, -4.4, { rotY: -0.4, collide: false });
    b.poster({ tex: 'posterevac', x: -15.9, y: 1.65, z: -5.395, wall: 's', w: 0.75, h: 0.95 });
    b.decal({ tex: 'mold1', x: -18.60, y: 0.6, z: -3.6, wall: 'e', w: 1.4, h: 1.1, opacity: 0.45 });
    b.fixture({ x: -16.0, z: -3.5, circuit: 'ward', on: false, flicker: 0.18 });
    textSign(b, '处置室', -15.0, 2.35, -1.44, 's', 0.55, 0.18, { bg: '#dfe6dd', fg: '#173b32' });

    /* ---------------- 303 病房 ---------------- */
    roomShell({ x1: -11.8, x2: -6.2, z1: -5.4, z2: -1.57, side: 'north' });
    b.prop(P('bed', { disheveled: true }), -10.4, -3.6, { rotY: 0 });
    b.prop(P('ivStand'), -11.2, -4.6, { rotY: 0.4, collide: false });
    b.prop(P('chair'), -6.7, -4.3, { rotY: -Math.PI * 0.6 });
    b.prop(P('wheelchair'), -7.2, -2.3, { rotY: -0.5 });
    b.paper({ id: 'file_303', tex: 'paper', kind: 'file', x: -10.4, y: 0.505, z: -3.1, w: 0.3, h: 0.4, rotY: 0.3 });
    b.paper({ id: 'note303', tex: 'note', kind: 'note', x: -9.7, y: 0.505, z: -4.55, w: 0.3, h: 0.38, rotY: -0.2 });
    b.prop(P('curtainRail', { w: 2.4 }), -9.4, -3.6, { rotY: Math.PI / 2, y: 2.73, collide: false });
    b.prop(P('curtain', { w: 2.4, h: 2.5, color: '#7f9a94' }), -9.35, -3.6, { rotY: Math.PI / 2, y: 0.25, collide: false });
    b.poster({ tex: 'xray', x: -10.4, y: 1.7, z: -5.395, wall: 's', w: 0.55, h: 0.68 });
    b.poster({ id: 'poster_isolation', read: true, data: {poster: true}, tex: 'signIsolation', x: -6.20, y: 1.5, z: -3.9, wall: 'w', w: 0.6, h: 0.2 });
    b.mirror({ x: -6.20, y: 1.5, z: -2.4, wall: 'w', w: 0.7, h: 1.0 });
    b.decal({ tex: 'blood2', x: -9.5, y: 0.013, z: -2.9, onFloor: true, w: 1.1, h: 1.1, opacity: 0.75, rotZ: 0.4 });
    
    b.fixture({ x: -9.0, z: -3.5, circuit: 'ward', on: false, flicker: 0.3 });
    textSign(b, '303', -8.6, 2.35, -1.44, 's', 0.3, 0.3);

    /* ---------------- 305 病房 ---------------- */
    roomShell({ x1: -4.6, x2: 0.2, z1: -5.4, z2: -1.57, side: 'north' });
    b.prop(P('bed', { occupied: true, disheveled: true }), -3.3, -3.6, { rotY: 0 });
    b.prop(P('monitorStand', { on: true }), -2.2, -4.7, { rotY: 0.2, collide: false });
    b.prop(P('ivStand'), -4.1, -4.6, { rotY: 0.2, collide: false });
    b.box({ x1: -4.45, x2: -3.95, y1: 0, y2: 0.6, z1: -2.65, z2: -2.15, mat: M('woodDark'), collide: true });
    b.box({ x1: -4.47, x2: -3.93, y1: 0.6, y2: 0.64, z1: -2.67, z2: -2.13, mat: M('wood'), collide: false });
    b.paper({ id: 'file_305', tex: 'patientcard', kind: 'file', x: -4.2, y: 0.648, z: -2.4, w: 0.34, h: 0.24, rotY: 0.2 });
    b.prop(P('chair'), -1.2, -4.2, { rotY: Math.PI * 1.2 });
    b.poster({ id: 'poster_child', read: true, data: {poster: true}, tex: 'childdrawing', x: -2.3, y: 1.55, z: -5.395, wall: 's', w: 0.62, h: 0.78 });
    b.decal({ tex: 'blood1', x: -3.3, y: 0.014, z: -2.50, onFloor: true, w: 1.0, h: 1.0, opacity: 0.5 });
    b.fixture({ x: -2.2, z: -3.5, circuit: 'ward', on: false, flicker: 0.4 });
    textSign(b, '305', -1.7, 2.35, -1.44, 's', 0.3, 0.3);

    /* ---------------- 药房 ---------------- */
    roomShell({ x1: 13.8, x2: 18.8, z1: -5.4, z2: -1.57, side: 'north' });
    // 药架（开放式层架）
    var shelfMetal = M('metal');
    b.box({ x1: 14.0, x2: 14.07, y1: 0, y2: 2.05, z1: -5.38, z2: -4.82, mat: shelfMetal, collide: false });
    b.box({ x1: 18.53, x2: 18.6, y1: 0, y2: 2.05, z1: -5.38, z2: -4.82, mat: shelfMetal, collide: false });
    b.box({ x1: 14.0, x2: 18.6, y1: 0, y2: 2.05, z1: -5.38, z2: -5.31, mat: M('metalDark'), collide: false });
    b.box({ x1: 14.0, x2: 18.6, y1: 0, y2: 0.06, z1: -5.38, z2: -4.82, mat: M('metalDark'), collide: true });
    var shelfYs = [0.66, 1.3, 1.94];
    shelfYs.forEach(function (sy) {
      b.box({ x1: 14.0, x2: 18.6, y1: sy, y2: sy + 0.04, z1: -5.38, z2: -4.82, mat: shelfMetal, collide: false });
    });
    var drugCols = [0xcfd7c8, 0xd8cfb8, 0xb9c7c9, 0xc9bba9, 0xdfe3da, 0xbfc6ba];
    for (var sh2 = 0; sh2 < 3; sh2++) {
      var baseY = sh2 === 0 ? 0.06 : shelfYs[sh2 - 1] + 0.04;
      for (var bx = 0; bx < 8; bx++) {
        var bw = 0.28 + (bx % 3) * 0.05;
        var bh = 0.16 + (bx % 2) * 0.1;
        var bx0 = 14.14 + bx * 0.55;
        b.box({ x1: bx0, x2: bx0 + bw, y1: baseY, y2: baseY + bh, z1: -5.24, z2: -5.02, mat: M('paper', { color: drugCols[bx % 6] }), collide: false });
        if (bx % 3 === 1) {
          b.box({ x1: bx0 + 0.06, x2: bx0 + 0.16, y1: baseY, y2: baseY + 0.12, z1: -5.12, z2: -5.02, mat: M('plastic', { color: 0xd8e0d6 }), collide: false });
        }
      }
    }
    // 货架旁的小推梯
    b.box({ x1: 18.66, x2: 18.78, y1: 0, y2: 1.5, z1: -4.4, z2: -4.3, mat: M('metal'), collide: false });
    b.box({ x1: 18.66, x2: 18.78, y1: 0, y2: 1.5, z1: -3.7, z2: -3.6, mat: M('metal'), collide: false });
    // 药房柜台
    // 柜台整体往房间深处挪，避开药房门扇的开门弧线
    b.box({ x1: 14.2, x2: 15.9, y1: 0, y2: 0.95, z1: -3.15, z2: -2.65, mat: M('metal'), collide: true });
    b.box({ x1: 14.15, x2: 15.95, y1: 0.952, y2: 1.0, z1: -3.2, z2: -2.60, mat: M('stainless'), collide: false });
    b.pickup({ id: 'item_elevatorCard', itemId: 'elevatorCard', name: '电梯卡', kind: 'card', x: 14.55, y: 1.005, z: -2.9, glintColor: 0xffd27a });
    b.paper({ id: 'file_pharmacy', tex: 'newspaper', kind: 'file', x: 14.95, y: 1.005, z: -2.9, w: 0.36, h: 0.28, rotY: 0.25 });
    b.prop(P('tapeRecorder'), 15.5, -2.95, { rotY: -0.2, y: 1.0, collide: false });
    b.tape({ id: 'tape_pharmacy', x: 15.35, y: 1.005, z: -2.75, rotY: 0.4 });
    b.pickup({ id: 'item_battery_pharm', itemId: 'battery_pharm', name: '电池', kind: 'battery', x: 15.7, y: 1.005, z: -2.75, glintColor: 0xe0d08a });
    b.prop(P('medicalCart'), 17.9, -3.2, { rotY: 0.3 });
    b.prop(P('cabinet'), 18.4, -4.4, { rotY: Math.PI / 2 });
    b.prop(P('sink'), 18.55, -2.2, { rotY: Math.PI / 2, collide: false });
    b.prop(P('trashBin'), 13.9, -1.95, { rotY: 0.2, collide: false });
    b.sign({ text: '药 房 · 密 码 门 禁', x: 15.25, y: 1.78, z: -1.44, wall: 's', w: 0.7, h: 0.2, mount: true, signOpts: { bg: '#d8e2d8', fg: '#1d3b31', sub: 'KEYPAD · 按 E 输入' }, emissiveIntensity: 0.3 });
    b.poster({ id: 'poster_therapy', read: true, data: {poster: true}, tex: 'postertherapy', x: 16.3, y: 1.62, z: -5.395, wall: 's', w: 0.62, h: 0.94 });
    b.prop(P('phone'), 18.79, -3.6, { rotY: -Math.PI / 2, y: 1.2, collide: false });
    b.fixture({ x: 16.3, z: -3.5, circuit: 'pharmacy', on: false, flicker: 0.15 });
    b.fixture({ x: 17.0, y: 2.3, z: -1.585, type: 'emergency', wall: 'n', circuit: 'emergency', on: true, intensity: 0.7 });
    textSign(b, '药房', 15.4, 2.35, -1.44, 's', 0.5, 0.17);
    // 药房密码键盘
    var keypad = P('keypad');
    b.prop(keypad, 15.2, -1.44, { rotY: 0, y: 1.35, collide: false });
    var keypadProxy = b.proxy(15.2, 1.35, -1.4, 0.24, 0.32, 0.14);
    b.addInteractable({
      id: 'keypad_pharmacy', kind: 'keypad', object: keypadProxy, prompt: '输入门禁密码', radius: 2.8,
      data: { doorId: 'doorPharmacy', code: '0312' }, pos: new T.Vector3(15.2, 1.35, -1.4),
      glint: b._glint(15.2, 1.5, -1.42, 0x7fe0b0)
    });

    /* ---------------- 配电室 ---------------- */
    roomShell({ x1: -13.4, x2: -9.4, z1: 1.57, z2: 4.9, side: 'south' });
    // 配电柜（贴东墙，正面朝房间内侧）
    b.box({ x1: -9.90, x2: -9.45, y1: 0, y2: 2.1, z1: 2.2, z2: 4.5, mat: M('metalDark'), collide: true });
    for (var pp = 0; pp < 3; pp++) {
      b.box({ x1: -9.92, x2: -9.89, y1: 0.3, y2: 2.0, z1: 2.35 + pp * 0.72, z2: 2.95 + pp * 0.72, mat: M('metal'), collide: false });
      b.box({ x1: -9.95, x2: -9.90, y1: 1.10, y2: 1.28, z1: 2.50 + pp * 0.72, z2: 2.65 + pp * 0.72, mat: M('emissiveAmber', { emissiveIntensity: 0.4 }), collide: false });
    }
    // 闸刀面板（在柜体正面）
    b.box({ x1: -9.94, x2: -9.89, y1: 1.0, y2: 1.9, z1: 3.0, z2: 4.2, mat: M('metal'), collide: false });
    var switchIds = [];
    for (var sw = 0; sw < 3; sw++) {
      var sz = 3.2 + sw * 0.35;
      var lever = b.box({ x1: -9.97, x2: -9.90, y1: 1.28, y2: 1.58, z1: sz - 0.035, z2: sz + 0.035, mat: M('stainless'), collide: false, noMerge: true });
      var lp = b.proxy(-9.93, 1.42, sz, 0.16, 0.5, 0.24);
      switchIds.push(b.addInteractable({
        id: 'switch_' + (sw + 1), kind: 'switch', object: lp, prompt: '配电箱 · 装保险丝 / 拉闸', radius: 2.5,
        data: { index: sw, lever: lever, panelX: -9.93 }, pos: new T.Vector3(-9.93, 1.42, sz)
      }));
      b.sign({ text: ['东', '中', '西'][sw], x: -9.95, y: 1.86, z: sz, wall: 'w', w: 0.14, h: 0.09, mount: false, signOpts: { bg: '#2a2a26', fg: '#e0d8c0' }, emissiveIntensity: 0.15 });
    }
    // 配电室工作灯（紧急供电，照亮配电柜）
    b.fixture({ x: -9.78, y: 2.02, z: 3.55, type: 'desk', circuit: 'emergency', on: true, intensity: 0.5, color: 0xffb066, noMesh: true });
    b.paper({ id: 'note_switch', tex: 'note', kind: 'note', x: -10.6, y: 1.3, z: 4.885, wall: 'n', w: 0.3, h: 0.38, rotZ: 0.1 });
    b.prop(P('pipes', { length: 3.2, axis: 'x' }), -11.4, 4.6, { y: 2.59, rotY: Math.PI / 2, collide: false });
    b.prop(P('trashBin'), -13.0, 1.9, { rotY: 0.4, collide: false });
    b.prop(P('fireExtinguisher'), -9.55, 1.58, { rotY: 0, y: 0.45, collide: false });
    b.poster({ tex: 'signFire', x: -13.34, y: 1.5, z: 2.2, wall: 'e', w: 0.3, h: 0.3 });
    b.sign({ text: '配 电 箱 · 高 压 危 险', x: -9.41, y: 2.3, z: 3.6, wall: 'w', w: 0.9, h: 0.24, mount: true, signOpts: { bg: '#d8c435', fg: '#141410', sub: 'HIGH VOLTAGE' }, emissiveIntensity: 0.3 });
    b.fixture({ x: -11.4, z: 3.2, circuit: 'ward', on: false, flicker: 0.2 });
    b.fixture({ x: -11.4, y: 2.45, z: 4.84, type: 'emergency', wall: 'n', circuit: 'emergency', on: true, intensity: 0.8 });
    textSign(b, '配电室', -11.5, 2.35, 1.44, 'n', 0.7, 0.2);

    /* ---------------- 304 病房（事件现场） ---------------- */
    roomShell({ x1: -6.8, x2: -2.0, z1: 1.57, z2: 5.0, side: 'south' });
    b.prop(P('bed', { disheveled: true }), -5.5, 3.3, { rotY: Math.PI / 2 });
    b.paper({ id: 'file_304', tex: 'patientcard', kind: 'file', x: -4.0, y: 0.016, z: 3.6, w: 0.34, h: 0.24, rotY: 0.5 });
    b.paper({ id: 'note304', tex: 'note', kind: 'note', x: -6.2, y: 0.016, z: 1.9, w: 0.3, h: 0.38, rotY: 1.2 });
    b.decal({ tex: 'blood1', x: -4.6, y: 0.014, z: 3.0, onFloor: true, w: 1.5, h: 1.5, opacity: 0.85 });
    b.decal({ tex: 'blood3', x: -5.2, y: 0.015, z: 4.2, onFloor: true, w: 1.2, h: 1.2, opacity: 0.7, rotZ: 1.3 });
    b.decal({ tex: 'handprint', x: -6.80, y: 1.2, z: 4.1, wall: 'e', w: 0.5, h: 0.5, opacity: 0.8 });
    b.decal({ tex: 'handprint', x: -5.9, y: 1.05, z: 5.00, wall: 'n', w: 0.45, h: 0.45, opacity: 0.6, rotZ: Math.PI });
    b.decal({ tex: 'mold2', x: -6.80, y: 0.5, z: 2.2, wall: 'e', w: 1.3, h: 1.6, opacity: 0.4 });
    b.mirror({ x: -6.80, y: 1.55, z: 3.2, wall: 'e', w: 0.8, h: 1.1 });
    b.fixture({ x: -4.4, z: 3.3, circuit: 'ward', on: false, flicker: 0.5 });
    textSign(b, '304', -4.5, 2.35, 1.44, 'n', 0.3, 0.3);

    /* ---------------- 306 病房（尸体推床） ---------------- */
    roomShell({ x1: 0.0, x2: 4.8, z1: 1.57, z2: 5.2, side: 'south' });
    b.prop(P('gurney', { bodyBag: true }), 2.4, 3.3, { rotY: Math.PI / 2 });
    b.prop(P('cabinet'), 4.3, 4.4, { rotY: Math.PI });
    b.paper({ id: 'file_306', tex: 'paper', kind: 'file', x: 1.3, y: 0.016, z: 4.45, w: 0.3, h: 0.4, rotY: -0.3 });
    b.paper({ id: 'note306', tex: 'note', kind: 'note', x: 3.2, y: 0.016, z: 2.0, w: 0.3, h: 0.38, rotY: 0.8 });
    b.poster({ tex: 'childdrawing', x: 0.06, y: 1.5, z: 3.1, wall: 'e', w: 0.5, h: 0.62 });
    b.decal({ tex: 'blood2', x: 2.4, y: 0.014, z: 2.2, onFloor: true, w: 1.0, h: 1.0, opacity: 0.6 });
    b.fixture({ x: 2.4, z: 3.4, circuit: 'ward', on: false, flicker: 0.25 });
    b.fixture({ x: 2.4, y: 2.3, z: 1.585, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.8 });
    textSign(b, '306', 2.7, 2.35, 1.44, 'n', 0.3, 0.3);

    /* ---------------- 护士站 ---------------- */
    roomShell({ x1: 8.8, x2: 17.6, z1: 1.57, z2: 6.6, side: 'south' });
    b.prop(P('nurseDesk', { w: 2.7, d: 0.95 }), 12.9, 3.55, { rotY: Math.PI });
    b.prop(P('chair'), 13.6, 4.55, { rotY: Math.PI });
    b.prop(P('chair'), 12.2, 4.55, { rotY: Math.PI - 0.4 });
    b.prop(P('monitorStand', { on: false }), 10.7, 3.2, { rotY: Math.PI, collide: false });
    b.prop(P('tapeRecorder'), 12.9, 3.45, { rotY: 0, y: 0.78, collide: false });
    b.tape({ id: 'tape_nurse', x: 12.45, y: 0.785, z: 3.4, rotY: 0.3 });
    b.paper({ id: 'note_nurse_code', tex: 'note', kind: 'note', x: 13.5, y: 0.785, z: 3.55, w: 0.3, h: 0.38, rotY: -0.15 });
    b.paper({ id: 'file_nurse', tex: 'calendar', kind: 'file', x: 11.7, y: 0.785, z: 3.6, w: 0.32, h: 0.42, rotY: 0.1 });
    b.prop(P('phone'), 8.81, 1.35, { rotY: Math.PI / 2, y: 1.2, collide: false });
    b.prop(P('cabinet'), 9.3, 5.9, { rotY: 0 });
    b.prop(P('cabinet'), 10.4, 5.9, { rotY: 0 });
    b.locker({ id: 'locker_nurse', x: 17.2, z: 6.3, rotY: Math.PI });
    b.prop(P('gurney'), 16.0, 5.6, { rotY: Math.PI / 2 });
    b.prop(P('ivStand'), 15.0, 5.9, { rotY: 0.2, collide: false });
    b.prop(P('trashBin'), 17.2, 2.1, { rotY: 0.3, collide: false });
    b.poster({ id: 'poster_rules', read: true, data: {poster: true}, tex: 'posterrules', x: 9.9, y: 1.6, z: 6.60, wall: 'n', w: 0.66, h: 0.9 });
    b.poster({ id: 'poster_therapy2', read: true, data: {poster: true}, tex: 'postertherapy', x: 16.9, y: 1.6, z: 6.60, wall: 'n', w: 0.6, h: 0.9 });
    b.poster({ id: 'poster_calendar', read: true, data: {poster: true}, tex: 'calendar', x: 17.60, y: 1.6, z: 3.4, wall: 'w', w: 0.5, h: 0.7 });
    b.poster({ id: 'poster_news', read: true, data: {poster: true}, tex: 'newspaper', x: 8.80, y: 1.6, z: 4.2, wall: 'e', w: 0.7, h: 0.55 });
    b.prop(P('plant'), 9.1, 2.2, { rotY: 0.4, collide: false });
    b.fixture({ x: 12.9, y: 1.05, z: 3.7, type: 'desk', circuit: 'nurse', on: true, intensity: 1.1, color: 0xffd9a0 });
    b.fixture({ x: 12.9, z: 4.4, circuit: 'nurse', on: false, flicker: 0.1 });
    b.fixture({ x: 16.0, z: 3.0, circuit: 'nurse', on: false, flicker: 0.1 });
    textSign(b, '护士站', 12.5, 2.45, 1.44, 'n', 0.8, 0.24);
    b.trigger({ id: 'trig_nurse', x1: 10.6, x2: 14.6, z1: 1.7, z2: 6.2, once: false });

    /* ---------------- 电梯厅 ---------------- */
    var elev = P('elevatorDoor', { open: false });
    b.prop(elev, 24.98, 0, { rotY: -Math.PI / 2, collide: false });
    b.proxy(24.7, 1.15, 0, 0.12, 2.2, 1.9);
    b.story.elevator = elev;
    b.addInteractable({
      id: 'elevator', kind: 'elevator', object: b.proxy(24.68, 1.1, 0, 0.2, 2.2, 1.7), prompt: '进入电梯',
      radius: 2.8, pos: new T.Vector3(24.6, 1.2, 0), data: {}
    });

    b.mirror({ x: 22.2, y: 1.55, z: -3.29, wall: 's', w: 1.1, h: 1.8 });
    b.mirror({ x: 22.2, y: 1.55, z: 3.29, wall: 'n', w: 1.1, h: 1.8 });
    var crk1 = b.decal({ tex: 'crack', x: 22.2, y: 1.55, z: -3.275, wall: 's', w: 1.15, h: 1.85, opacity: 0.95 });
    var crk2 = b.decal({ tex: 'crack', x: 22.2, y: 1.55, z: 3.275, wall: 'n', w: 1.15, h: 1.85, opacity: 0.95 });
    crk1.visible = false; crk2.visible = false;
    b.story.mirrorCracks = [crk1, crk2];
    b.story.mirrorPos = [{ x: 22.2, z: -3.2 }, { x: 22.2, z: 3.2 }];
    b.prop(P('chair'), 21.3, 2.5, { rotY: Math.PI });
    b.prop(P('chair'), 21.3, -2.5, { rotY: 0 });
    b.prop(P('gurney'), 22.8, 2.6, { rotY: Math.PI / 2 });
    b.prop(P('wheelchair'), 21.0, 1.5, { rotY: 0.8, collide: false });
    b.prop(P('trashBin'), 20.4, -3.0, { rotY: 0.5, collide: false });
    b.fixture({ x: 21.6, z: 0, circuit: 'hall', on: false, flicker: 0.1 });
    b.fixture({ x: 23.4, z: 0, circuit: 'hall', on: false, flicker: 0.1 });
    b.fixture({ x: 22.5, y: 2.35, z: -3.29, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.9 });
    b.fixture({ x: 22.5, y: 2.35, z: 3.29, type: 'emergency', wall: 'n', circuit: 'emergency', on: true, intensity: 0.9 });
    b.decal({ tex: 'floorstain', x: 24.2, y: 0.012, z: 0.6, onFloor: true, w: 1.6, h: 1.2, opacity: 0.45 });
    textSign(b, '电梯', 24.9, 2.42, 0, 'w', 0.5, 0.18, { bg: '#1c2a28', fg: '#cfdcd6' });
    b.trigger({ id: 'trig_hall', x1: 20.5, x2: 24.6, z1: -3.0, z2: 3.0, once: false });

    // 一周目：散落在通往白门路上的线索（只有第一周目出现）
    if (window.HGame && window.HGame.run === 1) {
      b.paper({ id: 'note_first_run', tex: 'note', kind: 'note', x: -15.85, y: 0.016, z: 0.92, w: 0.3, h: 0.38, rotY: 0.35 });
      b.paper({ id: 'note_first_run_2', tex: 'note', kind: 'note', x: 22.4, y: 0.016, z: 0.9, w: 0.3, h: 0.38, rotY: -0.5 });
    }
    /* ---------------- 走廊细节 ---------------- */
    // 门（实际门对象）
    b.door({ id: 'door302', axis: 'x', center: -16.8, fixed: 1.51, width: 1.06, swing: -1, mat: paintDoor, locked: true, lockedMsg: '门被从外面锁住了' });
    b.door({ id: 'door301', axis: 'x', center: -15.0, fixed: -1.51, width: 1.06, swing: 1, mat: paintDoor });
    b.door({ id: 'door303', axis: 'x', center: -8.6, fixed: -1.51, width: 1.06, swing: 1, mat: paintDoor });
    b.door({ id: 'door305', axis: 'x', center: -1.7, fixed: -1.51, width: 1.06, swing: 1, mat: paintDoor });
    b.door({ id: 'doorPharmacy', axis: 'x', center: 16.6, fixed: -1.51, width: 1.06, swing: 1, mat: paintDoor, locked: true, lockedMsg: '电子门锁 · 需要密码' });
    b.door({ id: 'doorUtility', axis: 'x', center: -11.5, fixed: 1.51, width: 1.06, swing: -1, mat: paintDoor });
    b.door({ id: 'door304', axis: 'x', center: -4.5, fixed: 1.51, width: 1.06, swing: -1, mat: paintDoor });
    b.door({ id: 'door306', axis: 'x', center: 2.7, fixed: 1.51, width: 1.06, swing: -1, mat: paintDoor });
    var oldElevDoor = b.door({ id: 'doorStairs', axis: 'z', center: 0, fixed: -20.06, width: 1.06, swing: 1, mat: M('metal'), locked: true, lockedMsg: '旧货运梯被木板封死了' });
    // 钉死在旧货运梯上的木板（可被撬棍撬开）
    var oldBoards = [];
    [[0.45, 0.20], [0.86, 0.22], [1.28, 0.20], [1.70, 0.22]].forEach(function (bd) {
      var board = b.box({
        x1: -20.00, x2: -19.94, y1: bd[0] - bd[1] / 2, y2: bd[0] + bd[1] / 2,
        z1: -0.62, z2: 0.62, mat: M('wood', { color: 0x6e5a41 }), collide: false, noMerge: true
      });
      oldBoards.push(board);
    });
    var oldDiag = b.box({
      x1: -19.99, x2: -19.93, y1: 0.75, y2: 1.55, z1: -0.55, z2: -0.43,
      mat: M('wood', { color: 0x5f4d39 }), collide: false, noMerge: true
    });
    oldDiag.rotation.x = 0.9;
    oldBoards.push(oldDiag);
    b.story.oldElevator = oldElevDoor;
    b.story.oldBoards = oldBoards;
    b.addInteractable({
      id: 'old_freight_elevator', kind: 'oldElevator', object: b.proxy(-19.82, 1.1, 0, 0.24, 2.0, 1.5),
      prompt: '旧货运梯', radius: 2.8, pos: new T.Vector3(-19.8, 1.2, 0)
    });
    b.paper({ id: 'note_west_freight', tex: 'note', kind: 'note', x: -19.92, y: 1.38, z: 1.35, wall: 'e', w: 0.3, h: 0.38, rotZ: 0.12 });
    b.sign({ text: '旧货运梯 · 停用', x: -19.93, y: 2.3, z: 0, wall: 'e', w: 0.8, h: 0.2, mount: true, signOpts: { bg: '#c9c3a6', fg: '#2a2820', sub: 'FREIGHT · 2F/3F' }, emissiveIntensity: 0.18 });

    // 走廊海报 / 标语
    b.poster({ id: 'poster_evac', read: true, data: {poster: true}, tex: 'posterevac', x: -12.6, y: 1.62, z: -1.44, wall: 's', w: 0.62, h: 0.78 });
    b.poster({ id: 'poster_rules2', read: true, data: {poster: true}, tex: 'posterrules', x: 8.2, y: 1.62, z: 1.44, wall: 'n', w: 0.6, h: 0.82 });
    b.poster({ id: 'poster_isolation2', read: true, data: {poster: true}, tex: 'signIsolation', x: 14.2, y: 1.62, z: -1.44, wall: 's', w: 0.62, h: 0.2 });
    textSign(b, '静默疗法 · 第三期', -6.9, 2.2, -1.44, 's', 0.9, 0.16, { bg: '#e6e6da', fg: '#26352f' });
    b.prop(P('fireExtinguisher'), -18.6, 1.58, { rotY: 0, y: 0.45, collide: false });
    b.prop(P('gurney'), 10.8, -1.05, { rotY: Math.PI / 2 });
    b.pickup({ id: 'item_battery_ward', itemId: 'battery_ward', name: '电池', kind: 'battery', x: 11.3, y: 0.755, z: -0.95, glintColor: 0xe0d08a });
    b.prop(P('wheelchair'), -6.2, 1.02, { rotY: -0.4, collide: false });
    b.prop(P('trashBin'), 5.6, -1.2, { rotY: 0.2, collide: false });
    b.prop(P('clock'), 12.0, -1.44, { y: 2.25, rotY: 0, collide: false });
    b.prop(P('ceilingVent'), 6.6, 2.95, { rotY: 0, collide: false });
    b.prop(P('ceilingVent'), -10.2, 2.95, { rotY: 0, collide: false });
    b.prop(P('curtainRail', { w: 1.5 }), 10.8, -1.05, { rotY: 0, y: 2.73, collide: false });

    // 血迹 / 污迹
    b.decal({ tex: 'blood2', x: -16.0, y: 0.014, z: 0.6, onFloor: true, w: 0.6, h: 0.6, opacity: 0.55 });
    b.decal({ tex: 'blood2', x: -15.3, y: 0.015, z: 0.35, onFloor: true, w: 0.4, h: 0.4, opacity: 0.45 });
    b.decal({ tex: 'blood2', x: -14.6, y: 0.014, z: 0.15, onFloor: true, w: 0.3, h: 0.3, opacity: 0.35 });
    b.decal({ tex: 'handprint', x: -17.2, y: 1.15, z: 1.45, wall: 'n', w: 0.45, h: 0.45, opacity: 0.5, rotZ: 0.3 });
    b.decal({ tex: 'mold1', x: 3.5, y: 0.7, z: -1.45, wall: 's', w: 2.0, h: 1.5, opacity: 0.35 });
    b.decal({ tex: 'mold2', x: -3.0, y: 0.6, z: 1.45, wall: 'n', w: 1.8, h: 1.2, opacity: 0.3 });
    b.decal({ tex: 'floorstain', x: 12.0, y: 0.012, z: 0.4, onFloor: true, w: 2.4, h: 1.6, opacity: 0.3 });
    b.decal({ tex: 'mold1', x: 5.0, y: 2.93, z: 0, onCeiling: true, w: 2.0, h: 1.4, opacity: 0.45 });
    b.decal({ tex: 'crack', x: -7.5, y: 2.2, z: 1.45, wall: 'n', w: 1.0, h: 0.8, opacity: 0.5 });

    // 灯
    [-18, -13, -8, -3, 2, 7, 12, 17].forEach(function (x) {
      b.fixture({ x: x, z: 0, circuit: 'corridor', on: false, flicker: 0.05 });
    });
    b.fixture({ x: -19.5, y: 2.4, z: -1.44, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.65 });
    b.fixture({ x: 8.5, y: 2.4, z: 1.44, type: 'emergency', wall: 'n', circuit: 'emergency', on: true, intensity: 0.65 });
    b.fixture({ x: -2.0, y: 2.4, z: -1.44, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.5 });

    // 楼层标识
    textSign(b, '3F 东翼', -19.99, 2.5, 1.2, 'e', 0.5, 0.16, { bg: '#d8e2da', fg: '#1c3a32' });

    // ---- 走廊附加细节 ----
    // 墙面污渍、水渍、霉斑
    [[-18.2, 0.55, 's'], [-13.6, 0.7, 'n'], [-9.2, 0.5, 's'], [-3.0, 0.62, 'n'],
     [1.2, 0.45, 's'], [5.2, 0.8, 'n'], [9.6, 0.52, 's'], [14.2, 0.65, 'n'], [18.4, 0.5, 's']].forEach(function (w, i) {
      b.decal({ tex: 'mold' + (i % 2 + 1), x: w[0], y: w[1], z: (w[2] === 's' ? -1.45 : 1.45), wall: w[2], w: 1.6 + (i % 3) * 0.5, h: 0.9 + (i % 2) * 0.4, opacity: 0.28 + (i % 3) * 0.06 });
    });
    // 天花板水渍
    [[-12.0, 0.0], [-2.2, 0.4], [8.6, -0.3], [16.4, 0.2]].forEach(function (p, i) {
      b.decal({ tex: 'mold2', x: p[0], y: 2.93, z: p[1], onCeiling: true, w: 1.6 + i * 0.3, h: 1.1 + i * 0.2, opacity: 0.4, rotZ: i });
    });
    // 地面拖拽血迹（从 304 门口延伸到走廊）
    for (var bt = 0; bt < 5; bt++) {
      b.decal({ tex: bt % 2 ? 'blood2' : 'blood1', x: -4.4 - bt * 0.75, y: 0.014, z: 1.05 - bt * 0.15, onFloor: true, w: 0.55 + bt * 0.12, h: 0.55 + bt * 0.1, opacity: 0.42 - bt * 0.06, rotZ: bt });
    }
    b.decal({ tex: 'handprint', x: -3.9, y: 1.05, z: 1.45, wall: 'n', w: 0.42, h: 0.42, opacity: 0.55, rotZ: -0.4 });
    b.decal({ tex: 'handprint', x: -3.05, y: 0.55, z: 1.45, wall: 'n', w: 0.38, h: 0.38, opacity: 0.4, rotZ: 2.2 });
    // 散落的纸张、病历夹
    [[-12.4, 0.6, 0.5], [-11.6, 0.1, 1.6], [0.2, -0.5, 2.6], [7.4, 0.3, 1.1], [18.1, -0.8, 0.2]].forEach(function (pp) {
      b.decal({ tex: 'paper', x: pp[0], y: 0.014, z: pp[1], onFloor: true, w: 0.21, h: 0.29, opacity: 0.92, rotZ: pp[2] });
    });
    // 墙面公告板 / 洗手液 / 消防设施
    // 公告板：贴在走廊南侧实墙上（避开配电室门洞）
    b.box({ x1: -15.9, x2: -13.9, y1: 1.35, y2: 2.15, z1: 1.43, z2: 1.45, mat: M('woodDark'), collide: false });
    b.box({ x1: -15.92, x2: -13.88, y1: 1.33, y2: 1.36, z1: 1.425, z2: 1.45, mat: M('wood'), collide: false });
    b.poster({ tex: 'posterrules', x: -14.9, y: 1.75, z: 1.425, wall: 'n', w: 0.55, h: 0.75 });
    textSign(b, '公 告 板', -14.9, 2.28, 1.44, 'n', 0.4, 0.12, { bg: '#dfe6dd', fg: '#173b32' });
    b.box({ x1: 3.6, x2: 4.1, y1: 1.25, y2: 1.55, z1: 1.43, z2: 1.47, mat: M('metalLight'), collide: false });
    b.box({ x1: 3.72, x2: 3.98, y1: 1.18, y2: 1.25, z1: 1.41, z2: 1.45, mat: M('plastic'), collide: false });
    b.prop(P('fireExtinguisher'), 13.5, -1.44, { rotY: 0, y: 0.45, collide: false });
    b.prop(P('trashBin'), -19.4, 0.9, { rotY: 0.3, collide: false });
    b.prop(P('ivStand'), -2.6, -1.15, { rotY: 0.3, collide: false });
    b.prop(P('gurney'), -2.0, 1.02, { rotY: Math.PI / 2 });
    b.prop(P('wheelchair'), 6.4, 1.02, { rotY: 2.1, collide: false });
    b.prop(P('plant'), 19.2, 2.5, { rotY: 0.6, collide: false });
    // 小心地滑警示牌：挂在走廊南墙（不再放地上，避免摆位/穿模）
    b.sign({ text: '小心地滑 · CAUTION', x: 10.1, y: 1.42, z: 1.44, wall: 'n', w: 0.55, h: 0.19, mount: true, signOpts: { bg: '#d8c435', fg: '#141410', sub: 'CAUTION · WET FLOOR' }, emissiveIntensity: 0.25 });

    /* ---------------- 导航 ---------------- */
    for (var nx = -19; nx <= 24; nx += 2) b.nav(nx, 0);
    b.nav(-18.6, 1.0); b.nav(-16.8, 1.0); b.nav(-15.0, -1.0); b.nav(-13.0, -1.0);
    b.nav(-11.5, 1.0); b.nav(-8.6, -1.0); b.nav(-6.5, -1.0); b.nav(-4.5, 1.0);
    b.nav(-1.7, -1.0); b.nav(2.7, 1.0); b.nav(5.0, 0); b.nav(8.0, 0);
    b.nav(16.6, -1.0); b.nav(18.5, 0); b.nav(20.5, 0); b.nav(22.5, 0);
    b.nav(-16.8, 3.4);      // 302
    b.nav(-16.8, 4.9);
    b.nav(-15.0, -2.4);     // 301
    b.nav(-16.2, -4.2);
    b.nav(-17.0, -2.4);
    b.nav(-8.6, -2.4);      // 303
    b.nav(-9.6, -4.2);
    b.nav(-2.2, -2.4);      // 305
    b.nav(-2.4, -4.2);
    b.nav(-11.5, 2.5);      // 配电室
    b.nav(-12.2, 4.0);
    b.nav(-4.5, 2.5);       // 304
    b.nav(-4.6, 4.2);
    b.nav(2.7, 2.6);        // 306
    b.nav(2.4, 4.2);
    b.nav(16.6, -2.5);      // 药房
    b.nav(16.0, -4.0);
    b.nav(12.5, 2.4);       // 护士站
    b.nav(12.5, 5.2);
    b.nav(15.8, 5.2);
    b.nav(10.2, 5.2);
    b.nav(22.5, 2.2);
    b.nav(22.5, -2.2);

    b.dust({ count: 560, w: 56, d: 3.2, x: 7.0, z: 0 });
    b.dust({ count: 160, w: 9, d: 4.5, x: 22.5, z: 0 });
    b.playerSpawn = { x: -16.8, z: 4.45, yaw: 0.55 };
    b.story.exitTrigger = 'doorStairs';
  };

  /* ============================================================
     地下一层：太平间走廊
     ============================================================ */
  HW.LEVELS.basement = function (b) {
    var H = 2.72;
    var floorMat = M('concreteWet', { color: 0x7e837d });
    var ceilMat = M('concreteDark', { color: 0x6f736d });
    var wallMat = M('concrete', { color: 0x8b8e88 });
    var tileMat = M('tileWallOld', { color: 0x8d9289 });
    var metalDark = M('metalDark');
    var paintDoor = M('paintGreen', { color: 0x77887c });
    var lay = [
      { y0: 0, y1: 1.0, mat: tileMat, tile: HT.tileSize.tileWall },
      { y0: 1.0, y1: H, mat: wallMat, tile: HT.tileSize.concrete }
    ];
    b.ambient.fogColor = 0x020504;
    b.ambient.fogDensity = 0.098;
    b.ambient.ambientColor = 0x101b17;
    b.ambient.ambientIntensity = 0.22;
    b.ambient.hemiSky = 0x14201c; b.ambient.hemiGround = 0x050706; b.ambient.hemiIntensity = 0.10;
    b.ambient.exposure = 0.74;
    b.ambient.flashlight = true;

    /* ---------------- 电梯厅 ---------------- */
    b.floor(-2.2, -3.0, 4.0, 3.0, floorMat, HT.tileSize.concrete);
    b.ceiling(-2.2, -3.0, 4.0, 3.0, ceilMat, H, HT.tileSize.concrete);
    b.wall({ axis: 'z', fixed: -2.26, from: -3.1, to: 3.1, y1: H, layers: lay });
    b.wall({ axis: 'x', fixed: -3.06, from: -2.2, to: 4.2, y1: H, layers: lay });
    b.wall({ axis: 'x', fixed: 3.06, from: -2.2, to: 4.2, y1: H, layers: lay });
    b.wall({ axis: 'z', fixed: 4.06, from: -3.1, to: 3.1, y1: H, layers: lay, openings: [{ center: 0, width: 2.6, height: 2.35 }] });
    // 电梯门（回程方向）
    b.prop(P('elevatorDoor', { open: false }), -2.1, 0, { rotY: Math.PI / 2, collide: false });
    b.addInteractable({
      id: 'elevator_up', kind: 'elevatorUp', object: b.proxy(-1.95, 1.1, 0, 0.2, 2.2, 1.7), prompt: '电梯（返回三楼）',
      radius: 2.8, pos: new T.Vector3(-1.9, 1.2, 0), data: {}
    });
    // 隐藏结局线索：旧货运梯 / B2 / 三号柜
    b.paper({ id: 'note_b1_service', tex: 'note', kind: 'note', x: 1.6, y: 0.016, z: 0.9, w: 0.3, h: 0.38, rotY: 0.8 });
    b.paper({ id: 'note_b1_transfer', tex: 'note', kind: 'note', x: 13.3, y: 0.775, z: -5.72, w: 0.3, h: 0.38, rotY: -0.3 });
    // 备用电源配电箱（解开后太平间 / 冷藏室通电）
    b.box({ x1: 4.25, x2: 5.75, y1: 0.9, y2: 2.0, z1: -1.595, z2: -1.545, mat: M('metalDark'), collide: false });
    var b1Levers = [];
    for (var b1s = 0; b1s < 3; b1s++) {
      var b1x = 4.55 + b1s * 0.35;
      var b1lever = b.box({ x1: b1x - 0.035, x2: b1x + 0.035, y1: 1.25, y2: 1.58, z1: -1.535, z2: -1.500, mat: M('stainless'), collide: false, noMerge: true });
      b1Levers.push(b1lever);
      b.addInteractable({
        id: 'b1switch_' + b1s, kind: 'b1switch', object: b.proxy(b1x, 1.4, -1.34, 0.2, 0.5, 0.2),
        prompt: '备用电源闸刀', radius: 2.2, data: { index: b1s, lever: b1lever },
        pos: new T.Vector3(b1x, 1.4, -1.4)
      });
      textSign(b, ['左', '中', '右'][b1s], b1x, 1.86, -1.54, 's', 0.16, 0.1, { bg: '#2a2a26', fg: '#e0d8c0' });
    }
    b.story.b1Levers = b1Levers;
    textSign(b, '备用电源', 5.0, 2.12, -1.55, 's', 0.7, 0.16, { bg: '#d8c435', fg: '#141410' });
    b.paper({ id: 'note_b1_power', tex: 'note', kind: 'note', x: 4.3, y: 0.016, z: -1.1, w: 0.3, h: 0.38, rotY: 0.5 });
    b.fixture({ x: 0.6, z: 0, circuit: 'main', on: true, flicker: 0, color: 0xbfd6c8, intensity: 1.6, y: 2.72 });
    b.fixture({ x: 2.6, y: 2.3, z: -3.0, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.9 });
    b.prop(P('pipes', { length: 3.0, axis: 'x' }), 1.0, -2.4, { y: 2.36, rotY: Math.PI / 2, collide: false });
    b.decal({ tex: 'floorstain', x: 2.6, y: 0.012, z: 1.2, onFloor: true, w: 2.0, h: 1.4, opacity: 0.4 });

    /* ---------------- 长廊 ---------------- */
    b.floor(4.0, -1.6, 34.0, 1.6, floorMat, HT.tileSize.concrete);
    b.ceiling(4.0, -1.6, 34.0, 1.6, ceilMat, H, HT.tileSize.concrete);
    b.wall({
      axis: 'x', fixed: -1.66, from: 4.06, to: 34.1, y1: H, layers: lay,
      openings: [{ center: 11.2, width: 1.2, height: 2.05 }]
    });
    b.wall({
      axis: 'x', fixed: 1.66, from: 4.06, to: 34.1, y1: H, layers: lay,
      openings: [{ center: 18.4, width: 1.2, height: 2.05 }]
    });
    // 走廊上的防火门
    b.wall({ axis: 'z', fixed: 14.0, from: -1.66, to: 1.66, y1: H, layers: lay, openings: [{ center: 0, width: 1.3, height: 2.05 }] });
    b.wall({ axis: 'z', fixed: 24.0, from: -1.66, to: 1.66, y1: H, layers: lay, openings: [{ center: 0, width: 1.3, height: 2.05 }] });
    var d1 = b.door({ id: 'doorFire1', axis: 'z', center: 0, fixed: 14.0, width: 1.3, swing: 1, mat: M('metal'), locked: false });
    var d2 = b.door({ id: 'doorFire2', axis: 'z', center: 0, fixed: 24.0, width: 1.3, swing: -1, mat: M('metal'), locked: false });
    d1.setOpen(true, { silent: true });
    d2.setOpen(true, { silent: true });
    // 通往白房的门
    b.wall({ axis: 'z', fixed: 34.16, from: -1.66, to: 1.66, y1: H, layers: lay, openings: [{ center: 0, width: 1.2, height: 2.05 }] });
    b.door({ id: 'doorWhite', axis: 'z', center: 0, fixed: 34.16, width: 1.2, swing: 1, mat: M('paintWhite'), locked: true, lockedMsg: '门禁红灯 · 需要白房权限卡' });
    b.sign({ text: '静默治疗室', x: 34.09, y: 2.35, z: 0, wall: 'w', w: 0.7, h: 0.2, mount: false, signOpts: { bg: '#eef1ec', fg: '#1a2b26', sub: 'PROJECT MIRROR · ROOM 0' }, emissiveIntensity: 0.3 });
    b.sign({ text: '安全出口', x: 33.0, y: 2.4, z: 1.55, wall: 'n', w: 0.6, h: 0.18, mount: false, signOpts: { bg: '#175c40', fg: '#e6f4ea' }, emissiveIntensity: 0.5 });

    b.door({ id: 'doorMorgue', axis: 'x', center: 11.2, fixed: -1.66, width: 1.2, swing: 1, mat: paintDoor, locked: true, lockedMsg: '太平间电子门 · 尚未恢复供电' });

    /* ---------------- 太平间 ---------------- */
    b.room({
      x1: 8.0, x2: 14.5, z1: -6.6, z2: -1.66, side: 'north', height: H,
      floorMat: floorMat, ceilMat: ceilMat, wallMat: wallMat, lowerMat: tileMat, lowerH: 1.0
    });
    b.prop(P('morgueUnit', { cols: 4, rows: 3 }), 11.2, -6.31, { rotY: 0, collide: true });
    b.prop(P('operatingTable'), 12.0, -4.2, { rotY: Math.PI / 2 });
    b.prop(P('gurney', { bodyBag: true }), 9.2, -3.2, { rotY: 0.4 });
    b.prop(P('gurney', { bodyBag: true }), 13.4, -3.0, { rotY: -0.3 });
    b.prop(P('gurney'), 12.6, -2.5, { rotY: Math.PI / 2 });
    b.prop(P('sink'), 8.60, -5.45, { rotY: Math.PI / 2, collide: false });
    b.prop(P('desk'), 13.6, -5.9, { rotY: Math.PI });
    b.prop(P('chair'), 13.6, -5.1, { rotY: Math.PI });
    b.prop(P('cabinet'), 8.4, -2.6, { rotY: Math.PI / 2 });
    b.prop(P('medicalCart'), 9.6, -5.8, { rotY: 0.2 });
    b.prop(P('bodyBag'), 8.9, -4.4, { rotY: 0.7, y: 0.02, collide: false });
    b.paper({ id: 'file_morgue', tex: 'patientcard', kind: 'file', x: 13.6, y: 0.775, z: -5.95, w: 0.34, h: 0.24, rotY: 0.2 });
    b.tape({ id: 'tape_morgue', x: 13.0, y: 0.775, z: -5.95, rotY: -0.2 });
    b.pickup({ id: 'item_whiteCard', itemId: 'whiteCard', name: '白房权限卡', kind: 'card', x: 13.15, y: 0.775, z: -5.72, glintColor: 0x9fe0ff });
    b.sign({ tex: 'signMorgue', x: 11.2, y: 2.4, z: -1.59, wall: 's', w: 0.7, h: 0.2, mount: false });
    b.decal({ tex: 'blood1', x: 12.0, y: 0.014, z: -3.0, onFloor: true, w: 1.6, h: 1.6, opacity: 0.6 });
    b.decal({ tex: 'blood3', x: 10.2, y: 0.015, z: -4.6, onFloor: true, w: 1.2, h: 1.2, opacity: 0.5 });
    b.decal({ tex: 'mold2', x: 14.50, y: 1.0, z: -4.0, wall: 'w', w: 1.4, h: 1.6, opacity: 0.5 });
    b.decal({ tex: 'mold1', x: 8.00, y: 0.7, z: -3.6, wall: 'e', w: 1.2, h: 1.4, opacity: 0.45 });
    b.fixture({ x: 11.2, z: -4.0, circuit: 'morgue', on: false, flicker: 0, intensity: 2.0, color: 0xaecfc4, y: 2.72 });
    b.fixture({ x: 8.6, y: 2.25, z: -1.65, type: 'emergency', wall: 'n', circuit: 'emergency', on: true, intensity: 0.8 });
    b.trigger({ id: 'trig_morgue', x1: 8.0, x2: 14.5, z1: -6.6, z2: -1.66, once: false });

    b.door({ id: 'doorCold', axis: 'x', center: 18.4, fixed: 1.66, width: 1.2, swing: -1, mat: paintDoor, locked: true, lockedMsg: '冷藏室电子门 · 尚未恢复供电' });

    /* ---------------- 冷藏室 ---------------- */
    b.room({
      x1: 16.0, x2: 21.0, z1: 1.66, z2: 6.0, side: 'south', height: H,
      floorMat: floorMat, ceilMat: ceilMat, wallMat: wallMat, lowerMat: tileMat, lowerH: 1.0
    });
    b.prop(P('morgueUnit', { cols: 3, rows: 2 }), 18.4, 5.71, { rotY: Math.PI, collide: true });
    b.prop(P('gurney', { bodyBag: true }), 17.2, 3.2, { rotY: 0.2 });
    // 冷藏室小金属桌：交接录音带放在桌面上
    b.box({ x1: 16.20, x2: 17.00, y1: 0, y2: 0.62, z1: 2.10, z2: 2.75, mat: M('metalDark'), collide: true });
    b.box({ x1: 16.14, x2: 17.06, y1: 0.62, y2: 0.66, z1: 2.04, z2: 2.81, mat: M('stainless'), collide: false });
    b.tape({ id: 'tape_b1_log', x: 16.6, y: 0.668, z: 2.45, rotY: 0.2 });
    b.prop(P('gurney', { bodyBag: true }), 19.7, 4.3, { rotY: -0.5 });
    b.prop(P('bodyBag'), 16.6, 5.0, { rotY: 1.2, y: 0.02, collide: false });
    b.prop(P('sink'), 20.55, 2.6, { rotY: -Math.PI / 2, collide: false });
    b.prop(P('trashBin'), 16.4, 2.0, { rotY: 0.3, collide: false });
    b.poster({ id: 'poster_cold', read: true, data: {poster: true}, tex: 'signCold', x: 16.06, y: 1.5, z: 2.4, wall: 'e', w: 0.6, h: 0.2 });
    b.decal({ tex: 'mold1', x: 21.00, y: 0.8, z: 4.4, wall: 'w', w: 1.4, h: 1.8, opacity: 0.55 });
    b.decal({ tex: 'blood2', x: 18.0, y: 0.014, z: 4.6, onFloor: true, w: 1.4, h: 1.4, opacity: 0.45 });
    b.fixture({ x: 18.5, z: 4.0, circuit: 'cold', on: false, flicker: 0, intensity: 1.6, color: 0x9dc8d8, y: 2.72 });
    b.fixture({ x: 18.4, y: 2.25, z: 5.94, type: 'emergency', wall: 'n', circuit: 'emergency', on: true, intensity: 0.75 });
    b.trigger({ id: 'trig_cold', x1: 16.0, x2: 21.0, z1: 1.66, z2: 6.0, once: false });

    /* ---------------- 走廊细节 ---------------- */
    b.locker({ id: 'locker_b1', x: 6.6, z: 1.35, rotY: Math.PI });
    b.locker({ id: 'locker_b2', x: 27.2, z: -1.35, rotY: 0 });
    b.prop(P('gurney'), 8.0, 1.25, { rotY: Math.PI / 2 });
    b.pickup({ id: 'item_battery_b1', itemId: 'battery_b1', name: '电池', kind: 'battery', x: 8.0, y: 0.755, z: 1.2, glintColor: 0xe0d08a });
    b.prop(P('gurney'), 16.8, -1.2, { rotY: Math.PI / 2 });
    b.prop(P('wheelchair'), 21.0, 1.2, { rotY: -0.6, collide: false });
    b.prop(P('trashBin'), 4.6, -1.2, { rotY: 0.2, collide: false });
    b.prop(P('pipes', { length: 6, axis: 'x' }), 9.0, 0, { y: 2.36, rotY: Math.PI / 2, collide: false });
    b.prop(P('pipes', { length: 6, axis: 'x' }), 21.0, -0.3, { y: 2.36, rotY: Math.PI / 2, collide: false });
    b.prop(P('pipes', { length: 5, axis: 'x' }), 30.0, 0.4, { y: 2.36, rotY: Math.PI / 2, collide: false });
    b.prop(P('fireExtinguisher'), 6.0, -1.59, { rotY: 0, y: 0.45, collide: false });
    b.prop(P('clock'), 22.0, -1.59, { y: 2.2, rotY: 0, collide: false });
    b.decal({ tex: 'mold1', x: 12.0, y: 2.7, z: 0, onCeiling: true, w: 3.0, h: 2.0, opacity: 0.5 });
    b.decal({ tex: 'floorstain', x: 20.0, y: 0.012, z: 0.5, onFloor: true, w: 3.0, h: 2.0, opacity: 0.4 });
    b.decal({ tex: 'crack', x: 26.0, y: 2.2, z: 1.60, wall: 'n', w: 1.4, h: 1.0, opacity: 0.6 });
    b.decal({ tex: 'handprint', x: 30.5, y: 1.2, z: -1.60, wall: 's', w: 0.5, h: 0.5, opacity: 0.6 });
    b.poster({ id: 'poster_evac_b1', read: true, data: {poster: true}, tex: 'posterevac', x: 9.0, y: 1.55, z: -1.59, wall: 's', w: 0.62, h: 0.78 });
    b.sign({ text: 'B1 · 太平间', x: 26.0, y: 2.35, z: -1.59, wall: 'n', w: 0.7, h: 0.2, mount: false, signOpts: { bg: '#1c3a32', fg: '#d8e6df' } });
    // 应急红灯
    [-1.5, 8.0, 18.0, 30.0].forEach(function (x, i) {
      b.fixture({ x: 4.8 + i * 8, y: 2.2, z: (i % 2 === 0 ? 1.62 : -1.62), type: 'emergency', wall: (i % 2 === 0 ? 'n' : 's'), circuit: 'emergency', on: true, intensity: 0.9 });
    });
    b.fixture({ x: 2.0, z: 0.0, circuit: 'main', on: false, flicker: 0, intensity: 1.6, y: 2.72 });
    b.fixture({ x: 12.0, z: 0.0, circuit: 'main', on: false, flicker: 0, intensity: 1.2, y: 2.72 });
    b.fixture({ x: 22.0, z: 0.0, circuit: 'main', on: true, flicker: 0, intensity: 0.9, color: 0xa9c8bd, y: 2.72 });
    b.fixture({ x: 30.0, z: 0.0, circuit: 'main', on: false, flicker: 0, intensity: 1.5, y: 2.72 });

    /* ---------------- 导航 ---------------- */
    for (var nx = 1; nx <= 33; nx += 2) b.nav(nx, 0);
    b.nav(0.5, 0); b.nav(3.5, 0);
    b.nav(11.2, -2.5); b.nav(11.2, -5.6); b.nav(9.0, -4.0); b.nav(13.4, -4.4);
    b.nav(18.4, 2.6); b.nav(18.4, 5.2); b.nav(17.2, 4.4);
    b.nav(6.6, 0.8); b.nav(27.2, -0.8);

    b.dust({ count: 620, w: 38, d: 14, x: 16.0, z: 0 });
    // 一周目：B1 通往白门路上的线索
    if (window.HGame && window.HGame.run === 1) {
      b.paper({ id: 'note_first_run_3', tex: 'note', kind: 'note', x: 16.6, y: 0.016, z: -0.9, w: 0.3, h: 0.38, rotY: 0.7 });
      b.paper({ id: 'note_first_run_4', tex: 'note', kind: 'note', x: 27.5, y: 0.016, z: 0.85, w: 0.3, h: 0.38, rotY: -0.3 });
      b.paper({ id: 'note_first_run_5', tex: 'note', kind: 'note', x: 32.4, y: 0.016, z: -0.8, w: 0.3, h: 0.38, rotY: 0.55 });
    }
    b.playerSpawn = { x: 0.8, z: 0, yaw: -Math.PI / 2 };
    b.story.whiteDoor = 'doorWhite';
  };

  /* ============================================================
     二楼 · 旧血液科病区
     ============================================================ */
  HW.LEVELS.floor2 = function (b) {
    var H = 2.95;
    b.ambient.fogColor = 0x0a1114;
    b.ambient.fogDensity = 0.072;
    b.ambient.ambientColor = 0x233137;
    b.ambient.ambientIntensity = 0.3;
    b.ambient.hemiSky = 0x24343a; b.ambient.hemiGround = 0x080b0b; b.ambient.hemiIntensity = 0.14;
    b.ambient.exposure = 0.82;
    b.ambient.flashlight = true;
    b.ambient.background = 0x070c0e;

    var fm = M('tileFloor', { color: 0x8c948f });
    var cm = M('ceiling');
    var wm = M('wallPaintGreen');
    var lm = M('tileWall');
    b.floor(-12, -1.45, 10, 1.45, fm, HT.tileSize.tileFloor);
    b.ceiling(-12, -1.45, 10, 1.45, cm, H, HT.tileSize.ceiling);
    var layers = [
      { y0: 0, y1: 1.15, mat: lm, tile: HT.tileSize.tileWall },
      { y0: 1.15, y1: H, mat: wm, tile: HT.tileSize.wallPaint }
    ];
    b.wall({ axis: 'x', fixed: -1.51, from: -12, to: 10.2, y1: H, layers: layers, openings: [{ center: -5.0, width: 1.06, height: 2.05 }] });
    b.wall({ axis: 'x', fixed: 1.51, from: -12, to: 10.2, y1: H, layers: layers, openings: [{ center: 3.5, width: 2.6, height: 2.2 }] });
    b.wall({ axis: 'z', fixed: -12.06, from: -1.51, to: 1.51, y1: H, layers: layers });
    b.wall({ axis: 'z', fixed: 10.06, from: -1.51, to: 1.51, y1: H, layers: layers, openings: [{ center: 0, width: 1.2, height: 2.1 }] });
    // 电梯井封堵：门只是装饰，不允许穿出去
    b.box({ x1: 10.02, x2: 10.18, y1: 0, y2: 2.1, z1: -0.68, z2: 0.68, mat: M('metalDark'), collide: true });

    // 206 病房
    b.room({ x1: -8.2, x2: -2.0, z1: -5.2, z2: -1.57, side: 'north', height: H, floorMat: fm, ceilMat: cm, wallMat: wm, lowerMat: lm, lowerH: 1.15 });
    b.prop(P('bed', { disheveled: false }), -6.9, -3.3, { rotY: 0 });
    b.box({ x1: -6.35, x2: -5.85, y1: 0, y2: 0.6, z1: -2.75, z2: -2.35, mat: M('woodDark'), collide: true });
    b.box({ x1: -6.37, x2: -5.83, y1: 0.6, y2: 0.64, z1: -2.77, z2: -2.33, mat: M('wood'), collide: false });
    b.pickup({ id: 'item_researchCard', itemId: 'researchCard', name: '研究区门禁卡', kind: 'card', x: -6.1, y: 0.648, z: -2.65, glintColor: 0x9fd8c0 });
    b.paper({ id: 'note_floor2_206', tex: 'note', kind: 'note', x: -6.2, y: 0.505, z: -3.0, w: 0.3, h: 0.38, rotY: 0.4 });
    b.prop(P('chair'), -5.2, -3.5, { rotY: Math.PI / 2 });
    b.prop(P('ivStand'), -7.4, -4.3, { rotY: 0.2, collide: false });
    b.prop(P('monitorStand', { on: false }), -7.5, -2.35, { rotY: 0.35, collide: false });
    b.prop(P('medicalCart'), -7.5, -4.7, { rotY: 0.3 });
    b.prop(P('trashBin'), -7.85, -2.75, { rotY: 0.2, collide: false });
    b.prop(P('plant'), -2.9, -4.75, { rotY: 0.5, collide: false });
    b.prop(P('sink'), -2.55, -4.3, { rotY: -Math.PI / 2, collide: false });
    b.prop(P('curtainRail', { w: 2.2 }), -6.9, -1.95, { rotY: 0, y: 2.73, collide: false });
    b.prop(P('curtain', { w: 2.0, h: 2.5 }), -6.9, -1.92, { rotY: 0, y: 0.25, collide: false });
    b.box({ x1: -3.2, x2: -2.1, y1: 0.72, y2: 0.78, z1: -4.55, z2: -4.15, mat: M('metal'), collide: false });
    b.paper({ tex: 'paper', x: -2.65, y: 0.79, z: -4.35, w: 0.2, h: 0.27, rotY: 0.4 });
    // 206 的窗户与月光
    b.box({ x1: -7.6, x2: -5.2, y1: 1.0, y2: 2.2, z1: -5.21, z2: -5.18, mat: M('glass'), collide: false });
    b.plane({ w: 2.2, h: 1.15, x: -6.4, y: 1.6, z: -5.24, mat: M('emissiveCool', { emissiveIntensity: 0.18 }), rotY: 0, noMerge: true });
    b.fixture({ x: -6.4, y: 1.9, z: -5.0, type: 'desk', circuit: 'moon', on: true, intensity: 0.8, color: 0x7197b8, noMesh: true });
    b.fixture({ x: -6.4, z: -3.2, circuit: 'ward', on: true, flicker: 0.03, intensity: 0.85, color: 0xa9c4cf });
    b.fixture({ x: -7.9, y: 2.3, z: -4.9, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.45 });
    b.mirror({ x: -2.06, y: 1.55, z: -3.0, wall: 'w', w: 0.6, h: 0.9 });
    b.decal({ tex: 'handprint', x: -8.20, y: 1.15, z: -2.8, wall: 'e', w: 0.45, h: 0.45, opacity: 0.45 });
    textSign(b, '206', -5.0, 2.35, -1.44, 'n', 0.3, 0.3);
    b.poster({ id: 'poster_child_206', read: true, data: { poster: true }, tex: 'childdrawing', x: -7.4, y: 1.55, z: -5.28, wall: 's', w: 0.55, h: 0.7 });
    b.prop(P('clock'), -2.06, -3.1, { rotY: -Math.PI / 2, y: 2.35, collide: false });
    b.box({ x1: -2.07, x2: -2.02, y1: 1.15, y2: 1.55, z1: -4.2, z2: -4.0, mat: M('metalLight'), collide: false });
    b.box({ x1: -2.07, x2: -2.02, y1: 1.42, y2: 1.47, z1: -4.1, z2: -3.9, mat: M('emissiveGreen', { emissiveIntensity: 0.25 }), collide: false });
    b.paper({ id: 'note_206_bedside', tex: 'note', kind: 'note', x: -6.1, y: 0.648, z: -2.45, w: 0.26, h: 0.34, rotY: 0.5 });

    // 护士站
    b.room({ x1: 1.2, x2: 8.2, z1: 1.57, z2: 6.0, side: 'south', height: H, floorMat: fm, ceilMat: cm, wallMat: wm, lowerMat: lm, lowerH: 1.15 });
    b.prop(P('nurseDesk', { w: 2.5, d: 0.9 }), 4.6, 3.0, { rotY: Math.PI });
    b.paper({ id: 'note_floor2_nurse', tex: 'note', kind: 'note', x: 4.05, y: 0.79, z: 3.05, w: 0.3, h: 0.38, rotY: 0.2 });
    b.prop(P('tapeRecorder'), 5.0, 3.0, { rotY: 0.15, y: 0.79, collide: false });
    b.tape({ id: 'tape_floor2', x: 5.0, y: 0.86, z: 2.98, rotY: -0.2 });
    b.prop(P('chair'), 4.3, 3.9, { rotY: Math.PI });
    b.prop(P('cabinet'), 7.2, 5.4, { rotY: Math.PI });
    b.prop(P('monitorStand', { on: false }), 2.4, 3.4, { rotY: 0, collide: false });
    b.prop(P('monitorStand', { on: false }), 5.8, 3.35, { rotY: -0.2, collide: false });
    b.prop(P('fileBox'), 6.3, 2.35, { rotY: 0.2, collide: false });
    b.prop(P('plant'), 7.55, 2.15, { rotY: 0.4, collide: false });
    b.prop(P('phone'), 8.12, 3.3, { rotY: -Math.PI / 2, y: 1.22, collide: false });
    b.prop(P('medicalCart'), 2.35, 4.85, { rotY: -0.3 });
    b.prop(P('trashBin'), 6.75, 2.25, { rotY: 0.1, collide: false });
    b.prop(P('ivStand'), 7.0, 4.9, { rotY: 0.3, collide: false });
    b.prop(P('wheelchair'), 1.85, 2.35, { rotY: 1.2, collide: false });
    b.paper({ tex: 'paper', x: 4.3, y: 0.79, z: 2.55, w: 0.2, h: 0.27, rotY: 0.6 });
    b.paper({ tex: 'paper', x: 5.0, y: 0.79, z: 2.5, w: 0.2, h: 0.27, rotY: -0.2 });
    b.fixture({ x: 4.6, y: 1.05, z: 3.2, type: 'desk', circuit: 'nurse', on: true, intensity: 0.8, color: 0xffd9a0 });
    b.fixture({ x: 4.6, z: 4.2, circuit: 'nurse', on: true, flicker: 0.05, intensity: 0.7, color: 0xb8c8bd });
    b.fixture({ x: 2.4, y: 1.9, z: 5.8, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.4 });
    textSign(b, '血液科 · 护士站', 4.6, 2.45, 1.44, 'n', 0.9, 0.22);
    b.box({ x1: 5.1, x2: 6.7, y1: 1.25, y2: 2.05, z1: 1.585, z2: 1.61, mat: M('woodDark'), collide: false });
    b.poster({ tex: 'posterrules', x: 5.9, y: 1.65, z: 1.60, wall: 's', w: 0.5, h: 0.68 });
    b.prop(P('clock'), 7.3, 5.96, { rotY: Math.PI, y: 2.3, collide: false });
    b.box({ x1: 6.9, x2: 7.7, y1: 1.25, y2: 1.6, z1: 5.78, z2: 5.8, mat: M('metalLight'), collide: false });

    // 走廊陈设
    b.prop(P('gurney'), -1.0, 0.9, { rotY: Math.PI / 2 });
    b.prop(P('wheelchair'), 1.2, -0.9, { rotY: 0.6, collide: false });
    b.prop(P('trashBin'), -9.6, 0.8, { rotY: 0.3, collide: false });
    b.prop(P('ivStand'), -10.7, 0.85, { rotY: 0.2, collide: false });
    b.prop(P('medicalCart'), -8.6, -0.85, { rotY: -0.4 });
    b.prop(P('plant'), -11.4, 1.0, { rotY: 0.2, collide: false });
    b.prop(P('wheelchair'), 7.4, -0.9, { rotY: -1.1, collide: false });
    b.prop(P('chair'), 8.9, 0.9, { rotY: 1.8, collide: false });
    b.box({ x1: 6.2, x2: 7.8, y1: 1.25, y2: 1.9, z1: -1.44, z2: -1.42, mat: M('woodDark'), collide: false });
    b.paper({ tex: 'paper', x: 6.9, y: 1.62, z: -1.41, w: 0.4, h: 0.5, rotY: 0 });
    b.poster({ id: 'poster_evac2', read: true, data: { poster: true }, tex: 'posterevac', x: -9.2, y: 1.6, z: -1.44, wall: 's', w: 0.62, h: 0.78 })
    b.poster({ id: 'poster_child2', read: true, data: { poster: true }, tex: 'childdrawing', x: 2.0, y: 1.55, z: 1.44, wall: 'n', w: 0.55, h: 0.7 });
    b.decal({ tex: 'blood2', x: -3.5, y: 0.014, z: 0.4, onFloor: true, w: 0.8, h: 0.8, opacity: 0.45 });
    b.decal({ tex: 'mold1', x: -8.6, y: 0.6, z: -1.45, wall: 's', w: 1.8, h: 1.2, opacity: 0.35 });
    [-9.0, -4.0, 1.0, 6.0].forEach(function (x) { b.fixture({ x: x, z: 0, circuit: 'ward', on: false, flicker: 0.05 }); });
    b.fixture({ x: 1.0, y: 2.4, z: -1.44, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.55 });
    b.fixture({ x: -9.0, y: 2.4, z: 1.44, type: 'emergency', wall: 'n', circuit: 'emergency', on: true, intensity: 0.45 });
    b.fixture({ x: 6.5, z: 0, circuit: 'ward', on: true, flicker: 0.12, intensity: 0.35, color: 0x8fa8a8 });

    // 206 电子门锁
    b.door({ id: 'door206', axis: 'x', center: -5.0, fixed: -1.51, width: 1.06, swing: 1, mat: M('paintCream', { color: 0x8b9a8f }), locked: true, lockedMsg: '206 电子门锁 · 需要密码' });
    b.prop(P('keypad'), -4.25, -1.59, { rotY: 0, y: 1.35, collide: false });
    b.addInteractable({
      id: 'keypad_206', kind: 'keypad', object: b.proxy(-4.25, 1.35, -1.45, 0.24, 0.32, 0.14),
      prompt: '输入 206 门锁密码', radius: 2.6,
      data: { doorId: 'door206', code: '0617', title: '电子门锁 · 206 病房', hint: '（她最喜欢六月十七日——那天窗外的树开花了）', objective: '进入 206 病房。' },
      pos: new T.Vector3(-4.25, 1.35, -1.45)
    });

    // 电梯
    b.prop(P('elevatorDoor', { open: false }), 9.99, 0, { rotY: -Math.PI / 2, collide: false });
    b.addInteractable({
      id: 'elevator_floor2', kind: 'floorTravel', object: b.proxy(9.85, 1.1, 0, 0.2, 2.1, 1.5),
      prompt: '电梯（返回三楼）', radius: 2.8, pos: new T.Vector3(9.8, 1.2, 0), data: { target: 'ward' }
    });
    textSign(b, '2F · 血液科', 9.86, 2.35, 0, 'w', 0.7, 0.2, { bg: '#1c3a32', fg: '#d8e6df' });

    b.dust({ count: 380, w: 23, d: 12, x: -1.0, z: 1.0 });
    b.playerSpawn = { x: 8.6, z: 0, yaw: Math.PI / 2 };
    b.story.floorName = '2F';
  };

  /* ============================================================
     四楼 · MIRROR-03 研究区
     ============================================================ */
  HW.LEVELS.floor4 = function (b) {
    var H = 3.0;
    b.ambient.fogColor = 0x080d0e;
    b.ambient.fogDensity = 0.068;
    b.ambient.ambientColor = 0x1f2d2e;
    b.ambient.ambientIntensity = 0.28;
    b.ambient.hemiSky = 0x243537; b.ambient.hemiGround = 0x070a0a; b.ambient.hemiIntensity = 0.13;
    b.ambient.exposure = 0.8;
    b.ambient.flashlight = true;
    b.ambient.background = 0x060b0c;
    var fm = M('concrete', { color: 0x8b928d });
    var cm = M('ceilingDark');
    var wm = M('wallPaintDark', { color: 0x7c8781 });
    var lm = M('tileWallOld');
    b.floor(-10, -1.45, 9, 1.45, fm, HT.tileSize.concrete);
    b.ceiling(-10, -1.45, 9, 1.45, cm, H, HT.tileSize.ceiling);
    var layers = [
      { y0: 0, y1: 1.0, mat: lm, tile: HT.tileSize.tileWall },
      { y0: 1.0, y1: H, mat: wm, tile: HT.tileSize.concrete }
    ];
    b.wall({ axis: 'x', fixed: -1.51, from: -10, to: 9.2, y1: H, layers: layers, openings: [{ center: -3.2, width: 2.4, height: 2.2 }] });
    b.wall({ axis: 'x', fixed: 1.51, from: -10, to: 9.2, y1: H, layers: layers, openings: [{ center: 4.0, width: 1.06, height: 2.05 }] });
    b.wall({ axis: 'z', fixed: -10.06, from: -1.51, to: 1.51, y1: H, layers: layers });
    b.wall({ axis: 'z', fixed: 9.06, from: -1.51, to: 1.51, y1: H, layers: layers, openings: [{ center: 0, width: 1.2, height: 2.1 }] });
    b.box({ x1: 9.02, x2: 9.18, y1: 0, y2: 2.1, z1: -0.68, z2: 0.68, mat: M('metalDark'), collide: true });

    // 实验室
    b.room({ x1: -7.5, x2: 0.5, z1: -5.4, z2: -1.57, side: 'north', height: H, floorMat: fm, ceilMat: cm, wallMat: wm, lowerMat: lm, lowerH: 1.0 });
    // MIRROR-03 主机
    b.box({ x1: -1.6, x2: 0.2, y1: 0, y2: 2.05, z1: -5.05, z2: -4.3, mat: M('metalDark'), collide: true });
    b.box({ x1: -1.55, x2: 0.15, y1: 0.9, y2: 1.7, z1: -4.29, z2: -4.27, mat: M('emissiveGreen', { emissiveIntensity: 0.35 }), collide: false });
    b.prop(P('desk'), -4.4, -3.6, { rotY: Math.PI });
    b.paper({ id: 'note_floor4_console', tex: 'note', kind: 'note', x: -4.4, y: 0.775, z: -3.6, w: 0.3, h: 0.38, rotY: 0.2 });
    b.tape({ id: 'tape_floor4', x: -4.35, y: 0.775, z: -3.42, rotY: -0.3 });
    b.prop(P('chair'), -4.4, -2.9, { rotY: 0 });
    b.prop(P('monitorStand', { on: false }), -6.0, -4.4, { rotY: 0, collide: false });
    b.prop(P('operatingTable'), -6.7, -3.35, { rotY: Math.PI / 2 });
    b.prop(P('sink'), -7.15, -4.9, { rotY: Math.PI / 2, collide: false });
    b.prop(P('medicalCart'), -7.0, -2.05, { rotY: 0.25 });
    b.prop(P('chair'), -5.35, -2.5, { rotY: Math.PI });
    b.prop(P('fileBox'), -1.85, -4.95, { rotY: 0.3, collide: false });
    b.prop(P('plant'), -0.65, -2.05, { rotY: 0.3, collide: false });
    b.prop(P('trashBin'), 0.25, -2.25, { rotY: 0.2, collide: false });
    b.prop(P('ivStand'), -7.0, -1.95, { rotY: 0.4, collide: false });
    // 三台控制台（谜题）
    var f4Consoles = [];
    [[-6.2, 0], [-4.6, 1], [-3.0, 2]].forEach(function (cfg) {
      var cx = cfg[0];
      b.box({ x1: cx - 0.35, x2: cx + 0.35, y1: 0, y2: 1.05, z1: -4.98, z2: -4.45, mat: M('metal'), collide: true });
      b.box({ x1: cx - 0.27, x2: cx + 0.27, y1: 1.05, y2: 1.3, z1: -4.75, z2: -4.48, mat: M('screen'), collide: false });
      var term = b.addInteractable({
        id: 'f4switch_' + cfg[1], kind: 'f4switch', object: b.proxy(cx, 1.15, -4.4, 0.7, 0.5, 0.3),
        prompt: 'MIRROR-03 控制台', radius: 2.2, data: { index: cfg[1] },
        pos: new T.Vector3(cx, 1.15, -4.4)
      });
      f4Consoles.push(term);
    });
    b.box({ x1: -1.2, x2: 0.3, y1: 1.3, y2: 2.15, z1: -5.33, z2: -5.31, mat: M('metalDark'), collide: false });
    b.paper({ tex: 'paper', x: -0.9, y: 1.7, z: -5.30, w: 0.5, h: 0.62, rotY: 0 });
    b.sign({ text: '受试者：047', x: 0.1, y: 1.72, z: -5.28, wall: 's', w: 0.5, h: 0.14, mount: true, signOpts: { bg: '#c9c3a6', fg: '#2a2820' }, emissiveIntensity: 0.12 });
    b.prop(P('clock'), -7.44, -3.0, { rotY: Math.PI / 2, y: 2.3, collide: false });
    textSign(b, '记 录', -6.2, 1.45, -4.44, 's', 0.4, 0.12, { bg: '#1c2a28', fg: '#cfdcd6' });
    textSign(b, '投 射', -4.6, 1.45, -4.44, 's', 0.4, 0.12, { bg: '#1c2a28', fg: '#cfdcd6' });
    textSign(b, '删 除', -3.0, 1.45, -4.44, 's', 0.4, 0.12, { bg: '#1c2a28', fg: '#cfdcd6' });
    b.story.f4Consoles = f4Consoles;
    b.fixture({ x: -4.8, z: -3.2, circuit: 'research', on: true, flicker: 0.08, intensity: 1.0, color: 0x9fc8b8 });
    b.fixture({ x: 0.2, y: 2.3, z: -5.2, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.7 });

    // 沈明远办公室
    b.room({ x1: 2.2, x2: 8.0, z1: 1.57, z2: 5.8, side: 'south', height: H, floorMat: fm, ceilMat: cm, wallMat: wm, lowerMat: lm, lowerH: 1.0 });
    b.prop(P('desk'), 5.0, 3.2, { rotY: Math.PI });
    b.paper({ id: 'note_floor4_office', tex: 'note', kind: 'note', x: 4.92, y: 0.775, z: 3.18, w: 0.3, h: 0.38, rotY: -0.1 });
    b.prop(P('chair'), 5.0, 2.5, { rotY: 0 });
    b.prop(P('cabinet'), 7.5, 5.0, { rotY: Math.PI });
    b.prop(P('cabinet'), 2.6, 5.0, { rotY: 0 });
    b.prop(P('chair'), 5.85, 2.7, { rotY: 0.5 });
    b.prop(P('plant'), 7.5, 2.05, { rotY: 0.3, collide: false });
    b.prop(P('fileBox'), 2.7, 4.15, { rotY: -0.2, collide: false });
    b.prop(P('phone'), 7.92, 3.15, { rotY: -Math.PI / 2, y: 1.2, collide: false });
    b.prop(P('trashBin'), 7.55, 4.6, { rotY: 0.2, collide: false });
    b.prop(P('ivStand'), 2.6, 2.2, { rotY: 0.2, collide: false });
    b.paper({ tex: 'paper', x: 2.85, y: 0.79, z: 3.85, w: 0.24, h: 0.32, rotY: 0.4 });
    b.paper({ tex: 'paper', x: 5.6, y: 0.79, z: 2.9, w: 0.22, h: 0.3, rotY: -0.3 });
    b.fixture({ x: 5.0, y: 1.05, z: 3.5, type: 'desk', circuit: 'research', on: true, intensity: 0.8, color: 0xffd9a0 });
    b.fixture({ x: 5.0, z: 3.8, circuit: 'research', on: true, flicker: 0.04, intensity: 0.75, color: 0xb9c9bd });
    b.fixture({ x: 2.5, y: 2.2, z: 5.7, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.4 });
    textSign(b, '研究负责人 · 沈明远', 5.0, 2.4, 1.44, 'n', 0.9, 0.2);
    b.box({ x1: 3.2, x2: 4.6, y1: 1.35, y2: 2.1, z1: 5.785, z2: 5.80, mat: M('woodDark'), collide: false });
    b.paper({ tex: 'paper', x: 3.6, y: 1.75, z: 5.775, w: 0.5, h: 0.62, rotY: 0 });
    b.prop(P('clock'), 7.94, 4.6, { rotY: -Math.PI / 2, y: 2.35, collide: false });
    b.poster({ tex: 'posterrules', x: 3.8, y: 1.6, z: 5.76, wall: 'n', w: 0.5, h: 0.68 });

    b.fixture({ x: 0.0, y: 2.4, z: -1.44, type: 'emergency', wall: 's', circuit: 'emergency', on: true, intensity: 0.5 });
    b.fixture({ x: -8.0, y: 2.4, z: 1.44, type: 'emergency', wall: 'n', circuit: 'emergency', on: true, intensity: 0.4 });
    b.prop(P('wheelchair'), 2.0, -0.9, { rotY: 0.8, collide: false });
    b.prop(P('ivStand'), 5.0, 0.9, { rotY: 0.2, collide: false });
    b.prop(P('trashBin'), -8.6, 0.8, { rotY: 0.2, collide: false });
    b.prop(P('plant'), -9.45, 1.0, { rotY: 0.4, collide: false });
    b.prop(P('gurney'), -8.8, -0.9, { rotY: Math.PI / 2 });
    b.sign({ text: 'MIRROR-03 · 研究区', x: -9.95, y: 2.35, z: 0, wall: 'e', w: 0.85, h: 0.2, mount: true, signOpts: { bg: '#1c2a28', fg: '#cfdcd6' }, emissiveIntensity: 0.2 });
    b.poster({ id: 'poster_research', read: true, data: { poster: true }, tex: 'posterrules', x: 2.2, y: 1.6, z: 1.44, wall: 'n', w: 0.5, h: 0.7 });
    // 电梯（可回三楼 / 下 B1）
    b.prop(P('elevatorDoor', { open: false }), 8.99, 0, { rotY: -Math.PI / 2, collide: false });
    b.addInteractable({
      id: 'elevator_floor4', kind: 'elevator4', object: b.proxy(8.85, 1.1, 0, 0.25, 2.1, 1.7),
      prompt: '电梯', radius: 2.8, pos: new T.Vector3(8.8, 1.2, 0), data: {}
    });
    textSign(b, '4F · 研究区', 8.86, 2.35, 0, 'w', 0.7, 0.2, { bg: '#1c3a32', fg: '#d8e6df' });

    b.dust({ count: 380, w: 20, d: 12, x: 0, z: 1.0 });
    b.playerSpawn = { x: 7.6, z: 0, yaw: Math.PI / 2 };
    b.story.floorName = '4F';
  };

  /* ============================================================
     B2 · 遗体暂存间（隐藏结局地点）
     ============================================================ */
  HW.LEVELS.hidden = function (b) {
    var H = 2.7;
    b.ambient.fogColor = 0x070c0d;
    b.ambient.fogDensity = 0.080;
    b.ambient.ambientColor = 0x1c2b2c;
    b.ambient.ambientIntensity = 0.26;
    b.ambient.hemiSky = 0x223436; b.ambient.hemiGround = 0x060909; b.ambient.hemiIntensity = 0.11;
    b.ambient.exposure = 0.82;
    b.ambient.flashlight = true;
    b.ambient.background = 0x05090a;

    var tileFloor = M('tileFloor', { color: 0x596866 });
    var lowerTile = M('tileWallOld', { color: 0x687b74 });
    var upperWall = M('concrete', { color: 0x6f7a74 });
    var ceilMat = M('concreteDark', { color: 0x5b625d });
    var steel = M('stainless');
    var steelDark = M('metalDark');
    var paint = M('paintGreen', { color: 0x667c74 });
    var layers = [
      { y0: 0, y1: 1.2, mat: lowerTile, tile: HT.tileSize.tileWall },
      { y0: 1.2, y1: H, mat: upperWall, tile: HT.tileSize.concrete }
    ];

    b.floor(-5, -4, 5, 4, tileFloor, HT.tileSize.tileFloor);
    b.ceiling(-5, -4, 5, 4, ceilMat, H, HT.tileSize.concrete);
    // 四壁（南墙留电梯口）
    b.wall({ axis: 'x', fixed: -4.06, from: -5, to: 5, y1: H, layers: layers });
    b.wall({ axis: 'z', fixed: -5.06, from: -4, to: 4, y1: H, layers: layers });
    b.wall({ axis: 'z', fixed: 5.06, from: -4, to: 4, y1: H, layers: layers });
    b.wall({ axis: 'x', fixed: 4.06, from: -5, to: 5, y1: H, layers: layers, openings: [{ center: 0, width: 1.2, height: 2.15 }] });
    // 电梯口封堵（防止走出去）
    b.box({ x1: -0.68, x2: 0.68, y1: 0, y2: 2.15, z1: 4.02, z2: 4.18, mat: steelDark, collide: true });

    // 电梯门与门框
    b.box({ x1: -0.78, x2: -0.60, y1: 0, y2: 2.25, z1: 3.96, z2: 4.14, mat: steelDark, collide: false });
    b.box({ x1: 0.60, x2: 0.78, y1: 0, y2: 2.25, z1: 3.96, z2: 4.14, mat: steelDark, collide: false });
    b.box({ x1: -0.78, x2: 0.78, y1: 2.15, y2: 2.3, z1: 3.96, z2: 4.14, mat: steelDark, collide: false });
    b.prop(P('elevatorDoor', { open: false }), 0, 3.93, { rotY: Math.PI, collide: false });
    b.addInteractable({
      id: 'hidden_elevator', kind: 'elevatorUp', object: b.proxy(0, 1.1, 3.78, 1.2, 2.0, 0.3),
      prompt: '返回三楼', radius: 2.4, pos: new T.Vector3(0, 1.2, 3.78)
    });
    textSign(b, 'B2 · 遗体暂存（限制区）', 0, 2.5, 3.94, 'n', 1.15, 0.2, { bg: '#1c3a32', fg: '#d8e6df' });
    // 电梯按钮与刷卡器
    b.box({ x1: 1.02, x2: 1.10, y1: 1.1, y2: 1.45, z1: 3.92, z2: 3.96, mat: steel, collide: false });
    b.box({ x1: 1.05, x2: 1.07, y1: 1.30, y2: 1.34, z1: 3.90, z2: 3.92, mat: M('emissiveRed', { emissiveIntensity: 0.6 }), collide: false });

    // ===== 整面遗体冷藏柜（自定义，非复用模型）=====
    b.box({ x1: -3.45, x2: 3.45, y1: 0, y2: 2.25, z1: -4.00, z2: -3.42, mat: steelDark, collide: true });
    b.box({ x1: -3.5, x2: 3.5, y1: 2.25, y2: 2.31, z1: -4.02, z2: -3.38, mat: steel, collide: false });
    b.box({ x1: -3.5, x2: 3.5, y1: 0.02, y2: 0.10, z1: -4.02, z2: -3.38, mat: steel, collide: false });
    var coolerCols = 4, coolerRows = 2;
    var cw0 = 1.64, ch0 = 1.02;
    for (var cr = 0; cr < coolerRows; cr++) {
      for (var cc = 0; cc < coolerCols; cc++) {
        var cx = -2.46 + cc * cw0;
        var cy = 0.62 + cr * ch0;
        var is03 = (cr === 0 && cc === 2);
        // 抽屉面板，明显凸出柜体，避免共面闪烁
        b.box({ x1: cx - 0.76, x2: cx + 0.76, y1: cy - 0.46, y2: cy + 0.46, z1: -3.40, z2: -3.31, mat: is03 ? steel : M('metal', { color: 0x8a9497 }), collide: false });
        b.box({ x1: cx - 0.72, x2: cx + 0.72, y1: cy - 0.42, y2: cy + 0.42, z1: -3.305, z2: -3.295, mat: steelDark, collide: false });
        // 拉手
        b.box({ x1: cx - 0.28, x2: cx + 0.28, y1: cy - 0.10, y2: cy - 0.06, z1: -3.275, z2: -3.245, mat: steel, collide: false });
        b.box({ x1: cx - 0.28, x2: cx - 0.24, y1: cy - 0.10, y2: cy - 0.02, z1: -3.30, z2: -3.245, mat: steel, collide: false });
        b.box({ x1: cx + 0.24, x2: cx + 0.28, y1: cy - 0.10, y2: cy - 0.02, z1: -3.30, z2: -3.245, mat: steel, collide: false });
        // 铭牌
        b.box({ x1: cx - 0.16, x2: cx + 0.16, y1: cy + 0.24, y2: cy + 0.31, z1: -3.30, z2: -3.29, mat: M('paper', { color: is03 ? 0xe0d8c0 : 0xc8c8bc }), collide: false });
      }
    }
    textSign(b, '03 · 林 晚', 0.0, 1.28, -3.24, 's', 0.52, 0.16, { bg: '#2a2a26', fg: '#e0d8c0' });
    b.decal({ tex: 'mold1', x: -1.9, y: 0.6, z: -3.29, w: 0.5, h: 1.1, opacity: 0.45 });
    b.decal({ tex: 'blood2', x: 2.4, y: 0.4, z: -3.29, w: 0.4, h: 0.8, opacity: 0.35 });
    b.pickup({
      id: 'item_redstring', itemId: 'redString', name: '褪色的红绳', kind: 'string',
      x: 0.0, y: 1.18, z: -3.20, glintColor: 0xff6a5a, glintScale: 0.7
    });
    // 柜子低鸣的压缩机
    b.box({ x1: -4.85, x2: -4.15, y1: 0, y2: 1.1, z1: -3.8, z2: -3.0, mat: paint, collide: true });
    b.box({ x1: -4.8, x2: -4.2, y1: 0.3, y2: 0.42, z1: -2.99, z2: -2.97, mat: steelDark, collide: false });

    // ===== 中央解剖台（自定义）=====
    b.box({ x1: 0.1, x2: 2.1, y1: 0.72, y2: 0.80, z1: -0.55, z2: 0.55, mat: steel, collide: true });
    b.box({ x1: 0.18, x2: 2.02, y1: 0.62, y2: 0.72, z1: -0.46, z2: 0.46, mat: steelDark, collide: false });
    [[0.32, -0.35], [1.88, -0.35], [0.32, 0.35], [1.88, 0.35]].forEach(function (lg) {
      b.box({ x1: lg[0] - 0.045, x2: lg[0] + 0.045, y1: 0, y2: 0.72, z1: lg[1] - 0.045, z2: lg[1] + 0.045, mat: steelDark, collide: false });
    });
    b.box({ x1: 0.95, x2: 1.25, y1: 0.70, y2: 0.735, z1: -0.12, z2: 0.12, mat: M('metalDark'), collide: false });
    b.paper({ id: 'note_hidden_letter', tex: 'paper', kind: 'note', x: 1.85, y: 0.785, z: 0.0, w: 0.34, h: 0.26, rotY: 0.25 });

    // 器械推车
    b.box({ x1: -4.55, x2: -3.70, y1: 0.30, y2: 0.36, z1: -1.10, z2: -0.55, mat: steel, collide: false });
    b.box({ x1: -4.55, x2: -3.70, y1: 0.80, y2: 0.86, z1: -1.10, z2: -0.55, mat: steel, collide: false });
    b.box({ x1: -4.55, x2: -4.49, y1: 0, y2: 0.9, z1: -1.10, z2: -1.04, mat: steelDark, collide: true });
    b.box({ x1: -3.76, x2: -3.70, y1: 0, y2: 0.9, z1: -1.10, z2: -1.04, mat: steelDark, collide: false });
    b.box({ x1: -4.55, x2: -4.49, y1: 0, y2: 0.9, z1: -0.61, z2: -0.55, mat: steelDark, collide: false });
    b.box({ x1: -3.76, x2: -3.70, y1: 0, y2: 0.9, z1: -0.61, z2: -0.55, mat: steelDark, collide: false });
    b.box({ x1: -4.45, x2: -4.15, y1: 0.88, y2: 1.02, z1: -0.95, z2: -0.75, mat: M('plastic', { color: 0x9fb0a4 }), collide: false });

    // 办公室金属桌与凳子（沈明远的椅子）
    b.box({ x1: -3.55, x2: -1.85, y1: 0.72, y2: 0.78, z1: 1.55, z2: 2.35, mat: steelDark, collide: true });
    b.box({ x1: -3.55, x2: -1.85, y1: 0.60, y2: 0.72, z1: 1.55, z2: 1.62, mat: steel, collide: false });
    [[-3.45, 1.65], [-2.05, 1.65], [-3.45, 2.25], [-2.05, 2.25]].forEach(function (lg2) {
      b.box({ x1: lg2[0] - 0.04, x2: lg2[0] + 0.04, y1: 0, y2: 0.72, z1: lg2[1] - 0.04, z2: lg2[1] + 0.04, mat: steelDark, collide: false });
    });
    b.box({ x1: -2.95, x2: -2.45, y1: 0, y2: 0.45, z1: 0.95, z2: 1.25, mat: paint, collide: true });
    b.box({ x1: -2.95, x2: -2.45, y1: 0.45, y2: 0.50, z1: 0.90, z2: 1.30, mat: steel, collide: false });
    b.box({ x1: -3.05, x2: -2.35, y1: 0.50, y2: 0.58, z1: 1.30, z2: 1.60, mat: paint, collide: false });
    b.paper({ id: 'note_hidden_note2', tex: 'note', kind: 'note', x: -3.1, y: 0.785, z: 2.0, w: 0.28, h: 0.36, rotY: 0.3 });

    // 观察窗（东墙）
    b.box({ x1: 4.96, x2: 5.00, y1: 1.15, y2: 2.15, z1: -1.7, z2: 1.7, mat: steelDark, collide: false });
    b.box({ x1: 4.94, x2: 4.97, y1: 1.22, y2: 2.08, z1: -1.6, z2: 1.6, mat: M('glass', { color: 0x2a3838 }), collide: false });
    for (var wb = -1; wb <= 1; wb++) {
      b.box({ x1: 4.95, x2: 4.98, y1: 1.18, y2: 2.12, z1: wb * 1.1 - 0.03, z2: wb * 1.1 + 0.03, mat: steelDark, collide: false });
    }
    // 地面排水槽
    b.box({ x1: -3.0, x2: 3.0, y1: 0.0, y2: 0.014, z1: 2.95, z2: 3.05, mat: steelDark, collide: false });

    // 天花板管道与阀门
    b.box({ x1: -4.8, x2: 4.8, y1: 2.52, y2: 2.58, z1: -3.0, z2: -2.92, mat: paint, collide: false });
    b.box({ x1: -4.8, x2: 4.8, y1: 2.44, y2: 2.48, z1: -2.80, z2: -2.76, mat: steel, collide: false });
    b.box({ x1: -3.0, x2: -2.8, y1: 2.40, y2: 2.60, z1: -2.86, z2: -2.70, mat: M('emissiveRed', { emissiveIntensity: 0.35 }), collide: false });
    // 墙上的旧告示与污渍
    b.poster({ id: 'poster_b2', read: true, data: { poster: true }, tex: 'signCold', x: -4.99, y: 1.55, z: 1.6, wall: 'e', w: 0.55, h: 0.7 });
    b.decal({ tex: 'mold2', x: 4.99, y: 1.3, z: -2.6, wall: 'w', w: 1.6, h: 1.3, opacity: 0.4 });
    b.decal({ tex: 'blood2', x: -1.6, y: 0.014, z: 1.7, onFloor: true, w: 1.2, h: 1.2, opacity: 0.4 });
    b.decal({ tex: 'floorstain', x: 2.4, y: 0.012, z: 2.2, onFloor: true, w: 1.8, h: 1.4, opacity: 0.35 });

    // 灯光：稳定的冷白 + 一盏红色应急灯（不闪）
    b.fixture({ x: 0, y: 2.62, z: 0.6, circuit: 'hidden', on: true, flicker: 0, intensity: 0.85, color: 0xb9d8d0 });
    b.fixture({ x: 2.2, y: 2.62, z: -1.0, circuit: 'hidden', on: true, flicker: 0, intensity: 0.55, color: 0x9fc0bc });
    b.fixture({ x: 1.1, y: 2.0, z: 0.0, type: 'desk', circuit: 'hidden', on: true, noMesh: true, intensity: 1.0, color: 0xcfe8e2 });
    b.fixture({ x: -4.9, y: 1.9, z: 2.8, type: 'emergency', wall: 'e', circuit: 'emergency', on: true, intensity: 0.65 });
    b.fixture({ x: 4.9, y: 1.9, z: -3.0, type: 'emergency', wall: 'w', circuit: 'emergency', on: true, intensity: 0.45 });

    b.dust({ count: 260, w: 10, d: 8, x: 0, z: 0 });
    b.playerSpawn = { x: 0, z: 2.6, yaw: 0 };
    b.story.hiddenDen = true;
  };

  /* ============================================================
     白房（终章）
     ============================================================ */
  HW.LEVELS.white = function (b) {
    var H = 3.4;
    b.ambient.fogColor = 0xdfe7e2;
    b.ambient.fogDensity = 0.030;
    b.ambient.ambientColor = 0xe9efe9;
    b.ambient.ambientIntensity = 0.78;
    b.ambient.hemiSky = 0xffffff; b.ambient.hemiGround = 0xb9c4bd; b.ambient.hemiIntensity = 0.32;
    b.ambient.exposure = 1.00;
    b.ambient.flashlight = false;
    b.ambient.background = 0xe6ece7;

    b.floor(-6, -6, 6, 6, M('whiteFloor'), HT.tileSize.tileFloor);
    b.ceiling(-6, -6, 6, 6, M('whiteWall'), H, 1);
    var whiteLayers = [{ y0: 0, y1: H, mat: M('whiteWall'), tile: 1 }];
    b.wall({ axis: 'x', fixed: -6.06, from: -6, to: 6, y1: H, layers: whiteLayers });
    b.wall({ axis: 'x', fixed: 6.06, from: -6, to: 6, y1: H, layers: whiteLayers });
    b.wall({ axis: 'z', fixed: -6.06, from: -6, to: 6, y1: H, layers: whiteLayers });
    b.wall({ axis: 'z', fixed: 6.06, from: -6, to: 6, y1: H, layers: whiteLayers });
    b.box({ x1: -6, x2: 6, y1: 0, y2: 0.09, z1: -6, z2: -5.975, mat: M('whiteWall'), collide: false });
    b.box({ x1: -6, x2: 6, y1: 0, y2: 0.09, z1: 5.975, z2: 6, mat: M('whiteWall'), collide: false });

    // 治疗床
    b.prop(P('whiteRoomBed', { straps: true }), 0, -1.2, { rotY: 0 });
    b.prop(P('ivStand'), -1.1, -2.0, { rotY: 0.2, collide: false });
    b.prop(P('operatingTable'), 3.4, -3.6, { rotY: Math.PI / 2 });
    b.prop(P('monitorStand', { on: false }), 1.8, -3.8, { rotY: 0, collide: false });
    b.prop(P('chair'), 1.8, 0.3, { rotY: -0.4 });
    b.prop(P('chair'), -1.8, 0.3, { rotY: 0.4 });
    b.prop(P('cabinet'), 5.4, 4.75, { rotY: -Math.PI / 2 });
    b.pickup({ id: 'item_crowbar', itemId: 'crowbar', name: '铁质撬棍', kind: 'crowbar', x: 5.05, y: 0.05, z: 4.15, rotY: 0.5, glintColor: 0xbfd0c8, glintScale: 0.7 });
    // 白房维护通道（可以离开白房，回到货运梯所在楼层）
    b.box({ x1: -0.72, x2: 0.72, y1: 0, y2: 2.2, z1: 5.965, z2: 5.995, mat: M('metalDark'), collide: false });
    b.box({ x1: -0.58, x2: 0.58, y1: 0.1, y2: 2.05, z1: 5.96, z2: 5.97, mat: M('metal', { color: 0x4d5652 }), collide: false });
    b.addInteractable({
      id: 'white_exit', kind: 'whiteExit', object: b.proxy(0, 1.1, 5.78, 1.4, 2.0, 0.3),
      prompt: '离开白房', radius: 2.6, pos: new T.Vector3(0, 1.15, 5.82)
    });
    b.sign({ text: '维 护 通 道', x: 0, y: 2.45, z: 5.955, wall: 'n', w: 0.6, h: 0.18, mount: true, signOpts: { bg: '#dfe6dd', fg: '#173b32' }, emissiveIntensity: 0.15 });
    b.prop(P('sink'), -5.40, 3.2, { rotY: Math.PI / 2, collide: false });
    b.prop(P('curtainRail', { w: 3.0 }), 0, -3.0, { y: 3.18, collide: false });
    b.prop(P('curtain', { w: 3.0, h: 2.9, color: '#e6ebe6' }), 0, -2.95, { y: 0.28, collide: false });
    // 大镜子
    b.mirror({ x: 0, y: 1.65, z: -5.99, wall: 's', w: 2.4, h: 2.4 });
    // 档案桌（加宽）：录音机、档案、磁带都完整放在桌面上
    b.box({ x1: -5.15, x2: -3.25, y1: 0, y2: 0.72, z1: 1.75, z2: 2.65, mat: M('whiteLeather'), collide: true });
    b.box({ x1: -5.20, x2: -3.20, y1: 0.72, y2: 0.78, z1: 1.70, z2: 2.70, mat: M('metalLight'), collide: false });
    b.prop(P('tapeRecorder'), -4.55, 2.15, { rotY: Math.PI / 2, y: 0.785, collide: false });
    b.paper({ id: 'file_white', tex: 'patientcard', kind: 'file', x: -3.75, y: 0.785, z: 2.15, w: 0.34, h: 0.24, rotY: -0.15 });
    b.tape({ id: 'tape_white', x: -4.85, y: 0.785, z: 2.42, rotY: 0.3 });
    b.paper({ id: 'note_white_tool', tex: 'note', kind: 'note', x: -3.75, y: 0.785, z: 2.48, w: 0.3, h: 0.38, rotY: -0.15 });
    if (window.HGame && window.HGame.run === 1) {
      b.paper({ id: 'note_first_run_envelope', tex: 'note', kind: 'note', x: -4.35, y: 0.79, z: 2.18, w: 0.34, h: 0.26, rotY: 0.18 });
    }
    // 墙上钟与挂牌
    b.prop(P('clock'), 5.99, -1.0, { y: 2.4, rotY: -Math.PI / 2, collide: false });
    b.sign({ text: '静默治疗室 · 0 号房', x: 0, y: 2.9, z: 5.99, wall: 'n', w: 1.0, h: 0.24, mount: false, signOpts: { bg: '#eef1ec', fg: '#25352f' }, emissiveIntensity: 0.1 });
    b.sign({ text: '保持安静 · 保持静止', x: -5.99, y: 2.0, z: 0, wall: 'e', w: 0.9, h: 0.2, mount: false, signOpts: { bg: '#eef1ec', fg: '#4a5a52' }, emissiveIntensity: 0.1 });
    // 灯光：明亮
    for (var fx = -3; fx <= 3; fx += 3) {
      for (var fz = -3; fz <= 3; fz += 3) {
        b.fixture({ x: fx, z: fz, circuit: 'white', on: true, flicker: 0, intensity: 1.7, color: 0xffffff, y: H, housingMat: M('whiteWall') });
      }
    }
    // 一周目：白房里没有妹妹，只有一个空椅子和桌上的信封
    if (!(window.HGame && window.HGame.run === 1)) {
    // 姐姐（背对玩家的白裙人影，坐姿）
    var sister = new T.Group();
    var whiteCloth = M('whiteLeather');
    // 垂落的裙摆
    var gown = new T.Mesh(new T.CylinderGeometry(0.27, 0.46, 0.78, 16, 1, true), whiteCloth);
    gown.position.set(0, 0.44, 0.0);
    sister.add(gown);
    var gownBack = new T.Mesh(new T.CylinderGeometry(0.24, 0.34, 0.68, 12, 1, true), whiteCloth);
    gownBack.position.set(0, 0.42, -0.13);
    sister.add(gownBack);
    // 大腿/膝盖
    var lap = new T.Mesh(new T.BoxGeometry(0.42, 0.14, 0.42), whiteCloth);
    lap.position.set(0, 0.56, 0.16);
    sister.add(lap);
    var legL = new T.Mesh(new T.CylinderGeometry(0.06, 0.05, 0.5, 8), M('whiteLeather'));
    legL.position.set(-0.11, 0.3, 0.34);
    sister.add(legL);
    var legR = legL.clone();
    legR.position.x = 0.11;
    sister.add(legR);
    var footL = new T.Mesh(new T.BoxGeometry(0.11, 0.06, 0.22), M('plastic', { color: 0xd9dcd6 }));
    footL.position.set(-0.11, 0.05, 0.42);
    sister.add(footL);
    var footR = footL.clone(); footR.position.x = 0.11; sister.add(footR);
    // 躯干
    var torso = new T.Mesh(new T.CylinderGeometry(0.155, 0.2, 0.52, 12), whiteCloth);
    torso.position.set(0, 0.86, 0.02);
    torso.rotation.x = 0.04;
    sister.add(torso);
    var shoulders = new T.Mesh(new T.CylinderGeometry(0.2, 0.16, 0.14, 12), whiteCloth);
    shoulders.position.set(0, 1.09, 0.02);
    sister.add(shoulders);
    // 手臂
    var armL = new T.Mesh(new T.CylinderGeometry(0.045, 0.04, 0.5, 8), M('whiteLeather'));
    armL.position.set(-0.19, 0.83, 0.1);
    armL.rotation.z = 0.16;
    armL.rotation.x = 0.4;
    sister.add(armL);
    var armR = armL.clone();
    armR.position.x = 0.19;
    armR.rotation.z = -0.16;
    armR.rotation.x = 0.4;
    sister.add(armR);
    // 脖子与头
    var neck = new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 0.1, 8), M('whiteLeather'));
    neck.position.set(0, 1.17, 0.02);
    sister.add(neck);
    var head = new T.Mesh(new T.SphereGeometry(0.125, 16, 12), M('whiteLeather'));
    head.position.set(0, 1.29, 0.02);
    head.scale.set(0.85, 1.12, 0.9);
    sister.add(head);
    var hair = new T.Mesh(new T.SphereGeometry(0.135, 14, 12), M('plasticDark'));
    hair.position.set(0, 1.29, -0.01);
    hair.scale.set(0.9, 1.12, 1.0);
    sister.add(hair);
    var hairBack = new T.Mesh(new T.CylinderGeometry(0.1, 0.14, 0.6, 10), M('plasticDark'));
    hairBack.position.set(0, 0.98, -0.12);
    sister.add(hairBack);
    b.prop(P('chair'), 0, 2.4, { rotY: Math.PI });
    sister.position.set(0, 0.02, 2.42);
    sister.rotation.y = Math.PI;
    sister.traverse(function (o) { if (o.isMesh) { o.userData.noMerge = true; } });
    b.group.add(sister);
    b.story.sister = sister;
    b.story.sisterHead = hair;
    b.addInteractable({
      id: 'sister_white', kind: 'sister', object: sister, prompt: '走近她', radius: 2.4,
      pos: new T.Vector3(0, 1.0, 2.42),
      glint: b._glint(0, 1.55, 2.42, 0xdfeee4)
    });
    }
    // 地面细节：束缚带、纸张、血迹
    b.decal({ tex: 'blood3', x: 1.3, y: 0.013, z: -3.4, onFloor: true, w: 0.9, h: 0.9, opacity: 0.3 });
    b.paper({ id: 'note_white', tex: 'note', kind: 'note', x: 2.6, y: 0.016, z: 3.6, w: 0.3, h: 0.38, rotY: 0.6 });
    b.playerSpawn = { x: 0, z: 5.3, yaw: 0 };
    b.trigger({ id: 'trig_sister', x1: -2.2, x2: 2.2, z1: 1.4, z2: 3.8, once: true });
    b.finishWhite = true;
  };
})();
