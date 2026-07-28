<template>
  <div class="pyu" :style="brandStyle">
    <div class="pyu__bg" aria-hidden="true" />
    <div v-if="loading" class="pyu__loading">Loading your Year Update…</div>
    <div v-else-if="error" class="pyu__error">
      <p>{{ error }}</p>
      <button type="button" class="btn btn-secondary" @click="load">Retry</button>
    </div>
    <template v-else-if="payload">
      <div class="pyu__header-shell">
        <div class="pyu__accent" aria-hidden="true" />
        <div class="pyu__top-inner">
          <header class="pyu__top">
            <div class="pyu__brand-block">
              <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" class="pyu__logo" />
              <div class="pyu__brand-copy">
                <span class="pyu__brand-name">{{ tenantName }}</span>
                <span class="pyu__brand-year">{{ schoolYearDisplay }}</span>
              </div>
            </div>
            <div class="pyu__title-block">
              <h1>Provider Year Update</h1>
              <p class="pyu__sub">
                The school year is quickly approaching! Complete each section below — your progress is saved as you go.
              </p>
            </div>
            <div class="pyu__user-block">
              <p class="pyu__help">Questions? Contact your {{ tenantName }} team.</p>
              <div v-if="providerLabel" class="pyu__user-chip">
                <span class="pyu__avatar">{{ providerInitials }}</span>
                <span>{{ providerLabel }}</span>
              </div>
              <div class="pyu__progress-wrap">
                <div class="pyu__progress-label">{{ progressPct }}% complete</div>
                <div class="pyu__progress-bar"><span :style="{ width: progressPct + '%' }" /></div>
                <p v-if="isFinalized" class="pyu__finalized">Completed {{ formatDt(payload.cycle?.finalizedAt) }}</p>
              </div>
            </div>
          </header>
        </div>
      </div>

      <div class="pyu__layout">
        <nav class="pyu__nav" aria-label="Year update sections">
          <button
            v-for="meta in sectionMeta"
            :key="meta.key"
            type="button"
            class="pyu__nav-item"
            :class="{ active: activeSection === meta.key, done: sectionDone(meta.key) }"
            @click="activeSection = meta.key"
          >
            <span class="pyu__nav-dot" />
            <span>
              <strong>{{ meta.shortTitle }}</strong>
              <small>{{ meta.hint }}</small>
            </span>
          </button>
          <button
            v-if="!isFinalized"
            type="button"
            class="btn btn-primary pyu__finalize"
            :disabled="finalizeBusy || !allSectionsDone"
            @click="finalize"
          >
            {{ finalizeBusy ? 'Submitting…' : 'Mark Year Update complete' }}
          </button>
          <p v-if="!allSectionsDone && !isFinalized" class="muted tiny">Complete all sections to finalize.</p>
        </nav>

        <main class="pyu__main">
          <!-- Reminders -->
          <section v-if="activeSection === 'reminders'" class="pyu__panel">
            <h2>Step-by-Step Reminders</h2>
            <p class="muted">The school year is quickly approaching! Read each item and attest that you understand before moving on.</p>
            <div class="pyu__reminder-list">
              <article
                v-for="(item, idx) in reminderItems"
                :key="item.key"
                class="pyu__reminder-card"
                :class="reminderCardClass(item)"
                :style="reminderAccentStyle(idx, item)"
              >
                <div class="pyu__reminder-step" aria-hidden="true">{{ idx + 1 }}</div>
                <div class="pyu__reminder-content">
                  <div class="pyu__reminder-head">
                    <h3 class="pyu__reminder-title">{{ item.title }}</h3>
                    <div class="pyu__reminder-badges">
                      <span class="pill" :class="reminderReviewPillClass(item)">
                        {{ reminderReviewLabel(item) }}
                      </span>
                      <span v-if="item.mode === 'complete'" class="pill" :class="reminderCompletePillClass(item)">
                        {{ reminderCompleteLabel(item) }}
                      </span>
                    </div>
                  </div>
                  <p class="pyu__reminder-text">{{ item.body }}</p>
                  <div class="pyu__reminder-actions">
                    <label v-if="item.mode === 'reviewed' || item.mode === 'complete'" class="pyu__reminder-check">
                      <input
                        type="checkbox"
                        :checked="item.reviewed || item.completed"
                        :disabled="isFinalized"
                        @change="toggleReminder(item, 'reviewed', $event.target.checked)"
                      />
                      <span>{{ reminderCheckLabel(item) }}</span>
                    </label>
                    <label v-if="item.mode === 'complete'" class="pyu__reminder-check">
                      <input
                        type="checkbox"
                        :checked="item.completed"
                        :disabled="isFinalized"
                        @change="toggleReminder(item, 'completed', $event.target.checked)"
                      />
                      <span>Marked complete</span>
                    </label>
                  </div>
                </div>
              </article>
            </div>
            <div class="pyu__section-actions">
              <button type="button" class="btn btn-primary" :disabled="isFinalized || saving" @click="completeReminders">
                {{ remindersSectionComplete ? 'Reminders saved ✓' : 'Save & mark reminders complete' }}
              </button>
            </div>
          </section>

          <!-- School events -->
          <section v-else-if="activeSection === 'school_events'" class="pyu__panel">
            <h2>School Events</h2>
            <p class="muted">
              Back-to-school events for each of your assigned schools. Events refresh when you open this page.
              <template v-if="props.mode === 'token'">
                Sign-up and adding events are available after signing in to My Dashboard.
              </template>
            </p>
            <div class="pyu__info">
              <strong>Kiosk check-in / out:</strong>
              <a :href="kioskUrl" target="_blank" rel="noopener">{{ kioskUrl }}</a>
            </div>

            <div v-for="school in eventsBySchool" :key="school.schoolOrganizationId" class="pyu__school-block">
              <div class="pyu__school-head">
                <h3>{{ school.schoolName }}</h3>
                <button
                  v-if="props.mode !== 'token' && !school.hasBackToSchool"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  :disabled="isFinalized"
                  @click="openAddEvent(school)"
                >
                  + Add Back-to-School Event
                </button>
              </div>

              <template v-if="school.hasBackToSchool">
                <ul class="pyu__event-list">
                  <li v-for="ev in school.backToSchoolEvents || []" :key="ev.id" class="pyu__event-row">
                    <div class="pyu__event-copy">
                      <strong>{{ ev.title || 'Back to School' }}</strong>
                      <span class="muted"> · {{ formatEventWhen(ev) }}</span>
                      <div class="tiny">{{ staffingStatusLabel(ev) }}</div>
                      <div
                        v-if="eventSessions(ev).length > 1 && canRequestToWork(ev) && props.mode !== 'token'"
                        class="pyu__event-session-pick"
                      >
                        <label class="tiny">
                          Session
                          <select
                            class="pyu__event-session-select"
                            :value="selectedSessionId(ev)"
                            :disabled="isFinalized"
                            @change="setSelectedSession(ev, Number($event.target.value))"
                          >
                            <option
                              v-for="sess in eventSessions(ev)"
                              :key="sess.sessionDateId"
                              :value="sess.sessionDateId"
                            >
                              {{ formatSessionWhen(sess) }}
                            </option>
                          </select>
                        </label>
                      </div>
                    </div>
                    <button
                      v-if="canRequestToWork(ev) && props.mode !== 'token'"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="isFinalized || signingUpId === ev.id"
                      @click="signUpForEvent(ev)"
                    >
                      {{ signingUpId === ev.id ? 'Requesting…' : 'Request to work' }}
                    </button>
                    <span v-else class="pill">{{ staffingStatusShort(ev) }}</span>
                  </li>
                </ul>
              </template>
              <template v-else>
                <p class="muted">No back-to-school event on file for this school yet.</p>
                <label class="pyu__check">
                  <input
                    type="checkbox"
                    :checked="Boolean(unknownBts[school.schoolOrganizationId])"
                    :disabled="isFinalized"
                    @change="toggleUnknownBts(school, $event.target.checked)"
                  />
                  I do not know the date, time, etc. of the school event. I understand that it is important to work the back to school event for my assigned schools.
                </label>
              </template>
            </div>

            <div class="pyu__section-actions">
              <button type="button" class="btn btn-primary" :disabled="isFinalized || saving" @click="saveEventsSection">
                Mark events section complete
              </button>
              <button
                v-if="props.mode !== 'token'"
                type="button"
                class="btn btn-secondary"
                :disabled="saving"
                @click="saveAndExit('school_events')"
              >
                Save &amp; exit
              </button>
            </div>
          </section>

          <!-- Materials -->
          <section v-else-if="activeSection === 'materials'" class="pyu__panel">
            <h2>Materials Request</h2>
            <p class="muted">School cart response is required. All gear answers sync to your profile gear &amp; inventory when you save.</p>

            <fieldset class="pyu__fieldset" :disabled="isFinalized">
              <legend>School Cart <span class="req">*</span></legend>
              <p v-if="gearStatusHint('school_cart')" class="pyu__gear-hint">{{ gearStatusHint('school_cart') }}</p>
              <label class="pyu__radio">
                <input v-model="materialsForm.school_cart" type="radio" value="need" />
                I do need a school cart for this school year
              </label>
              <label class="pyu__radio">
                <input v-model="materialsForm.school_cart" type="radio" value="do_not_need" />
                I do not need a school cart for this school year
              </label>
              <p class="pyu__disclaimer">{{ schoolCartDisclaimer }}</p>
            </fieldset>

            <fieldset class="pyu__fieldset" :disabled="isFinalized">
              <legend>Office access</legend>
              <p class="muted tiny">Synced to your profile gear &amp; inventory when you save.</p>
              <p v-if="gearStatusHint('office_key')" class="pyu__gear-hint">{{ gearStatusHint('office_key') }}</p>
              <p class="pyu__field-label">Do you have an office key?</p>
              <label class="pyu__radio">
                <input v-model="materialsForm.has_office_key" type="radio" value="yes" />
                Yes, I have an office key
              </label>
              <label class="pyu__radio">
                <input v-model="materialsForm.has_office_key" type="radio" value="no" />
                No, I need an office key
              </label>
            </fieldset>

            <fieldset class="pyu__fieldset" :disabled="isFinalized">
              <legend>Name tags &amp; cards</legend>
              <p class="muted tiny">Synced to your profile gear &amp; inventory when you save.</p>

              <template v-for="block in nameTagGearBlocks" :key="block.key">
                <p v-if="gearStatusHint(block.key)" class="pyu__gear-hint">{{ gearStatusHint(block.key) }}</p>
                <p class="pyu__field-label">{{ block.question }}</p>
                <label class="pyu__radio">
                  <input v-model="materialsForm[block.hasField]" type="radio" value="yes" />
                  Yes, I have one
                </label>
                <label class="pyu__radio">
                  <input v-model="materialsForm[block.hasField]" type="radio" value="no" />
                  No, I need one
                </label>
                <div v-if="materialsForm[block.hasField] === 'no' && block.nested" class="pyu__nested">
                  <label v-for="field in block.nested" :key="field.model" class="field">
                    <span>{{ field.label }}</span>
                    <input
                      v-model="materialsForm[field.model]"
                      type="text"
                      :placeholder="field.placeholder || ''"
                    />
                  </label>
                </div>
              </template>
            </fieldset>

            <fieldset class="pyu__fieldset" :disabled="isFinalized">
              <legend>Apparel &amp; bag</legend>
              <p class="muted tiny">Synced to your profile gear &amp; inventory when you save.</p>
              <p v-if="gearStatusHint('shirt')" class="pyu__gear-hint">{{ gearStatusHint('shirt') }}</p>
              <p class="pyu__field-label">Do you have an ITSCO shirt?</p>
              <label class="pyu__radio">
                <input v-model="materialsForm.has_shirt" type="radio" value="yes" />
                Yes, I already have a shirt
              </label>
              <label class="pyu__radio">
                <input v-model="materialsForm.has_shirt" type="radio" value="no" />
                No, I need a shirt
              </label>
              <div v-if="materialsForm.has_shirt === 'no'" class="pyu__nested">
                <p class="muted tiny">{{ shirtInventoryLabel }}</p>
                <label v-if="shirtInventory?.isGendered" class="field"><span>Cut</span>
                  <select v-model="materialsForm.shirt_gender">
                    <option value="">Select…</option>
                    <option v-for="g in shirtGenders" :key="g.value" :value="g.value">{{ g.label }}</option>
                  </select>
                </label>
                <label class="field"><span>Preferred size</span>
                  <select v-model="materialsForm.shirt_size" :disabled="shirtInventory?.isGendered && !materialsForm.shirt_gender">
                    <option value="">Select…</option>
                    <option v-for="sz in shirtSizesForForm" :key="sz" :value="sz">
                      {{ sz }}{{ shirtStockLabel(sz) }}
                    </option>
                  </select>
                </label>
                <label class="field"><span>Secondary size</span>
                  <select v-model="materialsForm.shirt_size_secondary" :disabled="shirtInventory?.isGendered && !materialsForm.shirt_gender">
                    <option value="">Select…</option>
                    <option v-for="sz in shirtSizesForForm" :key="'sec-' + sz" :value="sz">{{ sz }}</option>
                  </select>
                </label>
              </div>
              <p v-if="gearStatusHint('canvas_bag')" class="pyu__gear-hint">{{ gearStatusHint('canvas_bag') }}</p>
              <p class="pyu__field-label">Do you have an ITSCO canvas bag?</p>
              <label class="pyu__radio">
                <input v-model="materialsForm.has_canvas_bag" type="radio" value="yes" />
                Yes, I already have a canvas bag
              </label>
              <label class="pyu__radio">
                <input v-model="materialsForm.has_canvas_bag" type="radio" value="no" />
                No, I need an ITSCO canvas bag (beige bag with black straps)
              </label>
            </fieldset>

            <label class="field">
              <span>Notes (optional)</span>
              <textarea
                v-model="materialsForm.materials_notes"
                rows="3"
                :disabled="isFinalized"
                placeholder="Anything else about materials…"
              />
            </label>
            <div class="pyu__section-actions">
              <button type="button" class="btn btn-primary" :disabled="isFinalized || saving || !materialsForm.school_cart" @click="saveMaterials">
                Save materials request
              </button>
              <button
                v-if="props.mode !== 'token'"
                type="button"
                class="btn btn-secondary"
                :disabled="saving || !materialsForm.school_cart"
                @click="saveAndExit('materials')"
              >
                Save &amp; exit
              </button>
            </div>
          </section>

          <!-- Schedule -->
          <section v-else-if="activeSection === 'provider_schedule'" class="pyu__panel">
            <h2>Provider Schedule</h2>
            <p class="muted">
              Review your days and times at each school. Use <strong>Adjust</strong> if something is wrong — that submits a change request to the team.
              Request additional school days below if you need more coverage.
            </p>
            <div v-if="!(schedule || []).length" class="muted">No active school assignments found.</div>
            <div v-for="school in schedule" :key="school.schoolOrganizationId" class="pyu__school-block">
              <h3>{{ school.schoolName }}</h3>
              <table class="pyu__sched-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Time in system</th>
                    <th>Slots</th>
                    <th>Clients</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in school.days || []" :key="d.assignmentId || d.dayOfWeek">
                    <td>{{ d.dayOfWeek }}</td>
                    <td>{{ formatTimeRange(d.startTime, d.endTime) }}</td>
                    <td>{{ d.slotsTotal ?? '—' }}</td>
                    <td>{{ d.clientCount == null ? '—' : d.clientCount }}</td>
                    <td class="pyu__sched-actions">
                      <template v-if="pendingAdjustment(school, d)">
                        <div class="pyu__adjust-status">
                          <span class="pill pill--partial">Adjustment requested</span>
                          <div class="tiny muted">
                            {{ formatAdjustmentSummary(pendingAdjustment(school, d)) }}
                          </div>
                          <div class="pyu__sched-action-btns">
                            <button
                              v-if="props.mode !== 'token'"
                              type="button"
                              class="btn btn-secondary btn-sm"
                              :disabled="isFinalized"
                              @click="openScheduleAdjust(school, d, pendingAdjustment(school, d))"
                            >
                              Edit
                            </button>
                            <button
                              v-if="props.mode !== 'token'"
                              type="button"
                              class="btn btn-secondary btn-sm"
                              :disabled="isFinalized || saving"
                              @click="withdrawScheduleAdjustment(pendingAdjustment(school, d))"
                            >
                              Withdraw
                            </button>
                          </div>
                        </div>
                      </template>
                      <button
                        v-else-if="props.mode !== 'token'"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        :disabled="isFinalized"
                        @click="openScheduleAdjust(school, d)"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="adjustTarget && props.mode !== 'token'" class="pyu__adjust-box">
              <h3>
                {{ adjustTarget.existingRequestId ? 'Edit' : 'Adjust' }}
                {{ adjustTarget.day.dayOfWeek }} at {{ adjustTarget.school.schoolName }}
              </h3>
              <p class="muted tiny">
                Current: {{ formatTimeRange(adjustTarget.day.startTime, adjustTarget.day.endTime) }}
                · {{ adjustTarget.day.clientCount ?? 0 }} client(s) assigned / {{ adjustTarget.day.slotsTotal ?? '—' }} slot(s)
              </p>
              <label class="field"><span>Requested start</span>
                <input v-model="adjustForm.startTime" type="time" />
              </label>
              <label class="field"><span>Requested end</span>
                <input v-model="adjustForm.endTime" type="time" />
              </label>
              <label class="field"><span>Requested client spots</span>
                <input
                  v-model.number="adjustForm.slotsTotal"
                  type="number"
                  min="0"
                  max="40"
                  step="1"
                  placeholder="Total slots for this day"
                />
              </label>
              <label class="field"><span>Notes</span>
                <textarea v-model="adjustForm.notes" rows="2" placeholder="What needs to change and why?" />
              </label>
              <div class="pyu__section-actions">
                <button type="button" class="btn btn-primary" :disabled="saving" @click="submitScheduleAdjust">
                  {{ adjustTarget.existingRequestId ? 'Update adjustment' : 'Submit adjustment' }}
                </button>
                <button type="button" class="btn btn-secondary" @click="adjustTarget = null">Cancel</button>
              </div>
            </div>

            <div class="pyu__avail">
              <h3>Request additional school days</h3>
              <p class="muted tiny">Additional school hours requests require signing in to My Dashboard.</p>
              <button
                v-if="props.mode !== 'token'"
                type="button"
                class="btn btn-secondary"
                :disabled="isFinalized"
                @click="showAvailability = !showAvailability"
              >
                {{ showAvailability ? 'Hide availability form' : 'Open additional school availability' }}
              </button>
              <AdditionalAvailabilitySubmit
                v-if="showAvailability && props.mode !== 'token'"
                class="pyu__avail-embed"
                :agency-id="resolvedAgencyId"
                school-only
              />
            </div>

            <label class="pyu__check" style="margin-top: 16px;">
              <input v-model="scheduleConfirmed" type="checkbox" :disabled="isFinalized" />
              I reviewed my schools, days, and times — this looks accurate (or I’ve requested needed changes).
            </label>
            <div class="pyu__section-actions">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="isFinalized || saving || !scheduleConfirmed"
                @click="saveScheduleSection"
              >
                Mark schedule section complete
              </button>
              <button
                v-if="props.mode !== 'token'"
                type="button"
                class="btn btn-secondary"
                :disabled="saving"
                @click="saveAndExit('provider_schedule')"
              >
                Save &amp; exit
              </button>
            </div>
          </section>

          <!-- Clients without day -->
          <section v-else-if="activeSection === 'clients'" class="pyu__panel">
            <h2>Assigned Clients</h2>
            <p class="muted">
              These are the current clients (initials and grade) assigned to you at each school who do not yet have a service day.
              Once you confirm they will be seen at the school and continue care, please add them to a day via the app so we know they are current.
              Adding them to a day will mark them as current when other requirements are met. We may have further instructions in the future.
            </p>
            <div v-if="!(clientsWithoutDay || []).length" class="success-banner">
              No assigned clients are missing a service day right now.
            </div>
            <div v-for="school in clientsWithoutDay" :key="school.schoolOrganizationId" class="pyu__school-block">
              <h3>{{ school.schoolName }}</h3>
              <ul class="pyu__client-list">
                <li v-for="c in school.clients || []" :key="c.clientId">
                  <strong>{{ c.initials }}</strong>
                  <span class="muted">{{ c.grade ? `Grade ${c.grade}` : 'Grade —' }}</span>
                </li>
              </ul>
            </div>
            <div class="pyu__section-actions">
              <button
                type="button"
                class="btn btn-primary"
                :disabled="isFinalized || saving"
                @click="markSectionDone('clients')"
              >
                Mark clients section reviewed
              </button>
              <button
                v-if="props.mode !== 'token'"
                type="button"
                class="btn btn-secondary"
                :disabled="saving"
                @click="saveAndExit('clients')"
              >
                Save &amp; exit
              </button>
            </div>
          </section>

          <p v-if="saveFlash" class="success-banner">{{ saveFlash }}</p>
          <p v-if="actionError" class="error-banner">{{ actionError }}</p>
        </main>

        <ProviderYearUpdateSchoolNeedsPanel
          v-if="resolvedAgencyId && schoolYearKey"
          class="pyu__needs-rail"
          :agency-id="resolvedAgencyId"
          :school-year="schoolYearKey"
          :can-apply="props.mode !== 'token'"
        />
      </div>

      <footer class="pyu__footer">
        <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" class="pyu__footer-logo" />
        <span>{{ tenantName }} · Provider Year Update · {{ schoolYearDisplay }}</span>
      </footer>
    </template>

    <PostSchoolEventModal
      v-if="addEventSchool"
      :school-organization-id="addEventSchool.schoolOrganizationId"
      :school-name="addEventSchool.schoolName"
      :agency-id="resolvedAgencyId"
      initial-category="back_to_school"
      :locked-category="true"
      @close="addEventSchool = null"
      @saved="onEventSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { SECTION_META } from '../../utils/providerYearUpdate';
