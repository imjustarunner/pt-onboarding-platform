<template>
  <div class="gtd">
    <header class="gtd-hero">
      <div>
        <p class="gtd-kicker">Tutoring journey</p>
        <h2 class="gtd-title">Welcome{{ guardianFirstName ? `, ${guardianFirstName}` : '' }}</h2>
        <p class="gtd-sub">Here’s an overview of {{ studentName }}’s tutoring progress, sessions, and practice.</p>
      </div>
      <button type="button" class="gtd-btn" :disabled="loading" @click="load">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </button>
    </header>

    <p v-if="error" class="gtd-error">{{ error }}</p>

    <section class="gtd-student-bar">
      <div class="gtd-avatar">{{ initials }}</div>
      <div class="gtd-student-copy">
        <strong>{{ studentName }}</strong>
        <span>{{ gradeSubjectsLine }}</span>
        <span class="gtd-badge">Active</span>
      </div>
      <div class="gtd-student-meta">
        <div>
          <div class="gtd-label">Next session</div>
          <div>{{ nextSessionLabel }}</div>
        </div>
        <div>
          <div class="gtd-label">Tutor</div>
          <div>{{ nextTutorLabel }}</div>
        </div>
        <div>
          <div class="gtd-label">Program</div>
          <div>{{ programLabel }}</div>
        </div>
      </div>
    </section>

    <div class="gtd-grid">
      <section class="gtd-card">
        <h3>Your packages</h3>
        <div v-if="packageTotals.activePackages">
          <p>
            <strong>{{ packageTotals.sessionsRemaining }}</strong> sessions remaining
            <span class="gtd-muted"> · {{ packageTotals.sessionsReserved }} reserved</span>
          </p>
          <ul class="gtd-list">
            <li v-for="e in entitlements" :key="e.id">
              <div>
                <strong>{{ e.packageName || 'Package' }}</strong>
                <div class="gtd-muted">{{ e.sessionsRemaining }} of {{ e.sessionsPurchased }} left</div>
              </div>
            </li>
          </ul>
        </div>
        <p v-else class="gtd-muted">No active session package yet. Purchase a package to book tutoring sessions.</p>
        <p v-if="legacyTokenBalance > 0" class="gtd-legacy">
          Legacy token balance: {{ legacyTokenBalance }} (still honored until used).
        </p>
        <button type="button" class="gtd-btn" @click="openBuyDrawer">Buy a package</button>
      </section>

      <section class="gtd-card">
        <h3>Progress overview</h3>
        <div class="gtd-progress-ring">
          <strong>{{ dashboard.overallProgress || 0 }}%</strong>
          <span>Overall progress</span>
        </div>
        <p class="gtd-muted">
          {{ encouragement }}
        </p>
        <div v-for="bar in (dashboard.skillBars || []).slice(0, 4)" :key="`${bar.subjectLabel}-${bar.title}`" class="gtd-skill">
          <div class="gtd-skill-head">
            <span>{{ bar.title }}</span>
            <span>{{ bar.progressPct }}%</span>
          </div>
          <div class="gtd-bar"><div class="gtd-bar-fill" :style="{ width: `${bar.progressPct}%` }" /></div>
          <div v-if="bar.standardCode || bar.subjectLabel" class="gtd-muted small">
            {{ bar.subjectLabel }}<template v-if="bar.standardCode"> · Colorado {{ bar.standardCode }}</template>
          </div>
        </div>
        <p v-if="!(dashboard.skillBars || []).length" class="gtd-muted">Skill progress will appear after tutoring sessions are recorded.</p>
      </section>

      <section class="gtd-card">
        <h3>Upcoming sessions</h3>
        <ul class="gtd-list">
          <li v-for="s in (dashboard.upcomingSessions || [])" :key="s.id">
            <div>
              <strong>{{ formatWhen(s.starts_at) }}</strong>
              <div class="gtd-muted">{{ s.title || 'Tutoring session' }} · {{ s.provider_name || 'Tutor' }}</div>
            </div>
            <span class="gtd-badge" :class="s.status === 'confirmed' || s.status === 'scheduled' ? 'ok' : ''">
              {{ statusLabel(s.status) }}
            </span>
            <button type="button" class="gtd-btn sm" @click="joinSession(s)">Join</button>
          </li>
        </ul>
        <p v-if="!(dashboard.upcomingSessions || []).length" class="gtd-muted">No upcoming sessions yet.</p>
      </section>

      <section class="gtd-card">
        <h3>Assignments</h3>
        <ul class="gtd-list">
          <li v-for="a in openPractice" :key="a.id" class="gtd-assign">
            <div>
              <strong>{{ a.title }}</strong>
              <div class="gtd-muted">{{ a.subjectLabel || '' }} · {{ a.status }}</div>
              <p v-if="a.instructions" class="gtd-muted">{{ a.instructions }}</p>
              <ol v-if="(a.practiceItems || a.practice_items_json || []).length">
                <li v-for="(item, idx) in (a.practiceItems || a.practice_items_json || []).slice(0, 4)" :key="idx">
                  {{ item.prompt || item }}
                </li>
              </ol>
            </div>
            <button
              v-if="a.status !== 'completed'"
              type="button"
              class="gtd-btn sm"
              :disabled="savingId === a.id"
              @click="completePractice(a.id)"
            >
              Mark done
            </button>
            <span v-else class="gtd-badge ok">Completed</span>
          </li>
        </ul>
        <p v-if="!openPractice.length" class="gtd-muted">No practice assignments yet. After tutoring sessions, home practice will appear here.</p>
      </section>

      <section class="gtd-card">
        <h3>Recent session summary</h3>
        <div v-if="latestUpdate">
          <div class="gtd-muted">{{ formatWhen(latestUpdate.at) }} · {{ latestUpdate.subjectLabel }}</div>
          <p>{{ latestUpdate.text }}</p>
        </div>
        <div v-else-if="(dashboard.publishedReports || [])[0]">
          <strong>{{ dashboard.publishedReports[0].title }}</strong>
          <p class="gtd-muted">{{ dashboard.publishedReports[0].subjectLabel }}</p>
        </div>
        <p v-else class="gtd-muted">Session updates from your tutor will show here.</p>
      </section>
    </div>

    <div v-if="buyOpen" class="gtd-drawer-backdrop" @click.self="closeBuyDrawer">
      <div class="gtd-drawer">
        <header class="gtd-drawer-head">
          <h3>Buy a package</h3>
          <button type="button" class="gtd-btn sm" @click="closeBuyDrawer">Close</button>
        </header>
        <p v-if="buyError" class="gtd-error">{{ buyError }}</p>
        <div v-if="catalogLoading" class="gtd-muted">Loading catalog…</div>
        <ul v-else class="gtd-list">
          <li
            v-for="pkg in catalog"
            :key="pkg.id"
            class="gtd-pkg"
            :class="{ selected: selectedPackageId === pkg.id }"
            @click="selectedPackageId = pkg.id"
          >
            <div>
              <strong>{{ pkg.name }}</strong>
              <div class="gtd-muted">
                {{ pkg.sessionCount }} sessions · {{ formatMoney(pkg.priceCents) }}
                <template v-if="pkg.programName"> · {{ pkg.programName }}</template>
                <template v-else> · Individual</template>
              </div>
              <p v-if="pkg.description" class="gtd-muted">{{ pkg.description }}</p>
            </div>
          </li>
        </ul>
        <p v-if="!catalogLoading && !catalog.length" class="gtd-muted">No public packages available yet.</p>

        <div v-if="checkoutReady && stripeEnabled && amountDue > 0" class="gtd-pay">
          <label>Cardholder name<input v-model="cardholderName" type="text" /></label>
          <div ref="cardMountEl" class="gtd-card-mount" />
          <p v-if="stripeElementError" class="gtd-error">{{ stripeElementError }}</p>
        </div>

        <button
          type="button"
          class="gtd-btn primary"
          :disabled="!selectedPackageId || buying"
          @click="purchaseSelected"
        >
          {{ buying ? 'Processing…' : (amountDue > 0 ? `Pay ${formatMoney(amountDue)}` : 'Activate package') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { loadStripe } from '@stripe/stripe-js';
import * as los from '@/services/tutoringLearningOs';
import * as unifiedPackages from '@/services/unifiedPackages';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  studentName: { type: String, default: 'your student' },
  guardianFirstName: { type: String, default: '' },
  organizationSlug: { type: String, default: '' }
});

