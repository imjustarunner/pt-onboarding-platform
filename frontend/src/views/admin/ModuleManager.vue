<template>
  <div class="container">
    <div class="page-header">
      <div>
        <router-link to="/admin" class="back-link">← Back to Dashboard</router-link>
        <h1>{{ viewMode === 'hierarchy' ? 'Training Focus Management' : 'Module Management' }}</h1>
      </div>
      <div class="header-actions">
        <router-link to="/admin/settings?tab=custom-checklist" class="btn btn-secondary" style="text-decoration: none; display: inline-flex; align-items: center;">
          📋 Checklist Items
        </router-link>
        <button 
          @click="viewMode = viewMode === 'table' ? 'hierarchy' : 'table'" 
          class="btn btn-secondary"
        >
          {{ viewMode === 'table' ? '📋 Training Focus View' : '📊 Module View' }}
        </button>
        <button 
          v-if="canCreateEdit" 
          @click="showCreateTrainingFocusModal = true" 
          class="btn btn-secondary"
        >
          Create Training Focus
        </button>
        <button 
          v-if="canCreateEdit" 
          @click="showCreateModal = true" 
          class="btn btn-primary"
        >
          Create New Module
        </button>
      </div>
    </div>
    
    <!-- Filters for Hierarchy View (Training Focus View) -->
    <div class="filters" v-if="!loading && viewMode === 'hierarchy' && trainingFocuses.length > 0">
      <div class="filter-group">
        <div class="status-filter">
          <label>Status:</label>
          <button 
            @click="statusFilter = 'active'" 
            :class="['btn', 'btn-sm', statusFilter === 'active' ? 'btn-primary' : 'btn-secondary']"
          >
            Active
          </button>
          <button 
            @click="statusFilter = 'inactive'" 
            :class="['btn', 'btn-sm', statusFilter === 'inactive' ? 'btn-primary' : 'btn-secondary']"
          >
            Inactive
          </button>
          <button 
            @click="statusFilter = 'all'" 
            :class="['btn', 'btn-sm', statusFilter === 'all' ? 'btn-primary' : 'btn-secondary']"
          >
            All
          </button>
        </div>
        <select 
          v-model="filterAgencyIdForFocus" 
          @change="handleAgencyFilterChange"
          class="filter-select"
          :disabled="!shouldShowAgencyFilter"
        >
          <option value="">All Agencies</option>
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
        <button 
          @click="toggleOnDemandFilter"
          :disabled="!filterAgencyIdForFocus"
          :class="['btn', 'btn-sm', 'on-demand-filter-btn', showOnDemandOnly ? 'btn-primary' : 'btn-secondary']"
          type="button"
          :title="!filterAgencyIdForFocus ? 'Please select an agency first' : (showOnDemandOnly ? 'Click to show all training focuses' : 'Click to show only on-demand training focuses')"
        >
          {{ showOnDemandOnly ? 'Show: Assigned as On-Demand' : 'Assigned as On-Demand' }}
        </button>
      </div>
    </div>
    
    <!-- Filters for Table View -->
    <div class="filters" v-if="!loading && viewMode === 'table' && modules.length > 0">
      <div class="filter-group">
        <div class="status-filter">
          <label>Status:</label>
          <button 
            @click="statusFilter = 'active'" 
            :class="['btn', 'btn-sm', statusFilter === 'active' ? 'btn-primary' : 'btn-secondary']"
          >
            Active
          </button>
          <button 
            @click="statusFilter = 'inactive'" 
            :class="['btn', 'btn-sm', statusFilter === 'inactive' ? 'btn-primary' : 'btn-secondary']"
          >
            Inactive
          </button>
          <button 
            @click="statusFilter = 'all'" 
            :class="['btn', 'btn-sm', statusFilter === 'all' ? 'btn-primary' : 'btn-secondary']"
          >
            All
          </button>
        </div>
        <select 
          v-model="filterAgencyId" 
          @change="handleTableAgencyFilterChange"
          class="filter-select"
        >
          <option value="">All Agencies</option>
          <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
            {{ agency.name }}
          </option>
        </select>
        <button 
          @click="toggleTableOnDemandFilter"
          :class="['btn', 'btn-sm', 'on-demand-filter-btn', showOnDemandModulesOnly ? 'btn-primary' : 'btn-secondary']"
          type="button"
          :title="showOnDemandModulesOnly ? 'Click to show all modules' : 'Click to show only on-demand modules'"
        >
          {{ showOnDemandModulesOnly ? 'Show: On-Demand Modules' : 'On-Demand Modules' }}
        </button>
        <input 
          v-model="moduleSearchQuery"
          type="text"
          placeholder="Search modules by title..."
          class="search-input"
        />
        <select 
          v-model="moduleSortOrder"
          class="filter-select"
        >
          <option value="default">Default Order</option>
          <option value="a-z">A-Z</option>
          <option value="z-a">Z-A</option>
        </select>
      </div>
    </div>
    
    <div v-if="loading" class="loading">Loading modules...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    
    <!-- Training Focus Hierarchy View -->
    <div v-else-if="viewMode === 'hierarchy'" class="training-focus-hierarchy">
      <div v-if="filteredTrainingFocuses.length === 0" class="empty-state">
        <p>No training focuses found{{ statusFilter !== 'all' ? ` (filtered by ${statusFilter} status)` : '' }}. Create one to get started.</p>
      </div>
      <div v-else class="focus-list">
        <div 
          v-for="focus in filteredTrainingFocuses" 
          :key="focus.id"
          class="focus-item"
          :class="{ 'expanded': expandedFocuses.includes(focus.id) }"
        >
          <div 
            class="focus-header"
            @click="toggleFocus(focus.id)"
          >
            <span class="expand-icon">{{ expandedFocuses.includes(focus.id) ? '▼' : '▶' }}</span>
            <img 
              v-if="focus.icon_id && getTrainingFocusIconUrl(focus)" 
              :src="getTrainingFocusIconUrl(focus)" 
              :alt="focus.icon_name || 'Training focus icon'"
              class="focus-icon-left"
            />
            <div class="focus-info">
              <h3>{{ focus.name }}</h3>
              <p class="focus-meta">
                <span v-if="focus.agency_id" class="badge badge-secondary">{{ getAgencyName(focus.agency_id) }}</span>
                <span v-else class="badge badge-warning">Platform Template</span>
                <span :class="['badge', (focus.is_active === true || focus.is_active === 1) ? 'badge-success' : 'badge-secondary']">
                  {{ (focus.is_active === true || focus.is_active === 1) ? 'Active' : 'Inactive' }}
                </span>
                <span class="module-count">{{ getModuleCountForFocus(focus.id) }} modules</span>
                <span v-if="getChecklistItemCountForFocus(focus.id) > 0" class="checklist-count" style="margin-left: 8px;">
                  📋 {{ getChecklistItemCountForFocus(focus.id) }} checklist items
                </span>
              </p>
            </div>
            <div class="focus-actions" @click.stop>
              <button 
                v-if="canCreateEdit"
                @click.stop="editTrainingFocus(focus)" 
                class="btn btn-primary btn-sm"
              >
                Edit
              </button>
              <button 
                v-if="canCreateEdit"
                @click.stop="toggleTrainingFocusStatus(focus)" 
                :class="['btn', 'btn-sm', (focus.is_active === true || focus.is_active === 1) ? 'btn-warning' : 'btn-success']"
              >
                {{ (focus.is_active === true || focus.is_active === 1) ? 'Deactivate' : 'Activate' }}
              </button>
              <button 
                @click.stop="assignTrainingFocus(focus)" 
                class="btn btn-info btn-sm"
              >
                Assign
              </button>
              <button 
                @click.stop="assignTrainingFocusAsPublic(focus)" 
                :class="['btn', 'btn-sm', isTrainingFocusOnDemand(focus.id, filterAgencyIdForFocus ? parseInt(filterAgencyIdForFocus) : null) ? 'btn-danger' : 'btn-info']"
              >
                {{ isTrainingFocusOnDemand(focus.id, filterAgencyIdForFocus ? parseInt(filterAgencyIdForFocus) : null) ? 'Remove as On-Demand' : 'Assign as On-Demand' }}
              </button>
              <button 
                v-if="canCreateEdit" 
                @click.stop="archiveTrainingFocus(focus.id)" 
                class="btn btn-warning btn-sm"
              >
                Archive
              </button>
            </div>
          </div>
          <div v-if="expandedFocuses.includes(focus.id)" class="focus-modules">
            <div v-if="loadingModules[focus.id]" class="loading-modules">Loading modules...</div>
            <div v-else-if="focusModules[focus.id] && focusModules[focus.id].length === 0" class="no-modules">
              <p>No modules in this training focus</p>
            </div>
            <div v-else-if="focusModules[focus.id] && statusFilter === 'active' && focusModules[focus.id].some(m => !(m.is_active === true || m.is_active === 1))" class="inactive-modules-note" style="padding: 8px; margin-bottom: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; font-size: 13px; color: #856404;">
              <strong>Note:</strong> This training focus has {{ focusModules[focus.id].filter(m => !(m.is_active === true || m.is_active === 1)).length }} inactive module(s) that are not shown. Change the status filter to "All" to see all modules.
            </div>
            <div v-if="focusChecklistItems[focus.id]?.direct?.length > 0" class="focus-checklist-items" style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
              <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Training Focus Checklist Items ({{ focusChecklistItems[focus.id]?.direct?.length }}):</h4>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                <span 
                  v-for="item in focusChecklistItems[focus.id]?.direct" 
                  :key="item.id"
                  class="badge badge-info"
                  style="font-size: 12px;"
                >
                  {{ item.item_label }}
                </span>
              </div>
            </div>
            <div class="modules-list">
              <div 
                v-for="module in getFilteredFocusModules(focus.id)" 
                :key="module.id"
                class="module-item"
              >
                <img 
                  v-if="module.icon_id && getIconUrl(module)" 
                  :src="getIconUrl(module)" 
                  :alt="module.icon_name || 'Module icon'"
                  class="module-icon-left"
                />
                <div class="module-info">
                  <div class="module-header-row">
                    <h4>{{ module.title }}</h4>
                    <div class="module-meta">
                      <span :class="['badge', module.is_active ? 'badge-success' : 'badge-secondary']">
                        {{ module.is_active ? 'Active' : 'Inactive' }}
                      </span>
                      <span class="module-order">Order: {{ module.track_order !== undefined ? module.track_order : module.order_index }}</span>
                    </div>
                  </div>
                  <p v-if="module.description" class="module-description">{{ module.description }}</p>
                  <div v-if="focusChecklistItems[focus.id]?.byModule[module.id]?.length > 0" class="module-checklist-items" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">
                    <small style="color: var(--text-secondary); font-weight: 500;">Checklist Items ({{ focusChecklistItems[focus.id]?.byModule[module.id]?.length }}):</small>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;">
                      <span 
                        v-for="item in focusChecklistItems[focus.id]?.byModule[module.id]" 
                        :key="item.id"
                        class="badge badge-info"
                        style="font-size: 11px;"
                      >
                        {{ item.item_label }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="module-actions">
                  <button 
                    v-if="canCreateEdit" 
                    @click.stop="editModule(module)" 
                    class="btn btn-primary btn-sm"
                  >
                    Edit
                  </button>
                  <div v-if="canCreateEdit" class="content-dropdown" :ref="el => setDropdownRef(el, module.id)">
                    <button 
                      @click.stop="toggleContentMenu(module.id, $event)" 
                      class="btn btn-secondary btn-sm"
                    >
                      Content ▼
                    </button>
                    <div 
                      v-if="showContentMenu === module.id" 
                      class="dropdown-menu"
                      :class="{ 'dropdown-up': dropdownPosition[module.id] === 'up' }"
                    >
                      <button @click.stop="manageContent(module)" class="dropdown-item">
                        ✏️ Edit Content
                      </button>
                      <button @click.stop="previewModule(module)" class="dropdown-item">
                        👁️ Preview
                      </button>
                    </div>
                  </div>
                  <button @click.stop="assignModule(module)" class="btn btn-success btn-sm">Assign</button>
                  <button 
                    @click.stop="assignModuleAsPublic(module)" 
                    :class="['btn', 'btn-sm', isModuleOnDemand(module.id) ? 'btn-danger' : 'btn-info']"
                  >
                    {{ isModuleOnDemand(module.id) ? 'Remove as On-Demand' : 'Assign as On-Demand' }}
                  </button>
                  <button 
                    v-if="canCreateEdit" 
                    @click.stop="copyModule(module)" 
                    class="btn btn-secondary btn-sm"
                  >
                    Copy
                  </button>
                  <button 
                    v-if="canCreateEdit" 
                    @click.stop="archiveModule(module.id)" 
                    class="btn btn-warning btn-sm"
                  >
                    Archive
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Table View -->
    <div v-else class="modules-table" :class="{ 'filtered-on-demand': showOnDemandModulesOnly }">
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Agency</th>
            <th>Training Focus</th>
            <th>Order</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="module in filteredModules" 
            :key="module.id"
            :class="{ 'on-demand-row': showOnDemandModulesOnly }"
          >
            <td>
              <div class="table-module-title">
                <img 
                  v-if="module.icon_id && getIconUrl(module)" 
                  :src="getIconUrl(module)" 
                  :alt="module.icon_name || 'Module icon'"
                  class="table-module-icon"
                />
                <span>{{ module.title }}</span>
                <span v-if="module.source_module_id" class="copy-indicator" title="Copied from another module">📋</span>
                <div v-if="getChecklistItemsForModule(module.id).length > 0" style="margin-top: 4px;">
                  <small style="color: var(--text-secondary);">📋 {{ getChecklistItemsForModule(module.id).length }} checklist item(s):</small>
                  <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px;">
                    <span 
                      v-for="item in getChecklistItemsForModule(module.id)" 
                      :key="item.id"
                      class="badge badge-info"
                      style="font-size: 10px;"
                    >
                      {{ item.item_label }}
                    </span>
                  </div>
                </div>
              </div>
            </td>
            <td>
              <span v-if="module.is_shared" class="badge badge-warning">Shared</span>
              <span v-else-if="module.track_id" class="badge badge-secondary">Training Focus</span>
              <span v-else-if="module.agency_id" class="badge badge-secondary">Agency</span>
              <span v-else class="badge badge-secondary">Platform</span>
            </td>
            <td>
              <span v-if="module.agency_id">{{ getAgencyName(module.agency_id) }}</span>
              <span v-else class="text-muted">-</span>
            </td>
            <td>
              <span v-if="module.track_id">{{ getTrainingFocusName(module.track_id) }}</span>
              <span v-else class="text-muted">-</span>
            </td>
            <td>{{ module.order_index }}</td>
            <td>
              <span :class="['badge', module.is_active ? 'badge-success' : 'badge-secondary']">
                {{ module.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td>{{ formatDate(module.created_at) }}</td>
            <td class="actions-cell">
              <div class="action-buttons">
                <button 
                  v-if="canCreateEdit" 
                  @click="editModule(module)" 
                  class="btn btn-primary btn-sm"
                >
                  Edit
                </button>
                <div v-if="canCreateEdit" class="content-dropdown" :ref="el => setDropdownRef(el, module.id)">
                  <button 
                    @click="toggleContentMenu(module.id, $event)" 
                    class="btn btn-secondary btn-sm"
                  >
                    Content ▼
                  </button>
                  <div 
                    v-if="showContentMenu === module.id" 
                    class="dropdown-menu"
                    :class="{ 'dropdown-up': dropdownPosition[module.id] === 'up' }"
                  >
                    <button @click.stop="manageContent(module)" class="dropdown-item">
                      ✏️ Edit Content
                    </button>
                    <button @click.stop="previewModule(module)" class="dropdown-item">
                      👁️ Preview
                    </button>
                  </div>
                </div>
                <button @click="assignModule(module)" class="btn btn-success btn-sm">Assign</button>
                <button 
                  v-if="canCreateEdit" 
                  @click="copyModule(module)" 
                  class="btn btn-secondary btn-sm"
                >
                  Copy
                </button>
                <button 
                  v-if="canCreateEdit" 
                  @click="archiveModule(module.id)" 
                  class="btn btn-warning btn-sm"
                >
                  Archive
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- Create/Edit Modal -->
    <div v-if="showCreateModal || editingModule" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <h2>{{ editingModule ? 'Edit Module' : 'Create New Module' }}</h2>
        <form @submit.prevent="saveModule">
          <div class="form-group">
            <label>Title *</label>
            <input v-model="moduleForm.title" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="moduleForm.description" rows="4"></textarea>
          </div>
          <div class="form-group">
            <IconSelector v-model="moduleForm.iconId" label="Select Module Icon" />
          </div>
          <div class="form-group">
            <label>Training Focus</label>
            <select v-model="moduleForm.trackId" class="filter-select">
              <option :value="null">None (Standalone Module)</option>
              <option v-for="focus in trainingFocuses" :key="focus.id" :value="focus.id">
                {{ focus.name }}
              </option>
            </select>
            <small style="display: block; margin-top: 4px; color: var(--text-secondary);">
              Link this module to a training focus, or leave as standalone.
            </small>
          </div>
          <div class="form-group">
            <label>Order Index</label>
            <input v-model.number="moduleForm.orderIndex" type="number" min="0" />
          </div>
          <div class="form-group">
            <label>
              <input v-model="moduleForm.isActive" type="checkbox" />
              Active
            </label>
          </div>
          
          <div v-if="editingModule" class="form-group">
            <button 
              type="button" 
              @click="toggleModuleStatus" 
              :class="['btn', moduleForm.isActive ? 'btn-warning' : 'btn-success']"
            >
              {{ moduleForm.isActive ? 'Deactivate Module' : 'Activate Module' }}
            </button>
            <small v-if="moduleForm.isActive" style="display: block; margin-top: 8px; color: var(--text-secondary);">
              Deactivating this module will hide it from users and prevent new assignments.
            </small>
            <small v-else style="display: block; margin-top: 8px; color: var(--text-secondary);">
              Activating this module will make it available for assignments and visible to users.
            </small>
          </div>
          <div class="form-group">
            <label>Assign as On-Demand</label>
            <select v-model="moduleForm.onDemandAgencyId" @change="handleModuleOnDemandAgencyChange" class="filter-select">
              <option value="">Select Agency</option>
              <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
            <button 
              v-if="moduleForm.onDemandAgencyId"
              type="button"
              @click="toggleModuleOnDemandInModal"
              :class="['btn', 'btn-sm', isModuleOnDemandForAgency ? 'btn-danger' : 'btn-info']"
              :disabled="savingOnDemandModule || !editingModule"
              style="margin-top: 8px;"
            >
              {{ savingOnDemandModule ? 'Processing...' : (isModuleOnDemandForAgency ? 'Remove as On-Demand' : 'Assign as On-Demand') }}
            </button>
            <small v-if="moduleForm.onDemandAgencyId && !editingModule" style="display: block; margin-top: 4px; color: var(--text-secondary);">
              Save the module first, then you can assign it as on-demand.
            </small>
            <small v-else-if="moduleForm.onDemandAgencyId" style="display: block; margin-top: 4px; color: var(--text-secondary);">
              {{ isModuleOnDemandForAgency ? 'This module is assigned as on-demand for the selected agency.' : 'Click to assign this module as on-demand for the selected agency.' }}
            </small>
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeModal" class="btn btn-secondary">Cancel</button>
            <button 
              v-if="!editingModule" 
              type="button" 
              @click="saveModuleAndContinue" 
              class="btn btn-success" 
              :disabled="saving"
            >
              {{ saving ? 'Saving...' : 'Next' }}
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Copy Module Dialog -->
    <ModuleCopyDialog
      v-if="showCopyModal && moduleToCopy"
      :module="moduleToCopy"
      @close="showCopyModal = false"
      @copied="handleModuleCopied"
    />

    <!-- Module Assignment Dialog -->
    <ModuleAssignmentDialog
      v-if="showAssignModal && moduleToAssign"
      :module="moduleToAssign"
      @close="showAssignModal = false; moduleToAssign = null"
      @assigned="handleModuleAssigned"
    />

    <!-- Create/Edit Training Focus Modal -->
    <div v-if="showCreateTrainingFocusModal || showEditTrainingFocusModal" class="modal-overlay" @click="closeTrainingFocusModal">
      <div class="modal-content" @click.stop>
        <h3>{{ editingTrainingFocus ? 'Edit Training Focus' : 'Create Training Focus' }}</h3>
        <form @submit.prevent="saveTrainingFocus">
          <div class="form-group" v-if="userRole === 'super_admin'">
            <label>Type *</label>
            <select v-model="trainingFocusForm.templateType" @change="handleTemplateTypeChange">
              <option value="template">Training Focus Template (Platform-wide, reusable)</option>
              <option value="agency">Agency Training Focus (Specific to an agency)</option>
            </select>
            <small style="display: block; margin-top: 4px; color: var(--text-secondary);">
              <span v-if="trainingFocusForm.templateType === 'template'">Templates can be copied to agencies. Leave agency empty.</span>
              <span v-else>This will be created directly in the selected agency.</span>
            </small>
          </div>
          <div class="form-group" v-if="userRole === 'super_admin' && trainingFocusForm.templateType === 'agency'">
            <label>Agency *</label>
            <select v-model="trainingFocusForm.agencyId" required>
              <option value="">Select agency</option>
              <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
          </div>
          <div class="form-group" v-else-if="userRole === 'admin'">
            <label>Agency *</label>
            <select v-model="trainingFocusForm.agencyId" required>
              <option value="">Select agency</option>
              <option v-for="agency in (agencyStore.userAgencies || agencies)" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
          </div>
          <div class="form-group">
            <label>Name *</label>
            <input v-model="trainingFocusForm.name" type="text" required />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="trainingFocusForm.description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <IconSelector v-model="trainingFocusForm.iconId" label="Select Training Focus Icon" />
          </div>
          <div class="form-group">
            <label>Order Index</label>
            <input v-model.number="trainingFocusForm.orderIndex" type="number" min="0" />
          </div>
          <div class="form-group">
            <label>
              <input v-model="trainingFocusForm.isActive" type="checkbox" />
              Active
            </label>
          </div>
          <div class="form-group">
            <label>Add Module</label>
            <div style="display: flex; gap: 8px; align-items: flex-start;">
              <select v-model="trainingFocusForm.linkedModuleId" class="filter-select" style="flex: 1;">
                <option :value="null">Link Existing Module</option>
                <option v-for="module in modules" :key="module.id" :value="module.id">
                  {{ module.title }}
                </option>
              </select>
              <button 
                type="button"
                @click="createModuleForTrainingFocus"
                class="btn btn-primary btn-sm"
              >
                Create New Module
              </button>
            </div>
            <small style="display: block; margin-top: 4px; color: var(--text-secondary);">
              Link an existing module to this training focus, or create a new one.
            </small>
          </div>
          <div v-if="editingTrainingFocus" class="form-group">
            <label>Checklist Items</label>
            <div style="border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: #f8f9fa;">
              <div v-if="trainingFocusChecklistItems.length === 0" class="empty-state" style="padding: 16px; text-align: center; color: var(--text-secondary);">
                No checklist items nested under this training focus.
              </div>
              <div v-else style="margin-bottom: 12px;">
                <div v-for="item in trainingFocusChecklistItems" :key="item.id" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: white; border-radius: 4px; margin-bottom: 8px;">
                  <span>{{ item.item_label }}</span>
                  <button 
                    type="button"
                    @click="removeChecklistItemFromTrainingFocus(item.id)"
                    class="btn btn-danger btn-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <select v-model="selectedChecklistItemForTrainingFocus" class="filter-select" style="flex: 1;">
                  <option :value="null">Select Checklist Item</option>
                  <option v-for="item in availableChecklistItemsForTrainingFocus" :key="item.id" :value="item.id">
                    {{ item.item_label }}
                  </option>
                </select>
                <button 
                  type="button"
                  @click="addChecklistItemToTrainingFocus"
                  class="btn btn-primary btn-sm"
                  :disabled="!selectedChecklistItemForTrainingFocus"
                >
                  Add
                </button>
              </div>
            </div>
            <small style="display: block; margin-top: 4px; color: var(--text-secondary);">
              Add checklist items that should be nested under this training focus. These will be auto-assigned when the training focus is assigned to users.
            </small>
          </div>
          <div v-if="editingTrainingFocus" class="form-group">
            <label>Assign as On-Demand</label>
            <select v-model="trainingFocusForm.onDemandAgencyId" @change="handleTrainingFocusOnDemandAgencyChange" class="filter-select">
              <option value="">Select Agency</option>
              <option v-for="agency in agencies" :key="agency.id" :value="agency.id">
                {{ agency.name }}
              </option>
            </select>
            <button 
              v-if="trainingFocusForm.onDemandAgencyId"
              type="button"
              @click="toggleTrainingFocusOnDemandInModal"
              :class="['btn', 'btn-sm', isTrainingFocusOnDemandForAgency ? 'btn-danger' : 'btn-info']"
              :disabled="savingOnDemandTrainingFocus"
              style="margin-top: 8px;"
            >
              {{ savingOnDemandTrainingFocus ? 'Processing...' : (isTrainingFocusOnDemandForAgency ? 'Remove as On-Demand' : 'Assign as On-Demand') }}
            </button>
            <small v-if="trainingFocusForm.onDemandAgencyId" style="display: block; margin-top: 4px; color: var(--text-secondary);">
              {{ isTrainingFocusOnDemandForAgency ? 'This training focus is assigned as on-demand for the selected agency.' : 'Click to assign this training focus as on-demand for the selected agency.' }}
            </small>
          </div>
          <div v-if="trainingFocusError" class="error-message" style="margin-bottom: 16px; padding: 12px; background: #fee2e2; border-radius: 8px; color: #991b1b;">
            {{ trainingFocusError }}
          </div>
          <div class="modal-actions">
            <button type="button" @click="closeTrainingFocusModal" class="btn btn-secondary">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="savingTrainingFocus">
              {{ savingTrainingFocus ? (editingTrainingFocus ? 'Saving...' : 'Creating...') : (editingTrainingFocus ? 'Save Changes' : 'Create Training Focus') }}
            </button>
          </div>
        </form>
      </div>
    </div>
    
    <!-- Content Manager Modal -->
    <div v-if="showContentModal" class="modal-overlay" @click="closeContentModal">
      <div class="modal-content large" @click.stop>
        <h2>Manage Content: {{ currentModule?.title }}</h2>
        <ContentEditor
          :module-id="currentModule?.id"
          @close="closeContentModal"
        />
      </div>
    </div>

    <!-- Assign On-Demand Training Dialog -->
    <AssignPublicTrainingDialog
      v-if="showAssignPublicModal && itemToAssignAsPublic"
      :type="publicAssignmentType"
      :item-id="itemToAssignAsPublic.id"
      :item-name="itemToAssignAsPublic.title || itemToAssignAsPublic.name"
      @close="handlePublicAssignment"
      @assigned="handlePublicAssignmentAndRefresh"
    />
    
    <!-- Training Focus Assignment Dialog -->
    <TrainingFocusAssignmentDialog
      v-if="showAssignTrainingFocusDialog && trainingFocusToAssign"
      :trainingFocus="trainingFocusToAssign"
      @close="showAssignTrainingFocusDialog = false; trainingFocusToAssign = null"
      @assigned="handleTrainingFocusAssigned"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import ContentEditor from '../../components/admin/ContentEditor.vue';
import ModuleCopyDialog from '../../components/admin/ModuleCopyDialog.vue';
import ModuleAssignmentDialog from '../../components/admin/ModuleAssignmentDialog.vue';
import AssignPublicTrainingDialog from '../../components/admin/AssignPublicTrainingDialog.vue';
import TrainingFocusAssignmentDialog from '../../components/admin/TrainingFocusAssignmentDialog.vue';
import IconSelector from '../../components/admin/IconSelector.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const userRole = computed(() => authStore.user?.role);
const user = computed(() => authStore.user);
const canCreateEdit = computed(() => {
  const role = authStore.user?.role;
  return role === 'admin' || role === 'super_admin';
});

const shouldShowAgencyFilter = computed(() => {
  if (userRole.value === 'super_admin') {
    return true;
  }
  if (userRole.value === 'admin' && agencyStore.userAgencies && agencyStore.userAgencies.length > 1) {
    return true;
  }
  return false;
});

const modules = ref([]);
const agencies = ref([]);
const trainingFocuses = ref([]);
const loading = ref(true);
const error = ref('');
const showCreateModal = ref(false);
const showCreateSharedModal = ref(false);
const editingModule = ref(null);
const showContentModal = ref(false);
const showCopyModal = ref(false);
const showAssignModal = ref(false);
const showCreateTrainingFocusModal = ref(false);
const showAssignPublicModal = ref(false);
const showAssignTrainingFocusDialog = ref(false);
const trainingFocusToAssign = ref(null);
const currentModule = ref(null);
const moduleToCopy = ref(null);
const moduleToAssign = ref(null);
const itemToAssignAsPublic = ref(null);
const publicAssignmentType = ref(null);
const onDemandAssignments = ref({}); // { [agencyId]: { trainingFocuses: [], modules: [] } }
const saving = ref(false);
const savingTrainingFocus = ref(false);
const trainingFocusError = ref('');
const showEditTrainingFocusModal = ref(false);
const editingTrainingFocus = ref(null);
const trainingFocusForm = ref({
  name: '',
  description: '',
  agencyId: null,
  templateType: 'template', // 'template' or 'agency'
  orderIndex: 0,
  isActive: true,
  iconId: null,
  onDemandAgencyId: null, // Agency selected for on-demand assignment in modal
  linkedModuleId: null // Module to link when creating/editing training focus
});
const savingOnDemandTrainingFocus = ref(false);
const route = useRoute();
const router = useRouter();
const filterType = ref(route.query.filter || 'all');
const filterAgencyId = ref('');
const filterTrainingFocusId = ref('');
const statusFilter = ref('active'); // 'active', 'inactive', 'all'
// Set viewMode based on route query parameter, default to hierarchy (training focus view)
const viewMode = ref(route.query.view === 'table' ? 'table' : 'hierarchy'); // 'table' or 'hierarchy'
const expandedFocuses = ref([]);
const focusModules = ref({}); // { focusId: [modules] }
const loadingModules = ref({}); // { focusId: boolean }
const filterAgencyIdForFocus = ref(''); // Agency filter for hierarchy view
const showOnDemandOnly = ref(false); // Toggle for showing only on-demand training focuses
const showOnDemandModulesOnly = ref(false); // Toggle for showing only on-demand modules in table view
const moduleSearchQuery = ref(''); // Search query for module view
const moduleSortOrder = ref('default'); // Sort order for module view: 'default', 'a-z', 'z-a'
const showContentMenu = ref(null); // Track which module's content menu is open
const dropdownPosition = ref({}); // Track dropdown position for each module: 'up' or 'down'
const dropdownRefs = ref({}); // Store refs to dropdown containers

const moduleForm = ref({
  title: '',
  description: '',
  orderIndex: 0,
  isActive: true,
  agencyId: null,
  trackId: null,
  iconId: null,
  onDemandAgencyId: null // Agency selected for on-demand assignment in modal
});
const savingOnDemandModule = ref(false);

const filteredModules = computed(() => {
  let filtered = modules.value;
  
  // Apply status filter
  // MySQL BOOLEAN returns 1/0, so check for both boolean true and numeric 1
  if (statusFilter.value === 'active') {
    filtered = filtered.filter(m => m.is_active === true || m.is_active === 1);
  } else if (statusFilter.value === 'inactive') {
    filtered = filtered.filter(m => m.is_active === false || m.is_active === 0 || m.is_active === null);
  }
  // 'all' shows everything, no filter needed
  
  // Apply agency filter
  if (filterAgencyId.value) {
    const agencyId = parseInt(filterAgencyId.value);
    
    if (showOnDemandModulesOnly.value) {
      // When on-demand filter is ON: Show only modules assigned as on-demand for this agency
      filtered = filtered.filter(m => isModuleOnDemand(m.id, agencyId));
    } else {
      // When on-demand filter is OFF: Show only modules that belong to this agency
      // AND are NOT assigned as on-demand for this agency
      filtered = filtered.filter(m => {
        const belongsToAgency = m.agency_id === agencyId;
        const isOnDemand = isModuleOnDemand(m.id, agencyId);
        return belongsToAgency && !isOnDemand;
      });
    }
  } else if (showOnDemandModulesOnly.value) {
    // When no agency is selected but on-demand filter is ON: Show modules assigned as on-demand for ANY agency
    filtered = filtered.filter(m => isModuleOnDemand(m.id, null));
  }
  
  // Apply search filter
  if (moduleSearchQuery.value && moduleSearchQuery.value.trim() !== '') {
    const query = moduleSearchQuery.value.toLowerCase().trim();
    filtered = filtered.filter(m => 
      m.title && m.title.toLowerCase().includes(query)
    );
  }
  
  // Apply sort
  if (moduleSortOrder.value === 'a-z') {
    filtered = [...filtered].sort((a, b) => {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });
  } else if (moduleSortOrder.value === 'z-a') {
    filtered = [...filtered].sort((a, b) => {
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      return titleB.localeCompare(titleA);
    });
  }
  // 'default' keeps original order
  
  return filtered;
});

const fetchModules = async () => {
  try {
    loading.value = true;
    const response = await api.get('/modules');
    const modulesData = response.data;
    modules.value = modulesData;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load modules';
  } finally {
    loading.value = false;
  }
};

const applyFilters = () => {
  // Filtering is handled by computed property
};

const getAgencyName = (agencyId) => {
  const agency = agencies.value.find(a => a.id === agencyId);
  return agency ? agency.name : 'Unknown';
};

const getTrainingFocusName = (trainingFocusId) => {
  const focus = trainingFocuses.value.find(f => f.id === trainingFocusId);
  return focus ? focus.name : 'Unknown';
};

const toggleFocus = async (focusId) => {
  const index = expandedFocuses.value.indexOf(focusId);
  if (index > -1) {
    // Collapse
    expandedFocuses.value.splice(index, 1);
  } else {
    // Expand - load modules if not already loaded
    expandedFocuses.value.push(focusId);
    if (!focusModules.value[focusId]) {
      await loadModulesForFocus(focusId);
    }
  }
};

const focusChecklistItems = ref({}); // { focusId: { direct: [], byModule: { moduleId: [] } } }

const loadModulesForFocus = async (focusId) => {
  try {
    loadingModules.value[focusId] = true;
    const response = await api.get(`/training-focuses/${focusId}`);
    const modules = response.data.modules || [];
    focusModules.value[focusId] = modules;
    
    // Load checklist items for this training focus
    await fetchChecklistItemsForFocus(focusId);
  } catch (err) {
    console.error(`Failed to load modules for training focus ${focusId}:`, err);
    focusModules.value[focusId] = [];
  } finally {
    loadingModules.value[focusId] = false;
  }
};

const fetchChecklistItemsForFocus = async (focusId) => {
  try {
    if (allChecklistItems.value.length === 0) {
      await fetchAllChecklistItems();
    }
    
    // Get items nested directly under this training focus
    const directItems = allChecklistItems.value.filter(item => 
      item.training_focus_id === focusId && !item.module_id
    );
    
    // Get items nested under modules in this training focus
    const byModule = {};
    if (focusModules.value[focusId]) {
      for (const module of focusModules.value[focusId]) {
        const moduleItems = allChecklistItems.value.filter(item => item.module_id === module.id);
        if (moduleItems.length > 0) {
          byModule[module.id] = moduleItems;
        }
      }
    }
    
    focusChecklistItems.value[focusId] = {
      direct: directItems,
      byModule: byModule
    };
    
    // Update count
    const totalCount = directItems.length + Object.values(byModule).flat().length;
    trainingFocusChecklistCounts.value[focusId] = totalCount;
  } catch (err) {
    console.error('Failed to load checklist items for training focus:', err);
    focusChecklistItems.value[focusId] = { direct: [], byModule: {} };
  }
};

const getFilteredFocusModules = (focusId) => {
  if (!focusModules.value[focusId]) {
    return [];
  }
  
  let filtered = focusModules.value[focusId];
  
  // Apply status filter
  // MySQL BOOLEAN returns 1/0, so check for both boolean true and numeric 1
  if (statusFilter.value === 'active') {
    filtered = filtered.filter(m => m.is_active === true || m.is_active === 1);
  } else if (statusFilter.value === 'inactive') {
    filtered = filtered.filter(m => m.is_active === false || m.is_active === 0 || m.is_active === null);
  }
  // 'all' shows everything, no filter needed
  
  return filtered;
};

const filteredTrainingFocuses = computed(() => {
  let filtered = trainingFocuses.value;
  
  // Apply status filter to training focuses
  // MySQL BOOLEAN returns 1/0, so check for both boolean true and numeric 1
  if (statusFilter.value === 'active') {
    filtered = filtered.filter(f => f.is_active === true || f.is_active === 1);
  } else if (statusFilter.value === 'inactive') {
    filtered = filtered.filter(f => f.is_active === false || f.is_active === 0 || f.is_active === null);
  }
  // 'all' shows everything, no filter needed
  
  // Apply agency and on-demand filters
  if (filterAgencyIdForFocus.value) {
    const agencyId = parseInt(filterAgencyIdForFocus.value);
    
    if (showOnDemandOnly.value) {
      // When on-demand filter is ON: Show only training focuses assigned as on-demand for this agency
      // This includes both agency-specific training focuses AND platform templates assigned to that agency
      filtered = filtered.filter(f => isTrainingFocusOnDemand(f.id, agencyId));
    } else {
      // When on-demand filter is OFF: Show only training focuses that belong to this agency
      // AND are NOT assigned as on-demand for this agency
      filtered = filtered.filter(f => {
        const belongsToAgency = f.agency_id === agencyId;
        const isOnDemand = isTrainingFocusOnDemand(f.id, agencyId);
        return belongsToAgency && !isOnDemand;
      });
    }
  }
  
  return filtered;
});

const trainingFocusChecklistCounts = ref({}); // { focusId: count }
const allChecklistItems = ref([]); // All checklist items for lookup

const fetchAllChecklistItems = async () => {
  try {
    const response = await api.get('/custom-checklist-items');
    allChecklistItems.value = response.data || [];
  } catch (err) {
    console.error('Failed to load checklist items:', err);
    allChecklistItems.value = [];
  }
};

const fetchChecklistItemCountForFocus = async (focusId) => {
  try {
    if (allChecklistItems.value.length === 0) {
      await fetchAllChecklistItems();
    }
    // Count items nested under this training focus (both direct and via modules)
    const focusItems = allChecklistItems.value.filter(item => 
      item.training_focus_id === focusId || 
      (item.module_id && focusModules.value[focusId]?.some(m => m.id === item.module_id))
    );
    trainingFocusChecklistCounts.value[focusId] = focusItems.length;
  } catch (err) {
    console.error('Failed to load checklist item count:', err);
    trainingFocusChecklistCounts.value[focusId] = 0;
  }
};

const getChecklistItemCountForFocus = (focusId) => {
  return trainingFocusChecklistCounts.value[focusId] || 0;
};

const getChecklistItemsForModule = (moduleId) => {
  if (!moduleId || allChecklistItems.value.length === 0) return [];
  return allChecklistItems.value.filter(item => item.module_id === moduleId);
};

const getModuleCountForFocus = (focusId) => {
  if (focusModules.value[focusId]) {
    // Return count based on current status filter
    return getFilteredFocusModules(focusId).length;
  }
  // Try to get count from modules list
  const focusModulesFromList = modules.value.filter(m => m.track_id === focusId);
  if (statusFilter.value === 'active') {
    return focusModulesFromList.filter(m => m.is_active === true || m.is_active === 1).length;
  } else if (statusFilter.value === 'inactive') {
    return focusModulesFromList.filter(m => m.is_active === false || m.is_active === 0 || m.is_active === null).length;
  }
  return focusModulesFromList.length;
};

const toggleTrainingFocusStatus = async (focus) => {
  const isCurrentlyActive = focus.is_active === true || focus.is_active === 1;
  const focusName = focus.name;
  
  // Get total module count (not filtered by status) - need to load modules if not already loaded
  let moduleCount = 0;
  if (focusModules.value[focus.id]) {
    moduleCount = focusModules.value[focus.id].length;
  } else {
    // Try to get count from modules list
    moduleCount = modules.value.filter(m => m.track_id === focus.id).length;
    // If not in modules list, we might need to load it
    if (moduleCount === 0) {
      try {
        const response = await api.get(`/training-focuses/${focus.id}`);
        moduleCount = (response.data.modules || []).length;
      } catch (err) {
        console.error('Failed to get module count:', err);
      }
    }
  }
  
  let cascadeDeactivateModules = false;
  
  // If deactivating, ask about modules
  if (isCurrentlyActive) {
    // First confirm deactivation
    const deactivateMessage = moduleCount > 0
      ? `Deactivate "${focusName}"?\n\nThis training focus has ${moduleCount} module(s).`
      : `Deactivate "${focusName}"?`;
    
    if (!confirm(deactivateMessage)) {
      return;
    }
    
    // If there are modules, ask about cascading with a clearer message
    if (moduleCount > 0) {
      const cascadeMessage = `Do you also want to set all ${moduleCount} module(s) in this training focus as inactive?\n\nClick OK for Yes, Cancel for No.`;
      cascadeDeactivateModules = confirm(cascadeMessage);
    }
  } else {
    // Activating - just confirm
    if (!confirm(`Activate "${focusName}"?`)) {
      return;
    }
  }
  
  try {
    // Ensure we have a valid name - fetch full details if name is missing
    let focusData = focus;
    if (!focus.name || focus.name.trim() === '') {
      try {
        const response = await api.get(`/training-focuses/${focus.id}`);
        focusData = response.data;
      } catch (fetchErr) {
        console.error('Failed to fetch training focus details:', fetchErr);
        alert('Failed to load training focus details. Please try again.');
        return;
      }
    }
    
    const updateData = {
      name: focusData.name.trim(), // Required by validation - ensure it's not empty
      isActive: !isCurrentlyActive,
      cascadeDeactivateModules: cascadeDeactivateModules
    };
    
    // Include optional fields if they exist
    if (focusData.description !== undefined && focusData.description !== null) {
      updateData.description = focusData.description;
    }
    if (focusData.order_index !== undefined && focusData.order_index !== null) {
      updateData.orderIndex = focusData.order_index;
    }
    if (focusData.assignment_level !== undefined && focusData.assignment_level !== null) {
      updateData.assignmentLevel = focusData.assignment_level;
    }
    if (focusData.agency_id !== undefined) {
      updateData.agencyId = focusData.agency_id || null;
    }
    if (focusData.role !== undefined && focusData.role !== null) {
      updateData.role = focusData.role;
    }
    
    console.log('Updating training focus with data:', updateData);
    
    await api.put(`/training-focuses/${focus.id}`, updateData);
    
    // Refresh training focuses list
    await fetchTrainingFocuses();
    
    // Refresh modules list to reflect any changes
    fetchModules();
    
    // Refresh modules for this focus if it's expanded
    if (expandedFocuses.value.includes(focus.id) && focusModules.value[focus.id]) {
      await loadModulesForFocus(focus.id);
    }
  } catch (err) {
    console.error('Error updating training focus:', err);
    const errorMessage = err.response?.data?.error?.message || err.response?.data?.error?.errors?.[0]?.msg || 'Failed to update training focus status';
    error.value = errorMessage;
    alert(errorMessage);
  }
};

const archiveTrainingFocus = async (focusId) => {
  const focus = trainingFocuses.value.find(f => f.id === focusId);
  const focusName = focus ? focus.name : 'this training focus';
  
  if (!confirm(`Are you sure you want to archive "${focusName}"? It will be moved to the archive and can be restored or permanently deleted later.`)) {
    return;
  }
  
  try {
    await api.post(`/training-focuses/${focusId}/archive`);
    
    // Remove from expanded list if it was expanded
    const expandedIndex = expandedFocuses.value.indexOf(focusId);
    if (expandedIndex > -1) {
      expandedFocuses.value.splice(expandedIndex, 1);
    }
    
    // Remove from focusModules cache
    delete focusModules.value[focusId];
    delete loadingModules.value[focusId];
    
    // Refresh training focuses list
    await fetchTrainingFocuses();
    
    // Refresh modules list to reflect any changes
    fetchModules();
    
    alert('Training focus archived successfully');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to archive training focus';
    alert(error.value);
  }
};

const copyModule = (module) => {
  moduleToCopy.value = module;
  showCopyModal.value = true;
};

const assignModule = (module) => {
  moduleToAssign.value = module;
  showAssignModal.value = true;
};

const assignModuleAsPublic = (module) => {
  itemToAssignAsPublic.value = module;
  publicAssignmentType.value = 'module';
  showAssignPublicModal.value = true;
};

const fetchOnDemandForAgency = async (agencyId) => {
  if (!agencyId) {
    return;
  }
  
  // Ensure agencyId is a number for consistent key storage
  const agencyIdNum = typeof agencyId === 'string' ? parseInt(agencyId, 10) : agencyId;
  
  try {
    const response = await api.get(`/agency-on-demand-training/${agencyIdNum}`);
    onDemandAssignments.value[agencyIdNum] = {
      trainingFocuses: response.data?.trainingFocuses || [],
      modules: response.data?.modules || []
    };
    console.log(`Fetched on-demand assignments for agency ${agencyIdNum}:`, onDemandAssignments.value[agencyIdNum]);
  } catch (err) {
    console.error(`Failed to fetch on-demand assignments for agency ${agencyIdNum}:`, err);
    onDemandAssignments.value[agencyIdNum] = { trainingFocuses: [], modules: [] };
  }
};

const fetchOnDemandAssignments = async (agencyId = null) => {
  try {
    if (agencyId) {
      // Fetch for specific agency
      await fetchOnDemandForAgency(agencyId);
      return;
    }
    
    // Ensure userAgencies is available
    if (!agencyStore.userAgencies || agencyStore.userAgencies.length === 0) {
      // If user is super_admin, they might not have userAgencies set
      // In that case, we can't fetch agency-specific assignments
      onDemandAssignments.value = {};
      return;
    }
    
    const userAgencies = agencyStore.userAgencies;
    
    // Fetch assignments for all user agencies
    for (const agency of userAgencies) {
      await fetchOnDemandForAgency(agency.id);
    }
  } catch (err) {
    console.error('Failed to fetch on-demand assignments:', err);
    onDemandAssignments.value = {};
  }
};

const isTrainingFocusOnDemand = (focusId, agencyId = null) => {
  // Ensure focusId is a number for comparison
  const focusIdNum = typeof focusId === 'string' ? parseInt(focusId, 10) : focusId;
  
  // If agencyId is provided, check only that agency's assignments
  if (agencyId) {
    // Ensure agencyId is a number for consistent key lookup
    const agencyIdNum = typeof agencyId === 'string' ? parseInt(agencyId, 10) : agencyId;
    const agencyAssignments = onDemandAssignments.value[agencyIdNum];
    
    if (!agencyAssignments || !agencyAssignments.trainingFocuses || agencyAssignments.trainingFocuses.length === 0) {
      return false;
    }
    
    // Check if any assignment matches the focus ID
    const isOnDemand = agencyAssignments.trainingFocuses.some(
      assignment => {
        const assignmentFocusId = typeof assignment.training_focus_id === 'string' 
          ? parseInt(assignment.training_focus_id, 10) 
          : assignment.training_focus_id;
        return assignmentFocusId === focusIdNum;
      }
    );
    
    return isOnDemand;
  }
  
  // Otherwise, check all agencies (for backward compatibility)
  for (const agencyIdKey in onDemandAssignments.value) {
    const agencyAssignments = onDemandAssignments.value[agencyIdKey];
    if (agencyAssignments && agencyAssignments.trainingFocuses) {
      if (agencyAssignments.trainingFocuses.some(
        assignment => {
          const assignmentFocusId = typeof assignment.training_focus_id === 'string' 
            ? parseInt(assignment.training_focus_id, 10) 
            : assignment.training_focus_id;
          return assignmentFocusId === focusIdNum;
        }
      )) {
        return true;
      }
    }
  }
  return false;
};

const isModuleOnDemand = (moduleId, agencyId = null) => {
  // Ensure moduleId is a number for comparison
  const moduleIdNum = typeof moduleId === 'string' ? parseInt(moduleId, 10) : moduleId;
  
  // If agencyId is provided, check only that agency's assignments
  if (agencyId) {
    // Ensure agencyId is a number for consistent key lookup
    const agencyIdNum = typeof agencyId === 'string' ? parseInt(agencyId, 10) : agencyId;
    const agencyAssignments = onDemandAssignments.value[agencyIdNum];
    
    if (!agencyAssignments || !agencyAssignments.modules || agencyAssignments.modules.length === 0) {
      return false;
    }
    
    // Check if any assignment matches the module ID
    return agencyAssignments.modules.some(
      assignment => {
        const assignmentModuleId = typeof assignment.module_id === 'string' 
          ? parseInt(assignment.module_id, 10) 
          : assignment.module_id;
        return assignmentModuleId === moduleIdNum;
      }
    );
  }
  
  // Otherwise, check all agencies (for backward compatibility)
  for (const agencyIdKey in onDemandAssignments.value) {
    const agencyAssignments = onDemandAssignments.value[agencyIdKey];
    if (agencyAssignments && agencyAssignments.modules) {
      if (agencyAssignments.modules.some(
        assignment => {
          const assignmentModuleId = typeof assignment.module_id === 'string' 
            ? parseInt(assignment.module_id, 10) 
            : assignment.module_id;
          return assignmentModuleId === moduleIdNum;
        }
      )) {
        return true;
      }
    }
  }
  return false;
};

const assignTrainingFocus = (focus) => {
  trainingFocusToAssign.value = focus;
  showAssignTrainingFocusDialog.value = true;
};

const handleTrainingFocusAssigned = () => {
  showAssignTrainingFocusDialog.value = false;
  trainingFocusToAssign.value = null;
  // Optionally refresh data if needed
};

const assignTrainingFocusAsPublic = (focus) => {
  itemToAssignAsPublic.value = focus;
  publicAssignmentType.value = 'training-focus';
  showAssignPublicModal.value = true;
};

const handlePublicAssignment = () => {
  showAssignPublicModal.value = false;
  itemToAssignAsPublic.value = null;
  publicAssignmentType.value = null;
};

const handlePublicAssignmentAndRefresh = async () => {
  // Always refresh assignments - check all relevant agencies
  if (filterAgencyIdForFocus.value) {
    // Refresh the currently selected agency (hierarchy view)
    await fetchOnDemandForAgency(parseInt(filterAgencyIdForFocus.value));
  }
  
  if (filterAgencyId.value) {
    // Refresh the currently selected agency (table view)
    await fetchOnDemandForAgency(parseInt(filterAgencyId.value));
  }
  
  // Also refresh all user agencies to keep data in sync
  if (userRole.value !== 'super_admin' && agencyStore.userAgencies && agencyStore.userAgencies.length > 0) {
    await fetchOnDemandAssignments();
  }
  
  handlePublicAssignment();
};

const toggleOnDemandFilter = async () => {
  showOnDemandOnly.value = !showOnDemandOnly.value;
  
  // If enabling and agency is selected, always fetch fresh on-demand data for that agency
  if (showOnDemandOnly.value && filterAgencyIdForFocus.value) {
    const agencyId = parseInt(filterAgencyIdForFocus.value);
    // Always fetch fresh data to ensure we have the latest assignments
    await fetchOnDemandForAgency(agencyId);
  }
};

const handleAgencyFilterChange = async () => {
  // Reset on-demand filter when agency changes
  showOnDemandOnly.value = false;
  
  // Fetch on-demand assignments for the selected agency if one is selected
  if (filterAgencyIdForFocus.value) {
    await fetchOnDemandForAgency(parseInt(filterAgencyIdForFocus.value));
  }
};

const toggleTableOnDemandFilter = async () => {
  showOnDemandModulesOnly.value = !showOnDemandModulesOnly.value;
  
  // If enabling, ensure we have on-demand data
  if (showOnDemandModulesOnly.value) {
    if (filterAgencyId.value) {
      // Fetch for selected agency
      const agencyId = parseInt(filterAgencyId.value);
      await fetchOnDemandForAgency(agencyId);
    } else {
      // Fetch for all user agencies if no agency is selected
      if (userRole.value !== 'super_admin' && agencyStore.userAgencies && agencyStore.userAgencies.length > 0) {
        await fetchOnDemandAssignments();
      } else if (userRole.value === 'super_admin') {
        // For super admin, fetch for all agencies if not already fetched
        if (agencies.value.length === 0) {
          await fetchAgencies();
        }
        for (const agency of agencies.value) {
          if (!onDemandAssignments.value[agency.id]) {
            await fetchOnDemandForAgency(agency.id);
          }
        }
      }
    }
  }
};

const handleTableAgencyFilterChange = async () => {
  // Reset on-demand filter when agency changes in table view
  showOnDemandModulesOnly.value = false;
  
  // Fetch on-demand assignments for the selected agency if one is selected
  if (filterAgencyId.value) {
    await fetchOnDemandForAgency(parseInt(filterAgencyId.value));
  }
};

const handleModuleAssigned = () => {
  showAssignModal.value = false;
  moduleToAssign.value = null;
  // Optionally refresh modules list
  fetchModules();
  // Refresh modules for any expanded focuses in hierarchy view
  expandedFocuses.value.forEach(focusId => {
    if (focusModules.value[focusId]) {
      loadModulesForFocus(focusId);
    }
  });
};

const handleModuleCopied = () => {
  showCopyModal.value = false;
  moduleToCopy.value = null;
  fetchModules();
  // Refresh modules for any expanded focuses
  expandedFocuses.value.forEach(focusId => {
    if (focusModules.value[focusId]) {
      loadModulesForFocus(focusId);
    }
  });
};

const editModule = async (module) => {
  editingModule.value = module;
  moduleForm.value = {
    title: module.title,
    description: module.description || '',
    orderIndex: module.order_index,
    isActive: module.is_active,
    agencyId: module.agency_id,
    trackId: module.track_id,
    iconId: module.icon_id || null,
    onDemandAgencyId: null // Reset on-demand agency selection
  };
  
  // Fetch tracks for the agency if editing
  if (module.agency_id) {
    await agencyStore.fetchTracks(module.agency_id);
  }
  
  // Fetch on-demand assignments for all agencies to check status
  if (userRole.value !== 'super_admin' && agencyStore.userAgencies && agencyStore.userAgencies.length > 0) {
    await fetchOnDemandAssignments();
  } else if (userRole.value === 'super_admin') {
    // For super admin, fetch for all agencies
    if (agencies.value.length === 0) {
      await fetchAgencies();
    }
    for (const agency of agencies.value) {
      if (!onDemandAssignments.value[agency.id]) {
        await fetchOnDemandForAgency(agency.id);
      }
    }
  }
};

const setDropdownRef = (el, moduleId) => {
  if (el) {
    dropdownRefs.value[moduleId] = el;
  }
};

const toggleContentMenu = (moduleId, event) => {
  if (showContentMenu.value === moduleId) {
    showContentMenu.value = null;
    return;
  }
  
  showContentMenu.value = moduleId;
  
  // Calculate position after Vue updates DOM
  setTimeout(() => {
    const dropdown = dropdownRefs.value[moduleId];
    if (dropdown) {
      const menu = dropdown.querySelector('.dropdown-menu');
      if (menu) {
        const rect = menu.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        // If not enough space below but enough above, position upward
        if (spaceBelow < 100 && spaceAbove > 100) {
          dropdownPosition.value[moduleId] = 'up';
        } else {
          dropdownPosition.value[moduleId] = 'down';
        }
      }
    }
  }, 0);
};

const manageContent = (module) => {
  showContentMenu.value = null; // Close dropdown
  router.push(`/admin/modules/${module.id}/content-editor`);
};

const previewModule = (module) => {
  showContentMenu.value = null; // Close dropdown
  // Open in new tab for preview
  window.open(`/module/${module.id}?preview=true`, '_blank');
};

const toggleModuleStatus = () => {
  moduleForm.value.isActive = !moduleForm.value.isActive;
};

const saveModule = async (openContentEditor = false) => {
  try {
    saving.value = true;
    const data = {
      title: moduleForm.value.title,
      description: moduleForm.value.description,
      orderIndex: moduleForm.value.orderIndex,
      isActive: moduleForm.value.isActive,
      agencyId: moduleForm.value.agencyId,
      trackId: moduleForm.value.trackId || null,
      iconId: moduleForm.value.iconId || null
    };
    
    let savedModule;
    if (editingModule.value) {
      const response = await api.put(`/modules/${editingModule.value.id}`, data);
      savedModule = { id: editingModule.value.id, ...response.data };
    } else {
      const response = await api.post('/modules', data);
      savedModule = response.data;
    }
    
    // If openContentEditor is true, navigate to the new content editor BEFORE closing modal
    if (openContentEditor && savedModule) {
      closeModal();
      // Use nextTick to ensure navigation happens after modal closes
      try {
        await router.push(`/admin/modules/${savedModule.id}/content-editor`);
      } catch (err) {
        // Ignore navigation duplicate errors
        if (err.name !== 'NavigationDuplicated') {
          console.error('Navigation error:', err);
        }
      }
      return; // Exit early to prevent further execution
    }
    
    closeModal();
    fetchModules();
    // Refresh modules for any expanded focuses in hierarchy view
    expandedFocuses.value.forEach(focusId => {
      if (focusModules.value[focusId]) {
        loadModulesForFocus(focusId);
      }
    });
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to save module';
  } finally {
    saving.value = false;
  }
};

const saveModuleAndContinue = async () => {
  await saveModule(true);
};

const handleTemplateTypeChange = () => {
  if (trainingFocusForm.value.templateType === 'template') {
    trainingFocusForm.value.agencyId = null;
  }
};

const archiveModule = async (moduleId) => {
  if (!confirm('Are you sure you want to archive this module? It will be moved to the archive and can be restored or permanently deleted later.')) {
    return;
  }
  
  try {
    await api.post(`/modules/${moduleId}/archive`);
    fetchModules();
    // Refresh modules for any expanded focuses in hierarchy view
    expandedFocuses.value.forEach(focusId => {
      if (focusModules.value[focusId]) {
        loadModulesForFocus(focusId);
      }
    });
    alert('Module archived successfully');
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to archive module';
    alert(error.value);
  }
};

const getTrainingFocusIconUrl = (focus) => {
  if (!focus || !focus.icon_id) {
    return null;
  }
  
  let iconPath = focus.icon_file_path;
  
  if (!iconPath) {
    return null;
  }
  
  // Construct full URL
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  
  // Ensure iconPath doesn't start with /uploads
  let cleanPath = iconPath;
  if (cleanPath.startsWith('/uploads/')) {
    cleanPath = cleanPath.substring('/uploads/'.length);
  } else if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1);
  }
  
  return `${apiBase}/uploads/${cleanPath}`;
};

const getIconUrl = (module) => {
  if (!module || !module.icon_id) {
    return null;
  }
  
  let iconPath = module.icon_file_path;
  
  // Debug logging
  if (module.icon_id && !iconPath) {
    console.warn('Module has icon_id but no icon_file_path:', {
      module_id: module.id,
      module_title: module.title,
      icon_id: module.icon_id,
      fullModule: module
    });
  }
  
  if (!iconPath) {
    return null;
  }
  
  // Construct full URL
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const apiBase = baseURL.replace('/api', '') || 'http://localhost:3000';
  
  // Ensure iconPath doesn't start with /uploads
  let cleanPath = iconPath;
  if (cleanPath.startsWith('/uploads/')) {
    cleanPath = cleanPath.substring('/uploads/'.length);
  } else if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1);
  }
  
  const fullUrl = `${apiBase}/uploads/${cleanPath}`;
  return fullUrl;
};

