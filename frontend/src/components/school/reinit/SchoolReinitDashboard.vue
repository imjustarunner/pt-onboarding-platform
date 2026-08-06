<template>
  <div
    class="cua"
    :class="{ 'cua--embedded': embedded, 'cua--welcome': needsIdentity && !loading && !loadError }"
    :style="brandStyle"
  >
    <div v-if="loading" class="cua__muted">Loading collaborative update…</div>
    <div v-else-if="loadError" class="cua__error">{{ loadError }}</div>

    <template v-else-if="isFinalized && viewMode === 'hub'">
      <SchoolReinitReceipt
        :cycle="cycle"
        :agency="agency"
        :school="school"
        :addendums="addendums"
        :pending-change-count="pendingChangeCount"
        :identity-label="identityBanner || cycle?.finalized_by_display_name || ''"
        :submitting="saving"
        @submit-addendum="onReceiptAddendum"
        @return-portal="onExit"
      />
    </template>

    <template v-else>
      <!-- Welcome / identity gate for token guests -->
      <div v-if="needsIdentity" class="welcome-shell">
        <header class="welcome__top">
          <div class="welcome__top-left">
            <div class="welcome__tenant-brand">
              <img
                v-if="tenantLogo"
                :src="tenantLogo"
                :alt="tenantName"
                class="welcome__logo welcome__logo--tenant"
              />
              <div class="welcome__tenant-copy">
                <span class="welcome__tenant-name">{{ tenantName }}</span>
              </div>
            </div>
          </div>
          <div class="welcome__top-center">
            <img
              v-if="schoolLogo"
              :src="schoolLogo"
              :alt="schoolName"
              class="welcome__logo welcome__logo--school"
            />
            <div v-else class="welcome__school-mark">{{ schoolName }}</div>
          </div>
          <div class="welcome__top-right">
            <a class="welcome__help" href="mailto:support@itsco.org">
              <span class="welcome__help-icon" aria-hidden="true">?</span>
              Need help?
            </a>
          </div>
        </header>

        <div class="welcome">
        <main class="welcome__card">
          <h1 class="welcome__title">Welcome to {{ schoolName }}</h1>
          <p class="welcome__lead">
            You’ve been invited to review and update important school information for the
            {{ schoolYearDisplay }} school year.
          </p>

          <div class="welcome__steps">
            <div class="welcome__step">
              <div class="welcome__step-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>
              </div>
              <strong>Review</strong>
              <span>Go through each section at your own pace.</span>
            </div>
            <div class="welcome__step">
              <div class="welcome__step-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
              </div>
              <strong>Verify</strong>
              <span>Confirm or update information to keep it accurate.</span>
            </div>
            <div class="welcome__step">
              <div class="welcome__step-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </div>
              <strong>Finalize</strong>
              <span>Submit when complete. We’ll take it from there.</span>
            </div>
          </div>

          <form class="welcome__form" @submit.prevent="saveIdentity">
            <h2>Who is making updates?</h2>
            <p>We’ll record your name on reviews and finalization.</p>
            <div class="welcome__fields">
              <label>
                Your name <span aria-hidden="true">*</span>
                <input v-model="identityName" type="text" autocomplete="name" placeholder="Enter your full name" required />
              </label>
              <label>
                Role / Title <span aria-hidden="true">*</span>
                <input
                  v-model="identityTitle"
                  type="text"
                  autocomplete="organization-title"
                  placeholder="e.g., School Counselor, Administrator, Office Staff"
                  required
                />
              </label>
            </div>
            <button type="submit" class="welcome__cta" :disabled="!canContinueIdentity">
              Continue to Dashboard
              <span aria-hidden="true">→</span>
            </button>
            <div class="welcome__note">
              <span class="welcome__note-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#2563eb" stroke-width="2">
                  <path d="M12 3l8 3v6c0 5-3.5 9.4-8 10.5C7.5 21.4 4 17 4 12V6l8-3z" />
                </svg>
              </span>
              <p>
                Your work is important. This collaborative process helps ensure we’re aligned and ready
                to support your students this year.
              </p>
            </div>
          </form>
        </main>

        <footer class="welcome__footer">
          <div class="welcome__footer-item">
            <strong>Secure &amp; Private</strong>
            <span>Your information is encrypted and never shared with others.</span>
          </div>
          <div class="welcome__footer-item">
            <strong>Save &amp; Return Anytime</strong>
            <span>You can exit and return later. Your progress is saved.</span>
          </div>
          <div class="welcome__footer-item">
            <strong>Need Assistance?</strong>
            <span>Contact the {{ tenantName }} team if you need help getting started.</span>
          </div>
        </footer>
        </div>
      </div>

      <template v-else>
        <header class="cua__top">
          <div class="cua__brand-block">
            <img v-if="tenantLogo" :src="tenantLogo" :alt="tenantName" class="cua__logo" />
            <div class="cua__brand-copy">
              <span class="cua__brand-name">{{ tenantName }}</span>
            </div>
          </div>
          <div class="cua__title-block">
            <div class="cua__school">{{ schoolName }}</div>
            <h1 class="cua__h1">Collaborative Update &amp; Approval</h1>
            <p class="cua__sub">
              Help us prepare for a successful year together. Review each section, confirm your information, and submit when complete.
            </p>
          </div>
          <div class="cua__user-block">
            <button type="button" class="cua__copy-token" @click="copyShareToken">
              {{ copyFlash ? 'Copied!' : 'Copy Link' }}
            </button>
            <a v-if="embedded || mode === 'staff'" class="cua__help" href="#" @click.prevent="$emit('dismiss-request')">Need help?</a>
            <div class="cua__user-chip">
              <span class="cua__avatar">{{ userInitials }}</span>
              <span>{{ identityBanner || 'Collaborator' }}</span>
            </div>
          </div>
        </header>

        <div v-if="bannerError" class="cua__error cua__banner-error">{{ bannerError }}</div>

        <div class="cua__layout">
          <!-- Sidebar -->
          <aside class="cua__sidebar">
            <div class="cua__progress-label">{{ doneCount }} of {{ sectionMeta.length }} sections complete</div>
            <div class="cua__progress-track" aria-hidden="true">
              <div class="cua__progress-fill" :style="{ width: percentComplete + '%' }" />
            </div>

            <nav class="cua__steps" aria-label="Sections">
              <button
                v-for="(sec, idx) in sectionMeta"
                :key="sec.key"
                type="button"
                class="cua__step"
                :class="{
                  'is-done': isSectionDone(sec.key),
                  'is-active': activeSection === sec.key && viewMode === 'detail',
                  'is-current': !isSectionDone(sec.key) && firstIncompleteKey === sec.key,
                }"
                @click="openSection(sec.key)"
              >
                <span class="cua__step-marker">
                  <span v-if="isSectionDone(sec.key)" class="cua__step-check">✓</span>
                  <span v-else>{{ idx + 1 }}</span>
                </span>
                <span class="cua__step-label">{{ sec.shortTitle }}</span>
              </button>
              <button
                type="button"
                class="cua__step cua__step--finalize"
                :class="{ 'is-disabled': !canFinalize }"
                :disabled="!canFinalize"
                @click="scrollFinalize"
              >
                <span class="cua__step-marker">🔒</span>
                <span class="cua__step-label">Review &amp; Finalize</span>
              </button>
            </nav>

            <div class="cua__exit-box">
              <div class="cua__exit-title">Need to complete later?</div>
              <button type="button" class="cua__exit-btn" @click="onExit">
                Exit to Portal
              </button>
            </div>
          </aside>

          <!-- Main -->
          <main class="cua__main">
            <div class="cua__autosave">
              Your responses are saved automatically as you go. You can return and finish later.
              Changes to existing items will require admin approval.
            </div>

            <!-- Hub grid -->
            <div v-if="viewMode === 'hub'" class="cua__grid">
              <button
                v-for="(sec, idx) in sectionMeta"
                :key="sec.key"
                type="button"
                class="cua__card"
                :class="{
                  'is-done': isSectionDone(sec.key),
                  'is-progress': !isSectionDone(sec.key) && firstIncompleteKey === sec.key,
                  'is-todo': !isSectionDone(sec.key) && firstIncompleteKey !== sec.key,
                }"
                @click="openSection(sec.key)"
              >
                <div class="cua__card-top">
                  <span class="cua__card-icon" v-html="sectionIcon(sec.icon)" />
                  <span class="cua__card-chevron">›</span>
                </div>
                <div class="cua__card-num">{{ idx + 1 }}</div>
                <div class="cua__card-title">{{ sec.title }}</div>
                <div class="cua__card-desc">{{ sec.description }}</div>
                <div class="cua__card-status">
                  <span v-if="isSectionDone(sec.key)" class="status status--done">
                    <span class="dot">✓</span> Completed
                  </span>
                  <span v-else-if="firstIncompleteKey === sec.key" class="status status--progress">
                    <span class="dot" /> In Progress
                  </span>
                  <span v-else class="status status--todo">
                    <span class="dot" /> Not Started
                  </span>
                </div>
              </button>
            </div>

            <!-- Section detail -->
            <div v-else class="cua__detail">
              <button type="button" class="cua__back" @click="viewMode = 'hub'">← All sections</button>
              <h2>{{ sectionTitle(activeSection) }}</h2>
              <p class="cua__muted">{{ sectionHint(activeSection) }}</p>

              <SchoolReinitValidationAlert
                v-if="sectionAlert && sectionAlert.sectionKey === activeSection"
                :title="sectionAlert.title"
                :message="sectionAlert.message"
                :why-text="sectionAlert.whyText"
                :actions="sectionAlert.actions || []"
                :extra-actions="sectionAlert.extraActions || []"
                :hint="sectionAlert.hint || ''"
                :variant="sectionAlert.variant || 'warning'"
              />

              <section v-if="activeSection === 'school_events'" class="cua__section-body">
                <div class="cua__panel">
                  <div class="cua__event-card-head">
                    <h4>First day of school <span class="cua__req" aria-hidden="true">*</span></h4>
                    <button
                      v-if="displayFirstDay"
                      type="button"
                      class="cua__link-btn"
                      @click="openPostEventModal('first_day', displayFirstDay.id ? displayFirstDay : null)"
                    >
                      {{ displayFirstDay.id ? 'Edit' : 'Add to portal calendar' }}
                    </button>
                  </div>
                  <template v-if="displayFirstDay">
                    <p><strong>{{ displayFirstDay.title || 'First Day of School' }}</strong></p>
                    <p class="cua__muted">{{ formatSchoolEventWhen(displayFirstDay) }}</p>
                  </template>
                  <template v-else>
                    <p class="cua__muted">Add this on your school portal calendar — same form as the school portal.</p>
                    <button type="button" class="btn btn-secondary btn-sm" @click="openPostEventModal('first_day')">
                      Add first day of school
                    </button>
                  </template>
                </div>

                <div class="cua__panel">
                  <div class="cua__event-card-head">
                    <h4>Back-to-School &amp; school events</h4>
                  </div>
                  <p class="cua__muted">
                    Post events on your school portal calendar — same form as the school portal.
                    Add your main Back-to-School event, plus others like an open house or barbecue (use “School Event” or another type).
                  </p>

                  <ul v-if="schoolAttendableEvents.length" class="cua__school-events-list">
                    <li v-for="ev in schoolAttendableEvents" :key="ev.id" class="cua__school-event-row">
                      <div>
                        <span class="cua__event-type-pill">{{ schoolEventCategoryLabel(ev.category) }}</span>
                        <strong>{{ ev.title }}</strong>
                        <p class="cua__muted">{{ formatSchoolEventWhen(ev) }}</p>
                      </div>
                      <button type="button" class="btn btn-secondary btn-sm" @click="openPostEventModal(ev.category, ev, true)">
                        Edit
                      </button>
                    </li>
                  </ul>
                  <p v-else class="cua__muted">No school events posted yet for this year.</p>

                  <div class="cua__event-actions">
                    <button
                      v-if="!hasBackToSchoolEvent"
                      type="button"
                      class="btn btn-primary"
                      @click="openPostEventModal('back_to_school', null, true)"
                    >
                      Add Back-to-School event
                    </button>
                    <button type="button" class="btn btn-secondary" @click="openPostEventModal('other', null, false)">
                      Add another school event
                    </button>
                  </div>

                  <div v-if="!hasBackToSchoolEvent && !btsAlternativeChosen" class="cua__bts-alt-links">
                    <span class="cua__muted">No Back-to-School event?</span>
                    <button type="button" class="cua__link-btn" @click="setBtsStatus('partner_unable')">
                      {{ tenantName }} is unable to attend
                    </button>
                    <button type="button" class="cua__link-btn" @click="setBtsStatus('no_event')">
                      We don't have a Back-to-School event
                    </button>
                  </div>

                  <div v-if="btsAlternativeChosen" class="cua__bts-selected">
                    <strong>{{ btsStatusLabel }}</strong>
                    <button type="button" class="cua__link-btn" @click="clearBtsAlternative">Change</button>
                  </div>

                  <div v-if="btsAlternativeChosen" class="cua__bts-details">
                    <p class="cua__muted">{{ btsAlternativeMessage }}</p>
                    <label>Notes (optional)
                      <textarea v-model="formData.school_events.bts_note" rows="2" placeholder="Optional notes" />
                    </label>
                  </div>

                  <div v-if="hasBackToSchoolEvent" class="cua__bts-details">
                    <p class="cua__muted" style="margin: 12px 0 8px;">{{ tenantName }} participation</p>
                    <label class="cua__check"><input v-model="formData.school_events.bts_partner_invited" type="checkbox" /> {{ tenantName }} is invited</label>
                    <label class="cua__check"><input v-model="formData.school_events.bts_marketing_table" type="checkbox" /> Marketing table can be set up</label>
                    <label class="cua__check"><input v-model="formData.school_events.bts_active_signups" type="checkbox" /> Active sign-ups are permitted</label>
                  </div>
                </div>
                <DynamicQuestions section-key="school_events" :questions="questionsFor('school_events')" v-model="formData.school_events" />
              </section>

              <section v-else-if="activeSection === 'assigned_providers'" class="cua__section-body">
                <div class="cua__bts-selected">
                  <div>
                    <strong>
                      {{ providerRoster.length }}
                      provider{{ providerRoster.length === 1 ? '' : 's' }} on your school roster
                    </strong>
                    <p class="cua__muted" style="margin: 4px 0 0;">
                      Confirm each clinician and their service day(s). This list refreshes from the school portal.
                    </p>
                  </div>
                  <button type="button" class="cua__link-btn" :disabled="providersRefreshing" @click="refreshProvidersRoster">
                    {{ providersRefreshing ? 'Refreshing…' : 'Refresh' }}
                  </button>
                </div>

                <div v-if="!providerRoster.length" class="cua__panel">
                  <p class="cua__muted">No provider day assignments on file yet. If clinicians are being added this year, your agency will update this — you can still complete this section below.</p>
                </div>

                <div v-else class="cua__provider-grid">
                  <article
                    v-for="p in providerRoster"
                    :key="p.providerUserId"
                    class="cua__provider-card"
                    :class="{ 'cua__provider-card--confirmed': isProviderDayConfirmed(p.providerUserId) }"
                  >
                    <div class="cua__provider-photo-wrap">
                      <img
                        v-if="p.photoUrl"
                        :src="p.photoUrl"
                        :alt="p.name"
                        class="cua__provider-photo"
                      />
                      <div v-else class="cua__provider-photo cua__provider-photo--fallback">
                        {{ providerInitials(p) }}
                      </div>
                    </div>
                    <div class="cua__provider-body">
                      <div class="cua__provider-card-head">
                        <h3 class="cua__provider-name">{{ p.name }}</h3>
                        <span
                          v-if="isProviderDayConfirmed(p.providerUserId)"
                          class="cua__confirmed-pill"
                        >
                          Confirmed
                        </span>
                      </div>
                      <p v-if="p.schoolInfoBlurb" class="cua__provider-blurb">{{ p.schoolInfoBlurb }}</p>
                      <p v-else-if="p.email" class="cua__muted">{{ p.email }}</p>
                      <span v-if="p.acceptingNewClients === false" class="cua__provider-badge">
                        Not accepting new clients
                      </span>
                      <p class="cua__provider-days-label">Days of service</p>
                      <ul class="cua__provider-days">
                        <li
                          v-for="a in sortedProviderAssignments(p)"
                          :key="a.id"
                          class="cua__provider-day"
                          :class="{ 'cua__provider-day--confirmed': isProviderDayConfirmed(p.providerUserId) }"
                        >
                          <div>
                            <strong>{{ a.dayOfWeek }}</strong>
                            <span
                              v-if="isProviderDayConfirmed(p.providerUserId)"
                              class="cua__confirmed-pill cua__confirmed-pill--inline"
                            >
                              Confirmed
                            </span>
                            <span v-if="a.startTime || a.endTime" class="cua__muted">
                              · {{ formatProviderTime(a.startTime) }}–{{ formatProviderTime(a.endTime) }}
                            </span>
                            <span v-if="a.slotsTotal != null" class="cua__muted">
                              · {{ a.slotsUsed ?? 0 }}/{{ a.slotsTotal }} slots
                            </span>
                          </div>
                          <button
                            type="button"
                            class="cua__link-btn"
                            @click="openProviderRemovalModal(p, a)"
                          >
                            Request remove
                          </button>
                        </li>
                      </ul>
                      <label
                        class="cua__provider-confirm-btn"
                        :class="{
                          'cua__provider-confirm-btn--confirmed': isProviderDayConfirmed(p.providerUserId),
                          'cua__provider-confirm-btn--pulse': !isProviderDayConfirmed(p.providerUserId),
                        }"
                      >
                        <input
                          type="checkbox"
                          class="cua__provider-confirm-btn__input"
                          :checked="isProviderDayConfirmed(p.providerUserId)"
                          @change="toggleProviderConfirm(p.providerUserId, $event.target.checked)"
                        />
                        <span class="cua__provider-confirm-btn__icon" aria-hidden="true">✓</span>
                        <span class="cua__provider-confirm-btn__text">
                          {{
                            isProviderDayConfirmed(p.providerUserId)
                              ? 'Confirmed'
                              : 'Confirm provider & days'
                          }}
                        </span>
                      </label>
                    </div>
                  </article>
                </div>

                <div v-if="allProvidersIndividuallyConfirmed || !providerRoster.length" class="cua__panel">
                  <h4>For the upcoming school year, do you expect to need changes?</h4>
                  <p class="cua__muted">
                    Let us know if you think you'll need more or fewer providers and/or service days.
                  </p>
                  <label class="cua__check">
                    <input v-model="formData.assigned_providers.capacity_outlook" type="radio" value="same" />
                    Same provider count and service days as this year
                  </label>
                  <label class="cua__check">
                    <input v-model="formData.assigned_providers.capacity_outlook" type="radio" value="more" />
                    We may need more providers and/or service days
                  </label>
                  <label class="cua__check">
                    <input v-model="formData.assigned_providers.capacity_outlook" type="radio" value="less" />
                    We may need fewer providers and/or service days
                  </label>
                  <label>Details (optional)
                    <textarea
                      v-model="formData.assigned_providers.notes"
                      rows="3"
                      placeholder="e.g., add a Thursday provider, reduce to three days per week…"
                    />
                  </label>
                </div>
              </section>

              <section v-else-if="activeSection === 'school_staff'" class="cua__section-body">
                <p class="cua__staff-roi-legend">
                  <span class="cua__roi-badge cua__roi-badge--on">ROI</span> Staff with a portal account can receive client Release of Information access.
                  <span class="cua__roi-badge cua__roi-badge--off">No ROI</span> Contact only — no portal account yet.
                </p>

                <div v-if="!staff.length" class="cua__muted">No staff contacts on file yet.</div>

                <ul class="cua__staff-grid">
                  <li
                    v-for="s in staff"
                    :key="s.id"
                    class="cua__staff-card"
                    :class="{ 'cua__staff-card--confirmed': confirmedStaffIdSet.has(s.id) }"
                  >
                    <div class="cua__staff-avatar" :class="{ 'cua__staff-avatar--confirmed': confirmedStaffIdSet.has(s.id) }">
                      {{ staffInitials(s) }}
                    </div>

                    <div class="cua__staff-info">
                      <div class="cua__staff-name">
                        {{ s.name }}
                        <span v-if="confirmedStaffIdSet.has(s.id)" class="cua__confirmed-pill cua__confirmed-pill--inline">Confirmed</span>
                      </div>

                      <!-- Editable role title -->
                      <div class="cua__staff-title-row">
                        <template v-if="staffEditState[s.id]?.editingTitle">
                          <input
                            v-model="staffEditState[s.id].draftTitle"
                            class="cua__staff-title-input"
                            type="text"
                            placeholder="e.g. Principal, Counselor…"
                            @keydown.enter="saveStaffTitle(s)"
                            @keydown.escape="cancelStaffTitleEdit(s)"
                          />
                          <button type="button" class="cua__link-btn" :disabled="saving" @click="saveStaffTitle(s)">Save</button>
                          <button type="button" class="cua__link-btn cua__muted" @click="cancelStaffTitleEdit(s)">Cancel</button>
                        </template>
                        <template v-else>
                          <span class="cua__staff-title-text">{{ s.title || 'No title set' }}</span>
                          <button type="button" class="cua__link-btn" @click="startStaffTitleEdit(s)">Edit title</button>
                        </template>
                      </div>

                      <div class="cua__staff-meta">
                        <span class="cua__muted cua__staff-email">{{ s.email }}</span>
                      </div>

                      <!-- Role flags -->
                      <div class="cua__staff-flags">
                        <button
                          v-for="flag in STAFF_FLAGS"
                          :key="flag.key"
                          type="button"
                          class="cua__staff-flag"
                          :class="{ 'cua__staff-flag--on': s[flag.key] }"
                          :title="flag.desc"
                          @click="requestStaffFlagToggle(s, flag.key)"
                        >
                          {{ flag.label }}
                        </button>
                        <!-- ROI indicator -->
                        <span
                          class="cua__roi-badge"
                          :class="s.userId ? 'cua__roi-badge--on' : 'cua__roi-badge--off'"
                          :title="s.userId ? 'Has portal account — can receive ROI access from clients' : 'No portal account — cannot receive ROI'"
                        >
                          {{ s.userId ? 'ROI ✓' : 'No ROI' }}
                        </span>
                      </div>
                    </div>

                    <div class="cua__staff-actions">
                      <label
                        class="cua__provider-confirm-btn cua__staff-confirm-btn"
                        :class="{
                          'cua__provider-confirm-btn--confirmed': confirmedStaffIdSet.has(s.id),
                          'cua__provider-confirm-btn--pulse': !confirmedStaffIdSet.has(s.id),
                        }"
                      >
                        <input
                          type="checkbox"
                          class="cua__provider-confirm-btn__input"
                          :checked="confirmedStaffIdSet.has(s.id)"
                          @change="toggleStaffConfirm(s.id, $event.target.checked)"
                        />
                        <span class="cua__provider-confirm-btn__icon" aria-hidden="true">✓</span>
                        <span class="cua__provider-confirm-btn__text">
                          {{ confirmedStaffIdSet.has(s.id) ? 'Confirmed' : 'Confirm' }}
                        </span>
                      </label>
                      <button type="button" class="cua__link-btn" @click="requestDelete('school_staff', s)">Request remove</button>
                    </div>
                  </li>
                </ul>

                <div class="cua__panel">
                  <h4>Add staff contact</h4>
                  <div class="cua__fields">
                    <label>Name <input v-model="newStaff.name" type="text" /></label>
                    <label>Email <input v-model="newStaff.email" type="email" /></label>
                    <label>Title <input v-model="newStaff.title" type="text" /></label>
                    <button type="button" class="btn btn-secondary" :disabled="!newStaff.name || !newStaff.email" @click="addStaff">Add (auto-approved)</button>
                  </div>
                </div>
              </section>

              <section v-else class="cua__section-body">
                <template v-if="activeSection === 'fall_check_in'">
                  <div v-if="checkinBooking" class="cua__panel" style="border-color: color-mix(in srgb, var(--cua-primary, #15803d) 35%, #e2e8f0); background: color-mix(in srgb, var(--cua-primary, #15803d) 6%, #fff);">
                    <h4>Check-in booked</h4>
                    <p>
                      <strong>{{ checkinBooking.modality === 'virtual' ? 'Virtual' : 'In person' }}</strong>
                      · {{ formatSlotRange(checkinBooking) }}
                    </p>
                    <p v-if="checkinBooking.location_text" class="cua__muted">{{ checkinBooking.location_text }}</p>
                    <p v-if="checkinBooking.meet_link">
                      Meet link:
                      <a :href="checkinBooking.meet_link" target="_blank" rel="noopener">{{ checkinBooking.meet_link }}</a>
                    </p>
                    <p class="cua__muted">On finalize, all school staff accounts will be invited to this check-in.</p>
                  </div>
                  <template v-else>
                    <div class="cua__panel">
                      <h4>1. Check-in format</h4>
                      <p class="cua__muted">Default is in person at your school. Request virtual if you need a Google Meet.</p>
                      <label class="cua__check">
                        <input v-model="formData.fall_check_in.fall_checkin_modality" type="radio" value="in_person" />
                        In person (at school)
                      </label>
                      <label class="cua__check">
                        <input v-model="formData.fall_check_in.fall_checkin_modality" type="radio" value="virtual" />
                        Request virtual
                      </label>
                    </div>
                    <div class="cua__panel">
                      <h4>2. Available {{ formData.fall_check_in.fall_checkin_modality === 'virtual' ? 'virtual' : 'in-person' }} pre-slots</h4>
                      <p v-if="!filteredCheckinSlots.length" class="cua__muted">
                        No open {{ formData.fall_check_in.fall_checkin_modality === 'virtual' ? 'virtual' : 'in-person' }} slots yet.
                        Prefer a time below, or ask your agency to add pre-slots.
                      </p>
                      <label v-for="slot in filteredCheckinSlots" :key="slot.id" class="cua__check">
                        <input v-model="formData.fall_check_in.fall_checkin_slot_id" type="radio" :value="String(slot.id)" />
                        {{ formatSlot(slot) }}
                      </label>
                      <button
                        type="button"
                        class="btn btn-primary"
                        style="margin-top: 10px;"
                        :disabled="!formData.fall_check_in.fall_checkin_slot_id || bookingSlot"
                        @click="bookSelectedSlot"
                      >
                        {{ bookingSlot ? 'Booking…' : 'Book selected slot' }}
                      </button>
                    </div>
                  </template>
                </template>
                <template v-if="activeSection === 'growth_feedback'">
                  <div class="cua__panel cua__panel--warn">
                    <h4>Annual feedback (please view)</h4>
                    <p class="cua__muted">What should {{ tenantName }} do more or less of? Mark “All good” if you have nothing to add.</p>
                  </div>
                </template>
                <template v-if="activeSection === 'needs_assessment'">
                  <div class="cua__panel cua__needs-guide">
                    <h4>Planning guide</h4>
                    <p>
                      Each full day on-site, a provider can typically see
                      <strong>5–7 clients</strong>.
                      Use that to estimate how many days you need each week.
                    </p>
                    <p v-if="currentProviderDaySummary" class="cua__muted cua__needs-current">
                      Right now: {{ currentProviderDaySummary }}
                    </p>
                    <div class="cua__needs-days">
                      <span class="cua__needs-days-label">
                        Days per week on-site <em>*</em>
                      </span>
                      <div class="cua__needs-day-chips" role="group" aria-label="Days per week on-site">
                        <button
                          v-for="n in 5"
                          :key="n"
                          type="button"
                          class="cua__needs-day-chip"
                          :class="{ 'is-selected': Number(formData.needs_assessment.days_per_week_onsite) === n }"
                          @click="formData.needs_assessment.days_per_week_onsite = n"
                        >
                          {{ n }}
                        </button>
                      </div>
                      <label class="cua__needs-other">
                        Or enter another amount
                        <input
                          v-model.number="formData.needs_assessment.days_per_week_onsite"
                          type="number"
                          min="0"
                          max="10"
                          step="1"
                        />
                      </label>
                      <p v-if="needsClientEstimate" class="cua__needs-estimate">
                        {{ needsClientEstimate }}
                      </p>
                    </div>
                  </div>
                </template>
                <DynamicQuestions
                  :section-key="activeSection"
                  :questions="dynamicQuestionsForActive"
                  v-model="formData[activeSection]"
                />
              </section>

              <SectionActions
                :done="isSectionDone(activeSection)"
                :saving="saving"
                :has-next="!!nextSectionKey"
                @save="saveSection(activeSection, false)"
                @confirm="onConfirmSection(activeSection)"
                @next="openSection(nextSectionKey)"
                @hub="viewMode = 'hub'"
              />
            </div>

            <!-- Finalize footer -->
            <div ref="finalizeEl" class="cua__finalize">
              <div class="cua__finalize-left">
                <span class="cua__finalize-lock">🔒</span>
                <div>
                  <strong>Finalize &amp; Submit</strong>
                  <p>Complete all sections above to unlock final review and submission.</p>
                </div>
              </div>
              <button
                type="button"
                class="btn cua__finalize-btn"
                :disabled="!canFinalize || saving"
                @click="finalize"
              >
                🔒 Finalize &amp; Submit
              </button>
            </div>
            <p v-if="pendingChangeCount" class="cua__muted" style="margin-top: 8px;">
              {{ pendingChangeCount }} change request(s) pending admin approval (finalize still allowed).
            </p>
          </main>
        </div>
      </template>
    </template>
  </div>

  <div
    v-if="providerRemovalModal.open"
    class="cua__modal-overlay"
    :style="brandStyle"
    @click.self="closeProviderRemovalModal"
  >
    <div class="cua__modal" role="dialog" aria-modal="true" aria-labelledby="provider-removal-title">
      <div class="cua__modal-header">
        <div>
          <h3 id="provider-removal-title" class="cua__modal-title">
            {{
              providerRemovalModal.step === 'preferred_days'
                ? 'Which days work for your school?'
                : 'Request provider day removal'
            }}
          </h3>
          <p v-if="providerRemovalModal.step === 'reason'" class="cua__muted cua__modal-subtitle">
            {{ providerRemovalModal.entity?.name }}
          </p>
          <p v-else class="cua__muted cua__modal-subtitle">
            This applies to your whole school — not just one provider.
          </p>
        </div>
        <button type="button" class="cua__modal-close" @click="closeProviderRemovalModal">Close</button>
      </div>

      <div class="cua__modal-body">
        <template v-if="providerRemovalModal.step === 'reason'">
          <p class="cua__modal-lead">
            Please choose a reason. An admin must approve this change before it takes effect.
          </p>

          <div class="cua__removal-reasons" role="radiogroup" aria-label="Removal reason">
            <label
              v-for="reason in providerRemovalReasons"
              :key="reason.value"
              class="cua__removal-reason"
              :class="{ 'cua__removal-reason--selected': providerRemovalModal.reason === reason.value }"
            >
              <input
                v-model="providerRemovalModal.reason"
                type="radio"
                name="provider-removal-reason"
                :value="reason.value"
              />
              <span>
                <strong>{{ reason.label }}</strong>
                <small v-if="reason.description" class="cua__muted">{{ reason.description }}</small>
              </span>
            </label>
          </div>
        </template>

        <template v-else>
          <p class="cua__modal-lead">
            Select all days that work for your school this year. We’ll keep any provider days that already
            match, and request removal of days that don’t — we can’t assume a new day is available for a
            specific clinician.
          </p>

          <div class="cua__day-picker" role="group" aria-label="Days that work">
            <label
              v-for="day in PROVIDER_DAY_ORDER"
              :key="day"
              class="cua__day-chip"
              :class="{ 'cua__day-chip--selected': providerRemovalModal.preferredDays.includes(day) }"
            >
              <input
                type="checkbox"
                :checked="providerRemovalModal.preferredDays.includes(day)"
                @change="togglePreferredDay(day, $event.target.checked)"
              />
              <span>{{ day }}</span>
            </label>
          </div>

          <div v-if="providerRemovalModal.preferredDays.length" class="cua__day-preview">
            <p v-if="assignmentsKeptForPreferredDays.length">
              <strong>Kept (already match):</strong>
              {{ formatAssignmentPreview(assignmentsKeptForPreferredDays) }}
            </p>
            <p v-else class="cua__muted">No current provider days match your selection yet.</p>
            <p v-if="assignmentsToRemoveForPreferredDays.length">
              <strong>Request removal:</strong>
              {{ formatAssignmentPreview(assignmentsToRemoveForPreferredDays) }}
            </p>
            <p v-else class="cua__muted">All current provider days already match your selection.</p>
          </div>
        </template>

        <p v-if="providerRemovalModal.error" class="cua__modal-error">{{ providerRemovalModal.error }}</p>
      </div>

      <div class="cua__modal-footer">
        <button
          v-if="providerRemovalModal.step === 'preferred_days'"
          type="button"
          class="btn btn-secondary"
          @click="backToRemovalReasonStep"
        >
          Back
        </button>
        <button type="button" class="btn btn-secondary" @click="closeProviderRemovalModal">Cancel</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!canContinueProviderRemoval || saving"
          @click="continueProviderRemoval"
        >
          {{
            providerRemovalModal.step === 'preferred_days'
              ? 'Submit day change request'
              : providerRemovalModal.reason === 'different_day'
                ? 'Continue'
                : 'Submit removal request'
          }}
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="providersConfirmModal.open"
    class="cua__modal-overlay"
    :style="brandStyle"
    @click.self="closeProvidersConfirmModal"
  >
    <div class="cua__modal" role="dialog" aria-modal="true" aria-labelledby="providers-confirm-title">
      <div class="cua__modal-header">
        <div>
          <h3 id="providers-confirm-title" class="cua__modal-title">Confirm all providers and days?</h3>
          <p class="cua__muted cua__modal-subtitle">
            You're saying everything looks accurate for
            {{ providerRoster.length }} provider{{ providerRoster.length === 1 ? '' : 's' }}
            and their service days.
          </p>
        </div>
        <button type="button" class="cua__modal-close" @click="closeProvidersConfirmModal">Close</button>
      </div>

      <div class="cua__modal-body">
        <p class="cua__modal-lead">
          Confirming means you’re okay with all providers and days listed above. If you Cancel, you can
          confirm each provider one by one — each will show Confirmed next to the provider and their days.
        </p>

        <ul class="cua__providers-confirm-list">
          <li v-for="p in providerRoster" :key="p.providerUserId">
            <strong>{{ p.name }}</strong>
            <span class="cua__muted">
              {{
                sortedProviderAssignments(p)
                  .map((a) => a.dayOfWeek)
                  .join(', ') || 'No days listed'
              }}
            </span>
          </li>
        </ul>
      </div>

      <div class="cua__modal-footer">
        <button type="button" class="btn btn-secondary" @click="closeProvidersConfirmModal">
          Cancel — confirm one by one
        </button>
        <button type="button" class="btn btn-primary" @click="confirmAllProviders">
          Yes, confirm all providers &amp; days
        </button>
      </div>
    </div>
  </div>

  <div
    v-if="staffConfirmModal.open"
    class="cua__modal-overlay"
    :style="brandStyle"
    @click.self="closeStaffConfirmModal"
  >
    <div class="cua__modal" role="dialog" aria-modal="true" aria-labelledby="staff-confirm-title">
      <div class="cua__modal-header">
        <div>
          <h3 id="staff-confirm-title" class="cua__modal-title">Confirm all staff contacts?</h3>
          <p class="cua__muted cua__modal-subtitle">
            You're saying the {{ staff.length }} staff contact{{ staff.length === 1 ? '' : 's' }} listed look accurate.
          </p>
        </div>
        <button type="button" class="cua__modal-close" @click="closeStaffConfirmModal">Close</button>
      </div>

      <div class="cua__modal-body">
        <p class="cua__modal-lead">
          Are you confirming these contacts look correct? Cancel to confirm each person one by one — each will show Confirmed once done.
        </p>

        <ul class="cua__providers-confirm-list">
          <li v-for="s in staff" :key="s.id">
            <strong>{{ s.name }}</strong>
            <span class="cua__muted">{{ [s.title, s.email].filter(Boolean).join(' · ') }}</span>
          </li>
        </ul>
      </div>

      <div class="cua__modal-footer">
        <button type="button" class="btn btn-secondary" @click="closeStaffConfirmModal">
          Cancel — confirm one by one
        </button>
        <button type="button" class="btn btn-primary" @click="confirmAllStaff">
          Yes, confirm all staff
        </button>
      </div>
    </div>
  </div>

  <PostSchoolEventModal
    v-if="postEventModal.open"
    :school-organization-id="Number(school?.id || props.schoolOrganizationId || 0) || null"
    :school-name="schoolName"
    :agency-id="Number(agency?.id || props.agencyId || 0) || null"
    :initial-category="postEventModal.category"
    :locked-category="postEventModal.lockCategory"
    :edit-event="postEventModal.editEvent"
    :reinit-token="eventReinitToken"
    :reinit-identity="reinitIdentityPayload"
    :partner-label="tenantName"
    @close="closePostEventModal"
    @saved="onSchoolEventSaved"
  />
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../../services/api';
import {
  SECTION_META,
  logoSrc,
  parseAgencyPalette,
  agencyDisplayName,
  formatSchoolYearLabel,
  sectionProgressMap,
  schoolEventCategoryLabel,
  loadStoredIdentity,
  storeIdentity,
  publicReinitUrl,
  copyTextToClipboard,
  PROVIDER_REMOVAL_REASONS,
  providerRemovalReasonLabel,
} from '../../../utils/schoolReinit';
import SchoolReinitReceipt from './SchoolReinitReceipt.vue';
import DynamicQuestions from './SchoolReinitDynamicQuestions.vue';
import SectionActions from './SchoolReinitSectionActions.vue';
import SchoolReinitValidationAlert from './SchoolReinitValidationAlert.vue';
import PostSchoolEventModal from '../PostSchoolEventModal.vue';

