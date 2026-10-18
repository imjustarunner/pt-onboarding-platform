<template>
  <article class="card">
    <div class="section-heading">
      <h2>Billing configuration & review</h2>
      <button class="outline" @click="expanded = !expanded">
        {{ expanded ? "Close" : "Open billing tools" }}
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <div v-if="expanded">
      <ProviderBillingRollout :key="base" :fetch-policy="fetchRollout" :save-entry="saveRollout" />
      <div class="tabbar">
        <button
          v-for="tab in [
            'identity',
            'insurance',
            'remittance',
            'transmission',
            'refund',
          ]"
          :key="tab"
          :class="{ selected: current === tab }"
          :disabled="busy"
          @click="current = tab"
        >
          {{ tab }}
        </button>
      </div>
      <RecordForm
        v-if="current === 'identity'"
        :fields="identityFields"
        :initial="identity"
        :busy="busy"
        @save="saveIdentity"
      /><template v-if="current === 'insurance'"
        ><label
          >Patient<select v-model="patientId" :disabled="busy">
            <option value="">Choose patient</option>
            <option v-for="p in patients" :key="p.id" :value="p.id">
              {{ p.data.name }}
            </option>
          </select></label
        >
        <button
          v-if="patientId"
          class="outline"
          :disabled="busy || insuranceLoading"
          @click="loadInsurance"
        >
          Reload coverage
        </button>
        <p v-if="insuranceLoading" class="muted">Loading current coverage…</p>
        <p v-if="insurance?.requiresConsolidation" class="notice">
          Earlier AuricWell coverage needs review. The form shows current shared
          coverage when available. Compare the earlier information below before
          saving.
        </p>
        <details v-if="insurance?.prototypeReview" class="card">
          <summary>Earlier coverage for review</summary>
          <template
            v-for="section in ['primary', 'secondary', 'patient']"
            :key="section"
          >
            <h3>{{ section }}</h3>
            <dl class="claim-review">
              <template
                v-for="(value, key) in insurance.prototypeReview[section] || {}"
                :key="key"
                ><dt>{{ key.replace(/([A-Z])/g, " $1") }}</dt>
                <dd>{{ value || "—" }}</dd></template
              >
            </dl>
          </template>
        </details>
        <RecordForm
          v-if="insurance && !insuranceLoading"
          :key="`${patientId}:${insurance.sharedFingerprint}`"
          :fields="coverageFields"
          :initial="insuranceInitial"
          :busy="busy"
          @save="saveInsurance" /></template
      ><RecordForm
        v-if="current === 'remittance'"
        :fields="remittanceFields"
        :busy="busy"
        @save="postRemittance"
      /><template v-if="current === 'transmission'"
        ><p>
          Review the complete insurance claim before authorizing transmission. A
          saved draft approval alone does not authorize submission.
        </p>
        <label
          >Claim<select v-model="claimId">
            <option v-for="c in claims" :key="c.id" :value="c.id">
              {{ patientName(c.patientId) }} · {{ c.data.serviceCode }} ·
              {{ c.data.status }}
            </option>
          </select></label
        ><button
          class="outline"
          :disabled="busy || !claimId"
          @click="loadReview"
        >
          Prepare transmission review</button
        ><template v-if="review"
          ><dl class="claim-review">
            <template v-for="(value, key) in review.payload" :key="key"
              ><dt>{{ claimLabels[key] || key.replaceAll("_", " ") }}</dt>
              <dd>
                {{
                  Array.isArray(value)
                    ? value
                        .map((v) =>
                          Object.entries(v)
                            .map(([k, x]) => `${k}: ${x}`)
                            .join(" · "),
                        )
                        .join("\n")
                    : value
                }}
              </dd></template
            >
          </dl>
          <label class="checkbox-label"
            ><input v-model="approved" type="checkbox" />I reviewed
            patient/subscriber identity, billing and rendering providers,
            services, dates, diagnoses and charges.</label
          >
          <div class="actions">
            <button :disabled="busy || !approved" @click="approve">
              Approve exact payload</button
            ><button
              class="outline"
              :disabled="busy || !approvedRecord"
              @click="transmit"
            >
              Submit approved claim
            </button>
          </div></template
        ><button class="outline" :disabled="busy" @click="sync">
          Sync clearinghouse responses
        </button></template
      ><RecordForm
        v-if="current === 'refund'"
        :fields="refundFields"
        :busy="busy"
        @save="refund"
      />
    </div>
  </article>
