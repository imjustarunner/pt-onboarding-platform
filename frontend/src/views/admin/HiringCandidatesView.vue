<template>
  <div :class="embeddedDetailOnly ? 'hiring-root hiring-root--embedded' : 'container hiring-root'">
    <div v-if="!embeddedDetailOnly" class="header" data-tour="hiring-header">
      <div>
        <h2 data-tour="hiring-title">Applications</h2>
        <div class="subtle">Review applications and move candidates through hiring</div>
      </div>
      <div class="header-actions" data-tour="hiring-actions">
        <div v-if="canChooseAgency" class="agency-picker" data-tour="hiring-agency-picker">
          <label class="agency-label">Agency</label>
          <select v-model="selectedAgencyId" class="input agency-select">
            <option v-for="a in agencyChoices" :key="a.id" :value="String(a.id)">
              {{ a.name }}
            </option>
          </select>
        </div>
        <button class="btn btn-secondary" @click="router.push(orgPath('/admin/hiring'))">Hiring Dashboard</button>
        <button class="btn btn-secondary" @click="router.push(orgPath('/admin/pre-hire'))">View Pre-Hire</button>
        <button class="btn btn-secondary" @click="router.push(orgPath('/admin/onboarding'))">View Onboarding</button>
        <button class="btn btn-secondary" @click="refresh" :disabled="loading">Refresh</button>
        <button class="btn btn-primary" @click="openCreate">New application</button>
        <span v-if="newForMeInView > 0" class="pill unread-pill">
          {{ newForMeInView }} new for you
        </span>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div class="grid" :class="{ 'grid--embedded': embeddedDetailOnly }" data-tour="hiring-grid">
      <div v-if="!embeddedDetailOnly" class="panel list-panel" data-tour="hiring-list-panel">
        <div class="stage-tabs" data-tour="hiring-stage-tabs">
          <button
            v-for="s in stageTabs"
            :key="s.key"
            type="button"
            class="stage-tab"
            :class="{ active: listStageTab === s.key }"
            @click="setListStageTab(s.key)"
          >
            {{ s.label }}
            <span class="stage-count">{{ s.count }}</span>
          </button>
        </div>

        <div class="list-controls" data-tour="hiring-search">
          <select v-model="filterJobId" class="input" style="max-width: 180px;">
            <option value="">All jobs</option>
            <option v-for="j in jobDescriptions" :key="j.id" :value="String(j.id)">{{ j.title }}</option>
            <option v-if="otherJobCount > 0" value="__other__">Other / no role</option>
          </select>
          <input v-model="q" class="input" placeholder="Search name/email…" @keyup.enter="refresh" />
          <button class="btn btn-secondary btn-sm" type="button" :class="{ active: showFilters }" @click="showFilters = !showFilters">
            Filter
          </button>
          <button class="btn btn-secondary btn-sm" @click="refresh" :disabled="loading">Search</button>
        </div>
        <div v-if="showFilters" class="list-filters-extra">
          <label class="toggle-new">
            <input v-model="filterNewOnly" type="checkbox" />
            New for me only
          </label>
          <button class="btn btn-secondary btn-sm" @click="setListStageTab('not_hired')" :disabled="listStageTab === 'not_hired'">
            Show not hired
          </button>
          <button class="btn btn-secondary btn-sm" @click="setListStageTab('hired')" :disabled="listStageTab === 'hired'">
            Show hired
          </button>
          <button class="btn btn-secondary btn-sm" type="button" @click="downloadApplicantsCsv">
            Download CSV
          </button>
        </div>

        <div v-if="loading" class="loading">Loading applications…</div>
        <div v-else class="list" data-tour="hiring-candidates-list">
          <button
            v-for="c in filteredCandidates"
            :key="c.id"
            class="list-item modern-row"
            data-tour="hiring-candidate-row"
            :class="{ active: selectedId === c.id, 'list-item-duplicate': Number(c.duplicate_application_count || 0) > 1 || Number(c.application_count || 0) > 1 }"
            @click="selectCandidate(c.id)"
          >
            <div class="row-avatar">{{ candidateInitials(c) }}</div>
            <div class="row-body">
              <div class="row-top">
                <div class="name">{{ c.first_name }} {{ c.last_name }}</div>
                <span class="pill" :class="stagePillClass(c)">{{ stageLabel(c) }}</span>
              </div>
              <div class="meta">
                <span v-if="c.is_new_for_me" class="pill pill-new">New</span>
                <span v-if="c.job_title" class="muted small">{{ c.job_title }}</span>
                <span v-if="appliedAtLabel(c)" class="muted small applied-at">{{ appliedAtLabel(c) }}</span>
                <span v-if="Number(c.application_count || 0) > 1" class="pill pill-duplicate">{{ c.application_count }} apps</span>
                <span v-else-if="Number(c.duplicate_application_count || 0) > 1" class="pill pill-duplicate">Repeat</span>
              </div>
            </div>
          </button>

          <div v-if="filteredCandidates.length === 0" class="empty">No applications found.</div>
        </div>
      </div>

      <div class="panel detail-panel" :class="{ 'detail-panel--embedded': embeddedDetailOnly }" data-tour="hiring-detail-panel">
        <div v-if="!selectedId" class="empty detail-empty">
          <h3>{{ embeddedDetailOnly ? 'Loading application…' : 'Select an application' }}</h3>
          <p v-if="!embeddedDetailOnly" class="muted">Choose someone from the list to open their overview, resume, interviews, and notes.</p>
        </div>

        <div v-else>
          <div v-if="detailLoading" class="loading">Loading profile…</div>

          <template v-else>
            <div class="detail-header modern-detail-header" data-tour="hiring-detail-header">
              <div class="detail-identity">
                <img v-if="candidatePhotoUrl" class="candidate-photo" :src="candidatePhotoUrl" alt="Candidate photo" />
                <div v-else class="candidate-photo avatar-fallback">{{ candidateInitials(detail.user || {}) }}</div>
                <div>
                  <div class="detail-title-row">
                    <h3 class="detail-name">{{ candidateName }}</h3>
                    <span class="pill" :class="stagePillClass(detail.profile)">{{ detail.profile?.stage_label || stageLabel(detail.profile) }}</span>
                  </div>
                  <div class="detail-role muted">
                    {{ detail.jobDescription?.title || detail.profile?.applied_role || 'Applicant' }}
                  </div>
                  <div class="detail-meta contact-meta">
                    <span v-if="detail.user?.personal_email || detail.user?.email">{{ detail.user?.personal_email || detail.user?.email }}</span>
                    <span v-if="detail.user?.phone_number">{{ detail.user.phone_number }}</span>
                  </div>
                </div>
              </div>
              <div class="detail-actions" data-tour="hiring-detail-actions">
                <div class="stage-move">
                  <select
                    class="input"
                    :value="currentMoveStage"
                    :disabled="stageSaving"
                    @change="onMoveStageChange"
                  >
                    <option disabled value="">Move to…</option>
                    <option value="applied">Applied</option>
                    <option value="review">Review</option>
                    <option value="interview">Interview</option>
                    <option value="offered">Offered</option>
                  </select>
                </div>
                <button class="btn btn-primary" @click="openMarkHiredModal" :disabled="!selectedId">
                  Start pre-hire
                </button>
                <div class="more-actions">
                  <button type="button" class="btn btn-secondary" @click="showMoreActions = !showMoreActions">···</button>
                  <div v-if="showMoreActions" class="more-menu">
                    <button type="button" @click="openAssessment('prescreen'); generatePreScreenReport(); showMoreActions = false" :disabled="generatingPreScreen">
                      {{ generatingPreScreen ? 'Generating…' : 'Generate Pre-Screen' }}
                    </button>
                    <button type="button" @click="openAssessment('summary'); generateResumeSummary(); showMoreActions = false" :disabled="resumeSummaryGenerating">
                      {{ resumeSummaryGenerating ? 'Generating…' : 'Generate resume summary' }}
                    </button>
                    <button type="button" @click="markNotHired(); showMoreActions = false" :disabled="markingNotHired">
                      Not hired
                    </button>
                    <button
                      v-if="canHardDeleteApplicant"
                      type="button"
                      class="danger"
                      @click="deleteApplicant(); showMoreActions = false"
                      :disabled="deletingApplicant"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="lastHireTokenLink" class="info-banner">
              <div><strong>Setup link sent — backup copy:</strong></div>
              <div class="mono">{{ lastHireTokenLink }}</div>
            </div>

            <div class="tabs" data-tour="hiring-detail-tabs">
              <button class="tab" :class="{ active: tab === 'overview' }" @click="tab = 'overview'">Overview</button>
              <button class="tab" :class="{ active: tab === 'assessment' }" @click="openAssessment('resume')">Candidate Assessment</button>
              <button class="tab" :class="{ active: tab === 'notes' }" @click="tab = 'notes'">Notes</button>
              <button class="tab" :class="{ active: tab === 'tasks' }" @click="tab = 'tasks'">Tasks</button>
              <button class="tab" :class="{ active: tab === 'interview' }" @click="tab = 'interview'">Interviews</button>
              <button class="tab" :class="{ active: tab === 'reviews' }" @click="tab = 'reviews'">Reviews</button>
              <button class="tab" :class="{ active: tab === 'references' }" @click="openReferencesTab">References</button>
              <button class="tab" :class="{ active: tab === 'profile' }" @click="tab = 'profile'">Profile</button>
            </div>

            <!-- Overview -->
            <div v-if="tab === 'overview'" class="tab-body">
              <CandidateOverviewPanel
                :profile="detail.profile"
                :user="detail.user"
                :job-title="detail.jobDescription?.title || detail.profile?.applied_role || ''"
                :resume-summary="resumeSummary"
                :summary-bullets="quickResumeBullets"
                :latest-pre-screen="detail.latestPreScreen"
                :interviews="hubInterviews"
                :average-interview-score="averageHubInterviewScore"
                :activity-items="candidateActivityItems"
                :agency-id="effectiveAgencyId"
                :background-check="detail.backgroundCheck"
                @goto-tab="onDetailGotoTab"
                @schedule-interview="openInterviewSchedule"
              />
            </div>

            <!-- Profile -->
            <div v-if="tab === 'profile'" class="tab-body">
              <div class="kv">
                <div class="k">Stage</div>
                <div class="v">{{ detail.profile?.stage_label || stageLabel(detail.profile) }}</div>
              </div>
              <div class="kv">
                <div class="k">Interview</div>
                <div class="v">
                  <div class="muted small">
                    Use the <button type="button" class="linkish" @click="tab = 'interview'">Interviews</button> tab (or Overview → Schedule interview) for Interview Hub meetings.
                  </div>
                </div>
              </div>
              <div v-if="canChooseAgency" class="kv">
                <div class="k">Agency</div>
                <div class="v">
                  <div class="row-actions">
                    <select v-model="transferToAgencyId" class="input">
                      <option value="">Move to…</option>
                      <option
                        v-for="a in agencyChoices"
                        :key="a.id"
                        :value="String(a.id)"
                        :disabled="Number(a.id) === Number(effectiveAgencyId)"
                      >
                        {{ a.name }}
                      </option>
                    </select>
                    <button
                      class="btn btn-secondary"
                      @click="transferAgency"
                      :disabled="transferringAgency || !transferToAgencyId"
                    >
                      {{ transferringAgency ? 'Moving…' : 'Move' }}
                    </button>
                  </div>
                  <div class="muted small" style="margin-top:6px;">
                    Moves this applicant to another agency and reassigns their hiring tasks to that agency.
                  </div>
                </div>
              </div>
              <div class="kv">
                <div class="k">Job</div>
                <div class="v">{{ detail.jobDescription?.title || detail.profile?.applied_role || '—' }}</div>
              </div>
              <div class="kv">
                <div class="k">Applied role</div>
                <div class="v">{{ detail.profile?.applied_role || '—' }}</div>
              </div>
              <div class="kv">
                <div class="k">Source</div>
                <div class="v">{{ detail.profile?.source || '—' }}</div>
              </div>
              <div class="kv">
                <div class="k">Phone</div>
                <div class="v">{{ detail.user?.phone_number || '—' }}</div>
              </div>
              <div class="kv">
                <div class="k">Cover letter</div>
                <div class="v">
                  <pre v-if="detail.profile?.cover_letter_text" class="pre light-pre">{{ detail.profile.cover_letter_text }}</pre>
                  <div v-if="(detail.coverLetterDocuments || []).length" class="cover-letter-docs">
                    <button
                      v-for="doc in detail.coverLetterDocuments"
                      :key="`cl-${doc.id}`"
                      type="button"
                      class="btn btn-secondary btn-sm"
                      @click="openCoverLetterDoc(doc)"
                    >
                      Open {{ doc.originalName || doc.title || 'cover letter' }}
                    </button>
                  </div>
                  <span
                    v-if="!detail.profile?.cover_letter_text && !(detail.coverLetterDocuments || []).length"
                    class="muted"
                  >—</span>
                </div>
              </div>
              <div class="kv">
                <div class="k">Fluent languages</div>
                <div class="v">{{ fluentLanguagesDisplay }}</div>
              </div>

              <div class="kv application-history-block">
                <div class="k">Application history</div>
                <div class="v">
                  <div v-if="!(detail.applications || []).length" class="muted small">No submitted applications on file yet.</div>
                  <ul v-else class="application-history-list">
                    <li v-for="app in detail.applications" :key="app.submissionId" class="application-history-item">
                      <div class="application-history-title">
                        <strong>{{ app.jobTitle || 'Job application' }}</strong>
                        <span class="muted small">{{ formatApplicationWhen(app.submittedAt) }}</span>
                      </div>
                      <div v-if="app.coverLetterPreview" class="muted small application-history-preview">
                        {{ app.coverLetterPreview }}
                      </div>
                      <div class="application-history-meta muted small">
                        <span v-if="app.hasPdf">PDF on file</span>
                        <span v-if="app.intakeSummary?.referenceCount != null">
                          {{ app.intakeSummary.referenceCount }} reference{{ Number(app.intakeSummary.referenceCount) === 1 ? '' : 's' }}
                        </span>
                        <span>Submission #{{ app.submissionId }}</span>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Candidate Assessment (resume + AI summary + pre-screen) -->
            <div v-if="tab === 'assessment'" class="tab-body">
              <CandidateAssessmentWorkspace
                :resumes="resumes"
                :loading="resumesLoading"
                :uploading="resumeUploading"
                :pasting="resumePasting"
                :error="resumeError"
                :notes="detail.notes || []"
                :tasks="tasks || []"
                :summary-bullets="quickResumeBullets"
                :summary-error="resumeSummaryError"
                :summary-generating="resumeSummaryGenerating"
                :re-extracting="resumeReExtracting"
                :summary-loading="resumeSummaryLoading"
                :resume-summary="resumeSummary"
                :job-title="detail.jobDescription?.title || detail.profile?.applied_role || ''"
                :latest-pre-screen="detail.latestPreScreen"
                :prescreen-generating="generatingPreScreen"
                :prescreen-html="preScreenHtml"
                :search-suggestions-html="searchSuggestionsHtml"
                :linked-in-url="preScreenLinkedInUrl"
                :psychology-today-url="preScreenPsychologyTodayUrl"
                :location="preScreenLocation"
                :initial-panel="assessmentPanel"
                :resolve-viewer-url="resolveResumeViewerUrl"
                @upload="onResumeWorkspaceUpload"
                @paste="onResumeWorkspacePaste"
                @delete="deleteResume"
                @goto-tab="onDetailGotoTab"
                @generate-summary="() => generateResumeSummary()"
                @generate-prescreen="() => generatePreScreenReport()"
                @re-extract="reExtractResume"
                @update:linkedInUrl="(v) => { preScreenLinkedInUrl = v; }"
                @update:psychologyTodayUrl="(v) => { preScreenPsychologyTodayUrl = v; }"
                @update:location="(v) => { preScreenLocation = v; }"
                @panel-change="(p) => { assessmentPanel = p; }"
              />
            </div>

            <!-- Interview -->
            <div v-if="tab === 'interview'" class="tab-body">
              <CandidateInterviewPanel
                v-if="selectedId && effectiveAgencyId"
                :candidate-user-id="selectedId"
                :agency-id="effectiveAgencyId"
                :assignees="assignees"
                :job-description-id="detail.jobDescription?.id || detail.profile?.job_description_id || null"
                :candidate-stage="detail.profile?.stage || ''"
                :hiring-profile-id="detail.profile?.id || null"
                :candidate-name="candidateName"
                :job-title="detail.jobDescription?.title || detail.profile?.applied_role || ''"
                :schedule-pulse="interviewSchedulePulse"
                @interviews-updated="onHubInterviewsUpdated"
              />
              <div v-if="!hasLegacyInterviewData && !showLegacyInterview" class="muted small" style="margin-top:12px;">
                New applicants use Interview Hub above. Legacy profile schedule (for older reference-form flows) is hidden unless needed.
                <button type="button" class="linkish" style="margin-left:6px;" @click="showLegacyInterview = true">Show legacy reference schedule</button>
              </div>
              <div v-if="hasLegacyInterviewData || showLegacyInterview" class="legacy-interview" style="margin-top:18px;">
                <h4 style="margin:0 0 8px;">Legacy reference interview fields</h4>
                <div class="muted small" style="margin-bottom:8px;">
                  Profile-only schedule used for reference forms (not a video meeting). Prefer Interview Hub above for live interviews.
                </div>
                <div class="interview-grid">
                  <label class="small">Start (local)</label>
                  <input v-model="interviewStartsLocal" class="input" type="datetime-local" />
                  <label class="small">Timezone</label>
                  <input v-model="interviewTimezone" class="input" placeholder="America/Denver" />
                  <label class="small">Interviewers</label>
                  <select v-model="interviewerPick" class="input" @change="addInterviewerFromPick">
                    <option value="">Add interviewer…</option>
                    <option v-for="u in assignees" :key="u.id" :value="String(u.id)" :disabled="interviewerIds.includes(Number(u.id))">
                      {{ u.first_name }} {{ u.last_name }}
                    </option>
                  </select>
                  <div class="chips">
                    <span v-for="id in interviewerIds" :key="id" class="chip">
                      {{ interviewerName(id) }}
                      <button type="button" class="chip-x" @click="removeInterviewer(id)">×</button>
                    </span>
                  </div>
                  <div class="interview-actions">
                    <button type="button" class="btn btn-primary" :disabled="interviewSaving" @click="saveInterviewSchedule(false)">
                      {{ interviewSaving ? 'Saving…' : 'Save interview' }}
                    </button>
                    <button type="button" class="btn btn-secondary" :disabled="interviewSaving" @click="saveInterviewSchedule(true)">
                      {{ interviewSaving ? 'Saving…' : 'Save interview and send reference forms' }}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" :disabled="interviewSaving" @click="sendReferenceRequestsOnly">
                      Send references only
                    </button>
                    <button type="button" class="btn btn-secondary" :disabled="interviewSaving" @click="cancelInterviewSchedule">
                      Cancel interview
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <div v-if="tab === 'notes'" class="tab-body">
              <div class="note-compose">
                <textarea v-model="noteMessage" class="textarea" placeholder="Add a note…" rows="3" />
                <button class="btn btn-primary" @click="addNote" :disabled="noteSaving || !noteMessage.trim()">
                  {{ noteSaving ? 'Saving…' : 'Add note' }}
                </button>
              </div>
              <div class="note-list">
                <div v-for="n in detail.notes || []" :key="n.id" class="note">
                  <div class="note-row-head">
                    <UserAvatar
                      class="note-avatar"
                      size="sm"
                      :photo-path="n.author_profile_photo_path"
                      :first-name="n.author_first_name"
                      :last-name="n.author_last_name"
                    />
                    <div class="note-head-main">
                      <div class="note-head">
                        <div class="note-author">{{ noteAuthor(n) }}</div>
                        <div class="note-time">{{ formatTime(n.created_at) }}</div>
                      </div>
                      <div class="note-body">{{ n.message }}</div>
                      <div class="note-actions">
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs"
                          :class="{ active: n.my_kudos }"
                          @click="toggleNoteKudos(n.id)"
                        >
                          Thumbs up {{ n.kudos_count ? `(${n.kudos_count})` : '' }}
                        </button>
                        <span class="rx-tools">
                          <button type="button" class="btn-icon" title="Like" @click="toggleNoteReaction(n.id, '👍')">👍</button>
                          <button type="button" class="btn-icon" title="Fire" @click="toggleNoteReaction(n.id, '🔥')">🔥</button>
                          <button type="button" class="btn-icon" title="Celebrate" @click="toggleNoteReaction(n.id, '🎉')">🎉</button>
                        </span>
                        <span v-if="(n.reactions || []).length" class="rx-labels muted small">
                          <span v-for="(rx, idx) in reactionCounts(n.reactions)" :key="idx">{{ rx.emoji }} {{ rx.c }}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="(detail.notes || []).length === 0" class="empty">No notes yet.</div>
              </div>
            </div>

            <!-- Reviews -->
            <div v-if="tab === 'reviews'" class="tab-body">
              <div class="note-compose">
                <label class="small">Rating (1–5)</label>
                <select v-model.number="reviewRating" class="input" style="max-width:120px;">
                  <option v-for="x in 5" :key="x" :value="x">{{ x }}</option>
                </select>
                <textarea v-model="reviewBody" class="textarea" rows="3" placeholder="Write a dated review…" />
                <button class="btn btn-primary" :disabled="reviewSaving || !reviewBody.trim()" @click="submitReview">
                  {{ reviewSaving ? 'Saving…' : 'Submit review' }}
                </button>
              </div>
              <div class="review-list">
                <div v-for="rv in detail.reviews || []" :key="rv.id" class="note review-item">
                  <div class="note-row-head">
                    <UserAvatar
                      size="sm"
                      :photo-path="rv.author_profile_photo_path"
                      :first-name="rv.author_first_name"
                      :last-name="rv.author_last_name"
                    />
                    <div class="note-head-main">
                      <div class="note-head">
                        <div class="note-author">
                          {{ rv.author_first_name }} {{ rv.author_last_name }}
                          <span class="pill">{{ rv.rating }}/5</span>
                        </div>
                        <div class="note-time">{{ formatTime(rv.created_at) }}</div>
                      </div>
                      <div class="note-body">{{ rv.body }}</div>
                    </div>
                  </div>
                </div>
                <div v-if="!(detail.reviews || []).length" class="empty">No reviews yet.</div>
              </div>
              <div v-if="(detail.myTimeCapsules || []).length" class="capsule-hint">
                <div class="small"><strong>Your sealed predictions</strong> (text appears here after you open the login splash and tap Done)</div>
                <ul class="muted small">
                  <li v-for="c in detail.myTimeCapsules" :key="c.id">
                    {{ c.horizon_months }}m — unlocks {{ c.reveal_at ? formatTime(c.reveal_at) : '—' }}
                  </li>
                </ul>
              </div>
            </div>

            <!-- Tasks -->
            <div v-if="tab === 'tasks'" class="tab-body">
              <div class="task-compose">
                <input v-model="taskTitle" class="input" placeholder="Task title (e.g., Call applicant)" />
                <textarea v-model="taskDescription" class="textarea" placeholder="Details (optional)" rows="2" />
                <div class="task-row">
                  <select v-model="taskAssigneeId" class="input">
                    <option value="">Assign to…</option>
                    <option v-for="u in assignees" :key="u.id" :value="u.id">
                      {{ u.first_name }} {{ u.last_name }} ({{ u.role }})
                    </option>
                  </select>
                  <input v-model="taskDueDate" class="input" type="date" />
                  <button class="btn btn-primary" @click="createTask" :disabled="taskSaving || !taskTitle.trim() || !taskAssigneeId">
                    {{ taskSaving ? 'Creating…' : 'Create task' }}
                  </button>
                </div>
              </div>

              <div v-if="tasksLoading" class="loading">Loading tasks…</div>
              <div v-else class="task-list">
                <div v-for="t in tasks" :key="t.id" class="task">
                  <div class="task-title">{{ t.title }}</div>
                  <div class="muted small">{{ t.description }}</div>
                  <div class="muted small">Due: {{ t.due_date ? formatDate(t.due_date) : '—' }}</div>
                </div>
                <div v-if="tasks.length === 0" class="empty">No hiring tasks yet.</div>
              </div>
            </div>

            <div v-if="tab === 'references'" class="tab-body">
              <p class="muted small">
                References from the application, digital reference requests, form responses, and a best-effort email timeline
                (including message copy when available). Email opens use an optional image pixel and may be blocked by the recipient’s mail client.
              </p>

              <h4 class="ref-subheading">Application references</h4>
              <div v-if="!applicationReferences.length" class="empty subtle">No references were entered on the application.</div>
              <table v-else class="table ref-req-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Digital request</th>
                    <th>Sent</th>
                    <th>Email opened</th>
                    <th>Reminders</th>
                    <th>Expires</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(ref, idx) in applicationReferences" :key="`appref_${idx}`">
                    <td>{{ idx }}</td>
                    <td>{{ ref.name || '—' }}</td>
                    <td>{{ ref.email || '—' }}</td>
                    <td>{{ ref.phone || ref.phone_number || '—' }}</td>
                    <td>{{ refRowStatus(idx) }}</td>
                    <td>{{ refRowSent(idx) }}</td>
                    <td>{{ refRowOpened(idx) }}</td>
                    <td>{{ refRowReminders(idx) }}</td>
                    <td>{{ refRowExpires(idx) }}</td>
                    <td>{{ refRowCompleted(idx) }}</td>
                  </tr>
                </tbody>
              </table>

              <h4 class="ref-subheading">All digital reference requests (history)</h4>
              <div v-if="referenceRequestsLoading" class="loading">Loading reference requests…</div>
              <div v-else-if="!referenceRequests.length" class="empty subtle">No digital reference requests yet.</div>
              <table v-else class="table ref-req-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Index</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th>Email opened</th>
                    <th>Expires</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in referenceRequests" :key="r.id">
                    <td>{{ r.id }}</td>
                    <td>{{ r.reference_index }}</td>
                    <td>{{ r.reference_name }}</td>
                    <td>{{ r.reference_email }}</td>
                    <td>{{ r.status }}</td>
                    <td>{{ r.sent_at ? formatTime(r.sent_at) : '—' }}</td>
                    <td>{{ r.email_opened_at ? formatTime(r.email_opened_at) : '—' }}</td>
                    <td>{{ r.token_expires_at ? formatTime(r.token_expires_at) : '—' }}</td>
                    <td>{{ r.completed_at ? formatTime(r.completed_at) : '—' }}</td>
                  </tr>
                </tbody>
              </table>

              <div v-for="r in referenceRequests" :key="`resp_${r.id}`" class="ref-resp-block">
                <h4 v-if="r.responses_json">Responses — {{ r.reference_name }} ({{ r.status }})</h4>
                <pre v-if="r.responses_json" class="mono-block">{{ formatRefResponses(r) }}</pre>
              </div>

              <h4 class="ref-subheading">Reference email &amp; lifecycle activity</h4>
              <div v-if="referenceActivityLoading" class="loading">Loading activity…</div>
              <div v-else-if="!referenceActivity.length" class="empty subtle">No logged reference activity yet.</div>
              <ul v-else class="ref-activity-list">
                <li v-for="ev in referenceActivity" :key="ev.id" class="ref-activity-item">
                  <div class="ref-activity-head">
                    <span class="ref-activity-time">{{ formatTime(ev.created_at) }}</span>
                    <span class="ref-activity-kind">{{ formatRefActivityKind(ev.metadata) }}</span>
                    <span class="ref-activity-outcome">{{ refActivityOutcome(ev.metadata) }}</span>
                  </div>
                  <div v-if="ev.metadata?.to" class="muted small">To: {{ ev.metadata.to }}</div>
                  <div v-if="ev.metadata?.subject" class="muted small">Subject: {{ ev.metadata.subject }}</div>
                  <div v-if="ev.metadata?.gmailMessageId" class="muted small">Gmail message id: {{ ev.metadata.gmailMessageId }}</div>
                  <div v-if="ev.metadata?.error" class="error-inline small">Error: {{ ev.metadata.error }}</div>
                  <div v-if="ev.metadata?.skipReason" class="muted small">Skipped: {{ ev.metadata.skipReason }}</div>
                  <div v-if="ev.metadata?.note" class="muted small">{{ ev.metadata.note }}</div>
                  <details v-if="ev.metadata?.textBody || ev.metadata?.htmlBody" class="ref-activity-details">
                    <summary>View email text</summary>
                    <pre v-if="ev.metadata?.textBody" class="mono-block">{{ ev.metadata.textBody }}</pre>
                  </details>
                </li>
              </ul>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Create modal -->
    <div v-if="showCreate" class="modal-overlay" @click.self="closeCreate">
      <div class="modal">
        <div class="modal-header">
          <h3>New applicant</h3>
          <button class="btn-close" @click="closeCreate" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <input v-model="createForm.firstName" class="input" placeholder="First name" />
            <input v-model="createForm.lastName" class="input" placeholder="Last name (required)" />
            <input v-model="createForm.personalEmail" class="input" placeholder="Personal email (required)" />
            <input v-model="createForm.phoneNumber" class="input" placeholder="Phone (optional)" />
            <div class="job-row">
              <select v-model="createForm.jobDescriptionId" class="input">
                <option value="">Select job description…</option>
                <option v-for="j in jobDescriptions" :key="j.id" :value="String(j.id)">
                  {{ j.title }}
                </option>
              </select>
              <button class="btn btn-secondary" @click="goToCareers" type="button">Open careers</button>
            </div>
            <input v-model="createForm.appliedRole" class="input" placeholder="Applied role (optional override)" />
            <input v-model="createForm.source" class="input" placeholder="Source (optional)" />
            <textarea v-model="createForm.coverLetterText" class="textarea" placeholder="Cover letter (optional)" rows="4" />
          </div>
          <div v-if="createError" class="error-banner">{{ createError }}</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="closeCreate">Cancel</button>
          <button class="btn btn-primary" @click="createApplicant" :disabled="createSaving">
            {{ createSaving ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Job descriptions modal -->
    <div v-if="false && showJobs" class="modal-overlay" @click.self="closeJobDescriptions">
      <div class="modal">
        <div class="modal-header">
          <h3>Job descriptions</h3>
          <button class="btn-close" @click="closeJobDescriptions" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <div class="muted small" style="margin-bottom:8px;">
            Create and name job descriptions so they can be selected when creating applicants.
          </div>

          <div v-if="jobsLoading" class="loading">Loading job descriptions…</div>
          <div v-else class="job-list">
            <div v-for="j in jobDescriptions" :key="j.id" class="job-item">
              <div>
                <div class="name">{{ j.title }}</div>
                <div class="muted small">{{ j.updatedAt ? formatTime(j.updatedAt) : '' }}</div>
              </div>
              <div class="row-actions">
                <button class="btn btn-secondary" @click="selectJobForCreate(j)" type="button">Select</button>
                <button class="btn btn-primary" @click="createApplicationLink(j)" type="button">Create application link</button>
                <button v-if="j.hasFile" class="btn btn-secondary" @click="viewJobFile(j)" type="button">View file</button>
                <button class="btn btn-secondary" @click="startEditJob(j)" type="button">Edit</button>
                <button class="btn btn-danger" @click="removeJobDescription(j)" type="button">Delete</button>
              </div>
            </div>
            <div v-if="jobDescriptions.length === 0" class="empty">No job descriptions yet.</div>
          </div>

          <div class="divider"></div>

          <div class="job-create">
            <div class="muted small" style="margin-bottom:6px;">
              {{ editingJobId ? 'Edit job description' : 'Add a new job description' }}
            </div>
            <input
              v-model="newJob.title"
              class="input"
              :placeholder="editingJobId ? 'Job title' : 'Job title (e.g., School SLP)'"
            />
            <textarea
              v-model="newJob.descriptionText"
              class="textarea"
              rows="6"
              :disabled="editingJobHasFile"
              placeholder="Paste job description text here (recommended for best matching)"
            ></textarea>
            <div v-if="editingJobHasFile" class="muted small" style="margin-top:6px;">
              This is an uploaded job description. To update it, upload a replacement file (creates a new version).
            </div>
            <input type="file" ref="jobFile" @change="onJobFileChange" />
            <div v-if="jobCreateError" class="error-banner">{{ jobCreateError }}</div>
            <div class="row-actions" style="justify-content:flex-end;">
              <button
                v-if="editingJobId"
                class="btn btn-secondary"
                type="button"
                @click="cancelEditJob"
                :disabled="jobCreating"
              >
                Cancel
              </button>
              <button class="btn btn-primary" @click="createJobDescription" :disabled="jobCreating || !newJob.title.trim()">
                {{
                  jobCreating
                    ? 'Saving…'
                    : (editingJobId ? (editingJobHasFile ? 'Upload new version' : 'Save changes') : 'Save job description')
                }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useAuthStore } from '../../store/auth';
import { buildPublicIntakeUrl } from '../../utils/publicIntakeUrl';
import UserAvatar from '../../components/common/UserAvatar.vue';
import CandidateOverviewPanel from '../../components/hiring/CandidateOverviewPanel.vue';
import CandidateAssessmentWorkspace from '../../components/hiring/CandidateAssessmentWorkspace.vue';
import CandidateInterviewPanel from '../../components/hiring/CandidateInterviewPanel.vue';
import { buildQuickResumeBullets } from '../../utils/hiringResumeSummaryBullets.js';

const props = defineProps({
  embeddedDetailOnly: { type: Boolean, default: false },
  embeddedCandidateUserId: { type: [Number, String], default: null },
  embeddedAgencyId: { type: [Number, String], default: null },
  embeddedInitialTab: { type: String, default: 'interview' }
});

const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const route = useRoute();
const router = useRouter();
const orgPath = (path) => {
  const slug = String(route.params?.organizationSlug || '').trim();
  if (!slug) return path;
  return `/${slug}${path}`;
};

const loading = ref(false);
const error = ref('');
const allCandidates = ref([]);
const q = ref('');
const filterJobId = ref('');
const stageFilter = ref('active');
const listStageTab = ref('all');
const filterNewOnly = ref(false);
const showFilters = ref(false);
const showMoreActions = ref(false);
const stageSaving = ref(false);
const dashboardStats = ref({
  stageCounts: {},
  totalApplicants: 0
});

// Job descriptions (agency-scoped) — needed for job-dash counts
const jobDescriptions = ref([]);
const jobsLoading = ref(false);

const knownJobIdSet = computed(() =>
  new Set((jobDescriptions.value || []).map((j) => Number(j.id)).filter((id) => id > 0))
);

const isOtherJobCandidate = (c) => {
  const jid = Number(c?.job_description_id || 0);
  return !jid || !knownJobIdSet.value.has(jid);
};

const otherJobCandidates = computed(() =>
  (allCandidates.value || []).filter((c) => isOtherJobCandidate(c))
);

const otherJobCount = computed(() => otherJobCandidates.value.length);

const otherJobNewCount = computed(() =>
  otherJobCandidates.value.filter((c) => c.is_new_for_me).length
);

const candidatesInView = computed(() => {
  const list = allCandidates.value || [];
  if (filterJobId.value === '__other__') return otherJobCandidates.value;
  if (!filterJobId.value) return list;
  return list.filter((c) => Number(c.job_description_id || 0) === Number(filterJobId.value));
});

const selectedId = ref(null);
const assessmentPanel = ref('resume');
const hubInterviews = ref([]);
const showLegacyInterview = ref(false);
const interviewSchedulePulse = ref(0);
const detailLoading = ref(false);
const detail = ref({
  user: null,
  profile: null,
  jobDescription: null,
  notes: [],
  reviews: [],
  myTimeCapsules: [],
  latestResearch: null,
  latestPreScreen: null
});

const tab = ref('overview');

const stageTabs = computed(() => {
  const sc = dashboardStats.value?.stageCounts || {};
  const applied = Number(sc.applied || 0);
  const review = Number(sc.review || 0);
  const interview = Number(sc.interview || 0);
  const offered = Number(sc.offered || 0);
  const total = Number(dashboardStats.value?.totalApplicants || applied + review + interview + offered + Number(sc.other || 0));
  return [
    { key: 'all', label: 'All Applications', count: total },
    { key: 'review', label: 'Review', count: review },
    { key: 'interview', label: 'Interview', count: interview },
    { key: 'offered', label: 'Offered', count: offered }
  ];
});

const currentMoveStage = computed(() => {
  const s = String(detail.value?.profile?.stage || 'applied').toLowerCase();
  if (['applied', 'review', 'interview', 'offered'].includes(s)) return s;
  return '';
});

const candidateActivityItems = computed(() => {
  const items = [];
  const profile = detail.value?.profile;
  if (profile?.created_at || profile?.hiring_created_at) {
    items.push({
      title: 'Application submitted',
      meta: formatActivityWhen(profile.created_at || profile.hiring_created_at)
    });
  }
  if (profile?.stage && String(profile.stage).toLowerCase() !== 'applied') {
    items.push({
      title: `Moved to ${profile.stage_label || stageLabel(profile)}`,
      meta: formatActivityWhen(profile.updated_at)
    });
  }
  for (const n of (detail.value?.notes || []).slice(0, 3)) {
    items.push({
      title: `Note by ${[n.author_first_name, n.author_last_name].filter(Boolean).join(' ') || 'team'}`,
      meta: formatActivityWhen(n.created_at || n.createdAt)
    });
  }
  for (const rv of (detail.value?.reviews || []).slice(0, 2)) {
    items.push({
      title: `Review added (${rv.rating || '—'}★)`,
      meta: formatActivityWhen(rv.created_at || rv.createdAt)
    });
  }
  return items.slice(0, 6);
});

const hasLegacyInterviewData = computed(() => {
  const p = detail.value?.profile;
  if (!p) return false;
  if (p.interview_starts_at) return true;
  const ids = parseInterviewerJson(p.interview_interviewer_user_ids);
  return ids.length > 0;
});

const averageHubInterviewScore = computed(() => {
  const scores = (hubInterviews.value || [])
    .map((i) => Number(i.average_score ?? i.averageScore))
    .filter((n) => Number.isFinite(n));
  if (!scores.length) return null;
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
});

const openAssessment = (panel = 'resume') => {
  assessmentPanel.value = ['resume', 'summary', 'prescreen'].includes(panel) ? panel : 'resume';
  tab.value = 'assessment';
};

const openInterviewSchedule = () => {
  tab.value = 'interview';
  interviewSchedulePulse.value += 1;
};

const onDetailGotoTab = (t) => {
  if (t === 'assessment' || t === 'resume') {
    openAssessment(t === 'resume' ? 'resume' : assessmentPanel.value || 'resume');
    return;
  }
  if (t === 'resumeSummary' || t === 'summary') {
    openAssessment('summary');
    return;
  }
  if (t === 'prescreen') {
    openAssessment('prescreen');
    return;
  }
  tab.value = t;
};

const onHubInterviewsUpdated = (list) => {
  hubInterviews.value = Array.isArray(list) ? list : [];
};

const loadHubInterviews = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) {
    hubInterviews.value = [];
    return;
  }
  try {
    const r = await api.get(`/hiring/interview-hub/candidates/${selectedId.value}/interviews`, {
      params: { agencyId: effectiveAgencyId.value }
    });
    hubInterviews.value = r.data?.data || r.data || [];
  } catch {
    hubInterviews.value = [];
  }
};

