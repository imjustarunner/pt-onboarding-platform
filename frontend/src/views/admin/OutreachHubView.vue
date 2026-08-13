<template>
  <div class="ohub">
    <header class="ohub-header">
      <div>
        <h1>Outreach Hub</h1>
        <p class="ohub-sub">Track school contacts, visits, and partnership status across Denver, Aurora, Pueblo, and Fort Collins.</p>
      </div>
      <div class="ohub-header-actions">
        <button
          type="button"
          class="ohub-tab"
          :class="{ active: viewMode === 'tracker' }"
          @click="viewMode = 'tracker'"
        >Tracker</button>
        <button
          type="button"
          class="ohub-tab"
          :class="{ active: viewMode === 'trips' }"
          @click="openTrips"
        >Trips</button>
        <button
          type="button"
          class="ohub-tab"
          :class="{ active: viewMode === 'timeline' }"
          @click="openTimeline"
        >Activity</button>
        <button type="button" class="btn btn-secondary" :disabled="loading" @click="reload">
          {{ loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="ohub-error">{{ error }}</p>

    <div class="ohub-kpis">
      <div class="ohub-kpi">
        <span>Total schools</span>
        <strong>{{ summary.total_schools || 0 }}</strong>
        <em>{{ districtCount }} districts</em>
      </div>
      <div class="ohub-kpi">
        <span>Partnered</span>
        <strong>{{ summary.partnered || 0 }}</strong>
        <em>Already in our schools</em>
      </div>
      <div class="ohub-kpi">
        <span>Active outreach</span>
        <strong>{{ summary.active_outreach || 0 }}</strong>
        <em>Contacted or in progress</em>
      </div>
      <div class="ohub-kpi warn">
        <span>Follow-ups due</span>
        <strong>{{ summary.follow_ups_due || 0 }}</strong>
        <em>Next 7 days</em>
      </div>
      <div class="ohub-kpi visit">
        <span>Visits logged</span>
        <strong>{{ summary.by_contact_type?.visit || 0 }}</strong>
        <em>Email {{ summary.by_contact_type?.email || 0 }} · Phone {{ summary.by_contact_type?.phone || 0 }} · Letter {{ summary.by_contact_type?.letter || 0 }}</em>
      </div>
    </div>

    <template v-if="viewMode === 'tracker' || viewMode === 'trips'">
      <div v-if="viewMode === 'tracker'" class="ohub-filters">
        <input v-model="filters.q" class="ohub-search" type="search" placeholder="Search schools…" @input="debouncedReload" />
        <select v-model="filters.district" @change="reload">
          <option value="">All districts</option>
          <option v-for="d in districts" :key="d" :value="d">{{ d }}</option>
        </select>
        <select v-model="filters.level" @change="reload">
          <option value="">All levels</option>
          <option value="elementary">Elementary</option>
          <option value="middle">Middle</option>
          <option value="high">High</option>
          <option value="k8">K-8 / P-8</option>
          <option value="k12">K-12</option>
        </select>
        <select v-model="filters.stage" @change="reload">
          <option value="">All stages</option>
          <option v-for="st in stageOptions" :key="st.id" :value="st.id">{{ st.label }}</option>
        </select>
        <button v-if="hasFilters" type="button" class="btn-link" @click="clearFilters">Clear filters</button>
        <button type="button" class="btn-link" @click="showImport = !showImport">
          {{ showImport ? 'Hide import' : 'Import DPS history' }}
        </button>
      </div>
      <div v-if="viewMode === 'tracker' && showImport" class="ohub-import">
        <p class="ohub-muted">
          Upload the dated spreadsheet (CSV). App contacts already on a school are left alone.
          Only unmatched empty fields are filled, and only when the school name maps uniquely.
        </p>
        <input type="file" accept=".csv,text/csv" @change="onImportFile" />
        <div v-if="importPreview" class="ohub-muted">
          Preview: {{ importPreview.matched }} matched · {{ importPreview.skipped }} skipped
        </div>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!importRows.length || importSaving"
          @click="runImportPreview"
        >Preview matches</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!importPreview || importSaving"
          @click="runImport"
        >{{ importSaving ? 'Importing…' : 'Import matched empty fields only' }}</button>
        <p v-if="importResult" class="ohub-muted">
          Added {{ importResult.contactsAdded }} contacts, {{ importResult.notesAdded }} notes,
          {{ importResult.visitsAdded }} visits.
        </p>
      </div>

      <template v-if="viewMode === 'trips' && !openedTrip">
        <section class="ohub-trips-overview">
          <h2 class="ohub-trips-overview-title">Your trips</h2>
          <div
            v-for="section in tripListSections"
            :key="section.id"
            class="ohub-trips-section"
          >
            <h3 class="ohub-trips-section-title">{{ section.title }}</h3>
            <ul class="ohub-saved-trips">
              <li v-for="t in section.items" :key="t.id" class="ohub-saved-trip">
                <div>
                  <strong>{{ t.title }}</strong>
                  <span class="ohub-stage" :class="t.status">{{ tripStatusLabel(t.status) }}</span>
                  <div class="ohub-muted">
                    {{ t.planned_date ? formatDate(t.planned_date) : formatDate(t.created_at) }}
                    <template v-if="savedTripRoundTripMiles(t) != null"> · {{ savedTripRoundTripMiles(t) }} mi round trip</template>
                    · {{ (t.stops || []).map((s) => s.school_name).join(' → ') || 'No stops' }}
                  </div>
                  <div v-if="(t.participants || []).length" class="ohub-muted">
                    {{ t.participants.map((p) => p.display_name).join(', ') }}
                  </div>
                </div>
                <div class="ohub-saved-trip-actions">
                  <button type="button" class="btn btn-primary" @click="openSavedTrip(t)">Open trip</button>
                </div>
              </li>
              <li v-if="!section.items.length" class="ohub-muted ohub-trips-empty">{{ section.emptyLabel }}</li>
            </ul>
          </div>
        </section>
      </template>

      <div :class="viewMode === 'tracker' ? 'ohub-body' : 'ohub-trip-layout'">
        <div v-if="viewMode === 'tracker'" class="ohub-table-wrap">
          <table class="ohub-table">
            <thead>
              <tr>
                <th class="sortable" @click="setSort('school')">School <span v-if="sortKey === 'school'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span></th>
                <th class="sortable" @click="setSort('level')">Level <span v-if="sortKey === 'level'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span></th>
                <th class="sortable" @click="setSort('district')">District <span v-if="sortKey === 'district'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span></th>
                <th class="sortable" @click="setSort('stage')">Stage <span v-if="sortKey === 'stage'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span></th>
                <th class="sortable" @click="setSort('last_contact')">Last contact <span v-if="sortKey === 'last_contact'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span></th>
                <th class="sortable" @click="setSort('visits')">Visits <span v-if="sortKey === 'visits'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in schools"
                :key="row.id"
                :class="{ selected: selectedId === row.id }"
                @click="selectSchool(row.id)"
              >
                <td>
                  <strong>{{ row.name }}</strong>
                  <div class="ohub-muted">{{ row.address || row.city || '—' }}</div>
                </td>
                <td>{{ levelLabel(row.school_level) }}</td>
                <td>{{ shortDistrict(row.district_name) }}</td>
                <td><span class="ohub-stage" :class="row.outreach_stage">{{ stageLabel(row.outreach_stage) }}</span></td>
                <td>{{ formatDate(row.last_contact_at) }}</td>
                <td>{{ row.visit_count || 0 }}</td>
              </tr>
              <tr v-if="!loading && !schools.length">
                <td colspan="6" class="ohub-empty">No schools match these filters.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <section v-else class="ohub-trip-plan">
          <template v-if="openedTrip">
            <div class="ohub-trip-plan-head">
              <button type="button" class="btn-link" @click="closeOpenedTrip">← All trips</button>
              <h2>{{ openedTrip.title }}</h2>
              <span class="ohub-stage" :class="openedTrip.status">{{ openedTrip.status }}</span>
            </div>
            <p class="ohub-muted">
              {{ openedTrip.planned_date ? formatDate(openedTrip.planned_date) : formatDate(openedTrip.created_at) }}
              · Click a school to open notes and contacts
            </p>
            <div v-if="openedTrip.round_trip_miles != null" class="ohub-trip-stats">
              <span><strong>{{ openedTrip.round_trip_miles }}</strong> mi round trip</span>
              <span>Outbound <strong>{{ openedTrip.outbound_miles ?? '—' }}</strong> mi</span>
              <span>Return home <strong>{{ openedTrip.return_miles ?? '—' }}</strong> mi</span>
              <span>{{ (openedTrip.stops || []).length }} stop{{ (openedTrip.stops || []).length === 1 ? '' : 's' }}</span>
            </div>
            <ol class="ohub-route">
              <li class="ohub-route-origin">
                <strong>Start · Windchime (office)</strong>
                <div class="ohub-muted">437 Windchime Place, Colorado Springs, CO 80919 · 0 mi</div>
              </li>
              <li
                v-for="(stop, idx) in openedTrip.stops || []"
                :key="stop.id"
                class="ohub-route-stop"
                :class="{ selected: Number(selectedId) === Number(stop.outreach_school_id) }"
              >
                <button type="button" class="ohub-route-stop-btn" @click="selectSchool(stop.outreach_school_id)">
                  <div class="ohub-route-stop-head">
                    <strong>{{ idx + 1 }}. {{ stop.school_name }}</strong>
                    <span class="ohub-stage sm" :class="stop.outreach_stage">{{ stageLabel(stop.outreach_stage) }}</span>
                  </div>
                  <div class="ohub-muted ohub-route-stop-meta">
                    {{ shortDistrict(stop.district_name) }} · {{ levelLabel(stop.school_level) }}
                    <template v-if="stop.miles_from_prev != null"> · {{ roundMiles(stop.miles_from_prev) }} mi from {{ idx === 0 ? 'office' : 'previous' }}</template>
                  </div>
                  <div class="ohub-muted ohub-route-stop-addr">{{ stop.address || stop.city }}</div>
                </button>
                <div class="ohub-attend">
                  <span class="ohub-attend-label">This stop</span>
                  <button
                    v-for="opt in attendanceOptions"
                    :key="`${stop.id}-${opt.id}`"
                    type="button"
                    class="ohub-attend-btn"
                    :class="{ on: stop.attendance_status === opt.id }"
                    :disabled="tripSaving || openedTrip.status === 'completed'"
                    @click="setStopAttendance(stop, opt.id)"
                  >{{ opt.label }}</button>
                </div>
                <p v-if="stop.attendance_status && stop.attendance_status !== 'pending'" class="ohub-muted ohub-attend-status">
                  {{ attendanceLabel(stop.attendance_status) }}
                </p>
              </li>
              <li class="ohub-route-origin">
                <strong>Return · Windchime (office)</strong>
                <div class="ohub-muted">
                  437 Windchime Place, Colorado Springs, CO 80919
                  <template v-if="openedTrip.return_miles != null"> · {{ openedTrip.return_miles }} mi from last stop</template>
                </div>
              </li>
            </ol>
          </template>
          <template v-else>
          <h2>Plan a trip</h2>
          <p class="ohub-muted">Starts at Windchime (437 Windchime Place, Colorado Springs). Click a school to add it; remaining schools sort by distance from that stop.</p>
          <div v-if="tripStops.length" class="ohub-trip-stats">
            <span><strong>{{ tripRoundTripTotal ?? '—' }}</strong> mi round trip</span>
            <span>Outbound <strong>{{ tripRouteTotalMiles ?? '—' }}</strong> mi</span>
            <span>Return home <strong>{{ tripHomeMiles ?? '—' }}</strong> mi</span>
            <span>{{ tripStops.length }} stop{{ tripStops.length === 1 ? '' : 's' }}</span>
          </div>
          <ol class="ohub-route">
            <li class="ohub-route-origin">
              <strong>Start · Windchime (office)</strong>
              <div class="ohub-muted">437 Windchime Place, Colorado Springs, CO 80919 · 0 mi</div>
            </li>
            <li v-for="(stop, idx) in tripStops" :key="stop.id" class="ohub-route-stop" :class="{ selected: Number(selectedId) === Number(stop.id) }">
              <div class="ohub-route-stop-head">
                <button type="button" class="ohub-route-stop-name" @click="selectSchool(stop.id)">
                  <strong>{{ idx + 1 }}. {{ stop.name }}</strong>
                </button>
                <span class="ohub-stage sm" :class="stop.outreach_stage">{{ stageLabel(stop.outreach_stage) }}</span>
              </div>
              <div class="ohub-muted ohub-route-stop-meta">
                {{ shortDistrict(stop.district_name) }} · {{ levelLabel(stop.school_level) }}
                <template v-if="stopLegMiles(stop) != null"> · {{ stopLegMiles(stop) }} mi from {{ idx === 0 ? 'office' : 'previous' }}</template>
                <template v-if="stop.distance_approx"> (approx.)</template>
              </div>
              <div class="ohub-muted ohub-route-stop-addr">{{ stop.address || stop.city }}</div>
              <button type="button" class="btn-link" @click="removeTripStop(idx)">Remove</button>
            </li>
            <li v-if="tripStops.length" class="ohub-route-origin">
              <strong>Return · Windchime (office)</strong>
              <div class="ohub-muted">
                437 Windchime Place, Colorado Springs, CO 80919
                <template v-if="tripHomeMiles != null"> · {{ tripHomeMiles }} mi from last stop</template>
              </div>
            </li>
          </ol>
          <div class="ohub-trip-filters">
            <input v-model="tripSearch" class="ohub-search ohub-trip-search" type="search" placeholder="Search name, city, address…" />
            <select v-model="tripStageFilter" class="ohub-trip-select">
              <option value="">All statuses</option>
              <option v-for="st in stageOptions" :key="`tf-${st.id}`" :value="st.id">{{ st.label }}</option>
            </select>
            <select v-model="tripDistrictFilter" class="ohub-trip-select">
              <option value="">All districts</option>
              <option v-for="d in tripDistrictOptions" :key="`td-${d}`" :value="d">{{ shortDistrict(d) }}</option>
            </select>
            <select v-model="tripSort" class="ohub-trip-select">
              <option value="closest">Closest first</option>
              <option value="miles">Distance</option>
              <option value="school">School name</option>
              <option value="district">District</option>
              <option value="stage">Status</option>
              <option value="level">Level</option>
            </select>
            <button
              v-if="tripStageFilter || tripDistrictFilter || tripSearch"
              type="button"
              class="btn-link ohub-trip-clear"
              @click="clearTripFilters"
            >Clear filters</button>
          </div>
          <p class="ohub-muted">
            {{ tripStops.length ? `Closest from ${lastTripStopName}` : 'Closest from Windchime (office)' }}
            <template v-if="filteredNearbySchools.length !== tripNearby.length">
              · showing {{ filteredNearbySchools.length }} of {{ tripNearby.length }}
            </template>
          </p>
          <p v-if="tripPreviewLoading" class="ohub-muted">Loading distances and school addresses…</p>
          <p v-else-if="tripGeocodeRemaining > 0" class="ohub-muted">
            Street addresses are still loading for {{ tripGeocodeRemaining }} schools — distances use city centers until then.
          </p>
          <ul class="ohub-nearby">
            <li v-for="row in filteredNearbySchools" :key="row.id">
              <button type="button" class="ohub-nearby-btn" @click="addTripStop(row)">
                <span class="ohub-nearby-miles">
                  {{ row.miles_from_origin != null ? row.miles_from_origin : '—' }}
                  <em>mi</em>
                </span>
                <span class="ohub-nearby-main">
                  <span class="ohub-nearby-title-row">
                    <strong>{{ row.name }}</strong>
                    <span class="ohub-stage sm" :class="row.outreach_stage">{{ stageLabel(row.outreach_stage) }}</span>
                  </span>
                  <span class="ohub-nearby-meta">
                    {{ shortDistrict(row.district_name) }} · {{ levelLabel(row.school_level) }}
                    <template v-if="row.distance_approx"> · approx.</template>
                  </span>
                  <em class="ohub-nearby-addr">{{ row.address || row.city }}</em>
                </span>
              </button>
            </li>
            <li v-if="!filteredNearbySchools.length && !tripPreviewLoading" class="ohub-muted">
              No schools match these filters.
            </li>
          </ul>
          </template>
        </section>

        <aside v-if="selected" class="ohub-detail">
          <div class="ohub-detail-head">
            <div>
              <h2>{{ selected.name }}</h2>
              <span class="ohub-stage" :class="selected.outreach_stage">{{ stageLabel(selected.outreach_stage) }}</span>
            </div>
            <button type="button" class="btn-link" @click="closeSchoolPanel">Close</button>
          </div>
          <div class="ohub-panel-tabs" role="tablist">
            <button type="button" :class="{ active: panelTab === 'overview' }" @click="panelTab = 'overview'">Overview</button>
            <button type="button" :class="{ active: panelTab === 'tasks' }" @click="panelTab = 'tasks'">Tasks</button>
            <button type="button" :class="{ active: panelTab === 'contacts' }" @click="panelTab = 'contacts'">Contacts</button>
            <button type="button" :class="{ active: panelTab === 'history' }" @click="panelTab = 'history'">History</button>
            <button type="button" :class="{ active: panelTab === 'onboarding' }" @click="panelTab = 'onboarding'">Onboarding</button>
          </div>

          <template v-if="panelTab === 'overview'">
          <dl class="ohub-meta">
            <div><dt>Address</dt><dd>{{ selected.address || '—' }}</dd></div>
            <div><dt>District</dt><dd>{{ selected.district_name }}</dd></div>
            <div><dt>Level</dt><dd>{{ levelLabel(selected.school_level) }}</dd></div>
            <div><dt>City</dt><dd>{{ selected.city || '—' }}</dd></div>
            <div><dt>Partner school</dt><dd>{{ selected.linked_organization_id ? 'Yes — already in our caseload' : 'Not yet' }}</dd></div>
            <div><dt>Primary contact</dt><dd>{{ selected.primary_contact_name || '—' }}<template v-if="selected.primary_contact_email"><br>{{ selected.primary_contact_email }}</template></dd></div>
          </dl>
          <button v-if="viewMode !== 'trips'" type="button" class="btn btn-secondary" @click="startTripFromSchool(selected)">Plan trip from this school</button>

          <label class="ohub-field">
            <span>Stage</span>
            <select :value="selected.outreach_stage" @change="saveStage($event.target.value)">
              <option v-for="st in stageOptions" :key="st.id" :value="st.id">{{ st.label }}</option>
            </select>
          </label>
          <label class="ohub-field">
            <span>Next follow-up</span>
            <input type="date" :value="dateInput(selected.next_follow_up_at)" @change="saveFollowUp($event.target.value)" />
          </label>

          <h3>Open tasks</h3>
          <ul class="ohub-task-list">
            <li v-for="t in schoolTasks.slice(0, 4)" :key="`ov-${t.id}`">
              <div>
                <strong :class="{ done: t.status === 'completed' }">{{ t.title }}</strong>
                <div class="ohub-muted">
                  <template v-if="t.due_date">due {{ formatDate(t.due_date) }}</template>
                </div>
              </div>
            </li>
            <li v-if="!schoolTasks.length" class="ohub-muted">No tasks yet. Add them on the Tasks tab.</li>
          </ul>
          <button type="button" class="btn-link" @click="panelTab = 'tasks'">Open full Tasks tab</button>

          <h3>Notes</h3>
          <form class="ohub-log" @submit.prevent="submitNote">
            <label class="ohub-field">
              <span>Add a note</span>
              <textarea v-model="noteForm.body" rows="2" required placeholder="What happened, who you spoke with…" />
            </label>
            <button type="submit" class="btn btn-secondary" :disabled="noteSaving">{{ noteSaving ? 'Saving…' : 'Save note' }}</button>
          </form>
          <ol class="ohub-timeline">
            <li v-for="n in selected.notes || []" :key="`note-${n.id}`">
              <div>
                <strong>{{ n.body }}</strong>
                <div class="ohub-muted">{{ formatDateTime(n.created_at) }}{{ n.created_by_name ? ` · ${n.created_by_name}` : '' }}</div>
              </div>
            </li>
            <li v-if="!(selected.notes || []).length" class="ohub-muted">No notes yet.</li>
          </ol>

          <h3>Log contact</h3>
          <form class="ohub-log" @submit.prevent="submitLog">
            <div class="ohub-types">
              <label v-for="t in contactTypes" :key="t.id" :class="{ on: logForm.contact_type === t.id, visit: t.id === 'visit' }">
                <input v-model="logForm.contact_type" type="radio" :value="t.id" />
                {{ t.label }}
              </label>
            </div>
            <label class="ohub-field">
              <span>When</span>
              <input v-model="logForm.activity_at" type="datetime-local" required />
            </label>
            <label class="ohub-field">
              <span>Summary</span>
              <input v-model="logForm.summary" type="text" :placeholder="logForm.contact_type === 'visit' ? 'Campus visit, who you met…' : 'What happened'" />
            </label>
            <label class="ohub-field">
              <span>Notes</span>
              <textarea v-model="logForm.notes" rows="3" placeholder="Optional details" />
            </label>
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Log activity' }}</button>
          </form>

          <h3>Activity</h3>
          <ol class="ohub-timeline">
            <li v-for="act in selected.activities || []" :key="act.id">
              <span class="ohub-type-pill" :class="act.contact_type">{{ act.contact_type }}</span>
              <div>
                <strong>{{ act.summary || stageLabel(act.contact_type) }}</strong>
                <div class="ohub-muted">{{ formatDateTime(act.activity_at) }}{{ act.created_by_name ? ` · ${act.created_by_name}` : '' }}</div>
                <p v-if="act.notes">{{ act.notes }}</p>
              </div>
            </li>
            <li v-if="!(selected.activities || []).length" class="ohub-muted">No contacts logged yet.</li>
          </ol>
          </template>

          <template v-else-if="panelTab === 'tasks'">
            <p class="ohub-muted">
              These are regular Tasks Hub items on the shared <strong>Outreach</strong> list, tagged with this school.
            </p>
            <router-link v-if="outreachListId" class="btn btn-secondary ohub-open-list" :to="outreachListHref">Open Outreach list</router-link>
            <form class="ohub-task-form" @submit.prevent="submitTask">
              <label class="ohub-field">
                <span>New task</span>
                <input v-model="taskForm.title" type="text" required placeholder="Follow up after visit…" />
              </label>
              <label class="ohub-field">
                <span>Due</span>
                <input v-model="taskForm.dueDate" type="date" />
              </label>
              <label class="ohub-field">
                <span>Priority</span>
                <select v-model="taskForm.urgency">
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label class="ohub-field">
                <span>Assign to</span>
                <select v-model="taskForm.assignedToUserId">
                  <option value="">Me</option>
                  <option v-for="u in assignableUsers" :key="u.id" :value="String(u.id)">
                    {{ u.first_name }} {{ u.last_name }}
                  </option>
                </select>
              </label>
              <label class="ohub-field">
                <span>Notes</span>
                <textarea v-model="taskForm.description" rows="2" placeholder="Optional" />
              </label>
              <p v-if="taskError" class="ohub-inline-err">{{ taskError }}</p>
              <button type="submit" class="btn btn-primary" :disabled="taskSaving">
                {{ taskSaving ? 'Adding…' : 'Add task' }}
              </button>
            </form>
            <ul class="ohub-task-list">
              <li v-for="t in schoolTasks" :key="t.id">
                <button type="button" class="ohub-task-check" :class="{ done: t.status === 'completed' }" :title="t.status === 'completed' ? 'Reopen' : 'Complete'" @click="toggleTaskComplete(t)" />
                <div>
                  <strong :class="{ done: t.status === 'completed' }">{{ t.title }}</strong>
                  <div class="ohub-muted">
                    <span v-if="t.school_tag" class="ohub-school-tag">{{ t.school_tag }}</span>
                    {{ urgencyLabel(t.urgency) }}
                    <template v-if="t.due_date"> · due {{ formatDate(t.due_date) }}</template>
                    <template v-if="t.assignee_first_name"> · {{ t.assignee_first_name }} {{ t.assignee_last_name }}</template>
                  </div>
                </div>
              </li>
              <li v-if="!schoolTasks.length" class="ohub-muted">No tasks tagged to this school yet.</li>
            </ul>
          </template>

          <template v-else-if="panelTab === 'contacts'">
            <h3>Primary contact</h3>
            <form class="ohub-log" @submit.prevent="submitContact">
              <label class="ohub-field">
                <span>Name</span>
                <input v-model="contactForm.full_name" type="text" required placeholder="Jordan Lee" />
              </label>
              <label class="ohub-field">
                <span>Title</span>
                <input v-model="contactForm.title" type="text" placeholder="Counselor, principal…" />
              </label>
              <label class="ohub-field">
                <span>Email</span>
                <input v-model="contactForm.email" type="email" />
              </label>
              <label class="ohub-field">
                <span>Phone</span>
                <input v-model="contactForm.phone" type="tel" />
              </label>
              <label class="ohub-check">
                <input v-model="contactForm.is_primary" type="checkbox" />
                Primary contact (also adds them to Contacts)
              </label>
              <button type="submit" class="btn btn-primary" :disabled="contactSaving">
                {{ contactSaving ? 'Saving…' : 'Add contact' }}
              </button>
            </form>
            <ul class="ohub-task-list">
              <li v-for="c in selected.contacts || []" :key="c.id">
                <div>
                  <strong>{{ c.full_name }}</strong>
                  <span v-if="c.is_primary" class="ohub-stage partnered">Primary</span>
                  <div class="ohub-muted">
                    {{ c.title || 'Contact' }}
                    <template v-if="c.email"> · {{ c.email }}</template>
                    <template v-if="c.phone"> · {{ c.phone }}</template>
                  </div>
                </div>
              </li>
              <li v-if="!(selected.contacts || []).length" class="ohub-muted">No contacts on file yet.</li>
            </ul>
          </template>

          <template v-else-if="panelTab === 'history'">
            <p class="ohub-muted">Email, phone, letter, and visit history for this school.</p>
            <ol class="ohub-timeline">
              <li v-for="act in selected.activities || []" :key="`hist-${act.id}`">
                <span class="ohub-type-pill" :class="act.contact_type">{{ act.contact_type }}</span>
                <div>
                  <strong>{{ act.summary || stageLabel(act.contact_type) }}</strong>
                  <div class="ohub-muted">{{ formatDateTime(act.activity_at) }}{{ act.created_by_name ? ` · ${act.created_by_name}` : '' }}</div>
                  <p v-if="act.notes">{{ act.notes }}</p>
                </div>
              </li>
              <li v-if="!(selected.activities || []).length" class="ohub-muted">No contacts logged yet.</li>
            </ol>
          </template>

          <template v-else-if="panelTab === 'onboarding'">
            <p class="ohub-muted">Send the school onboarding packet and track their steps here.</p>
            <form class="ohub-task-form" @submit.prevent="submitOnboarding">
              <label class="ohub-field">
                <span>Contact first name</span>
                <input v-model.trim="onboardForm.contactFirstName" required autocomplete="given-name" />
              </label>
              <label class="ohub-field">
                <span>Contact last name</span>
                <input v-model.trim="onboardForm.contactLastName" required autocomplete="family-name" />
              </label>
              <label class="ohub-field">
                <span>Contact email</span>
                <input v-model.trim="onboardForm.contactEmail" type="email" required autocomplete="email" />
              </label>
              <p v-if="onboardConflict" class="ohub-conflict">
                This email is already a school staff account<span v-if="onboardPriorSchools"> at {{ onboardPriorSchools }}</span>.
              </p>
              <label v-if="onboardConflict" class="ohub-check">
                <input v-model="onboardForm.priorSchoolDecision" type="radio" value="leave_prior" />
                Only at this new school
              </label>
              <label v-if="onboardConflict" class="ohub-check">
                <input v-model="onboardForm.priorSchoolDecision" type="radio" value="stay_at_both" />
                Keep prior school(s) and add this one
              </label>
              <p v-if="onboardError" class="ohub-inline-err">{{ onboardError }}</p>
              <p v-if="onboardSuccess" class="ohub-inline-ok">{{ onboardSuccess }}</p>
              <button
                type="submit"
                class="btn btn-primary"
                :disabled="onboardSaving || (onboardConflict && !onboardForm.priorSchoolDecision)"
              >
                {{ onboardSaving ? 'Sending…' : 'Send onboarding' }}
              </button>
            </form>
            <h3>Progress</h3>
            <ol class="ohub-invite-list">
              <li v-for="inv in schoolInvites" :key="inv.id">
                <div class="ohub-invite-head">
                  <strong>{{ inv.contactFirstName }} {{ inv.contactLastName }}</strong>
                  <span class="ohub-stage" :data-status="inv.status">{{ inv.status }}</span>
                </div>
                <div class="ohub-muted">{{ inv.contactEmail }} · {{ inv.completedSteps }}/{{ inv.totalSteps }} steps</div>
                <ul class="ohub-steps">
                  <li v-for="step in onboardingSteps" :key="step.key" :class="inviteStepClass(inv, step.key)">
                    {{ step.label }}
                  </li>
                </ul>
                <div class="ohub-invite-actions">
                  <button type="button" class="btn-link" @click="copyInviteLink(inv)">Copy link</button>
                  <button
                    type="button"
                    class="btn-link"
                    :disabled="inv.status === 'revoked' || inv.status === 'submitted'"
                    @click="emailInvite(inv)"
                  >Email invite</button>
                </div>
              </li>
              <li v-if="!schoolInvites.length" class="ohub-muted">No onboarding invites for this school yet.</li>
            </ol>
          </template>
        </aside>

        <section v-else-if="viewMode === 'trips'" class="ohub-trip-meta">
          <template v-if="openedTrip">
            <h2>Who’s going</h2>
            <ul class="ohub-task-list">
              <li v-for="(p, i) in openedTrip.participants || []" :key="`${p.display_name}-${i}`">
                <div>
                  <strong>{{ p.display_name }}</strong>
                  <div class="ohub-muted">
                    {{ p.start_time ? formatDateTime(p.start_time) : 'Start TBD' }}
                    → {{ p.end_time ? formatDateTime(p.end_time) : 'End TBD' }}
                  </div>
                </div>
              </li>
              <li v-if="!(openedTrip.participants || []).length" class="ohub-muted">No travelers listed.</li>
            </ul>
            <p v-if="openedTrip.notes" class="ohub-muted">{{ openedTrip.notes }}</p>
            <p class="ohub-muted">Mark each school attended, skipped, or short on time. Visits log when you mark Attended.</p>
            <button
              v-if="openedTrip.status !== 'completed'"
              type="button"
              class="btn btn-primary"
              :disabled="tripSaving"
              @click="completeTrip(openedTrip)"
            >{{ tripSaving ? 'Saving…' : 'Mark trip complete' }}</button>
          </template>
          <template v-else>
            <h2>Who’s going</h2>
            <form class="ohub-log" @submit.prevent="addParticipant">
              <label class="ohub-field">
                <span>Name</span>
                <input v-model="participantForm.name" required placeholder="Staff name" />
              </label>
              <label class="ohub-field">
                <span>Start</span>
                <input v-model="participantForm.start_time" type="datetime-local" />
              </label>
              <label class="ohub-field">
                <span>End</span>
                <input v-model="participantForm.end_time" type="datetime-local" />
              </label>
              <button type="submit" class="btn btn-secondary">Add person</button>
            </form>
            <ul class="ohub-task-list">
              <li v-for="(p, i) in tripParticipants" :key="`${p.display_name}-${i}`">
                <div>
                  <strong>{{ p.display_name }}</strong>
                  <div class="ohub-muted">
                    {{ p.start_time ? formatDateTime(p.start_time) : 'Start TBD' }}
                    → {{ p.end_time ? formatDateTime(p.end_time) : 'End TBD' }}
                  </div>
                </div>
                <button type="button" class="btn-link" @click="tripParticipants.splice(i, 1)">Remove</button>
              </li>
            </ul>
            <label class="ohub-field">
              <span>Trip date</span>
              <input v-model="tripDate" type="date" />
            </label>
            <label class="ohub-field">
              <span>Notes</span>
              <textarea v-model="tripNotes" rows="2" />
            </label>
            <button type="button" class="btn btn-primary" :disabled="!tripStops.length || tripSaving" @click="saveTrip">
              {{ tripSaving ? 'Saving…' : 'Save planned trip' }}
            </button>
          </template>
        </section>
      </div>
    </template>

    <template v-else>
      <div class="ohub-filters">
        <select v-model="timelineType" @change="loadTimeline">
          <option value="visit">Visits / trips</option>
          <option value="">All contact types</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="letter">Letter</option>
        </select>
        <label class="ohub-field-inline">
          From
          <input v-model="timelineFrom" type="date" @change="loadTimeline" />
        </label>
        <label class="ohub-field-inline">
          To
          <input v-model="timelineTo" type="date" @change="loadTimeline" />
        </label>
      </div>
      <ol class="ohub-report">
        <li v-for="act in timeline" :key="act.id">
          <div class="ohub-report-date">{{ formatDateTime(act.activity_at) }}</div>
          <span class="ohub-type-pill" :class="act.contact_type">{{ act.contact_type }}</span>
          <div>
            <strong>{{ act.school_name }}</strong>
            <div class="ohub-muted">{{ act.district_name }} · {{ levelLabel(act.school_level) }}{{ act.city ? ` · ${act.city}` : '' }}</div>
            <p v-if="act.summary">{{ act.summary }}</p>
            <p v-if="act.notes" class="ohub-muted">{{ act.notes }}</p>
            <div v-if="act.created_by_name" class="ohub-muted">{{ act.created_by_name }}</div>
          </div>
        </li>
        <li v-if="!timeline.length" class="ohub-empty">No contacts in this range yet.</li>
      </ol>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api.js';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';

const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();

const onboardingSteps = [
  { key: 'school_information', label: 'School information' },
  { key: 'school_staff', label: 'School staff' },
  { key: 'preferred_days', label: 'Preferred days' },
  { key: 'welcome_materials', label: 'Welcome materials' },
  { key: 'explore_demo', label: 'Explore demo' },
  { key: 'review_submit', label: 'Review & submit' }
];

const stageOptions = [
  { id: 'not_started', label: 'Not started' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'follow_up_needed', label: 'Follow-up needed' },
  { id: 'meeting_scheduled', label: 'Meeting scheduled' },
  { id: 'partnered', label: 'Partnered' },
  { id: 'on_hold', label: 'On hold' }
];
const attendanceOptions = [
  { id: 'attended', label: 'Attended' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'time_short', label: "Couldn't make it (time)" }
];
const WINDCHIME_COORDS = { lat: 38.9246, lng: -104.8452 };

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const viewMode = ref('tracker');
const schools = ref([]);
const summary = ref({});
const selectedId = ref(null);
const selected = ref(null);
const panelTab = ref('overview');
const schoolTasks = ref([]);
const schoolInvites = ref([]);
const outreachListId = ref(null);
const assignableUsers = ref([]);
const taskSaving = ref(false);
const taskError = ref('');
const onboardSaving = ref(false);
const onboardError = ref('');
const onboardSuccess = ref('');
const onboardConflict = ref(false);
const onboardPriorSchools = ref('');
const taskForm = reactive({
  title: '',
  description: '',
  dueDate: '',
  urgency: 'medium',
  assignedToUserId: ''
});
const onboardForm = reactive({
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
  priorSchoolDecision: ''
});
const timeline = ref([]);
const timelineType = ref('visit');
const timelineFrom = ref('');
const timelineTo = ref('');
const filters = reactive({ q: '', district: '', level: '', stage: '' });
const sortKey = ref('district');
const sortDir = ref('asc');
const noteForm = reactive({ body: '' });
const noteSaving = ref(false);
const contactForm = reactive({ full_name: '', email: '', phone: '', title: '', is_primary: true });
const contactSaving = ref(false);
const trips = ref([]);
const plannedTrips = computed(() =>
  trips.value.filter((t) => ['planned', 'in_progress'].includes(String(t?.status || '')))
);
const pastTrips = computed(() =>
  trips.value.filter((t) => ['completed', 'cancelled'].includes(String(t?.status || '')))
);
const tripListSections = computed(() => [
  {
    id: 'planned',
    title: 'Planned trips',
    items: plannedTrips.value,
    emptyLabel: 'No planned trips yet. Build a route below and save it.'
  },
  {
    id: 'past',
    title: 'Past trips',
    items: pastTrips.value,
    emptyLabel: 'No completed trips yet.'
  }
]);
const tripStatusLabel = (status) => ({
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
}[String(status || '')] || String(status || ''));
const tripStops = ref([]);
const tripNearby = ref([]);
const tripSearch = ref('');
const tripStageFilter = ref('');
const tripDistrictFilter = ref('');
const tripSort = ref('closest');
const tripDate = ref('');
const tripNotes = ref('');
const tripSaving = ref(false);
const tripPreviewLoading = ref(false);
const tripGeocodeRemaining = ref(null);
const tripParticipants = ref([]);
const openedTripId = ref(null);
const participantForm = reactive({ name: '', start_time: '', end_time: '' });
const logForm = reactive({
  contact_type: 'visit',
  activity_at: '',
  summary: '',
  notes: ''
});
const showImport = ref(false);
const importRows = ref([]);
const importPreview = ref(null);
const importResult = ref(null);
const importSaving = ref(false);

const districts = computed(() => (summary.value.by_district || []).map((d) => d.district));
const districtCount = computed(() => districts.value.length);
const hasFilters = computed(() => !!(filters.q || filters.district || filters.level || filters.stage));
const orgPrefix = computed(() => {
  const slug = typeof route.params?.organizationSlug === 'string' ? route.params.organizationSlug.trim() : '';
  return slug ? `/${slug}` : '';
});
const outreachListHref = computed(() =>
  outreachListId.value ? `${orgPrefix.value}/tasks/lists/${outreachListId.value}` : `${orgPrefix.value}/tasks`
);
const urgencyLabel = (u) => ({ high: 'High', medium: 'Medium', low: 'Low' }[String(u || 'medium')] || 'Medium');
const inviteStepClass = (inv, key) => {
  const st = String(inv?.stepProgress?.[key] || 'not_started');
  return { complete: st === 'complete', current: st === 'in_progress' };
};

const resetTaskForm = () => {
  taskForm.title = '';
  taskForm.description = '';
  taskForm.dueDate = '';
  taskForm.urgency = 'medium';
  taskForm.assignedToUserId = '';
  taskError.value = '';
};
const resetOnboardForm = () => {
  onboardForm.contactFirstName = '';
  onboardForm.contactLastName = '';
  onboardForm.contactEmail = '';
  onboardForm.priorSchoolDecision = '';
  onboardConflict.value = false;
  onboardPriorSchools.value = '';
  onboardError.value = '';
};

const loadAssignableUsers = async () => {
  const aid = Number(agencyStore.currentAgency?.id || 0);
  if (!aid) return;
  try {
    const { data } = await api.get(`/agencies/${aid}/users`, { skipGlobalLoading: true });
    const list = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
    assignableUsers.value = list.filter((u) => Number(u.id) !== Number(authStore.user?.id));
  } catch {
    assignableUsers.value = [];
  }
};

const loadSchoolExtras = async (id) => {
  if (!id) {
    schoolTasks.value = [];
    schoolInvites.value = [];
    return;
  }
  try {
    const [taskRes, onboardRes] = await Promise.all([
      api.get(`/outreach/schools/${id}/tasks`, { skipGlobalLoading: true }),
      api.get(`/outreach/schools/${id}/onboarding`, { skipGlobalLoading: true })
    ]);
    schoolTasks.value = taskRes.data?.tasks || [];
    outreachListId.value = taskRes.data?.list?.id || outreachListId.value;
    schoolInvites.value = onboardRes.data?.invites || [];
  } catch {
    schoolTasks.value = [];
    schoolInvites.value = [];
  }
};

const levelLabel = (level) => ({
  elementary: 'Elementary',
  middle: 'Middle',
  high: 'High school',
  k8: 'K-8 / P-8',
  k12: 'K-12',
  other: 'Other'
}[String(level || '')] || String(level || '—'));

const stageLabel = (stage) => stageOptions.find((s) => s.id === stage)?.label || String(stage || '');
const shortDistrict = (name) => {
  const n = String(name || '');
  if (n.includes('Denver')) return 'DPS';
  if (n.includes('Aurora')) return 'Aurora';
  if (n.includes('Pueblo City')) return 'Pueblo D60';
  if (n.includes('Pueblo County')) return 'Pueblo D70';
  if (n.includes('Poudre')) return 'Poudre';
  return n;
};

const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString();
};
const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
};
const dateInput = (v) => (v ? String(v).slice(0, 10) : '');
const localDateTimeValue = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

