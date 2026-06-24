<template>
  <div class="phr-root">
    <!-- Header -->
    <div class="phr-header">
      <div>
        <h2 class="phr-title" data-tour="prehire-title">Pre-Hire</h2>
        <p class="phr-subtitle">Candidates in setup, pre-hire, and ready-for-review stages</p>
      </div>
      <div class="phr-header-right">
        <div v-if="canChooseAgency" class="phr-agency-picker">
          <label class="phr-agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="phr-select">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
          </select>
        </div>
        <button class="phr-btn phr-btn-secondary" @click="load" :disabled="loading">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Refresh
        </button>
        <router-link :to="applicantsRoute" class="phr-btn phr-btn-secondary">View Applicants</router-link>
        <router-link :to="onboardingRoute" class="phr-btn phr-btn-primary">View Onboarding</router-link>
      </div>
    </div>

    <!-- Stats row -->
    <div class="phr-stats" data-tour="prehire-stats">
      <div class="phr-stat-card" :class="{ active: statusFilter === 'PENDING_SETUP' }" @click="toggleFilter('PENDING_SETUP')">
        <div class="phr-stat-icon phr-stat-icon-orange">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div>
          <div class="phr-stat-count">{{ countByStatus('PENDING_SETUP') }}</div>
          <div class="phr-stat-label">Pending Setup</div>
        </div>
      </div>
      <div class="phr-stat-card" :class="{ active: statusFilter === 'PREHIRE_OPEN' }" @click="toggleFilter('PREHIRE_OPEN')">
        <div class="phr-stat-icon phr-stat-icon-green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        </div>
        <div>
          <div class="phr-stat-count">{{ countByStatus('PREHIRE_OPEN') }}</div>
          <div class="phr-stat-label">Pre-Hire</div>
        </div>
      </div>
      <div class="phr-stat-card" :class="{ active: statusFilter === 'PREHIRE_REVIEW' }" @click="toggleFilter('PREHIRE_REVIEW')">
        <div class="phr-stat-icon phr-stat-icon-blue">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </div>
        <div>
          <div class="phr-stat-count">{{ countByStatus('PREHIRE_REVIEW') }}</div>
          <div class="phr-stat-label">Ready for Review</div>
        </div>
      </div>
      <div class="phr-stat-card" v-if="pendingCountersignCount > 0" :class="{ active: false }" style="cursor:default;">
        <div class="phr-stat-icon phr-stat-icon-amber">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </div>
        <div>
          <div class="phr-stat-count">{{ pendingCountersignCount }}</div>
          <div class="phr-stat-label">Pending Countersigns</div>
        </div>
      </div>
      <div class="phr-stat-card" @click="toggleFilter('')" style="cursor:pointer;">
        <div class="phr-stat-icon phr-stat-icon-gray">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </div>
        <div>
          <div class="phr-stat-count">{{ filteredCandidates.length }}</div>
          <div class="phr-stat-label">Total in View</div>
        </div>
      </div>
    </div>

    <div v-if="error" class="phr-error">{{ error }}</div>

    <!-- No detail selected: full table view -->
    <div v-if="!selectedId" class="phr-table-section">
      <!-- Controls -->
      <div class="phr-controls" data-tour="prehire-filters">
        <select v-model="statusFilter" class="phr-select phr-select-sm">
          <option value="">All pre-hire</option>
          <option value="PENDING_SETUP">Pending Setup</option>
          <option value="PREHIRE_OPEN">Pre-Hire</option>
          <option value="PREHIRE_REVIEW">Ready for Review</option>
        </select>
        <div class="phr-search-wrap">
          <svg class="phr-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input v-model="q" class="phr-input" placeholder="Search by name, email, or job…" />
        </div>
        <button class="phr-btn phr-btn-secondary phr-btn-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          Filters
        </button>
      </div>

      <!-- Table -->
      <div class="phr-table-wrap" data-tour="prehire-list">
        <table class="phr-table">
          <thead>
            <tr>
              <th class="phr-th phr-th-sortable" @click="setSort('name')">
                Candidate <span class="sort-arrow">{{ sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="phr-th">Job Applied For</th>
              <th class="phr-th phr-th-sortable" @click="setSort('applied_at')">
                Date Applied <span class="sort-arrow">{{ sortCol === 'applied_at' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="phr-th">Interview Date</th>
              <th class="phr-th phr-th-sortable" @click="setSort('hired_at')">
                Moved to Pre-Hire <span class="sort-arrow">{{ sortCol === 'hired_at' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="phr-th phr-th-sortable" @click="setSort('progress_pct')">
                Overall Progress <span class="sort-arrow">{{ sortCol === 'progress_pct' ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
              </th>
              <th class="phr-th">Tasks Completed</th>
              <th class="phr-th">Actions</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="loading">
              <tr v-for="i in 5" :key="i"><td colspan="8" class="phr-td"><div class="phr-skeleton"></div></td></tr>
            </template>
            <template v-else-if="sortedCandidates.length === 0">
              <tr><td colspan="8" class="phr-td phr-empty-row">
                <div class="phr-empty-state">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  <p>No pre-hire candidates found</p>
                  <span>Candidates appear here after you click "Mark hired" on an applicant.</span>
                </div>
              </td></tr>
            </template>
            <tr
              v-else
              v-for="c in sortedCandidates"
              :key="c.id"
              class="phr-tr"
              @click="selectUser(c.id)"
            >
              <td class="phr-td">
                <div class="phr-cand-cell">
                  <div class="phr-avatar" :style="avatarStyle(c)">{{ initials(c) }}</div>
                  <div>
                    <a
                      class="phr-cand-name phr-name-link"
                      :href="userProfileRoute(c.id)"
                      target="_blank"
                      rel="noopener"
                      @click.stop
                    >{{ fullName(c) }}</a>
                    <div class="phr-cand-email">{{ c.personal_email || c.email }}</div>
                  </div>
                </div>
              </td>
              <td class="phr-td phr-td-muted">{{ c.applied_role || '—' }}</td>
              <td class="phr-td phr-td-muted">{{ fmtDate(c.applied_at) }}</td>
              <td class="phr-td phr-td-muted">{{ fmtDateTime(c.interview_date) }}</td>
              <td class="phr-td phr-td-muted">{{ fmtDate(c.hired_at) }}</td>
              <td class="phr-td">
                <div class="phr-progress-cell">
                  <span class="phr-progress-pct">{{ c.progress_pct }}%</span>
                  <div class="phr-progress-bar-wrap">
                    <div class="phr-progress-bar-fill" :style="{ width: c.progress_pct + '%' }"></div>
                  </div>
                </div>
              </td>
              <td class="phr-td">
                <span class="phr-tasks-badge">{{ c.task_completed }} of {{ c.task_total }}</span>
              </td>
              <td class="phr-td" @click.stop>
                <div class="phr-row-actions">
                  <button
                    v-if="c.status === 'PREHIRE_REVIEW'"
                    class="phr-promote-btn"
                    @click.stop="openPromoteModal(c)"
                    title="Move to Onboarding"
                  >Move to Onboarding →</button>
                  <div class="phr-actions-wrap" style="position:relative;">
                    <button class="phr-action-btn" @click.stop="toggleMenu(c.id)">⋮</button>
                    <div v-if="openMenu === c.id" class="phr-action-menu" @mouseleave="openMenu = null">
                      <button class="phr-action-item" @click="selectUser(c.id); openMenu = null">View details</button>
                      <button class="phr-action-item" @click="resendLink(c); openMenu = null">Resend setup link</button>
                      <button v-if="c.status === 'PREHIRE_REVIEW'" class="phr-action-item phr-action-item-green" @click="openPromoteModal(c); openMenu = null">Move to Onboarding…</button>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Detail split view -->
    <div v-else class="phr-split" data-tour="prehire-detail">
      <!-- Left sidebar list -->
      <div class="phr-sidebar">
        <div class="phr-sidebar-controls">
          <div class="phr-search-wrap phr-search-full">
            <svg class="phr-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input v-model="q" class="phr-input" placeholder="Search name or email…" />
          </div>
          <button class="phr-sidebar-filter-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          </button>
        </div>
        <div class="phr-sidebar-list" data-tour="prehire-list">
          <button
            v-for="c in filteredCandidates"
            :key="c.id"
            class="phr-sidebar-item"
            :class="{ 'phr-sidebar-item-active': selectedId === c.id }"
            @click="selectUser(c.id)"
          >
            <div class="phr-avatar phr-avatar-sm" :style="avatarStyle(c)">{{ initials(c) }}</div>
            <div class="phr-sidebar-info">
              <div class="phr-sidebar-name">{{ fullName(c) }}</div>
              <div class="phr-sidebar-email">{{ c.personal_email || c.email }}</div>
            </div>
            <div class="phr-sidebar-right">
              <span class="phr-status-pill" :class="statusPillClass(c.status)">{{ statusLabel(c.status) }}</span>
              <span class="phr-days-badge">{{ daysSince(c.hired_at || c.created_at) }}d</span>
            </div>
          </button>
        </div>
        <div class="phr-sidebar-footer">Showing {{ filteredCandidates.length }} of {{ candidates.length }} candidates</div>
      </div>

      <!-- Right detail -->
      <div class="phr-detail" v-if="selectedUser">
        <!-- Detail header -->
        <div class="phr-detail-header">
          <div class="phr-detail-avatar-wrap">
            <div class="phr-avatar phr-avatar-lg" :style="avatarStyle(selectedUser)">{{ initials(selectedUser) }}</div>
          </div>
          <div class="phr-detail-meta">
            <div class="phr-detail-name-row">
              <a class="phr-detail-name phr-name-link" :href="userProfileRoute(selectedUser.id)" target="_blank" rel="noopener">{{ fullName(selectedUser) }}</a>
              <span class="phr-status-pill" :class="statusPillClass(selectedUser.status)">{{ statusLabel(selectedUser.status) }}</span>
              <span class="phr-days-txt">{{ daysSince(selectedUser.hired_at || selectedUser.created_at) }} days in pre-hire</span>
            </div>
            <div class="phr-detail-subrow">
              <span v-if="selectedUser.applied_role"><strong>Applied for</strong> {{ selectedUser.applied_role }}</span>
              <span v-if="selectedUser.applied_at"><strong>Applied on</strong> {{ fmtDate(selectedUser.applied_at) }}</span>
              <span v-if="selectedUser.interview_date"><strong>Interview Date</strong> {{ fmtDateTime(selectedUser.interview_date) }}</span>
              <span v-if="selectedUser.hired_at"><strong>Moved to Pre-Hire</strong> {{ fmtDate(selectedUser.hired_at) }}</span>
            </div>
          </div>
          <div class="phr-detail-header-actions">
            <button class="phr-btn phr-btn-ghost phr-btn-sm" @click="selectedId = null">← Back to list</button>
            <button class="phr-action-btn" @click="toggleMenu('detail')">⋮</button>
            <div v-if="openMenu === 'detail'" class="phr-action-menu phr-action-menu-right" @mouseleave="openMenu = null">
              <button class="phr-action-item" @click="resendLink(selectedUser); openMenu = null">Resend setup link</button>
              <button v-if="selectedUser.status === 'PREHIRE_REVIEW'" class="phr-action-item phr-action-item-green" @click="openPromoteModal(selectedUser); openMenu = null">Move to Onboarding…</button>
            </div>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="phr-progress-section" data-tour="prehire-tasks">
          <div class="phr-progress-header">
            <div>
              <div class="phr-progress-big-pct">{{ selectedUser.progress_pct }}%</div>
              <div class="phr-progress-label">{{ selectedUser.task_completed }} of {{ selectedUser.task_total }} tasks completed</div>
            </div>
            <router-link :to="userProfileRoute(selectedUser.id)" class="phr-btn phr-btn-secondary phr-btn-sm" target="_blank">
              View Full Progress ↗
            </router-link>
          </div>
          <div class="phr-progress-bar-wrap phr-progress-bar-lg">
            <div class="phr-progress-bar-fill" :style="{ width: selectedUser.progress_pct + '%' }"></div>
          </div>
        </div>

        <!-- Stage banner -->
        <div v-if="selectedUser.status === 'PENDING_SETUP'" class="phr-stage-banner phr-stage-warn" data-tour="prehire-stage-banner">
          <strong>Waiting on candidate setup</strong>
          <p>The candidate has not yet set their password or completed initial account setup. Resend their access link if it has expired.</p>
          <button class="phr-btn phr-btn-secondary phr-btn-sm" @click="resendLink(selectedUser)" :disabled="actionLoading">
            {{ actionLoading ? 'Sending…' : 'Resend Setup Link' }}
          </button>
          <p v-if="actionMsg" class="phr-action-msg">{{ actionMsg }}</p>
        </div>
        <div v-else-if="selectedUser.status === 'PREHIRE_OPEN'" class="phr-stage-banner phr-stage-info">
          <strong>Pre-hire in progress</strong>
          <p>The candidate is completing their pre-hire documents and checklist items.</p>
        </div>
        <div v-else-if="selectedUser.status === 'PREHIRE_REVIEW'" class="phr-stage-banner phr-stage-primary">
          <strong>Ready for review</strong>
          <p>Review their submission and promote them to Onboarding when ready. A work email is required before promotion.</p>
          <button class="phr-btn phr-btn-primary phr-btn-sm" @click="openPromoteModal(selectedUser)">
            Move to Onboarding…
          </button>
          <p v-if="!selectedUser.work_email" class="phr-warn-txt">⚠ A work email is required before promoting.</p>
          <p v-if="actionMsg" class="phr-action-msg">{{ actionMsg }}</p>
        </div>

        <!-- Tabs -->
        <div class="phr-tabs">
          <button
            v-for="tab in ['Overview', 'Documents', 'Notes']"
            :key="tab"
            class="phr-tab"
            :class="{ active: activeTab === tab }"
            @click="activeTab = tab"
          >{{ tab }}</button>
        </div>

        <!-- Tab content -->
        <div class="phr-tab-content">
          <!-- Overview -->
          <div v-if="activeTab === 'Overview'" class="phr-overview">
            <div class="phr-overview-info">
              <h4 class="phr-section-label">Candidate Overview</h4>
              <div class="phr-info-row"><span class="phr-info-label">Phone</span><span>{{ selectedUser.phone || '—' }}</span></div>
              <div class="phr-info-row"><span class="phr-info-label">Location</span><span>{{ [selectedUser.city, selectedUser.state].filter(Boolean).join(', ') || '—' }}</span></div>
              <div class="phr-info-row"><span class="phr-info-label">Source</span><span>{{ selectedUser.source || '—' }}</span></div>
              <div class="phr-info-row"><span class="phr-info-label">Email</span><span>{{ selectedUser.personal_email || selectedUser.email }}</span></div>
              <div class="phr-info-row"><span class="phr-info-label">Work Email</span><span>{{ selectedUser.work_email || '—' }}</span></div>
            </div>

            <!-- Countersign tasks -->
            <div v-if="pendingCountersigns.length > 0" class="phr-countersign-section">
              <h4 class="phr-section-label phr-label-amber">Staff countersignatures needed</h4>
              <div v-for="t in pendingCountersigns" :key="t.id" class="phr-countersign-item">
                <span class="phr-countersign-title">{{ t.title }}</span>
                <span v-if="t.countersign_role_label" class="phr-role-badge">{{ t.countersign_role_label }}</span>
                <span class="phr-status-pill phr-pill-amber">Countersign</span>
              </div>
            </div>

            <!-- Candidate tasks -->
            <div class="phr-tasks-section">
              <h4 class="phr-section-label">Candidate tasks</h4>
              <div v-if="tasksLoading" class="phr-loading-sm">Loading tasks…</div>
              <div v-else-if="candidateTasks.length === 0" class="phr-empty-sm">No tasks assigned yet.</div>
              <div v-else class="phr-task-list">
                <div v-for="t in candidateTasks" :key="t.id" class="phr-task-item">
                  <span class="phr-task-icon">{{ t.status === 'completed' ? '✓' : '○' }}</span>
                  <span class="phr-task-title" :class="{ 'phr-task-done': t.status === 'completed' }">{{ t.title }}</span>
                  <span v-if="t.is_required" class="phr-required-badge">Required</span>
                  <span class="phr-task-status-pill" :class="t.status === 'completed' ? 'phr-pill-green' : 'phr-pill-gray'">
                    {{ t.status === 'completed' ? 'Done' : 'Pending' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Documents -->
          <div v-else-if="activeTab === 'Documents'" class="phr-tab-docs">
            <div v-if="tasksLoading" class="phr-loading-sm">Loading…</div>
            <div v-else-if="candidateTasks.length === 0" class="phr-empty-sm">No documents assigned yet.</div>
            <div v-else class="phr-doc-list">
              <div v-for="t in candidateTasks" :key="t.id" class="phr-doc-item">
                <div class="phr-doc-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                </div>
                <div class="phr-doc-body">
                  <div class="phr-doc-title">{{ t.title }}</div>
                  <div class="phr-doc-meta">
                    <span class="phr-task-status-pill" :class="t.status === 'completed' ? 'phr-pill-green' : 'phr-pill-gray'">
                      {{ t.status === 'completed' ? 'Completed' : t.document_action_type === 'signature' ? 'Awaiting signature' : 'Awaiting review' }}
                    </span>
                    <span v-if="t.is_required" class="phr-required-badge">Required</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div v-else-if="activeTab === 'Notes'" class="phr-tab-notes">
            <div v-if="notesLoading" class="phr-loading-sm">Loading notes…</div>
            <div v-else>
              <div v-if="notes.length === 0" class="phr-empty-sm">No notes yet.</div>
              <div v-else class="phr-notes-list">
                <div v-for="n in notes" :key="n.id" class="phr-note-item">
                  <div class="phr-note-header">
                    <span class="phr-note-author">{{ n.author_name || 'Staff' }}</span>
                    <span class="phr-note-date">{{ fmtDate(n.created_at) }}</span>
                  </div>
                  <div class="phr-note-body">{{ n.message }}</div>
                </div>
              </div>
              <div class="phr-note-composer">
                <textarea v-model="noteText" class="phr-note-input" rows="3" placeholder="Add a note…"></textarea>
                <button class="phr-btn phr-btn-primary phr-btn-sm" @click="saveNote" :disabled="!noteText.trim() || noteSaving">
                  {{ noteSaving ? 'Saving…' : 'Save note' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Promote to Onboarding Modal -->
  <PromoteToOnboardingModal
    v-if="showPromoteModal && promoteCandidate"
    :candidate="promoteCandidate"
    :agency-id="selectedAgencyId"
    @close="showPromoteModal = false; promoteCandidate = null"
    @promoted="onPromoted"
  />
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';
import { useAgencyStore } from '../../store/agency';
import PromoteToOnboardingModal from '../../components/hiring/PromoteToOnboardingModal.vue';

const authStore = useAuthStore();
const agencyStore = useAgencyStore();
const route = useRoute();

// ── Agency chooser ────────────────────────────────────────────────────────────
const agencyChoices = computed(() => {
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);
  return (base || [])
    .filter(Boolean)
    .filter((a) => String(a?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});
const canChooseAgency = computed(() => agencyChoices.value.length > 1);
const selectedAgencyId = ref(String(agencyStore.currentAgencyId || agencyChoices.value[0]?.id || ''));

// ── Routes ────────────────────────────────────────────────────────────────────
const slug = computed(() => route.params.organizationSlug || '');

// Resolve the best org slug for building admin links:
// 1. Explicit org slug in the current route (e.g. /:org/admin/pre-hire)
// 2. portal_url of the currently selected agency (so profile opens in the right tenant context)
// 3. No prefix (super-admin with no agency selected)
const effectiveSlug = computed(() => {
  if (slug.value) return slug.value;
  const agency = agencyChoices.value.find((a) => String(a.id) === String(selectedAgencyId.value));
  return String(agency?.portal_url || agency?.portalUrl || agency?.slug || '').trim().toLowerCase() || '';
});

const applicantsRoute = computed(() => effectiveSlug.value ? `/${effectiveSlug.value}/admin/hiring` : '/admin/hiring');
const onboardingRoute = computed(() => effectiveSlug.value ? `/${effectiveSlug.value}/admin/onboarding` : '/admin/onboarding');
const userProfileRoute = (id) => effectiveSlug.value ? `/${effectiveSlug.value}/admin/users/${id}` : `/admin/users/${id}`;

// ── State ─────────────────────────────────────────────────────────────────────
const candidates = ref([]);
const loading = ref(false);
const error = ref('');
const q = ref('');
const statusFilter = ref('');
const sortCol = ref('hired_at');
const sortDir = ref('desc');
const selectedId = ref(null);
const openMenu = ref(null);
const activeTab = ref('Overview');
const actionLoading = ref(false);
const actionMsg = ref('');
const tasks = ref([]);
const tasksLoading = ref(false);
const notes = ref([]);
const notesLoading = ref(false);
const noteText = ref('');
const noteSaving = ref(false);
const showPromoteModal = ref(false);
const promoteCandidate = ref(null);

// ── Normalisation ─────────────────────────────────────────────────────────────
const LEGACY_STATUS_MAP = {
  pending: 'PENDING_SETUP', pending_setup: 'PENDING_SETUP',
  prehire_open: 'PREHIRE_OPEN', prehire_review: 'PREHIRE_REVIEW',
  ready_for_review: 'PREHIRE_REVIEW'
};
const PRE_HIRE_STATUSES = new Set(['PENDING_SETUP', 'PREHIRE_OPEN', 'PREHIRE_REVIEW']);
const normalizeStatus = (s) => {
  if (!s) return s;
  const upper = String(s).toUpperCase();
  if (PRE_HIRE_STATUSES.has(upper)) return upper;
  return LEGACY_STATUS_MAP[String(s).toLowerCase()] || s;
};

// ── Data loading ──────────────────────────────────────────────────────────────
const load = async () => {
  loading.value = true;
  error.value = '';
  try {
    const params = selectedAgencyId.value ? { agencyId: selectedAgencyId.value } : {};
    const { data } = await api.get('/hiring/prehire-candidates', { params });
    candidates.value = (data || []).map((c) => ({ ...c, status: normalizeStatus(c.status) }));
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load candidates.';
  } finally {
    loading.value = false;
  }
};

// ── Filtering / sorting ───────────────────────────────────────────────────────
const filteredCandidates = computed(() => {
  let list = candidates.value;
  if (statusFilter.value) list = list.filter((c) => c.status === statusFilter.value);
  if (q.value.trim()) {
    const lq = q.value.toLowerCase();
    list = list.filter((c) =>
      fullName(c).toLowerCase().includes(lq) ||
      (c.personal_email || c.email || '').toLowerCase().includes(lq) ||
      (c.applied_role || '').toLowerCase().includes(lq)
    );
  }
  return list;
});

const sortedCandidates = computed(() => {
  const list = [...filteredCandidates.value];
  list.sort((a, b) => {
    let av, bv;
    if (sortCol.value === 'name') { av = fullName(a); bv = fullName(b); }
    else if (sortCol.value === 'progress_pct') { av = a.progress_pct; bv = b.progress_pct; }
    else if (sortCol.value === 'applied_at') { av = a.applied_at || ''; bv = b.applied_at || ''; }
    else { av = a.hired_at || a.created_at || ''; bv = b.hired_at || b.created_at || ''; }
    if (av < bv) return sortDir.value === 'asc' ? -1 : 1;
    if (av > bv) return sortDir.value === 'asc' ? 1 : -1;
    return 0;
  });
  return list;
});

const setSort = (col) => {
  if (sortCol.value === col) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  else { sortCol.value = col; sortDir.value = 'asc'; }
};

const toggleFilter = (status) => {
  statusFilter.value = statusFilter.value === status ? '' : status;
};

// ── Counts ────────────────────────────────────────────────────────────────────
const countByStatus = (s) => candidates.value.filter((c) => c.status === s).length;

const pendingCountersignCount = computed(() =>
  tasks.value.filter((t) => t.document_action_type === 'countersignature' && t.status !== 'completed').length
);
const pendingCountersigns = computed(() =>
  tasks.value.filter((t) => t.document_action_type === 'countersignature' && t.status !== 'completed')
);
const candidateTasks = computed(() =>
  tasks.value.filter((t) => t.document_action_type !== 'countersignature')
);

// ── Selected user ─────────────────────────────────────────────────────────────
const selectedUser = computed(() => candidates.value.find((c) => c.id === selectedId.value) || null);

const selectUser = (id) => {
  selectedId.value = id;
  activeTab.value = 'Overview';
  actionMsg.value = '';
  tasks.value = [];
  notes.value = [];
  loadTasks(id);
  loadNotes(id);
};

const loadTasks = async (userId) => {
  tasksLoading.value = true;
  try {
    const [candidateRes, countersignRes] = await Promise.all([
      api.get('/tasks/all', { params: { assignedToUserId: userId } }),
      api.get('/tasks/all', { params: { taskType: 'document', assignedToAgencyId: selectedAgencyId.value } }).catch(() => ({ data: [] }))
    ]);
    const candidateTaskData = candidateRes.data || [];
    const candidateTaskIds = new Set(candidateTaskData.map((t) => t.id));
    const countersignData = (countersignRes.data || []).filter(
      (t) => t.document_action_type === 'countersignature' && t.status !== 'completed' &&
        t.reference_id && candidateTaskIds.has(t.reference_id)
    );
    tasks.value = [...candidateTaskData, ...countersignData];
  } catch { /* non-fatal */ }
  finally { tasksLoading.value = false; }
};

const loadNotes = async (userId) => {
  notesLoading.value = true;
  try {
    const params = selectedAgencyId.value ? { agencyId: selectedAgencyId.value } : {};
    const { data } = await api.get(`/hiring/candidates/${userId}`, { params }).catch(() => ({ data: {} }));
    notes.value = Array.isArray(data?.notes) ? data.notes : [];
  } catch { /* non-fatal */ }
  finally { notesLoading.value = false; }
};

const saveNote = async () => {
  if (!noteText.value.trim() || !selectedId.value) return;
  noteSaving.value = true;
  try {
    const params = selectedAgencyId.value ? { agencyId: selectedAgencyId.value } : {};
    await api.post(`/hiring/candidates/${selectedId.value}/notes`, { message: noteText.value }, { params });
    noteText.value = '';
    await loadNotes(selectedId.value);
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save note.');
  } finally { noteSaving.value = false; }
};

// ── Actions ───────────────────────────────────────────────────────────────────
const resendLink = async (c) => {
  actionLoading.value = true;
  actionMsg.value = '';
  try {
    const params = selectedAgencyId.value ? { agencyId: selectedAgencyId.value } : {};
    await api.post(`/hiring/candidates/${c.id}/promote`, {}, { params });
    actionMsg.value = 'Setup link regenerated successfully.';
  } catch (e) {
    actionMsg.value = e.response?.data?.error?.message || 'Failed to resend link.';
  } finally { actionLoading.value = false; }
};

const openPromoteModal = (c) => {
  promoteCandidate.value = c;
  showPromoteModal.value = true;
};

const onPromoted = async () => {
  showPromoteModal.value = false;
  promoteCandidate.value = null;
  selectedId.value = null;
  await load();
};

const toggleMenu = (id) => { openMenu.value = openMenu.value === id ? null : id; };

// ── Helpers ───────────────────────────────────────────────────────────────────
const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '—';
const initials = (u) => {
  const f = (u.first_name || '').charAt(0);
  const l = (u.last_name || '').charAt(0);
  return (f + l).toUpperCase() || '?';
};

const AVATAR_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];
const avatarStyle = (u) => {
  const idx = (u.id || 0) % AVATAR_COLORS.length;
  return { background: AVATAR_COLORS[idx], color: 'white' };
};

const daysSince = (dateStr) => {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const statusLabel = (s) => ({ PENDING_SETUP: 'Pending Setup', PREHIRE_OPEN: 'Pre-Hire', PREHIRE_REVIEW: 'Ready for Review' }[s] || s);
const statusPillClass = (s) => ({ PENDING_SETUP: 'phr-pill-orange', PREHIRE_OPEN: 'phr-pill-green', PREHIRE_REVIEW: 'phr-pill-indigo' }[s] || '');

// ── Watchers ──────────────────────────────────────────────────────────────────
watch(selectedAgencyId, () => { selectedId.value = null; load(); });
onMounted(load);
</script>

<style scoped>
.phr-root { padding: 24px; font-family: inherit; min-height: 100vh; background: #f9fafb; }

/* ── Header ── */
.phr-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; gap: 16px; flex-wrap: wrap; }
.phr-title { font-size: 28px; font-weight: 800; color: #111827; margin: 0; }
.phr-subtitle { font-size: 13px; color: #6b7280; margin: 4px 0 0; }
.phr-header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.phr-agency-label { font-size: 12px; color: #6b7280; }
.phr-agency-picker { display: flex; align-items: center; gap: 6px; }

/* ── Buttons ── */
.phr-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s; white-space: nowrap; text-decoration: none; }
.phr-btn-primary { background: #111827; color: white; }
.phr-btn-primary:hover { background: #1f2937; }
.phr-btn-secondary { background: white; color: #374151; border: 1px solid #e5e7eb; }
.phr-btn-secondary:hover { background: #f9fafb; }
.phr-btn-ghost { background: transparent; color: #6b7280; }
.phr-btn-ghost:hover { color: #111827; }
.phr-btn-sm { padding: 6px 12px; font-size: 12px; }
.phr-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── Stats ── */
.phr-stats { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.phr-stat-card { display: flex; align-items: center; gap: 12px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 18px; flex: 1 1 140px; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; }
.phr-stat-card:hover { border-color: #93c5fd; }
.phr-stat-card.active { border-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe; }
.phr-stat-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.phr-stat-icon-orange { background: #fff7ed; color: #ea580c; }
.phr-stat-icon-green { background: #f0fdf4; color: #16a34a; }
.phr-stat-icon-blue { background: #eff6ff; color: #2563eb; }
.phr-stat-icon-amber { background: #fffbeb; color: #d97706; }
.phr-stat-icon-gray { background: #f9fafb; color: #6b7280; }
.phr-stat-count { font-size: 22px; font-weight: 800; color: #111827; }
.phr-stat-label { font-size: 12px; color: #6b7280; margin-top: 1px; }

/* ── Error ── */
.phr-error { background: #fee2e2; color: #991b1b; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; }

/* ── Controls ── */
.phr-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.phr-select { border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 10px; font-size: 13px; background: white; color: #374151; }
.phr-select-sm { font-size: 12px; padding: 6px 10px; }
.phr-search-wrap { position: relative; flex: 1; min-width: 180px; }
.phr-search-full { flex: 1; }
.phr-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; }
.phr-input { width: 100%; padding: 7px 10px 7px 30px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: white; color: #374151; box-sizing: border-box; }
.phr-input:focus { outline: none; border-color: #3b82f6; }

/* ── Table ── */
.phr-table-section { background: white; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
.phr-table-wrap { overflow-x: auto; }
.phr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.phr-th { padding: 11px 14px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; background: #f9fafb; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
.phr-th-sortable { cursor: pointer; user-select: none; }
.phr-th-sortable:hover { color: #111827; }
.sort-arrow { color: #9ca3af; }
.phr-tr { cursor: pointer; transition: background 0.1s; }
.phr-tr:hover { background: #f9fafb; }
.phr-td { padding: 14px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
.phr-td-muted { color: #6b7280; }
.phr-empty-row { text-align: center; padding: 48px 14px; }
.phr-empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #9ca3af; }
.phr-empty-state p { font-size: 14px; font-weight: 600; margin: 0; }
.phr-empty-state span { font-size: 12px; }
.phr-skeleton { height: 20px; background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%); background-size: 200%; border-radius: 4px; animation: shimmer 1.4s infinite; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ── Candidate cell ── */
.phr-cand-cell { display: flex; align-items: center; gap: 10px; }
.phr-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.phr-avatar-sm { width: 32px; height: 32px; font-size: 12px; }
.phr-avatar-lg { width: 48px; height: 48px; font-size: 18px; }
.phr-cand-name { font-weight: 600; color: #111827; }
.phr-name-link { font-weight: 600; color: #2563eb; text-decoration: none; }
.phr-name-link:hover { text-decoration: underline; }
.phr-detail-name.phr-name-link { font-size: 20px; }
.phr-cand-email { font-size: 11px; color: #6b7280; margin-top: 1px; }

/* ── Progress ── */
.phr-progress-cell { display: flex; align-items: center; gap: 8px; }
.phr-progress-pct { font-size: 13px; font-weight: 700; color: #111827; width: 36px; }
.phr-progress-bar-wrap { flex: 1; height: 6px; background: #f3f4f6; border-radius: 99px; overflow: hidden; min-width: 60px; }
.phr-progress-bar-lg { height: 10px; }
.phr-progress-bar-fill { height: 100%; background: #22c55e; border-radius: 99px; transition: width 0.3s; }

/* ── Tasks badge ── */
.phr-tasks-badge { font-size: 12px; color: #374151; background: #f3f4f6; padding: 3px 8px; border-radius: 20px; }

/* ── Actions ── */
.phr-action-btn { background: transparent; border: none; cursor: pointer; font-size: 18px; color: #6b7280; padding: 4px 8px; border-radius: 4px; }
.phr-action-btn:hover { background: #f3f4f6; color: #111827; }
.phr-actions-wrap { position: relative; }
.phr-action-menu { position: absolute; right: 0; top: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); z-index: 100; min-width: 160px; padding: 4px 0; }
.phr-action-menu-right { right: 0; }
.phr-action-item { display: block; width: 100%; text-align: left; padding: 8px 14px; font-size: 13px; background: transparent; border: none; cursor: pointer; color: #374151; }
.phr-action-item:hover { background: #f9fafb; }
.phr-action-item-green { color: #16a34a; }
.phr-row-actions { display: flex; align-items: center; gap: 6px; }
.phr-promote-btn { font-size: 11px; font-weight: 700; padding: 4px 10px; background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; border-radius: 20px; cursor: pointer; white-space: nowrap; transition: all 0.15s; }
.phr-promote-btn:hover { background: #dcfce7; border-color: #86efac; }

/* ── Status pills ── */
.phr-status-pill { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
.phr-pill-orange { background: #fff7ed; color: #c2410c; }
.phr-pill-green { background: #f0fdf4; color: #16a34a; }
.phr-pill-indigo { background: #eef2ff; color: #4338ca; }
.phr-pill-amber { background: #fffbeb; color: #92400e; }
.phr-pill-gray { background: #f3f4f6; color: #6b7280; }

.phr-days-badge { font-size: 11px; color: #6b7280; background: #f3f4f6; border-radius: 20px; padding: 2px 7px; }
.phr-days-txt { font-size: 12px; color: #6b7280; }

/* ── Split view ── */
.phr-split { display: flex; gap: 0; background: white; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; min-height: 600px; }

/* ── Sidebar ── */
.phr-sidebar { width: 300px; flex-shrink: 0; border-right: 1px solid #f3f4f6; display: flex; flex-direction: column; }
.phr-sidebar-controls { padding: 12px; border-bottom: 1px solid #f3f4f6; display: flex; gap: 6px; }
.phr-sidebar-filter-btn { flex-shrink: 0; background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 7px 10px; cursor: pointer; color: #6b7280; }
.phr-sidebar-list { flex: 1; overflow-y: auto; }
.phr-sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: transparent; border: none; width: 100%; text-align: left; cursor: pointer; border-bottom: 1px solid #f9fafb; transition: background 0.1s; }
.phr-sidebar-item:hover { background: #f9fafb; }
.phr-sidebar-item-active { background: #f0f9ff !important; }
.phr-sidebar-info { flex: 1; min-width: 0; }
.phr-sidebar-name { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.phr-sidebar-email { font-size: 11px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.phr-sidebar-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.phr-sidebar-footer { padding: 10px 12px; font-size: 11px; color: #9ca3af; border-top: 1px solid #f3f4f6; }

/* ── Detail panel ── */
.phr-detail { flex: 1; overflow-y: auto; }
.phr-detail-header { display: flex; align-items: flex-start; gap: 14px; padding: 20px 20px 16px; border-bottom: 1px solid #f3f4f6; }
.phr-detail-avatar-wrap { flex-shrink: 0; }
.phr-detail-meta { flex: 1; }
.phr-detail-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.phr-detail-name { font-size: 20px; font-weight: 800; color: #111827; margin: 0; }
.phr-detail-subrow { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: #6b7280; }
.phr-detail-subrow strong { color: #374151; margin-right: 4px; }
.phr-detail-header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; position: relative; }

/* ── Progress section ── */
.phr-progress-section { padding: 16px 20px; border-bottom: 1px solid #f3f4f6; }
.phr-progress-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 10px; }
.phr-progress-big-pct { font-size: 28px; font-weight: 800; color: #111827; }
.phr-progress-label { font-size: 13px; color: #6b7280; }

/* ── Stage banners ── */
.phr-stage-banner { margin: 14px 20px; padding: 14px 16px; border-radius: 10px; font-size: 13px; }
.phr-stage-banner strong { display: block; font-size: 14px; margin-bottom: 4px; }
.phr-stage-banner p { margin: 4px 0 10px; color: #374151; }
.phr-stage-warn { background: #fffbeb; border: 1px solid #fde68a; }
.phr-stage-info { background: #f0f9ff; border: 1px solid #bae6fd; }
.phr-stage-primary { background: #eef2ff; border: 1px solid #c7d2fe; }
.phr-warn-txt { font-size: 12px; color: #b45309; margin-top: 6px; }
.phr-action-msg { font-size: 12px; color: #16a34a; margin-top: 6px; }

/* ── Tabs ── */
.phr-tabs { display: flex; border-bottom: 2px solid #f3f4f6; padding: 0 20px; margin-top: 4px; }
.phr-tab { padding: 10px 0; margin-right: 24px; font-size: 14px; font-weight: 600; color: #6b7280; background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; margin-bottom: -2px; }
.phr-tab.active { color: #111827; border-bottom-color: #111827; }

/* ── Tab content ── */
.phr-tab-content { padding: 16px 20px; }

/* Overview */
.phr-overview { display: grid; gap: 20px; }
.phr-overview-info { }
.phr-section-label { font-size: 13px; font-weight: 700; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em; }
.phr-label-amber { color: #92400e; }
.phr-info-row { display: flex; gap: 12px; font-size: 13px; padding: 7px 0; border-bottom: 1px solid #f9fafb; }
.phr-info-label { width: 100px; color: #6b7280; flex-shrink: 0; font-weight: 500; }

/* Countersigns */
.phr-countersign-section { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 14px; }
.phr-countersign-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #fef3c7; font-size: 13px; }
.phr-countersign-item:last-child { border-bottom: none; }
.phr-countersign-title { flex: 1; color: #111827; }
.phr-role-badge { font-size: 11px; background: #fef3c7; color: #92400e; padding: 2px 7px; border-radius: 20px; }

/* Tasks */
.phr-tasks-section { }
.phr-task-list { display: flex; flex-direction: column; gap: 4px; }
.phr-task-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #f9fafb; border-radius: 8px; font-size: 13px; }
.phr-task-icon { font-size: 16px; color: #22c55e; flex-shrink: 0; }
.phr-task-title { flex: 1; color: #111827; }
.phr-task-done { text-decoration: line-through; color: #9ca3af; }
.phr-task-status-pill { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 20px; }
.phr-required-badge { font-size: 10px; font-weight: 700; background: #ede9fe; color: #5b21b6; padding: 2px 6px; border-radius: 20px; flex-shrink: 0; }

/* Documents tab */
.phr-doc-list { display: flex; flex-direction: column; gap: 8px; }
.phr-doc-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: #f9fafb; border-radius: 10px; }
.phr-doc-icon { color: #6b7280; flex-shrink: 0; }
.phr-doc-body { flex: 1; }
.phr-doc-title { font-size: 13px; font-weight: 600; color: #111827; margin-bottom: 4px; }
.phr-doc-meta { display: flex; gap: 6px; align-items: center; }

/* Notes tab */
.phr-notes-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.phr-note-item { background: #f9fafb; border-radius: 10px; padding: 12px; }
.phr-note-header { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-bottom: 6px; }
.phr-note-author { font-weight: 600; color: #374151; }
.phr-note-body { font-size: 13px; color: #111827; line-height: 1.6; }
.phr-note-composer { display: flex; flex-direction: column; gap: 8px; }
.phr-note-input { width: 100%; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 13px; resize: vertical; box-sizing: border-box; }
.phr-note-input:focus { outline: none; border-color: #3b82f6; }

/* Misc */
.phr-loading-sm { font-size: 13px; color: #9ca3af; padding: 12px 0; }
.phr-empty-sm { font-size: 13px; color: #9ca3af; padding: 12px 0; }
</style>
