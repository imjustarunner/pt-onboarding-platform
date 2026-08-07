<template>
  <div class="wb" @keydown.stop @contextmenu.prevent>
    <!-- Toolbar -->
    <div class="wb-toolbar">
      <div class="wb-tool-group">
        <button
          v-for="t in tools"
          :key="t.id"
          :class="['wb-tool', { 'wb-tool--active': activeTool === t.id }]"
          :title="t.label"
          @click="activeTool = t.id"
        >
          <span v-html="t.icon" />
        </button>
      </div>

      <div class="wb-divider" />

      <div class="wb-tool-group">
        <button
          v-for="c in palette"
          :key="c"
          :class="['wb-color', { 'wb-color--active': activeColor === c }]"
          :style="{ background: c }"
          @click="activeColor = c"
        />
      </div>

      <div class="wb-divider" />

      <div class="wb-tool-group">
        <button
          v-for="w in strokeWidths"
          :key="w.value"
          :class="['wb-stroke', { 'wb-stroke--active': strokeWidth === w.value }]"
          :title="w.label"
          @click="strokeWidth = w.value"
        >
          <span :style="{ height: w.value + 'px', background: activeColor }" class="wb-stroke-dot" />
        </button>
      </div>

      <div class="wb-divider" />

      <div class="wb-tool-group">
        <button class="wb-action" :disabled="history.length === 0" title="Undo (Ctrl+Z)" @click="undo">
          <svg viewBox="0 0 24 24"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
        </button>
        <button class="wb-action" :disabled="future.length === 0" title="Redo (Ctrl+Y)" @click="redo">
          <svg viewBox="0 0 24 24"><path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 15.7c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 15h9V6l-3.6 4.6z"/></svg>
        </button>
        <button class="wb-action" title="Clear board" @click="clearBoard">
          <svg viewBox="0 0 24 24"><path d="M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z"/></svg>
        </button>
        <button class="wb-action" title="Export PNG" @click="exportPng">
          <svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5m14-9h-4V3H9v6H5l7 7 7-7z"/></svg>
        </button>
      </div>

      <div class="wb-spacer" />

      <div class="wb-tool-group">
        <button class="wb-zoom-btn" @click="zoom(-0.1)" title="Zoom out">−</button>
        <span class="wb-zoom-label">{{ Math.round(scale * 100) }}%</span>
        <button class="wb-zoom-btn" @click="zoom(0.1)" title="Zoom in">+</button>
        <button class="wb-zoom-btn" @click="resetView" title="Reset view">⌖</button>
      </div>

      <div class="wb-save-status" :class="saveStatusClass" :title="saveStatusLabel">
        <span>{{ saveStatusLabel }}</span>
      </div>
    </div>

    <!-- Canvas area -->
    <div class="wb-canvas-wrap" ref="wrapEl">
      <canvas
        ref="canvasEl"
        class="wb-canvas"
        :style="{ cursor: canvasCursor }"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseLeave"
        @wheel.prevent="onWheel"
        @dblclick="onDblClick"
      />

      <!-- Text input overlay -->
      <textarea
        v-if="textInput.visible"
        ref="textEl"
        class="wb-text-input"
        :style="textInputStyle"
        v-model="textInput.value"
        @keydown.enter.exact.prevent="commitText"
        @keydown.escape="cancelText"
        @blur="commitText"
      />

      <!-- Sticky note overlay -->
      <div
        v-for="sticky in stickyNotes"
        :key="sticky.id"
        class="wb-sticky"
        :style="stickyStyle(sticky)"
        @mousedown.stop="startDragSticky($event, sticky)"
        @dblclick.stop="editSticky(sticky)"
      >
        <div class="wb-sticky-handle">
          <button class="wb-sticky-del" @click.stop="deleteSticky(sticky.id)" title="Remove">✕</button>
        </div>
        <div
          class="wb-sticky-body"
          :contenteditable="sticky.editing"
          @blur="saveSticky(sticky, $event)"
          @input="sticky.text = $event.target.innerText"
          @keydown.escape="sticky.editing = false"
          ref="stickyBodies"
        >{{ sticky.text }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import api from '../../services/api.js';

const props = defineProps({
  projectId:    { type: Number, required: true },
  whiteboardId: { type: Number, default: null },  // null = legacy single-board
  name:         { type: String, default: 'Whiteboard' },
});
const emit = defineEmits(['saved', 'renamed']);

// ──────────────────────────────────────────
// Canvas & viewport state
// ──────────────────────────────────────────
const canvasEl = ref(null);
const wrapEl = ref(null);
const textEl = ref(null);
let ctx = null;

const scale = ref(1);
const offset = ref({ x: 0, y: 0 });

// ──────────────────────────────────────────
// Tool state
// ──────────────────────────────────────────
const activeTool = ref('pen');
const activeColor = ref('#1a1a1a');
const strokeWidth = ref(3);

const tools = [
  { id: 'select', label: 'Select / Pan (V)', icon: '<svg viewBox="0 0 24 24"><path d="M4 0l16 12.29-6.37.97L10.96 20 4 0z" transform="scale(0.9) translate(2,2)"/></svg>' },
  { id: 'pen',    label: 'Pen (P)',          icon: '<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.71a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>' },
  { id: 'line',   label: 'Line (L)',         icon: '<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="2"/></svg>' },
  { id: 'arrow',  label: 'Arrow (A)',        icon: '<svg viewBox="0 0 24 24"><path d="M5 19l14-14M14 5h5v5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' },
  { id: 'rect',   label: 'Rectangle (R)',    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" stroke-width="2" rx="1"/></svg>' },
  { id: 'ellipse',label: 'Ellipse (E)',      icon: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="9" ry="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>' },
  { id: 'text',   label: 'Text (T)',         icon: '<svg viewBox="0 0 24 24"><path d="M5 4v3h5.5v12h3V7H19V4z"/></svg>' },
  { id: 'sticky', label: 'Sticky Note (S)',  icon: '<svg viewBox="0 0 24 24"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10l6-6V5a2 2 0 0 0-2-2z"/></svg>' },
  { id: 'erase',  label: 'Eraser (X)',       icon: '<svg viewBox="0 0 24 24"><path d="M16.24 3.56l4.243 4.243a1 1 0 0 1 0 1.415L8.929 20.768a2 2 0 0 1-2.828 0l-3.535-3.535a1 1 0 0 1 0-1.415L13.818 4.565a1 1 0 0 1 1.414 0zM6 17l2 2 10-10-2-2L6 17z" fill="currentColor"/></svg>' },
];

const palette = [
  '#1a1a1a', '#4a4a4a', '#ffffff', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

const strokeWidths = [
  { value: 1.5, label: 'Thin' },
  { value: 3,   label: 'Medium' },
  { value: 6,   label: 'Thick' },
  { value: 12,  label: 'Bold' },
];

const canvasCursor = computed(() => {
  if (activeTool.value === 'select') return 'default';
  if (activeTool.value === 'erase') return 'cell';
  if (activeTool.value === 'text') return 'text';
  if (activeTool.value === 'sticky') return 'crosshair';
  return 'crosshair';
});

// ──────────────────────────────────────────
// Shapes history (undo / redo)
// ──────────────────────────────────────────
const history  = ref([]); // committed shapes
const future   = ref([]); // for redo

function commit(shape) {
  history.value.push(shape);
  future.value = [];
  scheduleRedraw();
  scheduleSave();
}

function undo() {
  if (!history.value.length) return;
  future.value.push(history.value.pop());
  scheduleRedraw();
  scheduleSave();
}

function redo() {
  if (!future.value.length) return;
  history.value.push(future.value.pop());
  scheduleRedraw();
  scheduleSave();
}

function clearBoard() {
  if (!confirm('Clear the whiteboard? This cannot be undone.')) return;
  history.value = [];
  future.value = [];
  stickyNotes.value = [];
  scheduleRedraw();
  scheduleSave();
}

// ──────────────────────────────────────────
// Sticky notes (DOM-based, separate from canvas)
// ──────────────────────────────────────────
const stickyNotes = ref([]);
const STICKY_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff'];
let stickyIdSeq = 1;

let draggingSticky = null;
let dragStickyOff = { x: 0, y: 0 };

function startDragSticky(ev, sticky) {
  if (sticky.editing) return;
  draggingSticky = sticky;
  dragStickyOff = { x: ev.clientX - sticky.x, y: ev.clientY - sticky.y };
  window.addEventListener('mousemove', moveDragSticky);
  window.addEventListener('mouseup', stopDragSticky);
}
function moveDragSticky(ev) {
  if (!draggingSticky) return;
  draggingSticky.x = ev.clientX - dragStickyOff.x;
  draggingSticky.y = ev.clientY - dragStickyOff.y;
}
function stopDragSticky() {
  draggingSticky = null;
  window.removeEventListener('mousemove', moveDragSticky);
  window.removeEventListener('mouseup', stopDragSticky);
  scheduleSave();
}
function editSticky(sticky) {
  sticky.editing = true;
  nextTick(() => {
    const el = document.querySelector(`.wb-sticky[data-id="${sticky.id}"] .wb-sticky-body`);
    if (el) { el.focus(); const r = document.createRange(); r.selectNodeContents(el); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); }
  });
}
function saveSticky(sticky, ev) {
  sticky.text = ev.target.innerText;
  sticky.editing = false;
  scheduleSave();
}
function deleteSticky(id) {
  stickyNotes.value = stickyNotes.value.filter(s => s.id !== id);
  scheduleSave();
}
function stickyStyle(s) {
  return {
    left: s.x + 'px',
    top:  s.y + 'px',
    width: '200px',
    background: s.color,
  };
}

// ──────────────────────────────────────────
// Text input overlay
// ──────────────────────────────────────────
const textInput = ref({ visible: false, x: 0, y: 0, wx: 0, wy: 0, value: '', color: '#1a1a1a', fontSize: 16 });

const textInputStyle = computed(() => ({
  left:  textInput.value.x + 'px',
  top:   textInput.value.y + 'px',
  color: textInput.value.color,
  fontSize: textInput.value.fontSize + 'px',
}));

function commitText() {
  const v = textInput.value.value.trim();
  if (v) {
    commit({
      type: 'text',
      text: v,
      wx: textInput.value.wx,
      wy: textInput.value.wy,
      color: textInput.value.color,
      fontSize: textInput.value.fontSize,
    });
  }
  textInput.value.visible = false;
  textInput.value.value = '';
}

function cancelText() {
  textInput.value.visible = false;
  textInput.value.value = '';
}

// ──────────────────────────────────────────
// Mouse / drawing logic
// ──────────────────────────────────────────
let drawing = false;
let currentPath = [];
let startPt = null;
let panning = false;
let panStart = null;
let panOffStart = null;

function screenToWorld(x, y) {
  return {
    x: (x - offset.value.x) / scale.value,
    y: (y - offset.value.y) / scale.value,
  };
}

function getEventPos(ev) {
  const rect = canvasEl.value.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function onMouseDown(ev) {
  const pos = getEventPos(ev);

  if (activeTool.value === 'select' || ev.buttons === 4 || (ev.altKey)) {
    panning = true;
    panStart = pos;
    panOffStart = { ...offset.value };
    return;
  }

  if (activeTool.value === 'sticky') {
    const rect = canvasEl.value.getBoundingClientRect();
    const id = stickyIdSeq++;
    const color = STICKY_COLORS[id % STICKY_COLORS.length];
    stickyNotes.value.push({
      id, text: 'Double-click to edit',
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top,
      color, editing: false,
    });
    scheduleSave();
    return;
  }

  if (activeTool.value === 'text') {
    const rect = canvasEl.value.getBoundingClientRect();
    const wpos = screenToWorld(pos.x, pos.y);
    textInput.value = {
      visible: true,
      x: ev.clientX - rect.left,
      y: ev.clientY - rect.top - 8,
      wx: wpos.x,
      wy: wpos.y,
      value: '',
      color: activeColor.value,
      fontSize: Math.round(16 / scale.value),
    };
    nextTick(() => textEl.value?.focus());
    return;
  }

  drawing = true;
  const wpos = screenToWorld(pos.x, pos.y);
  startPt = wpos;
  currentPath = [wpos];
}

function onMouseMove(ev) {
  const pos = getEventPos(ev);

  if (panning && panStart) {
    offset.value = {
      x: panOffStart.x + (pos.x - panStart.x),
      y: panOffStart.y + (pos.y - panStart.y),
    };
    scheduleRedraw();
    return;
  }

  if (!drawing) return;
  const wpos = screenToWorld(pos.x, pos.y);

  if (activeTool.value === 'pen') {
    currentPath.push(wpos);
    scheduleRedraw(true);
  } else {
    scheduleRedraw(true);
    drawPreview(startPt, wpos);
  }
}

function onMouseUp(ev) {
  if (panning) { panning = false; return; }
  if (!drawing) return;
  drawing = false;

  const pos = getEventPos(ev);
  const wpos = screenToWorld(pos.x, pos.y);

  if (activeTool.value === 'pen') {
    if (currentPath.length > 1) {
      commit({ type: 'path', points: [...currentPath], color: activeColor.value, width: strokeWidth.value });
    }
  } else if (activeTool.value === 'erase') {
    // handled in mousemove
  } else {
    commit({
      type: activeTool.value,
      x1: startPt.x, y1: startPt.y,
      x2: wpos.x, y2: wpos.y,
      color: activeColor.value,
      width: strokeWidth.value,
    });
  }
  currentPath = [];
  startPt = null;
}

function onMouseLeave() {
  if (drawing) {
    drawing = false;
    currentPath = [];
    startPt = null;
  }
  panning = false;
}

function onDblClick(ev) {
  if (activeTool.value !== 'erase') return;
}

function onWheel(ev) {
  const pos = getEventPos(ev);
  const factor = ev.deltaY < 0 ? 1.1 : 0.9;
  const newScale = Math.min(4, Math.max(0.15, scale.value * factor));
  offset.value = {
    x: pos.x - (pos.x - offset.value.x) * (newScale / scale.value),
    y: pos.y - (pos.y - offset.value.y) * (newScale / scale.value),
  };
  scale.value = newScale;
  scheduleRedraw();
}

// ──────────────────────────────────────────
// Rendering
// ──────────────────────────────────────────
let rafId = null;
let pendingPreviewFn = null;

function scheduleRedraw(withPreview = false) {
  if (!withPreview) pendingPreviewFn = null;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    redraw();
    if (pendingPreviewFn) { pendingPreviewFn(); pendingPreviewFn = null; }
  });
}

function redraw() {
  if (!ctx) return;
  const w = canvasEl.value.width;
  const h = canvasEl.value.height;
  ctx.clearRect(0, 0, w, h);

  // Background grid
  drawGrid();

  ctx.save();
  ctx.translate(offset.value.x, offset.value.y);
  ctx.scale(scale.value, scale.value);

  for (const shape of history.value) drawShape(shape);

  ctx.restore();
}

function drawGrid() {
  const w = canvasEl.value.width;
  const h = canvasEl.value.height;
  const baseSpacing = 40;
  const spacing = baseSpacing * scale.value;
  const ox = ((offset.value.x % spacing) + spacing) % spacing;
  const oy = ((offset.value.y % spacing) + spacing) % spacing;

  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  for (let x = ox; x < w; x += spacing) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = oy; y < h; y += spacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.restore();
}

function drawShape(shape) {
  ctx.save();
  ctx.strokeStyle = shape.color || '#1a1a1a';
  ctx.fillStyle   = shape.color || '#1a1a1a';
  ctx.lineWidth   = (shape.width || 2) / scale.value * scale.value;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  if (shape.type === 'path') {
    if (!shape.points?.length) return;
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x, shape.points[0].y);
    for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
    ctx.stroke();
  } else if (shape.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
  } else if (shape.type === 'arrow') {
    drawArrow(shape.x1, shape.y1, shape.x2, shape.y2);
  } else if (shape.type === 'rect') {
    ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
  } else if (shape.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      (shape.x1 + shape.x2) / 2, (shape.y1 + shape.y2) / 2,
      Math.abs(shape.x2 - shape.x1) / 2, Math.abs(shape.y2 - shape.y1) / 2,
      0, 0, Math.PI * 2
    );
    ctx.stroke();
  } else if (shape.type === 'text') {
    const fs = (shape.fontSize || 16);
    ctx.font = `${fs}px Inter, sans-serif`;
    ctx.fillText(shape.text, shape.wx, shape.wy);
  }
  ctx.restore();
}