const router = useRouter();
const loading = ref(false);
const savingId = ref(null);
const error = ref('');
const dashboard = ref({
  overallProgress: 0,
  skillBars: [],
  upcomingSessions: [],
  practice: [],
  recentParentUpdates: [],
  publishedReports: [],
  subjects: [],
  nextSession: null
});

const entitlements = ref([]);
const packageTotals = ref({
  sessionsRemaining: 0,
  sessionsReserved: 0,
  sessionsPurchased: 0,
  activePackages: 0
});
const legacyTokenBalance = ref(0);

const buyOpen = ref(false);
const catalog = ref([]);
const catalogLoading = ref(false);
const selectedPackageId = ref(null);
const buyError = ref('');
const buying = ref(false);
const checkoutReady = ref(false);
const stripeEnabled = ref(false);
const amountDue = ref(0);
const clientSecret = ref(null);
const paymentIntentId = ref(null);
const publishableKey = ref(null);
const connectedAccountId = ref(null);
const cardholderName = ref('');
const stripeElementError = ref('');
const cardMountEl = ref(null);

let stripeInstance = null;
let stripeElements = null;
let stripeCardElement = null;

const formatMoney = unifiedPackages.formatMoney;

const initials = computed(() => {
  const parts = String(props.studentName || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
});

const gradeSubjectsLine = computed(() => {
  const subjects = (dashboard.value.subjects || []).map((s) => s.subject?.subject_label).filter(Boolean);
  const grade = dashboard.value.subjects?.[0]?.subject?.school_grade;
  const bits = [];
  if (grade) bits.push(`Grade ${grade}`);
  if (subjects.length) bits.push(subjects.join(' & '));
  return bits.join(' · ') || 'Tutoring';
});

const programLabel = computed(() => {
  const labels = (dashboard.value.subjects || []).map((s) => s.subject?.subject_label).filter(Boolean);
  return labels[0] ? `${labels[0]} support` : 'Tutoring support';
});

const nextSessionLabel = computed(() => {
  const s = dashboard.value.nextSession;
  if (!s?.starts_at) return 'Not scheduled';
  return formatWhen(s.starts_at);
});

const nextTutorLabel = computed(() => dashboard.value.nextSession?.provider_name || 'Your tutor');

const encouragement = computed(() => {
  const pct = Number(dashboard.value.overallProgress) || 0;
  if (pct >= 70) return `Great job, ${props.studentName}! Strong progress toward learning goals.`;
  if (pct >= 40) return `${props.studentName} is building skills steadily. Keep practicing between sessions.`;
  return `Practice between sessions helps ${props.studentName} grow confidence with each tutoring visit.`;
});

const openPractice = computed(() => dashboard.value.practice || []);

const latestUpdate = computed(() => (dashboard.value.recentParentUpdates || [])[0] || null);

function statusLabel(s) {
  return String(s || 'scheduled').replace(/_/g, ' ');
}

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(value);
  }
}

