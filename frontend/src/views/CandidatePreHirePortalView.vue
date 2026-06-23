<template>
  <div class="portal-root" :style="cssVars">

    <!-- Loading splash -->
    <div v-if="loading" class="portal-splash">
      <div class="splash-spinner"></div>
      <div class="splash-text">Loading your portal…</div>
    </div>

    <!-- Error states -->
    <div v-else-if="errorCode === 'INVALID_TOKEN'" class="portal-splash portal-splash-error">
      <div class="error-icon">🔗</div>
      <h2>This link is invalid or has expired.</h2>
      <p>Please contact your hiring team to receive a new link.</p>
    </div>

    <div v-else-if="errorCode === 'STATUS_ADVANCED'" class="portal-splash portal-splash-done">
      <div v-if="agency?.logoUrl" class="splash-logo"><img :src="agency.logoUrl" :alt="agency.name" /></div>
      <div class="done-icon">✓</div>
      <h2>You're all set!</h2>
      <p>Your pre-hire documents have been submitted. Your hiring team will be in touch with next steps and your login information.</p>
      <p v-if="agency?.phoneNumber" class="contact-line">Questions? Call us at <strong>{{ agency.phoneNumber }}</strong></p>
    </div>

    <!-- Main portal -->
    <template v-else-if="portalData">

      <!-- Header bar -->
      <header class="portal-header">
        <div class="portal-header-left">
          <img v-if="agency?.logoUrl" :src="agency.logoUrl" :alt="agency.name" class="header-logo" />
          <span v-else class="header-org-name">{{ agency?.name || 'Your Organization' }}</span>
        </div>
        <div class="portal-header-center">
          <div class="portal-greeting">
            Welcome, <strong>{{ candidate.firstName }}</strong>!
          </div>
          <div class="portal-subgreeting">
            {{ phaseLabel }} · {{ agency?.name }}
          </div>
        </div>
        <div class="portal-header-right">
          <div class="portal-clock">{{ clockDisplay }}</div>
          <div class="portal-date">{{ dateDisplay }}</div>
        </div>
      </header>

      <!-- Body -->
      <div class="portal-body">

        <!-- Left: task grid -->
        <div class="portal-main">
          <div class="section-eyebrow">{{ sectionLabel }}</div>

          <!-- All done state -->
          <div v-if="allDone" class="all-done-banner">
            <div class="all-done-icon">🎉</div>
            <div>
              <strong>All items complete!</strong>
              <div class="all-done-sub">Your documents are under review. We'll reach out shortly with next steps.</div>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
            </div>
            <div class="progress-label">{{ completedCount }} of {{ totalCount }} complete</div>
          </div>

          <!-- Task cards grid -->
          <div v-if="!allDone && tasks.length === 0" class="empty-tasks">
            No items have been assigned yet. Your hiring team will send them shortly.
          </div>

          <div class="task-grid">
            <div
              v-for="task in tasks"
              :key="task.id"
              class="task-card"
              :class="{
                'task-card--done': task.status === 'completed',
                'task-card--active': activeTaskId === task.id,
                'task-card--pending': task.status !== 'completed'
              }"
              @click="selectTask(task)"
            >
              <div class="task-card-icon">
                <span v-if="task.status === 'completed'" class="icon-done">✓</span>
                <span v-else-if="task.actionType === 'review'" class="icon-review">📋</span>
                <span v-else class="icon-sign">✍️</span>
              </div>
              <div class="task-card-body">
                <div class="task-card-title">{{ task.title }}</div>
                <div class="task-card-meta">
                  <span class="task-pill" :class="pillClass(task)">{{ pillLabel(task) }}</span>
                  <span v-if="task.isRequired" class="task-pill task-pill-required">Required</span>
                </div>
              </div>
              <div class="task-card-arrow" v-if="task.status !== 'completed'">›</div>
            </div>
          </div>

          <!-- Submit CTA -->
          <div v-if="tasks.length > 0 && !allDone" class="cta-wrap">
            <button class="btn-complete" :disabled="submitting" @click="confirmSubmit">
              {{ submitting ? 'Submitting…' : 'I\'ve completed everything — submit for review' }}
            </button>
            <div class="cta-help">
              You can also submit before all items are done if you need assistance.
            </div>
          </div>
        </div>

        <!-- Right: sidebar -->
        <aside class="portal-sidebar">
          <!-- Candidate info card -->
          <div class="sidebar-card candidate-card">
            <div class="sidebar-card-label">YOUR INFORMATION</div>
            <div class="candidate-name">{{ candidate.firstName }} {{ candidate.lastName }}</div>
            <div class="candidate-role" v-if="candidate.appliedRole">{{ candidate.appliedRole }}</div>
            <div class="candidate-email">{{ candidate.email }}</div>
          </div>

          <!-- Need help card -->
          <div class="sidebar-card help-card">
            <div class="sidebar-card-label">NEED HELP?</div>
            <div class="help-text">Contact your hiring team for assistance with any of these items.</div>
            <div v-if="agency?.phoneNumber" class="help-phone">📞 {{ agency.phoneNumber }}</div>
          </div>

          <!-- Phase info -->
          <div class="sidebar-card phase-card">
            <div class="sidebar-card-label">{{ isPrehire ? 'PRE-HIRE' : 'ONBOARDING' }}</div>
            <div class="phase-text">
              <span v-if="isPrehire">
                Please complete these items before your start date. Once finished, your team will review and send your login credentials.
              </span>
              <span v-else>
                Welcome to the team! Complete these items to finish setting up your account.
              </span>
            </div>
          </div>
        </aside>
      </div>

      <!-- Task signing panel (modal-style overlay) -->
      <transition name="panel-slide">
        <div v-if="activeTask" class="task-panel-overlay" @click.self="closePanel">
          <div class="task-panel">
            <div class="task-panel-header">
              <div>
                <div class="task-panel-title">{{ activeTask.title }}</div>
                <div class="task-panel-meta">
                  <span class="task-pill" :class="pillClass(activeTask)">{{ pillLabel(activeTask) }}</span>
                </div>
              </div>
              <button class="panel-close" @click="closePanel">×</button>
            </div>

            <div class="task-panel-body">
              <!-- Already completed -->
              <div v-if="activeTask.status === 'completed'" class="task-done-msg">
                <div class="task-done-check">✓</div>
                <div>This item is complete.</div>
              </div>

              <!-- HTML document content -->
              <template v-else>
                <!-- Consent step -->
                <div v-if="panelStep === 'consent'" class="consent-block">
                  <h3>Electronic Signature Disclosure</h3>
                  <p>
                    By checking the box below, you consent to sign this document electronically.
                    Your electronic signature is legally binding and carries the same force as a handwritten signature.
                  </p>
                  <label class="consent-check-row">
                    <input type="checkbox" v-model="consentChecked" />
                    <span>I consent to sign this document electronically.</span>
                  </label>
                  <button class="btn-primary" :disabled="!consentChecked || panelLoading" @click="submitConsent">
                    {{ panelLoading ? '…' : 'Continue' }}
                  </button>
                </div>

                <!-- Document / review step -->
                <div v-else-if="panelStep === 'review'" class="review-block">
                  <div v-if="activeTaskDetail?.document?.htmlContent" class="doc-preview" v-html="sanitizedHtml"></div>
                  <div v-else class="doc-placeholder">
                    <div class="doc-placeholder-icon">📄</div>
                    <div>{{ activeTask.title }}</div>
                    <div class="doc-placeholder-sub">{{ activeTask.description }}</div>
                  </div>

                  <div class="review-actions">
                    <div v-if="activeTask.actionType === 'review'">
                      <!-- Review only — just acknowledge -->
                      <button class="btn-primary" :disabled="panelLoading" @click="submitAcknowledge">
                        {{ panelLoading ? 'Saving…' : 'I have read and acknowledge this document' }}
                      </button>
                    </div>
                    <div v-else>
                      <button class="btn-primary" @click="panelStep = 'sign'">
                        Proceed to sign →
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Signature step -->
                <div v-else-if="panelStep === 'sign'" class="sign-block">
                  <div class="sign-instructions">
                    Draw your signature below using your mouse or finger.
                  </div>
                  <canvas
                    ref="sigCanvas"
                    class="sig-canvas"
                    @mousedown="startDraw" @mousemove="draw" @mouseup="stopDraw" @mouseleave="stopDraw"
                    @touchstart.prevent="touchStart" @touchmove.prevent="touchMove" @touchend="stopDraw"
                  ></canvas>
                  <div class="sign-actions">
                    <button class="btn-secondary-sm" @click="clearCanvas">Clear</button>
                    <button class="btn-back" @click="panelStep = 'review'">← Back</button>
                    <button class="btn-primary" :disabled="!hasSig || panelLoading" @click="submitSign">
                      {{ panelLoading ? 'Signing…' : 'Submit signature' }}
                    </button>
                  </div>
                  <div v-if="panelError" class="panel-error">{{ panelError }}</div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </transition>

      <!-- Submit confirmation modal -->
      <div v-if="showSubmitConfirm" class="confirm-overlay" @click.self="showSubmitConfirm = false">
        <div class="confirm-modal">
          <h3>Submit for review?</h3>
          <p v-if="completedCount < totalCount">
            You have <strong>{{ totalCount - completedCount }}</strong> item(s) still pending.
            You can still submit, but your team may reach out to complete remaining items.
          </p>
          <p v-else>All items are complete. Your documents will be submitted for review.</p>
          <div class="confirm-actions">
            <button class="btn-secondary-sm" @click="showSubmitConfirm = false">Go back</button>
            <button class="btn-primary" :disabled="submitting" @click="submitPortal(true)">
              {{ submitting ? 'Submitting…' : 'Submit' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Footer bar -->
      <footer class="portal-footer">
        <div class="footer-org">{{ agency?.name }}</div>
        <div class="footer-divider">|</div>
        <div class="footer-status">{{ statusLabel }}</div>
        <div v-if="agency?.phoneNumber" class="footer-divider">|</div>
        <div v-if="agency?.phoneNumber" class="footer-phone">{{ agency.phoneNumber }}</div>
      </footer>
    </template>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import DOMPurify from 'dompurify';
import axios from 'axios';

const route = useRoute();
const token = computed(() => route.params.token);

// Use a base axios instance (no auth cookies needed — token is in URL)
const portalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: false
});