</template>
<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { api } from "./api";
import RecordForm from "./RecordForm.vue";
import ProviderBillingRollout from '../../frontend/src/components/billing/ProviderBillingRollout.vue';
const props = defineProps({
  base: String,
  patients: Array,
  claims: Array,
  ledger: Array,
});
const emit = defineEmits(["changed"]);
const fetchRollout = () => api(`${props.base}/billing-rollout`);
const saveRollout = body => api(`${props.base}/billing-rollout`, { method: 'PUT', body });
const refundKey = ref("");
const expanded = ref(false),
  current = ref("identity"),
  error = ref(""),
  notice = ref(""),
  busy = ref(false),
  identity = ref({}),
  patientId = ref(""),
  claimId = ref(""),
  review = ref(null),
  approved = ref(false),
  approvedRecord = ref(null);
const insurance = ref(null),
  insuranceLoading = ref(false);
let insuranceRequest = 0;
const insuranceInitial = computed(() => ({
  ...(insurance.value?.data?.primary || {}),
  ...(insurance.value?.data?.patient || {}),
  acceptAssignment: insurance.value?.data?.acceptAssignment === true,
  reviewed: false,
  consolidationReviewed: false,
}));
const coverageFields = computed(() => [
  ...insuranceFields,
  ...(insurance.value?.requiresConsolidation
    ? [
        {
          key: "consolidationReviewed",
          label:
            "I compared the earlier coverage and reviewed the shared policy to save",
          type: "checkbox",
        },
      ]
    : []),
]);
async function loadInsurance() {
  const tab = current.value,
    id = patientId.value;
  const request = ++insuranceRequest;
  insurance.value = null;
  insuranceLoading.value = false;
  error.value = "";
  notice.value = "";
  if (tab !== "insurance" || !id) return;
  insuranceLoading.value = true;
  try {
    const loaded = await api(`${props.base}/patients/${id}/insurance`);
    if (request === insuranceRequest) insurance.value = loaded;
  } catch (e) {
    if (request === insuranceRequest) error.value = e.message;
  } finally {
    if (request === insuranceRequest) insuranceLoading.value = false;
  }
}
watch([current, patientId], loadInsurance);
const field = (key, label, type = "text", options) => ({
  key,
  label,
  type,
  options,
  required: true,
});
const identityFields = [
  field("legalName", "Billing legal name"),
  field("billingNpi", "Billing NPI"),
  field("taxId", "Tax ID (nine digits)"),
  field("address", "Street address"),
  field("city", "City"),
  field("state", "State"),
  field("postalCode", "Postal code"),
  field("phone", "Billing phone"),
  {
    key: "reviewed",
    label: "I verified the practice billing identity",
    type: "checkbox",
  },
];
const insuranceFields = [
  field("insurerName", "Insurance carrier"),
  { key: "groupNumber", label: "Group number" },
  { key: "effectiveDate", label: "Coverage effective date", type: "date" },
  { key: "terminationDate", label: "Coverage end date", type: "date" },
  field("payerId", "Electronic payer ID"),
  {
    key: "planType",
    label: "Exact plan type (required for supervised billing)",
  },
  field("memberId", "Member ID"),
  field("subscriberFirstName", "Subscriber first name"),
  field("subscriberLastName", "Subscriber last name"),
  field("subscriberDob", "Subscriber birth date", "date"),
  field("subscriberSex", "Subscriber insurance sex code", "select", [
    "M",
    "F",
    "U",
  ]),
  field("subscriberAddressLine1", "Subscriber address"),
  field("subscriberCity", "Subscriber city"),
  field("subscriberState", "Subscriber state"),
  field("subscriberPostalCode", "Subscriber postal code"),
  field("relationshipToSubscriber", "Patient relationship", "select", [
    "self",
    "spouse",
    "child",
    "other",
  ]),
  field("firstName", "Patient first name"),
  field("lastName", "Patient last name"),
  field("dateOfBirth", "Patient birth date", "date"),
  field("sex", "Patient insurance sex code", "select", ["M", "F", "U"]),
  field("addressLine1", "Patient address"),
  field("city", "Patient city"),
  field("state", "Patient state"),
  field("postalCode", "Patient postal code"),
  {
    key: "acceptAssignment",
    label: "Provider accepts assignment",
    type: "checkbox",
  },
  {
    key: "reviewed",
    label: "I reviewed insurance and patient identity",
    type: "checkbox",
  },
];
const patientName = (id) =>
  props.patients.find((p) => p.id === id)?.data.name || "Patient";
