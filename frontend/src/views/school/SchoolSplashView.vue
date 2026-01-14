<template>
  <div class="school-splash">
    <div class="splash-container">
      <!-- Organization Branding Header -->
      <div class="splash-header">
        <BrandingLogo size="large" class="splash-logo" />
        <h1 v-if="organizationName" class="organization-name">{{ organizationName }}</h1>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useOrganizationStore } from '../../store/organization';
import { useBrandingStore } from '../../store/branding';
import BrandingLogo from '../../components/BrandingLogo.vue';
import ReferralUpload from '../../components/school/ReferralUpload.vue';
import StaffLoginModal from '../../components/school/StaffLoginModal.vue';

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
    
    // Verify this is a school organization
    const orgType = org.organization_type || 'agency';
    if (orgType !== 'school') {
      // If not a school, redirect to login for that organization
      router.push(`/${organizationSlug.value}/login`);
    }
  }
});
</script>

<style scoped>
.school-splash {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  padding: 40px 20px;
}

.splash-container {
  max-width: 1200px;
  width: 100%;
  text-align: center;
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
  color: var(--text-primary);
  margin: 0;
}

.action-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 32px;
  margin-top: 40px;
}

.action-card {
  background: white;
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
}
</style>
