<template>
  <article class="card">
    <div class="section-heading">
      <div>
        <span class="eyebrow">Provider-scoped Note Aid</span>
        <h2>A starting point for your clinical judgment.</h2>
      </div>
      <button class="outline" @click="expanded = !expanded">
        {{ expanded ? "Close" : "Open Note Aid" }}
      </button>
    </div>
    <p v-if="catalog?.reason" class="muted">{{ catalog.reason }}</p>
    <p v-else class="muted">
      Available tools follow your reviewed Colorado credentials and practice
      services. You can always write a structured note without AI.
    </p>
    <div v-if="expanded">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <label
        >Patient<select v-model="patientId">
          <option value="">Choose patient</option>
          <option v-for="p in patients" :key="p.id" :value="p.id">
            {{ p.data.name }}
          </option>
        </select></label
      ><label
        >Note Aid<select v-model="aidId">
          <option value="">Choose an available tool</option>
          <option
            v-for="aid in catalog?.aids || []"
            :key="aid.id"
            :value="aid.id"
          >
            {{ aid.label }}
          </option>
        </select></label
      ><label
        >Session facts<textarea
          v-model="facts"
          rows="7"
          placeholder="Describe the service provided, interventions, response, treatment-plan progress and follow-up. Do not include facts you have not verified."
        ></textarea></label
      ><label class="checkbox-label"
        ><input type="checkbox" v-model="consent" />I verified the applicable
        consent for this use of AI-assisted documentation.</label
      ><button
        :disabled="
          busy || !catalog?.aiEnabled || !patientId || !aidId || !consent
        "
        @click="generate"
      >
        {{ busy ? "Preparing draft…" : "Prepare unsigned draft" }}
      </button>
      <p v-if="!catalog?.aiEnabled" class="muted">
        AI assistance opens after the practice’s vendor configuration is
        verified.
      </p>
      <div v-if="draft">
        <label
          >Review and edit the draft<textarea
            v-model="draft.data.content"
            rows="14"
          ></textarea>
        </label>
        <p class="notice">
          Check the source facts and remove any unsupported statements before
          saving. Signing is a separate step.
        </p>
        <button
          @click="
            $emit('use-draft', {
              patientId,
              content: draft.data.content,
              title: catalog.aids.find((a) => a.id === aidId)?.label,
              type:
                catalog.aids.find((a) => a.id === aidId)?.noteType ||
                'Progress note',
            })
          "
        >
          Use in a new note
        </button>
      </div>
    </div>
  </article>
</template>
<script setup>
import { ref, onMounted, watch } from "vue";
import { api } from "./api";
const props = defineProps({ base: String, patients: Array });
defineEmits(["use-draft"]);
const catalog = ref(null),
  expanded = ref(true),
  patientId = ref(""),
  aidId = ref(""),
  facts = ref(""),
  consent = ref(false),
  error = ref(""),
  busy = ref(false),
  draft = ref(null);
async function generate() {
  error.value = "";
  busy.value = true;
  try {
    const requestedPatient = patientId.value,
      requestedAid = aidId.value;
    const generated = await api(`${props.base}/note-aid/generate`, {
      method: "POST",
      body: {
        patientId: patientId.value,
        aidId: aidId.value,
        facts: facts.value,
        consentReviewed: consent.value,
      },
    });
    if (patientId.value === requestedPatient && aidId.value === requestedAid)
      draft.value = generated;
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
watch(patientId, () => {
  facts.value = "";
  draft.value = null;
  consent.value = false;
  error.value = "";
});
watch(aidId, () => {
  draft.value = null;
});
onMounted(async () => {
  try {
    catalog.value = await api(`${props.base}/note-aid`);
  } catch (e) {
    error.value = e.message;
  }
});
</script>
