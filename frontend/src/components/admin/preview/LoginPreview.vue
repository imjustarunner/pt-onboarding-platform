<template>
  <div class="login-preview" ref="previewContainer">
    <PreviewBrandingProvider :agency-id="agencyId">
      <div class="login-container">
        <div class="login-card">
          <div class="login-logo">
            <BrandingLogo size="xlarge" :logo-url="agencyLogoUrl" />
          </div>
          <h2>{{ displayTitle }}</h2>
          <p class="subtitle">Sign in to continue</p>
          
          <form @submit.prevent="handlePreviewSubmit" class="login-form">
            <div class="form-group">
              <label for="preview-email">Email</label>
              <input
                id="preview-email"
                type="email"
                value="preview@example.com"
                disabled
                placeholder="Enter your email"
              />
            </div>
            
            <div class="form-group">
              <label for="preview-password">Password</label>
              <input
                id="preview-password"
                type="password"
                value="••••••••"
                disabled
                placeholder="Enter your password"
              />
            </div>
            
            <button type="submit" class="btn btn-primary" disabled>
              Sign In
            </button>
          </form>
          
          <div class="login-help">
            <a href="#" class="help-link">Forgot Password?</a>
            <span class="help-separator">|</span>
            <a href="#" class="help-link">Forgot Username?</a>
          </div>
        </div>
      </div>
    </PreviewBrandingProvider>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useBrandingStore } from '../../../store/branding';
import { useAgencyStore } from '../../../store/agency';
import PreviewBrandingProvider from './PreviewBrandingProvider.vue';
import BrandingLogo from '../../../components/BrandingLogo.vue';
import api from '../../../services/api';
import { toUploadsUrl } from '../../../utils/uploadsUrl';

const props = defineProps({
  agencyId: {
    type: Number,
    required: true
  }
});

const brandingStore = useBrandingStore();
const agencyStore = useAgencyStore();
const previewContainer = ref(null);
const loginTheme = ref(null);

const displayTitle = computed(() => {
  const agency = agencyStore.currentAgency;
  const agencyName = agency?.name || brandingStore.platformBranding?.organization_name || '';
  const term = brandingStore.peopleOpsTerm || 'People Operations';
  if (!agencyName) {
    return `${term} Platform`;
  }
  return `${agencyName} ${term} Platform`;
});

const agencyLogoUrl = computed(() => {
  const agency = agencyStore.currentAgency;
  if (agency?.logo_path) return toUploadsUrl(agency.logo_path);
  return agency?.logo_url || null;
});

const handlePreviewSubmit = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

const fetchLoginTheme = async () => {
  try {
    const agency = agencyStore.currentAgency;
    if (agency?.portal_url) {
      const response = await api.get(`/agencies/portal/${agency.portal_url}/login-theme`);
      loginTheme.value = response.data;
    }
  } catch (error) {
    console.error('Failed to fetch login theme for preview:', error);
  }
};

onMounted(async () => {
  // Fetch agency data if not already set
  if (!agencyStore.currentAgency || agencyStore.currentAgency.id !== props.agencyId) {
    try {
      const response = await api.get(`/agencies/${props.agencyId}`);
      agencyStore.setCurrentAgency(response.data);
    } catch (error) {
      console.error('Failed to fetch agency for preview:', error);
    }
  }
  
  // Fetch platform branding
  await brandingStore.fetchPlatformBranding();
  
  // Fetch login theme
  await fetchLoginTheme();
  
  // Disable interactions
  if (previewContainer.value) {
    previewContainer.value.style.pointerEvents = 'none';
  }
});

watch(() => agencyStore.currentAgency, async () => {
  if (agencyStore.currentAgency?.id === props.agencyId) {
    await fetchLoginTheme();
  }
});
</script>

<style scoped>
.login-preview {
  pointer-events: none;
  user-select: none;
}

.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 500px;
  background: var(--agency-login-background, linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%));
}

.login-card {
  background: white;
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  width: 100%;
  max-width: 400px;
}

.login-logo {
  margin-bottom: 30px;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.login-logo :deep(.logo-image) {
  height: 180px !important;
  max-height: 180px !important;
  width: auto;
  object-fit: contain;
}

.login-card h2 {
  text-align: center;
  margin-bottom: 10px;
  color: var(--primary);
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: 28px;
}

.subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 30px;
}

.login-form {
  margin-bottom: 20px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-help {
  text-align: center;
  margin: 15px 0;
  font-size: 14px;
}

.help-link {
  color: var(--primary);
  text-decoration: none;
  cursor: default;
  pointer-events: none;
}

.help-separator {
  margin: 0 10px;
  color: var(--border, #ccc);
}
</style>
