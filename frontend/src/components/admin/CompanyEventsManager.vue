<template>
  <section class="company-events-manager">
    <header class="header-row">
      <div class="header-copy"><span class="eyebrow">BRING YOUR PEOPLE TOGETHER</span><h4>{{ title }}</h4><p class="header-description">Company gatherings, celebrations and shared plans. Every invitation has a place to land.</p><div class="header-status"><span class="status-dot" :class="{ ready: smsReadiness.ready }"></span><span>Event texting · {{ smsReadiness.message }}</span><router-link v-if="canManageTeam" :to="teamCommunicationsPath">Team texts &amp; polls ↗</router-link></div></div>
      <div class="actions"><button type="button" class="btn btn-secondary" @click="loadAll" :disabled="loading || !agencyId">{{ loading ? 'Loading…' : reloadLabel }}</button><button v-if="canManageAll" type="button" class="btn btn-primary" @click="startCreate" :disabled="saving || !agencyId">+ {{ newEventLabel }}</button></div>
    </header>
    <div v-if="error" class="error-modal" role="alert">{{ error }}</div>
    <div v-if="success" class="success-message" role="status" ref="successElement"><span class="success-icon" aria-hidden="true">✓</span><div><strong>{{ success.title }}</strong><p>{{ success.message }}</p></div><button type="button" aria-label="Dismiss success message" @click="success = null">×</button></div>
    <StaffPollResultsReview v-if="reviewingPoll" :agency-id="agencyId" :event="reviewingPoll" @close="reviewingPoll = null; loadEvents()" />

    <div v-if="editorOpen && (canManageAll || draft.id)" class="editor-shell">
      <div class="editor-card" ref="editorElement">
        <div class="editor-heading"><div><span class="eyebrow">{{ draft.id ? 'EVENT WORKSPACE' : 'A NEW REASON TO CONNECT' }}</span><h5>{{ draft.id ? editEventLabel : createEventLabel }}</h5></div><button type="button" class="icon-button" aria-label="Close event editor" @click="editorOpen = false">×</button></div>
        <nav class="editor-steps" aria-label="Event setup steps"><button v-for="(step,index) in editorSteps" :key="step.id" type="button" :class="{ active: activeStep === step.id }" :aria-current="activeStep === step.id ? 'step' : undefined" @click="activeStep = step.id"><span>{{ index + 1 }}</span>{{ step.label }}</button></nav>
        <section v-show="activeStep === 'details'" class="editor-section">
          <div class="section-heading"><span class="eyebrow">THE ESSENTIALS</span><h3>What are we getting together for?</h3><p>Start with the story. Set the date now, or let your invitees help decide.</p></div>
          <div class="form-group"><label class="lbl" for="event-title">Event name</label><input id="event-title" v-model.trim="draft.title" class="input title-input" maxlength="255" placeholder="Our two-year anniversary" /></div>
          <div class="grid"><div class="form-group"><label class="lbl" for="event-type">Event type</label><select id="event-type" v-model="eventTypeSelection" class="input"><option v-for="opt in EVENT_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option><option value="__custom__">Custom</option></select><input v-if="eventTypeSelection === '__custom__'" v-model.trim="draft.eventType" class="input" maxlength="64" placeholder="Custom event type" /></div><div class="form-group"><label class="lbl" for="event-timezone">Timezone</label><select id="event-timezone" v-model="draft.timezone" class="input"><option v-for="tz in TIMEZONE_OPTIONS" :key="tz.value" :value="tz.value">{{ tz.label }}</option></select></div></div>
          <label class="feature-toggle date-toggle"><input v-model="draft.dateToBeDecided" type="checkbox" /><span><strong>We’re still deciding the date</strong><small>Save the event now and add a date vote in Experience.</small></span><span class="toggle-badge">Planning</span></label>
          <div v-if="!draft.dateToBeDecided" class="grid"><div class="form-group"><label class="lbl" for="event-start">Starts</label><input id="event-start" v-model="draft.startsAtLocal" class="input" type="datetime-local" /></div><div class="form-group"><label class="lbl" for="event-end">Ends</label><input id="event-end" v-model="draft.endsAtLocal" class="input" type="datetime-local" /></div></div>
          <div v-else class="info-note">Date to be decided. Invitees can open the event page, vote on dates and receive updates when plans are finalized.</div>
          <div class="grid"><div class="form-group"><label class="lbl" for="company-event-venue">Venue</label><input id="company-event-venue" v-model.trim="draft.eventLocationName" class="input" placeholder="Venue name or leave open for now" /></div><div class="form-group"><label class="lbl" for="company-event-address">Venue address</label><input v-address-autocomplete="{ format: 'full', locale: 'en', model: draft, scopeKey: draft.id }" id="company-event-address" v-model.trim="draft.eventLocationAddress" autocomplete="street-address" class="input" placeholder="Street address, city, state, ZIP" /></div></div>
          <div class="form-group"><label class="lbl" for="event-description">Details for your invitees</label><textarea id="event-description" v-model.trim="draft.description" class="input" rows="4" placeholder="What’s happening, what to expect and anything people should know." /></div>
          <details class="advanced-section"><summary>Recurrence &amp; optional program connection</summary><p class="hint">Company events stand on their own. Link a program only when this event belongs to one.</p><div class="grid"><div class="form-group"><label class="lbl">Program connection</label><select v-model.number="draft.organizationId" class="input"><option :value="0">Company event · no program</option><option v-for="o in affiliateProgramOrgs" :key="o.id" :value="o.id">{{ o.name }}</option></select></div><div class="form-group"><label class="lbl">Recurrence</label><select v-model="draft.recurrence.frequency" class="input" :disabled="draft.dateToBeDecided"><option value="none">One-time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div><div v-if="draft.recurrence.frequency !== 'none'" class="form-group"><label class="lbl">Repeat every</label><input v-model.number="draft.recurrence.interval" type="number" min="1" max="24" class="input" /></div><div v-if="draft.recurrence.frequency === 'monthly'" class="form-group"><label class="lbl">Day of month</label><input v-model.number="draft.recurrence.byMonthDay" class="input" type="number" min="1" max="31" /></div><div v-if="draft.recurrence.frequency !== 'none'" class="form-group"><label class="lbl">Repeat until</label><input v-model="draft.recurrence.untilDate" type="date" class="input" /></div></div><div v-if="draft.recurrence.frequency === 'weekly'" class="chips"><label v-for="d in weekdayOptions" :key="d.value" class="chip-toggle"><input type="checkbox" :checked="draft.recurrence.byWeekday.includes(d.value)" @change="toggleWeekday(d.value,$event.target.checked)" />{{ d.label }}</label></div></details>
        </section>

        <section v-show="activeStep === 'invitees'" class="editor-section">
          <div class="section-heading"><span class="eyebrow">THE GUEST LIST</span><h3>Who’s invited?</h3><p>Your audience is the people who can see this private event and receive its invitations, reminders and dashboard announcements.</p></div>
          <div class="scope-card"><label class="lbl">Invited agencies</label><p class="hint">Include your agency or bring a few agencies together. Only agencies you can manage appear here.</p><div class="chips"><label v-for="agency in availableAgencies" :key="agency.id" class="agency-chip" :class="{ selected: Number(agency.id) === Number(agencyId) || draft.invitedAgencyIds.includes(Number(agency.id)) }"><input type="checkbox" :checked="Number(agency.id) === Number(agencyId) || draft.invitedAgencyIds.includes(Number(agency.id))" :disabled="Number(agency.id) === Number(agencyId)" @change="toggleAgency(agency.id,$event.target.checked)" />{{ agency.name }}</label></div></div>
          <div class="audience-mode"><button type="button" :class="{ selected: inviteEveryone }" @click="clearAudience"><strong>Everyone in invited agencies</strong><small>All eligible active people</small></button><button type="button" :class="{ selected: !inviteEveryone }" @click="inviteEveryone = false"><strong>Choose people, roles or groups</strong><small>Build a specific invitation list</small></button></div>
          <div v-if="inviteEveryone" class="info-note"><strong>{{ audienceUsers.length }} eligible people</strong> in the invited agencies. Everyone is optional unless you mark someone mandatory below.</div>
          <EventPeoplePicker v-else v-model="draft.audience.userIds" v-model:mandatory-user-ids="draft.mandatoryUserIds" :users="audienceUsers" label="Invited people" search-label="Search invitees" mandatory />
          <div v-if="!inviteEveryone" class="audience-grid"><div class="choice-card"><h4>Roles <span>{{ draft.audience.roleKeys.length }} selected</span></h4><label v-for="role in audienceRoles" :key="role.key" class="check-label"><input type="checkbox" :checked="draft.audience.roleKeys.includes(role.key)" @change="toggleRole(role.key,$event.target.checked)" />{{ role.label }}</label></div><div class="choice-card"><h4>Active groups <span>{{ draft.audience.groupIds.length }} selected</span></h4><input v-model="groupSearch" type="search" class="input" aria-label="Search active groups" placeholder="Search groups" /><label v-for="group in filteredAudienceGroups" :key="group.id" class="check-label"><input type="checkbox" :checked="draft.audience.groupIds.includes(group.id)" @change="toggleGroup(group.id,$event.target.checked)" />{{ group.name }}</label><p v-if="!filteredAudienceGroups.length" class="hint">No active groups match. Inactive groups stay out of this list.</p></div></div>
          <details class="advanced-section"><summary>Mandatory attendance <span class="inline-count">{{ draft.mandatoryUserIds.length }}</span></summary><p class="hint">Invitations are optional by default. Select people whose attendance is mandatory. Marking someone mandatory also includes them in the invitation list.</p><EventPeoplePicker :users="audienceUsers" :model-value="draft.mandatoryUserIds" label="Mandatory attendees" search-label="Search mandatory attendees" @update:model-value="setMandatoryUsers" /></details>
        </section>

        <section v-show="activeStep === 'experience'" class="editor-section">
          <EventLinkedPolls v-if="activeStep === 'experience'" :agency-id="agencyId" :event="selectedEventDetails" :user-ids="pollAudienceIds" />
          <div class="section-divider"></div><div class="section-heading"><span class="eyebrow">A SHARED TABLE</span><h3>Make it a potluck</h3><p>Request specific dishes or let people decide what to bring. Invitees can claim and update their contributions on the event page.</p></div>
          <label class="feature-toggle"><input v-model="draft.potluckEnabled" type="checkbox" /><span><strong>Potluck style</strong><small>Bring people and their favorite dishes together.</small></span></label>
          <div v-if="draft.potluckEnabled" class="form-group"><label class="lbl">What the organizers are providing</label><textarea v-model.trim="draft.organizerProvidingRaw" rows="2" class="input" placeholder="Main dishes, drinks, plates — separate items with commas" /><p class="hint">After saving, add requested dishes and open category slots below. Invitees may also suggest their own contribution.</p></div>
          <StaffEventInviteePanel v-if="draft.id && draft.potluckEnabled && activeStep === 'experience'" :agency-id="agencyId" :event-id="draft.id" :potluck-enabled="true" view="potluck" />
          <div class="form-group"><label class="lbl">Guests</label><select v-model="draft.guestPolicy" class="input"><option value="staff_only">Invited people only</option><option value="plus_one">Invitees may bring a plus one</option><option value="family_invited">Family invited</option></select></div>
          <div class="section-divider"></div><label class="feature-toggle"><input v-model="draft.isWorkEvent" type="checkbox" /><span><strong>This is a work event</strong><small>Enable employee clock-in, clock-out and the existing payroll approval flow.</small></span></label>
          <div v-if="draft.isWorkEvent && isServiceProgramEventType" class="form-group"><label class="lbl">Skill Builders direct hours</label><input v-model.number="draft.skillBuilderDirectHours" class="input" type="number" min="0" step="0.25" placeholder="Optional direct-hours allocation" /><p class="hint">Used for the existing Skill Builders payroll split.</p></div>
          <div class="section-divider"></div><EventOperationsSettings v-model="draft" :users="canManageAll ? coordinatorUsers : []" />
          <details class="advanced-section"><summary>Program &amp; guardian registration settings</summary><p class="hint">Use these for program registration and family enrollment. An internal company event does not need catalog registration.</p><div class="grid"><div class="form-group"><label class="lbl">Show in guardian registration catalog</label><select v-model="draft.registrationEligible" class="input"><option :value="false">No</option><option :value="true">Yes</option></select></div><div class="form-group"><label class="lbl">Registration status</label><select v-model="draft.publicRegistrationStatus" class="input"><option value="open">Open</option><option value="limited">Limited</option><option value="waitlist">Waitlist</option><option value="closed">Closed</option></select></div><label class="check-label"><input v-model="draft.medicaidEligible" type="checkbox" />Medicaid eligible</label><label class="check-label"><input v-model="draft.cashEligible" type="checkbox" />Cash / self-pay eligible</label></div><label class="lbl">Registration banner (optional)</label><input v-model.trim="draft.publicRegistrationStatusLabel" class="input" maxlength="120" placeholder="A short registration status note" /><label class="lbl">Public hero image URL</label><input v-model.trim="draft.publicHeroImageUrl" type="url" class="input" placeholder="https://…" /><label class="lbl">Public page details</label><textarea v-model.trim="draft.publicListingDetails" rows="2" class="input" /><label class="check-label"><input v-model="draft.inPersonPublic" type="checkbox" />Show the venue on the public page</label></details>
        </section>

        <section v-show="activeStep === 'reminders'" class="editor-section">
          <div class="section-heading"><span class="eyebrow">KEEP EVERYONE IN THE LOOP</span><h3>A thoughtful reminder, at the right time</h3><p>RSVP nudges stop as soon as someone replies. Attendance reminders help those coming remember the event.</p></div>
          <div class="schedule-card"><label class="feature-toggle"><input v-model="draft.reminderConfig.rsvp.enabled" type="checkbox" /><span><strong>Ask invitees to RSVP</strong><small>Only invited people who have not answered receive these.</small></span></label><div v-if="draft.reminderConfig.rsvp.enabled" class="schedule-options"><label class="lbl">Repeat every<input v-model.number="draft.reminderConfig.rsvp.intervalHours" class="input" type="number" min="12" max="720" step="12" /><small class="hint">Hours between nudges · 48 hours recommended</small></label><div class="channel-options"><label class="check-label"><input v-model="draft.reminderConfig.rsvp.channels.inApp" type="checkbox" />In-app</label><label class="check-label"><input v-model="draft.reminderConfig.rsvp.channels.email" type="checkbox" />Branded email</label><label class="check-label"><input v-model="draft.reminderConfig.rsvp.channels.sms" type="checkbox" />Eligible text</label></div></div></div>
          <div class="schedule-card"><label class="feature-toggle"><input v-model="draft.reminderConfig.enabled" type="checkbox" /><span><strong>Remind people who are attending</strong><small>Sent to Yes and Maybe responses, after the event date is set.</small></span></label><div v-if="draft.reminderConfig.enabled" class="schedule-options"><label class="lbl">Hours before the event<input v-model.trim="draft.reminderOffsetsRaw" class="input" placeholder="168, 24" /></label><small class="hint">Default: 7 days and 24 hours before. Add other hours separated by commas.</small><div class="channel-options"><label class="check-label"><input v-model="draft.reminderConfig.channels.inApp" type="checkbox" />In-app</label><label class="check-label"><input v-model="draft.reminderConfig.channels.email" type="checkbox" />Branded email</label><label class="check-label"><input v-model="draft.reminderConfig.channels.sms" type="checkbox" />Eligible text</label></div></div></div>
          <div class="section-divider"></div><div class="section-heading"><span class="eyebrow">ON THEIR DASHBOARD</span><h3>Scheduled event announcements</h3><p>A splash is an event card on an invitee’s dashboard. Schedule several moments to share the plan. Only invited people see these.</p></div>
          <div v-for="(announcement,index) in draft.dashboardAnnouncements" :key="announcement.id" class="announcement-card"><div class="announcement-heading"><strong>Announcement {{ index + 1 }}</strong><button type="button" class="text-button" @click="draft.dashboardAnnouncements.splice(index,1)">Remove</button></div><div class="grid"><label class="lbl">Show from<input :value="toLocalInput(announcement.scheduledAt)" type="datetime-local" class="input" @input="updateAnnouncementTime(announcement,'scheduledAt',$event.target.value)" /></label><label class="lbl">Hide after<input :value="toLocalInput(announcement.endsAt)" type="datetime-local" class="input" @input="updateAnnouncementTime(announcement,'endsAt',$event.target.value)" /></label></div><label class="lbl">Message<textarea v-model.trim="announcement.content" rows="2" class="input" maxlength="2000" placeholder="A note for the people you invited" /></label></div><button type="button" class="btn btn-secondary" @click="addAnnouncement">+ Schedule an announcement</button>
        </section>

        <section v-show="activeStep === 'review'" class="editor-section">
          <div class="section-heading"><span class="eyebrow">READY TO BRING IT TO LIFE</span><h3>Review your invitation</h3><p>Save the event, then send your invitations. People can RSVP, vote and follow updates from their event page.</p></div>
          <dl class="review-facts"><div><dt>Audience</dt><dd>{{ audienceSummary }}</dd></div><div><dt>Attendance</dt><dd>Optional by default · {{ draft.mandatoryUserIds.length }} mandatory</dd></div><div><dt>Event page</dt><dd>{{ draft.publicRegistrationEnabled ? 'Private invitee page + public attendee page' : 'Private page for invited people' }}</dd></div><div><dt>Planning</dt><dd>{{ draft.dateToBeDecided ? 'Date to be decided · vote with your invitees' : formatDate(draftStartIso, draft.timezone) }}</dd></div><div><dt>Reminders</dt><dd>{{ draft.reminderConfig.rsvp.enabled ? `RSVP every ${draft.reminderConfig.rsvp.intervalHours} hours until answered` : 'RSVP nudges off' }}<br />{{ draft.reminderConfig.enabled ? `Attendance ${draft.reminderOffsetsRaw} hours before` : 'Attendance reminders off' }}</dd></div></dl>
          <div class="send-card"><h4>Send the invitation</h4><p class="hint">Emails use the agency’s event branding. Multi-agency invitations use PlotTwistCo’s events sender with the participating agency brands.</p><div class="channel-options"><label class="check-label"><input v-model="inviteChannels.email" type="checkbox" />Branded email</label><label class="check-label"><input v-model="inviteChannels.inApp" type="checkbox" />In-app invitation</label><label class="check-label"><input v-model="inviteChannels.sms" type="checkbox" />Eligible text</label></div><div v-if="inviteChannels.sms" class="sms-preview">You have been invited to {{ draft.title || '[event name]' }}. Please RSVP via text with Yes, No, Maybe. You can click this link: [private event page].<small>Delivery includes the event reply code and required text preferences.</small></div><button type="button" class="btn btn-primary" :disabled="!draft.id || saving || sendingInvites || !Object.values(inviteChannels).some(Boolean)" @click="sendInvitations">{{ sendingInvites ? 'Sending invitations…' : 'Send invitations' }}</button><p v-if="!draft.id" class="hint">Save this event below to generate its private page and send invitations.</p><p v-if="invitationNotice" role="status" class="info-note">{{ invitationNotice }}</p></div>
          <div v-if="draft.id" class="event-tools"><button type="button" class="btn btn-secondary" :disabled="openingConversation" @click="messageInvitees(selectedEventDetails)">{{ openingConversation ? 'Opening conversation…' : 'Message invitees' }}</button><span class="hint">An event-named group in Direct Messages and Groups.</span></div>
          <EventShareLinks v-if="draft.id" :event="selectedEventDetails" />
          <StaffEventInviteePanel v-if="draft.id && activeStep === 'review'" :key="`${draft.id}-${inviteRefresh}`" :agency-id="agencyId" :event-id="draft.id" :potluck-enabled="draft.potluckEnabled" :show-send-actions="false" />
          <details v-if="draft.id" class="advanced-section"><summary>Text campaigns &amp; delivery</summary><EventTextCampaignPanel :agency-id="agencyId" :event="selectedEventDetails" /></details>
        </section>
        <footer class="editor-footer"><button v-if="activeStep !== 'details'" type="button" class="btn btn-secondary" @click="previousStep">Back</button><span class="footer-note">{{ draft.id ? 'Your event has a home. Save any changes before sending.' : 'Save first. Send invitations when you’re ready.' }}</span><button v-if="activeStep !== 'review'" type="button" class="btn btn-secondary" @click="nextStep">Continue →</button><button type="button" class="btn btn-primary" @click="saveEvent" :disabled="saving || !agencyId">{{ saving ? 'Saving…' : (draft.id ? 'Save changes' : 'Create event') }}</button></footer>
      </div>
      <aside class="invitation-preview" aria-label="Live event invitation preview"><div class="preview-topline"><span>THE INVITATION</span><span>Live preview</span></div><div class="preview-art" aria-hidden="true"><span class="art-circle"></span><span class="art-stem"></span><span class="art-leaf one"></span><span class="art-leaf two"></span><span class="art-leaf three"></span><div class="preview-art-label">A LITTLE TIME<br />TOGETHER.</div></div><div class="preview-body"><span class="eyebrow">YOU’RE INVITED</span><h3>{{ draft.title || 'Something worth getting together for.' }}</h3><p>{{ draft.description || 'Add the details that will make your people feel welcome.' }}</p><div class="preview-detail"><span aria-hidden="true">◷</span><div><strong>{{ draft.dateToBeDecided || !draft.startsAtLocal ? 'Date to be decided' : formatDate(draftStartIso,draft.timezone) }}</strong><small>{{ draft.dateToBeDecided ? 'Help choose a date on the event page' : draft.timezone }}</small></div></div><div class="preview-detail"><span aria-hidden="true">⌖</span><div><strong>{{ draft.eventLocationName || 'A place to connect' }}</strong><small>{{ draft.eventLocationAddress || 'Venue details to follow' }}</small></div></div><div class="preview-rsvp"><span>We’d love to see you.</span><div><span>Yes</span><span>No</span><span>Maybe</span></div></div><div class="preview-tags"><span>{{ draft.publicRegistrationEnabled ? 'Public + private pages' : 'Private invitation' }}</span><span v-if="draft.potluckEnabled">Potluck</span><span v-if="draft.isWorkEvent">Work event</span></div></div><p class="preview-caption">A welcoming, agency-branded invitation with a private event page for your people.</p></aside>
    </div>

    <section class="event-directory" aria-labelledby="event-directory-heading">
      <div class="directory-heading"><div><span class="eyebrow">YOUR CALENDAR, WITH ROOM TO PLAN</span><h3 id="event-directory-heading">Events <span>{{ filteredEvents.length }}</span></h3></div><div class="status-tabs" aria-label="Event status"><button v-for="tab in eventStatusOptions" :key="tab.value" type="button" :class="{ active: eventStatus === tab.value }" @click="eventStatus = tab.value">{{ tab.label }}</button></div></div>
      <div class="directory-tools"><input v-model="eventSearch" type="search" class="input" aria-label="Search events" placeholder="Search event, venue, description or audience…" /><select v-model="eventCategory" class="input" aria-label="Event category"><option value="company">Company events</option><option value="program">Program events</option><option value="school">School events</option><option value="all">All event types</option></select><select v-model="eventSort" class="input" aria-label="Sort events"><option value="soonest">Soonest first</option><option value="latest">Latest first</option><option value="title">Name A–Z</option><option value="type">Event type</option></select><label class="payment-filter"><input v-model="outstandingOnly" type="checkbox" />Needs payment</label></div>
      <div class="table-wrap"><table class="table"><thead><tr><th scope="col">Event</th><th scope="col">When &amp; where</th><th scope="col">Invitees</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody><tr v-for="event in filteredEvents" :key="event.id"><td><div class="event-name">{{ event.title }}</div><div class="event-badges"><span>{{ eventTypeLabel(event) }}</span><span v-if="event.dateToBeDecided || !event.startsAt" class="planning-badge">Planning</span><span v-if="event.isActive === false">Inactive</span><span v-if="event.potluckEnabled">Potluck</span><span v-if="event.requiresPayment">{{ eventPaymentLabel(event) }}</span></div></td><td><strong class="event-date">{{ event.dateToBeDecided || !event.startsAt ? 'Date to be decided' : formatDate(event.startsAt,event.timezone) }}</strong><div class="hint">{{ event.eventLocationName || (event.dateToBeDecided ? 'Invite people to help plan' : 'Venue to follow') }}<span v-if="event.recurrence?.frequency && event.recurrence.frequency !== 'none'"> · {{ recurrenceLabel(event.recurrence) }}</span></div></td><td><div class="audience-cell">{{ audienceLabel(event.audience) }}</div><div class="hint">{{ event.publicRegistrationEnabled ? 'Public + private' : 'Private event page' }}<span v-if="event.organizationId"> · {{ programLabelForEvent(event) }}</span></div></td><td class="directory-actions"><a v-if="event.staffPageUrl" :href="event.staffPageUrl" class="open-link">Open event ↗</a><button type="button" class="btn btn-secondary btn-sm" @click="editEvent(event)">Edit</button><details class="more-actions"><summary aria-label="More event actions">More <span aria-hidden="true">⌄</span></summary><div class="action-menu"><button type="button" @click="openEventTab(event,'review')">Invitations &amp; responses</button><button type="button" @click="openEventTab(event,'experience')">Votes &amp; potluck</button><button v-if="canManageAll" type="button" @click="openEventTab(event,'reminders')">Schedule announcements</button><button type="button" @click="messageInvitees(event)">Message invitees</button><button type="button" @click="viewDeliveryLogs(event)">Delivery history</button><button type="button" @click="downloadResponsesCsv(event)">Export responses</button><a v-if="event.googleCalendarUrl" :href="event.googleCalendarUrl" target="_blank" rel="noopener">Add to Google Calendar</a><a v-if="event.startsAt && event.icsUrl" :href="event.icsUrl">Download calendar file</a><button v-if="canManageAll" type="button" @click="setEventActive(event,event.isActive === false)">{{ event.isActive === false ? 'Make active' : 'Make inactive' }}</button><button v-if="canManageAll" type="button" class="danger-action" @click="removeEvent(event)">Delete event</button></div></details></td></tr><tr v-if="!filteredEvents.length"><td colspan="4" class="empty-directory"><span aria-hidden="true">◷</span><strong>{{ eventSearch ? 'No events match your search' : outstandingOnly ? 'No matching events need payment' : eventStatus === 'upcoming' ? 'Room for your next gathering' : 'No events in this view' }}</strong><p>{{ eventSearch ? 'Try a different event name, detail or venue.' : eventStatus === 'upcoming' ? 'Upcoming events and plans without a date appear here. Past and inactive events have their own views.' : 'Choose another status or event type to keep exploring.' }}</p><button v-if="canManageAll && !eventSearch && eventStatus === 'upcoming'" type="button" class="btn btn-secondary" @click="startCreate">Create an event</button></td></tr></tbody></table></div>
    </section>
  </section>
