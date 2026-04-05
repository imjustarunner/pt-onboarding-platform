<template>
  <div class="challenge-management">
    <div class="page-header">
      <h1>Season Management</h1>
      <p class="page-description">
        A <strong>season</strong> is the whole competition period (dates, teams, scoring, participants).
        <strong>Weekly challenges</strong> are the tasks published each week — set those in <strong>Manage → Weekly challenges</strong> after you create a season.
      </p>
    </div>

    <div v-if="!organizationId" class="empty-state">
      <p>Select a Learning or Affiliation organization above to manage its seasons.</p>
    </div>

    <div v-else class="panel">
      <div class="controls">
        <button class="btn btn-primary" @click="openCreateModal">Create Season</button>
        <button class="btn btn-secondary" @click="loadChallenges" :disabled="loading">Refresh</button>
      </div>

      <div v-if="loading" class="loading">Loading seasons…</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="!challenges.length" class="empty-state">
        <p>No seasons yet. Create one to get started.</p>
      </div>
      <div v-else class="challenge-list">
        <div v-for="c in challenges" :key="c.id" class="challenge-card">
          <div class="challenge-card-header">
            <div>
              <h3>{{ c.class_name || c.className }}</h3>
              <span class="challenge-status" :class="statusClass(c)">{{ formatStatus(c) }}</span>
            </div>
            <div class="challenge-actions">
              <button v-if="(c.status || '').toLowerCase() === 'draft'" class="btn btn-primary btn-sm" @click="launchChallenge(c)" :disabled="launching">Launch</button>
              <router-link :to="challengeDashboardLink(c)" class="btn btn-secondary btn-sm">View Stats</router-link>
              <button class="btn btn-secondary btn-sm" @click="openEditModal(c)">Edit</button>
              <button class="btn btn-secondary btn-sm" @click="openManageModal(c)">Manage</button>
              <button
                v-if="canCloseSeason(c)"
                class="btn btn-warning btn-sm"
                @click="closeSeason(c)"
              >Close Season</button>
              <button class="btn btn-secondary btn-sm" @click="duplicateChallenge(c)">Duplicate</button>
            </div>
          </div>
          <p v-if="c.description" class="challenge-description">{{ c.description }}</p>
          <div class="challenge-meta">
            <span v-if="c.starts_at || c.ends_at">{{ formatDates(c) }}</span>
            <span v-if="c.activity_types_json?.length"> · {{ formatActivityTypes(c.activity_types_json) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Season Modal -->
    <div v-if="showChallengeModal" class="modal-overlay" @click.self="closeChallengeModal">
      <div class="modal-content modal-wide">
        <h2>{{ editingChallenge ? 'Edit Season' : 'Create Season' }}</h2>
        <form @submit.prevent="saveChallenge">
          <div class="form-group">
            <label>Season name *</label>
            <input v-model="challengeForm.className" type="text" required placeholder="e.g., Spring 2026 Season" />
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea v-model="challengeForm.description" rows="3" placeholder="Optional season description" />
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Status</label>
              <select v-model="challengeForm.status">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
              <button
                v-if="editingChallenge && challengeForm.status !== 'closed'"
                type="button"
                class="btn btn-warning btn-sm"
                style="margin-top:8px;"
                @click="challengeForm.status = 'closed'"
              >
                Close season now
              </button>
              <small v-if="editingChallenge" style="display:block;margin-top:6px;color:var(--text-secondary);">
                Seasons remain open even past end date until a manager closes them.
              </small>
            </div>
            <div class="form-group">
              <label>Start date</label>
              <input v-model="challengeForm.startsAt" type="datetime-local" />
            </div>
            <div class="form-group">
              <label>End date</label>
              <input v-model="challengeForm.endsAt" type="datetime-local" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Guardian catalog — registration eligible</label>
              <select v-model="challengeForm.registrationEligible">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>Medicaid eligible</label>
              <select v-model="challengeForm.medicaidEligible">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
            <div class="form-group">
              <label>Cash / self-pay eligible</label>
              <select v-model="challengeForm.cashEligible">
                <option :value="false">No</option>
                <option :value="true">Yes</option>
              </select>
            </div>
          </div>
          <p class="hint" style="margin-top: 0;">Uses enrollment open/close dates above for when guardians can enroll (active class + window).</p>
          <div class="form-group participation-agreement-block">
            <label style="font-weight:700;">Season Participation Agreement</label>
            <p class="hint" style="margin: 6px 0 12px 0;">
              Members can view this in the season portal. Use it for the rules, commandments, or guidelines that uploads,
              comments, workouts, and season participation need to follow.
            </p>
            <div class="form-row" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;">
              <div class="form-group">
                <label>Reuse a prior set</label>
                <div class="inline-action-row">
                  <select v-model="selectedAgreementTemplateKey">
                    <option value="">Keep this season's current draft</option>
                    <option
                      v-for="option in agreementTemplateOptions"
                      :key="option.key"
                      :value="option.key"
                    >
                      {{ formatAgreementTemplateOption(option) }}
                    </option>
                  </select>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="!selectedAgreementTemplateKey"
                    @click="applyAgreementTemplate"
                  >
                    Apply
                  </button>
                </div>
                <small>Repeated rule sets appear once using the most recent season that used them.</small>
              </div>
              <div class="form-group">
                <label>Display label</label>
                <input
                  v-model="challengeForm.agreementLabel"
                  type="text"
                  placeholder="e.g., Season Guidelines, Team Commandments, Community Standards"
                />
              </div>
            </div>
            <div class="form-group">
              <label>Intro / agreement text</label>
              <textarea
                v-model="challengeForm.agreementIntroText"
                rows="3"
                placeholder="Explain what members are agreeing to by joining and posting in this season."
              />
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label>Guidelines list</label>
              <textarea
                v-model="challengeForm.agreementItemsText"
                rows="6"
                placeholder="One guideline per line"
              />
              <small>Managers can reject workouts or uploads that do not meet these season standards.</small>
            </div>
          </div>
          <div class="form-group">
            <label>Activity types (comma-separated)</label>
            <input v-model="challengeForm.activityTypesText" type="text" placeholder="e.g., running, cycling, workout_session, steps" />
            <small>Leave blank for default options.</small>
          </div>
          <!-- ── Weekly Goal Configuration ──────────────────────── -->
          <div class="form-group">
            <label style="font-weight:700;">Weekly Goal</label>
            <div class="form-row" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-top:6px;">
              <!-- Metric selector -->
              <div class="form-group">
                <label>Goal metric</label>
                <select v-model="challengeForm.weeklyGoalMetric">
                  <option value="miles">Miles (distance)</option>
                  <option value="points">Points</option>
                  <option value="minutes">Duration (minutes)</option>
                  <option value="activities">Activity count</option>
                </select>
              </div>
              <!-- Approx members per team (for team total preview) -->
              <div class="form-group">
                <label>Approx. members per team</label>
                <input v-model.number="challengeForm.weeklyGoalMembersPerTeam" type="number" min="1" step="1" />
                <small>Used to calculate team total in the preview below</small>
              </div>
            </div>

            <!-- Miles-based progressive goal -->
            <div v-if="weeklyGoalIsMiles" class="goal-miles-block">
              <div class="form-row" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
                <div class="form-group">
                  <label>Starting miles per person <span class="label-sub">(Week 1)</span></label>
                  <div class="input-unit-row">
                    <input v-model.number="challengeForm.runRuckStartMilesPerPerson" type="number" min="0" step="0.5" />
                    <span class="unit-badge">mi / person</span>
                  </div>
                </div>
                <div class="form-group">
                  <label>Weekly increase per person</label>
                  <div class="input-unit-row">
                    <input v-model.number="challengeForm.runRuckWeeklyIncreaseMilesPerPerson" type="number" min="0" step="0.5" />
                    <span class="unit-badge">mi / person / wk</span>
                  </div>
                </div>
                <div class="form-group" v-if="challengeForm.eventCategory === 'run_ruck'">
                  <label>Max rucks per person / week</label>
                  <div class="input-unit-row">
                    <input v-model.number="challengeForm.maxRucksPerWeek" type="number" min="0" step="1" />
                    <span class="unit-badge">rucks (0 = no cap)</span>
                  </div>
                </div>
              </div>

              <!-- Progression preview table -->
              <div v-if="goalProgressionRows.length" class="goal-progression-preview">
                <div class="gpp-header">
                  <span class="gpp-title">Progression preview</span>
                  <span class="gpp-sub">{{ challengeForm.weeklyGoalMembersPerTeam }} members × per-person miles</span>
                </div>
                <div class="gpp-table-wrap">
                  <table class="gpp-table">
                    <thead>
                      <tr>
                        <th>Week</th>
                        <th>Per person</th>
                        <th>Team total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in goalProgressionRows" :key="row.wk">
                        <td>Wk {{ row.wk }}</td>
                        <td>{{ row.perPerson }} mi</td>
                        <td class="gpp-total">{{ row.teamTotal }} mi</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="gpp-note">Team total is locked at season launch from enrolled member count and does not shrink if members are removed.</p>
              </div>
            </div>

            <!-- Points / other metric goal -->
            <div v-else class="form-row" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
              <div class="form-group">
                <label>Individual min {{ weeklyGoalUnit }}/week</label>
                <div class="input-unit-row">
                  <input v-model.number="challengeForm.individualMinPointsPerWeek" type="number" min="0" placeholder="Optional" />
                  <span class="unit-badge">{{ weeklyGoalUnit }}</span>
                </div>
                <small>Each member must hit this per week</small>
              </div>
              <div class="form-group">
                <label>Team min {{ weeklyGoalUnit }}/week</label>
                <div class="input-unit-row">
                  <input v-model.number="challengeForm.teamMinPointsPerWeek" type="number" min="0" placeholder="Optional" />
                  <span class="unit-badge">{{ weeklyGoalUnit }}</span>
                </div>
                <small>Collective team target per week</small>
              </div>
              <div class="form-group">
                <label>Min activities / week</label>
                <input v-model.number="challengeForm.weeklyGoalMinimum" type="number" min="0" placeholder="Optional" />
                <small>Minimum number of logged activities</small>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label style="font-weight:700;font-size:14px;display:block;margin-bottom:4px;">Recognition Categories</label>
            <p style="font-size:12px;color:var(--text-secondary);margin:0 0 10px 0;">Configure who gets recognized each period. Masters age threshold is set inside the Masters section.</p>
            <RecognitionCategoryBuilder
              v-model="challengeForm.recognitionCategories"
              :custom-field-definitions="challengeCustomFields"
              :library-awards="libraryAwards"
              :library-groups="libraryGroups"
              :club-id="organizationId"
              @save-award-to-library="saveAwardToLibrary"
            />
          </div>
          <div class="form-group">
            <label>Event category</label>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Category</label>
                <select v-model="challengeForm.eventCategory">
                  <option value="run_ruck">Run/Ruck (distance based)</option>
                  <option value="fitness">Fitness (calories based)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Default weekly task style</label>
                <select v-model="challengeForm.challengeAssignmentMode">
                  <option value="volunteer_or_elect">Volunteer or Elect</option>
                  <option value="captain_assigns">Captain Assigns</option>
                </select>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>Season cadence + publish settings</label>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Week starts on</label>
                <select v-model="challengeForm.weekStartsOn">
                  <option value="sunday">Sunday</option>
                  <option value="monday">Monday</option>
                  <option value="tuesday">Tuesday</option>
                  <option value="wednesday">Wednesday</option>
                  <option value="thursday">Thursday</option>
                  <option value="friday">Friday</option>
                  <option value="saturday">Saturday</option>
                </select>
              </div>
              <div class="form-group">
                <label>Weekly tasks count</label>
                <input v-model.number="challengeForm.tasksPerWeek" type="number" min="1" max="7" />
              </div>
              <div class="form-group">
                <label>Publish lead hours</label>
                <input v-model.number="challengeForm.publishLeadHours" type="number" min="0" />
              </div>
              <div class="form-group">
                <label>Week ends Sunday at</label>
                <input v-model="challengeForm.weekEndsSundayAt" type="time" />
              </div>
              <div class="form-group">
                <label>Week timezone</label>
                <select v-model="challengeForm.weekTimeZone">
                  <optgroup v-for="grp in TIMEZONE_GROUPS" :key="grp.label" :label="grp.label">
                    <option v-for="tz in grp.zones" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                  </optgroup>
                </select>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>Scoring weights</label>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Run</label>
                <input v-model.number="challengeForm.weightRun" type="number" min="0" step="0.1" />
              </div>
              <div class="form-group">
                <label>Ride</label>
                <input v-model.number="challengeForm.weightRide" type="number" min="0" step="0.1" />
              </div>
              <div class="form-group">
                <label>Workout</label>
                <input v-model.number="challengeForm.weightWorkout" type="number" min="0" step="0.1" />
              </div>
              <div class="form-group">
                <label>Walk</label>
                <input v-model.number="challengeForm.weightWalk" type="number" min="0" step="0.1" />
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>Distance / calories conversion</label>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Run miles per point</label>
                <input v-model.number="challengeForm.runMilesPerPoint" type="number" min="0.1" step="0.1" />
              </div>
              <div class="form-group">
                <label>Ruck miles per point</label>
                <input v-model.number="challengeForm.ruckMilesPerPoint" type="number" min="0.1" step="0.1" />
              </div>
              <div class="form-group">
                <label>Calories per point (fitness)</label>
                <input v-model.number="challengeForm.caloriesPerPoint" type="number" min="1" step="1" />
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>Team setup</label>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Number of teams</label>
                <input v-model.number="challengeForm.teamCount" type="number" min="1" />
              </div>
              <div class="form-group">
                <label>Captains can rename teams</label>
                <select v-model="challengeForm.allowCaptainRenameTeam">
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
              <div class="form-group">
                <label>If locked, captains can add nickname suffix</label>
                <select v-model="challengeForm.allowCaptainNicknameSuffixWhenLocked">
                  <option :value="false">No</option>
                  <option :value="true">Yes</option>
                </select>
              </div>
            </div>
            <label>Preset/temporary team names (comma-separated)</label>
            <input v-model="challengeForm.presetTeamNamesText" type="text" placeholder="e.g., Team Alpha, Team Bravo, Team Charlie" />
          </div>
          <div class="form-group">
            <label>Bye week settings</label>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Allow bye week</label>
                <select v-model="challengeForm.allowByeWeek">
                  <option :value="false">No</option>
                  <option :value="true">Yes</option>
                </select>
              </div>
              <div class="form-group">
                <label>Max bye weeks per participant</label>
                <input v-model.number="challengeForm.maxByeWeeksPerParticipant" type="number" min="0" />
              </div>
              <div class="form-group">
                <label>Require declaration before week starts</label>
                <select v-model="challengeForm.requireAdvanceByeDeclaration">
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>Postseason setup</label>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Enable postseason</label>
                <select v-model="challengeForm.postseasonEnabled">
                  <option :value="false">No</option>
                  <option :value="true">Yes</option>
                </select>
              </div>
              <div class="form-group">
                <label>Regular season weeks</label>
                <input v-model.number="challengeForm.regularSeasonWeeks" type="number" min="1" />
              </div>
              <div class="form-group">
                <label>Break week before playoffs</label>
                <select v-model="challengeForm.postseasonHasBreakWeek">
                  <option :value="false">No</option>
                  <option :value="true">Yes</option>
                </select>
              </div>
              <div v-if="challengeForm.postseasonHasBreakWeek" class="form-group">
                <label>Break week number</label>
                <input v-model.number="challengeForm.postseasonBreakWeekNumber" type="number" min="1" />
              </div>
              <div class="form-group">
                <label>Playoff week number</label>
                <input v-model.number="challengeForm.playoffWeekNumber" type="number" min="1" />
              </div>
              <div class="form-group">
                <label>Championship week number</label>
                <input v-model.number="challengeForm.championshipWeekNumber" type="number" min="1" />
              </div>
              <div class="form-group">
                <label>Playoff seeds</label>
                <input v-model.number="challengeForm.playoffSeedCount" type="number" min="2" />
              </div>
              <div class="form-group">
                <label>Playoff matchup mode</label>
                <select v-model="challengeForm.playoffMatchupMode">
                  <option value="1v4_2v3">1 vs 4 and 2 vs 3</option>
                  <option value="seeded_bracket">Seeded bracket</option>
                </select>
              </div>
            </div>
            <small>
              Supports regular season champion and post-season champion tracking. With 4 seeds, semifinal defaults are 1v4 and 2v3.
            </small>
          </div>
          <div class="form-group">
            <label>Treadmill rules</label>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Post season activity to club feed</label>
                <select v-model="challengeForm.showInClubFeed">
                  <option :value="true">Yes — show workouts in the club feed</option>
                  <option :value="false">No — keep season activity private</option>
                </select>
                <small>Controls whether member workouts from this season appear in the club-wide feed on the dashboard.</small>
              </div>
            </div>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group">
                <label>Workout approval mode</label>
                <select v-model="challengeForm.workoutModerationMode">
                  <option value="all">Approve every workout</option>
                  <option value="treadmill_only">Approve treadmill only</option>
                  <option value="none">No manager approval required</option>
                </select>
              </div>
              <div class="form-group">
                <label>Treadmill photo proof required</label>
                <select v-model="challengeForm.treadmillPhotoRequired">
                  <option :value="true">Yes</option>
                  <option :value="false">No</option>
                </select>
              </div>
              <div class="form-group">
                <label>Enable treadmillpocalypse</label>
                <select v-model="challengeForm.treadmillpocalypseEnabled">
                  <option :value="false">No</option>
                  <option :value="true">Yes</option>
                </select>
              </div>
              <div class="form-group">
                <label>Treadmillpocalypse starts week</label>
                <input v-model="challengeForm.treadmillpocalypseStartsAtWeek" type="date" />
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>Weekly recognition metrics (comma-separated)</label>
            <input v-model="challengeForm.additionalMetricsText" type="text" placeholder="e.g., miles, elevation gain, workout streak" />
          </div>
          <div class="form-group">
            <label>Record board metrics</label>
            <div class="checkbox-group">
              <label v-for="opt in recordMetricOptions" :key="`record-metric-${opt.value}`">
                <input v-model="challengeForm.recordMetrics" type="checkbox" :value="opt.value" />
                {{ opt.label }}
              </label>
            </div>
            <small>Select the records you want shown in season and all-time boards.</small>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeChallengeModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Manage season: teams, members, profiles, weekly challenges -->
    <div v-if="showManageModal" class="modal-overlay" @click.self="closeManageModal">
      <div class="modal-content modal-wide">
        <h2>Manage season: {{ managingChallenge?.class_name || managingChallenge?.className }}</h2>
        <p class="hint" style="margin: -4px 0 12px;">Teams and participants belong to this season. Weekly challenges are the per-week task set (different from the season itself).</p>
        <div class="manage-tabs">
          <button type="button" :class="['tab-btn', { active: manageTab === 'teams' }]" @click="manageTab = 'teams'">Teams</button>
          <button type="button" :class="['tab-btn', { active: manageTab === 'members' }]" @click="manageTab = 'members'">Participants</button>
          <button type="button" :class="['tab-btn', { active: manageTab === 'profiles' }]" @click="manageTab = 'profiles'; loadParticipantProfiles()">Profiles (Gender/DOB)</button>
          <button type="button" :class="['tab-btn', { active: manageTab === 'weekly' }]" @click="manageTab = 'weekly'; loadWeeklyTasks(); loadTemplateLibrary()">Weekly challenges</button>
        </div>

        <div v-show="manageTab === 'teams'" class="manage-panel">
          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="openAddTeamModal" :disabled="!managingChallenge">Add Team</button>
            <button class="btn btn-secondary btn-sm" :disabled="!managingChallenge" @click="loadSnakeDraftBoard">Snake Draft Board</button>
          </div>
          <div v-if="snakeDraftPicks.length" class="mini-list">
            <h4>Snake Draft Picks</h4>
            <div v-for="pick in snakeDraftPicks" :key="`pick-${pick.pickNumber}`" class="mini-row">
              <span>Round {{ pick.round }} · Pick {{ pick.pickNumber }} · {{ pick.teamName }}</span>
            </div>
          </div>
          <div v-if="teams.length === 0" class="empty-hint">No teams yet. Add teams for team-based competition.</div>
          <ul v-else class="team-list">
            <li v-for="t in teams" :key="t.id" class="team-item">
              <span>{{ t.team_name }}</span>
              <span v-if="teamLeadName(t)" class="team-lead">Lead: {{ teamLeadName(t) }}</span>
              <button class="btn btn-secondary btn-sm" @click="openEditTeamModal(t)">Edit</button>
              <button class="btn btn-secondary btn-sm" @click="removeTeam(t)">Remove</button>
            </li>
          </ul>
        </div>

        <div v-show="manageTab === 'members'" class="manage-panel">
          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="openAddMemberModal" :disabled="!managingChallenge">Add Participant</button>
          </div>
          <div v-if="providerMembers.length === 0" class="empty-hint">No participants yet. Add participants to allow them to log workouts.</div>
          <ul v-else class="member-list">
            <li v-for="m in providerMembers" :key="m.provider_user_id" class="member-item">
              <span>{{ memberDisplayName(m) }}</span>
              <span class="member-status">{{ m.membership_status }}</span>
              <button class="btn btn-secondary btn-sm" @click="removeMember(m)">Remove</button>
            </li>
          </ul>
        </div>

        <div v-show="manageTab === 'profiles'" class="manage-panel">
          <p class="hint">Set gender and date of birth for participants to appear in Recognition of the Week (Fastest Male/Female, Master's Division).</p>
          <div v-if="profileCompletenessLoading" class="loading-inline">Checking global profile completeness…</div>
          <div v-else-if="profileCompletenessMissing.length" class="error-inline" style="margin-bottom: 10px;">
            {{ profileCompletenessMissing.length }} participants are missing global birthdate and/or sex fields.
            <div class="hint" style="margin-top: 6px;">
              {{ profileCompletenessMissing.map((p) => `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email).join(', ') }}
            </div>
          </div>
          <div v-if="participantProfilesLoading" class="loading-inline">Loading…</div>
          <div v-else class="profiles-list">
            <div v-for="m in providerMembers" :key="m.provider_user_id" class="profile-row">
              <span>{{ memberDisplayName(m) }}</span>
              <select v-model="profileEdits[m.provider_user_id].gender" @change="saveProfile(m)">
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non_binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
              <input v-model="profileEdits[m.provider_user_id].dateOfBirth" type="date" @change="saveProfile(m)" placeholder="DOB" />
            </div>
            <div v-if="!providerMembers.length" class="empty-hint">No participants yet. Add participants first, then set their profiles.</div>
          </div>
        </div>

        <div v-show="manageTab === 'weekly'" class="manage-panel">
          <!-- Library picker -->
          <div v-if="templateLibrary.length" class="library-picker-bar">
            <label class="library-picker-label">📚 Add from library</label>
            <select v-model="libraryPickerSelected" class="library-picker-select">
              <option value="">— pick a template —</option>
              <option v-for="tpl in templateLibrary" :key="tpl.id" :value="tpl.id">{{ tpl.name }}</option>
            </select>
            <select v-if="libraryPickerSelected" v-model="libraryPickerSlot" class="library-picker-select">
              <option value="">— slot —</option>
              <option value="0">Weekly task 1</option>
              <option value="1">Weekly task 2</option>
              <option value="2">Weekly task 3</option>
            </select>
            <button class="btn btn-secondary btn-sm" @click="applyLibraryTemplate" :disabled="!libraryPickerSelected || libraryPickerSlot === ''">Apply</button>
          </div>

          <div class="panel-actions">
            <label>Week of</label>
            <input v-model="weeklyTasksWeek" type="date" />
            <button class="btn btn-secondary btn-sm" @click="generateWeeklyAiDraft" :disabled="!managingChallenge || weeklyAiDraftLoading">
              {{ weeklyAiDraftLoading ? 'Generating…' : 'Generate AI Draft' }}
            </button>
            <button class="btn btn-primary btn-sm" @click="saveWeeklyTasks" :disabled="!managingChallenge || weeklyTasksSaving">
              {{ weeklyTasksSaving ? 'Saving…' : 'Save weekly tasks (3)' }}
            </button>
            <button class="btn btn-primary btn-sm" @click="publishWeeklyDraft" :disabled="!managingChallenge || weeklyPublishSaving">
              {{ weeklyPublishSaving ? 'Publishing…' : 'Publish Week' }}
            </button>
            <button class="btn btn-secondary btn-sm" @click="closeWeek" :disabled="!managingChallenge || closeWeekSaving">
              {{ closeWeekSaving ? 'Closing…' : 'Close Week & Post Scoreboard' }}
            </button>
          </div>
          <div v-if="noShowAlerts.length" class="error-inline" style="margin-bottom: 8px;">
            No-show risk alerts ({{ noShowAlerts.length }}):
            <span class="hint">
              {{ noShowAlerts.map((a) => `${a.firstName || ''} ${a.lastName || ''}`.trim()).join(', ') }}
            </span>
          </div>
          <div class="weekly-tasks-form">
            <div v-for="(t, i) in weeklyTasksForm" :key="i" class="weekly-task-card">
              <div class="weekly-task-card-header">
                <strong class="task-num">Weekly task {{ i + 1 }}</strong>
                <div class="task-header-actions">
                  <label class="season-long-toggle">
                    <input type="checkbox" v-model="t.isSeasonLong" />
                    Season-long
                  </label>
                  <button class="btn btn-ghost btn-xs" @click="toggleCriteria(i)">
                    {{ showCriteriaFor[i] ? '▲ Hide criteria' : '▼ Criteria' }}
                  </button>
                  <button class="btn btn-ghost btn-xs" @click="saveTaskToLibrary(t)" title="Save as reusable template">
                    💾 Save to library
                  </button>
                </div>
              </div>
              <input v-model="t.name" type="text" placeholder="e.g., Run 5 miles" class="task-input" />
              <textarea v-model="t.description" rows="2" placeholder="Optional description" class="task-input" />
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
                <select v-model="t.mode" style="flex:1;min-width:160px;">
                  <option value="volunteer_or_elect">Volunteer or Elect</option>
                  <option value="captain_assigns">Captain Assigns</option>
                  <option value="full_team">Full Team</option>
                </select>
                <select v-model="t.proofPolicy" style="flex:1;min-width:160px;">
                  <option value="none">No proof required</option>
                  <option value="photo_required">Photo required</option>
                  <option value="gps_or_photo">GPS or photo proof</option>
                  <option value="gps_required_no_treadmill">GPS required (no treadmill)</option>
                </select>
              </div>

              <!-- Criteria Builder (expandable) -->
              <div v-if="showCriteriaFor[i]" class="criteria-builder">
                <div class="criteria-section-title">Rich criteria — validates workouts tagged to this weekly task</div>

                <div class="criteria-row">
                  <label>Task type</label>
                  <select v-model="t.criteriaJson.challengeType">
                    <option value="">Any</option>
                    <option value="workout">Workout</option>
                    <option value="race">Race</option>
                    <option value="once_per_season">Once per season</option>
                  </select>
                </div>

                <div class="criteria-row">
                  <label>Activity types allowed</label>
                  <div class="multi-check-row">
                    <label v-for="at in activityTypeOptions" :key="at">
                      <input type="checkbox" :value="at" v-model="t.criteriaJson.activityTypes" />
                      {{ at }}
                    </label>
                  </div>
                </div>

                <div class="criteria-row">
                  <label>Terrain allowed</label>
                  <div class="multi-check-row">
                    <label v-for="tr in terrainOptions" :key="tr">
                      <input type="checkbox" :value="tr" v-model="t.criteriaJson.terrain" />
                      {{ tr }}
                    </label>
                  </div>
                </div>

                <div class="criteria-row">
                  <label>Time-of-day window</label>
                  <div class="criteria-pair">
                    <input type="time" v-model="t.criteriaJson.timeOfDay.start" />
                    <span>to</span>
                    <input type="time" v-model="t.criteriaJson.timeOfDay.end" />
                  </div>
                </div>

                <div class="criteria-row">
                  <label>Min distance (miles)</label>
                  <input type="number" step="0.1" min="0" v-model.number="t.criteriaJson.distance.minMiles" placeholder="e.g. 3.1" />
                </div>

                <div class="criteria-row">
                  <label>Min duration (minutes)</label>
                  <input type="number" min="0" v-model.number="t.criteriaJson.duration.minMinutes" placeholder="e.g. 30" />
                </div>

                <div class="criteria-row">
                  <label>Max pace (seconds/mile) — "no slower than"</label>
                  <input type="number" min="0" v-model.number="t.criteriaJson.pace.maxSecondsPerMile" placeholder="e.g. 720 = 12:00/mi" />
                  <small v-if="t.criteriaJson.pace.maxSecondsPerMile">
                    = {{ Math.floor(t.criteriaJson.pace.maxSecondsPerMile / 60) }}:{{ String(Math.round(t.criteriaJson.pace.maxSecondsPerMile) % 60).padStart(2,'0') }}/mi
                  </small>
                </div>

                <div class="criteria-row">
                  <label>
                    <input type="checkbox" v-model="t.criteriaJson._splitRunEnabled" @change="onSplitRunToggle(t)" />
                    Split-run (multiple workouts in one day)
                  </label>
                </div>
                <div v-if="t.criteriaJson._splitRunEnabled" class="criteria-sub">
                  <label>Number of runs required</label>
                  <input type="number" min="2" max="5" v-model.number="t.criteriaJson.splitRuns.count" />
                  <label>Min separation between runs (minutes)</label>
                  <input type="number" min="0" v-model.number="t.criteriaJson.splitRuns.minSeparationMinutes" placeholder="e.g. 120" />
                </div>
              </div>

              <div class="hint" v-if="t.confidenceScore != null">AI confidence: {{ t.confidenceScore }}%</div>
            </div>
          </div>
          <div v-if="weeklyTasksWithIds.length && teams.length" class="weekly-assignments">
            <h4>Assignments</h4>
            <p class="hint">Assign one person per task per team. Captains can also assign from the season dashboard.</p>
            <div v-for="t in weeklyTasksWithIds" :key="t.id" class="assignment-group">
              <strong>{{ t.name }}</strong>
              <div v-for="team in teams" :key="team.id" class="assignment-row">
                <span>{{ team.team_name }}</span>
                <select :value="getAssignmentFor(t.id, team.id)?.provider_user_id" @change="(e) => updateAssignment(t.id, team.id, e.target.value)">
                  <option value="">—</option>
                  <option v-for="m in getTeamMembers(team.id)" :key="m.provider_user_id" :value="m.provider_user_id">{{ userDisplayName(m) }}</option>
                </select>
                <span v-if="getAssignmentFor(t.id, team.id)?.is_completed" class="badge-done">Done</span>
                <button
                  v-if="getAssignmentFor(t.id, team.id)"
                  class="btn btn-secondary btn-sm"
                  @click="setAssignmentCompletion(getAssignmentFor(t.id, team.id), !getAssignmentFor(t.id, team.id)?.is_completed)"
                >
                  {{ getAssignmentFor(t.id, team.id)?.is_completed ? 'Mark Incomplete' : 'Mark Complete' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" @click="closeManageModal">Done</button>
        </div>
      </div>
    </div>

    <!-- Add Team Modal -->
    <div v-if="showTeamModal" class="modal-overlay" @click.self="closeTeamModal">
      <div class="modal-content">
        <h2>{{ editingTeam ? 'Edit Team' : 'Add Team' }}</h2>
        <form @submit.prevent="saveTeam">
          <div class="form-group">
            <label>Team name *</label>
            <input v-model="teamForm.teamName" type="text" required placeholder="e.g., Team Alpha" />
          </div>
          <div class="form-group">
            <label>Team Lead (optional)</label>
            <select v-model="teamForm.teamManagerUserId">
              <option value="">None</option>
              <option v-for="u in orgUsers" :key="u.id" :value="u.id">{{ userDisplayName(u) }}</option>
            </select>
            <small>Team Leads (provider_plus) can manage their team.</small>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeTeamModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="teamSaving">{{ teamSaving ? 'Saving…' : 'Save' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Custom Fields section (club-level) -->
    <div class="panel" style="margin-top: 24px;">
      <ClubCustomFields
        :club-id="organizationId"
        @fields-updated="challengeCustomFields = $event"
      />
    </div>

    <!-- Recognition Awards & Groups Library -->
    <div v-if="organizationId" class="panel" style="margin-top: 24px;">
      <div class="panel-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div>
          <h2 style="margin:0;font-size:1.1em;">Recognition Library</h2>
          <p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary);">Manage reusable awards and eligibility groups that can be selected when configuring any season.</p>
        </div>
      </div>
      <RecognitionLibraryManager
        ref="libraryManagerRef"
        :club-id="organizationId"
        :custom-field-defs="challengeCustomFields"
        @groups-updated="libraryGroups = $event"
        @awards-updated="libraryAwards = $event"
      />
    </div>

    <!-- Member Photo Moderation -->
    <div class="panel" style="margin-top: 24px;">
      <div class="panel-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h2 style="margin:0;font-size:1.1em;">Member Photos — Moderation</h2>
        <button class="btn btn-secondary btn-compact" @click="loadFlaggedPhotos" :disabled="flaggedLoading">
          {{ flaggedLoading ? 'Loading…' : 'Refresh' }}
        </button>
      </div>
      <div v-if="flaggedError" class="error" style="margin-bottom:10px;">{{ flaggedError }}</div>
      <div v-if="flaggedLoading" class="hint">Loading flagged photos…</div>
      <div v-else-if="!flaggedPhotos.length" class="hint">
        No flagged photos right now. Use the "Flag" button on a member's photo to surface it here.
      </div>
      <div v-else class="flagged-photo-grid">
        <div v-for="p in flaggedPhotos" :key="p.id" class="flagged-photo-card">
          <img :src="p.url" alt="" class="flagged-photo-img" />
          <div class="flagged-photo-meta">
            <div class="flagged-user">{{ p.userFirstName }} {{ p.userLastName }}</div>
            <div v-if="p.flaggedReason" class="flagged-reason">{{ p.flaggedReason }}</div>
            <div class="flagged-actions">
              <button class="btn btn-sm btn-danger" @click="moderateRemove(p)">Remove Photo</button>
              <button class="btn btn-sm btn-secondary" @click="unflagPhoto(p)">Unflag</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Member Modal -->
    <div v-if="showMemberModal" class="modal-overlay" @click.self="closeMemberModal">
      <div class="modal-content">
        <h2>Add Participant</h2>
        <form @submit.prevent="addMember">
          <div class="form-group">
            <label>User *</label>
            <select v-model="memberForm.providerUserId" required>
              <option value="">Select…</option>
              <option v-for="u in availableUsers" :key="u.id" :value="u.id">{{ userDisplayName(u) }}</option>
            </select>
            <small v-if="!availableUsers.length">No users in this organization. Add users via Company Profile first.</small>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="closeMemberModal">Cancel</button>
            <button type="submit" class="btn btn-primary" :disabled="memberSaving">{{ memberSaving ? 'Adding…' : 'Add' }}</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import RecognitionCategoryBuilder from '../challenge/RecognitionCategoryBuilder.vue';
import RecognitionLibraryManager from '../challenge/RecognitionLibraryManager.vue';
import ClubCustomFields from '../club/ClubCustomFields.vue';
import { TIMEZONE_GROUPS } from '../../utils/timezones.js';
import {
  agreementItemsToTextarea,
  agreementTextareaToItems,
  collectUniqueParticipationAgreementSnapshots,
  defaultParticipationAgreement,
  formatParticipationAgreementSeasonLabel,
  normalizeParticipationAgreement
} from '../../utils/seasonParticipationAgreement.js';

const router = useRouter();
const agencyStore = useAgencyStore();

const organizationId = computed(() => agencyStore.currentAgency?.id || null);

// ── Weekly goal helpers ───────────────────────────────────────────
const GOAL_METRIC_UNIT = {
  miles:      'mi',
  points:     'pts',
  minutes:    'min',
  activities: 'activities'
};
const weeklyGoalUnit = computed(() => GOAL_METRIC_UNIT[challengeForm.value.weeklyGoalMetric] || 'mi');

const weeklyGoalIsMiles = computed(() => challengeForm.value.weeklyGoalMetric === 'miles');

/** Per-person value for week N (1-indexed), based on progression settings. */
const perPersonForWeek = (weekNum) => {
  const base     = Number(challengeForm.value.runRuckStartMilesPerPerson) || 0;
  const increase = Number(challengeForm.value.runRuckWeeklyIncreaseMilesPerPerson) || 0;
  return base + increase * (weekNum - 1);
};

/** Preview rows for the miles progression table (weeks 1-8). */
const goalProgressionRows = computed(() => {
  if (!weeklyGoalIsMiles.value) return [];
  const members = Number(challengeForm.value.weeklyGoalMembersPerTeam) || 1;
  return Array.from({ length: 8 }, (_, i) => {
    const wk      = i + 1;
    const perPerson = perPersonForWeek(wk);
    return { wk, perPerson: perPerson.toFixed(1), teamTotal: (perPerson * members).toFixed(1) };
  });
});
const recordMetricOptions = [
  { value: 'longest_run', label: 'Longest Run' },
  { value: 'fastest_mile', label: 'Best Mile Pace (Run)' },
  { value: 'longest_ruck', label: 'Longest Ruck' },
  { value: 'highest_points_workout', label: 'Highest Points (Single Workout)' },
  { value: 'longest_trail_run', label: 'Longest Trail Run' },
  { value: 'fastest_5k', label: 'Fastest 5K (Est.)' },
  { value: 'longest_walk', label: 'Longest Walk' },
  { value: 'longest_duration_workout', label: 'Longest Workout Duration' },
  { value: 'highest_calories_workout', label: 'Highest Calories (Single Workout)' },
  { value: 'fastest_half_marathon', label: 'Fastest Half Marathon (13.1+ mi)' },
  { value: 'fastest_marathon', label: 'Fastest Marathon (26.2+ mi)' }
];
const recordMetricOptionSet = new Set(recordMetricOptions.map((o) => o.value));
const challengeCustomFields = ref([]);
const libraryManagerRef = ref(null);
const libraryAwards = ref([]);
const libraryGroups = ref([]);
const selectedAgreementTemplateKey = ref('');
const normalizeRecordMetricSelection = (raw) => {
  const arr = Array.isArray(raw)
    ? raw
    : (typeof raw === 'string' ? raw.split(',') : []);
  return arr
    .map((v) => String(v || '').trim())
    .filter((v) => recordMetricOptionSet.has(v));
};

const loading = ref(false);
const error = ref('');
const challenges = ref([]);
const saving = ref(false);
const showChallengeModal = ref(false);
const editingChallenge = ref(null);
const agreementTemplateOptions = computed(() => collectUniqueParticipationAgreementSnapshots(challenges.value));
const defaultAgreementFields = () => {
  const agreement = defaultParticipationAgreement();
  return {
    agreementLabel: agreement.label,
    agreementIntroText: agreement.introText,
    agreementItemsText: agreementItemsToTextarea(agreement.items)
  };
};
const blankAgreementFields = () => ({
  agreementLabel: '',
  agreementIntroText: '',
  agreementItemsText: ''
});
const buildAgreementFieldsFromSettings = (seasonSettings = {}) => {
  const agreement = normalizeParticipationAgreement(seasonSettings?.participationAgreement || seasonSettings?.communityGuidelines || {});
  if (!agreement.label && !agreement.introText && !agreement.items.length) return blankAgreementFields();
  return {
    agreementLabel: agreement.label,
    agreementIntroText: agreement.introText,
    agreementItemsText: agreementItemsToTextarea(agreement.items)
  };
};
const buildParticipationAgreementPayload = (formLike = {}) => ({
  label: String(formLike.agreementLabel || '').trim(),
  introText: String(formLike.agreementIntroText || '').trim(),
  items: agreementTextareaToItems(formLike.agreementItemsText)
});
const applyAgreementTemplate = () => {
  const snapshot = agreementTemplateOptions.value.find((option) => option.key === selectedAgreementTemplateKey.value);
  if (!snapshot) return;
  challengeForm.value.agreementLabel = snapshot.agreement.label || '';
  challengeForm.value.agreementIntroText = snapshot.agreement.introText || '';
  challengeForm.value.agreementItemsText = agreementItemsToTextarea(snapshot.agreement.items || []);
};
const formatAgreementTemplateOption = (option) => formatParticipationAgreementSeasonLabel(option);
const challengeForm = ref({
  ...defaultAgreementFields(),
  className: '',
  description: '',
  status: 'draft',
  startsAt: '',
  endsAt: '',
  activityTypesText: '',
  weeklyGoalMinimum: null,
  weeklyGoalMetric: 'miles',
  weeklyGoalMembersPerTeam: 10,
  teamMinPointsPerWeek: null,
  individualMinPointsPerWeek: null,
  mastersAgeThreshold: 53,
  recognitionCategories: [],
  registrationEligible: false,
  medicaidEligible: false,
  cashEligible: false,
  weekStartsOn: 'monday',
  weekEndsSundayAt: '23:59',
  weekTimeZone: 'UTC',
  tasksPerWeek: 3,
  publishLeadHours: 24,
  weightRun: 1,
  weightRide: 1,
  weightWorkout: 1,
  weightWalk: 1,
  additionalMetricsText: '',
  eventCategory: 'run_ruck',
  challengeAssignmentMode: 'volunteer_or_elect',
  runMilesPerPoint: 1,
  ruckMilesPerPoint: 1,
  caloriesPerPoint: 100,
  teamCount: 2,
  presetTeamNamesText: '',
  allowCaptainRenameTeam: true,
  allowCaptainNicknameSuffixWhenLocked: false,
  allowByeWeek: false,
  maxByeWeeksPerParticipant: 1,
  requireAdvanceByeDeclaration: true,
  postseasonEnabled: false,
  regularSeasonWeeks: 10,
  postseasonHasBreakWeek: false,
  postseasonBreakWeekNumber: 11,
  playoffWeekNumber: 11,
  championshipWeekNumber: 12,
  playoffSeedCount: 4,
  playoffMatchupMode: '1v4_2v3',
  runRuckStartMilesPerPerson: 0,
  runRuckWeeklyIncreaseMilesPerPerson: 2,
  maxRucksPerWeek: 0,
  treadmillPhotoRequired: true,
  treadmillpocalypseEnabled: false,
  treadmillpocalypseStartsAtWeek: '',
  workoutModerationMode: 'treadmill_only',
  showInClubFeed: true,
  recordMetrics: []
});

const weeklyTasksWeek = ref(getThisWeekSunday());

const defaultCriteria = () => ({
  challengeType: '',
  activityTypes: [],
  terrain: [],
  timeOfDay: { start: '', end: '' },
  distance: { minMiles: null },
  duration: { minMinutes: null },
  pace: { maxSecondsPerMile: null },
  splitRuns: { count: 2, minSeparationMinutes: 60 },
  _splitRunEnabled: false
});
const defaultTask = () => ({
  name: '', description: '', proofPolicy: 'none', mode: 'volunteer_or_elect',
  confidenceScore: null, isSeasonLong: false, criteriaJson: defaultCriteria()
});

const weeklyTasksForm = ref([defaultTask(), defaultTask(), defaultTask()]);
const weeklyTasksSaving = ref(false);

// Criteria builder state
const showCriteriaFor = ref({ 0: false, 1: false, 2: false });
const toggleCriteria = (i) => { showCriteriaFor.value[i] = !showCriteriaFor.value[i]; };
const onSplitRunToggle = (t) => {
  if (!t.criteriaJson._splitRunEnabled) t.criteriaJson.splitRuns = { count: 2, minSeparationMinutes: 60 };
};

const activityTypeOptions = ['Run', 'Trail Run', 'Ruck', 'Walk', 'Bike', 'Swim', 'Other'];
const terrainOptions = ['Road', 'Trail', 'Track', 'Treadmill', 'Race', 'Other'];

// Template library state
const templateLibrary = ref([]);
const libraryPickerSelected = ref('');
const libraryPickerSlot = ref('');

const loadTemplateLibrary = async () => {
  const clubId = managingChallenge.value?.organization_id;
  if (!clubId) return;
  try {
    const r = await api.get(`/summit-stats/clubs/${clubId}/challenge-templates`);
    templateLibrary.value = Array.isArray(r.data?.templates) ? r.data.templates : [];
  } catch { templateLibrary.value = []; }
};

const applyLibraryTemplate = () => {
  const tpl = templateLibrary.value.find((t) => String(t.id) === String(libraryPickerSelected.value));
  const slot = parseInt(libraryPickerSlot.value, 10);
  if (!tpl || isNaN(slot)) return;
  const crit = tpl.criteriaJson || defaultCriteria();
  if (!crit.timeOfDay) crit.timeOfDay = { start: '', end: '' };
  if (!crit.distance) crit.distance = { minMiles: null };
  if (!crit.duration) crit.duration = { minMinutes: null };
  if (!crit.pace) crit.pace = { maxSecondsPerMile: null };
  if (!crit.splitRuns) crit.splitRuns = { count: 2, minSeparationMinutes: 60 };
  crit._splitRunEnabled = !!(crit.splitRuns?.count && crit.splitRuns.count > 1);
  weeklyTasksForm.value[slot] = {
    name: tpl.name,
    description: tpl.description || '',
    proofPolicy: tpl.proofPolicy || 'none',
    mode: tpl.mode || 'volunteer_or_elect',
    confidenceScore: null,
    isSeasonLong: tpl.isSeasonLong || false,
    criteriaJson: crit
  };
  libraryPickerSelected.value = '';
  libraryPickerSlot.value = '';
};

const saveTaskToLibrary = async (t) => {
  const clubId = managingChallenge.value?.organization_id;
  if (!clubId || !t.name?.trim()) return alert('Weekly task needs a name before saving to library.');
  const payload = {
    name: t.name.trim(),
    description: t.description || null,
    proofPolicy: t.proofPolicy || 'none',
    mode: t.mode || 'volunteer_or_elect',
    isSeasonLong: t.isSeasonLong || false,
    criteriaJson: buildCriteriaPayload(t.criteriaJson)
  };
  try {
    await api.post(`/summit-stats/clubs/${clubId}/challenge-templates`, payload);
    await loadTemplateLibrary();
    alert(`"${t.name}" saved to library.`);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save template');
  }
};

const buildCriteriaPayload = (c) => {
  if (!c) return null;
  const out = {};
  if (c.challengeType) out.challengeType = c.challengeType;
  if (c.activityTypes?.length) out.activityTypes = c.activityTypes;
  if (c.terrain?.length) out.terrain = c.terrain;
  if (c.timeOfDay?.start || c.timeOfDay?.end) out.timeOfDay = c.timeOfDay;
  if (c.distance?.minMiles) out.distance = { minMiles: Number(c.distance.minMiles) };
  if (c.duration?.minMinutes) out.duration = { minMinutes: Number(c.duration.minMinutes) };
  if (c.pace?.maxSecondsPerMile) out.pace = { maxSecondsPerMile: Number(c.pace.maxSecondsPerMile) };
  if (c._splitRunEnabled && c.splitRuns?.count > 1) out.splitRuns = c.splitRuns;
  return Object.keys(out).length ? out : null;
};
const closeWeekSaving = ref(false);
const weeklyAiDraftLoading = ref(false);
const weeklyPublishSaving = ref(false);
const weeklyAssignments = ref([]);
const weeklyTasksWithIds = ref([]);
const teamMembersCache = ref({});
const snakeDraftPicks = ref([]);
const noShowAlerts = ref([]);

function getThisWeekSunday() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sun = new Date(d);
  sun.setDate(diff);
  return sun.toISOString().slice(0, 10);
}

const showManageModal = ref(false);
const managingChallenge = ref(null);
const manageTab = ref('teams');
const teams = ref([]);
const providerMembers = ref([]);
const orgUsers = ref([]);

const showTeamModal = ref(false);
const editingTeam = ref(null);
const teamForm = ref({ teamName: '', teamManagerUserId: '' });
const teamSaving = ref(false);

const showMemberModal = ref(false);
const memberForm = ref({ providerUserId: '' });
const memberSaving = ref(false);

const launching = ref(false);
const participantProfiles = ref([]);
const participantProfilesLoading = ref(false);
const profileEdits = ref({});
const profileCompletenessLoading = ref(false);
const profileCompletenessMissing = ref([]);

const organizationSlug = computed(() => agencyStore.currentAgency?.slug || agencyStore.currentAgency?.portal_url || null);

const challengeDashboardLink = (c) => {
  const id = c.id;
  if (organizationSlug.value) return `/${organizationSlug.value}/season/${id}`;
  return `/${String(import.meta.env.VITE_NATIVE_APP_ORG_SLUG || 'ssc').trim().toLowerCase()}/season/${id}`;
};

const formatStatus = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active' && isExpiredSeason(c)) return 'Expired (Open)';
  if (s === 'active') return 'Active';
  if (s === 'draft') return 'Draft';
  if (s === 'closed') return 'Closed';
  if (s === 'archived') return 'Archived';
  return s || '—';
};

const isExpiredSeason = (c) => {
  const end = c?.ends_at || c?.endsAt;
  if (!end) return false;
  const ts = new Date(end).getTime();
  return Number.isFinite(ts) && ts < Date.now();
};

const statusClass = (c) => {
  const s = String(c?.status || '').toLowerCase();
  if (s === 'active' && isExpiredSeason(c)) return 'status-expired';
  if (s === 'active') return 'status-active';
  if (s === 'closed') return 'status-closed';
  return '';
};

const canCloseSeason = (c) => {
  const s = String(c?.status || '').toLowerCase();
  return s === 'active' || s === 'draft';
};

const formatDates = (c) => {
  const start = c?.starts_at || c?.startsAt;
  const end = c?.ends_at || c?.endsAt;
  if (!start && !end) return '';
  const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `Starts ${fmt(start)}`;
  return `Ends ${fmt(end)}`;
};

const formatActivityTypes = (raw) => {
  if (Array.isArray(raw)) return raw.map((t) => String(t).replace(/_/g, ' ')).join(', ');
  if (typeof raw === 'object' && raw) return Object.keys(raw).map((k) => k.replace(/_/g, ' ')).join(', ');
  return '';
};

const userDisplayName = (u) => {
  const fn = u?.first_name || '';
  const ln = u?.last_name || '';
  const email = u?.email || '';
  if (fn || ln) return `${fn} ${ln}`.trim() || email;
  return email || `User ${u?.id}`;
};

const memberDisplayName = (m) => {
  const fn = m?.first_name || '';
  const ln = m?.last_name || '';
  const email = m?.email || '';
  if (fn || ln) return `${fn} ${ln}`.trim() || email;
  return email || `User ${m?.provider_user_id}`;
};

const teamLeadName = (t) => {
  const fn = t?.manager_first_name || '';
  const ln = t?.manager_last_name || '';
  if (fn || ln) return `${fn} ${ln}`.trim();
  return null;
};

const availableUsers = computed(() => {
  const memberIds = new Set((providerMembers.value || []).map((m) => Number(m.provider_user_id)));
  return (orgUsers.value || []).filter((u) => !memberIds.has(Number(u.id)));
});

const loadChallenges = async () => {
  if (!organizationId.value) return;
  loading.value = true;
  error.value = '';
  try {
    const r = await api.get('/learning-program-classes', { params: { organizationId: organizationId.value, includeArchived: true } });
    challenges.value = Array.isArray(r.data?.classes) ? r.data.classes : [];
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load seasons';
    challenges.value = [];
  } finally {
    loading.value = false;
  }
};

const openCreateModal = () => {
  editingChallenge.value = null;
  selectedAgreementTemplateKey.value = '';
  challengeForm.value = {
    ...defaultAgreementFields(),
    className: '',
    description: '',
    status: 'draft',
    startsAt: '',
    endsAt: '',
    activityTypesText: '',
    weeklyGoalMinimum: null,
    weeklyGoalMetric: 'miles',
    weeklyGoalMembersPerTeam: 10,
    teamMinPointsPerWeek: null,
    individualMinPointsPerWeek: null,
    mastersAgeThreshold: 53,
    recognitionCategories: [],
    registrationEligible: false,
    medicaidEligible: false,
    cashEligible: false,
    weekStartsOn: 'monday',
    weekEndsSundayAt: '23:59',
    weekTimeZone: 'UTC',
    tasksPerWeek: 3,
    publishLeadHours: 24,
    weightRun: 1,
    weightRide: 1,
    weightWorkout: 1,
    weightWalk: 1,
    additionalMetricsText: '',
    eventCategory: 'run_ruck',
    challengeAssignmentMode: 'volunteer_or_elect',
    runMilesPerPoint: 1,
    ruckMilesPerPoint: 1,
    caloriesPerPoint: 100,
    teamCount: 2,
    presetTeamNamesText: '',
    allowCaptainRenameTeam: true,
    allowCaptainNicknameSuffixWhenLocked: false,
    allowByeWeek: false,
    maxByeWeeksPerParticipant: 1,
    requireAdvanceByeDeclaration: true,
    postseasonEnabled: false,
    regularSeasonWeeks: 10,
    postseasonHasBreakWeek: false,
    postseasonBreakWeekNumber: 11,
    playoffWeekNumber: 11,
    championshipWeekNumber: 12,
    playoffSeedCount: 4,
    playoffMatchupMode: '1v4_2v3',
    runRuckStartMilesPerPerson: 0,
    runRuckWeeklyIncreaseMilesPerPerson: 2,
    maxRucksPerWeek: 0,
    treadmillPhotoRequired: true,
    treadmillpocalypseEnabled: false,
    treadmillpocalypseStartsAtWeek: '',
    workoutModerationMode: 'treadmill_only',
    showInClubFeed: true,
    recordMetrics: []
  };
  showChallengeModal.value = true;
};

const openEditModal = (c) => {
  editingChallenge.value = c;
  const at = c?.activity_types_json;
  let activityTypesText = '';
  if (Array.isArray(at)) activityTypesText = at.join(', ');
  else if (typeof at === 'object' && at) activityTypesText = Object.keys(at).join(', ');
  const rec = c.recognition_categories_json ?? c.recognitionCategoriesJson;
  const recArr = Array.isArray(rec) ? rec : (typeof rec === 'string' ? (() => { try { return JSON.parse(rec) || []; } catch { return []; } })() : []);
  const seasonSettings = c.season_settings_json && typeof c.season_settings_json === 'object'
    ? c.season_settings_json
    : {};
  const scoringSettings = seasonSettings.scoring || {};
  const scheduleSettings = seasonSettings.schedule || {};
  const publishSettings = seasonSettings.challengePublish || {};
  const recognitionSettings = seasonSettings.recognition || {};
  const eventSettings = seasonSettings.event || {};
  const teamsSettings = seasonSettings.teams || {};
  const byeSettings = seasonSettings.byeWeek || {};
  const treadmillSettings = seasonSettings.treadmill || {};
  const treadmillpocalypseSettings = seasonSettings.treadmillpocalypse || {};
  const moderationSettings = seasonSettings.workoutModeration || {};
  const recordsSettings = seasonSettings.records || {};
  const postseasonSettings = seasonSettings.postseason || {};
  selectedAgreementTemplateKey.value = '';
  challengeForm.value = {
    ...buildAgreementFieldsFromSettings(seasonSettings),
    className: c.class_name || c.className || '',
    description: c.description || '',
    status: (c.status || 'draft').toLowerCase(),
    startsAt: c.starts_at || c.startsAt ? new Date(c.starts_at || c.startsAt).toISOString().slice(0, 16) : '',
    endsAt: c.ends_at || c.endsAt ? new Date(c.ends_at || c.endsAt).toISOString().slice(0, 16) : '',
    activityTypesText,
    weeklyGoalMinimum: c.weekly_goal_minimum ?? c.weeklyGoalMinimum ?? null,
    weeklyGoalMetric: seasonSettings?.participation?.weeklyGoalMetric || 'miles',
    weeklyGoalMembersPerTeam: seasonSettings?.participation?.weeklyGoalMembersPerTeam ?? 10,
    teamMinPointsPerWeek: c.team_min_points_per_week ?? c.teamMinPointsPerWeek ?? null,
    individualMinPointsPerWeek: c.individual_min_points_per_week ?? c.individualMinPointsPerWeek ?? null,
    mastersAgeThreshold: c.masters_age_threshold ?? c.mastersAgeThreshold ?? 53,
    recognitionCategories: recArr,
    registrationEligible: !!(c.registration_eligible === 1 || c.registration_eligible === true || c.registrationEligible),
    medicaidEligible: !!(c.medicaid_eligible === 1 || c.medicaid_eligible === true || c.medicaidEligible),
    cashEligible: !!(c.cash_eligible === 1 || c.cash_eligible === true || c.cashEligible),
    weekStartsOn: scheduleSettings.weekStartsOn || 'monday',
    weekEndsSundayAt: scheduleSettings.weekEndsSundayAt || '23:59',
    weekTimeZone: scheduleSettings.weekTimeZone || 'UTC',
    tasksPerWeek: publishSettings.tasksPerWeek || 3,
    publishLeadHours: publishSettings.publishLeadHours ?? 24,
    weightRun: scoringSettings?.activityWeights?.run ?? 1,
    weightRide: scoringSettings?.activityWeights?.ride ?? 1,
    weightWorkout: scoringSettings?.activityWeights?.workout ?? 1,
    weightWalk: scoringSettings?.activityWeights?.walk ?? 1,
    additionalMetricsText: Array.isArray(recognitionSettings.additionalMetrics) ? recognitionSettings.additionalMetrics.join(', ') : '',
    eventCategory: eventSettings.category || 'run_ruck',
    challengeAssignmentMode: eventSettings.challengeAssignmentMode || 'volunteer_or_elect',
    runMilesPerPoint: scoringSettings.runMilesPerPoint ?? 1,
    ruckMilesPerPoint: scoringSettings.ruckMilesPerPoint ?? 1,
    caloriesPerPoint: scoringSettings.caloriesPerPoint ?? 100,
    teamCount: teamsSettings.teamCount ?? 2,
    presetTeamNamesText: Array.isArray(teamsSettings.presetTeamNames) ? teamsSettings.presetTeamNames.join(', ') : '',
    allowCaptainRenameTeam: teamsSettings.allowCaptainRenameTeam !== false,
    allowCaptainNicknameSuffixWhenLocked: teamsSettings.allowCaptainNicknameSuffixWhenLocked === true,
    allowByeWeek: byeSettings.allowByeWeek === true,
    maxByeWeeksPerParticipant: byeSettings.maxByeWeeksPerParticipant ?? 1,
    requireAdvanceByeDeclaration: byeSettings.requireAdvanceDeclaration !== false,
    postseasonEnabled: postseasonSettings.enabled === true,
    regularSeasonWeeks: postseasonSettings.regularSeasonWeeks ?? 10,
    postseasonHasBreakWeek: postseasonSettings.hasBreakWeek === true,
    postseasonBreakWeekNumber: postseasonSettings.breakWeekNumber ?? 11,
    playoffWeekNumber: postseasonSettings.playoffWeekNumber ?? 11,
    championshipWeekNumber: postseasonSettings.championshipWeekNumber ?? 12,
    playoffSeedCount: postseasonSettings.playoffSeedCount ?? 4,
    playoffMatchupMode: postseasonSettings.playoffMatchupMode || '1v4_2v3',
    runRuckStartMilesPerPerson: seasonSettings?.participation?.runRuckStartMilesPerPerson ?? 0,
    runRuckWeeklyIncreaseMilesPerPerson: seasonSettings?.participation?.runRuckWeeklyIncreaseMilesPerPerson ?? 2,
    maxRucksPerWeek: seasonSettings?.participation?.maxRucksPerWeek ?? 0,
    treadmillPhotoRequired: treadmillSettings.photoProofRequired !== false,
    treadmillpocalypseEnabled: treadmillpocalypseSettings.enabled === true,
    treadmillpocalypseStartsAtWeek: treadmillpocalypseSettings.startsAtWeek || '',
    workoutModerationMode: moderationSettings.mode || 'treadmill_only',
    showInClubFeed: seasonSettings?.feedSettings?.showInClubFeed !== false,
    recordMetrics: normalizeRecordMetricSelection(recordsSettings.metrics)
  };
  showChallengeModal.value = true;
};

const closeChallengeModal = () => {
  showChallengeModal.value = false;
  editingChallenge.value = null;
  selectedAgreementTemplateKey.value = '';
};

const saveChallenge = async () => {
  if (!organizationId.value) return;
  const name = String(challengeForm.value.className || '').trim();
  if (!name) return;
  saving.value = true;
  try {
    const atText = String(challengeForm.value.activityTypesText || '').trim();
    let activityTypesJson = null;
    if (atText) {
      const arr = atText.split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length) activityTypesJson = arr;
    }
    const startsAt = challengeForm.value.startsAt ? new Date(challengeForm.value.startsAt).toISOString() : null;
    const endsAt = challengeForm.value.endsAt ? new Date(challengeForm.value.endsAt).toISOString() : null;
    const payload = {
      className: name,
      description: challengeForm.value.description || null,
      status: challengeForm.value.status,
      startsAt,
      endsAt,
      activityTypesJson,
      weeklyGoalMinimum: challengeForm.value.weeklyGoalMinimum ?? null,
      teamMinPointsPerWeek: challengeForm.value.teamMinPointsPerWeek ?? null,
      individualMinPointsPerWeek: challengeForm.value.individualMinPointsPerWeek ?? null,
      mastersAgeThreshold: (() => {
        const cats = challengeForm.value.recognitionCategories || [];
        const cfg = cats.find(c => c.type === 'cfg_masters');
        if (cfg) return cfg.ageThreshold ?? 53;
        const m = cats.find(c => c.type === 'masters');
        return m ? (m.ageThreshold ?? 53) : (challengeForm.value.mastersAgeThreshold ?? 53);
      })(),
      recognitionCategoriesJson: challengeForm.value.recognitionCategories?.length ? challengeForm.value.recognitionCategories : null,
      registrationEligible: !!challengeForm.value.registrationEligible,
      medicaidEligible: !!challengeForm.value.medicaidEligible,
      cashEligible: !!challengeForm.value.cashEligible,
      seasonSettingsJson: {
        event: {
          category: challengeForm.value.eventCategory || 'run_ruck',
          challengeAssignmentMode: challengeForm.value.challengeAssignmentMode || 'volunteer_or_elect'
        },
        schedule: {
          weekStartsOn: challengeForm.value.weekStartsOn || 'monday',
          weekEndsSundayAt: challengeForm.value.weekEndsSundayAt || '23:59',
          weekTimeZone: challengeForm.value.weekTimeZone || 'UTC'
        },
        scoring: {
          weeklyMinimumPointsPerAthlete: challengeForm.value.individualMinPointsPerWeek ?? 0,
          teamWeeklyTargetPoints: challengeForm.value.teamMinPointsPerWeek ?? 0,
          runMilesPerPoint: Number(challengeForm.value.runMilesPerPoint ?? 1),
          ruckMilesPerPoint: Number(challengeForm.value.ruckMilesPerPoint ?? 1),
          caloriesPerPoint: Number(challengeForm.value.caloriesPerPoint ?? 100),
          activityWeights: {
            run: Number(challengeForm.value.weightRun ?? 1),
            ride: Number(challengeForm.value.weightRide ?? 1),
            workout: Number(challengeForm.value.weightWorkout ?? 1),
            walk: Number(challengeForm.value.weightWalk ?? 1)
          }
        },
        teams: {
          teamCount: Number(challengeForm.value.teamCount ?? 2),
          presetTeamNames: String(challengeForm.value.presetTeamNamesText || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          allowCaptainRenameTeam: challengeForm.value.allowCaptainRenameTeam !== false,
          allowCaptainNicknameSuffixWhenLocked: challengeForm.value.allowCaptainNicknameSuffixWhenLocked === true
        },
        participation: {
          weeklyGoalMetric: challengeForm.value.weeklyGoalMetric || 'miles',
          weeklyGoalMembersPerTeam: Number(challengeForm.value.weeklyGoalMembersPerTeam ?? 10),
          individualMinPointsPerWeek: Number(challengeForm.value.individualMinPointsPerWeek ?? 0),
          teamMinPointsPerWeek: Number(challengeForm.value.teamMinPointsPerWeek ?? 0),
          runRuckStartMilesPerPerson: Number(challengeForm.value.runRuckStartMilesPerPerson ?? 0),
          runRuckWeeklyIncreaseMilesPerPerson: Number(challengeForm.value.runRuckWeeklyIncreaseMilesPerPerson ?? 0),
          maxRucksPerWeek: Number(challengeForm.value.maxRucksPerWeek ?? 0)
        },
        participationAgreement: buildParticipationAgreementPayload(challengeForm.value),
        byeWeek: {
          allowByeWeek: challengeForm.value.allowByeWeek === true,
          maxByeWeeksPerParticipant: Number(challengeForm.value.maxByeWeeksPerParticipant ?? 1),
          requireAdvanceDeclaration: challengeForm.value.requireAdvanceByeDeclaration !== false
        },
        postseason: {
          enabled: challengeForm.value.postseasonEnabled === true,
          regularSeasonWeeks: Number(challengeForm.value.regularSeasonWeeks ?? 10),
          hasBreakWeek: challengeForm.value.postseasonHasBreakWeek === true,
          breakWeekNumber: challengeForm.value.postseasonHasBreakWeek === true
            ? Number(challengeForm.value.postseasonBreakWeekNumber ?? 11)
            : null,
          playoffWeekNumber: Number(challengeForm.value.playoffWeekNumber ?? 11),
          championshipWeekNumber: Number(challengeForm.value.championshipWeekNumber ?? 12),
          playoffSeedCount: Number(challengeForm.value.playoffSeedCount ?? 4),
          playoffMatchupMode: challengeForm.value.playoffMatchupMode || '1v4_2v3'
        },
        treadmill: {
          photoProofRequired: challengeForm.value.treadmillPhotoRequired !== false
        },
        treadmillpocalypse: {
          enabled: challengeForm.value.treadmillpocalypseEnabled === true,
          startsAtWeek: challengeForm.value.treadmillpocalypseStartsAtWeek || null
        },
        workoutModeration: {
          mode: challengeForm.value.workoutModerationMode || 'treadmill_only'
        },
        feedSettings: {
          showInClubFeed: challengeForm.value.showInClubFeed !== false
        },
        records: {
          metrics: normalizeRecordMetricSelection(challengeForm.value.recordMetrics)
        },
        challengePublish: {
          tasksPerWeek: Number(challengeForm.value.tasksPerWeek ?? 3),
          publishLeadHours: Number(challengeForm.value.publishLeadHours ?? 24),
          aiDraftEnabled: true,
          requiresManagerPublish: true
        },
        recognition: {
          additionalMetrics: String(challengeForm.value.additionalMetricsText || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        }
      }
    };
    if (editingChallenge.value) {
      await api.put(`/learning-program-classes/${editingChallenge.value.id}`, payload);
    } else {
      await api.post('/learning-program-classes', { organizationId: organizationId.value, ...payload });
    }
    closeChallengeModal();
    await loadChallenges();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save season';
  } finally {
    saving.value = false;
  }
};

const openManageModal = async (c) => {
  managingChallenge.value = c;
  manageTab.value = 'teams';
  showManageModal.value = true;
  await Promise.all([loadTeams(c.id), loadProviderMembers(c.id), loadOrgUsers()]);
  await loadSnakeDraftBoard();
};

const launchChallenge = async (c) => {
  if (!c?.id) return;
  launching.value = true;
  try {
    await api.post(`/learning-program-classes/${c.id}/launch`);
    await loadChallenges();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to launch';
  } finally {
    launching.value = false;
  }
};

const closeSeason = async (c) => {
  if (!c?.id) return;
  if (!confirm(`Close "${c.class_name || c.className}"?\n\nMembers will no longer be able to post workouts once closed.`)) return;
  launching.value = true;
  try {
    await api.put(`/learning-program-classes/${c.id}`, { status: 'closed' });
    await loadChallenges();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to close season';
  } finally {
    launching.value = false;
  }
};

const loadParticipantProfiles = async () => {
  const id = managingChallenge.value?.id;
  if (!id) return;
  participantProfilesLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/participant-profiles`);
    participantProfiles.value = Array.isArray(r.data?.profiles) ? r.data.profiles : [];
    const map = {};
    for (const p of participantProfiles.value) {
      map[p.provider_user_id] = { gender: p.gender || '', dateOfBirth: p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '' };
    }
    for (const m of providerMembers.value || []) {
      if (!map[m.provider_user_id]) map[m.provider_user_id] = { gender: '', dateOfBirth: '' };
    }
    profileEdits.value = map;
    await loadProfileCompleteness();
  } catch {
    participantProfiles.value = [];
    profileEdits.value = {};
  } finally {
    participantProfilesLoading.value = false;
  }
};

const loadProfileCompleteness = async () => {
  const id = managingChallenge.value?.id;
  if (!id) return;
  profileCompletenessLoading.value = true;
  try {
    const r = await api.get(`/learning-program-classes/${id}/profile-completeness`);
    profileCompletenessMissing.value = Array.isArray(r.data?.missingParticipants) ? r.data.missingParticipants : [];
  } catch {
    profileCompletenessMissing.value = [];
  } finally {
    profileCompletenessLoading.value = false;
  }
};

const saveProfile = async (m) => {
  const id = managingChallenge.value?.id;
  if (!id || !m?.provider_user_id) return;
  const edit = profileEdits.value[m.provider_user_id];
  if (!edit) return;
  try {
    await api.put(`/learning-program-classes/${id}/participant-profiles/${m.provider_user_id}`, {
      gender: edit.gender || null,
      dateOfBirth: edit.dateOfBirth || null
    });
    await loadParticipantProfiles();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save profile';
  }
};

const closeManageModal = () => {
  showManageModal.value = false;
  managingChallenge.value = null;
  teams.value = [];
  providerMembers.value = [];
};

const loadTeams = async (classId) => {
  if (!classId) return;
  try {
    const r = await api.get(`/learning-program-classes/${classId}/teams`);
    teams.value = Array.isArray(r.data?.teams) ? r.data.teams : [];
  } catch {
    teams.value = [];
  }
};

const loadProviderMembers = async (classId) => {
  if (!classId) return;
  try {
    const r = await api.get(`/learning-program-classes/${classId}`);
    providerMembers.value = Array.isArray(r.data?.providerMembers) ? r.data.providerMembers : [];
  } catch {
    providerMembers.value = [];
  }
};

const loadOrgUsers = async () => {
  if (!organizationId.value) return;
  try {
    const r = await api.get(`/agencies/${organizationId.value}/users`);
    orgUsers.value = Array.isArray(r.data) ? r.data : [];
  } catch {
    orgUsers.value = [];
  }
};

const loadWeeklyTasks = async () => {
  if (!managingChallenge.value?.id) return;
  try {
    const [tasksRes, assignRes] = await Promise.all([
      api.get(`/learning-program-classes/${managingChallenge.value.id}/weekly-tasks`, { params: { week: weeklyTasksWeek.value } }),
      api.get(`/learning-program-classes/${managingChallenge.value.id}/weekly-assignments`, { params: { week: weeklyTasksWeek.value } })
    ]);
    const tasks = Array.isArray(tasksRes.data?.tasks) ? tasksRes.data.tasks : [];
    const toTaskForm = (task) => {
      let crit = defaultCriteria();
      if (task?.criteria_json) {
        const raw = typeof task.criteria_json === 'string' ? JSON.parse(task.criteria_json) : task.criteria_json;
        crit = { ...crit, ...raw };
        if (!crit.timeOfDay) crit.timeOfDay = { start: '', end: '' };
        if (!crit.distance) crit.distance = { minMiles: null };
        if (!crit.duration) crit.duration = { minMinutes: null };
        if (!crit.pace) crit.pace = { maxSecondsPerMile: null };
        if (!crit.splitRuns) crit.splitRuns = { count: 2, minSeparationMinutes: 60 };
        crit._splitRunEnabled = !!(crit.splitRuns?.count && crit.splitRuns.count > 1);
      }
      return {
        name: task?.name || '',
        description: task?.description || '',
        proofPolicy: task?.proof_policy || 'none',
        mode: task?.mode || 'volunteer_or_elect',
        confidenceScore: task?.confidence_score ?? null,
        isSeasonLong: !!task?.is_season_long,
        criteriaJson: crit
      };
    };
    weeklyTasksForm.value = [
      toTaskForm(tasks[0]),
      toTaskForm(tasks[1]),
      toTaskForm(tasks[2])
    ];
    weeklyAssignments.value = Array.isArray(assignRes.data?.assignments) ? assignRes.data.assignments : [];
    weeklyTasksWithIds.value = tasks;
    for (const team of teams.value) {
      if (team.id && !teamMembersCache.value[team.id]) {
        try {
          const mRes = await api.get(`/learning-program-classes/${managingChallenge.value.id}/teams/${team.id}/members`);
          teamMembersCache.value = { ...teamMembersCache.value, [team.id]: Array.isArray(mRes.data?.members) ? mRes.data.members : [] };
        } catch {
          teamMembersCache.value = { ...teamMembersCache.value, [team.id]: [] };
        }
      }
    }
    await loadNoShowAlerts();
  } catch {
    weeklyTasksForm.value = [defaultTask(), defaultTask(), defaultTask()];
    weeklyAssignments.value = [];
  }
};

const loadSnakeDraftBoard = async () => {
  if (!managingChallenge.value?.id) return;
  try {
    const r = await api.get(`/learning-program-classes/${managingChallenge.value.id}/snake-draft-board`, { params: { rounds: 3 } });
    snakeDraftPicks.value = Array.isArray(r.data?.picks) ? r.data.picks : [];
  } catch {
    snakeDraftPicks.value = [];
  }
};

const loadNoShowAlerts = async () => {
  if (!managingChallenge.value?.id) return;
  try {
    const r = await api.get(`/learning-program-classes/${managingChallenge.value.id}/no-show-risk-alerts`, { params: { weekStart: weeklyTasksWeek.value } });
    noShowAlerts.value = Array.isArray(r.data?.alerts) ? r.data.alerts : [];
  } catch {
    noShowAlerts.value = [];
  }
};

const getTeamMembers = (teamId) => teamMembersCache.value[teamId] || [];

const getAssignmentFor = (taskId, teamId) =>
  weeklyAssignments.value.find((a) => Number(a.task_id) === Number(taskId) && Number(a.team_id) === Number(teamId));

const updateAssignment = async (taskId, teamId, providerUserId) => {
  if (!managingChallenge.value?.id || !providerUserId) return;
  try {
    await api.post(`/learning-program-classes/${managingChallenge.value.id}/weekly-assignments`, {
      taskId,
      teamId,
      providerUserId,
      volunteered: false
    });
    await loadWeeklyTasks();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update assignment');
  }
};

const setAssignmentCompletion = async (assignment, isCompleted) => {
  if (!managingChallenge.value?.id || !assignment?.id) return;
  try {
    await api.put(`/learning-program-classes/${managingChallenge.value.id}/weekly-assignments/${assignment.id}/completion`, {
      isCompleted
    });
    await loadWeeklyTasks();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update assignment completion');
  }
};

const saveWeeklyTasks = async () => {
  if (!managingChallenge.value?.id) return;
  weeklyTasksSaving.value = true;
  try {
    await api.post(`/learning-program-classes/${managingChallenge.value.id}/weekly-tasks`, {
      week: weeklyTasksWeek.value,
      tasks: weeklyTasksForm.value
        .filter((t) => t.name?.trim())
        .map((t) => ({
          name: t.name,
          description: t.description || null,
          proofPolicy: t.proofPolicy || 'none',
          mode: t.mode || 'volunteer_or_elect',
          isSeasonLong: t.isSeasonLong || false,
          criteriaJson: buildCriteriaPayload(t.criteriaJson)
        }))
    });
    await loadWeeklyTasks();
    await loadNoShowAlerts();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save weekly tasks');
  } finally {
    weeklyTasksSaving.value = false;
  }
};

const generateWeeklyAiDraft = async () => {
  if (!managingChallenge.value?.id) return;
  weeklyAiDraftLoading.value = true;
  try {
    const r = await api.post(`/learning-program-classes/${managingChallenge.value.id}/weekly-tasks/ai-draft`, {
      week: weeklyTasksWeek.value
    });
    const tasks = Array.isArray(r.data?.tasks) ? r.data.tasks : [];
    const toAiTask = (t) => {
      const crit = { ...defaultCriteria(), ...(t?.criteriaJson || {}) };
      if (!crit.timeOfDay) crit.timeOfDay = { start: '', end: '' };
      if (!crit.distance) crit.distance = { minMiles: null };
      if (!crit.duration) crit.duration = { minMinutes: null };
      if (!crit.pace) crit.pace = { maxSecondsPerMile: null };
      if (!crit.splitRuns) crit.splitRuns = { count: 2, minSeparationMinutes: 60 };
      crit._splitRunEnabled = !!(crit.splitRuns?.count && crit.splitRuns.count > 1);
      return { name: t?.name || '', description: t?.description || '', proofPolicy: t?.proofPolicy || 'none', mode: t?.mode || 'volunteer_or_elect', confidenceScore: t?.confidenceScore ?? null, isSeasonLong: false, criteriaJson: crit };
    };
    weeklyTasksForm.value = [toAiTask(tasks[0]), toAiTask(tasks[1]), toAiTask(tasks[2])];
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to generate weekly AI draft');
  } finally {
    weeklyAiDraftLoading.value = false;
  }
};

const publishWeeklyDraft = async () => {
  if (!managingChallenge.value?.id) return;
  weeklyPublishSaving.value = true;
  try {
    await api.post(`/learning-program-classes/${managingChallenge.value.id}/weekly-tasks/publish`, {
      week: weeklyTasksWeek.value,
      tasks: weeklyTasksForm.value
        .filter((t) => t.name?.trim())
        .map((t) => ({
          name: t.name,
          description: t.description || null,
          proofPolicy: t.proofPolicy || 'none',
          mode: t.mode || 'volunteer_or_elect',
          isSeasonLong: t.isSeasonLong || false,
          criteriaJson: buildCriteriaPayload(t.criteriaJson)
        }))
    });
    await loadWeeklyTasks();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to publish weekly challenges');
  } finally {
    weeklyPublishSaving.value = false;
  }
};

const closeWeek = async () => {
  if (!managingChallenge.value?.id) return;
  if (!confirm('Close this week? This will post the scoreboard and run elimination. Eliminated users will lose access.')) return;
  closeWeekSaving.value = true;
  try {
    await api.post(`/learning-program-classes/${managingChallenge.value.id}/close-week`, {
      week: weeklyTasksWeek.value
    });
    alert('Week closed. Scoreboard posted.');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to close week');
  } finally {
    closeWeekSaving.value = false;
  }
};

const openAddTeamModal = () => {
  editingTeam.value = null;
  teamForm.value = { teamName: '', teamManagerUserId: '' };
  showTeamModal.value = true;
};

const openEditTeamModal = (t) => {
  editingTeam.value = t;
  teamForm.value = {
    teamName: t.team_name || '',
    teamManagerUserId: t.team_manager_user_id ? String(t.team_manager_user_id) : ''
  };
  showTeamModal.value = true;
};

const closeTeamModal = () => {
  showTeamModal.value = false;
  editingTeam.value = null;
};

const saveTeam = async () => {
  const classId = managingChallenge.value?.id;
  if (!classId) return;
  const name = String(teamForm.value.teamName || '').trim();
  if (!name) return;
  teamSaving.value = true;
  try {
    if (editingTeam.value) {
      await api.put(`/learning-program-classes/${classId}/teams/${editingTeam.value.id}`, {
        teamName: name,
        teamManagerUserId: teamForm.value.teamManagerUserId ? Number(teamForm.value.teamManagerUserId) : null
      });
    } else {
      await api.post(`/learning-program-classes/${classId}/teams`, {
        teamName: name,
        teamManagerUserId: teamForm.value.teamManagerUserId ? Number(teamForm.value.teamManagerUserId) : null
      });
    }
    closeTeamModal();
    await loadTeams(classId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save team';
  } finally {
    teamSaving.value = false;
  }
};

const removeTeam = async (t) => {
  if (!confirm(`Remove team "${t.team_name}"?`)) return;
  const classId = managingChallenge.value?.id;
  if (!classId) return;
  try {
    await api.delete(`/learning-program-classes/${classId}/teams/${t.id}`);
    await loadTeams(classId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to remove team';
  }
};

const openAddMemberModal = () => {
  memberForm.value = { providerUserId: '' };
  showMemberModal.value = true;
};

const closeMemberModal = () => {
  showMemberModal.value = false;
};

const addMember = async () => {
  const classId = managingChallenge.value?.id;
  const userId = Number(memberForm.value.providerUserId);
  if (!classId || !userId) return;
  memberSaving.value = true;
  try {
    await api.put(`/learning-program-classes/${classId}/providers`, {
      members: [{ providerUserId: userId, membershipStatus: 'active' }]
    });
    closeMemberModal();
    await loadProviderMembers(classId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to add participant';
  } finally {
    memberSaving.value = false;
  }
};

const duplicateChallenge = async (c) => {
  if (!confirm(`Duplicate "${c.class_name || c.className}"? A new draft season will be created.`)) return;
  try {
    await api.post(`/learning-program-classes/${c.id}/duplicate`, { copyMembers: false });
    await loadChallenges();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to duplicate season';
  }
};

const removeMember = async (m) => {
  if (!confirm(`Remove ${memberDisplayName(m)} from this season?`)) return;
  const classId = managingChallenge.value?.id;
  if (!classId) return;
  try {
    await api.put(`/learning-program-classes/${classId}/providers`, {
      members: [{ providerUserId: m.provider_user_id, membershipStatus: 'removed' }]
    });
    await loadProviderMembers(classId);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to remove participant';
  }
};

const loadCustomFields = async () => {
  if (!organizationId.value) return;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${organizationId.value}/custom-fields`, { skipGlobalLoading: true, skipAuthRedirect: true });
    challengeCustomFields.value = Array.isArray(data?.fields) ? data.fields : [];
  } catch {
    challengeCustomFields.value = [];
  }
};

// ── Recognition library helpers ───────────────────────────
const saveAwardToLibrary = async (award) => {
  if (!organizationId.value) return;
  try {
    const payload = {
      label: award.label,
      icon: award.icon || '🏆',
      period: award.period || 'weekly',
      metric: award.metric || 'distance_miles',
      aggregation: award.aggregation || 'most',
      activityType: award.activityType || '',
      groupFilter: award.groupFilter || '',
      genderVariants: award.genderVariants || []
    };
    await api.post(`/summit-stats/clubs/${organizationId.value}/recognition-awards`, payload);
    // Refresh the library list shown in the manager panel
    libraryManagerRef.value?.loadAwards?.();
  } catch {
    // non-critical, fail silently
  }
};

// ── Photo moderation ──────────────────────────────────────
const flaggedPhotos = ref([]);
const flaggedLoading = ref(false);
const flaggedError = ref('');

const loadFlaggedPhotos = async () => {
  if (!organizationId.value) return;
  flaggedLoading.value = true;
  flaggedError.value = '';
  try {
    const { data } = await api.get('/users/photos/flagged', { params: { agencyId: organizationId.value } });
    flaggedPhotos.value = data.flagged || [];
  } catch (e) {
    flaggedError.value = e.response?.data?.error?.message || 'Failed to load flagged photos';
  } finally {
    flaggedLoading.value = false;
  }
};

const moderateRemove = async (photo) => {
  if (!confirm(`Remove this photo from ${photo.userFirstName} ${photo.userLastName}?`)) return;
  try {
    await api.delete(`/users/${photo.userId}/photos/${photo.id}/moderate`);
    flaggedPhotos.value = flaggedPhotos.value.filter((p) => p.id !== photo.id);
  } catch (e) {
    flaggedError.value = e.response?.data?.error?.message || 'Failed to remove photo';
  }
};

const unflagPhoto = async (photo) => {
  try {
    await api.delete(`/users/${photo.userId}/photos/${photo.id}/flag`);
    flaggedPhotos.value = flaggedPhotos.value.filter((p) => p.id !== photo.id);
  } catch (e) {
    flaggedError.value = e.response?.data?.error?.message || 'Failed to unflag photo';
  }
};

watch(organizationId, () => {
  if (organizationId.value) { loadChallenges(); loadCustomFields(); loadFlaggedPhotos(); }
  else { challenges.value = []; challengeCustomFields.value = []; flaggedPhotos.value = []; }
});

onMounted(() => {
  if (organizationId.value) { loadChallenges(); loadCustomFields(); loadFlaggedPhotos(); }
});
</script>

<style scoped>
.challenge-management {
  padding: 0;
}
.page-header {
  margin-bottom: 20px;
}
.page-header h1 {
  margin: 0 0 4px 0;
  font-size: 1.4em;
}
.page-description {
  margin: 0;
  color: var(--text-muted, #666);
  font-size: 0.95em;
}
.controls {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.challenge-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.challenge-card {
  padding: 16px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  background: var(--bg, #fff);
}
.challenge-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.challenge-card-header h3 {
  margin: 0 8px 0 0;
  font-size: 1.1em;
}
.challenge-status {
  font-size: 0.8em;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}
.challenge-status.status-active {
  background: #e8f5e9;
  color: #2e7d32;
}
.challenge-status.status-expired {
  background: #fff7ed;
  color: #b45309;
}
.challenge-status.status-closed {
  background: #f5f5f5;
  color: #666;
}
.challenge-actions {
  display: flex;
  gap: 8px;
}
.challenge-description {
  margin: 8px 0;
  font-size: 0.95em;
  color: var(--text-muted, #666);
}
.challenge-meta {
  font-size: 0.85em;
  color: var(--text-muted, #666);
}
.team-list,
.member-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.team-item,
.member-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color, #eee);
}
.team-lead,
.member-status {
  font-size: 0.9em;
  color: var(--text-muted, #666);
}
.manage-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tab-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color, #ddd);
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}
.tab-btn.active {
  background: var(--primary, #0066cc);
  color: #fff;
  border-color: var(--primary, #0066cc);
}
.manage-panel {
  padding: 12px 0;
}
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
}
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: normal;
  cursor: pointer;
}
.profiles-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.profile-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.profile-row span:first-child {
  min-width: 140px;
}
.profile-row select {
  width: 140px;
  padding: 6px 10px;
}
.profile-row input[type="date"] {
  width: 140px;
  padding: 6px 10px;
}
.panel-actions {
  margin-bottom: 12px;
}
.empty-hint {
  padding: 12px;
  color: var(--text-muted, #666);
  font-size: 0.95em;
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
.modal-content {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  max-width: 480px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}
.modal-wide {
  max-width: 560px;
}
.form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.form-row .form-group {
  flex: 1;
  min-width: 140px;
}
.form-group {
  margin-bottom: 16px;
}
.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}
.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-muted, #666);
  font-size: 0.85em;
}

/* ── Weekly goal redesign ── */
.label-sub {
  font-weight: 400;
  font-size: 12px;
  color: var(--text-muted, #888);
}
.input-unit-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.input-unit-row input {
  flex: 1;
  min-width: 0;
}
.unit-badge {
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #555);
  background: var(--surface-2, #f1f5f9);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 5px;
  padding: 4px 8px;
}
.goal-miles-block {
  margin-top: 10px;
}

/* Progression preview table */
.goal-progression-preview {
  margin-top: 14px;
  background: var(--surface-2, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 12px 14px;
  max-width: 480px;
}
.gpp-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}
.gpp-title {
  font-weight: 700;
  font-size: 13px;
}
.gpp-sub {
  font-size: 12px;
  color: var(--text-muted, #888);
}
.gpp-table-wrap {
  overflow-x: auto;
}
.gpp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.gpp-table th {
  text-align: left;
  padding: 4px 10px 6px;
  font-weight: 600;
  border-bottom: 1px solid var(--border, #e2e8f0);
  color: var(--text-secondary, #555);
}
.gpp-table td {
  padding: 5px 10px;
  border-bottom: 1px solid var(--border-subtle, #f0f4f8);
}
.gpp-table tr:last-child td {
  border-bottom: none;
}
.gpp-total {
  font-weight: 700;
  color: var(--primary, #1d4ed8);
}
.gpp-note {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--text-muted, #888);
  line-height: 1.4;
}
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
.weekly-tasks-form {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.weekly-task-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 16px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.weekly-task-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.task-num {
  font-size: 0.95em;
  color: #1e293b;
}
.task-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.task-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9em;
}
.season-long-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82em;
  cursor: pointer;
  color: #475569;
}
.btn-xs {
  font-size: 0.78em;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid #cbd5e1;
  background: transparent;
  color: #475569;
}
.btn-xs:hover { background: #f1f5f9; }
.btn-ghost {
  background: transparent;
  border: 1px solid #e2e8f0;
  color: #64748b;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82em;
  padding: 3px 8px;
}
.btn-ghost:hover { background: #f8fafc; }
/* Criteria builder */
.criteria-builder {
  background: #f0f7ff;
  border: 1px solid #bae0fd;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}
.criteria-section-title {
  font-size: 0.8em;
  font-weight: 600;
  color: #0369a1;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 2px;
}
.criteria-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.criteria-row label {
  font-size: 0.82em;
  font-weight: 500;
  color: #475569;
}
.criteria-row input,
.criteria-row select {
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.85em;
  max-width: 260px;
}
.criteria-pair {
  display: flex;
  align-items: center;
  gap: 6px;
}
.criteria-pair input { max-width: 130px; }
.multi-check-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.multi-check-row label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.82em;
  font-weight: 400;
  cursor: pointer;
  padding: 3px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.multi-check-row label:has(input:checked) {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}
.criteria-sub {
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.criteria-sub label {
  font-size: 0.82em;
  color: #475569;
}
.criteria-sub input {
  padding: 6px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  max-width: 120px;
}
/* Library picker */
.library-picker-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  margin-bottom: 12px;
}
.library-picker-label {
  font-size: 0.85em;
  font-weight: 600;
  color: #92400e;
}
.library-picker-select {
  padding: 5px 8px;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  font-size: 0.85em;
  background: #fff;
}
.weekly-assignments {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color, #eee);
}
.weekly-assignments h4 {
  margin: 0 0 8px 0;
  font-size: 1em;
}
.weekly-assignments .hint {
  margin-bottom: 12px;
}
.assignment-group {
  margin-bottom: 16px;
}
.assignment-group strong {
  display: block;
  margin-bottom: 8px;
}
.assignment-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.assignment-row span:first-child {
  min-width: 120px;
}
.assignment-row select {
  min-width: 180px;
  padding: 6px 10px;
}
.badge-done {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.85em;
}

.participation-agreement-block {
  padding: 14px;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  background: #f8fafc;
}

.inline-action-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.inline-action-row select {
  flex: 1;
}

/* Photo moderation */
.flagged-photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}
.flagged-photo-card {
  border: 2px solid #e63946;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.flagged-photo-img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
}
.flagged-photo-meta {
  padding: 10px;
}
.flagged-user {
  font-weight: 600;
  font-size: 0.9em;
  margin-bottom: 4px;
}
.flagged-reason {
  font-size: 0.8em;
  color: #666;
  margin-bottom: 8px;
}
.flagged-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
