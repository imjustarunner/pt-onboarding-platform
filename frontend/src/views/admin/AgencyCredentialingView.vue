<template>
  <div class="container credentialing-page">
    <div class="page-header">
      <div>
        <router-link :to="orgTo('/admin')" class="back-link">← Back to Admin Dashboard</router-link>
        <h1>Agency Credentialing</h1>
        <div class="muted" style="margin-top: 6px;">
          Agency group NPIs and provider credentialing — edit deliberately, upload licenses, and export CSV.
        </div>
      </div>

      <div class="header-actions">
        <button class="btn btn-secondary" type="button" @click="refresh" :disabled="loading || saving">
          Refresh
        </button>
        <button class="btn btn-secondary" type="button" @click="showCsvModal = true" :disabled="loading || !selectedAgencyId">
          Export CSV
        </button>
      </div>
    </div>

    <div class="card filters-card">
      <div class="field-row">
        <div class="field">
          <label>Agency</label>
          <select v-model.number="selectedAgencyId" :disabled="loading || agencies.length === 0">
            <option v-for="a in agencies" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>Smart search</label>
          <div class="smart-search-wrap">
            <input
              v-model="search"
              type="search"
              placeholder="Type a name, NPI, license, email, zip, state…"
              autocomplete="off"
            />
            <button
              v-if="search"
              class="clear-search"
              type="button"
              title="Clear search"
              @click="search = ''"
            >×</button>
          </div>
        </div>
      </div>
      <div class="filters-meta">
        <label class="inline-check">
          <input type="checkbox" v-model="showSources" :disabled="loading" />
          <span class="muted">Show field keys / sources</span>
        </label>
        <label class="inline-check">
          <span class="muted">View:</span>
            <select v-model="viewMode" :disabled="loading">
              <option value="by_provider">By Provider</option>
              <option value="by_insurance">By Payer</option>
            </select>
        </label>
      </div>
    </div>

    <div v-if="showCsvModal" class="modal-overlay" @click.self="showCsvModal = false">
      <div class="modal card">
        <h3>Export CSV</h3>
        <p class="hint">Select columns to include in the export.</p>
        <div class="csv-columns">
          <label v-for="col in csvColumnOptions" :key="col.key" class="checkbox-label">
            <input type="checkbox" v-model="csvSelectedColumns" :value="col.key" />
            {{ col.label }}
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="showCsvModal = false">Cancel</button>
          <button class="btn btn-primary" @click="doExportCsv">Export</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="error banner">{{ error }}</div>
    <div v-if="info" class="success banner">{{ info }}</div>

    <details ref="insuranceDefinitionsDetails" class="card insurance-definitions-card" :open="insuranceDefinitionsOpen">
      <summary>Payer Credentialing</summary>
      <p class="muted payer-defs-hint">
        Define the payers this agency credentials with (logo included). These appear when creating a credential for each provider below.
      </p>
      <InsuranceDefinitionsPanel :agency-id="selectedAgencyId" />
    </details>

    <details class="card agency-group-npis-card" :open="agencyGroupNpisOpen">
      <summary>Agency group NPIs</summary>
      <AgencyGroupNpisPanel v-if="selectedAgencyId" :agency-id="selectedAgencyId" />
    </details>

    <details class="card timeline-card">
      <summary>Credentialing timeline</summary>
      <CredentialingTimeline :agency-id="selectedAgencyId" />
    </details>

    <template v-if="viewMode === 'by_provider'">
      <div class="stats-row" v-if="!loading">
        <button
          type="button"
          class="stat-card"
          :class="{ active: statusFilter === 'all' || !statusFilter }"
          @click="setStatusFilter('all')"
        >
          <div class="stat-icon total">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          </div>
          <div>
            <div class="stat-label">Total Providers</div>
            <div class="stat-value">{{ stats.total }}</div>
          </div>
        </button>
        <button type="button" class="stat-card" :class="{ active: statusFilter === 'active' }" @click="setStatusFilter('active')">
          <div class="stat-icon active">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
          <div>
            <div class="stat-label">Active</div>
            <div class="stat-value">{{ stats.active }}</div>
          </div>
        </button>
        <button type="button" class="stat-card" :class="{ active: statusFilter === 'soon' }" @click="setStatusFilter('soon')">
          <div class="stat-icon soon">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
          </div>
          <div>
            <div class="stat-label">Expiring Soon (&lt; 90 days)</div>
            <div class="stat-value">{{ stats.expiringSoon }}</div>
          </div>
        </button>
        <button type="button" class="stat-card" :class="{ active: statusFilter === 'expired' }" @click="setStatusFilter('expired')">
          <div class="stat-icon expired">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          </div>
          <div>
            <div class="stat-label">Expired</div>
            <div class="stat-value">{{ stats.expired }}</div>
          </div>
        </button>
        <button type="button" class="stat-card" :class="{ active: statusFilter === 'progress' }" @click="setStatusFilter('progress')">
          <div class="stat-icon progress">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          </div>
          <div>
            <div class="stat-label">In Progress</div>
            <div class="stat-value">{{ stats.inProgress }}</div>
          </div>
        </button>
      </div>

      <div class="quick-filters" v-if="!loading">
        <span class="quick-label">Quick filters:</span>
        <button type="button" class="chip" :class="{ active: statusFilter === 'all' || !statusFilter }" @click="setStatusFilter('all')">All</button>
        <button type="button" class="chip" :class="{ active: statusFilter === 'licensed' }" @click="setStatusFilter('licensed')" title="LPC, LCSW, MFT/LMFT, LAC, Licensed Psychologist">Fully licensed</button>
        <button type="button" class="chip" :class="{ active: statusFilter === 'unlicensed' }" @click="setStatusFilter('unlicensed')" title="Candidates / pre-licensed and other non-credentialable statuses">Not fully licensed</button>
        <button type="button" class="chip chip-expired" :class="{ active: statusFilter === 'expired' }" @click="setStatusFilter('expired')">Expired</button>
        <button type="button" class="chip chip-soon" :class="{ active: statusFilter === 'soon' }" @click="setStatusFilter('soon')">Expiring soon</button>
        <button type="button" class="chip chip-active" :class="{ active: statusFilter === 'active' }" @click="setStatusFilter('active')">Active license</button>
        <button type="button" class="chip chip-progress" :class="{ active: statusFilter === 'progress' }" @click="setStatusFilter('progress')">In progress</button>
        <button
          v-if="statusFilter && statusFilter !== 'all'"
          type="button"
          class="chip chip-clear"
          @click="setStatusFilter('all')"
        >Clear filter</button>
      </div>

      <div class="card table-card">
        <div class="table-toolbar">
          <div>
            <h2>Providers ({{ filteredRows.length }}<span v-if="filteredRows.length !== stats.total" class="muted"> of {{ stats.total }}</span>)</h2>
            <div v-if="activeFilterLabel" class="filter-pill">Showing: {{ activeFilterLabel }}</div>
          </div>
          <div class="toolbar-actions">
            <button class="icon-btn" type="button" @click="showColumnMenu = !showColumnMenu" title="Columns">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
              Columns
            </button>
            <div v-if="showColumnMenu" class="column-menu">
              <label v-for="col in toggleableColumns" :key="col.key" class="checkbox-label">
                <input type="checkbox" v-model="visibleColumns" :value="col.key" />
                {{ col.label }}
              </label>
            </div>
          </div>
        </div>

        <div v-if="loading" class="loading">Loading…</div>
        <div v-else class="table-wrap">
          <table class="cred-table">
            <thead>
              <tr>
                <th class="sticky-name sortable" @click="toggleSort('name')">
                  Provider Name <span class="sort-ind">{{ sortIndicator('name') }}</span>
                </th>
                <th v-if="isColVisible('date_of_birth')" class="sortable" @click="toggleSort('date_of_birth')">
                  DOB <span class="sort-ind">{{ sortIndicator('date_of_birth') }}</span>
                </th>
                <th v-if="isColVisible('state_of_birth')" class="sortable" @click="toggleSort('state_of_birth')">
                  State of Birth <span class="sort-ind">{{ sortIndicator('state_of_birth') }}</span>
                </th>
                <th v-if="isColVisible('first_client_date')" class="sortable" @click="toggleSort('first_client_date')">
                  First Client Date <span class="sort-ind">{{ sortIndicator('first_client_date') }}</span>
                </th>
                <th v-if="isColVisible('npi_status')" class="sortable" @click="toggleSort('npi_status')">
                  Has NPI? <span class="sort-ind">{{ sortIndicator('npi_status') }}</span>
                </th>
                <th v-if="isColVisible('npi_number')" class="sortable" @click="toggleSort('npi_number')">
                  NPI Number <span class="sort-ind">{{ sortIndicator('npi_number') }}</span>
                </th>
                <th v-if="isColVisible('npi_id')" class="sortable" @click="toggleSort('npi_id')">
                  NPI ID <span class="sort-ind">{{ sortIndicator('npi_id') }}</span>
                </th>
                <th v-if="isColVisible('taxonomy_code')" class="sortable" @click="toggleSort('taxonomy_code')">
                  Taxonomy <span class="sort-ind">{{ sortIndicator('taxonomy_code') }}</span>
                </th>
                <th v-if="isColVisible('zipcode')" class="sortable" @click="toggleSort('zipcode')">
                  Zip <span class="sort-ind">{{ sortIndicator('zipcode') }}</span>
                </th>
                <th v-if="isColVisible('license_type_number')" class="sortable" @click="toggleSort('license_type_number')">
                  License Type / Number <span class="sort-ind">{{ sortIndicator('license_type_number') }}</span>
                </th>
                <th v-if="isColVisible('license_issued')" class="sortable" @click="toggleSort('license_issued')">
                  Issued <span class="sort-ind">{{ sortIndicator('license_issued') }}</span>
                </th>
                <th v-if="isColVisible('license_expires')" class="sortable" @click="toggleSort('license_expires')">
                  Expires <span class="sort-ind">{{ sortIndicator('license_expires') }}</span>
                </th>
                <th v-if="isColVisible('license_upload')">License Copy</th>
                <th v-if="isColVisible('medicaid_location_id')" class="sortable" @click="toggleSort('medicaid_location_id')">
                  Medicaid Location ID <span class="sort-ind">{{ sortIndicator('medicaid_location_id') }}</span>
                </th>
                <th v-if="isColVisible('medicaid_effective_date')" class="sortable" @click="toggleSort('medicaid_effective_date')">
                  Medicaid Effective <span class="sort-ind">{{ sortIndicator('medicaid_effective_date') }}</span>
                </th>
                <th v-if="isColVisible('medicaid_revalidation')" class="sortable" @click="toggleSort('medicaid_revalidation')">
                  Medicaid Revalidation <span class="sort-ind">{{ sortIndicator('medicaid_revalidation') }}</span>
                </th>
                <th v-if="isColVisible('medicare_number')" class="sortable" @click="toggleSort('medicare_number')">
                  Medicare # <span class="sort-ind">{{ sortIndicator('medicare_number') }}</span>
                </th>
                <th v-if="isColVisible('caqh_provider_id')" class="sortable" @click="toggleSort('caqh_provider_id')">
                  CAQH ID <span class="sort-ind">{{ sortIndicator('caqh_provider_id') }}</span>
                </th>
                <th v-if="isColVisible('personal_email')" class="sortable" @click="toggleSort('personal_email')">
                  Personal Email <span class="sort-ind">{{ sortIndicator('personal_email') }}</span>
                </th>
                <th v-if="isColVisible('cell_number')" class="sortable" @click="toggleSort('cell_number')">
                  Cell <span class="sort-ind">{{ sortIndicator('cell_number') }}</span>
                </th>
                <th class="sortable" @click="toggleSort('status')">
                  Status <span class="sort-ind">{{ sortIndicator('status') }}</span>
                </th>
                <th class="sortable" @click="toggleSort('payers')">
                  Payers <span class="sort-ind">{{ sortIndicator('payers') }}</span>
                </th>
                <th class="right">Actions</th>
              </tr>
            </thead>
              <tbody>
              <template v-for="r in pagedRows" :key="r.userId">
              <tr
                :class="{ 'row-editing': isEditingRow(r.userId), 'row-expanded': expandedUserId === r.userId }"
              >
                <td class="sticky-name provider-cell">
                  <div class="provider-identity">
                    <img
                      v-if="photoUrl(r)"
                      class="avatar"
                      :src="photoUrl(r)"
                      :alt="`${r.first_name} ${r.last_name}`"
                    />
                    <div v-else class="avatar avatar-fallback" :style="{ background: avatarColor(r) }">
                      {{ initials(r) }}
                    </div>
                    <div class="provider-text">
                      <router-link class="provider-name" :to="orgTo(`/admin/users/${r.userId}?tab=credentialing`)">
                        {{ displayName(r) }}
                      </router-link>
                      <div v-if="(r.in_network || []).length" class="in-network-badges">
                        <span v-for="name in (r.in_network || []).slice(0, 3)" :key="name" class="badge">{{ name }}</span>
                        <span v-if="(r.in_network || []).length > 3" class="muted">+{{ (r.in_network || []).length - 3 }}</span>
                      </div>
                    </div>
                  </div>
                </td>

                <td v-if="isColVisible('date_of_birth')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    type="date"
                    :value="getValue(r.userId, 'date_of_birth')"
                    :title="cellTitle(r, 'date_of_birth')"
                    @change="setValue(r.userId, 'date_of_birth', $event)"
                  />
                  <div v-if="showSources" class="src">{{ sourceLabel(r, 'date_of_birth') }}</div>
                </td>
                <td v-if="isColVisible('state_of_birth')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'state_of_birth')"
                    :title="cellTitle(r, 'state_of_birth')"
                    @change="setValue(r.userId, 'state_of_birth', $event)"
                  />
                  <div v-if="showSources" class="src">{{ sourceLabel(r, 'state_of_birth') }}</div>
                </td>
                <td v-if="isColVisible('first_client_date')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    type="date"
                    :value="getValue(r.userId, 'first_client_date')"
                    @change="setValue(r.userId, 'first_client_date', $event)"
                  />
                </td>
                <td v-if="isColVisible('npi_status')">
                  <template v-if="isEditingRow(r.userId)">
                    <select
                      class="cell-input"
                      :value="getValue(r.userId, 'npi_status')"
                      @change="setValue(r.userId, 'npi_status', $event.target.value)"
                    >
                      <option value="">—</option>
                      <option v-for="opt in npiStatusOptions" :key="opt" :value="opt">{{ shortNpiStatus(opt) }}</option>
                    </select>
                  </template>
                  <span v-else class="cell-text" :class="{ 'cell-missing': !getValue(r.userId, 'npi_status') }">
                    {{ shortNpiStatus(getValue(r.userId, 'npi_status')) || '—' }}
                  </span>
                  <div v-if="showSources" class="src">{{ sourceLabel(r, 'npi_status') }}</div>
                </td>
                <td v-if="isColVisible('npi_number')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'npi_number')"
                    :title="cellTitle(r, 'npi_number')"
                    @change="setValue(r.userId, 'npi_number', $event)"
                  />
                </td>
                <td v-if="isColVisible('npi_id')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'npi_id')"
                    @change="setValue(r.userId, 'npi_id', $event)"
                  />
                </td>
                <td v-if="isColVisible('taxonomy_code')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'taxonomy_code')"
                    @change="setValue(r.userId, 'taxonomy_code', $event)"
                  />
                </td>
                <td v-if="isColVisible('zipcode')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'zipcode')"
                    @change="setValue(r.userId, 'zipcode', $event)"
                  />
                </td>
                <td v-if="isColVisible('license_type_number')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'license_type_number')"
                    @change="setValue(r.userId, 'license_type_number', $event)"
                  />
                </td>
                <td v-if="isColVisible('license_issued')" :class="dateCellClass(r, 'issued')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    type="date"
                    :value="getValue(r.userId, 'license_issued')"
                    :display="formatDisplayDate(getValue(r.userId, 'license_issued'))"
                    @change="setValue(r.userId, 'license_issued', $event)"
                  />
                </td>
                <td v-if="isColVisible('license_expires')" :class="dateCellClass(r, 'expires')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    type="date"
                    :value="getValue(r.userId, 'license_expires')"
                    :display="formatDisplayDate(getValue(r.userId, 'license_expires'))"
                    @change="setValue(r.userId, 'license_expires', $event)"
                  />
                </td>
                <td v-if="isColVisible('license_upload')" :class="{ 'cell-alert': !licenseUrl(r) }">
                  <div class="license-actions">
                    <a
                      v-if="licenseUrl(r)"
                      class="link-btn"
                      :href="licenseUrl(r)"
                      target="_blank"
                      rel="noopener"
                    >View</a>
                    <span v-else class="missing-pill">Missing</span>
                    <label class="link-btn upload-label" :class="{ disabled: uploadingUserId === r.userId }">
                      {{ uploadingUserId === r.userId ? 'Uploading…' : 'Upload' }}
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        hidden
                        :disabled="uploadingUserId === r.userId || ocrUserId === r.userId"
                        @change="onLicenseFileSelected(r, $event)"
                      />
                    </label>
                    <button
                      v-if="licenseUrl(r)"
                      class="link-btn"
                      type="button"
                      :disabled="ocrUserId === r.userId || uploadingUserId === r.userId"
                      @click="runLicenseOcr(r)"
                    >
                      {{ ocrUserId === r.userId ? 'Reading…' : 'Read w/ AI' }}
                    </button>
                  </div>
                </td>
                <td v-if="isColVisible('medicaid_location_id')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'medicaid_location_id')"
                    @change="setValue(r.userId, 'medicaid_location_id', $event)"
                  />
                </td>
                <td v-if="isColVisible('medicaid_effective_date')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    type="date"
                    :value="getValue(r.userId, 'medicaid_effective_date')"
                    :display="formatDisplayDate(getValue(r.userId, 'medicaid_effective_date'))"
                    @change="setValue(r.userId, 'medicaid_effective_date', $event)"
                  />
                </td>
                <td v-if="isColVisible('medicaid_revalidation')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    type="date"
                    :value="getValue(r.userId, 'medicaid_revalidation')"
                    :display="formatDisplayDate(getValue(r.userId, 'medicaid_revalidation'))"
                    @change="setValue(r.userId, 'medicaid_revalidation', $event)"
                  />
                </td>
                <td v-if="isColVisible('medicare_number')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'medicare_number')"
                    @change="setValue(r.userId, 'medicare_number', $event)"
                  />
                </td>
                <td v-if="isColVisible('caqh_provider_id')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    :value="getValue(r.userId, 'caqh_provider_id')"
                    @change="setValue(r.userId, 'caqh_provider_id', $event)"
                  />
                </td>
                <td v-if="isColVisible('personal_email')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    type="email"
                    :value="getValue(r.userId, 'personal_email')"
                    @change="setValue(r.userId, 'personal_email', $event)"
                  />
                </td>
                <td v-if="isColVisible('cell_number')">
                  <EditableCell
                    :editing="isEditingRow(r.userId)"
                    type="tel"
                    :value="getValue(r.userId, 'cell_number')"
                    @change="setValue(r.userId, 'cell_number', $event)"
                  />
                </td>
                <td>
                  <span class="status-pill" :class="licenseStatus(r).tone">{{ licenseStatus(r).label }}</span>
                </td>
                <td>
                  <button
                    class="btn btn-secondary btn-sm payers-toggle"
                    type="button"
                    @click="togglePayerExpand(r.userId)"
                  >
                    {{ expandedUserId === r.userId ? 'Hide payers' : 'Payers' }}
                    <span v-if="(r.in_network || []).length" class="payer-count">{{ (r.in_network || []).length }}</span>
                  </button>
                </td>
                <td class="right actions-cell">
                  <button
                    v-if="!isEditingRow(r.userId)"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    @click="beginEdit(r.userId)"
                    :disabled="saving || loading || !!editingUserId"
                  >
                    Edit
                  </button>
                  <template v-else>
                    <button class="btn btn-primary btn-sm" type="button" @click="saveRow(r.userId)" :disabled="saving || loading">
                      Save
                    </button>
                    <button class="btn btn-secondary btn-sm" type="button" @click="cancelEdit" :disabled="saving || loading">
                      Cancel
                    </button>
                  </template>
                </td>
              </tr>
              <tr v-if="expandedUserId === r.userId" class="expand-row">
                <td :colspan="expandColspan" class="expand-cell">
                  <ProviderPayerCredentialsPanel
                    :agency-id="selectedAgencyId"
                    :user-id="r.userId"
                    :provider-notes="getValue(r.userId, 'credentialing_provider_notes')"
                    @changed="onPayerCredsChanged"
                    @provider-notes-saved="(val) => onProviderNotesSaved(r.userId, val)"
                  />
                </td>
              </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div v-if="!loading" class="table-footer">
          <div class="muted">
            Showing {{ pageStart }} to {{ pageEnd }} of {{ filteredRows.length }} providers
          </div>
          <div class="pager">
            <button type="button" class="page-btn" :disabled="page <= 1" @click="page -= 1">‹</button>
            <button
              v-for="p in visiblePages"
              :key="p"
              type="button"
              class="page-btn"
              :class="{ active: p === page }"
              @click="page = p"
            >{{ p }}</button>
            <button type="button" class="page-btn" :disabled="page >= totalPages" @click="page += 1">›</button>
          </div>
          <select v-model.number="pageSize" class="page-size">
            <option :value="10">10 per page</option>
            <option :value="25">25 per page</option>
            <option :value="50">50 per page</option>
          </select>
        </div>
      </div>
    </template>

    <div v-else class="card">
      <div class="muted" v-if="!loading">Payers: {{ byInsuranceData.length }}</div>
      <div v-if="loading || byInsuranceLoading" class="loading">Loading by payer…</div>
      <div v-else-if="byInsuranceData.length === 0" class="empty-state muted">No payer credentialing data.</div>
      <div v-else class="insurance-sections">
        <details
          v-for="ins in byInsuranceData"
          :key="ins.insurance.id"
          class="insurance-section"
          :open="byInsuranceData.length <= 5"
        >
          <summary>
            <strong>{{ ins.insurance.name }}</strong>
            <span class="muted">({{ ins.providers.length }} provider{{ ins.providers.length !== 1 ? 's' : '' }})</span>
          </summary>
          <table class="table" style="margin-top: 8px;">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Effective</th>
                <th>Submitted</th>
                <th>Resubmitted</th>
                <th>PIN/Ref</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in ins.providers" :key="p.user_id">
                <td>
                  <router-link :to="orgTo(`/admin/users/${p.user_id}?tab=credentialing`)">
                    {{ p.first_name }} {{ p.last_name }}
                  </router-link>
                </td>
                <td>{{ p.effective_date || '—' }}</td>
                <td>{{ p.submitted_date || '—' }}</td>
                <td>{{ p.resubmitted_date || '—' }}</td>
                <td>{{ p.pin_or_reference || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, ref, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { isFullyLicensedCredentialText } from '../../utils/credentialNormalization.js';
import CredentialingTimeline from '../../components/admin/CredentialingTimeline.vue';
import InsuranceDefinitionsPanel from '../../components/admin/InsuranceDefinitionsPanel.vue';
import AgencyGroupNpisPanel from '../../components/admin/AgencyGroupNpisPanel.vue';
import ProviderPayerCredentialsPanel from '../../components/admin/ProviderPayerCredentialsPanel.vue';

/** Read-only by default; only renders an input when the row is explicitly in edit mode. */
const EditableCell = defineComponent({
  name: 'EditableCell',
  props: {
    editing: { type: Boolean, default: false },
    value: { type: [String, Number], default: '' },
    display: { type: String, default: '' },
    type: { type: String, default: 'text' },
    title: { type: String, default: '' }
  },
  emits: ['change'],
  setup(props, { emit }) {
    return () => {
      if (props.editing) {
        return h('input', {
          class: 'cell-input',
          type: props.type,
          value: props.value ?? '',
          title: props.title || undefined,
          onInput: (e) => emit('change', e.target.value)
        });
      }
      const text = props.display || props.value || '—';
      return h('span', { class: 'cell-text', title: props.title || undefined }, text);
    };
  }
});

const route = useRoute();
const agencyStore = useAgencyStore();

const orgTo = (path) => {
  const slug = route.params.organizationSlug;
  if (typeof slug === 'string' && slug) return `/${slug}${path}`;
  return path;
};

const agencies = computed(() =>
  (agencyStore.userAgencies || []).filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
);
const selectedAgencyId = ref(null);

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const info = ref('');
const search = ref('');
const rows = ref([]);
const showSources = ref(false);
const viewMode = ref('by_provider');
const byInsuranceData = ref([]);
const byInsuranceLoading = ref(false);
const insuranceDefinitionsDetails = ref(null);
const insuranceDefinitionsOpen = ref(String(route.query?.panel || '') === 'insurance-definitions');
const agencyGroupNpisOpen = ref(
  ['agency-group-npis', 'group-npis', 'agency-npis'].includes(String(route.query?.panel || ''))
);
const showCsvModal = ref(false);
const showColumnMenu = ref(false);
const uploadingUserId = ref(null);
const ocrUserId = ref(null);

const npiStatusOptions = [
  'Yes',
  'No, but I have registered and will list the number below and have added ITSCO as a surrogate.',
  'Yes, I will list the number below and have added ITSCO as a surrogate.',
  'No, and ITSCO can make me one (please contact me).'
];

const EDITABLE_KEYS = [
  'date_of_birth',
  'state_of_birth',
  'first_client_date',
  'npi_status',
  'npi_number',
  'npi_id',
  'taxonomy_code',
  'zipcode',
  'license_type_number',
  'license_issued',
  'license_expires',
  'medicaid_location_id',
  'medicaid_effective_date',
  'medicaid_revalidation',
  'medicare_number',
  'caqh_provider_id',
  'personal_email',
  'cell_number',
  'credentialing_provider_notes'
];

const csvColumnOptions = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'date_of_birth', label: 'DOB' },
  { key: 'state_of_birth', label: 'State of birth' },
  { key: 'first_client_date', label: 'First client date' },
  { key: 'npi_status', label: 'Has NPI?' },
  { key: 'npi_number', label: 'NPI number' },
  { key: 'npi_id', label: 'NPI id' },
  { key: 'taxonomy_code', label: 'Taxonomy' },
  { key: 'zipcode', label: 'Zip' },
  { key: 'license_type_number', label: 'License type/number' },
  { key: 'license_issued', label: 'Issued' },
  { key: 'license_expires', label: 'Expires' },
  { key: 'license_upload', label: 'License copy' },
  { key: 'medicaid_location_id', label: 'Medicaid location id' },
  { key: 'medicaid_effective_date', label: 'Medicaid effective' },
  { key: 'medicaid_revalidation', label: 'Medicaid revalidation' },
  { key: 'medicare_number', label: 'Medicare #' },
  { key: 'caqh_provider_id', label: 'CAQH id' },
  { key: 'personal_email', label: 'Personal email' },
  { key: 'cell_number', label: 'Cell' },
  { key: 'credentialing_provider_notes', label: 'Provider notes' }
];
const csvSelectedColumns = ref(csvColumnOptions.map((c) => c.key));

