<template>
  <div class="iptb-page" :style="themeVars">
    <div class="iptb-shell">
      <header class="iptb-hero">
        <div class="iptb-hero-brand">
          <div class="iptb-brand-mark">
            <img v-if="displayLogoUrl" :src="displayLogoUrl" :alt="`${brandName} logo`" class="iptb-brand-logo" />
            <span v-else>{{ brandInitials }}</span>
          </div>
          <div class="iptb-hero-copy">
            <p class="iptb-eyebrow">In-Person Tutoring Builder</p>
            <h1>{{ payload.plan.subjectArea || payload.session?.title || 'Tutoring prep workspace' }}</h1>
            <p>
              Build a student-specific tutoring plan, attach reusable PDFs or session uploads, and launch the live in-person
              tutoring console when you are ready.
            </p>
          </div>
        </div>

        <div class="iptb-hero-actions">
          <span class="iptb-status" :class="{ demo: !hasLiveSession }">{{ hasLiveSession ? 'Live session linked' : 'Preview mode' }}</span>
          <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="savingPlan || !hasLiveSession || !canModerate" @click="savePlanNow">
            {{ savingPlan ? 'Saving…' : 'Save plan' }}
          </button>
          <router-link v-if="dashboardHref" class="iptb-btn iptb-btn-primary" :to="dashboardHref">
            Open live tutor console
          </router-link>
        </div>
      </header>

      <div v-if="errorMessage" class="iptb-banner iptb-banner-error">{{ errorMessage }}</div>
      <div v-else-if="saveMessage" class="iptb-banner">{{ saveMessage }}</div>
      <div v-if="!canModerate" class="iptb-banner iptb-banner-muted">
        This tutoring builder is in read-only mode for your role. You can review the plan and materials, but only tutors or staff moderators can make changes.
      </div>

      <main class="iptb-grid">
        <aside class="iptb-sidebar">
          <section class="iptb-card">
            <div class="iptb-card-head">
              <div>
                <h2>Student + session</h2>
                <p>Ground the tutoring session in the specific learner and today’s focus.</p>
              </div>
            </div>

            <div class="iptb-student-card">
              <div class="iptb-student-avatar">{{ payload.student?.initials || 'ST' }}</div>
              <div>
                <strong>{{ payload.student?.name || 'Student not linked yet' }}</strong>
                <p>{{ payload.plan.gradeLabel || 'Add grade/context below' }}</p>
              </div>
            </div>

            <label class="iptb-field">
              <span>Subject area</span>
              <input v-model.trim="payload.plan.subjectArea" type="text" placeholder="Reading, math, writing…" :disabled="!canModerate" />
            </label>

            <label class="iptb-field">
              <span>Grade or level</span>
              <input v-model.trim="payload.plan.gradeLabel" type="text" placeholder="Grade 4, Algebra 1, etc." :disabled="!canModerate" />
            </label>

            <label class="iptb-field">
              <span>Focus area</span>
              <textarea
                v-model.trim="payload.plan.focusArea"
                rows="4"
                placeholder="What are you targeting in today’s tutoring session?"
                :disabled="!canModerate"
              ></textarea>
            </label>
          </section>

          <section class="iptb-card">
            <div class="iptb-card-head">
              <div>
                <h2>Quick add</h2>
                <p>Build out the session without leaving the tutoring prep flow.</p>
              </div>
            </div>

            <div class="iptb-stack">
              <label class="iptb-field">
                <span>Template library</span>
                <select v-model="selectedTemplateId" :disabled="!canModerate">
                  <option value="">Choose a reusable PDF template…</option>
                  <option v-for="template in payload.availableTemplates" :key="template.id" :value="template.id">
                    {{ template.name }}
                  </option>
                </select>
              </label>
              <button type="button" class="iptb-btn" :disabled="!hasLiveSession || !selectedTemplateId || addingMaterial || !canModerate" @click="addTemplateMaterial">
                Add from library
              </button>
              <input ref="hiddenFileInput" type="file" accept="application/pdf" class="iptb-hidden-file" @change="onFileSelected" />
              <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="!hasLiveSession || addingMaterial || !canModerate" @click="triggerUpload('session_pdf')">
                Upload session PDF
              </button>
              <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="!hasLiveSession || addingMaterial || !canModerate" @click="triggerUpload('user_document')">
                Add student document
              </button>
              <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="!hasLiveSession || addingMaterial || !canModerate" @click="addQuickActivity">
                Add quick activity
              </button>
            </div>

            <div class="iptb-inline-form">
              <label class="iptb-field">
                <span>Link title</span>
                <input v-model.trim="linkForm.title" type="text" placeholder="Main idea anchor chart" :disabled="!canModerate" />
              </label>
              <label class="iptb-field">
                <span>URL</span>
                <input v-model.trim="linkForm.url" type="text" placeholder="https://…" :disabled="!canModerate" />
              </label>
              <div class="iptb-inline-actions">
                <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="!hasLiveSession || addingMaterial || !canModerate" @click="addLinkMaterial('link')">
                  Add link
                </button>
                <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="!hasLiveSession || addingMaterial || !canModerate" @click="addLinkMaterial('video')">
                  Add video
                </button>
              </div>
            </div>
          </section>

          <section class="iptb-card">
            <div class="iptb-card-head">
              <div>
                <h2>Reuse prior session</h2>
                <p>Duplicate a previous tutoring setup, then adjust it for today.</p>
              </div>
            </div>

            <label class="iptb-field">
              <span>Previous session</span>
              <select v-model="duplicateSourceId" :disabled="!canModerate">
                <option value="">Choose a prior tutoring session…</option>
                <option v-for="candidate in payload.duplicateCandidates" :key="candidate.sessionId" :value="candidate.sessionId">
                  {{ candidate.title }} · {{ formatSessionContext(candidate) }}
                </option>
              </select>
            </label>
            <button type="button" class="iptb-btn" :disabled="!hasLiveSession || !duplicateSourceId || duplicating || !canModerate" @click="duplicateFromPrior">
              {{ duplicating ? 'Duplicating…' : 'Duplicate into this session' }}
            </button>
          </section>
        </aside>

        <section class="iptb-main">
          <section class="iptb-card">
            <div class="iptb-card-head">
              <div>
                <h2>Goals + sequence</h2>
                <p>Keep the tutor focused on what success looks like in the room.</p>
              </div>
            </div>

            <div class="iptb-split">
              <div class="iptb-list-editor">
                <div class="iptb-list-head">
                  <strong>Session goals</strong>
                  <button type="button" class="iptb-mini-btn" :disabled="!canModerate" @click="addGoal">Add goal</button>
                </div>
                <div class="iptb-list-items">
                  <div v-for="(goal, index) in payload.plan.goals" :key="`goal-${index}`" class="iptb-list-row">
                    <input v-model.trim="payload.plan.goals[index]" type="text" placeholder="Write a measurable tutoring goal…" :disabled="!canModerate" />
                    <button type="button" class="iptb-icon-btn" :disabled="!canModerate" @click="removeGoal(index)">×</button>
                  </div>
                </div>
              </div>

              <div class="iptb-list-editor">
                <div class="iptb-list-head">
                  <strong>Session outline</strong>
                  <button type="button" class="iptb-mini-btn" :disabled="!canModerate" @click="addOutline">Add step</button>
                </div>
                <div class="iptb-list-items">
                  <div v-for="(step, index) in payload.plan.outline" :key="`outline-${index}`" class="iptb-list-row">
                    <input v-model.trim="payload.plan.outline[index]" type="text" placeholder="Warm-up, modeled example, practice…" :disabled="!canModerate" />
                    <button type="button" class="iptb-icon-btn" :disabled="!canModerate" @click="removeOutline(index)">×</button>
                  </div>
                </div>
              </div>
            </div>

            <label class="iptb-field">
              <span>Tutor notes</span>
              <textarea
                v-model.trim="payload.plan.tutorNotes"
                rows="7"
                placeholder="Capture prompts, watch-fors, sensory needs, strengths, and how you want to coach this student."
                :disabled="!canModerate"
              ></textarea>
            </label>
          </section>

          <section class="iptb-card">
            <div class="iptb-card-head">
              <div>
                <h2>AI prep support</h2>
                <p>Use the tutoring assistant for live-ready explanations, examples, or differentiated practice ideas.</p>
              </div>
            </div>

            <div class="iptb-ai-actions">
              <button type="button" class="iptb-chip" :disabled="!hasLiveSession" @click="runAiPrep('Explain the core concept in kid-friendly language for this tutoring session.')">Explain concept</button>
              <button type="button" class="iptb-chip" :disabled="!hasLiveSession" @click="runAiPrep('Give one concrete example and one non-example matched to this student’s level.')">Provide example</button>
              <button type="button" class="iptb-chip" :disabled="!hasLiveSession" @click="runAiPrep('Differentiate this lesson for a student who needs more scaffolding.')">Differentiate</button>
              <button type="button" class="iptb-chip" :disabled="!hasLiveSession" @click="runAiPrep('Generate a short independent practice activity for the end of this session.')">Generate practice</button>
            </div>

            <div class="iptb-ai-composer">
              <textarea
                v-model.trim="aiPrompt"
                rows="4"
                placeholder="Ask the tutoring assistant for talking points, examples, adaptations, or a quick practice item."
                :disabled="!hasLiveSession"
              ></textarea>
              <button type="button" class="iptb-btn" :disabled="aiLoading || !aiPrompt || !hasLiveSession" @click="submitAiPrompt">
                {{ aiLoading ? 'Thinking…' : 'Ask AI prep assistant' }}
              </button>
            </div>

            <div v-if="aiReply" class="iptb-ai-reply">
              <strong>AI prep suggestion</strong>
              <p>{{ aiReply }}</p>
            </div>
          </section>
        </section>

        <aside class="iptb-right">
          <section class="iptb-card">
            <div class="iptb-card-head">
              <div>
                <h2>Session materials</h2>
                <p>Pick what the tutor will open during the live session.</p>
              </div>
            </div>

            <div v-if="payload.materials.length" class="iptb-material-list">
              <button
                v-for="material in sortedMaterials"
                :key="material.id"
                type="button"
                class="iptb-material-card"
                :class="{ active: selectedMaterialId === material.id }"
                @click="selectedMaterialId = material.id"
              >
                <div>
                  <strong>{{ material.title }}</strong>
                  <span>{{ prettyMaterialType(material.materialType) }}</span>
                </div>
                <small>{{ material.hasFillablePdf ? `${material.config.fieldDefinitions.length} mapped fields` : material.description || 'No extra details yet' }}</small>
              </button>
            </div>
            <p v-else class="iptb-muted">No materials yet. Add a template, upload a session PDF, or create a quick activity.</p>
          </section>

          <section v-if="selectedMaterial" class="iptb-card">
            <div class="iptb-card-head">
              <div>
                <h2>Selected material</h2>
                <p>Edit the attached document, activity, or resource before the tutor opens the live room.</p>
              </div>
            </div>

            <label class="iptb-field">
              <span>Title</span>
              <input v-model.trim="selectedMaterial.title" type="text" :disabled="!canModerate" />
            </label>

            <label class="iptb-field">
              <span>Description</span>
              <textarea v-model.trim="selectedMaterial.description" rows="3" :disabled="!canModerate"></textarea>
            </label>

            <template v-if="selectedMaterial.materialType === 'activity'">
              <label class="iptb-field">
                <span>Instructions</span>
                <textarea v-model.trim="selectedMaterial.config.instructions" rows="4" :disabled="!canModerate"></textarea>
              </label>
              <div class="iptb-list-editor">
                <div class="iptb-list-head">
                  <strong>Activity blocks</strong>
                </div>
                <div class="iptb-activity-blocks">
                  <div v-for="(block, index) in selectedMaterial.config.blocks" :key="block.id || index" class="iptb-activity-block">
                    <label class="iptb-field">
                      <span>Block type</span>
                      <select v-model="block.type" :disabled="!canModerate">
                        <option value="prompt">Prompt</option>
                        <option value="paragraph">Paragraph</option>
                        <option value="shortText">Short answer</option>
                      </select>
                    </label>
                    <label class="iptb-field">
                      <span>Label / copy</span>
                      <textarea v-model.trim="block.label" rows="2" v-if="block.type !== 'prompt'" :disabled="!canModerate"></textarea>
                      <textarea v-model.trim="block.copy" rows="2" v-else :disabled="!canModerate"></textarea>
                    </label>
                    <label v-if="block.type !== 'prompt'" class="iptb-field">
                      <span>Placeholder</span>
                      <input v-model.trim="block.placeholder" type="text" :disabled="!canModerate" />
                    </label>
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="selectedMaterial.materialType === 'link' || selectedMaterial.materialType === 'video'">
              <label class="iptb-field">
                <span>External URL</span>
                <input v-model.trim="selectedMaterial.externalUrl" type="text" :disabled="!canModerate" />
              </label>
            </template>

            <template v-else-if="selectedMaterial.fileUrl">
              <div class="iptb-field-builder" :class="{ 'iptb-field-builder-readonly': !canModerate }">
                <div class="iptb-inline-actions">
                  <strong>Field mapping</strong>
                  <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="savingMaterial || !canModerate" @click="saveSelectedMaterial">
                    {{ savingMaterial ? 'Saving…' : 'Save field map' }}
                  </button>
                </div>
                <PDFFieldDefinitionBuilder :pdf-url="selectedMaterial.fileUrl" v-model="selectedMaterial.config.fieldDefinitions" />
              </div>
            </template>

            <div class="iptb-inline-actions iptb-material-actions">
                <button type="button" class="iptb-btn" :disabled="savingMaterial || !canModerate" @click="saveSelectedMaterial">
                  {{ savingMaterial ? 'Saving…' : 'Save material changes' }}
                </button>
              <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="!hasLiveSession || !canModerate" @click="moveMaterial(-1)">
                Move up
              </button>
              <button type="button" class="iptb-btn iptb-btn-secondary" :disabled="!hasLiveSession || !canModerate" @click="moveMaterial(1)">
                Move down
              </button>
              <button type="button" class="iptb-btn iptb-btn-danger" :disabled="!hasLiveSession || !canModerate" @click="deleteSelectedMaterial">
                Remove
              </button>
            </div>
          </section>

          <section class="iptb-card">
            <div class="iptb-card-head">
              <div>
                <h2>Preview</h2>
                <p>Open the live tutoring console to see how the tutor will experience the session.</p>
              </div>
            </div>

            <div v-if="dashboardHref" class="iptb-preview-links">
              <router-link class="iptb-btn iptb-btn-primary" :to="dashboardHref">Open full live view</router-link>
              <p class="iptb-muted">The live tutor console uses this saved plan and the attached materials.</p>
            </div>
            <p v-else class="iptb-muted">Link this builder to a real tutoring session to save, duplicate, and preview the live workspace.</p>
          </section>
        </aside>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PDFFieldDefinitionBuilder from '../../components/documents/PDFFieldDefinitionBuilder.vue';
