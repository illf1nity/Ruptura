/* ============================================
   RUPTURA VIDEO CARD GENERATOR — video-card.js
   Generates animated shareable video cards with
   fractal backgrounds and Canvas text overlay.
   Recorded via captureStream + MediaRecorder.
   ============================================ */

(function () {
  'use strict';

  var W = 1080;
  var H = 1920;
  var DURATION = 12; // seconds (trimmed from 15 — final seconds were mostly static)
  var FPS = 36; // 50% increase from 24fps for smoother background animation

  // Fractal render resolution (1/4 scale for performance)
  var FW = 270;
  var FH = 480;

  // Design tokens
  // SYNC WITH ruptura-tokens.css — update manually when tokens change
  var BG_PRIMARY = '#0C0F14';
  var GOLD = '#E8A633'; // changed from #D4A054
  var TEXT_PRIMARY = '#F0EDE8';
  var TEXT_SECONDARY = '#9CA3AF';
  var TEXT_TERTIARY = '#8A94A3'; // WCAG AA compliant (4.6:1 on dark)
  var GAP_RED = '#E63946'; // changed from #C45B4A
  var GROWTH_GREEN = '#4A9B7F';
  var BORDER_SUBTLE = '#2A3040';
  var CAPTION_COLOR = '#E63946'; // --gap-red token

  var generating = false;

  // ------------------------------------
  // LOGO IMAGE (pre-loaded for video overlay)
  // ------------------------------------
  var logoImage = null;
  var logoLoaded = false;

  function loadLogoImage() {
    if (logoImage) return Promise.resolve(logoImage);
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        logoImage = img;
        logoLoaded = true;
        resolve(img);
      };
      img.onerror = function () {
        console.warn('Logo image failed to load, falling back to text');
        resolve(null);
      };
      img.src = 'ruptura_logo.svg?v=3';
    });
  }

  // ------------------------------------
  // COLOR PALETTES (randomized per generation)
  // ------------------------------------
  // Iq-style cosine palette parameters: a (offset), b (amplitude), phase shifts, speed
  var PALETTE_DEFS = [
    // 0: Gold/Amber (original warm Ruptura gold)
    { a: [12, 10, 8], b: [210, 155, 80], d: [0.0, 0.12, 0.28], speed: 2.5 },
    // 1: Crimson/Scarlet (aggressive, high-gap energy)
    { a: [18, 6, 6], b: [210, 90, 55], d: [0.0, 0.18, 0.38], speed: 2.6 },
    // 2: Deep Teal/Cyan (cool, oceanic depth)
    { a: [6, 14, 18], b: [50, 185, 175], d: [0.32, 0.04, 0.0], speed: 2.4 },
    // 3: Amethyst/Violet (mysterious, electric)
    { a: [14, 6, 20], b: [150, 70, 210], d: [0.0, 0.22, -0.08], speed: 2.5 },
    // 4: Copper/Bronze (warm metallic, earthy)
    { a: [20, 12, 6], b: [195, 135, 55], d: [0.0, 0.06, 0.24], speed: 2.8 },
  ];

  // Newton basin uses 3-tone palettes (one color per root)
  var NEWTON_PALETTE_DEFS = [
    [[212, 160, 84],  [184, 120, 50],  [232, 200, 122]],  // gold tones
    [[196, 91, 74],   [155, 55, 42],   [235, 135, 105]],  // red/scarlet
    [[74, 155, 127],  [40, 115, 95],   [110, 205, 175]],  // teal
    [[212, 160, 84],  [196, 91, 74],   [74, 155, 127]],   // gold/red/teal mix
    [[155, 95, 200],  [115, 55, 165],  [200, 150, 232]],  // amethyst
  ];

  function cp(t) { return 0.5 + 0.5 * Math.cos(6.28318 * t); }
  function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.floor(v); }

  function buildPalette(def) {
    var p = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var t = i / 255;
      var phase = t * def.speed;
      p[i * 3]     = clamp8(def.a[0] + def.b[0] * cp(phase + def.d[0]));
      p[i * 3 + 1] = clamp8(def.a[1] + def.b[1] * cp(phase + def.d[1]));
      p[i * 3 + 2] = clamp8(def.a[2] + def.b[2] * cp(phase + def.d[2]));
    }
    return p;
  }

  // ------------------------------------
  // FRACTAL BACKGROUNDS (factories)
  // ------------------------------------
  var backgroundDefs = [

    // ---- BG 0: DOMAIN-WARPED SINE FIELD A ----
    // Flowing, organic, aurora/molten-metal aesthetic
    {
      id: 'sine-field-a',
      name: 'Sine Field A',
      tiers: ['positive', 'moderate', 'severe'],
      create: function (seed, palette, newtonColors) {
        var offCanvas = document.createElement('canvas');
        offCanvas.width = FW;
        offCanvas.height = FH;
        var offCtx = offCanvas.getContext('2d');
        var imgData = offCtx.createImageData(FW, FH);
        var pix = imgData.data;
        var pal = palette;

        var rng = makeRng(seed);
        // Randomized warp parameters for organic variation
        var freq1 = 0.008 + rng() * 0.006; // base frequency
        var freq2 = 0.014 + rng() * 0.008; // secondary frequency
        var freq3 = 0.022 + rng() * 0.012; // detail frequency
        var phase1 = rng() * 6.28318;
        var phase2 = rng() * 6.28318;
        var phase3 = rng() * 6.28318;
        var timeScale = 0.15 + rng() * 0.1; // slow flowing movement

        return {
          render: function (ctx, t) {
            var tOff = t * timeScale;

            for (var py = 0; py < FH; py++) {
              for (var px = 0; px < FW; px++) {
                // Normalized coordinates
                var nx = px / FW;
                var ny = py / FH;

                // Layer 1: Base sine wave with time offset
                var wave1 = Math.sin(nx * freq1 * 100 + phase1 + tOff) *
                           Math.cos(ny * freq1 * 100 + phase1 - tOff * 0.7);

                // Layer 2: Domain warp — feed wave1 result into new coordinates
                var wx = nx + wave1 * 0.3;
                var wy = ny + wave1 * 0.2;
                var wave2 = Math.sin(wx * freq2 * 100 + phase2 + tOff * 1.3) *
                           Math.cos(wy * freq2 * 100 + phase2 + tOff * 0.9);

                // Layer 3: Fine detail layer with cross-warp
                var wx2 = wx + wave2 * 0.25;
                var wy2 = wy - wave2 * 0.15;
                var wave3 = Math.sin(wx2 * freq3 * 100 + phase3 - tOff * 0.6) *
                           Math.cos(wy2 * freq3 * 100 + phase3 + tOff * 1.1);

                // Combine waves with weighted blend for rich texture
                var combined = wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25;

                // Map [-1, 1] to [0, 255] for palette lookup
                var colorIdx = Math.floor((combined * 0.5 + 0.5) * 255);
                colorIdx = colorIdx < 0 ? 0 : colorIdx > 255 ? 255 : colorIdx;

                var idx = (py * FW + px) * 4;
                pix[idx]     = pal[colorIdx * 3];
                pix[idx + 1] = pal[colorIdx * 3 + 1];
                pix[idx + 2] = pal[colorIdx * 3 + 2];
                pix[idx + 3] = 255;
              }
            }

            offCtx.putImageData(imgData, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(offCanvas, 0, 0, W, H);
          }
        };
      }
    },

    // ---- BG 1: DOMAIN-WARPED SINE FIELD B ----
    // Higher frequencies, electric/crystalline feel
    {
      id: 'sine-field-b',
      name: 'Sine Field B',
      tiers: ['moderate', 'severe'],
      create: function (seed, palette, newtonColors) {
        var offCanvas = document.createElement('canvas');
        offCanvas.width = FW;
        offCanvas.height = FH;
        var offCtx = offCanvas.getContext('2d');
        var imgData = offCtx.createImageData(FW, FH);
        var pix = imgData.data;
        var pal = palette;

        var rng = makeRng(seed);
        // Higher base frequencies for tighter, more detailed patterns
        var freq1 = 0.016 + rng() * 0.01;
        var freq2 = 0.028 + rng() * 0.014;
        var freq3 = 0.042 + rng() * 0.018;
        var phase1 = rng() * 6.28318;
        var phase2 = rng() * 6.28318;
        var phase3 = rng() * 6.28318;
        var timeScale = 0.22 + rng() * 0.12; // slightly faster than variant A

        // Different warp direction for distinct visual feel
        var warpDirX = rng() > 0.5 ? 1 : -1;
        var warpDirY = rng() > 0.5 ? 1 : -1;

        return {
          render: function (ctx, t) {
            var tOff = t * timeScale;

            for (var py = 0; py < FH; py++) {
              for (var px = 0; px < FW; px++) {
                var nx = px / FW;
                var ny = py / FH;

                // Layer 1: Dual-axis sine wave
                var wave1 = Math.sin(nx * freq1 * 100 + phase1 - tOff) *
                           Math.sin(ny * freq1 * 100 + phase1 + tOff * 1.2);

                // Layer 2: Opposite warp direction for crystalline interference
                var wx = nx + wave1 * 0.25 * warpDirX;
                var wy = ny + wave1 * 0.2 * warpDirY;
                var wave2 = Math.cos(wx * freq2 * 100 + phase2 - tOff * 1.5) *
                           Math.sin(wy * freq2 * 100 + phase2 + tOff * 0.8);

                // Layer 3: High-frequency detail with rotational component
                var angle = Math.atan2(wy - 0.5, wx - 0.5);
                var wave3 = Math.sin(angle * 4 + freq3 * 100 + phase3 + tOff) *
                           Math.cos(wx * freq3 * 100 + wy * freq3 * 100 - tOff * 1.3);

                // Different blend weights for sharper, more electric feel
                var combined = wave1 * 0.3 + wave2 * 0.45 + wave3 * 0.25;

                var colorIdx = Math.floor((combined * 0.5 + 0.5) * 255);
                colorIdx = colorIdx < 0 ? 0 : colorIdx > 255 ? 255 : colorIdx;

                var idx = (py * FW + px) * 4;
                pix[idx]     = pal[colorIdx * 3];
                pix[idx + 1] = pal[colorIdx * 3 + 1];
                pix[idx + 2] = pal[colorIdx * 3 + 2];
                pix[idx + 3] = 255;
              }
            }

            offCtx.putImageData(imgData, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(offCanvas, 0, 0, W, H);
          }
        };
      }
    },

    // ---- BG 2: NEWTON BASIN ----
    // Newton's method on z^3 - 1, zoomed into swirling basin boundaries
    {
      id: 'newton-basin',
      name: 'Newton Basin',
      tiers: ['positive', 'moderate', 'severe'],
      create: function (seed, palette, newtonColors) {
        var offCanvas = document.createElement('canvas');
        offCanvas.width = FW;
        offCanvas.height = FH;
        var offCtx = offCanvas.getContext('2d');
        var imgData = offCtx.createImageData(FW, FH);
        var pix = imgData.data;
        var maxIter = 30; // increased from 20 for better detail
        var nColors = newtonColors;

        var rng = makeRng(seed);
        var rotSpeed = 0.25 + rng() * 0.2;
        var initAngle = rng() * 6.28318;
        var viewCx = (rng() - 0.5) * 0.4;
        var viewCy = (rng() - 0.5) * 0.4;

        var roots = [
          [1, 0],
          [-0.5, 0.8660254],
          [-0.5, -0.8660254]
        ];

        return {
          render: function (ctx, t) {
            var angle = initAngle + t * rotSpeed;
            var cosA = Math.cos(angle);
            var sinA = Math.sin(angle);

            var scale = 1.2;
            var aspect = FH / FW;
            var cx = viewCx + Math.sin(t * 0.4) * 0.15;
            var cy = viewCy + Math.cos(t * 0.3) * 0.12;
            var hw = scale / 2;
            var hh = scale * aspect / 2;

            for (var py = 0; py < FH; py++) {
              for (var px = 0; px < FW; px++) {
                var ux = cx - hw + (px / FW) * scale;
                var uy = cy - hh + (py / FH) * scale * aspect;
                var zr = ux * cosA - uy * sinA;
                var zi = ux * sinA + uy * cosA;

                var iter = 0;
                var converged = -1;

                for (iter = 0; iter < maxIter; iter++) {
                  var zr2 = zr * zr;
                  var zi2 = zi * zi;

                  var z3r = zr * (zr2 - 3 * zi2);
                  var z3i = zi * (3 * zr2 - zi2);

                  var fr = z3r - 1;
                  var fi = z3i;
                  var dr = 3 * (zr2 - zi2);
                  var di = 6 * zr * zi;

                  var dMag = dr * dr + di * di;
                  if (dMag < 0.0000001) dMag = 0.0000001;
                  var qr = (fr * dr + fi * di) / dMag;
                  var qi = (fi * dr - fr * di) / dMag;

                  zr = zr - qr;
                  zi = zi - qi;

                  for (var r = 0; r < 3; r++) {
                    var diffr = zr - roots[r][0];
                    var diffi = zi - roots[r][1];
                    if (diffr * diffr + diffi * diffi < 0.0001) {
                      converged = r;
                      break;
                    }
                  }
                  if (converged >= 0) break;
                }

                var idx = (py * FW + px) * 4;
                if (converged >= 0) {
                  var brightness = 1.0 - (iter / maxIter) * 0.7;
                  var col = nColors[converged];
                  pix[idx]     = Math.floor(col[0] * brightness);
                  pix[idx + 1] = Math.floor(col[1] * brightness);
                  pix[idx + 2] = Math.floor(col[2] * brightness);
                  pix[idx + 3] = 255;
                } else {
                  pix[idx] = 12; pix[idx + 1] = 15; pix[idx + 2] = 20; pix[idx + 3] = 255;
                }
              }
            }

            offCtx.putImageData(imgData, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(offCanvas, 0, 0, W, H);
          }
        };
      }
    },

    // ---- BG 3: PARTICLE CONSTELLATION ----
    // Data network / constellation aesthetic, supports connected workers theme
    {
      id: 'particle-constellation',
      name: 'Particle Constellation',
      tiers: ['positive', 'moderate', 'severe'],
      create: function (seed, palette, newtonColors) {
        var rng = makeRng(seed);
        var numParticles = 200 + Math.floor(rng() * 100); // 200-300 particles
        var particles = [];
        var pal = palette;

        // Initialize particles with random positions and velocities
        for (var i = 0; i < numParticles; i++) {
          particles.push({
            x: rng() * W,
            y: rng() * H,
            vx: (rng() - 0.5) * 0.8, // slow drift
            vy: (rng() - 0.5) * 0.8,
            // Color from palette
            colorIdx: Math.floor(rng() * 256)
          });
        }

        // Connection threshold (distance in pixels at full resolution)
        var connectionThreshold = 180 + rng() * 100; // 180-280px
        var particleRadius = 2.5; // at FW/FH scale, will be ~10px at W/H

        return {
          render: function (ctx, t) {
            // Subtle radial gradient background with center glow
            var bgGrad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
            var bgR = 12, bgG = 15, bgB = 20; // BG_PRIMARY RGB
            bgGrad.addColorStop(0, 'rgba(' + bgR + ', ' + bgG + ', ' + bgB + ', 1)');
            bgGrad.addColorStop(0.4, 'rgba(' + (bgR + 2) + ', ' + (bgG + 3) + ', ' + (bgB + 5) + ', 1)');
            bgGrad.addColorStop(1, 'rgba(' + bgR + ', ' + bgG + ', ' + bgB + ', 1)');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);

            // Update particle positions (wrap at edges)
            for (var i = 0; i < particles.length; i++) {
              var p = particles[i];
              p.x += p.vx;
              p.y += p.vy;

              // Wrap around edges
              if (p.x < 0) p.x += W;
              if (p.x > W) p.x -= W;
              if (p.y < 0) p.y += H;
              if (p.y > H) p.y -= H;
            }

            // Draw connections first (below particles)
            ctx.strokeStyle = 'rgba(232, 166, 51, 0.15)'; // GOLD with low alpha
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (var i = 0; i < particles.length; i++) {
              var p1 = particles[i];
              for (var j = i + 1; j < particles.length; j++) {
                var p2 = particles[j];
                var dx = p2.x - p1.x;
                var dy = p2.y - p1.y;
                var dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < connectionThreshold) {
                  // Alpha based on distance (closer = more opaque)
                  var alpha = (1 - dist / connectionThreshold) * 0.25;
                  ctx.globalAlpha = alpha;
                  ctx.beginPath();
                  ctx.moveTo(p1.x, p1.y);
                  ctx.lineTo(p2.x, p2.y);
                  ctx.stroke();
                }
              }
            }
            ctx.globalAlpha = 1;

            // Draw particles
            for (var i = 0; i < particles.length; i++) {
              var p = particles[i];
              // Get color from palette
              var r = pal[p.colorIdx * 3];
              var g = pal[p.colorIdx * 3 + 1];
              var b = pal[p.colorIdx * 3 + 2];

              ctx.fillStyle = 'rgb(' + r + ', ' + g + ', ' + b + ')';
              ctx.beginPath();
              ctx.arc(p.x, p.y, particleRadius, 0, 6.28318);
              ctx.fill();

              // Optional: subtle glow on some particles
              if (i % 7 === 0) {
                ctx.shadowColor = 'rgb(' + r + ', ' + g + ', ' + b + ')';
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(p.x, p.y, particleRadius * 0.5, 0, 6.28318);
                ctx.fill();
                ctx.shadowBlur = 0;
              }
            }
          }
        };
      }
    },

    // ---- BG 4: CYBERPUNK WAVE + LIGHTNING ----
    // Stroke-based sine waves with sporadic lightning bolts
    {
      id: 'cyberpunk-wave',
      name: 'Cyberpunk Wave',
      tiers: ['moderate', 'severe'],
      create: function (seed, palette, newtonColors) {
        var rng = makeRng(seed);
        var pal = palette;
        var WAVE_COUNT = 5;

        // Per-wave parameters
        var waves = [];
        var baseFreq = 0.006 + rng() * 0.004;
        for (var i = 0; i < WAVE_COUNT; i++) {
          var freq = baseFreq * Math.pow(1.2, i);
          waves.push({
            yBase: (H / (WAVE_COUNT + 1)) * (i + 1) + (rng() - 0.5) * 80,
            freq: freq,
            amp: 30 + rng() * 30,
            phase: rng() * 6.28318,
            timeScale: 0.15 + i * 0.03,
            opacity: 0.3 + i * 0.15,
            colorIdx: Math.floor((i / (WAVE_COUNT - 1)) * 255)
          });
        }

        // Lightning state
        var bolt = { active: false, startTime: 0, segments: [], branches: [] };
        var nextBoltTime = 1.0 + rng() * 2.0;
        var boltRng = makeRng(seed + 7);

        function generateBolt(t) {
          var waveIdx = Math.floor(boltRng() * (WAVE_COUNT - 1));
          var startX = boltRng() * W;
          var startY = waves[waveIdx].yBase;
          var endY = waves[waveIdx + 1].yBase;
          var segCount = 8 + Math.floor(boltRng() * 7);
          var segs = [{ x: startX, y: startY }];
          var dy = (endY - startY) / segCount;

          for (var s = 1; s <= segCount; s++) {
            segs.push({
              x: startX + (boltRng() - 0.5) * 30,
              y: startY + dy * s + (boltRng() - 0.5) * 15
            });
          }

          // Branches
          var branches = [];
          for (var s = 1; s < segs.length - 1; s++) {
            if (boltRng() < 0.3) {
              var branchLen = 2 + Math.floor(boltRng() * 3);
              var brSegs = [{ x: segs[s].x, y: segs[s].y }];
              var angle = (boltRng() > 0.5 ? 1 : -1) * (0.4 + boltRng() * 0.35);
              for (var b = 0; b < branchLen; b++) {
                var prev = brSegs[brSegs.length - 1];
                brSegs.push({
                  x: prev.x + Math.sin(angle) * (15 + boltRng() * 20),
                  y: prev.y + Math.cos(angle) * (10 + boltRng() * 15)
                });
              }
              branches.push(brSegs);
            }
          }

          bolt.active = true;
          bolt.startTime = t;
          bolt.segments = segs;
          bolt.branches = branches;
          nextBoltTime = t + 2.0 + boltRng() * 2.0;
        }

        function drawBoltPath(ctx, points, width) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (var i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.lineWidth = width;
          ctx.stroke();
        }

        return {
          render: function (ctx, t) {
            // Dark background
            ctx.fillStyle = BG_PRIMARY;
            ctx.fillRect(0, 0, W, H);

            // Draw waves (stroke only, no fill)
            for (var i = 0; i < WAVE_COUNT; i++) {
              var w = waves[i];
              var tOff = t * w.timeScale;
              var r = pal[w.colorIdx * 3];
              var g = pal[w.colorIdx * 3 + 1];
              var b = pal[w.colorIdx * 3 + 2];

              ctx.save();
              ctx.globalAlpha = w.opacity;
              ctx.strokeStyle = 'rgb(' + r + ', ' + g + ', ' + b + ')';
              ctx.lineWidth = 3;
              ctx.beginPath();

              for (var px = 0; px <= W; px += 4) {
                var nx = px / W;
                // Primary wave
                var wave1 = Math.sin(nx * w.freq * 400 + w.phase + tOff * 2.5);
                // Domain warp: feed wave output back
                var wx = nx + wave1 * 0.15;
                var wave2 = Math.sin(wx * w.freq * 600 + w.phase * 1.3 - tOff * 1.8);
                var combined = (wave1 * 0.6 + wave2 * 0.4) * w.amp;
                var y = w.yBase + combined;

                if (px === 0) ctx.moveTo(px, y);
                else ctx.lineTo(px, y);
              }
              ctx.stroke();
              ctx.restore();
            }

            // Lightning system
            if (!bolt.active && t >= nextBoltTime) {
              generateBolt(t);
            }

            if (bolt.active) {
              var elapsed = t - bolt.startTime;
              var alpha;
              if (elapsed < 0.15) {
                alpha = 1.0; // flash
              } else if (elapsed < 0.35) {
                alpha = 1.0 - (elapsed - 0.15) / 0.2; // fade
              } else {
                bolt.active = false;
                alpha = 0;
              }

              if (alpha > 0) {
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = GOLD;
                ctx.shadowColor = GOLD;
                ctx.shadowBlur = 20;

                drawBoltPath(ctx, bolt.segments, 3);

                ctx.shadowBlur = 10;
                for (var bi = 0; bi < bolt.branches.length; bi++) {
                  drawBoltPath(ctx, bolt.branches[bi], 1.5);
                }

                ctx.shadowBlur = 0;
                ctx.restore();
              }
            }
          }
        };
      }
    }
  ];


  // ------------------------------------
  // SEEDED RNG (mulberry32)
  // ------------------------------------
  function makeRng(seed) {
    var s = seed | 0;
    return function () {
      s |= 0;
      s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------
  // DJB2 HASH
  // ------------------------------------
  function djb2(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash >>> 0;
  }

  // ------------------------------------
  // DETERMINISTIC BACKGROUND SELECTION
  // ------------------------------------
  function selectBackground(formValues, cumulativeImpact) {
    var tier;
    if (cumulativeImpact <= 1000) tier = 'positive';
    else if (cumulativeImpact > 50000) tier = 'severe';
    else tier = 'moderate';

    // All backgrounds eligible — random selection from tier-matched pool
    var eligible = backgroundDefs.filter(function (bg) {
      return bg.tiers.indexOf(tier) !== -1;
    });
    if (eligible.length === 0) eligible = backgroundDefs;

    var seed = [
      formValues.zip_code || '',
      Math.round(formValues.current_wage || 0),
      formValues.start_year || 0,
      Math.round(cumulativeImpact)
    ].join('|');

    var hash = djb2(seed);
    var index = hash % eligible.length;

    // Randomized palette selection (different bits of hash for independence)
    var paletteIdx = (hash >>> 8) % PALETTE_DEFS.length;
    var palette = buildPalette(PALETTE_DEFS[paletteIdx]);
    var newtonIdx = (hash >>> 16) % NEWTON_PALETTE_DEFS.length;
    var newtonColors = NEWTON_PALETTE_DEFS[newtonIdx];

    return { bgDef: eligible[index], tier: tier, hash: hash, palette: palette, newtonColors: newtonColors };
  }

  // ------------------------------------
  // Logo is rendered with native SVG colors — no tinting.

  // ------------------------------------
  // TEXT OVERLAY (improved layout + animation)
  // ------------------------------------
  function drawTextOverlay(ctx, resultsData, content, tier, t, rendererId) {
    var dc = content.download_card;
    var impact = resultsData.impact;
    var cumulative = impact.summary.unrealized_productivity_gains;
    var totalGenerated = impact.summary.total_value_generated;
    var totalReceived = impact.summary.total_wages_received;
    var startYear = resultsData.formValues.start_year;
    var yearsSpan = Math.max(1, new Date().getFullYear() - startYear);

    // Use worth gap when productivity gap is negative but worker is underpaid
    var worthGapAnnual = (resultsData.worth && resultsData.worth.worthGap)
      ? resultsData.worth.worthGap.annual : 0;
    var useWorthGap = resultsData.useWorthGapAsHero || false;
    var annualGap = useWorthGap ? Math.round(worthGapAnnual) : Math.round(cumulative / yearsSpan);
    if (useWorthGap) cumulative = worthGapAnnual * yearsSpan;

    // Derive opportunity cost from the annual gap (same source as frontend display)
    var oppCost = annualGap > 0 ? {
      dailyGap: annualGap / 260,
      weeklyGap: annualGap / 52,
      monthlyGap: annualGap / 12
    } : null;

    // Survival metrics — pull from results card (computed by econ.js) for consistency
    var survival = resultsData.survivalMetrics || {};
    var yearlyGap = survival.annualGap || annualGap;
    var daysWorkedFree = survival.daysWorkedFree != null ? survival.daysWorkedFree : 0;
    var rentMonths = survival.rentMonths != null ? survival.rentMonths : 0;

    var cx = W / 2; // center x for symmetrical layout

    // -- Dark backing gradient (stronger for text readability, lets fractal breathe at edges) --
    var backMax = (rendererId === 'cyberpunk-wave') ? 0.65 : 0.82;
    var backAlpha = Math.min(t / 0.3, 1) * backMax;
    ctx.save();
    ctx.globalAlpha = backAlpha;
    var backing = ctx.createLinearGradient(0, 0, 0, H);
    backing.addColorStop(0, 'rgba(12, 15, 20, 0)');
    backing.addColorStop(0.05, 'rgba(12, 15, 20, 0.65)');
    backing.addColorStop(0.15, 'rgba(12, 15, 20, 0.82)');
    backing.addColorStop(0.5, 'rgba(12, 15, 20, 0.88)');
    backing.addColorStop(0.85, 'rgba(12, 15, 20, 0.82)');
    backing.addColorStop(0.95, 'rgba(12, 15, 20, 0.65)');
    backing.addColorStop(1, 'rgba(12, 15, 20, 0)');
    ctx.fillStyle = backing;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.textBaseline = 'middle';

    // ==============================================
    // ACT I: THE VALUE YOU CREATE (0–4s)
    // ==============================================

    // -- HEADER (top anchor, small + tracked) --
    var headerAlpha = fadeIn(t, 0.2, 0.4);
    ctx.save();
    ctx.globalAlpha = headerAlpha * 0.7;
    ctx.textAlign = 'center';
    ctx.font = '500 18px "Space Grotesk", sans-serif';
    ctx.fillStyle = GOLD;
    if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '4px';
    ctx.fillText(dc.header.toUpperCase(), cx, 150);
    if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '0px';
    ctx.restore();

    // -- VALUE GENERATED (massive, centered, glow pulse) --
    var valueGenAlpha = fadeIn(t, 1.0, 0.6);
    if (valueGenAlpha > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = valueGenAlpha;
      ctx.font = '700 96px "JetBrains Mono", monospace';
      ctx.fillStyle = GOLD;
      var glowIntensity = t < 2.0 ? fadeIn(t, 1.0, 1.0) : Math.max(0.3, 1.0 - fadeIn(t, 2.0, 0.5) * 0.7);
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 40 * glowIntensity;
      var genVal = countUp(totalGenerated, t, 1.0, 1.2);
      ctx.fillText(formatCurrency(genVal), cx, 280);
      ctx.shadowBlur = 0;
      // Label below
      var labelAlpha = fadeIn(t, 1.3, 0.4);
      ctx.globalAlpha = labelAlpha * 0.8;
      ctx.font = '400 22px "Inter", sans-serif';
      ctx.fillStyle = CAPTION_COLOR;
      ctx.fillText(content.results.value_generated_context.replace('{{year}}', resultsData.formValues.start_year), cx, 370);
      ctx.restore();
    }

    // ==============================================
    // ACT II: THE REALITY (2.5–5.5s)
    // ==============================================

    // -- WAGES RECEIVED (centered) --
    var wagesAlpha = fadeIn(t, 2.5, 0.5);
    if (wagesAlpha > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = wagesAlpha;
      // Label above value
      ctx.font = '500 16px "Inter", sans-serif';
      ctx.fillStyle = CAPTION_COLOR;
      if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '2px';
      ctx.fillText('WAGES RECEIVED', cx, 470);
      if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '0px';
      // Value centered
      ctx.font = '600 68px "JetBrains Mono", monospace';
      ctx.fillStyle = TEXT_PRIMARY;
      var rcvVal = countUp(totalReceived, t, 2.5, 1.0);
      ctx.fillText(formatCurrency(rcvVal), cx, 540);
      ctx.restore();
    }

    // -- DIVIDER (draws from center outward) --
    var divAlpha = fadeIn(t, 4.0, 0.4);
    if (divAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = divAlpha * 0.4;
      ctx.strokeStyle = GAP_RED;
      ctx.lineWidth = 2;
      var divWidth = 680 * divAlpha;
      ctx.beginPath();
      ctx.moveTo((W - divWidth) / 2, 640);
      ctx.lineTo((W + divWidth) / 2, 640);
      ctx.stroke();
      ctx.restore();
    }

    // ==============================================
    // ACT III: THE REVELATION (4.5–7.5s)
    // ==============================================

    // -- "THE GAP" label --
    var gapLabelAlpha = fadeIn(t, 4.3, 0.4);
    if (gapLabelAlpha > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = gapLabelAlpha;
      ctx.font = '600 20px "Space Grotesk", sans-serif';
      ctx.fillStyle = GAP_RED;
      if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '6px';
      ctx.fillText('THE GAP', cx, 710);
      if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '0px';
      ctx.restore();
    }

    // -- THE GAP NUMBER (massive, gradient fill, scale-up, glow) --
    var heroAlpha = fadeIn(t, 4.5, 0.8);
    if (heroAlpha > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = heroAlpha;

      var scaleProgress = Math.min((t - 4.5) / 1.0, 1.0);
      var scale = 0.92 + 0.08 * (scaleProgress * scaleProgress * (3 - 2 * scaleProgress));
      var driftUp = Math.min((t - 4.5) / 2.0, 1.0) * 10;

      ctx.translate(cx, 810 - driftUp);
      ctx.scale(scale, scale);

      var gapGrad = ctx.createLinearGradient(0, -55, 0, 55);
      gapGrad.addColorStop(0, GOLD);
      gapGrad.addColorStop(1, GAP_RED);

      var gapGlow = t < 5.5 ? fadeIn(t, 4.5, 1.0) : (t < 7.0 ? 1.0 : Math.max(0.4, 1.0 - fadeIn(t, 7.0, 1.0) * 0.6));
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 80 * gapGlow;

      ctx.font = '700 110px "Space Grotesk", sans-serif';
      ctx.fillStyle = gapGrad;
      var displayVal = countUp(cumulative, t, 4.5, 1.8);
      ctx.fillText(formatCurrency(displayVal), 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // -- CONTEXT LINE (small, italic, muted) --
    var contextAlpha = fadeIn(t, 5.5, 0.5);
    if (contextAlpha > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = contextAlpha * 0.7;
      ctx.font = 'italic 400 18px "Inter", sans-serif';
      ctx.fillStyle = CAPTION_COLOR;
      ctx.fillText(content.results.hero_context_template, cx, 910);
      ctx.restore();
    }

    // ==============================================
    // ACT IV: THE CONSEQUENCES (7.0–10.5s)
    // ==============================================

    // -- ANNUAL GAP (centered) --
    var annualAlpha = fadeIn(t, 7.0, 0.5);
    if (annualAlpha > 0 && annualGap > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = annualAlpha;
      // Label above
      ctx.font = '500 14px "Inter", sans-serif';
      ctx.fillStyle = CAPTION_COLOR;
      if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '1.5px';
      ctx.fillText('ANNUAL GAP', cx, 990);
      if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '0px';
      // Value centered
      ctx.font = '700 52px "JetBrains Mono", monospace';
      ctx.fillStyle = GAP_RED;
      ctx.fillText(formatCurrency(annualGap) + '/yr', cx, 1040);
      ctx.restore();
    }

    // -- SURVIVAL METRICS (centered two-column block) --
    var survivalAlpha = fadeIn(t, 8.5, 0.6);
    if (survivalAlpha > 0 && (daysWorkedFree > 0 || rentMonths > 0)) {
      ctx.save();
      ctx.globalAlpha = survivalAlpha;
      ctx.textAlign = 'center';

      var metricY = 1120;
      var hasTwo = daysWorkedFree > 0 && rentMonths > 0;
      var col1X = hasTwo ? W * 0.3 : cx;
      var col2X = W * 0.7;

      if (daysWorkedFree > 0) {
        ctx.font = '600 38px "JetBrains Mono", monospace';
        ctx.fillStyle = GAP_RED;
        ctx.fillText(daysWorkedFree + ' days', col1X, metricY);
        ctx.font = '400 13px "Inter", sans-serif';
        ctx.fillStyle = CAPTION_COLOR;
        ctx.fillText('per year in structural gap', col1X, metricY + 30);
      }

      if (rentMonths > 0) {
        var rentCol = hasTwo ? col2X : cx;
        ctx.font = '600 38px "JetBrains Mono", monospace';
        ctx.fillStyle = GAP_RED;
        ctx.fillText(rentMonths + ' mo', rentCol, metricY);
        ctx.font = '400 13px "Inter", sans-serif';
        ctx.fillStyle = CAPTION_COLOR;
        ctx.fillText('months of unpaid labor', rentCol, metricY + 30);
      }
      ctx.restore();
    }

    // ==============================================
    // ACT V: THE SIGNATURE (9.5–12.0s)
    // ==============================================

    var footerAlpha = fadeIn(t, 9.5, 0.6);

    // -- LOGO / URL --
    if (logoLoaded && logoImage) {
      ctx.save();
      ctx.globalAlpha = footerAlpha;

      var logoH = 50;
      var logoW = Math.round(logoH * (1062 / 135));
      var logoX = (W - logoW) / 2;
      var logoY = 1400 - logoH / 2;

      // Gradient pill frame
      var pillPadH = 12;
      var pillPadW = 24;
      var pillR = 24;
      var rx = logoX - pillPadW;
      var ry = logoY - pillPadH;
      var rw = logoW + pillPadW * 2;
      var rh = logoH + pillPadH * 2;

      var pillGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
      pillGrad.addColorStop(0, '#E63946');
      pillGrad.addColorStop(0.35, '#D4721A');
      pillGrad.addColorStop(0.70, '#D4A054');
      pillGrad.addColorStop(1, '#E8A633');

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rx, ry, rw, rh, pillR);
      } else {
        ctx.moveTo(rx + pillR, ry);
        ctx.lineTo(rx + rw - pillR, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + pillR, pillR);
        ctx.lineTo(rx + rw, ry + rh - pillR);
        ctx.arcTo(rx + rw, ry + rh, rx + rw - pillR, ry + rh, pillR);
        ctx.lineTo(rx + pillR, ry + rh);
        ctx.arcTo(rx, ry + rh, rx, ry + rh - pillR, pillR);
        ctx.lineTo(rx, ry + pillR);
        ctx.arcTo(rx, ry, rx + pillR, ry, pillR);
        ctx.closePath();
      }
      ctx.strokeStyle = pillGrad;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);
      ctx.restore();
    } else {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = footerAlpha;
      ctx.font = '400 30px "Inter", sans-serif';
      ctx.fillStyle = TEXT_TERTIARY;
      ctx.fillText(dc.url, cx, 1400);
      ctx.restore();
    }

    // -- TAGLINE --
    ctx.save();
    ctx.textAlign = 'center';
    ctx.globalAlpha = footerAlpha;
    ctx.font = '600 26px "Space Grotesk", sans-serif';
    ctx.fillStyle = CAPTION_COLOR;
    ctx.fillText(dc.tagline, cx, 1500);
    ctx.restore();

    // -- WATERMARK --
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.textAlign = 'center';
    ctx.font = '400 14px "Inter", sans-serif';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.fillText(dc.watermark, cx, H - 30);
    ctx.restore();
  }

  // ------------------------------------
  // ANIMATION HELPERS
  // ------------------------------------
  function fadeIn(t, start, dur) {
    if (t < start) return 0;
    if (t >= start + dur) return 1;
    var p = (t - start) / dur;
    return p * p * (3 - 2 * p); // smoothstep
  }

  function countUp(target, t, start, dur) {
    if (t < start) return 0;
    if (t >= start + dur) return target;
    var p = (t - start) / dur;
    p = 1 - Math.pow(1 - p, 3); // ease-out cubic
    return Math.round(target * p);
  }

  // ------------------------------------
  // TEXT HELPERS
  // ------------------------------------
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    var lines = [];
    for (var i = 0; i < words.length; i++) {
      var testLine = line + words[i] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && i > 0) {
        lines.push(line.trim());
        line = words[i] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());
    var startY = y - ((lines.length - 1) * lineHeight) / 2;
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], x, startY + j * lineHeight);
    }
  }

  function formatCurrency(num) {
    if (num == null || isNaN(num)) return '$0';
    var abs = Math.abs(Math.round(num));
    var formatted = abs.toLocaleString('en-US');
    return (num < 0 ? '-$' : '$') + formatted;
  }

  // ------------------------------------
  // FONT READINESS
  // ------------------------------------
  function ensureFontsLoaded() {
    if (document.fonts && typeof document.fonts.ready !== 'undefined') {
      return document.fonts.ready;
    }
    return Promise.resolve();
  }

  // ------------------------------------
  // MP4 MUXER (dynamically loaded)
  // ------------------------------------
  var Mp4MuxerModule = null;

  function loadMp4Muxer() {
    if (Mp4MuxerModule) return Promise.resolve(Mp4MuxerModule);
    return import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/build/mp4-muxer.mjs').then(function (mod) {
      Mp4MuxerModule = mod;
      return mod;
    });
  }

  // ------------------------------------
  // FEATURE DETECTION
  // ------------------------------------
  function canMp4() {
    return typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';
  }

  function canWebm() {
    var testCanvas = document.createElement('canvas');
    if (typeof testCanvas.captureStream !== 'function') return false;
    if (typeof window.MediaRecorder === 'undefined') return false;
    if (!MediaRecorder.isTypeSupported('video/webm; codecs=vp8') &&
        !MediaRecorder.isTypeSupported('video/webm; codecs=vp9') &&
        !MediaRecorder.isTypeSupported('video/webm')) return false;
    return true;
  }

  function isSupported() {
    return canMp4() || canWebm();
  }

  // ------------------------------------
  // MAIN GENERATE — MP4 path (WebCodecs + mp4-muxer)
  // ------------------------------------
  function generateMp4(resultsData, content, onProgress, onComplete, onError) {
    generating = true;
    function cleanup() { generating = false; }

    var cumulative = resultsData.impact.summary.unrealized_productivity_gains;
    var selection = selectBackground(resultsData.formValues, cumulative);
    var tier = selection.tier;
    var bgInstance = selection.bgDef.create(selection.hash, selection.palette, selection.newtonColors);

    onProgress(0.05);

    Promise.all([ensureFontsLoaded(), loadMp4Muxer(), loadLogoImage()]).then(function (results) {
      var Mp4Muxer = results[1];
      onProgress(0.1);

      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');

      var muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: {
          codec: 'avc',
          width: W,
          height: H
        },
        fastStart: 'in-memory'
      });

      var encoder = new VideoEncoder({
        output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); },
        error: function (e) { cleanup(); onError(e); }
      });

      encoder.configure({
        codec: 'avc1.42001f',
        width: W,
        height: H,
        bitrate: 2500000,
        framerate: FPS
      });

      var totalFrames = DURATION * FPS;
      var frameIndex = 0;
      var frameDuration = 1000000 / FPS; // microseconds

      // Fractal frame cache — render fractal every 3rd frame, reuse for intermediates
      var bgCache = document.createElement('canvas');
      bgCache.width = W;
      bgCache.height = H;
      var bgCacheCtx = bgCache.getContext('2d');

      function encodeNextFrame() {
        if (frameIndex >= totalFrames) {
          // Finalize
          encoder.flush().then(function () {
            muxer.finalize();
            var buffer = muxer.target.buffer;
            var blob = new Blob([buffer], { type: 'video/mp4' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'ruptura-impact.mp4';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            onProgress(1);
            cleanup();
            onComplete();
          }).catch(function (err) { cleanup(); onError(err); });
          return;
        }

        var elapsed = frameIndex / FPS;

        // Only re-render the fractal background every 3rd frame (~66% fewer fractal renders)
        if (frameIndex % 3 === 0) {
          bgInstance.render(bgCacheCtx, elapsed);
        }
        // Reset canvas state before drawing cached fractal to prevent ghosting
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(bgCache, 0, 0);
        drawTextOverlay(ctx, resultsData, content, tier, elapsed, selection.bgDef.id);

        var frame = new VideoFrame(canvas, {
          timestamp: frameIndex * frameDuration,
          duration: frameDuration
        });

        var isKeyFrame = frameIndex % (FPS * 2) === 0;
        encoder.encode(frame, { keyFrame: isKeyFrame });
        frame.close();

        frameIndex++;

        var progress = 0.1 + (frameIndex / totalFrames) * 0.85;
        onProgress(Math.min(progress, 0.95));

        // Yield to the browser every 8 frames to keep UI responsive
        if (frameIndex % 8 === 0) {
          setTimeout(encodeNextFrame, 0);
        } else {
          encodeNextFrame();
        }
      }

      encodeNextFrame();

    }).catch(function (err) {
      cleanup();
      onError(err);
    });
  }

  // ------------------------------------
  // MAIN GENERATE — WebM fallback path (MediaRecorder)
  // ------------------------------------
  function generateWebm(resultsData, content, onProgress, onComplete, onError) {
    generating = true;
    function cleanup() { generating = false; }

    var cumulative = resultsData.impact.summary.unrealized_productivity_gains;
    var selection = selectBackground(resultsData.formValues, cumulative);
    var tier = selection.tier;
    var bgInstance = selection.bgDef.create(selection.hash, selection.palette, selection.newtonColors);

    onProgress(0.1);

    Promise.all([ensureFontsLoaded(), loadLogoImage()]).then(function () {
      onProgress(0.15);

      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');

      var mimeType = 'video/webm';
      if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
        mimeType = 'video/webm; codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
        mimeType = 'video/webm; codecs=vp8';
      }

      var stream = canvas.captureStream(FPS);
      var recorder = new MediaRecorder(stream, {
        mimeType: mimeType,
        videoBitsPerSecond: 2500000
      });

      var chunks = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      var startTime = null;
      var stopped = false;
      var timedOut = false;

      var safetyTimeout = setTimeout(function () {
        if (!stopped) {
          timedOut = true;
          stopped = true;
          try { recorder.stop(); } catch (e) {}
        }
      }, 20000);

      recorder.onstop = function () {
        clearTimeout(safetyTimeout);
        cleanup();
        if (timedOut || chunks.length === 0) {
          onError(new Error(timedOut ? 'Recording timeout' : 'No data recorded'));
          return;
        }
        var blob = new Blob(chunks, { type: mimeType });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'ruptura-impact.mp4';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        onProgress(1);
        onComplete();
      };

      recorder.onerror = function (e) {
        clearTimeout(safetyTimeout);
        stopped = true;
        cleanup();
        onError(e.error || new Error('MediaRecorder error'));
      };

      recorder.start(100);

      // Fractal frame cache for WebM path — re-render fractal at ~8fps, reuse between
      var bgCacheWm = document.createElement('canvas');
      bgCacheWm.width = W;
      bgCacheWm.height = H;
      var bgCacheWmCtx = bgCacheWm.getContext('2d');
      var lastBgRender = -1;

      function renderFrame(timestamp) {
        if (stopped) return;
        if (startTime === null) startTime = timestamp;
        var elapsed = (timestamp - startTime) / 1000;

        if (elapsed >= DURATION) {
          stopped = true;
          recorder.stop();
          return;
        }

        // Re-render fractal ~12 times per second (50% increase from 8fps)
        var bgSlot = Math.floor(elapsed * 12);
        if (bgSlot !== lastBgRender) {
          bgInstance.render(bgCacheWmCtx, elapsed);
          lastBgRender = bgSlot;
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(bgCacheWm, 0, 0);
        drawTextOverlay(ctx, resultsData, content, tier, elapsed, selection.bgDef.id);

        var progress = 0.15 + (elapsed / DURATION) * 0.8;
        onProgress(Math.min(progress, 0.95));
        requestAnimationFrame(renderFrame);
      }

      requestAnimationFrame(renderFrame);

    }).catch(function (err) {
      cleanup();
      onError(err);
    });
  }

  // ------------------------------------
  // PUBLIC GENERATE — dispatches to MP4 or WebM path
  // ------------------------------------
  function generate(resultsData, content, onProgress, onComplete, onError) {
    if (generating) return;

    if (canMp4()) {
      generateMp4(resultsData, content, onProgress, onComplete, function (err) {
        // If MP4 encoding fails, try WebM fallback
        console.warn('MP4 encoding failed, falling back to WebM:', err);
        if (canWebm()) {
          generating = false;
          generateWebm(resultsData, content, onProgress, onComplete, onError);
        } else {
          onError(err);
        }
      });
    } else if (canWebm()) {
      generateWebm(resultsData, content, onProgress, onComplete, onError);
    } else {
      onError(new Error('Video recording not supported'));
    }
  }

  // ------------------------------------
  // PUBLIC API
  // ------------------------------------
  window.RupturaVideoCard = {
    isSupported: isSupported,
    generate: generate
  };

})();
