<template>
  <section class="challenge-activity-feed">
    <div class="activity-feed-header">
      <h2>Recent Activity</h2>

      <!-- ── Date navigator ──────────────────────────────────────── -->
      <div class="feed-date-nav">
        <button type="button" class="date-nav-btn" title="Previous day" @click="shiftDate(-1)">‹</button>
        <button type="button" class="date-nav-today" :class="{ 'date-nav-today--active': isToday }" @click="resetDate">
          {{ isToday ? 'Today' : formattedDate }}
        </button>
        <button type="button" class="date-nav-btn" title="Next day" :disabled="isToday" @click="shiftDate(1)">›</button>
      </div>
    </div>

    <!-- ── Filter bar ──────────────────────────────────────────────── -->
    <div class="feed-filter-bar">
      <!-- Team scope pills -->
      <div class="filter-group" v-if="myTeamId || teamList.length">
        <button
          type="button"
          class="filter-pill"
          :class="{ active: teamFilter === 'my' }"
          @click="teamFilter = teamFilter === 'my' ? null : 'my'"
        >My team</button>
        <button
          v-for="t in otherTeams"
          :key="t.id"
          type="button"
          class="filter-pill"
          :class="{ active: teamFilter === String(t.id) }"
          @click="teamFilter = teamFilter === String(t.id) ? null : String(t.id)"
        >{{ t.name }}</button>
      </div>

      <!-- Activity type pills -->
      <div class="filter-group filter-group--types" v-if="activityTypeList.length > 1">
        <button
          v-for="at in activityTypeList"
          :key="at.value"
          type="button"
          class="filter-pill filter-pill--type"
          :class="{ active: activityTypeFilter === at.value }"
          @click="activityTypeFilter = activityTypeFilter === at.value ? null : at.value"
        >{{ at.label }}</button>
      </div>

      <!-- Clear filters -->
      <button
        v-if="hasActiveFilters"
        type="button"
        class="filter-clear-btn"
        @click="clearFilters"
      >✕ Clear filters</button>
    </div>
    <!-- Manager quick-review toolbar -->
    <div v-if="props.isManager" class="manager-review-bar" :class="{ 'manager-review-bar--idle': !pendingWorkouts.length }">
      <span class="pending-count-label">
        <template v-if="pendingWorkouts.length">
          <span class="pending-dot" />
          {{ pendingWorkouts.length }} workout{{ pendingWorkouts.length === 1 ? '' : 's' }} pending review
        </template>
        <template v-else>
          <span class="pending-dot pending-dot--ok" />
          All caught up — no pending reviews
        </template>
      </span>
      <div class="manager-bar-actions">
        <button v-if="pendingWorkouts.length" type="button" class="btn-expand-pending" @click="expandAllPending">
          Expand all pending ▼
        </button>
        <button v-if="anyExpanded" type="button" class="btn-collapse-all" @click="collapseAll">
          Collapse all ▲
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading-inline">Loading…</div>
    <div v-else class="activity-list">
      <div
        v-for="w in filteredWorkouts"
        :key="w.id"
        class="activity-card"
        :style="{ borderLeftColor: activityColor(w.activity_type), boxShadow: `inset 3px 0 0 ${activityColor(w.activity_type)}` }"
      >
        <div class="activity-header">
          <UserAvatar :photo-path="w.profile_photo_url || w.profile_photo_path" :first-name="w.first_name" :last-name="w.last_name" size="sm" extra-class="activity-avatar" />
          <div class="activity-user-info">
            <span class="activity-user">{{ w.first_name }} {{ w.last_name }}</span>
            <span class="activity-timestamp">{{ formatTimestamp(w.completed_at || w.created_at) }}</span>
          </div>
          <div class="activity-badges">
            <span class="activity-type">{{ formatActivityType(w.activity_type) }}</span>
            <span v-if="w.terrain" class="terrain-badge" :class="`terrain-${String(w.terrain).toLowerCase()}`">
              {{ w.terrain }}
            </span>
            <span v-if="Number(w.is_race) === 1" class="race-badge">🏅 Race</span>
          </div>
        </div>
        <div class="activity-meta">
          <span v-if="w.distance_value">{{ Number(w.distance_value).toFixed(2) }} mi</span>
          <span v-if="w.duration_minutes">{{ formatDuration(w) }}</span>
          <span v-if="avgPace(w)" class="activity-pace">{{ avgPace(w) }} /mi</span>
          <span class="activity-points" :class="{ 'activity-points--edited': Number(w.manager_edited) === 1 }">{{ formatPts(w.points) }} pts</span>
        </div>
        <!-- Challenge tag + proof/disqualified badges in a compact inline row -->
        <div class="activity-inline-tags">
          <span v-if="w.weekly_task_name" class="tag-chip tag-chip--challenge">{{ w.weekly_task_name }}</span>
          <span v-if="w.proof_status === 'approved' && Number(w.is_disqualified) !== 1 && Number(w.manager_edited) === 1" class="proof-badge proof-badge--approved-edit">✓ Approved with edits</span>
          <span v-else-if="w.proof_status === 'approved' && Number(w.is_disqualified) !== 1" class="proof-badge proof-badge--approved">✓ Approved</span>
          <span v-else-if="w.proof_status && w.proof_status !== 'not_required' && w.proof_status !== 'approved' && Number(w.is_disqualified) !== 1" class="proof-badge proof-badge--pending">⏳ Pending review</span>
          <span v-if="Number(w.is_disqualified) === 1" class="proof-badge proof-badge--rejected">✗ Disqualified</span>
        </div>

        <!-- ── Engagement row: kudos / reactions / action links ──────────── -->
        <div class="workout-engagement-row">
          <!-- Kudos button -->
          <button
            class="kudos-btn"
            :class="{ 'kudos-given': hasGivenKudos(w.id), 'kudos-disabled': !canGiveKudos(w) }"
            :disabled="kudosSubmitting[w.id]"
            :title="kudosBtnTitle(w)"
            @click="toggleKudos(w)"
          >
            <span class="kudos-icon">👊</span>
            <span class="kudos-count">{{ kudosCountFor(w) }}</span>
            <span class="kudos-label">{{ hasGivenKudos(w.id) ? 'Kudos given' : 'Give kudos' }}</span>
          </button>

          <!-- Emoji reactions display -->
          <div v-if="(reactionsFor(w.id) || []).length" class="reactions-display" @click="toggleReactionDetail(w.id)">
            <span
              v-for="(r, ri) in (reactionsFor(w.id) || []).slice(0, 5)"
              :key="`rpill-${w.id}-${ri}`"
              class="reaction-pill"
              :style="{ zIndex: 10 - ri }"
            >
              <img v-if="r.iconUrl" :src="r.iconUrl" class="reaction-icon-img" :alt="r.emoji" />
              <template v-else>{{ r.emoji }}</template>
            </span>
            <span class="reaction-total-count">{{ totalReactionCount(w.id) }}</span>
          </div>

          <!-- Emoji picker toggle -->
          <button class="emoji-btn" :class="{ 'emoji-picker-open': emojiPickerOpen[w.id] }" @click.stop="toggleEmojiPicker(w.id)" title="Add emoji reaction">
            <span>😄 +</span>
          </button>

          <div class="engagement-divider" />

          <!-- More info / Comments action links -->
          <button class="card-action-link" @click="moreInfoOpen[w.id] = !moreInfoOpen[w.id]">
            {{ moreInfoOpen[w.id] ? 'Less ▲' : 'More info ▼' }}
          </button>
          <button class="card-action-link" @click="toggleComments(w.id)">
            💬 {{ w.comment_count || 0 }}
          </button>
        </div>

        <!-- Emoji picker panel -->
        <div v-if="emojiPickerOpen[w.id]" class="emoji-picker-panel" @click.stop>
          <div class="emoji-grid">
            <button
              v-for="emoji in emojiOptions"
              :key="`ep-${w.id}-${emoji}`"
              class="emoji-option"
              :class="{ 'emoji-mine': isMyReaction(w.id, emoji) }"
              @click="onReact(w.id, emoji)"
            >{{ emoji }}</button>
            <button
              v-for="ic in reactionIcons"
              :key="`ep-icon-${w.id}-${ic.id}`"
              class="emoji-option emoji-option--icon"
              :class="{ 'emoji-mine': isMyReaction(w.id, ic.ref) }"
              :title="ic.name"
              @click="onReact(w.id, ic.ref)"
            >
              <img :src="ic.url" class="reaction-picker-icon" :alt="ic.name" />
            </button>
          </div>
        </div>

        <!-- Reaction detail popover -->
        <div v-if="reactionDetailOpen[w.id]" class="reaction-detail-panel" @click.stop>
          <div class="reaction-detail-header">
            <span>Reactions</span>
            <button class="btn-link" @click="reactionDetailOpen[w.id] = false">✕</button>
          </div>
          <div v-for="group in (reactionsFor(w.id) || [])" :key="`rg-${w.id}-${group.emoji}`" class="reaction-group">
            <span class="reaction-group-emoji">
              <img v-if="group.iconUrl" :src="group.iconUrl" class="reaction-icon-img" :alt="group.emoji" />
              <template v-else>{{ group.emoji }}</template>
            </span>
            <span class="reaction-group-count">{{ group.count }}</span>
            <span class="reaction-group-names">{{ group.users.map((u) => `${u.firstName} ${u.lastName}`).join(', ') }}</span>
          </div>
        </div>

        <!-- ── Expandable "More info" section ──────────────────────────── -->
        <div v-if="moreInfoOpen[w.id]" class="more-info-panel">
          <!-- Notes -->
          <div v-if="w.workout_notes" class="activity-notes">{{ w.workout_notes }}</div>

          <!-- Strava metrics chips (Strava-linked workouts) -->
          <div v-if="w.strava_activity_id && (w.elevation_gain_meters > 0 || w.calories_burned > 0 || w.average_heartrate > 0 || w.max_heartrate > 0)" class="strava-metrics-row">
            <span v-if="w.elevation_gain_meters > 0" class="strava-metric" title="Elevation gain">⛰ {{ Math.round(w.elevation_gain_meters * 3.28084) }} ft gain</span>
            <span v-if="w.calories_burned > 0" class="strava-metric" title="Calories verified and capped against evidence-based limits">🔥 {{ w.calories_burned }} cal <span class="cal-source-tag">Strava</span></span>
            <span v-if="w.average_heartrate > 0" class="strava-metric" title="Avg heart rate">❤️ avg {{ Math.round(w.average_heartrate) }} bpm</span>
            <span v-if="w.max_heartrate > 0" class="strava-metric" title="Max heart rate">❤️‍🔥 max {{ Math.round(w.max_heartrate) }} bpm</span>
          </div>

          <!-- Estimated calories for manual (non-Strava) workouts -->
          <div v-else-if="!w.strava_activity_id && w.calories_burned > 0" class="strava-metrics-row">
            <span class="strava-metric strava-metric--est" title="Standardised estimate based on activity type and distance/duration. Not weight-based.">🔥 ~{{ w.calories_burned }} cal <span class="cal-source-tag cal-source-tag--est">est.</span></span>
          </div>

          <!-- Mile splits -->
          <div v-if="parsedSplits(w).length" class="splits-section">
            <button class="splits-toggle" @click="toggleSplits(w.id)">
              {{ splitsOpen[w.id] ? '▲ Hide splits' : '▼ Mile splits' }} ({{ parsedSplits(w).length }} mi)
            </button>
            <table v-if="splitsOpen[w.id]" class="splits-table">
              <thead>
                <tr>
                  <th>Mi</th><th>Pace</th><th>Elev</th>
                  <th v-if="parsedSplits(w).some(s => s.averageHeartrate)">HR</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in parsedSplits(w)" :key="s.split">
                  <td>{{ s.split }}</td>
                  <td>{{ formatSplitPace(s) }}</td>
                  <td>{{ s.elevationDiffMeters != null ? (s.elevationDiffMeters >= 0 ? '+' : '') + Math.round(s.elevationDiffMeters * 3.28084) + ' ft' : '—' }}</td>
                  <td v-if="parsedSplits(w).some(s2 => s2.averageHeartrate)">{{ s.averageHeartrate ? Math.round(s.averageHeartrate) + ' bpm' : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Screenshot proof thumbnail -->
          <div v-if="w.screenshot_file_path && !w.media?.length" class="screenshot-proof">
            <img :src="toUploadsUrl(w.screenshot_file_path)" alt="Workout screenshot" class="screenshot-thumb" @click="openScreenshot(w.screenshot_file_path)" />
            <span class="screenshot-label">Screenshot</span>
          </div>

          <!-- Media photos -->
          <div v-if="w.media?.length" class="activity-media">
            <img
              v-for="m in w.media.filter(m => m.media_type !== 'map')"
              :key="`media-${w.id}-${m.id}`"
              :src="toUploadsUrl(m.file_path)"
              :alt="`Workout media ${m.id}`"
              class="media-item"
            />
            <img
              v-for="m in w.media.filter(m => m.media_type === 'map')"
              :key="`map-${w.id}-${m.id}`"
              :src="toUploadsUrl(m.file_path)"
              class="media-item media-item--map"
              alt="Route map"
            />
          </div>

          <!-- Strava route map -->
          <WorkoutRouteMap
            v-if="w.map_summary_polyline && !w.media?.some(m => m.media_type === 'map')"
            :polyline="w.map_summary_polyline"
          />

          <!-- Treadmill note + edit -->
          <div v-if="Number(w.is_treadmill) === 1" class="hint" style="margin-top: 4px;">Treadmill entry</div>
          <div v-if="canEditOwnImportedTreadmill(w)" class="proof-review-card" style="margin-top: 6px;">
            <div class="proof-review-header">
              <strong>Edit treadmill import</strong>
              <button class="btn btn-secondary btn-small" @click="toggleEditImportedWorkout(w)">{{ editOpenByWorkout[w.id] ? 'Hide' : 'Edit' }}</button>
            </div>
            <div v-if="editOpenByWorkout[w.id]" class="proof-review-body">
              <label class="proof-field"><span>Corrected miles</span><input v-model.number="editDraftByWorkout[w.id].distanceValue" type="number" step="0.01" min="0" /></label>
              <label class="proof-field"><span>Notes</span><input v-model="editDraftByWorkout[w.id].workoutNotes" type="text" maxlength="500" /></label>
              <div class="proof-actions">
                <button class="btn btn-primary btn-small" :disabled="!!editSubmitting[w.id]" @click="saveEditImportedWorkout(w.id)">Save Edit</button>
              </div>
            </div>
          </div>

          <!-- Strava source tag + "Add details" for owner -->
          <div v-if="w.strava_activity_id" class="hint strava-source-hint">
            <span class="strava-logo-s-sm">S</span> Imported from Strava
            <button v-if="canEditStravaDetails(w)" class="btn-link-sm" style="margin-left:8px;" @click="toggleStravaEdit(w)">
              {{ stravaEditOpenByWorkout[w.id] ? 'Close' : '+ Add details' }}
            </button>
          </div>

          <!-- Strava "Add details" panel: challenge + treadmill proof -->
          <div v-if="canEditStravaDetails(w) && stravaEditOpenByWorkout[w.id]" class="proof-review-card">
            <div class="proof-review-header"><strong>Add details to Strava import</strong></div>
            <div class="proof-review-body">
              <!-- Challenge picker -->
              <label class="proof-field">
                <span>Link to a weekly challenge</span>
                <select v-if="stravaEditDraftByWorkout[w.id]" v-model="stravaEditDraftByWorkout[w.id].weeklyTaskId">
                  <option :value="null">— None —</option>
                  <option v-for="t in (stravaWeeklyTasksCache[Number(challengeId)] || [])" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              </label>
              <!-- Treadmill toggle -->
              <label class="proof-field proof-field--inline" v-if="stravaEditDraftByWorkout[w.id]">
                <input type="checkbox" v-model="stravaEditDraftByWorkout[w.id].isTreadmill" />
                <span>This is a treadmill workout</span>
              </label>
              <!-- Corrected treadmill distance -->
              <label v-if="stravaEditDraftByWorkout[w.id]?.isTreadmill" class="proof-field">
                <span>Corrected treadmill distance (miles)</span>
                <input v-model.number="stravaEditDraftByWorkout[w.id].distanceValue" type="number" step="0.01" min="0" placeholder="Actual treadmill distance" />
              </label>
              <!-- Treadmill proof photo upload -->
              <label v-if="stravaEditDraftByWorkout[w.id]?.isTreadmill" class="proof-field">
                <span>Upload treadmill proof photo</span>
                <input type="file" accept="image/*" @change="onStravaProofFileChange($event, w.id)" />
              </label>
              <div class="proof-actions">
                <button class="btn btn-primary btn-small" :disabled="!!stravaEditSubmitting[w.id]" @click="saveStravaEdit(w.id)">Save</button>
                <button class="btn btn-secondary btn-small" @click="stravaEditOpenByWorkout[w.id] = false">Cancel</button>
              </div>
            </div>
          </div>

          <!-- Manager review panel -->
          <div
            v-if="props.isManager && (w.proof_status || Number(w.is_treadmill) === 1 || Number(w.is_disqualified) === 1)"
            class="proof-review-card"
          >
            <template v-if="w.proof_status === 'approved' && Number(w.is_disqualified) !== 1">
              <div class="proof-review-header proof-review-header--approved">
                <span>✓ Proof approved</span>
                <button class="btn-link-sm" @click="reviewProof(w.id, 'pending')">Undo</button>
              </div>
            </template>
            <template v-else>
              <div class="proof-review-header">
                <strong>Manager review</strong>
                <span class="proof-status" :class="`proof-${String(w.proof_status || '').toLowerCase()}`">
                  {{ Number(w.is_disqualified) === 1 ? 'Disqualified' : String(w.proof_status || 'pending').replace(/_/g, ' ') }}
                </span>
              </div>
              <div class="proof-review-body">
                <label class="proof-field">
                  <span>Verified miles (optional — only fill to override)</span>
                  <input v-model.number="proofReviewDraftByWorkout[w.id].verifiedDistanceValue" type="number" step="0.01" min="0" :placeholder="w.distance_value != null ? `Reported: ${Number(w.distance_value).toFixed(2)} mi` : 'Leave blank to keep reported distance'" />
                </label>
                <label class="proof-field">
                  <span>Override points (optional – leave blank to auto-calculate)</span>
                  <input v-model.number="proofReviewDraftByWorkout[w.id].overridePoints" type="number" step="0.01" min="0" placeholder="e.g. 3.89" />
                </label>
                <label class="proof-field">
                  <span>Note (optional)</span>
                  <input v-model="proofReviewDraftByWorkout[w.id].proofReviewNote" type="text" maxlength="255" placeholder="Reason for rejection or notes" />
                </label>
                <div class="proof-actions">
                  <button class="btn btn-primary btn-small" :disabled="!!proofSubmitting[w.id]" @click="reviewProof(w.id, 'approved')">Approve</button>
                  <button
                    v-if="Number(w.is_disqualified) !== 1"
                    class="btn btn-secondary btn-small"
                    :disabled="!!disqualifySubmitting[w.id] || !!proofSubmitting[w.id]"
                    @click="setWorkoutDisqualification(w.id, true)"
                  >Reject / Disqualify</button>
                  <button
                    v-else
                    class="btn btn-primary btn-small"
                    :disabled="!!disqualifySubmitting[w.id]"
                    @click="setWorkoutDisqualification(w.id, false)"
                  >Reinstate</button>
                </div>
              </div>
            </template>
          </div>

          <!-- Disqualify control for workouts without proof panel -->
          <div v-else-if="props.isManager && Number(w.is_disqualified) === 1" class="proof-review-card">
            <div class="proof-review-header">
              <strong>Manager review</strong>
              <span class="proof-status proof-rejected">Disqualified</span>
            </div>
            <div class="proof-review-body">
              <div class="proof-actions">
                <button class="btn btn-primary btn-small" :disabled="!!disqualifySubmitting[w.id]" @click="setWorkoutDisqualification(w.id, false)">Reinstate Workout</button>
              </div>
            </div>
          </div>

          <!-- Disqualified reason note (manager) -->
          <div v-if="props.isManager && Number(w.is_disqualified) === 1 && w.disqualification_reason" class="disqualified-banner">
            Reason: {{ w.disqualification_reason }}
          </div>

          <!-- Edit own workout fields (activity type, terrain, notes) -->
          <div v-if="canEditOwnFields(w)" class="proof-review-card">
            <div class="proof-review-header own-edit-header-row">
              <strong>Edit workout</strong>
              <div class="own-edit-actions">
                <button class="btn btn-secondary btn-small" @click="toggleOwnEdit(w)">{{ ownEditOpenByWorkout[w.id] ? 'Close' : 'Edit' }}</button>
                <button class="btn btn-race btn-small" @click="toggleRacePanel(w)">
                  {{ racePanelOpen[w.id] ? 'Close' : (Number(w.is_race) === 1 ? '🏅 Race/Challenge' : '🏁 Race/Challenge') }}
                </button>
              </div>
            </div>
            <div v-if="ownEditOpenByWorkout[w.id] && ownEditDraftByWorkout[w.id]" class="proof-review-body">
              <label class="proof-field">
                <span>Activity type</span>
                <select v-model="ownEditDraftByWorkout[w.id].activityType">
                  <option value="">— Keep current ({{ w.activity_type }}) —</option>
                  <option v-for="opt in (props.activityTypeOptions.length ? props.activityTypeOptions : [{value:'running',label:'Running'},{value:'ruck',label:'Ruck'},{value:'walking',label:'Walking'},{value:'cycling',label:'Cycling'},{value:'steps',label:'Steps'},{value:'workout_session',label:'Workout Session'}])" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </label>
              <label class="proof-field">
                <span>Surface / terrain</span>
                <select v-model="ownEditDraftByWorkout[w.id].terrain">
                  <option value="">— None —</option>
                  <option v-for="t in TERRAIN_OPTIONS" :key="t" :value="t">{{ t }}</option>
                </select>
              </label>
              <!-- Treadmill proof required when switching to Treadmill without existing proof -->
              <label v-if="ownEditDraftByWorkout[w.id].terrain === 'Treadmill' && !w.screenshot_file_path" class="proof-field">
                <span>Treadmill proof photo <span class="required-star">*</span></span>
                <input type="file" accept="image/*" @change="onOwnEditProofFile($event, w.id)" />
              </label>
              <label class="proof-field">
                <span>Notes</span>
                <textarea v-model="ownEditDraftByWorkout[w.id].workoutNotes" rows="2" maxlength="500" />
              </label>
              <div class="proof-actions">
                <button class="btn btn-primary btn-small" :disabled="!!ownEditSubmitting[w.id]" @click="saveOwnEditFields(w.id)">Save</button>
              </div>
            </div>
            <!-- Race / Challenge tagging panel -->
            <div v-if="racePanelOpen[w.id]" class="race-info-panel">
              <div class="race-info-body">
                <label class="proof-field race-challenge-row">
                  <span>Weekly challenge tag</span>
                  <select v-model="raceDraft[w.id].weeklyTaskId">
                    <option :value="null">None</option>
                    <option v-for="t in props.weeklyTaskOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
                  </select>
                </label>
                <label class="proof-field race-toggle-check">
                  <input type="checkbox" v-model="raceDraft[w.id].isRace" />
                  <span>🏅 This was a race</span>
                </label>
                <div v-if="raceDraft[w.id].isRace" class="race-result-fields">
                  <label class="proof-field">
                    <span>Race distance (mi)</span>
                    <input type="number" min="0" step="0.01" v-model.number="raceDraft[w.id].raceDistanceMiles" placeholder="e.g. 13.1" />
                  </label>
                  <div class="race-two-col">
                    <label class="proof-field">
                      <span>Chip time (min : sec)</span>
                      <div class="time-input-row-sm">
                        <input type="number" min="0" v-model.number="raceDraft[w.id].raceChipMinutes" placeholder="min" style="width:58px" />
                        <span>:</span>
                        <input type="number" min="0" max="59" v-model.number="raceDraft[w.id].raceChipSeconds" placeholder="sec" style="width:58px" />
                      </div>
                    </label>
                    <label class="proof-field">
                      <span>Overall place</span>
                      <input type="number" min="1" v-model.number="raceDraft[w.id].raceOverallPlace" placeholder="e.g. 42" style="width:80px" />
                    </label>
                  </div>
                </div>
                <div v-if="raceError[w.id]" class="error-inline" style="margin-top:4px;">{{ raceError[w.id] }}</div>
                <div class="proof-actions">
                  <button class="btn btn-primary btn-small" :disabled="!!raceSubmitting[w.id]" @click="saveRaceInfo(w)">
                    {{ raceSubmitting[w.id] ? 'Saving…' : 'Save' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Upload GIF/Image -->
          <div class="more-info-upload-row">
            <label class="upload-btn">
              📎 Attach photo / GIF
              <input type="file" accept=".gif,.png,.jpg,.jpeg,.webp,image/*" @change="onUploadMedia($event, w.id)" />
            </label>
          </div>

          <!-- Manager: Post to Public Club Feed -->
          <div v-if="props.isManager && props.clubId" class="post-to-feed-row">
            <template v-if="!feedPostedIds[w.id]">
              <label class="post-feed-opt">
                <input type="checkbox" v-model="feedIncludeComments[w.id]" />
                Include top comments
              </label>
              <button
                class="btn-post-to-feed"
                :disabled="!!feedPosting[w.id]"
                @click="postToPublicFeed(w)"
              >
                {{ feedPosting[w.id] ? 'Posting…' : '📢 Post to Public Feed' }}
              </button>
            </template>
            <span v-else class="post-feed-done">✓ Shared to club feed</span>
            <span v-if="feedPostError[w.id]" class="post-feed-error">{{ feedPostError[w.id] }}</span>
          </div>

          <div class="activity-time hint">Logged {{ formatTime(w.completed_at || w.created_at) }}</div>
        </div>

        <!-- ── Comments section ──────────────────────────────────────────── -->
        <div v-if="commentsOpen[w.id]" class="comments-box">
          <div v-if="commentsLoading[w.id]" class="hint">Loading comments…</div>
          <div v-else class="comments-list">
            <template v-for="c in topLevelComments(w.id)" :key="`comment-${c.id}`">
              <div class="comment-item">
                <div class="comment-body">
                  <strong>{{ c.first_name }} {{ c.last_name }}</strong>
                  <span v-if="c.comment_text">{{ c.comment_text }}</span>
                  <img v-if="c.icon_url" :src="c.icon_url" class="comment-icon-img" :alt="'icon'" />
                </div>
                <img v-if="c.attachment_url" :src="c.attachment_url" class="comment-attachment-img" @click="openLightbox(c.attachment_url)" />
                <div class="comment-actions">
                  <button class="btn-link" @click="startReply(w.id, c)">Reply</button>
                  <button v-if="Number(c.user_id) === Number(myUserId)" class="btn-link comment-delete" @click="deleteComment(w.id, c.id)">Delete</button>
                </div>
                <form v-if="replyTarget[w.id] === c.id" class="comment-form reply-form" @submit.prevent="submitReply(w.id, c.id)">
                  <input v-model="replyDraftByWorkout[w.id]" type="text" maxlength="300" :placeholder="`Reply to ${c.first_name}…`" autofocus />
                  <button class="btn btn-primary btn-small" type="submit">Reply</button>
                  <button type="button" class="btn btn-ghost btn-small" @click="cancelReply(w.id)">Cancel</button>
                </form>
                <div v-if="repliesFor(w.id, c.id).length" class="replies-list">
                  <div v-for="r in repliesFor(w.id, c.id)" :key="`reply-${r.id}`" class="comment-item comment-item--reply">
                    <div class="comment-body">
                      <strong>{{ r.first_name }} {{ r.last_name }}</strong>
                      <span v-if="r.comment_text">{{ r.comment_text }}</span>
                      <img v-if="r.icon_url" :src="r.icon_url" class="comment-icon-img" :alt="'icon'" />
                    </div>
                    <img v-if="r.attachment_url" :src="r.attachment_url" class="comment-attachment-img" @click="openLightbox(r.attachment_url)" />
                    <div class="comment-actions">
                      <button v-if="Number(r.user_id) === Number(myUserId)" class="btn-link comment-delete" @click="deleteComment(w.id, r.id)">Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <div v-if="!(commentsByWorkout[w.id] || []).length" class="hint">No comments yet.</div>
          </div>

          <!-- Rich comment composer -->
          <div class="comment-composer-wrap">
            <!-- Pending attachment / icon previews -->
            <div v-if="commentAttachByWorkout[w.id] || commentIconByWorkout[w.id]" class="comment-preview-row">
              <div v-if="commentAttachByWorkout[w.id]" class="comment-preview-item">
                <img :src="commentAttachByWorkout[w.id].fileUrl" class="comment-preview-thumb" />
                <button class="comment-preview-remove" @click="commentAttachByWorkout[w.id] = null">✕</button>
              </div>
              <div v-if="commentIconByWorkout[w.id]" class="comment-preview-item">
                <img :src="commentIconByWorkout[w.id].url" class="comment-preview-icon" />
                <button class="comment-preview-remove" @click="commentIconByWorkout[w.id] = null">✕</button>
              </div>
            </div>
            <!-- Inline icon picker -->
            <div v-if="commentIconPickerOpen[w.id]" class="comment-icon-picker" @click.stop>
              <div class="icon-picker-tabs">
                <button type="button" :class="['icon-tab', { active: (commentIconTab[w.id] || 'tenant') === 'tenant' }]" @click="commentIconTab[w.id] = 'tenant'; loadCommentIcons(w.id)">Club Platform</button>
                <button type="button" :class="['icon-tab', { active: commentIconTab[w.id] === 'club' }]" @click="commentIconTab[w.id] = 'club'; loadCommentIcons(w.id)">Club Only</button>
              </div>
              <div v-if="commentIconsLoading[w.id]" class="icon-picker-loading">Loading…</div>
              <div v-else-if="(commentIconsList[w.id] || []).length === 0" class="icon-picker-empty">No comment icons yet. Ask your manager to add some in Icon Library → Comment Icon.</div>
              <div v-else class="icon-picker-grid">
                <button
                  v-for="icon in (commentIconsList[w.id] || [])"
                  :key="`ci-${icon.id}`"
                  type="button"
                  class="icon-pick-btn"
                  :title="icon.name"
                  @click="selectCommentIcon(w.id, icon)"
                >
                  <img :src="icon.url" :alt="icon.name" class="icon-pick-img" />
                </button>
              </div>
            </div>
            <form class="comment-form" @submit.prevent="submitComment(w.id)">
              <input v-model="commentDraftByWorkout[w.id]" type="text" maxlength="300" placeholder="Add a comment…" class="comment-input" />
              <div class="comment-composer-actions">
                <label class="comment-action-btn" title="Attach image or GIF">
                  🖼️
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none" @change="onCommentAttachFile($event, w.id)" />
                </label>
                <button type="button" class="comment-action-btn" title="Add comment icon" @click.stop="toggleCommentIconPicker(w.id)">🏷️</button>
                <button class="btn btn-primary btn-small" type="submit" :disabled="!commentDraftByWorkout[w.id]?.trim() && !commentAttachByWorkout[w.id] && !commentIconByWorkout[w.id]">Post</button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div v-if="!filteredWorkouts.length" class="feed-empty-state">
        <div class="feed-empty-icon">🏃</div>
        <p class="feed-empty-title">
          <template v-if="hasActiveFilters">No workouts match your current filters.</template>
          <template v-else-if="teamFilter === 'my' && myTeamId">No team workouts yet — get moving!</template>
          <template v-else>No activity logged on {{ isToday ? 'today' : formattedDate }} yet.</template>
        </p>
        <p v-if="hasActiveFilters" class="feed-empty-sub">
          <button class="btn-link" @click="clearFilters">Clear filters</button> to see all workouts.
        </p>
        <p v-else class="feed-empty-sub">Workouts, kudos, emoji reactions, comments and photos will show here once members start logging.</p>
      </div>
    </div>
  </section>

  <!-- Screenshot lightbox -->
  <div v-if="lightboxUrl" class="lightbox-overlay" @click.self="closeLightbox">
    <div class="lightbox-box">
      <button class="lightbox-close" @click="closeLightbox">✕</button>
      <img :src="lightboxUrl" alt="Workout screenshot" class="lightbox-img" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import api from '../../services/api';
import UserAvatar from '@/components/common/UserAvatar.vue';
import WorkoutRouteMap from './WorkoutRouteMap.vue';

const props = defineProps({
  workouts: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  challengeId: { type: [String, Number], required: true },
  myUserId: { type: [String, Number], default: null },
  isManager: { type: Boolean, default: false },
  myTeamId: { type: [String, Number], default: null },
  activityTypeOptions: { type: Array, default: () => [] },
  clubId: { type: [String, Number], default: null },
  weeklyTaskOptions: { type: Array, default: () => [] },
});

const TERRAIN_OPTIONS = ['Road', 'Trail', 'Track', 'Beach', 'Treadmill', 'Race', 'Other'];
const emit = defineEmits(['media-uploaded']);

/** Whole season vs workouts from the viewer's team only (kept for backwards compat). */
const feedScope = ref('all');

// ── Date navigation ────────────────────────────────────────────────
const todayStr = () => new Date().toLocaleDateString('en-CA');
const selectedDate = ref(todayStr());
const isToday = computed(() => selectedDate.value === todayStr());
const formattedDate = computed(() => {
  const d = new Date(selectedDate.value + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
});
const shiftDate = (delta) => {
  const d = new Date(selectedDate.value + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  const next = d.toLocaleDateString('en-CA');
  if (next <= todayStr()) selectedDate.value = next;
};
const resetDate = () => { selectedDate.value = todayStr(); };

// ── Team + activity-type filters ───────────────────────────────────
const teamFilter        = ref(null);   // null | 'my' | '<team_id>'
const activityTypeFilter = ref(null);  // null | 'running' | 'rucking' | …

/** Unique teams that appear in the current workouts list (for the filter bar). */
const teamList = computed(() => {
  const seen = new Map();
  for (const w of (props.workouts || [])) {
    if (w.team_id && w.team_name && !seen.has(String(w.team_id))) {
      seen.set(String(w.team_id), { id: w.team_id, name: w.team_name });
    }
  }
  return Array.from(seen.values());
});

const otherTeams = computed(() =>
  teamList.value.filter((t) => !props.myTeamId || Number(t.id) !== Number(props.myTeamId))
);

/** Unique activity types in the current workout list. */
// Canonical aliases: various spellings → one canonical key
const ACTIVITY_ALIAS = {
  run: 'run', running: 'run', jog: 'run', jogging: 'run', virtualrun: 'run', treadmill: 'run',
  ruck: 'ruck', rucking: 'ruck',
  walk: 'walk', walking: 'walk', hike: 'walk', hiking: 'walk',
  cycling: 'cycling', cycle: 'cycling', biking: 'cycling', ride: 'cycling', virtualride: 'cycling',
  steps: 'steps', stair: 'steps', stairclimber: 'steps',
  workout_session: 'workout_session', workout: 'workout_session'
};
const canonicalActivity = (raw) => {
  const k = String(raw || '').toLowerCase().replace(/\s+/g, '_');
  return ACTIVITY_ALIAS[k] || k;
};
const activityLabel = (canonical) => {
  const map = { run: 'Run', ruck: 'Ruck', walk: 'Walk', cycling: 'Cycling', steps: 'Steps', workout_session: 'Workout Session' };
  return map[canonical] || canonical.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const activityTypeList = computed(() => {
  const seen = new Map(); // canonical → display label
  for (const w of (props.workouts || [])) {
    if (!w.activity_type) continue;
    const c = canonicalActivity(w.activity_type);
    if (!seen.has(c)) seen.set(c, activityLabel(c));
  }
  return Array.from(seen.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
});

const hasActiveFilters = computed(
  () => teamFilter.value !== null || activityTypeFilter.value !== null || !isToday.value
);
const clearFilters = () => {
  teamFilter.value = null;
  activityTypeFilter.value = null;
  selectedDate.value = todayStr();
};

const filteredWorkouts = computed(() => {
  let list = props.workouts || [];

  // Date filter — show workouts completed on selectedDate
  list = list.filter((w) => {
    if (!w.completed_at) return false;
    const d = String(w.completed_at).slice(0, 10);
    return d === selectedDate.value;
  });

  // Team filter
  if (teamFilter.value === 'my' && props.myTeamId) {
    list = list.filter((w) => w.team_id != null && Number(w.team_id) === Number(props.myTeamId));
  } else if (teamFilter.value && teamFilter.value !== 'my') {
    list = list.filter((w) => String(w.team_id) === teamFilter.value);
  }

  // Activity type filter (canonical — matches run/running, ruck/rucking, etc.)
  if (activityTypeFilter.value) {
    list = list.filter((w) => canonicalActivity(w.activity_type) === activityTypeFilter.value);
  }

  return list;
});

/** Workouts that a manager still needs to review (pending proof). */
const pendingWorkouts = computed(() =>
  filteredWorkouts.value.filter((w) =>
    Number(w.is_disqualified) !== 1 && (
      w.proof_status === 'pending' ||
      (Number(w.is_treadmill) === 1 && w.proof_status !== 'approved' && w.proof_status !== 'rejected')
    )
  )
);

/** Open the "More info" panel for every pending workout so the manager can review them all at once. */
const expandAllPending = () => {
  const updated = { ...moreInfoOpen.value };
  for (const w of pendingWorkouts.value) {
    updated[w.id] = true;
  }
  moreInfoOpen.value = updated;
};

/** True when at least one workout panel is expanded. */
const anyExpanded = computed(() => Object.values(moreInfoOpen.value).some(Boolean));

/** Close all expanded workout panels. */
const collapseAll = () => { moreInfoOpen.value = {}; };

const commentsOpen    = ref({});
const moreInfoOpen    = ref({});
const replyTarget     = ref({});  // workoutId -> parentCommentId being replied to
const replyDraftByWorkout = ref({});
const commentsLoading = ref({});
const commentsByWorkout = ref({});
const commentDraftByWorkout = ref({});
const proofReviewDraftByWorkout = ref({});

// Comment rich media state
const commentAttachByWorkout    = ref({});  // workoutId -> { filePath, fileUrl }
const commentIconByWorkout      = ref({});  // workoutId -> { id, url, name }
const commentIconPickerOpen     = ref({});  // workoutId -> bool
const commentIconTab            = ref({});  // workoutId -> 'tenant' | 'club'
const commentIconsList          = ref({});  // workoutId -> icon[]
const commentIconsLoading       = ref({});
const proofSubmitting = ref({});
const editOpenByWorkout = ref({});
const editDraftByWorkout = ref({});
const editSubmitting = ref({});
const disqualifyDraftByWorkout = ref({});
const disqualifySubmitting = ref({});

// ── Post to Public Feed (manager) ──────────────────────────────────────────
const feedPosting         = ref({});           // workoutId -> bool
const feedIncludeComments = ref({});           // workoutId -> bool
const feedPostError       = ref({});           // workoutId -> string
const feedPostedIds       = ref({});           // workoutId -> true (if already shared)

// Pre-populate feedPostedIds from the workout list whenever it changes
watch(
  () => props.workouts,
  (list) => {
    for (const w of list || []) {
      if (w.club_feed_post_id) feedPostedIds.value[w.id] = true;
    }
  },
  { immediate: true }
);

const postToPublicFeed = async (w) => {
  if (!props.clubId || feedPosting.value[w.id]) return;
  feedPosting.value  = { ...feedPosting.value,  [w.id]: true };
  feedPostError.value = { ...feedPostError.value, [w.id]: '' };
  try {
    await api.post(`/summit-stats/clubs/${props.clubId}/feed/from-workout`, {
      workoutId: w.id,
      includeComments: feedIncludeComments.value[w.id] === true,
    });
    feedPostedIds.value = { ...feedPostedIds.value, [w.id]: true };
  } catch (e) {
    feedPostError.value = {
      ...feedPostError.value,
      [w.id]: e?.response?.data?.error?.message || 'Failed to post. Try again.',
    };
  } finally {
    feedPosting.value = { ...feedPosting.value, [w.id]: false };
  }
};

// ── Kudos state ────────────────────────────────────────────────────────────
const kudosBudget = ref({ total: 2, used: 0, remaining: 2, intraUsed: 0, intraRemaining: 1, kudoedWorkoutIds: [] });
const kudosCountByWorkout = ref({}); // workoutId -> count
const kudosSubmitting = ref({});

// ── Emoji reactions state ──────────────────────────────────────────────────
const reactionsByWorkout = ref({});  // workoutId -> grouped array
const emojiPickerOpen    = ref({});
const reactionDetailOpen = ref({});
const reactionIcons      = ref([]);  // custom uploaded icons with category=Reactions

const emojiOptions = [
  '👏','🔥','💪','🏆','⚡','🙌','😤','🎯','🥊','💥',
  '🚀','👟','🏃','❤️','🤙','🫡','💯','🤩','😍','👍',
  '😂','🥇','🎉','💎','⭐','🌟','💫','🏅','🥳','😎'
];

const loadReactionIcons = async () => {
  try {
    const r = await api.get('/icons', { params: { subCategory: 'Reactions', limit: 50 }, skipGlobalLoading: true });
    const backendUrl = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || '';
    reactionIcons.value = (r.data?.icons || r.data || []).map((ic) => ({
      id: ic.id,
      ref: `icon:${ic.id}`,
      url: ic.file_path ? `${backendUrl}/uploads/${ic.file_path}` : null,
      name: ic.name || ''
    })).filter((ic) => ic.url);
  } catch { reactionIcons.value = []; }
};

const formatPts = (v) => parseFloat(Number(v || 0).toFixed(2));

const formatActivityType = (t) => {
  if (!t) return '';
  return String(t).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatTime = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatTimestamp = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
};

const avgPace = (w) => {
  const dist = Number(w.distance_value);
  const dur  = Number(w.duration_minutes);
  if (!dist || !dur || dist < 0.1) return null;
  const totalSec = dur * 60 + Number(w.duration_seconds || 0);
  const secPerMile = Math.round(totalSec / dist);
  const mins = Math.floor(secPerMile / 60);
  const secs = String(secPerMile % 60).padStart(2, '0');
  return `${mins}:${secs}`;
};

const formatDuration = (w) => {
  const mins = Number(w.duration_minutes);
  if (!mins && mins !== 0) return null;
  const secs = Number(w.duration_seconds || 0);
  if (secs > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${mins} min`;
};

// Screenshot lightbox
const lightboxUrl = ref(null);
const openScreenshot = (filePath) => {
  lightboxUrl.value = toUploadsUrl(filePath);
};
const closeLightbox = () => { lightboxUrl.value = null; };

// ── Kudos helpers ──────────────────────────────────────────────────────────

const hasGivenKudos = (workoutId) =>
  (kudosBudget.value.kudoedWorkoutIds || []).includes(Number(workoutId));

const kudosCountFor = (workout) =>
  kudosCountByWorkout.value[Number(workout.id)] ?? Number(workout.kudos_count || 0);

const canGiveKudos = (workout) => {
  const wId = Number(workout.id);
  if (Number(workout.user_id) === Number(props.myUserId)) return false; // can't self-kudo
  if (hasGivenKudos(wId)) return true; // can take it back
  if (kudosBudget.value.remaining <= 0) return false;
  // Check intra-team cap
  const sameTeam = props.myTeamId && workout.team_id && Number(workout.team_id) === Number(props.myTeamId);
  if (sameTeam && kudosBudget.value.intraRemaining <= 0) return false;
  return true;
};

const kudosBtnTitle = (workout) => {
  if (Number(workout.user_id) === Number(props.myUserId)) return 'Cannot give kudos to your own workout';
  if (hasGivenKudos(workout.id)) return 'Remove your kudos';
  if (kudosBudget.value.remaining <= 0) return 'No kudos remaining this week (resets Sunday)';
  const sameTeam = props.myTeamId && workout.team_id && Number(workout.team_id) === Number(props.myTeamId);
  if (sameTeam && kudosBudget.value.intraRemaining <= 0) return 'Already gave 1 kudos to your team this week';
  return `Give kudos (${kudosBudget.value.remaining} remaining this week)`;
};

const loadKudosBudget = async () => {
  const id = props.challengeId;
  if (!id) return;
  try {
    const r = await api.get(`/learning-program-classes/${id}/kudos-budget`);
    kudosBudget.value = { ...kudosBudget.value, ...r.data };
  } catch { /* silent */ }
};

const loadWorkoutKudosCount = async (workoutId) => {
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/kudos`);
    kudosCountByWorkout.value = { ...kudosCountByWorkout.value, [Number(workoutId)]: Number(r.data?.count || 0) };
  } catch { /* silent */ }
};

const toggleKudos = async (workout) => {
  const workoutId = Number(workout.id);
  if (kudosSubmitting.value[workoutId]) return;
  kudosSubmitting.value = { ...kudosSubmitting.value, [workoutId]: true };
  try {
    if (hasGivenKudos(workoutId)) {
      await api.delete(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/kudos`);
      kudosBudget.value = {
        ...kudosBudget.value,
        used: Math.max(0, kudosBudget.value.used - 1),
        remaining: Math.min(2, kudosBudget.value.remaining + 1),
        kudoedWorkoutIds: (kudosBudget.value.kudoedWorkoutIds || []).filter((id) => id !== workoutId)
      };
      kudosCountByWorkout.value = { ...kudosCountByWorkout.value, [workoutId]: Math.max(0, (kudosCountByWorkout.value[workoutId] || 1) - 1) };
    } else {
      await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/kudos`);
      kudosBudget.value = {
        ...kudosBudget.value,
        used: kudosBudget.value.used + 1,
        remaining: Math.max(0, kudosBudget.value.remaining - 1),
        kudoedWorkoutIds: [...(kudosBudget.value.kudoedWorkoutIds || []), workoutId]
      };
      // Adjust intra count optimistically
      const sameTeam = props.myTeamId && workout.team_id && Number(workout.team_id) === Number(props.myTeamId);
      if (sameTeam) kudosBudget.value = { ...kudosBudget.value, intraUsed: kudosBudget.value.intraUsed + 1, intraRemaining: Math.max(0, kudosBudget.value.intraRemaining - 1) };
      kudosCountByWorkout.value = { ...kudosCountByWorkout.value, [workoutId]: (kudosCountByWorkout.value[workoutId] || 0) + 1 };
    }
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update kudos');
    await loadKudosBudget();
  } finally {
    kudosSubmitting.value = { ...kudosSubmitting.value, [workoutId]: false };
  }
};

// ── Emoji reaction helpers ────────────────────────────────────────────────

const reactionsFor = (workoutId) => reactionsByWorkout.value[Number(workoutId)] || [];

const totalReactionCount = (workoutId) =>
  reactionsFor(workoutId).reduce((sum, g) => sum + g.count, 0);

const isMyReaction = (workoutId, emoji) => {
  const groups = reactionsFor(workoutId);
  return groups.some((g) => g.emoji === emoji && g.iMine);
};

const toggleEmojiPicker = (workoutId) => {
  const id = Number(workoutId);
  // Close all others
  const newState = {};
  Object.keys(emojiPickerOpen.value).forEach((k) => { newState[k] = false; });
  newState[id] = !emojiPickerOpen.value[id];
  emojiPickerOpen.value = newState;
  // Close detail if open
  reactionDetailOpen.value = { ...reactionDetailOpen.value, [id]: false };
};

const toggleReactionDetail = (workoutId) => {
  const id = Number(workoutId);
  reactionDetailOpen.value = { ...reactionDetailOpen.value, [id]: !reactionDetailOpen.value[id] };
  emojiPickerOpen.value = { ...emojiPickerOpen.value, [id]: false };
};

const loadReactions = async (workoutId) => {
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/reactions`, { skipGlobalLoading: true });
    reactionsByWorkout.value = { ...reactionsByWorkout.value, [Number(workoutId)]: Array.isArray(r.data?.reactions) ? r.data.reactions : [] };
  } catch { /* silent */ }
};

const onReact = async (workoutId, emoji) => {
  const wId = Number(workoutId);
  try {
    await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/reactions`, { emoji });
    await loadReactions(workoutId);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to toggle reaction');
  }
  // Keep picker open after reaction
};

// Close emoji pickers on click outside
const onDocumentClick = () => {
  emojiPickerOpen.value = {};
  commentIconPickerOpen.value = {};
};

const activityColor = (type) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('run')) return '#ff7043';
  if (t.includes('cycl')) return '#42a5f5';
  if (t.includes('walk') || t.includes('step')) return '#66bb6a';
  if (t.includes('swim')) return '#26c6da';
  if (t.includes('lift') || t.includes('workout')) return '#ab47bc';
  return '#90a4ae';
};

const toUploadsUrl = (filePath) => {
  const path = String(filePath || '').replace(/^\/+/, '');
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `/uploads/${path}`;
};

const loadComments = async (workoutId) => {
  commentsLoading.value = { ...commentsLoading.value, [workoutId]: true };
  try {
    const r = await api.get(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/comments`, { skipGlobalLoading: true });
    commentsByWorkout.value = { ...commentsByWorkout.value, [workoutId]: Array.isArray(r.data?.comments) ? r.data.comments : [] };
  } catch {
    commentsByWorkout.value = { ...commentsByWorkout.value, [workoutId]: [] };
  } finally {
    commentsLoading.value = { ...commentsLoading.value, [workoutId]: false };
  }
};

const toggleComments = async (workoutId) => {
  const open = !!commentsOpen.value[workoutId];
  commentsOpen.value = { ...commentsOpen.value, [workoutId]: !open };
  if (!open) await loadComments(workoutId);
};

const topLevelComments = (workoutId) =>
  (commentsByWorkout.value[workoutId] || []).filter((c) => !c.parent_comment_id);

const repliesFor = (workoutId, parentId) =>
  (commentsByWorkout.value[workoutId] || []).filter((c) => Number(c.parent_comment_id) === Number(parentId));

const startReply = (workoutId, comment) => {
  replyTarget.value = { ...replyTarget.value, [workoutId]: comment.id };
  replyDraftByWorkout.value = { ...replyDraftByWorkout.value, [workoutId]: `@${comment.first_name} ` };
};
const cancelReply = (workoutId) => {
  replyTarget.value = { ...replyTarget.value, [workoutId]: null };
  replyDraftByWorkout.value = { ...replyDraftByWorkout.value, [workoutId]: '' };
};
const submitReply = async (workoutId, parentCommentId) => {
  const text = String(replyDraftByWorkout.value[workoutId] || '').trim();
  if (!text) return;
  await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/comments`, {
    commentText: text,
    parentCommentId
  });
  cancelReply(workoutId);
  await loadComments(workoutId);
};
const submitComment = async (workoutId) => {
  const text = String(commentDraftByWorkout.value[workoutId] || '').trim();
  const attach = commentAttachByWorkout.value[workoutId] || null;
  const icon   = commentIconByWorkout.value[workoutId]   || null;
  if (!text && !attach && !icon) return;
  await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/comments`, {
    commentText: text || '',
    attachmentPath: attach?.filePath || null,
    iconId: icon?.id || null
  });
  commentDraftByWorkout.value     = { ...commentDraftByWorkout.value, [workoutId]: '' };
  commentAttachByWorkout.value    = { ...commentAttachByWorkout.value, [workoutId]: null };
  commentIconByWorkout.value      = { ...commentIconByWorkout.value, [workoutId]: null };
  commentIconPickerOpen.value     = { ...commentIconPickerOpen.value, [workoutId]: false };
  await loadComments(workoutId);
};

// Comment image/GIF upload
const onCommentAttachFile = async (e, workoutId) => {
  const file = e.target?.files?.[0];
  if (!file) return;
  e.target.value = '';
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await api.post(
      `/learning-program-classes/${props.challengeId}/workouts/${workoutId}/comment-attachment`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    if (data.filePath) {
      commentAttachByWorkout.value = { ...commentAttachByWorkout.value, [workoutId]: { filePath: data.filePath, fileUrl: data.fileUrl } };
    }
  } catch { /* silent */ }
};

// Comment icon picker
const toggleCommentIconPicker = (workoutId) => {
  const isOpen = commentIconPickerOpen.value[workoutId];
  commentIconPickerOpen.value = { ...commentIconPickerOpen.value, [workoutId]: !isOpen };
  if (!isOpen) loadCommentIcons(workoutId);
};

const loadCommentIcons = async (workoutId) => {
  commentIconsLoading.value = { ...commentIconsLoading.value, [workoutId]: true };
  try {
    const tab = commentIconTab.value[workoutId] || 'tenant';
    let icons = [];
    if (tab === 'club' && props.challengeId) {
      // Fetch club-specific icons via the club icons endpoint
      const r = await api.get(`/summit-stats/clubs/${props.challengeId}/icons`, {
        params: { subCategory: 'commenticon', limit: 60 },
        skipGlobalLoading: true
      });
      icons = Array.isArray(r.data?.icons) ? r.data.icons : [];
    } else {
      const r = await api.get('/icons', {
        params: { subCategory: 'commenticon', limit: 60 },
        skipGlobalLoading: true
      });
      icons = Array.isArray(r.data?.icons) ? r.data.icons : [];
    }
    const baseUrl = icons[0]?.url ? '' : (window.__BACKEND_URL__ || '');
    commentIconsList.value = {
      ...commentIconsList.value,
      [workoutId]: icons.map((ic) => ({
        id: ic.id,
        name: ic.name || '',
        url: ic.url || (ic.file_path ? `${baseUrl}/uploads/${String(ic.file_path).replace(/^uploads\//, '')}` : '')
      }))
    };
  } catch {
    commentIconsList.value = { ...commentIconsList.value, [workoutId]: [] };
  } finally {
    commentIconsLoading.value = { ...commentIconsLoading.value, [workoutId]: false };
  }
};

const selectCommentIcon = (workoutId, icon) => {
  commentIconByWorkout.value   = { ...commentIconByWorkout.value, [workoutId]: icon };
  commentIconPickerOpen.value  = { ...commentIconPickerOpen.value, [workoutId]: false };
};

const deleteComment = async (workoutId, commentId) => {
  await api.delete(`/learning-program-classes/${props.challengeId}/workout-comments/${commentId}`);
  await loadComments(workoutId);
};

const onUploadMedia = async (event, workoutId) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  await api.post(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/media`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  event.target.value = '';
  emit('media-uploaded');
};

const ensureProofDraft = (workoutId, workout) => {
  if (proofReviewDraftByWorkout.value[workoutId]) return;
  proofReviewDraftByWorkout.value = {
    ...proofReviewDraftByWorkout.value,
    [workoutId]: {
      // Start null — only becomes non-null if the manager explicitly edits it.
      // This prevents "Approved with edits" from firing when nothing changed.
      verifiedDistanceValue: null,
      overridePoints: null,
      proofReviewNote: workout?.proof_review_note || ''
    }
  };
};

const canEditOwnImportedTreadmill = (workout) => {
  return Number(workout?.user_id) === Number(props.myUserId)
    && Number(workout?.is_treadmill) === 1
    && !!workout?.strava_activity_id;
};

// Any Strava import by this user can have challenge + treadmill proof attached
const canEditStravaDetails = (workout) =>
  Number(workout?.user_id) === Number(props.myUserId) && !!workout?.strava_activity_id;

const stravaEditOpenByWorkout = ref({});
const stravaEditDraftByWorkout = ref({});
const stravaEditSubmitting = ref({});
const stravaWeeklyTasksCache = ref({});  // classId -> [{id,name}]

const ensureStravaEditDraft = (workoutId, workout) => {
  if (stravaEditDraftByWorkout.value[workoutId]) return;
  stravaEditDraftByWorkout.value = {
    ...stravaEditDraftByWorkout.value,
    [workoutId]: {
      weeklyTaskId: workout?.weekly_task_id || null,
      isTreadmill: Number(workout?.is_treadmill) === 1,
      distanceValue: workout?.distance_value != null ? Number(workout.distance_value) : null,
      treadmillProofFile: null
    }
  };
};

const toggleStravaEdit = async (workout) => {
  const workoutId = Number(workout?.id);
  if (!workoutId) return;
  ensureStravaEditDraft(workoutId, workout);
  stravaEditOpenByWorkout.value = { ...stravaEditOpenByWorkout.value, [workoutId]: !stravaEditOpenByWorkout.value[workoutId] };
  // Fetch weekly tasks for this season if not already cached
  const cid = Number(props.challengeId);
  if (!stravaWeeklyTasksCache.value[cid]) {
    try {
      const resp = await api.get(`/learning-program-classes/${cid}/weekly-tasks`);
      stravaWeeklyTasksCache.value = { ...stravaWeeklyTasksCache.value, [cid]: resp.data?.tasks || [] };
    } catch { /* silently ignore */ }
  }
};

const onStravaProofFileChange = (event, workoutId) => {
  const file = event.target.files?.[0] || null;
  stravaEditDraftByWorkout.value = {
    ...stravaEditDraftByWorkout.value,
    [workoutId]: { ...stravaEditDraftByWorkout.value[workoutId], treadmillProofFile: file }
  };
};

const saveStravaEdit = async (workoutId) => {
  const draft = stravaEditDraftByWorkout.value[workoutId];
  if (!draft) return;
  stravaEditSubmitting.value = { ...stravaEditSubmitting.value, [workoutId]: true };
  try {
    const formData = new FormData();
    if (draft.weeklyTaskId != null) formData.append('weeklyTaskId', String(draft.weeklyTaskId));
    formData.append('isTreadmill', draft.isTreadmill ? 'true' : 'false');
    if (draft.isTreadmill && draft.distanceValue != null) formData.append('distanceValue', String(draft.distanceValue));
    if (draft.treadmillProofFile) formData.append('treadmillProof', draft.treadmillProofFile);
    await api.patch(
      `/learning-program-classes/${props.challengeId}/workouts/${workoutId}/strava-details`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    stravaEditOpenByWorkout.value = { ...stravaEditOpenByWorkout.value, [workoutId]: false };
    emit('media-uploaded');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save Strava workout details');
  } finally {
    stravaEditSubmitting.value = { ...stravaEditSubmitting.value, [workoutId]: false };
  }
};

// ── Own workout field edit (activity type, terrain, notes) ──────────────────
const ownEditOpenByWorkout = ref({});
const ownEditDraftByWorkout = ref({});
const ownEditSubmitting = ref({});

const canEditOwnFields = (workout) =>
  Number(workout?.user_id) === Number(props.myUserId);

const ensureOwnEditDraft = (workoutId, workout) => {
  if (ownEditDraftByWorkout.value[workoutId]) return;
  ownEditDraftByWorkout.value = {
    ...ownEditDraftByWorkout.value,
    [workoutId]: {
      activityType: workout?.activity_type || '',
      terrain: workout?.terrain || '',
      workoutNotes: workout?.workout_notes || '',
      proofFile: null
    }
  };
};

const toggleOwnEdit = (workout) => {
  const workoutId = Number(workout?.id);
  if (!workoutId) return;
  ensureOwnEditDraft(workoutId, workout);
  ownEditOpenByWorkout.value = { ...ownEditOpenByWorkout.value, [workoutId]: !ownEditOpenByWorkout.value[workoutId] };
};

const onOwnEditProofFile = (event, workoutId) => {
  const file = event.target.files?.[0] || null;
  ownEditDraftByWorkout.value = {
    ...ownEditDraftByWorkout.value,
    [workoutId]: { ...ownEditDraftByWorkout.value[workoutId], proofFile: file }
  };
};

const saveOwnEditFields = async (workoutId) => {
  const draft = ownEditDraftByWorkout.value[workoutId];
  if (!draft) return;
  ownEditSubmitting.value = { ...ownEditSubmitting.value, [workoutId]: true };
  try {
    const formData = new FormData();
    if (draft.activityType) formData.append('activityType', draft.activityType);
    formData.append('terrain', draft.terrain || '');
    formData.append('workoutNotes', draft.workoutNotes || '');
    if (draft.proofFile) formData.append('treadmillProof', draft.proofFile);
    await api.patch(
      `/learning-program-classes/${props.challengeId}/workouts/${workoutId}/own-fields`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    ownEditOpenByWorkout.value = { ...ownEditOpenByWorkout.value, [workoutId]: false };
    emit('media-uploaded');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save edits');
  } finally {
    ownEditSubmitting.value = { ...ownEditSubmitting.value, [workoutId]: false };
  }
};

// ── Race / Challenge tagging panel ─────────────────────────────────
const racePanelOpen = ref({});
const raceDraft = ref({});
const raceSubmitting = ref({});
const raceError = ref({});

const ensureRaceDraft = (workout) => {
  const id = Number(workout?.id);
  if (raceDraft.value[id]) return;
  raceDraft.value = {
    ...raceDraft.value,
    [id]: {
      isRace: Number(workout.is_race) === 1,
      raceDistanceMiles: workout.race_distance_miles != null ? Number(workout.race_distance_miles) : null,
      raceChipMinutes: workout.race_chip_time_seconds != null ? Math.floor(Number(workout.race_chip_time_seconds) / 60) : null,
      raceChipSeconds: workout.race_chip_time_seconds != null ? Number(workout.race_chip_time_seconds) % 60 : null,
      raceOverallPlace: workout.race_overall_place != null ? Number(workout.race_overall_place) : null,
      weeklyTaskId: workout.weekly_task_id ? Number(workout.weekly_task_id) : null
    }
  };
};

const toggleRacePanel = (workout) => {
  const id = Number(workout?.id);
  ensureRaceDraft(workout);
  racePanelOpen.value = { ...racePanelOpen.value, [id]: !racePanelOpen.value[id] };
};

const saveRaceInfo = async (workout) => {
  const id = Number(workout?.id);
  const draft = raceDraft.value[id];
  if (!draft) return;
  raceSubmitting.value = { ...raceSubmitting.value, [id]: true };
  raceError.value = { ...raceError.value, [id]: null };
  try {
    const chipTimeSec = draft.isRace
      ? ((Number(draft.raceChipMinutes) || 0) * 60 + (Number(draft.raceChipSeconds) || 0)) || null
      : null;
    await api.patch(
      `/learning-program-classes/${props.challengeId}/workouts/${id}/race-info`,
      {
        isRace: draft.isRace,
        raceDistanceMiles: draft.isRace ? (draft.raceDistanceMiles || null) : null,
        raceChipTimeSeconds: chipTimeSec,
        raceOverallPlace: draft.isRace ? (draft.raceOverallPlace || null) : null,
        weeklyTaskId: draft.weeklyTaskId || null
      }
    );
    racePanelOpen.value = { ...racePanelOpen.value, [id]: false };
    emit('media-uploaded');
  } catch (e) {
    raceError.value = { ...raceError.value, [id]: e?.response?.data?.error?.message || 'Failed to save' };
  } finally {
    raceSubmitting.value = { ...raceSubmitting.value, [id]: false };
  }
};

const ensureEditDraft = (workoutId, workout) => {
  if (editDraftByWorkout.value[workoutId]) return;
  editDraftByWorkout.value = {
    ...editDraftByWorkout.value,
    [workoutId]: {
      distanceValue: workout?.distance_value != null ? Number(workout.distance_value) : null,
      screenshotFilePath: workout?.screenshot_file_path || '',
      workoutNotes: workout?.workout_notes || ''
    }
  };
};

const toggleEditImportedWorkout = (workout) => {
  const workoutId = Number(workout?.id);
  if (!workoutId) return;
  ensureEditDraft(workoutId, workout);
  editOpenByWorkout.value = { ...editOpenByWorkout.value, [workoutId]: !editOpenByWorkout.value[workoutId] };
};

const saveEditImportedWorkout = async (workoutId) => {
  const draft = editDraftByWorkout.value[workoutId];
  if (!draft) return;
  const distanceValue = Number(draft.distanceValue);
  if (!Number.isFinite(distanceValue) || distanceValue < 0) {
    alert('Please enter a valid corrected distance.');
    return;
  }
  editSubmitting.value = { ...editSubmitting.value, [workoutId]: true };
  try {
    await api.put(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/import-edit`, {
      distanceValue,
      screenshotFilePath: draft.screenshotFilePath || null,
      workoutNotes: draft.workoutNotes || null
    });
    editOpenByWorkout.value = { ...editOpenByWorkout.value, [workoutId]: false };
    emit('media-uploaded');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save workout edit');
  } finally {
    editSubmitting.value = { ...editSubmitting.value, [workoutId]: false };
  }
};