// ─── State ────────────────────────────────────────────────────────────────────
const loading = ref(true);
const errorCode = ref('');
const portalData = ref(null);

const candidate = computed(() => portalData.value?.candidate || {});
const agency = computed(() => portalData.value?.agency || null);
const tasks = computed(() => portalData.value?.tasks || []);
const progress = computed(() => portalData.value?.progress || { total: 0, completed: 0, allDone: false });

// Use required-only progress when any tasks are flagged required; otherwise all tasks
const totalCount = computed(() => progress.value.requiredTotal || progress.value.total);
const completedCount = computed(() => progress.value.requiredCompleted ?? progress.value.completed);
const allDone = computed(() => progress.value.allDone);
const progressPct = computed(() => totalCount.value > 0 ? Math.round((completedCount.value / totalCount.value) * 100) : 0);

const isPrehire = computed(() => ['PENDING_SETUP', 'PREHIRE_OPEN'].includes(candidate.value.status));
const phaseLabel = computed(() => isPrehire.value ? 'Pre-Hire' : 'Onboarding');
const sectionLabel = computed(() => isPrehire.value ? 'PRE-HIRE ITEMS' : 'ONBOARDING CHECKLIST');
const statusLabel = computed(() => {
  const map = {
    PENDING_SETUP: 'Awaiting setup',
    PREHIRE_OPEN: 'Pre-hire in progress',
    PREHIRE_REVIEW: 'Under review',
    ONBOARDING: 'Onboarding'
  };
  return map[candidate.value.status] || candidate.value.status || '';
});

