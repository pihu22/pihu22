const playerHpEl = document.getElementById("playerHp");
const botHpEl = document.getElementById("botHp");
const scoreEl = document.getElementById("score");
const weaponInfoEl = document.getElementById("weaponInfo");
const ammoInfoEl = document.getElementById("ammoInfo");
const reloadStateEl = document.getElementById("reloadState");
const dashStateEl = document.getElementById("dashState");
const statusEl = document.getElementById("status");
const overlayEl = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const hitFlashEl = document.getElementById("hitFlash");

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
document.body.appendChild(canvas);

const world = { width: 16, height: 16 };
const map = [
  "1111111111111111",
  "1000000000000001",
  "1000010000000001",
  "1000010000000001",
  "1000000000000001",
  "1000000011110001",
  "1000000000010001",
  "1001110000010001",
  "1000010000010001",
  "1000010000000001",
  "1000000000000001",
  "1000001111000001",
  "1000000000000001",
  "1000000000000001",
  "1000000000000001",
  "1111111111111111",
];
const weapons = {
  1: {
    name: "Rifle",
    damage: 16,
    cooldown: 0.22,
    magSize: 24,
    reloadTime: 1.4,
    reserve: 96,
    bulletColor: "#9fd0ff",
    trailColor: "#6fb2ff",
    bulletScale: 0.16,
    soundType: "square",
    soundFreq: 320,
    soundDuration: 0.06,
  },
  2: {
    name: "Burst SMG",
    damage: 9,
    cooldown: 0.11,
    magSize: 36,
    reloadTime: 1.1,
    reserve: 144,
    bulletColor: "#ffbf75",
    trailColor: "#ff7e33",
    bulletScale: 0.12,
    soundType: "sawtooth",
    soundFreq: 510,
    soundDuration: 0.04,
  },
};

const player = {
  x: 2.5,
  y: 2.5,
  angle: 0,
  hp: 100,
  speed: 3.4,
  rotSpeed: 2.3,
  fireCooldown: 0,
  dashCooldown: 0,
  currentWeapon: 1,
  weaponAmmo: {
    1: { mag: weapons[1].magSize, reserve: weapons[1].reserve },
    2: { mag: weapons[2].magSize, reserve: weapons[2].reserve },
  },
  isReloading: false,
  reloadTimer: 0,
};

const bot = {
  x: 12.5,
  y: 12.5,
  angle: Math.PI,
  hp: 100,
  speed: 2.2,
  fireCooldown: 0,
  thinkCooldown: 0,
  alive: true,
  keys: {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false,
  },
};

const keys = {};
const bullets = [];
const healthPickups = [];
let running = false;
let gameOver = false;
let lastTime = performance.now();
const fov = Math.PI / 3;
const numRays = 220;
const maxDepth = 20;
let playerSpawnProtection = 0;
let pointerLocked = false;
let hitFlash = 0;
let roundIndex = 1;
let playerWins = 0;
let botWins = 0;
let audioCtx;

function getRandomOpenPosition(minDistFromPlayer = 2, minDistFromBot = 2) {
  for (let tries = 0; tries < 250; tries += 1) {
    const x = 1.5 + Math.random() * (world.width - 3);
    const y = 1.5 + Math.random() * (world.height - 3);
    if (isWall(x, y)) continue;
    if (!canMoveTo(x, y, 0.25)) continue;
    if (Math.hypot(x - player.x, y - player.y) < minDistFromPlayer) continue;
    if (Math.hypot(x - bot.x, y - bot.y) < minDistFromBot) continue;
    return { x, y };
  }
  return { x: 8, y: 8 };
}

function seedHealthPickups() {
  healthPickups.length = 0;
  for (let i = 0; i < 3; i += 1) {
    const pos = getRandomOpenPosition(3, 3);
    healthPickups.push({
      x: pos.x,
      y: pos.y,
      value: 22,
      active: true,
      respawnTimer: 0,
    });
  }
}

function showOverlay() {
  overlayEl.classList.remove("hidden");
  canvas.style.pointerEvents = "none";
  document.body.style.cursor = "default";
  if (document.pointerLockElement && document.exitPointerLock) {
    document.exitPointerLock();
  }
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
  canvas.style.pointerEvents = "auto";
}

function getAudioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
}

