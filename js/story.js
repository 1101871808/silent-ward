/* ============================================================
   静默病栋 SILENT WARD — 剧情 story.js
   《静默病栋》剧本、文档、录音、章节流程、谜题、Jump Scare、多结局
   故事：仁和医院东翼「静默疗法」计划，与一个每晚都会回来找妹妹的人。
   ============================================================ */
(function () {
  'use strict';

  var HStory = window.HStory = {};
  var G = null;

  /* ============================================================
     文本资料
     ============================================================ */
  HStory.NOTES = {
    note302: {
      type: '手写纸条', title: '塞在床头柜下的纸条',
      body: '别相信镜子里的你。\n\n如果它比你慢半拍，就闭上眼睛，数到十。\n\n手电在床头柜上。\n\n钥匙……钥匙在——\n\n（后半张被撕掉了，断口很整齐，像是被谁用指甲一点点抠掉的。）'
    },
    note301: {
      type: '提醒便签', title: '贴在柜门内侧的便签',
      body: '配电箱烧了保险丝。备用的在柜顶。\n\n顺序：先西，后中，最后东。\n\n别搞错。上次搞错的时候，走廊的灯全灭了，然后——\n\n（后面的字迹突然变成一团乱线，像是写到一半被人从背后碰了一下。）'
    },
    note_switch: {
      type: '墙上的便签', title: '配电室里贴着的便签',
      body: '西 → 中 → 东。\n\n顺序错了会跳闸，第三次会烧断。\n\n别在凌晨两点到三点之间修它。\n\n那个时间段，走廊里不止你一个人。'
    },
    note303: {
      type: '病人日记', title: '303 房的笔记本',
      body: '3 月 9 日\n\n他们说只要看着镜子，就能把害怕的东西忘掉。\n\n可我看见镜子里的人不是我。\n\n她穿白裙子，头发很长，站在我身后。\n\n护士说那只是幻觉。\n\n可幻觉为什么会对我笑。'
    },
    note304: {
      type: '血写的纸', title: '地上揉皱的纸',
      body: '他来了。\n\n他一直在走廊里走。\n\n别开 304 的门。\n\n别让手电照到他。\n\n——如果他已经站在你身后，就不要回头。'
    },
    note306: {
      type: '交接便签', title: '推床上的便签',
      body: '太平间送来的。别掀开。\n\n他的手腕上也有一个 047。\n\n和 302 房那位一模一样。'
    },
    note_nurse_code: {
      type: '便签', title: '压在台历下的便签',
      body: '药房临时密码：0312。\n\n是火灾那天。\n\n别让沈医生知道我把这个写下来。'
    },
    note_white: {
      type: '地上的纸条', title: '白房地上的纸条',
      body: '如果你看到这张纸条，说明你又走到了这里。\n\n别相信她。\n\n她是你自己造出来的。\n\n也是你唯一留下来的东西。\n\n——你'
    },
    poster_evac: {
      type: '墙上告示', title: '三 楼 东 翼 · 疏散图',
      body: '红色标记是你所在的位置。\n\n安全出口位于西侧楼梯间。\n\n※ 发生紧急情况时，请勿使用电梯。\n※ 地下一层为限制区域，禁止通行。\n\n（图纸右下角用红笔圈出了电梯的位置，旁边写着：不要去 B1。）'
    },
    poster_evac_b1: {
      type: '墙上告示', title: 'B1 层 · 疏散图',
      body: '此区域无安全出口。\n\n如遇紧急情况，请返回电梯厅。\n\n※ 太平间与冷藏室为限制区域。\n\n（图上的“返回电梯厅”被红笔反复描粗，纸都画破了。）'
    },
    poster_rules: {
      type: '告示牌', title: '病 房 须 知',
      body: '一、请勿在夜间离开病房。\n\n二、走廊灯熄灭时，请留在原地。\n\n三、听到呼唤您名字的声音，不要回应。\n\n四、镜子里的您，如果动作慢了一拍，请立即闭上眼睛。\n\n五、护士站没有夜班护士。\n\n六、如见到穿病号服的高个子——不要看他，不要跑。'
    },
    poster_therapy: {
      type: '招募海报', title: '静 默 疗 法 · 第三期',
      body: '· 免除全部治疗费用\n· 全程无痛，无需服药\n· 一次治疗，告别恐惧\n· 名额有限，自愿报名\n\n请前往三楼东翼护士站登记。\n研究编号 MIRROR-03。\n\n（海报被人用指甲在“告别恐惧”四个字上反复划了很多道。）'
    },
    poster_therapy2: {
      type: '招募海报', title: '静默疗法 · 志愿者告知书',
      body: '治疗过程中，您可能会看见一些“不存在的人”。\n\n这是正常的。\n\n请不要和它们说话。\n\n请不要给它们起名字。\n\n名字会让它们留下来。'
    },
    poster_child: {
      type: '蜡笔画', title: '墙上的儿童画',
      body: '画里有医院的窗户、红色的太阳、一个扎辫子的小女孩，和一个很高的黑色人影。\n\n画的背面写着一行歪歪扭扭的字：\n\n“哥哥 别去白房间”\n\n纸的边缘有干涸的暗色痕迹，像是被谁握了很久。'
    },
    poster_calendar: {
      type: '值班表', title: '2023 年 3 月 · 东翼护理组',
      body: '3 月 12 日的格子被红笔圈住了，旁边写着：事故。\n\n3 月 13 日之后，整张表都是空的。\n\n最下面有一行小字，是另一种笔迹：\n\n“3.12 之后，东翼不再排班。”'
    },
    poster_news: {
      type: '旧报纸', title: '仁和医院院报（剪报）',
      body: '东翼病区火灾：3 人遇难，12 人失踪\n\n本报讯 3 月 12 日凌晨，我院东翼三楼病区发生一起不明原因火灾。消防部门于 02:51 接警，03:20 明火被扑灭。\n\n据院方通报，火灾造成 3 名患者死亡，另有 12 名患者及 2 名医护人员下落不明。\n\n多名家属向本报反映，从未收到任何转院通知。\n\n记者调查发现，东翼三楼此前长期用于开展一项名为“静默疗法”的临床研究。研究负责人沈某已于事发后离职，去向不明。\n\n截至发稿，院方未就“静默疗法”作出回应。'
    },
    poster_isolation: {
      type: '警示牌', title: '隔 离 区',
      body: '未经许可，禁止入内。\n\n（牌子下方的门缝里，塞着一只被压扁的纸鹤。）'
    },
    poster_cold: {
      type: '门牌', title: '尸体冷藏室',
      body: '温度 2℃ · 请随手关门。\n\n（门牌旁边的墙上有一道很长的抓痕，从肩膀的高度一直划到地面。）'
    }
  };

  HStory.FILES = {
    file_302: {
      type: '住院患者卡', title: '302 房 · 林晚',
      body: '姓名：林晚\n性别：女\n年龄：23\n科室：东翼 · 精神科\n床号：302\n住院号：RH-23-0312-047\n诊断：创伤后应激障碍\n治疗方案：静默疗法 · 第三期\n\n卡片背面用红笔写着：\n\n“她是你妹妹。你是哥哥。\n你们一起转院了。”\n\n——可字迹，和你自己的一模一样。'
    },
    file_303: {
      type: '病程记录', title: '302 房 · 第 11 年',
      body: '记录时间：2023-03-10\n\n受试者 047 于本日凌晨再次出现在东翼走廊。\n\n他在寻找一名叫“林晚”的女性。经查，本院无此人入院记录。\n\n受试者对“林晚”的描述在过去十一年中始终一致：白裙、长发、叫他哥哥。\n\n建议：继续执行夜间循环治疗方案。只要他还在找，他就不会想起那场火。\n\n——沈明远'
    },
    file_304: {
      type: '知情同意书', title: 'MIRROR-03 · 受试者同意书',
      body: '项目名称：MIRROR-03 静默疗法\n研究负责人：沈明远\n受试者编号：047\n\n本人自愿接受记忆清除治疗，并同意在治疗期间接受封闭管理。\n\n本人确认：治疗过程中可能出现的“投射人格”属于治疗副作用，本人不会对其产生情感依赖。\n\n受试者签名：陈 默\n日期：2012 年 3 月 12 日\n\n（签名下面还有一行被涂掉的字，用力过猛，纸都破了。）'
    },
    file_305: {
      type: '护理记录', title: '305 房 · 空床',
      body: '记录时间：2023-03-11 03:40\n\n查房时 305 房为空床。\n\n但受试者 047 坚持认为床上躺着一个人。\n\n他坐在床边，给“她”读了一整夜的报纸。\n\n我们按他说的，在床边放了一杯水。\n\n第二天早上，水是空的。'
    },
    file_306: {
      type: '交接便签', title: '推床交接单',
      body: '太平间 → 东翼 306 房\n\n遗体一具。男性。手腕系蓝色住院带，编号 047。\n\n家属：无。\n\n备注：这位病人昨天还在走廊里找妹妹。\n\n今天早上，我们在太平间的三号柜里发现了他。\n\n没有人知道他是什么时候进去的。'
    },
    file_pharmacy: {
      type: '实验记录', title: 'MIRROR-03 · 第七次治疗',
      body: '受试者 047 对“失去”的恐惧，在第七次治疗中被投射成一个具体的人形。\n\n他给那个投射起了名字，叫“林晚”。\n\n只要他还认为林晚在等他，他就不会离开东翼。\n\n恐惧需要一个笼子。我们给了他一间病房。\n\n问题在于：\n\n镜子里的投射，开始自己动了。\n\n它比受试者更清楚真相。\n\n如果有一天，他走到了白房——\n\n就让他留在里面吧。'
    },
    file_nurse: {
      type: '值班日志', title: '3 月 12 日 · 夜班记录',
      body: '02:37  东翼三楼停电。\n\n02:40  302 房病人失踪。\n\n02:45  走廊出现不明人影，身高约两米。\n\n02:51  三楼东侧起火。火势蔓延极快。\n\n02:58  疏散时，047 号病人拒绝离开 302。\n\n　　　他说：“我要去救林晚。”\n\n　　　可 302 房里，只有他一个人。\n\n03:20  明火扑灭。\n\n后续：047 号病人不知去向。东翼封闭。\n\n（最后一页的纸被烧掉了一半，边缘卷曲发黑。）'
    },
    file_morgue: {
      type: '医生档案', title: '沈明远 · 研究手记',
      body: '受试者 047：陈默，28 岁。\n\n入院原因：3·12 火灾中目睹妹妹林晚遇难，创伤后应激障碍，重度解离。\n\n治疗目标：清除创伤记忆。\n\n副作用：受试者构建了一个“还在等他”的妹妹，并每晚会重新走进东翼，重复寻找。\n\n十一年来，治疗从未成功。\n\n他发现真相的时间，永远停在凌晨 2:37。\n\n建议：\n\n终止治疗，或接受永久驻留。\n\n——沈明远 · 2023.3.12'
    },
    file_white: {
      type: '病历封面', title: '047 号 · 陈默',
      body: '姓名：陈默\n年龄：39\n住院时间：2012 - 2023\n诊断：复杂性创伤后应激障碍（持续性）\n\n治疗记录：\n\n第 1 年：记忆清除 · 失败\n第 3 年：药物诱导睡眠 · 失败\n第 7 年：MIRROR-03 镜像投射 · 部分有效\n第 11 年：夜间循环 · 持续中\n\n主治医师备注：\n\n他每天晚上 2:37 醒来，走进走廊，寻找林晚。\n\n天亮之前，他会回到 302。\n\n他从未走出过东翼。\n\n我们决定，不再叫醒他。'
    }
  };

  HStory.TAPES = {
    tape_nurse: {
      type: '磁带 · 值班室', title: '值班护士的录音',
      lines: [
        { who: '护士', text: '03 点 12 分……东翼三楼又停电了。' },
        { who: '护士', text: '我刚刚去 302 看了一圈，047 号病人又不在床上。' },
        { who: '护士', text: '他总说他在找他妹妹。可 302 里从来只有一张床。' },
        { who: '护士', text: '沈医生说，别管他。他会自己走回来的。' },
        { who: '护士', text: '……你听见了吗？走廊里有人在走。' },
        { who: '护士', text: '别开门。' },
        { who: '杂音', text: '（磁带被扯断的刺啦声，持续了很久）', noise: true }
      ]
    },
    tape_pharmacy: {
      type: '磁带 · 沈明远', title: '静默疗法 · 说明录音',
      lines: [
        { who: '沈明远', text: '记录，MIRROR-03 第七次治疗。' },
        { who: '沈明远', text: '受试者对“失去”的恐惧，被投射成了一个具体的人形。' },
        { who: '沈明远', text: '他给那个投射起了名字，叫林晚。' },
        { who: '沈明远', text: '只要他还认为林晚在等他，他就不会离开东翼。' },
        { who: '沈明远', text: '恐惧需要一个笼子，而我们给了他一间病房。' },
        { who: '沈明远', text: '问题是……镜子里的东西，开始自己动了。' },
        { who: '沈明远', text: '它比他更清楚真相。' },
        { who: '沈明远', text: '如果有一天，他走到了白房——就让他留在里面吧。' },
        { who: '杂音', text: '（录音在一声很轻的关门声后中断）', noise: true }
      ]
    },
    tape_morgue: {
      type: '磁带 · 未标注', title: '太平间里的录音机',
      lines: [
        { who: '未知', text: '……第七天。' },
        { who: '未知', text: '我把她放在三号柜。她手腕上还戴着我给她买的红绳。' },
        { who: '未知', text: '他们说火灾的时候，她没跑出来。' },
        { who: '未知', text: '可昨天晚上，我在走廊里听见她叫我的名字。' },
        { who: '未知', text: '所以我回来了。我每天夜里都会回来。' },
        { who: '未知', text: '如果我找不到她……那就说明她还没死，对吧？' },
        { who: '未知', text: '对吧？' },
        { who: '呼吸', text: '（长久的呼吸声，越来越近，最后贴在了麦克风上）', noise: true }
      ]
    },
    tape_white: {
      type: '磁带 · 最后', title: '你自己的声音',
      lines: [
        { who: '陈默', text: '……如果你听到这段录音，说明你又走到这里了。' },
        { who: '陈默', text: '别害怕。她不会伤害你。' },
        { who: '陈默', text: '她只是你还没说完的那句话。' },
        { who: '陈默', text: '你每次都想抱她一下，然后再离开。' },
        { who: '陈默', text: '可你每次都在这里醒来。' },
        { who: '陈默', text: '也许这一次，你可以试着……让她走。' },
        { who: '杂音', text: '（磁带转到了尽头，发出空转的声音）', noise: true }
      ]
    }
  };

  HStory.ENDINGS = {
    truth: {
      label: '结局 A · 真 相',
      title: '拂 晓',
      body: '你抱住了她。\n\n怀里的身体很轻，像一件叠好的旧衣服。她没有脸，可你知道她在笑。\n\n“哥。”她说，“天亮了。”\n\n白房的墙像水一样化开。你看见走廊尽头的窗，看见窗外一点一点亮起来的灰蓝色。\n\n你抬起手。手腕上是那条蓝色的住院带，印着 047。\n\n你把它摘下来，放在她坐过的椅子上。\n\n然后你第一次，在东翼之外的地方，说出了她的名字。\n\n林晚。\n\n——2023 年 3 月 13 日，仁和医院东翼的窗外，第一次亮起了天光。'
    },
    escape: {
      label: '结局 B · 逃 离',
      title: '后 视 镜',
      body: '你没有回头。\n\n你穿过走廊，推开白房的门，沿着楼梯一直往上跑。你跑出东翼，跑出医院，跑进凌晨的雾里。\n\n你发动车子。暖气开得很足。\n\n后视镜里，后座空空的。\n\n你松了一口气。\n\n然后你看见镜子里，她坐在后座，正安静地看着你。\n\n她的脸，和你一模一样。\n\n“哥。”她说，“你又要回去了吗？”\n\n——凌晨 2:37，你在 302 房醒来。\n\n病房里很暗。门被从外面锁住了。'
    },
    loop: {
      label: '结局 C · 循 环',
      title: '2 : 3 7',
      body: '你接受了治疗。\n\n白色的灯很暖。有人在你手背上扎了一针，你听见很轻的脚步声走远。\n\n“睡吧。”一个声音说，“睡醒了，就不怕了。”\n\n你闭上眼，想起自己好像还有一件很重要的事没做。\n\n是什么来着？\n\n——\n\n凌晨 2:37。\n\n你在 302 房醒来。\n\n病房里很暗，空气里有一点点消毒水的味道。\n\n门被从外面锁住了。\n\n窗外没有月亮。\n\n你听见走廊里，有人在喊你。'
    }
  };

  // 外部剧情文本（js/story_data.js）优先，便于集中修改剧情
  if (window.HSTORY_DATA) {
    var _D = window.HSTORY_DATA;
    if (_D.NOTES) HStory.NOTES = _D.NOTES;
    if (_D.FILES) HStory.FILES = _D.FILES;
    if (_D.TAPES) HStory.TAPES = _D.TAPES;
    if (_D.ENDINGS) HStory.ENDINGS = _D.ENDINGS;
  }

  /* ============================================================
     初始化
     ============================================================ */
  HStory.init = function (game) {
    G = game;
    this.chapterIdx = -1;
    this.chapter = null;
    this.timers = [];
    this.flags = {};
    this.lastObjective = '';
    this._buildChapters();
    return this;
  };

  HStory.getSave = function () {
    return {
      chapterIdx: this.chapterIdx,
      flags: JSON.parse(JSON.stringify(this.flags))
    };
  };

  HStory.applySave = function (save) {
    if (!save) return;
    this.flags = save.flags || {};
  };

  HStory._after = function (delay, fn) {
    this.timers.push({ t: delay, fn: fn });
  };

  // 「记忆碎片」：逐句播放的强制回忆演出（保证读得完）
  HStory.memory = function (lines, cb) {
    G.cinema(true);
    if (G.setMusic) G.setMusic('dread');
    var items = [{ text: '—— 记 忆 碎 片 ——', opts: { whisper: true } }];
    (lines || []).forEach(function (t) { items.push({ text: t, opts: { whisper: true } }); });
    G.tellLines(items, function () {
      G.cinema(false);
      if (cb) cb();
    });
  };

  HStory.update = function (dt) {
    // 计时器（使用快照，回调里可能重置 timers 数组）
    var list = (this.timers || []).slice();
    for (var i = 0; i < list.length; i++) {
      var tm = list[i];
      if (!tm) continue;
      tm.t -= dt;
      if (tm.t <= 0) {
        var idx = (this.timers || []).indexOf(tm);
        if (idx >= 0) this.timers.splice(idx, 1);
        try { tm.fn(); } catch (e) { console.error('[story timer]', e); if (window.HGame) window.HGame.errors.push('storyTimer: ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0,3).join(' / ')); }
      }
    }
    if (this.chapter && this.chapter.update && !this.flags.freeRoam) this.chapter.update(dt);
    this._updateLookScare(dt);
  };

  /* ============================================================
     交互总入口
     ============================================================ */
  HStory.interact = function (it) {
    if (!it) return false;
    var self = this;

    // 隐藏结局 / 楼层移动 / 解密交互
    if (it.kind === 'oldElevator') return this._oldElevator(it);
    if (it.kind === 'elevatorUp') return this._elevatorUp(it);
    if (it.kind === 'whiteExit') return this._whiteExit(it);
    if (it.kind === 'elevator4') return this._elevator4(it);
    if (it.kind === 'floorTravel') return this._floorTravel(it);
    if (it.kind === 'b1switch') return this._b1switch(it);
    if (it.kind === 'f4switch') return this._f4switch(it);

    // 当前章节优先
    if (this.chapter && this.chapter.interact) {
      if (this.chapter.interact(it) === true) return true;
    }

    switch (it.kind) {
      case 'note': {
        var note = HStory.NOTES[it.id] || { type: '文件', title: it.id, body: '（字迹已经模糊，无法辨认。）' };
        G.markNote(it.id);
        if (it.glint) {
          it.glint.visible = false;
          if (it.glint.parent) it.glint.parent.remove(it.glint);
          it.glint = null;
        }
        G.showNote(note, function () {
          if (self.chapter && self.chapter.onNoteClosed) self.chapter.onNoteClosed(it.id);
          if (it.id === 'note_hidden_letter') {
            setTimeout(function () { HStory._hiddenEnding(); }, 700);
          }
          if (it.id === 'note_first_run_envelope') {
            G.clearSubtitle();
            G.fadeTo(true, 2600, function () {
              G.showEnding('loop');
              setTimeout(function () { G.fadeTo(false, 2200); }, 300);
            });
          }
        });
        return true;
      }
      case 'file': {
        var f = HStory.FILES[it.id];
        if (!f) { G.toast('这份记录已经无法辨认。'); return true; }
        G.collectFile(it.id);
        G.showNote(f, function () { G.toast('已收入档案（Tab 查看）'); });
        return true;
      }
      case 'tape': {
        var t = HStory.TAPES[it.id];
        if (!t) return true;
        G.collectTape(it.id);
        G.showTape(t, function () {
          if (self.chapter && self.chapter.onTapeEnd) self.chapter.onTapeEnd(it.id);
        });
        return true;
      }
      case 'pickup': {
        return this._pickup(it);
      }
      case 'hide': {
        return false; // 交给主程序执行躲藏
      }
      case 'keypad': {
        this._openKeypad(it);
        return true;
      }
      case 'elevator': {
        this._elevator(it);
        return true;
      }
      default:
        return false;
    }
  };

  /* ---------------- 隐藏结局：跨楼层移动 / 旧货运梯 / 白房出口 ---------------- */
  HStory._travel = function (levelId, spawn, objective) {
    var self = this;
    this.flags.freeRoam = true;
    G.stopChase();
    G.despawnEntity();
    G.fadeTo(true, 700, function () {
      G.loadLevel(levelId, spawn, function () {
        G.restoreLevelState();
        G.state = 'playing';
        var hud = document.getElementById('hud');
        if (hud) hud.classList.remove('hidden');
        if (G.showLockHint) G.showLockHint();
        G.fadeTo(false, 900);
        if (objective) G.setObjective(objective);
        G.setAmbience(levelId === 'hidden' ? 'cold' : (levelId === 'basement' ? 'basement' : 'ward'));
        G.setMusic(levelId === 'hidden' ? 'abyss' : (levelId === 'white' ? 'white' : (levelId === 'basement' ? 'abyss' : 'explore')));
        G._suppressPause = false;
      });
    });
  };

  HStory._oldElevator = function (it) {
    var flags = this.flags;
    var boards = (G.level && G.level.story && G.level.story.oldBoards) || [];
    if (!flags.boardsPried) {
      if (!G.hasItem('crowbar')) {
        G.toast('木板被长钉钉死了。');
        G.subtitle('木板上有几道很深的旧撬痕。有人试过，但没成功。', 3.4, { whisper: true });
        G.subtitle('撬痕很新。像是有人最近还来过这里。', 3.2, { whisper: true });
        return true;
      }
      flags.boardsPried = true;
      boards.forEach(function (m) { if (m && m.parent) m.parent.remove(m); });
      if (window.HA && HA.ready) { try { HA.sfx('metal_impact', { volume: 0.8 }); HA.sfx('door_creak', { volume: 0.5 }); } catch (e) {} }
      G.shake(0.12, 0.6);
      G.toast('你撬开了封住旧货运梯的木板。');
      G.subtitle('木板后面是一扇老式货运电梯。读卡器还亮着一点微弱的红光。', 4.2);
      G.setObjective('用员工电梯卡启动旧货运梯。');
      return true;
    }
    if (!G.hasItem('elevatorCard')) {
      G.toast('读卡器认不出这张卡。');
      G.subtitle('需要一张员工电梯卡。', 3.0);
      return true;
    }
    G.subtitle('电梯发出一声很闷的响动，开始下降。', 3.2, { whisper: true });
    this._travel('hidden', { x: 0, z: 2.8, yaw: 0 }, '找三号柜。');
    return true;
  };

  HStory._elevatorUp = function (it) {
    if (G.level && G.level.id === 'hidden') {
      this._travel('ward', { x: 22.6, z: 0, yaw: -Math.PI / 2 }, this.flags.boardsPried ? '回到西侧旧货运梯。' : '回到三楼。');
      return true;
    }
    if (!this.flags.freeRoam) {
      var obj = this.flags.b1Card ? '坐电梯去 4F 研究区。' : '回到三楼。';
      this._gotoLevel('ward', { x: 22.6, z: 0, yaw: -Math.PI / 2 }, obj);
      return true;
    }
    this._travel('ward', { x: 22.6, z: 0, yaw: -Math.PI / 2 },
      this.flags.boardsPried ? '回到西侧旧货运梯。' : (G.hasItem('crowbar') ? '回到三楼西侧，用撬棍撬开旧货运梯的木板。' : '回到三楼。'));
    return true;
  };

  HStory._gotoLevel = function (levelId, spawn, objective, cb) {
    G.stopChase();
    G.despawnEntity();
    G.fadeTo(true, 650, function () {
      G.loadLevel(levelId, spawn, function () {
        G.restoreLevelState();
        G.state = 'playing';
        var hud = document.getElementById('hud');
        if (hud) hud.classList.remove('hidden');
        if (G.showLockHint) G.showLockHint();
        G.fadeTo(false, 850);
        if (objective) G.setObjective(objective);
        G.setAmbience(levelId === 'basement' ? 'basement' : 'ward');
        G.setMusic(levelId === 'basement' ? 'abyss' : 'explore');
        G._suppressPause = false;
        if (cb) cb();
      });
    });
  };

  HStory._floorTravel = function (it) {
    var target = it.data && it.data.target;
    if (target === 'floor2') {
      if (!G.hasItem('elevatorCard')) { G.toast('电梯需要电梯卡。'); return true; }
      var obj2 = this.flags.floor2Done ? '乘电梯回三楼，再前往地下一层。' : '在二楼旧血液科找到 206 病房。';
      G.subtitle('电梯面板上，2F 的按钮亮了一下。', 2.6, { whisper: true });
      this._gotoLevel('floor2', { x: 8.6, z: 0, yaw: Math.PI / 2 }, obj2);
      return true;
    }
    if (target === 'floor4') {
      if (!(this.flags.b1Card || this.flags.researchDone)) {
        G.toast('4F 的按钮是暗的。');
        G.subtitle('读卡器不认这张卡。', 2.6, { whisper: true });
        return true;
      }
      var obj4 = this.flags.researchDone ? '回到地下一层，打开白房的门。' : '在 MIRROR-03 控制台按顺序操作。';
      G.subtitle('4F 的按钮亮了。读卡器认出这张权限卡。', 2.8, { whisper: true });
      this._gotoLevel('floor4', { x: 7.6, z: 0, yaw: Math.PI / 2 }, obj4);
      return true;
    }
    if (target === 'ward') {
      var objW = this.flags.researchDone ? '回到地下一层，打开白房的门。'
        : (this.flags.floor2Done ? '乘电梯前往地下一层。' : '回到三楼。');
      this._gotoLevel('ward', { x: 22.6, z: 0, yaw: -Math.PI / 2 }, objW);
      return true;
    }
    if (target === 'basement') {
      this._gotoLevel('basement', { x: 31.5, z: 0, yaw: -Math.PI / 2 }, '用白房权限卡打开白房的门。');
      return true;
    }
    return true;
  };

  HStory._b1switch = function (it) {
    if (this.flags.b1PowerOn) { G.toast('备用电源已经恢复了。'); return true; }
    var order = [1, 0, 2];        // 中 → 左 → 右
    var idx = it.data.index;
    var prog = this.flags.b1Progress || 0;
    if (idx === order[prog]) {
      this.flags.b1Progress = prog + 1;
      if (it.data.lever) it.data.lever.rotation.x = 0.5;
      if (window.HA && HA.ready) { try { HA.sfx('switch_click'); } catch (e) {} }
      G.shake(0.006, 0.15);
      if (this.flags.b1Progress >= 3) {
        this._b1PowerOn();
      } else {
        G.toast('合闸 ' + this.flags.b1Progress + ' / 3');
      }
    } else {
      this.flags.b1Progress = 0;
      G.toast('顺序错了，配电箱里跳出火花。');
      G.shake(0.05, 0.5);
      G.level.flicker('all', 1.2, { threshold: 0.5 });
    }
    return true;
  };

  HStory._b1PowerOn = function () {
    this.flags.b1PowerOn = true;
    this.flags.b1Progress = 3;
    G.level.setCircuit('main', true);
    G.level.setCircuit('morgue', true);
    G.level.setCircuit('cold', true);
    G.level.unlockDoor('doorMorgue');
    G.level.unlockDoor('doorCold');
    G.setObjective('进入太平间，找到白房权限卡。');
    G.toast('备用电源恢复了。');
    G.subtitle('灯一盏一盏亮了起来。太平间的电子锁松开了。', 4.0);
    if (window.HA && HA.ready) { try { HA.sfx('fuse_switch'); } catch (e) {} }
    G.saveCheckpoint();
  };

  HStory._f4switch = function (it) {
    if (this.flags.researchDone) { G.toast('控制台已经停止运行。'); return true; }
    var order = [1, 2, 0];        // 投射 → 删除 → 记录
    var idx = it.data.index;
    var prog = this.flags.f4Progress || 0;
    if (idx === order[prog]) {
      this.flags.f4Progress = prog + 1;
      if (window.HA && HA.ready) { try { HA.sfx('switch_click', { volume: 0.7 }); } catch (e) {} }
      G.shake(0.008, 0.2);
      if (this.flags.f4Progress >= 3) {
        this.flags.researchDone = true;
        G.toast('MIRROR-03 主机的灯灭了。');
        G.subtitle('屏幕最后闪了一下，只剩一行字：\n“受试者 047 · 循环终止”。', 4.6, { whisper: true });
        G.setObjective('回到地下一层，打开白房的门。');
        G.saveCheckpoint();
      } else {
        G.toast('按钮亮了一下：' + this.flags.f4Progress + ' / 3');
      }
    } else {
      this.flags.f4Progress = 0;
      G.toast('控制台报错，灯闪了一下。');
      G.level.flicker('all', 1.0);
    }
    return true;
  };

  HStory._whiteExit = function (it) {
    var obj = this.flags.boardsPried ? '回到西侧旧货运梯，下去。'
      : (G.hasItem('crowbar') ? '回到三楼西侧，用撬棍撬开旧货运梯的木板。' : '回到三楼。');
    this._travel('basement', { x: 0.8, z: 0, yaw: -Math.PI / 2 }, obj);
    return true;
  };

  HStory._hiddenEnding = function () {
    this.flags.hiddenFound = true;
    G.stopChase();
    G.fadeTo(true, 1200, function () {
      G.showEnding('hidden');
      // 结局界面出现后再把黑幕淡掉，避免"隐藏结局一片黑"
      setTimeout(function () { G.fadeTo(false, 1400); }, 120);
    });
  };

  HStory.interactDoor = function (door) {
    if (!door) return false;
    if (window.HGame && HGame.run === 1) {
      if (door.id === 'door302') {
        door.unlock(); door.setOpen(true);
        return true;
      }
      if (door.id === 'doorFire1' || door.id === 'doorFire2') {
        door.unlock(); door.setOpen(true);
        return true;
      }
      if (door.id === 'doorWhite') {
        door.unlock(); door.setOpen(true);
        G.fadeTo(true, 900, function () {
          G.loadLevel('white', { x: 0, z: 5.3, yaw: 0 }, function () {
            G.state = 'playing';
            G.fadeTo(false, 1600);
            if (document.getElementById('objective')) document.getElementById('objective').classList.add('hidden');
            G.clearSubtitle();
          });
        });
        return true;
      }
      G.toast('门锁着。');
      return true;
    }
    if (door.id === 'doorPharmacy') {
      if (door.locked) {
        this._openKeypad({ data: { doorId: 'doorPharmacy', code: '0312' } });
        return true;
      }
      return false;
    }
    if (door.id === 'doorWhite') {
      if (!G.hasItem('whiteCard')) {
        G.toast('门禁红灯 · 需要白房权限卡');
        return true;
      }
      door.unlock();
      door.setOpen(true);
      G.stopChase();
      G.setFlag('reachedWhite', true);
      var self = this;
      if (this.flags.visitedWhite) {
        this._travel('white', { x: 0, z: 5.3, yaw: 0 }, '走近她，按 E 看看她。');
        return true;
      }
      this.flags.visitedWhite = true;
      G.fadeTo(true, 900, function () {
        G.loadLevel('white', { x: 0, z: 5.3, yaw: 0 }, function () {
          G.fadeTo(false, 1000);
          self.startChapter(5);
        });
      });
      return true;
    }
    return false;
  };

  HStory.onDoorToggle = function (door) {
    if (!door) return;
    // 追逐中关门：门后贴脸
    if (this.chapterIdx === 4 && G.isChasing() && !door.open) {
      var ed = G.entityDistance();
      if (ed < 6 && !this.flags['doorScare_' + door.id]) {
        this.flags['doorScare_' + door.id] = true;
        G.addSanity(-0.06);
        G.subtitle('门后有什么东西狠狠撞了上来。', 2.2);
        G.after(1.4, function () {
          if (G.isChasing()) G.entityOpenDoorSoon();
        });
      }
    }
  };

  HStory.onTrigger = function (id) {
    if (this.chapter && this.chapter.onTrigger) this.chapter.onTrigger(id);
  };

  HStory.onCatch = function () {
    if (this.flags.safe) return;
    G.killPlayer();
  };

  /* ---------------- 拾取物 ---------------- */
  HStory._pickup = function (it) {
    var id = it.data.itemId || it.id;
    var name = it.data.name || '物品';
    var key = it.data.pickupKind;

    if (key === 'flashlight') {
      G.player.giveFlashlight();
      G.giveItem('flashlight', '手电筒');
      G.toast('获得：手电筒 · 按 F 开关');
      G.setFlag('hasFlashlight', true);
      G.after(0.4, function () { G.subtitle('手电还有电。光束在黑暗里抖得厉害。', 3); });
      G.setObjective('读一读地上的纸条。');
    } else if (id === 'fuse') {
      G.giveItem('fuse', '保险丝');
      G.toast('获得：保险丝');
      G.setObjective('把保险丝安装到走廊南侧「配电室」的配电箱里。');
    } else if (id === 'elevatorCard') {
      G.giveItem('elevatorCard', '电梯卡');
      G.toast('获得：电梯卡');
    } else if (id === 'researchCard') {
      G.giveItem('researchCard', '研究区门禁卡');
      G.toast('获得：研究区门禁卡');
      this.flags.floor2Done = true;
      G.saveCheckpoint();
      G.setObjective('乘电梯回三楼，再前往地下一层。');
      G.after(0.8, function () { G.subtitle('研究区的电梯按钮亮了。', 2.8, { whisper: true }); });
    } else if (id === 'whiteCard') {
      G.giveItem('whiteCard', '白房权限卡');
      G.toast('获得：白房权限卡');
      this.flags.b1Card = true;
      this.flags.hasWhiteCard = true;
      this.flags.chaseStarted = false;
      G.stopChase();
      G.saveCheckpoint();
      G.setObjective('坐电梯回三楼，前往四楼研究区。');
    } else if (key === 'battery') {
      G.player.addBattery(0.55);
      G.toast('手电电量 +55%');
    } else {
      G.giveItem(id, name);
      G.toast('获得：' + name);
    }
    if (it.glint) it.glint.visible = false;
    it.enabled = false;
    G.removeInteractable(it.id);
    if (this.chapter && this.chapter.onPickup) this.chapter.onPickup(it, id, key);
    return true;
  };

  /* ---------------- 密码键盘 ---------------- */
  HStory._openKeypad = function (it) {
    var d = it.data || {};
    var doorId = d.doorId || 'doorPharmacy';
    var code = d.code || '0312';
    G.openKeypad({
      title: d.title || '电子门锁 · 东翼药房',
      hint: d.hint || '（便签上的数字在脑子里闪了一下）',
      code: code,
      onSuccess: function () {
        G.level.unlockDoor(doorId);
        G.level.setDoor(doorId, true);
        if (doorId === 'doorPharmacy') {
          G.setFlag('pharmacyOpen', true);
          G.toast('门锁发出轻轻的一声“嘀”。');
          G.subtitle('药房的门开了。', 2);
          G.setObjective('进入药房，寻找电梯卡。');
        } else {
          G.toast(d.successToast || '门锁发出轻轻的一声“嘀”。');
          if (d.subtitle) G.subtitle(d.subtitle, 2.8);
          if (d.objective) G.setObjective(d.objective);
        }
        if (d.flag) G.setFlag(d.flag, true);
      },
      onFail: function (tries) {
        if (tries >= 3) G.subtitle('……再输错，可能就会惊动什么。', 2.6);
      }
    });
  };

  /* ---------------- 电梯 ---------------- */
  HStory._elevator = function (it) {
    if (it.data && it.data.broken) {
      G.toast('电梯没有反应。按钮全灭了。');
      return;
    }
    if (window.HGame && HGame.run === 1) {
      G.fadeTo(true, 800, function () {
        G.loadLevel('basement', { x: 0.8, z: 0, yaw: -Math.PI / 2 }, function () {
          G.state = 'playing';
          G.fadeTo(false, 1000);
          if (document.getElementById('objective')) document.getElementById('objective').classList.add('hidden');
          G.clearSubtitle();
        });
      });
      return;
    }
    if (this.chapterIdx < 3 && !this.flags.freeRoam) {
      G.toast('楼层按钮没有反应。');
      G.subtitle('电梯停在这一层。楼层按钮是暗的。', 2.8, { whisper: true });
      return;
    }
    if (!G.hasItem('elevatorCard')) {
      G.toast('电梯需要电梯卡。');
      G.subtitle('电梯门旁边的读卡器亮着一点微弱的红光。', 2.5);
      return;
    }
    var floor2ok = !!this.flags.floor2Done || !!this.flags.freeRoam;
    var floor4ok = !!(this.flags.b1Card || this.flags.researchDone);
    var b1ok = this.flags.freeRoam || this.chapterIdx >= 4 || floor2ok;
    var self = this;
    G._floorPick = function (id) { self._floorPick(id); };
    G.openFloorMenu({
      subtitle: '3F 东翼 · 电梯',
      options: [
        { id: 'basement', label: 'B1 · 地下一层', enabled: b1ok, hint: b1ok ? '太平间 · 遗体暂存' : '需要先确认 2F 的情况' },
        { id: 'floor2', label: '2F · 旧血液科病区', enabled: true, hint: '206 病房 · 旧病区' },
        { id: 'floor4', label: '4F · MIRROR-03 研究区', enabled: floor4ok, hint: floor4ok ? '研究区 · 沈明远办公室' : '权限不足' }
      ]
    });
  };

  HStory._floorPick = function (id) {
    if (id === 'basement') {
      if (this.flags.freeRoam) return this._travel('basement', { x: 0.8, z: 0, yaw: -Math.PI / 2 }, '回到地下一层。');
      return this._rideToBasement();
    }
    if (id === 'floor2' || id === 'floor4') return this._floorTravel({ data: { target: id } });
    return false;
  };

  HStory._elevator4 = function (it) {
    var self = this;
    G._floorPick = function (id) {
      if (id === 'ward') self._floorTravel({ data: { target: 'ward' } });
      else if (id === 'basement') self._floorTravel({ data: { target: 'basement' } });
    };
    G.openFloorMenu({
      subtitle: '4F 研究区 · 电梯',
      options: [
        { id: 'ward', label: '3F · 东翼', enabled: true, hint: '回去的路' },
        { id: 'basement', label: 'B1 · 地下一层', enabled: true, hint: '太平间 · 白房' }
      ]
    });
    return true;
  };

  HStory._rideToBasement = function () {
    if (this.chapterIdx === 3 && !this.flags.floor2Done) {
      G.toast('电梯停在 3F。');
      G.subtitle('先去二楼血液科病区看看。', 3.2, { whisper: true });
      return;
    }
    G.lockPlayer(true);
    G.cinema(true);
    G.setMusic('dread');
    var elev = G.level.story.elevator;
    if (elev && elev.userData.leaves) {
      var leaves = elev.userData.leaves;
      G.after(0.9, function () {
        leaves.forEach(function (l, i) { l.position.x += (i === 0 ? -0.8 : 0.8); });
        if (window.HA && HA.ready) { try { HA.sfx('elevator_open'); } catch (e) {} }
      });
      G.after(4.6, function () { leaves.forEach(function (l, i) { l.position.x -= (i === 0 ? -0.8 : 0.8); }); });
    }
    G.after(0.6, function () { G.subtitle('读卡器发出一声短促的鸣响。', 2); });
    G.after(2.4, function () {
      G.subtitle('电梯里有一股铁锈和消毒水混在一起的味道。', 3);
    });
    G.after(5.2, function () {
      G.fadeTo(true, 1200, function () {
        G.loadLevel('basement', { x: 0.8, z: 0, yaw: -Math.PI / 2 }, function () {
          G.fadeTo(false, 1400);
          HStory.startChapter(4);
        });
      });
    });
  };

  /* ============================================================
     章节
     ============================================================ */
  HStory._buildChapters = function () {
    var self = this;

    /* ---------------- 序章：302 ---------------- */
    var prologue = {
      id: 'prologue', num: '序章', name: '三 零 二',
      enter: function (restore) {
        if (restore) {
          G.setObjective(self.flags.noted ? '离开 302 病房。' : '在床头柜上找到手电筒，再看看地上的纸条。');
          if (self.flags.noted) G.level.unlockDoor('door302');
          return;
        }
        G.setObjective('在床头柜上找到手电筒，再看看地上的纸条。');
        G.setAmbience('room');
        G.setMusic('explore');
        G.after(1.2, function () { G.subtitle('凌晨 2:37。', 2.4, { whisper: true }); });
        G.after(3.8, function () { G.subtitle('仁和医院，东翼三楼。你翻过封锁的消防门，来找林晚。', 4.2); });
        G.after(8.4, function () { G.subtitle('病房里很暗。空气里有一点点消毒水的味道。', 3.4); });
        G.after(12.4, function () { G.subtitle('……门被从外面锁上了。', 2.8); });
        G.after(15.8, function () { G.subtitle('先找找房间里有什么能用的东西。', 3.2, { whisper: true }); });
      },
      update: function (dt) {
        if (self.flags.left302) return;
        if (G.player.pos.z < 1.35 && G.player.pos.x > -19.6) {
          self.flags.left302 = true;
          G.after(1.4, function () { self.startChapter(1); });
        }
      },
      onNoteClosed: function (id) {
        if (id === 'note302' && !self.flags.noted) {
          self.flags.noted = true;
          if (window.HA && HA.ready) { try { HA.sfx('door_locked', { volume: 0.7 }); HA.sfx('woman_whisper', { volume: 0.35 }); } catch (e) {} }
          if (G.hasItem('flashlight')) {
            G.level.unlockDoor('door302');
            G.after(0.7, function () {
              G.subtitle('咔哒。门锁自己弹开了。', 2.6);
              G.setObjective('离开 302 病房。');
            });
          } else {
            G.setObjective('先拿走床头柜上的手电筒。');
            G.after(0.6, function () { G.subtitle('走廊里黑得伸手不见五指。得先找到能照明的东西。', 3.2); });
          }
          G.after(3.2, function () { G.subtitle('走廊的方向，传来很轻的、像是有人在原地转圈的声音。', 3.4, { whisper: true }); });
          G.addSanity(-0.04);
        }
      },
      onPickup: function (it, id, key) {
        if (key === 'flashlight' && self.flags.noted && !self.flags.doorOpened) {
          self.flags.doorOpened = true;
          G.level.unlockDoor('door302');
          G.after(0.6, function () {
            G.subtitle('咔哒。门锁自己弹开了。', 2.6);
            G.setObjective('离开 302 病房。');
          });
        }
      }
    };

    /* ---------------- 第一章：静默长廊 ---------------- */
    var ch1 = {
      id: 'ch1', num: '第一章', name: '静 默 长 廊',
      fuseInstalled: false,
      progress: 0,
      order: [2, 1, 0],
      enter: function (restore) {
        if (restore) {
          G.setObjective(self.flags.powerOn ? '前往护士站。' : (G.hasItem('fuse') ? '前往配电室，恢复供电。' : '在 301 处置室找到备用保险丝。'));
          return;
        }
        G.setAmbience('corridor');
        G.setMusic('explore');
        G.chapterCard('第一章', '静 默 长 廊', function () {
          G.setObjective('在 301 处置室（走廊北侧）找到备用保险丝。');
          G.subtitle('应急灯的红光把走廊染成暗褐色。', 3.2);
          G.after(4.0, function () { G.subtitle('配电室在走廊的另一头。得先有电。', 3.2, { whisper: true }); });
        });
      },
      update: function (dt) {
        // 进入 301 / 配电室时给一次明确提示
        if (!self.flags.hint301 && G.player.pos.x > -18.7 && G.player.pos.x < -13.3 && G.player.pos.z < -1.6) {
          self.flags.hint301 = true;
          G.subtitle('柜子顶上有一根备用的保险丝。', 3.4, { whisper: true });
        }
        if (!self.flags.hintUtility && G.player.pos.x > -13.4 && G.player.pos.x < -9.2 && G.player.pos.z > 1.6) {
          self.flags.hintUtility = true;
          if (self.flags.fuseInstalled || G.hasItem('fuse')) {
            G.subtitle('配电箱就在右侧墙上：按 E 装保险丝，然后按 西 → 中 → 东 的顺序拉闸。', 4.6);
          } else {
            G.subtitle('配电箱在右侧墙上。可你还缺一根保险丝——去 301 处置室的柜顶找。', 4.6);
          }
        }
        // 供电后的走廊惊吓
        if (self.flags.powerOn && !self.flags.powerScare && !self.flags.powerScareRunning) {
          if (G.player.pos.z < 1.35 && G.player.pos.x > -13.5) {
            self.flags.powerScareRunning = true;
            this._scareAfterPower();
          }
        }
        // 前往护士站
        if (self.flags.powerScare && !self.flags.toNurse) {
          if (G.player.pos.z > 1.7 && G.player.pos.x > 9.0 && G.player.pos.x < 18.0) {
            self.flags.toNurse = true;
            self.startChapter(2);
          }
        }
      },
      interact: function (it) {
        if (it.kind !== 'switch') return false;
        if (self.flags.powerOn) { G.toast('配电箱已经恢复正常了。'); return true; }
        if (!self.flags.fuseInstalled) {
          if (!G.hasItem('fuse')) { G.toast('配电箱里缺一根保险丝。'); G.subtitle('柜门里空着一个保险丝座。', 2.8, { whisper: true }); return true; }
          self.flags.fuseInstalled = true;
          G.items.fuse = false;
          G.toast('你把保险丝装了进去。');
          if (window.HA && HA.ready) { try { HA.sfx('switch_click'); HA.sfx('fuse_switch'); } catch (e) {} }
          G.subtitle('配电箱里传来一声轻响。现在得按顺序合闸。', 3);
          G.setObjective('按顺序拉下电闸（提示在处置室的便签上）。');
          return true;
        }
        var idx = it.data.index;
        var expect = this.order[this.progress];
        if (idx === expect) {
          this.progress++;
          if (it.data.lever) it.data.lever.position.x -= 0.035;
          if (window.HA && HA.ready) { try { HA.sfx('switch_click'); } catch (e) {} }
          G.shake(0.008, 0.18);
          if (this.progress >= this.order.length) {
            this._powerOn();
          } else {
            G.subtitle('咔。', 1.2, { whisper: true });
          }
        } else {
          this.progress = 0;
          if (window.HA && HA.ready) { try { HA.sfx('bulb_buzz', { volume: 0.8 }); HA.sfx('scare_hit', { volume: 0.5 }); } catch (e) {} }
          G.shake(0.06, 0.5);
          G.addSanity(-0.08);
          G.toast('顺序错了，配电箱里冒出一阵火花。');
          G.level.flicker('corridor', 1.5, { threshold: 0.6 });
        }
        return true;
      },
      _powerOn: function () {
        self.flags.powerOn = true;
        G.level.setCircuit('corridor', true);
        G.level.setCircuit('ward', true);
        G.level.setCircuit('hall', true);
        G.level.setCircuit('nurse', true);
        G.setObjective('回到走廊，前往护士站。');
        G.setMusic('dread');
        if (window.HA && HA.ready) { try { HA.sfx('fuse_switch'); HA.stinger('soft'); } catch (e) {} }
        G.after(0.3, function () { G.subtitle('灯一盏一盏亮了起来。', 3.2); });
        G.after(2.4, function () { G.subtitle('可走廊尽头的那盏灯，是灭的。', 3.2, { whisper: true }); });
        G.after(5.0, function () {
          if (!self.flags.powerScare) {
            self.flags.powerScareRunning = false;
            G.setObjective('前往护士站。');
          }
        });
      },
      _scareAfterPower: function () {
        var sleep = function (d, f) { G.after(d, f); };
        G.setObjective('前往护士站。');
        G.setMusic('dread');
        G.level.flicker('corridor', 4.0, { threshold: 0.5 });
        if (window.HA && HA.ready) { try { HA.stinger('riser'); } catch (e) {} }
        G.after(1.0, function () {
          G.subtitle('走廊尽头，站着一个人。', 2.4, { whisper: true });
          G.spawnEntityScript({ x: 8.5, z: 0, duration: 4.0, facePlayer: true });
        });
        G.after(2.2, function () {
          G.level.setCircuit('corridor', false);
          G.level.setCircuit('ward', false);
          G.shake(0.05, 0.6);
          G.addSanity(-0.10);
          if (window.HA && HA.ready) { try { HA.stinger('boom'); } catch (e) {} }
        });
        G.after(3.0, function () {
          G.level.setCircuit('corridor', true);
          G.setEntityPosition(1.6, 0);
          G.playJumpScare('grab', { duration: 0.7 });
          G.shake(0.1, 0.9);
          G.addSanity(-0.16);
        });
        G.after(4.2, function () {
          G.despawnEntity();
          G.subtitle('……刚才那里，明明没有人。', 3.0, { whisper: true });
          self.flags.powerScare = true;
        });
        G.after(7.2, function () {
          HStory.memory([
            '2012 年 3 月 12 日，凌晨 2:37。',
            '东翼起火。你冲进走廊。',
            '306 房里有人在喊你。你没来得及。'
          ]);
        });
      }
    };
    // 把序章里对门/纸条之外的行为接管过来
    prologue.interact = function (it) {
      if (it.kind === 'door' && it.doorId === 'door302') {
        if (!self.flags.noted) {
          G.toast('门被从外面锁住了。');
          G.subtitle('门把手转不动。像是有人在外面按着。', 2.6);
          return true;
        }
        if (!G.hasItem('flashlight')) {
          G.toast('走廊里太黑了，先找到手电筒。');
          G.subtitle('门锁已经弹开了。可你不敢在完全的黑暗里走出去。', 3.0);
          return true;
        }
      }
      return false;
    };

    /* ---------------- 第二章：值班的人 ---------------- */
    var ch2 = {
      id: 'ch2', num: '第二章', name: '值 班 的 人',
      enter: function (restore) {
        if (restore) {
          G.setObjective(self.flags.knowCode ? '前往药房，输入密码 0312。' : '找到药房门禁的密码。');
          return;
        }
        G.setAmbience('nurse');
        G.setMusic('explore');
        G.chapterCard('第二章', '值 班 的 人', function () {
          G.setObjective('播放护士站的录音，找到药房密码。');
          G.subtitle('台灯还亮着。值班的人却不在。', 3.2);
          G.after(4.0, function () { G.subtitle('东翼在 2012 年火灾后就已经封闭了。可你每年都会回来。', 3.8, { whisper: true }); });
          G.after(8.2, function () { G.subtitle('桌上有一台录音机。', 2.6, { whisper: true }); });
        });
      },
      update: function (dt) {
        // 药房门打开并进入药房 → 第三章
        if (self.flags.pharmacyOpen && !self.flags.toPharmacy) {
          if (G.player.pos.x > 13.8 && G.player.pos.x < 18.8 && G.player.pos.z < -1.6) {
            self.flags.toPharmacy = true;
            self.startChapter(3);
          }
        }
      },
      onTapeEnd: function (id) {
        if (id !== 'tape_nurse') return;
        self.flags.heardTape1 = true;
        self.flags.knowCode = true;
        G.toast('药房密码：0312');
        G.setObjective('到走廊北侧「药房」门口，按 E 打开键盘输入 0312。');
        G.after(0.6, function () { G.subtitle('护士说密码是 0312——就是火灾那天。', 3.2); });
        if (!self.flags.lockerScare) {
          self.flags.lockerScare = true;
          G.after(1.4, function () {
            var locker = G.level.lockers['locker_nurse'];
            if (locker && locker.locker && locker.locker.leafPivot) {
              locker.locker.leafPivot.rotation.y = -1.8;
              G.after(1.6, function () { if (locker.locker.leafPivot) locker.locker.leafPivot.rotation.y = 0; });
            }
            G.shake(0.09, 0.8);
            G.addSanity(-0.12);
            G.subtitle('身后的储物柜猛地弹开了。', 2.8);
            G.after(2.6, function () {
              var l2 = G.level.lockers['locker_nurse'];
              if (l2 && l2.locker && l2.locker.leafPivot) l2.locker.leafPivot.rotation.y = 0;
            });
          });
        }
      },
      onNoteClosed: function (id) {
        if (id === 'note_nurse_code') {
          self.flags.knowCode = true;
          G.toast('药房密码已记录：0312');
          G.setObjective('到走廊北侧「药房」门口，按 E 打开键盘输入 0312。');
        }
      }
    };

    /* ---------------- 第三章：药房 & 镜廊 ---------------- */
    var ch3 = {
      id: 'ch3', num: '第三章', name: '药 房 与 镜 廊',
      enter: function (restore) {
        if (restore) {
          G.setObjective(G.hasItem('elevatorCard') ? '乘电梯前往地下一层。' : '找到电梯卡。');
          return;
        }
        G.setAmbience('ward');
        G.setMusic('explore');
        G.chapterCard('第三章', '药 房 与 镜 廊', function () {
          G.setObjective('找到电梯卡，乘电梯下到地下一层。');
          G.subtitle('药房里全是空药盒。有一座冷柜还在嗡嗡作响。', 3.4);
          G.after(4.2, function () {
            HStory.memory([
              '你想起她的手：她攥着你送的红绳。',
              '你答应过她，等病好了就带她回家。',
              '火起的时候，你离 306 只隔一条走廊。'
            ]);
          });
        });
      },
      update: function (dt) {
        // 拿到电梯卡后，离开药房 → 镜廊惊吓
        if (self.flags.hasCard && !self.flags.mirrorScare && !self.flags.mirrorScareRunning && !G.isPaused()) {
          var p = G.player.pos;
          if (p.x > 18.3 && Math.abs(p.z) < 3.3) {
            self.flags.mirrorScareRunning = true;
            this._mirrorScare();
          }
        }
      },
      _mirrorScare: function () {
        var done = false;
        G.setMusic('dread');
        G.setObjective('乘电梯前往地下一层。');
        G.subtitle('镜子里的你，好像慢了半拍。', 3.0, { whisper: true });
        var checkLook = function () {
          if (done) return;
          var mirrors = G.level.story.mirrorPos || [];
          for (var i = 0; i < mirrors.length; i++) {
            if (G.isLookingAt(mirrors[i].x, 1.55, mirrors[i].z, 30)) {
              done = true;
              self.flags.mirrorScare = true;
              // 这里不再突脸，只保留屏幕震动与灯闪
              G.shake(0.22, 1.4);
              G.level.flicker('all', 1.8, { threshold: 0.35 });
              G.addSanity(-0.22);
              G.after(1.0, function () {
                var cracks = G.level.story.mirrorCracks || [];
                cracks.forEach(function (c) { c.visible = true; });
                G.subtitle('镜面裂开了。裂缝后面，什么也没有。', 3.4);
                G.level.flicker('all', 2.0);
              });
              return true;
            }
          }
          return false;
        };
        G.after(1.4, function () {
          if (!checkLook()) {
            G.after(0.6, function () {
              if (!checkLook()) {
                G.after(0.8, function () { checkLook(); });
              }
            });
          }
        });
      }
    };
    // 药房里拿电梯卡的交互（拾取后触发惊吓）
    ch3.onPickup = function (it, id, key) {
      if (id === 'elevatorCard') {
        self.flags.hasCard = true;
        G.after(0.8, function () {
          G.level.flicker('pharmacy', 2.5, { threshold: 0.55 });
          G.shake(0.06, 0.7);
          G.addSanity(-0.06);
          G.after(1.2, function () {
            G.subtitle('走廊的灯闪了一下。电梯卡上的磁条还在发热。', 3.4, { whisper: true });
          });
          G.after(3.2, function () {
            G.setObjective('乘电梯去二楼血液科旧病区。');
          });
        });
      }
    };

    /* ---------------- 第四章：地下一层 ---------------- */
    var ch4 = {
      id: 'ch4', num: '第四章', name: '地 下 一 层',
      enter: function (restore) {
        G.setAmbience('basement');
        G.setMusic('abyss');
        G.cinema(false);
        G.lockPlayer(false);
        if (self.flags.b1PowerOn && G.level) {
          G.level.setCircuit('main', true);
          G.level.setCircuit('morgue', true);
          G.level.setCircuit('cold', true);
          G.level.unlockDoor('doorMorgue');
          G.level.unlockDoor('doorCold');
        }
        if (restore || self.flags.b1Visited) {
          G.setObjective(self.flags.researchDone ? '用权限卡打开白房的门。'
            : (self.flags.b1Card ? '坐电梯去四楼研究区。' : '恢复 B1 备用电源，打开太平间。'));
          return;
        }
        self.flags.b1Visited = true;
        G.chapterCard('第四章', '地 下 一 层', function () {
          G.setObjective('恢复 B1 备用电源，打开太平间。');
          G.subtitle('电梯在下降。数字停在 B1，没有再动。', 3.2);
          G.after(3.4, function () { G.subtitle('走廊尽头只有一盏应急灯亮着。太平间的门锁着。', 3.4); });
          G.after(6.6, function () { G.subtitle('这里比楼上冷得多。', 3.0, { whisper: true }); });
        });
      },
      update: function (dt) {
        if (!G.level || G.level.id !== 'basement') return;
        // 冷藏室：只保留环境暗示，不做 jump scare
        if (!self.flags.coldScare && !self.flags.inColdScare) {
          if (G.player.pos.x > 16.2 && G.player.pos.x < 21 && G.player.pos.z > 1.7) {
            self.flags.inColdScare = true;
            self.flags.coldScare = true;
            G.after(1.4, function () {
              G.subtitle('冷柜深处，有什么东西轻轻响了一声。', 3.2, { whisper: true });
            });
          }
        }
        if (self.flags.researchDone && !self.flags.whiteDoorHint) {
          self.flags.whiteDoorHint = true;
          G.setObjective('用权限卡打开白房的门。');
        } else if (self.flags.b1Card && !self.flags.researchDone && !self.flags.f4Hint) {
          self.flags.f4Hint = true;
          G.setObjective('坐电梯去四楼研究区。');
        }
      },
      onPickup: function (it, id, key) {
        if (id === 'whiteCard') {
          self.flags.hasWhiteCard = true;
          self.flags.b1Card = true;
          self.flags.chaseStarted = false;
          G.stopChase();
          G.setObjective('坐电梯回三楼，前往四楼研究区。');
          G.saveCheckpoint();
          G.after(0.9, function () {
            G.subtitle('卡背面写着一个名字：沈明远。', 3.0);
            G.after(2.6, function () {
              G.subtitle('走廊尽头，电梯厅的灯忽然亮了。', 3.0, { whisper: true });
              G.setObjective('坐电梯回三楼，前往四楼研究区。');
            });
          });
        }
      }
    };

    /* ---------------- 第五章：白房 ---------------- */
    var ch5 = {
      id: 'ch5', num: '第五章', name: '白 房',
      enter: function (restore) {
        G.setAmbience('white');
        G.setMusic('white');
        G.cinema(false);
        G.lockPlayer(false);
        G.player.setFlashlight(false);
        G.player.danger = 0;
        if (restore) {
          G.setObjective('走近她。');
          return;
        }
        self.flags.ch5Ready = false;
        G.clearSubtitle();
        G.chapterCard('第五章', '白 房', function () {
          G.setObjective('走近她，按 E 看看她。');
          G.subtitle('白房里很亮。亮得让人眼睛发酸。', 3.2);
          G.after(3.6, function () { G.subtitle('她坐在那里，背对着你。', 2.8); });
          G.after(6.6, function () { G.subtitle('你走了十一年，才走到这里。', 3.4, { whisper: true }); });
          // 让玩家先能走动、看房间；真正触发剧情时会等开场白读完
          G.after(6.0, function () { self.flags.ch5Ready = true; });
        });
      },
      interact: function (it) {
        if (!it || it.id !== 'sister_white') return false;
        if (self.flags.sisterTurn) return true;
        self.flags.sisterTurn = true;
        G.clearSubtitle();
        if (window.HA && HA.ready) { try { HA.sfx('heartbeat_once', { volume: 0.6 }); } catch (e) {} }
        this._cutscene();
        return true;
      },
      update: function (dt) {},
      _cutscene: function () {
        var sister = G.level.story.sister;
        G.lockPlayer(true);
        G.cinema(true);
        G.setMusic('white');
        // 只让模型慢慢转身，不做突脸
        G.tellLines([
          { text: '……妹妹？', opts: { speaker: '陈默' } },
          { text: '你终于来了。', opts: { speaker: '林晚', whisper: true } }
        ], function () {
          var t0 = performance.now();
          var startRot = sister.rotation.y;
          var turn = function () {
            var t = Math.min(1, (performance.now() - t0) / 3200);
            sister.rotation.y = startRot + (0 - startRot) * t;
            if (t < 1) requestAnimationFrame(turn);
          };
          turn();
          G.after(3.8, function () {
            G.tellLines([
              { text: '你每次来，都只敢看我的背。', opts: { speaker: '林晚' } },
              { text: '你记得我叫什么。可你记得，我为什么在这里吗？', opts: { speaker: '林晚' } },
              { text: '那天晚上，306 的门没有开。', opts: { speaker: '林晚', whisper: true } },
              { text: '你一直在找的……真的是我吗？', opts: { speaker: '林晚' } }
            ], function () {
              G.after(0.8, function () {
                G.tellLines([
                  { text: '还是，你只是不敢把那天晚上想起来？', opts: { speaker: '林晚' } },
                  { text: '哥，把手给我。', opts: { speaker: '林晚', whisper: true } }
                ], function () {
                  G.after(0.8, function () { HStory._finalChoice(); });
                });
              });
            });
          });
        });
      }
    };
    ch5.onTrigger = function (id) {};

    this.chapters = [prologue, ch1, ch2, ch3, ch4, ch5];
  };

  /* ---------------- 终局选择 ---------------- */
  HStory._finalChoice = function () {
    G.cinema(false);
    G.setAmbience('white');
    G.setMusic('white');
    G.showChoice({
      title: '你愿意想起那一晚吗？',
      desc: '她坐在那里，等着你。',
      options: [
        { id: 'accept', label: '抱住她 · 接受记忆', desc: '承认那一晚真的发生过，然后走出东翼。' },
        { id: 'leave', label: '转身离开', desc: '把她留在记忆里，继续每夜回到这里。' }
      ]
    }, function (id) {
      if (id === 'accept') {
        if (G.fileCount() >= 6) {
          G.showEnding('truth');
        } else {
          G.showEnding('loop');
        }
      } else {
        G.showEnding('escape');
      }
    });
  };

  /* ============================================================
     章节启动
     ============================================================ */
  HStory.startChapter = function (idx, restore) {
    var prev = (this.chapterIdx === undefined) ? null : this.chapterIdx;
    if (!restore && prev !== null && idx > prev + 1) {
      console.warn('[story] blocked chapter skip', prev, '->', idx);
      idx = prev + 1;
    }
    if (idx < 0 || idx >= this.chapters.length) return this.chapter || null;
    this.chapterIdx = idx;
    this.chapter = this.chapters[idx];
    this.timers = [];
    G.chapterIdx = idx;
    if (!restore && G.clearSubtitle) G.clearSubtitle();
    if (!restore) G.saveCheckpoint();
    var self = this;
    if (this.chapter && this.chapter.enter) {
      try { this.chapter.enter(!!restore); } catch (e) { console.error('[story enter]', e); }
    }
    return this.chapter;
  };

  HStory.start = function () {
    this.flags = {};
    if (window.HGame && HGame.run === 1) {
      this.flags = { firstRun: true };
      this.timers = [];
      this.chapter = null;
      this.chapterIdx = 0;
      G.chapterIdx = 0;
      G.setObjective('');
      G.clearSubtitle();
      if (document.getElementById('objective')) document.getElementById('objective').classList.add('hidden');
      G.state = 'playing';
      return;
    }
    if (document.getElementById('objective')) document.getElementById('objective').classList.remove('hidden');
    this.startChapter(0);
  };

  HStory.resumeFromSave = function (save) {
    this.applySave(save);
    this.startChapter(save.chapterIdx || 0, true);
  };

  /* ---------------- 注视判定（镜廊） ---------------- */
  HStory._lookScare = null;
  HStory._updateLookScare = function (dt) {
    // 由章节自行检测，这里只更新通用的"玩家是否看着实体"
    if (G && G.entity && G.player) {
      G.player.lookingAtEntity = (typeof HW.Entity.isLooking === 'function') ? HW.Entity.isLooking(G.player, G.entity, 32) : false;
    }
  };

  HStory.currentObjective = function () {
    return G ? G.objective : '';
  };
})();
