<template>
  <div class="pkg-tab">
    <div v-if="loading" class="muted">Loading packages &amp; payments…</div>
    <div v-else-if="error" class="err">{{ error }}</div>
    <template v-else>
      <section class="summary">
        <div class="stat">
          <span class="lbl">Sessions remaining</span>
          <strong>{{ overview.balance?.remaining ?? 0 }}</strong>
        </div>
        <div class="stat">
          <span class="lbl">Credits / used</span>
          <strong>{{ overview.balance?.credits ?? 0 }} / {{ overview.balance?.debits ?? 0 }}</strong>
        </div>
        <div v-if="overview.continuation?.exhausted" class="continuation">
          <p class="warn">Package exhausted — choose how to continue:</p>
          <div class="cta-row">
            <button type="button" class="btn btn-primary btn-sm" @click="$emit('reup')">Re-up same package</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="$emit('send-packet')">Send new package</button>
            <button type="button" class="btn btn-secondary btn-sm" @click="$emit('pay-per-session')">Pay per session</button>
          </div>
        </div>
      </section>

      <section>
        <h3>Packages</h3>
        <div v-if="!overview.entitlements?.length" class="muted">No packages yet.</div>
        <div v-else class="list">
          <article
            v-for="e in overview.entitlements"
            :id="`entitlement-${e.id}`"
            :key="e.id"
            class="card"
            :class="{ active: e.status === 'ACTIVE', exhausted: e.status === 'EXHAUSTED' }"
          >
            <div class="head">
              <strong>{{ e.packageName }}</strong>
              <span class="badge">{{ e.status }}</span>
            </div>
            <p class="meta">
              {{ e.sessionLabel }} · {{ e.paymentMode || '—' }} · payment {{ e.paymentStatus || '—' }}
            </p>
            <p v-if="e.activatedAt" class="meta">Activated {{ formatDate(e.activatedAt) }}</p>
            <p v-if="e.packetCompletedAt" class="meta">Packet signed/completed {{ formatDate(e.packetCompletedAt) }}</p>
          </article>
        </div>
      </section>

      <section>
        <h3>Payments</h3>
        <div v-if="!overview.payments?.length" class="muted">No payments recorded yet.</div>
        <div v-else class="list">
          <article
            v-for="p in overview.payments"
            :id="`payment-${p.id}`"
            :key="p.id"
            class="card"
          >
            <div class="head">
              <strong>{{ formatMoney(p.amountCents) }}</strong>
              <span class="badge">{{ p.paymentStatus }}</span>
            </div>
            <p class="meta">
              {{ p.packageName || 'Package' }} · {{ labelMode(p.paymentMode) }}
              <template v-if="p.installmentIndex"> · installment {{ p.installmentIndex }}</template>
              <template v-if="p.sessionsCovered"> · covers {{ p.sessionsCovered }} session(s)</template>
            </p>
            <p class="meta">
              Chosen {{ formatDate(p.chosenAt) || '—' }}
              · Signed {{ formatDate(p.signedAt) || '—' }}
              · Paid {{ formatDate(p.paidAt) || '—' }}
            </p>
            <p v-if="p.entitlementId" class="meta">
              <a href="#" @click.prevent="scrollTo(`entitlement-${p.entitlementId}`)">View package →</a>
            </p>
          </article>
        </div>
      </section>

      <section>
        <h3>Sessions</h3>
        <div v-if="!overview.sessions?.length" class="muted">No coaching/discovery sessions on the calendar yet.</div>
        <div v-else class="list">
          <article v-for="s in overview.sessions" :key="s.id" class="card">
            <div class="head">
              <strong>{{ s.sessionOfLabel || s.title }}</strong>
              <span class="badge">{{ s.kind }}</span>
            </div>
            <p class="meta">{{ formatDate(s.startAt) }}</p>
            <p v-if="s.packageName" class="meta">
              Package:
              <a
                v-if="s.entitlementId"
                href="#"
                @click.prevent="scrollTo(`entitlement-${s.entitlementId}`)"
              >{{ s.packageName }}</a>
              <span v-else>{{ s.packageName }}</span>
            </p>
            <p v-if="s.payment" class="meta">
              Payment:
              <a href="#" @click.prevent="scrollTo(`payment-${s.payment.id}`)">
                {{ formatMoney(s.payment.amountCents) }} · {{ labelMode(s.payment.paymentMode) }}
              </a>
            </p>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import api from '../../services/api';

const props = defineProps({
  agencyId: { type: [Number, String], required: true },
  clientId: { type: [Number, String], required: true },
  focusPaymentId: { type: [Number, String], default: null },
  focusEntitlementId: { type: [Number, String], default: null }
});

defineEmits(['reup', 'send-packet', 'pay-per-session']);

const loading = ref(true);
const error = ref('');
const overview = ref({
  balance: {},
  entitlements: [],
  payments: [],
  sessions: [],
  continuation: {}
});

function formatMoney(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(Number(cents || 0) % 100 === 0 ? 0 : 2)}`;
}
function formatDate(d) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleString();
}
function labelMode(m) {
  if (m === 'PAY_IN_FULL') return 'Pay in full';
  if (m === 'INSTALLMENTS') return 'Payment plan';
  if (m === 'PER_SESSION') return 'Per session';
  if (m === 'REUP') return 'Re-up';
  return m || '—';
}
function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get(`/practitioner-packages/clients/${props.clientId}/package-overview`, {
      params: { agencyId: props.agencyId }
    });
    overview.value = {
      balance: res.data?.balance || {},
      entitlements: res.data?.entitlements || [],
      payments: res.data?.payments || [],
      sessions: res.data?.sessions || [],
      continuation: res.data?.continuation || {}
    };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Could not load packages.';
  } finally {
    loading.value = false;
    setTimeout(() => {
      if (props.focusPaymentId) scrollTo(`payment-${props.focusPaymentId}`);
      if (props.focusEntitlementId) scrollTo(`entitlement-${props.focusEntitlementId}`);
    }, 50);
  }
}

watch(() => [props.clientId, props.agencyId], load);
onMounted(load);
</script>

<style scoped>
.pkg-tab { display: grid; gap: 1.25rem; }
.summary {
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-start;
  padding: 0.75rem; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;
}
.stat { min-width: 120px; }
.stat .lbl { display: block; font-size: 0.72rem; color: #64748b; font-weight: 700; text-transform: uppercase; }
.stat strong { font-size: 1.25rem; color: #0f172a; }
.continuation { flex: 1 1 100%; }
.warn { color: #b45309; font-weight: 700; margin: 0 0 0.4rem; }
.cta-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.list { display: grid; gap: 0.55rem; }
.card {
  border: 1px solid #e5e7eb; border-radius: 12px; padding: 0.75rem; background: #fff;
}
.card.active { border-color: #059669; }
.card.exhausted { opacity: 0.85; }
.head { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; }
.badge {
  font-size: 0.68rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
  color: #475569; background: #f1f5f9; border-radius: 999px; padding: 0.15rem 0.45rem;
}
.meta { margin: 0.25rem 0 0; font-size: 0.82rem; color: #64748b; }
.meta a { color: #1b4332; font-weight: 700; }
.muted { color: #64748b; }
.err { color: #b91c1c; }
h3 { margin: 0 0 0.5rem; font-size: 0.95rem; color: #1e293b; }
</style>