let searchTimer = null;
const debouncedReload = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { void reload(); }, 250);
};

const clearFilters = () => {
  filters.q = '';
  filters.district = '';
  filters.level = '';
  filters.stage = '';
  void reload();
};

const resetLogForm = () => {
  logForm.contact_type = 'visit';
  logForm.activity_at = localDateTimeValue();
  logForm.summary = '';
  logForm.notes = '';
};

const reload = async () => {
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (filters.q) params.q = filters.q;
    if (filters.district) params.district = filters.district;
    if (filters.level) params.level = filters.level;
    if (filters.stage) params.stage = filters.stage;
    if (sortKey.value) params.sort = sortKey.value;
    if (sortDir.value) params.sortDir = sortDir.value;
    const [sumRes, listRes] = await Promise.all([
      api.get('/outreach/summary'),
      api.get('/outreach/schools', { params })
    ]);
    summary.value = sumRes.data || {};
    schools.value = listRes.data?.schools || [];
    if (selectedId.value && !schools.value.some((s) => s.id === selectedId.value)) {
      selectedId.value = null;
      selected.value = null;
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not load outreach.';
  } finally {
    loading.value = false;
  }
};

const closeSchoolPanel = () => {
  selectedId.value = null;
  selected.value = null;
};

const selectSchool = async (id) => {
  selectedId.value = id;
  panelTab.value = panelTab.value || 'overview';
  try {
    const res = await api.get(`/outreach/schools/${id}`);
    selected.value = res.data?.school || null;
    resetLogForm();
    resetTaskForm();
    resetOnboardForm();
    onboardSuccess.value = '';
    await loadSchoolExtras(id);
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not load school.';
  }
};

