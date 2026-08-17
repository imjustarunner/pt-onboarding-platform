<template>
  <div v-if="type === 'info'" class="df-notice" style="margin-bottom: 1rem;">
    <div class="df-notice-body" v-html="safeInfoHtml" />
  </div>
  <div v-else class="df-field" :class="{ 'df-field--error': error, [`df-field--${size}`]: !!size }">
    <label v-if="label && type !== 'checkbox'" class="df-field-label" :for="inputId">
      {{ label }}
      <span v-if="required" class="df-field-required">*</span>
      <span v-else-if="optionalBadge" class="df-field-optional">optional</span>
    </label>
    <p v-if="help && type !== 'checkbox' && String(help).trim().toLowerCase() !== 'optional'" class="df-field-help">{{ help }}</p>

    <template v-if="type === 'email'">
      <input
        :id="inputId"
        class="df-input"
        type="text"
        inputmode="email"
        autocomplete="email"
        autocapitalize="none"
        spellcheck="false"
        :value="modelValue"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :aria-invalid="error ? 'true' : undefined"
        @input="onEmailInput"
        @blur="$emit('blur')"
      />
      <div v-if="resolvedEmailDomainHints.length" class="df-email-domain-hints">
        <span class="df-email-domain-hints-label">Quick fill:</span>
        <button
          v-for="domain in resolvedEmailDomainHints"
          :key="domain"
          type="button"
          class="df-email-domain-chip"
          :disabled="disabled"
          @click="applyEmailDomain(domain)"
        >
          {{ domain }}
        </button>
      </div>
    </template>

    <input
      v-else-if="type === 'tel'"
      :id="inputId"
      class="df-input"
      type="tel"
      inputmode="tel"
      autocomplete="tel"
      :value="modelValue"
      :placeholder="placeholder || '(555) 555-5555'"
      :required="required"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      @input="onTelInput"
      @blur="$emit('blur')"
    />

    <input
      v-else-if="type === 'text' || type === 'date' || type === 'number'"
      :id="inputId"
      class="df-input"
      :type="type === 'text' ? 'text' : type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.target.value)"
      @blur="$emit('blur')"
    />

    <textarea
      v-else-if="type === 'textarea'"
      :id="inputId"
      class="df-textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :rows="rows"
        @input="$emit('update:modelValue', $event.target.value)"
        @blur="$emit('blur')"
      />

    <select
      v-else-if="type === 'select'"
      :id="inputId"
      class="df-select"
      :value="modelValue"
      :required="required"
      :disabled="disabled"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option value="" disabled>{{ placeholder || 'Select…' }}</option>
      <option v-for="opt in normalizedOptions" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>

    <div v-else-if="type === 'radio'" class="df-likert-options" role="radiogroup">
      <label v-for="opt in normalizedOptions" :key="opt.value">
        <input
          type="radio"
          :name="inputId"
          :value="opt.value"
          :checked="modelValue === opt.value"
          :disabled="disabled"
          @change="$emit('update:modelValue', opt.value)"
        />
        {{ opt.label }}
      </label>
    </div>

    <label v-else-if="type === 'checkbox'" class="df-checkbox-row">
      <input
        type="checkbox"
        :checked="!!modelValue"
        :disabled="disabled"
        @change="$emit('update:modelValue', $event.target.checked)"
      />
      <span>
        {{ label }}
        <span v-if="required" class="df-field-required">*</span>
        <span v-if="help" class="df-field-help" style="display:block;">{{ help }}</span>
      </span>
    </label>

    <p v-if="error" class="df-field-error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatUsPhoneInput, applyEmailDomainHint, POPULAR_EMAIL_DOMAINS } from '../../utils/contactInput.js';

const props = defineProps({
  modelValue: { type: [String, Number, Boolean, Array], default: '' },
  type: { type: String, default: 'text' },
  label: { type: String, default: '' },
  help: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  required: { type: Boolean, default: false },
  optionalBadge: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  options: { type: Array, default: () => [] },
  error: { type: String, default: '' },
  rows: { type: Number, default: 4 },
  id: { type: String, default: '' },
  /** true = popular domains, or pass custom list like ['@gmail.com'] */
  emailDomainHints: { type: [Boolean, Array], default: false },
  size: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue', 'blur']);

const resolvedEmailDomainHints = computed(() => {
  if (Array.isArray(props.emailDomainHints) && props.emailDomainHints.length) {
    return props.emailDomainHints.map((d) => (String(d).startsWith('@') ? String(d) : `@${d}`));
  }
  if (props.emailDomainHints === true) return POPULAR_EMAIL_DOMAINS;
  return [];
});

function onEmailInput(event) {
  emit('update:modelValue', event.target.value);
}

function onTelInput(event) {
  emit('update:modelValue', formatUsPhoneInput(event.target.value));
}

function applyEmailDomain(domain) {
  emit('update:modelValue', applyEmailDomainHint(props.modelValue, domain));
  emit('blur');
}

const inputId = computed(() => props.id || `df-field-${Math.random().toString(36).slice(2, 9)}`);

const normalizedOptions = computed(() =>
  (props.options || []).map((o) =>
    typeof o === 'string' || typeof o === 'number'
      ? { value: String(o), label: String(o) }
      : { value: String(o.value ?? o.id ?? ''), label: String(o.label || o.name || o.value || '') }
  )
);

const safeInfoHtml = computed(() => {
  const raw = String(props.help || props.label || props.modelValue || '');
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
});
</script>

<style scoped>
.df-checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.df-field-error {
  color: var(--df-danger);
  font-size: 0.8rem;
  margin: 0;
}

.df-email-domain-hints {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.df-email-domain-hints-label {
  font-size: 0.72rem;
  color: var(--df-muted);
  margin-right: 0.15rem;
}

.df-email-domain-chip {
  border: 1px solid color-mix(in srgb, var(--df-primary) 22%, var(--df-border));
  background: color-mix(in srgb, var(--df-secondary) 8%, #fff);
  color: var(--df-primary);
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.df-email-domain-chip:hover:not(:disabled) {
  background: color-mix(in srgb, var(--df-secondary) 16%, #fff);
  border-color: color-mix(in srgb, var(--df-primary) 40%, var(--df-border));
}

.df-email-domain-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
