<template>
  <div :class="props.inline ? 'pch-inline-shell' : 'pch-overlay'" @click.self="onShellClick">
    <div class="pch-modal" :class="{ 'pch-modal-inline': props.inline }" role="dialog" :aria-modal="props.inline ? undefined : 'true'" :aria-labelledby="titleId">
      <div class="pch-header">
        <div>
          <h2 :id="titleId" class="pch-title">{{ displayName }}</h2>
          <p class="pch-sub">{{ headerSubtitle }}</p>
        </div>
        <button v-if="!props.inline" type="button" class="pch-close" aria-label="Close" @click="$emit('close')">×</button>
      </div>

      <!-- Hub: choose section -->
      <div v-if="!activeSection" class="pch-hub" role="navigation" :aria-label="`${displayName} sections`">
        <button
          v-for="item in sectionItems"
          :key="item.id"
          type="button"
          class="pch-hub-card"
          @click="openSection(item.id)"
        >
          <div class="pch-hub-card-top">
            <span v-if="item.iconUrl" class="pch-hub-icon pch-hub-icon-img">
              <img :src="item.iconUrl" alt="" class="pch-hub-icon-img-el" />
            </span>
            <span v-else class="pch-hub-icon" aria-hidden="true">{{ item.icon }}</span>
            <span class="pch-hub-card-label">{{ item.label }}</span>
          </div>
          <p class="pch-hub-card-desc">{{ item.description }}</p>
          <span class="pch-hub-card-cta">Open <span aria-hidden="true">→</span></span>
        </button>
      </div>

      <!-- Detail: section content + compact nav -->
      <div v-else class="pch-detail">
        <div class="pch-detail-toolbar">
          <button type="button" class="pch-back-btn" @click="activeSection = null">
            <span class="pch-back-icon" aria-hidden="true">←</span>
            All sections
          </button>
          <div class="pch-segments" role="tablist" aria-label="Switch section">
            <button
              v-for="item in sectionItems"
              :key="item.id"
              type="button"
              role="tab"
              :aria-selected="activeSection === item.id"
              :class="['pch-seg', { active: activeSection === item.id }]"
              @click="openSection(item.id)"
            >
              {{ item.shortLabel }}
            </button>
          </div>
        </div>
        <p v-if="sectionTagline" class="pch-detail-tagline">{{ sectionTagline }}</p>

        <div class="pch-body pch-detail-body">
          <div v-show="activeSection === 'availability'" class="pch-panel">
            <!-- Skill Builders: dedicated availability panel -->
            <template v-if="isSkillBuildersProgram">
              <template v-if="mode === 'coordinator' && resolvedOrgId">
                <SkillBuildersAvailabilityPanel
                  :agency-id="props.agencyId"
                  :organization-id="resolvedOrgId"
                  :show-scope-filters="false"
                  :show-title="false"
                />
              </template>
              <template v-else-if="mode === 'provider'">
                <p class="pch-muted">
                  Set and confirm availability: program session time plus additional blocks must total 6+ hrs/week (biweekly confirmation).
                </p>
                <div class="pch-inline-actions">
                  <button type="button" class="btn btn-primary btn-sm" @click="$emit('open-skill-builder-availability')">
                    Manage Skill Builder availability
                  </button>
                </div>
              </template>
            </template>
            <!-- Non-Skill-Builders: show this program's events and their scheduled meeting times -->
            <template v-else>
              <template v-if="mode === 'coordinator'">
                <p class="pch-muted">Your program events and their scheduled meeting times. Open an event portal to manage assignments and attendance.</p>
                <div v-if="eventsLoading" class="pch-muted">Loading events…</div>
                <div v-else-if="eventsError" class="pch-error">{{ eventsError }}</div>
                <template v-else-if="programEvents.length">
                  <ul class="pch-event-list">
                    <li v-for="ev in programEventsSortedByDate" :key="`avail-${ev.id}`" class="pch-event-item">
                      <button type="button" class="pch-event-open" @click="goEventPortal(ev.id)">
                        <div class="pch-event-title">{{ ev.title }}</div>
                        <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }}</div>
                        <ul v-if="ev.meetings?.length" class="pch-event-meet-list">
                          <li v-for="(m, i) in ev.meetings" :key="i">
                            {{ m.weekday }} {{ wallHmToDisplay(formatHm(m.startTime)) }}–{{ wallHmToDisplay(formatHm(m.endTime)) }}
                          </li>
                        </ul>
                        <span class="pch-cta">Event portal →</span>
                      </button>
                    </li>
                  </ul>
                </template>
                <p v-else class="pch-muted">No events yet for this program. Create one in the Events section.</p>
              </template>
              <template v-else>
                <p class="pch-muted">Your schedule for this program is set by the program coordinator. Open an event portal from the Events or Portal section to see your upcoming assignments.</p>
              </template>
            </template>
          </div>

          <div v-show="activeSection === 'portal'" class="pch-panel pch-portal-panel">
            <p class="pch-muted pch-portal-lead">
              Open the workspace for each <strong>event</strong> or <strong>program enrollment</strong> (learning
              class) for this program — same idea as the assigned portal cards across the top of My Dashboard. Only items for
              this program appear; providers see events and enrollments they are assigned to.
            </p>
            <div v-if="portalLoading" class="pch-muted">Loading workspaces…</div>
            <div v-else-if="portalError" class="pch-error">{{ portalError }}</div>
            <template v-else-if="portalTiles.length">
              <div class="pch-portal-cards-wrap">
                <div class="pch-portal-cards-header">Workspaces</div>
                <div class="pch-portal-cards-grid" role="list">
                  <button
                    v-for="t in portalTiles"
                    :key="t.key"
                    type="button"
                    class="pch-portal-card"
                    :class="{ active: selectedPortalKey === t.key }"
                    role="listitem"
                    @click="selectPortalTile(t)"
                  >
                    <div class="pch-portal-card-logo" aria-hidden="true">
                      <span class="pch-portal-card-emoji">{{ t.emoji }}</span>
                    </div>
                    <div class="pch-portal-card-body">
                      <div class="pch-portal-card-name">{{ t.title }}</div>
                      <div class="pch-portal-card-type">{{ t.typeLabel }}</div>
                      <div v-if="t.subtitle" class="pch-portal-card-sub muted">{{ t.subtitle }}</div>
                    </div>
                    <div class="pch-portal-card-cta">Open <span aria-hidden="true">→</span></div>
                  </button>
                </div>
              </div>
            </template>
            <p v-else class="pch-muted">
              No events or enrollments yet for this program. Use <strong>Events</strong> for company events, or open
              <strong>Enrollments</strong> to create individual service enrollments, then add a digital intake link for
              each class.
            </p>
          </div>

          <div v-show="activeSection === 'events'" class="pch-panel pch-events">
            <div v-if="eventsLoading" class="pch-muted">Loading events…</div>
            <template v-else-if="mode === 'coordinator'">
              <div v-if="eventsError" class="pch-error pch-events-banner">{{ eventsError }}</div>
              <div v-if="!isSkillBuildersProgram" class="pch-prog-event-form-wrap">
                <p class="pch-muted pch-prog-event-intro">
                  Add program events for this organization. They are independent of schools and school Skill Builders
                  groups.
                </p>
                <form class="pch-prog-event-form" @submit.prevent="submitProgramEvent">
                  <label class="pch-field">
                    <span class="pch-field-label">Title</span>
                    <input
                      v-model.trim="newProgramEvent.title"
                      type="text"
                      class="pch-input"
                      required
                      maxlength="500"
                      autocomplete="off"
                      placeholder="e.g. Summer kickoff"
                    />
                  </label>
                  <div class="pch-field-row">
                    <label class="pch-field">
                      <span class="pch-field-label">Starts</span>
                      <input v-model="newProgramEvent.startsAt" type="datetime-local" class="pch-input" required />
                    </label>
                    <label class="pch-field">
                      <span class="pch-field-label">Ends</span>
                      <input v-model="newProgramEvent.endsAt" type="datetime-local" class="pch-input" required />
                    </label>
                  </div>
                  <label class="pch-field">
                    <span class="pch-field-label">Description <span class="pch-optional">(optional)</span></span>
                    <textarea
                      v-model.trim="newProgramEvent.description"
                      class="pch-input pch-textarea"
                      rows="2"
                      maxlength="4000"
                      placeholder="Notes for coordinators or providers"
                    />
                  </label>
                  <div class="pch-form-actions">
                    <button
                      type="submit"
                      class="btn btn-primary btn-sm"
                      :disabled="createProgramEventBusy || !coordinatorAgencyId || !resolvedCoordinatorOrganizationId"
                    >
                      {{ createProgramEventBusy ? 'Creating…' : 'Create program event' }}
                    </button>
                  </div>
                </form>
              </div>

              <div v-if="isSkillBuildersProgram && !programEvents.length" class="pch-empty">
                <p>
                  No integrated events yet. We can create <strong>company events</strong> from your existing school Skill
                  Builders groups (names, dates, meeting times).
                </p>
                <div class="pch-empty-actions">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="backfillBusy || !coordinatorAgencyId"
                    @click="runBackfillFromGroups"
                  >
                    {{ backfillBusy ? 'Creating…' : 'Create events from school groups' }}
                  </button>
                </div>
                <p class="pch-muted pch-empty-foot">
                  Or use <code>npm run backfill:skills-groups-company-events</code> in <code>backend/</code>, link events
                  under Agency → Company events, or open each school group and save to sync.
                </p>
              </div>

              <ul v-if="programEvents.length" class="pch-event-list">
                <li v-for="ev in programEvents" :key="ev.id" class="pch-event-item">
                  <button type="button" class="pch-event-open" @click="goEventPortal(ev.id)">
                    <div class="pch-event-title">{{ ev.title }}</div>
                    <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }}</div>
                    <p
                      v-if="
                        isSkillBuildersProgram &&
                        !ev.skillsGroupStartDate &&
                        !ev.skillsGroupEndDate &&
                        (ev.startsAt || ev.endsAt)
                      "
                      class="pch-muted pch-event-hint"
                    >
                      Date range not set on the skills group.
                    </p>
                    <ul v-if="ev.meetings?.length" class="pch-event-meet-list">
                      <li v-for="(m, i) in ev.meetings" :key="i">
                        {{ m.weekday }}
                        {{ wallHmToDisplay(formatHm(m.startTime)) }}–{{ wallHmToDisplay(formatHm(m.endTime)) }}
                      </li>
                    </ul>
                    <div v-if="ev.description" class="pch-event-desc">{{ ev.description }}</div>
                    <span class="pch-cta">Event portal →</span>
                  </button>
                </li>
              </ul>
            </template>
            <template v-else>
              <div v-if="eventsError" class="pch-error pch-events-banner">{{ eventsError }}</div>
              <h3 class="pch-events-sub">Assigned</h3>
              <ul v-if="assignedEvents.length" class="pch-event-list">
                <li v-for="ev in assignedEvents" :key="`a-${ev.id}`" class="pch-event-item">
                  <button type="button" class="pch-event-open" @click="goEventPortal(ev.id, ev)">
                    <div class="pch-event-title">{{ ev.title }}</div>
                    <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }} · {{ ev.schoolName }}</div>
                    <span class="pch-cta">Event portal →</span>
                  </button>
                </li>
              </ul>
              <p v-else class="pch-muted">You are not assigned to any events for this program yet.</p>

              <h3 class="pch-events-sub" style="margin-top: 20px;">Upcoming (apply)</h3>
              <ul v-if="upcomingEvents.length" class="pch-event-list">
                <li v-for="ev in upcomingEvents" :key="`u-${ev.id}`" class="pch-event-item">
                  <div class="pch-event-title">{{ ev.title }}</div>
                  <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }} · {{ ev.schoolName }}</div>
                  <div class="pch-row-actions">
                    <button type="button" class="btn btn-secondary btn-sm" @click="goEventPortal(ev.id, ev)">Details</button>
                    <button
                      v-if="!ev.applicationStatus || ev.applicationStatus === 'withdrawn'"
                      type="button"
                      class="btn btn-primary btn-sm"
                      :disabled="applyBusyId === ev.id"
                      @click="applyToEvent(ev)"
                    >
                      {{ applyBusyId === ev.id ? 'Applying…' : 'Apply' }}
                    </button>
                    <span v-else-if="ev.applicationStatus === 'pending'" class="pch-muted">Application pending</span>
                    <span v-else-if="ev.applicationStatus === 'approved'" class="pch-muted">Approved</span>
                  </div>
                </li>
              </ul>
              <p v-else class="pch-muted">No open events to apply for.</p>
            </template>
          </div>

          <div v-show="activeSection === 'enrollments'" class="pch-panel pch-enrollments">
            <template v-if="mode === 'coordinator'">
              <p class="pch-muted pch-enrollments-lead">
                Individual service enrollments are <strong>learning classes</strong> (not dated events). After you create
                one, add a <strong>digital intake link</strong> scoped to that class so families can register; open a row
                below for the enrollment workspace.
              </p>
              <div v-if="enrollmentsLoading" class="pch-muted">Loading enrollments…</div>
              <div v-else-if="enrollmentsError" class="pch-error">{{ enrollmentsError }}</div>
              <template v-else>
                <div class="pch-prog-event-form-wrap pch-enrollments-form-wrap">
                <form class="pch-prog-event-form" @submit.prevent="submitNewEnrollment">
                  <label class="pch-field">
                    <span class="pch-field-label">Enrollment name</span>
                    <input
                      v-model.trim="newEnrollment.className"
                      type="text"
                      class="pch-input"
                      required
                      maxlength="500"
                      autocomplete="off"
                      placeholder="e.g. After-school tutoring — East campus"
                    />
                  </label>
                  <label class="pch-field">
                    <span class="pch-field-label">Description <span class="pch-optional">(optional)</span></span>
                    <textarea
                      v-model.trim="newEnrollment.description"
                      class="pch-input pch-textarea"
                      rows="2"
                      maxlength="4000"
                      placeholder="Internal notes for staff"
                    />
                  </label>
                  <label class="pch-field pch-checkbox-field">
                    <input v-model="newEnrollment.registrationEligible" type="checkbox" />
                    <span>Open for registration setup (registration-eligible)</span>
                  </label>
                  <div class="pch-form-actions">
                    <button
                      type="submit"
                      class="btn btn-primary btn-sm"
                      :disabled="
                        createEnrollmentBusy || !coordinatorAgencyId || !resolvedCoordinatorOrganizationId
                      "
                    >
                      {{ createEnrollmentBusy ? 'Creating…' : 'Create enrollment' }}
                    </button>
                    <RouterLink
                      v-if="agencyPortalSlugForIntake"
                      :to="`/${agencyPortalSlugForIntake}/admin/intake-links`"
                      class="btn btn-secondary btn-sm"
                      @click="$emit('close')"
                    >
                      Digital intake links
                    </RouterLink>
                  </div>
                </form>
                </div>

                <h3 class="pch-events-sub" style="margin-top: 20px;">Existing enrollments</h3>
                <ul v-if="coordinatorEnrollmentClasses.length" class="pch-event-list">
                  <li v-for="c in coordinatorEnrollmentClasses" :key="c.id" class="pch-event-item">
                    <button type="button" class="pch-event-open" @click="openEnrollmentFromList(c)">
                      <div class="pch-event-title">
                        {{ String(c.class_name || c.className || '').trim() || `Enrollment ${c.id}` }}
                      </div>
                      <div class="pch-muted pch-event-dates">
                        {{ String(c.status || '—').trim() }}
                        <span v-if="c.registration_eligible || c.registrationEligible"> · Registration-eligible</span>
                      </div>
                      <span class="pch-cta">Workspace →</span>
                    </button>
                  </li>
                </ul>
                <p v-else class="pch-muted">No enrollments yet for this program.</p>
              </template>
            </template>
            <p v-else class="pch-muted">Enrollments are managed by program coordinators.</p>
          </div>

          <div v-show="activeSection === 'schedule'" class="pch-panel">
            <!-- Skill Builders: dedicated work schedule panel -->
            <SkillBuildersWorkSchedulePanel v-if="isSkillBuildersProgram" :agency-id="props.agencyId" :mode="props.mode" />
            <!-- Non-Skill-Builders: inline schedule from program events -->
            <template v-else>
              <template v-if="mode === 'coordinator'">
                <div v-if="eventsLoading" class="pch-muted">Loading schedule…</div>
                <div v-else-if="eventsError" class="pch-error">{{ eventsError }}</div>
                <template v-else-if="programEventsSortedByDate.length">
                  <ul class="pch-event-list">
                    <li v-for="ev in programEventsSortedByDate" :key="`sched-${ev.id}`" class="pch-event-item">
                      <button type="button" class="pch-event-open" @click="goEventPortal(ev.id)">
                        <div class="pch-event-title">{{ ev.title }}</div>
                        <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }}</div>
                        <ul v-if="ev.meetings?.length" class="pch-event-meet-list">
                          <li v-for="(m, i) in ev.meetings" :key="i">
                            {{ m.weekday }} {{ wallHmToDisplay(formatHm(m.startTime)) }}–{{ wallHmToDisplay(formatHm(m.endTime)) }}
                          </li>
                        </ul>
                        <span class="pch-cta">Event portal →</span>
                      </button>
                    </li>
                  </ul>
                </template>
                <p v-else class="pch-muted">No events scheduled for this program yet. Create one in the Events section.</p>
              </template>
              <template v-else>
                <!-- Provider mode: show assigned events already loaded by the Events section -->
                <h3 class="pch-events-sub">Your assignments</h3>
                <ul v-if="assignedEvents.length" class="pch-event-list">
                  <li v-for="ev in assignedEvents" :key="`ps-${ev.id}`" class="pch-event-item">
                    <button type="button" class="pch-event-open" @click="goEventPortal(ev.id, ev)">
                      <div class="pch-event-title">{{ ev.title }}</div>
                      <div class="pch-muted pch-event-dates">{{ formatEventDateRange(ev) }}</div>
                      <span class="pch-cta">Event portal →</span>
                    </button>
                  </li>
                </ul>
                <p v-else class="pch-muted">No program event assignments yet. The coordinator will assign you to events.</p>
              </template>
            </template>
          </div>
          <div v-show="activeSection === 'documents'" class="pch-panel">
            <SkillBuildersProgramDocumentsPanel
              v-if="coordinatorAgencyId && resolvedCoordinatorOrganizationId"
              :agency-id="coordinatorAgencyId"
              :organization-id="resolvedCoordinatorOrganizationId"
            />
            <p v-else class="pch-muted">Program organization is required to manage documents.</p>
          </div>
          <div v-show="activeSection === 'clients'" class="pch-panel">
            <!-- Skill Builders: dedicated master client list -->
            <SkillBuildersClientManagementPanel v-if="isSkillBuildersProgram && coordinatorAgencyId" :agency-id="coordinatorAgencyId" />
            <!-- Non-Skill-Builders: clients by program event, with enrollment notes -->
            <template v-else-if="mode === 'coordinator'">
              <p class="pch-muted">Clients registered for this program's events. Select an event to view and manage its client roster and enrollment notes.</p>
              <div v-if="programEvents.length" class="pch-enrollees-picker">
                <label class="pch-field-label" for="pch-prog-clients-event">Event</label>
                <select id="pch-prog-clients-event" v-model="programClientsEventId" class="pch-input">
                  <option v-for="ev in enrolleesEventOptions" :key="`pce-${ev.id}`" :value="String(ev.id)">
                    {{ ev.title }}
                  </option>
                </select>
              </div>
              <p v-else class="pch-muted">No events yet. Create one in the Events section to start registering clients.</p>
              <div v-if="programClientsLoading" class="pch-muted">Loading clients…</div>
              <div v-else-if="programClientsError" class="pch-error">{{ programClientsError }}</div>
              <template v-else-if="programClientsEventId">
                <div v-if="programClientsList.length" class="pch-prog-clients-list">
                  <div v-for="c in programClientsList" :key="`pc-${c.clientId}`" class="pch-prog-client-row">
                    <div class="pch-prog-client-name">
                      {{ c.fullName || c.initials || c.identifierCode || `Client ${c.clientId}` }}
                      <span v-if="c.status" class="pch-badge">{{ c.status }}</span>
                    </div>
                    <div class="pch-prog-client-note-wrap">
                      <label class="pch-field-label" :for="`pce-note-${c.clientId}`">Note</label>
                      <textarea
                        :id="`pce-note-${c.clientId}`"
                        v-model="programClientNoteEdits[c.clientId]"
                        class="pch-input pch-textarea pch-note-textarea"
                        rows="2"
                        maxlength="2000"
                        placeholder="Enrollment notes…"
                      />
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm pch-note-save"
                        :disabled="programClientNoteSaving[c.clientId]"
                        @click="saveProgramClientNote(c.clientId)"
                      >
                        {{ programClientNoteSaving[c.clientId] ? 'Saving…' : 'Save note' }}
                      </button>
                    </div>
                  </div>
                </div>
                <p v-else class="pch-muted">No clients registered for this event yet.</p>
              </template>
            </template>
            <p v-else class="pch-muted">Client management is handled by program coordinators.</p>
          </div>
          <div v-show="activeSection === 'enrollees'" class="pch-panel">
            <p class="pch-muted">
              Participant roster by event. Pick an event and review enrolled clients.
            </p>
            <div v-if="enrolleesEventOptions.length" class="pch-enrollees-picker">
              <label class="pch-field-label" for="pch-enrollees-event">Event</label>
              <select id="pch-enrollees-event" v-model="selectedEnrolleeEventId" class="pch-input">
                <option v-for="ev in enrolleesEventOptions" :key="`enr-ev-${ev.id}`" :value="String(ev.id)">
                  {{ ev.title }}
                </option>
              </select>
            </div>
            <p v-else class="pch-muted">No program events yet. Create an event in the Events tab first.</p>
            <div v-if="enrolleesLoading" class="pch-muted">Loading enrollees…</div>
            <div v-else-if="enrolleesError" class="pch-error">{{ enrolleesError }}</div>
            <div v-else-if="eventEnrollees.length" class="pch-enrollees-table-wrap">
              <table class="pch-enrollees-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Document status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in eventEnrollees" :key="`enr-row-${row.clientId}`">
                    <td>{{ row.fullName || row.initials || row.identifierCode || `Client ${row.clientId}` }}</td>
                    <td>{{ row.status || '—' }}</td>
                    <td>{{ row.documentStatus || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else-if="selectedEnrolleeEventId" class="pch-muted">No enrolled clients for this event yet.</p>
          </div>
          <div v-show="activeSection === 'clinical_notes'" class="pch-panel">
            <SkillBuildersClinicalNotesHubPanel v-if="isSkillBuildersProgram && coordinatorAgencyId" :agency-id="coordinatorAgencyId" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useRouter, useRoute, RouterLink } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import SkillBuildersAvailabilityPanel from './SkillBuildersAvailabilityPanel.vue';
import SkillBuildersWorkSchedulePanel from './SkillBuildersWorkSchedulePanel.vue';
import SkillBuildersClientManagementPanel from './SkillBuildersClientManagementPanel.vue';
import SkillBuildersProgramDocumentsPanel from './SkillBuildersProgramDocumentsPanel.vue';
import SkillBuildersClinicalNotesHubPanel from '../skillBuilders/SkillBuildersClinicalNotesHubPanel.vue';
import { useBrandingStore } from '../../store/branding';

const props = defineProps({
  mode: { type: String, default: 'coordinator' }, // 'coordinator' | 'provider'
  agencyId: { type: [Number, String, null], default: null },
  organizationId: { type: [Number, String, null], default: null },
  organizationName: { type: String, default: '' },
  /** Coordinator: program portal slug for `/:slug/skill-builders/event/:id` links. */
  organizationPortalSlug: { type: String, default: '' },
  /** When set (e.g. `documents`), open this section instead of the hub grid. */
  initialSection: { type: String, default: null },
  inline: { type: Boolean, default: false }
});

const emit = defineEmits(['close', 'open-skill-builder-availability']);

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const brandingStore = useBrandingStore();

const titleId = `pch-title-${Math.random().toString(36).slice(2, 9)}`;
const onShellClick = () => {
  if (!props.inline) emit('close');
};
/** null = hub (pick a section); otherwise section id */
const activeSection = ref(null);
/** After applying `initialSection` once so we do not override user navigation. */
const initialSectionApplied = ref(false);
const eventsLoading = ref(false);
const eventsError = ref('');
const programEvents = ref([]);
const assignedEvents = ref([]);
const upcomingEvents = ref([]);
const applyBusyId = ref(null);
const backfillBusy = ref(false);
const createProgramEventBusy = ref(false);
const newProgramEvent = ref({
  title: '',
  startsAt: '',
  endsAt: '',
  description: ''
});
const coordinatorEnrollmentClasses = ref([]);
const enrollmentsLoading = ref(false);
const enrollmentsError = ref('');
const createEnrollmentBusy = ref(false);
const newEnrollment = ref({
  className: '',
  description: '',
  registrationEligible: true
});
const enrolleesLoading = ref(false);
const enrolleesError = ref('');
const selectedEnrolleeEventId = ref('');
const eventEnrollees = ref([]);
/** Program client management for non-SB programs */
const programClientsEventId = ref('');
const programClientsList = ref([]);
const programClientsLoading = ref(false);
const programClientsError = ref('');
const programClientNoteEdits = ref({});
const programClientNoteSaving = ref({});
const resolvedOrgId = ref(null);
const resolvedOrgName = ref('');
const programClassesForPortal = ref([]);
const portalLoading = ref(false);
const portalError = ref('');
/** Highlights the workspace card last opened (toggle-style selection). */
const selectedPortalKey = ref('');

const displayName = computed(() => {
  if (props.mode === 'provider') return resolvedOrgName.value || props.organizationName || 'Program';
  return props.organizationName || 'Program';
});

const coordinatorAgencyId = computed(() => {
  const a = Number(props.agencyId);
  return Number.isFinite(a) && a > 0 ? a : null;
});

const resolvedCoordinatorOrganizationId = computed(() => {
  const o = Number(props.organizationId);
  return Number.isFinite(o) && o > 0 ? o : null;
});

/** Program org id for portal workspaces: explicit for coordinators, resolved Skill Builders program for providers. */
const platformOrgIdForPortal = computed(() => {
  if (props.mode === 'coordinator') return resolvedCoordinatorOrganizationId.value;
  const r = Number(resolvedOrgId.value);
  return Number.isFinite(r) && r > 0 ? r : null;
});

/** Only the affiliated program named "Skill Builders" uses school-group backfill and integrated copy. */
const isSkillBuildersProgram = computed(
  () => String(props.organizationName || '').trim().toLowerCase() === 'skill builders'
);

/** Parent agency portal slug for admin intake links (modal has agency id, not always slug). */
const agencyPortalSlugForIntake = computed(() => {
  const aid = coordinatorAgencyId.value;
  if (!aid) return '';
  const list = agencyStore.agencies || [];
  const a = list.find((x) => Number(x?.id) === aid);
  if (a) return String(a.slug || a.portal_url || '').trim();
  const cur = agencyStore.currentAgency;
  if (cur && Number(cur.id) === aid) return String(cur.slug || cur.portal_url || '').trim();
  return '';
});

const sectionItems = computed(() => {
  const isSB = isSkillBuildersProgram.value;
  const base = [
    {
      id: 'availability',
      label: 'Availability',
      shortLabel: 'Availability',
      icon: '📅',
      description: isSB
        ? 'Weekly Skill Builder blocks, confirmations, and coordinator view by day.'
        : 'This program\'s event schedule and meeting times.'
    },
    {
      id: 'portal',
      label: 'Portal',
      shortLabel: 'Portal',
      icon: '🧭',
      description:
        'Jump to an event or enrollment workspace — cards work like assigned program portals on My Dashboard.'
    },
    {
      id: 'events',
      label: 'Events',
      shortLabel: 'Events',
      icon: '🎯',
      description: isSB
        ? 'Program company events and applications linked to school Skill Builders groups.'
        : 'Program events and provider applications (independent of schools).'
    }
  ];
  if (props.mode === 'coordinator' && resolvedCoordinatorOrganizationId.value) {
    base.push({
      id: 'enrollments',
      label: 'Enrollments',
      shortLabel: 'Enroll',
      icon: '📋',
      description:
        'Create individual service enrollments (learning classes). Add a digital intake link per enrollment for families to register.'
    });
  }
  base.push({
    id: 'schedule',
    label: isSB ? 'Work schedule' : 'Schedule',
    shortLabel: 'Schedule',
    icon: '🗓️',
    description: isSB
      ? 'Upcoming Skill Builders meetings and your assignments.'
      : 'Upcoming program events and your event assignments.'
  });
  if (props.mode === 'coordinator' && coordinatorAgencyId.value) {
    base.push({
      id: 'documents',
      label: 'Program documents',
      shortLabel: 'Docs',
      icon: '📄',
      description: 'Program-wide PDF library; attach per event session from here or the event portal.'
    });
    base.push({
      id: 'clients',
      label: 'Clients',
      shortLabel: 'Clients',
      icon: '👥',
      description: isSB
        ? 'Master list of Skill Builders (skills) clients across the agency.'
        : 'Clients registered for this program\'s events, with enrollment notes.'
    });
  }
  if (coordinatorAgencyId.value && isSB) {
    const supIcon = brandingStore.getDashboardCardIconUrl('supervision', coordinatorAgencyId.value);
    base.push({
      id: 'clinical_notes',
      label: 'Clinical Notes',
      shortLabel: 'Notes',
      icon: supIcon ? '' : '📝',
      iconUrl: supIcon || '',
      description: 'Your Skill Builders clinical notes across events (copy before expiry).'
    });
  }
  return base;
});

const headerSubtitle = computed(() => {
  if (!activeSection.value) return 'Choose a section — each area opens full-screen style with quick switching above.';
  const item = sectionItems.value.find((s) => s.id === activeSection.value);
  return item ? item.label : displayName.value;
});

const sectionTagline = computed(() => {
  if (activeSection.value === 'documents' || activeSection.value === 'enrollments') return '';
  const item = sectionItems.value.find((s) => s.id === activeSection.value);
  return item?.description || '';
});

const enrolleesEventOptions = computed(() =>
  (programEvents.value || [])
    .map((ev) => ({
      id: Number(ev.id),
      title: String(ev.title || '').trim() || `Event ${ev.id}`
    }))
    .filter((ev) => Number.isFinite(ev.id) && ev.id > 0)
);

const programEventsSortedByDate = computed(() =>
  [...(programEvents.value || [])].sort((a, b) => {
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return ta - tb;
  })
);

watch(
  () => props.initialSection,
  (v) => {
    if (v == null || String(v).trim() === '') initialSectionApplied.value = false;
  }
);

watch(
  () => [props.initialSection, sectionItems.value],
  () => {
    if (initialSectionApplied.value) return;
    const want = String(props.initialSection || '').trim();
    if (!want) return;
    if (sectionItems.value.some((s) => s.id === want)) {
      activeSection.value = want;
      initialSectionApplied.value = true;
    }
  },
  { immediate: true }
);

function openSection(id) {
  activeSection.value = id;
}

function formatHm(t) {
  return String(t || '').slice(0, 5) || '—';
}

function wallHmToDisplay(hm) {
  const s = String(hm || '').slice(0, 5);
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s === '—' ? '' : s;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return s;
  const d = new Date(2000, 0, 1, h, mi, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function parseYmdLocal(raw) {
  const t = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const [y, mo, da] = t.split('-').map(Number);
  const d = new Date(y, mo - 1, da);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Date-only range for program hub cards (skills group dates preferred). */
function formatEventDateRange(ev) {
  const gs = ev?.skillsGroupStartDate;
  const ge = ev?.skillsGroupEndDate;
  if (gs && ge) {
    const a = parseYmdLocal(gs);
    const b = parseYmdLocal(ge);
    if (a && b) {
      const opt = { month: 'short', day: 'numeric', year: 'numeric' };
      return `${a.toLocaleDateString(undefined, opt)} – ${b.toLocaleDateString(undefined, opt)}`;
    }
  }
  const st = ev?.startsAt;
  const en = ev?.endsAt;
  const a = st ? new Date(st) : null;
  const b = en ? new Date(en) : null;
  if (!a || !Number.isFinite(a.getTime())) return '';
  const dateOpt = { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    const left = a.toLocaleDateString(undefined, dateOpt);
    if (b && Number.isFinite(b.getTime())) {
      return `${left} – ${b.toLocaleDateString(undefined, dateOpt)}`;
    }
    return left;
  } catch {
    return String(st || '');
  }
}

const portalTiles = computed(() => {
  const oid = platformOrgIdForPortal.value;
  if (!oid) return [];
  const out = [];
  if (props.mode === 'coordinator') {
    for (const ev of programEvents.value) {
      const id = Number(ev.id);
      if (!Number.isFinite(id)) continue;
      out.push({
        key: `event-${id}`,
        kind: 'event',
        eventId: id,
        title: String(ev.title || '').trim() || `Event ${id}`,
        typeLabel: 'Event',
        subtitle: formatEventDateRange(ev) || null,
        emoji: '🎯'
      });
    }
  } else {
    for (const ev of assignedEvents.value) {
      const eid = Number(ev.organizationId);
      if (!Number.isFinite(eid) || eid !== Number(oid)) continue;
      const id = Number(ev.id);
      if (!Number.isFinite(id)) continue;
      const sub = [formatEventDateRange(ev), ev.schoolName].filter(Boolean).join(' · ');
      out.push({
        key: `event-${id}`,
        kind: 'event',
        eventId: id,
        title: String(ev.title || '').trim() || `Event ${id}`,
        typeLabel: 'Event',
        subtitle: sub || null,
        emoji: '🎯'
      });
    }
  }
  for (const c of programClassesForPortal.value) {
    const cid = Number(c.id);
    if (!Number.isFinite(cid)) continue;
    const name = String(c.class_name || c.className || '').trim() || `Enrollment ${cid}`;
    const st = String(c.status || '').trim();
    out.push({
      key: `class-${cid}`,
      kind: 'enrollment',
      classId: cid,
      title: name,
      typeLabel: 'Program enrollment',
      subtitle: st || null,
      deliveryMode: String(c.delivery_mode || c.deliveryMode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group',
      organizationSlug: String(c.organization_slug || '').trim().toLowerCase(),
      emoji: '📋'
    });
  }
  return out;
});

function orgSlug() {
  return (
    String(route.params?.organizationSlug || '').trim() ||
    String(agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || '').trim()
  );
}

function eventPortalSlug() {
  const fromProp = String(props.organizationPortalSlug || '').trim().toLowerCase();
  if (props.mode === 'coordinator' && fromProp) return fromProp;
  return String(orgSlug() || '').trim().toLowerCase();
}

function goEventPortal(eventId, ev = null) {
  const fromEv =
    ev && ev.programPortalSlug ? String(ev.programPortalSlug).trim().toLowerCase() : '';
  const slug = fromEv || eventPortalSlug();
  const id = Number(eventId);
  if (slug && Number.isFinite(id) && id > 0) {
    const segment = isSkillBuildersProgram.value ? 'skill-builders' : 'program';
    router.push(`/${slug}/${segment}/event/${id}`);
  }
}

function openEnrollmentWorkspace(tile) {
  const slug =
    String(tile.organizationSlug || '').trim().toLowerCase() ||
    String(props.organizationPortalSlug || '').trim().toLowerCase() ||
    orgSlug();
  const id = Number(tile.classId);
  if (!slug || !Number.isFinite(id) || id <= 0) return;
  const mode = String(tile.deliveryMode || tile.mode || 'group').toLowerCase();
  if (mode === 'group') {
    router.push(`/${slug}/learning/classes/${id}`);
    return;
  }
  router.push(`/${slug}/challenges/${id}`);
}

function selectPortalTile(t) {
  selectedPortalKey.value = t.key;
  if (t.kind === 'event') goEventPortal(t.eventId);
  else openEnrollmentWorkspace(t);
}

async function loadCoordinatorLearningClassesList() {
  const oid = resolvedCoordinatorOrganizationId.value;
  if (!oid || props.mode !== 'coordinator') {
    coordinatorEnrollmentClasses.value = [];
    return;
  }
  enrollmentsLoading.value = true;
  enrollmentsError.value = '';
  try {
    const res = await api.get('/learning-program-classes', {
      params: { organizationId: oid, includeArchived: false },
      skipGlobalLoading: true
    });
    const list = Array.isArray(res.data?.classes) ? res.data.classes : [];
    coordinatorEnrollmentClasses.value = list;
    programClassesForPortal.value = list;
  } catch (e) {
    enrollmentsError.value = e.response?.data?.error?.message || e.message || 'Failed to load enrollments';
    coordinatorEnrollmentClasses.value = [];
  } finally {
    enrollmentsLoading.value = false;
  }
}

function openEnrollmentFromList(c) {
  const slug =
    String(c.organization_slug || '').trim().toLowerCase() ||
    String(props.organizationPortalSlug || '').trim().toLowerCase() ||
    orgSlug();
  const id = Number(c.id);
  if (!slug || !Number.isFinite(id) || id <= 0) return;
  const mode = String(c.delivery_mode || c.deliveryMode || 'group').toLowerCase();
  if (mode === 'group') {
    router.push(`/${slug}/learning/classes/${id}`);
    return;
  }
  router.push(`/${slug}/challenges/${id}`);
}

async function submitNewEnrollment() {
  const oid = resolvedCoordinatorOrganizationId.value;
  if (!oid) return;
  const name = String(newEnrollment.value.className || '').trim();
  if (!name) {
    enrollmentsError.value = 'Enrollment name is required.';
    return;
  }
  createEnrollmentBusy.value = true;
  enrollmentsError.value = '';
  try {
    await api.post(
      '/learning-program-classes',
      {
        organizationId: oid,
        className: name,
        description: newEnrollment.value.description?.trim() || null,
        status: 'active',
        isActive: true,
        registrationEligible: !!newEnrollment.value.registrationEligible,
        medicaidEligible: false,
        cashEligible: false,
        timezone: 'America/New_York'
      },
      { skipGlobalLoading: true }
    );
    newEnrollment.value = { className: '', description: '', registrationEligible: true };
    await loadCoordinatorLearningClassesList();
  } catch (e) {
    enrollmentsError.value = e.response?.data?.error?.message || e.message || 'Failed to create enrollment';
  } finally {
    createEnrollmentBusy.value = false;
  }
}

async function loadPortalWorkspaces() {
  portalError.value = '';
  const oid = platformOrgIdForPortal.value;
  if (!oid) {
    programClassesForPortal.value = [];
    portalError.value =
      props.mode === 'coordinator'
        ? 'Program organization is missing.'
        : 'Could not resolve your Skill Builders program for this agency.';
    portalLoading.value = false;
    return;
  }
  portalLoading.value = true;
  try {
    if (props.mode === 'coordinator') await loadCoordinatorEvents();
    else await loadProviderEvents();
    const res =
      props.mode === 'coordinator'
        ? await api.get('/learning-program-classes', {
            params: { organizationId: oid, includeArchived: false },
            skipGlobalLoading: true
          })
        : await api.get('/learning-program-classes/my', {
            params: { organizationId: oid },
            skipGlobalLoading: true
          });
    programClassesForPortal.value = Array.isArray(res.data?.classes) ? res.data.classes : [];
  } catch (e) {
    portalError.value = e.response?.data?.error?.message || e.message || 'Failed to load workspaces';
    programClassesForPortal.value = [];
  } finally {
    portalLoading.value = false;
  }
}

async function loadProgramContext() {
  resolvedOrgId.value = null;
  resolvedOrgName.value = '';
  const aid = Number(props.agencyId);
  if (props.mode !== 'provider' || !Number.isFinite(aid) || aid <= 0) return;
  try {
    const res = await api.get('/skill-builders/me/program', { params: { agencyId: aid }, skipGlobalLoading: true });
    if (res.data?.organizationId) {
      resolvedOrgId.value = Number(res.data.organizationId);
      resolvedOrgName.value = String(res.data.organizationName || 'Skill Builders');
    }
  } catch {
    resolvedOrgId.value = null;
  }
}

async function loadCoordinatorEvents() {
  programEvents.value = [];
  eventsError.value = '';
  const aid = Number(props.agencyId);
  const oid = Number(props.organizationId);
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(oid) || oid <= 0) return;
  eventsLoading.value = true;
  try {
    const res = await api.get('/availability/admin/program-company-events', {
      params: { agencyId: aid, organizationId: oid },
      skipGlobalLoading: true
    });
    programEvents.value = Array.isArray(res.data?.events) ? res.data.events : [];
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Failed to load events';
    programEvents.value = [];
  } finally {
    eventsLoading.value = false;
  }
}

async function loadEventEnrolleesForSelection() {
  enrolleesError.value = '';
  eventEnrollees.value = [];
  const aid = Number(props.agencyId);
  const eid = Number(selectedEnrolleeEventId.value);
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(eid) || eid <= 0) return;
  enrolleesLoading.value = true;
  try {
    const res = await api.get(`/company-events/${eid}/clients`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    eventEnrollees.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
  } catch (e) {
    enrolleesError.value = e.response?.data?.error?.message || e.message || 'Failed to load event enrollees';
    eventEnrollees.value = [];
  } finally {
    enrolleesLoading.value = false;
  }
}

async function loadProgramClientsForEvent() {
  programClientsList.value = [];
  programClientsError.value = '';
  const aid = Number(props.agencyId);
  const eid = Number(programClientsEventId.value);
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(eid) || eid <= 0) return;
  programClientsLoading.value = true;
  try {
    const res = await api.get(`/company-events/${eid}/clients`, {
      params: { agencyId: aid },
      skipGlobalLoading: true
    });
    programClientsList.value = Array.isArray(res.data?.clients) ? res.data.clients : [];
    const edits = {};
    for (const c of programClientsList.value) {
      edits[c.clientId] = c.notes || '';
    }
    programClientNoteEdits.value = edits;
  } catch (e) {
    programClientsError.value = e.response?.data?.error?.message || e.message || 'Failed to load clients';
  } finally {
    programClientsLoading.value = false;
  }
}

async function saveProgramClientNote(clientId) {
  const aid = Number(props.agencyId);
  const eid = Number(programClientsEventId.value);
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(eid) || eid <= 0 || !clientId) return;
  programClientNoteSaving.value = { ...programClientNoteSaving.value, [clientId]: true };
  programClientsError.value = '';
  try {
    await api.patch(
      `/company-events/${eid}/clients/${clientId}`,
      { agencyId: aid, notes: programClientNoteEdits.value[clientId] ?? null },
      { skipGlobalLoading: true }
    );
    const idx = programClientsList.value.findIndex((c) => c.clientId === clientId);
    if (idx >= 0) {
      programClientsList.value[idx] = {
        ...programClientsList.value[idx],
        notes: programClientNoteEdits.value[clientId] ?? null
      };
    }
  } catch (e) {
    programClientsError.value = e.response?.data?.error?.message || e.message || 'Failed to save note';
  } finally {
    programClientNoteSaving.value = { ...programClientNoteSaving.value, [clientId]: false };
  }
}

async function loadProviderEvents() {
  assignedEvents.value = [];
  upcomingEvents.value = [];
  eventsError.value = '';
  const aid = Number(props.agencyId);
  if (!Number.isFinite(aid) || aid <= 0) return;
  eventsLoading.value = true;
  try {
    const [a, u] = await Promise.all([
      api.get('/skill-builders/me/assigned-events', { params: { agencyId: aid }, skipGlobalLoading: true }),
      api.get('/skill-builders/me/upcoming-events', { params: { agencyId: aid }, skipGlobalLoading: true })
    ]);
    assignedEvents.value = Array.isArray(a.data?.events) ? a.data.events : [];
    upcomingEvents.value = Array.isArray(u.data?.events) ? u.data.events : [];
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Failed to load events';
  } finally {
    eventsLoading.value = false;
  }
}

async function applyToEvent(ev) {
  const aid = Number(props.agencyId);
  if (!Number.isFinite(aid) || aid <= 0 || !ev?.id) return;
  applyBusyId.value = ev.id;
  try {
    await api.post('/skill-builders/me/applications', { agencyId: aid, companyEventId: ev.id }, { skipGlobalLoading: true });
    await loadProviderEvents();
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Apply failed';
  } finally {
    applyBusyId.value = null;
  }
}

function localDatetimeInputToIso(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString() : '';
}

async function submitProgramEvent() {
  const aid = coordinatorAgencyId.value;
  const oid = resolvedCoordinatorOrganizationId.value;
  if (!aid || !oid) return;
  const startsAt = localDatetimeInputToIso(newProgramEvent.value.startsAt);
  const endsAt = localDatetimeInputToIso(newProgramEvent.value.endsAt);
  if (!startsAt || !endsAt) {
    eventsError.value = 'Please choose valid start and end times.';
    return;
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    eventsError.value = 'End time must be after start time.';
    return;
  }
  createProgramEventBusy.value = true;
  eventsError.value = '';
  try {
    await api.post(
      '/availability/admin/program-company-events',
      {
        agencyId: aid,
        organizationId: oid,
        title: newProgramEvent.value.title,
        description: newProgramEvent.value.description || undefined,
        startsAt,
        endsAt
      },
      { skipGlobalLoading: true }
    );
    newProgramEvent.value = { title: '', startsAt: '', endsAt: '', description: '' };
    await loadCoordinatorEvents();
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Failed to create event';
  } finally {
    createProgramEventBusy.value = false;
  }
}

async function runBackfillFromGroups() {
  const aid = coordinatorAgencyId.value;
  if (!aid) return;
  backfillBusy.value = true;
  eventsError.value = '';
  try {
    const res = await api.post(
      '/availability/admin/backfill-skills-group-company-events',
      { agencyId: aid },
      { skipGlobalLoading: true }
    );
    const c = Number(res.data?.created || 0);
    const s = Number(res.data?.skipped || 0);
    const warns = Array.isArray(res.data?.warnings) ? res.data.warnings : [];
    if (c === 0) {
      eventsError.value =
        warns.slice(0, 2).join(' ') ||
        'No new events were created. Groups may already be linked, or there is no affiliated program named "Skill Builders".';
    } else {
      eventsError.value = '';
    }
    await loadCoordinatorEvents();
  } catch (e) {
    eventsError.value = e.response?.data?.error?.message || e.message || 'Backfill failed';
  } finally {
    backfillBusy.value = false;
  }
}

watch(
  () => [props.mode, props.agencyId, props.organizationId],
  async () => {
    activeSection.value = null;
    programClassesForPortal.value = [];
    coordinatorEnrollmentClasses.value = [];
    enrollmentsError.value = '';
    selectedEnrolleeEventId.value = '';
    eventEnrollees.value = [];
    enrolleesError.value = '';
    selectedPortalKey.value = '';
    if (props.mode === 'provider') {
      await loadProgramContext();
    } else {
      resolvedOrgId.value = Number(props.organizationId) || null;
      resolvedOrgName.value = props.organizationName || '';
    }
  },
  { immediate: true }
);

watch(
  () => [activeSection.value, props.mode, props.agencyId, props.organizationId],
  async () => {
    if (!['events', 'availability', 'schedule'].includes(activeSection.value)) return;
    if (props.mode === 'coordinator') await loadCoordinatorEvents();
    else await loadProviderEvents();
  }
);

watch(
  () => [activeSection.value, props.mode, resolvedCoordinatorOrganizationId.value],
  async () => {
    if (activeSection.value !== 'enrollments') return;
    if (props.mode !== 'coordinator') return;
    await loadCoordinatorLearningClassesList();
  }
);

watch(
  () => [activeSection.value, props.mode, props.agencyId, props.organizationId],
  async () => {
    if (activeSection.value !== 'enrollees') return;
    if (props.mode !== 'coordinator' || isSkillBuildersProgram.value) return;
    await loadCoordinatorEvents();
    const options = enrolleesEventOptions.value;
    const selected = Number(selectedEnrolleeEventId.value);
    if (!options.some((o) => Number(o.id) === selected)) {
      selectedEnrolleeEventId.value = options.length ? String(options[0].id) : '';
    }
    await loadEventEnrolleesForSelection();
  }
);

watch(
  () => selectedEnrolleeEventId.value,
  async () => {
    if (activeSection.value !== 'enrollees') return;
    await loadEventEnrolleesForSelection();
  }
);

watch(
  () => [activeSection.value, props.mode, props.agencyId, props.organizationId],
  async () => {
    if (activeSection.value !== 'clients') return;
    if (props.mode !== 'coordinator' || isSkillBuildersProgram.value) return;
    await loadCoordinatorEvents();
    const options = enrolleesEventOptions.value;
    const selected = Number(programClientsEventId.value);
    if (!options.some((o) => Number(o.id) === selected)) {
      programClientsEventId.value = options.length ? String(options[0].id) : '';
    }
    await loadProgramClientsForEvent();
  }
);

watch(
  () => programClientsEventId.value,
  async () => {
    if (activeSection.value !== 'clients' || isSkillBuildersProgram.value) return;
    await loadProgramClientsForEvent();
  }
);

watch(
  () => [activeSection.value, props.mode, props.agencyId, props.organizationId, resolvedOrgId.value],
  async () => {
    if (activeSection.value !== 'portal') return;
    selectedPortalKey.value = '';
    if (props.mode === 'provider' && !resolvedOrgId.value) {
      await loadProgramContext();
    }
    await loadPortalWorkspaces();
  }
);
</script>

<style scoped>
.pch-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
  padding: 12px;
}
.pch-inline-shell {
  width: 100%;
}
.pch-modal {
  width: 100%;
  max-width: 1080px;
  max-height: min(92vh, 900px);
  overflow: hidden;
  background: var(--pch-surface, #fff);
  border-radius: 20px;
  border: 1px solid var(--border, #e2e8f0);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.06),
    0 24px 48px -12px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
}
.pch-modal-inline {
  max-width: none;
  max-height: none;
  border-radius: 14px;
}
.pch-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  gap: 12px;
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
}
.pch-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary, #0f172a);
}
.pch-sub {
  margin: 6px 0 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #64748b);
  line-height: 1.45;
  max-width: 42rem;
}
.pch-close {
  background: #f1f5f9;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  flex-shrink: 0;
  transition: background 0.15s ease;
}
.pch-close:hover {
  background: #e2e8f0;
}

/* Hub cards */
.pch-hub {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
  padding: 18px 22px 22px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.pch-hub-card {
  text-align: left;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 16px;
  padding: 18px 18px 16px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 132px;
}
.pch-hub-card:hover {
  border-color: var(--primary, #15803d);
  box-shadow: 0 8px 24px -8px rgba(21, 128, 61, 0.25);
  transform: translateY(-1px);
}
.pch-hub-card:focus-visible {
  outline: 2px solid var(--primary, #15803d);
  outline-offset: 2px;
}
.pch-hub-card-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pch-hub-icon {
  font-size: 1.5rem;
  line-height: 1;
}
.pch-hub-icon-img-el {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}
.pch-hub-card-label {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--text-primary, #0f172a);
}
.pch-hub-card-desc {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary, #64748b);
  line-height: 1.45;
  flex: 1;
}
.pch-hub-card-cta {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary, #15803d);
  margin-top: 4px;
}

/* Detail */
.pch-detail {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.pch-detail-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: #f8fafc;
}
.pch-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary, #334155);
  cursor: pointer;
  transition: background 0.15s ease;
}
.pch-back-btn:hover {
  background: #f1f5f9;
}
.pch-back-icon {
  font-size: 1rem;
  opacity: 0.85;
}
.pch-segments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
  justify-content: flex-end;
}
.pch-seg {
  border: 1px solid transparent;
  background: #fff;
  color: var(--text-secondary, #64748b);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease;
}
.pch-seg:hover {
  border-color: var(--border, #cbd5e1);
  color: var(--text-primary, #334155);
}
.pch-seg.active {
  background: var(--primary, #15803d);
  color: #fff;
  border-color: var(--primary, #15803d);
}
.pch-detail-tagline {
  margin: 0;
  padding: 10px 22px 0;
  font-size: 0.8125rem;
  color: var(--text-secondary, #64748b);
  line-height: 1.4;
}
.pch-detail-body {
  flex: 1;
}

.pch-body {
  padding: 12px 22px 22px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}
.pch-panel {
  min-height: 120px;
}
.pch-portal-panel .pch-portal-lead {
  margin: 0 0 16px;
  max-width: 44rem;
  line-height: 1.5;
  font-size: 0.875rem;
}
.pch-portal-cards-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pch-portal-cards-header {
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.01em;
}
.pch-portal-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.pch-portal-card {
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 10px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;
}
.pch-portal-card:hover {
  border-color: var(--primary, #15803d);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.pch-portal-card.active {
  border-color: var(--primary, #15803d);
  box-shadow: 0 0 0 2px rgba(21, 128, 61, 0.12);
}
.pch-portal-card-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid var(--border, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pch-portal-card-emoji {
  font-size: 1.35rem;
  line-height: 1;
}
.pch-portal-card-body {
  min-width: 0;
}
.pch-portal-card-name {
  font-weight: 600;
  color: var(--text-primary, #0f172a);
  font-size: 0.9rem;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pch-portal-card-type {
  margin-top: 2px;
  color: #64748b;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pch-portal-card-sub {
  margin-top: 4px;
  font-size: 0.75rem;
  line-height: 1.35;
}
.pch-portal-card-cta {
  color: var(--primary, #15803d);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.pch-inline-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.pch-muted {
  color: var(--text-secondary, #64748b);
  font-size: 0.875rem;
}
.pch-error {
  color: #b91c1c;
  font-size: 0.9rem;
}
.pch-events-banner {
  margin-bottom: 12px;
}
.pch-empty {
  padding: 20px 8px 8px;
  text-align: center;
  color: var(--text-secondary, #64748b);
  line-height: 1.55;
  max-width: 38rem;
  margin: 0 auto;
}
.pch-empty-actions {
  margin-top: 16px;
}
.pch-empty-foot {
  margin-top: 16px;
  font-size: 0.78rem;
}
.pch-empty-foot code {
  font-size: 0.72rem;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}
.pch-event-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pch-event-item {
  padding: 0;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
}
.pch-event-open {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font: inherit;
}
.pch-event-open:hover {
  background: #f1f5f9;
}
.pch-event-title {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 2px;
  line-height: 1.25;
}
.pch-event-dates {
  font-size: 0.78rem;
  line-height: 1.3;
}
.pch-event-hint {
  margin: 4px 0 0;
  font-size: 0.72rem;
  line-height: 1.3;
}
.pch-event-meet-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--text-secondary, #64748b);
}
.pch-event-meet-list li {
  padding: 0;
}
.pch-event-desc {
  margin-top: 4px;
  font-size: 0.78rem;
  color: var(--text-secondary, #64748b);
  white-space: pre-wrap;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pch-cta {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.72rem;
  color: var(--primary, #15803d);
  font-weight: 600;
}
.pch-events-sub {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.pch-row-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  padding: 0 14px 12px;
}

.pch-prog-event-form-wrap {
  margin-bottom: 20px;
  padding: 14px 14px 16px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: #fff;
}
.pch-prog-event-intro {
  margin: 0 0 12px;
  line-height: 1.45;
}
.pch-prog-event-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pch-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}
.pch-field-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #334155);
}
.pch-optional {
  font-weight: 400;
  color: var(--text-secondary, #64748b);
}
.pch-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.pch-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font: inherit;
  font-size: 0.875rem;
}
.pch-textarea {
  resize: vertical;
  min-height: 56px;
}
.pch-form-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.pch-enrollments-lead {
  margin: 0 0 14px;
  line-height: 1.45;
}
.pch-enrollments-form-wrap {
  margin-bottom: 0;
}
.pch-checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--text-primary, #334155);
}
.pch-checkbox-field input {
  width: auto;
  margin: 0;
}
.pch-enrollees-picker {
  margin: 10px 0 12px;
}
.pch-enrollees-table-wrap {
  overflow: auto;
  margin-top: 10px;
}
.pch-enrollees-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.pch-enrollees-table th,
.pch-enrollees-table td {
  text-align: left;
  padding: 8px 6px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.pch-enrollees-table th {
  font-size: 0.78rem;
  color: var(--text-secondary, #64748b);
  font-weight: 700;
}

/* Program client management (non-SB) */
.pch-prog-clients-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}
.pch-prog-client-row {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 12px 14px;
  background: #fff;
}
.pch-prog-client-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary, #0f172a);
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.pch-prog-client-note-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pch-note-textarea {
  resize: vertical;
  min-height: 52px;
  font-size: 0.82rem;
}
.pch-note-save {
  align-self: flex-end;
}
.pch-badge {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px 6px;
}

@media (max-width: 560px) {
  .pch-hub {
    grid-template-columns: 1fr;
  }
  .pch-segments {
    justify-content: flex-start;
    width: 100%;
  }
  .pch-field-row {
    grid-template-columns: 1fr;
  }
}
</style>
