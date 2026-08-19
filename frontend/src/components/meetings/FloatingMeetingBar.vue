<template>
  <div
    v-if="meeting.active"
    class="fmb"
    role="region"
    aria-label="Meeting in progress"
    :style="dragStyle"
    @mousedown.self="startDrag"
  >
    <!-- Header -->
    <div class="fmb__header" @mousedown="startDrag">
      <span class="fmb__live-dot" aria-hidden="true" />
      <span class="fmb__title" :title="meeting.meetingTitle">{{ meeting.meetingTitle }}</span>
      <div class="fmb__header-actions">
        <button
          type="button"
          class="fmb__btn fmb__btn--expand"
          title="Back to meeting"
          @click.stop="expandMeeting"
        >⤢</button>
        <button
          type="button"
          class="fmb__btn fmb__btn--leave"
          title="Leave meeting"
          @click.stop="leaveMeeting"
        >✕</button>
      </div>
    </div>

    <!-- Video tile strip -->
    <div class="fmb__tiles">
      <div
        v-for="r in remotes"
        :key="r.streamId"
        class="fmb__tile"
        :ref="(el) => setTileEl(r.streamId, el)"
      >
        <span class="fmb__tile-name">{{ shortName(r.name) }}</span>
        <span v-if="!r.hasAudio" class="fmb__tile-muted">🔇</span>
      </div>
      <div v-if="!remotes.length" class="fmb__tile fmb__tile--empty">
        <span>Waiting…</span>
      </div>
    </div>

    <!-- Footer controls -->
    <div class="fmb__footer">
      <button
        type="button"
        class="fmb__ctrl-btn"
        :class="{ 'fmb__ctrl-btn--muted': audioMuted }"
        :title="audioMuted ? 'Unmute' : 'Mute'"
        @click="toggleAudio"
      >
        {{ audioMuted ? '🔇' : '🎙' }}
      </button>
      <button
        type="button"
        class="fmb__ctrl-btn fmb__ctrl-btn--expand-full"
        title="Return to meeting"
        @click="expandMeeting"
      >
        Return to meeting
      </button>
    </div>

    <div v-if="connectError" class="fmb__error">{{ connectError }}</div>
    <div ref="publisherHostEl" class="fmb__publisher-host" aria-hidden="true" />
  </div>
</template>

<script setup>
import { ref, reactive, watch, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useActiveMeeting } from '../../composables/useActiveMeeting';

const router = useRouter();
const { state: meeting, clearMiniMode } = useActiveMeeting();

// ─── Vonage session ───────────────────────────────────────────────────────────
let session = null;
const remotes = ref([]);
const tileEls = new Map();
const connectError = ref('');
const audioMuted = ref(false);
const publisherHostEl = ref(null);
let localPublisher = null;
let connectInFlight = false;

// Track remote tile DOM elements (used to inject subscriber video)
function setTileEl(streamId, el) {
  const id = String(streamId || '');
  if (!id) return;
  if (el) {
    tileEls.set(id, el);
    reparentSubscriberMedia(id, el);
    return;
  }
  tileEls.delete(id);
}

function reparentSubscriberMedia(streamId, targetEl) {
  if (!session || !targetEl) return;
  // Re-attach subscriber DOM after Vue re-renders the tile element.
  const sub = subscribers.get(streamId);
  if (!sub) return;
  try {
    const mediaEl = typeof sub.element === 'function' ? sub.element() : null;
    if (mediaEl && mediaEl.parentNode !== targetEl) {
      targetEl.innerHTML = '';
      targetEl.appendChild(mediaEl);
    }
  } catch { /* ignore */ }
}

const subscribers = new Map();

