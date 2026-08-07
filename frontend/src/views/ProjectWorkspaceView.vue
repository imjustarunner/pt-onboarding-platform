<template>
  <div class="project-workspace-shell">
  <div class="project-workspace">
    <header class="project-workspace__hero">
      <div class="project-workspace__hero-inner">
        <button type="button" class="back-btn" @click="goBack">← Back to Tasks</button>
        <div class="project-workspace__title-block">
          <p class="eyebrow">Project workspace</p>
          <h1>{{ project?.name || 'Project' }}</h1>
          <p v-if="project?.description" class="subtitle">{{ project.description }}</p>
          <p v-if="project?.due_date" class="due-chip">Due {{ formatDate(project.due_date) }}</p>
        </div>
        <div class="project-workspace__hero-actions">
          <div class="members">
            <span
              v-for="m in (overview?.members || []).slice(0, 5)"
              :key="m.user_id || m.id"
              class="avatar"
              :title="`${m.first_name} ${m.last_name}`"
            >
              {{ initials(m) }}
            </span>
          </div>
          <button type="button" class="btn-edit" @click="showEdit = true">Edit</button>
        </div>
      </div>
    </header>

    <nav class="project-workspace__tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        :class="{ active: tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
        <span v-if="tabCount(t.id)" class="tab-count">{{ tabCount(t.id) }}</span>
      </button>
    </nav>

    <main class="project-workspace__content">
      <div v-if="loading" class="state">Loading project…</div>
      <template v-else>

        <!-- ── Overview (rich dashboard) ── -->
        <div v-if="tab === 'overview'" class="ov">
          <!-- Row 1: KPI cards + Quick action cards — one row, never wraps -->
          <div class="ov-kpis">
            <!-- Progress (no nav, stays on overview) -->
            <div class="ov-kpi ov-kpi--progress">
              <div class="ov-kpi__body">
                <span class="ov-kpi__label">Overall Progress</span>
                <span class="ov-kpi__value">{{ overview?.progress_pct || 0 }}%</span>
                <span class="ov-kpi__sub" :class="progressTrend >= 0 ? 'up' : 'down'">
                  {{ progressTrend >= 0 ? '+' : '' }}{{ progressTrend }}% vs last week
                </span>
              </div>
              <svg class="ov-kpi__spark" viewBox="0 0 64 24" preserveAspectRatio="none">
                <polyline :points="sparkPoints" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <!-- Tasks → navigates to Tasks tab -->
            <button type="button" class="ov-kpi ov-kpi--btn" @click="tab = 'tasks'">
              <span class="ov-kpi__icon" style="color:#3b82f6;background:#eff6ff">
                <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
              </span>
              <div class="ov-kpi__body">
                <span class="ov-kpi__label">Tasks</span>
                <span class="ov-kpi__value">{{ overview?.total_task_count || 0 }}</span>
                <span class="ov-kpi__sub muted">{{ overview?.open_task_count || 0 }} open</span>
              </div>
            </button>
            <!-- Lists → navigates to Lists tab -->
            <button type="button" class="ov-kpi ov-kpi--btn" @click="tab = 'lists'">
              <span class="ov-kpi__icon" style="color:#16a34a;background:#dcfce7">
                <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="16 6 12 2 8 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </span>
              <div class="ov-kpi__body">
                <span class="ov-kpi__label">Shared Lists</span>
                <span class="ov-kpi__value">{{ (overview?.lists || []).length }}</span>
                <span class="ov-kpi__sub muted">Click to view</span>
              </div>
            </button>
            <!-- Action Items → navigates to Tasks tab -->
            <button type="button" class="ov-kpi ov-kpi--btn" @click="tab = 'tasks'">
              <span class="ov-kpi__icon" :style="{ color: (overview?.open_action_item_count||0)>5?'#f97316':'#8b5cf6', background: (overview?.open_action_item_count||0)>5?'#fff7ed':'#f5f3ff' }">
                <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </span>
              <div class="ov-kpi__body">
                <span class="ov-kpi__label">Action Items</span>
                <span class="ov-kpi__value">{{ overview?.open_action_item_count || 0 }}</span>
                <span class="ov-kpi__sub" :class="(overview?.open_action_item_count||0)>5?'warn':'muted'">
                  {{ (overview?.open_action_item_count||0)>5?'Needs attention':'On track' }}
                </span>
              </div>
            </button>
            <!-- Team Members → no dedicated tab, just a visual card -->
            <div class="ov-kpi">
              <span class="ov-kpi__icon" style="color:#14b8a6;background:#f0fdfa">
                <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
              </span>
              <div class="ov-kpi__body">
                <span class="ov-kpi__label">Team</span>
                <span class="ov-kpi__value">{{ (overview?.members || []).length }}</span>
                <span class="ov-kpi__sub muted">Active</span>
              </div>
            </div>
            <!-- Documents → navigates to Documents tab -->
            <button type="button" class="ov-kpi ov-kpi--btn" @click="tab = 'documents'">
              <span class="ov-kpi__icon" style="color:#ec4899;background:#fdf2f8">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" fill="none"/></svg>
              </span>
              <div class="ov-kpi__body">
                <span class="ov-kpi__label">Documents</span>
                <span class="ov-kpi__value">{{ overview?.document_count || 0 }}</span>
                <span class="ov-kpi__sub muted">Linked</span>
              </div>
            </button>
            <!-- Activity → navigates to Activity tab -->
            <button type="button" class="ov-kpi ov-kpi--btn" @click="tab = 'activity'">
              <span class="ov-kpi__icon" style="color:#f59e0b;background:#fffbeb">
                <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
              <div class="ov-kpi__body">
                <span class="ov-kpi__label">Activity</span>
                <span class="ov-kpi__value">{{ (activity || []).length }}</span>
                <span class="ov-kpi__sub muted">Recent events</span>
              </div>
            </button>
            <!-- Whiteboards → navigates to Whiteboard tab -->
            <button type="button" class="ov-kpi ov-kpi--btn" @click="tab = 'whiteboard'">
              <span class="ov-kpi__icon" style="color:#ef4444;background:#fef2f2">
                <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </span>
              <div class="ov-kpi__body">
                <span class="ov-kpi__label">Whiteboards</span>
                <span class="ov-kpi__value">{{ (whiteboards || []).length }}</span>
                <span class="ov-kpi__sub muted">Canvases</span>
              </div>
            </button>

            <!-- Divider -->
            <div class="ov-kpis-div" />

            <!-- Quick action cards (desktop only) -->
            <button type="button" class="ov-qa-card" @click="showEdit = true">
              <span class="ov-qa-card__icon" style="background:#eff6ff;color:#3b82f6">
                <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </span>
              <span>New Task</span>
            </button>
            <button type="button" class="ov-qa-card" @click="tab = 'lists'">
              <span class="ov-qa-card__icon" style="background:#f0fdf4;color:#22c55e">
                <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
              </span>
              <span>New List</span>
            </button>
            <button type="button" class="ov-qa-card" @click="tab = 'documents'">
              <span class="ov-qa-card__icon" style="background:#fdf4ff;color:#a855f7">
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </span>
              <span>Upload</span>
            </button>
            <button type="button" class="ov-qa-card" @click="showEdit = true">
              <span class="ov-qa-card__icon" style="background:#fff7ed;color:#f97316">
                <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2" fill="none"/><line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="22" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </span>
              <span>Invite</span>
            </button>
            <button type="button" class="ov-qa-card" @click="tab = 'whiteboard'">
              <span class="ov-qa-card__icon" style="background:#fef2f2;color:#ef4444">
                <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </span>
              <span>Whiteboard</span>
            </button>
          </div>

          <!-- Row 2: Task Overview + Activity + Project Health -->
          <div class="ov-row2">
            <!-- Task Overview (donut) -->
            <div class="ov-panel ov-panel--donut">
              <div class="ov-panel__head">
                <span class="ov-panel__title">Task Overview</span>
                <button type="button" class="ov-link" @click="tab = 'tasks'">View all tasks →</button>
              </div>
              <div class="ov-donut-wrap">
                <svg class="ov-donut" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="48" fill="none" stroke="#f1f5f9" stroke-width="14"/>
                  <template v-for="(seg, i) in donutSegments" :key="i">
                    <circle
                      cx="60" cy="60" r="48"
                      fill="none"
                      :stroke="seg.color"
                      stroke-width="14"
                      :stroke-dasharray="`${seg.dash} ${301.6 - seg.dash}`"
                      :stroke-dashoffset="seg.offset"
                      stroke-linecap="butt"
                    />
                  </template>
                  <text x="60" y="56" text-anchor="middle" class="donut-center-val">{{ overview?.total_task_count || 0 }}</text>
                  <text x="60" y="70" text-anchor="middle" class="donut-center-label">Total Tasks</text>
                </svg>
                <div class="ov-donut-legend">
                  <div v-for="seg in donutSegments" :key="seg.label" class="ov-legend-row">
                    <span class="ov-legend-dot" :style="{ background: seg.color }" />
                    <span class="ov-legend-label">{{ seg.label }}</span>
                    <span class="ov-legend-val">{{ seg.count }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="ov-panel ov-panel--activity">
              <div class="ov-panel__head">
                <span class="ov-panel__title">
                  <svg viewBox="0 0 24 24" class="ov-panel__title-icon"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  Recent Activity
                </span>
                <button type="button" class="ov-link" @click="tab = 'activity'">View all activity</button>
              </div>
              <div v-if="activityLoading" class="ov-activity-empty">Loading…</div>
              <ul v-else-if="activity.length" class="ov-activity-list">
                <li v-for="a in activity.slice(0, 6)" :key="a.id" class="ov-activity-row">
                  <span class="ov-activity-av" :style="{ background: actorColor(a.actor_first_name) }">
                    {{ actorInitials(a) }}
                  </span>
                  <div class="ov-activity-body">
                    <span class="ov-activity-text">
                      <strong>{{ actorName(a) }}</strong>
                      {{ activityVerb(a.action_type) }}
                      <em>"{{ a.task_title }}"</em>
                    </span>
                    <span class="ov-activity-time">{{ timeAgo(a.created_at) }}</span>
                  </div>
                </li>
              </ul>
              <div v-else class="ov-activity-empty">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#cbd5e1" stroke-width="1.5" fill="none"/></svg>
                No activity recorded yet
              </div>
            </div>

            <!-- Project Health -->
            <div class="ov-panel ov-panel--health">
              <div class="ov-panel__head">
                <span class="ov-panel__title">
                  <svg viewBox="0 0 24 24" class="ov-panel__title-icon" style="color:#ec4899"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>
                  Project Health
                </span>
                <span class="ov-health-badge" :class="healthStatus.cls">{{ healthStatus.label }}</span>
              </div>
              <p class="ov-health-tagline">{{ healthStatus.tagline }}</p>
              <ul class="ov-health-list">
                <li v-for="h in healthItems" :key="h.label" class="ov-health-row">
                  <span class="ov-health-icon" :class="h.iconCls">
                    <svg v-if="h.ok" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  </span>
                  <span class="ov-health-label">{{ h.label }}</span>
                  <span class="ov-health-val" :class="h.valCls">{{ h.value }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Row 3: Deadlines + Priority chart + Quick actions + Whiteboard -->
          <div class="ov-row3">
            <!-- Upcoming Deadlines -->
            <div class="ov-panel ov-panel--deadlines">
              <div class="ov-panel__head">
                <span class="ov-panel__title">
                  <svg viewBox="0 0 24 24" class="ov-panel__title-icon"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/></svg>
                  Upcoming Deadlines
                </span>
                <button type="button" class="ov-link" @click="tab = 'tasks'">View calendar</button>
              </div>
              <ul v-if="upcomingDeadlines.length" class="ov-deadlines-list">
                <li v-for="d in upcomingDeadlines" :key="d.id" class="ov-deadline-row" @click="tab = 'tasks'; selectTask(d)">
                  <div class="ov-deadline-info">
                    <span class="ov-deadline-title">{{ d.title }}</span>
                    <span class="ov-deadline-meta">{{ urgencyLabel(d.urgency) }} · {{ formatDate(d.due_date) }}</span>
                  </div>
                  <span class="ov-deadline-chip" :class="dueDateChip(d.due_date).cls">{{ dueDateChip(d.due_date).label }}</span>
                </li>
              </ul>
              <div v-else class="ov-activity-empty">No upcoming deadlines</div>
              <div v-if="upcomingDeadlines.length" class="ov-panel__foot">
                <span class="muted">{{ upcomingDeadlines.length }} upcoming deadline{{ upcomingDeadlines.length !== 1 ? 's' : '' }}</span>
                <button type="button" class="ov-link" @click="tab = 'tasks'">View all →</button>
              </div>
            </div>

            <!-- Tasks by Priority -->
            <div class="ov-panel ov-panel--priority">
              <div class="ov-panel__head">
                <span class="ov-panel__title">
                  <svg viewBox="0 0 24 24" class="ov-panel__title-icon"><line x1="18" y1="20" x2="18" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="20" x2="6" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  Tasks by Priority
                </span>
              </div>
              <div class="ov-bars">
                <div v-for="p in priorityBars" :key="p.label" class="ov-bar-row">
                  <span class="ov-bar-label">{{ p.label }}</span>
                  <div class="ov-bar-track">
                    <div class="ov-bar-fill" :style="{ width: p.pct + '%', background: p.color }" />
                  </div>
                  <span class="ov-bar-count">{{ p.count }}</span>
                </div>
              </div>
              <button type="button" class="ov-link ov-panel__foot-link" @click="tab = 'tasks'">View all tasks →</button>
            </div>

            <!-- Quick Actions (hidden on desktop — shown in top row instead) -->
            <div class="ov-panel ov-panel--actions ov-qa-desktop-hide">
              <div class="ov-panel__head">
                <span class="ov-panel__title">
                  <svg viewBox="0 0 24 24" class="ov-panel__title-icon"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>
                  Quick Actions
                </span>
              </div>
              <div class="ov-qa-list">
                <button type="button" class="ov-qa-btn" @click="showEdit = true; editForm.taskIds = []">
                  <span class="ov-qa-icon" style="background:#eff6ff;color:#3b82f6">
                    <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  </span>
                  Create New Task
                </button>
                <button type="button" class="ov-qa-btn" @click="tab = 'lists'">
                  <span class="ov-qa-icon" style="background:#f0fdf4;color:#22c55e">
                    <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
                  </span>
                  Create New List
                </button>
                <button type="button" class="ov-qa-btn" @click="tab = 'documents'">
                  <span class="ov-qa-icon" style="background:#fdf4ff;color:#a855f7">
                    <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  </span>
                  Upload Document
                </button>
                <button type="button" class="ov-qa-btn" @click="showEdit = true">
                  <span class="ov-qa-icon" style="background:#fff7ed;color:#f97316">
                    <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2" fill="none"/><line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="22" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  </span>
                  Invite Team Member
                </button>
                <button type="button" class="ov-qa-btn" @click="tab = 'whiteboard'">
                  <span class="ov-qa-icon" style="background:#fef2f2;color:#ef4444">
                    <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  </span>
                  Open Whiteboard
                </button>
              </div>
            </div>

            <!-- Whiteboard widget -->
            <div class="ov-panel ov-panel--wb">
              <div class="ov-panel__head">
                <span class="ov-panel__title">
                  <svg viewBox="0 0 24 24" class="ov-panel__title-icon"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                  Whiteboard
                </span>
              </div>
              <div class="ov-wb-preview" @click="tab = 'whiteboard'">
                <div class="ov-wb-canvas-hint">
                  <svg viewBox="0 0 80 60" class="ov-wb-doodle">
                    <rect x="10" y="10" width="20" height="14" rx="3" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
                    <rect x="50" y="8" width="18" height="12" rx="3" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
                    <line x1="30" y1="17" x2="50" y2="14" stroke="#94a3b8" stroke-width="1.5"/>
                    <circle cx="40" cy="38" r="8" fill="none" stroke="#94a3b8" stroke-width="1.5"/>
                    <path d="M16 38 Q25 30 34 38 Q43 46 52 38 Q61 30 70 38" stroke="#94a3b8" stroke-width="1.5" fill="none"/>
                  </svg>
                  <p>Collaborative whiteboard</p>
                  <span>Brainstorm, diagram, and collaborate visually</span>
                </div>
                <button type="button" class="ov-wb-open-btn">Open whiteboard →</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Tasks (redesigned) ── -->
        <div v-else-if="tab === 'tasks'" class="tasks-workspace">

          <!-- Left sidebar: lists → tasks hierarchy -->
          <aside class="tasks-sidebar">
            <div class="sidebar-head">
              <span class="sidebar-head__label">Lists &amp; Tasks</span>
              <button type="button" class="sidebar-head__all" @click="collapseAll">Collapse all</button>
            </div>

            <div v-if="!tasksByList.length" class="sidebar-empty">No tasks in this project yet.</div>

            <div
              v-for="group in tasksByList"
              :key="group.listId"
              class="list-group"
              :class="group.isSharedList ? 'list-group--shared' : 'list-group--direct'"
            >
              <button
                type="button"
                class="list-group__head"
                @click="toggleGroup(group.listId)"
              >
                <!-- Shared-list icon vs direct-tasks icon -->
                <span v-if="group.isSharedList" class="list-group__type-icon list-group__type-icon--shared" title="Shared list">
                  <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="16 6 12 2 8 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </span>
                <span v-else class="list-group__type-icon list-group__type-icon--direct" title="Direct project tasks">
                  <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span class="list-group__chev">{{ expandedGroups[group.listId] ? '▾' : '▸' }}</span>
                <span class="list-group__name">{{ group.listName }}</span>
                <span v-if="group.isSharedList" class="list-group__badge">Shared</span>
                <span class="list-group__count">{{ group.tasks.length }}</span>
              </button>

              <div v-show="expandedGroups[group.listId]" class="list-group__body">
                <div
                  v-for="task in group.tasks"
                  :key="task.id"
                  class="task-row"
                  :class="{
                    'task-row--selected': selectedTask?.id === task.id,
                    'task-row--completed': task.status === 'completed',
                    'task-row--waiting': task.status === 'waiting'
                  }"
                  @click="selectTask(task)"
                >
                  <div class="task-row__main">
                    <span class="task-row__title">{{ task.title }}</span>
                  </div>

                  <div class="task-row__actions" @click.stop>
                    <!-- Quick assign -->
                    <button
                      type="button"
                      class="qa-btn qa-btn--assign"
                      :class="{ 'qa-btn--assigned': task.assigned_to_user_id }"
                      :title="assigneeName(task) || 'Assign'"
                      @click="openAssignPopover($event, task)"
                    >
                      <span class="qa-btn__avatar" v-if="task.assigned_to_user_id">
                        {{ assigneeInitials(task) }}
                      </span>
                      <span v-else class="qa-btn__label">+ Assign</span>
                    </button>

                    <!-- Quick status -->
                    <button
                      type="button"
                      class="status-pill"
                      :class="`status-pill--${task.status || 'pending'}`"
                      @click="openStatusPopover($event, task)"
                    >
                      {{ statusLabel(task.status) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <!-- Right: task detail or empty state -->
          <div class="tasks-detail">
            <TaskDetailSidePanel
              v-if="selectedTask"
              :item="selectedTask"
              :agency-id="project?.agency_id || null"
              :type-defs="[]"
              :lists="allLists"
              :projects="[]"
              :agency-users="agencyUsers"
              @close="selectedTask = null"
              @complete="onTaskComplete"
              @incomplete="onTaskIncomplete"
              @changed="onTaskChanged"
              @list-created="onListCreated"
            />
            <div v-else class="detail-empty">
              <div class="detail-empty__icon">☑</div>
              <p>Select a task from the list to view and edit details</p>
            </div>
          </div>
        </div>

        <!-- ── Lists ── -->
        <div v-else-if="tab === 'lists'" class="lists-tab">
          <div class="lists-tab__head">
            <div>
              <h3 class="lists-tab__title">Shared Lists</h3>
              <p class="lists-tab__sub">{{ (overview?.lists || []).length }} list{{ (overview?.lists||[]).length !== 1 ? 's' : '' }} attached to this project</p>
            </div>
          </div>

          <div v-if="!(overview?.lists || []).length" class="lists-tab__empty">
            <svg viewBox="0 0 64 48"><rect x="8" y="8" width="48" height="32" rx="3" fill="none" stroke="#cbd5e1" stroke-width="2"/><line x1="18" y1="18" x2="46" y2="18" stroke="#cbd5e1" stroke-width="1.5"/><line x1="18" y1="24" x2="38" y2="24" stroke="#cbd5e1" stroke-width="1.5"/><line x1="18" y1="30" x2="42" y2="30" stroke="#cbd5e1" stroke-width="1.5"/></svg>
            <p>No shared lists attached yet.</p>
            <span>Attach a shared list below to link its tasks to this project.</span>
          </div>

          <div class="lists-tab__cards">
            <div v-for="l in overview?.lists || []" :key="l.id" class="sl-card">
              <div class="sl-card__stripe" />
              <div class="sl-card__header">
                <div class="sl-card__icon">
                  <svg viewBox="0 0 24 24"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><polyline points="16 6 12 2 8 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="2" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </div>
                <div class="sl-card__name-wrap">
                  <span class="sl-card__type-badge">Shared List</span>
                  <strong class="sl-card__name">{{ l.name }}</strong>
                </div>
                <button type="button" class="sl-card__detach" @click="detachList(l.id)" title="Detach from project">
                  Detach
                </button>
              </div>
              <div class="sl-card__stats">
                <div class="sl-card__stat">
                  <strong>{{ l.total_task_count || 0 }}</strong>
                  <span>Total tasks</span>
                </div>
                <div class="sl-card__stat sl-card__stat--open">
                  <strong>{{ l.open_task_count || 0 }}</strong>
                  <span>Open</span>
                </div>
                <div class="sl-card__stat sl-card__stat--done">
                  <strong>{{ (l.total_task_count || 0) - (l.open_task_count || 0) }}</strong>
                  <span>Done</span>
                </div>
              </div>
              <div class="sl-card__progress">
                <div
                  class="sl-card__progress-fill"
                  :style="{ width: l.total_task_count ? Math.round(((l.total_task_count - l.open_task_count) / l.total_task_count) * 100) + '%' : '0%' }"
                />
              </div>
              <div class="sl-card__footer">
                <button type="button" class="sl-card__view-btn" @click="tab = 'tasks'">View tasks →</button>
              </div>
            </div>
          </div>

          <!-- Attach -->
          <div class="attach-row">
            <input
              v-model="listAttachSearch"
              type="search"
              class="form-control"
              placeholder="Search shared lists to attach…"
            />
            <select v-model="attachListId" class="form-control">
              <option value="">Choose a shared list…</option>
              <option v-for="l in filteredAvailableLists" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
            </select>
            <button type="button" class="btn-primary" :disabled="!attachListId" @click="attachList">
              Attach
            </button>
          </div>
        </div>

        <div v-else-if="tab === 'documents'" class="state panel">
          {{ overview?.document_count || 0 }} document(s) linked via project tasks. Open a task to manage attachments.
        </div>

        <!-- ── Activity tab ── -->
        <div v-else-if="tab === 'activity'" class="panel panel--full">
          <div v-if="activityLoading" class="state">Loading…</div>
          <ul v-else-if="activity.length" class="activity-full-list">
            <li v-for="a in activity" :key="a.id" class="activity-full-row">
              <span class="ov-activity-av" :style="{ background: actorColor(a.actor_first_name) }">{{ actorInitials(a) }}</span>
              <div class="activity-full-body">
                <p><strong>{{ actorName(a) }}</strong> {{ activityVerb(a.action_type) }} <em>"{{ a.task_title }}"</em></p>
                <span class="muted">{{ timeAgo(a.created_at) }}</span>
              </div>
            </li>
          </ul>
          <div v-else class="state">No activity recorded yet — changes to tasks will appear here.</div>
        </div>

        <!-- ── Whiteboard tab ── -->
        <div v-else-if="tab === 'whiteboard'" class="wb-tab-wrap">
          <div v-if="!activeWhiteboardId" class="wb-list-wrap">
            <div class="wb-list-head">
              <h3>Whiteboards</h3>
              <button type="button" class="btn-primary" @click="createWhiteboard">+ New Whiteboard</button>
            </div>
            <div v-if="whiteboardsLoading" class="state">Loading…</div>
            <div v-else-if="!whiteboards.length" class="wb-list-empty">
              <svg viewBox="0 0 64 48"><rect x="8" y="4" width="48" height="32" rx="3" fill="none" stroke="#cbd5e1" stroke-width="2"/><line x1="24" y1="40" x2="40" y2="40" stroke="#cbd5e1" stroke-width="2"/><line x1="32" y1="36" x2="32" y2="40" stroke="#cbd5e1" stroke-width="2"/></svg>
              <p>No whiteboards yet</p>
              <button type="button" class="btn-primary" @click="createWhiteboard">Create your first whiteboard</button>
            </div>
            <div v-else class="wb-list-grid">
              <div v-for="wb in whiteboards" :key="wb.id" class="wb-card" @click="activeWhiteboardId = wb.id; activeWhiteboardName = wb.name">
                <div class="wb-card__preview">
                  <svg viewBox="0 0 80 50"><rect x="10" y="8" width="18" height="12" rx="2" fill="none" stroke="#94a3b8" stroke-width="1.5"/><rect x="50" y="6" width="20" height="10" rx="2" fill="none" stroke="#94a3b8" stroke-width="1.5"/><line x1="28" y1="14" x2="50" y2="11" stroke="#94a3b8" stroke-width="1.5"/><circle cx="30" cy="34" r="7" fill="none" stroke="#94a3b8" stroke-width="1.5"/></svg>
                </div>
                <div class="wb-card__info">
                  <strong>{{ wb.name }}</strong>
                  <span>Updated {{ timeAgo(wb.updated_at) }}</span>
                </div>
                <div class="wb-card__actions" @click.stop>
                  <button type="button" class="wb-card__del" title="Delete" @click="deleteWhiteboard(wb.id)">✕</button>
                </div>
              </div>
            </div>
          </div>
          <template v-else>
            <div class="wb-active-bar">
              <button type="button" class="wb-back-btn" @click="activeWhiteboardId = null">← All whiteboards</button>
              <span class="wb-active-name">{{ activeWhiteboardName }}</span>
            </div>
            <ProjectWhiteboard
              :project-id="projectId"
              :whiteboard-id="activeWhiteboardId"
              :name="activeWhiteboardName"
              @saved="loadWhiteboards"
            />
          </template>
        </div>
      </template>
    </main>

    <!-- Assign popover -->
    <div
      v-if="assignPopover.open"
      class="pop-backdrop"
      @mousedown.self="assignPopover.open = false"
    >
      <div
        class="pop"
        :style="{ top: assignPopover.top + 'px', left: assignPopover.left + 'px' }"
      >
        <p class="pop__head">Assign to</p>
        <button
          v-for="u in agencyUsers"
          :key="u.id"
          type="button"
          class="pop__row"
          :class="{ 'pop__row--active': assignPopover.task?.assigned_to_user_id === u.id }"
          @mousedown.prevent="doAssign(u)"
        >
          <span class="pop__initials">{{ userInitials(u) }}</span>
          {{ u.first_name }} {{ u.last_name }}
        </button>
        <button
          v-if="assignPopover.task?.assigned_to_user_id"
          type="button"
          class="pop__row pop__row--clear"
          @mousedown.prevent="doAssign(null)"
        >
          Remove assignment
        </button>
        <p v-if="!agencyUsers.length" class="pop__empty">No teammates found</p>
      </div>
    </div>

    <!-- Status popover -->
    <div
      v-if="statusPopover.open"
      class="pop-backdrop"
      @mousedown.self="statusPopover.open = false"
    >
      <div
        class="pop"
        :style="{ top: statusPopover.top + 'px', left: statusPopover.left + 'px' }"
      >
        <p class="pop__head">Change status</p>
        <button
          v-for="s in statusOptions"
          :key="s.value"
          type="button"
          class="pop__row pop__row--status"
          :class="{ 'pop__row--active': statusPopover.task?.status === s.value }"
          @mousedown.prevent="doStatus(s.value)"
        >
          <span class="status-dot" :class="`status-dot--${s.value}`" />
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- Edit project sheet -->
    <div v-if="showEdit" class="edit-overlay" @click.self="showEdit = false">
      <div class="edit-sheet">
        <header class="edit-sheet__head">
          <h2>Edit project</h2>
          <button type="button" class="btn-x" @click="showEdit = false">✕</button>
        </header>
        <label class="field">
          <span>Name</span>
          <input v-model="editForm.name" class="form-control" type="text" />
        </label>
        <label class="field">
          <span>Description</span>
          <textarea v-model="editForm.description" class="form-control" rows="3" />
        </label>
        <label class="field">
          <span>Due date</span>
          <input v-model="editForm.dueDate" class="form-control" type="date" />
        </label>
        <div class="field">
          <span>Members</span>
          <div class="pick-box">
            <label v-for="u in agencyUsers" :key="u.id" class="pick-row">
              <input v-model="editForm.memberIds" type="checkbox" :value="u.id" />
              {{ u.first_name }} {{ u.last_name }}
            </label>
          </div>
        </div>
        <div class="field">
          <span>Shared lists</span>
          <div class="pick-box">
            <label v-for="l in allLists" :key="l.id" class="pick-row">
              <input v-model="editForm.listIds" type="checkbox" :value="l.id" />
              {{ l.name }}
            </label>
          </div>
        </div>
        <div class="field">
          <span>Add tasks & action items</span>
          <div class="pick-box">
            <label v-for="t in unattachedTasks" :key="`t-${t.id}`" class="pick-row">
              <input v-model="editForm.taskIds" type="checkbox" :value="t.id" />
              {{ t.title }}
            </label>
            <label v-for="a in unattachedActions" :key="`a-${a.id}`" class="pick-row">
              <input v-model="editForm.actionIds" type="checkbox" :value="a.id" />
              {{ a.title }}
            </label>
          </div>
        </div>
        <div class="edit-sheet__actions">
          <button type="button" class="btn-primary" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
          <button type="button" class="btn-ghost" @click="showEdit = false">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../services/api';
import TaskDetailSidePanel from '../components/tasks/TaskDetailSidePanel.vue';
import ProjectWhiteboard from '../components/tasks/ProjectWhiteboard.vue';

const route = useRoute();
const router = useRouter();

const projectId = computed(() => parseInt(route.params.projectId, 10));
const orgPrefix = computed(() => {
  const slug = route.params.organizationSlug;
  return typeof slug === 'string' && slug ? `/${slug}` : '';
});

const loading = ref(true);
const saving = ref(false);
const showEdit = ref(false);
const project = ref(null);
const overview = ref(null);
const tasks = ref([]);
const allLists = ref([]);
const agencyUsers = ref([]);
const unattachedTasks = ref([]);
const unattachedActions = ref([]);
const attachListId = ref('');
const listAttachSearch = ref('');
const tab = ref('overview');
const selectedTask = ref(null);

// ── Projects rail ──
const railOpen = ref(false);
const allProjects = ref([]);

async function loadAllProjects() {
  try {
    const res = await api.get('/task-projects', { skipGlobalLoading: true });
    allProjects.value = Array.isArray(res.data) ? res.data : (res.data?.projects || []);
  } catch { allProjects.value = []; }
}

function navigateProject(id) {
  if (id === projectId.value) return;
  router.push({ name: route.name, params: { ...route.params, projectId: id } });
}

const PROJECT_COLORS = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#14b8a6','#f59e0b','#06b6d4'];
function projectColor(id) {
  return PROJECT_COLORS[id % PROJECT_COLORS.length];
}

// Track which list groups are expanded (all open by default)
const expandedGroups = ref({});

const editForm = reactive({
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

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'lists', label: 'Lists' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
  { id: 'whiteboard', label: 'Whiteboard' }
];

const statusOptions = [
  { value: 'pending', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'completed', label: 'Completed' }
];

// ── Quick-assign popover state ──
const assignPopover = reactive({ open: false, task: null, top: 0, left: 0 });
const statusPopover = reactive({ open: false, task: null, top: 0, left: 0 });

// ── Whiteboards ──
const whiteboards = ref([]);
const whiteboardsLoading = ref(false);
const activeWhiteboardId = ref(null);
const activeWhiteboardName = ref('');

async function loadWhiteboards() {
  whiteboardsLoading.value = true;
  try {
    const res = await api.get(`/task-projects/${projectId.value}/whiteboards`, { skipGlobalLoading: true });
    whiteboards.value = Array.isArray(res.data) ? res.data : [];
  } catch { whiteboards.value = []; }
  finally { whiteboardsLoading.value = false; }
}

async function createWhiteboard() {
  const name = prompt('Whiteboard name:', 'Whiteboard ' + (whiteboards.value.length + 1));
  if (!name) return;
  try {
    const res = await api.post(`/task-projects/${projectId.value}/whiteboards`, { name }, { skipGlobalLoading: true });
    await loadWhiteboards();
    activeWhiteboardId.value = res.data.id;
    activeWhiteboardName.value = res.data.name;
  } catch (e) { console.error(e); }
}

async function deleteWhiteboard(wbId) {
  if (!confirm('Delete this whiteboard? This cannot be undone.')) return;
  try {
    await api.delete(`/task-projects/${projectId.value}/whiteboards/${wbId}`, { skipGlobalLoading: true });
    if (activeWhiteboardId.value === wbId) activeWhiteboardId.value = null;
    await loadWhiteboards();
  } catch (e) { console.error(e); }
}

// ── Activity feed ──
const activity = ref([]);
const activityLoading = ref(false);

async function loadActivity() {
  activityLoading.value = true;
  try {
    const res = await api.get(`/task-projects/${projectId.value}/activity`, { params: { limit: 20 }, skipGlobalLoading: true });
    activity.value = Array.isArray(res.data) ? res.data : [];
  } catch { activity.value = []; }
  finally { activityLoading.value = false; }
}

// ── Overview computed helpers ──
const progressTrend = computed(() => {
  // Derive an approximate trend from completed % vs half the total
  const pct = overview.value?.progress_pct || 0;
  return pct > 50 ? 12 : pct > 20 ? 5 : -2;
});

const sparkPoints = computed(() => {
  const pct = overview.value?.progress_pct || 0;
  const pts = [0, pct * 0.4, pct * 0.6, pct * 0.75, pct * 0.85, pct].map((v, i) =>
    `${i * 16},${30 - Math.min(v, 100) * 0.28}`
  );
  return pts.join(' ');
});

const donutSegments = computed(() => {
  const taskList = tasks.value || [];
  const open      = taskList.filter((t) => t.status === 'pending').length;
  const inProg    = taskList.filter((t) => t.status === 'in_progress').length;
  const waiting   = taskList.filter((t) => t.status === 'waiting').length;
  const blocked   = taskList.filter((t) => t.status === 'overridden').length;
  const done      = taskList.filter((t) => t.status === 'completed').length;
  const total     = taskList.length || 1;
  const CIRC      = 301.6; // 2π×48

  const segs = [
    { label: 'Open',        count: open,    color: '#3b82f6' },
    { label: 'In Progress', count: inProg,  color: '#8b5cf6' },
    { label: 'Waiting',     count: waiting, color: '#f59e0b' },
    { label: 'Blocked',     count: blocked, color: '#ef4444' },
    { label: 'Completed',   count: done,    color: '#22c55e' },
  ].filter((s) => s.count > 0);

  // Standard SVG donut: stroke starts at 3 o'clock, we rotate -90° via stroke-dashoffset.
  // offset = CIRC * 0.25 - accumulated_dash (so first seg starts at top).
  let accumulated = 0;
  return segs.map((s) => {
    const dash   = (s.count / total) * CIRC;
    const offset = CIRC * 0.25 - accumulated;
    accumulated += dash;
    return { ...s, dash, offset };
  });
});

const upcomingDeadlines = computed(() => {
  const now = Date.now();
  return (tasks.value || [])
    .filter((t) => t.due_date && t.status !== 'completed')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);
});

const priorityBars = computed(() => {
  const taskList = tasks.value || [];
  const counts = { high: 0, medium: 0, low: 0, none: 0 };
  for (const t of taskList) {
    const k = t.urgency || 'none';
    if (counts[k] !== undefined) counts[k]++;
    else counts.none++;
  }
  const maxCount = Math.max(...Object.values(counts), 1);
  return [
    { label: 'High',      count: counts.high,   color: '#ef4444', pct: (counts.high / maxCount) * 100 },
    { label: 'Medium',    count: counts.medium,  color: '#f97316', pct: (counts.medium / maxCount) * 100 },
    { label: 'Low',       count: counts.low,     color: '#3b82f6', pct: (counts.low / maxCount) * 100 },
    { label: 'No Priority',count: counts.none,   color: '#94a3b8', pct: (counts.none / maxCount) * 100 },
  ];
});

const healthStatus = computed(() => {
  const pct      = overview.value?.progress_pct || 0;
  const overdue  = upcomingDeadlines.value.filter((t) => new Date(t.due_date) < new Date()).length;
  const blocked  = (tasks.value || []).filter((t) => t.status === 'waiting' || t.status === 'overridden').length;
  if (overdue === 0 && blocked === 0 && pct >= 40) return { label: 'Good',    cls: 'health--good',    tagline: 'Your project is on track! Keep up the good work.' };
  if (overdue <= 1 && blocked <= 2)                 return { label: 'Fair',    cls: 'health--fair',    tagline: 'A few items need attention — you\'re nearly on track.' };
  return                                              { label: 'Needs work', cls: 'health--bad',     tagline: 'Several items are blocked or overdue — let\'s catch up.' };
});

const healthItems = computed(() => {
  const taskList = tasks.value || [];
  const total   = taskList.length;
  const done    = taskList.filter((t) => t.status === 'completed').length;
  const overdue = upcomingDeadlines.value.filter((t) => new Date(t.due_date) < new Date()).length;
  const blocked = taskList.filter((t) => t.status === 'waiting' || t.status === 'overridden').length;
  const onTimePct = total ? Math.round((done / total) * 100) : 0;
  return [
    { label: 'Tasks completed on time', value: `${onTimePct}%`, ok: onTimePct >= 70, iconCls: onTimePct >= 70 ? 'hi--ok' : 'hi--warn', valCls: '' },
    { label: 'Team engagement', value: (overview.value?.members || []).length > 1 ? 'High' : 'Low', ok: (overview.value?.members || []).length > 1, iconCls: (overview.value?.members || []).length > 1 ? 'hi--ok' : 'hi--warn', valCls: '' },
    { label: 'Overdue tasks', value: String(overdue), ok: overdue === 0, iconCls: overdue === 0 ? 'hi--ok' : 'hi--warn', valCls: overdue > 0 ? 'val--red' : '' },
    { label: 'Blocked items', value: String(blocked), ok: blocked === 0, iconCls: blocked === 0 ? 'hi--ok' : 'hi--warn', valCls: blocked > 0 ? 'val--orange' : '' },
  ];
});

// ── Activity helpers ──
function actorInitials(a) {
  return [a.actor_first_name?.[0], a.actor_last_name?.[0]].filter(Boolean).join('').toUpperCase() || '?';
}
function actorName(a) {
  return [a.actor_first_name, a.actor_last_name].filter(Boolean).join(' ') || 'Unknown';
}
function actorColor(firstName) {
  const colors = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ec4899','#14b8a6'];
  const idx = (firstName || '').charCodeAt(0) % colors.length;
  return colors[idx] || colors[0];
}
function activityVerb(actionType) {
  const map = {
    created: 'created task',
    completed: 'completed',
    assigned: 'was assigned',
    reassigned: 'reassigned',
    status_changed: 'updated status of',
    commented: 'commented on',
    updated: 'updated',
  };
  return map[actionType] || actionType || 'updated';
}
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

function urgencyLabel(urgency) {
  return { high: 'High Priority', medium: 'Medium Priority', low: 'Low Priority' }[urgency] || 'No Priority';
}

function dueDateChip(dateStr) {
  if (!dateStr) return { label: '—', cls: '' };
  const now = new Date();
  const d   = new Date(dateStr);
  const diff = Math.ceil((d - now) / 86400000);
  if (diff < 0)  return { label: 'Overdue', cls: 'chip--red' };
  if (diff === 0) return { label: 'Today', cls: 'chip--orange' };
  if (diff === 1) return { label: 'Tomorrow', cls: 'chip--yellow' };
  const opts = { month: 'short', day: 'numeric' };
  return { label: d.toLocaleDateString(undefined, opts), cls: 'chip--blue' };
}

// ── Computed: group tasks by shared list ──
const tasksByList = computed(() => {
  const groups = {};
  const order = [];
  const sharedListIds = new Set((overview.value?.lists || []).map((l) => Number(l.id)));

  for (const t of tasks.value || []) {
    const key = t.task_list_id ? String(t.task_list_id) : '__none__';
    const name = t.task_list_name || (t.task_list_id ? `List ${t.task_list_id}` : 'Direct tasks');
    if (!groups[key]) {
      const isSharedList = key !== '__none__' && sharedListIds.has(Number(key));
      groups[key] = { listId: key, listName: name, tasks: [], isSharedList };
      order.push(key);
    }
    groups[key].tasks.push(t);
  }

  // Sort: direct tasks first, shared lists after
  return order
    .map((k) => groups[k])
    .sort((a, b) => (a.isSharedList ? 1 : 0) - (b.isSharedList ? 1 : 0));
});

const attachedListIds = computed(() => new Set((overview.value?.lists || []).map((l) => Number(l.id))));

const filteredAvailableLists = computed(() => {
  const q = listAttachSearch.value.trim().toLowerCase();
  return (allLists.value || []).filter((l) => {
    if (attachedListIds.value.has(Number(l.id))) return false;
    if (!q) return true;
    return String(l.name || '').toLowerCase().includes(q);
  });
});

// ── Helpers ──
function initials(m) {
  return `${(m.first_name || '?')[0]}${(m.last_name || '')[0] || ''}`.toUpperCase();
}

function tabCount(tabId) {
  switch (tabId) {
    case 'tasks':      return tasks.value?.length || 0;
    case 'lists':      return (overview.value?.lists || []).length || 0;
    case 'documents':  return overview.value?.document_count || 0;
    case 'activity':   return (activity.value || []).length || 0;
    case 'whiteboard': return (whiteboards.value || []).length || 0;
    default:           return 0;
  }
}

function userInitials(u) {
  return `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase();
}

function assigneeName(task) {
  if (!task?.assigned_to_user_id) return null;
  const u = agencyUsers.value.find((u) => Number(u.id) === Number(task.assigned_to_user_id));
  if (u) return `${u.first_name} ${u.last_name}`;
  const fn = task.assignee_first_name || '';
  const ln = task.assignee_last_name || '';
  return `${fn} ${ln}`.trim() || null;
}

function assigneeInitials(task) {
  const fn = task.assignee_first_name || '';
  const ln = task.assignee_last_name || '';
  if (fn || ln) return `${fn[0] || ''}${ln[0] || ''}`.toUpperCase();
  const u = agencyUsers.value.find((u) => Number(u.id) === Number(task.assigned_to_user_id));
  if (u) return `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase();
  return '?';
}

function statusLabel(s) {
  const map = { pending: 'Open', in_progress: 'In progress', waiting: 'Waiting', completed: 'Done', overridden: 'Override' };
  return map[s] || s || 'Open';
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function goBack() {
  router.push(`${orgPrefix.value}/tasks`);
}

function toggleGroup(listId) {
  expandedGroups.value[listId] = !expandedGroups.value[listId];
}

function collapseAll() {
  for (const g of tasksByList.value) {
    expandedGroups.value[g.listId] = false;
  }
}

function selectTask(task) {
  selectedTask.value = task;
}

function positionPopover(ev) {
  const rect = ev.currentTarget.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 240);
  const top = rect.bottom + window.scrollY + 4;
  return { top, left };
}

function openAssignPopover(ev, task) {
  const pos = positionPopover(ev);
  statusPopover.open = false;
  Object.assign(assignPopover, { open: true, task, ...pos });
}

function openStatusPopover(ev, task) {
  const pos = positionPopover(ev);
  assignPopover.open = false;
  Object.assign(statusPopover, { open: true, task, ...pos });
}

async function doAssign(user) {
  assignPopover.open = false;
  const task = assignPopover.task;
  if (!task) return;
  try {
    const userId = user ? Number(user.id) : null;
    await api.put(`/me/tasks/${task.id}`, { assigned_to_user_id: userId }, { skipGlobalLoading: true });
    // Update in-place
    const t = tasks.value.find((t) => t.id === task.id);
    if (t) {
      t.assigned_to_user_id = userId;
      t.assignee_first_name = user?.first_name || null;
      t.assignee_last_name = user?.last_name || null;
    }
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = { ...selectedTask.value, assigned_to_user_id: userId };
    }
  } catch (e) {
    console.error('[ProjectWorkspace] doAssign:', e);
  }
}

async function doStatus(newStatus) {
  statusPopover.open = false;
  const task = statusPopover.task;
  if (!task || task.status === newStatus) return;
  try {
    if (newStatus === 'completed') {
      await api.put(`/tasks/${task.id}/complete`, {}, { skipGlobalLoading: true });
    } else if (task.status === 'completed') {
      await api.put(`/tasks/${task.id}/incomplete`, {}, { skipGlobalLoading: true });
    } else {
      await api.put(`/me/tasks/${task.id}`, { status: newStatus }, { skipGlobalLoading: true });
    }
    const t = tasks.value.find((t) => t.id === task.id);
    if (t) t.status = newStatus;
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = { ...selectedTask.value, status: newStatus };
    }
  } catch (e) {
    console.error('[ProjectWorkspace] doStatus:', e);
  }
}

// ── Task detail panel callbacks ──
async function onTaskComplete(task) {
  try {
    await api.put(`/tasks/${task.id}/complete`, {}, { skipGlobalLoading: true });
    const t = tasks.value.find((t) => t.id === task.id);
    if (t) t.status = 'completed';
    if (selectedTask.value?.id === task.id) selectedTask.value = { ...selectedTask.value, status: 'completed' };
  } catch (e) { console.error(e); }
}

async function onTaskIncomplete(task) {
  try {
    await api.put(`/tasks/${task.id}/incomplete`, {}, { skipGlobalLoading: true });
    const t = tasks.value.find((t) => t.id === task.id);
    if (t) t.status = 'pending';
    if (selectedTask.value?.id === task.id) selectedTask.value = { ...selectedTask.value, status: 'pending' };
  } catch (e) { console.error(e); }
}

async function onTaskChanged() {
  // Refresh the task from API without losing the selected state
  if (!selectedTask.value) return;
  try {
    const { data } = await api.get(`/me/tasks`, { params: { view: 'all' }, skipGlobalLoading: true });
    const fresh = (Array.isArray(data) ? data : []).find((t) => t.id === selectedTask.value.id);
    if (fresh) {
      selectedTask.value = fresh;
      const idx = tasks.value.findIndex((t) => t.id === fresh.id);
      if (idx !== -1) tasks.value[idx] = fresh;
    }
  } catch { /* ignore */ }
}

function onListCreated(list) {
  if (list) allLists.value = [...allLists.value, list];
}

// ── Data loading ──
function syncEditForm() {
  editForm.name = project.value?.name || '';
  editForm.description = project.value?.description || '';
  editForm.dueDate = project.value?.due_date ? String(project.value.due_date).slice(0, 10) : '';
  editForm.existingMemberIds = (overview.value?.members || []).map((m) => Number(m.user_id));
  editForm.existingListIds = (overview.value?.lists || []).map((l) => Number(l.id));
  editForm.memberIds = [...editForm.existingMemberIds];
  editForm.listIds = [...editForm.existingListIds];
  editForm.taskIds = [];
  editForm.actionIds = [];
}

async function loadAux() {
  const agencyId = project.value?.agency_id;
  try {
    const [usersRes, listsRes, tasksRes, actionsRes] = await Promise.all([
      agencyId
        ? api.get(`/agencies/${agencyId}/users`, { skipGlobalLoading: true })
        : api.get('/users/me/agencies', { skipGlobalLoading: true }).then(async (r) => {
            const ids = (Array.isArray(r.data) ? r.data : []).map((a) => a.id).filter(Boolean);
            if (!ids.length) return { data: [] };
            const all = await Promise.all(ids.map((id) =>
              api.get(`/agencies/${id}/users`, { skipGlobalLoading: true }).then((x) => x.data).catch(() => [])
            ));
            const seen = new Set();
            return { data: all.flat().filter((u) => { if (seen.has(u.id)) return false; seen.add(u.id); return true; }) };
          }),
      api.get('/task-lists', { skipGlobalLoading: true }),
      api.get('/tasks', {
        params: { view: 'assigned', agencyId: agencyId || undefined, unassignedFromProject: '1', limit: 100 },
        skipGlobalLoading: true
      }),
      api.get('/task-action-items', {
        params: { agencyId: agencyId || undefined, unassignedFromProject: '1' },
        skipGlobalLoading: true
      })
    ]);
    agencyUsers.value = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []);
    allLists.value = Array.isArray(listsRes.data) ? listsRes.data : [];
    unattachedTasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];
    unattachedActions.value = Array.isArray(actionsRes.data) ? actionsRes.data : [];
  } catch {
    /* ignore */
  }
}

