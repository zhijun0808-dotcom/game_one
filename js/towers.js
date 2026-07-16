/**
 * 防御塔类型、实例与子弹
 */
const TOWER_TYPES = {
  arrow: {
    id: "arrow",
    name: "箭塔",
    icon: "🏹",
    cost: 50,
    description: "均衡单体输出，射速快",
    color: "#42a5f5",
    colorDark: "#1565c0",
    range: 140,
    damage: 12,
    fireRate: 0.55,
    projectileSpeed: 420,
    upgradeCost: [40, 60, 90],
    maxLevel: 3,
    sellRatio: 0.6,
    special: null,
  },
  cannon: {
    id: "cannon",
    name: "炮塔",
    icon: "💣",
    cost: 90,
    description: "范围爆炸伤害，克制群怪",
    color: "#ff7043",
    colorDark: "#d84315",
    range: 120,
    damage: 28,
    fireRate: 1.2,
    projectileSpeed: 300,
    splash: 55,
    upgradeCost: [70, 100, 140],
    maxLevel: 3,
    sellRatio: 0.55,
    special: "splash",
  },
  ice: {
    id: "ice",
    name: "冰塔",
    icon: "❄️",
    cost: 75,
    description: "减速敌人，便于集火",
    color: "#4dd0e1",
    colorDark: "#00838f",
    range: 130,
    damage: 6,
    fireRate: 0.7,
    projectileSpeed: 360,
    slowFactor: 0.45,
    slowDuration: 1.8,
    upgradeCost: [55, 85, 120],
    maxLevel: 3,
    sellRatio: 0.55,
    special: "slow",
  },
  laser: {
    id: "laser",
    name: "激光塔",
    icon: "⚡",
    cost: 120,
    description: "高伤贯穿射线，秒杀脆皮",
    color: "#ab47bc",
    colorDark: "#6a1b9a",
    range: 160,
    damage: 18,
    fireRate: 0.9,
    projectileSpeed: 0,
    upgradeCost: [90, 130, 180],
    maxLevel: 3,
    sellRatio: 0.5,
    special: "laser",
  },
};

const TOWER_ORDER = ["arrow", "cannon", "ice", "laser"];

function getTowerUpgradeMult(level) {
  // level 0,1,2,3
  return 1 + level * 0.35;
}

class Projectile {
  constructor(x, y, target, damage, speed, color, splash = 0, slow = null, onHit = null) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.color = color;
    this.splash = splash;
    this.slow = slow;
    this.onHit = onHit;
    this.alive = true;
    this.radius = splash > 0 ? 6 : 4;
    // 目标死亡时朝最后位置飞
    this.tx = target.x;
    this.ty = target.y;
  }

  update(dt, enemies) {
    if (!this.alive) return;

    if (this.target && this.target.alive) {
      this.tx = this.target.x;
      this.ty = this.target.y;
    }

    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy);
    const move = this.speed * dt;

    if (dist <= move || dist < 4) {
      this.impact(enemies);
      this.alive = false;
      return;
    }
    this.x += (dx / dist) * move;
    this.y += (dy / dist) * move;
  }

  impact(enemies) {
    if (this.splash > 0) {
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - this.tx, e.y - this.ty);
        if (d <= this.splash) {
          const falloff = 1 - (d / this.splash) * 0.4;
          e.takeDamage(this.damage * falloff);
          if (this.slow) e.applySlow(this.slow.factor, this.slow.duration);
        }
      }
    } else if (this.target && this.target.alive) {
      this.target.takeDamage(this.damage);
      if (this.slow) this.target.applySlow(this.slow.factor, this.slow.duration);
    }
    if (this.onHit) this.onHit(this.tx, this.ty);
  }

  draw(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }
}