import { useAgencyStore } from '../../store/agency';
import { useBrandingStore } from '../../store/branding';
import {
  askInPersonAi,
  createDemoInPersonPayload,
  createInPersonMaterial,
  deleteInPersonMaterial,
  duplicateInPersonPlan,
  fetchInPersonPlan,
  saveInPersonPlan,
  updateInPersonMaterial,
  uploadInPersonMaterial
} from '../../services/inPersonTutoring';

const route = useRoute();
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

const sessionId = computed(() => String(route.params.sessionId || '').trim());
const organizationSlug = computed(() => String(route.params.organizationSlug || '').trim());
const hasLiveSession = computed(() => !!sessionId.value);

const payload = ref(createDemoInPersonPayload());
const loading = ref(false);
const savingPlan = ref(false);
const savingMaterial = ref(false);
const duplicating = ref(false);
const addingMaterial = ref(false);
const errorMessage = ref('');
const saveMessage = ref('');
const selectedTemplateId = ref('');
const duplicateSourceId = ref('');
const selectedMaterialId = ref(null);
const aiPrompt = ref('');
const aiReply = ref('');
const aiLoading = ref(false);
const hiddenFileInput = ref(null);
const uploadMode = ref('session_pdf');
const linkForm = ref({ title: '', url: '' });

