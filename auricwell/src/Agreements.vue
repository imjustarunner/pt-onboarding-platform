<template>
  <section>
    <div class="page-heading">
      <div>
        <span class="eyebrow">Practice and patient agreements</span>
        <h1>Every agreement, in order.</h1>
        <p>
          Review the terms, choose authorized signers, and keep an exact signed
          copy.
        </p>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="split-panel">
      <aside class="card">
        <h2>Agreements</h2>
        <a
          v-for="d in sharedDocuments"
          :key="d.id"
          class="record-select"
          :href="`/api/auricwell${base}/notes/${d.id}/source`"
          >{{ d.title }} · {{ d.serviceDate }} · Shared document</a
        ><button
          v-for="r in records"
          :key="r.id"
          class="record-select"
          :class="{ selected: selected?.id === r.id }"
          @click="select(r)"
        >
          <strong>{{ r.data.title }}</strong
          ><span>{{ r.data.status.replaceAll("_", " ") }}</span>
        </button>
        <details v-if="canManage">
          <summary>New agreement</summary>
          <label
            >Document<select v-model="newType">
              <option v-for="(t, key) in templates" :key="key" :value="key">
                {{ t.label }}
              </option>
            </select></label
          ><label v-if="templates[newType]?.patient"
            >Patient<select v-model="patientId">
              <option v-for="p in patients" :key="p.id" :value="p.id">
                {{ p.data.name }}
              </option>
            </select></label
          ><button :disabled="busy" @click="createNew">Create draft</button>
        </details>
      </aside>
      <article class="card" v-if="selected">
        <div class="section-heading">
          <h2>{{ selected.data.title }}</h2>
          <span class="badge">{{
            selected.data.status.replaceAll("_", " ")
          }}</span>
        </div>
        <div v-if="selected.data.status === 'draft' && canManage">
          <p class="notice">
            Draft terms require completed legal details and approval before they
            can be issued.
          </p>
          <label
            >Agreement text<textarea
              v-model="draft.body"
              rows="14"
            ></textarea></label
          ><label
            >Completed practice-specific terms<textarea
              v-model="draft.terms"
              rows="6"
              placeholder="Complete the applicable service scope, pricing, reporting periods, retention, support and termination terms."
            ></textarea>
          </label>
          <div class="form-grid">
            <label
              >Effective date<input
                type="date"
                v-model="draft.effectiveDate" /></label
            ><template
              v-for="party in selected.data.patientId
                ? ['practice']
                : ['practice', 'operator']"
              :key="party"
              ><label
                >{{ party }} legal name<input
                  v-model="draft.parties[party].legalName" /></label
              ><label
                >{{ party }} address<input
                  v-model="draft.parties[party].address" /></label
              ><label
                >{{ party }} notice contact<input
                  v-model="draft.parties[party].noticeContact" /></label
            ></template>
          </div>
          <div v-for="(s, i) in draft.signers" :key="i" class="form-grid">
            <label
              >Signer<select v-model="s.accountId">
                <option value="">Choose account</option>
                <option v-for="m in members" :key="m.id" :value="m.id">
                  {{ m.name }} · {{ m.operator ? "Operator" : m.actorType }}
                </option>
              </select></label
            ><label
              >Signing capacity<input
                v-model="s.capacity"
                placeholder="Practice authorized representative"
            /></label>
          </div>
          <button
            v-if="selected.data.patientId && draft.signers.length < 3"
            class="outline"
            @click="
              draft.signers.push({
                accountId: '',
                capacity: 'Practice countersigner',
              })
            "
          >
            Add required countersigner
          </button>
          <div class="actions">
            <button :disabled="busy" @click="save">Save draft</button
            ><button
              class="outline"
              :disabled="busy"
              @click="action('approve')"
            >
              Approve exact version</button
            ><button
              class="outline"
              :disabled="busy || !selected.data.approvedBy"
              @click="action('issue')"
            >
              Issue for signature
            </button>
          </div>
        </div>
        <div v-else>
          <p>
            Effective {{ selected.data.effectiveDate }} · Version
            {{ selected.id }}
          </p>
          <p v-for="(party, key) in selected.data.parties" :key="key">
            <strong>{{ party.legalName }}</strong> · {{ party.address }} ·
            {{ party.noticeContact }}
          </p>
          <p v-for="s in selected.data.signers" :key="s.accountId">
            Required signing capacity: {{ s.capacity }}
          </p>
          <p v-if="selected.data.supersedesId">
            Replaces agreement {{ selected.data.supersedesId }} upon completion.
          </p>
          <div class="document-text">
            {{ selected.data.body }}

            {{ selected.data.terms }}
          </div>
          <div
            v-for="s in selected.data.signatures"
            :key="s.accountId"
            class="notice"
          >
            Signed by {{ s.name }} · {{ s.capacity }} ·
            {{ new Date(s.signedAt).toLocaleString() }}
          </div>
          <form v-if="maySign" @submit.prevent="sign">
            <label
              >Type your full name<input
                v-model="signatureName"
                required /></label
            ><label class="checkbox-label"
              ><input v-model="consent" type="checkbox" required />I have
              reviewed this document and intend to sign it electronically in my
              stated capacity.</label
            ><button :disabled="busy || !consent">Sign this agreement</button>
          </form>
        </div>
        <button
          v-if="canManage && selected.data.status === 'completed'"
          class="outline"
          @click="revise"
        >
          Create revised draft</button
        ><a
          class="button outline"
          :href="`/api/auricwell${base}/agreements/${selected.id}/pdf`"
          >Download
          {{
            selected.data.status === "completed"
              ? "executed PDF"
              : "review copy"
          }}</a
        >
      </article>
      <article v-else class="card empty">
        <h2>A clear record of your commitments.</h2>
        <p>Select an agreement to review its terms and signatures.</p>
      </article>
    </div>
  </section>