const submitTask = async () => {
  if (!selectedId.value) return;
  taskSaving.value = true;
  taskError.value = '';
  try {
    await api.post(`/outreach/schools/${selectedId.value}/tasks`, {
      title: taskForm.title,
      description: taskForm.description || null,
      dueDate: taskForm.dueDate || null,
      urgency: taskForm.urgency,
      assignedToUserId: taskForm.assignedToUserId ? Number(taskForm.assignedToUserId) : undefined
    });
    resetTaskForm();
    await loadSchoolExtras(selectedId.value);
  } catch (err) {
    taskError.value = err.response?.data?.error?.message || err.message || 'Could not add task.';
  } finally {
    taskSaving.value = false;
  }
};

const toggleTaskComplete = async (t) => {
  try {
    if (t.status === 'completed') {
      await api.put(`/tasks/${t.id}/incomplete`, {}, { skipGlobalLoading: true });
    } else {
      await api.put(`/tasks/${t.id}/complete`, {}, { skipGlobalLoading: true });
    }
    await loadSchoolExtras(selectedId.value);
  } catch (err) {
    taskError.value = err.response?.data?.error?.message || 'Could not update task.';
  }
};

const submitOnboarding = async () => {
  if (!selectedId.value) return;
  onboardSaving.value = true;
  onboardError.value = '';
  onboardSuccess.value = '';
  try {
    const payload = {
      contactFirstName: onboardForm.contactFirstName,
      contactLastName: onboardForm.contactLastName,
      contactEmail: onboardForm.contactEmail,
      sendEmail: true,
      confirmExistingSchoolStaff: onboardConflict.value,
      priorSchoolDecision: onboardForm.priorSchoolDecision || null
    };
    const res = await api.post(`/outreach/schools/${selectedId.value}/onboarding`, payload);
    onboardConflict.value = false;
    onboardSuccess.value = res.data?.emailSent
      ? `Invite emailed to ${onboardForm.contactEmail}.`
      : 'Invite created. Copy the link from the progress list.';
    resetOnboardForm();
    schoolInvites.value = res.data?.invites || schoolInvites.value;
    await loadSchoolExtras(selectedId.value);
  } catch (err) {
    const code = err.response?.data?.error?.code;
    if (code === 'SCHOOL_STAFF_ALREADY_AFFILIATED') {
      onboardConflict.value = true;
      const schools = err.response?.data?.error?.details?.currentSchools || [];
      onboardPriorSchools.value = schools.map((s) => s.name || s.schoolName).filter(Boolean).join(', ');
      onboardError.value = err.response?.data?.error?.message || err.message;
    } else {
      onboardError.value = err.response?.data?.error?.message || err.message || 'Could not send onboarding.';
    }
  } finally {
    onboardSaving.value = false;
  }
};