const closeModal = () => {
  showCreateModal.value = false;
  editingModule.value = null;
  moduleForm.value = {
    title: '',
    description: '',
    orderIndex: 0,
    isActive: true,
    agencyId: null,
    trackId: null,
    iconId: null,
    onDemandAgencyId: null
  };
};

const isModuleOnDemandForAgency = computed(() => {
  if (!moduleForm.value.onDemandAgencyId || !editingModule.value) {
    return false;
  }
  const agencyId = parseInt(moduleForm.value.onDemandAgencyId);
  return isModuleOnDemand(editingModule.value.id, agencyId);
});

const handleModuleOnDemandAgencyChange = async () => {
  if (moduleForm.value.onDemandAgencyId && editingModule.value) {
    const agencyId = parseInt(moduleForm.value.onDemandAgencyId);
    // Fetch on-demand assignments for this agency if not already loaded
    if (!onDemandAssignments.value[agencyId]) {
      await fetchOnDemandForAgency(agencyId);
    }
  }
};

const toggleModuleOnDemandInModal = async () => {
  if (!moduleForm.value.onDemandAgencyId || !editingModule.value) {
    return;
  }
  
  const agencyId = parseInt(moduleForm.value.onDemandAgencyId);
  const moduleId = editingModule.value.id;
  const isCurrentlyOnDemand = isModuleOnDemand(moduleId, agencyId);
  
  try {
    savingOnDemandModule.value = true;
    
    if (isCurrentlyOnDemand) {
      // Remove on-demand assignment
      // Find the assignment ID
      const agencyAssignments = onDemandAssignments.value[agencyId];
      if (agencyAssignments && agencyAssignments.modules) {
        const assignment = agencyAssignments.modules.find(a => {
          const assignmentModuleId = typeof a.module_id === 'string' ? parseInt(a.module_id, 10) : a.module_id;
          return assignmentModuleId === moduleId;
        });
        
        if (assignment) {
          await api.delete(`/agency-on-demand-training/module/${assignment.id}?agencyId=${agencyId}`);
        }
      }
    } else {
      // Assign as on-demand
      await api.post('/agency-on-demand-training/module', {
        agencyId: agencyId,
        moduleId: moduleId
      });
    }
    
    // Refresh assignments for this agency
    await fetchOnDemandForAgency(agencyId);
    
    // Also refresh for table view if that agency is selected
    if (filterAgencyId.value && parseInt(filterAgencyId.value) === agencyId) {
      await fetchOnDemandForAgency(agencyId);
    }
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update on-demand assignment');
  } finally {
    savingOnDemandModule.value = false;
  }
};