const toggleableColumns = [
  { key: 'date_of_birth', label: 'DOB' },
  { key: 'state_of_birth', label: 'State of Birth' },
  { key: 'first_client_date', label: 'First Client Date' },
  { key: 'npi_status', label: 'Has NPI?' },
  { key: 'npi_number', label: 'NPI Number' },
  { key: 'npi_id', label: 'NPI ID' },
  { key: 'taxonomy_code', label: 'Taxonomy' },
  { key: 'zipcode', label: 'Zip' },
  { key: 'license_type_number', label: 'License Type / Number' },
  { key: 'license_issued', label: 'Issued' },
  { key: 'license_expires', label: 'Expires' },
  { key: 'license_upload', label: 'License Copy' },
  { key: 'medicaid_location_id', label: 'Medicaid Location ID' },
  { key: 'medicaid_effective_date', label: 'Medicaid Effective' },
  { key: 'medicaid_revalidation', label: 'Medicaid Revalidation' },
  { key: 'medicare_number', label: 'Medicare #' },
  { key: 'caqh_provider_id', label: 'CAQH ID' },
  { key: 'personal_email', label: 'Personal Email' },
  { key: 'cell_number', label: 'Cell' }
];

const DEFAULT_VISIBLE = [
  'date_of_birth',
  'state_of_birth',
  'first_client_date',
  'npi_status',
  'npi_number',
  'npi_id',
  'taxonomy_code',
  'zipcode',
  'license_type_number',
  'license_issued',
  'license_expires',
  'license_upload'
];
const visibleColumns = ref([...DEFAULT_VISIBLE]);
const isColVisible = (key) => visibleColumns.value.includes(key);