function sessionUrl(s) {
  const id = s.id;
  const slug = props.organizationSlug;
  const inPerson = String(s.delivery_context || '').toLowerCase() === 'in_person';
  if (slug) {
    return inPerson
      ? `/${slug}/in-person-tutoring-session/${id}`
      : `/${slug}/tutoring-session/${id}`;
  }
  return inPerson ? `/in-person-tutoring-session/${id}` : `/tutoring-session/${id}`;
}

function joinSession(s) {
  router.push(sessionUrl(s));
}

function destroyCard() {
  if (stripeCardElement) {
    try { stripeCardElement.destroy(); } catch { /* ignore */ }
    stripeCardElement = null;
  }
  stripeElements = null;
}

async function mountCard() {
  destroyCard();
  if (!stripeEnabled.value || !clientSecret.value || !publishableKey.value) return;
  stripeInstance = await loadStripe(publishableKey.value, {
    stripeAccount: connectedAccountId.value || undefined
  });
  if (!stripeInstance) return;
  stripeElements = stripeInstance.elements();
  await nextTick();
  const mount = cardMountEl.value;
  if (!mount) return;
  stripeCardElement = stripeElements.create('card', {
    style: {
      base: {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#1e293b',
        '::placeholder': { color: '#94a3b8' }
      }
    }
  });
  stripeCardElement.mount(mount);
  stripeCardElement.on('change', (e) => {
    stripeElementError.value = e.error ? e.error.message : '';
  });
}