import {
  agencyDisplayName,
  formatSchoolYearLabel,
  logoSrc,
  parseAgencyPalette,
} from '../../utils/schoolReinit';
import {
  canRequestCompanyEventShift,
  companyEventRequestStatusLabel,
} from '../../utils/companyEventStaffing';
import PostSchoolEventModal from '../school/PostSchoolEventModal.vue';
import ProviderYearUpdateSchoolNeedsPanel from './ProviderYearUpdateSchoolNeedsPanel.vue';

const props = defineProps({
  mode: { type: String, default: 'provider' }, // provider | token | admin
  token: { type: String, default: '' },
  agencyId: { type: [Number, String], default: null },
  initialSection: { type: String, default: '' },
});

const emit = defineEmits(['requires-login', 'loaded']);

const route = useRoute();
const router = useRouter();
const agencyStore = useAgencyStore();

const loading = ref(true);
const saving = ref(false);
const finalizeBusy = ref(false);
const error = ref('');
const actionError = ref('');
const saveFlash = ref('');
const payload = ref(null);
const activeSection = ref('reminders');
const sectionMeta = SECTION_META;
const materialsForm = reactive({
  school_cart: null,
  need_school_cart: false,
  materials_notes: '',
  itsco_name_tag: false,
  itsco_name_tag_name: '',
  itsco_name_tag_title: '',
  office_nametag: false,
  office_nametag_name: '',
  itsco_lanyard: false,
  business_cards: false,
  has_office_key: null,
  has_shirt: null,
  has_itsco_name_tag: null,
  has_office_nametag: null,
  has_itsco_lanyard: null,
  has_business_cards: null,
  has_canvas_bag: null,
  shirt_gender: '',
  shirt_size: '',
  shirt_size_secondary: '',
  itsco_polo: false,
  polo_sex: '',
  polo_size: '',
  polo_size_secondary: '',
  itsco_canvas_bag: false,
});
const scheduleConfirmed = ref(false);
const showAvailability = ref(false);
const addEventSchool = ref(null);
const signingUpId = ref(0);
const selectedEventSessions = reactive({});
const reminderItems = ref([]);
const unknownBts = reactive({});
const adjustTarget = ref(null);
const adjustForm = reactive({ startTime: '', endTime: '', slotsTotal: null, notes: '' });

