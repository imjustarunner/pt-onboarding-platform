<template>
  <div class="challenge-management">
    <div class="challenge-management-inner">
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1>Season Management</h1>
          <p class="page-description">
            A <strong>season</strong> is the whole competition period (dates, teams, scoring, participants).
            <strong>Weekly challenges</strong> are the tasks published each week — set those in <strong>Manage → Weekly challenges</strong> after you create a season.
          </p>
        </div>
        <div v-if="clubSwitcherOptions.length > 1" class="club-switcher-inline">
          <label for="season-club-switcher">Club</label>
          <select
            id="season-club-switcher"
            class="input club-switcher-select"
            :value="String(organizationId || '')"
            @change="onSeasonClubSwitch($event)"
          >
            <option v-for="opt in clubSwitcherOptions" :key="opt.id" :value="String(opt.id)">{{ opt.name }}</option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="seasonsContextLoading" class="loading">Loading club context…</div>
    <div v-else-if="seasonOrgScopeError" class="error season-scope-error">{{ seasonOrgScopeError }}</div>

    <div v-else-if="!organizationId" class="empty-state">
      <p>Select your club from the organization menu in the header, or open <router-link :to="clubSettingsLink">Club settings</router-link> to confirm your membership.</p>
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
              <router-link :to="challengeDashboardLink(c)" class="btn btn-secondary btn-sm">Open Season</router-link>
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
    <div v-if="showChallengeModal" class="modal-overlay" @click.self="closeChallengeModal()">
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
          <div v-if="!editingChallenge" class="form-group participation-agreement-block">
            <label style="font-weight:700;">Season Billing (Coming soon)</label>
            <p class="hint" style="margin: 6px 0 12px 0;">
              Billing is scaffolded for future Stripe support and is disabled by default. New seasons can be pre-configured now.
            </p>
            <div class="form-row">
              <div class="form-group">
                <label>Enable season billing</label>
                <select v-model="challengeForm.billingEnabled">
                  <option :value="false">Disabled (default)</option>
                  <option :value="true">Enabled (future activation)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Charge target</label>
                <select v-model="challengeForm.billingChargeTarget" :disabled="!challengeForm.billingEnabled">
                  <option value="member">Each participating member</option>
                  <option value="club">Bill club (future)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Member charge (USD per season)</label>
                <input
                  v-model.number="challengeForm.billingMemberAmountDollars"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g., 25.00"
                  :disabled="!challengeForm.billingEnabled || challengeForm.billingChargeTarget !== 'member'"
                />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Currency</label>
                <input v-model="challengeForm.billingCurrency" type="text" maxlength="3" :disabled="!challengeForm.billingEnabled" />
              </div>
              <div class="form-group">
                <label>Stripe Price ID (placeholder)</label>
                <input v-model="challengeForm.billingStripePriceId" type="text" placeholder="price_..." :disabled="!challengeForm.billingEnabled" />
              </div>
              <div class="form-group">
                <label>Stripe Product ID (placeholder)</label>
                <input v-model="challengeForm.billingStripeProductId" type="text" placeholder="prod_..." :disabled="!challengeForm.billingEnabled" />
              </div>
            </div>
            <small>
              No charges are executed yet. When enabled in a future release, members will be prompted during in-app season join.
            </small>
          </div>
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
            <label>Allowed activity types</label>
            <div class="activity-type-checkboxes">
              <label v-for="opt in ACTIVITY_TYPE_OPTIONS" :key="opt.value" class="activity-type-check">
                <input
                  type="checkbox"
                  :value="opt.value"
                  :checked="challengeForm.activityTypesText.split(',').map(s => s.trim()).filter(Boolean).includes(opt.value)"
                  @change="toggleActivityType(opt.value, $event.target.checked)"
                />
                {{ opt.label }}
              </label>
            </div>
            <small>Leave all unchecked to allow any activity type.</small>
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
                <label>Default weekly challenge style</label>
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
                <label>Weekly challenges count</label>
                <input v-model.number="challengeForm.tasksPerWeek" type="number" min="1" max="7" />
              </div>
              <div class="form-group">
                <label>Publish lead hours</label>
                <input v-model.number="challengeForm.publishLeadHours" type="number" min="0" />
              </div>
              <div class="form-group">
                <label>Week ends {{ weekEndDayName }} at {{ weekDeadlineTimeDisplay }} <span class="hint-inline">(one minute before next week starts)</span></label>
                <input v-model="challengeForm.weekEndsSundayAt" type="time" />
                <span class="field-hint">Set the time the new week begins each {{ weekEndDayName }}. The deadline to log workouts is one minute before.</span>
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
            <div v-if="challengeForm.eventCategory === 'run_ruck'" class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
              <div class="form-group">
                <label>Scoring metric</label>
                <select v-model="challengeForm.runRuckScoringMetric">
                  <option value="distance">Distance (miles per point)</option>
                  <option value="calories">Calories (calories per point)</option>
                </select>
              </div>
            </div>
            <div class="form-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="form-group" v-if="challengeForm.eventCategory === 'run_ruck' && challengeForm.runRuckScoringMetric !== 'calories'">
                <label>Run miles per point</label>
                <input v-model.number="challengeForm.runMilesPerPoint" type="number" min="0.1" step="0.1" />
              </div>
              <div class="form-group" v-if="challengeForm.eventCategory === 'run_ruck' && challengeForm.runRuckScoringMetric !== 'calories'">
                <label>Ruck miles per point</label>
                <input v-model.number="challengeForm.ruckMilesPerPoint" type="number" min="0.1" step="0.1" />
              </div>
              <div class="form-group" v-if="challengeForm.eventCategory === 'fitness' || challengeForm.runRuckScoringMetric === 'calories'">
                <label>Calories per point</label>
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
            <p class="help-text" style="margin-top: 6px; font-size: 12px; color: #64748b; max-width: 42rem;">
              Save the season, then open <strong>Manage → Teams</strong> and click <strong>"+ Create these teams"</strong> to instantly create all of them in one click. You can also add teams individually with Add Team.
            </p>
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
                <label>Same-day workout rule</label>
                <select v-model="challengeForm.sameDayOnly">
                  <option :value="true">Same day only — workouts must be logged the day they're completed</option>
                  <option :value="false">Allow any date — members can log workouts for any date</option>
                </select>
                <small>When enabled (recommended), members cannot backdate or future-date workouts. This applies to both manual entries and Strava imports.</small>
              </div>
              <div class="form-group">
                <label>Daily workout submission deadline</label>
                <input type="time" v-model="challengeForm.dailyDeadlineTime" step="60" />
                <small>Time of day by which workouts must be submitted (in the season's timezone). Default is 11:59 PM. On the week reset day, the weekly cutoff time applies instead.</small>
              </div>
              <div class="form-group">
                <label>Allow auto-import</label>
                <select v-model="challengeForm.autoImportEnabled">
                  <option :value="false">Disabled — members import workouts manually</option>
                  <option :value="true">Enabled — members can set up automatic workout import</option>
                </select>
                <small>When enabled, members can configure their Strava (or Garmin when available) account to automatically push workouts into the season. Members must select which activity types are auto-imported. Treadmill runs always import as a draft pending photo proof.</small>
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
              <div v-if="challengeForm.treadmillpocalypseEnabled" class="form-group">
                <label>Treadmillpocalypse icon</label>
                <IconSelector
                  v-model="challengeForm.treadmillpocalypseIconId"
                  :summitStatsClubId="managingChallenge?.organization_id || editingChallenge?.organization_id"
                  :context="`treadmillpocalypse-${managingChallenge?.organization_id || editingChallenge?.organization_id}`"
                />
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
          <!-- Season Branding: Banner + Logo -->
          <div class="form-section season-branding-section">
            <h4 class="form-section-title">Season Branding</h4>
            <div class="branding-row">
              <!-- Banner -->
              <div class="branding-field branding-field--banner">
                <label class="branding-label">Banner Image</label>
                <p class="branding-hint">Recommended: 1200 × 400 px. After uploading, drag the crosshair to set the focal point.</p>
                <div
                  v-if="editBannerPreview || editingChallenge?.banner_image_path || editingChallenge?.bannerImagePath"
                  class="banner-preview-wrap"
                  @click="onBannerFocalClick"
                  title="Click to set focal point"
                >
                  <img
                    :src="editBannerPreview || resolveUploadUrl(editingChallenge?.banner_image_path || editingChallenge?.bannerImagePath, { classId: editingChallenge?.id, type: 'banner', version: editingChallenge?.updated_at })"
                    class="banner-preview-img"
                    :style="{ objectPosition: `${editBannerFocalX}% ${editBannerFocalY}%` }"
                    draggable="false"
                    ref="bannerPreviewImgRef"
                  />
                  <div
                    class="banner-focal-dot"
                    :style="{ left: editBannerFocalX + '%', top: editBannerFocalY + '%' }"
                  />
                  <span class="banner-focal-hint">Click to move focal point</span>
                </div>
                <div class="branding-upload-row">
                  <label class="btn btn-secondary btn-sm branding-upload-btn">
                    {{ editBannerPreview || editingChallenge?.banner_image_path || editingChallenge?.bannerImagePath ? 'Replace Banner' : 'Upload Banner' }}
                    <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none" @change="onEditBannerChange" />
                  </label>
                  <button
                    v-if="editBannerPreview || editingChallenge?.banner_image_path || editingChallenge?.bannerImagePath"
                    type="button"
                    class="btn btn-danger btn-sm"
                    @click="removeEditBanner"
                  >Remove</button>
                </div>
              </div>
              <!-- Logo/Icon -->
              <div class="branding-field branding-field--logo">
                <label class="branding-label">Season Logo / Icon</label>
                <p class="branding-hint">Recommended: 256 × 256 px square, PNG with transparency.</p>
                <div v-if="editLogoPreview || editingChallenge?.logo_image_path || editingChallenge?.logoImagePath" class="logo-preview-wrap">
                  <img
                    :src="editLogoPreview || resolveUploadUrl(editingChallenge?.logo_image_path || editingChallenge?.logoImagePath, { classId: editingChallenge?.id, type: 'logo', version: editingChallenge?.updated_at })"
                    class="logo-preview-img"
                  />
                </div>
                <div class="branding-upload-row">
                  <label class="btn btn-secondary btn-sm branding-upload-btn">
                    {{ editLogoPreview || editingChallenge?.logo_image_path || editingChallenge?.logoImagePath ? 'Replace Logo' : 'Upload Logo' }}
                    <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none" @change="onEditLogoChange" />
                  </label>
                  <button
                    v-if="editLogoPreview || editingChallenge?.logo_image_path || editingChallenge?.logoImagePath"
                    type="button"
                    class="btn btn-danger btn-sm"
                    @click="removeEditLogo"
                  >Remove</button>
                </div>
              </div>
            </div>
          </div>
          <div class="form-actions">
                <button type="button" class="btn btn-secondary" @click="closeChallengeModal()">Cancel</button>
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
          <button type="button" :class="['tab-btn', { active: manageTab === 'branding' }]" @click="manageTab = 'branding'; initManageBranding()">Branding</button>
          <button type="button" class="tab-btn tab-btn--edit" @click="editFromManageModal">✏ Edit Season</button>
        </div>

        <div v-show="manageTab === 'teams'" class="manage-panel">
          <div class="planned-roster-card">
            <h4 class="planned-roster-title">Planned team size (weekly distance bar)</h4>
            <p class="hint planned-roster-hint">
              Used to compute each team’s weekly mileage target: <strong>per-person minimum × this number</strong>.
              It stays fixed even if someone leaves the team, so the club can plan coverage.
            </p>
            <div class="planned-roster-row">
              <label for="manage-members-per-team">Members per team</label>
              <input
                id="manage-members-per-team"
                v-model.number="manageTeamsMembersPerTeam"
                type="number"
                min="1"
                max="99"
                step="1"
                class="input planned-roster-input"
              />
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="!managingChallenge || manageTeamsMembersPerTeamSaving || !Number.isFinite(manageTeamsMembersPerTeam) || manageTeamsMembersPerTeam < 1"
                @click="saveManageTeamsMembersPerTeam"
              >
                {{ manageTeamsMembersPerTeamSaving ? 'Saving…' : 'Save' }}
              </button>
            </div>
            <p v-if="manageTeamsMembersPerTeamMsg" class="planned-roster-msg">{{ manageTeamsMembersPerTeamMsg }}</p>
          </div>

          <div
            v-if="managingChallenge && manageTeamsIsMilesGoal && manageTeamsWeekRows.length"
            class="weekly-team-targets-card"
          >
            <h4 class="weekly-team-targets-title">Weekly team targets (mi)</h4>
            <p class="hint weekly-team-targets-hint">
              Rows use the same week boundaries as the season dashboard (schedule cutoff &amp; timezone).
              Default = per-person minimum × <strong>members per team</strong> above. Edit to override; Reset clears the override.
            </p>
            <div class="wtt-table-wrap">
              <table class="wtt-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Basis</th>
                    <th>Team target (mi)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in manageTeamsWeekRows" :key="row.weekStart">
                    <td class="wtt-week">{{ row.label }}</td>
                    <td class="wtt-basis">
                      <template v-if="row.perPerson != null">
                        {{ Number(row.perPerson).toFixed(1) }} mi × {{ row.roster }}
                      </template>
                      <template v-else>—</template>
                    </td>
                    <td class="wtt-target">
                      <template v-if="weeklyTargetEditingWeekStart === row.weekStart">
                        <input
                          v-model="weeklyTargetEditDraft"
                          type="number"
                          min="0"
                          step="0.01"
                          class="input wtt-input"
                          :disabled="weeklyTargetSaving"
                        />
                      </template>
                      <template v-else>
                        <span class="wtt-target-val">{{ row.active != null ? Number(row.active).toFixed(2) : '—' }}</span>
                        <span v-if="row.hasOverride" class="wtt-badge">Custom</span>
                      </template>
                    </td>
                    <td class="wtt-actions">
                      <template v-if="weeklyTargetEditingWeekStart === row.weekStart">
                        <button
                          type="button"
                          class="btn btn-primary btn-sm"
                          :disabled="weeklyTargetSaving"
                          @click="saveWeeklyTeamTarget"
                        >{{ weeklyTargetSaving ? 'Saving…' : 'Save' }}</button>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          :disabled="weeklyTargetSaving"
                          @click="cancelEditWeeklyTeamTarget"
                        >Cancel</button>
                      </template>
                      <template v-else>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          :disabled="weeklyTargetSaving || !!weeklyTargetEditingWeekStart"
                          @click="startEditWeeklyTeamTarget(row)"
                        >Edit</button>
                        <button
                          v-if="row.hasOverride"
                          type="button"
                          class="btn btn-link btn-sm"
                          :disabled="weeklyTargetSaving"
                          @click="resetWeeklyTeamTargetToAuto(row.weekStart)"
                        >Reset</button>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="weeklyTargetMsg" class="planned-roster-msg">{{ weeklyTargetMsg }}</p>
          </div>

          <div class="panel-actions">
            <button class="btn btn-primary btn-sm" @click="openAddTeamModal" :disabled="!managingChallenge">Add Team</button>
            <button class="btn btn-secondary btn-sm" :disabled="!managingChallenge" @click="loadSnakeDraftBoard">Preview Draft Order</button>
            <button v-if="teams.length > 1" class="btn btn-secondary btn-sm" @click="randomizeSnakeDraftBoard">🔀 Randomize Order</button>
          </div>

          <!-- Live Draft Room card -->
          <div v-if="managingChallenge && teams.length >= 2" class="draft-room-card">
            <div class="draft-room-card__header">
              <div class="draft-room-card__title-row">
                <span class="draft-room-card__icon">🏈</span>
                <div>
                  <div class="draft-room-card__title">Live Team Draft</div>
                  <div class="draft-room-card__sub">
                    <span v-if="!draftSessionStatus" class="drs-badge drs-badge--none">Not set up</span>
                    <span v-else-if="draftSessionStatus === 'pending'" class="drs-badge drs-badge--pending">Ready to start</span>
                    <span v-else-if="draftSessionStatus === 'in_progress'" class="drs-badge drs-badge--live">● Live now</span>
                    <span v-else-if="draftSessionStatus === 'completed'" class="drs-badge drs-badge--done">Completed</span>
                  </div>
                </div>
              </div>
              <button
                class="btn btn-primary btn-sm"
                @click="openDraftRoom"
                :disabled="!managingChallenge"
              >Open Draft Room →</button>
            </div>
            <p class="draft-room-card__hint">
              Set up team draft order, start a live draft session, and let captains pick their members in real time. Members and captains can watch the draft unfold live.
            </p>
          </div>

          <div v-if="snakeDraftPicks.length" class="mini-list">
            <h4>Draft Order Preview</h4>
            <p class="hint" style="margin: 0 0 8px;">{{ snakeDraftRandomized ? '🔀 Custom order saved — click Randomize Order again for a new shuffle.' : 'Alphabetical order — click Randomize Order to shuffle and save a custom pick order.' }}</p>
            <div v-for="pick in snakeDraftPicks" :key="`pick-${pick.pickNumber}`" class="mini-row">
              <span>Round {{ pick.round }} · Pick {{ pick.pickNumber }} · {{ pick.teamName }}</span>
            </div>
          </div>
          <!-- Create from preset names shortcut -->
          <div v-if="managingChallenge?.season_settings_json?.teams?.presetTeamNames?.length" class="preset-teams-bar">
            <span class="preset-teams-bar__label">
              Preset names: <em>{{ Array.isArray(managingChallenge.season_settings_json.teams.presetTeamNames) ? managingChallenge.season_settings_json.teams.presetTeamNames.join(', ') : managingChallenge.season_settings_json.teams.presetTeamNames }}</em>
            </span>
            <button class="btn btn-secondary btn-sm" :disabled="creatingPresetTeams" @click="createPresetTeams">
              {{ creatingPresetTeams ? 'Creating…' : '+ Create these teams' }}
            </button>
          </div>

          <div v-if="teams.length === 0" class="empty-hint">No teams yet. Add a team or use preset names above.</div>
          <ul v-else class="team-list">
            <li v-for="t in teams" :key="t.id" class="team-item">
              <span class="team-item-name">{{ t.team_name }}</span>
              <span v-if="teamLeadName(t)" class="team-lead">Captain: {{ teamLeadName(t) }}</span>
              <button class="btn btn-secondary btn-sm" @click="openEditTeamModal(t)">Change Name / Choose Captain</button>
              <button class="btn btn-danger btn-sm" @click="removeTeam(t)">Remove</button>
            </li>
          </ul>

          <!-- Captain Applications management -->
          <div class="captain-mgmt-section">
            <div class="captain-mgmt-header">
              <div class="captain-mgmt-title-row">
                <span class="captain-mgmt-title">Captain Applications</span>
                <span v-if="managingChallenge?.captains_finalized" class="cap-badge cap-badge--finalized">Finalized</span>
                <span v-else-if="managingChallenge?.captain_application_open" class="cap-badge cap-badge--open">Open</span>
                <span v-else class="cap-badge cap-badge--closed">Closed</span>
              </div>
              <div class="captain-mgmt-actions">
                <button
                  v-if="managingChallenge?.captains_finalized"
                  class="btn btn-secondary btn-sm"
                  :disabled="finalizingCaptains"
                  @click="unfinalizeCaptainsAction"
                >
                  {{ finalizingCaptains ? '…' : 'Unfinalize' }}
                </button>
                <button
                  v-if="!managingChallenge?.captains_finalized && !managingChallenge?.captain_application_open"
                  class="btn btn-primary btn-sm"
                  :disabled="togglingCaptainApps"
                  @click="toggleCaptainApplications(true)"
                >
                  {{ togglingCaptainApps ? '…' : 'Open Applications' }}
                </button>
                <button
                  v-if="!managingChallenge?.captains_finalized && managingChallenge?.captain_application_open"
                  class="btn btn-secondary btn-sm"
                  :disabled="togglingCaptainApps"
                  @click="toggleCaptainApplications(false)"
                >
                  {{ togglingCaptainApps ? '…' : 'Close Applications' }}
                </button>
                <button
                  v-if="!managingChallenge?.captains_finalized && captainApps.filter(a => a.status === 'approved').length"
                  class="btn btn-primary btn-sm"
                  :disabled="finalizingCaptains"
                  @click="finalizeCaptainsAction"
                >
                  {{ finalizingCaptains ? 'Finalizing…' : 'Finalize Captains' }}
                </button>
              </div>
            </div>
            <p class="captain-mgmt-hint">
              When open, members see an "Apply to be Captain" form on the season page.
              Approve applicants here, then assign them as Team Leads via <strong>Edit Team</strong>.
              Finalize when done to lock applications.
            </p>
            <div v-if="captainAppsLoading" class="loading-inline">Loading applications…</div>
            <div v-else-if="captainAppsError" class="error-inline">{{ captainAppsError }}</div>
            <div v-else-if="!captainApps.length" class="empty-hint" style="padding: 8px 0;">No applications yet.</div>
            <ul v-else class="cap-app-list">
              <li
                v-for="app in captainApps"
                :key="app.id"
                class="cap-app-item"
                :class="`cap-app-item--${app.status}`"
              >
                <div class="cap-app-info">
                  <div class="cap-app-name-row">
                    <strong class="cap-app-name">{{ app.first_name }} {{ app.last_name }}</strong>
                    <span class="cap-app-role-label" :class="`cap-app-role-label--${app.status}`">
                      {{ app.status === 'approved' ? 'Approved Captain Applicant' : app.status === 'rejected' ? 'Rejected Captain Applicant' : 'Captain Applicant' }}
                    </span>
                  </div>
                  <span v-if="app.application_text" class="cap-app-text">"{{ app.application_text }}"</span>
                </div>
                <div class="cap-app-actions">
                  <button
                    v-if="app.status !== 'approved' && !managingChallenge?.captains_finalized"
                    class="btn btn-primary btn-sm"
                    @click="reviewCaptainApp(app.id, 'approved')"
                  >Approve</button>
                  <button
                    v-if="app.status !== 'rejected' && !managingChallenge?.captains_finalized"
                    class="btn btn-secondary btn-sm"
                    @click="reviewCaptainApp(app.id, 'rejected')"
                  >Reject</button>
                </div>
              </li>
            </ul>
          </div>
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
              <button
                class="btn btn-outline btn-sm"
                :disabled="sendingResetFor === m.provider_user_id"
                :title="`Send password reset email to ${memberDisplayName(m)}`"
                @click="sendPasswordReset(m)"
              >{{ sendingResetFor === m.provider_user_id ? 'Sending…' : 'Send Reset Link' }}</button>
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
              <template v-if="profileEdits[m.provider_user_id]">
                <select v-model="profileEdits[m.provider_user_id].gender" @change="saveProfile(m)">
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
                <input v-model="profileEdits[m.provider_user_id].dateOfBirth" type="date" @change="saveProfile(m)" placeholder="DOB" />
              </template>
              <template v-else>
                <select disabled><option>—</option></select>
                <input type="date" disabled placeholder="DOB" />
              </template>
            </div>
            <div v-if="!providerMembers.length" class="empty-hint">No participants yet. Add participants first, then set their profiles.</div>
          </div>
        </div>

        <div v-show="manageTab === 'weekly'" class="manage-panel">
          <div class="weekly-tools-grid">
            <div v-if="templateLibrary.length || tenantTemplateLibrary.length" class="library-picker-panel">
              <div class="library-picker-head">
                <div>
                  <label class="library-picker-label">Challenge library</label>
                  <p class="library-picker-copy">Pick a saved template, drop it into one of the three weekly slots, and then tweak anything you want.</p>
                </div>
              </div>
              <div class="library-picker-bar">
                <select v-model="libraryPickerSelected" class="library-picker-select">
                  <option value="">— pick a challenge —</option>
                  <optgroup v-if="tenantTemplateLibrary.length" label="Summit Stats Library">
                    <option v-for="tpl in tenantTemplateLibrary" :key="`t-${tpl.id}`" :value="tpl.id">
                      {{ tpl.name }}{{ templateUsedLabel(tpl) ? ' ' + templateUsedLabel(tpl) : '' }}
                    </option>
                  </optgroup>
                  <optgroup v-if="templateLibrary.length" label="Club Library">
                    <option v-for="tpl in templateLibrary" :key="`c-${tpl.id}`" :value="tpl.id">
                      {{ tpl.name }}{{ templateUsedLabel(tpl) ? ' ' + templateUsedLabel(tpl) : '' }}
                    </option>
                  </optgroup>
                </select>
                <select v-if="libraryPickerSelected" v-model="libraryPickerSlot" class="library-picker-select">
                  <option value="">— slot —</option>
                  <option value="0">Weekly challenge 1</option>
                  <option value="1">Weekly challenge 2</option>
                  <option value="2">Weekly challenge 3</option>
                </select>
                <button class="btn btn-secondary btn-sm" @click="applyLibraryTemplate" :disabled="!libraryPickerSelected || libraryPickerSlot === ''">Apply</button>
              </div>
            </div>

            <div class="guided-draft-panel">
              <div class="guided-draft-head">
                <div>
                  <strong>Guided draft helper</strong>
                  <p>Keep the full AI draft button for a fresh 3-pack. This helper is for when you already know the icon, title, and activity and want a matching example workout fast.</p>
                </div>
              </div>
              <div class="guided-draft-fields">
                <select v-model="weeklyGuidedDraft.slot" class="library-picker-select">
                  <option value="0">Weekly challenge 1</option>
                  <option value="1">Weekly challenge 2</option>
                  <option value="2">Weekly challenge 3</option>
                </select>
                <select v-model="weeklyGuidedDraft.activityType" class="library-picker-select">
                  <option v-for="opt in activityTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
                  <option value="Fitness">Fitness</option>
                </select>
                <input v-model="weeklyGuidedDraft.name" type="text" class="task-input guided-draft-name" placeholder="Challenge title" />
              </div>
              <div class="guided-draft-fields">
                <div class="guided-icon-mode">
                  <label><input v-model="weeklyGuidedDraft.useLibraryIcon" :value="false" type="radio" /> Emoji</label>
                  <label><input v-model="weeklyGuidedDraft.useLibraryIcon" :value="true" type="radio" /> Library icon</label>
                </div>
                <select v-if="!weeklyGuidedDraft.useLibraryIcon" v-model="weeklyGuidedDraft.icon" class="library-picker-select">
                  <option value="🏃">🏃 Run</option>
                  <option value="🥾">🥾 Ruck</option>
                  <option value="🌲">🌲 Trail</option>
                  <option value="👟">👟 Walk</option>
                  <option value="🚴">🚴 Bike</option>
                  <option value="🌊">🌊 Swim</option>
                  <option value="💪">💪 Fitness</option>
                  <option value="🔥">🔥 Effort</option>
                </select>
                <div v-else class="guided-icon-selector">
                  <IconSelector
                    :modelValue="weeklyGuidedDraft.libraryIconId"
                    :summitStatsClubId="organizationId"
                    context="weekly-guided-draft"
                    @update:modelValue="weeklyGuidedDraft.libraryIconId = $event"
                  />
                </div>
                <button class="btn btn-secondary btn-sm" @click="applyGuidedDraft">Generate example</button>
              </div>
            </div>
          </div>

          <div v-if="allAvailableTemplates.length" class="template-browser">
            <div class="template-browser-head">
              <strong>Pick from the library</strong>
              <span class="hint">These are the templates your season can pull from right now.</span>
            </div>
            <div class="template-browser-grid">
              <div v-for="tpl in allAvailableTemplates" :key="`${tpl.scope}-${tpl.id}`" class="template-browser-card">
                <div class="template-browser-card-top">
                  <span class="template-browser-icon">
                    <img v-if="String(tpl.icon || '').startsWith('icon:') && weeklyTemplateIconUrl(tpl.icon)" :src="weeklyTemplateIconUrl(tpl.icon)" alt="" class="template-browser-icon-img" />
                    <span v-else>{{ weeklyTemplateIcon(tpl) }}</span>
                  </span>
                  <div>
                    <div class="template-browser-title">{{ tpl.name }}</div>
                    <div class="template-browser-meta">
                      {{ tpl.scope === 'tenant' ? 'Summit Stats Library' : 'Club Library' }}
                      <template v-if="tpl.activityType"> · {{ tpl.activityType }}</template>
                      <template v-if="tpl.isSeasonLong"> · Season-long</template>
                    </div>
                  </div>
                </div>
                <p v-if="tpl.description" class="template-browser-description">{{ tpl.description }}</p>
                <div class="template-browser-footer">
                  <span class="template-browser-used">{{ templateUsedLabel(tpl) || 'Not used this season yet' }}</span>
                  <div class="template-browser-actions">
                    <button class="btn btn-secondary btn-xs" @click="libraryPickerSelected = String(tpl.id); libraryPickerSlot = '0'; applyLibraryTemplate()">Use in slot 1</button>
                    <button class="btn btn-secondary btn-xs" @click="libraryPickerSelected = String(tpl.id); libraryPickerSlot = '1'; applyLibraryTemplate()">Use in slot 2</button>
                    <button class="btn btn-secondary btn-xs" @click="libraryPickerSelected = String(tpl.id); libraryPickerSlot = '2'; applyLibraryTemplate()">Use in slot 3</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel-actions">
            <label>Week</label>
            <select v-if="seasonWeekOptions.length" v-model="weeklyTasksWeek" class="week-select" @change="loadWeeklyTasks">
              <option v-for="w in seasonWeekOptions" :key="w.value" :value="w.value">{{ w.label }}</option>
            </select>
            <input v-else v-model="weeklyTasksWeek" type="date" />
            <button class="btn btn-secondary btn-sm" @click="generateWeeklyAiDraft" :disabled="!managingChallenge || weeklyAiDraftLoading">
              {{ weeklyAiDraftLoading ? 'Generating…' : 'Generate AI Draft' }}
            </button>
            <button class="btn btn-primary btn-sm" @click="saveWeeklyTasks" :disabled="!managingChallenge || weeklyTasksSaving">
              {{ weeklyTasksSaving ? 'Saving…' : 'Save weekly challenges (3)' }}
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
                <strong class="task-num">Weekly challenge {{ i + 1 }}</strong>
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
              <div class="weekly-task-identity">
                <div class="weekly-task-icon">
                  <img v-if="String(t.icon || '').startsWith('icon:') && weeklyTemplateIconUrl(t.icon)" :src="weeklyTemplateIconUrl(t.icon)" alt="" class="weekly-task-icon-img" />
                  <span v-else>{{ t.icon || weeklyTemplateIcon(t) }}</span>
                </div>
                <select v-model="t.icon" class="weekly-task-icon-select">
                  <option v-if="String(t.icon || '').startsWith('icon:')" :value="t.icon">Library icon</option>
                  <option value="🏃">🏃 Run</option>
                  <option value="🥾">🥾 Ruck</option>
                  <option value="🌲">🌲 Trail</option>
                  <option value="👟">👟 Walk</option>
                  <option value="🚴">🚴 Bike</option>
                  <option value="🌊">🌊 Swim</option>
                  <option value="💪">💪 Fitness</option>
                  <option value="🔥">🔥 Effort</option>
                </select>
                <select v-model="t.activityType" class="weekly-task-activity-select">
                  <option value="">Activity</option>
                  <option v-for="opt in activityTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
                  <option value="Fitness">Fitness</option>
                </select>
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
                <div class="criteria-section-title">Rich criteria — validates workouts tagged to this weekly challenge</div>

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
            <p class="hint">Assign one person per challenge per team. Captains can also assign from the season dashboard.</p>
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

        <!-- Branding tab -->
        <div v-show="manageTab === 'branding'" class="manage-panel branding-manage-panel">
          <div class="branding-manage-row">
            <!-- Banner -->
            <div class="branding-manage-col">
              <h4>Season Banner</h4>
              <p class="hint">Displayed at the top of the season dashboard. Recommended: 1200 × 400 px.</p>
              <div
                v-if="manageBannerPreview || managingChallenge?.banner_image_path"
                class="banner-preview-wrap"
                @click="onManageBannerFocalClick"
                title="Click to reposition focal point"
              >
                <img
                  :src="manageBannerPreview || resolveUploadUrl(managingChallenge?.banner_image_path, { classId: managingChallenge?.id, type: 'banner', version: managingChallenge?.updated_at })"
                  class="banner-preview-img"
                  :style="{ objectPosition: `${manageBannerFocalX}% ${manageBannerFocalY}%` }"
                  draggable="false"
                  ref="manageBannerImgRef"
                />
                <div
                  class="banner-focal-dot"
                  :style="{ left: manageBannerFocalX + '%', top: manageBannerFocalY + '%' }"
                />
                <span class="banner-focal-hint">Click to move focal point</span>
              </div>
              <div v-else class="banner-empty-state">No banner uploaded</div>
              <div class="branding-upload-row" style="margin-top:10px;">
                <label class="btn btn-secondary btn-sm branding-upload-btn">
                  {{ manageBannerPreview || managingChallenge?.banner_image_path ? 'Replace Banner' : 'Upload Banner' }}
                  <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none" @change="onManageBannerChange" />
                </label>
                <button
                  v-if="manageBannerFocalChanged"
                  type="button"
                  class="btn btn-primary btn-sm"
                  :disabled="manageBrandingSaving"
                  @click="saveManageBannerFocal"
                >{{ manageBrandingSaving ? 'Saving…' : 'Save focal point' }}</button>
                <button
                  v-if="managingChallenge?.banner_image_path || manageBannerPreview"
                  type="button"
                  class="btn btn-danger btn-sm"
                  @click="removeManageBanner"
                >Remove</button>
              </div>
              <p v-if="manageBrandingMsg" class="branding-save-msg">{{ manageBrandingMsg }}</p>
            </div>
            <!-- Logo -->
            <div class="branding-manage-col">
              <h4>Season Logo / Icon</h4>
              <p class="hint">Shown beside the season name. Recommended: 256 × 256 px square PNG.</p>
              <div v-if="manageLogoPreview || managingChallenge?.logo_image_path" class="logo-preview-wrap">
                <img
                  :src="manageLogoPreview || resolveUploadUrl(managingChallenge?.logo_image_path, { classId: managingChallenge?.id, type: 'logo', version: managingChallenge?.updated_at })"
                  class="logo-preview-img"
                />
              </div>
              <div v-else class="logo-empty-state">No logo uploaded</div>
              <div class="branding-upload-row" style="margin-top:10px;">
                <label class="btn btn-secondary btn-sm branding-upload-btn">
                  {{ manageLogoPreview || managingChallenge?.logo_image_path ? 'Replace Logo' : 'Upload Logo' }}
                  <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none" @change="onManageLogoChange" />
                </label>
                <button
                  v-if="managingChallenge?.logo_image_path || manageLogoPreview"
                  type="button"
                  class="btn btn-danger btn-sm"
                  @click="removeManageLogo"
                >Remove</button>
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
              <option
                v-for="m in availableCaptains"
                :key="m.provider_user_id"
                :value="m.provider_user_id"
              >{{ memberDisplayName(m) }}</option>
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
    <div v-if="organizationId" class="panel" style="margin-top: 24px;">
      <ClubCustomFields
        :club-id="organizationId"
        @fields-updated="challengeCustomFields = $event"
      />
    </div>

    <div v-if="organizationId" class="panel library-workspace-panel" style="margin-top: 24px;">
      <div class="library-workspace-header">
        <div>
          <span class="library-workspace-kicker">Reusable Libraries</span>
          <h2 class="library-workspace-title">Keep the season tools organized</h2>
          <p class="library-workspace-copy">
            Challenges come first, recognition awards come second, and icons stay here for now as their own shared utility section.
          </p>
        </div>
        <div class="library-workspace-pills">
          <span class="library-workspace-pill">Challenges</span>
          <span class="library-workspace-pill">Recognition Awards</span>
          <span class="library-workspace-pill">Icons</span>
        </div>
      </div>

      <div v-if="canManageTenantLibraries" class="tenant-write-toggle-bar" style="margin-bottom:0;">
        <label class="tenant-write-label">
          <input type="checkbox" v-model="tenantWriteEnabled" />
          Temporarily enable Summit Stats Library write access
        </label>
        <span class="tenant-write-hint">When on, club managers can add or edit Summit Stats Library challenges, awards, and shared icons from this screen. Turn off when finished.</span>
      </div>
    </div>

    <div v-if="organizationId" class="panel library-section-panel" style="margin-top: 24px;">
      <div class="library-section-head">
        <div>
          <h2 class="library-section-title">Challenges</h2>
          <p class="library-section-copy">Build the reusable challenge library here, then apply these templates from a list inside Manage Season → Weekly challenges.</p>
        </div>
      </div>
      <ChallengeTemplateLibraryManager
        :club-id="organizationId"
        :user-role="currentUserRole"
        :tenant-write-enabled="tenantWriteEnabled"
      />
    </div>

    <div v-if="organizationId" class="panel library-section-panel" style="margin-top: 24px;">
      <div class="library-section-head">
        <div>
          <h2 class="library-section-title">Recognition Awards</h2>
          <p class="library-section-copy">Manage reusable awards and eligibility groups for any season. Challenge-linked awards live here too, so they’re easier to find and reuse.</p>
        </div>
      </div>
      <RecognitionLibraryManager
        ref="libraryManagerRef"
        :club-id="organizationId"
        :custom-field-defs="challengeCustomFields"
        :user-role="currentUserRole"
        :tenant-write-enabled="tenantWriteEnabled"
        @groups-updated="libraryGroups = $event"
        @awards-updated="libraryAwards = $event"
      />
    </div>

    <div v-if="organizationId && canManageTenantLibraries" class="panel library-section-panel" style="margin-top: 24px;">
      <div class="library-section-head">
        <div>
          <h2 class="library-section-title">Icons</h2>
          <p class="library-section-copy">Shared icon management stays here for now so challenge and award libraries can both reference the same style set.</p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="showTenantIconLibrary = !showTenantIconLibrary">
          {{ showTenantIconLibrary ? 'Hide Icons' : 'Manage Icons' }}
        </button>
      </div>
      <div v-if="showTenantIconLibrary" class="library-icons-wrap">
        <IconLibraryView :preferred-club-id="organizationId" />
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
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import RecognitionCategoryBuilder from '../challenge/RecognitionCategoryBuilder.vue';
import ChallengeTemplateLibraryManager from '../challenge/ChallengeTemplateLibraryManager.vue';
import RecognitionLibraryManager from '../challenge/RecognitionLibraryManager.vue';
import ClubCustomFields from '../club/ClubCustomFields.vue';
import IconSelector from '../admin/IconSelector.vue';
import IconLibraryView from '../../views/admin/IconLibraryView.vue';
import { TIMEZONE_GROUPS } from '../../utils/timezones.js';
import { getWeekStartDate, getWeekDateTimeRange, ymdUtcDiffDays } from '../../utils/challengeWeekUtils.js';
import {
  agreementItemsToTextarea,
  agreementTextareaToItems,
  collectUniqueParticipationAgreementSnapshots,
  defaultParticipationAgreement,
  formatParticipationAgreementSeasonLabel,
  normalizeParticipationAgreement
} from '../../utils/seasonParticipationAgreement.js';
import { useAuthStore } from '../../store/auth';
import { isSummitPlatformRouteSlug } from '../../utils/summitPlatformSlugs.js';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const authStore = useAuthStore();
const tenantWriteEnabled = ref(false);
const showTenantIconLibrary = ref(false);
const currentUserRole = computed(() => String(authStore.user?.role || '').toLowerCase());
const canManageTenantLibraries = computed(() =>
  ['super_admin', 'club_manager'].includes(currentUserRole.value)
);

/** Club manager context (managed clubs list). */
const clubContext = ref(null);
const seasonsContextLoading = ref(true);

const clubSettingsLink = computed(() => {
  const s = String(route.params.organizationSlug || '').trim();
  if (!s) return '/club/settings';
  return `/${s}/club/settings`;
});

/** Affiliation / program / learning orgs the user can scope seasons to (for switcher). */
const clubSwitcherOptions = computed(() => {
  const list = clubContext.value?.managedClubs;
  const clubs = clubContext.value?.clubs;
  const fromStore = agencyStore.userAgencies || [];
  const seen = new Set();
  const out = [];
  for (const a of [...(Array.isArray(list) ? list : []), ...(Array.isArray(clubs) ? clubs : []), ...fromStore]) {
    const id = Number(a?.id || 0);
    if (!id || seen.has(id)) continue;
    const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
    if (t !== 'affiliation' && t !== 'program' && t !== 'learning') continue;
    seen.add(id);
    out.push({ id, name: String(a?.name || '').trim() || `Org ${id}` });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
});

const seasonOrgScopeError = computed(() => {
  if (seasonsContextLoading.value) return '';
  const a = agencyStore.currentAgency;
  if (!a?.id) return '';
  const t = String(a.organization_type || a.organizationType || '').toLowerCase();
  if (t === 'agency') {
    return 'Season management must target your club (program, learning, or affiliation), not the Summit platform tenant. Use the Club selector above, or choose your club in the organization menu.';
  }
  return '';
});

/**
 * Learning program classes API requires a program / learning / affiliation org — never the platform agency row.
 */
const organizationId = computed(() => {
  const a = agencyStore.currentAgency;
  if (!a?.id) return null;
  const t = String(a.organization_type || a.organizationType || '').toLowerCase();
  if (t === 'agency') return null;
  return Number(a.id);
});

const applyClubAgency = async (target) => {
  const targetId = Number(target?.id || 0);
  if (!targetId) return;
  const fromList = (agencyStore.userAgencies || []).find((a) => Number(a?.id) === targetId);
  if (fromList) {
    agencyStore.setCurrentAgency(fromList);
    return;
  }
  try {
    const { data } = await api.get(`/agencies/${targetId}`);
    if (data?.id) agencyStore.setCurrentAgency(data);
  } catch {
    /* ignore */
  }
};

const syncSeasonClubContext = async () => {
  const role = String(authStore.user?.role || '').toLowerCase();
  if (role === 'club_manager') {
    try {
      const r = await api.get('/summit-stats/club-manager-context', { skipGlobalLoading: true });
      clubContext.value = r.data || null;
    } catch {
      clubContext.value = null;
    }
  } else {
    clubContext.value = null;
  }

  const list = Array.isArray(agencyStore.userAgencies) ? agencyStore.userAgencies : [];
  const managedList = Array.isArray(clubContext.value?.managedClubs) ? clubContext.value.managedClubs : [];
  const clubsList = Array.isArray(clubContext.value?.clubs) ? clubContext.value.clubs : [];

  const seen = new Set();
  const candidates = [];
  for (const a of [...managedList, ...clubsList, ...list]) {
    const id = Number(a?.id || 0);
    if (!id || seen.has(id)) continue;
    const t = String(a?.organization_type || a?.organizationType || '').toLowerCase();
    if (t !== 'affiliation' && t !== 'program' && t !== 'learning') continue;
    seen.add(id);
    candidates.push(a);
  }
  if (!candidates.length) return;

  let queryClubId = Number(route.query.club || route.query.clubId || 0);
  if (route.query.club != null && String(route.query.club).trim() !== '') {
    if (!queryClubId || !candidates.some((c) => Number(c.id) === queryClubId)) {
      const nextQ = { ...route.query };
      delete nextQ.club;
      delete nextQ.clubId;
      await router.replace({ path: route.path, query: nextQ, hash: route.hash });
      queryClubId = 0;
    }
  }

  const cur = agencyStore.currentAgency;
  const curId = Number(cur?.id || 0);
  const curType = String(cur?.organization_type || cur?.organizationType || '').toLowerCase();

  if (queryClubId && candidates.some((c) => Number(c.id) === queryClubId)) {
    if (curId !== queryClubId || !['affiliation', 'program', 'learning'].includes(curType)) {
      const target = candidates.find((c) => Number(c.id) === queryClubId);
      await applyClubAgency(target);
    }
    return;
  }

  if (['affiliation', 'program', 'learning'].includes(curType) && candidates.some((c) => Number(c.id) === curId)) {
    return;
  }

  const routeSlug = String(route.params?.organizationSlug || '').trim().toLowerCase();
  let target = null;
  if (routeSlug && !isSummitPlatformRouteSlug(routeSlug)) {
    target = candidates.find(
      (c) => String(c.slug || c.portal_url || c.portalUrl || '').trim().toLowerCase() === routeSlug
    );
  }
  if (!target) {
    target = managedList.length ? managedList[0] : candidates[0];
  }
  await applyClubAgency(target);
};

watch(currentUserRole, (role) => {
  if (role === 'club_manager') {
    tenantWriteEnabled.value = true;
    return;
  }
  if (role !== 'super_admin') {
    tenantWriteEnabled.value = false;
  }
}, { immediate: true });

const onSeasonClubSwitch = async (event) => {
  const id = Number(event?.target?.value);
  if (!id) return;
  if (!clubSwitcherOptions.value.some((c) => c.id === id)) return;
  const full = (agencyStore.userAgencies || []).find((a) => Number(a?.id) === id);
  if (full) {
    agencyStore.setCurrentAgency(full);
  } else {
    try {
      const { data } = await api.get(`/agencies/${id}`);
      if (data?.id) agencyStore.setCurrentAgency(data);
    } catch {
      return;
    }
  }
  await router.replace({
    path: route.path,
    query: { ...route.query, club: String(id) },
    hash: route.hash
  });
};

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

/** Mirrors backend resolveWeeklyDistanceTargets per-person miles for a calendar week (Manage → Teams table). */
function resolvePerPersonMilesForManagedWeek(klass, weekStartYmd) {
  if (!klass) return null;
  const settings = klass.season_settings_json && typeof klass.season_settings_json === 'object' ? klass.season_settings_json : {};
  const participation = settings.participation || {};
  const schedule = settings.schedule || {};
  const drafting = settings.drafting || {};
  const teamsBlock = settings.teams || {};
  const cutoff = String(schedule.weekEndsSundayAt || klass.week_start_time || '00:00').trim() || '00:00';
  const tz = String(schedule.weekTimeZone || 'UTC').trim() || 'UTC';

  const firstPositiveNumber = (...vals) => {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };

  const membersPerTeamFromTeamsSettings = firstPositiveNumber(teamsBlock.membersPerTeam, teamsBlock.members_per_team);
  const chainBaseline =
    (membersPerTeamFromTeamsSettings > 0 ? Math.floor(membersPerTeamFromTeamsSettings) : 0) ||
    Number(participation.weeklyGoalMembersPerTeam) ||
    Number(participation.baselineMemberCount) ||
    Number(drafting.membersPerTeam) ||
    Number(klass.expected_team_size) ||
    12;
  const baselineMembers = Math.max(1, Math.floor(Number(chainBaseline) || 12));

  const perPersonStart = firstPositiveNumber(
    participation.runRuckStartMilesPerPerson,
    participation.run_ruck_start_miles_per_person,
    participation.individualMinPointsPerWeek,
    participation.individual_min_points_per_week,
    klass.individual_min_points_per_week
  );
  const weeklyIncrease =
    Number(participation.runRuckWeeklyIncreaseMilesPerPerson ?? participation.run_ruck_weekly_increase_miles_per_person ?? 0) || 0;

  const weeklyGoalMin = firstPositiveNumber(
    participation.weeklyGoalMinimum,
    participation.weekly_goal_minimum,
    klass.weekly_goal_minimum,
    klass.weeklyGoalMinimum
  );

  const anchorWeek = klass.starts_at
    ? getWeekStartDate(new Date(klass.starts_at), cutoff, tz)
    : String(weekStartYmd).slice(0, 10);
  const ws = String(weekStartYmd).slice(0, 10);
  const weekIndex = anchorWeek && ws ? Math.max(0, Math.floor(ymdUtcDiffDays(anchorWeek, ws) / 7)) : 0;

  let perPersonMiles = Number((perPersonStart + weekIndex * weeklyIncrease).toFixed(2));

  if (perPersonMiles <= 0 && weeklyGoalMin > 0) {
    perPersonMiles = Number((weeklyGoalMin / baselineMembers).toFixed(2));
  }

  let teamMilesBaseline = Number((perPersonMiles * baselineMembers).toFixed(2));

  const dbTeamMin = klass.team_min_points_per_week != null ? Number(klass.team_min_points_per_week) : 0;
  if (Number.isFinite(dbTeamMin) && dbTeamMin > 0) {
    if (teamMilesBaseline <= 0 || dbTeamMin > teamMilesBaseline) {
      teamMilesBaseline = Number(dbTeamMin.toFixed(2));
    }
    if (perPersonMiles <= 0 && baselineMembers > 0) {
      perPersonMiles = Number((teamMilesBaseline / baselineMembers).toFixed(2));
    }
  }

  if (perPersonMiles <= 0 && weeklyGoalMin > 0 && baselineMembers > 0) {
    perPersonMiles = Number((weeklyGoalMin / baselineMembers).toFixed(2));
  }

  return Number.isFinite(perPersonMiles) && perPersonMiles > 0 ? perPersonMiles : null;
}

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
const challengeFormSnapshotJson = ref('');
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
  billingEnabled: false,
  billingChargeTarget: 'member',
  billingMemberAmountDollars: null,
  billingCurrency: 'usd',
  billingStripePriceId: '',
  billingStripeProductId: '',
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
  treadmillpocalypseIconId: null,
  workoutModerationMode: 'treadmill_only',
  sameDayOnly: true,
  autoImportEnabled: false,
  dailyDeadlineTime: '23:59',
  showInClubFeed: true,
  recordMetrics: []
});