const props = defineProps({
  mode: { type: String, default: 'staff' }, // staff | token | admin
  token: { type: String, default: null },
  schoolOrganizationId: { type: [Number, String], default: null },
  agencyId: { type: [Number, String], default: null },
  embedded: { type: Boolean, default: false },
  initialPayload: { type: Object, default: null },
});

const emit = defineEmits(['finalized', 'dismiss-request', 'loaded']);

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const loadError = ref('');
const bannerError = ref('');
const sectionAlert = ref(null);
const cycle = ref(null);
const agency = ref(null);
const school = ref(null);
const sections = ref([]);
const providers = ref([]);
const staff = ref([]);
const events = ref(null);
const questions = ref([]);
const checkinSlots = ref([]);
const checkinBooking = ref(null);
const bookingSlot = ref(false);
const changeRequests = ref([]);
const addendums = ref([]);
const shareToken = ref(null);
const postEventModal = ref({ open: false, category: 'back_to_school', editEvent: null, lockCategory: true });
const providerRemovalModal = ref({
  open: false,
  step: 'reason',
  entity: null,
  reason: '',
  preferredDays: [],
  error: '',
});
const providersConfirmModal = ref({ open: false, pendingSectionConfirm: false });
const staffConfirmModal = ref({ open: false, pendingSectionConfirm: false });
const providerRemovalReasons = PROVIDER_REMOVAL_REASONS;
const viewMode = ref('hub'); // hub | detail
const activeSection = ref('school_events');
const identityName = ref('');
const identityTitle = ref('');
const identityConfirmed = ref(false);
const copyFlash = ref(false);
const finalizeEl = ref(null);
const newStaff = reactive({ name: '', email: '', title: '' });

