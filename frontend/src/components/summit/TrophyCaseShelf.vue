<template>
  <div class="tc-wrap">
    <div v-if="loading" class="tc-loading">Loading trophies…</div>
    <div v-else-if="!trophies.length" class="tc-empty">{{ emptyText }}</div>
    <template v-else>
      <!-- Shelf display -->
      <div class="tc-shelf-outer" :class="`tc-shelf-outer--${shelfVariant}`">
        <img :src="shelfImgSrc" class="tc-bg-img" alt="" aria-hidden="true" />
        <div class="tc-grid" :class="`tc-grid--${shelfVariant}`">
          <button
            v-for="t in trophies"
            :key="t.key"
            type="button"
            class="tc-slot"
            :class="`tc-slot--${t.type}`"
            :title="t.label"
            @click="activeSlot = t"
          >
            <div class="tc-icon-ring" :class="`tc-icon-ring--${t.type}`">
              <img v-if="t.iconUrl" :src="t.iconUrl" class="tc-icon-img" :alt="t.label" />
              <span v-else-if="t.iconText" class="tc-icon-emoji">{{ t.iconText }}</span>
              <span v-else class="tc-icon-emoji" aria-hidden="true">{{ typeEmoji[t.type] || '🏆' }}</span>
              <span v-if="t.count > 1" class="tc-count-badge">×{{ t.count }}</span>
            </div>
            <div class="tc-nameplate">{{ t.label }}</div>
          </button>
        </div>
      </div>

      <!-- Detail modal -->
      <Teleport to="body">
        <transition name="tc-fade">
          <div v-if="activeSlot" class="tc-modal-backdrop" @click.self="activeSlot = null">
            <div class="tc-modal" role="dialog" :aria-label="activeSlot.label">
              <button type="button" class="tc-modal-close" @click="activeSlot = null" aria-label="Close">×</button>
              <div class="tc-modal-header">
                <div class="tc-modal-icon-wrap" :class="`tc-icon-ring--${activeSlot.type}`">
                  <img v-if="activeSlot.iconUrl" :src="activeSlot.iconUrl" class="tc-modal-icon-img" :alt="activeSlot.label" />
                  <span v-else-if="activeSlot.iconText" class="tc-modal-icon-emoji">{{ activeSlot.iconText }}</span>
                  <span v-else class="tc-modal-icon-emoji">{{ typeEmoji[activeSlot.type] || '🏆' }}</span>
                </div>
                <div class="tc-modal-header-text">
                  <h3 class="tc-modal-title">{{ activeSlot.label }}</h3>
                  <p class="tc-modal-sub">{{ detailSub(activeSlot) }}</p>
                </div>
              </div>
              <ul v-if="activeSlot.details?.length" class="tc-modal-list">
                <li v-for="(d, i) in activeSlot.details" :key="i" class="tc-modal-row">
                  <div class="tc-modal-row-main">
                    <div class="tc-modal-row-title">{{ d.title }}</div>
                    <div v-if="d.subtitle" class="tc-modal-row-sub">{{ d.subtitle }}</div>
                  </div>
                  <div class="tc-modal-row-right">
                    <span v-if="d.value" class="tc-modal-val">{{ d.value }}</span>
                    <span v-if="d.date" class="tc-modal-date">{{ d.date }}</span>
                  </div>
                </li>
              </ul>
              <div v-else class="tc-modal-empty">No additional details.</div>
            </div>
          </div>
        </transition>
      </Teleport>
    </template>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  trophies: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: 'No trophies yet — keep training!' }
});

const activeSlot = ref(null);

const typeEmoji = { award: '🏆', race: '🏅', challenge: '⚡', record: '📋' };

const shelfVariant = computed(() => {
  const n = props.trophies.length;
  if (n <= 8) return '8';
  if (n <= 16) return '16';
  return '32';
});

const shelfImgSrc = computed(() => {
  if (shelfVariant.value === '8') return '/TrophyCase8.png';
  if (shelfVariant.value === '16') return '/TrophyCase16.png';
  return '/TrophyCase32.png';
});

const detailSub = (t) => {
  if (t.type === 'award') return `Earned ${t.count}× across all seasons`;
  if (t.type === 'race') return `Completed ${t.count}×`;
  if (t.type === 'challenge') return `Completed ${t.count}×`;
  if (t.type === 'record') return 'Club record held';
  return '';
};
</script>

<style scoped>
.tc-wrap { width: 100%; }

.tc-loading,
.tc-empty {
  text-align: center;
  color: rgba(255,255,255,0.45);
  padding: 24px 12px;
  font-size: 0.9rem;
}

/* ── Shelf container ───────────────────────────────── */
.tc-shelf-outer {
  position: relative;
  width: 100%;
}

/* aspect-ratio locks the container to match each image */
.tc-shelf-outer--8  { aspect-ratio: 3 / 2; }   /* 1536 × 1024 */
.tc-shelf-outer--16 { aspect-ratio: 2 / 3; }   /* 1024 × 1536 */
.tc-shelf-outer--32 { aspect-ratio: 2 / 1; }   /* 1774 × 887  */

