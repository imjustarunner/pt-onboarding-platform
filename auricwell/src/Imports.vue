<template>
  <section>
    <div class="page-heading">
      <div>
        <span class="eyebrow">Move from TherapyNotes</span>
        <h1>Bring your history with you.</h1>
        <p>
          Download exports from TherapyNotes, then upload and review them here.
          Original files are retained.
        </p>
      </div>
    </div>
    <p class="notice">
      Starting a new practice? Imports are optional. Your setup does not depend
      on historical records.
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="split-panel">
      <aside class="stack">
        <article class="card">
          <h2>Upload an export</h2>
          <label
            >Import type<select v-model="type">
              <option v-for="(label, key) in types" :key="key" :value="key">
                {{ label }}
              </option>
            </select></label
          ><label
            >Choose file<input
              type="file"
              :accept="type === 'clinical_pdf' ? '.pdf' : '.csv,.xlsx'"
              @change="file = $event.target.files[0]" /></label
          ><button :disabled="busy || !file" @click="upload">
            {{ progress || "Upload and prepare review" }}</button
          ><button
            class="outline"
            v-if="type !== 'clinical_pdf'"
            @click="templateFile"
          >
            Download CSV template
          </button>
          <p class="muted">
            Up to 100 MB. You can reselect the same file to resume an
            interrupted upload.
          </p>
        </article>
        <article class="card">
          <h2>Your imports</h2>
          <button
            v-for="b in batches"
            :key="b.id"
            class="record-select"
            @click="open(b.id)"
          >
            <strong>{{ b.data.filename }}</strong
            ><span
              >{{ b.data.status.replaceAll("_", " ") }} ·
              {{ b.data.applied.length }} applied</span
            ></button
          ><button class="outline" :disabled="busy" @click="refresh">
            Refresh processing status
          </button>
        </article>
        <article class="card">
          <h2>Export guidance</h2>
          <p>
            In TherapyNotes Billing, filter transactions and use Export
            Spreadsheet. Include patient and transaction identifiers where
            available. Export each patient’s documents from their Documents tab
            using Download Multiple.
          </p>
          <p>
            <a
              href="https://support.therapynotes.com/hc/en-us/articles/30661348713115-Main-Billing-Page"
              target="_blank"
              rel="noopener noreferrer"
              >Billing export instructions</a
            >
            ·
            <a
              href="https://support.therapynotes.com/hc/en-us/articles/30661278579227-Download-and-Print-Notes"
              target="_blank"
              rel="noopener noreferrer"
              >PDF export instructions</a
            >
          </p>
          <p>
            Use the templates for staff, payer and appointment information when
            an export is unavailable. Keep stable source identifiers across
            files; do not use patient IDs as transaction IDs.
          </p>
          <h2>Suggested order</h2>
          <ol>
            <li>Staff/providers</li>
            <li>Payers</li>
            <li>Patients and billing reports</li>
            <li>Client PDF documentation</li>
            <li>Future appointments</li>
            <li>Reconcile balances and cutover</li>
          </ol>
          <p>
            Staff imports create pending accounts. Billing history never submits
            claims or posts payments.
          </p>
        </article>
      </aside>
      <article class="card" v-if="preview">
        <h2>{{ preview.batch.data.filename }}</h2>
        <p class="muted">
          {{ preview.batch.data.status.replaceAll("_", " ") }}
        </p>
        <p
          v-for="issue in preview.batch.data.issues"
          :key="JSON.stringify(issue)"
          class="error"
        >
          {{ issue.message || issue }}
        </p>
        <a
          :href="`/api/auricwell${base}/imports/${preview.batch.id}/source`"
          class="text-link"
          >Download retained original</a
        ><template v-if="preview.parsed?.headers"
          ><h3>Map spreadsheet columns</h3>
          <div class="form-grid">
            <label v-for="field in preview.fields" :key="field"
              >{{ labels[field] || field
              }}<select v-model="mapping[field]">
                <option value="">Not provided</option>
                <option v-for="h in preview.parsed.headers" :key="h" :value="h">
                  {{ h }}
                </option>
              </select></label
            >
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Row</th>
                  <th>Source values</th>
                  <th>Resolve</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(r, i) in preview.parsed.rows.slice(
                    page * 50,
                    page * 50 + 50,
                  )"
                  :key="i"
                >
                  <td>
                    <input
                      type="checkbox"
                      :value="page * 50 + i"
                      v-model="selectedRows"
                      :aria-label="`Select row ${page * 50 + i + 1}`"
                    />
                  </td>
                  <td>{{ page * 50 + i + 1 }}</td>
                  <td>{{ Object.values(r).join(" · ") }}</td>
                  <td>
                    <button class="outline" @click="reviewRow(page * 50 + i)">
                      Review row
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="actions">
            <button class="outline" :disabled="page === 0" @click="page--">
              Previous</button
            ><button
              class="outline"
              :disabled="(page + 1) * 50 >= preview.parsed.rows.length"
              @click="page++"
            >
              Next
            </button>
          </div>
          <article v-if="rowIndex !== null" class="card">
            <h3>Row {{ rowIndex + 1 }} corrections</h3>
            <label v-for="field in preview.fields" :key="field"
              >{{ labels[field] || field
              }}<input v-model="rowCorrections[field]" /></label
            ><label
              v-if="['patients', 'billing'].includes(preview.batch.data.type)"
              >Match existing chart<select v-model="rowMatch">
                <option value="">Create or match by source identifier</option>
                <option v-for="p in patients" :value="p.id" :key="p.id">
                  {{ p.data.name }} · {{ p.data.dob }}
                </option>
              </select></label
            ><button class="outline" @click="saveRow">
              Keep reviewed corrections
            </button>
          </article>
          <label class="checkbox-label"
            ><input v-model="reviewed" type="checkbox" />I reviewed the selected
            rows and column mapping.</label
          ><button
            :disabled="busy || !reviewed || !selectedRows.length"
            @click="applyRows"
          >
            Apply {{ selectedRows.length }} reviewed rows
          </button></template
        ><template v-if="preview.parsed?.pages"
          ><h3>Review a historical note</h3>
          <details>
            <summary>Source page preview</summary>
            <label
              >Page<input
                type="number"
                min="1"
                :max="preview.parsed.pages.length"
                v-model.number="sourcePage" /></label
            ><img
              :src="`/api/auricwell${base}/imports/${preview.batch.id}/pages/${sourcePage}`"
              alt="Original PDF source page"
              style="width: 100%; border: 1px solid #dce5f0"
            />
          </details>
          <label class="checkbox-label"
            ><input type="checkbox" v-model="note.attachmentOnly" />Keep as an
            unresolved historical attachment</label
          ><label
            >Patient<select v-model="note.patientId">
              <option value="">Choose patient</option>
              <option v-for="p in patients" :key="p.id" :value="p.id">
                {{ p.data.name }} · {{ p.data.dob }}
              </option>
            </select></label
          >
          <div class="form-grid">
            <label
              >First page<input
                v-model.number="note.pageStart"
                type="number"
                min="1" /></label
            ><label
              >Last page<input
                v-model.number="note.pageEnd"
                type="number"
                min="1"
            /></label>
          </div>
          <button class="outline" @click="extractPages">Load page text</button
          ><label>Title<input v-model="note.title" /></label
          ><label>Original author<input v-model="note.author" /></label
          ><label
            >Service date<input v-model="note.serviceDate" type="date" /></label
          ><label
            >Signature evidence<input v-model="note.signatureEvidence" /></label
          ><label
            >Reviewed note text<textarea
              v-model="note.content"
              rows="14"
            ></textarea></label
          ><label class="checkbox-label"
            ><input v-model="reviewed" type="checkbox" />I checked the original
            pages, patient, note boundaries and extracted content.</label
          ><button :disabled="busy || !reviewed" @click="applyNote">
            Attach reviewed historical note
          </button></template
        >
        <article class="card" v-if="preview.parsed">
          <h3>Reconciliation</h3>
          <p>
            {{
              preview.batch.data.reconciliation
                ? `Reviewed: ${preview.batch.data.reconciliation.appliedCount} applied, ${preview.batch.data.reconciliation.excludedCount} excluded.`
                : "Account for every source row or PDF page before completing this import."
            }}
          </p>
          <label
            >Excluded rows / pages<input
              type="number"
              min="0"
              v-model.number="excludedCount" /></label
          ><label
            >Explanation<textarea v-model="reconciliationReason"></textarea>
          </label>
          <div class="actions">
            <button :disabled="busy" @click="reconcile">
              Save reviewed reconciliation</button
            ><button class="outline" :disabled="busy" @click="rollback">
              Withdraw unchanged imported records
            </button>
          </div>
          <p v-if="preview.batch.data.rollback">
            {{ preview.batch.data.rollback.withdrawn.length }} withdrawn;
            {{ preview.batch.data.rollback.preserved.length }} preserved because
            they existed, changed or were referenced.
          </p>
        </article>
        <button
          v-if="preview.batch.data.status === 'failed'"
          class="outline"
          @click="retry"
        >
          Retry processing
        </button>
        <p v-if="!preview.parsed" class="muted">
          {{
            preview.batch.data.error ||
            "The import worker will prepare a review. Refresh to check progress."
          }}
        </p>
      </article>
      <article v-else class="card empty">
        <h2>Review before anything reaches the chart.</h2>
        <p>
          Choose an import to map columns, review note pages and resolve record
          attribution.
        </p>
      </article>
    </div>
  </section>