function playWeaponSound(weaponId) {
  const ctxAudio = getAudioContext();
  if (!ctxAudio) return;
  const w = weapons[weaponId];
  const now = ctxAudio.currentTime;
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  osc.type = w.soundType;
  osc.frequency.setValueAtTime(w.soundFreq, now);
  osc.frequency.exponentialRampToValueAtTime(w.soundFreq * 0.72, now + w.soundDuration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + w.soundDuration);
  osc.connect(gain);
  gain.connect(ctxAudio.destination);
  osc.start(now);
  osc.stop(now + w.soundDuration + 0.01);
}

function isWall(x, y) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  if (mx < 0 || my < 0 || mx >= world.width || my >= world.height) return true;
  return map[my][mx] === "1";
}

function canMoveTo(x, y, r) {
  return (
    !isWall(x - r, y - r) &&
    !isWall(x + r, y - r) &&
    !isWall(x - r, y + r) &&
    !isWall(x + r, y + r)
  );
}

function updateHud(message) {
  playerHpEl.textContent = String(Math.max(0, Math.ceil(player.hp)));
  botHpEl.textContent = String(Math.max(0, Math.ceil(bot.hp)));
  scoreEl.textContent = `${playerWins} - ${botWins}`;
  const currentWeapon = weapons[player.currentWeapon];
  const ammoState = player.weaponAmmo[player.currentWeapon];
  weaponInfoEl.textContent = currentWeapon.name;
  ammoInfoEl.textContent = `${ammoState.mag} / ${ammoState.reserve}`;
  reloadStateEl.textContent = player.isReloading
    ? `${player.reloadTimer.toFixed(1)}s`
    : "Ready";
  reloadStateEl.style.color = player.isReloading ? "#ffd78c" : "#8fe39a";
  dashStateEl.textContent =
    player.dashCooldown <= 0 ? "Ready" : `${player.dashCooldown.toFixed(1)}s`;
  dashStateEl.style.color = player.dashCooldown <= 0 ? "#8fe39a" : "#ffd78c";
  hitFlashEl.style.background = `rgba(255, 80, 80, ${Math.min(0.35, hitFlash)})`;
  if (message) statusEl.textContent = message;
}

function startReload() {
  const currentWeapon = weapons[player.currentWeapon];
  const ammoState = player.weaponAmmo[player.currentWeapon];
  if (player.isReloading) return;
  if (ammoState.mag >= currentWeapon.magSize) return;
  if (ammoState.reserve <= 0) return;
  player.isReloading = true;
  player.reloadTimer = currentWeapon.reloadTime;
  updateHud("Reloading...");
}

function castRay(originX, originY, angle) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  for (let depth = 0; depth < maxDepth; depth += 0.02) {
    const x = originX + cos * depth;
    const y = originY + sin * depth;
    if (isWall(x, y)) return { dist: depth };
  }
  return { dist: maxDepth };
}

function canSee(fromX, fromY, toX, toY) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const ray = castRay(fromX, fromY, angle);
  return ray.dist >= dist - 0.12;
}