const sectionMeta = SECTION_META;

const formData = reactive({
  school_events: {
    first_day_of_school: '',
    bts_status: '',
    bts_event_date: '',
    bts_event_title: '',
    bts_note: '',
    bts_partner_invited: false,
    bts_marketing_table: false,
    bts_active_signups: false,
  },
  assigned_providers: {
    providers_confirmed: false,
    confirmed_provider_ids: [],
    preferred_service_days: [],
    capacity_outlook: '',
    notes: '',
    same_arrangements: true,
  },
  school_staff: { staff_accurate: false, confirmed_staff_ids: [] },
  materials: {},
  needs_assessment: {},
  fall_check_in: {
    fall_checkin_modality: 'in_person',
    fall_checkin_slot_id: '',
    fall_checkin_preferred_week: '',
    fall_checkin_preferred_day: '',
    fall_checkin_preferred_time: '',
  },
  growth_feedback: {},
});

const PROVIDER_DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const STAFF_FLAGS = [
  { key: 'isPrimary',    label: 'Primary',   desc: 'Main point of contact for the school' },
  { key: 'isSchoolAdmin', label: 'Admin',    desc: 'Can manage the school portal' },
  { key: 'isScheduler',  label: 'Scheduler', desc: 'Can schedule sessions and manage calendar' },
];
const staffEditState = reactive({});