const weeklyTasksWeek = ref(getThisWeekSunday());

// Compute the end day name based on weekStartsOn (end day is 6 days after start)
const weekEndDayName = computed(() => {
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const startIdx = DAY_NAMES.map((d) => d.toLowerCase()).indexOf(
    String(challengeForm.value.weekStartsOn || 'sunday').toLowerCase()
  );
  const si = startIdx < 0 ? 0 : startIdx;
  // Deadline is one minute before the next week starts.
  // If cutoff is midnight (00:00), the minute roll-back shifts to the previous day.
  const [h, m] = (challengeForm.value.weekEndsSundayAt || '23:59').split(':').map(Number);
  const isMidnightStart = (h === 0 && m === 0);
  const endIdx = isMidnightStart ? (si + 6) % 7 : si;
  return DAY_NAMES[endIdx];
});

const weekDeadlineTimeDisplay = computed(() => {
  const [h, m] = (challengeForm.value.weekEndsSundayAt || '23:59').split(':').map(Number);
  let dh = h, dm = m - 1;
  if (dm < 0) { dm = 59; dh -= 1; }
  if (dh < 0) { dh = 23; }
  const period = dh >= 12 ? 'PM' : 'AM';
  const h12 = dh % 12 || 12;
  return `${h12}:${String(dm).padStart(2, '0')} ${period}`;
});

