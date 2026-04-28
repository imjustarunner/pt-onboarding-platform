<template>
  <div class="rcb">

    <!-- ════════════════════════════════════════════════════════════
         ELIGIBILITY GROUPS
         Groups define who qualifies — they are filters, not awards.
    ══════════════════════════════════════════════════════════════ -->
    <div class="rcb-panel">
      <div class="rcb-panel-head rcb-panel-head--between">
        <div class="rcb-panel-head-left">
          <span class="rcb-panel-title">Eligibility Groups</span>
          <span class="rcb-panel-hint">Define who qualifies for specific awards.</span>
        </div>
        <button type="button" class="rcb-panel-add-btn" @click="addCustomGroup" title="Add custom group">+</button>
      </div>

      <!-- Male / Female (on by default) -->
      <div class="rcb-group-row">
        <label class="rcb-group-toggle">
          <input type="checkbox" :checked="maleActive" @change="onToggleMale" />
          <span class="rcb-group-name">Male</span>
        </label>
        <span v-if="!maleActive" class="rcb-off-label">off</span>
      </div>
      <div class="rcb-group-row">
        <label class="rcb-group-toggle">
          <input type="checkbox" :checked="femaleActive" @change="onToggleFemale" />
          <span class="rcb-group-name">Female</span>
        </label>
        <span v-if="!femaleActive" class="rcb-off-label">off</span>
      </div>

      <!-- Masters -->
      <div class="rcb-group-row">
        <label class="rcb-group-toggle">
          <input type="checkbox" :checked="mastersActive" @change="onToggleMasters" />
          <span class="rcb-group-name">Masters</span>
        </label>
        <template v-if="mastersActive">
          <span class="rcb-group-sub">Age ≥</span>
          <input type="number" class="rcb-num-input" min="18" max="99"
            :value="mastersAge" @input="onMastersAgeInput" />
          <span class="rcb-group-sub">years</span>
        </template>
        <span v-else class="rcb-off-label">off</span>
      </div>

      <!-- Heavyweight -->
      <div class="rcb-group-row">
        <label class="rcb-group-toggle">
          <input type="checkbox" :checked="heavyweightActive" @change="onToggleHeavyweight" />
          <span class="rcb-group-name">Heavyweight</span>
        </label>
        <template v-if="heavyweightActive">
          <input type="text" class="rcb-title-chip" placeholder="Clydesdale"
            :value="hwMaleName" maxlength="32"
            @input="e => onHwUpdate('male','label', e.target.value)" />
          <input type="number" class="rcb-num-input" min="100" max="600"
            :value="hwMaleWeight" @input="e => onHwUpdate('male','weight', Number(e.target.value))" />
          <span class="rcb-group-sub">lbs</span>
          <span class="rcb-group-sep">/</span>
          <input type="text" class="rcb-title-chip" placeholder="Athena"
            :value="hwFemaleName" maxlength="32"
            @input="e => onHwUpdate('female','label', e.target.value)" />
          <input type="number" class="rcb-num-input" min="100" max="600"
            :value="hwFemaleWeight" @input="e => onHwUpdate('female','weight', Number(e.target.value))" />
          <span class="rcb-group-sub">lbs</span>
        </template>
        <span v-else class="rcb-off-label">off</span>
      </div>

      <!-- Custom eligibility groups -->
      <div v-for="g in customGroups" :key="g.id" class="rcb-custom-group-card">
        <div class="rcb-custom-group-head">
          <input v-model="g.label" type="text" class="rcb-group-label-input"
            placeholder="Group name (e.g. Juniors)" maxlength="64" @input="emit_" />
          <button type="button" class="rcb-icon-btn rcb-remove-btn" @click="removeGroup(g.id)">×</button>
        </div>
        <div class="rcb-criteria-block">
          <div v-for="(crit, ci) in g.criteria" :key="`gc-${ci}`" class="rcb-crit-row">
            <select v-model="crit.field" class="rcb-select" @change="emit_">
              <option value="age">Age (years)</option>
              <option value="weight_lbs">Weight (lbs)</option>
              <option value="height_inches">Height (inches)</option>
              <option v-for="cf in customFieldDefinitions" :key="cf.id" :value="`custom_${cf.id}`">
                {{ cf.label }} ({{ cf.unit_label || cf.field_type }})
              </option>
            </select>
            <select v-model="crit.operator" class="rcb-select rcb-select--xs" @change="emit_">
              <option value="lte">≤ at most</option>
              <option value="gte">≥ at least</option>
            </select>
            <input v-model.number="crit.value" type="number" class="rcb-crit-val"
              placeholder="Value" @change="emit_" />
            <button type="button" class="rcb-icon-btn rcb-remove-btn" @click="removeCriterion(g, ci)">×</button>
          </div>
          <button type="button" class="rcb-text-btn" @click="addCriterion(g)">+ criterion</button>
        </div>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════════
         SEASON RECOGNITIONS
         Awards are what get displayed and presented each period.
    ══════════════════════════════════════════════════════════════ -->
    <div class="rcb-panel">
      <div class="rcb-panel-head">
        <span class="rcb-panel-title">Season Recognitions</span>
        <span class="rcb-panel-hint">Each award is given to a winner based on the rules you set.</span>
      </div>

      <!-- Standardized award preset drawer: one-click scaffolds for common awards
           so managers start from a sensible icon + label + metric combo. -->
      <div class="rcb-preset-drawer">
        <button type="button" class="rcb-preset-toggle" @click="showPresets = !showPresets">
          {{ showPresets ? '▲ Hide standardized presets' : '✨ Standardized award presets' }}
        </button>
        <div v-if="showPresets" class="rcb-preset-grid">
          <button
            v-for="p in awardPresets"
            :key="p.key"
            type="button"
            class="rcb-preset-btn"
            :title="p.description"
            @click="addAwardFromPreset(p)"
          >
            <span class="rcb-preset-icon">{{ p.icon }}</span>
            <span class="rcb-preset-label">{{ p.label }}</span>
            <span class="rcb-preset-sub">{{ p.subtitle }}</span>
          </button>
        </div>
      </div>

      <!-- ── Import panel ─────────────────────────────────────────── -->
      <div v-if="props.clubId" class="rcb-import-panel">
        <!-- Row 1: Add one from club library / Add all -->
        <div v-if="libraryAwards.length" class="rcb-library-bar">
          <select v-model="selectedLibraryAwardId" class="rcb-select rcb-library-select">
            <option value="">Add one from club library…</option>
            <option v-for="la in libraryAwards" :key="la.id" :value="la.id">
              {{ la.icon }} {{ la.label }}
            </option>
          </select>
          <button type="button" class="rcb-confirm-btn"
            :disabled="!selectedLibraryAwardId"
            @click="addAwardFromLibrary(libraryAwards.find(a => String(a.id) === String(selectedLibraryAwardId)))">
            Add
          </button>
        </div>
        <div v-if="libraryAwards.length" class="rcb-import-row">
          <button type="button" class="rcb-import-btn rcb-import-btn--club" @click="addAllFromClubLibrary">
            + Add all from club library ({{ libraryAwards.length }})
          </button>
        </div>

        <!-- Row 2: Summit Stats Library — add one or all -->
        <div class="rcb-library-bar">
          <select
            v-model="selectedSummitStatsAwardId"
            class="rcb-select rcb-library-select"
            @focus="ensureTenantAwardsLoaded"
          >
            <option value="">{{ summitStatsSelectPlaceholder }}</option>
            <option v-for="ta in tenantImportAwards" :key="ta.id" :value="ta.id">
              {{ summitStatsAwardOptionLabel(ta) }}
            </option>
          </select>
          <button
            type="button"
            class="rcb-confirm-btn"
            :disabled="!selectedSummitStatsAwardId || tenantAwardsLoading"
            @click="addOneSummitStatsAward"
          >
            Add
          </button>
        </div>
        <div class="rcb-import-row">
          <button
            type="button"
            class="rcb-import-btn"
            :disabled="tenantAwardsLoading || (tenantAwardsLoaded && !tenantImportAwards.length)"
            @click="importAllTenantAwards"
          >
            <span v-if="tenantAwardsLoading">Loading Summit Stats Library…</span>
            <span v-else-if="tenantAwardsLoaded && !tenantImportAwards.length">No Summit Stats Library awards to add</span>
            <span v-else>+ Add all from Summit Stats Library <span v-if="tenantImportAwards.length">({{ tenantImportAwards.length }})</span></span>
          </button>
        </div>

        <!-- Row 3: Copy all from a previous season -->
        <div class="rcb-import-row">
          <select v-model="selectedSeasonId" class="rcb-select rcb-library-select"
            @focus="ensureSeasonsLoaded">
            <option value="">Copy all awards from a previous season…</option>
            <option v-for="s in previousSeasons" :key="s.id" :value="s.id">
              {{ s.class_name || s.className || `Season ${s.id}` }}
            </option>
          </select>
          <button type="button" class="rcb-confirm-btn"
            :disabled="!selectedSeasonId || seasonImportLoading"
            @click="importFromSeason">
            {{ seasonImportLoading ? 'Importing…' : 'Copy all' }}
          </button>
        </div>
        <div v-if="importMessage" class="rcb-import-msg" :class="{ 'rcb-import-msg--ok': importOk }">{{ importMessage }}</div>
      </div>

      <!-- Empty state -->
      <div v-if="!awards.length" class="rcb-empty">
        No recognition awards yet. Click below to add one, or pick from the library above.
      </div>

      <!-- Award cards -->
      <div v-for="aw in awards" :key="aw.id" class="rcb-award-card" :class="{ 'rcb-award--off': !aw.active }">

        <!-- Row 1: icon + title + active + remove -->
        <div class="rcb-award-head">
          <!-- Icon picker trigger -->
          <div class="rcb-icon-picker-wrap">
            <button type="button" class="rcb-icon-btn rcb-icon-display"
              :title="'Change icon'"
              @click="toggleIconPicker(aw.id)">
              <img v-if="isLibraryIcon(aw.icon) && resolveLibraryIconUrl(aw.icon)"
                :src="resolveLibraryIconUrl(aw.icon)" class="rcb-icon-img" alt="" />
              <span v-else-if="isLibraryIcon(aw.icon)" class="rcb-icon-loading" aria-hidden="true">🏆</span>
              <span v-else>{{ aw.icon || '🏆' }}</span>
            </button>
            <div v-if="iconPickerOpenId === aw.id" class="rcb-icon-popover">
              <!-- Tabs -->
              <div class="rcb-icon-tabs">
                <button type="button" class="rcb-icon-tab" :class="{ active: iconPickerTab === 'emoji' }" @click="iconPickerTab = 'emoji'">Emoji</button>
                <button type="button" class="rcb-icon-tab" :class="{ active: iconPickerTab === 'library' }" @click="iconPickerTab = 'library'; ensureLibraryLoaded()">Library</button>
              </div>
              <!-- Emoji grid -->
              <div v-if="iconPickerTab === 'emoji'" class="rcb-icon-grid">
                <button v-for="ic in ICONS" :key="ic" type="button"
                  class="rcb-icon-option"
                  :class="{ 'rcb-icon-option--active': aw.icon === ic }"
                  @click="pickIcon(aw, ic)">{{ ic }}</button>
              </div>
              <!-- Library icons -->
              <div v-else class="rcb-lib-icons">
                <div v-if="libraryIconsLoading" class="rcb-lib-hint">Loading…</div>
                <div v-else-if="!libraryIcons.length" class="rcb-lib-hint">No icons in library yet.</div>
                <div v-else class="rcb-icon-grid">
                  <button v-for="li in libraryIcons" :key="li.id" type="button"
                    class="rcb-icon-option rcb-icon-option--img"
                    :class="{ 'rcb-icon-option--active': aw.icon === `icon:${li.id}` }"
                    :title="li.name"
                    @click="pickLibraryIcon(aw, li)">
                    <img :src="li.url" :alt="li.name" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <input v-model="aw.label" type="text" class="rcb-award-title-input"
            placeholder="Award title (e.g. Sasquatch, Iron Legs, Fastest…)"
            maxlength="64" @input="emit_" />
          <label class="rcb-toggle-switch" title="Active">
            <input type="checkbox" v-model="aw.active" @change="emit_" />
            <span class="rcb-switch-track"></span>
          </label>
          <button type="button" class="rcb-icon-btn rcb-remove-btn" @click="removeAward(aw.id)">×</button>
        </div>

        <!-- Assist row: one-click helpers to pick an on-brand icon and a standardized label -->
        <div class="rcb-assist-row">
          <button
            type="button"
            class="rcb-assist-btn"
            :disabled="shufflingIconAwardId === aw.id"
            @click="shuffleAwardIcon(aw)"
            title="Pick a random icon from the Award sub-category"
          >
            {{ shufflingIconAwardId === aw.id ? 'Randomizing…' : '🎲 Random icon' }}
          </button>
          <button
            type="button"
            class="rcb-assist-btn"
            @click="suggestAwardLabel(aw)"
            title="Fill in a standardized label based on the current period, metric, and aggregation"
          >
            ✨ Suggest label
          </button>
        </div>

        <!-- Row 2: Period / Activity type / Metric / Winner by -->
        <div class="rcb-award-settings">
          <div class="rcb-award-field">
            <label class="rcb-field-label">Period</label>
            <select v-model="aw.period" class="rcb-select" @change="emit_">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="season">Full Season</option>
              <option value="challenge">Challenge</option>
            </select>
          </div>
          <!-- Monthly end day (only shown for monthly period) -->
          <div v-if="aw.period === 'monthly'" class="rcb-award-field">
            <label class="rcb-field-label">Month ends</label>
            <select v-model="aw.monthEndDay" class="rcb-select" @change="emit_">
              <option value="last">Last day of month</option>
              <option v-for="d in 28" :key="d" :value="d">Day {{ d }}</option>
            </select>
          </div>
          <div class="rcb-award-field">
            <label class="rcb-field-label">Activity</label>
            <select v-model="aw.activityType" class="rcb-select" @change="emit_">
              <option value="">Any activity</option>
              <option value="run">Run</option>
              <option value="ruck">Ruck</option>
              <option value="__race__">Race (is_race logged)</option>
              <option value="walk">Walk</option>
              <option value="cycling">Cycling</option>
              <option value="workout_session">Workout / Strength</option>
              <option value="steps">Steps</option>
              <optgroup v-if="customActivityTypes.length" label="Custom">
                <option v-for="ct in customActivityTypes" :key="ct" :value="ct">{{ ct }}</option>
              </optgroup>
              <option value="__add__">+ Add type…</option>
            </select>
          </div>
          <div class="rcb-award-field">
            <label class="rcb-field-label">Metric</label>
            <select v-model="aw.metric" class="rcb-select" @change="() => { if (aw.metric === 'kudos_received') aw.aggregation = 'most'; if (aw.metric === 'pace_min_per_mile') aw.aggregation = 'fastest'; emit_(); }">
              <option value="points">Points</option>
              <option value="distance_miles">Miles</option>
              <option value="duration_minutes">Duration (min)</option>
              <option value="elevation_gain_ft">Elevation Gain (ft)</option>
              <option value="pace_min_per_mile">Pace (fastest)</option>
              <option value="activities_count">Activity count</option>
              <option value="challenge_completions">Challenges completed</option>
              <option value="kudos_received">Kudos received</option>
            </select>
          </div>
          <div class="rcb-award-field">
            <label class="rcb-field-label">Winner by</label>
            <select v-model="aw.aggregation" class="rcb-select" @change="emit_" :disabled="aw.metric === 'kudos_received' || aw.metric === 'pace_min_per_mile'">
              <option v-if="aw.metric === 'pace_min_per_mile'" value="fastest">Fastest (lowest pace)</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="most">Most (total)</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="least">Least (total)</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="average">Average per entry</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="best_single">Best single workout</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="best_day">Best single day</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="best_week">Best single week</option>
              <option v-if="aw.metric === 'kudos_received'" value="most">Most (total)</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="milestone">Milestone (everyone who reaches target)</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="longest_streak">Longest streak (consecutive days)</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="most_active_days">Most active days</option>
              <option v-if="aw.metric !== 'kudos_received' && aw.metric !== 'pace_min_per_mile'" value="perfect_season">Perfect season (everyone who hits daily target)</option>
            </select>
          </div>
        </div>

        <!-- Streak-specific configuration: daily threshold that counts a day as "active" for streak awards -->
        <div v-if="isStreakAggregation(aw.aggregation)" class="rcb-streak-config">
          <div class="rcb-award-field">
            <label class="rcb-field-label">Min miles per day (0 = any workout counts)</label>
            <input
              v-model.number="aw.streakMinMilesPerDay"
              type="number"
              class="rcb-num-input"
              min="0"
              step="0.1"
              placeholder="e.g. 1 or 3"
              @input="emit_"
            />
          </div>
          <div class="rcb-award-field">
            <label class="rcb-field-label">Min activities per day</label>
            <input
              v-model.number="aw.streakMinActivitiesPerDay"
              type="number"
              class="rcb-num-input"
              min="0"
              step="1"
              placeholder="e.g. 1"
              @input="emit_"
            />
          </div>
          <div class="rcb-panel-hint" style="flex-basis:100%;">
            <span v-if="aw.aggregation === 'longest_streak'">Winner has the longest unbroken run of qualifying days during the period.</span>
            <span v-else-if="aw.aggregation === 'most_active_days'">Winner has the most distinct qualifying days during the period.</span>
            <span v-else-if="aw.aggregation === 'perfect_season'">Everyone who hits the daily threshold on every day of the season earns this award.</span>
          </div>
        </div>

        <div v-if="aw.aggregation === 'milestone'" class="rcb-award-row">
          <label class="rcb-field-label">Target total</label>
          <input
            v-model.number="aw.milestoneThreshold"
            type="number"
            class="rcb-num-input"
            min="0.0001"
            step="any"
            placeholder="e.g. 200"
            @input="emit_"
          />
          <span class="rcb-panel-hint" style="margin:0;">Same units as metric. Everyone at or above this total earns the award.</span>
        </div>
        <div v-else-if="isStreakAggregation(aw.aggregation)" class="rcb-award-row">
          <span class="rcb-panel-hint" style="margin:0;">Streak-based awards compute from daily activity — no total target needed.</span>
        </div>
        <div v-else class="rcb-award-row">
          <label class="rcb-field-label">Reference amount (optional)</label>
          <input
            v-model.number="aw.referenceTarget"
            type="number"
            class="rcb-num-input"
            min="0"
            step="any"
            placeholder="e.g. 200"
            @input="emit_"
          />
          <span class="rcb-panel-hint" style="margin:0;">Same units as metric. For display/context; does not change single-winner rules.</span>
        </div>

        <!-- Row 2b: Terrain filter + Min distance filter -->
        <div class="rcb-award-settings">
          <div class="rcb-award-field">
            <label class="rcb-field-label">Terrain (optional)</label>
            <select v-model="aw.terrainFilter" class="rcb-select" @change="emit_">
              <option value="">Any terrain</option>
              <option value="Road">Road</option>
              <option value="Trail">Trail</option>
              <option value="Track">Track</option>
              <option value="Treadmill">Treadmill</option>
              <option value="Beach">Beach</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="rcb-award-field">
            <label class="rcb-field-label">Min distance (mi)</label>
            <input
              v-model.number="aw.minDistanceMiles"
              type="number"
              class="rcb-num-input rcb-num-input--wide"
              min="0"
              step="0.5"
              placeholder="e.g. 3"
              @input="emit_"
            />
            <span class="rcb-group-sub" style="font-size:11px;color:#888;">Required for pace awards</span>
          </div>
        </div>

        <!-- Row 3: Eligible group -->
        <div class="rcb-award-row">
          <label class="rcb-field-label">Eligible group</label>
          <select v-model="aw.groupFilter" class="rcb-select" @change="emit_">
            <option value="">Everyone</option>
            <option v-if="maleActive" value="gender_male">Male</option>
            <option v-if="femaleActive" value="gender_female">Female</option>
            <option v-if="mastersActive" value="masters">Masters (age ≥ {{ mastersAge }})</option>
            <option v-if="heavyweightActive" value="heavyweight_male">{{ hwMaleName || 'Clydesdale' }} ({{ hwMaleWeight }} lbs+)</option>
            <option v-if="heavyweightActive" value="heavyweight_female">{{ hwFemaleName || 'Athena' }} ({{ hwFemaleWeight }} lbs+)</option>
            <option v-for="g in customGroups" :key="g.id" :value="g.id">{{ g.label || 'Unnamed group' }}</option>
          </select>
        </div>

        <!-- Save to library -->
        <div class="rcb-award-save-row">
          <button type="button" class="rcb-save-library-btn" @click="saveToLibrary(aw)" :title="'Save this award to the library for reuse across seasons'">
            ↑ Save to library
          </button>
        </div>
      </div>

      <div class="rcb-award-actions-row">
        <button type="button" class="rcb-dashed-btn rcb-dashed-btn--primary" @click="addAward">
          + Add recognition award
        </button>
        <button type="button" class="rcb-bulk-btn" @click="openBulkCreator">
          ⚡ Bulk Create
        </button>
      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════════
         BULK RECOGNITION CREATOR
    ══════════════════════════════════════════════════════════════ -->
    <div v-if="showBulkCreator" class="rcb-bulk-overlay" @click.self="showBulkCreator = false">
      <div class="rcb-bulk-modal">
        <div class="rcb-bulk-header">
          <h2 class="rcb-bulk-title">Bulk Recognition Creator</h2>
          <button type="button" class="rcb-bulk-close" @click="showBulkCreator = false">×</button>
        </div>

        <!-- Step 1: Icon Selection -->
        <div v-if="bulkStep === 1" class="rcb-bulk-body">
          <p class="rcb-bulk-hint">Select one or more icons — each selected icon will become one award row. You can change icons on each row afterwards.</p>

          <div class="rcb-bulk-icon-tabs">
            <button :class="['rcb-icon-tab', { active: bulkIconTab === 'emoji' }]" type="button" @click="bulkIconTab = 'emoji'">Emoji</button>
            <button :class="['rcb-icon-tab', { active: bulkIconTab === 'library' }]" type="button" @click="bulkIconTab = 'library'; ensureLibraryLoaded()">Library</button>
          </div>

          <!-- Emoji grid -->
          <div v-if="bulkIconTab === 'emoji'" class="rcb-bulk-icon-grid">
            <button
              v-for="ic in ICONS"
              :key="ic"
              type="button"
              :class="['rcb-bulk-icon-btn', { selected: bulkSelectedIcons.includes(ic) }]"
              @click="toggleBulkIcon(ic)"
            >{{ ic }}</button>
          </div>

          <!-- Library icon grid -->
          <div v-else class="rcb-bulk-icon-grid">
            <div v-if="libraryIconsLoading" class="rcb-lib-loading">Loading…</div>
            <div v-else-if="!libraryIcons.length" class="rcb-lib-hint">No icons in library yet.</div>
            <button
              v-for="li in libraryIcons"
              :key="li.id"
              type="button"
              :class="['rcb-bulk-icon-btn', 'rcb-bulk-icon-btn--img', { selected: bulkSelectedIcons.includes(`icon:${li.id}`) }]"
              @click="toggleBulkIcon(`icon:${li.id}`, li.url)"
            >
              <img :src="li.url" :alt="li.name || ''" />
            </button>
          </div>

          <div class="rcb-bulk-step1-footer">
            <span class="rcb-bulk-count">{{ bulkSelectedIcons.length }} icon{{ bulkSelectedIcons.length !== 1 ? 's' : '' }} selected</span>
            <button type="button" class="rcb-confirm-btn" :disabled="!bulkSelectedIcons.length" @click="bulkStep = 2">
              Next → Configure Awards
            </button>
          </div>
        </div>

        <!-- Step 2: Configure each award -->
        <div v-else class="rcb-bulk-body rcb-bulk-body--scroll">
          <p class="rcb-bulk-hint">Fill in each award below. All fields default to "Miles / Most / Weekly" — change only what you need.</p>

          <div class="rcb-bulk-rows">
            <div v-for="(row, ri) in bulkRows" :key="ri" class="rcb-bulk-row">
              <!-- Icon preview + remove -->
              <div class="rcb-bulk-row-icon">
                <span v-if="!isLibraryIcon(row.icon)" class="rcb-bulk-row-emoji">{{ row.icon }}</span>
                <img v-else :src="libraryIconCache[row.icon] || resolveLibraryIconUrl(row.icon)" class="rcb-bulk-row-img" :alt="''" />
                <button type="button" class="rcb-icon-btn rcb-remove-btn" title="Remove row" @click="bulkRows.splice(ri,1)">×</button>
              </div>

              <!-- Award title -->
              <input
                v-model="row.label"
                type="text"
                class="rcb-bulk-row-title"
                placeholder="Award title *"
                maxlength="80"
              />

              <!-- Period -->
              <select v-model="row.period" class="rcb-select rcb-bulk-select">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="season">Full Season</option>
              </select>

              <!-- Activity -->
              <select v-model="row.activityType" class="rcb-select rcb-bulk-select">
                <option value="">Any activity</option>
                <option value="run">Run</option>
                <option value="ruck">Ruck</option>
                <option value="__race__">Race</option>
                <option value="walk">Walk</option>
                <option value="cycling">Cycling</option>
                <option value="workout_session">Workout / Strength</option>
                <option value="steps">Steps</option>
              </select>

              <!-- Terrain -->
              <select v-model="row.terrainFilter" class="rcb-select rcb-bulk-select">
                <option value="">Any terrain</option>
                <option value="Road">Road</option>
                <option value="Trail">Trail</option>
                <option value="Track">Track</option>
                <option value="Beach">Beach</option>
                <option value="Treadmill">Treadmill</option>
              </select>

              <!-- Metric -->
              <select v-model="row.metric" class="rcb-select rcb-bulk-select" @change="onBulkMetricChange(row)">
                <option value="distance_miles">Miles</option>
                <option value="points">Points</option>
                <option value="elevation_gain_ft">Elevation (ft)</option>
                <option value="pace_min_per_mile">Pace (fastest)</option>
                <option value="activities_count">Activity count</option>
                <option value="duration_minutes">Duration (min)</option>
              </select>

              <!-- Aggregation -->
              <select v-model="row.aggregation" class="rcb-select rcb-bulk-select" :disabled="row.metric === 'pace_min_per_mile'">
                <option v-if="row.metric === 'pace_min_per_mile'" value="fastest">Fastest</option>
                <option v-else value="most">Most (total)</option>
                <option v-if="row.metric !== 'pace_min_per_mile'" value="best_single">Best single workout</option>
                <option v-if="row.metric !== 'pace_min_per_mile'" value="best_day">Best single day</option>
                <option v-if="row.metric !== 'pace_min_per_mile'" value="best_week">Best single week</option>
                <option v-if="row.metric !== 'pace_min_per_mile'" value="longest_streak">Longest streak</option>
                <option v-if="row.metric !== 'pace_min_per_mile'" value="most_active_days">Most active days</option>
                <option v-if="row.metric !== 'pace_min_per_mile'" value="perfect_season">Perfect season</option>
              </select>

              <!-- Group filter -->
              <select v-model="row.groupFilter" class="rcb-select rcb-bulk-select">
                <option value="">Everyone</option>
                <option v-if="maleActive" value="gender_male">Male</option>
                <option v-if="femaleActive" value="gender_female">Female</option>
                <option v-if="mastersActive" value="masters">Masters</option>
                <option v-if="heavyweightActive" value="heavyweight_male">{{ hwMaleName || 'Clydesdale' }}</option>
                <option v-if="heavyweightActive" value="heavyweight_female">{{ hwFemaleName || 'Athena' }}</option>
                <option v-for="g in customGroups" :key="g.id" :value="g.id">{{ g.label || 'Group' }}</option>
              </select>

              <!-- Min distance -->
              <input
                v-model.number="row.minDistanceMiles"
                type="number"
                class="rcb-num-input"
                min="0"
                step="0.5"
                placeholder="Min mi"
                title="Minimum miles per workout"
              />
            </div>
          </div>

          <!-- Add more rows manually -->
          <button type="button" class="rcb-dashed-btn" @click="addBulkRow">+ Add another row</button>

          <div class="rcb-bulk-step2-footer">
            <button type="button" class="rcb-cancel-btn" @click="bulkStep = 1">← Back</button>
            <span class="rcb-bulk-count">{{ bulkRows.filter(r => r.label.trim()).length }} / {{ bulkRows.length }} titled</span>
            <button type="button" class="rcb-confirm-btn" :disabled="!bulkRows.some(r => r.label.trim())" @click="commitBulkCreate">
              ✓ Create {{ bulkRows.filter(r => r.label.trim()).length }} Award{{ bulkRows.filter(r => r.label.trim()).length !== 1 ? 's' : '' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add activity type dialog -->
    <div v-if="showAddActivityType" class="rcb-modal-overlay" @click.self="showAddActivityType = false">
      <div class="rcb-modal">
        <h3 style="margin:0 0 12px 0;font-size:15px;">Add Activity Type</h3>
        <p style="font-size:13px;color:#64748b;margin:0 0 12px 0;">
          This type will be available for award filters and members can tag their workouts to it.
        </p>
        <input v-model="newActivityTypeDraft" ref="activityTypeInputRef"
          type="text" class="rcb-modal-input"
          placeholder="e.g. Hill Run, Nordic Ski, Rucking"
          maxlength="64"
          @keydown.enter.prevent="commitActivityType"
          @keydown.escape="showAddActivityType = false" />
        <div class="rcb-modal-actions">
          <button type="button" class="rcb-cancel-btn" @click="showAddActivityType = false">Cancel</button>
          <button type="button" class="rcb-confirm-btn" @click="commitActivityType">Add Type</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import api from '../../services/api';
import { toUploadsUrl } from '../../utils/uploadsUrl.js';
import { shuffleLibraryIcon } from '../../composables/useGuidedChallengeDraft.js';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  customFieldDefinitions: { type: Array, default: () => [] },
  libraryAwards: { type: Array, default: () => [] },
  libraryGroups: { type: Array, default: () => [] },
  clubId: { type: [Number, String], default: null }
});

