import './style.css';
import { Application, Assets, Sprite, Graphics, Container, Text } from 'pixi.js';
import gunmanUpperUrl from './assets/gunman/gunman_upper.svg';
import gunmanLowerUrl from './assets/gunman/gunman_lower.svg';
import ufoSvgUrl from './assets/ufo/ufo.svg';
import topBackUrl from './assets/gunman/top-back.svg';

(async () => {
  // Create a new application
  const app = new Application();

  // Initialize the application with dynamic resizing
  await app.init({
    resizeTo: window,
    backgroundColor: 0x1099bb,
  });

  // Append the application canvas to the document body
  document.body.appendChild(app.canvas);

  // Load the textures
  const gunmanUpperTexture = await Assets.load(gunmanUpperUrl);
  const gunmanLowerTexture = await Assets.load(gunmanLowerUrl);
  const ufoTexture = await Assets.load(ufoSvgUrl);
  const topBackTexture = await Assets.load(topBackUrl);

  // Create and setup the player container
  const playerContainer = new Container();
  playerContainer.scale.set(0.8);
  playerContainer.position.set(50, app.canvas.height - 50);
  app.stage.addChild(playerContainer);

  const playerLower = new Sprite(gunmanLowerTexture);
  playerLower.anchor.set(0.245, 0.5725);
  playerContainer.addChild(playerLower);

  const playerUpper = new Sprite(gunmanUpperTexture);
  playerUpper.anchor.set(0.245, 0.5725);
  playerContainer.addChild(playerUpper);

  // Handle window resizing to keep player at bottom-left
  window.addEventListener('resize', () => {
    playerContainer.position.set(50, app.canvas.height - 50);
  });

  // Mouse tracking logic for rotation
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  let mouseX = 0;
  let mouseY = 0;
  let targetAngle = 0;

  app.stage.on('pointermove', (e) => {
    mouseX = e.global.x;
    mouseY = e.global.y;

    // Calculate target angle between player upper body and mouse
    const dx = mouseX - playerContainer.x;
    const dy = mouseY - playerContainer.y;
    targetAngle = Math.atan2(dy, dx);
  });

  // --- LASER OBJECT POOLING ---

  interface Laser {
    graphics: Graphics;
    active: boolean;
    vx: number;
    vy: number;
  }

  const LASER_SPEED = 30; // 15 to 20 pixels per frame
  const lasers: Laser[] = [];

  // Initialize the laser pool with 50 inactive lasers
  for (let i = 0; i < 50; i++) {
    const graphics = new Graphics();
    graphics.rect(0, 0, 20, 4);
    graphics.fill(0xFFFFFF); // Pure white
    graphics.visible = false; // Initially inactive
    app.stage.addChild(graphics);

    lasers.push({
      graphics,
      active: false,
      vx: 0,
      vy: 0
    });
  }

  // --- UFO OBJECT POOLING & SPAWNING ---

  interface Ufo {
    sprite: Sprite;
    active: boolean;
    vx: number;
  }

  const ufos: Ufo[] = [];

  // Initialize the UFO pool with 20 inactive UFOs
  for (let i = 0; i < 20; i++) {
    const sprite = new Sprite(ufoTexture);
    sprite.scale.set(0.15); // Adjust scale as needed
    sprite.anchor.set(0.5);
    sprite.visible = false;
    app.stage.addChild(sprite);

    ufos.push({
      sprite,
      active: false,
      vx: 0
    });
  }

  // Spawning system and Game State
  let lastSpawnTime = 0;
  let gameStartTime = performance.now();
  let gameState = 'playing'; // 'playing' | 'gameover'
  let phase4SpawnCount = 0;
  let gameOverTimer = 0;

  const gameOverText = new Text({
    text: 'Time Up!\nRestarting in 5 seconds...',
    style: { fill: 0xffffff, align: 'center', fontSize: 36, fontWeight: 'bold' }
  });
  gameOverText.anchor.set(0.5);
  gameOverText.visible = false;
  app.stage.addChild(gameOverText);

  // Keep game over text centered
  window.addEventListener('resize', () => {
    gameOverText.x = app.canvas.width / 2;
    gameOverText.y = app.canvas.height / 2;
  });
  // Initial position
  gameOverText.x = app.canvas.width / 2;
  gameOverText.y = app.canvas.height / 2;

  // Fire laser on click
  app.stage.on('pointerdown', () => {
    // Find an inactive laser
    const laser = lasers.find(l => !l.active);
    if (laser && gameState === 'playing') {
      laser.active = true;
      laser.graphics.visible = true;

      // Calculate starting position (at the gun barrel, roughly offset by player's rotation)
      // Since the anchor is (0.245, 0.5725), we can estimate the barrel position:
      const barrelDistance = 100 * playerContainer.scale.x; // approximate distance to barrel
      let effectiveRotation = playerUpper.texture === topBackTexture ? playerUpper.rotation - Math.PI / 2 : playerUpper.rotation;
      const startX = playerContainer.x + Math.cos(effectiveRotation) * barrelDistance;
      const startY = playerContainer.y + Math.sin(effectiveRotation) * barrelDistance;

      laser.graphics.x = startX;
      laser.graphics.y = startY;
      laser.graphics.rotation = effectiveRotation;

      // Set velocity
      laser.vx = Math.cos(effectiveRotation) * LASER_SPEED;
      laser.vy = Math.sin(effectiveRotation) * LASER_SPEED;
    }
  });

  // --- GAME LOOP & COLLISIONS ---

  // Lightweight AABB Collision for PixiJS v8 Bounds (minX, maxX, minY, maxY)
  function checkAABBCollision(bounds1: { minX: number, maxX: number, minY: number, maxY: number }, bounds2: { minX: number, maxX: number, minY: number, maxY: number }) {
    return (
      bounds1.minX < bounds2.maxX &&
      bounds1.maxX > bounds2.minX &&
      bounds1.minY < bounds2.maxY &&
      bounds1.maxY > bounds2.minY
    );
  }

  app.ticker.add((time) => {
    const currentMs = performance.now();

    // Swap texture when looking up/back (e.g. angle < -Math.PI / 4)
    // The player is at bottom left, aiming at top right/top left
    // 0 is right, -PI/2 is straight up.
    let isAimingUp = targetAngle < -Math.PI / 6 && targetAngle > -Math.PI;
    if (isAimingUp) {
        if (playerUpper.texture !== topBackTexture) {
            playerUpper.texture = topBackTexture;
            playerUpper.anchor.set(0.54, 0.85); // Adjust anchor for the vertical orientation of top-back
            playerUpper.rotation += Math.PI / 2; // Immediately adjust rotation to prevent spinning effect
        }
    } else {
        if (playerUpper.texture !== gunmanUpperTexture) {
            playerUpper.texture = gunmanUpperTexture;
            playerUpper.anchor.set(0.245, 0.5725);
            playerUpper.rotation -= Math.PI / 2; // Immediately adjust rotation to prevent spinning effect
        }
    }

    // Calculate correct rotation for the texture orientation
    let displayAngle = isAimingUp ? targetAngle + Math.PI / 2 : targetAngle;

    // Smooth movement for playerUpper
    // Calculate the difference and normalize to [-PI, PI]
    let diff = displayAngle - playerUpper.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    playerUpper.rotation += diff * 0.1 * time.deltaTime;

    const elapsedMs = currentMs - gameStartTime;

    // Check game over
    const noActiveUfos = ufos.every(u => !u.active);
    if (gameState === 'playing' && (elapsedMs > 180000 || (phase4SpawnCount >= 5 && noActiveUfos))) {
      gameState = 'gameover';
      gameOverTimer = currentMs;
      gameOverText.visible = true;
    }

    if (gameState === 'gameover') {
      if (currentMs - gameOverTimer > 5000) {
        // Restart game
        gameStartTime = currentMs;
        phase4SpawnCount = 0;
        gameState = 'playing';
        gameOverText.visible = false;

        // Clear all
        for (const ufo of ufos) {
          ufo.active = false;
          ufo.sprite.visible = false;
        }
        for (const laser of lasers) {
          laser.active = false;
          laser.graphics.visible = false;
        }
      }
    }

    let currentSpawnInterval = 1000;
    let currentScale = 0.20;

    if (elapsedMs < 90000) {
      currentSpawnInterval = 1000;
      currentScale = 0.20;
    } else if (elapsedMs < 140000) {
      currentSpawnInterval = 800;
      currentScale = 0.28;
    } else if (elapsedMs < 170000) {
      currentSpawnInterval = 600;
      currentScale = 0.40;
    } else {
      currentSpawnInterval = 1500;
      currentScale = 0.60;
    }

    // Spawning UFOs
    if (currentMs - lastSpawnTime > currentSpawnInterval && gameState === 'playing') {
      lastSpawnTime = currentMs;

      let canSpawn = true;
      if (elapsedMs >= 170000) {
        if (phase4SpawnCount >= 5) {
          canSpawn = false;
        } else {
          phase4SpawnCount++;
        }
      }

      if (canSpawn) {
        const ufo = ufos.find(u => !u.active);
        if (ufo) {
          ufo.active = true;
          ufo.sprite.visible = true;
          ufo.sprite.scale.set(currentScale);
          ufo.sprite.x = app.canvas.width + ufo.sprite.width;
          // Random Y position, keep it somewhat within the upper/middle screen
          ufo.sprite.y = Math.random() * (app.canvas.height * 0.7) + 50;
          // Random speed between 2 and 4 pixels per frame
          ufo.vx = - (2 + Math.random() * 2);
        }
      }
    }

    // Move UFOs
    for (const ufo of ufos) {
      if (ufo.active) {
        // We use speed * time.deltaTime if we wanted time-based,
        // but simple frame-based per the rules: vx per frame.
        // Ticker provides `time.deltaTime` roughly ~1 at 60fps.
        ufo.sprite.x += ufo.vx * time.deltaTime;

        // Despawn off screen left
        if (ufo.sprite.x < -ufo.sprite.width) {
          ufo.active = false;
          ufo.sprite.visible = false;
        }
      }
    }

    // Move Lasers
    for (const laser of lasers) {
      if (laser.active) {
        laser.graphics.x += laser.vx * time.deltaTime;
        laser.graphics.y += laser.vy * time.deltaTime;

        // Despawn off screen bounds
        if (
          laser.graphics.x < -100 ||
          laser.graphics.x > app.canvas.width + 100 ||
          laser.graphics.y < -100 ||
          laser.graphics.y > app.canvas.height + 100
        ) {
          laser.active = false;
          laser.graphics.visible = false;
        }
      }
    }

    // Check collisions
    for (const laser of lasers) {
      if (!laser.active) continue;

      const lBounds = laser.graphics.getBounds();

      for (const ufo of ufos) {
        if (!ufo.active) continue;

        const uBounds = ufo.sprite.getBounds();

        if (checkAABBCollision(lBounds, uBounds)) {
          // Collision occurred!
          laser.active = false;
          laser.graphics.visible = false;

          ufo.active = false;
          ufo.sprite.visible = false;

          // Break inner loop as the laser is now destroyed
          break;
        }
      }
    }
  });

})();
