<template>
  <div
    v-if="visible"
    class="test-account-switcher"
    :class="{ compact }"
    @click.stop
  >
    <button
      ref="triggerRef"
      type="button"
      class="tas-trigger"
      :class="{ 'tas-trigger--nav': !compact }"
      :disabled="switching"
      :title="triggerTitle"
      :aria-expanded="menuOpen ? 'true' : 'false'"
      aria-haspopup="listbox"
      @click="toggleMenu"
    >
      <span class="tas-trigger-label">{{ triggerLabel }}</span>
      <span class="tas-caret" aria-hidden="true">▾</span>
    </button>

    <Teleport to="body">
      <div
        v-if="menuOpen"
        ref="menuRef"
        class="tas-menu tas-menu--teleported"
        :style="menuStyle"
        role="listbox"
        aria-label="Switch test account"
        @click.stop
      >
        <div class="tas-menu-title">Switch Test Account</div>
        <button
          v-if="returnAccount"
          type="button"
          class="tas-option tas-option-return"
          :disabled="switching"
          @click="returnToOriginal"
        >
          <span class="tas-option-label">Return to {{ returnAccount.label }}</span>
          <span class="tas-option-meta">{{ formatRole(returnAccount.role) }}</span>
        </button>
        <div v-if="loading" class="tas-empty">Loading…</div>
        <div v-else-if="loadError" class="tas-empty tas-error">{{ loadError }}</div>
        <div v-else-if="!accounts.length && !returnAccount" class="tas-empty">No other test accounts available.</div>
        <template v-for="group in groupedAccounts" :key="group.id">
          <div v-if="group.accounts.length" class="tas-group-label">{{ group.label }}</div>
          <button
            v-for="account in group.accounts"
            :key="account.userId"
            type="button"
            class="tas-option"
            role="option"
            :disabled="switching"
            @click="switchTo(account)"
          >
            <span class="tas-option-label">{{ account.label }}</span>
            <span class="tas-option-meta">{{ formatRole(account.role) }}</span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../services/api';
import { getDashboardRoute } from '../utils/router';
import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';

const props = defineProps({
  compact: { type: Boolean, default: false },
  /** When true, always try to load (e.g. school portal). Otherwise show for admin/super_admin immediately. */
  forceCheck: { type: Boolean, default: false }
});

const emit = defineEmits(['open-change']);

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const router = useRouter();

const triggerRef = ref(null);
const menuRef = ref(null);
const menuOpen = ref(false);
const loading = ref(false);
const switching = ref(false);
const loadError = ref('');
const accounts = ref([]);
const returnAccount = ref(null);
const canSwitch = ref(false);
const loadedOnce = ref(false);
const menuStyle = ref({});

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const isAdminLike = computed(() => role.value === 'admin' || role.value === 'super_admin' || role.value === 'superadmin');

const visible = computed(() => {
  if (!authStore.user?.id) return false;
  if (isAdminLike.value) return true;
  if (props.forceCheck) return canSwitch.value || !loadedOnce.value;
  return canSwitch.value;
});

const triggerLabel = computed(() => (props.compact ? 'Test' : 'Test Accounts'));
const triggerTitle = computed(() =>
  switching.value ? 'Switching account…' : 'Switch to a Demo Playground or Hogwarts test account'
);

const groupedAccounts = computed(() => {
  const hogwarts = accounts.value.filter((a) => String(a.accountGroup || 'demo') === 'hogwarts');
  const demo = accounts.value.filter((a) => String(a.accountGroup || 'demo') !== 'hogwarts');
  return [
    { id: 'hogwarts', label: 'Hogwarts (ITSCO)', accounts: hogwarts },
    { id: 'demo', label: 'Demo Playground', accounts: demo }
  ];
});

const formatRole = (value) => String(value || '').replace(/_/g, ' ');

