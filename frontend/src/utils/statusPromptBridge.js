/**
 * Imperative status prompt (window singleton).
 *
 * Runtime evidence: Vue Teleport/v-if often never entered the DOM on ITSCO
 * (mode=logout, probe found:false) while Platform painted. Second click only
 * showed a stripped fallback. Render the full chooser in the DOM instead.
 */

import {
  AWAY_REASONS,
  AVAILABILITY_BANDS,
  DURATION_CHIPS,
  addCustomOutReason,
  loadCustomOutReasons,
  removeCustomOutReason
} from './presenceStatus';

const KEY = '__PT_STATUS_PROMPT__';
const ROOT_ID = 'pt-status-prompt-root';
const STYLE_ID = 'pt-status-prompt-styles';

const LONGER_OPTIONS = [
  {
    id: 'out_day',
    title: 'Out for the Day',
    band: 'unavailable',
    bullets: [
      'You will not receive notifications',
      'Others see you as unavailable (red)',
      'Use when you are done for the day'
    ]
  },
  {
    id: 'available_offline',
    title: 'Available · Logged out',
    band: 'available_offline',
    bullets: [
      'You log out but stay open to connect',
      'Others can still message or call you (blue)',
      'Use when you are away from your device'
    ]
  }
];

function getBridge() {
  if (typeof window === 'undefined') {
    return {
      mode: null,
      logoutResolve: null,
      logoutPromise: null,
      handlers: null,
      outReason: 'meal',
      reachable: null,
      customLabel: null,
      customOutId: null,
      durationMinutes: 60,
      timerMode: 'reset',
      userId: null
    };
  }
  if (!window[KEY]) {
    window[KEY] = {
      mode: null,
      logoutResolve: null,
      logoutPromise: null,
      handlers: null,
      outReason: 'meal',
      reachable: null,
      customLabel: null,
      customOutId: null,
      durationMinutes: 60,
      timerMode: 'reset',
      userId: null
    };
  }
  return window[KEY];
}

export function registerStatusPromptHandlers(handlers) {
  getBridge().handlers = handlers || null;
}

export function getStatusPromptMode() {
  return getBridge().mode;
}

export function subscribeStatusPrompt(fn, id = 'default') {
  const b = getBridge();
  if (!b.listeners) b.listeners = new Map();
  b.listeners.set(id, fn);
  return () => {
    if (b.listeners?.get(id) === fn) b.listeners.delete(id);
  };
}

function notifyListeners(mode) {
  const b = getBridge();
  if (!b.listeners) return;
  b.listeners.forEach((fn) => {
    try {
      fn(mode);
    } catch {
      /* ignore */
    }
  });
}

function titleFor(mode) {
  if (mode === 'logout') return 'Set your status before leaving?';
  if (mode === 'change') return 'Change your Away status';
  return 'Set your status';
}

function subFor(mode) {
  if (mode === 'logout') {
    return 'Let the team know if you are out. You can also leave without setting a status.';
  }
  if (mode === 'change') {
    return 'Update why you are away without coming back. Reset the timer, or keep the time you already have left.';
  }
  return 'Your status shows your availability and how others can reach you across the platform.';
}

function ensurePromptStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .pt-sp-card { width:min(720px,100%); max-height:min(92vh,820px); overflow:auto; background:#fff; border-radius:16px; padding:24px 28px 20px; box-shadow:0 24px 60px rgba(15,23,42,0.22); border:1px solid #e2e8f0; font-family:system-ui,sans-serif; color:#0f172a; position:relative; }
    .pt-sp-close { position:absolute; top:14px; right:14px; width:32px; height:32px; border:none; border-radius:8px; background:#f1f5f9; color:#64748b; font-size:18px; cursor:pointer; line-height:1; }
    .pt-sp-close:hover { background:#e2e8f0; color:#0f172a; }
    .pt-sp-h2 { margin:0 36px 6px 0; font-size:1.35rem; font-weight:800; color:#0f172a; }
    .pt-sp-sub { margin:0 0 18px; font-size:0.9rem; line-height:1.5; color:#64748b; }
    .pt-sp-section { margin-bottom:16px; }
    .pt-sp-section-h { display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:0.72rem; font-weight:800; letter-spacing:0.07em; text-transform:uppercase; color:#475569; }
    .pt-sp-section-note { margin:0 0 10px; font-size:0.82rem; line-height:1.45; color:#64748b; }
    .pt-sp-chips { display:flex; flex-wrap:wrap; gap:8px; }
    .pt-sp-chip { padding:8px 14px; border:1px solid #d1d5db; border-radius:999px; background:#fff; color:#1e293b; font-weight:650; font-size:13px; cursor:pointer; }
    .pt-sp-chip.active { background:#1f6b4a; border-color:#1f6b4a; color:#fff; }
    .pt-sp-reach-box { background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:12px 14px; }
    .pt-sp-longer-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    @media (max-width:640px) { .pt-sp-longer-grid { grid-template-columns:1fr; } }
    .pt-sp-longer-card { text-align:left; border-radius:12px; padding:12px 14px; cursor:pointer; border:2px solid transparent; background:#f8fafc; }
    .pt-sp-longer-card.unavailable { background:#fef2f2; border-color:#fecaca; }
    .pt-sp-longer-card.available_offline { background:#eff6ff; border-color:#bfdbfe; }
    .pt-sp-longer-card.active.unavailable { border-color:#dc2626; box-shadow:0 0 0 2px rgba(220,38,38,0.15); }
    .pt-sp-longer-card.active.available_offline { border-color:#0ea5e9; box-shadow:0 0 0 2px rgba(14,165,233,0.15); }
    .pt-sp-longer-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
    .pt-sp-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
    .pt-sp-longer-title { font-size:14px; font-weight:800; color:#0f172a; }
    .pt-sp-band-pill { margin-left:auto; font-size:10px; font-weight:800; padding:2px 8px; border-radius:999px; text-transform:uppercase; letter-spacing:0.04em; }
    .pt-sp-band-pill.unavailable { background:#fee2e2; color:#b91c1c; }
    .pt-sp-band-pill.available_offline { background:#dbeafe; color:#1d4ed8; }
    .pt-sp-longer-card ul { margin:0; padding-left:18px; font-size:12px; line-height:1.45; color:#475569; }
    .pt-sp-longer-card li + li { margin-top:4px; }
    .pt-sp-guide { border-top:1px solid #e2e8f0; padding-top:14px; margin-top:16px; }
    .pt-sp-guide-row { display:flex; align-items:flex-start; gap:8px; font-size:12px; color:#475569; margin-bottom:6px; }
    .pt-sp-guide-row strong { color:#0f172a; font-size:12px; }
    .pt-sp-actions { display:flex; flex-direction:column; gap:8px; margin-top:18px; }
    .pt-sp-btn-primary { width:100%; padding:12px 14px; border:none; border-radius:10px; background:#1f6b4a; color:#fff; font-weight:700; cursor:pointer; font-size:14px; }
    .pt-sp-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
    .pt-sp-btn-ghost { width:100%; padding:12px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; color:#334155; font-weight:700; cursor:pointer; font-size:14px; }
    .pt-sp-custom-wrap { display:inline-flex; align-items:center; gap:4px; }
    .pt-sp-custom-del { width:22px; height:22px; border:none; border-radius:999px; background:rgba(15,23,42,0.08); color:#334155; cursor:pointer; font-size:14px; }
    .pt-sp-privacy { margin:10px 0 0; font-size:11px; color:#94a3b8; line-height:1.4; }
  `;
  document.head.appendChild(style);
}

function removePromptDom() {
  const node = typeof document !== 'undefined' ? document.getElementById(ROOT_ID) : null;
  if (node) node.remove();
}

function chipBtn(label, active) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = `pt-sp-chip${active ? ' active' : ''}`;
  return btn;
}

function sectionHeader(text) {
  const h = document.createElement('div');
  h.className = 'pt-sp-section-h';
  h.textContent = text;
  return h;
}

function isLongerAway(reason) {
  return reason === 'out_day' || reason === 'available_offline';
}

function renderPromptDom(mode) {
  if (typeof document === 'undefined') return;
  ensurePromptStyles();
  removePromptDom();
  const b = getBridge();
  b.outReason = b.outReason || 'meal';
  b.durationMinutes = b.durationMinutes || 60;
  if (b.reachable === undefined) b.reachable = null;
  if (mode === 'change') {
    b.timerMode = b.timerMode === 'reset' ? 'reset' : 'continue';
  } else {
    b.timerMode = 'reset';
  }

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('data-pt-status-prompt', '1');
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'pt-sp-title');
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,20,0.55);backdrop-filter:blur(4px);';

  const card = document.createElement('div');
  card.className = 'pt-sp-card';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'pt-sp-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => {
    if (mode === 'logout') resolveLogoutStatusPrompt(false);
    else closeStatusPrompt();
  });
  card.appendChild(closeBtn);

  const h2 = document.createElement('h2');
  h2.id = 'pt-sp-title';
  h2.className = 'pt-sp-h2';
  h2.textContent = titleFor(mode);
  card.appendChild(h2);

  const sub = document.createElement('p');
  sub.className = 'pt-sp-sub';
  sub.textContent = subFor(mode);
  card.appendChild(sub);

  const selectOut = (id, customLabel = null) => {
    b.outReason = id;
    b.customLabel = customLabel;
    b.customOutId = id.startsWith('custom_') ? id : null;
    if (isLongerAway(id)) b.reachable = null;
    renderPromptDom(mode);
  };

  const shortSection = document.createElement('div');
  shortSection.className = 'pt-sp-section';
  shortSection.appendChild(sectionHeader('Short away (stay signed in)'));
  const shortNote = document.createElement('p');
  shortNote.className = 'pt-sp-section-note';
  shortNote.textContent =
    mode === 'timedown'
      ? 'Temporarily away but still signed in. Pick a reason and how long — up to 2 hours.'
      : 'Temporarily away but will return soon. You stay signed in for up to 2 hours.';
  shortSection.appendChild(shortNote);

  const chips = document.createElement('div');
  chips.className = 'pt-sp-chips';
  AWAY_REASONS.filter((r) => r.group === 'out').forEach((r) => {
    const btn = chipBtn(r.label, b.outReason === r.id && !b.customOutId);
    btn.addEventListener('click', () => selectOut(r.id));
    chips.appendChild(btn);
  });
  loadCustomOutReasons(b.userId).forEach((c) => {
    const wrap = document.createElement('span');
    wrap.className = 'pt-sp-custom-wrap';
    const btn = chipBtn(c.label, b.customOutId === c.id);
    btn.addEventListener('click', () => selectOut(c.id, c.label));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'pt-sp-custom-del';
    del.title = 'Remove saved reason';
    del.setAttribute('aria-label', `Remove ${c.label}`);
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCustomOutReason(b.userId, c.id);
      if (b.customOutId === c.id) {
        b.outReason = 'meal';
        b.customLabel = null;
        b.customOutId = null;
      }
      renderPromptDom(mode);
    });
    wrap.appendChild(btn);
    wrap.appendChild(del);
    chips.appendChild(wrap);
  });
  const plus = chipBtn('+ Custom status', false);
  plus.style.borderStyle = 'dashed';
  plus.addEventListener('click', () => {
    const label = window.prompt('Add a personal “Out for…” reason (saved for you):');
    if (!label) return;
    const created = addCustomOutReason(b.userId, label);
    if (created) selectOut(created.id, created.label);
  });
  chips.appendChild(plus);
  shortSection.appendChild(chips);
  card.appendChild(shortSection);

  if (!isLongerAway(b.outReason)) {
    const reachSection = document.createElement('div');
    reachSection.className = 'pt-sp-section';
    const reachBox = document.createElement('div');
    reachBox.className = 'pt-sp-reach-box';
    reachBox.appendChild(sectionHeader('Still reachable (optional)'));
    const reachNote = document.createElement('p');
    reachNote.className = 'pt-sp-section-note';
    reachNote.textContent = 'Let others know how they can reach you while you are away (yellow on the team board).';
    reachBox.appendChild(reachNote);
    const reachChips = document.createElement('div');
    reachChips.className = 'pt-sp-chips';
    AWAY_REASONS.filter((r) => r.group === 'reachable').forEach((r) => {
      const btn = chipBtn(r.label, b.reachable === r.id);
      btn.addEventListener('click', () => {
        b.reachable = b.reachable === r.id ? null : r.id;
        renderPromptDom(mode);
      });
      reachChips.appendChild(btn);
    });
    reachBox.appendChild(reachChips);
    reachSection.appendChild(reachBox);
    card.appendChild(reachSection);
  }

  const longerSection = document.createElement('div');
  longerSection.className = 'pt-sp-section';
  longerSection.appendChild(sectionHeader('Longer away'));
  const longerNote = document.createElement('p');
  longerNote.className = 'pt-sp-section-note';
  longerNote.textContent = 'Stepping away for an extended period. These options use different team-board colors.';
  longerSection.appendChild(longerNote);
  const longerGrid = document.createElement('div');
  longerGrid.className = 'pt-sp-longer-grid';
  LONGER_OPTIONS.forEach((opt) => {
    const bandMeta = AVAILABILITY_BANDS[opt.band] || AVAILABILITY_BANDS.unavailable;
    const cardBtn = document.createElement('button');
    cardBtn.type = 'button';
    cardBtn.className = `pt-sp-longer-card ${opt.band}${b.outReason === opt.id ? ' active' : ''}`;
    const head = document.createElement('div');
    head.className = 'pt-sp-longer-head';
    const dot = document.createElement('span');
    dot.className = 'pt-sp-dot';
    dot.style.background = bandMeta.dot || '#94a3b8';
    const title = document.createElement('span');
    title.className = 'pt-sp-longer-title';
    title.textContent = opt.title;
    const pill = document.createElement('span');
    pill.className = `pt-sp-band-pill ${opt.band}`;
    pill.textContent = bandMeta.label;
    head.appendChild(dot);
    head.appendChild(title);
    head.appendChild(pill);
    cardBtn.appendChild(head);
    const ul = document.createElement('ul');
    opt.bullets.forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    });
    cardBtn.appendChild(ul);
    cardBtn.addEventListener('click', () => selectOut(opt.id));
    longerGrid.appendChild(cardBtn);
  });
  longerSection.appendChild(longerGrid);
  card.appendChild(longerSection);

  if (mode === 'change' && b.outReason && !isLongerAway(b.outReason)) {
    const timerSection = document.createElement('div');
    timerSection.className = 'pt-sp-section';
    timerSection.appendChild(sectionHeader('Timer'));
    const timerChips = document.createElement('div');
    timerChips.className = 'pt-sp-chips';
    const continueBtn = chipBtn('Continue current time', b.timerMode === 'continue');
    continueBtn.addEventListener('click', () => {
      b.timerMode = 'continue';
      renderPromptDom(mode);
    });
    const resetBtn = chipBtn('Reset time', b.timerMode === 'reset');
    resetBtn.addEventListener('click', () => {
      b.timerMode = 'reset';
      renderPromptDom(mode);
    });
    timerChips.append(continueBtn, resetBtn);
    timerSection.appendChild(timerChips);
    card.appendChild(timerSection);
  }

  const showDuration =
    b.outReason &&
    !isLongerAway(b.outReason) &&
    (mode !== 'change' || b.timerMode === 'reset');
  if (showDuration) {
    const durSection = document.createElement('div');
    durSection.className = 'pt-sp-section';
    durSection.appendChild(sectionHeader(mode === 'change' ? 'New duration' : 'How long?'));
    const durChips = document.createElement('div');
    durChips.className = 'pt-sp-chips';
    DURATION_CHIPS.forEach((d) => {
      const btn = chipBtn(d.label, b.durationMinutes === d.minutes);
      btn.addEventListener('click', () => {
        b.durationMinutes = d.minutes;
        renderPromptDom(mode);
      });
      durChips.appendChild(btn);
    });
    durSection.appendChild(durChips);
    card.appendChild(durSection);
  }

  const guide = document.createElement('div');
  guide.className = 'pt-sp-guide';
  guide.appendChild(sectionHeader('Status color guide'));
  [
    ['available', 'Online and ready to connect'],
    ['away_reachable', 'Away but can be reached'],
    ['unavailable', 'Not available — others should not expect a reply'],
    ['available_offline', 'Logged out but open to connect']
  ].forEach(([bandId, desc]) => {
    const meta = AVAILABILITY_BANDS[bandId];
    const row = document.createElement('div');
    row.className = 'pt-sp-guide-row';
    const dot = document.createElement('span');
    dot.className = 'pt-sp-dot';
    dot.style.background = meta?.dot || '#94a3b8';
    dot.style.marginTop = '3px';
    const text = document.createElement('span');
    text.innerHTML = `<strong>${meta?.label || bandId}</strong> — ${desc}`;
    row.appendChild(dot);
    row.appendChild(text);
    guide.appendChild(row);
  });

  const actions = document.createElement('div');
  actions.className = 'pt-sp-actions';

  if (mode === 'timedown') {
    const still = document.createElement('button');
    still.type = 'button';
    still.className = 'pt-sp-btn-primary';
    still.textContent = "I'm still here";
    still.addEventListener('click', async () => {
      try {
        await b.handlers?.onStillHere?.();
      } finally {
        closeStatusPrompt();
      }
    });
    actions.appendChild(still);
  }

  const setStatus = document.createElement('button');
  setStatus.type = 'button';
  setStatus.className = 'pt-sp-btn-primary';
  if (b.outReason === 'available_offline') {
    setStatus.textContent = 'Set available & log out';
  } else if (b.outReason === 'out_day') {
    setStatus.textContent =
      mode === 'manual' || mode === 'change' || mode === 'logout'
        ? 'Set unavailable for the day & log out'
        : 'Set unavailable for the day';
  } else if (mode === 'change') {
    setStatus.textContent =
      b.timerMode === 'continue' ? 'Update status · keep timer' : 'Update status · reset timer';
  } else {
    setStatus.textContent = 'Set status & stay signed in';
  }
  setStatus.disabled = !b.outReason;
  setStatus.addEventListener('click', async () => {
    setStatus.disabled = true;
    try {
      const isCustom = !!(b.customOutId || b.customLabel);
      const result = await b.handlers?.onSetStatus?.({
        mode,
        reason: b.outReason === 'out_day' ? 'out_day' : isCustom ? 'custom' : b.outReason,
        durationMinutes: b.durationMinutes,
        reachable: isLongerAway(b.outReason) ? null : b.reachable,
        customLabel: isCustom ? b.customLabel : null,
        timerMode: mode === 'change' ? b.timerMode || 'continue' : 'reset'
      });
      if (result?.proceedLogout) {
        resolveLogoutStatusPrompt(true);
        return;
      }
      closeStatusPrompt();
    } catch (e) {
      console.error('[statusPromptBridge] onSetStatus failed', e);
      setStatus.disabled = false;
    }
  });
  actions.appendChild(setStatus);

  if (mode !== 'manual' && mode !== 'change') {
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'pt-sp-btn-ghost';
    skip.textContent = mode === 'logout' ? 'Log out without status' : 'Log out now';
    skip.addEventListener('click', async () => {
      if (mode === 'logout') {
        resolveLogoutStatusPrompt(true);
        return;
      }
      closeStatusPrompt();
      await b.handlers?.onLogoutNow?.();
    });
    actions.appendChild(skip);
  }

  if (mode === 'logout' || mode === 'manual' || mode === 'change') {
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'pt-sp-btn-ghost';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      if (mode === 'logout') resolveLogoutStatusPrompt(false);
      else closeStatusPrompt();
    });
    actions.appendChild(cancel);
  }

  const privacy = document.createElement('p');
  privacy.className = 'pt-sp-privacy';
  privacy.textContent = 'Your status is visible to your organization on the Presence / Team Board.';
  card.appendChild(actions);
  card.appendChild(guide);
  card.appendChild(privacy);
  root.appendChild(card);
  document.body.appendChild(root);
}

export function openStatusPrompt(
  mode,
  {
    userId = null,
    initialReason = null,
    initialReachable = null,
    initialCustomLabel = null,
    initialDuration = null,
    timerMode = null
  } = {}
) {
  const b = getBridge();
  b.mode = mode || null;
  b.userId = userId;
  b.outReason = initialReason || 'meal';
  b.reachable = initialReachable || null;
  b.customLabel = initialCustomLabel || null;
  b.customOutId =
    initialReason && String(initialReason).startsWith('custom_') ? initialReason : null;
  b.durationMinutes = Number(initialDuration) > 0 ? Number(initialDuration) : 60;
  b.timerMode = mode === 'change' ? (timerMode === 'reset' ? 'reset' : 'continue') : 'reset';
  notifyListeners(b.mode);
  if (b.mode) renderPromptDom(b.mode);
  else removePromptDom();
}

export function openLogoutStatusPrompt({ userId = null } = {}) {
  const b = getBridge();
  if (b.logoutPromise) {
    openStatusPrompt('logout', { userId: userId ?? b.userId });
    return b.logoutPromise;
  }
  b.logoutPromise = new Promise((resolve) => {
    b.logoutResolve = resolve;
  });
  openStatusPrompt('logout', { userId });
  return b.logoutPromise;
}

export function resolveLogoutStatusPrompt(proceed) {
  const b = getBridge();
  const r = b.logoutResolve;
  b.logoutResolve = null;
  b.logoutPromise = null;
  b.mode = null;
  removePromptDom();
  notifyListeners(null);
  if (typeof r === 'function') r(!!proceed);
}

export function closeStatusPrompt() {
  const b = getBridge();
  if (b.mode === 'logout') {
    resolveLogoutStatusPrompt(false);
    return;
  }
  b.mode = null;
  removePromptDom();
  notifyListeners(null);
}

export const statusPromptMode = {
  get value() {
    return getStatusPromptMode();
  }
};
