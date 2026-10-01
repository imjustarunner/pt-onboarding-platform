<template>
  <div
    v-if="show"
    class="vlc"
    data-testid="virtual-link-controls"
    :class="{
      'vlc--ready': !!displayLink,
      'vlc--dismissible': dismissible,
      'vlc--compact': compact && !!displayLink && !expanded,
      'vlc--with-options': showOptions
    }"
  >
    <div class="vlc-top">
      <div class="vlc-label">{{ labelText }}</div>
      <div class="vlc-top-actions">
        <button
          v-if="allowSharing && compact && displayLink"
          type="button"
          class="vlc-expand"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Hide link' : 'Show link' }}
        </button>
        <button
          v-if="dismissible"
          type="button"
          class="vlc-dismiss"
          aria-label="Dismiss"
          @click="emit('dismiss')"
        >
          ×
        </button>
      </div>
    </div>

      <MeetingLocationOptions v-if="showOptions"
        :is-virtual="isVirtual" :use-platform-video="usePlatformVideo" :create-meet-link="createMeetLink"
        :video-configured="videoConfigured" :waiting-room-enabled="waitingRoomEnabled" :disabled="disabled"
        @update:is-virtual="emit('update:isVirtual', $event)"
        @update:use-platform-video="emit('update:usePlatformVideo', $event)"
        @update:create-meet-link="emit('update:createMeetLink', $event)"
        @update:waiting-room-enabled="emit('update:waitingRoomEnabled', $event)"
      />

    <template v-if="displayLink">
      <div class="vlc-row">
        <input
          v-if="allowSharing && (!compact || !displayLink || expanded)"
          class="vlc-input"
          type="text"
          readonly
          :value="displayLink"
          :placeholder="placeholder"
          @focus="$event.target.select()"
        />
        <button
          v-if="allowSharing"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="!displayLink"
          @click="copyLink"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
        <a
          v-if="displayLink"
          class="btn btn-primary btn-sm"
          :href="joinHref"
          :target="sameTab ? undefined : '_blank'"
          :rel="sameTab ? undefined : 'noopener noreferrer'"
          @click="onJoinClick"
        >
          Join
        </a>
      </div>
      <div v-if="allowSharing && (!compact || expanded) && secondaryLink && secondaryLink !== displayLink" class="vlc-secondary muted">
        Also:
        <a
          :href="toSameOriginPath(secondaryLink)"
          :target="sameTab ? undefined : '_blank'"
          :rel="sameTab ? undefined : 'noopener noreferrer'"
          @click="onSecondaryJoinClick"
        >{{ secondaryLink }}</a>
        <button type="button" class="btn btn-ghost btn-xs" @click="copyText(secondaryLink)">Copy</button>
      </div>
      <p v-if="hint" class="vlc-hint muted">{{ hint }}</p>
      <p v-if="!allowSharing" class="vlc-hint muted">Each person joins from their calendar or personal invitation. Add people to the meeting to invite them.</p>
    </template>
  </div>
</template>

<script setup>
import MeetingLocationOptions from './MeetingLocationOptions.vue';
import { computed, ref, watch } from 'vue';

const props = defineProps({
  allowSharing: { type: Boolean, default: true },
  link: { type: String, default: '' },
  meetLink: { type: String, default: '' },
  platformLink: { type: String, default: '' },
  isVirtual: { type: Boolean, default: true },
  hint: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: 'Link will appear after booking' },
  dismissible: { type: Boolean, default: false },
  /** When ready, default to Copy/Join only; expand to reveal the URL. */
  compact: { type: Boolean, default: false },
  /** Show Virtual / platform / waiting-room switches beside the link controls. */
  showOptions: { type: Boolean, default: false },
  usePlatformVideo: { type: Boolean, default: true },
  waitingRoomEnabled: { type: Boolean, default: true },
  createMeetLink: { type: Boolean, default: false },
  videoConfigured: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  /**
   * Prefer same-tab navigation for in-app join links so the HttpOnly session
   * cookie / local auth state stay attached (new tabs were forcing re-login).
   */
  sameTab: { type: Boolean, default: true }
});