const emit = defineEmits(['update:modelValue', 'save-award-to-library']);

// ── Icon set ─────────────────────────────────────────────────────
const ICONS = ['🏆','🥇','🥈','🥉','🎖️','🏅','⭐','🌟','💥','⚡','🔥','🦅','🦁','🦊','🏔️','🌄','🛤️','🚵','🏃','🚴','🏊','💪','👟','🎯','🏹','🦶'];

// ── Internal state ────────────────────────────────────────────────
// We split the flat categories array into:
//   - hidden "config" entries for masters/heavyweight
//   - custom groups (type:'group')
//   - awards (type:'award' or legacy standard/custom)
// All stored together in cats[] for saving.
const cats = ref([]);

// Activity types config entry stored as a hidden marker in cats
const CONF_ID = '__activity_types__';

// ── Default factory ───────────────────────────────────────────────
function makeDefaults() {
  return [
    { id: 'cfg_gender',      type: 'cfg_gender',      maleActive: true, femaleActive: true },
    { id: 'cfg_masters',     type: 'cfg_masters',     active: false, ageThreshold: 53 },
    { id: 'cfg_heavyweight', type: 'cfg_heavyweight',  active: false,
      maleName: 'Clydesdale', maleWeight: 200, femaleName: 'Athena', femaleWeight: 165 },
    { id: CONF_ID,           type: '__activity_types__', types: [] }
  ];
}

