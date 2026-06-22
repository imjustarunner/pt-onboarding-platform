<template>
  <button
    class="kw-provider-card"
    :class="{ 'kw-provider-card--active': provider.status === 'active_now' }"
    @click="$emit('select', provider)"
  >
    <div class="kw-provider-card__photo-wrap">
      <img
        v-if="photoUrl"
        :src="photoUrl"
        :alt="`${provider.firstName} ${provider.lastName}`"
        class="kw-provider-card__photo"
      />
      <div v-else class="kw-provider-card__initials" aria-hidden="true">
        {{ initials }}
      </div>
      <span v-if="provider.status === 'active_now'" class="kw-provider-card__badge">
        In Session
      </span>
    </div>
    <div class="kw-provider-card__info">
      <div class="kw-provider-card__name">{{ provider.firstName }} {{ provider.lastName }}</div>
      <div class="kw-provider-card__cred">{{ provider.credential || provider.title || '' }}</div>
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
  border-color: #3a6b7a;
  box-shadow: 0 4px 18px rgba(58, 107, 122, 0.15);
  transform: translateY(-2px);
}

.kw-provider-card--active {
  border-color: #3a6b7a;
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

.kw-provider-card__office {
  margin-top: 4px;
  background: #eef6f3;
  color: #2e7055;
  border-radius: 8px;
  padding: 3px 12px;
  font-size: 12px;
  font-weight: 600;
}
</style>
