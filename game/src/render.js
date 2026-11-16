// The scene painter. It reads the world and draws it: trench water, distant hulls, silt,
// wrecks and their salvage, lures, the tether, the bathyscaphe, particles and the lamp's
// cone of light. It never changes the simulation — draw(world, view) is the only entry.

import { ELITE, PALETTE, SEMANTIC, TRENCH, VIEW } from './config.js';
import { eliteLane } from './elites.js';
import { chorusBand } from './chorus.js';
import { BANDS } from './environment.js';
import { clamp } from './mathx.js';
import { anchorAt, nodeAt } from './wrecks.js';

const GRADIENTS = new Map();

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const fit = Math.min(width / VIEW.width, height / VIEW.height);
    scale = fit * dpr;
    offsetX = ((width - VIEW.width * fit) / 2) * dpr;
    offsetY = ((height - VIEW.height * fit) / 2) * dpr;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.imageSmoothingEnabled = true;
  }

  resize();
  window.addEventListener('resize', resize);

  function camera(world) {
    const targetY = world.player.y - VIEW.height * 0.42;
    const targetX = clamp(world.player.x - VIEW.width * 0.5, 0, TRENCH.width - VIEW.width);
    return { x: targetX, y: targetY };
  }

  function draw(world, view) {
    const cam = view.camera ?? camera(world);
    const shake = world.shake;
    const shakeX = shake > 0 ? Math.sin(world.time * 61) * shake : 0;
    const shakeY = shake > 0 ? Math.cos(world.time * 53) * shake * 0.7 : 0;

    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-offsetX / scale, -offsetY / scale, VIEW.width + (offsetX * 2) / scale, VIEW.height + (offsetY * 2) / scale);

    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawWater(world, cam);
    drawGodRays(world, cam);
    drawDepthMarks(cam);
    drawDistantHulls(cam);
    if (cam.y < 220) drawSurface(cam);
    drawCurrents(world, cam);
    drawFarSilt(world, cam);
    drawSilt(world, cam);
    drawWrecks(world, cam);
    drawCache(world, cam);
    drawVents(world, cam);
    drawWells(world, cam);
    drawLures(world, cam);
    drawElites(world, cam);
    drawChoruses(world, cam);
    drawSonar(world, cam);
    drawFloaters(world, cam);
    drawCargo(world, cam);
    drawHook(world, cam);
    drawPlayer(world, cam);
    drawParticles(world, cam);
    drawLamp(world, cam);
    drawEnvironmentTint(world);
    drawVignette(world);
    drawDepthGauge(world);
    drawBandTransition(world);
    ctx.restore();
  }

  /** The water itself: a depth-tinted gradient, cached per 120 px of camera height. */
  function drawWater(world, cam) {
    const palette = world.environment?.palette ?? { haze: 'rgba(12, 74, 88, 0.10)' };
    const bucket = Math.round(cam.y / 120) * 120;
    let gradient = GRADIENTS.get(bucket);
    if (!gradient) {
      const depth = clamp(bucket / 3200, 0, 1);
      gradient = ctx.createLinearGradient(0, -40, VIEW.width * 0.35, VIEW.height + 40);
      gradient.addColorStop(0, mix('#0d4653', '#08222b', depth * 0.85));
      gradient.addColorStop(0.45, mix('#093a46', '#04171f', depth));
      gradient.addColorStop(1, mix('#062a34', '#02121a', 0.4 + depth * 0.6));
      GRADIENTS.set(bucket, gradient);
      if (GRADIENTS.size > 40) GRADIENTS.delete(GRADIENTS.keys().next().value);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Three soft horizontal haze bands give the column a sense of layered distance.
    const haze = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    haze.addColorStop(0, palette.haze ?? 'rgba(12, 74, 88, 0.10)');
    haze.addColorStop(0.5, 'rgba(4, 30, 40, 0.0)');
    haze.addColorStop(1, 'rgba(2, 16, 22, 0.16)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // The water itself eats the light: deeper frames sit darker, and the lamp earns its keep.
    const abyss = clamp(bucket / 4200, 0, 1);
    if (abyss > 0.02) {
      ctx.fillStyle = `rgba(2, 9, 13, ${0.52 * abyss})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    // A slow caustic shimmer near the surface, gone by 60 m.
    const shimmer = clamp(1 - cam.y / 900, 0, 1);
    if (shimmer > 0.02) {
      ctx.globalAlpha = 0.05 * shimmer;
      ctx.fillStyle = PALETTE.surfaceGlow;
      for (let index = 0; index < 6; index += 1) {
        const x = ((index * 233 + cam.y * 0.06) % (VIEW.width + 300)) - 150;
        ctx.beginPath();
        ctx.ellipse(x, 60 + index * 46, 180, 26, 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Metre ticks down the left wall: the diver always knows how deep he is. */
  function drawDepthMarks(cam) {
    const top = Math.floor(cam.y / 400) * 400;
    ctx.strokeStyle = 'rgba(120, 190, 185, 0.16)';
    ctx.fillStyle = 'rgba(150, 205, 200, 0.32)';
    ctx.lineWidth = 1;
    ctx.font = '13px "Consolas", monospace';
    for (let y = top; y < cam.y + VIEW.height + 400; y += 400) {
      const sy = y - cam.y;
      if (sy < -20 || sy > VIEW.height + 20) continue;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(54, sy);
      ctx.stroke();
      ctx.fillText(`${Math.round(Math.max(0, y) / TRENCH.pxPerMetre)} m`, 8, sy - 6);
    }
  }

  /** Far-off hull silhouettes, so the water is never an empty screen. */
  function drawDistantHulls(cam) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let index = 0; index < 7; index += 1) {
      const seed = index * 977;
      const driftY = ((seed % 2400) + cam.y * 0.35) % 2800;
      const y = -300 + driftY - (cam.y % 2800) + 600;
      const x = ((seed * 7) % 1500) - 100;
      if (y < -400 || y > VIEW.height + 400) continue;
      const width = 240 + (seed % 260);
      const height = 60 + (seed % 90);
      ctx.fillStyle = 'rgba(5, 26, 32, 0.85)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + width * 0.5, y - height * 0.55, x + width, y);
      ctx.lineTo(x + width * 0.86, y + height * 0.5);
      ctx.lineTo(x + width * 0.12, y + height * 0.44);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(46, 96, 104, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSurface(cam) {
    const y = TRENCH.surfaceY - cam.y;
    const gradient = ctx.createLinearGradient(0, y - 160, 0, y + 40);
    gradient.addColorStop(0, 'rgba(24, 118, 132, 0.85)');
    gradient.addColorStop(1, 'rgba(10, 65, 80, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y - 160, VIEW.width, 200);
    ctx.strokeStyle = 'rgba(150, 240, 230, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= VIEW.width; x += 16) {
      const wave = Math.sin(x * 0.02 + performance.now() * 0.0012) * 4;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  function drawCurrents(world, cam) {
    for (const band of world.currents) {
      const top = band.y - cam.y;
      if (top > VIEW.height || top + band.height < 0) continue;
      const drive = band.vertical ? 1 : band.x;
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = band.vertical ? '#2f9f9a' : '#3fb2c0';
      ctx.lineWidth = 1.4;
      for (let index = 0; index < 14; index += 1) {
        const x = ((index * 173 + world.time * 90 * drive) % (VIEW.width + 200)) - 100;
        const y = top + 20 + ((index * 61) % Math.max(40, band.height - 40));
        const length = band.vertical ? 0 : 18 + (index % 4) * 7;
        ctx.beginPath();
        if (band.vertical) {
          const vy = y + Math.sin(world.time * 2 + index) * 6;
          ctx.moveTo(x, vy);
          ctx.lineTo(x, vy + 22);
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + length * drive, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Slanted light shafts from the surface: only near the top, gone by about 70 m. */
  function drawGodRays(world, cam) {
    const sun = world.environment?.palette?.sun ?? 1;
    const strength = clamp(1 - cam.y / 1500, 0, 1) * sun;
    if (strength <= 0.02) return;
    if (strength <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let index = 0; index < 5; index += 1) {
      const drift = Math.sin(world.time * 0.18 + index * 1.7) * 26;
      const top = -120 - cam.y + index * 40;
      const x = 120 + index * 250 + drift;
      const width = 90 + (index % 3) * 40;
      const gradient = ctx.createLinearGradient(x, top, x + 150, top + 900);
      gradient.addColorStop(0, `rgba(150, 240, 226, ${0.16 * strength})`);
      gradient.addColorStop(0.55, `rgba(120, 220, 210, ${0.07 * strength})`);
      gradient.addColorStop(1, 'rgba(90, 200, 190, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x + width, top);
      ctx.lineTo(x + width + 190, top + 980);
      ctx.lineTo(x + 150, top + 980);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** The far silt layer: dimmer, slower, and parallaxed at half speed for depth. */
  function drawFarSilt(world, cam) {
    ctx.save();
    ctx.fillStyle = PALETTE.silt;
    for (let index = 0; index < 46; index += 1) {
      const spanX = VIEW.width + 200;
      const x = ((index * 271 + world.time * 7) % spanX) - 100;
      const y = ((index * 173 + cam.y * 0.45 + world.time * 11) % (VIEW.height + 200)) - 100;
      ctx.globalAlpha = 0.05 + (index % 5) * 0.012;
      ctx.beginPath();
      ctx.arc(x, y, 1 + (index % 3) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Silt vents: a quiet column at rest, a rising warning, then a bright upward blast. */
  function drawVents(world, cam) {
    for (const vent of world.vents) {
      const x = vent.x - cam.x;
      const y = vent.y - cam.y;
      if (x < -140 || x > VIEW.width + 140 || y < -260 || y > VIEW.height + 120) continue;
      ctx.save();
      const heat = vent.phase === 'blast' ? 1 : vent.phase === 'warning' ? 0.55 : 0.12;
      const gradient = ctx.createLinearGradient(x, y, x, y - vent.height);
      gradient.addColorStop(0, vent.phase === 'blast' ? `rgba(255, 96, 72, ${0.34 * heat})` : `rgba(214, 196, 150, ${0.24 * heat})`);
      gradient.addColorStop(1, 'rgba(180, 214, 200, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x - vent.radius, y);
      ctx.lineTo(x + vent.radius, y);
      ctx.lineTo(x + vent.radius * 0.5, y - vent.height);
      ctx.lineTo(x - vent.radius * 0.5, y - vent.height);
      ctx.closePath();
      ctx.fill();
      // The mouth of the vent reads as rock, not water: a dark ellipse with a rim.
      ctx.fillStyle = 'rgba(9, 26, 30, 0.95)';
      ctx.beginPath();
      ctx.ellipse(x, y, vent.radius, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = vent.phase === 'warning' ? SEMANTIC.warn : vent.phase === 'blast' ? SEMANTIC.hazard : 'rgba(168, 196, 192, 0.55)';
      ctx.lineWidth = vent.phase === 'idle' ? 1.4 : 2.6;
      ctx.stroke();
      for (let index = 0; index < 7; index += 1) {
        const rise = (world.time * (vent.phase === 'blast' ? 150 : 40) + index * 34) % vent.height;
        ctx.globalAlpha = 0.25 * heat + 0.1;
        ctx.fillStyle = PALETTE.silt;
        ctx.beginPath();
        ctx.arc(x + Math.sin(index + world.time) * 12, y - rise, 2 + (index % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Pressure wells: rings contracting toward a core; only the pull is dangerous. */
  function drawWells(world, cam) {
    for (const well of world.wells) {
      const x = well.x - cam.x;
      const y = well.y - cam.y;
      if (x < -240 || x > VIEW.width + 240 || y < -240 || y > VIEW.height + 240) continue;
      ctx.save();
      const pulling = well.phase === 'pull';
      const warning = well.phase === 'warning';
      ctx.globalCompositeOperation = 'lighter';
      for (let ring = 0; ring < 3; ring += 1) {
        const cycle = pulling ? (world.time * 1.6 + ring / 3) % 1 : (ring + 1) / 4;
        const radius = well.radius * (pulling ? 1 - cycle : cycle);
        ctx.strokeStyle = pulling ? `rgba(255, 82, 64, ${0.42 * (1 - cycle)})` : warning ? `rgba(255, 176, 96, ${0.32 * (1 - cycle)})` : `rgba(150, 178, 200, ${0.12 * (1 - cycle)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(6, radius), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      const core = ctx.createRadialGradient(x, y, 0, x, y, well.core * 2.4);
      core.addColorStop(0, pulling ? 'rgba(34, 6, 6, 0.96)' : 'rgba(6, 14, 18, 0.9)');
      core.addColorStop(1, 'rgba(10, 16, 24, 0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, well.core * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = warning ? SEMANTIC.warn : pulling ? SEMANTIC.hazard : 'rgba(160, 190, 210, 0.55)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, y, well.core, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** The deep band is colder and violet; the upper trench stays teal. */
  function drawEnvironmentTint(world) {
    const tint = world.environment?.palette?.tint;
    if (!tint) return;
    // A veil, not a dimmer: each band reads colder or warmer without going blind.
    ctx.save();
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.restore();
  }

  function drawSilt(world, cam) {
    ctx.save();
    for (const grain of world.particles.silt) {
      if (!grain.active) continue;
      const x = grain.x - cam.x;
      const y = grain.y - cam.y;
      if (x < -20 || x > VIEW.width + 20 || y < -20 || y > VIEW.height + 20) continue;
      ctx.globalAlpha = 0.3 + grain.tone * 0.35;
      ctx.fillStyle = grain.tone > 0.7 ? PALETTE.bio : PALETTE.silt;
      ctx.beginPath();
      ctx.arc(x, y, grain.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWrecks(world, cam) {
    for (const wreck of world.wrecks) {
      const x = wreck.x - cam.x;
      const y = wreck.y - cam.y;
      if (x < -wreck.half - 300 || x > VIEW.width + wreck.half + 300 || y < -260 || y > VIEW.height + 300) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(wreck.angle * 0.6);

      // The hull silhouette, then its lit edge, then the ribs.
      ctx.beginPath();
      const hull = wreck.hull;
      ctx.moveTo(hull[0].x, hull[0].y);
      for (let index = 1; index < hull.length; index += 1) ctx.lineTo(hull[index].x, hull[index].y);
      ctx.closePath();
      ctx.fillStyle = wreck.collapsing ? 'rgba(96, 40, 26, 0.98)' : 'rgba(58, 100, 110, 0.98)';
      ctx.fill();
      ctx.strokeStyle = wreck.hitFlash > 0 ? PALETTE.amberHot : 'rgba(214, 246, 238, 0.98)';
      ctx.lineWidth = 3.6;
      ctx.stroke();
      // A lit top edge and a shadowed belly: the hull reads by value, not by outline alone.
      ctx.save();
      ctx.clip();
      const belly = ctx.createLinearGradient(0, -wreck.height * 0.6, 0, wreck.height * 0.6);
      belly.addColorStop(0, 'rgba(150, 210, 205, 0.30)');
      belly.addColorStop(0.45, 'rgba(20, 44, 50, 0)');
      belly.addColorStop(1, 'rgba(2, 12, 16, 0.55)');
      ctx.fillStyle = belly;
      ctx.fillRect(-wreck.half - 10, -wreck.height, wreck.half * 2 + 20, wreck.height * 2);
      ctx.restore();

      ctx.strokeStyle = 'rgba(150, 214, 208, 0.55)';
      ctx.lineWidth = 1.3;
      const span = wreck.half * 1.5;
      for (let index = 1; index < wreck.ribs; index += 1) {
        const t = index / wreck.ribs;
        const rx = -wreck.half + span * t;
        const half = wreck.height * 0.5 * Math.sin(Math.PI * t) ** 0.55;
        ctx.beginPath();
        ctx.moveTo(rx, -half);
        ctx.lineTo(rx, half);
        ctx.stroke();
      }

      // Portholes: a few still have power, and they glow through the silt.
      for (let index = 0; index < 5; index += 1) {
        const px = -wreck.half * 0.7 + index * (wreck.half * 1.4) / 5;
        glowDot(ctx, px, -wreck.height * 0.12, 13, PALETTE.bio, 0.4);
        ctx.fillStyle = 'rgba(180, 245, 235, 0.85)';
        ctx.beginPath();
        ctx.arc(px, -wreck.height * 0.12, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Salvage still bolted to the hull.
      for (const node of wreck.nodes) {
        if (node.free) continue;
        const nx = node.ox;
        const ny = node.oy + Math.sin(world.time * 1.6 + node.wobble) * 2;
        // A dark plate under the piece, then a bright rim: the silhouette carries it.
        ctx.fillStyle = 'rgba(2, 9, 12, 0.9)';
        ctx.beginPath();
        ctx.arc(nx, ny, node.radius * 1.5, 0, Math.PI * 2);
        ctx.fill();
        glowDot(ctx, nx, ny, node.radius + 9, node.colour, 0.42);
        ctx.fillStyle = node.colour;
        drawSalvageShape(ctx, nx, ny, node.radius * 1.18, node.kind);
        ctx.strokeStyle = 'rgba(3, 12, 15, 0.95)';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.fillStyle = shadeHex(node.colour, 1.25);
        ctx.beginPath();
        ctx.arc(nx, ny, Math.max(1.8, node.radius * 0.26), 0, Math.PI * 2);
        ctx.fill();
        if (node.cut > 0) {
          ctx.strokeStyle = PALETTE.amberHot;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(nx, ny, node.radius + 8, -Math.PI / 2, -Math.PI / 2 + node.cut * Math.PI * 2);
          ctx.stroke();
        }
      }

      // Integrity cracks, and the cut arc on the piece being cut.
      const cracks = (wreck.maxIntegrity - wreck.integrity) / wreck.maxIntegrity;
      if (cracks > 0) {
        ctx.strokeStyle = `rgba(255, 122, 99, ${0.25 + cracks * 0.55})`;
        ctx.lineWidth = 1.6;
        for (let index = 0; index < Math.round(cracks * 4); index += 1) {
          const sx = -wreck.half * 0.4 + index * 26;
          ctx.beginPath();
          ctx.moveTo(sx, -wreck.height * 0.3);
          ctx.lineTo(sx + 8, 0);
          ctx.lineTo(sx - 4, wreck.height * 0.3);
          ctx.stroke();
        }
      }
      if (wreck.collapsing) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(world.time * 18);
        ctx.fillStyle = PALETTE.danger;
        ctx.fillRect(-wreck.half, -wreck.height * 0.62, wreck.half * 2, wreck.height * 1.24);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  function drawLures(world, cam) {
    for (const lure of world.lures) {
      const x = lure.x - cam.x;
      const y = lure.y - cam.y;
      if (x < -80 || x > VIEW.width + 80 || y < -80 || y > VIEW.height + 80) continue;
      const pulse = 0.6 + 0.4 * Math.sin(lure.pulse);
      const wake = lure.awake > 0;
      ctx.save();
      ctx.translate(x, y);
      glowDot(ctx, 0, 0, 44 + pulse * 10, wake ? PALETTE.danger : PALETTE.bio, 0.22);
      // Tendrils trail behind the lure, so its direction reads at a glance.
      ctx.strokeStyle = wake ? SEMANTIC.hazard : 'rgba(150, 255, 226, 0.75)';
      ctx.lineWidth = 1.8;
      for (let index = 0; index < 4; index += 1) {
        const phase = lure.pulse * 0.7 + index;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.quadraticCurveTo(Math.cos(phase) * 10, 16 + index * 5, Math.cos(phase + 1) * 6 - lure.vx * 0.05, 26 + index * 7);
        ctx.stroke();
      }
      ctx.fillStyle = wake ? '#3a0f0b' : '#06211d';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.quadraticCurveTo(6, -13, -8, -7);
      ctx.lineTo(-14, -13);
      ctx.lineTo(-12, -2);
      ctx.lineTo(-16, 2);
      ctx.lineTo(-14, 13);
      ctx.lineTo(-8, 7);
      ctx.quadraticCurveTo(6, 13, 16, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = wake ? SEMANTIC.threat : '#7dffcf';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // Two antennae and a tail fan: the silhouette says 'animal' at thumbnail size.
      ctx.beginPath();
      ctx.moveTo(12, -4);
      ctx.quadraticCurveTo(20, -16, 26, -20);
      ctx.moveTo(12, 4);
      ctx.quadraticCurveTo(20, 16, 26, 20);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = wake ? '#ff6b5a' : PALETTE.bio;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.4, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#04201f';
      ctx.beginPath();
      ctx.arc(-3.5, -1, 1.9, 0, Math.PI * 2);
      ctx.arc(3.5, -1, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** The glassmaw, and the lane it has locked: the telegraph is the whole fight. */
  function drawElites(world, cam) {
    for (const elite of world.elites) {
      const x = elite.x - cam.x;
      const y = elite.y - cam.y;
      if (x < -320 || x > VIEW.width + 320 || y < -320 || y > VIEW.height + 320) continue;
      if (elite.phase === 'windup') {
        // The danger lane: a hard-edged stripe that grows brighter as the charge nears.
        const lane = eliteLane(elite);
        const heat = 1 - elite.timer / ELITE.windup;
        ctx.save();
        ctx.globalAlpha = 0.18 + heat * 0.35;
        ctx.strokeStyle = SEMANTIC.hazard;
        ctx.lineWidth = 3 + heat * 5;
        ctx.setLineDash([16, 12]);
        ctx.beginPath();
        ctx.moveTo(lane.x1 - cam.x, lane.y1 - cam.y);
        ctx.lineTo(lane.x2 - cam.x, lane.y2 - cam.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.10 + heat * 0.12;
        ctx.fillStyle = SEMANTIC.hazard;
        ctx.beginPath();
        ctx.arc(x, y, elite.radius + 12 + heat * 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      const charge = elite.phase === 'dash';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(elite.angle);
      glowDot(ctx, 0, 0, 58, charge ? PALETTE.danger : SEMANTIC.threat, 0.3);
      // A long jawed silhouette: the shape reads even at thumbnail size.
      ctx.fillStyle = charge ? '#4a120c' : '#0b1d23';
      ctx.beginPath();
      ctx.moveTo(-elite.radius * 1.5, 0);
      ctx.quadraticCurveTo(-elite.radius * 0.4, -elite.radius, elite.radius * 1.5, -elite.radius * 0.3);
      ctx.lineTo(elite.radius * 1.5, elite.radius * 0.3);
      ctx.quadraticCurveTo(-elite.radius * 0.4, elite.radius, -elite.radius * 1.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = charge ? SEMANTIC.threat : elite.phase === 'windup' ? SEMANTIC.warn : 'rgba(214, 246, 238, 0.9)';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // Teeth, so the jaw is legible.
      ctx.fillStyle = 'rgba(240, 245, 235, 0.85)';
      for (let index = 0; index < 5; index += 1) {
        const tx = elite.radius * 0.3 + index * (elite.radius * 0.22);
        ctx.beginPath();
        ctx.moveTo(tx, -elite.radius * 0.22);
        ctx.lineTo(tx + 5, 0);
        ctx.lineTo(tx, elite.radius * 0.22);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = charge ? '#fff4e2' : '#ffd79a';
      ctx.beginPath();
      ctx.arc(elite.radius * 0.1, -elite.radius * 0.34, 3.1, 0, Math.PI * 2);
      ctx.arc(elite.radius * 0.1, elite.radius * 0.34, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // The windup ring: a countdown you can read without a bar.
      if (elite.phase === 'windup') {
        const heat = 1 - elite.timer / ELITE.windup;
        ctx.strokeStyle = PALETTE.warn;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(x, y, elite.radius + 22, -Math.PI / 2, -Math.PI / 2 + heat * Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /** The chorus: a bell that rings a damaging band outward, telegraphed by a swell. */
  function drawChoruses(world, cam) {
    for (const chorus of world.choruses) {
      const x = chorus.x - cam.x;
      const y = chorus.y - cam.y;
      if (x < -400 || x > VIEW.width + 400 || y < -400 || y > VIEW.height + 400) continue;
      ctx.save();
      glowDot(ctx, x, y, 70, chorus.phase === 'swell' ? SEMANTIC.warn : chorus.phase === 'ring' ? SEMANTIC.hazard : SEMANTIC.threat, 0.28);
      // Bell silhouette, hanging from a short stalk.
      ctx.fillStyle = '#08191f';
      ctx.beginPath();
      ctx.moveTo(x - chorus.radius, y + chorus.radius * 0.9);
      ctx.quadraticCurveTo(x - chorus.radius, y - chorus.radius * 1.3, x, y - chorus.radius * 1.3);
      ctx.quadraticCurveTo(x + chorus.radius, y - chorus.radius * 1.3, x + chorus.radius, y + chorus.radius * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = chorus.phase === 'swell' ? SEMANTIC.warn : chorus.phase === 'ring' ? SEMANTIC.threat : 'rgba(214, 246, 238, 0.9)';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = PALETTE.bioDim;
      ctx.beginPath();
      ctx.arc(x, y + chorus.radius * 1.1, 3.4, 0, Math.PI * 2);
      ctx.fill();
      if (chorus.phase === 'swell') {
        // Contracting ring: the countdown to the shock.
        const inner = chorus.ringRadius;
        ctx.strokeStyle = `rgba(255, 190, 120, ${0.5 - 0.2 * (inner / 300)})`;
        ctx.lineWidth = 1.6;
        for (let index = 0; index < 2; index += 1) {
          const radius = Math.max(8, inner - index * 26);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (chorus.phase === 'ring') {
        const band = chorusBand(chorus);
        ctx.strokeStyle = 'rgba(255, 130, 96, 0.85)';
        ctx.lineWidth = (band.outer - band.inner) * 0.9;
        ctx.beginPath();
        ctx.arc(x, y, chorus.ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 230, 200, 0.7)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, chorus.ringRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /** Pickup feedback: the value that just landed, rising with the combo. */
  function drawFloaters(world, cam) {
    if (!world.floaters || world.floaters.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (const floater of world.floaters) {
      const life = Math.max(0, floater.life);
      ctx.globalAlpha = Math.min(1, life);
      ctx.fillStyle = floater.tone === 'bio' ? PALETTE.bio : SEMANTIC.value;
      ctx.font = floater.tone === 'bio' ? 'bold 14px "Consolas", monospace' : 'bold 18px "Consolas", monospace';
      ctx.fillText(floater.text, floater.x - cam.x, floater.y - cam.y - (1.3 - life) * 34);
    }
    ctx.restore();
  }

  /** A depth gauge on the right edge: band colours, metre ticks and the diver's marker. */
  function drawDepthGauge(world) {
    const x = VIEW.width - 18;
    const top = 210;
    const height = VIEW.height - 420;
    const maxY = TRENCH.floorY;
    ctx.save();
    ctx.fillStyle = 'rgba(3, 20, 24, 0.55)';
    ctx.fillRect(x - 6, top, 12, height);
    BANDS.forEach((band, index) => {
      const from = index === 0 ? 0 : band.minDepth * TRENCH.pxPerMetre;
      const to = index + 1 < BANDS.length ? BANDS[index + 1].minDepth * TRENCH.pxPerMetre : maxY;
      const y0 = top + (from / maxY) * height;
      const y1 = top + (to / maxY) * height;
      ctx.fillStyle = band.palette.accent;
      ctx.globalAlpha = index === (world.band ?? 0) ? 0.5 : 0.16;
      ctx.fillRect(x - 4, y0, 8, Math.max(2, y1 - y0));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(200, 235, 230, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 8, y0);
      ctx.lineTo(x + 4, y0);
      ctx.stroke();
    });
    for (let metres = 0; metres <= maxY / TRENCH.pxPerMetre; metres += 30) {
      const y = top + ((metres * TRENCH.pxPerMetre) / maxY) * height;
      ctx.strokeStyle = 'rgba(200, 235, 230, 0.2)';
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x + 2, y);
      ctx.stroke();
    }
    const markerY = top + Math.min(1, Math.max(0, world.player.y / maxY)) * height;
    ctx.fillStyle = SEMANTIC.value;
    ctx.beginPath();
    ctx.moveTo(x - 10, markerY);
    ctx.lineTo(x - 16, markerY - 5);
    ctx.lineTo(x - 16, markerY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** The sonar ping: expanding rings, and a marker on everything it reveals. */
  function drawSonar(world, cam) {
    const sonar = world.sonar;
    if (!sonar || sonar.active <= 0) return;
    const age = 1 - sonar.active / 2.6;
    const radius = sonar.radius * (0.15 + age * 0.85);
    const x = world.player.x - cam.x;
    const y = world.player.y - cam.y;
    ctx.save();
    ctx.strokeStyle = `rgba(94, 200, 255, ${0.55 * (1 - age)})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(94, 200, 255, ${0.28 * (1 - age)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.66, 0, Math.PI * 2);
    ctx.stroke();
    // Markers: top edges of wrecks, lures and loose pieces inside the ping.
    ctx.fillStyle = SEMANTIC.objective;
    for (const wreck of world.wrecks) {
      if (Math.hypot(wreck.x - world.player.x, wreck.y - world.player.y) > sonar.radius) continue;
      const mx = wreck.x - cam.x;
      const my = wreck.y - wreck.height * 0.7 - cam.y;
      ctx.beginPath();
      ctx.moveTo(mx, my - 7);
      ctx.lineTo(mx + 6, my + 2);
      ctx.lineTo(mx - 6, my + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = SEMANTIC.warn;
    for (const lure of world.lures) {
      if (Math.hypot(lure.x - world.player.x, lure.y - world.player.y) > sonar.radius) continue;
      ctx.beginPath();
      ctx.arc(lure.x - cam.x, lure.y - cam.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = SEMANTIC.hazard;
    for (const elite of world.elites) {
      if (Math.hypot(elite.x - world.player.x, elite.y - world.player.y) > sonar.radius) continue;
      ctx.beginPath();
      ctx.arc(elite.x - cam.x, elite.y - cam.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** A spare air pod, if the refit brought one. */
  function drawCache(world, cam) {
    const cache = world.cache;
    if (!cache || cache.taken) return;
    const x = cache.x - cam.x;
    const y = cache.y - cam.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(world.time * 1.2) * 0.15);
    glowDot(ctx, 0, 0, 34, PALETTE.bio, 0.5);
    ctx.fillStyle = '#0d2b2a';
    ctx.fillRect(-9, -13, 18, 26);
    ctx.strokeStyle = PALETTE.bio;
    ctx.lineWidth = 2;
    ctx.strokeRect(-9, -13, 18, 26);
    ctx.fillStyle = PALETTE.bio;
    ctx.fillRect(-5, -7, 10, 3);
    ctx.restore();
  }

  function drawCargo(world, cam) {
    for (const item of world.cargo) {
      const x = item.x - cam.x;
      const y = item.y - cam.y;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(item.phase * 0.6);
      glowDot(ctx, 0, 0, 20, item.colour, 0.4);
      ctx.fillStyle = item.colour;
      ctx.beginPath();
      ctx.moveTo(-6, -8);
      ctx.lineTo(7, -5);
      ctx.lineTo(5, 8);
      ctx.lineTo(-7, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHook(world, cam) {
    const hook = world.hook;
    if (hook.state === 'idle') return;
    const px = world.player.x - cam.x;
    const py = world.player.y - cam.y;
    const hx = hook.x - cam.x;
    const hy = hook.y - cam.y;
    const tension = hook.state === 'attached' ? hook.tension : 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = tension > 0.75 ? SEMANTIC.hazard : SEMANTIC.objective;
    ctx.lineWidth = 1.6 + tension * 1.8;
    ctx.beginPath();
    ctx.moveTo(px, py);
    if (hook.state === 'attached') {
      // A taut tether is a straight line; a slack one sags.
      const sag = (1 - Math.min(1, tension)) * 26;
      ctx.quadraticCurveTo((px + hx) / 2, (py + hy) / 2 + sag, hx, hy);
    } else {
      ctx.lineTo(hx, hy);
    }
    ctx.stroke();
    ctx.fillStyle = SEMANTIC.objective;
    ctx.beginPath();
    ctx.arc(hx, hy, 4 + (hook.state === 'attached' ? 2 : 0), 0, Math.PI * 2);
    ctx.fill();
    if (hook.state === 'attached' && hook.cutProgress > 0) {
      ctx.strokeStyle = SEMANTIC.objective;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hx, hy, 14, -Math.PI / 2, -Math.PI / 2 + hook.cutProgress * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(world, cam) {
    const player = world.player;
    const x = player.x - cam.x;
    const y = player.y - cam.y;
    ctx.save();
    ctx.translate(x, y);
    const tilt = clamp(player.vx / 700, -0.5, 0.5);
    ctx.rotate(tilt);

    // Prop wash bubbles behind the screws.
    if (Math.abs(player.vx) > 60) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#a8dcd6';
      for (let index = 0; index < 4; index += 1) {
        ctx.beginPath();
        ctx.arc(-22 - index * 5, (index % 2 === 0 ? 1 : -1) * 5, 2 + index * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // The boat: a long hull with a sail, a bow plane and a screw — a vessel, not a disc.
    ctx.fillStyle = player.hullFlash > 0 ? '#8a3020' : '#29606c';
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.quadraticCurveTo(20, -11, 2, -12);
    ctx.lineTo(-20, -9);
    ctx.quadraticCurveTo(-30, -4, -30, 0);
    ctx.quadraticCurveTo(-30, 4, -20, 9);
    ctx.lineTo(2, 12);
    ctx.quadraticCurveTo(20, 11, 30, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = player.hullFlash > 0 ? '#ffb9a0' : SEMANTIC.rim;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Sail and periscope mast on top, so the top edge is never a plain curve.
    ctx.fillStyle = '#14323a';
    ctx.beginPath();
    ctx.moveTo(-6, -11);
    ctx.lineTo(-2, -24);
    ctx.lineTo(6, -24);
    ctx.lineTo(10, -11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 246, 238, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Bow plane and stern screw.
    ctx.beginPath();
    ctx.moveTo(26, -3);
    ctx.lineTo(36, -9);
    ctx.moveTo(26, 3);
    ctx.lineTo(36, 9);
    ctx.moveTo(-30, 0);
    ctx.lineTo(-38, -7);
    ctx.moveTo(-30, 0);
    ctx.lineTo(-38, 7);
    ctx.stroke();

    // The viewport and the diver's own lamp behind it.
    ctx.fillStyle = 'rgba(255, 214, 150, 0.22)';
    ctx.beginPath();
    ctx.arc(9, -1, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 230, 225, 0.7)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Lamp housing points where the lamp is aimed.
    ctx.save();
    ctx.rotate(player.aim);
    ctx.fillStyle = '#c8d9d2';
    ctx.fillRect(16, -4.5, 12, 9);
    ctx.fillStyle = player.lampOn ? PALETTE.amberHot : 'rgba(120, 130, 130, 0.7)';
    ctx.beginPath();
    ctx.arc(28, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Fins and skids, so it is clearly a little submarine and not a circle.
    ctx.strokeStyle = PALETTE.hullLight;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, -10);
    ctx.lineTo(-27, -16);
    ctx.moveTo(-18, 10);
    ctx.lineTo(-27, 16);
    ctx.stroke();
    ctx.restore();

    // A dim halo so the diver is found even with the lamp off.
    glowDot(ctx, x, y, 42, player.lampOn ? PALETTE.amber : PALETTE.bioDim, 0.10);
    if (player.mercy > 0) {
      ctx.strokeStyle = `rgba(255, 214, 150, ${0.45 + 0.35 * Math.sin(world.time * 22)})`;
      ctx.lineWidth = 2.4;
      const sweep = world.time * 6;
      ctx.beginPath();
      ctx.arc(x, y, 28, sweep, sweep + Math.PI * 0.5);
      ctx.stroke();
    }
  }

  function drawParticles(world, cam) {
    for (const bubble of world.particles.bubbles) {
      if (!bubble.active) continue;
      const x = bubble.x - cam.x;
      const y = bubble.y - cam.y;
      if (x < -20 || x > VIEW.width + 20 || y < -20 || y > VIEW.height + 20) continue;
      ctx.globalAlpha = 0.25 + 0.5 * (bubble.life / bubble.maxLife);
      ctx.strokeStyle = '#bfe9e4';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, bubble.size, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const spark of world.particles.sparks) {
      if (!spark.active) continue;
      const x = spark.x - cam.x;
      const y = spark.y - cam.y;
      ctx.globalAlpha = 0.8 * (spark.life / spark.maxLife);
      ctx.strokeStyle = spark.tone ? PALETTE.amberHot : '#dfeee9';
      ctx.lineWidth = spark.size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - spark.vx * 0.02, y - spark.vy * 0.02);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const piece of world.particles.debris) {
      if (!piece.active) continue;
      const x = piece.x - cam.x;
      const y = piece.y - cam.y;
      ctx.globalAlpha = 0.7 * (piece.life / piece.maxLife);
      ctx.fillStyle = '#2c4a4e';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(piece.tone * 6 + piece.life * 3);
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size * 0.55);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** The lamp: an additive cone that lights the silt and the wreck in front of the diver. */
  function drawLamp(world, cam) {
    const player = world.player;
    if (!player.lampOn) return;
    const x = player.x - cam.x;
    const y = player.y - cam.y;
    const deep = world.environment?.id === 'black-shelf';
    const reach = deep ? 510 : 540;
    const half = 0.46;
    const angle = player.aim;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gradient = ctx.createRadialGradient(x, y, 12, x, y, reach);
    gradient.addColorStop(0, 'rgba(255, 232, 190, 0.72)');
    gradient.addColorStop(0.35, 'rgba(255, 204, 138, 0.34)');
    gradient.addColorStop(1, 'rgba(255, 176, 96, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, reach, angle - half, angle + half);
    ctx.closePath();
    ctx.fill();
    // A wide, weak outer cone softens the edge of the beam (lamp falloff).
    const outer = ctx.createRadialGradient(x, y, reach * 0.4, x, y, reach * 1.25);
    outer.addColorStop(0, 'rgba(255, 190, 120, 0.10)');
    outer.addColorStop(1, 'rgba(255, 170, 90, 0)');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, reach * 1.25, angle - half * 1.5, angle + half * 1.5);
    ctx.closePath();
    ctx.fill();
    // A hot core right at the lens.
    const core = ctx.createRadialGradient(x, y, 0, x, y, 70);
    core.addColorStop(0, 'rgba(255, 236, 200, 0.4)');
    core.addColorStop(1, 'rgba(255, 210, 150, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Crossing a band: a short breathing vignette so the change is felt, not just seen. */
  function drawBandTransition(world) {
    if (!world.transition || world.transition <= 0) return;
    const t = clamp(world.transition, 0, 1);
    const accent = world.environment?.palette?.accent ?? PALETTE.bio;
    const gradient = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.15, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95);
    gradient.addColorStop(0, 'rgba(2, 10, 12, 0)');
    gradient.addColorStop(1, hexAlpha(accent, 0.34 * t));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.globalAlpha = t * 0.9;
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 26px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(world.environment?.label ?? '', VIEW.width / 2, VIEW.height * 0.32);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawVignette(world) {
    const deep = world?.environment?.id === 'black-shelf' ? 0.08 : 0;
    const gradient = ctx.createRadialGradient(VIEW.width * 0.5, VIEW.height * 0.52, VIEW.height * 0.28, VIEW.width * 0.5, VIEW.height * 0.5, VIEW.height * 0.95);
    gradient.addColorStop(0, 'rgba(1, 10, 12, 0)');
    gradient.addColorStop(1, `rgba(1, 8, 10, ${0.42 + deep})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  return {
    draw,
    resize,
    /** The 2D context, already transformed into the 1280x720 logical space. */
    context() {
      return ctx;
    },
    /** World point under a CSS-pixel pointer, for aiming. */
    pointerToWorld(px, py, cam) {
      const x = (px * (window.devicePixelRatio || 1) - offsetX) / scale;
      const y = (py * (window.devicePixelRatio || 1) - offsetY) / scale;
      return { x: x + cam.x, y: y + cam.y };
    },
    camera,
    viewport() {
      return { scale, offsetX, offsetY };
    },
  };
}

/** One silhouette per salvage class, so a wreck's haul reads before you cut it. */
function drawSalvageShape(ctx, x, y, size, kind) {
  ctx.beginPath();
  if (kind === 'glass') {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.8, y + size * 0.7);
    ctx.lineTo(x - size * 0.8, y + size * 0.7);
    ctx.closePath();
  } else if (kind === 'ingot' || kind === 'obsidian') {
    ctx.moveTo(x - size, y - size * 0.5);
    ctx.lineTo(x + size, y - size * 0.35);
    ctx.lineTo(x + size * 0.8, y + size * 0.55);
    ctx.lineTo(x - size * 0.9, y + size * 0.45);
    ctx.closePath();
  } else if (kind === 'relic') {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.7, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.7, y);
    ctx.closePath();
  } else if (kind === 'bloom') {
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const radius = index % 2 === 0 ? size : size * 0.42;
      ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    ctx.closePath();
  } else if (kind === 'bell') {
    ctx.arc(x, y, size * 0.85, Math.PI, 0);
    ctx.lineTo(x + size * 0.85, y + size * 0.85);
    ctx.lineTo(x - size * 0.85, y + size * 0.85);
    ctx.closePath();
  } else {
    ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
  }
  ctx.fill();
}

/** An additive dot of light: the glow that makes bioluminescence read in deep water. */
function glowDot(ctx, x, y, radius, colour, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, hexAlpha(colour, alpha));
  gradient.addColorStop(0.5, hexAlpha(colour, alpha * 0.35));
  gradient.addColorStop(1, hexAlpha(colour, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function hexAlpha(hex, alpha) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Darken a hex colour toward black, for object bodies that must sit under their rim. */
function shadeHex(hex, factor) {
  if (!hex.startsWith('#')) return hex;
  const value = hex.replace('#', '');
  const r = Math.round(parseInt(value.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(value.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(value.slice(4, 6), 16) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

function mix(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const out = pa.map((value, index) => Math.round(value + (pb[index] - value) * clamp(t, 0, 1)));
  return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
}

export { anchorAt, nodeAt };