const expandedUserId = ref(null);
const expandColspan = computed(() => {
  // Provider + visible cols + Status + Payers + Actions
  return 1 + visibleColumns.value.length + 3;
});

const togglePayerExpand = (userId) => {
  const uid = Number(userId);
  expandedUserId.value = Number(expandedUserId.value) === uid ? null : uid;
};

const onPayerCredsChanged = async () => {
  // Refresh in_network badges without collapsing the expand panel.
  const keep = expandedUserId.value;
  await refresh({ keepEdit: true });
  expandedUserId.value = keep;
};

const onProviderNotesSaved = (userId, value) => {
  const row = (rows.value || []).find((x) => Number(x.userId) === Number(userId));
  if (!row) return;
  if (!row.fields) row.fields = {};
  row.fields.credentialing_provider_notes = value;
};

const editingUserId = ref(null);
const draftValues = ref(new Map());
const page = ref(1);
const pageSize = ref(10);
const statusFilter = ref('all'); // all | active | soon | expired | progress | licensed | unlicensed
const sortKey = ref('name');
const sortDir = ref('asc'); // asc | desc

const mapUiFieldKeyToStorageKey = (uiKey) => {
  switch (uiKey) {
    case 'npi_status':
      return 'provider_identity_npi_status';
    case 'npi_number':
      return 'provider_identity_npi_number';
    case 'taxonomy_code':
      return 'provider_identity_taxonomy_code';
    case 'license_type_number':
      return 'provider_credential_license_type_number';
    case 'license_issued':
      return 'provider_credential_license_issued_date';
    case 'license_expires':
      return 'provider_credential_license_expiration_date';
    case 'medicaid_location_id':
      return 'provider_credential_medicaid_location_id';
    case 'medicaid_revalidation':
      return 'provider_credential_medicaid_revalidation_date';
    case 'caqh_provider_id':
      return 'provider_credential_caqh_provider_id';
    default:
      return uiKey;
  }
};

