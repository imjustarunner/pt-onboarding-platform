<template>
  <div class="ipts-page" :style="themeVars">
    <div class="ipts-shell">
      <header class="ipts-topbar">
        <div class="ipts-brand-block">
          <div class="ipts-brand-mark">
            <img v-if="displayLogoUrl" :src="displayLogoUrl" :alt="`${brandName} logo`" class="ipts-brand-logo" />
            <span v-else>{{ brandInitials }}</span>
          </div>
          <div class="ipts-brand-copy">
            <p class="ipts-eyebrow">In-Person Tutoring</p>
            <h1>{{ payload.session?.title || 'Live tutoring session' }}</h1>
            <div class="ipts-meta-row">
              <span class="ipts-pill ipts-pill-student">{{ payload.student?.name || 'Student pending' }}</span>
              <span class="ipts-pill">{{ payload.plan.subjectArea || 'Subject not set' }}</span>
              <span class="ipts-pill">{{ payload.plan.gradeLabel || 'Level not set' }}</span>
              <span class="ipts-pill" :class="statusPillClass">{{ sessionStatusLabel }}</span>
              <span v-if="!canModerate" class="ipts-pill">Read-only review</span>
            </div>
          </div>
        </div>

        <div class="ipts-topbar-actions">
          <div class="ipts-timer">{{ sessionClock }}</div>
          <div class="ipts-quick-tools">
            <button
              v-if="whiteboardVisible"
              type="button"
              class="ipts-tool-btn"
              :class="{ active: activeTool === 'whiteboard' }"
              @click="toggleWhiteboard"
            >
              Whiteboard
            </button>
            <button type="button" class="ipts-tool-btn" :class="{ active: activeTool === 'calculator' }" @click="toggleCalculator">
              Calculator
            </button>
            <button type="button" class="ipts-tool-btn" :class="{ active: activeNav === 'notes' && activeTool !== 'whiteboard' }" @click="jumpToNotes">
              Notes
            </button>
            <button type="button" class="ipts-tool-btn" :class="{ active: activeTool === 'ai' }" @click="focusAiAssistant">
              AI assist
            </button>
            <span v-if="pdfPageLabel" class="ipts-tool-pill">{{ pdfPageLabel }}</span>
          </div>
          <button type="button" class="ipts-btn ipts-btn-secondary" @click="toggleLeftRail">
            {{ leftCollapsed ? 'Show nav' : 'Hide nav' }}
          </button>
          <button type="button" class="ipts-btn ipts-btn-secondary" @click="toggleRightRail">
            {{ rightCollapsed ? 'Show support' : 'Hide support' }}
          </button>
          <button type="button" class="ipts-btn ipts-btn-secondary" @click="toggleFocusMode">
            {{ focusMode ? 'Exit focus' : 'Focus mode' }}
          </button>
          <router-link v-if="builderHref" class="ipts-btn ipts-btn-secondary" :to="builderHref">
            Builder
          </router-link>
          <button
            v-if="payload.session?.status !== 'live' && canModerate"
            type="button"
            class="ipts-btn"
            :disabled="startingSession"
            @click="startSession"
          >
            {{ startingSession ? 'Starting…' : 'Start session' }}
          </button>
          <button v-if="canModerate" type="button" class="ipts-btn ipts-btn-danger" :disabled="endingSession" @click="endSession">
            {{ endingSession ? 'Ending…' : 'End session' }}
          </button>
        </div>
      </header>

      <div v-if="errorMessage" class="ipts-banner ipts-banner-error">{{ errorMessage }}</div>
      <div v-else-if="saveMessage" class="ipts-banner">{{ saveMessage }}</div>
      <div v-if="!canModerate" class="ipts-banner ipts-banner-muted">
        This session is open in review mode. Saved tutoring materials, notes, and completed PDFs can be viewed or downloaded here, but only tutors or staff moderators can edit them.
      </div>

      <main class="ipts-layout" :class="{ focus: focusMode, leftCollapsed, rightCollapsed }">
        <aside v-if="!leftCollapsed && !focusMode" class="ipts-left">
          <div class="ipts-card">
            <div class="ipts-card-head">
              <div>
                <h2>Session nav</h2>
                <p>Move quickly between overview, notes, and the active tutoring materials.</p>
              </div>
            </div>

            <nav class="ipts-nav">
              <button
                v-for="item in navItems"
                :key="item.id"
                type="button"
                class="ipts-nav-item"
                :class="{ active: activeNav === item.id }"
                @click="activeNav = item.id"
              >
                <span>{{ item.label }}</span>
                <small>{{ item.helper }}</small>
              </button>
            </nav>
          </div>

          <div class="ipts-card">
            <div class="ipts-card-head">
              <div>
                <h2>Goals</h2>
                <p>Keep the tutor anchored to the session targets.</p>
              </div>
            </div>
            <ul class="ipts-list">
              <li v-for="(goal, index) in payload.plan.goals" :key="`goal-${index}`">{{ goal }}</li>
              <li v-if="!payload.plan.goals.length" class="muted">No goals set yet.</li>
            </ul>
          </div>
        </aside>

        <section class="ipts-center">
          <div class="ipts-stage-toolbar">
            <div class="ipts-stage-copy">
              <h2>{{ stageHeading }}</h2>
              <p>{{ stageSubcopy }}</p>
            </div>

            <div v-if="sortedMaterials.length" class="ipts-material-chip-row">
              <button
                v-for="material in sortedMaterials"
                :key="material.id"
                type="button"
                class="ipts-material-chip"
                :class="{ active: selectedMaterialId === material.id }"
                @click="selectMaterial(material.id)"
              >
                {{ material.title }}
              </button>
            </div>
          </div>

          <article class="ipts-stage-card">
            <template v-if="activeTool === 'whiteboard'">
              <div class="ipts-doc-topline">
                <div>
                  <span class="ipts-tag">Session tool</span>
                  <h3>Scratch whiteboard</h3>
                  <p>Use this space for worked examples, sentence frames, quick diagrams, and visual thinking during tutoring.</p>
                </div>
                <div class="ipts-doc-actions">
                  <span class="ipts-save-pill">{{ whiteboardSaveStateLabel }}</span>
                  <label v-if="canModerate" class="ipts-share-toggle">
                    <input
                      :checked="payload.plan.shareWhiteboardWithGuardian"
                      type="checkbox"
                      @change="updateWhiteboardShare($event.target.checked)"
                    />
                    <span>Share in guardian portal</span>
                  </label>
                  <button
                    v-if="canModerate"
                    type="button"
                    class="ipts-btn ipts-btn-secondary"
                    :disabled="whiteboardSaveState === 'saving' || payload.session?.status === 'ended'"
                    @click="saveWhiteboardNow(true)"
                  >
                    {{ whiteboardSaveState === 'saving' ? 'Saving…' : 'Save whiteboard' }}
                  </button>
                </div>
              </div>
              <TutoringWhiteboardPanel
                v-model="whiteboardDraft"
                :disabled="!canModerate || payload.session?.status === 'ended'"
              />
            </template>

            <template v-else-if="activeNav === 'overview' || (!selectedMaterial && activeNav !== 'notes' && activeNav !== 'progress')">
              <div class="ipts-overview-grid">
                <section class="ipts-overview-panel">
                  <span class="ipts-tag">Focus area</span>
                  <h3>{{ payload.plan.focusArea || 'No focus area written yet' }}</h3>
                  <p>{{ payload.plan.tutorNotes || 'Tutor notes will appear here during the live session.' }}</p>
                </section>
                <section class="ipts-overview-panel">
                  <span class="ipts-tag">Session outline</span>
                  <ol class="ipts-outline-list">
                    <li v-for="(step, index) in payload.plan.outline" :key="`step-${index}`">{{ step }}</li>
                    <li v-if="!payload.plan.outline.length">No outline saved yet.</li>
                  </ol>
                </section>
              </div>
            </template>

            <template v-else-if="activeNav === 'notes'">
              <label class="ipts-field">
                <span>Live tutor notes</span>
                <textarea
                  v-model.trim="payload.plan.tutorNotes"
                  rows="14"
                  placeholder="Capture observations, prompts, regulation supports, and the next teaching move."
                  :disabled="!canModerate || payload.session?.status === 'ended'"
                ></textarea>
              </label>
              <div class="ipts-inline-actions">
                <button type="button" class="ipts-btn" :disabled="savingPlan || !canModerate || payload.session?.status === 'ended'" @click="saveNotes">
                  {{ savingPlan ? 'Saving…' : 'Save notes' }}
                </button>
              </div>
            </template>

            <template v-else-if="activeNav === 'progress'">
              <div class="ipts-summary-grid">
                <article class="ipts-metric-card">
                  <span>Materials attached</span>
                  <strong>{{ payload.materials.length }}</strong>
                </article>
                <article class="ipts-metric-card">
                  <span>Writable materials</span>
                  <strong>{{ responseStat.saved }}</strong>
                </article>
                <article class="ipts-metric-card">
                  <span>Fillable PDFs</span>
                  <strong>{{ responseStat.pdfCount }}</strong>
                </article>
                <article class="ipts-metric-card">
                  <span>Quick activities</span>
                  <strong>{{ responseStat.activityCount }}</strong>
                </article>
              </div>
              <div class="ipts-progress-note">
                <strong>Tutor snapshot</strong>
                <p>
                  {{ payload.plan.aiContext?.recentStrengths?.join(', ') || 'As the tutor works, the saved responses and notes here will help build the end-of-session summary.' }}
                </p>
              </div>
            </template>

            <template v-else-if="selectedMaterial && isPdfMaterial">
              <div class="ipts-doc-topline">
                <div>
                  <span class="ipts-tag">{{ prettyMaterialType(selectedMaterial.materialType) }}</span>
                  <h3>{{ selectedMaterial.title }}</h3>
                  <p>{{ selectedMaterial.description || 'The tutor can type directly into this document. Autosave is running in the background.' }}</p>
                </div>
                <div class="ipts-doc-actions">
                  <span class="ipts-save-pill">{{ saveStateLabel }}</span>
                  <a v-if="selectedMaterial.downloadUrl" class="ipts-btn ipts-btn-secondary" :href="selectedMaterial.downloadUrl" target="_blank" rel="noopener">
                    Download completed PDF
                  </a>
                </div>
              </div>
              <ClassroomFillablePdfWorkspace
                v-if="selectedMaterial.fileUrl"
                :pdf-url="selectedMaterial.fileUrl"
                :field-definitions="selectedMaterial.config.fieldDefinitions || []"
                v-model="activeResponseValues"
                :disabled="payload.session?.status === 'ended' || !canModerate"
                @loaded="handlePdfLoaded"
                @page-change="handlePdfPageChange"
              />
            </template>

            <template v-else-if="selectedMaterial && selectedMaterial.materialType === 'activity'">
              <div class="ipts-doc-topline">
                <div>
                  <span class="ipts-tag">Quick activity</span>
                  <h3>{{ selectedMaterial.title }}</h3>
                  <p>{{ selectedMaterial.config.instructions || 'Use this activity to capture student thinking and coaching notes.' }}</p>
                </div>
                <span class="ipts-save-pill">{{ saveStateLabel }}</span>
              </div>

              <div class="ipts-activity-surface">
                <template v-for="block in selectedMaterial.config.blocks" :key="block.id">
                  <section v-if="block.type === 'prompt'" class="ipts-activity-block ipts-activity-note">
                    <p>{{ block.copy }}</p>
                  </section>

                  <label v-else-if="block.type === 'shortText'" class="ipts-field">
                    <span>{{ block.label }}</span>
                    <input
                      v-model.trim="activeResponseValues[block.model || block.id]"
                      type="text"
                      :placeholder="block.placeholder || ''"
                      :disabled="!canModerate || payload.session?.status === 'ended'"
                    />
                  </label>

                  <label v-else class="ipts-field">
                    <span>{{ block.label }}</span>
                    <textarea
                      v-model.trim="activeResponseValues[block.model || block.id]"
                      rows="5"
                      :placeholder="block.placeholder || ''"
                      :disabled="!canModerate || payload.session?.status === 'ended'"
                    ></textarea>
                  </label>
                </template>
              </div>
            </template>

            <template v-else-if="selectedMaterial && (selectedMaterial.materialType === 'link' || selectedMaterial.materialType === 'video')">
              <div class="ipts-doc-topline">
                <div>
                  <span class="ipts-tag">{{ prettyMaterialType(selectedMaterial.materialType) }}</span>
                  <h3>{{ selectedMaterial.title }}</h3>
                  <p>{{ selectedMaterial.description || 'Use this linked resource as a just-in-time teaching support.' }}</p>
                </div>
                <a class="ipts-btn ipts-btn-secondary" :href="selectedMaterial.externalUrl" target="_blank" rel="noopener">Open resource</a>
              </div>
              <iframe v-if="selectedMaterial.externalUrl" class="ipts-resource-frame" :src="selectedMaterial.externalUrl" title="Resource preview"></iframe>
            </template>

            <template v-else>
              <div class="ipts-empty">
                <div class="ipts-empty-icon">🧠</div>
                <h3>No active tutoring material</h3>
                <p>Open the builder to attach a worksheet, activity, link, or student document for the tutor to use live.</p>
              </div>
            </template>
          </article>
        </section>

        <aside v-if="!rightCollapsed && !focusMode" class="ipts-right">
          <section v-if="activeTool === 'calculator'" class="ipts-card ipts-card-highlight">
            <div class="ipts-card-head">
              <div>
                <h2>Calculator</h2>
                <p>Keep quick computation inside the tutoring flow while you model or check a problem.</p>
              </div>
            </div>

            <TutoringCalculatorPanel />
          </section>

          <section class="ipts-card" :class="{ 'ipts-card-highlight': activeTool === 'ai' }">
            <div class="ipts-card-head">
              <div>
                <h2>AI tutor assistant</h2>
                <p>Ask for an explanation, example, or differentiated next move without leaving the session.</p>
              </div>
            </div>

            <div class="ipts-ai-chips">
              <button type="button" class="ipts-chip" @click="runAiQuickAction('Explain this concept another way for this student.')">Explain concept</button>
              <button type="button" class="ipts-chip" @click="runAiQuickAction('Give one concrete example and one scaffolded prompt.')">Provide example</button>
              <button type="button" class="ipts-chip" @click="runAiQuickAction('Differentiate the current task for a student who needs more support.')">Differentiate</button>
              <button type="button" class="ipts-chip" @click="runAiQuickAction('Generate one more quick practice problem for this tutoring session.')">Generate practice</button>
            </div>

            <div class="ipts-ai-output">
              <p v-if="aiReply">{{ aiReply }}</p>
              <p v-else class="muted">AI suggestions will show up here.</p>
            </div>
          </section>

          <section class="ipts-card">
            <div class="ipts-card-head">
              <div>
                <h2>Materials</h2>
                <p>Switch the live workspace without losing the current response draft.</p>
              </div>
            </div>

            <div class="ipts-material-list">
              <button
                v-for="material in sortedMaterials"
                :key="material.id"
                type="button"
                class="ipts-material-card"
                :class="{ active: selectedMaterialId === material.id }"
                @click="selectMaterial(material.id)"
              >
                <div>
                  <strong>{{ material.title }}</strong>
                  <span>{{ prettyMaterialType(material.materialType) }}</span>
                </div>
                <small>{{ material.description || 'Ready for live tutoring' }}</small>
              </button>
            </div>
          </section>

          <section class="ipts-card">
            <div class="ipts-card-head">
              <div>
                <h2>Session summary</h2>
                <p>Live summary cards update as the tutor works through notes and materials.</p>
              </div>
            </div>

            <div class="ipts-summary-stack">
              <article class="ipts-summary-card">
                <span>Understanding estimate</span>
                <strong>{{ summaryUnderstanding }}</strong>
              </article>
              <article class="ipts-summary-card">
                <span>Capture-ready materials</span>
                <strong>{{ responseStat.saved }} available</strong>
              </article>
              <article class="ipts-summary-card">
                <span>Next move reminder</span>
                <strong>{{ payload.plan.outline?.[0] || 'Open the overview or notes rail to add tutoring structure.' }}</strong>
              </article>
            </div>

            <div class="ipts-trend-strip">
              <div v-for="point in summaryTrendPoints" :key="point.label" class="ipts-trend-bar">
                <span>{{ point.label }}</span>
                <div class="ipts-trend-track">
                  <div class="ipts-trend-fill" :style="{ width: `${point.percent}%` }"></div>
                </div>
                <strong>{{ point.value }}</strong>
              </div>
            </div>
          </section>

          <section v-if="canModerate" class="ipts-card">
            <div class="ipts-card-head">
              <div>
                <h2>Quick add</h2>
                <p>Need to adjust the plan mid-session? Jump back to the prep builder without losing your place.</p>
              </div>
            </div>

            <div class="ipts-quick-add-grid">
              <router-link v-if="builderHref" class="ipts-btn ipts-btn-secondary" :to="builderHref">Add document</router-link>
              <router-link v-if="builderHref" class="ipts-btn ipts-btn-secondary" :to="builderHref">Add activity</router-link>
              <router-link v-if="builderHref" class="ipts-btn ipts-btn-secondary" :to="builderHref">Add from library</router-link>
            </div>
          </section>
        </aside>
      </main>

      <footer class="ipts-bottom-bar">
        <div class="ipts-bottom-left">
          <button type="button" class="ipts-chip" @click="runAiQuickAction('Give me a short confidence-building script for the student.')">Confidence script</button>
          <button type="button" class="ipts-chip" @click="runAiQuickAction('Suggest one regulation support for this student right now.')">Regulation support</button>
        </div>

        <div class="ipts-bottom-composer">
          <input
            v-model.trim="aiPrompt"
            type="text"
            placeholder="Ask the in-person tutoring assistant for a next move, example, or short practice item."
            @keyup.enter="submitAiPrompt"
          />
          <button type="button" class="ipts-btn" :disabled="aiLoading || !aiPrompt" @click="submitAiPrompt">
            {{ aiLoading ? 'Thinking…' : 'Ask AI' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ClassroomFillablePdfWorkspace from '../../components/classroom/ClassroomFillablePdfWorkspace.vue';
import TutoringCalculatorPanel from '../../components/tutoring/TutoringCalculatorPanel.vue';
import TutoringWhiteboardPanel from '../../components/tutoring/TutoringWhiteboardPanel.vue';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import {
  askInPersonAi,
  createDemoInPersonPayload,
  endInPersonSession,
  fetchInPersonMaterialResponse,
  fetchInPersonPlan,
  saveInPersonMaterialResponse,
  saveInPersonPlan,
  startInPersonSession
} from '../../services/inPersonTutoring';

const route = useRoute();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

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

const sessionId = computed(() => String(route.params.sessionId || '').trim());
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());

const payload = ref(createDemoInPersonPayload('live-demo'));
const loading = ref(false);
const errorMessage = ref('');
const saveMessage = ref('');
const selectedMaterialId = ref(null);
const activeNav = ref('overview');
const activeTool = ref('');
const leftCollapsed = ref(false);
const rightCollapsed = ref(false);
const focusMode = ref(false);
const aiPrompt = ref('');
const aiReply = ref('');
const aiLoading = ref(false);
const startingSession = ref(false);
const endingSession = ref(false);
const savingPlan = ref(false);
const saveState = ref('saved');
const whiteboardSaveState = ref('saved');
const activeResponseValues = ref({});
const responseClientId = ref(null);
const autosaveTimer = ref(null);
const whiteboardAutosaveTimer = ref(null);
const sessionTick = ref(Date.now());
const hydratingResponse = ref(false);
const pdfPageState = ref({ currentPage: 1, totalPages: 0 });
const whiteboardDraft = ref([]);
const hydratingWhiteboard = ref(false);
const lastSavedWhiteboardSignature = ref('[]');

const brandPrimary = computed(() => normalizeHexColor(brandingStore.primaryColor, '#67C18A'));
const brandSecondary = computed(() => normalizeHexColor(brandingStore.secondaryColor, '#183A2C'));
const brandAccent = computed(() => normalizeHexColor(brandingStore.accentColor, '#B3FFD0'));
const displayLogoUrl = computed(() => brandingStore.displayLogoUrl || brandingStore.logoUrl || '');
const brandName = computed(() => brandingStore.displayName || agencyStore.currentAgency?.name || organizationSlug.value || 'Tutoring');
const brandInitials = computed(() =>
  String(brandName.value || 'IT')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
);

const themeVars = computed(() => {
  const toneSeed = mixHex(brandPrimary.value, brandSecondary.value, 0.34);
  const background = mixHex(toneSeed, '#05080F', 0.58);
  const surface = mixHex(toneSeed, '#111826', 0.48);
  const surfaceAlt = mixHex(brandPrimary.value, '#0E1726', 0.68);
  return {
    '--ipts-bg': background,
    '--ipts-bg-alt': mixHex(background, '#10192B', 0.38),
    '--ipts-surface': surface,
    '--ipts-surface-alt': surfaceAlt,
    '--ipts-line': rgba(brandPrimary.value, 0.2),
    '--ipts-soft': rgba(brandPrimary.value, 0.1),
    '--ipts-text': '#EEF6FF',
    '--ipts-text-soft': 'rgba(238, 246, 255, 0.76)',
    '--ipts-brand-primary': brandPrimary.value,
    '--ipts-brand-secondary': brandSecondary.value,
    '--ipts-brand-accent': brandAccent.value,
    '--ipts-shadow': `0 24px 56px ${rgba('#020617', 0.34)}`
  };
});

const navItems = [
  { id: 'overview', label: 'Overview', helper: 'Session focus and outline' },
  { id: 'documents', label: 'Documents', helper: 'Worksheets and PDFs' },
  { id: 'activities', label: 'Activities', helper: 'Quick practice' },
  { id: 'practice', label: 'Practice', helper: 'Links and videos' },
  { id: 'progress', label: 'Progress', helper: 'Completion and summary cards' },
  { id: 'notes', label: 'Notes', helper: 'Live tutor notes' }
];

const sortedMaterials = computed(() =>
  [...(payload.value.materials || [])].sort((left, right) => left.positionIndex - right.positionIndex || String(left.title).localeCompare(String(right.title)))
);
const canModerate = computed(() => payload.value.canModerate !== false);
const hasWhiteboardStrokes = computed(() => Array.isArray(payload.value.plan.whiteboardData?.strokes) && payload.value.plan.whiteboardData.strokes.length > 0);
const whiteboardVisible = computed(() => canModerate.value || (payload.value.plan.shareWhiteboardWithGuardian && hasWhiteboardStrokes.value));

const selectedMaterial = computed(() =>
  sortedMaterials.value.find((material) => material.id === selectedMaterialId.value) || null
);

const isPdfMaterial = computed(() =>
  ['document_template', 'session_pdf', 'user_document'].includes(selectedMaterial.value?.materialType)
);
const pdfPageLabel = computed(() =>
  isPdfMaterial.value && pdfPageState.value.totalPages
    ? `Page ${pdfPageState.value.currentPage} / ${pdfPageState.value.totalPages}`
    : ''
);

const builderHref = computed(() => ({
  path: organizationSlug.value
    ? `/${organizationSlug.value}/in-person-tutoring-builder/${sessionId.value}`
    : `/in-person-tutoring-builder/${sessionId.value}`
}));

const stageHeading = computed(() => {
  if (activeTool.value === 'whiteboard') return 'Scratch whiteboard';
  if (activeNav.value === 'notes') return 'Live tutor notes';
  if (activeNav.value === 'progress') return 'Session progress';
  if (selectedMaterial.value) return selectedMaterial.value.title;
  return 'Tutoring overview';
});

const stageSubcopy = computed(() => {
  if (activeTool.value === 'whiteboard') return 'Sketch a worked example, create a quick visual support, or model a strategy in real time.';
  if (activeNav.value === 'notes') return 'Capture observations, responses, and next steps while tutoring.';
  if (activeNav.value === 'progress') return 'Use these cards to keep the session paced and grounded in evidence.';
  if (selectedMaterial.value) return selectedMaterial.value.description || 'This is the active teaching surface for the tutoring session.';
  return 'No material is open, so the center stage is showing the session summary.';
});

const responseStat = computed(() => ({
  saved: sortedMaterials.value.filter((material) => ['document_template', 'session_pdf', 'user_document', 'activity'].includes(material.materialType)).length,
  pdfCount: sortedMaterials.value.filter((material) => ['document_template', 'session_pdf', 'user_document'].includes(material.materialType)).length,
  activityCount: sortedMaterials.value.filter((material) => material.materialType === 'activity').length
}));

const summaryUnderstanding = computed(() => {
  if (payload.value.plan.aiContext?.watchFors?.length) return 'Needs targeted scaffolds';
  if (payload.value.plan.goals?.length) return 'On track for guided practice';
  return 'Building baseline';
});

const saveStateLabel = computed(() => ({
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed',
  idle: 'Ready'
}[saveState.value] || 'Ready'));
const whiteboardSaveStateLabel = computed(() => ({
  saving: 'Saving whiteboard…',
  saved: payload.value.plan.shareWhiteboardWithGuardian ? 'Whiteboard saved and shared' : 'Whiteboard saved privately',
  error: 'Whiteboard save failed',
  idle: 'Whiteboard ready'
}[whiteboardSaveState.value] || 'Whiteboard ready'));
const sessionStatusLabel = computed(() => {
  const raw = String(payload.value.session?.status || 'scheduled').toLowerCase();
  if (raw === 'live') return 'Live now';
  if (raw === 'ended') return 'Session ended';
  return 'Scheduled';
});
const statusPillClass = computed(() => ({
  'ipts-pill-live': sessionStatusLabel.value === 'Live now',
  'ipts-pill-ended': sessionStatusLabel.value === 'Session ended'
}));
const summaryTrendPoints = computed(() => {
  const materialCount = payload.value.materials.length || 0;
  const goalCount = payload.value.plan.goals?.length || 0;
  const outlineCount = payload.value.plan.outline?.length || 0;
  const understandingValue = payload.value.plan.aiContext?.watchFors?.length ? 58 : payload.value.plan.goals?.length ? 78 : 42;
  return [
    {
      label: 'Materials',
      percent: Math.min(100, materialCount * 25),
      value: `${materialCount} attached`
    },
    {
      label: 'Goals',
      percent: Math.min(100, goalCount * 25),
      value: `${goalCount} planned`
    },
    {
      label: 'Sequence',
      percent: Math.min(100, outlineCount * 20),
      value: `${outlineCount} steps`
    },
    {
      label: 'Understanding',
      percent: understandingValue,
      value: summaryUnderstanding.value
    }
  ];
});

const sessionClock = computed(() => {
  const base = payload.value.session?.starts_at || payload.value.session?.startsAt || Date.now();
  const stopAt = payload.value.session?.ends_at || payload.value.session?.endsAt || null;
  const startedAt = new Date(base).getTime();
  const endedAt = stopAt ? new Date(stopAt).getTime() : null;
  const clockEnd = Number.isFinite(endedAt) ? endedAt : sessionTick.value;
  const elapsed = Math.max(0, Math.floor((clockEnd - startedAt) / 1000));
  const hours = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
});

let clockInterval = null;

function prettyMaterialType(type) {
  return {
    document_template: 'Library PDF',
    session_pdf: 'Session PDF',
    user_document: 'Student PDF',
    activity: 'Quick activity',
    link: 'Link',
    video: 'Video'
  }[type] || 'Material';
}

function whiteboardSignature(strokes = []) {
  return JSON.stringify(Array.isArray(strokes) ? strokes : []);
}

function hydrateWhiteboardFromPlan() {
  hydratingWhiteboard.value = true;
  const strokes = cloneJson(payload.value.plan.whiteboardData?.strokes || []) || [];
  whiteboardDraft.value = strokes;
  lastSavedWhiteboardSignature.value = whiteboardSignature(strokes);
  whiteboardSaveState.value = 'saved';
  hydratingWhiteboard.value = false;
}

function selectMaterial(materialId) {
  activeTool.value = '';
  selectedMaterialId.value = materialId;
  const material = sortedMaterials.value.find((item) => item.id === materialId);
  if (!material) return;
  if (material.materialType === 'activity') activeNav.value = 'activities';
  else if (material.materialType === 'link' || material.materialType === 'video') activeNav.value = 'practice';
  else activeNav.value = 'documents';
}

function ensureMaterialForNav(navId) {
  if (navId === 'overview' || navId === 'notes' || navId === 'progress') return;
  const matcher = navId === 'activities'
    ? (material) => material.materialType === 'activity'
    : navId === 'practice'
      ? (material) => material.materialType === 'link' || material.materialType === 'video'
      : (material) => ['document_template', 'session_pdf', 'user_document'].includes(material.materialType);
  const nextMaterial = sortedMaterials.value.find(matcher);
  if (nextMaterial) selectedMaterialId.value = nextMaterial.id;
}

async function loadPayload() {
  if (!sessionId.value) {
    payload.value = createDemoInPersonPayload('live-demo');
    selectedMaterialId.value = sortedMaterials.value[0]?.id || null;
    pdfPageState.value = { currentPage: 1, totalPages: 0 };
    hydrateWhiteboardFromPlan();
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    payload.value = await fetchInPersonPlan(sessionId.value);
    leftCollapsed.value = !!payload.value.plan.layoutPrefs.leftCollapsed;
    rightCollapsed.value = !!payload.value.plan.layoutPrefs.rightCollapsed;
    focusMode.value = !!payload.value.plan.layoutPrefs.focusMode;
    activeNav.value = payload.value.plan.layoutPrefs.activeNav || 'overview';
    selectedMaterialId.value = sortedMaterials.value[0]?.id || null;
    activeTool.value = '';
    pdfPageState.value = { currentPage: 1, totalPages: 0 };
    hydrateWhiteboardFromPlan();
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not load the in-person tutoring session.';
  } finally {
    loading.value = false;
  }
}

async function startSession() {
  if (!sessionId.value || !canModerate.value) return;
  startingSession.value = true;
  try {
    const session = await startInPersonSession(sessionId.value);
    if (session) payload.value.session = session;
    saveMessage.value = 'In-person tutoring session started.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not start the tutoring session.';
  } finally {
    startingSession.value = false;
  }
}

async function endSession() {
  if (!sessionId.value || !canModerate.value) return;
  endingSession.value = true;
  try {
    const result = await endInPersonSession(sessionId.value);
    if (result?.session) payload.value.session = result.session;
    saveMessage.value = result?.message || 'Tutoring session ended.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not end the tutoring session.';
  } finally {
    endingSession.value = false;
  }
}

async function loadActiveResponse() {
  hydratingResponse.value = true;
  if (!sessionId.value || !selectedMaterial.value || !payload.value.student?.clientId) {
    activeResponseValues.value = {};
    responseClientId.value = payload.value.student?.clientId || null;
    hydratingResponse.value = false;
    return;
  }
  if (!['document_template', 'session_pdf', 'user_document', 'activity'].includes(selectedMaterial.value.materialType)) {
    activeResponseValues.value = {};
    responseClientId.value = payload.value.student?.clientId || null;
    hydratingResponse.value = false;
    return;
  }
  try {
    const result = await fetchInPersonMaterialResponse(sessionId.value, selectedMaterial.value.id, payload.value.student.clientId);
    responseClientId.value = result.clientId;
    activeResponseValues.value = { ...(result.response?.fieldValues || {}) };
    saveState.value = 'saved';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not load the saved tutoring response.';
    activeResponseValues.value = {};
    saveState.value = 'error';
  } finally {
    hydratingResponse.value = false;
  }
}

async function flushResponse(status = 'draft') {
  if (!sessionId.value || !selectedMaterial.value || !responseClientId.value || !canModerate.value) return;
  if (!['document_template', 'session_pdf', 'user_document', 'activity'].includes(selectedMaterial.value.materialType)) return;
  saveState.value = 'saving';
  try {
    await saveInPersonMaterialResponse(sessionId.value, selectedMaterial.value.id, {
      clientId: responseClientId.value,
      responseValues: activeResponseValues.value,
      status
    });
    saveState.value = 'saved';
  } catch (error) {
    saveState.value = 'error';
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Autosave failed for the active tutoring material.';
  }
}

function scheduleAutosave() {
  if (!canModerate.value) return;
  if (autosaveTimer.value) clearTimeout(autosaveTimer.value);
  saveState.value = 'saving';
  autosaveTimer.value = setTimeout(() => {
    flushResponse('draft');
  }, 900);
}

async function saveNotes() {
  if (!sessionId.value || !canModerate.value) return;
  savingPlan.value = true;
  try {
    payload.value.plan.whiteboardData = {
      strokes: cloneJson(whiteboardDraft.value) || []
    };
    payload.value = await saveInPersonPlan(sessionId.value, payload.value.plan);
    hydrateWhiteboardFromPlan();
    saveMessage.value = 'Tutor notes saved.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not save tutor notes.';
  } finally {
    savingPlan.value = false;
  }
}

function scheduleWhiteboardAutosave() {
  if (!canModerate.value || payload.value.session?.status === 'ended') return;
  if (whiteboardAutosaveTimer.value) clearTimeout(whiteboardAutosaveTimer.value);
  whiteboardSaveState.value = 'saving';
  whiteboardAutosaveTimer.value = setTimeout(() => {
    saveWhiteboardNow(false);
  }, 1200);
}

async function saveWhiteboardNow(showToast = false) {
  if (!sessionId.value || !canModerate.value) return;
  if (whiteboardAutosaveTimer.value) clearTimeout(whiteboardAutosaveTimer.value);
  const nextWhiteboard = { strokes: cloneJson(whiteboardDraft.value) || [] };
  whiteboardSaveState.value = 'saving';
  try {
    const result = await saveInPersonPlan(sessionId.value, {
      whiteboardData: nextWhiteboard,
      shareWhiteboardWithGuardian: payload.value.plan.shareWhiteboardWithGuardian
    });
    payload.value.plan.whiteboardData = cloneJson(result.plan?.whiteboardData || nextWhiteboard) || { strokes: [] };
    payload.value.plan.shareWhiteboardWithGuardian = !!(result.plan?.shareWhiteboardWithGuardian ?? payload.value.plan.shareWhiteboardWithGuardian);
    const savedStrokes = cloneJson(payload.value.plan.whiteboardData?.strokes || []) || [];
    whiteboardDraft.value = savedStrokes;
    lastSavedWhiteboardSignature.value = whiteboardSignature(savedStrokes);
    whiteboardSaveState.value = 'saved';
    if (!whiteboardVisible.value && activeTool.value === 'whiteboard') activeTool.value = '';
    if (showToast) {
      saveMessage.value = payload.value.plan.shareWhiteboardWithGuardian
        ? 'Whiteboard saved and shared to the guardian portal.'
        : 'Whiteboard saved.';
    }
  } catch (error) {
    whiteboardSaveState.value = 'error';
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not save the whiteboard.';
  }
}

function updateWhiteboardShare(checked) {
  payload.value.plan.shareWhiteboardWithGuardian = !!checked;
  saveWhiteboardNow(true);
}

async function submitAiPrompt() {
  if (!aiPrompt.value || !sessionId.value) return;
  aiLoading.value = true;
  try {
    const result = await askInPersonAi(sessionId.value, { prompt: aiPrompt.value, history: [] });
    aiReply.value = result.assistantText || 'No AI response returned.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not reach the tutoring assistant.';
  } finally {
    aiLoading.value = false;
  }
}

function runAiQuickAction(prompt) {
  focusAiAssistant();
  aiPrompt.value = prompt;
  submitAiPrompt();
}

function toggleWhiteboard() {
  if (!whiteboardVisible.value) return;
  activeTool.value = activeTool.value === 'whiteboard' ? '' : 'whiteboard';
  if (activeTool.value === 'whiteboard') {
    focusMode.value = false;
  }
}

function toggleCalculator() {
  const nextTool = activeTool.value === 'calculator' ? '' : 'calculator';
  activeTool.value = nextTool;
  if (nextTool === 'calculator') {
    rightCollapsed.value = false;
    focusMode.value = false;
  }
}

function jumpToNotes() {
  activeTool.value = '';
  activeNav.value = 'notes';
  leftCollapsed.value = false;
  focusMode.value = false;
}

function focusAiAssistant() {
  activeTool.value = 'ai';
  rightCollapsed.value = false;
  focusMode.value = false;
}

function handlePdfPageChange({ currentPage = 1, totalPages = 0 } = {}) {
  pdfPageState.value = {
    currentPage: Number(currentPage) || 1,
    totalPages: Number(totalPages) || 0
  };
}

function handlePdfLoaded({ totalPages = 0 } = {}) {
  pdfPageState.value = {
    currentPage: 1,
    totalPages: Number(totalPages) || 0
  };
}

function toggleLeftRail() {
  leftCollapsed.value = !leftCollapsed.value;
}

function toggleRightRail() {
  rightCollapsed.value = !rightCollapsed.value;
}

function toggleFocusMode() {
  focusMode.value = !focusMode.value;
}

watch(
  () => sessionId.value,
  () => {
    loadPayload();
  },
  { immediate: true }
);

watch(
  () => [selectedMaterialId.value, payload.value.student?.clientId],
  () => {
    pdfPageState.value = { currentPage: 1, totalPages: 0 };
    loadActiveResponse();
  }
);

watch(
  () => activeNav.value,
  (next) => {
    if (next !== 'overview' && activeTool.value === 'whiteboard') {
      activeTool.value = '';
    }
    ensureMaterialForNav(next);
  }
);

watch(
  () => activeResponseValues.value,
  () => {
    if (hydratingResponse.value) return;
    if (!selectedMaterial.value) return;
    if (!canModerate.value) return;
    if (!['document_template', 'session_pdf', 'user_document', 'activity'].includes(selectedMaterial.value.materialType)) return;
    scheduleAutosave();
  },
  { deep: true }
);

watch(
  () => whiteboardDraft.value,
  () => {
    if (hydratingWhiteboard.value) return;
    if (!canModerate.value) return;
    const nextSignature = whiteboardSignature(whiteboardDraft.value);
    if (nextSignature === lastSavedWhiteboardSignature.value) return;
    scheduleWhiteboardAutosave();
  },
  { deep: true }
);

clockInterval = setInterval(() => {
  sessionTick.value = Date.now();
}, 1000);

onBeforeUnmount(() => {
  if (clockInterval) clearInterval(clockInterval);
  if (autosaveTimer.value) clearTimeout(autosaveTimer.value);
  if (whiteboardAutosaveTimer.value) clearTimeout(whiteboardAutosaveTimer.value);
});
</script>

<style scoped>
.ipts-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.06), transparent 26%),
    linear-gradient(180deg, var(--ipts-bg), var(--ipts-bg-alt));
  color: var(--ipts-text);
  padding: 18px;
}