const copyInviteLink = async (inv) => {
  const link = inv?.link;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    onboardSuccess.value = 'Invite link copied.';
  } catch {
    onboardError.value = 'Could not copy link.';
  }
};

const emailInvite = async (inv) => {
  try {
    await api.post(`/school-onboarding/invites/${inv.id}/send-email`, {
      agencyId: Number(agencyStore.currentAgency?.id || 0) || undefined
    });
    onboardSuccess.value = `Invite emailed to ${inv.contactEmail}.`;
  } catch (err) {
    onboardError.value = err.response?.data?.error?.message || 'Could not email invite.';
  }
};

const saveStage = async (stage) => {
  if (!selectedId.value) return;
  const prevStage = selected.value?.outreach_stage
    || schools.value.find((s) => s.id === selectedId.value)?.outreach_stage;
  const res = await api.patch(
    `/outreach/schools/${selectedId.value}`,
    { outreach_stage: stage },
    { skipGlobalLoading: true }
  );
  selected.value = res.data?.school || selected.value;
  const row = schools.value.find((s) => s.id === selectedId.value);
  if (row) row.outreach_stage = stage;
  if (summary.value?.by_stage && prevStage && prevStage !== stage) {
    summary.value.by_stage[prevStage] = Math.max(0, Number(summary.value.by_stage[prevStage] || 0) - 1);
    summary.value.by_stage[stage] = Number(summary.value.by_stage[stage] || 0) + 1;
    summary.value.partnered = Number(summary.value.by_stage.partnered || 0);
    summary.value.active_outreach = Number(summary.value.total_schools || 0)
      - Number(summary.value.by_stage.not_started || 0)
      - Number(summary.value.by_stage.on_hold || 0);
  }
};

