<template>
  <div class="hub-page" data-tour="caseload-hub-schools-staff">
    <header class="hub-header">
      <div>
        <h1>School Management</h1>
        <p class="subtitle">View caseloads by school or by person. Coverage needs and open school days surface live data.</p>
      </div>
      <div class="header-actions">
        <select v-if="agencies.length > 1" v-model="agencyId" class="agency-select" @change="reload">
          <option v-for="a in agencies" :key="a.id" :value="Number(a.id)">{{ a.name }}</option>
        </select>
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="reload">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
        <router-link class="btn btn-secondary" :to="orgTo('/admin/school-portals-hub')">School Portals</router-link>
      </div>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <section v-if="warningCards.length" class="warning-cards" data-tour="coverage-warning-cards">
      <button
        v-for="c in warningCards.filter((x) => x.count > 0)"
        :key="c.type"
        type="button"
        class="warning-card"
        :class="c.severity"
        @click="goCoverageNeeds(c.type)"
      >
        <span class="wc-count">{{ c.count }}</span>
        <span class="wc-title">{{ c.title }}</span>
      </button>
    </section>

    <nav class="hub-tabs" role="tablist">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        class="hub-tab"
        :class="{ active: tab === t.id }"
        :aria-selected="tab === t.id"
        @click="setTab(t.id)"
      >
        {{ t.label }}
      </button>
    </nav>

    <!-- Additional school hours (provider requests) — independent of coverage load -->
    <div v-if="tab === 'school-availability'" class="full-panel school-availability-tab" data-tour="school-availability-intake">
      <div class="open-banner">
        <div>
          <h2>Additional school hours</h2>
          <p>
            Review provider requests for new weekday daytime availability.
            Notes explain what they hope to accomplish — separate from editing existing assignment times or open slots.
          </p>
        </div>
      </div>
      <AvailabilityIntakeManagement
        :show-header="false"
        initial-tab="school"
        :agency-id-override="agencyId"
      />
    </div>

    <div v-else-if="loading && !schools.length && !providers.length" class="loading">Loading coverage…</div>

    <!-- By School -->
    <div v-else-if="tab === 'by-school'" class="split" :class="{ 'has-selection': !!selectedSchoolId }">
      <div class="list-panel">
        <div class="list-toolbar">
          <input v-model="schoolSearch" type="search" placeholder="Search schools…" class="search" />
          <select v-model="schoolDistrictFilter" aria-label="Filter by district">
            <option value="">All districts</option>
            <option v-for="d in schoolDistrictOptions" :key="d" :value="d">{{ d }}</option>
          </select>
          <select v-model="schoolSort" aria-label="Sort schools">
            <option value="name">Name</option>
            <option value="capacity">Capacity</option>
            <option value="waitlist">Waitlist</option>
            <option value="warnings">Warnings</option>
          </select>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>School</th>
              <th>Staff</th>
              <th>Clients</th>
              <th>Capacity</th>
              <th>Days</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in filteredSchools"
              :key="s.schoolId"
              :class="{ selected: selectedSchoolId === s.schoolId }"
              @click="selectSchool(s.schoolId)"
            >
              <td>
                <div class="school-cell">
                  <div class="school-logo">
                    <img
                      v-if="schoolLogoUrl(s) && !failedLogoIds.has(String(s.schoolId))"
                      :src="schoolLogoUrl(s)"
                      :alt="`${s.schoolName} logo`"
                      class="school-logo-img"
                      @error="onLogoError(s.schoolId)"
                    />
                    <span v-else class="school-logo-fallback" aria-hidden="true">{{ schoolInitials(s) }}</span>
                  </div>
                  <div class="school-text">
                    <div class="primary">{{ s.schoolName }}</div>
                    <div class="muted">{{ s.districtName || '—' }}</div>
                  </div>
                </div>
              </td>
              <td>{{ s.providersCount }}</td>
              <td>{{ s.clientsAssigned }} / {{ s.clientsCurrent }}</td>
              <td>
                <div class="cap-bar">
                  <div class="cap-fill" :style="{ width: Math.min(100, s.capacityUtilization) + '%' }" />
                </div>
                <span class="muted">{{ s.capacityUtilization }}% · {{ s.slotsAvailable }} open</span>
              </td>
              <td>
                <span
                  v-for="d in s.days"
                  :key="d.dayOfWeek"
                  class="day-chip"
                  :class="{ on: d.providersCount > 0, danger: d.unstaffed }"
                  :title="d.dayOfWeek"
                >{{ d.dayOfWeek.slice(0, 2) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!filteredSchools.length" class="empty">No schools match.</p>
      </div>
      <aside v-if="schoolDetail" class="detail-panel">
        <div class="detail-header">
          <div class="school-logo school-logo-lg">
            <img
              v-if="schoolLogoUrl(schoolDetail) && !failedLogoIds.has(String(schoolDetail.schoolId))"
              :src="schoolLogoUrl(schoolDetail)"
              :alt="`${schoolDetail.schoolName} logo`"
              class="school-logo-img"
              @error="onLogoError(schoolDetail.schoolId)"
            />
            <span v-else class="school-logo-fallback" aria-hidden="true">{{ schoolInitials(schoolDetail) }}</span>
          </div>
          <div>
            <h2>{{ schoolDetail.schoolName }}</h2>
            <p class="muted">{{ schoolDetail.districtName || 'No district' }}</p>
          </div>
        </div>
        <div class="stat-row">
          <div><strong>{{ schoolDetail.providersCount }}</strong><span>Staff</span></div>
          <div><strong>{{ schoolDetail.clientsAssigned }}</strong><span>Clients</span></div>
          <div><strong>{{ schoolDetail.capacityUtilization }}%</strong><span>Capacity</span></div>
          <div><strong>{{ schoolDetail.waitlistCount }}</strong><span>Waitlist</span></div>
        </div>
        <h3>Staffing by day</h3>
        <ul class="day-list">
          <li v-for="d in schoolDetail.days" :key="d.dayOfWeek" :class="{ danger: d.unstaffed }">
            <strong>{{ d.dayOfWeek }}</strong>
            <span>{{ d.providersCount }} provider(s) · {{ d.clientsCount }} clients · {{ d.slotsAvailable }} open</span>
            <em v-if="d.unstaffed">Unstaffed</em>
          </li>
        </ul>
        <h3>Providers</h3>
        <ul class="simple-list">
          <li v-for="p in schoolDetail.providers || []" :key="p.providerId">
            {{ p.name }} — {{ (p.days || []).map((x) => x.dayOfWeek.slice(0, 3)).join(', ') || 'No days' }}
          </li>
          <li v-if="!(schoolDetail.providers || []).length" class="muted">No providers assigned.</li>
        </ul>
        <h3>Upcoming events</h3>
        <ul class="simple-list">
          <li v-for="e in schoolDetail.events || []" :key="e.id">
            <router-link
              class="event-link"
              :to="orgTo(`/admin/caseload-hub/events?eventId=${e.id}&tab=list`)"
            >
              {{ e.title }}
            </router-link>
            <span class="muted"> · {{ formatDate(e.startAt || e.startsAt) }}</span>
          </li>
          <li v-if="!(schoolDetail.events || []).length" class="muted">No school events.</li>
        </ul>
        <div class="detail-actions">
          <router-link
            v-if="schoolDetail.schoolSlug"
            class="btn btn-primary"
            :to="`/${schoolDetail.schoolSlug}/school-portal`"
          >Open school portal</router-link>
          <router-link class="btn btn-secondary" :to="orgTo('/admin/caseload-hub/events')">School events</router-link>
          <button type="button" class="btn btn-secondary" @click="setTab('open-spots')">Open school spots</button>
        </div>
      </aside>
      <aside v-else class="detail-panel muted-panel">
        <p>Select a school to see staffing, capacity, and events.</p>
      </aside>
    </div>

    <!-- By Person -->
    <div v-else-if="tab === 'by-person'" class="split has-selection">
      <div class="list-panel">
        <div class="list-toolbar">
          <input v-model="providerSearch" type="search" placeholder="Search staff…" class="search" />
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Staff member</th>
              <th>Schools</th>
              <th>Clients</th>
              <th>Capacity</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in filteredProviders"
              :key="p.providerId"
              :class="{ selected: selectedProviderId === p.providerId }"
              @click="selectProvider(p.providerId)"
            >
              <td>
                <div class="primary">{{ p.name }}</div>
                <div class="muted">{{ formatRole(p.role) }}</div>
              </td>
              <td>
                <div class="provider-schools">
                  <button
                    v-for="s in providerSchoolsForList(p)"
                    :key="`${p.providerId}-${s.schoolId}`"
                    type="button"
                    class="provider-school-chip"
                    :class="{
                      editable: canManageCaseload,
                      tight: Number(s.slotsAvailable || 0) === 0 && Number(s.clients || 0) > 0,
                      over: Number(s.clients || 0) > Number(s.slotsTotal || 0)
                    }"
                    :title="schoolCaseloadTitle(s)"
                    @click.stop="openCaseloadEditor(p, s)"
                  >
                    <div class="school-logo school-logo-sm">
                      <img
                        v-if="schoolLogoUrl(s) && !failedLogoIds.has(`p-${p.providerId}-${s.schoolId}`)"
                        :src="schoolLogoUrl(s)"
                        :alt="`${s.schoolName} logo`"
                        class="school-logo-img"
                        @error="onLogoError(`p-${p.providerId}-${s.schoolId}`)"
                      />
                      <span v-else class="school-logo-fallback" aria-hidden="true">{{ schoolInitials(s) }}</span>
                    </div>
                    <span class="provider-school-name">{{ s.schoolName }}</span>
                    <span class="provider-school-slots">{{ Number(s.clients || 0) }}/{{ Number(s.slotsAvailable || 0) }}</span>
                  </button>
                  <span v-if="!providerSchoolsForList(p).length" class="muted">No school days assigned</span>
                </div>
              </td>
              <td>{{ p.clientsCurrent }}</td>
              <td>
                <div class="cap-bar">
                  <div class="cap-fill" :style="{ width: Math.min(100, p.capacityUtilization) + '%' }" />
                </div>
                <span class="muted">{{ p.capacityUtilization }}%</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!filteredProviders.length" class="empty">No staff found for affiliated schools.</p>
      </div>
      <aside v-if="providerDetail" class="detail-panel">
        <h2>{{ providerDetail.name }}</h2>
        <p class="muted">{{ formatRole(providerDetail.role) }} · {{ providerDetail.email || '—' }}</p>
        <div class="stat-row">
          <div><strong>{{ providerDetail.clientsCurrent }}</strong><span>Clients</span></div>
          <div><strong>{{ providerDetail.capacityUtilization }}%</strong><span>Capacity</span></div>
          <div><strong>{{ providerSchoolsForList(providerDetail).length }}</strong><span>Schools</span></div>
          <div><strong>{{ providerDetail.assignedDays }}</strong><span>Days</span></div>
        </div>
        <p v-if="providerDetail.noDayAssigned" class="inline-warn">Assigned to school(s) but no day selected.</p>
        <h3>Schools &amp; caseload</h3>
        <p class="muted caseload-hint">
          Shows assigned clients / available slots. {{ canManageCaseload ? 'Click a school to edit day capacity (writes to provider school assignments).' : '' }}
        </p>
        <table class="data-table compact">
          <thead>
            <tr><th>School</th><th>Days</th><th>Assigned / avail</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="s in providerDetail.schools || []" :key="s.schoolId">
              <td>
                <div class="school-cell">
                  <div class="school-logo school-logo-sm">
                    <img
                      v-if="schoolLogoUrl(s) && !failedLogoIds.has(`pd-${s.schoolId}`)"
                      :src="schoolLogoUrl(s)"
                      :alt="`${s.schoolName} logo`"
                      class="school-logo-img"
                      @error="onLogoError(`pd-${s.schoolId}`)"
                    />
                    <span v-else class="school-logo-fallback" aria-hidden="true">{{ schoolInitials(s) }}</span>
                  </div>
                  <div class="school-text">
                    <div class="primary">{{ s.schoolName }}</div>
                    <div v-if="!(s.fromAssignment || (s.days || []).length)" class="muted">Membership only</div>
                  </div>
                </div>
              </td>
              <td>{{ (s.days || []).map((d) => d.dayOfWeek.slice(0, 3)).join(', ') || '—' }}</td>
              <td>
                <span class="slot-ratio" :class="{ tight: Number(s.slotsAvailable || 0) === 0 && Number(s.clients || 0) > 0 }">
                  {{ Number(s.clients || 0) }}/{{ Number(s.slotsAvailable || 0) }}
                </span>
                <div class="muted tiny">{{ Number(s.slotsUsed || s.clients || 0) }} of {{ Number(s.slotsTotal || 0) }} capacity</div>
              </td>
              <td>
                <button
                  v-if="canManageCaseload && (s.fromAssignment || (s.days || []).length)"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="openCaseloadEditor(providerDetail, s)"
                >
                  Edit
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Requests</h3>
        <ul class="simple-list">
          <li v-for="r in providerDetail.requests || []" :key="r.id">
            {{ r.status }} · {{ formatDate(r.createdAt) }}
          </li>
          <li v-if="!(providerDetail.requests || []).length" class="muted">No school-day requests.</li>
        </ul>
        <div class="detail-actions">
          <router-link class="btn btn-secondary" :to="`/admin/users/${providerDetail.providerId}`">View full profile</router-link>
        </div>
      </aside>
      <aside v-else class="detail-panel muted-panel">
        <p>Select a staff member to see schools, days, and requests.</p>
      </aside>
    </div>

    <!-- Events tab: inline calendar + agenda toggle -->
    <div v-else-if="tab === 'events'" class="events-tab">
      <div class="events-toolbar">
        <div class="events-nav">
          <button type="button" class="btn btn-secondary btn-sm" @click="eventsShift(-1)">‹</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="eventsGoToday">Today</button>
          <button type="button" class="btn btn-secondary btn-sm" @click="eventsShift(1)">›</button>
          <span class="events-range">{{ eventsRangeLabel }}</span>
        </div>
        <div class="events-filters">
          <select v-model="eventsDistrictFilter" aria-label="Filter events by district">
            <option value="">All districts</option>
            <option v-for="d in schoolDistrictOptions" :key="`evt-d-${d}`" :value="d">{{ d }}</option>
          </select>
          <select v-model="eventsSchoolFilter" aria-label="Filter events by school">
            <option value="">All schools</option>
            <option v-for="s in eventSchoolOptions" :key="s.id" :value="String(s.id)">{{ s.name }}</option>
          </select>
          <select v-model="eventsTypeFilter" aria-label="Filter by event type">
            <option value="">All event types</option>
            <option value="school_back_to_school">Back to School</option>
            <option value="school_fall_check_in">Fall School Check-in</option>
            <option value="school_spring_event">Spring School Check-in</option>
            <option value="school_first_day">First Day of School</option>
            <option value="school_open_house">Open House</option>
            <option value="school_resource_fair">Resource Fair</option>
            <option value="school_family_night">Family Night</option>
            <option value="school_orientation">Orientation</option>
            <option value="school_other">Other</option>
          </select>
        </div>
        <div class="events-view-toggle">
          <button type="button" :class="{ active: eventsView === 'calendar' }" @click="eventsView = 'calendar'">Calendar</button>
          <button type="button" :class="{ active: eventsView === 'agenda' }" @click="eventsView = 'agenda'">Agenda</button>
        </div>
        <button type="button" class="btn btn-primary btn-sm" @click="openEventsAddEvent()">+ Add Event</button>
        <router-link class="btn btn-secondary btn-sm" :to="orgTo('/admin/caseload-hub/events')">Full event hub →</router-link>
      </div>
      <p class="events-tz-note">
        Times shown in the school/tenant timezone
        <strong>{{ eventsTimezoneLabel }}</strong>
        (MST/MDT). This tab auto-refreshes every {{ pollSeconds }}s while open.
      </p>

      <div class="events-body has-panel">
        <!-- Calendar view -->
        <div v-if="eventsView === 'calendar'" class="evt-cal-wrap">
          <div class="evt-month-grid">
            <div v-for="dow in ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']" :key="dow" class="evt-dow">{{ dow }}</div>
            <div
              v-for="cell in calendarCells"
              :key="cell.key"
              class="evt-cell evt-cell-clickable"
              :class="{ outside: cell.outside, today: cell.isToday }"
              role="button"
              tabindex="0"
              :title="cell.outside ? '' : `Add event on ${cell.key}`"
              @click="onEventsDayClick(cell)"
              @keydown.enter.prevent="onEventsDayClick(cell)"
            >
              <div class="evt-day-num">{{ cell.day }}</div>
              <button
                v-for="e in cell.events"
                :key="e.id"
                type="button"
                class="evt-chip"
                :class="[eventsTypeColor(e), { active: eventsSelectedId === e.id }]"
                :title="`${e.schoolName ? e.schoolName + ' — ' : ''}${e.title}`"
                @click.stop="selectEventsEvent(e.id)"
              >
                <span v-if="e.schoolName" class="evt-chip-school">{{ e.schoolName }}</span>
                {{ e.title }}
              </button>
            </div>
          </div>
          <div class="evt-legend">
            <span><i class="evtdot bts" />Back to School</span>
            <span><i class="evtdot fall" />Fall School Check-in</span>
            <span><i class="evtdot spring" />Spring School Check-in</span>
            <span><i class="evtdot holiday" />First Day / Holiday / Day off</span>
            <span><i class="evtdot fair" />Resource Fair</span>
            <span><i class="evtdot open" />Open House / Orientation</span>
            <span><i class="evtdot family" />Family Night</span>
            <span><i class="evtdot needs" />Needs staff</span>
          </div>
          <p v-if="!eventsInRange.length" class="empty">No school events this month.</p>
        </div>

        <!-- Agenda view -->
        <div v-else class="evt-agenda">
          <div v-if="!agendaEvents.length" class="empty">No school events this month.</div>
          <div
            v-for="e in agendaEvents"
            :key="e.id"
            class="agenda-row"
            :class="{ active: eventsSelectedId === e.id }"
            @click="selectEventsEvent(e.id)"
          >
            <div class="agenda-dot" :class="eventsTypeColor(e)" />
            <div class="agenda-date">
              <div class="primary">{{ eventsFormatDate(e.startsAt, e.timezone) }}</div>
              <div class="muted time-tz">{{ eventsFormatTime(e.startsAt, e.endsAt, e.timezone) }}</div>
              <div v-if="eventsReportBy(e)" class="muted report-by">{{ eventsReportBy(e) }}</div>
            </div>
            <div class="agenda-info">
              <div class="primary">{{ e.title }}</div>
              <div class="muted">{{ e.schoolName || '—' }} <span v-if="e.districtName">· {{ e.districtName }}</span></div>
            </div>
            <div class="agenda-meta">
              <span class="evttype" :class="eventsTypeColor(e)">{{ eventsLabelType(e.eventType) }}</span>
              <div class="muted">{{ eventsLabelStatus(e.staffingStatus) }}</div>
              <div v-if="e.staffingEnabled" class="muted">{{ e.providersAssigned }}/{{ e.providersRequested }} staffed</div>
            </div>
          </div>
        </div>

        <!-- School-year coverage + optional staffing -->
        <aside class="evt-coverage-panel" aria-label="School year event coverage">
          <SchoolEventStaffingPanel
            v-if="eventsSelectedEvent"
            :event="eventsSelectedEvent"
            :agency-id="agencyId"
            class="evt-side-panel evt-staffing-in-coverage"
            @close="eventsSelectedId = null"
            @changed="onEventsStaffingChanged"
          />

          <header class="cov-head">
            <h3>School year coverage</h3>
            <select v-model="coverageSchoolYear" aria-label="School year" @change="loadCoverage">
              <option v-for="y in coverageYearOptions" :key="y" :value="y">{{ y }}</option>
            </select>
          </header>
          <p v-if="coverageRangeText" class="cov-range muted">{{ coverageRangeText }}</p>

          <div v-if="coverageTotals" class="cov-rollups">
            <div class="cov-rollup">
              <span class="cov-label">Back to School</span>
              <strong>{{ coverageTotals.back_to_school?.have || 0 }}/{{ coverageTotals.back_to_school?.total || 0 }}</strong>
            </div>
            <div class="cov-rollup">
              <span class="cov-label">Fall check-in</span>
              <strong>{{ coverageTotals.fall_check_in?.have || 0 }}/{{ coverageTotals.fall_check_in?.total || 0 }}</strong>
            </div>
            <div class="cov-rollup">
              <span class="cov-label">Spring check-in</span>
              <strong>{{ coverageTotals.spring?.have || 0 }}/{{ coverageTotals.spring?.total || 0 }}</strong>
            </div>
          </div>

          <div class="cov-filters">
            <div class="events-view-toggle cov-toggle">
              <button type="button" :class="{ active: coverageHaveMode === 'missing' }" @click="coverageHaveMode = 'missing'">Missing</button>
              <button type="button" :class="{ active: coverageHaveMode === 'have' }" @click="coverageHaveMode = 'have'">Have</button>
              <button type="button" :class="{ active: coverageHaveMode === 'all' }" @click="coverageHaveMode = 'all'">All</button>
            </div>
            <select v-model="coverageTypeFilter" aria-label="Coverage event type">
              <option value="">All three types</option>
              <option value="back_to_school">Back to School</option>
              <option value="fall_check_in">Fall School Check-in</option>
              <option value="spring">Spring School Check-in</option>
            </select>
          </div>

          <div v-if="coverageLoading" class="muted pad">Loading coverage…</div>
          <div v-else-if="coverageError" class="error pad">{{ coverageError }}</div>
          <div v-else-if="!filteredCoverageSchools.length" class="muted pad">No schools match this filter.</div>
          <ul v-else class="cov-school-list">
            <li v-for="s in filteredCoverageSchools" :key="s.id" class="cov-school">
              <div class="cov-school-name">
                <strong>{{ s.name }}</strong>
                <span v-if="s.districtName" class="muted"> · {{ s.districtName }}</span>
              </div>
              <div
                v-for="cat in coverageCategories"
                :key="`${s.id}-${cat.key}`"
                class="cov-event-row"
                :class="{ missing: !s.events?.[cat.key] }"
              >
                <div class="cov-cat">{{ cat.label }}</div>
                <template v-if="s.events?.[cat.key]">
                  <button
                    type="button"
                    class="cov-event-link"
                    @click="selectEventsEvent(s.events[cat.key].eventId)"
                  >
                    {{ formatCoverageWhen(s.events[cat.key]) }}
                    <span v-if="s.events[cat.key].title" class="muted"> — {{ s.events[cat.key].title }}</span>
                  </button>
                  <div v-if="s.events[cat.key].locationOrDescription" class="muted tiny cov-desc">
                    {{ s.events[cat.key].locationOrDescription }}
                  </div>
                  <div v-if="s.events[cat.key].detailsUrl" class="tiny">
                    <a :href="s.events[cat.key].detailsUrl" target="_blank" rel="noopener">Event link</a>
                  </div>
                  <div class="cov-people">
                    <span class="tiny">
                      Assigned:
                      <template v-if="(s.events[cat.key].assigned || []).length">
                        {{ (s.events[cat.key].assigned || []).map((p) => p.name).join(', ') }}
                      </template>
                      <template v-else>none</template>
                    </span>
                    <span class="tiny">
                      Requested:
                      <template v-if="(s.events[cat.key].pendingRequests || []).length">
                        {{ (s.events[cat.key].pendingRequests || []).map((p) => p.name).join(', ') }}
                      </template>
                      <template v-else>none</template>
                    </span>
                  </div>
                </template>
                <div v-else class="muted tiny">Not scheduled</div>
              </div>
            </li>
          </ul>
        </aside>
      </div>

      <!-- Add event: one school or entire district -->
      <div v-if="eventsShowSchoolPicker" class="caseload-modal-backdrop" @click.self="closeEventsAddPicker">
        <div class="caseload-modal">
          <header class="caseload-modal-header">
            <h2>Add school event</h2>
            <button type="button" class="btn btn-secondary btn-sm" @click="closeEventsAddPicker">Cancel</button>
          </header>
          <div class="events-scope-toggle">
            <button
              type="button"
              class="events-scope-chip"
              :class="{ active: eventsAddScope === 'school' }"
              @click="eventsAddScope = 'school'"
            >
              One school
            </button>
            <button
              type="button"
              class="events-scope-chip"
              :class="{ active: eventsAddScope === 'district' }"
              @click="eventsAddScope = 'district'; loadEventsDistricts()"
            >
              Entire district
            </button>
          </div>
          <template v-if="eventsAddScope === 'school'">
            <p class="muted">Choose the school this event belongs to.</p>
            <select v-model="eventsPostSchoolId" class="search" style="width:100%;margin-top:0.5rem;">
              <option :value="null">Select a school…</option>
              <option v-for="s in eventSchoolOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </template>
          <template v-else>
            <p class="muted">Creates the same event for every school in the selected district.</p>
            <select v-model="eventsPostDistrictName" class="search" style="width:100%;margin-top:0.5rem;">
              <option value="">Select a district…</option>
              <option v-for="d in eventsDistrictOptions" :key="d.districtName" :value="d.districtName">
                {{ d.districtName }} ({{ d.schoolCount }} schools)
              </option>
            </select>
            <p v-if="eventsDistrictsError" class="error-inline">{{ eventsDistrictsError }}</p>
          </template>
          <footer class="caseload-modal-actions" style="margin-top:1rem;">
            <button type="button" class="btn btn-secondary" @click="closeEventsAddPicker">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="eventsAddScope === 'school' ? !eventsPostSchoolId : !eventsPostDistrictName"
              @click="confirmEventsAddPicker"
            >
              Continue
            </button>
          </footer>
        </div>
      </div>
      <PostSchoolEventModal
        v-if="showEventsPostModal && (eventsPostSchoolId || eventsPostDistrictName)"
        :school-organization-id="eventsPostSchoolId ? Number(eventsPostSchoolId) : null"
        :school-name="eventsPostSchoolName"
        :agency-id="agencyId"
        :district-name="eventsPostDistrictName || ''"
        :initial-date="eventsPostInitialDate"
        :initial-category="eventsPostDistrictName ? 'holiday' : 'back_to_school'"
        @close="closeEventsPostModal"
        @saved="onEventsEventSaved"
      />
    </div>

    <!-- Coverage Needs -->
    <div v-else-if="tab === 'coverage-needs'" class="coverage-needs-wrap">
      <div class="coverage-quick-filters" data-tour="coverage-category-buttons">
        <button
          type="button"
          class="coverage-quick-btn"
          :class="{ active: !needTypeFilter }"
          @click="needTypeFilter = ''"
        >
          <span class="coverage-quick-count">{{ needs.length }}</span>
          <span class="coverage-quick-label">All</span>
        </button>
        <button
          v-for="section in needsByCategory"
          :key="`quick-${section.type}`"
          type="button"
          class="coverage-quick-btn"
          :class="[section.severity, { active: needTypeFilter === section.type }]"
          @click="needTypeFilter = needTypeFilter === section.type ? '' : section.type"
        >
          <span class="coverage-quick-count">{{ section.entries.length }}</span>
          <span class="coverage-quick-label">{{ section.title }}</span>
        </button>
        <button type="button" class="btn btn-secondary btn-sm coverage-expire-btn" @click="runExpireStale">
          Expire stale (30d)
        </button>
      </div>

      <div class="coverage-split">
      <div class="list-panel coverage-list-panel">
        <div class="list-toolbar">
          <select v-model="needTypeFilter">
            <option value="">All need types</option>
            <option v-for="c in warningCards" :key="c.type" :value="c.type">{{ c.title }}</option>
          </select>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Need</th>
              <th>School / Provider</th>
              <th>Count</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in filteredNeeds"
              :key="item.id"
              :class="{ selected: needTypeFilter === item.type }"
              @click="needTypeFilter = item.type"
            >
              <td><span class="sev" :class="item.severity">{{ item.severity }}</span></td>
              <td>
                <div class="primary">{{ item.title }}</div>
                <div class="muted">{{ item.message }}</div>
              </td>
              <td>{{ item.schoolName || item.providerName || '—' }}</td>
              <td>{{ item.count }}</td>
              <td>
                <router-link v-if="item.resolutionPath" class="link" :to="item.resolutionPath" @click.stop>Resolve</router-link>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!filteredNeeds.length" class="empty">No coverage needs{{ needTypeFilter ? ' for this filter' : '' }}.</p>

        <section v-if="suggestions.length" class="suggestions">
          <h3>Suggested matches</h3>
          <ul>
            <li v-for="(s, idx) in suggestions" :key="idx">
              {{ s.providerName }} →
              {{ (s.matches || []).map((m) => `${m.dayOfWeek} @ ${m.schoolName}`).join('; ') }}
              <router-link class="link" to="/admin/availability-intake">Review intake</router-link>
            </li>
          </ul>
        </section>
      </div>

      <aside class="detail-panel coverage-browse-panel" data-tour="coverage-needs-browse">
        <div class="coverage-browse-header">
          <h2>Browse by category</h2>
          <p class="muted">Each category lists every school or provider affected, with counts.</p>
          <button
            v-if="needTypeFilter"
            type="button"
            class="btn btn-secondary btn-sm"
            @click="needTypeFilter = ''"
          >
            Show all categories
          </button>
        </div>

        <section
          v-for="section in needsByCategory"
          :key="section.type"
          class="coverage-category"
          :class="[section.severity, { collapsed: needTypeFilter && needTypeFilter !== section.type }]"
        >
          <button type="button" class="coverage-category-head" @click="needTypeFilter = section.type">
            <span class="sev" :class="section.severity">{{ section.severity }}</span>
            <span class="coverage-category-title">{{ section.title }}</span>
            <span class="coverage-category-meta">
              {{ section.entries.length }}
              {{ section.entityLabel }}{{ section.entries.length === 1 ? '' : 's' }}
              · {{ section.totalCount }} {{ section.countLabel }}
            </span>
          </button>
          <ul v-if="!needTypeFilter || needTypeFilter === section.type" class="coverage-category-list">
            <li v-for="entry in section.entries" :key="entry.key">
              <div class="school-cell">
                <div v-if="entry.kind === 'school'" class="school-logo school-logo-sm">
                  <img
                    v-if="schoolLogoUrl(entry) && !failedLogoIds.has(`need-${entry.key}`)"
                    :src="schoolLogoUrl(entry)"
                    :alt="`${entry.label} logo`"
                    class="school-logo-img"
                    @error="onLogoError(`need-${entry.key}`)"
                  />
                  <span v-else class="school-logo-fallback" aria-hidden="true">{{ schoolInitials({ schoolName: entry.label }) }}</span>
                </div>
                <div v-else class="school-logo school-logo-sm person-fallback" aria-hidden="true">
                  <span class="school-logo-fallback">{{ personInitials(entry.label) }}</span>
                </div>
                <div class="school-text">
                  <div class="primary">{{ entry.label }}</div>
                  <div v-if="entry.detail" class="muted">{{ entry.detail }}</div>
                </div>
              </div>
              <div class="coverage-entry-count">
                <strong>{{ entry.count }}</strong>
                <span>{{ entry.countLabel }}</span>
              </div>
            </li>
            <li v-if="!section.entries.length" class="muted">None in this category.</li>
          </ul>
        </section>
        <p v-if="!needsByCategory.length" class="empty">No coverage categories to browse.</p>
      </aside>
      </div>
    </div>

    <!-- Open School Spots -->
    <div v-else-if="tab === 'open-spots'" class="full-panel" data-tour="open-school-spots">
      <OpenSchoolDaysToast
        :count="openDaysSummary.total || 0"
        :storage-key="`osd-toast-${agencyId || 'x'}`"
      />
      <div class="open-banner" data-tour="open-school-days-banner">
        <div>
          <h2>Available days at schools</h2>
          <p v-if="openDaysSummary.total">
            {{ openDaysSummary.total }} opening(s) across {{ openDaysSummary.schoolsAffected }} school(s)
            <span v-if="openDaysSummary.highUrgency"> · {{ openDaysSummary.highUrgency }} high urgency</span>
          </p>
          <p v-else class="muted">No open school days right now.</p>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>School</th>
            <th>Day</th>
            <th>Open slots</th>
            <th>Waitlist</th>
            <th>Urgency</th>
            <th>Reason</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in openDays" :key="d.id">
            <td>{{ d.schoolName }}</td>
            <td>{{ d.dayOfWeek }}</td>
            <td>{{ d.openSlots }}</td>
            <td>{{ d.waitlist }}</td>
            <td><span class="sev" :class="d.urgency === 'high' ? 'critical' : d.urgency === 'medium' ? 'moderate' : 'informational'">{{ d.urgency }}</span></td>
            <td class="muted">{{ (d.reasons || []).join(', ') }}</td>
            <td>
              <button
                v-if="canApply"
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="applyingId === d.id"
                @click="applyDay(d)"
              >
                {{ applyingId === d.id ? 'Applying…' : 'Apply' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="applyMsg" class="apply-msg">{{ applyMsg }}</p>
    </div>

    <!-- Inline caseload editor (provider × school day slots) -->
    <div v-if="caseloadEditor" class="caseload-modal-backdrop" @click.self="closeCaseloadEditor">
      <div class="caseload-modal" role="dialog" aria-modal="true" :aria-label="`Edit caseload for ${caseloadEditor.schoolName}`">
        <header class="caseload-modal-header">
          <div>
            <h2>{{ caseloadEditor.providerName }}</h2>
            <p class="muted">{{ caseloadEditor.schoolName }} · assigned clients / available slots by day</p>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" @click="closeCaseloadEditor">Close</button>
        </header>
        <p class="caseload-modal-summary">
          School total:
          <strong>{{ caseloadEditor.clients }}</strong> assigned ·
          <strong>{{ caseloadEditor.slotsAvailable }}</strong> available ·
          <strong>{{ caseloadEditor.slotsTotal }}</strong> capacity
        </p>
        <p class="muted tiny">
          Assigned clients come from live client–provider assignments (read-only here).
          Edit total slots to change available capacity — same source as Provider Scheduling / School Portal.
        </p>
        <table class="data-table compact caseload-edit-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Assigned</th>
              <th>Total slots</th>
              <th>Available</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in caseloadEditor.days" :key="d.dayOfWeek">
              <td>{{ d.dayOfWeek }}</td>
              <td>{{ d.clients }}</td>
              <td>
                <input
                  v-model.number="d.slotsTotal"
                  type="number"
                  min="0"
                  step="1"
                  class="slot-input"
                  :disabled="caseloadSaving"
                  @change="clampDaySlots(d)"
                />
              </td>
              <td>
                <span :class="{ warn: d.slotsTotal < d.clients }">{{ Math.max(0, d.slotsTotal - d.clients) }}</span>
                <div v-if="d.slotsTotal < d.clients" class="warn tiny">Below assigned</div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="caseloadError" class="error">{{ caseloadError }}</p>
        <p v-if="caseloadMsg" class="apply-msg">{{ caseloadMsg }}</p>
        <footer class="caseload-modal-actions">
          <router-link
            class="btn btn-secondary"
            :to="`/admin/users/${caseloadEditor.providerId}`"
          >
            Full profile
          </router-link>
          <button type="button" class="btn btn-secondary" :disabled="caseloadSaving" @click="closeCaseloadEditor">
            Cancel
          </button>
          <button type="button" class="btn btn-primary" :disabled="caseloadSaving || !caseloadDirty" @click="saveCaseloadEditor">
            {{ caseloadSaving ? 'Saving…' : 'Save slots' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  formatSchoolEventDate,
  formatSchoolEventTimeRange,
  formatSchoolEventReportTime,
  schoolEventTimezoneLabel,
  timezoneAbbrevAt,
  SCHOOL_EVENT_FALLBACK_TIMEZONE
} from '../../../utils/timezones';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import { toUploadsUrl } from '../../../utils/uploadsUrl';
import OpenSchoolDaysToast from '../../../components/caseload-hub/OpenSchoolDaysToast.vue';
import {
  fetchSchoolCoverageSummary,
  fetchProviderCoverageSummary,
  fetchCoverageWarnings,
  fetchOpenSchoolDays,
  fetchSchoolDetail,
  fetchProviderDetail,
  fetchCoverageSuggestions,
  expireStaleSchoolRequests,
  applyForOpenSchoolDay,
  upsertProviderDaySlots,
  fetchHubEvents,
  fetchSchoolYearEventCoverage
} from '../../../services/schoolCoverageApi';
import api from '../../../services/api';
import SchoolEventStaffingPanel from '../../../components/caseload-hub/SchoolEventStaffingPanel.vue';
import PostSchoolEventModal from '../../../components/school/PostSchoolEventModal.vue';
import AvailabilityIntakeManagement from '../../../components/admin/AvailabilityIntakeManagement.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const tabs = [
  { id: 'by-school', label: 'By School' },
  { id: 'by-person', label: 'By Person' },
  { id: 'events', label: 'Events' },
  { id: 'coverage-needs', label: 'Coverage Needs' },
  { id: 'school-availability', label: 'Additional School Hours' },
  { id: 'open-spots', label: 'Open School Spots' }
];

const tab = ref('by-school');
const loading = ref(false);
const error = ref('');
const agencyId = ref(null);
const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const isSuperAdmin = computed(() => role.value === 'super_admin');
const agencies = computed(() =>
  isSuperAdmin.value ? agencyStore.agencies || [] : agencyStore.userAgencies || agencyStore.agencies || []
);

const schools = ref([]);
const providers = ref([]);
const warningCards = ref([]);
const needs = ref([]);
const openDays = ref([]);
const openDaysSummary = ref({ total: 0, highUrgency: 0, schoolsAffected: 0 });
const suggestions = ref([]);

// --- Events tab ---
const hubEvents = ref([]);
const eventsView = ref('calendar'); // 'calendar' | 'agenda'
const eventsCursor = ref(eventsStartOfMonth(new Date()));
const eventsDistrictFilter = ref('');
const eventsSchoolFilter = ref('');
const eventsTypeFilter = ref('');
const eventsSelectedId = ref(null);
const showEventsPostModal = ref(false);
const eventsPostSchoolId = ref(null);
const eventsPostInitialDate = ref('');
const eventsShowSchoolPicker = ref(false);
const eventsAddScope = ref('school'); // school | district
const eventsPostDistrictName = ref('');
const eventsDistrictOptions = ref([]);
const eventsDistrictsError = ref('');
const eventsDistrictsLoadedForAgency = ref(null);

const coverageCategories = [
  { key: 'back_to_school', label: 'Back to School' },
  { key: 'fall_check_in', label: 'Fall School Check-in' },
  { key: 'spring', label: 'Spring School Check-in' }
];

function currentSchoolYearLabel(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const start = m >= 8 ? y : y - 1;
  return `${start}-${start + 1}`;
}

const coverageSchoolYear = ref(currentSchoolYearLabel());
const coverageYearOptions = computed(() => {
  const cur = currentSchoolYearLabel();
  const start = Math.min(2026, parseInt(String(cur).split('-')[0], 10) || 2026);
  const end = Math.max(parseInt(String(cur).split('-')[0], 10) || start, start) + 2;
  const years = [];
  for (let y = start; y <= end; y += 1) years.push(`${y}-${y + 1}`);
  if (!years.includes('2026-2027')) years.unshift('2026-2027');
  return [...new Set(years)].sort();
});
const coverageHaveMode = ref('missing'); // missing | have | all
const coverageTypeFilter = ref('');
const coverageLoading = ref(false);
const coverageError = ref('');
const coveragePayload = ref(null);

const coverageTotals = computed(() => coveragePayload.value?.totals || null);
const coverageRangeText = computed(() => {
  const r = coveragePayload.value?.range;
  if (!r?.start || !r?.end) return '';
  return `${r.start} → ${r.end}`;
});

const filteredCoverageSchools = computed(() => {
  const list = coveragePayload.value?.schools || [];
  const mode = coverageHaveMode.value;
  const type = coverageTypeFilter.value;
  const cats = type ? [type] : coverageCategories.map((c) => c.key);
  return list.filter((s) => {
    if (mode === 'all') return true;
    const missingAny = cats.some((c) => !s.events?.[c]);
    if (mode === 'have') return type ? !!s.events?.[type] : cats.every((c) => !!s.events?.[c]);
    return type ? !s.events?.[type] : missingAny;
  });
});

function formatCoverageWhen(ev) {
  if (!ev?.startsAt) return 'Scheduled';
  try {
    return new Date(ev.startsAt).toLocaleString('en-US', {
      timeZone: ev.timezone || undefined,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return String(ev.startsAt);
  }
}

async function loadCoverage() {
  if (!agencyId.value) return;
  coverageLoading.value = true;
  coverageError.value = '';
  try {
    coveragePayload.value = await fetchSchoolYearEventCoverage(agencyId.value, coverageSchoolYear.value);
  } catch (e) {
    coverageError.value = e?.response?.data?.error?.message || 'Failed to load school-year coverage';
    coveragePayload.value = null;
  } finally {
    coverageLoading.value = false;
  }
}

async function onEventsStaffingChanged() {
  await reload();
}

const eventsPostSchoolName = computed(() => {
  const id = Number(eventsPostSchoolId.value);
  if (!Number.isFinite(id) || id <= 0) return '';
  const fromOpts = eventSchoolOptions.value.find((s) => Number(s.id) === id);
  if (fromOpts?.name) return String(fromOpts.name);
  const fromSchools = schools.value.find((s) => Number(s.schoolId) === id);
  return String(fromSchools?.schoolName || '').trim();
});

function eventsStartOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function eventsStartOfWeek(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}
function eventsYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function eventsShift(dir) {
  const d = new Date(eventsCursor.value);
  d.setMonth(d.getMonth() + dir);
  eventsCursor.value = eventsStartOfMonth(d);
}
function eventsGoToday() {
  eventsCursor.value = eventsStartOfMonth(new Date());
}

const eventsRangeLabel = computed(() =>
  eventsCursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
);

function eventDistrictName(e) {
  const direct = String(e?.districtName || '').trim();
  if (direct) return direct;
  const school = schools.value.find((s) => Number(s.schoolId) === Number(e?.schoolId));
  return String(school?.districtName || '').trim();
}

const filteredHubEvents = computed(() => {
  let list = hubEvents.value;
  if (eventsDistrictFilter.value) {
    list = list.filter((e) => eventDistrictName(e) === eventsDistrictFilter.value);
  }
  if (eventsSchoolFilter.value) list = list.filter((e) => String(e.schoolId) === eventsSchoolFilter.value);
  if (eventsTypeFilter.value) list = list.filter((e) => e.eventType === eventsTypeFilter.value);
  return list;
});

const eventsInRange = computed(() => {
  return filteredHubEvents.value.filter((e) => {
    const t = e.startsAt ? new Date(e.startsAt) : null;
    if (!t || Number.isNaN(t.getTime())) return false;
    return t.getMonth() === eventsCursor.value.getMonth() && t.getFullYear() === eventsCursor.value.getFullYear();
  });
});

const calendarCells = computed(() => {
  const byDay = new Map();
  for (const e of eventsInRange.value) {
    const key = eventsYmd(new Date(e.startsAt));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(e);
  }
  const first = eventsStartOfMonth(eventsCursor.value);
  const gridStart = eventsStartOfWeek(first);
  const today = eventsYmd(new Date());
  const out = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = eventsYmd(d);
    out.push({
      key,
      day: d.getDate(),
      outside: d.getMonth() !== eventsCursor.value.getMonth(),
      isToday: key === today,
      events: byDay.get(key) || []
    });
  }
  return out;
});

const agendaEvents = computed(() =>
  eventsInRange.value.slice().sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
);

const eventSchoolOptions = computed(() => {
  const map = new Map();
  // Prefer full school list so district filter can show schools even before they have events
  const source = schools.value.length
    ? schools.value.map((s) => ({
        id: s.schoolId,
        name: s.schoolName || `School ${s.schoolId}`,
        district: String(s.districtName || '').trim()
      }))
    : hubEvents.value.map((e) => ({
        id: e.schoolId,
        name: e.schoolName || `School ${e.schoolId}`,
        district: eventDistrictName(e)
      }));
  for (const s of source) {
    if (!s.id) continue;
    if (eventsDistrictFilter.value && s.district !== eventsDistrictFilter.value) continue;
    map.set(s.id, s.name);
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
});

const eventsSelectedEvent = computed(() => hubEvents.value.find((e) => e.id === eventsSelectedId.value) || null);

watch(eventsDistrictFilter, () => {
  if (!eventsSchoolFilter.value) return;
  const stillValid = eventSchoolOptions.value.some((s) => String(s.id) === eventsSchoolFilter.value);
  if (!stillValid) eventsSchoolFilter.value = '';
});

function eventsTypeColor(e) {
  if (e.staffingStatus === 'needs_providers' || e.staffingStatus === 'partially_staffed') return 'needs';
  const t = String(e.eventType || '');
  if (t === 'school_back_to_school') return 'bts';
  if (t === 'school_fall_check_in') return 'fall';
  if (t === 'school_spring_event') return 'spring';
  if (t === 'school_first_day' || t === 'school_holiday' || t === 'school_day_off') return 'holiday';
  if (t === 'school_resource_fair' || t === 'school_other') return 'fair';
  if (t === 'school_open_house' || t === 'school_orientation') return 'open';
  if (t === 'school_family_night') return 'family';
  return 'fair';
}

function eventsFormatDate(v, timezone) {
  return formatSchoolEventDate(v, timezone);
}

function eventsFormatTime(a, b, timezone) {
  return formatSchoolEventTimeRange(a, b, timezone);
}

function eventsReportBy(e) {
  const t = formatSchoolEventReportTime(
    e?.employeeReportTime,
    timezoneAbbrevAt(e?.startsAt || new Date(), e?.timezone)
  );
  return t ? `Report by ${t}` : '';
}

function eventsLabelType(t) {
  const m = {
    school_back_to_school: 'Back to School',
    school_fall_check_in: 'Fall School Check-in',
    school_spring_event: 'Spring School Check-in',
    school_first_day: 'First Day of School',
    school_open_house: 'Open House',
    school_resource_fair: 'Resource Fair',
    school_family_night: 'Family Night',
    school_orientation: 'Orientation',
    school_holiday: 'Holiday',
    school_day_off: 'Day Off',
    school_other: 'School Event'
  };
  return m[t] || t || 'Event';
}

function eventsLabelStatus(s) {
  if (s === 'needs_providers') return 'Needs staff';
  if (s === 'requests_pending') return 'Requests pending';
  if (s === 'partially_staffed') return 'Partially staffed';
  if (s === 'fully_staffed') return 'Fully staffed';
  if (s === 'not_open') return 'Not open';
  return 'Scheduled';
}

async function loadEventsDistricts() {
  if (!agencyId.value) return;
  if (eventsDistrictsLoadedForAgency.value === agencyId.value && eventsDistrictOptions.value.length) {
    return;
  }
  eventsDistrictsError.value = '';
  try {
    const res = await api.get('/school-portal/school-events/districts', {
      params: { agencyId: agencyId.value }
    });
    const fromApi = Array.isArray(res.data?.districts) ? res.data.districts : [];
    if (fromApi.length) {
      eventsDistrictOptions.value = fromApi;
    } else {
      // Fallback from loaded school list (name + count)
      const counts = new Map();
      for (const s of schools.value) {
        const d = String(s.districtName || '').trim();
        if (!d) continue;
        counts.set(d, (counts.get(d) || 0) + 1);
      }
      eventsDistrictOptions.value = Array.from(counts.entries())
        .map(([districtName, schoolCount]) => ({ districtName, schoolCount }))
        .sort((a, b) => a.districtName.localeCompare(b.districtName));
    }
    eventsDistrictsLoadedForAgency.value = agencyId.value;
  } catch (e) {
    eventsDistrictsError.value = e?.response?.data?.error?.message || 'Failed to load districts';
    eventsDistrictOptions.value = schoolDistrictOptions.value.map((d) => ({
      districtName: d,
      schoolCount: schools.value.filter((s) => String(s.districtName || '').trim() === d).length
    }));
  }
}

function openEventsAddEvent(dateYmd = '') {
  const raw = typeof dateYmd === 'string' ? dateYmd : '';
  eventsPostInitialDate.value = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  eventsPostDistrictName.value = '';
  eventsPostSchoolId.value = eventsSchoolFilter.value ? Number(eventsSchoolFilter.value) : null;
  // Prefer district scope when a district filter is set (and no specific school).
  if (eventsDistrictFilter.value && !eventsSchoolFilter.value) {
    eventsAddScope.value = 'district';
    eventsPostDistrictName.value = eventsDistrictFilter.value;
    loadEventsDistricts();
  } else {
    eventsAddScope.value = 'school';
  }
  eventsShowSchoolPicker.value = true;
}

function confirmEventsAddPicker() {
  if (eventsAddScope.value === 'district') {
    if (!eventsPostDistrictName.value) return;
    eventsPostSchoolId.value = null;
  } else if (!eventsPostSchoolId.value) {
    return;
  } else {
    eventsPostDistrictName.value = '';
  }
  eventsShowSchoolPicker.value = false;
  showEventsPostModal.value = true;
}

function closeEventsAddPicker() {
  eventsShowSchoolPicker.value = false;
}

function onEventsDayClick(cell) {
  if (!cell || cell.outside) return;
  openEventsAddEvent(cell.key);
}

function closeEventsPostModal() {
  showEventsPostModal.value = false;
  eventsPostInitialDate.value = '';
  eventsPostDistrictName.value = '';
}

async function onEventsEventSaved() {
  closeEventsPostModal();
  eventsShowSchoolPicker.value = false;
  hubEvents.value = (await fetchHubEvents(agencyId.value).catch(() => ({ events: [] }))).events || [];
  loadCoverage().catch(() => {});
}

function selectEventsEvent(id) {
  eventsSelectedId.value = eventsSelectedId.value === id ? null : id;
}

const schoolSearch = ref('');
const schoolDistrictFilter = ref('');
const schoolSort = ref('name');
const providerSearch = ref('');
const needTypeFilter = ref('');
const selectedSchoolId = ref(null);
const selectedProviderId = ref(null);
const schoolDetail = ref(null);
const providerDetail = ref(null);
const applyingId = ref(null);
const applyMsg = ref('');
const failedLogoIds = ref(new Set());
const caseloadEditor = ref(null);
const caseloadEditorBaseline = ref(null);
const caseloadSaving = ref(false);
const caseloadError = ref('');
const caseloadMsg = ref('');

const canApply = computed(() =>
  ['provider', 'provider_plus', 'intern', 'intern_plus', 'admin', 'support', 'staff', 'super_admin', 'clinical_practice_assistant'].includes(role.value)
);
const canManageCaseload = computed(() =>
  ['super_admin', 'admin', 'support', 'staff', 'clinical_practice_assistant', 'provider_plus'].includes(role.value)
);
const caseloadDirty = computed(() => {
  if (!caseloadEditor.value || !caseloadEditorBaseline.value) return false;
  const cur = caseloadEditor.value.days || [];
  const base = caseloadEditorBaseline.value;
  if (cur.length !== base.length) return true;
  return cur.some((d, i) => Number(d.slotsTotal) !== Number(base[i]?.slotsTotal));
});

function schoolLogoUrl(school) {
  const candidates = [
    school?.logoPath,
    school?.logo_path,
    school?.iconFilePath,
    school?.icon_file_path,
    school?.iconPath,
    school?.icon_path,
    school?.logoUrl,
    school?.logo_url,
    school?.iconUrl,
    school?.icon_url
  ];
  const raw = candidates.find((v) => String(v || '').trim());
  if (!raw) return null;
  const s = String(raw).trim();
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return s;
  return toUploadsUrl(s);
}

function schoolInitials(school) {
  const name = String(school?.schoolName || school?.school_name || '').trim();
  if (!name) return '?';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatRole(role) {
  return String(role || '—').replace(/_/g, ' ');
}

/** Schools with day assignments first; hide membership-only noise in the main list. */
function providerSchoolsForList(provider) {
  const schools = Array.isArray(provider?.schools) ? provider.schools : [];
  const staffed = schools.filter((s) => s.fromAssignment || (s.days || []).length > 0);
  return staffed.length ? staffed : schools;
}

function schoolCaseloadTitle(school) {
  const assigned = Number(school?.clients || 0);
  const avail = Number(school?.slotsAvailable || 0);
  const total = Number(school?.slotsTotal || 0);
  return `${school?.schoolName || 'School'}: ${assigned} assigned / ${avail} available (${total} total capacity)${canManageCaseload.value ? ' — click to edit' : ''}`;
}

function clampDaySlots(day) {
  const n = Number(day.slotsTotal);
  day.slotsTotal = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function openCaseloadEditor(provider, school, { keepMessage = false } = {}) {
  if (!canManageCaseload.value) {
    selectProvider(provider.providerId);
    return;
  }
  if (!(school.fromAssignment || (school.days || []).length)) return;
  const days = (school.days || []).map((d) => ({
    dayOfWeek: d.dayOfWeek,
    clients: Number(d.clients || d.slotsUsed || 0),
    slotsTotal: Number(d.slotsTotal || 0),
    startTime: d.startTime || null,
    endTime: d.endTime || null
  }));
  caseloadError.value = '';
  if (!keepMessage) caseloadMsg.value = '';
  caseloadEditorBaseline.value = days.map((d) => ({ ...d }));
  caseloadEditor.value = {
    providerId: provider.providerId,
    providerName: provider.name,
    schoolId: school.schoolId,
    schoolName: school.schoolName,
    clients: Number(school.clients || 0),
    slotsAvailable: Number(school.slotsAvailable || 0),
    slotsTotal: Number(school.slotsTotal || 0),
    days
  };
  selectProvider(provider.providerId);
}

function closeCaseloadEditor() {
  if (caseloadSaving.value) return;
  caseloadEditor.value = null;
  caseloadEditorBaseline.value = null;
  caseloadError.value = '';
  caseloadMsg.value = '';
}

async function saveCaseloadEditor() {
  if (!caseloadEditor.value || !agencyId.value || !caseloadDirty.value) return;
  caseloadSaving.value = true;
  caseloadError.value = '';
  caseloadMsg.value = '';
  try {
    const ed = caseloadEditor.value;
    const baseByDay = new Map((caseloadEditorBaseline.value || []).map((d) => [d.dayOfWeek, d]));
    for (const d of ed.days || []) {
      clampDaySlots(d);
      const prev = baseByDay.get(d.dayOfWeek);
      if (prev && Number(prev.slotsTotal) === Number(d.slotsTotal)) continue;
      await upsertProviderDaySlots(agencyId.value, {
        providerUserId: ed.providerId,
        schoolOrganizationId: ed.schoolId,
        dayOfWeek: d.dayOfWeek,
        slotsTotal: Number(d.slotsTotal),
        startTime: d.startTime,
        endTime: d.endTime,
        isActive: true
      });
    }
    await reload();
    const refreshed = providers.value.find((p) => p.providerId === ed.providerId);
    const school = (refreshed?.schools || []).find((s) => s.schoolId === ed.schoolId);
    if (school) {
      openCaseloadEditor(refreshed, school, { keepMessage: true });
      caseloadMsg.value = 'Slots saved to provider school assignments.';
    } else {
      closeCaseloadEditor();
      applyMsg.value = 'Slots saved to provider school assignments.';
    }
  } catch (e) {
    caseloadError.value = e?.response?.data?.error?.message || e?.message || 'Failed to save slots';
  } finally {
    caseloadSaving.value = false;
  }
}

function onLogoError(schoolId) {
  failedLogoIds.value = new Set([...failedLogoIds.value, String(schoolId)]);
}

function orgTo(path) {
  const slug = route.params.organizationSlug;
  if (slug) return `/${slug}${path}`;
  return path;
}

function setTab(id) {
  tab.value = id;
  const q = { ...route.query, tab: id };
  router.replace({ query: q });
}

function goCoverageNeeds(type) {
  needTypeFilter.value = type || '';
  setTab('coverage-needs');
}

const schoolDistrictOptions = computed(() => {
  const set = new Set();
  for (const s of schools.value) {
    const d = String(s.districtName || '').trim();
    if (d) set.add(d);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

const filteredSchools = computed(() => {
  let list = [...schools.value];
  if (schoolDistrictFilter.value) {
    list = list.filter(
      (s) => String(s.districtName || '').trim() === schoolDistrictFilter.value
    );
  }
  const q = schoolSearch.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (s) =>
        String(s.schoolName || '').toLowerCase().includes(q) ||
        String(s.districtName || '').toLowerCase().includes(q)
    );
  }
  if (schoolSort.value === 'capacity') list.sort((a, b) => b.capacityUtilization - a.capacityUtilization);
  else if (schoolSort.value === 'waitlist') list.sort((a, b) => b.waitlistCount - a.waitlistCount);
  else if (schoolSort.value === 'warnings') list.sort((a, b) => b.warningCount - a.warningCount);
  else list.sort((a, b) => String(a.schoolName || '').localeCompare(String(b.schoolName || '')));
  return list;
});

const filteredProviders = computed(() => {
  const q = providerSearch.value.trim().toLowerCase();
  if (!q) return providers.value;
  return providers.value.filter(
    (p) =>
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.role || '').toLowerCase().includes(q)
  );
});

const filteredNeeds = computed(() => {
  if (!needTypeFilter.value) return needs.value;
  return needs.value.filter((n) => n.type === needTypeFilter.value);
});

const CATEGORY_META = {
  clients_without_provider: {
    title: 'Schools with clients without providers',
    entityLabel: 'school',
    countLabel: 'clients'
  },
  clients_without_service_day: {
    title: 'Schools with clients without service days',
    entityLabel: 'school',
    countLabel: 'clients'
  },
  providers_without_assigned_days: {
    title: 'Providers without assigned days',
    entityLabel: 'provider',
    countLabel: 'providers'
  },
  unstaffed_school_days: {
    title: 'Schools with unstaffed days',
    entityLabel: 'school',
    countLabel: 'unstaffed days'
  },
  waitlist_no_capacity: {
    title: 'Schools with waitlists (no capacity)',
    entityLabel: 'school',
    countLabel: 'waitlisted'
  },
  waitlist_unused_capacity: {
    title: 'Schools with waitlists (unused capacity)',
    entityLabel: 'school',
    countLabel: 'waitlisted'
  },
  school_nearing_capacity: {
    title: 'Schools nearing capacity',
    entityLabel: 'school',
    countLabel: 'schools'
  },
  events_needing_providers: {
    title: 'Events needing providers',
    entityLabel: 'event',
    countLabel: 'openings'
  },
  pending_event_requests: {
    title: 'Events with pending provider requests',
    entityLabel: 'event',
    countLabel: 'requests'
  },
  pending_additional_day_requests: {
    title: 'Pending additional-day requests',
    entityLabel: 'request',
    countLabel: 'requests'
  }
};

const needsByCategory = computed(() => {
  const schoolById = new Map((schools.value || []).map((s) => [Number(s.schoolId), s]));
  const order = warningCards.value?.length
    ? warningCards.value.map((c) => c.type)
    : Object.keys(CATEGORY_META);

  const grouped = new Map();
  for (const item of needs.value || []) {
    if (!grouped.has(item.type)) grouped.set(item.type, []);
    grouped.get(item.type).push(item);
  }

  return order
    .filter((type) => grouped.has(type) || (warningCards.value || []).some((c) => c.type === type && c.count > 0))
    .map((type) => {
      const meta = CATEGORY_META[type] || {
        title: (warningCards.value || []).find((c) => c.type === type)?.title || type,
        entityLabel: 'item',
        countLabel: 'total'
      };
      const items = grouped.get(type) || [];
      const card = (warningCards.value || []).find((c) => c.type === type);
      const entries = items
        .map((item) => {
          const school = item.schoolId ? schoolById.get(Number(item.schoolId)) : null;
          const isSchool = !!item.schoolName || !!item.schoolId;
          const isProvider = !!item.providerName || !!item.providerId;
          let countLabel = meta.countLabel;
          if (type === 'school_nearing_capacity') countLabel = `${item.utilization || item.count}% used`;
          else if (type === 'unstaffed_school_days' && item.days?.length) {
            countLabel = item.days.join(', ');
          }
          return {
            key: item.id,
            kind: isProvider && !isSchool ? 'person' : isSchool ? 'school' : 'other',
            label: item.schoolName || item.providerName || item.title || '—',
            detail: item.eventId ? item.message : item.days?.length ? item.days.join(', ') : null,
            count: item.count,
            countLabel,
            schoolName: item.schoolName || school?.schoolName,
            logoPath: school?.logoPath,
            logoUrl: school?.logoUrl,
            iconFilePath: school?.iconFilePath,
            iconPath: school?.iconPath
          };
        })
        .sort((a, b) => Number(b.count || 0) - Number(a.count || 0) || String(a.label).localeCompare(String(b.label)));

      return {
        type,
        title: meta.title,
        entityLabel: meta.entityLabel,
        countLabel: meta.countLabel,
        severity: card?.severity || items[0]?.severity || 'informational',
        entries,
        totalCount: entries.reduce((sum, e) => sum + Number(e.count || 0), 0)
      };
    })
    .filter((section) => section.entries.length > 0);
});

function personInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

async function selectSchool(id) {
  selectedSchoolId.value = id;
  if (!agencyId.value) return;
  const fromList = schools.value.find((s) => s.schoolId === id) || null;
  try {
    const detail = await fetchSchoolDetail(agencyId.value, id);
    schoolDetail.value = {
      ...(fromList || {}),
      ...detail,
      logoPath: detail?.logoPath || fromList?.logoPath,
      logoUrl: detail?.logoUrl || fromList?.logoUrl,
      iconFilePath: detail?.iconFilePath || fromList?.iconFilePath,
      iconPath: detail?.iconPath || fromList?.iconPath
    };
  } catch (e) {
    schoolDetail.value = fromList;
  }
}

async function selectProvider(id) {
  selectedProviderId.value = id;
  if (!agencyId.value) return;
  try {
    providerDetail.value = await fetchProviderDetail(agencyId.value, id);
  } catch (e) {
    providerDetail.value = providers.value.find((p) => p.providerId === id) || null;
  }
}

async function applyDay(d) {
  applyMsg.value = '';
  applyingId.value = d.id;
  try {
    await applyForOpenSchoolDay(agencyId.value, {
      schoolId: d.schoolId,
      dayOfWeek: d.dayOfWeek,
      notes: d.applyHint || ''
    });
    applyMsg.value = 'Application submitted. An administrator will review it in Availability Intake.';
  } catch (e) {
    applyMsg.value = e?.response?.data?.error?.message || e?.message || 'Failed to apply';
  } finally {
    applyingId.value = null;
  }
}

async function runExpireStale() {
  if (!agencyId.value) return;
  try {
    const r = await expireStaleSchoolRequests(agencyId.value, 30);
    applyMsg.value = `Expired ${r.expired || 0} stale request(s).`;
    await reload();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Expire failed';
  }
}

const POLL_MS = 30000;
const pollSeconds = POLL_MS / 1000;
const eventsTimezoneLabel = schoolEventTimezoneLabel(SCHOOL_EVENT_FALLBACK_TIMEZONE);
let pollTimer = null;

async function silentRefresh() {
  if (!agencyId.value || loading.value) return;
  try {
    const [warn, open, evts] = await Promise.all([
      fetchCoverageWarnings(agencyId.value).catch(() => null),
      fetchOpenSchoolDays(agencyId.value).catch(() => null),
      fetchHubEvents(agencyId.value).catch(() => null)
    ]);
    if (warn) {
      warningCards.value = warn.cards || [];
      needs.value = warn.items || [];
    }
    if (open) {
      openDays.value = open.days || [];
      openDaysSummary.value = open.summary || { total: 0, highUrgency: 0, schoolsAffected: 0 };
    }
    if (evts) hubEvents.value = evts.events || [];
  } catch {
    /* ignore background refresh errors */
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    silentRefresh();
  }, POLL_MS);
}

function onVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    silentRefresh();
  }
}

async function reload() {
  if (!agencyId.value) return;
  loading.value = true;
  error.value = '';
  failedLogoIds.value = new Set();
  try {
    const [sum, prov, warn, open, sug, evts] = await Promise.all([
      fetchSchoolCoverageSummary(agencyId.value),
      fetchProviderCoverageSummary(agencyId.value).catch((e) => {
        console.error('Provider coverage failed', e);
        return { providers: [] };
      }),
      fetchCoverageWarnings(agencyId.value).catch(() => ({ cards: [], items: [] })),
      fetchOpenSchoolDays(agencyId.value).catch(() => ({ days: [], summary: { total: 0, highUrgency: 0, schoolsAffected: 0 } })),
      fetchCoverageSuggestions(agencyId.value).catch(() => ({ suggestions: [] })),
      fetchHubEvents(agencyId.value).catch(() => ({ events: [] }))
    ]);
    schools.value = sum.schools || [];
    providers.value = prov.providers || [];
    warningCards.value = warn.cards || [];
    needs.value = warn.items || [];
    openDays.value = open.days || [];
    openDaysSummary.value = open.summary || { total: 0, highUrgency: 0, schoolsAffected: 0 };
    suggestions.value = sug.suggestions || [];
    hubEvents.value = evts.events || [];
    loadCoverage().catch(() => {});

    if (selectedSchoolId.value) await selectSchool(selectedSchoolId.value);
    if (selectedProviderId.value) await selectProvider(selectedProviderId.value);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e?.message || 'Failed to load coverage';
  } finally {
    loading.value = false;
  }
}

function resolveAgency() {
  const q = route.query.agencyId ? Number(route.query.agencyId) : null;
  if (q) return q;
  if (agencyStore.currentAgency?.id) return Number(agencyStore.currentAgency.id);
  if (authStore.user?.agencyId) return Number(authStore.user.agencyId);
  if (agencies.value[0]?.id) return Number(agencies.value[0].id);
  return null;
}

onMounted(async () => {
  try {
    if (!agencyStore.agencies?.length && agencyStore.fetchAgencies) {
      await agencyStore.fetchAgencies();
    }
  } catch {
    /* ignore */
  }
  agencyId.value = resolveAgency();
  const t = String(route.query.tab || 'by-school');
  if (tabs.some((x) => x.id === t)) tab.value = t;
  needTypeFilter.value = String(route.query.type || '');
  if (route.query.schoolId) selectedSchoolId.value = Number(route.query.schoolId);
  if (route.query.providerId) selectedProviderId.value = Number(route.query.providerId);
  await reload();
  startPolling();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
});

onUnmounted(() => {
  stopPolling();
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
});

watch(
  () => route.query.tab,
  (t) => {
    if (t && tabs.some((x) => x.id === t)) tab.value = String(t);
  }
);
</script>

<style scoped>
.hub-page {
  padding: 1rem 1.25rem 2rem;
  width: 100%;
  max-width: none;
  margin: 0;
  box-sizing: border-box;
  min-height: calc(100vh - 80px);
}
.hub-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}
.hub-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.6rem;
}
.subtitle {
  margin: 0;
  color: #64748b;
  max-width: 48rem;
}
.header-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}
.agency-select,
.search,
.list-toolbar select {
  padding: 0.4rem 0.6rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
}
.btn {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.85rem;
  border-radius: 6px;
  border: 1px solid transparent;
  text-decoration: none;
  cursor: pointer;
  font-size: 0.875rem;
}
.btn-primary {
  background: #5b21b6;
  color: #fff;
}
.btn-secondary {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}
.btn-sm {
  padding: 0.3rem 0.6rem;
  font-size: 0.8rem;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error-banner {
  background: #fef2f2;
  color: #991b1b;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}
.warning-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}
.warning-card {
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 0.75rem;
  cursor: pointer;
}
.warning-card.critical {
  border-color: #fecaca;
  background: #fff1f2;
}
.warning-card.moderate {
  border-color: #fde68a;
  background: #fffbeb;
}
.warning-card.informational {
  border-color: #c7d2fe;
  background: #eef2ff;
}
.wc-count {
  display: block;
  font-size: 1.4rem;
  font-weight: 700;
}
.wc-title {
  font-size: 0.78rem;
  color: #475569;
}
.hub-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.hub-tab {
  border: 0;
  background: transparent;
  padding: 0.65rem 0.9rem;
  cursor: pointer;
  color: #64748b;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.hub-tab.active {
  color: #5b21b6;
  border-bottom-color: #5b21b6;
  font-weight: 600;
}
.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 26%);
  gap: 1rem;
  align-items: stretch;
  min-height: 60vh;
}
.split:not(.has-selection) {
  grid-template-columns: minmax(0, 1fr) minmax(240px, 22%);
}
@media (max-width: 1100px) {
  .split,
  .split:not(.has-selection) {
    grid-template-columns: 1fr;
  }
}
.list-panel,
.detail-panel,
.full-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  min-width: 0;
}
.list-panel {
  overflow: auto;
}
.detail-panel {
  position: sticky;
  top: 0.75rem;
  align-self: start;
  max-height: calc(100vh - 120px);
  overflow: auto;
}
.muted-panel {
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  text-align: center;
}
.school-cell {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}
.school-text {
  min-width: 0;
}
.school-logo {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.school-logo-lg {
  width: 56px;
  height: 56px;
  border-radius: 10px;
}
.school-logo-sm {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
.school-logo-sm .school-logo-fallback {
  font-size: 0.6rem;
}
.provider-schools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  max-width: 52rem;
}
.provider-school-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.4rem 0.15rem 0.15rem;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #f8fafc;
  max-width: 18rem;
  font: inherit;
  color: inherit;
  cursor: default;
  text-align: left;
}
.provider-school-chip.editable {
  cursor: pointer;
}
.provider-school-chip.editable:hover {
  border-color: #c4b5fd;
  background: #f5f3ff;
}
.provider-school-chip.tight {
  border-color: #fdba74;
  background: #fff7ed;
}
.provider-school-chip.over {
  border-color: #fca5a5;
  background: #fef2f2;
}
.provider-school-name {
  font-size: 0.78rem;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 8.5rem;
}
.provider-school-slots {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #475569;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e2e8f0;
}
.provider-school-chip.tight .provider-school-slots {
  color: #c2410c;
  border-color: #fdba74;
}
.provider-school-chip.over .provider-school-slots {
  color: #b91c1c;
  border-color: #fca5a5;
}
.slot-ratio {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.slot-ratio.tight {
  color: #c2410c;
}
.tiny {
  font-size: 0.72rem;
  margin-top: 0.1rem;
}
.caseload-hint {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
}
.caseload-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 1rem;
}
.caseload-modal {
  width: min(36rem, 100%);
  max-height: min(90vh, 40rem);
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.18);
  padding: 1rem 1.1rem 1.1rem;
}
.caseload-modal-header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}
.caseload-modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
}
.caseload-modal-header .muted {
  margin: 0.2rem 0 0;
}
.caseload-modal-summary {
  margin: 0.75rem 0 0.35rem;
  font-size: 0.9rem;
}
.caseload-edit-table {
  margin-top: 0.75rem;
}
.slot-input {
  width: 5rem;
  padding: 0.3rem 0.4rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-variant-numeric: tabular-nums;
}
.warn {
  color: #b91c1c;
  font-weight: 600;
}
.caseload-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}
.school-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
}
.school-logo-fallback {
  font-size: 0.75rem;
  font-weight: 700;
  color: #5b21b6;
  letter-spacing: 0.02em;
}
.school-logo-lg .school-logo-fallback {
  font-size: 0.95rem;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}
