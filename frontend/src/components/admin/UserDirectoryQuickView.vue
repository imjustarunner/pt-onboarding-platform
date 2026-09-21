<template>
  <aside class="directory-quick-view" aria-label="User overview quick view">
    <header class="dq-header">
      <div class="dq-avatar">
        <img v-if="user.profile_photo_url && !photoFailed" :src="toUploadsUrl(user.profile_photo_url)" :alt="fullName" @error="photoFailed = true" />
        <span v-else>{{ initials }}</span>
      </div>
      <div class="dq-identity">
        <h2>{{ fullName }}</h2>
        <div class="dq-badges"><span>{{ statusLabel }}</span><span>{{ roleLabel }}</span></div>
        <p v-if="profile.title">{{ profile.title }}</p>
        <div class="dq-actions">
          <router-link :to="profilePath" class="dq-primary" @click="$emit('close')">Open profile ↗</router-link>
          <button type="button" @click="$emit('navigate', 'communications')">Message</button>
          <div v-if="canArchive" class="dq-more">
            <button type="button" aria-label="User actions" :aria-expanded="showActions" aria-haspopup="menu" @click="showActions = !showActions">⋯</button>
            <div v-if="showActions" class="dq-menu" role="menu">
              <button type="button" role="menuitem" @click="showActions = false; $emit('archive')">Archive user</button>
            </div>
          </div>
        </div>
      </div>
      <button class="dq-close" type="button" aria-label="Close quick view" @click="$emit('close')">×</button>
    </header>
    <nav class="dq-nav" aria-label="Profile sections">
      <span aria-current="page">Overview</span>
      <button type="button" @click="$emit('navigate', 'assignments')">Assignments</button>
      <button type="button" @click="$emit('navigate', 'account')">Account</button>
    </nav>
    <div class="dq-content" :aria-busy="loading">
      <p v-if="loading" class="dq-notice" role="status">Loading overview…</p>
      <div v-else-if="error" class="dq-notice" role="alert">
        <p>{{ error }}</p>
        <button type="button" @click="loadOverview">Try again</button>
      </div>
      <UserOverviewTab
        v-else-if="overview"
        :key="`${user.id}:${agencyId}`"
        compact
        :user-id="Number(user.id)"
        :user="profile"
        :agency-id="agencyId"
        :agency-label="agencyLabel"
        :preloaded-overview="overview"
        :can-view-lifecycle-tab="isBackoffice"
        :can-view-payroll="isBackoffice"
        :can-view-activity-log="isBackoffice || isSupervisor(authStore.user)"
        @navigate="(tab) => $emit('navigate', tab)"
      />
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { isSupervisor } from '../../utils/helpers.js';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';
import UserOverviewTab from './UserOverviewTab.vue';

const props = defineProps({
  user: { type: Object, required: true },
  agencyId: { type: [Number, String], default: null },
  agencyLabel: { type: String, default: '' },
  profilePath: { type: String, required: true },
  roleLabel: { type: String, default: '' },
  statusLabel: { type: String, default: '' },
  canArchive: { type: Boolean, default: false },
});
defineEmits(['close', 'archive', 'navigate']);
const authStore = useAuthStore();
const isBackoffice = computed(() => ['super_admin', 'admin', 'support'].includes(authStore.user?.role));
const overview = ref(null);
const loading = ref(false);
const error = ref('');
const showActions = ref(false);
const photoFailed = ref(false);
const reload = ref(0);
const fullName = computed(() => `${props.user.first_name || ''} ${props.user.last_name || ''}`.trim());
const initials = computed(() => `${(props.user.first_name || '')[0] || ''}${(props.user.last_name || '')[0] || ''}`);
const profile = computed(() => ({ ...props.user, ...overview.value?.user, credential: props.user.provider_credential || props.user.credential }));
const loadOverview = () => { reload.value++; };
watch(() => [props.user.id, props.agencyId, reload.value], async (_, __, onCleanup) => {
  let active = true;
  const controller = new AbortController();
  onCleanup(() => { active = false; controller.abort(); });
  overview.value = null;
  error.value = '';
  loading.value = true;
  showActions.value = false;
  photoFailed.value = false;
  try {
    const { data } = await api.get(`/users/${props.user.id}/profile-overview`, {
      params: props.agencyId ? { agencyId: props.agencyId } : {},
      signal: controller.signal,
      skipGlobalLoading: true,
    });
    if (active) overview.value = data;
  } catch (err) {
    if (active) error.value = err.response?.data?.error?.message || 'Unable to load this overview. Open the profile or try again.';
  } finally {
    if (active) loading.value = false;
  }
}, { immediate: true });
</script>

<style scoped>
.directory-quick-view { position: fixed; inset: 0 0 0 auto; width: min(460px, 94vw); z-index: 500; display: flex; flex-direction: column; background: #f8faf9; border-left: 1px solid #d9e5dd; box-shadow: -12px 0 40px #173e2920; color: #273b34; font-size: 12px; }
.dq-header { position: relative; display: flex; gap: 14px; padding: 24px 34px 18px 18px; background: linear-gradient(145deg, #edf6f0, #fff 75%); }
.dq-avatar { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; background: #dcece2; color: #315b43; display: grid; place-items: center; flex-shrink: 0; font-size: 21px; font-weight: 600; border: 3px solid white; box-shadow: 0 2px 8px #244d3214; }
.dq-avatar img { width: 100%; height: 100%; object-fit: cover; }
.dq-identity { flex: 1; min-width: 0; }
.dq-identity h2 { font-size: 17px; line-height: 1.3; margin: 0 0 8px; color: #243d32; overflow-wrap: anywhere; }
.dq-identity p { margin: 8px 0; color: #718077; line-height: 1.5; }
.dq-badges, .dq-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.dq-badges span { padding: 3px 8px; border-radius: 20px; background: #e7f0e9; color: #42694d; font-size: 11px; }
.dq-actions { margin-top: 12px; }
.dq-actions button, .dq-actions a, .dq-notice button { font: inherit; border: 1px solid #d9e3dc; border-radius: 6px; padding: 7px 10px; color: #37634b; background: white; cursor: pointer; text-decoration: none; }
.dq-actions .dq-primary { background: var(--primary, #315e43); border-color: transparent; color: white; }
.dq-more { position: relative; }
.dq-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 2; padding: 4px; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 8px 24px #0002; white-space: nowrap; }
.dq-menu button { color: #a23636; border: 0; }
.dq-close { position: absolute; top: 10px; right: 10px; background: none; border: 0; color: #7d8b83; cursor: pointer; font-size: 24px; padding: 2px 6px; }
.dq-nav { display: flex; gap: 22px; padding: 0 18px; background: white; border-bottom: 1px solid #e0e8e2; }
.dq-nav span, .dq-nav button { padding: 12px 0; border: 0; border-bottom: 2px solid transparent; background: none; font: inherit; color: #7b857f; cursor: pointer; }
.dq-nav span { color: #356b49; border-bottom-color: #356b49; font-weight: 600; cursor: default; }
.dq-content { overflow-y: auto; overscroll-behavior: contain; min-height: 0; flex: 1; padding: 12px; }
.dq-notice { padding: 24px 12px; color: #65756b; line-height: 1.6; }
button:focus-visible, a:focus-visible { outline: 2px solid #43855c; outline-offset: 3px; }
</style>
