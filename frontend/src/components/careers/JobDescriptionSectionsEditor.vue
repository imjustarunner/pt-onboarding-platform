<template>
  <div class="jdse">
    <div class="jdse-block">
      <label class="jdse-label">About the Role</label>
      <textarea
        class="jdse-textarea"
        rows="4"
        :value="model.aboutTheRole"
        placeholder="Describe the day-to-day work and impact of this role…"
        @input="patch({ aboutTheRole: $event.target.value })"
      />
    </div>

    <div class="jdse-block">
      <label class="jdse-label">Responsibilities</label>
      <p class="jdse-hint">One bullet per line — paste from a list works.</p>
      <textarea
        class="jdse-textarea"
        rows="5"
        :value="bulletsText(model.responsibilities)"
        placeholder="Facilitate workshops&#10;Maintain accurate records&#10;…"
        @input="patch({ responsibilities: parseBullets($event.target.value) })"
      />
    </div>

    <div class="jdse-block">
      <label class="jdse-label">Qualifications</label>
      <p class="jdse-hint">One bullet per line — paste from a list works.</p>
      <textarea
        class="jdse-textarea"
        rows="5"
        :value="bulletsText(model.qualifications)"
        placeholder="Bachelor's degree…&#10;1–3 years of experience…&#10;…"
        @input="patch({ qualifications: parseBullets($event.target.value) })"
      />
    </div>

    <div class="jdse-block">
      <label class="jdse-label">Benefits</label>
      <p class="jdse-hint">One bullet per line — paste from a list works.</p>
      <textarea
        class="jdse-textarea"
        rows="5"
        :value="bulletsText(model.benefits)"
        placeholder="Competitive salary&#10;Health, dental, and vision&#10;…"
        @input="patch({ benefits: parseBullets($event.target.value) })"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue']);

const blank = () => ({
  aboutTheRole: '',
  responsibilities: [],
  qualifications: [],
  benefits: []
});

const model = computed(() => {
  const src = props.modelValue && typeof props.modelValue === 'object' ? props.modelValue : {};
  return {
    aboutTheRole: String(src.aboutTheRole || ''),
    responsibilities: Array.isArray(src.responsibilities) ? src.responsibilities : [],
    qualifications: Array.isArray(src.qualifications) ? src.qualifications : [],
    benefits: Array.isArray(src.benefits) ? src.benefits : []
  };
});

const bulletsText = (arr) => (Array.isArray(arr) ? arr : []).join('\n');
const parseBullets = (raw) =>
  String(raw || '')
    .split('\n')
    .map((s) => s.replace(/^[\s•\-\*]+/, '').trim())
    .filter(Boolean)
    .slice(0, 12);

const patch = (partial) => {
  emit('update:modelValue', { ...blank(), ...model.value, ...partial });
};
</script>

<style scoped>
.jdse { display: flex; flex-direction: column; gap: 14px; }
.jdse-block { display: flex; flex-direction: column; gap: 6px; }
.jdse-label { font-size: 0.85rem; font-weight: 700; color: #374151; }
.jdse-hint { margin: 0; font-size: 0.75rem; color: #9ca3af; }
.jdse-textarea {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 10px;
  font-size: 14px;
  font-family: inherit;
  line-height: 1.45;
  resize: vertical;
  box-sizing: border-box;
}
</style>
