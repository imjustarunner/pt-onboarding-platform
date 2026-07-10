<template>
  <div class="ov-root">
    <div v-if="loading" class="ov-full-loading">
      <div class="ov-spinner"></div>
      Loading overview…
    </div>
    <div v-else-if="loadError" class="ov-full-error">{{ loadError }}</div>

    <template v-else>
      <div class="ov-layout">

        <!-- ═══ LEFT SIDEBAR ══════════════════════════════════════════════════ -->
        <aside class="ov-sidebar">

          <!-- Section navigation -->
          <nav class="ov-nav">
            <div class="ov-nav-item ov-nav-item--active">
              <span class="ov-nav-dot"></span>Overview
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'account')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>
              Account Information
            </div>
            <div v-if="canViewLifecycleTab" class="ov-nav-item" @click="$emit('navigate', 'lifecycle')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>
              Lifecycle Management
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'account')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clip-rule="evenodd"/><path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z"/></svg>
              Job &amp; Employment
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'account')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clip-rule="evenodd"/></svg>
              Compensation
            </div>
            <div v-if="canViewPayroll" class="ov-nav-item" @click="$emit('navigate', 'payroll')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>
              Payroll
            </div>
            <div v-if="canViewCredentialingTab" class="ov-nav-item" @click="$emit('navigate', 'credentialing')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/></svg>
              Credentials &amp; Licensing
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'schedule_availability')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
              Schedule &amp; Availability
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'training')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84l7 3a1 1 0 00.788 0l7-3a1 1 0 000-1.84l-7-3zM17 8.414l-7 3-7-3V13a7 7 0 0014 0V8.414z"/></svg>
              Training &amp; Education
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'documents')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
              Documents
              <span v-if="summary.recentDocCount > 0" class="ov-nav-badge">{{ summary.recentDocCount }}</span>
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'communications')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/></svg>
              Communications
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'affiliations')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/></svg>
              Affiliations
              <span v-if="affiliations.length > 0" class="ov-nav-badge">{{ affiliations.length }}</span>
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'training')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
              Tasks
            </div>
            <div class="ov-nav-item" @click="openNoteComposer">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
              Notes
            </div>
            <div v-if="canViewActivityLog" class="ov-nav-item" @click="$emit('navigate', 'activity')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
              Activity Log
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'preferences')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>
              Preferences
            </div>
            <div class="ov-nav-item" @click="$emit('navigate', 'admin_docs')">
              <svg class="ov-nav-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V6.414A2 2 0 0016.414 5L14 2.586A2 2 0 0012.586 2H9z"/><path d="M3 8a2 2 0 012-2v10h8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
              Admin Documentation
            </div>
          </nav>

          <!-- Quick Actions -->
          <div class="ov-sidebar-block">
            <div class="ov-sidebar-block-title">Quick Actions</div>
            <button class="ov-qa-btn" type="button" @click="$emit('navigate', 'account')">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
              Edit Profile
            </button>
            <button class="ov-qa-btn" type="button" @click="$emit('navigate', 'account')">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/></svg>
              Reset Password
            </button>
            <button class="ov-qa-btn" type="button" @click="$emit('navigate', 'payroll')">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/></svg>
              Log Time Manually
            </button>
            <button class="ov-qa-btn" type="button" @click="$emit('navigate', 'communications')">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
              Send Message
            </button>
            <button class="ov-qa-btn" type="button" @click="$emit('navigate', 'documents')">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
              Upload Document
            </button>
            <button class="ov-qa-btn" type="button" @click="openNoteComposer">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd"/></svg>
              Add Note
            </button>
          </div>

          <!-- Direct Chat -->
          <div class="ov-sidebar-block">
            <div class="ov-sidebar-block-title">Direct Chat</div>
            <div class="ov-chat-row" @click="$emit('navigate', 'communications')">
              <div class="ov-chat-avatar">PO</div>
              <div class="ov-chat-info">
                <div class="ov-chat-name">People Operations</div>
                <div class="ov-chat-status"><span class="ov-online-dot"></span>Online</div>
              </div>
            </div>
            <button class="ov-chat-start" type="button" @click="$emit('navigate', 'communications')">Start a conversation</button>
          </div>
        </aside>

        <!-- ═══ MAIN CONTENT ════════════════════════════════════════════════ -->
        <main class="ov-main">

          <!-- ── Row 1: Metric cards ────────────────────────────────────── -->
          <div class="ov-metric-row">

            <div class="ov-metric-card" @click="$emit('navigate', 'communications')">
              <div class="ov-metric-header">
                <span class="ov-metric-label">Unread Messages</span>
                <span class="ov-metric-icon-wrap ov-metric-icon--msg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </span>
              </div>
              <div class="ov-metric-num">—</div>
              <div class="ov-metric-divider"></div>
              <span class="ov-metric-link">View Messages</span>
            </div>

            <div class="ov-metric-card" @click="$emit('navigate', 'training')">
              <div class="ov-metric-header">
                <span class="ov-metric-label">Pending Tasks</span>
                <span class="ov-metric-icon-wrap ov-metric-icon--task">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                </span>
              </div>
              <div class="ov-metric-num">{{ summary.pendingTaskCount + summary.inProgressTaskCount }}</div>
              <div class="ov-metric-divider"></div>
              <span class="ov-metric-link">View Tasks</span>
            </div>

            <div class="ov-metric-card" @click="$emit('navigate', 'training')">
              <div class="ov-metric-header">
                <span class="ov-metric-label">Upcoming &amp; Overdue</span>
                <span class="ov-metric-icon-wrap ov-metric-icon--cal">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </span>
              </div>
              <div :class="['ov-metric-num', summary.overdueTaskCount > 0 ? 'ov-metric-num--warn' : '']">
                {{ summary.overdueTaskCount + summary.upcomingTaskCount }}
              </div>
              <div class="ov-metric-divider"></div>
              <span class="ov-metric-link">View All</span>
            </div>

            <div class="ov-metric-card" @click="$emit('navigate', 'documents')">
              <div class="ov-metric-header">
                <span class="ov-metric-label">Recent Documents</span>
                <span class="ov-metric-icon-wrap ov-metric-icon--doc">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
                </span>
              </div>
              <div class="ov-metric-num">{{ summary.recentDocCount }}</div>
              <div class="ov-metric-divider"></div>
              <span class="ov-metric-link">View Documents</span>
            </div>
          </div>

          <!-- ── Row 2: Personal Info + Job Details ─────────────────────── -->
          <div class="ov-two-col">

            <!-- Personal Information -->
            <div class="ov-card">
              <div class="ov-card-hdr">
                <span class="ov-card-title">Personal Information</span>
                <div class="ov-card-acts">
                  <template v-if="canEditUser && !editingPersonal">
                    <button class="ov-btn-edit" type="button" @click="startEditPersonal">Edit</button>
                  </template>
                  <template v-else-if="editingPersonal">
                    <button class="ov-btn-save" type="button" :disabled="savingPersonal" @click="savePersonal">{{ savingPersonal ? 'Saving…' : 'Save' }}</button>
                    <button class="ov-btn-cancel" type="button" @click="cancelEditPersonal">Cancel</button>
                  </template>
                </div>
              </div>
              <div v-if="personalSaveError" class="ov-err">{{ personalSaveError }}</div>

              <!-- View -->
              <template v-if="!editingPersonal">
                <div class="ov-field-list">
                  <div class="ov-field-row"><span class="ov-fl">Preferred Name</span><span class="ov-fv">{{ ai?.preferredName || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Email</span><span class="ov-fv">{{ user.email || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Personal Email</span><span class="ov-fv">{{ ai?.personalEmail || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Phone Number</span><span class="ov-fv">{{ ai?.phoneNumber || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Personal Phone</span><span class="ov-fv">{{ ai?.personalPhone || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Address</span>
                    <span class="ov-fv">{{ formattedAddress || '—' }}</span>
                  </div>
                  <div class="ov-field-row"><span class="ov-fl">Emergency Contact</span><span class="ov-fv">{{ user.emergency_contact || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Date of Birth</span><span class="ov-fv">{{ fmtDate(lifecycle?.summary?.dateOfBirth) || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Language Spoken</span><span class="ov-fv">{{ ai?.languagesSpoken || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Pronouns</span><span class="ov-fv">{{ user.pronouns || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Work Email</span><span class="ov-fv">{{ user.work_email || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Title</span><span class="ov-fv">{{ user.title || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Service Focus</span><span class="ov-fv">{{ ai?.serviceFocus || '—' }}</span></div>
                </div>
              </template>

              <!-- Edit form -->
              <template v-else>
                <div class="ov-edit-grid">
                  <label class="ov-eg-row"><span class="ov-fl">Preferred Name</span><input v-model="personalDraft.preferredName" class="ov-input" type="text"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">Personal Email</span><input v-model="personalDraft.personalEmail" class="ov-input" type="email"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">Phone Number</span><input v-model="personalDraft.phoneNumber" class="ov-input" type="tel"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">Personal Phone</span><input v-model="personalDraft.personalPhone" class="ov-input" type="tel"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">Street Address</span><input v-model="personalDraft.homeStreetAddress" class="ov-input" type="text"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">City</span><input v-model="personalDraft.homeCity" class="ov-input" type="text"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">State</span><input v-model="personalDraft.homeState" class="ov-input" type="text" maxlength="2"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">Postal Code</span><input v-model="personalDraft.homePostalCode" class="ov-input" type="text"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">Languages</span><input v-model="personalDraft.languagesSpoken" class="ov-input" type="text"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">Service Focus</span><input v-model="personalDraft.serviceFocus" class="ov-input" type="text"/></label>
                </div>
              </template>
            </div>

            <!-- Job & Employment Details -->
            <div class="ov-card">
              <div class="ov-card-hdr">
                <span class="ov-card-title">Job &amp; Employment Details</span>
                <div class="ov-card-acts">
                  <template v-if="canEditUser && !editingJob">
                    <button class="ov-btn-edit" type="button" @click="startEditJob">Edit</button>
                  </template>
                  <template v-else-if="editingJob">
                    <button class="ov-btn-save" type="button" :disabled="savingJob" @click="saveJob">{{ savingJob ? 'Saving…' : 'Save' }}</button>
                    <button class="ov-btn-cancel" type="button" @click="cancelEditJob">Cancel</button>
                  </template>
                </div>
              </div>
              <div v-if="jobSaveError" class="ov-err">{{ jobSaveError }}</div>

              <template v-if="!editingJob">
                <div class="ov-field-list">
                  <div class="ov-field-row"><span class="ov-fl">Job Title</span><span class="ov-fv">{{ user.title || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Department</span><span class="ov-fv">{{ user.department || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Employment Type</span><span class="ov-fv">{{ employmentTypeLabel }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Work Location</span><span class="ov-fv">{{ user.work_location || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Pay Rate</span><span class="ov-fv">{{ user.pay_rate ? `$${Number(user.pay_rate).toLocaleString()}.00 / year` : '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Pay Type</span><span class="ov-fv">{{ user.pay_type || '—' }}</span></div>
                  <div class="ov-field-row">
                    <span class="ov-fl">Manager</span>
                    <span class="ov-fv ov-fv--avatar">
                      <span v-if="managerName" class="ov-av-xs">{{ avatarInitials(user.manager_first_name, user.manager_last_name, managerName) }}</span>
                      {{ managerName || '—' }}
                    </span>
                  </div>
                  <div class="ov-field-row">
                    <span class="ov-fl">Supervisor</span>
                    <span class="ov-fv ov-fv--avatar">
                      <span v-if="primarySupervisorName" class="ov-av-xs ov-av-xs--teal">{{ initials(supervisors[0]?.supervisor_first_name, supervisors[0]?.supervisor_last_name) }}</span>
                      {{ primarySupervisorName || '—' }}
                    </span>
                  </div>
                  <div class="ov-field-row"><span class="ov-fl">Reports To</span><span class="ov-fv">{{ managerName || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Hire Date</span><span class="ov-fv">{{ fmtDate(user.hire_date) || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Start Date</span><span class="ov-fv">{{ fmtDate(lifecycle?.summary?.startDate || user.start_date) || '—' }}</span></div>
                  <div class="ov-field-row"><span class="ov-fl">Employee ID</span><span class="ov-fv">{{ user.employee_id || (user.id ? `EMP-${String(user.id).padStart(4,'0')}` : '—') }}</span></div>
                </div>
              </template>

              <template v-else>
                <div class="ov-edit-grid">
                  <label class="ov-eg-row"><span class="ov-fl">Job Title</span><input v-model="jobDraft.title" class="ov-input" type="text"/></label>
                  <label class="ov-eg-row"><span class="ov-fl">Department</span><input v-model="jobDraft.department" class="ov-input" type="text"/></label>
                  <label class="ov-eg-row">
                    <span class="ov-fl">Employment Type</span>
                    <select v-model="jobDraft.employmentType" class="ov-input">
                      <option value="">— Select —</option>
                      <option value="full_time">Full-Time</option>
                      <option value="part_time">Part-Time</option>
                      <option value="contractor">Contractor</option>
                      <option value="intern">Intern</option>
                      <option value="per_diem">Per Diem</option>
                    </select>
                  </label>
                  <label class="ov-eg-row"><span class="ov-fl">Work Location</span><input v-model="jobDraft.workLocation" class="ov-input" type="text"/></label>
                </div>
              </template>
            </div>
          </div>

          <!-- ── Row 3: Insurance accepted ─────────────────────────────── -->
          <div v-if="acceptedInsurances.length" class="ov-card">
            <div class="ov-card-hdr">
              <span class="ov-card-title">Insurance Accepted</span>
              <button v-if="canViewCredentialingTab" class="ov-btn-viewall" type="button" @click="$emit('navigate', 'credentialing')">Manage</button>
            </div>
            <AcceptedInsuranceBadges :items="acceptedInsurances" :show-label="false" />
          </div>

          <!-- ── Row 4: Affiliations (only when data exists) ──────────── -->
          <div v-if="affiliationsLoading || affiliations.length > 0" class="ov-card">
            <div class="ov-card-hdr">
              <span class="ov-card-title">Affiliations</span>
              <button class="ov-btn-viewall" type="button" @click="$emit('navigate', 'affiliations')">View All</button>
            </div>
            <div v-if="affiliationsLoading" class="ov-loading-sm">Loading…</div>
            <div v-else class="ov-affil-grid">
              <div v-for="org in affiliations" :key="org.id" class="ov-affil-item">
                <div class="ov-affil-icon">
                  <img
                    v-if="org.icon_file_path"
                    :src="org.icon_file_path"
                    :alt="org.name"
                    class="ov-affil-logo"
                  />
                  <span v-else class="ov-affil-initials">{{ org.name ? org.name.charAt(0).toUpperCase() : '?' }}</span>
                </div>
                <div class="ov-affil-body">
                  <div class="ov-affil-name">{{ org.name }}</div>
                  <div class="ov-affil-type">{{ orgTypeLabel(org.organization_type) }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Row 4: Lifecycle Management (full width) ───────────────── -->
          <div v-if="canViewLifecycleTab && lifecycle" class="ov-card">
            <div class="ov-card-hdr">
              <span class="ov-card-title">Lifecycle Management</span>
              <button class="ov-btn-edit" type="button" @click="$emit('navigate', 'lifecycle')">Edit</button>
            </div>

            <!-- Status summary bar -->
            <div class="ov-lc-bar">
              <div class="ov-lc-field">
                <div class="ov-lc-label">Employee Status</div>
                <span :class="['ov-status-badge', lcStatusBadgeClass]">{{ lcStatusLabel }}</span>
              </div>
              <div class="ov-lc-field">
                <div class="ov-lc-label">First Client Date</div>
                <div class="ov-lc-val">{{ fmtDate(lifecycle.summary?.firstClientDate) || '—' }}</div>
              </div>
              <div class="ov-lc-field">
                <div class="ov-lc-label">Last Day Worked</div>
                <div class="ov-lc-val">{{ fmtDate(lifecycle.summary?.lastDayWorked) || '—' }}</div>
              </div>
              <div class="ov-lc-field">
                <div class="ov-lc-label">Termination Date</div>
                <div class="ov-lc-val">{{ fmtDate(lifecycle.summary?.terminationDate) || '—' }}</div>
              </div>
              <div class="ov-lc-field">
                <div class="ov-lc-label">Offboarding Status</div>
                <div class="ov-lc-val">{{ lifecycle.summary?.offboardingStatus || 'N/A' }}</div>
              </div>
              <div v-if="lifecycle.summary?.dateOfBirth" class="ov-lc-field">
                <div class="ov-lc-label">Date of Birth</div>
                <div class="ov-lc-val">{{ fmtDate(lifecycle.summary.dateOfBirth) }}</div>
                <div class="ov-lc-note">Edit in Clinical Information</div>
              </div>
            </div>

            <!-- Timeline + Employment Dates -->
            <div class="ov-lc-bottom">
              <!-- Key Dates Timeline -->
              <div class="ov-lc-timeline-col">
                <div class="ov-lc-subtitle">Key Dates Timeline</div>
                <div class="ov-timeline-wrap">
                  <div class="ov-timeline-line"></div>
                  <div class="ov-timeline-points">
                    <div v-for="(pt, i) in timelinePoints" :key="i" class="ov-timeline-pt">
                      <div :class="['ov-timeline-dot', pt.active ? 'ov-timeline-dot--on' : '']"></div>
                      <div class="ov-timeline-label">{{ pt.label }}</div>
                      <div class="ov-timeline-date">{{ fmtDate(pt.date) }}</div>
                    </div>
                    <!-- Always show at least 5 empty stops so timeline looks populated -->
                    <template v-if="timelinePoints.length === 0">
                      <div v-for="n in 5" :key="`e${n}`" class="ov-timeline-pt">
                        <div class="ov-timeline-dot"></div>
                        <div class="ov-timeline-label ov-timeline-label--empty">—</div>
                        <div class="ov-timeline-date">—</div>
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <!-- Employment Dates (inline edit) -->
              <div class="ov-lc-dates-col">
                <div class="ov-lc-dates-hdr">
                  <div class="ov-lc-subtitle">Employment Dates</div>
                  <div class="ov-card-acts">
                    <template v-if="canEditUser && !editingLcDates">
                      <button class="ov-btn-edit" type="button" @click="startEditLcDates">Edit</button>
                    </template>
                    <template v-else-if="editingLcDates">
                      <button class="ov-btn-save" type="button" :disabled="savingLcDates" @click="saveLcDates">{{ savingLcDates ? 'Saving…' : 'Save' }}</button>
                      <button class="ov-btn-cancel" type="button" @click="cancelEditLcDates">Cancel</button>
                    </template>
                  </div>
                </div>
                <div v-if="lcDatesSaveError" class="ov-err">{{ lcDatesSaveError }}</div>
                <div class="ov-lc-dates-grid">
                  <template v-if="!editingLcDates">
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">Offer Accepted Date</span><input type="text" :value="fmtDate(lifecycle.dates?.offer_accepted_date) || ''" readonly class="ov-date-input ov-date-input--ro" placeholder="mm/dd/yyyy"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">Start Date</span><input type="text" :value="fmtDate(lifecycle.summary?.startDate) || ''" readonly class="ov-date-input ov-date-input--ro" placeholder="mm/dd/yyyy"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">First Client Date</span><input type="text" :value="fmtDate(lifecycle.summary?.firstClientDate) || ''" readonly class="ov-date-input ov-date-input--ro" placeholder="mm/dd/yyyy"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">TherapyNotes Training Date</span><input type="text" :value="fmtDate(lifecycle.dates?.therapy_notes_training_date) || ''" readonly class="ov-date-input ov-date-input--ro" placeholder="mm/dd/yyyy"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">First Payroll Submission</span><input type="text" :value="fmtDate(lifecycle.dates?.first_payroll_submission_date) || ''" readonly class="ov-date-input ov-date-input--ro" placeholder="mm/dd/yyyy"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">TherapyNotes Login</span><input type="text" :value="fmtDate(lifecycle.dates?.orientation_date) || ''" readonly class="ov-date-input ov-date-input--ro" placeholder="mm/dd/yyyy"/></div>
                  </template>
                  <template v-else>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">Offer Accepted Date</span><input type="date" v-model="lcDatesDraft.offer_accepted_date" class="ov-date-input"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">Start Date</span><input type="date" v-model="lcDatesDraft.start_date" class="ov-date-input"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">First Client Date</span><input type="date" v-model="lcDatesDraft.first_client_date" class="ov-date-input"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">TherapyNotes Training Date</span><input type="date" v-model="lcDatesDraft.therapy_notes_training_date" class="ov-date-input"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">First Payroll Submission</span><input type="date" v-model="lcDatesDraft.first_payroll_submission_date" class="ov-date-input"/></div>
                    <div class="ov-lc-date-row"><span class="ov-lc-date-label">TherapyNotes Login</span><input type="date" v-model="lcDatesDraft.orientation_date" class="ov-date-input"/></div>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Row 4: Supervisor Assignments | Permissions | Activity ─── -->
          <div class="ov-three-col">

            <!-- Supervisor Assignments -->
            <div class="ov-card">
              <div class="ov-card-hdr">
                <span class="ov-card-title">Supervisor Assignments</span>
                <button v-if="canManageAssignments" class="ov-btn-edit" type="button" @click="$emit('navigate', 'account')">Edit</button>
              </div>
              <div v-if="supervisorsLoading" class="ov-loading-sm">Loading…</div>
              <div v-else-if="supervisors.length === 0" class="ov-empty-sm">No supervisors assigned.</div>
              <template v-else>
                <table class="ov-sv-table">
                  <thead>
                    <tr><th>Supervisor</th><th>Type</th><th>Agency</th><th>Primary</th><th>Assigned</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="sv in supervisors" :key="sv.id">
                      <td>
                        <div class="ov-sv-cell-name">
                          <div class="ov-av-sm ov-av-sm--teal">{{ initials(sv.supervisor_first_name, sv.supervisor_last_name) }}</div>
                          <div>
                            <div class="ov-sv-name">{{ sv.supervisor_first_name }} {{ sv.supervisor_last_name }}</div>
                          </div>
                        </div>
                      </td>
                      <td class="ov-sv-td">{{ supervisorTypeLabel(sv.supervisor_type) }}</td>
                      <td class="ov-sv-td">{{ sv.agency_name || '—' }}</td>
                      <td class="ov-sv-td"><span v-if="sv.is_primary" class="ov-sv-yes">Yes</span><span v-else>—</span></td>
                      <td class="ov-sv-td ov-sv-date">{{ fmtShortDate(sv.assigned_at || sv.created_at) }}</td>
                    </tr>
                  </tbody>
                </table>
              </template>
              <button v-if="canManageAssignments" class="ov-add-link" type="button" @click="$emit('navigate', 'account')">+ Add Supervisor Assignment</button>
            </div>

            <!-- Access & Permissions -->
            <div class="ov-card">
              <div class="ov-card-hdr">
                <span class="ov-card-title">Access &amp; Permissions</span>
                <div class="ov-card-acts">
                  <template v-if="canEditUser && !editingPerms">
                    <button class="ov-btn-edit" type="button" @click="startEditPerms">Edit</button>
                  </template>
                  <template v-else-if="editingPerms">
                    <button class="ov-btn-save" type="button" :disabled="savingPerms" @click="savePerms">{{ savingPerms ? 'Saving…' : 'Save' }}</button>
                    <button class="ov-btn-cancel" type="button" @click="cancelEditPerms">Cancel</button>
                  </template>
                </div>
              </div>
              <div v-if="permsSaveError" class="ov-err">{{ permsSaveError }}</div>
              <div v-if="!ai" class="ov-loading-sm">Loading…</div>
              <div v-else class="ov-perms-list">
                <div v-for="perm in permToggles" :key="perm.key" class="ov-perm-row">
                  <div class="ov-perm-info">
                    <span class="ov-perm-label">{{ perm.label }}</span>
                    <span v-if="perm.sub" class="ov-perm-sub">{{ perm.sub }}</span>
                  </div>
                  <label class="ov-toggle">
                    <input
                      type="checkbox"
                      class="ov-toggle-inp"
                      :checked="editingPerms ? permsDraft[perm.key] : ai[perm.key]"
                      :disabled="!editingPerms"
                      @change="editingPerms && (permsDraft[perm.key] = $event.target.checked)"
                    />
                    <span class="ov-toggle-track"><span class="ov-toggle-thumb"></span></span>
                  </label>
                </div>
                <button class="ov-show-all" type="button" @click="$emit('navigate', 'account', 'access-permissions')">Show all permissions</button>
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="ov-card">
              <div class="ov-card-hdr">
                <span class="ov-card-title">Recent Activity</span>
                <button v-if="canViewActivityLog" class="ov-btn-viewall" type="button" @click="$emit('navigate', 'activity')">View All</button>
              </div>
              <div v-if="activityLoading" class="ov-loading-sm">Loading…</div>
              <div v-else-if="recentActivity.length === 0" class="ov-empty-sm">No recent activity.</div>
              <div v-else class="ov-activity-list">
                <div v-for="item in recentActivity" :key="item.id" class="ov-activity-row">
                  <div :class="['ov-act-icon', `ov-act-icon--${activityIconType(item)}`]">
                    <svg v-if="activityIconType(item) === 'doc'" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
                    <svg v-else-if="activityIconType(item) === 'msg'" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/><path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/></svg>
                    <svg v-else-if="activityIconType(item) === 'task'" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                    <svg v-else-if="activityIconType(item) === 'train'" viewBox="0 0 20 20" fill="currentColor"><path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84l7 3a1 1 0 00.788 0l7-3a1 1 0 000-1.84l-7-3zM17 8.414l-7 3-7-3V13a7 7 0 0014 0V8.414z"/></svg>
                    <svg v-else viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clip-rule="evenodd"/></svg>
                  </div>
                  <div class="ov-act-body">
                    <div class="ov-act-label">{{ item.action_label || formatActionType(item.action_type) }}</div>
                    <div class="ov-act-time">{{ fmtRelative(item.created_at) }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Row 5: Recent Docs | Upcoming & Overdue | Notes ──────── -->
          <div class="ov-three-col" ref="notesRef">

            <!-- Recent Documents -->
            <div class="ov-card">
              <div class="ov-card-hdr">
                <span class="ov-card-title">Recent Documents</span>
                <button class="ov-btn-viewall" type="button" @click="$emit('navigate', 'documents')">View All</button>
              </div>
              <div v-if="tasksLoading" class="ov-loading-sm">Loading…</div>
              <div v-else-if="recentDocs.length === 0" class="ov-empty-sm">No recent documents.</div>
              <div v-else class="ov-doc-list">
                <div v-for="doc in recentDocs" :key="doc.id" class="ov-doc-row">
                  <div class="ov-doc-icon">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
                  </div>
                  <div class="ov-doc-body">
                    <div class="ov-doc-name">{{ doc.title }}</div>
                    <div class="ov-doc-meta">
                      {{ doc.completed_at ? 'Signed' : 'Uploaded' }} {{ fmtDate(doc.completed_at || doc.created_at) }}
                      <span class="ov-pdf-badge">PDF</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Upcoming & Overdue -->
            <div class="ov-card">
              <div class="ov-card-hdr">
                <span class="ov-card-title">Upcoming &amp; Overdue</span>
                <button class="ov-btn-viewall" type="button" @click="$emit('navigate', 'training')">View All</button>
              </div>
              <div v-if="tasksLoading" class="ov-loading-sm">Loading…</div>
              <div v-else-if="upcomingOverdueTasks.length === 0" class="ov-empty-sm">No upcoming or overdue items.</div>
              <div v-else class="ov-tasks-list">
                <div v-for="task in upcomingOverdueTasks" :key="task.id" class="ov-task-row">
                  <span :class="['ov-task-badge', isOverdue(task) ? 'ov-task-badge--overdue' : 'ov-task-badge--soon']">
                    {{ isOverdue(task) ? 'Overdue' : 'Due Soon' }}
                  </span>
                  <div class="ov-task-body">
                    <div class="ov-task-name">{{ task.title }}</div>
                    <div class="ov-task-due">Due {{ fmtDate(task.due_date || task.dueDate) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div class="ov-card">
              <div class="ov-card-hdr">
                <span class="ov-card-title">Notes</span>
                <button v-if="canEditUser" class="ov-btn-addnote" type="button" @click="showNoteComposer = !showNoteComposer">+ Add Note</button>
              </div>

              <div v-if="showNoteComposer" class="ov-note-composer">
                <textarea v-model="newNoteText" class="ov-note-ta" rows="3" placeholder="Add a note…" autofocus />
                <div class="ov-note-acts">
                  <button class="ov-btn-save" type="button" :disabled="noteSaving || !newNoteText.trim()" @click="saveNote">{{ noteSaving ? 'Saving…' : 'Save Note' }}</button>
                  <button class="ov-btn-cancel" type="button" @click="showNoteComposer = false; newNoteText = ''">Cancel</button>
                </div>
                <div v-if="noteSaveError" class="ov-err">{{ noteSaveError }}</div>
              </div>

              <div v-if="notesLoading" class="ov-loading-sm">Loading…</div>
              <div v-else-if="notes.length === 0 && !showNoteComposer" class="ov-empty-sm">No notes yet.</div>
              <div v-else class="ov-notes-list">
                <div v-for="note in notes" :key="note.id" class="ov-note-item">
                  <div class="ov-note-hdr">
                    <span class="ov-note-author">{{ note.author_first_name }} {{ note.author_last_name }}</span>
                    <span class="ov-note-time">{{ fmtRelative(note.created_at) }}</span>
                  </div>
                  <p class="ov-note-text">{{ note.message }}</p>
                </div>
              </div>
              <button v-if="canEditUser && !showNoteComposer" class="ov-add-note-footer" type="button" @click="showNoteComposer = true">+ Add Note</button>
            </div>
          </div>

        </main>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, inject, watch, nextTick } from 'vue';
import api from '../../services/api';
import AcceptedInsuranceBadges from './AcceptedInsuranceBadges.vue';
import { supervisorTypeLabel } from '../../constants/supervisorTypes.js';
import { useAuthStore } from '../../store/auth';

const refreshOverview = inject('refreshProfileOverview', null);
const authStore = useAuthStore();

const props = defineProps({
  userId: { type: Number, required: true },
  user: { type: Object, required: true },
  canEditUser: { type: Boolean, default: false },
  canViewLifecycleTab: { type: Boolean, default: false },
  canViewCredentialingTab: { type: Boolean, default: false },
  canManageAssignments: { type: Boolean, default: false },
  canViewActivityLog: { type: Boolean, default: false },
  canViewPayroll: { type: Boolean, default: false },
  agencyId: { type: [Number, String], default: null },
  preloadedOverview: { type: Object, default: null },
  preloadedOverviewLoading: { type: Boolean, default: false },
});

const emit = defineEmits(['navigate', 'perms-saved']);

// ─── State ───────────────────────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref('');
const tasksLoading = ref(false);
const supervisorsLoading = ref(false);
const activityLoading = ref(false);
const notesLoading = ref(false);
const affiliations = ref([]);
const affiliationsLoading = ref(false);

const ai = ref(null);
const lifecycle = ref(null);
const allTasks = ref([]);
const supervisors = ref([]);
const recentActivity = ref([]);
const notes = ref([]);
const acceptedInsurances = ref([]);

const notesRef = ref(null);
const showNoteComposer = ref(false);
const newNoteText = ref('');
const noteSaving = ref(false);
const noteSaveError = ref('');

// ─── Inline edit: Personal ───────────────────────────────────────────────────
const editingPersonal = ref(false);
const savingPersonal = ref(false);
const personalSaveError = ref('');
const personalDraft = ref({});

const startEditPersonal = () => {
  personalDraft.value = {
    preferredName: ai.value?.preferredName || props.user?.preferred_name || '',
    personalEmail: ai.value?.personalEmail || props.user?.personal_email || '',
    phoneNumber: ai.value?.phoneNumber || props.user?.phone_number || '',
    personalPhone: ai.value?.personalPhone || props.user?.personal_phone || '',
    homeStreetAddress: ai.value?.homeStreetAddress || '',
    homeAddressLine2: ai.value?.homeAddressLine2 || '',
    homeCity: ai.value?.homeCity || '',
    homeState: ai.value?.homeState || '',
    homePostalCode: ai.value?.homePostalCode || '',
    languagesSpoken: ai.value?.languagesSpoken || props.user?.languages_spoken || '',
    serviceFocus: ai.value?.serviceFocus || props.user?.service_focus || '',
  };
  personalSaveError.value = '';
  editingPersonal.value = true;
};
const cancelEditPersonal = () => { editingPersonal.value = false; };
const savePersonal = async () => {
  savingPersonal.value = true;
  personalSaveError.value = '';
  try {
    await api.put(`/users/${props.userId}`, {
      preferredName: personalDraft.value.preferredName || null,
      personalEmail: personalDraft.value.personalEmail || null,
      phoneNumber: personalDraft.value.phoneNumber || null,
      personalPhone: personalDraft.value.personalPhone || null,
      homeStreetAddress: personalDraft.value.homeStreetAddress || null,
      homeAddressLine2: personalDraft.value.homeAddressLine2 || null,
      homeCity: personalDraft.value.homeCity || null,
      homeState: personalDraft.value.homeState || null,
      homePostalCode: personalDraft.value.homePostalCode || null,
      languagesSpoken: personalDraft.value.languagesSpoken || null,
      serviceFocus: personalDraft.value.serviceFocus || null,
    });
    if (ai.value) ai.value = { ...ai.value, ...personalDraft.value };
    editingPersonal.value = false;
    if (refreshOverview) void refreshOverview();
  } catch (err) {
    personalSaveError.value = err.response?.data?.error?.message || 'Failed to save.';
  } finally {
    savingPersonal.value = false;
  }
};

// ─── Inline edit: Job ────────────────────────────────────────────────────────
const editingJob = ref(false);
const savingJob = ref(false);
const jobSaveError = ref('');
const jobDraft = ref({});

const startEditJob = () => {
  jobDraft.value = {
    title: props.user?.title || '',
    department: props.user?.department || '',
    employmentType: props.user?.employment_type || props.user?.employmentType || '',
    workLocation: props.user?.work_location || '',
  };
  jobSaveError.value = '';
  editingJob.value = true;
};
const cancelEditJob = () => { editingJob.value = false; };
const saveJob = async () => {
  savingJob.value = true;
  jobSaveError.value = '';
  try {
    await api.put(`/users/${props.userId}`, {
      title: jobDraft.value.title || null,
      department: jobDraft.value.department || null,
      employmentType: jobDraft.value.employmentType || null,
      workLocation: jobDraft.value.workLocation || null,
    });
    editingJob.value = false;
    if (refreshOverview) void refreshOverview();
  } catch (err) {
    jobSaveError.value = err.response?.data?.error?.message || 'Failed to save.';
  } finally {
    savingJob.value = false;
  }
};

// ─── Inline edit: Lifecycle dates ────────────────────────────────────────────
const editingLcDates = ref(false);
const savingLcDates = ref(false);
const lcDatesSaveError = ref('');
const lcDatesDraft = ref({});

const toDateInput = (raw) => {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d)) return '';
  return d.toISOString().slice(0, 10);
};

const startEditLcDates = () => {
  const dates = lifecycle.value?.dates || {};
  const summary = lifecycle.value?.summary || {};
  lcDatesDraft.value = {
    offer_accepted_date: toDateInput(dates.offer_accepted_date),
    start_date: toDateInput(summary.startDate),
    first_client_date: toDateInput(summary.firstClientDate),
    therapy_notes_training_date: toDateInput(dates.therapy_notes_training_date),
    first_payroll_submission_date: toDateInput(dates.first_payroll_submission_date),
    orientation_date: toDateInput(dates.orientation_date),
  };
  lcDatesSaveError.value = '';
  editingLcDates.value = true;
};
const cancelEditLcDates = () => { editingLcDates.value = false; };
const saveLcDates = async () => {
  savingLcDates.value = true;
  lcDatesSaveError.value = '';
  try {
    await api.patch(`/users/${props.userId}/lifecycle/dates`, {
      offer_accepted_date: lcDatesDraft.value.offer_accepted_date || null,
      start_date: lcDatesDraft.value.start_date || null,
      first_client_date: lcDatesDraft.value.first_client_date || null,
      therapy_notes_training_date: lcDatesDraft.value.therapy_notes_training_date || null,
      first_payroll_submission_date: lcDatesDraft.value.first_payroll_submission_date || null,
      orientation_date: lcDatesDraft.value.orientation_date || null,
    });
    await fetchLifecycle().catch(() => {});
    editingLcDates.value = false;
    if (refreshOverview) void refreshOverview();
  } catch (err) {
    lcDatesSaveError.value = err.response?.data?.error?.message || 'Failed to save lifecycle dates.';
  } finally {
    savingLcDates.value = false;
  }
};

// ─── Inline edit: Permissions ────────────────────────────────────────────────
const editingPerms = ref(false);
const savingPerms = ref(false);
const permsSaveError = ref('');
const permsDraft = ref({});

const permToggles = [
  { key: 'companyCardEnabled', label: 'Company Card' },
  { key: 'companyCarSubmitAccess', label: 'Company Car Submit' },
  { key: 'companyCarManageAccess', label: 'Company Car Manage' },
  { key: 'skillBuilderEligible', label: 'Skill Development Program Eligible' },
  { key: 'hasPayrollAccess', label: 'Payroll Access' },
  { key: 'hasCredentialingAccess', label: 'Credentialing Access' },
  { key: 'isHourlyWorker', label: 'Hourly Workers' },
];

const startEditPerms = () => {
  permsDraft.value = Object.fromEntries(permToggles.map((p) => [p.key, ai.value?.[p.key] ?? false]));
  permsSaveError.value = '';
  editingPerms.value = true;
};
const cancelEditPerms = () => { editingPerms.value = false; };
const savePerms = async () => {
  savingPerms.value = true;
  permsSaveError.value = '';
  try {
    await api.put(`/users/${props.userId}`, Object.fromEntries(permToggles.map((p) => [p.key, permsDraft.value[p.key]])));
    if (ai.value) ai.value = { ...ai.value, ...permsDraft.value };
    editingPerms.value = false;
    emit('perms-saved', { ...permsDraft.value });
    if (refreshOverview) void refreshOverview();
    // If granting/revoking own access, refresh session caps so nav/route gates update immediately.
    if (Number(authStore.user?.id || 0) === Number(props.userId || 0)) {
      try {
        await authStore.refreshUser();
      } catch {
        // ignore
      }
    }
  } catch (err) {
    permsSaveError.value = err.response?.data?.error?.message || 'Failed to save permissions.';
  } finally {
    savingPerms.value = false;
  }
};

// ─── Derived ─────────────────────────────────────────────────────────────────
const summary = computed(() => {
  const now = new Date();
  const pending = allTasks.value.filter((t) => t.status === 'pending').length;
  const inProgress = allTasks.value.filter((t) => t.status === 'in_progress').length;
  const withDue = allTasks.value.filter((t) => {
    const d = t.due_date || t.dueDate;
    return d && (t.status === 'pending' || t.status === 'in_progress');
  });
  const overdue = withDue.filter((t) => new Date(t.due_date || t.dueDate) < now).length;
  const upcoming = withDue.filter((t) => {
    const d = new Date(t.due_date || t.dueDate);
    return d >= now && d <= new Date(now.getTime() + 30 * 86400000);
  }).length;
  const docTasks = allTasks.value.filter((t) => t.task_type === 'document' || t.taskType === 'document');
  return { pendingTaskCount: pending, inProgressTaskCount: inProgress, overdueTaskCount: overdue, upcomingTaskCount: upcoming, recentDocCount: docTasks.length };
});

const recentDocs = computed(() =>
  allTasks.value.filter((t) => t.task_type === 'document' || t.taskType === 'document').slice(0, 5)
);

const upcomingOverdueTasks = computed(() =>
  allTasks.value
    .filter((t) => {
      const d = t.due_date || t.dueDate;
      return d && (t.status === 'pending' || t.status === 'in_progress');
    })
    .sort((a, b) => new Date(a.due_date || a.dueDate) - new Date(b.due_date || b.dueDate))
    .slice(0, 5)
);

const formattedAddress = computed(() => {
  if (!ai.value) return '';
  const { homeStreetAddress, homeAddressLine2, homeCity, homeState, homePostalCode } = ai.value;
  return [homeStreetAddress, homeAddressLine2, [homeCity, homeState].filter(Boolean).join(', '), homePostalCode].filter(Boolean).join('\n');
});

const managerName = computed(() => {
  const u = props.user;
  if (u.manager_first_name && u.manager_last_name) return `${u.manager_first_name} ${u.manager_last_name}`;
  return u.manager_name || null;
});

const primarySupervisorName = computed(() => {
  const sv = supervisors.value.find((s) => s.is_primary) || supervisors.value[0];
  return sv ? `${sv.supervisor_first_name} ${sv.supervisor_last_name}` : null;
});

const employmentTypeLabel = computed(() => {
  const raw = props.user?.employment_type || props.user?.employmentType || '';
  return { full_time: 'Full-Time', part_time: 'Part-Time', contractor: 'Contractor', intern: 'Intern', per_diem: 'Per Diem' }[raw] || raw || '—';
});

const lcStatusLabel = computed(() => {
  const s = lifecycle.value?.summary?.status || props.user?.status || '';
  return { active: 'Active', pending: 'Pending Setup', prehire_open: 'Pre-Hire Open', prehire_review: 'Pre-Hire Review', onboarding: 'Onboarding', terminated: 'Terminated', inactive: 'Inactive' }[s] || s || '—';
});

const lcStatusBadgeClass = computed(() => {
  const s = lifecycle.value?.summary?.status || props.user?.status || '';
  if (s === 'active') return 'ov-status--active';
  if (s === 'terminated' || s === 'inactive') return 'ov-status--inactive';
  if (s === 'onboarding') return 'ov-status--onboarding';
  return 'ov-status--pending';
});

const timelinePoints = computed(() => {
  const summary = lifecycle.value?.summary || {};
  const now = new Date();
  return [
    { label: 'Hire Date', date: props.user?.hire_date },
    { label: 'Start Date', date: summary.startDate },
    { label: 'First Client Date', date: summary.firstClientDate },
    { label: 'Last Day Worked', date: summary.lastDayWorked },
    { label: 'Termination Date', date: summary.terminationDate },
  ].filter((p) => p.date).map((p) => ({ ...p, active: new Date(p.date) <= now }));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (raw) => {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d)) return String(raw);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

const fmtShortDate = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

const fmtRelative = (raw) => {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d)) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Today at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return `Yesterday at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const initials = (first, last) =>
  `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';

const avatarInitials = (first, last, fallback) => {
  if (first || last) return initials(first, last);
  const parts = String(fallback || '').split(' ');
  return initials(parts[0], parts[1] || '');
};

const isOverdue = (task) => {
  const d = task.due_date || task.dueDate;
  return d && new Date(d) < new Date();
};

const formatActionType = (type) =>
  String(type || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const orgTypeLabel = (type) => {
  const t = String(type || '').toLowerCase();
  if (t === 'school') return 'School';
  if (t === 'program') return 'Program';
  if (t === 'agency') return 'Agency';
  if (t === 'affiliation') return 'Affiliation';
  return type ? String(type).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Organization';
};

const activityIconType = (item) => {
  const t = String(item.action_type || item.log_type || '').toLowerCase();
  if (t.includes('document') || t.includes('upload') || t.includes('pdf')) return 'doc';
  if (t.includes('message') || t.includes('sms') || t.includes('email') || t.includes('comm')) return 'msg';
  if (t.includes('task') || t.includes('checklist') || t.includes('complete')) return 'task';
  if (t.includes('training') || t.includes('module') || t.includes('track')) return 'train';
  return 'profile';
};

const openNoteComposer = async () => {
  showNoteComposer.value = true;
  await nextTick();
  notesRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ─── Data fetching ────────────────────────────────────────────────────────────
const fetchAccountInfo = async () => {
  const res = await api.get(`/users/${props.userId}/account-info`);
  ai.value = res.data;
};

const fetchLifecycle = async () => {
  const res = await api.get(`/users/${props.userId}/lifecycle`);
  lifecycle.value = res.data;
};

const fetchTasks = async () => {
  tasksLoading.value = true;
  try {
    const res = await api.get('/tasks/all', { params: { assignedToUserId: props.userId } });
    allTasks.value = Array.isArray(res.data) ? res.data : (res.data?.tasks || []);
  } finally {
    tasksLoading.value = false;
  }
};

const fetchSupervisors = async () => {
  supervisorsLoading.value = true;
  try {
    const res = await api.get(`/supervisor-assignments/supervisee/${props.userId}`);
    supervisors.value = Array.isArray(res.data) ? res.data : [];
  } finally {
    supervisorsLoading.value = false;
  }
};

const fetchActivity = async () => {
  activityLoading.value = true;
  try {
    const params = { limit: 8 };
    if (props.agencyId) params.agencyId = props.agencyId;
    const res = await api.get(`/activity-log/user/${props.userId}`, { params });
    recentActivity.value = (Array.isArray(res.data) ? res.data : []).slice(0, 8);
  } catch {
    recentActivity.value = [];
  } finally {
    activityLoading.value = false;
  }
};

const fetchNotes = async () => {
  notesLoading.value = true;
  try {
    const params = {};
    if (props.agencyId) params.agencyId = props.agencyId;
    const res = await api.get(`/hiring/candidates/${props.userId}`, { params });
    notes.value = Array.isArray(res.data?.notes) ? res.data.notes : [];
  } catch {
    notes.value = [];
  } finally {
    notesLoading.value = false;
  }
};

const fetchAffiliations = async () => {
  affiliationsLoading.value = true;
  try {
    const res = await api.get('/provider-self/affiliations', { params: { providerUserId: props.userId } });
    affiliations.value = res.data?.affiliations || [];
  } catch {
    affiliations.value = [];
  } finally {
    affiliationsLoading.value = false;
  }
};

const saveNote = async () => {
  const text = newNoteText.value.trim();
  if (!text) return;
  noteSaving.value = true;
  noteSaveError.value = '';
  try {
    const params = {};
    if (props.agencyId) params.agencyId = props.agencyId;
    await api.post(`/hiring/candidates/${props.userId}/notes`, { message: text }, { params });
    newNoteText.value = '';
    showNoteComposer.value = false;
    await fetchNotes();
  } catch (err) {
    noteSaveError.value = err.response?.data?.error?.message || 'Failed to save note.';
  } finally {
    noteSaving.value = false;
  }
};

// ─── Mount ────────────────────────────────────────────────────────────────────
const applyPreloaded = (data) => {
  if (!data || typeof data !== 'object') return false;
  const hasPayload = !!(data.accountInfo || data.lifecycle || data.tasks || data.supervisors || data.recentActivity || data.notes);
  if (!hasPayload) return false;
  if (data.accountInfo) ai.value = data.accountInfo;
  if (data.lifecycle) lifecycle.value = data.lifecycle;
  if (data.tasks) {
    allTasks.value = [...(data.tasks.recentDocs || []), ...(data.tasks.upcomingOverdue || [])];
  }
  if (data.supervisors) supervisors.value = data.supervisors;
  if (data.recentActivity) recentActivity.value = data.recentActivity;
  if (data.notes) notes.value = data.notes;
  if (data.acceptedInsurances) acceptedInsurances.value = data.acceptedInsurances;
  return true;
};

const loadOverviewData = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    if (props.preloadedOverview && applyPreloaded(props.preloadedOverview)) {
      await Promise.all([
        fetchTasks().catch(() => {}),
        fetchAffiliations().catch(() => {}),
      ]);
    } else {
      await Promise.all([
        fetchAccountInfo().catch(() => {}),
        props.canViewLifecycleTab ? fetchLifecycle().catch(() => {}) : Promise.resolve(),
        fetchTasks(),
        fetchSupervisors(),
        props.canViewActivityLog ? fetchActivity() : Promise.resolve(),
        fetchNotes(),
        fetchAffiliations().catch(() => {}),
      ]);
    }
  } catch (err) {
    loadError.value = 'Failed to load overview. Please refresh.';
    console.error('[UserOverviewTab]', err);
  } finally {
    loading.value = false;
  }
};

onMounted(() => { void loadOverviewData(); });

watch(
  () => props.preloadedOverview,
  (data) => {
    if (data && applyPreloaded(data) && !loading.value) {
      void Promise.all([
        fetchTasks().catch(() => {}),
        fetchAffiliations().catch(() => {}),
      ]);
    }
  }
);
</script>

<style scoped>
/* ─── Root ─────────────────────────────────────────────────────────────────── */
.ov-root {
  /* Inherit white from .tab-content — avoid gray bleed in empty areas */
  background: transparent;
}

.ov-full-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 20px;
  color: #6b7280;
  font-size: 14px;
}
.ov-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e5e7eb;
  border-top-color: var(--primary, #059669);
  border-radius: 50%;
  animation: ov-spin 0.7s linear infinite;
}
@keyframes ov-spin { to { transform: rotate(360deg); } }

.ov-full-error {
  padding: 20px;
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin: 20px;
}

/* ─── Layout ────────────────────────────────────────────────────────────────── */
.ov-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 0;
  min-height: 100%;
}

/* ─── SIDEBAR ───────────────────────────────────────────────────────────────── */
.ov-sidebar {
  background: #fff;
  border-right: 1px solid #e5e7eb;
  padding: 12px 0 24px;
  display: flex;
  flex-direction: column;
  gap: 0;
  position: sticky;
  top: 0;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  border-radius: 8px 0 0 8px;
}

/* Nav items */
.ov-nav {
  display: flex;
  flex-direction: column;
  padding: 0 0 8px;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 4px;
}
.ov-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: background 0.1s;
  border-radius: 0;
  user-select: none;
  position: relative;
}
.ov-nav-item:hover { background: #f9fafb; color: #111827; }
.ov-nav-item--active {
  color: var(--primary, #059669);
  font-weight: 600;
  background: #f0fdf4;
}
.ov-nav-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary, #059669);
  flex-shrink: 0;
}
.ov-nav-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.55;
}
.ov-nav-badge {
  margin-left: auto;
  background: #e5e7eb;
  color: #374151;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

/* Sidebar blocks */
.ov-sidebar-block {
  padding: 14px 16px 10px;
  border-top: 1px solid #f3f4f6;
}
.ov-sidebar-block-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af;
  margin-bottom: 8px;
}

/* Quick actions */
.ov-qa-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 0;
  background: none;
  border: none;
  font-size: 12.5px;
  color: #374151;
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
  transition: color 0.1s;
}
.ov-qa-btn svg { width: 14px; height: 14px; opacity: 0.6; flex-shrink: 0; }
.ov-qa-btn:hover { color: var(--primary, #059669); }
.ov-qa-btn:hover svg { opacity: 1; }

/* Direct chat */
.ov-chat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0 8px;
  cursor: pointer;
}
.ov-chat-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary, #059669);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.ov-chat-name { font-size: 13px; font-weight: 600; color: #111827; }
.ov-chat-status { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #6b7280; }
.ov-online-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; flex-shrink: 0; }
.ov-chat-start {
  width: 100%;
  padding: 6px 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 12px;
  color: #374151;
  cursor: pointer;
  text-align: center;
}
.ov-chat-start:hover { background: #f3f4f6; }

/* ─── MAIN CONTENT ─────────────────────────────────────────────────────────── */
.ov-main {
  padding: 0 0 0 4px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

/* ─── Metric cards ─────────────────────────────────────────────────────────── */
.ov-metric-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.ov-metric-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 18px;
  cursor: pointer;
  transition: box-shadow 0.15s;
  display: flex;
  flex-direction: column;
}
.ov-metric-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.ov-metric-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}
.ov-metric-label {
  font-size: 12.5px;
  color: #6b7280;
  line-height: 1.4;
}
.ov-metric-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.ov-metric-icon-wrap svg { width: 16px; height: 16px; }
.ov-metric-icon--msg { background: #eff6ff; color: #3b82f6; }
.ov-metric-icon--task { background: #ecfdf5; color: #059669; }
.ov-metric-icon--cal { background: #fff7ed; color: #f97316; }
.ov-metric-icon--doc { background: #fdf4ff; color: #a855f7; }

.ov-metric-num {
  font-size: 36px;
  font-weight: 700;
  color: #111827;
  line-height: 1;
  margin-bottom: 12px;
  flex: 1;
}
.ov-metric-num--warn { color: #dc2626; }
.ov-metric-divider { height: 1px; background: #f3f4f6; margin-bottom: 10px; }
.ov-metric-link {
  font-size: 12.5px;
  color: var(--primary, #059669);
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  text-align: left;
}

/* ─── Cards ──────────────────────────────────────────────────────────────────── */
.ov-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 18px 20px;
}
.ov-card-hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.ov-card-title {
  font-size: 14.5px;
  font-weight: 700;
  color: #111827;
}
.ov-card-acts {
  display: flex;
  gap: 6px;
  align-items: center;
}

/* Buttons */
.ov-btn-edit {
  font-size: 12px;
  color: #6b7280;
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}
.ov-btn-edit:hover { background: #f3f4f6; color: #374151; }
.ov-btn-save {
  font-size: 12px;
  background: var(--primary, #059669);
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 4px 12px;
  cursor: pointer;
}
.ov-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.ov-btn-cancel {
  font-size: 12px;
  background: #f3f4f6;
  color: #374151;
  border: none;
  border-radius: 5px;
  padding: 4px 10px;
  cursor: pointer;
}
.ov-btn-viewall {
  font-size: 12px;
  color: var(--primary, #059669);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
}
.ov-btn-addnote {
  font-size: 12px;
  color: var(--primary, #059669);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 0;
  font-weight: 500;
}
.ov-err { font-size: 12px; color: #dc2626; margin-bottom: 8px; }
.ov-loading-sm { font-size: 13px; color: #9ca3af; padding: 8px 0; }
.ov-empty-sm { font-size: 13px; color: #9ca3af; padding: 8px 0; }

/* ─── Field list (Personal / Job) ────────────────────────────────────────── */
.ov-field-list { display: flex; flex-direction: column; }
.ov-field-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid #f9fafb;
  font-size: 13px;
}
.ov-field-row:last-child { border-bottom: none; }
.ov-fl {
  color: #6b7280;
  min-width: 110px;
  flex-shrink: 0;
  line-height: 1.5;
}
.ov-fv {
  color: #111827;
  text-align: right;
  white-space: pre-line;
  flex: 1;
}
.ov-fv--avatar {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

/* Avatar chips */
.ov-av-xs {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #374151;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}
.ov-av-xs--teal { background: #d1fae5; color: #065f46; }
.ov-av-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #374151;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}
.ov-av-sm--teal { background: #d1fae5; color: #065f46; }

/* Inline edit form */
.ov-edit-grid { display: flex; flex-direction: column; gap: 8px; }
.ov-eg-row { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.ov-eg-row .ov-fl { min-width: 110px; }
.ov-input {
  flex: 1;
  padding: 5px 9px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 13px;
  color: #111827;
  background: #fff;
}
.ov-input:focus { outline: none; border-color: var(--primary, #059669); box-shadow: 0 0 0 2px rgba(5,150,105,0.1); }

/* ─── Two-col / Three-col grids ──────────────────────────────────────────── */
.ov-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.ov-three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; }

/* ─── Lifecycle ──────────────────────────────────────────────────────────── */
.ov-lc-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.ov-lc-field { display: flex; flex-direction: column; gap: 3px; }
.ov-lc-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; }
.ov-lc-val { font-size: 13px; color: #111827; font-weight: 500; }
.ov-lc-note { font-size: 11px; color: #9ca3af; }

.ov-status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.ov-status--active { background: #d1fae5; color: #065f46; }
.ov-status--inactive { background: #fee2e2; color: #991b1b; }
.ov-status--onboarding { background: #dbeafe; color: #1e40af; }
.ov-status--pending { background: #fef3c7; color: #92400e; }

.ov-lc-bottom {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.ov-lc-subtitle {
  font-size: 12px;
  font-weight: 700;
  color: #374151;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Timeline */
.ov-timeline-wrap { position: relative; overflow-x: auto; }
.ov-timeline-line {
  position: absolute;
  top: 7px;
  left: 7px;
  right: 7px;
  height: 2px;
  background: #e5e7eb;
}
.ov-timeline-points {
  display: flex;
  gap: 0;
  position: relative;
  z-index: 1;
  min-width: max-content;
}
.ov-timeline-pt {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px;
  min-width: 90px;
}
.ov-timeline-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e5e7eb;
  border: 2px solid #d1d5db;
  margin-bottom: 6px;
  flex-shrink: 0;
}
.ov-timeline-dot--on { background: var(--primary, #059669); border-color: var(--primary, #059669); }
.ov-timeline-label {
  font-size: 10.5px;
  color: #6b7280;
  text-align: center;
  white-space: nowrap;
}
.ov-timeline-label--empty { color: #d1d5db; }
.ov-timeline-date { font-size: 10.5px; font-weight: 600; color: #374151; text-align: center; white-space: nowrap; }

/* Employment dates */
.ov-lc-dates-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.ov-lc-dates-grid { display: flex; flex-direction: column; gap: 4px; }
.ov-lc-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}
.ov-lc-date-label { color: #6b7280; min-width: 160px; flex-shrink: 0; }
.ov-date-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  font-size: 12.5px;
  color: #111827;
  background: #fff;
}
.ov-date-input--ro { background: #f9fafb; color: #374151; border-color: #f3f4f6; }
.ov-date-input:focus { outline: none; border-color: var(--primary, #059669); }

/* ─── Supervisor table ───────────────────────────────────────────────────── */
.ov-sv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  margin-bottom: 8px;
}
.ov-sv-table thead tr { border-bottom: 1px solid #e5e7eb; }
.ov-sv-table th {
  text-align: left;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9ca3af;
  padding: 6px 4px;
}
.ov-sv-table tbody tr { border-bottom: 1px solid #f9fafb; }
.ov-sv-table tbody tr:last-child { border-bottom: none; }
.ov-sv-table td { padding: 8px 4px; }
.ov-sv-cell-name { display: flex; align-items: center; gap: 8px; }
.ov-sv-name { font-weight: 600; color: #111827; line-height: 1.2; }
.ov-sv-td { color: #374151; }
.ov-sv-date { color: #6b7280; }
.ov-sv-yes { background: #d1fae5; color: #065f46; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
.ov-add-link {
  background: none;
  border: none;
  color: var(--primary, #059669);
  font-size: 12.5px;
  cursor: pointer;
  padding: 2px 0;
  margin-top: 4px;
}

/* ─── Permissions / toggles ──────────────────────────────────────────────── */
.ov-perms-list { display: flex; flex-direction: column; }
.ov-perm-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f9fafb;
  font-size: 13px;
}
.ov-perm-row:last-of-type { border-bottom: none; }
.ov-perm-info { flex: 1; }
.ov-perm-label { color: #374151; line-height: 1.4; }
.ov-perm-sub { font-size: 11px; color: #9ca3af; }
.ov-show-all {
  background: none;
  border: none;
  color: var(--primary, #059669);
  font-size: 12px;
  cursor: pointer;
  padding: 8px 0 0;
  text-align: left;
}

/* CSS toggle switch */
.ov-toggle { display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0; }
.ov-toggle-inp { position: absolute; opacity: 0; width: 0; height: 0; }
.ov-toggle-track {
  width: 36px;
  height: 20px;
  background: #e5e7eb;
  border-radius: 999px;
  position: relative;
  transition: background 0.2s;
}
.ov-toggle-inp:checked + .ov-toggle-track { background: var(--primary, #059669); }
.ov-toggle-inp:disabled + .ov-toggle-track { opacity: 0.7; cursor: not-allowed; }
.ov-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: left 0.2s;
}
.ov-toggle-inp:checked + .ov-toggle-track .ov-toggle-thumb { left: 18px; }

/* ─── Activity ───────────────────────────────────────────────────────────── */
.ov-activity-list { display: flex; flex-direction: column; }
.ov-activity-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f9fafb;
}
.ov-activity-row:last-child { border-bottom: none; }
.ov-act-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.ov-act-icon svg { width: 14px; height: 14px; }
.ov-act-icon--doc { background: #fdf4ff; color: #a855f7; }
.ov-act-icon--msg { background: #eff6ff; color: #3b82f6; }
.ov-act-icon--task { background: #ecfdf5; color: #059669; }
.ov-act-icon--train { background: #fff7ed; color: #f97316; }
.ov-act-icon--profile { background: #f9fafb; color: #6b7280; }
.ov-act-label { font-size: 12.5px; color: #374151; font-weight: 500; line-height: 1.4; }
.ov-act-time { font-size: 11px; color: #9ca3af; margin-top: 2px; }

/* ─── Documents ──────────────────────────────────────────────────────────── */
.ov-doc-list { display: flex; flex-direction: column; }
.ov-doc-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f9fafb;
}
.ov-doc-row:last-child { border-bottom: none; }
.ov-doc-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #fdf4ff;
  color: #a855f7;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.ov-doc-icon svg { width: 14px; height: 14px; }
.ov-doc-name { font-size: 12.5px; color: #374151; font-weight: 500; line-height: 1.4; }
.ov-doc-meta { font-size: 11px; color: #9ca3af; display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.ov-pdf-badge {
  background: #fee2e2;
  color: #991b1b;
  border-radius: 3px;
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 5px;
  letter-spacing: 0.05em;
}

/* ─── Tasks / overdue ────────────────────────────────────────────────────── */
.ov-tasks-list { display: flex; flex-direction: column; }
.ov-task-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f9fafb;
}
.ov-task-row:last-child { border-bottom: none; }
.ov-task-badge {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  margin-top: 1px;
}
.ov-task-badge--overdue { background: #fee2e2; color: #991b1b; }
.ov-task-badge--soon { background: #fef3c7; color: #92400e; }
.ov-task-name { font-size: 12.5px; color: #374151; font-weight: 500; line-height: 1.4; }
.ov-task-due { font-size: 11px; color: #9ca3af; margin-top: 2px; }

/* ─── Notes ──────────────────────────────────────────────────────────────── */
.ov-notes-list { display: flex; flex-direction: column; }
.ov-note-item {
  padding: 10px 0;
  border-bottom: 1px solid #f9fafb;
}
.ov-note-item:last-child { border-bottom: none; }
.ov-note-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.ov-note-author { font-size: 12px; font-weight: 600; color: #374151; }
.ov-note-time { font-size: 11px; color: #9ca3af; }
.ov-note-text { margin: 0; font-size: 12.5px; color: #6b7280; line-height: 1.5; white-space: pre-wrap; }

.ov-note-composer {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.ov-note-ta {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  resize: vertical;
  color: #111827;
}
.ov-note-acts { display: flex; gap: 8px; margin-top: 8px; }
.ov-add-note-footer {
  background: none;
  border: none;
  color: var(--primary, #059669);
  font-size: 12.5px;
  cursor: pointer;
  padding: 8px 0 0;
  display: block;
  font-weight: 500;
}

/* ─── Affiliations ───────────────────────────────────────────────────────── */
.ov-affil-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.ov-affil-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fafafa;
}
.ov-affil-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #e5e7eb;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
}
.ov-affil-logo { width: 100%; height: 100%; object-fit: contain; }
.ov-affil-initials { font-size: 15px; font-weight: 700; color: #6b7280; }
.ov-affil-name { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.3; }
.ov-affil-type { font-size: 11px; color: #9ca3af; margin-top: 2px; }

/* ─── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 1200px) {
  .ov-three-col { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 1024px) {
  .ov-metric-row { grid-template-columns: repeat(2, 1fr); }
  .ov-lc-bottom { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .ov-layout { grid-template-columns: 1fr; }
  .ov-sidebar { position: static; max-height: none; flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom: 1px solid #e5e7eb; }
  .ov-nav { flex-direction: row; flex-wrap: wrap; border-bottom: none; }
  .ov-two-col { grid-template-columns: 1fr; }
  .ov-three-col { grid-template-columns: 1fr; }
}
</style>
