<template>
  <section>
    <div class="page-heading">
      <div>
        <span class="eyebrow">{{ practiceName }}</span>
        <h1>{{ patientPortal ? "Your intake forms" : "Patient intake" }}</h1>
        <p>
          {{
            patientPortal
              ? "Save your progress and submit your answers to your care team."
              : "Assign questionnaires and review submitted information before creating or linking a chart."
          }}
        </p>
      </div>
      <button
        v-if="canManage"
        @click="showAssignment = !showAssignment"
        :disabled="busy"
      >
        Assign intake
      </button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <article v-if="showAssignment" class="card">
      <h2>Assign a questionnaire</h2>
      <p>
        Create patient or guardian accounts in Settings first. An intake-only
        account can complete forms before a chart exists.
      </p>
      <form @submit.prevent="assign">
        <label
          >Questionnaire<select
            v-model="assignment.templateId"
            aria-label="Questionnaire"
            required
          >
            <option value="">Choose questionnaire</option>
            <option
              v-for="t in templates.filter((t) => t.data.status === 'active')"
              :key="t.id"
              :value="t.id"
            >
              {{ t.data.name }} · version {{ t.revision }}
            </option>
          </select></label
        >
        <label
          >Existing chart, if applicable<select
            v-model="assignment.patientId"
            aria-label="Existing chart, if applicable"
          >
            <option value="">New client — no chart yet</option>
            <option v-for="p in patients" :key="p.id" :value="p.id">
              {{ p.data.name }} · {{ p.data.dob }}
            </option>
          </select></label
        >
        <label
          >Patient / intake label<input
            v-model="assignment.patientLabel"
            required
            maxlength="200"
        /></label>
        <label
          >Person completing the form<select
            v-model="assignment.respondentAccountId"
            aria-label="Person completing the form"
            required
          >
            <option value="">Choose account</option>
            <option v-for="m in options.respondents" :key="m.id" :value="m.id">
              {{ m.name }} · {{ m.actorType
              }}{{ m.status === "pending" ? " · account setup pending" : "" }}
            </option>
          </select></label
        >
        <label
          >Clinical reviewer<select
            v-model="assignment.reviewerAccountId"
            aria-label="Clinical reviewer"
            required
          >
            <option value="">Choose reviewer</option>
            <option v-for="m in options.reviewers" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </select></label
        >
        <label
          >Respondent capacity<input
            v-model="assignment.capacity"
            required
            maxlength="200"
            placeholder="Patient or verified guardian capacity"
        /></label>
        <label
          >Identity and authority review reference<input
            v-model="assignment.authorityReference"
            required
            maxlength="1000"
        /></label>
        <label class="checkbox-label"
          ><input
            type="checkbox"
            v-model="assignment.authorityReviewed"
            required
          />I verified this account’s identity and authority to complete this
          patient’s intake.</label
        >
        <button :disabled="busy">Assign form in app</button>
      </form>
    </article>
    <div class="split-panel">
      <aside class="card">
        <h2>{{ patientPortal ? "Assigned forms" : "Intake queue" }}</h2>
        <div v-for="r in records" :key="r.id">
          <button
            class="record-select"
            :class="{ selected: selected?.id === r.id }"
            :disabled="busy || (!r.canRead && !r.canReview && !r.canRespond)"
            @click="openRecord(r.id)"
          >
            <strong>{{ r.data.patientLabel }}</strong
            ><span
              >{{ r.data.questionnaireName }} ·
              {{ statusLabel(r.data.status) }}</span
            >
          </button>
          <p v-if="!r.canRead && !r.canReview && !r.canRespond" class="muted">
            Responses are restricted to the assigned clinical reviewer.
          </p>
          <button
            v-if="
              canManage && !['accepted', 'cancelled'].includes(r.data.status)
            "
            class="outline"
            :disabled="busy"
            @click="cancel(r)"
          >
            Cancel intake
          </button>
        </div>
        <p v-if="!records.length" class="muted">No intake forms assigned.</p>
      </aside>
      <article v-if="selected" class="card">
        <h2>{{ selected.data.snapshot.name }}</h2>
        <p>
          {{ selected.data.patientLabel }} ·
          {{ statusLabel(selected.data.status) }} · Questionnaire version
          {{ selected.data.templateRevision }}
        </p>
        <p>Completing as: {{ selected.data.capacity }}</p>
        <p
          v-if="!patientPortal && selected.data.authorityReference"
          class="muted"
        >
          Authority review: {{ selected.data.authorityReference }}
        </p>
        <p class="document-preview">
          {{ selected.data.snapshot.instructions }}
        </p>
        <p v-if="selected.data.feedback" class="notice">
          Requested corrections: {{ selected.data.feedback }}
        </p>
        <form v-if="editable" @submit.prevent="respond('submit')">
          <fieldset>
            <legend>Patient information</legend>
            <label v-for="field in demographicsFields" :key="field.key"
              >{{ field.label
              }}<input
                v-model="demographics[field.key]"
                :type="field.type || 'text'"
                :required="field.required"
                :maxlength="field.max"
                :aria-label="field.label"
            /></label>
          </fieldset>
          <fieldset>
            <legend>Questionnaire</legend>
            <label
              v-for="field in selected.data.snapshot.fields"
              :key="field.key"
              >{{ field.label }}{{ field.required ? " (required)" : "" }}
              <textarea
                v-if="field.type === 'textarea'"
                v-model="answers[field.key]"
                :aria-label="field.label"
                :required="field.required"
                rows="4"
                maxlength="10000"
              ></textarea>
              <select
                v-else-if="['select', 'boolean'].includes(field.type)"
                v-model="answers[field.key]"
                :aria-label="field.label"
                :required="field.required"
              >
                <option value="">Choose an answer</option>
                <template v-if="field.type === 'boolean'"
                  ><option :value="true">Yes</option>
                  <option :value="false">No</option></template
                ><template v-else
                  ><option
                    v-for="choice in field.options"
                    :key="choice"
                    :value="choice"
                  >
                    {{ choice }}
                  </option></template
                >
              </select>
              <input
                v-else
                v-model="answers[field.key]"
                :aria-label="field.label"
                :required="field.required"
                maxlength="1000"
              />
            </label>
          </fieldset>
          <label class="checkbox-label"
            ><input v-model="reviewed" type="checkbox" required />I reviewed
            these answers and am completing this form in the stated
            capacity.</label
          >
          <div class="actions">
            <button
              type="button"
              class="outline"
              :disabled="busy"
              @click="respond('draft')"
            >
              Save progress</button
            ><button :disabled="busy">Submit for review</button>
          </div>
        </form>
        <template v-else>
          <dl class="claim-review">
            <template v-for="field in demographicsFields" :key="field.key"
              ><dt>{{ field.label }}</dt>
              <dd>
                {{ selected.data.demographics?.[field.key] || "Not provided" }}
              </dd></template
            ><template
              v-for="field in selected.data.snapshot.fields"
              :key="field.key"
              ><dt>{{ field.label }}</dt>
              <dd>
                {{ display(selected.data.answers?.[field.key]) }}
              </dd></template
            >
          </dl>
          <form
            v-if="selected.canReview && selected.data.status === 'submitted'"
            @submit.prevent="decide('accept')"
          >
            <h3>Chart review</h3>
            <p v-if="matches.length" class="notice">
              Possible existing charts:
              {{
                matches.map((p) => `${p.data.name} (${p.data.dob})`).join("; ")
              }}. Review identity before choosing.
            </p>
            <label
              >Chart decision<select
                v-model="chartId"
                aria-label="Chart decision"
                :disabled="!!selected.patientId"
              >
                <option value="">Create a new client chart</option>
                <option v-for="p in patients" :key="p.id" :value="p.id">
                  Link {{ p.data.name }} · {{ p.data.dob }}
                </option>
              </select></label
            >
            <p class="muted">
              Existing chart demographics are preserved. Chart and billing
              access are managed separately in Settings.
            </p>
            <label
              >Review explanation<textarea
                v-model="reason"
                required
                maxlength="2000"
                rows="3"
              ></textarea>
            </label>
            <label class="checkbox-label"
              ><input v-model="matchingReviewed" type="checkbox" required />I
              reviewed existing charts and verified this create/link
              decision.</label
            >
            <label class="checkbox-label"
              ><input v-model="reviewed" type="checkbox" required />I reviewed
              this submitted version and the respondent’s stated
              capacity.</label
            >
            <div class="actions">
              <button :disabled="busy">Accept reviewed intake</button
              ><button
                type="button"
                class="outline"
                :disabled="busy || !reason || !reviewed"
                @click="decide('return')"
              >
                Request corrections
              </button>
            </div>
          </form>
          <p v-if="selected.data.status === 'accepted'" class="notice">
            Your care team reviewed this intake. Chart reference:
            {{ selected.data.acceptedPatientId }}
          </p>
        </template>
        <button
          v-if="selected.data.submissionNumber"
          class="outline"
          :disabled="busy"
          @click="loadHistory"
        >
          View submitted versions
        </button>
        <details v-for="s in history" :key="s.id">
          <summary>
            Submission {{ s.data.submissionNumber }} ·
            {{ new Date(s.data.submittedAt).toLocaleString() }}
          </summary>
          <dl class="claim-review">
            <template v-for="field in demographicsFields" :key="field.key"
              ><dt>{{ field.label }}</dt>
              <dd>
                {{ s.data.demographics[field.key] || "Not provided" }}
              </dd></template
            ><template v-for="field in s.data.snapshot.fields" :key="field.key"
              ><dt>{{ field.label }}</dt>
              <dd>{{ display(s.data.answers[field.key]) }}</dd></template
            >
          </dl>
        </details>
      </article>
    </div>
  </section>