</template>

<script setup>
import EventOperationsSettings from './EventOperationsSettings.vue';
import EventPeoplePicker from './EventPeoplePicker.vue';
import EventLinkedPolls from './EventLinkedPolls.vue';
import StaffEventInviteePanel from './StaffEventInviteePanel.vue';
import EventShareLinks from './EventShareLinks.vue';
import EventTextCampaignPanel from './EventTextCampaignPanel.vue';
import { eventOperationsDraft, eventOperationsPayload, eventPaymentError, needsEventPayment, eventPaymentLabel } from '../../utils/eventOperations';
import { canManageConversaTeam } from '../../constants/conversa';
import StaffPollResultsReview from './StaffPollResultsReview.vue';

import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../store/auth';
import api from '../../services/api';
import { getStartupData } from '../../services/startupRequests';
import {
  formatBusinessDateTime,
  isoToZonedDatetimeLocal,
  zonedDatetimeLocalToIso,
  SCHOOL_EVENT_FALLBACK_TIMEZONE
} from '../../utils/timezones';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const canManageTeam = computed(() => canManageConversaTeam(authStore.user));
const teamCommunicationsPath = computed(() => {
  const slug = route.params?.organizationSlug;
  return { path: `${slug ? '/' + slug : ''}/admin/communications`, query: { mode: 'team' } };
});
const canManageAll = computed(() => ['admin', 'super_admin', 'support', 'staff'].includes(String(authStore.user?.role || '').toLowerCase()) || events.value.some(event => event.canAssignCoordinators === true));
const reviewingPoll=ref(null);
const affiliateProgramOrgs = ref([]);
const editorElement=ref(null), successElement=ref(null);
const revealEditor=()=>nextTick(()=>editorElement.value?.scrollIntoView?.({behavior:'smooth',block:'start'}));
const editorOpen = ref(false), activeStep = ref('details'), success = ref(null), inviteEveryone = ref(true);
const coordinatorUsers = ref([]), agencyOptions = ref([]), groupSearch = ref('');
const editorSteps = [{id:'details',label:'Details'},{id:'invitees',label:'Invitees'},{id:'experience',label:'Experience'},{id:'reminders',label:'Reminders'},{id:'review',label:'Review & send'}];
const eventSearch=ref(''), eventCategory=ref('company'), eventStatus=ref('upcoming'), eventSort=ref('soonest');
const eventStatusOptions=[{value:'upcoming',label:'Upcoming & planning'},{value:'past',label:'Past'},{value:'inactive',label:'Inactive'},{value:'all',label:'All'}];
const inviteChannels=ref({email:true,inApp:true,sms:false}), sendingInvites=ref(false), invitationNotice=ref(''), inviteRefresh=ref(0), openingConversation=ref(false);
const availableAgencies=computed(()=>agencyOptions.value.length?agencyOptions.value:[{id:props.agencyId,name:'Current agency'}]);

