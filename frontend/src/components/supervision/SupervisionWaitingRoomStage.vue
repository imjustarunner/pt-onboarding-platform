<template>
  <div class="swr" :class="{ 'swr--pip': pip }">
    <video class="swr__bg swr__bg--portrait" autoplay muted loop playsinline>
      <source src="/assets/video/waiting-room.mp4" type="video/mp4" />
    </video>
    <video class="swr__bg swr__bg--landscape" autoplay muted loop playsinline>
      <source src="/assets/video/horizontal-waiting-room.mp4" type="video/mp4" />
    </video>
    <div class="swr__shade" aria-hidden="true" />
    <div v-if="!pip" class="swr__overlay">
      <p class="swr__kicker">Waiting Room</p>
      <h2>{{ meetingTitle || 'Welcome to the Waiting Room' }}</h2>
      <p class="swr__sub">{{ welcomeCopy }}</p>
      <div class="swr__cards">
        <div class="swr__card swr__card--welcome">
          <strong>You are in the waiting room</strong>
          <span>Your privacy and care are our priority.</span>
        </div>
        <div class="swr__card swr__card--status">
          <div class="swr__status-row">
            <span>Waiting Room Status</span>
            <span
              class="swr__pill"
              :class="hostPresent ? 'swr__pill--here' : 'swr__pill--waiting'"
            >{{ statusPill }}</span>
          </div>
          <p class="swr__status-copy">{{ hostStatusCopy }}</p>
        </div>
        <div v-if="prepItems.length" class="swr__card swr__card--prep">
          <strong>Session plan</strong>
          <ul class="swr__prep-list">
            <li v-for="item in prepItems" :key="item.id">
              <span class="swr__prep-tag">{{ item.kind }}</span>
              <span>{{ item.text }}</span>
            </li>
          </ul>
        </div>
        <div class="swr__card swr__card--music">
          <div class="swr__music-head">
            <strong>Waiting room music</strong>
            <span class="swr__music-track">{{ currentTrack.label }}</span>
          </div>
          <div class="swr__music-actions">
            <button
              type="button"
              class="swr__music-btn swr__music-btn--primary"
              :aria-pressed="musicPlaying"
              @click="toggleMusic"
            >
              {{ musicPlaying ? 'Pause music' : 'Play music' }}
            </button>
            <button
              type="button"
              class="swr__music-btn"
              title="Next track"
              @click="nextTrack"
            >
              Next track
            </button>
          </div>
        </div>
      </div>
      <p class="swr__hint">Tap your video preview to prioritize your camera.</p>
    </div>
    <button
      v-else
      type="button"
      class="swr__thumb"
      title="Show waiting room"
      @click="$emit('show-waiting-room')"
    >
      <video autoplay muted loop playsinline>
        <source src="/assets/video/waiting-room.mp4" type="video/mp4" />
      </video>
      <span>Waiting room</span>
    </button>
    <audio
      v-if="!pip"
      ref="audioRef"
      preload="none"
      :src="currentTrack.src"
      @ended="onTrackEnded"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

const WAITING_ROOM_TRACKS = [
  { id: 'neoclassical-v3', label: 'Neoclassical v3', src: '/assets/audio/waiting-room/neoclassical-v3.mp3' },
  { id: 'neoclassical-v4', label: 'Neoclassical v4', src: '/assets/audio/waiting-room/neoclassical-v4.mp3' },
  { id: 'mysterious', label: 'Mysterious', src: '/assets/audio/waiting-room/mysterious.mp3' },
  { id: 'soft-woodwind', label: 'Soft woodwind', src: '/assets/audio/waiting-room/soft-woodwind.mp3' },
  { id: 'take-1', label: 'The Waiting Room (Take 1)', src: '/assets/audio/waiting-room/take-1.mp3' },
  { id: 'take-2', label: 'The Waiting Room (Take 2)', src: '/assets/audio/waiting-room/take-2.mp3' }
];

const TRACK_INDEX_KEY = 'waitingRoomMusicTrackIndex:v1';

