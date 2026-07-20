/**
 * Imperative status prompt (window singleton).
 *
 * Runtime evidence: Vue Teleport/v-if often never entered the DOM on ITSCO
 * (mode=logout, probe found:false) while Platform painted. Second click only
 * showed a stripped fallback. Render the full chooser in the DOM instead.
 */

import {
  AWAY_REASONS,
  DURATION_CHIPS,
  addCustomOutReason,
  loadCustomOutReasons,
  removeCustomOutReason
} from './presenceStatus';

const KEY = '__PT_STATUS_PROMPT__';
const ROOT_ID = 'pt-status-prompt-root';

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
  if (mode === 'manual') return 'Set your Away / timeout status';
  if (mode === 'change') return 'Change your Away status';
  return 'Still here — or set your status?';
}

function subFor(mode) {
  if (mode === 'logout') {
    return 'Let the team know if you are out. You can also leave without setting a status.';
  }
  if (mode === 'manual') {
    return 'Choosing Away keeps you signed in for up to 2 hours so you do not have to log back in.';
  }
  if (mode === 'change') {
    return 'Update why you are away without coming back. Reset the timer, or keep the time you already have left.';
  }
  return 'Your session is timing out. Stay signed in, or set an away status (up to 2 hours).';
}

function btnStyle(active, primary) {
  if (primary) {
    return 'width:100%;padding:12px 14px;border:none;border-radius:10px;background:#1f5c3d;color:#fff;font-weight:700;cursor:pointer;font-size:14px;';
  }
  if (active) {
    return 'padding:8px 12px;border:none;border-radius:999px;background:#1f5c3d;color:#fff;font-weight:700;cursor:pointer;font-size:13px;';
  }
  return 'padding:8px 12px;border:1px solid rgba(34,80,50,0.25);border-radius:999px;background:#fff;color:#1a3d2b;font-weight:650;cursor:pointer;font-size:13px;';
}

function ghostBtnStyle() {
  return 'width:100%;padding:12px 14px;border:1px solid rgba(34,80,50,0.25);border-radius:10px;background:#fff;color:#1a3d2b;font-weight:700;cursor:pointer;font-size:14px;';
}

function removePromptDom() {
  const node = typeof document !== 'undefined' ? document.getElementById(ROOT_ID) : null;
  if (node) node.remove();
}

