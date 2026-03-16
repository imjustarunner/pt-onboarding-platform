<template>
  <div class="verify-club-manager-email" :style="{ background: loginBackground }">
    <div class="verify-card">
      <div v-if="displayLogoUrl && !logoError" class="verify-logo">
        <img :src="displayLogoUrl" alt="Logo" class="logo-image" @error="logoError = true" />
      </div>
      <div v-if="loading" class="status">Verifying…</div>
      <div v-else-if="error" class="status error">
        <p>{{ error }}</p>
        <router-link :to="loginPath" class="btn btn-primary">Go to Login</router-link>
      </div>
      <div v-else class="status success">
        <p>{{ message }}</p>
        <router-link :to="loginPath" class="btn btn-primary">Log in</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import { useBrandingStore } from '../store/branding';

const route = useRoute();
const brandingStore = useBrandingStore();
const loading = ref(true);
const error = ref('');
const message = ref('');
const loginTheme = ref(null);
const logoError = ref(false);

const token = computed(() => route.query?.token || route.params?.token || '');
const orgSlug = computed(() => route.params?.organizationSlug || null);
const loginPath = computed(() => (orgSlug.value ? `/${orgSlug.value}/login` : '/login'));

const displayLogoUrl = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.logoUrl) return loginTheme.value.agency.logoUrl;
  return brandingStore.displayLogoUrl;
});

const loginBackground = computed(() => {
  if (orgSlug.value && loginTheme.value?.agency?.themeSettings?.loginBackground) {
    return loginTheme.value.agency.themeSettings.loginBackground;
  }
  return brandingStore.loginBackground;
});

const fetchLoginTheme = async (portalUrl) => {
  try {
    const r = await api.get(`/agencies/portal/${portalUrl}/login-theme`, { skipGlobalLoading: true });
    loginTheme.value = r.data;
    brandingStore.setPortalThemeFromLoginTheme(r.data);
  } catch {
    // ignore
  }
};

onMounted(async () => {
  if (orgSlug.value) await fetchLoginTheme(orgSlug.value);
  else if (!brandingStore.portalHostPortalUrl) brandingStore.clearPortalTheme();

  if (!token.value) {
    error.value = 'Verification token is missing.';
    loading.value = false;
    return;
  }
  try {
    const r = await api.get('/auth/verify-club-manager-email', {
      params: { token: token.value, ...(orgSlug.value ? { portalSlug: orgSlug.value } : {}) },
      skipGlobalLoading: true
    });
    message.value = r.data?.message || 'Email verified. You can now log in and create your club.';
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Invalid or expired verification link.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.verify-club-manager-email {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-page, #f5f5f5);
}
.verify-logo {
  text-align: center;
  margin-bottom: 20px;
}
.verify-logo .logo-image {
  max-height: 80px;
  max-width: 200px;
  object-fit: contain;
}
.verify-card {
  width: 100%;
  max-width: 400px;
  padding: 32px;
  background: var(--bg, #fff);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}
.status {
  text-align: center;
  color: #333;
}
.status p {
  margin: 0 0 20px 0;
}
.status.success p {
  color: #2e7d32;
}
.status.error p {
  color: #c62828;
}
.btn {
  display: inline-block;
  padding: 12px 24px;
  background: var(--primary, #0066cc);
  color: #fff;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 500;
}
.btn:hover {
  opacity: 0.9;
}
</style>
