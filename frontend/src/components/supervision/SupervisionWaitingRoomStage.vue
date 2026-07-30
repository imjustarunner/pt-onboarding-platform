<template>
  <div class="swr" :class="{ 'swr--pip': pip }">
    <video class="swr__bg" autoplay muted loop playsinline>
      <source src="/assets/video/waiting-room.mp4" type="video/mp4" />
    </video>
    <div class="swr__shade" aria-hidden="true" />
    <div v-if="!pip" class="swr__overlay">
      <p class="swr__kicker">Waiting Room</p>
      <h2>{{ meetingTitle || 'Welcome to the Waiting Room' }}</h2>
      <p class="swr__sub">{{ welcomeCopy }}</p>
      <div class="swr__cards">
        <div class="swr__card">
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
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  pip: { type: Boolean, default: false },
  meetingTitle: { type: String, default: '' },
  hostPresent: { type: Boolean, default: false },
  hostRoleLabel: { type: String, default: 'Host' },
  hostStatusLabel: { type: String, default: '' },
  goals: { type: Array, default: () => [] },
  agenda: { type: Array, default: () => [] },
  actionItems: { type: Array, default: () => [] }
});
defineEmits(['show-waiting-room']);

const roleWord = computed(() => {
  const raw = String(props.hostRoleLabel || 'Host').trim() || 'Host';
  return raw.toLowerCase();
});

const welcomeCopy = computed(() => (
  `We’re here for you. Your ${roleWord.value} will admit you shortly.`
));

const statusPill = computed(() => (
  props.hostPresent ? `${props.hostRoleLabel || 'Host'} here` : 'Standing by'
));

const hostStatusCopy = computed(() => {
  const custom = String(props.hostStatusLabel || '').trim();
  if (custom) return custom;
  if (props.hostPresent) {
    return `Your ${roleWord.value} is in the room. You’ll join as soon as you’re admitted.`;
  }
  return `Your ${roleWord.value} hasn’t joined yet. You’ll join the live session as soon as you’re admitted.`;
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
  for (const a of props.actionItems || []) {
    const text = String(a?.text || '').trim();
    if (!text) continue;
    out.push({ id: `action-${a.id || text}`, kind: 'Action', text });
  }
  return out.slice(0, 10);
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
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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
  max-width: min(560px, calc(100% - min(38%, 280px) - 28px));
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
  background: rgba(255, 255, 255, 0.92);
  color: #134e3a;
  border-radius: 18px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
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
  color: #134e3a;
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
}
</style>