</template>
<script setup>
import { ref, onMounted } from "vue";
import { api } from "./api";
const props = defineProps({ base: String, patients: Array });
const types = {
  providers: "Staff / providers",
  payers: "Payers",
  patients: "Patient list",
  billing: "Billing report",
  clinical_pdf: "Clinical PDF documentation",
  appointments: "Future appointments",
};
const labels = {
  sourceId: "Source record ID",
  patientSourceId: "Patient source ID",
  providerSourceId: "Provider source ID",
  payerSourceId: "Payer source ID",
  dob: "Birth date (YYYY-MM-DD)",
  electronicPayerId: "Electronic payer ID",
};
const type = ref("providers"),
  file = ref(null),
  batches = ref([]),
  preview = ref(null),
  mapping = ref({}),
  error = ref(""),
  busy = ref(false),
  progress = ref(""),
  page = ref(0),
  selectedRows = ref([]),
  reviewed = ref(false);
const sourcePage = ref(1);
const decisions = ref({}),
  rowIndex = ref(null),
  rowCorrections = ref({}),
  rowMatch = ref(""),
  excludedCount = ref(0),
  reconciliationReason = ref("");
const note = ref({
  patientId: "",
  pageStart: 1,
  pageEnd: 1,
  title: "",
  author: "",
  serviceDate: "",
  signatureEvidence: "",
  content: "",
});
async function run(fn) {
  error.value = "";
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
    progress.value = "";
  }
}
async function refresh() {
  batches.value = await api(`${props.base}/imports`);
  if (preview.value)
    preview.value = await api(
      `${props.base}/imports/${preview.value.batch.id}`,
    );
}
async function open(id) {
  await run(async () => {
    preview.value = await api(`${props.base}/imports/${id}`);
    mapping.value = { ...preview.value.batch.data.mapping };
    selectedRows.value = [];
    decisions.value = {};
    rowIndex.value = null;
    reviewed.value = false;
    page.value = 0;
  });
}
async function upload() {
  await run(async () => {
    const buffer = await file.value.arrayBuffer();
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const b = await api(`${props.base}/imports`, {
      method: "POST",
      body: {
        filename: file.value.name,
        size: file.value.size,
        sha256: digest,
        type: type.value,
      },
    });
    if (b.data.status === "uploading") {
      const state = await api(`${props.base}/imports/${b.id}`);
      for (let i = 0; i < b.data.chunkCount; i++) {
        if (state.receivedChunks.includes(i)) continue;
        const bytes = new Uint8Array(
          buffer.slice(i * b.data.chunkSize, (i + 1) * b.data.chunkSize),
        );
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 8192),
          );
        await api(`${props.base}/imports/${b.id}/chunks/${i}`, {
          method: "PUT",
          body: { base64: btoa(binary) },
        });
        progress.value = `Uploading ${Math.round(((i + 1) / b.data.chunkCount) * 100)}%`;
      }
      await api(`${props.base}/imports/${b.id}/complete`, {
        method: "POST",
        body: {},
      });
    }
    await refresh();
    preview.value = await api(`${props.base}/imports/${b.id}`);
  });
}
const applyRows = () =>
  run(async () => {
    await api(`${props.base}/imports/${preview.value.batch.id}/apply`, {
      method: "POST",
      body: {
        reviewed: true,
        mapping: mapping.value,
        decisions: selectedRows.value.map((i) => ({
          key: String(i),
          ...decisions.value[i],
        })),
      },
    });
    selectedRows.value = [];
    reviewed.value = false;
    await refresh();
  });
