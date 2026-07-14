<template>
  <div class="pb" :class="{ 'pb--editing': canEditBookingPage }" :data-mode="bookingMode" :data-theme="themeId" :style="brandStyle">
    <div v-if="canEditBookingPage" class="pb-editor-bar" :class="{ 'pb-editor-bar--active': editing }">
      <template v-if="!editing">
        <span class="pb-editor-hint">Owner</span>
        <button class="pb-editor-btn pb-editor-btn--primary" type="button" @click="startEdit">
          Edit this page
        </button>
        <router-link v-if="adminSettingsPath" class="pb-editor-link" :to="adminSettingsPath">
          Full settings
        </router-link>
      </template>
      <template v-else>
        <span class="pb-editor-hint">Editing</span>
        <button class="pb-editor-btn" type="button" :disabled="savingEdit" @click="cancelEdit">Cancel</button>
        <button class="pb-editor-btn pb-editor-btn--primary" type="button" :disabled="savingEdit" @click="saveEdit">
          {{ savingEdit ? 'Saving…' : 'Save' }}
        </button>
        <router-link v-if="adminSettingsPath" class="pb-editor-link" :to="adminSettingsPath">
          Full settings
        </router-link>
        <div class="pb-style-strip">
          <label class="pb-style-field">
            Accent
            <input
              :value="editDraft.accentColor || '#1b4332'"
              type="color"
              class="pb-style-color"
              @input="editDraft.accentColor = $event.target.value"
            />
          </label>
          <label class="pb-style-field">
            Body font
            <select v-model="editDraft.fontFamily" class="pb-style-select">
              <option v-for="f in fontOptions" :key="`body-${f.id || 'default'}`" :value="f.id">{{ f.label }}</option>
            </select>
          </label>
          <label class="pb-style-field">
            Heading font
            <select v-model="editDraft.headingFontFamily" class="pb-style-select">
              <option v-for="f in fontOptions" :key="`head-${f.id || 'default'}`" :value="f.id">{{ f.label }}</option>
            </select>
          </label>
          <label class="pb-style-field pb-style-field--grow">
            Background image URL
            <input v-model="editDraft.backgroundImageUrl" type="url" class="pb-style-input" placeholder="https://…" />
          </label>
        </div>
        <p v-if="editError" class="pb-editor-error">{{ editError }}</p>
        <p v-if="editOk" class="pb-editor-ok">{{ editOk }}</p>
      </template>
    </div>

    <!-- Consultant Elevate-style header -->
    <header v-if="isConsultant" class="pb-hero pb-hero--consultant">
      <div class="pb-hero-bar">
        <div class="pb-brand">
          <img v-if="agency.logoUrl" class="pb-logo" :src="agency.logoUrl" :alt="brandName" />
          <span v-else class="pb-mark">◆</span>
          <span v-if="editing">
            <input v-model="editDraft.brandDisplayName" class="pb-inline-input" type="text" :placeholder="agency.name || 'Practice name'" />
          </span>
          <span v-else>{{ brandName }}</span>
        </div>
        <a class="pb-signin" href="/login">Sign in</a>
      </div>
      <div class="pb-hero-copy">
        <h1>Book a Session with {{ providerDisplayName }}</h1>
        <p v-if="editing">
          <input v-model="editDraft.consultantTagline" class="pb-inline-input pb-inline-input--wide" type="text" />
        </p>
        <p v-else>{{ page.consultantTagline }}</p>
        <div class="pb-benefits">
          <template v-if="editing">
            <input
              v-for="(_, i) in editDraft.consultantBenefits"
              :key="`ben-${i}`"
              v-model="editDraft.consultantBenefits[i]"
              class="pb-inline-input"
              type="text"
              placeholder="Benefit"
            />
          </template>
          <span v-else v-for="(b, i) in page.consultantBenefits" :key="i">✓ {{ b }}</span>
        </div>
      </div>
    </header>

    <!-- Life coach branded discovery header -->
    <header v-else class="pb-hero pb-hero--coach">
      <div class="coach-nav">
        <div class="pb-brand coach">
          <img v-if="agency.logoUrl" class="pb-logo" :src="agency.logoUrl" :alt="brandName" />
          <span v-else class="pb-mark coach" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="28" height="28"><path fill="currentColor" d="M4 30 L20 8 L36 30 Z"/><circle cx="28" cy="10" r="5" fill="#d4a017"/></svg>
          </span>
          <span v-if="editing">
            <input v-model="editDraft.brandDisplayName" class="pb-inline-input" type="text" :placeholder="agency.name || 'Practice name'" />
          </span>
          <span v-else>{{ brandName }}</span>
        </div>
        <nav v-if="(editing ? editDraft.showNav : page.showNav) && (editing ? editDraft.navLinks : page.navLinks).length" class="coach-nav-links" aria-label="Practice">
          <template v-if="editing">
            <span v-for="(link, i) in editDraft.navLinks" :key="`nav-${i}`" class="pb-nav-edit">
              <input v-model="link.label" class="pb-inline-input" type="text" placeholder="Label" />
            </span>
          </template>
          <a v-else v-for="link in page.navLinks" :key="link.label" :href="link.href">{{ link.label }}</a>
        </nav>
        <button v-if="!editing" type="button" class="pb-cta-pill" @click="step = 1">{{ page.ctaLabel }}</button>
        <input v-else v-model="editDraft.ctaLabel" class="pb-inline-input pb-cta-edit" type="text" placeholder="CTA label" />
      </div>
      <div v-if="showTeamBack" class="pb-team-back">
        <router-link :to="teamFinderPath">← Back to all providers</router-link>
      </div>
      <div class="pb-hero-copy coach">
        <div v-if="editing || page.coachEyebrow" class="pb-eyebrow">
          <input v-if="editing" v-model="editDraft.coachEyebrow" class="pb-inline-input" type="text" placeholder="Eyebrow" />
          <template v-else>{{ page.coachEyebrow }}</template>
        </div>
        <h1 v-if="editing">
          <input
            v-model="editDraft.coachHeroTitles[`step${step}`]"
            class="pb-inline-input pb-inline-input--hero"
            type="text"
            placeholder="Hero title"
          />
        </h1>
        <h1 v-else>{{ coachHeroTitle }}</h1>
        <p v-if="editing">
          <textarea
            v-model="editDraft.coachHeroSubtitles[`step${step}`]"
            class="pb-inline-input pb-inline-input--area"
            rows="2"
            placeholder="Hero subtitle"
          />
        </p>
        <p v-else>{{ coachHeroSub }}</p>
      </div>
      <div class="pb-steps">
        <div class="pb-step" :class="{ done: step > 1, active: step === 1 }">
          <div class="n">{{ step > 1 ? '✓' : '1' }}</div>
          <div>
            <strong>Choose Preferred Time</strong>
            <span>{{ step > 1 ? 'Review my availability' : 'Select from open discovery slots' }}</span>
          </div>
        </div>
        <div class="pb-step" :class="{ done: step > 2, active: step === 2 }">
          <div class="n">{{ step > 2 ? '✓' : '2' }}</div>
          <div>
            <strong>Discovery Call</strong>
            <span>Share your availability</span>
          </div>
        </div>
        <div class="pb-step" :class="{ active: step === 3 }">
          <div class="n">3</div>
          <div>
            <strong>Share a Little About You</strong>
            <span>Tell me a bit about yourself</span>
          </div>
        </div>
      </div>
    </header>

    <div v-if="loading" class="pb-state">Loading booking…</div>
    <div v-else-if="error" class="pb-state error">{{ error }}</div>
    <div v-else-if="submitted" class="pb-state success">
      <h2>You're all set!</h2>
      <p>We've received your {{ selectedService?.isDiscovery ? 'discovery' : 'session' }} request. You'll get a confirmation email shortly.</p>
    </div>

    <!-- ===================== CONSULTANT FRAME ===================== -->
    <main v-else-if="isConsultant" class="pb-main consultant">
      <aside class="pb-profile">
        <div class="avatar" :style="avatarStyle">{{ providerInitials }}</div>
        <h2>{{ providerDisplayName }}</h2>
        <p class="title">{{ provider?.title || page.providerTitleFallback || 'Senior Consultant' }}</p>
        <p class="bio">{{ providerBio }}</p>
        <ul class="stats">
          <li><strong>1:1 Sessions</strong><span>Strategy, operations &amp; growth</span></li>
          <li><strong>Calendar sync</strong><span>Live availability from their calendar</span></li>
          <li><strong>Secure booking</strong><span>Encrypted &amp; confidential</span></li>
        </ul>
        <blockquote v-if="discoverySettings.discoveryBookingEnabled">
          Not sure which session is right?
          <button type="button" class="linkish" @click="selectDiscoveryService">
            Schedule a free discovery call →
          </button>
        </blockquote>
      </aside>

      <section class="pb-services">
        <h3>Step 1 — Select a Service</h3>
        <button
          v-for="svc in visibleServices"
          :key="svc.id"
          type="button"
          class="svc-card"
          :class="{ selected: selectedService?.id === svc.id, free: !svc.priceCents }"
          @click="selectedService = svc"
        >
          <div class="svc-top">
            <span class="svc-icon">{{ iconGlyph(svc.icon) }}</span>
            <span class="svc-price">{{ formatPriceCents(svc.priceCents) }}</span>
          </div>
          <div class="svc-name">{{ svc.name }}</div>
          <div class="svc-meta">{{ svc.durationMin }} min</div>
          <p>{{ svc.description }}</p>
          <span class="radio" :class="{ on: selectedService?.id === svc.id }" />
        </button>
      </section>

      <section class="pb-calendar">
        <h3>Step 2 — Choose a Date &amp; Time</h3>
        <p class="tz">All times shown in your local timezone. Slots are intake / new-client availability only.</p>
        <div class="cal-nav">
          <button type="button" @click="shiftWeek(-1)">‹</button>
          <strong>{{ weekLabel }}</strong>
          <button type="button" @click="shiftWeek(1)">›</button>
        </div>
        <div class="day-pills">
          <button
            v-for="d in weekDays"
            :key="d.ymd"
            type="button"
            class="day-pill"
            :class="{ selected: selectedDate === d.ymd, has: d.hasSlots, disabled: !d.hasSlots }"
            :disabled="!d.hasSlots"
            @click="selectedDate = d.ymd"
          >
            <span>{{ d.weekday }}</span>
            <strong>{{ d.dayNum }}</strong>
          </button>
        </div>
        <div class="slot-grid">
          <button
            v-for="s in slotsForSelectedDate"
            :key="s.startAt"
            type="button"
            class="slot"
            :class="{ selected: selectedSlot?.startAt === s.startAt }"
            @click="selectedSlot = s"
          >
            {{ formatTime(s.startAt) }}
          </button>
          <p v-if="selectedDate && !slotsForSelectedDate.length" class="muted">No open slots this day.</p>
        </div>

        <div v-if="selectedService && selectedSlot" class="contact-box">
          <h4>Your details</h4>
          <div class="form-grid">
            <label>Full name *<input v-model="form.name" type="text" /></label>
            <label>Email *<input v-model="form.email" type="email" /></label>
            <label>Phone<input v-model="form.phone" type="tel" /></label>
            <label class="full">Notes<textarea v-model="form.notes" rows="3" /></label>
          </div>
          <p v-if="selectedService.isDiscovery" class="free-note">This discovery call is free — no payment required.</p>
          <p v-if="submitError" class="err">{{ submitError }}</p>
          <button type="button" class="pb-submit" :disabled="submitting" @click="submitBooking">
            {{ submitting ? 'Submitting…' : (selectedService.isDiscovery ? 'Request free discovery →' : 'Request session →') }}
          </button>
        </div>
      </section>
    </main>

    <!-- ===================== LIFE COACH 3-STEP (RiseRevive frame) ===================== -->
    <main v-else id="booking" class="coach-shell">
      <div class="coach-card" :data-step="step">
        <aside class="pb-profile coach">
          <div class="avatar" :style="avatarStyle">{{ providerInitials }}</div>
          <h2>{{ providerDisplayName }}</h2>
          <p class="title">{{ provider?.title || page.providerTitleFallback || 'Life Coach' }}</p>
          <p class="bio">{{ providerBio }}</p>
          <ul v-if="step === 1 && coachSpecialties.length" class="specialties">
            <li v-for="item in coachSpecialties" :key="item">✓ {{ item }}</li>
          </ul>
          <ul class="coach-meta">
            <li>
              <span class="mi" aria-hidden="true">⏱</span>
              {{ discoverySettings.discoveryDurationMin || 20 }} minute discovery call
            </li>
            <li><span class="mi" aria-hidden="true">💻</span> {{ page.modalityLabel || 'Virtual' }}</li>
            <li v-if="step !== 1"><span class="mi" aria-hidden="true">🏷</span> 100% Free</li>
          </ul>
          <div class="expect">
            <strong>{{ page.whatToExpectTitle || 'What to expect' }}</strong>
            <p>{{ page.whatToExpectBody }}</p>
          </div>
        </aside>

        <section class="pb-flow">
          <!-- Step 1: pick from coach's open intake slots -->
          <div v-if="step === 1" class="flow-panel">
            <h3>Step 1 of 3: Choose Your Preferred Time</h3>
            <p class="hint">Select an open discovery slot from their calendar (new-client / intake availability only).</p>
            <div class="cal-nav">
              <button type="button" :disabled="!canGoPrevWeek" @click="shiftWeek(-1)" aria-label="Previous week">‹</button>
              <strong>{{ weekLabel }}</strong>
              <button type="button" @click="shiftWeek(1)" aria-label="Next week">›</button>
              <button type="button" class="ghost" @click="goThisWeek">This Week</button>
              <button type="button" class="ghost accent" :disabled="findingFirst" @click="jumpToFirstAvailable">
                {{ findingFirst ? 'Searching…' : 'First available' }}
              </button>
            </div>
            <p class="tz">All times shown in your local timezone · scroll forward week by week to find a future opening</p>
            <div v-if="!weekHasOpenSlots" class="empty-week">
              No open slots this week.
              <button type="button" class="linkish" @click="shiftWeek(1)">Check next week →</button>
              or
              <button type="button" class="linkish" :disabled="findingFirst" @click="jumpToFirstAvailable">jump to first available</button>
            </div>
            <div v-else class="week-grid">
              <div v-for="d in weekDays" :key="d.ymd" class="week-col">
                <div class="week-col-head">{{ d.weekday }}<span>{{ d.dayNum }}</span></div>
                <button
                  v-for="s in slotsByDate[d.ymd] || []"
                  :key="s.startAt"
                  type="button"
                  class="slot slim"
                  :class="{ selected: selectedSlot?.startAt === s.startAt }"
                  @click="pickCoachSlot(s, d.ymd)"
                >
                  {{ formatTime(s.startAt) }}
                </button>
                <div v-if="!(slotsByDate[d.ymd] || []).length" class="dash">—</div>
              </div>
            </div>
            <p v-if="firstAvailableHint" class="picked-slot">{{ firstAvailableHint }}</p>
            <div class="flow-actions">
              <span />
              <button type="button" class="pb-submit" :disabled="!selectedSlot" @click="goCoachStep2">
                Continue to Next Step →
              </button>
            </div>
          </div>

          <!-- Step 2: client's preferred availability (submitted with request) -->
          <div v-else-if="step === 2" class="flow-panel">
            <h3>Step 2 of 3: Share Your Availability</h3>
            <p class="hint">Tell me when you're usually free. This is submitted with your request so I can confirm or suggest alternatives.</p>

            <p class="field-label">What days are you usually available?</p>
            <div class="day-toggles">
              <button
                v-for="day in prefDays"
                :key="day"
                type="button"
                :class="{ on: form.prefDays.includes(day) }"
                @click="togglePrefDay(day)"
              >{{ day }}</button>
            </div>

            <p class="field-label">What times of day work best for you?</p>
            <div class="tod-cards">
              <button type="button" class="tod-card" :class="{ on: form.prefTod.includes('morning') }" @click="toggleTod('morning')">
                <span class="tod-icon">☀</span>
                <strong>Morning</strong>
                <span>Before 12:00 PM</span>
                <span class="check" :class="{ on: form.prefTod.includes('morning') }" />
              </button>
              <button type="button" class="tod-card" :class="{ on: form.prefTod.includes('afternoon') }" @click="toggleTod('afternoon')">
                <span class="tod-icon">☼</span>
                <strong>Afternoon</strong>
                <span>12:00 PM – 5:00 PM</span>
                <span class="check" :class="{ on: form.prefTod.includes('afternoon') }" />
              </button>
              <button type="button" class="tod-card" :class="{ on: form.prefTod.includes('evening') }" @click="toggleTod('evening')">
                <span class="tod-icon">☾</span>
                <strong>Evening</strong>
                <span>After 5:00 PM</span>
                <span class="check" :class="{ on: form.prefTod.includes('evening') }" />
              </button>
            </div>

            <label class="solo-field">Are there any times you're not available? (Optional)
              <input v-model="form.prefUnavailable" type="text" placeholder="e.g. Fridays after 3pm" />
            </label>
            <label class="solo-field">Any additional notes to help me find the best time?
              <textarea v-model="form.prefNotes" rows="3" placeholder="Anything else that helps with scheduling…" />
            </label>

            <div v-if="selectedSlot" class="picked-slot">
              Time you selected in Step 1: <strong>{{ selectedSlotLabel }}</strong>
            </div>

            <div class="flow-actions">
              <button type="button" class="ghost-btn" @click="step = 1">Back</button>
              <button type="button" class="pb-submit" :disabled="!step2Ready" @click="goCoachStep3">
                Continue to Next Step →
              </button>
            </div>
            <p class="privacy soft">🔒 Your information is secure and will only be used to coordinate your call.</p>
          </div>

          <!-- Step 3: about you (coach-editable questions) -->
          <div v-else class="flow-panel">
            <h3>Step 3 of 3: Share a Little About You</h3>
            <p class="privacy">🔒 Your information is secure and will never be shared.</p>
            <div class="form-grid">
              <label
                v-for="field in enabledStep3Fields"
                :key="field.id"
                :class="{ full: field.type === 'textarea' || field.id === 'referralSource' }"
              >
                {{ field.label }}{{ field.required ? ' *' : '' }}
                <select v-if="field.type === 'select'" v-model="form[field.id]">
                  <option value="">{{ field.placeholder || 'Select one…' }}</option>
                  <option v-for="opt in field.options || []" :key="opt" :value="opt">{{ opt }}</option>
                </select>
                <textarea
                  v-else-if="field.type === 'textarea'"
                  v-model="form[field.id]"
                  rows="3"
                  :maxlength="field.maxLength || 500"
                  :placeholder="field.placeholder || ''"
                />
                <input
                  v-else
                  v-model="form[field.id]"
                  :type="field.type === 'email' || field.type === 'tel' ? field.type : 'text'"
                  :placeholder="field.placeholder || ''"
                />
                <em v-if="field.type === 'textarea'">{{ String(form[field.id] || '').length }}/{{ field.maxLength || 500 }}</em>
              </label>
            </div>
            <p v-if="submitError" class="err">{{ submitError }}</p>
            <div class="flow-actions">
              <button type="button" class="ghost-btn" @click="step = 2">Back</button>
              <button type="button" class="pb-submit" :disabled="submitting" @click="submitBooking">
                {{ submitting ? 'Submitting…' : 'Submit & Complete →' }}
              </button>
            </div>
            <p class="confirm-hint">You'll receive a confirmation email with your selected time and Zoom link.</p>
          </div>
        </section>

        <aside v-if="step === 2" class="pb-summary next">
          <h3>Here's what happens next</h3>
          <ol class="next-list">
            <li><strong>You share your availability.</strong><span>You let me know when you're typically free.</span></li>
            <li><strong>I'll review and reach out.</strong><span>I'll find the best time and send a calendar invite.</span></li>
            <li><strong>We connect.</strong><span>We'll meet for a {{ discoverySettings.discoveryDurationMin || 20 }}-minute discovery call ({{ page.modalityLabel || 'Virtual' }}).</span></li>
          </ol>
          <div class="no-obligation">
            <strong>No Obligation</strong>
            <p>This call is 100% free with no commitment.</p>
          </div>
        </aside>

        <aside v-else-if="step === 3" class="pb-summary">
          <h3>Your Discovery Call</h3>
          <div><span>Selected Time</span><strong>{{ selectedSlotLabel }}</strong></div>
          <div><span>Duration</span><strong>{{ discoverySettings.discoveryDurationMin || 20 }} minutes</strong></div>
          <div><span>Location</span><strong>{{ page.modalityLabel || 'Virtual' }}</strong></div>
          <div><span>Investment</span><strong class="free">100% Free</strong></div>
          <blockquote v-if="page.coachQuote" class="coach-quote">
            “{{ page.coachQuote }}”
            <cite>— {{ providerDisplayName }}</cite>
          </blockquote>
        </aside>
      </div>

      <div class="coach-value-row">
        <div v-for="(vp, i) in activeValueProps" :key="i">
          <strong>{{ vp.title }}</strong>
          <span>{{ vp.body }}</span>
        </div>
      </div>

      <p v-if="isTutoring && !editing" class="pb-eval-link">
        Need a full academic evaluation?
        <button type="button" class="pb-eval-btn" @click="openEvalWizard">Start evaluation booking</button>
      </p>
    </main>

    <PublicBookingWizard
      v-if="evalWizard.open"
      :provider="evalWizard.provider"
      :slot="evalWizard.slot"
      :agency-slug="slug"
      service-type="tutoring"
      @close="closeEvalWizard"
      @submitted="closeEvalWizard"
    />

    <footer class="pb-footer" :class="{ coach: !isConsultant }">
      <div v-if="isConsultant" class="pb-footer-row">
        <div v-for="(vp, i) in page.valueProps" :key="i">
          <strong>{{ vp.title }}</strong>
          <span>{{ vp.body }}</span>
        </div>
      </div>
      <p>© {{ year }} {{ brandName }}. All rights reserved.</p>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import {
  addDaysYmd,
  compactBookingPageForSave,
  formatPriceCents,
  resolveBookingPageSettings,
  resolveDiscoverySettings,
  resolveServiceCatalog,
  startOfWeekMondayYmd
} from '../../utils/practitionerBooking.js';
import { isPractitionerOrgType } from '../../utils/practitionerVertical.js';
import {
  CAREERS_FONT_OPTIONS,
  ensureCareersGoogleFonts,
  resolveCareersFontCss
} from '../../utils/careersAssets.js';
import {
  listPathForServiceType,
  normalizePublicProvider,
  normalizePublicProviders,
  resolvePublicServiceType
} from '../../utils/publicAgencyServices.js';
import PublicBookingWizard from '../../components/publicServices/PublicBookingWizard.vue';

