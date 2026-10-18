<template>
  <section>
    <div class="page-heading">
      <div>
        <span class="eyebrow">Practice setup</span>
        <h1>A good beginning.</h1>
        <p>Set up your practice at your pace. Progress is saved as you go.</p>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <PlatformIntegrations v-if="operator" @changed="$emit('platform-changed')" />
    <div v-if="config" class="settings-grid">
      <div class="stack">
        <article class="card">
          <h2>Choose your path</h2>
          <div class="path-choices">
            <button
              class="path-choice"
              :class="{ selected: config.settings.onboardingMode === 'new' }"
              @click="config.settings.onboardingMode = 'new'"
            >
              <strong>Start a new practice</strong
              ><span
                >No records to move. Begin with your team and services.</span
              ></button
            ><button
              class="path-choice"
              :class="{
                selected: config.settings.onboardingMode === 'transition',
              }"
              @click="config.settings.onboardingMode = 'transition'"
            >
              <strong>Move from TherapyNotes</strong
              ><span>Review and import your existing practice records.</span>
            </button>
          </div>
        </article>
        <article class="card">
          <h2>Practice details</h2>
          <RecordForm
            :fields="practiceFields"
            :initial="details"
            :busy="busy"
            @save="saveDetails"
          />
        </article>
        <article class="card">
          <h2>Locations and services</h2>
          <label
            >Locations, one per line<textarea
              v-model="locations"
              rows="3"
            ></textarea>
          </label>
          <div v-for="(s, index) in services" :key="index" class="service-row">
            <label>Code<input v-model="s.code" /></label
            ><label>Service<input v-model="s.name" /></label
            ><label
              >Fee (cents)<input
                v-model.number="s.feeCents"
                type="number"
                min="0" /></label
            ><button
              class="outline"
              @click="services.splice(index, 1)"
              :aria-label="`Remove ${s.name || 'service'}`"
            >
              ×
            </button>
          </div>
          <div class="actions">
            <button
              class="outline"
              @click="services.push({ code: '', name: '', feeCents: 0 })"
            >
              Add service</button
            ><button @click="saveServices" :disabled="busy">
              Save services
            </button>
          </div>
        </article>
        <article class="card">
          <h2>Records management</h2>
          <p>Grant Records Manager access under “Review access” below, then select the primary and backup. General admin and support access do not grant access to the records queue.</p>
          <p v-if="!recordsSettings.primaryAccountId" class="notice">No primary Records Manager is configured. Requests will remain unassigned and support will receive a routing reminder.</p>
          <label>Primary Records Manager<select v-model="recordsSettings.primaryAccountId"><option value="">Unassigned</option><option v-for="m in recordsManagers" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
          <label>Backup Records Manager<select v-model="recordsSettings.backupAccountId"><option value="">No backup</option><option v-for="m in recordsManagers" :key="m.id" :value="m.id">{{ m.name }}</option></select></label>
          <label>Internal follow-up target (days)<input v-model.number="recordsSettings.followUpDays" type="number" min="1" max="30" /></label>
          <p>This target controls reminders for new requests; it does not determine a legal deadline. Existing requests keep their original target. The backup can take over any request and is used automatically if the primary loses access.</p>
          <button :disabled="busy" @click="saveRecordsManagement">Save records management</button>
        </article>
        <article class="card">
          <h2>Team and portal accounts</h2>
          <div v-for="m in members" :key="m.id" class="list-row">
            <div>
              <strong>{{ m.name }}</strong
              ><span class="muted"
                >{{ m.username }} · {{ m.actorType }} · {{ m.status }}</span
              >
            </div>
            <button class="outline" @click="editMember(m)">Review access</button
            ><button class="outline" :disabled="busy" @click="invite(m.id)">
              Send account invitation
            </button>
          </div>
          <article v-if="editingMember">
            <h3>Access for {{ editingMember.name }}</h3>
            <p v-if="editingMember.canonicalUserId">
              Shared staff identity:
              {{ editingMember.sharedIdentity?.name }} (#{{
                editingMember.canonicalUserId
              }}).
              {{
                editingMember.sharedIdentity?.active
                  ? "Active"
                  : "Inactive or unavailable"
              }}
            </p>
            <RecordForm
              v-if="
                editingMember.sharedIdentity?.identityProduct ===
                'auricwell_ehr'
              "
              :fields="staffDetailFields"
              :initial="editingMember.sharedIdentity"
              :busy="busy"
              submit-label="Save staff details"
              @save="saveStaffDetails"
            />
            <form
              v-if="
                !editingMember.canonicalUserId &&
                operator &&
                editingMember.actorType === 'staff' &&
                !editingMember.operator
              "
              @submit.prevent="previewIdentity"
              class="stack"
            >
              <label
                >Shared staff ID
                <input
                  v-model.number="sharedUserId"
                  type="number"
                  min="1"
                  required
                  @input="identityReview = null"
                />
              </label>
              <p class="muted">
                Connect an existing staff record in this practice after
                reviewing its identity.
              </p>
              <button class="outline" :disabled="busy">
                Preview staff connection
              </button>
              <div
                v-if="identityReview"
                role="region"
                aria-label="Staff connection review"
              >
                <p>
                  {{ identityReview.account.name }} ({{
                    identityReview.account.username
                  }}) → {{ identityReview.target.name }} (#{{
                    identityReview.target.userId
                  }})
                </p>
                <p>
                  Shared credential:
                  {{ identityReview.target.credential || "Not configured" }}.
                  {{
                    identityReview.target.active
                      ? "Active staff identity."
                      : "Inactive staff identity; unavailable for new care."
                  }}
                </p>
                <p>
                  Clinical credential mappings must be reviewed after
                  connecting. Practice permissions and login credentials stay
                  unchanged.
                </p>
                <label
                  ><input v-model="identityConfirmed" type="checkbox" />I
                  verified these records belong to the same person.</label
                >
                <button
                  type="button"
                  :disabled="busy || !identityConfirmed"
                  @click="connectIdentity"
                >
                  Connect reviewed staff identity
                </button>
              </div>
            </form>
            <RecordForm
              :fields="accessFields"
              :initial="accessInitial"
              :busy="busy"
              cancelable
              @cancel="editingMember = null"
              @save="saveAccess"
            />
          </article>
          <details>
            <summary>Add an account</summary>
            <RecordForm :fields="memberFields" :busy="busy" @save="addMember" />
          </details>
        </article>
      </div>
      <aside class="stack">
        <article class="card">
          <span class="eyebrow">Before patient data</span>
          <h2>Practice readiness</h2>
          <ul class="checklist">
            <li v-for="c in config.readiness.checks" :key="c.id">
              <span :class="c.ready ? 'success' : 'pending'">{{
                c.ready ? "✓" : "○"
              }}</span
              >{{ c.label }}
            </li>
          </ul>
          <p class="muted">
            {{
              config.settings.phiActivatedAt
                ? "Patient-data workflows are enabled."
                : "Practice configuration is available now. Patient data opens after agreements and infrastructure verification."
            }}
          </p>
        </article>
        <article class="card">
          <h2>Billing setup</h2>
          <p>
            Patient and insurance billing are separate from your AuricWell
            platform agreement.
          </p>
          <p class="muted">
            Claims transmission, card processing, ERA posting and video each
            require verified service connections.
          </p>
        </article>
        <article v-if="operator" class="card">
          <h2>Service connections</h2>
          <RecordForm
            :fields="integrationFields"
            :busy="busy"
            @save="configureIntegration"
          />
        </article>
        <article v-if="operator" class="card">
          <h2>Operator verification</h2>
          <label class="checkbox-label"
            ><input
              type="checkbox"
              v-model="config.settings.capabilities.intake"
            />Enable patient intake questionnaires</label
          >
          <button
            class="outline"
            :disabled="busy"
            @click="
              run(() => save({ capabilities: config.settings.capabilities }))
            "
          >
            Save intake capability
          </button>
          <label
            >Infrastructure and vendor agreement evidence<textarea
              v-model="evidence"
              rows="5"
              placeholder="Reference the completed reviews and executed vendor agreements."
            ></textarea></label
          ><button :disabled="busy || !evidence" @click="activate">
            Verify and enable patient data
          </button>
        </article>
      </aside>
    </div>
    <ClinicalTemplates
      v-if="config?.settings.capabilities.documentation"
      :base="base"
      :services="config.settings.services || []"
    />
    <ClinicalTemplates
      v-if="config?.settings.capabilities.intake"
      :base="base"
      intake
    />
  </section>