</template>
<script setup>
import { ref, computed, onMounted } from "vue";
import { api } from "./api";
const props = defineProps({
  base: String,
  account: Object,
  canManage: Boolean,
  patients: { type: Array, default: () => [] },
});
const sharedDocuments = ref([]);
const records = ref([]),
  templates = ref({}),
  members = ref([]),
  selected = ref(null),
  draft = ref({}),
  error = ref(""),
  busy = ref(false),
  newType = ref("service_agreement"),
  patientId = ref(""),
  signatureName = ref(""),
  consent = ref(false);
const maySign = computed(
  () =>
    selected.value?.data.signers?.some(
      (s) => s.accountId === props.account.id,
    ) &&
    !selected.value?.data.signatures?.some(
      (s) => s.accountId === props.account.id,
    ) &&
    ["issued", "partially_signed"].includes(selected.value?.data.status),
);
async function run(fn) {
  error.value = "";
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
function select(r) {
  selected.value = r;
  draft.value = JSON.parse(JSON.stringify(r.data));
  draft.value.parties ||= { practice: {}, operator: {} };
  draft.value.parties.practice ||= {};
  draft.value.parties.operator ||= {};
  draft.value.signers ||= r.data.patientId
    ? [{ accountId: "", capacity: "Patient or authorized guardian" }]
    : [
        { accountId: "", capacity: "Practice authorized representative" },
        { accountId: "", capacity: "Operator authorized representative" },
      ];
  consent.value = false;
  signatureName.value = "";
}
async function load() {
  if (!props.canManage)
    sharedDocuments.value = await api(`${props.base}/shared-documents`);
  records.value = await api(`${props.base}/agreements`);
  templates.value = await api(`${props.base}/agreement-templates`);
  if (props.canManage) {
    try {
      members.value = await api(`${props.base}/agreement-signers`);
    } catch {
      members.value = [];
    }
  }
  if (selected.value) {
    const r = records.value.find((r) => r.id === selected.value.id);
    if (r) select(r);
  }
}
const createNew = () =>
  run(async () => {
    const r = await api(`${props.base}/agreements`, {
      method: "POST",
      body: {
        type: newType.value,
        patientId: templates.value[newType.value].patient
          ? patientId.value
          : null,
      },
    });
    await load();
    select(r);
  });
const save = () =>
  run(async () => {
    select(
      await api(`${props.base}/agreements/${selected.value.id}`, {
        method: "PUT",
        body: { ...draft.value, revision: selected.value.revision },
      }),
    );
    await load();
  });
const action = (a) =>
  run(async () => {
    await api(`${props.base}/agreements/${selected.value.id}/${a}`, {
      method: "POST",
      body: {},
    });
    await load();
  });
const revise = () =>
  run(async () => {
    const r = await api(
      `${props.base}/agreements/${selected.value.id}/revise`,
      { method: "POST", body: {} },
    );
    await load();
    select(r);
  });
const sign = () =>
  run(async () => {
    await api(`${props.base}/agreements/${selected.value.id}/sign`, {
      method: "POST",
      body: {
        name: signatureName.value,
        consent: consent.value,
        contentHash: selected.value.data.contentHash,
      },
    });
    await load();
  });
onMounted(() => run(load));
</script>