.ipts-shell {
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ipts-topbar,
.ipts-card,
.ipts-stage-card,
.ipts-bottom-bar {
  background: var(--ipts-surface);
  border: 1px solid var(--ipts-line);
  box-shadow: var(--ipts-shadow);
}

.ipts-topbar {
  border-radius: 28px;
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.ipts-brand-block {
  display: flex;
  gap: 16px;
  align-items: center;
}

.ipts-brand-mark {
  width: 64px;
  height: 64px;
  border-radius: 22px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--ipts-brand-primary), var(--ipts-brand-secondary));
  display: grid;
  place-items: center;
  color: #07141d;
  font-weight: 800;
}

.ipts-brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ipts-eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.74rem;
  color: var(--ipts-text-soft);
}

.ipts-brand-copy h1 {
  margin: 0;
  font-size: clamp(1.6rem, 2.5vw, 2.3rem);
}

.ipts-meta-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.ipts-pill {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ipts-text-soft);
  font-size: 0.82rem;
}

.ipts-pill-student {
  background: rgba(255, 255, 255, 0.14);
  color: var(--ipts-text);
}

.ipts-pill-live {
  background: rgba(103, 193, 138, 0.18);
  color: #cbf8da;
}

.ipts-pill-ended {
  background: rgba(255, 107, 107, 0.16);
  color: #ffd7d7;
}