function extractPages() {
  note.value.content = preview.value.parsed.pages
    .filter(
      (p) => p.page >= note.value.pageStart && p.page <= note.value.pageEnd,
    )
    .map((p) => p.text)
    .join("\n\n");
}
const applyNote = () =>
  run(async () => {
    await api(`${props.base}/imports/${preview.value.batch.id}/apply`, {
      method: "POST",
      body: {
        reviewed: true,
        decisions: [
          {
            ...note.value,
            key: `${note.value.pageStart}-${note.value.pageEnd}`,
          },
        ],
      },
    });
    reviewed.value = false;
    await refresh();
  });
function reviewRow(i) {
  rowIndex.value = i;
  const raw = preview.value.parsed.rows[i];
  rowCorrections.value = Object.fromEntries(
    preview.value.fields.map((f) => [
      f,
      decisions.value[i]?.corrections?.[f] ?? raw[mapping.value[f] || f] ?? "",
    ]),
  );
  rowMatch.value = decisions.value[i]?.patientId || "";
}
function saveRow() {
  decisions.value[rowIndex.value] = {
    corrections: { ...rowCorrections.value },
    ...(rowMatch.value ? { patientId: rowMatch.value } : {}),
  };
  if (!selectedRows.value.includes(rowIndex.value))
    selectedRows.value.push(rowIndex.value);
  rowIndex.value = null;
}
const reconcile = () =>
  run(async () => {
    await api(`${props.base}/imports/${preview.value.batch.id}/reconcile`, {
      method: "POST",
      body: {
        reviewed: true,
        excludedCount: excludedCount.value,
        explanation: reconciliationReason.value,
      },
    });
    await refresh();
  });
const rollback = () =>
  run(async () => {
    if (
      !window.confirm(
        "Withdraw unchanged records from this import? Later edits and dependent records will be preserved.",
      )
    )
      return;
    await api(`${props.base}/imports/${preview.value.batch.id}/rollback`, {
      method: "POST",
      body: { reviewed: true, reason: reconciliationReason.value },
    });
    await refresh();
  });
const retry = () =>
  run(async () => {
    await api(`${props.base}/imports/${preview.value.batch.id}/retry`, {
      method: "POST",
      body: {},
    });
    await refresh();
  });
function templateFile() {
  const columns = {
    providers: "sourceId,name,username,email,credential,npi,status",
    payers: "sourceId,name,electronicPayerId,address",
    patients: "sourceId,name,dob,phone,email,address",
    billing:
      "sourceId,patientSourceId,name,dob,providerSourceId,payerSourceId,date,serviceCode,charge,paid,balance",
    appointments:
      "sourceId,patientSourceId,providerSourceId,start,end,serviceCode,location",
  };
  const url = URL.createObjectURL(
    new Blob([columns[type.value] + "\n"], { type: "text/csv" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `auricwell-${type.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
onMounted(() => run(refresh));
</script>