function legacyToAward(c) {
  if (c.type === 'standard' || c.type === 'custom') {
    return {
      ...c,
      type: 'award',
      icon: c.icon || '🏆',
      activityType: c.activityType || '',
      groupFilter: c.groupFilter || '',
      genderVariants: c.genderVariants || (c.genderFilter ? [c.genderFilter] : [])
    };
  }
  return c;
}

function fromExternal(arr) {
  const defaults = makeDefaults();
  const defById = Object.fromEntries(defaults.map(d => [d.id, d]));

  if (!Array.isArray(arr) || arr.length === 0) return defaults;

  const incoming = arr.map(c => (typeof c === 'string' ? stringLegacy(c) : { ...c }));

  // Merge config entries
  const merged = defaults.map(d => {
    const found = incoming.find(c => c.id === d.id || c.type === d.type);
    if (!found) return d;
    if (d.type === 'cfg_gender') {
      return { ...d, maleActive: found.maleActive ?? true, femaleActive: found.femaleActive ?? true };
    }
    if (d.type === 'cfg_masters') {
      // Also pull from old masters type entries
      const oldMasters = incoming.filter(c => c.type === 'masters');
      const anyActive = oldMasters.some(c => c.active);
      const age = oldMasters[0]?.ageThreshold ?? found.ageThreshold ?? 53;
      return { ...d, active: anyActive || !!found.active, ageThreshold: age };
    }
    if (d.type === 'cfg_heavyweight') {
      const oldHw = incoming.filter(c => c.type === 'heavyweight');
      const anyActive = oldHw.some(c => c.active);
      const male = oldHw.find(c => c.genderFilter === 'male');
      const female = oldHw.find(c => c.genderFilter === 'female');
      return {
        ...d,
        active: anyActive || !!found.active,
        maleName: male?.label ?? found.maleName ?? 'Clydesdale',
        maleWeight: male?.weightThresholdLbs ?? found.maleWeight ?? 200,
        femaleName: female?.label ?? found.femaleName ?? 'Athena',
        femaleWeight: female?.weightThresholdLbs ?? found.femaleWeight ?? 165
      };
    }
    return { ...d, ...found };
  });

  // All non-config entries become awards or custom groups
  const others = incoming
    .filter(c => !defById[c.id] && c.type !== 'cfg_gender' && c.type !== 'masters' && c.type !== 'heavyweight')
    .map(c => (c.type === 'award' || c.type === 'group') ? c : legacyToAward(c));

  return [...merged, ...others];
}