const closeContentModal = () => {
  showContentModal.value = false;
  currentModule.value = null;
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString();
};

const fetchAgencies = async () => {
  try {
    const response = await api.get('/agencies');
    agencies.value = response.data;
  } catch (err) {
    console.error('Failed to load agencies:', err);
  }
};

const fetchTrainingFocuses = async () => {
  try {
    const response = await api.get('/training-focuses');
    trainingFocuses.value = response.data;
  } catch (err) {
    console.error('Failed to load training focuses:', err);
  }
};

const trainingFocusChecklistItems = ref([]);
const availableChecklistItemsForTrainingFocus = ref([]);
const selectedChecklistItemForTrainingFocus = ref(null);

const fetchTrainingFocusChecklistItems = async (trainingFocusId) => {
  try {
    // Refresh checklist items list first
    await fetchAllChecklistItems();
    
    // Filter items nested under this training focus (not under specific modules)
    trainingFocusChecklistItems.value = allChecklistItems.value.filter(item => 
      item.training_focus_id === trainingFocusId && !item.module_id
    );
    // Available items are those not nested under any training focus/module (standalone items)
    // These can be linked to this training focus
    availableChecklistItemsForTrainingFocus.value = allChecklistItems.value.filter(item => 
      !item.training_focus_id && !item.module_id // Only standalone items
    );
  } catch (err) {
    console.error('Failed to load checklist items:', err);
    trainingFocusChecklistItems.value = [];
    availableChecklistItemsForTrainingFocus.value = [];
  }
};

