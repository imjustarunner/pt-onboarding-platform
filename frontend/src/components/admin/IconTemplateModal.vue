<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Save Icon Template</h2>
        <button type="button" class="btn-close" @click="close" aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <div v-if="error" class="alert alert-error">{{ error }}</div>

        <div class="form-group">
          <label>Template Name</label>
          <input v-model="templateName" type="text" placeholder="e.g., School Blue Set" />
        </div>

        <div class="form-group">
          <label>Description (optional)</label>
          <textarea v-model="templateDescription" rows="2" placeholder="What is this icon set for?"></textarea>
        </div>

        <div class="settings-section-divider">
          <h4>Organization Icon</h4>
          <p class="section-description">The main icon representing this organization.</p>
        </div>

        <div class="form-group">
          <label>Organization Icon</label>
          <IconSelector v-model="icons.iconId" label="Select Organization Icon" />
          <small>Main icon displayed for this organization</small>
        </div>

        <div class="settings-section-divider">
          <h4>Default Icons</h4>
          <p class="section-description">
            Set default icons for this organization. These override system-wide defaults.
          </p>
        </div>

        <div class="default-icons-grid">
          <div class="default-icon-item">
            <label>Training Focus Default Icon</label>
            <IconSelector v-model="icons.trainingFocusDefaultIconId" />
          </div>
          <div class="default-icon-item">
            <label>Module Default Icon</label>
            <IconSelector v-model="icons.moduleDefaultIconId" />
          </div>
          <div class="default-icon-item">
            <label>User Default Icon</label>
            <IconSelector v-model="icons.userDefaultIconId" />
          </div>
          <div class="default-icon-item">
            <label>Document Default Icon</label>
            <IconSelector v-model="icons.documentDefaultIconId" />
          </div>
        </div>

        <div class="settings-section-divider">
          <h4>Dashboard Action Icons</h4>
          <p class="section-description">Icons displayed on dashboard quick action cards.</p>
        </div>

        <div class="dashboard-icons-grid">
          <div class="dashboard-icon-item">
            <label>Progress Dashboard Icon</label>
            <IconSelector v-model="icons.progressDashboardIconId" />
          </div>
          <div class="dashboard-icon-item">
            <label>Manage Modules Icon</label>
            <IconSelector v-model="icons.manageModulesIconId" />
          </div>
          <div class="dashboard-icon-item">
            <label>Manage Documents Icon</label>
            <IconSelector v-model="icons.manageDocumentsIconId" />
          </div>
          <div class="dashboard-icon-item">
            <label>Manage Users Icon</label>
            <IconSelector v-model="icons.manageUsersIconId" />
          </div>
          <div class="dashboard-icon-item">
            <label>Settings Icon</label>
            <IconSelector v-model="icons.settingsIconId" />
          </div>
        </div>

        <div class="settings-section-divider">
          <h4>Notification Icons</h4>
          <p class="section-description">Set custom icons for different notification types.</p>
        </div>

        <div class="notification-icons-grid">
          <div class="notification-icon-item">
            <label>Status Expired</label>
            <IconSelector v-model="icons.statusExpiredIconId" />
          </div>
          <div class="notification-icon-item">
            <label>Temp Password Expired</label>
            <IconSelector v-model="icons.tempPasswordExpiredIconId" />
          </div>
          <div class="notification-icon-item">
            <label>Task Overdue</label>
            <IconSelector v-model="icons.taskOverdueIconId" />
          </div>
          <div class="notification-icon-item">
            <label>Onboarding Completed</label>
            <IconSelector v-model="icons.onboardingCompletedIconId" />
          </div>
          <div class="notification-icon-item">
            <label>Invitation Expired</label>
            <IconSelector v-model="icons.invitationExpiredIconId" />
          </div>
          <div class="notification-icon-item">
            <label>First Login</label>
            <IconSelector v-model="icons.firstLoginIconId" />
          </div>
          <div class="notification-icon-item">
            <label>First Login (Pending)</label>
            <IconSelector v-model="icons.firstLoginPendingIconId" />
          </div>
          <div class="notification-icon-item">
            <label>Password Changed</label>
            <IconSelector v-model="icons.passwordChangedIconId" />
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" @click="close">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="saving || !templateName.trim()" @click="save">
          {{ saving ? 'Saving...' : 'Save as Template' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import IconSelector from './IconSelector.vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  initialIcons: { type: Object, default: () => ({}) },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const emit = defineEmits(['close', 'save']);

const templateName = ref('');
const templateDescription = ref('');

const icons = ref({
  iconId: null,
  trainingFocusDefaultIconId: null,
  moduleDefaultIconId: null,
  userDefaultIconId: null,
  documentDefaultIconId: null,
  progressDashboardIconId: null,
  manageModulesIconId: null,
  manageDocumentsIconId: null,
  manageUsersIconId: null,
  settingsIconId: null,
  statusExpiredIconId: null,
  tempPasswordExpiredIconId: null,
  taskOverdueIconId: null,
  onboardingCompletedIconId: null,
  invitationExpiredIconId: null,
  firstLoginIconId: null,
  firstLoginPendingIconId: null,
  passwordChangedIconId: null
});

const hydratedInitialIcons = computed(() => props.initialIcons || {});

watch(
  () => props.show,
  (isOpen) => {
    if (!isOpen) return;
    // When opening, reset name/description but copy current org icon values.
    templateName.value = '';
    templateDescription.value = '';
    icons.value = { ...icons.value, ...hydratedInitialIcons.value };
  }
);

const close = () => emit('close');

const save = () => {
  emit('save', {
    name: templateName.value.trim(),
    description: templateDescription.value.trim() || null,
    iconData: { ...icons.value }
  });
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 3000;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 980px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-alt);
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary);
}

.btn-close {
  background: none;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary);
}

.modal-body {
  padding: 18px 22px;
  overflow: auto;
}

.modal-actions {
  padding: 16px 22px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: white;
}

.default-icons-grid,
.dashboard-icons-grid,
.notification-icons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}

.alert-error {
  background: #ffe9e9;
  border: 1px solid #ffb3b3;
  color: #7a1010;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
}
</style>

