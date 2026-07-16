<template>
  <div
    v-if="normalizedItems.length"
    class="ann-marquee"
    :class="[
      `variant-${variant}`,
      {
        interactive: interactive,
        'is-celebration': hasCelebration
      }
    ]"
    role="region"
    :aria-label="ariaLabel"
    @click="onClick"
    @keydown.enter.prevent="onClick"
    @keydown.space.prevent="onClick"
    :tabindex="interactive ? 0 : undefined"
  >
    <div class="ann-marquee__eyebrow" aria-hidden="true">
      <span class="ann-marquee__pulse" />
      {{ eyebrowLabel }}
    </div>

    <div class="ann-marquee__viewport">
      <div
        class="ann-marquee__track"
        :style="{ animationDuration: durationSec + 's' }"
      >
        <div
          v-for="copy in 2"
          :key="`copy-${copy}`"
          class="ann-marquee__group"
          :aria-hidden="copy === 2 ? 'true' : undefined"
        >
          <span
            v-for="(t, idx) in scrollItems"
            :key="`${copy}-${idx}-${t.key}`"
            class="ann-marquee__item"
            :class="[
              `tone-${t.tone}`,
              { 'has-avatar': t.showAvatar, chip: t.isCelebration || t.showAvatar }
            ]"
          >
            <span v-if="t.showAvatar" class="ann-marquee__avatar" aria-hidden="true">
              <img
                v-if="t.photoUrl && !t.photoFailed"
                :src="t.photoUrl"
                alt=""
                class="ann-marquee__avatar-img"
                @error="onPhotoError(t)"
              />
              <span v-else class="ann-marquee__avatar-fallback">{{ t.initials }}</span>
            </span>
            <span v-else class="ann-marquee__bullet" aria-hidden="true" />
            <span class="ann-marquee__text" :class="{ 'ann-marquee__text--display': t.showAvatar || t.isCelebration }">{{ t.text }}</span>
            <span v-if="t.dateLabel" class="ann-marquee__date">{{ t.dateLabel }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  /** visual theme: brand | soft | club */
  variant: { type: String, default: 'brand' },
  ariaLabel: { type: String, default: 'Announcements' },
  interactive: { type: Boolean, default: false },
  /** seconds for one full loop; longer when more items */
  baseDuration: { type: Number, default: 22 }
});

const emit = defineEmits(['activate']);

const CELEBRATION_KINDS = new Set([
  'birthday',
  'work_anniversary',
  'celebration'
]);

/** photoUrl -> true when image failed to load */
const failedPhotos = ref({});

function initialsFrom(name, text) {
  const source = String(name || text || '').trim();
  const words = source
    .replace(/^(Happy Birthday,|Happy\s+\d+-year(?:\s+anniversary)?,)\s*/i, '')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  const a = words[0]?.[0] || '';
  const b = words.length > 1 ? words[words.length - 1][0] : '';
  return (a + b).toUpperCase() || '?';
}

function normalizeOne(raw, idx) {
  if (raw && typeof raw === 'object') {
    let text = String(raw.text || raw.message || '').trim();
    let dateLabel = String(raw.dateLabel || '').trim();
    if (!dateLabel) {
      const m = text.match(/^(.*?)\s*[·•]\s*([A-Za-z]{3,9}\s+\d{1,2})\s*$/);
      if (m) {
        text = m[1].trim();
        dateLabel = m[2].trim();
      }
    }
    text = text.replace(/\s*[·•]\s*$/, '').trim();
    if (!text) return null;
    const photoRaw = raw.photoUrl || raw.profilePhotoPath || raw.profile_photo_path || '';
    const photoUrl = toUploadsUrl(photoRaw) || '';
    const fullName = String(raw.fullName || '').trim();
    const kind = String(raw.kind || '').trim();
    const isCelebration = CELEBRATION_KINDS.has(kind) || /birthday|anniversary/i.test(text);
    const keyBase = String(raw.userId || kind || raw.id || idx);
    return {
      key: `${keyBase}-${text.slice(0, 24)}`,
      text,
      dateLabel,
      kind,
      isCelebration,
      showAvatar: Boolean(photoUrl || fullName || isCelebration),
      photoUrl,
      photoFailed: false,
      initials: initialsFrom(fullName, text),
      fullName
    };
  }
  let text = String(raw || '').trim();
  let dateLabel = '';
  const m = text.match(/^(.*?)\s*[·•]\s*([A-Za-z]{3,9}\s+\d{1,2})\s*$/);
  if (m) {
    text = m[1].trim();
    dateLabel = m[2].trim();
  }
  text = text.replace(/\s*[·•]\s*$/, '').trim();
  if (!text) return null;
  const isCelebration = /birthday|anniversary/i.test(text);
  return {
    key: String(idx) + '-' + text.slice(0, 24),
    text,
    dateLabel,
    kind: '',
    isCelebration,
    showAvatar: isCelebration,
    photoUrl: '',
    photoFailed: false,
    initials: initialsFrom('', text),
    fullName: ''
  };
}

