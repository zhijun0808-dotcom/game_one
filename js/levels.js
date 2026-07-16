/**
 * 关卡数据：路径、波次、初始资源、自动开波间隔
 * 地图坐标系：网格 15×10，每格 64px → 画布 960×640
 */
const TILE = 64;
const COLS = 15;
const ROWS = 10;

/** 全局默认：波次清空后多久自动开下一波（秒） */
const DEFAULT_AUTO_WAVE_DELAY = 3;
/** 开局后多久自动开第一波（秒） */
const DEFAULT_FIRST_WAVE_DELAY = 10;

function pathToPixels(gridPath) {
  return gridPath.map(([c, r]) => ({
    x: c * TILE + TILE / 2,
    y: r * TILE + TILE / 2,
  }));
}

function buildBlockedSet(gridPath) {
  const blocked = new Set();
  for (let i = 0; i < gridPath.length; i++) {
    const [c, r] = gridPath[i];
    blocked.add(`${c},${r}`);
    if (i < gridPath.length - 1) {
      const [c2, r2] = gridPath[i + 1];
      if (c === c2) {
        const step = r2 > r ? 1 : -1;
        for (let y = r + step; y !== r2; y += step) blocked.add(`${c},${y}`);
      } else if (r === r2) {
        const step = c2 > c ? 1 : -1;
        for (let x = c + step; x !== c2; x += step) blocked.add(`${x},${r}`);
      }
    }
  }
  return blocked;
}

/** 生成一波敌人配置 */
function w(...groups) {
  return { enemies: groups };
}
function e(type, count, interval) {
  return { type, count, interval };
}

/**
 * 按难度生成标准波次序列
 * tier: 1–20 关卡强度
 * 每波内部也有递增难度
 */