const addChecklistItemToTrainingFocus = async () => {
  if (!selectedChecklistItemForTrainingFocus.value || !editingTrainingFocus.value) return;
  
  try {
    // Get the current item to preserve other fields
    const itemResponse = await api.get(`/custom-checklist-items/${selectedChecklistItemForTrainingFocus.value}`);
    const currentItem = itemResponse.data;
    
    await api.put(`/custom-checklist-items/${selectedChecklistItemForTrainingFocus.value}`, {
      itemKey: currentItem.item_key,
      itemLabel: currentItem.item_label,
      description: currentItem.description,
      isPlatformTemplate: currentItem.is_platform_template,
      agencyId: currentItem.agency_id,
      trainingFocusId: editingTrainingFocus.value.id,
      moduleId: null,
      orderIndex: currentItem.order_index,
      autoAssign: currentItem.auto_assign
    });
    await fetchTrainingFocusChecklistItems(editingTrainingFocus.value.id);
    // Refresh checklist items for the focus view if it's expanded
    if (expandedFocuses.value.includes(editingTrainingFocus.value.id)) {
      await fetchChecklistItemsForFocus(editingTrainingFocus.value.id);
    }
    selectedChecklistItemForTrainingFocus.value = null;
  } catch (err) {
    trainingFocusError.value = err.response?.data?.error?.message || 'Failed to add checklist item';
  }
};