const providersRefreshing = ref(false);
const providerRoster = computed(() => {
  const list = providers.value || [];
  if (!list.length) return [];
  if (Array.isArray(list[0]?.assignments)) return list;
  const byId = new Map();
  for (const row of list) {
    const pid = row.providerUserId || row.provider_user_id;
    if (!pid) continue;
    if (!byId.has(pid)) {
      byId.set(pid, {
        providerUserId: pid,
        name: row.name,
        email: row.email,
        photoUrl: row.photoUrl || row.photo_url || null,
        schoolInfoBlurb: row.schoolInfoBlurb || row.school_info_blurb || null,
        acceptingNewClients: row.acceptingNewClients !== false,
        assignments: [],
      });
    }
    byId.get(pid).assignments.push({
      id: row.id,
      dayOfWeek: row.dayOfWeek || row.day_of_week,
      slotsTotal: row.slotsTotal ?? row.slots_total,
      slotsUsed: row.slotsUsed ?? row.slots_used,
      startTime: row.startTime || row.start_time,
      endTime: row.endTime || row.end_time,
    });
  }
  return Array.from(byId.values());
});
const confirmedProviderIdSet = computed(() => {
  const ids = formData.assigned_providers.confirmed_provider_ids;
  return new Set((Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter(Boolean));
});
const allProvidersIndividuallyConfirmed = computed(() => {
  const roster = providerRoster.value;
  if (!roster.length) return true;
  return roster.every((p) => confirmedProviderIdSet.value.has(Number(p.providerUserId)));
});

const confirmedStaffIdSet = computed(() => {
  const ids = formData.school_staff.confirmed_staff_ids;
  return new Set((Array.isArray(ids) ? ids : []).map((id) => Number(id)).filter(Boolean));
});
const allStaffConfirmed = computed(() => {
  if (!staff.value.length) return true;
  return staff.value.every((s) => confirmedStaffIdSet.value.has(Number(s.id)));
});

const filteredCheckinSlots = computed(() => {
  const modality = formData.fall_check_in.fall_checkin_modality || 'in_person';
  const now = Date.now();
  return (checkinSlots.value || []).filter((s) => {
    if (s.status && s.status !== 'open') return false;
    if (String(s.modality || 'in_person') !== modality) return false;
    // Hide slots that have already passed (wall-clock, no UTC shift)
    const slotTime = parseSlotWallClock(s.starts_at)?.getTime();
    if (slotTime != null && slotTime < now) return false;
    return true;
  });
});

const ICONS = {
  calendar: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  confetti: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l5 5M14 4l-2 4M20 8l-4 2M4 14l4 2M9 20l2-4M16 16l4 4"/><circle cx="12" cy="12" r="3"/></svg>',
  providers: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
  staff: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
  box: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>',
  chart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>',
  clock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  heart: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>',
};

const isFinalized = computed(() => String(cycle.value?.status || '') === 'finalized');
const progressMap = computed(() => sectionProgressMap(sections.value));
const doneCount = computed(() => sectionMeta.filter((s) => isSectionDone(s.key)).length);
const percentComplete = computed(() => Math.round((doneCount.value / sectionMeta.length) * 100));
const canFinalize = computed(() => sectionMeta.every((s) => isSectionDone(s.key)));
const pendingChangeCount = computed(
  () => (changeRequests.value || []).filter((c) => c.status === 'pending').length
);
const firstIncompleteKey = computed(() => sectionMeta.find((s) => !isSectionDone(s.key))?.key || null);
const nextSectionKey = computed(() => {
  const currentIdx = sectionMeta.findIndex((s) => s.key === activeSection.value);
  if (currentIdx < 0) return null;
  const next = sectionMeta[currentIdx + 1];
  return next?.key || null;
});
const schoolName = computed(() => school.value?.name || 'School');
const tenantLogo = computed(() => {
  const full = logoSrc(agency.value, { allowIcon: false });
  if (full) return full;
  return logoSrc(agency.value, { allowIcon: true });
});
const schoolLogo = computed(() => logoSrc(school.value, { allowIcon: true }));
const tenantName = computed(() => agencyDisplayName(agency.value, 'Partner'));
const displayFirstDay = computed(() => {
  if (events.value?.firstDay?.startsAt) return events.value.firstDay;
  const saved = String(formData.school_events.first_day_of_school || '').trim();
  if (saved) {
    return {
      title: 'First Day of School',
      startsAt: saved,
      category: 'first_day',
      fromSaved: true,
    };
  }
  return null;
});
const schoolAttendableEvents = computed(() => events.value?.attendableEvents || []);
const hasBackToSchoolEvent = computed(() =>
  schoolAttendableEvents.value.some((e) => String(e.category || '') === 'back_to_school')
);
const BTS_ALTERNATIVE_STATUSES = ['no_event', 'partner_unable'];
const btsAlternativeChosen = computed(() =>
  BTS_ALTERNATIVE_STATUSES.includes(String(formData.school_events.bts_status || ''))
);
const btsStatusLabel = computed(() => {
  const s = formData.school_events.bts_status;
  if (s === 'has_event') return 'Back-to-School event added';
  if (s === 'no_event') return "We don't have a Back-to-School event";
  if (s === 'partner_not_invited') return `${tenantName.value} isn't invited`;
  if (s === 'partner_unable') return `${tenantName.value} is unable to attend`;
  return '';
});
const btsAlternativeMessage = computed(() => {
  const s = formData.school_events.bts_status;
  if (s === 'no_event') return "Thanks — we'll note that your school doesn't have a Back-to-School event this year.";
  if (s === 'partner_not_invited') return `We'll note that ${tenantName.value} is not invited to your Back-to-School event.`;
  if (s === 'partner_unable') return `We'll note that ${tenantName.value} is unable to attend this year.`;
  return '';
});
const brandStyle = computed(() => {
  const p = parseAgencyPalette(agency.value);
  return {
    '--cua-primary': p.primary,
    '--cua-secondary': p.secondary,
    '--cua-accent': p.accent,
  };
});
const needsIdentity = computed(
  () => props.mode === 'token' && !identityConfirmed.value && !isFinalized.value
);
const canContinueIdentity = computed(
  () => Boolean(identityName.value.trim() && identityTitle.value.trim())
);
const schoolYearDisplay = computed(() => formatSchoolYearLabel(cycle.value?.school_year));
const identityBanner = computed(() => {
  if (props.mode === 'token') {
    return [identityName.value, identityTitle.value].filter(Boolean).join(', ') || '';
  }
  return '';
});
const userInitials = computed(() => {
  const name = identityBanner.value || schoolName.value || 'S';
  const parts = name.split(/[\s,]+/).filter(Boolean);
  return ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
});
const eventReinitToken = computed(() => {
  if (props.mode === 'token') return props.token || '';
  return shareToken.value?.token || '';
});
const reinitIdentityPayload = computed(() => ({
  displayName: identityName.value.trim(),
  identityTitle: identityTitle.value.trim(),
}));

function isSectionDone(key) {
  const s = progressMap.value[key];
  return Boolean(s?.reviewed || s?.completed);
}
function sectionTitle(key) {
  return sectionMeta.find((s) => s.key === key)?.title || key;
}
function sectionHint(key) {
  return sectionMeta.find((s) => s.key === key)?.hint || '';
}
function sectionIcon(name) {
  return ICONS[name] || ICONS.calendar;
}
function questionsFor(sectionKey) {
  return (questions.value || []).filter((q) => q.section_key === sectionKey);
}

/** Keys rendered with dedicated UI in the parent (not DynamicQuestions). */
const NEEDS_ASSESSMENT_CUSTOM_KEYS = new Set(['days_per_week_onsite']);

const dynamicQuestionsForActive = computed(() => {
  const list = questionsFor(activeSection.value);
  if (activeSection.value !== 'needs_assessment') return list;
  return list.filter((q) => !NEEDS_ASSESSMENT_CUSTOM_KEYS.has(q.question_key));
});

const currentProviderDaySummary = computed(() => {
  const roster = providerRoster.value;
  if (!roster.length) return '';
  const assignmentDays = roster.reduce((n, p) => n + (p.assignments?.length || 0), 0);
  const providerLabel = `${roster.length} provider${roster.length === 1 ? '' : 's'}`;
  if (!assignmentDays) return `${providerLabel} on your roster`;
  return `${providerLabel} covering about ${assignmentDays} provider-day${assignmentDays === 1 ? '' : 's'} per week`;
});

const needsClientEstimate = computed(() => {
  const days = Number(formData.needs_assessment.days_per_week_onsite);
  if (!Number.isFinite(days) || days <= 0) return '';
  const low = Math.round(days * 5);
  const high = Math.round(days * 7);
  const dayLabel = days === 1 ? '1 full day' : `${days} full days`;
  return `With ${dayLabel} on-site, that’s roughly ${low}–${high} clients per week.`;
});
function formatDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatSchoolEventWhen(event) {
  if (!event?.startsAt) return '';
  const date = formatDate(event.startsAt);
  const start = formatProviderTime(event.startsAt);
  const end = event.endsAt ? formatProviderTime(event.endsAt) : '';
  return end && end !== '—' ? `${date} · ${start} – ${end}` : date;
}
function syncSchoolEventsFromPortal() {
  const first = events.value?.firstDay;
  const bts = events.value?.backToSchool;
  const attendable = events.value?.attendableEvents || [];
  if (first?.startsAt) {
    formData.school_events.first_day_of_school = String(first.startsAt).slice(0, 10);
  }
  if (bts || hasBackToSchoolEvent.value) {
    const primary = bts || attendable.find((e) => e.category === 'back_to_school');
    formData.school_events.bts_status = 'has_event';
    if (primary?.startsAt) formData.school_events.bts_event_date = String(primary.startsAt).slice(0, 10);
    if (primary?.title) formData.school_events.bts_event_title = primary.title;
    if (primary?.outreachTableInvited) {
      formData.school_events.bts_partner_invited = true;
      formData.school_events.bts_marketing_table = true;
    }
  }
}
function openPostEventModal(category, editEvent = null, lockCategory = false) {
  postEventModal.value = {
    open: true,
    category: editEvent?.category || category,
    editEvent: editEvent || null,
    lockCategory: Boolean(lockCategory || (category === 'back_to_school' && !editEvent)),
  };
}
function closePostEventModal() {
  postEventModal.value = { open: false, category: 'back_to_school', editEvent: null, lockCategory: true };
}
async function onSchoolEventSaved() {
  const savedCategory = postEventModal.value.category;
  closePostEventModal();
  await load();
  syncSchoolEventsFromPortal();
  if (savedCategory === 'back_to_school' || hasBackToSchoolEvent.value) {
    formData.school_events.bts_status = 'has_event';
    formData.school_events.bts_note = '';
  }
}
function setBtsStatus(status) {
  formData.school_events.bts_status = status;
  clearSectionAlert('school_events');
}
function clearBtsAlternative() {
  formData.school_events.bts_status = hasBackToSchoolEvent.value ? 'has_event' : '';
  formData.school_events.bts_note = '';
  clearSectionAlert('school_events');
}
/** Check-in slots are wall-clock times — never shift by timezone. */
function parseSlotWallClock(raw) {
  if (!raw) return null;
  const m = String(raw)
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0)
  );
}
function formatSlot(slot) {
  const label = slot.label ? `${slot.label} — ` : '';
  const start = slot.starts_at || slot.startsAt;
  const end = slot.ends_at || slot.endsAt;
  const startLabel = formatDateTime(start);
  if (!end) return `${label}${startLabel}`;
  const endTime = formatTimeOnly(end);
  return `${label}${startLabel} – ${endTime}`;
}
function formatDateTime(raw) {
  if (!raw) return '—';
  const d = parseSlotWallClock(raw);
  if (!d) return String(raw);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function formatTimeOnly(raw) {
  if (!raw) return '';
  const d = parseSlotWallClock(raw);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function formatProviderTime(raw) {
  const text = String(raw || '').trim();
  if (!text) return '—';
  if (text.includes('T') || text.includes(' ')) return formatTimeOnly(text);
  const [hh, mm] = text.slice(0, 5).split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return text;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}
function providerInitials(p) {
  const parts = String(p?.name || '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'P') + (parts[1]?.[0] || '')).toUpperCase();
}
function staffInitials(s) {
  const parts = String(s?.name || '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'S') + (parts[1]?.[0] || '')).toUpperCase();
}

function startStaffTitleEdit(s) {
  staffEditState[s.id] = { editingTitle: true, draftTitle: s.title || '' };
}
function cancelStaffTitleEdit(s) {
  staffEditState[s.id] = { editingTitle: false, draftTitle: '' };
}
async function saveStaffTitle(s) {
  const draft = String(staffEditState[s.id]?.draftTitle || '').trim();
  if (draft === (s.title || '').trim()) {
    cancelStaffTitleEdit(s);
    return;
  }
  const ok = await requestModifyStaff(s, { title: draft });
  if (ok) {
    s.title = draft;
    cancelStaffTitleEdit(s);
  }
}
async function requestStaffFlagToggle(s, flagKey) {
  const flagMap = { isPrimary: 'is_primary', isSchoolAdmin: 'is_school_admin', isScheduler: 'is_scheduler' };
  const dbKey = flagMap[flagKey];
  if (!dbKey) return;
  const newVal = !s[flagKey];
  const label = STAFF_FLAGS.find((f) => f.key === flagKey)?.label || flagKey;
  if (!window.confirm(`Request ${newVal ? 'adding' : 'removing'} the ${label} role for ${s.name}? An admin must approve this change.`)) return;
  const ok = await requestModifyStaff(s, { [dbKey]: newVal });
  if (ok) s[flagKey] = newVal;
}
async function requestModifyStaff(s, changes) {
  saving.value = true;
  try {
    const body = {
      cycleId: cycle.value.id,
      entityType: 'school_staff',
      entityId: s.id,
      action: 'modify',
      before: { name: s.name, title: s.title, email: s.email, isPrimary: s.isPrimary, isSchoolAdmin: s.isSchoolAdmin, isScheduler: s.isScheduler },
      after: { name: s.name, title: s.title, email: s.email, ...changes },
      ...actorPayload(),
    };
    if (props.mode === 'admin' && shareToken.value?.token) body.displayName = 'Agency admin';
    const res = await api.post(changeRequestPath(), body);
    if (res.data.changeRequest) changeRequests.value = [res.data.changeRequest, ...changeRequests.value];
    return true;
  } catch (e) {
    bannerError.value = e?.response?.data?.error?.message || e?.message || 'Request failed';
    return false;
  } finally {
    saving.value = false;
  }
}

function toggleStaffConfirm(staffId, checked) {
  const id = Number(staffId);
  if (!id) return;
  const current = Array.isArray(formData.school_staff.confirmed_staff_ids)
    ? formData.school_staff.confirmed_staff_ids.map(Number)
    : [];
  formData.school_staff.confirmed_staff_ids = checked
    ? Array.from(new Set([...current, id]))
    : current.filter((x) => x !== id);
  formData.school_staff.staff_accurate =
    staff.value.length > 0 && staff.value.every((s) => formData.school_staff.confirmed_staff_ids.includes(Number(s.id)));
}
function sortedProviderAssignments(p) {
  return (p?.assignments || [])
    .slice()
    .sort(
      (a, b) =>
        PROVIDER_DAY_ORDER.indexOf(String(a.dayOfWeek || '')) -
        PROVIDER_DAY_ORDER.indexOf(String(b.dayOfWeek || ''))
    );
}
function assignmentEntity(provider, assignment) {
  return {
    id: assignment.id,
    name: `${provider.name} (${assignment.dayOfWeek})`,
    dayOfWeek: assignment.dayOfWeek,
    providerUserId: provider.providerUserId,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    slotsTotal: assignment.slotsTotal,
  };
}
function isProviderDayConfirmed(providerUserId) {
  return confirmedProviderIdSet.value.has(Number(providerUserId));
}
function toggleProviderConfirm(providerUserId, checked) {
  const id = Number(providerUserId);
  if (!id) return;
  const current = Array.isArray(formData.assigned_providers.confirmed_provider_ids)
    ? [...formData.assigned_providers.confirmed_provider_ids]
    : [];
  const next = checked
    ? Array.from(new Set([...current.map(Number), id]))
    : current.map(Number).filter((x) => x !== id);
  formData.assigned_providers.confirmed_provider_ids = next;
  formData.assigned_providers.providers_confirmed =
    providerRoster.value.length > 0 &&
    providerRoster.value.every((p) => next.includes(Number(p.providerUserId)));
  if (!formData.assigned_providers.providers_confirmed) {
    // Keep capacity answers; just clear overall confirm flag
  }
  clearSectionAlert('assigned_providers');
}
function onProvidersConfirmedToggle(checked) {
  if (checked) {
    formData.assigned_providers.confirmed_provider_ids = providerRoster.value.map((p) =>
      Number(p.providerUserId)
    );
    formData.assigned_providers.providers_confirmed = true;
  } else {
    formData.assigned_providers.providers_confirmed = false;
    formData.assigned_providers.confirmed_provider_ids = [];
  }
  clearSectionAlert('assigned_providers');
}

function closeProvidersConfirmModal() {
  providersConfirmModal.value = { open: false, pendingSectionConfirm: false };
}

async function confirmAllProviders() {
  onProvidersConfirmedToggle(true);
  const pendingSectionConfirm = providersConfirmModal.value.pendingSectionConfirm;
  closeProvidersConfirmModal();
  if (pendingSectionConfirm) {
    await onConfirmSection('assigned_providers');
  }
}

function closeStaffConfirmModal() {
  staffConfirmModal.value = { open: false, pendingSectionConfirm: false };
}

async function confirmAllStaff() {
  formData.school_staff.confirmed_staff_ids = staff.value.map((s) => Number(s.id));
  formData.school_staff.staff_accurate = true;
  const pendingSectionConfirm = staffConfirmModal.value.pendingSectionConfirm;
  closeStaffConfirmModal();
  if (pendingSectionConfirm) {
    await onConfirmSection('school_staff');
  }
}

function pruneConfirmedProviderIds() {
  const valid = new Set(providerRoster.value.map((p) => Number(p.providerUserId)));
  const current = Array.isArray(formData.assigned_providers.confirmed_provider_ids)
    ? formData.assigned_providers.confirmed_provider_ids.map(Number).filter((id) => valid.has(id))
    : [];
  formData.assigned_providers.confirmed_provider_ids = current;
  if (formData.assigned_providers.providers_confirmed && providerRoster.value.length) {
    formData.assigned_providers.providers_confirmed = providerRoster.value.every((p) =>
      current.includes(Number(p.providerUserId))
    );
  }
}
async function fetchDashboardPayload() {
  if (props.initialPayload && !props.token && props.mode !== 'admin' && props.mode !== 'staff') {
    return props.initialPayload;
  }
  if (props.mode === 'token') {
    const res = await api.get(`/public/school-reinit/${props.token}`);
    return res.data;
  }
  if (props.mode === 'admin') {
    const res = await api.get(`/school-reinit/schools/${props.schoolOrganizationId}`, {
      params: { agencyId: props.agencyId },
    });
    return res.data;
  }
  const res = await api.get('/school-reinit/me', {
    params: {
      schoolOrganizationId: props.schoolOrganizationId,
      agencyId: props.agencyId || undefined,
    },
  });
  return res.data;
}

async function refreshProvidersRoster() {
  providersRefreshing.value = true;
  try {
    const data = await fetchDashboardPayload();
    providers.value = data.providers || [];
    // Keep staff/events lightly in sync too without full-page reload flash
    if (data.staff) staff.value = data.staff;
    if (data.events) events.value = data.events;
    pruneConfirmedProviderIds();
  } catch (e) {
    bannerError.value = e?.response?.data?.error?.message || e?.message || 'Could not refresh providers';
  } finally {
    providersRefreshing.value = false;
  }
}
function formatSlotRange(booking) {
  return formatSlot({
    starts_at: booking.starts_at || booking.startsAt,
    ends_at: booking.ends_at || booking.endsAt,
    label: booking.slot_label,
  });
}

function openSection(key) {
  clearSectionAlert();
  bannerError.value = '';
  activeSection.value = key;
  viewMode.value = 'detail';
  if (key === 'assigned_providers') {
    void refreshProvidersRoster();
  }
}
function scrollFinalize() {
  viewMode.value = 'hub';
  setTimeout(() => finalizeEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}
function onExit() {
  if (props.embedded || props.mode === 'staff' || props.mode === 'admin') {
    emit('dismiss-request');
    return;
  }
  const slug = school.value?.portal_url || school.value?.slug;
  if (slug) router.push(`/${slug}/dashboard`);
  else emit('dismiss-request');
}

function applyPayload(data) {
  cycle.value = data.cycle;
  agency.value = data.agency;
  school.value = data.school;
  sections.value = data.sections || [];
  providers.value = data.providers || [];
  staff.value = data.staff || [];
  events.value = data.events || null;
  questions.value = data.questions || [];
  checkinSlots.value = data.checkinSlots || [];
  checkinBooking.value = data.checkinBooking || null;
  changeRequests.value = data.changeRequests || [];
  addendums.value = data.addendums || [];
  shareToken.value = data.shareToken || (data.token ? { token: data.token, path: `/school-reinit/${data.token}` } : null);
  if (!formData.fall_check_in.fall_checkin_modality) {
    formData.fall_check_in.fall_checkin_modality = 'in_person';
  }

  for (const s of sections.value) {
    if (s.data && formData[s.sectionKey]) {
      Object.assign(formData[s.sectionKey], s.data);
    }
  }
  if (events.value?.firstDay?.startsAt && !formData.school_events.first_day_of_school) {
    formData.school_events.first_day_of_school = String(events.value.firstDay.startsAt).slice(0, 10);
  }
  if (events.value?.backToSchool?.startsAt) {
    if (!formData.school_events.bts_event_date) {
      formData.school_events.bts_event_date = String(events.value.backToSchool.startsAt).slice(0, 10);
    }
    if (!formData.school_events.bts_event_title && events.value.backToSchool.title) {
      formData.school_events.bts_event_title = events.value.backToSchool.title;
    }
    if (!formData.school_events.bts_status) {
      formData.school_events.bts_status = 'has_event';
    }
  } else if (
    !formData.school_events.bts_status &&
    (formData.school_events.bts_partner_invited ||
      formData.school_events.bts_marketing_table ||
      formData.school_events.bts_active_signups ||
      formData.school_events.bts_event_date)
  ) {
    formData.school_events.bts_status = 'has_event';
  }
  if (events.value?.backToSchool?.outreachTableInvited) {
    formData.school_events.bts_marketing_table = true;
    formData.school_events.bts_partner_invited = true;
  }
  // Migrate older answer key if present
  if (formData.school_events.bts_itsco_invited && !formData.school_events.bts_partner_invited) {
    formData.school_events.bts_partner_invited = Boolean(formData.school_events.bts_itsco_invited);
  }

  const ap = formData.assigned_providers;
  if (ap.same_arrangements && !ap.capacity_outlook) {
    ap.capacity_outlook = 'same';
  }
  if (!Array.isArray(ap.confirmed_provider_ids)) {
    ap.confirmed_provider_ids = [];
  }
  if (!Array.isArray(ap.preferred_service_days)) {
    ap.preferred_service_days = [];
  } else {
    ap.preferred_service_days = PROVIDER_DAY_ORDER.filter((d) =>
      ap.preferred_service_days.includes(d)
    );
  }
  // If previously confirmed overall, seed per-provider confirms from current roster
  if (ap.providers_confirmed && !ap.confirmed_provider_ids.length && providerRoster.value.length) {
    ap.confirmed_provider_ids = providerRoster.value.map((p) => Number(p.providerUserId));
  }
  pruneConfirmedProviderIds();
  ap.same_arrangements = ap.capacity_outlook === 'same';

  syncSchoolEventsFromPortal();

  const stored = loadStoredIdentity(cycle.value?.id);
  if (stored?.name) {
    identityName.value = stored.name;
    identityTitle.value = stored.title || '';
    identityConfirmed.value = true;
  }
  emit('loaded', data);
}

function clearSectionAlert(sectionKey = null) {
  if (!sectionAlert.value) return;
  if (!sectionKey || sectionAlert.value.sectionKey === sectionKey) {
    sectionAlert.value = null;
  }
}

function showSectionMessage(sectionKey, title, message, whyText = '', variant = 'info') {
  sectionAlert.value = {
    sectionKey,
    title,
    message,
    whyText,
    actions: [],
    extraActions: [],
    variant,
  };
}

function validateSchoolEventsSection() {
  if (!displayFirstDay.value?.startsAt && !String(formData.school_events.first_day_of_school || '').trim()) {
    return {
      sectionKey: 'school_events',
      title: 'First Day of School Required',
      message: 'Add your first day of school on the school portal calendar before marking this section complete.',
      whyText: 'We use this date to align provider schedules, materials delivery, and fall outreach.',
      variant: 'info',
    };
  }
  if (!hasBackToSchoolEvent.value && !btsAlternativeChosen.value) {
    return {
      sectionKey: 'school_events',
      title: 'Back-to-School Event Required',
      message: `Add a Back-to-School event, or tell us if ${tenantName.value} is unable to attend or you don't have one.`,
      whyText: 'Back-to-School events help us schedule outreach, marketing tables, and sign-ups with your school community.',
      variant: 'info',
    };
  }
  return null;
}

function validateAssignedProvidersSection() {
  if (!String(formData.assigned_providers.capacity_outlook || '').trim()) {
    return {
      sectionKey: 'assigned_providers',
      title: 'Capacity outlook needed',
      message: 'Let us know whether you expect the same, more, or fewer providers and service days.',
      whyText: 'Early notice helps us recruit, adjust schedules, and coordinate with your school.',
      variant: 'info',
    };
  }
  return null;
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    if (props.initialPayload) {
      applyPayload(props.initialPayload);
      return;
    }
    let data;
    if (props.mode === 'token') {
      const res = await api.get(`/public/school-reinit/${props.token}`);
      data = res.data;
    } else if (props.mode === 'admin') {
      const res = await api.get(`/school-reinit/schools/${props.schoolOrganizationId}`, {
        params: { agencyId: props.agencyId },
      });
      data = res.data;
    } else {
      const res = await api.get('/school-reinit/me', {
        params: {
          schoolOrganizationId: props.schoolOrganizationId,
          agencyId: props.agencyId || undefined,
        },
      });
      data = res.data;
    }
    applyPayload(data);
  } catch (e) {
    loadError.value = e?.response?.data?.error?.message || e?.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

function saveIdentity() {
  if (!canContinueIdentity.value) return;
  storeIdentity(cycle.value?.id, { name: identityName.value.trim(), title: identityTitle.value.trim() });
  identityConfirmed.value = true;
}

function actorPayload() {
  if (props.mode === 'token') {
    return { displayName: identityName.value.trim(), identityTitle: identityTitle.value.trim() };
  }
  return {};
}

async function copyShareToken() {
  let token = shareToken.value?.token || props.token;
  if (!token && props.mode !== 'token') {
    try {
      if (props.mode === 'admin') {
        const res = await api.post('/school-reinit/tokens', {
          agencyId: Number(props.agencyId),
          schoolOrganizationId: Number(props.schoolOrganizationId),
          ensure: true,
        });
        shareToken.value = res.data;
        token = res.data.token;
      } else {
        const res = await api.post('/school-reinit/me/ensure-token', {
          schoolOrganizationId: Number(props.schoolOrganizationId),
          agencyId: props.agencyId ? Number(props.agencyId) : undefined,
        });
        shareToken.value = res.data;
        token = res.data.token;
      }
    } catch (e) {
      bannerError.value = e?.response?.data?.error?.message || 'Could not get share token';
      return;
    }
  }
  const url = publicReinitUrl(token);
  const ok = await copyTextToClipboard(url);
  if (ok) {
    copyFlash.value = true;
    setTimeout(() => {
      copyFlash.value = false;
    }, 2000);
  } else {
    bannerError.value = 'Could not copy — link: ' + url;
  }
}

async function saveSection(sectionKey, reviewed) {
  saving.value = true;
  clearSectionAlert(sectionKey);
  try {
    const body = {
      cycleId: cycle.value.id,
      data: formData[sectionKey],
      reviewed,
      completed: reviewed,
      ...actorPayload(),
    };
    let res;
    if (props.mode === 'token') {
      res = await api.put(`/public/school-reinit/${props.token}/sections/${sectionKey}`, body);
    } else if (props.mode === 'admin') {
      // Admin saves via staff-equivalent path using cycle detail mutation — use public token if available
      if (shareToken.value?.token) {
        res = await api.put(`/public/school-reinit/${shareToken.value.token}/sections/${sectionKey}`, {
          ...body,
          displayName: 'Agency admin',
        });
      } else {
        throw new Error('No share token available for admin save');
      }
    } else {
      res = await api.put(`/school-reinit/me/sections/${sectionKey}`, body);
    }
    sections.value = res.data.sections || sections.value;
  } catch (e) {
    showSectionMessage(sectionKey, 'Could not save', e?.response?.data?.error?.message || e?.message || 'Save failed');
  } finally {
    saving.value = false;
  }
}

async function bookSelectedSlot() {
  const slotId = Number(formData.fall_check_in.fall_checkin_slot_id);
  const modality = formData.fall_check_in.fall_checkin_modality || 'in_person';
  if (!slotId || !cycle.value?.id) return;
  bookingSlot.value = true;
  clearSectionAlert('fall_check_in');
  try {
    const body = {
      cycleId: cycle.value.id,
      slotId,
      modality,
      ...actorPayload(),
    };
    let res;
    if (props.mode === 'token') {
      res = await api.post(`/public/school-reinit/${props.token}/checkin-bookings`, body);
    } else if (props.mode === 'admin' && shareToken.value?.token) {
      res = await api.post(`/public/school-reinit/${shareToken.value.token}/checkin-bookings`, {
        ...body,
        displayName: 'Agency admin',
      });
    } else {
      res = await api.post('/school-reinit/checkin-bookings', body);
    }
    checkinBooking.value = res.data.booking;
    Object.assign(formData.fall_check_in, {
      fall_checkin_modality: modality,
      fall_checkin_slot_id: String(slotId),
      fall_checkin_meet_link: res.data.booking?.meet_link || null,
    });
    await saveSection('fall_check_in', true);
    await load();
  } catch (e) {
    showSectionMessage(
      'fall_check_in',
      'Booking failed',
      e?.response?.data?.error?.message || e?.message || 'Could not book this slot.'
    );
  } finally {
    bookingSlot.value = false;
  }
}

async function onConfirmSection(sectionKey) {
  if (sectionKey === 'school_events') {
    const alert = validateSchoolEventsSection();
    if (alert) {
      sectionAlert.value = alert;
      return;
    }
    clearSectionAlert('school_events');
  }
  if (sectionKey === 'assigned_providers') {
    if (providerRoster.value.length && !allProvidersIndividuallyConfirmed.value) {
      providersConfirmModal.value = { open: true, pendingSectionConfirm: true };
      return;
    }
    const alert = validateAssignedProvidersSection();
    if (alert) {
      sectionAlert.value = alert;
      return;
    }
    clearSectionAlert('assigned_providers');
    formData.assigned_providers.providers_confirmed = true;
    formData.assigned_providers.same_arrangements = formData.assigned_providers.capacity_outlook === 'same';
  }
  if (sectionKey === 'school_staff') {
    if (!allStaffConfirmed.value && staff.value.length) {
      staffConfirmModal.value = { open: true, pendingSectionConfirm: true };
      return;
    }
    formData.school_staff.staff_accurate = true;
    clearSectionAlert('school_staff');
  }
  if (sectionKey === 'fall_check_in' && !checkinBooking.value) {
    if (formData.fall_check_in.fall_checkin_slot_id) {
      await bookSelectedSlot();
      if (!checkinBooking.value) return;
    }
    // No slots available — agency will reach out to schedule the check-in directly.
    // Allow the school to proceed without booking.
  }
  await saveSection(sectionKey, true);
  if (isSectionDone(sectionKey) || true) {
    const next = sectionMeta.find((s) => !isSectionDone(s.key) && s.key !== sectionKey);
    if (next) openSection(next.key);
    else viewMode.value = 'hub';
  }
}

function allProviderAssignments() {
  const rows = [];
  for (const p of providerRoster.value) {
    for (const a of sortedProviderAssignments(p)) {
      rows.push({ provider: p, assignment: a, entity: assignmentEntity(p, a) });
    }
  }
  return rows;
}

const assignmentsKeptForPreferredDays = computed(() => {
  const preferred = new Set(providerRemovalModal.value.preferredDays || []);
  if (!preferred.size) return [];
  return allProviderAssignments().filter((row) => preferred.has(String(row.assignment.dayOfWeek || '')));
});

const assignmentsToRemoveForPreferredDays = computed(() => {
  const preferred = new Set(providerRemovalModal.value.preferredDays || []);
  if (!preferred.size) return [];
  return allProviderAssignments().filter((row) => !preferred.has(String(row.assignment.dayOfWeek || '')));
});

const canContinueProviderRemoval = computed(() => {
  const modal = providerRemovalModal.value;
  if (modal.step === 'preferred_days') {
    return Array.isArray(modal.preferredDays) && modal.preferredDays.length > 0;
  }
  return !!modal.reason;
});

function formatAssignmentPreview(rows) {
  return (rows || [])
    .map((row) => row.entity?.name || `${row.provider?.name} (${row.assignment?.dayOfWeek})`)
    .join(', ');
}

function openProviderRemovalModal(provider, assignment) {
  providerRemovalModal.value = {
    open: true,
    step: 'reason',
    entity: assignmentEntity(provider, assignment),
    reason: '',
    preferredDays: Array.isArray(formData.assigned_providers.preferred_service_days)
      ? [...formData.assigned_providers.preferred_service_days]
      : [],
    error: '',
  };
}

function closeProviderRemovalModal() {
  providerRemovalModal.value = {
    open: false,
    step: 'reason',
    entity: null,
    reason: '',
    preferredDays: [],
    error: '',
  };
}

function togglePreferredDay(day, checked) {
  const current = new Set(providerRemovalModal.value.preferredDays || []);
  if (checked) current.add(day);
  else current.delete(day);
  providerRemovalModal.value = {
    ...providerRemovalModal.value,
    preferredDays: PROVIDER_DAY_ORDER.filter((d) => current.has(d)),
    error: '',
  };
}

function backToRemovalReasonStep() {
  providerRemovalModal.value = {
    ...providerRemovalModal.value,
    step: 'reason',
    error: '',
  };
}

function changeRequestPath() {
  if (props.mode === 'token') return `/public/school-reinit/${props.token}/change-requests`;
  if (props.mode === 'admin' && shareToken.value?.token) {
    return `/public/school-reinit/${shareToken.value.token}/change-requests`;
  }
  return '/school-reinit/me/change-requests';
}

async function continueProviderRemoval() {
  const modal = providerRemovalModal.value;
  if (!modal.reason) {
    providerRemovalModal.value = { ...modal, error: 'Please select a reason.' };
    return;
  }

  if (modal.reason === 'different_day' && modal.step === 'reason') {
    providerRemovalModal.value = { ...modal, step: 'preferred_days', error: '' };
    return;
  }

  if (modal.reason === 'different_day') {
    await submitSchoolPreferredDaysRequest();
    return;
  }

  await submitProviderRemovalRequest();
}

async function submitSchoolPreferredDaysRequest() {
  const modal = providerRemovalModal.value;
  const preferredDays = PROVIDER_DAY_ORDER.filter((d) => (modal.preferredDays || []).includes(d));
  if (!preferredDays.length) {
    providerRemovalModal.value = { ...modal, error: 'Select at least one day that works for your school.' };
    return;
  }

  const toRemove = assignmentsToRemoveForPreferredDays.value;
  formData.assigned_providers.preferred_service_days = preferredDays;

  if (!toRemove.length) {
    closeProviderRemovalModal();
    bannerError.value = '';
    sectionAlert.value = {
      sectionKey: 'assigned_providers',
      title: 'Preferred days saved',
      message: `You selected ${preferredDays.join(', ')}. All current provider days already match — nothing to remove.`,
      whyText: 'We’ll use these days when coordinating coverage for your school.',
      variant: 'info',
    };
    return;
  }

  saving.value = true;
  try {
    const created = [];
    for (const row of toRemove) {
      const body = {
        cycleId: cycle.value.id,
        entityType: 'provider_assignment',
        entityId: row.entity.id,
        action: 'delete',
        before: {
          ...row.entity,
          removalReason: 'different_day',
          removalReasonLabel: providerRemovalReasonLabel('different_day'),
          schoolPreferredDays: preferredDays,
          schoolWideDayChange: true,
        },
        ...actorPayload(),
      };
      if (props.mode === 'admin' && shareToken.value?.token) {
        body.displayName = 'Agency admin';
      }
      const res = await api.post(changeRequestPath(), body);
      if (res.data.changeRequest) created.push(res.data.changeRequest);
    }
    if (created.length) {
      changeRequests.value = [...created, ...changeRequests.value];
    }
    formData.assigned_providers.providers_confirmed = false;
    formData.assigned_providers.confirmed_provider_ids = [];
    closeProviderRemovalModal();
  } catch (e) {
    providerRemovalModal.value = {
      ...modal,
      error: e?.response?.data?.error?.message || e?.message || 'Request failed. Please try again.',
    };
  } finally {
    saving.value = false;
  }
}

async function submitProviderRemovalRequest() {
  const modal = providerRemovalModal.value;
  const entity = modal.entity;
  if (!entity) return;
  if (!modal.reason) {
    providerRemovalModal.value = { ...modal, error: 'Please select a reason.' };
    return;
  }
  const ok = await requestDelete('provider_assignment', entity, {
    removalReason: modal.reason,
    removalReasonLabel: providerRemovalReasonLabel(modal.reason),
  });
  if (ok) {
    closeProviderRemovalModal();
  } else {
    providerRemovalModal.value = {
      ...modal,
      error: bannerError.value || 'Request failed. Please try again.',
    };
    bannerError.value = '';
  }
}

async function requestDelete(entityType, entity, extraBefore = null) {
  if (entityType !== 'provider_assignment') {
    if (!window.confirm(`Request removal of ${entity.name}? An admin must approve this change.`)) return false;
  }
  saving.value = true;
  try {
    const body = {
      cycleId: cycle.value.id,
      entityType,
      entityId: entity.id,
      action: 'delete',
      before: {
        ...entity,
        ...(extraBefore || {}),
      },
      ...actorPayload(),
    };
    if (props.mode === 'admin' && shareToken.value?.token) {
      body.displayName = 'Agency admin';
    }
    const res = await api.post(changeRequestPath(), body);
    if (res.data.changeRequest) {
      changeRequests.value = [res.data.changeRequest, ...changeRequests.value];
    }
    return true;
  } catch (e) {
    bannerError.value = e?.response?.data?.error?.message || e?.message || 'Request failed';
    return false;
  } finally {
    saving.value = false;
  }
}

async function addStaff() {
  saving.value = true;
  try {
    const body = {
      cycleId: cycle.value.id,
      entityType: 'school_staff',
      action: 'add',
      payload: { ...newStaff },
      ...actorPayload(),
    };
    const path =
      props.mode === 'token'
        ? `/public/school-reinit/${props.token}/change-requests`
        : props.mode === 'admin' && shareToken.value?.token
          ? `/public/school-reinit/${shareToken.value.token}/change-requests`
          : '/school-reinit/me/change-requests';
    if (props.mode === 'admin') body.displayName = 'Agency admin';
    await api.post(path, body);
    newStaff.name = '';
    newStaff.email = '';
    newStaff.title = '';
    await load();
  } catch (e) {
    bannerError.value = e?.response?.data?.error?.message || e?.message || 'Add failed';
  } finally {
    saving.value = false;
  }
}

async function finalize() {
  if (!window.confirm('Finalize this school’s fall re-initiation? The summary will be locked.')) return;
  saving.value = true;
  try {
    const body = { cycleId: cycle.value.id, ...actorPayload() };
    let res;
    if (props.mode === 'token') {
      res = await api.post(`/public/school-reinit/${props.token}/finalize`, body);
    } else if (props.mode === 'admin' && shareToken.value?.token) {
      res = await api.post(`/public/school-reinit/${shareToken.value.token}/finalize`, {
        ...body,
        displayName: 'Agency admin',
      });
    } else {
      res = await api.post('/school-reinit/me/finalize', body);
    }
    cycle.value = res.data.cycle;
    viewMode.value = 'hub';
    emit('finalized', cycle.value);
    await load();
  } catch (e) {
    bannerError.value = e?.response?.data?.error?.message || e?.message || 'Finalize failed';
  } finally {
    saving.value = false;
  }
}

async function onReceiptAddendum(summaryText) {
  const text = String(summaryText || '').trim();
  if (!text) return;
  saving.value = true;
  try {
    const body = {
      cycleId: cycle.value.id,
      summaryText: text,
      changes: { note: text },
      ...actorPayload(),
    };
    let res;
    if (props.mode === 'token') {
      res = await api.post(`/public/school-reinit/${props.token}/addendums`, body);
    } else if (props.mode === 'admin' && shareToken.value?.token) {
      res = await api.post(`/public/school-reinit/${shareToken.value.token}/addendums`, {
        ...body,
        displayName: 'Agency admin',
      });
    } else {
      res = await api.post('/school-reinit/me/addendums', body);
    }
    addendums.value = [res.data.addendum, ...addendums.value];
  } catch (e) {
    bannerError.value = e?.response?.data?.error?.message || e?.message || 'Addendum failed';
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.token, props.schoolOrganizationId, props.agencyId, props.mode],
  () => {
    void load();
  }
);

onMounted(() => {
  void load();
});

defineExpose({ reload: load, copyShareToken });
</script>

<style scoped>
.cua {
  --cua-primary: #0c4a6e;
  --cua-secondary: #15803d;
  --cua-accent: #2563eb;
  --green: var(--cua-secondary);
  --green-dark: var(--cua-secondary);
  --blue: var(--cua-accent);
  --navy: var(--cua-primary);
  --ink: #1e293b;
  --muted: #64748b;
  --line: #e2e8f0;
  --bg: #f8fafc;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--ink);
  background: var(--bg);
  min-height: 100%;
}
.cua--embedded {
  max-height: min(90vh, 960px);
  overflow: auto;
  border-radius: 12px;
}
.cua__top {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  gap: 16px;
  align-items: start;
  padding: 18px 22px 12px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.cua__brand-block {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.cua__brand-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.cua__brand-name {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--navy);
  line-height: 1.25;
}
.cua__logo {
  height: 40px;
  width: auto;
  object-fit: contain;
  flex-shrink: 0;
}
.cua__logo-text {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: var(--navy);
  line-height: 1.25;
}
.cua__logo-mark {
  display: block;
  color: var(--green);
  font-size: 18px;
}
.cua__school {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ink);
}
.cua__h1 {
  margin: 2px 0 6px;
  font-size: 1.55rem;
  font-weight: 800;
  color: var(--green-dark);
  letter-spacing: -0.02em;
}
.cua__sub {
  margin: 0;
  max-width: 520px;
  font-size: 0.88rem;
  color: var(--muted);
  line-height: 1.4;
}
.cua__user-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.cua__copy-token {
  background: var(--navy);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 800;
  font-size: 0.8rem;
  cursor: pointer;
  letter-spacing: 0.02em;
}
.cua__copy-token:hover {
  filter: brightness(1.08);
}
.cua__help {
  font-size: 0.8rem;
  color: var(--blue);
}
.cua__user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink);
}
.cua__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #dbeafe;
  color: var(--blue);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
}
.cua__layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 0;
  min-height: 520px;
}
.cua__sidebar {
  background: #fff;
  border-right: 1px solid var(--line);
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cua__progress-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--muted);
}
.cua__progress-track {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.cua__progress-fill {
  height: 100%;
  background: var(--green);
  transition: width 0.2s ease;
}
.cua__steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}
.cua__step {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 8px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  color: var(--ink);
}
.cua__step:hover {
  background: #f1f5f9;
}
.cua__step.is-active,
.cua__step.is-current {
  background: #eff6ff;
}
.cua__step-marker {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--muted);
  flex-shrink: 0;
}
.cua__step.is-done .cua__step-marker {
  border-color: var(--green);
  background: var(--green);
  color: #fff;
}
.cua__step.is-current .cua__step-marker,
.cua__step.is-active .cua__step-marker {
  border-color: var(--blue);
  color: var(--blue);
  background: #dbeafe;
}
.cua__step-label {
  font-size: 0.82rem;
  font-weight: 600;
}
.cua__step--finalize {
  margin-top: 8px;
  border-top: 1px solid var(--line);
  border-radius: 0;
  padding-top: 12px;
}
.cua__step--finalize.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.cua__exit-box {
  margin-top: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
}
.cua__exit-title {
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--muted);
}
.cua__exit-btn {
  width: 100%;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}