.tc-bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  border-radius: 12px;
}

/* ── Grid overlay ──────────────────────────────────── */
.tc-grid {
  position: absolute;
  inset: 0;
  display: grid;
  /* Tighter padding so trophies fill each shelf bay */
  padding: 10% 4% 8%;
  gap: 3% 2%;
}

.tc-grid--8  { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, 1fr); }
.tc-grid--16 { grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(4, 1fr); }
.tc-grid--32 { grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(4, 1fr); }

/* ── Individual slot ───────────────────────────────── */
.tc-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 3%;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  min-width: 0;
  transition: transform 0.18s;
}
.tc-slot:hover { transform: translateY(-8%) scale(1.05); }

/* Icon ring — larger so the art is clearly visible */
.tc-icon-ring {
  position: relative;
  width: 92%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #5a4a1e 0%, #2d2310 100%);
  border: 3px solid rgba(212,168,67,0.65);
  box-shadow:
    0 6px 20px rgba(0,0,0,0.65),
    inset 0 2px 6px rgba(255,255,255,0.10);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.tc-icon-ring--award   { border-color: rgba(212,168,67,0.85); background: radial-gradient(circle at 35% 35%, #6b5a22, #2a2008); }
.tc-icon-ring--race    { border-color: rgba(56,189,248,0.75);  background: radial-gradient(circle at 35% 35%, #1e3d5a, #0f2030); }
.tc-icon-ring--challenge { border-color: rgba(167,139,250,0.75); background: radial-gradient(circle at 35% 35%, #2d1e4a, #1a0f30); }
.tc-icon-ring--record  { border-color: rgba(248,113,113,0.7);  background: radial-gradient(circle at 35% 35%, #4a1e1e, #2a0f0f); }

.tc-icon-img {
  width: 86%;
  height: 86%;
  object-fit: contain;
  border-radius: 50%;
}
.tc-icon-emoji {
  font-size: min(5vw, 2.8rem);
  line-height: 1;
}

.tc-count-badge {
  position: absolute;
  bottom: -3%;
  right: -3%;
  background: #d4a843;
  color: #1a1200;
  font-size: min(1.6vw, 0.72rem);
  font-weight: 900;
  border-radius: 999px;
  padding: 2px 6px;
  line-height: 1.2;
  box-shadow: 0 2px 6px rgba(0,0,0,0.55);
}

/* Nameplate */
.tc-nameplate {
  font-size: min(1.5vw, 0.7rem);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  max-width: 100%;
}

/* ── Detail modal ──────────────────────────────────── */
.tc-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10,8,4,0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
  padding: 16px;
}
.tc-modal {
  background: linear-gradient(160deg, #1e1a10 0%, #2a2010 100%);
  border: 1px solid rgba(212,168,67,0.3);
  border-radius: 20px;
  padding: 28px 24px 24px;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 24px 80px rgba(0,0,0,0.6);
}
.tc-modal-close {
  position: absolute;
  top: 14px; right: 14px;
  width: 32px; height: 32px;
  border-radius: 8px;
  background: rgba(255,255,255,0.08);
  border: none;
  cursor: pointer;
  font-size: 18px;
  color: rgba(255,255,255,0.7);
  display: flex; align-items: center; justify-content: center;
}
.tc-modal-close:hover { background: rgba(255,255,255,0.15); }

.tc-modal-header {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 20px;
}
.tc-modal-icon-wrap {
  width: 64px; height: 64px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid rgba(212,168,67,0.5);
  background: radial-gradient(circle at 35% 35%, #5a4a1e, #2a2008);
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.tc-modal-icon-img { width: 44px; height: 44px; object-fit: contain; border-radius: 50%; }
.tc-modal-icon-emoji { font-size: 2rem; line-height: 1; }

.tc-modal-header-text { flex: 1; min-width: 0; }
.tc-modal-title { margin: 0 0 4px; font-size: 1.1rem; font-weight: 800; color: #f5e7b0; }
.tc-modal-sub { margin: 0; font-size: 0.83rem; color: rgba(255,255,255,0.5); }

.tc-modal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tc-modal-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255,255,255,0.06);
}
.tc-modal-row-main { flex: 1; min-width: 0; }
.tc-modal-row-title { font-size: 0.9rem; font-weight: 600; color: #fff; }
.tc-modal-row-sub { font-size: 0.78rem; color: rgba(255,255,255,0.45); margin-top: 2px; }
.tc-modal-row-right { text-align: right; flex-shrink: 0; }
.tc-modal-val { display: block; font-size: 0.9rem; font-weight: 700; color: #d4a843; }
.tc-modal-date { display: block; font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-top: 2px; }

.tc-modal-empty { text-align: center; color: rgba(255,255,255,0.35); font-size: 0.85rem; padding: 12px; }

/* Animation */
.tc-fade-enter-active, .tc-fade-leave-active { transition: opacity 0.2s ease; }
.tc-fade-enter-from, .tc-fade-leave-to { opacity: 0; }
</style>