const isEditingRow = (userId) => Number(editingUserId.value || 0) === Number(userId);

const getValue = (userId, fieldKey) => {
  if (isEditingRow(userId) && draftValues.value.has(fieldKey)) return draftValues.value.get(fieldKey) ?? '';
  const r = (rows.value || []).find((x) => Number(x.userId) === Number(userId));
  if (!r) return '';
  if (fieldKey === 'personal_email') return r.personal_email || '';
  if (fieldKey === 'cell_number') return r.cell_number || '';
  const colKey = mapUiFieldKeyToStorageKey(fieldKey);
  return (r.fields || {})[colKey] ?? '';
};

const parseDate = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const daysUntil = (raw) => {
  const d = parseDate(raw);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
};

const hasLicenseNumber = (row) => {
  const v = getValue(row.userId, 'license_type_number');
  return !!String(v || '').trim();
};

/** Fully licensed / insurance-credentialable (LPC, LCSW, MFT/LMFT, LAC, psychologist). */
const isFullyLicensedProvider = (row) => {
  const cred = String(row?.credential || '').trim();
  const licenseTypeNumber = String(getValue(row.userId, 'license_type_number') || '').trim();
  return isFullyLicensedCredentialText(cred) || isFullyLicensedCredentialText(licenseTypeNumber);
};