async function loadPackages() {
  if (!props.clientId) return;
  try {
    const data = await unifiedPackages.listGuardianEntitlements(props.clientId, {
      businessType: 'tutoring'
    });
    entitlements.value = data?.entitlements || [];
    packageTotals.value = data?.totals || {
      sessionsRemaining: 0,
      sessionsReserved: 0,
      sessionsPurchased: 0,
      activePackages: 0
    };
    legacyTokenBalance.value = Number(data?.legacyTokenBalance || 0);
  } catch {
    entitlements.value = [];
  }
}

async function openBuyDrawer() {
  buyOpen.value = true;
  buyError.value = '';
  selectedPackageId.value = null;
  checkoutReady.value = false;
  catalogLoading.value = true;
  try {
    const data = await unifiedPackages.listGuardianPackages(props.clientId, {
      businessType: 'tutoring'
    });
    catalog.value = data?.packages || [];
    if (catalog.value[0]) {
      selectedPackageId.value = catalog.value[0].id;
      await prepareCheckout();
    }
  } catch (e) {
    buyError.value = e.response?.data?.error?.message || e.message || 'Could not load packages';
  } finally {
    catalogLoading.value = false;
  }
}

function closeBuyDrawer() {
  buyOpen.value = false;
  destroyCard();
  checkoutReady.value = false;
}

async function prepareCheckout() {
  if (!selectedPackageId.value || !buyOpen.value) return;
  buyError.value = '';
  checkoutReady.value = false;
  destroyCard();
  amountDue.value = 0;
  clientSecret.value = null;
  paymentIntentId.value = null;
  try {
    const res = await unifiedPackages.checkoutGuardianPackage(props.clientId, selectedPackageId.value, {
      paymentMode: 'PAY_IN_FULL'
    });
    if (res.free) {
      await loadPackages();
      closeBuyDrawer();
      return;
    }
    stripeEnabled.value = !!res.stripeEnabled;
    amountDue.value = Number(res.amountCents || 0);
    clientSecret.value = res.clientSecret || null;
    paymentIntentId.value = res.paymentIntentId || null;
    publishableKey.value = res.publishableKey || null;
    connectedAccountId.value = res.connectedAccountId || null;
    checkoutReady.value = true;
    if (stripeEnabled.value && clientSecret.value) await mountCard();
  } catch (e) {
    buyError.value = e.response?.data?.error?.message || e.message || 'Checkout failed';
    checkoutReady.value = false;
  }
}

async function purchaseSelected() {
  if (!selectedPackageId.value) return;
  buying.value = true;
  buyError.value = '';
  try {
    if (!checkoutReady.value || !clientSecret.value) {
      await prepareCheckout();
      if (!buyOpen.value) return;
      if (stripeEnabled.value && amountDue.value > 0) {
        // Card form ready — user can click Pay again after entering card
        return;
      }
    }
    if (stripeEnabled.value && clientSecret.value && amountDue.value > 0) {
      if (!stripeInstance || !stripeCardElement) await mountCard();
      const { error: stripeErr, paymentIntent } = await stripeInstance.confirmCardPayment(clientSecret.value, {
        payment_method: {
          card: stripeCardElement,
          billing_details: { name: cardholderName.value || undefined }
        }
      });
      if (stripeErr) {
        buyError.value = stripeErr.message || 'Payment failed';
        return;
      }
      await unifiedPackages.confirmGuardianPackage(props.clientId, selectedPackageId.value, {
        paymentIntentId: paymentIntent?.id || paymentIntentId.value
      });
      await loadPackages();
      closeBuyDrawer();
    }
  } catch (e) {
    buyError.value = e.response?.data?.error?.message || e.message || 'Purchase failed';
  } finally {
    buying.value = false;
  }
}

async function load() {
  if (!props.clientId) return;
  loading.value = true;
  error.value = '';
  try {
    dashboard.value = await los.fetchGuardianTutoringDashboard(props.clientId);
    await loadPackages();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not load tutoring dashboard';
  } finally {
    loading.value = false;
  }
}

async function completePractice(id) {
  savingId.value = id;
  try {
    await los.completePracticeAssignment(id);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message;
  } finally {
    savingId.value = null;
  }
}