const props = defineProps({
  agencyId: {
    type: Number,
    default: null
  },
  title: {
    type: String,
    default: 'Company events'
  },
  subtitle: {
    type: String,
    default: 'Company gatherings, celebrations and shared plans.'
  },
  reloadLabel: {
    type: String,
    default: 'Reload'
  },
  newEventLabel: {
    type: String,
    default: 'New event'
  },
  newDirectMessageLabel: {
    type: String,
    default: 'New direct message'
  },
  createEventLabel: {
    type: String,
    default: 'Create event'
  },
  editEventLabel: {
    type: String,
    default: 'Edit event'
  },
  emptyEventsLabel: {
    type: String,
    default: 'No company events yet.'
  }
});

const loading = ref(false);
const saving = ref(false);
const error = ref('');
const events = ref([]);
const audienceUsers = ref([]);
const audienceGroups = ref([]);
const audienceRoles = ref([]);
const selectedTemplateId = ref('');
const directMessageTemplates = ref([
  {
    id: 'congrats',
    name: 'Congrats',
    titleTemplate: 'Congratulations!',
    messageTemplate: "Congratulations on your achievement. We are proud of your work."
  },
  {
    id: 'pickup-prize',
    name: 'Prize pickup',
    titleTemplate: 'Prize pickup',
    messageTemplate: 'Please come by the office this week to pick up your prize.'
  },
  {
    id: 'come-to-office',
    name: 'Come to office',
    titleTemplate: 'Office visit request',
    messageTemplate: 'Please come to the office when you can. See front desk on arrival.'
  }
]);
const smsReadiness = ref({
  ready: false,
  message: 'Checking event texting…'
});

const weekdayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (New York)' },
  { value: 'America/Chicago', label: 'Central (Chicago)' },
  { value: 'America/Denver', label: 'Mountain (Denver)' },
  { value: 'America/Phoenix', label: 'Mountain no DST (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'UTC', label: 'UTC' }
];

const EVENT_TYPE_OPTIONS = [
  { value: 'company_event', label: 'Company Event' },
  { value: 'staff_event', label: 'Staff/Internal Event' },
  { value: 'team_celebration', label: 'Team celebration' },
  { value: 'staff_get_together', label: 'Staff get-together' },
  { value: 'team_training', label: 'Team training' },
  { value: 'program_event', label: 'Program event' },
  { value: 'guardian_program_class', label: 'Guardian program class' },
  { value: 'school_back_to_school', label: 'School — Back to School' },
  { value: 'school_fall_check_in', label: 'School — Fall School Check-in' },
  { value: 'school_spring_event', label: 'School — Spring School Check-in' },
  { value: 'school_first_day', label: 'School — First Day of School' }
];

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const defaultReminders = (existing = {}) => ({
  ...existing,
  enabled: existing.enabled !== false,
  offsetsHours: Array.isArray(existing.offsetsHours) ? [...existing.offsetsHours] : [168,24],
  channels: { inApp: existing.channels?.inApp !== false, email: existing.channels?.email !== false, sms: !!existing.channels?.sms },
  rsvp: { enabled: existing.rsvp?.enabled !== false, intervalHours: Number(existing.rsvp?.intervalHours || 48), channels: {inApp: existing.rsvp?.channels?.inApp !== false, email: existing.rsvp?.channels?.email !== false, sms: !!existing.rsvp?.channels?.sms} }
});

const emptyDraft = () => ({
  ...eventOperationsDraft(),
  id: null,
  isActive: true,
  organizationId: 0,
  title: '',
  description: '',
  eventType: 'company_event',
  timezone: browserTimeZone(),
  splashContent: '',
  startsAtLocal: '',
  endsAtLocal: '',
  recurrence: {
    frequency: 'none',
    interval: 1,
    byWeekday: [],
    byMonthDay: null,
    untilDate: ''
  },
  rsvpMode: 'yes_no_maybe',
  smsCode: '',
  votingConfig: {
    enabled: false,
    viaSms: false,
    question: '',
    shareResults:true,allowOther:false,
    options: [
      { key: '1', label: 'Yes' },
      { key: '2', label: 'No' },
      { key: '3', label: 'Maybe' }
    ]
  },
  reminderConfig: defaultReminders(),
  reminderOffsetsRaw: '168,24',
  potluckEnabled: false,
  organizerProvidingRaw: '',
  guestPolicy: 'staff_only',
  audience: {
    userIds: [],
    groupIds: [],
    roleKeys: []
  },
  skillBuilderDirectHours: null,
  registrationEligible: false,
  publicRegistrationStatus: 'open',
  publicRegistrationStatusLabel: '',
  medicaidEligible: false,
  cashEligible: false,
  publicHeroImageUrl: '',
  publicListingDetails: '',
  inPersonPublic: false,
  publicLocationAddress: '',
  eventLocationName: '',
  eventLocationAddress: ''
});

const draft = ref(emptyDraft());
const selectedEventRecord = ref(null);
const selectedEventDetails = computed(() => events.value.find(event => Number(event.id) === Number(draft.value.id)) || (Number(selectedEventRecord.value?.id) === Number(draft.value.id) ? selectedEventRecord.value : null) || draft.value);
const outstandingOnly = ref(false);
const filteredEvents = computed(() => {
  const term=eventSearch.value.trim().toLocaleLowerCase(), now=Date.now();
  const isPast = event => {
    if (event.dateToBeDecided || !event.startsAt) return false;
    if (event.recurrence?.frequency && event.recurrence.frequency !== 'none') return event.recurrence.untilDate ? new Date(`${event.recurrence.untilDate}T23:59:59`).getTime() < now : false;
    return new Date(event.endsAt || event.startsAt).getTime() < now;
  };
  const list=events.value.filter(event => {
    const type=String(event.eventType || 'company_event').toLowerCase(), inactive=event.isActive===false||event.is_active===0;
    if (['team_poll','direct_notice'].includes(type)) return false;
    if (eventStatus.value==='upcoming' && (inactive || isPast(event))) return false;
    if (eventStatus.value==='past' && (inactive || !isPast(event))) return false;
    if (eventStatus.value==='inactive' && !inactive) return false;
    const category=type.startsWith('school_')?'school':event.organizationId||type.startsWith('program_')||type==='guardian_program_class'?'program':'company';
    if(eventCategory.value!=='all'&&eventCategory.value!==category)return false;
    if(outstandingOnly.value&&!needsEventPayment(event))return false;
    const searchText=[event.title,event.description,event.splashContent,event.eventType,event.eventLocationName,event.eventLocationAddress,programLabelForEvent(event),audienceLabel(event.audience),...(event.invitedAgencyNames||[]),...audienceUsers.value.filter(u=>(event.audience?.userIds||[]).includes(Number(u.id))).flatMap(u=>[u.name,u.email]),...audienceGroups.value.filter(g=>(event.audience?.groupIds||[]).includes(Number(g.id))).map(g=>g.name),...audienceRoles.value.filter(r=>(event.audience?.roleKeys||[]).includes(r.key)).map(r=>r.label),...availableAgencies.value.filter(a=>(event.invitedAgencyIds||[]).includes(Number(a.id))).map(a=>a.name)].join(' ').toLocaleLowerCase();
    return !term || searchText.includes(term);
  });
  const time=event=>event.dateToBeDecided||!event.startsAt?Infinity:new Date(event.nextOccurrence?.startsAt||event.startsAt).getTime();
  return list.sort((a,b)=> eventSort.value==='title' ? String(a.title).localeCompare(String(b.title),undefined,{sensitivity:'base'}) : eventSort.value==='type' ? eventTypeLabel(a).localeCompare(eventTypeLabel(b))||String(a.title).localeCompare(String(b.title)) : eventSort.value==='latest' ? time(b)-time(a) : time(a)-time(b));
});
const filteredAudienceGroups=computed(()=>audienceGroups.value.filter(g=>String(g.name||'').toLowerCase().includes(groupSearch.value.trim().toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)));
const audienceSummary=computed(()=>inviteEveryone.value?`Everyone in ${1+draft.value.invitedAgencyIds.filter(id=>Number(id)!==Number(props.agencyId)).length} invited ${draft.value.invitedAgencyIds.filter(id=>Number(id)!==Number(props.agencyId)).length?'agencies':'agency'} · ${audienceUsers.value.length} eligible people`:audienceLabel(draft.value.audience));
const pollAudienceIds=computed(()=>inviteEveryone.value?audienceUsers.value.map(u=>Number(u.id)):[...new Set([...draft.value.audience.userIds,...audienceUsers.value.filter(u=>draft.value.audience.roleKeys.includes(String(u.role))).map(u=>Number(u.id)),...audienceGroups.value.filter(g=>draft.value.audience.groupIds.includes(Number(g.id))).flatMap(g=>g.userIds||[])])]);
const draftStartIso=computed(()=>draft.value.startsAtLocal?zonedDatetimeLocalToIso(draft.value.startsAtLocal,draft.value.timezone):null);
const eventTypeLabel=event=>EVENT_TYPE_OPTIONS.find(t=>t.value===event.eventType)?.label || String(event.eventType||'Company event').replaceAll('_',' ');
const nextStep=()=>{const index=editorSteps.findIndex(s=>s.id===activeStep.value);activeStep.value=editorSteps[Math.min(index+1,editorSteps.length-1)].id;};
const previousStep=()=>{const index=editorSteps.findIndex(s=>s.id===activeStep.value);activeStep.value=editorSteps[Math.max(index-1,0)].id;};
const eventTypeSelection = computed({
  get() {
    const raw = String(draft.value.eventType || '').trim();
    return EVENT_TYPE_OPTIONS.some((opt) => opt.value === raw) ? raw : '__custom__';
  },
  set(next) {
    const value = String(next || '').trim();
    if (value === '__custom__') {
      if (!draft.value.eventType || EVENT_TYPE_OPTIONS.some((opt) => opt.value === draft.value.eventType)) {
        draft.value.eventType = '';
      }
      return;
    }
    draft.value.eventType = value;
  }
});
const isServiceProgramEventType = computed(() => {
  const t = String(draft.value.eventType || '').trim().toLowerCase();
  return t === 'guardian_program_class' || t === 'program_event' || t.startsWith('program_');
});

const draftTimezone = () =>
  String(draft.value?.timezone || '').trim() || browserTimeZone() || SCHOOL_EVENT_FALLBACK_TIMEZONE;

const formatDate = (dateLike, timezone) => {
  const formatted = formatBusinessDateTime(dateLike, timezone || SCHOOL_EVENT_FALLBACK_TIMEZONE);
  return formatted === '—' ? '-' : formatted;
};

const toLocalInput = (dateLike, timezone) =>
  isoToZonedDatetimeLocal(dateLike, timezone || draftTimezone());

const recurrenceLabel = (recurrence) => {
  const frequency = String(recurrence?.frequency || 'none');
  if (frequency === 'none') return 'One-time';
  if (frequency === 'weekly') return `Weekly (every ${Number(recurrence?.interval || 1)} week${Number(recurrence?.interval || 1) > 1 ? 's' : ''})`;
  if (frequency === 'monthly') return `Monthly (every ${Number(recurrence?.interval || 1)} month${Number(recurrence?.interval || 1) > 1 ? 's' : ''})`;
  return 'Recurring';
};

const audienceLabel = (audience) => {
  const users = Array.isArray(audience?.userIds) ? audience.userIds.length : 0;
  const groups = Array.isArray(audience?.groupIds) ? audience.groupIds.length : 0;
  const roles = Array.isArray(audience?.roleKeys) ? audience.roleKeys.length : 0;
  if (!users && !groups && !roles) return 'Everyone in invited agencies';
  return [users ? `${users} ${users===1?'person':'people'}` : '',groups ? `${groups} ${groups===1?'group':'groups'}` : '',roles ? `${roles} ${roles===1?'role':'roles'}` : ''].filter(Boolean).join(' · ');
};

const programLabelForEvent = (event) => {
  const id = event?.organizationId;
  if (id === null || id === undefined || id === '') return '—';
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const o = affiliateProgramOrgs.value.find((x) => Number(x.id) === n);
  return o?.name ? String(o.name) : `Org ${n}`;
};