const licenseUrl = (row) => {
  const raw = row?.licenseUploadUrl || row?.fields?.license_upload || null;
  return raw ? toUploadsUrl(raw) : null;
};

const licenseStatus = (row) => {
  const expires = getValue(row.userId, 'license_expires');
  const issued = getValue(row.userId, 'license_issued');
  const days = daysUntil(expires);
  if (hasLicenseNumber(row) && (!expires || !issued)) return { label: 'Missing dates', tone: 'expired' };
  if (days != null && days < 0) return { label: 'Expired', tone: 'expired' };
  if (days != null && days <= 90) return { label: 'Expiring Soon', tone: 'soon' };
  if (!licenseUrl(row) && hasLicenseNumber(row)) return { label: 'Needs upload', tone: 'progress' };
  if (hasLicenseNumber(row) && expires) return { label: 'Active', tone: 'active' };
  return { label: 'In Progress', tone: 'progress' };
};

const dateCellClass = (row, which) => {
  if (!hasLicenseNumber(row)) return {};
  const issued = getValue(row.userId, 'license_issued');
  const expires = getValue(row.userId, 'license_expires');
  if (!issued || !expires) return { 'cell-alert': true };
  if (which === 'expires') {
    const days = daysUntil(expires);
    if (days != null && days < 0) return { 'cell-expired': true };
    if (days != null && days <= 90) return { 'cell-soon': true };
  }
  return {};
};

/** Smart / fuzzy relevance score — higher is closer to the typed query. */
const smartSearchScore = (row, query) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 1;

  const fields = [
    { text: `${row.first_name || ''} ${row.last_name || ''}`.trim(), weight: 100 },
    { text: `${row.last_name || ''}, ${row.first_name || ''}`.trim(), weight: 95 },
    { text: String(row.last_name || ''), weight: 90 },
    { text: String(row.first_name || ''), weight: 85 },
    { text: String(row.credential || ''), weight: 70 },
    { text: String(row.personal_email || ''), weight: 60 },
    { text: String(getValue(row.userId, 'npi_number') || ''), weight: 75 },
    { text: String(getValue(row.userId, 'license_type_number') || ''), weight: 75 },
    { text: String(getValue(row.userId, 'state_of_birth') || ''), weight: 50 },
    { text: String(getValue(row.userId, 'zipcode') || ''), weight: 45 },
    { text: String(getValue(row.userId, 'taxonomy_code') || ''), weight: 40 },
    { text: String(getValue(row.userId, 'npi_id') || ''), weight: 40 },
    { text: String(getValue(row.userId, 'cell_number') || ''), weight: 35 },
    { text: (row.in_network || []).join(' '), weight: 30 }
  ];

  let best = 0;
  for (const f of fields) {
    const t = String(f.text || '').toLowerCase().trim();
    if (!t) continue;

    if (t === q) {
      best = Math.max(best, f.weight + 50);
      continue;
    }
    if (t.startsWith(q)) {
      best = Math.max(best, f.weight + 35);
      continue;
    }
    // Word-start match (e.g. "alb" matches "Aunya Albinana")
    const words = t.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some((w) => w.startsWith(q))) {
      best = Math.max(best, f.weight + 25);
      continue;
    }
    if (t.includes(q)) {
      best = Math.max(best, f.weight + 10);
      continue;
    }

    // Ordered fuzzy letter match (type "aun" → Aunya)
    let ti = 0;
    let matched = 0;
    let gaps = 0;
    let last = -1;
    for (const c of q) {
      const idx = t.indexOf(c, ti);
      if (idx === -1) {
        matched = -1;
        break;
      }
      if (last >= 0) gaps += idx - last - 1;
      last = idx;
      ti = idx + 1;
      matched += 1;
    }
    if (matched === q.length) {
      const fuzzy = Math.max(1, f.weight - 40 - gaps);
      best = Math.max(best, fuzzy);
    }
  }
  return best;
};

