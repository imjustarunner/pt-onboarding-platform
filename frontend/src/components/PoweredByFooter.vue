<template>
  <div v-if="showFooter" class="powered-by-footer">
    <div v-if="showPoweredBy && (platformOrgName || platformLogoUrl)" class="powered-by-content">
      <span class="powered-by-text">Platform powered by</span>
      <img
        v-if="platformLogoUrl"
        :src="platformLogoUrl"
        :alt="platformOrgName || 'Platform'"
        class="powered-by-logo"
        @error="handleLogoError"
      />
      <span v-if="platformOrgName" class="powered-by-name">{{ platformOrgName }}</span>
    </div>
    <div v-if="privacyPolicyUrl || termsUrl" class="legal-links">
      <a v-if="privacyPolicyUrl" :href="privacyPolicyUrl" target="_blank" rel="noopener noreferrer" class="legal-link">Privacy Policy</a>
      <span v-if="privacyPolicyUrl && termsUrl" class="legal-sep">|</span>
      <a v-if="termsUrl" :href="termsUrl" target="_blank" rel="noopener noreferrer" class="legal-link">Terms</a>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useBrandingStore } from '../store/branding';
import { toUploadsUrl } from '../utils/uploadsUrl';

const brandingStore = useBrandingStore();
const showPoweredBy = computed(() => brandingStore.showPoweredBy);

// Show footer when we have powered-by content OR legal links (e.g. on login page)
const privacyPolicyUrl = computed(() => brandingStore.platformBranding?.privacy_policy_url?.trim() || null);
const termsUrl = computed(() => brandingStore.platformBranding?.terms_url?.trim() || null);
const showFooter = computed(() => (showPoweredBy.value && (platformOrgName.value || platformLogoUrl.value)) || privacyPolicyUrl.value || termsUrl.value);

// Get platform organization name and logo from branding store
const platformOrgName = computed(() => {
  return brandingStore.platformBranding?.organization_name?.trim() || '';
});

const platformLogoUrl = computed(() => {
  // Priority 1: Platform organization_logo_url (if set)
  if (brandingStore.platformBranding?.organization_logo_url) {
    return brandingStore.platformBranding.organization_logo_url;
  }
  // Priority 2: Platform organization_logo_path (from icon library)
  if (brandingStore.platformBranding?.organization_logo_path) {
    let iconPath = brandingStore.platformBranding.organization_logo_path;
    if (iconPath.startsWith('/uploads/')) {
      iconPath = iconPath.substring('/uploads/'.length);
    } else if (iconPath.startsWith('/')) {
      iconPath = iconPath.substring(1);
    }
    return toUploadsUrl(iconPath);
  }
  // Priority 3: Fallback to PlotTwistCo logo (only if organization name is set)
  if (platformOrgName.value) {
    return brandingStore.plotTwistCoLogoUrl;
  }
  return null;
});

const handleLogoError = (event) => {
  // Hide logo if it fails to load, show text only
  event.target.style.display = 'none';
};
</script>

<style scoped>
.powered-by-footer {
  padding: 16px 24px;
  text-align: center;
  border-top: 1px solid var(--border);
  background: var(--bg-alt, #f8fafc);
  margin-top: auto;
}

.powered-by-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary, #64748b);
  font-size: 12px;
  font-weight: 500;
}

.powered-by-text {
  color: var(--text-secondary, #64748b);
}

.powered-by-logo {
  height: 16px;
  width: auto;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.powered-by-logo:hover {
  opacity: 1;
}

.powered-by-name {
  color: var(--text-secondary, #64748b);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.legal-links {
  margin-top: 8px;
  font-size: 12px;
}

.legal-links:first-child {
  margin-top: 0;
}

.legal-link {
  color: var(--text-secondary, #64748b);
  text-decoration: none;
}

.legal-link:hover {
  text-decoration: underline;
  color: var(--text-primary, #334155);
}

.legal-sep {
  margin: 0 8px;
  color: var(--text-secondary, #94a3b8);
}
</style>

