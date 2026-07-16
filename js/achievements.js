/**
 * 成就系统
 */
const ACHIEVEMENTS = [
  {
    id: "first_clear",
    name: "初出茅庐",
    desc: "通关第 1 关",
    icon: "🌱",
  },
  {
    id: "clear_5",
    name: "小有成就",
    desc: "通关第 5 关",
    icon: "🛡️",
  },
  {
    id: "clear_10",
    name: "防线中坚",
    desc: "通关第 10 关",
    icon: "⚔️",
  },
  {
    id: "clear_15",
    name: "传奇守卫",
    desc: "通关第 15 关",
    icon: "🏰",
  },
  {
    id: "clear_all",
    name: "终焉征服者",
    desc: "通关全部 20 关",
    icon: "👑",
  },
  {
    id: "perfect_level",
    name: "滴水不漏",
    desc: "任意关卡获得三星",
    icon: "⭐",
  },
  {
    id: "stars_10",
    name: "星光闪耀",
    desc: "累计获得 10 颗星",
    icon: "✨",
  },
  {
    id: "stars_30",
    name: "星海指挥官",
    desc: "累计获得 30 颗星",
    icon: "🌟",
  },
  {
    id: "stars_60",
    name: "满天星斗",
    desc: "累计获得 60 颗星",
    icon: "💫",
  },
  {
    id: "no_damage",
    name: "完美防线",
    desc: "通关时不损失任何生命",
    icon: "💎",
  },
  {
    id: "kill_100",
    name: "百人斩",
    desc: "累计击杀 100 名敌人",
    icon: "🗡️",
  },
  {
    id: "kill_500",
    name: "杀戮机器",
    desc: "累计击杀 500 名敌人",
    icon: "🔥",
  },
  {
    id: "kill_2000",
    name: "尸山血海",
    desc: "累计击杀 2000 名敌人",
    icon: "💀",
  },
  {
    id: "boss_slayer",
    name: "首领克星",
    desc: "击杀 1 名首领",
    icon: "👹",
  },
  {
    id: "boss_10",
    name: "屠龙者",
    desc: "累计击杀 10 名首领",
    icon: "🐉",
  },
  {
    id: "build_20",
    name: "工程师",
    desc: "累计建造 20 座防御塔",
    icon: "🔧",
  },
  {
    id: "build_100",
    name: "基建狂魔",
    desc: "累计建造 100 座防御塔",
    icon: "🏗️",
  },
  {
    id: "upgrade_50",
    name: "精益求精",
    desc: "累计升级防御塔 50 次",
    icon: "⬆️",
  },
  {
    id: "all_tower_types",
    name: "全系武装",
    desc: "在同一关内建造全部 4 种防御塔",
    icon: "🎯",
  },
  {
    id: "rich",
    name: "富甲一方",
    desc: "单局持有金币达到 500",
    icon: "💰",
  },
  {
    id: "early_bird",
    name: "抢跑专家",
    desc: "累计提前开波 20 次",
    icon: "⏱️",
  },
  {
    id: "speed_demon",
    name: "时间操控者",
    desc: "使用 ×3 加速完成一关",
    icon: "⚡",
  },
  {
    id: "survivor",
    name: "绝境逢生",
    desc: "以仅剩 1 点生命通关",
    icon: "❤️‍🩹",
  },
  {
    id: "cannon_master",
    name: "炮火覆盖",
    desc: "单局建造 5 座及以上炮塔",
    icon: "💣",
  },
];

const ACH_SAVE_KEY = "tower-defense-achievements";
const STATS_SAVE_KEY = "tower-defense-stats";

function defaultStats() {
  return {
    kills: 0,
    bossKills: 0,
    towersBuilt: 0,
    upgrades: 0,
    earlyWaves: 0,
    totalStars: 0,
    highestLevel: 0,
    levelsCleared: {},
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_SAVE_KEY);
    if (!raw) return defaultStats();
    return { ...defaultStats(), ...JSON.parse(raw) };
  } catch {
    return defaultStats();
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_SAVE_KEY, JSON.stringify(stats));
}

function loadAchievements() {
  try {
    const raw = localStorage.getItem(ACH_SAVE_KEY);
    if (!raw) return { unlocked: {}, dates: {} };
    return JSON.parse(raw);
  } catch {
    return { unlocked: {}, dates: {} };
  }
}

function saveAchievements(data) {
  localStorage.setItem(ACH_SAVE_KEY, JSON.stringify(data));
}

class AchievementManager {
  constructor() {
    this.stats = loadStats();
    this.data = loadAchievements();
    this.onUnlock = null; // (achievement) => void
    // 本局临时统计
    this.session = this.resetSession();
  }

