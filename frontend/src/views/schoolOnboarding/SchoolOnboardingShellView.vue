<template>
  <div class="so-shell" :style="shellVars">
    <aside class="so-sidebar">
      <div class="so-brand">
        <img v-if="agencyLogo" :src="agencyLogo" alt="" class="so-brand-logo" />
        <div v-else class="so-brand-mark">{{ agencyInitial }}</div>
        <div>
          <div class="so-brand-name">{{ agencyName }}</div>
          <div class="so-brand-tag">School portal onboarding</div>
        </div>
      </div>

      <nav class="so-nav" aria-label="Onboarding steps">
        <button
          type="button"
          class="so-nav-item"
          :class="{ active: currentStep === 'home' }"
          @click="go('home')"
        >
          Onboarding Home
        </button>
        <button
          v-for="step in steps"
          :key="step.key"
          type="button"
          class="so-nav-item"
          :class="{ active: currentStep === step.key, done: progress[step.key] === 'complete' }"
          @click="go(step.key)"
        >
          {{ step.label }}
        </button>
      </nav>

      <div class="so-help">
        <strong>Need help?</strong>
        <p class="muted">Questions about setup? Reach out to the team that invited you.</p>
        <a v-if="supportEmail" class="so-help-link" :href="`mailto:${supportEmail}`">Email support</a>
        <a v-if="supportPhone" class="so-help-link" :href="`tel:${supportPhone}`">{{ supportPhone }}</a>
      </div>
    </aside>

    <div class="so-main">
      <header class="so-top">
        <div>
          <div class="so-school">{{ invite?.schoolName || 'Your school' }}</div>
          <div class="muted tiny">
            Invited by:
            {{ invite?.invitedByName || 'Admin' }}
            <span v-if="agencyName">({{ agencyName }})</span>
          </div>
        </div>
        <div class="so-avatar" aria-hidden="true">{{ schoolInitials }}</div>
      </header>

      <div v-if="loading" class="so-panel muted">Loading your onboarding…</div>
      <div v-else-if="error" class="so-panel error-box">{{ error }}</div>
      <template v-else-if="invite">
        <div v-if="invite.submitted" class="so-panel success-box">
          <h2>You’re all set</h2>
          <p>Your school portal is ready. Sign in with your email as your username.</p>
          <router-link class="btn primary" :to="loginPath">Go to school login →</router-link>
        </div>

        <template v-else>
          <!-- Home -->
          <section v-if="currentStep === 'home'" class="so-home">
            <div class="so-hero">
              <div>
                <h1>Welcome to {{ agencyName }}, {{ invite.contactFirstName }}</h1>
                <p class="muted">
                  Follow the steps below to complete your school portal setup. Progress saves automatically.
                </p>
              </div>
            </div>

            <div class="so-stepper">
              <template v-for="(step, idx) in steps" :key="step.key">
                <button
                  type="button"
                  class="so-step"
                  :class="{
                    active: firstIncomplete === step.key,
                    done: progress[step.key] === 'complete'
                  }"
                  @click="go(step.key)"
                >
                  <span class="so-step-num">{{ idx + 1 }}</span>
                  <span>{{ step.label }}</span>
                </button>
                <span v-if="idx < steps.length - 1" class="so-step-chevron" aria-hidden="true">›</span>
              </template>
            </div>

            <div class="so-home-grid">
              <article class="so-card">
                <h2>Start here</h2>
                <p>First, let’s get some basic information about your school and set your password.</p>
                <ul class="so-checklist">
                  <li>School profile and contact details</li>
                  <li>Create your password (email is your username)</li>
                  <li>Academic year and grade levels</li>
                  <li>Preferred service days</li>
                </ul>
                <button type="button" class="btn primary" @click="go(firstIncomplete)">
                  {{ startCta }} →
                </button>
              </article>

              <article class="so-card">
                <h2>Your progress</h2>
                <p>{{ invite.completedSteps }} of {{ invite.totalSteps }} steps complete.</p>
                <div class="so-progress-bar">
                  <div class="so-progress-fill" :style="{ width: `${progressPct}%` }" />
                </div>
                <ul class="so-progress-list">
                  <li v-for="step in steps" :key="step.key">
                    <span>{{ step.label }}</span>
                    <span class="muted tiny">{{ statusLabel(progress[step.key]) }}</span>
                  </li>
                </ul>
              </article>
            </div>

            <div class="so-info-row">
              <article class="so-info">
                <h3>Your data is secure</h3>
                <p class="muted">Only your school team and {{ agencyName }} can access portal information.</p>
              </article>
              <article class="so-info">
                <h3>Save &amp; continue later</h3>
                <p class="muted">Use this invite link anytime before it expires — progress is saved.</p>
              </article>
              <article class="so-info">
                <h3>See a portal in action</h3>
                <p class="muted">Explore the Hogwarts demo school before you submit.</p>
                <button type="button" class="linkish" @click="go('explore_demo')">Preview demo</button>
              </article>
            </div>
          </section>

          <!-- Password gate -->
          <section v-else-if="!invite.passwordSet && currentStep !== 'explore_demo'" class="so-panel">
            <h2>Create your password</h2>
            <p class="muted">
              Username:
              <strong>{{ invite.username || invite.contactEmail }}</strong>
            </p>
            <form class="so-form" @submit.prevent="setPassword">
              <label>
                Password
                <input v-model="password" type="password" required minlength="6" autocomplete="new-password" />
              </label>
              <label>
                Confirm password
                <input v-model="passwordConfirm" type="password" required minlength="6" autocomplete="new-password" />
              </label>
              <p v-if="actionError" class="error">{{ actionError }}</p>
              <button type="submit" class="btn primary" :disabled="saving">
                {{ saving ? 'Saving…' : 'Create password & continue' }}
              </button>
            </form>
          </section>

          <!-- School information -->
          <section v-else-if="currentStep === 'school_information'" class="so-panel">
            <h2>School information</h2>
            <form class="so-form" @submit.prevent="saveSchoolInfo">
              <div class="so-grid">
                <label class="span-2">
                  School name
                  <input v-model.trim="schoolForm.schoolName" required />
                </label>
                <label>
                  District
                  <input v-model.trim="schoolForm.districtName" />
                </label>
                <label>
                  School number
                  <input v-model.trim="schoolForm.schoolNumber" />
                </label>
                <label class="span-2">
                  School address
                  <input v-model.trim="schoolForm.schoolAddress" />
                </label>
                <label>
                  Academic year
                  <input v-model.trim="schoolForm.academicYear" placeholder="e.g. 2026–2027" />
                </label>
                <label>
                  Grade levels
                  <input v-model.trim="schoolForm.gradeLevels" placeholder="e.g. K–12" />
                </label>
                <label>
                  Primary contact name
                  <input v-model.trim="schoolForm.primaryContactName" />
                </label>
                <label>
                  Primary contact email
                  <input v-model.trim="schoolForm.primaryContactEmail" type="email" />
                </label>
              </div>
              <p v-if="actionError" class="error">{{ actionError }}</p>
              <div class="so-actions">
                <button type="submit" class="btn primary" :disabled="saving">
                  {{ saving ? 'Saving…' : 'Save & continue' }}
                </button>
              </div>
            </form>
          </section>

          <!-- School staff -->
          <section v-else-if="currentStep === 'school_staff'" class="so-panel">
            <h2>Add school staff</h2>
            <p class="muted">
              Add colleagues with their school email. Choose each person’s access role.
              <strong>Standard / School Admin</strong> accounts can be selected for Smart School ROI.
              <strong>Scheduler</strong> accounts stay limited/own-only and are not added to ROI assignment lists.
            </p>

            <label class="block">
              Shared temporary password (same for every staff account below)
              <input
                v-model="sharedTempPassword"
                type="text"
                autocomplete="off"
                placeholder="Set one temporary password for all staff"
              />
              <span class="muted tiny">They’ll sign in with their school email + this password, then change it later.</span>
            </label>

            <div v-for="(row, idx) in staffRows" :key="idx" class="so-staff-card">
              <div class="so-staff-row">
                <input v-model.trim="row.fullName" placeholder="Full name" />
                <input v-model.trim="row.email" type="email" placeholder="School email" />
              </div>
              <label class="block">
                Access role
                <select v-model="row.accessRole">
                  <option value="standard">Standard (ROI-eligible)</option>
                  <option value="school_admin">School Admin (ROI-eligible)</option>
                  <option value="scheduler">Scheduler (not on ROI lists)</option>
                  <option value="school_admin_scheduler">School Admin + Scheduler</option>
                </select>
              </label>
              <p class="muted tiny">{{ roleHelper(row.accessRole) }}</p>
              <button type="button" class="linkish danger" @click="staffRows.splice(idx, 1)">Remove</button>
            </div>
            <button
              type="button"
              class="btn ghost"
              @click="staffRows.push({ fullName: '', email: '', accessRole: 'standard' })"
            >
              + Add another
            </button>
            <p class="muted tiny" style="margin-top:0.75rem;">
              You can continue with no additional staff — you are already School Admin for this portal.
            </p>
            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div class="so-actions">
              <button type="button" class="btn primary" :disabled="saving" @click="saveStaff">
                {{ saving ? 'Saving…' : 'Save & continue' }}
              </button>
            </div>
          </section>

          <!-- Preferred days -->
          <section v-else-if="currentStep === 'preferred_days'" class="so-panel">
            <h2>Preferred days &amp; settings</h2>
            <p class="muted">Which days work best for services at your school?</p>
            <div class="so-days">
              <label v-for="day in weekDays" :key="day" class="so-day">
                <input v-model="preferredDays" type="checkbox" :value="day" />
                {{ day }}
              </label>
            </div>
            <label class="block">
              Notes
              <textarea v-model.trim="preferredNotes" rows="3" placeholder="Bell schedule, blackout days, etc." />
            </label>
            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div class="so-actions">
              <button type="button" class="btn primary" :disabled="saving" @click="savePreferredDays">
                {{ saving ? 'Saving…' : 'Save & continue' }}
              </button>
            </div>
          </section>

          <!-- Explore demo -->
          <section v-else-if="currentStep === 'explore_demo'" class="so-panel">
            <h2>Explore the demo</h2>
            <p>
              Open the <strong>Hogwarts</strong> demo school portal to see what your staff experience will feel like.
              It’s view-only — browse pages freely without changing anything.
            </p>
            <p v-if="!invite.passwordSet" class="muted">
              Tip: set your password first so you can sign into the demo session.
            </p>
            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div class="so-actions">
              <button type="button" class="btn primary" :disabled="saving" @click="openDemo">
                {{ saving ? 'Opening…' : 'Open Hogwarts demo' }}
              </button>
              <button
                v-if="progress.explore_demo === 'complete'"
                type="button"
                class="btn ghost"
                @click="go('review_submit')"
              >
                Continue to review →
              </button>
            </div>
          </section>

          <!-- Review & submit -->
          <section v-else-if="currentStep === 'review_submit'" class="so-panel">
            <h2>Review &amp; submit</h2>
            <ul class="so-progress-list">
              <li v-for="step in steps.filter((s) => s.key !== 'review_submit')" :key="step.key">
                <span>{{ step.label }}</span>
                <span :class="progress[step.key] === 'complete' ? 'ok' : 'warn'">
                  {{ statusLabel(progress[step.key]) }}
                </span>
              </li>
              <li>
                <span>Password</span>
                <span :class="invite.passwordSet ? 'ok' : 'warn'">
                  {{ invite.passwordSet ? 'Set' : 'Not set' }}
                </span>
              </li>
            </ul>
            <p v-if="actionError" class="error">{{ actionError }}</p>
            <div class="so-actions">
              <button type="button" class="btn primary" :disabled="saving || !canSubmit" @click="submit">
                {{ saving ? 'Submitting…' : 'Submit & activate portal' }}
              </button>
            </div>
          </section>
        </template>
      </template>

      <footer class="so-footer muted">
        Questions? Contact
        <a v-if="supportEmail" :href="`mailto:${supportEmail}`">{{ supportEmail }}</a>
        <span v-if="supportEmail && supportPhone"> or </span>
        <span v-if="supportPhone">{{ supportPhone }}</span>
        <span v-if="!supportEmail && !supportPhone">your {{ agencyName }} contact</span>.
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const steps = [
  { key: 'school_information', label: 'School Information' },
  { key: 'school_staff', label: 'Add School Staff' },
  { key: 'preferred_days', label: 'Preferred Days' },
  { key: 'explore_demo', label: 'Explore Demo' },
  { key: 'review_submit', label: 'Review & Submit' }
];
const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const token = computed(() => String(route.params.token || '').trim());
const currentStep = computed(() => {
  const s = String(route.params.step || 'home').trim();
  if (!s || s === 'home') return 'home';
  return steps.some((x) => x.key === s) ? s : 'home';
});

