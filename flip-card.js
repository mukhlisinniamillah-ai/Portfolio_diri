/* flip-card.js — Vanilla JS port of FlipCard (React + Framer Motion → DOM) */
(function (global) {
  'use strict';

  const SLOP = { fine: 4, coarse: 8 };
  const FLING = 0.16;
  const HISTORY_MS = 90;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const snap = deg => Math.round(deg / 180) * 180;
  const isBack = deg => Math.abs(Math.round(deg / 180)) % 2 === 1;

  function simulateSpring(s, target, stiffness, damping, dt) {
    const displacement = s.value - target;
    const accel = -stiffness * displacement - damping * s.velocity;
    s.velocity += accel * dt;
    s.value += s.velocity * dt;
    if (Math.abs(s.value - target) < 0.05 && Math.abs(s.velocity) < 0.05) {
      s.value = target;
      s.velocity = 0;
      return true;
    }
    return false;
  }

  function create(container, options) {
    options = options || {};

    const o = {
      axis: options.axis || 'y',
      flipOnClick: options.flipOnClick !== false,
      draggable: options.draggable !== false,
      dragDistance: options.dragDistance || 0,
      tilt: options.tilt !== false,
      tiltMax: options.tiltMax !== undefined ? options.tiltMax : 12,
      glare: options.glare !== false,
      glareOpacity: options.glareOpacity !== undefined ? options.glareOpacity : 0.22,
      hoverScale: options.hoverScale !== undefined ? options.hoverScale : 1.03,
      perspective: options.perspective || 1100,
      stiffness: options.stiffness || 170,
      damping: options.damping || 20,
      radius: options.radius !== undefined ? options.radius : 22,
      background: options.background || '#27272a',
      color: options.color || '#f5f5f5',
      shadow: options.shadow !== false,
      shadowColor: options.shadowColor || '#000000',
      shadowOpacity: options.shadowOpacity !== undefined ? options.shadowOpacity : 0.45,
      disabled: options.disabled === true,
      ariaLabel: options.ariaLabel || 'Flip card',
      className: options.className || '',
      defaultFlipped: options.defaultFlipped === true,
      onFlipChange: typeof options.onFlipChange === 'function' ? options.onFlipChange : null,
      front: options.front || '',
      back: options.back || '',
      width: options.width,
      height: options.height
    };

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ----- Build DOM -----
    container.classList.add('flip-card');
    if (o.className) o.className.split(/\s+/).forEach(c => c && container.classList.add(c));
    container.setAttribute('role', 'button');
    container.setAttribute('tabindex', o.disabled ? '-1' : '0');
    container.setAttribute('aria-label', o.ariaLabel);
    container.setAttribute('aria-pressed', String(o.defaultFlipped));
    container.dataset.axis = o.axis;
    if (o.draggable && !o.disabled && !reduce) container.dataset.draggable = '';
    if (o.disabled) container.dataset.disabled = '';

    container.style.setProperty('--fc-radius', o.radius + 'px');
    container.style.setProperty('--fc-bg', o.background);
    container.style.setProperty('--fc-ink', o.color);
    container.style.setProperty('--fc-shadow', o.shadowColor);
    container.style.setProperty('--fc-shadow-o', String(o.shadowOpacity));
    container.style.setProperty('--fc-glare', String(o.glareOpacity));
    if (o.width !== undefined) container.style.setProperty('--fc-w', o.width + 'px');
    if (o.height !== undefined) container.style.setProperty('--fc-h', o.height + 'px');

    let shadowEl = null;
    if (o.shadow) {
      shadowEl = document.createElement('span');
      shadowEl.className = 'flip-card__shadow';
      shadowEl.setAttribute('aria-hidden', 'true');
      container.appendChild(shadowEl);
    }

    const rotor = document.createElement('div');
    rotor.className = 'flip-card__rotor';
    container.appendChild(rotor);

    const frontFace = document.createElement('div');
    frontFace.className = 'flip-card__face flip-card__face--front';
    if (typeof o.front === 'string') frontFace.innerHTML = o.front;
    else if (o.front instanceof Node) frontFace.appendChild(o.front);
    if (o.glare) {
      const g = document.createElement('span');
      g.className = 'flip-card__glare';
      g.setAttribute('aria-hidden', 'true');
      frontFace.appendChild(g);
    }
    rotor.appendChild(frontFace);

    const backFace = document.createElement('div');
    backFace.className = 'flip-card__face flip-card__face--back';
    if (typeof o.back === 'string') backFace.innerHTML = o.back;
    else if (o.back instanceof Node) backFace.appendChild(o.back);
    if (o.glare) {
      const g = document.createElement('span');
      g.className = 'flip-card__glare';
      g.setAttribute('aria-hidden', 'true');
      backFace.appendChild(g);
    }
    rotor.appendChild(backFace);

    // ----- State -----
    const state = {
      turn: { value: o.defaultFlipped ? 180 : 0, velocity: 0 },
      tiltX: { value: 0, velocity: 0 },
      tiltY: { value: 0, velocity: 0 },
      lift: { value: 1, velocity: 0 },
      sheen: { value: 0, velocity: 0 },
      gx: 50,
      gy: 50,
      shown: o.defaultFlipped,
      dragging: false,
      turnTarget: o.defaultFlipped ? 180 : 0,
      tiltTargetX: 0,
      tiltTargetY: 0,
      liftTarget: 1,
      sheenTarget: 0,
      raf: 0,
      lastTime: 0
    };

    const updateAria = () => {
      container.setAttribute('aria-pressed', String(state.shown));
      frontFace.setAttribute('aria-hidden', String(state.shown));
      backFace.setAttribute('aria-hidden', String(!state.shown));
      if (state.shown) frontFace.setAttribute('inert', '');
      else frontFace.removeAttribute('inert');
      if (!state.shown) backFace.setAttribute('inert', '');
      else backFace.removeAttribute('inert');
    };
    updateAria();

    const updateTransform = () => {
      const turn = state.turn.value;
      const tiltX = state.tiltX.value;
      const tiltY = state.tiltY.value;
      const lift = state.lift.value;
      const sumX = turn + tiltX;
      const sumY = turn + tiltY;

      if (o.axis === 'x') {
        rotor.style.transform =
          'perspective(' + o.perspective + 'px) scale(' + lift + ') rotateY(' + tiltY + 'deg) rotateX(' + sumX + 'deg)';
      } else {
        rotor.style.transform =
          'perspective(' + o.perspective + 'px) scale(' + lift + ') rotateX(' + tiltX + 'deg) rotateY(' + sumY + 'deg)';
      }

      rotor.style.setProperty('--fc-gx', state.gx + '%');
      rotor.style.setProperty('--fc-gy', state.gy + '%');
      rotor.style.setProperty('--fc-sheen', String(state.sheen.value));

      if (shadowEl) {
        const facing = Math.abs(Math.cos((turn * Math.PI) / 180));
        const spread = 0.08 + 0.92 * facing;
        const shade = 0.1 + 0.9 * facing * facing;
        shadowEl.style.transform = o.axis === 'x' ? 'scaleY(' + spread + ')' : 'scaleX(' + spread + ')';
        shadowEl.style.opacity = String(shade);
      }
    };

    const frame = now => {
      state.raf = 0;
      if (!state.lastTime) state.lastTime = now;
      const dt = Math.min(0.05, (now - state.lastTime) / 1000);
      state.lastTime = now;

      let settled = true;

      if (!state.dragging) {
        if (!simulateSpring(state.turn, state.turnTarget, o.stiffness, o.damping, dt)) settled = false;
      } else {
        settled = false;
      }

      if (!simulateSpring(state.tiltX, state.tiltTargetX, 240, 24, dt)) settled = false;
      if (!simulateSpring(state.tiltY, state.tiltTargetY, 240, 24, dt)) settled = false;
      if (!simulateSpring(state.lift, state.liftTarget, 320, 26, dt)) settled = false;
      if (!simulateSpring(state.sheen, state.sheenTarget, 320, 26, dt)) settled = false;

      updateTransform();

      if (!settled) state.raf = requestAnimationFrame(frame);
      else state.lastTime = 0;
    };

    const wake = () => {
      if (!state.raf) {
        state.lastTime = 0;
        state.raf = requestAnimationFrame(frame);
      }
    };

    const setTarget = to => {
      state.turnTarget = to;
      const next = isBack(to);
      if (next !== state.shown) {
        state.shown = next;
        updateAria();
        if (o.onFlipChange) o.onFlipChange(next);
      }
      wake();
    };

    const flip = () => {
      const base = snap(state.turn.value);
      setTarget(isBack(base) ? base - 180 : base + 180);
    };

    // ----- Interaction -----
    let grip = null;

    const onPointerDown = e => {
      if (o.disabled || e.button !== 0 || grip) return;
      try { container.setPointerCapture(e.pointerId); } catch (err) {}
      grip = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        base: state.turn.value,
        moved: false,
        slop: e.pointerType === 'touch' ? SLOP.coarse : SLOP.fine,
        hist: []
      };
      if (!reduce) {
        state.liftTarget = o.hoverScale;
        wake();
      }
    };

    const onPointerMove = e => {
      if (grip && grip.id === e.pointerId) {
        const d = o.axis === 'x' ? e.clientY - grip.y : e.clientX - grip.x;
        if (!grip.moved) {
          if (Math.abs(d) < grip.slop || !o.draggable || reduce) return;
          grip.moved = true;
          state.dragging = true;
          container.dataset.dragging = '';
          state.tiltTargetX = 0;
          state.tiltTargetY = 0;
          state.sheenTarget = 0;
          wake();
        }
        const span = o.dragDistance > 0
          ? o.dragDistance
          : (o.axis === 'x' ? container.offsetHeight : container.offsetWidth);
        const deg = grip.base + (o.axis === 'x' ? -1 : 1) * (d / span) * 180;
        state.turn.value = deg;
        state.turnTarget = deg;
        updateTransform();
        const now = performance.now();
        grip.hist.push({ t: now, v: deg });
        while (grip.hist.length > 2 && now - grip.hist[0].t > HISTORY_MS) grip.hist.shift();
        return;
      }
      if (!o.tilt || reduce || o.disabled || e.pointerType === 'touch') return;
      const r = container.getBoundingClientRect();
      const px = clamp((e.clientX - r.left) / r.width, 0, 1);
      const py = clamp((e.clientY - r.top) / r.height, 0, 1);
      state.tiltTargetX = (0.5 - py) * 2 * o.tiltMax;
      state.tiltTargetY = (px - 0.5) * 2 * o.tiltMax;
      state.gx = px * 100;
      state.gy = py * 100;
      state.sheenTarget = 1;
      wake();
    };

    const release = (e, cancelled) => {
      if (!grip || grip.id !== e.pointerId) return;
      const g = grip;
      grip = null;
      try {
        if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
      } catch (err) {}
      state.dragging = false;
      delete container.dataset.dragging;
      if (e.pointerType === 'touch' || !container.matches(':hover')) {
        state.tiltTargetX = 0;
        state.tiltTargetY = 0;
        state.sheenTarget = 0;
        state.liftTarget = 1;
      }
      if (!g.moved) {
        if (!cancelled && o.flipOnClick) flip();
        else setTarget(g.base);
        return;
      }
      const here = state.turn.value;
      let velocity = 0;
      const a = g.hist[0];
      const b = g.hist[g.hist.length - 1];
      if (!cancelled && a && b && b.t > a.t && performance.now() - b.t < 60) {
        velocity = ((b.v - a.v) / (b.t - a.t)) * 1000;
      }
      const to = cancelled
        ? snap(g.base)
        : clamp(snap(here + velocity * FLING), snap(here) - 180, snap(here) + 180);
      setTarget(to);
    };

    const onPointerUp = e => release(e, false);
    const onPointerCancel = e => release(e, true);
    const onLostCapture = e => release(e, true);

    const onPointerEnter = e => {
      if (!reduce && !o.disabled && e.pointerType !== 'touch') {
        state.liftTarget = o.hoverScale;
        wake();
      }
    };

    const onPointerLeave = () => {
      if (!grip) {
        state.tiltTargetX = 0;
        state.tiltTargetY = 0;
        state.sheenTarget = 0;
        state.liftTarget = 1;
        wake();
      }
    };

    const onKeyDown = e => {
      if (o.disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      if (!e.repeat) flip();
    };

    const onClick = e => {
      if (!o.disabled && e.detail === 0) flip();
    };

    const onDragStart = e => e.preventDefault();

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerCancel);
    container.addEventListener('lostpointercapture', onLostCapture);
    container.addEventListener('pointerenter', onPointerEnter);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('keydown', onKeyDown);
    container.addEventListener('click', onClick);
    container.addEventListener('dragstart', onDragStart);

    updateTransform();

    return {
      flip: flip,
      destroy: function () {
        cancelAnimationFrame(state.raf);
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('pointermove', onPointerMove);
        container.removeEventListener('pointerup', onPointerUp);
        container.removeEventListener('pointercancel', onPointerCancel);
        container.removeEventListener('lostpointercapture', onLostCapture);
        container.removeEventListener('pointerenter', onPointerEnter);
        container.removeEventListener('pointerleave', onPointerLeave);
        container.removeEventListener('keydown', onKeyDown);
        container.removeEventListener('click', onClick);
        container.removeEventListener('dragstart', onDragStart);
      }
    };
  }

  global.FlipCard = { create: create };
})(window);