const rowSortValue = (row, key) => {
  switch (key) {
    case 'name':
      return `${row.last_name || ''} ${row.first_name || ''}`.trim().toLowerCase();
    case 'status':
      return licenseStatus(row).label.toLowerCase();
    case 'payers':
      return (row.in_network || []).length;
    case 'personal_email':
      return String(row.personal_email || '').toLowerCase();
    case 'cell_number':
      return String(row.cell_number || '').toLowerCase();
    case 'date_of_birth':
    case 'first_client_date':
    case 'license_issued':
    case 'license_expires':
    case 'medicaid_effective_date':
    case 'medicaid_revalidation': {
      const d = parseDate(getValue(row.userId, key));
      return d ? d.getTime() : 0;
    }
    default:
      return String(getValue(row.userId, key) || '').toLowerCase();
  }
};

const compareRows = (a, b, key, dir) => {
  const av = rowSortValue(a, key);
  const bv = rowSortValue(b, key);
  let cmp = 0;
  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
  return dir === 'desc' ? -cmp : cmp;
};

const matchesStatusFilter = (row, filter) => {
  const f = String(filter || 'all');
  if (!f || f === 'all') return true;
  if (f === 'licensed') return isFullyLicensedProvider(row);
  if (f === 'unlicensed') return !isFullyLicensedProvider(row);
  return licenseStatus(row).tone === f;
};

/** Search-ranked rows (before status filter). Stats are based on this set. */
const searchRankedRows = computed(() => {
  const q = String(search.value || '').trim();
  const list = rows.value || [];
  if (!q) return list.slice();
  return list
    .map((r) => ({ row: r, score: smartSearchScore(r, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareRows(a.row, b.row, 'name', 'asc');
    })
    .map((x) => x.row);
});

const stats = computed(() => {
  const list = searchRankedRows.value || [];
  let active = 0;
  let expiringSoon = 0;
  let expired = 0;
  let inProgress = 0;
  let licensed = 0;
  let unlicensed = 0;
  for (const r of list) {
    if (isFullyLicensedProvider(r)) licensed += 1;
    else unlicensed += 1;
    const st = licenseStatus(r).tone;
    if (st === 'active') active += 1;
    else if (st === 'soon') expiringSoon += 1;
    else if (st === 'expired') expired += 1;
    else inProgress += 1;
  }
  return { total: list.length, active, expiringSoon, expired, inProgress, licensed, unlicensed };
});

const filteredRows = computed(() => {
  const q = String(search.value || '').trim();
  let list = (searchRankedRows.value || []).filter((r) => matchesStatusFilter(r, statusFilter.value));
  // When searching, keep relevance order unless user picked a non-name column sort.
  if (q && (!sortKey.value || sortKey.value === 'name') && sortDir.value === 'asc') {
    return list;
  }
  return list.slice().sort((a, b) => compareRows(a, b, sortKey.value || 'name', sortDir.value || 'asc'));
});

const activeFilterLabel = computed(() => {
  switch (statusFilter.value) {
    case 'active':
      return 'Active license';
    case 'soon':
      return 'Expiring soon';
    case 'expired':
      return 'Expired';
    case 'progress':
      return 'In progress';
    case 'licensed':
      return 'Fully licensed (LPC / LCSW / MFT / LAC / psychologist)';
    case 'unlicensed':
      return 'Not fully licensed (still shown for process tracking)';
    default:
      return '';
  }
});

const setStatusFilter = (next) => {
  const n = String(next || 'all');
  statusFilter.value = statusFilter.value === n && n !== 'all' ? 'all' : n;
  page.value = 1;
};

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortDir.value = 'asc';
  }
  page.value = 1;
};

const sortIndicator = (key) => {
  if (sortKey.value !== key) return '↕';
  return sortDir.value === 'asc' ? '↑' : '↓';
};

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)));
const pageStart = computed(() => (filteredRows.value.length ? (page.value - 1) * pageSize.value + 1 : 0));
const pageEnd = computed(() => Math.min(filteredRows.value.length, page.value * pageSize.value));
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});
const visiblePages = computed(() => {
  const total = totalPages.value;
  const cur = page.value;
  const pages = [];
  const from = Math.max(1, cur - 2);
  const to = Math.min(total, from + 4);
  for (let i = from; i <= to; i += 1) pages.push(i);
  return pages;
});

watch([search, pageSize, statusFilter, sortKey, sortDir], () => {
  page.value = 1;
});

const setValue = (userId, fieldKey, value) => {
  info.value = '';
  error.value = '';
  if (!isEditingRow(userId)) return;
  draftValues.value.set(fieldKey, value);
  draftValues.value = new Map(draftValues.value);
};

const beginEdit = (userId) => {
  const uid = Number(userId);
  if (!uid) return;
  if (editingUserId.value && Number(editingUserId.value) !== uid) {
    if (!confirm('You have unsaved edits on another provider. Discard them and edit this row?')) return;
  }
  const r = (rows.value || []).find((x) => Number(x.userId) === uid);
  if (!r) return;
  // Clear any prior draft before seeding so we never copy values across rows.
  draftValues.value = new Map();
  editingUserId.value = uid;
  const initial = new Map();
  for (const k of EDITABLE_KEYS) initial.set(k, baseValueForRow(r, k));
  draftValues.value = initial;
};

const cancelEdit = () => {
  editingUserId.value = null;
  draftValues.value = new Map();
};

const baseValueForRow = (row, fieldKey) => {
  if (!row) return '';
  if (fieldKey === 'personal_email') return row.personal_email || '';
  if (fieldKey === 'cell_number') return row.cell_number || '';
  const colKey = mapUiFieldKeyToStorageKey(fieldKey);
  return (row.fields || {})[colKey] ?? '';
};

const saveRow = async (userId) => {
  try {
    const uid = Number(userId);
    if (!uid || !selectedAgencyId.value) return;
    const row = (rows.value || []).find((x) => Number(x.userId) === uid);
    if (!row) return;

    const updates = [];
    for (const [fieldKey, draft] of draftValues.value.entries()) {
      const before = baseValueForRow(row, fieldKey);
      const after = String(draft ?? '').trim();
      const beforeNorm = String(before ?? '').trim();
      if (after === beforeNorm) continue;
      updates.push({ userId: uid, fieldKey, value: after || null });
    }

    if (updates.length === 0) {
      info.value = 'No changes.';
      cancelEdit();
      return;
    }

    if (!confirm(`Save ${updates.length} change(s) for ${row.first_name || ''} ${row.last_name || ''}?`)) {
      return;
    }

    saving.value = true;
    error.value = '';
    info.value = '';
    await api.patch(`/agencies/${selectedAgencyId.value}/credentialing/providers`, { updates });
    info.value = 'Saved.';
    await refresh();
    cancelEdit();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to save changes';
  } finally {
    saving.value = false;
  }
};

