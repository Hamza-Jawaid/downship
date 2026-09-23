import './style.css';
import { Application, Assets, Sprite, Graphics } from 'pixi.js';
import gunmanSvgUrl from './assets/gunman/gunman.svg';
import ufoSvgUrl from './assets/ufo/ufo.svg';

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
  const gunmanTexture = await Assets.load(gunmanSvgUrl);
  const ufoTexture = await Assets.load(ufoSvgUrl);

  // Create and setup the player sprite
  const player = new Sprite(gunmanTexture);

  // Adjust scaling if the original SVG is too large
  player.scale.set(0.2);

  // Set anchor near the character's torso/shoulder
  player.anchor.set(0.2, 0.8);

  // Position at bottom-left corner
  player.position.set(0, app.canvas.height);

  // Add the player to the stage
  app.stage.addChild(player);

  // Handle window resizing to keep player at bottom-left
  window.addEventListener('resize', () => {
    player.position.set(0, app.canvas.height);
  });

  // Mouse tracking logic for rotation
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  let mouseX = 0;
  let mouseY = 0;

  app.stage.on('pointermove', (e) => {
    mouseX = e.global.x;
    mouseY = e.global.y;

    // Calculate angle between player and mouse
    const dx = mouseX - player.x;
    const dy = mouseY - player.y;
    const angle = Math.atan2(dy, dx);

    // Set rotation
    player.rotation = angle;
  });

  // --- LASER OBJECT POOLING ---

  interface Laser {
    graphics: Graphics;
    active: boolean;
    vx: number;
    vy: number;
  }

  const LASER_SPEED = 18; // 15 to 20 pixels per frame
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

  // Spawning system
  let lastSpawnTime = 0;
  const spawnInterval = 1000; // Spawn a UFO every 1 second

  // Fire laser on click
  app.stage.on('pointerdown', () => {
    // Find an inactive laser
    const laser = lasers.find(l => !l.active);
    if (laser) {
      laser.active = true;
      laser.graphics.visible = true;

      // Calculate starting position (at the gun barrel, roughly offset by player's rotation)
      // Since the anchor is (0.2, 0.8), we can estimate the barrel position:
      const barrelDistance = 100 * player.scale.x; // approximate distance to barrel
      const startX = player.x + Math.cos(player.rotation) * barrelDistance;
      const startY = player.y + Math.sin(player.rotation) * barrelDistance;

      laser.graphics.x = startX;
      laser.graphics.y = startY;
      laser.graphics.rotation = player.rotation;

      // Set velocity
      laser.vx = Math.cos(player.rotation) * LASER_SPEED;
      laser.vy = Math.sin(player.rotation) * LASER_SPEED;
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

    // Spawning UFOs
    if (currentMs - lastSpawnTime > spawnInterval) {
      lastSpawnTime = currentMs;
      const ufo = ufos.find(u => !u.active);
      if (ufo) {
        ufo.active = true;
        ufo.sprite.visible = true;
        ufo.sprite.x = app.canvas.width + ufo.sprite.width;
        // Random Y position, keep it somewhat within the upper/middle screen
        ufo.sprite.y = Math.random() * (app.canvas.height * 0.7) + 50;
        // Random speed between 2 and 4 pixels per frame
        ufo.vx = - (2 + Math.random() * 2);
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