const saveFollowUp = async (value) => {
  if (!selectedId.value) return;
  const res = await api.patch(`/outreach/schools/${selectedId.value}`, { next_follow_up_at: value || null });
  selected.value = res.data?.school || selected.value;
};

const submitLog = async () => {
  if (!selectedId.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await api.post(`/outreach/schools/${selectedId.value}/activities`, { ...logForm });
    selected.value = res.data?.school || selected.value;
    resetLogForm();
    await reload();
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not save activity.';
  } finally {
    saving.value = false;
  }
};

const loadTimeline = async () => {
  error.value = '';
  try {
    const params = {};
    if (timelineType.value) params.contactType = timelineType.value;
    if (timelineFrom.value) params.from = timelineFrom.value;
    if (timelineTo.value) params.to = timelineTo.value;
    const res = await api.get('/outreach/timeline', { params });
    timeline.value = res.data?.activities || [];
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not load timeline.';
  }
};

const openTimeline = async () => {
  viewMode.value = 'timeline';
  await loadTimeline();
};

const setSort = (key) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'last_contact' || key === 'visits' ? 'desc' : 'asc';
  }
  void reload();
};

const submitNote = async () => {
  if (!selectedId.value || !noteForm.body.trim()) return;
  noteSaving.value = true;
  try {
    const res = await api.post(`/outreach/schools/${selectedId.value}/notes`, { body: noteForm.body });
    selected.value = res.data?.school || selected.value;
    noteForm.body = '';
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not save note.';
  } finally {
    noteSaving.value = false;
  }
};