const brandPrimary = computed(() => normalizeHexColor(brandingStore.primaryColor, '#67C18A'));
const brandSecondary = computed(() => normalizeHexColor(brandingStore.secondaryColor, '#183A2C'));
const brandAccent = computed(() => normalizeHexColor(brandingStore.accentColor, '#A5F2C1'));
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
  const toneSeed = mixHex(brandPrimary.value, brandSecondary.value, 0.35);
  const background = mixHex(toneSeed, '#070B12', 0.55);
  const surface = mixHex(toneSeed, '#101826', 0.48);
  const surfaceAlt = mixHex(brandPrimary.value, '#0F1624', 0.68);
  return {
    '--iptb-bg': background,
    '--iptb-bg-alt': mixHex(background, '#121B2C', 0.35),
    '--iptb-surface': surface,
    '--iptb-surface-alt': surfaceAlt,
    '--iptb-line': rgba(brandPrimary.value, 0.2),
    '--iptb-soft': rgba(brandPrimary.value, 0.12),
    '--iptb-soft-strong': rgba(brandAccent.value, 0.18),
    '--iptb-text': '#EEF6FF',
    '--iptb-text-soft': 'rgba(238, 246, 255, 0.78)',
    '--iptb-brand-primary': brandPrimary.value,
    '--iptb-brand-secondary': brandSecondary.value,
    '--iptb-brand-accent': brandAccent.value,
    '--iptb-shadow': `0 24px 54px ${rgba('#020617', 0.32)}`
  };
});