const removeChecklistItemFromTrainingFocus = async (itemId) => {
  if (!editingTrainingFocus.value) return;
  
  try {
    // Get the current item to preserve other fields
    const itemResponse = await api.get(`/custom-checklist-items/${itemId}`);
    const currentItem = itemResponse.data;
    
    await api.put(`/custom-checklist-items/${itemId}`, {
      itemKey: currentItem.item_key,
      itemLabel: currentItem.item_label,
      description: currentItem.description,
      isPlatformTemplate: currentItem.is_platform_template,
      agencyId: currentItem.agency_id,
      trainingFocusId: null,
      moduleId: null,
      orderIndex: currentItem.order_index,
      autoAssign: currentItem.auto_assign
    });
    await fetchTrainingFocusChecklistItems(editingTrainingFocus.value.id);
    // Refresh checklist items for the focus view if it's expanded
    if (expandedFocuses.value.includes(editingTrainingFocus.value.id)) {
      await fetchChecklistItemsForFocus(editingTrainingFocus.value.id);
    }
  } catch (err) {
    trainingFocusError.value = err.response?.data?.error?.message || 'Failed to remove checklist item';
  }
};

const editTrainingFocus = async (focus) => {
  editingTrainingFocus.value = focus;
  trainingFocusForm.value = {
    name: focus.name,
    description: focus.description || '',
    agencyId: focus.agency_id || null,
    templateType: focus.is_template ? 'template' : 'agency',
    orderIndex: focus.order_index || 0,
    isActive: focus.is_active !== false && focus.is_active !== 0,
    iconId: focus.icon_id || null,
    onDemandAgencyId: null // Reset on-demand agency selection
  };
  showEditTrainingFocusModal.value = true;
  
  // Fetch checklist items for this training focus
  await fetchTrainingFocusChecklistItems(focus.id);
  
  // Fetch on-demand assignments for all agencies to check status
  if (userRole.value !== 'super_admin' && agencyStore.userAgencies && agencyStore.userAgencies.length > 0) {
    await fetchOnDemandAssignments();
  } else if (userRole.value === 'super_admin') {
    // For super admin, fetch for all agencies
    if (agencies.value.length === 0) {
      await fetchAgencies();
    }
    for (const agency of agencies.value) {
      if (!onDemandAssignments.value[agency.id]) {
        await fetchOnDemandForAgency(agency.id);
      }
    }
  }
};