</template>
<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from "vue";
import { api } from "./api";
const props = defineProps({
  base: String,
  practiceName: String,
  patientPortal: Boolean,
  canManage: Boolean,
  patients: { type: Array, default: () => [] },
});
const emit = defineEmits(["changed"]);
const records = ref([]),
  templates = ref([]),
  options = ref({ respondents: [], reviewers: [] }),
  selected = ref(null),
  history = ref([]);
const demographics = ref({}),
  answers = ref({}),
  reviewed = ref(false),
  matchingReviewed = ref(false),
  chartId = ref(""),
  reason = ref("");
const error = ref(""),
  notice = ref(""),
  busy = ref(false),
  showAssignment = ref(false);
const assignment = reactive({
  templateId: "",
  patientId: "",
  patientLabel: "",
  respondentAccountId: "",
  reviewerAccountId: "",
  capacity: "",
  authorityReference: "",
  authorityReviewed: false,
  idempotencyKey: crypto.randomUUID(),
});
const controller = new AbortController();
let selectionVersion = 0;
const request = (path, opts = {}) =>
  api(`${props.base}${path}`, { ...opts, signal: controller.signal });
const demographicsFields = [
  { key: "name", label: "Patient full name", required: true, max: 200 },
  {
    key: "dob",
    label: "Patient birth date",
    type: "date",
    required: true,
    max: 10,
  },
  { key: "phone", label: "Phone", max: 40 },
  { key: "email", label: "Contact email", type: "email", max: 254 },
  { key: "address", label: "Address", max: 500 },
];
const editable = computed(
  () =>
    selected.value?.canRespond &&
    ["assigned", "draft", "needs_changes"].includes(selected.value.data.status),
);
const display = (v) =>
  v === undefined || v === null || v === ""
    ? "Not provided"
    : typeof v === "boolean"
      ? v
        ? "Yes"
        : "No"
      : v;