// Compute fixed week options from season start → end dates (7-day increments)
const seasonWeekOptions = computed(() => {
  const c = managingChallenge.value;
  const rawStart = c?.starts_at || c?.startsAt;
  const rawEnd   = c?.ends_at   || c?.endsAt;
  if (!rawStart) return [];

  const start = new Date(rawStart);
  start.setHours(0, 0, 0, 0);
  const endBound = rawEnd ? new Date(rawEnd) : null;

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

  const weeks = [];
  let cursor = new Date(start);
  let weekNum = 1;

  while (true) {
    const weekStart = new Date(cursor);
    const weekEnd   = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Stop if week start is past the season end (allow current partial week)
    if (endBound && weekStart > endBound) break;

    const value = weekStart.toISOString().slice(0, 10);
    weeks.push({
      value,
      label: `Week ${weekNum} (${fmt(weekStart)} – ${fmt(weekEnd)})`
    });

    cursor.setDate(cursor.getDate() + 7);
    weekNum++;
    if (weekNum > 52) break; // safety cap
  }

  return weeks;
});

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
  name: '', description: '', icon: '🏃', activityType: '', proofPolicy: 'none', mode: 'volunteer_or_elect',
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
const templateLibrary = ref([]);         // club-specific templates
const tenantTemplateLibrary = ref([]);   // Summit Stats tenant templates
const taskHistory = ref([]);             // { week_start_date, name } for all weeks used
const libraryPickerSelected = ref('');
const libraryPickerSlot = ref('');
const weeklyGuidedDraft = ref({
  slot: '0',
  icon: '🏃',
  activityType: 'Run',
  name: '',
  useLibraryIcon: false,
  libraryIconId: null
});
const weeklyTemplateIconCache = ref({});