function stringLegacy(key) {
  const map = {
    fastest_male:           { type: 'award', id: `leg_${key}`, icon: '🏆', label: 'Fastest Male',           active: true, period: 'weekly', metric: 'points', aggregation: 'most', activityType: '', groupFilter: '', genderVariants: [] },
    fastest_female:         { type: 'award', id: `leg_${key}`, icon: '🏆', label: 'Fastest Female',         active: true, period: 'weekly', metric: 'points', aggregation: 'most', activityType: '', groupFilter: '', genderVariants: [] },
    fastest_masters_male:   { type: 'award', id: `leg_${key}`, icon: '🎖️', label: 'Masters Male',          active: true, period: 'weekly', metric: 'points', aggregation: 'most', activityType: '', groupFilter: 'masters', genderVariants: [] },
    fastest_masters_female: { type: 'award', id: `leg_${key}`, icon: '🎖️', label: 'Masters Female',        active: true, period: 'weekly', metric: 'points', aggregation: 'most', activityType: '', groupFilter: 'masters', genderVariants: [] }
  };
  return map[key] || { type: 'award', id: `leg_${key}`, icon: '🏆', label: key, active: true, period: 'weekly', metric: 'points', aggregation: 'most', activityType: '', groupFilter: '', genderVariants: [] };
}

watch(() => props.modelValue, val => { cats.value = fromExternal(val); }, { immediate: true, deep: false });

// ── Computed slices ───────────────────────────────────────────────
const cfgGender      = computed(() => cats.value.find(c => c.type === 'cfg_gender'));
const cfgMasters     = computed(() => cats.value.find(c => c.type === 'cfg_masters'));
const cfgHeavyweight = computed(() => cats.value.find(c => c.type === 'cfg_heavyweight'));
const cfgActivity    = computed(() => cats.value.find(c => c.type === '__activity_types__'));
const customGroups   = computed(() => cats.value.filter(c => c.type === 'group'));
const awards         = computed(() => cats.value.filter(c => c.type === 'award'));

const maleActive     = computed(() => cfgGender.value?.maleActive ?? true);
const femaleActive   = computed(() => cfgGender.value?.femaleActive ?? true);
const mastersActive  = computed(() => cfgMasters.value?.active ?? false);
const mastersAge     = computed(() => cfgMasters.value?.ageThreshold ?? 53);
const heavyweightActive = computed(() => cfgHeavyweight.value?.active ?? false);
const hwMaleName    = computed(() => cfgHeavyweight.value?.maleName ?? 'Clydesdale');
const hwMaleWeight  = computed(() => cfgHeavyweight.value?.maleWeight ?? 200);
const hwFemaleName  = computed(() => cfgHeavyweight.value?.femaleName ?? 'Athena');
const hwFemaleWeight = computed(() => cfgHeavyweight.value?.femaleWeight ?? 165);
const customActivityTypes = computed(() => cfgActivity.value?.types ?? []);