const agencyChoices = computed(() => {
  // Super admin: can browse all agencies. Others: only assigned agencies.
  const role = String(authStore.user?.role || '').toLowerCase();
  const base = role === 'super_admin'
    ? (Array.isArray(agencyStore.agencies) ? agencyStore.agencies : [])
    : (Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : []);

  return (base || [])
    .filter((o) => String(o?.organization_type || 'agency').toLowerCase() === 'agency')
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
});

const canChooseAgency = computed(() => (agencyChoices.value || []).length > 1);
const selectedAgencyId = ref('');
const agencyStorageKey = computed(() => `hiring_selected_agency_v1_${authStore.user?.id || 'anon'}`);

const effectiveAgencyId = computed(() => {
  const embeddedAid = Number(props.embeddedAgencyId || 0);
  if (embeddedAid > 0) return embeddedAid;

  // First: explicit selection on this page.
  const chosen = selectedAgencyId.value ? parseInt(String(selectedAgencyId.value), 10) : null;
  if (chosen) return chosen;

  // Prefer explicit agency context (brand/selector)
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  const fromStore = a?.id || null;
  if (fromStore) return fromStore;

  // Fallback: some sessions only have agencyId/agencyIds on the user object.
  const fromUser = authStore.user?.agencyId || null;
  if (fromUser) return fromUser;

  const ids = Array.isArray(authStore.user?.agencyIds) ? authStore.user.agencyIds : [];
  if (ids.length > 0) return ids[0];

  const agencies = Array.isArray(authStore.user?.agencies) ? authStore.user.agencies : [];
  if (agencies.length > 0 && agencies[0]?.id) return agencies[0].id;

  return null;
});