const resolvedAgencyId = computed(() => {
  return (
    Number(props.agencyId) ||
    Number(payload.value?.cycle?.agencyId) ||
    Number(agencyStore.currentAgencyId || agencyStore.currentAgency?.id) ||
    0
  );
});

const tenantName = computed(() => agencyDisplayName(payload.value?.agency, 'Partner'));
const tenantLogo = computed(() => {
  const agency = payload.value?.agency;
  const full = logoSrc(agency, { allowIcon: false });
  if (full) return full;
  return logoSrc(agency, { allowIcon: true });
});
const schoolYearKey = computed(() => String(payload.value?.cycle?.schoolYear || '').trim());
const schoolYearDisplay = computed(() => formatSchoolYearLabel(payload.value?.cycle?.schoolYear));
const providerLabel = computed(() => payload.value?.provider?.name || '');
const providerInitials = computed(() => {
  const p = payload.value?.provider;
  if (!p) return '?';
  const parts = [p.firstName, p.lastName].filter(Boolean);
  if (parts.length) return parts.map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const name = String(p.name || p.email || '?').trim();
  return name.slice(0, 2).toUpperCase();
});
const brandStyle = computed(() => {
  const p = parseAgencyPalette(payload.value?.agency);
  return {
    '--pyu-primary': p.primary || '#0c4a6e',
    '--pyu-secondary': p.secondary || '#15803d',
    '--pyu-accent': p.accent || '#c2410c',
  };
});