const loading = ref(true);
const saving = ref(false);
const error = ref('');
const actionError = ref('');
const invite = ref(null);
const password = ref('');
const passwordConfirm = ref('');
const preferredDays = ref([]);
const preferredNotes = ref('');
const sharedTempPassword = ref('');
const staffRows = ref([{ fullName: '', email: '', accessRole: 'standard' }]);
const schoolForm = reactive({
  schoolName: '',
  districtName: '',
  schoolNumber: '',
  schoolAddress: '',
  academicYear: '',
  gradeLevels: '',
  primaryContactName: '',
  primaryContactEmail: ''
});

const progress = computed(() => invite.value?.stepProgress || {});
const agencyName = computed(() => invite.value?.agency?.name || 'Your partner');
const agencyLogo = computed(() => invite.value?.agency?.logoUrl || null);
const agencyInitial = computed(() => (agencyName.value || 'S').charAt(0).toUpperCase());
const supportEmail = computed(() => invite.value?.agency?.supportEmail || null);
const supportPhone = computed(() => invite.value?.agency?.phone || null);
const schoolInitials = computed(() => {
  const name = invite.value?.schoolName || 'SC';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'SC';
});
const progressPct = computed(() => {
  const total = invite.value?.totalSteps || steps.length;
  const done = invite.value?.completedSteps || 0;
  return Math.round((done / total) * 100);
});
const firstIncomplete = computed(() => {
  for (const s of steps) {
    if (progress.value[s.key] !== 'complete') return s.key;
  }
  return 'review_submit';
});
const startCta = computed(() => {
  const key = firstIncomplete.value;
  const step = steps.find((s) => s.key === key);
  return step ? `Start ${step.label}` : 'Continue';
});
const canSubmit = computed(() => {
  if (!invite.value?.passwordSet) return false;
  return ['school_information', 'school_staff', 'preferred_days', 'explore_demo'].every(
    (k) => progress.value[k] === 'complete'
  );
});
const loginPath = computed(() => {
  const slug = invite.value?.schoolSlug || invite.value?.school?.slug;
  return slug ? `/${slug}/login` : '/login';
});

