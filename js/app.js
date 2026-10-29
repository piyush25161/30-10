/* ============================================================
 *  app.js - Photo Story  ♥
 *  Pure vanilla JS, no dependencies.
 *  Orchestrates: loading → intro → slideshow → final screen.
 * ============================================================ */
(function () {
  'use strict';

  /* ── Tiny helpers ─────────────────────────────────────── */
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => [...(c || document).querySelectorAll(s)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Heart SVG for progress bar */
  const HEART_SVG =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 ' +
    '2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 ' +
    '14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-' +
    '8.55 11.54L12 21.35z"/></svg>';

  /* Corner-sticker SVG (hand-drawn L-bracket) */
  const CORNER_SVG =
    '<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" ' +
    'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 36 L4 8 Q4 4 8 4 L36 4"/></svg>';

  /* ============================================================
   *  GLOBAL STATE
   * ============================================================ */
  const state = {
    currentPage: -1,        // -1 = intro, 0-6 = slides, 7 = final
    totalSlides: 0,
    audioUnlocked: false,
    isMuted: false,
    hasInteracted: false,   // tracks if user swiped (hides hint)
    isTransitioning: false,
    isDragging: false,
    dragStartX: 0,
    dragCurrentX: 0,
    particleSystems: [],
  };

  /* ============================================================
   *  AUDIO MANAGER
   *  HTML5 Audio + rAF-driven volume fades.
   *  iOS Safari: play() inside first user-gesture → unlock().
   * ============================================================ */
  const AudioMgr = {
    tracks: [],
    currentIdx: -1,
    _fades: new Map(),

    init() {
      CONFIG.slides.forEach((slide, i) => {
        const a = new window.Audio();
        a.preload = i < 2 ? 'auto' : 'metadata';
        a.loop = true;
        a.volume = 0;
        a.src = slide.song;
        a.addEventListener('error', () => { a._missing = true; });
        this.tracks.push(a);
      });
    },

    /* Unlock audio on first user gesture (iOS requirement) */
    unlock() {
      if (state.audioUnlocked) return;
      this.tracks.forEach((a) => {
        if (a._missing) return;
        const p = a.play();
        if (p) p.then(() => a.pause()).catch(() => { });
      });
      state.audioUnlocked = true;
    },

    play(idx) {
      if (idx < 0 || idx >= this.tracks.length) return;
      const slide = CONFIG.slides[idx];
      const a = this.tracks[idx];
      if (a._missing) return;

      /* Fade out the previous track */
      if (this.currentIdx >= 0 && this.currentIdx !== idx) {
        this.fade(this.currentIdx, 'out', 1200);
      }

      a.currentTime = slide.startAt || 0;
      a.volume = 0;
      this.currentIdx = idx;

      if (!state.isMuted) {
        a.play().catch(() => { });
        this.fade(idx, 'in', 1200);
      }

      /* Preload the next track */
      const next = idx + 1;
      if (next < this.tracks.length && this.tracks[next].preload !== 'auto') {
        this.tracks[next].preload = 'auto';
        this.tracks[next].load();
      }
    },

    fade(idx, dir, ms) {
      const a = this.tracks[idx];
      if (!a || a._missing) return;
      const prev = this._fades.get(idx);
      if (prev) cancelAnimationFrame(prev.raf);

      const target = dir === 'in' ? 0.75 : 0;
      const startVol = a.volume;
      const t0 = performance.now();

      const step = (now) => {
        const p = clamp((now - t0) / ms, 0, 1);
        try { a.volume = lerp(startVol, target, p); } catch (_) { /* noop */ }
        if (p < 1) {
          this._fades.set(idx, { raf: requestAnimationFrame(step), dir });
        } else {
          this._fades.delete(idx);
          if (dir === 'out') { try { a.pause(); } catch (_) { } }
        }
      };
      this._fades.set(idx, { raf: requestAnimationFrame(step), dir });
    },

    /* Proportional crossfade during drag (0 = full vol, 1 = silent) */
    setDragVolume(idx, dragProgress) {
      const a = this.tracks[idx];
      if (!a || a._missing || state.isMuted) return;
      /* Cancel any running fade so we control volume directly */
      const prev = this._fades.get(idx);
      if (prev) { cancelAnimationFrame(prev.raf); this._fades.delete(idx); }
      try { a.volume = clamp(0.75 * (1 - dragProgress), 0, 1); } catch (_) { }
    },

    toggleMute() {
      state.isMuted = !state.isMuted;
      const idx = this.currentIdx;
      /* Pause vinyl animation */
      const vinyl = $('.vinyl');
      if (vinyl) vinyl.classList.toggle('paused', state.isMuted);

      if (idx < 0 || idx >= this.tracks.length) return state.isMuted;
      const a = this.tracks[idx];
      if (a._missing) return state.isMuted;

      if (state.isMuted) {
        this.fade(idx, 'out', 400);
      } else {
        a.play().catch(() => { });
        this.fade(idx, 'in', 400);
      }
      return state.isMuted;
    },

    stopAll() {
      this._fades.forEach((v) => cancelAnimationFrame(v.raf));
      this._fades.clear();
      this.tracks.forEach((a) => {
        try { a.pause(); a.volume = 0; } catch (_) { }
      });
      this.currentIdx = -1;
    },

    handleVisibility(hidden) {
      const idx = this.currentIdx;
      if (idx < 0 || !this.tracks[idx]) return;
      const a = this.tracks[idx];
      if (a._missing) return;
      try {
        if (hidden) { a.pause(); }
        else if (!state.isMuted) { a.play().catch(() => { }); }
      } catch (_) { }
    },
  };

  /* ============================================================
   *  PARTICLE SYSTEM
   *  Canvas-based hearts / sparkles / bokeh orbs.
   *  One instance per slide, plus one for intro & final.
   * ============================================================ */
  class Particles {
    constructor(canvas, accentColor) {
      this.cvs = canvas;
      this.ctx = canvas.getContext('2d');
      this.accent = accentColor || '#f4a0b5';
      this.particles = [];
      this.running = false;
      this.mouseX = 0.5;
      this.mouseY = 0.5;
      this._raf = null;
      this._spawnTimer = null;
    }

    resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = this.cvs.clientWidth;
      const h = this.cvs.clientHeight;
      this.cvs.width = Math.max(1, w) * dpr;
      this.cvs.height = Math.max(1, h) * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w || window.innerWidth;
      this.h = h || window.innerHeight;
    }

    spawn(type) {
      const col = this.accent;
      const base = {
        x: Math.random() * (this.w || window.innerWidth),
        y: (this.h || window.innerHeight) + 10,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(Math.random() * 0.7 + 0.3),
        size: 0,
        opacity: 0,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.018,
        life: 1,
        decay: Math.random() * 0.0015 + 0.0008,
        color: col,
        type,
      };
      switch (type) {
        case 'heart':
          base.size = Math.random() * 10 + 6;
          break;
        case 'sparkle':
          base.size = Math.random() * 5 + 2;
          base.y = Math.random() * (this.h || window.innerHeight);
          base.x = Math.random() * (this.w || window.innerWidth);
          base.vy = (Math.random() - 0.5) * 0.2;
          base.decay = Math.random() * 0.004 + 0.002;
          base.color = '#ffffff';
          break;
        case 'bokeh':
          base.size = Math.random() * 50 + 20;
          base.y = Math.random() * (this.h || window.innerHeight);
          base.vx *= 0.1;
          base.vy = (Math.random() - 0.5) * 0.1;
          base.decay = Math.random() * 0.001 + 0.0004;
          base.opacity = 0;
          break;
      }
      this.particles.push(base);
    }

    update() {
      const px = (this.mouseX - 0.5) * 1.5;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx + px * (p.size * 0.006);
        p.y += p.vy;
        p.rot += p.rotV;
        p.life -= p.decay;
        p.opacity = p.type === 'bokeh'
          ? Math.sin(p.life * Math.PI) * 0.1
          : p.life * 0.5;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    }

    draw() {
      const W = this.w || window.innerWidth;
      const H = this.h || window.innerHeight;
      this.ctx.clearRect(0, 0, W, H);
      for (const p of this.particles) {
        this.ctx.save();
        this.ctx.globalAlpha = clamp(p.opacity, 0, 1);
        if (p.type === 'heart') this._drawHeart(p);
        if (p.type === 'sparkle') this._drawSparkle(p);
        if (p.type === 'bokeh') this._drawBokeh(p, W, H);
        this.ctx.restore();
      }
    }

    _drawHeart(p) {
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rot);
      this.ctx.fillStyle = p.color;
      const s = p.size / 2;
      this.ctx.beginPath();
      this.ctx.moveTo(0, s * 0.3);
      this.ctx.bezierCurveTo(-s, -s * 0.6, -s * 0.9, s * 0.45, 0, s);
      this.ctx.bezierCurveTo(s * 0.9, s * 0.45, s, -s * 0.6, 0, s * 0.3);
      this.ctx.fill();
    }

    _drawSparkle(p) {
      this.ctx.translate(p.x, p.y);
      this.ctx.fillStyle = p.color;
      const s = p.size;
      this.ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a1 = (i / 4) * Math.PI * 2;
        const a2 = a1 + Math.PI / 4;
        this.ctx.lineTo(Math.cos(a1) * s, Math.sin(a1) * s);
        this.ctx.lineTo(Math.cos(a2) * s * 0.3, Math.sin(a2) * s * 0.3);
      }
      this.ctx.closePath();
      this.ctx.fill();
    }

    _drawBokeh(p) {
      const g = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, p.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      this.ctx.fillStyle = g;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }

    start() {
      if (reducedMotion()) return;
      if (this.running) return;
      this.running = true;
      this.resize();
      this._loop();
      const types = ['heart', 'sparkle', 'bokeh'];
      /* Seed immediately so screen isn't empty on first render */
      for (let i = 0; i < 10; i++) this.spawn(types[i % 3]);
      this._spawnTimer = setInterval(() => {
        if (!this.running) return;
        this.spawn(types[Math.floor(Math.random() * types.length)]);
      }, 380);
    }

    stop() {
      this.running = false;
      clearInterval(this._spawnTimer);
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
      /* Clear canvas so it doesn't show stale particles if page is re-entered */
      if (this.ctx && this.w) this.ctx.clearRect(0, 0, this.w, this.h);
    }

    _loop() {
      if (!this.running) return;
      this.update();
      this.draw();
      this._raf = requestAnimationFrame(() => this._loop());
    }
  }

  /* ============================================================
   *  TAP-HEARTS CANVAS
   *  Hearts burst from wherever she taps / clicks.
   * ============================================================ */
  const TapHearts = {
    cvs: null, ctx: null, hearts: [], _raf: null,

    init() {
      this.cvs = $('#tap-canvas');
      this.ctx = this.cvs.getContext('2d');
      this._resize();
      window.addEventListener('resize', () => this._resize());
      document.addEventListener('pointerdown', (e) => {
        this._burst(e.clientX, e.clientY);
      });
    },

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      this.cvs.width = window.innerWidth * dpr;
      this.cvs.height = window.innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    _burst(x, y) {
      if (reducedMotion()) return;
      const accent = (state.currentPage >= 0 && state.currentPage < state.totalSlides)
        ? CONFIG.slides[state.currentPage].accentColor
        : '#f4a0b5';
      for (let i = 0; i < 7; i++) {
        const angle = (Math.random() * Math.PI * 2);
        const speed = Math.random() * 3 + 1;
        this.hearts.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2.5,
          size: Math.random() * 12 + 7,
          life: 1,
          color: accent,
        });
      }
      if (!this._raf) this._loop();
    },

    _loop() {
      this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = this.hearts.length - 1; i >= 0; i--) {
        const h = this.hearts[i];
        h.x += h.vx;
        h.y += h.vy;
        h.vy += 0.09;   /* gravity */
        h.life -= 0.02;
        if (h.life <= 0) { this.hearts.splice(i, 1); continue; }
        this.ctx.save();
        this.ctx.globalAlpha = h.life;
        this.ctx.fillStyle = h.color;
        this.ctx.font = `${h.size}px serif`;
        this.ctx.fillText('♥', h.x, h.y);
        this.ctx.restore();
      }
      if (this.hearts.length) {
        this._raf = requestAnimationFrame(() => this._loop());
      } else {
        this._raf = null;
      }
    },
  };

  /* ============================================================
   *  TYPEWRITER - word-by-word staggered fade-in
   * ============================================================ */
  const TypeWriter = {
    _timer: null,

    run(container, text, delay) {
      clearTimeout(this._timer);
      container.innerHTML = '';

      text.trim().split(/\s+/).forEach((word) => {
        const span = document.createElement('span');
        span.className = 'msg-word';
        span.textContent = word;
        container.appendChild(span);
      });

      const spans = $$('.msg-word', container);
      let i = 0;
      const reveal = () => {
        if (i >= spans.length) return;
        spans[i].classList.add('visible');
        i++;
        this._timer = setTimeout(reveal, 65 + Math.random() * 45);
      };
      this._timer = setTimeout(reveal, delay || 600);
    },

    cancel() { clearTimeout(this._timer); },
  };

  /* ============================================================
   *  DOM BUILDER
   *  Builds all 7 slide pages and the progress bar.
   * ============================================================ */
  function buildSlideshow() {
    const container = $('#slideshow');
    state.totalSlides = CONFIG.slides.length;

    CONFIG.slides.forEach((slide, i) => {
      /* ── Page wrapper ───────────────────────────────────── */
      const page = document.createElement('div');
      page.className = `page kb-${i + 1}`;
      page.dataset.index = i;
      page.style.setProperty('--accent', slide.accentColor);
      page.style.zIndex = 0;
      page.style.visibility = 'hidden';

      /* ── Front face ─────────────────────────────────────── */
      const front = document.createElement('div');
      front.className = 'page-front';

      /* Photo background */
      const photo = document.createElement('div');
      photo.className = 'page-photo';
      photo.style.backgroundImage = `url("${slide.photo}")`;

      /* Film grain */
      const grain = document.createElement('div');
      grain.className = 'page-grain';

      /* Vignette */
      const vignette = document.createElement('div');
      vignette.className = 'page-vignette';

      /* Shadow overlay - receives shadow from the turning page above */
      const shadow = document.createElement('div');
      shadow.className = 'page-shadow';

      /* Scrapbook corner stickers */
      ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
        const c = document.createElement('div');
        c.className = `page-corner corner-${pos}`;
        c.style.color = slide.accentColor;
        c.innerHTML = CORNER_SVG;
        front.appendChild(c);
      });

      /* CSS bokeh orbs (light leaks) */
      if (!reducedMotion()) {
        for (let b = 0; b < 3; b++) {
          const orb = document.createElement('div');
          orb.className = 'bokeh-orb';
          const sz = 60 + Math.random() * 90;
          orb.style.width = `${sz}px`;
          orb.style.height = `${sz}px`;
          orb.style.left = `${Math.random() * 80 + 5}%`;
          orb.style.top = `${Math.random() * 60 + 15}%`;
          orb.style.background = slide.accentColor;
          orb.style.animationDelay = `${b * 4}s`;
          orb.style.animationDuration = `${10 + Math.random() * 6}s`;
          front.appendChild(orb);
        }
      }

      /* Canvas for per-slide particle system */
      const pCvs = document.createElement('canvas');
      pCvs.className = 'page-particles';
      front.appendChild(pCvs);

      /* Message card */
      const card = document.createElement('div');
      card.className = `msg-card pos-${slide.corner}`;
      card.style.setProperty('--accent', slide.accentColor);
      card.innerHTML =
        `<span class="msg-icon">💌</span>` +
        `<div class="msg-text" data-slide="${i}"></div>`;
      front.appendChild(card);

      /* Assemble front: photo → grain → vignette → shadow → corners → orbs → canvas → card */
      front.insertBefore(shadow, front.firstChild);
      front.insertBefore(vignette, front.firstChild);
      front.insertBefore(grain, front.firstChild);
      front.insertBefore(photo, front.firstChild);

      /* ── Back face (paper texture) ──────────────────────── */
      const back = document.createElement('div');
      back.className = 'page-back';

      page.appendChild(front);
      page.appendChild(back);
      container.appendChild(page);

      /* Particle system for this slide */
      state.particleSystems.push(new Particles(pCvs, slide.accentColor));
    });

    /* ── Progress hearts ────────────────────────────────── */
    const bar = $('#progress-bar');
    for (let i = 0; i < state.totalSlides; i++) {
      const h = document.createElement('div');
      h.className = 'progress-heart';
      h.innerHTML = HEART_SVG;
      bar.appendChild(h);
    }
  }

  /* ============================================================
   *  IMAGE PRELOADER
   *  Loads all photos and updates the heart-fill loader UI.
   * ============================================================ */
  function preloadImages() {
    const fill = $('.loader-heart-fill');
    const pctEl = $('.loader-percent');
    let loaded = 0;
    const total = CONFIG.slides.length;

    return new Promise((resolve) => {
      if (total === 0) { resolve(); return; }

      CONFIG.slides.forEach((slide, i) => {
        const img = new Image();
        img.onload = img.onerror = () => {
          loaded++;
          const pct = loaded / total;
          /* Animate rect y: 90 (empty) → 0 (full) */
          if (fill) fill.setAttribute('y', String(90 - pct * 90));
          if (pctEl) pctEl.textContent = `${Math.round(pct * 100)} %`;

          /* Mark missing photos with a placeholder gradient */
          if (!img.naturalWidth) {
            const photoDiv = $(`.page[data-index="${i}"] .page-photo`);
            if (photoDiv) {
              photoDiv.classList.add('missing');
              photoDiv.style.backgroundImage = 'none';
              photoDiv.textContent = `${slide.photo.split('/').pop()} goes here`;
            }
          }
          if (loaded >= total) setTimeout(resolve, 400);
        };
        img.src = slide.photo;
      });
    });
  }

  /* ============================================================
   *  INTRO SCREEN - envelope animation + audio unlock
   * ============================================================ */
  let _introParticles = null; // keep reference so replay can stop it

  function initIntro() {
    const screen = $('#intro-screen');
    const titleEl = $('#intro-title');
    const nameEl = $('#letter-name');

    screen.style.display = '';
    screen.classList.remove('exit');

    titleEl.textContent = CONFIG.introTitle || 'I Made This For You';
    nameEl.textContent = CONFIG.herName || 'My Love';

    /* Start intro particle canvas */
    const iCvs = $('#intro-particles');
    if (_introParticles) _introParticles.stop();
    _introParticles = new Particles(iCvs, '#f4a0b5');
    _introParticles.start();

    /* Reset envelope to closed state */
    const env = $('#envelope');
    env.classList.remove('open');

    const handleTap = () => {
      screen.removeEventListener('click', handleTap);

      /* Unlock audio INSIDE the gesture */
      AudioMgr.unlock();

      /* Request fullscreen (best-effort, silently fail) */
      try {
        const d = document.documentElement;
        const rfs = d.requestFullscreen || d.webkitRequestFullscreen || d.msRequestFullscreen;
        if (rfs) rfs.call(d).catch(() => { });
      } catch (_) { }

      /* Open envelope */
      env.classList.add('open');

      /* After envelope opens → fade to slide 1 */
      setTimeout(() => {
        screen.classList.add('exit');
        _introParticles.stop();
        setTimeout(() => {
          screen.style.display = 'none';
          startSlideshow();
        }, 950);
      }, 1200);
    };

    screen.addEventListener('click', handleTap);
  }

  /* ============================================================
   *  SLIDESHOW
   * ============================================================ */
  let pageEls = [];    /* cached .page NodeList → Array */

  function startSlideshow() {
    const container = $('#slideshow');
    container.style.display = 'block';
    $('#ui-layer').classList.remove('hidden');
    pageEls = $$('.page', container);
    goToPage(0, false);
  }

  function goToPage(idx, animate) {
    if (idx < 0 || idx > state.totalSlides) return;
    /* Allow going to final screen even during a transition */
    if (state.isTransitioning && animate && idx < state.totalSlides) return;

    const prev = state.currentPage;
    state.currentPage = idx;

    /* ── Final screen ─────────────────────────────────── */
    if (idx === state.totalSlides) {
      showFinal(prev);
      return;
    }

    const slide = CONFIG.slides[idx];
    document.documentElement.style.setProperty('--accent', slide.accentColor);

    /* ── Lay out all pages ────────────────────────────── */
    pageEls.forEach((p, i) => {
      p.style.transition = 'none';
      if (i < idx) {
        /* Pages already "turned" - rotated away to the left */
        p.style.transformOrigin = 'left center';
        p.style.transform = 'rotateY(-180deg)';
        p.style.zIndex = i + 1;
        p.style.visibility = 'hidden';
      } else if (i === idx) {
        /* Current page - flat, on top */
        p.style.transformOrigin = 'left center';
        p.style.transform = 'rotateY(0deg)';
        p.style.zIndex = state.totalSlides + 10;
        p.style.visibility = 'visible';
      } else {
        /* Upcoming pages - flat, stacked beneath */
        p.style.transformOrigin = 'left center';
        p.style.transform = 'rotateY(0deg)';
        p.style.zIndex = state.totalSlides - i;
        /* Show only the next page so we can see it during a turn */
        p.style.visibility = (i === idx + 1) ? 'visible' : 'hidden';
      }
      /* Reset all shadows */
      const sh = p.querySelector('.page-shadow');
      if (sh) sh.style.opacity = '0';
    });

    /* ── Audio ────────────────────────────────────────── */
    AudioMgr.play(idx);

    /* ── UI ───────────────────────────────────────────── */
    updateProgress(idx);
    updateNowPlaying(slide.songTitle);

    /* ── Typewriter (delayed so page turn finishes first) */
    const textEl = $(`.msg-text[data-slide="${idx}"]`);
    if (textEl) TypeWriter.run(textEl, slide.message, animate ? 800 : 350);

    /* ── Particles ────────────────────────────────────── */
    if (prev >= 0 && prev < state.totalSlides && prev !== idx) {
      state.particleSystems[prev].stop();
    }
    state.particleSystems[idx].start();

    /* ── Swipe hint ───────────────────────────────────── */
    if (idx === 0 && !state.hasInteracted) {
      $('#swipe-hint').classList.remove('hide');
    } else {
      $('#swipe-hint').classList.add('hide');
    }
  }

  function updateProgress(idx) {
    $$('.progress-heart').forEach((h, i) => {
      h.classList.toggle('filled', i <= idx);
      h.classList.toggle('active', i === idx);
    });
  }

  function updateNowPlaying(title) {
    const el = $('#np-title');
    if (el) el.textContent = title || '';
  }

  /* ============================================================
   *  PAGE TURN  - 3-D book-page flip
   *
   *  The current page is the "top sheet".  Dragging left peels
   *  it toward its spine (left edge), revealing the next page
   *  underneath.  Dragging right un-peels the previous page.
   *
   *  DOM: each .page has transform-style:preserve-3d.
   *       Front face: .page-front (visible).
   *       Back face:  .page-back  (rotateY(180deg), shows paper).
   *       Shadow:     .page-shadow inside .page-front (overlays
   *                   the next page when top page is turning).
   * ============================================================ */
  const PageTurn = {
    container: null,
    threshold: 0.22,    /* fraction of width needed to commit a turn */
    _mouse: false,

    init() {
      this.container = $('#slideshow');

      /* Touch events */
      this.container.addEventListener('touchstart',
        (e) => this.onStart(e.touches[0].clientX), { passive: true });
      this.container.addEventListener('touchmove',
        (e) => { e.preventDefault(); this.onMove(e.touches[0].clientX); },
        { passive: false });
      this.container.addEventListener('touchend', () => this.onEnd());
      this.container.addEventListener('touchcancel', () => this.onEnd());

      /* Mouse events */
      this.container.addEventListener('mousedown',
        (e) => { this.onStart(e.clientX); this._mouse = true; });
      window.addEventListener('mousemove',
        (e) => { if (this._mouse) this.onMove(e.clientX); });
      window.addEventListener('mouseup',
        () => { if (this._mouse) { this.onEnd(); this._mouse = false; } });

      /* Keyboard */
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          e.preventDefault();
          this.turnForward();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.turnBackward();
        }
      });

      /* Arrow buttons */
      $('#arrow-left').addEventListener('click', () => this.turnBackward());
      $('#arrow-right').addEventListener('click', () => this.turnForward());
    },

    onStart(x) {
      if (state.isTransitioning) return;
      if (state.currentPage < 0 || state.currentPage >= state.totalSlides) return;
      state.isDragging = true;
      state.dragStartX = x;
      state.dragCurrentX = x;

      const cur = state.currentPage;
      /* Reveal next page so it's visible underneath during drag */
      if (cur + 1 < state.totalSlides) {
        pageEls[cur + 1].style.visibility = 'visible';
      }
      /* Reveal prev page above current so backward drag works */
      if (cur - 1 >= 0) {
        const prevPage = pageEls[cur - 1];
        prevPage.style.visibility = 'visible';
        prevPage.style.zIndex = state.totalSlides + 20;
      }
    },

    onMove(x) {
      if (!state.isDragging) return;
      state.dragCurrentX = x;

      const W = this.container.offsetWidth || window.innerWidth;
      const dx = state.dragStartX - x;       /* positive = dragging left = forward */
      const p = clamp(dx / (W * 0.6), -1, 1);

      /* Hide swipe hint on first meaningful drag */
      if (!state.hasInteracted && Math.abs(p) > 0.05) {
        state.hasInteracted = true;
        $('#swipe-hint').classList.add('hide');
      }

      const cur = state.currentPage;

      if (p > 0) {
        /* ── Forward: curl current page ─────────────────── */
        this._applyTurnForward(cur, p);
      } else if (p < 0) {
        /* ── Backward: un-curl previous page ────────────── */
        if (cur - 1 >= 0) this._applyTurnBackward(cur - 1, -p);
      }
    },

    /* Rotate the turning page and update its shadow & audio */
    _applyTurnForward(idx, p) {
      const page = pageEls[idx];
      if (!page) return;
      const angle = p * 180;
      page.style.transition = 'none';
      page.style.transformOrigin = 'left center';
      page.style.transform = `rotateY(${-angle}deg)`;

      /* Shadow on the next (revealed) page, peaks at 90° */
      const nextPage = pageEls[idx + 1];
      if (nextPage) {
        const sh = nextPage.querySelector('.page-shadow');
        if (sh) sh.style.opacity = String(Math.sin((angle / 180) * Math.PI) * 0.55);
      }

      /* Proportional audio crossfade during drag */
      AudioMgr.setDragVolume(idx, p);
    },

    _applyTurnBackward(idx, p) {
      /* idx = previous page index.  p = 0 (fully hidden) → 1 (fully revealed) */
      const angle = 180 - p * 180;
      const page = pageEls[idx];
      if (!page) return;
      page.style.transition = 'none';
      page.style.transformOrigin = 'left center';
      page.style.transform = `rotateY(${-angle}deg)`;
      page.style.visibility = 'visible';

      const curPage = pageEls[idx + 1];
      if (curPage) {
        const sh = curPage.querySelector('.page-shadow');
        if (sh) sh.style.opacity = String(Math.sin(((180 - angle) / 180) * Math.PI) * 0.55);
      }
    },

    onEnd() {
      if (!state.isDragging) return;
      state.isDragging = false;

      const W = this.container.offsetWidth || window.innerWidth;
      const dx = state.dragStartX - state.dragCurrentX;
      const p = clamp(dx / (W * 0.6), -1, 1);

      if (p > this.threshold) {
        this._commitTurn('forward');
      } else if (p < -this.threshold) {
        this._commitTurn('backward');
      } else {
        this._snapBack();
      }
    },

    _commitTurn(dir) {
      state.isTransitioning = true;
      const cur = state.currentPage;
      const DURATION = 600;

      if (dir === 'forward') {
        const page = pageEls[cur];
        if (!page) { state.isTransitioning = false; return; }
        page.style.transition = `transform ${DURATION}ms cubic-bezier(0.4,0,0.2,1)`;
        page.style.transform = 'rotateY(-180deg)';
        /* Fade shadow on next page back out */
        const nextPage = pageEls[cur + 1];
        if (nextPage) {
          const sh = nextPage.querySelector('.page-shadow');
          if (sh) {
            sh.style.transition = `opacity ${DURATION}ms ease`;
            sh.style.opacity = '0';
          }
        }
        setTimeout(() => {
          state.isTransitioning = false;
          goToPage(cur + 1, true);
        }, DURATION + 20);

      } else {
        const prev = cur - 1;
        if (prev < 0) { state.isTransitioning = false; this._snapBack(); return; }
        const page = pageEls[prev];
        if (!page) { state.isTransitioning = false; return; }
        page.style.transition = `transform ${DURATION}ms cubic-bezier(0.4,0,0.2,1)`;
        page.style.transform = 'rotateY(0deg)';
        const curPage = pageEls[cur];
        if (curPage) {
          const sh = curPage.querySelector('.page-shadow');
          if (sh) {
            sh.style.transition = `opacity ${DURATION}ms ease`;
            sh.style.opacity = '0';
          }
        }
        setTimeout(() => {
          state.isTransitioning = false;
          goToPage(prev, true);
        }, DURATION + 20);
      }
    },

    _snapBack() {
      const cur = state.currentPage;
      const SNAP = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';

      /* Snap current page back to flat */
      const page = pageEls[cur];
      if (page) {
        page.style.transition = SNAP;
        page.style.transform = 'rotateY(0deg)';
      }
      /* Snap previous page back to fully rotated away */
      if (cur - 1 >= 0) {
        const prevPage = pageEls[cur - 1];
        if (prevPage) {
          prevPage.style.transition = SNAP;
          prevPage.style.transform = 'rotateY(-180deg)';
        }
      }
      /* Clear all shadows */
      pageEls.forEach((p) => {
        const sh = p.querySelector('.page-shadow');
        if (sh) {
          sh.style.transition = 'opacity 0.4s ease';
          sh.style.opacity = '0';
        }
      });
      /* Restore audio volume for current track */
      if (AudioMgr.currentIdx >= 0 && !state.isMuted) {
        AudioMgr.fade(AudioMgr.currentIdx, 'in', 400);
      }
    },

    /* ── Programmatic turns (arrow buttons / keys) ──────── */
    turnForward() {
      if (state.isTransitioning) return;
      const cur = state.currentPage;
      if (cur < 0 || cur >= state.totalSlides) return;
      state.hasInteracted = true;
      $('#swipe-hint').classList.add('hide');

      state.isTransitioning = true;
      if (cur + 1 <= state.totalSlides - 1) {
        pageEls[cur + 1].style.visibility = 'visible';
      }

      const page = pageEls[cur];
      if (!page) { state.isTransitioning = false; return; }
      page.style.transition = 'transform 0.75s cubic-bezier(0.4,0,0.2,1)';
      page.style.transform = 'rotateY(-180deg)';

      /* Brief shadow flash on next page */
      const nextPage = pageEls[cur + 1];
      if (nextPage) {
        const sh = nextPage.querySelector('.page-shadow');
        if (sh) {
          sh.style.transition = 'opacity 0.2s ease';
          sh.style.opacity = '0.35';
          setTimeout(() => {
            sh.style.transition = 'opacity 0.4s ease';
            sh.style.opacity = '0';
          }, 400);
        }
      }

      setTimeout(() => {
        state.isTransitioning = false;
        goToPage(cur + 1, true);
      }, 780);
    },

    turnBackward() {
      if (state.isTransitioning) return;
      const cur = state.currentPage;
      if (cur <= 0) return;

      state.isTransitioning = true;
      const prev = cur - 1;
      const prevPage = pageEls[prev];
      if (!prevPage) { state.isTransitioning = false; return; }

      prevPage.style.visibility = 'visible';
      prevPage.style.zIndex = String(state.totalSlides + 20);
      prevPage.style.transition = 'transform 0.75s cubic-bezier(0.4,0,0.2,1)';
      prevPage.style.transform = 'rotateY(0deg)';

      setTimeout(() => {
        state.isTransitioning = false;
        goToPage(prev, true);
      }, 780);
    },
  };

  /* ============================================================
   *  FINAL SCREEN
   * ============================================================ */
  let _finalParticles = null;

  function showFinal(fromPage) {
    /* Stop the last slide's particles */
    if (fromPage >= 0 && fromPage < state.totalSlides) {
      state.particleSystems[fromPage].stop();
    }
    /* Slow fade-out of the last song */
    AudioMgr.fade(AudioMgr.currentIdx, 'out', 3500);

    /* Hide slideshow and UI overlay */
    $('#slideshow').style.display = 'none';
    $('#ui-layer').classList.add('hidden');

    /* Populate text */
    const finalMsg = $('#final-message');
    const madeWith = $('#made-with-love');
    if (finalMsg) finalMsg.textContent = CONFIG.closingMessage || '';
    if (madeWith) madeWith.textContent =
      `Made with all my love  ${CONFIG.myName || 'Me'} ♥`;

    /* Show screen */
    const screen = $('#final-screen');
    screen.classList.add('show');

    /* Build parametric heart of hearts */
    buildBigHeart();

    /* Confetti burst */
    heartBurst();

    /* Start particle system on final canvas */
    const fCvs = $('#final-particles');
    if (_finalParticles) _finalParticles.stop();
    _finalParticles = new Particles(fCvs, '#f4a0b5');
    _finalParticles.start();

    /* Replay button */
    const btn = $('#replay-btn');
    /* Remove old handler first */
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      _finalParticles.stop();
      screen.classList.remove('show');
      AudioMgr.stopAll();

      /* Clear confetti hearts */
      $$('.burst-heart').forEach((el) => el.remove());

      /* Stop all slide particles */
      state.particleSystems.forEach((ps) => ps.stop());
      state.currentPage = -1;
      state.hasInteracted = false;

      /* Re-show intro */
      initIntro();
    });
  }

  /* Arrange mini-hearts in a parametric heart shape */
  function buildBigHeart() {
    const container = $('#big-heart');
    if (!container) return;
    container.innerHTML = '';

    const size = container.offsetWidth || 140;
    const pts = [];

    /* Outline curve */
    for (let a = 0; a < Math.PI * 2; a += 0.16) {
      const x = 16 * Math.pow(Math.sin(a), 3);
      const y = -(13 * Math.cos(a)
        - 5 * Math.cos(2 * a)
        - 2 * Math.cos(3 * a)
        - Math.cos(4 * a));
      pts.push({ x, y });
    }
    /* Fill interior */
    for (let i = 0; i < 35; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.85;
      pts.push({
        x: 16 * Math.pow(Math.sin(a), 3) * r,
        y: -(13 * Math.cos(a)
          - 5 * Math.cos(2 * a)
          - 2 * Math.cos(3 * a)
          - Math.cos(4 * a)) * r,
      });
    }

    const scale = size / 40;
    pts.forEach((h, i) => {
      const el = document.createElement('span');
      el.className = 'mini-heart';
      el.textContent = '♥';
      el.style.left = `${size / 2 + h.x * scale}px`;
      el.style.top = `${size / 2 + h.y * scale}px`;
      el.style.animationDelay = `${i * 28}ms`;
      el.style.filter = `hue-rotate(${Math.random() * 40 - 20}deg)`;
      container.appendChild(el);
    });
  }

  /* Heart confetti burst from centre */
  function heartBurst() {
    if (reducedMotion()) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let i = 0; i < 50; i++) {
      const el = document.createElement('span');
      el.className = 'burst-heart';
      el.textContent = '♥';
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.fontSize = `${Math.random() * 20 + 8}px`;
      el.style.color = `hsl(${340 + Math.random() * 40},80%,${65 + Math.random() * 20}%)`;
      const angle = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * 380;
      el.style.setProperty('--bx', `${Math.cos(angle) * dist}px`);
      el.style.setProperty('--by', `${Math.sin(angle) * dist - 120}px`);
      el.style.setProperty('--br', `${Math.random() * 720 - 360}deg`);
      el.style.animationDelay = `${Math.random() * 0.5}s`;
      document.body.appendChild(el);
    }
  }

  /* ============================================================
   *  MUTE BUTTON
   * ============================================================ */
  function initMuteBtn() {
    const btn = $('#mute-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const muted = AudioMgr.toggleMute();
      btn.querySelector('.speaker-icon').classList.toggle('hidden', muted);
      btn.querySelector('.muted-icon').classList.toggle('hidden', !muted);
    });
  }

  /* ============================================================
   *  DEVICE ORIENTATION - gyro parallax
   * ============================================================ */
  function initOrientation() {
    if (reducedMotion()) return;
    const handler = (e) => {
      const x = clamp((e.gamma || 0) / 40 + 0.5, 0, 1);
      const y = clamp((e.beta || 0) / 60 + 0.5, 0, 1);
      state.particleSystems.forEach((ps) => {
        if (ps.running) { ps.mouseX = x; ps.mouseY = y; }
      });
    };
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      /* iOS 13+ - request permission (happens inside user gesture via intro tap) */
      DeviceOrientationEvent.requestPermission()
        .then((r) => { if (r === 'granted') window.addEventListener('deviceorientation', handler); })
        .catch(() => { });
    } else if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handler);
    }
  }

  /* Mouse parallax (desktop fallback) */
  function initMouseParallax() {
    if (reducedMotion()) return;
    document.addEventListener('mousemove', (e) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      state.particleSystems.forEach((ps) => {
        if (ps.running) { ps.mouseX = x; ps.mouseY = y; }
      });
    });
  }

  /* ============================================================
   *  VISIBILITY API - pause/resume when tab hidden
   * ============================================================ */
  function initVisibility() {
    document.addEventListener('visibilitychange', () => {
      AudioMgr.handleVisibility(document.hidden);
    });
  }

  /* ============================================================
   *  RESIZE - re-fit particle canvases
   * ============================================================ */
  function initResize() {
    let timer;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.particleSystems.forEach((ps) => { if (ps.running) ps.resize(); });
        if (_introParticles && _introParticles.running) _introParticles.resize();
        if (_finalParticles && _finalParticles.running) _finalParticles.resize();
        TapHearts._resize();
      }, 150);
    });
  }

  /* ============================================================
   *  BOOT SEQUENCE
   * ============================================================ */
  async function boot() {
    /* 1. Build all slide DOM */
    buildSlideshow();

    /* 2. Preload photos (drives the heart loader) */
    await preloadImages();

    /* 3. Create Audio elements (no play yet) */
    AudioMgr.init();

    /* 4. Dismiss loading screen */
    const loader = $('#loading-screen');
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => { loader.style.display = 'none'; }, 900);
    }

    /* 5. Show intro envelope */
    initIntro();

    /* 6. Wire up interactivity */
    PageTurn.init();
    initMuteBtn();
    TapHearts.init();
    initVisibility();
    initResize();
    initOrientation();
    initMouseParallax();
  }

  /* ── Entry point ────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
