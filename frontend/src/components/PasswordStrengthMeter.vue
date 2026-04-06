<template>
  <div v-if="password" class="pw-meter" aria-live="polite" aria-atomic="true">
    <!-- Strength bar -->
    <div class="strength-bar" :aria-label="`Password strength: ${strengthLabel}`">
      <div
        class="strength-fill"
        :class="`strength-${strengthLevel}`"
        :style="{ width: strengthPercent + '%' }"
      ></div>
    </div>
    <p class="strength-label" :class="`label-${strengthLevel}`">{{ strengthLabel }}</p>

    <!-- Live requirements checklist -->
    <ul class="req-list" aria-label="Password requirements">
      <li :class="{ met: hasMinLength, unmet: !hasMinLength }">
        <span class="req-icon" aria-hidden="true">{{ hasMinLength ? '✓' : '○' }}</span>
        At least 6 characters
      </li>
      <li :class="{ met: hasLetter, unmet: !hasLetter }">
        <span class="req-icon" aria-hidden="true">{{ hasLetter ? '✓' : '○' }}</span>
        Contains a letter (a–z or A–Z)
      </li>
      <li :class="{ met: hasNumber }">
        <span class="req-icon" aria-hidden="true">{{ hasNumber ? '✓' : '○' }}</span>
        Contains a number <span class="optional-hint">(optional, strengthens password)</span>
      </li>
      <li :class="{ met: hasSymbol }">
        <span class="req-icon" aria-hidden="true">{{ hasSymbol ? '✓' : '○' }}</span>
        Contains a symbol <span class="optional-hint">(optional, strengthens password)</span>
      </li>
      <li v-if="isTooLong" class="unmet">
        <span class="req-icon" aria-hidden="true">✗</span>
        Too long — maximum 128 characters ({{ password.length }}/128)
      </li>
    </ul>

    <!-- Confirm-match indicator -->
    <p v-if="confirmPassword !== undefined && confirmPassword !== ''" class="confirm-status" :class="{ matched: passwordsMatch, mismatched: !passwordsMatch }">
      <span aria-hidden="true">{{ passwordsMatch ? '✓' : '✗' }}</span>
      {{ passwordsMatch ? 'Passwords match' : 'Passwords do not match' }}
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  password: { type: String, default: '' },
  confirmPassword: { type: String, default: undefined }
});

const hasMinLength = computed(() => props.password.length >= 6);
const hasLetter    = computed(() => /[a-zA-Z]/.test(props.password));
const hasNumber    = computed(() => /[0-9]/.test(props.password));
const hasSymbol    = computed(() => /[~!@#$%^&*()\-_=+[\]{\\|};:'",.<>/?]/.test(props.password));
const hasMixedCase = computed(() => /[a-z]/.test(props.password) && /[A-Z]/.test(props.password));
const isTooLong    = computed(() => props.password.length > 128);
const passwordsMatch = computed(() =>
  props.confirmPassword !== undefined && props.password === props.confirmPassword
);

/**
 * Score 0–4:
 *  0 = does not meet minimums
 *  1 = weak (meets min but short, no extras)
 *  2 = fair
 *  3 = strong
 *  4 = very strong
 */
const score = computed(() => {
  if (!hasMinLength.value || !hasLetter.value || isTooLong.value) return 0;
  const len = props.password.length;
  let s = 0;
  if (len >= 6)  s = 1;          // weak baseline
  if (len >= 10) s = 2;          // fair
  if (len >= 14 && (hasNumber.value || hasSymbol.value)) s = 3; // strong
  if (len >= 18 && hasNumber.value && (hasSymbol.value || hasMixedCase.value)) s = 4; // very strong
  return s;
});

const strengthLevel = computed(() => ['none', 'weak', 'fair', 'strong', 'vstrong'][score.value]);
const strengthLabel = computed(() => ['Does not meet requirements', 'Weak', 'Fair', 'Strong', 'Very strong'][score.value]);
const strengthPercent = computed(() => [0, 25, 50, 75, 100][score.value]);
</script>

<style scoped>
.pw-meter {
  margin-top: 8px;
  font-size: 13px;
}

/* Strength bar */
.strength-bar {
  height: 5px;
  background: #e5e7eb;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}
.strength-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease, background-color 0.3s ease;
}
.strength-none   { background: #e5e7eb; }
.strength-weak   { background: #ef4444; }
.strength-fair   { background: #f97316; }
.strength-strong { background: #84cc16; }
.strength-vstrong{ background: #22c55e; }

.strength-label {
  margin: 0 0 10px;
  font-weight: 600;
  font-size: 12px;
}
.label-none    { color: #9ca3af; }
.label-weak    { color: #ef4444; }
.label-fair    { color: #f97316; }
.label-strong  { color: #65a30d; }
.label-vstrong { color: #16a34a; }

/* Requirements list */
.req-list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.req-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #6b7280;
}
.req-list li.met   { color: #16a34a; }
.req-list li.unmet { color: #ef4444; }

.req-icon {
  font-size: 12px;
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}
.optional-hint {
  color: #9ca3af;
  font-size: 11px;
}

/* Confirm match */
.confirm-status {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
}
.confirm-status.matched    { color: #16a34a; }
.confirm-status.mismatched { color: #ef4444; }
</style>