watch(
  () => [props.embeddedDetailOnly, props.embeddedCandidateUserId, props.embeddedAgencyId],
  async ([embedded, uid]) => {
    if (!embedded || !uid) return;
    const id = Number(uid);
    if (!Number.isFinite(id) || id <= 0) return;
    if (props.embeddedAgencyId) {
      selectedAgencyId.value = String(props.embeddedAgencyId);
    }
    tab.value = props.embeddedInitialTab || 'interview';
    if (Number(selectedId.value) !== id) {
      await selectCandidate(id);
    }
  },
  { immediate: true }
);

watch(
  () => selectedAgencyId.value,
  (v) => {
    try {
      const raw = String(v || '').trim();
      if (!raw) return;
      localStorage.setItem(agencyStorageKey.value, raw);
    } catch {
      // ignore
    }
  }
);

const candidateName = computed(() => {
  const u = detail.value.user;
  if (!u) return '';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim();
});
const fluentLanguagesDisplay = computed(() => {
  const raw = detail.value?.profile?.fluent_languages_json ?? detail.value?.profile?.fluentLanguagesJson ?? null;
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = raw.split(',').map((v) => String(v || '').trim()).filter(Boolean);
    }
  }
  return list.length ? list.join(', ') : '—';
});

const applicantsByJob = computed(() => {
  const list = candidatesInView.value || [];
  const byJob = new Map();
  for (const c of list) {
    const jid = c.job_description_id ?? '_none';
    const jtitle = c.job_title || 'No job';
    if (!byJob.has(jid)) byJob.set(jid, { jobId: jid === '_none' ? null : jid, jobTitle: jtitle, count: 0 });
    byJob.get(jid).count++;
  }
  return Array.from(byJob.values()).sort((a, b) => b.count - a.count);
});

