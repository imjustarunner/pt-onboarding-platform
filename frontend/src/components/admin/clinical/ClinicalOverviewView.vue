<template>
  <div class="clinical-overview">
    <p v-if="emptyCount" class="overview-incomplete-note">
      {{ emptyCount }} section{{ emptyCount === 1 ? '' : 's' }} still empty — complete onboarding forms or use Edit to fill in.
    </p>
    <div class="overview-grid">
      <section
        v-for="card in visibleCards"
        :key="card.id"
        class="overview-card"
        :class="{
          'overview-card--wide': card.id === 'additional' || card.id === 'about_me'
        }"
      >
        <div class="overview-card-head">
          <h3>{{ card.title }}</h3>
          <button
            v-if="canEdit"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="$emit('edit-section', card.editSubTab)"
          >
            Edit
          </button>
        </div>
        <div class="overview-card-body">
          <template v-if="card.displayAs === 'prose'">
            <p v-if="card.prose" class="prose-block">{{ card.prose }}</p>
            <p v-else class="empty-card">Not provided yet.</p>
          </template>
          <template v-else-if="card.displayAs === 'pills'">
            <div v-if="card.pills.length" class="pill-list">
              <span v-for="pill in card.pills" :key="pill" class="pill">{{ pill }}</span>
            </div>
            <p v-else class="empty-card">Not provided yet.</p>
          </template>
          <template v-else>
            <div v-if="card.rows.length" class="field-rows">
              <div v-for="row in card.rows" :key="row.key" class="field-row">
                <div class="field-label">{{ row.label }}</div>
                <div class="field-value">
                  <a
                    v-if="row.href"
                    :href="row.href"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="field-file-link"
                  >{{ row.display }}</a>
                  <template v-else>{{ row.display }}</template>
                </div>
              </div>
            </div>
            <p v-else class="empty-card">Not provided yet.</p>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { CLINICAL_OVERVIEW_CARDS } from '../../../constants/clinicalProfileLayout.js';
import {
  findAllFieldsByKeys,
  formatClinicalFieldValue
} from '../../../utils/clinicalFieldDisplay.js';

const props = defineProps({
  fields: { type: Array, default: () => [] },
  canEdit: { type: Boolean, default: false }
});

defineEmits(['edit-section']);

const PROSE_CARD_IDS = new Set(['about_me']);

const fieldByKey = computed(() => {
  const map = new Map();
  for (const f of props.fields || []) {
    const k = String(f?.field_key || '').trim();
    if (k && !map.has(k)) map.set(k, f);
  }
  return map;
});

const buildProse = (fields) => {
  const chunks = [];
  for (const f of fields) {
    const v = formatClinicalFieldValue(f);
    const text = Array.isArray(v) ? v.join(', ') : v;
    if (text) chunks.push(text);
  }
  return chunks.join('\n\n');
};

const cards = computed(() => {
  return CLINICAL_OVERVIEW_CARDS.map((card) => {
    const matched = findAllFieldsByKeys(fieldByKey.value, card.fieldKeys || []).filter((f) => {
      const v = formatClinicalFieldValue(f);
      return Array.isArray(v) ? v.length > 0 : !!v;
    });

    if (PROSE_CARD_IDS.has(card.id)) {
      const prose = buildProse(matched);
      return {
        ...card,
        displayAs: 'prose',
        prose,
        pills: [],
        rows: [],
        hasContent: !!prose
      };
    }

    if (card.displayAs === 'pills') {
      const pills = [];
      for (const f of matched) {
        const v = formatClinicalFieldValue(f);
        if (Array.isArray(v)) pills.push(...v);
        else if (v) pills.push(v);
      }
      const unique = [...new Set(pills)];
      return { ...card, pills: unique, rows: [], prose: '', hasContent: unique.length > 0 };
    }

    const rows = matched.map((f) => {
      const v = formatClinicalFieldValue(f);
      const display = Array.isArray(v) ? v.join(', ') : v;
      const raw = String(f?.value || '').trim();
      let href = '';
      if (f.field_type === 'file' && raw) {
        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/uploads/')) href = raw;
        else if (raw.startsWith('uploads/')) href = `/uploads/${raw.substring('uploads/'.length)}`;
        else if (raw.includes('/')) href = `/uploads/${raw.replace(/^\/+/, '')}`;
      }
      return {
        key: f.field_key,
        label: f.field_label || f.field_key,
        display: href ? (String(f.field_key || '').includes('license') ? 'View license PDF' : 'View file') : display,
        href
      };
    });
    return { ...card, pills: [], rows, prose: '', hasContent: rows.length > 0 };
  });
});

const visibleCards = computed(() => cards.value.filter((c) => c.hasContent));

const emptyCount = computed(() => cards.value.filter((c) => !c.hasContent).length);
</script>

<style scoped>
.clinical-overview {
  min-width: 0;
}
.overview-incomplete-note {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.22);
  font-size: 13px;
  color: #92400e;
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.overview-card {
  background: #fff;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
}
.overview-card--wide {
  grid-column: 1 / -1;
}
.overview-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.overview-card-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.prose-block {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  color: var(--text-primary);
}
.field-rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 3px;
}
.field-value {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}
.field-file-link {
  color: #0f766e;
  font-weight: 600;
  text-decoration: none;
}
.field-file-link:hover { text-decoration: underline; }
.pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 11px;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.22);
  font-size: 12px;
  font-weight: 600;
  color: #065f46;
}
.empty-card {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-style: italic;
}
@media (max-width: 900px) {
  .overview-grid {
    grid-template-columns: 1fr;
  }
  .overview-card--wide {
    grid-column: auto;
  }
}
</style>
