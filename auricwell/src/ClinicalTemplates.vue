<template>
  <article class="card">
    <div class="section-heading">
      <h2>
        {{ intake ? "Patient intake questionnaires" : "Clinical templates" }}
      </h2>
      <button class="outline" @click="start()">
        {{ intake ? "New questionnaire" : "New template" }}
      </button>
    </div>
    <p>
      {{
        intake
          ? "Configure the questions patients and guardians complete before clinical review. Issued forms retain their original questionnaire version."
          : "Configure documentation for your practice’s therapy services. Saved notes retain their original template version."
      }}
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <div v-for="t in templates" :key="t.id" class="list-row">
      <span
        >{{ t.data.name
        }}<template v-if="!intake"> · {{ t.data.noteType }}</template> · version
        {{ t.revision }} · {{ t.data.status }}</span
      >
      <button class="outline" @click="start(t)">
        {{ intake ? "Edit questionnaire" : "Edit template" }}
      </button>
    </div>
    <p v-if="!templates.length" class="muted">
      {{
        intake
          ? "Create your first questionnaire to begin assigning intake forms."
          : "No templates yet. You can still document care with narrative notes."
      }}
    </p>
    <form v-if="draft" @submit.prevent="save">
      <label
        >Template name<input v-model="draft.name" required maxlength="200"
      /></label>
      <label v-if="!intake"
        >Note type<select v-model="draft.noteType" required>
          <option v-for="type in types" :key="type">{{ type }}</option>
        </select></label
      >
      <label
        >Status<select v-model="draft.status">
          <option value="active">Active</option>
          <option value="inactive">Retired</option>
        </select></label
      >
      <label v-if="intake"
        >Instructions for patients<textarea
          v-model="draft.instructions"
          maxlength="4000"
          rows="3"
        ></textarea>
      </label>
      <fieldset v-if="!intake">
        <legend>Applicable services</legend>
        <label
          v-for="s in services.filter((s) => s.active !== false)"
          :key="s.code"
          class="checkbox-label"
        >
          <input
            type="checkbox"
            v-model="draft.serviceCodes"
            :value="s.code"
          />{{ s.code }} · {{ s.name }}
        </label>
        <p v-if="!services.length" class="muted">
          Save your practice services first.
        </p>
      </fieldset>
      <fieldset v-for="(f, index) in draft.fields" :key="f.key">
        <legend>Section {{ index + 1 }}</legend>
        <label>Label<input v-model="f.label" required maxlength="200" /></label>
        <label
          >Answer format<select v-model="f.type">
            <option value="textarea">Long text</option>
            <option value="text">Short text</option>
            <option value="select">Choice</option>
            <option value="boolean">Yes / no</option>
          </select></label
        >
        <label v-if="f.type === 'select'"
          >Choices, one per line<textarea
            v-model="f.choiceLines"
            required
            rows="3"
          ></textarea>
        </label>
        <label class="checkbox-label"
          ><input type="checkbox" v-model="f.required" />Required before
          {{ intake ? "submission" : "signing" }}</label
        >
        <button
          type="button"
          class="outline"
          @click="draft.fields.splice(index, 1)"
        >
          Remove section {{ index + 1 }}
        </button>
      </fieldset>
      <div class="actions">
        <button
          type="button"
          class="outline"
          :disabled="draft.fields.length >= 40"
          @click="addField"
        >
          Add section</button
        ><button :disabled="busy">
          {{ busy ? "Saving…" : "Save template version" }}</button
        ><button type="button" class="outline" @click="draft = null">
          Cancel
        </button>
      </div>
    </form>
  </article>
</template>
<script setup>
import { ref, onMounted } from "vue";
import { api } from "./api";
const props = defineProps({
  base: String,
  services: { type: Array, default: () => [] },
  intake: Boolean,
});
const templates = ref([]),
  draft = ref(null),
  editing = ref(null),
  busy = ref(false),
  error = ref(""),
  notice = ref("");
const endpoint = props.intake ? "intake-templates" : "note-templates";
const types = [
  "Progress note",
  "Intake assessment",
  "Treatment plan",
  "Discharge summary",
  "Amendment",
];
function addField() {
  draft.value.fields.push({
    key: `field_${crypto.randomUUID().replaceAll("-", "")}`,
    label: "",
    type: "textarea",
    required: true,
    choiceLines: "",
  });
}
function start(template) {
  error.value = "";
  notice.value = "";
  editing.value = template || null;
  draft.value = template
    ? JSON.parse(JSON.stringify(template.data))
    : {
        name: "",
        noteType: types[0],
        status: "active",
        serviceCodes: [],
        fields: [],
      };
  for (const f of draft.value.fields)
    f.choiceLines = (f.options || []).join("\n");
  if (!template) addField();
}
async function load() {
  templates.value = await api(`${props.base}/${endpoint}`);
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    await api(
      `${props.base}/${endpoint}${editing.value ? `/${editing.value.id}` : ""}`,
      {
        method: editing.value ? "PUT" : "POST",
        body: {
          ...draft.value,
          revision: editing.value?.revision,
          fields: draft.value.fields.map((f) => ({
            ...f,
            options:
              f.type === "select"
                ? f.choiceLines
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [],
          })),
        },
      },
    );
    draft.value = null;
    await load();
    notice.value = props.intake
      ? "Questionnaire saved. Assigned forms keep their original version."
      : "Template saved. Existing notes keep their original version.";
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
onMounted(async () => {
  try {
    await load();
  } catch (e) {
    error.value = e.message;
  }
});
</script>