</template>
<script setup>
import { ref, computed, onMounted } from "vue";
import { api } from "./api";
import RecordForm from "./RecordForm.vue";
import ClinicalTemplates from "./ClinicalTemplates.vue";
import PlatformIntegrations from "./PlatformIntegrations.vue";
defineEmits(["platform-changed"]);
const props = defineProps({
  base: String,
  operator: Boolean,
  patients: { type: Array, default: () => [] },
});
const recordsManagers = ref([]), recordsSettings = ref({ primaryAccountId: "", backupAccountId: "", followUpDays: 7 });
const editingMember = ref(null),
  accessInitial = ref({});
const sharedUserId = ref(null),
  identityReview = ref(null),
  identityConfirmed = ref(false),
  identityRequestKey = ref(null);
const config = ref(null),
  members = ref([]),
  error = ref(""),
  notice = ref(""),
  busy = ref(false),
  locations = ref(""),
  services = ref([]),
  evidence = ref("");
const practiceFields = [
  { key: "legalName", label: "Practice legal name", required: true },
  { key: "address", label: "Practice address", required: true },
  { key: "noticeContact", label: "Legal notice contact", required: true },
  { key: "timezone", label: "Timezone", required: true },
  {
    key: "billingMode",
    label: "Billing",
    options: [
      { value: "self_pay", label: "Self-pay" },
      { value: "insurance", label: "Insurance" },
      { value: "mixed", label: "Self-pay and insurance" },
    ],
  },
];
const staffDetailFields = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name" },
  { key: "credential", label: "Professional credential" },
];
const memberFields = computed(() => [
  { key: "name", label: "Full name", required: true },
  { key: "username", label: "Username", required: true },
  { key: "email", label: "Account email", type: "email", required: true },
  {
    key: "actorType",
    label: "Account type",
    options: ["staff", "patient", "guardian"],
    required: true,
  },
  ...(props.operator
    ? [
        {
          key: "identityMode",
          label: "Staff identity",
          options: [
            { value: "new", label: "Create a new shared staff record" },
            {
              value: "review_existing",
              label: "Review a connection to an existing record",
            },
          ],
        },
      ]
    : []),
  {
    key: "permissions",
    label: "Staff permissions, comma separated (announcements grants support toast access)",
    placeholder: "clinical, schedule",
  },
  {
    key: "recordsManager",
    label: "Records Manager — requests and patient demographics (staff only)",
    type: "checkbox",
  },
  {
    key: "intakeOnly",
    label: "Intake-only patient/guardian account (no chart access yet)",
    type: "checkbox",
  },
  {
    key: "patientIds",
    label: "Authorized patient charts",
    options: props.patients.map((p) => ({ value: p.id, label: p.data.name })),
    multiple: true,
  },
  {
    key: "billingPatientIds",
    label: "Financially responsible for",
    options: props.patients.map((p) => ({ value: p.id, label: p.data.name })),
    multiple: true,
  },
]);
const accessFields = computed(() => [
  ...memberFields.value.filter((f) =>
    ["permissions", "recordsManager", "patientIds", "billingPatientIds"].includes(f.key),
  ),
  {
    key: "status",
    label: "Practice access",
    options: ["active", "pending", "inactive"],
    required: true,
  },
]);
function editMember(m) {
  sharedUserId.value = null;
  identityReview.value = null;
  identityConfirmed.value = false;
  identityRequestKey.value = null;
  editingMember.value = m;
  accessInitial.value = {
    permissions: m.permissions.filter(p => p !== "records_manager").join(", "),
    recordsManager: m.permissions.includes("records_manager"),
    patientIds: m.patientIds || [],
    billingPatientIds: m.billingPatientIds || [],
    status: m.membershipStatus,
  };
}
const previewIdentity = () =>
  run(async () => {
    identityReview.value = null;
    identityConfirmed.value = false;
    identityReview.value = await api(
      `${props.base}/members/${editingMember.value.id}/shared-identity/preview`,
      {
        method: "POST",
        body: { userId: sharedUserId.value },
      },
    );
    identityRequestKey.value = crypto.randomUUID();
  });
