/**
 * 入口：初始化画布交互与游戏循环
 */
(function main() {
  const canvas = document.getElementById("game-canvas");
  const game = new Game(canvas);
  const ui = new UI(game);

  // 将 canvas 坐标从显示尺寸映射到内部分辨率
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener("mousemove", (e) => {
    if (game.state !== "playing" && game.state !== "paused") return;
    // 拖拽时由 UI 统一更新悬停格
    if (ui.drag?.active && ui.drag.moved) return;
    const { x, y } = getCanvasPos(e);
    const { col, row } = game.screenToGrid(x, y);
    game.setHover(col, row);
  });

  canvas.addEventListener("mouseleave", () => {
    if (ui.drag?.active && ui.drag.moved) return;
    game.setHover(-1, -1);
  });

  canvas.addEventListener("click", (e) => {
    if (game.state !== "playing") return;
    const { x, y } = getCanvasPos(e);
    const { col, row } = game.screenToGrid(x, y);

    if (game.selectedTowerType) {
      const built = game.tryBuild(col, row);
      ui.onTowerPlacedOrSelected();
      if (!built) {
        // 点到已有塔则选中
        const t = game.trySelectTower(x, y);
        if (t) ui.onTowerPlacedOrSelected();
      }
      return;
    }

    const t = game.trySelectTower(x, y);
    ui.onTowerPlacedOrSelected();
    if (!t) {
      // 点击空白取消选择
      game.selectedTower = null;
      ui.renderTowerInfo();
    }
  });

  // 触摸支持
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (game.state !== "playing") return;
      e.preventDefault();
      const { x, y } = getCanvasPos(e);
      const { col, row } = game.screenToGrid(x, y);
      game.setHover(col, row);

      if (game.selectedTowerType) {
        game.tryBuild(col, row);
        ui.onTowerPlacedOrSelected();
      } else {
        game.trySelectTower(x, y);
        ui.onTowerPlacedOrSelected();
      }
    },
    { passive: false }
  );

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (game.state === "playing") {
      game.update(dt);
    }
    if (game.state !== "idle") {
      game.draw();
    }

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 暴露调试（可选）
  window.__TD = { game, ui };
})();
