/**
 * 游戏核心：状态机、更新、渲染、自动开波
 */
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;

    this.state = "idle"; // idle | playing | paused | won | lost
    this.levelIndex = 0;
    this.level = null;
    this.path = [];
    this.blocked = null;
    this.theme = THEMES.grass;

    this.gold = 0;
    this.lives = 0;
    this.score = 0;
    this.waveIndex = 0;
    this.speed = 1;

    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];

    this.selectedTowerType = null;
    this.selectedTower = null;
    this.hoverCol = -1;
    this.hoverRow = -1;

    this.waveActive = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.enemiesRemainingInWave = 0;
    this.earlyWaveBonus = 0;

    // 自动开波倒计时（秒）
    this.autoWaveTimer = 0;
    this.autoWaveMax = 0;
    this.autoWaveEnabled = true;

    this.occupied = new Set();
    this.floatingTexts = [];
    this.time = 0;

    this.onHudUpdate = null;
    this.onWaveState = null;
    this.onWin = null;
    this.onLose = null;
    this.onBuild = null;
    this.onUpgrade = null;
    this.onSell = null;
    this.onKill = null;
    this.onError = null;
    this.onEarlyWave = null;
    this.onWaveStart = null;
  }

  loadLevel(index) {
    const level = getLevel(index);
    if (!level) return false;

    this.levelIndex = index;
    this.level = level;
    this.path = pathToPixels(level.path);
    this.blocked = buildBlockedSet(level.path);
    this.theme = THEMES[level.theme] || THEMES.grass;

    this.gold = level.gold;
    this.lives = level.lives;
    this.score = 0;
    this.waveIndex = 0;
    this.speed = 1;

    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.effects = [];
    this.occupied = new Set();
    this.floatingTexts = [];
    this.spawnQueue = [];
    this.waveActive = false;
    this.enemiesRemainingInWave = 0;
    this.selectedTowerType = null;
    this.selectedTower = null;
    this.state = "playing";
    this.time = 0;

    // 开局启动第一波自动倒计时
    this.autoWaveMax = level.firstWaveDelay ?? DEFAULT_FIRST_WAVE_DELAY;
    this.autoWaveTimer = this.autoWaveMax;
    this.autoWaveEnabled = true;

    if (typeof achievementManager !== "undefined") {
      achievementManager.startLevel(level.lives);
    }

    this.emitHud();
    this.emitWaveState();
    return true;
  }

  emitHud() {
    if (this.onHudUpdate) {
      this.onHudUpdate({
        level: this.levelIndex + 1,
        levelName: this.level?.name || "",
        wave: this.waveIndex,
        maxWave: this.level?.waves.length || 0,
        gold: this.gold,
        lives: this.lives,
        score: this.score,
        speed: this.speed,
        autoWaveTimer: this.autoWaveTimer,
        autoWaveMax: this.autoWaveMax,
        autoWaveActive:
          this.autoWaveEnabled &&
          !this.waveActive &&
          this.enemies.length === 0 &&
          this.waveIndex < (this.level?.waves.length || 0),
      });
    }
  }

  emitWaveState() {
    if (this.onWaveState) {
      const maxWave = this.level?.waves.length || 0;
      const canStart =
        this.state === "playing" &&
        !this.waveActive &&
        this.waveIndex < maxWave &&
        this.enemies.length === 0;
      const allDone =
        this.waveIndex >= maxWave &&
        this.enemies.length === 0 &&
        !this.waveActive;
      this.onWaveState({
        canStart,
        allDone,
        waveActive: this.waveActive,
        autoWaveTimer: this.autoWaveTimer,
        autoWaveMax: this.autoWaveMax,
      });
    }
  }

  toggleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
    if (typeof achievementManager !== "undefined") {
      achievementManager.noteSpeed(this.speed);
    }
    this.emitHud();
  }

  selectTowerType(typeId) {
    if (typeId && TOWER_TYPES[typeId]) {
      this.selectedTowerType = typeId;
      this.selectedTower = null;
    } else {
      this.selectedTowerType = null;
    }
  }

  setHover(col, row) {
    this.hoverCol = col;
    this.hoverRow = row;
  }

  canBuildAt(col, row) {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return false;
    const key = `${col},${row}`;
    if (this.blocked.has(key)) return false;
    if (this.occupied.has(key)) return false;
    return true;
  }

  tryBuild(col, row) {
    if (!this.selectedTowerType || this.state !== "playing") return false;
    if (!this.canBuildAt(col, row)) return false;

    const def = TOWER_TYPES[this.selectedTowerType];
    if (this.gold < def.cost) {
      this.addFloat(col * TILE + TILE / 2, row * TILE + TILE / 2, "金币不足!", "#ef5350");
      if (this.onError) this.onError();
      return false;
    }

    this.gold -= def.cost;
    const tower = new Tower(this.selectedTowerType, col, row);
    this.towers.push(tower);
    this.occupied.add(`${col},${row}`);
    this.selectedTower = tower;
    const builtType = this.selectedTowerType;
    this.selectedTowerType = null;

    if (typeof achievementManager !== "undefined") {
      achievementManager.addBuild(builtType);
      achievementManager.noteGold(this.gold);
    }

    this.emitHud();
    if (this.onBuild) this.onBuild(builtType);
    return true;
  }

  trySelectTower(x, y) {
    for (let i = this.towers.length - 1; i >= 0; i--) {
      if (this.towers[i].containsPoint(x, y)) {
        this.selectedTower = this.towers[i];
        this.selectedTowerType = null;
        return this.towers[i];
      }
    }
    this.selectedTower = null;
    return null;
  }

  upgradeSelected() {
    const t = this.selectedTower;
    if (!t || !t.canUpgrade()) return false;
    const cost = t.upgradeCost;
    if (this.gold < cost) {
      this.addFloat(t.x, t.y - 20, "金币不足!", "#ef5350");
      return false;
    }
    this.gold -= cost;
    t.upgrade();
    this.addFloat(t.x, t.y - 20, `升级 Lv.${t.level}!`, "#ffd54f");
    if (typeof achievementManager !== "undefined") {
      achievementManager.addUpgrade();
      achievementManager.noteGold(this.gold);
    }
    this.emitHud();
    if (this.onUpgrade) this.onUpgrade();
    return true;
  }

  sellSelected() {
    const t = this.selectedTower;
    if (!t) return false;
    const value = t.sellValue;
    this.gold += value;
    this.occupied.delete(`${t.col},${t.row}`);
    this.towers = this.towers.filter((x) => x !== t);
    this.selectedTower = null;
    this.addFloat(t.x, t.y, `+${value}`, "#ffd54f");
    if (typeof achievementManager !== "undefined") {
      achievementManager.noteGold(this.gold);
    }
    this.emitHud();
    if (this.onSell) this.onSell();
    return true;
  }

  /**
   * 开始下一波
   * @param {boolean} fromAuto 是否自动开波（无提前奖励）
   */
  startNextWave(fromAuto = false) {
    if (this.state !== "playing" || this.waveActive) return false;
    if (this.waveIndex >= this.level.waves.length) return false;
    if (this.enemies.length > 0) return false;

    // 提前开波奖励：手动且倒计时未结束
    if (!fromAuto && this.autoWaveTimer > 0 && this.waveIndex > 0) {
      const ratio = this.autoWaveMax > 0 ? this.autoWaveTimer / this.autoWaveMax : 0;
      const bonus = Math.max(5, Math.round((10 + this.waveIndex * 3) * (0.4 + ratio * 0.6)));
      this.gold += bonus;
      this.earlyWaveBonus = bonus;
      this.addFloat(this.width / 2, 40, `提前出击 +${bonus}`, "#66bb6a");
      if (typeof achievementManager !== "undefined") {
        achievementManager.addEarlyWave();
        achievementManager.noteGold(this.gold);
      }
      if (this.onEarlyWave) this.onEarlyWave();
    } else if (!fromAuto && this.waveIndex === 0 && this.autoWaveTimer > 0) {
      // 第一波提前：小额奖励
      const bonus = Math.max(3, Math.round(this.autoWaveTimer));
      this.gold += bonus;
      this.addFloat(this.width / 2, 40, `提前部署 +${bonus}`, "#66bb6a");
      if (typeof achievementManager !== "undefined") {
        achievementManager.addEarlyWave();
        achievementManager.noteGold(this.gold);
      }
      if (this.onEarlyWave) this.onEarlyWave();
    }

    const wave = this.level.waves[this.waveIndex];
    this.spawnQueue = [];
    let timeOffset = 0;
    for (const group of wave.enemies) {
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          type: group.type,
          at: timeOffset + i * (group.interval || 500),
        });
      }
      const groupSpan = Math.max(0, (group.count - 1) * (group.interval || 500));
      timeOffset += groupSpan + 400;
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.spawnTimer = 0;
    this.enemiesRemainingInWave = this.spawnQueue.length;
    this.waveActive = true;
    this.waveIndex++;
    this.autoWaveTimer = 0;
    this.emitHud();
    this.emitWaveState();
    if (this.onWaveStart) this.onWaveStart();
    return true;
  }

  /** 波次间隙开始自动倒计时 */
  beginAutoWaveCountdown() {
    if (this.waveIndex >= this.level.waves.length) {
      this.autoWaveTimer = 0;
      return;
    }
    this.autoWaveMax =
      this.waveIndex === 0
        ? this.level.firstWaveDelay ?? DEFAULT_FIRST_WAVE_DELAY
        : this.level.autoWaveDelay ?? DEFAULT_AUTO_WAVE_DELAY;
    this.autoWaveTimer = this.autoWaveMax;
    this.emitWaveState();
    this.emitHud();
  }

  spawnEnemy(type) {
    const e = new Enemy(type, this.path, this.levelIndex);
    this.enemies.push(e);
  }

  addFloat(x, y, text, color = "#fff") {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 1.0,
      vy: -30,
    });
  }

  update(dt) {
    if (this.state !== "playing") return;
    const t = dt * this.speed;
    this.time += t;

    // 自动开波倒计时
    if (
      this.autoWaveEnabled &&
      !this.waveActive &&
      this.enemies.length === 0 &&
      this.waveIndex < this.level.waves.length &&
      this.autoWaveTimer > 0
    ) {
      this.autoWaveTimer -= t;
      if (this.autoWaveTimer <= 0) {
        this.autoWaveTimer = 0;
        this.startNextWave(true);
      } else {
        // 节流 HUD 刷新感：每帧也行，成本低
        this.emitHud();
        this.emitWaveState();
      }
    }

    // 生成敌人
    if (this.waveActive && this.spawnQueue.length > 0) {
      this.spawnTimer += t * 1000;
      while (this.spawnQueue.length > 0 && this.spawnQueue[0].at <= this.spawnTimer) {
        const item = this.spawnQueue.shift();
        this.spawnEnemy(item.type);
        this.enemiesRemainingInWave--;
      }
    }

    // 敌人
    for (const e of this.enemies) {
      e.update(t);
      if (e.reachedEnd) {
        const dmg = e.type === "boss" ? 5 : e.type === "tank" ? 2 : 1;
        this.lives -= dmg;
        if (typeof achievementManager !== "undefined") {
          achievementManager.noteLifeLost();
        }
        this.addFloat(e.x, e.y, `-${dmg}❤`, "#ef5350");
        if (this.lives <= 0) {
          this.lives = 0;
          this.state = "lost";
          this.autoWaveTimer = 0;
          this.emitHud();
          if (this.onLose) this.onLose(this.score);
          return;
        }
        this.emitHud();
      }
    }

    // 击杀结算
    for (const e of this.enemies) {
      if (!e.alive && !e.reachedEnd && e.hp <= 0) {
        if (!e._rewarded) {
          e._rewarded = true;
          this.gold += e.reward;
          this.score += e.scoreValue;
          this.addFloat(e.x, e.y - 10, `+${e.reward}`, "#ffd54f");
          this.effects.push(new Particle(e.x, e.y, e.color, 12));
          if (typeof achievementManager !== "undefined") {
            achievementManager.addKill(e.type);
            achievementManager.noteGold(this.gold);
          }
          this.emitHud();
          if (this.onKill) this.onKill(e.type);
        }
      }
    }

    this.enemies = this.enemies.filter((e) => e.alive);

    for (const tower of this.towers) {
      tower.update(t, this.enemies, this.projectiles, this.effects);
    }

    for (const p of this.projectiles) {
      if (p instanceof LaserBeam) {
        p.update(t);
      } else {
        p.update(t, this.enemies);
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);

    for (const fx of this.effects) fx.update(t);
    this.effects = this.effects.filter((fx) => fx.alive);

    for (const ft of this.floatingTexts) {
      ft.life -= t;
      ft.y += ft.vy * t;
    }
    this.floatingTexts = this.floatingTexts.filter((ft) => ft.life > 0);

    // 波次结束
    if (
      this.waveActive &&
      this.spawnQueue.length === 0 &&
      this.enemies.length === 0
    ) {
      this.waveActive = false;
      this.emitWaveState();

      if (this.waveIndex >= this.level.waves.length) {
        this.state = "won";
        this.autoWaveTimer = 0;
        this.score += this.lives * 20 + this.gold;
        this.emitHud();
        const stars = this.calcStars();
        if (typeof achievementManager !== "undefined") {
          achievementManager.onLevelClear(this.levelIndex, stars, this.lives);
        }
        if (this.onWin) this.onWin(this.score, stars, this.levelIndex);
      } else {
        // 启动下一波自动倒计时
        this.beginAutoWaveCountdown();
      }
    }
  }

  calcStars() {
    const maxLives = this.level.lives;
    const ratio = this.lives / maxLives;
    if (ratio >= 0.7) return 3;
    if (ratio >= 0.35) return 2;
    return 1;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawMap(ctx);
    this.drawPath(ctx);

    if (this.selectedTowerType && this.hoverCol >= 0) {
      this.drawBuildPreview(ctx);
    }

    for (const tower of this.towers) {
      const sel = tower === this.selectedTower;
      tower.draw(ctx, sel, sel);
    }

    const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const e of sorted) e.draw(ctx);

    for (const p of this.projectiles) p.draw(ctx);
    for (const fx of this.effects) fx.draw(ctx);

    for (const ft of this.floatingTexts) {
      ctx.globalAlpha = Math.min(1, ft.life * 2);
      ctx.fillStyle = ft.color;
      ctx.font = "bold 14px Noto Sans SC, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    // 自动开波提示条
    if (
      this.state === "playing" &&
      !this.waveActive &&
      this.enemies.length === 0 &&
      this.waveIndex < this.level.waves.length
    ) {
      const maxW = this.level.waves.length;
      const sec = Math.ceil(Math.max(0, this.autoWaveTimer));
      const barW = 320;
      const barH = 42;
      const bx = this.width / 2 - barW / 2;
      const by = 10;

      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(bx, by, barW, barH);
      ctx.strokeStyle = "rgba(79,195,247,0.45)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, barW, barH);

      // 进度条
      if (this.autoWaveMax > 0) {
        const pct = Math.max(0, Math.min(1, this.autoWaveTimer / this.autoWaveMax));
        ctx.fillStyle = "rgba(79,195,247,0.25)";
        ctx.fillRect(bx + 2, by + barH - 5, (barW - 4) * pct, 3);
      }

      ctx.fillStyle = "#e8eef8";
      ctx.font = "13px Noto Sans SC, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `第 ${this.waveIndex + 1}/${maxW} 波 · ${sec}s 后自动开始 · 空格可提前`,
        this.width / 2,
        by + 26
      );
    }
  }

  drawMap(ctx) {
    const theme = this.theme;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        ctx.fillStyle = (c + r) % 2 === 0 ? theme.ground : theme.groundAlt;
        ctx.fillRect(x, y, TILE, TILE);
      }
    }

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * TILE, 0);
      ctx.lineTo(c * TILE, this.height);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * TILE);
      ctx.lineTo(this.width, r * TILE);
      ctx.stroke();
    }
  }

  drawPath(ctx) {
    if (this.path.length < 2) return;
    const theme = this.theme;
    const half = 22;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = theme.pathEdge;
    ctx.lineWidth = half * 2 + 8;
    ctx.beginPath();
    ctx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) {
      ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = theme.path;
    ctx.lineWidth = half * 2;
    ctx.beginPath();
    ctx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) {
      ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 10]);
    ctx.beginPath();
    ctx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) {
      ctx.lineTo(this.path[i].x, this.path[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const start = this.path[0];
    const end = this.path[this.path.length - 1];

    ctx.beginPath();
    ctx.arc(start.x, start.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(102, 187, 106, 0.85)";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("IN", start.x, start.y);

    ctx.beginPath();
    ctx.arc(end.x, end.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(239, 83, 80, 0.85)";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText("OUT", end.x, end.y);
  }

  drawBuildPreview(ctx) {
    const col = this.hoverCol;
    const row = this.hoverRow;
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;

    const def = TOWER_TYPES[this.selectedTowerType];
    const ok = this.canBuildAt(col, row) && this.gold >= def.cost;
    const x = col * TILE + TILE / 2;
    const y = row * TILE + TILE / 2;

    ctx.fillStyle = ok ? "rgba(102, 187, 106, 0.25)" : "rgba(239, 83, 80, 0.3)";
    ctx.fillRect(col * TILE, row * TILE, TILE, TILE);
    ctx.strokeStyle = ok ? "rgba(102, 187, 106, 0.7)" : "rgba(239, 83, 80, 0.7)";
    ctx.lineWidth = 2;
    ctx.strokeRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2);

    ctx.beginPath();
    ctx.arc(x, y, def.range, 0, Math.PI * 2);
    ctx.fillStyle = ok ? "rgba(79, 195, 247, 0.08)" : "rgba(239, 83, 80, 0.06)";
    ctx.fill();
    ctx.strokeStyle = ok ? "rgba(79, 195, 247, 0.35)" : "rgba(239, 83, 80, 0.3)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fillStyle = def.color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.icon, x, y);
  }

  screenToGrid(sx, sy) {
    const col = Math.floor(sx / TILE);
    const row = Math.floor(sy / TILE);
    return { col, row };
  }
}