const isFinalized = computed(() => payload.value?.cycle?.status === 'finalized');
const schedule = computed(() => payload.value?.schedule || []);
const pendingScheduleAdjustments = computed(() => payload.value?.pendingScheduleAdjustments || []);
const eventsBySchool = computed(() => payload.value?.eventsBySchool || []);
const clientsWithoutDay = computed(() => payload.value?.clientsWithoutDay || []);
const schoolCartDisclaimer = computed(
  () =>
    payload.value?.schoolCartDisclaimer ||
    'This cart is a rolling cart filled with basic supplies to help with school therapy sessions. It includes craft supplies, games, a timer, and other basic supplies to help with your session. The clinician is responsible for the cart and its contents, and will be required to return the cart at the end of the school year. If the cart is damaged, lost or stolen, the clinician is required to let Kaitlyn O’Connell and Megan CG know.'
);
const shirtInventory = computed(
  () => payload.value?.shirtInventory || payload.value?.poloInventory || null
);
const gearMaterialsContext = computed(() => payload.value?.gearMaterialsContext || null);
const gearItems = computed(() => {
  const fromPayload = payload.value?.gearItems;
  if (fromPayload && typeof fromPayload === 'object') return fromPayload;
  return gearMaterialsContext.value?.gearItems || {};
});
const nameTagGearBlocks = [
  {
    key: 'itsco_name_tag',
    hasField: 'has_itsco_name_tag',
    question: 'Do you have an ITSCO name tag?',
    nested: [
      { model: 'itsco_name_tag_name', label: 'Preferred name' },
      { model: 'itsco_name_tag_title', label: 'Title', placeholder: 'e.g. LPC, School Therapist' },
    ],
  },
  {
    key: 'office_nametag',
    hasField: 'has_office_nametag',
    question: 'Do you have an office nametag?',
    nested: [{ model: 'office_nametag_name', label: 'Preferred name' }],
  },
  {
    key: 'itsco_lanyard',
    hasField: 'has_itsco_lanyard',
    question: 'Do you have an ITSCO lanyard?',
    nested: null,
  },
  {
    key: 'business_cards',
    hasField: 'has_business_cards',
    question: 'Do you have ITSCO business cards?',
    nested: null,
  },
];
const shirtGenders = computed(() => {
  const g = shirtInventory.value?.genders;
  if (Array.isArray(g) && g.length) return g;
  return [
    { value: 'women', label: "Women's" },
    { value: 'men', label: "Men's" },
  ];
});
const shirtSizesForForm = computed(() => {
  const inv = shirtInventory.value;
  const sizes = Array.isArray(inv?.sizes) && inv.sizes.length ? inv.sizes : ['XS', 'S', 'M', 'L', 'XL', '2XL'];
  if (!inv?.isGendered || !materialsForm.shirt_gender) return sizes;
  const gender = String(materialsForm.shirt_gender || '').toLowerCase();
  const inStock = sizes.filter((sz) => {
    const key = `${gender}:${sz}`;
    const qty = inv.stockByGenderSize?.[key];
    return qty == null || qty > 0;
  });
  return inStock.length ? inStock : sizes;
});
const shirtInventoryLabel = computed(() => shirtInventory.value?.message || 'Choose your preferred shirt size');

const kioskUrl = computed(() => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const slug = payload.value?.agency?.slug || 'itsco';
  return `${origin}/${slug}/school-events/kiosk`;
});

const progressPct = computed(() => {
  const sections = payload.value?.sections || [];
  if (!sections.length) return 0;
  const done = sections.filter((s) => s.reviewed || s.completed).length;
  return Math.round((done / sections.length) * 100);
});

const allSectionsDone = computed(() => {
  const sections = payload.value?.sections || [];
  return sections.length > 0 && sections.every((s) => s.reviewed || s.completed);
});

const remindersSectionComplete = computed(() => sectionDone('reminders'));

function sectionDone(key) {
  const s = (payload.value?.sections || []).find((x) => x.sectionKey === key);
  return Boolean(s?.reviewed || s?.completed);
}

function formatDt(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function formatEventWhen(ev) {
  const start = ev.startsAt || ev.starts_at;
  if (!start) return 'Date TBD';
  try {
    return new Date(start).toLocaleString();
  } catch {
    return String(start);
  }
}

function categoryLabel(c) {
  const map = {
    back_to_school: 'Back to School',
    open_house: 'Open House',
    first_day: 'First Day of School',
  };
  return map[String(c || '').toLowerCase()] || c || 'School event';
}

function canSignUp(ev) {
  const cat = String(ev.category || ev.schoolEventCategory || '').toLowerCase();
  if (['holiday', 'day_off', 'first_day', 'fall_check_in', 'spring'].includes(cat)) return false;
  return Boolean(ev.id && (ev.staffingEnabled || ev.staffing_enabled || cat === 'back_to_school' || true));
}

function applyPayload(data) {
  payload.value = data;
  const defaults = Object.fromEntries((data.reminderDefaults || []).map((d) => [d.key, d]));
  reminderItems.value = (data.reminders?.items || data.reminderDefaults || []).map((item) => {
    const def = defaults[item.key] || {};
    const mode = def.mode || item.mode || 'complete';
    const wasAcknowledged = Boolean(item.reviewed || item.completed);
    return {
      key: item.key,
      title: def.title || item.title,
      body: def.body || item.body,
      mode,
      reviewed: mode === 'reviewed' ? wasAcknowledged : Boolean(item.reviewed),
      completed: mode === 'complete' ? Boolean(item.completed) : false,
    };
  });
  const mat = data.materials || {};
  const cart =
    mat.school_cart ||
    (mat.need_school_cart || mat.needSchoolCart ? 'need' : null);
  materialsForm.school_cart = cart;
  materialsForm.need_school_cart = cart === 'need';
  materialsForm.materials_notes = mat.materials_notes || mat.materialsNotes || '';
  materialsForm.itsco_name_tag = Boolean(mat.itsco_name_tag);
  materialsForm.itsco_name_tag_name =
    mat.itsco_name_tag_name || data.provider?.name || '';
  materialsForm.itsco_name_tag_title = mat.itsco_name_tag_title || '';
  materialsForm.office_nametag = Boolean(mat.office_nametag);
  materialsForm.office_nametag_name =
    mat.office_nametag_name || data.provider?.name || '';
  materialsForm.itsco_lanyard = Boolean(mat.itsco_lanyard);
  materialsForm.business_cards = Boolean(mat.business_cards);
  materialsForm.has_office_key = applyHasField(mat, 'has_office_key');
  materialsForm.has_shirt = applyHasField(mat, 'has_shirt');
  materialsForm.has_itsco_name_tag = applyHasField(mat, 'has_itsco_name_tag', 'itsco_name_tag');
  materialsForm.has_office_nametag = applyHasField(mat, 'has_office_nametag', 'office_nametag');
  materialsForm.has_itsco_lanyard = applyHasField(mat, 'has_itsco_lanyard', 'itsco_lanyard');
  materialsForm.has_business_cards = applyHasField(mat, 'has_business_cards', 'business_cards');
  materialsForm.has_canvas_bag = applyHasField(mat, 'has_canvas_bag', 'itsco_canvas_bag');
  materialsForm.shirt_gender = legacyPoloGenderToShirt(mat.shirt_gender || mat.polo_sex || '');
  materialsForm.shirt_size = mat.shirt_size || mat.polo_size || '';
  materialsForm.shirt_size_secondary = mat.shirt_size_secondary || mat.polo_size_secondary || '';
  materialsForm.itsco_name_tag = materialsForm.has_itsco_name_tag === 'no';
  materialsForm.office_nametag = materialsForm.has_office_nametag === 'no';
  materialsForm.itsco_lanyard = materialsForm.has_itsco_lanyard === 'no';
  materialsForm.business_cards = materialsForm.has_business_cards === 'no';
  materialsForm.itsco_canvas_bag = materialsForm.has_canvas_bag === 'no';
  materialsForm.itsco_polo = materialsForm.has_shirt === 'no';
  materialsForm.polo_sex = shirtGenderToLegacyPolo(materialsForm.shirt_gender) || mat.polo_sex || '';
  materialsForm.polo_size = materialsForm.shirt_size;
  materialsForm.polo_size_secondary = materialsForm.shirt_size_secondary;
  materialsForm.itsco_canvas_bag = Boolean(mat.itsco_canvas_bag);
  const eventsData = (data.sections || []).find((s) => s.sectionKey === 'school_events')?.data || {};
  const unknownMap = eventsData.unknownBts || {};
  Object.keys(unknownBts).forEach((k) => delete unknownBts[k]);
  Object.assign(unknownBts, unknownMap);
  const schedData = (data.sections || []).find((s) => s.sectionKey === 'provider_schedule')?.data;
  scheduleConfirmed.value = Boolean(schedData?.confirmed);
  emit('loaded', data);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (props.mode === 'token' && props.token) {
      const res = await api.get(`/public/provider-year-update/${encodeURIComponent(props.token)}`);
      applyPayload(res.data);
    } else {
      const agencyId = resolvedAgencyId.value;
      if (!agencyId) throw new Error('Agency context required');
      const res = await api.get('/provider-year-update/me', { params: { agencyId } });
      if (res.data?.available === false) {
        error.value =
          res.data.reason === 'not_pushed'
            ? 'Provider Year Update has not been pushed yet.'
            : 'No school assignments found for your account.';
        return;
      }
      applyPayload(res.data);
    }
    const fromQuery = String(props.initialSection || route.query.section || '').trim();
    if (fromQuery && SECTION_META.some((m) => m.key === fromQuery)) {
      activeSection.value = fromQuery;
    }
  } catch (e) {
    if (e?.response?.data?.wrongUser) {
      error.value = e.response.data.error?.message || 'This link belongs to a different provider.';
    } else {
      error.value = e?.response?.data?.error?.message || e.message || 'Failed to load';
    }
  } finally {
    loading.value = false;
  }
}