// ── Emit ─────────────────────────────────────────────────────────
function emit_() {
  emit('update:modelValue', cats.value.map(c => ({ ...c })));
}

// ── Gender groups ─────────────────────────────────────────────────
function onToggleMale(e) {
  if (cfgGender.value) cfgGender.value.maleActive = e.target.checked;
  emit_();
}
function onToggleFemale(e) {
  if (cfgGender.value) cfgGender.value.femaleActive = e.target.checked;
  emit_();
}

// ── Masters ───────────────────────────────────────────────────────
function onToggleMasters(e) {
  if (cfgMasters.value) cfgMasters.value.active = e.target.checked;
  emit_();
}
function onMastersAgeInput(e) {
  const v = parseInt(e.target.value, 10);
  if (Number.isFinite(v) && cfgMasters.value) { cfgMasters.value.ageThreshold = v; emit_(); }
}

// ── Heavyweight ───────────────────────────────────────────────────
function onToggleHeavyweight(e) {
  if (cfgHeavyweight.value) cfgHeavyweight.value.active = e.target.checked;
  emit_();
}
function onHwUpdate(gender, field, val) {
  const cfg = cfgHeavyweight.value;
  if (!cfg) return;
  if (gender === 'male') {
    if (field === 'label') cfg.maleName = String(val || '').trim() || 'Clydesdale';
    else if (field === 'weight' && Number.isFinite(val) && val > 0) cfg.maleWeight = val;
  } else {
    if (field === 'label') cfg.femaleName = String(val || '').trim() || 'Athena';
    else if (field === 'weight' && Number.isFinite(val) && val > 0) cfg.femaleWeight = val;
  }
  emit_();
}

// ── Custom groups ─────────────────────────────────────────────────
function addCustomGroup() {
  cats.value.push({ id: `group_${Date.now()}`, type: 'group', label: '', criteria: [] });
  emit_();
}
function removeGroup(id) {
  const i = cats.value.findIndex(c => c.id === id);
  if (i !== -1) { cats.value.splice(i, 1); emit_(); }
}
function addCriterion(group) {
  if (!group.criteria) group.criteria = [];
  group.criteria.push({ field: 'age', operator: 'lte', value: null });
  emit_();
}
function removeCriterion(group, idx) {
  group.criteria.splice(idx, 1);
  emit_();
}

// ── Awards ────────────────────────────────────────────────────────
function addAwardFromLibrary(libAward) {
  if (!libAward) return;
  const id = `award_${Date.now()}`;
  cats.value.push({
    id,
    type: 'award',
    icon: libAward.icon || '🏆',
    label: libAward.label || '',
    active: true,
    period: libAward.period || 'weekly',
    monthEndDay: libAward.monthEndDay || 'last',
    activityType: libAward.activityType || '',
    terrainFilter: libAward.terrainFilter || '',
    minDistanceMiles: libAward.minDistanceMiles != null ? Number(libAward.minDistanceMiles) : undefined,
    metric: libAward.metric || 'distance_miles',
    aggregation: libAward.aggregation || 'most',
    milestoneThreshold: libAward.milestoneThreshold != null ? Number(libAward.milestoneThreshold) : undefined,
    referenceTarget: libAward.referenceTarget != null ? Number(libAward.referenceTarget) : undefined,
    groupFilter: libAward.groupFilter || '',
    streakMinMilesPerDay: libAward.streakMinMilesPerDay != null ? Number(libAward.streakMinMilesPerDay) : undefined,
    streakMinActivitiesPerDay: libAward.streakMinActivitiesPerDay != null ? Number(libAward.streakMinActivitiesPerDay) : undefined
  });
  emit_();
  selectedLibraryAwardId.value = '';
}

function addAllFromClubLibrary() {
  if (!props.libraryAwards?.length) return;
  for (const la of props.libraryAwards) {
    addAwardFromLibrary(la);
  }
}

function saveToLibrary(aw) {
  emit('save-award-to-library', { ...aw });
}

// ── Bulk Recognition Creator ───────────────────────────────────────
const showBulkCreator   = ref(false);
const bulkStep          = ref(1);        // 1 = icon picker, 2 = award rows
const bulkIconTab       = ref('emoji');  // 'emoji' | 'library'
const bulkSelectedIcons = ref([]);       // array of icon strings (emoji or 'icon:N')
const bulkRows          = ref([]);

function makeBulkRow(icon = '🏆') {
  return {
    icon,
    label: '',
    period: 'weekly',
    monthEndDay: 'last',
    activityType: '',
    terrainFilter: '',
    minDistanceMiles: undefined,
    metric: 'distance_miles',
    aggregation: 'most',
    groupFilter: '',
    streakMinMilesPerDay: undefined,
    streakMinActivitiesPerDay: undefined,
    milestoneThreshold: undefined,
    referenceTarget: undefined
  };
}

function toggleBulkIcon(icon, url) {
  if (url && icon.startsWith('icon:')) {
    libraryIconCache.value = { ...libraryIconCache.value, [icon]: url };
  }
  const idx = bulkSelectedIcons.value.indexOf(icon);
  if (idx === -1) bulkSelectedIcons.value.push(icon);
  else bulkSelectedIcons.value.splice(idx, 1);
}

function openBulkCreator() {
  bulkStep.value = 1;
  bulkIconTab.value = 'emoji';
  bulkSelectedIcons.value = [];
  bulkRows.value = [];
  showBulkCreator.value = true;
}

function onBulkMetricChange(row) {
  if (row.metric === 'pace_min_per_mile') row.aggregation = 'fastest';
  else if (row.aggregation === 'fastest') row.aggregation = 'most';
}

function addBulkRow() {
  bulkRows.value.push(makeBulkRow('🏆'));
}

watch(() => bulkStep.value, (step) => {
  if (step === 2) {
    bulkRows.value = bulkSelectedIcons.value.map(icon => makeBulkRow(icon));
    if (!bulkRows.value.length) bulkRows.value.push(makeBulkRow('🏆'));
  }
});

