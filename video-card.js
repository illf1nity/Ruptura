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
  var DURATION = 5; // seconds
  var FPS = 30;

  // Fractal render resolution (1/4 scale for performance)
  var FW = 270;
  var FH = 480;

  // Design tokens
  var BG_PRIMARY = '#0C0F14';
  var GOLD = '#D4A054';
  var TEXT_PRIMARY = '#F0EDE8';
  var TEXT_SECONDARY = '#9CA3AF';
  var TEXT_TERTIARY = '#6B7280';
  var GAP_RED = '#C45B4A';
  var GROWTH_GREEN = '#4A9B7F';
  var BORDER_SUBTLE = '#2A3040';

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
      img.src = 'ruptura_logo.svg?v=2';
    });
  }

  // ------------------------------------
  // COLOR PALETTE (pre-computed for fractals)
  // ------------------------------------
  var PALETTE = buildPalette();

  function buildPalette() {
    var p = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var t = i / 255;
      // Iq-style cosine palette: gold/amber on dark
      // a + b * cos(2π(c*t + d))
      var phase = t * 2.5;
      p[i * 3]     = clamp8(12 + 210 * cp(phase + 0.0));
      p[i * 3 + 1] = clamp8(10 + 155 * cp(phase + 0.12));
      p[i * 3 + 2] = clamp8(8  + 80  * cp(phase + 0.28));
    }
    return p;
  }

  function cp(t) { return 0.5 + 0.5 * Math.cos(6.28318 * t); }
  function clamp8(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.floor(v); }

  // Newton's fractal uses a 3-tone palette
  var NEWTON_COLORS = [
    [212, 160, 84],   // root 1: gold
    [184, 120, 50],   // root 2: dark amber
    [232, 200, 122]   // root 3: light gold
  ];

  // ------------------------------------
  // FRACTAL BACKGROUNDS (factories)
  // ------------------------------------
  var backgroundDefs = [

    // ---- BG 1: JULIA SET MORPH ----
    // Zoomed into fractal boundary, c orbits to create visible morphing
    {
      id: 'julia-morph',
      name: 'Julia Morph',
      tiers: ['positive', 'moderate', 'severe'],
      create: function (seed) {
        var offCanvas = document.createElement('canvas');
        offCanvas.width = FW;
        offCanvas.height = FH;
        var offCtx = offCanvas.getContext('2d');
        var imgData = offCtx.createImageData(FW, FH);
        var pix = imgData.data;
        var maxIter = 40;

        var rng = makeRng(seed);
        // Pick from known beautiful Julia c-values
        var cPresets = [
          [-0.7269, 0.1889],  // dendritic branches
          [-0.8, 0.156],      // dramatic tentacles
          [0.285, 0.01],      // subtle organic swirls
          [-0.4, 0.6],        // lightning bolts
        ];
        var pick = cPresets[Math.floor(rng() * cPresets.length)];
        var cx0 = pick[0];
        var cy0 = pick[1];
        var orbitR = 0.008 + rng() * 0.012;
        // Zoom into a region near the fractal boundary
        var viewCx = (rng() - 0.5) * 0.3;
        var viewCy = (rng() - 0.5) * 0.3;

        return {
          render: function (ctx, t) {
            var angle = t * 0.8; // faster orbit = more visible morphing
            var cr = cx0 + orbitR * Math.cos(angle);
            var ci = cy0 + orbitR * Math.sin(angle);

            // Tight zoom that fills the frame with fractal detail
            var scale = 1.4;
            // Slow pan through the fractal
            var panX = viewCx + Math.sin(t * 0.3) * 0.1;
            var panY = viewCy + Math.cos(t * 0.2) * 0.08;
            var aspect = FH / FW;
            var ox = panX - scale / 2;
            var oy = panY - scale * aspect / 2;
            var sh = scale * aspect;

            for (var py = 0; py < FH; py++) {
              for (var px = 0; px < FW; px++) {
                var zr = ox + (px / FW) * scale;
                var zi = oy + (py / FH) * sh;

                var iter = 0;
                var zr2 = zr * zr;
                var zi2 = zi * zi;

                while (zr2 + zi2 < 4 && iter < maxIter) {
                  zi = 2 * zr * zi + ci;
                  zr = zr2 - zi2 + cr;
                  zr2 = zr * zr;
                  zi2 = zi * zi;
                  iter++;
                }

                var idx = (py * FW + px) * 4;
                if (iter === maxIter) {
                  pix[idx] = 12; pix[idx + 1] = 15; pix[idx + 2] = 20; pix[idx + 3] = 255;
                } else {
                  // Smooth coloring
                  var smooth = iter + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / 0.6931;
                  var ci2 = ((smooth / maxIter) * 255) | 0;
                  if (ci2 < 0) ci2 = 0; if (ci2 > 255) ci2 = 255;
                  pix[idx]     = PALETTE[ci2 * 3];
                  pix[idx + 1] = PALETTE[ci2 * 3 + 1];
                  pix[idx + 2] = PALETTE[ci2 * 3 + 2];
                  pix[idx + 3] = 255;
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

    // ---- BG 2: MANDELBROT DRIFT ----
    // Already zoomed into an interesting boundary region, continuous zoom
    {
      id: 'mandelbrot-drift',
      name: 'Mandelbrot Drift',
      tiers: ['moderate', 'severe'],
      create: function (seed) {
        var offCanvas = document.createElement('canvas');
        offCanvas.width = FW;
        offCanvas.height = FH;
        var offCtx = offCanvas.getContext('2d');
        var imgData = offCtx.createImageData(FW, FH);
        var pix = imgData.data;
        var maxIter = 45;

        var rng = makeRng(seed);
        // Deep zoom targets — already at interesting detail level
        var targets = [
          [-0.743643887037, 0.131825904205],  // seahorse valley spiral
          [-0.16, 1.0405],                     // near the top antenna
          [-1.25066, 0.02012],                 // mini-brot in the antenna
          [-0.235125, 0.827215],               // spiral arm
        ];
        var pick = targets[Math.floor(rng() * targets.length)];
        var targetX = pick[0];
        var targetY = pick[1];

        return {
          render: function (ctx, t) {
            // Start already zoomed in, continue zooming deeper
            var progress = t / DURATION;
            var startZoom = 0.15; // already tight
            var endZoom = 0.005;  // very deep
            var zoom = startZoom * Math.pow(endZoom / startZoom, progress);

            var aspect = FH / FW;
            var x0 = targetX - zoom / 2;
            var y0 = targetY - zoom * aspect / 2;
            var dx = zoom / FW;
            var dy = zoom * aspect / FH;

            for (var py = 0; py < FH; py++) {
              var ci = y0 + py * dy;
              for (var px = 0; px < FW; px++) {
                var cr = x0 + px * dx;
                var zr = 0, zi = 0;
                var zr2 = 0, zi2 = 0;
                var iter = 0;

                while (zr2 + zi2 < 4 && iter < maxIter) {
                  zi = 2 * zr * zi + ci;
                  zr = zr2 - zi2 + cr;
                  zr2 = zr * zr;
                  zi2 = zi * zi;
                  iter++;
                }

                var idx = (py * FW + px) * 4;
                if (iter === maxIter) {
                  pix[idx] = 12; pix[idx + 1] = 15; pix[idx + 2] = 20; pix[idx + 3] = 255;
                } else {
                  var smooth = iter + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / 0.6931;
                  var ci2 = ((smooth / maxIter) * 255) | 0;
                  if (ci2 < 0) ci2 = 0; if (ci2 > 255) ci2 = 255;
                  pix[idx]     = PALETTE[ci2 * 3];
                  pix[idx + 1] = PALETTE[ci2 * 3 + 1];
                  pix[idx + 2] = PALETTE[ci2 * 3 + 2];
                  pix[idx + 3] = 255;
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

    // ---- BG 3: NEWTON BASIN ----
    // Newton's method on z^3 - 1, zoomed into swirling basin boundaries
    {
      id: 'newton-basin',
      name: 'Newton Basin',
      tiers: ['positive', 'moderate', 'severe'],
      create: function (seed) {
        var offCanvas = document.createElement('canvas');
        offCanvas.width = FW;
        offCanvas.height = FH;
        var offCtx = offCanvas.getContext('2d');
        var imgData = offCtx.createImageData(FW, FH);
        var pix = imgData.data;
        var maxIter = 25;

        var rng = makeRng(seed);
        var rotSpeed = 0.25 + rng() * 0.2; // faster rotation
        var initAngle = rng() * 6.28318;
        // Zoom into a boundary between basins for maximum detail
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

            // Tight zoom — fills screen with swirling basin boundaries
            var scale = 1.2;
            var aspect = FH / FW;
            // Slow pan through the fractal
            var cx = viewCx + Math.sin(t * 0.4) * 0.15;
            var cy = viewCy + Math.cos(t * 0.3) * 0.12;
            var hw = scale / 2;
            var hh = scale * aspect / 2;

            for (var py = 0; py < FH; py++) {
              for (var px = 0; px < FW; px++) {
                // Map pixel to complex plane centered on view, then rotate
                var ux = cx - hw + (px / FW) * scale;
                var uy = cy - hh + (py / FH) * scale * aspect;
                var zr = ux * cosA - uy * sinA;
                var zi = ux * sinA + uy * cosA;

                var iter = 0;
                var converged = -1;

                for (iter = 0; iter < maxIter; iter++) {
                  var zr2 = zr * zr;
                  var zi2 = zi * zi;

                  // z^3
                  var z3r = zr * (zr2 - 3 * zi2);
                  var z3i = zi * (3 * zr2 - zi2);

                  // f(z) = z^3 - 1, f'(z) = 3z^2
                  var fr = z3r - 1;
                  var fi = z3i;
                  var dr = 3 * (zr2 - zi2);
                  var di = 6 * zr * zi;

                  // complex division: (fr + fi*i) / (dr + di*i)
                  var dMag = dr * dr + di * di;
                  if (dMag < 0.0000001) dMag = 0.0000001;
                  var qr = (fr * dr + fi * di) / dMag;
                  var qi = (fi * dr - fr * di) / dMag;

                  zr = zr - qr;
                  zi = zi - qi;

                  // Check convergence to each root
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
                  var col = NEWTON_COLORS[converged];
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
    return { bgDef: eligible[index], tier: tier, hash: hash };
  }

  // ------------------------------------
  // TEXT OVERLAY (improved layout + animation)
  // ------------------------------------
  function drawTextOverlay(ctx, resultsData, content, tier, t) {
    var dc = content.download_card;
    var cumulative = resultsData.impact.summary.cumulative_economic_impact;
    var worth = resultsData.worth;

    var heroColor = GOLD;
    if (tier === 'severe') heroColor = GAP_RED;
    if (tier === 'positive') heroColor = GROWTH_GREEN;

    // -- Dark backing gradient for text readability --
    var backAlpha = Math.min(t / 0.3, 1) * 0.65;
    ctx.save();
    ctx.globalAlpha = backAlpha;
    var backing = ctx.createLinearGradient(0, 200, 0, 1300);
    backing.addColorStop(0, 'rgba(12, 15, 20, 0)');
    backing.addColorStop(0.12, 'rgba(12, 15, 20, 1)');
    backing.addColorStop(0.88, 'rgba(12, 15, 20, 1)');
    backing.addColorStop(1, 'rgba(12, 15, 20, 0)');
    ctx.fillStyle = backing;
    ctx.fillRect(0, 200, W, 1100);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // -- Staggered fade-in timing --
    var headerAlpha = fadeIn(t, 0.2, 0.4);
    var heroAlpha = fadeIn(t, 0.5, 0.5);
    var contextAlpha = fadeIn(t, 1.2, 0.4);
    var secondaryAlpha = fadeIn(t, 1.8, 0.4);
    var footerAlpha = fadeIn(t, 2.2, 0.4);

    // -- HEADER (vertically centered layout) --
    ctx.save();
    ctx.globalAlpha = headerAlpha;
    ctx.font = '400 30px "Space Grotesk", sans-serif';
    ctx.fillStyle = TEXT_SECONDARY;
    if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '4px';
    ctx.fillText(dc.header.toUpperCase(), W / 2, 520);
    if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '0px';
    ctx.restore();

    // -- HERO NUMBER (count-up animation) --
    ctx.save();
    ctx.globalAlpha = heroAlpha;
    ctx.font = '700 110px "JetBrains Mono", monospace';
    ctx.fillStyle = heroColor;
    ctx.shadowColor = heroColor;
    ctx.shadowBlur = 40;
    var displayVal = countUp(cumulative, t, 0.5, 2.0);
    ctx.fillText(formatCurrency(displayVal), W / 2, 720);
    ctx.restore();

    // -- CONTEXT LINE --
    ctx.save();
    ctx.globalAlpha = contextAlpha;
    ctx.font = '300 38px "Space Grotesk", sans-serif';
    ctx.fillStyle = TEXT_PRIMARY;
    wrapText(ctx, content.results.hero_context_template, W / 2, 870, 820, 54);
    ctx.restore();

    // -- SECONDARY STAT --
    if (worth && worth.worthGap && worth.worthGap.annual > 0) {
      ctx.save();
      ctx.globalAlpha = secondaryAlpha;
      ctx.font = '400 30px "Inter", sans-serif';
      ctx.fillStyle = TEXT_SECONDARY;
      var secondaryText = formatCurrency(worth.worthGap.annual) +
        '/yr ' + content.results.secondary_context_template;
      wrapText(ctx, secondaryText, W / 2, 1040, 740, 44);
      ctx.restore();
    }

    // -- THIN DECORATIVE LINE --
    ctx.save();
    ctx.globalAlpha = footerAlpha * 0.4;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((W - 300) / 2, H - 310);
    ctx.lineTo((W + 300) / 2, H - 310);
    ctx.stroke();
    ctx.restore();

    // -- LOGO / URL --
    if (logoLoaded && logoImage) {
      ctx.save();
      ctx.globalAlpha = footerAlpha;

      // Logo native: 1062x135 (aspect 7.87:1)
      var logoH = 60;
      var logoW = Math.round(logoH * (1062 / 135));
      var logoX = (W - logoW) / 2;
      var logoY = (H - 250) - logoH / 2;

      // Gradient pill frame behind logo (red → orange → amber → gold)
      var pillPadH = 14;
      var pillPadW = 28;
      var pillR = 16;
      var rx = logoX - pillPadW;
      var ry = logoY - pillPadH;
      var rw = logoW + pillPadW * 2;
      var rh = logoH + pillPadH * 2;

      // Helper: draw rounded rect path
      function drawPillPath(c, x, y, w, h, r) {
        c.beginPath();
        if (c.roundRect) {
          c.roundRect(x, y, w, h, r);
        } else {
          c.moveTo(x + r, y);
          c.lineTo(x + w - r, y);
          c.arcTo(x + w, y, x + w, y + r, r);
          c.lineTo(x + w, y + h - r);
          c.arcTo(x + w, y + h, x + w - r, y + h, r);
          c.lineTo(x + r, y + h);
          c.arcTo(x, y + h, x, y + h - r, r);
          c.lineTo(x, y + r);
          c.arcTo(x, y, x + r, y, r);
          c.closePath();
        }
      }

      // Gradient stroke border only — no fill, transparent interior
      var pillGrad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
      pillGrad.addColorStop(0, '#C45B4A');
      pillGrad.addColorStop(0.35, '#D4721A');
      pillGrad.addColorStop(0.70, '#D4A054');
      pillGrad.addColorStop(1, '#E8A633');
      drawPillPath(ctx, rx, ry, rw, rh, pillR);
      ctx.strokeStyle = pillGrad;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Draw logo on top of the light pill (no shadow)
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.drawImage(logoImage, logoX, logoY, logoW, logoH);

      ctx.restore();
    } else {
      // Fallback: render URL text if logo unavailable
      ctx.save();
      ctx.globalAlpha = footerAlpha;
      ctx.font = '400 34px "Inter", sans-serif';
      ctx.fillStyle = TEXT_TERTIARY;
      ctx.fillText(dc.url, W / 2, H - 220);
      ctx.restore();
    }

    // -- TAGLINE (vivid red-orange for visibility) --
    ctx.save();
    ctx.globalAlpha = footerAlpha;
    ctx.font = '600 30px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#E8563A';
    ctx.fillText(dc.tagline, W / 2, H - 150);
    ctx.restore();

    // -- WATERMARK --
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.textAlign = 'left';
    ctx.font = '400 18px "Inter", sans-serif';
    ctx.fillStyle = TEXT_PRIMARY;
    ctx.fillText(dc.watermark, 80, H - 40);
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

    var cumulative = resultsData.impact.summary.cumulative_economic_impact;
    var selection = selectBackground(resultsData.formValues, cumulative);
    var tier = selection.tier;
    var bgInstance = selection.bgDef.create(selection.hash);

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
        bitrate: 4000000,
        framerate: FPS
      });

      var totalFrames = DURATION * FPS;
      var frameIndex = 0;
      var frameDuration = 1000000 / FPS; // microseconds

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

        bgInstance.render(ctx, elapsed);
        drawTextOverlay(ctx, resultsData, content, tier, elapsed);

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

        // Yield to the browser every 4 frames to keep UI responsive
        if (frameIndex % 4 === 0) {
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

    var cumulative = resultsData.impact.summary.cumulative_economic_impact;
    var selection = selectBackground(resultsData.formValues, cumulative);
    var tier = selection.tier;
    var bgInstance = selection.bgDef.create(selection.hash);

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
        videoBitsPerSecond: 4000000
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
      }, 30000);

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

      function renderFrame(timestamp) {
        if (stopped) return;
        if (startTime === null) startTime = timestamp;
        var elapsed = (timestamp - startTime) / 1000;

        if (elapsed >= DURATION) {
          stopped = true;
          recorder.stop();
          return;
        }

        bgInstance.render(ctx, elapsed);
        drawTextOverlay(ctx, resultsData, content, tier, elapsed);

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