watch(() => props.clientId, load);
watch(selectedPackageId, async (id, prev) => {
  if (buyOpen.value && id && id !== prev) {
    await prepareCheckout();
  }
});
onMounted(load);
onBeforeUnmount(destroyCard);
</script>

<style scoped>
.gtd { display: flex; flex-direction: column; gap: 1rem; }
.gtd-hero { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
.gtd-kicker { margin: 0; font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; }
.gtd-title { margin: 0.2rem 0; font-size: 1.45rem; color: #0f172a; }
.gtd-sub { margin: 0; color: #64748b; }
.gtd-student-bar {
  display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 1rem 1.1rem;
}
.gtd-avatar {
  width: 52px; height: 52px; border-radius: 999px; background: #1e3a5f; color: #fff;
  display: grid; place-items: center; font-weight: 700;
}
.gtd-student-copy { display: flex; flex-direction: column; gap: 0.15rem; min-width: 140px; }
.gtd-student-meta { display: flex; flex-wrap: wrap; gap: 1.25rem; margin-left: auto; }
.gtd-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
.gtd-badge {
  display: inline-flex; align-self: flex-start; font-size: 0.72rem; border-radius: 999px;
  padding: 0.15rem 0.5rem; background: #ecfdf5; color: #047857;
}
.gtd-badge.ok { background: #ecfdf5; color: #047857; }
.gtd-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}
@media (max-width: 900px) {
  .gtd-grid { grid-template-columns: 1fr; }
}
.gtd-card {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 1rem;
  display: flex; flex-direction: column; gap: 0.65rem;
}
.gtd-card h3 { margin: 0; font-size: 1rem; }
.gtd-progress-ring {
  width: 110px; height: 110px; border-radius: 999px; border: 8px solid #bbf7d0;
  display: grid; place-items: center; text-align: center; margin: 0.25rem 0;
}
.gtd-progress-ring strong { font-size: 1.35rem; display: block; }
.gtd-progress-ring span { font-size: 0.7rem; color: #64748b; }
.gtd-skill { display: flex; flex-direction: column; gap: 0.25rem; }
.gtd-skill-head { display: flex; justify-content: space-between; font-size: 0.88rem; }
.gtd-bar { height: 8px; background: #e2e8f0; border-radius: 999px; overflow: hidden; }
.gtd-bar-fill { height: 100%; background: #16a34a; }
.gtd-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.gtd-list li { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-start; justify-content: space-between; }
.gtd-assign ol { margin: 0.35rem 0 0; padding-left: 1.1rem; font-size: 0.86rem; }
.gtd-muted { color: #64748b; font-size: 0.88rem; margin: 0; }
.gtd-muted.small { font-size: 0.78rem; }
.gtd-error { color: #b91c1c; }
.gtd-btn {
  border: 1px solid #cbd5e1; background: #fff; border-radius: 8px;
  padding: 0.4rem 0.75rem; font-size: 0.85rem; cursor: pointer;
}
.gtd-btn.sm { padding: 0.3rem 0.55rem; font-size: 0.8rem; }
.gtd-btn.primary { background: #0f766e; color: #fff; border-color: #0f766e; margin-top: 0.75rem; width: 100%; }
.gtd-legacy { font-size: 0.8rem; color: #92400e; background: #fffbeb; padding: 0.4rem 0.55rem; border-radius: 8px; }
.gtd-drawer-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
  display: flex; justify-content: flex-end; z-index: 90;
}
.gtd-drawer {
  width: min(420px, 100%); background: #fff; height: 100%; padding: 1rem;
  overflow: auto; display: flex; flex-direction: column; gap: 0.75rem;
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.15);
}
.gtd-drawer-head { display: flex; justify-content: space-between; align-items: center; }
.gtd-drawer-head h3 { margin: 0; }
.gtd-pkg {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.75rem; cursor: pointer;
}
.gtd-pkg.selected { border-color: #0f766e; box-shadow: 0 0 0 1px #0f766e inset; }
.gtd-pay { display: flex; flex-direction: column; gap: 0.5rem; }
.gtd-pay label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
.gtd-pay input { border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.4rem 0.55rem; }
.gtd-card-mount { border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.65rem; }
</style>
