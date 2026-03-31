<template>
  <div class="container">
    <div class="page-header" data-tour="clients-header">
      <h1 data-tour="clients-title">Client Management</h1>
      <div class="header-actions" data-tour="clients-actions">
        <button @click="showBulkImportModal = true" class="btn btn-secondary">Bulk Import</button>
        <router-link
          v-if="canBackofficeEdit"
          :to="schoolOverviewLink"
          class="btn btn-secondary"
        >
          Show all schools
        </router-link>
        <button
          v-if="authStore.user?.role === 'super_admin'"
          @click="openDeleteImportedModal"
          class="btn btn-secondary"
          :disabled="deleteImportedWorking"
        >
          Delete Imported Clients…
        </button>
        <button
          v-if="authStore.user?.role !== 'school_staff'"
          @click="openRolloverModal('rollover')"
          class="btn btn-secondary"
          :disabled="rolloverWorking"
        >
          {{ rolloverWorking ? 'Rolling over…' : 'Rollover School Year…' }}
        </button>
        <button
          v-if="authStore.user?.role !== 'school_staff'"
          @click="openRolloverModal('reset_docs')"
          class="btn btn-secondary"
          :disabled="rolloverWorking"
        >
          {{ rolloverWorking ? 'Working…' : 'Reset Documentation…' }}
        </button>
        <button
          v-if="isSuperAdmin && usingServerPagination"
          @click="showHiddenTenantsModal = true"
          class="btn btn-secondary btn-sm"
          title="Configure which tenants show in the platform-wide client list"
          type="button"
        >
          Tenant Visibility
        </button>
        <button @click="openCreateClientModal" class="btn btn-primary">Create Client</button>
      </div>
    </div>

    <!-- Filters and Search -->
    <!-- Keep mounted during loading so inputs don't lose focus -->
    <div class="table-controls" v-show="clients.length > 0" data-tour="clients-filters">
      <div class="filter-group">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search clients..."
          class="search-input"
          @input="onSearchInput"
          @keydown.enter.prevent="applyFilters"
          data-tour="clients-search"
        />
        <!-- Display mode toggle -->
        <div class="display-mode-toggle" title="Toggle how clients are identified in the table">
          <button
            type="button"
            :class="['display-mode-btn', { active: displayMode === 'initials' }]"
            @click="displayMode = 'initials'; applyFilters()"
            title="Show initials only (private)"
          >Initials</button>
          <button
            type="button"
            :class="['display-mode-btn', { active: displayMode === 'full_name' }]"
            @click="displayMode = 'full_name'; applyFilters()"
            title="Show full name"
          >Name</button>
          <button
            type="button"
            :class="['display-mode-btn', { active: displayMode === 'code' }]"
            @click="displayMode = 'code'; applyFilters()"
            title="Show client code"
          >Code</button>
        </div>
        <select
          v-if="usingServerPagination"
          v-model="platformTenantFilter"
          @change="handlePlatformTenantChange"
          class="filter-select"
        >
          <option value="">All Tenants</option>
          <option v-for="tenant in availableTenantFilters" :key="tenant.id" :value="String(tenant.id)">
            {{ tenant.name }}
          </option>
        </select>
        <!-- Per-agency custom statuses when a tenant is scoped -->
        <select v-if="clientStatuses.length > 0" v-model="clientStatusFilter" @change="applyFilters" class="filter-select">
          <option value="">All Client Statuses</option>
          <option v-for="s in clientStatuses" :key="s.id" :value="String(s.id)">
            {{ s.label }}
          </option>
        </select>
        <!-- Workflow status filter: shown in platform mode (no per-agency statuses loaded) or always as a secondary filter -->
        <select v-model="workflowStatusFilter" @change="applyFilters" class="filter-select">
          <option value="">All Workflow Statuses</option>
          <option v-for="ws in WORKFLOW_STATUS_OPTIONS" :key="ws.value" :value="ws.value">
            {{ ws.label }}
          </option>
        </select>
        <div v-if="showSchoolSearch" class="school-search">
          <input
            v-model="schoolSearchQuery"
            type="text"
            class="school-search-input"
            placeholder="Search schools..."
            @focus="schoolSearchOpen = true"
            @input="schoolSearchOpen = true"
            @keydown.esc="schoolSearchOpen = false"
          />
          <div v-if="schoolSearchOpen && schoolSearchResults.length" class="school-search-menu">
            <button
              v-for="s in schoolSearchResults"
              :key="s.id"
              type="button"
              class="school-search-item"
              @click="selectSchool(s)"
            >
              <span class="school-search-name">{{ s.name }}</span>
              <span class="school-search-meta">School</span>
            </button>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <select v-model="organizationFilter" @change="applyFilters" class="filter-select">
            <option value="">All Affiliations</option>
            <option v-for="org in availableAffiliations" :key="org.id" :value="org.id">
              {{ org.name }}
            </option>
          </select>
          <button
            v-if="selectedAffiliation"
            class="btn btn-secondary btn-sm"
            type="button"
            @click="goToAffiliationDashboard"
          >
            {{ selectedAffiliation.name }} Dashboard
          </button>
        </div>
        <select v-model="providerFilter" @change="applyFilters" class="filter-select">
          <option value="">All Providers</option>
          <option v-for="provider in availableProviders" :key="provider.id" :value="provider.id">
            {{ provider.first_name }} {{ provider.last_name }}
          </option>
        </select>
        <label class="checkbox-label" style="display:flex; align-items:center; gap: 8px;">
          <input type="checkbox" v-model="skillsOnly" @change="applyFilters" />
          <span>Skills clients only</span>
        </label>
        <select v-model="sortBy" @change="applyFilters" class="filter-select">
          <option value="submission_date-desc">Sort: Submission Date (Newest)</option>
          <option value="submission_date-asc">Sort: Submission Date (Oldest)</option>
          <option value="initials-asc">Sort: Initials / Name (A-Z)</option>
          <option value="initials-desc">Sort: Initials / Name (Z-A)</option>
          <option value="organization_name-asc">Sort: Organization (A-Z)</option>
          <option value="organization_name-desc">Sort: Organization (Z-A)</option>
          <option value="district_name-asc">Sort: District (A-Z)</option>
          <option value="district_name-desc">Sort: District (Z-A)</option>
          <option value="provider_name-asc">Sort: Provider (A-Z)</option>
          <option value="provider_name-desc">Sort: Provider (Z-A)</option>
          <option value="client_status_label-asc">Sort: Client Status (A-Z)</option>
        </select>

        <div class="columns-control">
          <button class="btn btn-secondary btn-sm" type="button" @click="columnsOpen = !columnsOpen">
            Columns
          </button>
          <div v-if="columnsOpen" class="columns-menu" @click.stop>
            <label class="columns-item">
              <input type="checkbox" v-model="columnPrefs.affiliation" />
              <span>Affiliation</span>
            </label>
            <label class="columns-item">
              <input type="checkbox" v-model="columnPrefs.clientStatus" />
              <span>Client Status</span>
            </label>
            <label class="columns-item">
              <input type="checkbox" v-model="columnPrefs.provider" />
              <span>Provider</span>
            </label>
            <label class="columns-item">
              <input type="checkbox" v-model="columnPrefs.submissionDate" />
              <span>Submission Date</span>
            </label>
            <label class="columns-item">
              <input type="checkbox" v-model="columnPrefs.paperwork" />
              <span>Paperwork</span>
            </label>
            <label class="columns-item">
              <input type="checkbox" v-model="columnPrefs.insurance" />
              <span>Insurance</span>
            </label>
            <label class="columns-item">
              <input type="checkbox" v-model="columnPrefs.lastActivity" />
              <span>Last Activity</span>
            </label>
          </div>
        </div>
      </div>

      <div class="pagination-bar" data-tour="clients-pagination">
        <div class="pagination-left">
          <span class="pagination-meta">
            Showing {{ pagedClients.length }} of {{ totalCountForDisplay }}
          </span>
          <select v-model="pageSize" class="filter-select page-size">
            <option :value="25">25 / page</option>
            <option :value="50">50 / page</option>
            <option :value="100">100 / page</option>
          </select>
        </div>
        <div class="pagination-right">
          <button class="btn btn-secondary btn-sm" :disabled="currentPage <= 1" @click="currentPage--">
            Prev
          </button>
          <span class="pagination-meta">Page {{ currentPage }} / {{ totalPages }}</span>
          <button class="btn btn-secondary btn-sm" :disabled="currentPage >= totalPages" @click="currentPage++">
            Next
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading clients...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="filteredClients.length === 0" class="empty-state">
      <p v-if="clients.length === 0">No clients found. Create your first client or import from CSV.</p>
      <p v-else>No clients match your filters.</p>
    </div>

    <div v-else class="clients-table-container" data-tour="clients-table-container">
      <div v-if="selectedIds.size > 0" class="bulk-bar">
        <div class="bulk-left">
          <strong>{{ selectedIds.size }}</strong> selected
          <button class="btn btn-secondary btn-sm" type="button" @click="clearSelection">Clear</button>
        </div>
        <div class="bulk-right">
          <div class="bulk-group">
            <select v-model="bulkPromoteYear" class="filter-select">
              <option value="">Promote to next year…</option>
              <option :value="nextSchoolYear">Next: {{ nextSchoolYear }}</option>
              <option :value="currentSchoolYear">Current: {{ currentSchoolYear }}</option>
            </select>
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              :disabled="!bulkPromoteYear || bulkWorking"
              @click="bulkPromoteToNextYear"
            >
              Promote
            </button>
          </div>

          <div class="bulk-group">
            <select v-model="bulkAffiliationId" class="filter-select">
              <option value="">Move to affiliation…</option>
              <option v-for="org in availableAffiliations" :key="org.id" :value="String(org.id)">{{ org.name }}</option>
            </select>
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              :disabled="!bulkAffiliationId || bulkWorking"
              @click="bulkMoveAffiliation"
            >
              Move
            </button>
          </div>

          <div class="bulk-group">
            <select v-model="bulkClientStatusId" class="filter-select">
              <option value="">Set client status…</option>
              <option v-for="s in clientStatuses" :key="s.id" :value="String(s.id)">{{ s.label }}</option>
            </select>
            <button
              class="btn btn-secondary btn-sm"
              type="button"
              :disabled="!bulkClientStatusId || bulkWorking"
              @click="bulkSetClientStatus"
            >
              Set
            </button>
          </div>

          <div class="bulk-group">
            <div class="muted" style="max-width: 260px;">
              Provider assignment is managed in the client detail <strong>Affiliations</strong> tab.
            </div>
          </div>

          <div class="bulk-group">
            <button class="btn btn-danger btn-sm" type="button" :disabled="bulkWorking" @click="bulkArchive">
              Archive
            </button>
          </div>
        </div>
      </div>
      <table class="clients-table" data-tour="clients-table">
        <thead>
          <tr>
            <th style="width: 34px;">
              <input type="checkbox" :checked="allPageSelected" @change.stop="toggleSelectAllPage($event)" />
            </th>
            <th>{{ clientDisplayLabel }}</th>
            <th v-if="columnPrefs.affiliation">Affiliation</th>
            <th v-if="columnPrefs.clientStatus">Client Status</th>
            <th v-if="columnPrefs.provider">Provider</th>
            <th v-if="columnPrefs.submissionDate">Submission Date</th>
            <th v-if="columnPrefs.paperwork">Document Status</th>
            <th v-if="columnPrefs.insurance">Insurance</th>
            <th v-if="columnPrefs.lastActivity">Last Activity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="client in pagedClients" 
            :key="client.id"
            @click="openClientDetail(client)"
            class="client-row"
          >
            <td class="select-cell" @click.stop>
              <input type="checkbox" :checked="selectedIds.has(client.id)" @change.stop="toggleSelected(client.id)" />
            </td>
            <td class="initials-cell">{{ getClientDisplay(client) }}</td>
            <td v-if="columnPrefs.affiliation">
              <button
                v-if="client.organization_slug"
                type="button"
                class="link-button"
                @click.stop="router.push(`/${client.organization_slug}/dashboard`)"
              >
                {{ client.organization_name || '-' }}
              </button>
              <span v-else>{{ client.organization_name || '-' }}</span>
            </td>
            <td v-if="columnPrefs.clientStatus">
              {{ formatClientStatus(client) }}
            </td>
            <td v-if="columnPrefs.provider">
              {{ client.provider_name || 'Not assigned' }}
            </td>
            <td v-if="columnPrefs.submissionDate">{{ formatDate(client.submission_date) }}</td>
            <td v-if="columnPrefs.paperwork">
              {{ formatDocumentStatusSummary(client) }}
            </td>
            <td v-if="columnPrefs.insurance">{{ client.insurance_type_label || '-' }}</td>
            <td v-if="columnPrefs.lastActivity">{{ formatDate(client.last_activity_at) || '-' }}</td>
            <td class="actions-cell" @click.stop>
              <button @click="openClientDetail(client)" class="btn btn-primary btn-sm">View</button>
              <button
                v-if="canBackofficeEdit"
                @click.stop="startEditStatus(client)" 
                class="btn btn-secondary btn-sm"
              >
                Archive
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Client Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="closeCreateModal">
      <div class="modal-content" @click.stop>
        <h3>Create New Client</h3>
        <form @submit.prevent="createClient">
          <div class="form-group">
            <label>Agency</label>
            <select v-if="canChooseCreateAgency" v-model="createAgencyId">
              <option value="" disabled>Select agency...</option>
              <option v-for="a in agenciesForCreate" :key="a.id" :value="String(a.id)">
                {{ a.name }}
              </option>
            </select>
            <input v-else :value="createAgencyName" disabled />
            <small v-if="!createAgencyEffectiveId">Unable to determine agency for this account.</small>
          </div>
          <div class="form-group">
            <label>Organization (School / Program / Learning / Clinical) *</label>
            <select v-model="newClient.organization_id" required>
              <option value="">Select organization...</option>
              <option v-for="org in availableOrganizations" :key="org.id" :value="org.id">
                {{ org.name }}
              </option>
            </select>
            <small v-if="loadingOrganizations">Loading organizations…</small>
            <small v-else-if="!availableOrganizations.length">No affiliated organizations found for this agency.</small>
          </div>
          <div class="form-group">
            <label>Client Type *</label>
            <select v-model="newClient.client_type" required>
              <option value="" disabled>Select client type...</option>
              <option v-for="opt in allowedCreateClientTypes" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <small>
              Available types follow affiliated organizations. Basic (non-clinical) appears only for agencies using the Employee (non-provider) portal variant.
            </small>
            <small v-if="!(allowedCreateClientTypes || []).length" style="color: var(--danger, #d92d20);">
              No client types are enabled for this agency. Configure affiliations and portal variant first.
            </small>
          </div>
          <div class="form-group">
            <label>Initials *</label>
            <input 
              v-model="newClient.initials" 
              type="text" 
              required 
              maxlength="10"
              placeholder="AbcDef"
            />
            <small>Case is preserved (max 10 characters).</small>
          </div>
          <div class="form-group">
            <label>Provider</label>
            <select v-model="newClient.provider_id" :disabled="providerOptionsLoading || !newClient.organization_id">
              <option :value="null">Not assigned</option>
              <option v-for="provider in availableProvidersForOrg" :key="provider.id" :value="provider.id">
                {{ provider.first_name }} {{ provider.last_name }}
              </option>
            </select>
            <small v-if="providerOptionsLoading">Loading provider schedules…</small>
            <small v-else-if="newClient.organization_id && (availableProvidersForOrg || []).length === 0">
              No scheduled providers found for this organization.
            </small>
          </div>
          <div class="form-group" v-if="newClient.provider_id">
            <label class="checkbox-label" style="display:flex; align-items:center; gap: 8px;">
              <input type="checkbox" v-model="newClient.provider_make_primary" />
              <span>Make provider primary</span>
            </label>
            <small>Primary provider is what shows on the client list and in the client modal.</small>
          </div>
          <div class="form-group" v-if="newClient.provider_id">
            <label>Provider available day *</label>
            <select v-model="newClient.service_day" required>
              <option value="">Select day…</option>
              <option v-for="d in availableServiceDays" :key="d" :value="d">{{ d }}</option>
            </select>
            <small v-if="selectedProviderDayAssignment">
              Slots: <strong>{{ selectedProviderDayAssignment.slots_available }}</strong> / {{ selectedProviderDayAssignment.slots_total }}
              <span v-if="Number(selectedProviderDayAssignment.slots_available) <= 0" style="color: var(--danger, #d92d20);">
                (Over capacity if you add another current client)
              </span>
            </small>
            <small v-else>Days are sourced from the provider’s schedule for this organization.</small>
          </div>
          <div class="form-group">
            <label>Client Status</label>
            <select v-model="newClient.client_status_id">
              <option :value="null">—</option>
              <option v-for="s in clientStatuses" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Insurance *</label>
            <select v-model="newClient.insurance_type_id" :disabled="createInsuranceLoading" required>
              <option :value="null" disabled>Select insurance…</option>
              <option v-for="it in createInsuranceTypes" :key="it.id" :value="it.id">{{ it.label }}</option>
            </select>
            <small v-if="createInsuranceLoading">Loading insurance types…</small>
            <small v-else-if="createInsuranceError">{{ createInsuranceError }}</small>
          </div>
          <div class="form-group">
            <label>Referral Date</label>
            <input v-model="newClient.referral_date" type="date" />
            <small>Defaults to today.</small>
          </div>
          <div class="form-group">
            <label>Document Date</label>
            <input v-model="newClient.doc_date" type="date" />
            <small>Optional. Tracks the effective date for the current paperwork status.</small>
          </div>
          <div class="form-group" v-if="selectedOrgIsSchool">
            <label>Document delivery method</label>
            <select v-model="newClient.paperwork_delivery_method_id" :disabled="deliveryMethodsLoading">
              <option :value="null">—</option>
              <option v-for="m in deliveryMethods" :key="m.id" :value="m.id">{{ m.label }}</option>
            </select>
            <small>How paperwork was obtained (e.g., emailed, sent home, portal, school email, unknown).</small>
          </div>
          <div class="form-group">
            <label>Client primary language</label>
            <select
              class="filter-select"
              :value="newClient.primary_client_language || ''"
              :disabled="languagesLoading"
              @change="handleLanguageSelectChange('client', $event)"
            >
              <option value="">—</option>
              <option v-for="l in languageOptions" :key="l.id" :value="l.label">{{ l.label }}</option>
              <option value="__add__">Add language…</option>
            </select>
            <div v-if="addingLanguageFor === 'client'" style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
              <input v-model="newLanguageLabel" type="text" placeholder="Enter language (e.g., Haitian Creole)" />
              <button class="btn btn-primary btn-sm" type="button" :disabled="savingLanguage || !newLanguageLabel.trim()" @click="saveNewLanguage('client')">
                {{ savingLanguage ? 'Saving…' : 'Save' }}
              </button>
              <button class="btn btn-secondary btn-sm" type="button" :disabled="savingLanguage" @click="cancelAddLanguage">
                Cancel
              </button>
            </div>
          </div>
          <div class="form-group">
            <label>Guardian primary language</label>
            <select
              class="filter-select"
              :value="newClient.primary_parent_language || ''"
              :disabled="languagesLoading"
              @change="handleLanguageSelectChange('guardian', $event)"
            >
              <option value="">—</option>
              <option v-for="l in languageOptions" :key="l.id" :value="l.label">{{ l.label }}</option>
              <option value="__add__">Add language…</option>
            </select>
            <div v-if="addingLanguageFor === 'guardian'" style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">
              <input v-model="newLanguageLabel" type="text" placeholder="Enter language (e.g., Haitian Creole)" />
              <button class="btn btn-primary btn-sm" type="button" :disabled="savingLanguage || !newLanguageLabel.trim()" @click="saveNewLanguage('guardian')">
                {{ savingLanguage ? 'Saving…' : 'Save' }}
              </button>
              <button class="btn btn-secondary btn-sm" type="button" :disabled="savingLanguage" @click="cancelAddLanguage">
                Cancel
              </button>
            </div>
          </div>
          <div class="form-group">
            <label>School Year</label>
            <input v-model="newClient.school_year" type="text" placeholder="2025-2026" />
            <small>Optional. Format: YYYY-YYYY</small>
          </div>
          <div class="form-group">
            <label>Grade</label>
            <select v-model="newClient.grade" class="filter-select">
              <option v-for="o in STANDARD_GRADE_SELECT_OPTIONS" :key="`nc-grade-${o.value}`" :value="o.value">{{
                o.label
              }}</option>
            </select>
            <small>Optional. Uses K and 1st–12th; school-year rollover advances to the next grade when applicable.</small>
          </div>
          <div class="form-group">
            <label class="checkbox-label" style="display:flex; align-items:center; gap: 8px;">
              <input type="checkbox" v-model="newClient.skills" />
              <span>Skills client</span>
            </label>
            <small>Marks this client as eligible for Skills Groups.</small>
          </div>
          <div class="form-group">
            <label>Submission Date *</label>
            <input v-model="newClient.submission_date" type="date" required />
          </div>
          <div class="form-group">
            <label>Document Status</label>
            <div class="hint" style="margin-bottom: 6px;">
              Select which items are <strong>Needed</strong>. When none are needed, status is <strong>Completed</strong>.
            </div>
            <div style="padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt);">
              <div class="check-row" style="margin-bottom: 6px;">
                <label class="check-left">
                  <input type="checkbox" :checked="createDocsIsCompleted" disabled />
                  <span class="check-label"><strong>Completed</strong></span>
                </label>
                <div class="check-right">
                  <span v-if="createDocsIsCompleted" class="badge badge-success">Yes</span>
                  <span v-else class="badge badge-secondary">No</span>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="creating || !createPaperworkStatuses.length"
                    @click="markCreateDocsCompleted"
                    style="margin-left: 10px;"
                  >
                    Mark completed
                  </button>
                </div>
              </div>

              <div v-if="createPaperworkStatusesLoading" class="hint">Loading…</div>
              <div v-else-if="createPaperworkStatusesError" class="error" style="margin: 0;">{{ createPaperworkStatusesError }}</div>
              <div v-else>
                <div v-for="s in createPaperworkStatuses" :key="s.id" class="check-row">
                  <label class="check-left">
                    <input
                      type="checkbox"
                      :disabled="creating"
                      :checked="createDocsNeededIds.includes(Number(s.id))"
                      @change="toggleCreateDocNeeded(s.id, $event)"
                    />
                    <span class="check-label">{{ s.label }}</span>
                  </label>
                  <div class="check-right">
                    <span v-if="createDocsNeededIds.includes(Number(s.id))" class="badge badge-warning">Needed</span>
                    <span v-else class="badge badge-secondary">Received</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeCreateModal" class="btn btn-secondary">Cancel</button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="creating || !createAgencyEffectiveId || !newClient.organization_id || !newClient.client_type || !String(newClient.initials || '').trim() || !newClient.submission_date || !newClient.insurance_type_id || (newClient.provider_id && !newClient.service_day)"
            >
              {{ creating ? 'Creating...' : 'Create Client' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Rollover Modal (extra confirmation gates) -->
    <div v-if="showRolloverModal" class="modal-overlay" @click.self="closeRolloverModal">
      <div class="modal-content" @click.stop style="max-width: 720px;">
        <h3>{{ rolloverAction === 'reset_docs' ? 'Reset Documentation' : 'Rollover School Year' }}</h3>
        <p style="margin-top: 6px; color: var(--text-secondary);">
          <template v-if="rolloverAction === 'reset_docs'">
            This is a high-impact action. It will reset documentation status for many clients at once (sets paperwork to “New Docs” and clears delivery/doc dates).
          </template>
          <template v-else>
            This is a high-impact action. It will update many clients at once and reset paperwork fields to “New Docs”.
          </template>
        </p>

        <div v-if="rolloverAction !== 'reset_docs'" class="form-group" style="margin-top: 12px;">
          <label>To School Year</label>
          <input :value="normalizeSchoolYearLabel(nextSchoolYear)" disabled />
          <small>Target year is calculated automatically.</small>
        </div>

        <div class="form-group">
          <label>Scope</label>
          <select v-model="rolloverScope">
            <option v-if="organizationFilter" value="selected">Selected affiliation only</option>
            <option value="all">All affiliations</option>
          </select>
          <small v-if="organizationFilter && rolloverScope === 'selected'">
            Will rollover clients in: <strong>{{ selectedAffiliation?.name || 'selected affiliation' }}</strong>
          </small>
          <small v-else-if="rolloverScope === 'all'">
            Will rollover all non-archived clients you have access to.
          </small>
        </div>

        <div class="modal-actions" style="justify-content: flex-start; gap: 10px; margin-top: 8px;">
          <button class="btn btn-secondary" type="button" :disabled="rolloverWorking" @click="runRolloverPreview">
            {{ rolloverWorking ? 'Previewing…' : 'Preview impact' }}
          </button>
          <span v-if="rolloverPreview" class="muted">
            Preview: <strong>{{ Number(rolloverPreview?.willUpdate || 0) }}</strong> client(s) will be updated.
          </span>
        </div>

        <div v-if="rolloverPreview" style="margin-top: 14px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt);">
          <div style="color: var(--text-secondary); font-size: 13px;">
            <template v-if="rolloverAction === 'reset_docs'">
              Confirm you want to reset documentation for <strong>{{ Number(rolloverPreview?.willUpdate || 0) }}</strong> client(s).
            </template>
            <template v-else>
              Confirm you want to rollover <strong>{{ Number(rolloverPreview?.willUpdate || 0) }}</strong> client(s)
              to <strong>{{ normalizeSchoolYearLabel(nextSchoolYear) }}</strong>.
            </template>
          </div>
          <div style="margin-top: 10px;">
            <label style="display: flex; gap: 8px; align-items: center;">
              <input type="checkbox" v-model="rolloverConfirmChecked" />
              <span v-if="rolloverAction === 'reset_docs'">I understand this will reset documentation status to “New Docs”.</span>
              <span v-else>I understand this will reset paperwork fields to “New Docs”.</span>
            </label>
          </div>
          <div class="form-group" style="margin-top: 10px;">
            <label>Type to confirm</label>
            <input v-model="rolloverConfirmText" type="text" :placeholder="rolloverConfirmPhrase" />
            <small>Required: <strong>{{ rolloverConfirmPhrase }}</strong></small>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 14px;">
          <button type="button" class="btn btn-secondary" :disabled="rolloverWorking" @click="closeRolloverModal">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-danger"
            :disabled="!canExecuteRollover || rolloverWorking"
            @click="executeRollover"
          >
            {{ rolloverWorking ? 'Rolling over…' : 'Execute rollover' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Imported Clients Modal (superadmin only) -->
    <div v-if="showDeleteImportedModal" class="modal-overlay" @click.self="closeDeleteImportedModal">
      <div class="modal-content" @click.stop style="max-width: 720px;">
        <h3>Delete Imported Clients</h3>
        <p style="margin-top: 6px; color: var(--text-secondary);">
          This will permanently delete clients that were created via bulk import (<code>source = BULK_IMPORT</code>) for the currently selected agency.
        </p>

        <div class="form-group" style="margin-top: 12px;">
          <label>Agency</label>
          <input :value="String(activeAgencyId || '')" disabled />
          <small>Uses the active agency from the header context.</small>
        </div>

        <div class="modal-actions" style="justify-content: flex-start; gap: 10px; margin-top: 8px;">
          <button class="btn btn-secondary" type="button" :disabled="deleteImportedWorking || !activeAgencyId" @click="runDeleteImportedPreview">
            {{ deleteImportedWorking ? 'Previewing…' : 'Preview impact' }}
          </button>
          <span v-if="deleteImportedPreview" class="muted">
            Preview: <strong>{{ Number(deleteImportedPreview?.willDeleteClients || 0) }}</strong> client(s) will be deleted.
          </span>
        </div>

        <div v-if="deleteImportedPreview" style="margin-top: 14px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-alt);">
          <div style="color: var(--text-secondary); font-size: 13px;">
            Confirm you want to delete <strong>{{ Number(deleteImportedPreview?.willDeleteClients || 0) }}</strong> bulk-imported client(s).
          </div>
          <div style="margin-top: 10px;">
            <label style="display: flex; gap: 8px; align-items: center;">
              <input type="checkbox" v-model="deleteImportedConfirmChecked" />
              <span>I understand this permanently deletes client records.</span>
            </label>
          </div>
          <div class="form-group" style="margin-top: 10px;">
            <label>Type to confirm</label>
            <input v-model="deleteImportedConfirmText" type="text" :placeholder="deleteImportedConfirmPhrase" />
            <small>Required: <strong>{{ deleteImportedConfirmPhrase }}</strong></small>
          </div>
        </div>

        <div class="modal-actions" style="margin-top: 14px;">
          <button type="button" class="btn btn-secondary" :disabled="deleteImportedWorking" @click="closeDeleteImportedModal">
            Cancel
          </button>
          <button
            type="button"
            class="btn btn-danger"
            :disabled="!canExecuteDeleteImported || deleteImportedWorking"
            @click="executeDeleteImported"
          >
            {{ deleteImportedWorking ? 'Deleting…' : 'Delete imported clients' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Duplicate initials modal -->
    <div v-if="dupesModalOpen" class="modal-overlay" @click.self="closeDupesModal">
      <div class="modal-content" @click.stop style="max-width: 860px;">
        <h3>Similar client code found</h3>
        <p style="margin-top: 6px; color: var(--text-secondary);">
          We found one or more clients with the same code in the database. If it’s the same student, unarchive instead of creating a duplicate.
        </p>

        <div style="margin-top: 12px; overflow-x: auto;">
          <table class="clients-table" style="min-width: 780px;">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Affiliation</th>
                <th>Prior Provider</th>
                <th>Client Status</th>
                <th>Archived?</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in dupesMatches" :key="m.clientId">
                <td>{{ m.agencyName || '-' }}</td>
                <td>{{ m.organizationName || '-' }}</td>
                <td>{{ m.providerName || '-' }}</td>
                <td>{{ m.clientStatusLabel || '-' }}</td>
                <td>{{ String(m.workflowStatus || '').toUpperCase() === 'ARCHIVED' ? 'Yes' : 'No' }}</td>
                <td>
                  <button
                    class="btn btn-primary btn-sm"
                    type="button"
                    :disabled="String(m.workflowStatus || '').toUpperCase() !== 'ARCHIVED'"
                    @click="unarchiveMatch(m)"
                  >
                    Unarchive
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="modal-actions" style="margin-top: 14px;">
          <button type="button" class="btn btn-secondary" @click="closeDupesModal">Close</button>
        </div>
      </div>
    </div>

    <!-- Bulk Import Modal -->
    <BulkClientImporter
      v-if="showBulkImportModal"
      @close="showBulkImportModal = false"
      @imported="handleBulkImported"
    />

    <!-- Superadmin: Hidden Tenants Settings Modal -->
    <div v-if="showHiddenTenantsModal" class="modal-overlay" @click.self="showHiddenTenantsModal = false">
      <div class="modal-content" @click.stop style="max-width: 480px;">
        <h3 style="margin-bottom: 4px;">Platform Tenant Visibility</h3>
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
          Choose which tenants appear in the platform-wide client list. Hidden tenants are excluded by default; you can still filter to them individually.
        </p>
        <div style="display: flex; flex-direction: column; gap: 4px; max-height: 320px; overflow-y: auto;">
          <label
            v-for="tenant in allTenantFilters"
            :key="tenant.id"
            class="columns-item"
            style="padding: 8px 10px; border-radius: 8px; background: var(--bg-alt);"
          >
            <input
              type="checkbox"
              :checked="!hiddenTenantIds.has(Number(tenant.id))"
              @change="toggleHiddenTenant(tenant.id, $event)"
            />
            <span style="font-weight: 500;">{{ tenant.name }}</span>
          </label>
        </div>
        <div class="modal-actions" style="margin-top: 16px; justify-content: flex-end;">
          <button type="button" class="btn btn-secondary" @click="showHiddenTenantsModal = false">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import api from '../../services/api';
import BulkClientImporter from '../../components/admin/BulkClientImporter.vue';
import { STANDARD_GRADE_SELECT_OPTIONS, normalizeGradeForSave } from '../../utils/clientGrade.js';
import { useRouteTenantAgencyId } from '../../composables/useRouteTenantAgencyId.js';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const router = useRouter();
const route = useRoute();
const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const tenantSourceOrganizations = computed(() => (
  isSuperAdmin.value ? (agencyStore.agencies || []) : (agencyStore.userAgencies || [])
));
const { routeTenantAgencyId } = useRouteTenantAgencyId(route, tenantSourceOrganizations);

const canBackofficeEdit = computed(() => {
  const r = String(authStore.user?.role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff'].includes(r);
});

const schoolOverviewLink = computed(() => {
  const slug = route.params?.organizationSlug;
  const base = typeof slug === 'string' && slug ? `/${slug}/admin/schools/overview` : '/admin/schools/overview';
  return `${base}?orgType=school`;
});

// Client table column visibility (persisted locally per user)
const columnsOpen = ref(false);
const columnsStorageKey = computed(() => `client_mgmt_columns_v1_${authStore.user?.id || 'anon'}`);
const columnPrefs = ref({
  affiliation: true,
  clientStatus: true,
  provider: true,
  submissionDate: true,
  paperwork: true,
  insurance: true,
  lastActivity: true
});

const loadColumnPrefs = () => {
  try {
    const raw = localStorage.getItem(columnsStorageKey.value);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      columnPrefs.value = { ...columnPrefs.value, ...parsed };
    }
  } catch {
    // ignore
  }
};

watch(
  () => columnPrefs.value,
  (v) => {
    try {
      localStorage.setItem(columnsStorageKey.value, JSON.stringify(v));
    } catch {
      // ignore
    }
  },
  { deep: true }
);

const clients = ref([]);
const loading = ref(false);
const error = ref('');
const searchQuery = ref('');
const clientStatusFilter = ref('');
const workflowStatusFilter = ref('');
const organizationFilter = ref('');
const providerFilter = ref('');
const skillsOnly = ref(false);
const sortBy = ref('submission_date-desc');

// Display mode: 'initials' (default/private), 'full_name', 'code'
const DISPLAY_MODE_STORAGE_KEY = `cmv_display_mode_v1_${authStore.user?.id || 'anon'}`;
const displayMode = ref(
  (() => { try { return localStorage.getItem(DISPLAY_MODE_STORAGE_KEY) || 'initials'; } catch { return 'initials'; } })()
);
watch(() => displayMode.value, (v) => {
  try { localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, v); } catch { /* ignore */ }
});
const clientDisplayLabel = computed(() => {
  if (displayMode.value === 'full_name') return 'Name';
  if (displayMode.value === 'code') return 'Code';
  return 'Initials';
});
const getClientDisplay = (client) => {
  if (displayMode.value === 'full_name') return client.full_name || client.initials || '-';
  if (displayMode.value === 'code') return client.identifier_code || client.initials || '-';
  return client.initials || '-';
};

const WORKFLOW_STATUS_OPTIONS = [
  { value: 'PACKET', label: 'Packet' },
  { value: 'SCREENER', label: 'Screener' },
  { value: 'RETURNING', label: 'Returning' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'DECLINED', label: 'Declined' }
];
const showCreateModal = ref(false);
const openCreateClientModal = async () => {
  showCreateModal.value = true;
  // Ensure agency is set so org dropdown can populate immediately.
  if (!createAgencyId.value && activeAgencyId.value) {
    createAgencyId.value = String(activeAgencyId.value);
  }
  await fetchLinkedOrganizations();
  if (!(allowedCreateClientTypes.value || []).some((o) => o.value === newClient.value.client_type)) {
    newClient.value.client_type = allowedCreateClientTypes.value?.[0]?.value || '';
  }
  await fetchCreatePaperworkStatuses();
  await fetchCreateInsuranceTypes();
  await fetchLanguageOptions();
};
const showBulkImportModal = ref(false);
const creating = ref(false);
const linkedOrganizations = ref([]);
const loadingOrganizations = ref(false);
const clientStatuses = ref([]);

// Create-client: Insurance (required)
const createInsuranceTypes = ref([]);
const createInsuranceLoading = ref(false);
const createInsuranceError = ref('');

const fetchCreateInsuranceTypes = async () => {
  try {
    createInsuranceLoading.value = true;
    createInsuranceError.value = '';
    const agencyId = createAgencyEffectiveId.value ? Number(createAgencyEffectiveId.value) : null;
    if (!agencyId) {
      createInsuranceTypes.value = [];
      createInsuranceError.value = 'Unable to determine agency for insurance types.';
      return;
    }
    const r = await api.get('/client-settings/insurance-types', { params: { agencyId } });
    const rows = Array.isArray(r.data) ? r.data : [];
    createInsuranceTypes.value = rows
      .filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true))
      .sort((a, b) => String(a?.label || '').localeCompare(String(b?.label || '')));
  } catch (e) {
    createInsuranceTypes.value = [];
    createInsuranceError.value = e.response?.data?.error?.message || 'Failed to load insurance types';
  } finally {
    createInsuranceLoading.value = false;
  }
};

// Create-client: Document Status (Needed/Received) selection
const createPaperworkStatuses = ref([]);
const createPaperworkStatusesLoading = ref(false);
const createPaperworkStatusesError = ref('');
const createDocsNeededIds = ref([]);
const createDocsIsCompleted = computed(() => (createDocsNeededIds.value || []).length === 0);

// Create-client: Language dropdowns (global catalog)
const languageOptions = ref([]);
const languagesLoading = ref(false);
const languagesError = ref('');
const addingLanguageFor = ref(''); // '' | 'client' | 'guardian'
const newLanguageLabel = ref('');
const savingLanguage = ref(false);

const fetchLanguageOptions = async () => {
  try {
    languagesLoading.value = true;
    languagesError.value = '';
    const r = await api.get('/client-settings/languages');
    const rows = Array.isArray(r.data) ? r.data : [];
    languageOptions.value = rows
      .filter((x) => x && (x.is_active === undefined || x.is_active === 1 || x.is_active === true))
      .sort((a, b) => String(a?.label || '').localeCompare(String(b?.label || '')));
  } catch (e) {
    languageOptions.value = [];
    languagesError.value = e.response?.data?.error?.message || 'Failed to load languages';
  } finally {
    languagesLoading.value = false;
  }
};

const cancelAddLanguage = () => {
  addingLanguageFor.value = '';
  newLanguageLabel.value = '';
};

const handleLanguageSelectChange = (which, evt) => {
  const v = String(evt?.target?.value || '');
  if (v === '__add__') {
    addingLanguageFor.value = which;
    newLanguageLabel.value = '';
    return;
  }
  if (which === 'client') newClient.value.primary_client_language = v;
  else newClient.value.primary_parent_language = v;
  cancelAddLanguage();
};

const saveNewLanguage = async (which) => {
  const label = String(newLanguageLabel.value || '').trim();
  if (!label) return;
  try {
    savingLanguage.value = true;
    const r = await api.post('/client-settings/languages', { label });
    await fetchLanguageOptions();
    const savedLabel = String(r.data?.label || label).trim();
    if (which === 'client') newClient.value.primary_client_language = savedLabel;
    else newClient.value.primary_parent_language = savedLabel;
    cancelAddLanguage();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to add language');
  } finally {
    savingLanguage.value = false;
  }
};

const DOCUMENT_STATUS_KEYS_ORDER = [
  'completed',
  're_auth',
  'new_insurance',
  'insurance_payment_auth',
  'emailed_packet',
  'roi',
  'renewal',
  'new_docs',
  'disclosure_consent',
  'balance'
];

const fetchCreatePaperworkStatuses = async () => {
  try {
    createPaperworkStatusesLoading.value = true;
    createPaperworkStatusesError.value = '';
    const agencyId = createAgencyEffectiveId.value ? Number(createAgencyEffectiveId.value) : null;
    if (!agencyId) {
      createPaperworkStatuses.value = [];
      createDocsNeededIds.value = [];
      createPaperworkStatusesError.value = 'Unable to determine agency for document statuses.';
      return;
    }
    const r = await api.get('/client-settings/paperwork-statuses', { params: { agencyId } });
    const rows = Array.isArray(r.data) ? r.data : [];
    const active = rows.filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true));
    // Exclude "completed" from selectable-needed list (completed is computed/derived),
    // but keep a deterministic order based on the fixed key list.
    const byKey = new Map(active.map((s) => [String(s.status_key || s.statusKey || '').toLowerCase(), s]));
    const ordered = DOCUMENT_STATUS_KEYS_ORDER
      .filter((k) => k !== 'completed')
      .map((k) => byKey.get(k))
      .filter(Boolean);
    // Fallback: append any unknown active statuses (stable sort by label).
    const known = new Set(ordered.map((s) => Number(s.id)));
    const extras = active
      .filter((s) => String(s.status_key || s.statusKey || '').toLowerCase() !== 'completed')
      .filter((s) => !known.has(Number(s.id)))
      .sort((a, b) => String(a?.label || '').localeCompare(String(b?.label || '')));
    createPaperworkStatuses.value = [...ordered, ...extras];
    // Default: everything is Needed (matches seed behavior).
    createDocsNeededIds.value = createPaperworkStatuses.value.map((s) => Number(s.id)).filter((n) => Number.isFinite(n));
  } catch (e) {
    createPaperworkStatuses.value = [];
    createDocsNeededIds.value = [];
    createPaperworkStatusesError.value = e.response?.data?.error?.message || 'Failed to load document statuses';
  } finally {
    createPaperworkStatusesLoading.value = false;
  }
};

const toggleCreateDocNeeded = (statusId, event) => {
  const id = statusId ? Number(statusId) : null;
  if (!id) return;
  const checked = !!event?.target?.checked; // checked = Needed
  const cur = new Set((createDocsNeededIds.value || []).map((x) => Number(x)));
  if (checked) cur.add(id);
  else cur.delete(id);
  createDocsNeededIds.value = Array.from(cur);
};

const markCreateDocsCompleted = () => {
  createDocsNeededIds.value = [];
};

// Search debounce (prevents fetch + focus loss while typing)
let searchDebounceTimer = null;
const onSearchInput = () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentPage.value = 1;
    fetchClients();
  }, 250);
};

