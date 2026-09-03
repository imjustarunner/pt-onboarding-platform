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
        <span class="jdse-count">{{ model.responsibilitySets.length }} / {{ SET_MAX }} sets</span>
      </div>
      <p class="jdse-hint">
        Group bullets under section titles (for example “Individualized Instruction”). Paste one bullet per line.
      </p>
      <div
        v-for="(set, idx) in model.responsibilitySets"
        :key="`set-${idx}`"
        class="jdse-set"
      >
        <div class="jdse-set-head">
          <input
            class="jdse-input"
            type="text"
            :value="set.title"
            :maxlength="SET_TITLE_MAX"
            placeholder="Section title (optional)"
            @input="updateSet(idx, { title: String($event.target.value || '').slice(0, SET_TITLE_MAX) })"
          />
          <button
            type="button"
            class="jdse-remove"
            :disabled="model.responsibilitySets.length <= 1"
            @click="removeSet(idx)"
          >
            Remove
          </button>
        </div>
        <textarea
          class="jdse-textarea"
          rows="5"
          :value="bulletsText(set.items)"
          placeholder="Facilitate workshops&#10;Maintain accurate records&#10;…"
          @input="onSetBulletsInput(idx, $event.target.value)"
        />
        <p v-if="truncation[`set-${idx}`]" class="jdse-warn">{{ truncation[`set-${idx}`] }}</p>
      </div>
      <button
        type="button"
        class="jdse-add"
        :disabled="model.responsibilitySets.length >= SET_MAX"
        @click="addSet"
      >
        Add responsibility set
      </button>
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
  JOB_DESCRIPTION_BULLET_LEN_MAX,
  JOB_DESCRIPTION_SET_MAX,
  JOB_DESCRIPTION_SET_TITLE_MAX,
  JOB_DESCRIPTION_SET_BULLET_MAX
} from '../../utils/jobDescriptionSectionsLimits.js';

const props = defineProps({
  modelValue: { type: Object, default: null }
});
const emit = defineEmits(['update:modelValue']);

const ABOUT_MAX = JOB_DESCRIPTION_ABOUT_MAX;
const BULLET_MAX = JOB_DESCRIPTION_BULLET_MAX;
const BULLET_LEN_MAX = JOB_DESCRIPTION_BULLET_LEN_MAX;
const SET_MAX = JOB_DESCRIPTION_SET_MAX;
const SET_TITLE_MAX = JOB_DESCRIPTION_SET_TITLE_MAX;
const SET_BULLET_MAX = JOB_DESCRIPTION_SET_BULLET_MAX;

const truncation = reactive({
  qualifications: '',
  benefits: ''
});

const blankSet = () => ({ title: '', items: [] });

const blank = () => ({
  aboutTheRole: '',
  responsibilitySets: [blankSet()],
  qualifications: [],
  benefits: []
});

const coerceSets = (src) => {
  if (Array.isArray(src?.responsibilitySets) && src.responsibilitySets.length) {
    return src.responsibilitySets.map((s) => ({
      title: String(s?.title || ''),
      items: Array.isArray(s?.items)
        ? s.items.map((x) => String(x || '').trim()).filter(Boolean)
        : []
    }));
  }
  if (Array.isArray(src?.responsibilities) && src.responsibilities.length) {
    const objectSets = src.responsibilities.some((x) => x && typeof x === 'object');
    if (objectSets) {
      return src.responsibilities.map((s) => ({
        title: String(s?.title || ''),
        items: Array.isArray(s?.items)
          ? s.items.map((x) => String(x || '').trim()).filter(Boolean)
          : []
      }));
    }
    return [{ title: '', items: src.responsibilities.map((s) => String(s || '').trim()).filter(Boolean) }];
  }
  return [blankSet()];
};

const model = computed(() => {
  const src = props.modelValue && typeof props.modelValue === 'object' ? props.modelValue : {};
  return {
    aboutTheRole: String(src.aboutTheRole || ''),
    responsibilitySets: coerceSets(src),
    qualifications: Array.isArray(src.qualifications) ? src.qualifications : [],
    benefits: Array.isArray(src.benefits) ? src.benefits : []
  };
});

const aboutLen = computed(() => String(model.value.aboutTheRole || '').length);

const bulletsText = (arr) => (Array.isArray(arr) ? arr : []).join('\n');

const parseBullets = (raw, maxItems = BULLET_MAX) => {
  const lines = String(raw || '')
    .split('\n')
    .map((s) => s.replace(/^[\s•\-\*]+/, '').trim())
    .filter(Boolean);
  const clipped = lines.map((s) => (s.length > BULLET_LEN_MAX ? s.slice(0, BULLET_LEN_MAX) : s));
  const truncatedByCount = clipped.length > maxItems;
  const truncatedByLen = lines.some((s) => s.length > BULLET_LEN_MAX);
  return {
    bullets: clipped.slice(0, maxItems),
    truncatedByCount,
    truncatedByLen,
    droppedCount: Math.max(0, clipped.length - maxItems)
  };
};

const truncationMessage = ({ truncatedByCount, truncatedByLen, droppedCount }, maxItems = BULLET_MAX) => {
  const parts = [];
  if (truncatedByCount) {
    parts.push(
      `Only the first ${maxItems} bullets were kept`
        + (droppedCount ? ` (${droppedCount} removed)` : '')
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

const onSetBulletsInput = (idx, raw) => {
  const parsed = parseBullets(raw, SET_BULLET_MAX);
  truncation[`set-${idx}`] = truncationMessage(parsed, SET_BULLET_MAX);
  const next = model.value.responsibilitySets.map((s, i) => (
    i === idx ? { ...s, items: parsed.bullets } : s
  ));
  patch({ responsibilitySets: next });
};

const updateSet = (idx, partial) => {
  const next = model.value.responsibilitySets.map((s, i) => (
    i === idx ? { ...s, ...partial } : s
  ));
  patch({ responsibilitySets: next });
};

const addSet = () => {
  if (model.value.responsibilitySets.length >= SET_MAX) return;
  patch({ responsibilitySets: [...model.value.responsibilitySets, blankSet()] });
};

const removeSet = (idx) => {
  if (model.value.responsibilitySets.length <= 1) return;
  patch({
    responsibilitySets: model.value.responsibilitySets.filter((_, i) => i !== idx)
  });
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
.jdse-textarea,
.jdse-input {
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
.jdse-set {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}
.jdse-set-head {
  display: flex;
  gap: 8px;
  align-items: center;
}
.jdse-remove,
.jdse-add {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  color: #374151;
  white-space: nowrap;
}
.jdse-add { align-self: flex-start; }
.jdse-remove:disabled,
.jdse-add:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
