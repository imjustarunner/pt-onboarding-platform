<template>
  <div class="tutoring-calculator">
    <div class="tutoring-calculator-screen">
      <span class="tutoring-calculator-label">Quick calculator</span>
      <div class="tutoring-calculator-expression">{{ expression || '0' }}</div>
      <div class="tutoring-calculator-result">{{ resultPreview }}</div>
    </div>

    <div class="tutoring-calculator-grid">
      <button v-for="key in keys" :key="key.label" type="button" class="tutoring-calculator-key" :class="key.className" @click="pressKey(key)">
        {{ key.label }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const expression = ref('');

const keys = [
  { label: 'C', action: 'clear', className: 'utility' },
  { label: '⌫', action: 'backspace', className: 'utility' },
  { label: '(', action: 'append', value: '(', className: 'utility' },
  { label: ')', action: 'append', value: ')', className: 'utility' },
  { label: '7', action: 'append', value: '7' },
  { label: '8', action: 'append', value: '8' },
  { label: '9', action: 'append', value: '9' },
  { label: '÷', action: 'append', value: '/' , className: 'operator' },
  { label: '4', action: 'append', value: '4' },
  { label: '5', action: 'append', value: '5' },
  { label: '6', action: 'append', value: '6' },
  { label: '×', action: 'append', value: '*', className: 'operator' },
  { label: '1', action: 'append', value: '1' },
  { label: '2', action: 'append', value: '2' },
  { label: '3', action: 'append', value: '3' },
  { label: '-', action: 'append', value: '-', className: 'operator' },
  { label: '0', action: 'append', value: '0', className: 'wide' },
  { label: '.', action: 'append', value: '.' },
  { label: '=', action: 'equals', className: 'equals' },
  { label: '+', action: 'append', value: '+', className: 'operator' }
];

function evaluateExpression(raw) {
  const normalized = String(raw || '').replace(/\s+/g, '');
  if (!normalized) return '';
  if (!/^[0-9+\-*/().]+$/.test(normalized)) return 'Invalid';
  try {
    const output = Function(`"use strict"; return (${normalized})`)();
    if (typeof output !== 'number' || !Number.isFinite(output)) return 'Invalid';
    return Number(output.toFixed(6)).toString();
  } catch {
    return 'Invalid';
  }
}

const resultPreview = computed(() => {
  const result = evaluateExpression(expression.value);
  return result || 'Enter a problem';
});

function pressKey(key) {
  if (key.action === 'clear') {
    expression.value = '';
    return;
  }
  if (key.action === 'backspace') {
    expression.value = expression.value.slice(0, -1);
    return;
  }
  if (key.action === 'equals') {
    const next = evaluateExpression(expression.value);
    if (next && next !== 'Invalid') expression.value = next;
    return;
  }
  if (key.action === 'append') {
    expression.value += key.value || '';
  }
}
</script>

<style scoped>
.tutoring-calculator {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tutoring-calculator-screen {
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.tutoring-calculator-label {
  display: block;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(238, 246, 255, 0.62);
}

.tutoring-calculator-expression {
  margin-top: 10px;
  min-height: 42px;
  font-size: 1.8rem;
  font-weight: 700;
  color: #eef6ff;
  word-break: break-word;
}

.tutoring-calculator-result {
  margin-top: 6px;
  color: rgba(238, 246, 255, 0.74);
}

.tutoring-calculator-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.tutoring-calculator-key {
  border: none;
  border-radius: 16px;
  padding: 14px 12px;
  background: rgba(255, 255, 255, 0.08);
  color: #eef6ff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.tutoring-calculator-key.operator {
  background: rgba(103, 193, 138, 0.14);
  color: #cbf8da;
}

.tutoring-calculator-key.utility {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(238, 246, 255, 0.82);
}

.tutoring-calculator-key.equals {
  background: linear-gradient(135deg, #6ee7b7, #7dd3fc);
  color: #07141d;
}

.tutoring-calculator-key.wide {
  grid-column: span 2;
}
</style>
