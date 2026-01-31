<template>
  <div class="panel">
    <div class="panel-header">
      <div class="left">
        <div class="header-line">
          <div class="avatar" aria-hidden="true">
            <img v-if="providerPhotoUrl(provider)" :src="providerPhotoUrl(provider)" alt="" class="avatar-img" />
            <span v-else class="avatar-fallback">{{ initialsFor(provider) }}</span>
          </div>

          <div class="header-main">
            <div class="name">{{ provider.first_name }} {{ provider.last_name }}</div>
          </div>

          <div class="header-metrics">
            <span v-if="provider.slots_used != null" class="metric">
              {{ Number(provider.slots_used || 0) }} assigned
            </span>
            <span v-if="provider.start_time || provider.end_time" class="metric">
              {{ (provider.start_time || '—').toString().slice(0, 5) }}–{{ (provider.end_time || '—').toString().slice(0, 5) }}
            </span>
          </div>
        </div>
      </div>
      <div class="right">
        <label class="section">
          Section
          <select v-model="selectedSection" class="section-select">
            <option value="all">All</option>
            <option value="morning">Morning</option>
            <option value="lunch">Lunch</option>
            <option value="afternoon">Afternoon</option>
          </select>
        </label>
        <button class="btn btn-secondary btn-sm" type="button" @click="collapsed = !collapsed">
          {{ collapsed ? 'Expand' : 'Collapse' }}
        </button>
        <button
          v-if="canRequestAvailability"
          class="btn btn-secondary btn-sm"
          type="button"
          @click="requestAvailability"
          title="Request a change to your school-day hours or slots"
        >
          Update my availability
        </button>
        <button class="btn btn-secondary btn-sm" type="button" @click="$emit('open-provider', provider.provider_user_id)">
          Provider profile
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="collapsed" class="collapsed-hint">
      <span class="muted">Hidden.</span>
      <span class="muted">Caseload: {{ (caseloadClients || []).length }}</span>
    </div>
    <div v-else class="content">
      <div class="caseload">
        <div class="section-title">Caseload</div>
        <ClientInitialsList
          :clients="caseloadClients"
          :client-label-mode="clientLabelMode"
          @select="$emit('open-client', $event)"
        />
      </div>

      <SoftScheduleEditor
        class="schedule"
        :slots="slots"
        :caseload-clients="caseloadClients"
        :client-label-mode="clientLabelMode"
        :saving="saving"
        :error="error"
        @save="$emit('save-slots', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import ClientInitialsList from './ClientInitialsList.vue';
import SoftScheduleEditor from './SoftScheduleEditor.vue';
import { toUploadsUrl } from '../../../utils/uploadsUrl';

const props = defineProps({
  provider: { type: Object, required: true },
  weekday: { type: String, default: '' },
  caseloadClients: { type: Array, default: () => [] },
  slots: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  clientLabelMode: { type: String, default: 'codes' },
  currentUserId: { type: [Number, String], default: null },
  currentUserRole: { type: String, default: '' }
});

const emit = defineEmits(['open-client', 'save-slots', 'open-provider', 'request-availability']);

const selectedSection = ref('all');
const collapsed = ref(false);

const providerPhotoUrl = (p) => toUploadsUrl(p?.profile_photo_url || null);

const initialsFor = (p) => {
  const f = String(p?.first_name || '').trim();
  const l = String(p?.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'P';
};

const canRequestAvailability = computed(() => {
  const role = String(props.currentUserRole || '').toLowerCase();
  if (role !== 'provider') return false;
  const me = Number(props.currentUserId);
  const pid = Number(props.provider?.provider_user_id);
  return Number.isFinite(me) && Number.isFinite(pid) && me === pid;
});

const requestAvailability = () => {
  emit('request-availability', {
    providerUserId: props.provider?.provider_user_id || null,
    weekday: props.weekday || '',
    slotsTotal: props.provider?.slots_total ?? null,
    slotsUsed: props.provider?.slots_used ?? null,
    startTime: props.provider?.start_time || null,
    endTime: props.provider?.end_time || null,
    providerName: `${props.provider?.first_name || ''} ${props.provider?.last_name || ''}`.trim()
  });
};
</script>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 10px;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}
.header-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.avatar {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg);
  overflow: hidden;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.avatar-fallback {
  font-weight: 900;
  color: var(--text-secondary);
}
.header-main {
  min-width: 0;
}
.header-metrics {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-weight: 800;
  font-size: 12px;
}
.metric {
  white-space: nowrap;
}
.metric + .metric {
  position: relative;
  padding-left: 10px;
}
.metric + .metric:before {
  content: '•';
  position: absolute;
  left: 0;
  top: 0;
  color: var(--text-secondary);
}
.right {
  display: flex;
  gap: 10px;
  align-items: end;
}
.section {
  display: grid;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.section-select {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: white;
  color: var(--text-primary);
  min-width: 140px;
}
.name {
  font-weight: 900;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.caseload {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 10px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.section-title {
  font-weight: 900;
  color: var(--text-primary);
  margin-bottom: 0;
  flex: 0 0 auto;
  width: 90px;
  line-height: 1.1;
  padding-top: 2px;
}
.loading {
  color: var(--text-secondary);
  padding: 10px 0;
}
.collapsed-hint {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--text-secondary);
  padding: 10px 0;
}
.muted {
  font-size: 12px;
  color: var(--text-secondary);
}
@media (max-width: 1050px) {
  .content {
    flex-direction: column;
  }
  .panel-header {
    flex-direction: column;
    align-items: stretch;
  }
  .right {
    justify-content: flex-end;
  }
  .header-metrics {
    flex-wrap: wrap;
  }
}
</style>

