<template>
  <div class="client-list-grid" :class="{ 'is-overview-split': !!overviewClient }">
    <div v-if="loading && clients.length === 0" class="loading-state">
      <p>Loading clients...</p>
    </div>

    <div v-else-if="error && clients.length === 0" class="error-state">
      <p>{{ error }}</p>
    </div>

    <template v-else-if="overviewClient">
      <aside class="roster-quicklist" aria-label="Client names">
        <div class="roster-quicklist-head">
          <strong>{{ sortedClients.length }} clients</strong>
          <button type="button" class="btn-link" @click="closeOverview">View all</button>
        </div>
        <input
          v-if="showSearch"
          v-model="searchQuery"
          type="search"
          class="roster-quicklist-search"
          placeholder="Search name, initials, birthday, guardian…"
        />
        <div v-if="showSearch" class="roster-search-opts">
          <label>
            <input v-model="searchIncludeTerminated" type="checkbox" />
            Display terminated clients
          </label>
          <label>
            <input v-model="searchIncludePastYears" type="checkbox" />
            Display past school year clients
          </label>
        </div>
        <button
          v-for="client in sortedClients"
          :key="`ql-${client.id}`"
          type="button"
          class="roster-quicklist-row"
          :class="{ active: Number(client.id) === Number(overviewClient?.id) }"
          :disabled="!canOpenSchoolClient(client)"
          @click="openOverview(client)"
        >
          <span class="roster-quicklist-name">{{ formatRosterLabel(client) }}</span>
          <span class="roster-quicklist-meta">{{ formatOnboardingSummary(client) }}</span>
        </button>
      </aside>
      <SchoolClientOverviewPanel
        :client="overviewClient"
        :can-edit-action="canOpenMoreInfo"
        :school-organization-id="Number(overviewClient?.organization_id || organizationId)"
        :school-name="overviewClient.organization_name || organizationName"
        @close="closeOverview"
        @open-comments="(c) => openClient(c, 'comments')"
        @open-profile="goEdit"
      />
    </template>

    <div v-else class="clients-table-wrapper">
      <div v-if="showSearch" class="table-toolbar">
        <div v-if="showAttentionFilters" class="roster-toolbar-band">
          <div class="attention-filter-row">
            <button
              type="button"
              class="filter-pill"
              :class="{ active: !attentionFilterActive && !activeStatusFilterKey }"
              @click="setAttentionFilter(null)"
            >
              All
            </button>
            <button
              type="button"
              class="filter-pill filter-pill-attention"
              :class="{ active: attentionFilterActive }"
              @click="setAttentionFilter(attentionFilterActive ? null : 'needs_attention')"
            >
              Needs attention
              <span v-if="attentionSummary.total > 0" class="filter-pill-count">{{ attentionSummary.total }}</span>
            </button>
            <div
              class="waitlist-pill-wrap"
              data-tour="school-roster-waitlist"
              @mouseenter="showWaitlistAvailabilityAlert ? (waitlistAlertOpen = true) : null"
              @mouseleave="waitlistAlertOpen = false"
            >
              <button
                type="button"
                class="filter-pill waitlist-pill"
                :class="{ active: activeStatusFilterKey === 'waitlist' }"
                @click="setStatusFilter(activeStatusFilterKey === 'waitlist' ? '' : 'waitlist')"
              >
                Waitlist
                <span
                  v-if="showWaitlistAvailabilityAlert"
                  class="waitlist-pill-badge"
                  :aria-label="`${waitlistDisplayCount} waitlisted client${waitlistDisplayCount === 1 ? '' : 's'} in this school`"
                >
                  ! {{ waitlistDisplayCount }}
                </span>
              </button>
            </div>
          </div>

          <div
            v-if="showWaitlistAvailabilityAlert && waitlistAlertOpen"
            class="waitlist-alert-banner"
            role="status"
          >
            There are waitlisted clients. Contact admin if you have openings or
            <button type="button" class="inline-link-btn" @click.stop.prevent="openAvailabilityRequestFromWaitlist">
              update my availability
            </button>.
            For requesting a whole new day, use
            <a :href="additionalAvailabilityHref" @click.stop>Submit</a>.
          </div>

          <div
            v-if="activeStatusFilterKey !== 'waitlist'"
            class="unread-legend"
            aria-label="Unread bubble legend"
          >
            <div class="unread-legend-track">
              <div class="unread-legend-item">
                <span class="unread-badge unread-badge-comments unread-badge-legend" aria-hidden="true"></span>
                <span class="unread-legend-text">New comment(s)</span>
              </div>
              <div class="unread-legend-item">
                <span class="unread-badge unread-badge-messages unread-badge-legend" aria-hidden="true"></span>
                <span class="unread-legend-text">New message(s)</span>
              </div>
              <div class="unread-legend-item">
                <span class="unread-badge unread-badge-updates unread-badge-legend" aria-hidden="true"></span>
                <span class="unread-legend-text">New updates</span>
              </div>
              <div class="unread-legend-item">
                <span class="ticket-status-badge ticket-status-open ticket-status-legend" aria-hidden="true"></span>
                <span class="unread-legend-text">Ticket open</span>
              </div>
              <div class="unread-legend-item">
                <span class="ticket-status-badge ticket-status-answered ticket-status-legend" aria-hidden="true"></span>
                <span class="unread-legend-text">Ticket answered</span>
              </div>
              <div v-if="showAssignedColumn" class="unread-legend-item">
                <span class="newly-assigned-badge newly-assigned-badge-legend" aria-hidden="true">New</span>
                <span class="unread-legend-text">Assigned in last 7 days</span>
              </div>
            </div>
            <div class="unread-legend-hint">Click a bubble to open it.</div>
          </div>
        </div>
        <div v-if="(activeStatusFilterLabel || activeActionFilterLabel) && !showAttentionFilters" class="active-filter-row">
          <span v-if="activeStatusFilterLabel" class="active-filter-pill">Status: {{ activeStatusFilterLabel }}</span>
          <span v-if="activeActionFilterLabel" class="active-filter-pill">{{ activeActionFilterLabel }}</span>
          <button class="btn-link" type="button" @click="clearStatusFilter">Clear</button>
        </div>
        <div class="table-search-row">
          <div class="roster-search-box">
            <input
              v-model="searchQuery"
              class="table-search"
              type="search"
              placeholder="Search name, initials, birthday, guardian…"
            />
            <div class="roster-search-opts">
              <label>
                <input v-model="searchIncludeTerminated" type="checkbox" />
                Display terminated clients
              </label>
              <label>
                <input v-model="searchIncludePastYears" type="checkbox" />
                Display past school year clients
              </label>
            </div>
          </div>
          <label v-if="showTerminatedToggle" class="show-terminated-check">
            <input v-model="showTerminatedLocal" type="checkbox" />
            Show terminated
          </label>
        </div>
      </div>
      <div v-if="rosterRefreshing" class="roster-refresh-bar" role="status">
        {{ activeStatusFilterKey === 'waitlist' ? 'Loading waitlist…' : 'Refreshing roster…' }}
      </div>
      <div v-if="error && clients.length > 0" class="roster-inline-error">{{ error }}</div>
      <div v-if="clients.length === 0 && !rosterRefreshing" class="empty-state">
        <p>No clients found.</p>
      </div>
      <div v-else class="clients-table-scroll" :class="{ 'is-refreshing': rosterRefreshing }">
        <table class="clients-table">
        <thead>
          <tr>
            <th class="sortable" @click="toggleSort('initials')" role="button" tabindex="0">
              Client
              <span class="sort-indicator" v-if="sortKey === 'initials'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" data-tour="school-roster-waitlist" @click="toggleSort('status')" role="button" tabindex="0">
              Client Status
              <span class="sort-indicator" v-if="sortKey === 'status'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th
              v-if="showSchoolColumn"
              class="sortable"
              @click="toggleSort('organization_name')"
              role="button"
              tabindex="0"
            >
              School
              <span class="sort-indicator" v-if="sortKey === 'organization_name'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th
              v-if="showReadinessColumn"
              class="sortable"
              @click="toggleSort('document_status')"
              role="button"
              tabindex="0"
            >
              Readiness
              <span class="sort-indicator" v-if="sortKey === 'document_status'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th v-if="showLifecycleActionColumn" class="actions-col">
              Action / Next Step
            </th>
            <th
              v-if="rosterScope === 'school' && !isProviderUser"
              class="sortable"
              @click="toggleSort('provider_name')"
              role="button"
              tabindex="0"
            >
              Provider
              <span class="sort-indicator" v-if="sortKey === 'provider_name'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th v-else>
              ROI Status
            </th>
            <th class="sortable" @click="toggleSort('skills')" role="button" tabindex="0">
              Skills
              <span class="sort-indicator" v-if="sortKey === 'skills'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('service_day')" role="button" tabindex="0">
              Assigned Day
              <span class="sort-indicator" v-if="sortKey === 'service_day'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th
              v-if="showContinuationServicesColumn"
              class="sortable"
              @click="toggleSort('continuation_services')"
              role="button"
              tabindex="0"
            >
              Continuation of Services
              <span class="sort-indicator" v-if="sortKey === 'continuation_services'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th
              v-if="showPsychotherapyColumn"
              class="sortable"
              @click="toggleSort('psychotherapy_total')"
              role="button"
              tabindex="0"
            >
              Sessions FY
              <span class="sort-indicator" v-if="sortKey === 'psychotherapy_total'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th v-if="showRowActions" class="actions-col">Actions</th>
            <th
              v-if="showAssignedColumn"
              class="sortable"
              @click="toggleSort('provider_assigned_at')"
              role="button"
              tabindex="0"
            >
              Assigned
              <span class="sort-indicator" v-if="sortKey === 'provider_assigned_at'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
            <th class="sortable" @click="toggleSort('submission_date')" role="button" tabindex="0">
              Submission Date
              <span class="sort-indicator" v-if="sortKey === 'submission_date'">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="client in sortedClients"
            :key="client.id"
            class="client-row"
            :class="{
              'client-row-clickable': canOpenSchoolClient(client),
              'client-row-newly-assigned': isNewlyAssigned(client),
              'client-row-locked': isSchoolStaff && isSchoolClientLocked(client),
              'client-row-paper-packet-notice': isSchoolStaff && (client?.paper_packet_staff_roi_notice || client?.paper_packet_named_access_notice),
              'client-row-terminated': isClientTerminated(client)
            }"
            :role="canOpenSchoolClient(client) ? 'button' : undefined"
            :tabindex="canOpenSchoolClient(client) ? 0 : undefined"
            @click="handleRowActivate(client)"
            @keydown.enter.prevent="handleRowActivate(client)"
            @keydown.space.prevent="handleRowActivate(client)"
          >
            <td class="initials-cell">
              <div class="client-label">
                <button
                  class="initials initials-btn"
                  type="button"
                  :disabled="!canOpenSchoolClient(client)"
                  :title="canOpenSchoolClient(client) ? rosterLabelTitle(client) : lockedInitialsTitle(client)"
                  :data-locked-reason="!canOpenSchoolClient(client) ? lockedInitialsTitle(client) : ''"
                  @click.stop="openOverview(client)"
                >
                  {{ formatRosterLabel(client) }}
                </button>
                <span
                  v-if="isNewlyAssigned(client)"
                  class="newly-assigned-badge"
                  :title="`Assigned ${formatDate(client.provider_assigned_at)}`"
                >
                  New
                </span>
                <span
                  v-if="!isSchoolStaff && client.possible_name_duplicate"
                  class="name-duplicate-badge"
                  title="Another client at this school has the same first and last name"
                >
                  Possible duplicate
                </span>
                <span
                  v-if="client.paper_packet_staff_roi_notice"
                  class="paper-packet-staff-badge"
                  title="A printed referral packet was recently uploaded. If your name is on the signed form, you will receive access."
                >
                  Packet uploaded
                </span>
                <span
                  v-if="client.paper_packet_named_access_notice"
                  class="paper-packet-staff-badge"
                  title="You were named on a recently uploaded printed referral packet and now have access."
                >
                  Named on packet
                </span>
                <span
                  v-for="(ea, idx) in (client.event_assignments || [])"
                  :key="`ea-${client.id}-${ea.companyEventId}-${idx}`"
                  class="event-assignment-badge"
                  :class="{
                    'event-assignment-badge--ready': ea.intakeComplete && ea.treatmentPlanComplete,
                    'event-assignment-badge--pending': !(ea.intakeComplete && ea.treatmentPlanComplete)
                  }"
                  :title="eventAssignmentTitle(ea)"
                >
                  Event: {{ eventAssignmentLabel(ea) }}
                </span>
                <button
                  v-if="Number(client.open_ticket_count || 0) > 0"
                  class="ticket-status-badge ticket-status-open ticket-status-btn"
                  type="button"
                  :title="`Ticket open (${Number(client.open_ticket_count || 0)}) — click to open messages`"
                  @click.stop="openClient(client, 'messages')"
                >
                  Ticket Open {{ Number(client.open_ticket_count || 0) }}
                </button>
                <button
                  v-if="Number(client.answered_ticket_count || 0) > 0"
                  class="ticket-status-badge ticket-status-answered ticket-status-btn"
                  type="button"
                  :title="`Ticket answered (${Number(client.answered_ticket_count || 0)}) — click to open messages`"
                  @click.stop="openClient(client, 'messages')"
                >
                  Ticket Answered {{ Number(client.answered_ticket_count || 0) }}
                </button>
                <button
                  v-if="Number(client.unread_notes_count || 0) > 0"
                  class="unread-badge unread-badge-comments"
                  type="button"
                  :title="commentBadgeTitle(client)"
                  @click.stop="openClient(client, 'comments')"
                >
                  {{ commentBadgeCount(client) }}
                </button>
                <button
                  v-if="Number(client.unread_ticket_messages_count || 0) > 0"
                  class="unread-badge unread-badge-messages"
                  type="button"
                  :title="messageBadgeTitle(client)"
                  @click.stop="openClient(client, 'messages')"
                >
                  {{ messageBadgeCount(client) }}
                </button>
                <button
                  v-if="Number(client.unread_updates_count || 0) > 0"
                  class="unread-badge unread-badge-updates"
                  type="button"
                  :title="`${Number(client.unread_updates_count || 0)} new update(s) — click to open`"
                  @click.stop="openClientUpdates(client)"
                >
                  {{ Number(client.unread_updates_count || 0) }}
                </button>
              </div>
            </td>
            <td>
              <div class="status-cell">
                <span
                  :class="[
                    'status-badge',
                    `status-${String(client.client_status_key || 'unknown').toLowerCase().replace('_', '-')}`,
                    String(client.client_status_key || '').toLowerCase() === 'waitlist' ? 'status-waitlist' : '',
                    String(client.client_status_key || '').toLowerCase() === 'terminated' ? 'status-terminated' : ''
                  ]"
                  :style="isClientTerminated(client) ? { cursor: 'help' } : undefined"
                  :role="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? 'button' : undefined"
                  :tabindex="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? 0 : undefined"
                  :title="getStatusTitle(client)"
                  @mouseenter="onStatusHoverEnter(client, $event)"
                  @mouseleave="onStatusHoverLeave(client)"
                  @focus="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? onWaitlistHover(client, $event) : null"
                  @click.stop="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? openWaitlistNote(client) : null"
                  @keydown.enter.stop.prevent="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? openWaitlistNote(client) : null"
                  @keydown.space.stop.prevent="String(client.client_status_key || '').toLowerCase() === 'waitlist' ? openWaitlistNote(client) : null"
                >
                  {{ formatClientStatusLabel(client) }}
                </span>
                <span
                  v-if="String(client.client_status_key || '').toLowerCase() === 'waitlist' && client.waitlist_days !== null && client.waitlist_rank !== null"
                  class="waitlist-bubble"
                  :title="`Waitlisted ${client.waitlist_days} day(s) • Rank #${client.waitlist_rank}`"
                >
                  <span class="wl-left">{{ client.waitlist_days }}d</span>
                  <span class="wl-right">#{{ client.waitlist_rank }}</span>
                </span>
                <div
                  v-if="isSchoolStaff && showProviderMilestonesReadonly(client)"
                  class="muted"
                  style="font-size: 11px; margin-top: 4px;"
                >
                  {{ providerMilestonesLabel(client) }}
                </div>
              </div>
            </td>
            <td v-if="showSchoolColumn">{{ client.organization_name || organizationName || '—' }}</td>
            <td v-if="showReadinessColumn">
              <button
                type="button"
                class="btn-link onboarding-status-link"
                title="Open readiness checklist"
                @click.stop="openOnboardingChecklist(client)"
              >
                {{ formatOnboardingSummary(client) }}
              </button>
            </td>
            <td v-if="showLifecycleActionColumn">
              <div class="roster-action-stack">
              <button
                v-if="lifecycleActionFor(client)"
                type="button"
                class="roster-action-btn"
                :class="{
                  'roster-action-btn--accent': !lifecycleActionFor(client).quiet,
                  'roster-action-btn--pulse': !lifecycleActionFor(client).quiet
                }"
                :title="lifecycleActionFor(client).label"
                :disabled="!canClickLifecycleAction"
                @click.stop="canClickLifecycleAction && openLifecycleAction(client)"
              >
                {{ lifecycleActionFor(client).label }}
              </button>
              <button
                v-if="lifecycleViewFor(client)"
                type="button"
                class="roster-action-btn roster-action-btn--ghost"
                title="View last submission"
                :disabled="!canClickLifecycleAction"
                @click.stop="canClickLifecycleAction && openLifecycleView(client)"
              >
                View
              </button>
              <span v-if="!lifecycleActionFor(client) && !lifecycleViewFor(client)" class="muted">—</span>
              </div>
            </td>
            <td v-if="rosterScope === 'school' && !isProviderUser">{{ client.provider_name || '—' }}</td>
            <td v-else>
              <button
                class="btn-link roi-status-link"
                type="button"
                title="View ROI status details"
                @click.stop="openRoiStatus(client)"
              >
                {{ roiStatusLabel(client) }}
              </button>
              <div class="roi-status-hint">{{ roiStatusDateHint(client) }}</div>
            </td>
            <td>{{ client.skills ? 'Yes' : 'No' }}</td>
            <td>
              <button
                v-if="canEditAssignedDay(client)"
                type="button"
                class="btn-link assigned-day-btn"
                :title="assignedDayButtonTitle(client)"
                @click.stop="openAssignDay(client)"
              >
                {{ formatAssignedDayLabel(client) }}
              </button>
              <span v-else>{{ formatAssignedDayLabel(client) }}</span>
            </td>
            <td v-if="showContinuationServicesColumn" class="continuation-cell">
              <button
                v-if="client.user_is_assigned_provider"
                type="button"
                class="btn-link continuation-link"
                :class="{ 'continuation-link-needed': !hasContinuationServices(client) }"
                @click.stop="openQuickChecklist(client)"
              >
                {{ continuationServicesSummary(client) }}
              </button>
              <span v-else>{{ continuationServicesSummary(client) }}</span>
            </td>
            <td v-if="showPsychotherapyColumn" class="psy-cell">
              <span
                class="psy-pill"
                :class="{ 'psy-pill-alert': (psychotherapyCell(client).total || 0) >= 20 }"
                :title="psychotherapyCell(client).title"
              >
                {{ psychotherapyCell(client).total ?? '—' }}
              </span>
            </td>
            <td v-if="showRowActions" class="actions-col">
              <div class="roster-row-actions">
                <button
                  type="button"
                  class="roster-action-btn"
                  :disabled="isClientTerminated(client) || (isSchoolStaff && !canOpenSchoolClient(client))"
                  :title="isClientTerminated(client)
                    ? lockedClientTitle(client)
                    : (isSchoolStaff && !canOpenSchoolClient(client) ? lockedClientTitle(client) : 'Open comments and messages')"
                  @click.stop="openClient(client)"
                >
                  {{ isSchoolStaff && !canOpenSchoolClient(client) ? lockedClientButtonLabel(client) : 'Comments' }}
                </button>
                <button
                  v-if="showChecklistButton && client.user_is_assigned_provider"
                  type="button"
                  class="roster-action-btn roster-action-btn--accent"
                  title="Open compliance checklist"
                  @click.stop="openQuickChecklist(client)"
                >
                  Checklist
                </button>
                <button
                  v-if="showTerminateButton && client.user_is_assigned_provider && !isClientTerminated(client)"
                  type="button"
                  class="roster-action-btn roster-action-btn--danger"
                  title="Mark this client as terminated"
                  @click.stop="openTerminateModal(client)"
                >
                  Terminate
                </button>
                <button
                  v-if="canOpenMoreInfo"
                  type="button"
                  class="roster-action-btn"
                  title="Open full client profile"
                  @click.stop="goEdit(client)"
                >
                  Profile
                </button>
              </div>
            </td>
            <td v-if="showAssignedColumn">{{ formatDate(client.provider_assigned_at) }}</td>
            <td>{{ formatDate(client.submission_date) }}</td>
          </tr>
        </tbody>
        </table>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="floatingTooltip"
        class="waitlist-tooltip waitlist-tooltip-floating"
        :style="floatingTooltipStyle"
        role="tooltip"
      >
        <div class="waitlist-tooltip-title">{{ floatingTooltip.title }}</div>
        <div class="waitlist-tooltip-body">{{ floatingTooltip.body }}</div>
      </div>
    </Teleport>

    <SchoolClientChatModal
      v-if="selectedClient"
      :client="selectedClient"
      :schoolOrganizationId="selectedClient?.organization_id || organizationId"
      :organization-slug="organizationSlug"
      :parent-agency-id="parentAgencyId || null"
      :initial-pane="selectedClientInitialPane"
      :can-edit-action="canOpenMoreInfo"
      :show-checklist-action="isNewClientActionClient(selectedClient) && !!selectedClient?.user_is_assigned_provider && !previewMode"
      @open-edit="openClientEditorFromModal"
      @open-checklist="openChecklistFromModal"
      @client-updated="onClientUpdatedFromModal"
      @close="selectedClient = null; selectedClientInitialPane = null"
    />

    <WaitlistNoteModal
      v-if="waitlistClient"
      :org-key="waitlistOrgKey(waitlistClient)"
      :client="waitlistClient"
      :client-label-mode="clientLabelMode"
      @saved="onWaitlistSaved"
      @close="waitlistClient = null"
    />

    <AssignDayModal
      v-if="assignDayClient && assignDayProviderUserId && assignDayOrgId"
      :organization-id="assignDayOrgId"
      :client="assignDayClient"
      :provider-user-id="assignDayProviderUserId"
      :client-label-mode="clientLabelMode"
      @updated="onAssignDayUpdated"
      @close="closeAssignDay"
    />

    <QuickChecklistModal
      v-if="quickChecklistClient"
      :client="quickChecklistClient"
      :parent-agency-id="parentAgencyId"
      :view-only="quickChecklistViewOnly"
      @close="quickChecklistClient = null; quickChecklistViewOnly = false"
      @saved="onQuickChecklistSaved"
    />

    <LifecycleActionModal
      v-if="lifecycleActionClient && lifecycleActionKey"
      :client="lifecycleActionClient"
      :action-key="lifecycleActionKey"
      :action-label="lifecycleActionLabel"
      :view-only="lifecycleActionViewOnly"
      @close="closeLifecycleAction"
      @saved="onLifecycleActionSaved"
    />

    <div
      v-if="onboardingChecklistClient"
      class="modal-overlay"
      style="z-index: 10000;"
      @click.self="onboardingChecklistClient = null"
    >
      <ClientOnboardingChecklistPanel
        as-modal
        :client-id="onboardingChecklistClient.id"
        :client-label="formatRosterLabel(onboardingChecklistClient)"
        :can-edit-docs="!isSchoolStaff"
        @close="onboardingChecklistClient = null"
        @updated="onOnboardingChecklistUpdated"
      />
    </div>

    <div v-if="roiStatusModalClient" class="modal-overlay" style="z-index: 10000;" @click.self="closeRoiStatusModal">
      <div class="modal-content" style="max-width: 920px;" @click.stop>
        <div class="modal-header">
          <h3 style="margin: 0;">ROI Status</h3>
          <button type="button" class="btn-close" @click="closeRoiStatusModal">×</button>
        </div>
        <div class="hint" style="margin-top: 0; margin-bottom: 10px;">
          {{ roiStatusModalClient?.initials || roiStatusModalClient?.identifier_code || `Client #${roiStatusModalClient?.id || ''}` }}
          · {{ roiStatusData.schoolName || roiStatusModalClient?.organization_name || 'School' }}
        </div>

        <div v-if="roiStatusLoading" class="loading-state" style="padding: 20px 0;">
          <p>Loading ROI status…</p>
        </div>
        <div v-else-if="roiStatusError" class="error-state" style="padding: 20px 0;">
          <p>{{ roiStatusError }}</p>
        </div>
        <div v-else>
          <div class="roi-summary-grid">
            <div class="roi-summary-card">
              <div class="roi-summary-label">ROI expiration date</div>
              <div class="roi-summary-value">{{ formatDate(roiStatusData.roiExpiresAt) }}</div>
            </div>
            <div class="roi-summary-card">
              <div class="roi-summary-label">Portal state</div>
              <div class="roi-summary-value">{{ roiStatusData.roiExpired ? 'Expired / blocked' : 'Date active' }}</div>
            </div>
          </div>

          <div v-if="!(roiStatusData.staff || []).length" class="muted" style="margin-top: 10px;">
            No active school staff found for this school.
          </div>
          <div v-else class="clients-table-scroll" style="margin-top: 10px;">
            <table class="clients-table">
              <thead>
                <tr>
                  <th>School Staff</th>
                  <th>Status with Client</th>
                  <th>Last Packet Upload</th>
                  <th>Last ROI Grant</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in roiStatusData.staff" :key="row.school_staff_user_id">
                  <td>{{ roiStaffName(row) }}</td>
                  <td :title="roiStaffStateHover(row)">{{ roiStaffStateLabel(row) }}</td>
                  <td>{{ formatDateTime(row.last_packet_uploaded_at) }}</td>
                  <td>{{ formatDateTime(row.granted_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div v-if="terminateModalClient" class="modal-overlay" style="z-index: 10000;" @click.self="terminateModalClient = null">
      <div class="modal-content" style="max-width: 480px;" @click.stop>
        <div class="modal-header">
          <h3 style="margin: 0;">Mark as Terminated</h3>
          <button type="button" class="btn-close" @click="terminateModalClient = null">×</button>
        </div>
        <p class="hint" style="margin-top: 0;">A termination reason is required. This will move the client to Terminated status and notify support staff and school staff.</p>
        <label class="required">Termination reason</label>
        <textarea
          v-model="terminateReasonDraft"
          rows="4"
          placeholder="Explain why this client was terminated…"
          class="inline-input"
          style="width: 100%; margin-top: 6px; margin-bottom: 8px;"
        />
        <div class="form-actions" style="justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn btn-secondary" @click="terminateModalClient = null">Cancel</button>
          <button type="button" class="btn btn-danger" @click="submitTerminate" :disabled="terminateSaving || !String(terminateReasonDraft || '').trim()">
            {{ terminateSaving ? 'Terminating…' : 'Mark as Terminated' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import SchoolClientChatModal from './SchoolClientChatModal.vue';
import SchoolClientOverviewPanel from './SchoolClientOverviewPanel.vue';
import WaitlistNoteModal from './WaitlistNoteModal.vue';
import QuickChecklistModal from './QuickChecklistModal.vue';
import AssignDayModal from './AssignDayModal.vue';
import ClientOnboardingChecklistPanel from '../clients/ClientOnboardingChecklistPanel.vue';
import LifecycleActionModal from './LifecycleActionModal.vue';
import { formatOnboardingSummary } from '../../utils/clientOnboardingSummary.js';
import { displaySchoolClientStatusLabel } from '../../utils/schoolClientStatusDisplay.js';
import { useAuthStore } from '../../store/auth';
import {
  isSchoolScheduleClientLocked,
  schoolStaffRoiHover,
  schoolStaffRoiLabel
} from '../../utils/schoolStaffRoiLabels.js';

const props = defineProps({
  organizationSlug: {
    type: String,
    required: true
  },
  organizationId: {
    type: Number,
    default: null
  },
  rosterScope: {
    type: String,
    default: 'school' // 'school' | 'provider'
  },
  /** When rosterScope is provider, load roster for this user (admin profile view). */
  rosterProviderUserId: {
    type: Number,
    default: null
  },
  clientLabelMode: {
    type: String,
    default: 'initials' // 'initials' (default) | 'full_name' | 'codes' (secondary)
  },
  editMode: {
    type: String,
    default: 'navigate' // 'navigate' | 'inline'
  },
  showSearch: {
    type: Boolean,
    default: true
  },
  searchPlaceholder: {
    type: String,
    default: 'Search roster…'
  },
  psychotherapyTotalsByClientId: {
    // { [clientId]: { total: number, per_code: { [code]: number }, client_abbrev?: string, surpassed_24?: boolean } }
    type: Object,
    default: null
  },
  /** When true, hide clients with client_status_key === terminated */
  hideTerminated: {
    type: Boolean,
    default: false
  },
  /** Roster toolbar checkbox. Parent toggles (e.g. dashboard) can turn this off. */
  showTerminatedToggle: {
    type: Boolean,
    default: true
  },
  /** Display name for the current school/program (shown instead of Assigned Provider). */
  organizationName: {
    type: String,
    default: ''
  },
  /** Affiliated parent agency id (Skill Builders / school portal extras). */
  parentAgencyId: {
    type: Number,
    default: null
  },
  /** Optional school year filter: 'current', 'all', or YYYY-YYYY (passed to school-portal API). */
  schoolYearFilter: {
    type: String,
    default: ''
  },
  /**
   * Optional roster status filter (client_status_key), e.g. 'pending' or 'waitlist'.
   * When set, the grid will only show clients matching the filter.
   */
  statusFilterKey: {
    type: String,
    default: ''
  },
  /**
   * Optional roster action filter (fall_confirmation, agency_insurance, new_client, …).
   * When set, the grid will only show clients matching that lifecycle action.
   */
  actionFilterKey: {
    type: String,
    default: ''
  },
  /**
   * When provided (array), use this list instead of fetching. Used for "All schools" merged roster.
   */
  clientsOverride: {
    type: Array,
    default: null
  },
  /**
   * Optional school-wide waitlist count for provider waitlist alert bubble.
   */
  waitlistSchoolCount: {
    type: Number,
    default: null
  },
  /** Provider my-roster: limit to Skill Builders group clients where user is assigned (requires SB-eligible user). */
  skillBuildersOnly: {
    type: Boolean,
    default: false
  },
  /** school-chat (default) opens SchoolClientChatModal; detail-panel emits open-profile for parent overlay. */
  clientOpenMode: {
    type: String,
    default: 'school-chat'
  },
  /**
   * Preview mode for superadmin: 'school_staff' | 'provider' | '' (real role).
   * Does not change API auth — only presentation of columns/actions.
   */
  viewAsRole: {
    type: String,
    default: ''
  },
  /** When true, hide interactive row actions (preview panes). */
  previewMode: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['edit-client', 'update:statusFilterKey', 'update:actionFilterKey', 'update:needsAttentionCount', 'open-availability-request', 'open-profile']);

const clients = ref([]);
const loading = ref(false);
const rosterRefreshing = ref(false);
const error = ref('');
const selectedClient = ref(null);
const selectedClientInitialPane = ref(null); // null | 'comments' | 'messages'
const overviewClient = ref(null);
const roiStatusModalClient = ref(null);
const roiStatusLoading = ref(false);
const roiStatusError = ref('');
const roiStatusData = ref({
  roiExpiresAt: null,
  roiExpired: true,
  schoolName: '',
  staff: []
});
const waitlistClient = ref(null);
const assignDayClient = ref(null);
const assignDayProviderUserId = ref(null);
const assignDayOrgId = ref(null);
const searchQuery = ref('');
const searchIncludeTerminated = ref(false);
const searchIncludePastYears = ref(false);
const showTerminatedLocal = ref(true);
const router = useRouter();
const authStore = useAuthStore();

const canEditClients = ref(false);
const canOpenMoreInfo = computed(() => {
  if (isSchoolStaff.value) return canEditClients.value;
  if (props.rosterScope === 'provider') return !props.previewMode;
  return canEditClients.value;
});
const quickChecklistClient = ref(null);
const quickChecklistViewOnly = ref(false);
const lifecycleActionClient = ref(null);
const lifecycleActionKey = ref('');
const lifecycleActionLabel = ref('');
const lifecycleActionViewOnly = ref(false);
const onboardingChecklistClient = ref(null);
const terminateModalClient = ref(null);
const terminateReasonDraft = ref('');
const terminateSaving = ref(false);
const effectiveViewerRole = computed(() => {
  const preview = String(props.viewAsRole || '').toLowerCase();
  if (preview === 'school_staff' || preview === 'provider') return preview;
  return String(authStore.user?.role || '').toLowerCase();
});
const isSchoolStaff = computed(() => effectiveViewerRole.value === 'school_staff');
const isProviderUser = computed(() => {
  const r = effectiveViewerRole.value;
  return r === 'provider' || r === 'provider_plus' || r === 'intern' || r === 'intern_plus' || r === 'clinical_practice_assistant';
});
const canClickLifecycleAction = computed(() => {
  if (!props.previewMode) return true;
  const role = String(authStore.user?.role || '').toLowerCase();
  return props.viewAsRole === 'provider'
    && ['super_admin', 'admin', 'support'].includes(role);
});
const isSchoolClientLocked = (client) => {
  if (!isSchoolStaff.value) return false;
  return isSchoolScheduleClientLocked(client);
};
const canOpenSchoolClient = (client) => {
  if (isClientTerminated(client)) return false;
  return !isSchoolClientLocked(client) && !props.previewMode;
};
const isNewClientActionClient = (client) => {
  const actionKey = String(
    client?.lifecycle_action?.actionKey || client?.provider_action_key || ''
  ).toLowerCase();
  return actionKey === 'provider_intake';
};
/** Standalone Checklist is retired — new clients use Action / Next Step. */
const showChecklistButton = computed(() => false);
/** Readiness retired — everyone uses Status + role-specific Actions. */
const showReadinessColumn = computed(() => false);
/** Provider/agency Action column (school staff never get Action buttons). */
const showLifecycleActionColumn = computed(() => {
  if (isSchoolStaff.value) return false;
  const r = effectiveViewerRole.value;
  return [
    'provider',
    'provider_plus',
    'intern',
    'intern_plus',
    'admin',
    'support',
    'staff',
    'super_admin',
    'clinical_practice_assistant'
  ].includes(r);
});
const showProviderMilestonesReadonly = (client) => {
  const key = String(client?.client_status_key || '').toLowerCase();
  return key === 'ready_to_schedule' || key === 'scheduled' || key === 'onboarded' || key === 'needs_day_assignment';
};
const providerMilestonesLabel = (client) => {
  const m = client?.provider_milestones || {};
  const contact = (m.parents_contacted || client?.parents_contacted_at) ? 'Contact ✓' : 'Contact —';
  const intake = (m.intake_done || client?.intake_at) ? 'Intake ✓' : 'Intake —';
  const first = (m.first_service_done || client?.services_started_at || client?.first_service_at)
    ? 'First service ✓'
    : 'First service —';
  return `${contact} · ${intake} · ${first}`;
};
const showTerminateButton = computed(() => props.rosterScope === 'provider');
const showAssignedColumn = computed(() => props.rosterScope === 'provider');
/** Only show school column when the roster spans multiple schools (e.g. All schools view). */
const showSchoolColumn = computed(() => {
  if (props.rosterScope !== 'provider') return false;
  const rows = Array.isArray(props.clientsOverride) ? props.clientsOverride : clients.value;
  const orgIds = new Set((rows || []).map((c) => Number(c?.organization_id)).filter(Boolean));
  return orgIds.size > 1;
});
const showRowActions = computed(() => true);
const showContinuationServicesColumn = computed(() => false);

const orgKey = computed(() => {
  // school roster expects numeric org id; provider roster may only have slug.
  const v = props.organizationId ? String(props.organizationId) : String(props.organizationSlug || '').trim();
  return v || '';
});

const waitlistOrgKey = (client) => orgKey.value || String(client?.organization_id || '').trim();

// Waitlist note hover caching: clientId -> message
const waitlistNoteByClientId = ref({});
const waitlistNoteLoadingByClientId = ref({});
const hoveredWaitlistClientId = ref('');
const hoveredTerminatedClientId = ref('');
const floatingTooltip = ref(null);

const floatingTooltipStyle = computed(() => {
  if (!floatingTooltip.value) return {};
  return {
    top: `${floatingTooltip.value.top}px`,
    left: `${floatingTooltip.value.left}px`,
    width: `${floatingTooltip.value.width}px`
  };
});

const positionFloatingTooltip = (target, title, body) => {
  const el = target?.$el || target;
  const rect = el?.getBoundingClientRect?.();
  if (!rect) return;
  const width = Math.min(320, Math.max(220, window.innerWidth - 24));
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
  const belowTop = rect.bottom + 8;
  const aboveTop = rect.top - 8;
  const estimatedHeight = 96;
  const top =
    belowTop + estimatedHeight > window.innerHeight - 12 && aboveTop - estimatedHeight > 12
      ? aboveTop - estimatedHeight
      : belowTop;
  floatingTooltip.value = { title, body, top, left, width };
};

const hideFloatingTooltip = () => {
  floatingTooltip.value = null;
};

const onTerminatedHover = (client, event) => {
  if (String(client?.client_status_key || '').toLowerCase() !== 'terminated') return;
  const cid = String(client?.id || '');
  const body = String(
    client?.fall_status_hover || client?.termination_reason || 'Terminated'
  ).trim();
  if (!cid || !body) return;
  hoveredTerminatedClientId.value = cid;
  positionFloatingTooltip(event?.currentTarget, 'Termination reason', body);
};

const onFallStatusHover = (client, event) => {
  const key = String(client?.client_status_key || '').toLowerCase();
  if (!['confirmation_pending', 'unable_to_reach', 'other_transfer'].includes(key)) return;
  const body = fallHoverBody(client);
  if (!body) return;
  positionFloatingTooltip(event?.currentTarget, 'Fall confirmation', body);
};

const onStatusHoverEnter = (client, event) => {
  const key = String(client?.client_status_key || '').toLowerCase();
  if (key === 'waitlist') return onWaitlistHover(client, event);
  if (key === 'terminated') return onTerminatedHover(client, event);
  return onFallStatusHover(client, event);
};

const onStatusHoverLeave = (client) => {
  const key = String(client?.client_status_key || '').toLowerCase();
  if (key === 'waitlist') hoveredWaitlistClientId.value = '';
  if (key === 'terminated') hoveredTerminatedClientId.value = '';
  hideFloatingTooltip();
};
const isClientTerminated = (client) => String(client?.client_status_key || '').toLowerCase() === 'terminated';

const getStatusTitle = (client) => {
  const key = String(client?.client_status_key || '').toLowerCase();
  if (key === 'waitlist') {
    const cached = waitlistNoteByClientId.value?.[String(client?.id || '')] || '';
    return cached ? `Waitlist reason: ${cached}` : 'Hover for waitlist reason';
  }
  const fallHover = fallHoverBody(client);
  if (fallHover) return fallHover;
  if (key === 'confirmed_returning') return 'Agency clearance pending';
  if (key === 'terminated') {
    const reason = String(client?.termination_reason || '').trim();
    return reason ? `Termination reason: ${reason}` : 'Terminated — hover for details';
  }
  return '';
};
const getWaitlistTitle = (client) => {
  if (String(client?.client_status_key || '').toLowerCase() !== 'waitlist') return '';
  const cached = waitlistNoteByClientId.value?.[String(client?.id || '')] || '';
  if (cached) return `Waitlist reason: ${cached}`;
  return 'Waitlist reason: (hover to load)';
};

const ensureWaitlistNoteLoaded = async (client) => {
  try {
    const org = orgKey.value || String(client?.organization_id || '').trim();
    if (!org) return;
    const cid = Number(client?.id || 0);
    if (!cid) return;
    const key = String(cid);
    if (waitlistNoteByClientId.value?.[key]) return;
    if (waitlistNoteLoadingByClientId.value?.[key]) return;
    waitlistNoteLoadingByClientId.value = { ...(waitlistNoteLoadingByClientId.value || {}), [key]: true };
    const r = await api.get(
      `/school-portal/${encodeURIComponent(org)}/clients/${cid}/waitlist-note`,
      { skipGlobalLoading: true, timeout: 8000 }
    );
    const msg = String(r.data?.note?.message || '').trim();
    waitlistNoteByClientId.value = { ...(waitlistNoteByClientId.value || {}), [key]: msg || '(no note yet)' };
  } catch {
    // ignore hover load failures (non-blocking)
  } finally {
    try {
      const cid = Number(client?.id || 0);
      if (!cid) return;
      const key = String(cid);
      const next = { ...(waitlistNoteLoadingByClientId.value || {}) };
      delete next[key];
      waitlistNoteLoadingByClientId.value = next;
    } catch {
      // ignore
    }
  }
};

const onWaitlistHover = (client, event) => {
  const cid = String(client?.id || '');
  if (!cid) return;
  hoveredWaitlistClientId.value = cid;
  ensureWaitlistNoteLoaded(client);
  positionFloatingTooltip(event?.currentTarget, 'Waitlist reason', waitlistTooltipText(client));
};

watch(
  () => [hoveredWaitlistClientId.value, waitlistNoteByClientId.value, waitlistNoteLoadingByClientId.value],
  () => {
    if (!hoveredWaitlistClientId.value || !floatingTooltip.value) return;
    if (floatingTooltip.value.title !== 'Waitlist reason') return;
    const client = (clients.value || []).find((c) => String(c?.id) === hoveredWaitlistClientId.value);
    if (!client) return;
    floatingTooltip.value = {
      ...floatingTooltip.value,
      body: waitlistTooltipText(client)
    };
  },
  { deep: true }
);

const waitlistTooltipText = (client) => {
  const key = String(client?.id || '');
  if (!key) return '';
  if (waitlistNoteLoadingByClientId.value?.[key]) return 'Loading…';
  return waitlistNoteByClientId.value?.[key] || '(no note yet)';
};

const PROVIDER_SORT_STORAGE_KEY = 'providerClientListSort.v1';
const loadStoredSort = () => {
  try {
    const raw = window?.localStorage?.getItem?.(PROVIDER_SORT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.key && typeof parsed.key === 'string') sortKey.value = parsed.key;
    if (parsed?.dir === 'asc' || parsed?.dir === 'desc') sortDir.value = parsed.dir;
    if (parsed?.key) columnSortActive.value = true;
  } catch {
    // ignore
  }
};
const saveSort = () => {
  try {
    if (props.rosterScope !== 'provider') return;
    window?.localStorage?.setItem?.(
      PROVIDER_SORT_STORAGE_KEY,
      JSON.stringify({ key: sortKey.value, dir: sortDir.value })
    );
  } catch {
    // ignore
  }
};

const sortKey = ref('submission_date');
const sortDir = ref('desc');
const columnSortActive = ref(false);
const waitlistAlertOpen = ref(false);

const showPsychotherapyColumn = computed(() => !!props.psychotherapyTotalsByClientId);

const useClientsOverride = () => Array.isArray(props.clientsOverride);

const fetchClients = async () => {
  if (useClientsOverride()) return;
  // School roster requires a numeric org id.
  // Provider "My roster" can fall back to using the org slug (more robust across contexts).
  if (!props.organizationId && props.rosterScope !== 'provider') {
    loading.value = false;
    error.value = 'Organization ID is required';
    return;
  }

  loading.value = true;
  error.value = '';
  const keepVisibleShell = clients.value.length > 0;
  if (keepVisibleShell) {
    loading.value = false;
    rosterRefreshing.value = true;
  }

  try {
    const orgKey =
      props.rosterScope === 'provider'
        ? (props.organizationId ? String(props.organizationId) : String(props.organizationSlug || '').trim())
        : String(props.organizationId);

    if (!orgKey) {
      clients.value = [];
      error.value = 'Organization not loaded.';
      return;
    }

    const endpoint =
      props.rosterScope === 'provider'
        ? `/school-portal/${encodeURIComponent(orgKey)}/my-roster`
        : `/school-portal/${encodeURIComponent(orgKey)}/clients`;
    const params = {};
    if (props.rosterScope === 'provider' && props.skillBuildersOnly) {
      params.skillBuildersOnly = true;
    }
    const statusKey = showAttentionFilters.value
      ? normalize(localStatusFilterKey.value)
      : normalize(props.statusFilterKey);
    if (props.rosterScope === 'provider' && statusKey === 'waitlist') {
      params.view = 'waitlist';
    }
    const rosterUid = Number(props.rosterProviderUserId || 0);
    const meId = Number(authStore.user?.id || 0);
    if (props.rosterScope === 'provider' && rosterUid > 0 && rosterUid !== meId) {
      params.providerUserId = rosterUid;
    }
    const syFilter = String(props.schoolYearFilter || '').trim();
    if (syFilter) {
      params.schoolYear = syFilter === 'current' ? 'current' : syFilter;
    }
    const q = String(searchQuery.value || '').trim();
    if (q) {
      params.q = q;
      if (searchIncludeTerminated.value) params.includeTerminated = true;
      if (searchIncludePastYears.value) params.includePastYears = true;
    }
    const response = await api.get(endpoint, { params });
    clients.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch clients:', err);
    if (err.response?.status === 404) {
      error.value = 'Organization not found.';
    } else if (err.response?.status === 403) {
      const r = String(authStore.user?.role || '').toLowerCase();
      error.value =
        props.rosterScope === 'provider' || r === 'provider'
          ? 'Your roster is not available for this organization.'
          : 'You do not have access to this school\'s client list.';
    } else {
      error.value = 'Failed to load students. Please try again later.';
    }
    clients.value = [];
  } finally {
    loading.value = false;
    rosterRefreshing.value = false;
  }
};

const fetchEditPermissions = async () => {
  if (!props.organizationId) {
    canEditClients.value = false;
    return;
  }
  try {
    const r = await api.get(`/school-portal/${props.organizationId}/affiliation`);
    canEditClients.value = !!r.data?.can_edit_clients;
  } catch {
    canEditClients.value = false;
  }
};

const toggleSort = (key) => {
  columnSortActive.value = true;
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = key === 'submission_date' || key === 'provider_assigned_at' ? 'desc' : 'asc';
  }
  saveSort();
};

const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const shortDayToken = (day) => {
  const map = {
    Monday: 'Mon',
    Tuesday: 'Tue',
    Wednesday: 'Wed',
    Thursday: 'Thu',
    Friday: 'Fri'
  };
  return map[String(day)] || String(day || '').slice(0, 3);
};

/** Parse "id:Name:Monday|id:Name:|id2:Other:Tuesday" into per-provider day labels. */
const parseProviderDayPairs = (client) => {
  const raw = String(client?.provider_day_pairs || '').trim();
  if (!raw) return [];
  const byProvider = new Map();
  for (const part of raw.split('|')) {
    const bits = String(part || '').split(':');
    if (bits.length < 2) continue;
    const id = parseInt(bits[0], 10);
    if (!id) continue;
    const day = String(bits[bits.length - 1] || '').trim();
    const name = bits.slice(1, -1).join(':').trim() || `Provider ${id}`;
    if (!byProvider.has(id)) {
      byProvider.set(id, { id, name, days: [] });
    }
    if (day && !byProvider.get(id).days.includes(day)) {
      byProvider.get(id).days.push(day);
    }
  }
  return Array.from(byProvider.values());
};

const formatAssignedDayLabel = (client) => {
  const hasProvider =
    Boolean(String(client?.provider_name || '').trim()) ||
    resolveProviderIdsForClient(client).length > 0;
  const pairs = parseProviderDayPairs(client);
  if (pairs.length > 1) {
    return pairs
      .map((p) => {
        const first = String(p.name || '').split(/\s+/)[0] || 'Provider';
        const days = (p.days || []).map(shortDayToken).join(', ');
        return `${first}: ${days || 'Unknown'}`;
      })
      .join(' · ');
  }
  if (pairs.length === 1) {
    const days = (pairs[0].days || []).map(shortDayToken).join(', ');
    return days || 'Unknown';
  }
  const raw = String(client?.service_day || '').trim();
  if (!raw) return hasProvider ? 'Unknown' : '—';
  return raw
    .split(',')
    .map((d) => shortDayToken(d.trim()))
    .filter(Boolean)
    .join(', ') || (hasProvider ? 'Unknown' : '—');
};

const resolveProviderIdsForClient = (client) => {
  const ids = [];
  const raw = String(client?.provider_ids || '').trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const n = parseInt(String(part).trim(), 10);
      if (n) ids.push(n);
    }
  }
  const legacy = parseInt(client?.provider_id, 10);
  if (legacy && !ids.includes(legacy)) ids.unshift(legacy);
  return ids;
};

const resolveProviderUserIdForClient = (client) => {
  const ids = resolveProviderIdsForClient(client);
  if (!ids.length) return null;
  const me = parseInt(authStore.user?.id, 10);
  if (me && ids.includes(me)) return me;
  return ids[0] || null;
};

const canEditAssignedDay = (client) => {
  if (isClientTerminated(client)) return false;
  if (!client?.id) return false;
  const orgId = Number(client?.organization_id || props.organizationId || 0);
  if (!orgId) return false;
  // Need a provider on the row (by id or name) to know whose work days to show.
  const hasProvider =
    !!resolveProviderUserIdForClient(client) || !!String(client?.provider_name || '').trim();
  if (!hasProvider) return false;
  const role = String(authStore.user?.role || '').toLowerCase();
  if (['super_admin', 'admin', 'support', 'staff', 'school_staff'].includes(role)) return true;
  if (canEditClients.value) return true;
  if (role === 'provider' || role === 'provider_plus' || role === 'intern' || role === 'intern_plus' || role === 'clinical_practice_assistant') {
    return (
      !!client.user_is_assigned_provider ||
      resolveProviderIdsForClient(client).includes(parseInt(authStore.user?.id, 10))
    );
  }
  return false;
};

const assignedDayButtonTitle = (client) => {
  if (!resolveProviderUserIdForClient(client) && !String(client?.provider_name || '').trim()) {
    return 'Assign a provider before setting a day';
  }
  return client?.service_day
    ? 'Edit assigned day / soft schedule slot'
    : 'Assign day (provider work days)';
};

const openAssignDay = (client) => {
  let providerUserId = resolveProviderUserIdForClient(client);
  const orgId = Number(client?.organization_id || props.organizationId || 0);
  if (!orgId) return;
  // If roster stripped provider ids but name is present, still open — modal will error clearly.
  if (!providerUserId) {
    // Last resort: assigned provider viewing their own roster row.
    const me = parseInt(authStore.user?.id, 10);
    if (client?.user_is_assigned_provider && me) providerUserId = me;
  }
  if (!providerUserId) return;
  assignDayClient.value = client;
  assignDayProviderUserId.value = providerUserId;
  assignDayOrgId.value = orgId;
};

const closeAssignDay = () => {
  assignDayClient.value = null;
  assignDayProviderUserId.value = null;
  assignDayOrgId.value = null;
};

const onAssignDayUpdated = async ({ clientId, providers: providerList }) => {
  const cid = Number(clientId || 0);
  if (!cid) return;

  // Prefer a full roster refresh so multi-provider day labels stay accurate.
  if (!useClientsOverride()) {
    try {
      await fetchClients();
      return;
    } catch {
      // fall through to local merge
    }
  }

  const list = Array.isArray(providerList) ? providerList : [];
  const dayLabel = list
    .flatMap((p) => (Array.isArray(p.assigned_days) ? p.assigned_days : []))
    .filter(Boolean);
  const uniqueDays = [...new Set(dayLabel)];
  const pairs = list
    .map((p) => {
      const pid = Number(p.provider_user_id || 0);
      if (!pid) return null;
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || `Provider ${pid}`;
      const days = Array.isArray(p.assigned_days) ? p.assigned_days : [];
      if (!days.length) return `${pid}:${name}:`;
      return days.map((d) => `${pid}:${name}:${d}`).join('|');
    })
    .filter(Boolean)
    .join('|');

  const providerIds = list
    .map((p) => Number(p.provider_user_id || 0))
    .filter(Boolean);
  const providerName = list
    .map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || `Provider ${p.provider_user_id}`)
    .filter(Boolean)
    .join(', ');

  const apply = (rows) => {
    if (!Array.isArray(rows)) return;
    const row = rows.find((c) => Number(c?.id) === cid);
    if (!row) return;
    row.service_day = uniqueDays.length ? uniqueDays.join(', ') : null;
    row.provider_day_pairs = pairs || null;
    // Keep provider visible after last weekday is cleared (Unknown day).
    if (providerIds.length) {
      row.provider_ids = providerIds.join(',');
      row.provider_name = providerName || row.provider_name || null;
    }
  };
  apply(clients.value);
  if (Array.isArray(props.clientsOverride)) apply(props.clientsOverride);
};

const NEWLY_ASSIGNED_DAYS = 7;
const isNewlyAssigned = (client) => {
  const at = client?.provider_assigned_at;
  if (!at) return false;
  const assigned = new Date(at).getTime();
  const now = Date.now();
  const days = (now - assigned) / (24 * 60 * 60 * 1000);
  return days <= NEWLY_ASSIGNED_DAYS;
};

const lifecycleViewFor = (client) => {
  if (isClientTerminated(client) && !client?.fall_completed_at && !client?.spring_completed_at) return null;
  if (client?.fall_completed_at) {
    return { actionKey: 'fall_confirmation', label: 'View' };
  }
  if (client?.spring_completed_at) {
    return { actionKey: 'spring_update', label: 'View' };
  }
  if (client?.parents_contacted_at || client?.first_service_at) {
    return { actionKey: 'provider_intake', label: 'View' };
  }
  return null;
};

const openQuickChecklist = (client, viewOnly = false) => {
  if (isClientTerminated(client) && !viewOnly) return;
  quickChecklistViewOnly.value = !!viewOnly;
  quickChecklistClient.value = client;
};

const openLifecycleView = (client) => {
  const view = lifecycleViewFor(client);
  if (!view?.actionKey) return;
  if (view.actionKey === 'provider_intake') {
    openQuickChecklist(client, true);
    return;
  }
  lifecycleActionViewOnly.value = true;
  lifecycleActionClient.value = client;
  lifecycleActionKey.value = view.actionKey;
  lifecycleActionLabel.value = view.actionKey === 'fall_confirmation'
    ? 'View fall confirmation'
    : 'View spring update';
};

const openLifecycleAction = (client) => {
  const action = lifecycleActionFor(client);
  if (!action?.actionKey) return;
  if (action.actionKey === 'assign_day') {
    openAssignDay(client);
    return;
  }
  if (action.actionKey === 'provider_intake') {
    openQuickChecklist(client, false);
    return;
  }
  lifecycleActionViewOnly.value = false;
  lifecycleActionClient.value = client;
  lifecycleActionKey.value = action.actionKey;
  lifecycleActionLabel.value = action.label || 'Next Step';
};

const closeLifecycleAction = () => {
  lifecycleActionClient.value = null;
  lifecycleActionKey.value = '';
  lifecycleActionLabel.value = '';
  lifecycleActionViewOnly.value = false;
};

/** Prefer API action; when previewing as provider, use the provider-specific action. */
const PROVIDER_ACTION_LABELS = {
  fall_confirmation: 'Fall confirmation – Action Needed',
  spring_update: 'Spring Update – Action Needed',
  confirm_services_started: 'Mark Being Seen',
  provider_intake: 'New Client – Action Needed',
  assign_day: 'Assign day – Action Needed'
};

const lifecycleActionFor = (client) => {
  if (isClientTerminated(client)) return null;
  if (props.viewAsRole === 'provider') {
    if (client?.provider_lifecycle_action?.actionKey) return client.provider_lifecycle_action;
    const key = String(client?.provider_action_key || '').trim();
    if (key) return { actionKey: key, label: PROVIDER_ACTION_LABELS[key] || 'Action Needed' };
    return null;
  }
  if (props.viewAsRole === 'school_staff') return null;
  return client?.lifecycle_action || null;
};

const isFlashyLifecycleAction = (client) => {
  const action = lifecycleActionFor(client);
  return !!(action && !action.quiet);
};

const fallHoverBody = (client) => {
  const fromApi = String(client?.fall_status_hover || '').trim();
  if (fromApi) return fromApi;
  const key = String(client?.client_status_key || '').toLowerCase();
  if (!['confirmation_pending', 'unable_to_reach', 'other_transfer'].includes(key)) return '';
  const hasProvider = Number(client?.provider_id) > 0
    || String(client?.provider_ids || '').split(',').some((s) => parseInt(s, 10) > 0)
    || !!String(client?.provider_name || '').trim();
  const day = String(client?.service_day || '');
  const hasDay = /(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(day)
    || /:(Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(String(client?.provider_day_pairs || ''));
  if (!hasProvider) return 'Waiting on a provider assignment. This client is not on a caseload yet.';
  if (!hasDay) return 'Waiting on provider fall confirmation (an assigned day is still needed).';
  return 'Provider and day are assigned. This client should move to Ready to Schedule.';
};

const onLifecycleActionSaved = () => {
  fetchClients();
};

const roiStaffName = (row) => {
  const first = String(row?.first_name || '').trim();
  const last = String(row?.last_name || '').trim();
  return [first, last].filter(Boolean).join(' ') || row?.email || `User ${row?.school_staff_user_id || ''}`;
};

const roiStaffStateLabel = (row) => {
  const effective = String(row?.effective_access_state || '').trim().toLowerCase();
  const access = String(row?.access_level || '').trim().toLowerCase();
  return schoolStaffRoiLabel(effective === 'expired' ? 'expired' : (effective || access));
};

const roiStaffStateHover = (row) => {
  const effective = String(row?.effective_access_state || row?.access_level || '').trim().toLowerCase();
  return schoolStaffRoiHover(effective);
};

const startOfDay = (value) => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const roiStatusLabel = (client) => {
  const raw = String(client?.roi_expires_at || '').trim();
  if (!raw) return 'NO ROI';
  const exp = startOfDay(raw);
  const today = startOfDay(new Date());
  if (!exp || !today) return 'ROI Unknown';
  if (exp.getTime() < today.getTime()) return 'ROI Expired';
  return 'ROI Active';
};

const roiStatusDateHint = (client) => {
  const raw = String(client?.roi_expires_at || '').trim();
  if (!raw) return 'No expiration date set';
  return `Expires ${formatDate(raw)}`;
};

const loadRoiStatus = async (clientId) => {
  if (!clientId) return;
  roiStatusLoading.value = true;
  roiStatusError.value = '';
  try {
    const response = await api.get(`/clients/${clientId}/school-roi-access`, { skipGlobalLoading: true });
    const payload = response.data || {};
    roiStatusData.value = {
      roiExpiresAt: payload.roi_expires_at || null,
      roiExpired: payload.roi_expired !== false,
      schoolName: payload.school_name || '',
      staff: Array.isArray(payload.staff) ? payload.staff : []
    };
  } catch (e) {
    roiStatusError.value = e?.response?.data?.error?.message || 'Failed to load ROI status';
    roiStatusData.value = {
      roiExpiresAt: null,
      roiExpired: true,
      schoolName: '',
      staff: []
    };
  } finally {
    roiStatusLoading.value = false;
  }
};

const openRoiStatus = async (client) => {
  if (!client?.id) return;
  roiStatusModalClient.value = client;
  await loadRoiStatus(Number(client.id));
};

const closeRoiStatusModal = () => {
  roiStatusModalClient.value = null;
  roiStatusError.value = '';
};

const openTerminateModal = (client) => {
  terminateModalClient.value = client;
  terminateReasonDraft.value = '';
};

const submitTerminate = async () => {
  const client = terminateModalClient.value;
  if (!client?.id || !String(terminateReasonDraft.value || '').trim()) return;
  try {
    terminateSaving.value = true;
    const reason = String(terminateReasonDraft.value || '').trim();
    const r = await api.post(`/clients/${client.id}/terminate`, {
      termination_reason: reason
    });
    terminateModalClient.value = null;
    terminateReasonDraft.value = '';

    // "All schools" merged roster uses clientsOverride, which fetchClients() can't refresh —
    // patch the row locally so the terminated status/label show up immediately either way.
    const updated = r?.data || {};
    const patchRow = (rows) => {
      if (!Array.isArray(rows)) return;
      const row = rows.find((c) => Number(c?.id) === Number(client.id));
      if (!row) return;
      row.client_status_key = 'terminated';
      row.client_status_label = updated.client_status_label || 'Terminated';
      row.termination_reason = updated.termination_reason || reason;
      row.service_day = null;
      row.provider_day_pairs = null;
    };
    patchRow(clients.value);
    if (Array.isArray(props.clientsOverride)) patchRow(props.clientsOverride);
    if (!useClientsOverride()) await fetchClients();
  } catch (err) {
    alert(err.response?.data?.error?.message || err.message || 'Failed to terminate client');
  } finally {
    terminateSaving.value = false;
  }
};

const onQuickChecklistSaved = () => {
  fetchClients();
};

const sortValue = (client, key) => {
  if (!client) return '';
  if (key === 'provider_assigned_at') {
    const t = client.provider_assigned_at ? new Date(client.provider_assigned_at).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }
  if (key === 'status') return String(client.client_status_label || client.status || '').toLowerCase();
  if (key === 'document_status') return String(formatOnboardingSummary(client) || '').toLowerCase();
  if (key === 'organization_name') return String(props.organizationName || client.organization_name || '').toLowerCase();
  if (key === 'provider_name') return String(client.provider_name || '').toLowerCase();
  if (key === 'skills') return client.skills ? 1 : 0;
  if (key === 'continuation_services') return String(continuationServicesSummary(client) || '').toLowerCase();
  if (key === 'psychotherapy_total') {
    const m = props.psychotherapyTotalsByClientId || {};
    const rec = m?.[String(client?.id ?? '')] || m?.[Number(client?.id ?? 0)] || null;
    const t = Number(rec?.total ?? 0);
    return Number.isFinite(t) ? t : 0;
  }
  if (key === 'service_day') {
    // Multi-provider may return "Mon, Wed"; sort by first day token.
    const raw = String(client.service_day || '');
    const first = raw.split(',')[0]?.trim() || raw;
    const d = first;
    const idx = dayOrder.indexOf(d);
    return idx < 0 ? 999 : idx;
  }
  if (key === 'submission_date') {
    const t = client.submission_date ? new Date(client.submission_date).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }
  if (key === 'initials') return String(formatRosterLabel(client) || '').toLowerCase();
  return String(client[key] || '').toLowerCase();
};

const ACTION_FILTER_LABELS = {
  fall_confirmation: 'Fall confirmation',
  agency_insurance: 'Insurance clearance',
  agency_intake: 'Agency intake',
  new_client: 'New client',
  agency_clearance: 'Agency clearance',
  roi_followup: 'ROI follow-up',
  confirm_services: 'Being Seen'
};

const clientMatchesActionFilter = (client, actionKey) => {
  const k = normalize(actionKey);
  if (!k) return true;
  const providerKey = normalize(
    client?.provider_action_key
    || (String(client?.lifecycle_action?.role || '').toLowerCase() === 'provider'
      ? client?.lifecycle_action?.actionKey
      : '')
  );
  const agencyKey = normalize(
    client?.agency_action_key
    || (String(client?.lifecycle_action?.role || '').toLowerCase() === 'agency'
      ? client?.lifecycle_action?.actionKey
      : '')
  );
  const status = normalize(client?.client_status_key);
  if (k === 'fall_confirmation') {
    return providerKey === 'fall_confirmation'
      || ['confirmation_pending', 'continuation_unknown', 'unable_to_reach', 'other_transfer'].includes(status);
  }
  if (k === 'agency_insurance') {
    return client?.needs_insurance_clearance === true || client?.needs_insurance_clearance === 1;
  }
  if (k === 'new_client') return providerKey === 'provider_intake';
  if (k === 'confirm_services') return providerKey === 'confirm_services_started';
  if (k === 'agency_intake') return agencyKey === 'agency_intake';
  if (k === 'agency_clearance') return agencyKey === 'agency_clearance';
  if (k === 'roi_followup') return agencyKey === 'roi_followup';
  return false;
};

const normalize = (v) => String(v || '').trim().toLowerCase();

const isWaitlistClient = (client) => {
  const key = normalize(client?.client_status_key);
  if (key === 'waitlist' || key === 'on_hold') return true;
  if (normalize(client?.client_status_label) === 'waitlist') return true;
  return String(client?.status || '').toUpperCase() === 'ON_HOLD';
};

const attentionFilterActive = ref(false);
const localStatusFilterKey = ref(''); // used when provider has filter pills (parent may not pass statusFilterKey)
const showAttentionFilters = computed(() => props.rosterScope === 'provider');
const showSummaryBanner = computed(() => props.rosterScope === 'provider');
const waitlistCount = computed(() => {
  const list = Array.isArray(clients.value) ? clients.value : [];
  return list.filter((c) => isWaitlistClient(c)).length;
});
const waitlistDisplayCount = computed(() => {
  const external = Number(props.waitlistSchoolCount);
  if (Number.isFinite(external) && external >= 0) return external;
  return waitlistCount.value;
});
const showWaitlistAvailabilityAlert = computed(() => (
  props.rosterScope === 'provider' &&
  isProviderUser.value &&
  waitlistDisplayCount.value > 0
));
const additionalAvailabilityHref = '/dashboard?tab=submit';
const openAvailabilityRequestFromWaitlist = () => {
  emit('open-availability-request', { source: 'waitlist_alert' });
};

const attentionSummary = computed(() => {
  const list = Array.isArray(clients.value) ? clients.value : [];
  let newCount = 0;
  let actionNeeded = 0;
  let openTickets = 0;
  for (const c of list) {
    if (isNewlyAssigned(c)) newCount++;
    if (isFlashyLifecycleAction(c)) actionNeeded++;
    if (Number(c?.open_ticket_count || 0) > 0) openTickets++;
  }
  return {
    new: newCount,
    pendingCompliance: actionNeeded,
    openTickets,
    total: new Set(
      list
        .filter((c) => isNewlyAssigned(c) || isFlashyLifecycleAction(c) || Number(c?.open_ticket_count || 0) > 0)
        .map((c) => c.id)
    ).size,
    any: newCount > 0 || actionNeeded > 0 || openTickets > 0
  };
});

const setAttentionFilter = (mode) => {
  attentionFilterActive.value = mode === 'needs_attention';
  if (mode !== 'needs_attention') {
    localStatusFilterKey.value = '';
    emit('update:statusFilterKey', '');
    emit('update:actionFilterKey', '');
  }
};

const setStatusFilter = (key) => {
  attentionFilterActive.value = false;
  localStatusFilterKey.value = key || '';
  emit('update:statusFilterKey', key || '');
  emit('update:actionFilterKey', '');
};

const effectiveStatusFilterKey = computed(() =>
  showAttentionFilters.value ? localStatusFilterKey.value : props.statusFilterKey
);
const activeStatusFilterKey = computed(() => normalize(effectiveStatusFilterKey.value));
const activeActionFilterKey = computed(() => normalize(props.actionFilterKey));
const activeStatusFilterLabel = computed(() => {
  const k = activeStatusFilterKey.value;
  if (!k) return '';
  if (k === 'pending') return 'Pending';
  if (k === 'waitlist') return 'Waitlist';
  return k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
});
const activeActionFilterLabel = computed(() => {
  const k = activeActionFilterKey.value;
  if (!k) return '';
  return ACTION_FILTER_LABELS[k] || k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
});

const hideTerminatedEffective = computed(() => {
  if (String(searchQuery.value || '').trim()) {
    return !searchIncludeTerminated.value;
  }
  if (!props.showTerminatedToggle) return props.hideTerminated;
  return !showTerminatedLocal.value;
});

const statusFilteredClients = computed(() => {
  let list = Array.isArray(clients.value) ? clients.value : [];
  if (hideTerminatedEffective.value) {
    list = list.filter((c) => normalize(c?.client_status_key) !== 'terminated');
  }
  if (String(searchQuery.value || '').trim()) {
    return list;
  }
  if (attentionFilterActive.value) {
    list = list.filter((c) => isNewlyAssigned(c) || isFlashyLifecycleAction(c) || Number(c?.open_ticket_count || 0) > 0);
  }
  const k = activeStatusFilterKey.value;
  if (k === 'waitlist') list = list.filter((c) => isWaitlistClient(c));
  else if (k) list = list.filter((c) => normalize(c?.client_status_key) === k);
  const actionKey = activeActionFilterKey.value;
  if (actionKey) list = list.filter((c) => clientMatchesActionFilter(c, actionKey));
  return list;
});

const filteredClients = computed(() => {
  const q = normalize(searchQuery.value);
  const list = Array.isArray(statusFilteredClients.value) ? statusFilteredClients.value : [];
  if (!q) return list;
  // Smart search (name, birthday, guardian) is applied on the server.
  return list;
});

const clearStatusFilter = () => {
  attentionFilterActive.value = false;
  localStatusFilterKey.value = '';
  emit('update:statusFilterKey', '');
  emit('update:actionFilterKey', '');
};

const lifecycleSortBucket = (client) => {
  const key = String(client?.client_status_key || '').toLowerCase();
  if (key === 'terminated' || key === 'archived') return 4;
  if (['received', 'packet', 'pending_corrections', 'in_process', 'screener'].includes(key)) return 0;
  if (key === 'ready_to_schedule' || key === 'scheduled') return 1;
  if (key === 'being_seen' || key === 'current') return 3;
  return 2;
};

const sortedClients = computed(() => {
  const list = Array.isArray(filteredClients.value) ? filteredClients.value.slice() : [];
  const key = sortKey.value;
  const dir = sortDir.value === 'asc' ? 1 : -1;
  const useBuckets = !columnSortActive.value && key !== 'submission_date';
  return list.sort((a, b) => {
    if (useBuckets) {
      const bucketCmp = lifecycleSortBucket(a) - lifecycleSortBucket(b);
      if (bucketCmp !== 0) return bucketCmp;
    }
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    const cmp = String(av).localeCompare(String(bv));
    if (cmp !== 0) return cmp * dir;
    if (key !== 'initials') {
      const clientCmp = String(sortValue(a, 'initials')).localeCompare(String(sortValue(b, 'initials')));
      if (clientCmp !== 0) return clientCmp;
    }
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
});

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString();
};

const formatRosterLabel = (client) => {
  const initials = String(client?.initials || '').replace(/\s+/g, '').toUpperCase();
  const code = String(client?.identifier_code || '').replace(/\s+/g, '').toUpperCase();
  const fullName = String(client?.full_name || '').trim();
  const mode = String(props.clientLabelMode || 'initials');
  const isLocked = isSchoolScheduleClientLocked(client);
  if (isLocked) {
    // Locked rows never reveal the full name — fall back to initials/codes label mode.
    const src = mode === 'codes' ? (client?.identifier_code || client?.initials) : (client?.initials || client?.identifier_code);
    let preferred = String(src || '').replace(/\s+/g, '');
    if (mode === 'codes') preferred = preferred.toUpperCase();
    return preferred || String(client?.school_portal_locked_label || 'NO ROI').trim() || 'NO ROI';
  }
  if (client?.school_portal_force_code) return code || initials || '—';
  if (mode === 'full_name') return fullName || initials || code || '—';
  if (mode === 'codes') return code || initials || '—';
  return initials || code || '—';
};

const formatClientStatusLabel = (client) => displaySchoolClientStatusLabel(client);

const parseContinuationServices = (client) => {
  const raw = client?.continuation_services_json;
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const hasContinuationServices = (client) => {
  const data = parseContinuationServices(client);
  if (!data) return false;
  if (data.plan === 'not_continue_school' || data.plan === 'unable_to_contact_parent' || data.plan === 'other') {
    return !!(data.privateComment || data.comment || data.completedAt);
  }
  if (data.plan !== 'continue_school') return false;
  if (Array.isArray(data.serviceDays) && data.serviceDays.length) return true;
  if (data.schoolChoice === 'current_school') return !!data.currentSchoolAction;
  if (data.schoolChoice === 'new_school') {
    const hasSchool = !!Number(data.newSchoolOrganizationId || 0) || !!String(data.newSchoolName || '').trim();
    const selectedAgencySchool = !!Number(data.newSchoolOrganizationId || 0);
    return hasSchool && (!selectedAgencySchool || !!data.newSchoolAction);
  }
  return false;
};

const continuationServicesSummary = (client) => {
  const data = parseContinuationServices(client);
  if (!data?.plan) return 'Needs response';
  if (data.plan === 'not_continue_school') return 'Not continuing this fall';
  if (data.plan === 'unable_to_contact_parent') {
    return data.recommendTerminate ? 'No parent contact · terminate' : 'No parent contact';
  }
  if (data.plan === 'other') {
    return data.recommendTerminate ? 'Other · terminate' : 'Other';
  }
  if (data.plan !== 'continue_school') return 'Needs response';
  if (Array.isArray(data.serviceDays) && data.serviceDays.length) {
    const days = data.serviceDays.map((d) => String(d).slice(0, 3)).join(', ');
    return `Continuing · ${days}`;
  }
  if (data.schoolChoice === 'current_school') {
    if (data.currentSchoolAction === 'continuing_with_me') return 'Current school · with me';
    if (data.currentSchoolAction === 'requesting_transfer') return 'Current school · transfer';
    return 'Current school · needs detail';
  }
  if (data.schoolChoice === 'new_school') {
    if (!Number(data.newSchoolOrganizationId || 0) && String(data.newSchoolName || '').trim()) {
      return `New school · ${String(data.newSchoolName).trim()}`;
    }
    if (data.newSchoolAction === 'continue_at_new_school_if_possible') return 'New school · continue if possible';
    if (data.newSchoolAction === 'pursue_in_office_support') return 'New school · office support';
    return 'New school · needs detail';
  }
  return 'Continuing · needs day';
};

const rosterLabelTitle = (client) => {
  if (client?.school_portal_can_open === false) return '';
  if (client?.school_portal_force_code) return '';
  const fullName = String(client?.full_name || '').trim();
  if (fullName) {
    // Already showing the full name as the label — a duplicate tooltip would be redundant.
    return props.clientLabelMode === 'full_name' ? '' : fullName;
  }
  const initials = String(client?.initials || '').replace(/\s+/g, '').toUpperCase();
  return initials || '';
};

const lockedClientTitle = (client) => {
  if (isClientTerminated(client)) {
    const body = String(
      client?.fall_status_hover || client?.termination_reason || 'Terminated'
    ).trim();
    return body ? `Termination reason: ${body}` : 'Terminated';
  }
  const soft = String(client?.school_portal_roi_soft_message || '').trim();
  if (soft) return soft;
  if (client?.paper_packet_staff_roi_notice) {
    return 'A printed referral packet was recently uploaded. If your name is on the signed form, you will receive access.';
  }
  const state = String(client?.school_staff_effective_access_state || '').toLowerCase();
  if (state === 'expired') {
    return 'ROI is currently expired. Schedule and Soft Schedule remain available. Document access is paused until renewed.';
  }
  return 'ROI access is limited. Schedule remains available; some profile documents may be restricted.';
};

const lockedInitialsTitle = (client) => lockedClientTitle(client);

const lockedClientButtonLabel = (client) => {
  const state = String(client?.school_staff_effective_access_state || '').toLowerCase();
  if (state === 'expired' || state === 'limited' || state === 'roi' || state === 'roi_docs') return 'Comments';
  return 'No ROI';
};

const pendingComplianceTitle = (client) => {
  const days = Number(client?.compliance_days_since_assigned || 0);
  const missing = Array.isArray(client?.compliance_missing) ? client.compliance_missing : [];
  const lines = [
    `Pending ${days} day(s) since assigned`,
    missing.length ? `Missing: ${missing.join(', ')}` : ''
  ].filter(Boolean);
  return lines.join('\n');
};

const eventAssignmentLabel = (ea) => {
  const raw = String(ea?.skillsGroupName || ea?.eventTitle || '').trim();
  if (!raw) return 'Program event';
  return raw.length > 28 ? `${raw.slice(0, 26)}…` : raw;
};

const eventAssignmentTitle = (ea) => {
  const lines = [
    `Assigned to you for: ${ea?.eventTitle || ea?.skillsGroupName || 'Program event'}`,
    ea?.eventStartsAt ? `Starts: ${formatDate(ea.eventStartsAt)}` : '',
    `Intake: ${ea?.intakeComplete ? 'complete' : 'pending'}`,
    `Treatment plan: ${ea?.treatmentPlanComplete ? 'complete' : 'pending'}`
  ].filter(Boolean);
  return lines.join('\n');
};

const commentBadgeCount = (client) => {
  const unread = Number(client?.unread_notes_count || 0);
  if (unread > 0) return unread;
  return Number(client?.notes_count || 0);
};

const messageBadgeCount = (client) => {
  const unread = Number(client?.unread_ticket_messages_count || 0);
  if (unread > 0) return unread;
  return Number(client?.ticket_messages_count || 0);
};

const commentBadgeTitle = (client) => {
  const unread = Number(client?.unread_notes_count || 0);
  const total = Number(client?.notes_count || 0);
  if (unread > 0) return `${unread} new comment(s) — click to open`;
  return `${total} comment(s) — click to open`;
};

const messageBadgeTitle = (client) => {
  const unread = Number(client?.unread_ticket_messages_count || 0);
  const total = Number(client?.ticket_messages_count || 0);
  if (unread > 0) return `${unread} new message(s) — click to open`;
  return `${total} message(s) — click to open`;
};

const startOfLocalDay = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getRoiExpirationCountdownLabel = (client) => {
  const roiExpiresRaw = String(client?.roi_expires_at || '').trim();
  if (!roiExpiresRaw) return '';
  const expiresAt = startOfLocalDay(roiExpiresRaw);
  const today = startOfLocalDay();
  if (!expiresAt || !today) return '';
  const diffDays = Math.round((expiresAt.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0 || diffDays > 30) return '';
  if (diffDays === 0) return 'ROI expires today';
  if (diffDays === 1) return 'ROI expires in 1 day';
  return `ROI expires in ${diffDays} days`;
};

const openOnboardingChecklist = (client) => {
  if (isClientTerminated(client)) return;
  if (!client?.id) return;
  onboardingChecklistClient.value = client;
};

const onOnboardingChecklistUpdated = () => {
  fetchClients().catch(() => {});
};

const formatDocSummary = (client) => formatOnboardingSummary(client);

const psychotherapyCell = (client) => {
  const m = props.psychotherapyTotalsByClientId || null;
  if (!m || !client?.id) return { total: null, title: '' };
  const rec = m?.[String(client.id)] || m?.[Number(client.id)] || null;
  // Missing map entry → em dash (not fake zero)
  if (!rec) return { total: null, title: '' };
  const per = rec?.per_code && typeof rec.per_code === 'object' ? rec.per_code : {};
  const parts = Object.entries(per)
    .filter(([, v]) => Number(v) > 0)
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([code, count]) => `${String(code).toUpperCase()} (${Number(count)})`);
  const total = Number(rec?.total ?? 0);
  const title = parts.length ? `${parts.join('\n')}\nTotal (${total})` : `Total (${total})`;
  return { total: Number.isFinite(total) ? total : null, title };
};

const updateClientCounts = (clientId, nextCounts) => {
  if (!clientId) return;
  clients.value = (clients.value || []).map((c) => {
    if (Number(c?.id) !== Number(clientId)) return c;
    return { ...c, ...(nextCounts || {}) };
  });
};

const markClientUpdatesRead = async (client) => {
  try {
    const orgId = props.organizationId;
    if (!orgId || !client?.id) return;
    const kinds = ['checklist', 'status', 'assignment'];
    await Promise.all(
      kinds.map((kind) => api.post(`/school-portal/${orgId}/notifications/read`, { kind, clientId: client.id }))
    );
  } catch {
    // ignore
  }
};

const onClientUpdatedFromModal = (payload) => {
  const cid = Number(payload?.clientId || 0);
  const skills = payload?.skills;
  if (cid && selectedClient.value && Number(selectedClient.value.id) === cid) {
    selectedClient.value = { ...selectedClient.value, skills: !!skills };
  }
  clients.value = (clients.value || []).map((c) =>
    Number(c?.id) === cid ? { ...c, skills: !!skills } : c
  );
  if (!useClientsOverride() && props.organizationId) {
    fetchClients();
  }
};

const openOverview = (client) => {
  if (!canOpenSchoolClient(client)) return;
  if (props.clientOpenMode === 'detail-panel') {
    emit('open-profile', client);
    return;
  }
  overviewClient.value = client;
};

const closeOverview = () => {
  overviewClient.value = null;
};

const openClient = (client, initialPane = null) => {
  if (!canOpenSchoolClient(client)) return;
  if (props.clientOpenMode === 'detail-panel') {
    emit('open-profile', client);
    return;
  }
  // Explicit comments/messages keep the modal; bare open uses the side overview.
  if (!initialPane) {
    openOverview(client);
    return;
  }
  selectedClient.value = client;
  selectedClientInitialPane.value = initialPane;
  if (initialPane === 'comments') {
    updateClientCounts(client?.id, { unread_notes_count: 0 });
  }
  if (initialPane === 'messages') {
    updateClientCounts(client?.id, { unread_ticket_messages_count: 0 });
  }
};

const openClientUpdates = async (client) => {
  if (!canOpenSchoolClient(client)) return;
  openClient(client);
  await markClientUpdatesRead(client);
  updateClientCounts(client?.id, { unread_updates_count: 0 });
};

const openWaitlistNote = (client) => {
  if (!orgKey.value) return;
  waitlistClient.value = client;
};

const onWaitlistSaved = (note) => {
  // Refresh hover tooltip cache immediately after save
  try {
    const cid = Number(waitlistClient.value?.id || 0);
    if (!cid) return;
    const msg = String(note?.message || '').trim() || '(no note yet)';
    waitlistNoteByClientId.value = { ...(waitlistNoteByClientId.value || {}), [String(cid)]: msg };
  } catch {
    // ignore
  }
};

const handleRowActivate = (client) => {
  if (!canOpenSchoolClient(client)) return;
  openOverview(client);
};

const openClientEditorFromModal = (client) => {
  selectedClient.value = null;
  selectedClientInitialPane.value = null;
  goEdit(client);
};

const openChecklistFromModal = (client) => {
  selectedClient.value = null;
  selectedClientInitialPane.value = null;
  openQuickChecklist(client);
};

const goEdit = (client) => {
  if (!client?.id) return;
  if (props.editMode === 'inline') {
    emit('edit-client', {
      client,
      navigationClientIds: (sortedClients.value || []).map((row) => Number(row?.id || 0)).filter(Boolean)
    });
    return;
  }
  const query = { clientId: String(client.id) };
  if (props.rosterScope === 'provider') query.tab = 'checklist';
  router.push({ path: '/admin/clients', query });
};


watch(
  () => props.statusFilterKey,
  (key) => {
    if (!showAttentionFilters.value) return;
    const next = normalize(key);
    if (next === normalize(localStatusFilterKey.value)) return;
    localStatusFilterKey.value = next;
    attentionFilterActive.value = false;
  },
  { immediate: true }
);

watch(
  () => activeStatusFilterKey.value,
  (key, prevKey) => {
    if (useClientsOverride()) return;
    if (props.rosterScope !== 'provider') return;
    const isWaitlist = key === 'waitlist';
    const wasWaitlist = prevKey === 'waitlist';
    if (isWaitlist !== wasWaitlist) fetchClients();
  }
);

watch(
  () => props.clientsOverride,
  (val) => {
    if (Array.isArray(val)) {
      clients.value = val;
      loading.value = false;
      error.value = '';
    }
  },
  { immediate: true }
);

watch(
  () => props.hideTerminated,
  (v) => {
    if (!props.showTerminatedToggle) return;
    showTerminatedLocal.value = !v;
  },
  { immediate: true }
);

watch(
  () => [props.organizationId, props.organizationSlug, props.skillBuildersOnly, props.schoolYearFilter],
  () => {
    if (useClientsOverride()) return;
    if (props.organizationId || (props.rosterScope === 'provider' && props.organizationSlug)) {
      fetchClients();
      if (props.organizationId) fetchEditPermissions();
    }
  }
);

let rosterSearchDebounce = null;
watch(
  () => [searchQuery.value, searchIncludeTerminated.value, searchIncludePastYears.value],
  ([q], [prevQ]) => {
    if (useClientsOverride()) return;
    const needle = String(q || '').trim();
    const prev = String(prevQ || '').trim();
    if (!needle && !prev) return;
    if (rosterSearchDebounce) clearTimeout(rosterSearchDebounce);
    rosterSearchDebounce = setTimeout(() => {
      fetchClients();
    }, needle ? 280 : 0);
  }
);

watch(
  () => (showAttentionFilters.value ? attentionSummary.value.total : 0),
  (count) => emit('update:needsAttentionCount', count),
  { immediate: true }
);

// Default to "Needs attention" filter when provider has clients needing attention
watch(
  () => loading.value,
  (isLoading, wasLoading) => {
    if (wasLoading && !isLoading && props.rosterScope === 'provider' && attentionSummary.value.total > 0 && !activeStatusFilterKey.value) {
      attentionFilterActive.value = true;
    }
  }
);

onMounted(() => {
  if (props.rosterScope === 'provider') {
    const hadStored = !!window?.localStorage?.getItem?.(PROVIDER_SORT_STORAGE_KEY);
    loadStoredSort();
    if (!hadStored) {
      // Default: sort by school, then by client (see sortedClients' secondary tie-break).
      sortKey.value = 'organization_name';
      sortDir.value = 'asc';
      saveSort();
    }
  }
  if (!useClientsOverride() && (props.organizationId || (props.rosterScope === 'provider' && props.organizationSlug))) {
    fetchClients();
    if (props.organizationId) fetchEditPermissions();
  }
});
</script>

<style scoped>
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.client-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.unread-legend {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
  min-width: 0;
}

.unread-legend-track {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 12px 16px;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.unread-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  white-space: nowrap;
}

.unread-legend-text {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.unread-legend-hint {
  flex: 0 0 auto;
  margin-left: 12px;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .unread-legend {
    flex-direction: column;
    align-items: stretch;
  }
  .unread-legend-hint {
    margin-left: 0;
    text-align: right;
  }
}

@media (max-width: 640px) {
  .table-toolbar {
    gap: 8px;
  }
  .clients-table th,
  .clients-table td {
    padding: 10px 8px;
    font-size: 0.75rem;
  }
}

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 12px;
  line-height: 1;
  font-weight: 800;
  cursor: pointer;
  user-select: none;
}
.unread-badge-legend {
  cursor: default;
}
.unread-badge-muted {
  opacity: 0.55;
}
.ticket-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.ticket-status-open {
  border: 1px solid rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.16);
  color: #b91c1c;
}
.ticket-status-answered {
  border: 1px solid rgba(37, 99, 235, 0.4);
  background: rgba(37, 99, 235, 0.12);
  color: #1e3a8a;
}
.ticket-status-legend {
  cursor: default;
}
.ticket-status-btn {
  cursor: pointer;
  border: none;
}
.pending-compliance-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(239, 68, 68, 0.45);
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.paper-packet-staff-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(217, 119, 6, 0.45);
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.client-row-paper-packet-notice td {
  box-shadow: inset 3px 0 0 #f59e0b;
}
.unread-badge-comments {
  background: rgba(45, 156, 219, 0.12);
  border-color: rgba(45, 156, 219, 0.35);
  color: #1b6fa0;
}
.unread-badge-messages {
  background: rgba(155, 81, 224, 0.12);
  border-color: rgba(155, 81, 224, 0.35);
  color: #6a2aa3;
}
.unread-badge-updates {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
  color: #065f46;
}
.unread-badge:focus {
  outline: 2px solid rgba(59, 130, 246, 0.45);
  outline-offset: 2px;
}

.status-waitlist {
  cursor: pointer;
}

.status-badge {
  position: relative;
}

.waitlist-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 280px;
  max-width: 60vw;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: white;
  color: var(--text-primary);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 50;
}

.waitlist-tooltip-floating {
  position: fixed;
  z-index: 5000;
  max-width: min(320px, calc(100vw - 24px));
}

.waitlist-tooltip-title {
  font-weight: 900;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.waitlist-tooltip-body {
  font-size: 13px;
  line-height: 1.25;
  white-space: pre-wrap;
}
.waitlist-bubble {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
  font-weight: 800;
  font-size: 0.6875rem;
  line-height: 1;
}
.waitlist-bubble .wl-left {
  padding: 2px 6px;
  border-right: 1px solid rgba(245, 158, 11, 0.25);
}
.waitlist-bubble .wl-right {
  padding: 2px 6px;
}
.client-list-grid {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.client-list-grid.is-overview-split {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  min-height: 520px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.roster-quicklist {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: #fff;
  border-right: 1px solid var(--border, #e2e8f0);
  max-height: 70vh;
  overflow: auto;
}
.roster-quicklist-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 0.85rem;
}
.roster-quicklist-search {
  width: 100%;
  border: 1px solid var(--border, #cbd5e1);
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 0.85rem;
  margin-bottom: 4px;
}
.roster-quicklist-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
}
.roster-quicklist-row:hover { background: #f8fafc; }
.roster-quicklist-row.active {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.roster-quicklist-row:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.roster-quicklist-name {
  font-weight: 800;
  font-size: 0.9rem;
  color: #0f172a;
}
.roster-quicklist-meta {
  font-size: 0.72rem;
  color: #64748b;
}
@media (max-width: 860px) {
  .client-list-grid.is-overview-split {
    grid-template-columns: 1fr;
  }
  .roster-quicklist {
    max-height: 220px;
    border-right: none;
    border-bottom: 1px solid var(--border, #e2e8f0);
  }
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.error-state {
  color: #c33;
}

.clients-table-wrapper {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.clients-table-scroll {
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}

.clients-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem; /* ~13px – compact row height */
}

.table-toolbar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  margin-bottom: 8px;
}

.roster-toolbar-band {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.attention-filter-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 2px;
  scrollbar-width: thin;
}

.waitlist-pill-wrap {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}

.filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 10px 16px;
  min-height: 42px;
  border: 1px solid #166534;
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
  font-weight: 700;
  color: #166534;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.filter-pill:hover {
  background: rgba(22, 101, 52, 0.06);
}

.filter-pill.active {
  border-color: #166534;
  background: #166534;
  color: #fff;
}

.filter-pill-attention.active {
  border-color: #166534;
  background: #166534;
  color: #fff;
}

.filter-pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  color: inherit;
  font-size: 11px;
  font-weight: 800;
}

.filter-pill:not(.active) .filter-pill-count {
  background: rgba(22, 101, 52, 0.12);
  color: #166534;
}
.roster-filter-clear {
  position: relative;
}
.waitlist-pill-badge {
  border: 1px solid #ef4444;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  padding: 4px 8px;
  margin-left: 6px;
}
.waitlist-alert-banner {
  width: 100%;
  box-sizing: border-box;
  background: #111827;
  color: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.45;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
}
.waitlist-alert-banner a {
  color: #93c5fd;
  font-weight: 700;
  text-decoration: underline;
}
.waitlist-alert-tooltip {
  position: absolute;
  top: 34px;
  left: 0;
  width: min(320px, 72vw);
  background: #111827;
  color: #fff;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.4;
  z-index: 20;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.3);
}
.waitlist-alert-tooltip a {
  color: #93c5fd;
  font-weight: 700;
  text-decoration: underline;
}
.inline-link-btn {
  border: none;
  background: transparent;
  color: #93c5fd;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}
.roster-refresh-bar {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(22, 101, 52, 0.08);
  border: 1px solid rgba(22, 101, 52, 0.16);
  color: #14532d;
  font-size: 13px;
  font-weight: 700;
}

.roster-inline-error {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #b91c1c;
  font-size: 13px;
  font-weight: 600;
}

.clients-table-scroll.is-refreshing {
  opacity: 0.55;
  pointer-events: none;
}

.summary-banner {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(187, 247, 208, 0.45);
  border: 1px solid rgba(22, 101, 52, 0.18);
  font-size: 14px;
  font-weight: 600;
  color: #14532d;
  width: 100%;
  box-sizing: border-box;
}
.active-filter-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: 10px;
}

.active-filter-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  font-size: 0.75rem;
  line-height: 1;
  color: var(--text-primary);
}

.btn-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.75rem;
}
.assigned-day-btn {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-align: left;
  white-space: normal;
  max-width: 220px;
  line-height: 1.25;
}
.roi-status-link {
  font-weight: 800;
  text-decoration: underline;
}
.roi-status-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}
.continuation-cell {
  min-width: 150px;
}
.continuation-link {
  font-weight: 800;
  text-align: left;
}
.continuation-link-needed {
  color: #b91c1c;
}
.roi-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.roi-summary-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-alt);
  padding: 10px 12px;
}
.roi-summary-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-secondary);
}
.roi-summary-value {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 800;
  color: var(--text-primary);
}
.table-search {
  width: 100%;
  max-width: none;
  padding: 12px 14px;
  min-height: 44px;
  font-size: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.table-search-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
.table-search-row .roster-search-box {
  flex: 1 1 auto;
  min-width: 0;
}
.roster-search-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 6px;
}
.roster-search-opts label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-muted, #64748b);
  white-space: nowrap;
}
.show-terminated-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 650;
  color: var(--text-muted, #64748b);
  white-space: nowrap;
}