// Map: templateName (lowercased) → array of week labels where it was used
const usedTemplateWeeks = computed(() => {
  const map = {};
  for (const h of taskHistory.value) {
    const key = String(h.name || '').toLowerCase().trim();
    if (!key) continue;
    const weekDate = h.week_start_date ? String(h.week_start_date).slice(0, 10) : '';
    // Find the week label from seasonWeekOptions
    const weekOpt = seasonWeekOptions.value.find((w) => w.value === weekDate);
    const weekLabel = weekOpt ? weekOpt.label.split(' (')[0] : weekDate;
    if (!map[key]) map[key] = [];
    if (!map[key].includes(weekLabel)) map[key].push(weekLabel);
  }
  return map;
});

const templateUsedLabel = (tpl) => {
  const key = String(tpl.name || '').toLowerCase().trim();
  const weeks = usedTemplateWeeks.value[key];
  return weeks?.length ? `(used: ${weeks.join(', ')})` : '';
};

const weeklyTemplateIcon = (tpl) => {
  if (tpl?.icon && !String(tpl.icon).startsWith('icon:')) return tpl.icon;
  const activity = String(tpl?.activityType || tpl?.criteriaJson?.activityTypes?.[0] || '').toLowerCase();
  if (activity.includes('ruck')) return '🥾';
  if (activity.includes('trail')) return '🌲';
  if (activity.includes('walk')) return '👟';
  if (activity.includes('bike')) return '🚴';
  if (activity.includes('swim')) return '🌊';
  if (activity.includes('fit')) return '💪';
  return '🏃';
};

const weeklyTemplateIconUrl = (iconRef) => {
  if (typeof iconRef !== 'string' || !iconRef.startsWith('icon:')) return null;
  const id = Number.parseInt(iconRef.replace('icon:', ''), 10);
  if (!id) return null;
  if (weeklyTemplateIconCache.value[id]) return weeklyTemplateIconCache.value[id];
  api.get(`/icons/${id}`, { skipGlobalLoading: true }).then(({ data }) => {
    const raw = data?.url || data?.file_path || null;
    if (raw) weeklyTemplateIconCache.value[id] = toUploadsUrl(raw) || raw;
  }).catch(() => {});
  return null;
};

const allAvailableTemplates = computed(() => [
  ...tenantTemplateLibrary.value.map((tpl) => ({ ...tpl, scope: 'tenant' })),
  ...templateLibrary.value.map((tpl) => ({ ...tpl, scope: 'club' }))
]);

const weeklyGuidedIconLabel = computed(() => {
  if (weeklyGuidedDraft.value.useLibraryIcon && weeklyGuidedDraft.value.libraryIconId) return `icon:${weeklyGuidedDraft.value.libraryIconId}`;
  return weeklyGuidedDraft.value.icon || '🏃';
});

const loadTemplateLibrary = async () => {
  const clubId = managingChallenge.value?.organization_id;
  const classId = managingChallenge.value?.id;
  if (!clubId) return;
  try {
    const [clubRes, tenantRes, historyRes] = await Promise.allSettled([
      api.get(`/summit-stats/clubs/${clubId}/challenge-templates`),
      api.get(`/summit-stats/clubs/${clubId}/tenant-challenge-templates`),
      classId ? api.get(`/learning-program-classes/${classId}/weekly-tasks`, { params: { allWeeks: 'true' } }) : Promise.resolve(null)
    ]);
    templateLibrary.value = clubRes.status === 'fulfilled'
      ? (Array.isArray(clubRes.value?.data?.templates) ? clubRes.value.data.templates : [])
      : [];
    tenantTemplateLibrary.value = tenantRes.status === 'fulfilled'
      ? (Array.isArray(tenantRes.value?.data?.templates) ? tenantRes.value.data.templates : [])
      : [];
    taskHistory.value = historyRes.status === 'fulfilled' && historyRes.value
      ? (Array.isArray(historyRes.value?.data?.allTaskHistory) ? historyRes.value.data.allTaskHistory : [])
      : [];
  } catch {
    templateLibrary.value = [];
    tenantTemplateLibrary.value = [];
    taskHistory.value = [];
  }
};