const setWorkoutDisqualification = async (workoutId, isDisqualified) => {
  disqualifySubmitting.value = { ...disqualifySubmitting.value, [workoutId]: true };
  try {
    await api.put(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/disqualify`, {
      isDisqualified,
      reason: isDisqualified ? (disqualifyDraftByWorkout.value[workoutId] || null) : null
    });
    emit('media-uploaded');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update workout status');
  } finally {
    disqualifySubmitting.value = { ...disqualifySubmitting.value, [workoutId]: false };
  }
};

watch(
  () => props.workouts,
  (list) => {
    for (const w of list || []) {
      ensureProofDraft(w.id, w);
      ensureEditDraft(w.id, w);
      if (!Object.prototype.hasOwnProperty.call(disqualifyDraftByWorkout.value, w.id)) {
        disqualifyDraftByWorkout.value = {
          ...disqualifyDraftByWorkout.value,
          [w.id]: w.disqualification_reason || ''
        };
      }
      // Initialize kudos count from feed data
      if (kudosCountByWorkout.value[Number(w.id)] === undefined) {
        kudosCountByWorkout.value[Number(w.id)] = Number(w.kudos_count || 0);
      }
      // Lazy-load reactions for visible workouts
      if (reactionsByWorkout.value[Number(w.id)] === undefined) {
        reactionsByWorkout.value[Number(w.id)] = w.reactions || [];
        loadReactions(w.id);
      }
    }
  },
  { immediate: true, deep: true }
);

onMounted(async () => {
  await Promise.all([loadKudosBudget(), loadReactionIcons()]);
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});

// ── Mile splits ─────────────────────────────────────────────────────────────
const splitsOpen = ref({});
const toggleSplits = (id) => { splitsOpen.value = { ...splitsOpen.value, [id]: !splitsOpen.value[id] }; };

const parsedSplits = (w) => {
  if (!w?.splits_json) return [];
  try {
    const arr = typeof w.splits_json === 'string' ? JSON.parse(w.splits_json) : w.splits_json;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};

const formatSplitPace = (s) => {
  const sec = s.movingTimeSec || s.elapsedTimeSec;
  const dist = s.distanceMeters;
  if (!sec || !dist) return '—';
  const miles = dist / 1609.34;
  const paceSecPerMile = sec / miles;
  const m = Math.floor(paceSecPerMile / 60);
  const ss = Math.round(paceSecPerMile % 60);
  return `${m}:${String(ss).padStart(2, '0')}/mi`;
};

const reviewProof = async (workoutId, status) => {
  const workout = (props.workouts || []).find((w) => Number(w.id) === Number(workoutId));
  ensureProofDraft(workoutId, workout);
  const draft = proofReviewDraftByWorkout.value[workoutId] || {};
  proofSubmitting.value = { ...proofSubmitting.value, [workoutId]: true };
  try {
    await api.put(`/learning-program-classes/${props.challengeId}/workouts/${workoutId}/proof-review`, {
      proofStatus: status,
      verifiedDistanceValue: draft.verifiedDistanceValue != null ? Number(draft.verifiedDistanceValue) : null,
      overridePoints: draft.overridePoints != null && String(draft.overridePoints) !== '' ? Number(draft.overridePoints) : null,
      proofReviewNote: draft.proofReviewNote ? String(draft.proofReviewNote).trim() : null
    });
    emit('media-uploaded');
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update proof review');
  } finally {
    proofSubmitting.value = { ...proofSubmitting.value, [workoutId]: false };
  }
};
</script>

<style scoped>
.challenge-activity-feed {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 10px;
  padding: 20px;
  background: #fff;
}
.activity-feed-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #f1f5f9;
}

.challenge-activity-feed h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.feed-scope-tabs {
  display: inline-flex;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  background: #f8fafc;
}

.feed-scope-tab {
  border: none;
  background: transparent;
  padding: 8px 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}

.feed-scope-tab:hover {
  background: #f1f5f9;
}

.feed-scope-tab.active {
  background: #fff;
  color: #0f172a;
  box-shadow: inset 0 -2px 0 #2563eb;
}
/* ── Date navigator ────────────────────────────────────────────── */
.feed-date-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}
.date-nav-btn {
  width: 28px;
  height: 28px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 6px;
  font-size: 16px;
  color: #475569;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  line-height: 1;
}
.date-nav-btn:hover:not(:disabled) { background: #f1f5f9; }
.date-nav-btn:disabled { opacity: 0.35; cursor: default; }
.date-nav-today {
  padding: 4px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.date-nav-today--active {
  border-color: #2563eb;
  color: #2563eb;
  background: #eff6ff;
}

/* ── Filter bar ────────────────────────────────────────────────── */
.feed-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filter-pill {
  padding: 4px 12px;
  border-radius: 20px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.filter-pill:hover { background: #f1f5f9; border-color: #94a3b8; }
.filter-pill.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.filter-pill--type.active {
  background: #dc2626;
  border-color: #dc2626;
}
.filter-clear-btn {
  padding: 4px 10px;
  border-radius: 20px;
  border: none;
  background: transparent;
  font-size: 0.78rem;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
}
.filter-clear-btn:hover { color: #475569; }

/* ── Manager pending-review toolbar ────────────────────────────── */
.manager-review-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
}
.manager-review-bar--idle {
  background: #f0fdf4;
  border-color: #bbf7d0;
}
.manager-bar-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.pending-count-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88em;
  font-weight: 600;
  color: #92400e;
}
.manager-review-bar--idle .pending-count-label { color: #166534; }
.pending-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f59e0b;
  flex-shrink: 0;
  animation: pulse-dot 1.5s ease-in-out infinite;
}
.pending-dot--ok {
  background: #22c55e;
  animation: none;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.75); }
}
.btn-expand-pending,
.btn-collapse-all {
  border: 1px solid #f59e0b;
  background: #fff;
  color: #92400e;
  border-radius: 8px;
  padding: 5px 14px;
  font-size: 0.82em;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.btn-collapse-all {
  border-color: #94a3b8;
  color: #475569;
}
.btn-expand-pending:hover { background: #fef3c7; }
.btn-collapse-all:hover { background: #f1f5f9; }

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 640px;
  overflow-y: auto;
  padding-right: 4px;
  scroll-behavior: smooth;
}
.btn-outline {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #475569;
  border-radius: 8px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 0.85em;
}
.btn-outline:hover { background: #f1f5f9; border-color: #94a3b8; }
.activity-card {
  padding: 12px 16px;
  border: 1px solid #e8edf3;
  border-left: 5px solid #90a4ae;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
  transition: box-shadow 0.15s;
}
.activity-card:hover {
  box-shadow: 0 3px 10px rgba(0,0,0,0.09);
}
.activity-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.activity-user-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.activity-user {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.activity-timestamp {
  font-size: 0.78em;
  color: var(--text-muted, #888);
  margin-top: 1px;
}
.activity-badges {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.activity-type {
  text-transform: capitalize;
  font-size: 0.85em;
  color: var(--text-muted, #666);
  background: #f1f5f9;
  border-radius: 12px;
  padding: 2px 8px;
}
.terrain-badge {
  font-size: 0.78em;
  border-radius: 12px;
  padding: 2px 7px;
  background: #e0f2fe;
  color: #0369a1;
}
.terrain-trail   { background: #dcfce7; color: #15803d; }
.terrain-track   { background: #fef9c3; color: #854d0e; }
.terrain-treadmill { background: #f3e8ff; color: #7e22ce; }
.terrain-race    { background: #fee2e2; color: #b91c1c; }
.terrain-other   { background: #f1f5f9; color: #64748b; }
.race-badge {
  font-size: 0.78em;
  background: #fef3c7;
  color: #92400e;
  border-radius: 12px;
  padding: 2px 7px;
}
.activity-meta {
  margin-top: 4px;
  font-size: 0.88em;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.activity-pace {
  color: #0369a1;
  font-weight: 500;
}
.activity-points {
  margin-left: auto;
  font-weight: 600;
  color: #1d4ed8;
}
.activity-points--edited { color: #b45309; }
/* Screenshot proof */
.screenshot-proof {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.screenshot-thumb {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: opacity 0.2s;
}
.screenshot-thumb:hover { opacity: 0.8; }
.screenshot-label {
  font-size: 0.78em;
  color: #64748b;
}
/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lightbox-box {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}
.lightbox-img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
}
.lightbox-close {
  position: absolute;
  top: -36px;
  right: 0;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 1.5em;
  cursor: pointer;
}
.activity-notes {
  margin-top: 6px;
  font-size: 0.9em;
  line-height: 1.5;
}
.proof-status-badge-row, .proof-badge-row { margin-top: 6px; }
.proof-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 10px;
}
.proof-badge--approved      { background: #e8f5e9; color: #2e7d32; }
.proof-badge--approved-edit { background: #fef9c3; color: #78350f; border: 1px solid #fde68a; }
.proof-badge--pending       { background: #fff8e1; color: #7c5f00; }
.proof-badge--rejected      { background: #ffebee; color: #c62828; }
.splits-section { margin-top: 8px; }
.splits-toggle {
  background: none;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 0.78rem;
  color: #555;
  cursor: pointer;
}
.splits-toggle:hover { background: #f5f5f5; }
.splits-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
  font-size: 0.8rem;
}
.splits-table th, .splits-table td {
  text-align: left;
  padding: 3px 8px;
  border-bottom: 1px solid #eee;
}
.splits-table th { color: #888; font-weight: 600; }
.splits-table tr:last-child td { border-bottom: none; }
.strava-metrics-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.strava-metric {
  font-size: 11px;
  font-weight: 500;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 2px 8px;
  white-space: nowrap;
}
.strava-metric--est {
  color: #64748b;
  font-style: italic;
}
.cal-source-tag {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: #fc4c02;
  color: white;
  border-radius: 3px;
  padding: 0px 4px;
  margin-left: 3px;
  vertical-align: middle;
  line-height: 1.6;
}
.cal-source-tag--est {
  background: #94a3b8;
}
.strava-source-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}
.strava-logo-s-sm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: #fc4c02;
  color: #fff;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
}
.activity-time {
  margin-top: 4px;
  font-size: 0.85em;
}
.activity-media {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.media-item {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  transition: opacity 0.15s;
}
.media-item:hover { opacity: 0.88; }
/* ── Inline tags row (challenge + proof status) ────────────────── */
.activity-inline-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
  min-height: 0;
}
.tag-chip {
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 999px;
  padding: 2px 9px;
  white-space: nowrap;
}
.tag-chip--challenge {
  background: #ede9fe;
  color: #5b21b6;
}

/* ── Engagement divider & action links ─────────────────────────── */
.engagement-divider {
  width: 1px;
  height: 18px;
  background: #e2e8f0;
  margin: 0 2px;
  flex-shrink: 0;
}
.card-action-link {
  background: none;
  border: none;
  color: #6366f1;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  white-space: nowrap;
}
.card-action-link:hover { background: #f0f0ff; }

/* ── More info expandable panel ────────────────────────────────── */
.more-info-panel {
  margin-top: 8px;
  padding: 10px 10px 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.more-info-upload-row {
  margin-top: 4px;
}

/* ── Post to Public Feed ──────────────────────────────────────── */
.post-to-feed-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
}
.post-feed-opt {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #0369a1;
  cursor: pointer;
  white-space: nowrap;
}
.btn-post-to-feed {
  padding: 5px 14px;
  border-radius: 20px;
  border: none;
  background: linear-gradient(135deg, #0369a1, #0ea5e9);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.btn-post-to-feed:disabled { opacity: 0.55; cursor: default; }
.btn-post-to-feed:not(:disabled):hover { opacity: 0.88; }
.post-feed-done {
  font-size: 0.8rem;
  font-weight: 700;
  color: #16a34a;
}
.post-feed-error {
  font-size: 0.78rem;
  color: #dc2626;
  width: 100%;
}
.upload-btn {
  border: 1px dashed #bbb;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 0.78rem;
  cursor: pointer;
}
.upload-btn input {
  display: none;
}
.comments-box {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fff;
}
.proof-review-card {
  margin-top: 8px;
  border: 1px solid #e6e2ff;
  border-radius: 8px;
  background: #faf9ff;
  padding: 8px;
}
.proof-review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.own-edit-header-row { flex-wrap: wrap; }
.own-edit-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.btn-race {
  background: #fff8e1;
  border: 1px solid #f0cc70;
  color: #7a5c00;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-race:hover { background: #fde68a; }
.race-info-panel {
  margin-top: 8px;
  padding: 10px 12px;
  background: #fff8e1;
  border: 1px solid #f0cc70;
  border-radius: 8px;
}
.race-info-body { display: flex; flex-direction: column; gap: 8px; }
.race-challenge-row select { width: 100%; }
.race-toggle-check { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 600; }
.race-result-fields { display: flex; flex-direction: column; gap: 8px; }
.race-two-col { display: flex; gap: 12px; flex-wrap: wrap; }
.time-input-row-sm { display: flex; align-items: center; gap: 4px; }
.time-input-row-sm input { padding: 5px 6px; border: 1px solid #ccc; border-radius: 4px; }
.proof-status {
  font-size: 0.75rem;
  border-radius: 999px;
  padding: 2px 8px;
  text-transform: capitalize;
}
.proof-approved { background: #e8f5e9; color: #2e7d32; }
.proof-pending { background: #fff8e1; color: #8d6e63; }
.proof-rejected { background: #ffebee; color: #c62828; }
.proof-not_required { background: #eceff1; color: #546e7a; }
.proof-review-header--approved {
  background: #e8f5e9;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.85rem;
  color: #2e7d32;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.btn-link-sm {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.8rem;
  color: #888;
  cursor: pointer;
  text-decoration: underline;
}
.proof-review-body {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}
.proof-field {
  display: grid;
  gap: 4px;
  font-size: 0.82rem;
}
.proof-field--inline {
  display: flex;
  align-items: center;
  gap: 6px;
}
.required-star { color: #e53935; }
.proof-field--inline input[type="checkbox"] { width: auto; }
.proof-field input, .proof-field select {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
}
.proof-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.disqualified-banner {
  margin-top: 8px;
  border-radius: 6px;
  background: #ffebee;
  color: #b71c1c;
  border: 1px solid #ffcdd2;
  padding: 6px 8px;
  font-size: 0.85rem;
}
.comments-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.comment-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
  border-bottom: 1px solid #f1f5f9;
}
.comment-item:last-child { border-bottom: none; }
.comment-body { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.comment-actions { display: flex; gap: 10px; }
.comment-item--reply {
  margin-left: 20px;
  padding: 4px 8px;
  background: #f8fafc;
  border-left: 2px solid #cbd5e1;
  border-radius: 0 4px 4px 0;
}
.replies-list { display: flex; flex-direction: column; gap: 0; margin-top: 4px; }
.reply-form { margin-top: 4px; }
/* Rich comment composer */
.comment-composer-wrap { margin-top: 10px; position: relative; }

.comment-preview-row {
  display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;
}
.comment-preview-item { position: relative; display: inline-block; }
.comment-preview-thumb {
  width: 72px; height: 72px; object-fit: cover;
  border-radius: 8px; border: 1px solid #e2e8f0; display: block;
}
.comment-preview-icon {
  width: 48px; height: 48px; object-fit: contain;
  border-radius: 8px; border: 1px solid #e2e8f0; display: block; background: #f8fafc;
}
.comment-preview-remove {
  position: absolute; top: -6px; right: -6px;
  background: #ef4444; color: #fff; border: none; border-radius: 50%;
  width: 18px; height: 18px; font-size: 0.65em; cursor: pointer; line-height: 18px; text-align: center;
}

.comment-form {
  display: flex; gap: 6px; align-items: center;
  border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 4px 6px;
  background: #fff;
}
.comment-input {
  flex: 1; min-width: 0; border: none; outline: none;
  font-size: 0.88em; padding: 4px 4px; background: transparent;
}
.comment-composer-actions { display: flex; gap: 4px; align-items: center; flex-shrink: 0; }
.comment-action-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: 1.1em; padding: 2px 4px; border-radius: 6px; color: #64748b; line-height: 1;
}
.comment-action-btn:hover { background: #f1f5f9; }

/* Inline icon picker */
.comment-icon-picker {
  position: absolute; bottom: calc(100% + 6px); left: 0; right: 0;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 200; overflow: hidden;
}
.icon-picker-tabs {
  display: flex; border-bottom: 1px solid #f1f5f9;
}
.icon-tab {
  flex: 1; padding: 8px; font-size: 0.8em; font-weight: 600;
  border: none; background: transparent; cursor: pointer; color: #64748b;
  border-bottom: 2px solid transparent; transition: all 0.15s;
}
.icon-tab.active { color: #e63946; border-bottom-color: #e63946; background: #fff9f9; }
.icon-picker-loading, .icon-picker-empty {
  padding: 16px; color: #94a3b8; font-size: 0.85em; text-align: center;
}
.icon-picker-grid {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 10px;
  max-height: 180px; overflow-y: auto;
}
.icon-pick-btn {
  border: 1.5px solid #f1f5f9; background: #f8fafc; border-radius: 8px;
  padding: 4px; cursor: pointer; transition: all 0.12s;
}
.icon-pick-btn:hover { border-color: #e63946; background: #fff9f9; transform: scale(1.08); }
.icon-pick-img { width: 36px; height: 36px; object-fit: contain; display: block; }

/* Comment display: attached image and icon */
.comment-icon-img {
  width: 32px; height: 32px; object-fit: contain; vertical-align: middle;
  border-radius: 4px; margin-left: 4px;
}
.comment-attachment-img {
  max-width: 200px; max-height: 160px; object-fit: cover;
  border-radius: 8px; border: 1px solid #e2e8f0; cursor: pointer;
  display: block; margin-top: 4px;
}

.reply-form { margin-top: 4px; border: none; background: transparent; border-radius: 0; padding: 0; }
.reply-form .comment-input { padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; background: #fff; }

.btn-link {
  background: none; border: none;
  color: #6d5efc; cursor: pointer; font-size: 0.8rem;
}
.comment-delete { color: #c62828; }
.empty-hint,
.loading-inline {
  padding: 12px;
  color: var(--text-muted, #666);
}
.feed-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 24px;
  gap: 10px;
}
.feed-empty-icon {
  font-size: 3rem;
  line-height: 1;
}
.feed-empty-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: #1e293b;
}
.feed-empty-sub {
  margin: 0;
  font-size: 0.88rem;
  color: #64748b;
  max-width: 380px;
}

/* ── Kudos + Emoji Reactions ─────────────────────────────────────────────── */
.workout-engagement-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}

/* Kudos button */
.kudos-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1.5px solid #e2e8f0;
  background: #f8fafc;
  cursor: pointer;
  font-size: 0.82em;
  color: #475569;
  transition: all 0.15s;
  line-height: 1;
}
.kudos-btn:hover:not(:disabled) {
  border-color: #f97316;
  background: #fff7ed;
  color: #ea580c;
}
.kudos-btn.kudos-given {
  border-color: #f97316;
  background: #fff7ed;
  color: #ea580c;
  font-weight: 600;
}
.kudos-btn.kudos-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.kudos-icon { font-size: 1em; }
.kudos-count { font-weight: 700; min-width: 12px; }
.kudos-label { color: inherit; }

/* Emoji reaction overlapping pills */
.reactions-display {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 3px 8px 3px 4px;
  border-radius: 20px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  transition: background 0.15s;
}
.reactions-display:hover { background: #e2e8f0; }
.reaction-pill {
  font-size: 1.1em;
  margin-left: -4px;
  position: relative;
  display: inline-block;
  width: 22px;
  text-align: center;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.12));
}
.reaction-pill:first-child { margin-left: 0; }
.reaction-total-count {
  font-size: 0.78em;
  font-weight: 700;
  color: #475569;
  margin-left: 4px;
}

/* Emoji add button */
.emoji-btn {
  padding: 5px 9px;
  border-radius: 20px;
  border: 1.5px dashed #cbd5e1;
  background: transparent;
  cursor: pointer;
  font-size: 0.85em;
  color: #64748b;
  transition: all 0.15s;
}
.emoji-btn:hover,
.emoji-btn.emoji-picker-open {
  border-color: #94a3b8;
  background: #f1f5f9;
}

/* Emoji picker panel */
.emoji-picker-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  margin-top: 4px;
  position: relative;
  z-index: 100;
}
.emoji-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 4px;
}
@media (max-width: 480px) {
  .emoji-grid { grid-template-columns: repeat(6, 1fr); }
}
.emoji-option {
  font-size: 1.3em;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.1s;
  text-align: center;
  line-height: 1;
}
.emoji-option:hover { background: #f1f5f9; }
.emoji-option.emoji-mine {
  background: #dbeafe;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1.5px #93c5fd;
}
.emoji-option--icon { padding: 2px; }
.reaction-picker-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  display: block;
  border-radius: 4px;
}
.reaction-icon-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  vertical-align: middle;
  border-radius: 3px;
}

/* Reaction detail popover */
.reaction-detail-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 12px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.1);
  margin-top: 4px;
  max-width: 340px;
  z-index: 100;
}
.reaction-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85em;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 8px;
}
.reaction-group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.82em;
  border-bottom: 1px solid #f1f5f9;
}
.reaction-group:last-child { border-bottom: none; }
.reaction-group-emoji { font-size: 1.2em; min-width: 22px; }
.reaction-group-count {
  font-weight: 700;
  color: #1d4ed8;
  min-width: 18px;
}
.reaction-group-names {
  color: #475569;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