const route = useRoute();
const authStore = useAuthStore();
const slug = computed(() => String(route.params.organizationSlug || '').trim());
const routeProviderId = computed(() => Number(route.params.providerId || 0) || 0);
const serviceType = computed(() =>
  resolvePublicServiceType({
    query: route.query,
    meta: route.meta,
    path: route.path
  })
);
const slotsProgramType = computed(() => {
  const q = String(route.query.programType || '').toUpperCase();
  return q === 'IN_PERSON' ? 'IN_PERSON' : 'VIRTUAL';
});

const loading = ref(true);
const error = ref('');
const agency = ref({ name: '', organizationType: '', logoUrl: null, colorPalette: {} });
const discoverySettings = ref(resolveDiscoverySettings('life_coach'));
const bookingPage = ref(resolveBookingPageSettings('life_coach'));
const editDraft = ref(null);
const editing = ref(false);
const savingEdit = ref(false);
const editError = ref('');
const editOk = ref('');
const canEditBookingPage = ref(false);
const fontOptions = CAREERS_FONT_OPTIONS;
const serviceCatalog = ref([]);
const providers = ref([]);
const provider = ref(null);
const weekStart = ref(startOfWeekMondayYmd(new Date().toISOString().slice(0, 10)));
const slots = ref([]);
const selectedService = ref(null);
const selectedDate = ref('');
const selectedSlot = ref(null);
const step = ref(1);
const submitting = ref(false);
const submitted = ref(false);
const submitError = ref('');
const findingFirst = ref(false);
const firstAvailableHint = ref('');
const evalWizard = ref({ open: false, provider: null, slot: null });
const form = ref({
  name: '',
  email: '',
  phone: '',
  notes: '',
  goals: '',
  referralSource: '',
  prefDays: [],
  prefTod: [],
  prefNotes: '',
  prefUnavailable: ''
});

const prefDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const year = new Date().getFullYear();
const thisWeekStartYmd = startOfWeekMondayYmd(new Date().toISOString().slice(0, 10));

const isConsultant = computed(
  () =>
    serviceType.value === 'consulting' ||
    (agency.value.organizationType === 'consultant' &&
      !['counseling', 'tutoring', 'coaching'].includes(serviceType.value))
);
const isTutoring = computed(() => serviceType.value === 'tutoring');
const bookingMode = computed(() => (isConsultant.value ? 'consultant' : 'life_coach'));
const themeId = computed(() => (isConsultant.value ? 'consultant' : 'life_coach'));
const orgTypeKey = computed(
  () => agency.value.organizationType || (isConsultant.value ? 'consultant' : 'life_coach')
);
const teamFinderPath = computed(() => {
  const s = slug.value;
  if (!s) return '';
  if (serviceType.value === 'counseling') return `/${s}/find-counselor`;
  if (serviceType.value === 'tutoring') return `/${s}/find-tutor`;
  if (serviceType.value === 'coaching') return `/${s}/find-coach`;
  if (serviceType.value === 'consulting') return `/${s}/find-consultant`;
  return `/${s}/services`;
});
const showTeamBack = computed(() => routeProviderId.value > 0 && !!teamFinderPath.value);
const page = computed(() => editDraft.value || bookingPage.value);

