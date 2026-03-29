<template>
  <div class="club-quick-actions">
    <h2>Quick Actions</h2>
    <div class="actions-grid">
      <button type="button" class="action-card" @click="$emit('add-member')">
        <div class="action-icon-wrap">
          <img v-if="addMemberIconUrl" :src="addMemberIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">👤</span>
        </div>
        <div class="action-content">
          <h3>Add New Member</h3>
          <p>Check if their email exists and add them to your club.</p>
        </div>
      </button>
      <button type="button" class="action-card" @click="$emit('add-season')">
        <div class="action-icon-wrap">
          <img v-if="addSeasonIconUrl" :src="addSeasonIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">🏁</span>
        </div>
        <div class="action-content">
          <h3>Add New Season</h3>
          <p>Establish the terms of your next season (Winter Run '26, etc.).</p>
        </div>
      </button>
      <router-link :to="settingsTo" class="action-card action-card-link">
        <div class="action-icon-wrap">
          <img v-if="settingsIconUrl" :src="settingsIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">⚙️</span>
        </div>
        <div class="action-content">
          <h3>Club Settings</h3>
          <p>Configure your club name, branding, and challenge management.</p>
        </div>
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useBrandingStore } from '../../store/branding';

const props = defineProps({
  orgSlug: { type: String, default: '' },
  agency: { type: Object, default: null }
});

defineEmits(['add-member', 'add-season']);

const brandingStore = useBrandingStore();

const settingsTo = computed(() => {
  const slug = props.orgSlug;
  return slug ? `/${slug}/admin/club-settings` : '/admin/settings';
});

const addMemberIconUrl = computed(() =>
  brandingStore.getClubQuickActionIconUrl('add_member', props.agency)
);
const addSeasonIconUrl = computed(() =>
  brandingStore.getClubQuickActionIconUrl('add_season', props.agency)
);
const settingsIconUrl = computed(() =>
  brandingStore.getClubQuickActionIconUrl('settings', props.agency)
);
</script>

<style scoped>
.club-quick-actions h2 {
  margin: 0 0 24px 0;
  font-size: 1.125rem;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.action-card {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.action-card-link {
  text-decoration: none;
  color: inherit;
}

.action-icon-wrap {
  flex-shrink: 0;
}

.action-icon-placeholder {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: var(--bg-alt);
  border-radius: 10px;
}

.action-icon-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 10px;
}

.action-content {
  flex: 1;
  min-width: 0;
}

.action-content h3 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 800;
}

.action-content p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}
</style>
