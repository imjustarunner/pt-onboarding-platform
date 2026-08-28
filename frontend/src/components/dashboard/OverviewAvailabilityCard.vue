<template>
  <section class="ov-avail" data-tour="dash-overview-availability">
    <header class="ov-avail-head">
      <h3>Availability Hours</h3>
      <button type="button" class="ov-link" @click="open = !open">
        {{ open ? 'Hide' : 'Edit' }}
      </button>
    </header>
    <p class="ov-avail-sub">
      {{ summary }}
      <button type="button" class="ov-link inline" @click="$emit('open-schedule')">Open calendar</button>
    </p>
    <WorkHoursEditor
      v-if="userId && open"
      :user-id="userId"
      :open-by-default="true"
      :force-open="true"
    />
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import WorkHoursEditor from '../schedule/WorkHoursEditor.vue';

defineEmits(['open-schedule']);

const authStore = useAuthStore();
const userId = computed(() => Number(authStore.user?.id || 0) || null);
const open = ref(false);
const summary = ref('Loading…');

async function loadSummary() {
  const uid = userId.value;
  if (!uid) {
    summary.value = 'Sign in to manage Availability Hours.';
    return;
  }
  try {
    const { data } = await api.get(`/users/${uid}/work-schedule`, { skipGlobalLoading: true });
    if (data?.isActive === false) {
      summary.value = 'Availability Hours are off (always reachable for digests/holds).';
      return;
    }
    const n = Array.isArray(data?.blocks) ? data.blocks.length : 0;
    if (!n) {
      summary.value = 'Using default Mon–Fri 6:00 AM–7:00 PM. Customize split days or vacation anytime.';
      return;
    }
    summary.value = `${n} saved reachability range${n === 1 ? '' : 's'} · edit to add split days or vacation.`;
  } catch {
    summary.value = 'Manage when you’re reachable for email/SMS — including split days and vacation.';
  }
}

onMounted(loadSummary);
watch(userId, loadSummary);
watch(open, (v) => { if (!v) loadSummary(); });
</script>

<style scoped>
.ov-avail {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
  margin-bottom: 12px;
}
.ov-avail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ov-avail-head h3 {
  margin: 0;
  font-size: 0.95rem;
}
.ov-avail-sub {
  margin: 6px 0 0;
  font-size: 0.85rem;
  color: #64748b;
}
.ov-link {
  border: none;
  background: none;
  color: #166534;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.85rem;
}
.ov-link.inline { margin-left: 8px; }
</style>