const currentPage = ref(1);
const pageSize = ref(50);
const platformTenantFilter = ref('');
const serverTotal = ref(0);

// Bulk selection + actions
const selectedIds = ref(new Set());
const bulkWorking = ref(false);
const bulkAffiliationId = ref('');
const bulkClientStatusId = ref('');
const bulkPromoteYear = ref('');

// New client form
const newClient = ref({
  organization_id: null,
  client_type: '',
  initials: '',
  provider_id: null,
  provider_make_primary: true,
  service_day: '',
  client_status_id: null,
  insurance_type_id: null,
  school_year: '',
  grade: '',
  skills: false,
  submission_date: new Date().toISOString().split('T')[0],
  referral_date: new Date().toISOString().split('T')[0],
  doc_date: '',
  paperwork_delivery_method_id: null,
  primary_client_language: '',
  primary_parent_language: ''
});

const dupesModalOpen = ref(false);
const dupesMatches = ref([]);
const dupesForNewClient = ref(null);

const activeAgencyId = computed(() => {
  if (routeTenantAgencyId.value) return routeTenantAgencyId.value;

  const current = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
  if (!current?.id) {
    // Platform mode for super-admin is explicit: no current agency means "all tenants".
    if (isSuperAdmin.value) return null;
  }
  const currentType = String(current?.organization_type || current?.organizationType || 'agency').toLowerCase();

  // Direct agency: use its id
  if (current?.id && currentType === 'agency') return current.id;

  // School/program/learning: resolve parent agency (clients belong to the agency, not the school)
  if (['school', 'program', 'learning', 'clinical'].includes(currentType)) {
    const parentFromCurrent = Number(current?.affiliated_agency_id || current?.affiliatedAgencyId || 0);
    if (parentFromCurrent > 0) return parentFromCurrent;
    // Fallback: match against userAgencies (current may be a partial record without affiliated_agency_id)
    const orgId = Number(current?.id || 0);
    if (orgId > 0) {
      const fromStore = authStore.user?.role === 'super_admin' ? agencyStore.agencies : agencyStore.userAgencies;
      const match = (fromStore || []).find((a) => Number(a?.id || 0) === orgId);
      const parentFromList = Number(match?.affiliated_agency_id || match?.affiliatedAgencyId || 0);
      if (parentFromList > 0) return parentFromList;
    }
  }

  // Fallback: pick first agency-type org from the user's list
  const fromStore = isSuperAdmin.value ? agencyStore.agencies : agencyStore.userAgencies;
  const firstAgency = (fromStore || []).find((a) => String(a?.organization_type || a?.organizationType || 'agency').toLowerCase() === 'agency');
  return firstAgency?.id || null;
});
const usingServerPagination = computed(() => isSuperAdmin.value && !activeAgencyId.value);