const filteredCandidates = computed(() => {
  const list = candidatesInView.value || [];
  if (!filterNewOnly.value) return list;
  return list.filter((c) => c.is_new_for_me);
});

const newForMeInView = computed(() => (allCandidates.value || []).filter((c) => c.is_new_for_me).length);

const jobListedCount = (jobId) =>
  (allCandidates.value || []).filter((c) => Number(c.job_description_id || 0) === Number(jobId)).length;

const newForMeJobCount = (jobId) =>
  (allCandidates.value || []).filter((c) => Number(c.job_description_id || 0) === Number(jobId) && c.is_new_for_me).length;

const selectJobFilter = async (id) => {
  filterJobId.value = id || '';
};

const stageLabel = (row) => {
  if (!row) return 'Applied';
  if (row.stage_label) return row.stage_label;
  const s = String(row.stage || 'applied').toLowerCase();
  if (s === 'not_hired') return 'Not hired';
  if (s === 'hired') return 'Hired';
  if (s === 'offered') return 'Offered';
  if (s === 'interview') return 'Interview';
  if (s === 'review') return 'Review';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Applied';
};

const stagePillClass = (row) => {
  const s = String(row?.stage || 'applied').toLowerCase();
  if (s === 'review') return 'pill-review';
  if (s === 'interview') return 'pill-interview';
  if (s === 'offered') return 'pill-offered';
  if (s === 'hired') return 'pill-hired';
  if (s === 'not_hired') return 'pill-not-hired';
  return 'pill-applied';
};

const candidateInitials = (row) => {
  const a = String(row?.first_name || row?.firstName || '').trim().charAt(0);
  const b = String(row?.last_name || row?.lastName || '').trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
};

const formatActivityWhen = (raw) => {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
};

const formatApplicationWhen = (raw) => {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
};

const appliedAtLabel = (row) => {
  const raw = row?.latest_application_at || row?.hiring_updated_at || row?.hiring_created_at;
  if (!raw) return '';
  try {
    const d = new Date(raw);
    return `Applied ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } catch {
    return '';
  }
};

const downloadApplicantsCsv = () => {
  const list = candidatesInView.value || [];
  const headers = ['Name', 'Email', 'Job', 'Stage', 'Applied', 'Applied role', 'Source'];
  const escape = (s) => String(s || '').replace(/"/g, '""');
  const rows = list.map((c) => [
    `"${escape(`${c.first_name || ''} ${c.last_name || ''}`.trim())}"`,
    `"${escape(c.personal_email || c.email)}"`,
    `"${escape(c.job_title)}"`,
    `"${escape(stageLabel(c))}"`,
    `"${escape(c.hiring_created_at ? formatDate(c.hiring_created_at) : '')}"`,
    `"${escape(c.applied_role)}"`,
    `"${escape(c.source)}"`
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `applicants-${effectiveAgencyId.value || 'export'}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const candidatePhotoUrl = ref('');
const loadCandidatePhoto = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    const r = await api.get(`/hiring/candidates/${selectedId.value}/photo`, { params: { agencyId: effectiveAgencyId.value } });
    candidatePhotoUrl.value = String(r.data?.url || '').trim();
  } catch {
    candidatePhotoUrl.value = '';
  }
};

const transferToAgencyId = ref('');
const transferringAgency = ref(false);
const transferAgency = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  const toId = transferToAgencyId.value ? parseInt(String(transferToAgencyId.value), 10) : null;
  if (!toId) return;
  if (Number(toId) === Number(effectiveAgencyId.value)) return;

  const toAgency = (agencyChoices.value || []).find((a) => Number(a?.id) === Number(toId));
  const name = toAgency?.name || `Agency ${toId}`;
  // eslint-disable-next-line no-alert
  const ok = confirm(`Move this applicant to ${name}? This will also move their hiring tasks to the new agency.`);
  if (!ok) return;

  try {
    transferringAgency.value = true;
    await api.post(
      `/hiring/candidates/${selectedId.value}/transfer-agency`,
      { toAgencyId: toId },
      { params: { agencyId: effectiveAgencyId.value } }
    );

    // Switch the page context to the new agency so the applicant remains visible.
    selectedAgencyId.value = String(toId);
    transferToAgencyId.value = '';
    await refresh();
    await selectCandidate(Number(selectedId.value));
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to move applicant');
  } finally {
    transferringAgency.value = false;
  }
};

const canHardDeleteApplicant = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');
const markingNotHired = ref(false);
const deletingApplicant = ref(false);

const markNotHired = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  // eslint-disable-next-line no-alert
  const ok = confirm('Mark this applicant as not hired? They will be removed from Applications and available under the Not hired list.');
  if (!ok) return;
  try {
    markingNotHired.value = true;
    await api.post(`/hiring/candidates/${selectedId.value}/not-hired`, {}, { params: { agencyId: effectiveAgencyId.value } });
    selectedId.value = null;
    stageFilter.value = 'active';
    await refresh();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to update applicant');
  } finally {
    markingNotHired.value = false;
  }
};

const deleteApplicant = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  // eslint-disable-next-line no-alert
  const typed = prompt('Type "delete" to permanently delete this applicant. This cannot be undone.');
  if (String(typed || '').trim().toLowerCase() !== 'delete') return;
  try {
    deletingApplicant.value = true;
    await api.delete(`/hiring/candidates/${selectedId.value}`, { params: { agencyId: effectiveAgencyId.value } });
    selectedId.value = null;
    await refresh();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete applicant');
  } finally {
    deletingApplicant.value = false;
  }
};

const goToCareers = () => {
  router.push(orgPath('/admin/careers'));
};

marked.setOptions({ gfm: true, breaks: true });
const preScreenHtml = computed(() => {
  const md = String(detail.value?.latestPreScreen?.report_text || '').trim();
  if (!md) return '';
  const raw = marked.parse(md);
  return DOMPurify.sanitize(String(raw || ''), {
    FORBID_TAGS: ['style', 'script', 'iframe', 'object'],
    FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload']
  });
});

const searchSuggestionsHtml = computed(() => {
  const raw = detail.value?.latestPreScreen?.report_json?.grounding?.searchEntryPoint?.renderedContent;
  const html = String(raw || '').trim();
  if (!html) return '';
  // IMPORTANT: renderedContent can include CSS that impacts the whole page.
  // Sanitize aggressively to prevent global style/layout shifts.
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'link', 'meta'],
    FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload']
  });
});

