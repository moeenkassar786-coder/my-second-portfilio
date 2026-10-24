/* =========================================================
   MOEEN PORTFOLIO — interactions
   No dependencies. Sections:
   1. Helpers            6. Hero wave (canvas)
   2. Theme              7. Hero name (cursor-reactive type)
   3. Mobile menu        8. Scroll effects
   4. Smooth scrolling   9. Page transitions + intro
   5. Cursor + magnets  10. Projects (search, filter, add files)
   ========================================================= */
(() => {
  "use strict";

  /* ---------- 1. Helpers ---------- */
  const doc = document;
  const root = doc.documentElement;
  const body = doc.body;
  const $ = (selector, scope = doc) => scope.querySelector(selector);
  const $$ = (selector, scope = doc) => Array.from(scope.querySelectorAll(selector));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } }
  };
  const maxScroll = () => Math.max(0, root.scrollHeight - window.innerHeight);

  // Shared pointer state (used by the cursor, wave and hero name).
  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, nx: 0.5, ny: 0.5, seen: false };
  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.nx = clamp(event.clientX / window.innerWidth, 0, 1);
    pointer.ny = clamp(event.clientY / window.innerHeight, 0, 1);
    pointer.seen = true;
  }, { passive: true });

  // One shared animation loop for everything that needs per-frame work.
  const tickers = [];
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(64, now - lastFrame);
    lastFrame = now;
    for (let i = 0; i < tickers.length; i++) tickers[i](now, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- 2. Theme (with circular reveal where supported) ---------- */
  const themeToggle = $("#theme-toggle");
  const themeListeners = [];

  function updateThemeUI() {
    const isLight = root.dataset.theme === "light";
    if (themeToggle) themeToggle.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isLight ? "#eef1f9" : "#0a0f24");
    themeListeners.forEach((fn) => fn());
  }

  function setTheme(next, originX, originY) {
    const apply = () => {
      root.dataset.theme = next;
      store.set("moeen-theme", next);
      updateThemeUI();
    };
    if (!doc.startViewTransition || reduceMotion) { apply(); return; }
    const radius = Math.hypot(Math.max(originX, window.innerWidth - originX), Math.max(originY, window.innerHeight - originY));
    const transition = doc.startViewTransition(apply);
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${originX}px ${originY}px)`, `circle(${radius}px at ${originX}px ${originY}px)`] },
        { duration: 750, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(() => {});
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const rect = themeToggle.getBoundingClientRect();
      setTheme(root.dataset.theme === "light" ? "dark" : "light", rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }
  updateThemeUI();

  /* ---------- 3. Mobile menu ---------- */
  const menuToggle = $("#menu-toggle");
  const nav = $("#nav-links");

  function setMenu(open) {
    body.classList.toggle("menu-open", open);
    if (!menuToggle) return;
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  }
  if (menuToggle) menuToggle.addEventListener("click", () => setMenu(!body.classList.contains("menu-open")));
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") setMenu(false); });
  window.addEventListener("resize", () => { if (window.innerWidth > 900) setMenu(false); });

  /* ---------- 4. Smooth scrolling (inertial wheel + keyboard, native on touch) ---------- */
  const scroller = (() => {
    let target = window.scrollY;
    let current = window.scrollY;
    let running = false;
    let locked = false;
    const enabled = !reduceMotion;
    if (enabled) root.classList.add("smooth-scroll");

    function step(now, dt) {
      if (!running) return;
      const diff = target - current;
      if (Math.abs(diff) < 0.35) {
        current = target;
        running = false;
        window.scrollTo(0, current);
        return;
      }
      // Frame-rate independent easing: feels the same at 60 and 144 Hz.
      current += diff * (1 - Math.pow(1 - 0.095, dt / 16.67));
      window.scrollTo(0, current);
    }
    tickers.push(step);

    function to(y) {
      target = clamp(y, 0, maxScroll());
      if (!running) current = window.scrollY;
      running = true;
    }
    function jump(y) {
      target = current = clamp(y, 0, maxScroll());
      running = false;
      window.scrollTo(0, target);   // CSS scroll-behavior is "auto" here, so this is instant
    }
    function by(delta) { to((running ? target : window.scrollY) + delta); }

    // Keep our position in sync when the browser scrolls natively (scrollbar drag, find, focus).
    window.addEventListener("scroll", () => {
      if (!running) { target = current = window.scrollY; }
    }, { passive: true });
    window.addEventListener("resize", () => { target = clamp(target, 0, maxScroll()); }, { passive: true });

    if (enabled) {
      window.addEventListener("wheel", (event) => {
        if (event.ctrlKey || event.defaultPrevented) return;           // pinch-zoom / handled elsewhere
        if (locked || body.classList.contains("menu-open")) { event.preventDefault(); return; }
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;   // horizontal gestures stay native
        if (event.target.closest && event.target.closest("[data-native-scroll], .code-body")) return;
        event.preventDefault();
        let delta = event.deltaY;
        if (event.deltaMode === 1) delta *= 34;
        else if (event.deltaMode === 2) delta *= window.innerHeight;
        by(delta);
      }, { passive: false });

      window.addEventListener("keydown", (event) => {
        if (locked || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const el = doc.activeElement;
        const tag = el ? el.tagName : "";
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (el && el.isContentEditable)) return;
        if (body.classList.contains("menu-open")) return;
        const page = window.innerHeight * 0.88;
        switch (event.key) {
          case "ArrowDown": by(70); break;
          case "ArrowUp": by(-70); break;
          case "PageDown": by(page); break;
          case "PageUp": by(-page); break;
          case " ":
            if (tag === "BUTTON" || tag === "A") return;
            by(event.shiftKey ? -page : page);
            break;
          case "Home": to(0); break;
          case "End": to(maxScroll()); break;
          default: return;
        }
        event.preventDefault();
      });
    }

    return { to, jump, lock(value) { locked = value; if (value) running = false; } };
  })();

  /* ---------- 5. Cursor, spotlight, tilt and magnetic buttons ---------- */
  const cursor = $(".cursor");
  const dot = $("#cursor-dot");
  const ring = $("#cursor-ring");
  const cursorLabel = $("#cursor-label");

  if (finePointer && !reduceMotion && cursor && dot && ring) {
    root.classList.add("has-cursor");
    let rx = pointer.x;
    let ry = pointer.y;
    tickers.push(() => {
      rx = lerp(rx, pointer.x, 0.17);
      ry = lerp(ry, pointer.y, 0.17);
      dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    });

    doc.addEventListener("pointerover", (event) => {
      const el = event.target.closest ? event.target.closest("a, button, input, [data-cursor]") : null;
      const isText = !!el && el.matches("input");
      cursor.classList.toggle("is-text", isText);
      cursor.classList.toggle("is-link", !!el && !isText);
      const label = el && !isText ? (el.dataset.cursor || "") : "";
      cursorLabel.textContent = label;
      cursor.classList.toggle("has-label", !!label);
    });
    doc.addEventListener("pointerdown", () => cursor.classList.add("is-down"));
    doc.addEventListener("pointerup", () => cursor.classList.remove("is-down"));
    root.addEventListener("mouseleave", () => cursor.classList.add("is-away"));
    root.addEventListener("mouseenter", () => cursor.classList.remove("is-away"));
  }

  // Magnetic buttons: they lean toward the cursor when it gets close.
  if (finePointer && !reduceMotion) {
    const magnets = $$(".magnetic");
    window.addEventListener("pointermove", (event) => {
      magnets.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const reach = Math.max(rect.width, rect.height) * 0.85;
        if (Math.hypot(dx, dy) < reach) {
          el.style.transform = `translate3d(${(dx * 0.28).toFixed(1)}px, ${(dy * 0.34).toFixed(1)}px, 0)`;
        } else if (el.style.transform) {
          el.style.transform = "";
        }
      });
    }, { passive: true });
  }

  // Spotlight on skill rows and project cards; gentle 3D tilt on project cards.
  doc.addEventListener("pointermove", (event) => {
    const el = event.target.closest ? event.target.closest(".project-card, .skill-row") : null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--my", `${event.clientY - rect.top}px`);
    if (el.classList.contains("project-card") && finePointer && !reduceMotion) {
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const strength = el.classList.contains("is-featured") ? 1.4 : 3;
      el.style.transform = `perspective(1100px) rotateX(${(-y * strength).toFixed(2)}deg) rotateY(${(x * strength).toFixed(2)}deg) translateY(-4px)`;
    }
  }, { passive: true });
  doc.addEventListener("pointerout", (event) => {
    const el = event.target.closest ? event.target.closest(".project-card") : null;
    if (el && !(event.relatedTarget && el.contains(event.relatedTarget))) el.style.transform = "";
  });

  /* ---------- 6. Hero wave (oscilloscope canvas) ---------- */
  const hero = $("#home");
    const canvas = $("#hero-canvas");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const probeAmp = $("#probe-amp");
  const probeFreq = $("#probe-freq");
  const probeHint = $("#probe-hint");

  const wave = { w: 0, h: 0, dpr: 1, px: 0.5, py: 0.5, reveal: reduceMotion ? 1 : 0, visible: true, accent: "127 140 255", signal: "255 200 61", lastReadout: 0 };
  let waveStart = performance.now();

  function readWaveColors() {
    const styles = getComputedStyle(root);
    wave.accent = styles.getPropertyValue("--accent-rgb").trim() || wave.accent;
    wave.signal = styles.getPropertyValue("--signal-rgb").trim() || wave.signal;
  }

  function resizeWave() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    wave.dpr = Math.min(window.devicePixelRatio || 1, 2);
    wave.w = rect.width;
    wave.h = rect.height;
    canvas.width = Math.round(rect.width * wave.dpr);
    canvas.height = Math.round(rect.height * wave.dpr);
    ctx.setTransform(wave.dpr, 0, 0, wave.dpr, 0, 0);
    drawWave(performance.now());
  }

  function drawWave(now) {
    if (!ctx || !wave.w) return;
    const { w, h } = wave;
    ctx.clearRect(0, 0, w, h);

    const targetX = pointer.seen ? pointer.nx : 0.5;
    const targetY = pointer.seen ? pointer.ny : 0.45;
    wave.px = lerp(wave.px, targetX, 0.07);
    wave.py = lerp(wave.py, targetY, 0.07);

    const amp = h * (0.05 + 0.15 * (1 - wave.py));          // cursor higher = taller wave
    const freq = 1.6 + wave.px * 1.8;                         // cursor further right = tighter wave
    const time = reduceMotion ? 0 : (now - waveStart) * 0.0012;
    const phase = time + window.scrollY * 0.006;              // scrolling slides the signal along
    const cy = h * 0.46;
    const limit = w * wave.reveal;

    const traces = [
      { fm: 1,   a: 1,    phi: 0,   speed: 1,   rgb: wave.accent, alpha: 0.95, width: 2.6 },
      { fm: 1,   a: 0.62, phi: 1.1, speed: 1.35, rgb: wave.signal, alpha: 0.9,  width: 1.7 },
      { fm: 2.05, a: 0.34, phi: 2.2, speed: 0.8, rgb: wave.accent, alpha: 0.32, width: 1.2 }
    ];

    let probeY = cy;
    traces.forEach((tr, index) => {
      ctx.beginPath();
      for (let x = 0; x <= limit; x += 4) {
        const nx = x / w;
        const bump = Math.exp(-Math.pow((nx - wave.px) / 0.17, 2));
        const envelope = 0.42 + 0.95 * bump;
        const y = cy
          + Math.sin(nx * freq * Math.PI * 2 * tr.fm + phase * tr.speed + tr.phi) * amp * envelope * tr.a
          + Math.sin(nx * freq * Math.PI * 6 + phase * 2.4) * amp * 0.1 * bump * tr.a;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        if (index === 0 && Math.abs(x - wave.px * w) < 2.5) probeY = y;
      }
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (index === 0) {                                      // soft glow pass under the main trace
        ctx.strokeStyle = `rgb(${tr.rgb} / .16)`;
        ctx.lineWidth = tr.width + 9;
        ctx.stroke();
      }
      ctx.strokeStyle = `rgb(${tr.rgb} / ${tr.alpha})`;
      ctx.lineWidth = tr.width;
      ctx.stroke();
    });

    // Probe: a thin vertical marker with a dot on the main trace.
    if (wave.reveal > 0.98) {
      const px = wave.px * w;
      ctx.strokeStyle = `rgb(${wave.accent} / .28)`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgb(${wave.signal})`;
      ctx.beginPath(); ctx.arc(px, probeY, 5, 0, Math.PI * 2); ctx.fill();
    }

    if (now - wave.lastReadout > 120) {                       // update the readout a few times a second
      wave.lastReadout = now;
      if (probeAmp) probeAmp.textContent = `${Math.round((1 - wave.py) * 100)}%`;
      if (probeFreq) probeFreq.textContent = `${freq.toFixed(1)} Hz`;
    }
  }

  if (canvas && ctx) {
    readWaveColors();
    resizeWave();
    if ("ResizeObserver" in window) new ResizeObserver(resizeWave).observe(canvas);
    else window.addEventListener("resize", resizeWave, { passive: true });
    themeListeners.push(() => { readWaveColors(); if (reduceMotion) drawWave(performance.now()); });

    if ("IntersectionObserver" in window && hero) {
      new IntersectionObserver((entries) => { wave.visible = entries[0].isIntersecting; }, { threshold: 0 }).observe(hero);
    }
    if (!reduceMotion) {
      tickers.push((now) => { if (wave.visible && !doc.hidden) drawWave(now); });
    }
    if (probeHint && !finePointer) probeHint.textContent = "Touch and drag across the wave.";
  }

  function revealWave() {
    if (reduceMotion || wave.reveal >= 1) return;
    const start = performance.now();
    const duration = 1800;
    tickers.push(function grow(now) {
      const p = clamp((now - start) / duration, 0, 1);
      wave.reveal = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { const i = tickers.indexOf(grow); if (i > -1) tickers.splice(i, 1); }
    });
  }

  /* ---------- 7. Hero name: letters get heavier and wider near the cursor ---------- */
  const nameEl = $(".hero-name");
  const letters = [];
  if (nameEl) {
    const text = nameEl.textContent.trim();
    nameEl.textContent = "";
    Array.from(text).forEach((char, index) => {
      const mask = doc.createElement("span");
      mask.className = "ch-mask";
      const inner = doc.createElement("span");
      inner.className = "ch";
      inner.style.setProperty("--i", String(index));
      inner.textContent = char;
      mask.appendChild(inner);
      nameEl.appendChild(mask);
      letters.push({ el: inner, w: 560, wd: 80 });
    });

    if (finePointer && !reduceMotion) {
      tickers.push(() => {
        if (!wave.visible || !body.classList.contains("is-ready")) return;
        letters.forEach((letter) => {
          const rect = letter.el.getBoundingClientRect();
          const dx = pointer.x - (rect.left + rect.width / 2);
          const dy = (pointer.y - (rect.top + rect.height / 2)) * 0.65;
          const reach = Math.max(rect.height, 160) * 0.95;
          const influence = pointer.seen ? Math.exp(-Math.pow(Math.hypot(dx, dy) / reach, 2)) : 0;
          letter.w = lerp(letter.w, 560 + 240 * influence, 0.13);
          letter.wd = lerp(letter.wd, 80 + 20 * influence, 0.13);
          letter.el.style.fontVariationSettings = `"wght" ${letter.w.toFixed(0)}, "wdth" ${letter.wd.toFixed(1)}, "opsz" 96`;
        });
      });
    }
  }

  /* ---------- 8. Scroll effects ---------- */
  const header = $("#site-header");
  const progress = $("#scroll-progress");
  const navLinks = $$('.nav a[href^="#"]');
  const statement = $("#statement");
  const timeline = $("#timeline");
  const timelineItems = timeline ? $$(".timeline-item", timeline) : [];
  let lastY = window.scrollY;
  let scrollQueued = false;

  // Split the About statement into words that light up as you scroll.
  const words = [];
  if (statement && !reduceMotion) {
    const parts = statement.textContent.trim().split(/(\s+)/);
    statement.textContent = "";
    parts.forEach((part) => {
      if (!part) return;
      const span = doc.createElement("span");
      span.textContent = part;
      if (/^\s+$/.test(part)) { span.className = "gap"; } else { span.className = "w"; words.push(span); }
      statement.appendChild(span);
    });
  }

  function updateScroll() {
    scrollQueued = false;
    const y = window.scrollY;
    const vh = window.innerHeight;

    if (progress) progress.style.setProperty("--p", maxScroll() ? (y / maxScroll()).toFixed(4) : "0");

    if (header) {
      header.classList.toggle("is-scrolled", y > 24);
      const goingDown = y > lastY;
      if (y > 220 && Math.abs(y - lastY) > 3) header.classList.toggle("is-hidden", goingDown);
      if (y <= 220) header.classList.remove("is-hidden");
    }
    lastY = y;

    if (hero && y < vh * 1.4) hero.style.setProperty("--hp", clamp(y / (vh * 0.9), 0, 1).toFixed(3));

    if (words.length && statement) {
      const rect = statement.getBoundingClientRect();
      if (rect.top < vh && rect.bottom > 0) {
        const p = clamp((vh * 0.88 - rect.top) / (vh * 0.5 + rect.height), 0, 1);
        const n = words.length;
        words.forEach((word, i) => {
          const o = clamp(p * (n + 3) - i, 0, 1);
          word.style.opacity = (0.2 + 0.8 * o).toFixed(3);
        });
      }
    }

    if (timeline) {
      const rect = timeline.getBoundingClientRect();
      const line = vh * 0.58;
      timeline.style.setProperty("--tp", clamp((line - rect.top) / rect.height, 0, 1).toFixed(4));
      timelineItems.forEach((item) => {
        const marker = $(".timeline-marker", item).getBoundingClientRect();
        item.classList.toggle("is-active", marker.top + marker.height / 2 < line);
      });
    }
  }
  function queueScroll() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(updateScroll);
  }
  window.addEventListener("scroll", queueScroll, { passive: true });
  window.addEventListener("resize", queueScroll, { passive: true });
  updateScroll();

  // Headings rise out of a mask; skill meters fill; the current nav link is underlined.
  if ("IntersectionObserver" in window) {
    const once = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add("in");
        if (el.classList.contains("meter")) {
          const level = Number(el.dataset.level) || 0;
          const bars = $$("i", el);
          bars.forEach((bar, i) => {
            bar.classList.toggle("lit", i < level);
            bar.classList.toggle("peak", i === level - 1);
          });
          el.classList.add("on");
        }
        observer.unobserve(el);
      });
    }, { threshold: 0.35 });
    $$(".sec-title, .contact-title, .meter").forEach((el) => once.observe(el));

    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`));
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    $$("main section[id]").forEach((section) => spy.observe(section));
  } else {
    $$(".sec-title, .contact-title").forEach((el) => el.classList.add("in"));
    $$(".meter").forEach((el) => {
      const level = Number(el.dataset.level) || 0;
      $$("i", el).forEach((bar, i) => bar.classList.toggle("lit", i < level));
      el.classList.add("on");
    });
  }

  /* ---------- 9. Page transitions + intro ---------- */
  const curtain = $("#curtain");
  const curtainLabel = $("#curtain-label");
  const curtainCount = $("#curtain-count");
  const EASE = "cubic-bezier(.76,0,.24,1)";
  const CURVE_TOP = "50% 50% 0 0 / 14vh 14vh 0 0";
  const CURVE_BOTTOM = "0 0 50% 50% / 0 0 14vh 14vh";
  let isReady = false;
  let transitioning = false;

  function parkCurtain() {
    if (!curtain) return;
    curtain.style.visibility = "hidden";
    curtain.style.pointerEvents = "none";
    curtain.style.transform = "translateY(100%)";
    curtain.style.borderRadius = "0";
  }

  function markReady() {
    if (isReady) return;
    isReady = true;
    scroller.lock(false);
    body.classList.remove("is-loading");
    body.classList.add("is-ready");
    revealWave();
  }

  async function runIntro() {
    if (!curtain || reduceMotion) { parkCurtain(); markReady(); return; }
    curtain.style.animation = "none";            // cancel the CSS failsafe now that scripts are running
    scroller.lock(true);                         // no scrolling underneath the intro curtain
    curtain.classList.remove("is-nav");
    if (curtainLabel) curtainLabel.textContent = "Moeen.";

    const fontsReady = doc.fonts && doc.fonts.ready ? Promise.race([doc.fonts.ready, wait(1800)]) : Promise.resolve();
    const duration = 1150;
    const begin = performance.now();
    await new Promise((resolve) => {
      (function count(now) {
        const p = clamp((now - begin) / duration, 0, 1);
        if (curtainCount) curtainCount.textContent = String(Math.round((1 - Math.pow(1 - p, 3)) * 100));
        if (p < 1) requestAnimationFrame(count); else resolve();
      })(begin);
    });
    await fontsReady;
    if (curtainCount) curtainCount.textContent = "100";
    await wait(140);

    const exit = curtain.animate(
      [{ transform: "translateY(0)", borderRadius: "0" }, { transform: "translateY(-100%)", borderRadius: CURVE_BOTTOM }],
      { duration: 1000, easing: EASE, fill: "forwards" }
    );
    setTimeout(markReady, 420);                  // the hero starts rising while the curtain is still leaving
    await exit.finished;
    parkCurtain();
    exit.cancel();
  }

  async function pageTransition(label, action) {
    if (transitioning || !curtain) { action(); return; }
    transitioning = true;
    scroller.lock(true);
    curtain.classList.add("is-nav");
    if (curtainLabel) curtainLabel.textContent = label;
    curtain.style.visibility = "visible";
    curtain.style.pointerEvents = "auto";

    const enter = curtain.animate(
      [{ transform: "translateY(100%)", borderRadius: CURVE_TOP }, { transform: "translateY(0)", borderRadius: "0" }],
      { duration: 650, easing: EASE, fill: "forwards" }
    );
    await enter.finished;
    action();
    await wait(200);
    const leave = curtain.animate(
      [{ transform: "translateY(0)", borderRadius: "0" }, { transform: "translateY(-100%)", borderRadius: CURVE_BOTTOM }],
      { duration: 750, easing: EASE, fill: "forwards" }
    );
    await leave.finished;
    parkCurtain();
    enter.cancel();
    leave.cancel();
    scroller.lock(false);
    transitioning = false;
  }

  const sectionNames = { home: "Moeen.", about: "About", skills: "Skills", projects: "Projects", education: "Education", contact: "Contact" };

  // Every in-page link: curtain wipe by default, or a smooth glide when marked data-smooth.
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      if (!hash || hash.length < 2) return;
      const target = $(hash);
      if (!target) return;
      event.preventDefault();
      setMenu(false);
      const y = target.id === "home" ? 0 : target.getBoundingClientRect().top + window.scrollY;
      const settle = () => {
        try { history.replaceState(null, "", hash); } catch (e) { /* e.g. file:// preview */ }
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      };
      if (reduceMotion) { scroller.jump(y); settle(); return; }
      if (link.hasAttribute("data-smooth")) {
        scroller.to(y);
        settle();
        return;
      }
      const label = link.dataset.label || sectionNames[target.id] || "Moeen.";
      pageTransition(label, () => { scroller.jump(y); settle(); });
    });
  });

  window.addEventListener("load", () => setTimeout(markReady, 5000));   // last-resort failsafe
  runIntro();

  /* ---------- 10. Projects: search, filter, add files (local preview) ---------- */
  (() => {
    const search = $("#project-search");
    const grid = $("#projects-grid");
    const empty = $("#projects-empty");
    const count = $("#project-count");
    const filters = $$(".filter");
    if (!search || !grid) return;
    let activeFilter = "all";

    function updateProjects() {
      const cards = $$(".project-card", grid);
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      cards.forEach((card) => {
        const haystack = (card.dataset.search || card.textContent).toLowerCase();
        const show = (!query || haystack.includes(query)) && (activeFilter === "all" || card.dataset.status === activeFilter);
        card.hidden = !show;
        if (show) visible++;
      });
      if (empty) empty.hidden = visible !== 0;
      if (count) count.textContent = `${visible} ${visible === 1 ? "project" : "projects"}`;
    }

    search.addEventListener("input", updateProjects);
    filters.forEach((button) => button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      filters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      updateProjects();
    }));
    updateProjects();

    const addButton = $("#add-project-button");
    const picker = $("#project-file-input");
    if (!addButton || !picker) return;

    addButton.addEventListener("click", () => picker.click());
    picker.addEventListener("change", () => {
      const files = Array.from(picker.files || []);
      if (!files.length) return;
      const plural = files.length === 1 ? "" : "s";
      const title = files.length === 1
        ? files[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")
        : `New Project (${files.length} files)`;

      const make = (tag, className, text) => {
        const el = doc.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        return el;
      };

      const card = make("article", "project-card");
      card.dataset.status = "built";
      card.dataset.search = `${title} ${files.map((file) => file.name).join(" ")}`.toLowerCase();

      const preview = make("div", "project-preview");
      const box = make("div", "task-ui");
      box.appendChild(make("div", "task-head", title));
      box.appendChild(make("p", "", `${files.length} local file${plural}`));
      preview.appendChild(box);

      const info = make("div", "project-info");
      const meta = make("div", "project-meta");
      meta.append(make("span", "", "Your project"), make("span", "status status-built", "New"));
      const tags = make("ul", "tag-list");
      files.slice(0, 5).forEach((file) => tags.appendChild(make("li", "", file.name)));
      const links = make("div", "added-files");
      files.forEach((file) => {
        const link = make("a", "", `Download ${file.name}`);
        link.href = URL.createObjectURL(file);
        link.download = file.name;
        links.appendChild(link);
      });
      info.append(meta, make("h3", "", title), make("p", "", `Added from your computer: ${files.length} file${plural}.`), tags, links);
      card.append(preview, info);
      grid.appendChild(card);

      search.dispatchEvent(new Event("input", { bubbles: true }));
      queueScroll();
      card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      picker.value = "";
    });
  })();
})();
