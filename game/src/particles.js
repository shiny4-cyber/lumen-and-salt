// Particles: exhaust bubbles, drifting silt, cut sparks and collapse debris. Each pool is a
// fixed array of plain records updated in the fixed step; the renderer only reads them, so
// nothing here touches the canvas.

const MAX = { bubbles: 220, silt: 180, sparks: 160, debris: 90 };

function makePool(size) {
  const pool = [];
  for (let index = 0; index < size; index += 1) {
    pool.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, tone: 0 });
  }
  return pool;
}

export function createParticles(random) {
  return {
    bubbles: makePool(MAX.bubbles),
    silt: makePool(MAX.silt),
    sparks: makePool(MAX.sparks),
    debris: makePool(MAX.debris),
    random,
    /** A thinning silt field around the player, respawned above him as he descends. */
    seedSilt(x, y, count) {
      for (let index = 0; index < count; index += 1) {
        const grain = this.silt[index];
        grain.active = true;
        grain.x = x + (random() - 0.5) * 1500;
        grain.y = y + (random() - 0.5) * 1300;
        grain.vx = (random() - 0.5) * 14;
        grain.vy = 6 + random() * 16;
        grain.size = 0.7 + random() * 1.8;
        grain.life = 1;
        grain.maxLife = 1;
        grain.tone = random();
      }
    },
    spawnBubble(x, y, vx, vy, size = 3) {
      const bubble = this.bubbles.find((item) => !item.active) ?? this.bubbles[0];
      bubble.active = true;
      bubble.x = x;
      bubble.y = y;
      bubble.vx = vx;
      bubble.vy = vy;
      bubble.size = size;
      bubble.life = 0.9 + random() * 0.9;
      bubble.maxLife = bubble.life;
    },
    spawnSpark(x, y, colour) {
      const spark = this.sparks.find((item) => !item.active) ?? this.sparks[0];
      const angle = random() * Math.PI * 2;
      const speed = 40 + random() * 150;
      spark.active = true;
      spark.x = x;
      spark.y = y;
      spark.vx = Math.cos(angle) * speed;
      spark.vy = Math.sin(angle) * speed;
      spark.life = 0.35 + random() * 0.4;
      spark.maxLife = spark.life;
      spark.size = 1 + random() * 2;
      spark.tone = colour === 'amber' ? 1 : 0;
    },
    spawnDebris(x, y, vx, vy, size) {
      const piece = this.debris.find((item) => !item.active) ?? this.debris[0];
      piece.active = true;
      piece.x = x;
      piece.y = y;
      piece.vx = vx;
      piece.vy = vy;
      piece.size = size;
      piece.life = 1.6 + random() * 1.4;
      piece.maxLife = piece.life;
      piece.tone = random();
    },
    step(dt, playerX, playerY, depth) {
      for (const bubble of this.bubbles) {
        if (!bubble.active) continue;
        bubble.life -= dt;
        if (bubble.life <= 0) {
          bubble.active = false;
          continue;
        }
        bubble.vy -= 34 * dt;
        bubble.vx *= 1 - 1.1 * dt;
        bubble.x += bubble.vx * dt;
        bubble.y += bubble.vy * dt;
      }
      for (const grain of this.silt) {
        if (!grain.active) continue;
        grain.x += grain.vx * dt;
        grain.y += grain.vy * dt;
        if (grain.y > playerY + 760) {
          grain.y = playerY - 620 - random() * 180;
          grain.x = playerX + (random() - 0.5) * 1500;
        } else if (grain.y < playerY - 700) {
          grain.y = playerY + 700;
          grain.x = playerX + (random() - 0.5) * 1500;
        }
      }
      for (const spark of this.sparks) {
        if (!spark.active) continue;
        spark.life -= dt;
        if (spark.life <= 0) {
          spark.active = false;
          continue;
        }
        spark.vx *= 1 - 2.4 * dt;
        spark.vy = spark.vy * (1 - 2.4 * dt) - 26 * dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
      }
      for (const piece of this.debris) {
        if (!piece.active) continue;
        piece.life -= dt;
        if (piece.life <= 0) {
          piece.active = false;
          continue;
        }
        piece.vy += 130 * dt;
        piece.vx *= 1 - 0.8 * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
      }
    },
    clear() {
      for (const pool of [this.bubbles, this.silt, this.sparks, this.debris]) {
        for (const item of pool) item.active = false;
      }
    },
  };
}

export { MAX as PARTICLE_MAX };