const normalizeRecurrenceForPayload = (recurrence = {}) => {
  const frequency = String(recurrence.frequency || 'none');
  const payload = { frequency };
  if (frequency === 'none') return payload;
  payload.interval = Math.max(1, Number.parseInt(String(recurrence.interval || 1), 10) || 1);
  if (frequency === 'weekly') {
    payload.byWeekday = Array.isArray(recurrence.byWeekday) ? recurrence.byWeekday.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6) : [];
  }
  if (frequency === 'monthly') {
    const monthDay = Number.parseInt(String(recurrence.byMonthDay || ''), 10);
    if (Number.isFinite(monthDay) && monthDay >= 1 && monthDay <= 31) payload.byMonthDay = monthDay;
  }
  if (recurrence.untilDate) payload.untilDate = recurrence.untilDate;
  return payload;
};

const resetDraft = () => { draft.value = emptyDraft(); inviteEveryone.value = true; groupSearch.value = ''; invitationNotice.value=''; };

const startCreate = () => { resetDraft(); selectedEventRecord.value=null; activeStep.value='details'; editorOpen.value=true; success.value=null; revealEditor(); };

const startDirectMessage = () => {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  draft.value = {
    ...emptyDraft(),
    eventType: 'direct_notice',
    title: 'Direct message',
    startsAtLocal: toLocalInput(now),
    endsAtLocal: toLocalInput(end),
    recurrence: {
      frequency: 'none',
      interval: 1,
      byWeekday: [],
      byMonthDay: null,
      untilDate: ''
    }
  };
};

const applyDirectTemplate = () => {
  const template = directMessageTemplates.value.find((item) => String(item.id) === String(selectedTemplateId.value));
  if (!template) return;
  startDirectMessage();
  draft.value.title = template.titleTemplate || template.name || 'Direct message';
  draft.value.description = template.messageTemplate || '';
  draft.value.splashContent = template.messageTemplate || '';
  draft.value.eventType = 'direct_notice';
};

const clearAudience = () => {
  inviteEveryone.value = true;
  draft.value.audience.userIds = [];
  draft.value.audience.groupIds = [];
  draft.value.audience.roleKeys = [];
};

const toggleUser = (userId, checked) => {
  const set = new Set(draft.value.audience.userIds);
  if (checked) set.add(Number(userId));
  else set.delete(Number(userId));
  draft.value.audience.userIds = [...set];
};

const toggleGroup = (groupId, checked) => {
  const set = new Set(draft.value.audience.groupIds);
  if (checked) set.add(Number(groupId));
  else set.delete(Number(groupId));
  draft.value.audience.groupIds = [...set];
};

const toggleRole = (roleKey, checked) => {
  const set = new Set(draft.value.audience.roleKeys);
  if (checked) set.add(String(roleKey));
  else set.delete(String(roleKey));
  draft.value.audience.roleKeys = [...set];
};

const toggleWeekday = (weekday, checked) => {
  const set = new Set(draft.value.recurrence.byWeekday);
  if (checked) set.add(Number(weekday));
  else set.delete(Number(weekday));
  draft.value.recurrence.byWeekday = [...set].sort((a, b) => a - b);
};

const editEvent = (event) => {
  editorOpen.value=true; activeStep.value='details'; invitationNotice.value=''; revealEditor();
  inviteEveryone.value=!(event.audience?.userIds?.length || event.audience?.groupIds?.length || event.audience?.roleKeys?.length);
  selectedEventRecord.value = event;
  if (!canManageAll.value) void loadAudienceOptions(event.id).catch(() => { error.value = 'Could not load staff choices for this event.'; });
  draft.value = {
    ...eventOperationsDraft(event),
    id: event.id,
    isActive: event.isActive !== false && event.is_active !== 0,
    organizationId:
      event.organizationId != null && event.organizationId !== '' && Number(event.organizationId) > 0
        ? Number(event.organizationId)
        : 0,
    title: event.title || '',
    description: event.description || '',
    eventType: event.eventType || 'company_event',
    timezone: String(event.timezone || '').trim() || browserTimeZone(),
    splashContent: event.splashContent || '',
    startsAtLocal: toLocalInput(event.startsAt, event.timezone),
    endsAtLocal: toLocalInput(event.endsAt, event.timezone),
    recurrence: {
      frequency: String(event.recurrence?.frequency || 'none'),
      interval: Number(event.recurrence?.interval || 1),
      byWeekday: Array.isArray(event.recurrence?.byWeekday) ? event.recurrence.byWeekday.map((d) => Number(d)) : [],
      byMonthDay: event.recurrence?.byMonthDay || null,
      untilDate: event.recurrence?.untilDate || ''
    },
    rsvpMode: event.rsvpMode || 'none',
    smsCode: event.smsCode || '',
    votingConfig: {
      ...(event.votingConfig || {}),
      enabled: !!event.votingConfig?.enabled,
      viaSms: !!event.votingConfig?.viaSms,
      question: event.votingConfig?.question || '',
      shareResults:event.votingConfig?.shareResults!==false,allowOther:event.votingConfig?.allowOther===true,
      options: Array.isArray(event.votingConfig?.options) && event.votingConfig.options.length
        ? event.votingConfig.options.map((o) => ({ key: String(o.key || ''), label: String(o.label || '') }))
        : [
            { key: '1', label: 'Yes' },
            { key: '2', label: 'No' },
            { key: '3', label: 'Maybe' }
          ]
    },
    reminderConfig: defaultReminders(event.reminderConfig || {}),
    reminderOffsetsRaw: Array.isArray(event.reminderConfig?.offsetsHours) && event.reminderConfig.offsetsHours.length ? event.reminderConfig.offsetsHours.join(',') : '168,24',
    potluckEnabled: !!event.potluckEnabled,
    organizerProvidingRaw: Array.isArray(event.organizerProviding) ? event.organizerProviding.join(', ') : '',
    guestPolicy: event.guestPolicy || 'staff_only',
      audience: {
        userIds: Array.isArray(event.audience?.userIds) ? event.audience.userIds.map((id) => Number(id)) : [],
        groupIds: Array.isArray(event.audience?.groupIds) ? event.audience.groupIds.map((id) => Number(id)) : [],
        roleKeys: Array.isArray(event.audience?.roleKeys) ? event.audience.roleKeys.map((k) => String(k)) : []
    },
    skillBuilderDirectHours:
      event.skillBuilderDirectHours != null && event.skillBuilderDirectHours !== ''
        ? Number(event.skillBuilderDirectHours)
        : null,
    registrationEligible: !!event.registrationEligible,
    publicRegistrationStatus: String(event.publicRegistrationStatus || 'open').trim().toLowerCase(),
    publicRegistrationStatusLabel: String(event.publicRegistrationStatusLabel || '').trim(),
    medicaidEligible: !!event.medicaidEligible,
    cashEligible: !!event.cashEligible,
    publicHeroImageUrl: String(event.publicHeroImageUrl || '').trim(),
    publicListingDetails: String(event.publicListingDetails || '').trim(),
    inPersonPublic: !!event.inPersonPublic,
    publicLocationAddress: String(event.publicLocationAddress || '').trim(),
    eventLocationName: String(event.eventLocationName || '').trim(),
    eventLocationAddress: String(event.eventLocationAddress || event.publicLocationAddress || '').trim()
  };
};

const loadAffiliateProgramOrgs = async () => {
  affiliateProgramOrgs.value = [];
  if (!props.agencyId) return;
  try {
    const res = await getStartupData('/availability/admin/skill-builders/options', {
      params: { agencyId: props.agencyId },
      skipGlobalLoading: true
    });
    const orgs = Array.isArray(res.data?.organizations) ? res.data.organizations : [];
    affiliateProgramOrgs.value = orgs.filter(
      (o) => String(o.organizationType || '').toLowerCase() !== 'school'
    );
  } catch {
    affiliateProgramOrgs.value = [];
  }
};