function drawArrow(x1, y1, x2, y2) {
  const headLen = 15 / scale.value;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawPreview(from, to) {
  ctx.save();
  ctx.translate(offset.value.x, offset.value.y);
  ctx.scale(scale.value, scale.value);
  ctx.strokeStyle = activeColor.value;
  ctx.fillStyle   = activeColor.value;
  ctx.lineWidth   = strokeWidth.value;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.setLineDash([6, 4]);

  if (activeTool.value === 'line') {
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  } else if (activeTool.value === 'arrow') {
    drawArrow(from.x, from.y, to.x, to.y);
  } else if (activeTool.value === 'rect') {
    ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
  } else if (activeTool.value === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(
      (from.x + to.x) / 2, (from.y + to.y) / 2,
      Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2,
      0, 0, Math.PI * 2
    );
    ctx.stroke();
  }
  ctx.restore();
}

// ──────────────────────────────────────────
// Zoom helpers
// ──────────────────────────────────────────
function zoom(delta) {
  const newScale = Math.min(4, Math.max(0.15, scale.value + delta));
  const cx = canvasEl.value.width / 2;
  const cy = canvasEl.value.height / 2;
  offset.value = {
    x: cx - (cx - offset.value.x) * (newScale / scale.value),
    y: cy - (cy - offset.value.y) * (newScale / scale.value),
  };
  scale.value = newScale;
  scheduleRedraw();
}

function resetView() {
  scale.value = 1;
  offset.value = { x: 0, y: 0 };
  scheduleRedraw();
}

// ──────────────────────────────────────────
// Keyboard shortcuts
// ──────────────────────────────────────────
function onKeyDown(ev) {
  if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable) return;
  if (ev.ctrlKey || ev.metaKey) {
    if (ev.key === 'z') { ev.preventDefault(); undo(); }
    if (ev.key === 'y') { ev.preventDefault(); redo(); }
    return;
  }
  const map = { v: 'select', p: 'pen', l: 'line', a: 'arrow', r: 'rect', e: 'ellipse', t: 'text', s: 'sticky', x: 'erase' };
  if (map[ev.key.toLowerCase()]) activeTool.value = map[ev.key.toLowerCase()];
}