.clients-table thead {
  background: var(--bg-alt);
}

.clients-table th {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  font-size: 0.75rem; /* slightly smaller headers */
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}
.clients-table .sortable {
  cursor: pointer;
  user-select: none;
}
.clients-table .sortable:hover {
  background: rgba(0, 0, 0, 0.03);
}
.sort-indicator {
  margin-left: 4px;
  font-size: 10px;
  color: var(--text-secondary);
}

.initials-cell {
  font-weight: 900;
  letter-spacing: 0.06em;
}
.initials {
  display: inline-block;
  padding: 4px 8px;
  font-size: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
}
.initials-btn {
  border: none;
  cursor: pointer;
}
.initials-btn:disabled {
  cursor: default;
}
.initials-btn[data-locked-reason]:disabled {
  position: relative;
}
.initials-btn[data-locked-reason]:disabled:hover::after {
  content: attr(data-locked-reason);
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(100% + 8px);
  min-width: 240px;
  max-width: 360px;
  white-space: normal;
  text-align: left;
  line-height: 1.25;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.96);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  z-index: 80;
  pointer-events: none;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25);
}

.clients-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  font-size: 0.8125rem;
  vertical-align: middle;
  line-height: 1.3;
}

.clients-table td:nth-child(3) {
  max-width: 180px;
  word-break: break-word;
}