const sortedMaterials = computed(() =>
  [...(payload.value.materials || [])].sort((left, right) => left.positionIndex - right.positionIndex || String(left.title).localeCompare(String(right.title)))
);
const canModerate = computed(() => payload.value.canModerate !== false);

const selectedMaterial = computed(() =>
  payload.value.materials.find((material) => material.id === selectedMaterialId.value) || sortedMaterials.value[0] || null
);

const dashboardHref = computed(() => {
  if (!hasLiveSession.value) return null;
  return {
    path: organizationSlug.value
      ? `/${organizationSlug.value}/in-person-tutoring-session/${sessionId.value}`
      : `/in-person-tutoring-session/${sessionId.value}`
  };
});

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

function formatSessionContext(candidate = {}) {
  const tone = candidate.deliveryContext === 'in_person' ? 'In person' : 'Virtual';
  const when = candidate.endsAt || candidate.startsAt;
  if (!when) return tone;
  return `${tone} · ${new Date(when).toLocaleDateString()}`;
}

function selectFirstMaterial() {
  if (!payload.value.materials.length) {
    selectedMaterialId.value = null;
    return;
  }
  if (!payload.value.materials.some((material) => material.id === selectedMaterialId.value)) {
    selectedMaterialId.value = payload.value.materials[0].id;
  }
}

