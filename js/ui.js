/**
 * UI 绑定：菜单、HUD、商店、存档、成就
 */
const SAVE_KEY = "tower-defense-progress";

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    // unlocked: 最高已解锁关卡编号（1-based），默认仅第 1 关
    if (!raw) return { unlocked: 1, stars: {}, bestLevel: 0 };
    const data = JSON.parse(raw);
    if (!data.unlocked || data.unlocked < 1) data.unlocked = 1;
    return data;
  } catch {
    return { unlocked: 1, stars: {}, bestLevel: 0 };
  }
}

function saveProgress(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

/** 通关后解锁下一关；仅已通关/已解锁关卡可选 */
function unlockLevel(levelIndex, stars) {
  const p = loadProgress();
  const levelNum = levelIndex + 1;
  // 通关第 N 关 → 解锁第 N+1 关
  p.unlocked = Math.max(p.unlocked || 1, levelNum + 1);
  p.bestLevel = Math.max(p.bestLevel || 0, levelNum);
  const prev = p.stars[levelNum] || 0;
  p.stars[levelNum] = Math.max(prev, stars);
  p.unlocked = Math.min(p.unlocked, getLevelCount());
  // 若通关最后一关，unlocked 保持为总关卡数
  if (levelNum >= getLevelCount()) {
    p.unlocked = getLevelCount();
  }
  saveProgress(p);
  return p;
}

/** 关卡是否可选：第 1 关始终可玩；其余需 unlocked >= levelNum */
function isLevelPlayable(levelIndex, progress) {
  const levelNum = levelIndex + 1;
  const unlocked = progress.unlocked || 1;
  return levelNum <= unlocked;
}

class UI {
  constructor(game) {
    this.game = game;
    this.progress = loadProgress();
    this.achToastQueue = [];
    this.achToastShowing = false;

    // 拖拽建造状态
    this.drag = {
      active: false,
      typeId: null,
      startX: 0,
      startY: 0,
      moved: false,
      pointerId: null,
      btn: null,
    };

    this.$ = (id) => document.getElementById(id);
    this.screens = {
      menu: this.$("screen-menu"),
      levels: this.$("screen-levels"),
      howto: this.$("screen-howto"),
      achievements: this.$("screen-achievements"),
      game: this.$("screen-game"),
    };
    this.overlays = {
      pause: this.$("overlay-pause"),
      win: this.$("overlay-win"),
      lose: this.$("overlay-lose"),
      complete: this.$("overlay-complete"),
    };

    this.bindMenus();
    this.bindGameControls();
    this.bindKeyboard();
    this.bindTowerDrag();
    this.bindMusicToggle();
    this.buildShop();
    this.updateMenuStats();

    game.onHudUpdate = (data) => this.updateHud(data);
    game.onWaveState = (data) => this.updateWaveBtn(data);
    game.onWin = (score, stars, levelIndex) => this.showWin(score, stars, levelIndex);
    game.onLose = (score) => this.showLose(score);
    game.onBuild = () => gameAudio.sfxBuild();
    game.onUpgrade = () => gameAudio.sfxUpgrade();
    game.onSell = () => gameAudio.sfxSell();
    game.onKill = () => gameAudio.sfxKill();
    game.onError = () => gameAudio.sfxError();
    game.onEarlyWave = () => gameAudio.sfxEarlyWave();
    game.onWaveStart = () => gameAudio.sfxWaveStart();

    achievementManager.onUnlock = (ach) => this.showAchievementToast(ach);
  }

  /** 屏幕坐标 → 画布网格 */
  clientToGrid(clientX, clientY) {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    const overCanvas =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;
    const { col, row } = this.game.screenToGrid(x, y);
    return { x, y, col, row, overCanvas };
  }

  bindTowerDrag() {
    const ghost = () => this.$("drag-ghost");

    const onMove = (e) => {
      if (!this.drag.active) return;
      const cx = e.clientX ?? e.touches?.[0]?.clientX;
      const cy = e.clientY ?? e.touches?.[0]?.clientY;
      if (cx == null) return;

      const dx = cx - this.drag.startX;
      const dy = cy - this.drag.startY;
      if (!this.drag.moved && Math.hypot(dx, dy) > 6) {
        this.drag.moved = true;
        this.beginDragVisual();
      }
      if (!this.drag.moved) return;

      const g = ghost();
      g.style.left = cx + "px";
      g.style.top = cy + "px";

      const { col, row, overCanvas } = this.clientToGrid(cx, cy);
      if (overCanvas && this.game.state === "playing") {
        this.game.selectTowerType(this.drag.typeId);
        this.game.setHover(col, row);
        const ok =
          this.game.canBuildAt(col, row) &&
          this.game.gold >= TOWER_TYPES[this.drag.typeId].cost;
        g.classList.toggle("invalid", !ok);
      } else {
        this.game.setHover(-1, -1);
        g.classList.add("invalid");
      }
    };

    const onUp = (e) => {
      if (!this.drag.active) return;
      const cx = e.clientX ?? e.changedTouches?.[0]?.clientX;
      const cy = e.clientY ?? e.changedTouches?.[0]?.clientY;
      const typeId = this.drag.typeId;
      const moved = this.drag.moved;
      const btn = this.drag.btn;

      this.endDragVisual();

      if (moved && cx != null && this.game.state === "playing") {
        const { col, row, overCanvas } = this.clientToGrid(cx, cy);
        if (overCanvas) {
          this.game.selectTowerType(typeId);
          const built = this.game.tryBuild(col, row);
          this.onTowerPlacedOrSelected();
          if (!built) {
            this.game.selectTowerType(null);
            this.refreshShopSelection();
            this.renderTowerInfo();
          }
        } else {
          this.game.selectTowerType(null);
          this.game.setHover(-1, -1);
          this.refreshShopSelection();
          this.renderTowerInfo();
        }
      } else if (!moved && typeId) {
        // 短按 = 点击选中（兼容原操作）
        this.pickTower(typeId);
      }

      this.drag.active = false;
      this.drag.typeId = null;
      this.drag.btn = null;
      if (btn) btn.classList.remove("dragging");
    };

    // capture 阶段，避免 setPointerCapture 后丢失事件
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
  }

  /** 音乐切换按钮绑定 */
  bindMusicToggle() {
    const updateBtnStates = (muted) => {
      const menuBtn = this.$("btn-music-menu");
      const gameBtn = this.$("btn-music-game");
      if (menuBtn) {
        menuBtn.classList.toggle("muted", muted);
        menuBtn.textContent = muted ? "音乐" : "音乐";
      }
      if (gameBtn) {
        gameBtn.textContent = muted ? "🔇" : "🔊";
      }
    };

    this.$("btn-music-menu")?.addEventListener("click", () => {
      gameAudio.init();
      gameAudio.resume();
      const muted = gameAudio.toggleMute();
      updateBtnStates(muted);
      // 首次点击：如果 BGM 未播放则启动
      if (!muted && !gameAudio.bgmPlaying) {
        gameAudio.startBGM();
      }
    });

    this.$("btn-music-game")?.addEventListener("click", () => {
      gameAudio.init();
      gameAudio.resume();
      const muted = gameAudio.toggleMute();
      updateBtnStates(muted);
      if (!muted && !gameAudio.bgmPlaying) {
        gameAudio.startBGM();
      }
    });

    // 初始化按钮状态
    updateBtnStates(gameAudio.muted);
  }

  beginDragVisual() {
    const def = TOWER_TYPES[this.drag.typeId];
    if (!def) return;
    const g = this.$("drag-ghost");
    g.textContent = def.icon;
    g.style.borderColor = def.color;
    g.classList.remove("hidden", "invalid");
    if (this.drag.btn) this.drag.btn.classList.add("dragging");
    document.body.style.cursor = "grabbing";
    // 进入拖拽模式：选中该塔以便地图显示射程预览
    this.game.selectTowerType(this.drag.typeId);
    this.game.selectedTower = null;
    this.refreshShopSelection();
    this.renderTowerInfo();
  }

  endDragVisual() {
    const g = this.$("drag-ghost");
    g.classList.add("hidden");
    g.classList.remove("invalid");
    document.body.style.cursor = "";
    this.game.setHover(-1, -1);
  }

  startTowerDrag(typeId, e, btn) {
    if (this.game.state !== "playing") return;
    if (e.button != null && e.button !== 0) return;

    this.drag.active = true;
    this.drag.typeId = typeId;
    this.drag.startX = e.clientX;
    this.drag.startY = e.clientY;
    this.drag.moved = false;
    this.drag.pointerId = e.pointerId;
    this.drag.btn = btn;

    try {
      btn.setPointerCapture?.(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  showScreen(name) {
    Object.values(this.screens).forEach((el) => {
      if (el) el.classList.remove("active");
    });
    this.screens[name].classList.add("active");
  }

  hideOverlays() {
    Object.values(this.overlays).forEach((el) => el.classList.add("hidden"));
  }

  updateMenuStats() {
    this.progress = loadProgress();
    this.$("best-level").textContent = this.progress.bestLevel || 0;
    const achCount = achievementManager.getUnlockedCount();
    const achTotal = ACHIEVEMENTS.length;
    if (this.$("ach-count")) {
      this.$("ach-count").textContent = `${achCount}/${achTotal}`;
    }
  }

  bindMenus() {
    this.$("btn-play").addEventListener("click", () => {
      this.progress = loadProgress();
      // 从当前进度：最高已解锁且未通关，或继续最高解锁关
      const unlocked = Math.min(this.progress.unlocked || 1, getLevelCount());
      const playIdx = unlocked - 1;
      this.startLevel(playIdx);
    });

    this.$("btn-levels").addEventListener("click", () => {
      this.renderLevelGrid();
      this.showScreen("levels");
    });

    this.$("btn-achievements").addEventListener("click", () => {
      this.renderAchievements();
      this.showScreen("achievements");
    });

    this.$("btn-howto").addEventListener("click", () => this.showScreen("howto"));
    this.$("btn-levels-back").addEventListener("click", () => this.showScreen("menu"));
    this.$("btn-howto-back").addEventListener("click", () => this.showScreen("menu"));
    this.$("btn-ach-back").addEventListener("click", () => {
      this.updateMenuStats();
      this.showScreen("menu");
    });

    this.$("btn-resume").addEventListener("click", () => this.resume());
    this.$("btn-restart").addEventListener("click", () => {
      this.hideOverlays();
      this.startLevel(this.game.levelIndex);
    });
    this.$("btn-quit").addEventListener("click", () => this.quitToMenu());

    this.$("btn-next-level").addEventListener("click", () => {
      this.hideOverlays();
      const next = this.game.levelIndex + 1;
      if (next < getLevelCount()) this.startLevel(next);
      else this.showComplete();
    });
    this.$("btn-win-menu").addEventListener("click", () => this.quitToMenu());
    this.$("btn-retry").addEventListener("click", () => {
      this.hideOverlays();
      this.startLevel(this.game.levelIndex);
    });
    this.$("btn-lose-menu").addEventListener("click", () => this.quitToMenu());
    this.$("btn-complete-menu").addEventListener("click", () => this.quitToMenu());
  }

  bindGameControls() {
    this.$("btn-pause").addEventListener("click", () => this.pause());
    this.$("btn-speed").addEventListener("click", () => {
      this.game.toggleSpeed();
    });
    this.$("btn-next-wave").addEventListener("click", () => {
      this.game.startNextWave(false);
    });
  }

  bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (this.screens.game.classList.contains("active") === false) return;

      if (e.code === "Escape") {
        e.preventDefault();
        if (!this.overlays.pause.classList.contains("hidden")) {
          this.resume();
        } else if (this.game.selectedTowerType) {
          this.game.selectTowerType(null);
          this.refreshShopSelection();
          this.renderTowerInfo();
        } else if (this.game.state === "playing") {
          this.pause();
        }
        return;
      }

      if (this.game.state !== "playing") return;

      if (e.code === "Space") {
        e.preventDefault();
        this.game.startNextWave(false);
        return;
      }

      if (e.code === "KeyQ") {
        this.game.toggleSpeed();
        return;
      }

      const keys = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
      if (keys[e.code] !== undefined) {
        const typeId = TOWER_ORDER[keys[e.code]];
        this.pickTower(typeId);
      }
    });
  }

  startLevel(index) {
    this.progress = loadProgress();
    if (!isLevelPlayable(index, this.progress)) {
      alert("请先通关前置关卡以解锁！");
      return;
    }
    this.hideOverlays();
    this.game.loadLevel(index);
    this.showScreen("game");
    this.game.selectTowerType(null);
    this.refreshShopSelection();
    this.renderTowerInfo();
    this.updateWaveBtn({
      canStart: true,
      allDone: false,
      waveActive: false,
      autoWaveTimer: this.game.autoWaveTimer,
      autoWaveMax: this.game.autoWaveMax,
    });
    // 启动 BGM
    gameAudio.init();
    gameAudio.resume();
    if (!gameAudio.muted && !gameAudio.bgmPlaying) {
      gameAudio.startBGM();
    }
  }

  quitToMenu() {
    this.hideOverlays();
    this.game.state = "idle";
    this.updateMenuStats();
    this.showScreen("menu");
  }

  pause() {
    if (this.game.state !== "playing") return;
    this.game.state = "paused";
    this.overlays.pause.classList.remove("hidden");
  }

  resume() {
    if (this.game.state !== "paused") return;
    this.game.state = "playing";
    this.overlays.pause.classList.add("hidden");
  }

  showWin(score, stars, levelIndex) {
    this.progress = unlockLevel(levelIndex, stars);
    achievementManager.updateTotalStars(this.progress.stars);

    this.$("win-score").textContent = score;
    this.$("win-stars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);

    const nextBtn = this.$("btn-next-level");
    if (levelIndex + 1 >= getLevelCount()) {
      nextBtn.textContent = "完成战役";
    } else {
      nextBtn.textContent = "下一关";
    }

    this.overlays.win.classList.remove("hidden");
    gameAudio.sfxWin();
  }

  showLose(score) {
    this.$("lose-score").textContent = score;
    this.overlays.lose.classList.remove("hidden");
    gameAudio.sfxLose();
  }

  showComplete() {
    this.hideOverlays();
    this.$("complete-score").textContent = this.game.score;
    this.overlays.complete.classList.remove("hidden");
  }

  renderLevelGrid() {
    this.progress = loadProgress();
    const grid = this.$("level-grid");
    grid.innerHTML = "";
    const unlocked = this.progress.unlocked || 1;

    for (let i = 0; i < getLevelCount(); i++) {
      const level = getLevel(i);
      const card = document.createElement("div");
      const playable = isLevelPlayable(i, this.progress);
      const starCount = this.progress.stars[i + 1] || 0;
      const cleared = starCount > 0;

      card.className =
        "level-card" +
        (!playable ? " locked" : "") +
        (cleared ? " cleared" : "") +
        (playable && !cleared ? " current" : "");

      if (!playable) {
        card.innerHTML = `
          <div class="lock-icon">🔒</div>
          <div class="level-num">${i + 1}</div>
          <div class="level-name">未解锁</div>
          <div class="level-hint">通关第 ${i} 关解锁</div>
        `;
      } else {
        card.innerHTML = `
          <div class="level-num">${i + 1}</div>
          <div class="level-name">${level.name}</div>
          <div class="level-stars">${
            cleared
              ? "★".repeat(starCount) + "☆".repeat(3 - starCount)
              : "可挑战"
          }</div>
          <div class="level-meta">${level.waves.length} 波 · 自动 ${level.autoWaveDelay}s</div>
        `;
        card.addEventListener("click", () => this.startLevel(i));
      }
      grid.appendChild(card);
    }
  }

  renderAchievements() {
    const list = this.$("ach-list");
    const summary = this.$("ach-summary");
    const items = achievementManager.getList();
    const unlocked = items.filter((a) => a.unlocked).length;
    summary.textContent = `已解锁 ${unlocked} / ${items.length}`;

    list.innerHTML = "";
    for (const a of items) {
      const el = document.createElement("div");
      el.className = "ach-card" + (a.unlocked ? " unlocked" : " locked");
      const dateStr = a.date
        ? new Date(a.date).toLocaleDateString("zh-CN")
        : "";
      el.innerHTML = `
        <div class="ach-icon">${a.unlocked ? a.icon : "🔒"}</div>
        <div class="ach-body">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
          ${a.unlocked && dateStr ? `<div class="ach-date">${dateStr}</div>` : ""}
        </div>
        <div class="ach-status">${a.unlocked ? "已解锁" : "未达成"}</div>
      `;
      list.appendChild(el);
    }
  }

  showAchievementToast(ach) {
    this.achToastQueue.push(ach);
    this.drainAchToasts();
  }

  drainAchToasts() {
    if (this.achToastShowing || this.achToastQueue.length === 0) return;
    this.achToastShowing = true;
    const ach = this.achToastQueue.shift();
    const toast = this.$("ach-toast");
    toast.innerHTML = `
      <div class="ach-toast-icon">${ach.icon}</div>
      <div>
        <div class="ach-toast-title">成就解锁！</div>
        <div class="ach-toast-name">${ach.name}</div>
        <div class="ach-toast-desc">${ach.desc}</div>
      </div>
    `;
    toast.classList.remove("hidden");
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        toast.classList.add("hidden");
        this.achToastShowing = false;
        this.drainAchToasts();
      }, 350);
    }, 2800);
  }

  buildShop() {
    const shop = this.$("tower-shop");
    shop.innerHTML = "";
    TOWER_ORDER.forEach((id, idx) => {
      const def = TOWER_TYPES[id];
      const btn = document.createElement("button");
      btn.className = "tower-btn";
      btn.type = "button";
      btn.dataset.type = id;
      btn.draggable = false;
      btn.innerHTML = `
        <div class="t-icon">${def.icon}</div>
        <div class="t-name">${def.name}</div>
        <div class="t-cost">${def.cost}</div>
        <div class="t-hotkey">拖拽 · [${idx + 1}]</div>
      `;
      btn.title = `${def.description}（拖到地图放置）`;

      // 用 pointer 拖拽；短按仍可选中
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.startTowerDrag(id, e, btn);
      });
      // 阻止 click 与拖拽冲突（选中由 pointerup 短按处理）
      btn.addEventListener("click", (e) => e.preventDefault());

      shop.appendChild(btn);
    });
  }

  pickTower(typeId) {
    if (this.game.state !== "playing") return;
    if (this.game.selectedTowerType === typeId) {
      this.game.selectTowerType(null);
    } else {
      this.game.selectTowerType(typeId);
    }
    this.game.selectedTower = null;
    this.refreshShopSelection();
    this.renderTowerInfo();
  }

  refreshShopSelection() {
    const gold = this.game.gold;
    document.querySelectorAll(".tower-btn").forEach((btn) => {
      const def = TOWER_TYPES[btn.dataset.type];
      btn.classList.toggle("selected", btn.dataset.type === this.game.selectedTowerType);
      btn.style.opacity = gold < def.cost ? "0.45" : "1";
      btn.disabled = false;
    });
  }

  updateHud(data) {
    this.$("hud-level").textContent = data.level;
    this.$("hud-wave").textContent = data.wave;
    this.$("hud-max-wave").textContent = data.maxWave;
    this.$("hud-gold").textContent = data.gold;
    this.$("hud-lives").textContent = data.lives;
    this.$("hud-score").textContent = data.score;
    this.$("btn-speed").textContent = `×${data.speed}`;

    if (this.$("hud-auto-wave")) {
      if (data.autoWaveActive && data.autoWaveTimer > 0) {
        this.$("hud-auto-wave").textContent = `${Math.ceil(data.autoWaveTimer)}s`;
        this.$("hud-auto-wave").parentElement?.classList.remove("hidden");
      } else {
        this.$("hud-auto-wave").textContent = "—";
      }
    }

    this.refreshShopSelection();
    if (this.game.selectedTower) this.renderTowerInfo();
  }

  updateWaveBtn({ canStart, allDone, waveActive, autoWaveTimer }) {
    const btn = this.$("btn-next-wave");
    if (allDone) {
      btn.textContent = "已清空";
      btn.disabled = true;
    } else if (waveActive) {
      btn.textContent = "波次进行中…";
      btn.disabled = true;
    } else if (canStart) {
      const sec = Math.ceil(Math.max(0, autoWaveTimer || 0));
      btn.textContent = sec > 0 ? `提前开波 (${sec}s)` : "开始下一波";
      btn.disabled = false;
    } else {
      btn.textContent = "等待中…";
      btn.disabled = true;
    }
  }

  renderTowerInfo() {
    const box = this.$("tower-info");
    const t = this.game.selectedTower;
    const typeId = this.game.selectedTowerType;

    if (t) {
      const upCost = t.upgradeCost;
      box.innerHTML = `
        <div class="selected-tower-panel">
          <div class="st-icon">${t.def.icon}</div>
          <div class="st-details">
            <div class="st-name">${t.def.name} · Lv.${t.level}/${t.def.maxLevel}</div>
            <div class="st-stats">
              伤害 ${t.damage} · 射程 ${Math.round(t.range)} · 射速 ${(1 / t.fireRate).toFixed(1)}/s
              ${t.def.special === "splash" ? ` · 爆炸 ${Math.round(t.splash)}` : ""}
              ${t.def.special === "slow" ? " · 减速" : ""}
            </div>
          </div>
          <div class="st-actions">
            <button class="btn btn-primary btn-sm" id="btn-upgrade" ${upCost == null || this.game.gold < upCost ? "disabled" : ""}>
              ${upCost == null ? "已满级" : `升级 ${upCost}💰`}
            </button>
            <button class="btn btn-sell btn-sm" id="btn-sell">出售 +${t.sellValue}</button>
          </div>
        </div>
      `;
      this.$("btn-upgrade")?.addEventListener("click", () => {
        this.game.upgradeSelected();
        this.renderTowerInfo();
      });
      this.$("btn-sell")?.addEventListener("click", () => {
        this.game.sellSelected();
        this.renderTowerInfo();
      });
      return;
    }

    if (typeId) {
      const def = TOWER_TYPES[typeId];
      box.innerHTML = `
        <div class="selected-tower-panel">
          <div class="st-icon">${def.icon}</div>
          <div class="st-details">
            <div class="st-name">建造：${def.name}（${def.cost}💰）</div>
            <div class="st-stats">${def.description}<br>
              伤害 ${def.damage} · 射程 ${def.range} · 冷却 ${def.fireRate}s
            </div>
          </div>
        </div>
      `;
      return;
    }

    box.innerHTML = `<div class="info-placeholder">拖拽底部防御塔到地图建造，或点击已有塔升级</div>`;
  }

  onTowerPlacedOrSelected() {
    this.refreshShopSelection();
    this.renderTowerInfo();
  }
}
