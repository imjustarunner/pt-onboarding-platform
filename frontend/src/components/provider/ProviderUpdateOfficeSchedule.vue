<template>
  <div class="pu-office">
    <p class="muted">
      Review office standing slots that need open-for-booking coverage. Flag items and open My Schedule to quick-add
      openings.
    </p>
    <div v-if="loading" class="muted">Loading office schedule…</div>
    <div v-else-if="error" class="err">{{ error }}</div>
    <ul v-else class="slots">
      <li v-for="s in slots" :key="s.id" :class="{ needs: s.needsOpen && !s.flaggedOk }">
        <div>
          <strong>{{ s.title || 'Office slot' }}</strong>
          <div class="muted">{{ s.when }}</div>
          <div v-if="s.needsOpen && !s.flaggedOk" class="flag">Needs open for booking</div>
          <div v-else-if="s.flaggedOk" class="ok">Marked reviewed</div>
        </div>
        <div class="slot-actions">
          <button v-if="s.needsOpen && !s.flaggedOk" type="button" class="btn" @click="flagOk(s)">
            Flag reviewed
          </button>
          <a class="btn" :href="scheduleHref(s)" target="_blank" rel="noopener">Quick-add →</a>
        </div>
      </li>
      <li v-if="!slots.length" class="muted">
        No standing office slots currently need open-for-booking action.
      </li>
    </ul>
    <div class="actions">
      <a class="btn" :href="myScheduleHref" target="_blank" rel="noopener">Open My Schedule →</a>
      <button
        type="button"
        class="btn primary"
        :disabled="busy"
        @click="emit('complete', { reviewed: true, slotCount: slots.length, flaggedIds: flaggedIds })"
      >
        Mark office schedule reviewed
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], default: null },
  mode: { type: String, default: 'auth' },
  token: { type: String, default: '' }
});
const emit = defineEmits(['complete']);
const route = useRoute();

const slots = ref([]);
const flaggedIds = ref([]);
const loading = ref(false);
const error = ref('');
const busy = ref(false);

const orgPrefix = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}` : '';
});

const myScheduleHref = computed(() => `${orgPrefix.value}/my-schedule`);

function scheduleHref(s) {
  const q = new URLSearchParams();
  if (s.officeLocationId) q.set('officeLocationId', String(s.officeLocationId));
  if (s.standingAssignmentId) q.set('standingAssignmentId', String(s.standingAssignmentId));
  q.set('action', 'attach_open_for_booking');
  return `${myScheduleHref.value}?${q.toString()}`;
}

function flagOk(s) {
  s.flaggedOk = true;
  if (!flaggedIds.value.includes(s.id)) flaggedIds.value.push(s.id);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    let res;
    if (props.mode === 'token' && props.token) {
      res = await api.get(
        `/public/provider-update/${encodeURIComponent(props.token)}/office-schedule-review`
      );
    } else {
      res = await api
        .get('/provider-update/me/office-schedule-review')
        .catch(() => api.get('/office-schedule/me/open-for-booking-review'));
    }
    const rows = res.data?.items || [];
    slots.value = rows.map((r) => ({
      ...r,
      id: r.id || r.standingAssignmentId,
      flaggedOk: false
    }));
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Could not load office schedule';
    slots.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.pu-office { display: grid; gap: 0.75rem; }
.slots { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.slots li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.75rem 0.9rem;
}
.slots li.needs { border-color: #c4a35a; background: #fffbeb; }
.flag { color: #92400e; font-size: 0.8rem; font-weight: 600; margin-top: 0.2rem; }
.ok { color: #3d6b4f; font-size: 0.8rem; font-weight: 600; margin-top: 0.2rem; }
.muted { color: #6b7280; }
.err { color: #b91c1c; }
.btn {
  border: 1px solid #3d6b4f;
  background: #fff;
  color: #3d6b4f;
  border-radius: 8px;
  padding: 0.4rem 0.7rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
.btn.primary { background: #3d6b4f; color: #fff; }
.slot-actions, .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
</style>