const loadDashboardStats = async () => {
  if (!effectiveAgencyId.value) return;
  try {
    const r = await api.get('/hiring/dashboard', { params: { agencyId: effectiveAgencyId.value } });
    dashboardStats.value = {
      stageCounts: r.data?.stageCounts || {},
      totalApplicants: r.data?.totalApplicants || 0
    };
  } catch {
    // Non-blocking for the applicants list
  }
};

const refresh = async () => {
  if (!effectiveAgencyId.value) {
    error.value = 'No agency selected. Please pick an agency in the header selector, then refresh.';
    allCandidates.value = [];
    return;
  }
  try {
    loading.value = true;
    error.value = '';
    const r = await api.get('/hiring/candidates', {
      params: {
        agencyId: effectiveAgencyId.value,
        status: 'PROSPECTIVE',
        stageFilter: stageFilter.value || 'active',
        q: q.value || undefined
      }
    });
    allCandidates.value = r.data || [];
    await loadDashboardStats();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load applicants';
  } finally {
    loading.value = false;
  }
};

const setStageFilter = async (value) => {
  stageFilter.value = String(value || 'active');
  await refresh();
};

const setListStageTab = async (key) => {
  const k = String(key || 'all');
  listStageTab.value = k;
  if (k === 'all') stageFilter.value = 'active';
  else stageFilter.value = k;
  await refresh();
};

const onMoveStageChange = async (e) => {
  const next = String(e?.target?.value || '').trim().toLowerCase();
  if (!next || !selectedId.value || !effectiveAgencyId.value) return;
  if (next === String(detail.value?.profile?.stage || '').toLowerCase()) return;
  stageSaving.value = true;
  error.value = '';
  try {
    const r = await api.patch(
      `/hiring/candidates/${selectedId.value}/stage`,
      { stage: next, agencyId: effectiveAgencyId.value },
      { params: { agencyId: effectiveAgencyId.value } }
    );
    if (r.data?.profile) {
      detail.value = { ...detail.value, profile: r.data.profile };
    }
    await refresh();
  } catch (err) {
    error.value = err?.response?.data?.error?.message || err?.message || 'Failed to update stage';
  } finally {
    stageSaving.value = false;
  }
};

const selectCandidate = async (id) => {
  if (!id) return;
  if (!effectiveAgencyId.value) {
    error.value = 'No agency selected. Please pick an agency in the header selector.';
    return;
  }
  selectedId.value = id;
  tab.value = 'overview';
  assessmentPanel.value = 'resume';
  showLegacyInterview.value = false;
  interviewSchedulePulse.value = 0;
  showMoreActions.value = false;
  referenceRequests.value = [];
  referenceActivity.value = [];
  promoteResult.value = null;
  lastHireTokenLink.value = '';
  preScreenLinkedInUrl.value = '';
  hubInterviews.value = [];
  await loadAssignees();
  await loadDetail();
  await loadCandidatePhoto();
  await loadResumes();
  await loadResumeSummary();
  await loadHubInterviews();
  await loadTasks();
  syncInterviewFromProfile();
  // If resume text already exists but summary was never built, generate in the background.
  const hasParsedResume = (resumes.value || []).some(
    (r) => String(r.resumeParseStatus || '').toLowerCase() === 'completed'
  );
  if (hasParsedResume && !resumeSummary.value?.summary) {
    maybeAutoAssessAfterResumeChange();
  }
};

const loadDetail = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    detailLoading.value = true;
    const r = await api.get(`/hiring/candidates/${selectedId.value}`, { params: { agencyId: effectiveAgencyId.value } });
    detail.value = r.data || {
      user: null,
      profile: null,
      jobDescription: null,
      notes: [],
      reviews: [],
      myTimeCapsules: [],
      latestResearch: null,
      latestPreScreen: null
    };
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load candidate';
  } finally {
    detailLoading.value = false;
  }
};

// Resume summary (structured)
const resumeSummaryLoading = ref(false);
const resumeSummaryGenerating = ref(false);
const resumeSummaryError = ref('');
const resumeSummary = ref(null);
const quickResumeBullets = computed(() => buildQuickResumeBullets(resumeSummary.value));

const loadResumeSummary = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    resumeSummaryLoading.value = true;
    resumeSummaryError.value = '';
    const r = await api.get(`/hiring/candidates/${selectedId.value}/resume-summary`, { params: { agencyId: effectiveAgencyId.value } });
    resumeSummary.value = r.data?.summary || null;
  } catch (e) {
    resumeSummaryError.value = e.response?.data?.error?.message || 'Failed to load resume summary';
    resumeSummary.value = null;
  } finally {
    resumeSummaryLoading.value = false;
  }
};

const generateResumeSummary = async (opts = {}) => {
  if (!selectedId.value || !effectiveAgencyId.value) return false;
  const { autoPrescreen = false, openPanel = true } = opts;
  try {
    resumeSummaryGenerating.value = true;
    resumeSummaryError.value = '';
    const r = await api.post(`/hiring/candidates/${selectedId.value}/resume-summary`, {}, { params: { agencyId: effectiveAgencyId.value } });
    resumeSummary.value = r.data?.summary || null;
    if (openPanel) openAssessment('summary');
    if (autoPrescreen && !detail.value?.latestPreScreen) {
      await generatePreScreenReport({ openPanel: false, quiet: true });
    }
    return true;
  } catch (e) {
    const details = e.response?.data?.error?.details;
    const msg = e.response?.data?.error?.message || 'Failed to generate resume summary';
    resumeSummaryError.value = details ? `${msg}: ${String(details).slice(0, 300)}` : msg;
    return false;
  } finally {
    resumeSummaryGenerating.value = false;
  }
};

const maybeAutoAssessAfterResumeChange = async () => {
  // After upload/paste: build AI summary automatically, then first pre-screen if missing.
  await generateResumeSummary({ autoPrescreen: true, openPanel: false });
};

// Notes
const noteMessage = ref('');
const noteSaving = ref(false);
const addNote = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  const msg = String(noteMessage.value || '').trim();
  if (!msg) return;
  try {
    noteSaving.value = true;
    await api.post(`/hiring/candidates/${selectedId.value}/notes`, { message: msg }, { params: { agencyId: effectiveAgencyId.value } });
    noteMessage.value = '';
    await loadDetail();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to add note');
  } finally {
    noteSaving.value = false;
  }
};

// Pre-Screen (AI research)
const generatingPreScreen = ref(false);
const preScreenLinkedInUrl = ref('');
const preScreenPsychologyTodayUrl = ref('');
const preScreenLocation = ref('');
const generatePreScreenReport = async (opts = {}) => {
  if (!selectedId.value || !effectiveAgencyId.value) return false;
  const { openPanel = true, quiet = false } = opts;
  try {
    generatingPreScreen.value = true;
    const body = {
      candidateName: candidateName.value,
      linkedInUrl: String(preScreenLinkedInUrl.value || '').trim().slice(0, 800),
      psychologyTodayUrl: String(preScreenPsychologyTodayUrl.value || '').trim().slice(0, 900),
      candidateLocation: String(preScreenLocation.value || '').trim().slice(0, 180)
    };
    const r = await api.post(`/hiring/candidates/${selectedId.value}/prescreen`, body, { params: { agencyId: effectiveAgencyId.value } });
    detail.value.latestPreScreen = r.data || null;
    await loadDetail();
    if (openPanel) openAssessment('prescreen');
    return true;
  } catch (e) {
    if (!quiet) {
      alert(e.response?.data?.error?.message || 'Failed to generate pre-screen report');
    }
    return false;
  } finally {
    generatingPreScreen.value = false;
  }
};

// Mark Hired → dedicated Start Pre-Hire page
const lastHireTokenLink = ref('');

const openMarkHiredModal = () => {
  if (!selectedId.value) return;
  const aid = Number(effectiveAgencyId.value || agencyStore.currentAgency?.id || 0);
  const q = aid ? `?agencyId=${aid}` : '';
  router.push(orgPath(`/admin/hiring/start-pre-hire/${selectedId.value}${q}`));
};

// Legacy promote (kept for reference — now triggered via Start Pre-Hire)
const promoting = ref(false);
const promoteResult = ref(null);

// Resumes
const resumesLoading = ref(false);
const resumes = ref([]);
const resumeError = ref('');
const resumeFile = ref(null);
const resumeSelectedFile = ref(null);
const resumeUploading = ref(false);
const resumePasting = ref(false);
const resumeReExtracting = ref(false);
const resumeTitle = ref('');

const onResumeFileChange = (e) => {
  resumeSelectedFile.value = e?.target?.files?.[0] || null;
};

const resolveResumeViewerUrl = async (r) => {
  if (!selectedId.value || !effectiveAgencyId.value || !r?.id) return null;
  const resp = await api.get(`/hiring/candidates/${selectedId.value}/resumes/${r.id}/view`, {
    params: { agencyId: effectiveAgencyId.value }
  });
  return {
    url: resp.data?.url || null,
    mimeType: resp.data?.mimeType || r.mimeType || r.mime_type || null
  };
};

const openCoverLetterDoc = async (doc) => {
  if (!selectedId.value || !effectiveAgencyId.value || !doc?.id) return;
  try {
    const resp = await api.get(`/hiring/candidates/${selectedId.value}/resumes/${doc.id}/view`, {
      params: { agencyId: effectiveAgencyId.value }
    });
    const url = resp.data?.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else alert('Could not open cover letter');
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to open cover letter');
  }
};

const onResumeWorkspaceUpload = async ({ file, title }) => {
  if (!file) return;
  resumeSelectedFile.value = file;
  resumeTitle.value = title || '';
  await uploadResume();
};

const onResumeWorkspacePaste = async ({ resumeText, title }) => {
  if (!selectedId.value || !effectiveAgencyId.value || !String(resumeText || '').trim()) return;
  try {
    resumePasting.value = true;
    resumeError.value = '';
    await api.post(
      `/hiring/candidates/${selectedId.value}/resumes/paste`,
      { resumeText, title: title || 'Resume (pasted text)', agencyId: effectiveAgencyId.value },
      { params: { agencyId: effectiveAgencyId.value } }
    );
    await loadResumes();
    await maybeAutoAssessAfterResumeChange();
  } catch (e) {
    resumeError.value = e.response?.data?.error?.message || 'Failed to save pasted resume';
  } finally {
    resumePasting.value = false;
  }
};

const loadResumes = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    resumesLoading.value = true;
    resumeError.value = '';
    const r = await api.get(`/hiring/candidates/${selectedId.value}/resumes`, { params: { agencyId: effectiveAgencyId.value } });
    resumes.value = r.data || [];
  } catch (e) {
    resumeError.value = e.response?.data?.error?.message || 'Failed to load resumes';
  } finally {
    resumesLoading.value = false;
  }
};

const uploadResume = async () => {
  if (!selectedId.value || !effectiveAgencyId.value || !resumeSelectedFile.value) return;
  try {
    resumeUploading.value = true;
    resumeError.value = '';
    const fd = new FormData();
    fd.append('file', resumeSelectedFile.value);
    if (resumeTitle.value) fd.append('title', resumeTitle.value);
    fd.append('agencyId', String(effectiveAgencyId.value));
    await api.post(`/hiring/candidates/${selectedId.value}/resumes/upload`, fd);
    resumeSelectedFile.value = null;
    resumeTitle.value = '';
    if (resumeFile.value) resumeFile.value.value = '';
    await loadResumes();
    await maybeAutoAssessAfterResumeChange();
  } catch (e) {
    resumeError.value = e.response?.data?.error?.message || 'Failed to upload resume';
  } finally {
    resumeUploading.value = false;
  }
};

const viewResume = async (r) => {
  if (!selectedId.value || !effectiveAgencyId.value || !r?.id) return;
  try {
    const resp = await api.get(`/hiring/candidates/${selectedId.value}/resumes/${r.id}/view`, { params: { agencyId: effectiveAgencyId.value } });
    const url = resp.data?.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else alert('No URL returned');
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to open resume');
  }
};