// ─── CSS vars from agency branding ────────────────────────────────────────────
const cssVars = computed(() => ({
  '--primary': agency.value?.primaryColor || '#1d4ed8',
  '--accent': agency.value?.accentColor || '#0f766e'
}));

// ─── Clock ────────────────────────────────────────────────────────────────────
const now = ref(new Date());
let clockInterval = null;
const clockDisplay = computed(() => now.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
const dateDisplay = computed(() => now.value.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }));

// ─── Task panel ───────────────────────────────────────────────────────────────
const activeTaskId = ref(null);
const activeTask = computed(() => tasks.value.find(t => t.id === activeTaskId.value) || null);
const activeTaskDetail = ref(null);
const panelStep = ref('consent');
const panelLoading = ref(false);
const panelError = ref('');
const consentChecked = ref(false);

const sanitizedHtml = computed(() => {
  const html = activeTaskDetail.value?.document?.htmlContent || '';
  return DOMPurify.sanitize(html);
});

const pillClass = (t) => {
  if (t.status === 'completed') return 'pill-done';
  if (t.actionType === 'review') return 'pill-review';
  return 'pill-sign';
};
const pillLabel = (t) => {
  if (t.status === 'completed') return 'Done';
  if (t.actionType === 'review') return 'Review & acknowledge';
  return 'Signature required';
};

