<template>
  <div class="tasks-hub" :class="{ 'tasks-hub--embedded': embedded }">
    <header class="tasks-hub__header">
      <h1 data-tour="tasks-title" class="tasks-hub__title">
        <span class="tasks-hub__icon" aria-hidden="true">☑</span>
        {{ headerTitle }}
      </h1>
      <div v-if="!embedded" class="tasks-hub__search">
        <input
          ref="searchInputRef"
          v-model="searchQ"
          type="search"
          class="search-input"
          placeholder="Search tasks, lists, projects…"
          @input="onSearchInput"
          @keydown.enter.prevent="applySearch"
          @keydown.escape="searchResults = []"
        />
        <kbd class="search-kbd">⌘ K</kbd>
        <ul v-if="searchResults.length" class="search-results">
          <li
            v-for="(r, idx) in searchResults"
            :key="`${r.entity_type}-${r.entity_id}-${idx}`"
            @click="selectSearchResult(r)"
          >
            <strong>{{ r.title }}</strong>
            <span class="search-meta">{{ r.subtitle }} · {{ searchViewLabel(r) }}</span>
          </li>
        </ul>
      </div>
      <div class="tasks-hub__actions">
        <router-link v-if="!embedded" class="hub-chip-btn" :to="mySchedulePath">My Schedule</router-link>
        <div class="view-toggle">
          <button type="button" class="view-btn" :class="{ active: layout === 'list' }" @click="layout = 'list'">List</button>
          <button type="button" class="view-btn" :class="{ active: layout === 'board' }" @click="layout = 'board'">Board</button>
        </div>
        <button type="button" class="hub-chip-btn hub-chip-btn--accent" @click="showNewPicker = true">New</button>
      </div>
    </header>

    <nav class="tasks-hub__tabs" aria-label="Task views">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        @click="setTab(tab.id)"
      >
        {{ tab.label }}
        <span v-if="tab.count != null" class="tab-count">({{ tab.count }})</span>
      </button>
    </nav>

    <div class="tasks-hub__body" :class="{ 'tasks-hub__body--no-timeline': hideTimelineEffective }">
      <TaskTimeline
        v-if="!hideTimelineEffective"
        ref="timelineRef"
        :agency-id="agencyId"
        :open-tasks="openTasksForTimeline"
        @select-block="onSelectBlock"
        @join-focus="openFocusSession"
        @assigned="onAssignedToBlock"
        @blocks-changed="onTimelineBlocksChanged"
      />

      <div class="tasks-hub__main">
        <template v-if="overviewProject">
          <ProjectOverviewPanel
            :project="overviewProject"
            :agency-id="effectiveTenantId"
            @close="overviewProject = null"
            @open-project="openProjectWorkspace"
            @edit="openEditProject(overviewProject)"
          />
        </template>

        <template v-else-if="activeTab === 'shared'">
          <section class="shared-section">
            <div class="shared-section__head">
              <div>
                <h2>Shared Lists</h2>
                <p class="muted">Lists you’re on. Each shows once with who it’s shared with.</p>
              </div>
            </div>
            <SharedListsView :agency-id="agencyId" @task-changed="refresh" />
          </section>
        </template>

        <template v-else-if="activeTab === 'projects'">
          <section class="shared-section">
            <div class="shared-section__head">
              <div>
                <h2>Projects</h2>
                <p class="muted">View overview in-hub, or open the full project workspace.</p>
              </div>
              <button type="button" class="btn btn-primary btn-sm" @click="pickNew('project')">+ New Project</button>
            </div>
            <ul class="project-dir">
              <li v-for="p in projects" :key="p.id">
                <div class="project-dir__info" @click="openProjectWorkspace(p.id)" style="cursor:pointer">
                  <strong class="project-dir__name">{{ p.name }}</strong>
                  <span class="muted">{{ p.list_count ?? 0 }} lists · {{ p.member_count ?? 0 }} members</span>
                </div>
                <div class="project-dir__actions">
                  <button type="button" class="btn btn-secondary btn-sm" @click="overviewProject = p">View</button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="openEditProject(p)">Edit</button>
                  <button type="button" class="btn btn-primary btn-sm" @click="openProjectWorkspace(p.id)">Open Project</button>
                </div>
              </li>
              <li v-if="!projects.length" class="muted">No projects yet</li>
            </ul>
          </section>
        </template>

        <template v-else-if="activeTab === 'action_items'">
          <div class="type-pills">
            <button type="button" class="type-pill active">Action Items</button>
            <button type="button" class="btn btn-primary btn-sm" @click="showNewActionItem = true">+ Action Item</button>
          </div>
          <div v-if="actionItemsLoading" class="hub-state">Loading action items…</div>
          <div v-else-if="!actionItems.length" class="hub-state">No action items yet</div>
          <TasksListTable
            v-else
            :tasks="actionItemsAsTasks"
            :type-defs="typeDefs"
            :current-user-id="authStore.user?.id"
            :assignable-users="agencyUsers"
            view="action_items"
            @open="openActionItem"
            @toggle-complete="toggleActionItem"
            @menu="openActionItem"
            @bulk-complete="onBulkComplete"
            @bulk-assign="onBulkAssign"
            @bulk-due-date="onBulkDueDate"
            @bulk-priority="onBulkPriority"
            @bulk-type="onBulkType"
            @bulk-status="onBulkStatus"
          />
        </template>

        <template v-else>
          <div v-if="activeTab === 'all' && canViewAll && !focusUserIdLocked" class="team-modes">
            <button type="button" :class="{ active: teamMode === 'tasks' }" @click="teamMode = 'tasks'">Tasks</button>
            <button type="button" :class="{ active: teamMode === 'lists' }" @click="setTeamMode('lists')">Shared Lists</button>
            <button type="button" :class="{ active: teamMode === 'projects' }" @click="setTeamMode('projects')">Projects</button>
          </div>

          <div v-if="activeTab === 'all' && canViewAll && !focusUserIdLocked" class="team-filters">
            <select v-model="teamFilters.tenantId" class="filter-select" @change="refresh">
              <option value="">All tenants</option>
              <option v-for="a in hideableAgencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
            </select>
            <select v-model="teamFilters.userId" class="filter-select" @change="refresh">
              <option value="">All users</option>
              <option v-for="u in agencyUsers" :key="u.id" :value="String(u.id)">
                {{ u.first_name }} {{ u.last_name }}
              </option>
            </select>
          </div>
          <p v-else-if="activeTab === 'all' && focusUserIdLocked && focusUserLabel" class="muted" style="margin: 0 0 10px;">
            Showing tasks for {{ focusUserLabel }}
          </p>

          <template v-if="activeTab === 'all' && teamMode === 'lists'">
            <div class="team-lists-browser">
              <input
                v-model="teamListSearch"
                type="search"
                class="filter-select team-lists-browser__search"
                placeholder="Search shared lists across tenants…"
                @input="onTeamListSearchInput"
              />
              <div v-if="teamListsLoading" class="hub-state">Loading shared lists…</div>
              <div v-else-if="!teamListsGrouped.length" class="hub-state">
                No shared lists found{{ teamFilters.tenantId ? ' for this tenant' : '' }}.
              </div>
              <section
                v-for="tenant in teamListsGrouped"
                :key="tenant.agencyId"
                class="tenant-group"
              >
                <button
                  type="button"
                  class="tenant-group__head"
                  @click="toggleTenantGroup(tenant.agencyId)"
                >
                  <span class="tenant-group__bar" aria-hidden="true" />
                  <span class="tenant-group__title">{{ tenant.agencyName }}</span>
                  <span class="tenant-group__count">{{ tenant.lists.length }} list{{ tenant.lists.length === 1 ? '' : 's' }}</span>
                  <span class="tenant-group__chev">{{ isTenantGroupExpanded(tenant.agencyId) ? '▼' : '▶' }}</span>
                </button>
                <div v-show="isTenantGroupExpanded(tenant.agencyId)" class="tenant-group__body">
                  <div
                    v-for="list in tenant.lists"
                    :key="list.id"
                    class="team-list-block"
                  >
                    <button
                      type="button"
                      class="team-list-block__head"
                      @click="toggleTeamList(list.id)"
                    >
                      <span class="team-list-block__name">{{ list.name }}</span>
                      <span class="team-list-block__meta">
                        {{ list.task_count || 0 }} open
                        · Shared with {{ list.shared_with_label || 'Only you' }}
                      </span>
                      <span class="team-list-block__chev">{{ isTeamListExpanded(list.id) ? '▼' : '▶' }}</span>
                    </button>
                    <div v-show="isTeamListExpanded(list.id)" class="team-list-block__tasks">
                      <div v-if="teamListTasksLoading[list.id]" class="hub-state hub-state--sm">Loading tasks…</div>
                      <TasksListTable
                        v-else-if="(teamListTasksByListId[list.id] || []).length"
                        :tasks="teamListTasksByListId[list.id]"
                        :type-defs="typeDefs"
                        :current-user-id="authStore.user?.id"
                        :timeline-keys="timelineAssignableKeys"
                        :assignable-users="agencyUsers"
                        view="all"
                        @open="openTask"
                        @toggle-complete="toggleComplete"
                        @menu="openTask"
                        @bulk-complete="onBulkComplete"
                        @bulk-assign="onBulkAssign"
                        @bulk-due-date="onBulkDueDate"
                        @bulk-priority="onBulkPriority"
                        @bulk-type="onBulkType"
                        @bulk-status="onBulkStatus"
                      />
                      <div v-else class="hub-state hub-state--sm">No open tasks in this list</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </template>

          <template v-else-if="activeTab === 'all' && teamMode === 'projects'">
            <ul class="project-dir">
              <li v-for="p in teamProjects" :key="p.id">
                <div class="project-dir__info" @click="openProjectWorkspace(p.id)" style="cursor:pointer">
                  <strong class="project-dir__name">{{ p.name }}</strong>
                  <span class="muted">{{ p.agency_name || '' }}</span>
                </div>
                <div class="project-dir__actions">
                  <button type="button" class="btn btn-secondary btn-sm" @click="overviewProject = p">View</button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="openEditProject(p)">Edit</button>
                  <button type="button" class="btn btn-primary btn-sm" @click="openProjectWorkspace(p.id)">Open Project</button>
                </div>
              </li>
              <li v-if="!teamProjects.length" class="muted">No projects for this tenant</li>
            </ul>
          </template>

          <template v-else>
            <div class="notes-scope-pills" data-tour="notes-scope">
              <button
                type="button"
                class="type-pill"
                :class="{ active: notesScope === 'all' }"
                @click="notesScope = 'all'"
              >
                All
              </button>
              <button
                type="button"
                class="type-pill"
                :class="{ active: notesScope === 'notes' }"
                @click="notesScope = 'notes'"
              >
                Notes
              </button>
              <button
                type="button"
                class="type-pill"
                :class="{ active: notesScope === 'cosign' }"
                @click="notesScope = 'cosign'"
              >
                Co-sign{{ cosignNotesCount ? ` (${cosignNotesCount})` : '' }}
              </button>
              <button
                v-if="notesScope === 'notes' || pendingSessionNoteCount > 0"
                type="button"
                class="btn btn-primary btn-sm notes-scope-open-all"
                @click="openAllPendingNotes"
              >
                Open all pending Notes
              </button>
            </div>

            <div v-if="notesScope === 'cosign'" class="cosign-panel">
              <div v-if="cosignLoading" class="hub-state">Loading notes awaiting co-sign…</div>
              <div v-else-if="!cosignNotes.length" class="hub-state">No notes awaiting your co-sign.</div>
              <ul v-else class="cosign-list">
                <li v-for="n in cosignNotes" :key="n.id" class="cosign-item">
                  <div>
                    <strong>Note #{{ n.clinical_note_id }}</strong>
                    <span class="muted">
                      {{ n.provider_first_name }} {{ n.provider_last_name }}
                      · {{ formatCosignDate(n.provider_signed_at || n.created_at) }}
                    </span>
                  </div>
                  <button type="button" class="btn btn-secondary btn-sm" @click="openCosignNote(n)">
                    Open
                  </button>
                </li>
              </ul>
            </div>

            <TasksStatusSummary v-if="notesScope !== 'cosign'" v-model="statusChip" :counts="viewStatusCounts" />
            <div v-if="notesScope !== 'cosign' && typeDefs.length" class="type-pills">
              <button
                type="button"
                class="type-pill"
                :class="{ active: !filters.workTypeId }"
                @click="filters.workTypeId = ''"
              >
                All types
              </button>
              <button
                v-for="t in typeDefs"
                :key="t.id"
                type="button"
                class="type-pill"
                :class="{ active: Number(filters.workTypeId) === Number(t.id) }"
                :style="{ '--pill-color': t.color_hex }"
                @click="filters.workTypeId = String(t.id)"
              >
                <span class="type-pill__dot" />
                {{ t.label }}
              </button>
            </div>
            <div v-if="notesScope !== 'cosign' && activeTab === 'all' && teamMode === 'tasks'" class="shared-list-pills">
              <span class="shared-list-pills__label">Shared lists</span>
              <button
                type="button"
                class="type-pill"
                :class="{ active: !teamFilters.sharedListScope && !teamFilters.taskListId }"
                @click="setSharedListScope('')"
              >
                All tasks
              </button>
              <button
                type="button"
                class="type-pill"
                :class="{ active: teamFilters.sharedListScope === 'on_list' && !teamFilters.taskListId }"
                @click="setSharedListScope('on_list')"
              >
                On a shared list
              </button>
              <button
                type="button"
                class="type-pill"
                :class="{ active: teamFilters.sharedListScope === 'off_list' }"
                @click="setSharedListScope('off_list')"
              >
                Not on a list
              </button>
              <input
                v-model="teamListFilterSearch"
                type="search"
                class="shared-list-pills__search"
                placeholder="Search lists…"
              />
              <select
                v-model="teamFilters.taskListId"
                class="shared-list-pills__select"
                @change="onTeamListFilterPick"
              >
                <option value="">Specific list…</option>
                <option v-for="l in teamListsForFilter" :key="l.id" :value="String(l.id)">
                  {{ l.name }}{{ l._agencyName ? ` · ${l._agencyName}` : '' }}
                </option>
              </select>
            </div>
            <TasksFiltersBar v-if="notesScope !== 'cosign'" v-model="filters" :departments="departments" :team-view="activeTab === 'all' && teamMode === 'tasks'" />

            <template v-if="notesScope !== 'cosign'">
            <div v-if="tasksStore.loading" class="hub-state" data-tour="tasks-loading">Loading tasks…</div>
            <div v-else-if="tasksStore.error" class="hub-state error">{{ tasksStore.error }}</div>
            <div v-else-if="displayTasks.length === 0" class="hub-state" data-tour="tasks-empty">
              <template v-if="activeTab === 'assigned'">No tasks assigned to you right now. Team-wide work is under Team Tasks.</template>
              <template v-else>No tasks found</template>
            </div>

            <TasksListTable
              v-else-if="layout === 'list'"
              :tasks="displayTasks"
              :type-defs="typeDefs"
              :current-user-id="authStore.user?.id"
              :timeline-keys="timelineAssignableKeys"
              :assignable-users="agencyUsers"
              :view="activeTab"
              data-tour="tasks-list"
              @open="openTask"
              @toggle-complete="toggleComplete"
              @menu="openTask"
              @make-dependent="onMakeDependent"
              @create-shared-list="onDragCreateSharedList"
              @bulk-complete="onBulkComplete"
              @bulk-assign="onBulkAssign"
              @bulk-due-date="onBulkDueDate"
              @bulk-priority="onBulkPriority"
              @bulk-type="onBulkType"
              @bulk-status="onBulkStatus"
              @bulk-open-notes="onBulkOpenNotes"
            />

            <div v-else class="board-view" data-tour="tasks-list">
              <div v-for="col in boardColumns" :key="col.key" class="board-col">
                <h3>{{ col.label }} <span class="tab-count">({{ col.items.length }})</span></h3>
                <article
                  v-for="task in col.items"
                  :key="task.id"
                  class="board-card"
                  draggable="true"
                  @dragstart="onBoardDrag($event, task)"
                  @click="openTask(task)"
                >
                  <strong>{{ task.title }}</strong>
                  <p v-if="!task.has_encrypted_description">{{ task.description || 'No description' }}</p>
                  <p v-else class="muted">PHI locked — open to confirm and view</p>
                </article>
              </div>
            </div>
            </template>
          </template>
        </template>
      </div>

      <TaskDetailSidePanel
        v-if="detailTask"
        :item="detailTask"
        :agency-id="effectiveTenantId"
        :type-defs="typeDefs"
        :lists="sharedListsOptions"
        :projects="projectsOptions"
        :agency-users="agencyUsers"
        @close="detailTask = null"
        @complete="onPanelComplete"
        @incomplete="onPanelIncomplete"
        @changed="onPanelChanged"
        @list-created="onInlineListCreated"
        @view-project="(id) => viewProjectById(id)"
        @open-project="openProjectWorkspace"
        @open-client-action="openClientLifecycleAction"
      />

      <div
        v-if="lifecycleChecklistClientId"
        class="modal-overlay"
        style="z-index: 10000;"
        @click.self="closeLifecycleChecklist"
      >
        <ClientOnboardingChecklistPanel
          as-modal
          :client-id="lifecycleChecklistClientId"
          :client-label="lifecycleChecklistLabel"
          :can-edit-docs="false"
          @close="closeLifecycleChecklist"
          @updated="onLifecycleChecklistUpdated"
        />
      </div>

      <LifecycleActionModal
        v-if="lifecycleModalClient && lifecycleModalKey"
        :client="lifecycleModalClient"
        :action-key="lifecycleModalKey"
        :action-label="lifecycleModalLabel"
        @close="closeLifecycleModal"
        @saved="onLifecycleActionSaved"
      />

      <AssignDayModal
        v-if="assignDayClient && assignDayOrgId"
        :organization-id="assignDayOrgId"
        :client="assignDayClient"
        client-label-mode="initials"
        @close="closeAssignDay"
        @updated="onLifecycleActionSaved"
      />
    </div>

    <div v-if="showNewPicker" class="detail-overlay" @click.self="showNewPicker = false">
      <div class="new-picker">
        <h3>What are you creating?</h3>
        <p class="muted">Pick a type to get started</p>
        <div class="new-picker__grid">
          <button type="button" class="new-picker__card" @click="pickNew('task')">
            <span class="new-picker__icon">☑</span>
            <strong>Task</strong>
            <span>Something you need to finish</span>
          </button>
          <button type="button" class="new-picker__card" @click="pickNew('action')">
            <span class="new-picker__icon">⚡</span>
            <strong>Action item</strong>
            <span>Quick follow-up from a meeting</span>
          </button>
          <button type="button" class="new-picker__card" @click="pickNew('list')">
            <span class="new-picker__icon">☰</span>
            <strong>Shared list</strong>
            <span>Collaborate with teammates</span>
          </button>
          <button type="button" class="new-picker__card" @click="pickNew('project')">
            <span class="new-picker__icon">◈</span>
            <strong>Project</strong>
            <span>Group lists and workstreams</span>
          </button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" @click="showNewPicker = false">Cancel</button>
      </div>
    </div>

    <div v-if="showNewList" class="detail-overlay" @click.self="showNewList = false">
      <div class="detail-modal detail-modal--wide">
        <button type="button" class="modal-back" @click="backToNewPicker">← Back</button>
        <h3>New shared list</h3>
        <div class="form-group">
          <label>Name</label>
          <input v-model="newListName" class="form-control" type="text" placeholder="e.g. Skill Builders" />
        </div>
        <div class="form-group">
          <label>Share with teammates</label>
          <div class="member-pick">
            <label v-for="u in shareableUsers" :key="u.id" class="check">
              <input v-model="newListMemberIds" type="checkbox" :value="u.id" />
              {{ u.first_name }} {{ u.last_name }}
            </label>
            <p v-if="!shareableUsers.length" class="muted">No other teammates found</p>
          </div>
        </div>
        <div class="form-group">
          <label>Add existing work (not on another list)</label>
          <input v-model="newItemSearch" type="search" class="form-control" placeholder="Search tasks & action items…" />
          <div class="item-pick">
            <template v-if="filteredUnattachedTasks.length">
              <p class="pick-section">Tasks</p>
              <label v-for="t in filteredUnattachedTasks" :key="`t-${t.id}`" class="check">
                <input v-model="newListTaskIds" type="checkbox" :value="t.id" />
                {{ t.title }}
              </label>
            </template>
            <template v-if="filteredUnattachedActions.length">
              <p class="pick-section">Action items</p>
              <label v-for="a in filteredUnattachedActions" :key="`a-${a.id}`" class="check">
                <input v-model="newListActionIds" type="checkbox" :value="a.id" />
                {{ a.title }}
              </label>
            </template>
            <p v-if="!filteredUnattachedTasks.length && !filteredUnattachedActions.length" class="muted">
              No unassigned tasks or action items found
            </p>
          </div>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="!newListName.trim() || creating" @click="createSharedList">
            {{ creating ? 'Creating…' : 'Create list' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showNewList = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="showNewTask" class="detail-overlay" @click.self="showNewTask = false">
      <div class="detail-modal">
        <button type="button" class="modal-back" @click="backToNewPicker">← Back</button>
        <h3>New task</h3>
        <div class="form-group">
          <label>Title</label>
          <input v-model="newTask.title" class="form-control" type="text" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea v-model="newTask.description" class="form-control" rows="3" />
        </div>
        <div class="form-group">
          <label>Due date</label>
          <input v-model="newTask.dueDate" class="form-control" type="date" />
        </div>
        <div class="form-group">
          <label>Assigned to</label>
          <select v-model="newTask.assigneeUserId" class="form-control">
            <option value="">Unassigned</option>
            <option v-for="u in assignableUsersForCreate" :key="u.id" :value="String(u.id)">
              {{ assigneeOptionLabel(u) }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>Priority</label>
          <select v-model="newTask.urgency" class="form-control">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div v-if="typeDefs.length" class="form-group">
          <label>Type</label>
          <select v-model="newTask.workTypeId" class="form-control">
            <option value="">General</option>
            <option v-for="t in typeDefs" :key="t.id" :value="String(t.id)">{{ t.label }}</option>
          </select>
        </div>
        <label class="private-toggle">
          <input v-model="newTask.isPrivate" type="checkbox" />
          Private — only you can see this
        </label>
        <div class="form-group">
          <TaskListProjectFields
            v-model:task-list-id="newTask.taskListId"
            v-model:project-id="newTask.projectId"
            :lists="sharedListsOptions"
            :projects="projectsOptions"
            :agency-id="agencyId || effectiveTenantId"
            @list-created="onInlineListCreated"
          />
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="creating || !newTask.title.trim()" @click="createTask">
            {{ creating ? '…' : 'Create' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showNewTask = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="showNewActionItem" class="detail-overlay" @click.self="showNewActionItem = false">
      <div class="detail-modal">
        <button type="button" class="modal-back" @click="backToNewPicker">← Back</button>
        <h3>New action item</h3>
        <div class="form-group">
          <label>Title</label>
          <input v-model="newActionItem.title" class="form-control" type="text" />
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea v-model="newActionItem.notes" class="form-control" rows="3" />
        </div>
        <div class="form-group">
          <label>Assigned to</label>
          <select v-model="newActionItem.assigneeUserId" class="form-control">
            <option v-for="u in assignableUsersForCreate" :key="u.id" :value="String(u.id)">
              {{ assigneeOptionLabel(u) }}
            </option>
          </select>
        </div>
        <label class="private-toggle">
          <input v-model="newActionItem.isPrivate" type="checkbox" />
          Private — only you can see this
        </label>
        <div class="form-group">
          <TaskListProjectFields
            v-model:task-list-id="newActionItem.taskListId"
            v-model:project-id="newActionItem.projectId"
            :lists="sharedListsOptions"
            :projects="projectsOptions"
            :agency-id="agencyId || effectiveTenantId"
            @list-created="onInlineListCreated"
          />
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="!newActionItem.title.trim()" @click="createActionItem">
            Create
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showNewActionItem = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="showNewProject" class="detail-overlay" @click.self="showNewProject = false">
      <div class="detail-modal detail-modal--wide">
        <button type="button" class="modal-back" @click="backToNewPicker">← Back</button>
        <h3>New project</h3>
        <div class="form-group">
          <label>Name</label>
          <input v-model="newProjectName" class="form-control" type="text" />
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <textarea v-model="newProjectDescription" class="form-control" rows="2" />
        </div>
        <div class="form-group">
          <label>Due date (optional)</label>
          <input v-model="newProjectDueDate" class="form-control" type="date" />
        </div>
        <div class="form-group">
          <label>Share with teammates</label>
          <div class="member-pick">
            <label v-for="u in shareableUsers" :key="`np-${u.id}`" class="check">
              <input v-model="newProjectMemberIds" type="checkbox" :value="u.id" />
              {{ u.first_name }} {{ u.last_name }}
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Attach shared lists</label>
          <div class="member-pick">
            <label v-for="l in sharedListsOptions" :key="`pl-${l.id}`" class="check">
              <input v-model="newProjectListIds" type="checkbox" :value="l.id" />
              {{ l.name }}
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Add existing work (not on another project)</label>
          <input v-model="newItemSearch" type="search" class="form-control" placeholder="Search…" />
          <div class="item-pick">
            <template v-if="filteredUnattachedForProject.tasks.length">
              <p class="pick-section">Tasks</p>
              <label v-for="t in filteredUnattachedForProject.tasks" :key="`pt-${t.id}`" class="check">
                <input v-model="newProjectTaskIds" type="checkbox" :value="t.id" />
                {{ t.title }}
              </label>
            </template>
            <template v-if="filteredUnattachedForProject.actions.length">
              <p class="pick-section">Action items</p>
              <label v-for="a in filteredUnattachedForProject.actions" :key="`pa-${a.id}`" class="check">
                <input v-model="newProjectActionIds" type="checkbox" :value="a.id" />
                {{ a.title }}
              </label>
            </template>
          </div>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="!newProjectName.trim() || creating" @click="createProject">
            {{ creating ? 'Creating…' : 'Create project' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showNewProject = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="showEditProject" class="detail-overlay" @click.self="showEditProject = false">
      <div class="detail-modal detail-modal--wide">
        <h3>Edit project</h3>
        <div class="form-group">
          <label>Name</label>
          <input v-model="editProjectForm.name" class="form-control" type="text" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea v-model="editProjectForm.description" class="form-control" rows="2" />
        </div>
        <div class="form-group">
          <label>Due date</label>
          <input v-model="editProjectForm.dueDate" class="form-control" type="date" />
        </div>
        <div class="form-group">
          <label>Members</label>
          <div class="member-pick">
            <label v-for="u in shareableUsers" :key="`ep-${u.id}`" class="check">
              <input v-model="editProjectForm.memberIds" type="checkbox" :value="u.id" />
              {{ u.first_name }} {{ u.last_name }}
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Shared lists</label>
          <div class="member-pick">
            <label v-for="l in sharedListsOptions" :key="`el-${l.id}`" class="check">
              <input v-model="editProjectForm.listIds" type="checkbox" :value="l.id" />
              {{ l.name }}
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Add tasks & action items</label>
          <div class="item-pick">
            <label v-for="t in filteredUnattachedForProject.tasks" :key="`et-${t.id}`" class="check">
              <input v-model="editProjectForm.taskIds" type="checkbox" :value="t.id" />
              {{ t.title }}
            </label>
            <label v-for="a in filteredUnattachedForProject.actions" :key="`ea-${a.id}`" class="check">
              <input v-model="editProjectForm.actionIds" type="checkbox" :value="a.id" />
              {{ a.title }}
            </label>
          </div>
        </div>
        <div class="detail-actions">
          <button type="button" class="btn btn-primary btn-sm" :disabled="creating" @click="saveEditProject">
            {{ creating ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" @click="showEditProject = false">Cancel</button>
        </div>
      </div>
    </div>

    <div v-if="selectedBlock" class="detail-overlay" @click.self="selectedBlock = null">
      <div class="detail-modal">
        <header class="detail-modal__head">
          <h3>{{ selectedBlock.title || 'Schedule block' }}</h3>
          <button type="button" class="btn btn-ghost btn-sm" @click="selectedBlock = null">Close</button>
        </header>
        <p class="muted">Drag tasks from the list onto the timeline, or assign from open tasks below.</p>
        <ul class="block-assign-list">
          <li v-for="a in selectedBlock.assignments || []" :key="a.id">
            <div class="block-assign-main">
              <span>{{ a.title }}</span>
              <select
                v-if="a.assignable_type === 'task'"
                class="status-mini"
                :value="a.status === 'completed' ? 'completed' : 'pending'"
                @change="changeAssignmentStatus(a, $event.target.value)"
              >
                <option value="pending">Open</option>
                <option value="completed">Completed</option>
              </select>
              <span v-else class="muted">{{ a.status || a.assignable_type }}</span>
            </div>
            <button type="button" class="btn-x" title="Remove from block" @click="removeBlockAssignment(a)">Remove</button>
          </li>
          <li v-if="!(selectedBlock.assignments || []).length" class="muted">No assignments yet — drag a task onto the block</li>
        </ul>
        <div v-if="openTasksForTimeline.length" class="assign-quick">
          <label class="field-inline">
            <span>Quick assign</span>
            <select v-model="quickAssignTaskId" class="filter-select">
              <option value="">Select a task…</option>
              <option v-for="t in openTasksForTimeline" :key="t.id" :value="String(t.id)">{{ t.title }}</option>
            </select>
          </label>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="!quickAssignTaskId"
            @click="quickAssignToBlock"
          >
            Assign
          </button>
        </div>
        <div class="detail-actions">
          <button
            v-if="selectedBlock.focus_session_enabled && (selectedBlock.assignments || []).length"
            type="button"
            class="btn btn-primary btn-sm"
            @click="openFocusSession(selectedBlock)"
          >
            Join Focus Session
          </button>
          <router-link class="hub-chip-btn" :to="mySchedulePath">Open in My Schedule</router-link>
        </div>
      </div>
    </div>

    <FocusSessionModal
      v-if="focusBlock"
      ref="focusSessionRef"
      :block="focusBlock"
      :day-blocks="focusDayBlocks"
      :agency-id="agencyId"
      @close="focusBlock = null"
      @task-changed="refresh"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTasksStore } from '../../store/tasks';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import { getParentAgencyFromOrg, isTenantOrganizationType } from '../../utils/organizationTypes';
import api from '../../services/api';
import TasksStatusSummary from './TasksStatusSummary.vue';
import TasksFiltersBar from './TasksFiltersBar.vue';
import TasksListTable from './TasksListTable.vue';
import TaskTimeline from './TaskTimeline.vue';
import SharedListsView from '../dashboard/SharedListsView.vue';
import ProjectOverviewPanel from './ProjectOverviewPanel.vue';
import FocusSessionModal from './FocusSessionModal.vue';
import TaskDetailSidePanel from './TaskDetailSidePanel.vue';
import TaskListProjectFields from './TaskListProjectFields.vue';
import ClientOnboardingChecklistPanel from '../clients/ClientOnboardingChecklistPanel.vue';
import LifecycleActionModal from '../school/LifecycleActionModal.vue';
import AssignDayModal from '../school/AssignDayModal.vue';
import { taskSchoolTag } from '../../utils/taskSchoolTag.js';
import { navigateToNoteAid } from '../../utils/noteAidLaunch.js';
import {
  stashNoteAidWorkQueue,
  taskToWorkQueueItem,
  isSessionNoteTask
} from '../../utils/noteAidSessionQueue.js';
import { appendWorkQueueToApi, saveWorkQueue } from '../../utils/noteAidWorkQueue.js';

const props = defineProps({
  /** Render inside a profile/dashboard panel instead of the full Tasks page. */
  embedded: { type: Boolean, default: false },
  /** When set, lock Team Tasks to this user (profile view). */
  focusUserId: { type: [Number, String], default: null },
  /** Optional display name for the focused user. */
  focusUserName: { type: String, default: '' },
  /** Hide the Task Timeline sidebar. */
  hideTimeline: { type: Boolean, default: false },
  /**
   * Action Items tab visibility.
   * null = admin / super_admin / support only; true/false force.
   */
  showActionItems: { type: Boolean, default: null }
});

const embedded = computed(() => !!props.embedded);
const hideTimelineEffective = computed(() => !!props.hideTimeline || embedded.value);
const focusUserIdLocked = computed(() => {
  const id = Number(props.focusUserId || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
});
const focusUserLabel = computed(() => String(props.focusUserName || '').trim());
const headerTitle = computed(() => {
  if (focusUserIdLocked.value && focusUserLabel.value) return `${focusUserLabel.value}'s Tasks`;
  return 'Tasks';
});

const route = useRoute();
const router = useRouter();
const tasksStore = useTasksStore();
const authStore = useAuthStore();
const agencyStore = useAgencyStore();

const HIDDEN_AGENCIES_KEY = 'tasksHub.hiddenAgencyIds';

const activeTab = ref('assigned');
const layout = ref('list');
const statusChip = ref('all');
const searchQ = ref('');
const notesScope = ref('all'); // all | notes | cosign
const cosignNotes = ref([]);
const cosignLoading = ref(false);
const filters = ref({
  status: '',
  urgency: '',
  due: '',
  taskType: '',
  departmentId: '',
  workTypeId: '',
  school: '',
  sort: 'due_asc'
});
const departments = ref([]);
const typeDefs = ref([]);
const detailTask = ref(null);

const lifecycleChecklistClientId = ref(null);
const lifecycleChecklistLabel = ref('');
const lifecycleModalClient = ref(null);
const lifecycleModalKey = ref('');
const lifecycleModalLabel = ref('');
const assignDayClient = ref(null);
const assignDayOrgId = ref(null);

function clientLifecycleMeta(task) {
  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const clientId = Number(meta.clientId || 0);
  if (!clientId) return null;
  const source = String(meta.source || '');
  const actionKey = String(meta.actionKey || '').trim();
  const isLifecycle = source === 'client_assignment'
    || source === 'client_lifecycle'
    || !!actionKey
    || /^New client on your caseload/i.test(String(task?.title || ''))
    || /^Fall confirmation/i.test(String(task?.title || ''));
  if (!isLifecycle) return null;
  return {
    clientId,
    actionKey: actionKey || 'provider_intake',
    actionLabel: meta.actionLabel || null,
    labelFromTitle: String(task?.title || '').split(':').slice(1).join(':').trim() || `Client #${clientId}`
  };
}

function closeLifecycleChecklist() {
  lifecycleChecklistClientId.value = null;
  lifecycleChecklistLabel.value = '';
}

function closeLifecycleModal() {
  lifecycleModalClient.value = null;
  lifecycleModalKey.value = '';
  lifecycleModalLabel.value = '';
}

function closeAssignDay() {
  assignDayClient.value = null;
  assignDayOrgId.value = null;
}

async function openClientLifecycleAction(task) {
  const info = clientLifecycleMeta(task || detailTask.value);
  if (!info) return;
  const { clientId, actionKey, actionLabel, labelFromTitle } = info;

  if (actionKey === 'provider_intake') {
    lifecycleChecklistClientId.value = clientId;
    lifecycleChecklistLabel.value = labelFromTitle;
    return;
  }

  try {
    const { data } = await api.get(`/clients/${clientId}`, { skipGlobalLoading: true });
    const client = data?.client || data;
    if (!client?.id) return;
    if (actionKey === 'assign_day') {
      assignDayClient.value = client;
      assignDayOrgId.value = Number(client.organization_id || 0) || null;
      return;
    }
    lifecycleModalClient.value = client;
    lifecycleModalKey.value = actionKey;
    lifecycleModalLabel.value = actionLabel || actionKey;
  } catch (err) {
    console.warn('[TasksHub] open client lifecycle action failed', err?.message || err);
  }
}

async function onLifecycleChecklistUpdated() {
  try {
    await api.post('/me/tasks/sync-client-lifecycle', {}, { skipGlobalLoading: true });
  } catch {
    // ignore
  }
  await refresh();
}

async function onLifecycleActionSaved() {
  closeLifecycleChecklist();
  closeLifecycleModal();
  closeAssignDay();
  try {
    await api.post('/me/tasks/sync-client-lifecycle', {}, { skipGlobalLoading: true });
  } catch {
    // ignore
  }
  await refresh();
}
const showNewPicker = ref(false);
const showNewTask = ref(false);
const showNewActionItem = ref(false);
const showNewProject = ref(false);
const showNewList = ref(false);
const showEditProject = ref(false);
const newListName = ref('');
const newListMemberIds = ref([]);
const newListTaskIds = ref([]);
const newListActionIds = ref([]);
const newProjectDescription = ref('');
const newProjectDueDate = ref('');
const newProjectMemberIds = ref([]);
const newProjectListIds = ref([]);
const newProjectTaskIds = ref([]);
const newProjectActionIds = ref([]);
const newItemSearch = ref('');
const unattachedTasks = ref([]);
const unattachedActions = ref([]);
const teamListSearch = ref('');
const editProjectForm = reactive({
  id: null,
  name: '',
  description: '',
  dueDate: '',
  memberIds: [],
  listIds: [],
  taskIds: [],
  actionIds: [],
  existingMemberIds: [],
  existingListIds: []
});
const creating = ref(false);
const timelineAssignableKeys = ref(new Set());
const quickAssignTaskId = ref('');
const newTask = reactive({
  title: '',
  description: '',
  dueDate: '',
  workTypeId: '',
  urgency: 'medium',
  assigneeUserId: '',
  isPrivate: false,
  taskListId: '',
  projectId: ''
});
const newActionItem = reactive({
  title: '',
  notes: '',
  assigneeUserId: '',
  isPrivate: false,
  taskListId: '',
  projectId: ''
});
const newProjectName = ref('');
const actionItems = ref([]);
const actionItemsLoading = ref(false);
const selectedBlock = ref(null);
const focusBlock = ref(null);
const focusDayBlocks = ref([]);
const focusSessionRef = ref(null);
const timelineRef = ref(null);
const searchInputRef = ref(null);
const showHideAgencies = ref(false);
const hiddenAgencyIds = ref(loadHiddenAgencies());
const teamMode = ref('tasks');
const teamFilters = reactive({ tenantId: '', userId: '', taskListId: '', sharedListScope: '' });
const teamListFilterSearch = ref('');
const teamLists = ref([]);
const teamListsGrouped = ref([]);
const teamListsLoading = ref(false);
const teamListTasksByListId = ref({});
const teamListTasksLoading = ref({});
const expandedTenantGroups = ref({});
const expandedTeamLists = ref({});
const projects = ref([]);
const teamProjects = ref([]);
const sharedListsOptions = ref([]);
const agencyUsers = ref([]);
const overviewProject = ref(null);
const searchResults = ref([]);
let searchTimer = null;

function loadHiddenAgencies() {
  try {
    const raw = localStorage.getItem(HIDDEN_AGENCIES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((n) => Number(n)).filter((n) => n > 0) : [];
  } catch {
    return [];
  }
}

function persistHiddenAgencies() {
  try {
    localStorage.setItem(HIDDEN_AGENCIES_KEY, JSON.stringify(hiddenAgencyIds.value));
  } catch { /* ignore */ }
}

const role = computed(() => String(authStore.user?.role || '').toLowerCase());
const canViewAll = computed(() =>
  ['admin', 'super_admin', 'support', 'supervisor'].includes(role.value)
  || !!authStore.user?.capabilities?.canManageHiring
);
/** Action Items are for backoffice only — not providers/supervisors/etc. */
const canSeeActionItems = computed(() => {
  if (props.showActionItems === false) return false;
  if (props.showActionItems === true) return true;
  return ['admin', 'super_admin', 'support'].includes(role.value);
});

const agencyId = computed(() => {
  const org = agencyStore.currentAgency?.value ?? agencyStore.currentAgency ?? null;
  if (org?.id) {
    if (!isTenantOrganizationType(org)) {
      const parent = getParentAgencyFromOrg(org, agencyStore.userAgencies || []);
      if (parent?.id) return Number(parent.id);
    }
    return Number(org.id);
  }
  const u = authStore.user || {};
  return (
    u.agency_id
    || u.primary_agency_id
    || u.agencies?.[0]?.id
    || u.agencies?.[0]?.agency_id
    || null
  );
});

const orgPrefix = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? `/${slug}` : '';
});

const mySchedulePath = computed(() => `${orgPrefix.value}/my-schedule`);
const escalationsPath = computed(() => `${orgPrefix.value}/admin/escalations`);

const hideableAgencies = computed(() => {
  const agencies = agencyStore.userAgencies || authStore.user?.agencies || [];
  return (Array.isArray(agencies) ? agencies : []).map((a) => ({
    id: Number(a.id || a.agency_id),
    name: a.name || a.agency_name
  })).filter((a) => a.id > 0);
});

const effectiveTenantId = computed(() => {
  if (teamFilters.tenantId) return Number(teamFilters.tenantId);
  return agencyId.value ? Number(agencyId.value) : null;
});


const filteredTeamLists = computed(() => teamLists.value);

const teamListsForFilter = computed(() => {
  const q = teamListFilterSearch.value.trim().toLowerCase();
  let list = teamLists.value || [];
  if (q) {
    list = list.filter((l) => {
      const name = String(l.name || '').toLowerCase();
      const agency = String(l._agencyName || '').toLowerCase();
      return name.includes(q) || agency.includes(q);
    });
  }
  return list;
});

function teamSharedListQuery() {
  if (teamFilters.taskListId) {
    return { taskListId: teamFilters.taskListId, onSharedList: undefined };
  }
  if (teamFilters.sharedListScope === 'on_list') {
    return { taskListId: undefined, onSharedList: '1' };
  }
  if (teamFilters.sharedListScope === 'off_list') {
    return { taskListId: undefined, onSharedList: '0' };
  }
  return { taskListId: undefined, onSharedList: undefined };
}

function setSharedListScope(scope) {
  teamFilters.sharedListScope = scope || '';
  teamFilters.taskListId = '';
  refresh();
}

function onTeamListFilterPick() {
  if (teamFilters.taskListId) teamFilters.sharedListScope = '';
  refresh();
}

const shareableUsers = computed(() => {
  const me = Number(authStore.user?.id);
  return (agencyUsers.value || []).filter((u) => Number(u.id) !== me);
});

const assignableUsersForCreate = computed(() => {
  const me = authStore.user;
  const meId = Number(me?.id || 0);
  const meRow = meId
    ? [{
      id: meId,
      first_name: me.preferredName || me.preferred_name || me.firstName || me.first_name || 'Me',
      last_name: me.lastName || me.last_name || ''
    }]
    : [];
  const seen = new Set(meRow.map((u) => Number(u.id)));
  const others = (agencyUsers.value || []).filter((u) => {
    const id = Number(u.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return [...meRow, ...others];
});

function assigneeOptionLabel(user) {
  const meId = Number(authStore.user?.id || 0);
  if (Number(user?.id) === meId) return 'Me';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || `User ${user.id}`;
}

const filteredUnattachedTasks = computed(() => {
  const q = newItemSearch.value.trim().toLowerCase();
  let list = unattachedTasks.value || [];
  if (q) list = list.filter((t) => String(t.title || '').toLowerCase().includes(q));
  return list.slice(0, 20);
});

const filteredUnattachedActions = computed(() => {
  const q = newItemSearch.value.trim().toLowerCase();
  let list = unattachedActions.value || [];
  if (q) list = list.filter((a) => String(a.title || '').toLowerCase().includes(q));
  return list.slice(0, 20);
});

const filteredUnattachedForProject = computed(() => ({
  tasks: filteredUnattachedTasks.value,
  actions: filteredUnattachedActions.value
}));

const projectsOptions = computed(() => {
  const map = new Map();
  for (const p of [...projects.value, ...teamProjects.value]) map.set(p.id, p);
  return [...map.values()];
});

const tabs = computed(() => {
  const c = tasksStore.taskCounts || {};
  // Profile embed: only this user's task list (+ action items for backoffice).
  if (focusUserIdLocked.value) {
    return [
      { id: 'all', label: 'Tasks', count: c.all },
      canSeeActionItems.value
        ? { id: 'action_items', label: 'Action Items', count: c.action_items ?? null }
        : null
    ].filter(Boolean);
  }
  const list = [
    { id: 'assigned', label: 'Assigned to Me', count: c.assigned },
    { id: 'mine', label: 'My Tasks', count: c.mine },
    canSeeActionItems.value
      ? { id: 'action_items', label: 'Action Items', count: c.action_items ?? null }
      : null,
    { id: 'shared', label: 'Shared Lists', count: c.shared_lists ?? null },
    { id: 'projects', label: 'Projects', count: c.projects ?? null },
    { id: 'watchlist', label: 'Watchlist', count: c.watchlist },
    canViewAll.value ? { id: 'all', label: 'Team Tasks', count: c.all } : null
  ];
  return list.filter(Boolean);
});

/** Status chips reflect the currently loaded tab’s tasks (not personal totals while viewing Team). */
const viewStatusCounts = computed(() => {
  const list = tasksStore.tasks || [];
  const isOpen = (t) => t.status !== 'completed' && t.status !== 'overridden';
  const now = Date.now();
  return {
    open: list.filter(isOpen).length,
    pending: list.filter((t) => t.status === 'pending').length,
    in_progress: list.filter((t) => t.status === 'in_progress').length,
    completed: list.filter((t) => t.status === 'completed').length,
    overdue: list.filter(
      (t) => isOpen(t) && t.due_date && new Date(t.due_date).getTime() < now
    ).length
  };
});

const actionItemsAsTasks = computed(() =>
  (actionItems.value || []).map((a) => ({
    id: a.id,
    title: a.title,
    description: a.notes,
    notes: a.notes,
    status: a.status === 'completed' ? 'completed' : (a.status || 'pending'),
    task_type: 'meeting_action',
    urgency: 'medium',
    due_date: null,
    assignee_first_name: a.assignee_first_name,
    assignee_last_name: a.assignee_last_name,
    assigned_to_user_id: a.assignee_user_id,
    meeting_event_id: a.meeting_event_id,
    meeting_title: a.meeting_title,
    linked_schedule_event_id: a.meeting_event_id,
    task_list_id: a.task_list_id,
    task_list_name: a.task_list_name,
    project_id: a.project_id,
    project_name: a.project_name,
    is_private: a.is_private ? 1 : 0,
    created_at: a.created_at,
    updated_at: a.updated_at,
    _isActionItem: true,
    _assignableType: 'action_item',
    _assignableId: a.id
  }))
);

const displayTasks = computed(() => {
  let list = [...(tasksStore.tasks || [])];
  if (notesScope.value === 'notes') {
    list = list.filter((t) => String(t.task_type || '').toLowerCase() === 'session_note');
  }
  if (filters.value.workTypeId) {
    list = list.filter((t) => Number(t.work_type_id) === Number(filters.value.workTypeId));
  }
  const schoolNeedle = String(filters.value.school || '').trim().toLowerCase();
  if (schoolNeedle) {
    list = list.filter((t) => taskSchoolTag(t).toLowerCase().includes(schoolNeedle));
  }
  if (statusChip.value === 'overdue') {
    const now = Date.now();
    list = list.filter(
      (t) =>
        t.status !== 'completed'
        && t.status !== 'overridden'
        && t.due_date
        && new Date(t.due_date).getTime() < now
    );
  } else if (statusChip.value && statusChip.value !== 'all') {
    list = list.filter((t) => t.status === statusChip.value);
  }
  if (filters.value.sort === 'urgency') {
    const rank = { high: 1, medium: 2, low: 3 };
    list.sort((a, b) => (rank[a.urgency] || 2) - (rank[b.urgency] || 2));
  } else if (filters.value.sort === 'created') {
    list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  } else if (filters.value.sort === 'shared_list') {
    list.sort((a, b) => {
      const an = String(a.task_list_name || '').trim();
      const bn = String(b.task_list_name || '').trim();
      if (an && !bn) return -1;
      if (!an && bn) return 1;
      const listCmp = an.localeCompare(bn);
      if (listCmp !== 0) return listCmp;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
  } else if (filters.value.sort === 'school') {
    list.sort((a, b) => {
      const an = taskSchoolTag(a);
      const bn = taskSchoolTag(b);
      if (an && !bn) return -1;
      if (!an && bn) return 1;
      const cmp = an.localeCompare(bn);
      if (cmp !== 0) return cmp;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
  } else {
    list.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
  }
  return list;
});

const pendingSessionNoteCount = computed(() =>
  (tasksStore.tasks || []).filter(
    (t) =>
      String(t.task_type || '').toLowerCase() === 'session_note'
      && t.status !== 'completed'
      && t.status !== 'overridden'
  ).length
);

const cosignNotesCount = computed(() => (cosignNotes.value || []).length);

async function loadCosignNotes() {
  cosignLoading.value = true;
  try {
    const { data } = await api.get('/me/notes-to-sign', { skipGlobalLoading: true });
    cosignNotes.value = data?.notes || [];
  } catch {
    cosignNotes.value = [];
  } finally {
    cosignLoading.value = false;
  }
}

function formatCosignDate(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function openCosignNote(n) {
  const noteId = Number(n?.clinical_note_id || 0);
  if (!noteId) return;
  navigateToNoteAid(router, { noteId, launchIntent: 'cosign' });
}

async function openNotesTasksInNoteAid(tasks) {
  const items = (tasks || [])
    .filter((t) => isSessionNoteTask(t))
    .map((t) => taskToWorkQueueItem(t));
  if (!items.length) return;
  stashNoteAidWorkQueue(items);
  saveWorkQueue(authStore.user?.id, items);
  try {
    await appendWorkQueueToApi(authStore.user?.id, items);
  } catch (e) {
    console.warn('Note Aid work queue handoff save failed:', e?.response?.data?.error?.message || e.message);
  }
  navigateToNoteAid(router, { launchIntent: 'work_queue' });
}

function onBulkOpenNotes(tasks) {
  openNotesTasksInNoteAid(tasks);
}

function openAllPendingNotes() {
  const pending = (tasksStore.tasks || []).filter(
    (t) =>
      String(t.task_type || '').toLowerCase() === 'session_note'
      && t.status !== 'completed'
      && t.status !== 'overridden'
  );
  openNotesTasksInNoteAid(pending);
}

const boardColumns = computed(() => {
  const cols = [
    { key: 'pending', label: 'Pending', items: [] },
    { key: 'in_progress', label: 'In Progress', items: [] },
    { key: 'completed', label: 'Completed', items: [] }
  ];
  for (const t of displayTasks.value) {
    const col = cols.find((c) => c.key === t.status) || cols[0];
    col.items.push(t);
  }
  return cols;
});

function typeLabel(task) {
  if (task._isActionItem) return 'Action Item';
  if (task.department_name) return task.department_name;
  const map = {
    custom: 'Custom',
    document: 'Document',
    training: 'Training',
    hiring: 'Hiring',
    escalation: 'Escalation',
    meeting_action: 'Meeting Action',
    session_note: 'Notes'
  };
  return map[task.task_type] || task.task_type || 'Task';
}

function assigneeDisplay(task) {
  const first = task.assignee_first_name || '';
  const last = task.assignee_last_name || '';
  return `${first} ${last}`.trim() || 'Unassigned';
}

function meetingPath(eventId) {
  return `${orgPrefix.value}/my-schedule?eventId=${encodeURIComponent(eventId)}`;
}

function setTab(id) {
  activeTab.value = id;
  statusChip.value = 'all';
  overviewProject.value = null;
  if (id !== 'all') teamMode.value = 'tasks';
  const query = { ...route.query };
  if (id === 'assigned') {
    delete query.tab;
    delete query.teamMode;
  } else {
    query.tab = id;
    if (id === 'all') query.teamMode = teamMode.value;
    else delete query.teamMode;
  }
  router.replace({ query });
}

function setTeamMode(mode) {
  teamMode.value = mode;
  if (mode === 'lists' || mode === 'tasks') loadTeamLists();
  if (mode === 'projects') loadTeamProjects();
}

function isTenantGroupExpanded(agencyId) {
  return expandedTenantGroups.value[agencyId] !== false;
}

function toggleTenantGroup(agencyId) {
  expandedTenantGroups.value = {
    ...expandedTenantGroups.value,
    [agencyId]: !isTenantGroupExpanded(agencyId)
  };
}

function isTeamListExpanded(listId) {
  return !!expandedTeamLists.value[listId];
}

async function toggleTeamList(listId) {
  const id = Number(listId);
  if (isTeamListExpanded(id)) {
    const next = { ...expandedTeamLists.value };
    delete next[id];
    expandedTeamLists.value = next;
    return;
  }
  expandedTeamLists.value = { ...expandedTeamLists.value, [id]: true };
  await loadTasksForTeamList(id);
}

let teamListSearchTimer = null;
function onTeamListSearchInput() {
  if (teamListSearchTimer) clearTimeout(teamListSearchTimer);
  teamListSearchTimer = setTimeout(() => loadTeamLists(), 280);
}

async function loadTasksForTeamList(listId) {
  const id = Number(listId);
  if (teamListTasksByListId.value[id]) return;
  teamListTasksLoading.value = { ...teamListTasksLoading.value, [id]: true };
  try {
    const { data } = await api.get(`/task-lists/${id}/team-tasks`, { skipGlobalLoading: true });
    teamListTasksByListId.value = {
      ...teamListTasksByListId.value,
      [id]: Array.isArray(data) ? data : []
    };
  } catch {
    teamListTasksByListId.value = { ...teamListTasksByListId.value, [id]: [] };
  } finally {
    teamListTasksLoading.value = { ...teamListTasksLoading.value, [id]: false };
  }
}

async function expandTeamListById(listId, agencyId = null) {
  if (agencyId) {
    expandedTenantGroups.value = { ...expandedTenantGroups.value, [agencyId]: true };
  } else {
    for (const g of teamListsGrouped.value) {
      if (g.lists.some((l) => Number(l.id) === Number(listId))) {
        expandedTenantGroups.value = { ...expandedTenantGroups.value, [g.agencyId]: true };
        break;
      }
    }
  }
  expandedTeamLists.value = { ...expandedTeamLists.value, [Number(listId)]: true };
  await loadTasksForTeamList(listId);
}

function toggleHiddenAgency(agencyIdVal, visible) {
  const id = Number(agencyIdVal);
  if (!id) return;
  if (visible) {
    hiddenAgencyIds.value = hiddenAgencyIds.value.filter((x) => x !== id);
  } else if (!hiddenAgencyIds.value.includes(id)) {
    hiddenAgencyIds.value = [...hiddenAgencyIds.value, id];
  }
  persistHiddenAgencies();
  refresh();
}

function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSmartSearch(), 280);
}

async function runSmartSearch() {
  const q = searchQ.value.trim();
  if (q.length < 2) {
    searchResults.value = [];
    return;
  }
  try {
    const { data } = await api.get('/tasks/search', {
      params: {
        q,
        agencyId: effectiveTenantId.value || undefined,
        tenantId: teamFilters.tenantId || undefined
      },
      skipGlobalLoading: true
    });
    searchResults.value = Array.isArray(data) ? data : [];
  } catch {
    searchResults.value = [];
  }
}

function applySearch() {
  runSmartSearch();
}

function searchViewLabel(r) {
  if (r.view === 'action_items') return 'Action Items';
  if (r.view === 'all') return r.team_mode === 'lists' ? 'Team Lists' : 'Team Tasks';
  if (r.view === 'shared') return 'Shared Lists';
  if (r.view === 'projects') return 'Projects';
  if (r.view === 'assigned') return 'Assigned to Me';
  return r.view || 'Tasks';
}

async function selectSearchResult(r) {
  searchResults.value = [];
  if (r.entity_type === 'project') {
    activeTab.value = 'projects';
    overviewProject.value = { id: r.entity_id, name: r.title };
    return;
  }
  if (r.entity_type === 'shared_list') {
    if (r.team_mode === 'lists' || r.view === 'all') {
      activeTab.value = 'all';
      teamMode.value = 'lists';
      await loadTeamLists();
      await expandTeamListById(r.entity_id);
    } else {
      activeTab.value = 'shared';
    }
    return;
  }
  if (r.entity_type === 'action_item') {
    activeTab.value = 'action_items';
    await loadActionItems();
    const item = actionItems.value.find((a) => Number(a.id) === Number(r.entity_id));
    if (item) openActionItem({ ...item, _isActionItem: true, description: item.notes });
    else if (r.action_item) openActionItem({ ...r.action_item, _isActionItem: true, description: r.action_item.notes });
    return;
  }
  // task
  const view = r.view === 'all' ? 'all' : (r.view === 'mine' ? 'mine' : 'assigned');
  activeTab.value = ['assigned', 'mine', 'all', 'watchlist'].includes(view) ? view : 'assigned';
  await refresh();
  const task = (tasksStore.tasks || []).find((t) => Number(t.id) === Number(r.entity_id)) || r.task;
  if (task) openTask(task);
}

function openProjectWorkspace(projectId, tab) {
  const path = `${orgPrefix.value}/tasks/projects/${projectId}`;
  router.push(tab ? { path, query: { tab } } : path);
}

async function viewProjectById(id) {
  let p = projectsOptions.value.find((x) => Number(x.id) === Number(id));
  if (!p) {
    try {
      const { data } = await api.get(`/task-projects/${id}`, {
        params: { agencyId: effectiveTenantId.value || undefined },
        skipGlobalLoading: true
      });
      p = data;
    } catch { /* ignore */ }
  }
  if (p) overviewProject.value = p;
}

async function loadTeamLists() {
  teamListsLoading.value = true;
  const q = teamListSearch.value.trim().toLowerCase();
  let agencies = teamFilters.tenantId
    ? hideableAgencies.value.filter((a) => String(a.id) === String(teamFilters.tenantId))
    : [...hideableAgencies.value];
  if (!agencies.length && agencyId.value) {
    const cur = agencyStore.currentAgency?.value ?? agencyStore.currentAgency;
    agencies = [{ id: Number(agencyId.value), name: cur?.name || 'Current tenant' }];
  }
  try {
    const groups = await Promise.all(
      agencies.map(async (a) => {
        try {
          const { data } = await api.get('/task-lists/team', {
            params: { agencyId: a.id },
            skipGlobalLoading: true
          });
          let lists = Array.isArray(data) ? data : [];
          if (q) {
            lists = lists.filter((l) => String(l.name || '').toLowerCase().includes(q));
          }
          return { agencyId: a.id, agencyName: a.name, lists };
        } catch {
          return { agencyId: a.id, agencyName: a.name, lists: [] };
        }
      })
    );
    teamListsGrouped.value = teamFilters.tenantId
      ? groups
      : groups.filter((g) => g.lists.length > 0);
    teamLists.value = groups.flatMap((g) =>
      g.lists.map((l) => ({ ...l, _agencyName: g.agencyName, _agencyId: g.agencyId }))
    );
    const expanded = { ...expandedTenantGroups.value };
    for (const g of teamListsGrouped.value) {
      if (expanded[g.agencyId] === undefined) expanded[g.agencyId] = true;
    }
    expandedTenantGroups.value = expanded;
  } catch {
    teamListsGrouped.value = [];
    teamLists.value = [];
  } finally {
    teamListsLoading.value = false;
  }
}

async function loadProjects() {
  try {
    const { data } = await api.get('/task-projects', {
      params: { agencyId: agencyId.value || undefined },
      skipGlobalLoading: true
    });
    projects.value = Array.isArray(data) ? data : [];
  } catch {
    projects.value = [];
  }
}

async function loadTeamProjects() {
  try {
    const { data } = await api.get('/task-projects', {
      params: { agencyId: effectiveTenantId.value || undefined, teamBrowse: 1 },
      skipGlobalLoading: true
    });
    teamProjects.value = Array.isArray(data) ? data : [];
  } catch {
    teamProjects.value = [];
  }
}

async function loadSharedListsOptions() {
  try {
    const { data } = await api.get('/task-lists', { skipGlobalLoading: true });
    sharedListsOptions.value = Array.isArray(data) ? data : [];
  } catch {
    sharedListsOptions.value = [];
  }
}

function onInlineListCreated(list) {
  if (!list?.id) return;
  const exists = sharedListsOptions.value.some((l) => Number(l.id) === Number(list.id));
  if (!exists) {
    sharedListsOptions.value = [...sharedListsOptions.value, list];
  }
  loadSharedListsOptions();
}

async function loadAgencyUsers(preferredAgencyId = null) {
  const aid = preferredAgencyId || agencyId.value || effectiveTenantId.value;
  try {
    if (aid) {
      // Specific agency context — load just that agency's users
      const { data } = await api.get(`/agencies/${aid}/users`, { skipGlobalLoading: true });
      const raw = Array.isArray(data) ? data : (data?.users || []);
      agencyUsers.value = raw.map((u) => ({
        ...u,
        first_name: u.first_name || u.firstName || '',
        last_name: u.last_name || u.lastName || '',
      }));
    } else {
      // No agency context — load teammates from all my agencies (person-centric)
      const { data: myAgencies } = await api.get('/users/me/agencies', { skipGlobalLoading: true });
      const agencyIds = (Array.isArray(myAgencies) ? myAgencies : []).map((a) => a.id).filter(Boolean);
      if (!agencyIds.length) { agencyUsers.value = []; return; }
      const allUsers = await Promise.all(
        agencyIds.map((id) =>
          api.get(`/agencies/${id}/users`, { skipGlobalLoading: true })
            .then((r) => Array.isArray(r.data) ? r.data : (r.data?.users || []))
            .catch(() => [])
        )
      );
      const seen = new Set();
      const me = authStore.user?.id;
      agencyUsers.value = allUsers.flat()
        .filter((u) => { if (seen.has(u.id) || String(u.id) === String(me)) return false; seen.add(u.id); return true; })
        .map((u) => ({ ...u, first_name: u.first_name || u.firstName || '', last_name: u.last_name || u.lastName || '' }));
    }
  } catch {
    agencyUsers.value = [];
  }
}

async function loadUnattachedItems({ forProject = false } = {}) {
  const aid = agencyId.value || effectiveTenantId.value;
  try {
    const [tasksRes, actionsRes] = await Promise.all([
      api.get('/tasks', {
        params: {
          view: 'assigned',
          agencyId: aid || undefined,
          unassignedFromList: forProject ? undefined : '1',
          unassignedFromProject: forProject ? '1' : undefined,
          limit: 100
        },
        skipGlobalLoading: true
      }),
      api.get('/task-action-items', {
        params: {
          agencyId: aid || undefined,
          unassignedFromList: forProject ? undefined : '1',
          unassignedFromProject: forProject ? '1' : undefined
        },
        skipGlobalLoading: true
      })
    ]);
    unattachedTasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    unattachedActions.value = Array.isArray(actionsRes.data) ? actionsRes.data : [];
  } catch {
    unattachedTasks.value = [];
    unattachedActions.value = [];
  }
}

function resetNewListForm() {
  newListName.value = '';
  newListMemberIds.value = [];
  newListTaskIds.value = [];
  newListActionIds.value = [];
  newItemSearch.value = '';
}

function resetNewProjectForm() {
  newProjectName.value = '';
  newProjectDescription.value = '';
  newProjectDueDate.value = '';
  newProjectMemberIds.value = [];
  newProjectListIds.value = [];
  newProjectTaskIds.value = [];
  newProjectActionIds.value = [];
  newItemSearch.value = '';
}

function backToNewPicker() {
  showNewTask.value = false;
  showNewActionItem.value = false;
  showNewList.value = false;
  showNewProject.value = false;
  showNewPicker.value = true;
}

async function openEditProject(project) {
  if (!project?.id) return;
  await Promise.all([loadAgencyUsers(), loadSharedListsOptions(), loadUnattachedItems({ forProject: true })]);
  try {
    const { data } = await api.get(`/task-projects/${project.id}`, {
      params: { agencyId: effectiveTenantId.value || undefined },
      skipGlobalLoading: true
    });
    const overview = data?.overview || {};
    editProjectForm.id = project.id;
    editProjectForm.name = data.name || project.name || '';
    editProjectForm.description = data.description || '';
    editProjectForm.dueDate = data.due_date ? String(data.due_date).slice(0, 10) : '';
    editProjectForm.existingMemberIds = (overview.members || []).map((m) => Number(m.user_id));
    editProjectForm.existingListIds = (overview.lists || []).map((l) => Number(l.id));
    editProjectForm.memberIds = [...editProjectForm.existingMemberIds];
    editProjectForm.listIds = [...editProjectForm.existingListIds];
    editProjectForm.taskIds = [];
    editProjectForm.actionIds = [];
    showEditProject.value = true;
  } catch (e) {
    console.error(e);
  }
}

async function saveEditProject() {
  if (!editProjectForm.id) return;
  creating.value = true;
  try {
    await api.put(`/task-projects/${editProjectForm.id}`, {
      name: editProjectForm.name.trim(),
      description: editProjectForm.description || null,
      dueDate: editProjectForm.dueDate || null
    }, { skipGlobalLoading: true });
    const toAddMembers = editProjectForm.memberIds.filter(
      (id) => !editProjectForm.existingMemberIds.includes(Number(id))
    );
    await Promise.all(
      toAddMembers.map((uid) =>
        api.post(`/task-projects/${editProjectForm.id}/members`, { userId: Number(uid), role: 'editor' }, { skipGlobalLoading: true })
      )
    );
    const toAddLists = editProjectForm.listIds.filter(
      (id) => !editProjectForm.existingListIds.includes(Number(id))
    );
    await Promise.all(
      toAddLists.map((lid) =>
        api.post(`/task-projects/${editProjectForm.id}/lists`, { taskListId: Number(lid) }, { skipGlobalLoading: true })
      )
    );
    await Promise.all([
      ...editProjectForm.taskIds.map((tid) =>
        api.put(`/me/tasks/${tid}`, { project_id: editProjectForm.id }, { skipGlobalLoading: true })
      ),
      ...editProjectForm.actionIds.map((aid) =>
        api.put(`/task-action-items/${aid}`, { projectId: editProjectForm.id }, { skipGlobalLoading: true })
      )
    ]);
    showEditProject.value = false;
    await loadProjects();
    if (overviewProject.value?.id === editProjectForm.id) {
      overviewProject.value = { ...overviewProject.value, name: editProjectForm.name };
    }
  } catch (e) {
    console.error(e);
  } finally {
    creating.value = false;
  }
}

async function createProject() {
  const name = newProjectName.value.trim();
  if (!name || !agencyId.value) return;
  creating.value = true;
  try {
    const { data } = await api.post('/task-projects', {
      agencyId: agencyId.value,
      name,
      description: newProjectDescription.value || null,
      dueDate: newProjectDueDate.value || null
    }, { skipGlobalLoading: true });
    const projectId = data?.id;
    if (projectId) {
      await Promise.all([
        ...newProjectMemberIds.value.map((uid) =>
          api.post(`/task-projects/${projectId}/members`, { userId: Number(uid), role: 'editor' }, { skipGlobalLoading: true })
        ),
        ...newProjectListIds.value.map((lid) =>
          api.post(`/task-projects/${projectId}/lists`, { taskListId: Number(lid) }, { skipGlobalLoading: true })
        ),
        ...newProjectTaskIds.value.map((tid) =>
          api.put(`/me/tasks/${tid}`, { project_id: projectId }, { skipGlobalLoading: true })
        ),
        ...newProjectActionIds.value.map((aid) =>
          api.put(`/task-action-items/${aid}`, { projectId }, { skipGlobalLoading: true })
        )
      ]);
    }
    resetNewProjectForm();
    showNewProject.value = false;
    await loadProjects();
    activeTab.value = 'projects';
  } catch (e) {
    console.error(e);
  } finally {
    creating.value = false;
  }
}

async function onPanelIncomplete(item) {
  if (!item || item._isActionItem) return;
  await tasksStore.incompleteTask(item.id);
  await refresh();
}

async function onPanelChanged() {
  await Promise.all([refresh(), loadSharedListsOptions()]);
}

function onPanelComplete(item) {
  if (item?._isActionItem) toggleActionItem(item);
  else toggleComplete(item);
}

const openTasksForTimeline = computed(() => {
  const assignedIds = new Set(
    (selectedBlock.value?.assignments || [])
      .filter((a) => a.assignable_type === 'task')
      .map((a) => String(a.assignable_id))
  );
  return (displayTasks.value || []).filter(
    (t) => t.status !== 'completed' && t.status !== 'overridden' && !assignedIds.has(String(t.id))
  );
});

function pickNew(kind) {
  showNewPicker.value = false;
  if (kind === 'task') {
    loadAgencyUsers();
    loadSharedListsOptions();
    showNewTask.value = true;
  } else if (kind === 'action') {
    loadAgencyUsers();
    loadSharedListsOptions();
    newActionItem.assigneeUserId = String(authStore.user?.id || '');
    showNewActionItem.value = true;
  } else if (kind === 'project') {
    resetNewProjectForm();
    loadAgencyUsers();
    loadSharedListsOptions();
    loadUnattachedItems({ forProject: true });
    showNewProject.value = true;
  } else if (kind === 'list') {
    resetNewListForm();
    loadAgencyUsers();
    loadUnattachedItems({ forProject: false });
    showNewList.value = true;
  }
}

async function createSharedList() {
  const name = newListName.value.trim();
  if (!name) return;
  // agencyId is now optional — lists can be person-scoped without a tenant
  const aid = agencyId.value || effectiveTenantId.value || null;
  creating.value = true;
  try {
    const payload = { name };
    if (aid) payload.agencyId = aid;
    const { data } = await api.post('/task-lists', payload, { skipGlobalLoading: true });
    const listId = data?.id;
    if (listId) {
      await Promise.all([
        ...newListMemberIds.value.map((uid) =>
          api.post(`/task-lists/${listId}/members`, { userId: Number(uid), role: 'editor' }, { skipGlobalLoading: true })
        ),
        ...newListTaskIds.value.map((tid) =>
          api.put(`/me/tasks/${tid}`, { task_list_id: listId }, { skipGlobalLoading: true })
        ),
        ...newListActionIds.value.map((aid2) =>
          api.put(`/task-action-items/${aid2}`, { taskListId: listId }, { skipGlobalLoading: true })
        )
      ]);
    }
    resetNewListForm();
    showNewList.value = false;
    activeTab.value = 'shared';
    await loadSharedListsOptions();
  } catch (e) {
    console.error(e);
  } finally {
    creating.value = false;
  }
}

function onTimelineBlocksChanged({ assignedIds }) {
  timelineAssignableKeys.value = assignedIds instanceof Set ? assignedIds : new Set(assignedIds || []);
}

function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
    e.preventDefault();
    searchInputRef.value?.focus?.();
  }
}

async function loadTypeDefs() {
  try {
    const { data } = await api.get('/task-types', {
      params: { agencyId: agencyId.value || undefined },
      skipGlobalLoading: true
    });
    typeDefs.value = Array.isArray(data) ? data : [];
  } catch {
    typeDefs.value = [];
  }
}

async function loadActionItems() {
  actionItemsLoading.value = true;
  try {
    const { data } = await api.get('/task-action-items', {
      params: { agencyId: agencyId.value || undefined },
      skipGlobalLoading: true
    });
    actionItems.value = Array.isArray(data) ? data : [];
  } catch {
    actionItems.value = [];
  } finally {
    actionItemsLoading.value = false;
  }
}

async function refresh() {
  const hidden = hiddenAgencyIds.value;
  const countOpts = {
    agencyId: effectiveTenantId.value || agencyId.value,
    hiddenAgencyIds: hidden,
    tenantId: teamFilters.tenantId || undefined,
    assignedToUserId: teamFilters.userId || undefined,
    taskListId: teamFilters.taskListId || undefined
  };
  if (activeTab.value === 'shared' || activeTab.value === 'projects') {
    await Promise.all([
      tasksStore.fetchTaskCounts(countOpts.agencyId, hidden),
      activeTab.value === 'projects' ? loadProjects() : Promise.resolve()
    ]);
    // extend store to accept filters later — pass via query in fetchTaskCounts below
    timelineRef.value?.refresh?.();
    return;
  }
  if (activeTab.value === 'action_items') {
    await Promise.all([loadActionItems(), tasksStore.fetchTaskCounts(countOpts.agencyId, hidden)]);
    timelineRef.value?.refresh?.();
    return;
  }
  if (activeTab.value === 'all' && teamMode.value !== 'tasks') {
    await tasksStore.fetchTaskCounts(countOpts.agencyId, hidden);
    if (teamMode.value === 'lists') await loadTeamLists();
    if (teamMode.value === 'projects') await loadTeamProjects();
    timelineRef.value?.refresh?.();
    return;
  }
  const view = activeTab.value === 'all' && canViewAll.value ? 'all' : activeTab.value;
  const sharedListQ = view === 'all' ? teamSharedListQuery() : {};
  await Promise.all([
    tasksStore.fetchTasks({
      view,
      status: filters.value.status || undefined,
      urgency: filters.value.urgency || undefined,
      due: filters.value.due || undefined,
      taskType: filters.value.taskType || undefined,
      departmentId: filters.value.departmentId || undefined,
      agencyId: effectiveTenantId.value || agencyId.value || undefined,
      hiddenAgencyIds: view === 'all' ? hidden : undefined,
      assignedToUserId: view === 'all' && teamFilters.userId ? teamFilters.userId : undefined,
      taskListId: view === 'all' && sharedListQ.taskListId ? sharedListQ.taskListId : undefined,
      onSharedList: view === 'all' ? sharedListQ.onSharedList : undefined,
      tenantId: teamFilters.tenantId || undefined
    }),
    tasksStore.fetchTaskCounts(countOpts.agencyId, hidden, {
      tenantId: teamFilters.tenantId || undefined,
      assignedToUserId: teamFilters.userId || undefined,
      taskListId: sharedListQ.taskListId || teamFilters.taskListId || undefined
    })
  ]);
  timelineRef.value?.refresh?.();
}

async function loadDepartments() {
  if (!agencyId.value) return;
  try {
    const { data } = await api.get(`/agencies/${agencyId.value}/departments`);
    departments.value = Array.isArray(data) ? data : (data?.departments || []);
  } catch {
    departments.value = [];
  }
}

function openTask(task) {
  detailTask.value = task;
  loadAgencyUsers(task?.assigned_to_agency_id || task?.agency_id);
  if (clientLifecycleMeta(task)) {
    openClientLifecycleAction(task);
  }
}

function openActionItem(task) {
  detailTask.value = task;
  loadAgencyUsers(task?.agency_id || task?.assigned_to_agency_id);
}

async function toggleComplete(task) {
  if (task.status === 'completed') {
    await tasksStore.incompleteTask(task.id);
  } else {
    await tasksStore.completeTask(task.id);
  }
  if (detailTask.value?.id === task.id) {
    detailTask.value = {
      ...detailTask.value,
      status: task.status === 'completed' ? 'pending' : 'completed'
    };
  }
  await refresh();
}

/** Called when user drags task A onto task B and picks "Make dependent" */
async function onMakeDependent({ blockerTask, waitingTask }) {
  if (!blockerTask?.id || !waitingTask?.id) return;
  try {
    await api.post(`/me/tasks/${waitingTask.id}/dependencies`, {
      dependsOnId: blockerTask.id
    }, { skipGlobalLoading: true });
    await refresh();
  } catch (e) {
    console.error('[TasksHub] onMakeDependent failed:', e);
  }
}

/** Called when user drags two tasks and picks "Create shared list" */
async function onDragCreateSharedList({ taskA, taskB }) {
  if (!taskA?.id || !taskB?.id) return;
  const listName = prompt(
    `Create a shared list with "${taskA.title}" and "${taskB.title}"?\n\nEnter a name for the new list:`
  );
  if (!listName?.trim()) return;
  try {
    const { data: list } = await api.post('/task-lists', {
      name: listName.trim(),
      agencyId: agencyId.value || undefined
    }, { skipGlobalLoading: true });
    if (list?.id) {
      await Promise.all([
        api.put(`/me/tasks/${taskA.id}`, { task_list_id: list.id }, { skipGlobalLoading: true }),
        api.put(`/me/tasks/${taskB.id}`, { task_list_id: list.id }, { skipGlobalLoading: true })
      ]);
    }
    await refresh();
  } catch (e) {
    console.error('[TasksHub] onDragCreateSharedList failed:', e);
  }
}

// ─── Bulk actions (multi-select toolbar) ──────────────────────────────────
async function onBulkComplete(tasks) {
  await Promise.all(tasks.map((t) => {
    if (t._isActionItem) return api.post(`/task-action-items/${t.id}/complete`, {}, { skipGlobalLoading: true }).catch(() => {});
    return tasksStore.completeTask(t.id).catch(() => {});
  }));
  await refresh();
  await loadActionItems();
}

async function onBulkAssign(tasks, userId) {
  await Promise.all(tasks.map((t) => {
    if (t._isActionItem) {
      return api.put(`/task-action-items/${t.id}`, { assigneeUserId: userId }, { skipGlobalLoading: true }).catch(() => {});
    }
    return api.put(`/me/tasks/${t.id}`, { assigned_to_user_id: userId }, { skipGlobalLoading: true }).catch(() => {});
  }));
  await refresh();
  await loadActionItems();
}

async function onBulkDueDate(tasks, date) {
  await Promise.all(
    tasks
      .filter((t) => !t._isActionItem)
      .map((t) => api.put(`/me/tasks/${t.id}`, { due_date: date }, { skipGlobalLoading: true }).catch(() => {}))
  );
  await refresh();
}

async function onBulkPriority(tasks, urgency) {
  await Promise.all(
    tasks
      .filter((t) => !t._isActionItem)
      .map((t) => api.put(`/me/tasks/${t.id}`, { urgency }, { skipGlobalLoading: true }).catch(() => {}))
  );
  await refresh();
}

async function onBulkType(tasks, workTypeId) {
  await Promise.all(
    tasks
      .filter((t) => !t._isActionItem)
      .map((t) => api.put(`/me/tasks/${t.id}`, { work_type_id: workTypeId }, { skipGlobalLoading: true }).catch(() => {}))
  );
  await refresh();
}

async function onBulkStatus(tasks, status) {
  await Promise.all(tasks.map((t) => {
    if (t._isActionItem) {
      if (status === 'completed') return api.post(`/task-action-items/${t.id}/complete`, {}, { skipGlobalLoading: true }).catch(() => {});
      return api.put(`/task-action-items/${t.id}`, { status }, { skipGlobalLoading: true }).catch(() => {});
    }
    if (status === 'completed') return tasksStore.completeTask(t.id).catch(() => {});
    return api.put(`/me/tasks/${t.id}`, { status }, { skipGlobalLoading: true }).catch(() => {});
  }));
  await refresh();
  await loadActionItems();
}

async function toggleActionItem(task) {
  try {
    if (task.status === 'completed') {
      await api.post(`/task-action-items/${task.id}/reopen`, {}, { skipGlobalLoading: true });
    } else {
      await api.post(`/task-action-items/${task.id}/complete`, {}, { skipGlobalLoading: true });
    }
    await loadActionItems();
    await tasksStore.fetchTaskCounts(agencyId.value);
    if (detailTask.value?.id === task.id) detailTask.value = null;
  } catch (e) {
    console.error(e);
  }
}

function goDocument(task) {
  router.push(`${orgPrefix.value}/tasks/documents/${task.id}/sign`);
}

async function createTask() {
  if (!newTask.title.trim() || creating.value) return;
  creating.value = true;
  try {
    await api.post('/me/tasks', {
      title: newTask.title.trim(),
      description: newTask.description || null,
      dueDate: newTask.dueDate || null,
      agencyId: agencyId.value || undefined,
      work_type_id: newTask.workTypeId ? Number(newTask.workTypeId) : undefined,
      assignedToUserId: newTask.assigneeUserId ? Number(newTask.assigneeUserId) : null,
      urgency: newTask.urgency || 'medium',
      isPrivate: !!newTask.isPrivate,
      task_list_id: newTask.taskListId ? Number(newTask.taskListId) : null,
      projectId: newTask.projectId ? Number(newTask.projectId) : null
    });
    showNewTask.value = false;
    newTask.title = '';
    newTask.description = '';
    newTask.dueDate = '';
    newTask.workTypeId = '';
    newTask.urgency = 'medium';
    newTask.assigneeUserId = '';
    newTask.isPrivate = false;
    newTask.taskListId = '';
    newTask.projectId = '';
    activeTab.value = 'mine';
    await Promise.all([refresh(), loadSharedListsOptions()]);
  } catch (e) {
    console.error('Failed to create task', e);
  } finally {
    creating.value = false;
  }
}

async function createActionItem() {
  if (!newActionItem.title.trim()) return;
  try {
    await api.post('/task-action-items', {
      title: newActionItem.title.trim(),
      notes: newActionItem.notes || null,
      agencyId: agencyId.value || undefined,
      assigneeUserId: newActionItem.assigneeUserId ? Number(newActionItem.assigneeUserId) : undefined,
      isPrivate: !!newActionItem.isPrivate,
      taskListId: newActionItem.taskListId ? Number(newActionItem.taskListId) : null,
      projectId: newActionItem.projectId ? Number(newActionItem.projectId) : null
    });
    showNewActionItem.value = false;
    newActionItem.title = '';
    newActionItem.notes = '';
    newActionItem.assigneeUserId = '';
    newActionItem.isPrivate = false;
    newActionItem.taskListId = '';
    newActionItem.projectId = '';
    await Promise.all([loadActionItems(), loadSharedListsOptions()]);
    await tasksStore.fetchTaskCounts(agencyId.value);
  } catch (e) {
    console.error(e);
  }
}

function onBoardDrag(ev, task) {
  try {
    ev.dataTransfer.setData('application/x-task-id', String(task.id));
    ev.dataTransfer.setData('application/x-assignable', JSON.stringify({
      assignableType: 'task',
      assignableId: task.id,
      title: task.title,
      status: task.status
    }));
  } catch { /* ignore */ }
}

async function onSelectBlock(block) {
  selectedBlock.value = block;
  quickAssignTaskId.value = '';
  // Refresh assignments so remove/status controls see latest
  try {
    const { data } = await api.get(`/schedule-block-assignments/${block.id}`, { skipGlobalLoading: true });
    if (data?.event) {
      selectedBlock.value = {
        ...data.event,
        assignments: data.assignments || [],
        title: data.event.title,
        focus_session_enabled: data.event.focus_session_enabled
      };
    }
  } catch { /* keep existing */ }
}

function onAssignedToBlock({ assignableType, assignableId } = {}) {
  const type = assignableType || 'task';
  const id = assignableId != null ? Number(assignableId) : null;
  if (id) {
    const next = new Set(timelineAssignableKeys.value);
    next.add(`${type}:${id}`);
    timelineAssignableKeys.value = next;
  }
  if (focusBlock.value) {
    focusSessionRef.value?.reloadTasks?.();
  }
}

async function removeBlockAssignment(a) {
  if (!selectedBlock.value?.id || !a?.id) return;
  try {
    await api.delete(`/schedule-block-assignments/${selectedBlock.value.id}/${a.id}`, {
      skipGlobalLoading: true
    });
    selectedBlock.value = {
      ...selectedBlock.value,
      assignments: (selectedBlock.value.assignments || []).filter((x) => x.id !== a.id)
    };
    timelineRef.value?.refresh?.();
    await refresh();
  } catch (e) {
    console.error(e);
  }
}

async function changeAssignmentStatus(a, status) {
  if (a.assignable_type !== 'task' || !a.assignable_id) return;
  try {
    if (status === 'completed') {
      await tasksStore.completeTask(a.assignable_id);
    } else {
      await tasksStore.incompleteTask(a.assignable_id);
    }
    a.status = status;
    await refresh();
    timelineRef.value?.refresh?.();
  } catch (e) {
    console.error(e);
  }
}

async function quickAssignToBlock() {
  const tid = parseInt(quickAssignTaskId.value, 10);
  if (!tid || !selectedBlock.value?.id) return;
  try {
    await api.post(`/schedule-block-assignments/${selectedBlock.value.id}`, {
      assignableType: 'task',
      assignableId: tid
    }, { skipGlobalLoading: true });
    quickAssignTaskId.value = '';
    await onSelectBlock(selectedBlock.value);
    timelineRef.value?.refresh?.();
    await refresh();
  } catch (e) {
    console.error(e);
  }
}

async function openFocusSession(block) {
  const count = Number(block?.assignment_count || (block?.assignments || []).length || 0);
  if (count < 1) {
    await onSelectBlock(block);
    return;
  }
  selectedBlock.value = null;
  const dayRef = timelineRef.value?.dayYmd;
  const day = dayRef?.value ?? dayRef ?? null;
  let blocks = [];
  if (day) {
    try {
      const { data } = await api.get('/schedule-block-assignments/day', {
        params: { day },
        skipGlobalLoading: true
      });
      blocks = Array.isArray(data) ? data : [];
    } catch {
      blocks = [];
    }
  }
  const bid = Number(block?.id);
  if (bid && !blocks.some((b) => Number(b.id) === bid)) {
    blocks = [...blocks, block];
  }
  blocks.sort((a, b) => {
    const as = new Date(a.start_at || a.startAt || 0).getTime();
    const bs = new Date(b.start_at || b.startAt || 0).getTime();
    return as - bs;
  });
  focusDayBlocks.value = blocks.length ? blocks : (block ? [block] : []);
  focusBlock.value = focusDayBlocks.value.find((b) => Number(b.id) === bid) || block;
}

watch([activeTab, filters], () => refresh(), { deep: true });
watch(notesScope, (scope) => {
  if (scope === 'cosign') loadCosignNotes();
});
watch([activeTab, () => teamMode.value], ([tab, mode]) => {
  if (tab === 'all' && mode === 'tasks') loadTeamLists();
}, { immediate: true });
watch(agencyId, () => {
  loadDepartments();
  loadTypeDefs();
  refresh();
});

onMounted(async () => {
  const qTab = String(route.query.tab || route.query.view || '').toLowerCase();
  const qUserId = String(route.query.userId || '').trim();
  const lockedUserId = focusUserIdLocked.value;
  if (lockedUserId && canViewAll.value) {
    teamFilters.userId = String(lockedUserId);
    activeTab.value = 'all';
    teamMode.value = 'tasks';
  } else if (qUserId && canViewAll.value && !embedded.value) {
    teamFilters.userId = qUserId;
    activeTab.value = 'all';
    teamMode.value = String(route.query.teamMode || 'tasks');
  } else if (['assigned', 'mine', 'shared', 'watchlist', 'action_items', 'projects'].includes(qTab)) {
    if (qTab === 'action_items' && !canSeeActionItems.value) {
      activeTab.value = 'assigned';
    } else {
      activeTab.value = qTab;
    }
  } else if (qTab === 'all' && canViewAll.value) {
    // sticky Team Tasks only when explicitly requested with teamMode, else default personal
    activeTab.value = route.query.teamMode ? 'all' : 'assigned';
    if (route.query.teamMode) teamMode.value = String(route.query.teamMode);
  } else {
    activeTab.value = 'assigned';
  }
  if (!embedded.value) {
    window.addEventListener('keydown', onKeydown);
  }
  await Promise.all([
    loadDepartments(),
    loadTypeDefs(),
    loadProjects(),
    loadSharedListsOptions(),
    loadAgencyUsers()
  ]);
  try {
    const locked = focusUserIdLocked.value;
    await api.post(
      '/me/tasks/sync-client-lifecycle',
      locked ? { userId: locked } : {},
      { skipGlobalLoading: true }
    );
  } catch {
    // best-effort title/action sync for new-client / fall tasks
  }
  await refresh();
  if (!embedded.value && route.query.blockEventId) {
    try {
      const { data } = await api.get(`/schedule-block-assignments/${route.query.blockEventId}`, {
        skipGlobalLoading: true
      });
      if (data?.event) {
        selectedBlock.value = {
          ...data.event,
          assignments: data.assignments || [],
          title: data.event.title,
          focus_session_enabled: data.event.focus_session_enabled
        };
      }
      // Drop the query so refresh/back doesn't re-open Join prematurely.
      const q = { ...route.query };
      delete q.blockEventId;
      router.replace({ query: q }).catch(() => {});
    } catch { /* ignore */ }
  }
});
onUnmounted(() => {
  if (!embedded.value) {
    window.removeEventListener('keydown', onKeydown);
  }
  if (searchTimer) clearTimeout(searchTimer);
  if (teamListSearchTimer) clearTimeout(teamListSearchTimer);
});

watch(
  () => focusUserIdLocked.value,
  (uid) => {
    if (!uid || !canViewAll.value) return;
    teamFilters.userId = String(uid);
    activeTab.value = 'all';
    teamMode.value = 'tasks';
    refresh();
  }
);
</script>

<style scoped>
.tasks-hub { width: 100%; max-width: none; margin: 0; }
.tasks-hub__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: nowrap;
}
.tasks-hub__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary, #0f172a);
  white-space: nowrap;
  flex: 0 0 auto;
}
.tasks-hub__icon { color: var(--brand-primary, #1f6b4a); }
.tasks-hub__search { position: relative; flex: 1 1 auto; min-width: 160px; max-width: 480px; }
.search-input {
  width: 100%;
  padding: 8px 52px 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 13px;
  background: #fff;
}
.search-kbd {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: #94a3b8;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  padding: 1px 5px;
  background: #f8fafc;
}
.tasks-hub__actions { display: flex; gap: 8px; align-items: center; flex: 0 0 auto; margin-left: auto; }
.hub-chip-btn {
  display: inline-flex;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: transparent;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.hub-chip-btn:hover {
  background: #f8fafc;
  color: #0f172a;
}
.hub-chip-btn--accent {
  border-color: color-mix(in srgb, var(--brand-primary, #1f6b4a) 35%, #e2e8f0);
  color: var(--brand-primary, #1f6b4a);
}
.hub-chip-btn--accent:hover {
  background: color-mix(in srgb, var(--brand-primary, #1f6b4a) 10%, #fff);
}
.view-toggle {
  display: inline-flex;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.view-btn {
  border: 0;
  background: transparent;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}
.view-btn.active {
  background: color-mix(in srgb, var(--brand-primary, #1f6b4a) 12%, #fff);
  color: var(--brand-primary, #1f6b4a);
}
.new-picker {
  background: #fff;
  border-radius: 16px;
  padding: 22px 22px 16px;
  width: min(440px, 92vw);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.14);
}
.new-picker h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #0f172a;
}
.new-picker > .muted {
  margin: 4px 0 14px;
  font-size: 13px;
}
.new-picker__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.new-picker__card {
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fafafa;
  padding: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
.new-picker__card:hover {
  border-color: #86efac;
  background: #f0fdf4;
  transform: translateY(-1px);
}
.new-picker__icon {
  font-size: 16px;
  margin-bottom: 4px;
}
.new-picker__card strong {
  font-size: 13px;
  color: #0f172a;
}
.new-picker__card span:last-child {
  font-size: 11px;
  color: #64748b;
  line-height: 1.35;
}
.block-assign-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}
.status-mini {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  max-width: 140px;
}
.assign-quick {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  margin: 10px 0;
}
.btn-x {
  border: 0;
  background: transparent;
  color: #b91c1c;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.tasks-hub__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 10px;
}
.tab-btn {
  border: 0;
  background: transparent;
  padding: 8px 2px;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab-btn.active {
  color: var(--brand-primary, #1f6b4a);
  border-bottom-color: var(--brand-primary, #1f6b4a);
}
.tab-count { font-weight: 600; color: #94a3b8; }
.tasks-hub__body {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.tasks-hub__body--no-timeline {
  display: block;
}
.tasks-hub--embedded {
  padding: 0;
  max-width: none;
}
.tasks-hub--embedded .tasks-hub__header {
  margin-bottom: 8px;
}
.tasks-hub--embedded .tasks-hub__title {
  font-size: 1.25rem;
}
.tasks-hub__main { flex: 1; min-width: 0; }
.search-results {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  z-index: 40;
  list-style: none;
  margin: 0;
  padding: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  max-height: 320px;
  overflow: auto;
}
.search-results li {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.search-results li:hover { background: #f0fdf4; }
.search-meta { font-size: 11px; color: #64748b; }
.team-modes {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.team-modes button {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  color: #64748b;
}
.team-modes button.active {
  background: #ecfdf5;
  border-color: #86efac;
  color: #14532d;
}
.team-lists-browser__search {
  width: 100%;
  margin-bottom: 12px;
}
.tenant-group {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 10px;
  overflow: hidden;
  background: #fff;
}
.tenant-group__head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  background: #f8fafc;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.tenant-group__bar {
  width: 4px;
  height: 22px;
  border-radius: 999px;
  background: #166534;
  flex-shrink: 0;
}
.tenant-group__title {
  font-weight: 800;
  color: #0f172a;
  font-size: 14px;
}
.tenant-group__count {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  background: #e2e8f0;
  border-radius: 999px;
  padding: 2px 8px;
}
.tenant-group__chev {
  margin-left: auto;
  color: #94a3b8;
  font-size: 11px;
}
.tenant-group__body {
  border-top: 1px solid #f1f5f9;
}
.team-list-block__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px 10px 22px;
  border: 0;
  border-bottom: 1px solid #f8fafc;
  background: #fff;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.team-list-block__head:hover { background: #f8fafc; }
.team-list-block__name {
  font-weight: 700;
  color: #0f172a;
  font-size: 13px;
}
.team-list-block__meta {
  font-size: 11px;
  color: #64748b;
  flex: 1;
  min-width: 160px;
}
.team-list-block__chev {
  color: #94a3b8;
  font-size: 10px;
}
.team-list-block__tasks {
  padding: 0 8px 8px 16px;
  background: #fafafa;
}
.hub-state--sm {
  padding: 12px;
  font-size: 12px;
}
.team-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.filter-select {
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  background: #fff;
}
.field-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
}
.project-dir {
  list-style: none;
  margin: 0;
  padding: 0;
}
.project-dir li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}
.project-dir__actions { display: flex; gap: 6px; }
.project-dir__info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.project-dir__name { color: #0f172a; transition: color 0.12s; }
.project-dir__info:hover .project-dir__name { color: #15803d; text-decoration: underline; }
.notes-scope-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.notes-scope-open-all {
  margin-left: auto;
}
.cosign-panel {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 12px;
  margin-bottom: 12px;
}
.cosign-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cosign-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}
.cosign-item .muted {
  display: block;
  font-size: 0.82rem;
  color: #64748b;
  margin-top: 2px;
}
.type-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
  align-items: center;
}
.type-pill {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.type-pill.active {
  border-color: var(--pill-color, #166534);
  color: var(--pill-color, #166534);
  background: color-mix(in srgb, var(--pill-color, #166534) 12%, #fff);
}
.type-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pill-color, #64748b);
}
.shared-list-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.shared-list-pills__label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin-right: 4px;
}
.shared-list-pills__search {
  flex: 1;
  min-width: 120px;
  max-width: 200px;
  padding: 5px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  font-size: 12px;
  background: #fff;
}
.shared-list-pills__select {
  min-width: 160px;
  padding: 5px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  background: #fff;
}
.hub-state { padding: 20px; text-align: center; color: #64748b; }
.hub-state.error { color: #b91c1c; }
.shared-section__head { margin-bottom: 12px; }
.shared-section__head h2 { margin: 0; }
.muted { color: #64748b; font-size: 13px; }
.hide-agencies { margin-bottom: 10px; }
.hide-agencies__toggle {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.hide-agencies__panel {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}
.hide-agencies__row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin-top: 6px;
  cursor: pointer;
}
.private-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 12px 0;
  cursor: pointer;
  color: #334155;
}
.board-view {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.board-col {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  min-height: 200px;
}
.board-col h3 { margin: 0 0 10px; font-size: 14px; }
.board-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: grab;
}
.board-card p { margin: 6px 0; font-size: 12px; color: #64748b; }
.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 20px;
}
.detail-modal {
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  width: min(420px, 92vw);
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.15);
}
.detail-modal--wide {
  width: min(520px, 94vw);
}
.modal-back {
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}
.member-pick,
.item-pick {
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
  margin-top: 6px;
}
.pick-section {
  margin: 8px 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 4px 0;
  cursor: pointer;
}
.detail-modal__head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}
.detail-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 16px 0;
}
.detail-meta dt { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
.detail-meta dd { margin: 2px 0 0; font-weight: 600; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
.form-control {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font: inherit;
}
.block-assign-list {
  list-style: none;
  margin: 12px 0;
  padding: 0;
}
.block-assign-list li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}
@media (max-width: 1100px) {
  .tasks-hub__body { flex-wrap: wrap; }
}
@media (max-width: 900px) {
  .tasks-hub__header { flex-wrap: wrap; }
  .tasks-hub__search { max-width: none; order: 3; flex-basis: 100%; }
  .tasks-hub__body { flex-direction: column; }
  .board-view { grid-template-columns: 1fr; }
}
</style>
