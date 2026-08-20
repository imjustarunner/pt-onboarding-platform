<template>
  <div class="cc-hub">
    <div class="cc-hub__main">
      <header class="cc-hub-pagehead">
        <div class="cdp-overview-toolbar" style="margin: 0;">
          <div>
            <h3 class="cc-hub-title">Overview</h3>
            <p>Care status, activity, next steps, and important updates in one place.</p>
          </div>
          <button
            v-if="canEdit"
            class="cdp-btn-soft"
            type="button"
            @click="$emit('edit')"
          >
            Edit client
          </button>
        </div>
      </header>

      <div class="cc-ribbon" aria-label="At a glance">
        <div v-for="item in glanceItems" :key="item.label" class="cc-ribbon__item">
          <span class="cc-ribbon__k">{{ item.label }}</span>
          <div class="cc-ribbon__v">{{ item.value }}</div>
        </div>
      </div>

      <div class="cc-tile-row">
        <button type="button" class="cc-tile" disabled>
          <div class="cc-tile__k">Current status</div>
          <div class="cc-tile__v">{{ statusLabel }}</div>
          <div class="cc-tile__m">{{ programLabel }}</div>
        </button>
        <button type="button" class="cc-tile" @click="$emit('navigate', 'phi')">
          <div class="cc-tile__k">Documents</div>
          <div class="cc-tile__v">{{ documentsLabel }}</div>
          <div class="cc-tile__m">Open chart documents →</div>
        </button>
        <button type="button" class="cc-tile" @click="$emit('navigate', 'assignments')">
          <div class="cc-tile__k">Care team</div>
          <div class="cc-tile__v">{{ careTeamLabel }}</div>
          <div class="cc-tile__m">{{ careTeamMeta || 'Primary clinician' }}</div>
        </button>
        <button
          v-if="canViewMedicalRecord"
          type="button"
          class="cc-tile"
          @click="$emit('navigate', 'medical-record')"
        >
          <div class="cc-tile__k">Sessions on file</div>
          <div class="cc-tile__v">{{ sessionCountLabel }}</div>
          <div class="cc-tile__m">{{ lastSessionLabel === '—' ? 'None yet' : lastSessionLabel }}</div>
        </button>
      </div>

      <div v-if="alerts.length" class="cc-attention">
        <strong>Needs attention</strong>
        <ul class="cc-attention__list">
          <li v-for="alert in alerts" :key="alert.id">
            <button type="button" @click="$emit('alert-click', alert)">
              {{ alert.label }}
            </button>
          </li>
        </ul>
      </div>

      <section>
        <h3 class="cc-hub-section__title">Care workflow</h3>
        <ClientCareTimeline
          :client-id="clientId"
          :client="client"
          title=""
          hint=""
          @view-event="$emit('view-event', $event)"
        />
      </section>

      <section>
        <h3 class="cc-hub-section__title">Document snapshot</h3>
        <div v-if="docsLoading" class="muted">Loading files…</div>
        <div v-else-if="!docRows.length" class="muted">No signed files on the chart yet.</div>
        <div v-else class="cc-docs-snap">
          <div v-for="row in docRows" :key="row.id" class="cc-docs-snap__row">
            <div>
              <strong>{{ row.title }}</strong>
              <div class="muted tiny">{{ row.kindLabel }} · {{ row.missing ? 'Not on file' : 'On file' }}</div>
            </div>
            <button
              v-if="row.viewKey"
              type="button"
              class="cdp-text-link"
              @click="$emit('open-document', row.viewKey)"
            >
              View →
            </button>
          </div>
        </div>
      </section>

      <section>
        <h3 class="cc-hub-section__title">Contacts &amp; relationships</h3>
        <div class="cdp-contacts-grid">
          <article class="cdp-contact-card">
            <div class="cdp-contact-card__role">Guardian</div>
            <div class="cdp-contact-card__name">{{ guardianName || 'No contact on file' }}</div>
            <div class="cdp-glance-meta">{{ guardianMeta || '—' }}</div>
          </article>
          <article class="cdp-contact-card">
            <div class="cdp-contact-card__role">Primary clinician</div>
            <div class="cdp-contact-card__name">{{ careTeamLabel }}</div>
            <div class="cdp-glance-meta">{{ organizationName || '—' }}</div>
          </article>
          <article class="cdp-contact-card">
            <div class="cdp-contact-card__role">Organization</div>
            <div class="cdp-contact-card__name">{{ organizationName || '—' }}</div>
            <div class="cdp-glance-meta">{{ programLabel }}</div>
          </article>
        </div>
      </section>
    </div>

    <aside class="cc-hub__aside">
      <section class="cc-side-card">
        <h4>Quick actions</h4>
        <div class="cc-side-actions">
          <button v-if="canEdit" type="button" class="cdp-btn-primary" @click="$emit('edit')">Edit client</button>
          <button type="button" class="cdp-btn-soft" @click="$emit('navigate', 'messages')">Send secure message</button>
          <button type="button" class="cdp-btn-soft" @click="$emit('navigate', 'phi')">Upload document</button>
        </div>
      </section>
      <section class="cc-side-card">
        <h4>Today</h4>
        <div class="cdp-aside-timeline">
          <div class="cdp-aside-timeline__item">
            <strong>Status</strong>
            <span>{{ statusLabel }}</span>
          </div>
          <div class="cdp-aside-timeline__item">
            <strong>Clinician</strong>
            <span>{{ careTeamLabel }}</span>
          </div>
        </div>
      </section>
      <section class="cc-side-card">
        <h4>Upcoming</h4>
        <div v-if="!alerts.length" class="cdp-glance-meta">No upcoming items flagged.</div>
        <button
          v-for="alert in alerts.slice(0, 3)"
          :key="`side-${alert.id}`"
          type="button"
          class="cdp-aside-timeline__item cdp-aside-timeline__item--btn"
          @click="$emit('alert-click', alert)"
        >
          <strong>{{ alert.label }}</strong>
        </button>
      </section>
    </aside>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import api from '../../../services/api';
