/* Game-specific Simplified Chinese, entirely local. Does not edit game state. */
(() => {
  'use strict';
  if (window.__PS_ZH_TRANSLATOR__ || !window.__PS_ZH_DATA__) return;
  const data = window.__PS_ZH_DATA__;
  const KEY = 'ps.widemap.zh.enabled.v1';
  const normalize = s => s.replace(/\s+/g, ' ').trim();
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = new Map(), terms = new Map(), patterns = [], cache = new Map();
  for (const [source, target] of Object.entries({...data.names, ...data.phrases})) {
    const key = normalize(source);
    if (key.includes('{x}')) {
      patterns.push({
        re: new RegExp('^' + key.split('{x}').map(escape).join('(.+?)') + '$', 'iu'),
        target, raw: data.rawSlots[source] || [], weight: key.replaceAll('{x}', '').length,
      });
    } else {
      exact.set(key.toLowerCase(), target);
      // Short words are safe as whole phrases, but ambiguous in longer text.
      if (Object.hasOwn(data.names, source) || key.length >= 4 || key === 'HP' || key === 'ATK' || key === 'DEF' || key === 'SPD') terms.set(key.toLowerCase(), target);
    }
  }
  patterns.sort((a, b) => b.weight - a.weight);
  const termPattern = new RegExp('(?<![\\p{L}\\p{N}_])(?:' + [...terms.keys()].sort((a,b) => b.length-a.length).map(escape).join('|') + ')(?![\\p{L}\\p{N}_])', 'giu');
  function translate(source, depth = 0) {
    if (typeof source !== 'string' || !source || !/[a-zÀ-ž]/i.test(source)) return source;
    if (!depth && cache.has(source)) return cache.get(source);
    const core = normalize(source);
    let result = exact.get(core.toLowerCase());
    if (result === undefined && depth < 5) {
      for (const pattern of patterns) {
        const match = pattern.re.exec(core);
        if (!match) continue;
        let i = 0;
        result = pattern.target.replace(/\{x\}/g, () => {
          const index = i++, value = match[index + 1];
          return pattern.raw.includes(index) ? value : translate(value, depth + 1);
        });
        break;
      }
    }
    if (result === undefined) result = core.replace(termPattern, word => terms.get(word.toLowerCase()));
    // Preserve original spacing if no translation is available.
    if (result === core) result = source;
    else result = (source.match(/^\s*/)?.[0] || '') + result + (source.match(/\s*$/)?.[0] || '');
    if (!depth) {
      if (cache.size >= 4000) cache.clear();
      cache.set(source, result);
    }
    return result;
  }
  let enabled = false;
  try { enabled = localStorage.getItem(KEY) === '1'; } catch (_) {}
  const records = new WeakMap();
  const ATTRS = ['title', 'placeholder', 'alt', 'aria-label'];
  const SKIP = '#pswm, #ps-zh-toggle, script, style, code, pre, textarea, [contenteditable]:not([contenteditable="false"]), [translate="no"]';
  function skip(node) {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return !el || !!el.closest(SKIP);
  }
  function update(node, key, read, write) {
    const current = read();
    if (current === null || current === undefined) return;
    let record = records.get(node);
    const old = record?.[key];
    if (!enabled) {
      if (old && current === old.translated) write(old.original);
      if (record) delete record[key];
      return;
    }
    if (old && current === old.translated) return;
    const translated = translate(current);
    if (!record) { record = {}; records.set(node, record); }
    record[key] = {original:current, translated};
    if (translated !== current) write(translated);
  }
  function visit(node) {
    if (skip(node)) return;
    if (node.nodeType === 3) update(node, 'text', () => node.nodeValue, v => { node.nodeValue = v; });
    else if (node.nodeType === 1) {
      for (const attr of ATTRS) update(node, attr, () => node.getAttribute(attr), v => node.setAttribute(attr, v));
      // Input values belong to the player. Only submit/button labels are text.
      if (node.matches('input[type="button"], input[type="submit"], input[type="reset"]')) {
        update(node, 'value', () => node.value, v => { node.value = v; });
      }
    }
  }
  function walk(node) {
    if (node.nodeType === 3) { visit(node); return; }
    if (node.nodeType !== 1 || skip(node)) return;
    visit(node);
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: n => skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    while (walker.nextNode()) visit(walker.currentNode);
  }
  let observer, button, originalLang = null;
  const observerOptions = {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:[...ATTRS, 'value']};
  function observe() { if (document.body) observer.observe(document.body, observerOptions); }
  function repaint() {
    observer?.disconnect();
    try { if (document.body) walk(document.body); } finally { if (observer) observe(); }
  }
  function updateButton() {
    if (!button) return;
    button.textContent = enabled ? '中文已开 · 恢复原文' : '一键汉化';
    button.setAttribute('aria-pressed', String(enabled));
    button.title = enabled ? '关闭汉化，恢复游戏原文' : '开启宝可梦专用简体中文汉化';
  }
  function setEnabled(value) {
    enabled = !!value;
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (_) {}
    if (enabled) {
      if (originalLang === null) originalLang = document.documentElement.getAttribute('lang');
      document.documentElement.setAttribute('lang', 'zh-CN');
    } else if (originalLang !== null) {
      document.documentElement.setAttribute('lang', originalLang); originalLang = null;
    }
    repaint(); updateButton();
  }
  // Captured at document_start, so the game's own ES -> EN wrapper can safely
  // call these wrappers later. Translate measurement and drawing identically.
  const proto = window.CanvasRenderingContext2D?.prototype;
  if (proto) for (const method of ['fillText', 'strokeText', 'measureText']) {
    const original = proto[method];
    proto[method] = function(text, ...args) {
      const translated = enabled && this.canvas?.id === 'game' ? translate(text) : text;
      const font = this.font;
      if (translated !== text && /[\u3400-\u9fff]/.test(translated)) this.font = font + ', "Microsoft YaHei", "Noto Sans SC", sans-serif';
      try { return original.call(this, translated, ...args); } finally { if (this.font !== font) this.font = font; }
    };
  }
  for (const method of ['alert', 'confirm']) {
    const original = window[method];
    window[method] = function(message, ...args) { return original.call(this, enabled ? translate(message) : message, ...args); };
  }
  // Read-only diagnostics are useful when the upstream game adds new strings.
  window.__PS_ZH_TRANSLATOR__ = Object.freeze({translate, get enabled() { return enabled; }});
  function start() {
    if (button || !document.body) return;
    const style = document.createElement('style');
    style.textContent = '#ps-zh-toggle{position:fixed;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;max-width:calc(100vw - 24px);padding:8px 12px;border:1px solid #77bba5;border-radius:18px;background:#12342fed;color:#effff8;font:13px/1.4 system-ui,"Microsoft YaHei",sans-serif;box-shadow:0 3px 12px #0006;cursor:pointer;touch-action:manipulation}#ps-zh-toggle[aria-pressed="true"]{background:#245b46}#ps-zh-toggle:focus-visible{outline:2px solid #ffe098;outline-offset:3px}';
    document.head.appendChild(style);
    button = document.createElement('button'); button.id = 'ps-zh-toggle'; button.type = 'button';
    button.setAttribute('translate', 'no');
    button.addEventListener('click', () => setEnabled(!enabled));
    for (const event of ['pointerdown', 'pointerup', 'keydown', 'keyup']) button.addEventListener(event, e => e.stopPropagation());
    document.body.appendChild(button);
    observer = new MutationObserver(mutations => {
      // Disconnect during our own writes to avoid feedback and repeat traversals.
      observer.disconnect();
      try {
        for (const m of mutations) {
          if (m.type === 'childList') for (const n of m.addedNodes) walk(n);
          else visit(m.target);
        }
      } finally { observe(); }
    });
    setEnabled(enabled);
  }
  window.addEventListener('storage', e => { if (e.key === KEY) setEnabled(e.newValue === '1'); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();