const selectTask = async (task) => {
  if (task.status === 'completed') return;
  activeTaskId.value = task.id;
  panelStep.value = 'consent';
  panelError.value = '';
  consentChecked.value = false;
  activeTaskDetail.value = null;
  try {
    const res = await portalApi.get(`/prehire-portal/${token.value}/tasks/${task.id}`);
    activeTaskDetail.value = res.data;
    if (activeTaskDetail.value?.auditTrail?.portalConsent?.given) {
      panelStep.value = 'review';
    }
  } catch { /* show panel anyway */ }
};

const closePanel = () => {
  activeTaskId.value = null;
  clearCanvas();
};

// ─── Consent ──────────────────────────────────────────────────────────────────
const submitConsent = async () => {
  panelLoading.value = true;
  panelError.value = '';
  try {
    await portalApi.post(`/prehire-portal/${token.value}/tasks/${activeTask.value.id}/consent`, {
      consentGiven: true,
      consentTimestamp: new Date().toISOString()
    });
    panelStep.value = 'review';
  } catch (e) {
    panelError.value = e.response?.data?.error?.message || 'Failed to record consent.';
  } finally {
    panelLoading.value = false;
  }
};

// ─── Acknowledge (review-only) ────────────────────────────────────────────────
const submitAcknowledge = async () => {
  panelLoading.value = true;
  panelError.value = '';
  try {
    await portalApi.post(`/prehire-portal/${token.value}/tasks/${activeTask.value.id}/acknowledge`);
    await reloadPortal();
    closePanel();
  } catch (e) {
    panelError.value = e.response?.data?.error?.message || 'Failed to save acknowledgment.';
  } finally {
    panelLoading.value = false;
  }
};

// ─── Signature canvas ─────────────────────────────────────────────────────────
const sigCanvas = ref(null);
const hasSig = ref(false);
let isDrawing = false;
let ctx = null;