const closeTrainingFocusModal = () => {
  showCreateTrainingFocusModal.value = false;
  showEditTrainingFocusModal.value = false;
  editingTrainingFocus.value = null;
  trainingFocusForm.value = {
    name: '',
    description: '',
    agencyId: null,
    templateType: 'template',
    orderIndex: 0,
    isActive: true,
    iconId: null,
    onDemandAgencyId: null,
    linkedModuleId: null
  };
  trainingFocusError.value = '';
};

const createModuleForTrainingFocus = async () => {
  // If we're creating a new training focus, save it first
  if (!editingTrainingFocus.value && showCreateTrainingFocusModal.value) {
    // Save the training focus first
    try {
      savingTrainingFocus.value = true;
      const isTemplate = userRole.value === 'super_admin' && trainingFocusForm.value.templateType === 'template';
      const data = {
        name: trainingFocusForm.value.name.trim(),
        description: trainingFocusForm.value.description?.trim() || null,
        orderIndex: trainingFocusForm.value.orderIndex || 0,
        assignmentLevel: trainingFocusForm.value.agencyId ? 'agency' : 'platform',
        isActive: trainingFocusForm.value.isActive !== false,
        isTemplate: isTemplate,
        iconId: trainingFocusForm.value.iconId || null
      };
      
      if (trainingFocusForm.value.agencyId && !isTemplate) {
        const agencyId = parseInt(trainingFocusForm.value.agencyId);
        if (!isNaN(agencyId) && agencyId > 0) {
          data.agencyId = agencyId;
        }
      } else {
        data.agencyId = null;
      }
      
      const response = await api.post('/training-focuses', data);
      editingTrainingFocus.value = response.data;
      await fetchTrainingFocuses();
    } catch (err) {
      alert('Failed to create training focus. Please try again.');
      savingTrainingFocus.value = false;
      return;
    } finally {
      savingTrainingFocus.value = false;
    }
  }
  
  // Now open module creation modal with the training focus pre-selected
  if (editingTrainingFocus.value) {
    closeTrainingFocusModal();
    moduleForm.value.trackId = editingTrainingFocus.value.id;
    showCreateModal.value = true;
  }
};