const brandName = computed(
  () => page.value.brandDisplayName || agency.value.name || (isConsultant.value ? 'Consulting' : 'Life Coaching')
);
const coachSpecialties = computed(() =>
  Array.isArray(page.value.specialties) ? page.value.specialties.filter(Boolean) : []
);
const activeValueProps = computed(() => {
  if (step.value === 1) return page.value.valuePropsStep1 || [];
  return page.value.valuePropsLater || [];
});
const brandStyle = computed(() => {
  const palette = agency.value.colorPalette || {};
  const pageAccent = String(page.value.accentColor || '').trim();
  const primary = pageAccent || palette.primary || (isConsultant.value ? '#5a32ea' : '#1b4332');
  const secondary = palette.secondary || (isConsultant.value ? '#0a1024' : '#1b4332');
  const accent = palette.accent || primary;
  const bg = page.value.backgroundImageUrl || '';
  const bodyFont = resolveCareersFontCss(page.value.fontFamily) || "'DM Sans', system-ui, sans-serif";
  const headingFont = resolveCareersFontCss(page.value.headingFontFamily) || bodyFont;
  const style = {
    '--pb-accent': primary,
    '--pb-ink': secondary,
    '--pb-accent-soft': accent,
    '--pb-font': bodyFont,
    '--pb-heading-font': headingFont
  };
  if (bg && !isConsultant.value) {
    style['--pb-bg-image'] = `url(${bg})`;
  }
  return style;
});

const coachHeroTitle = computed(() => {
  const titles = page.value.coachHeroTitles || {};
  if (step.value === 1) return titles.step1 || "Let's find a time that works for you";
  if (step.value === 2) return titles.step2 || 'Almost there!';
  return titles.step3 || "You're almost all set!";
});
const coachHeroSub = computed(() => {
  const subs = page.value.coachHeroSubtitles || {};
  if (step.value === 1) return subs.step1 || '';
  if (step.value === 2) return subs.step2 || '';
  return subs.step3 || '';
});

const adminSettingsPath = computed(() => {
  const s = slug.value;
  return s ? `/${encodeURIComponent(s)}/admin/public-services` : '';
});

watch(
  () => [page.value.fontFamily, page.value.headingFontFamily],
  ([body, heading]) => {
    ensureCareersGoogleFonts([body, heading]);
  },
  { immediate: true }
);

const providerDisplayName = computed(() => {
  if (provider.value?.displayName) return provider.value.displayName;
  const f = provider.value?.firstName || provider.value?.first_name || '';
  const l = provider.value?.lastName || provider.value?.last_name || '';
  return `${f} ${l}`.trim() || 'Practitioner';
});
const providerInitials = computed(() =>
  String(providerDisplayName.value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?'
);
const providerBio = computed(
  () =>
    provider.value?.profile?.publicBlurb ||
    provider.value?.serviceFocus ||
    page.value.providerBioFallback ||
    ''
);
const avatarStyle = computed(() => {
  const url = provider.value?.profilePhotoUrl;
  if (!url) return {};
  return { backgroundImage: `url(${url})`, backgroundSize: 'cover', color: 'transparent' };
});

const visibleServices = computed(() => {
  const list = Array.isArray(serviceCatalog.value) ? [...serviceCatalog.value] : [];
  if (!discoverySettings.value.discoveryBookingEnabled) {
    return list.filter((s) => !s.isDiscovery);
  }
  return list;
});

const weekDays = computed(() => {
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const ymd = addDaysYmd(weekStart.value, i);
    const d = new Date(`${ymd}T12:00:00`);
    out.push({
      ymd,
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      hasSlots: (slotsByDate.value[ymd] || []).length > 0
    });
  }
  return out;
});

const slotsByDate = computed(() => {
  const map = {};
  const now = Date.now();
  for (const s of slots.value || []) {
    const startMs = new Date(s.startAt).getTime();
    if (!Number.isFinite(startMs) || startMs < now) continue;
    const ymd = String(s.startAt || '').slice(0, 10);
    if (!ymd) continue;
    if (!map[ymd]) map[ymd] = [];
    map[ymd].push(s);
  }
  return map;
});

const slotsForSelectedDate = computed(() => slotsByDate.value[selectedDate.value] || []);
const weekHasOpenSlots = computed(() => Object.keys(slotsByDate.value).length > 0);