const deleteResume = async (r) => {
  if (!selectedId.value || !effectiveAgencyId.value || !r?.id) return;
  const name = r?.title || r?.originalName || 'this resume';
  // eslint-disable-next-line no-alert
  const ok = confirm(`Delete ${name}? This will remove the file and cannot be undone.`);
  if (!ok) return;
  try {
    await api.delete(`/hiring/candidates/${selectedId.value}/resumes/${r.id}`, { params: { agencyId: effectiveAgencyId.value } });
    await loadResumes();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete resume');
  }
};

const reExtractResume = async (r) => {
  if (!selectedId.value || !effectiveAgencyId.value || !r?.id) return;
  try {
    resumeReExtracting.value = true;
    resumeError.value = '';
    await api.post(
      `/hiring/candidates/${selectedId.value}/resumes/${r.id}/re-extract`,
      {},
      { params: { agencyId: effectiveAgencyId.value } }
    );
    await loadResumes();
    await generateResumeSummary({ openPanel: false, autoPrescreen: !detail.value?.latestPreScreen });
  } catch (e) {
    resumeError.value = e.response?.data?.error?.message || 'Failed to extract text from resume file';
  } finally {
    resumeReExtracting.value = false;
  }
};

const resumeParseLabel = (r) => {
  const status = String(r?.resumeParseStatus || '').trim().toLowerCase();
  if (!status) return null;
  if (status === 'completed') return 'Text extracted';
  if (status === 'no_text') return 'No text (needs OCR)';
  if (status === 'failed') return 'Extract failed';
  if (status === 'pending') return 'Extracting…';
  return 'Extract status: ' + status;
};

const resumeParseClass = (r) => {
  const status = String(r?.resumeParseStatus || '').trim().toLowerCase();
  if (status === 'completed') return 'ok';
  if (status === 'no_text') return 'warn';
  if (status === 'failed') return 'bad';
  if (status === 'pending') return 'muted';
  return 'muted';
};

const resumeParseTitle = (r) => {
  const status = String(r?.resumeParseStatus || '').trim().toLowerCase();
  const method = String(r?.resumeParseMethod || '').trim();
  const err = String(r?.resumeParseErrorText || '').trim();
  const parts = [];
  if (status) parts.push(`status: ${status}`);
  if (method) parts.push(`method: ${method}`);
  if (err) parts.push(`error: ${err}`);
  return parts.join('\n');
};

// Tasks
const assignees = ref([]);
const tasks = ref([]);
const tasksLoading = ref(false);
const taskSaving = ref(false);
const taskTitle = ref('');
const taskDescription = ref('');
const taskAssigneeId = ref('');
const taskDueDate = ref('');

const loadAssignees = async () => {
  if (!effectiveAgencyId.value) return;
  try {
    const r = await api.get('/hiring/assignees', { params: { agencyId: effectiveAgencyId.value } });
    assignees.value = r.data || [];
    // Default assignee to current user when possible.
    if (!taskAssigneeId.value && authStore.user?.id) {
      const mine = assignees.value.find((u) => u.id === authStore.user.id);
      if (mine) taskAssigneeId.value = String(mine.id);
    }
  } catch {
    // best effort
    assignees.value = [];
  }
};

const interviewStartsLocal = ref('');
const interviewTimezone = ref('');
const interviewerIds = ref([]);
const interviewerPick = ref('');
const interviewSaving = ref(false);
const referenceRequests = ref([]);
const referenceRequestsLoading = ref(false);
const referenceActivity = ref([]);
const referenceActivityLoading = ref(false);

const REF_ACTIVITY_KIND_LABELS = {
  reference_invite: 'Reference invite',
  reference_invite_skipped: 'Invite skipped',
  reference_reminder: 'Reminder',
  reference_thank_you_referee: 'Thank-you (reference)',
  applicant_reference_batch_notice: 'Applicant email (invites sent)',
  applicant_reference_completed_notice: 'Applicant email (reference completed)',
  reference_form_submitted: 'Reference form submitted',
  reference_invite_email_opened: 'Reference email open (pixel)'
};

const applicationReferences = computed(() => {
  const raw = detail.value?.profile?.references_json;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
});

const latestRequestForRefIndex = (idx) => {
  const rows = (referenceRequests.value || []).filter((r) => Number(r.reference_index) === Number(idx));
  rows.sort((a, b) => Number(b.id) - Number(a.id));
  return rows[0] || null;
};

const refRowStatus = (idx) => {
  const r = latestRequestForRefIndex(idx);
  return r ? String(r.status || '—') : '—';
};
const refRowSent = (idx) => {
  const r = latestRequestForRefIndex(idx);
  return r?.sent_at ? formatTime(r.sent_at) : '—';
};
const refRowOpened = (idx) => {
  const r = latestRequestForRefIndex(idx);
  return r?.email_opened_at ? formatTime(r.email_opened_at) : '—';
};
const refRowExpires = (idx) => {
  const r = latestRequestForRefIndex(idx);
  return r?.token_expires_at ? formatTime(r.token_expires_at) : '—';
};
const refRowCompleted = (idx) => {
  const r = latestRequestForRefIndex(idx);
  return r?.completed_at ? formatTime(r.completed_at) : '—';
};
const refRowReminders = (idx) => {
  const r = latestRequestForRefIndex(idx);
  if (!r) return '—';
  const parts = [];
  if (r.reminder_3d_sent_at) parts.push(`3d: ${formatTime(r.reminder_3d_sent_at)}`);
  if (r.reminder_24h_sent_at) parts.push(`24h: ${formatTime(r.reminder_24h_sent_at)}`);
  return parts.length ? parts.join(' · ') : '—';
};

const formatRefActivityKind = (meta) => {
  const k = meta?.kind;
  return REF_ACTIVITY_KIND_LABELS[k] || k || 'Event';
};

const refActivityOutcome = (meta) => {
  const o = meta?.outcome;
  return o ? String(o) : '';
};
const reviewRating = ref(4);
const reviewBody = ref('');
const reviewSaving = ref(false);

const parseInterviewerJson = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map((x) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const toDatetimeLocalValue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const syncInterviewFromProfile = () => {
  const p = detail.value?.profile;
  if (!p) {
    interviewStartsLocal.value = '';
    interviewTimezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    interviewerIds.value = [];
    return;
  }
  interviewStartsLocal.value = toDatetimeLocalValue(p.interview_starts_at);
  interviewTimezone.value = p.interview_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  interviewerIds.value = parseInterviewerJson(p.interview_interviewer_user_ids);
};

const interviewerName = (id) => {
  const u = (assignees.value || []).find((x) => Number(x.id) === Number(id));
  if (u) return `${u.first_name || ''} ${u.last_name || ''}`.trim() || `User ${id}`;
  return `User ${id}`;
};

const addInterviewerFromPick = () => {
  const v = interviewerPick.value ? parseInt(String(interviewerPick.value), 10) : null;
  interviewerPick.value = '';
  if (!v || interviewerIds.value.includes(v)) return;
  interviewerIds.value = [...interviewerIds.value, v];
};

const removeInterviewer = (id) => {
  interviewerIds.value = interviewerIds.value.filter((x) => Number(x) !== Number(id));
};

const loadReferenceRequests = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    referenceRequestsLoading.value = true;
    const r = await api.get(`/hiring/candidates/${selectedId.value}/reference-requests`, {
      params: { agencyId: effectiveAgencyId.value }
    });
    referenceRequests.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    referenceRequests.value = [];
  } finally {
    referenceRequestsLoading.value = false;
  }
};

const loadReferenceActivity = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    referenceActivityLoading.value = true;
    const r = await api.get(`/hiring/candidates/${selectedId.value}/reference-activity`, {
      params: { agencyId: effectiveAgencyId.value, limit: 150 }
    });
    referenceActivity.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    referenceActivity.value = [];
  } finally {
    referenceActivityLoading.value = false;
  }
};

const openReferencesTab = async () => {
  tab.value = 'references';
  await Promise.all([loadReferenceRequests(), loadReferenceActivity()]);
};

const formatRefResponses = (row) => {
  try {
    return JSON.stringify(row.responses_json, null, 2);
  } catch {
    return '';
  }
};

const saveInterviewSchedule = async (sendReferenceRequests = false) => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    interviewSaving.value = true;
    let iso = null;
    if (interviewStartsLocal.value) {
      const d = new Date(interviewStartsLocal.value);
      iso = Number.isFinite(d.getTime()) ? d.toISOString() : null;
    }
    const resp = await api.patch(
      `/hiring/candidates/${selectedId.value}/interview`,
      {
        interviewStartsAt: iso,
        interviewTimezone: interviewTimezone.value || null,
        interviewStatus: iso ? 'scheduled' : null,
        interviewerUserIds: interviewerIds.value,
        sendReferenceRequests: sendReferenceRequests === true
      },
      { params: { agencyId: effectiveAgencyId.value } }
    );
    await loadDetail();
    syncInterviewFromProfile();
    if (sendReferenceRequests && resp.data?.referenceSendResult?.errors?.length) {
      window.alert(resp.data.referenceSendResult.errors.join('\n'));
    }
    if (sendReferenceRequests) {
      await loadReferenceRequests();
      await loadReferenceActivity();
    }
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save interview');
  } finally {
    interviewSaving.value = false;
  }
};

const sendReferenceRequestsOnly = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    interviewSaving.value = true;
    const resp = await api.post(
      `/hiring/candidates/${selectedId.value}/reference-requests/send`,
      { onlyIfNotSent: true },
      { params: { agencyId: effectiveAgencyId.value } }
    );
    await loadReferenceRequests();
    await loadReferenceActivity();
    const errs = resp.data?.errors;
    if (Array.isArray(errs) && errs.length) window.alert(errs.join('\n'));
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to send reference requests');
  } finally {
    interviewSaving.value = false;
  }
};

const cancelInterviewSchedule = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  // eslint-disable-next-line no-alert
  if (!confirm('Cancel this scheduled interview on the profile?')) return;
  try {
    interviewSaving.value = true;
    await api.patch(
      `/hiring/candidates/${selectedId.value}/interview`,
      {
        interviewStartsAt: '',
        interviewStatus: 'cancelled',
        interviewerUserIds: [],
        interviewTimezone: null
      },
      { params: { agencyId: effectiveAgencyId.value } }
    );
    await loadDetail();
    syncInterviewFromProfile();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to cancel');
  } finally {
    interviewSaving.value = false;
  }
};

const submitReview = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  const body = reviewBody.value.trim();
  if (!body) return;
  try {
    reviewSaving.value = true;
    await api.post(
      `/hiring/candidates/${selectedId.value}/reviews`,
      { body, rating: reviewRating.value },
      { params: { agencyId: effectiveAgencyId.value } }
    );
    reviewBody.value = '';
    await loadDetail();
    tab.value = 'reviews';
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to save review');
  } finally {
    reviewSaving.value = false;
  }
};

const toggleNoteKudos = async (noteId) => {
  try {
    await api.post(`/hiring/candidates/${selectedId.value}/notes/${noteId}/kudos`, {}, { params: { agencyId: effectiveAgencyId.value } });
    const r = await api.get(`/hiring/candidates/${selectedId.value}`, { params: { agencyId: effectiveAgencyId.value } });
    if (r.data?.notes) detail.value.notes = r.data.notes;
  } catch {
    /* ignore */
  }
};

const toggleNoteReaction = async (noteId, emoji) => {
  const n = (detail.value.notes || []).find((x) => Number(x.id) === Number(noteId));
  const has = (n?.reactions || []).some(
    (rx) => Number(rx.userId) === Number(authStore.user?.id) && rx.emoji === emoji
  );
  try {
    if (has) {
      await api.delete(`/hiring/candidates/${selectedId.value}/notes/${noteId}/reactions`, {
        params: { agencyId: effectiveAgencyId.value, emoji }
      });
    } else {
      await api.post(
        `/hiring/candidates/${selectedId.value}/notes/${noteId}/reactions`,
        { emoji },
        { params: { agencyId: effectiveAgencyId.value } }
      );
    }
    const r = await api.get(`/hiring/candidates/${selectedId.value}`, { params: { agencyId: effectiveAgencyId.value } });
    if (r.data?.notes) detail.value.notes = r.data.notes;
  } catch {
    /* ignore */
  }
};

const loadTasks = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  try {
    tasksLoading.value = true;
    const r = await api.get(`/hiring/candidates/${selectedId.value}/tasks`, { params: { agencyId: effectiveAgencyId.value } });
    tasks.value = r.data || [];
  } catch {
    tasks.value = [];
  } finally {
    tasksLoading.value = false;
  }
};

