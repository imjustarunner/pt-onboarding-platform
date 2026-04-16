<template>
  <section class="people-snapshot" aria-labelledby="people-snapshot-title">
    <h3 id="people-snapshot-title" class="people-snapshot-title">People snapshot</h3>
    <p class="people-snapshot-hint">
      Quick counts for this tenant. Expand a card to browse up to {{ listCap }} names per category (totals may be higher).
    </p>

    <div v-if="loading" class="people-snapshot-muted">Loading…</div>
    <div v-else-if="error" class="people-snapshot-error">{{ error }}</div>
    <div v-else-if="!agencyId" class="people-snapshot-muted">Select a tenant to see people here.</div>
    <div v-else class="people-snapshot-grid">
      <article v-for="card in cards" :key="card.key" class="snapshot-card">
        <button
          type="button"
          class="snapshot-card-header"
          :aria-expanded="expanded[card.key] ? 'true' : 'false'"
          @click="toggle(card.key)"
        >
          <span class="snapshot-card-label">{{ card.label }}</span>
          <span class="snapshot-card-count">{{ card.total }}</span>
          <span class="snapshot-card-chevron" aria-hidden="true">{{ expanded[card.key] ? '▾' : '▸' }}</span>
        </button>
        <p v-if="card.sub" class="snapshot-card-sub">{{ card.sub }}</p>
        <div v-show="expanded[card.key]" class="snapshot-card-body">
          <p v-if="!card.items.length" class="people-snapshot-muted">None in this category.</p>
          <ul v-else class="snapshot-list">
            <li v-for="(row, idx) in card.items" :key="`${card.key}-${idx}`" class="snapshot-list-item">
              <span class="snapshot-name">{{ card.format(row) }}</span>
              <span v-if="card.meta(row)" class="snapshot-meta">{{ card.meta(row) }}</span>
            </li>
          </ul>
          <p v-if="card.truncated" class="snapshot-truncated">Showing first {{ listCap }} of {{ card.total }}.</p>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';

const props = defineProps({
  /** When set (e.g. tenant hub), load this agency; otherwise uses currentAgency. */
  agencyId: { type: [Number, String], default: null }
});

const agencyStore = useAgencyStore();

const loading = ref(false);
const error = ref('');
const snapshot = ref(null);
const expanded = ref({
  adminsStaff: false,
  providers: false,
  otherTeam: false,
  clients: false,
  guardians: false,
  members: false
});

const effectiveAgencyId = computed(() => {
  const raw = props.agencyId != null && props.agencyId !== '' ? props.agencyId : agencyStore.currentAgency?.id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const listCap = computed(() => snapshot.value?.listCap ?? 60);

function displayName(row) {
  const fn = String(row?.first_name || '').trim();
  const ln = String(row?.last_name || '').trim();
  const both = `${fn} ${ln}`.trim();
  if (both) return both;
  return String(row?.email || row?.full_name || `ID ${row?.id || ''}`).trim() || '—';
}

function clientLabel(row) {
  const n = String(row?.full_name || '').trim();
  if (n) return n;
  const idc = String(row?.identifier_code || '').trim();
  if (idc) return idc;
  return row?.initials ? String(row.initials) : `Client #${row?.id || ''}`;
}

async function load() {
  const id = effectiveAgencyId.value;
  if (!id) {
    snapshot.value = null;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get(`/agencies/${id}/settings-people-snapshot`, { skipGlobalLoading: true });
    snapshot.value = data;
  } catch (e) {
    snapshot.value = null;
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load snapshot.';
  } finally {
    loading.value = false;
  }
}

watch(effectiveAgencyId, load, { immediate: true });

function toggle(key) {
  expanded.value = { ...expanded.value, [key]: !expanded.value[key] };
}

const cards = computed(() => {
  const s = snapshot.value;
  if (!s) return [];
  const out = [
    {
      key: 'adminsStaff',
      label: 'Admins & staff',
      sub: 'Admin, staff, support, school admin',
      total: s.adminsStaff?.total ?? 0,
      items: s.adminsStaff?.items || [],
      truncated: !!s.adminsStaff?.truncated,
      format: displayName,
      meta: (row) => String(row?.role || '').replace(/_/g, ' ')
    },
    {
      key: 'providers',
      label: 'Providers & clinical',
      sub: 'Provider, provider plus, clinical practice assistant',
      total: s.providers?.total ?? 0,
      items: s.providers?.items || [],
      truncated: !!s.providers?.truncated,
      format: displayName,
      meta: (row) => String(row?.role || '').replace(/_/g, ' ')
    },
    {
      key: 'otherTeam',
      label: 'Other team',
      sub: 'Supervisors and other roles on this tenant',
      total: s.otherTeam?.total ?? 0,
      items: s.otherTeam?.items || [],
      truncated: !!s.otherTeam?.truncated,
      format: displayName,
      meta: (row) => String(row?.role || '').replace(/_/g, ' ')
    },
    {
      key: 'clients',
      label: 'Clients',
      sub: 'Active clients on this tenant',
      total: s.clients?.total ?? 0,
      items: s.clients?.items || [],
      truncated: !!s.clients?.truncated,
      format: clientLabel,
      meta: (row) => (row?.status ? String(row.status) : '')
    },
    {
      key: 'guardians',
      label: 'Guardians',
      sub: 'Linked to clients on this tenant',
      total: s.guardians?.total ?? 0,
      items: s.guardians?.items || [],
      truncated: !!s.guardians?.truncated,
      format: displayName,
      meta: (row) => {
        const n = Number(row?.linked_clients_count || 0);
        return n ? `${n} linked client${n === 1 ? '' : 's'}` : '';
      }
    }
  ];
  if (s.members && Number(s.members.total || 0) > 0) {
    out.push({
      key: 'members',
      label: 'Program / club members',
      sub: 'Challenge member applications for this organization',
      total: s.members.total,
      items: s.members.items || [],
      truncated: s.members.total > (s.members.items || []).length,
      format: (row) => displayName(row),
      meta: (row) => String(row?.status || '').replace(/_/g, ' ')
    });
  }
  return out;
});
</script>

<style scoped>
.people-snapshot {
  margin-bottom: 28px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}

.people-snapshot-title {
  margin: 0 0 6px 0;
  font-size: 1rem;
  font-weight: 700;
}

.people-snapshot-hint {
  margin: 0 0 14px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.45;
}

.people-snapshot-muted {
  color: var(--text-secondary);
  font-size: 14px;
}

.people-snapshot-error {
  color: var(--error, #b91c1c);
  font-size: 14px;
}

.people-snapshot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.snapshot-card {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-alt, rgba(255, 255, 255, 0.6));
  overflow: hidden;
}

.snapshot-card-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: inherit;
}

.snapshot-card-header:hover {
  background: rgba(0, 0, 0, 0.04);
}

.snapshot-card-label {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
}

.snapshot-card-count {
  font-weight: 800;
  font-size: 15px;
  min-width: 2ch;
  text-align: right;
}

.snapshot-card-chevron {
  font-size: 12px;
  opacity: 0.7;
}

.snapshot-card-sub {
  margin: 0 12px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.35;
}

.snapshot-card-body {
  padding: 0 12px 12px;
  border-top: 1px solid var(--border);
}

.snapshot-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
}

.snapshot-list-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(0, 0, 0, 0.08);
  font-size: 13px;
}

.snapshot-list-item:last-child {
  border-bottom: none;
}

.snapshot-name {
  font-weight: 500;
}

.snapshot-meta {
  font-size: 12px;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.snapshot-truncated {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
