<template>
  <fieldset>
    <legend>Structured documentation</legend>
    <label
      >Practice template
      <select :value="selection" @change="selectTemplate($event)">
        <option value="">Narrative note</option>
        <option v-for="t in options" :key="key(t)" :value="key(t)">
          {{ t.data.name }} · version {{ t.revision }}
        </option>
      </select>
    </label>
    <p class="muted">
      Templates work without AI. Required sections must be completed before
      signing.
    </p>
    <template v-if="model.structured">
      <label v-for="f in model.structured.snapshot.fields" :key="f.key">
        {{ f.label }}{{ f.required ? " (required to sign)" : "" }}
        <textarea
          v-if="f.type === 'textarea'"
          v-model="model.structured.answers[f.key]"
          rows="5"
          maxlength="10000"
        ></textarea>
        <select
          v-else-if="f.type === 'select' || f.type === 'boolean'"
          v-model="model.structured.answers[f.key]"
        >
          <option value="">Not yet documented</option>
          <template v-if="f.type === 'boolean'">
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </template>
          <template v-else
            ><option v-for="o in f.options" :key="o" :value="o">
              {{ o }}
            </option></template
          >
        </select>
        <input
          v-else
          v-model="model.structured.answers[f.key]"
          maxlength="1000"
        />
      </label>
    </template>
  </fieldset>
</template>
<script setup>
import { computed } from "vue";
const props = defineProps({
  model: Object,
  templates: { type: Array, default: () => [] },
});
const key = (t) => `${t.id}:${t.revision}`;
const selection = computed(() =>
  props.model.structured
    ? `${props.model.structured.templateId}:${props.model.structured.templateRevision}`
    : "",
);
const options = computed(() => {
  const available = props.templates.filter((t) => t.data.status === "active");
  const saved = props.model.structured;
  if (saved && !available.some((t) => key(t) === selection.value))
    return [
      {
        id: saved.templateId,
        revision: saved.templateRevision,
        data: saved.snapshot,
      },
      ...available,
    ];
  return available;
});
function selectTemplate(event) {
  const value = event.target.value;
  if (
    props.model.structured &&
    Object.keys(props.model.structured.answers).length &&
    !window.confirm(
      "Changing the template clears the structured answers in this draft. Continue?",
    )
  ) {
    event.target.value = selection.value;
    return;
  }
  const template = options.value.find((t) => key(t) === value);
  if (!template) {
    props.model.structured = null;
    return;
  }
  props.model.structured = {
    templateId: template.id,
    templateRevision: template.revision,
    snapshot: template.data,
    answers: {},
  };
  props.model.type = template.data.noteType;
  if (!template.data.serviceCodes.includes(props.model.serviceCode))
    props.model.serviceCode = template.data.serviceCodes[0];
}
</script>