async function loadPayload() {
  loading.value = true;
  errorMessage.value = '';
  saveMessage.value = '';
  try {
    payload.value = hasLiveSession.value
      ? await fetchInPersonPlan(sessionId.value)
      : createDemoInPersonPayload();
    selectFirstMaterial();
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not load the tutoring builder.';
    payload.value = createDemoInPersonPayload();
  } finally {
    loading.value = false;
  }
}

async function savePlanNow() {
  if (!hasLiveSession.value || !canModerate.value) return;
  savingPlan.value = true;
  errorMessage.value = '';
  saveMessage.value = '';
  try {
    payload.value = await saveInPersonPlan(sessionId.value, payload.value.plan);
    saveMessage.value = 'Tutoring plan saved.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not save the tutoring plan.';
  } finally {
    savingPlan.value = false;
  }
}

async function duplicateFromPrior() {
  if (!hasLiveSession.value || !duplicateSourceId.value || !canModerate.value) return;
  duplicating.value = true;
  errorMessage.value = '';
  saveMessage.value = '';
  try {
    payload.value = await duplicateInPersonPlan(sessionId.value, duplicateSourceId.value);
    selectFirstMaterial();
    saveMessage.value = 'Previous tutoring session duplicated into this builder.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not duplicate the prior tutoring session.';
  } finally {
    duplicating.value = false;
  }
}