import ClientCareTimeline from './ClientCareTimeline.vue';
import '../../../styles/client-hub.css';

const props = defineProps({
  clientId: { type: [Number, String], required: true },
  client: { type: Object, default: null },
  canEdit: { type: Boolean, default: false },
  canViewMedicalRecord: { type: Boolean, default: false },
  glanceItems: { type: Array, default: () => [] },
  statusLabel: { type: String, default: '' },
  programLabel: { type: String, default: '' },
  careTeamLabel: { type: String, default: '' },
  careTeamMeta: { type: String, default: '' },
  sessionCountLabel: { type: String, default: '—' },
  lastSessionLabel: { type: String, default: '—' },
  alerts: { type: Array, default: () => [] },
  guardianName: { type: String, default: '' },
  guardianMeta: { type: String, default: '' },
  organizationName: { type: String, default: '' }
});

defineEmits(['edit', 'navigate', 'alert-click', 'view-event', 'open-document']);

/** @param {string} [viewKey] — chart artifact viewKey; parent opens Documents and views it directly */

const docsLoading = ref(false);
const artifacts = ref([]);

const documentsLabel = computed(() => {
  const onFile = (artifacts.value || []).filter((a) => !a.missing && a.viewKey);
  if (!onFile.length) return 'Not on file';
  return `${onFile.length} on file`;
});

const docRows = computed(() => (artifacts.value || []).filter((a) => !a.missing).slice(0, 5));

async function loadDocs() {
  const id = Number(props.clientId || 0);
  if (!id) return;
  docsLoading.value = true;
  try {
    const resp = await api.get(`/phi-documents/clients/${id}/chart-artifacts`, { skipGlobalLoading: true });
    artifacts.value = Array.isArray(resp.data?.artifacts) ? resp.data.artifacts : [];
  } catch {
    artifacts.value = [];
  } finally {
    docsLoading.value = false;
  }
}

onMounted(loadDocs);
watch(() => props.clientId, loadDocs);
</script>