async function connect() {
  if (!meeting.vonageSessionId || !meeting.token || session || connectInFlight) return;
  connectInFlight = true;
  connectError.value = '';
  try {
    const { default: OT } = await import('@vonage/client-sdk-video');
    session = OT.initSession(
      meeting.applicationId || meeting.roomName || meeting.vonageSessionId,
      meeting.vonageSessionId
    );

    session.on('streamCreated', async (event) => {
      const stream = event.stream;
      const streamId = String(stream.streamId || '');
      if (!streamId) return;
      const ownId = session?.connection?.connectionId;
      const streamConn = stream?.connection?.connectionId;
      if (ownId && streamConn && ownId === streamConn) return;

      // Add to reactive list
      const name = (() => {
        try {
          const data = stream.connection?.data;
          if (data) {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            const n = String(parsed.displayName || parsed.identity || '').trim();
            return n || 'Participant';
          }
        } catch { /* ignore */ }
        return String(stream.name || '').trim() || 'Participant';
      })();

      remotes.value = [...remotes.value, {
        streamId,
        name,
        hasAudio: stream.hasAudio !== false,
        hasVideo: stream.hasVideo !== false,
      }];

      await nextTick();
      const targetEl = tileEls.get(streamId);
      if (!targetEl) return;
      targetEl.innerHTML = '';
      const sub = session.subscribe(
        stream,
        targetEl,
        {
          insertMode: 'append',
          width: '100%',
          height: '100%',
          fitMode: 'contain',
          subscribeToAudio: true,
          subscribeToVideo: false,
          style: { buttonDisplayMode: 'off', nameDisplayMode: 'off' }
        },
        (err) => {
          if (err) console.warn('[FloatingMeetingBar] subscribe error', err);
        }
      );
      subscribers.set(streamId, sub);
      sub.on?.('audioEnabled', () => updateRemoteAudio(streamId, true));
      sub.on?.('audioDisabled', () => updateRemoteAudio(streamId, false));
    });

    session.on('streamDestroyed', (event) => {
      const streamId = String(event.stream?.streamId || '');
      remotes.value = remotes.value.filter((r) => r.streamId !== streamId);
      tileEls.delete(streamId);
      subscribers.delete(streamId);
    });

    session.on('sessionDisconnected', () => {
      remotes.value = [];
      subscribers.clear();
    });

    await new Promise((res, rej) => session.connect(meeting.token, (err) => (err ? rej(err) : res())));

    // Keep this participant published while they browse other pages. Mini mode
    // used to subscribe-only, which made everyone else lose their audio.
    try {
      await nextTick();
      const mountEl = publisherHostEl.value;
      if (mountEl && typeof OT.initPublisher === 'function') {
        mountEl.innerHTML = '';
        const pub = await new Promise((resolve, reject) => {
          const nextPublisher = OT.initPublisher(
            mountEl,
            {
              insertMode: 'append',
              width: 1,
              height: 1,
              publishAudio: !audioMuted.value,
              publishVideo: false,
              name: meeting.meetingTitle || 'Participant',
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: false,
              style: { buttonDisplayMode: 'off', nameDisplayMode: 'off' }
            },
            (err) => (err ? reject(err) : resolve(nextPublisher))
          );
        });
        await new Promise((resolve, reject) => {
          session.publish(pub, (err) => (err ? reject(err) : resolve()));
        });
        localPublisher = pub;
        try {
          mountEl.querySelectorAll('video, audio').forEach((el) => {
            el.muted = true;
            el.volume = 0;
          });
        } catch { /* ignore */ }
      }
    } catch (publishErr) {
      console.warn('[FloatingMeetingBar] could not keep microphone published', publishErr?.message || publishErr);
    }
  } catch (e) {
    connectError.value = 'Could not connect to meeting audio/video.';
    console.warn('[FloatingMeetingBar] connect error', e?.message || e);
  } finally {
    connectInFlight = false;
  }
}

function updateRemoteAudio(streamId, hasAudio) {
  const idx = remotes.value.findIndex((r) => r.streamId === streamId);
  if (idx !== -1) {
    const copy = [...remotes.value];
    copy[idx] = { ...copy[idx], hasAudio };
    remotes.value = copy;
  }
}

function disconnect() {
  if (localPublisher) {
    try { session?.unpublish(localPublisher); } catch { /* ignore */ }
    try { localPublisher.destroy(); } catch { /* ignore */ }
    localPublisher = null;
  }
  subscribers.clear();
  tileEls.clear();
  remotes.value = [];
  if (session) {
    try { session.disconnect(); } catch { /* ignore */ }
    session = null;
  }
}