// ──────────────────────────────────────────
// Export
// ──────────────────────────────────────────
function exportPng() {
  const link = document.createElement('a');
  link.download = `whiteboard-${props.projectId}.png`;
  link.href = canvasEl.value.toDataURL('image/png');
  link.click();
}

// ──────────────────────────────────────────
// Save / load (backend + localStorage fallback)
// ──────────────────────────────────────────
const saveStatusLabel = ref('Saved');
const saveStatusClass = ref('saved');
let saveTimer = null;

function scheduleSave() {
  saveStatusLabel.value = 'Unsaved';
  saveStatusClass.value = 'unsaved';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 1500);
}

async function doSave() {
  const payload = {
    shapes: history.value,
    stickies: stickyNotes.value.map(s => ({ ...s, editing: false })),
  };
  const lsKey = props.whiteboardId
    ? `wb-${props.projectId}-${props.whiteboardId}`
    : `wb-${props.projectId}`;
  try { localStorage.setItem(lsKey, JSON.stringify(payload)); } catch (_) { /* */ }
  try {
    if (props.whiteboardId) {
      await api.put(`/task-projects/${props.projectId}/whiteboards/${props.whiteboardId}`, { data: payload });
    } else {
      await api.put(`/task-projects/${props.projectId}/whiteboard`, { data: payload });
    }
    saveStatusLabel.value = 'Saved';
    saveStatusClass.value = 'saved';
    emit('saved');
  } catch (_) {
    saveStatusLabel.value = 'Saved locally';
    saveStatusClass.value = 'saved';
  }
}

