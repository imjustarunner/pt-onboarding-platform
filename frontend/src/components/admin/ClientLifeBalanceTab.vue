<template>
  <div class="lbw-tab">
    <div class="head">
      <h3>Life Balance Wheel</h3>
      <button type="button" class="btn primary" :disabled="assigning" @click="assign">
        {{ assigning ? 'Creating…' : 'Assign assessment' }}
      </button>
    </div>
    <p v-if="error" class="err">{{ error }}</p>
    <p v-if="notice" class="ok">{{ notice }}</p>
    <p v-if="lastLink" class="link-row">
      Share link:
      <a :href="lastLink" target="_blank" rel="noopener">{{ lastLink }}</a>
      <button type="button" class="btn ghost" @click="copyLink">Copy</button>
    </p>

    <p v-if="loading" class="muted">Loading…</p>
    <ul v-else class="list">
      <li v-for="a in assessments" :key="a.id" class="row">
        <div>
          <strong>{{ a.status }}</strong>
          <div class="meta">
            Created {{ formatWhen(a.createdAt) }}
            <template v-if="a.completedAt"> · Completed {{ formatWhen(a.completedAt) }}</template>
            <template v-if="a.summary?.average != null"> · Avg {{ a.summary.average }}</template>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" @click="open(a)">Open</button>
        </div>
      </li>
      <li v-if="!assessments.length" class="muted">No assessments yet.</li>
    </ul>

    <div v-if="preview" class="preview">
      <LifeBalanceWheel :categories="previewCategories" :interactive="false" compact />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import LifeBalanceWheel from '../lifeBalance/LifeBalanceWheel.vue';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  agencyId: { type: [Number, String], required: true },
  organizationSlug: { type: String, default: '' }
});

const router = useRouter();
const loading = ref(false);
const assigning = ref(false);
const error = ref('');
const notice = ref('');
const assessments = ref([]);
const lastLink = ref('');
const preview = ref(null);

const previewCategories = computed(() => {
  const a = preview.value;
  if (!a?.template?.categories) return [];
  const map = Object.fromEntries((a.responses || []).map((r) => [r.categoryKey, r]));
  return a.template.categories.map((c) => ({
    key: c.key,
    label: c.label,
    shortLabel: c.shortLabel,
    color: c.color,
    score: map[c.key]?.score ?? null
  }));
});

function formatWhen(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/life-balance/subjects/clients/${props.clientId}/assessments`, {
      params: { agencyId: props.agencyId }
    });
    assessments.value = res.data?.assessments || [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not load';
  } finally {
    loading.value = false;
  }
}

async function assign() {
  assigning.value = true;
  error.value = '';
  notice.value = '';
  try {
    const res = await api.post('/life-balance/assessments', {
      agencyId: Number(props.agencyId),
      clientId: Number(props.clientId)
    });
    const a = res.data?.assessment;
    const slug = props.organizationSlug || '';
    lastLink.value = a?.accessToken
      ? (slug
        ? `${window.location.origin}/${slug}/life-balance/${a.accessToken}`
        : `${window.location.origin}/lbw/${a.accessToken}`)
      : '';
    notice.value = 'Assessment created';
    await load();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Assign failed';
  } finally {
    assigning.value = false;
  }
}

function copyLink() {
  if (!lastLink.value) return;
  navigator.clipboard?.writeText(lastLink.value);
  notice.value = 'Link copied';
}

async function open(row) {
  try {
    const res = await api.get(`/life-balance/assessments/${row.id}`);
    preview.value = res.data?.assessment || null;
    if (props.organizationSlug && row.status !== 'completed') {
      router.push(`/${props.organizationSlug}/life-balance/assessment/${row.id}`);
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Could not open';
  }
}

onMounted(load);
watch(() => [props.clientId, props.agencyId], load);
</script>

<style scoped>
.lbw-tab { display: grid; gap: 0.85rem; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }
.head h3 { margin: 0; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.55rem; }
.row {
  display: flex; justify-content: space-between; gap: 0.75rem; align-items: center;
  padding: 0.65rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 10px;
}
.meta { font-size: 0.8rem; color: #64748b; margin-top: 0.15rem; }
.muted { color: #64748b; }
.err { color: #991b1b; }
.ok { color: #166534; }
.link-row { font-size: 0.82rem; word-break: break-all; }
.btn {
  border: 1px solid #cbd5e1; background: #fff; border-radius: 8px;
  padding: 0.4rem 0.7rem; cursor: pointer; font-size: 0.85rem;
}
.btn.primary { background: #1b4332; color: #fff; border-color: #1b4332; }
.btn.ghost { background: transparent; }
.btn:disabled { opacity: 0.55; }
.preview { margin-top: 0.5rem; }
</style>