const submitContact = async () => {
  if (!selectedId.value) return;
  contactSaving.value = true;
  try {
    const res = await api.post(`/outreach/schools/${selectedId.value}/contacts`, contactForm);
    selected.value = res.data?.school || selected.value;
    contactForm.full_name = '';
    contactForm.email = '';
    contactForm.phone = '';
    contactForm.title = '';
    contactForm.is_primary = true;
    await reload();
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not save contact.';
  } finally {
    contactSaving.value = false;
  }
};

const lastTripStopName = computed(() => tripStops.value.at(-1)?.name || 'Windchime');
const openedTrip = computed(() =>
  trips.value.find((t) => Number(t.id) === Number(openedTripId.value)) || null
);

const roundMiles = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
};

const haversineMilesLocal = (a, b) => {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const la = Number(a.lat);
  const ln = Number(a.lng);
  const lb = Number(b.lat);
  const lnb = Number(b.lng);
  if (![la, ln, lb, lnb].every(Number.isFinite)) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lb - la);
  const dLng = toRad(lnb - ln);
  const s =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(la)) * Math.cos(toRad(lb)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
};

const stopLegMiles = (stop) => {
  const n = Number(stop?.miles_from_prev ?? stop?.miles_from_origin);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

const tripRouteTotalMiles = computed(() => {
  const legs = tripStops.value.map((s) => stopLegMiles(s)).filter((n) => n != null);
  if (!legs.length) return null;
  return Math.round(legs.reduce((a, b) => a + b, 0) * 10) / 10;
});

const tripHomeMiles = computed(() => {
  const last = tripStops.value.at(-1);
  if (!last) return null;
  return haversineMilesLocal(
    { lat: last.lat, lng: last.lng },
    WINDCHIME_COORDS
  );
});

const tripRoundTripTotal = computed(() => {
  const out = tripRouteTotalMiles.value;
  const home = tripHomeMiles.value;
  if (out == null && home == null) return null;
  return Math.round(((out || 0) + (home || 0)) * 10) / 10;
});

const tripDistrictOptions = computed(() => {
  const names = new Set();
  for (const s of tripNearby.value || []) {
    if (s.district_name) names.add(s.district_name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
});

const filteredNearbySchools = computed(() => {
  const q = String(tripSearch.value || '').trim().toLowerCase();
  const stage = tripStageFilter.value;
  const district = tripDistrictFilter.value;
  let list = (tripNearby.value || []).filter((s) => {
    if (stage && s.outreach_stage !== stage) return false;
    if (district && s.district_name !== district) return false;
    if (!q) return true;
    const stageText = stageLabel(s.outreach_stage).toLowerCase();
    return [s.name, s.city, s.district_name, s.address, stageText].some((v) =>
      String(v || '').toLowerCase().includes(q)
    );
  });

  const sort = tripSort.value;
  if (sort === 'closest') {
    // API returns closest-first; keep that order within the filtered set.
  } else if (sort === 'miles') {
    list = [...list].sort((a, b) => (Number(a.miles_from_origin ?? 99999) - Number(b.miles_from_origin ?? 99999)));
  } else if (sort === 'school') {
    list = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } else if (sort === 'district') {
    list = [...list].sort((a, b) =>
      String(a.district_name).localeCompare(String(b.district_name)) || String(a.name).localeCompare(String(b.name))
    );
  } else if (sort === 'stage') {
    const stageOrder = stageOptions.map((s) => s.id);
    list = [...list].sort((a, b) => {
      const ai = stageOrder.indexOf(a.outreach_stage);
      const bi = stageOrder.indexOf(b.outreach_stage);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || String(a.name).localeCompare(String(b.name));
    });
  } else if (sort === 'level') {
    list = [...list].sort((a, b) =>
      String(a.school_level).localeCompare(String(b.school_level)) || String(a.name).localeCompare(String(b.name))
    );
  }

  return list.slice(0, 60);
});

const clearTripFilters = () => {
  tripSearch.value = '';
  tripStageFilter.value = '';
  tripDistrictFilter.value = '';
  tripSort.value = 'closest';
};

const savedTripTotalMiles = (trip) => {
  const legs = (trip?.stops || []).map((s) => Number(s.miles_from_prev)).filter((n) => Number.isFinite(n));
  if (!legs.length) return null;
  return Math.round(legs.reduce((a, b) => a + b, 0) * 10) / 10;
};

const savedTripRoundTripMiles = (trip) => {
  if (trip?.round_trip_miles != null) return roundMiles(trip.round_trip_miles);
  const out = savedTripTotalMiles(trip);
  const last = (trip?.stops || []).at(-1);
  const home = last ? haversineMilesLocal({ lat: last.lat, lng: last.lng }, WINDCHIME_COORDS) : null;
  if (out == null && home == null) return null;
  return Math.round(((out || 0) + (home || 0)) * 10) / 10;
};

const attendanceLabel = (status) => ({
  attended: 'Attended',
  skipped: 'Skipped',
  time_short: "Couldn't make it (time)",
  pending: 'Not marked'
}[String(status || 'pending')] || String(status));

const openSavedTrip = (t) => {
  openedTripId.value = t?.id || null;
  selectedId.value = null;
  selected.value = null;
};

const closeOpenedTrip = () => {
  openedTripId.value = null;
  selectedId.value = null;
  selected.value = null;
};

const setStopAttendance = async (stop, status) => {
  if (!openedTripId.value || !stop?.id) return;
  tripSaving.value = true;
  error.value = '';
  try {
    const res = await api.patch(`/outreach/trips/${openedTripId.value}/stops/${stop.id}`, {
      attendance_status: status
    }, { skipGlobalLoading: true });
    const updated = res.data?.trip;
    if (updated) {
      trips.value = trips.value.map((t) => (Number(t.id) === Number(updated.id) ? updated : t));
    } else {
      await loadTrips();
    }
    if (status === 'attended') {
      await Promise.all([
        selectedId.value === stop.outreach_school_id ? selectSchool(stop.outreach_school_id) : Promise.resolve(),
        reload()
      ]);
    }
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not update stop.';
  } finally {
    tripSaving.value = false;
  }
};

const loadTripPreview = async () => {
  tripPreviewLoading.value = true;
  try {
    const originSchoolId = tripStops.value.at(-1)?.id || null;
    const excludeIds = tripStops.value.map((s) => s.id);
    const res = await api.post('/outreach/trips/preview', { originSchoolId, excludeIds }, { skipGlobalLoading: true });
    tripNearby.value = res.data?.schools || [];
    tripGeocodeRemaining.value = Number(res.data?.geocode_remaining ?? res.data?.remaining ?? 0) || null;
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not load trip distances.';
  } finally {
    tripPreviewLoading.value = false;
  }
};

const addTripStop = async (row) => {
  const legMiles = row.miles_from_origin != null ? Number(row.miles_from_origin) : null;
  tripStops.value = [...tripStops.value, {
    ...row,
    miles_from_prev: legMiles,
    miles_from_origin: legMiles
  }];
  await loadTripPreview();
};
const startTripFromSchool = async (row) => {
  if (!row?.id) return;
  openedTripId.value = null;
  viewMode.value = 'trips';
  tripStops.value = [row];
  try {
    await Promise.all([loadTripPreview(), loadTrips()]);
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not start trip.';
  }
};
const removeTripStop = async (idx) => {
  tripStops.value = tripStops.value.filter((_, i) => i !== idx);
  await loadTripPreview();
};
const addParticipant = () => {
  const name = String(participantForm.name || '').trim();
  if (!name) return;
  tripParticipants.value.push({
    display_name: name,
    start_time: participantForm.start_time || null,
    end_time: participantForm.end_time || null
  });
  participantForm.name = '';
  participantForm.start_time = '';
  participantForm.end_time = '';
};

const loadTrips = async () => {
  const res = await api.get('/outreach/trips', { skipGlobalLoading: true });
  trips.value = res.data?.trips || [];
};

const openTrips = async () => {
  viewMode.value = 'trips';
  try {
    await Promise.all([loadTripPreview(), loadTrips()]);
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not load trips.';
  }
};

const saveTrip = async () => {
  tripSaving.value = true;
  error.value = '';
  try {
    await api.post('/outreach/trips', {
      schoolIds: tripStops.value.map((s) => s.id),
      plannedDate: tripDate.value || null,
      notes: tripNotes.value || null,
      participants: tripParticipants.value
    });
    tripStops.value = [];
    tripNotes.value = '';
    tripParticipants.value = [];
    await Promise.all([loadTrips(), loadTripPreview()]);
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not save trip.';
  } finally {
    tripSaving.value = false;
  }
};

const completeTrip = async (t) => {
  tripSaving.value = true;
  try {
    const res = await api.post(`/outreach/trips/${t.id}/complete`, {
      participants: t.participants || tripParticipants.value,
      notes: t.notes
    });
    const updated = res.data?.trip;
    if (updated) {
      trips.value = trips.value.map((row) => (Number(row.id) === Number(updated.id) ? updated : row));
    }
    await Promise.all([loadTrips(), reload()]);
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not complete trip.';
  } finally {
    tripSaving.value = false;
  }
};

const loadOutreachList = async () => {
  try {
    const res = await api.get('/outreach/task-list', { skipGlobalLoading: true });
    outreachListId.value = res.data?.list?.id || null;
  } catch {
    /* list is created on first school task load */
  }
};

const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c || '').trim()));
};