const cellTitle = (row, uiKey) => {
  if (!row) return '';
  if (uiKey !== 'personal_email' && uiKey !== 'cell_number') {
    const src = String(row?.sources?.[uiKey] || '').trim();
    return src ? `Source field_key: ${src}` : 'No value found in any known field keys for this column.';
  }
  return '';
};

const sourceLabel = (row, uiKey) => {
  const src = String(row?.sources?.[uiKey] || '').trim();
  if (!src) return 'src: (none found)';
  const list = Array.isArray(row?.debug?.[src]) ? row.debug[src] : [];
  const picked = list?.[0] || null;
  const defId = picked?.fieldDefinitionId ? String(picked.fieldDefinitionId) : '';
  const dup = list?.length > 1 ? ` (dups: ${list.length})` : '';
  return `src: ${src}${defId ? ` (#${defId})` : ''}${dup}`;
};

const photoUrl = (row) => {
  const raw = row?.profilePhotoUrl || row?.profile_photo_path || null;
  return raw ? toUploadsUrl(raw) : null;
};

const initials = (row) => {
  const a = String(row?.first_name || '').trim().charAt(0);
  const b = String(row?.last_name || '').trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
};

const AVATAR_COLORS = ['#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#0369a1', '#15803d'];
const avatarColor = (row) => AVATAR_COLORS[Number(row?.userId || 0) % AVATAR_COLORS.length];

const displayName = (row) => {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
  const cred = String(row.credential || '').trim();
  return cred ? `${name}, ${cred}` : name;
};

const formatDisplayDate = (raw) => {
  const d = parseDate(raw);
  if (!d) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
};

const shortNpiStatus = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower === 'yes') return 'Yes';
  if (lower.startsWith('yes')) return 'Yes (ITSCO surrogate)';
  if (lower.includes('make me one') || lower.includes('no_itsco_create')) return 'No — ITSCO can create';
  if (lower.startsWith('no')) return 'No — registered / surrogate';
  return s.length > 42 ? `${s.slice(0, 40)}…` : s;
};

const refresh = async (opts = {}) => {
  try {
    if (!selectedAgencyId.value) return;
    loading.value = true;
    error.value = '';
    info.value = '';
    const res = await api.get(`/agencies/${selectedAgencyId.value}/credentialing/providers`, {
      params: { debug: showSources.value ? 'true' : 'false' }
    });
    rows.value = res.data?.rows || [];
    if (!opts.keepEdit) cancelEdit();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load credentialing grid';
  } finally {
    loading.value = false;
  }
};

const fetchByInsurance = async () => {
  if (!selectedAgencyId.value) return;
  byInsuranceLoading.value = true;
  try {
    const res = await api.get(`/agencies/${selectedAgencyId.value}/credentialing/by-insurance`);
    byInsuranceData.value = res.data?.byInsurance || [];
  } catch {
    byInsuranceData.value = [];
  } finally {
    byInsuranceLoading.value = false;
  }
};

