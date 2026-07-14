<template>
  <AccountHubPanel
    :active-section="activeSection"
    :sections="visibleSections"
    :user-display-name="userDisplayName"
    :user-initials="userInitials"
    :user-role-label="userRoleLabel"
    @select-section="$emit('select-section', $event)"
  >
    <div v-show="activeSection === 'account'" class="acct-hub__pane">
      <AccountInfoView />
    </div>
    <div v-if="flags.workforce" v-show="activeSection === 'credentials'" class="acct-hub__pane">
      <CredentialsView />
    </div>
    <div v-show="activeSection === 'documents'" class="acct-hub__pane">
      <DocumentsTab @update-count="$emit('documents-count', $event)" />
    </div>
    <div v-show="activeSection === 'life-balance'" class="acct-hub__pane">
      <MyLifeBalanceTab :agency-id="agencyId" :user-id="userId" />
    </div>
    <div
      v-if="flags.workforce"
      v-show="activeSection === 'payroll'"
      class="acct-hub__pane acct-hub__pane--payroll my-panel--payroll-hub"
    >
      <MyPayrollTab />
    </div>
    <div v-if="flags.workforce" v-show="activeSection === 'compensation'" class="acct-hub__pane">
      <MyCompensationTab />
    </div>
    <div v-show="activeSection === 'kudos'" class="acct-hub__pane">
      <MyKudosTab v-if="flags.kudos && agencyId" :agency-id="Number(agencyId)" />
      <p v-else class="acct-hub__empty">Kudos are not enabled for this organization.</p>
    </div>
    <div v-show="activeSection === 'preferences'" class="acct-hub__pane">
      <UserPreferencesHub v-if="userId" :user-id="userId" />
    </div>
  </AccountHubPanel>
</template>

<script setup>
import { computed } from 'vue';
import AccountHubPanel from './AccountHubPanel.vue';
import AccountInfoView from '../../views/AccountInfoView.vue';
import CredentialsView from '../../views/CredentialsView.vue';
import DocumentsTab from './DocumentsTab.vue';
import MyLifeBalanceTab from './MyLifeBalanceTab.vue';
import MyPayrollTab from './MyPayrollTab.vue';
import MyCompensationTab from './MyCompensationTab.vue';
import MyKudosTab from './MyKudosTab.vue';
import UserPreferencesHub from '../UserPreferencesHub.vue';
import { ACCOUNT_SECTIONS } from '../../config/accountDisplaySections';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  activeSection: { type: String, default: 'account' },
  isClubContext: { type: Boolean, default: false },
  canSeeKudos: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null },
  userId: { type: [Number, String], default: null },
});

defineEmits(['select-section', 'documents-count']);

const authStore = useAuthStore();

const flags = computed(() => ({
  workforce: !props.isClubContext,
  kudos: props.canSeeKudos,
}));

const isVisible = (section) => {
  const key = section.visibleKey;
  if (!key) return true;
  return Boolean(flags.value[key]);
};

const visibleSections = computed(() => ACCOUNT_SECTIONS.filter(isVisible));

const userDisplayName = computed(() => {
  const u = authStore.user;
  if (!u) return '';
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return name || u.email || u.username || '';
});

const userInitials = computed(() => {
  const parts = String(userDisplayName.value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '?';
  return parts.map((p) => p[0]?.toUpperCase() || '').join('');
});

const userRoleLabel = computed(() => {
  const role = String(authStore.user?.role || '').trim();
  if (!role) return '';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
});
</script>

<style scoped>
.acct-hub__pane :deep(.container) {
  padding: 0;
  max-width: none;
}

.acct-hub__pane :deep(.page-header h1),
.acct-hub__pane :deep(.page-header) {
  display: none;
}

.acct-hub__pane :deep(.preferences-header) {
  display: none;
}

.acct-hub__pane--payroll {
  margin: -12px -16px -8px;
  padding: 12px 16px 8px;
  background: #f3f4f6;
  border-radius: 8px;
}

.acct-hub__pane--payroll :deep(.pay-hub__header) {
  display: none;
}

.acct-hub__pane--payroll :deep(.pay-hub) {
  padding-top: 0;
}

.acct-hub__empty {
  margin: 0;
  color: #6b7280;
  font-size: 14px;
}
</style>