function commitBulkCreate() {
  const toAdd = bulkRows.value.filter(r => r.label.trim());
  for (const row of toAdd) {
    cats.value.push({
      id: `award_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: 'award',
      active: true,
      ...row
    });
  }
  emit_();
  showBulkCreator.value = false;
}

function addAward() {
  const id = `award_${Date.now()}`;
  cats.value.push({
    id,
    type: 'award',
    icon: '🏆',
    label: '',
    active: true,
    period: 'weekly',
    monthEndDay: 'last',
    activityType: '',
    terrainFilter: '',
    minDistanceMiles: undefined,
    metric: 'distance_miles',
    aggregation: 'most',
    milestoneThreshold: undefined,
    referenceTarget: undefined,
    groupFilter: '',
    streakMinMilesPerDay: undefined,
    streakMinActivitiesPerDay: undefined
  });
  emit_();
  nextTick(() => {
    const el = document.querySelector(`[data-award-id="${id}"] .rcb-award-title-input`);
    el?.focus();
  });
}
function removeAward(id) {
  const i = cats.value.findIndex(c => c.id === id);
  if (i !== -1) { cats.value.splice(i, 1); emit_(); }
}

// Watch activityType select for the __add__ sentinel
watch(awards, (list) => {
  list.forEach(aw => {
    if (aw.activityType === '__add__') {
      aw.activityType = '';
      openAddActivityType();
    }
  });
}, { deep: true });

// ── Library selection ─────────────────────────────────────────────
const selectedLibraryAwardId = ref('');
const selectedSummitStatsAwardId = ref('');

// ── Standardized award preset drawer (Phase 2) ────────────────────
// These scaffolds pre-fill period/metric/aggregation/icon so managers can
// spin up the most common awards in one click. Kept deterministic so the
// names stay consistent across seasons and clubs.
const showPresets = ref(false);
const awardPresets = [
  {
    key: '100_mile_club', icon: '💯', label: '100 Mile Club', subtitle: 'Season milestone',
    description: 'Everyone who logs 100+ miles over the season earns this award.',
    fields: { period: 'season', metric: 'distance_miles', aggregation: 'milestone', milestoneThreshold: 100 }
  },
  {
    key: '250_mile_club', icon: '🏔️', label: '250 Mile Club', subtitle: 'Season milestone',
    description: 'Everyone who logs 250+ miles over the season earns this award.',
    fields: { period: 'season', metric: 'distance_miles', aggregation: 'milestone', milestoneThreshold: 250 }
  },
  {
    key: 'season_miles_leader', icon: '🏆', label: 'Season Miles Leader', subtitle: 'Top miles',
    description: 'Member with the most total miles over the season.',
    fields: { period: 'season', metric: 'distance_miles', aggregation: 'most' }
  },
  {
    key: 'season_mvp', icon: '🥇', label: 'Season MVP', subtitle: 'Top points',
    description: 'Member with the most total points over the season.',
    fields: { period: 'season', metric: 'points', aggregation: 'most' }
  },
  {
    key: 'weekly_points_leader', icon: '⭐', label: 'Weekly Points Leader', subtitle: 'Top points (weekly)',
    description: 'Weekly award for the member with the most points this week.',
    fields: { period: 'weekly', metric: 'points', aggregation: 'most' }
  },
  {
    key: 'most_active_week', icon: '🔥', label: 'Most Active Week', subtitle: 'Top activity count',
    description: 'Weekly award for the member with the most logged activities.',
    fields: { period: 'weekly', metric: 'activities_count', aggregation: 'most' }
  },
  {
    key: 'iron_week', icon: '💪', label: 'Iron Week', subtitle: '7-day streak',
    description: 'Members who log a qualifying activity every single day of the week.',
    fields: { period: 'weekly', metric: 'activities_count', aggregation: 'longest_streak', streakMinMilesPerDay: 0, streakMinActivitiesPerDay: 1 }
  },
  {
    key: 'perfect_season_one_mile', icon: '🌟', label: 'Perfect Season (1 mi/day)', subtitle: 'Every day, 1+ mile',
    description: 'Everyone who logs 1+ miles on every day of the season.',
    fields: { period: 'season', metric: 'distance_miles', aggregation: 'perfect_season', streakMinMilesPerDay: 1, streakMinActivitiesPerDay: 0 }
  },
  {
    key: 'longest_active_streak', icon: '🛤️', label: 'Longest Active Streak', subtitle: 'Consecutive days',
    description: 'Member with the longest unbroken run of active days during the season.',
    fields: { period: 'season', metric: 'activities_count', aggregation: 'longest_streak', streakMinMilesPerDay: 0, streakMinActivitiesPerDay: 1 }
  },
  {
    key: 'most_active_days', icon: '📅', label: 'Most Active Days', subtitle: 'Distinct days',
    description: 'Member with the most distinct active days during the season.',
    fields: { period: 'season', metric: 'activities_count', aggregation: 'most_active_days', streakMinMilesPerDay: 0, streakMinActivitiesPerDay: 1 }
  },
  {
    key: 'most_elevation_week', icon: '⛰️', label: 'Mountain Goat', subtitle: 'Most elevation (weekly)',
    description: 'Weekly award for the member with the most elevation gain.',
    fields: { period: 'weekly', metric: 'elevation_gain_ft', aggregation: 'most' }
  },
  {
    key: 'most_elevation_season', icon: '🏔️', label: 'Summit King/Queen', subtitle: 'Most elevation (season)',
    description: 'Season award for the member with the most total elevation gain.',
    fields: { period: 'season', metric: 'elevation_gain_ft', aggregation: 'most' }
  },
  {
    key: 'fastest_pace_week', icon: '⚡', label: 'Speed Demon', subtitle: 'Fastest pace (weekly)',
    description: 'Weekly award for the member with the fastest pace on a run of 1+ miles.',
    fields: { period: 'weekly', metric: 'pace_min_per_mile', aggregation: 'fastest', minDistanceMiles: 1 }
  },
  {
    key: 'most_daily_workouts', icon: '💥', label: 'Daily Double', subtitle: 'Most workouts in a day',
    description: 'Member who logged the most workouts in a single day (1+ mile each).',
    fields: { period: 'weekly', metric: 'activities_count', aggregation: 'best_day', minDistanceMiles: 1 }
  },
  {
    key: 'week_streak', icon: '🔗', label: 'Week Warrior', subtitle: 'Workout every day this week',
    description: 'Members who log at least one qualifying activity every day of the week.',
    fields: { period: 'weekly', metric: 'activities_count', aggregation: 'perfect_season', streakMinMilesPerDay: 0, streakMinActivitiesPerDay: 1 }
  }
];

function addAwardFromPreset(preset) {
  const id = `award_${Date.now()}`;
  cats.value.push({
    id,
    type: 'award',
    icon: preset.icon,
    label: preset.label,
    active: true,
    period: preset.fields.period || 'weekly',
    monthEndDay: 'last',
    activityType: '',
    terrainFilter: '',
    minDistanceMiles: undefined,
    metric: preset.fields.metric || 'distance_miles',
    aggregation: preset.fields.aggregation || 'most',
    milestoneThreshold: preset.fields.milestoneThreshold ?? undefined,
    referenceTarget: undefined,
    groupFilter: '',
    streakMinMilesPerDay: preset.fields.streakMinMilesPerDay ?? undefined,
    streakMinActivitiesPerDay: preset.fields.streakMinActivitiesPerDay ?? undefined
  });
  emit_();
}

// ── Random icon (Phase 2): scoped to Award sub-category ───────────
const shufflingIconAwardId = ref(null);
async function shuffleAwardIcon(aw) {
  if (!props.clubId) return;
  if (shufflingIconAwardId.value === aw.id) return;
  shufflingIconAwardId.value = aw.id;
  try {
    const current = isLibraryIcon(aw.icon)
      ? Number.parseInt(String(aw.icon).replace(/^icon:/i, ''), 10) || null
      : null;
    const pick = await shuffleLibraryIcon(props.clubId, { subCategory: 'Award', avoidIconId: current });
    if (!pick) return;
    const key = `icon:${pick.id}`;
    if (pick.url) libraryIconCache.value = { ...libraryIconCache.value, [key]: toUploadsUrl(pick.url) || pick.url };
    aw.icon = key;
    emit_();
  } catch {
    // swallow — the user can try again or pick manually
  } finally {
    shufflingIconAwardId.value = null;
  }
}

// ── Suggest label (Phase 2) ───────────────────────────────────────
// Deterministic lookup — not a creative AI call — so standard awards stay consistent.
function suggestAwardLabel(aw) {
  const metric = String(aw.metric || '').toLowerCase();
  const agg = String(aw.aggregation || '').toLowerCase();
  const period = String(aw.period || 'weekly').toLowerCase();
  const periodWord = { weekly: 'Weekly', monthly: 'Monthly', season: 'Season', challenge: 'Challenge' }[period] || 'Season';
  const metricWord = {
    points: 'Points',
    distance_miles: 'Miles',
    duration_minutes: 'Minutes',
    activities_count: 'Activities',
    challenge_completions: 'Challenges',
    kudos_received: 'Kudos'
  }[metric] || 'Score';

  let label = '';
  if (agg === 'milestone') {
    const threshold = Number(aw.milestoneThreshold) || 100;
    if (metric === 'distance_miles') label = `${threshold} Mile Club`;
    else if (metric === 'points') label = `${threshold} Point Club`;
    else label = `${threshold} ${metricWord} Club`;
  } else if (agg === 'longest_streak') {
    label = period === 'weekly' ? 'Iron Week' : 'Longest Active Streak';
  } else if (agg === 'most_active_days') {
    label = 'Most Active Days';
  } else if (agg === 'perfect_season') {
    label = 'Perfect Season';
  } else if (agg === 'best_single') {
    label = `Best Single ${metricWord}`;
  } else if (agg === 'best_day') {
    label = `Best Day ${metricWord}`;
  } else if (agg === 'average') {
    label = `Average ${metricWord} Leader`;
  } else if (agg === 'least') {
    label = `Least ${metricWord}`;
  } else {
    label = `${periodWord} ${metricWord} Leader`;
  }
  aw.label = label;
  emit_();
}

// ── Streak aggregation detection (shared with Phase 5 UI) ─────────
function isStreakAggregation(agg) {
  return agg === 'longest_streak' || agg === 'most_active_days' || agg === 'perfect_season';
}

// ── Tenant award import ───────────────────────────────────────────
const tenantImportAwards  = ref([]);
const tenantAwardsLoading = ref(false);
const tenantAwardsLoaded  = ref(false);
const importMessage       = ref('');
const importOk            = ref(false);

const summitStatsSelectPlaceholder = computed(() => {
  if (tenantAwardsLoading.value) return 'Loading Summit Stats Library…';
  if (tenantAwardsLoaded.value && !tenantImportAwards.value.length) return 'No awards in Summit Stats Library';
  return 'Add one from Summit Stats Library…';
});

async function ensureTenantAwardsLoaded() {
  if (tenantAwardsLoaded.value || !props.clubId) return;
  tenantAwardsLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/tenant-awards`);
    tenantImportAwards.value = Array.isArray(data?.awards) ? data.awards : [];
    tenantAwardsLoaded.value = true;
  } catch {
    tenantImportAwards.value = [];
    tenantAwardsLoaded.value = true;
  } finally {
    tenantAwardsLoading.value = false;
  }
}

function summitStatsAwardOptionLabel(ta) {
  if (!ta) return '';
  const ic = ta.icon;
  if (typeof ic === 'string' && ic.startsWith('icon:')) return ta.label || 'Award';
  return `${ic || '🏆'} ${ta.label || ''}`.trim();
}

function addOneSummitStatsAward() {
  const ta = tenantImportAwards.value.find((a) => String(a.id) === String(selectedSummitStatsAwardId.value));
  if (!ta) return;
  addAwardFromLibrary(ta);
  selectedSummitStatsAwardId.value = '';
}

function importAllTenantAwards() {
  if (!tenantAwardsLoaded.value) {
    ensureTenantAwardsLoaded().then(() => importAllTenantAwards());
    return;
  }
  if (!tenantImportAwards.value.length) {
    importMessage.value = 'No awards found in Summit Stats Library.';
    importOk.value = false;
    return;
  }
  let added = 0;
  for (const ta of tenantImportAwards.value) {
    addAwardFromLibrary(ta);
    added++;
  }
  importMessage.value = `Added ${added} award${added === 1 ? '' : 's'} from Summit Stats Library.`;
  importOk.value = true;
  setTimeout(() => { importMessage.value = ''; }, 4000);
}

// ── Previous season import ────────────────────────────────────────
const previousSeasons     = ref([]);
const seasonsLoaded       = ref(false);
const seasonsLoading      = ref(false);
const selectedSeasonId    = ref('');
const seasonImportLoading = ref(false);

async function ensureSeasonsLoaded() {
  if (seasonsLoaded.value || !props.clubId || seasonsLoading.value) return;
  seasonsLoading.value = true;
  try {
    const { data } = await api.get('/learning-program-classes', { params: { organizationId: props.clubId, includeArchived: true } });
    previousSeasons.value = Array.isArray(data?.classes) ? data.classes : (Array.isArray(data) ? data : []);
    seasonsLoaded.value = true;
  } catch {
    previousSeasons.value = [];
    seasonsLoaded.value = true;
  } finally {
    seasonsLoading.value = false;
  }
}

async function importFromSeason() {
  if (!selectedSeasonId.value) return;
  seasonImportLoading.value = true;
  importMessage.value = '';
  try {
    const { data } = await api.get(`/learning-program-classes/${selectedSeasonId.value}`);
    const rawSettings = data?.class?.season_settings_json ?? data?.season_settings_json;
    const settings = rawSettings
      ? (typeof rawSettings === 'string' ? JSON.parse(rawSettings) : rawSettings)
      : {};
    const seasonAwards = (settings?.recognition?.categories || []).filter(c => c.type === 'award' || c.type === 'standard' || c.type === 'custom');
    if (!seasonAwards.length) {
      importMessage.value = 'No recognition awards found in that season.';
      importOk.value = false;
      return;
    }
    let added = 0;
    for (const sa of seasonAwards) {
      addAwardFromLibrary(sa);
      added++;
    }
    importMessage.value = `Copied ${added} award${added === 1 ? '' : 's'} from selected season.`;
    importOk.value = true;
    selectedSeasonId.value = '';
    setTimeout(() => { importMessage.value = ''; }, 4000);
  } catch {
    importMessage.value = 'Could not load that season. Please try again.';
    importOk.value = false;
  } finally {
    seasonImportLoading.value = false;
  }
}

// ── Icon picker ───────────────────────────────────────────────────
const iconPickerOpenId = ref(null);
const iconPickerTab    = ref('emoji'); // 'emoji' | 'library'

// Library icons (from club's icon system)
const libraryIcons        = ref([]);
const libraryIconsLoading = ref(false);
const libraryIconsLoaded  = ref(false);
// Cache for library icon URL resolution (icon:ID → url string)
const libraryIconCache    = ref({});

async function ensureLibraryLoaded() {
  if (libraryIconsLoaded.value || !props.clubId) return;
  libraryIconsLoading.value = true;
  try {
    const { data } = await api.get(`/summit-stats/clubs/${props.clubId}/icons`);
    libraryIcons.value = Array.isArray(data?.icons) ? data.icons : [];
    const next = { ...libraryIconCache.value };
    libraryIcons.value.forEach((i) => {
      if (i.id && i.url) next[`icon:${i.id}`] = i.url;
    });
    libraryIconCache.value = next;
    libraryIconsLoaded.value = true;
  } catch {
    libraryIcons.value = [];
  } finally {
    libraryIconsLoading.value = false;
  }
}

function isLibraryIcon(icon) {
  return typeof icon === 'string' && icon.startsWith('icon:');
}

const libraryIconFetchPending = new Set();

function resolveLibraryIconUrl(icon) {
  if (!isLibraryIcon(icon)) return null;
  const key = String(icon).trim();
  const cached = libraryIconCache.value[key];
  if (cached) return cached;
  const id = parseInt(key.replace(/^icon:/i, ''), 10);
  if (!id) return null;
  if (!libraryIconFetchPending.has(key)) {
    libraryIconFetchPending.add(key);
    api.get(`/icons/${id}`, { skipGlobalLoading: true })
      .then(({ data }) => {
        let u = data?.url || null;
        if (!u && data?.file_path) {
          u = data.file_path;
        }
        if (u) {
          libraryIconCache.value = { ...libraryIconCache.value, [key]: toUploadsUrl(u) || u };
        }
      })
      .catch(() => {})
      .finally(() => libraryIconFetchPending.delete(key));
  }
  return null;
}

function toggleIconPicker(id) {
  if (iconPickerOpenId.value === id) {
    iconPickerOpenId.value = null;
  } else {
    iconPickerOpenId.value = id;
    iconPickerTab.value = 'emoji';
  }
}

function pickIcon(aw, icon) {
  aw.icon = icon;
  iconPickerOpenId.value = null;
  emit_();
}

function pickLibraryIcon(aw, libIcon) {
  const key = `icon:${libIcon.id}`;
  if (libIcon.url) libraryIconCache.value = { ...libraryIconCache.value, [key]: libIcon.url };
  aw.icon = key;
  iconPickerOpenId.value = null;
  emit_();
}

watch(awards, (list) => {
  list.forEach((aw) => {
    if (isLibraryIcon(aw?.icon)) resolveLibraryIconUrl(aw.icon);
  });
}, { deep: true, immediate: true });

// ── Activity type management ──────────────────────────────────────
const showAddActivityType = ref(false);
const newActivityTypeDraft = ref('');
const activityTypeInputRef = ref(null);

function openAddActivityType() {
  showAddActivityType.value = true;
  newActivityTypeDraft.value = '';
  nextTick(() => activityTypeInputRef.value?.focus());
}

function commitActivityType() {
  const val = newActivityTypeDraft.value.trim();
  if (val && cfgActivity.value) {
    if (!cfgActivity.value.types) cfgActivity.value.types = [];
    if (!cfgActivity.value.types.includes(val)) {
      cfgActivity.value.types.push(val);
      emit_();
    }
  }
  showAddActivityType.value = false;
}
</script>

<style scoped>
/* ── Root ─────────────────────────────────────────────────────── */
.rcb {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Panel ───────────────────────────────────────────────────── */
.rcb-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rcb-panel-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 4px;
}

.rcb-panel-head--between {
  align-items: center;
  justify-content: space-between;
}

.rcb-panel-head-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.rcb-panel-add-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border, #e2e8f0);
  background: #fff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary, #1d4ed8);
  font-weight: 300;
}
.rcb-panel-add-btn:hover { background: #eff6ff; border-color: var(--primary, #1d4ed8); }

.rcb-panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary, #0f172a);
  white-space: nowrap;
}