function makeWaves(tier) {
  const s = 1 + (tier - 1) * 0.18;
  const n = (base) => Math.max(5, Math.round(base * s));
  const iv = (base) => Math.max(160, Math.round(base / (1 + (tier - 1) * 0.035)));
  const waves = [];

  // 每波递增：第 N 波额外 +12% 敌人数量 + 缩短间隔
  const waveBonus = (waveIdx) => Math.round(waveIdx * 0.12);
  const waveIv = (base, waveIdx) => Math.max(140, Math.round(base * (1 - waveIdx * 0.03) / (1 + (tier - 1) * 0.035)));

  // ===== 基础波（每关都有）=====
  // 第1波：纯步兵热身
  waves.push(w(e("basic", n(8 + tier + waveBonus(0)), waveIv(750, 0))));
  // 第2波：步兵+斥候混合
  waves.push(w(e("basic", n(8 + tier + waveBonus(1)), waveIv(700, 1)), e("fast", n(3 + Math.floor(tier / 2) + waveBonus(1)), waveIv(480, 1))));
  // 第3波：斥候冲锋
  waves.push(w(e("fast", n(6 + Math.floor(tier / 2) + waveBonus(2)), waveIv(440, 2))));
  // 第4波：步兵海+斥候侧翼
  waves.push(w(e("basic", n(10 + tier + waveBonus(3)), waveIv(580, 3)), e("fast", n(4 + waveBonus(3)), waveIv(420, 3))));
  // 第5波：首现重装
  waves.push(
    w(
      e("basic", n(7 + waveBonus(4)), waveIv(520, 4)),
      e(tier >= 2 ? "tank" : "basic", tier >= 2 ? Math.max(2, Math.floor(tier / 2) + waveBonus(4)) : n(5), waveIv(880, 4))
    )
  );

  // ===== 进阶波（按关卡 tier 解锁）=====
  if (tier >= 3) {
    waves.push(w(e("tank", Math.max(3, Math.floor(tier * 0.6) + waveBonus(5)), waveIv(800, 5)), e("fast", n(6 + waveBonus(5)), waveIv(380, 5))));
  }
  if (tier >= 4) {
    waves.push(w(e("armored", Math.max(2, Math.floor(tier * 0.5) + waveBonus(6)), waveIv(750, 6)), e("basic", n(10 + waveBonus(6)), waveIv(450, 6)), e("fast", n(3 + waveBonus(6)), waveIv(400, 6))));
  }
  if (tier >= 5) {
    waves.push(w(e("fast", n(12 + tier + waveBonus(7)), waveIv(310, 7)), e("tank", Math.max(2, Math.floor(tier * 0.5) + waveBonus(7)), waveIv(650, 7))));
  }
  if (tier >= 4) {
    waves.push(w(e("boss", 1 + Math.floor(waveBonus(8) / 3), 0), e("basic", n(12 + waveBonus(8)), waveIv(430, 8)), e("fast", n(4 + waveBonus(8)), waveIv(380, 8))));
  }
  if (tier >= 6) {
    waves.push(w(e("armored", Math.max(3, Math.floor(tier * 0.6) + waveBonus(9)), waveIv(650, 9)), e("fast", n(10 + waveBonus(9)), waveIv(290, 9)), e("basic", n(6 + waveBonus(9)), waveIv(420, 9))));
  }
  if (tier >= 7) {
    waves.push(w(e("tank", n(5 + waveBonus(10)), waveIv(560, 10)), e("armored", n(4 + waveBonus(10)), waveIv(600, 10)), e("fast", n(8 + waveBonus(10)), waveIv(270, 10))));
  }
  if (tier >= 8) {
    waves.push(w(e("fast", n(15 + tier + waveBonus(11)), waveIv(250, 11)), e("tank", n(6 + waveBonus(11)), waveIv(520, 11)), e("armored", n(5 + waveBonus(11)), waveIv(560, 11))));
  }
  if (tier >= 10) {
    waves.push(w(e("boss", 1 + Math.floor(waveBonus(12) / 3), 0), e("armored", n(7 + waveBonus(12)), waveIv(500, 12)), e("fast", n(14 + waveBonus(12)), waveIv(240, 12)), e("basic", n(8 + waveBonus(12)), waveIv(380, 12))));
  }
  if (tier >= 11) {
    waves.push(w(e("tank", n(7 + waveBonus(13)), waveIv(480, 13)), e("armored", n(6 + waveBonus(13)), waveIv(520, 13)), e("fast", n(12 + waveBonus(13)), waveIv(230, 13)), e("basic", n(10 + waveBonus(13)), waveIv(360, 13))));
  }
  if (tier >= 12) {
    waves.push(w(e("fast", n(20 + waveBonus(14)), waveIv(220, 14)), e("tank", n(8 + waveBonus(14)), waveIv(460, 14)), e("armored", n(7 + waveBonus(14)), waveIv(480, 14))));
  }
  if (tier >= 14) {
    waves.push(w(e("boss", 2 + Math.floor(waveBonus(15) / 3), 3000), e("armored", n(8 + waveBonus(15)), waveIv(440, 15)), e("tank", n(7 + waveBonus(15)), waveIv(460, 15)), e("fast", n(10 + waveBonus(15)), waveIv(220, 15))));
  }
  if (tier >= 15) {
    waves.push(w(e("boss", 2 + Math.floor(waveBonus(16) / 3), 2800), e("armored", n(10 + waveBonus(16)), waveIv(420, 16)), e("fast", n(16 + waveBonus(16)), waveIv(200, 16)), e("tank", n(8 + waveBonus(16)), waveIv(440, 16))));
  }
  if (tier >= 17) {
    waves.push(w(e("fast", n(22 + waveBonus(17)), waveIv(190, 17)), e("tank", n(10 + waveBonus(17)), waveIv(420, 17)), e("armored", n(9 + waveBonus(17)), waveIv(440, 17)), e("basic", n(12 + waveBonus(17)), waveIv(340, 17))));
  }
  if (tier >= 18) {
    waves.push(
      w(
        e("boss", 2 + Math.floor(waveBonus(18) / 3), 3500),
        e("armored", n(12 + waveBonus(18)), waveIv(380, 18)),
        e("fast", n(22 + waveBonus(18)), waveIv(180, 18)),
        e("tank", n(10 + waveBonus(18)), waveIv(400, 18)),
        e("basic", n(10 + waveBonus(18)), waveIv(320, 18))
      )
    );
  }
  if (tier >= 20) {
    waves.push(
      w(
        e("boss", 3 + Math.floor(waveBonus(19) / 3), 2500),
        e("armored", n(14 + waveBonus(19)), waveIv(360, 19)),
        e("fast", n(28 + waveBonus(19)), waveIv(160, 19)),
        e("tank", n(12 + waveBonus(19)), waveIv(380, 19)),
        e("basic", n(14 + waveBonus(19)), waveIv(300, 19))
      )
    );
  }

  return waves;
}

