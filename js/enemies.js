/**
 * 敌人类型定义与敌人实例
 */
const ENEMY_TYPES = {
  basic: {
    name: "步兵",
    hp: 40,
    speed: 70,
    reward: 8,
    score: 10,
    radius: 12,
    color: "#ef5350",
    colorDark: "#c62828",
    armor: 0,
  },
  fast: {
    name: "斥候",
    hp: 22,
    speed: 130,
    reward: 10,
    score: 15,
    radius: 10,
    color: "#ffca28",
    colorDark: "#f9a825",
    armor: 0,
  },
  tank: {
    name: "重装",
    hp: 160,
    speed: 42,
    reward: 22,
    score: 30,
    radius: 16,
    color: "#7e57c2",
    colorDark: "#5e35b1",
    armor: 2,
  },
  armored: {
    name: "装甲",
    hp: 100,
    speed: 55,
    reward: 18,
    score: 25,
    radius: 14,
    color: "#78909c",
    colorDark: "#546e7a",
    armor: 5,
  },
  boss: {
    name: "首领",
    hp: 900,
    speed: 35,
    reward: 120,
    score: 200,
    radius: 22,
    color: "#ff1744",
    colorDark: "#b71c1c",
    armor: 4,
  },
};

/** 关卡缩放：每关敌人变强 */
function scaleEnemyStats(type, levelIndex) {
  const base = ENEMY_TYPES[type];
  const mult = 1 + levelIndex * 0.28;
  return {
    ...base,
    type,
    maxHp: Math.round(base.hp * mult),
    hp: Math.round(base.hp * mult),
    speed: base.speed * (1 + levelIndex * 0.045),
    reward: Math.round(base.reward * (1 + levelIndex * 0.08)),
    score: Math.round(base.score * (1 + levelIndex * 0.12)),
  };
}

class Enemy {
  constructor(type, path, levelIndex) {
    const stats = scaleEnemyStats(type, levelIndex);
    this.type = type;
    this.name = stats.name;
    this.maxHp = stats.maxHp;
    this.hp = stats.hp;
    this.baseSpeed = stats.speed;
    this.speed = stats.speed;
    this.reward = stats.reward;
    this.scoreValue = stats.score;
    this.radius = stats.radius;
    this.color = stats.color;
    this.colorDark = stats.colorDark;
    this.armor = stats.armor;
    this.path = path;
    this.waypointIndex = 0;
    this.x = path[0].x;
    this.y = path[0].y;
    this.alive = true;
    this.reachedEnd = false;
    this.slowTimer = 0;
    this.slowFactor = 1;
    this.burnTimer = 0;
    this.burnDps = 0;
    this.progress = 0; // 用于瞄准优先级
    this.hitFlash = 0;
  }

  applySlow(factor, duration) {
    if (factor < this.slowFactor || this.slowTimer <= 0) {
      this.slowFactor = factor;
    }
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  applyBurn(dps, duration) {
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnTimer = Math.max(this.burnTimer, duration);
  }

  takeDamage(raw) {
    const dmg = Math.max(1, raw - this.armor);
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
    return dmg;
  }

  update(dt) {
    if (!this.alive || this.reachedEnd) return;

    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }
    this.speed = this.baseSpeed * this.slowFactor;

    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.takeDamage(this.burnDps * dt);
      if (this.burnTimer <= 0) this.burnDps = 0;
    }

    if (!this.alive) return;

    const target = this.path[this.waypointIndex + 1];
    if (!target) {
      this.reachedEnd = true;
      this.alive = false;
      return;
    }

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const move = this.speed * dt;

    if (dist <= move) {
      this.x = target.x;
      this.y = target.y;
      this.waypointIndex++;
      this.progress = this.waypointIndex;
      if (this.waypointIndex >= this.path.length - 1) {
        this.reachedEnd = true;
        this.alive = false;
      }
    } else {
      this.x += (dx / dist) * move;
      this.y += (dy / dist) * move;
      this.progress = this.waypointIndex + (1 - dist / (dist + move));
    }
  }

  draw(ctx) {
    if (!this.alive && !this.reachedEnd) return;

    const r = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);

    // 阴影
    ctx.beginPath();
    ctx.ellipse(0, r * 0.7, r * 0.7, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();

    // 减速光环
    if (this.slowFactor < 1) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(77, 208, 225, 0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 燃烧
    if (this.burnTimer > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, r + 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 120, 40, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 身体
    const flash = this.hitFlash > 0;
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
    grad.addColorStop(0, flash ? "#fff" : this.color);
    grad.addColorStop(1, flash ? this.color : this.colorDark);

    ctx.beginPath();
    if (this.type === "boss") {
      // 六边形首领
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (this.type === "tank" || this.type === "armored") {
      const rr = 4;
      const w = r * 2;
      const h = r * 2;
      const x0 = -r;
      const y0 = -r;
      ctx.moveTo(x0 + rr, y0);
      ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, rr);
      ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, rr);
      ctx.arcTo(x0, y0 + h, x0, y0, rr);
      ctx.arcTo(x0, y0, x0 + w, y0, rr);
      ctx.closePath();
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 装甲标记
    if (this.armor > 0) {
      ctx.strokeStyle = "rgba(200,220,255,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, r - 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 眼睛
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.2, r * 0.18, 0, Math.PI * 2);
    ctx.arc(r * 0.3, -r * 0.2, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.2, r * 0.1, 0, Math.PI * 2);
    ctx.arc(r * 0.35, -r * 0.2, r * 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // 血条
    if (this.hp < this.maxHp) {
      const barW = Math.max(28, r * 2.2);
      const barH = 4;
      const bx = this.x - barW / 2;
      const by = this.y - r - 10;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      const ratio = this.hp / this.maxHp;
      ctx.fillStyle = ratio > 0.5 ? "#66bb6a" : ratio > 0.25 ? "#ffca28" : "#ef5350";
      ctx.fillRect(bx, by, barW * ratio, barH);
    }

    // Boss 名称
    if (this.type === "boss") {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "bold 11px Noto Sans SC, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.name, this.x, this.y - r - 16);
    }
  }
}
