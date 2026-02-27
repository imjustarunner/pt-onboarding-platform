<template>
  <div v-if="canManage && (loading || officeRequestNotifications.length > 0)" class="building-notifications-panel card">
    <div class="panel-header">
      <h4 style="margin: 0;">Office availability requests</h4>
      <span v-if="officeRequestNotifications.length > 0" class="pill">{{ officeRequestNotifications.length }} pending</span>
      <button v-if="officeRequestNotifications.length > 0" class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>
    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="officeRequestNotifications.length === 0" class="muted">No pending office availability requests.</div>
    <ul v-else class="notification-list">
      <li v-for="n in officeRequestNotifications" :key="n.id" class="notification-row">
        <div class="row-main">
          <span class="message">{{ n.title || n.message }}</span>
          <span class="meta">{{ formatDate(n.created_at) }}</span>
        </div>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" type="button" @click="openModal(n)">View</button>
          <button class="btn btn-primary btn-sm" type="button" @click="openModal(n)">Approve</button>
          <a
            :href="intakeUrl(n)"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-secondary btn-sm"
          >
            Open in new tab
          </a>
        </div>
      </li>
    </ul>
    <OfficeRequestAssignModal
      :visible="modal.visible"
      :request-id="modal.requestId"
      :agency-id="modal.agencyId"
      @close="modal.visible = false"
      @assigned="handleResolved"
      @denied="handleResolved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import OfficeRequestAssignModal from '../admin/OfficeRequestAssignModal.vue';

const authStore = useAuthStore();
const route = useRoute();

const loading = ref(false);
const notifications = ref([]);

const role = computed(() => authStore.user?.role);
const canManage = computed(() => {
  const r = String(role.value || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'clinical_practice_assistant', 'provider_plus', 'staff'].includes(r);
});

const officeRequestNotifications = computed(() =>
  (notifications.value || []).filter(
    (n) => n.type === 'office_availability_request_pending' && !n.is_resolved && n.agency_id
  )
);

const modal = ref({ visible: false, requestId: null, agencyId: null });

const orgSlug = computed(() => (typeof route.params.organizationSlug === 'string' ? route.params.organizationSlug : null));

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const intakeUrl = (n) => {
  const base = orgSlug.value ? `/${orgSlug.value}/admin/settings` : '/admin/settings';
  return `${base}?category=workflow&item=availability-intake&agencyId=${n.agency_id}`;
};

const openModal = (n) => {
  modal.value = {
    visible: true,
    requestId: Number(n.related_entity_id || 0),
    agencyId: Number(n.agency_id || 0)
  };
};

const handleResolved = () => {
  modal.value.visible = false;
  load();
};

const load = async () => {
  if (!canManage.value) return;
  try {
    loading.value = true;
    const resp = await api.get('/notifications', {
      params: { type: 'office_availability_request_pending', isResolved: false, limit: 50 },
      skipGlobalLoading: true
    });
    notifications.value = resp.data || [];
  } catch {
    notifications.value = [];
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.building-notifications-panel {
  margin-bottom: 16px;
}
.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.pill {
  background: var(--accent);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}
.notification-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.notification-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.notification-row:last-child {
  border-bottom: none;
}
.row-main {
  flex: 1;
  min-width: 0;
}
.message {
  display: block;
  font-weight: 500;
}
.meta {
  font-size: 12px;
  color: var(--text-secondary);
}
.row-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
</style>
