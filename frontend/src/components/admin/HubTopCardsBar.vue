<template>
  <div class="htcb-wrap" aria-label="Your most visited hub areas">
    <span class="htcb-label" aria-hidden="true">Your top {{ limit }}</span>
    <nav v-if="topCards.length" class="htcb-list" role="navigation" :aria-label="`Top ${topCards.length} visited hub areas`">
      <component
        :is="card.external ? 'a' : 'router-link'"
        v-for="(card, index) in topCards"
        :key="card.id"
        class="htcb-item"
        :class="`tone-${card.tone || 'slate'}`"
        v-bind="linkProps(card)"
        :title="`${card.title} — visited ${card.visitCount.toLocaleString()}×`"
      >
        <span class="htcb-rank" aria-hidden="true">{{ index + 1 }}</span>
        <span class="htcb-copy">
          <span class="htcb-title">{{ card.title }}</span>
          <span v-if="card.shortDesc" class="htcb-desc">{{ card.shortDesc }}</span>
        </span>
        <span v-if="card.count > 0" class="htcb-badge">{{ card.count }}</span>
      </component>
    </nav>
    <p v-else-if="!loading" class="htcb-empty">Open areas from the hub to build your personalized top picks.</p>
    <p v-else class="htcb-empty htcb-loading">Loading your activity…</p>
  </div>
</template>

<script setup>
import { useHubTopCards } from '../../composables/useHubTopCards.js';
import { toRef } from 'vue';

const props = defineProps({
  cards: { type: Array, default: () => [] },
  limit: { type: Number, default: 5 },
});

const cardsRef = toRef(props, 'cards');
const { topCards, loading } = useHubTopCards(cardsRef, { limit: props.limit });

function linkProps(card) {
  if (card.external) {
    return {
      href: card.to,
      target: '_blank',
      rel: 'noopener noreferrer',
    };
  }
  return { to: card.to };
}
</script>

<style scoped>
.htcb-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.htcb-label {
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}
.htcb-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.htcb-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  text-decoration: none;
  color: inherit;
  transition: background 0.12s, border-color 0.12s, transform 0.12s;
  position: relative;
}
.htcb-item:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: translateX(2px);
}
.htcb-rank {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  background: #f1f5f9;
  color: #475569;
}
.htcb-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.htcb-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
}
.htcb-desc {
  font-size: 0.68rem;
  color: #64748b;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.htcb-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 0.65rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.htcb-empty {
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
  line-height: 1.45;
}
.htcb-loading {
  font-style: italic;
}
.htcb-item.tone-cyan .htcb-rank { background: #cffafe; color: #0e7490; }
.htcb-item.tone-teal .htcb-rank { background: #ccfbf1; color: #0f766e; }
.htcb-item.tone-blue .htcb-rank { background: #dbeafe; color: #1d4ed8; }
.htcb-item.tone-orange .htcb-rank { background: #ffedd5; color: #c2410c; }
.htcb-item.tone-amber .htcb-rank { background: #fef3c7; color: #b45309; }
.htcb-item.tone-green .htcb-rank { background: #dcfce7; color: #15803d; }
.htcb-item.tone-rose .htcb-rank { background: #ffe4e6; color: #be123c; }
.htcb-item.tone-indigo .htcb-rank { background: #e0e7ff; color: #4338ca; }
</style>
