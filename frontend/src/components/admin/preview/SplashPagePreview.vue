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
        <div class="action-card" @click="handleUploadClick">
          <div class="action-icon">📤</div>
          <h3>Upload New Referral Packet</h3>
          <p>No login required</p>
        </div>

        <!-- Option 3: School Staff Login -->
        <div class="action-card" @click="handleLoginClick">
          <div class="action-icon">🔐</div>
          <h3>School Staff Login</h3>
          <p>Access your portal</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useOrganizationStore } from '../../../store/organization';
import { useBrandingStore } from '../../../store/branding';
import BrandingLogo from '../../../components/BrandingLogo.vue';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  },
  organizationId: {
    type: Number,
    default: null
  }
});

const organizationStore = useOrganizationStore();
const brandingStore = useBrandingStore();

const organizationName = computed(() => {
  return organizationStore.organizationContext?.name || 
         organizationStore.currentOrganization?.name || 
         brandingStore.displayName;
});

const handleDigitalLink = () => {
  // In preview mode, just show a message
  alert('Digital Link feature coming soon! (Preview mode)');
};

const handleUploadClick = () => {
  // In preview mode, just show a message
  alert('Upload Referral Packet feature (Preview mode)');
};

const handleLoginClick = () => {
  // In preview mode, just show a message
  alert('School Staff Login feature (Preview mode)');
};

onMounted(async () => {
  // Load organization context by slug for preview
  if (props.organizationSlug) {
    await organizationStore.fetchBySlug(props.organizationSlug);
  } else if (props.organizationId) {
    // If we have organizationId but no slug, we might need to fetch by ID
    // For now, the slug should be available
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
