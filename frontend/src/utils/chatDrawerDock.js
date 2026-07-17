/** Edge-dock helpers for the Messages rail (snap to screen edges). */

export const CHAT_DOCK_STORAGE_KEY = 'pt.messages.dock.v1';

export const DEFAULT_DOCK = Object.freeze({ edge: 'left', along: 0.5 });

const EDGES = ['left', 'right', 'top', 'bottom'];

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeDock(raw) {
  const edge = EDGES.includes(raw?.edge) ? raw.edge : DEFAULT_DOCK.edge;
  const along = Number.isFinite(Number(raw?.along))
    ? clamp(Number(raw.along), 0.08, 0.92)
    : DEFAULT_DOCK.along;
  return { edge, along };
}

export function loadDock() {
  try {
    const raw = localStorage.getItem(CHAT_DOCK_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DOCK };
    return normalizeDock(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DOCK };
  }
}

export function saveDock(dock) {
  try {
    localStorage.setItem(CHAT_DOCK_STORAGE_KEY, JSON.stringify(normalizeDock(dock)));
  } catch {
    /* ignore */
  }
}

/**
 * Snap a pointer position to the nearest screen edge.
 * `along` is the fraction (0–1) along that edge.
 */
export function snapPointerToEdge(clientX, clientY, vw = window.innerWidth, vh = window.innerHeight) {
  const x = Number(clientX) || 0;
  const y = Number(clientY) || 0;
  const w = Math.max(1, vw);
  const h = Math.max(1, vh);
  const dist = {
    left: x,
    right: w - x,
    top: y,
    bottom: h - y
  };
  let edge = 'left';
  let best = dist.left;
  for (const e of EDGES) {
    if (dist[e] < best) {
      best = dist[e];
      edge = e;
    }
  }
  const along =
    edge === 'left' || edge === 'right'
      ? clamp(y / h, 0.08, 0.92)
      : clamp(x / w, 0.08, 0.92);
  return { edge, along };
}

/** Fixed positioning styles for a docked (or dragging) rail. */
export function dockToStyle(dock, dragPoint = null) {
  if (dragPoint && Number.isFinite(dragPoint.x) && Number.isFinite(dragPoint.y)) {
    return {
      left: `${dragPoint.x}px`,
      top: `${dragPoint.y}px`,
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, -50%)'
    };
  }
  const { edge, along } = normalizeDock(dock);
  const pct = `${(along * 100).toFixed(2)}%`;
  if (edge === 'left') {
    return { left: '0', top: pct, right: 'auto', bottom: 'auto', transform: 'translateY(-50%)' };
  }
  if (edge === 'right') {
    return { right: '0', left: 'auto', top: pct, bottom: 'auto', transform: 'translateY(-50%)' };
  }
  if (edge === 'top') {
    return { top: '0', left: pct, right: 'auto', bottom: 'auto', transform: 'translateX(-50%)' };
  }
  return { bottom: '0', top: 'auto', left: pct, right: 'auto', transform: 'translateX(-50%)' };
}