.client-row {
  cursor: default;
  transition: background 0.2s;
}

.client-row-newly-assigned {
  background: rgba(16, 185, 129, 0.06);
  animation: newlyAssignedPulse 2.5s ease-in-out 4;
}

@keyframes newlyAssignedPulse {
  0%, 100% { background-color: rgba(16, 185, 129, 0.06); box-shadow: none; }
  50% { background-color: rgba(16, 185, 129, 0.14); box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.25); }
}

.name-duplicate-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid rgba(194, 65, 12, 0.35);
  background: rgba(234, 88, 12, 0.12);
  color: #9a3412;
  font-size: 11px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.newly-assigned-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.45);
  color: #065f46;
  animation: badgePulse 1.5s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.9; transform: scale(1.05); }
}
.newly-assigned-badge-legend {
  animation: none;
  cursor: default;
}

.event-assignment-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  cursor: help;
}
.event-assignment-badge--ready {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.45);
  color: #1e40af;
}
.event-assignment-badge--pending {
  background: rgba(234, 88, 12, 0.14);
  border: 1px solid rgba(234, 88, 12, 0.45);
  color: #9a3412;
}

.client-row-clickable {
  cursor: pointer;
}

.client-row-clickable:hover {
  background: var(--bg-alt);
}

.client-row-locked {
  background: rgba(107, 114, 128, 0.08);
  opacity: 0.82;
}