const PATHS = {
  straight: [[0, 4], [14, 4]],
  village: [[0, 4], [3, 4], [3, 2], [7, 2], [7, 6], [11, 6], [11, 4], [14, 4]],
  bend: [[0, 1], [4, 1], [4, 5], [2, 5], [2, 8], [8, 8], [8, 3], [12, 3], [12, 7], [14, 7]],
  cross: [[0, 5], [5, 5], [5, 1], [9, 1], [9, 8], [5, 8], [5, 5], [14, 5]],
  canyon: [[0, 2], [2, 2], [2, 7], [6, 7], [6, 3], [10, 3], [10, 8], [13, 8], [13, 4], [14, 4]],
  lava: [[0, 8], [3, 8], [3, 4], [1, 4], [1, 1], [7, 1], [7, 5], [11, 5], [11, 2], [14, 2]],
  spiral: [[0, 0], [13, 0], [13, 2], [1, 2], [1, 4], [13, 4], [13, 6], [1, 6], [1, 8], [14, 8]],
  fortress: [[0, 4], [2, 4], [2, 1], [6, 1], [6, 7], [3, 7], [3, 9], [10, 9], [10, 3], [8, 3], [8, 5], [14, 5]],
  gate: [[0, 5], [3, 5], [3, 2], [7, 2], [7, 0], [11, 0], [11, 4], [9, 4], [9, 8], [5, 8], [5, 6], [13, 6], [13, 9], [14, 9]],
  zigzag: [[0, 0], [4, 0], [4, 3], [8, 3], [8, 0], [12, 0], [12, 5], [6, 5], [6, 8], [14, 8]],
  stairs: [[0, 9], [2, 9], [2, 7], [5, 7], [5, 5], [8, 5], [8, 3], [11, 3], [11, 1], [14, 1]],
  snake: [[0, 3], [6, 3], [6, 6], [3, 6], [3, 1], [10, 1], [10, 8], [7, 8], [7, 4], [14, 4]],
  loop: [[0, 2], [5, 2], [5, 7], [10, 7], [10, 2], [14, 2]],
  valley: [[0, 1], [3, 1], [3, 8], [7, 8], [7, 1], [11, 1], [11, 8], [14, 8]],
  ridge: [[0, 5], [2, 5], [2, 2], [5, 2], [5, 8], [9, 8], [9, 2], [12, 2], [12, 6], [14, 6]],
  maze: [[0, 0], [2, 0], [2, 4], [5, 4], [5, 1], [9, 1], [9, 6], [6, 6], [6, 9], [12, 9], [12, 3], [14, 3]],
  river: [[0, 6], [4, 6], [4, 2], [8, 2], [8, 7], [12, 7], [12, 3], [14, 3]],
  fortress2: [[0, 8], [4, 8], [4, 4], [1, 4], [1, 1], [6, 1], [6, 5], [10, 5], [10, 1], [13, 1], [13, 7], [14, 7]],
  abyss: [[0, 4], [3, 4], [3, 1], [8, 1], [8, 8], [4, 8], [4, 5], [11, 5], [11, 2], [14, 2]],
  final: [[0, 9], [1, 9], [1, 1], [4, 1], [4, 7], [7, 7], [7, 2], [10, 2], [10, 8], [13, 8], [13, 0], [14, 0]],
};