const shellVars = computed(() => {
  const palette = invite.value?.agency?.colorPalette || {};
  const primary = palette.primary || palette.primaryColor || '#1d4ed8';
  return { '--so-primary': primary };
});

function statusLabel(s) {
  if (s === 'complete') return 'Complete';
  if (s === 'in_progress') return 'In progress';
  return 'Not started';
}

function roleHelper(accessRole) {
  const role = String(accessRole || 'standard').toLowerCase();
  if (role === 'school_admin') {
    return 'Can manage staff and role assignments. Eligible for Smart School ROI.';
  }
  if (role === 'scheduler') {
    return 'Limited/own-only access. Will not appear in Smart School ROI assignment lists.';
  }
  if (role === 'school_admin_scheduler') {
    return 'Manages staff but also uses scheduler ROI limits (not on Smart ROI lists).';
  }
  return 'Default portal account. Eligible to receive ROI access from clients via Smart School ROI.';
}

function go(stepKey) {
  const path =
    !stepKey || stepKey === 'home'
      ? `/school-onboarding/${token.value}`
      : `/school-onboarding/${token.value}/${stepKey}`;
  router.push(path);
}

async function loadInvite() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/public/school-onboarding/${token.value}`);
    invite.value = res.data;
    hydrateForms();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Unable to load this onboarding link';
    invite.value = null;
  } finally {
    loading.value = false;
  }
}

function hydrateForms() {
  const inv = invite.value;
  if (!inv) return;
  const info = inv.stepPayload?.school_information || {};
  schoolForm.schoolName = info.schoolName || inv.schoolName || '';
  schoolForm.districtName = info.districtName || inv.schoolProfile?.district_name || '';
  schoolForm.schoolNumber = info.schoolNumber || inv.schoolProfile?.school_number || '';
  schoolForm.schoolAddress = info.schoolAddress || inv.schoolProfile?.school_address || '';
  schoolForm.academicYear = info.academicYear || '';
  schoolForm.gradeLevels = info.gradeLevels || '';
  schoolForm.primaryContactName =
    info.primaryContactName ||
    inv.schoolProfile?.primary_contact_name ||
    `${inv.contactFirstName || ''} ${inv.contactLastName || ''}`.trim();
  schoolForm.primaryContactEmail =
    info.primaryContactEmail || inv.schoolProfile?.primary_contact_email || inv.contactEmail || '';

  const days = inv.stepPayload?.preferred_days || {};
  preferredDays.value = Array.isArray(days.preferredDays) ? [...days.preferredDays] : [];
  preferredNotes.value = days.notes || '';

  const staff = inv.stepPayload?.school_staff?.staff;
  if (Array.isArray(staff) && staff.length) {
    staffRows.value = staff.map((s) => ({
      fullName: s.fullName || s.name || '',
      email: s.email || '',
      accessRole: s.accessRole || 'standard'
    }));
  }
}

async function setPassword() {
  actionError.value = '';
  if (password.value !== passwordConfirm.value) {
    actionError.value = 'Passwords do not match';
    return;
  }
  saving.value = true;
  try {
    const res = await api.post(`/public/school-onboarding/${token.value}/password`, {
      password: password.value
    });
    if (res.data?.token && res.data?.user) {
      authStore.setAuth(res.data.token, res.data.user, res.data.sessionId);
      if (Array.isArray(res.data.agencies)) {
        try {
          localStorage.setItem('userAgencies', JSON.stringify(res.data.agencies));
        } catch {
          // ignore
        }
      }
    }
    await loadInvite();
    go(firstIncomplete.value === 'review_submit' ? 'school_information' : firstIncomplete.value);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to set password';
  } finally {
    saving.value = false;
  }
}

async function saveStep(stepKey, payload, nextStep) {
  actionError.value = '';
  saving.value = true;
  try {
    const res = await api.put(`/public/school-onboarding/${token.value}/steps/${stepKey}`, {
      payload,
      markComplete: true
    });
    invite.value = res.data?.invite || invite.value;
    if (nextStep) go(nextStep);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Failed to save';
  } finally {
    saving.value = false;
  }
}

function saveSchoolInfo() {
  return saveStep('school_information', { ...schoolForm }, 'school_staff');
}

function saveStaff() {
  const staff = staffRows.value
    .filter((r) => r.email || r.fullName)
    .map((r) => ({
      fullName: r.fullName,
      email: r.email,
      accessRole: r.accessRole || 'standard'
    }));
  if (staff.length && !String(sharedTempPassword.value || '').trim()) {
    actionError.value = 'Set a shared temporary password for the staff accounts.';
    return;
  }
  return saveStep(
    'school_staff',
    { staff, sharedTempPassword: sharedTempPassword.value },
    'preferred_days'
  );
}

function savePreferredDays() {
  return saveStep(
    'preferred_days',
    { preferredDays: preferredDays.value, notes: preferredNotes.value },
    'explore_demo'
  );
}

async function openDemo() {
  actionError.value = '';
  if (!invite.value?.passwordSet) {
    actionError.value = 'Create your password first so we can open the demo session.';
    return;
  }
  saving.value = true;
  try {
    await api.get(`/public/school-onboarding/${token.value}/demo`);
    await loadInvite();
    router.push(`/school-onboarding/${token.value}/demo`);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Demo is unavailable';
  } finally {
    saving.value = false;
  }
}

async function submit() {
  actionError.value = '';
  saving.value = true;
  try {
    const res = await api.post(`/public/school-onboarding/${token.value}/submit`);
    invite.value = res.data?.invite || invite.value;
    if (res.data?.loginPath) {
      router.push(res.data.loginPath);
    }
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Unable to submit';
  } finally {
    saving.value = false;
  }
}

watch(
  () => route.params.token,
  () => {
    if (token.value) loadInvite();
  }
);

onMounted(() => {
  if (token.value) loadInvite();
});
</script>

<style scoped>
.so-shell {
  --so-primary: #1d4ed8;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 260px 1fr;
  background: #f8fafc;
  color: #0f172a;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.so-sidebar {
  background: #eef2f7;
  border-right: 1px solid #e2e8f0;
  padding: 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.so-brand {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.so-brand-logo,
.so-brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: contain;
  background: #fff;
}
.so-brand-mark {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--so-primary);
}
.so-brand-name { font-weight: 700; font-size: 1.05rem; }
.so-brand-tag { font-size: 0.75rem; color: #64748b; }
.so-nav { display: flex; flex-direction: column; gap: 4px; }
.so-nav-item {
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  cursor: pointer;
  font: inherit;
  color: #334155;
}
.so-nav-item.active {
  background: color-mix(in srgb, var(--so-primary) 12%, #fff);
  color: var(--so-primary);
  box-shadow: inset 3px 0 0 var(--so-primary);
  font-weight: 600;
}
.so-nav-item.done { color: #0f766e; }
.so-help {
  margin-top: auto;
  background: #fff;
  border-radius: 12px;
  padding: 0.9rem;
  border: 1px solid #e2e8f0;
}
.so-help-link {
  display: block;
  margin-top: 0.35rem;
  color: var(--so-primary);
  text-decoration: none;
  font-size: 0.9rem;
}
.so-main {
  padding: 1.25rem 1.5rem 2rem;
  max-width: 1100px;
}
.so-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}
.so-school { font-weight: 700; }
.so-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--so-primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
}
.so-hero h1 {
  margin: 0 0 0.4rem;
  font-size: clamp(1.5rem, 2.4vw, 2rem);
}
.so-stepper {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin: 1.25rem 0;
}
.so-step {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
.so-step.active {
  border-color: var(--so-primary);
  color: var(--so-primary);
  font-weight: 600;
}
.so-step.done { border-color: #99f6e4; background: #f0fdfa; }
.so-step-num {
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  background: #e2e8f0;
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  font-weight: 700;
}
.so-step.active .so-step-num { background: var(--so-primary); color: #fff; }
.so-step-chevron { color: #94a3b8; }
.so-home-grid {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 1rem;
}
.so-card, .so-panel, .so-info {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.2rem 1.3rem;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}
.so-card h2, .so-panel h2 { margin: 0 0 0.5rem; }
.so-checklist { padding-left: 1.1rem; color: #334155; }
.so-checklist li { margin: 0.35rem 0; }
.so-progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  margin: 0.75rem 0 1rem;
}
.so-progress-fill {
  height: 100%;
  background: var(--so-primary);
}
.so-progress-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.so-progress-list li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid #f1f5f9;
}
.so-info-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.85rem;
  margin-top: 1rem;
}
.so-info h3 { margin: 0 0 0.35rem; font-size: 1rem; }
.so-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 0.75rem;
}
.so-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.so-grid label, .so-form > label, .block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.span-2 { grid-column: span 2; }
input, textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font: inherit;
}
.so-days {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin: 0.75rem 0;
}
.so-day {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
}
.so-staff-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem;
  margin: 0.65rem 0;
  background: #f8fafc;
}
.so-staff-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
select {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  background: #fff;
}
.so-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1rem;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  font: inherit;
  cursor: pointer;
}
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn.primary { background: var(--so-primary); color: #fff; }
.btn.ghost { background: #f1f5f9; color: #0f172a; }
.linkish {
  background: none;
  border: none;
  color: var(--so-primary);
  cursor: pointer;
  font: inherit;
  padding: 0;
}
.linkish.danger { color: #b91c1c; }
.muted { color: #64748b; }
.tiny { font-size: 0.82rem; }
.error { color: #b91c1c; margin: 0; }
.error-box { color: #991b1b; background: #fef2f2; border-color: #fecaca; }
.success-box { background: #f0fdf4; border-color: #bbf7d0; }
.ok { color: #047857; font-size: 0.85rem; }
.warn { color: #b45309; font-size: 0.85rem; }
.so-footer {
  margin-top: 2rem;
  text-align: center;
  font-size: 0.9rem;
}
.so-footer a { color: var(--so-primary); }
@media (max-width: 900px) {
  .so-shell { grid-template-columns: 1fr; }
  .so-sidebar { border-right: none; border-bottom: 1px solid #e2e8f0; }
  .so-home-grid, .so-info-row, .so-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
  .so-staff-row { grid-template-columns: 1fr; }
}
</style>
