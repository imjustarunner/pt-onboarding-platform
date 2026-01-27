<template>
  <div class="provider-school-profile">
    <div class="header">
      <button class="btn btn-secondary btn-sm" type="button" @click="$router.back()">← Back</button>
      <div class="spacer" />
    </div>

    <div v-if="loading" class="loading">Loading provider…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="profile-card">
        <div class="avatar" aria-hidden="true">
          <img v-if="profile?.profile_photo_url" :src="profile.profile_photo_url" alt="" class="avatar-img" />
          <span v-else>{{ initialsFor(profile) }}</span>
        </div>
        <div class="meta">
          <div class="name">{{ profile?.first_name }} {{ profile?.last_name }}</div>
          <div v-if="profile?.title" class="sub">{{ profile.title }}</div>
          <div v-if="profile?.service_focus" class="sub">{{ profile.service_focus }}</div>
          <a v-if="profile?.email" class="link" :href="`mailto:${profile.email}`">Message provider</a>
        </div>
      </div>

      <div class="slots">
        <div class="slots-header">
          <h2 style="margin:0;">Slot-based caseload</h2>
          <button class="btn btn-secondary btn-sm" type="button" @click="load" :disabled="loading">Refresh</button>
        </div>

        <div v-for="a in caseload?.assignments || []" :key="a.day_of_week" class="day">
          <div class="day-top">
            <div>
              <strong>{{ a.day_of_week }}</strong>
              <span v-if="a.is_active" class="badge badge-secondary" style="margin-left: 8px;">
                {{ a.slots_available ?? '—' }} / {{ a.slots_total ?? '—' }} slots
              </span>
              <span v-else class="badge badge-secondary" style="margin-left: 8px;">Inactive</span>
            </div>
            <div class="muted" v-if="a.start_time || a.end_time">
              Hours: {{ (a.start_time || '—').toString().slice(0, 5) }}–{{ (a.end_time || '—').toString().slice(0, 5) }}
            </div>
          </div>

          <div class="clients">
            <button
              v-for="c in a.clients || []"
              :key="c.id"
              class="chip"
              type="button"
              @click="$emit('open-client', c)"
            >
              {{ clientShort(c) }}
              <span v-if="Number(c.unread_notes_count || 0) > 0" class="dot" aria-hidden="true" />
            </button>
            <div v-if="(a.clients || []).length === 0" class="muted">No assigned clients.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../../services/api';

const props = defineProps({
  schoolOrganizationId: { type: Number, required: true },
  providerUserId: { type: Number, required: true }
});
defineEmits(['open-client']);

const profile = ref(null);
const caseload = ref(null);
const loading = ref(false);
const error = ref('');

const clientShort = (c) => {
  const raw = String(c?.identifier_code || c?.initials || '').replace(/\s+/g, '').toUpperCase();
  if (!raw) return '—';
  if (raw.length >= 6) return `${raw.slice(0, 3)}${raw.slice(-3)}`;
  return raw;
};

const initialsFor = (p) => {
  const f = String(p?.first_name || '').trim();
  const l = String(p?.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'P';
};

const load = async () => {
  try {
    loading.value = true;
    error.value = '';

    const [p, c] = await Promise.all([
      api.get(`/school-portal/${props.schoolOrganizationId}/providers/${props.providerUserId}/profile`),
      api.get(`/school-portal/${props.schoolOrganizationId}/providers/${props.providerUserId}/caseload-slots`)
    ]);
    profile.value = p.data || null;
    caseload.value = c.data || null;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load provider profile';
  } finally {
    loading.value = false;
  }
};

onMounted(load);
watch(() => [props.schoolOrganizationId, props.providerUserId], load);
</script>

<style scoped>
.provider-school-profile {
  display: grid;
  gap: 12px;
}
.header {
  display: flex;
  gap: 10px;
  align-items: center;
}
.spacer { flex: 1; }
.loading, .error { padding: 10px 0; }
.error { color: #c33; }

.profile-card {
  display: flex;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 14px;
}
.avatar {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 900;
}
.avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.name { font-weight: 900; color: var(--text-primary); }
.sub { color: var(--text-secondary); margin-top: 2px; }
.link { display: inline-block; margin-top: 6px; font-weight: 800; }
label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.input {
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}

.slots {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 14px;
}
.slots-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.day {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  padding: 12px;
  margin-bottom: 10px;
}
.day-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.clients {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  position: relative;
  border: 1px solid var(--border);
  background: white;
  border-radius: 999px;
  padding: 8px 10px;
  font-weight: 900;
  letter-spacing: 0.05em;
  font-size: 12px;
}
.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--danger, #d92d20);
  margin-left: 8px;
  vertical-align: middle;
}
.muted { color: var(--text-secondary); font-size: 13px; }
</style>