const weekLabel = computed(() => {
  const start = new Date(`${weekStart.value}T12:00:00`);
  const end = new Date(`${addDaysYmd(weekStart.value, 6)}T12:00:00`);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start).replace(/,?\s*\d{4}$/, '')} – ${fmt(end)}`;
});

const selectedSlotLabel = computed(() => {
  if (!selectedSlot.value?.startAt) return '—';
  const d = new Date(selectedSlot.value.startAt);
  return d.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
});

const canGoPrevWeek = computed(() => weekStart.value > thisWeekStartYmd);

const enabledStep3Fields = computed(() =>
  (page.value.step3Fields || []).filter((f) => f && f.enabled !== false)
);

const preferenceReady = computed(
  () => form.value.prefDays.length > 0 && form.value.prefTod.length > 0
);

const step2Ready = computed(() => !!selectedSlot.value && preferenceReady.value);

function iconGlyph(icon) {
  const map = { chart: '📈', group: '👥', gear: '⚙', team: '🏢', chat: '💬' };
  return map[icon] || '•';
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function shiftWeek(dir) {
  const next = addDaysYmd(weekStart.value, dir * 7);
  if (dir < 0 && next < thisWeekStartYmd) return;
  weekStart.value = next;
  selectedSlot.value = null;
  firstAvailableHint.value = '';
  loadSlots();
}

function goThisWeek() {
  weekStart.value = thisWeekStartYmd;
  selectedSlot.value = null;
  firstAvailableHint.value = '';
  loadSlots();
}

async function fetchSlotsForWeek(weekYmd) {
  const res = await api.get(
    `/public/agency-services/${encodeURIComponent(slug.value)}/providers/${provider.value.id}/slots`,
    {
      params: {
        weekStart: weekYmd,
        bookingMode: 'NEW_CLIENT',
        programType: slotsProgramType.value
      },
      skipAuthRedirect: true
    }
  );
  const now = Date.now();
  return (Array.isArray(res.data?.slots) ? res.data.slots : []).filter((s) => {
    const t = new Date(s.startAt).getTime();
    return Number.isFinite(t) && t >= now;
  });
}

async function jumpToFirstAvailable() {
  if (!provider.value?.id || !slug.value) return;
  findingFirst.value = true;
  firstAvailableHint.value = '';
  try {
    let cursor = thisWeekStartYmd;
    for (let i = 0; i < 16; i += 1) {
      const weekSlots = await fetchSlotsForWeek(cursor);
      weekSlots.sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
      if (weekSlots.length) {
        weekStart.value = cursor;
        slots.value = weekSlots;
        const first = weekSlots[0];
        pickCoachSlot(first, String(first.startAt).slice(0, 10));
        firstAvailableHint.value = `First available: ${formatTime(first.startAt)} on ${selectedSlotLabel.value}`;
        return;
      }
      cursor = addDaysYmd(cursor, 7);
    }
    firstAvailableHint.value = 'No open discovery slots found in the next 16 weeks.';
  } catch {
    firstAvailableHint.value = 'Could not search for the next open slot.';
  } finally {
    findingFirst.value = false;
  }
}

function selectDiscoveryService() {
  const disc = visibleServices.value.find((s) => s.isDiscovery);
  if (disc) selectedService.value = disc;
}

function pickCoachSlot(slot, ymd) {
  selectedSlot.value = slot;
  selectedDate.value = ymd;
}

function togglePrefDay(day) {
  const set = new Set(form.value.prefDays);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  form.value.prefDays = [...set];
}

function toggleTod(tod) {
  const set = new Set(form.value.prefTod);
  if (set.has(tod)) set.delete(tod);
  else set.add(tod);
  form.value.prefTod = [...set];
}

function goCoachStep2() {
  if (!selectedSlot.value) return;
  step.value = 2;
}

function goCoachStep3() {
  if (!step2Ready.value) return;
  step.value = 3;
}

async function loadSlots() {
  if (!slug.value || !provider.value?.id) {
    slots.value = [];
    return;
  }
  try {
    const res = await api.get(
      `/public/agency-services/${encodeURIComponent(slug.value)}/providers/${provider.value.id}/slots`,
      {
        params: {
          weekStart: weekStart.value,
          bookingMode: 'NEW_CLIENT',
          programType: slotsProgramType.value
        },
        skipAuthRedirect: true
      }
    );
    slots.value = Array.isArray(res.data?.slots) ? res.data.slots : [];
    if (!selectedDate.value) {
      const first = weekDays.value.find((d) => d.hasSlots);
      if (first) selectedDate.value = first.ymd;
    }
  } catch {
    slots.value = [];
  }
}

async function load() {
  if (!slug.value) return;
  loading.value = true;
  error.value = '';
  try {
    const hubRes = await api.get(`/public/agency-services/${encodeURIComponent(slug.value)}`, {
      skipAuthRedirect: true
    });
    agency.value = hubRes.data?.agency || {};
    const orgType = agency.value.organizationType || (serviceType.value === 'consulting' ? 'consultant' : 'life_coach');
    discoverySettings.value = hubRes.data?.discoverySettings || resolveDiscoverySettings(orgType);
    bookingPage.value = hubRes.data?.bookingPage || resolveBookingPageSettings(orgType);
    for (const field of bookingPage.value.step3Fields || []) {
      if (form.value[field.id] === undefined) form.value[field.id] = '';
    }
    await resolveEditAccess();
    serviceCatalog.value = hubRes.data?.serviceCatalog?.length
      ? hubRes.data.serviceCatalog
      : resolveServiceCatalog(orgType, {
          discoveryBookingEnabled: discoverySettings.value.discoveryBookingEnabled,
          discoveryBookingRequired: discoverySettings.value.discoveryBookingRequired,
          discoveryDurationMin: discoverySettings.value.discoveryDurationMin,
          discoveryLabel: discoverySettings.value.discoveryLabel
        });

    const listPath = listPathForServiceType(serviceType.value);
    const listRes = await api.get(`/public/agency-services/${encodeURIComponent(slug.value)}/${listPath}`, {
      params: {
        bookingMode: 'NEW_CLIENT',
        programType: slotsProgramType.value,
        weekStart: weekStart.value
      },
      skipAuthRedirect: true
    });
    providers.value = normalizePublicProviders(listRes.data?.providers);
    const wantedId = routeProviderId.value;
    provider.value =
      (wantedId
        ? providers.value.find((p) => Number(p.id) === wantedId)
        : null) ||
      providers.value[0] ||
      null;

    if (wantedId && !provider.value) {
      // Fall back to detail endpoint when list filters hide the provider
      try {
        const detailRes = await api.get(
          `/public/agency-services/${encodeURIComponent(slug.value)}/providers/${wantedId}`,
          {
            params: {
              serviceType: serviceType.value,
              bookingMode: 'NEW_CLIENT',
              programType: slotsProgramType.value,
              weekStart: weekStart.value
            },
            skipAuthRedirect: true
          }
        );
        provider.value = normalizePublicProvider({
          ...(detailRes.data?.provider || {}),
          profile: detailRes.data?.profile,
          availability: detailRes.data?.availability
        });
      } catch {
        error.value = 'That provider is not available for booking.';
      }
    }

    if (isConsultant.value) {
      const requiredDiscovery = discoverySettings.value.discoveryBookingRequired;
      if (requiredDiscovery) selectDiscoveryService();
      else selectedService.value = visibleServices.value.find((s) => !s.isDiscovery) || visibleServices.value[0] || null;
    } else {
      selectedService.value = visibleServices.value.find((s) => s.isDiscovery) || visibleServices.value[0] || null;
    }

    await loadSlots();

    const slotStartQ = String(route.query.slotStart || '').trim();
    if (slotStartQ && slots.value.length) {
      const match = slots.value.find((s) => String(s.startAt) === slotStartQ);
      if (match) {
        pickCoachSlot(match, String(match.startAt).slice(0, 10));
        if (!isConsultant.value) step.value = 1;
      }
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load booking page.';
  } finally {
    loading.value = false;
  }
}

async function submitBooking() {
  submitError.value = '';
  if (!provider.value?.id) {
    submitError.value = 'No practitioner is available for booking yet.';
    return;
  }
  if (!selectedSlot.value) {
    submitError.value = 'Please select an available time slot from the calendar (Step 1).';
    return;
  }
  if (!isConsultant.value) {
    for (const field of enabledStep3Fields.value) {
      const val = String(form.value[field.id] ?? '').trim();
      if (field.required && !val) {
        submitError.value = `${field.label} is required.`;
        return;
      }
    }
  } else if (!form.value.name.trim() || !form.value.email.trim()) {
    submitError.value = 'Name and email are required.';
    return;
  }

  submitting.value = true;
  try {
    const parts = String(form.value.name || '').trim().split(/\s+/);
    const first = parts[0] || form.value.name;
    const last = parts.slice(1).join(' ') || '';
    const customAnswers = enabledStep3Fields.value
      .filter((f) => !['name', 'email', 'phone', 'goals', 'notes', 'referralSource'].includes(f.id))
      .map((f) => {
        const val = String(form.value[f.id] || '').trim();
        return val ? `${f.label}: ${val}` : '';
      })
      .filter(Boolean);
    const notesParts = [
      form.value.goals ? `Goals: ${form.value.goals}` : '',
      form.value.notes || '',
      form.value.referralSource ? `Heard about: ${form.value.referralSource}` : '',
      ...customAnswers,
      form.value.prefDays.length
        ? `Preferred days: ${form.value.prefDays.join(', ')}; times: ${form.value.prefTod.join(', ')}`
        : '',
      form.value.prefUnavailable ? `Unavailable: ${form.value.prefUnavailable}` : '',
      form.value.prefNotes ? `Scheduling notes: ${form.value.prefNotes}` : '',
      selectedService.value && !selectedService.value.isDiscovery
        ? `Requested service: ${selectedService.value.name} (${selectedService.value.durationMin} min, ${formatPriceCents(selectedService.value.priceCents)})`
        : 'Requested: Free discovery'
    ].filter(Boolean);

    await api.post(
      `/public/agency-services/${encodeURIComponent(slug.value)}/requests`,
      {
        serviceType: serviceType.value,
        providerId: provider.value.id,
        modality: selectedSlot.value.programType || slotsProgramType.value || 'VIRTUAL',
        bookingMode: 'NEW_CLIENT',
        programType: selectedSlot.value.programType || slotsProgramType.value || 'VIRTUAL',
        startAt: selectedSlot.value.startAt,
        endAt: selectedSlot.value.endAt,
        name: form.value.name,
        email: form.value.email,
        phone: form.value.phone || null,
        clientFullName: form.value.name,
        guardianFirstName: first,
        guardianLastName: last || null,
        guardianEmail: form.value.email,
        guardianPhone: form.value.phone || null,
        guardianRelationship: 'Self / Contact',
        notes: notesParts.join('\n')
      },
      { skipAuthRedirect: true }
    );
    submitted.value = true;
  } catch (e) {
    submitError.value = e.response?.data?.error?.message || e.message || 'Could not submit booking.';
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (authStore.isAuthenticated) {
    try {
      await authStore.refreshUser();
    } catch {
      // best effort
    }
  }
  await load();
});

watch(
  () => [
    String(route.params.providerId || ''),
    String(route.query.serviceType || ''),
    String(route.query.slotStart || '')
  ],
  async (curr, prev) => {
    if (!prev || curr.join('|') === prev.join('|')) return;
    if (!slug.value) return;
    await load();
  }
);

function openEvalWizard() {
  if (!provider.value) return;
  evalWizard.value = {
    open: true,
    provider: provider.value,
    slot: selectedSlot.value || provider.value?.availability?.slots?.[0] || null
  };
}

function closeEvalWizard() {
  evalWizard.value = { open: false, provider: null, slot: null };
}

async function resolveEditAccess() {
  canEditBookingPage.value = false;
  if (!authStore.isAuthenticated) return;
  const agencyId = Number(agency.value.id || 0);
  if (!agencyId) return;
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'support') {
    canEditBookingPage.value = true;
    return;
  }
  if (['provider', 'provider_plus', 'client_guardian', 'kiosk'].includes(role)) {
    canEditBookingPage.value = false;
    return;
  }
  const orgType = agency.value.organizationType || orgTypeKey.value;
  // Team / agency admins can edit booking copy for clinical & tutoring tenants.
  if (!isPractitionerOrgType(orgType)) {
    if (['admin', 'agency_admin', 'staff'].includes(role)) {
      canEditBookingPage.value = true;
    }
    return;
  }
  try {
    const res = await api.get('/practitioner-team/me', {
      params: { agencyId },
      skipGlobalLoading: true
    });
    canEditBookingPage.value = !!res.data?.isOwner;
  } catch {
    canEditBookingPage.value = false;
  }
}

function startEdit() {
  const orgType = orgTypeKey.value;
  editDraft.value = resolveBookingPageSettings(orgType, {
    ...bookingPage.value,
    coachHeroTitles: { ...(bookingPage.value.coachHeroTitles || {}) },
    coachHeroSubtitles: { ...(bookingPage.value.coachHeroSubtitles || {}) },
    navLinks: (bookingPage.value.navLinks || []).map((l) => ({ ...l })),
    consultantBenefits: [...(bookingPage.value.consultantBenefits || [])],
    specialties: [...(bookingPage.value.specialties || [])],
    step3Fields: (bookingPage.value.step3Fields || []).map((f) => ({ ...f, options: [...(f.options || [])] }))
  });
  if (!editDraft.value.consultantBenefits.length && isConsultant.value) {
    editDraft.value.consultantBenefits = ['', '', ''];
  }
  editing.value = true;
  editError.value = '';
  editOk.value = '';
}

function cancelEdit() {
  editing.value = false;
  editDraft.value = null;
  editError.value = '';
  editOk.value = '';
}

async function saveEdit() {
  const agencyId = Number(agency.value.id || 0);
  if (!agencyId || !editDraft.value) return;
  savingEdit.value = true;
  editError.value = '';
  editOk.value = '';
  try {
    const payload = compactBookingPageForSave(orgTypeKey.value, editDraft.value);
    await api.put(`/agencies/${agencyId}`, { publicBookingSettings: payload });
    bookingPage.value = resolveBookingPageSettings(orgTypeKey.value, payload);
    editing.value = false;
    editDraft.value = null;
    editOk.value = 'Saved';
    setTimeout(() => {
      editOk.value = '';
    }, 2500);
  } catch (e) {
    editError.value = e?.response?.data?.error?.message || e.message || 'Could not save';
  } finally {
    savingEdit.value = false;
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap');

.pb {
  --accent: var(--pb-accent, #5a32ea);
  --ink: var(--pb-ink, #0a1024);
  --surface: #f3f4f6;
  --card: #fff;
  min-height: 100vh;
  background: var(--surface);
  color: #111827;
  font-family: var(--pb-font, 'DM Sans', system-ui, sans-serif);
}
.pb h1, .pb h2, .pb h3 {
  font-family: var(--pb-heading-font, var(--pb-font, 'DM Sans', system-ui, sans-serif));
}
.pb--editing {
  padding-bottom: 160px;
}
.pb-editor-bar {
  position: fixed;
  left: 12px;
  right: 12px;
  bottom: 12px;
  z-index: 60;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 16px;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 14px;
  box-shadow: 0 16px 40px -18px rgba(15, 23, 42, 0.65);
  max-height: min(42vh, 340px);
  overflow: auto;
}
.pb-editor-bar--active { background: #14532d; }
.pb-editor-hint {
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-right: 4px;
}
.pb-editor-btn {
  border: 1px solid rgba(248, 250, 252, 0.35);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.pb-editor-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.pb-editor-btn--primary { background: #fff; color: #0f172a; border-color: #fff; }
.pb-editor-bar--active .pb-editor-btn--primary {
  background: #bbf7d0;
  color: #14532d;
  border-color: #bbf7d0;
}
.pb-editor-link {
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 600;
  margin-left: auto;
  text-decoration: none;
}
.pb-editor-error { flex-basis: 100%; margin: 0; color: #fecaca; font-size: 0.82rem; }
.pb-editor-ok { flex-basis: 100%; margin: 0; color: #bbf7d0; font-size: 0.82rem; }
.pb-style-strip {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(248, 250, 252, 0.18);
}
.pb-style-field {
  display: inline-flex;
  flex-direction: column;
  gap: 3px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #cbd5e1;
}
.pb-style-field--grow { flex: 1 1 220px; min-width: 180px; }
.pb-style-select,
.pb-style-input {
  border: 1px solid rgba(248, 250, 252, 0.28);
  background: rgba(15, 23, 42, 0.35);
  color: #f8fafc;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 0.8rem;
  min-width: 110px;
}
.pb-style-color {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid rgba(248, 250, 252, 0.28);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.pb-inline-input {
  border: 1px dashed rgba(15, 23, 42, 0.25);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  font: inherit;
  color: inherit;
  width: min(100%, 28rem);
}
.pb-inline-input--wide { width: min(100%, 36rem); }
.pb-inline-input--hero {
  width: min(100%, 40rem);
  font-size: inherit;
  font-weight: inherit;
}
.pb-inline-input--area {
  width: min(100%, 40rem);
  resize: vertical;
}
.pb-cta-edit {
  max-width: 12rem;
  border-radius: 999px;
}
.pb-nav-edit { display: inline-flex; }
.pb[data-theme='life_coach'] {
  --accent: var(--pb-accent, #1b4332);
  --ink: var(--pb-ink, #1b4332);
  --surface: #f4f6f4;
  background-color: #eef2ef;
  background-image:
    linear-gradient(180deg, rgba(238, 242, 239, 0.55) 0%, rgba(244, 246, 244, 0.92) 42%, #f4f6f4 70%),
    var(--pb-bg-image, url('https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=1800&q=60'));
  background-size: cover;
  background-position: center top;
  background-attachment: fixed;
}
.pb-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 6px;
  background: #fff;
}
.pb-hero--consultant {
  background: linear-gradient(135deg, var(--pb-ink, #0a1024), color-mix(in srgb, var(--pb-accent, #5a32ea) 55%, #0a1024) 70%);
  color: #fff;
  padding: 1.25rem 1.5rem 2.5rem;
}
.pb-hero--coach {
  padding: 0.85rem 1.5rem 1.75rem;
}
.coach-nav {
  max-width: 1180px;
  margin: 0 auto 1.35rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(27, 67, 50, 0.1);
  border-radius: 16px;
  padding: 0.65rem 0.85rem;
  backdrop-filter: blur(8px);
}
.coach-nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.84rem;
  font-weight: 600;
  color: #334155;
}
.coach-nav-links a { color: inherit; text-decoration: none; }
.coach-nav-links a:hover { color: var(--accent); }
.pb-team-back {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0.5rem 1.5rem 0;
}
.pb-team-back a {
  color: inherit;
  opacity: 0.85;
  font-size: 0.9rem;
  text-decoration: none;
}
.pb-team-back a:hover { opacity: 1; text-decoration: underline; }
.pb-eval-link {
  max-width: 1100px;
  margin: 1.5rem auto 0;
  padding: 0 1.5rem;
  text-align: center;
  font-size: 0.95rem;
  color: #475569;
}
.pb-eval-btn {
  margin-left: 0.35rem;
  border: none;
  background: none;
  color: var(--pb-accent, #1b4332);
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
.pb-hero-bar {
  max-width: 1180px;
  margin: 0 auto 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pb-brand {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-size: 0.8rem;
  color: var(--ink);
}
.pb-brand.coach { text-transform: none; letter-spacing: 0; font-size: 0.92rem; }
.pb-mark { color: #a78bfa; display: grid; }
.pb-mark.coach { color: #c4a574; }
.pb-signin, .pb-cta-pill {
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: 999px;
  padding: 0.45rem 1rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}
.pb[data-theme='consultant'] .pb-signin {
  background: #fff;
  color: #111;
  border: 1px solid rgba(255,255,255,0.45);
}
.pb-hero-copy { max-width: 1180px; margin: 0 auto; }
.pb-hero-copy h1 { margin: 0 0 0.4rem; font-size: clamp(1.6rem, 3vw, 2.4rem); }
.pb-hero-copy.coach h1 {
  font-family: Fraunces, Georgia, serif;
  color: var(--ink);
  font-weight: 600;
  letter-spacing: -0.02em;
}
.pb-hero-copy.coach p { color: #475569; max-width: 46rem; line-height: 1.5; }
.pb-eyebrow {
  color: var(--accent);
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.72rem;
  margin-bottom: 0.35rem;
}
.pb-benefits { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; opacity: 0.92; font-size: 0.9rem; }
.pb-steps {
  max-width: 1180px;
  margin: 1.35rem auto 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}
.pb-step {
  display: flex;
  gap: 0.65rem;
  align-items: flex-start;
  background: rgba(255,255,255,0.88);
  border-radius: 14px;
  padding: 0.75rem;
  border: 1px solid rgba(27,67,50,0.1);
}
.pb-step .n {
  width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center;
  background: #d1d5db; color: #111; font-weight: 800; font-size: 0.8rem; flex-shrink: 0;
}
.pb-step.active .n, .pb-step.done .n { background: var(--accent); color: #fff; }
.pb-step strong { display: block; font-size: 0.85rem; color: var(--ink); }
.pb-step span { font-size: 0.72rem; color: #64748b; }

.pb-main {
  max-width: 1180px;
  margin: -1.25rem auto 2rem;
  display: grid;
  gap: 1rem;
  padding: 0 1.25rem;
}
.pb-main.consultant { grid-template-columns: 280px 1fr 1.1fr; }

.coach-shell {
  max-width: 1180px;
  margin: 0 auto 2rem;
  padding: 0 1.25rem;
}
.coach-card {
  display: grid;
  grid-template-columns: 250px minmax(0, 1.5fr);
  gap: 0;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 22px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.1);
  border: 1px solid rgba(27, 67, 50, 0.08);
  overflow: hidden;
}
.coach-card[data-step='2'],
.coach-card[data-step='3'] {
  grid-template-columns: 240px minmax(0, 1.35fr) 240px;
}
.coach-card > .pb-profile,
.coach-card > .pb-flow,
.coach-card > .pb-summary {
  background: transparent;
  box-shadow: none;
  border-radius: 0;
}
.coach-card > .pb-profile {
  border-right: 1px solid #e8eee9;
  padding: 1.35rem 1.15rem;
}
.coach-card > .pb-flow { padding: 1.35rem 1.25rem; }
.coach-card > .pb-summary {
  border-left: 1px solid #e8eee9;
  padding: 1.35rem 1.1rem;
  background: #f7faf8;
}

.pb-profile, .pb-services, .pb-calendar, .pb-flow, .pb-summary {
  background: var(--card);
  border-radius: 18px;
  padding: 1.15rem;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}
.avatar {
  width: 88px; height: 88px; border-radius: 999px; background: #95b8a3; color: #fff;
  display: grid; place-items: center; font-weight: 800; font-size: 1.4rem; margin-bottom: 0.75rem;
}
.pb-profile h2 { margin: 0; color: var(--ink); font-size: 1.15rem; }
.pb-profile .title { color: #64748b; margin: 0.15rem 0 0.65rem; }
.pb-profile .bio { font-size: 0.9rem; color: #334155; line-height: 1.45; }
.specialties {
  list-style: none; padding: 0; margin: 0.85rem 0;
  display: grid; gap: 0.35rem; font-size: 0.82rem; color: #334155;
}
.stats, .coach-meta { list-style: none; padding: 0; margin: 1rem 0; display: grid; gap: 0.55rem; }
.stats li strong, .coach-meta li { display: flex; gap: 0.45rem; align-items: flex-start; font-size: 0.88rem; color: #1f2937; }
.stats li span { color: #64748b; font-size: 0.75rem; }
.mi { width: 1.1rem; text-align: center; }
blockquote {
  margin: 1rem 0 0; padding: 0.75rem; border-radius: 12px; background: rgba(90,50,234,0.08);
  font-size: 0.85rem; color: #4c1d95;
}
.linkish { background: none; border: none; color: var(--accent); font-weight: 700; cursor: pointer; padding: 0; }
.expect {
  margin-top: 1rem; padding: 0.75rem; border-radius: 12px; background: rgba(27,67,50,0.07);
  font-size: 0.85rem;
}
.expect strong { display: block; margin-bottom: 0.25rem; color: var(--ink); }
.expect p { margin: 0; color: #475569; line-height: 1.45; }

.pb-services h3, .pb-calendar h3, .flow-panel h3 {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  color: var(--ink);
  font-family: Fraunces, Georgia, serif;
  font-weight: 600;
}
.svc-card {
  position: relative; width: 100%; text-align: left; border: 1px solid #e5e7eb; border-radius: 14px;
  padding: 0.85rem; margin-bottom: 0.55rem; background: #fff; cursor: pointer;
}
.svc-card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(90,50,234,0.15); }
.svc-card.free .svc-price { color: #059669; }
.svc-top { display: flex; justify-content: space-between; }
.svc-name { font-weight: 800; margin-top: 0.25rem; }
.svc-meta { font-size: 0.75rem; color: #64748b; }
.svc-card p { margin: 0.35rem 0 0; font-size: 0.82rem; color: #475569; }
.radio {
  position: absolute; right: 0.85rem; bottom: 0.85rem; width: 16px; height: 16px; border-radius: 999px;
  border: 2px solid #cbd5e1;
}
.radio.on { border-color: var(--accent); background: radial-gradient(circle at center, var(--accent) 45%, transparent 48%); }

.tz, .hint, .muted, .confirm-hint { font-size: 0.8rem; color: #64748b; margin: 0 0 0.75rem; }
.field-label { font-size: 0.86rem; font-weight: 700; color: #334155; margin: 0.85rem 0 0.45rem; }
.cal-nav { display: flex; align-items: center; gap: 0.5rem; margin: 0.35rem 0 0.55rem; flex-wrap: wrap; }
.cal-nav button:disabled { opacity: 0.35; cursor: not-allowed; }
.ghost.accent {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}
.empty-week {
  margin: 0.75rem 0;
  padding: 0.85rem;
  border-radius: 12px;
  background: #f7faf8;
  color: #475569;
  font-size: 0.86rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  align-items: center;
}
.cal-nav button, .ghost-btn, .ghost {
  border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 0.3rem 0.55rem; cursor: pointer;
}
.day-pills { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem; }
.day-pill {
  border: 1px solid #e5e7eb; background: #fff; border-radius: 12px; padding: 0.4rem 0.55rem; min-width: 3.2rem;
  display: grid; place-items: center; cursor: pointer;
}
.day-pill span { font-size: 0.65rem; color: #64748b; }
.day-pill.selected { background: var(--accent); color: #fff; border-color: var(--accent); }
.day-pill.selected span { color: rgba(255,255,255,0.85); }
.day-pill.disabled { opacity: 0.4; cursor: not-allowed; }
.slot-grid { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.week-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.4rem; }
.week-col { display: flex; flex-direction: column; gap: 0.3rem; }
.week-col-head { text-align: center; font-size: 0.72rem; font-weight: 700; color: #64748b; }
.week-col-head span { display: block; color: #111; font-size: 0.95rem; }
.slot {
  border: 1.5px solid #c5d4cb; background: #fff; border-radius: 10px; padding: 0.45rem 0.65rem; cursor: pointer; font-size: 0.85rem; color: var(--accent);
}
.slot.slim { padding: 0.4rem 0.2rem; font-size: 0.72rem; font-weight: 600; }
.slot.selected { background: var(--accent); color: #fff; border-color: var(--accent); }
.dash { text-align: center; color: #cbd5e1; padding: 0.35rem 0; }
.request-alt {
  margin-top: 1rem;
  border: 1px dashed #b7c9bd;
  background: #f7faf8;
  color: var(--accent);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  font-weight: 600;
  font-size: 0.86rem;
}
.contact-box { margin-top: 1rem; border-top: 1px solid #e5e7eb; padding-top: 0.85rem; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
.form-grid label, .solo-field {
  display: grid; gap: 0.25rem; font-size: 0.78rem; font-weight: 700; color: #475569;
}
.solo-field { margin-top: 0.75rem; }
.form-grid label.full { grid-column: 1 / -1; }
.form-grid input, .form-grid textarea, .form-grid select, .solo-field input, .solo-field textarea {
  width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 0.5rem 0.65rem; font: inherit; font-weight: 500;
  background: #fff;
}
.form-grid em { font-style: normal; color: #94a3b8; font-weight: 500; font-size: 0.7rem; }
.free-note, .free { color: #059669; font-weight: 800; }
.pb-submit {
  margin-top: 0; background: var(--accent); color: #fff; border: none; border-radius: 12px;
  padding: 0.7rem 1rem; font-weight: 800; cursor: pointer;
}
.pb-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.err { color: #b91c1c; font-size: 0.85rem; }
.warn { color: #92400e; background: #fffbeb; border-radius: 10px; padding: 0.55rem 0.7rem; font-size: 0.8rem; }
.flow-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; gap: 0.75rem; }
.day-toggles { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.day-toggles button {
  border: 1.5px solid #c5d4cb; background: #fff; border-radius: 12px; padding: 0.45rem 0.7rem;
  cursor: pointer; font-weight: 700; color: var(--accent); min-width: 3.2rem;
}
.day-toggles button.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.tod-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}
.tod-card {
  text-align: left;
  border: 1.5px solid #d1d5db;
  background: #fff;
  border-radius: 14px;
  padding: 0.75rem;
  cursor: pointer;
  display: grid;
  gap: 0.15rem;
  position: relative;
}
.tod-card.on { border-color: var(--accent); background: #f3f8f5; }
.tod-card .tod-icon { font-size: 1.1rem; }
.tod-card strong { color: var(--ink); font-size: 0.9rem; }
.tod-card span { font-size: 0.72rem; color: #64748b; }
.tod-card .check {
  position: absolute; right: 0.65rem; bottom: 0.65rem;
  width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #cbd5e1; background: #fff;
}
.tod-card .check.on { background: var(--accent); border-color: var(--accent); }
.picked-slot {
  margin-top: 0.85rem;
  font-size: 0.84rem;
  color: #334155;
  background: #f7faf8;
  border-radius: 10px;
  padding: 0.55rem 0.7rem;
}
.privacy {
  background: rgba(27,67,50,0.08); color: var(--accent); border-radius: 10px;
  padding: 0.55rem 0.7rem; font-size: 0.8rem; font-weight: 600;
}
.privacy.soft { margin-top: 0.85rem; background: transparent; padding: 0; font-weight: 500; color: #64748b; }
.pb-summary h3 {
  margin: 0 0 0.85rem;
  font-size: 1rem;
  font-family: Fraunces, Georgia, serif;
  color: var(--ink);
}
.pb-summary div {
  display: grid;
  gap: 0.15rem;
  margin-bottom: 0.75rem;
  font-size: 0.86rem;
}
.pb-summary div span { color: #64748b; font-size: 0.75rem; }
.next-list {
  list-style: none; padding: 0; margin: 0 0 1rem; display: grid; gap: 0.85rem;
}
.next-list li { display: grid; gap: 0.15rem; }
.next-list strong { font-size: 0.86rem; color: var(--ink); }
.next-list span { font-size: 0.78rem; color: #64748b; line-height: 1.4; }
.no-obligation {
  background: rgba(27, 67, 50, 0.08);
  border-radius: 12px;
  padding: 0.75rem;
}
.no-obligation strong { display: block; color: var(--accent); margin-bottom: 0.2rem; }
.no-obligation p { margin: 0; font-size: 0.8rem; color: #475569; }
.coach-quote {
  margin: 1rem 0 0;
  padding: 0.85rem;
  border-radius: 12px;
  background: #eef4f0;
  color: #334155;
  font-size: 0.82rem;
  line-height: 1.45;
  font-style: italic;
}
.coach-quote cite {
  display: block;
  margin-top: 0.45rem;
  font-style: normal;
  font-weight: 700;
  font-size: 0.75rem;
  color: var(--accent);
}
.coach-value-row {
  margin-top: 1.15rem;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.85rem;
}
.coach-value-row > div {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(27, 67, 50, 0.08);
  border-radius: 14px;
  padding: 0.85rem 1rem;
}
.coach-value-row strong { display: block; color: var(--ink); margin-bottom: 0.25rem; font-size: 0.9rem; }
.coach-value-row span { font-size: 0.8rem; color: #64748b; line-height: 1.4; }

.pb-state { max-width: 720px; margin: 2rem auto; padding: 1.5rem; text-align: center; background: rgba(255,255,255,0.92); border-radius: 16px; }
.pb-state.error { color: #b91c1c; }
.pb-footer { padding: 1.5rem; text-align: center; color: #64748b; font-size: 0.8rem; }
.pb-footer.coach { background: transparent; }
.pb-footer-row {
  max-width: 1180px; margin: 0 auto 1rem; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; text-align: left;
}
.pb-footer-row strong { display: block; color: #334155; }
.pb[data-theme='consultant'] .pb-footer { background: #0a1024; color: #94a3b8; }
.pb[data-theme='consultant'] .pb-footer-row strong { color: #e2e8f0; }

@media (max-width: 980px) {
  .pb-main.consultant, .pb-steps, .pb-footer-row, .coach-value-row, .tod-cards { grid-template-columns: 1fr; }
  .coach-card,
  .coach-card[data-step='2'],
  .coach-card[data-step='3'] { grid-template-columns: 1fr; }
  .coach-card > .pb-profile,
  .coach-card > .pb-summary { border: none; border-bottom: 1px solid #e8eee9; }
  .coach-nav-links { display: none; }
  .week-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