function addGoal() {
  if (!canModerate.value) return;
  payload.value.plan.goals.push('');
}

function removeGoal(index) {
  if (!canModerate.value) return;
  payload.value.plan.goals.splice(index, 1);
}

function addOutline() {
  if (!canModerate.value) return;
  payload.value.plan.outline.push('');
}

function removeOutline(index) {
  if (!canModerate.value) return;
  payload.value.plan.outline.splice(index, 1);
}

function triggerUpload(mode) {
  if (!canModerate.value) return;
  uploadMode.value = mode;
  hiddenFileInput.value?.click();
}

async function onFileSelected(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  if (!canModerate.value) {
    event.target.value = '';
    return;
  }
  if (!hasLiveSession.value) {
    errorMessage.value = 'Attach this builder to a real tutoring session before uploading materials.';
    event.target.value = '';
    return;
  }
  addingMaterial.value = true;
  errorMessage.value = '';
  try {
    const material = await uploadInPersonMaterial(sessionId.value, {
      file,
      materialType: uploadMode.value,
      title: uploadMode.value === 'user_document' ? `Student document - ${file.name}` : file.name,
      config: { fieldDefinitions: [] }
    });
    payload.value.materials.push(material);
    selectedMaterialId.value = material.id;
    saveMessage.value = `${uploadMode.value === 'user_document' ? 'Student document' : 'Session PDF'} attached.`;
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not upload the tutoring material.';
  } finally {
    addingMaterial.value = false;
    event.target.value = '';
  }
}

async function addTemplateMaterial() {
  if (!hasLiveSession.value || !selectedTemplateId.value || !canModerate.value) return;
  addingMaterial.value = true;
  errorMessage.value = '';
  try {
    const material = await createInPersonMaterial(sessionId.value, {
      materialType: 'document_template',
      sourceId: selectedTemplateId.value
    });
    payload.value.materials.push(material);
    selectedMaterialId.value = material.id;
    saveMessage.value = 'Library PDF attached to the tutoring session.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not attach that PDF template.';
  } finally {
    addingMaterial.value = false;
  }
}

async function addQuickActivity() {
  if (!hasLiveSession.value || !canModerate.value) return;
  addingMaterial.value = true;
  errorMessage.value = '';
  try {
    const material = await createInPersonMaterial(sessionId.value, {
      materialType: 'activity',
      title: `Quick practice ${payload.value.materials.length + 1}`
    });
    payload.value.materials.push(material);
    selectedMaterialId.value = material.id;
    saveMessage.value = 'Quick activity added.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not add the quick activity.';
  } finally {
    addingMaterial.value = false;
  }
}

async function addLinkMaterial(materialType) {
  if (!hasLiveSession.value || !linkForm.value.url || !canModerate.value) return;
  addingMaterial.value = true;
  errorMessage.value = '';
  try {
    const material = await createInPersonMaterial(sessionId.value, {
      materialType,
      title: linkForm.value.title || (materialType === 'video' ? 'Video resource' : 'Link resource'),
      externalUrl: linkForm.value.url
    });
    payload.value.materials.push(material);
    selectedMaterialId.value = material.id;
    linkForm.value = { title: '', url: '' };
    saveMessage.value = `${materialType === 'video' ? 'Video' : 'Link'} added.`;
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not add the link/video.';
  } finally {
    addingMaterial.value = false;
  }
}

async function saveSelectedMaterial() {
  if (!hasLiveSession.value || !selectedMaterial.value || !canModerate.value) return;
  savingMaterial.value = true;
  errorMessage.value = '';
  try {
    const updated = await updateInPersonMaterial(sessionId.value, selectedMaterial.value.id, {
      title: selectedMaterial.value.title,
      description: selectedMaterial.value.description,
      externalUrl: selectedMaterial.value.externalUrl,
      config: selectedMaterial.value.config
    });
    const index = payload.value.materials.findIndex((material) => material.id === updated.id);
    if (index >= 0) payload.value.materials.splice(index, 1, updated);
    saveMessage.value = 'Material changes saved.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not save the selected material.';
  } finally {
    savingMaterial.value = false;
  }
}

