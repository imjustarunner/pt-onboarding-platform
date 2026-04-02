<template>
  <div class="kiosk">
    <div class="kiosk-card">
      <h2>{{ modeTitle }}</h2>
      <p class="subtitle">{{ modeSubtitle }}</p>

      <div v-if="!modeSelected && showModeSelector" class="step">
        <h3>What would you like to do?</h3>
        <div class="mode-buttons">
          <button v-if="allowedModes.includes('event')" type="button" class="mode-btn" @click="selectMode('event')">
            <span class="mode-icon">📅</span>
            <span class="mode-label">Office Event Check-in</span>
            <span class="mode-desc">Select your appointment and complete questionnaire</span>
          </button>
          <button v-if="allowedModes.includes('client_check_in')" type="button" class="mode-btn" @click="selectMode('client_check_in')">
            <span class="mode-icon">✓</span>
            <span class="mode-label">Client Check-in</span>
            <span class="mode-desc">Select your appointment and check in</span>
          </button>
          <button v-if="allowedModes.includes('clock') && programSites.length > 0" type="button" class="mode-btn" @click="selectMode('clock')">
            <span class="mode-icon">⏱️</span>
            <span class="mode-label">Clock In / Out</span>
            <span class="mode-desc">Record your shift start or end time</span>
          </button>
          <button v-if="allowedModes.includes('skill_builders')" type="button" class="mode-btn" @click="selectMode('skill_builders')">
            <span class="mode-icon">🎯</span>
            <span class="mode-label">Skill Builders time</span>
            <span class="mode-desc">Pick the program event, then clock in or out as yourself (no personal login)</span>
          </button>
          <button v-if="allowedModes.includes('guardian') && programSites.length > 0" type="button" class="mode-btn" @click="selectMode('guardian')">
            <span class="mode-icon">👤</span>
            <span class="mode-label">Guardian Check-in</span>
            <span class="mode-desc">Check in or out as a guardian</span>
          </button>
        </div>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 1" class="step">
        <h3>Guardian Check-in — Select Site</h3>
        <div class="grid">
          <button v-for="s in programSites" :key="s.id" class="pick" @click="selectGuardianSite(s)">
            <div style="font-weight: 800;">{{ s.name }}</div>
            <div style="color: var(--text-secondary); font-size: 13px;">{{ s.program_name }}</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="selectMode(null)">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 2" class="step">
        <h3>Guardian Check-in — Select Your Name</h3>
        <div v-if="loadingGuardians" class="loading">Loading…</div>
        <div v-else class="grid">
          <button v-for="g in guardians" :key="g.id" class="pick" @click="selectGuardian(g)">
            <div style="font-weight: 800;">{{ g.display_name || `${g.first_name} ${g.last_name}` }}</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="guardianStep = 1">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 3" class="step">
        <h3>Guardian Check-in — Select Client</h3>
        <div v-if="loadingGuardianClients" class="loading">Loading clients…</div>
        <div v-else class="grid">
          <button
            v-for="c in guardianClients"
            :key="c.id"
            type="button"
            class="pick"
            :disabled="c.guardian_portal_locked"
            :title="c.guardian_portal_locked ? 'Check-in does not use guardian waivers for adults 18+.' : ''"
            @click="selectGuardianClientForCheckin(c)"
          >
            <div style="font-weight: 800;">
              {{ c.display_name || c.initials || `Client ${c.id}` }}
              <span v-if="c.guardian_portal_locked" class="muted small"> (18+)</span>
            </div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="guardianStep = 2">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 4" class="step">
        <h3>Check In or Check Out</h3>
        <p>Client: {{ selectedGuardianClient?.display_name || selectedGuardianClient?.initials }}</p>
        <div class="mode-buttons">
          <button type="button" class="mode-btn" @click="beginGuardianCheckInFlow(true)">
            <span class="mode-icon">▶</span>
            <span class="mode-label">Check In</span>
          </button>
          <button type="button" class="mode-btn" @click="beginGuardianCheckInFlow(false)">
            <span class="mode-icon">⏹</span>
            <span class="mode-label">Check Out</span>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="guardianStep = 3">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 45" class="step">
        <h3>Review waivers</h3>
        <p class="muted">
          Confirm the details on file for
          {{ selectedGuardianClient?.display_name || selectedGuardianClient?.initials }}.
        </p>
        <div v-if="guardianWaiverLoading" class="loading">Loading…</div>
        <template v-else>
          <div v-for="entry in kioskWaiverDisplayList" :key="entry.key" class="gw-kiosk-section">
            <h4>{{ waiverMissingLabel(entry.key) }}</h4>
            <ul v-if="entry.lines.length" class="gw-kiosk-lines">
              <li v-for="(line, idx) in entry.lines" :key="idx">{{ line }}</li>
            </ul>
            <p v-else class="muted small">No details entered for this section.</p>
            <button type="button" class="btn btn-secondary btn-sm" @click="openKioskWaiverEdit(entry.key)">
              Edit section
            </button>
          </div>
          <div class="actions" style="margin-top: 16px;">
            <button type="button" class="btn btn-secondary" @click="guardianStep = 4">Back</button>
            <button type="button" class="btn btn-primary" @click="guardianStep = 5">Confirm all and continue</button>
          </div>
        </template>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 10" class="step">
        <h3>Waivers required</h3>
        <p class="subtitle">
          This program requires guardian waivers on file before check-in. Complete them in the guardian portal (phone or computer), then return to the kiosk.
        </p>
        <div v-if="guardianWaiverLoading" class="loading">Checking waivers…</div>
        <template v-else>
          <ul v-if="(guardianWaiverStatus?.missing || []).length" class="gw-missing-list">
            <li v-for="m in guardianWaiverStatus.missing" :key="m">{{ waiverMissingLabel(m) }}</li>
          </ul>
          <p v-else class="muted">Unable to load waiver status. Try again or ask staff for help.</p>
        </template>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="guardianStep = 4">Back</button>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 5" class="step">
        <h3>Confirm</h3>
        <p v-if="guardianCheckIn && guardianWaiverStatus?.enabled && guardianWaiverStatus?.complete" class="muted" style="margin-bottom: 10px;">
          Waivers on file — confirming check-in.
        </p>
        <p>{{ guardianCheckIn ? 'Check in' : 'Check out' }} for {{ selectedGuardianClient?.display_name || selectedGuardianClient?.initials }}?</p>
        <div class="actions">
          <button class="btn btn-secondary" @click="guardianStep = 4">Back</button>
          <button class="btn btn-primary" :disabled="saving" @click="submitGuardianCheckin">
            {{ saving ? 'Submitting…' : 'Confirm' }}
          </button>
        </div>
      </div>

      <div v-else-if="mode === 'guardian' && guardianStep === 6" class="step">
        <h3>Done</h3>
        <p>Guardian {{ guardianCheckIn ? 'check-in' : 'check-out' }} recorded.</p>
        <button class="btn btn-primary" @click="resetGuardian">Start Over</button>
      </div>

      <div v-else-if="mode === 'skill_builders' && sbStep === 1" class="step">
        <h3>Skill Builders — choose date &amp; event</h3>
        <p class="hint" style="margin-bottom: 12px;">
          Shows program events tied to this office’s agencies for the day you pick. Tap an event, then clock in or out
          under your name.
        </p>
        <div class="row">
          <div class="field">
            <label>Program day</label>
            <input v-model="sbDate" type="date" @change="loadSbEvents" />
          </div>
        </div>
        <div v-if="sbLoading" class="loading">Loading Skill Builders events…</div>
        <div v-else-if="!sbEvents.length" class="muted">No Skill Builders events on this date for agencies at this office.</div>
        <div v-else class="grid">
          <button v-for="e in sbEvents" :key="e.id" type="button" class="pick" @click="selectSbEvent(e)">
            <div style="font-weight: 800;">{{ e.title }}</div>
            <div style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">
              {{ e.agencyName }} · {{ e.groupName }}
            </div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" type="button" @click="selectMode(null)">Back</button>
      </div>

      <div v-else-if="mode === 'skill_builders' && sbStep === 2" class="step">
        <h3>Clock in or clock out?</h3>
        <p class="muted" style="margin-bottom: 12px;">{{ selectedSbEvent?.title }}</p>
        <div class="mode-buttons">
          <button type="button" class="mode-btn" @click="startSbClockFlow('in')">
            <span class="mode-icon">▶</span>
            <span class="mode-label">Clock in</span>
          </button>
          <button type="button" class="mode-btn" @click="startSbClockFlow('out')">
            <span class="mode-icon">⏹</span>
            <span class="mode-label">Clock out</span>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" type="button" @click="sbStep = 1">Back</button>
      </div>

      <div v-else-if="mode === 'skill_builders' && sbStep === 3" class="step">
        <h3>{{ sbAction === 'in' ? 'Clock in' : 'Clock out' }} — tap your name</h3>
        <p class="muted" style="margin-bottom: 10px;">{{ selectedSbEvent?.title }}</p>
        <template v-if="sbAction === 'in'">
          <div class="field" style="margin-bottom: 12px;">
            <label>Scheduled session (optional)</label>
            <select v-model.number="sbSessionPick" class="select">
              <option :value="0">Not tied to a specific session</option>
              <option v-for="s in sbSessions" :key="s.id" :value="s.id">
                {{ formatSbSessionOption(s) }}
              </option>
            </select>
          </div>
          <div class="field" style="margin-bottom: 12px;">
            <label>Client on this punch (optional)</label>
            <select v-model.number="sbClientPick" class="select">
              <option :value="0">—</option>
              <option v-for="c in sbRoster.clients || []" :key="c.id" :value="c.id">
                {{ c.initials || c.identifier_code || `Client #${c.id}` }}
              </option>
            </select>
          </div>
        </template>
        <div v-if="sbLoading" class="loading">Loading roster…</div>
        <div v-else-if="!(sbRoster.providers || []).length" class="muted">No providers on this event roster.</div>
        <div v-else class="grid">
          <button
            v-for="p in sbRoster.providers"
            :key="p.id"
            type="button"
            class="pick"
            :disabled="sbSaving"
            @click="doSbClock(p)"
          >
            <div style="font-weight: 800;">{{ p.display_name || `${p.first_name} ${p.last_name}` }}</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" type="button" :disabled="sbSaving" @click="sbStep = 2">
          Back
        </button>
      </div>

      <div v-else-if="mode === 'skill_builders' && sbStep === 4" class="step">
        <h3>Done</h3>
        <p>{{ sbSuccessMessage }}</p>
        <button type="button" class="btn btn-primary" @click="resetSb">Start over</button>
      </div>

      <div v-else-if="mode === 'skill_builders' && sbStep === 35" class="step">
        <h3>Complete check-in survey</h3>
        <p class="muted" style="margin-bottom: 10px;">{{ selectedSbEvent?.title }} · {{ sbSelectedStaffName }}</p>
        <div v-for="survey in sbAttachedSurveys" :key="survey.attachmentId" class="survey" style="margin-bottom: 14px;">
          <h4 style="margin:0 0 8px;">{{ survey.title }}</h4>
          <p v-if="survey.description" class="muted small">{{ survey.description }}</p>
          <div v-for="q in (survey.questions || [])" :key="`${survey.attachmentId}-${q.id}`" class="q">
            <label>{{ q.label }}</label>

            <input
              v-if="['text'].includes(q.type)"
              v-model="sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].answer"
              type="text"
              autocomplete="off"
            />
            <textarea
              v-else-if="['textarea','written'].includes(q.type)"
              v-model="sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].answer"
              rows="3"
            ></textarea>
            <select
              v-else-if="['select','likert','nps','rating'].includes(q.type)"
              v-model="sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].answer"
            >
              <option value="">Select…</option>
              <option
                v-for="opt in normalizedOptions(q)"
                :key="String(opt.value)"
                :value="String(opt.value)"
              >
                {{ opt.label }}
              </option>
            </select>
            <div v-else-if="q.type === 'radio'" class="multi-select">
              <label v-for="opt in normalizedOptions(q)" :key="String(opt.value)" class="multi-select-option">
                <input
                  type="radio"
                  :name="`radio-${survey.attachmentId}-${q.id}`"
                  :value="String(opt.value)"
                  v-model="sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].answer"
                />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <div v-else-if="q.type === 'multiple_choice'" class="multi-select">
              <label v-for="opt in normalizedOptions(q)" :key="String(opt.value)" class="multi-select-option">
                <input
                  type="checkbox"
                  :checked="Array.isArray(sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].answer) && sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].answer.includes(String(opt.value))"
                  @change="toggleSbMulti(survey.attachmentId, q.id, String(opt.value))"
                />
                <span>{{ opt.label }}</span>
              </label>
            </div>
            <input
              v-else-if="['slider','scale'].includes(q.type)"
              v-model.number="sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].answer"
              type="range"
              :min="Number(q.scale?.min || 1)"
              :max="Number(q.scale?.max || 10)"
            />
            <input
              v-else
              v-model="sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].answer"
              type="text"
              autocomplete="off"
            />
            <label v-if="q.allowQuoteMe" class="boolean-row">
              <input
                type="checkbox"
                v-model="sbSurveyAnswers[sbAnswerKey(survey.attachmentId, q.id)].quoteMe"
              />
              <span>Quote me</span>
            </label>
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" :disabled="sbSaving" @click="sbStep = 3">Back</button>
          <button class="btn btn-primary" :disabled="sbSaving" @click="submitSbSurveyAndClockIn">
            {{ sbSaving ? 'Submitting…' : 'Complete check-in' }}
          </button>
        </div>
      </div>

      <div v-else-if="mode === 'clock' && clockStep === 1" class="step">
        <h3>Clock In or Clock Out</h3>
        <div class="mode-buttons">
          <button type="button" class="mode-btn" @click="clockAction = 'in'; clockStep = 2">
            <span class="mode-icon">▶</span>
            <span class="mode-label">Clock In</span>
          </button>
          <button type="button" class="mode-btn" @click="clockAction = 'out'; clockStep = 2">
            <span class="mode-icon">⏹</span>
            <span class="mode-label">Clock Out</span>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="selectMode(null)">Back</button>
      </div>

      <div v-else-if="mode === 'clock' && clockStep === 2" class="step">
        <h3>{{ clockAction === 'in' ? 'Clock In' : 'Clock Out' }} — Select Site</h3>
        <div class="grid">
          <button v-for="s in programSites" :key="s.id" class="pick" @click="selectClockSite(s)">
            <div style="font-weight: 800;">{{ s.name }}</div>
            <div style="color: var(--text-secondary); font-size: 13px;">{{ s.program_name }}</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="clockStep = 1">Back</button>
      </div>

      <div v-else-if="mode === 'clock' && clockStep === 3" class="step">
        <h3>{{ clockAction === 'in' ? 'Clock In' : 'Clock Out' }} — Tap Your Name or Enter PIN</h3>
        <p class="hint" style="margin-bottom: 12px;">Scheduled staff shown first. Tap your name or enter your 4-digit PIN.</p>
        <div class="pin-row">
          <label for="kiosk-pin">PIN</label>
          <input
            id="kiosk-pin"
            v-model="clockPin"
            type="password"
            name="kioskPin"
            inputmode="numeric"
            pattern="[0-9]*"
            maxlength="4"
            autocomplete="one-time-code"
            autocorrect="off"
            spellcheck="false"
            placeholder="••••"
            class="pin-input"
            @input="clockPin = ($event.target?.value || '').replace(/\D/g, '').slice(0, 4)"
            @keyup.enter="submitClockPin"
          />
          <button type="button" class="btn btn-primary" :disabled="!clockPinValid || identifyingByPin" @click="submitClockPin">
            {{ identifyingByPin ? 'Checking…' : 'Go' }}
          </button>
        </div>
        <div v-if="loadingStaff" class="loading">Loading staff…</div>
        <div v-else class="grid">
          <button v-for="s in programStaff" :key="s.id" class="pick" :class="{ 'pick-scheduled': s.scheduled_today }" @click="doClock(s)">
            <div style="font-weight: 800;">{{ s.display_name || `${s.first_name} ${s.last_name}` }}</div>
            <div v-if="s.scheduled_today" class="scheduled-badge">Scheduled today</div>
          </button>
        </div>
        <button class="btn btn-secondary" style="margin-top: 12px;" @click="clockStep = 2">Back</button>
      </div>

      <div v-else-if="mode === 'clock' && clockStep === 4" class="step">
        <h3>Done</h3>
        <p>{{ clockSuccessMessage }}</p>
        <button class="btn btn-primary" @click="resetClock">Start Over</button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div v-else-if="isEventMode && step === 1" class="step">
        <h3>Step 1: Select Your Appointment</h3>
        <button v-if="programSites.length > 0 && showModeSelector" class="btn btn-secondary" style="margin-bottom: 12px;" @click="selectMode(null)">Back</button>
        <div class="row">
          <div class="field">
            <label>Date</label>
            <input v-model="date" type="date" @change="loadEvents" />
          </div>
        </div>
        <div v-if="loading" class="loading">Loading events…</div>
        <div v-else class="grid">
          <button v-for="e in events" :key="e.id" class="pick" @click="selectEvent(e)">
            <div style="font-weight: 800;">
              {{ formatTime(e.startAt) }} — {{ e.roomName }}
            </div>
            <div style="color: var(--text-secondary); font-size: 13px; margin-top: 4px;">
              Provider: {{ e.providerInitials || '—' }}
            </div>
          </button>
        </div>
      </div>

      <div v-else-if="isEventMode && step === 2" class="step">
        <h3>Step 2: Check In</h3>
        <div class="row">
          <div class="field">
            <label>Room</label>
            <input :value="selectedEvent?.roomName" disabled />
          </div>
          <div class="field">
            <label>Time</label>
            <input :value="selectedEvent ? formatTime(selectedEvent.startAt) : ''" disabled />
          </div>
        </div>
        <div class="actions">
          <button class="btn btn-secondary" @click="reset" :disabled="saving">Back</button>
          <button class="btn btn-primary" @click="checkIn" :disabled="saving">
            {{ saving ? 'Checking in…' : 'Check In' }}
          </button>
        </div>
      </div>

      <div v-else-if="isEventMode && step === 4" class="step">
        <h3>Step 3: Questionnaire</h3>
        <div class="summary">
          <div><strong>Room:</strong> {{ selectedEvent?.roomName }}</div>
          <div><strong>Time:</strong> {{ selectedEvent ? formatTime(selectedEvent.startAt) : '' }}</div>
        </div>

        <div class="field" style="margin-top: 12px;">
          <label>Is this your typical day and time that you see this provider?</label>
          <select v-model="typicalDayTime">
            <option :value="''">Select…</option>
            <option :value="'yes'">Yes</option>
            <option :value="'no'">No</option>
          </select>
        </div>

        <div v-if="questionnaires.length === 0" class="muted" style="margin-top: 12px;">
          No questionnaires are configured for this office yet.
        </div>

        <div v-else class="field" style="margin-top: 12px;">
          <label>Questionnaire</label>
          <select v-model="selectedQuestionnaireKey" @change="loadDefinition">
            <option :value="''">Select…</option>
            <option v-for="q in questionnaires" :key="q.moduleId || q.intakeLinkId || q.title" :value="getQuestionnaireKey(q)">{{ q.title }}</option>
          </select>
        </div>

        <div v-if="definitionLoading" class="loading" style="margin-top: 10px;">Loading form…</div>
        <div v-else-if="selectedQuestionnaireKey && formFields.length === 0" class="muted" style="margin-top: 10px;">
          This questionnaire has no fields configured.
        </div>

        <div v-else-if="formFields.length > 0" class="survey">
          <h4 style="margin: 0 0 10px 0;">Questions</h4>
          <div v-for="field in formFields" :key="field.id" class="q">
            <label>{{ field.field_label }}</label>

            <input
              v-if="['text','email','phone'].includes(field.field_type)"
              v-model="answers[field.id]"
              :type="field.field_type === 'email' ? 'email' : (field.field_type === 'phone' ? 'tel' : 'text')"
              autocomplete="off"
            />

            <input v-else-if="field.field_type === 'number'" v-model="answers[field.id]" type="number" autocomplete="off" />
            <input v-else-if="field.field_type === 'date'" v-model="answers[field.id]" type="date" autocomplete="off" />
            <textarea v-else-if="field.field_type === 'textarea'" v-model="answers[field.id]" rows="4"></textarea>

            <select v-else-if="field.field_type === 'select'" v-model="answers[field.id]">
              <option value="">Select…</option>
              <option v-for="opt in (field.options || [])" :key="String(opt)" :value="String(opt)">{{ opt }}</option>
            </select>

            <div v-else-if="field.field_type === 'multi_select'" class="multi-select">
              <label v-for="opt in (field.options || [])" :key="String(opt)" class="multi-select-option">
                <input
                  type="checkbox"
                  :checked="Array.isArray(answers[field.id]) && answers[field.id].includes(String(opt))"
                  @change="toggleMulti(field.id, String(opt))"
                />
                <span>{{ opt }}</span>
              </label>
            </div>

            <label v-else-if="field.field_type === 'boolean'" class="boolean-row">
              <input type="checkbox" :checked="answers[field.id] === true" @change="answers[field.id] = $event.target.checked" />
              <span>Yes</span>
            </label>

            <input v-else v-model="answers[field.id]" type="text" autocomplete="off" />
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" @click="step = 2" :disabled="saving">Back</button>
          <button class="btn btn-primary" @click="submit" :disabled="saving || !selectedQuestionnaireKey || typicalDayTime === ''">
            {{ saving ? 'Submitting…' : 'Submit' }}
          </button>
        </div>
      </div>

      <div v-else-if="isEventMode && step === 5" class="step">
        <h3>Submitted</h3>
        <p>Thank you. Your check-in has been recorded.</p>
        <button class="btn btn-primary" @click="reset(); selectMode(null)">Start Over</button>
      </div>
    </div>

    <div v-if="kioskWaiverEditOpen" class="kiosk-modal-overlay" @click.self="closeKioskWaiverEdit">
      <div class="kiosk-modal" @click.stop>
        <h3 style="margin-top: 0;">Edit {{ waiverMissingLabel(kioskWaiverEditKey) }}</h3>
        <component
          :is="kioskWaiverFieldComponent"
          v-if="kioskWaiverFieldComponent"
          v-model="kioskWaiverDraft"
        />
        <div class="kiosk-waiver-checks">
          <label class="checkbox-row">
            <input v-model="kioskWaiverConsent" type="checkbox" />
            <span>I have read this section and consent to sign.</span>
          </label>
          <label class="checkbox-row">
            <input v-model="kioskWaiverIntent" type="checkbox" />
            <span>I intend my electronic signature to have the same effect as a handwritten signature.</span>
          </label>
        </div>
        <SignaturePad compact @signed="(d) => (kioskWaiverSig = d)" />
        <div class="actions">
          <button type="button" class="btn btn-secondary" @click="closeKioskWaiverEdit">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="kioskWaiverSaving" @click="saveKioskWaiverEdit">
            {{ kioskWaiverSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';
import SignaturePad from '../components/SignaturePad.vue';
import GwvFieldsEsign from './guardian/waivers/GwvFieldsEsign.vue';
import GwvFieldsPickup from './guardian/waivers/GwvFieldsPickup.vue';
import GwvFieldsEmergency from './guardian/waivers/GwvFieldsEmergency.vue';
import GwvFieldsAllergies from './guardian/waivers/GwvFieldsAllergies.vue';
import GwvFieldsMeals from './guardian/waivers/GwvFieldsMeals.vue';

const props = defineProps({
  /** When provided (e.g. from KioskAppView), overrides route param */
  locationId: { type: [String, Number], default: null },
  /** Location-level settings: allowed_modes, default_mode, show_mode_selector, kiosk_type */
  locationSettings: { type: Object, default: null }
});

const route = useRoute();
const locationId = computed(() => {
  const fromProp = props.locationId != null ? String(props.locationId) : null;
  return fromProp || route.params.locationId || null;
});

const defaultSettings = {
  allowed_modes: ['clock', 'guardian', 'event', 'client_check_in', 'skill_builders'],
  default_mode: 'clock',
  show_mode_selector: true,
  kiosk_type: 'lobby'
};

const effectiveSettings = computed(() => ({ ...defaultSettings, ...props.locationSettings }));

const mode = ref(null);
const modeSelected = computed(() => mode.value != null);

const allowedModes = computed(() => {
  const modes = effectiveSettings.value.allowed_modes;
  return Array.isArray(modes) ? modes : defaultSettings.allowed_modes;
});

const showModeSelector = computed(() => effectiveSettings.value.show_mode_selector !== false);

/** event and client_check_in share the same flow */
const isEventMode = computed(() => mode.value === 'event' || mode.value === 'client_check_in');

const modeTitle = computed(() => {
  if (mode.value === 'clock') return 'Clock In / Out';
  if (mode.value === 'guardian') return 'Guardian Check-in';
  if (mode.value === 'skill_builders') return 'Skill Builders time';
  if (mode.value === 'event' || mode.value === 'client_check_in') return 'Check In';
  return 'Welcome';
});
const modeSubtitle = computed(() => {
  if (mode.value === 'clock') return 'Record your shift start or end time.';
  if (mode.value === 'guardian') return 'Check in or out as a guardian for your client.';
  if (mode.value === 'skill_builders') return 'Clock in or out for a program event using the shared kiosk (tap your name).';
  if (mode.value === 'event' || mode.value === 'client_check_in') return 'Select your scheduled office time, check in, and complete the questionnaire.';
  return 'Choose an option below.';
});

const programSites = ref([]);
const programStaff = ref([]);
const selectedClockSite = ref(null);
const clockStep = ref(1);
const clockAction = ref('in');
const loadingStaff = ref(false);
const clockSuccessMessage = ref('');
const clockPin = ref('');
const identifyingByPin = ref(false);
const clockPinValid = computed(() => /^\d{4}$/.test(String(clockPin.value || '').trim()));

const guardians = ref([]);
const guardianClients = ref([]);
const selectedGuardianSite = ref(null);
const selectedGuardian = ref(null);
const selectedGuardianClient = ref(null);
const guardianStep = ref(1);
const guardianCheckIn = ref(true);
const loadingGuardians = ref(false);
const loadingGuardianClients = ref(false);

const guardianWaiverStatus = ref(null);
const guardianWaiverLoading = ref(false);

const WAIVER_MISSING_LABELS = {
  esignature_consent: 'Electronic signature consent',
  pickup_authorization: 'Pickup authorization',
  emergency_contacts: 'Emergency contacts',
  allergies_snacks: 'Allergies & snacks',
  meal_preferences: 'Meal preferences'
};

function waiverMissingLabel(k) {
  return WAIVER_MISSING_LABELS[k] || k;
}

async function loadGuardianWaiverStatus() {
  const lid = locationId.value;
  const g = selectedGuardian.value;
  const c = selectedGuardianClient.value;
  const s = selectedGuardianSite.value;
  if (!lid || !g?.id || !c?.id || !s?.id) return;
  guardianWaiverLoading.value = true;
  guardianWaiverStatus.value = null;
  try {
    const { data } = await api.get(`/kiosk/${lid}/guardian-waiver-status`, {
      params: { siteId: s.id, guardianUserId: g.id, clientId: c.id },
      skipGlobalLoading: true
    });
    guardianWaiverStatus.value = data;
  } catch {
    guardianWaiverStatus.value = { enabled: false, complete: true, missing: [] };
  } finally {
    guardianWaiverLoading.value = false;
  }
}

async function beginGuardianCheckInFlow(incomingCheckIn) {
  guardianCheckIn.value = incomingCheckIn;
  if (!incomingCheckIn) {
    guardianStep.value = 5;
    return;
  }
  await loadGuardianWaiverStatus();
  const st = guardianWaiverStatus.value;
  if (st?.enabled && !st?.complete) {
    guardianStep.value = 10;
    return;
  }
  if (st?.enabled && st?.complete && !st?.adultLocked) {
    guardianStep.value = 45;
    return;
  }
  guardianStep.value = 5;
}

const kioskWaiverEditOpen = ref(false);
const kioskWaiverEditKey = ref('');
const kioskWaiverDraft = ref({});
const kioskWaiverConsent = ref(false);
const kioskWaiverIntent = ref(false);
const kioskWaiverSig = ref('');
const kioskWaiverSaving = ref(false);

const KIOSK_WAIVER_FIELDS = {
  esignature_consent: GwvFieldsEsign,
  pickup_authorization: GwvFieldsPickup,
  emergency_contacts: GwvFieldsEmergency,
  allergies_snacks: GwvFieldsAllergies,
  meal_preferences: GwvFieldsMeals
};

function defaultKioskWaiverPayload(key) {
  switch (key) {
    case 'esignature_consent':
      return { consented: false, understoodElectronicRecords: false };
    case 'pickup_authorization':
      return { authorizedPickups: [{ name: '', relationship: '', phone: '' }] };
    case 'emergency_contacts':
      return { contacts: [{ name: '', phone: '', relationship: '' }] };
    case 'allergies_snacks':
      return { allergies: '', approvedSnacks: '', notes: '' };
    case 'meal_preferences':
      return { allowedMeals: '', restrictedMeals: '', notes: '' };
    default:
      return {};
  }
}

const kioskWaiverFieldComponent = computed(() => KIOSK_WAIVER_FIELDS[kioskWaiverEditKey.value] || null);

const kioskWaiverDisplayList = computed(() => {
  const d = guardianWaiverStatus.value?.sectionDisplay;
  if (!d || typeof d !== 'object') return [];
  return Object.keys(d).map((key) => ({
    key,
    lines: Array.isArray(d[key]?.lines) ? d[key].lines : []
  }));
});

function selectGuardianClientForCheckin(c) {
  if (c?.guardian_portal_locked) return;
  selectedGuardianClient.value = c;
  guardianStep.value = 4;
}

function openKioskWaiverEdit(key) {
  kioskWaiverEditKey.value = key;
  const sec = guardianWaiverStatus.value?.sections?.[key];
  const raw = sec?.payload && typeof sec.payload === 'object' ? sec.payload : null;
  kioskWaiverDraft.value = raw ? JSON.parse(JSON.stringify(raw)) : defaultKioskWaiverPayload(key);
  kioskWaiverConsent.value = false;
  kioskWaiverIntent.value = false;
  kioskWaiverSig.value = '';
  kioskWaiverEditOpen.value = true;
}

function closeKioskWaiverEdit() {
  kioskWaiverEditOpen.value = false;
}

async function saveKioskWaiverEdit() {
  const key = kioskWaiverEditKey.value;
  if (!key || !kioskWaiverConsent.value || !kioskWaiverIntent.value) {
    error.value = 'Check both boxes and sign to save.';
    return;
  }
  const sig = String(kioskWaiverSig.value || '').trim();
  if (sig.length < 80) {
    error.value = 'Signature is required.';
    return;
  }
  if (key === 'esignature_consent') {
    const p = kioskWaiverDraft.value || {};
    if (!p.consented || !p.understoodElectronicRecords) {
      error.value = 'Complete e-sign consent checkboxes in the form.';
      return;
    }
  }
  const g = selectedGuardian.value;
  const c = selectedGuardianClient.value;
  const s = selectedGuardianSite.value;
  const lid = locationId.value;
  if (!g?.id || !c?.id || !s?.id || !lid) return;
  const sec = guardianWaiverStatus.value?.sections?.[key];
  const action = sec?.status === 'active' ? 'update' : 'create';
  kioskWaiverSaving.value = true;
  error.value = '';
  try {
    await api.post(`/kiosk/${lid}/guardian-waiver-section`, {
      guardianUserId: g.id,
      clientId: c.id,
      siteId: s.id,
      sectionKey: key,
      payload: kioskWaiverDraft.value,
      signatureData: sig,
      consentAcknowledged: true,
      intentToSign: true,
      action
    });
    await loadGuardianWaiverStatus();
    if (guardianWaiverStatus.value?.enabled && !guardianWaiverStatus.value?.complete) {
      guardianStep.value = 10;
    }
    closeKioskWaiverEdit();
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Save failed';
  } finally {
    kioskWaiverSaving.value = false;
  }
}

const step = ref(1);
const loading = ref(false);
const saving = ref(false);
const error = ref('');

const date = ref(new Date().toISOString().slice(0, 10));
const events = ref([]);
const selectedEvent = ref(null);

const questionnaires = ref([]);
const selectedQuestionnaireKey = ref('');
const definitionLoading = ref(false);
const formFields = ref([]);
const answers = ref({});
const typicalDayTime = ref('');

/** Skill Builders kiosk (location-scoped; staff identified by tap, not kiosk login). */
const sbStep = ref(1);
const sbDate = ref(new Date().toISOString().slice(0, 10));
const sbEvents = ref([]);
const sbLoading = ref(false);
const sbSaving = ref(false);
const selectedSbEvent = ref(null);
const sbAction = ref('in');
const sbRoster = ref({ providers: [], clients: [] });
const sbSessions = ref([]);
const sbSessionPick = ref(0);
const sbClientPick = ref(0);
const sbSuccessMessage = ref('');
const sbAttachedSurveys = ref([]);
const sbSurveyAnswers = ref({});
const sbSelectedStaff = ref(null);

const sbSelectedStaffName = computed(() => {
  const s = sbSelectedStaff.value;
  if (!s) return '';
  return s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim();
});

const sbAnswerKey = (attachmentId, questionId) => `${attachmentId}:${questionId}`;

const normalizedOptions = (q) => {
  if (!Array.isArray(q?.options)) return [];
  return q.options.map((o) => {
    if (o && typeof o === 'object') {
      return { label: String(o.label || o.value || ''), value: String(o.value || o.label || '') };
    }
    return { label: String(o || ''), value: String(o || '') };
  }).filter((o) => o.label || o.value);
};

const toggleSbMulti = (attachmentId, questionId, value) => {
  const key = sbAnswerKey(attachmentId, questionId);
  if (!sbSurveyAnswers.value[key]) sbSurveyAnswers.value[key] = { answer: [], quoteMe: false };
  const cur = Array.isArray(sbSurveyAnswers.value[key].answer) ? [...sbSurveyAnswers.value[key].answer] : [];
  const idx = cur.indexOf(value);
  if (idx >= 0) cur.splice(idx, 1);
  else cur.push(value);
  sbSurveyAnswers.value[key].answer = cur;
};

function sbYmdAddDays(ymd, delta) {
  const [y, mo, da] = String(ymd || '').split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (!Number.isFinite(dt.getTime())) return new Date().toISOString().slice(0, 10);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function formatSbSessionOption(s) {
  if (!s) return '';
  const st = String(s.startTime || '').slice(0, 5);
  const et = String(s.endTime || '').slice(0, 5);
  return `${s.sessionDate} · ${String(s.weekday || '').slice(0, 3)} ${st}–${et}`;
}

const loadSbEvents = async () => {
  if (!locationId.value) return;
  try {
    sbLoading.value = true;
    error.value = '';
    const resp = await api.get(`/kiosk/${locationId.value}/skill-builders-events`, {
      params: { date: sbDate.value }
    });
    sbEvents.value = resp.data?.events || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load Skill Builders events';
    sbEvents.value = [];
  } finally {
    sbLoading.value = false;
  }
};

const selectSbEvent = (e) => {
  selectedSbEvent.value = e;
  sbStep.value = 2;
};

const startSbClockFlow = async (action) => {
  sbAction.value = action;
  sbSessionPick.value = 0;
  sbClientPick.value = 0;
  sbStep.value = 3;
  await loadSbRosterAndSessions();
};

const loadSbRosterAndSessions = async () => {
  const e = selectedSbEvent.value;
  const lid = locationId.value;
  if (!e?.id || !e?.agencyId || !lid) return;
  try {
    sbLoading.value = true;
    error.value = '';
    const from = sbDate.value;
    const to = sbYmdAddDays(from, 120);
    const rosterP = api.get(`/kiosk/${lid}/skill-builders-events/${e.id}/roster`, {
      params: { agencyId: e.agencyId }
    });
    const sessionsP =
      sbAction.value === 'in'
        ? api.get(`/kiosk/${lid}/skill-builders-events/${e.id}/sessions`, {
            params: { agencyId: e.agencyId, from, to }
          })
        : Promise.resolve({ data: { sessions: [] } });
    const surveysP =
      sbAction.value === 'in'
        ? api.get(`/kiosk/${lid}/skill-builders-events/${e.id}/attached-surveys`, {
            params: {
              agencyId: e.agencyId,
              sessionDateId: sbSessionPick.value || undefined
            }
          })
        : Promise.resolve({ data: { surveys: [] } });
    const [r1, r2, r3] = await Promise.all([rosterP, sessionsP, surveysP]);
    sbRoster.value = r1.data || { providers: [], clients: [] };
    sbSessions.value = r2.data?.sessions || [];
    sbAttachedSurveys.value = Array.isArray(r3.data?.surveys) ? r3.data.surveys : [];
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Failed to load roster';
    sbRoster.value = { providers: [], clients: [] };
    sbSessions.value = [];
    sbAttachedSurveys.value = [];
  } finally {
    sbLoading.value = false;
  }
};

const doSbClock = async (staff) => {
  const e = selectedSbEvent.value;
  const lid = locationId.value;
  if (!e?.id || !e?.agencyId || !lid || !staff?.id) return;
  try {
    sbSaving.value = true;
    error.value = '';
    if (sbAction.value === 'in') {
      if (sbAttachedSurveys.value.length) {
        sbSelectedStaff.value = staff;
        sbSurveyAnswers.value = {};
        for (const survey of sbAttachedSurveys.value) {
          for (const q of (survey.questions || [])) {
            sbSurveyAnswers.value[sbAnswerKey(survey.attachmentId, q.id)] = { answer: '', quoteMe: false };
          }
        }
        sbStep.value = 35;
        return;
      }
      const body = { agencyId: e.agencyId, userId: staff.id };
      if (sbSessionPick.value) body.sessionId = sbSessionPick.value;
      if (sbClientPick.value) body.clientId = sbClientPick.value;
      await api.post(`/kiosk/${lid}/skill-builders-events/${e.id}/clock-in`, body);
      sbSuccessMessage.value = 'Clocked in for this Skill Builders event.';
    } else {
      await api.post(`/kiosk/${lid}/skill-builders-events/${e.id}/clock-out`, {
        agencyId: e.agencyId,
        userId: staff.id
      });
      sbSuccessMessage.value = 'Clocked out. If applicable, a payroll time claim was created.';
    }
    sbStep.value = 4;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Clock action failed';
  } finally {
    sbSaving.value = false;
  }
};

const submitSbSurveyAndClockIn = async () => {
  const e = selectedSbEvent.value;
  const lid = locationId.value;
  const staff = sbSelectedStaff.value;
  if (!e?.id || !e?.agencyId || !lid || !staff?.id) return;
  try {
    sbSaving.value = true;
    error.value = '';
    const needsClientIdentity = sbAttachedSurveys.value.some((s) => !s.isAnonymous);
    if (needsClientIdentity && !sbClientPick.value) {
      error.value = 'Select a client before completing a non-anonymous survey check-in.';
      return;
    }
    for (const survey of sbAttachedSurveys.value) {
      const payload = {};
      for (const q of (survey.questions || [])) {
        const key = sbAnswerKey(survey.attachmentId, q.id);
        const entry = sbSurveyAnswers.value[key] || { answer: '' };
        payload[String(q.id)] = q.allowQuoteMe
          ? { answer: entry.answer, quoteMe: !!entry.quoteMe }
          : entry.answer;
      }
      await api.post(`/surveys/${survey.surveyId}/respond`, {
        surveyPushId: null,
        responseData: payload,
        clientId: sbClientPick.value || null,
        companyEventSessionSurveyId: survey.attachmentId
      });
    }
    const body = { agencyId: e.agencyId, userId: staff.id };
    if (sbSessionPick.value) body.sessionId = sbSessionPick.value;
    if (sbClientPick.value) body.clientId = sbClientPick.value;
    await api.post(`/kiosk/${lid}/skill-builders-events/${e.id}/clock-in`, body);
    sbSuccessMessage.value = 'Survey submitted and check-in complete.';
    sbStep.value = 4;
  } catch (err) {
    error.value = err.response?.data?.error?.message || 'Survey/check-in failed';
  } finally {
    sbSaving.value = false;
  }
};

const resetSb = () => {
  sbStep.value = 1;
  selectedSbEvent.value = null;
  sbRoster.value = { providers: [], clients: [] };
  sbSessions.value = [];
  sbAttachedSurveys.value = [];
  sbSurveyAnswers.value = {};
  sbSelectedStaff.value = null;
  sbSessionPick.value = 0;
  sbClientPick.value = 0;
  sbSuccessMessage.value = '';
  loadSbEvents();
};

watch(mode, (m) => {
  if (m === 'skill_builders') {
    resetSb();
  }
});

watch(sbSessionPick, async () => {
  if (mode.value !== 'skill_builders' || sbStep.value !== 3 || sbAction.value !== 'in') return;
  await loadSbRosterAndSessions();
});

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
};

const loadEvents = async () => {
  try {
    loading.value = true;
    error.value = '';
    const resp = await api.get(`/kiosk/${locationId.value}/events`, { params: { date: date.value } });
    events.value = resp.data?.events || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load events';
  } finally {
    loading.value = false;
  }
};

const selectEvent = (e) => {
  selectedEvent.value = e;
  step.value = 2;
};

const checkIn = async () => {
  if (!selectedEvent.value?.id) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/kiosk/${locationId.value}/checkin`, { eventId: selectedEvent.value.id });
    await loadQuestionnaires();
    step.value = 4;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to check in';
  } finally {
    saving.value = false;
  }
};

const getQuestionnaireKey = (q) => {
  if (q.intakeLinkId) return `intake:${q.intakeLinkId}`;
  return `module:${q.moduleId}`;
};

const loadQuestionnaires = async () => {
  const params = selectedEvent.value?.id ? { eventId: selectedEvent.value.id } : {};
  const resp = await api.get(`/kiosk/${locationId.value}/questionnaires`, { params });
  questionnaires.value = resp.data || [];
  selectedQuestionnaireKey.value = '';
  formFields.value = [];
  answers.value = {};
  typicalDayTime.value = '';
};

const toggleMulti = (fieldId, opt) => {
  const current = Array.isArray(answers.value[fieldId]) ? answers.value[fieldId] : [];
  const exists = current.includes(opt);
  const next = exists ? current.filter((x) => x !== opt) : [...current, opt];
  answers.value = { ...answers.value, [fieldId]: next };
};

const loadDefinition = async () => {
  if (!selectedQuestionnaireKey.value) {
    formFields.value = [];
    answers.value = {};
    return;
  }
  const [type, id] = selectedQuestionnaireKey.value.split(':');
  if (!type || !id) return;
  try {
    definitionLoading.value = true;
    let resp;
    if (type === 'intake') {
      resp = await api.get(`/kiosk/${locationId.value}/intake-questionnaire/${id}/definition`);
    } else {
      resp = await api.get(`/kiosk/${locationId.value}/questionnaires/${id}/definition`);
    }
    formFields.value = resp.data?.fields || [];
    answers.value = {};
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load questionnaire';
    formFields.value = [];
    answers.value = {};
  } finally {
    definitionLoading.value = false;
  }
};

const submit = async () => {
  const [type, id] = (selectedQuestionnaireKey.value || '').split(':');
  if (!type || !id) return;
  try {
    saving.value = true;
    error.value = '';
    const payload = {
      eventId: selectedEvent.value.id,
      typicalDayTime: typicalDayTime.value === 'yes',
      answers: answers.value
    };
    if (type === 'intake') {
      payload.intakeLinkId = Number(id);
    } else {
      payload.moduleId = Number(id);
    }
    await api.post(`/kiosk/${locationId.value}/questionnaires/submit`, payload);
    step.value = 5;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to submit';
  } finally {
    saving.value = false;
  }
};

const reset = () => {
  step.value = 1;
  selectedEvent.value = null;
  questionnaires.value = [];
  selectedQuestionnaireKey.value = '';
  formFields.value = [];
  answers.value = {};
  typicalDayTime.value = '';
  loadEvents();
};

const selectMode = (m) => {
  mode.value = m;
  if (m === 'event' || m === 'client_check_in') {
    loadEvents();
  } else if (m === null) {
    clockStep.value = 1;
    selectedClockSite.value = null;
    programStaff.value = [];
  }
};

const selectClockSite = async (site) => {
  selectedClockSite.value = site;
  try {
    loadingStaff.value = true;
    error.value = '';
    const today = new Date().toISOString().slice(0, 10);
    const res = await api.get(`/kiosk/${locationId.value}/program-staff`, {
      params: { siteId: site.id, slotDate: today }
    });
    programStaff.value = res.data || [];
    clockStep.value = 3;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load staff';
  } finally {
    loadingStaff.value = false;
  }
};

const doClock = async (staff) => {
  if (!selectedClockSite.value) return;
  try {
    saving.value = true;
    error.value = '';
    const endpoint = clockAction.value === 'in' ? 'clock-in' : 'clock-out';
    await api.post(`/kiosk/${locationId.value}/${endpoint}`, {
      userId: staff.id,
      programId: selectedClockSite.value.program_id,
      siteId: selectedClockSite.value.id
    });
    clockSuccessMessage.value = clockAction.value === 'in'
      ? 'You have been clocked in successfully.'
      : 'You have been clocked out successfully.';
    clockStep.value = 4;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to clock ' + clockAction.value;
  } finally {
    saving.value = false;
  }
};

const submitClockPin = async () => {
  if (!clockPinValid.value || !selectedClockSite.value || identifyingByPin.value) return;
  try {
    identifyingByPin.value = true;
    error.value = '';
    const res = await api.post(`/kiosk/${locationId.value}/identify-by-pin`, {
      siteId: selectedClockSite.value.id,
      pin: clockPin.value.trim()
    });
    const staff = {
      id: res.data.userId,
      first_name: res.data.first_name,
      last_name: res.data.last_name,
      display_name: res.data.display_name
    };
    clockPin.value = '';
    await doClock(staff);
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Invalid PIN or not found at this site';
  } finally {
    identifyingByPin.value = false;
  }
};

const resetClock = () => {
  mode.value = null;
  clockStep.value = 1;
  selectedClockSite.value = null;
  programStaff.value = [];
  clockPin.value = '';
  loadProgramSites();
};

const selectGuardianSite = async (site) => {
  selectedGuardianSite.value = site;
  try {
    loadingGuardians.value = true;
    error.value = '';
    const res = await api.get(`/kiosk/${locationId.value}/guardians`, { params: { siteId: site.id } });
    guardians.value = res.data || [];
    guardianStep.value = 2;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load guardians';
  } finally {
    loadingGuardians.value = false;
  }
};

const selectGuardian = async (g) => {
  selectedGuardian.value = g;
  try {
    loadingGuardianClients.value = true;
    error.value = '';
    const res = await api.get(`/kiosk/${locationId.value}/guardian-clients`, {
      params: { guardianUserId: g.id, siteId: selectedGuardianSite.value.id }
    });
    guardianClients.value = res.data || [];
    guardianStep.value = 3;
  } catch (e) {
    error.value = e.response?.data?.error?.message || 'Failed to load clients';
  } finally {
    loadingGuardianClients.value = false;
  }
};

const submitGuardianCheckin = async () => {
  if (!selectedGuardian.value || !selectedGuardianClient.value || !selectedGuardianSite.value) return;
  try {
    saving.value = true;
    error.value = '';
    await api.post(`/kiosk/${locationId.value}/guardian-checkin`, {
      guardianUserId: selectedGuardian.value.id,
      clientId: selectedGuardianClient.value.id,
      siteId: selectedGuardianSite.value.id,
      checkIn: guardianCheckIn.value
    });
    guardianStep.value = 6;
  } catch (e) {
    const err = e.response?.data?.error;
    if (e.response?.status === 409 && err?.code === 'GUARDIAN_WAIVERS_INCOMPLETE') {
      guardianWaiverStatus.value = {
        enabled: true,
        complete: false,
        missing: err.missing || [],
        requiredKeys: err.requiredKeys || []
      };
      guardianStep.value = 10;
      error.value = '';
    } else {
      error.value = err?.message || 'Failed to record check-in';
    }
  } finally {
    saving.value = false;
  }
};

const resetGuardian = () => {
  mode.value = null;
  guardianStep.value = 1;
  selectedGuardianSite.value = null;
  selectedGuardian.value = null;
  selectedGuardianClient.value = null;
  guardians.value = [];
  guardianClients.value = [];
  guardianWaiverStatus.value = null;
  guardianWaiverLoading.value = false;
  closeKioskWaiverEdit();
  loadProgramSites();
};

const loadProgramSites = async () => {
  try {
    const res = await api.get(`/kiosk/${locationId.value}/program-sites`);
    programSites.value = res.data || [];
  } catch {
    programSites.value = [];
  }
};

onMounted(() => {
  loadProgramSites();
  loadEvents();
  if (!showModeSelector.value && allowedModes.value.includes(effectiveSettings.value.default_mode)) {
    selectMode(effectiveSettings.value.default_mode);
  }
});
</script>

<style scoped>
.kiosk {
  min-height: calc(100vh - 80px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--bg-alt);
}
.kiosk-card {
  width: 900px;
  max-width: 100%;
  background: white;
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px;
}
.subtitle { color: var(--text-secondary); margin: 6px 0 16px 0; }
.mode-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 16px 0;
}
.mode-btn {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: white;
  cursor: pointer;
  font-size: 16px;
  text-align: center;
}
.mode-btn:hover {
  border-color: var(--primary, #2563eb);
  background: var(--bg-alt, #f8fafc);
}
.mode-icon { font-size: 32px; }
.mode-label { font-weight: 700; }
.mode-desc { font-size: 13px; color: var(--text-secondary); }
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.pick {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: white;
  padding: 14px 12px;
  cursor: pointer;
  font-size: 16px;
}
.pick.pick-scheduled {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, white);
}
.scheduled-badge {
  font-size: 11px;
  color: var(--primary);
  font-weight: 600;
  margin-top: 4px;
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.field { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
input, select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.survey {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}
.q {
  display: grid;
  grid-template-columns: 80px 120px;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}
.summary { color: var(--text-secondary); font-size: 13px; }
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 12px 0;
}
.pin-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.pin-row label { font-weight: 600; min-width: 36px; }
.pin-input {
  width: 80px;
  padding: 10px 12px;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
}
.gw-missing-list {
  margin: 12px 0;
  padding-left: 20px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.gw-kiosk-section {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  text-align: left;
}
.gw-kiosk-lines {
  margin: 8px 0;
  padding-left: 18px;
  color: var(--text-secondary);
  line-height: 1.45;
}
.kiosk-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 80;
  padding: 16px;
}
.kiosk-modal {
  background: var(--bg, #fff);
  border-radius: 12px;
  max-width: 520px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  padding: 16px;
  text-align: left;
}
.kiosk-waiver-checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
  font-size: 14px;
}
.checkbox-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.pick:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>

