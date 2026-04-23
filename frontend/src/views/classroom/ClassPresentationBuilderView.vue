<template>
  <div class="cpb-page" :style="themeVars">
    <div class="cpb-shell">
      <header class="cpb-hero">
        <div class="cpb-hero-brand">
          <div class="cpb-brand-mark">
            <img v-if="displayLogoUrl" :src="displayLogoUrl" :alt="`${brandName} logo`" class="cpb-brand-logo" />
            <span v-else>{{ brandInitials }}</span>
          </div>
          <div>
            <p class="cpb-eyebrow">Class Presentation Builder</p>
            <h1>{{ currentSessionTitle }}</h1>
            <p>
              Build reusable class series, then nest each live session under the series before attaching a session to a scheduled event day.
            </p>
          </div>
        </div>

        <div class="cpb-hero-actions">
          <button type="button" class="cpb-btn cpb-btn-secondary" @click="createSeries">New series</button>
          <button type="button" class="cpb-btn cpb-btn-secondary" @click="duplicateSeries">Duplicate series</button>
          <button type="button" class="cpb-btn cpb-btn-secondary" @click="createSession">New session</button>
          <button type="button" class="cpb-btn" @click="saveCurrentSession">Save session</button>
          <router-link class="cpb-btn cpb-btn-primary" :to="dashboardHref">Open live classroom</router-link>
        </div>
      </header>

      <main class="cpb-grid">
        <section class="cpb-card cpb-card-span">
          <div class="cpb-card-head">
            <div>
              <h2>Class Library</h2>
              <p>Each series can hold many sessions. Sessions later attach to a specific Program Event date.</p>
            </div>
            <div class="cpb-inline-actions">
              <button type="button" class="cpb-btn cpb-btn-secondary" :disabled="seriesLibrary.length <= 1" @click="deleteSeries">
                Delete series
              </button>
              <button type="button" class="cpb-btn cpb-btn-secondary" :disabled="!selectedSeries || selectedSeries.sessions.length <= 1" @click="deleteSession">
                Delete session
              </button>
              <button type="button" class="cpb-btn cpb-btn-secondary" :disabled="!selectedSession" @click="duplicateSession">
                Duplicate session
              </button>
            </div>
          </div>

          <div class="cpb-library-grid">
            <div class="cpb-series-column">
              <h3>Series</h3>
              <button
                v-for="series in seriesLibrary"
                :key="series.id"
                type="button"
                class="cpb-series-card"
                :class="{ active: series.id === activeSeriesId }"
                @click="selectSeries(series.id)"
              >
                <strong>{{ series.title }}</strong>
                <span>{{ series.summary || 'Reusable class series' }}</span>
                <small>{{ series.sessions.length }} session{{ series.sessions.length === 1 ? '' : 's' }}</small>
              </button>
            </div>

            <div class="cpb-session-column">
              <div class="cpb-column-head">
                <h3>Sessions in {{ selectedSeries?.title || 'series' }}</h3>
                <button type="button" class="cpb-btn" @click="createSession">Add session</button>
              </div>
              <button
                v-for="session in selectedSeries?.sessions || []"
                :key="session.id"
                type="button"
                class="cpb-session-card"
                :class="{ active: session.id === activeSessionId }"
                @click="selectSession(session.id)"
              >
                <strong>{{ session.title }}</strong>
                <span>{{ session.summary || 'No session summary yet' }}</span>
                <small>{{ session.eventLabel || 'Not attached to an event yet' }}</small>
              </button>
            </div>

            <div class="cpb-meta-column">
              <label class="cpb-field cpb-field-span">
                <span>Series title</span>
                <input v-model.trim="selectedSeries.title" type="text" />
              </label>
              <label class="cpb-field cpb-field-span">
                <span>Series summary</span>
                <textarea v-model.trim="selectedSeries.summary" rows="3"></textarea>
              </label>
              <label class="cpb-field cpb-field-span">
                <span>Session title</span>
                <input v-model.trim="selectedSession.title" type="text" />
              </label>
              <label class="cpb-field cpb-field-span">
                <span>Session summary</span>
                <textarea v-model.trim="selectedSession.summary" rows="3"></textarea>
              </label>
              <label class="cpb-field cpb-field-span">
                <span>Attached event/day note</span>
                <input v-model.trim="selectedSession.eventLabel" type="text" placeholder="Example: Week 2 live event · May 14 at 6:00 PM" />
              </label>
              <div class="cpb-preview-card">
                <div class="cpb-preview-head">
                  <strong>Session preview</strong>
                  <router-link class="cpb-preview-link" :to="dashboardHref">Open full preview</router-link>
                </div>
                <iframe class="cpb-preview-frame" :src="previewHref" title="Class presentation preview"></iframe>
              </div>
            </div>
          </div>
        </section>

        <section class="cpb-card">
          <div class="cpb-card-head">
            <div>
              <h2>Deck setup</h2>
              <p>Choose whether slides are managed internally or shown from Google Slides.</p>
            </div>
          </div>

          <div class="cpb-form-grid">
            <label class="cpb-field">
              <span>Slide source</span>
              <select v-model="plan.deckSource">
                <option value="internal">Internal stage (recommended)</option>
                <option value="google">Google Slides embed</option>
              </select>
            </label>

            <label class="cpb-field">
              <span>Default right rail</span>
              <select v-model="plan.layout.defaultRailCollapsed">
                <option :value="false">Open</option>
                <option :value="true">Collapsed</option>
              </select>
            </label>

            <label class="cpb-field">
              <span>Default engage section</span>
              <select v-model="plan.layout.defaultEngageCollapsed">
                <option :value="false">Open</option>
                <option :value="true">Collapsed</option>
              </select>
            </label>

            <label v-if="plan.deckSource === 'google'" class="cpb-field cpb-field-span">
              <span>Google Slides embed or publish URL</span>
              <input v-model.trim="plan.deckGoogleSlidesUrl" type="text" placeholder="https://docs.google.com/presentation/..." />
            </label>
          </div>

          <p class="cpb-callout">
            Recommendation: internal slides are still best for truly synchronized polls, notes, activities, and moderator workflows. Google Slides works as a bridge when a deck already exists.
          </p>
        </section>

        <section class="cpb-card">
          <div class="cpb-card-head">
            <div>
              <h2>Document Library</h2>
              <p>Upload reusable class PDFs, then map the typing regions once and reuse them across repeated runs of the same series.</p>
            </div>
          </div>

          <div class="cpb-toolbar">
            <input
              v-model.trim="libraryUploadTitle"
              class="cpb-input"
              type="text"
              maxlength="255"
              placeholder="Optional library title"
            />
            <input ref="hiddenUploadInput" type="file" accept="application/pdf" class="cpb-hidden-file" @change="onDocumentUpload" />
            <button type="button" class="cpb-btn" :disabled="libraryUploading" @click="hiddenUploadInput?.click()">
              {{ libraryUploading ? 'Uploading...' : 'Upload PDF' }}
            </button>
          </div>

          <div v-if="documentError" class="cpb-error">{{ documentError }}</div>

          <div v-if="documentLibrary.length" class="cpb-document-grid">
            <button
              v-for="doc in documentLibrary"
              :key="doc.id"
              type="button"
              class="cpb-library-item"
              :class="{ active: Number(activeDocumentId) === Number(doc.id) }"
              @click="selectDocument(doc.id)"
            >
              <strong>{{ doc.displayLabel }}</strong>
              <span>{{ doc.fieldCount }} mapped fields</span>
            </button>
          </div>
          <p v-else class="cpb-muted">No class PDFs yet. Upload one here to map typing regions and use it across future runs.</p>

          <div v-if="activeDocument && activeDocumentBlobUrl" class="cpb-field-builder-wrap">
            <div class="cpb-inline-head">
              <div>
                <strong>{{ activeDocument.displayLabel }}</strong>
                <p>Field-map this PDF here instead of during the live class.</p>
              </div>
              <button type="button" class="cpb-btn" @click="saveFieldMap">Save field map</button>
            </div>
            <PDFFieldDefinitionBuilder :pdf-url="activeDocumentBlobUrl" v-model="activeFieldDefinitions" />
          </div>

          <div class="cpb-conversion-note">
            <strong>Google Docs conversion path</strong>
            <p>Today’s practical workflow is: export the Google Doc to PDF, upload it here, then map the fields visually. A future AI assist can suggest likely answer regions, but a human still needs to review and approve the map before class.</p>
          </div>
        </section>

        <section class="cpb-card cpb-card-span">
          <div class="cpb-card-head">
            <div>
              <h2>Slides, mappings, and notes</h2>
              <p>Each session slide can carry speaker notes, a mapped document, and a poll trigger.</p>
            </div>
            <button type="button" class="cpb-btn" @click="addSlide">Add slide</button>
          </div>

          <div class="cpb-slide-list">
            <article v-for="(slide, index) in plan.slides" :key="slide.id" class="cpb-slide-card">
              <div class="cpb-slide-top">
                <div>
                  <span class="cpb-chip">Slide {{ index + 1 }}</span>
                  <input v-model.trim="slide.headline" class="cpb-slide-title" type="text" />
                </div>
                <div class="cpb-slide-actions">
                  <button type="button" class="cpb-btn cpb-btn-secondary" @click="duplicateSlide(index)">Duplicate</button>
                  <button type="button" class="cpb-btn cpb-btn-secondary" :disabled="plan.slides.length <= 1" @click="removeSlide(index)">Remove</button>
                </div>
              </div>

              <div class="cpb-form-grid cpb-form-grid-slide">
                <label class="cpb-field">
                  <span>Short title</span>
                  <input v-model.trim="slide.title" type="text" />
                </label>
                <label class="cpb-field">
                  <span>Mapped PDF</span>
                  <select v-model="slide.documentId">
                    <option :value="null">No document</option>
                    <option v-for="doc in documentLibrary" :key="`map-${slide.id}-${doc.id}`" :value="doc.id">
                      {{ doc.displayLabel }}
                    </option>
                  </select>
                </label>
                <label class="cpb-field">
                  <span>Poll</span>
                  <select v-model="slide.pollId">
                    <option value="">No poll</option>
                    <option v-for="poll in plan.polls" :key="`poll-${slide.id}-${poll.id}`" :value="poll.id">
                      {{ poll.title }}
                    </option>
                  </select>
                </label>
                <label class="cpb-field">
                  <span>Auto-open document</span>
                  <select v-model="slide.autoOpenDocument">
                    <option :value="true">Yes</option>
                    <option :value="false">No</option>
                  </select>
                </label>
                <label class="cpb-field">
                  <span>Poll trigger</span>
                  <select v-model="slide.autoLaunchPoll">
                    <option :value="true">Auto when slide opens</option>
                    <option :value="false">Host releases manually</option>
                  </select>
                </label>
                <label class="cpb-field cpb-field-span">
                  <span>Stage summary</span>
                  <textarea v-model.trim="slide.summary" rows="3"></textarea>
                </label>
                <label class="cpb-field cpb-field-span">
                  <span>Speaker notes</span>
                  <textarea v-model.trim="slide.notes" rows="4"></textarea>
                </label>
                <label v-if="plan.deckSource === 'google'" class="cpb-field cpb-field-span">
                  <span>Optional slide-specific Google Slides URL</span>
                  <input v-model.trim="slide.googleSlidesUrl" type="text" placeholder="Override deck URL for this slide if needed" />
                </label>
              </div>
            </article>
          </div>
        </section>

        <section class="cpb-card cpb-card-span">
          <div class="cpb-card-head">
            <div>
              <h2>Poll builder</h2>
              <p>Polls can be tied to slides and either auto-release or wait for the host to launch them.</p>
            </div>
            <button type="button" class="cpb-btn" @click="addPoll">Add poll</button>
          </div>

          <div class="cpb-poll-list">
            <article v-for="poll in plan.polls" :key="poll.id" class="cpb-poll-card">
              <div class="cpb-inline-head">
                <input v-model.trim="poll.title" class="cpb-slide-title" type="text" />
                <select v-model="poll.releaseMode">
                  <option value="auto">Auto-release on slide</option>
                  <option value="manual">Host releases manually</option>
                </select>
              </div>
              <label class="cpb-field cpb-field-span">
                <span>Question</span>
                <textarea v-model.trim="poll.question" rows="2"></textarea>
              </label>

              <div class="cpb-options-grid">
                <label v-for="option in poll.options" :key="option.id" class="cpb-field">
                  <span>{{ option.id }}</span>
                  <input v-model.trim="option.label" type="text" />
                </label>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import PDFFieldDefinitionBuilder from '../../components/documents/PDFFieldDefinitionBuilder.vue';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import {
  attachClassPresentationSessionToEvent,
  buildSeedSeriesLibrary,
  buildFallbackSeriesSelection,
  clonePresentationPlan,
  createClassPresentationSeries,
  createMentalHealthDemoPlan,
  createSeriesSession,
  deleteClassPresentationSeries,
  deleteSeriesSession,
  duplicateClassPresentationSeries,
  duplicateSeriesSession,
  fetchClassPresentationLibrary,
  saveClassPresentationSeries,
  saveSeriesSession
} from '../../services/classPresentationBuilder';

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

