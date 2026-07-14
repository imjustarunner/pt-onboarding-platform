<template>
  <div class="lbw-wheel-wrap" :class="{ compact, pulse: pulse }">
    <div class="lbw-wheel-stage">
      <svg
        class="lbw-wheel"
        :viewBox="`0 0 ${WHEEL.size} ${WHEEL.size}`"
        role="img"
        :aria-label="ariaLabel"
      >
        <defs>
          <filter id="lbw-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g class="lbw-bands" aria-hidden="true">
          <path
            v-for="cat in geometry"
            :key="'band-' + cat.key"
            :d="cat.bandPath"
            :fill="softBand(cat.color)"
            :opacity="effectiveSelected === cat.key ? 1 : 0.7"
          />
        </g>

        <g v-if="showGuideRings" class="lbw-guides" aria-hidden="true">
          <circle
            v-for="r in guideRadii"
            :key="'g' + r"
            :cx="WHEEL.centerX"
            :cy="WHEEL.centerY"
            :r="r"
            fill="none"
            stroke="rgba(15,23,42,0.06)"
            stroke-width="1"
          />
        </g>

        <g class="lbw-bg">
          <path
            v-for="cat in geometry"
            :key="'bg-' + cat.key"
            :d="cat.bgPath"
            :fill="cat.answered ? 'rgba(241,245,249,0.85)' : 'rgba(226,232,240,0.5)'"
            stroke="rgba(255,255,255,0.95)"
            stroke-width="2"
            :transform="segmentTransform(cat)"
            style="transform-box: fill-box; transform-origin: center;"
          />
        </g>

        <g class="lbw-fills">
          <path
            v-for="cat in geometry"
            v-show="cat.fillPath"
            :key="'fill-' + cat.key"
            :d="cat.fillPath"
            :fill="softFill(cat.color)"
            :opacity="effectiveSelected && effectiveSelected !== cat.key ? 0.58 : 0.95"
            class="lbw-fill"
            :class="{ animated }"
            :transform="segmentTransform(cat)"
          />
        </g>

        <g class="lbw-selected" aria-hidden="true">
          <path
            v-for="cat in geometry"
            v-show="effectiveSelected === cat.key"
            :key="'sel-' + cat.key"
            :d="cat.bgPath"
            fill="none"
            :stroke="cat.color"
            stroke-width="5.5"
            stroke-linejoin="round"
            filter="url(#lbw-glow)"
            opacity="0.95"
            :transform="segmentTransform(cat)"
          />
        </g>

        <g v-if="interactive" class="lbw-hits">
          <path
            v-for="cat in geometry"
            :key="'hit-' + cat.key"
            :d="cat.bgPath"
            fill="transparent"
            class="lbw-hit"
            tabindex="0"
            role="button"
            :aria-label="`${cat.label}${cat.score != null ? `, score ${cat.score}` : ', not rated'}`"
            @click="onSelect(cat.key)"
            @mouseenter="hoveredKey = cat.key"
            @mouseleave="hoveredKey = ''"
            @focus="hoveredKey = cat.key"
            @blur="hoveredKey = ''"
            @keydown.enter.prevent="onSelect(cat.key)"
            @keydown.space.prevent="onSelect(cat.key)"
          />
        </g>

        <!-- Icon + name + score labels -->
        <g v-if="showLabels" class="lbw-labels" aria-hidden="true">
          <g
            v-for="cat in geometry"
            :key="'lbl-' + cat.key"
            class="lbw-label-group"
            :class="{ active: effectiveSelected === cat.key }"
            @mouseenter="hoveredKey = cat.key"
            @mouseleave="hoveredKey = ''"
            @click="interactive && onSelect(cat.key)"
          >
            <image
              :href="iconUrl(cat)"
              :x="cat.labelPos.x - 14"
              :y="cat.labelPos.y - 34"
              width="28"
              height="28"
              preserveAspectRatio="xMidYMid meet"
            />
            <text
              :x="cat.labelPos.x"
              :y="cat.labelPos.y + 2"
              text-anchor="middle"
              dominant-baseline="middle"
              class="lbw-label"
              :fill="effectiveSelected === cat.key ? '#0f172a' : '#475569'"
            >
              {{ cat.shortLabel || cat.label }}
            </text>
            <text
              :x="cat.labelPos.x"
              :y="cat.labelPos.y + 20"
              text-anchor="middle"
              dominant-baseline="middle"
              class="lbw-label-score"
              :fill="cat.answered ? cat.color : '#94a3b8'"
            >
              {{ cat.answered ? cat.score : '—' }}
            </text>
          </g>
        </g>

        <circle
          :cx="WHEEL.centerX"
          :cy="WHEEL.centerY"
          :r="WHEEL.innerRadius - 4"
          fill="#fff"
          stroke="rgba(15,23,42,0.06)"
          stroke-width="2"
        />
        <text
          v-if="centerTitle"
          :x="WHEEL.centerX"
          :y="WHEEL.centerY - (centerCaption ? 22 : 10)"
          text-anchor="middle"
          class="lbw-center-title"
        >
          {{ truncate(centerTitle, 16) }}
        </text>
        <text
          :x="WHEEL.centerX"
          :y="WHEEL.centerY + (centerTitle ? 6 : -2)"
          text-anchor="middle"
          class="lbw-center-value"
          :class="{ muted: centerMuted }"
        >
          {{ centerValue }}
        </text>
        <text
          v-if="centerCaption"
          :x="WHEEL.centerX"
          :y="WHEEL.centerY + 28"
          text-anchor="middle"
          class="lbw-center-caption"
        >
          {{ centerCaption }}
        </text>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import {
  WHEEL,
  buildCategoryGeometry,
  averageScore,
  scoreToRadius,
  polarToCartesian
} from '../../utils/lifeBalanceWheelGeometry.js';
import { softenColor } from '../../utils/lifeBalanceColors.js';
import { lifeBalanceIconUrl } from '../../utils/lifeBalanceIcons.js';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  selectedCategoryId: { type: String, default: '' },
  showLabels: { type: Boolean, default: true },
  showGuideRings: { type: Boolean, default: true },
  interactive: { type: Boolean, default: true },
  animated: { type: Boolean, default: true },
  compact: { type: Boolean, default: false },
  pulse: { type: Boolean, default: false },
  centerTitle: { type: String, default: '' },
  centerValue: { type: String, default: '' },
  centerCaption: { type: String, default: '' },
  centerMuted: { type: Boolean, default: false }
});