.ipts-topbar-actions {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ipts-quick-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.ipts-tool-btn,
.ipts-tool-pill {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ipts-text);
  border: none;
  font: inherit;
}

.ipts-tool-btn {
  cursor: pointer;
}

.ipts-tool-btn.active {
  background: rgba(103, 193, 138, 0.14);
  color: #cbf8da;
}

.ipts-tool-pill {
  color: var(--ipts-text-soft);
}

.ipts-timer {
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.08);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.ipts-btn,
.ipts-chip,
.ipts-nav-item,
.ipts-material-chip,
.ipts-material-card {
  border: none;
  cursor: pointer;
  font: inherit;
}

.ipts-btn {
  padding: 11px 14px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--ipts-brand-primary), var(--ipts-brand-accent));
  color: #08141c;
  font-weight: 700;
  text-decoration: none;
}

.ipts-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ipts-chip:disabled,
.ipts-nav-item:disabled,
.ipts-material-chip:disabled,
.ipts-material-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ipts-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ipts-text);
}

.ipts-btn-danger {
  background: rgba(255, 107, 107, 0.16);
  color: #ffd8d8;
}

.ipts-banner {
  padding: 12px 16px;
  border-radius: 18px;
  background: rgba(103, 193, 138, 0.12);
  color: #c9fbd8;
  border: 1px solid rgba(103, 193, 138, 0.2);
}