async function moveMaterial(direction) {
  if (!hasLiveSession.value || !selectedMaterial.value || !canModerate.value) return;
  const currentIndex = sortedMaterials.value.findIndex((material) => material.id === selectedMaterial.value.id);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedMaterials.value.length) return;
  const target = sortedMaterials.value[nextIndex];
  const updatedCurrent = await updateInPersonMaterial(sessionId.value, selectedMaterial.value.id, { positionIndex: target.positionIndex });
  const updatedTarget = await updateInPersonMaterial(sessionId.value, target.id, { positionIndex: selectedMaterial.value.positionIndex });
  const currentPos = payload.value.materials.findIndex((material) => material.id === updatedCurrent.id);
  const targetPos = payload.value.materials.findIndex((material) => material.id === updatedTarget.id);
  if (currentPos >= 0) payload.value.materials.splice(currentPos, 1, updatedCurrent);
  if (targetPos >= 0) payload.value.materials.splice(targetPos, 1, updatedTarget);
  saveMessage.value = 'Material order updated.';
}

async function deleteSelectedMaterial() {
  if (!hasLiveSession.value || !selectedMaterial.value || !canModerate.value) return;
  const materialTitle = selectedMaterial.value.title;
  try {
    await deleteInPersonMaterial(sessionId.value, selectedMaterial.value.id);
    payload.value.materials = payload.value.materials.filter((material) => material.id !== selectedMaterial.value.id);
    selectFirstMaterial();
    saveMessage.value = `${materialTitle} removed from the tutoring session.`;
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not delete that material.';
  }
}

async function submitAiPrompt() {
  if (!aiPrompt.value) return;
  aiLoading.value = true;
  errorMessage.value = '';
  try {
    if (!hasLiveSession.value) {
      aiReply.value = 'Link this builder to a real tutoring session to use the AI prep assistant with saved session context.';
      return;
    }
    const result = await askInPersonAi(sessionId.value, {
      prompt: aiPrompt.value,
      history: []
    });
    aiReply.value = result.assistantText || 'No AI suggestion returned.';
  } catch (error) {
    errorMessage.value = error.response?.data?.error?.message || error.message || 'Could not reach the AI prep assistant.';
  } finally {
    aiLoading.value = false;
  }
}

function runAiPrep(prompt) {
  aiPrompt.value = prompt;
  submitAiPrompt();
}

watch(
  () => sessionId.value,
  () => {
    loadPayload();
  },
  { immediate: true }
);
</script>

<style scoped>
.iptb-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.08), transparent 28%),
    linear-gradient(180deg, var(--iptb-bg), var(--iptb-bg-alt));
  color: var(--iptb-text);
  padding: 20px;
}

.iptb-shell {
  max-width: 1580px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.iptb-hero,
.iptb-card {
  background: var(--iptb-surface);
  border: 1px solid var(--iptb-line);
  border-radius: 28px;
  box-shadow: var(--iptb-shadow);
}

.iptb-hero {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 28px;
}

.iptb-hero-brand {
  display: flex;
  gap: 18px;
  align-items: center;
}

.iptb-brand-mark {
  width: 74px;
  height: 74px;
  border-radius: 24px;
  background: linear-gradient(135deg, var(--iptb-brand-primary), var(--iptb-brand-secondary));
  display: grid;
  place-items: center;
  font-size: 1.35rem;
  font-weight: 800;
  color: #04141f;
  overflow: hidden;
}

.iptb-brand-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.iptb-eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.76rem;
  color: var(--iptb-text-soft);
}

.iptb-hero-copy h1 {
  margin: 0;
  font-size: clamp(1.9rem, 3vw, 2.8rem);
}

.iptb-hero-copy p {
  margin: 10px 0 0;
  max-width: 840px;
  color: var(--iptb-text-soft);
  line-height: 1.6;
}