.cua__main {
  padding: 18px 22px 28px;
}
.cua__autosave {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 0.82rem;
  margin-bottom: 16px;
  line-height: 1.4;
}
.cua__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.cua__card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 16px 12px;
  text-align: left;
  cursor: pointer;
  min-height: 168px;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
  font: inherit;
  color: inherit;
}
.cua__card:hover {
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  border-color: #cbd5e1;
}
.cua__card.is-progress {
  border-color: #93c5fd;
  box-shadow: 0 0 0 1px #93c5fd;
}
.cua__card-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  color: var(--blue);
}
.cua__card.is-done .cua__card-top {
  color: var(--green);
}
.cua__card-chevron {
  color: #94a3b8;
  font-size: 1.4rem;
  line-height: 1;
}
.cua__card-num {
  margin-top: 8px;
  font-size: 0.75rem;
  font-weight: 800;
  color: #94a3b8;
}
.cua__card-title {
  font-size: 1rem;
  font-weight: 800;
  margin: 2px 0 6px;
}
.cua__card-desc {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.35;
  flex: 1;
}
.cua__card-status {
  margin-top: 12px;
  font-size: 0.78rem;
  font-weight: 700;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.status--done {
  color: var(--green);
}
.status--progress {
  color: var(--blue);
}
.status--todo {
  color: #94a3b8;
}
.status .dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
}
.status--done .dot {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
}
.status--progress .dot {
  background: var(--blue);
  border-color: var(--blue);
}
.cua__finalize {
  margin-top: 20px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.cua__finalize-left {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.cua__finalize-left p {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--muted);
}
.cua__finalize-lock {
  font-size: 1.4rem;
}
.cua__finalize-btn {
  background: #e2e8f0;
  color: #64748b;
  border: none;
  border-radius: 10px;
  padding: 12px 18px;
  font-weight: 800;
  cursor: not-allowed;
}
.cua__finalize-btn:not(:disabled) {
  background: var(--green);
  color: #fff;
  cursor: pointer;
}
.cua__detail {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 18px 20px;
}
.cua__back {
  border: none;
  background: none;
  color: var(--blue);
  font-weight: 700;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
  font-size: 0.85rem;
}
.cua__detail h2 {
  margin: 0 0 4px;
  font-size: 1.25rem;
}
.cua__panel {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
}
.cua__panel--warn {
  background: #fffbeb;
  border-color: #fcd34d;
}
.cua__needs-guide {
  background: color-mix(in srgb, var(--cua-primary, #15803d) 6%, #fff);
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 28%, #e2e8f0);
}
.cua__needs-guide p {
  margin: 0 0 8px;
  line-height: 1.45;
}
.cua__needs-current {
  margin-bottom: 14px !important;
}
.cua__needs-days {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.cua__needs-days-label {
  font-size: 0.9rem;
  font-weight: 700;
}
.cua__needs-days-label em {
  color: #b91c1c;
  font-style: normal;
}
.cua__needs-day-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.cua__needs-day-chip {
  min-width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1.5px solid #cbd5e1;
  background: #fff;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  color: #0f172a;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.cua__needs-day-chip:hover {
  border-color: var(--cua-primary, #15803d);
}
.cua__needs-day-chip.is-selected {
  background: var(--cua-primary, #15803d);
  border-color: var(--cua-primary, #15803d);
  color: #fff;
}
.cua__needs-other {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
  max-width: 180px;
}
.cua__needs-other input {
  font-weight: 600;
  color: #0f172a;
}
.cua__needs-estimate {
  margin: 0 !important;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--cua-primary, #15803d);
}
.cua__req {
  color: #b91c1c;
}
.cua__bts-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 10px 0 4px;
}
.cua__bts-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e2e8f0;
}
.cua__panel label,
.cua__section-body > label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 8px;
}
.cua__panel input[type='text'],
.cua__panel input[type='email'],
.cua__panel input[type='date'],
.cua__panel textarea,
.cua__section-body textarea,
.cua__addendum textarea,
.cua__fields input {
  font: inherit;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
}
.cua__check {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
}
.cua__check input {
  width: 18px;
  height: 18px;
}
.cua__list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cua__list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fff;
}
.cua__list-item > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
}
.cua__staff-roi-legend {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 16px;
  font-size: 0.83rem;
  color: var(--muted);
  line-height: 1.5;
}
.cua__roi-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  flex-shrink: 0;
}
.cua__roi-badge--on {
  background: color-mix(in srgb, var(--cua-primary, #15803d) 14%, #fff);
  color: var(--cua-primary, #15803d);
  border: 1px solid color-mix(in srgb, var(--cua-primary, #15803d) 30%, #e2e8f0);
}
.cua__roi-badge--off {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #e2e8f0;
}
.cua__staff-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 4px;
  flex-wrap: wrap;
}
.cua__staff-title-text {
  font-size: 0.88rem;
  color: #475569;
}
.cua__staff-title-input {
  font: inherit;
  font-size: 0.88rem;
  padding: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--cua-primary, #15803d) 40%, #e2e8f0);
  border-radius: 8px;
  outline: none;
  width: 200px;
}
.cua__staff-title-input:focus {
  border-color: var(--cua-primary, #15803d);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cua-primary, #15803d) 12%, transparent);
}
.cua__staff-meta {
  font-size: 0.82rem;
  color: var(--muted);
  margin-bottom: 8px;
}
.cua__staff-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cua__staff-flag {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #64748b;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.cua__staff-flag:hover {
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 35%, #e2e8f0);
  color: var(--cua-primary, #15803d);
}
.cua__staff-flag--on {
  background: color-mix(in srgb, var(--cua-primary, #15803d) 14%, #fff);
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 35%, #e2e8f0);
  color: var(--cua-primary, #15803d);
}
.cua__staff-grid {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: grid;
  gap: 14px;
}
.cua__staff-card {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 18px;
  border: 2px solid var(--line);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  animation: cua-staff-card-pulse 2.2s ease-in-out infinite;
}
.cua__staff-card--confirmed {
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 50%, #e2e8f0);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cua-primary, #15803d) 10%, transparent);
  animation: none;
}
@keyframes cua-staff-card-pulse {
  0%   { box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04), 0 0 0 0   color-mix(in srgb, var(--cua-primary, #15803d) 30%, transparent); }
  50%  { box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04), 0 0 0 8px color-mix(in srgb, var(--cua-primary, #15803d) 0%,  transparent); }
  100% { box-shadow: 0 6px 18px rgba(15, 23, 42, 0.04), 0 0 0 0   color-mix(in srgb, var(--cua-primary, #15803d) 0%,  transparent); }
}
@media (prefers-reduced-motion: reduce) {
  .cua__staff-card { animation: none; }
}
.cua__staff-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--cua-primary, #15803d) 12%, #fff);
  color: var(--cua-primary, #15803d);
  font-size: 1.35rem;
  font-weight: 800;
  flex-shrink: 0;
  border: 2px solid color-mix(in srgb, var(--cua-primary, #15803d) 20%, #e2e8f0);
  transition: background 0.2s ease, border-color 0.2s ease;
}
.cua__staff-avatar--confirmed {
  background: var(--cua-primary, #15803d);
  color: #fff;
  border-color: var(--cua-primary, #15803d);
}
.cua__staff-info {
  flex: 1;
  min-width: 0;
}
.cua__staff-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--ink);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cua__staff-sub {
  margin-top: 4px;
  font-size: 0.85rem;
}
.cua__staff-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}
.cua__staff-confirm-btn {
  padding: 12px 16px;
  font-size: 0.92rem;
  width: auto;
}
@media (max-width: 600px) {
  .cua__staff-card {
    grid-template-columns: 50px 1fr;
  }
  .cua__staff-actions {
    grid-column: 1 / -1;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
.cua__photo {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.cua__fields {
  display: grid;
  gap: 8px;
  max-width: 420px;
}
.cua__muted {
  color: var(--muted);
  font-size: 0.88rem;
}
.cua__event-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.cua__event-card-head h4 {
  margin: 0;
}
.cua__event-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.cua__school-events-list {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.cua__school-event-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #f8fafc;
}
.cua__school-event-row strong {
  display: block;
  margin-top: 4px;
}
.cua__event-type-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cua-primary, #15803d) 12%, #fff);
  color: var(--cua-primary, #15803d);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.cua__bts-alt-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}
.cua__bts-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.cua__link-btn {
  background: none;
  border: none;
  color: var(--blue);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}
.cua__bts-details {
  display: grid;
  gap: 10px;
}
.cua__provider-grid {
  display: grid;
  gap: 16px;
  margin-bottom: 16px;
}
.cua__provider-card {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 18px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
}
.cua__provider-photo-wrap {
  display: flex;
  justify-content: center;
}
.cua__provider-photo {
  width: 108px;
  height: 108px;
  border-radius: 16px;
  object-fit: cover;
  border: 1px solid var(--line);
}
.cua__provider-photo--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--cua-primary, #15803d) 10%, #fff);
  color: var(--cua-primary, #15803d);
  font-size: 2rem;
  font-weight: 800;
}
.cua__provider-card--confirmed {
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 45%, #e2e8f0);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cua-primary, #15803d) 12%, transparent);
}
.cua__provider-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.cua__provider-name {
  margin: 0;
  font-size: 1.15rem;
  color: var(--ink);
}
.cua__provider-confirm-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  margin-top: 16px;
  padding: 16px 20px;
  border: 2px solid color-mix(in srgb, var(--cua-primary, #15803d) 55%, #cbd5e1);
  border-radius: 14px;
  background: color-mix(in srgb, var(--cua-primary, #15803d) 8%, #fff);
  color: var(--cua-primary, #15803d);
  font-size: 1.05rem;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}
.cua__provider-confirm-btn:hover {
  background: color-mix(in srgb, var(--cua-primary, #15803d) 14%, #fff);
  transform: translateY(-1px);
}
.cua__provider-confirm-btn--pulse {
  animation: cua-provider-confirm-pulse 1.8s ease-in-out infinite;
}
.cua__provider-confirm-btn--confirmed {
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 70%, #e2e8f0);
  background: color-mix(in srgb, var(--cua-primary, #15803d) 16%, #fff);
  animation: none;
}
.cua__provider-confirm-btn__input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.cua__provider-confirm-btn__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 2px solid currentColor;
  font-size: 1rem;
  line-height: 1;
}
.cua__provider-confirm-btn--confirmed .cua__provider-confirm-btn__icon {
  background: var(--cua-primary, #15803d);
  border-color: var(--cua-primary, #15803d);
  color: #fff;
}
@keyframes cua-provider-confirm-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--cua-primary, #15803d) 45%, transparent);
    transform: translateY(0);
  }
  50% {
    box-shadow: 0 0 0 12px color-mix(in srgb, var(--cua-primary, #15803d) 0%, transparent);
    transform: translateY(-1px);
  }
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--cua-primary, #15803d) 0%, transparent);
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cua__provider-confirm-btn--pulse {
    animation: none;
  }
  .cua__provider-confirm-btn:hover {
    transform: none;
  }
}
.cua__provider-days-label {
  margin: 10px 0 6px;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}
.cua__provider-blurb {
  margin: 0 0 10px;
  color: #475569;
  font-size: 0.9rem;
  line-height: 1.45;
}
.cua__provider-badge {
  display: inline-block;
  margin-bottom: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.75rem;
  font-weight: 700;
}
.cua__provider-days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.cua__provider-day {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 0.88rem;
}
@media (max-width: 720px) {
  .cua__provider-card {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .cua__provider-day {
    flex-direction: column;
    align-items: flex-start;
  }
}
.cua__panel--confirm {
  display: flex;
  justify-content: flex-start;
}
.cua__error {
  margin: 12px 22px;
  padding: 10px 12px;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 8px;
}
.cua__banner-error {
  margin: 0 22px 12px;
}
.cua--welcome {
  min-height: 100vh;
  background:
    linear-gradient(180deg, rgba(248, 250, 248, 0.35) 0%, rgba(255, 255, 255, 0.55) 45%, rgba(248, 250, 248, 0.7) 100%),
    url('/assets/school-reinit/itsco-school-update-background.png') center top / cover no-repeat;
  padding: 0 16px 40px;
  box-sizing: border-box;
}
.welcome-shell {
  width: 100%;
}
.welcome {
  max-width: 960px;
  margin: 0 auto;
}
.welcome__top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto 18px;
  padding: 20px 28px 0;
  box-sizing: border-box;
}
.welcome__top-left {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
}
.welcome__tenant-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.welcome__tenant-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.welcome__tenant-name {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--green);
  letter-spacing: 0.02em;
  line-height: 1.2;
}
.welcome__top-center {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.welcome__top-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}
.welcome__logo {
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08));
}
.welcome__logo--tenant {
  height: 64px;
  max-width: 280px;
  flex-shrink: 0;
}
.welcome__logo--school {
  height: 108px;
  max-width: 420px;
}
.welcome__brand-text {
  font-weight: 800;
  color: var(--green);
  letter-spacing: 0.02em;
}
.welcome__school-mark {
  font-size: 1.55rem;
  font-weight: 800;
  color: var(--navy);
  text-align: center;
  line-height: 1.2;
}
.welcome__help {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--green);
  font-size: 0.88rem;
  font-weight: 700;
  text-decoration: none;
}
.welcome__help:hover {
  text-decoration: underline;
}
.welcome__help-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
}
.welcome__card {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 22px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.1);
  padding: clamp(22px, 4vw, 40px);
  text-align: center;
}
.welcome__hero-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--green) 12%, #fff);
  color: var(--green);
  display: flex;
  align-items: center;
  justify-content: center;
}
.welcome__hero-icon svg {
  width: 34px;
  height: 34px;
}
.welcome__title {
  margin: 0;
  font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, 'Times New Roman', serif;
  font-size: clamp(1.55rem, 3.4vw, 2.15rem);
  font-weight: 700;
  color: var(--green);
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.welcome__lead {
  margin: 10px auto 0;
  max-width: 520px;
  color: #475569;
  font-size: 0.98rem;
  line-height: 1.5;
}
.welcome__steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin: 28px 0 24px;
  text-align: center;
}
.welcome__step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
}
.welcome__step-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--green) 10%, #f8fafc);
  color: var(--green);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}
.welcome__step-icon svg {
  width: 22px;
  height: 22px;
}
.welcome__step strong {
  font-size: 0.95rem;
  color: #0f172a;
}
.welcome__step span {
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.35;
  max-width: 180px;
}
.welcome__form {
  background: #f3f5f4;
  border-radius: 16px;
  padding: clamp(16px, 3vw, 24px);
  text-align: left;
}
.welcome__form h2 {
  margin: 0;
  font-size: 1.05rem;
  color: #0f172a;
}
.welcome__form > p {
  margin: 4px 0 14px;
  color: #64748b;
  font-size: 0.88rem;
}
.welcome__fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.welcome__fields label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #334155;
}
.welcome__fields input {
  font: inherit;
  font-weight: 500;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 11px 12px;
  background: #fff;
  color: #0f172a;
}
.welcome__fields input:focus {
  outline: 2px solid color-mix(in srgb, var(--green) 45%, #fff);
  outline-offset: 1px;
  border-color: var(--green);
}
.welcome__cta {
  width: 100%;
  margin-top: 14px;
  border: none;
  border-radius: 12px;
  padding: 14px 18px;
  background: var(--green);
  color: #fff;
  font: inherit;
  font-weight: 800;
  font-size: 0.98rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: filter 0.15s ease, transform 0.15s ease;
}
.welcome__cta:hover:not(:disabled) {
  filter: brightness(1.05);
}
.welcome__cta:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.welcome__note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #eef6ff;
  border: 1px solid #dbeafe;
}
.welcome__note-icon {
  flex-shrink: 0;
  margin-top: 1px;
}
.welcome__note p {
  margin: 0;
  font-size: 0.84rem;
  color: #1e3a5f;
  line-height: 1.45;
}
.welcome__footer {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 22px;
  padding: 0 8px;
}
.welcome__footer-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}
.welcome__footer-item strong {
  font-size: 0.82rem;
  color: #14532d;
}
.welcome__footer-item span {
  font-size: 0.75rem;
  color: #475569;
  line-height: 1.4;
}
@media (max-width: 720px) {
  .welcome__top {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
    gap: 10px;
    padding: 16px 16px 0;
  }
  .welcome__tenant-brand {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .welcome__top-left,
  .welcome__top-center,
  .welcome__top-right {
    justify-content: center;
  }
  .welcome__logo--tenant {
    height: 48px;
    max-width: 200px;
  }
  .welcome__logo--school {
    height: 80px;
    max-width: 300px;
  }
  .welcome__steps,
  .welcome__fields,
  .welcome__footer {
    grid-template-columns: 1fr;
  }
  .welcome__step {
    flex-direction: row;
    text-align: left;
    gap: 12px;
    align-items: flex-start;
  }
  .welcome__step span {
    max-width: none;
  }
  .welcome__step-icon {
    margin-bottom: 0;
  }
}
.cua__addendum {
  margin: 16px 22px;
  padding: 16px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.cua__row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.btn {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
  font: inherit;
}
.btn-primary {
  background: var(--navy);
  color: #fff;
}
.btn-secondary {
  background: #f1f5f9;
  border-color: #cbd5e1;
  color: #334155;
}
.btn-sm {
  font-size: 0.75rem;
  padding: 4px 8px;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cua__modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.55);
}
.cua__modal {
  width: min(560px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
}
.cua__modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 22px 0;
}
.cua__modal-title {
  margin: 0;
  font-size: 1.25rem;
  color: var(--ink);
}
.cua__modal-subtitle {
  margin: 6px 0 0;
}
.cua__modal-close {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
.cua__modal-body {
  padding: 18px 22px 8px;
}
.cua__modal-lead {
  margin: 0 0 16px;
  color: #475569;
  line-height: 1.5;
}
.cua__removal-reasons {
  display: grid;
  gap: 10px;
}
.cua__removal-reason {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.cua__removal-reason:hover {
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 35%, #e2e8f0);
}
.cua__removal-reason--selected {
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 65%, #e2e8f0);
  background: color-mix(in srgb, var(--cua-primary, #15803d) 8%, #fff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cua-primary, #15803d) 12%, transparent);
}
.cua__removal-reason input {
  margin-top: 3px;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.cua__removal-reason span {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.98rem;
  line-height: 1.45;
  color: var(--ink);
}
.cua__removal-reason small {
  font-size: 0.82rem;
  font-weight: 500;
}
.cua__modal-error {
  margin: 14px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
}
.cua__modal-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px 22px;
}
.cua__modal-footer .btn {
  min-height: 44px;
}
.cua__modal-footer .btn-primary {
  background: var(--cua-primary, #15803d);
  color: #fff;
  border: 1px solid color-mix(in srgb, var(--cua-primary, #15803d) 80%, #000);
}
.cua__modal-footer .btn-primary:hover {
  background: color-mix(in srgb, var(--cua-primary, #15803d) 88%, #000);
}
.cua__modal-footer .btn-secondary {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}
.cua__modal-footer .btn-secondary:hover {
  background: #f8fafc;
}
.cua__providers-confirm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.cua__providers-confirm-list li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
.cua__confirmed-pill {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cua-primary, #15803d) 16%, #fff);
  color: var(--cua-primary, #15803d);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.cua__confirmed-pill--inline {
  margin-left: 8px;
  vertical-align: middle;
}
.cua__provider-day--confirmed {
  border: 1px solid color-mix(in srgb, var(--cua-primary, #15803d) 28%, #e2e8f0);
  background: color-mix(in srgb, var(--cua-primary, #15803d) 6%, #f8fafc);
}
.cua__day-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.cua__day-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border: 2px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
  cursor: pointer;
  font-weight: 700;
  color: var(--ink);
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.cua__day-chip input {
  width: 16px;
  height: 16px;
}
.cua__day-chip--selected {
  border-color: color-mix(in srgb, var(--cua-primary, #15803d) 65%, #e2e8f0);
  background: color-mix(in srgb, var(--cua-primary, #15803d) 10%, #fff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cua-primary, #15803d) 12%, transparent);
  color: var(--cua-primary, #15803d);
}
.cua__day-preview {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 0.92rem;
  line-height: 1.45;
}
.cua__day-preview p {
  margin: 0;
}

@media (max-width: 960px) {
  .cua__top {
    grid-template-columns: 1fr;
  }
  .cua__user-block {
    align-items: flex-start;
  }
  .cua__layout {
    grid-template-columns: 1fr;
  }
  .cua__grid {
    grid-template-columns: 1fr;
  }
}
</style>
