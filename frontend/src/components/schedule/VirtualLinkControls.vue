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
      <div class="vlc-label">{{ showOptions ? 'Virtual meeting' : (displayLink ? 'Meeting link' : 'Virtual meeting') }}</div>
      <div class="vlc-top-actions">
        <button
          v-if="compact && displayLink"
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

    <div v-if="showOptions" class="vlc-options">
      <div class="vlc-switch-row">
        <div class="vlc-switch-copy">
          <span class="vlc-switch-title">Virtual</span>
          <p class="vlc-switch-hint muted">Schedule with a joinable video room.</p>
        </div>
        <label class="vlc-switch" :class="{ disabled }">
          <input
            type="checkbox"
            role="switch"
            :checked="isVirtual"
            :disabled="disabled"
            :aria-checked="String(!!isVirtual)"
            @change="emit('update:isVirtual', !!$event.target.checked)"
          />
          <span class="vlc-switch-slider" aria-hidden="true"></span>
        </label>
      </div>

      <template v-if="isVirtual">
        <div v-if="videoConfigured" class="vlc-switch-row">
          <div class="vlc-switch-copy">
            <span class="vlc-switch-title">Platform video room</span>
            <p class="vlc-switch-hint muted">Link the in-app video room for this meeting.</p>
          </div>
          <label class="vlc-switch" :class="{ disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="usePlatformVideo"
              :disabled="disabled"
              :aria-checked="String(!!usePlatformVideo)"
              @change="emit('update:usePlatformVideo', !!$event.target.checked)"
            />
            <span class="vlc-switch-slider" aria-hidden="true"></span>
          </label>
        </div>

        <div v-if="!videoConfigured || !usePlatformVideo" class="vlc-switch-row">
          <div class="vlc-switch-copy">
            <span class="vlc-switch-title">Google Meet link</span>
            <p class="vlc-switch-hint muted">Create a Meet link when platform video isn’t used.</p>
          </div>
          <label class="vlc-switch" :class="{ disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="createMeetLink"
              :disabled="disabled"
              :aria-checked="String(!!createMeetLink)"
              @change="emit('update:createMeetLink', !!$event.target.checked)"
            />
            <span class="vlc-switch-slider" aria-hidden="true"></span>
          </label>
        </div>

        <div v-if="usePlatformVideo && videoConfigured" class="vlc-switch-row">
          <div class="vlc-switch-copy">
            <span class="vlc-switch-title">Waiting room</span>
            <p class="vlc-switch-hint muted">Participants wait until the host admits them.</p>
          </div>
          <label class="vlc-switch" :class="{ disabled }">
            <input
              type="checkbox"
              role="switch"
              :checked="waitingRoomEnabled"
              :disabled="disabled"
              :aria-checked="String(!!waitingRoomEnabled)"
              @change="emit('update:waitingRoomEnabled', !!$event.target.checked)"
            />
            <span class="vlc-switch-slider" aria-hidden="true"></span>
          </label>
        </div>
      </template>
    </div>

    <template v-if="!showOptions || isVirtual">
      <div class="vlc-row">
        <input
          v-if="!compact || !displayLink || expanded"
          class="vlc-input"
          type="text"
          readonly
          :value="displayLink"
          :placeholder="placeholder"
          @focus="$event.target.select()"
        />
        <button
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
          :href="displayLink"
          target="_blank"
          rel="noopener noreferrer"
        >
          Join
        </a>
      </div>
      <div v-if="(!compact || expanded) && secondaryLink && secondaryLink !== displayLink" class="vlc-secondary muted">
        Also:
        <a :href="secondaryLink" target="_blank" rel="noopener noreferrer">{{ secondaryLink }}</a>
        <button type="button" class="btn btn-ghost btn-xs" @click="copyText(secondaryLink)">Copy</button>
      </div>
      <p v-if="hint" class="vlc-hint muted">{{ hint }}</p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  link: { type: String, default: '' },
  meetLink: { type: String, default: '' },
  platformLink: { type: String, default: '' },
  isVirtual: { type: Boolean, default: true },
  hint: { type: String, default: '' },
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
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits([
  'dismiss',
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