const connectIdentity = () =>
  run(async () => {
    await api(
      `${props.base}/members/${editingMember.value.id}/shared-identity`,
      {
        method: "POST",
        body: {
          userId: identityReview.value.target.userId,
          previewHash: identityReview.value.previewHash,
          reviewed: identityConfirmed.value,
          idempotencyKey: identityRequestKey.value,
        },
      },
    );
    editingMember.value = null;
    identityReview.value = null;
    await load();
    notice.value =
      "Shared staff identity connected. Review the provider's clinical credential mapping before new care.";
  });
const saveAccess = (d) =>
  run(async () => {
    await api(`${props.base}/members/${editingMember.value.id}`, {
      method: "PUT",
      body: {
        ...d,
        permissions: [...(d.permissions || "").split(",").map(s => s.trim()).filter(p => p && p !== 'records_manager'), ...(d.recordsManager ? ['records_manager'] : [])],
      },
    });
    editingMember.value = null;
    await load();
    notice.value = "Practice access updated.";
  });
const saveStaffDetails = (d) =>
  run(async () => {
    await api(`${props.base}/members/${editingMember.value.id}/identity`, {
      method: "PUT",
      body: {
        ...d,
        sharedFingerprint: editingMember.value.sharedIdentity.fingerprint,
      },
    });
    editingMember.value = null;
    await load();
    notice.value =
      "Staff details saved. Review any changed clinical credential mapping before new care.";
  });