.rcb-panel-hint {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
}

/* ── Eligibility group rows ──────────────────────────────────── */
.rcb-group-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 9px 12px;
}

.rcb-group-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  user-select: none;
  min-width: 130px;
}

.rcb-group-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
}

.rcb-group-sub {
  font-size: 12px;
  color: var(--text-secondary, #64748b);
  white-space: nowrap;
}

.rcb-group-sep {
  font-size: 14px;
  color: var(--border, #cbd5e1);
  font-weight: 300;
}

.rcb-off-label {
  font-size: 11px;
  color: var(--text-secondary, #94a3b8);
  font-style: italic;
}

.rcb-num-input {
  width: 64px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  background: white;
}

.rcb-title-chip {
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  width: 108px;
  background: white;
}

/* ── Custom group cards ──────────────────────────────────────── */
.rcb-custom-group-card {
  background: var(--bg-alt, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rcb-custom-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rcb-group-label-input {
  flex: 1;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 600;
  background: white;
}

.rcb-criteria-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rcb-crit-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.rcb-crit-val {
  width: 80px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

/* ── Buttons ─────────────────────────────────────────────────── */
.rcb-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.rcb-remove-btn {
  color: var(--text-secondary, #94a3b8);
  font-size: 18px;
  margin-left: auto;
}
.rcb-remove-btn:hover { color: #dc2626; }

.rcb-text-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--primary, #1d4ed8);
  padding: 2px 0;
  font-weight: 600;
}
.rcb-text-btn:hover { text-decoration: underline; }

.rcb-dashed-btn {
  align-self: flex-start;
  background: none;
  border: 1px dashed var(--border, #cbd5e1);
  border-radius: 8px;
  padding: 7px 16px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
}
.rcb-dashed-btn:hover { border-color: var(--text-secondary, #64748b); background: #f8fafc; }

.rcb-dashed-btn--primary {
  color: var(--primary, #1d4ed8);
  border-color: var(--primary-light, #93c5fd);
  padding: 9px 20px;
  font-size: 13px;
}
.rcb-dashed-btn--primary:hover { border-color: var(--primary, #1d4ed8); background: #eff6ff; }

/* ── Selects ─────────────────────────────────────────────────── */
.rcb-select {
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  background: white;
  color: var(--text-primary, #0f172a);
}

.rcb-select--xs { min-width: 80px; }

/* ── Award cards ─────────────────────────────────────────────── */
.rcb-empty {
  font-size: 13px;
  color: var(--text-secondary, #94a3b8);
  font-style: italic;
  padding: 8px 0;
}

.rcb-award-card {
  background: white;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: opacity 0.15s;
}

.rcb-award--off {
  opacity: 0.55;
}

/* Row 1: icon + title + toggle + remove */
.rcb-award-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Icon picker */
.rcb-icon-picker-wrap {
  position: relative;
  flex-shrink: 0;
}

.rcb-icon-display {
  font-size: 22px;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  background: var(--bg-alt, #f8fafc);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rcb-icon-display:hover { border-color: var(--primary, #1d4ed8); background: #eff6ff; }

.rcb-icon-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 100;
  background: white;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  padding: 0;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  min-width: 240px;
  overflow: hidden;
}

.rcb-icon-tabs {
  display: flex;
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.rcb-icon-tab {
  flex: 1;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.rcb-icon-tab.active { color: var(--primary, #1d4ed8); border-bottom-color: var(--primary, #1d4ed8); }

.rcb-icon-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  padding: 8px;
}

.rcb-lib-icons { padding: 8px; min-height: 60px; }
.rcb-lib-hint { font-size: 12px; color: var(--text-secondary, #94a3b8); text-align: center; padding: 12px 0; }

.rcb-icon-option {
  font-size: 20px;
  width: 30px;
  height: 30px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.rcb-icon-option:hover { background: #f1f5f9; }
.rcb-icon-option--active { background: #eff6ff; outline: 2px solid #1d4ed8; }
.rcb-icon-option--img img { width: 22px; height: 22px; object-fit: contain; }

.rcb-icon-img { width: 22px; height: 22px; object-fit: contain; }
.rcb-icon-loading { font-size: 18px; line-height: 1; opacity: 0.75; }

.rcb-award-title-input {
  flex: 1;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #0f172a);
}
.rcb-award-title-input:focus { outline: 2px solid var(--primary, #1d4ed8); border-color: transparent; }

/* Toggle switch */
.rcb-toggle-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.rcb-toggle-switch input { position: absolute; opacity: 0; width: 0; height: 0; }

.rcb-switch-track {
  width: 36px;
  height: 20px;
  background: #cbd5e1;
  border-radius: 99px;
  position: relative;
  transition: background 0.2s;
}

.rcb-switch-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.rcb-toggle-switch input:checked + .rcb-switch-track { background: #22c55e; }
.rcb-toggle-switch input:checked + .rcb-switch-track::after { transform: translateX(16px); }

/* Row 2: settings row */
.rcb-award-settings {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 4px;
  border-top: 1px solid var(--border, #f1f5f9);
}

.rcb-award-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 110px;
}

.rcb-field-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #64748b);
}

.rcb-field-hint {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 10px;
  color: #94a3b8;
}

/* Row 3-4: group filter / variants */
.rcb-award-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  flex-wrap: wrap;
}

.rcb-award-row > .rcb-field-label {
  padding-top: 6px;
  white-space: nowrap;
  min-width: 110px;
}

/* ── Chips ───────────────────────────────────────────────────── */
.rcb-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.rcb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #e0e7ff;
  color: #3730a3;
  border-radius: 99px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 600;
  border: none;
}

.rcb-chip-x {
  background: none;
  border: none;
  cursor: pointer;
  color: #6366f1;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}
.rcb-chip-x:hover { color: #dc2626; }

.rcb-chip-add {
  background: none;
  border: 1px dashed var(--border, #cbd5e1);
  color: var(--primary, #1d4ed8);
  border-radius: 99px;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  cursor: pointer;
}
.rcb-chip-add:hover { background: #eff6ff; border-color: var(--primary, #1d4ed8); }

/* ── Inline input / confirm / cancel ─────────────────────────── */
.rcb-inline-input {
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  width: 140px;
}

.rcb-confirm-btn {
  background: var(--primary, #1d4ed8);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
}

.rcb-cancel-btn {
  background: none;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary, #64748b);
}

/* ── Activity type modal ─────────────────────────────────────── */
.rcb-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.35);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rcb-modal {
  background: white;
  border-radius: 14px;
  padding: 24px;
  width: 380px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}

.rcb-modal-input {
  width: 100%;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 14px;
  margin-bottom: 14px;
  box-sizing: border-box;
}
.rcb-modal-input:focus { outline: 2px solid var(--primary, #1d4ed8); border-color: transparent; }

.rcb-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* ── Library bar (add from library row) ──────────────────────── */
.rcb-import-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.rcb-library-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 7px;
}
.rcb-import-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 7px;
}
.rcb-import-btn {
  flex: 1;
  padding: 6px 12px;
  border: 1px dashed #22c55e;
  border-radius: 6px;
  background: transparent;
  color: #15803d;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
}
.rcb-import-btn:hover:not(:disabled) {
  background: #dcfce7;
}
.rcb-import-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.rcb-import-btn--club {
  border-color: #3b82f6;
  color: #1d4ed8;
}
.rcb-import-btn--club:hover:not(:disabled) { background: #eff6ff; }
.rcb-import-msg {
  font-size: 0.82rem;
  color: #b91c1c;
  padding: 2px 4px;
}
.rcb-import-msg--ok {
  color: #15803d;
}
.rcb-library-select {
  flex: 1;
  min-width: 0;
}

/* ── Standardized award preset drawer (Phase 2) ──────────────── */
.rcb-preset-drawer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: 8px;
  margin-bottom: 6px;
}
.rcb-preset-toggle {
  align-self: flex-start;
  background: #fff7ed;
  border: 1px solid #fdba74;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #9a3412;
  cursor: pointer;
}
.rcb-preset-toggle:hover { background: #ffedd5; }
.rcb-preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 8px;
}
.rcb-preset-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  transition: transform 0.1s, box-shadow 0.1s;
}
.rcb-preset-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(250, 204, 21, 0.25);
}
.rcb-preset-icon { font-size: 1.4rem; line-height: 1; }
.rcb-preset-label { font-size: 0.82rem; font-weight: 700; color: #0f172a; }
.rcb-preset-sub { font-size: 0.72rem; color: #64748b; }

/* ── Assist row on each award card (random icon + suggest label) ─ */
.rcb-assist-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 2px;
}
.rcb-assist-btn {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  padding: 3px 9px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #0369a1;
  cursor: pointer;
}
.rcb-assist-btn:hover:not(:disabled) { background: #e0f2fe; border-color: #7dd3fc; }
.rcb-assist-btn:disabled { opacity: 0.6; cursor: default; }

/* ── Streak-specific config (Phase 5) ────────────────────────── */
.rcb-streak-config {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px;
  background: #ecfeff;
  border: 1px dashed #67e8f9;
  border-radius: 8px;
}

/* ── Save to library footer on each award card ───────────────── */
.rcb-award-save-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 6px;
  border-top: 1px solid var(--border, #f1f5f9);
  margin-top: 4px;
}
.rcb-save-library-btn {
  background: none;
  border: none;
  font-size: 11px;
  color: var(--text-secondary, #64748b);
  cursor: pointer;
  padding: 2px 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.rcb-save-library-btn:hover { color: var(--primary, #2563eb); }

/* ── Bulk create button + actions row ────────────────────────── */
.rcb-award-actions-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.rcb-bulk-btn {
  background: #1e293b;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.rcb-bulk-btn:hover { background: #334155; }

/* ── Min distance num input variant ────────────────────────── */
.rcb-num-input--wide { width: 80px; }

/* ── Bulk creator overlay & modal ────────────────────────────── */
.rcb-bulk-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 3000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 32px 12px;
  overflow-y: auto;
}
.rcb-bulk-modal {
  background: #fff;
  border-radius: 14px;
  width: 100%;
  max-width: 860px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;
}
.rcb-bulk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}
.rcb-bulk-title { font-size: 17px; font-weight: 700; margin: 0; }
.rcb-bulk-close {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #94a3b8;
  line-height: 1;
  padding: 2px 6px;
}
.rcb-bulk-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}
.rcb-bulk-body--scroll { overflow-y: auto; }
.rcb-bulk-hint {
  font-size: 13px;
  color: #64748b;
  margin: 0 0 12px 0;
}
.rcb-bulk-icon-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.rcb-bulk-icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px;
}
.rcb-bulk-icon-btn {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  width: 52px;
  height: 52px;
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.1s, background 0.1s;
}
.rcb-bulk-icon-btn:hover { border-color: #93c5fd; background: #eff6ff; }
.rcb-bulk-icon-btn.selected { border-color: #2563eb; background: #dbeafe; }
.rcb-bulk-icon-btn--img img { width: 34px; height: 34px; object-fit: contain; border-radius: 4px; }
.rcb-bulk-step1-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
}
.rcb-bulk-count { font-size: 13px; color: #64748b; }
.rcb-bulk-rows { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.rcb-bulk-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 10px;
}
.rcb-bulk-row-icon {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.rcb-bulk-row-emoji { font-size: 26px; line-height: 1; }
.rcb-bulk-row-img { width: 32px; height: 32px; object-fit: contain; border-radius: 4px; }
.rcb-bulk-row-title {
  flex: 1;
  min-width: 140px;
  font-size: 13px;
  padding: 5px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
.rcb-bulk-select { font-size: 12px; padding: 4px 6px; min-width: 90px; }
.rcb-bulk-step2-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  flex-wrap: wrap;
}
</style>