const createTask = async () => {
  if (!selectedId.value || !effectiveAgencyId.value) return;
  if (!taskTitle.value.trim() || !taskAssigneeId.value) return;
  try {
    taskSaving.value = true;
    const body = {
      title: taskTitle.value.trim(),
      description: String(taskDescription.value || '').trim() || null,
      assignedToUserId: parseInt(taskAssigneeId.value, 10),
      agencyId: effectiveAgencyId.value,
      kind: 'call',
      dueDate: taskDueDate.value ? new Date(taskDueDate.value).toISOString() : null
    };
    await api.post(`/hiring/candidates/${selectedId.value}/tasks`, body);
    taskTitle.value = '';
    taskDescription.value = '';
    taskDueDate.value = '';
    await loadTasks();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to create task');
  } finally {
    taskSaving.value = false;
  }
};

const loadJobDescriptions = async () => {
  if (!effectiveAgencyId.value) {
    jobDescriptions.value = [];
    return;
  }
  try {
    jobsLoading.value = true;
    const r = await api.get('/hiring/job-descriptions', { params: { agencyId: effectiveAgencyId.value } });
    jobDescriptions.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    jobDescriptions.value = [];
  } finally {
    jobsLoading.value = false;
  }
};

function isTruthyQueryFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

// Create modal
const showCreate = ref(false);
const createSaving = ref(false);
const createError = ref('');
const createForm = ref({
  firstName: '',
  lastName: '',
  personalEmail: '',
  phoneNumber: '',
  jobDescriptionId: '',
  appliedRole: '',
  source: '',
  coverLetterText: ''
});

const openCreate = () => {
  createError.value = '';
  createSaving.value = false;
  createForm.value = {
    firstName: '',
    lastName: '',
    personalEmail: '',
    phoneNumber: '',
    jobDescriptionId: '',
    appliedRole: '',
    source: '',
    coverLetterText: ''
  };
  showCreate.value = true;
};
const closeCreate = () => {
  showCreate.value = false;
};

const createApplicant = async () => {
  if (!effectiveAgencyId.value) {
    createError.value = 'No agency selected. Please pick an agency in the header selector and try again.';
    return;
  }
  try {
    createSaving.value = true;
    createError.value = '';
    const body = {
      agencyId: effectiveAgencyId.value,
      firstName: createForm.value.firstName,
      lastName: createForm.value.lastName,
      personalEmail: createForm.value.personalEmail,
      phoneNumber: createForm.value.phoneNumber || null,
      jobDescriptionId: createForm.value.jobDescriptionId ? parseInt(String(createForm.value.jobDescriptionId), 10) : null,
      appliedRole: createForm.value.appliedRole || null,
      source: createForm.value.source || null
    };
    if (createForm.value.coverLetterText && String(createForm.value.coverLetterText).trim()) {
      body.coverLetterText = String(createForm.value.coverLetterText).trim();
    }
    const r = await api.post('/hiring/candidates', body);
    const newId = r.data?.user?.id;
    closeCreate();
    await refresh();
    if (newId) await selectCandidate(newId);
  } catch (e) {
    createError.value = e.response?.data?.error?.message || 'Failed to create applicant';
    // In production, some errors are easy to miss in a modal; surface them loudly too.
    try {
      // eslint-disable-next-line no-alert
      alert(createError.value);
    } catch {
      // ignore
    }
  } finally {
    createSaving.value = false;
  }
};

// Job descriptions manager modal
const showJobs = ref(false);
const jobCreating = ref(false);
const jobCreateError = ref('');
const newJob = ref({ title: '', descriptionText: '' });
const jobFile = ref(null);
const jobSelectedFile = ref(null);
const editingJobId = ref(null);
const editingJobHasFile = ref(false);

const openJobDescriptions = async () => {
  showJobs.value = true;
  jobCreateError.value = '';
  editingJobId.value = null;
  editingJobHasFile.value = false;
  newJob.value = { title: '', descriptionText: '' };
  jobSelectedFile.value = null;
  if (jobFile.value) jobFile.value.value = '';
  await loadJobDescriptions();
};

const closeJobDescriptions = () => {
  showJobs.value = false;
  editingJobId.value = null;
  editingJobHasFile.value = false;
};

const onJobFileChange = (e) => {
  jobSelectedFile.value = e?.target?.files?.[0] || null;
};

const createJobDescription = async () => {
  if (!effectiveAgencyId.value) return;
  if (!newJob.value.title.trim()) return;
  try {
    jobCreating.value = true;
    jobCreateError.value = '';
    const fd = new FormData();
    fd.append('agencyId', String(effectiveAgencyId.value));
    fd.append('title', String(newJob.value.title || '').trim());
    if (newJob.value.descriptionText && String(newJob.value.descriptionText).trim()) {
      fd.append('descriptionText', String(newJob.value.descriptionText).trim());
    }
    if (jobSelectedFile.value) {
      fd.append('file', jobSelectedFile.value);
    }
    if (editingJobId.value) {
      if (editingJobHasFile.value && !jobSelectedFile.value) {
        jobCreateError.value = 'Please upload a replacement file to create a new version.';
        return;
      }
      if (editingJobHasFile.value) fd.append('createNewVersion', '1');
      await api.put(`/hiring/job-descriptions/${editingJobId.value}`, fd);
    } else {
      await api.post('/hiring/job-descriptions', fd);
    }
    editingJobId.value = null;
    editingJobHasFile.value = false;
    newJob.value = { title: '', descriptionText: '' };
    jobSelectedFile.value = null;
    if (jobFile.value) jobFile.value.value = '';
    await loadJobDescriptions();
  } catch (e) {
    jobCreateError.value = e.response?.data?.error?.message || 'Failed to create job description';
  } finally {
    jobCreating.value = false;
  }
};

const startEditJob = (j) => {
  editingJobId.value = j?.id ? Number(j.id) : null;
  editingJobHasFile.value = !!j?.hasFile;
  newJob.value = {
    title: String(j?.title || ''),
    descriptionText: String(j?.descriptionText || '')
  };
  jobSelectedFile.value = null;
  jobCreateError.value = '';
  if (jobFile.value) jobFile.value.value = '';
};

const cancelEditJob = () => {
  editingJobId.value = null;
  editingJobHasFile.value = false;
  newJob.value = { title: '', descriptionText: '' };
  jobSelectedFile.value = null;
  jobCreateError.value = '';
  if (jobFile.value) jobFile.value.value = '';
};

const removeJobDescription = async (j) => {
  if (!j?.id || !effectiveAgencyId.value) return;
  const ok = window.confirm(`Delete "${j.title}"? Existing applicant history will be preserved.`);
  if (!ok) return;
  try {
    await api.delete(`/hiring/job-descriptions/${j.id}`, { params: { agencyId: effectiveAgencyId.value } });
    if (editingJobId.value === Number(j.id)) cancelEditJob();
    if (createForm.value.jobDescriptionId === String(j.id)) createForm.value.jobDescriptionId = '';
    await loadJobDescriptions();
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to delete job description');
  }
};

const selectJobForCreate = (j) => {
  if (!j?.id) return;
  createForm.value.jobDescriptionId = String(j.id);
  showJobs.value = false;
};

const viewJobFile = async (j) => {
  if (!j?.id || !effectiveAgencyId.value) return;
  try {
    const resp = await api.get(`/hiring/job-descriptions/${j.id}/view`, { params: { agencyId: effectiveAgencyId.value } });
    const url = resp.data?.url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else alert('No URL returned');
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to open job description file');
  }
};

const createApplicationLink = async (j) => {
  if (!j?.id) return;
  try {
    const r = await api.post(`/intake-links/from-job/${j.id}`);
    const link = r.data?.link;
    if (!link?.public_key) {
      alert('Link created but no URL returned');
      return;
    }
    const url = buildPublicIntakeUrl(link.public_key);
    await navigator.clipboard.writeText(url);
    alert(`Application link created and copied to clipboard:\n\n${url}\n\nConfigure document templates and steps in Digital Forms.`);
  } catch (e) {
    alert(e.response?.data?.error?.message || 'Failed to create application link');
  }
};

// Formatting helpers
const formatTime = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso || '';
  }
};
const formatDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString();
  } catch {
    return iso || '';
  }
};
const noteAuthor = (n) => {
  const name = [n.author_first_name, n.author_last_name].filter(Boolean).join(' ').trim();
  return name || n.author_email || `User ${n.author_user_id || ''}`.trim();
};

const reactionCounts = (reactions) => {
  const m = new Map();
  for (const r of reactions || []) {
    const e = String(r.emoji || '').trim();
    if (!e) continue;
    m.set(e, (m.get(e) || 0) + 1);
  }
  return [...m.entries()].map(([emoji, c]) => ({ emoji, c }));
};

watch(effectiveAgencyId, async (next) => {
  if (!next) return;
  await refresh();
  await loadJobDescriptions();
  selectedId.value = null;
  detail.value = {
    user: null,
    profile: null,
    jobDescription: null,
    notes: [],
    reviews: [],
    myTimeCapsules: [],
    latestResearch: null,
    latestPreScreen: null
  };
});

watch(
  () => route.query?.openJobs,
  async (v) => {
    if (!isTruthyQueryFlag(v)) return;
    // Ensure jobs are loaded so the modal isn't empty on first open.
    await loadJobDescriptions();
    await openJobDescriptions();
    const nextQuery = { ...route.query };
    delete nextQuery.openJobs;
    if ('openJobsTs' in nextQuery) delete nextQuery.openJobsTs;
    await router.replace({ query: nextQuery });
  }
);

const onOpenHiringJobsModal = async () => {
  await openJobDescriptions();
};

onMounted(async () => {
  // Ensure we have agency lists for the selector.
  try {
    const role = String(authStore.user?.role || '').toLowerCase();
    if (role === 'super_admin') {
      await agencyStore.fetchAgencies();
    } else {
      await agencyStore.fetchUserAgencies();
    }
  } catch {
    // ignore; best effort
  }

  if (props.embeddedDetailOnly) {
    if (props.embeddedAgencyId) {
      selectedAgencyId.value = String(props.embeddedAgencyId);
    }
    await loadJobDescriptions();
    const uid = Number(props.embeddedCandidateUserId || 0);
    if (uid > 0) {
      tab.value = props.embeddedInitialTab || 'interview';
      await selectCandidate(uid);
    }
    return;
  }

  // Restore last selected agency for this user (prevents “I came back and it’s gone” confusion).
  try {
    const raw = localStorage.getItem(agencyStorageKey.value);
    const restored = raw ? parseInt(String(raw), 10) : null;
    if (restored && (agencyChoices.value || []).some((a) => Number(a?.id) === restored)) {
      selectedAgencyId.value = String(restored);
    }
  } catch {
    // ignore
  }

  // Default selection to current agency (or first available).
  if (!selectedAgencyId.value) {
    if (effectiveAgencyId.value) {
      selectedAgencyId.value = String(effectiveAgencyId.value);
    } else if ((agencyChoices.value || []).length > 0) {
      selectedAgencyId.value = String(agencyChoices.value[0].id);
    }
  }
  if (route.query?.filterJobId) {
    filterJobId.value = String(route.query.filterJobId);
  }
  if (route.query?.jobDescriptionId) {
    filterJobId.value = String(route.query.jobDescriptionId);
  }
  if (route.query?.agencyId) {
    const aid = parseInt(String(route.query.agencyId), 10);
    if (aid && (agencyChoices.value || []).some((a) => Number(a?.id) === aid)) {
      selectedAgencyId.value = String(aid);
    }
  }
  if (route.query?.stage) {
    const s = String(route.query.stage).toLowerCase();
    if (['all', 'applied', 'review', 'interview', 'offered', 'hired', 'not_hired'].includes(s)) {
      listStageTab.value = s === 'applied' ? 'all' : s;
      stageFilter.value = s === 'all' ? 'active' : s;
    }
  }
  if (route.query?.q) {
    q.value = String(route.query.q);
  }
  await loadJobDescriptions();
  await refresh();

  const deepCandidateId = route.query?.candidateId ? parseInt(String(route.query.candidateId), 10) : null;
  if (deepCandidateId && Number.isFinite(deepCandidateId)) {
    await selectCandidate(deepCandidateId);
    const nextQuery = { ...route.query };
    delete nextQuery.candidateId;
    delete nextQuery.stage;
    delete nextQuery.jobDescriptionId;
    delete nextQuery.q;
    await router.replace({ query: nextQuery });
  }

  // Allow deep-linking from navigation (People Ops → Job descriptions)
  if (isTruthyQueryFlag(route.query?.openJobs)) {
    await openJobDescriptions();
  }
  window.addEventListener('open-hiring-jobs-modal', onOpenHiringJobsModal);
});