const csvRowsToImport = (grid) => {
  if (!grid.length) return [];
  const header = grid[0].map((c) => String(c || '').trim().toLowerCase());
  const looksHeader = header.some((h) => ['date', 'school', 'poc', 'poc & info'].includes(h));
  const body = looksHeader ? grid.slice(1) : grid;
  const idx = (names) => header.findIndex((h) => names.includes(h));
  const col = looksHeader
    ? {
      date: Math.max(0, idx(['date'])),
      school: Math.max(1, idx(['school'])),
      poc: Math.max(2, idx(['poc', 'poc & info', 'poc &info', 'poc and info'])),
      notes: Math.max(3, idx(['notes'])),
      visit: Math.max(4, idx(['vist #', 'visit #', 'visit', 'visits'])),
      follow: Math.max(5, idx(['follow upemail', 'follow up email', 'follow-up email'])),
      meeting: Math.max(6, idx(['meeting'])),
      services: Math.max(7, idx(['services started', 'services'])),
      extra: Math.max(8, idx(['', 'comments', 'comment', 'additional notes']))
    }
    : { date: 0, school: 1, poc: 2, notes: 3, visit: 4, follow: 5, meeting: 6, services: 7, extra: 8 };
  return body.map((r) => ({
    date: r[col.date] || '',
    school: r[col.school] || '',
    pocInfo: r[col.poc] || '',
    notes: r[col.notes] || '',
    visitCount: r[col.visit] || '',
    followUpEmail: r[col.follow] || '',
    meeting: r[col.meeting] || '',
    servicesStarted: r[col.services] || '',
    extraNotes: r[col.extra] || ''
  })).filter((r) => String(r.school || '').trim());
};

const onImportFile = async (ev) => {
  const file = ev.target?.files?.[0];
  importPreview.value = null;
  importResult.value = null;
  if (!file) { importRows.value = []; return; }
  const text = await file.text();
  importRows.value = csvRowsToImport(parseCsvText(text));
};

const runImportPreview = async () => {
  importSaving.value = true;
  importResult.value = null;
  try {
    const res = await api.post('/outreach/import/preview', {
      rows: importRows.value,
      districtIncludes: 'denver public'
    }, { skipGlobalLoading: true });
    importPreview.value = res.data;
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not preview import.';
  } finally {
    importSaving.value = false;
  }
};

const runImport = async () => {
  importSaving.value = true;
  try {
    const res = await api.post('/outreach/import/historical', {
      rows: importRows.value,
      districtIncludes: 'denver public',
      dryRun: false
    });
    importResult.value = res.data;
    await reload();
  } catch (err) {
    error.value = err.response?.data?.error?.message || err.message || 'Could not import.';
  } finally {
    importSaving.value = false;
  }
};

onMounted(async () => {
  resetLogForm();
  await Promise.all([reload(), loadAssignableUsers(), loadOutreachList()]);
  const qid = Number(route.query?.school || 0);
  if (qid) await selectSchool(qid);
});
</script>

