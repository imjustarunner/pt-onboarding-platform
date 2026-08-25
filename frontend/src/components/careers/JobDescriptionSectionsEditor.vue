<template>
  <div class="jdse">
    <div class="jdse-block">
      <div class="jdse-label-row">
        <label class="jdse-label">About the Role</label>
        <span class="jdse-count" :class="{ 'jdse-count--warn': aboutLen >= ABOUT_MAX }">
          {{ aboutLen.toLocaleString() }} / {{ ABOUT_MAX.toLocaleString() }}
        </span>
      </div>
      <textarea
        class="jdse-textarea"
        rows="4"
        :value="model.aboutTheRole"
        :maxlength="ABOUT_MAX"
        placeholder="Describe the day-to-day work and impact of this role…"
        @input="patch({ aboutTheRole: String($event.target.value || '').slice(0, ABOUT_MAX) })"
      />
    </div>

    <div class="jdse-block">
      <div class="jdse-label-row">
        <label class="jdse-label">Responsibilities</label>
        <span class="jdse-count" :class="{ 'jdse-count--warn': model.responsibilities.length >= BULLET_MAX }">
          {{ model.responsibilities.length }} / {{ BULLET_MAX }} bullets
        </span>
      </div>
      <p class="jdse-hint">
        One bullet per line — paste from a list works. Max {{ BULLET_MAX }} bullets
        ({{ BULLET_LEN_MAX }} characters each).
      </p>
      <textarea
        class="jdse-textarea"
        rows="8"
        :value="bulletsText(model.responsibilities)"
        placeholder="Facilitate workshops&#10;Maintain accurate records&#10;…"
        @input="onBulletsInput('responsibilities', $event.target.value)"
      />
      <p v-if="truncation.responsibilities" class="jdse-warn">{{ truncation.responsibilities }}</p>
    </div>

    <div class="jdse-block">
      <div class="jdse-label-row">
        <label class="jdse-label">Qualifications</label>
        <span class="jdse-count" :class="{ 'jdse-count--warn': model.qualifications.length >= BULLET_MAX }">
          {{ model.qualifications.length }} / {{ BULLET_MAX }} bullets
        </span>
      </div>
      <p class="jdse-hint">
        One bullet per line — paste from a list works. Max {{ BULLET_MAX }} bullets
        ({{ BULLET_LEN_MAX }} characters each).
      </p>
      <textarea
        class="jdse-textarea"
        rows="8"
        :value="bulletsText(model.qualifications)"
        placeholder="Bachelor's degree…&#10;1–3 years of experience…&#10;…"
        @input="onBulletsInput('qualifications', $event.target.value)"
      />
      <p v-if="truncation.qualifications" class="jdse-warn">{{ truncation.qualifications }}</p>
    </div>

    <div class="jdse-block">
      <div class="jdse-label-row">
        <label class="jdse-label">Benefits</label>
        <span class="jdse-count" :class="{ 'jdse-count--warn': model.benefits.length >= BULLET_MAX }">
          {{ model.benefits.length }} / {{ BULLET_MAX }} bullets
        </span>
      </div>
      <p class="jdse-hint">
        One bullet per line — paste from a list works. Max {{ BULLET_MAX }} bullets
        ({{ BULLET_LEN_MAX }} characters each).
      </p>
      <textarea
        class="jdse-textarea"
        rows="8"
        :value="bulletsText(model.benefits)"
        placeholder="Competitive salary&#10;Health, dental, and vision&#10;…"
        @input="onBulletsInput('benefits', $event.target.value)"
      />
      <p v-if="truncation.benefits" class="jdse-warn">{{ truncation.benefits }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';
import {
  JOB_DESCRIPTION_ABOUT_MAX,
  JOB_DESCRIPTION_BULLET_MAX,
  JOB_DESCRIPTION_BULLET_LEN_MAX
} from '../../utils/jobDescriptionSectionsLimits.js';

const props = defineProps({
  modelValue: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue']);

const ABOUT_MAX = JOB_DESCRIPTION_ABOUT_MAX;
const BULLET_MAX = JOB_DESCRIPTION_BULLET_MAX;
const BULLET_LEN_MAX = JOB_DESCRIPTION_BULLET_LEN_MAX;

const truncation = reactive({
  responsibilities: '',
  qualifications: '',
  benefits: ''
});

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

const aboutLen = computed(() => String(model.value.aboutTheRole || '').length);

const bulletsText = (arr) => (Array.isArray(arr) ? arr : []).join('\n');

const parseBullets = (raw) => {
  const lines = String(raw || '')
    .split('\n')
    .map((s) => s.replace(/^[\s•\-\*]+/, '').trim())
    .filter(Boolean);
  const clipped = lines.map((s) => (s.length > BULLET_LEN_MAX ? s.slice(0, BULLET_LEN_MAX) : s));
  const truncatedByCount = clipped.length > BULLET_MAX;
  const truncatedByLen = lines.some((s) => s.length > BULLET_LEN_MAX);
  return {
    bullets: clipped.slice(0, BULLET_MAX),
    truncatedByCount,
    truncatedByLen,
    droppedCount: Math.max(0, clipped.length - BULLET_MAX)
  };
};

const truncationMessage = ({ truncatedByCount, truncatedByLen, droppedCount }) => {
  const parts = [];
  if (truncatedByCount) {
    parts.push(
      `Only the first ${BULLET_MAX} bullets were kept` +
        (droppedCount ? ` (${droppedCount} removed)` : '')
    );
  }
  if (truncatedByLen) {
    parts.push(`bullets longer than ${BULLET_LEN_MAX} characters were shortened`);
  }
  if (!parts.length) return '';
  return `${parts.join('; ')}.`;
};

const onBulletsInput = (field, raw) => {
  const parsed = parseBullets(raw);
  truncation[field] = truncationMessage(parsed);
  patch({ [field]: parsed.bullets });
};

const patch = (partial) => {
  emit('update:modelValue', { ...blank(), ...model.value, ...partial });
};
</script>

<style scoped>
.jdse { display: flex; flex-direction: column; gap: 14px; }
.jdse-block { display: flex; flex-direction: column; gap: 6px; }
.jdse-label-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.jdse-label { font-size: 0.85rem; font-weight: 700; color: #374151; }
.jdse-count { font-size: 0.75rem; color: #6b7280; white-space: nowrap; }
.jdse-count--warn { color: #b45309; font-weight: 600; }
.jdse-hint { margin: 0; font-size: 0.75rem; color: #9ca3af; }
.jdse-warn {
  margin: 0;
  font-size: 0.75rem;
  color: #b45309;
  font-weight: 600;
}
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
