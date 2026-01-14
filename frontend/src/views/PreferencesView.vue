<template>
  <div class="container">
    <div class="preferences-header">
      <h1>My Preferences</h1>
      <p class="preferences-subtitle">Manage your personal settings and preferences</p>
    </div>

    <div class="preferences-content">
      <!-- Section 1: Notification Preferences -->
      <section class="preferences-section">
        <div class="section-header">
          <h2>Notification Preferences</h2>
          <p class="section-description">Control how and when you receive notifications</p>
        </div>
        <div class="section-content placeholder">
          <p>Notification preferences will be implemented here.</p>
          <p class="placeholder-note">Includes: In-App / Email / SMS toggles, Category-based controls, Quiet Hours, Auto-responder settings</p>
        </div>
      </section>

      <!-- Section 2: Availability & Work Style -->
      <section class="preferences-section">
        <div class="section-header">
          <h2>Availability & Work Style</h2>
          <p class="section-description">Configure your working context and scheduling preferences</p>
        </div>
        <div class="section-content placeholder">
          <p>Availability and work style preferences will be implemented here.</p>
          <p class="placeholder-note">Includes: Work Modality (In-Person/Telehealth/Hybrid), Office Scheduling Preferences</p>
        </div>
      </section>

      <!-- Section 3: Communication Preferences -->
      <section class="preferences-section">
        <div class="section-header">
          <h2>Communication Preferences</h2>
          <p class="section-description">Control how you present yourself in communications</p>
        </div>
        <div class="section-content placeholder">
          <p>Communication preferences will be implemented here.</p>
          <p class="placeholder-note">Includes: Messaging Behavior, After-Hours Boundary settings</p>
        </div>
      </section>

      <!-- Section 4: Privacy & Display -->
      <section class="preferences-section">
        <div class="section-header">
          <h2>Privacy & Display</h2>
          <p class="section-description">Control what information is displayed and how</p>
        </div>
        <div class="section-content placeholder">
          <p>Privacy and display preferences will be implemented here.</p>
          <p class="placeholder-note">Includes: Name display options, Schedule visibility, PDF export settings</p>
        </div>
      </section>

      <!-- Section 5: Accessibility & UI Preferences -->
      <section class="preferences-section">
        <div class="section-header">
          <h2>Accessibility & UI Preferences</h2>
          <p class="section-description">Customize your interface experience</p>
        </div>
        <div class="section-content placeholder">
          <p>Accessibility and UI preferences will be implemented here.</p>
          <p class="placeholder-note">Includes: Reduced motion, High-contrast mode, Larger text, Default landing page</p>
        </div>
      </section>

      <!-- Section 6: Account & Identity -->
      <section class="preferences-section">
        <div class="section-header">
          <h2>Account & Identity</h2>
          <p class="section-description">View and manage your account information</p>
        </div>
        <div class="section-content placeholder">
          <p>Account and identity information will be displayed here.</p>
          <p class="placeholder-note">Includes: Name, Email, Role, Organization(s), User Category, Password management</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useAuthStore } from '../store/auth';
import { useRouter } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();

onMounted(() => {
  // Ensure user is authenticated
  if (!authStore.isAuthenticated) {
    router.push('/login');
  }
});
</script>

<style scoped>
.preferences-header {
  margin-bottom: 40px;
  padding-bottom: 24px;
  border-bottom: 2px solid var(--border);
}

.preferences-header h1 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 32px;
  font-weight: 700;
}

.preferences-subtitle {
  margin: 0;
  color: var(--text-secondary);
  font-size: 16px;
}

.preferences-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.preferences-section {
  background: white;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border);
}

.section-header {
  margin-bottom: 24px;
}

.section-header h2 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 600;
}

.section-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.section-content {
  min-height: 100px;
}

.section-content.placeholder {
  padding: 40px;
  text-align: center;
  background: var(--bg-alt);
  border-radius: 8px;
  border: 2px dashed var(--border);
}

.section-content.placeholder p {
  margin: 0 0 8px 0;
  color: var(--text-secondary);
  font-size: 16px;
}

.placeholder-note {
  font-size: 14px;
  color: var(--text-secondary);
  font-style: italic;
  opacity: 0.8;
}
</style>