<style scoped>
.ohub {
  max-width: none;
  width: 100%;
  flex: 1 1 auto;
  margin: 0;
  padding: 20px 24px 48px;
  box-sizing: border-box;
}
.ohub-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.ohub-header h1 { margin: 0 0 4px; font-size: 28px; }
.ohub-sub { margin: 0; color: #64748b; max-width: 640px; }
.ohub-header-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ohub-tab {
  border: 1px solid #dbe4dc;
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
}
.ohub-tab.active { background: #14532d; color: #fff; border-color: #14532d; }
.ohub-error { color: #b91c1c; margin: 0 0 12px; }
.ohub-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.ohub-kpi {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px 14px;
}
.ohub-kpi span { display: block; font-size: 12px; color: #64748b; font-weight: 600; }
.ohub-kpi strong { display: block; font-size: 26px; color: #14532d; }
.ohub-kpi em { font-style: normal; font-size: 12px; color: #94a3b8; }
.ohub-kpi.warn strong { color: #c2410c; }
.ohub-kpi.visit strong { color: #6d28d9; }
.ohub-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}
.ohub-search, .ohub-filters select, .ohub-field input, .ohub-field select, .ohub-field textarea {
  border: 1px solid #dbe4dc;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fff;
}
.ohub-search { min-width: 220px; flex: 1; }
.ohub-body { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(340px, 0.8fr); gap: 16px; align-items: start; }
.ohub-table th.sortable { cursor: pointer; user-select: none; }
.ohub-table th.sortable:hover { color: #14532d; }
.ohub-check { display: flex; gap: 8px; align-items: center; font-size: 13px; margin: 8px 0; }
.ohub-trip-layout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr); gap: 16px; margin-bottom: 24px; }
.ohub-trips-overview {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px 18px;
  margin-bottom: 16px;
}
.ohub-trips-overview-title { margin: 0 0 12px; font-size: 18px; }
.ohub-trips-section + .ohub-trips-section { margin-top: 16px; padding-top: 14px; border-top: 1px solid #f1f5f9; }
.ohub-trips-section-title { margin: 0 0 8px; font-size: 14px; font-weight: 700; color: #334155; }
.ohub-trips-empty { padding: 8px 0; }
.ohub-trip-plan, .ohub-trip-meta, .ohub-saved-trip {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
}
.ohub-trip-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  padding: 8px 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  margin-bottom: 10px;
  font-size: 13px;
  color: #334155;
}
.ohub-trip-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.ohub-trip-search { min-width: 160px; flex: 1; max-width: 280px; }
.ohub-trip-select {
  border: 1px solid #dbe4dc;
  border-radius: 10px;
  padding: 6px 8px;
  background: #fff;
  font-size: 12px;
}
.ohub-trip-clear { font-size: 12px; }
.ohub-import {
  background: #fff;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.ohub-route { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 8px; }
.ohub-route-origin { padding: 8px 10px; background: #f0fdf4; border-radius: 10px; }
.ohub-route-stop { padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 10px; }
.ohub-route-stop.selected { border-color: #14532d; background: #f0fdf4; }
.ohub-route-stop-btn, .ohub-route-stop-name {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
.ohub-route-stop-name { display: inline; }
.ohub-trip-plan-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 4px; }
.ohub-trip-plan-head h2 { margin: 0; font-size: 18px; }
.ohub-attend { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.ohub-attend-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
.ohub-attend-btn {
  border: 1px solid #dbe4dc;
  background: #fff;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}
.ohub-attend-btn.on { border-color: #14532d; background: #14532d; color: #fff; }
.ohub-attend-btn:disabled { opacity: 0.65; cursor: default; }
.ohub-attend-status { margin: 4px 0 0; }
.ohub-saved-trip-actions { display: flex; gap: 8px; flex-shrink: 0; }
.ohub-route-stop-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ohub-route-stop-meta, .ohub-route-stop-addr { margin-top: 2px; }
.ohub-nearby { list-style: none; padding: 0; margin: 0; max-height: 420px; overflow: auto; }
.ohub-nearby-btn {
  width: 100%;
  text-align: left;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 10px;
  padding: 7px 10px;
  margin-bottom: 6px;
  cursor: pointer;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}
.ohub-nearby-btn:hover { border-color: #14532d; background: #f0fdf4; }
.ohub-nearby-miles {
  font-size: 13px;
  font-weight: 800;
  color: #14532d;
  line-height: 1.2;
}
.ohub-nearby-miles em { font-size: 10px; font-weight: 600; color: #64748b; font-style: normal; }
.ohub-nearby-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ohub-nearby-title-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ohub-nearby-title-row strong { font-size: 13px; }
.ohub-nearby-meta { font-size: 11px; color: #64748b; }
.ohub-nearby-addr { font-size: 11px; color: #94a3b8; font-style: normal; }
.ohub-saved-trips { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.ohub-saved-trip { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
@media (max-width: 980px) {
  .ohub-body, .ohub-trip-layout { grid-template-columns: 1fr; }
}
.ohub-table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
.ohub-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ohub-table th { text-align: left; padding: 10px 12px; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e2e8f0; }
.ohub-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.ohub-table tbody tr { cursor: pointer; }
.ohub-table tbody tr:hover, .ohub-table tbody tr.selected { background: #f0fdf4; }
.ohub-muted { color: #64748b; font-size: 12px; }
.ohub-empty { text-align: center; color: #64748b; padding: 24px !important; }
.ohub-stage {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
}
.ohub-stage.sm { font-size: 10px; padding: 1px 6px; }
.ohub-stage.partnered { background: #dcfce7; color: #166534; }
.ohub-stage.meeting_scheduled { background: #ede9fe; color: #6d28d9; }
.ohub-stage.contacted { background: #e0f2fe; color: #0369a1; }
.ohub-stage.follow_up_needed { background: #ffedd5; color: #c2410c; }
.ohub-stage.on_hold { background: #e2e8f0; color: #475569; }
.ohub-detail {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 40px);
  overflow: auto;
}
.ohub-panel-tabs {
  display: flex;
  gap: 4px;
  margin: 12px 0 14px;
  border-bottom: 1px solid #e2e8f0;
}
.ohub-panel-tabs button {
  border: 0;
  background: transparent;
  padding: 8px 10px;
  font-weight: 700;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.ohub-panel-tabs button.active {
  color: #14532d;
  border-bottom-color: #14532d;
}
.ohub-open-list {
  display: inline-flex;
  margin-bottom: 12px;
  text-decoration: none;
}
.ohub-task-form { display: grid; gap: 6px; margin-bottom: 14px; }
.ohub-task-list, .ohub-invite-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.ohub-task-list li { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: start; }
.ohub-task-check {
  width: 16px;
  height: 16px;
  margin-top: 3px;
  border: 1.5px solid #94a3b8;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}
.ohub-task-check.done { background: #14532d; border-color: #14532d; }
.ohub-task-list strong.done { text-decoration: line-through; color: #64748b; }
.ohub-school-tag {
  display: inline-flex;
  padding: 1px 7px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #166534;
  font-weight: 700;
  margin-right: 6px;
}
.ohub-inline-err { color: #b91c1c; font-size: 12px; margin: 0; }
.ohub-inline-ok { color: #166534; font-size: 12px; margin: 0; }
.ohub-conflict { font-size: 12px; color: #9a3412; background: #ffedd5; padding: 8px; border-radius: 8px; }
.ohub-check { display: flex; gap: 8px; align-items: center; font-size: 12px; font-weight: 600; }
.ohub-steps { list-style: none; padding: 0; margin: 6px 0; display: flex; flex-wrap: wrap; gap: 4px; }
.ohub-steps li {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
}
.ohub-steps li.complete { background: #dcfce7; color: #166534; }
.ohub-steps li.current { background: #e0f2fe; color: #0369a1; }
.ohub-invite-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.ohub-invite-actions { display: flex; gap: 10px; margin-top: 4px; }
.ohub-detail-head { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
.ohub-detail h2 { margin: 0 0 6px; font-size: 18px; }
.ohub-detail h3 { margin: 18px 0 8px; font-size: 14px; }
.ohub-meta { display: grid; gap: 6px; margin: 12px 0; }
.ohub-meta div { display: grid; grid-template-columns: 110px 1fr; gap: 8px; font-size: 13px; }
.ohub-meta dt { color: #64748b; }
.ohub-field, .ohub-field-inline { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
.ohub-field-inline { flex-direction: row; align-items: center; gap: 8px; }
.ohub-types { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ohub-types label {
  border: 1px solid #dbe4dc;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
}
.ohub-types label.on { background: #14532d; color: #fff; border-color: #14532d; }
.ohub-types label.visit.on { background: #6d28d9; border-color: #6d28d9; }
.ohub-types input { display: none; }
.ohub-timeline, .ohub-report { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.ohub-timeline li, .ohub-report li { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start; }
.ohub-report li { grid-template-columns: 140px auto 1fr; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; }
.ohub-report-date { font-size: 12px; color: #64748b; font-weight: 700; }
.ohub-type-pill { text-transform: capitalize; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #f1f5f9; }
.ohub-type-pill.visit { background: #ede9fe; color: #6d28d9; }
.ohub-type-pill.email { background: #e0f2fe; color: #0369a1; }
.ohub-type-pill.phone { background: #dcfce7; color: #166534; }
.ohub-type-pill.letter { background: #ffedd5; color: #c2410c; }
.btn-link { background: none; border: 0; color: #14532d; font-weight: 700; cursor: pointer; }
@media (max-width: 980px) {
  .ohub-body { grid-template-columns: 1fr; }
  .ohub-report li { grid-template-columns: 1fr; }
}
</style>
