<template>
  <div class="club-quick-actions" :class="{ 'club-quick-actions--compact': props.compact }">
    <h2>Quick Actions</h2>
    <div class="actions-grid">

      <!-- Add Member -->
      <button type="button" class="action-card" @click="$emit('add-member')">
        <div class="action-icon-wrap">
          <img v-if="addMemberIconUrl" :src="addMemberIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">👤</span>
        </div>
        <div class="action-content">
          <h3>Add New Member</h3>
          <p>Check if their email exists and add them to your club.</p>
        </div>
      </button>

      <!-- Season Management -->
      <router-link :to="seasonManagementTo" class="action-card action-card-link">
        <div class="action-icon-wrap">
          <img v-if="addSeasonIconUrl" :src="addSeasonIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">🏁</span>
        </div>
        <div class="action-content">
          <h3>Season Management</h3>
          <p>Create your first season, edit existing ones, and manage season rules from one place.</p>
        </div>
      </router-link>

      <!-- Public Club Page -->
      <div class="action-card action-card--split" ref="publicCardRef">
        <div class="action-icon-wrap">
          <span class="action-icon-placeholder">🌐</span>
        </div>
        <div class="action-content">
          <h3>Public Club Page</h3>
          <p>Your club's public landing page with stats, records, and a join button.</p>
        </div>
        <div class="action-split-btns">
          <a :href="publicPageUrl" target="_blank" rel="noopener" class="split-btn split-btn--primary">
            Go to Site
          </a>
          <button type="button" class="split-btn split-btn--ghost" @click.stop="copyPublicLink">
            {{ copiedPublic ? '✓ Copied!' : 'Copy Link' }}
          </button>
        </div>
      </div>

      <!-- Invite New Member -->
      <div class="action-card action-card--split">
        <div class="action-icon-wrap">
          <span class="action-icon-placeholder">📨</span>
        </div>
        <div class="action-content">
          <h3>Invite New Member</h3>
          <p>Share a direct sign-up link — anyone with it can apply to join your club.</p>
        </div>
        <div class="action-split-btns">
          <button type="button" class="split-btn split-btn--primary" @click.stop="copyInviteLink">
            {{ copiedInvite ? '✓ Copied!' : 'Copy Invite Link' }}
          </button>
        </div>
      </div>

      <!-- Club Settings -->
      <router-link :to="settingsTo" class="action-card action-card-link">
        <div class="action-icon-wrap">
          <img v-if="settingsIconUrl" :src="settingsIconUrl" alt="" class="action-icon-img" />
          <span v-else class="action-icon-placeholder">⚙️</span>
        </div>
        <div class="action-content">
          <h3>Club Settings</h3>
          <p>Configure your club name, branding, and challenge management.</p>
        </div>
      </router-link>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';

const props = defineProps({
  orgSlug: { type: String, default: '' },
  agency:  { type: Object, default: null },
  compact: { type: Boolean, default: false }
});

defineEmits(['add-member']);

const brandingStore = useBrandingStore();
const publicSlug = ref('');

// ── Icons ──────────────────────────────────────────────────────────
const addMemberIconUrl = computed(() => brandingStore.getClubQuickActionIconUrl('add_member', props.agency));
const addSeasonIconUrl = computed(() => brandingStore.getClubQuickActionIconUrl('add_season', props.agency));
const settingsIconUrl  = computed(() => brandingStore.getClubQuickActionIconUrl('settings', props.agency));

// ── Routes ────────────────────────────────────────────────────────
const settingsTo = computed(() => {
  const slug = props.orgSlug;
  return slug ? `/${slug}/club/settings` : '/admin/settings';
});

const seasonManagementTo = computed(() => {
  const slug = props.orgSlug;
  return slug ? `/${slug}/club/seasons` : `/${String(import.meta.env.VITE_NATIVE_APP_ORG_SLUG || 'ssc').trim().toLowerCase()}/home`;
});

// Public page URL: /:orgSlug/clubs/:clubId
const publicPageUrl = computed(() => {
  const slug = props.orgSlug;
  const id = props.agency?.id;
  const ref = String(publicSlug.value || '').trim() || String(id || '').trim();
  if (!slug || !ref) return '#';
  return `${window.location.origin}/${slug}/clubs/${ref}`;
});

// Invite link: direct join/signup page /:orgSlug/join?club=:clubId
const invitePageUrl = computed(() => {
  const slug = props.orgSlug;
  const id = props.agency?.id;
  if (!slug || !id) return '#';
  return `${window.location.origin}/${slug}/join?club=${id}`;
});

