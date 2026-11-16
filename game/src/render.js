// The scene painter. It reads the world and draws it: trench water, distant hulls, silt,
// wrecks and their salvage, lures, the tether, the bathyscaphe, particles and the lamp's
// cone of light. It never changes the simulation — draw(world, view) is the only entry.

import { PALETTE, TRENCH, VIEW } from './config.js';
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
    drawWater(cam);
    drawGodRays(world, cam);
    drawDepthMarks(cam);
    drawDistantHulls(cam);
    if (cam.y < 220) drawSurface(cam);
    drawCurrents(world, cam);
    drawFarSilt(world, cam);
    drawSilt(world, cam);
    drawWrecks(world, cam);
    drawVents(world, cam);
    drawWells(world, cam);
    drawLures(world, cam);
    drawCargo(world, cam);
    drawHook(world, cam);
    drawPlayer(world, cam);
    drawParticles(world, cam);
    drawLamp(world, cam);
    drawEnvironmentTint(world);
    drawVignette(world);
    ctx.restore();
  }

  /** The water itself: a depth-tinted gradient, cached per 120 px of camera height. */
  function drawWater(cam) {
    const bucket = Math.round(cam.y / 120) * 120;
    let gradient = GRADIENTS.get(bucket);
    if (!gradient) {
      const depth = clamp(bucket / 3200, 0, 1);
      gradient = ctx.createLinearGradient(0, -40, VIEW.width * 0.35, VIEW.height + 40);
      gradient.addColorStop(0, mix('#12616f', '#0a3140', depth * 0.8));
      gradient.addColorStop(0.45, mix('#0c4a58', '#062631', depth));
      gradient.addColorStop(1, mix('#083340', '#04202a', 0.4 + depth * 0.6));
      GRADIENTS.set(bucket, gradient);
      if (GRADIENTS.size > 40) GRADIENTS.delete(GRADIENTS.keys().next().value);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Three soft horizontal haze bands give the column a sense of layered distance.
    const haze = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    haze.addColorStop(0, 'rgba(12, 74, 88, 0.10)');
    haze.addColorStop(0.5, 'rgba(4, 30, 40, 0.0)');
    haze.addColorStop(1, 'rgba(2, 16, 22, 0.16)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
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
      ctx.fillStyle = 'rgba(9, 52, 60, 0.7)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + width * 0.5, y - height * 0.55, x + width, y);
      ctx.lineTo(x + width * 0.86, y + height * 0.5);
      ctx.lineTo(x + width * 0.12, y + height * 0.44);
      ctx.closePath();
      ctx.fill();
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
    const strength = clamp(1 - cam.y / 1500, 0, 1);
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
      gradient.addColorStop(0, `rgba(214, 196, 150, ${0.30 * heat})`);
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
      ctx.strokeStyle = vent.phase === 'warning' ? PALETTE.warn : vent.phase === 'blast' ? PALETTE.bad : 'rgba(120, 170, 168, 0.5)';
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
        ctx.strokeStyle = pulling ? `rgba(174, 140, 255, ${0.35 * (1 - cycle)})` : `rgba(120, 160, 200, ${warning ? 0.3 : 0.14})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(6, radius), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      const core = ctx.createRadialGradient(x, y, 0, x, y, well.core * 2.4);
      core.addColorStop(0, pulling ? 'rgba(24, 8, 40, 0.95)' : 'rgba(14, 22, 32, 0.8)');
      core.addColorStop(1, 'rgba(10, 16, 24, 0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, well.core * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = warning ? PALETTE.warn : pulling ? '#c9a6ff' : 'rgba(140, 170, 210, 0.6)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(x, y, well.core, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** The deep band is colder and violet; the upper trench stays teal. */
  function drawEnvironmentTint(world) {
    if (world.environment?.id !== 'black-shelf') return;
    // A violet veil, not a dimmer: the band reads colder without going blind.
    ctx.save();
    ctx.fillStyle = 'rgba(58, 30, 92, 0.16)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(46, 24, 78, 0.10)';
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
      ctx.fillStyle = wreck.collapsing ? 'rgba(86, 44, 30, 0.95)' : 'rgba(22, 58, 66, 0.96)';
      ctx.fill();
      ctx.strokeStyle = wreck.hitFlash > 0 ? PALETTE.amberHot : 'rgba(150, 206, 206, 0.75)';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(96, 152, 158, 0.6)';
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
        glowDot(ctx, nx, ny, node.radius + 10, node.colour, 0.85);
        ctx.fillStyle = node.colour;
        ctx.beginPath();
        ctx.arc(nx, ny, node.radius * 0.72, 0, Math.PI * 2);
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
      glowDot(ctx, 0, 0, 46 + pulse * 12, wake ? PALETTE.danger : PALETTE.bio, 0.32);
      // Tendrils trail behind the lure, so its direction reads at a glance.
      ctx.strokeStyle = wake ? 'rgba(255, 140, 110, 0.7)' : 'rgba(111, 240, 208, 0.55)';
      ctx.lineWidth = 1.8;
      for (let index = 0; index < 4; index += 1) {
        const phase = lure.pulse * 0.7 + index;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.quadraticCurveTo(Math.cos(phase) * 10, 16 + index * 5, Math.cos(phase + 1) * 6 - lure.vx * 0.05, 26 + index * 7);
        ctx.stroke();
      }
      ctx.fillStyle = wake ? '#ff8d6a' : PALETTE.bio;
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 9, Math.sin(lure.pulse) * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#04201f';
      ctx.beginPath();
      ctx.arc(-3.5, -1, 1.9, 0, Math.PI * 2);
      ctx.arc(3.5, -1, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
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
    ctx.strokeStyle = tension > 0.75 ? 'rgba(255, 170, 120, 0.95)' : 'rgba(230, 235, 220, 0.8)';
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
    ctx.fillStyle = PALETTE.amberHot;
    ctx.beginPath();
    ctx.arc(hx, hy, 4 + (hook.state === 'attached' ? 2 : 0), 0, Math.PI * 2);
    ctx.fill();
    if (hook.state === 'attached' && hook.cutProgress > 0) {
      ctx.strokeStyle = PALETTE.amber;
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

    // The hull: a rounded bathysphere body in three tones so it reads in silhouette.
    ctx.fillStyle = player.hullFlash > 0 ? '#ffb08a' : PALETTE.hull;
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.hullLight;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.hullDark;
    ctx.beginPath();
    ctx.ellipse(-6, 2, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();

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
    ctx.fillStyle = PALETTE.amber;
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
    glowDot(ctx, x, y, 42, player.lampOn ? PALETTE.amber : PALETTE.bioDim, 0.18);
    if (player.mercy > 0) {
      ctx.strokeStyle = `rgba(255, 214, 150, ${0.25 + 0.35 * Math.sin(world.time * 22)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 26 + Math.sin(world.time * 8) * 2, 0, Math.PI * 2);
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

  function drawVignette(world) {
    const deep = world?.environment?.id === 'black-shelf' ? 0.08 : 0;
    const gradient = ctx.createRadialGradient(VIEW.width * 0.5, VIEW.height * 0.52, VIEW.height * 0.28, VIEW.width * 0.5, VIEW.height * 0.5, VIEW.height * 0.95);
    gradient.addColorStop(0, 'rgba(1, 10, 12, 0)');
    gradient.addColorStop(1, `rgba(1, 8, 10, ${0.42 + deep})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Three soft horizontal haze bands give the column a sense of layered distance.
    const haze = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    haze.addColorStop(0, 'rgba(12, 74, 88, 0.10)');
    haze.addColorStop(0.5, 'rgba(4, 30, 40, 0.0)');
    haze.addColorStop(1, 'rgba(2, 16, 22, 0.16)');
    ctx.fillStyle = haze;
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

function mix(a, b, t) {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const out = pa.map((value, index) => Math.round(value + (pb[index] - value) * clamp(t, 0, 1)));
  return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
}

export { anchorAt, nodeAt };