async function saveSection(sectionKey, data, { reviewed = true, completed = true } = {}) {
  saving.value = true;
  actionError.value = '';
  saveFlash.value = '';
  try {
    const agencyId = resolvedAgencyId.value;
    let res;
    if (props.mode === 'token' && props.token) {
      res = await api.put(`/public/provider-year-update/${encodeURIComponent(props.token)}/sections/${sectionKey}`, {
        data,
        reviewed,
        completed,
      });
    } else {
      res = await api.put(`/provider-year-update/me/sections/${sectionKey}`, {
        agencyId,
        data,
        reviewed,
        completed,
      });
    }
    if (res.data?.sections) {
      payload.value = { ...payload.value, sections: res.data.sections };
    }
    saveFlash.value = 'Saved.';
    setTimeout(() => {
      saveFlash.value = '';
    }, 2000);
    return true;
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e.message || 'Save failed';
    return false;
  } finally {
    saving.value = false;
  }
}

async function toggleReminder(item, field, checked) {
  item[field] = checked;
  if (field === 'completed' && checked) item.reviewed = true;
  await saveSection(
    'reminders',
    { items: reminderItems.value },
    { reviewed: false, completed: false }
  );
}

async function completeReminders() {
  const items = reminderItems.value;
  for (const item of items) {
    if (item.mode === 'reviewed' && !item.reviewed && !item.completed) {
      actionError.value = `Please confirm you understand: ${item.title}`;
      return;
    }
    if (item.mode === 'complete' && !item.completed) {
      actionError.value = `Please complete: ${item.title}`;
      return;
    }
  }
  const ok = await saveSection('reminders', { items }, { reviewed: true, completed: true });
  if (ok) goToNextSection('reminders');
}

function goToNextSection(currentKey) {
  const idx = SECTION_META.findIndex((m) => m.key === currentKey);
  if (idx < 0 || idx >= SECTION_META.length - 1) return;
  activeSection.value = SECTION_META[idx + 1].key;
}

function gearStatusHint(key) {
  const item = gearItems.value?.[key];
  if (!item || item.status === 'unknown') return '';
  if (item.status === 'issued') return `On file (issued): ${item.detail || item.label}`;
  if (item.status === 'has') return `On file: ${item.detail || 'Has one'}`;
  if (item.status === 'requested') return `Requested: ${item.detail || item.label}`;
  return '';
}

function applyHasField(mat, hasKey, legacyNeedKey) {
  const direct = normalizeYesNoField(mat[hasKey]);
  if (direct) return direct;
  if (legacyNeedKey && mat[legacyNeedKey]) return 'no';
  return null;
}

function normalizeYesNoField(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'yes' || v === 'true' || v === '1') return 'yes';
  if (v === 'no' || v === 'false' || v === '0') return 'no';
  return null;
}

function legacyPoloGenderToShirt(gender) {
  const g = String(gender || '').trim().toUpperCase();
  if (g === 'M') return 'men';
  if (g === 'F') return 'women';
  return String(gender || '').trim().toLowerCase();
}

function shirtGenderToLegacyPolo(gender) {
  const g = String(gender || '').trim().toLowerCase();
  if (g === 'men') return 'M';
  if (g === 'women') return 'F';
  return '';
}

function materialsPayload() {
  const cart = materialsForm.school_cart;
  const needShirt = materialsForm.has_shirt === 'no';
  return {
    school_cart: cart,
    need_school_cart: cart === 'need',
    materials_notes: String(materialsForm.materials_notes || ''),
    has_office_key: materialsForm.has_office_key,
    has_shirt: materialsForm.has_shirt,
    has_itsco_name_tag: materialsForm.has_itsco_name_tag,
    has_office_nametag: materialsForm.has_office_nametag,
    has_itsco_lanyard: materialsForm.has_itsco_lanyard,
    has_business_cards: materialsForm.has_business_cards,
    has_canvas_bag: materialsForm.has_canvas_bag,
    shirt_gender: materialsForm.shirt_gender,
    shirt_size: materialsForm.shirt_size,
    shirt_size_secondary: materialsForm.shirt_size_secondary,
    itsco_name_tag: materialsForm.has_itsco_name_tag === 'no',
    itsco_name_tag_name: String(materialsForm.itsco_name_tag_name || ''),
    itsco_name_tag_title: String(materialsForm.itsco_name_tag_title || ''),
    office_nametag: materialsForm.has_office_nametag === 'no',
    office_nametag_name: String(materialsForm.office_nametag_name || ''),
    itsco_lanyard: materialsForm.has_itsco_lanyard === 'no',
    business_cards: materialsForm.has_business_cards === 'no',
    itsco_polo: needShirt,
    polo_sex: shirtGenderToLegacyPolo(materialsForm.shirt_gender),
    polo_size: String(materialsForm.shirt_size || ''),
    polo_size_secondary: String(materialsForm.shirt_size_secondary || ''),
    itsco_canvas_bag: materialsForm.has_canvas_bag === 'no',
  };
}

const MATERIALS_HAS_FIELDS = [
  { field: 'has_office_key', label: 'office key' },
  { field: 'has_shirt', label: 'ITSCO shirt' },
  { field: 'has_itsco_name_tag', label: 'ITSCO name tag' },
  { field: 'has_office_nametag', label: 'office nametag' },
  { field: 'has_itsco_lanyard', label: 'ITSCO lanyard' },
  { field: 'has_business_cards', label: 'business cards' },
  { field: 'has_canvas_bag', label: 'ITSCO canvas bag' },
];

async function saveMaterials() {
  if (!materialsForm.school_cart) {
    actionError.value = 'Please choose whether you need a school cart.';
    return;
  }
  for (const { field, label } of MATERIALS_HAS_FIELDS) {
    if (!materialsForm[field]) {
      actionError.value = `Please indicate whether you have an ${label}.`;
      return;
    }
  }
  if (materialsForm.has_shirt === 'no') {
    if (shirtInventory.value?.isGendered && !materialsForm.shirt_gender) {
      actionError.value = 'Please select shirt cut (Women\'s / Men\'s).';
      return;
    }
    if (!materialsForm.shirt_size) {
      actionError.value = 'Please select your preferred shirt size.';
      return;
    }
  }
  const ok = await saveSection('materials', materialsPayload(), { reviewed: true, completed: true });
  if (ok) goToNextSection('materials');
}

function shirtStockLabel(sz) {
  const inv = shirtInventory.value;
  if (!inv) return '';
  if (inv.isGendered && materialsForm.shirt_gender) {
    const key = `${materialsForm.shirt_gender}:${sz}`;
    const n = inv.stockByGenderSize?.[key];
    if (n == null) return '';
    return ` (${n} in stock)`;
  }
  const n = inv.stockBySize?.[sz];
  if (n == null) return '';
  return ` (${n} in stock)`;
}