const isTrainingFocusOnDemandForAgency = computed(() => {
  if (!trainingFocusForm.value.onDemandAgencyId || !editingTrainingFocus.value) {
    return false;
  }
  const agencyId = parseInt(trainingFocusForm.value.onDemandAgencyId);
  return isTrainingFocusOnDemand(editingTrainingFocus.value.id, agencyId);
});

const handleTrainingFocusOnDemandAgencyChange = async () => {
  if (trainingFocusForm.value.onDemandAgencyId && editingTrainingFocus.value) {
    const agencyId = parseInt(trainingFocusForm.value.onDemandAgencyId);
    // Fetch on-demand assignments for this agency if not already loaded
    if (!onDemandAssignments.value[agencyId]) {
      await fetchOnDemandForAgency(agencyId);
    }
  }
};

const toggleTrainingFocusOnDemandInModal = async () => {
  if (!trainingFocusForm.value.onDemandAgencyId || !editingTrainingFocus.value) {
    return;
  }
  
  const agencyId = parseInt(trainingFocusForm.value.onDemandAgencyId);
  const focusId = editingTrainingFocus.value.id;
  const isCurrentlyOnDemand = isTrainingFocusOnDemand(focusId, agencyId);
  
  try {
    savingOnDemandTrainingFocus.value = true;
    
    if (isCurrentlyOnDemand) {
      // Remove on-demand assignment
      // Find the assignment ID
      const agencyAssignments = onDemandAssignments.value[agencyId];
      if (agencyAssignments && agencyAssignments.trainingFocuses) {
        const assignment = agencyAssignments.trainingFocuses.find(a => {
          const assignmentFocusId = typeof a.training_focus_id === 'string' ? parseInt(a.training_focus_id, 10) : a.training_focus_id;
          return assignmentFocusId === focusId;
        });
        
        if (assignment) {
          await api.delete(`/agency-on-demand-training/training-focus/${assignment.id}?agencyId=${agencyId}`);
        }
      }
    } else {
      // Assign as on-demand
      await api.post('/agency-on-demand-training/training-focus', {
        agencyId: agencyId,
        trainingFocusId: focusId
      });
    }
    
    // Refresh assignments for this agency
    await fetchOnDemandForAgency(agencyId);
    
    // Also refresh for hierarchy view if that agency is selected
    if (filterAgencyIdForFocus.value && parseInt(filterAgencyIdForFocus.value) === agencyId) {
      await fetchOnDemandForAgency(agencyId);
    }
  } catch (err) {
    alert(err.response?.data?.error?.message || 'Failed to update on-demand assignment');
  } finally {
    savingOnDemandTrainingFocus.value = false;
  }
};