function renderPromptDom(mode) {
  if (typeof document === 'undefined') return;
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
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,20,0.55);backdrop-filter:blur(4px);';

  const card = document.createElement('div');
  card.style.cssText =
    'width:min(480px,100%);max-height:min(90vh,720px);overflow:auto;background:#f7faf7;border-radius:16px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,0.25);border:1px solid rgba(34,80,50,0.12);font-family:system-ui,sans-serif;color:#1a3d2b;';

  const h2 = document.createElement('h2');
  h2.textContent = titleFor(mode);
  h2.style.cssText = 'margin:0 0 8px;font-size:1.25rem;font-weight:700;';
  card.appendChild(h2);

  const sub = document.createElement('p');
  sub.textContent = subFor(mode);
  sub.style.cssText = 'margin:0 0 18px;font-size:0.9rem;line-height:1.45;color:#3d5c4a;';
  card.appendChild(sub);

  const section = (label, nodes) => {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '14px';
    const lab = document.createElement('div');
    lab.textContent = label;
    lab.style.cssText =
      'font-size:0.7rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#5a7a68;margin-bottom:8px;';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';
    nodes.forEach((n) => grid.appendChild(n));
    wrap.appendChild(lab);
    wrap.appendChild(grid);
    card.appendChild(wrap);
    return { wrap, grid };
  };

  const selectOut = (id, customLabel = null) => {
    b.outReason = id;
    b.customLabel = customLabel;
    b.customOutId = id.startsWith('custom_') ? id : null;
    if (id === 'out_day') b.reachable = null;
    renderPromptDom(mode);
  };

  const outBuiltIn = AWAY_REASONS.filter((r) => r.group === 'out').map((r) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = r.label;
    btn.style.cssText = btnStyle(b.outReason === r.id && !b.customOutId, false);
    btn.addEventListener('click', () => selectOut(r.id));
    return btn;
  });

  const customs = loadCustomOutReasons(b.userId);
  const customBtns = customs.map((c) => {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = c.label;
    btn.style.cssText = btnStyle(b.customOutId === c.id, false);
    btn.addEventListener('click', () => selectOut(c.id, c.label));
    const del = document.createElement('button');
    del.type = 'button';
    del.title = 'Remove saved reason';
    del.setAttribute('aria-label', `Remove ${c.label}`);
    del.textContent = '×';
    del.style.cssText =
      'width:22px;height:22px;border:none;border-radius:999px;background:rgba(15,23,20,0.08);color:#334155;cursor:pointer;font-size:14px;line-height:1;';
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
    return wrap;
  });

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  plus.title = 'Add your own Out for… reason';
  plus.setAttribute('aria-label', 'Add custom out reason');
  plus.style.cssText =
    'width:36px;height:36px;border:1px dashed rgba(34,80,50,0.45);border-radius:999px;background:#fff;color:#1f5c3d;font-weight:800;font-size:18px;cursor:pointer;';
  plus.addEventListener('click', () => {
    const label = window.prompt('Add a personal “Out for…” reason (saved for you):');
    if (!label) return;
    const created = addCustomOutReason(b.userId, label);
    if (created) selectOut(created.id, created.label);
  });

  section('Out for', [...outBuiltIn, ...customBtns, plus]);

  // Reachable is independent — toggle same chip off if clicked again.
  const reachBtns = AWAY_REASONS.filter((r) => r.group === 'reachable').map((r) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = r.label;
    btn.style.cssText = btnStyle(b.reachable === r.id, false);
    btn.addEventListener('click', () => {
      b.reachable = b.reachable === r.id ? null : r.id;
      renderPromptDom(mode);
    });
    return btn;
  });
  section('Also reachable for (optional)', reachBtns);

  const dayBtn = document.createElement('button');
  dayBtn.type = 'button';
  dayBtn.textContent = 'Out for the Day';
  dayBtn.style.cssText = btnStyle(b.outReason === 'out_day', false);
  dayBtn.addEventListener('click', () => selectOut('out_day'));
  section('Longer', [dayBtn]);

  if (mode === 'change' && b.outReason && b.outReason !== 'out_day') {
    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.textContent = 'Continue current time';
    continueBtn.style.cssText = btnStyle(b.timerMode === 'continue', false);
    continueBtn.addEventListener('click', () => {
      b.timerMode = 'continue';
      renderPromptDom(mode);
    });
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset time';
    resetBtn.style.cssText = btnStyle(b.timerMode === 'reset', false);
    resetBtn.addEventListener('click', () => {
      b.timerMode = 'reset';
      renderPromptDom(mode);
    });
    section('Timer', [continueBtn, resetBtn]);
  }

  const showDuration =
    b.outReason &&
    b.outReason !== 'out_day' &&
    (mode !== 'change' || b.timerMode === 'reset');
  if (showDuration) {
    const durBtns = DURATION_CHIPS.map((d) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = d.label;
      btn.style.cssText = btnStyle(b.durationMinutes === d.minutes, false);
      btn.addEventListener('click', () => {
        b.durationMinutes = d.minutes;
        renderPromptDom(mode);
      });
      return btn;
    });
    section(mode === 'change' ? 'New duration' : 'How long?', durBtns);
  }

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px;';

  if (mode === 'timedown') {
    const still = document.createElement('button');
    still.type = 'button';
    still.textContent = "I'm still here";
    still.style.cssText = btnStyle(false, true);
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
  if (b.outReason === 'out_day') {
    setStatus.textContent =
      mode === 'manual' || mode === 'change'
        ? 'Set Out for the Day & log out'
        : 'Set Out for the Day';
  } else if (mode === 'change') {
    setStatus.textContent =
      b.timerMode === 'continue' ? 'Update status · keep timer' : 'Update status · reset timer';
  } else {
    setStatus.textContent = 'Set status & stay signed in';
  }
  setStatus.style.cssText =
    'width:100%;padding:12px 14px;border:none;border-radius:10px;background:#3d8b65;color:#fff;font-weight:700;cursor:pointer;font-size:14px;';
  setStatus.disabled = !b.outReason;
  setStatus.addEventListener('click', async () => {
    setStatus.disabled = true;
    try {
      const isCustom = !!(b.customOutId || b.customLabel);
      const result = await b.handlers?.onSetStatus?.({
        mode,
        reason: b.outReason === 'out_day' ? 'out_day' : isCustom ? 'custom' : b.outReason,
        durationMinutes: b.durationMinutes,
        reachable: b.outReason === 'out_day' ? null : b.reachable,
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
    skip.textContent = mode === 'logout' ? 'Log out without status' : 'Log out now';
    skip.style.cssText = ghostBtnStyle();
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
    cancel.textContent = 'Cancel';
    cancel.style.cssText = ghostBtnStyle();
    cancel.addEventListener('click', () => {
      if (mode === 'logout') resolveLogoutStatusPrompt(false);
      else closeStatusPrompt();
    });
    actions.appendChild(cancel);
  }

  card.appendChild(actions);
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