const remittanceFields = computed(() => [
  field(
    "claimId",
    "Claim",
    "select",
    props.claims.map((c) => ({
      value: c.id,
      label: `${patientName(c.patientId)} · ${c.data.serviceCode}`,
    })),
  ),
  field("reference", "Payer remittance / ERA reference"),
  field("date", "Remittance date", "date"),
  field("paymentCents", "Insurance payment (cents)", "number"),
  field("adjustmentCents", "Contractual adjustment (cents)", "number"),
  field(
    "patientResponsibilityCents",
    "Patient responsibility (cents)",
    "number",
  ),
  { key: "denied", label: "Adjudicated denial", type: "checkbox" },
  {
    key: "reviewed",
    label:
      "I reviewed the source remittance, patient match and reconciled amounts",
    type: "checkbox",
  },
]);
const refundFields = computed(() => [
  field(
    "paymentId",
    "Original card payment",
    "select",
    props.ledger
      .filter((e) => e.data.source === "stripe" && e.data.type === "payment")
      .map((e) => ({
        value: e.id,
        label: `${patientName(e.patientId)} · $${(e.data.amountCents / 100).toFixed(2)}`,
      })),
  ),
  field("amountCents", "Refund amount (cents)", "number"),
  field("reason", "Reason"),
]);
const claimLabels = {
  pat_name_f: "Patient first name",
  pat_name_l: "Patient last name",
  pat_dob: "Patient birth date",
  ins_number: "Insurance member ID",
  bill_npi: "Billing NPI",
  prov_npi: "Rendering NPI",
  payerid: "Electronic payer ID",
  charge: "Service lines",
  total_charge: "Total charge",
};
async function run(fn) {
  error.value = "";
  notice.value = "";
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
const saveIdentity = (d) =>
  run(async () => {
    await api(`${props.base}/billing-identity`, { method: "PUT", body: d });
    notice.value = "Billing identity saved.";
  });
const saveInsurance = (d) =>
  run(async () => {
    const primary = Object.fromEntries(
      [
        "insurerName",
        "groupNumber",
        "effectiveDate",
        "terminationDate",
        "payerId",
        "planType",
        "memberId",
        "subscriberFirstName",
        "subscriberLastName",
        "subscriberDob",
        "subscriberSex",
        "subscriberAddressLine1",
        "subscriberCity",
        "subscriberState",
        "subscriberPostalCode",
        "relationshipToSubscriber",
      ].map((k) => [k, d[k]]),
    );
    const patient = Object.fromEntries(
      [
        "firstName",
        "lastName",
        "dateOfBirth",
        "sex",
        "addressLine1",
        "city",
        "state",
        "postalCode",
      ].map((k) => [k, d[k]]),
    );
    const saved = await api(
      `${props.base}/patients/${patientId.value}/insurance`,
      {
        method: "PUT",
        body: {
          primary,
          patient,
          sharedFingerprint: insurance.value.sharedFingerprint,
          consolidationReviewed: d.consolidationReviewed === true,
          reviewed: d.reviewed,
          acceptAssignment: d.acceptAssignment,
        },
      },
    );
    insurance.value = saved;
    notice.value = "Insurance review saved to the shared chart.";
  });
const postRemittance = (d) =>
  run(async () => {
    await api(`${props.base}/remittances`, { method: "POST", body: d });
    notice.value =
      "Reviewed remittance posted. Patient responsibility is on the ledger.";
    emit("changed");
  });
const loadReview = () =>
  run(async () => {
    review.value = await api(
      `${props.base}/claims/${claimId.value}/transmission-review`,
      { method: "POST", body: {} },
    );
    approved.value = false;
    approvedRecord.value = null;
  });
const approve = () =>
  run(async () => {
    approvedRecord.value = await api(
      `${props.base}/claims/${claimId.value}/transmission-review`,
      {
        method: "POST",
        body: {
          approve: true,
          reviewHash: review.value.reviewHash,
          revision: review.value.revision,
        },
      },
    );
    notice.value = "The exact payload is approved.";
  });
const transmit = () =>
  run(async () => {
    await api(`${props.base}/claims/${claimId.value}/submit`, {
      method: "POST",
      body: { reviewHash: approvedRecord.value.data.reviewHash },
    });
    notice.value =
      "Claim transmitted. Clearinghouse acknowledgement is separate from payment.";
    review.value = null;
    emit("changed");
  });
const sync = () =>
  run(async () => {
    const r = await api(`${props.base}/claims/sync`, {
      method: "POST",
      body: {},
    });
    notice.value = `${r.updated} responses applied.`;
    emit("changed");
  });
const refund = (d) =>
  run(async () => {
    refundKey.value ||= crypto.randomUUID();
    const result = await api(`${props.base}/ledger/${d.paymentId}/refund`, {
      method: "POST",
      body: { ...d, idempotencyKey: refundKey.value },
    });
    if (["succeeded", "failed"].includes(result.data.status))
      refundKey.value = "";
    notice.value = `Refund status: ${result.data.status}.`;
    emit("changed");
  });
onMounted(async () => {
  try {
    identity.value = (await api(`${props.base}/billing-setup`)).identity;
  } catch (e) {
    error.value = e.message;
  }
});
</script>