.ipts-banner-error {
  background: rgba(255, 107, 107, 0.14);
  color: #ffd5d5;
  border-color: rgba(255, 107, 107, 0.22);
}

.ipts-banner-muted {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ipts-text-soft);
  border-color: rgba(255, 255, 255, 0.12);
}

.ipts-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
}

.ipts-layout.leftCollapsed {
  grid-template-columns: minmax(0, 1fr) 340px;
}

.ipts-layout.rightCollapsed {
  grid-template-columns: 280px minmax(0, 1fr);
}

.ipts-layout.focus {
  grid-template-columns: minmax(0, 1fr);
}

.ipts-left,
.ipts-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ipts-card,
.ipts-stage-card {
  border-radius: 26px;
  padding: 18px;
}

.ipts-card-highlight {
  border-color: rgba(103, 193, 138, 0.3);
  box-shadow: 0 18px 36px rgba(5, 12, 20, 0.28), inset 0 0 0 1px rgba(103, 193, 138, 0.12);
}

.ipts-stage-card {
  min-height: 640px;
  background: var(--ipts-surface-alt);
}

.ipts-card-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.ipts-card-head h2,
.ipts-stage-copy h2 {
  margin: 0;
}

.ipts-card-head p,
.ipts-stage-copy p,
.muted {
  margin: 6px 0 0;
  color: var(--ipts-text-soft);
  line-height: 1.5;
}

