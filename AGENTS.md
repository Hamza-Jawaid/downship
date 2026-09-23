- Goal: Build a high-performance 2D browser shooter.

Rule 1: Enforce strict TypeScript typing to prevent runtime errors.

Rule 2: Prioritize 60+ FPS without garbage collection stutters.

Rule 3: Use Object Pooling for projectiles and enemies (do not use frequent instantiate/destroy calls).

Rule 4: Use lightweight math (AABB) for collisions, NO heavy physics engines.
