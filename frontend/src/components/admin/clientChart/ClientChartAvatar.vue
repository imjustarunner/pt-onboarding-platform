<template>
  <div class="cca" :class="[`cca--${size}`]" :style="bgStyle" aria-hidden="true">
    <img v-if="photoUrl" :src="photoUrl" alt="" class="cca__img" @error="onImgError" />
    <span v-show="!photoOk" class="cca__initials">{{ displayInitials }}</span>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { toUploadsUrl } from '../../../utils/uploadsUrl.js';

const props = defineProps({
  initials: { type: String, default: '' },
  fullName: { type: String, default: '' },
  photoPath: { type: String, default: null },
  size: { type: String, default: 'md' } // sm | md | lg
});

const photoOk = ref(true);

const photoUrl = computed(() => {
  const p = String(props.photoPath || '').trim();
  if (!p) return null;
  return toUploadsUrl(p);
});

watch(photoUrl, () => {
  photoOk.value = !!photoUrl.value;
});

const displayInitials = computed(() => {
  const raw = String(props.initials || '').trim();
  if (raw) return raw.slice(0, 3).toUpperCase();
  const parts = String(props.fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return '?';
});

const bgStyle = computed(() => {
  if (photoUrl.value && photoOk.value) return {};
  const seed = displayInitials.value.charCodeAt(0) || 1;
  const hue = (seed * 47) % 360;
  return { background: `hsl(${hue} 42% 42%)` };
});

function onImgError() {
  photoOk.value = false;
}
</script>

<style scoped>
.cca {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  color: #fff;
  font-weight: 750;
  flex-shrink: 0;
  position: relative;
}
.cca--sm { width: 36px; height: 36px; font-size: 12px; }
.cca--md { width: 48px; height: 48px; font-size: 15px; }
.cca--lg { width: 64px; height: 64px; font-size: 20px; }
.cca__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cca__initials { letter-spacing: 0.02em; line-height: 1; z-index: 1; }
</style>