const emit = defineEmits([
  'dismiss',
  'join',
  'update:isVirtual',
  'update:usePlatformVideo',
  'update:waitingRoomEnabled',
  'update:createMeetLink'
]);
const copied = ref(false);
const expanded = ref(false);

const show = computed(() => props.showOptions || !!props.isVirtual);
const displayLink = computed(() => {
  const primary = String(props.link || props.platformLink || props.meetLink || '').trim();
  return primary;
});
const secondaryLink = computed(() => {
  const primary = displayLink.value;
  const meet = String(props.meetLink || '').trim();
  const platform = String(props.platformLink || '').trim();
  if (meet && meet !== primary) return meet;
  if (platform && platform !== primary) return platform;
  return '';
});
const labelText = computed(() => {
  const custom = String(props.label || '').trim();
  if (custom) return custom;
  if (props.showOptions) return 'Virtual meeting';
  return displayLink.value ? 'Meeting link' : 'Virtual meeting';
});

function toSameOriginPath(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  if (s.startsWith('/')) return s;
  try {
    const u = new URL(s, window.location.origin);
    if (u.origin === window.location.origin) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    /* keep absolute */
  }
  return s;
}

const joinHref = computed(() => toSameOriginPath(displayLink.value) || displayLink.value);

watch(displayLink, (next, prev) => {
  if (next && next !== prev) expanded.value = false;
});

async function copyText(text) {
  const value = String(text || '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1600);
  } catch {
    /* ignore */
  }
}

function copyLink() {
  void copyText(displayLink.value);
}

function navigateJoin(url) {
  const href = toSameOriginPath(url) || String(url || '').trim();
  if (!href) return;
  emit('join', href);
  if (props.sameTab) {
    window.location.assign(href);
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}

function onJoinClick(e) {
  if (!props.sameTab) return;
  e.preventDefault();
  navigateJoin(displayLink.value);
}

function onSecondaryJoinClick(e) {
  if (!props.sameTab) return;
  e.preventDefault();
  navigateJoin(secondaryLink.value);
}
</script>

<style scoped>
.vlc {
  border: 1px solid #e8eef5;
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vlc--ready {
  border-color: #86efac;
  background: #f0fdf4;
}
.vlc--with-options {
  gap: 10px;
}
.vlc--compact .vlc-row {
  flex-wrap: nowrap;
}
.vlc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.vlc-top-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.vlc-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
}
.vlc-expand {
  border: none;
  background: transparent;
  color: #2563eb;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.vlc-dismiss {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.vlc-dismiss:hover { color: #0f172a; }
.vlc-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid #e2e8f0;
}
.vlc-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.vlc-switch-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.vlc-switch-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0f172a;
}
.vlc-switch-hint {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.3;
}
.vlc-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex: 0 0 auto;
  cursor: pointer;
}
.vlc-switch.disabled { opacity: 0.55; cursor: not-allowed; }
.vlc-switch input { opacity: 0; width: 0; height: 0; }
.vlc-switch-slider {
  position: absolute;
  inset: 0;
  background: #cbd5e1;
  border-radius: 999px;
  transition: background 0.15s ease;
}
.vlc-switch input:checked + .vlc-switch-slider { background: #7c3aed; }
.vlc-switch-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.15s ease;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
}
.vlc-switch input:checked + .vlc-switch-slider::before { transform: translateX(20px); }
.vlc-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.vlc-input {
  flex: 1;
  min-width: 180px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  background: #fff;
  color: #0f172a;
  -webkit-text-fill-color: #0f172a;
}
.vlc-secondary {
  font-size: 0.8rem;
  word-break: break-all;
}
.vlc-hint { margin: 0; font-size: 0.78rem; }
.muted { color: #64748b; }
.btn-ghost {
  border: none;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  font-size: 0.75rem;
}
</style>
