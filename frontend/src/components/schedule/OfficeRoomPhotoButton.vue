<template>
  <button
    type="button"
    class="orp-btn"
    :class="{ 'orp-btn--has-photo': !!previewUrl }"
    :title="titleText"
    :aria-label="titleText"
    @click.stop="onClick"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
  >
    <img v-if="previewUrl" :src="previewUrl" alt="" class="orp-thumb" />
    <svg v-else class="orp-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5.5-5.5L9 17" />
    </svg>
    <span
      v-if="hover && previewUrl"
      class="orp-hover-preview"
      aria-hidden="true"
    >
      <img :src="previewUrl" alt="" />
    </span>
  </button>
</template>

<script setup>
import { computed, ref } from 'vue';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';

const props = defineProps({
  roomId: { type: Number, required: true },
  officeId: { type: Number, default: 0 },
  photoUrl: { type: String, default: '' },
  roomLabel: { type: String, default: 'Room' }
});

const emit = defineEmits(['open']);

const hover = ref(false);

const previewUrl = computed(() => {
  const raw = String(props.photoUrl || '').trim();
  if (!raw) return '';
  return toUploadsUrl(raw) || raw;
});

const titleText = computed(() => (
  previewUrl.value
    ? `View photos — ${props.roomLabel}`
    : `Photos — ${props.roomLabel}`
));

function onClick() {
  emit('open', {
    roomId: Number(props.roomId || 0),
    officeId: Number(props.officeId || 0),
    roomLabel: props.roomLabel,
    photoUrl: props.photoUrl
  });
}
</script>

<style scoped>
.orp-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  flex-shrink: 0;
  overflow: visible;
}
.orp-btn:hover {
  border-color: #94a3b8;
  background: #eef2ff;
  color: #334155;
}
.orp-btn--has-photo {
  border-color: #a5b4fc;
  background: #eef2ff;
}
.orp-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 5px;
}
.orp-icon { display: block; }
.orp-hover-preview {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  width: 140px;
  height: 100px;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
  border: 1px solid #e2e8f0;
  background: #fff;
  pointer-events: none;
}
.orp-hover-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