async function loadWhiteboard() {
  let data = null;
  const lsKey = props.whiteboardId
    ? `wb-${props.projectId}-${props.whiteboardId}`
    : `wb-${props.projectId}`;
  try {
    if (props.whiteboardId) {
      const res = await api.get(`/task-projects/${props.projectId}/whiteboards/${props.whiteboardId}`);
      data = res.data?.data;
    } else {
      const res = await api.get(`/task-projects/${props.projectId}/whiteboard`);
      data = res.data?.data;
    }
  } catch (_) { /* */ }
  if (!data) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) data = JSON.parse(raw);
    } catch (_) { /* */ }
  }
  if (data) {
    history.value     = data.shapes  || [];
    stickyNotes.value = (data.stickies || []).map(s => ({ ...s, editing: false }));
    stickyIdSeq = Math.max(stickyIdSeq, ...stickyNotes.value.map(s => s.id + 1), 1);
    scheduleRedraw();
  }
}

// ──────────────────────────────────────────
// Resize observer
// ──────────────────────────────────────────
let resizeObs = null;

function fitCanvas() {
  if (!canvasEl.value || !wrapEl.value) return;
  const { width, height } = wrapEl.value.getBoundingClientRect();
  canvasEl.value.width  = width;
  canvasEl.value.height = height;
  scheduleRedraw();
}