function formatTimeRange(start, end) {
  const fmt = (t) => {
    if (!t) return '';
    const s = String(t).slice(0, 5);
    const [h, m] = s.split(':').map(Number);
    if (Number.isNaN(h)) return s;
    const ap = h >= 12 ? 'PM' : 'AM';
    const hh = ((h + 11) % 12) + 1;
    return `${hh}:${String(m || 0).padStart(2, '0')} ${ap}`;
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || '—';
}

function eventSessions(ev) {
  return Array.isArray(ev?.sessions) ? ev.sessions : [];
}

function selectedSessionForEvent(ev) {
  const sessions = eventSessions(ev);
  if (!sessions.length) return null;
  const picked = Number(selectedEventSessions[ev.id] || 0);
  if (picked && sessions.some((s) => Number(s.sessionDateId) === picked)) {
    return sessions.find((s) => Number(s.sessionDateId) === picked) || sessions[0];
  }
  return sessions[0];
}

function selectedSessionId(ev) {
  return selectedSessionForEvent(ev)?.sessionDateId || '';
}

function setSelectedSession(ev, sessionDateId) {
  if (!ev?.id || !sessionDateId) return;
  selectedEventSessions[ev.id] = sessionDateId;
}

function formatSessionWhen(sess) {
  if (!sess) return 'Session';
  const when = sess.startsAt || sess.sessionDate;
  if (!when) return 'Session';
  const d = new Date(when);
  if (!Number.isFinite(d.getTime())) return 'Session';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function staffingStatusLabel(ev) {
  const session = selectedSessionForEvent(ev);
  const label = companyEventRequestStatusLabel(ev, session);
  if (label) return label;
  const st = String(ev.myRequestStatus || ev.currentUserRequestStatus || ev.requestStatus || '').toLowerCase();
  if (st === 'approved' || st === 'accepted' || ev.viewerApproved || ev.currentUserAssigned) {
    return 'Approved to work this event';
  }
  if (st === 'pending' || st === 'requested' || ev.viewerRequested) {
    return 'You have requested to work this event';
  }
  return 'You can request to work this event';
}

function staffingStatusShort(ev) {
  const session = selectedSessionForEvent(ev);
  const label = companyEventRequestStatusLabel(ev, session);
  if (label) return label;
  const st = String(ev.myRequestStatus || ev.currentUserRequestStatus || ev.requestStatus || '').toLowerCase();
  if (st === 'approved' || st === 'accepted' || ev.viewerApproved || ev.currentUserAssigned) return 'Approved';
  if (st === 'pending' || st === 'requested' || ev.viewerRequested) return 'Requested';
  return 'Review';
}

function canRequestToWork(ev) {
  const session = selectedSessionForEvent(ev);
  if (session) return canRequestCompanyEventShift(ev, session);
  const st = String(ev.myRequestStatus || ev.currentUserRequestStatus || ev.requestStatus || '').toLowerCase();
  if (st === 'approved' || st === 'accepted' || st === 'pending' || st === 'requested') return false;
  if (ev.viewerApproved || ev.viewerRequested || ev.currentUserAssigned) return false;
  return true;
}

async function resolveSessionDateId(ev) {
  const session = selectedSessionForEvent(ev);
  if (session?.sessionDateId) return Number(session.sessionDateId);
  const agencyId = Number(ev.agencyId || resolvedAgencyId.value || 0);
  if (!ev?.id || !agencyId) return null;
  try {
    const res = await api.get(`/company-events/${ev.id}/session-staffing-summary`, {
      params: { agencyId },
      skipGlobalLoading: true,
    });
    const sessions = Array.isArray(res.data?.sessions) ? res.data.sessions : [];
    if (!sessions.length) return null;
    ev.sessions = sessions.map((s) => ({
      sessionDateId: s.sessionDateId,
      sessionDate: s.sessionDate,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      timezone: s.timezone,
      requiredProviders: s.requiredProviders,
      approvedProvidersCount: s.approvedProvidersCount,
    }));
    if (!selectedEventSessions[ev.id] && ev.sessions[0]?.sessionDateId) {
      selectedEventSessions[ev.id] = ev.sessions[0].sessionDateId;
    }
    return Number(selectedSessionForEvent(ev)?.sessionDateId || 0) || null;
  } catch {
    return null;
  }
}

async function toggleUnknownBts(school, checked) {
  unknownBts[school.schoolOrganizationId] = Boolean(checked);
  await saveSection(
    'school_events',
    { unknownBts: { ...unknownBts } },
    { reviewed: false, completed: false }
  );
}

async function saveEventsSection() {
  const ok = await saveSection(
    'school_events',
    { unknownBts: { ...unknownBts } },
    { reviewed: true, completed: true }
  );
  if (ok) goToNextSection('school_events');
}

const REMINDER_ACCENTS = ['#0c4a6e', '#15803d', '#b45309', '#7c3aed', '#be185d', '#0f766e', '#c2410c'];

function reminderAccentStyle(idx, item) {
  if (item.completed || (item.mode === 'reviewed' && item.reviewed)) {
    return { '--reminder-accent': 'var(--pyu-secondary)' };
  }
  if (item.reviewed) {
    return { '--reminder-accent': 'color-mix(in srgb, var(--pyu-secondary) 70%, var(--pyu-primary))' };
  }
  return { '--reminder-accent': REMINDER_ACCENTS[idx % REMINDER_ACCENTS.length] };
}

function reminderCardClass(item) {
  if (item.mode === 'reviewed') {
    return item.reviewed ? 'pyu__reminder-card--done' : '';
  }
  if (item.completed) return 'pyu__reminder-card--done';
  if (item.reviewed) return 'pyu__reminder-card--partial';
  return '';
}

function reminderCheckLabel(item) {
  if (item.mode === 'reviewed') return 'I understand';
  return 'Marked as reviewed';
}

function reminderReviewLabel(item) {
  if (item.mode === 'reviewed') {
    return item.reviewed || item.completed ? 'Understood' : 'Not yet';
  }
  return item.reviewed || item.completed ? 'Reviewed' : 'Not reviewed';
}

function reminderCompleteLabel(item) {
  return item.completed ? 'Complete' : 'Not complete';
}

function reminderReviewPillClass(item) {
  return item.reviewed || item.completed ? 'pill--done' : 'pill--pending';
}

function reminderCompletePillClass(item) {
  return item.completed ? 'pill--done' : 'pill--pending';
}

function scheduleAdjustmentKey(schoolOrganizationId, dayOfWeek) {
  return `${Number(schoolOrganizationId)}:${String(dayOfWeek || '').trim()}`;
}

const pendingAdjustmentsByKey = computed(() => {
  const map = new Map();
  for (const adj of pendingScheduleAdjustments.value || []) {
    if (!adj?.schoolOrganizationId || !adj?.dayOfWeek) continue;
    const key = scheduleAdjustmentKey(adj.schoolOrganizationId, adj.dayOfWeek);
    if (!map.has(key)) map.set(key, adj);
  }
  return map;
});

function pendingAdjustment(school, day) {
  const key = scheduleAdjustmentKey(school?.schoolOrganizationId, day?.dayOfWeek);
  return pendingAdjustmentsByKey.value.get(key) || null;
}

function formatAdjustmentSummary(adj) {
  if (!adj) return '';
  const parts = [
    formatTimeRange(adj.requestedStart, adj.requestedEnd),
    adj.requestedSlots != null ? `${adj.requestedSlots} spot(s)` : null,
  ].filter(Boolean);
  return parts.length ? `Requested: ${parts.join(' · ')}` : 'Pending staff review';
}

function openScheduleAdjust(school, day, existing = null) {
  adjustTarget.value = {
    school,
    day,
    existingRequestId: existing?.id || null,
  };
  if (existing) {
    adjustForm.startTime = String(existing.requestedStart || day.startTime || '').slice(0, 5);
    adjustForm.endTime = String(existing.requestedEnd || day.endTime || '').slice(0, 5);
    adjustForm.slotsTotal =
      existing.requestedSlots == null ? (day.slotsTotal == null ? null : Number(day.slotsTotal)) : Number(existing.requestedSlots);
    adjustForm.notes = existing.notes || '';
    return;
  }
  adjustForm.startTime = String(day.startTime || '').slice(0, 5);
  adjustForm.endTime = String(day.endTime || '').slice(0, 5);
  adjustForm.slotsTotal = day.slotsTotal == null ? null : Number(day.slotsTotal);
  adjustForm.notes = '';
}

async function withdrawScheduleAdjustment(adj) {
  if (!adj?.id) return;
  if (!window.confirm('Withdraw this schedule adjustment request?')) return;
  saving.value = true;
  actionError.value = '';
  try {
    await api.post(`/availability/me/school-requests/${adj.id}/withdraw`, {
      agencyId: resolvedAgencyId.value,
    });
    if (adjustTarget.value?.existingRequestId === adj.id) {
      adjustTarget.value = null;
    }
    saveFlash.value = 'Adjustment withdrawn.';
    await load();
    setTimeout(() => {
      saveFlash.value = '';
    }, 2500);
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e.message || 'Could not withdraw adjustment';
  } finally {
    saving.value = false;
  }
}

async function submitScheduleAdjust() {
  if (!adjustTarget.value) return;
  saving.value = true;
  actionError.value = '';
  const { school, day } = adjustTarget.value;
  const currentSlots = day.slotsTotal ?? null;
  const currentUsed = day.clientCount ?? null;
  const requestedSlots = Number(adjustForm.slotsTotal);
  const slotsChanged =
    Number.isFinite(requestedSlots) &&
    currentSlots != null &&
    requestedSlots !== Number(currentSlots);
  try {
    const note = [
      `Schedule adjustment request for ${school.schoolName}`,
      `Day: ${day.dayOfWeek}`,
      `Current slots: ${
        currentUsed != null && currentSlots != null
          ? `${Number(currentUsed || 0)} assigned / ${Number(currentSlots)} total`
          : currentSlots != null
            ? `${Number(currentSlots)} total`
            : '—'
      }`,
      Number.isFinite(requestedSlots)
        ? `Requested slots total: ${requestedSlots}${
            slotsChanged ? ` (delta ${requestedSlots - Number(currentSlots) >= 0 ? '+' : ''}${requestedSlots - Number(currentSlots)})` : ''
          }`
        : null,
      `Current hours: ${formatTimeRange(day.startTime, day.endTime)}`,
      `Requested hours: ${formatTimeRange(adjustForm.startTime, adjustForm.endTime)}`,
      adjustForm.notes ? `Notes: ${adjustForm.notes}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    await api.post('/availability/school-requests', {
      agencyId: resolvedAgencyId.value,
      requestKind: 'schedule_adjustment',
      preferredSchoolOrgIds: [school.schoolOrganizationId],
      replaceRequestId: adjustTarget.value.existingRequestId || undefined,
      notes: note,
      blocks: [
        {
          dayOfWeek: day.dayOfWeek,
          startTime: adjustForm.startTime,
          endTime: adjustForm.endTime,
          schoolOrganizationId: school.schoolOrganizationId,
        },
      ],
    });
    saveFlash.value = adjustTarget.value.existingRequestId
      ? 'Adjustment updated — thank you.'
      : 'Adjustment submitted — thank you.';
    adjustTarget.value = null;
    await load();
    setTimeout(() => {
      saveFlash.value = '';
    }, 2500);
  } catch (e) {
    // Fallback: persist on section data if dedicated endpoint shape differs
    try {
      const existing =
        (payload.value?.sections || []).find((s) => s.sectionKey === 'provider_schedule')?.data || {};
      const adjustments = Array.isArray(existing.adjustments) ? [...existing.adjustments] : [];
      adjustments.push({
        schoolOrganizationId: adjustTarget.value.school.schoolOrganizationId,
        schoolName: adjustTarget.value.school.schoolName,
        dayOfWeek: adjustTarget.value.day.dayOfWeek,
        currentStart: adjustTarget.value.day.startTime,
        currentEnd: adjustTarget.value.day.endTime,
        currentSlots: adjustTarget.value.day.slotsTotal ?? null,
        requestedStart: adjustForm.startTime,
        requestedEnd: adjustForm.endTime,
        requestedSlots: Number.isFinite(requestedSlots) ? requestedSlots : null,
        notes: adjustForm.notes,
        submittedAt: new Date().toISOString(),
      });
      await saveSection('provider_schedule', { ...existing, adjustments }, { reviewed: false, completed: false });
      saveFlash.value = 'Adjustment saved for the team to review.';
      adjustTarget.value = null;
    } catch (e2) {
      actionError.value =
        e?.response?.data?.error?.message || e2?.message || e.message || 'Could not submit adjustment';
    }
  } finally {
    saving.value = false;
  }
}

function dashboardPath() {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}/dashboard` : '/dashboard';
}

async function saveAndExit(sectionKey) {
  actionError.value = '';
  try {
    if (sectionKey === 'materials') {
      if (!materialsForm.school_cart) {
        actionError.value = 'Please choose whether you need a school cart before saving.';
        return;
      }
      await saveSection('materials', materialsPayload(), { reviewed: false, completed: false });
    } else if (sectionKey === 'school_events') {
      await saveSection('school_events', { unknownBts: { ...unknownBts } }, { reviewed: false, completed: false });
    } else if (sectionKey === 'provider_schedule') {
      const existing =
        (payload.value?.sections || []).find((s) => s.sectionKey === 'provider_schedule')?.data || {};
      await saveSection('provider_schedule', existing, { reviewed: false, completed: false });
    } else if (sectionKey === 'clients') {
      await saveSection('clients', { reviewedAt: new Date().toISOString() }, { reviewed: false, completed: false });
    }
    saveFlash.value = 'Progress saved — return anytime.';
    if (props.mode !== 'token') {
      router.push({ path: dashboardPath() }).catch(() => {});
    }
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e.message || 'Save failed';
  }
}

function orgPrefix() {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}` : '';
}

async function markSectionDone(key) {
  const existing = (payload.value?.sections || []).find((s) => s.sectionKey === key)?.data || {};
  const ok = await saveSection(key, existing, { reviewed: true, completed: true });
  if (ok) goToNextSection(key);
}

async function saveScheduleSection() {
  const ok = await saveSection(
    'provider_schedule',
    { confirmed: true, confirmedAt: new Date().toISOString() },
    { reviewed: true, completed: true }
  );
  if (ok) goToNextSection('provider_schedule');
}

function openAddEvent(school) {
  addEventSchool.value = school;
}

async function onEventSaved() {
  addEventSchool.value = null;
  await load();
}

async function signUpForEvent(ev) {
  signingUpId.value = ev.id;
  actionError.value = '';
  try {
    const sessionDateId = await resolveSessionDateId(ev);
    if (!sessionDateId) {
      actionError.value = 'No event session is available to request yet. Try refreshing, or ask staff to enable staffing for this event.';
      return;
    }
    const agencyId = Number(ev.agencyId || resolvedAgencyId.value || 0);
    await api.post(
      `/company-events/${ev.id}/session-requests`,
      {
        agencyId,
        sessionDateId,
        requestType: 'regular',
      },
      { skipGlobalLoading: true }
    );
    saveFlash.value = 'Request submitted — staff will review it.';
    await load();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e.message || 'Could not submit request';
  } finally {
    signingUpId.value = 0;
  }
}

async function finalize() {
  finalizeBusy.value = true;
  actionError.value = '';
  try {
    let res;
    if (props.mode === 'token' && props.token) {
      res = await api.post(`/public/provider-year-update/${encodeURIComponent(props.token)}/finalize`);
    } else {
      res = await api.post('/provider-year-update/me/finalize', {
        agencyId: resolvedAgencyId.value,
      });
    }
    applyPayload(res.data);
    saveFlash.value = 'Year Update marked complete. Thank you!';
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || e.message || 'Could not finalize';
  } finally {
    finalizeBusy.value = false;
  }
}

watch(
  () => route.query.section,
  (s) => {
    const key = String(s || '').trim();
    if (key && SECTION_META.some((m) => m.key === key)) activeSection.value = key;
  }
);

watch(activeSection, (key) => {
  if (route.query.section !== key && props.mode !== 'token') {
    router.replace({ query: { ...route.query, section: key } }).catch(() => {});
  }
});

onMounted(load);

defineExpose({ load, reload: load });
</script>

<style scoped>
.pyu {
  position: relative;
  min-height: 70vh;
  color: #0f172a;
  --pyu-primary: #0c4a6e;
  --pyu-secondary: #15803d;
  --pyu-accent: #c2410c;
}
.pyu__bg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.92), rgba(241, 245, 249, 0.96)),
    url('/assets/school-reinit/itsco-school-update-background.png') center / cover no-repeat;
  z-index: 0;
  pointer-events: none;
}
.pyu__loading,
.pyu__error,
.pyu__header-shell,
.pyu__layout,
.pyu__footer {
  position: relative;
  z-index: 1;
}
.pyu__header-shell {
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 4px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
}
.pyu__accent {
  height: 4px;
  background: linear-gradient(90deg, var(--pyu-primary), var(--pyu-accent));
}
.pyu__top-inner {
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 0 28px;
  box-sizing: border-box;
}
.pyu__top {
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 18px 20px 14px;
}
.pyu__brand-block {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.pyu__logo {
  height: 42px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
  flex-shrink: 0;
}
.pyu__brand-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pyu__brand-name {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--pyu-primary);
  line-height: 1.25;
}
.pyu__brand-year {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 2px;
}
.pyu__title-block h1 {
  margin: 0 0 6px;
  color: var(--pyu-secondary);
  font-size: 1.55rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.pyu__sub {
  margin: 0;
  color: #475569;
  max-width: 36rem;
  font-size: 0.88rem;
  line-height: 1.45;
}
.pyu__user-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 180px;
}
.pyu__help {
  margin: 0;
  font-size: 0.78rem;
  color: #64748b;
  text-align: right;
  max-width: 14rem;
  line-height: 1.35;
}
.pyu__user-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 6px 6px;
  border-radius: 999px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #334155;
}
.pyu__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--pyu-primary);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
}
.pyu__progress-wrap {
  width: 100%;
}
.pyu__progress-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--pyu-primary);
}
.pyu__progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  margin-top: 6px;
}
.pyu__progress-bar span {
  display: block;
  height: 100%;
  background: var(--pyu-primary);
}
.pyu__finalized {
  margin: 6px 0 0;
  font-size: 0.8rem;
  color: #166534;
}
.pyu__layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) minmax(280px, 360px);
  gap: 20px;
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 12px 28px 40px;
  box-sizing: border-box;
}
.pyu__needs-rail {
  min-width: 0;
}
.pyu__nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pyu__nav-item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
}
.pyu__nav-item.active {
  border-color: var(--pyu-primary);
  box-shadow: 0 0 0 1px var(--pyu-primary);
}
.pyu__nav-item.done .pyu__nav-dot {
  background: #16a34a;
}
.pyu__nav-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #cbd5e1;
  margin-top: 4px;
  flex-shrink: 0;
}
.pyu__nav-item strong {
  display: block;
  font-size: 0.9rem;
}
.pyu__nav-item small {
  color: #64748b;
  font-size: 0.75rem;
}
.pyu__finalize {
  margin-top: 10px;
}
.pyu__main {
  min-width: 0;
}
.pyu__panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.05);
}
.pyu__panel h2 {
  margin: 0 0 6px;
  color: var(--pyu-primary);
}
.pyu__check-item {
  border-top: 1px solid #f1f5f9;
  padding: 14px 0;
}
.pyu__reminder-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
}
.pyu__reminder-card {
  --reminder-accent: var(--pyu-primary);
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 14px;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  border-left: 4px solid var(--reminder-accent);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.pyu__reminder-card--partial {
  background: color-mix(in srgb, var(--pyu-secondary) 5%, white);
  box-shadow: 0 2px 10px rgba(21, 128, 61, 0.06);
}
.pyu__reminder-card--done {
  background: color-mix(in srgb, var(--pyu-secondary) 9%, white);
  box-shadow: 0 2px 10px rgba(21, 128, 61, 0.08);
}
.pyu__reminder-step {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.95rem;
  color: var(--reminder-accent);
  background: color-mix(in srgb, var(--reminder-accent) 14%, white);
  flex-shrink: 0;
  margin-top: 2px;
}
.pyu__reminder-content {
  min-width: 0;
}
.pyu__reminder-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.pyu__reminder-title {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.3;
  color: var(--pyu-primary);
}
.pyu__reminder-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
.pyu__reminder-text {
  margin: 0 0 12px;
  line-height: 1.55;
  color: #475569;
  font-size: 0.92rem;
}
.pyu__reminder-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
}
.pyu__reminder-check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: #334155;
  cursor: pointer;
}
.pyu__reminder-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--pyu-secondary);
}
.pyu__check-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  margin-bottom: 6px;
}
.pyu__check-item p {
  margin: 0 0 10px;
  line-height: 1.45;
  color: #334155;
}
.pyu__check-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 0.9rem;
}
.pyu__section-actions {
  margin-top: 16px;
  display: flex;
  gap: 10px;
}
.pyu__info {
  background: #f8fafc;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 12px 0;
  font-size: 0.9rem;
}
.pyu__info a {
  color: var(--pyu-accent, #c2410c);
  word-break: break-all;
}
.pyu__school-block {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  margin: 12px 0;
}
.pyu__school-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.pyu__school-head h3,
.pyu__school-block h3 {
  margin: 0;
  font-size: 1.05rem;
}
.pyu__event-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pyu__event-list li,
.pyu__event-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #f1f5f9;
}
.pyu__event-copy {
  min-width: 0;
  flex: 1;
}
.pyu__event-session-pick {
  margin-top: 6px;
}
.pyu__event-session-select {
  display: block;
  margin-top: 4px;
  min-width: 220px;
  max-width: 100%;
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font: inherit;
  background: #fff;
}
.pyu__sched-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.pyu__sched-table th,
.pyu__sched-table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid #f1f5f9;
}
.pyu__sched-actions {
  min-width: 180px;
}
.pyu__adjust-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.pyu__sched-action-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pyu__check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 10px 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
}
.field textarea {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.pill {
  font-size: 0.7rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--pyu-accent) 15%, white);
  color: var(--pyu-accent);
  padding: 2px 8px;
  border-radius: 999px;
}
.pill--pending {
  background: #f1f5f9;
  color: #64748b;
}
.pill--partial {
  background: color-mix(in srgb, var(--pyu-secondary) 12%, white);
  color: var(--pyu-secondary);
}
.pill--done {
  background: color-mix(in srgb, var(--pyu-secondary) 18%, white);
  color: var(--pyu-secondary);
}
.pyu__footer {
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 20px 28px 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  color: #64748b;
  box-sizing: border-box;
}
.pyu__footer-logo {
  height: 22px;
  width: auto;
  object-fit: contain;
  opacity: 0.85;
}
.pyu :deep(.btn-primary) {
  background: var(--pyu-secondary);
  border-color: var(--pyu-secondary);
}
.pyu :deep(.btn-primary:hover:not(:disabled)) {
  filter: brightness(0.95);
}
.pyu__avail {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
}
.pyu__avail-embed {
  margin-top: 12px;
}
.success-banner {
  margin-top: 12px;
  background: #dcfce7;
  color: #166534;
  padding: 8px 10px;
  border-radius: 8px;
}
.error-banner,
.pyu__error {
  margin-top: 12px;
  background: #fee2e2;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
}
.muted { color: #64748b; }
.tiny { font-size: 0.8rem; }
.pyu__fieldset {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px 14px;
  margin: 14px 0;
}
.pyu__fieldset legend {
  padding: 0 6px;
  font-weight: 700;
  color: var(--pyu-primary);
}
.req { color: #c2410c; }
.pyu__radio {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 8px 0;
  font-size: 0.95rem;
}
.pyu__field-label {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}
.pyu__gear-hint {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--pyu-secondary) 10%, white);
  border: 1px solid color-mix(in srgb, var(--pyu-secondary) 25%, #e5e7eb);
  font-size: 13px;
  color: #334155;
}
.pyu__disclaimer {
  margin: 10px 0 0;
  padding: 10px 12px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.45;
  color: #9a3412;
}
.pyu__nested {
  margin: 8px 0 12px 22px;
  display: grid;
  gap: 8px;
}
.pyu__adjust-box {
  margin: 14px 0;
  padding: 14px;
  border: 1px solid #fdba74;
  background: #fffbeb;
  border-radius: 12px;
}
.pyu__client-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.pyu__client-list li {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  border-top: 1px solid #f1f5f9;
}
@media (max-width: 1100px) {
  .pyu__layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .pyu__needs-rail {
    grid-column: 1 / -1;
    position: static;
    max-height: none;
  }
}
@media (max-width: 800px) {
  .pyu__top {
    grid-template-columns: 1fr;
  }
  .pyu__user-block {
    align-items: flex-start;
    min-width: 0;
  }
  .pyu__help {
    text-align: left;
    max-width: none;
  }
  .pyu__top-inner,
  .pyu__layout,
  .pyu__footer {
    padding-left: 16px;
    padding-right: 16px;
  }
  .pyu__layout {
    grid-template-columns: 1fr;
  }
}
</style>