const applyLibraryTemplate = () => {
  const allLibrary = [...templateLibrary.value, ...tenantTemplateLibrary.value];
  const tpl = allLibrary.find((t) => String(t.id) === String(libraryPickerSelected.value));
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
    icon: tpl.icon || weeklyTemplateIcon(tpl),
    activityType: tpl.activityType || tpl.criteriaJson?.activityTypes?.[0] || '',
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
  if (!clubId || !t.name?.trim()) return alert('Weekly challenge needs a name before saving to library.');
  const payload = {
    name: t.name.trim(),
    description: t.description || null,
    icon: t.icon || null,
    activityType: t.activityType || null,
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

const weeklyGuidedDescriptions = {
  run: [
    (name) => `Complete "${name}" with one steady run that locks into race pace for the middle third, then finish with a controlled push.`,
    (name) => `Use "${name}" as a benchmark workout: log one quality run and keep your pacing smooth from the first mile to the last.`,
    (name) => `Make "${name}" your featured workout of the week with a purposeful run that builds effort instead of starting too fast.`
  ],
  'trail run': [
    (name) => `Turn "${name}" into a trail mission: choose rolling terrain, stay relaxed on climbs, and finish with clean footing on the descent.`,
    (name) => `Use "${name}" for one trail-focused workout that balances climbing strength, control, and steady aerobic effort.`,
    (name) => `Log "${name}" on dirt if possible and aim for a strong, even effort that rewards patience over the first half.`
  ],
  ruck: [
    (name) => `Treat "${name}" as a focused ruck session with strong posture, consistent pace, and a finish that still feels repeatable.`,
    (name) => `Build "${name}" around one quality ruck: maintain steady movement, keep transitions clean, and close out the final segment with intent.`,
    (name) => `Use "${name}" for a purposeful ruck workout that emphasizes consistency and disciplined effort instead of surges.`
  ],
  walk: [
    (name) => `Use "${name}" for an intentional walk that keeps cadence up, posture tall, and effort honest for the full session.`,
    (name) => `Make "${name}" a brisk movement session with smooth pacing and a strong finish over the last few minutes.`,
    (name) => `Complete "${name}" with one purposeful walk that feels active the whole way instead of drifting into recovery pace.`
  ],
  bike: [
    (name) => `Build "${name}" around a bike session with one sustained working block and a smooth cooldown to finish.`,
    (name) => `Use "${name}" for a ride that starts controlled, settles into tempo, and closes with one final push.`,
    (name) => `Make "${name}" the week’s featured ride by keeping pressure on the pedals without blowing up early.`
  ],
  swim: [
    (name) => `Turn "${name}" into a swim set with clean form, measured pacing, and one confident finish effort near the end.`,
    (name) => `Use "${name}" as a technique-first swim workout that still asks for one solid sustained segment.`,
    (name) => `Complete "${name}" with a smooth swim session that emphasizes rhythm, breathing control, and a composed final set.`
  ],
  fitness: [
    (name) => `Build "${name}" around one focused fitness session with clear work intervals, short recovery, and a finish that feels earned.`,
    (name) => `Use "${name}" as a circuit-style workout that stacks quality reps, steady effort, and one hard closing round.`,
    (name) => `Make "${name}" your featured fitness challenge this week with controlled intensity and strong form all the way through.`
  ],
  other: [
    (name) => `Use "${name}" for one signature workout this week and make the effort specific, repeatable, and easy for captains to explain.`,
    (name) => `Turn "${name}" into a clean example workout with a clear objective, strong pacing, and a finish that matches the title.`,
    (name) => `Make "${name}" a standout challenge by pairing the title with one realistic workout people can picture immediately.`
  ]
};

const guidedDraftProofPolicy = (activityType) => {
  const key = String(activityType || '').toLowerCase();
  if (key.includes('run') || key.includes('ruck') || key.includes('walk')) return 'gps_or_photo';
  if (key.includes('bike') || key.includes('swim') || key.includes('fit')) return 'photo_required';
  return 'none';
};

const applyGuidedDraft = () => {
  const slot = Number.parseInt(weeklyGuidedDraft.value.slot, 10);
  const activityType = String(weeklyGuidedDraft.value.activityType || 'Run').trim();
  const title = String(weeklyGuidedDraft.value.name || '').trim() || `${activityType} Builder`;
  if (!Number.isFinite(slot) || slot < 0 || slot > 2) return;
  const key = activityType.toLowerCase();
  const options = weeklyGuidedDescriptions[key] || weeklyGuidedDescriptions.other;
  const descriptionFactory = options[Math.floor(Math.random() * options.length)] || weeklyGuidedDescriptions.other[0];
  const current = weeklyTasksForm.value[slot] || defaultTask();
  const crit = { ...defaultCriteria(), ...(current.criteriaJson || {}) };
  crit.activityTypes = activityType ? [activityType] : [];
  if (!crit.distance) crit.distance = { minMiles: null };
  if (!crit.duration) crit.duration = { minMinutes: null };
  weeklyTasksForm.value[slot] = {
    ...current,
    name: title,
    description: descriptionFactory(title),
    icon: weeklyGuidedIconLabel.value,
    activityType,
    proofPolicy: guidedDraftProofPolicy(activityType),
    criteriaJson: crit
  };
};
const closeWeekSaving = ref(false);
const weeklyAiDraftLoading = ref(false);
const weeklyPublishSaving = ref(false);
const weeklyAssignments = ref([]);
const weeklyTasksWithIds = ref([]);
const teamMembersCache = ref({});
const snakeDraftPicks = ref([]);
const snakeDraftRandomized = ref(false);
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

// Captain application management
const captainApps = ref([]);
const captainAppsLoading = ref(false);
const captainAppsError = ref('');
const togglingCaptainApps = ref(false);
const finalizingCaptains = ref(false);
const creatingPresetTeams = ref(false);
const manageTeamsMembersPerTeam = ref(10);
const manageTeamsMembersPerTeamSaving = ref(false);
const manageTeamsMembersPerTeamMsg = ref('');

/** Per-week team mile targets (YYYY-MM-DD week start → miles). Loaded from teams.weeklyTeamTargets. */
const weeklyTargetOverrides = ref({});
const weeklyTargetEditingWeekStart = ref(null);
const weeklyTargetEditDraft = ref('');
const weeklyTargetSaving = ref(false);
const weeklyTargetMsg = ref('');

const manageTeamsIsMilesGoal = computed(() => {
  const row = managingChallenge.value;
  if (!row) return false;
  const s = row.season_settings_json ?? row.seasonSettingsJson;
  const season = s && typeof s === 'object' ? s : {};
  const cat = String(season?.event?.category || 'run_ruck').toLowerCase();
  const part = season.participation || {};
  const metric = String(part.weeklyGoalMetric || '').toLowerCase();
  return cat === 'run_ruck' || metric === 'miles' || metric.includes('mile');
});

const manageTeamsWeekRows = computed(() => {
  const klass = managingChallenge.value;
  if (!klass || !manageTeamsIsMilesGoal.value) return [];

  const raw = klass.season_settings_json ?? klass.seasonSettingsJson;
  const season = raw && typeof raw === 'object' ? raw : {};
  const schedule = season.schedule || {};
  const cutoff = String(schedule.weekEndsSundayAt || klass.week_start_time || '00:00').trim() || '00:00';
  const tz = String(schedule.weekTimeZone || 'UTC').trim() || 'UTC';
  const rawStart = klass.starts_at || klass.startsAt;
  const rawEnd = klass.ends_at || klass.endsAt;

  let cur = getWeekStartDate(rawStart ? new Date(rawStart) : new Date(), cutoff, tz);
  if (!cur) cur = getWeekStartDate(new Date(), cutoff, tz);
  if (!cur) return [];

  const todayWeek = getWeekStartDate(new Date(), cutoff, tz) || cur;
  const endWeek = rawEnd ? getWeekStartDate(new Date(rawEnd), cutoff, tz) : todayWeek;
  const maxWeek = !endWeek || String(endWeek) > String(todayWeek) ? todayWeek : endWeek;

  const roster = Math.max(1, Math.floor(Number(manageTeamsMembersPerTeam.value) || 1));
  const overrides = weeklyTargetOverrides.value || {};

  const fmt = (d) =>
    (typeof d === 'string' ? new Date(`${d}T12:00:00Z`) : d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });

  const rows = [];
  let guard = 0;
  let weekNum = 0;
  while (cur && guard++ < 520) {
    if (String(cur) > String(maxWeek)) break;
    weekNum += 1;
    const range = getWeekDateTimeRange(cur, cutoff, tz);
    if (!range?.end) break;
    const endLabel = new Date(range.end.replace(' ', 'T') + 'Z');
    const label = `Week ${weekNum} (${fmt(cur)} – ${fmt(endLabel)})`;

    const perPerson = resolvePerPersonMilesForManagedWeek(klass, cur);
    const computed =
      perPerson != null && Number.isFinite(perPerson) && perPerson > 0
        ? Number((perPerson * roster).toFixed(2))
        : null;
    const overrideRaw = overrides[cur];
    const override =
      overrideRaw != null && Number.isFinite(Number(overrideRaw)) && Number(overrideRaw) > 0
        ? Number(Number(overrideRaw).toFixed(2))
        : null;

    rows.push({
      weekNum,
      weekStart: cur,
      label,
      perPerson,
      roster,
      computed,
      override,
      hasOverride: override != null,
      active: override ?? computed
    });

    const nextStart = getWeekStartDate(new Date(range.end.replace(' ', 'T') + 'Z'), cutoff, tz);
    if (!nextStart || nextStart === cur) break;
    cur = nextStart;
  }
  return rows;
});

// Branding – edit form state
const editBannerFile = ref(null);
const editBannerPreview = ref(null);
const editBannerFocalX = ref(50);
const editBannerFocalY = ref(50);
const editLogoFile = ref(null);
const editLogoPreview = ref(null);
const bannerPreviewImgRef = ref(null);

// Branding – manage modal state
const manageBannerPreview = ref(null);
const manageBannerFile = ref(null);
const manageBannerFocalX = ref(50);
const manageBannerFocalY = ref(50);
const manageBannerFocalChanged = ref(false);
const manageLogoPreview = ref(null);
const manageLogoFile = ref(null);
const manageBrandingSaving = ref(false);
const manageBrandingMsg = ref('');
const manageBannerImgRef = ref(null);

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
  // Use the current route slug to stay on the same domain. Manager detection
  // is now server-side (can_manage flag) so the URL slug no longer needs to match.
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

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'run',     label: 'Run' },
  { value: 'ruck',    label: 'Ruck' },
  { value: 'walk',    label: 'Walk' },
  { value: 'fitness', label: 'Fitness / Strength' }
];

