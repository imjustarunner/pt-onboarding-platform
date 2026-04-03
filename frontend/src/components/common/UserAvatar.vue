<script setup>
import { computed } from 'vue';
import { toUploadsUrl } from '@/utils/uploadsUrl.js';

const props = defineProps({
  /** Stored path or absolute URL for the user's photo */
  photoPath: { type: String, default: null },
  /** First name (used for initials fallback) */
  firstName: { type: String, default: '' },
  /** Last name (used for initials fallback) */
  lastName: { type: String, default: '' },
  /** Avatar size: 'xs' (24px) | 'sm' (32px) | 'md' (48px, default) | 'lg' (72px) | 'xl' (96px) */
  size: { type: String, default: 'md' },
  /** Extra CSS classes for the wrapper */
  extraClass: { type: String, default: '' }
});

const resolvedUrl = computed(() => {
  if (!props.photoPath) return null;
  return toUploadsUrl(props.photoPath);
});

const initials = computed(() => {
  const f = (props.firstName || '').trim().charAt(0).toUpperCase();
  const l = (props.lastName || '').trim().charAt(0).toUpperCase();
  return f + l || '?';
});

const sizeClass = computed(() => `avatar--${props.size}`);

function onImgError(e) {
  e.target.style.display = 'none';
  e.target.nextElementSibling?.removeAttribute('hidden');
}
</script>

<template>
  <div :class="['avatar', sizeClass, extraClass]" aria-hidden="true">
    <img
      v-if="resolvedUrl"
      :src="resolvedUrl"
      :alt="`${firstName} ${lastName}`.trim() || 'User avatar'"
      class="avatar__img"
      @error="onImgError"
    />
    <span class="avatar__initials" :hidden="!!resolvedUrl">{{ initials }}</span>
  </div>
</template>

<style scoped>
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: #4a6cf7;
  color: #fff;
  font-weight: 700;
  flex-shrink: 0;
  user-select: none;
}

.avatar--xs  { width: 24px;  height: 24px;  font-size: 10px; }
.avatar--sm  { width: 32px;  height: 32px;  font-size: 12px; }
.avatar--md  { width: 48px;  height: 48px;  font-size: 16px; }
.avatar--lg  { width: 72px;  height: 72px;  font-size: 24px; }
.avatar--xl  { width: 96px;  height: 96px;  font-size: 32px; }

.avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar__initials {
  line-height: 1;
  letter-spacing: 0.03em;
}
</style>
