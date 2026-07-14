<template>
  <div class="packet">
    <div v-if="loading" class="state">Loading your onboarding packet…</div>
    <div v-else-if="error" class="state err">{{ error }}</div>
    <template v-else>
      <header>
        <p class="eyebrow">{{ agency.name || 'Welcome' }}</p>
        <h1>Your coaching onboarding</h1>
        <p class="sub">Step-by-step — package, payment, documents, then create your login.</p>
      </header>

      <nav class="steps" aria-label="Onboarding steps">
        <button
          v-for="s in stepDefs"
          :key="s.id"
          type="button"
          class="step-pill"
          :class="{ on: wizardStep === s.id, done: isStepDone(s.id), locked: !canVisit(s.id) }"
          :disabled="!canVisit(s.id)"
          @click="goStep(s.id)"
        >
          <span class="num">{{ s.n }}</span>
          {{ s.label }}
        </button>
      </nav>

      <!-- Done -->
      <div v-if="wizardStep === 'done'" class="card ok">
        <h2>You're all set</h2>
        <p>Your package is active and your login is ready. You can return anytime to see upcoming appointments.</p>
        <router-link v-if="agency.slug" class="primary link-btn" :to="`/${agency.slug}/client-dashboard`">
          Go to your dashboard →
        </router-link>
        <router-link v-else class="primary link-btn" to="/login">Log in →</router-link>
      </div>

      <!-- 1. Package -->
      <section v-else-if="wizardStep === 'package'" class="panel">
        <h2>1. Choose your package</h2>
        <div class="grid">
          <button
            v-for="pkg in packages"
            :key="pkg.id"
            type="button"
            class="card opt"
            :class="{ selected: selectedId === pkg.id }"
            @click="onSelectPkg(pkg)"
          >
            <h3>{{ pkg.name }}</h3>
            <p class="sessions">{{ pkg.session_count }} sessions</p>
            <p class="price">{{ formatMoney(displayPrice(pkg)) }}</p>
            <p v-if="pkg.description" class="desc">{{ pkg.description }}</p>
          </button>
        </div>
        <button type="button" class="primary" :disabled="!selectedId" @click="goStep('payment')">
          Continue to payment →
        </button>
      </section>

      <!-- 2. Payment -->
      <section v-else-if="wizardStep === 'payment'" class="panel">
        <h2>2. Payment</h2>
        <p v-if="selectedPkg" class="hint">{{ selectedPkg.name }} · {{ paymentHint }}</p>
        <div class="mode-row">
          <button
            v-for="m in selectedPkg?.allowed_payment_modes || []"
            :key="m"
            type="button"
            :class="{ on: paymentMode === m }"
            @click="paymentMode = m"
          >{{ labelMode(m) }}</button>
        </div>

        <div v-if="checkoutReady && stripeEnabled" class="stripe-box">
          <label class="lbl">Cardholder name
            <input v-model="cardholderName" type="text" autocomplete="cc-name" placeholder="Name on card" />
          </label>
          <div class="lbl">Card details
            <div ref="cardMountEl" class="stripe-el" />
          </div>
          <p v-if="stripeElementError" class="err">{{ stripeElementError }}</p>
        </div>
        <p v-else-if="checkoutReady && !stripeEnabled" class="hint">
          Card checkout isn’t connected yet — you can reserve now and your coach will follow up on payment.
        </p>

        <p v-if="selectError" class="err">{{ selectError }}</p>
        <div class="row-actions">
          <button type="button" class="ghost" @click="goStep('package')">← Back</button>
          <button type="button" class="primary" :disabled="!canPay || selecting" @click="confirmPayment">
            {{ selecting ? 'Processing…' : payButtonLabel }}
          </button>
        </div>
      </section>

      <!-- 3. Documents -->
      <section v-else-if="wizardStep === 'docs'" class="panel">
        <h2>3. Documents & forms</h2>
        <p class="hint">
          Complete each step using the same document process as onboarding. You’ll return here when finished.
        </p>
        <ul v-if="intakeLinks.length" class="doc-list">
          <li v-for="link in intakeLinks" :key="link.id" class="card doc-item" :class="{ done: isIntakeDone(link.id) }">
            <div>
              <strong>{{ link.title }}</strong>
              <p v-if="link.description" class="desc">{{ link.description }}</p>
            </div>
            <div class="doc-actions">
              <span v-if="isIntakeDone(link.id)" class="badge ok-badge">Done</span>
              <a
                v-else
                class="primary link-btn sm"
                :href="intakeUrl(link)"
                target="_blank"
                rel="noopener noreferrer"
              >Open &amp; complete →</a>
              <button
                v-if="!isIntakeDone(link.id)"
                type="button"
                class="ghost sm"
                :disabled="markingId === link.id"
                @click="markIntakeDone(link)"
              >{{ markingId === link.id ? '…' : 'Mark complete' }}</button>
            </div>
          </li>
        </ul>
        <p v-else class="hint">No documents were included — continue to create your login.</p>
        <p v-if="docsError" class="err">{{ docsError }}</p>
        <div class="row-actions">
          <button type="button" class="ghost" @click="goStep('payment')">← Back</button>
          <button type="button" class="primary" :disabled="!docsComplete" @click="goStep('account')">
            Continue to account setup →
          </button>
        </div>
      </section>

      <!-- 4. Account -->
      <section v-else-if="wizardStep === 'account'" class="panel">
        <h2>4. Create your login</h2>
        <p class="hint">Your email is your username. Use it to sign in later and see appointments.</p>
        <label class="lbl">Email (username)
          <input v-model="account.email" type="email" autocomplete="username" placeholder="you@email.com" />
        </label>
        <label class="lbl">First name
          <input v-model="account.firstName" type="text" autocomplete="given-name" />
        </label>
        <label class="lbl">Last name
          <input v-model="account.lastName" type="text" autocomplete="family-name" />
        </label>
        <label class="lbl">Password
          <input v-model="account.password" type="password" autocomplete="new-password" minlength="6" maxlength="128" />
        </label>
        <PasswordStrengthMeter :password="account.password" :confirm-password="account.confirm" />
        <label class="lbl">Confirm password
          <input v-model="account.confirm" type="password" autocomplete="new-password" minlength="6" maxlength="128" />
        </label>
        <p v-if="accountError" class="err">{{ accountError }}</p>
        <div class="row-actions">
          <button type="button" class="ghost" @click="goStep(intakeLinks.length ? 'docs' : 'payment')">← Back</button>
          <button type="button" class="primary" :disabled="!canCreateAccount || creatingAccount" @click="createAccount">
            {{ creatingAccount ? 'Creating…' : 'Create account & finish →' }}
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadStripe } from '@stripe/stripe-js';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter.vue';
import { buildFormUrl } from '../../utils/publicIntakeUrl';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const token = computed(() => String(route.params.token || '').trim());
const orgSlug = computed(() => String(route.params.organizationSlug || '').trim());