const normalizedItems = computed(() =>
  (props.items || [])
    .map(normalizeOne)
    .filter(Boolean)
    .map((item) => ({
      ...item,
      photoFailed: item.photoUrl ? Boolean(failedPhotos.value[item.photoUrl]) : false
    }))
);

const TONE_COUNT = 5;

/** Repeat short lists so the ticker stays filled; each slot gets a rotating color. */
const scrollItems = computed(() => {
  const items = normalizedItems.value;
  if (!items.length) return [];
  const base = items.length >= 5 ? items : (() => {
    const out = [];
    while (out.length < 5) out.push(...items);
    return out;
  })();
  return base.map((item, idx) => ({
    ...item,
    tone: idx % TONE_COUNT
  }));
});

const hasCelebration = computed(() =>
  normalizedItems.value.some((t) => CELEBRATION_KINDS.has(t.kind) || /birthday|anniversary/i.test(t.text))
);

const eyebrowLabel = computed(() => (hasCelebration.value ? 'Today' : 'Live'));

const durationSec = computed(() => {
  const n = scrollItems.value.length;
  const chars = scrollItems.value.reduce(
    (sum, t) => sum + t.text.length + (t.dateLabel ? t.dateLabel.length + 2 : 0),
    0
  );
  return Math.max(props.baseDuration, Math.min(80, 18 + n * 5 + Math.floor(chars / 20)));
});

function onPhotoError(t) {
  const url = t?.photoUrl;
  if (!url || failedPhotos.value[url]) return;
  failedPhotos.value = { ...failedPhotos.value, [url]: true };
}

