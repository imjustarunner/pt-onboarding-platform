<template>
  <div v-if="tenants.length" class="tcs" :class="{ compact, 'tcs--platform': platformTheme }">
    <div class="tcs-scroller" role="list" :aria-label="ariaLabel">
      <button
        v-if="allowAll && tenants.length > 1"
        type="button"
        class="tcs-chip"
        :class="{ active: !selectedId }"
        role="listitem"
        title="All tenants"
        @click="selectAll"
      >
        <div class="tcs-logo tcs-logo-all" aria-hidden="true">All</div>
        <span class="tcs-name">{{ allLabel }}</span>
        <div class="tcs-counts">
          <span class="tcs-count open" title="Open tickets">{{ formatCount(totals.open) }}</span>
          <span class="tcs-count mine" title="My tickets">{{ formatCount(totals.mine) }}</span>
        </div>
      </button>

      <button
        v-for="t in tenants"
        :key="t.id"
        type="button"
        class="tcs-chip"
        :class="{ active: selectedId === Number(t.id) }"
        role="listitem"
        :style="chipStyle(t)"
        :title="t.name"
        @click="selectTenant(t)"
      >
        <div class="tcs-logo" :style="logoWrapStyle(t)">
          <img
            v-if="logoUrl(t) && !isLogoBroken(t.id)"
            :src="logoUrl(t)"
            alt=""
            class="tcs-logo-img"
            @error="markLogoBroken(t.id)"
          />
          <span v-else class="tcs-initials">{{ initials(t) }}</span>
        </div>
        <span class="tcs-name">{{ t.name }}</span>
        <div class="tcs-counts">
          <span class="tcs-count open" title="Open tickets">{{ formatCount(countFor(t).open) }}</span>
          <span class="tcs-count mine" title="My tickets">{{ formatCount(countFor(t).mine) }}</span>
        </div>
      </button>
    </div>
    <div class="tcs-legend" aria-hidden="true">
      <span><i class="swatch open" /> Open</span>
      <span><i class="swatch mine" /> Mine</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { membershipPrimaryColor, resolveMembershipLogoUrl } from '../utils/peerTenantBrand';

const props = defineProps({
  tenants: { type: Array, default: () => [] },
  /** Selected agency id, or null/'' for All */
  modelValue: { type: [Number, String, null], default: null },
  /** Map or list: { agencyId, open, mine } */
  counts: { type: [Object, Array], default: () => ({}) },
  allowAll: { type: Boolean, default: true },
  allLabel: { type: String, default: 'All tenants' },
  compact: { type: Boolean, default: false },
  ariaLabel: { type: String, default: 'Switch tenant' },
  /** Plot Twist HQ dark chip styling */
  platformTheme: { type: Boolean, default: false }
});

const brokenLogoIds = ref({});

function markLogoBroken(id) {
  const n = Number(id);
  if (!n || brokenLogoIds.value[n]) return;
  brokenLogoIds.value = { ...brokenLogoIds.value, [n]: true };
}

function isLogoBroken(id) {
  return !!brokenLogoIds.value[Number(id)];
}

const emit = defineEmits(['update:modelValue', 'select']);

const selectedId = computed(() => {
  const n = Number(props.modelValue);
  return Number.isFinite(n) && n > 0 ? n : null;
});

const countsMap = computed(() => {
  const map = new Map();
  const raw = props.counts;
  if (Array.isArray(raw)) {
    for (const row of raw) {
      const id = Number(row?.agencyId ?? row?.agency_id ?? row?.id);
      if (!id) continue;
      map.set(id, {
        open: Number(row?.open || 0),
        mine: Number(row?.mine || 0)
      });
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(k);
      if (!id) continue;
      if (v && typeof v === 'object') {
        map.set(id, { open: Number(v.open || 0), mine: Number(v.mine || 0) });
      } else {
        map.set(id, { open: Number(v || 0), mine: 0 });
      }
    }
  }
  return map;
});

const totals = computed(() => {
  let open = 0;
  let mine = 0;
  for (const t of props.tenants || []) {
    const c = countsMap.value.get(Number(t.id)) || { open: 0, mine: 0 };
    open += c.open;
    mine += c.mine;
  }
  return { open, mine };
});

function countFor(t) {
  return countsMap.value.get(Number(t.id)) || { open: 0, mine: 0 };
}