const loading = ref(true);
const error = ref('');
const selectError = ref('');
const docsError = ref('');
const accountError = ref('');
const selecting = ref(false);
const creatingAccount = ref(false);
const markingId = ref(null);

const packet = ref({ status: '', selectedPackageId: null, completedIntakeLinkIds: [], hasAccount: false });
const packages = ref([]);
const intakeLinks = ref([]);
const agency = ref({});
const selectedId = ref(null);
const paymentMode = ref('');
const stripeConfig = ref({ enabled: false, publishableKey: null, connectedAccountId: null });

const checkoutReady = ref(false);
const amountDue = ref(0);
const clientSecret = ref(null);
const paymentIntentId = ref(null);
const stripeEnabled = ref(false);
const cardholderName = ref('');
const stripeElementError = ref('');
const cardMountEl = ref(null);

const wizardStep = ref('package');
const account = ref({ email: '', firstName: '', lastName: '', password: '', confirm: '' });

let stripeInstance = null;
let stripeElements = null;
let stripeCardElement = null;

const selectedPkg = computed(() => packages.value.find((p) => p.id === selectedId.value) || null);
const paymentDone = computed(() => !!packet.value.selectedPackageId);
const docsComplete = computed(() => {
  if (!intakeLinks.value.length) return true;
  const done = new Set((packet.value.completedIntakeLinkIds || []).map(Number));
  return intakeLinks.value.every((l) => done.has(l.id));
});

const stepDefs = computed(() => {
  const steps = [
    { id: 'package', n: 1, label: 'Package' },
    { id: 'payment', n: 2, label: 'Payment' }
  ];
  if (intakeLinks.value.length) steps.push({ id: 'docs', n: 3, label: 'Documents' });
  steps.push({ id: 'account', n: intakeLinks.value.length ? 4 : 3, label: 'Account' });
  return steps;
});

const paymentHint = computed(() => {
  const p = selectedPkg.value;
  if (!p || !paymentMode.value) return '';
  if (paymentMode.value === 'PAY_IN_FULL') {
    return `Pay in full today: ${formatMoney(displayPrice(p))} for ${p.session_count} sessions.`;
  }
  if (paymentMode.value === 'INSTALLMENTS') {
    const chunks = p.installment_plan?.chunks || 4;
    return `Payment plan: first installment now (${chunks} payments total).`;
  }
  return `Pay per session: first session due now.`;
});