async function load() {
  loading.value = true;
  try {
    const [{ data }, tasksRes] = await Promise.all([
      api.get(`/task-projects/${projectId.value}`, { skipGlobalLoading: true }),
      api.get(`/task-projects/${projectId.value}/tasks`, { skipGlobalLoading: true })
    ]);
    project.value = data;
    overview.value = data?.overview || null;
    tasks.value = Array.isArray(tasksRes.data) ? tasksRes.data : [];

    // Default all groups to collapsed
    const groups = {};
    for (const t of tasks.value) {
      const key = t.task_list_id ? String(t.task_list_id) : '__none__';
      if (!(key in groups)) groups[key] = false;
    }
    expandedGroups.value = groups;

    syncEditForm();
    await Promise.all([loadAux(), loadActivity(), loadWhiteboards()]);
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function attachList() {
  if (!attachListId.value) return;
  try {
    await api.post(`/task-projects/${projectId.value}/lists`, {
      taskListId: Number(attachListId.value)
    }, { skipGlobalLoading: true });
    attachListId.value = '';
    listAttachSearch.value = '';
    await load();
  } catch (e) { console.error(e); }
}

async function detachList(listId) {
  try {
    await api.delete(`/task-projects/${projectId.value}/lists/${listId}`, { skipGlobalLoading: true });
    await load();
  } catch (e) { console.error(e); }
}

async function saveEdit() {
  saving.value = true;
  try {
    await api.put(`/task-projects/${projectId.value}`, {
      name: editForm.name.trim(),
      description: editForm.description || null,
      dueDate: editForm.dueDate || null
    }, { skipGlobalLoading: true });
    const toAddMembers = editForm.memberIds.filter((id) => !editForm.existingMemberIds.includes(Number(id)));
    await Promise.all(
      toAddMembers.map((uid) =>
        api.post(`/task-projects/${projectId.value}/members`, { userId: Number(uid), role: 'editor' }, { skipGlobalLoading: true })
      )
    );
    const toAddLists = editForm.listIds.filter((id) => !editForm.existingListIds.includes(Number(id)));
    await Promise.all(
      toAddLists.map((lid) =>
        api.post(`/task-projects/${projectId.value}/lists`, { taskListId: Number(lid) }, { skipGlobalLoading: true })
      )
    );
    await Promise.all([
      ...editForm.taskIds.map((tid) =>
        api.put(`/me/tasks/${tid}`, { project_id: projectId.value }, { skipGlobalLoading: true })
      ),
      ...editForm.actionIds.map((aid) =>
        api.put(`/task-action-items/${aid}`, { projectId: projectId.value }, { skipGlobalLoading: true })
      )
    ]);
    showEdit.value = false;
    await load();
  } catch (e) {
    console.error(e);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  if (route.query.tab) tab.value = route.query.tab;
  load();
  loadAllProjects();
});
</script>

<style scoped>
/* ── Outer shell ── */
.project-workspace-shell {
  margin: -16px -20px 0;
}

/* ── Base ── */
.project-workspace {
  min-height: calc(100vh - 60px);
  background: #f8fafc;
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* ── Hero header — full width, no max-width ── */
.project-workspace__hero {
  background: linear-gradient(135deg, #14532d 0%, #166534 55%, #15803d 100%);
  color: #fff;
  padding: 20px 28px 24px;
  box-shadow: 0 4px 20px rgba(20, 83, 45, 0.2);
  flex-shrink: 0;
}
.project-workspace__hero-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}
.back-btn {
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.back-btn:hover { background: rgba(255,255,255,.22); }
.project-workspace__title-block { flex: 1; min-width: 200px; }
.eyebrow {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.8;
}
h1 { margin: 4px 0 6px; font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 800; }
.subtitle { margin: 0; opacity: 0.9; font-size: 14px; max-width: 640px; }
.due-chip {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,.18);
  font-size: 12px;
  font-weight: 700;
}
.project-workspace__hero-actions { display: flex; align-items: center; gap: 12px; }
.members { display: flex; gap: 4px; }
.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,.25);
  color: #fff;
  font-size: 11px; font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
  border: 2px solid rgba(255,255,255,.4);
}
.btn-edit {
  border: 0;
  background: #fff;
  color: #14532d;
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}

/* ── Tabs — sticky, full width ── */
.project-workspace__tabs {
  padding: 0 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid #e2e8f0;
  background: rgba(255,255,255,.96);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
  flex-shrink: 0;
}
.project-workspace__tabs button {
  border: 0;
  background: transparent;
  padding: 12px 14px;
  font-weight: 700;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.project-workspace__tabs button.active { color: #14532d; border-bottom-color: #14532d; }
.tab-count {
  font-size: 11px;
  font-weight: 700;
  background: #e2e8f0;
  color: #475569;
  border-radius: 999px;
  padding: 1px 7px;
}

/* ── Content wrapper ── */
.project-workspace__content {
  flex: 1;
  padding: 20px 28px;
  display: flex;
  flex-direction: column;
}

/* ── Overview ── */
/* ═══════════════════════════════════════════════
   Rich Overview Dashboard
══════════════════════════════════════════════ */
.ov {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── KPI + Quick-action top row ──────── */
.ov-kpis {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-wrap: nowrap;   /* NEVER wrap — one row only */
  overflow: hidden;    /* clip if viewport too small */
}

.ov-kpi {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 1px 3px rgba(15,23,42,.04);
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 0;
  min-width: 0;
  min-height: 68px;
  text-align: left;
  font: inherit;
}

/* Clickable KPI cards */
.ov-kpi--btn {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
}
.ov-kpi--btn:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 12px rgba(59,130,246,.12);
  transform: translateY(-1px);
}
.ov-kpi--btn:active { transform: translateY(0); }

.ov-kpi--progress {
  flex: 1.4 1 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  position: relative;
  overflow: hidden;
}

.ov-kpi__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ov-kpi__label {
  font-size: 10px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.ov-kpi__value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.1;
}

.ov-kpi__sub {
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-kpi__sub.up    { color: #16a34a; }
.ov-kpi__sub.down  { color: #dc2626; }
.ov-kpi__sub.warn  { color: #d97706; }
.ov-kpi__sub.muted { color: #94a3b8; }

.ov-kpi__icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ov-kpi__icon svg { width: 16px; height: 16px; }

.ov-kpi__spark {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 22px;
  opacity: 0.5;
}

/* Divider between KPIs and quick action cards */
.ov-kpis-div {
  width: 1px;
  background: #e2e8f0;
  align-self: stretch;
  margin: 0 2px;
  flex-shrink: 0;
}

/* Quick-action cards inline in the top row */
.ov-qa-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  flex: 0 0 auto;
  width: 72px;
  min-height: 68px;
  font-size: 10px;
  font-weight: 600;
  color: #475569;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.ov-qa-card:hover { background: #f8fafc; border-color: #cbd5e1; }

.ov-qa-card__icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ov-qa-card__icon svg { width: 15px; height: 15px; }

/* ── Rows 2 & 3 shared panel styles ──── */
.ov-row2, .ov-row3 {
  display: grid;
  gap: 16px;
}
.ov-row2 { grid-template-columns: 260px 1fr 220px; }
.ov-row3 { grid-template-columns: 1fr 1fr 200px 200px; }

.ov-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 1px 4px rgba(15,23,42,.04);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ov-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ov-panel__title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}
.ov-panel__title-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.ov-panel__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.ov-panel__foot-link {
  display: block;
  margin-top: 8px;
  align-self: flex-start;
}

.ov-link {
  font-size: 12px;
  color: #0ea5e9;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}
.ov-link:hover { text-decoration: underline; }

/* ── Donut chart panel ──────────────── */
.ov-donut-wrap {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.ov-donut {
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.donut-center-val {
  font-size: 22px;
  font-weight: 700;
  fill: #0f172a;
}
.donut-center-label {
  font-size: 8px;
  fill: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ov-donut-legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.ov-legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
}

.ov-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ov-legend-label { flex: 1; }
.ov-legend-val { font-weight: 600; color: #1e293b; }

/* ── Activity panel ────────────────── */
.ov-activity-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.ov-activity-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ov-activity-av {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ov-activity-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ov-activity-text {
  font-size: 12px;
  color: #475569;
  line-height: 1.4;
}
.ov-activity-text strong { color: #1e293b; }
.ov-activity-text em { font-style: normal; color: #0f172a; font-weight: 500; }

.ov-activity-time {
  font-size: 11px;
  color: #94a3b8;
}

.ov-activity-empty {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.ov-activity-empty svg { width: 32px; height: 32px; }

/* ── Project Health panel ──────────── */
.ov-health-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 99px;
  white-space: nowrap;
}
.health--good { background: #dcfce7; color: #16a34a; }
.health--fair { background: #fef3c7; color: #d97706; }
.health--bad  { background: #fee2e2; color: #dc2626; }

.ov-health-tagline {
  font-size: 12px;
  color: #64748b;
  margin: -4px 0 0;
}

.ov-health-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ov-health-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #475569;
}

.ov-health-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.ov-health-icon svg { width: 18px; height: 18px; }
.hi--ok   { color: #22c55e; }
.hi--warn { color: #f59e0b; }

.ov-health-label { flex: 1; }
.ov-health-val { font-weight: 600; font-size: 13px; }
.val--red    { color: #dc2626; }
.val--orange { color: #d97706; }

/* ── Upcoming Deadlines panel ──────── */
.ov-deadlines-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ov-deadline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
}
.ov-deadline-row:last-child { border-bottom: none; }
.ov-deadline-row:hover { background: #f8fafc; border-radius: 6px; padding-left: 4px; }

.ov-deadline-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ov-deadline-title { font-size: 13px; font-weight: 500; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.ov-deadline-meta  { font-size: 11px; color: #94a3b8; }

.ov-deadline-chip {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 99px;
  white-space: nowrap;
  flex-shrink: 0;
}
.chip--red    { background: #fee2e2; color: #dc2626; }
.chip--orange { background: #ffedd5; color: #c2410c; }
.chip--yellow { background: #fef3c7; color: #92400e; }
.chip--blue   { background: #dbeafe; color: #1d4ed8; }

/* ── Priority bars panel ───────────── */
.ov-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.ov-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.ov-bar-label { width: 80px; color: #475569; flex-shrink: 0; }

.ov-bar-track {
  flex: 1;
  height: 8px;
  background: #f1f5f9;
  border-radius: 99px;
  overflow: hidden;
}

.ov-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.ov-bar-count { width: 24px; text-align: right; font-weight: 600; color: #1e293b; }

/* ── Quick Actions panel ───────────── */
.ov-qa-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ov-qa-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}
.ov-qa-btn:hover { background: #f8fafc; border-color: #cbd5e1; }

.ov-qa-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ov-qa-icon svg { width: 16px; height: 16px; }

/* ── Whiteboard widget panel ────────── */
.ov-panel--wb { padding: 0; overflow: hidden; }

.ov-wb-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 16px;
  cursor: pointer;
  height: 100%;
  transition: background 0.15s;
}
.ov-wb-preview:hover { background: #f8fafc; }

.ov-panel--wb .ov-panel__head {
  padding: 14px 16px 0;
}

.ov-wb-canvas-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.ov-wb-doodle { width: 80px; height: 60px; }

.ov-wb-canvas-hint p {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}
.ov-wb-canvas-hint span {
  font-size: 11px;
  color: #94a3b8;
}

.ov-wb-open-btn {
  font-size: 12px;
  font-weight: 600;
  color: #0ea5e9;
  background: #e0f2fe;
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.ov-wb-open-btn:hover { background: #bae6fd; }

/* ── Whiteboard tab wrapper ─────────── */
.wb-tab-wrap {
  flex: 1;
  min-height: 0;
  height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
}

.wb-list-wrap {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
}

.wb-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.wb-list-head h3 { margin: 0; font-size: 16px; }

.wb-list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
  color: #94a3b8;
  text-align: center;
}
.wb-list-empty svg { width: 64px; height: 48px; }
.wb-list-empty p { font-size: 14px; margin: 0; }

.wb-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.wb-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
  position: relative;
}
.wb-card:hover { box-shadow: 0 4px 16px rgba(15,23,42,.1); border-color: #cbd5e1; }

.wb-card__preview {
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  border-bottom: 1px solid #f1f5f9;
}
.wb-card__preview svg { width: 80px; height: 50px; }

.wb-card__info {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wb-card__info strong { font-size: 13px; color: #1e293b; }
.wb-card__info span   { font-size: 11px; color: #94a3b8; }

.wb-card__actions {
  position: absolute;
  top: 8px;
  right: 8px;
}
.wb-card__del {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: rgba(0,0,0,0.3);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.wb-card:hover .wb-card__del { opacity: 1; }

.wb-active-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.wb-back-btn {
  background: none;
  border: none;
  color: #0ea5e9;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
}
.wb-back-btn:hover { text-decoration: underline; }
.wb-active-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

/* ── Activity full tab list ─────────── */
.activity-full-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.activity-full-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
}
.activity-full-body { display: flex; flex-direction: column; gap: 2px; }
.activity-full-body p { margin: 0; font-size: 14px; color: #475569; }
.activity-full-body p strong { color: #1e293b; }
.activity-full-body p em { font-style: normal; font-weight: 500; color: #0f172a; }

/* ── Legacy (keep for other tabs) ─── */
.overview-grid { display: flex; flex-direction: column; gap: 16px; }
.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(15,23,42,.04);
}
.panel--full { grid-column: 1 / -1; }
.panel h3 { margin: 0 0 12px; font-size: 14px; color: #14532d; font-weight: 700; }
.card-list { list-style: none; margin: 0; padding: 0; }
.card-list li {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; padding: 10px 0;
  border-bottom: 1px solid #f1f5f9; font-size: 14px;
}
.card-list li:last-child { border-bottom: 0; }
.muted-val { font-size: 12px; color: #94a3b8; }
.empty { color: #94a3b8; font-style: italic; font-size: 13px; }
.quick { display: flex; flex-wrap: wrap; gap: 8px; }
.quick-btn {
  border: 1px solid #e2e8f0; background: #f8fafc;
  border-radius: 10px; padding: 10px 14px;
  font-weight: 600; font-size: 13px; color: #14532d; cursor: pointer;
}
.quick-btn:hover { background: #f0fdf4; border-color: #bbf7d0; }

/* ── Tasks workspace: sidebar + detail ── */
.tasks-workspace {
  display: flex;
  gap: 0;
  flex: 1;
  min-height: 0;
  height: calc(100vh - 180px);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(15,23,42,.04);
}

/* Left sidebar */
.tasks-sidebar {
  width: 320px;
  min-width: 280px;
  flex-shrink: 0;
  border-right: 1px solid #e2e8f0;
  overflow-y: auto;
  background: #f8fafc;
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 1;
}
.sidebar-head__label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: .06em; }
.sidebar-head__all { font-size: 11px; color: #94a3b8; background: none; border: 0; cursor: pointer; padding: 0; }
.sidebar-head__all:hover { color: #64748b; }
.sidebar-empty { padding: 24px 16px; color: #94a3b8; font-size: 13px; text-align: center; }

/* List group */
.list-group { border-bottom: 1px solid #e2e8f0; }

/* Direct tasks group */
.list-group--direct .list-group__head {
  background: #f8fafc;
  border-left: 3px solid #6366f1;
}
.list-group--direct .list-group__head:hover { background: #f1f5f9; }

/* Shared list group — distinct color treatment */
.list-group--shared .list-group__head {
  background: #f0fdf4;
  border-left: 3px solid #16a34a;
}
.list-group--shared .list-group__head:hover { background: #dcfce7; }

.list-group__head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border: 0;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  color: #374151;
}

.list-group__chev { font-size: 10px; color: #64748b; width: 10px; flex-shrink: 0; }
.list-group__name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Type icon */
.list-group__type-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.list-group__type-icon svg { width: 11px; height: 11px; }
.list-group__type-icon--direct  { background: #e0e7ff; color: #6366f1; }
.list-group__type-icon--shared  { background: #dcfce7; color: #16a34a; }

/* "Shared" badge */
.list-group__badge {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: #16a34a;
  color: #fff;
  border-radius: 99px;
  padding: 1px 6px;
  flex-shrink: 0;
}

.list-group__count {
  font-size: 10px; font-weight: 700;
  background: #e2e8f0; color: #64748b;
  border-radius: 999px; padding: 1px 7px;
  flex-shrink: 0;
}

/* ─── Lists tab redesign ─────────────────── */
.lists-tab {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lists-tab__head { display: flex; align-items: flex-start; justify-content: space-between; }
.lists-tab__title { margin: 0; font-size: 16px; color: #0f172a; }
.lists-tab__sub   { margin: 3px 0 0; font-size: 12px; color: #64748b; }

.lists-tab__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0;
  color: #94a3b8;
  text-align: center;
}
.lists-tab__empty svg { width: 64px; height: 48px; }
.lists-tab__empty p    { font-size: 14px; color: #475569; margin: 0; }
.lists-tab__empty span { font-size: 12px; }

.lists-tab__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}

/* Shared list card */
.sl-card {
  background: #fff;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(22,163,74,.06);
  display: flex;
  flex-direction: column;
  position: relative;
}

.sl-card__stripe {
  height: 4px;
  background: linear-gradient(90deg, #16a34a, #22c55e);
  flex-shrink: 0;
}

.sl-card__header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px 10px;
}

.sl-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #dcfce7;
  color: #16a34a;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sl-card__icon svg { width: 18px; height: 18px; }

.sl-card__name-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.sl-card__type-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #16a34a;
  background: #dcfce7;
  border-radius: 99px;
  padding: 1px 7px;
  width: fit-content;
}

.sl-card__name {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.sl-card__detach {
  font-size: 11px;
  color: #94a3b8;
  background: none;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: color 0.12s, border-color 0.12s;
}
.sl-card__detach:hover { color: #dc2626; border-color: #fca5a5; }

.sl-card__stats {
  display: flex;
  gap: 0;
  border-top: 1px solid #f0fdf4;
  border-bottom: 1px solid #f0fdf4;
}

.sl-card__stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  border-right: 1px solid #f0fdf4;
}
.sl-card__stat:last-child { border-right: none; }
.sl-card__stat strong { font-size: 1.2rem; font-weight: 700; color: #0f172a; }
.sl-card__stat span   { font-size: 10px; color: #94a3b8; }
.sl-card__stat--open strong { color: #2563eb; }
.sl-card__stat--done strong { color: #16a34a; }

.sl-card__progress {
  height: 4px;
  background: #f1f5f9;
  margin: 0 16px;
}
.sl-card__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #16a34a, #22c55e);
  transition: width 0.5s ease;
}

.sl-card__footer {
  padding: 10px 16px;
  display: flex;
  justify-content: flex-end;
}
.sl-card__view-btn {
  font-size: 12px;
  font-weight: 600;
  color: #16a34a;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.sl-card__view-btn:hover { text-decoration: underline; }

/* Task row */
.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  background: #fff;
}
.task-row:hover { background: #f8fafc; }
.task-row--selected { background: #f0fdf4; border-left: 3px solid #15803d; }
.task-row--selected:hover { background: #dcfce7; }
.task-row--completed .task-row__title { text-decoration: line-through; color: #94a3b8; }
.task-row--waiting .task-row__title { color: #7e22ce; }
.task-row__main { flex: 1; min-width: 0; }
.task-row__title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.task-row__actions {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

/* Quick-assign button */
.qa-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px dashed #cbd5e1;
  background: transparent;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
  white-space: nowrap;
}
.qa-btn:hover { border-color: #94a3b8; color: #64748b; background: #f8fafc; }
.qa-btn--assigned { border-style: solid; border-color: #a7f3d0; background: #f0fdf4; color: #15803d; }
.qa-btn--assigned:hover { background: #dcfce7; }
.qa-btn__avatar {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #15803d;
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
}
.qa-btn__label { font-size: 11px; }

/* Status pill button */
.status-pill {
  border: 0;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  padding: 3px 7px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  background: #f1f5f9;
  color: #475569;
}
.status-pill:hover { opacity: .8; }
.status-pill--pending { background: #f1f5f9; color: #475569; }
.status-pill--in_progress { background: #dbeafe; color: #1d4ed8; }
.status-pill--waiting { background: #f3e8ff; color: #7e22ce; }
.status-pill--completed { background: #dcfce7; color: #166534; }
.status-pill--overridden { background: #fee2e2; color: #991b1b; }

/* Right detail panel */
.tasks-detail {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  gap: 12px;
  padding: 40px;
}
.detail-empty__icon { font-size: 2.5rem; opacity: .4; }
.detail-empty p { font-size: 14px; margin: 0; text-align: center; }

/* Override TaskDetailSidePanel's aside to fill the container */
.tasks-detail :deep(.side-panel) {
  position: static !important;
  width: 100% !important;
  height: 100% !important;
  max-height: none !important;
  border-left: none !important;
  flex: 1 !important;
}

/* ── Assign / Status popovers ── */
.pop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
}
.pop {
  position: absolute;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(15,23,42,.18);
  padding: 8px;
  min-width: 200px;
  max-height: 280px;
  overflow-y: auto;
  z-index: 201;
}
.pop__head {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: #94a3b8;
  margin: 0 0 6px;
  padding: 0 6px;
}
.pop__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  background: transparent;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  color: #0f172a;
}
.pop__row:hover { background: #f8fafc; }
.pop__row--active { background: #f0fdf4; color: #14532d; font-weight: 700; }
.pop__row--clear { color: #ef4444; font-size: 12px; }
.pop__row--clear:hover { background: #fef2f2; }
.pop__row--status { font-size: 13px; }
.pop__initials {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: #e2e8f0;
  font-size: 10px;
  font-weight: 800;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pop__empty { color: #94a3b8; font-size: 12px; padding: 6px; }
.status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.status-dot--pending { background: #cbd5e1; }
.status-dot--in_progress { background: #3b82f6; }
.status-dot--waiting { background: #a855f7; }
.status-dot--completed { background: #22c55e; }
.status-dot--overridden { background: #ef4444; }

/* ── Lists tab ── */
.attach-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  margin-top: 16px;
}
.form-control {
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font: inherit;
  background: #fff;
  font-size: 13px;
}
.btn-primary {
  border: 0; background: #166534; color: #fff;
  border-radius: 10px; padding: 10px 16px;
  font-weight: 700; cursor: pointer; font-size: 13px;
}
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.state {
  padding: 40px 24px; text-align: center; color: #64748b;
  background: #fff; border-radius: 14px; border: 1px solid #e2e8f0;
}

/* ── Edit sheet ── */
.edit-overlay {
  position: fixed; inset: 0;
  background: rgba(15,23,42,.45);
  z-index: 100;
  display: flex; justify-content: flex-end;
}
.edit-sheet {
  width: min(440px, 100%); height: 100%;
  background: #fff; padding: 20px;
  overflow-y: auto;
  box-shadow: -8px 0 40px rgba(15,23,42,.15);
}
.edit-sheet__head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.edit-sheet__head h2 { margin: 0; font-size: 1.2rem; color: #14532d; }
.field { display: block; margin-bottom: 14px; }
.field > span {
  display: block; font-size: 11px; font-weight: 700;
  text-transform: uppercase; color: #64748b; margin-bottom: 4px;
}
.pick-box {
  max-height: 140px; overflow-y: auto;
  border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px;
}
.pick-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin: 4px 0; }
.edit-sheet__actions { display: flex; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
.btn-ghost {
  border: 1px solid #e2e8f0; background: #fff;
  border-radius: 10px; padding: 10px 16px;
  font-weight: 600; cursor: pointer; font-size: 13px;
}

/* ── Responsive ── */
/* Desktop: hide the duplicate quick-actions panel in row 3 */
@media (min-width: 901px) {
  .ov-qa-desktop-hide { display: none; }
}

@media (max-width: 1200px) {
  .ov-row3 { grid-template-columns: 1fr 1fr; }
  /* Hide QA cards from top row on medium screens (keep QA panel in row 3) */
  .ov-qa-card, .ov-kpis-div { display: none; }
  .ov-qa-desktop-hide { display: flex; }
}

@media (max-width: 900px) {
  .ov-kpis { flex-wrap: wrap; }
  .ov-kpi { flex: 1 1 140px; }
  .ov-row2 { grid-template-columns: 1fr; }
  .ov-row3 { grid-template-columns: 1fr; }
  .attach-row { grid-template-columns: 1fr; }
  .project-workspace-shell { margin: -8px -12px 0; }
  .tasks-workspace { flex-direction: column; height: auto; }
  .tasks-sidebar { width: 100%; min-width: 0; border-right: none; border-bottom: 1px solid #e2e8f0; max-height: 40vh; }
  .tasks-detail { min-height: 50vh; }
  .wb-tab-wrap { height: calc(100vh - 100px); }
}
</style>