function formatCount(n) {
  const v = Number(n || 0);
  if (v > 99) return '99+';
  return String(v);
}

function logoUrl(t) {
  return resolveMembershipLogoUrl(t);
}

function primary(t) {
  return membershipPrimaryColor(t) || '#64748b';
}

function initials(t) {
  const name = String(t?.name || '').trim();
  if (!name) return '?';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function chipStyle(t) {
  const c = primary(t);
  return { '--tcs-tint': c };
}

function logoWrapStyle(t) {
  if (logoUrl(t)) return { borderColor: primary(t) };
  return {
    borderColor: primary(t),
    background: `linear-gradient(135deg, ${primary(t)}, ${primary(t)}cc)`
  };
}

function selectTenant(t) {
  const id = Number(t?.id);
  if (!id) return;
  emit('update:modelValue', id);
  emit('select', t);
}

function selectAll() {
  emit('update:modelValue', null);
  emit('select', null);
}
</script>

<style scoped>
.tcs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.tcs-scroller {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 6px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.tcs-chip {
  flex: 0 0 auto;
  scroll-snap-align: start;
  width: 104px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 6px 7px;
  border: 2px solid color-mix(in srgb, var(--tcs-tint, #94a3b8) 55%, #e2e8f0);
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.tcs-chip:hover {
  border-color: var(--tcs-tint, #64748b);
  background: color-mix(in srgb, var(--tcs-tint, #64748b) 6%, #fff);
}
.tcs-chip.active {
  border-color: var(--tcs-tint, #1e293b);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tcs-tint, #64748b) 28%, transparent);
  background: color-mix(in srgb, var(--tcs-tint, #64748b) 10%, #fff);
}
.tcs-chip:not([style*='--tcs-tint']).active {
  border-color: #1e293b;
}
.tcs-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 2px solid #e2e8f0;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: #f8fafc;
}
.tcs-logo-all {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #475569;
  background: #f1f5f9;
}
.tcs-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #fff;
}
.tcs-initials {
  font-size: 12px;
  font-weight: 800;
  color: #fff;
}
.tcs-name {
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 100%;
  min-height: 2.4em;
  color: #0f172a;
}
.tcs-counts {
  display: flex;
  gap: 4px;
  width: 100%;
  justify-content: center;
}
.tcs-count {
  min-width: 1.5rem;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.4;
  text-align: center;
}
.tcs-count.open {
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}
.tcs-count.mine {
  background: rgba(16, 185, 129, 0.14);
  color: #047857;
}
.tcs-legend {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
  padding-left: 2px;
}
.tcs-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.swatch {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}
.swatch.open { background: #2563eb; }
.swatch.mine { background: #10b981; }

.tcs.compact .tcs-chip {
  width: 92px;
  padding: 6px 5px;
}
.tcs.compact .tcs-logo {
  width: 34px;
  height: 34px;
}
.tcs.compact .tcs-legend {
  display: none;
}

/* Plot Twist HQ dark chips */
.tcs--platform .tcs-chip {
  background: #111827;
  border-color: color-mix(in srgb, var(--tcs-tint, #94a3b8) 45%, rgba(148, 163, 184, 0.25));
  color: #e5e7eb;
}
.tcs--platform .tcs-chip:hover {
  background: color-mix(in srgb, var(--tcs-tint, #8b5cf6) 14%, #0f172a);
}
.tcs--platform .tcs-chip.active {
  background: color-mix(in srgb, var(--tcs-tint, #8b5cf6) 18%, #0f172a);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tcs-tint, #8b5cf6) 35%, transparent);
}
.tcs--platform .tcs-name {
  color: #e5e7eb;
}
.tcs--platform .tcs-logo {
  background: #0b1220;
  border-color: rgba(148, 163, 184, 0.28);
}
.tcs--platform .tcs-logo-all {
  color: #cbd5e1;
  background: #0b1220;
}
.tcs--platform .tcs-logo-img {
  background: #0b1220;
}
.tcs--platform .tcs-legend {
  color: #94a3b8;
}
.tcs--platform .tcs-count.open {
  background: rgba(56, 189, 248, 0.16);
  color: #7dd3fc;
}
.tcs--platform .tcs-count.mine {
  background: rgba(52, 211, 153, 0.16);
  color: #6ee7b7;
}
</style>