const toggleActivityType = (value, checked) => {
  const current = String(challengeForm.value.activityTypesText || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (checked && !current.includes(value)) {
    challengeForm.value.activityTypesText = [...current, value].join(', ');
  } else if (!checked) {
    challengeForm.value.activityTypesText = current.filter((v) => v !== value).join(', ');
  }
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

const availableCaptains = computed(() => {
  const editingTeamId = editingTeam.value?.id;
  const takenIds = new Set(
    (teams.value || [])
      .filter((t) => t.team_manager_user_id && Number(t.id) !== Number(editingTeamId))
      .map((t) => Number(t.team_manager_user_id))
  );
  return (providerMembers.value || []).filter((m) => !takenIds.has(Number(m.provider_user_id)));
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
    billingEnabled: false,
    billingChargeTarget: 'member',
    billingMemberAmountDollars: null,
    billingCurrency: 'usd',
    billingStripePriceId: '',
    billingStripeProductId: '',
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
    treadmillpocalypseIconId: null,
    workoutModerationMode: 'treadmill_only',
    sameDayOnly: true,
    autoImportEnabled: false,
    dailyDeadlineTime: '23:59',
    showInClubFeed: true,
    recordMetrics: []
  };
  challengeFormSnapshotJson.value = JSON.stringify(challengeForm.value || {});
  showChallengeModal.value = true;
};

const openEditModal = async (c) => {
  let row = c;
  if (c?.id) {
    try {
      const r = await api.get(`/learning-program-classes/${c.id}`, { skipGlobalLoading: true });
      const full = r.data?.class;
      if (full && typeof full === 'object') row = { ...c, ...full };
    } catch {
      /* list row only */
    }
  }
  editingChallenge.value = row;
  // Reset branding state
  editBannerFile.value = null;
  editBannerPreview.value = null;
  editBannerFocalX.value = Number(row?.banner_focal_x ?? row?.bannerFocalX ?? 50);
  editBannerFocalY.value = Number(row?.banner_focal_y ?? row?.bannerFocalY ?? 50);
  editLogoFile.value = null;
  editLogoPreview.value = null;
  const at = row?.activity_types_json ?? row?.activityTypesJson;
  let activityTypesText = '';
  if (Array.isArray(at)) activityTypesText = at.join(', ');
  else if (typeof at === 'object' && at) activityTypesText = Object.keys(at).join(', ');
  const rec = row.recognition_categories_json ?? row.recognitionCategoriesJson;
  const recArr = Array.isArray(rec) ? rec : (typeof rec === 'string' ? (() => { try { return JSON.parse(rec) || []; } catch { return []; } })() : []);
  const rawSeason = row.season_settings_json ?? row.seasonSettingsJson;
  const seasonSettings = rawSeason && typeof rawSeason === 'object'
    ? rawSeason
    : (typeof rawSeason === 'string' ? (() => { try { return JSON.parse(rawSeason) || {}; } catch { return {}; } })() : {});
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
  const billingSettings = seasonSettings.billing && typeof seasonSettings.billing === 'object' ? seasonSettings.billing : {};
  const billingMemberAmountCents = Number.parseInt(billingSettings.memberChargeAmountCents, 10);
  selectedAgreementTemplateKey.value = '';
  challengeForm.value = {
    ...buildAgreementFieldsFromSettings(seasonSettings),
    className: row.class_name || row.className || '',
    description: row.description || '',
    status: (row.status || 'draft').toLowerCase(),
    startsAt: row.starts_at || row.startsAt ? new Date(row.starts_at || row.startsAt).toISOString().slice(0, 16) : '',
    endsAt: row.ends_at || row.endsAt ? new Date(row.ends_at || row.endsAt).toISOString().slice(0, 16) : '',
    activityTypesText,
    weeklyGoalMinimum: row.weekly_goal_minimum ?? row.weeklyGoalMinimum ?? null,
    weeklyGoalMetric: seasonSettings?.participation?.weeklyGoalMetric || 'miles',
    weeklyGoalMembersPerTeam: teamsSettings.membersPerTeam ?? seasonSettings?.participation?.weeklyGoalMembersPerTeam ?? 10,
    teamMinPointsPerWeek: row.team_min_points_per_week ?? row.teamMinPointsPerWeek ?? null,
    individualMinPointsPerWeek: row.individual_min_points_per_week ?? row.individualMinPointsPerWeek ?? null,
    mastersAgeThreshold: row.masters_age_threshold ?? row.mastersAgeThreshold ?? 53,
    recognitionCategories: recArr,
    billingEnabled: billingSettings.enabled === true,
    billingChargeTarget: String(billingSettings.chargeTarget || 'member').toLowerCase() === 'club' ? 'club' : 'member',
    billingMemberAmountDollars: Number.isFinite(billingMemberAmountCents) ? (billingMemberAmountCents / 100) : null,
    billingCurrency: String(billingSettings.currency || 'usd').trim().toLowerCase() || 'usd',
    billingStripePriceId: String(billingSettings.stripePriceId || '').trim(),
    billingStripeProductId: String(billingSettings.stripeProductId || '').trim(),
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
    runRuckScoringMetric: scoringSettings.runRuckScoringMetric || 'distance',
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
    sameDayOnly: seasonSettings?.participation?.sameDayOnly !== false,
    autoImportEnabled: seasonSettings?.participation?.autoImportEnabled === true,
    dailyDeadlineTime: seasonSettings?.participation?.dailyDeadlineTime || '23:59',
    treadmillPhotoRequired: treadmillSettings.photoProofRequired !== false,
    treadmillpocalypseEnabled: treadmillpocalypseSettings.enabled === true,
    treadmillpocalypseStartsAtWeek: treadmillpocalypseSettings.startsAtWeek || '',
    treadmillpocalypseIconId: treadmillpocalypseSettings.icon
      ? (String(treadmillpocalypseSettings.icon).startsWith('icon:') ? Number(String(treadmillpocalypseSettings.icon).slice(5)) : null)
      : null,
    workoutModerationMode: moderationSettings.mode || 'treadmill_only',
    showInClubFeed: seasonSettings?.feedSettings?.showInClubFeed !== false,
    recordMetrics: normalizeRecordMetricSelection(recordsSettings.metrics)
  };
  challengeFormSnapshotJson.value = JSON.stringify(challengeForm.value || {});
  showChallengeModal.value = true;
};

const hasUnsavedChallengeModalChanges = () => {
  try {
    return JSON.stringify(challengeForm.value || {}) !== String(challengeFormSnapshotJson.value || '');
  } catch {
    return false;
  }
};

const closeChallengeModal = (force = false) => {
  if (!force && showChallengeModal.value && hasUnsavedChallengeModalChanges()) {
    const ok = window.confirm('Discard this season draft? Your unsaved changes will be lost.');
    if (!ok) return;
  }
  showChallengeModal.value = false;
  editingChallenge.value = null;
  selectedAgreementTemplateKey.value = '';
  challengeFormSnapshotJson.value = '';
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
    const buildBillingPayload = (source = {}) => {
      const src = source && typeof source === 'object' ? source : {};
      const amountCents = Math.max(0, Math.round(Number(src.billingMemberAmountDollars || 0) * 100));
      const enabled = src.billingEnabled === true && amountCents > 0;
      const currencyRaw = String(src.billingCurrency || '').trim().toLowerCase();
      const currency = /^[a-z]{3}$/.test(currencyRaw) ? currencyRaw : 'usd';
      const chargeTarget = String(src.billingChargeTarget || '').trim().toLowerCase() === 'club' ? 'club' : 'member';
      return {
        enabled,
        chargeTarget,
        memberChargeAmountCents: amountCents,
        currency,
        stripePriceId: String(src.billingStripePriceId || '').trim() || null,
        stripeProductId: String(src.billingStripeProductId || '').trim() || null,
        mode: 'per_season',
        status: enabled ? 'configured' : 'draft_disabled'
      };
    };
    const buildBillingPayloadFromSeasonSettings = (seasonSettings = {}) => {
      const billing = seasonSettings?.billing && typeof seasonSettings.billing === 'object' ? seasonSettings.billing : {};
      const cents = Math.max(0, Number.parseInt(billing.memberChargeAmountCents, 10) || 0);
      const enabled = billing.enabled === true && cents > 0;
      const chargeTarget = String(billing.chargeTarget || '').trim().toLowerCase() === 'club' ? 'club' : 'member';
      const currencyRaw = String(billing.currency || '').trim().toLowerCase();
      const currency = /^[a-z]{3}$/.test(currencyRaw) ? currencyRaw : 'usd';
      return {
        enabled,
        chargeTarget,
        memberChargeAmountCents: cents,
        currency,
        stripePriceId: String(billing.stripePriceId || '').trim() || null,
        stripeProductId: String(billing.stripeProductId || '').trim() || null,
        mode: 'per_season',
        status: enabled ? 'configured' : 'draft_disabled'
      };
    };
    const seasonSettingsBilling = editingChallenge.value
      ? buildBillingPayloadFromSeasonSettings(editingChallenge.value.season_settings_json || {})
      : buildBillingPayload(challengeForm.value);
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
          runRuckScoringMetric: challengeForm.value.runRuckScoringMetric || 'distance',
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
          ...(editingChallenge.value?.season_settings_json?.teams &&
          typeof editingChallenge.value.season_settings_json.teams === 'object'
            ? editingChallenge.value.season_settings_json.teams
            : {}),
          teamCount: Number(challengeForm.value.teamCount ?? 2),
          presetTeamNames: String(challengeForm.value.presetTeamNamesText || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          allowCaptainRenameTeam: challengeForm.value.allowCaptainRenameTeam !== false,
          allowCaptainNicknameSuffixWhenLocked: challengeForm.value.allowCaptainNicknameSuffixWhenLocked === true,
          membersPerTeam: Math.max(1, Number(challengeForm.value.weeklyGoalMembersPerTeam ?? 10))
        },
        participation: {
          weeklyGoalMetric: challengeForm.value.weeklyGoalMetric || 'miles',
          weeklyGoalMembersPerTeam: Number(challengeForm.value.weeklyGoalMembersPerTeam ?? 10),
          individualMinPointsPerWeek: Number(challengeForm.value.individualMinPointsPerWeek ?? 0),
          teamMinPointsPerWeek: Number(challengeForm.value.teamMinPointsPerWeek ?? 0),
          runRuckStartMilesPerPerson: Number(challengeForm.value.runRuckStartMilesPerPerson ?? 0),
          runRuckWeeklyIncreaseMilesPerPerson: Number(challengeForm.value.runRuckWeeklyIncreaseMilesPerPerson ?? 0),
          maxRucksPerWeek: Number(challengeForm.value.maxRucksPerWeek ?? 0),
          sameDayOnly: challengeForm.value.sameDayOnly !== false,
          autoImportEnabled: challengeForm.value.autoImportEnabled === true,
          dailyDeadlineTime: challengeForm.value.dailyDeadlineTime || '23:59'
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
        billing: seasonSettingsBilling,
        treadmill: {
          photoProofRequired: challengeForm.value.treadmillPhotoRequired !== false
        },
        treadmillpocalypse: {
          enabled: challengeForm.value.treadmillpocalypseEnabled === true,
          startsAtWeek: challengeForm.value.treadmillpocalypseStartsAtWeek || null,
          icon: challengeForm.value.treadmillpocalypseIconId ? `icon:${challengeForm.value.treadmillpocalypseIconId}` : null
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
    let savedId = editingChallenge.value?.id;
    if (editingChallenge.value) {
      await api.put(`/learning-program-classes/${savedId}`, payload);
    } else {
      const r = await api.post('/learning-program-classes', { organizationId: organizationId.value, ...payload });
      savedId = r.data?.class?.id || r.data?.id;
    }
    // Upload pending banner/logo if any
    if (savedId) {
      if (editBannerFile.value) {
        const fd = new FormData();
        fd.append('file', editBannerFile.value);
        await api.post(`/learning-program-classes/${savedId}/banner`, fd);
        // Save focal point
        await api.patch(`/learning-program-classes/${savedId}/banner/focal`, {
          focalX: editBannerFocalX.value,
          focalY: editBannerFocalY.value
        });
        editBannerFile.value = null;
        editBannerPreview.value = null;
      }
      if (editLogoFile.value) {
        const fd = new FormData();
        fd.append('file', editLogoFile.value);
        await api.post(`/learning-program-classes/${savedId}/logo`, fd);
        editLogoFile.value = null;
        editLogoPreview.value = null;
      }
    }
    closeChallengeModal(true);
    await loadChallenges();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to save season';
  } finally {
    saving.value = false;
  }
};

const editFromManageModal = () => {
  const c = managingChallenge.value;
  if (!c) return;
  showManageModal.value = false;
  openEditModal(c);
};

// ── Branding helpers ─────────────────────────────────────────────────────────

const resolveUploadUrl = (path, { classId, type, version } = {}) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const direct = toUploadsUrl(path);
  if (direct) {
    const v = version != null ? encodeURIComponent(String(version)) : '';
    return v ? `${direct}${direct.includes('?') ? '&' : '?'}v=${v}` : direct;
  }
  if (classId && type) {
    const apiBase = String(import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
    return `${apiBase}/learning-program-classes/${classId}/${type}`;
  }
  return '';
};

// Edit-form branding
const onEditBannerChange = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  editBannerFile.value = file;
  editBannerPreview.value = URL.createObjectURL(file);
};
const removeEditBanner = async () => {
  editBannerPreview.value = null;
  editBannerFile.value = null;
  const hasBanner = editingChallenge.value?.banner_image_path || editingChallenge.value?.bannerImagePath;
  if (editingChallenge.value?.id && hasBanner) {
    await api.delete(`/learning-program-classes/${editingChallenge.value.id}/banner`).catch(() => {});
    if (editingChallenge.value) {
      editingChallenge.value.banner_image_path = null;
      editingChallenge.value.bannerImagePath = null;
    }
  }
};
const onEditLogoChange = (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  editLogoFile.value = file;
  editLogoPreview.value = URL.createObjectURL(file);
};
const removeEditLogo = async () => {
  editLogoPreview.value = null;
  editLogoFile.value = null;
  const hasLogo = editingChallenge.value?.logo_image_path || editingChallenge.value?.logoImagePath;
  if (editingChallenge.value?.id && hasLogo) {
    await api.delete(`/learning-program-classes/${editingChallenge.value.id}/logo`).catch(() => {});
    if (editingChallenge.value) {
      editingChallenge.value.logo_image_path = null;
      editingChallenge.value.logoImagePath = null;
    }
  }
};
const onBannerFocalClick = (e) => {
  const img = e.currentTarget;
  const rect = img.getBoundingClientRect();
  editBannerFocalX.value = Math.round(((e.clientX - rect.left) / rect.width) * 100);
  editBannerFocalY.value = Math.round(((e.clientY - rect.top) / rect.height) * 100);
};

// Manage-modal branding
const initManageBranding = () => {
  const c = managingChallenge.value;
  if (!c) return;
  manageBannerPreview.value = null;
  manageBannerFile.value = null;
  manageBannerFocalX.value = Number(c.banner_focal_x ?? 50);
  manageBannerFocalY.value = Number(c.banner_focal_y ?? 50);
  manageBannerFocalChanged.value = false;
  manageLogoPreview.value = null;
  manageLogoFile.value = null;
  manageBrandingMsg.value = '';
};
const onManageBannerChange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  manageBannerFile.value = file;
  manageBannerPreview.value = URL.createObjectURL(file);
  manageBrandingSaving.value = true;
  manageBrandingMsg.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.post(`/learning-program-classes/${managingChallenge.value.id}/banner`, fd);
    if (managingChallenge.value) managingChallenge.value.banner_image_path = r.data.bannerPath;
    await api.patch(`/learning-program-classes/${managingChallenge.value.id}/banner/focal`, {
      focalX: manageBannerFocalX.value,
      focalY: manageBannerFocalY.value
    });
    manageBrandingMsg.value = 'Banner saved!';
    await loadChallenges();
  } catch {
    manageBrandingMsg.value = 'Failed to upload banner.';
  } finally {
    manageBrandingSaving.value = false;
  }
};
const onManageBannerFocalClick = (e) => {
  const img = e.currentTarget;
  const rect = img.getBoundingClientRect();
  manageBannerFocalX.value = Math.round(((e.clientX - rect.left) / rect.width) * 100);
  manageBannerFocalY.value = Math.round(((e.clientY - rect.top) / rect.height) * 100);
  manageBannerFocalChanged.value = true;
};
const saveManageBannerFocal = async () => {
  manageBrandingSaving.value = true;
  manageBrandingMsg.value = '';
  try {
    await api.patch(`/learning-program-classes/${managingChallenge.value.id}/banner/focal`, {
      focalX: manageBannerFocalX.value,
      focalY: manageBannerFocalY.value
    });
    if (managingChallenge.value) {
      managingChallenge.value.banner_focal_x = manageBannerFocalX.value;
      managingChallenge.value.banner_focal_y = manageBannerFocalY.value;
    }
    manageBannerFocalChanged.value = false;
    manageBrandingMsg.value = 'Focal point saved!';
  } catch {
    manageBrandingMsg.value = 'Failed to save focal point.';
  } finally {
    manageBrandingSaving.value = false;
  }
};
const removeManageBanner = async () => {
  manageBannerPreview.value = null;
  manageBannerFile.value = null;
  manageBrandingMsg.value = '';
  manageBrandingSaving.value = true;
  try {
    await api.delete(`/learning-program-classes/${managingChallenge.value.id}/banner`);
    if (managingChallenge.value) managingChallenge.value.banner_image_path = null;
    manageBrandingMsg.value = 'Banner removed.';
    await loadChallenges();
  } catch {
    manageBrandingMsg.value = 'Failed to remove banner.';
  } finally {
    manageBrandingSaving.value = false;
  }
};
const onManageLogoChange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  manageLogoFile.value = file;
  manageLogoPreview.value = URL.createObjectURL(file);
  manageBrandingSaving.value = true;
  manageBrandingMsg.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    const r = await api.post(`/learning-program-classes/${managingChallenge.value.id}/logo`, fd);
    if (managingChallenge.value) managingChallenge.value.logo_image_path = r.data.logoPath;
    manageBrandingMsg.value = 'Logo saved!';
    await loadChallenges();
  } catch {
    manageBrandingMsg.value = 'Failed to upload logo.';
  } finally {
    manageBrandingSaving.value = false;
  }
};
const removeManageLogo = async () => {
  manageLogoPreview.value = null;
  manageLogoFile.value = null;
  manageBrandingSaving.value = true;
  manageBrandingMsg.value = '';
  try {
    await api.delete(`/learning-program-classes/${managingChallenge.value.id}/logo`);
    if (managingChallenge.value) managingChallenge.value.logo_image_path = null;
    manageBrandingMsg.value = 'Logo removed.';
    await loadChallenges();
  } catch {
    manageBrandingMsg.value = 'Failed to remove logo.';
  } finally {
    manageBrandingSaving.value = false;
  }
};