// ── Copy helpers ──────────────────────────────────────────────────
const copiedPublic  = ref(false);
const copiedInvite  = ref(false);

const copyToClipboard = async (text, flagRef) => {
  try {
    await navigator.clipboard.writeText(text);
    flagRef.value = true;
    setTimeout(() => { flagRef.value = false; }, 2500);
  } catch {
    // Fallback for browsers that block clipboard without user gesture
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    flagRef.value = true;
    setTimeout(() => { flagRef.value = false; }, 2500);
  }
};

const copyPublicLink = () => copyToClipboard(publicPageUrl.value, copiedPublic);
const copyInviteLink = () => copyToClipboard(invitePageUrl.value, copiedInvite);

const loadPublicSlug = async () => {
  const clubId = Number(props.agency?.id || 0);
  if (!clubId) {
    publicSlug.value = '';
    return;
  }
  try {
    const { data } = await api.get(`/summit-stats/clubs/${clubId}/public-page-config`, { skipGlobalLoading: true });
    publicSlug.value = String(data?.config?.publicSlug || '').trim().toLowerCase();
  } catch {
    publicSlug.value = '';
  }
};

onMounted(() => {
  void loadPublicSlug();
});

watch(() => props.agency?.id, () => {
  void loadPublicSlug();
});
</script>

<style scoped>
.club-quick-actions h2 {
  margin: 0 0 24px 0;
  font-size: 1.125rem;
}

.club-quick-actions--compact h2 {
  margin-bottom: 12px;
  font-size: 1rem;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.club-quick-actions--compact .actions-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

/* ── Base card ───────────────────────────────────────────────── */
.action-card {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}

.club-quick-actions--compact .action-card {
  padding: 14px;
  border-radius: 10px;
  gap: 10px;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.action-card-link {
  text-decoration: none;
  color: inherit;
}

/* ── Split-button card variant ───────────────────────────────── */
.action-card--split {
  flex-wrap: wrap;
  cursor: default;
  align-items: flex-start;
}
.action-card--split:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--primary);
}

.action-split-btns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.club-quick-actions--compact .action-split-btns {
  margin-top: 6px;
  padding-top: 8px;
}

.split-btn {
  flex: 1;
  min-width: 100px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, color 0.15s;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  line-height: 1.3;
}

.club-quick-actions--compact .split-btn {
  padding: 6px 10px;
  font-size: 12px;
}
.split-btn--primary {
  background: var(--primary, #2563eb);
  color: white;
}
.split-btn--primary:hover {
  background: var(--primary-dark, #1d4ed8);
}
.split-btn--ghost {
  background: var(--bg-alt, #f1f5f9);
  color: var(--text-primary, #0f172a);
  border: 1px solid var(--border);
}
.split-btn--ghost:hover {
  background: var(--bg-muted, #e2e8f0);
}

/* ── Shared icon / text styles ───────────────────────────────── */
.action-icon-wrap { flex-shrink: 0; }

.action-icon-placeholder {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: var(--bg-alt);
  border-radius: 10px;
}

.club-quick-actions--compact .action-icon-placeholder {
  width: 40px;
  height: 40px;
  font-size: 20px;
  border-radius: 8px;
}

.action-icon-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  border-radius: 10px;
}

.club-quick-actions--compact .action-icon-img {
  width: 40px;
  height: 40px;
  border-radius: 8px;
}

.action-content {
  flex: 1;
  min-width: 0;
}

.action-content h3 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 800;
}

.club-quick-actions--compact .action-content h3 {
  margin-bottom: 4px;
  font-size: 0.92rem;
}

.action-content p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.club-quick-actions--compact .action-content p {
  font-size: 12px;
  line-height: 1.3;
}

/* ── Responsive ──────────────────────────────────────────────── */
@media (max-width: 768px) {
  .club-quick-actions h2 {
    margin-bottom: 14px;
    font-size: 1.05rem;
  }

  .actions-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .action-card {
    padding: 14px 12px;
    gap: 12px;
    border-radius: 10px;
  }

  .action-icon-placeholder,
  .action-icon-img {
    width: 40px;
    height: 40px;
    font-size: 20px;
    border-radius: 8px;
  }

  .action-content h3 {
    font-size: 0.95rem;
    margin-bottom: 4px;
  }

  .action-content p {
    font-size: 12px;
    line-height: 1.3;
  }

  .split-btn {
    font-size: 12px;
    padding: 6px 10px;
  }
}
</style>