const canPay = computed(() => {
  if (!selectedId.value || !paymentMode.value || selecting.value) return false;
  if (paymentDone.value) return true;
  if (stripeEnabled.value && amountDue.value > 0) {
    return !!clientSecret.value && !!cardholderName.value.trim();
  }
  return checkoutReady.value;
});

const payButtonLabel = computed(() => {
  if (paymentDone.value) return 'Continue →';
  if (!stripeEnabled.value) return 'Reserve & continue →';
  if (amountDue.value < 1) return 'Activate & continue →';
  return `Pay ${formatMoney(amountDue.value)} →`;
});

const canCreateAccount = computed(() => {
  const a = account.value;
  if (!a.email.trim() || !a.password || !a.confirm) return false;
  if (a.password !== a.confirm) return false;
  if (a.password.length < 6 || a.password.length > 128) return false;
  if (!/[a-zA-Z]/.test(a.password)) return false;
  return paymentDone.value && docsComplete.value;
});

function formatMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(Number(cents || 0) % 100 === 0 ? 0 : 2)}`;
}
function displayPrice(pkg) {
  if (pkg.pay_in_full_price_cents != null) return pkg.pay_in_full_price_cents;
  if (pkg.pay_in_full_discount_cents) return Math.max(0, (pkg.price_cents || 0) - pkg.pay_in_full_discount_cents);
  return pkg.price_cents || 0;
}
function labelMode(m) {
  if (m === 'PAY_IN_FULL') return 'Pay in full';
  if (m === 'INSTALLMENTS') return 'Payment plan';
  if (m === 'PER_SESSION') return 'Per session';
  return m;
}
function isIntakeDone(id) {
  return (packet.value.completedIntakeLinkIds || []).map(Number).includes(Number(id));
}
function isStepDone(id) {
  if (id === 'package') return !!selectedId.value || paymentDone.value;
  if (id === 'payment') return paymentDone.value;
  if (id === 'docs') return docsComplete.value;
  if (id === 'account') return !!packet.value.hasAccount;
  return false;
}
function canVisit(id) {
  if (packet.value.hasAccount || packet.value.status === 'COMPLETED') return id === 'done';
  if (id === 'package') return true;
  if (id === 'payment') return !!selectedId.value || paymentDone.value;
  if (id === 'docs') return paymentDone.value;
  if (id === 'account') return paymentDone.value && docsComplete.value;
  return false;
}
function goStep(id) {
  if (!canVisit(id) && id !== 'done') return;
  wizardStep.value = id;
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    url.searchParams.set('step', id);
    window.history.replaceState({}, '', url.toString());
  }
}

function resolveInitialStep() {
  if (packet.value.hasAccount || packet.value.status === 'COMPLETED') return 'done';
  const q = String(route.query.step || '').trim();
  if (q && canVisit(q)) return q;
  if (!paymentDone.value) return selectedId.value ? 'payment' : 'package';
  if (!docsComplete.value) return 'docs';
  return 'account';
}

function intakeUrl(link) {
  const returnTo = `/${orgSlug.value}/packet/${token.value}?step=docs`;
  const formType = link.formType || link.form_type || 'intake';
  if (formType === 'life_balance_wheel') {
    return buildFormUrl(link.publicKey || link.public_key, formType, {
      returnTo,
      packetToken: token.value,
      clientId: packet.value.clientId || ''
    });
  }
  const base = buildFormUrl(link.publicKey || link.public_key, formType);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}returnTo=${encodeURIComponent(returnTo)}`;
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
  if (!stripeEnabled.value || !clientSecret.value || !stripeConfig.value.publishableKey) return;
  stripeInstance = await loadStripe(stripeConfig.value.publishableKey, {
    stripeAccount: stripeConfig.value.connectedAccountId
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

async function prepareCheckout() {
  if (paymentDone.value) {
    checkoutReady.value = true;
    return;
  }
  checkoutReady.value = false;
  clientSecret.value = null;
  paymentIntentId.value = null;
  amountDue.value = 0;
  destroyCard();
  if (!selectedId.value || !paymentMode.value) return;
  try {
    const res = await api.post(
      `/practitioner-packages/public/packets/${encodeURIComponent(token.value)}/checkout`,
      { packageId: selectedId.value, paymentMode: paymentMode.value },
      { skipAuthRedirect: true }
    );
    stripeEnabled.value = !!res.data?.stripeEnabled;
    amountDue.value = Number(res.data?.amountCents || 0);
    clientSecret.value = res.data?.clientSecret || null;
    paymentIntentId.value = res.data?.paymentIntentId || null;
    if (res.data?.publishableKey) {
      stripeConfig.value = {
        enabled: !!res.data.stripeEnabled,
        publishableKey: res.data.publishableKey,
        connectedAccountId: res.data.connectedAccountId
      };
    }
    checkoutReady.value = true;
    if (stripeEnabled.value && clientSecret.value) await mountCard();
  } catch (e) {
    selectError.value = e.response?.data?.error?.message || e.message || 'Could not start checkout.';
    checkoutReady.value = false;
  }
}

function onSelectPkg(pkg) {
  selectedId.value = pkg.id;
  paymentMode.value = pkg.allowed_payment_modes?.[0] || pkg.payment_mode_default || 'PAY_IN_FULL';
}

watch([selectedId, paymentMode, wizardStep], ([, , step]) => {
  if (step === 'payment') prepareCheckout();
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/practitioner-packages/public/packets/${encodeURIComponent(token.value)}`, {
      skipAuthRedirect: true
    });
    packet.value = res.data?.packet || {};
    packages.value = res.data?.packages || [];
    intakeLinks.value = res.data?.intakeLinks || [];
    agency.value = res.data?.agency || {};
    stripeConfig.value = res.data?.stripe || { enabled: false };
    stripeEnabled.value = !!stripeConfig.value.enabled;
    if (packet.value.selectedPackageId) {
      selectedId.value = packet.value.selectedPackageId;
      paymentMode.value = packet.value.selectedPaymentMode || 'PAY_IN_FULL';
    } else if (packages.value[0]) {
      selectedId.value = packages.value[0].id;
      paymentMode.value = packages.value[0].allowed_payment_modes?.[0] || packages.value[0].payment_mode_default || 'PAY_IN_FULL';
    }
    wizardStep.value = resolveInitialStep();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not load packet.';
  } finally {
    loading.value = false;
  }
}

async function confirmPayment() {
  if (paymentDone.value) {
    goStep(intakeLinks.value.length ? 'docs' : 'account');
    return;
  }
  if (!selectedId.value || !paymentMode.value) return;
  selecting.value = true;
  selectError.value = '';
  stripeElementError.value = '';
  try {
    let piId = paymentIntentId.value || null;
    if (stripeEnabled.value && clientSecret.value && amountDue.value > 0) {
      if (!stripeInstance || !stripeCardElement) {
        selectError.value = 'Payment form is not ready. Please refresh and try again.';
        return;
      }
      const { error: stripeErr, paymentIntent } = await stripeInstance.confirmCardPayment(clientSecret.value, {
        payment_method: {
          card: stripeCardElement,
          billing_details: { name: cardholderName.value.trim() }
        }
      });
      if (stripeErr) {
        selectError.value = stripeErr.message || 'Payment failed.';
        return;
      }
      if (paymentIntent?.status !== 'succeeded') {
        selectError.value = 'Payment was not completed. Please try again.';
        return;
      }
      piId = paymentIntent.id;
    }

    await api.post(
      `/practitioner-packages/public/packets/${encodeURIComponent(token.value)}/confirm`,
      {
        packageId: selectedId.value,
        paymentMode: paymentMode.value,
        paymentIntentId: piId
      },
      { skipAuthRedirect: true }
    );
    packet.value = {
      ...packet.value,
      status: 'IN_PROGRESS',
      selectedPackageId: selectedId.value,
      selectedPaymentMode: paymentMode.value
    };
    goStep(intakeLinks.value.length ? 'docs' : 'account');
  } catch (e) {
    selectError.value = e.response?.data?.error?.message || e.message || 'Could not complete payment.';
  } finally {
    selecting.value = false;
  }
}

async function markIntakeDone(link) {
  markingId.value = link.id;
  docsError.value = '';
  try {
    const res = await api.post(
      `/practitioner-packages/public/packets/${encodeURIComponent(token.value)}/mark-intake`,
      { intakeLinkId: link.id },
      { skipAuthRedirect: true }
    );
    packet.value = {
      ...packet.value,
      completedIntakeLinkIds: res.data?.packet?.completedIntakeLinkIds || []
    };
  } catch (e) {
    docsError.value = e.response?.data?.error?.message || e.message || 'Could not mark document complete.';
  } finally {
    markingId.value = null;
  }
}

async function createAccount() {
  if (!canCreateAccount.value) return;
  creatingAccount.value = true;
  accountError.value = '';
  try {
    const res = await api.post(
      `/practitioner-packages/public/packets/${encodeURIComponent(token.value)}/create-account`,
      {
        email: account.value.email.trim(),
        password: account.value.password,
        firstName: account.value.firstName.trim() || null,
        lastName: account.value.lastName.trim() || null
      },
      { skipAuthRedirect: true }
    );
    if (res.data?.user && res.data?.token) {
      authStore.setAuth(res.data.token, res.data.user);
    }
    packet.value = { ...packet.value, status: 'COMPLETED', hasAccount: true };
    wizardStep.value = 'done';
    if (agency.value.slug) {
      await router.replace(`/${agency.value.slug}/client-dashboard`).catch(() => {});
    }
  } catch (e) {
    accountError.value = e.response?.data?.error?.message || e.message || 'Could not create account.';
  } finally {
    creatingAccount.value = false;
  }
}

onMounted(load);
onBeforeUnmount(destroyCard);
</script>

<style scoped>
.packet { max-width: 860px; margin: 0 auto; padding: 1.5rem 1.25rem 2.5rem; font-family: system-ui, sans-serif; }
.eyebrow { color: #1b4332; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.72rem; }
h1 { margin: 0.2rem 0; color: #1b4332; }
h2 { margin: 0 0 0.75rem; color: #1b4332; font-size: 1.15rem; }
.sub { color: #64748b; }
.steps { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 1rem 0 1.25rem; }
.step-pill {
  display: inline-flex; align-items: center; gap: 0.35rem;
  border: 1px solid #d1d5db; background: #fff; border-radius: 999px;
  padding: 0.35rem 0.7rem; font-size: 0.78rem; font-weight: 700; color: #64748b; cursor: pointer;
}
.step-pill .num {
  width: 1.25rem; height: 1.25rem; border-radius: 999px; background: #e2e8f0;
  display: grid; place-items: center; font-size: 0.7rem;
}
.step-pill.on { border-color: #1b4332; color: #1b4332; background: rgba(27,67,50,0.06); }
.step-pill.done { border-color: #059669; color: #047857; }
.step-pill.locked { opacity: 0.45; cursor: not-allowed; }
.panel { display: grid; gap: 0.75rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 1rem; }
.opt { text-align: left; cursor: pointer; }
.opt.selected { border-color: #1b4332; box-shadow: 0 0 0 2px rgba(27,67,50,0.15); }
.sessions { color: #64748b; margin: 0.2rem 0; }
.price { font-size: 1.25rem; font-weight: 800; color: #1b4332; margin: 0.2rem 0; }
.desc { font-size: 0.85rem; color: #475569; margin: 0.25rem 0 0; }
.mode-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.mode-row button { border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: 0.35rem 0.7rem; cursor: pointer; }
.mode-row button.on { background: #1b4332; color: #fff; border-color: #1b4332; }
.primary {
  background: #1b4332; color: #fff; border: none; border-radius: 10px;
  padding: 0.7rem 1rem; font-weight: 800; cursor: pointer; text-decoration: none;
  display: inline-flex; align-items: center; justify-content: center;
}
.primary:disabled { opacity: 0.55; cursor: not-allowed; }
.primary.sm, .ghost.sm { padding: 0.4rem 0.7rem; font-size: 0.8rem; border-radius: 8px; }
.ghost {
  background: #fff; color: #334155; border: 1px solid #d1d5db; border-radius: 10px;
  padding: 0.65rem 0.9rem; font-weight: 700; cursor: pointer;
}
.ghost:disabled { opacity: 0.55; }
.hint { color: #64748b; font-size: 0.85rem; margin: 0; }
.err { color: #b91c1c; margin: 0; }
.state { padding: 2rem; text-align: center; }
.ok { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; display: grid; gap: 0.75rem; }
.stripe-box { display: grid; gap: 0.65rem; margin: 0.5rem 0; }
.lbl { display: grid; gap: 0.3rem; font-size: 0.8rem; font-weight: 700; color: #475569; }
.lbl input {
  border: 1px solid #d1d5db; border-radius: 8px; padding: 0.5rem 0.6rem; font: inherit; font-weight: 500;
}
.stripe-el { border: 1px solid #d1d5db; border-radius: 8px; padding: 0.65rem 0.7rem; background: #fff; }
.row-actions { display: flex; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.35rem; }
.doc-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
.doc-item { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
.doc-item.done { border-color: #a7f3d0; background: #f0fdf4; }
.doc-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
.badge { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
.ok-badge { color: #047857; }
.link-btn { text-decoration: none; }
</style>
