# Interview calendar invitations and tenant identities

The September 22 interview had no Google event: its PO email sender was being used as the Calendar impersonation subject, but that sender alias is not a calendar-owning Workspace account. In addition, the shared calendar helper suppressed Google attendees for TEAM_MEETING, including interviews. Sending the branded email alone did not create a guest calendar invitation.

Interviews now use the verified host Workspace account for Calendar, explicitly include named Google guests, and retain the tenant PO identity for the candidate email. Staff invitation, reminder, change-notice and Reply-To addresses prefer existing Workspace aliases for the meeting's tenant. Candidate addresses remain unchanged; the resolver does not invent tenant addresses.

Resending reconciles the calendar invitation as well as sending the candidate email. Missing events use a deterministic event ID and a database lock so a retry after a lost database write reuses the event. Existing RSVP values survive updates. Email and calendar failures are reported separately. Other team meetings retain their existing calendar notification policy.

Live correction: created the missing interview event, sent Google invitations to its four participants, and verified the event on Michael's, Haley's and Rachel's primary Google calendars at 12:30–1:30 PM Mountain. Sent the explicitly requested copy to michael@plottwistco.com and verified its sent receipt. The applicant remains an external guest.

Google canonicalizes the organizer and a viewer's own attendee entry to that person's primary Workspace account, even when a tenant alias was submitted. The invitation description and app email include the participant names and tenant addresses; Google may still show the primary address in its organizer/self fields. No Workspace primary addresses were changed.

Validation: 80 focused backend tests passed, including calendar repair/retry, named guests, tenant identity resolution, interview scheduling/rescheduling, invitation delivery, reminders, and access controls. Changed backend syntax checks and the production frontend build passed. Calendar and email delivery were also verified against the live records.
