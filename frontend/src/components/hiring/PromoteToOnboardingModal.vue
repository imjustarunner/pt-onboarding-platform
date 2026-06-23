<template>
  <Teleport to="body">
    <div class="pto-overlay" @click.self="$emit('close')">
      <div class="pto-modal">
        <!-- Header -->
        <div class="pto-header">
          <div class="pto-header-left">
            <div class="pto-avatar" :style="avatarStyle">{{ initials }}</div>
            <div>
              <h2 class="pto-title">Move to Onboarding</h2>
              <p class="pto-subtitle">{{ fullName }} — {{ candidate.personal_email || candidate.email }}</p>
            </div>
          </div>
          <button class="pto-close" @click="$emit('close')">✕</button>
        </div>

        <!-- Work email gate -->
        <div v-if="!candidate.work_email" class="pto-gate-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>A <strong>work email</strong> is required before promoting to Onboarding. Set it on the candidate's profile first.</span>
        </div>

        <div :class="{ 'pto-body-disabled': !candidate.work_email }" class="pto-body">
          <!-- Applied role read-only -->
          <div class="pto-field-row" v-if="candidate.applied_role">
            <label class="pto-label">Job Applied For</label>
            <span class="pto-value">{{ candidate.applied_role }}</span>
          </div>

          <!-- Onboarding package selector -->
          <div class="pto-section">
            <label class="pto-section-label">Onboarding Package</label>
            <p class="pto-section-hint">
              The package determines which training, documents, and checklist items are assigned on day one.
              A default has been pre-selected based on the candidate's job role.
            </p>

            <div v-if="packagesLoading" class="pto-loading">Loading packages…</div>
            <div v-else>
              <select v-model="selectedPackageId" class="pto-select">
                <option value="">— No package (assign later) —</option>
                <option v-for="pkg in packages" :key="pkg.id" :value="pkg.id">
                  {{ pkg.name }}
                  <template v-if="roleMatchedPackageId === pkg.id"> (suggested for {{ candidate.applied_role }})</template>
                  <template v-else-if="String(pkg.id) === String(agencyDefaultPackageId)"> (agency default)</template>
                </option>
              </select>

              <div v-if="selectedPackage" class="pto-package-preview">
                <div class="pto-pkg-type-badge">{{ selectedPackage.package_type || 'onboarding' }}</div>
                <div v-if="selectedPackage.description" class="pto-pkg-desc">{{ selectedPackage.description }}</div>
              </div>

              <div class="pto-role-hint" v-if="roleMatchedPackageId && selectedPackageId !== roleMatchedPackageId">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
                <button class="pto-link-btn" @click="selectedPackageId = roleMatchedPackageId">
                  Reset to suggested ({{ roleMatchedPackageName }})
                </button>
              </div>
            </div>
          </div>

          <!-- Credential delivery -->
          <div class="pto-section">
            <label class="pto-section-label">How to deliver access</label>
            <div class="pto-radio-group">
              <label class="pto-radio-card" :class="{ active: sendMethod === 'token' }">
                <input type="radio" v-model="sendMethod" value="token" />
                <div class="pto-radio-body">
                  <div class="pto-radio-title">
                    <span>Send a magic link</span>
                    <span class="pto-radio-badge pto-badge-blue">Passwordless</span>
                  </div>
                  <p class="pto-radio-desc">Email the candidate a one-click access link (7-day expiry) to their personal email. They can set a password later.</p>
                  <p class="pto-radio-email">→ {{ candidate.personal_email || candidate.email }}</p>
                </div>
              </label>

              <label class="pto-radio-card" :class="{ active: sendMethod === 'login', disabled: !candidate.work_email }">
                <input type="radio" v-model="sendMethod" value="login" :disabled="!candidate.work_email" />
                <div class="pto-radio-body">
                  <div class="pto-radio-title">
                    <span>Send workspace login</span>
                    <span class="pto-radio-badge pto-badge-green">Full access</span>
                  </div>
                  <p class="pto-radio-desc">Email login instructions using their work email. Use this when the workspace account is already provisioned.</p>
                  <p class="pto-radio-email" v-if="candidate.work_email">→ {{ candidate.work_email }}</p>
                  <p class="pto-radio-email pto-radio-email-warn" v-else>Work email required</p>
                </div>
              </label>

              <label class="pto-radio-card" :class="{ active: sendMethod === 'none' }">
                <input type="radio" v-model="sendMethod" value="none" />
                <div class="pto-radio-body">
                  <div class="pto-radio-title">
                    <span>No email — promote only</span>
                    <span class="pto-radio-badge pto-badge-gray">Manual</span>
                  </div>
                  <p class="pto-radio-desc">Promote the candidate to Onboarding without sending any automated email. You can send credentials manually later.</p>
                </div>
              </label>
            </div>
          </div>

          <!-- Summary -->
          <div class="pto-summary" v-if="selectedPackage">
            <div class="pto-summary-title">What happens when you confirm:</div>
            <ul class="pto-summary-list">
              <li>Status changes to <strong>Onboarding</strong> and removed from Pre-Hire view</li>
              <li v-if="selectedPackage">
                Package <strong>{{ selectedPackage.name }}</strong> is assigned
                (training, documents, and checklist items)
              </li>
              <li v-if="sendMethod === 'token'">A magic link is emailed to <strong>{{ candidate.personal_email || candidate.email }}</strong></li>
              <li v-else-if="sendMethod === 'login'">Workspace login instructions are emailed to <strong>{{ candidate.work_email }}</strong></li>
              <li v-else>No email sent — you'll deliver credentials manually</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div class="pto-footer">
          <button class="pto-btn pto-btn-secondary" @click="$emit('close')">Cancel</button>
          <button
            class="pto-btn pto-btn-primary"
            :disabled="!candidate.work_email || promoting"
            @click="confirm"
          >
            <svg v-if="promoting" class="pto-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
            {{ promoting ? 'Promoting…' : 'Confirm & Move to Onboarding' }}
          </button>
        </div>

        <div v-if="errorMsg" class="pto-error">{{ errorMsg }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../../services/api';

const props = defineProps({
  candidate: { type: Object, required: true },
  agencyId: { type: [String, Number], default: null }
});

const emit = defineEmits(['close', 'promoted']);

// ── State ─────────────────────────────────────────────────────────────────────
const packages = ref([]);
const packagesLoading = ref(true);
const selectedPackageId = ref(null);
const sendMethod = ref('token');
const promoting = ref(false);
const errorMsg = ref('');

// Role-based defaults
const roleMatchedPackageId = ref(null);
const roleMatchedPackageName = ref('');
const agencyDefaultPackageId = ref(null);

// ── Computed ──────────────────────────────────────────────────────────────────
const fullName = computed(() => `${props.candidate.first_name || ''} ${props.candidate.last_name || ''}`.trim() || props.candidate.email);
const initials = computed(() => ((props.candidate.first_name || '').charAt(0) + (props.candidate.last_name || '').charAt(0)).toUpperCase() || '?');
const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6'];
const avatarStyle = computed(() => ({ background: COLORS[(props.candidate.id || 0) % COLORS.length], color: 'white' }));

const selectedPackage = computed(() =>
  selectedPackageId.value ? packages.value.find((p) => p.id === selectedPackageId.value || String(p.id) === String(selectedPackageId.value)) : null
);

// ── Load packages + settings ──────────────────────────────────────────────────
onMounted(async () => {
  try {
    const params = props.agencyId ? { agencyId: props.agencyId } : {};

    const [pkgsRes, settingsRes] = await Promise.all([
      api.get('/onboarding-packages', { params }),
      api.get('/hiring/settings', { params }).catch(() => ({ data: {} }))
    ]);

    packages.value = pkgsRes.data || [];
    const settings = settingsRes.data || {};

    agencyDefaultPackageId.value = settings.default_onboarding_package_id || null;

    // Match candidate's applied role to role_package_mappings
    const role = props.candidate.applied_role;
    if (role && Array.isArray(settings.role_package_mappings)) {
      const match = settings.role_package_mappings.find(
        (m) => m.role && m.role.toLowerCase() === role.toLowerCase()
      );
      if (match?.packageId) {
        roleMatchedPackageId.value = match.packageId;
        const matched = packages.value.find((p) => String(p.id) === String(match.packageId));
        roleMatchedPackageName.value = matched?.name || '';
      }
    }

    // Pre-select: role match > agency default > first package
    selectedPackageId.value =
      roleMatchedPackageId.value ||
      agencyDefaultPackageId.value ||
      (packages.value[0]?.id ?? null);

  } catch (e) {
    console.error('[PromoteToOnboardingModal] Failed to load packages', e);
  } finally {
    packagesLoading.value = false;
  }
});

// ── Confirm ───────────────────────────────────────────────────────────────────
const confirm = async () => {
  if (!props.candidate.work_email) return;
  promoting.value = true;
  errorMsg.value = '';
  try {
    const params = props.agencyId ? { agencyId: props.agencyId } : {};
    await api.post(
      `/users/${props.candidate.id}/promote-to-onboarding`,
      {
        packageId: selectedPackageId.value || null,
        sendMethod: sendMethod.value
      },
      { params }
    );
    emit('promoted', { candidateId: props.candidate.id });
  } catch (e) {
    errorMsg.value = e.response?.data?.error?.message || 'Failed to promote. Please try again.';
  } finally {
    promoting.value = false;
  }
};
</script>

<style scoped>
.pto-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.pto-modal {
  background: white; border-radius: 16px; width: 100%; max-width: 600px;
  max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 80px rgba(0,0,0,0.25);
}

/* Header */
.pto-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid #f3f4f6; }
.pto-header-left { display: flex; align-items: center; gap: 12px; }
.pto-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; color: white; flex-shrink: 0; }
.pto-title { font-size: 18px; font-weight: 800; color: #111827; margin: 0; }
.pto-subtitle { font-size: 12px; color: #6b7280; margin: 2px 0 0; }
.pto-close { background: transparent; border: none; font-size: 18px; color: #9ca3af; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.pto-close:hover { color: #111827; background: #f3f4f6; }

/* Gate */
.pto-gate-banner { display: flex; align-items: center; gap: 10px; background: #fef2f2; border-bottom: 1px solid #fecaca; padding: 12px 24px; font-size: 13px; color: #991b1b; }

/* Body */
.pto-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 24px; }
.pto-body-disabled { opacity: 0.45; pointer-events: none; }

.pto-field-row { display: flex; align-items: center; gap: 12px; }
.pto-label { font-size: 12px; font-weight: 600; color: #6b7280; width: 120px; flex-shrink: 0; }
.pto-value { font-size: 13px; color: #111827; font-weight: 500; }

/* Sections */
.pto-section { display: flex; flex-direction: column; gap: 8px; }
.pto-section-label { font-size: 13px; font-weight: 700; color: #111827; }
.pto-section-hint { font-size: 12px; color: #6b7280; margin: 0; line-height: 1.5; }
.pto-loading { font-size: 13px; color: #9ca3af; }

.pto-select { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 9px 12px; font-size: 13px; background: white; color: #111827; }

.pto-package-preview { margin-top: 8px; background: #f9fafb; border-radius: 8px; padding: 10px 12px; display: flex; gap: 8px; align-items: flex-start; }
.pto-pkg-type-badge { font-size: 10px; font-weight: 700; background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
.pto-pkg-desc { font-size: 12px; color: #6b7280; line-height: 1.5; }

.pto-role-hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6b7280; margin-top: 4px; }
.pto-link-btn { background: transparent; border: none; color: #2563eb; font-size: 12px; cursor: pointer; padding: 0; text-decoration: underline; }

/* Radio cards */
.pto-radio-group { display: flex; flex-direction: column; gap: 8px; }
.pto-radio-card { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border: 1.5px solid #e5e7eb; border-radius: 10px; cursor: pointer; transition: border-color 0.15s; }
.pto-radio-card.active { border-color: #2563eb; background: #eff6ff; }
.pto-radio-card.disabled { opacity: 0.5; cursor: not-allowed; }
.pto-radio-card input[type="radio"] { margin-top: 2px; flex-shrink: 0; cursor: pointer; }
.pto-radio-body { flex: 1; }
.pto-radio-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.pto-radio-desc { font-size: 12px; color: #6b7280; margin: 0 0 4px; line-height: 1.5; }
.pto-radio-email { font-size: 12px; color: #2563eb; margin: 0; font-family: monospace; }
.pto-radio-email-warn { color: #dc2626; font-family: inherit; }
.pto-radio-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 20px; }
.pto-badge-blue { background: #dbeafe; color: #1e40af; }
.pto-badge-green { background: #dcfce7; color: #166534; }
.pto-badge-gray { background: #f3f4f6; color: #6b7280; }

/* Summary */
.pto-summary { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 14px; }
.pto-summary-title { font-size: 12px; font-weight: 700; color: #166534; margin-bottom: 6px; }
.pto-summary-list { margin: 0; padding-left: 16px; font-size: 12px; color: #374151; line-height: 2; }

/* Footer */
.pto-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-top: 1px solid #f3f4f6; }
.pto-btn { padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.pto-btn-secondary { background: white; color: #374151; border: 1px solid #e5e7eb; }
.pto-btn-secondary:hover { background: #f9fafb; }
.pto-btn-primary { background: #111827; color: white; }
.pto-btn-primary:hover:not(:disabled) { background: #1f2937; }
.pto-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* Error */
.pto-error { background: #fef2f2; color: #991b1b; font-size: 13px; padding: 10px 24px; border-top: 1px solid #fecaca; }

/* Spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.pto-spinner { animation: spin 0.8s linear infinite; }
</style>
