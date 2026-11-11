import api from '../services/api.js';
const states = new WeakMap();
let sequence = 0;
const es = config => String(config?.locale || document.documentElement.lang || '').toLowerCase().startsWith('es');
const text = (config, en, spanish) => es(config) ? spanish : en;
const currentPublicKey = () => { const match = window.location.pathname.match(/^\/intake\/([^/]+)\/?$/); return match ? decodeURIComponent(match[1]) : ''; };
const context = config => `${config.publicKey || currentPublicKey()}:${config.scopeKey ?? ''}:${config.locale || ''}:${config.format || ''}:${JSON.stringify(config.publicContext || null)}:${config.family === true}`;
const unavailable = el => el.disabled || el.readOnly || el.matches(':disabled');
const newToken = () => {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  } catch { return ''; } // Older/insecure browsers retain their ordinary manual fields.
};
const endpoint = (config, action) => { if (config.family === true) return `/family/address-lookup/${action}`; if (config.publicContext) return `/address-lookup/context/${action}`; const publicKey = config.publicKey || currentPublicKey(); return `/address-lookup/${publicKey ? `intake/${encodeURIComponent(publicKey)}/` : ''}${action}`; };

export function applyAddressSelection(config, address, notify = true) {
  // Only the explicitly bound group can change. Apartment/unit has no mapping.
  if (config.model && config.fields) {
    for (const field of ['street', 'city', 'state', 'postalCode']) {
      const key = config.fields[field];
      if (key && typeof key === 'string') config.model[key] = String(address[field] || '');
    }
  }
  if (notify) config.onSelect?.(address);
}
export function createAddressAutocompleteDirective({ client = api, debounceMs = 350 } = {}) {
  function destroy(el) {
    const state = states.get(el); if (!state) return;
    clearTimeout(state.timer); clearTimeout(state.blurTimer); state.controller?.abort();
    for (const [event, listener] of Object.entries(state.listeners)) el.removeEventListener(event, listener);
    for (const event of ['scroll', 'resize']) window.removeEventListener(event, state.position, true);
    state.menu.remove(); state.status.remove();
    for (const [key, value] of Object.entries(state.previousAttributes)) value === null ? el.removeAttribute(key) : el.setAttribute(key, value);
    states.delete(el);
  }
  function mount(el, binding) {
    if (!binding.value || !['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
    const token = newToken(); if (!token) return;
    const id = `address-suggestions-${++sequence}`;
    const menu = document.createElement('div'); menu.id = id; menu.className = 'address-suggestions'; menu.hidden = true;
    menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', text(binding.value, 'Address suggestions', 'Sugerencias de direcciones'));
    const status = document.createElement('span'); status.id = `${id}-status`; status.className = 'address-suggestions-status'; status.setAttribute('role', 'status');
    el.insertAdjacentElement('afterend', status); document.body.appendChild(menu);
    const state = { config: binding.value, context: context(binding.value), model: binding.value.model, menu, status, matches: [], active: -1,
      generation: 0, token, listeners: {}, previousAttributes: {}, suppressInput: false, query: '', lookupStarted: false };
    states.set(el, state);
    for (const key of ['role', 'aria-autocomplete', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-describedby', 'autocomplete']) state.previousAttributes[key] = el.getAttribute(key);
    el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), status.id].filter(Boolean).join(' '));
    el.setAttribute('role', 'combobox'); el.setAttribute('aria-autocomplete', 'list'); el.setAttribute('aria-controls', id); el.setAttribute('aria-expanded', 'false'); el.setAttribute('autocomplete', 'off');
    function close() { menu.hidden = true; el.setAttribute('aria-expanded', 'false'); el.removeAttribute('aria-activedescendant'); }
    state.position = () => {
      const r = el.getBoundingClientRect(), width = Math.min(Math.max(r.width, 260), Math.max(window.innerWidth - 24, 100));
      menu.style.width = `${width}px`; menu.style.left = `${Math.max(12, Math.min(r.left, window.innerWidth - width - 12))}px`;
      menu.style.top = `${Math.min(r.bottom + 3, window.innerHeight - 90)}px`;
      menu.style.maxHeight = `${Math.max(80, Math.min(260, window.innerHeight - r.bottom - 15))}px`;
    };
    for (const event of ['scroll', 'resize']) window.addEventListener(event, state.position, true);
    function active(index) {
      state.active = index;
      [...menu.querySelectorAll('[role=option]')].forEach((option, i) => { option.setAttribute('aria-selected', i === index ? 'true' : 'false'); option.classList.toggle('is-active', i === index); });
      if (index >= 0) el.setAttribute('aria-activedescendant', `${id}-${index}`);
    }
    function fallback() { status.textContent = text(state.config, 'Enter the address manually.', 'Ingrese la dirección manualmente.'); close(); }
    async function select(index) {
      const match = state.matches[index]; if (!match || unavailable(el)) return;
      const generation = ++state.generation, source = el.value, scope = state.context, model = state.model;
      state.controller?.abort(); state.controller = new AbortController(); close();
      status.textContent = text(state.config, 'Filling address…', 'Completando dirección…');
      try {
        const { data } = await client.post(endpoint(state.config, 'select'), { ...(state.config.publicContext ? {publicContext:state.config.publicContext} : {}), selectionToken: match.selectionToken, locale: es(state.config) ? 'es' : 'en' }, { signal: state.controller.signal, skipGlobalLoading: true, skipAuthRedirect: true });
        if (generation !== state.generation || source !== el.value || scope !== state.context || model !== state.model || !el.isConnected || unavailable(el)) return;
        const address = data.address;
        if (!address?.street || !address.formattedAddress) return fallback();
        applyAddressSelection(state.config, address, false);
        el.value = state.config.format === 'full' ? address.formattedAddress : address.street;
        state.suppressInput = true;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Controlled components emit a whole model. Run their explicit callback
        // after native v-model handlers so a stale prop clone cannot erase city/ZIP.
        state.config.onSelect?.(address);
        state.matches = []; state.query = el.value; state.token = newToken();
        status.textContent = text(state.config, 'Address filled. Review the details before continuing.', 'Dirección completada. Revise los datos antes de continuar.');
      } catch (error) { if (generation === state.generation && !state.controller.signal.aborted) fallback(); }
    }
    function render() {
      menu.replaceChildren(); state.matches.forEach((match, i) => {
        const option = document.createElement('div'); option.id = `${id}-${i}`; option.className = 'address-suggestion'; option.setAttribute('role', 'option'); option.textContent = match.label;
        option.addEventListener('mousedown', event => event.preventDefault()); option.addEventListener('click', () => void select(i));
        option.addEventListener('pointermove', () => active(i)); menu.appendChild(option);
      });
      if (!state.matches.length) { close(); return; }
      const attribution = document.createElement('div'); attribution.className = 'address-suggestions-attribution';
      // Compact suggestion menus use the Google Maps text attribution permitted by Places policy.
      const brand = document.createElement('span'); brand.textContent = 'Google Maps'; attribution.appendChild(brand);
      for (const [label, href] of [[text(state.config, 'Terms', 'Términos'), 'https://maps.google.com/help/terms_maps.html'], [text(state.config, 'Privacy', 'Privacidad'), 'https://policies.google.com/privacy']]) {
        const link = document.createElement('a'); link.textContent = label; link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; attribution.appendChild(link);
      }
      menu.appendChild(attribution); menu.hidden = false; el.setAttribute('aria-expanded', 'true'); state.position(); active(0);
    }
    async function lookup(generation, query) {
      state.controller = new AbortController(); state.lookupStarted = true;
      status.textContent = text(state.config, 'Finding addresses…', 'Buscando direcciones…');
      try {
        const { data } = await client.post(endpoint(state.config, 'suggest'), { ...(state.config.publicContext ? {publicContext:state.config.publicContext} : {}), query, sessionToken: state.token, locale: es(state.config) ? 'es' : 'en' }, { signal: state.controller.signal, skipGlobalLoading: true, skipAuthRedirect: true });
        if (generation !== state.generation || query !== el.value || !el.isConnected || unavailable(el)) return;
        state.matches = Array.isArray(data.suggestions) ? data.suggestions.slice(0, 5) : [];
        status.textContent = state.matches.length ? text(state.config, 'Use arrow keys and Enter to choose an address.', 'Use las flechas y Entrar para elegir una dirección.') : text(state.config, 'No suggestions. Enter the address manually.', 'Sin sugerencias. Ingrese la dirección manualmente.'); render();
      } catch (error) { if (generation === state.generation && !state.controller.signal.aborted) fallback(); }
    }
    state.listeners.input = () => {
      if (state.suppressInput) { state.suppressInput = false; return; }
      const generation = ++state.generation; clearTimeout(state.timer); state.controller?.abort(); state.matches = []; close(); status.textContent = '';
      state.query = el.value;
      if (unavailable(el) || el.value.trim().length < 3 || el.value.length > 200) return;
      state.timer = setTimeout(() => void lookup(generation, el.value), debounceMs);
    };
    state.listeners.keydown = event => {
      if (event.key === 'Escape') { state.generation++; state.controller?.abort(); clearTimeout(state.timer); close(); return; }
      if (event.key === 'Tab') { state.generation++; state.controller?.abort(); clearTimeout(state.timer); return close(); }
      if (menu.hidden || !state.matches.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); active((state.active + (event.key === 'ArrowDown' ? 1 : -1) + state.matches.length) % state.matches.length); }
      if (event.key === 'Enter' && state.active >= 0) { event.preventDefault(); void select(state.active); }
    };
    state.listeners.blur = () => { state.generation++; state.controller?.abort(); clearTimeout(state.timer); state.blurTimer = setTimeout(close, 150); };
    for (const [event, listener] of Object.entries(state.listeners)) el.addEventListener(event, listener);
  }
  return {
    mounted: mount,
    updated(el, binding) {
      let state = states.get(el);
      if (!binding.value) return destroy(el);
      if (!state) return mount(el, binding);
      const nextContext = context(binding.value);
      if (nextContext !== state.context || binding.value.model !== state.model || (state.query && el.value !== state.query)) {
        state.generation++; clearTimeout(state.timer); state.controller?.abort(); state.menu.hidden = true; state.matches = []; state.token = newToken();
        el.setAttribute('aria-expanded', 'false'); el.removeAttribute('aria-activedescendant'); state.status.textContent = '';
      }
      state.config = binding.value; state.context = nextContext; state.model = binding.value.model;
    },
    beforeUnmount: destroy
  };
}
export const vAddressAutocomplete = createAddressAutocompleteDirective();