function normalizeHexColor(value, fallback = '') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const hex = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#([0-9a-f]{3})$/i.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toUpperCase();
  }
  if (/^#([0-9a-f]{6})$/i.test(hex)) return hex.toUpperCase();
  return fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex, '#000000');
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16)
  };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mixHex(first, second, weight = 0.5) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const mix = (left, right) => Math.round(left * (1 - weight) + right * weight);
  return `#${[mix(a.r, b.r), mix(a.g, b.g), mix(a.b, b.b)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const eventId = computed(() => String(route.params.eventId || route.query.eventId || 'preview'));
const numericEventId = computed(() => {
  const parsed = Number(eventId.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
});
const currentAgencyId = computed(() => Number(route.query.agencyId || agencyStore.currentAgency?.id || 0) || 0);
const hasLiveEventContext = computed(() => numericEventId.value > 0);

const seriesLibrary = ref(buildSeedSeriesLibrary());
const programOrganizationId = ref(null);
const activeSeriesId = ref(String(route.query.seriesId || seriesLibrary.value[0]?.id || ''));
const activeSessionId = ref(String(route.query.sessionId || seriesLibrary.value[0]?.sessions?.[0]?.id || ''));
const plan = ref(createMentalHealthDemoPlan(eventId.value || 'preview'));
const hiddenUploadInput = ref(null);
const libraryUploadTitle = ref('');
const libraryUploading = ref(false);
const documentLibrary = ref([]);
const activeDocumentId = ref(null);
const activeFieldDefinitions = ref([]);
const activeDocumentBlobUrl = ref('');
const documentError = ref('');
const loadingLibrary = ref(false);
const hydratingBuilder = ref(false);
const saveTimer = ref(null);
const saveInFlight = ref(false);
const saveError = ref('');

const selectedSeries = computed(() =>
  seriesLibrary.value.find((series) => series.id === activeSeriesId.value) || seriesLibrary.value[0] || null
);
const selectedSession = computed(() =>
  selectedSeries.value?.sessions.find((session) => session.id === activeSessionId.value) || selectedSeries.value?.sessions?.[0] || null
);
const currentSessionTitle = computed(() => selectedSession.value?.title || plan.value.title || 'Class Session');

const brandPrimary = computed(() => normalizeHexColor(brandingStore.primaryColor, '#62C584'));
const brandSecondary = computed(() => normalizeHexColor(brandingStore.secondaryColor, '#1A3A2D'));
const brandAccent = computed(() => normalizeHexColor(brandingStore.accentColor, brandPrimary.value));
const displayLogoUrl = computed(() => brandingStore.displayLogoUrl || brandingStore.logoUrl || '');
const brandName = computed(() => brandingStore.displayName || organizationSlug.value || 'Classroom');
const brandInitials = computed(() =>
  String(brandName.value || 'CP')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
);

const themeVars = computed(() => {
  const toneSeed = mixHex(brandPrimary.value, brandSecondary.value, 0.38);
  const background = mixHex(toneSeed, '#05070C', 0.58);
  const surface = mixHex(toneSeed, '#0B0F18', 0.46);
  const surfaceAlt = mixHex(brandPrimary.value, '#101725', 0.62);
  return {
    '--cpb-bg': background,
    '--cpb-bg-alt': mixHex(background, '#0D1420', 0.45),
    '--cpb-surface': surface,
    '--cpb-surface-alt': surfaceAlt,
    '--cpb-line': rgba(brandPrimary.value, 0.24),
    '--cpb-soft': rgba(brandPrimary.value, 0.14),
    '--cpb-soft-strong': rgba(brandAccent.value, 0.18),
    '--cpb-text': '#EDF4FF',
    '--cpb-text-soft': 'rgba(237, 244, 255, 0.76)',
    '--cpb-ink': '#08111F',
    '--cpb-brand-primary': brandPrimary.value,
    '--cpb-brand-secondary': brandSecondary.value,
    '--cpb-brand-accent': brandAccent.value,
    '--cpb-shadow': `0 24px 60px ${rgba('#020617', 0.34)}`
  };
});

const previewHref = computed(() => {
  const base = organizationSlug.value
    ? `/${organizationSlug.value}/class-presentation-dashboard/preview`
    : '/class-presentation-dashboard/preview';
  const params = new URLSearchParams({
    role: 'host',
    title: plan.value.title,
    seriesId: activeSeriesId.value,
    sessionId: activeSessionId.value,
    agencyId: String(currentAgencyId.value || ''),
    preview: '1'
  });
  return `${base}?${params.toString()}`;
});

const dashboardHref = computed(() => ({
  path: organizationSlug.value
    ? `/${organizationSlug.value}/class-presentation-dashboard/${eventId.value}`
    : `/class-presentation-dashboard/${eventId.value}`,
  query: {
    role: 'host',
    title: plan.value.title,
    agencyId: String(currentAgencyId.value || ''),
    seriesId: activeSeriesId.value,
    sessionId: activeSessionId.value
  }
}));

const documentEndpointBase = computed(() =>
  hasLiveEventContext.value
    ? `/skill-builders/events/${numericEventId.value}/program-documents`
    : programOrganizationId.value
      ? `/skill-builders/program-organizations/${programOrganizationId.value}/program-documents`
      : ''
);

const documentRequestParams = computed(() =>
  currentAgencyId.value ? { agencyId: currentAgencyId.value } : {}
);

const activeDocument = computed(() =>
  documentLibrary.value.find((doc) => Number(doc.id) === Number(activeDocumentId.value)) || null
);

function resolveSelection(library, preferredSeriesId = '', preferredSessionId = '', attachment = null) {
  const fallback = buildFallbackSeriesSelection(library);
  let nextSeriesId = String(preferredSeriesId || '');
  let nextSessionId = String(preferredSessionId || '');

  if (!nextSeriesId && !nextSessionId && attachment?.series?.id && attachment?.session?.id) {
    nextSeriesId = String(attachment.series.id);
    nextSessionId = String(attachment.session.id);
  }

  if (!nextSeriesId) nextSeriesId = String(route.query.seriesId || activeSeriesId.value || fallback.activeSeriesId || '');
  let series = library.find((item) => item.id === nextSeriesId) || library[0] || null;
  if (!series) return { nextSeriesId: '', nextSessionId: '' };

  if (!nextSessionId) {
    nextSessionId =
      String(route.query.sessionId || activeSessionId.value || '') ||
      String(attachment?.session?.id || '') ||
      String(series.sessions?.[0]?.id || '');
  }
  let session = series.sessions.find((item) => item.id === nextSessionId) || series.sessions?.[0] || null;
  if (!session && library.length) {
    series = library[0];
    session = series.sessions?.[0] || null;
  }
  return {
    nextSeriesId: String(series?.id || ''),
    nextSessionId: String(session?.id || '')
  };
}

function applyLibraryPayload(payload, preferredSeriesId = '', preferredSessionId = '') {
  seriesLibrary.value = Array.isArray(payload?.series) ? payload.series : [];
  programOrganizationId.value = payload?.programOrganizationId || null;
  const selection = resolveSelection(seriesLibrary.value, preferredSeriesId, preferredSessionId, payload?.attachment || null);
  activeSeriesId.value = selection.nextSeriesId;
  activeSessionId.value = selection.nextSessionId;

  const series = seriesLibrary.value.find((item) => item.id === activeSeriesId.value) || null;
  const session = series?.sessions.find((item) => item.id === activeSessionId.value) || series?.sessions?.[0] || null;
  plan.value = clonePresentationPlan(
    session?.plan || createMentalHealthDemoPlan(activeSessionId.value || eventId.value || 'preview')
  );
}

async function loadLibrary(preferredSeriesId = '', preferredSessionId = '') {
  if (!currentAgencyId.value) return;
  loadingLibrary.value = true;
  hydratingBuilder.value = true;
  try {
    const payload = await fetchClassPresentationLibrary({
      agencyId: currentAgencyId.value,
      eventId: hasLiveEventContext.value ? numericEventId.value : null
    });
    applyLibraryPayload(payload, preferredSeriesId, preferredSessionId);
    saveError.value = '';
    await loadDocumentLibrary();
  } catch (error) {
    saveError.value = error.response?.data?.error?.message || error.message || 'Failed to load class library';
  } finally {
    hydratingBuilder.value = false;
    loadingLibrary.value = false;
  }
}

async function saveCurrentSession({ attachEvent = true } = {}) {
  if (!currentAgencyId.value || !selectedSeries.value || !selectedSession.value || saveInFlight.value) return;
  saveInFlight.value = true;
  saveError.value = '';
  try {
    await saveClassPresentationSeries({
      agencyId: currentAgencyId.value,
      seriesId: selectedSeries.value.id,
      updates: {
        title: selectedSeries.value.title,
        summary: selectedSeries.value.summary
      }
    });

    const nextPlan = clonePresentationPlan({
      ...plan.value,
      title: selectedSession.value.title,
      templateSummary: selectedSession.value.summary
    });
    plan.value = nextPlan;

    await saveSeriesSession({
      agencyId: currentAgencyId.value,
      sessionId: selectedSession.value.id,
      updates: {
        title: selectedSession.value.title,
        summary: selectedSession.value.summary,
        eventLabel: selectedSession.value.eventLabel,
        positionIndex: selectedSession.value.positionIndex,
        plan: nextPlan
      }
    });

    if (attachEvent && hasLiveEventContext.value) {
      await attachClassPresentationSessionToEvent({
        agencyId: currentAgencyId.value,
        eventId: numericEventId.value,
        sessionId: selectedSession.value.id
      });
    }

    await loadLibrary(selectedSeries.value.id, selectedSession.value.id);
  } catch (error) {
    saveError.value = error.response?.data?.error?.message || error.message || 'Failed to save class session';
  } finally {
    saveInFlight.value = false;
  }
}

function scheduleSaveCurrentSession(delay = 700) {
  if (hydratingBuilder.value) return;
  if (saveTimer.value) window.clearTimeout(saveTimer.value);
  saveTimer.value = window.setTimeout(() => {
    saveTimer.value = null;
    saveCurrentSession();
  }, delay);
}

function selectSeries(seriesId) {
  const series = seriesLibrary.value.find((item) => item.id === String(seriesId)) || null;
  activeSeriesId.value = String(series?.id || '');
  activeSessionId.value = String(series?.sessions?.[0]?.id || '');
}

function selectSession(sessionId) {
  activeSessionId.value = String(sessionId || '');
}

async function createSeries() {
  if (!currentAgencyId.value) return;
  const payload = await createClassPresentationSeries({
    agencyId: currentAgencyId.value,
    series: {
      title: 'New Class Series',
      summary: 'A reusable class series with nested sessions.',
      sessions: [
        {
          title: 'Session 1',
          summary: 'First session in this class series.',
          eventLabel: '',
          plan: createMentalHealthDemoPlan('new-session-1')
        }
      ]
    }
  });
  const created = payload.seriesRecord || payload.series[payload.series.length - 1] || null;
  applyLibraryPayload(payload, created?.id, created?.sessions?.[0]?.id);
}

async function duplicateSeries() {
  if (!currentAgencyId.value || !activeSeriesId.value) return;
  const payload = await duplicateClassPresentationSeries({
    agencyId: currentAgencyId.value,
    seriesId: activeSeriesId.value
  });
  const duplicated = payload.seriesRecord || payload.series.find((item) => item.title.endsWith('Copy')) || payload.series[0] || null;
  applyLibraryPayload(payload, duplicated?.id, duplicated?.sessions?.[0]?.id);
}

async function deleteSeries() {
  if (!currentAgencyId.value || !activeSeriesId.value) return;
  const payload = await deleteClassPresentationSeries({
    agencyId: currentAgencyId.value,
    seriesId: activeSeriesId.value
  });
  applyLibraryPayload(payload);
}

async function createSession() {
  if (!currentAgencyId.value || !activeSeriesId.value) return;
  const nextLabel = `Session ${(selectedSeries.value?.sessions?.length || 0) + 1}`;
  const payload = await createSeriesSession({
    agencyId: currentAgencyId.value,
    seriesId: activeSeriesId.value,
    session: {
      title: nextLabel,
      summary: '',
      eventLabel: '',
      plan: createMentalHealthDemoPlan(nextLabel)
    }
  });
  applyLibraryPayload(payload, activeSeriesId.value, payload.sessionRecord?.id);
}

async function duplicateSession() {
  if (!currentAgencyId.value || !activeSessionId.value) return;
  const payload = await duplicateSeriesSession({
    agencyId: currentAgencyId.value,
    sessionId: activeSessionId.value
  });
  applyLibraryPayload(payload, payload.sessionRecord?.seriesId || activeSeriesId.value, payload.sessionRecord?.id);
}

async function deleteSession() {
  if (!currentAgencyId.value || !activeSessionId.value) return;
  const payload = await deleteSeriesSession({
    agencyId: currentAgencyId.value,
    sessionId: activeSessionId.value
  });
  applyLibraryPayload(payload, activeSeriesId.value);
}

function duplicateSlide(index) {
  const source = plan.value.slides[index];
  if (!source) return;
  const next = JSON.parse(JSON.stringify(source));
  next.id = `${source.id}-copy-${Date.now()}`;
  next.number = index + 2;
  next.title = `${source.title} Copy`;
  plan.value.slides.splice(index + 1, 0, next);
  plan.value.slides = plan.value.slides.map((slide, idx) => ({ ...slide, number: idx + 1 }));
  scheduleSaveCurrentSession();
}

function addSlide() {
  const nextNumber = plan.value.slides.length + 1;
  plan.value.slides.push({
    id: `slide-${nextNumber}-${Date.now()}`,
    number: nextNumber,
    title: `Slide ${nextNumber}`,
    headline: `Slide ${nextNumber}`,
    summary: '',
    notes: '',
    googleSlidesUrl: '',
    activityId: '',
    documentId: null,
    pollId: '',
    autoOpenDocument: true,
    autoLaunchPoll: true
  });
  scheduleSaveCurrentSession();
}

function removeSlide(index) {
  if (plan.value.slides.length <= 1) return;
  plan.value.slides.splice(index, 1);
  plan.value.slides = plan.value.slides.map((slide, idx) => ({ ...slide, number: idx + 1 }));
  scheduleSaveCurrentSession();
}

function addPoll() {
  plan.value.polls.push({
    id: `poll-${plan.value.polls.length + 1}-${Date.now()}`,
    title: `Poll ${plan.value.polls.length + 1}`,
    question: 'New class poll',
    releaseMode: 'manual',
    visibility: 'Live to class',
    options: [
      { id: 'option-1', label: 'Option 1', percent: 0 },
      { id: 'option-2', label: 'Option 2', percent: 0 }
    ]
  });
  scheduleSaveCurrentSession();
}

async function loadDocumentLibrary() {
  if (!currentAgencyId.value || !documentEndpointBase.value) {
    documentLibrary.value = [];
    activeDocumentId.value = null;
    return;
  }
  try {
    const response = await api.get(documentEndpointBase.value, {
      params: documentRequestParams.value,
      skipGlobalLoading: true
    });
    documentLibrary.value = Array.isArray(response.data?.documents) ? response.data.documents : [];
    if (!activeDocumentId.value) {
      activeDocumentId.value = documentLibrary.value[0]?.id || null;
    }
  } catch (error) {
    documentError.value = error.response?.data?.error?.message || error.message || 'Failed to load class document library';
  }
}

async function loadActiveDocumentBlob() {
  if (!activeDocument.value || !documentEndpointBase.value) return;
  try {
    const response = await api.get(`${documentEndpointBase.value}/${activeDocument.value.id}/file`, {
      params: documentRequestParams.value,
      responseType: 'blob',
      skipGlobalLoading: true
    });
    if (activeDocumentBlobUrl.value) URL.revokeObjectURL(activeDocumentBlobUrl.value);
    activeDocumentBlobUrl.value = URL.createObjectURL(response.data);
    activeFieldDefinitions.value = JSON.parse(JSON.stringify(activeDocument.value.fieldDefinitions || []));
  } catch (error) {
    documentError.value = error.response?.data?.error?.message || error.message || 'Failed to load PDF preview';
  }
}

function selectDocument(documentId) {
  activeDocumentId.value = documentId;
}

async function onDocumentUpload(event) {
  const file = event.target?.files?.[0];
  if (!file || !currentAgencyId.value || !documentEndpointBase.value) return;
  libraryUploading.value = true;
  documentError.value = '';
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('agencyId', String(currentAgencyId.value));
    if (libraryUploadTitle.value.trim()) {
      formData.append('title', libraryUploadTitle.value.trim().slice(0, 255));
    }
    if (!hasLiveEventContext.value && programOrganizationId.value) {
      formData.append('programOrganizationId', String(programOrganizationId.value));
    }
    await api.post(documentEndpointBase.value, formData, { skipGlobalLoading: true });
    libraryUploadTitle.value = '';
    await loadDocumentLibrary();
    activeDocumentId.value = documentLibrary.value[0]?.id || activeDocumentId.value;
  } catch (error) {
    documentError.value = error.response?.data?.error?.message || error.message || 'Upload failed';
  } finally {
    libraryUploading.value = false;
    if (event.target) event.target.value = '';
  }
}

async function saveFieldMap() {
  if (!activeDocument.value || !currentAgencyId.value || !documentEndpointBase.value) return;
  try {
    await api.patch(
      `${documentEndpointBase.value}/${activeDocument.value.id}`,
      {
        agencyId: currentAgencyId.value,
        fieldDefinitions: activeFieldDefinitions.value
      },
      { skipGlobalLoading: true }
    );
    await loadDocumentLibrary();
    scheduleSaveCurrentSession();
  } catch (error) {
    documentError.value = error.response?.data?.error?.message || error.message || 'Failed to save field map';
  }
}

watch(
  () => [activeSeriesId.value, activeSessionId.value],
  ([seriesId, sessionId]) => {
    const series = seriesLibrary.value.find((item) => item.id === seriesId) || seriesLibrary.value[0] || null;
    const session = series?.sessions.find((item) => item.id === sessionId) || series?.sessions?.[0] || null;
    if (!series || !session) return;
    hydratingBuilder.value = true;
    plan.value = clonePresentationPlan(session.plan || createMentalHealthDemoPlan(session.id));
    router.replace({
      query: {
        ...route.query,
        seriesId: series.id,
        sessionId: session.id
      }
    });
    hydratingBuilder.value = false;
  },
  { immediate: true }
);

watch(
  () => [selectedSeries.value?.title, selectedSeries.value?.summary, selectedSession.value?.title, selectedSession.value?.summary, selectedSession.value?.eventLabel],
  () => {
    if (selectedSeries.value && selectedSession.value) scheduleSaveCurrentSession();
  }
);

watch(
  () => [numericEventId.value, currentAgencyId.value],
  () => {
    if (currentAgencyId.value) loadLibrary();
  },
  { immediate: true }
);

watch(
  () => activeDocumentId.value,
  () => {
    loadActiveDocumentBlob();
  },
  { immediate: true }
);

watch(
  plan,
  () => {
    if (hydratingBuilder.value) return;
    if (selectedSession.value) {
      selectedSession.value.title = plan.value.title;
      selectedSession.value.summary = plan.value.templateSummary;
      scheduleSaveCurrentSession();
    }
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (saveTimer.value) {
    window.clearTimeout(saveTimer.value);
    saveTimer.value = null;
  }
  if (activeDocumentBlobUrl.value) {
    URL.revokeObjectURL(activeDocumentBlobUrl.value);
  }
});
</script>

<style scoped>
.cpb-page {
  min-height: 100vh;
  padding: 20px;
  background:
    radial-gradient(circle at top left, var(--cpb-soft), transparent 28%),
    linear-gradient(180deg, var(--cpb-bg), var(--cpb-bg-alt) 46%, #121827);
  color: var(--cpb-text);
}

.cpb-shell {
  display: grid;
  gap: 18px;
}

.cpb-hero,
.cpb-card,
.cpb-preview-card {
  border: 1px solid var(--cpb-line);
  border-radius: 22px;
  background: var(--cpb-surface);
  box-shadow: var(--cpb-shadow);
}

.cpb-hero {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 22px;
}

.cpb-hero-brand,
.cpb-hero-actions,
.cpb-toolbar,
.cpb-inline-head,
.cpb-card-head,
.cpb-inline-actions,
.cpb-slide-actions,
.cpb-preview-head,
.cpb-column-head {
  display: flex;
  gap: 12px;
  align-items: center;
}

.cpb-hero-brand {
  align-items: flex-start;
}

.cpb-brand-mark {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(135deg, var(--cpb-brand-primary), var(--cpb-brand-accent));
  color: var(--cpb-ink);
  font-weight: 800;
  flex: 0 0 auto;
}

.cpb-brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.92);
}

.cpb-eyebrow {
  margin: 0 0 8px;
  color: color-mix(in srgb, var(--cpb-brand-primary) 68%, #ffffff);
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.cpb-hero h1,
.cpb-card h2,
.cpb-column-head h3 {
  margin: 0;
}

.cpb-hero p,
.cpb-card p,
.cpb-muted {
  color: var(--cpb-text-soft);
}

.cpb-btn,
.cpb-preview-link {
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--cpb-brand-primary), var(--cpb-brand-accent));
  color: var(--cpb-ink);
  padding: 11px 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-decoration: none;
}

.cpb-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--cpb-text);
}

.cpb-btn-primary,
.cpb-preview-link {
  background: linear-gradient(135deg, var(--cpb-brand-accent), var(--cpb-brand-primary));
}

.cpb-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.cpb-card {
  padding: 18px;
  display: grid;
  gap: 16px;
}

.cpb-card-span {
  grid-column: 1 / -1;
}

.cpb-library-grid {
  display: grid;
  grid-template-columns: minmax(220px, 0.34fr) minmax(260px, 0.42fr) minmax(0, 1fr);
  gap: 16px;
}

.cpb-series-column,
.cpb-session-column,
.cpb-meta-column,
.cpb-slide-list,
.cpb-poll-list,
.cpb-field-builder-wrap {
  display: grid;
  gap: 12px;
}

.cpb-series-card,
.cpb-session-card,
.cpb-slide-card,
.cpb-poll-card,
.cpb-library-item {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: var(--cpb-surface-alt);
  color: var(--cpb-text);
  padding: 14px;
  display: grid;
  gap: 8px;
  text-align: left;
  cursor: pointer;
}

.cpb-series-card.active,
.cpb-session-card.active,
.cpb-library-item.active {
  border-color: rgba(255, 255, 255, 0.24);
  background: var(--cpb-soft-strong);
}

.cpb-preview-card {
  padding: 14px;
}

.cpb-preview-head {
  justify-content: space-between;
  margin-bottom: 12px;
}

.cpb-preview-frame {
  width: 100%;
  min-height: 520px;
  border: 0;
  border-radius: 16px;
  background: #0b1220;
}

.cpb-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.cpb-form-grid-slide,
.cpb-document-grid,
.cpb-options-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cpb-form-grid-slide {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.cpb-field,
.cpb-field span {
  display: grid;
  gap: 6px;
}

.cpb-field-span {
  grid-column: 1 / -1;
}

.cpb-input,
.cpb-field input,
.cpb-field select,
.cpb-field textarea,
.cpb-slide-title {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--cpb-text);
  padding: 10px 12px;
  font: inherit;
}

.cpb-slide-title {
  font-size: 1.05rem;
  font-weight: 700;
}

.cpb-slide-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.cpb-chip {
  display: inline-flex;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--cpb-soft);
  color: color-mix(in srgb, var(--cpb-brand-primary) 78%, #ffffff);
  font-size: 0.78rem;
  font-weight: 700;
}

.cpb-callout,
.cpb-error,
.cpb-conversion-note {
  margin: 0;
  padding: 12px 14px;
  border-radius: 14px;
}

.cpb-callout,
.cpb-conversion-note {
  background: rgba(255, 255, 255, 0.06);
}

.cpb-error {
  background: rgba(214, 91, 123, 0.14);
  color: #ffc3d1;
}

.cpb-hidden-file {
  display: none;
}

@media (max-width: 1320px) {
  .cpb-grid,
  .cpb-library-grid,
  .cpb-form-grid,
  .cpb-form-grid-slide,
  .cpb-document-grid,
  .cpb-options-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .cpb-hero,
  .cpb-card-head,
  .cpb-toolbar,
  .cpb-inline-head,
  .cpb-inline-actions,
  .cpb-column-head,
  .cpb-slide-top,
  .cpb-slide-actions,
  .cpb-hero-actions,
  .cpb-preview-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