.client-row-terminated {
  background: rgba(107, 114, 128, 0.06);
  opacity: 0.72;
  color: var(--text-secondary);
}

.client-row-terminated .initials-btn,
.client-row-terminated .btn-link,
.client-row-terminated .status-badge {
  color: #6b7280;
}

.client-row-terminated .status-terminated {
  cursor: help;
}

.comment-btn {
  position: relative;
}

.actions-col {
  white-space: nowrap;
  min-width: 0;
}

.roster-row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.roster-action-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.roster-action-btn {
  appearance: none;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.roster-action-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: rgba(15, 23, 42, 0.2);
  color: #0f172a;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.roster-action-btn:focus-visible {
  outline: 2px solid rgba(47, 111, 78, 0.45);
  outline-offset: 1px;
}

.roster-action-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.roster-action-btn--ghost {
  background: transparent;
  color: #334155;
}

.roster-action-btn--accent {
  border-color: rgba(47, 111, 78, 0.28);
  color: var(--primary, #2f6f4e);
  background: rgba(47, 111, 78, 0.05);
}

.roster-action-btn--accent:hover:not(:disabled) {
  background: rgba(47, 111, 78, 0.1);
  border-color: rgba(47, 111, 78, 0.4);
  color: var(--primary, #2f6f4e);
}

.roster-action-btn--pulse {
  animation: roster-action-pulse 1.4s ease-in-out infinite;
  box-shadow: 0 0 0 0 rgba(201, 122, 32, 0.45);
  border-color: rgba(201, 122, 32, 0.55);
  background: rgba(201, 122, 32, 0.08);
  color: #9a4d0a;
}

@keyframes roster-action-pulse {
  0% { box-shadow: 0 0 0 0 rgba(201, 122, 32, 0.45); transform: scale(1); }
  55% { box-shadow: 0 0 0 8px rgba(201, 122, 32, 0); transform: scale(1.03); }
  100% { box-shadow: 0 0 0 0 rgba(201, 122, 32, 0); transform: scale(1); }
}

.roster-action-btn--danger {
  border-color: rgba(217, 45, 32, 0.22);
  color: #b42318;
  background: rgba(217, 45, 32, 0.04);
}

.roster-action-btn--danger:hover:not(:disabled) {
  background: rgba(217, 45, 32, 0.08);
  border-color: rgba(217, 45, 32, 0.35);
  color: #912018;
}

.edit-col {
  white-space: nowrap;
}

.unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--danger, #d92d20);
  margin-right: 8px;
  vertical-align: middle;
}

.psy-cell {
  white-space: nowrap;
}
.psy-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 22px;
  padding: 0 6px;
  font-size: 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  font-weight: 900;
}
.psy-pill-alert {
  border-color: rgba(239, 68, 68, 0.55);
  background: rgba(239, 68, 68, 0.10);
  color: #991b1b;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.modal-content {
  background: white;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  padding: 20px;
  max-width: 95vw;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.btn-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-secondary);
  line-height: 1;
  padding: 0 4px;
}
.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.required::after {
  content: ' *';
  color: var(--danger, #c33);
}
</style>