.iptb-hero-actions {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.iptb-status {
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(103, 193, 138, 0.16);
  color: #b8f7cb;
  font-size: 0.85rem;
  font-weight: 700;
}

.iptb-status.demo {
  background: rgba(255, 255, 255, 0.1);
  color: var(--iptb-text-soft);
}

.iptb-btn,
.iptb-mini-btn,
.iptb-chip,
.iptb-icon-btn {
  border: none;
  cursor: pointer;
  font: inherit;
}

.iptb-btn {
  padding: 12px 16px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--iptb-brand-primary), var(--iptb-brand-accent));
  color: #04141f;
  font-weight: 700;
  text-decoration: none;
}

.iptb-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.iptb-mini-btn:disabled,
.iptb-chip:disabled,
.iptb-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.iptb-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: var(--iptb-text);
}

.iptb-btn-danger {
  background: rgba(255, 107, 107, 0.16);
  color: #ffd2d2;
}

.iptb-grid {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(460px, 1fr) minmax(320px, 420px);
  gap: 18px;
  align-items: start;
}

.iptb-sidebar,
.iptb-main,
.iptb-right {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.iptb-card {
  padding: 20px;
}

.iptb-card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.iptb-card-head h2 {
  margin: 0;
  font-size: 1.15rem;
}

.iptb-card-head p,
.iptb-muted {
  margin: 6px 0 0;
  color: var(--iptb-text-soft);
  line-height: 1.5;
}

.iptb-student-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  background: var(--iptb-soft);
  margin-bottom: 16px;
}

.iptb-student-avatar {
  width: 50px;
  height: 50px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.12);
}

.iptb-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.iptb-field span {
  font-size: 0.83rem;
  font-weight: 700;
  color: var(--iptb-text-soft);
}

.iptb-field input,
.iptb-field textarea,
.iptb-field select,
.iptb-ai-composer textarea {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(6, 12, 20, 0.34);
  color: var(--iptb-text);
  padding: 12px 14px;
  resize: vertical;
}

.iptb-stack,
.iptb-inline-form,
.iptb-ai-composer,
.iptb-list-items,
.iptb-activity-blocks,
.iptb-preview-links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.iptb-inline-actions,
.iptb-material-actions,
.iptb-ai-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.iptb-chip,
.iptb-mini-btn,
.iptb-icon-btn {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--iptb-text);
}

.iptb-list-editor,
.iptb-ai-reply,
.iptb-field-builder {
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.iptb-list-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.iptb-list-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}

.iptb-split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 14px;
}

.iptb-material-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.iptb-material-card {
  text-align: left;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: var(--iptb-text);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.iptb-material-card.active {
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.09);
}

.iptb-material-card strong,
.iptb-material-card span,
.iptb-material-card small {
  display: block;
}

.iptb-material-card span,
.iptb-material-card small {
  color: var(--iptb-text-soft);
  margin-top: 4px;
}

.iptb-hidden-file {
  display: none;
}

.iptb-banner {
  padding: 14px 18px;
  border-radius: 18px;
  background: rgba(103, 193, 138, 0.12);
  color: #c9fbd8;
  border: 1px solid rgba(103, 193, 138, 0.18);
}

.iptb-banner-error {
  background: rgba(255, 107, 107, 0.14);
  color: #ffd3d3;
  border-color: rgba(255, 107, 107, 0.22);
}

.iptb-banner-muted {
  background: rgba(255, 255, 255, 0.08);
  color: var(--iptb-text-soft);
  border-color: rgba(255, 255, 255, 0.12);
}

.iptb-field-builder-readonly {
  opacity: 0.72;
  pointer-events: none;
}

@media (max-width: 1280px) {
  .iptb-grid {
    grid-template-columns: 1fr;
  }

  .iptb-hero {
    flex-direction: column;
  }
}

@media (max-width: 780px) {
  .iptb-page {
    padding: 12px;
  }

  .iptb-card,
  .iptb-hero {
    padding: 16px;
    border-radius: 22px;
  }

  .iptb-split {
    grid-template-columns: 1fr;
  }
}
</style>