const initCanvas = async () => {
  await nextTick();
  if (!sigCanvas.value) return;
  const canvas = sigCanvas.value;
  canvas.width = canvas.offsetWidth * window.devicePixelRatio;
  canvas.height = canvas.offsetHeight * window.devicePixelRatio;
  ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

const startDraw = (e) => {
  isDrawing = true;
  ctx?.beginPath();
  const { x, y } = relPos(e);
  ctx?.moveTo(x, y);
};
const draw = (e) => {
  if (!isDrawing || !ctx) return;
  const { x, y } = relPos(e);
  ctx.lineTo(x, y);
  ctx.stroke();
  hasSig.value = true;
};
const stopDraw = () => { isDrawing = false; };

const touchStart = (e) => {
  const t = e.touches[0];
  startDraw({ clientX: t.clientX, clientY: t.clientY });
};
const touchMove = (e) => {
  const t = e.touches[0];
  draw({ clientX: t.clientX, clientY: t.clientY });
};

const relPos = (e) => {
  const rect = sigCanvas.value.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
};

const clearCanvas = () => {
  if (!ctx || !sigCanvas.value) return;
  ctx.clearRect(0, 0, sigCanvas.value.width, sigCanvas.value.height);
  hasSig.value = false;
};

const submitSign = async () => {
  if (!sigCanvas.value) return;
  const dataUrl = sigCanvas.value.toDataURL('image/png');
  panelLoading.value = true;
  panelError.value = '';
  try {
    await portalApi.post(`/prehire-portal/${token.value}/tasks/${activeTask.value.id}/sign`, {
      signatureData: dataUrl
    });
    await reloadPortal();
    closePanel();
  } catch (e) {
    panelError.value = e.response?.data?.error?.message || 'Failed to submit signature. Please try again.';
  } finally {
    panelLoading.value = false;
  }
};

// Watch panelStep to init canvas when sign step activates
import { watch } from 'vue';
watch(() => panelStep.value, (step) => { if (step === 'sign') initCanvas(); });

// ─── Submit portal (all done) ─────────────────────────────────────────────────
const submitting = ref(false);
const showSubmitConfirm = ref(false);

const confirmSubmit = () => { showSubmitConfirm.value = true; };

const submitPortal = async (force = false) => {
  submitting.value = true;
  try {
    await portalApi.post(`/prehire-portal/${token.value}/complete`, { force });
    showSubmitConfirm.value = false;
    // Reload — will hit STATUS_ADVANCED state
    await loadPortal();
  } catch (e) {
    const errCode = e.response?.data?.error?.code;
    if (errCode === 'TASKS_INCOMPLETE') {
      showSubmitConfirm.value = true;
    }
  } finally {
    submitting.value = false;
  }
};

// ─── Load / reload ────────────────────────────────────────────────────────────
const loadPortal = async () => {
  loading.value = true;
  errorCode.value = '';
  try {
    const res = await portalApi.get(`/prehire-portal/${token.value}`);
    portalData.value = res.data;
  } catch (e) {
    errorCode.value = e.response?.data?.error?.code || 'UNKNOWN';
    portalData.value = null;
    // Surface agency info from STATUS_ADVANCED error if available
    if (e.response?.data?.agency) {
      portalData.value = { agency: e.response.data.agency };
    }
  } finally {
    loading.value = false;
  }
};

const reloadPortal = async () => {
  try {
    const res = await portalApi.get(`/prehire-portal/${token.value}`);
    portalData.value = res.data;
  } catch { /* ignore reload errors */ }
};

onMounted(async () => {
  await loadPortal();
  clockInterval = setInterval(() => { now.value = new Date(); }, 1000);
});

onUnmounted(() => {
  clearInterval(clockInterval);
});
</script>

<style scoped>
/* ─── CSS Variables ─────────────────────────────────────────────────────────── */
.portal-root {
  --primary: #1d4ed8;
  --accent: #0f766e;
  --primary-light: color-mix(in srgb, var(--primary) 12%, white);
  --primary-mid: color-mix(in srgb, var(--primary) 25%, white);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8fafc;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #0f172a;
}

/* ─── Splash / error screens ────────────────────────────────────────────────── */
.portal-splash {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px; text-align: center; padding: 40px;
}
.portal-splash-error { background: #fff1f2; }
.portal-splash-done { background: #f0fdf4; }
.splash-spinner {
  width: 40px; height: 40px; border: 3px solid #e2e8f0;
  border-top-color: var(--primary); border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.splash-text { color: #64748b; font-size: 14px; }
.splash-logo img { height: 64px; object-fit: contain; margin-bottom: 10px; }
.done-icon { font-size: 48px; color: #16a34a; }
.error-icon { font-size: 48px; }
.portal-splash h2 { font-size: 24px; font-weight: 700; margin: 0; }
.portal-splash p { font-size: 15px; color: #475569; max-width: 400px; margin: 0; }
.contact-line { font-size: 14px; color: #374151; }

/* ─── Header ────────────────────────────────────────────────────────────────── */
.portal-header {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--primary); color: white;
  padding: 0 32px; height: 72px; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}
.portal-header-left { display: flex; align-items: center; gap: 12px; min-width: 180px; }
.header-logo { height: 42px; object-fit: contain; filter: brightness(0) invert(1); border-radius: 4px; }
.header-org-name { font-size: 18px; font-weight: 700; letter-spacing: 0.02em; }
.portal-header-center { flex: 1; text-align: center; }
.portal-greeting { font-size: 20px; font-weight: 700; }
.portal-subgreeting { font-size: 13px; opacity: 0.8; margin-top: 1px; }
.portal-header-right { text-align: right; min-width: 160px; }
.portal-clock { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.portal-date { font-size: 12px; opacity: 0.75; margin-top: 1px; }

/* ─── Body layout ───────────────────────────────────────────────────────────── */
.portal-body {
  display: flex; gap: 24px; padding: 28px 32px; flex: 1; min-height: 0;
  max-width: 1200px; width: 100%; margin: 0 auto; box-sizing: border-box;
}

/* ─── Main area ─────────────────────────────────────────────────────────────── */
.portal-main { flex: 1; display: flex; flex-direction: column; gap: 16px; }

.section-eyebrow {
  font-size: 11px; font-weight: 800; letter-spacing: 0.1em;
  color: #64748b; text-transform: uppercase;
}

.all-done-banner {
  display: flex; align-items: center; gap: 16px;
  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 16px 20px;
}
.all-done-icon { font-size: 28px; }
.all-done-sub { font-size: 13px; color: #374151; margin-top: 3px; }

/* Progress */
.progress-wrap { display: flex; align-items: center; gap: 12px; }
.progress-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 99px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.4s ease; }
.progress-label { font-size: 13px; color: #64748b; white-space: nowrap; font-variant-numeric: tabular-nums; }

.empty-tasks { font-size: 14px; color: #94a3b8; padding: 24px 0; text-align: center; }

/* Task cards grid */
.task-grid { display: flex; flex-direction: column; gap: 10px; }

.task-card {
  display: flex; align-items: center; gap: 16px;
  background: white; border: 1.5px solid #e2e8f0; border-radius: 14px;
  padding: 16px 18px; cursor: pointer;
  transition: all 0.15s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.task-card:hover:not(.task-card--done) {
  border-color: var(--primary); box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-1px);
}
.task-card--done { opacity: 0.65; cursor: default; }
.task-card--active { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.task-card-icon { font-size: 22px; width: 36px; text-align: center; flex-shrink: 0; }
.icon-done { color: #16a34a; }
.task-card-body { flex: 1; min-width: 0; }
.task-card-title { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 5px; }
.task-card-meta { display: flex; gap: 6px; }
.task-card-arrow { font-size: 20px; color: #94a3b8; }

/* Pills */
.task-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 20px; }
.pill-done { background: #dcfce7; color: #166534; }
.pill-sign { background: var(--primary-light); color: var(--primary); }
.pill-review { background: #f1f5f9; color: #475569; }
.task-pill-required { background: #ede9fe; color: #5b21b6; }

/* CTA */
.cta-wrap { padding-top: 4px; }
.btn-complete {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--accent); color: white; border: none; border-radius: 10px;
  font-size: 14px; font-weight: 600; padding: 12px 24px; cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12); transition: all 0.15s;
}
.btn-complete:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.btn-complete:disabled { opacity: 0.5; cursor: not-allowed; }
.cta-help { font-size: 12px; color: #94a3b8; margin-top: 6px; }

/* ─── Sidebar ───────────────────────────────────────────────────────────────── */
.portal-sidebar { width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; }

.sidebar-card {
  background: white; border: 1px solid #e2e8f0; border-radius: 14px;
  padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.sidebar-card-label {
  font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
  color: #94a3b8; text-transform: uppercase; margin-bottom: 10px;
}
.candidate-name { font-size: 16px; font-weight: 700; color: #0f172a; }
.candidate-role { font-size: 13px; color: var(--primary); font-weight: 600; margin-top: 3px; }
.candidate-email { font-size: 12px; color: #64748b; margin-top: 5px; word-break: break-all; }

.help-text { font-size: 13px; color: #374151; line-height: 1.5; }
.help-phone { font-size: 13px; color: var(--primary); font-weight: 600; margin-top: 8px; }

.phase-card { background: var(--primary-light); border-color: var(--primary-mid); }
.phase-text { font-size: 13px; color: #374151; line-height: 1.6; }

/* ─── Task panel (slide-in) ─────────────────────────────────────────────────── */
.task-panel-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: stretch; justify-content: flex-end; z-index: 50;
}

.task-panel {
  width: 560px; max-width: 95vw; background: white;
  display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,0.15);
}

.task-panel-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 20px 22px 16px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
  background: var(--primary); color: white;
}
.task-panel-title { font-size: 17px; font-weight: 700; }
.task-panel-meta { margin-top: 6px; }
.panel-close { border: none; background: transparent; font-size: 24px; cursor: pointer; color: rgba(255,255,255,0.8); line-height: 1; }

.task-panel-body { flex: 1; overflow-y: auto; padding: 22px; }

/* Done state */
.task-done-msg { display: flex; align-items: center; gap: 14px; font-size: 15px; color: #16a34a; font-weight: 600; padding: 20px 0; }
.task-done-check { font-size: 28px; }

/* Consent step */
.consent-block { display: flex; flex-direction: column; gap: 16px; }
.consent-block h3 { font-size: 16px; font-weight: 700; margin: 0; color: #0f172a; }
.consent-block p { font-size: 14px; color: #475569; line-height: 1.65; margin: 0; }
.consent-check-row { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; cursor: pointer; }
.consent-check-row input { margin-top: 3px; cursor: pointer; }

/* Review step */
.review-block { display: flex; flex-direction: column; gap: 16px; }
.doc-preview { font-size: 14px; color: #0f172a; line-height: 1.7; max-height: 55vh; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; background: #fafafa; }
.doc-placeholder { text-align: center; padding: 40px 20px; }
.doc-placeholder-icon { font-size: 40px; margin-bottom: 12px; }
.doc-placeholder-sub { font-size: 13px; color: #94a3b8; margin-top: 6px; }
.review-actions { padding-top: 8px; }

/* Sign step */
.sign-block { display: flex; flex-direction: column; gap: 14px; }
.sign-instructions { font-size: 13px; color: #475569; }
.sig-canvas {
  width: 100%; height: 160px; border: 2px solid #e2e8f0; border-radius: 10px;
  background: #fafafa; cursor: crosshair; touch-action: none; display: block;
}
.sign-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.panel-error { font-size: 13px; color: #dc2626; background: #fef2f2; border-radius: 8px; padding: 8px 12px; }

/* Buttons */
.btn-primary {
  background: var(--primary); color: white; border: none; border-radius: 8px;
  font-size: 14px; font-weight: 600; padding: 10px 20px; cursor: pointer;
  transition: all 0.15s;
}
.btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary-sm {
  background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; font-weight: 600; padding: 8px 16px; cursor: pointer;
}
.btn-secondary-sm:hover { background: #e2e8f0; }
.btn-back { background: transparent; color: #64748b; border: none; font-size: 13px; cursor: pointer; padding: 8px 12px; }

/* ─── Submit confirm overlay ────────────────────────────────────────────────── */
.confirm-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; z-index: 60;
}
.confirm-modal {
  background: white; border-radius: 14px; padding: 28px 28px 22px;
  max-width: 420px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.confirm-modal h3 { font-size: 18px; font-weight: 700; margin: 0 0 12px; }
.confirm-modal p { font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px; }
.confirm-actions { display: flex; gap: 10px; justify-content: flex-end; }

/* ─── Footer ────────────────────────────────────────────────────────────────── */
.portal-footer {
  display: flex; align-items: center; gap: 12px;
  background: #0f172a; color: rgba(255,255,255,0.65); font-size: 13px;
  padding: 0 32px; height: 44px; flex-shrink: 0;
}
.footer-org { color: rgba(255,255,255,0.85); font-weight: 600; }
.footer-divider { opacity: 0.3; }

/* ─── Panel slide animation ─────────────────────────────────────────────────── */
.panel-slide-enter-active,
.panel-slide-leave-active { transition: transform 0.25s ease; }
.panel-slide-enter-from,
.panel-slide-leave-to { transform: translateX(100%); }

/* ─── Spinner ───────────────────────────────────────────────────────────────── */
@keyframes spin { to { transform: rotate(360deg); } }

/* ─── Mobile ────────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .portal-header { padding: 0 16px; }
  .portal-header-right { display: none; }
  .portal-body { flex-direction: column; padding: 16px; }
  .portal-sidebar { width: 100%; }
  .task-panel { width: 100vw; }
}
</style>