onUnmounted(() => {
  window.removeEventListener('open-hiring-jobs-modal', onOpenHiringJobsModal);
});
</script>

<style scoped>
.hiring-root {
  padding-top: 16px;
  padding-bottom: 40px;
  /* Fill the app content area (avoid centered gap next to sidebar). */
  width: 100%;
  max-width: 100%;
  margin: 0;
  padding-left: 16px;
  padding-right: 16px;
}
.hiring-root--embedded {
  padding: 0;
  width: 100%;
  max-width: 100%;
  margin: 0;
}
.grid--embedded {
  grid-template-columns: minmax(0, 1fr);
}
.detail-panel--embedded {
  border: none;
  padding: 0;
  min-height: 480px;
}
.job-dash {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.job-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 14px;
  min-width: 160px;
  max-width: 240px;
  text-align: left;
  cursor: pointer;
  background: linear-gradient(145deg, #ffffff, #f8fafc);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.job-card.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}
.job-card-title {
  font-weight: 700;
  font-size: 14px;
  color: #0f172a;
}
.job-card-meta {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}
.job-card-badge {
  display: inline-block;
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
}
.job-card--other {
  border-style: dashed;
}
.applied-at {
  white-space: nowrap;
}
.pill-new {
  background: #dcfce7;
  color: #166534;
}
.toggle-new {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #374151;
  white-space: nowrap;
}
.note-row-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.note-head-main {
  flex: 1;
  min-width: 0;
}
.note-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.btn-xs {
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 8px;
}
.btn-xs.active {
  border-color: #2563eb;
  color: #1d4ed8;
}
.btn-icon {
  border: none;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}
.rx-tools {
  display: inline-flex;
  gap: 4px;
}
.rx-labels span {
  margin-right: 8px;
}
.interview-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px 12px;
  align-items: center;
  max-width: 640px;
}
.interview-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.chips {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
}
.chip-x {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.linkish {
  border: none;
  background: none;
  color: #5b21b6;
  cursor: pointer;
  padding: 0;
  font: inherit;
  text-decoration: underline;
}
.capsule-hint {
  margin-top: 12px;
  padding: 10px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.subtle {
  color: #6b7280;
  font-size: 13px;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

/* Compact outline-style header buttons (Refresh/New applicant). */
.header-actions .btn {
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.2;
  border-radius: 8px;
  border: 1px solid currentColor;
  background: transparent !important;
  box-shadow: none !important;
  transform: none !important;
}
.header-actions .btn-primary {
  color: var(--primary);
}
.header-actions .btn-secondary {
  color: var(--text-secondary);
}
.header-actions .btn:hover:not(:disabled) {
  background: rgba(15, 23, 42, 0.05) !important;
}
.grid {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr); /* prevent content from widening the grid */
  gap: 16px;
  max-width: 100%;
}
.panel {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  min-height: 520px;
  min-width: 0; /* allow grid children to shrink (prevents horizontal overflow) */
}
.detail-panel {
  min-width: 0;
}
.list-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
  align-items: center;
}
.stage-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 8px;
}
.stage-tab {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.stage-tab:hover {
  background: #f5f3ff;
  color: #5b21b6;
}
.stage-tab.active {
  color: #6d28d9;
  background: #ede9fe;
}
.stage-count {
  background: #e2e8f0;
  color: #475569;
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 11px;
}
.stage-tab.active .stage-count {
  background: #ddd6fe;
  color: #5b21b6;
}
.list-filters-extra {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: -2px 0 10px;
}
.list-controls .btn-sm.active {
  outline: 2px solid #7c3aed;
}
.modern-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.row-avatar {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}
.row-body {
  min-width: 0;
  flex: 1;
}
.row-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
.detail-empty {
  text-align: center;
  padding: 48px 20px;
}
.modern-detail-header {
  align-items: flex-start;
}
.detail-identity {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-width: 0;
}
.avatar-fallback {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
}
.detail-role {
  margin-top: 2px;
  font-size: 13px;
}
.contact-meta {
  gap: 12px;
  flex-wrap: wrap;
}
.stage-move .input {
  min-width: 140px;
  max-width: 160px;
}
.more-actions {
  position: relative;
}
.more-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  min-width: 180px;
  z-index: 20;
  padding: 6px;
  display: flex;
  flex-direction: column;
}
.more-menu button {
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.more-menu button:hover {
  background: #f8fafc;
}
.more-menu button.danger {
  color: #b91c1c;
}
.pill-applied { background: #f1f5f9; color: #475569; }
.pill-review { background: #ede9fe; color: #6d28d9; }
.pill-interview { background: #ffedd5; color: #c2410c; }
.pill-offered { background: #dbeafe; color: #1d4ed8; }
.pill-hired { background: #dcfce7; color: #166534; }
.pill-not-hired { background: #fee2e2; color: #991b1b; }
.input, .textarea, select.input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  font-size: 14px;
}
.textarea {
  resize: vertical;
}
.report-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.report-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.report-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}
.report-job {
  color: #374151;
}
.report-count {
  font-weight: 600;
  color: #6b7280;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list-item {
  text-align: left;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
}
.list-item.active {
  border-color: #8b5cf6;
  background: #f5f3ff;
  box-shadow: inset 3px 0 0 #7c3aed;
}
.list-item-duplicate {
  border-color: #dc2626;
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.25);
}
.name {
  font-weight: 600;
}
.meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
  flex-wrap: wrap;
}
.email {
  color: #6b7280;
  font-size: 13px;
}
.pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e5e7eb;
  font-size: 12px;
  color: #374151;
}
.pill-duplicate {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
.unread-pill {
  background: #dbeafe;
  color: #1d4ed8;
}
.resume-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  flex-wrap: wrap;
}
.resume-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid transparent;
}
.resume-badge.ok {
  background: #dcfce7;
  color: #166534;
  border-color: #86efac;
}
.resume-badge.warn {
  background: #ffedd5;
  color: #9a3412;
  border-color: #fdba74;
}
.resume-badge.bad {
  background: #fee2e2;
  color: #991b1b;
  border-color: #fca5a5;
}
.resume-badge.muted {
  background: #f3f4f6;
  color: #374151;
  border-color: #e5e7eb;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  align-items: flex-start;
}
.detail-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.candidate-photo {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  object-fit: cover;
  border: 1px solid #e5e7eb;
  background: #f3f4f6;
}
.detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
}

/* Keep action buttons inline and content-sized (avoid full-width stacking). */
.detail-actions .btn {
  flex: 0 0 auto;
  width: auto !important;
  min-width: 0;
  max-width: 100%;
}
.detail-name {
  margin: 0;
}
.detail-meta {
  margin-top: 4px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.muted {
  color: #6b7280;
}
.small {
  font-size: 12px;
}
.tabs {
  display: flex;
  gap: 8px;
  margin: 12px 0;
  flex-wrap: wrap;
}
.tab {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
}
.tab.active {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.tab-body {
  padding-top: 6px;
}
.kv {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed #e5e7eb;
}
.application-history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.application-history-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  background: #f9fafb;
}
.application-history-title {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: baseline;
  flex-wrap: wrap;
}
.application-history-preview {
  margin-top: 6px;
}
.application-history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}
.k {
  color: #6b7280;
  font-size: 13px;
}
.v {
  font-size: 14px;
}
.note-compose {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.note {
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
}
.note-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.note-author {
  font-weight: 600;
  font-size: 13px;
}
.note-time {
  color: #6b7280;
  font-size: 12px;
}
.resume-actions {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.resume-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.resume-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}
.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.task-compose {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}
.task-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
}
.task {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
  padding: 10px;
  margin-bottom: 8px;
}
.task-title {
  font-weight: 600;
}
.research-box {
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #ffffff;
  color: #111827;
  padding: 10px;
  max-width: 100%;
}
.markdown {
  font-size: 14px;
  line-height: 1.55;
  color: #111827;
  max-width: 100%;
  overflow-x: auto; /* contain wide tables/links inside the box */
  overflow-wrap: anywhere;
  word-break: break-word;
}
.markdown :deep(h2) {
  font-size: 16px;
  margin: 14px 0 8px;
}
.markdown :deep(h3) {
  font-size: 15px;
  margin: 12px 0 6px;
}
.markdown :deep(p) {
  margin: 8px 0;
}
.markdown :deep(ul),
.markdown :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}
.markdown :deep(code) {
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 0.95em;
}
.markdown :deep(pre) {
  background: #f3f4f6;
  border-radius: 10px;
  padding: 10px;
  overflow: auto;
}
.markdown :deep(table) {
  /* Keep semantic table layout; scrolling is handled by the markdown container. */
  display: table;
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  table-layout: auto;
}
.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 8px;
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.markdown :deep(th) {
  white-space: nowrap;
}
.markdown :deep(td) {
  white-space: normal;
}
.markdown :deep(th:nth-child(1)),
.markdown :deep(td:nth-child(1)) {
  min-width: 220px;
}
.markdown :deep(th:nth-child(2)),
.markdown :deep(td:nth-child(2)) {
  min-width: 220px;
}
.markdown :deep(th:nth-child(3)),
.markdown :deep(td:nth-child(3)) {
  min-width: 360px;
}
.markdown :deep(th:last-child),
.markdown :deep(td:last-child) {
  min-width: 120px;
  white-space: nowrap;
}

.search-suggestions {
  max-width: 100%;
  overflow-x: auto;
}
.search-suggestions :deep(*) {
  max-width: 100%;
}
.search-suggestions :deep(a) {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.markdown :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  background: #ffffff;
}
.summary-snapshot {
  grid-column: 1 / -1;
  background: #f8fafc;
}
.summary-title {
  font-weight: 700;
  margin-bottom: 8px;
}
.summary-bullets {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
}
.summary-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.summary-item {
  border-top: 1px solid #f3f4f6;
  padding-top: 10px;
}
.summary-item:first-child {
  border-top: none;
  padding-top: 0;
}
.loading {
  color: #6b7280;
  padding: 12px 0;
}
.empty {
  color: #6b7280;
  padding: 16px 0;
}
.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.info-banner {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  color: #155e75;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(107, 114, 128, 0.35);
  border-top-color: rgba(107, 114, 128, 0.9);
  border-radius: 999px;
  margin-right: 6px;
  vertical-align: -2px;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.search-suggestions {
  margin-top: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  padding: 10px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  word-break: break-all;
}

.ref-req-table {
  width: 100%;
  margin-top: 12px;
  font-size: 13px;
}

.ref-subheading {
  margin: 22px 0 8px 0;
  font-size: 15px;
  font-weight: 600;
  color: #111827;
}

.ref-subheading:first-of-type {
  margin-top: 8px;
}

.ref-activity-list {
  list-style: none;
  padding: 0;
  margin: 12px 0 0 0;
}

.ref-activity-item {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fff;
}

.ref-activity-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 4px;
}

.ref-activity-time {
  font-weight: 600;
  color: #111827;
}

.ref-activity-kind {
  color: #374151;
}

.ref-activity-outcome {
  color: #6b7280;
  text-transform: lowercase;
}

.ref-activity-details {
  margin-top: 8px;
}

.error-inline {
  color: #b91c1c;
}

.empty.subtle {
  padding: 8px 0;
}

.ref-resp-block {
  margin-top: 16px;
}

.ref-resp-block h4 {
  margin: 0 0 6px 0;
  font-size: 14px;
}

.mono-block {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px;
  overflow: auto;
  max-height: 320px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 50;
}
.modal {
  width: 720px;
  max-width: 100%;
  background: white;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #e5e7eb;
}
.btn-close {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
}
.modal-body {
  padding: 14px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.job-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
}
.divider {
  height: 1px;
  background: #e5e7eb;
  margin: 12px 0;
}
.job-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.job-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}
.pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}
.light-pre {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px;
  color: #111827;
}
.cover-letter-docs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid #e5e7eb;
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .panel {
    min-height: auto;
  }
  .resume-actions {
    grid-template-columns: 1fr;
  }
  .task-row {
    grid-template-columns: 1fr;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