const integrationFields = [
  {
    key: "name",
    label: "Service",
    options: ["claims", "payments", "ocr", "ai"],
    required: true,
  },
  {
    key: "mode",
    label: "Actual account mode",
    options: ["test", "live"],
    required: true,
  },
  { key: "accountReference", label: "Clearinghouse account reference" },
  { key: "connectedAccountId", label: "Stripe connected account" },
  {
    key: "evidence",
    label: "Ownership, configuration and vendor-agreement verification",
    type: "textarea",
    required: true,
  },
];
const configureIntegration = (d) =>
  run(async () => {
    await api(`${props.base}/integrations/${d.name}`, {
      method: "POST",
      body: d,
    });
    await load();
    notice.value = "Service configuration verified.";
  });
const details = computed(() => ({
  ...config.value?.settings.practice,
  timezone: config.value?.settings.timezone,
  billingMode: config.value?.settings.billingMode,
}));
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
async function load() {
  config.value = await api(`${props.base}/settings`);
  members.value = await api(`${props.base}/members`);
  const management = await api(`${props.base}/records-management`);
  recordsManagers.value = management.managers;
  recordsSettings.value = { ...management.settings, primaryAccountId: management.settings.primaryAccountId || '', backupAccountId: management.settings.backupAccountId || '' };
  locations.value = (config.value.settings.locations || []).join("\n");
  services.value = (config.value.settings.services || []).map((s) => ({
    ...s,
  }));
}
const saveRecordsManagement = () => run(async () => {
  await api(`${props.base}/records-management`, { method: 'PUT', body: { ...recordsSettings.value, revision: config.value.revision } });
  await load();
  notice.value = 'Records management updated.';
});
async function save(extra) {
  const data = await api(`${props.base}/settings`, {
    method: "PUT",
    body: {
      ...config.value.settings,
      ...extra,
      revision: config.value.revision,
    },
  });
  config.value = { ...config.value, ...data };
  notice.value = "Practice setup saved.";
  await load();
}
const saveDetails = (d) =>
  run(() =>
    save({
      practice: {
        legalName: d.legalName,
        address: d.address,
        noticeContact: d.noticeContact,
      },
      timezone: d.timezone,
      billingMode: d.billingMode,
    }),
  );
const saveServices = () =>
  run(() =>
    save({
      locations: locations.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      services: services.value,
    }),
  );
const addMember = (d) =>
  run(async () => {
    await api(`${props.base}/members`, {
      method: "POST",
      body: {
        ...d,
        permissions: [...(d.permissions || "").split(",").map(s => s.trim()).filter(p => p && p !== 'records_manager'), ...(d.recordsManager ? ['records_manager'] : [])],
        patientIds: d.patientIds || [],
        billingPatientIds: d.billingPatientIds || [],
      },
    });
    await load();
    notice.value =
      "Account created. Review access before sending an invitation.";
  });
const invite = (id) =>
  run(async () => {
    await api(`${props.base}/members/${id}/invite`, {
      method: "POST",
      body: {},
    });
    notice.value = "Account invitation sent.";
  });
const activate = () =>
  run(async () => {
    await api(`${props.base}/activate-phi`, {
      method: "POST",
      body: { verified: true, evidence: evidence.value },
    });
    await load();
    notice.value = "Patient-data workflows enabled.";
  });
onMounted(() => run(load));
</script>