const effectiveAgencyScopeId = computed(() => {
  if (activeAgencyId.value) return Number(activeAgencyId.value);
  const platformTenantId = Number(platformTenantFilter.value || 0);
  if (platformTenantId > 0) return platformTenantId;
  return null;
});

const allTenantFilters = computed(() => {
  return (tenantSourceOrganizations.value || [])
    .filter((o) => String(o?.organization_type || o?.organizationType || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

// Hidden-tenant settings (super_admin, per-user, persisted in localStorage)
const hiddenTenantsStorageKey = computed(() =>
  `cmv_hidden_tenants_v1_${authStore.user?.id || 'anon'}`
);
const hiddenTenantIds = ref(new Set());
const showHiddenTenantsModal = ref(false);

const loadHiddenTenants = () => {
  try {
    const raw = localStorage.getItem(hiddenTenantsStorageKey.value);
    const arr = raw ? JSON.parse(raw) : [];
    hiddenTenantIds.value = new Set(Array.isArray(arr) ? arr.map(Number) : []);
  } catch {
    hiddenTenantIds.value = new Set();
  }
};

const saveHiddenTenants = () => {
  try {
    localStorage.setItem(
      hiddenTenantsStorageKey.value,
      JSON.stringify(Array.from(hiddenTenantIds.value))
    );
  } catch {
    // ignore
  }
};

const toggleHiddenTenant = (id, event) => {
  const num = Number(id);
  const visible = !!event?.target?.checked;
  const next = new Set(hiddenTenantIds.value);
  if (visible) {
    next.delete(num);
  } else {
    next.add(num);
  }
  hiddenTenantIds.value = next;
  saveHiddenTenants();
  // Refetch so the list updates immediately
  currentPage.value = 1;
  fetchClients();
};

const availableTenantFilters = computed(() => {
  return allTenantFilters.value.filter(
    (o) => !hiddenTenantIds.value.has(Number(o.id))
  );
});

// Create-client modal: allow selecting agency when user has multiple agencies
const createAgencyId = ref('');
const agenciesForCreate = computed(() => {
  const base =
    authStore.user?.role === 'super_admin'
      ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
      : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  const list = base;
  return list
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});
const canChooseCreateAgency = computed(() => {
  return (agenciesForCreate.value || []).length > 1 && authStore.user?.role !== 'school_staff';
});
const createAgencyEffectiveId = computed(() => {
  const chosen = createAgencyId.value ? parseInt(String(createAgencyId.value), 10) : null;
  return chosen || activeAgencyId.value || null;
});
const createAgencyName = computed(() => {
  const id = createAgencyEffectiveId.value;
  if (!id) return '';
  const row = (agenciesForCreate.value || []).find((a) => Number(a?.id) === Number(id)) || null;
  return row?.name || String(id);
});
const selectedCreateAgency = computed(() => {
  const id = Number(createAgencyEffectiveId.value || 0);
  if (!id) return null;
  return (agenciesForCreate.value || []).find((a) => Number(a?.id) === id) || null;
});
const parseAgencyFeatureFlags = (agency) => {
  const raw = agency?.feature_flags ?? agency?.featureFlags ?? null;
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return {};
};
const currentPortalVariant = computed(() => {
  const flags = parseAgencyFeatureFlags(selectedCreateAgency.value);
  return String(flags?.portalVariant || 'healthcare_provider').trim().toLowerCase();
});

const fetchLinkedOrganizations = async () => {
  try {
    loadingOrganizations.value = true;
    const agencyId = createAgencyEffectiveId.value;
    if (!agencyId) {
      linkedOrganizations.value = [];
      return;
    }

    // Agency-side: prefer affiliation-based list (schools/programs/learning). Fallback to legacy agency↔school links if needed.
    try {
      const resp = await api.get(`/agencies/${agencyId}/affiliated-organizations`);
      const rows = Array.isArray(resp.data) ? resp.data : [];
      linkedOrganizations.value = rows
        .filter((o) => String(o?.organization_type || '').toLowerCase() !== 'agency')
        .map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug || o.portal_url || null,
          organization_type: o.organization_type,
          is_active: o.is_active !== false,
          district_name: o.district_name || null,
          affiliated_agency_id: Number(agencyId)
        }));
    } catch (e) {
      // Legacy fallback (schools only)
      const response = await api.get(`/agencies/${agencyId}/schools`);
      const rows = response.data || [];
      linkedOrganizations.value = rows.map((r) => ({
        id: r.school_organization_id,
        name: r.school_name,
        slug: r.school_slug,
        organization_type: r.school_organization_type,
        is_active: r.school_is_active,
        district_name: r.district_name || null,
        affiliated_agency_id: Number(agencyId)
      }));
    }
  } catch (err) {
    console.error('Failed to fetch linked organizations:', err);
    linkedOrganizations.value = [];
  } finally {
    loadingOrganizations.value = false;
  }
};

// Get available organizations (school/program/learning only; never agency)
const availableOrganizations = computed(() => {
  // We intentionally show only orgs linked to the active agency, so client creation is valid.
  return linkedOrganizations.value || [];
});

const allowedCreateClientTypes = computed(() => {
  const set = new Set();
  for (const org of availableOrganizations.value || []) {
    const t = String(org?.organization_type || '').trim().toLowerCase();
    if (t === 'school') set.add('school');
    if (t === 'learning') {
      set.add('learning');
      set.add('clinical');
    }
    if (t === 'clinical' || t === 'program') set.add('clinical');
  }
  if (currentPortalVariant.value === 'employee') set.add('basic_nonclinical');
  const order = ['school', 'learning', 'clinical', 'basic_nonclinical'];
  const labels = {
    basic_nonclinical: 'Basic (Non-Clinical)',
    school: 'School',
    learning: 'Learning',
    clinical: 'Clinical'
  };
  return order.filter((k) => set.has(k)).map((value) => ({ value, label: labels[value] || value }));
});

const availableSchools = computed(() => {
  return (availableOrganizations.value || []).filter(
    (o) => String(o?.organization_type || '').toLowerCase() === 'school'
  );
});

const showSchoolSearch = computed(() => {
  // Only show when the user actually has schools in scope (superadmin = platform-wide).
  return (availableSchools.value || []).length > 0;
});

const schoolSearchQuery = ref('');
const schoolSearchOpen = ref(false);

const schoolSearchResults = computed(() => {
  const list = availableSchools.value || [];
  const q = String(schoolSearchQuery.value || '').trim().toLowerCase();
  const ranked = q
    ? list
        .filter((s) => String(s?.name || '').toLowerCase().includes(q))
        .slice(0, 20)
    : list.slice(0, 12);
  return ranked;
});

const selectSchool = (school) => {
  if (!school?.id) return;
  organizationFilter.value = String(school.id);
  // Keep the typed value stable as a “selection”
  schoolSearchQuery.value = school.name || '';
  schoolSearchOpen.value = false;
  applyFilters();
};

const availableAffiliations = computed(() => {
  return (availableOrganizations.value || []).filter(
    (o) => String(o?.organization_type || '').toLowerCase() !== 'agency'
  );
});

const selectedAffiliation = computed(() => {
  const id = Number(organizationFilter.value);
  if (!id) return null;
  return (availableAffiliations.value || []).find((o) => Number(o?.id) === id) || null;
});

const goToAffiliationDashboard = () => {
  if (!selectedAffiliation.value?.slug) return;
  router.push(`/${selectedAffiliation.value.slug}/dashboard`);
};

// Get available providers
const availableProviders = ref([]);
const providerOptionsLoading = ref(false);
const providerAssignmentsForOrg = ref([]);
const affiliatedProvidersForOrg = ref([]); // providers linked to school even if not scheduled yet

const deliveryMethodsLoading = ref(false);
const deliveryMethods = ref([]);

const selectedNewClientOrg = computed(() => {
  const id = Number(newClient.value?.organization_id);
  if (!id) return null;
  return (availableOrganizations.value || []).find((o) => Number(o?.id) === id) || null;
});

const selectedOrgIsSchool = computed(() => {
  return String(selectedNewClientOrg.value?.organization_type || '').toLowerCase() === 'school';
});

const providersWithOpenSlotsForOrg = computed(() => {
  const set = new Set();
  for (const a of providerAssignmentsForOrg.value || []) {
    if (!a) continue;
    const active = a.is_active === undefined ? true : !!a.is_active;
    if (!active) continue;
    // Hide full days for individual booking: only treat a provider as "available" if they have
    // at least one active day with slots_available > 0. If slots_available is missing, treat as available (best-effort).
    const avail = a.slots_available;
    const hasCapacity = avail === null || avail === undefined ? true : Number(avail) > 0;
    if (hasCapacity) set.add(Number(a.provider_user_id));
  }
  return set;
});

const availableProvidersForOrg = computed(() => {
  const orgId = Number(newClient.value?.organization_id);
  if (!orgId) return [];
  const allowed = providersWithOpenSlotsForOrg.value;
  const affiliatedIds = new Set((affiliatedProvidersForOrg.value || []).map((p) => Number(p?.id)).filter((n) => Number.isFinite(n) && n > 0));
  // If we haven't loaded assignments yet, fall back to all providers (non-blocking).
  if (!allowed || allowed.size === 0) {
    // Prefer org-affiliated list when available.
    if (affiliatedIds.size > 0) return (availableProviders.value || []).filter((p) => affiliatedIds.has(Number(p.id)));
    return availableProviders.value || [];
  }
  // Normal case: show those with capacity, plus rare affiliated-without-schedule providers.
  return (availableProviders.value || []).filter((p) => allowed.has(Number(p.id)) || affiliatedIds.has(Number(p.id)));
});

const availableServiceDays = computed(() => {
  const providerId = Number(newClient.value?.provider_id);
  if (!providerId) return [];
  const days = [];
  // Allow temporary provider assignment even when no day is configured yet.
  days.push('Unknown');
  for (const a of providerAssignmentsForOrg.value || []) {
    if (!a) continue;
    if (Number(a.provider_user_id) !== providerId) continue;
    const active = a.is_active === undefined ? true : !!a.is_active;
    if (!active) continue;
    const avail = a.slots_available;
    const hasCapacity = avail === null || avail === undefined ? true : Number(avail) > 0;
    if (!hasCapacity) continue;
    if (a.day_of_week) days.push(String(a.day_of_week));
  }
  // stable ordering Mon–Fri
  const order = new Map([['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4], ['Friday', 5]]);
  const uniq = Array.from(new Set(days));
  // Keep Unknown first, then weekday order.
  return uniq.sort((a, b) => {
    if (a === 'Unknown' && b !== 'Unknown') return -1;
    if (b === 'Unknown' && a !== 'Unknown') return 1;
    return (order.get(a) || 99) - (order.get(b) || 99);
  });
});

const selectedProviderDayAssignment = computed(() => {
  const providerId = Number(newClient.value?.provider_id);
  const day = String(newClient.value?.service_day || '');
  if (!providerId || !day) return null;
  return (
    (providerAssignmentsForOrg.value || []).find(
      (a) => Number(a?.provider_user_id) === providerId && String(a?.day_of_week || '') === day
    ) || null
  );
});

const fetchClients = async () => {
  try {
    loading.value = true;
    error.value = '';
    
    const params = new URLSearchParams();
    const scopedAgencyId = effectiveAgencyScopeId.value;
    if (scopedAgencyId) params.append('agency_id', String(scopedAgencyId));
    // Archived clients are managed in Settings -> Archive, not in the main client area.
    params.append('includeArchived', 'false');
    if (clientStatusFilter.value) params.append('client_status_id', clientStatusFilter.value);
    if (workflowStatusFilter.value) params.append('status', workflowStatusFilter.value);
    if (organizationFilter.value) params.append('organization_id', organizationFilter.value);
    if (providerFilter.value) params.append('provider_id', providerFilter.value);
    if (searchQuery.value) params.append('search', searchQuery.value);
    if (skillsOnly.value) params.append('skills', 'true');
    if (usingServerPagination.value) {
      params.append('paginate', 'true');
      params.append('page', String(currentPage.value));
      params.append('per_page', String(pageSize.value));
      // When in full platform mode (no tenant filter chosen), exclude hidden tenants.
      // If a specific tenant is selected, show it regardless of hidden status.
      if (!scopedAgencyId && hiddenTenantIds.value.size > 0) {
        const visibleIds = allTenantFilters.value
          .map((t) => Number(t.id))
          .filter((id) => !hiddenTenantIds.value.has(id));
        if (visibleIds.length > 0) {
          params.append('agency_ids', visibleIds.join(','));
        }
      }
    }

    const response = await api.get(`/clients?${params.toString()}`);
    const payload = response.data || [];
    const raw = Array.isArray(payload) ? payload : (payload.items || []);
    const orgById = new Map((linkedOrganizations.value || []).map((o) => [Number(o?.id), o]));
    clients.value = (Array.isArray(raw) ? raw : [])
      .filter((c) => String(c?.status || '').toUpperCase() !== 'ARCHIVED')
      .map((c) => {
      const orgId = Number(c?.organization_id);
      const org = orgById.get(orgId) || null;
      return {
        ...c,
        // Used by client-table sort option "District"
        district_name: org?.district_name || ''
      };
    });
    if (usingServerPagination.value) {
      serverTotal.value = Number(payload?.total || 0);
    } else {
      serverTotal.value = clients.value.length;
    }
  } catch (err) {
    console.error('Failed to fetch clients:', err);
    error.value = err.response?.data?.error?.message || 'Failed to load clients';
  } finally {
    loading.value = false;
  }
};

const fetchClientStatuses = async () => {
  try {
    const agencyId = effectiveAgencyScopeId.value;
    if (!agencyId) {
      clientStatuses.value = [];
      return;
    }
    const response = await api.get('/client-settings/client-statuses', { params: { agencyId } });
    clientStatuses.value = (response.data || []).filter((s) => s && (s.is_active === undefined || s.is_active === 1 || s.is_active === true));
  } catch (err) {
    clientStatuses.value = [];
  }
};

const fetchProviders = async () => {
  try {
    const agencyId = effectiveAgencyScopeId.value;
    if (!agencyId) {
      availableProviders.value = [];
      return;
    }
    const response = await api.get('/provider-scheduling/providers', { params: { agencyId } });
    availableProviders.value = response.data || [];
  } catch (err) {
    console.error('Failed to fetch providers:', err);
  }
};

const fetchProviderAssignmentsForOrg = async () => {
  const agencyId = effectiveAgencyScopeId.value;
  const orgId = Number(newClient.value?.organization_id);
  if (!agencyId || !orgId) {
    providerAssignmentsForOrg.value = [];
    affiliatedProvidersForOrg.value = [];
    return;
  }
  try {
    providerOptionsLoading.value = true;
    const [sched, aff] = await Promise.all([
      api.get('/provider-scheduling/assignments', { params: { agencyId, schoolOrganizationId: orgId } }),
      api.get('/provider-scheduling/affiliated-providers', { params: { agencyId, schoolOrganizationId: orgId } })
    ]);
    providerAssignmentsForOrg.value = sched.data || [];
    affiliatedProvidersForOrg.value = Array.isArray(aff.data) ? aff.data : [];
  } catch (e) {
    // Best-effort: don’t block creation; just disable provider/day guidance.
    providerAssignmentsForOrg.value = [];
    affiliatedProvidersForOrg.value = [];
  } finally {
    providerOptionsLoading.value = false;
  }
};

const fetchDeliveryMethodsForSchool = async () => {
  const agencyId = effectiveAgencyScopeId.value;
  const orgId = Number(newClient.value?.organization_id);
  if (!agencyId || !orgId || !selectedOrgIsSchool.value) {
    deliveryMethods.value = [];
    return;
  }
  try {
    deliveryMethodsLoading.value = true;
    const resp = await api.get(`/school-settings/${orgId}/paperwork-delivery-methods`, { params: { agencyId } });
    deliveryMethods.value = (resp.data || []).filter((m) => m && (m.is_active === 1 || m.is_active === true));
  } catch {
    deliveryMethods.value = [];
  } finally {
    deliveryMethodsLoading.value = false;
  }
};

const filteredClients = computed(() => {
  let filtered = [...clients.value];

  // Apply sort
  const [sortField, sortOrder] = sortBy.value.split('-');
  filtered.sort((a, b) => {
    let aVal, bVal;
    if (sortField === 'initials') {
      // Sort by the active display field
      aVal = getClientDisplay(a);
      bVal = getClientDisplay(b);
    } else {
      aVal = a[sortField];
      bVal = b[sortField];
    }

    if (sortField === 'submission_date' || sortField === 'last_activity_at') {
      aVal = parseDateForDisplay(aVal);
      bVal = parseDateForDisplay(bVal);
    } else {
      aVal = (aVal || '').toString().toLowerCase();
      bVal = (bVal || '').toString().toLowerCase();
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });

  return filtered;
});

const totalPages = computed(() => {
  if (usingServerPagination.value) {
    const total = Number(serverTotal.value || 0);
    return Math.max(1, Math.ceil(total / pageSize.value));
  }
  return Math.max(1, Math.ceil(filteredClients.value.length / pageSize.value));
});

const pagedClients = computed(() => {
  if (usingServerPagination.value) {
    return filteredClients.value;
  }
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredClients.value.slice(start, start + pageSize.value);
});

const totalCountForDisplay = computed(() => {
  if (usingServerPagination.value) return Number(serverTotal.value || 0);
  return filteredClients.value.length;
});

const allPageSelected = computed(() => {
  const page = pagedClients.value || [];
  if (!page.length) return false;
  for (const c of page) {
    if (!selectedIds.value.has(c.id)) return false;
  }
  return true;
});

const toggleSelected = (id) => {
  const set = new Set(selectedIds.value);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  selectedIds.value = set;
};

const toggleSelectAllPage = (evt) => {
  const checked = !!evt?.target?.checked;
  const set = new Set(selectedIds.value);
  for (const c of pagedClients.value || []) {
    if (checked) set.add(c.id);
    else set.delete(c.id);
  }
  selectedIds.value = set;
};

const clearSelection = () => {
  selectedIds.value = new Set();
  bulkAffiliationId.value = '';
  bulkClientStatusId.value = '';
  bulkPromoteYear.value = '';
};

const normalizeSchoolYearLabel = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}`;
  const m2 = s.match(/^(\d{4})\s*\/\s*(\d{4})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return s;
};

const currentSchoolYear = computed(() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
});

const nextSchoolYear = computed(() => {
  const c = String(currentSchoolYear.value);
  const m = c.match(/^(\d{4})-(\d{4})$/);
  if (!m) return '';
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  return `${a + 1}-${b + 1}`;
});

const bulkPromoteToNextYear = async () => {
  const ids = Array.from(selectedIds.value || []);
  if (!ids.length) return;
  const toSchoolYear = normalizeSchoolYearLabel(bulkPromoteYear.value || nextSchoolYear.value);
  if (!toSchoolYear) return;
  bulkWorking.value = true;
  try {
    await api.post('/clients/bulk/promote-school-year', { clientIds: ids, toSchoolYear, resetDocs: true, paperworkStatusKey: 'new_docs' });
    await fetchClients();
    clearSelection();
  } catch (e) {
    console.error('Bulk promote failed:', e);
    alert(e.response?.data?.error?.message || e.message || 'Bulk promote failed');
  } finally {
    bulkWorking.value = false;
  }
};

const rolloverWorking = ref(false);
const rolloverPreview = ref(null);

const showRolloverModal = ref(false);
const rolloverScope = ref('all'); // 'selected' | 'all'
const rolloverConfirmChecked = ref(false);
const rolloverConfirmText = ref('');
const rolloverAction = ref('rollover'); // 'rollover' | 'reset_docs'

const rolloverConfirmPhrase = computed(() => {
  if (rolloverAction.value === 'reset_docs') return 'RESET DOCS';
  return `ROLLOVER ${normalizeSchoolYearLabel(nextSchoolYear.value)}`;
});

const openRolloverModal = (action = 'rollover') => {
  rolloverPreview.value = null;
  rolloverConfirmChecked.value = false;
  rolloverConfirmText.value = '';
  rolloverScope.value = organizationFilter.value ? 'selected' : 'all';
  rolloverAction.value = action === 'reset_docs' ? 'reset_docs' : 'rollover';
  showRolloverModal.value = true;
};

const closeRolloverModal = () => {
  showRolloverModal.value = false;
};

const resolveRolloverOrgId = () => {
  if (rolloverScope.value === 'selected') {
    const orgId = organizationFilter.value ? parseInt(String(organizationFilter.value), 10) : null;
    return orgId || null;
  }
  return null;
};

const runRolloverPreview = async () => {
  const toSchoolYear = normalizeSchoolYearLabel(nextSchoolYear.value);
  if (rolloverAction.value !== 'reset_docs' && !toSchoolYear) return;
  const orgId = resolveRolloverOrgId();
  if (rolloverScope.value === 'selected' && !orgId) {
    alert('Select an affiliation in the filter first, or choose “All affiliations”.');
    return;
  }
  rolloverWorking.value = true;
  try {
    const preview = await api.post('/clients/bulk/rollover-school-year', {
      organizationId: orgId || undefined,
      toSchoolYear: rolloverAction.value === 'reset_docs' ? undefined : toSchoolYear,
      resetDocs: true,
      paperworkStatusKey: 'new_docs',
      keepSchoolYear: rolloverAction.value === 'reset_docs',
      confirm: false
    });
    rolloverPreview.value = preview.data;
  } catch (e) {
    console.error('Rollover preview failed:', e);
    alert(e.response?.data?.error?.message || e.message || 'Rollover preview failed');
  } finally {
    rolloverWorking.value = false;
  }
};

const canExecuteRollover = computed(() => {
  if (!rolloverPreview.value) return false;
  if (!rolloverConfirmChecked.value) return false;
  const want = String(rolloverConfirmPhrase.value || '').trim().toUpperCase();
  const got = String(rolloverConfirmText.value || '').trim().toUpperCase();
  return Boolean(want) && got === want;
});

const executeRollover = async () => {
  const toSchoolYear = normalizeSchoolYearLabel(nextSchoolYear.value);
  if (rolloverAction.value !== 'reset_docs' && !toSchoolYear) return;
  const orgId = resolveRolloverOrgId();
  rolloverWorking.value = true;
  try {
    await api.post('/clients/bulk/rollover-school-year', {
      organizationId: orgId || undefined,
      toSchoolYear: rolloverAction.value === 'reset_docs' ? undefined : toSchoolYear,
      resetDocs: true,
      paperworkStatusKey: 'new_docs',
      keepSchoolYear: rolloverAction.value === 'reset_docs',
      confirm: true
    });
    await fetchClients();
    closeRolloverModal();
  } catch (e) {
    console.error('Rollover failed:', e);
    alert(e.response?.data?.error?.message || e.message || 'Rollover failed');
  } finally {
    rolloverWorking.value = false;
  }
};

// Delete bulk-imported clients (superadmin-only, strongly gated)
const showDeleteImportedModal = ref(false);
const deleteImportedWorking = ref(false);
const deleteImportedPreview = ref(null);
const deleteImportedConfirmChecked = ref(false);
const deleteImportedConfirmText = ref('');
const deleteImportedConfirmPhrase = computed(() => 'DELETE IMPORTED CLIENTS');

const openDeleteImportedModal = () => {
  deleteImportedPreview.value = null;
  deleteImportedConfirmChecked.value = false;
  deleteImportedConfirmText.value = '';
  showDeleteImportedModal.value = true;
};

const closeDeleteImportedModal = () => {
  showDeleteImportedModal.value = false;
};

const runDeleteImportedPreview = async () => {
  const agencyId = activeAgencyId.value;
  if (!agencyId) {
    alert('No active agency found.');
    return;
  }
  deleteImportedWorking.value = true;
  try {
    const r = await api.delete(`/clients/bulk-import?agencyId=${encodeURIComponent(String(agencyId))}`);
    deleteImportedPreview.value = r.data || null;
  } catch (e) {
    console.error('Delete imported preview failed:', e);
    alert(e.response?.data?.error?.message || e.message || 'Preview failed');
  } finally {
    deleteImportedWorking.value = false;
  }
};

const canExecuteDeleteImported = computed(() => {
  if (!deleteImportedPreview.value) return false;
  if (!deleteImportedConfirmChecked.value) return false;
  const want = String(deleteImportedConfirmPhrase.value || '').trim().toUpperCase();
  const got = String(deleteImportedConfirmText.value || '').trim().toUpperCase();
  return Boolean(want) && got === want;
});

const executeDeleteImported = async () => {
  const agencyId = activeAgencyId.value;
  if (!agencyId) return;
  deleteImportedWorking.value = true;
  try {
    await api.delete(`/clients/bulk-import?agencyId=${encodeURIComponent(String(agencyId))}&confirm=true`);
    await fetchClients();
    closeDeleteImportedModal();
  } catch (e) {
    console.error('Delete imported failed:', e);
    alert(e.response?.data?.error?.message || e.message || 'Delete failed');
  } finally {
    deleteImportedWorking.value = false;
  }
};

const runBulk = async (fn) => {
  const ids = Array.from(selectedIds.value || []);
  if (!ids.length) return;
  bulkWorking.value = true;
  try {
    // Small concurrency limit to avoid hammering the API.
    const concurrency = 5;
    let i = 0;
    const workers = Array.from({ length: concurrency }).map(async () => {
      while (i < ids.length) {
        const id = ids[i++];
        // eslint-disable-next-line no-await-in-loop
        await fn(id);
      }
    });
    await Promise.all(workers);
    await fetchClients();
    clearSelection();
  } catch (e) {
    console.error('Bulk action failed:', e);
    alert(e.response?.data?.error?.message || e.message || 'Bulk action failed');
  } finally {
    bulkWorking.value = false;
  }
};

const bulkArchive = async () => {
  const ok = window.confirm(`Archive ${selectedIds.value.size} client(s)? This removes them from rosters.`);
  if (!ok) return;
  await runBulk((id) => api.put(`/clients/${id}/status`, { status: 'ARCHIVED' }));
};

const bulkMoveAffiliation = async () => {
  const orgId = bulkAffiliationId.value ? parseInt(String(bulkAffiliationId.value), 10) : null;
  if (!orgId) return;
  await runBulk((id) => api.put(`/clients/${id}`, { organization_id: orgId }));
};

const bulkSetClientStatus = async () => {
  const csId = bulkClientStatusId.value ? parseInt(String(bulkClientStatusId.value), 10) : null;
  if (!csId) return;
  await runBulk((id) => api.put(`/clients/${id}`, { client_status_id: csId }));
};

const applyFilters = () => {
  currentPage.value = 1;
  fetchClients();
};

const handlePlatformTenantChange = async () => {
  organizationFilter.value = '';
  providerFilter.value = '';
  clientStatusFilter.value = '';
  workflowStatusFilter.value = '';
  schoolSearchQuery.value = '';
  schoolSearchOpen.value = false;
  currentPage.value = 1;
  await fetchLinkedOrganizations();
  await fetchClientStatuses();
  await fetchProviders();
  await fetchClients();
};

const parseDateForDisplay = (dateValue) => {
  if (!dateValue) return new Date(0);
  const s = String(dateValue);
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d);
  }
  return new Date(s);
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  const date = parseDateForDisplay(dateString);
  return date.toLocaleDateString();
};

const formatDocumentStatusSummary = (client) => {
  if (!client) return '-';
  const statusKey = String(client.paperwork_status_key || '').toLowerCase();
  if (statusKey === 'all_needed') {
    return client.paperwork_status_label || 'All Needed';
  }
  const cnt = client.paperwork_needed_count;
  if (cnt !== undefined && cnt !== null && cnt !== '') {
    const n = Number(cnt);
    if (Number.isFinite(n)) {
      if (n <= 0) return 'Completed';
      if (n > 1) return 'Multiple Needed';
      const lbl = String(client.paperwork_status_label || '').trim();
      return lbl ? `${lbl} Needed` : 'Needed';
    }
  }
  // Fallback to legacy single status label (if checklist not available).
  return client.paperwork_status_label || '-';
};

const formatDocumentStatus = (status) => {
  const statusMap = {
    'NONE': 'None',
    'UPLOADED': 'Uploaded',
    'PACKET': 'Packet',
    'APPROVED': 'Approved',
    'REJECTED': 'Rejected'
  };
  return statusMap[status] || status;
};

const formatClientStatus = (client) => {
  const label = String(client?.client_status_label || '').trim();
  if (label) return label;
  const status = String(client?.status || '').toUpperCase();
  const map = {
    'PACKET': 'Packet',
    'SCREENER': 'Screener',
    'RETURNING': 'Returning',
    'PENDING_REVIEW': 'Pending',
    'ACTIVE': 'Current',
    'ON_HOLD': 'Waitlist',
    'DECLINED': 'Declined',
    'ARCHIVED': 'Archived'
  };
  return map[status] || (status ? status.toLowerCase() : '-');
};

const startEditStatus = async (client) => {
  const ok = window.confirm('Archive this client? This will remove them from all school rosters.');
  if (!ok) return;
  try {
    await api.put(`/clients/${client.id}/status`, { status: 'ARCHIVED' });
    await fetchClients();
  } catch (err) {
    console.error('Failed to archive client:', err);
    alert(err.response?.data?.error?.message || 'Failed to archive client');
  } finally {
    cancelEdit();
  }
};

const cancelEdit = () => {
  // kept for legacy callers; provider inline editing removed
};

// Workflow editing removed; "status" is now treated as an internal archive flag.

/** Full-page client profile (same pattern as admin user / provider profiles). */
const openClientDetail = (client) => {
  const id = Number(client?.id || 0);
  if (!id) return;
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const path = orgSlug ? `/${orgSlug}/admin/clients/${id}` : `/admin/clients/${id}`;
  router.push({ path });
};

const createClient = async () => {
  try {
    creating.value = true;
    error.value = '';

    // The agency_id must be the parent agency org. Prefer active agency context, but fall back
    // to the selected organization's affiliation (super admin / platform-wide org picker).
    const orgId = Number(newClient.value?.organization_id) || null;
    const org = orgId ? (linkedOrganizations.value || []).find((o) => Number(o?.id) === orgId) : null;
    const agencyId = createAgencyEffectiveId.value || (org?.affiliated_agency_id ? Number(org.affiliated_agency_id) : null);

    if (!agencyId) {
      error.value = 'Unable to determine agency. Please ensure you are associated with an agency.';
      creating.value = false;
      return;
    }

    // Normalize optional fields
    const payload = {
      ...newClient.value,
      client_type: String(newClient.value?.client_type || '').toLowerCase(),
      school_year: normalizeSchoolYearLabel(newClient.value.school_year) || null,
      grade: normalizeGradeForSave(newClient.value.grade),
      insurance_type_id: newClient.value.insurance_type_id ? Number(newClient.value.insurance_type_id) : null,
      doc_date: newClient.value.doc_date ? String(newClient.value.doc_date).slice(0, 10) : null,
      // Assign provider/day in a second call so slot adjustments are enforced centrally.
      provider_id: null,
      service_day: null,
      agency_id: agencyId,
      source: 'ADMIN_CREATED'
    };

    const resp = await api.post('/clients', payload);
    const created = resp.data || null;
    const warnings = Array.isArray(created?.warnings) ? created.warnings : [];
    if (warnings.length > 0) {
      // Non-blocking warnings (duplicates, etc.)
      alert(`Client created with warnings:\n- ${warnings.join('\n- ')}`);
    }

    // Slot-aware assignment (optional): assign via affiliations system (optionally primary)
    const providerId = newClient.value?.provider_id ? Number(newClient.value.provider_id) : null;
    const serviceDay = String(newClient.value?.service_day || '').trim() || null;
    if (created?.id && providerId && serviceDay) {
      try {
        await api.post(`/clients/${created.id}/provider-assignments`, {
          organization_id: Number(newClient.value.organization_id),
          provider_user_id: providerId,
          service_day: serviceDay,
          is_primary: newClient.value?.provider_make_primary !== false
        });
      } catch (e) {
        const msg = e?.response?.data?.error?.message || 'Provider/day could not be saved';
        error.value = `Client was created, but provider/day could not be saved: ${msg}. Please set the primary provider in the client’s Affiliations tab.`;
        await fetchClients();
        return;
      }
    }

    // Apply Document Status selections (Needed/Received)
    if (created?.id && (createPaperworkStatuses.value || []).length) {
      try {
        const updates = (createPaperworkStatuses.value || []).map((s) => ({
          paperwork_status_id: Number(s.id),
          is_needed: (createDocsNeededIds.value || []).includes(Number(s.id))
        }));
        await api.put(`/clients/${created.id}/document-status`, { updates });
      } catch (e) {
        const msg = e?.response?.data?.error?.message || 'Document Status could not be saved';
        error.value = `Client was created, but Document Status could not be saved: ${msg}. Please open the client and set Document Status again.`;
        await fetchClients();
        return;
      }
    }

    await fetchClients();
    closeCreateModal();
  } catch (err) {
    console.error('Failed to create client:', err);
    const status = err.response?.status;
    const meta = err.response?.data?.error?.errorMeta || null;
    if (status === 409 && meta?.matches && Array.isArray(meta.matches)) {
      dupesMatches.value = meta.matches;
      dupesForNewClient.value = { ...newClient.value };
      dupesModalOpen.value = true;
      return;
    }
    error.value = err.response?.data?.error?.message || 'Failed to create client';
  } finally {
    creating.value = false;
  }
};

const closeCreateModal = () => {
  showCreateModal.value = false;
  createAgencyId.value = '';
  cancelAddLanguage();
  newClient.value = {
    organization_id: null,
    client_type: '',
    initials: '',
    provider_id: null,
    provider_make_primary: true,
    service_day: '',
    client_status_id: null,
    insurance_type_id: null,
    school_year: '',
    grade: '',
    submission_date: new Date().toISOString().split('T')[0],
    referral_date: new Date().toISOString().split('T')[0],
    doc_date: '',
    paperwork_delivery_method_id: null,
    primary_client_language: '',
    primary_parent_language: ''
  };
  createDocsNeededIds.value = [];
};

const closeDupesModal = () => {
  dupesModalOpen.value = false;
  dupesMatches.value = [];
  dupesForNewClient.value = null;
};

const unarchiveMatch = async (m) => {
  if (!m?.clientId) return;
  const payload = {
    organization_id: dupesForNewClient.value?.organization_id || undefined,
    provider_id: dupesForNewClient.value?.provider_id ?? undefined
  };
  try {
    await api.post(`/clients/${m.clientId}/unarchive`, payload);
    await fetchClients();
    closeDupesModal();
    closeCreateModal();
  } catch (e) {
    alert(e.response?.data?.error?.message || e.message || 'Failed to unarchive client');
  }
};

const handleBulkImported = () => {
  fetchClients();
};

/** Legacy ?clientId= deep links → canonical full-page profile URL. */
const openClientFromQuery = async () => {
  const raw = route.query?.clientId;
  const id = raw ? parseInt(String(raw), 10) : null;
  if (!id) return;
  const orgSlug = String(route.params?.organizationSlug || '').trim();
  const path = orgSlug ? `/${orgSlug}/admin/clients/${id}` : `/admin/clients/${id}`;
  const query = {};
  const tab = String(route.query?.tab || '').trim();
  if (tab) query.tab = tab;
  const docId = Number(route.query?.documentId);
  if (Number.isFinite(docId) && docId > 0) query.documentId = String(docId);
  try {
    await router.replace({ path, query: Object.keys(query).length ? query : {} });
  } catch (e) {
    console.warn('Failed to redirect client deep link:', e?.message || e);
  }
};

onMounted(async () => {
  loadColumnPrefs();
  if (isSuperAdmin.value) {
    loadHiddenTenants();
  }
  if (isSuperAdmin.value) {
    // Super admins: fetchAgencies() already populates agencies + userAgencies is unused for them.
    // Calling fetchUserAgencies() would incorrectly snap currentAgency back to a default tenant.
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
  }
  // Default the create modal agency to the resolved active agency.
  if (!createAgencyId.value && activeAgencyId.value) {
    createAgencyId.value = String(activeAgencyId.value);
  }
  await fetchLinkedOrganizations();
  await fetchClientStatuses();
  await fetchProviders();
  await fetchClients();
  await openClientFromQuery();

  // Default school year for new clients (best-effort; user can override).
  if (!newClient.value.school_year) {
    newClient.value.school_year = currentSchoolYear.value;
  }
});

watch(
  () => createAgencyEffectiveId.value,
  async () => {
    if (!showCreateModal.value) return;
    // Changing agency in the create modal should refresh org/provider/status dropdowns.
    newClient.value.organization_id = null;
    newClient.value.provider_id = null;
    newClient.value.service_day = '';
    newClient.value.insurance_type_id = null;
    await fetchLinkedOrganizations();
    if (!(allowedCreateClientTypes.value || []).some((o) => o.value === newClient.value.client_type)) {
      newClient.value.client_type = allowedCreateClientTypes.value?.[0]?.value || '';
    }
    await fetchClientStatuses();
    await fetchProviders();
    await fetchCreatePaperworkStatuses();
    await fetchCreateInsuranceTypes();
  }
);

watch(
  () => newClient.value?.organization_id,
  async () => {
    // Reset downstream selections when org changes
    newClient.value.provider_id = null;
    newClient.value.service_day = '';
    newClient.value.paperwork_delivery_method_id = null;
    deliveryMethods.value = [];
    providerAssignmentsForOrg.value = [];

    const selectedOrg = selectedNewClientOrg.value;
    const selectedOrgType = String(selectedOrg?.organization_type || '').toLowerCase();
    const allowed = new Set((allowedCreateClientTypes.value || []).map((o) => String(o.value || '').toLowerCase()));
    if (selectedOrgType === 'learning' && allowed.has('learning')) {
      newClient.value.client_type = 'learning';
    } else if ((selectedOrgType === 'program' || selectedOrgType === 'clinical') && allowed.has('clinical')) {
      newClient.value.client_type = 'clinical';
    } else if (selectedOrgType === 'school' && allowed.has('school')) {
      newClient.value.client_type = 'school';
    } else if (!allowed.has(String(newClient.value.client_type || '').toLowerCase())) {
      newClient.value.client_type = allowedCreateClientTypes.value?.[0]?.value || '';
    }

    await fetchProviderAssignmentsForOrg();
    await fetchDeliveryMethodsForSchool();
  }
);

watch(
  () => allowedCreateClientTypes.value,
  (opts) => {
    const allowed = new Set((opts || []).map((o) => String(o.value || '').toLowerCase()));
    const cur = String(newClient.value?.client_type || '').toLowerCase();
    if (!allowed.has(cur)) {
      newClient.value.client_type = opts?.[0]?.value || '';
    }
  },
  { deep: true }
);

watch(
  () => newClient.value?.provider_id,
  () => {
    // Force day re-selection when provider changes
    newClient.value.service_day = '';
  }
);

watch(() => route.query?.clientId, async () => {
  await openClientFromQuery();
});

// Refetch when active agency scope changes (route slug or header tenant selection).
watch(() => activeAgencyId.value, (newId, oldId) => {
  if (newId === oldId) return;
  currentPage.value = 1;
  if (!createAgencyId.value && newId) {
    createAgencyId.value = String(newId);
  }
  fetchLinkedOrganizations();
  fetchClientStatuses();
  fetchProviders();
  fetchClients();
});

watch(() => pageSize.value, (newSize, oldSize) => {
  if (!usingServerPagination.value) return;
  if (newSize === oldSize) return;
  if (currentPage.value !== 1) {
    currentPage.value = 1;
    return;
  }
  fetchClients();
});

watch(() => currentPage.value, (newPage, oldPage) => {
  if (!usingServerPagination.value) return;
  if (newPage === oldPage) return;
  fetchClients();
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.table-controls {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-alt);
  border-radius: 8px;
}

.filter-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.columns-control {
  position: relative;
}

.columns-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  padding: 10px 12px;
  min-width: 210px;
}

.columns-item {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: var(--text-primary);
  padding: 4px 0;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.filter-select {
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  min-width: 150px;
}

.display-mode-toggle {
  display: flex;
  border: 2px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}
.display-mode-btn {
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  background: var(--bg-alt, #f9f9f9);
  border: none;
  border-right: 1px solid var(--border);
  cursor: pointer;
  color: var(--text-secondary, #666);
  transition: background 0.15s, color 0.15s;
}
.display-mode-btn:last-child { border-right: none; }
.display-mode-btn.active {
  background: var(--color-primary, #2d6a4f);
  color: #fff;
}
.display-mode-btn:hover:not(.active) {
  background: var(--border, #e0e0e0);
}

.school-search {
  position: relative;
  min-width: 220px;
}

.school-search-input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.school-search-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  max-height: 280px;
  overflow: auto;
  padding: 6px;
}

.school-search-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border: 0;
  background: transparent;
  cursor: pointer;
  border-radius: 8px;
  text-align: left;
  font: inherit;
}

.school-search-item:hover {
  background: var(--bg-alt);
}

.school-search-name {
  font-weight: 600;
}

.school-search-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.link-button {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  text-decoration: underline;
  font: inherit;
}

.link-button:hover {
  opacity: 0.85;
}

.bulk-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 10px;
}

.bulk-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bulk-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.bulk-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.bulk-group .btn {
  width: auto;
  flex: 0 0 auto;
}

.select-cell {
  width: 34px;
}

.btn-danger {
  background: var(--danger, #d92d20);
  color: #fff;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.btn-danger:hover {
  opacity: 0.92;
}

.pagination-bar {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.pagination-left,
.pagination-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination-meta {
  color: var(--text-secondary);
  font-size: 13px;
}

.page-size {
  min-width: 140px;
}

.clients-table-container {
  overflow-x: auto;
  background: white;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.clients-table {
  width: 100%;
  border-collapse: collapse;
}

.clients-table thead {
  background: var(--bg-alt);
}

.clients-table th {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}

.clients-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.client-row {
  cursor: pointer;
  transition: background 0.2s;
}

.client-row:hover {
  background: var(--bg-alt);
}

.client-row .initials-cell {
  color: var(--primary, #15803d);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.actions-cell {
  white-space: nowrap;
}

.actions-cell .btn {
  width: auto;
  flex: 0 0 auto;
  padding: 4px 8px;
}

.actions-cell .btn + .btn {
  margin-left: 6px;
}

.inline-select {
  padding: 4px 8px;
  border: 2px solid var(--primary);
  border-radius: 4px;
  font-size: 13px;
  background: white;
}

.editable-field {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.editable-field:hover {
  background: var(--bg-alt);
}

.doc-status-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.doc-none {
  background: #e2e3e5;
  color: #383d41;
}

.doc-uploaded {
  background: #fff3cd;
  color: #856404;
}

.doc-approved {
  background: #d4edda;
  color: #155724;
}

.doc-rejected {
  background: #f8d7da;
  color: #721c24;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 32px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border);
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
