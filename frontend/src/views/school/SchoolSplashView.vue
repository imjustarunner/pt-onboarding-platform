<template>
  <div class="school-splash" :style="{ background: loginBackground }">
    <div class="splash-container">
      <!-- Organization Branding Header -->
      <div class="splash-header">
        <BrandingLogo size="large" class="splash-logo" />
        <h1 v-if="organizationName" class="organization-name">{{ organizationName }}</h1>

        <div v-if="schoolName || schoolLogoUrl" class="school-affiliation">
          <div class="school-affiliation-label">School</div>
          <div class="school-affiliation-row">
            <img v-if="schoolLogoUrl" :src="schoolLogoUrl" class="school-logo" :alt="schoolName || 'School logo'" />
            <div v-if="schoolName" class="school-name">{{ schoolName }}</div>
          </div>
        </div>
      </div>

      <!-- Three Action Options -->
      <div class="action-cards">
        <!-- Option 1: Digital Link -->
        <div class="action-card" @click="handleDigitalLink">
          <div class="action-icon">🔗</div>
          <h3>Digital Link</h3>
          <p>New Client Intake</p>
          <span class="action-note">Coming soon</span>
        </div>

        <!-- Option 2: Upload Referral Packet -->
        <div class="action-card" @click="showUploadModal = true">
          <div class="action-icon">📤</div>
          <h3>Upload New Referral Packet</h3>
          <p>No login required</p>
        </div>

        <!-- Option 3: School Staff Login -->
        <div class="action-card" @click="showLoginModal = true">
          <div class="action-icon">🔐</div>
          <h3>School Staff Login</h3>
          <p>Access your portal</p>
        </div>
      </div>
    </div>

    <!-- Referral Upload Modal -->
    <ReferralUpload
      v-if="showUploadModal"
      :organization-slug="organizationSlug"
      @close="showUploadModal = false"
      @uploaded="handleUploadSuccess"
    />

    <!-- Staff Login Modal -->
    <StaffLoginModal
      v-if="showLoginModal"
      :organization-slug="organizationSlug"
      @close="showLoginModal = false"
      @login-success="handleLoginSuccess"
    />

    <PoweredByFooter />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import { useBrandingStore } from '../../store/branding';
import api from '../../services/api';
import BrandingLogo from '../../components/BrandingLogo.vue';
import ReferralUpload from '../../components/school/ReferralUpload.vue';
import StaffLoginModal from '../../components/school/StaffLoginModal.vue';
import PoweredByFooter from '../../components/PoweredByFooter.vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';

const route = useRoute();
const router = useRouter();
const organizationStore = useOrganizationStore();
const brandingStore = useBrandingStore();

const showUploadModal = ref(false);
const showLoginModal = ref(false);

const organizationSlug = computed(() => route.params.organizationSlug);

const organizationName = computed(() => {
  return organizationStore.organizationContext?.name || 
         organizationStore.currentOrganization?.name || 
         brandingStore.displayName;
});

const loginBackground = computed(() => brandingStore.loginBackground);

const schoolName = computed(() => {
  const org = organizationStore.currentOrganization || organizationStore.organizationContext || null;
  return org?.name || null;
});

const schoolLogoUrl = computed(() => {
  const org = organizationStore.currentOrganization || organizationStore.organizationContext || null;
  if (!org) return null;
  if (org.logo_path) return toUploadsUrl(org.logo_path);
  if (org.logo_url) return org.logo_url;
  return null;
});

const handleDigitalLink = () => {
  // Placeholder for future digital intake workflow
  alert('Digital Link feature coming soon!');
};

const handleUploadSuccess = () => {
  showUploadModal.value = false;
  // Show success message
  alert('Referral packet uploaded successfully! You will receive a confirmation email.');
};

const handleLoginSuccess = () => {
  showLoginModal.value = false;
  // Redirect to school portal dashboard
  router.push(`/${organizationSlug.value}/dashboard`);
};

onMounted(async () => {
  // Load organization context by slug
  if (organizationSlug.value) {
    const org = await organizationStore.fetchBySlug(organizationSlug.value);
    
    if (!org) {
      // Organization not found, redirect to platform login
      router.push('/login');
      return;
    }

    // Fetch login-theme to determine organization type (and support future branding needs)
    // If this is NOT a school, redirect to the org login page.
    try {
      const themeRes = await api.get(`/agencies/portal/${organizationSlug.value}/login-theme`);
      const orgType = themeRes.data?.agency?.organizationType || org.organization_type || 'agency';
      if (orgType !== 'school') {
        router.push(`/${organizationSlug.value}/login`);
        return;
      }
    } catch (e) {
      // If login-theme fails, fall back to org.organization_type from slug lookup
      const orgType = org.organization_type || 'agency';
      if (orgType !== 'school') {
        router.push(`/${organizationSlug.value}/login`);
        return;
      }
    }

    // If this IS a school, apply portal theme so splash is fully branded
    await brandingStore.fetchAgencyTheme(organizationSlug.value);
  }
});
</script>

<style scoped>
.school-splash {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 40px 20px;
}

.splash-container {
  max-width: 1200px;
  width: 100%;
  text-align: center;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.splash-header {
  margin-bottom: 60px;
}

.splash-logo {
  margin-bottom: 24px;
}

.organization-name {
  font-size: 36px;
  font-weight: 700;
  color: var(--header-text-color, #fff);
  margin: 0;
}

.school-affiliation {
  margin-top: 18px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(6px);
}

.school-affiliation-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.85);
}

.school-affiliation-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.school-logo {
  height: 28px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
}

.school-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--header-text-color, #fff);
}

.action-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 32px;
  margin-top: 40px;
}

.action-card {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 16px;
  padding: 40px 32px;
  box-shadow: var(--shadow);
  border: 2px solid var(--border);
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border-color: var(--primary);
}

.action-icon {
  font-size: 64px;
  margin-bottom: 24px;
  line-height: 1;
}

.action-card h3 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.action-card p {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
}

.action-note {
  font-size: 14px;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 8px;
}

@media (max-width: 768px) {
  .action-cards {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  
  .organization-name {
    font-size: 28px;
  }
  
  .action-card {
    padding: 32px 24px;
  }

  .school-splash {
    padding: 28px 16px;
  }
}
</style>