class LaserBeam {
  constructor(x, y, target, damage, color, duration = 0.12) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.tx = target.x;
    this.ty = target.y;
    this.damage = damage;
    this.color = color;
    this.life = duration;
    this.maxLife = duration;
    this.alive = true;
    this.hit = false;
  }

  update(dt) {
    this.life -= dt;
    if (!this.hit && this.target && this.target.alive) {
      this.target.takeDamage(this.damage);
      this.hit = true;
      this.tx = this.target.x;
      this.ty = this.target.y;
    }
    if (this.life <= 0) this.alive = false;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = 0.4 + alpha * 0.6;
    ctx.lineWidth = 2 + alpha * 3;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.tx, this.ty);
    ctx.stroke();
    // 末端光点
    ctx.beginPath();
    ctx.arc(this.tx, this.ty, 4 + alpha * 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color, count = 8) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const sp = 40 + Math.random() * 80;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.25,
        maxLife: 0.55,
        r: 2 + Math.random() * 3,
        color,
      });
    }
    this.alive = true;
  }

  update(dt) {
    let any = false;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      if (p.life > 0) any = true;
    }
    this.alive = any;
  }

  draw(ctx) {
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

class Tower {
  constructor(typeId, col, row) {
    const def = TOWER_TYPES[typeId];
    this.typeId = typeId;
    this.def = def;
    this.col = col;
    this.row = row;
    this.x = col * TILE + TILE / 2;
    this.y = row * TILE + TILE / 2;
    this.level = 0;
    this.cooldown = 0;
    this.target = null;
    this.angle = 0;
    this.totalInvested = def.cost;
  }

  get range() {
    return this.def.range * (1 + this.level * 0.08);
  }

  get damage() {
    return Math.round(this.def.damage * getTowerUpgradeMult(this.level));
  }

  get fireRate() {
    return this.def.fireRate * (1 - this.level * 0.08);
  }

  get splash() {
    return (this.def.splash || 0) * (1 + this.level * 0.1);
  }

  get upgradeCost() {
    if (this.level >= this.def.maxLevel) return null;
    return this.def.upgradeCost[this.level];
  }

  get sellValue() {
    return Math.floor(this.totalInvested * this.def.sellRatio);
  }

  canUpgrade() {
    return this.level < this.def.maxLevel;
  }

  upgrade() {
    const cost = this.upgradeCost;
    if (cost == null) return false;
    this.totalInvested += cost;
    this.level++;
    return true;
  }

  findTarget(enemies) {
    let best = null;
    let bestProg = -1;
    const range = this.range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= range && e.progress > bestProg) {
        bestProg = e.progress;
        best = e;
      }
    }
    return best;
  }

  update(dt, enemies, projectiles, effects) {
    if (this.cooldown > 0) this.cooldown -= dt;

    this.target = this.findTarget(enemies);
    if (this.target) {
      this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    }

    if (this.cooldown <= 0 && this.target) {
      this.fire(projectiles, effects);
      this.cooldown = this.fireRate;
    }
  }

  fire(projectiles, effects) {
    const t = this.target;
    if (!t) return;

    if (this.def.special === "laser") {
      projectiles.push(
        new LaserBeam(this.x, this.y, t, this.damage, this.def.color)
      );
      return;
    }

    const slow =
      this.def.special === "slow"
        ? {
            factor: this.def.slowFactor * (1 - this.level * 0.05),
            duration: this.def.slowDuration + this.level * 0.3,
          }
        : null;

    const splash = this.def.special === "splash" ? this.splash : 0;

    projectiles.push(
      new Projectile(
        this.x,
        this.y,
        t,
        this.damage,
        this.def.projectileSpeed,
        this.def.color,
        splash,
        slow,
        splash > 0
          ? (x, y) => effects.push(new Particle(x, y, this.def.color, 10))
          : null
      )
    );
  }

  draw(ctx, selected = false, showRange = false) {
    const r = 18 + this.level * 2;

    // 射程圈
    if (showRange || selected) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
      ctx.fillStyle = selected
        ? "rgba(79, 195, 247, 0.1)"
        : "rgba(79, 195, 247, 0.06)";
      ctx.fill();
      ctx.strokeStyle = selected
        ? "rgba(79, 195, 247, 0.45)"
        : "rgba(79, 195, 247, 0.25)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 基座
    ctx.beginPath();
    ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = "#1a2030";
    ctx.fill();
    ctx.strokeStyle = selected ? "#4fc3f7" : "#3a4560";
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.stroke();

    // 塔身
    const grad = ctx.createRadialGradient(
      this.x - 4,
      this.y - 4,
      2,
      this.x,
      this.y,
      r
    );
    grad.addColorStop(0, this.def.color);
    grad.addColorStop(1, this.def.colorDark);
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 炮管
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle = this.def.colorDark;
    if (this.def.special === "laser") {
      ctx.fillRect(0, -3, r + 8, 6);
      ctx.fillStyle = this.def.color;
      ctx.fillRect(r + 4, -2, 6, 4);
    } else if (this.def.special === "splash") {
      ctx.fillRect(2, -5, r + 4, 10);
      ctx.beginPath();
      ctx.arc(r + 6, 0, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(0, -2.5, r + 10, 5);
    }
    ctx.restore();

    // 中心图标感
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${12 + this.level}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.def.icon, this.x, this.y);

    // 等级星
    if (this.level > 0) {
      ctx.fillStyle = "#ffd54f";
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("★".repeat(this.level), this.x, this.y + r + 10);
    }
  }

  containsPoint(px, py) {
    return Math.hypot(px - this.x, py - this.y) <= 24;
  }
}