function onClick() {
  if (props.interactive) emit('activate');
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&display=swap');

.ann-marquee {
  --ann-fg: #0f172a;
  --ann-muted: #475569;
  --ann-accent: #0f766e;
  --ann-bg: linear-gradient(90deg, #ecfdf5 0%, #f8fafc 50%, #eef2ff 100%);
  --ann-border: rgba(15, 118, 110, 0.32);
  --ann-display: 'Fraunces', Georgia, 'Times New Roman', serif;
  display: flex;
  align-items: stretch;
  gap: 0;
  border: 1px solid var(--ann-border);
  border-radius: 12px;
  background: var(--ann-bg);
  overflow: hidden;
  margin-bottom: 0.85rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.ann-marquee.variant-soft {
  --ann-accent: #4338ca;
  --ann-bg: linear-gradient(90deg, #eef2ff 0%, #f8fafc 50%, #fdf4ff 100%);
  --ann-border: rgba(67, 56, 202, 0.28);
}
.ann-marquee.variant-club {
  --ann-accent: #1d4ed8;
  --ann-bg: linear-gradient(90deg, #eff6ff 0%, #f8fafc 55%, #ecfeff 100%);
  --ann-border: rgba(29, 78, 216, 0.3);
}
.ann-marquee.variant-brand {
  --ann-accent: var(--primary, #0f766e);
  --ann-fg: #0b1220;
  --ann-bg: linear-gradient(
    90deg,
    color-mix(in srgb, var(--primary, #0f766e) 12%, #fff) 0%,
    #f8fafc 55%,
    color-mix(in srgb, var(--primary, #0f766e) 8%, #fff) 100%
  );
  --ann-border: color-mix(in srgb, var(--primary, #0f766e) 35%, transparent);
}
.ann-marquee.is-celebration {
  --ann-fg: #0b1220;
}
.ann-marquee.interactive {
  cursor: pointer;
}
.ann-marquee.interactive:hover {
  filter: brightness(0.985);
}
.ann-marquee.interactive:focus-visible {
  outline: 2px solid var(--ann-accent);
  outline-offset: 2px;
}

.ann-marquee__eyebrow {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.95rem;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ann-accent);
  border-right: 1px solid var(--ann-border);
  background: rgba(255, 255, 255, 0.72);
}
.ann-marquee__pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ann-accent);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--ann-accent) 55%, transparent);
  animation: ann-pulse 1.8s ease-out infinite;
}

.ann-marquee__viewport {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 18px, #000 calc(100% - 18px), transparent);
}

.ann-marquee__track {
  display: flex;
  width: max-content;
  align-items: stretch;
  animation-name: ann-marquee-scroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
.ann-marquee:hover .ann-marquee__track {
  animation-play-state: paused;
}

.ann-marquee__group {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 1.1rem;
  padding: 0.65rem 2rem 0.65rem 1rem;
  min-width: 100%;
  box-sizing: border-box;
}

.ann-marquee__item {
  --chip-fg: var(--ann-fg);
  --chip-muted: var(--ann-muted);
  --chip-accent: var(--ann-accent);
  --chip-bg: transparent;
  --chip-border: transparent;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  flex-shrink: 0;
  color: var(--chip-fg);
  white-space: nowrap;
}
.ann-marquee__item.chip {
  padding: 0.35rem 0.85rem 0.35rem 0.4rem;
  border-radius: 999px;
  background: var(--chip-bg);
  border: 1px solid var(--chip-border);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
/* Rotating celebration tones so repeated ticker copies each pop differently */
.ann-marquee__item.tone-0 {
  --chip-fg: #065f46;
  --chip-muted: #047857;
  --chip-accent: #059669;
  --chip-bg: linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%);
  --chip-border: rgba(5, 150, 105, 0.35);
}
.ann-marquee__item.tone-1 {
  --chip-fg: #9a3412;
  --chip-muted: #c2410c;
  --chip-accent: #ea580c;
  --chip-bg: linear-gradient(135deg, #ffedd5 0%, #fff7ed 100%);
  --chip-border: rgba(234, 88, 12, 0.35);
}
.ann-marquee__item.tone-2 {
  --chip-fg: #1e40af;
  --chip-muted: #1d4ed8;
  --chip-accent: #2563eb;
  --chip-bg: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  --chip-border: rgba(37, 99, 235, 0.35);
}
.ann-marquee__item.tone-3 {
  --chip-fg: #854d0e;
  --chip-muted: #a16207;
  --chip-accent: #ca8a04;
  --chip-bg: linear-gradient(135deg, #fef9c3 0%, #fefce8 100%);
  --chip-border: rgba(202, 138, 4, 0.4);
}
.ann-marquee__item.tone-4 {
  --chip-fg: #9f1239;
  --chip-muted: #be123c;
  --chip-accent: #e11d48;
  --chip-bg: linear-gradient(135deg, #ffe4e6 0%, #fff1f2 100%);
  --chip-border: rgba(225, 29, 72, 0.35);
}

.ann-marquee__avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--chip-accent) 18%, #fff);
  border: 2px solid color-mix(in srgb, var(--chip-accent) 50%, #fff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
}
.ann-marquee__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ann-marquee__avatar-fallback {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--chip-accent);
  font-family: system-ui, sans-serif;
}

.ann-marquee__bullet {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--chip-accent);
  opacity: 0.95;
  flex-shrink: 0;
}
.ann-marquee__text {
  color: var(--chip-fg);
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.ann-marquee__text--display {
  font-family: var(--ann-display);
  font-size: 1.18rem;
  font-weight: 800;
  letter-spacing: -0.015em;
  font-variation-settings: 'SOFT' 40, 'WONK' 0;
}
.ann-marquee__date {
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--chip-muted);
  opacity: 0.95;
}
.ann-marquee__date::before {
  content: '·';
  margin-right: 0.35rem;
  opacity: 0.65;
}

@keyframes ann-marquee-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@keyframes ann-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ann-accent) 45%, transparent); }
  70% { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

@media (prefers-reduced-motion: reduce) {
  .ann-marquee__track {
    animation: none;
  }
  .ann-marquee__viewport {
    overflow-x: auto;
    mask-image: none;
  }
  .ann-marquee__group:last-child {
    display: none;
  }
  .ann-marquee__pulse {
    animation: none;
  }
}

@media (max-width: 640px) {
  .ann-marquee__text {
    font-size: 1.02rem;
  }
  .ann-marquee.is-celebration .ann-marquee__text {
    font-size: 1.08rem;
  }
  .ann-marquee__avatar {
    width: 1.75rem;
    height: 1.75rem;
  }
}
</style>