const statusLabel = (s) =>
  ({
    assigned: "To complete",
    draft: "In progress",
    needs_changes: "Corrections requested",
    submitted: "Awaiting review",
    accepted: "Reviewed",
    cancelled: "Cancelled",
  })[s] || s;
const matches = computed(() =>
  props.patients.filter(
    (p) =>
      p.data.dob === selected.value?.data.demographics?.dob ||
      p.data.name?.trim().toLowerCase() ===
        selected.value?.data.demographics?.name?.trim().toLowerCase(),
  ),
);
async function run(work) {
  error.value = "";
  busy.value = true;
  try {
    await work();
  } catch (e) {
    if (!controller.signal.aborted) error.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function load() {
  records.value = await request("/intakes");
}
async function select(id) {
  const version = ++selectionVersion;
  selected.value = null;
  history.value = [];
  demographics.value = {};
  answers.value = {};
  reviewed.value = false;
  matchingReviewed.value = false;
  reason.value = "";
  chartId.value = "";
  const result = await request(`/intakes/${id}`);
  if (version !== selectionVersion || controller.signal.aborted) return;
  selected.value = result;
  demographics.value = { ...result.data.demographics };
  answers.value = { ...result.data.answers };
  chartId.value = result.patientId || "";
}
const openRecord = (id) => run(() => select(id));
async function assign() {
  await run(async () => {
    const template = templates.value.find(
      (t) => t.id === assignment.templateId,
    );
    await request("/intakes", {
      method: "POST",
      body: { ...assignment, templateRevision: template?.revision },
    });
    assignment.idempotencyKey = crypto.randomUUID();
    showAssignment.value = false;
    notice.value =
      "Intake assigned. The form is available in the recipient’s AuricWell workspace.";
    await load();
    emit("changed");
  });
}
async function respond(action) {
  await run(async () => {
    const id = selected.value.id;
    await request(`/intakes/${id}/answers`, {
      method: "PUT",
      body: {
        action,
        revision: selected.value.revision,
        demographics: demographics.value,
        answers: answers.value,
        reviewed: reviewed.value,
      },
    });
    await load();
    await select(id);
    notice.value =
      action === "submit"
        ? "Intake submitted for your care team to review."
        : "Progress saved.";
    emit("changed");
  });
}
async function decide(action) {
  await run(async () => {
    const id = selected.value.id;
    await request(`/intakes/${id}/review`, {
      method: "POST",
      body: {
        action,
        revision: selected.value.revision,
        submissionHash: selected.value.data.submissionHash,
        patientId: chartId.value || null,
        reason: reason.value,
        reviewed: reviewed.value,
        matchingReviewed: matchingReviewed.value,
      },
    });
    await load();
    await select(id);
    notice.value =
      action === "accept"
        ? "Intake reviewed. Chart access and billing responsibility remain separately controlled."
        : "Corrections requested in app.";
    emit("changed");
  });
}
async function cancel(r) {
  const reason = window.prompt("Why is this intake being cancelled?");
  if (!reason) return;
  await run(async () => {
    await request(`/intakes/${r.id}/cancel`, {
      method: "POST",
      body: { revision: r.revision, reason },
    });
    selected.value = null;
    history.value = [];
    await load();
    emit("changed");
  });
}
const loadHistory = () =>
  run(async () => {
    history.value = await request(`/intakes/${selected.value.id}/history`);
  });
watch(
  () => assignment.patientId,
  (id) => {
    const chart = props.patients.find((p) => p.id === id);
    assignment.patientLabel = chart?.data.name || "";
    assignment.respondentAccountId = "";
    assignment.authorityReviewed = false;
  },
);
onMounted(() =>
  run(async () => {
    await load();
    if (props.canManage) {
      [templates.value, options.value] = await Promise.all([
        request("/intake-templates"),
        request("/intake-options"),
      ]);
    }
  }),
);
onUnmounted(() => {
  selectionVersion++;
  controller.abort();
});
</script>
<style scoped>
@media (max-width: 760px) {
  .split-panel > aside.card {
    min-height: 0;
  }
}
</style>