// ──────────────────────────────────────────
// Lifecycle
// ──────────────────────────────────────────
onMounted(() => {
  ctx = canvasEl.value.getContext('2d');
  fitCanvas();
  loadWhiteboard();
  window.addEventListener('keydown', onKeyDown);
  resizeObs = new ResizeObserver(fitCanvas);
  resizeObs.observe(wrapEl.value);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  resizeObs?.disconnect();
  clearTimeout(saveTimer);
});

watch([() => props.projectId, () => props.whiteboardId], () => {
  history.value = [];
  future.value = [];
  stickyNotes.value = [];
  loadWhiteboard();
});
</script>

<style scoped>
.wb {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #f8fafc;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

/* ── Toolbar ─────────────────────────────── */
.wb-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
  flex-wrap: wrap;
  user-select: none;
}

.wb-divider {
  width: 1px;
  height: 28px;
  background: #e2e8f0;
  margin: 0 4px;
}

.wb-spacer { flex: 1; }

.wb-tool-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.wb-tool {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: #475569;
  transition: background 0.15s, color 0.15s;
}

.wb-tool:hover { background: #f1f5f9; color: #1e293b; }
.wb-tool--active { background: #e0f2fe; color: #0369a1; }
.wb-tool svg, .wb-tool :deep(svg) { width: 18px; height: 18px; fill: currentColor; }

.wb-color {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s;
  outline: none;
  flex-shrink: 0;
}

.wb-color:hover { transform: scale(1.15); }
.wb-color--active { border-color: #0ea5e9; box-shadow: 0 0 0 2px white inset; }

.wb-stroke {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.wb-stroke:hover { background: #f1f5f9; }
.wb-stroke--active { border-color: #0ea5e9; background: #e0f2fe; }

.wb-stroke-dot {
  display: block;
  width: 16px;
  border-radius: 4px;
}

.wb-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: #64748b;
  transition: background 0.15s, color 0.15s;
}
.wb-action:hover:not(:disabled) { background: #f1f5f9; color: #1e293b; }
.wb-action:disabled { opacity: 0.35; cursor: default; }
.wb-action svg { width: 18px; height: 18px; fill: currentColor; }

.wb-zoom-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: #475569;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wb-zoom-btn:hover { background: #f1f5f9; }

.wb-zoom-label {
  font-size: 12px;
  color: #64748b;
  min-width: 36px;
  text-align: center;
}

.wb-save-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  white-space: nowrap;
}
.wb-save-status.saved   { color: #16a34a; background: #dcfce7; }
.wb-save-status.unsaved { color: #d97706; background: #fef3c7; }

/* ── Canvas wrap ─────────────────────────── */
.wb-canvas-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.wb-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: #f8fafc;
}

/* ── Text input ──────────────────────────── */
.wb-text-input {
  position: absolute;
  background: transparent;
  border: 1px dashed #0ea5e9;
  border-radius: 4px;
  padding: 2px 6px;
  min-width: 80px;
  min-height: 30px;
  resize: both;
  font-family: Inter, sans-serif;
  outline: none;
  z-index: 10;
}

/* ── Sticky notes ────────────────────────── */
.wb-sticky {
  position: absolute;
  min-height: 100px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  z-index: 20;
  cursor: move;
  user-select: none;
}

.wb-sticky-handle {
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 2px 6px;
  opacity: 0.6;
}
.wb-sticky:hover .wb-sticky-handle { opacity: 1; }

.wb-sticky-del {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.2);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.wb-sticky-body {
  flex: 1;
  padding: 6px 10px 10px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  outline: none;
  min-height: 60px;
}
</style>