const LEVEL_META = [
  { name: "新手村道", desc: "熟悉建造与波次，轻松上路。", theme: "grass", path: "village", gold: 160, lives: 20, auto: 3, first: 10 },
  { name: "弯道伏击", desc: "更多拐角，适合布置射程塔。", theme: "grass", path: "bend", gold: 165, lives: 18, auto: 3, first: 10 },
  { name: "十字路口", desc: "炮塔清群将大显身手。", theme: "dirt", path: "cross", gold: 180, lives: 16, auto: 3, first: 10 },
  { name: "冰封峡谷", desc: "减速塔在此关大放异彩。", theme: "ice", path: "canyon", gold: 190, lives: 15, auto: 3, first: 10 },
  { name: "熔岩裂隙", desc: "装甲敌人增多，升级火力。", theme: "lava", path: "lava", gold: 200, lives: 14, auto: 3, first: 10 },
  { name: "螺旋迷宫", desc: "长路径，敌人潮水般涌来。", theme: "dirt", path: "spiral", gold: 220, lives: 14, auto: 3, first: 10 },
  { name: "暗影要塞", desc: "高强度混合波次。", theme: "shadow", path: "fortress", gold: 240, lives: 13, auto: 3, first: 10 },
  { name: "裂隙之门", desc: "路径曲折，布局为王。", theme: "final", path: "gate", gold: 250, lives: 12, auto: 3, first: 10 },
  { name: "锯齿荒原", desc: "之字形路线拉长交战时间。", theme: "dirt", path: "zigzag", gold: 260, lives: 12, auto: 3, first: 10 },
  { name: "登天石阶", desc: "拾级而上，火力必须跟上。", theme: "grass", path: "stairs", gold: 270, lives: 12, auto: 3, first: 10 },
  { name: "蛇形暗道", desc: "反复折返，适合多重夹击。", theme: "shadow", path: "snake", gold: 280, lives: 11, auto: 3, first: 10 },
  { name: "回环哨所", desc: "短路径高压，别让漏怪。", theme: "ice", path: "loop", gold: 290, lives: 11, auto: 3, first: 10 },
  { name: "双谷夹击", desc: "上下穿越，注意射程覆盖。", theme: "grass", path: "valley", gold: 300, lives: 11, auto: 3, first: 10 },
  { name: "山脊防线", desc: "中期决战，Boss 频繁出现。", theme: "lava", path: "ridge", gold: 310, lives: 10, auto: 3, first: 10 },
  { name: "迷雾迷宫", desc: "复杂走位，考验预判。", theme: "shadow", path: "maze", gold: 320, lives: 10, auto: 3, first: 10 },
  { name: "血河渡口", desc: "快慢混编，别被冲垮。", theme: "lava", path: "river", gold: 330, lives: 10, auto: 3, first: 10 },
  { name: "黑曜城堡", desc: "装甲潮 + 多重首领。", theme: "shadow", path: "fortress2", gold: 350, lives: 10, auto: 3, first: 10 },
  { name: "深渊回廊", desc: "接近终局，资源要精打细算。", theme: "final", path: "abyss", gold: 360, lives: 9, auto: 3, first: 10 },
  { name: "星陨荒原", desc: "倒数第二关，全力备战。", theme: "ice", path: "zigzag", gold: 380, lives: 9, auto: 3, first: 10 },
  { name: "终焉之门", desc: "最终考验。全力以赴！", theme: "final", path: "final", gold: 400, lives: 8, auto: 3, first: 10 },
];

const LEVELS = LEVEL_META.map((meta, i) => {
  const tier = i + 1;
  return {
    id: tier,
    name: meta.name,
    description: meta.desc,
    gold: meta.gold,
    lives: meta.lives,
    theme: meta.theme,
    path: PATHS[meta.path],
    waves: makeWaves(tier),
    /** 波次间隙自动开波（秒） */
    autoWaveDelay: meta.auto ?? DEFAULT_AUTO_WAVE_DELAY,
    /** 开局自动第一波（秒） */
    firstWaveDelay: meta.first ?? DEFAULT_FIRST_WAVE_DELAY,
  };
});

const THEMES = {
  grass: {
    ground: "#1e3a28",
    groundAlt: "#244a32",
    path: "#5d4e37",
    pathEdge: "#3e3424",
    grid: "rgba(255,255,255,0.04)",
  },
  dirt: {
    ground: "#2a2418",
    groundAlt: "#332c1e",
    path: "#6b5a42",
    pathEdge: "#4a3e2c",
    grid: "rgba(255,255,255,0.04)",
  },
  ice: {
    ground: "#1a2a38",
    groundAlt: "#1e3344",
    path: "#4a6a80",
    pathEdge: "#2e4a5c",
    grid: "rgba(120,200,255,0.06)",
  },
  lava: {
    ground: "#2a1810",
    groundAlt: "#351e14",
    path: "#5a3020",
    pathEdge: "#3e2010",
    grid: "rgba(255,100,50,0.05)",
  },
  shadow: {
    ground: "#141420",
    groundAlt: "#1a1a2e",
    path: "#2e2e48",
    pathEdge: "#1e1e32",
    grid: "rgba(160,100,255,0.05)",
  },
  final: {
    ground: "#1a1020",
    groundAlt: "#221428",
    path: "#4a2840",
    pathEdge: "#301828",
    grid: "rgba(255,80,120,0.05)",
  },
};

function getLevel(index) {
  return LEVELS[index] || null;
}

function getLevelCount() {
  return LEVELS.length;
}