.detail-header h2 {
  margin: 0;
  font-size: 1.25rem;
}
.detail-header .muted {
  margin: 0.15rem 0 0;
}
.list-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.search {
  flex: 1;
  min-width: 160px;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.data-table th,
.data-table td {
  text-align: left;
  padding: 0.55rem 0.4rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}
.data-table tbody tr {
  cursor: pointer;
}
.data-table tbody tr.selected,
.data-table tbody tr:hover {
  background: #f8fafc;
}
.data-table.compact td,
.data-table.compact th {
  padding: 0.35rem 0.3rem;
}
.primary {
  font-weight: 600;
}
.muted {
  color: #64748b;
  font-size: 0.8rem;
}
.cap-bar {
  height: 6px;
  background: #e2e8f0;
  border-radius: 99px;
  overflow: hidden;
  margin-bottom: 0.2rem;
  width: 100%;
  min-width: 88px;
  max-width: 160px;
}
.cap-fill {
  height: 100%;
  background: #7c3aed;
}
.day-chip {
  display: inline-block;
  font-size: 0.65rem;
  padding: 0.1rem 0.28rem;
  margin: 0 0.1rem 0.1rem 0;
  border-radius: 4px;
  background: #f1f5f9;
  color: #94a3b8;
}
.day-chip.on {
  background: #ede9fe;
  color: #5b21b6;
}
.day-chip.danger {
  background: #fee2e2;
  color: #b91c1c;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  margin: 0.75rem 0 1rem;
}
.stat-row div {
  background: #f8fafc;
  border-radius: 8px;
  padding: 0.5rem;
  text-align: center;
}
.stat-row strong {
  display: block;
  font-size: 1.1rem;
}
.stat-row span {
  font-size: 0.7rem;
  color: #64748b;
}
.day-list,
.simple-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
}
.day-list li,
.simple-list li {
  padding: 0.4rem 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.875rem;
}
.event-link {
  color: #5b21b6;
  font-weight: 600;
  text-decoration: none;
}
.event-link:hover {
  text-decoration: underline;
}
.day-list li.danger {
  background: #fff1f2;
  padding-left: 0.4rem;
  border-radius: 4px;
}
.day-list em {
  color: #b91c1c;
  font-style: normal;
  margin-left: 0.35rem;
  font-size: 0.75rem;
}
.detail-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.inline-warn {
  background: #fff1f2;
  color: #991b1b;
  padding: 0.5rem 0.65rem;
  border-radius: 6px;
  font-size: 0.85rem;
}
.sev {
  text-transform: capitalize;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
}
.sev.critical {
  background: #fee2e2;
  color: #991b1b;
}
.sev.moderate {
  background: #fef3c7;
  color: #92400e;
}
.sev.informational {
  background: #e0e7ff;
  color: #3730a3;
}
.link {
  color: #5b21b6;
  font-size: 0.85rem;
}
.empty,
.loading {
  padding: 1.5rem;
  color: #64748b;
  text-align: center;
}
.open-banner {
  background: linear-gradient(135deg, #ede9fe, #f5f3ff);
  border: 1px solid #ddd6fe;
  border-radius: 12px;
  padding: 1rem 1.15rem;
  margin-bottom: 1rem;
}
.open-banner h2 {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
}
.open-banner p {
  margin: 0;
}
.apply-msg {
  margin-top: 0.75rem;
  color: #166534;
  font-size: 0.9rem;
}
.suggestions {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}
.suggestions ul {
  padding-left: 1.1rem;
}
/* ── Events tab ─────────────────────────────────────────── */
.events-tab { display: flex; flex-direction: column; gap: 0.75rem; }
.events-tz-note {
  margin: 0;
  font-size: 0.78rem;
  color: #475569;
}
.events-tz-note strong { color: #0f172a; font-weight: 700; }
.time-tz { font-weight: 650; color: #334155; }
.events-toolbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.65rem 0.85rem;
}
.events-nav { display: flex; gap: 0.35rem; align-items: center; }
.events-range { font-weight: 650; font-size: 0.95rem; margin-left: 0.35rem; color: #0f172a; }
.events-filters { display: flex; gap: 0.4rem; }
.events-filters select {
  padding: 0.35rem 0.55rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.8rem;
  background: #fff;
}
.events-view-toggle {
  display: inline-flex;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
  margin-left: auto;
}
.events-view-toggle button {
  border: 0;
  background: #fff;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
}
.events-view-toggle button.active {
  background: #5b21b6;
  color: #fff;
}
.events-scope-toggle {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.35rem 0 0.65rem;
}
.events-scope-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  font-size: 0.82rem;
  cursor: pointer;
  color: #475569;
}
.events-scope-chip.active {
  border-color: #5b21b6;
  background: #f5f3ff;
  color: #5b21b6;
  font-weight: 650;
}
.error-inline {
  color: #b91c1c;
  font-size: 0.85rem;
  margin: 0.4rem 0 0;
}
.events-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  align-items: start;
}
.events-body.has-panel {
  grid-template-columns: minmax(0, 1fr) minmax(300px, 24rem);
}
.evt-side-panel { height: fit-content; }
.evt-coverage-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.75rem;
  max-height: min(80vh, 920px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.evt-staffing-in-coverage {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.75rem;
  margin-bottom: 0.25rem;
}
.cov-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.cov-head h3 {
  margin: 0;
  font-size: 0.95rem;
  color: #0f172a;
}
.cov-head select,
.cov-filters select {
  padding: 0.3rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.78rem;
  background: #fff;
}
.cov-range { margin: 0; font-size: 0.75rem; }
.cov-rollups {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.35rem;
}
.cov-rollup {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  font-size: 0.8rem;
}
.cov-label { color: #475569; }
.cov-filters {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.cov-toggle { margin-left: 0; width: 100%; }
.cov-toggle button { flex: 1; }
.cov-school-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.cov-school {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.55rem 0.65rem;
  background: #fff;
}
.cov-school-name { font-size: 0.88rem; margin-bottom: 0.35rem; }
.cov-event-row {
  padding: 0.35rem 0;
  border-top: 1px dashed #e2e8f0;
}
.cov-event-row:first-of-type { border-top: 0; }
.cov-event-row.missing { opacity: 0.85; }
.cov-cat {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #64748b;
}
.cov-event-link {
  display: block;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.15rem 0;
  cursor: pointer;
  font-size: 0.82rem;
  color: #1d4ed8;
  font-weight: 600;
}
.cov-event-link:hover { text-decoration: underline; }
.cov-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cov-people {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-top: 0.2rem;
  color: #334155;
}
.pad { padding: 0.35rem 0; }
.evt-cal-wrap { min-width: 0; }
.evt-month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: #e2e8f0;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.evt-dow {
  background: #f8fafc;
  padding: 0.4rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #64748b;
  text-align: center;
}
.evt-cell {
  background: #fff;
  min-height: 90px;
  padding: 0.3rem;
}
.evt-cell-clickable:not(.outside) {
  cursor: pointer;
}
.evt-cell-clickable:not(.outside):hover {
  background: #f0fdfa;
}
.evt-cell.outside { background: #f8fafc; color: #94a3b8; cursor: default; }
.evt-cell.today { outline: 2px solid #7c3aed; outline-offset: -2px; }
.evt-day-num { font-size: 0.72rem; font-weight: 700; margin-bottom: 0.2rem; }
.evt-chip {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  border-radius: 4px;
  padding: 0.18rem 0.3rem;
  margin-bottom: 0.18rem;
  font-size: 0.66rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #fff;
  font: inherit;
}
.evt-chip.active { outline: 2px solid #0f172a; outline-offset: 1px; }
.evt-chip-school { display: block; font-size: 0.58rem; opacity: 0.88; font-weight: 500; margin-bottom: 0.05rem; }
.evt-chip.bts, .evtdot.bts { background: #2563eb; }
.evt-chip.fall, .evtdot.fall { background: #c2410c; }
.evt-chip.fair, .evtdot.fair { background: #16a34a; }
.evt-chip.open, .evtdot.open { background: #ea580c; }
.evt-chip.family, .evtdot.family { background: #0f766e; }
.evt-chip.spring, .evtdot.spring { background: #7c3aed; }
.evt-chip.holiday, .evtdot.holiday { background: #b45309; }
.evt-chip.needs, .evtdot.needs { background: #dc2626; }
.evt-legend {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.65rem;
  font-size: 0.75rem;
  color: #475569;
}
.evtdot {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  margin-right: 0.3rem;
}
/* Agenda */
.evt-agenda {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}
.agenda-row {
  display: grid;
  grid-template-columns: 0.5rem 7rem 1fr auto;
  gap: 0.75rem;
  align-items: start;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
}
.agenda-row:hover, .agenda-row.active { background: #f8fafc; }
.agenda-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  margin-top: 0.45rem;
  flex-shrink: 0;
}
.agenda-date { flex-shrink: 0; }
.agenda-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  align-items: flex-end;
  text-align: right;
  flex-shrink: 0;
}
.evttype {
  display: inline-flex;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
}
/* ─────────────────────────────────────────────────────── */
.coverage-needs-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.coverage-quick-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: stretch;
}
.coverage-quick-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  min-width: 7.5rem;
  max-width: 14rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  text-align: left;
}
.coverage-quick-btn:hover {
  border-color: #c4b5fd;
  background: #faf5ff;
}
.coverage-quick-btn.active {
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
  background: #f5f3ff;
}
.coverage-quick-btn.critical {
  border-color: #fecaca;
  background: #fff1f2;
}
.coverage-quick-btn.moderate {
  border-color: #fde68a;
  background: #fffbeb;
}
.coverage-quick-btn.informational {
  border-color: #c7d2fe;
  background: #eef2ff;
}
.coverage-quick-btn.critical.active,
.coverage-quick-btn.moderate.active,
.coverage-quick-btn.informational.active {
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.08);
}
.coverage-quick-count {
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
}
.coverage-quick-label {
  font-size: 0.72rem;
  color: #475569;
  line-height: 1.25;
}
.coverage-expire-btn {
  margin-left: auto;
  align-self: center;
}
.coverage-split {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.95fr);
  gap: 1rem;
  align-items: start;
  min-height: 60vh;
}
@media (max-width: 1100px) {
  .coverage-split {
    grid-template-columns: 1fr;
  }
}
.coverage-list-panel,
.coverage-browse-panel {
  max-height: calc(100vh - 140px);
  overflow: auto;
}
.coverage-browse-header {
  margin-bottom: 0.85rem;
}
.coverage-browse-header h2 {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
}
.coverage-browse-header .muted {
  margin: 0 0 0.65rem;
}
.coverage-category {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 0.75rem;
  overflow: hidden;
  background: #fff;
}
.coverage-category.critical {
  border-color: #fecaca;
}
.coverage-category.moderate {
  border-color: #fde68a;
}
.coverage-category.informational {
  border-color: #c7d2fe;
}
.coverage-category.collapsed {
  opacity: 0.45;
}
.coverage-category-head {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.65rem;
  text-align: left;
  border: 0;
  background: #f8fafc;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
}
.coverage-category-title {
  font-weight: 700;
  color: #0f172a;
  flex: 1 1 auto;
}
.coverage-category-meta {
  font-size: 0.78rem;
  color: #64748b;
}
.coverage-category-list {
  list-style: none;
  margin: 0;
  padding: 0.35rem 0.65rem 0.65rem;
}
.coverage-category-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.45rem 0.15rem;
  border-bottom: 1px solid #f1f5f9;
}
.coverage-category-list li:last-child {
  border-bottom: 0;
}
.coverage-entry-count {
  text-align: right;
  flex-shrink: 0;
}
.coverage-entry-count strong {
  display: block;
  font-size: 1.05rem;
  color: #0f172a;
}
.coverage-entry-count span {
  font-size: 0.7rem;
  color: #64748b;
}
.person-fallback {
  background: #ede9fe;
}
</style>