.ipts-nav {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ipts-nav-item,
.ipts-material-card {
  text-align: left;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--ipts-text);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.ipts-nav-item.active,
.ipts-material-card.active,
.ipts-material-chip.active {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.18);
}

.ipts-nav-item small,
.ipts-material-card span,
.ipts-material-card small {
  display: block;
  color: var(--ipts-text-soft);
  margin-top: 4px;
}

.ipts-stage-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.ipts-material-chip-row,
.ipts-inline-actions,
.ipts-ai-chips,
.ipts-summary-grid,
.ipts-summary-stack,
.ipts-material-list,
.ipts-bottom-left {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.ipts-material-chip,
.ipts-chip {
  padding: 9px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ipts-text);
}

.ipts-overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.ipts-overview-panel,
.ipts-progress-note,
.ipts-ai-output,
.ipts-summary-card,
.ipts-metric-card {
  padding: 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.ipts-tag {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--ipts-text-soft);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ipts-overview-panel h3,
.ipts-doc-topline h3 {
  margin: 12px 0 8px;
}

.ipts-outline-list,
.ipts-list {
  margin: 0;
  padding-left: 18px;
  line-height: 1.6;
}

.ipts-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ipts-field span {
  font-weight: 700;
  color: var(--ipts-text-soft);
}

.ipts-field textarea,
.ipts-field input,
.ipts-bottom-composer input {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(6, 12, 20, 0.36);
  color: var(--ipts-text);
  padding: 12px 14px;
}

.ipts-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.ipts-trend-strip,
.ipts-quick-add-grid {
  display: grid;
  gap: 10px;
}

.ipts-trend-bar {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  color: var(--ipts-text-soft);
}

.ipts-trend-track {
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.ipts-trend-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--ipts-brand-primary), var(--ipts-brand-accent));
}