const saveTrainingFocus = async () => {
  try {
    savingTrainingFocus.value = true;
    trainingFocusError.value = '';
    
    // Determine if this is a template (Super Admin only)
    const isTemplate = userRole.value === 'super_admin' && trainingFocusForm.value.templateType === 'template';
    
    // Prepare data, ensuring agencyId is either null or a valid integer
    const data = {
      name: trainingFocusForm.value.name.trim(),
      description: trainingFocusForm.value.description?.trim() || null,
      orderIndex: trainingFocusForm.value.orderIndex || 0,
      assignmentLevel: trainingFocusForm.value.agencyId ? 'agency' : 'platform',
      isActive: trainingFocusForm.value.isActive !== false,
      isTemplate: isTemplate, // Mark as template if Super Admin creating platform template
      iconId: trainingFocusForm.value.iconId || null
    };
    
    // Only include agencyId if it's a valid number (not for templates)
    if (trainingFocusForm.value.agencyId && !isTemplate) {
      const agencyId = parseInt(trainingFocusForm.value.agencyId);
      if (!isNaN(agencyId) && agencyId > 0) {
        data.agencyId = agencyId;
      }
    } else {
      data.agencyId = null; // Explicitly set to null for templates
    }
    
    let savedFocus;
    if (editingTrainingFocus.value) {
      // Update existing training focus
      const response = await api.put(`/training-focuses/${editingTrainingFocus.value.id}`, data);
      savedFocus = { id: editingTrainingFocus.value.id, ...response.data };
    } else {
      // Create new training focus
      const response = await api.post('/training-focuses', data);
      savedFocus = response.data;
    }
    
    // If a module was selected to link, update it
    if (trainingFocusForm.value.linkedModuleId && savedFocus) {
      try {
        const moduleId = parseInt(trainingFocusForm.value.linkedModuleId);
        await api.put(`/modules/${moduleId}`, {
          trackId: savedFocus.id
        });
      } catch (err) {
        console.error('Failed to link module to training focus:', err);
        // Don't fail the whole operation, just log the error
      }
    }
    
    // Reset form and close modal
    closeTrainingFocusModal();
    
    // Refresh training focuses list
    await fetchTrainingFocuses();
    // Refresh modules to show updated links
    await fetchModules();
  } catch (err) {
    console.error('Error creating training focus:', err);
    if (err.response?.data?.error) {
      if (err.response.data.error.errors && Array.isArray(err.response.data.error.errors)) {
        // Show validation errors
        const errorMessages = err.response.data.error.errors.map(e => e.msg || e.message).join(', ');
        trainingFocusError.value = `Validation failed: ${errorMessages}`;
      } else {
        trainingFocusError.value = err.response.data.error.message || 'Failed to create training focus';
      }
    } else {
      trainingFocusError.value = err.message || 'Failed to create training focus';
    }
  } finally {
    savingTrainingFocus.value = false;
  }
};

// Watch for agency filter changes
watch(filterAgencyIdForFocus, async (newAgencyId, oldAgencyId) => {
  if (newAgencyId !== oldAgencyId) {
    await handleAgencyFilterChange();
  }
});

// Close dropdown when clicking outside
const handleClickOutside = (event) => {
  if (!event.target.closest('.content-dropdown')) {
    showContentMenu.value = null;
  }
};

onMounted(async () => {
  try {
    await agencyStore.fetchAgencies(user.value?.id);
    if (userRole.value !== 'super_admin') {
      await agencyStore.fetchUserAgencies();
    }
    await fetchAgencies();
    await fetchTrainingFocuses();
    await fetchAllChecklistItems(); // Load all checklist items for lookup
    fetchModules();
    // Only fetch on-demand assignments if user has agencies
    if (userRole.value !== 'super_admin' && agencyStore.userAgencies && agencyStore.userAgencies.length > 0) {
      await fetchOnDemandAssignments();
    } else if (userRole.value === 'super_admin') {
      // Super admins can see all, but we'll fetch on-demand assignments when they select an agency
      onDemandAssignments.value = {};
    }
    
    // Check for filter query parameter
    if (route.query.filter) {
      filterType.value = route.query.filter;
    }
    
    // Check for view query parameter
    if (route.query.view === 'table') {
      viewMode.value = 'table';
    }
    
    // Watch for route query changes
    watch(() => route.query.filter, (newFilter) => {
      if (newFilter) {
        filterType.value = newFilter;
      }
    });
    
    // Watch for view query parameter changes
    watch(() => route.query.view, (newView) => {
      if (newView === 'table') {
        viewMode.value = 'table';
      } else if (newView === 'hierarchy' || !newView) {
        viewMode.value = 'hierarchy';
      }
    });
    
    // Add click outside listener
    document.addEventListener('click', handleClickOutside);
  } catch (err) {
    console.error('Error in ModuleManager onMounted:', err);
    error.value = 'Failed to load module data';
  }
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.back-link {
  display: inline-block;
  margin-bottom: 10px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s;
}

.back-link:hover {
  color: var(--primary);
}

.page-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.header-actions {
  display: flex;
  gap: 12px;
}

.filters {
  margin-bottom: 20px;
}

.filter-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}

.status-filter {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
}

.status-filter label {
  margin: 0;
  font-weight: 500;
  white-space: nowrap;
}

.filter-select {
  padding: 10px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
  color: var(--text-primary);
  cursor: pointer;
  min-width: 200px;
}

.search-input {
  padding: 10px 16px;
  border: 2px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  background: white;
  color: var(--text-primary);
  min-width: 250px;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary);
}

.filter-select option {
  color: var(--text-primary);
  background: white;
}

.on-demand-filter-btn {
  white-space: nowrap;
  flex-shrink: 0;
  flex-grow: 0;
  min-width: auto;
  max-width: fit-content;
}

.copy-indicator {
  margin-left: 8px;
  font-size: 14px;
  opacity: 0.7;
}

.page-header h1 {
  margin: 0;
  color: var(--text-primary);
}

.modules-table {
  background: white;
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow-x: auto;
  overflow-y: visible;
  border: 1px solid var(--border);
  max-width: 100%;
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1000px; /* Ensure minimum width for all columns */
}

thead {
  background-color: var(--bg-alt);
}

th, td {
  padding: 10px 6px;
  text-align: left;
  border-bottom: 1px solid #dee2e6;
}

td.actions-cell {
  white-space: nowrap;
  width: 1%;
  padding: 8px 4px !important;
}

.action-buttons {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  align-items: center;
}

.action-buttons .btn {
  white-space: nowrap;
  flex-shrink: 0;
  width: auto;
  min-width: auto;
  padding: 6px 12px;
}

th {
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.05em;
}

.btn-sm {
  padding: 8px 14px;
  font-size: 13px;
  margin: 0;
}


.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content.large {
  max-width: 900px;
}

.modal-content h2 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #2c3e50;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

/* Training Focus Hierarchy View Styles */
.training-focus-hierarchy {
  background: white;
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow: hidden;
  border: 1px solid var(--border);
}

.focus-list {
  padding: 0;
}

.focus-item {
  border-bottom: 1px solid var(--border);
}

.focus-item:last-child {
  border-bottom: none;
}

.focus-header {
  display: flex;
  align-items: center;
  padding: 20px;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
}

.focus-header::-webkit-scrollbar {
  height: 6px;
}

.focus-header::-webkit-scrollbar-track {
  background: transparent;
}

.focus-header::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.focus-header::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.focus-header:hover {
  background-color: var(--bg-alt);
}

.focus-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: nowrap;
  flex-shrink: 0;
  min-width: 0;
}

.focus-actions .btn {
  white-space: nowrap;
  flex-shrink: 0;
  width: auto;
  min-width: auto;
  padding: 6px 12px;
}

.expand-icon {
  font-size: 14px;
  color: var(--text-secondary);
  min-width: 20px;
  text-align: center;
}

.focus-icon-left {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
  align-self: center;
}

.focus-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.focus-info h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.focus-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 0;
  font-size: 14px;
}

.module-count {
  color: var(--text-secondary);
  font-weight: 500;
}

.focus-modules {
  background-color: #f8f9fa;
  border-top: 1px solid var(--border);
  padding: 0;
}

.loading-modules,
.no-modules {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
}

.modules-list {
  padding: 0;
}

.module-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e9ecef;
  transition: background-color 0.2s;
  gap: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  min-width: 0;
}

.module-item::-webkit-scrollbar {
  height: 6px;
}

.module-item::-webkit-scrollbar-track {
  background: transparent;
}

.module-item::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.module-item::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.module-item:last-child {
  border-bottom: none;
}

.module-item:hover {
  background-color: #f1f3f5;
}

.module-info {
  flex: 1;
  min-width: 0;
}

.module-header-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: nowrap;
  margin-bottom: 8px;
}

.module-info h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}

.module-description {
  margin: 0 0 8px 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.module-icon-left {
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 4px;
}

.module-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
  flex-shrink: 0;
  white-space: nowrap;
}

.module-order {
  color: var(--text-secondary);
}

.module-actions {
  display: flex;
  gap: 6px;
  flex-wrap: nowrap;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
}

.module-actions .btn {
  white-space: nowrap;
  padding: 6px 12px;
  font-size: 12px;
  width: auto;
  min-width: auto;
  flex-shrink: 0;
}

.table-module-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.table-module-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.modules-table.filtered-on-demand tbody tr.on-demand-row {
  background-color: rgba(59, 130, 246, 0.1) !important;
}

.modules-table.filtered-on-demand tbody tr.on-demand-row:hover {
  background-color: rgba(59, 130, 246, 0.15) !important;
}

.content-dropdown {
  position: relative;
  display: inline-block;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  z-index: 1000;
  min-width: 160px;
  overflow: hidden;
}

.dropdown-menu.dropdown-up {
  top: auto;
  bottom: 100%;
  margin-top: 0;
  margin-bottom: 4px;
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #495057;
  transition: background 0.2s;
}

.dropdown-item:hover {
  background: #f8f9fa;
}

.dropdown-item:first-child {
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}

.dropdown-item:last-child {
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
}
</style>

