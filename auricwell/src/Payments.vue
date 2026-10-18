<template>
  <article class="card">
    <h2>Make a payment</h2>
    <p>
      Your payment goes to the practice. AuricWell platform charges are
      separate.
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <form v-if="!attempt" @submit.prevent="begin">
      <label
        >Patient<select v-model="patientId" required>
          <option v-for="p in patients" :key="p.id" :value="p.id">
            {{ p.data.name }}
          </option>
        </select></label
      ><label
        >Amount (USD)<input
          type="number"
          v-model="amount"
          min="0.01"
          step="0.01"
          required /></label
      ><label class="checkbox-label"
        ><input v-model="consent" type="checkbox" required />I authorize this
        payment to my practice.</label
      ><button :disabled="busy">Continue to secure payment</button>
    </form>
    <div v-else>
      <div ref="paymentElement"></div>
      <button :disabled="busy || !attempt.clientSecret" @click="confirm">
        Pay ${{ Number(amount).toFixed(2) }}</button
      ><button class="outline" :disabled="busy" @click="reconcile">
        Check payment status
      </button>
    </div>
  </article>
</template>
<script setup>
import { ref, nextTick, onUnmounted, onMounted } from "vue";
import { api } from "./api";
const props = defineProps({ base: String, patients: Array });
const emit = defineEmits(["changed"]);
const patientId = ref(""),
  amount = ref(""),
  consent = ref(false),
  error = ref(""),
  notice = ref(""),
  busy = ref(false),
  attempt = ref(null),
  paymentElement = ref(null);
let stripe, elements, element;
async function run(fn) {
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
const begin = () =>
  run(async () => {
    attempt.value = await api(
      `${props.base}/patients/${patientId.value}/payments`,
      {
        method: "POST",
        body: {
          amountCents: Math.round(Number(amount.value) * 100),
          consent: consent.value,
        },
      },
    );
    const { loadStripe } = await import("@stripe/stripe-js");
    stripe = await loadStripe(attempt.value.publishableKey, {
      stripeAccount: attempt.value.connectedAccountId,
    });
    elements = stripe.elements({ clientSecret: attempt.value.clientSecret });
    await nextTick();
    element = elements.create("payment");
    element.mount(paymentElement.value);
  });
async function reconcile() {
  await run(async () => {
    const result = await api(
      `${props.base}/payments/${attempt.value.attemptId}/reconcile`,
      { method: "POST", body: {} },
    );
    notice.value =
      result.data.status === "succeeded"
        ? "Payment received. Thank you."
        : `Payment status: ${result.data.status.replaceAll("_", " ")}`;
    if (result.data.status === "succeeded") {
      element?.destroy();
      attempt.value = null;
      emit("changed");
    }
  });
}
const confirm = () =>
  run(async () => {
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${window.location.pathname}?awPaymentAttempt=${encodeURIComponent(attempt.value.attemptId)}`,
      },
      redirect: "if_required",
    });
    if (result.error) throw new Error(result.error.message);
    await reconcile();
  });
onMounted(async () => {
  const url = new URL(window.location.href);
  const id = url.searchParams.get("awPaymentAttempt");
  if (id) {
    for (const key of [
      "awPaymentAttempt",
      "payment_intent",
      "payment_intent_client_secret",
      "redirect_status",
    ])
      url.searchParams.delete(key);
    history.replaceState(null, "", url.pathname + url.search);
    attempt.value = { attemptId: id };
    await reconcile();
  }
});
onUnmounted(() => element?.destroy());
</script>