const saveEvent = async () => {
  if (!props.agencyId) return;
  const timezone = String(draft.value.timezone || '').trim() || browserTimeZone();
  const startsAtIso = draft.value.dateToBeDecided ? null : zonedDatetimeLocalToIso(draft.value.startsAtLocal, timezone);
  const endsAtIso = draft.value.dateToBeDecided ? null : zonedDatetimeLocalToIso(draft.value.endsAtLocal, timezone);
  const startsAt = startsAtIso ? new Date(startsAtIso) : null;
  const endsAt = endsAtIso ? new Date(endsAtIso) : null;
  if (!draft.value.title.trim()) {
    error.value = 'Title is required.';
    return;
  }
  if (!draft.value.dateToBeDecided && (!startsAt || !endsAt || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()))) {
    error.value = 'Start and end dates are required.';
    return;
  }
  if (!draft.value.dateToBeDecided && endsAt <= startsAt) {
    error.value = 'End time must be after start time.';
    return;
  }
  if ((draft.value.eventLocationName || draft.value.inPersonPublic) && !draft.value.eventLocationAddress) { error.value = 'Add the venue’s full street address, city, state, and ZIP.'; return; }
  if (!inviteEveryone.value && !draft.value.audience.userIds.length && !draft.value.audience.groupIds.length && !draft.value.audience.roleKeys.length) { error.value='Choose at least one person, role or active group, or invite everyone.'; activeStep.value='invitees'; return; }
  if (draft.value.dashboardAnnouncements.some(a=>!a.scheduledAt||!a.endsAt||!a.content||new Date(a.endsAt)<=new Date(a.scheduledAt))) {error.value='Add a message and a valid start and end time for each announcement.';activeStep.value='reminders';return;}
  if (eventPaymentError(draft.value)) { error.value = eventPaymentError(draft.value); return; }
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      ...eventOperationsPayload(draft.value),
      title: draft.value.title,
      isActive: draft.value.isActive,
      description: draft.value.description,
      eventType: draft.value.eventType || 'company_event',
      splashContent: draft.value.splashContent,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      timezone,
      recurrence: draft.value.dateToBeDecided ? {frequency:'none'} : normalizeRecurrenceForPayload(draft.value.recurrence),
      potluckEnabled: !!draft.value.potluckEnabled,
      organizerProviding: String(draft.value.organizerProvidingRaw || '').split(',').map(v=>v.trim()).filter(Boolean),
      guestPolicy: draft.value.guestPolicy,
      rsvpMode: isServiceProgramEventType.value ? 'none' : draft.value.rsvpMode,
      smsCode: draft.value.smsCode || null,
      votingConfig: {
        ...draft.value.votingConfig,
        enabled: !!draft.value.votingConfig.enabled,
        viaSms: !!draft.value.votingConfig.viaSms,
        question: String(draft.value.votingConfig.question || '').trim(),
        shareResults:draft.value.votingConfig.shareResults!==false,allowOther:draft.value.votingConfig.allowOther===true,
        options: (Array.isArray(draft.value.votingConfig.options) ? draft.value.votingConfig.options : [])
          .map((o) => ({
            key: String(o.key || '').trim(),
            label: String(o.label || '').trim()
          }))
          .filter((o) => o.key && o.label)
      },
      reminderConfig: {
        ...draft.value.reminderConfig,
        offsetsHours: String(draft.value.reminderOffsetsRaw || '').split(',').map(n=>Number(String(n).trim())).filter(n=>Number.isFinite(n)&&n>0)
      },
      audience: isServiceProgramEventType.value || inviteEveryone.value
        ? { userIds: [], groupIds: [], roleKeys: [] }
        : {
            userIds: draft.value.audience.userIds,
            groupIds: draft.value.audience.groupIds,
            roleKeys: draft.value.audience.roleKeys
          },
      skillBuilderDirectHours:
        draft.value.skillBuilderDirectHours === '' || draft.value.skillBuilderDirectHours == null
          ? null
          : Number(draft.value.skillBuilderDirectHours),
      organizationId:
        draft.value.organizationId && Number(draft.value.organizationId) > 0
          ? Number(draft.value.organizationId)
          : null,
      registrationEligible: !!draft.value.registrationEligible,
      publicRegistrationStatus: String(draft.value.publicRegistrationStatus || 'open').trim().toLowerCase(),
      publicRegistrationStatusLabel: String(draft.value.publicRegistrationStatusLabel || '').trim().slice(0, 120) || null,
      medicaidEligible: !!draft.value.medicaidEligible,
      cashEligible: !!draft.value.cashEligible,
      publicHeroImageUrl: String(draft.value.publicHeroImageUrl || '').trim() || null,
      publicListingDetails: String(draft.value.publicListingDetails || '').trim() || null,
      inPersonPublic: !!draft.value.inPersonPublic,
      eventLocationName: draft.value.eventLocationName || null,
      eventLocationAddress: draft.value.eventLocationAddress || null,
      publicLocationAddress: draft.value.inPersonPublic
        ? String(draft.value.eventLocationAddress || '').trim() || null
        : null
    };
    const wasNew=!draft.value.id, savedTitle=draft.value.title, currentStep=activeStep.value;
    const response = draft.value.id ? await api.put(`/agencies/${props.agencyId}/company-events/${draft.value.id}`, payload) : await api.post(`/agencies/${props.agencyId}/company-events`, payload);
    const saved={...selectedEventDetails.value,...payload,...(response.data?.data || response.data || {}),id:Number(response.data?.id || response.data?.data?.id || draft.value.id)};
    selectedEventRecord.value=saved;
    try { await loadEvents(); } catch { /* The save succeeded; keep the saved event available even if refreshing the directory fails. */ }
    editEvent(events.value.find(e=>Number(e.id)===Number(saved.id)) || saved);
    activeStep.value=wasNew?'review':currentStep;
    success.value={title:wasNew?'Congratulations! Your event is created.':'Your event changes are saved.',message:wasNew?'Your private event page is ready. Add votes or potluck requests, then send invitations when you’re ready.':'Invitees can follow the latest details from their event page.'};
    await nextTick(); successElement.value?.scrollIntoView?.({behavior:'smooth',block:'start'});
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save event';
  } finally {
    saving.value = false;
  }
};

const removeEvent = async (event) => {
  if (!props.agencyId || !event?.id) return;
  if (!window.confirm(`Delete "${event.title}"?`)) return;
  saving.value = true;
  error.value = '';
  try {
    await api.delete(`/agencies/${props.agencyId}/company-events/${event.id}`);
    await loadEvents();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to delete event';
  } finally {
    saving.value = false;
  }
};

const openEventTab=(event,step)=>{editEvent(event);activeStep.value=step;};
const toggleAgency=(id,checked)=>{const next=new Set(draft.value.invitedAgencyIds.map(Number));if(checked)next.add(Number(id));else next.delete(Number(id));draft.value.invitedAgencyIds=[...next];};
const setMandatoryUsers=ids=>{draft.value.mandatoryUserIds=ids;if(!inviteEveryone.value)draft.value.audience.userIds=[...new Set([...draft.value.audience.userIds,...ids])];};
const updateAnnouncementTime=(announcement,key,value)=>{announcement[key]=value?zonedDatetimeLocalToIso(value,draftTimezone()):null;};
const addAnnouncement=()=>draft.value.dashboardAnnouncements.push({id:crypto.randomUUID(),scheduledAt:null,endsAt:null,content:draft.value.splashContent||draft.value.description||''});
const sendInvitations=async()=>{if(!draft.value.id||sendingInvites.value)return;sendingInvites.value=true;error.value='';invitationNotice.value='';try{const {data}=await api.post(`/agencies/${props.agencyId}/company-events/${draft.value.id}/send-invitations`,{channels:inviteChannels.value});const issues=Object.values(data.channelSummary||{}).reduce((sum,item)=>sum+(item.held||0)+(item.approval||0)+(item.review||0),0);invitationNotice.value=`Invitations processed for ${data.recipients || 0} invited people. Emails sent: ${data.emailSentCount || 0}; in-app: ${data.inAppSentCount || 0}; texts: ${data.smsSentCount || 0}.${issues ? ` ${issues} deliveries need review or approval.` : ''} Review delivery history for skipped or failed recipients.`;inviteRefresh.value++;}catch(e){error.value=e.response?.data?.error?.message||'Could not send invitations.';}finally{sendingInvites.value=false;}};
const messageInvitees=async event=>{if(!event?.id||openingConversation.value)return;openingConversation.value=true;error.value='';try{const {data}=await api.post(`/agencies/${props.agencyId}/company-events/${event.id}/conversation`,{});await router.push(data.url||`/messages?threadId=${data.threadId}`);}catch(e){error.value=e.response?.data?.error?.message||'Could not open the event conversation.';}finally{openingConversation.value=false;}};
const setEventActive=async(event,isActive)=>{if(saving.value)return;saving.value=true;error.value='';try{await api.put(`/agencies/${props.agencyId}/company-events/${event.id}`,{...event,isActive});await loadEvents();success.value={title:isActive?'Event is active.':'Event is inactive.',message:isActive?'The event is available in the Upcoming & planning view when scheduled in the future.':'You can find it in the Inactive view and reactivate it later.'};}catch(e){error.value=e.response?.data?.error?.message||'Could not update event status.';}finally{saving.value=false;}};

const sendDirectMessage = async (event) => {
  if (!props.agencyId || !event?.id) return;
  const defaultMessage = String(event.splashContent || event.description || '').trim();
  const customMessage = window.prompt('Message to send (in-app + SMS):', defaultMessage);
  if (customMessage === null) return;
  const message = String(customMessage || '').trim();
  if (!message) {
    error.value = 'Message is required to send.';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const sendSms = window.confirm('Also send as SMS? Select Cancel for in-app only.');
    await api.post(`/agencies/${props.agencyId}/company-events/${event.id}/send-direct-message`, {
      title: event.title,
      message,
      templateId: selectedTemplateId.value ? Number(selectedTemplateId.value) : undefined,
      sendInApp: true,
      sendSms
    });
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to send direct message';
  } finally {
    saving.value = false;
  }
};

