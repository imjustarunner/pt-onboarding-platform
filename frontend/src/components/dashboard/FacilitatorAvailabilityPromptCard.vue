<template>
  <section v-if="pending.length" class="fap-card">
    <div class="fap-head">
      <div class="fap-icon">📋</div>
      <div>
        <strong class="fap-label">Availability request waiting</strong>
        <div class="fap-count">{{ pending.length }} pending form{{ pending.length > 1 ? 's' : '' }}</div>
      </div>
    </div>

    <div class="fap-list">
      <div v-for="item in pending" :key="item.id" class="fap-item">
        <div class="fap-item-info">
          <div class="fap-item-title">{{ item.title }}</div>
          <div v-if="item.subtitle" class="fap-item-sub">{{ item.subtitle }}</div>
          <div v-if="item.deadline" class="fap-item-deadline">Due {{ fmtDate(item.deadline) }}</div>
        </div>
        <router-link
          :to="availabilityFormRoute(item)"
          class="btn btn-primary btn-sm"
        >
          Fill Out
        </router-link>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const agencyStore = useAgencyStore();
const router = useRouter();
const pending = ref([]);

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const availabilityFormRoute = (item) => {
  const slug = agencyStore.currentAgency?.slug;
  return slug
    ? `/${slug}/facilitator-availability/${item.id}`
    : `/facilitator-availability/${item.id}`;
};

const load = async () => {
  try {
    const r = await api.get('/facilitator-availability/my-pending');
    pending.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    pending.value = [];
  }
};

onMounted(load);
</script>

<style scoped>
.fap-card { border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px 16px; background: #eff6ff; margin-bottom: 14px; }
.fap-head { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.fap-icon { font-size: 1.3rem; line-height: 1; }
.fap-label { font-size: .97rem; color: #1e3a8a; font-weight: 700; display: block; }
.fap-count { font-size: .82rem; color: #3b82f6; }
.fap-list { display: grid; gap: 10px; }
.fap-item { display: flex; justify-content: space-between; align-items: center; gap: 10px; background: #fff; border: 1px solid #dbeafe; border-radius: 10px; padding: 10px 14px; }
.fap-item-info { flex: 1; min-width: 0; }
.fap-item-title { font-weight: 600; color: #0f172a; font-size: .93rem; }
.fap-item-sub { color: #64748b; font-size: .82rem; margin-top: 2px; }
.fap-item-deadline { color: #b45309; font-size: .78rem; margin-top: 3px; }
.btn { display: inline-flex; align-items: center; border: none; border-radius: 8px; padding: 7px 14px; font-size: .85rem; font-weight: 600; cursor: pointer; text-decoration: none; white-space: nowrap; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-primary:hover { background: #1d4ed8; }
.btn-sm { padding: 5px 12px; font-size: .82rem; }
</style>