const props = defineProps({
  pip: { type: Boolean, default: false },
  meetingTitle: { type: String, default: '' },
  hostPresent: { type: Boolean, default: false },
  hostRoleLabel: { type: String, default: 'Host' },
  hostStatusLabel: { type: String, default: '' },
  goals: { type: Array, default: () => [] },
  agenda: { type: Array, default: () => [] }
});
defineEmits(['show-waiting-room']);

const audioRef = ref(null);
const trackIndex = ref(loadTrackIndex());
const musicPlaying = ref(false);

const roleWord = computed(() => {
  const raw = String(props.hostRoleLabel || 'Host').trim() || 'Host';
  return raw.toLowerCase();
});

const welcomeCopy = computed(() => (
  `We're here for you. Your ${roleWord.value} will admit you shortly.`
));

const statusPill = computed(() => (
  props.hostPresent ? `${props.hostRoleLabel || 'Host'} here` : 'Standing by'
));

const hostStatusCopy = computed(() => {
  const custom = String(props.hostStatusLabel || '').trim();
  if (custom) return custom;
  if (props.hostPresent) {
    return `Your ${roleWord.value} is in the room. You'll join as soon as you're admitted.`;
  }
  return `Your ${roleWord.value} hasn't joined yet. You'll join the live session as soon as you're admitted.`;
});

const prepItems = computed(() => {
  const out = [];
  for (const g of props.goals || []) {
    const text = String(g?.text || '').trim();
    if (!text) continue;
    out.push({ id: `goal-${g.id || text}`, kind: 'Goal', text });
  }
  for (const a of props.agenda || []) {
    const text = String(a?.text || a?.title || '').trim();
    if (!text) continue;
    out.push({ id: `agenda-${a.id || text}`, kind: 'Agenda', text });
  }
  return out.slice(0, 10);
});

const currentTrack = computed(() => WAITING_ROOM_TRACKS[trackIndex.value] || WAITING_ROOM_TRACKS[0]);

