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
      <div class="legend" aria-label="Availability legend">
        <span class="legend-item">
          <span class="day-pill green" aria-hidden="true"> </span>
          <span class="legend-text">2+ slots left</span>
        </span>
        <span class="legend-item">
          <span class="day-pill yellow" aria-hidden="true"> </span>
          <span class="legend-text">1 slot left</span>
        </span>
        <span class="legend-item">
          <span class="day-pill red" aria-hidden="true"> </span>
          <span class="legend-text">Full</span>
        </span>
      </div>
      <div v-if="loading" class="muted">Loading providers…</div>
      <div v-else-if="filtered.length === 0" class="muted">No providers found.</div>
      <div v-else class="grid">
        <div
          v-for="p in filtered"
          :key="p.provider_user_id"
          class="card"
          role="button"
          tabindex="0"
          @click="$emit('open-provider', p.provider_user_id)"
          @keydown.enter.prevent="$emit('open-provider', p.provider_user_id)"
          @keydown.space.prevent="$emit('open-provider', p.provider_user_id)"
        >
          <div class="avatar" aria-hidden="true">
            <img v-if="providerPhotoUrl(p)" :src="providerPhotoUrl(p)" alt="" class="avatar-img" />
            <span v-else>{{ initialsFor(p) }}</span>
          </div>
          <div class="meta">
            <div class="name-row">
              <div class="name">{{ p.first_name }} {{ p.last_name }}</div>
              <button class="btn btn-secondary btn-sm msg-btn" type="button" @click.stop="$emit('message-provider', p.provider_user_id)">
                Message
              </button>
            </div>
            <div v-if="dayBadgesFor(p).length" class="day-badges" aria-label="Availability by day">
              <span
                v-for="b in dayBadgesFor(p)"
                :key="b.key"
                class="day-pill"
                :class="b.color"
              >
                {{ b.label }}
              </span>
            </div>
            <div v-if="p.email" class="line">{{ p.email }}</div>
            <div v-if="p.school_info_blurb" class="blurb">{{ p.school_info_blurb }}</div>
            <div class="badges">
              <span class="badge badge-secondary">{{ acceptanceStatusText(p) }}</span>
              <span v-if="activeDaysFor(p).length" class="badge badge-secondary">
                {{ activeDaysFor(p).join(', ') }}
              </span>
            </div>
            <div class="hint">Click to open profile</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { toUploadsUrl } from '../../../utils/uploadsUrl';

const props = defineProps({
  providers: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
});

defineEmits(['open-provider', 'message-provider']);

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

const providerPhotoUrl = (p) => {
  return toUploadsUrl(p?.profile_photo_url || null);
};

const remainingForAssignment = (a) => {
  const total = Number(a?.slots_total);
  const usedRaw = a?.slots_used ?? a?.slots_used_calculated ?? null;
  const used = Number(usedRaw);
  const availRaw = a?.slots_available_calculated ?? a?.slots_available ?? null;
  const avail = Number(availRaw);
  const hasTotal = Number.isFinite(total) && total > 0;
  const usedFromAvail = hasTotal && Number.isFinite(avail) ? Math.max(0, total - avail) : null;
  const usedEffective = Number.isFinite(used) ? used : usedFromAvail;
  return hasTotal && usedEffective !== null ? total - usedEffective : null;
};

const isEffectivelyFull = (p) => {
  const list = Array.isArray(p?.assignments) ? p.assignments : [];
  const active = list.filter((a) => a && a.is_active);
  if (active.length === 0) return false;
  for (const a of active) {
    const remaining = remainingForAssignment(a);
    if (remaining !== null && remaining > 0) return false;
  }
  return true;
};

const acceptanceStatusText = (p) => {
  if (p?.accepting_new_clients === false) return 'Not accepting';
  if (isEffectivelyFull(p)) return 'Not currently accepting';
  return 'Accepting';
};

const dayBadgesFor = (p) => {
  const list = Array.isArray(p?.assignments) ? p.assignments : [];
  const active = list.filter((a) => a && a.is_active);
  const short = (d) => {
    const s = String(d || '');
    return s === 'Thursday' ? 'Thu' : s.slice(0, 3);
  };
  const badgeFor = (a) => {
    const remaining = remainingForAssignment(a);
    let color = 'green';
    if (remaining !== null) {
      if (remaining <= 0) color = 'red'; // full (or overbooked)
      else if (remaining === 1) color = 'yellow'; // 1 slot left
      else color = 'green';
    }
    return { key: `${a.day_of_week}-${a.provider_user_id || ''}`, label: short(a.day_of_week), color };
  };
  return active.map(badgeFor);
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
.legend {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend-text { line-height: 1; }
.legend .day-pill {
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 999px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 16px;
}
.card {
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: white;
  padding: 18px;
  display: flex;
  gap: 18px;
  align-items: flex-start;
  cursor: pointer;
}
.card:hover {
  border-color: rgba(79, 70, 229, 0.35);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.10);
}
.avatar {
  width: 160px;
  height: 160px;
  border-radius: 28px;
  border: 1px solid var(--border);
  background: var(--bg);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 900;
  flex: 0 0 auto;
  font-size: 34px;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.meta { min-width: 0; }
.name-row {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}
.msg-btn {
  flex: 0 0 auto;
}
.name {
  font-weight: 950;
  color: var(--text-primary);
  font-size: 18px;
  line-height: 1.15;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.day-badges {
  margin-top: 6px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.day-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-primary);
}
.day-pill.green {
  border-color: rgba(16, 185, 129, 0.55);
  background: rgba(16, 185, 129, 0.08);
}
.day-pill.yellow {
  border-color: rgba(245, 158, 11, 0.65);
  background: rgba(245, 158, 11, 0.10);
}
.day-pill.red {
  border-color: rgba(239, 68, 68, 0.65);
  background: rgba(239, 68, 68, 0.10);
}
.line {
  margin-top: 4px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.blurb {
  margin-top: 8px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
  .avatar {
    width: 120px;
    height: 120px;
    border-radius: 24px;
    font-size: 28px;
  }
}
</style>