const emit = defineEmits(['category-select', 'category-hover']);

const hoveredKey = ref('');

watch(hoveredKey, (k) => emit('category-hover', k || null));

const effectiveSelected = computed(() => hoveredKey.value || props.selectedCategoryId);

const geometry = computed(() => {
  const list = buildCategoryGeometry(props.categories);
  // Push label positions slightly outward for icon + text stack
  return list.map((cat) => {
    const labelPos = polarToCartesian(WHEEL.centerX, WHEEL.centerY, WHEEL.labelTextRadius + 8, cat.angles.mid);
    return { ...cat, labelPos };
  });
});

const guideRadii = computed(() =>
  [2, 4, 6, 8, 10].map((s) => scoreToRadius(s)).filter(Boolean)
);

const avg = computed(() => averageScore(props.categories));

const centerTitle = computed(() => props.centerTitle || '');
const centerValue = computed(() => {
  if (props.centerValue) return props.centerValue;
  return avg.value == null ? '—' : String(avg.value);
});
const centerCaption = computed(() => {
  if (props.centerCaption) return props.centerCaption;
  if (!props.centerTitle && !props.centerValue) return 'Average';
  return '';
});
const centerMuted = computed(() => props.centerMuted);

const ariaLabel = computed(() => {
  const parts = (props.categories || []).map((c) =>
    `${c.shortLabel || c.label}: ${c.score == null ? 'not rated' : c.score}`
  );
  return `Life balance wheel. ${parts.join('. ')}`;
});

function softFill(color) {
  return softenColor(color, 0.2);
}

function softBand(color) {
  return softenColor(color, 0.1);
}

function iconUrl(cat) {
  return lifeBalanceIconUrl(cat);
}

function truncate(str, n) {
  const s = String(str || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function segmentTransform(cat) {
  if (effectiveSelected.value !== cat.key) return undefined;
  const mid = cat.angles.mid;
  const rad = (mid * Math.PI) / 180;
  const dx = Math.cos(rad) * 6;
  const dy = Math.sin(rad) * 6;
  return `translate(${dx} ${dy})`;
}

function onSelect(key) {
  emit('category-select', key);
}
</script>

<style scoped>
.lbw-wheel-wrap {
  width: 100%;
  max-width: 680px;
  margin: 0 auto;
}
.lbw-wheel-wrap.compact {
  max-width: 360px;
}
.lbw-wheel-stage {
  transition: transform 350ms cubic-bezier(0.22, 1, 0.36, 1);
}
.lbw-wheel-wrap.pulse .lbw-wheel-stage {
  animation: lbw-pulse 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes lbw-pulse {
  0% { transform: scale(1); }
  45% { transform: scale(1.035); }
  100% { transform: scale(1); }
}
.lbw-wheel {
  width: 100%;
  height: auto;
  display: block;
}
.lbw-fill.animated {
  transition: d 350ms cubic-bezier(0.22, 1, 0.36, 1), opacity 250ms ease;
}
.lbw-hit {
  cursor: pointer;
  outline: none;
}
.lbw-hit:focus-visible {
  stroke: #334155;
  stroke-width: 3;
}
.lbw-label-group {
  cursor: pointer;
}
.lbw-label {
  font-size: 13px;
  font-weight: 650;
  font-family: "Avenir Next", "Segoe UI", ui-sans-serif, sans-serif;
  pointer-events: none;
}
.lbw-label-score {
  font-size: 13px;
  font-weight: 750;
  font-family: "Avenir Next", "Segoe UI", ui-sans-serif, sans-serif;
  pointer-events: none;
}
.lbw-center-title {
  font-size: 12px;
  font-weight: 650;
  fill: #64748b;
  font-family: "Avenir Next", "Segoe UI", ui-sans-serif, sans-serif;
}
.lbw-center-value {
  font-size: 30px;
  font-weight: 750;
  fill: #0f172a;
  font-family: "Avenir Next", "Segoe UI", ui-sans-serif, sans-serif;
}
.lbw-center-value.muted {
  font-size: 16px;
  font-weight: 650;
  fill: #94a3b8;
}
.lbw-center-caption {
  font-size: 11px;
  fill: #94a3b8;
  font-family: "Avenir Next", "Segoe UI", ui-sans-serif, sans-serif;
}
@media (prefers-reduced-motion: reduce) {
  .lbw-fill.animated,
  .lbw-wheel-stage {
    transition: none;
  }
  .lbw-wheel-wrap.pulse .lbw-wheel-stage {
    animation: none;
  }
}
</style>