const syncManageTeamsMembersPerTeamFromChallenge = (row) => {
  if (!row) return;
  const raw = row.season_settings_json ?? row.seasonSettingsJson;
  const season = raw && typeof raw === 'object' ? raw : {};
  const teamsS = season.teams || {};
  const part = season.participation || {};
  const n = Number(teamsS.membersPerTeam || part.weeklyGoalMembersPerTeam);
  manageTeamsMembersPerTeam.value = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
  manageTeamsMembersPerTeamMsg.value = '';
  const wtt = teamsS.weeklyTeamTargets;
  weeklyTargetOverrides.value =
    wtt && typeof wtt === 'object' && !Array.isArray(wtt) ? { ...wtt } : {};
  weeklyTargetEditingWeekStart.value = null;
  weeklyTargetEditDraft.value = '';
  weeklyTargetMsg.value = '';
};

const persistWeeklyTeamTargets = async (nextOverrides) => {
  if (!managingChallenge.value?.id) return;
  weeklyTargetSaving.value = true;
  weeklyTargetMsg.value = '';
  try {
    const { data } = await api.get(`/learning-program-classes/${managingChallenge.value.id}`, { skipGlobalLoading: true });
    const klass = data?.class || data;
    const prev = klass?.season_settings_json && typeof klass.season_settings_json === 'object' ? klass.season_settings_json : {};
    const nextSettings = {
      ...prev,
      teams: {
        ...(prev.teams || {}),
        weeklyTeamTargets: nextOverrides
      }
    };
    const { data: out } = await api.put(
      `/learning-program-classes/${managingChallenge.value.id}`,
      { season_settings_json: nextSettings },
      { skipGlobalLoading: true }
    );
    const updated = out?.class;
    if (updated && managingChallenge.value) {
      managingChallenge.value = { ...managingChallenge.value, season_settings_json: updated.season_settings_json };
    }
    const wt = updated?.season_settings_json?.teams?.weeklyTeamTargets;
    weeklyTargetOverrides.value = wt && typeof wt === 'object' && !Array.isArray(wt) ? { ...wt } : {};
    weeklyTargetMsg.value = 'Weekly team targets saved.';
  } catch (e) {
    weeklyTargetMsg.value = e?.response?.data?.error?.message || 'Could not save weekly targets.';
    throw e;
  } finally {
    weeklyTargetSaving.value = false;
  }
};

const startEditWeeklyTeamTarget = (row) => {
  weeklyTargetEditingWeekStart.value = row.weekStart;
  const v = row.active;
  weeklyTargetEditDraft.value = v != null && Number.isFinite(Number(v)) ? String(Number(v)) : '';
};

const cancelEditWeeklyTeamTarget = () => {
  weeklyTargetEditingWeekStart.value = null;
  weeklyTargetEditDraft.value = '';
};

const saveWeeklyTeamTarget = async () => {
  const weekStart = weeklyTargetEditingWeekStart.value;
  if (!weekStart || !managingChallenge.value?.id) return;
  const row = manageTeamsWeekRows.value.find((r) => r.weekStart === weekStart);
  const draft = Number(String(weeklyTargetEditDraft.value).trim());
  const next = { ...weeklyTargetOverrides.value };
  if (!Number.isFinite(draft) || draft <= 0) {
    delete next[weekStart];
  } else if (row?.computed != null && Math.abs(draft - row.computed) < 0.015) {
    delete next[weekStart];
  } else {
    next[weekStart] = Number(draft.toFixed(2));
  }
  try {
    await persistWeeklyTeamTargets(next);
    weeklyTargetEditingWeekStart.value = null;
    weeklyTargetEditDraft.value = '';
  } catch {
    /* message set in persist */
  }
};

const resetWeeklyTeamTargetToAuto = async (weekStart) => {
  if (!weekStart || !managingChallenge.value?.id) return;
  const next = { ...weeklyTargetOverrides.value };
  delete next[weekStart];
  try {
    await persistWeeklyTeamTargets(next);
  } catch {
    /* message set in persist */
  }
};

const saveManageTeamsMembersPerTeam = async () => {
  if (!managingChallenge.value?.id) return;
  const n = Math.max(1, Math.min(99, Math.floor(Number(manageTeamsMembersPerTeam.value) || 1)));
  manageTeamsMembersPerTeamSaving.value = true;
  manageTeamsMembersPerTeamMsg.value = '';
  try {
    const { data } = await api.get(`/learning-program-classes/${managingChallenge.value.id}`, { skipGlobalLoading: true });
    const klass = data?.class || data;
    const prev = klass?.season_settings_json && typeof klass.season_settings_json === 'object' ? klass.season_settings_json : {};
    const nextSettings = {
      ...prev,
      teams: { ...(prev.teams || {}), membersPerTeam: n },
      participation: { ...(prev.participation || {}), weeklyGoalMembersPerTeam: n }
    };
    const { data: out } = await api.put(
      `/learning-program-classes/${managingChallenge.value.id}`,
      { season_settings_json: nextSettings },
      { skipGlobalLoading: true }
    );
    const updated = out?.class;
    if (updated && managingChallenge.value) {
      managingChallenge.value = { ...managingChallenge.value, season_settings_json: updated.season_settings_json };
    }
    syncManageTeamsMembersPerTeamFromChallenge(managingChallenge.value);
    manageTeamsMembersPerTeamMsg.value = 'Saved. Weekly distance targets will use this roster size.';
  } catch (e) {
    manageTeamsMembersPerTeamMsg.value = e?.response?.data?.error?.message || 'Could not save.';
  } finally {
    manageTeamsMembersPerTeamSaving.value = false;
  }
};

const openManageModal = async (c) => {
  manageTab.value = 'teams';
  showManageModal.value = true;
  try {
    const { data } = await api.get(`/learning-program-classes/${c.id}`, { skipGlobalLoading: true });
    managingChallenge.value = data?.class ? { ...c, ...data.class } : c;
  } catch {
    managingChallenge.value = c;
  }
  syncManageTeamsMembersPerTeamFromChallenge(managingChallenge.value);
  // Auto-select the current week in the weekly challenges tab
  const today = new Date().toISOString().slice(0, 10);
  const opts = seasonWeekOptions.value;
  const currentWeekOpt = opts.findLast((w) => w.value <= today) || opts[0];
  if (currentWeekOpt) weeklyTasksWeek.value = currentWeekOpt.value;
  await Promise.all([loadTeams(c.id), loadProviderMembers(c.id), loadOrgUsers()]);
  await Promise.all([loadSnakeDraftBoard(), loadDraftSessionStatus(), loadCaptainApps(c.id)]);
};

const loadCaptainApps = async (classId) => {
  captainAppsLoading.value = true;
  captainAppsError.value = '';
  try {
    const { data } = await api.get(`/learning-program-classes/${classId}/captain-applications`, { skipGlobalLoading: true });
    captainApps.value = Array.isArray(data?.applications) ? data.applications : [];
  } catch (e) {
    captainAppsError.value = e?.response?.data?.error?.message || 'Failed to load captain applications';
    captainApps.value = [];
  } finally {
    captainAppsLoading.value = false;
  }
};

