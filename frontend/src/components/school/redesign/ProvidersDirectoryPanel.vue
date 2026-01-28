<template>
  <div class="panel">
    <div class="header">
      <div>
        <div class="title">Providers</div>
        <div class="subtitle">Contact cards (school portal)</div>
      </div>
      <div class="actions">
        <input v-model="query" class="search" type="search" placeholder="Search name/email…" />
      </div>
    </div>

    <div class="body">
      <div v-if="loading" class="muted">Loading providers…</div>
      <div v-else-if="filtered.length === 0" class="muted">No providers found.</div>
      <div v-else class="grid">
        <button
          v-for="p in filtered"
          :key="p.provider_user_id"
          type="button"
          class="card"
          @click="$emit('open-provider', p.provider_user_id)"
        >
          <div class="avatar" aria-hidden="true">
            <img v-if="p.profile_photo_url" :src="p.profile_photo_url" alt="" class="avatar-img" />
            <span v-else>{{ initialsFor(p) }}</span>
          </div>
          <div class="meta">
            <div class="name">{{ p.first_name }} {{ p.last_name }}</div>
            <div v-if="p.email" class="line">{{ p.email }}</div>
            <div class="badges">
              <span v-if="p.accepting_new_clients === false" class="badge badge-secondary">Not accepting</span>
              <span v-else class="badge badge-secondary">Accepting</span>
              <span v-if="activeDaysFor(p).length" class="badge badge-secondary">
                {{ activeDaysFor(p).join(', ') }}
              </span>
            </div>
            <div class="hint">Click to open profile</div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  providers: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
});

defineEmits(['open-provider']);

const query = ref('');
const normalize = (v) => String(v || '').trim().toLowerCase();

const activeDaysFor = (p) => {
  const list = Array.isArray(p?.assignments) ? p.assignments : [];
  return list
    .filter((a) => a && a.is_active)
    .map((a) => String(a.day_of_week))
    .filter(Boolean);
};

const initialsFor = (p) => {
  const f = String(p?.first_name || '').trim();
  const l = String(p?.last_name || '').trim();
  const a = f ? f[0] : '';
  const b = l ? l[0] : '';
  return `${a}${b}`.toUpperCase() || 'P';
};

const filtered = computed(() => {
  const q = normalize(query.value);
  const list = Array.isArray(props.providers) ? props.providers : [];
  const base = list.slice().sort((a, b) => normalize(a?.last_name).localeCompare(normalize(b?.last_name)));
  if (!q) return base;
  return base.filter((p) => {
    const hay = `${p?.first_name || ''} ${p?.last_name || ''} ${p?.email || ''}`;
    return normalize(hay).includes(q);
  });
});
</script>

<style scoped>
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  overflow: hidden;
}
.header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.title {
  font-weight: 900;
  color: var(--text-primary);
}
.subtitle {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 10px;
  align-items: center;
}
.search {
  width: 280px;
  max-width: 45vw;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.body {
  padding: 14px 16px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.card {
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: white;
  padding: 14px;
  display: flex;
  gap: 12px;
  align-items: center;
}
.card:hover {
  border-color: rgba(79, 70, 229, 0.35);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.10);
}
.avatar {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  border: 1px solid var(--border);
  background: var(--bg);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 900;
  flex: 0 0 auto;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.meta { min-width: 0; }
.name { font-weight: 900; color: var(--text-primary); }
.line {
  margin-top: 4px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badges {
  margin-top: 8px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.hint {
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}
.muted { color: var(--text-secondary); }
@media (max-width: 900px) {
  .grid { grid-template-columns: 1fr; }
  .search { width: 180px; }
}
</style>

