<template>
  <div v-if="show" class="vlc" data-testid="virtual-link-controls" :class="{ 'vlc--ready': !!displayLink, 'vlc--dismissible': dismissible }">
    <div class="vlc-top">
      <div class="vlc-label">{{ displayLink ? 'Meeting link' : 'Virtual meeting' }}</div>
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
    <div class="vlc-row">
      <input
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
    <div v-if="secondaryLink && secondaryLink !== displayLink" class="vlc-secondary muted">
      Also:
      <a :href="secondaryLink" target="_blank" rel="noopener noreferrer">{{ secondaryLink }}</a>
      <button type="button" class="btn btn-ghost btn-xs" @click="copyText(secondaryLink)">Copy</button>
    </div>
    <p v-if="hint" class="vlc-hint muted">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  link: { type: String, default: '' },
  meetLink: { type: String, default: '' },
  platformLink: { type: String, default: '' },
  isVirtual: { type: Boolean, default: true },
  hint: { type: String, default: '' },
  placeholder: { type: String, default: 'Link will appear after booking' },
  dismissible: { type: Boolean, default: false }
});

const emit = defineEmits(['dismiss']);
const copied = ref(false);

const show = computed(() => !!props.isVirtual);
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
.vlc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.vlc-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
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