const updateMenuPosition = () => {
  const trigger = triggerRef.value;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  menuStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 6)}px`,
    right: `${Math.max(12, Math.round(window.innerWidth - rect.right))}px`,
    left: 'auto',
    zIndex: 10200
  };
};

const setMenuOpen = (next) => {
  menuOpen.value = !!next;
  emit('open-change', menuOpen.value);
};

const closeMenu = () => {
  if (!menuOpen.value) return;
  setMenuOpen(false);
};

const onDocumentClick = (event) => {
  if (!menuOpen.value) return;
  const target = event?.target;
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) return;
  closeMenu();
};

const onViewportChange = () => {
  if (menuOpen.value) updateMenuPosition();
};

const loadAccounts = async () => {
  if (!authStore.user?.id) {
    accounts.value = [];
    returnAccount.value = null;
    canSwitch.value = false;
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const response = await api.get('/auth/test-accounts', { skipGlobalLoading: true });
    accounts.value = Array.isArray(response?.data?.accounts) ? response.data.accounts : [];
    returnAccount.value = response?.data?.returnAccount || null;
    canSwitch.value = response?.data?.canSwitch === true || accounts.value.length > 0 || !!returnAccount.value || isAdminLike.value;
  } catch (error) {
    const status = error?.response?.status;
    if (status === 403 || status === 404) {
      accounts.value = [];
    returnAccount.value = null;
      canSwitch.value = isAdminLike.value;
      if (!isAdminLike.value) loadError.value = '';
    } else {
      loadError.value = error?.response?.data?.error?.message || 'Failed to load test accounts.';
      canSwitch.value = isAdminLike.value;
    }
  } finally {
    loading.value = false;
    loadedOnce.value = true;
  }
};

const toggleMenu = async () => {
  if (switching.value) return;
  if (!menuOpen.value) {
    setMenuOpen(true);
    await loadAccounts();
    await nextTick();
    updateMenuPosition();
  } else {
    closeMenu();
  }
};

const resolvePostSwitchPath = (selectedAgency, nextRole, agencies = []) => {
  const r = String(nextRole || '').toLowerCase();
  const list = Array.isArray(agencies) ? agencies : [];
  const schoolOrg =
    list.find((a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'school')
    || null;

  if (r === 'school_staff') {
    const slug = String(schoolOrg?.slug || schoolOrg?.portal_url || selectedAgency?.slug || selectedAgency?.portal_url || '').trim();
    return slug ? `/${slug}/dashboard` : '/dashboard';
  }

  if (r === 'client_guardian') {
    const slug = String(schoolOrg?.slug || schoolOrg?.portal_url || selectedAgency?.slug || selectedAgency?.portal_url || '').trim();
    return slug ? `/${slug}/guardian` : '/guardian';
  }

  return getDashboardRoute();
};

const applySwitchPayload = (payload, fallbackRole) => {
  if (!payload.user) {
    throw new Error('Switch response missing user');
  }

  try {
    localStorage.removeItem('currentAgency');
    localStorage.removeItem('userAgencies');
  } catch {
    /* ignore */
  }

  authStore.setAuth(payload.token || null, payload.user, payload.sessionId || null);

  const agencies = payload.agencies || payload.user?.agencies || [];
  if (Array.isArray(agencies)) {
    agencyStore.applyLoginAgencies?.(agencies);
  }

  const nextRole = String(payload.user?.role || fallbackRole || '').toLowerCase();
  const schoolOrg = (agencies || []).find(
    (a) => String(a?.organization_type || a?.organizationType || '').toLowerCase() === 'school'
  );
  const preferred =
    ((nextRole === 'school_staff' || nextRole === 'client_guardian') && schoolOrg)
      ? schoolOrg
      : (payload.selectedAgency || null);
  if (preferred) {
    agencyStore.setCurrentAgency(preferred);
  }

  const nextPath = resolvePostSwitchPath(preferred, payload.user.role, agencies);
  closeMenu();
  window.location.assign(nextPath);
};

const switchTo = async (account) => {
  if (!account?.userId || switching.value) return;
  switching.value = true;
  loadError.value = '';
  try {
    const response = await api.post('/auth/test-accounts/switch', { userId: account.userId });
    applySwitchPayload(response?.data || {}, account.role);
  } catch (error) {
    loadError.value = error?.response?.data?.error?.message || error?.message || 'Failed to switch account.';
    switching.value = false;
  }
};

const returnToOriginal = async () => {
  if (switching.value) return;
  switching.value = true;
  loadError.value = '';
  try {
    const response = await api.post('/auth/test-accounts/return');
    applySwitchPayload(response?.data || {}, returnAccount.value?.role);
  } catch (error) {
    loadError.value = error?.response?.data?.error?.message || error?.message || 'Failed to return to original account.';
    switching.value = false;
  }
};

watch(
  () => authStore.user?.id,
  async (id) => {
    loadedOnce.value = false;
    accounts.value = [];
    returnAccount.value = null;
    canSwitch.value = false;
    closeMenu();
    if (!id) return;
    await loadAccounts();
  },
  { immediate: true }
);

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
  emit('open-change', false);
});

void router;
</script>

<style scoped>
.test-account-switcher {
  position: relative;
  display: inline-flex;
  align-items: center;
  z-index: 2;
}

.tas-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid rgba(79, 70, 229, 0.35);
  background: rgba(79, 70, 229, 0.08);
  color: #312e81;
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}

.tas-trigger--nav {
  border: none;
  background: transparent;
  color: var(--header-text-color, #fff);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 16px;
  font-weight: 400;
  font-family: var(--agency-font-family, var(--font-body));
}

.tas-trigger--nav:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.tas-trigger:disabled {
  opacity: 0.65;
  cursor: wait;
}

.tas-trigger:hover:not(:disabled):not(.tas-trigger--nav) {
  background: rgba(79, 70, 229, 0.14);
}

.tas-caret {
  font-size: 0.7rem;
  opacity: 0.8;
}

.tas-menu {
  min-width: 260px;
  max-width: min(360px, 90vw);
  max-height: min(70vh, 420px);
  overflow: auto;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  padding: 0.4rem;
}

.tas-menu-title {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  padding: 0.45rem 0.55rem 0.3rem;
}

.tas-group-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  padding: 0.55rem 0.55rem 0.15rem;
}
.tas-option-return {
  background: rgba(14, 165, 233, 0.08);
  margin-bottom: 0.2rem;
}
.tas-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.55rem 0.6rem;
  border-radius: 8px;
  cursor: pointer;
}

.tas-option:hover:not(:disabled),
.tas-option:focus-visible {
  background: rgba(79, 70, 229, 0.08);
  outline: none;
}

.tas-option:disabled {
  opacity: 0.6;
  cursor: wait;
}

.tas-option-label {
  font-size: 0.86rem;
  font-weight: 650;
  color: #0f172a;
}

.tas-option-meta {
  font-size: 0.72rem;
  color: #64748b;
}

.tas-empty {
  padding: 0.65rem 0.7rem;
  font-size: 0.8rem;
  color: #64748b;
}

.tas-error {
  color: #b91c1c;
}

.compact .tas-trigger {
  padding: 0.25rem 0.55rem;
  font-size: 0.72rem;
}
</style>