const sendSmsVote = async (event) => {
  if (!props.agencyId || !event?.id) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/agencies/${props.agencyId}/company-events/${event.id}/send-sms-vote`);
    await loadEvents();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to send SMS voting message';
  } finally {
    saving.value = false;
  }
};

const viewDeliveryLogs = async (event) => {
  if (!props.agencyId || !event?.id) return;
  saving.value = true;
  error.value = '';
  try {
    const resp = await api.get(`/agencies/${props.agencyId}/company-events/${event.id}/delivery-logs`);
    const summary = resp.data?.summary || {};
    window.alert(`Delivery summary\nIn-app sent: ${summary.inAppSent || 0}\nIn-app failed: ${summary.inAppFailed || 0}\nSMS sent: ${summary.smsSent || 0}\nSMS failed: ${summary.smsFailed || 0}\nSMS skipped: ${summary.smsSkipped || 0}`);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load delivery logs';
  } finally {
    saving.value = false;
  }
};

const downloadResponsesCsv = (event) => {
  if (!props.agencyId || !event?.id) return;
  window.open(`/api/agencies/${props.agencyId}/company-events/${event.id}/responses.csv`, '_blank', 'noopener');
};

const closeVoting = async (event) => {
  if (!props.agencyId || !event?.id) return;
  if (!window.confirm(`Close voting for "${event.title}", apply its result-sharing setting, and send eligible requested results texts?`)) return;
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.post(`/agencies/${props.agencyId}/company-events/${event.id}/close-voting`);
    await loadEvents();
    const results = data.resultTexts || {};
    if (results.reason || results.failed) {
      error.value = "Voting is closed and final totals are available. Some requested results texts could not be sent. Check Delivery logs and the configured staff sender.";
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to close voting';
  } finally {
    saving.value = false;
  }
};

const loadEvents = async () => {
  if (!props.agencyId) {
    events.value = [];
    return;
  }
  const resp = await api.get(`/agencies/${props.agencyId}/company-events`, { params: outstandingOnly.value ? { paymentStatus: 'outstanding' } : {} });
  events.value = Array.isArray(resp.data) ? resp.data : [];
};

const loadAudienceOptions = async (eventId = null) => {
  if (!props.agencyId) {
    audienceUsers.value = [];
    audienceGroups.value = [];
    audienceRoles.value = [];
    return;
  }
  const params=eventId?{eventId}:{};
  if(canManageAll.value&&draft.value.invitedAgencyIds.length)params.agencyIds=draft.value.invitedAgencyIds.join(',');
  const resp = await api.get(`/agencies/${props.agencyId}/company-events/audience-options`, { params });
  audienceUsers.value = Array.isArray(resp.data?.users) ? resp.data.users : [];
  coordinatorUsers.value = Array.isArray(resp.data?.coordinatorUsers) ? resp.data.coordinatorUsers : audienceUsers.value;
  audienceGroups.value = Array.isArray(resp.data?.groups) ? resp.data.groups : [];
  audienceRoles.value = Array.isArray(resp.data?.roles) ? resp.data.roles : [];
  agencyOptions.value=Array.isArray(resp.data?.agencies)?resp.data.agencies:[];
  smsReadiness.value=resp.data?.smsReadiness || {ready:false,message:'Readiness is checked in the text preview'};
};

const loadTemplates = async () => {
  if (!props.agencyId || !canManageTeam.value) return;
  const resp = await api.get(`/agencies/${props.agencyId}/company-events/templates`);
  const templates = Array.isArray(resp.data) ? resp.data : [];
  if (templates.length) directMessageTemplates.value = templates;
};

const loadAll = async () => {
  if (!props.agencyId) {
    events.value = [];
    audienceUsers.value = [];
    audienceGroups.value = [];
    audienceRoles.value = [];
    smsReadiness.value = { ready: false, message: 'Select an agency' };
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await loadEvents();
    const linkedEvent = events.value.find(event => Number(event.id) === Number(route.query?.eventId));
    if (linkedEvent) editEvent(linkedEvent);
    if (canManageAll.value) {
      await Promise.all([loadAudienceOptions(), loadTemplates(), loadAffiliateProgramOrgs()]);
    } else {
      smsReadiness.value = { ready: false, message: 'Readiness is checked when you preview a text.' };
      if (events.value.length && !draft.value.id) editEvent(events.value[0]);
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load company events';
  } finally {
    loading.value = false;
  }
};

watch(()=>draft.value.invitedAgencyIds.join(','),()=>{if(canManageAll.value&&props.agencyId)void loadAudienceOptions(draft.value.id).catch(()=>{error.value='Could not load people for the selected agencies.';});});

watch(outstandingOnly, () => { void loadEvents().catch(() => { error.value = 'Could not load event payments.'; }); });

watch(() => props.agencyId, async () => {
  resetDraft();
  await loadAll();
}, { immediate: true });
</script>

<style scoped>
.company-events-manager{--event-ink:#24463c;--event-muted:#6c7e74;--event-green:#285f49;--event-line:#dce5dd;--event-paper:#fff;--event-tint:#f5f8f3;display:grid;gap:28px;color:var(--event-ink);font-family:inherit;line-height:1.5;max-width:1560px;margin:0 auto;padding:8px 0 28px}.company-events-manager *{box-sizing:border-box}.header-row{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:12px 0 24px;border-bottom:1px solid var(--event-line)}.eyebrow{display:block;font-size:12px;letter-spacing:.15em;font-weight:750;color:#5f7366}.header-row h4{font-size:32px;font-weight:650;letter-spacing:-.035em;line-height:1.15;margin:9px 0 11px;color:#234638}.header-description{font-size:13px;color:var(--event-muted);max-width:650px;margin:0}.header-status{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:13px;color:#766e5a;margin-top:15px}.header-status a{color:#426c59;margin-left:12px;text-decoration:none}.status-dot{width:6px;height:6px;background:#ba9d6b;border-radius:100%;flex:none}.status-dot.ready{background:#709d7a}.actions{display:flex;gap:8px;flex-wrap:wrap}.company-events-manager .btn{font:inherit;line-height:1.3;font-size:14px;font-weight:650;border-radius:8px;padding:11px 15px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s;box-shadow:none}.company-events-manager .btn-primary{background:var(--event-green);color:white;border:1px solid var(--event-green)}.company-events-manager .btn-primary:hover:not(:disabled){background:#1d503c}.company-events-manager .btn-secondary{background:#fff;color:#42614e;border:1px solid #ccdad0}.company-events-manager .btn-secondary:hover:not(:disabled){background:#f3f7f0;border-color:#95b19f}.company-events-manager .btn-sm{padding:8px 12px;font-size:13px}.company-events-manager button:disabled{opacity:.5;cursor:default}.error-modal{border:1px solid #e5c0b5;background:#fff5f0;padding:15px 18px;border-radius:10px;color:#94432c;font-size:13px}.success-message{display:flex;gap:13px;align-items:flex-start;border:1px solid #b8d0bc;background:#f0f8ef;border-radius:14px;padding:19px 22px;color:#305b3d}.success-message strong{font-size:15px}.success-message p{font-size:14px;line-height:1.6;margin:6px 0 0;color:#5f7560}.success-icon{flex:none;background:#d8ebd4;color:#397145;border-radius:50%;width:29px;height:29px;display:grid;place-items:center}.success-message>button{margin-left:auto;border:0;background:none;font:inherit;color:#5e7562;font-size:20px;cursor:pointer}.editor-shell{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:22px;align-items:start}.editor-card{border:1px solid var(--event-line);border-radius:16px;min-width:0;background:var(--event-paper);overflow:hidden;box-shadow:0 9px 28px #294c3710}.editor-heading{display:flex;align-items:center;justify-content:space-between;padding:24px 28px 20px}.editor-heading h5{margin:7px 0 0;font-size:22px;font-weight:650;letter-spacing:-.02em;color:#294a3b}.icon-button{border:1px solid #e0e7de;border-radius:50%;width:29px;height:29px;background:white;color:#627267;font-size:19px;cursor:pointer}.editor-steps{display:flex;padding:0 24px;background:#fafbf8;border-top:1px solid #e7ece5;border-bottom:1px solid #e1e7df;gap:3px;overflow-x:auto}.editor-steps button{display:flex;align-items:center;justify-content:center;gap:7px;flex:1;border:0;border-bottom:2px solid transparent;background:none;color:#657268;font-size:13px;white-space:nowrap;font-weight:600;cursor:pointer;padding:16px 7px}.editor-steps button span{display:grid;place-items:center;width:19px;height:19px;border-radius:50%;font-size:12px;background:#e8ede5;color:#647367}.editor-steps button.active{border-color:#466f51;color:#315c3f}.editor-steps button.active span{color:#fff;background:#547d5a}.editor-section{padding:27px 28px 30px}.section-heading{margin-bottom:22px}.section-heading h3{font-size:20px;letter-spacing:-.02em;font-weight:600;line-height:1.3;color:#2b4b3b;margin:8px 0}.section-heading p{font-size:14px;color:var(--event-muted);line-height:1.7;margin:8px 0 0;max-width:590px}.form-group{margin-bottom:18px;min-width:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}.lbl{display:block;color:#45604e;font-size:14px;font-weight:650;margin-bottom:7px}.company-events-manager .input{display:block;width:100%;box-sizing:border-box;border:1px solid #d5dfd4;border-radius:9px;padding:11px 12px;background:#fff;color:#344f3d;font:inherit;font-size:14px;line-height:1.5;min-height:42px;box-shadow:inset 0 1px 2px #304a3404}.company-events-manager .input:focus{outline:2px solid #d2e4cf;outline-offset:1px;border-color:#7ea17c}.company-events-manager .input::placeholder{color:#697068}.company-events-manager .title-input{font-size:17px;padding:12px 14px}.company-events-manager textarea.input{resize:vertical;min-height:80px}.hint{font-size:13px!important;color:var(--event-muted)!important;line-height:1.65}.feature-toggle{display:flex;gap:12px;align-items:center;border:1px solid #dce6d8;background:#f7faf3;padding:16px;border-radius:11px;margin-bottom:20px;cursor:pointer}.feature-toggle>input,.check-label>input,.chip-toggle>input,.agency-chip input,.payment-filter input{accent-color:#4c7851;width:15px;height:15px;flex:none}.feature-toggle>span:not(.toggle-badge){display:grid;gap:5px}.feature-toggle strong{font-size:14px;color:#395c3d;font-weight:650}.feature-toggle small{font-size:13px;color:#657263}.toggle-badge{margin-left:auto;border:1px solid #cddbc2;border-radius:20px;padding:3px 8px;color:#657456;font-size:12px;background:#eef4e7}.info-note{background:#f0f5ee;color:#61745c;border:1px solid #dfe8d7;border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.65;margin:0 0 20px}.advanced-section{margin-top:24px;padding-top:18px;border-top:1px solid #e2e8dd}.advanced-section summary{font-size:14px;color:#53704d;font-weight:650;cursor:pointer;padding:0 0 8px}.advanced-section[open] summary{margin-bottom:10px}.chips{display:flex;gap:8px;flex-wrap:wrap}.chip-toggle,.agency-chip{display:flex;align-items:center;gap:7px;cursor:pointer;padding:8px 11px;border:1px solid #dbe4d5;border-radius:8px;color:#607459;font-size:13px;background:#fff}.agency-chip.selected{background:#edf4e7;color:#406538;border-color:#b9cfad}.scope-card{border:1px solid #dfe7da;border-radius:12px;padding:17px 18px;margin-bottom:20px;background:#fcfdfb}.scope-card .hint{margin:0 0 13px}.audience-mode{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}.audience-mode button{display:grid;gap:5px;text-align:left;border:1px solid #dbe4d7;border-radius:10px;background:#fff;padding:15px;cursor:pointer}.audience-mode button.selected{border-color:#9fba95;background:#f2f7ec;box-shadow:0 0 0 1px #bbd0b2}.audience-mode strong{font-size:13px;color:#45603e}.audience-mode small{font-size:12px;color:#697161}.audience-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.choice-card{border:1px solid #dfe7db;border-radius:11px;padding:16px;max-height:280px;overflow:auto}.choice-card h4{font-size:14px;color:#4b6544;margin:0 0 12px;display:flex;justify-content:space-between;gap:8px}.choice-card h4 span{font-size:12px;font-weight:400;color:#677261}.choice-card .input{margin-bottom:12px}.check-label{display:flex;gap:8px;align-items:center;font-size:14px;color:#607457;line-height:1.5;margin:10px 0;cursor:pointer}.inline-count{border-radius:20px;padding:2px 7px;font-size:12px;background:#eaf1e3;margin-left:7px}.section-divider{height:1px;background:#e2e8dd;margin:27px 0}.schedule-card{border:1px solid #dce6d6;border-radius:12px;margin-bottom:18px;overflow:hidden}.schedule-card .feature-toggle{border:0;border-radius:0;margin:0}.schedule-options{border-top:1px solid #e4eadd;padding:18px 20px}.schedule-options>.lbl{max-width:300px}.schedule-options>.lbl .input{margin-top:8px}.channel-options{display:flex;gap:16px;flex-wrap:wrap}.announcement-card{padding:18px;border:1px solid #dee6d7;border-radius:11px;margin-bottom:14px;background:#fafbf7}.announcement-heading{display:flex;justify-content:space-between;gap:10px;margin-bottom:16px;font-size:14px}.announcement-card .lbl .input{margin-top:7px}.text-button{border:0;background:none;color:#5e7651;font:inherit;font-size:13px;cursor:pointer}.review-facts{display:grid;grid-template-columns:1fr 1fr;border:1px solid #dfe7d8;border-radius:12px;margin:0 0 22px;overflow:hidden}.review-facts>div{padding:17px;border-bottom:1px solid #e8ede3}.review-facts dt{color:#67725f;font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}.review-facts dd{margin:0;font-size:14px;color:#48613e;line-height:1.7}.send-card{padding:20px;border-radius:12px;border:1px solid #d6e1cd;background:#f5f8ef}.send-card h4{font-size:15px;margin:0 0 10px;color:#3f5a35}.send-card>.btn{margin-top:13px}.sms-preview{font-size:14px;color:#627254;line-height:1.7;margin:10px 0;background:#fff;padding:14px;border:1px solid #dfe6d5;border-radius:9px}.sms-preview small{display:block;font-size:12px;color:#68725e;margin-top:8px}.event-tools{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:20px 0}.editor-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:18px 24px;border-top:1px solid #e0e7da;background:#fafbf7}.footer-note{font-size:12px;color:#6a7260;margin-right:auto;max-width:220px}.invitation-preview{border:1px solid #e2e3d4;background:#fbfaf4;border-radius:15px;overflow:hidden;position:sticky;top:20px;box-shadow:0 8px 22px #5b5c3910}.preview-topline{display:flex;justify-content:space-between;padding:15px 18px;font-size:11px;letter-spacing:.12em;color:#6e6f60}.preview-topline span:first-child{font-weight:750}.preview-topline span:last-child{letter-spacing:0}.preview-art{height:175px;background:#e8eddf;position:relative;overflow:hidden;margin:0 12px;border-radius:8px}.preview-art-label{position:absolute;z-index:1;top:29px;left:22px;font-size:26px;line-height:1.15;color:#476345;letter-spacing:-.04em;font-weight:500}.art-circle{position:absolute;width:138px;height:138px;border-radius:50%;background:#d8dbb7;right:-30px;top:-37px}.art-stem{position:absolute;width:2px;height:180px;bottom:-34px;right:70px;transform:rotate(25deg);background:#9bac88}.art-leaf{position:absolute;width:50px;height:28px;border-radius:0 70% 0 70%;background:#8ca57c;right:47px;top:82px;transform:rotate(-25deg)}.art-leaf.two{right:69px;top:115px;transform:rotate(145deg);background:#acb993}.art-leaf.three{right:25px;top:55px;width:38px;height:23px;background:#b2bd95}.preview-body{padding:24px}.preview-body .eyebrow{color:#6e7058;font-size:11px}.preview-body h3{font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:400;letter-spacing:-.025em;line-height:1.2;color:#4b5a3f;margin:11px 0 14px;overflow-wrap:anywhere}.preview-body>p{font-size:13px;color:#6e6f5f;line-height:1.8;margin-bottom:24px;white-space:pre-line;overflow-wrap:anywhere}.preview-detail{display:flex;gap:11px;align-items:flex-start;margin-bottom:19px}.preview-detail>span{color:#69725e;font-size:23px;line-height:1}.preview-detail>div{display:grid;gap:4px}.preview-detail strong{font-size:13px;color:#667457;font-weight:650}.preview-detail small{font-size:12px;color:#6d7060;overflow-wrap:anywhere}.preview-rsvp{margin-top:25px;padding-top:18px;border-top:1px solid #e3e5d4;font-size:13px;color:#69715a}.preview-rsvp>div{display:flex;gap:6px;margin-top:12px}.preview-rsvp>div>span{flex:1;text-align:center;border:1px solid #c6cfb8;border-radius:7px;padding:8px;color:#667357;font-size:12px}.preview-rsvp>div>span:first-child{background:#68815b;border-color:#68815b;color:white}.preview-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:18px}.preview-tags>span{font-size:11px;color:#6d7160;border:1px solid #e1e4d4;border-radius:4px;padding:3px 5px}.preview-caption{border-top:1px solid #e9e9dc;font-size:12px;color:#6e6f61;line-height:1.6;text-align:center;padding:14px 23px;margin:0}.event-directory{background:#fff;border:1px solid var(--event-line);border-radius:15px;box-shadow:0 6px 22px #274b3210}.directory-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 25px 18px}.directory-heading h3{font-size:21px;font-weight:600;margin:8px 0 0;letter-spacing:-.02em;color:#2b4a36}.directory-heading h3>span{font-size:13px;font-weight:400;letter-spacing:0;background:#edf2e7;color:#67735d;padding:3px 8px;border-radius:20px;vertical-align:middle;margin-left:6px}.status-tabs{display:flex;gap:3px;border:1px solid #e0e7d9;padding:4px;border-radius:9px;background:#f7f9f3}.status-tabs button{border:0;border-radius:6px;padding:8px 11px;cursor:pointer;font:inherit;font-size:12px;background:transparent;color:#677360;white-space:nowrap}.status-tabs button.active{background:#fff;color:#45663a;box-shadow:0 1px 5px #3f5d3420}.directory-tools{display:grid;grid-template-columns:minmax(220px,1fr) 170px 140px auto;align-items:center;gap:10px;padding:0 25px 22px}.directory-tools .input{font-size:13px;min-height:38px;padding:9px 10px}.payment-filter{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px;color:#65725c;padding-left:3px}.table{border-collapse:collapse;width:100%;border-radius:0 0 15px 15px}.table th{text-align:left;font-size:11px;font-weight:650;letter-spacing:.1em;text-transform:uppercase;color:#697262;background:#f8faf5;padding:12px 25px;border-top:1px solid #e7ecdf;border-bottom:1px solid #e1e8d9}.table td{padding:21px 25px;border-bottom:1px solid #e8ede2;vertical-align:middle}.table tr:last-child td{border-bottom:0}.table td:first-child{width:32%}.event-name{font-size:13px;font-weight:650;color:#3e5c32;line-height:1.45;overflow-wrap:anywhere}.event-badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.event-badges>span{font-size:11px;padding:3px 6px;background:#f4f6ef;color:#69715f;border:1px solid #e8ecdf;border-radius:5px}.event-badges>span.planning-badge{color:#7c6d4a;background:#faf6e9;border-color:#eee4c9}.event-date{font-size:13px;color:#637455;font-weight:500}.table td .hint{font-size:11px!important;margin-top:4px}.audience-cell{font-size:12px;color:#647355}.directory-actions{white-space:nowrap;text-align:right!important}.directory-actions>.btn{margin-left:12px}.open-link{font-size:12px;color:#577842;text-decoration:none;white-space:nowrap}.more-actions{display:inline-block;position:relative;margin-left:8px;text-align:left}.more-actions>summary{list-style:none;font-size:13px;color:#647356;cursor:pointer;padding:7px 4px;white-space:nowrap}.more-actions>summary::-webkit-details-marker{display:none}.more-actions>summary span{margin-left:5px}.action-menu{position:absolute;z-index:30;right:0;top:100%;min-width:220px;padding:7px;border:1px solid #d6e1cb;border-radius:11px;background:#fff;box-shadow:0 14px 30px #2c4b3225;display:grid;gap:2px}.action-menu button,.action-menu a{display:block;text-align:left;width:100%;background:none;border:0;font:inherit;color:#60764c;padding:9px 11px;font-size:13px;cursor:pointer;border-radius:6px;text-decoration:none;white-space:nowrap}.action-menu button:hover,.action-menu a:hover{background:#f0f6e9}.action-menu button.danger-action{color:#926451;border-top:1px solid #eef0e8;border-radius:0;padding-top:12px;margin-top:3px}.empty-directory{text-align:center!important;padding:48px 24px!important;max-width:none!important}.empty-directory>span{display:block;font-size:36px;color:#697160;margin-bottom:10px}.empty-directory>strong{display:block;font-size:15px;font-weight:550;color:#637454}.empty-directory>p{font-size:13px;color:#697060;max-width:440px;margin:9px auto 20px;line-height:1.8}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:1200px){.editor-shell{grid-template-columns:minmax(0,1fr) 270px}.editor-section{padding:24px}.editor-heading{padding:23px}.editor-steps{padding:0 14px}.preview-body{padding:20px}.directory-tools{grid-template-columns:minmax(180px,1fr) 150px 130px auto}.table td,.table th{padding-left:19px;padding-right:19px}.directory-actions>.open-link{display:none}}@media(max-width:1000px){.editor-shell{grid-template-columns:1fr}.invitation-preview{display:none}.header-row{align-items:flex-start}.directory-heading{align-items:flex-start;flex-wrap:wrap}.directory-tools{grid-template-columns:minmax(160px,1fr) 140px 130px}.payment-filter{grid-column:1/-1}.table td,.table th{padding-left:16px;padding-right:16px}.table td:first-child{width:30%}.directory-actions>.btn{margin-left:0}}@media(max-width:650px){.company-events-manager{gap:18px}.header-row{flex-direction:column;padding:8px 0 20px;gap:17px}.header-row h4{font-size:28px}.header-description{font-size:14px}.header-status{font-size:12px}.header-status a{margin-left:0}.editor-steps{padding:0 8px}.editor-steps button{font-size:11px;padding:13px 4px;gap:4px}.editor-steps button span{width:16px;height:16px;font-size:11px}.editor-heading{padding:20px}.editor-section{padding:22px 18px}.section-heading h3{font-size:19px}.grid,.audience-grid,.review-facts,.audience-mode{grid-template-columns:1fr}.feature-toggle{padding:14px}.toggle-badge{display:none}.editor-footer{padding:16px;flex-wrap:wrap}.footer-note{display:none}.editor-footer>.btn:first-child{margin-right:auto}.directory-heading{padding:20px 18px 14px}.directory-tools{padding:0 18px 18px;grid-template-columns:1fr 1fr}.directory-tools>input{grid-column:1/-1}.status-tabs{width:100%;justify-content:space-between}.status-tabs button{padding:8px;font-size:11px}.table,.table tbody,.table tr,.table td{display:block}.table thead{display:none}.table tr{border-top:1px solid #e1e8d9;padding:16px 18px;display:grid;grid-template-columns:1fr 1fr;gap:12px}.table td{border:0;padding:0!important;width:auto!important;min-width:0}.table td:first-child{grid-column:1/-1}.table td:last-child{grid-column:1/-1;text-align:left!important;margin-top:2px;display:flex;align-items:center;justify-content:flex-end;gap:10px}.table td:nth-child(3){text-align:right}.directory-actions>.open-link{display:block;margin-right:auto}.directory-actions>.btn{margin-left:0}.event-badges{margin-top:7px}.more-actions{margin-left:0}.table tr:has(.empty-directory){display:block}.table .empty-directory{padding:25px 12px!important}.action-menu{right:0}.channel-options{gap:8px 14px}.review-facts>div{padding:14px}.schedule-options{padding:15px}.announcement-card{padding:14px}}
</style>