function toggleAudio() {
  audioMuted.value = !audioMuted.value;
  if (localPublisher) {
    try { localPublisher.publishAudio(!audioMuted.value); } catch { /* ignore */ }
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function expandMeeting() {
  const path = meeting.meetingPath;
  disconnect();
  clearMiniMode();
  if (path) router.push(path);
}

function leaveMeeting() {
  disconnect();
  clearMiniMode();
}

// ─── Watch active state ───────────────────────────────────────────────────────
watch(
  () => meeting.active,
  (on) => {
    if (on) void connect();
    else disconnect();
  },
  { immediate: true }
);

onUnmounted(disconnect);

// ─── Short name helper ────────────────────────────────────────────────────────
function shortName(name) {
  const clean = String(name || '')
    .replace(/^(You|Host|Participant|Guest|Supervisor|Supervisee)\s*[·|]\s*/i, '')
    .trim();
  const parts = clean.split(/\s+/);
  if (parts.length <= 1) return clean.slice(0, 12);
  return `${parts[0]} ${parts[1][0]}.`;
}

// ─── Drag to reposition ───────────────────────────────────────────────────────
const dragOffset = reactive({ x: 0, y: 0 });
const dragging = ref(false);
const dragStyle = ref('');

function startDrag(e) {
  if (e.button !== 0) return;
  dragging.value = true;
  const rect = e.currentTarget.closest?.('.fmb')?.getBoundingClientRect?.() || { left: 0, top: 0 };
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;

  function onMove(ev) {
    if (!dragging.value) return;
    const x = ev.clientX - dragOffset.x;
    const y = ev.clientY - dragOffset.y;
    dragStyle.value = `left:${x}px;top:${y}px;right:auto;bottom:auto;`;
  }
  function onUp() {
    dragging.value = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
</script>

<style scoped>
.fmb {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 8900;
  width: 272px;
  background: linear-gradient(160deg, #0e1520 0%, #141c2b 100%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  user-select: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* Header */
.fmb__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px 8px;
  cursor: grab;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.fmb__header:active { cursor: grabbing; }
.fmb__live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.22);
  flex-shrink: 0;
  animation: fmb-pulse 2s ease-in-out infinite;
}
@keyframes fmb-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.22); }
  50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
}
.fmb__title {
  flex: 1;
  font-size: 0.78rem;
  font-weight: 700;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fmb__header-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.fmb__btn {
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  border-radius: 6px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s;
  padding: 0;
}
.fmb__btn:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
.fmb__btn--leave:hover { background: rgba(239, 68, 68, 0.3); color: #fca5a5; }

/* Tiles */
.fmb__tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  min-height: 72px;
  max-height: 190px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.25);
}
.fmb__tile {
  position: relative;
  width: 80px;
  height: 62px;
  border-radius: 8px;
  overflow: hidden;
  background: #0b0e14;
  flex-shrink: 0;
}
.fmb__tile:deep(video),
.fmb__tile:deep(.OT_root),
.fmb__tile:deep(.OT_subscriber),
.fmb__tile:deep(.OT_widget-container) {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}
.fmb__tile-name {
  position: absolute;
  bottom: 3px;
  left: 4px;
  right: 4px;
  z-index: 2;
  font-size: 0.6rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.fmb__tile-muted {
  position: absolute;
  top: 3px;
  right: 4px;
  z-index: 2;
  font-size: 0.65rem;
  pointer-events: none;
}
.fmb__tile--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 0.72rem;
  font-style: italic;
  width: 100%;
}

/* Footer */
.fmb__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 9px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.fmb__ctrl-btn {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #cbd5e1;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.fmb__ctrl-btn:hover { background: rgba(255, 255, 255, 0.12); }
.fmb__ctrl-btn--muted { color: #fca5a5; border-color: rgba(239, 68, 68, 0.4); }
.fmb__ctrl-btn--expand-full {
  flex: 1;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 700;
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.3);
  background: rgba(34, 197, 94, 0.08);
}
.fmb__ctrl-btn--expand-full:hover { background: rgba(34, 197, 94, 0.16); }

/* Error */
.fmb__error {
  padding: 6px 10px;
  font-size: 0.72rem;
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.12);
  border-top: 1px solid rgba(239, 68, 68, 0.2);
}
.fmb__publisher-host {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
</style>