  resetSession() {
    this.session = {
      kills: 0,
      bossKills: 0,
      towersBuilt: 0,
      upgrades: 0,
      earlyWaves: 0,
      towerTypes: new Set(),
      cannonCount: 0,
      maxGold: 0,
      usedSpeed3: false,
      livesLost: 0,
      startLives: 0,
    };
    return this.session;
  }

  startLevel(lives) {
    this.resetSession();
    this.session.startLives = lives;
  }

  addKill(type) {
    this.session.kills++;
    this.stats.kills++;
    if (type === "boss") {
      this.session.bossKills++;
      this.stats.bossKills++;
    }
    this.persistAndCheck();
  }

  addBuild(typeId) {
    this.session.towersBuilt++;
    this.stats.towersBuilt++;
    this.session.towerTypes.add(typeId);
    if (typeId === "cannon") this.session.cannonCount++;
    this.persistAndCheck();
  }

  addUpgrade() {
    this.session.upgrades++;
    this.stats.upgrades++;
    this.persistAndCheck();
  }

  addEarlyWave() {
    this.session.earlyWaves++;
    this.stats.earlyWaves++;
    this.persistAndCheck();
  }

  noteGold(gold) {
    if (gold > this.session.maxGold) {
      this.session.maxGold = gold;
      this.checkRuntime();
    }
  }

  noteSpeed(speed) {
    if (speed >= 3) this.session.usedSpeed3 = true;
  }

  noteLifeLost() {
    this.session.livesLost++;
  }

  /** 通关后结算 */
  onLevelClear(levelIndex, stars, livesLeft) {
    const levelNum = levelIndex + 1;
    this.stats.highestLevel = Math.max(this.stats.highestLevel || 0, levelNum);
    this.stats.levelsCleared[levelNum] = true;

    // 重算总星（由 progress 传入也可，这里用通关时更新）
    this.persistAndCheck();
    this.unlockByClear(levelNum, stars, livesLeft);
  }

  updateTotalStars(starsMap) {
    let total = 0;
    for (const k of Object.keys(starsMap || {})) {
      total += starsMap[k] || 0;
    }
    this.stats.totalStars = total;
    saveStats(this.stats);
    this.checkAll();
  }

  persistAndCheck() {
    saveStats(this.stats);
    this.checkRuntime();
  }

  isUnlocked(id) {
    return !!this.data.unlocked[id];
  }

  unlock(id) {
    if (this.data.unlocked[id]) return false;
    this.data.unlocked[id] = true;
    this.data.dates[id] = Date.now();
    saveAchievements(this.data);
    const ach = ACHIEVEMENTS.find((a) => a.id === id);
    if (ach && this.onUnlock) this.onUnlock(ach);
    return true;
  }

  checkRuntime() {
    const s = this.stats;
    const se = this.session;

    if (s.kills >= 100) this.unlock("kill_100");
    if (s.kills >= 500) this.unlock("kill_500");
    if (s.kills >= 2000) this.unlock("kill_2000");
    if (s.bossKills >= 1) this.unlock("boss_slayer");
    if (s.bossKills >= 10) this.unlock("boss_10");
    if (s.towersBuilt >= 20) this.unlock("build_20");
    if (s.towersBuilt >= 100) this.unlock("build_100");
    if (s.upgrades >= 50) this.unlock("upgrade_50");
    if (s.earlyWaves >= 20) this.unlock("early_bird");
    if (se.maxGold >= 500) this.unlock("rich");
    if (se.towerTypes.size >= 4) this.unlock("all_tower_types");
    if (se.cannonCount >= 5) this.unlock("cannon_master");
  }

  unlockByClear(levelNum, stars, livesLeft) {
    if (levelNum >= 1) this.unlock("first_clear");
    if (levelNum >= 5) this.unlock("clear_5");
    if (levelNum >= 10) this.unlock("clear_10");
    if (levelNum >= 15) this.unlock("clear_15");
    if (levelNum >= 20) this.unlock("clear_all");

    if (stars >= 3) this.unlock("perfect_level");
    if (livesLeft >= this.session.startLives && this.session.livesLost === 0) {
      this.unlock("no_damage");
    }
    if (livesLeft === 1) this.unlock("survivor");
    if (this.session.usedSpeed3) this.unlock("speed_demon");

    this.checkAll();
  }

  checkAll() {
    this.checkRuntime();
    if (this.stats.totalStars >= 10) this.unlock("stars_10");
    if (this.stats.totalStars >= 30) this.unlock("stars_30");
    if (this.stats.totalStars >= 60) this.unlock("stars_60");
  }

  getUnlockedCount() {
    return Object.keys(this.data.unlocked).filter((k) => this.data.unlocked[k]).length;
  }

  getList() {
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: !!this.data.unlocked[a.id],
      date: this.data.dates[a.id] || null,
    }));
  }
}

// 全局单例，供 game / ui 使用
const achievementManager = new AchievementManager();