const toggleCaptainApplications = async (open) => {
  if (!managingChallenge.value?.id) return;
  togglingCaptainApps.value = true;
  try {
    const { data } = await api.put(
      `/learning-program-classes/${managingChallenge.value.id}`,
      { captainApplicationOpen: open },
      { skipGlobalLoading: true }
    );
    if (managingChallenge.value) {
      managingChallenge.value.captain_application_open = data?.class?.captain_application_open ?? open;
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update captain applications');
  } finally {
    togglingCaptainApps.value = false;
  }
};

const reviewCaptainApp = async (appId, status) => {
  if (!managingChallenge.value?.id) return;
  try {
    await api.put(
      `/learning-program-classes/${managingChallenge.value.id}/captain-applications/${appId}`,
      { status },
      { skipGlobalLoading: true }
    );
    await loadCaptainApps(managingChallenge.value.id);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update application');
  }
};

const finalizeCaptainsAction = async () => {
  if (!managingChallenge.value?.id) return;
  if (!confirm('Finalize captains? This closes applications and locks the selection.')) return;
  finalizingCaptains.value = true;
  try {
    await api.post(`/learning-program-classes/${managingChallenge.value.id}/captains/finalize`, {}, { skipGlobalLoading: true });
    if (managingChallenge.value) {
      managingChallenge.value.captains_finalized = true;
      managingChallenge.value.captain_application_open = false;
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to finalize captains');
  } finally {
    finalizingCaptains.value = false;
  }
};

const unfinalizeCaptainsAction = async () => {
  if (!managingChallenge.value?.id) return;
  finalizingCaptains.value = true;
  try {
    await api.put(
      `/learning-program-classes/${managingChallenge.value.id}`,
      { captainsFinalized: false },
      { skipGlobalLoading: true }
    );
    if (managingChallenge.value) {
      managingChallenge.value.captains_finalized = false;
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to unfinalize captains');
  } finally {
    finalizingCaptains.value = false;
  }
};

const createPresetTeams = async () => {
  if (!managingChallenge.value?.id) return;
  const raw = managingChallenge.value?.season_settings_json?.teams?.presetTeamNames;
  const names = (Array.isArray(raw) ? raw : String(raw || '').split(',')).map((n) => String(n).trim()).filter(Boolean);
  if (!names.length) { alert('No preset team names found. Set them in season settings first.'); return; }
  const existing = new Set(teams.value.map((t) => String(t.team_name || '').trim().toLowerCase()));
  const toCreate = names.filter((n) => !existing.has(n.toLowerCase()));
  if (!toCreate.length) { alert('All preset teams already exist.'); return; }
  if (!confirm(`Create ${toCreate.length} team(s): ${toCreate.join(', ')}?`)) return;
  creatingPresetTeams.value = true;
  try {
    for (const name of toCreate) {
      await api.post(`/learning-program-classes/${managingChallenge.value.id}/teams`, { teamName: name }, { skipGlobalLoading: true });
    }
    await loadTeams(managingChallenge.value.id);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to create some teams');
  } finally {
    creatingPresetTeams.value = false;
  }
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
      // Season-specific values take priority; fall back to global profile data
      map[p.provider_user_id] = {
        gender: p.gender || p.global_sex || '',
        dateOfBirth: p.date_of_birth
          ? String(p.date_of_birth).slice(0, 10)
          : p.global_date_of_birth
            ? String(p.global_date_of_birth).slice(0, 10)
            : ''
      };
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
  weeklyTargetOverrides.value = {};
  weeklyTargetEditingWeekStart.value = null;
  weeklyTargetEditDraft.value = '';
  weeklyTargetMsg.value = '';
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
        icon: task?.icon || weeklyTemplateIcon(task),
        activityType: task?.activity_type || '',
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

// ─── Draft room helpers ─────────────────────────────────────────────────────
const draftSessionStatus = ref(null);

const loadDraftSessionStatus = async () => {
  if (!managingChallenge.value?.id) return;
  try {
    const { data } = await api.get(
      `/learning-program-classes/${managingChallenge.value.id}/draft-session`,
      { skipGlobalLoading: true }
    );
    draftSessionStatus.value = data?.session?.status || null;
  } catch { draftSessionStatus.value = null; }
};

const openDraftRoom = () => {
  if (!managingChallenge.value?.id) return;
  const slug = organizationSlug.value;
  if (slug) {
    router.push(`/${slug}/season/${managingChallenge.value.id}/draft`);
  } else {
    router.push(`/season/${managingChallenge.value.id}/draft`);
  }
};
// ────────────────────────────────────────────────────────────────────────────

const loadSnakeDraftBoard = async () => {
  if (!managingChallenge.value?.id) return;
  try {
    const r = await api.get(`/learning-program-classes/${managingChallenge.value.id}/snake-draft-board`, { params: { rounds: 3 } });
    snakeDraftPicks.value = Array.isArray(r.data?.picks) ? r.data.picks : [];
    snakeDraftRandomized.value = !!r.data?.isCustomOrder;
  } catch {
    snakeDraftPicks.value = [];
    snakeDraftRandomized.value = false;
  }
};

const randomizeSnakeDraftBoard = async () => {
  if (!teams.value.length || !managingChallenge.value?.id) return;
  // Fisher-Yates shuffle of the current teams list
  const shuffled = [...teams.value];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const rounds = 3;
  const picks = [];
  for (let r = 1; r <= rounds; r++) {
    const row = r % 2 === 1 ? shuffled : [...shuffled].reverse();
    row.forEach((team, idx) => {
      picks.push({
        round: r,
        pickNumber: (r - 1) * shuffled.length + idx + 1,
        teamId: Number(team.id),
        teamName: team.team_name
      });
    });
  }
  snakeDraftPicks.value = picks;
  snakeDraftRandomized.value = true;
  // Persist the new order so it survives page reloads
  try {
    await api.put(
      `/learning-program-classes/${managingChallenge.value.id}/snake-draft-board/captain-order`,
      { captainOrder: shuffled.map((t) => t.id) }
    );
  } catch {
    // Non-fatal — the UI already reflects the shuffled order
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
          icon: t.icon || null,
          activityType: t.activityType || null,
          proofPolicy: t.proofPolicy || 'none',
          mode: t.mode || 'volunteer_or_elect',
          isSeasonLong: t.isSeasonLong || false,
          criteriaJson: buildCriteriaPayload(t.criteriaJson)
        }))
    });
    await loadWeeklyTasks();
    await loadNoShowAlerts();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save weekly challenges');
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
      return {
        name: t?.name || '',
        description: t?.description || '',
        icon: t?.icon || weeklyTemplateIcon(t),
        activityType: t?.activityType || '',
        proofPolicy: t?.proofPolicy || 'none',
        mode: t?.mode || 'volunteer_or_elect',
        confidenceScore: t?.confidenceScore ?? null,
        isSeasonLong: false,
        criteriaJson: crit
      };
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
          icon: t.icon || null,
          activityType: t.activityType || null,
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

const sendingResetFor = ref(null);
const sendPasswordReset = async (m) => {
  if (!organizationId.value || !m?.provider_user_id || sendingResetFor.value) return;
  sendingResetFor.value = m.provider_user_id;
  try {
    await api.post(`/agencies/${organizationId.value}/users/${m.provider_user_id}/send-password-reset`);
    alert(`Password reset email sent to ${memberDisplayName(m)}.`);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to send password reset email.');
  } finally {
    sendingResetFor.value = null;
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
      milestoneThreshold: award.aggregation === 'milestone' && award.milestoneThreshold != null ? Number(award.milestoneThreshold) : undefined,
      referenceTarget: award.aggregation !== 'milestone' && award.referenceTarget != null ? Number(award.referenceTarget) : undefined,
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

watch(organizationId, () => {
  if (organizationId.value) { loadChallenges(); loadCustomFields(); }
  else { challenges.value = []; challengeCustomFields.value = []; }
});

watch(
  () => [route.query.club, route.query.clubId, route.params.organizationSlug],
  async () => {
    if (seasonsContextLoading.value) return;
    await syncSeasonClubContext();
  }
);

onMounted(async () => {
  seasonsContextLoading.value = true;
  try {
    await agencyStore.fetchUserAgencies();
    await syncSeasonClubContext();
  } finally {
    seasonsContextLoading.value = false;
  }

  // Auto-open manage or edit modal when arriving from dashboard deep-link
  const manageId = Number(route.query.manageSeason || 0);
  const editId   = Number(route.query.editSeason   || 0);
  if (manageId || editId) {
    const targetId = manageId || editId;
    // Wait for challenges to load then open the matching season
    const attempt = async (tries = 0) => {
      if (challenges.value.length) {
        const c = challenges.value.find((ch) => Number(ch.id) === targetId);
        if (c) {
          if (manageId) openManageModal(c);
          else openEditModal(c);
          // Clean up query so back/refresh doesn't re-open
          const q = { ...route.query };
          delete q.manageSeason;
          delete q.editSeason;
          await router.replace({ path: route.path, query: q, hash: route.hash });
        }
      } else if (tries < 10) {
        setTimeout(() => attempt(tries + 1), 300);
      }
    };
    setTimeout(() => attempt(), 400);
  }
});
</script>

<style scoped>
.btn-outline {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 0.83em;
}
.btn-outline:hover { background: #f1f5f9; }
.btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
.tenant-write-toggle-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  margin-bottom: 12px;
}
.tenant-write-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  color: #92400e;
}
.tenant-write-hint {
  font-size: 0.8rem;
  color: #b45309;
  padding-left: 22px;
}
.library-workspace-panel {
  background:
    radial-gradient(circle at top right, rgba(191, 219, 254, 0.55), transparent 32%),
    linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}
.library-workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.library-workspace-kicker {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0369a1;
}
.library-workspace-title {
  margin: 6px 0 8px;
  font-size: 1.35rem;
  color: #0f172a;
}
.library-workspace-copy {
  margin: 0;
  max-width: 760px;
  color: #475569;
}
.library-workspace-pills {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.library-workspace-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 700;
}
.library-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.library-section-title {
  margin: 0 0 4px;
  font-size: 1.12rem;
  color: #0f172a;
}
.library-section-copy {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}
.library-icons-wrap {
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
}
.challenge-management {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
}
.challenge-management-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 16px 32px;
  box-sizing: border-box;
}
.page-header-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.club-switcher-inline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
}
.club-switcher-inline label {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--text-muted, #666);
}
.club-switcher-select {
  max-width: 320px;
}
.season-scope-error {
  max-width: 100%;
  box-sizing: border-box;
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
  flex-wrap: wrap;
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
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color, #eee);
  flex-wrap: wrap;
}
.team-item-name {
  font-weight: 600;
  flex: 1;
  min-width: 80px;
}
.team-lead,
.member-status {
  font-size: 0.85em;
  color: #16a34a;
  font-weight: 500;
  background: #dcfce7;
  border-radius: 999px;
  padding: 1px 8px;
  white-space: nowrap;
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
.tab-btn--edit {
  margin-left: auto;
  background: #fff8f0;
  border-color: #f59e0b;
  color: #92400e;
  font-weight: 600;
}
.tab-btn--edit:hover {
  background: #fef3c7;
}
.manage-panel {
  padding: 12px 0;
}
.planned-roster-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  background: #f8fafc;
}
.planned-roster-title {
  margin: 0 0 6px;
  font-size: 0.95rem;
}
.planned-roster-hint {
  margin: 0 0 10px;
  max-width: 40rem;
}
.planned-roster-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.planned-roster-row label {
  font-weight: 600;
  font-size: 0.88rem;
}
.planned-roster-input {
  width: 5rem;
  padding: 6px 10px;
}
.planned-roster-msg {
  margin: 8px 0 0;
  font-size: 0.82rem;
  color: #15803d;
}
.weekly-team-targets-card {
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
  background: #eef2ff;
}
.weekly-team-targets-title {
  margin: 0 0 6px;
  font-size: 0.95rem;
}
.weekly-team-targets-hint {
  margin: 0 0 10px;
  max-width: 48rem;
}
.wtt-table-wrap {
  overflow-x: auto;
}
.wtt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}
.wtt-table th,
.wtt-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}
.wtt-table th {
  background: #f1f5f9;
  font-weight: 700;
  color: #475569;
}
.wtt-week {
  font-weight: 600;
  color: #0f172a;
  white-space: nowrap;
}
.wtt-basis {
  color: #64748b;
}
.wtt-target-val {
  font-weight: 700;
  color: #1d4ed8;
}
.wtt-badge {
  margin-left: 8px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #7c3aed;
  background: #ede9fe;
  border: 1px solid #ddd6fe;
  border-radius: 4px;
  padding: 2px 6px;
  vertical-align: middle;
}
.wtt-actions {
  white-space: nowrap;
}
.wtt-actions .btn {
  margin-right: 6px;
}
.wtt-input {
  width: 6.5rem;
  padding: 4px 8px;
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
/* Draft Room card */
.draft-room-card {
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.06);
  padding: 14px 16px;
  margin-bottom: 16px;
}
.draft-room-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.draft-room-card__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.draft-room-card__icon { font-size: 20px; }
.draft-room-card__title { font-weight: 700; font-size: 14px; }
.draft-room-card__sub { margin-top: 2px; }
.draft-room-card__hint {
  font-size: 12px;
  color: var(--text-muted, #666);
  margin: 0;
  line-height: 1.5;
}
.drs-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.drs-badge--none { background: rgba(148,163,184,.15); color: #94a3b8; }
.drs-badge--pending { background: rgba(245,158,11,.15); color: #d97706; }
.drs-badge--live { background: rgba(16,185,129,.15); color: #059669; }
.drs-badge--done { background: rgba(99,102,241,.15); color: #6366f1; }
/* Preset teams bar */
.preset-teams-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 12px; border-radius: 8px;
  background: #f8fafc; border: 1px solid #e2e8f0;
  margin-bottom: 10px; font-size: 13px;
}
.preset-teams-bar__label { flex: 1; min-width: 0; color: #475569; }
.preset-teams-bar__label em { color: #1e293b; font-style: normal; font-weight: 500; }
/* Captain management section */
.captain-mgmt-section {
  margin-top: 20px; padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}
.captain-mgmt-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px; flex-wrap: wrap; margin-bottom: 6px;
}
.captain-mgmt-title-row { display: flex; align-items: center; gap: 8px; }
.captain-mgmt-title { font-weight: 700; font-size: 14px; }
.captain-mgmt-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.captain-mgmt-hint { font-size: 12px; color: #64748b; margin: 0 0 10px; line-height: 1.5; }
.cap-badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600;
}
.cap-badge--open { background: #dcfce7; color: #16a34a; }
.cap-badge--closed { background: #f1f5f9; color: #64748b; }
.cap-badge--finalized { background: #ede9fe; color: #7c3aed; }
.cap-app-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.cap-app-item {
  display: flex; flex-direction: column;
  gap: 8px; padding: 12px 14px; border-radius: 10px;
  background: #f8fafc; border: 1px solid #e2e8f0;
}
.cap-app-item--approved { background: #f0fdf4; border-color: #bbf7d0; }
.cap-app-item--rejected { background: #fff5f5; border-color: #fecaca; }
.cap-app-info { display: flex; flex-direction: column; gap: 4px; }
.cap-app-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cap-app-name { font-size: 14px; font-weight: 700; color: #0f172a; }
.cap-app-role-label {
  font-size: 11px; font-weight: 600; padding: 2px 9px;
  border-radius: 999px; white-space: nowrap;
}
.cap-app-role-label--pending  { background: #fef9c3; color: #a16207; }
.cap-app-role-label--approved { background: #dcfce7; color: #16a34a; }
.cap-app-role-label--rejected { background: #fee2e2; color: #dc2626; }
.cap-app-text { font-size: 12px; color: #64748b; font-style: italic; }
.cap-app-actions { display: flex; align-items: center; gap: 8px; }
.cap-status {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 999px;
}
.cap-status--pending { background: #fef9c3; color: #a16207; }
.cap-status--approved { background: #dcfce7; color: #16a34a; }
.cap-status--rejected { background: #fee2e2; color: #dc2626; }
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
.activity-type-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 6px 0 4px;
}
.activity-type-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
  cursor: pointer;
  font-size: 14px;
}
.activity-type-check input[type="checkbox"] {
  width: auto;
  margin: 0;
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
.weekly-tools-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.library-picker-panel,
.guided-draft-panel {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  background: linear-gradient(180deg, #fffdf7 0%, #ffffff 100%);
}
.guided-draft-panel {
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
  border-color: #cfe2ff;
}
.library-picker-head,
.guided-draft-head {
  margin-bottom: 10px;
}
.library-picker-copy,
.guided-draft-head p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 0.85rem;
}
.guided-draft-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.guided-draft-name {
  flex: 1;
  min-width: 180px;
}
.guided-icon-mode {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 0.83rem;
  color: #475569;
}
.guided-icon-mode label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.guided-icon-selector {
  min-width: 220px;
  flex: 1;
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
.weekly-task-identity {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.weekly-task-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px solid #bfdbfe;
  font-size: 1.15rem;
  overflow: hidden;
}
.weekly-task-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.weekly-task-icon-select,
.weekly-task-activity-select {
  padding: 7px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.85rem;
  background: #fff;
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
}
.library-picker-label {
  font-size: 0.9em;
  font-weight: 700;
  color: #0f172a;
  display: block;
}
.library-picker-select {
  padding: 5px 8px;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  font-size: 0.85em;
  background: #fff;
}
.template-browser {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  background: #fff;
  margin-bottom: 16px;
}
.template-browser-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.template-browser-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.template-browser-card {
  border: 1px solid #dbe3ef;
  border-radius: 14px;
  padding: 12px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.template-browser-card-top {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.template-browser-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  border: 1px solid #bfdbfe;
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  overflow: hidden;
  flex-shrink: 0;
}
.template-browser-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.template-browser-title {
  font-weight: 700;
  color: #0f172a;
}
.template-browser-meta,
.template-browser-used {
  font-size: 0.8rem;
  color: #64748b;
}
.template-browser-description {
  margin: 0;
  color: #334155;
  font-size: 0.88rem;
}
.template-browser-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.template-browser-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

@media (max-width: 900px) {
  .library-workspace-header,
  .library-section-head,
  .template-browser-head {
    flex-direction: column;
    align-items: flex-start;
  }
  .weekly-tools-grid,
  .template-browser-grid {
    grid-template-columns: 1fr;
  }
}

/* ── Season Branding ── */
.season-branding-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.form-section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 14px;
  color: var(--text-primary, #0f172a);
}
.branding-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.branding-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.branding-field--banner { flex: 2; min-width: 280px; }
.branding-field--logo   { flex: 1; min-width: 160px; }
.branding-label {
  font-weight: 600;
  font-size: 0.88rem;
}
.branding-hint {
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
  margin: 0;
}
.banner-preview-wrap {
  position: relative;
  width: 100%;
  height: 140px;
  border-radius: 8px;
  overflow: hidden;
  cursor: crosshair;
  border: 1.5px solid #d1d5db;
  background: #f0f0f0;
}
.banner-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}
.banner-focal-dot {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255,255,255,0.9);
  border: 2px solid #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.3);
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.banner-focal-hint {
  position: absolute;
  bottom: 6px;
  right: 8px;
  font-size: 10px;
  background: rgba(0,0,0,0.5);
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  pointer-events: none;
}
.logo-preview-wrap {
  width: 80px;
  height: 80px;
  border-radius: 10px;
  border: 1.5px solid #d1d5db;
  overflow: hidden;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
}
.logo-preview-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.branding-upload-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.branding-upload-btn {
  cursor: pointer;
}
.banner-empty-state,
.logo-empty-state {
  font-size: 0.82rem;
  color: #9ca3af;
  padding: 8px 0;
  font-style: italic;
}

/* Manage modal branding panel */
.branding-manage-panel { padding: 16px 0; }
.branding-manage-row {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}
.branding-manage-col {
  flex: 1;
  min-width: 240px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.branding-manage-col h4 {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary, #0f172a);
}
.branding-save-msg {
  font-size: 0.82rem;
  color: #16a34a;
  margin: 4px 0 0;
}
</style>
