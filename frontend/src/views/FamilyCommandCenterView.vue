<template>
  <div class="fcc" :class="{ 'fcc-gate': !dashboard, 'fcc-calendar-screen': dashboard && tab === 'Calendar', 'fcc-nav-expanded': navExpanded }">
    <div v-if="loading && !dashboard" class="fcc-welcome"><div class="fcc-mark">⌂</div><h1>A little more together.</h1><p>Opening your family dashboard…</p></div>
    <section v-else-if="!session" class="fcc-welcome">
      <div class="fcc-mark">⌂</div><span class="eyebrow">YOUR EVERYDAY, TOGETHER</span><h1>Family Command Center</h1><p>A home for everything that makes a family.</p>
      <form @submit.prevent="unlock" class="fcc-login" autocomplete="on">
        <details><summary class="fcc-small">Use a specific organization (optional)</summary><label>Organization<input v-model="organization" placeholder="Organization’s portal name" @change="agencyId=null; resolveTenant()" /></label></details>
        <span v-if="tenant" class="fcc-tenant">{{ tenant.name }}</span>
        <label>Account email{{ needsEmail ? "" : " (optional, for saved sign-in)" }}<input v-model="email" id="family-username" name="username" type="email" autocomplete="username" :required="needsEmail" /></label>
        <label>Your six-digit code<input v-model="pin" class="fcc-pin" type="password" inputmode="numeric" id="family-passcode" name="password" autocomplete="current-password" maxlength="6" pattern="[0-9]{6}" placeholder="••••••" required /></label>
        <button class="fcc-primary" :disabled="busy || pin.length !== 6">{{ busy ? 'Opening…' : 'Come on in →' }}</button>
      </form><p class="fcc-small">Use your Privacy & Quick View code. This device stays signed in until you sign out or reset access.</p>
    </section>
    <section v-else-if="!dashboard" class="fcc-welcome">
      <div class="fcc-mark">⌂</div><h1>Make yourself at home.</h1><p>Create your household to bring everyone’s day together.</p>
      <form class="fcc-login" @submit.prevent="createHome"><label>Household name<input v-model="householdName" placeholder="The Anderson family" required maxlength="120" /></label><label>Time zone<input v-model="timezone" required /></label><button class="fcc-primary" :disabled="busy">Create our home</button></form>
      <form class="fcc-login" @submit.prevent="joinHome"><label>Already invited? Paste your invitation code<input v-model="inviteCode" /></label><button :disabled="busy || !inviteCode">Join a household</button></form>
    </section>

    <template v-if="dashboard">
      <aside class="fcc-sidebar"><button class="fcc-nav-toggle" :aria-expanded="navExpanded" aria-controls="family-navigation" :aria-label="navExpanded ? 'Collapse navigation' : 'Expand navigation'" @click="navExpanded=!navExpanded">☰ <span v-if="navExpanded">Menu</span></button>
        <a class="fcc-brand" href="#" @click.prevent="tab='Calendar'" aria-label="Family calendar"><span class="fcc-mark">⌂</span><span>family<span class="fcc-brand-sub">COMMAND CENTER</span></span></a>
        <div class="fcc-house-name">{{ dashboard.household.name }}</div>
        <nav id="family-navigation" aria-label="Family navigation"><button v-for="item in nav" :key="item.label" :class="{ selected: tab === item.label }" :title="item.label" :aria-label="item.label" :aria-current="tab === item.label ? 'page' : undefined" @click="item.label==='Focus music' ? musicOpen=!musicOpen : tab=item.label"><span aria-hidden="true">{{ item.icon }}</span><span class="fcc-nav-label">{{ item.label }}</span><span v-if="item.label==='Lists' && uncheckedLists" class="fcc-count">{{ uncheckedLists }}</span></button></nav>
        <div class="fcc-sidebar-foot"><span class="fcc-live-dot" /> All together, wherever you are.<button @click="logout">Sign out of this device</button></div>
      </aside>
      <main class="fcc-main"><FamilyFocusMusic ref="focusMusic" :http="http" :open="musicOpen" :user-id="session.userId" @close="musicOpen=false" @open="musicOpen=true" />
        <header class="fcc-topbar"><div><span class="eyebrow">{{ dateLabel }}</span><h1>{{ tab === 'Home' ? greeting : tab }}<span v-if="tab==='Home'" class="fcc-sun"> ☀</span></h1><p>{{ tab === 'Home' ? 'Here’s what’s happening in your little world.' : dashboard.household.name }}</p></div><div class="fcc-top-actions"><span class="fcc-clock">{{ timeLabel }}</span><div v-if="tab==='Calendar'" class="fcc-member-filters" aria-label="Filter by family member"><button v-for="m in dashboard.members" :key="m.user_id" :aria-pressed="activeMember===String(m.user_id)" :aria-label="'Show '+m.display_name+'’s calendar'" @click="activeMember=activeMember===String(m.user_id)?'all':String(m.user_id)"><span class="fcc-filter-avatar" :style="calendarEventStyle({memberId:m.user_id}, 'person', dashboard.members)"><img v-if="m.photo_url" :src="m.photo_url" alt="" /><template v-else>{{ m.display_name[0] }}</template></span><small>{{ m.display_name }}</small></button><button :aria-pressed="activeMember==='all'" @click="activeMember='all'"><span class="fcc-filter-avatar">◎</span><small>All</small></button></div><div v-else class="fcc-avatar-stack"><span v-for="m in dashboard.members.slice(0,5)" :key="m.user_id" :style="{ background: m.color }"><img v-if="m.photo_url" :src="m.photo_url" alt="" />{{ m.photo_url ? '' : m.display_name[0] }}</span></div><button class="fcc-voice-launch" @click="openVoiceEvent">🎙 Voice event</button><button class="fcc-primary" @click="openEditor('event')">＋ Add event</button></div></header>

        <div v-if="tab==='Home'" class="fcc-pocket-shortcut"><button @click="tab='On the go'">↗ Lists &amp; email · On the go</button><span>Your groceries, to-dos and upcoming plans in one easy view.</span></div>
        <FamilyPocket v-if="tab==='On the go'" :key="householdId" :http="http" :household-id="householdId" :is-parent="isParent" @updated="loadDashboard" @error="report" />
        <div v-if="tab==='Home'" class="fcc-hero-row">
          <section class="fcc-upnext" :style="heroStyle">

            <div class="fcc-hero-copy"><span class="eyebrow">{{ upNext ? 'UP NEXT · ' + eventType(upNext.metadata.eventType).label.toUpperCase() : 'ROOM TO BREATHE' }}</span><h2>{{ upNext?.title || 'A little space for family.' }}</h2><p v-if="upNext?.member_user_id" class="fcc-hero-member"><span class="fcc-avatar" :style="{background:member(upNext.member_user_id)?.color}"><img v-if="member(upNext.member_user_id)?.photo_url" :src="member(upNext.member_user_id).photo_url" alt="" />{{ member(upNext.member_user_id)?.photo_url?'':memberName(upNext.member_user_id)[0] }}</span>{{ memberName(upNext.member_user_id) }}</p><p>{{ upNext ? eventTime(upNext) : 'Your next adventure starts with a plan.' }}</p><p v-if="upNext?.metadata.address">⌖ {{ upNext.metadata.address }}</p><p v-if="upNext?.metadata.dropoff">↗ {{ upNext.metadata.dropoff }} is on drop-off duty</p><button @click="upNext ? openDetails(upNext) : openEditor('event')">{{ upNext ? 'View details ↗' : 'Plan something together ＋' }}</button></div>
            <div v-if="upNext" class="fcc-countdown"><span>{{ minutesUntil(upNext) <= 0 ? 'Happening' : 'Starts in' }}</span><strong>{{ minutesUntil(upNext) <= 0 ? 'now' : minutesUntil(upNext) < 60 ? minutesUntil(upNext) : Math.floor(minutesUntil(upNext)/60) }}</strong><span>{{ minutesUntil(upNext) <= 0 ? '' : minutesUntil(upNext)<60 ? 'minutes' : 'hours' }}</span></div>
          </section>
          <section class="family-card fcc-pulse"><header><h2>♡ Family pulse</h2><span class="fcc-small">TODAY</span></header><div><span class="pulse-icon violet">▦</span><strong>{{ todayEvents.length }}</strong><span>Plans on the calendar</span></div><div><span class="pulse-icon green">✓</span><strong>{{ chores.filter(c=>!choreDone(c)).length }}</strong><span>Chores to go</span></div><div><span class="pulse-icon pink">♡</span><strong>{{ familyPoints }}</strong><span>Points earned together</span></div><div><span class="pulse-icon amber">☷</span><strong>{{ uncheckedLists }}</strong><span>Things on your lists</span></div></section>
        </div>



        <div class="fcc-grid" v-if="['Home','Chores','Rewards','Lists','Meals','Family'].includes(tab)">
          <FamilyPager v-if="['Home','Chores'].includes(tab)" title="✓ Chores, little wins" :pages="['Everyone', ...dashboard.members.map(m=>m.display_name)]">
            <template #default="{index}"><div class="fcc-card-intro"><span>{{ chores.filter(c=>choreDone(c)).length }} of {{ chores.length }} complete</span><button v-if="isParent" @click="openEditor('chore')">＋ Add</button></div><div class="fcc-progress"><span :style="{width: (chores.length ? chores.filter(c=>choreDone(c)).length/chores.length*100 : 0)+'%'}" /></div>
              <div v-for="c in chores.filter(c=>index===0 || c.assigned_user_id===dashboard.members[index-1]?.user_id)" :key="c.id" class="fcc-check-row"><button class="fcc-check" :class="{ checked: choreDone(c) }" :disabled="busy || !!choreActivity(c)" :aria-label="'Complete '+c.title" @click="act(c,'complete')">{{ choreDone(c) ? '✓' : choreActivity(c) ? '◷' : '' }}</button><button class="fcc-row-title" @click="openDetails(c)">{{ c.title }}<small>{{ memberName(c.assigned_user_id) }} · {{ c.metadata.points }} pts {{ c.metadata.recurrence !== 'none' ? '· '+c.metadata.recurrence : '' }}</small></button><span class="fcc-mini-avatar" :style="{background: member(c.assigned_user_id)?.color}">{{ memberName(c.assigned_user_id)[0] }}</span></div><p v-if="!chores.length" class="fcc-empty">Small jobs. Big teamwork.<br>Add your first chore to get started.</p>
            </template>
          </FamilyPager>

          <FamilyPager v-if="['Home','Family'].includes(tab)" title="⌂ Around the family" :pages="['Right now', 'Schedules']"><template #default="{ index }"><div v-for="m in dashboard.members" :key="m.user_id" class="fcc-member-row"><span class="fcc-avatar" :style="{background:m.color}"><img v-if="m.photo_url" :src="m.photo_url" alt="" />{{ m.photo_url?'':m.display_name[0] }}</span><div><strong>{{ m.display_name }}</strong><small>{{ index===0 ? memberStatus(m,dashboard.entries,dashboard.work,now) : memberNext(m) }}</small></div><span class="fcc-status-dot" :style="{background:m.color}" /></div><button class="fcc-text-button" @click="tab='Settings'">Manage our family →</button></template></FamilyPager>

          <FamilyPager v-if="tab==='Home'" title="▦ On the horizon" :pages="['Today','Tomorrow','This week']"><template #default="{index}"><div v-for="e in calendarEntries(index)" :key="e.kind+'-'+e.id" class="fcc-agenda-row" @click="e.kind!=='work' && openDetails(e)"><span class="fcc-event-icon" :style="{background:(e.metadata?.color || '#8592a8')+'20'}">{{ e.kind==='work' ? '▣' : entryType(e).icon }}</span><div><button class="fcc-row-title" :disabled="e.kind==='work'">{{ e.title }}</button><small>{{ eventTime(e) }}</small><small v-if="e.member_user_id">{{ memberName(e.member_user_id) }}</small></div></div><p v-if="!calendarEntries(index).length" class="fcc-empty">A clear page.<br>Make room for something good.</p><button class="fcc-text-button" @click="tab==='Calendar'?openEditor('event'):tab='Calendar'">{{ tab==='Calendar' ? '＋ Add a personal event' : 'Open the family calendar →' }}</button></template></FamilyPager>

          <FamilyPager v-if="['Home','Lists'].includes(tab)" title="☷ Don’t forget" :pages="['Grocery','Shopping','Packing']"><template #default="{page}"><div class="fcc-card-intro"><span>{{ entriesOf(page.toLowerCase()).filter(e=>!e.completed_at).length }} items to go</span><button @click="openEditor(page.toLowerCase())">＋ Add</button></div><div v-for="e in entriesOf(page.toLowerCase())" :key="e.id" class="fcc-check-row"><button class="fcc-check" :class="{checked:e.completed_at}" :disabled="busy" :aria-label="'Toggle '+e.title" @click="act(e,'toggle',{completed:!e.completed_at})">{{ e.completed_at?'✓':'' }}</button><button class="fcc-row-title" :class="{struck:e.completed_at}" @click="openDetails(e)">{{ e.title }}<small>{{ [e.metadata.category, e.member_user_id ? memberName(e.member_user_id) : ''].filter(Boolean).join(' · ') }}</small></button></div><p v-if="!entriesOf(page.toLowerCase()).length" class="fcc-empty">From the kitchen counter<br>to your phone. Add it here.</p></template></FamilyPager>

          <section v-if="tab==='Home'" class="family-card fcc-weather"><header><h2>☀ A look outside</h2><button @click="loadWeather">↻</button></header><template v-if="weather?.status==='ok'"><div class="fcc-weather-now"><span>{{ weatherIcon }}</span><strong>{{ Math.round(weather.current.temperatureF) }}°</strong><div>{{ weatherLabel }}<small>Weather at your home</small></div></div><div class="fcc-forecast"><div v-for="d in weather.forecastDays?.slice(0,4)" :key="d.date"><span>{{ new Date(d.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'}) }}</span><strong>{{ Math.round(d.tempMaxF) }}°</strong><small>{{ Math.round(d.tempMinF) }}°</small></div></div></template><p v-else class="fcc-empty">{{ weather?.status==='missing_home_address' ? 'Add your home address in your account to see your local forecast.' : 'Your local forecast is currently unavailable.' }}</p></section>

          <FamilyPager v-if="['Home','Meals'].includes(tab)" title="♧ Around the table" :pages="['Meals','Announcements']"><template #default="{index}"><div v-for="e in entriesOf(index===0?'meal':'announcement')" :key="e.id" class="fcc-note" @click="openDetails(e)"><span>{{ index===0?'🍽':'✦' }}</span><div><strong>{{ e.title }}</strong><small>{{ e.start_at ? eventTime(e) : e.metadata.notes }}</small></div></div><p v-if="!entriesOf(index===0?'meal':'announcement').length" class="fcc-empty">{{ index===0?'What’s for dinner? Plan something everyone will love.':'A little reminder for everyone at home.' }}</p><button v-if="index===0 || isParent" class="fcc-text-button" @click="openEditor(index===0?'meal':'announcement')">＋ {{ index===0?'Plan a meal':'Leave a note' }}</button></template></FamilyPager>

          <FamilyPager v-if="['Home','Rewards'].includes(tab)" title="☆ Good things add up" :pages="['Rewards','Our progress','History']"><template #default="{index}"><template v-if="index===0"><div v-for="r in entriesOf('reward')" :key="r.id" class="fcc-reward"><span>☆</span><div><strong>{{ r.title }}</strong><small>{{ r.metadata.points }} points</small></div><button @click="openRedemption(r)">Redeem</button></div><p v-if="!entriesOf('reward').length" class="fcc-empty">Something to look forward to.<br>Create a reward for those little wins.</p><button v-if="isParent" class="fcc-text-button" @click="openEditor('reward')">＋ Create a reward</button></template><template v-else-if="index===1"><div v-for="m in dashboard.members" :key="m.user_id" class="fcc-member-row"><span class="fcc-avatar" :style="{background:m.color}">{{ m.display_name[0] }}</span><strong>{{ m.display_name }}</strong><span class="fcc-points">{{ pointsFor(m.user_id) }} pts</span></div></template><template v-else><div v-for="a in dashboard.activity.slice(0,20)" :key="a.id" class="fcc-history"><strong>{{ memberName(a.user_id) }} · {{ a.points>0?'+':'' }}{{ a.points }} pts</strong><small>{{ entryTitle(a.entry_id) }} · {{ a.state }}</small></div><p v-if="!dashboard.activity.length" class="fcc-empty">Your family’s wins will collect here.</p></template></template></FamilyPager>
        </div>

        <div v-if="tab==='Home'" class="fcc-quick-actions"><button @click="openEditor('grocery')">＋ Add to grocery list</button><button v-if="isParent" @click="openEditor('announcement')">✦ Add announcement</button><button @click="tab='Meals'">♧ Find a recipe</button><button @click="tab='Settings'">▧ Photo frame</button><button @click="openEditor('status')">◷ Set a status</button></div>
        <FamilyHomeTools :key="householdId" :http="http" :household-id="householdId" :tab="tab" :is-parent="isParent" :suspended="editor || !!detail || !!redeem" :time="timeLabel" :upcoming="upNext ? upNext.title+' · '+eventTime(upNext) : null" :meals="entriesOf('meal')" @updated="loadDashboard" @error="report" />

        <FamilyCalendarView v-if="tab==='Calendar'" :http="http" :household-id="householdId" :timezone="dashboard.household.timezone" :revision="dashboard" :entries="dashboard.entries" :members="dashboard.members" :member-filter="activeMember" :now="now" @edit="editCalendarEvent" @settings="tab='Settings'" @create="openCalendarSlot" :reschedule="rescheduleCalendarEvent" :saving="busy" />
        <CalendarSharing v-if="isParent && tab==='Settings'" :key="`sharing-${householdId}`" :household-id="householdId" />
        <FamilyCalendarConnection v-if="isParent && tab==='Settings'" :key="householdId" :http="http" :household-id="householdId" :members="dashboard.members" :timezone="dashboard.household.timezone" @updated="loadDashboard" @error="report" />
        <section v-if="isParent && pending.length" class="family-card fcc-approvals"><header><h2>♡ A parent’s thumbs-up</h2></header><div v-for="a in pending" :key="a.id"><span>{{ memberName(a.user_id) }} · {{ entryTitle(a.entry_id) }} · {{ a.points }} points</span><button :disabled="busy" @click="approve(a,'approve')">Approve</button><button :disabled="busy" @click="approve(a,'reject')">Decline</button></div></section>

        <section v-if="tab==='Settings'" class="family-card fcc-settings"><h2>Our family</h2><label v-if="session.households.length>1">Household<select v-model="householdId" @change="loadDashboard"><option v-for="h in session.households" :key="h.id" :value="h.id">{{ h.name }}</option></select></label><p>Time zone: {{ dashboard.household.timezone }}</p><label class="fcc-inline"><input type="checkbox" :checked="member(session.userId)?.share_work" @change="shareWork($event.target.checked)" /> Include my work schedule in this household</label><p class="fcc-small">Work appears as “Work.” The calendar’s details option adds the event category and time. Client names and clinical notes stay private.</p><div v-if="isParent" class="fcc-settings-form"><h3>Everyone’s colors</h3><p>Choose a color for each person or pet. In Calendar, choose “Color by person” to use these colors.</p><div class="fcc-member-colors"><label v-for="m in dashboard.members" :key="m.user_id">{{ m.display_name }}<input type="color" :value="m.color || '#6552a8'" :aria-label="m.display_name+' color'" :disabled="busy" @change="changeMemberColor(m,$event.target.value)" /></label></div></div><form v-if="isParent" @submit.prevent="addMember" class="fcc-settings-form"><h3>Add someone to your family</h3><p>Adults, children and pets can have a name, photo and color without a login. Everyone can use this shared display.</p><label>Family role<select v-model="newMember.role"><option value="member">Child / family member</option><option value="parent">Parent / adult</option><option value="pet">Pet</option></select></label><label>Name<input v-model="newMember.name" required maxlength="80" /></label><label>Color<input v-model="newMember.color" type="color" /></label><label>Photo<input type="file" accept="image/jpeg,image/png,image/webp" @change="pickPhoto($event, 'member')" /></label><button class="fcc-primary" :disabled="busy">Add family member</button></form><div v-if="isParent" class="fcc-settings-form"><h3>Optional: connect another adult’s account</h3><p>They’ll sign in with their own account and join your household.</p><button @click="makeInvite" :disabled="busy">Create a parent invitation</button><label v-if="createdInvite">Share this invitation code (valid for 48 hours)<textarea readonly :value="createdInvite" /></label></div><form class="fcc-settings-form" @submit.prevent="joinHome"><label>Join another household<input v-model="inviteCode" required /></label><button :disabled="busy">Join</button></form><button @click="logout">Sign out of this device</button></section>
        <section v-if="tab==='Smart home'" class="family-card fcc-integration"><div class="fcc-mark">⌂</div><h2>A more connected home, in time.</h2><p>Google Home lights and cameras are not connected yet. Your Google sign-in does not grant access to your home devices.</p><p>Connect a shared Google calendar from Settings to import events. Use On the go for email commands and your live lists. Text-message capture is not connected yet.</p></section>
        <footer v-if="tab!=='Calendar'" class="fcc-bottom"><span>⌂ A place for your people.</span><span>{{ refreshing ? 'Updating…' : 'Saved across your family’s devices' }}</span></footer>
      </main>
    </template>
    <div v-if="error" class="fcc-error" role="alert"><span>{{ error }}</span><button @click="error=''" aria-label="Dismiss error">×</button></div>
    <div v-if="notice" class="fcc-notice" role="status">{{ notice }}</div>

    <div v-if="editor || detail || redeem" class="fcc-modal-backdrop" @click.self="closeModal" @keydown.esc="closeModal">
      <section class="fcc-modal" role="dialog" aria-modal="true" :aria-label="editor ? 'Add '+draft.kind : detail?.title || redeem?.title" tabindex="-1" ref="modal">
        <button class="fcc-modal-close" @click="closeModal" aria-label="Close">×</button>
        <form v-if="editor" @submit.prevent="saveEntry"><span class="eyebrow">MAKE ROOM FOR WHAT MATTERS</span><h2>{{ draft.id ? 'Edit' : 'Add' }} {{ draft.kind==='event'?'a personal event':draft.kind }}</h2>
          <FamilyVoiceEvent ref="eventVoice" v-if="draft.kind==='event' && !draft.id" :key="householdId" :http="http" :household-id="householdId" :timezone="dashboard.household.timezone" :initially-open="voiceOpen" @draft="applyVoiceDraft" @microphone-start="focusMusic?.pause?.()" />
          <label v-if="draft.kind==='status'">Status<select v-model="draft.title"><option v-if="!familyStatuses.includes(draft.title)" :value="draft.title">{{ draft.title }}</option><option v-for="s in familyStatuses" :key="s">{{ s }}</option></select></label><label v-else>{{ draft.kind==='event'?'What’s happening?':'Title' }}<input v-model="draft.title" required maxlength="200" placeholder="Give it a name" :list="draft.kind==='event' ? 'family-event-titles' : undefined" @input="suggestEventTheme" /></label><datalist id="family-event-titles"><option v-for="type in familyEventTypes" :key="type.id" :value="type.label" /></datalist>
          <div class="fcc-form-pair"><label>For<select v-model="draft.memberUserId"><option :value="null">Everyone</option><option v-for="m in dashboard.members" :key="m.user_id" :value="m.user_id">{{ m.display_name }}</option></select></label><label>Color<input v-model="draft.metadata.color" type="color" /></label></div>
          <p v-if="['event','status','chore','meal'].includes(draft.kind)" class="fcc-small">Times shown in {{ dashboard.household.timezone }}.</p><label v-if="draft.kind==='event'" class="fcc-inline"><input v-model="draft.metadata.autoTheme" type="checkbox" @change="suggestEventTheme" /> Match picture and type to title automatically</label><FamilyEventTypePicker v-if="draft.kind==='event'" v-model="draft.metadata.eventType" @change="selectEventTheme" /><template v-if="draft.kind==='event'"><FamilyEventPicturePicker v-model="draft.metadata" /><label>Upload your own picture<input type="file" accept="image/jpeg,image/png,image/webp" @change="pickPhoto($event, 'artwork')" /></label></template>
          <label v-if="draft.kind==='event'" class="fcc-inline"><input v-model="draft.metadata.allDay" type="checkbox" @change="normalizeAllDay" /> All-day event</label><div v-if="draft.kind==='event'&&draft.metadata.allDay" class="fcc-form-pair"><label>First day<input type="date" :value="draft.startAt.slice(0,10)" @input="draft.startAt=$event.target.value+'T00:00'" required /></label><label>Last day<input type="date" :value="shiftCalendarDay(draft.endAt.slice(0,10),-1)" @input="draft.endAt=shiftCalendarDay($event.target.value,1)+'T00:00'" required /></label></div><div v-else-if="['event','status','chore','meal'].includes(draft.kind)" class="fcc-form-pair"><label>{{ draft.kind==='chore'?'Due':'Starts' }}<input v-model="draft.startAt" type="datetime-local" :required="['event','status'].includes(draft.kind)" /></label><label v-if="['event','status'].includes(draft.kind)">Ends<input v-model="draft.endAt" type="datetime-local" required /></label></div>
          <template v-if="draft.kind==='event'"><label>Location or address<input v-model="draft.metadata.address" placeholder="Where are we headed?" /></label><div class="fcc-form-pair"><label>Drop-off<input v-model="draft.metadata.dropoff" /></label><label>Pick-up<input v-model="draft.metadata.pickup" /></label></div><label>What to bring<textarea v-model="draft.metadata.equipment" placeholder="Water bottle, cleats, a snack…" /></label><label>Contact information<input v-model="draft.metadata.contact" /></label><label>Preparation reminder<select v-model.number="draft.metadata.reminderMinutes"><option :value="0">No reminder</option><option :value="15">15 minutes before</option><option :value="30">30 minutes before</option><option :value="60">1 hour before</option><option :value="1440">1 day before</option></select></label></template>
          <div v-if="['chore','reward'].includes(draft.kind)" class="fcc-form-pair"><label>{{ draft.kind==='reward'?'Point cost':'Points earned' }}<input v-model.number="draft.metadata.points" type="number" min="0" max="100000" required /></label><label v-if="draft.kind==='chore'">Repeat<select v-model="draft.metadata.recurrence"><option value="none">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label></div>
          <template v-if="draft.kind==='chore'"><label class="fcc-inline"><input v-model="draft.metadata.approval" type="checkbox" /> Parent approval required</label><fieldset><legend>Rotate between family members</legend><label v-for="m in dashboard.members" :key="m.user_id" class="fcc-inline"><input v-model="draft.metadata.rotation" type="checkbox" :value="m.user_id" />{{ m.display_name }}</label></fieldset></template>
          <label v-if="['chore','grocery','shopping','packing'].includes(draft.kind)">Category<input v-model="draft.metadata.category" placeholder="Produce, school, outdoors…" /></label><label>Notes<textarea v-model="draft.metadata.notes" /></label><button class="fcc-primary" :disabled="busy">{{ busy?'Saving…':'Save to our family' }}</button>
        </form>
        <div v-else-if="detail" class="fcc-details"><span class="eyebrow">{{ detail.kind==='event'?'PERSONAL EVENT':detail.kind }}</span><h2>{{ detail.title }}</h2><img v-if="detail.kind==='event'" class="fcc-art-preview" :src="eventArtwork(detail.metadata)" alt="" /><p v-if="detail.start_at">{{ eventTime(detail) }}</p><p>{{ memberName(detail.member_user_id) }}</p><p v-if="detail.metadata.address">⌖ {{ detail.metadata.address }} <a :href="'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(detail.metadata.address)" target="_blank" rel="noopener noreferrer">Directions ↗</a></p><p v-if="detail.metadata.dropoff">Drop-off: {{ detail.metadata.dropoff }}</p><p v-if="detail.metadata.pickup">Pick-up: {{ detail.metadata.pickup }}</p><p v-if="detail.metadata.equipment"><strong>Bring along</strong><br>{{ detail.metadata.equipment }}</p><p v-if="detail.metadata.contact">Contact: {{ detail.metadata.contact }}</p><p>{{ detail.metadata.notes }}</p><p v-if="detail.readOnly">From Google Calendar. Edit this event in Google to update it here.</p><div v-else class="fcc-form-pair"><button @click="editDetail">Edit</button><button :disabled="busy" @click="removeDetail">Delete</button></div></div>
        <form v-else-if="redeem" @submit.prevent="redeemReward"><h2>{{ redeem.title }}</h2><p>{{ redeem.metadata.points }} points · A parent approves every redemption.</p><label>For<select v-model="redeemUser"><option v-for="m in dashboard.members.filter(m=>isParent || m.user_id===session.userId)" :key="m.user_id" :value="m.user_id">{{ m.display_name }} · {{ pointsFor(m.user_id) }} points</option></select></label><button class="fcc-primary" :disabled="busy">Redeem reward</button></form>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import axios from 'axios';
import { resizeFamilyPhoto } from '../utils/familyPhotos';
import { isoToZonedDatetimeLocal, zonedDatetimeLocalToIso } from '../utils/timezones';
import FamilyVoiceEvent from '../components/family/FamilyVoiceEvent.vue';
import FamilyPocket from '../components/family/FamilyPocket.vue';
import FamilyPager from '../components/family/FamilyPager.vue';
import FamilyEventTypePicker from '../components/family/FamilyEventTypePicker.vue';
import FamilyEventPicturePicker from '../components/family/FamilyEventPicturePicker.vue';
import FamilyHomeTools from '../components/family/FamilyHomeTools.vue';
import FamilyCalendarConnection from '../components/family/FamilyCalendarConnection.vue';
import FamilyFocusMusic from '../components/family/FamilyFocusMusic.vue';
import FamilyCalendarView from '../components/family/FamilyCalendarView.vue';
import { shiftCalendarDay } from '../utils/familyCalendarInteraction';
import { calendarEventStyle } from '../utils/familyCalendarDisplay';
import CalendarSharing from '../components/CalendarSharing.vue';
import { familyEventTypes, familyEventMetadata, familyStatuses, eventType, eventArtwork, entryType, memberStatus, familyCalendarEntries, normalizeFamilyStatus } from '../utils/familyCommandCenter';
const http = axios.create({ baseURL:'/api/family', withCredentials:true });
const session=ref(null), dashboard=ref(null), tenant=ref(null), loading=ref(true), busy=ref(false), refreshing=ref(false), error=ref(''), notice=ref('');
const params=new URLSearchParams(window.location.search), organization=ref(params.get('organization') || ''), agencyId=ref(Number(params.get('agencyId')) || null), pin=ref(''), email=ref(''), needsEmail=ref(false);
const householdId=ref(Number(new URLSearchParams(window.location.search).get('household')) || null), householdName=ref(''), timezone=ref(Intl.DateTimeFormat().resolvedOptions().timeZone), inviteCode=ref(''), createdInvite=ref('');
const tab=ref(new URLSearchParams(window.location.search).get('view')==='on-the-go'?'On the go':new URLSearchParams(window.location.search).get('view')==='home'?'Home':'Calendar'), now=ref(new Date()), weather=ref(null), workMode=ref('busy'), calendarDate=ref('');
const activeMember=ref('all'),navExpanded=ref(false),musicOpen=ref(false);
try{navExpanded.value=localStorage.getItem('family-navigation-expanded')==='true';}catch{}
watch(navExpanded,value=>{try{localStorage.setItem('family-navigation-expanded',String(value));}catch{}});
watch(householdId,()=>{activeMember.value='all';googleHomeEvents.value=[];});
const voiceOpen=ref(false),eventVoice=ref(null),focusMusic=ref(null);
const editor=ref(false), detail=ref(null), redeem=ref(null), redeemUser=ref(null), draft=ref({}), modal=ref(null), newMember=ref({name:'',role:'member',color:'#9d8ace',photoUrl:null});
let refreshTimer, clockTimer, noticeTimer, previousFocus, dashboardRequest=0;
const nav=[{label:'Home',icon:'⌂'},{label:'On the go',icon:'↗'},{label:'Calendar',icon:'▦'},{label:'Chores',icon:'✓'},{label:'Rewards',icon:'☆'},{label:'Lists',icon:'☷'},{label:'Meals',icon:'♧'},{label:'Family',icon:'♡'},{label:'Smart home',icon:'⌘'},{label:'Focus music',icon:'♫'},{label:'Settings',icon:'⚙'}];
const isParent=computed(()=>dashboard.value?.household.role==='parent');
watch([tab,householdId],()=>{const url=new URL(window.location.href);if(tab.value==='On the go')url.searchParams.set('view','on-the-go');else if(tab.value==='Home')url.searchParams.set('view','home');else url.searchParams.delete('view');if(householdId.value)url.searchParams.set('household',householdId.value);history.replaceState(null,'',url.pathname+url.search+url.hash);});
const dateLabel=computed(()=>now.value.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric', timeZone: dashboard.value?.household.timezone}));
const timeLabel=computed(()=>now.value.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:dashboard.value?.household.timezone}));
const greeting=computed(()=>{const h=Number(new Intl.DateTimeFormat('en-US',{hour:'numeric',hourCycle:'h23',timeZone:dashboard.value?.household.timezone}).format(now.value));return h<12?'Good morning, family.':h<17?'Good afternoon, family.':'Good evening, family.';});
const googleHomeEvents=ref([]);
async function loadGoogleHome(id,current){try{const from=new Date(Date.now()-86400000).toISOString(),to=new Date(Date.now()+30*86400000).toISOString();const {data}=await http.get(`/households/${id}/calendar-view`,{params:{from,to,work:'hidden'}});if(current!==dashboardRequest||id!==householdId.value||!session.value)return;googleHomeEvents.value=(data.events || []).filter(e=>e.source==='Google').map(e=>({...e,id:e.key,kind:'event',readOnly:true,start_at:e.start,end_at:e.end,metadata:familyEventMetadata(e.title,{...e.metadata,address:e.location,allDay:!!e.startDate})}));}catch(e){if(current===dashboardRequest&&id===householdId.value)googleHomeEvents.value=[];}}
const entriesOf=kind=>(dashboard.value?.entries || []).filter(e=>e.kind===kind);
const chores=computed(()=>entriesOf('chore'));
const events=computed(()=>[...entriesOf('event'),...googleHomeEvents.value].sort((a,b)=>new Date(a.start_at)-new Date(b.start_at)));
const calendarEvents=computed(()=>[...familyCalendarEntries(dashboard.value?.entries || []),...googleHomeEvents.value]);
const upNext=computed(()=>events.value.find(e=>new Date(e.end_at)>now.value));
const todayEvents=computed(()=>calendarEvents.value.filter(e=>dayKey(e.start_at)===dayKey(now.value)));
const uncheckedLists=computed(()=>(dashboard.value?.entries || []).filter(e=>['grocery','shopping','packing'].includes(e.kind)&&!e.completed_at).length);
const familyPoints=computed(()=>(dashboard.value?.balances || []).reduce((s,b)=>s+Number(b.points),0));
const pending=computed(()=>(dashboard.value?.activity || []).filter(a=>a.state==='pending'));
const heroStyle=computed(()=>{const m=upNext.value?.metadata;return {'--event-color':m?.color || '#829a80',...({backgroundImage:`linear-gradient(90deg,rgba(20,30,38,.88),rgba(20,30,38,.76) 45%,rgba(20,30,38,.08)),url(${JSON.stringify(eventArtwork(m))})`,backgroundSize:'cover',backgroundPosition:'center'})};});
const weatherLabel=computed(()=>{const c=weather.value?.current?.weatherCode;return c===0?'Clear skies':c<=3?'Partly cloudy':c<=48?'Foggy':c<=67?'Rainy':c<=77?'Snowy':c<=82?'Rain showers':c<=86?'Snow showers':'Thunderstorms';});
const weatherIcon=computed(()=>weather.value?.current?.weatherCode<=3?'☀':weather.value?.current?.weatherCode<=67?'☁':'❄');
function dayKey(d){return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:dashboard.value?.household.timezone}).format(new Date(d));}
function member(id){return dashboard.value?.members.find(m=>m.user_id===Number(id));}
function memberName(id){return member(id)?.display_name || 'Everyone';}
function pointsFor(id){return Number(dashboard.value?.balances.find(b=>b.user_id===id)?.points || 0);}
function entryTitle(id){return dashboard.value?.entries.find(e=>e.id===id)?.title || dashboard.value?.activity.find(a=>a.entry_id===id)?.entry_title || 'Family activity';}
function choreActivity(e){return dashboard.value?.activity.find(a=>a.entry_id===e.id&&a.occurrence_key===e.occurrence&&a.state!=='rejected');}
function choreDone(e){return choreActivity(e)?.state==='approved';}
function minutesUntil(e){return Math.ceil((new Date(e.start_at)-now.value)/60000);}
function eventTime(e){if(e.metadata?.allDay)return new Date(e.start_at).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:dashboard.value?.household.timezone})+' · All day';const opts={month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:dashboard.value?.household.timezone};return e.start_at?new Date(e.start_at).toLocaleString('en-US',opts)+(e.end_at?' – '+new Date(e.end_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:dashboard.value?.household.timezone}):''):'';}
function memberNext(m){return events.value.find(e=>(!e.member_user_id||e.member_user_id===m.user_id)&&new Date(e.end_at)>now.value)?.title || 'No upcoming plans';}
function calendarEntries(index){
  const base=tab.value==='Calendar'&&calendarDate.value?calendarDate.value:dayKey(now.value);const start=new Date(base+'T12:00:00Z');start.setUTCDate(start.getUTCDate()+(index===1?1:0));const from=start.toISOString().slice(0,10);start.setUTCDate(start.getUTCDate()+(index===2?7:1));const until=start.toISOString().slice(0,10);
  const work=workMode.value==='hidden'?[]:(dashboard.value?.work || []).map(w=>({...w,kind:'work',title:workMode.value==='details'?`${memberName(w.provider_id)} · ${w.detail_title}`:'Work',start_at:w.start_at||w.start_date,end_at:w.end_at||w.end_date}));
  return [...calendarEvents.value,...work].filter(e=>dayKey(e.start_at)<until&&dayKey(e.end_at||e.start_at)>=from).sort((a,b)=>new Date(a.start_at)-new Date(b.start_at));
}
function report(e){error.value=e.response?.data?.error?.message || e.message || 'Something went wrong. Please try again.';}
async function run(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();}catch(e){report(e);}finally{busy.value=false;}}
async function resolveTenant(){if(!organization.value&&!agencyId.value){tenant.value=null;return;}try{tenant.value=(await http.get('/tenant',{params:{organization:organization.value,...(agencyId.value?{agencyId:agencyId.value}:{})}})).data;error.value='';}catch(e){tenant.value=null;report(e);}}
async function unlock(){await run(async()=>{await resolveTenant();if((organization.value||agencyId.value)&&!tenant.value)return;try{await http.post('/unlock',{agencyId:tenant.value?.id,passcode:pin.value,email:email.value||undefined});await loadSession();pin.value='';}catch(e){if(e.response?.status===409||e.response?.data?.error?.message?.includes('email'))needsEmail.value=true;throw e;}});}
async function loadSession(){session.value=(await http.get('/me')).data;if(session.value.households.length){if(!session.value.households.some(h=>h.id===householdId.value))householdId.value=session.value.households[0].id;await loadDashboard();loadWeather();}}
async function loadDashboard(){if(!householdId.value)return;const current=++dashboardRequest;refreshing.value=true;try{const id=householdId.value;const data=(await http.get(`/households/${id}`,{timeout:20000})).data;if(current!==dashboardRequest||id!==householdId.value||!session.value)return;data.entries=(data.entries || []).map(e=>e.kind==='event'?{...e,metadata:familyEventMetadata(e.title,e.metadata)}:e);dashboard.value=data;void loadGoogleHome(id,current);}finally{if(current===dashboardRequest)refreshing.value=false;}}
async function loadWeather(){try{weather.value=(await http.get('/weather')).data;}catch{weather.value={status:'unavailable'};}}
async function createHome(){await run(async()=>{const{data}=await http.post('/households',{name:householdName.value,timezone:timezone.value});householdId.value=data.id;await loadSession();});}
async function joinHome(){await run(async()=>{const{data}=await http.post('/join',{token:inviteCode.value.trim()});householdId.value=data.id;inviteCode.value='';await loadSession();});}
async function logout(){++dashboardRequest;await run(async()=>{await http.post('/logout');session.value=null;dashboard.value=null;googleHomeEvents.value=[];await resolveTenant();});}
function localInput(date){return isoToZonedDatetimeLocal(date, dashboard.value.household.timezone);}
function openEditor(kind){voiceOpen.value=false;previousFocus=document.activeElement;draft.value={kind,title:kind==='status'?'Home':'',memberUserId:null,startAt:['event','status','chore','meal'].includes(kind)?localInput(new Date()):'',endAt:['event','status'].includes(kind)?localInput(new Date(Date.now()+3600000)):'',metadata:{eventType:'family',autoTheme:true,color:'#7976d7',points:kind==='reward'?50:10,approval:true,recurrence:'none',rotation:[],reminderMinutes:0}};editor.value=true;nextTick(()=>modal.value?.querySelector('input,select')?.focus());}
function openVoiceEvent(){openEditor('event');voiceOpen.value=true;draft.value.startAt='';draft.value.endAt='';nextTick(()=>modal.value?.querySelector('.voice-mic, .family-voice textarea')?.focus());}
function applyVoiceDraft(value){
  if(!editor.value||draft.value.id||draft.value.kind!=='event'||!value)return;
  const d=draft.value;
  Object.assign(d,{title:value.title || '',memberUserId:value.memberUserId ?? null,startAt:value.startAt || '',endAt:value.endAt || ''});
  d.metadata=familyEventMetadata(d.title,{...d.metadata,...value.metadata,autoTheme:true});
  if(value.metadata?.color)d.metadata.color=value.metadata.color;
  // Keep nonexistent DST wall times blank instead of silently moving the event.
  for(const key of ['startAt','endAt'])if(d[key]){
    const iso=zonedDatetimeLocalToIso(d[key],dashboard.value.household.timezone);
    if(!iso||isoToZonedDatetimeLocal(iso,dashboard.value.household.timezone)!==d[key]){d[key]='';error.value='A suggested time falls during a clock change. Choose that time manually.';}
  }
}
function suggestEventTheme(){if(draft.value.kind==='event' && draft.value.metadata.autoTheme)draft.value.metadata=familyEventMetadata(draft.value.title,draft.value.metadata);}
function selectEventTheme(type){Object.assign(draft.value.metadata,{eventType:type.id,color:type.color,autoTheme:false,artworkType:null,artworkVariant:null,artwork:null});}
function openCalendarSlot({start,end,allDay=false}){
  openEditor('event');draft.value.startAt=localInput(start);draft.value.endAt=localInput(end);
  draft.value.metadata.allDay=allDay;draft.value.memberUserId=activeMember.value==='all'?null:Number(activeMember.value);
}
async function rescheduleCalendarEvent(event,times){
  if(busy.value)throw new Error('Please wait for the current change to finish.');
  const entry=dashboard.value.entries.find(e=>String(e.id)===String(event.id));
  if(!entry || !['event','status'].includes(entry.kind))throw new Error('This event can only be changed in its source calendar.');
  busy.value=true;
  try{
    await http.put(`/households/${householdId.value}/entries/${entry.id}`,{kind:entry.kind,title:entry.title,memberUserId:entry.member_user_id,startAt:times.start,endAt:times.end,metadata:entry.metadata});
    // The save is complete even if a subsequent dashboard refresh loses connectivity.
    entry.start_at=times.start;entry.end_at=times.end;
    try{await loadDashboard();}catch{notice.value='Time saved. Reconnect to refresh the rest of the dashboard.';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.value='',8000);}
  }finally{busy.value=false;}
}
function editCalendarEvent(e){const entry=dashboard.value.entries.find(item=>String(item.id)===String(e.id));if(entry){previousFocus=document.activeElement;detail.value=entry;editDetail();nextTick(()=>modal.value?.querySelector('input,select')?.focus());}}
function openDetails(e){previousFocus=document.activeElement;detail.value=e;nextTick(()=>modal.value?.focus());}
function closeModal(){voiceOpen.value=false;editor.value=false;detail.value=null;redeem.value=null;previousFocus?.focus?.();}
function editDetail(){draft.value={id:detail.value.id,kind:detail.value.kind,title:detail.value.kind==='status'?normalizeFamilyStatus(detail.value.title):detail.value.title,memberUserId:detail.value.member_user_id,startAt:detail.value.start_at?localInput(detail.value.start_at):'',endAt:detail.value.end_at?localInput(detail.value.end_at):'',metadata:JSON.parse(JSON.stringify(detail.value.metadata))};detail.value=null;editor.value=true;}
function normalizeAllDay(){if(draft.value.metadata.allDay){const d=draft.value;d.startAt=d.startAt.slice(0,10)+'T00:00';d.endAt=(d.endAt.slice(0,10)>d.startAt.slice(0,10)?d.endAt.slice(0,10):shiftCalendarDay(d.startAt.slice(0,10),1))+'T00:00';}}
async function saveEntry(){eventVoice.value?.cancel?.();await run(async()=>{
  const d=draft.value,id=householdId.value;
  const data={...d,startAt:d.startAt?zonedDatetimeLocalToIso(d.startAt,dashboard.value.household.timezone):null,endAt:d.endAt?zonedDatetimeLocalToIso(d.endAt,dashboard.value.household.timezone):null};
  const path=`/households/${id}/entries`;
  const response=d.id?await http.put(`${path}/${d.id}`,data):await http.post(path,data);
  ++dashboardRequest; // Invalidate any pre-save response still in flight.
  if(id!==householdId.value||!dashboard.value)return;
  const savedId=d.id || response.data.id;
  const saved={id:savedId,kind:d.kind,title:d.title,member_user_id:d.memberUserId,start_at:data.startAt,end_at:data.endAt,metadata:JSON.parse(JSON.stringify(d.metadata))};
  dashboard.value={...dashboard.value,entries:[...dashboard.value.entries.filter(e=>String(e.id)!==String(savedId)),saved]};
  closeModal();notice.value=`${d.title} saved to ${dashboard.value.household.name}.`;
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.value='',8000);
  // Saving is complete. A slow refresh must not hold the entire calendar busy.
  void loadDashboard().catch(()=>{if(id===householdId.value)notice.value='Event saved. Reconnect or refresh to load the rest of the calendar.';});
});}
async function act(e,action,extra={}){await run(async()=>{await http.post(`/households/${householdId.value}/entries/${e.id}/actions`,{action,...extra});await loadDashboard();});}
async function removeDetail(){const e=detail.value;await act(e,'delete');if(!error.value)closeModal();}
async function approve(a,action){await act({id:a.entry_id},action,{activityId:a.id,userId:a.user_id});}
function openRedemption(r){previousFocus=document.activeElement;redeem.value=r;redeemUser.value=session.value.userId;nextTick(()=>modal.value?.focus());}
async function redeemReward(){await act(redeem.value,'redeem',{userId:redeemUser.value,requestId:crypto.randomUUID()});if(!error.value)closeModal();}
async function addMember(){await run(async()=>{await http.post(`/households/${householdId.value}/members`,newMember.value);newMember.value={name:'',role:'member',color:'#9d8ace',photoUrl:null};await loadDashboard();});}
async function changeMemberColor(m,color){await run(async()=>{await http.patch(`/households/${householdId.value}/members/${m.user_id}`,{color});await loadDashboard();});}
async function shareWork(value){await run(async()=>{await http.patch(`/households/${householdId.value}/members/${session.value.userId}`,{shareWork:value});await loadDashboard();});}
async function makeInvite(){await run(async()=>{createdInvite.value=(await http.post(`/households/${householdId.value}/invites`,{role:'parent'})).data.token;});}
async function pickPhoto(event,target){const file=event.target.files?.[0];if(!file)return;try{const data=await resizeFamilyPhoto(file,{maxEdge:target==='member'?512:1200,maxDataLength:700000});if(target==='member')newMember.value.photoUrl=data;else draft.value.metadata.artwork=data;}catch(e){report(e);}}
const reminded=new Set();
function checkReminders(){for(const e of events.value){const min=minutesUntil(e),lead=e.metadata.reminderMinutes;if(lead&&min>=0&&min<=lead&&!reminded.has(e.id)){reminded.add(e.id);notice.value=`Coming up in ${min} min: ${e.title}${e.metadata.equipment?' · Bring '+e.metadata.equipment:''}`;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.value='',30000);}}}
function trapFocus(event){if(!(editor.value||detail.value||redeem.value)||event.key!=='Tab')return;const items=modal.value?.querySelectorAll('button:not([disabled]),input,select,textarea,a[href]');if(!items?.length)return;const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
function refreshOnReturn(){if(document.hidden||!session.value||!dashboard.value||busy.value||refreshing.value||editor.value||detail.value||redeem.value)return;void loadDashboard().catch(report);}
onMounted(async()=>{window.addEventListener('focus',refreshOnReturn);document.addEventListener('visibilitychange',refreshOnReturn);document.title='Family Command Center';document.addEventListener('keydown',trapFocus);try{const token=new URLSearchParams(window.location.hash.slice(1)).get('launch');if(token){history.replaceState(null,'',window.location.pathname+window.location.search);await http.post('/exchange',{token});}await loadSession();}catch(e){if(e.response?.status!==401)report(e);await resolveTenant();}finally{loading.value=false;}clockTimer=setInterval(()=>{now.value=new Date();checkReminders();},15000);refreshTimer=setInterval(async()=>{if(!dashboard.value||document.hidden||busy.value||refreshing.value||editor.value||detail.value||redeem.value)return;try{await loadDashboard();}catch(e){report(e);if(e.response?.status===401||e.response?.status===403){session.value=null;dashboard.value=null;}}},30000);});
onUnmounted(()=>{++dashboardRequest;window.removeEventListener('focus',refreshOnReturn);document.removeEventListener('visibilitychange',refreshOnReturn);clearInterval(refreshTimer);clearInterval(clockTimer);clearTimeout(noticeTimer);document.removeEventListener('keydown',trapFocus);});
</script>

<style scoped>
.fcc-pocket-shortcut{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:22px}.fcc-pocket-shortcut span{color:var(--muted);font-size:14px}
.fcc-art-preview{width:100%;height:150px;object-fit:cover;border-radius:12px;margin:8px 0}
.fcc-upnext .fcc-countdown{background:#192630ed;border-radius:12px;padding:12px;align-self:flex-start;color:#fff}
.fcc-upnext .fcc-countdown strong{color:#fff}
.fcc-upnext .fcc-hero-copy p{color:#fff}


.fcc-quick-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
.fcc{--ink:#25313c;--muted:#56616c;--purple:#51429a;--line:#d6d5ce;--surface:#fffdf8;--canvas:#eae8e1;--soft:#eeeaf8;--control:#979ca5;--event-color:#829a80;display:flex;min-height:100dvh;background:var(--canvas);color:var(--ink);font-family:'Avenir Next',Avenir,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;letter-spacing:0}
.fcc *{box-sizing:border-box}
.fcc button,.fcc input,.fcc select,.fcc textarea{font:inherit}
.fcc button{cursor:pointer;border:1px solid var(--control);border-radius:10px;background:var(--surface);color:var(--purple);padding:8px 12px;font-weight:600;transition:background .15s}
.fcc button:hover{background:var(--soft)}
.fcc button:disabled{cursor:default;opacity:.55}
.fcc button:focus-visible,.fcc a:focus-visible{outline:3px solid var(--purple);outline-offset:3px}
.fcc h1,.fcc h2,.fcc h3,.fcc p{margin:0}
.fcc .fcc-primary{background:var(--purple);color:white;border:0;padding:11px 19px;box-shadow:0 4px 12px #7669b722}
.fcc .fcc-primary:hover{background:#3c307b}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:1.7px;color:var(--muted)}
.fcc-sidebar{width:208px;flex-shrink:0;background:#f5f2ec;border-right:1px solid var(--line);padding:30px 20px;display:flex;flex-direction:column;min-height:100dvh;position:sticky;top:0;height:100dvh}
.fcc-brand{display:flex;gap:10px;align-items:center;text-decoration:none;color:var(--purple);font-size:29px;line-height:1.1;font-weight:700}
.fcc-mark{display:grid;place-items:center;color:var(--purple);background:var(--soft);border-radius:15px;width:44px;height:44px;font-size:32px}
.fcc-brand-sub{display:block;letter-spacing:1.6px;font-size:7px;margin-top:4px}
.fcc-house-name{font-size:13px;color:var(--muted);padding:22px 5px}
.fcc-sidebar nav{display:flex;flex-direction:column;gap:8px}
.fcc-sidebar nav button{min-height:44px;display:flex;align-items:center;gap:13px;border:0;background:transparent;color:var(--muted);text-align:left;padding:12px 14px;font-size:15px;border-radius:9px}
.fcc-sidebar nav button>span:first-child{font-size:20px;line-height:1;width:20px;text-align:center}
.fcc-sidebar nav button.selected{background:var(--soft);color:var(--purple);font-weight:650}
.fcc-count{margin-left:auto;background:var(--soft);padding:1px 6px;border-radius:5px;font-size:13px}
.fcc-sidebar-foot{margin-top:auto;font-size:13px;color:var(--muted);padding-top:40px}
.fcc-sidebar-foot button{font-size:13px;background:transparent;border:0;padding-left:0;margin-top:10px}
.fcc-live-dot{display:inline-block;width:6px;height:6px;background:#35754c;border-radius:50%;margin-right:4px}
.fcc-main{padding:32px 35px 20px;flex:1;min-width:0;max-width:1800px;margin:auto}
.fcc-topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:26px}
.fcc-topbar h1{font-size:29px;font-weight:600;letter-spacing:-1px;margin:7px 0 3px}
.fcc-topbar p{color:var(--muted);font-size:13px}
.fcc-sun{color:#9b721d;font-size:26px}
.fcc-top-actions{display:flex;align-items:center;gap:20px}
.fcc-clock{font-size:17px;color:var(--muted)}
.fcc-avatar-stack{display:flex;padding-left:6px}
.fcc-avatar-stack>span{width:30px;height:30px;border:3px solid var(--canvas);margin-left:-7px;border-radius:50%;display:grid;place-items:center;color:white;font-size:13px;overflow:hidden}
.fcc-avatar-stack img,.fcc-avatar img{width:100%;height:100%;object-fit:cover}
.fcc-hero-row{display:grid;grid-template-columns:2.3fr 1fr;gap:22px;margin-bottom:22px}
.fcc-upnext{background:linear-gradient(115deg,#eeedf8,#edf3f1);border-radius:18px;min-height:252px;position:relative;overflow:hidden;padding:26px 30px;display:flex;justify-content:space-between;border:1px solid var(--line)}
.fcc-hero-copy{position:relative;z-index:1;max-width:75%;min-width:0;overflow-wrap:anywhere}
.fcc-hero-copy .eyebrow{color:#fff}
.fcc-hero-copy h2{font-size:31px;letter-spacing:-.9px;font-weight:600;line-height:1.2;margin:16px 0 10px;color:#fff}
.fcc-hero-member{display:flex;gap:8px;align-items:center}
.fcc-hero-member .fcc-avatar{width:25px;height:25px;font-size:13px}
.fcc-hero-copy p{font-size:13px;color:var(--muted);margin:7px 0}
.fcc-hero-copy button{margin-top:14px;background:var(--surface);border:1px solid var(--surface);font-size:13px;color:var(--purple);padding:8px 15px}
.fcc-countdown{z-index:1;display:flex;align-items:center;flex-direction:column;font-size:13px;color:var(--muted);padding:16px 4px}
.fcc-countdown strong{font-size:43px;font-weight:550;letter-spacing:-1px;color:var(--muted);line-height:1.4}
.fcc-landscape{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.fcc-orb{position:absolute;right:19%;top:46%;width:43px;height:43px;border-radius:50%;background:#f0d99588;box-shadow:0 0 38px #f0d99588}
.fcc-hill{position:absolute;border-radius:50% 50% 0 0;bottom:-120px;width:115%;height:200px;background:var(--event-color);opacity:.13;transform:rotate(-10deg)}
.fcc-hill.front{bottom:-132px;right:-40%;height:250px;transform:rotate(9deg);opacity:.22}
.fcc-landscape>span{position:absolute;bottom:5%;right:24%;font-size:53px;opacity:.42;filter:saturate(.5)}
.family-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 3px 12px #25313c0a;padding:21px 22px;min-width:0}
.family-card :deep(header),.family-card>header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.family-card :deep(h2),.family-card h2{font-size:15px;font-weight:700;color:var(--ink);letter-spacing:.1px}
.fcc-pulse>div{display:flex;align-items:center;gap:12px;margin-top:15px;font-size:13px;color:var(--muted)}
.fcc-pulse strong{font-size:18px;color:var(--ink);font-weight:550;width:22px}
.pulse-icon{width:25px;height:25px;border-radius:7px;display:grid;place-items:center;font-size:16px}
.violet{background:#f2edfa;color:#51429a}
.green{background:#edf6ef;color:#35754c}
.pink{background:#fceef4;color:#a23f69}
.amber{background:#faf4e8;color:#806019}
.fcc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;align-items:start}
.fcc-card-intro{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--muted);margin-bottom:12px}
.fcc-card-intro button{padding:0;border:0;font-size:13px}
.fcc-progress{height:4px;background:#dfE5db;border-radius:6px;margin-bottom:15px;overflow:hidden}
.fcc-progress span{display:block;height:100%;background:#35754c;border-radius:6px}
.fcc-check-row{display:flex;align-items:center;gap:11px;padding:10px 0}
.fcc-check-row .fcc-check{width:26px;height:26px;flex-shrink:0;padding:0;border:1px solid var(--control);border-radius:5px;font-size:13px;display:grid;place-items:center}
.fcc-check-row .fcc-check.checked{background:#35754c;color:white;border-color:#35754c;opacity:1}
.fcc .fcc-row-title{border:0;padding:0;background:none;text-align:left;color:var(--ink);font-size:15px;font-weight:600;flex:1}
.fcc-row-title small,.fcc-member-row small,.fcc-agenda-row small,.fcc-note small,.fcc-reward small,.fcc-history small{display:block;font-size:13px;color:var(--muted);font-weight:400;margin-top:3px}
.fcc-mini-avatar{width:21px;height:21px;border-radius:50%;font-size:13px;display:grid;place-items:center;color:white;background:#c3bada}
.fcc-empty{font-size:14px;color:var(--muted);text-align:center;line-height:1.8;padding:28px 12px}
.fcc-member-row{display:flex;align-items:center;gap:12px;padding:10px 0}
.fcc-member-row strong{font-size:15px;font-weight:600;color:var(--ink)}
.fcc-avatar{width:36px;height:36px;flex-shrink:0;border-radius:50%;color:white;display:grid;place-items:center;font-size:13px;overflow:hidden}
.fcc-status-dot{width:6px;height:6px;border-radius:50%;margin-left:auto;opacity:.7}
.fcc .fcc-text-button{border:0;background:transparent;color:var(--purple);padding:16px 0 0;font-size:13px}
.fcc-agenda-row{display:flex;gap:12px;padding:12px 0;cursor:pointer}
.fcc-event-icon{border-radius:10px;width:35px;height:37px;display:grid;place-items:center;font-size:17px;flex-shrink:0}
.struck{text-decoration:line-through;opacity:.6}
.fcc-weather{background:linear-gradient(130deg,#f8fbfd,#e5edf3)}
.fcc-weather header button{border:0;background:transparent;font-size:17px;padding:0}
.fcc-weather-now{display:flex;gap:14px;align-items:center;padding:13px 0 22px}
.fcc-weather-now>span{font-size:42px;color:#9b721d}
.fcc-weather-now>strong{font-size:44px;font-weight:500;line-height:1}
.fcc-weather-now>div{font-size:13px;color:var(--muted)}
.fcc-weather-now small{display:block;font-size:13px;color:var(--muted)}
.fcc-forecast{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:17px}
.fcc-forecast>div{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:13px;color:var(--muted)}
.fcc-forecast strong{font-size:14px;color:var(--muted);font-weight:500}
.fcc-note{display:flex;gap:13px;padding:15px 0;cursor:pointer}
.fcc-note>span{font-size:24px}
.fcc-note strong,.fcc-reward strong{font-size:13px;font-weight:500;color:var(--ink)}
.fcc-reward{display:flex;align-items:center;gap:12px;padding:12px 0}
.fcc-reward>span{font-size:26px;color:#cbb479}
.fcc-reward>button{margin-left:auto;font-size:13px}
.fcc-points{margin-left:auto;color:var(--purple);font-size:13px}
.fcc-history{padding:9px 0}
.fcc-history strong{font-size:13px;font-weight:500}
.fcc-approvals{margin-top:22px}
.fcc-approvals>div{display:flex;align-items:center;gap:10px;padding:9px 0;font-size:13px}
.fcc-approvals>div>span{flex:1}
.fcc-bottom{display:flex;justify-content:space-between;color:var(--muted);font-size:13px;padding-top:25px}
.fcc-gate{justify-content:center;align-items:center;background:radial-gradient(ellipse at 20% 20%,#ddd9ec,transparent 60%),radial-gradient(ellipse at 80% 90%,#dce5d8,transparent 60%),var(--canvas);padding:35px}
.fcc-welcome{max-width:430px;width:100%;text-align:center}
.fcc-welcome>.fcc-mark{margin:0 auto 24px;width:64px;height:64px;font-size:45px}
.fcc-welcome h1{font-size:32px;letter-spacing:-1.2px;font-weight:600;margin:10px 0}
.fcc-welcome p{color:var(--muted);font-size:13px;margin:12px 0}
.fcc-login{text-align:left;display:flex;flex-direction:column;gap:15px;margin-top:28px}
.fcc label{display:flex;flex-direction:column;gap:7px;font-size:13px;color:var(--muted)}
.fcc input,.fcc select,.fcc textarea{width:100%;border:1px solid var(--control);border-radius:9px;background:var(--surface);color:var(--ink);padding:11px 12px;min-height:44px;font-size:16px}
.fcc input::placeholder,.fcc textarea::placeholder{color:var(--muted);opacity:1}
.fcc input:focus,.fcc select:focus,.fcc textarea:focus{outline:2px solid var(--purple);outline-offset:1px}
.fcc input[type=color]{padding:4px;min-width:65px}
.fcc textarea{min-height:80px;resize:vertical}
.fcc input.fcc-pin{font-size:29px;text-align:center;letter-spacing:13px;padding-left:25px}
.fcc-tenant{font-size:13px;color:var(--purple)}
.fcc .fcc-small{font-size:13px;color:var(--muted);line-height:1.8}
.fcc-error,.fcc-notice{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:11000;padding:15px 20px;border-radius:12px;background:#fff2f1;box-shadow:0 8px 35px #49323b22;color:#953e46;font-size:13px;width:max-content;max-width:90vw;display:flex;gap:12px;align-items:center}
.fcc-error button{padding:0;border:0;background:transparent;font-size:22px}
.fcc-notice{pointer-events:none;background:var(--soft);color:var(--purple);bottom:auto;top:24px}
.fcc-calendar-toolbar{display:flex;gap:25px;align-items:end;margin-bottom:22px}
.fcc-settings{max-width:760px}
.fcc-settings>h2{font-size:20px;margin-bottom:20px}
.fcc-settings>p{margin:12px 0}
.fcc-settings-form{border-top:1px solid var(--line);padding:24px 0;display:flex;flex-direction:column;gap:15px}
.fcc-settings-form h3{font-size:15px;font-weight:500}
.fcc-settings-form p{font-size:13px;color:var(--muted)}
.fcc .fcc-inline{flex-direction:row;align-items:center}
.fcc-inline input{width:16px;min-height:16px;accent-color:var(--purple)}
.fcc-integration{max-width:680px;margin:40px auto;text-align:center;padding:50px}
.fcc-integration .fcc-mark{margin:auto auto 25px}
.fcc-integration h2{font-size:23px}
.fcc-integration p{margin:20px 0;color:var(--muted);line-height:1.8;font-size:13px}
.fcc-modal-backdrop{position:fixed;inset:0;background:#28233755;z-index:10000;display:flex;align-items:center;justify-content:center;padding:24px}
.fcc-modal{overscroll-behavior:contain;touch-action:pan-y;position:relative;background:var(--surface);width:560px;max-width:100%;max-height:90dvh;overflow-y:auto;border-radius:20px;padding:35px;box-shadow:0 20px 100px #29203c33}
.fcc-modal-close{position:absolute;right:15px;top:12px;font-size:20px!important;background:transparent!important;border:0!important}
.fcc-modal form{display:flex;flex-direction:column;gap:18px}
.fcc-modal h2{font-size:25px;font-weight:550;margin-bottom:5px}
.fcc-form-pair{display:flex;gap:15px}
.fcc-form-pair>*{flex:1;min-width:0}
.fcc-modal fieldset{border:1px solid var(--line);border-radius:10px;padding:14px;display:flex;flex-wrap:wrap;gap:12px}
.fcc-modal legend{font-size:13px;color:var(--muted)}
.fcc-details p{margin:18px 0;white-space:pre-line;color:var(--muted);font-size:13px}
.fcc-details a{color:var(--purple)}
.fcc-details .fcc-form-pair{margin-top:30px}

@media(min-width:1550px){.fcc-main{padding:40px 45px}
.fcc-upnext{min-height:290px}
.fcc-hero-copy h2{font-size:40px}
.fcc-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.fcc-pulse>div{margin-top:22px}
}

@media(max-width:1150px){.fcc-sidebar{width:184px;padding:24px 12px}
.fcc-main{padding:24px}
.fcc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.fcc-topbar h1{font-size:25px}
.fcc-top-actions{gap:10px}
.fcc-clock{display:none}
.fcc-hero-row{grid-template-columns:1.8fr 1fr;gap:16px}
.fcc-upnext{padding:23px}
.fcc-hero-copy h2{font-size:27px}
.family-card{padding:18px}
}

@media(max-width:760px){.fcc{flex-direction:column}
.fcc-sidebar{position:relative;width:100%;height:auto;min-height:0;flex-direction:row;padding:12px 16px;align-items:center;flex-wrap:wrap;gap:10px;border-right:0;border-bottom:1px solid var(--line)}
.fcc-brand{font-size:21px}
.fcc-brand .fcc-mark{width:33px;height:33px;font-size:26px}
.fcc-brand-sub{font-size:6px}
.fcc-house-name{padding:0;margin-left:auto;font-size:13px}
.fcc-sidebar nav{flex-direction:row;width:100%;overflow-x:auto;gap:3px;scrollbar-width:none}
.fcc-sidebar nav button{padding:8px 10px;font-size:13px;white-space:nowrap;gap:5px}
.fcc-sidebar nav button>span:first-child{font-size:16px}
.fcc-sidebar-foot{display:none}
.fcc-main{padding:22px 16px;width:100%}
.fcc-topbar{align-items:start;margin-bottom:20px}
.fcc-topbar h1{font-size:23px;line-height:1.2}
.fcc-topbar p{font-size:13px;max-width:220px}
.fcc-top-actions .fcc-primary{padding:9px 11px;font-size:13px;white-space:nowrap}
.fcc-avatar-stack{display:none}
.fcc-hero-row{grid-template-columns:1fr;gap:15px}
.fcc-upnext{min-height:245px;padding:24px}
.fcc-pulse{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px}
.fcc-pulse header{grid-column:1/-1;margin-bottom:2px}
.fcc-pulse>div{gap:8px;font-size:13px;margin-top:10px}
.fcc-pulse strong{font-size:16px;width:18px}
.fcc-grid{gap:15px}
.fcc-calendar-toolbar{flex-wrap:wrap;gap:12px}
.fcc-modal{padding:28px 22px}
.fcc-modal-backdrop{padding:12px}
.fcc-bottom{font-size:13px}
.fcc-approvals>div{flex-wrap:wrap}
}

@media(max-width:500px){.fcc-grid{grid-template-columns:1fr}
.fcc-topbar h1{font-size:21px}
.fcc-topbar .eyebrow{font-size:13px}
.fcc-hero-copy h2{font-size:26px}
.fcc-countdown strong{font-size:36px}
.fcc-main{padding:20px 14px}
.fcc-form-pair{flex-wrap:wrap}
.fcc-form-pair>label{min-width:140px}
.fcc-integration{padding:25px}
.fcc-pulse>div{font-size:13px;align-items:flex-start}
}

@media(prefers-reduced-motion:reduce){.fcc *{scroll-behavior:auto!important;transition:none!important}
}

/* A quiet navigation rail leaves the schedule room to breathe. */
@media(min-width:761px){
.fcc-sidebar{width:80px;padding:16px 10px;align-items:center}
.fcc-brand{flex-direction:column;gap:4px;font-size:18px;text-align:center}
.fcc-brand-sub{font-size:5px;letter-spacing:.8px;margin-top:3px}
.fcc-brand .fcc-mark{width:32px;height:32px;font-size:25px;border-radius:9px}
.fcc-house-name{display:none}
.fcc-sidebar nav{width:100%;margin-top:24px;gap:5px}
.fcc-sidebar nav button{position:relative;justify-content:center;padding:10px;min-height:44px;color:var(--ink)}
.fcc-nav-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.fcc-count{position:absolute;right:0;top:0;font-size:10px;padding:0 4px}
.fcc-sidebar-foot{font-size:10px;text-align:center;padding-top:15px;line-height:1.5}
.fcc-sidebar-foot button{font-size:10px;padding:6px 0}
.fcc-main{padding:20px 24px;max-width:none;margin:0}
.fcc-calendar-screen .fcc-main{padding:16px 20px 12px}
.fcc-calendar-screen .fcc-topbar{margin-bottom:14px;min-height:64px;gap:12px}
.fcc-calendar-screen .fcc-topbar h1{font-size:28px;margin:0;line-height:1.25}
.fcc-calendar-screen .fcc-topbar p{margin:0}
.fcc-calendar-screen .eyebrow{font-size:12px;letter-spacing:0}
.fcc-calendar-screen .fcc-clock{display:none}
}
.fcc-member-filters{display:flex;gap:8px;align-items:center;max-width:48vw;overflow-x:auto;padding:3px}
.fcc-member-filters button{background:none;border:0;padding:2px 4px;color:var(--ink);min-width:48px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:3px}
.fcc-member-filters small{font-size:12px;max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fcc-filter-avatar{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--event-fill,var(--soft));color:var(--event-ink,var(--purple));border:2px solid var(--event-color,var(--purple));font-weight:700;overflow:hidden}
.fcc-filter-avatar img{width:100%;height:100%;object-fit:cover}
.fcc-member-filters button[aria-pressed=true] .fcc-filter-avatar{outline:2px solid var(--ink);outline-offset:3px}
.fcc-member-colors{display:flex;gap:16px;flex-wrap:wrap}
.fcc-member-colors input{max-width:100px}
@media(max-width:1000px) and (min-width:761px){.fcc-calendar-screen .fcc-main{padding:12px}.fcc-calendar-screen .fcc-top-actions{gap:8px}.fcc-member-filters{max-width:42vw;gap:2px}.fcc-calendar-screen .fcc-primary{padding:10px}}
@media(max-width:760px){.fcc-calendar-screen .fcc-topbar{margin-bottom:12px;display:grid;grid-template-columns:1fr auto;gap:12px}.fcc-calendar-screen .fcc-top-actions{display:contents!important}.fcc-calendar-screen .fcc-member-filters{grid-column:1/-1;grid-row:2}.fcc-calendar-screen .fcc-top-actions>.fcc-primary{grid-column:2;grid-row:1}.fcc-calendar-screen .fcc-top-actions{width:100%;flex-wrap:wrap;justify-content:space-between;gap:12px}.fcc-calendar-screen .fcc-clock{display:none}.fcc-member-filters{max-width:100%;order:2;width:100%}.fcc-calendar-screen .fcc-topbar h1{margin-bottom:0}.fcc-calendar-screen .fcc-main{padding:14px 12px}.fcc-calendar-screen .fcc-topbar p{margin-bottom:8px}}
.fcc .fcc-nav-toggle{width:100%;margin-bottom:10px;padding:7px;font-size:19px;background:transparent;border-color:var(--line);color:var(--ink)}
@media(min-width:761px){.fcc-nav-expanded .fcc-sidebar{width:216px;align-items:stretch}.fcc-nav-expanded .fcc-brand{flex-direction:row;justify-content:center}.fcc-nav-expanded .fcc-house-name{display:block;padding:14px 4px 0}.fcc-nav-expanded .fcc-nav-label{position:static;width:auto;height:auto;overflow:visible;clip-path:none}.fcc-nav-expanded .fcc-sidebar nav button{justify-content:flex-start;gap:12px}.fcc-sidebar{overflow-y:auto}.fcc-nav-expanded .fcc-sidebar-foot{text-align:left}}
@media(max-width:760px){.fcc .fcc-nav-toggle{width:auto;margin:0}.fcc-nav-expanded .fcc-sidebar nav{display:grid;grid-template-columns:1fr 1fr;overflow:visible}.fcc-nav-expanded .fcc-sidebar nav button{white-space:normal}}
</style>
