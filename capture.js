/* PokeSurvivor wide-map collector — page MAIN world, document_start.
   Passive observation only: no game-state edits, no network requests. */
(() => {
  'use strict';
  if (window.__psWideMapCollector) return;
  window.__psWideMapCollector = true;
  const PREFIX = '__PS_WIDE_MAP_16__';
  const originalSet = Map.prototype.set;
  const originalClear = Map.prototype.clear;
  const originalRandom = Math.random;
  const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
  let worldMap = null;
  let epoch = 0;
  let candidate = null, seed = null;
  let lastRng = null;
  let cam = null, camTime = 0;
  let lastSent = new Map();
  const recentlyCleared = new WeakMap();
  function note(r) {
    lastRng = r;
  }
  Math.random = function() {
    const n = originalRandom();
    note(n);
    return n;
  };
  function looksChunk(v) {
    return !!(v && typeof v === 'object' && v.terr instanceof Uint8Array &&
      v.terr.length === 256 && Array.isArray(v.props) &&
      Number.isInteger(v.cx) && Number.isInteger(v.cy) &&
      v.cx > -999999 && v.cx < 999999 && v.cy > -999999 && v.cy < 999999);
  }
  Map.prototype.set = function(k, v) {
    if (looksChunk(v)) {
      if (worldMap !== this) {
        worldMap = this;
        epoch++;
        lastSent = new Map();
        seed = null;
        const prior = recentlyCleared.get(this);
        candidate = prior && performance.now() - prior.at < 8000 ? prior.candidate : null;
      }
    }
    return originalSet.call(this, k, v);
  };
  Map.prototype.clear = function() {
    recentlyCleared.set(this, {candidate:lastRng == null ? null : Math.floor(lastRng * 1e6), at:performance.now()});
    if (this === worldMap) {
      epoch++;
      candidate = lastRng == null ? null : Math.floor(lastRng * 1e6);
      seed = null;
      lastSent = new Map();
      try { window.postMessage({tag:PREFIX, type:'reset', epoch, candidate}, location.origin); } catch (_) {}
    }
    return originalClear.call(this);
  };
  CanvasRenderingContext2D.prototype.drawImage = function(img, dx, dy, dw, dh) {
    // Actual game draws a 16x16 tile chunk in world coords at 512px each, with +1 seam overlap.
    // Filtering by canvas avoids sprites and the minimap canvas itself.
    if (this.canvas && this.canvas.id === 'game' && arguments.length === 5 &&
        dw === 513 && dh === 513 && Number.isInteger(dx / 512) && Number.isInteger(dy / 512)) {
      try {
        const m = this.getTransform();
        if (m.a > 0 && m.d > 0 && !m.b && !m.c && m.a < 12 && m.d < 12) {
          // Camera x/y is at the center of the physical game canvas.
          const x = (this.canvas.width / 2 - m.e) / m.a;
          const y = (this.canvas.height / 2 - m.f) / m.d;
          if (Number.isFinite(x) && Number.isFinite(y)) {
            cam = {x, y, w: this.canvas.width / m.a, h: this.canvas.height / m.d};
            camTime = performance.now();
          }
        }
      } catch (_) {}
    }
    return originalDraw.apply(this, arguments);
  };
  function packChunk(v) {
    const props = [];
    for (const p of v.props) {
      if (!p || typeof p.type !== 'string') continue;
      const type = p.type;
      if (!['tree', 'rock', 'grass','chest','bigchest','altar','spring','trap'].includes(type)) continue;
      props.push({type, tx:p.tx, ty:p.ty, used:!!p.used, charge:typeof p.charge==='number' ? p.charge : 1, hp:p.hp});
    }
    return {cx:v.cx,cy:v.cy,terr:Array.from(v.terr),props};
  }
  function stamp(v) {
    let h = v.props.length;
    for (const p of v.props) {
      h = (Math.imul(h, 31) + (p.tx|0) * 7 + (p.ty|0) * 13 + (p.used ? 17 : 0) +
           (p.hp <= 0 ? 23 : 0) + (p.charge < .15 ? 37 : 0)) | 0;
    }
    return h;
  }
  function flush() {
    try {
      const changes = [];
      if (worldMap) {
        // World's data cache is at most 400 chunks; avoid generating anything ourselves.
        for (const [k,v] of worldMap) {
          if (!looksChunk(v)) continue;
          const key = v.cx + ',' + v.cy;
          const hash = stamp(v);
          if (lastSent.get(key) !== hash) {
            changes.push(packChunk(v));
            lastSent.set(key, hash);
          }
          if (changes.length >= 100) break;
        }
      }
      window.postMessage({tag:PREFIX,type:'snapshot',epoch,changes,
        camera:cam && performance.now() - camTime < 3000 ? cam : null,
        candidate, seed, chunks:worldMap ? worldMap.size : 0,
        observedOnly: true
      }, location.origin);
    } catch (_) {}
  }
  // No actual game state is mutated. Cleared data is not retained beyond the active run.
  setInterval(flush, 650);
})();
