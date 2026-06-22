<template>
  <button
    class="kw-provider-card"
    :class="{ 'kw-provider-card--active': provider.status === 'active_now' }"
    :style="cardStyle"
    @click="$emit('select', provider)"
  >
    <div class="kw-provider-card__photo-wrap">
      <img
        v-if="photoUrl"
        :src="photoUrl"
        :alt="`${provider.firstName} ${provider.lastName}`"
        class="kw-provider-card__photo"
      />
      <div v-else class="kw-provider-card__initials" :style="initialsStyle" aria-hidden="true">
        {{ initials }}
      </div>
      <span v-if="provider.status === 'active_now'" class="kw-provider-card__badge" :style="badgeStyle">
        In Session
      </span>
    </div>
    <div class="kw-provider-card__info">
      <div class="kw-provider-card__name">{{ provider.firstName }} {{ provider.lastName }}</div>
      <div class="kw-provider-card__cred">{{ provider.credential || provider.title || '' }}</div>
      <div v-if="provider.agencyName" class="kw-provider-card__tenant" :style="tenantStyle">
        {{ provider.agencyName }}
      </div>
      <div v-if="provider.currentRoomName || provider.currentRoomNumber" class="kw-provider-card__office">
        Office {{ provider.currentRoomNumber || provider.currentRoomName }}
      </div>
    </div>
  </button>
</template>

<script setup>
import { computed } from 'vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const props = defineProps({
  provider: { type: Object, required: true }
});

defineEmits(['select']);

const photoUrl = computed(() => toUploadsUrl(props.provider.profilePhotoPath));

const initials = computed(() => {
  const f = (props.provider.firstName || '').trim().charAt(0);
  const l = (props.provider.lastName || '').trim().charAt(0);
  return `${f}${l}`.toUpperCase();
});

const primaryColor = computed(() => props.provider.agencyPrimaryColor || null);

// Lighten a hex color by mixing with white at a given ratio (0–1)
function lighten(hex, ratio) {
  if (!hex) return null;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * ratio);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

const cardStyle = computed(() => {
  if (!primaryColor.value) return {};
  const isActive = props.provider.status === 'active_now';
  return {
    borderColor: primaryColor.value,
    borderWidth: isActive ? '3px' : '2px',
    backgroundColor: isActive ? lighten(primaryColor.value, 0.92) : '#fff'
  };
});

const initialsStyle = computed(() => {
  if (!primaryColor.value) return {};
  return {
    background: lighten(primaryColor.value, 0.75),
    color: primaryColor.value
  };
});

const badgeStyle = computed(() => {
  if (!primaryColor.value) return {};
  return { background: primaryColor.value };
});

const tenantStyle = computed(() => {
  if (!primaryColor.value) return {};
  return {
    background: lighten(primaryColor.value, 0.88),
    color: primaryColor.value
  };
});
</script>

<style scoped>
.kw-provider-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 2px solid #e8edf2;
  border-radius: 14px;
  padding: 20px 16px 16px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  min-width: 0;
  text-align: center;
}

.kw-provider-card:hover {
  box-shadow: 0 4px 18px rgba(58, 107, 122, 0.18);
  transform: translateY(-2px);
}

.kw-provider-card--active {
  background: #f3f8fa;
}

.kw-provider-card__photo-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.kw-provider-card__photo,
.kw-provider-card__initials {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
}

.kw-provider-card__initials {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #d0e4ea;
  color: #1e4a5a;
  font-size: 26px;
  font-weight: 700;
}

.kw-provider-card__badge {
  position: absolute;
  bottom: -4px;
  left: 50%;
  transform: translateX(-50%);
  background: #3a6b7a;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
  border-radius: 20px;
  white-space: nowrap;
}

.kw-provider-card__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 100%;
}

.kw-provider-card__name {
  font-weight: 700;
  font-size: 14px;
  color: #1a2f3a;
  line-height: 1.3;
}

.kw-provider-card__cred {
  font-size: 12px;
  color: #6b8494;
  font-weight: 500;
}

.kw-provider-card__tenant {
  margin-top: 4px;
  background: #eef4f6;
  color: #2e6070;
  border-radius: 8px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.kw-provider-card__office {
  margin-top: 2px;
  background: #eef6f3;
  color: #2e7055;
  border-radius: 8px;
  padding: 3px 12px;
  font-size: 12px;
  font-weight: 600;
}
</style>