function loadTrackIndex() {
  try {
    const raw = sessionStorage.getItem(TRACK_INDEX_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0 && n < WAITING_ROOM_TRACKS.length) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

function saveTrackIndex() {
  try {
    sessionStorage.setItem(TRACK_INDEX_KEY, String(trackIndex.value));
  } catch {
    /* ignore */
  }
}

async function playCurrentTrack() {
  const el = audioRef.value;
  if (!el) return;
  try {
    el.volume = 0.55;
    await el.play();
    musicPlaying.value = true;
  } catch {
    musicPlaying.value = false;
  }
}

function pauseMusic() {
  const el = audioRef.value;
  if (el) {
    el.pause();
  }
  musicPlaying.value = false;
}

async function toggleMusic() {
  if (musicPlaying.value) {
    pauseMusic();
    return;
  }
  await playCurrentTrack();
}

async function advanceTrack({ play = musicPlaying.value } = {}) {
  const el = audioRef.value;
  if (el) el.pause();
  musicPlaying.value = false;
  trackIndex.value = (trackIndex.value + 1) % WAITING_ROOM_TRACKS.length;
  saveTrackIndex();
  // Wait for Vue to apply the new <audio src> before loading/playing it.
  await nextTick();
  const nextAudio = audioRef.value;
  if (!nextAudio) return;
  nextAudio.load();
  if (play) await playCurrentTrack();
}

function nextTrack() {
  void advanceTrack({ play: musicPlaying.value });
}

function onTrackEnded() {
  void advanceTrack({ play: true });
}

onBeforeUnmount(() => {
  pauseMusic();
});
</script>

<style scoped>
.swr {
  position: absolute;
  inset: 0;
  z-index: 1;
  font-family: "Segoe UI", "Helvetica Neue", ui-sans-serif, system-ui, -apple-system, sans-serif;
}
.swr--pip {
  inset: auto;
  right: 14px;
  bottom: 72px;
  width: min(34%, 220px);
  height: auto;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  z-index: 4;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.35);
}
.swr__bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.swr__bg--landscape {
  display: none;
}
@media (min-width: 901px) {
  .swr__bg--portrait {
    display: none;
  }
  .swr__bg--landscape {
    display: block;
  }
  .swr__overlay {
    max-width: min(640px, 42vw);
  }
  .swr__sub {
    max-width: none;
    white-space: nowrap;
  }
}
.swr__shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(8, 20, 16, 0.28) 0%, rgba(8, 20, 16, 0.55) 45%, rgba(8, 20, 16, 0.78) 100%);
}
.swr__overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: clamp(18px, 4vw, 36px);
  max-width: min(560px, calc(100% - min(38%, 300px) - 28px));
}
.swr__kicker {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(220, 245, 230, 0.9);
}
.swr__overlay h2 {
  margin: 0 0 8px;
  font-size: clamp(1.45rem, 3vw, 2rem);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  color: #f4faf6;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.35);
}
.swr__sub {
  margin: 0 0 16px;
  color: rgba(236, 245, 238, 0.92);
  font-size: 0.98rem;
  line-height: 1.4;
  max-width: 36ch;
}
.swr__cards {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}
.swr__card {
  color: #134e3a;
  border-radius: 18px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.55);
}
.swr__card--welcome {
  background: linear-gradient(155deg, rgba(255, 252, 246, 0.95), rgba(248, 251, 247, 0.93));
  border-color: rgba(226, 236, 228, 0.85);
}
.swr__card--status {
  background: linear-gradient(155deg, rgba(241, 249, 244, 0.95), rgba(232, 244, 236, 0.93));
  border-color: rgba(198, 224, 206, 0.8);
}
.swr__card--prep {
  background: linear-gradient(155deg, rgba(247, 244, 252, 0.95), rgba(241, 246, 252, 0.93));
  border-color: rgba(210, 218, 236, 0.75);
}
.swr__card--music {
  gap: 10px;
  background: linear-gradient(155deg, rgba(236, 245, 250, 0.95), rgba(241, 248, 252, 0.93));
  border-color: rgba(190, 214, 228, 0.78);
}
.swr__card strong { font-size: 0.98rem; font-weight: 700; }
.swr__card span,
.swr__status-copy {
  margin: 0;
  font-size: 0.86rem;
  color: #3f6b58;
  line-height: 1.35;
}
.swr__status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 0.9rem;
}
.swr__pill {
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}
.swr__pill--waiting {
  background: #dcfce7;
  color: #166534;
}
.swr__pill--here {
  background: #dbeafe;
  color: #1d4ed8;
}
.swr__music-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.swr__music-track {
  font-size: 0.82rem;
  color: #3f6b58;
  font-weight: 600;
}
.swr__music-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.swr__music-btn {
  border: 1px solid #b8d4c4;
  background: #fff;
  color: #134e3a;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.swr__music-btn:hover:not(:disabled) {
  background: #f0fdf4;
}
.swr__music-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.swr__music-btn--primary {
  background: #166534;
  border-color: #166534;
  color: #fff;
}
.swr__music-btn--primary:hover:not(:disabled) {
  background: #14532d;
}
.swr__prep-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.swr__prep-list li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: start;
  font-size: 0.86rem;
  line-height: 1.35;
  color: #0f3d2e;
}
.swr__prep-list li > span:last-child {
  color: #0f3d2e;
  font-weight: 600;
}
.swr__prep-tag {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #166534;
  background: #dcfce7;
  border-radius: 999px;
  padding: 2px 7px;
  margin-top: 1px;
}
.swr__hint {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(226, 240, 230, 0.85);
}
.swr__thumb {
  position: relative;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
  cursor: pointer;
  background: #0b1210;
  color: #fff;
}
.swr__thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.swr__thumb span {
  position: absolute;
  left: 8px;
  bottom: 8px;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.72rem;
  font-weight: 700;
}
@media (max-width: 900px) {
  .swr__overlay {
    max-width: none;
    padding: 14px;
    padding-right: min(46%, 200px);
  }
  .swr__overlay h2 { font-size: 1.35rem; }
  .swr__sub {
    white-space: normal;
    max-width: 28ch;
  }
}
</style>