.ipts-trend-bar strong {
  font-size: 0.88rem;
  color: var(--ipts-text);
}

.ipts-metric-card span,
.ipts-summary-card span {
  display: block;
  color: var(--ipts-text-soft);
  font-size: 0.82rem;
}

.ipts-metric-card strong,
.ipts-summary-card strong {
  display: block;
  margin-top: 8px;
  font-size: 1.2rem;
}

.ipts-doc-topline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.ipts-doc-topline p {
  color: var(--ipts-text-soft);
}

.ipts-doc-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.ipts-share-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--ipts-text-soft);
}

.ipts-share-toggle input {
  accent-color: var(--ipts-brand-primary);
}

.ipts-save-pill {
  display: inline-flex;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(103, 193, 138, 0.14);
  color: #c9fbd8;
  font-size: 0.82rem;
}

.ipts-activity-surface {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ipts-activity-block {
  padding: 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.ipts-activity-note p {
  margin: 0;
}

.ipts-resource-frame {
  width: 100%;
  min-height: 560px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.03);
}

.ipts-empty {
  min-height: 520px;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 8px;
}

.ipts-empty-icon {
  font-size: 2rem;
}

.ipts-bottom-bar {
  border-radius: 24px;
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
}

.ipts-bottom-composer {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  gap: 10px;
  flex: 1;
}

@media (max-width: 1360px) {
  .ipts-layout,
  .ipts-layout.leftCollapsed,
  .ipts-layout.rightCollapsed {
    grid-template-columns: 1fr;
  }

  .ipts-overview-grid,
  .ipts-summary-grid,
  .ipts-trend-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ipts-bottom-bar {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 860px) {
  .ipts-page {
    padding: 12px;
  }

  .ipts-topbar,
  .ipts-card,
  .ipts-stage-card,
  .ipts-bottom-bar {
    padding: 16px;
    border-radius: 22px;
  }

  .ipts-topbar,
  .ipts-stage-toolbar,
  .ipts-doc-topline {
    flex-direction: column;
  }

  .ipts-overview-grid,
  .ipts-summary-grid,
  .ipts-trend-strip,
  .ipts-bottom-composer {
    grid-template-columns: 1fr;
  }

  .ipts-trend-bar {
    grid-template-columns: 1fr;
  }
}
</style>