function normalizeAngle(a) {
  while (a < -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function tryShoot(shooter) {
  if (shooter.fireCooldown > 0 || gameOver) return;
  let damage = 10;
  let cooldown = 0.46;
  const angle = shooter === player ? player.angle : bot.angle;

  if (shooter === player) {
    if (player.isReloading) return;
    const ammoState = player.weaponAmmo[player.currentWeapon];
    if (ammoState.mag <= 0) {
      startReload();
      return;
    }
    const w = weapons[player.currentWeapon];
    damage = w.damage;
    cooldown = w.cooldown;
    ammoState.mag -= 1;
    playWeaponSound(player.currentWeapon);
    if (ammoState.mag <= 0) startReload();
    bullets.push({
      x: shooter.x,
      y: shooter.y,
      dx: Math.cos(angle) * 8,
      dy: Math.sin(angle) * 8,
      fromPlayer: true,
      damage,
      life: 1.8,
      color: w.bulletColor,
      trailColor: w.trailColor,
      sizeScale: w.bulletScale,
      weaponId: player.currentWeapon,
    });
    shooter.fireCooldown = cooldown;
    return;
  }

  bullets.push({
    x: shooter.x,
    y: shooter.y,
    dx: Math.cos(angle) * 8,
    dy: Math.sin(angle) * 8,
    fromPlayer: false,
    damage,
    life: 1.8,
    color: "#ffbc8c",
    trailColor: "#ff7a4a",
    sizeScale: 0.14,
  });
  shooter.fireCooldown = 0.46;
}

function updatePlayer(dt) {
  if (keys.ArrowLeft) player.angle -= player.rotSpeed * dt;
  if (keys.ArrowRight) player.angle += player.rotSpeed * dt;

  let forward = 0;
  let strafe = 0;
  if (keys.KeyW || keys.ArrowUp) forward += 1;
  if (keys.KeyS || keys.ArrowDown) forward -= 1;
  if (keys.KeyD) strafe += 1;
  if (keys.KeyA) strafe -= 1;

  const cos = Math.cos(player.angle);
  const sin = Math.sin(player.angle);
  const moveX = cos * forward - sin * strafe;
  const moveY = sin * forward + cos * strafe;
  const len = Math.hypot(moveX, moveY) || 1;
  const velX = (moveX / len) * player.speed * dt;
  const velY = (moveY / len) * player.speed * dt;

  const nx = player.x + velX;
  const ny = player.y + velY;
  if (canMoveTo(nx, player.y, 0.18)) player.x = nx;
  if (canMoveTo(player.x, ny, 0.18)) player.y = ny;

  if (keys.ShiftLeft && player.dashCooldown <= 0) {
    const dashDist = 1.2;
    const dx = (moveX / len) * dashDist;
    const dy = (moveY / len) * dashDist;
    const dashX = player.x + dx;
    const dashY = player.y + dy;
    if (canMoveTo(dashX, dashY, 0.18)) {
      player.x = dashX;
      player.y = dashY;
    }
    player.dashCooldown = 2.2;
    keys.ShiftLeft = false;
    updateHud("Dash!");
  }

  if (keys.Space) tryShoot(player);
}

function updateReload(dt) {
  if (!player.isReloading) return;
  player.reloadTimer = Math.max(0, player.reloadTimer - dt);
  if (player.reloadTimer > 0) return;
  const weapon = weapons[player.currentWeapon];
  const ammoState = player.weaponAmmo[player.currentWeapon];
  const needed = weapon.magSize - ammoState.mag;
  const taken = Math.min(needed, ammoState.reserve);
  ammoState.mag += taken;
  ammoState.reserve -= taken;
  player.isReloading = false;
  updateHud("Reload complete");
}

function updateBot(dt) {
  if (!bot.alive || gameOver) return;

  const dx = player.x - bot.x;
  const dy = player.y - bot.y;
  const target = Math.atan2(dy, dx);
  const turn = normalizeAngle(target - bot.angle);
  const distance = Math.hypot(dx, dy);

  bot.thinkCooldown -= dt;
  if (bot.thinkCooldown <= 0) {
    bot.thinkCooldown = Math.max(0.08, 0.16 - roundIndex * 0.01);
    bot.keys.ArrowLeft = turn < -0.08;
    bot.keys.ArrowRight = turn > 0.08;
    bot.keys.ArrowUp = distance > 3.8;
    bot.keys.ArrowDown = distance < 2.4;
    bot.keys.Space =
      Math.abs(turn) < 0.2 &&
      distance < 12 &&
      playerSpawnProtection <= 0 &&
      canSee(bot.x, bot.y, player.x, player.y);
  }

  if (bot.keys.ArrowLeft) bot.angle -= (1.6 + roundIndex * 0.08) * dt;
  if (bot.keys.ArrowRight) bot.angle += (1.6 + roundIndex * 0.08) * dt;

  let move = 0;
  if (bot.keys.ArrowUp) move += 1;
  if (bot.keys.ArrowDown) move -= 1;
  const nx = bot.x + Math.cos(bot.angle) * move * bot.speed * (1 + roundIndex * 0.05) * dt;
  const ny = bot.y + Math.sin(bot.angle) * move * bot.speed * (1 + roundIndex * 0.05) * dt;
  if (canMoveTo(nx, bot.y, 0.2)) bot.x = nx;
  if (canMoveTo(bot.x, ny, 0.2)) bot.y = ny;

  if (bot.keys.Space) tryShoot(bot);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.x += b.dx * dt;
    b.y += b.dy * dt;
    b.life -= dt;

    if (isWall(b.x, b.y) || b.life <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    const tx = b.fromPlayer ? bot.x : player.x;
    const ty = b.fromPlayer ? bot.y : player.y;
    if (Math.hypot(b.x - tx, b.y - ty) < 0.28) {
      if (b.fromPlayer && bot.alive) {
        bot.hp -= b.damage;
        if (bot.hp <= 0) {
          bot.alive = false;
          gameOver = true;
          playerWins += 1;
          roundIndex += 1;
          updateHud("You win! Next round harder.");
          running = false;
          startBtn.textContent = "Play Again";
          showOverlay();
        } else {
          updateHud("Hit!");
        }
      } else if (!b.fromPlayer && player.hp > 0) {
        if (playerSpawnProtection > 0) {
          bullets.splice(i, 1);
          continue;
        }
        player.hp -= b.damage;
        hitFlash = 0.45;
        if (player.hp <= 0) {
          gameOver = true;
          botWins += 1;
          roundIndex += 1;
          updateHud("Bot wins!");
          running = false;
          startBtn.textContent = "Play Again";
          showOverlay();
        } else {
          updateHud("You got hit!");
        }
      }
      bullets.splice(i, 1);
    }
  }
}

function updateHealthPickups(dt) {
  for (const pickup of healthPickups) {
    if (!pickup.active) {
      pickup.respawnTimer = Math.max(0, pickup.respawnTimer - dt);
      if (pickup.respawnTimer <= 0) {
        const pos = getRandomOpenPosition(2.8, 2.8);
        pickup.x = pos.x;
        pickup.y = pos.y;
        pickup.active = true;
      }
      continue;
    }

    if (Math.hypot(player.x - pickup.x, player.y - pickup.y) < 0.42 && player.hp < 100) {
      player.hp = Math.min(100, player.hp + pickup.value);
      pickup.active = false;
      pickup.respawnTimer = 8 + Math.random() * 4;
      updateHud("+HP pickup");
    }
  }
}

function drawWorld() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#172238";
  ctx.fillRect(0, 0, w, h / 2);
  ctx.fillStyle = "#0f1320";
  ctx.fillRect(0, h / 2, w, h / 2);

  for (let i = 0; i < numRays; i += 1) {
    const rayAngle = player.angle - fov / 2 + (i / numRays) * fov;
    const ray = castRay(player.x, player.y, rayAngle);
    const corrected = ray.dist * Math.cos(rayAngle - player.angle);
    const wallH = Math.min(h, (h * 0.9) / Math.max(corrected, 0.0001));
    const x = (i / numRays) * w;
    const shade = Math.max(28, 170 - corrected * 14);
    ctx.fillStyle = `rgb(${shade},${shade + 10},${Math.floor(shade * 1.08)})`;
    ctx.fillRect(x, h / 2 - wallH / 2, w / numRays + 1, wallH);
  }
}

function drawSprite(wx, wy, color, sizeScale) {
  const dx = wx - player.x;
  const dy = wy - player.y;
  const dist = Math.hypot(dx, dy);
  const angleTo = Math.atan2(dy, dx);
  const rel = normalizeAngle(angleTo - player.angle);
  if (Math.abs(rel) > fov / 1.8 || dist < 0.2) return;

  const ray = castRay(player.x, player.y, angleTo);
  if (ray.dist < dist - 0.1) return;

  const sx = (rel / (fov / 2)) * (canvas.width / 2) + canvas.width / 2;
  const sh = (canvas.height * sizeScale) / dist;
  const sw = sh * 0.6;
  ctx.fillStyle = color;
  ctx.fillRect(sx - sw / 2, canvas.height / 2 - sh / 2, sw, sh);
}

function projectToScreen(wx, wy) {
  const dx = wx - player.x;
  const dy = wy - player.y;
  const dist = Math.hypot(dx, dy);
  const angleTo = Math.atan2(dy, dx);
  const rel = normalizeAngle(angleTo - player.angle);
  if (Math.abs(rel) > fov / 1.8 || dist < 0.2) return null;

  const ray = castRay(player.x, player.y, angleTo);
  if (ray.dist < dist - 0.1) return null;

  const sx = (rel / (fov / 2)) * (canvas.width / 2) + canvas.width / 2;
  return { sx, dist };
}

function drawHumanSprite(wx, wy, scale = 0.72) {
  const projected = projectToScreen(wx, wy);
  if (!projected) return;

  const { sx, dist } = projected;
  const fullH = (canvas.height * scale) / dist;
  const centerY = canvas.height / 2;
  const t = performance.now() * 0.005;
  const pulse = 0.9 + Math.sin(t) * 0.1;

  const torsoW = fullH * 0.24;
  const torsoH = fullH * 0.34;
  const legW = fullH * 0.085;
  const legH = fullH * 0.25;
  const armW = fullH * 0.07;
  const armH = fullH * 0.19;
  const headR = fullH * 0.16;

  const torsoX = sx - torsoW / 2;
  const torsoY = centerY - torsoH * 0.2;
  const hipY = torsoY + torsoH;

  // Soft pastel glow for cute look.
  const glowR = fullH * 0.38 * pulse;
  const glow = ctx.createRadialGradient(sx, torsoY + torsoH * 0.5, 0, sx, torsoY + torsoH * 0.5, glowR);
  glow.addColorStop(0, "rgba(255, 170, 210, 0.34)");
  glow.addColorStop(1, "rgba(255, 170, 210, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, torsoY + torsoH * 0.5, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Rounded hoodie-like torso.
  ctx.fillStyle = "#ff8fbe";
  ctx.beginPath();
  ctx.roundRect(torsoX, torsoY, torsoW, torsoH, fullH * 0.08);
  ctx.fill();
  ctx.fillStyle = "#ffd5e8";
  ctx.fillRect(torsoX + torsoW * 0.28, torsoY + torsoH * 0.12, torsoW * 0.44, torsoH * 0.18);

  // Arms.
  ctx.fillStyle = "#ff9fca";
  ctx.beginPath();
  ctx.roundRect(torsoX - armW * 0.95, torsoY + fullH * 0.08, armW, armH, fullH * 0.05);
  ctx.roundRect(torsoX + torsoW - armW * 0.05, torsoY + fullH * 0.08, armW, armH, fullH * 0.05);
  ctx.fill();

  // Tiny toy-like blaster.
  ctx.fillStyle = "#b788ff";
  ctx.fillRect(torsoX + torsoW + armW * 0.35, torsoY + torsoH * 0.35, armW * 0.85, armH * 0.42);
  ctx.fillStyle = "#f9e6ff";
  ctx.fillRect(torsoX + torsoW + armW * 0.65, torsoY + torsoH * 0.43, armW * 0.25, armH * 0.16);

  // Legs.
  ctx.fillStyle = "#8c7bff";
  ctx.beginPath();
  ctx.roundRect(sx - legW - fullH * 0.02, hipY, legW, legH, fullH * 0.03);
  ctx.roundRect(sx + fullH * 0.02, hipY, legW, legH, fullH * 0.03);
  ctx.fill();

  // Head.
  ctx.fillStyle = "#ffd9c6";
  ctx.beginPath();
  ctx.arc(sx, torsoY - headR * 0.48, headR, 0, Math.PI * 2);
  ctx.fill();

  // Cute hair band.
  ctx.fillStyle = "#7a4db7";
  ctx.beginPath();
  ctx.roundRect(sx - headR * 0.95, torsoY - headR * 1.28, headR * 1.9, headR * 0.45, headR * 0.2);
  ctx.fill();

  // Big cute eyes.
  const eyeY = torsoY - headR * 0.62;
  ctx.fillStyle = "#2f2450";
  ctx.beginPath();
  ctx.arc(sx - headR * 0.42, eyeY, headR * 0.17, 0, Math.PI * 2);
  ctx.arc(sx + headR * 0.42, eyeY, headR * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(sx - headR * 0.36, eyeY - headR * 0.05, headR * 0.05, 0, Math.PI * 2);
  ctx.arc(sx + headR * 0.48, eyeY - headR * 0.05, headR * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Blush + smile.
  ctx.fillStyle = "rgba(255, 133, 170, 0.75)";
  ctx.beginPath();
  ctx.arc(sx - headR * 0.62, eyeY + headR * 0.34, headR * 0.13, 0, Math.PI * 2);
  ctx.arc(sx + headR * 0.62, eyeY + headR * 0.34, headR * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7b4b59";
  ctx.lineWidth = Math.max(1, fullH * 0.006);
  ctx.beginPath();
  ctx.arc(sx, eyeY + headR * 0.35, headR * 0.24, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();
}

function drawBullets() {
  for (const b of bullets) {
    drawSprite(b.x, b.y, b.trailColor || "#ffb16d", (b.sizeScale || 0.14) * 1.45);
    drawSprite(b.x, b.y, b.color || "#ffffff", b.sizeScale || 0.14);
  }
}

function drawHealthPickups() {
  for (const pickup of healthPickups) {
    if (!pickup.active) continue;
    drawSprite(pickup.x, pickup.y, "#75ff91", 0.2);
  }
}

function drawBot() {
  if (!bot.alive) return;
  drawHumanSprite(bot.x, bot.y, 0.74);
}

function drawMiniMap() {
  const size = 150;
  const x0 = canvas.width - size - 12;
  const y0 = 12;
  const scale = size / world.width;

  ctx.fillStyle = "rgba(6, 10, 18, 0.8)";
  ctx.fillRect(x0, y0, size, size);

  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      if (map[y][x] === "1") {
        ctx.fillStyle = "#67718a";
        ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
      }
    }
  }

  ctx.fillStyle = "#8ed0ff";
  ctx.beginPath();
  ctx.arc(x0 + player.x * scale, y0 + player.y * scale, 4, 0, Math.PI * 2);
  ctx.fill();

  if (bot.alive) {
    ctx.fillStyle = "#ff7272";
    ctx.beginPath();
    ctx.arc(x0 + bot.x * scale, y0 + bot.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const pickup of healthPickups) {
    if (!pickup.active) continue;
    ctx.fillStyle = "#75ff91";
    ctx.beginPath();
    ctx.arc(x0 + pickup.x * scale, y0 + pickup.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (running && !gameOver) {
    playerSpawnProtection = Math.max(0, playerSpawnProtection - dt);
    hitFlash = Math.max(0, hitFlash - dt * 1.8);
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.dashCooldown = Math.max(0, player.dashCooldown - dt);
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
    updateReload(dt);
    updatePlayer(dt);
    updateBot(dt);
    updateBullets(dt);
    updateHealthPickups(dt);
    updateHud();
  }

  drawWorld();
  drawBot();
  drawBullets();
  drawHealthPickups();
  drawMiniMap();
  requestAnimationFrame(loop);
}

function resetGame() {
  player.x = 2.5;
  player.y = 2.5;
  player.angle = 0.6;
  player.hp = 100;
  player.fireCooldown = 0;
  player.currentWeapon = 1;
  player.weaponAmmo[1].mag = weapons[1].magSize;
  player.weaponAmmo[1].reserve = weapons[1].reserve;
  player.weaponAmmo[2].mag = weapons[2].magSize;
  player.weaponAmmo[2].reserve = weapons[2].reserve;
  player.isReloading = false;
  player.reloadTimer = 0;
  playerSpawnProtection = 2.2;

  bot.x = 12.5;
  bot.y = 12.5;
  bot.angle = Math.PI;
  bot.hp = 100;
  bot.fireCooldown = 0;
  bot.alive = true;

  bullets.length = 0;
  gameOver = false;
  player.dashCooldown = 0.4;
  seedHealthPickups();
  updateHud(`Round ${roundIndex} - Fight! (2s shield)`);
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function handleStart(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  resetGame();
  for (const key of Object.keys(keys)) keys[key] = false;
  const ctxAudio = getAudioContext();
  if (ctxAudio && ctxAudio.state === "suspended") ctxAudio.resume();
  running = true;
  hideOverlay();
  if (canvas.requestPointerLock) canvas.requestPointerLock();
  startBtn.textContent = "Start Game";
}

window.__startGame = handleStart;
startBtn.addEventListener("click", handleStart);
startBtn.addEventListener("pointerdown", handleStart);
startBtn.addEventListener("touchstart", handleStart, { passive: false });
canvas.addEventListener("click", () => {
  if (!pointerLocked && !overlayEl.classList.contains("hidden") && canvas.requestPointerLock) {
    canvas.requestPointerLock();
  }
});

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === canvas;
  document.body.style.cursor = pointerLocked ? "none" : "default";
  if (!pointerLocked && running && !gameOver) {
    running = false;
    for (const key of Object.keys(keys)) keys[key] = false;
    showOverlay();
    updateHud("Paused - click Start to continue");
    startBtn.textContent = "Resume";
  }
});

document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || !running) return;
  player.angle += e.movementX * 0.0026;
});

document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Digit1") {
    player.currentWeapon = 1;
    updateHud("Switched to Rifle");
  }
  if (e.code === "Digit2") {
    player.currentWeapon = 2;
    updateHud("Switched to Burst SMG");
  }
  if (e.code === "KeyR") {
    startReload();
  }
  if (e.code === "Space") e.preventDefault();
});

document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

window.addEventListener("resize", resize);

resize();
showOverlay();
updateHud("Ready - click Start");
requestAnimationFrame(loop);