const onLicenseFileSelected = async (row, event) => {
  const file = event?.target?.files?.[0];
  event.target.value = '';
  if (!file || !selectedAgencyId.value) return;
  try {
    uploadingUserId.value = row.userId;
    error.value = '';
    info.value = '';
    const form = new FormData();
    form.append('file', file);
    const res = await api.post(
      `/agencies/${selectedAgencyId.value}/credentialing/providers/${row.userId}/license`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    const extracted = res.data?.extracted;
    const bits = [];
    if (extracted?.license_type_number) bits.push(`number ${extracted.license_type_number}`);
    if (extracted?.license_issued) bits.push(`issued ${extracted.license_issued}`);
    if (extracted?.license_expires) bits.push(`expires ${extracted.license_expires}`);
    info.value = bits.length
      ? `License uploaded and AI filled: ${bits.join(', ')}.`
      : res.data?.ocrError
        ? `License uploaded. AI read failed: ${res.data.ocrError}`
        : 'License uploaded.';
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to upload license';
  } finally {
    uploadingUserId.value = null;
  }
};

const runLicenseOcr = async (row) => {
  if (!selectedAgencyId.value) return;
  try {
    ocrUserId.value = row.userId;
    error.value = '';
    info.value = '';
    const res = await api.post(
      `/agencies/${selectedAgencyId.value}/credentialing/providers/${row.userId}/license/ocr`,
      { apply: true }
    );
    const extracted = res.data?.extracted || {};
    const bits = [];
    if (extracted.license_type_number) bits.push(`number ${extracted.license_type_number}`);
    if (extracted.license_issued) bits.push(`issued ${extracted.license_issued}`);
    if (extracted.license_expires) bits.push(`expires ${extracted.license_expires}`);
    info.value = bits.length ? `AI filled: ${bits.join(', ')}.` : 'AI ran but found no clear license fields.';
    await refresh();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to read license with AI';
  } finally {
    ocrUserId.value = null;
  }
};

const doExportCsv = async () => {
  try {
    if (!selectedAgencyId.value) return;
    const cols = csvSelectedColumns.value?.length ? csvSelectedColumns.value.join(',') : null;
    error.value = '';
    const res = await api.get(`/agencies/${selectedAgencyId.value}/credentialing/providers.csv`, {
      responseType: 'blob',
      params: cols ? { columns: cols } : {}
    });
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agency-${selectedAgencyId.value}-credentialing-providers.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showCsvModal.value = false;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to export CSV';
  }
};

const applyRoutePanelPrefs = async () => {
  const panel = String(route.query?.panel || '').trim();
  insuranceDefinitionsOpen.value =
    panel === 'insurance-definitions' || panel === 'payer-credentialing';
  agencyGroupNpisOpen.value = ['agency-group-npis', 'group-npis', 'agency-npis'].includes(panel);
  const queryAgencyId = parseInt(String(route.query?.agencyId || ''), 10);
  if (Number.isInteger(queryAgencyId) && queryAgencyId > 0) {
    const match = (agencies.value || []).find((a) => Number(a.id) === queryAgencyId);
    if (match) selectedAgencyId.value = queryAgencyId;
  }
  if (insuranceDefinitionsOpen.value) {
    await nextTick();
    insuranceDefinitionsDetails.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
};

watch(
  () => showSources.value,
  async () => {
    if (!selectedAgencyId.value) return;
    await refresh();
  }
);

onMounted(async () => {
  await agencyStore.fetchUserAgencies();
  if (!selectedAgencyId.value && agencies.value.length) {
    selectedAgencyId.value = agencies.value[0].id;
  }
  await applyRoutePanelPrefs();
  if (viewMode.value === 'by_insurance' && selectedAgencyId.value) {
    await fetchByInsurance();
  }
});

watch(
  () => [route.query?.panel, route.query?.agencyId, agencies.value?.length],
  () => {
    void applyRoutePanelPrefs();
  }
);

watch(
  () => selectedAgencyId.value,
  async (next, prev) => {
    if (!next || next === prev) return;
    await refresh();
    await fetchByInsurance();
  },
  { immediate: false }
);

watch(viewMode, (mode) => {
  if (mode === 'by_insurance' && selectedAgencyId.value && byInsuranceData.value.length === 0) {
    fetchByInsurance();
  }
});
</script>

<style scoped>
.credentialing-page {
  font-family: var(--agency-font-family, var(--font-body));
  font-size: 1rem;
  --cred-border: #e5e7eb;
  --cred-muted: #6b7280;
  --cred-surface: #ffffff;
  --cred-bg: #f3f4f6;
}
.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.header-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.filters-card,
.insurance-definitions-card,
.agency-group-npis-card,
.timeline-card,
.table-card {
  margin-top: 14px;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.filters-meta {
  margin-top: 10px;
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}
.inline-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.banner {
  margin-top: 12px;
}
.stats-row {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.stat-card {
  background: var(--cred-surface);
  border: 1px solid var(--cred-border);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  gap: 12px;
  align-items: center;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
}
.stat-card:hover {
  border-color: #99f6e4;
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.08);
}
.stat-card.active {
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.15);
  background: #f0fdf4;
}
.smart-search-wrap {
  position: relative;
}
.smart-search-wrap input {
  width: 100%;
  padding-right: 32px;
}
.clear-search {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
.quick-filters {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.quick-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-right: 2px;
}
.chip {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
}
.chip:hover {
  border-color: #99f6e4;
}
.chip.active {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.chip-expired.active { background: #b91c1c; border-color: #b91c1c; }
.chip-soon.active { background: #c2410c; border-color: #c2410c; }
.chip-active.active { background: #15803d; border-color: #15803d; }
.chip-progress.active { background: #6d28d9; border-color: #6d28d9; }
.chip-clear {
  border-style: dashed;
  color: #6b7280;
}
.filter-pill {
  margin-top: 4px;
  font-size: 12px;
  color: #0f766e;
  font-weight: 600;
}
.sortable {
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sortable:hover {
  color: #0f766e;
}
.sort-ind {
  font-size: 11px;
  opacity: 0.55;
  margin-left: 2px;
}
.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}
.stat-icon svg {
  width: 20px;
  height: 20px;
}
.stat-icon.total { background: #dcfce7; color: #15803d; }
.stat-icon.active { background: #dbeafe; color: #1d4ed8; }
.stat-icon.soon { background: #ffedd5; color: #c2410c; }
.stat-icon.expired { background: #fee2e2; color: #b91c1c; }
.stat-icon.progress { background: #ede9fe; color: #6d28d9; }
.stat-label {
  font-size: 12px;
  color: var(--cred-muted);
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
  color: #111827;
}
.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.table-toolbar h2 {
  margin: 0;
  font-size: 1.05rem;
}
.toolbar-actions {
  position: relative;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--cred-border);
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: #374151;
}
.column-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 20;
  background: #fff;
  border: 1px solid var(--cred-border);
  border-radius: 10px;
  padding: 10px;
  min-width: 220px;
  max-height: 320px;
  overflow: auto;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  display: grid;
  gap: 6px;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--cred-border);
  border-radius: 12px;
}
.cred-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: 1400px;
  background: #fff;
}
.cred-table th,
.cred-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--cred-border);
  text-align: left;
  vertical-align: middle;
  font-size: 13px;
  white-space: nowrap;
}
.cred-table th {
  background: #f9fafb;
  color: #6b7280;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 2;
}
.cred-table tbody tr:hover {
  background: #fafafa;
}
.cred-table tr.row-editing {
  background: #f0fdf4;
}
.sticky-name {
  position: sticky;
  left: 0;
  background: #fff;
  z-index: 1;
  min-width: 240px;
}
.cred-table th.sticky-name {
  z-index: 3;
  background: #f9fafb;
}
.provider-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex: 0 0 auto;
}
.avatar-fallback {
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
}
.provider-name {
  font-weight: 600;
  color: #111827;
  text-decoration: none;
}
.provider-name:hover {
  text-decoration: underline;
}
.cell-text {
  color: #111827;
  user-select: text;
}
.cell-input {
  width: 100%;
  min-width: 110px;
  border: 1px solid #86efac;
  border-radius: 8px;
  padding: 6px 8px;
  background: #fff;
}
.cell-missing {
  color: #b91c1c;
  font-weight: 600;
}
.cell-alert {
  background: #fef2f2 !important;
}
.cell-alert .cell-text {
  color: #b91c1c;
  font-weight: 700;
}
.cell-expired {
  background: #fef2f2 !important;
}
.cell-expired .cell-text {
  color: #b91c1c;
  font-weight: 700;
}
.cell-soon {
  background: #fffbeb !important;
}
.cell-soon .cell-text {
  color: #b45309;
  font-weight: 700;
}
.license-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.link-btn {
  border: none;
  background: none;
  color: #0f766e;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  font-size: 12px;
}
.link-btn.disabled,
.link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.upload-label {
  cursor: pointer;
}
.missing-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  font-weight: 700;
  font-size: 11px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}
.status-pill.active {
  background: #dcfce7;
  color: #15803d;
}
.status-pill.soon {
  background: #ffedd5;
  color: #c2410c;
}
.status-pill.expired {
  background: #fee2e2;
  color: #b91c1c;
}
.status-pill.progress {
  background: #ede9fe;
  color: #6d28d9;
}
.actions-cell {
  white-space: nowrap;
}
.actions-cell .btn + .btn {
  margin-left: 6px;
}
.payers-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.payer-count {
  display: inline-flex;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #0f766e;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}
.expand-row td {
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}
.expand-cell {
  padding: 12px 14px !important;
  white-space: normal !important;
}
.row-expanded {
  background: #f0fdf4;
}
.payer-defs-hint {
  margin: 8px 0 12px;
  font-size: 13px;
}
.table-footer {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.pager {
  display: flex;
  gap: 4px;
  align-items: center;
}
.page-btn {
  min-width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--cred-border);
  background: #fff;
  cursor: pointer;
}
.page-btn.active {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-size {
  border: 1px solid var(--cred-border);
  border-radius: 8px;
  padding: 6px 8px;
  background: #fff;
}
.in-network-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.in-network-badges .badge {
  font-size: 0.75rem;
  padding: 2px 6px;
  background: var(--bg-alt, #f3f4f6);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  color: var(--text-primary, #111827);
}
.src {
  font-size: 11px;
  color: var(--cred-muted);
  margin-top: 2px;
}
.insurance-section {
  margin-bottom: 8px;
  border: 1px solid var(--cred-border);
  border-radius: 6px;
  padding: 8px 12px;
}
.insurance-section summary {
  cursor: pointer;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-overlay .modal {
  max-width: 480px;
  max-height: 80vh;
  overflow: auto;
}
.csv-columns {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 12px 0;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
@media (max-width: 1100px) {
  .stats-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .field-row {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .stats-row {
    grid-template-columns: 1fr;
  }
}
</style>
