<template>
  <div
    class="pay-compare"
    :class="[`pay-compare--${tier}`, { 'is-revealed': revealed }]"
    @mouseenter="revealed = true"
    @mouseleave="revealed = false"
    @focusin="revealed = true"
    @focusout="revealed = false"
    tabindex="0"
    role="img"
    :aria-label="ariaLabel"
  >
    <div class="pay-compare-wheel" :style="{ '--pct': wheelPct }">
      <div class="pay-compare-hole">
        <template v-if="revealed && hasAmount">
          <span class="pay-compare-amount">{{ amountLabel }}</span>
        </template>
        <template v-else>
          <span class="pay-compare-frac">{{ fracLabel }}</span>
          <span class="pay-compare-of">of avg</span>
        </template>
      </div>
    </div>
    <div class="pay-compare-meta">
      <span class="pay-compare-status">{{ statusLabel }}</span>
      <span class="pay-compare-hint">{{ hintLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  /** Last paycheck total */
  amount: { type: [Number, String], default: null },
  /** Ratio of last / average of last N (1 = average) */
  ratio: { type: Number, default: null },
  /** How many periods in the comparison window */
  sampleSize: { type: Number, default: 0 },
  average: { type: [Number, String], default: null }
});

const revealed = ref(false);

const hasAmount = computed(() => props.amount != null && props.amount !== '' && Number.isFinite(Number(props.amount)));

const ratioSafe = computed(() => {
  const r = Number(props.ratio);
  return Number.isFinite(r) && r >= 0 ? r : null;
});

/**
 * tier:
 * - gold: above average (> 1.0)
 * - green: within 90% of average (>= 0.9)
 * - amber: below average but not severe (0.7–0.9)
 * - red: significantly below (< 0.7)
 * - empty: no data
 */
const tier = computed(() => {
  const r = ratioSafe.value;
  if (r == null) return 'empty';
  if (r > 1) return 'gold';
  if (r >= 0.9) return 'green';
  if (r >= 0.7) return 'amber';
  return 'red';
});

/** Wheel fill 0–100; gold can show full ring (100). */
const wheelPct = computed(() => {
  const r = ratioSafe.value;
  if (r == null) return '0';
  const pct = Math.round(Math.min(1, r) * 100);
  return String(Math.max(0, pct));
});

const fracLabel = computed(() => {
  const r = ratioSafe.value;
  if (r == null) return '—';
  // Show as n/10 relative to average (capped display at 10+)
  const tenths = Math.round(r * 10);
  if (tenths > 10) return '10+';
  return `${Math.max(0, tenths)}/10`;
});

const amountLabel = computed(() => {
  if (!hasAmount.value) return '—';
  return Number(props.amount).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
});

const statusLabel = computed(() => {
  switch (tier.value) {
    case 'gold': return 'Above average';
    case 'green': return 'On track';
    case 'amber': return 'Below average';
    case 'red': return 'Well below average';
    default: return 'No paycheck yet';
  }
});

const hintLabel = computed(() => {
  const n = Number(props.sampleSize || 0);
  if (n <= 1) return 'Need more pay history';
  return `vs last ${n} checks`;
});

const ariaLabel = computed(() => {
  const parts = [statusLabel.value, hintLabel.value];
  if (revealed.value && hasAmount.value) parts.push(amountLabel.value);
  else if (ratioSafe.value != null) parts.push(`${fracLabel.value} of average`);
  return parts.filter(Boolean).join('. ');
});
</script>

<style scoped>
.pay-compare {
  display: flex;
  align-items: center;
  gap: 10px;
  outline: none;
  cursor: default;
  min-width: 0;
}
.pay-compare-wheel {
  --pct: 0;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(var(--wheel-color, #22c55e) calc(var(--pct) * 1%), var(--wheel-track, #e5e7eb) 0);
  transition: transform 0.15s ease;
}
.pay-compare:hover .pay-compare-wheel,
.pay-compare:focus-within .pay-compare-wheel {
  transform: scale(1.04);
}
.pay-compare-hole {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.pay-compare-frac {
  font-size: 12px;
  font-weight: 800;
  color: #111827;
  line-height: 1;
}
.pay-compare-of {
  font-size: 8px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin-top: 1px;
}
.pay-compare-amount {
  font-size: 10px;
  font-weight: 800;
  color: #111827;
  line-height: 1.1;
  text-align: center;
  padding: 0 2px;
}
.pay-compare-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.pay-compare-status {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
}
.pay-compare-hint {
  font-size: 11px;
  color: #6b7280;
}

.pay-compare--gold {
  --wheel-color: #d4a017;
  --wheel-track: #fef3c7;
}
.pay-compare--gold .pay-compare-status { color: #a16207; }
.pay-compare--gold .pay-compare-hole {
  background: linear-gradient(180deg, #fffbeb 0%, #fff 70%);
  box-shadow: inset 0 0 0 1px #fcd34d, 0 0 0 2px rgba(212, 160, 23, 0.15);
}

.pay-compare--green {
  --wheel-color: #22c55e;
  --wheel-track: #dcfce7;
}
.pay-compare--green .pay-compare-status { color: #166534; }

.pay-compare--amber {
  --wheel-color: #f59e0b;
  --wheel-track: #fef3c7;
}
.pay-compare--amber .pay-compare-status { color: #b45309; }

.pay-compare--red {
  --wheel-color: #ef4444;
  --wheel-track: #fee2e2;
}
.pay-compare--red .pay-compare-status { color: #b91c1c; }

.pay-compare--empty {
  --wheel-color: #d1d5db;
  --wheel-track: #f3f4f6;
}
.pay-compare--empty .pay-compare-status { color: #6b7280; }

[data-theme="dark"] .pay-compare-hole {
  background: #1e2126;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
[data-theme="dark"] .pay-compare--gold .pay-compare-hole {
  background: linear-gradient(180deg, #2d2000 0%, #1e2126 70%);
  box-shadow: inset 0 0 0 1px #92400e, 0 0 0 2px rgba(212, 160, 23, 0.15);
}
[data-theme="dark"] .pay-compare-frac { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .pay-compare-of { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .pay-compare-amount { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .pay-compare-status { color: var(--text-primary, #cbd5e1); }
[data-theme="dark"] .pay-compare-hint { color: var(--text-secondary, #94a3b8); }
[data-theme="dark"] .pay-compare--empty { --wheel-track: #374151; }
</style>
