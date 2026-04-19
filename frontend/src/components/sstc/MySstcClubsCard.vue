<template>
  <div v-if="clubs.length > 0" class="my-sstc-card">
    <div class="my-sstc-head">
      <div>
        <h3 class="my-sstc-title">My SSTC Clubs</h3>
        <p class="my-sstc-sub">
          Jump into your Summit Stats Team Challenge clubs and seasons.
        </p>
      </div>
      <span v-if="clubs.length > 1" class="my-sstc-count">
        {{ clubs.length }} clubs
      </span>
    </div>

    <div class="my-sstc-grid">
      <button
        v-for="club in clubs"
        :key="`mysstc-${club.id}`"
        type="button"
        class="my-sstc-tile"
        :class="{ active: isCurrent(club) }"
        :disabled="busyId === club.id"
        @click="enterClub(club)"
      >
        <div class="my-sstc-logo">
          <img
            v-if="club.logoUrl && !failedLogos.has(club.id)"
            :src="club.logoUrl"
            :alt="`${club.name} logo`"
            @error="onLogoError(club.id)"
          />
          <div v-else class="my-sstc-logo-fallback" aria-hidden="true">
            {{ club.initials }}
          </div>
        </div>
        <div class="my-sstc-body">
          <div class="my-sstc-name" :title="club.name">{{ club.name }}</div>
          <div class="my-sstc-meta">
            <span
              class="my-sstc-role-pill"
              :class="`role-${club.clubRole || 'member'}`"
            >{{ formatRole(club.clubRole) }}</span>
            <span v-if="club.city || club.state" class="my-sstc-loc">
              · {{ [club.city, club.state].filter(Boolean).join(', ') }}
            </span>
          </div>
        </div>
        <div class="my-sstc-cta">
          {{ busyId === club.id ? 'Opening…' : (isCurrent(club) ? 'Current' : 'Open club') }}
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import {
  setSstcSurfaceChoice,
  setPreferredWorkAgencyId
} from '../../utils/sstcSurfaceChoice.js';

const props = defineProps({
  // Optional. If omitted, sources from agencyStore.userAgencies.
  agencies: { type: Array, default: null },
  hideWhenEmpty: { type: Boolean, default: true }
});

const router = useRouter();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const busyId = ref(null);
const failedLogos = ref(new Set());

const onLogoError = (id) => {
  const next = new Set(failedLogos.value);
  next.add(id);
  failedLogos.value = next;
};

const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

const resolveLogo = (a) => {
  const candidates = [
    a?.logo_path, a?.logoPath, a?.logo_url, a?.logoUrl,
    a?.icon_file_path, a?.iconFilePath, a?.icon_path, a?.iconPath,
    a?.icon_url, a?.iconUrl
  ];
  const raw = candidates.find((v) => String(v || '').trim());
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/uploads/') || s.startsWith('uploads/')) return toUploadsUrl(s);
  return s;
};

const isAffiliation = (a) => {
  const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
  return t === 'affiliation';
};

const sourceList = computed(() => {
  if (Array.isArray(props.agencies)) return props.agencies;
  return Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
});

const clubs = computed(() => {
  return (sourceList.value || [])
    .filter((a) => a && a.id && isAffiliation(a))
    .map((a) => ({
      id: Number(a.id),
      name: String(a.name || 'Club').trim(),
      slug: String(a.slug || '').trim(),
      parentSlug: String(a.parent_slug || a.parentSlug || 'sstc').trim() || 'sstc',
      city: a.city || null,
      state: a.state || null,
      clubRole: String(a.club_role || a.clubRole || 'member').toLowerCase(),
      logoUrl: resolveLogo(a),
      initials: initials(a.name),
      raw: a
    }));
});

const isCurrent = (club) => Number(agencyStore.currentAgency?.id || 0) === Number(club.id);

const formatRole = (r) => {
  const v = String(r || '').toLowerCase();
  if (v === 'manager') return 'Manager';
  if (v === 'assistant_manager') return 'Asst. manager';
  return 'Member';
};

const enterClub = async (club) => {
  if (!club?.id) return;
  busyId.value = club.id;
  try {
    // Remember the user's primary "work" agency so the back-pill can return them.
    // Don't overwrite if the user is already inside an SSTC club.
    const current = agencyStore.currentAgency;
    if (current && current.id !== club.id && !isAffiliation(current)) {
      setPreferredWorkAgencyId(current.id);
    }
    setSstcSurfaceChoice('summit');

    // Hydrate the chosen club into the store so the SSTC view sees full details.
    let hydrated = null;
    try {
      hydrated = await agencyStore.hydrateAgencyById(club.id);
    } catch (_) {
      hydrated = club.raw;
    }
    agencyStore.setCurrentAgency(hydrated || club.raw);

    const slug = club.parentSlug || 'sstc';
    await router.push({ path: `/${slug}/my_club_dashboard` });
  } finally {
    busyId.value = null;
  }
};

onMounted(async () => {
  if (Array.isArray(props.agencies) && props.agencies.length) return;
  const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  if (!list.length && authStore.user?.id) {
    try { await agencyStore.fetchUserAgencies(); } catch (_) { /* best-effort */ }
  }
});

// Re-clear logo error cache if club list changes
watch(clubs, () => { failedLogos.value = new Set(); });
</script>

<style scoped>
.my-sstc-card {
  background: linear-gradient(135deg, #1e3a8a 0%, #312e81 100%);
  border-radius: 14px;
  padding: 18px;
  color: white;
  box-shadow: 0 6px 18px rgba(30, 58, 138, 0.18);
  margin-bottom: 18px;
}

.my-sstc-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.my-sstc-title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.01em;
}
.my-sstc-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  max-width: 480px;
}
.my-sstc-count {
  background: rgba(255, 255, 255, 0.15);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.my-sstc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.my-sstc-tile {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 10px;
  align-items: center;
  text-align: left;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: white;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.12s ease, border-color 0.15s ease;
  font-family: inherit;
}
.my-sstc-tile:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.32);
  transform: translateY(-1px);
}
.my-sstc-tile.active {
  background: rgba(249, 115, 22, 0.22);
  border-color: rgba(249, 115, 22, 0.6);
}
.my-sstc-tile:disabled { opacity: 0.65; cursor: progress; }

.my-sstc-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
}
.my-sstc-logo img { width: 100%; height: 100%; object-fit: cover; }
.my-sstc-logo-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.92);
}

.my-sstc-body { min-width: 0; }
.my-sstc-name {
  font-weight: 700;
  font-size: 14px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.my-sstc-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.78);
  flex-wrap: wrap;
}
.my-sstc-role-pill {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.15);
}
.my-sstc-role-pill.role-manager {
  background: #ecfdf5;
  color: #166534;
}
.my-sstc-role-pill.role-assistant_manager {
  background: #fef3c7;
  color: #92400e;
}
.my-sstc-loc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.my-sstc-cta {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #fde68a;
  white-space: nowrap;
}
.my-sstc-tile.active .my-sstc-cta { color: #fef3c7; }
</style>
