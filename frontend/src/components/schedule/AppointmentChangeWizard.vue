<template>
  <Teleport to="body">
    <div v-if="change.open.value" class="acw-overlay" role="dialog" aria-modal="true" aria-labelledby="acw-title">
      <div class="acw">
        <header class="acw-header">
          <div>
            <h2 id="acw-title" class="acw-title">Appointment Change Workflow</h2>
            <p class="acw-sub">Manage cancellations, no-shows, reschedules, and other appointment changes.</p>
          </div>
          <button type="button" class="acw-link" @click="onClose">Back to Appointment</button>
        </header>

        <div class="acw-context" aria-label="Appointment context">
          <div class="acw-ctx-item">
            <span class="acw-avatar">{{ initials }}</span>
            <div>
              <div class="acw-ctx-label">Client</div>
              <div class="acw-ctx-val">
                {{ change.context.clientName || 'Client' }}
                <span v-if="change.context.clientCode" class="muted"> (#{{ change.context.clientCode }})</span>
              </div>
            </div>
          </div>
          <div class="acw-ctx-item">
            <div class="acw-ctx-label">Service</div>
            <div class="acw-ctx-val">{{ change.context.serviceLabel || '—' }}</div>
          </div>
          <div class="acw-ctx-item">
            <div class="acw-ctx-label">Schedule</div>
            <div class="acw-ctx-val">{{ change.context.whenLabel || change.preview.value?.appointment?.displayWhen || '—' }}</div>
          </div>
          <div class="acw-ctx-item">
            <div class="acw-ctx-label">Provider</div>
            <div class="acw-ctx-val">{{ change.context.providerName || '—' }}</div>
          </div>
          <div class="acw-ctx-item">
            <div class="acw-ctx-label">Payer / Plan</div>
            <div class="acw-ctx-val">{{ change.context.payerLabel || change.preview.value?.payer?.insuranceType || '—' }}</div>
          </div>
        </div>

        <nav class="acw-steps" aria-label="Workflow steps">
          <div
            v-for="s in steps"
            :key="s.n"
            class="acw-step"
            :class="{ on: change.step.value === s.n, done: change.step.value > s.n }"
          >
            <span class="acw-step-num">{{ change.step.value > s.n ? '✓' : s.n }}</span>
            <span>{{ s.label }}</span>
          </div>
        </nav>

        <div class="acw-body">
          <!-- Step 1 -->
          <section v-if="change.step.value === 1" class="acw-panel">
            <h3 class="acw-h">What happened to this appointment?</h3>
            <div class="acw-event-grid">
              <button
                v-for="ev in events"
                :key="ev.id"
                type="button"
                class="acw-event-card"
                :class="{ on: change.facts.eventType === ev.id, [`tone-${ev.tone}`]: true }"
                @click="change.facts.eventType = ev.id"
              >
                <span class="acw-event-ico" aria-hidden="true">{{ ev.icon }}</span>
                <strong>{{ ev.label }}</strong>
                <span class="muted">{{ ev.hint }}</span>
              </button>
            </div>
            <div class="acw-info">
              We handle the details for you. The system automatically determines late vs. advance status,
              missed-session classification, financial consequence, and note generation based on the appointment,
              timing, payer, plan/package, and your user role.
            </div>
          </section>

          <!-- Step 2 -->
          <section v-else-if="change.step.value === 2" class="acw-panel acw-panel--split">
            <div>
              <h3 class="acw-h">Step 2 of 4: Appointment details</h3>

              <template v-if="change.facts.eventType === 'void'">
                <p class="muted">Document why this appointment is being voided (required).</p>
                <textarea v-model="change.facts.reasonOther" class="acw-textarea" rows="3" placeholder="Completed in error, duplicate…" />
              </template>

              <template v-else-if="change.facts.eventType === 'no_show'">
                <h4 class="acw-h4">Outreach</h4>
                <div class="acw-chips">
                  <button
                    v-for="o in OUTREACH_OPTIONS"
                    :key="o.id"
                    type="button"
                    class="acw-chip"
                    :class="{ on: change.facts.outreach.includes(o.id) }"
                    @click="change.toggleOutreach(o.id)"
                  >{{ o.label }}</button>
                </div>
                <h4 class="acw-h4">Reason known?</h4>
                <div class="acw-chips">
                  <button type="button" class="acw-chip" :class="{ on: change.facts.reasonKnown === false }" @click="change.facts.reasonKnown = false; change.facts.reasons = []">No</button>
                  <button type="button" class="acw-chip" :class="{ on: change.facts.reasonKnown === true }" @click="change.facts.reasonKnown = true">Yes</button>
                </div>
                <template v-if="change.facts.reasonKnown">
                  <h4 class="acw-h4">Why?</h4>
                  <div class="acw-chips">
                    <button
                      v-for="r in CANCEL_REASONS"
                      :key="r.id"
                      type="button"
                      class="acw-chip"
                      :class="{ on: change.facts.reasons.includes(r.id) }"
                      @click="change.toggleReason(r.id)"
                    >{{ r.label }}</button>
                  </div>
                </template>
              </template>

              <template v-else>
                <h4 class="acw-h4">{{ change.facts.eventType === 'rescheduled' ? 'Who requested the change?' : 'Who initiated the cancellation?' }}</h4>
                <div class="acw-chips">
                  <button
                    v-for="i in CANCEL_INITIATORS"
                    :key="i.id"
                    type="button"
                    class="acw-chip"
                    :class="{ on: change.facts.initiator === i.id }"
                    @click="change.facts.initiator = i.id"
                  >{{ i.label }}</button>
                </div>
                <h4 class="acw-h4">Why?</h4>
                <div class="acw-chips">
                  <button
                    v-for="r in CANCEL_REASONS"
                    :key="r.id"
                    type="button"
                    class="acw-chip"
                    :class="{ on: change.facts.reasons.includes(r.id) }"
                    @click="change.toggleReason(r.id)"
                  >{{ r.label }}</button>
                </div>
              </template>

              <label v-if="['canceled', 'rescheduled'].includes(change.facts.eventType)" class="acw-field">
                <span>Replacement appointment {{ change.facts.eventType === 'rescheduled' ? '(required)' : '(optional)' }}</span>
                <select v-model="change.facts.replacementAppointmentId" class="acw-input">
                  <option :value="null">Select a booked appointment</option>
                  <option v-for="appointment in change.replacements.value" :key="appointment.id" :value="appointment.id">{{ appointment.label }}</option>
                </select>
                <span class="muted">Choose the replacement session for this client. If it is not booked yet, save this draft and book it in the schedule.</span>
              </label>
              <label v-if="change.facts.reasons.includes('other')" class="acw-field">
                <span>Please specify (required)</span>
                <input v-model="change.facts.reasonOther" type="text" class="acw-input" />
              </label>
              <p v-if="change.retrospective?.value" class="acw-info">This appointment has already started. This change updates its record only; no cancellation notices, rescheduling invitations, or replacement offers will be sent.</p>
              <fieldset v-if="!change.retrospective?.value && ['canceled', 'rescheduled'].includes(change.facts.eventType)" class="acw-client-notice">
                <legend>Client notification</legend>
                <label class="acw-field"><span>Send a cancellation notification?</span>
                  <select v-model="change.facts.notificationMode" class="acw-input" @change="onNotificationModeChange">
                    <option value="send">Send email and any permitted text notification</option>
                    <option value="none">Do not send email or text</option>
                  </select>
                </label>
                <label v-if="change.facts.notificationMode === 'none'" class="acw-field"><span>Why no notification? (internal record)</span>
                  <textarea v-model="change.facts.suppressionReason" class="acw-textarea" rows="2" maxlength="500" placeholder="For example: I already spoke with the client." />
                  <span class="muted">The cancellation still appears in the client portal and session history. No cancellation email or text will be sent.</span>
                </label>
                <p class="muted">Keep personal or clinical details in the internal note. The reason below is saved with the cancellation and can be seen by the client.</p>
                <label class="acw-field">
                  <span>Reason to share with the client (required)</span>
                  <textarea v-model="change.facts.clientFacingReason" class="acw-textarea" rows="3" maxlength="500" placeholder="Your provider is unavailable due to illness." />
                </label>
                <label class="acw-field">
                  <span>Next step</span>
                  <select v-model="change.facts.followUpAction" class="acw-input">
                    <option value="keep_next_or_support">Keep the next appointment; contact support only if none is scheduled</option>
                    <option value="keep_next" :disabled="!change.replacementOptions?.value?.nextAppointment">Keep the next scheduled appointment — no reschedule requested</option>
                    <option value="client_contact_support">Ask the client to contact support to reschedule</option>
                    <option value="replacement_booked" :disabled="!change.facts.replacementAppointmentId">A replacement appointment is already booked</option>
                    <option value="none">No action needed; other appointments stay scheduled</option>
                    <option value="private_slots" :disabled="change.facts.eventType !== 'canceled' || change.facts.notificationMode === 'none' || !change.replacementOptions?.value?.singleClient">Offer specific private replacement times</option>
                    <option value="portal_booking" :disabled="change.facts.eventType !== 'canceled' || change.facts.notificationMode === 'none' || !change.replacementOptions?.value?.portalBookingEnabled">Let this client choose a published current-client opening</option>
                  </select>
                </label>
                <p v-if="change.replacementOptions?.value?.nextAppointment" class="muted">Next {{ change.replacementOptions.value.nextAppointment.recurring ? 'recurring ' : '' }}appointment: {{ change.replacementOptions.value.nextAppointment.displayWhen }} ({{ change.replacementOptions.value.nextAppointment.timeZone }}).</p>
                <p v-if="change.replacementOptions?.value && !change.replacementOptions.value.portalBookingEnabled" class="muted">General online booking is off for this practice or provider. A private offer authorizes only this client to choose from your selected times.</p>
                <div v-if="['private_slots', 'portal_booking'].includes(change.facts.followUpAction)" class="acw-offers">
                  <p>You can offer the same times to several clients. The first completed selection reserves a time; offers stay off the public page until released or expired. One replacement occurrence only. The client may decline and keep their next appointment. A selected time is reserved for care-team confirmation; other recurring sessions remain unchanged.</p>
                  <label class="acw-field">Offer expires after <select v-model.number="change.facts.offerDays" class="acw-input"><option :value="1">1 day</option><option :value="2">48 hours (recommended)</option><option :value="3">3 days</option><option :value="7">7 days</option><option :value="14">14 days</option></select></label>
                  <template v-if="change.facts.followUpAction === 'private_slots'">
                    <h4>Add a free time</h4><p>No published opening is needed. Uses this appointment’s length and format. Times are in {{ change.replacementOptions?.value?.timeZone || 'the provider’s timezone' }}. If you do not have a room for an in-person visit, choose an available room and request it for this date only. It can be offered once the request is approved.</p>
                    <label class="acw-field">Date and start time <input v-model="change.customOffer.localStart" type="datetime-local" class="acw-input" @change="change.customOffer.roomId=null;change.customOffer.rooms=[];change.customOffer.requiresOfficeRequest=false"></label>
                    <label v-if="change.customOffer.rooms.length" class="acw-field">Room <select v-model="change.customOffer.roomId" @change="change.customOffer.requiresOfficeRequest=false" class="acw-input"><option :value="null">Choose a room</option><option v-for="room in change.customOffer.rooms" :key="room.id" :value="room.id">{{ room.label }} — {{ room.needsRequest ? 'One-time request needed' : 'Already reserved for you' }}</option></select></label>
                    <button type="button" class="acw-btn" :disabled="change.customOffer.busy || !change.customOffer.localStart || change.facts.offeredSlots.length>=6" @click="change.addCustomOffer">{{ change.customOffer.busy ? 'Checking…' : 'Check and add time' }}</button>
                    <div v-if="change.customOffer.requiresOfficeRequest"><p>This room is available to request. This is a one-time replacement; your recurring room schedule will stay unchanged.</p><p>{{ change.customOffer.rooms.find(r=>r.id===Number(change.customOffer.roomId))?.windowLabel }}</p><button type="button" class="acw-btn" :disabled="change.customOffer.busy" @click="change.requestOfferOffice">Confirm and request this room once</button></div>
                    <div v-for="request in change.facts.pendingOfficeRequests || []" :key="request.requestId" class="acw-info"><strong>Office request #{{ request.requestId }} submitted</strong><p>{{ request.label }} · {{ request.windowLabel }}</p><p>This time is not offered to the client yet. Your draft is saved. After room approval, check this date/time again to add it. You can continue with other secured times or keep the next appointment.</p><button type="button" class="acw-btn" @click="change.customOffer.localStart=request.localStart;change.customOffer.roomId=request.roomId;change.addCustomOffer()">Recheck room and add time</button></div>
                    <p v-if="change.customOffer.error" role="alert">{{ change.customOffer.error }}</p>
                    <h4>Already offered</h4><p>Reuse a time below for this client. These offers are shared; the first completed selection reserves the time.</p>
                    <label v-for="slot in change.replacementOptions?.value?.alreadyOffered || []" :key="slot.key" class="acw-field"><span><input type="checkbox" :checked="change.facts.offeredSlots.some(s=>s.key===slot.key)" :disabled="slot.requested || (change.facts.offeredSlots.length>=6 && !change.facts.offeredSlots.some(s=>s.key===slot.key))" @change="change.toggleOfferSlot(slot)"> {{ slot.label }} · {{ slot.requested ? 'Selected — unavailable' : `Offered to ${slot.invitedCount} client(s)` }}</span></label>
                    <p v-if="!change.replacementOptions?.value?.alreadyOffered?.length" class="muted">No active offered times.</p>
                    <h4>Selected for this client ({{ change.facts.offeredSlots.length }}/6)</h4>
                    <p v-for="slot in change.facts.offeredSlots" :key="slot.key">{{ slot.label }} <button type="button" class="acw-btn" @click="change.toggleOfferSlot(slot)">Remove</button></p>
                  </template>
                  <h4>Published current-client openings</h4>
                  <button type="button" class="acw-btn" :disabled="change.optionsLoading?.value" @click="change.loadReplacementOptions(true)">{{ change.optionsLoading?.value ? 'Checking openings…' : 'Find current-client openings' }}</button>
                  <p class="muted">Uses the same visit length and appointment format, over the next four weeks. You can also add a free time above without publishing it. Times are checked again when selected.</p>
                  <div class="acw-offer-slots">
                    <label v-for="slot in change.replacementOptions?.value?.slots || []" :key="slot.key" class="acw-field">
                      <span v-if="change.facts.followUpAction === 'private_slots'"><input type="checkbox" :checked="change.facts.offeredSlots.some(s=>s.key===slot.key)" :disabled="change.facts.offeredSlots.length >= 6 && !change.facts.offeredSlots.some(s => s.key === slot.key)" @change="change.toggleOfferSlot(slot)"> {{ slot.label }}<template v-if="slot.alreadyOffered"> · Offered to {{ slot.invitedCount }} client(s)</template></span>
                      <span v-else>{{ slot.label }}</span>
                    </label>
                  </div>
                  <p v-if="!change.optionsLoading?.value && !change.replacementOptions?.value?.slots?.length">No openings loaded. Check for openings, or choose “Keep the next appointment” or support follow-up.</p>
                </div>
                <label class="acw-field">
                  <span>Additional client follow-up instructions (optional)</span>
                  <textarea v-model="change.facts.followUpMessage" class="acw-textarea" rows="2" maxlength="1000" />
                </label>
                <p class="muted">Related schedule edits are combined before sending. Email comes from your agency’s notifications address, with replies to support. Delivery results are saved with the client and session; unavailable contact channels need staff follow-up.</p>
              </fieldset>
            </div>

            <aside class="acw-side">
              <div class="acw-info">
                You do not decide late vs. advance status. The system determines this from the appointment time and your agency’s notice window.
              </div>
              <dl class="acw-dl">
                <div><dt>Appointment time</dt><dd>{{ change.context.whenLabel || '—' }}</dd></div>
                <div><dt>Late-cancel threshold</dt><dd>{{ noticeLabel }}</dd></div>
                <div><dt>Initiated by</dt><dd>{{ initiatorLabel || '—' }}</dd></div>
              </dl>
              <div
                v-if="change.preview.value"
                class="acw-result"
                :class="{ late: change.preview.value.isLate, ok: !change.preview.value.isLate }"
              >
                <strong>
                  System result:
                  {{
                    change.facts.eventType === 'no_show'
                      ? 'No-show'
                      : change.preview.value.isLate
                        ? 'Late Cancellation'
                        : 'Advance / within notice'
                  }}
                </strong>
                <p v-if="change.preview.value.isLate && change.facts.eventType !== 'no_show'" class="muted">
                  This cancellation was entered inside the late-cancellation window.
                </p>
              </div>
              <p v-else-if="change.loading.value" class="muted">Calculating…</p>
            </aside>
          </section>

          <!-- Step 3 -->
          <section v-else-if="change.step.value === 3" class="acw-panel acw-panel--split">
            <div>
              <h3 class="acw-h">Step 3 of 4: Calculated consequence</h3>
              <p class="muted">The system automatically determines the financial or package consequence based on your organization’s rules.</p>

              <dl class="acw-summary-grid">
                <div><dt>Selected event</dt><dd>{{ eventLabel }}</dd></div>
                <div><dt>Initiated by</dt><dd>{{ initiatorLabel || '—' }}</dd></div>
                <div><dt>Timing result</dt><dd>{{ timingLabel }}</dd></div>
                <div><dt>Payer / Plan</dt><dd>{{ change.context.payerLabel || change.preview.value?.payer?.insuranceType || '—' }}</dd></div>
                <div><dt>User role</dt><dd>{{ change.preview.value?.canWaive ? 'Administrator' : 'Provider' }}</dd></div>
              </dl>

              <div class="acw-consequence-card">
                <strong>{{ change.preview.value?.consequence?.label || 'No consequence' }}</strong>
                <p>{{ change.preview.value?.consequence?.summary || 'No financial or attendance consequence applies.' }}</p>
              </div>

              <div class="acw-info" style="margin-top:0;">
                <strong>Insurance claim:</strong>
                {{ change.preview.value?.insuranceClaim?.reason || 'Not-occurring appointments do not create insurance claims by default.' }}

              </div>

              <table
                v-if="change.preview.value?.consequence?.model === 'package' && change.preview.value.consequence.before"
                class="acw-balance"
              >
                <thead>
                  <tr><th></th><th>Before</th><th>After</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Session credits (including reserved)</td>
                    <td>{{ change.preview.value.consequence.before.sessionsRemaining }}</td>
                    <td>
                      {{ change.preview.value.consequence.after.sessionsRemaining }}
                      <span class="badge">{{ ['free_miss', 'waived'].includes(change.preview.value.consequence.packageAction) ? 'No change' : '1 used' }}</span>
                    </td>
                  </tr>
                  <tr v-if="change.preview.value.consequence.before.bonusSessionsRemaining != null">
                    <td>Bonus credits</td>
                    <td>{{ change.preview.value.consequence.before.bonusSessionsRemaining }}</td>
                    <td>{{ change.preview.value.consequence.after.bonusSessionsRemaining }}</td>
                  </tr>
                  <tr>
                    <td>Free misses available</td>
                    <td>{{ change.preview.value.consequence.before.freeMissesRemaining }}</td>
                    <td>
                      {{ change.preview.value.consequence.after.freeMissesRemaining }}
                      <span class="badge">{{ change.preview.value.consequence.packageAction === 'free_miss' ? '1 used' : 'No change' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-if="showWaiverUi" class="acw-waiver">
                <div class="muted" style="margin-bottom:6px;">
                  Logged in as {{ change.preview.value?.canWaive ? 'Administrator' : 'Provider' }}
                  — providers recommend waivers; administrators may waive directly.
                </div>
                <template v-if="change.preview.value?.waiverOptions?.canWaiveTermination || change.preview.value?.waiverOptions?.canRecommendWaiveTermination">
                  <h4 class="acw-h4">Third active strike</h4>
                  <p class="muted">
                    You decide whether to keep the third-strike termination/discharge recommendation on file.
                    Waiving keeps the client at two active strikes and notifies agency admins and your supervisor.
                    This is not automatic termination.
                  </p>
                  <div class="acw-chips">
                    <button type="button" class="acw-chip" :class="{ on: change.facts.waiver.action === 'no' }" @click="change.facts.waiver.action = 'no'">Keep third-strike recommendation</button>
                    <button type="button" class="acw-chip" :class="{ on: change.facts.waiver.action === 'waive_termination' }" @click="change.facts.waiver.action = 'waive_termination'">Waive termination recommendation (stay at 2 strikes)</button>
                  </div>
                  <div v-if="change.facts.waiver.action === 'waive_termination'" class="acw-chips" style="margin-top:8px;">
                    <button
                      v-for="r in TERMINATION_WAIVE_REASONS"
                      :key="r.id"
                      type="button"
                      class="acw-chip"
                      :class="{ on: change.facts.waiver.reason === r.id }"
                      @click="change.facts.waiver.reason = r.id"
                    >{{ r.label }}</button>
                  </div>
                </template>
                <template v-else-if="change.preview.value?.waiverOptions?.showFeeActions || change.preview.value?.waiverOptions?.showPackageActions">
                  <h4 class="acw-h4">{{ change.preview.value?.canWaive ? 'Waive consequence?' : 'Recommend waiver?' }}</h4>
                  <div class="acw-chips">
                    <button type="button" class="acw-chip" :class="{ on: change.facts.waiver.action === 'no' }" @click="change.facts.waiver.action = 'no'">No</button>
                    <button
                      type="button"
                      class="acw-chip"
                      :class="{ on: change.facts.waiver.action === (change.preview.value?.canWaive ? 'waive' : 'recommend') }"
                      @click="change.facts.waiver.action = change.preview.value?.canWaive ? 'waive' : 'recommend'"
                    >{{ change.preview.value?.canWaive ? 'Yes — waive' : 'Yes — recommend waiver' }}</button>
                  </div>
                  <div v-if="change.facts.waiver.action !== 'no'" class="acw-chips" style="margin-top:8px;">
                    <button
                      v-for="r in WAIVER_REASONS"
                      :key="r.id"
                      type="button"
                      class="acw-chip"
                      :class="{ on: change.facts.waiver.reason === r.id }"
                      @click="change.facts.waiver.reason = r.id"
                    >{{ r.label }}</button>
                  </div>
                </template>
              </div>
            </div>

            <aside class="acw-side">
              <h4 class="acw-h4">How consequences work</h4>
              <ul class="acw-bullets">
                <li><strong>Medicaid:</strong> Missed-appointment fee is not applicable. Strike policy applies when enabled.</li>
                <li><strong>Eligible non-Medicaid:</strong> Assess or waive fee per policy.</li>
                <li><strong>Plan / Package:</strong> Free miss first, then an available bonus credit, then a paid credit.</li>
              </ul>
            </aside>
          </section>

          <!-- Step 4 -->
          <section v-else class="acw-panel acw-panel--split">
            <div>
              <div class="acw-note-head">
                <h3 class="acw-h">System-generated note</h3>
                <span class="badge ok">{{ change.workflow.value?.status === 'completed' ? 'Signed · Nonbillable' : 'Ready for review' }}</span>
              </div>
              <p class="muted">This note is attached to the session and is nonbillable. Signing does not create an insurance claim.</p>
              <div class="acw-narrative">{{ change.localNarrative.value || 'Complete prior steps to generate the note.' }}</div>
              <div v-if="['canceled', 'rescheduled'].includes(change.facts.eventType) && change.facts.clientFacingReason" class="acw-client-notice">
                <h4 class="acw-h4">{{ change.facts.notificationMode === 'none' ? 'Cancellation recorded — no email or text will be sent' : 'Client message to review' }}</h4>
                <p v-if="change.facts.eventType === 'rescheduled'">Your appointment has moved. The message will include its verified new date and time.</p><p v-else>Your appointment scheduled for {{ change.context.whenLabel || change.preview.value?.appointment?.displayWhen }} has been canceled.</p>
                <p><strong>Reason:</strong> {{ change.facts.clientFacingReason }}</p>
                <p>{{ followUpLabel }}</p>
                <p v-if="change.facts.followUpMessage">{{ change.facts.followUpMessage }}</p>
                <p class="muted">Replies go to support. Internal note comments are kept in the session record.</p>
              </div>
              <div v-if="change.workflow.value?.result?.notificationDelivery" role="status" class="acw-info">
                <strong>Schedule notifications</strong>
                <p v-for="warning in change.workflow.value.result.notificationDelivery.warnings || []" :key="warning" role="alert">{{ warning }}</p>
                <p v-if="change.workflow.value.result.notificationDelivery.pending">Schedule update queued. Related edits are combined during a 15-minute quiet window; changes close to the appointment send sooner. Check Communications for the planned send time and final delivery result.</p>
                <p v-else>{{ change.workflow.value.result.notificationDelivery.sent }} sent.</p>
                <p v-if="change.workflow.value.result.notificationDelivery.suppressed">{{ change.workflow.value.result.notificationDelivery.suppressed }} deliberately not sent, as recorded in the signed cancellation.</p>
                <p v-if="deliveryNeedsAttention">Some notifications need staff follow-up. Review the session Communications tab for each recipient and delivery result.</p>
                <ul v-if="deliveryNeedsAttention">
                  <li v-for="delivery in change.workflow.value.result.notificationDelivery.deliveries" :key="delivery.id">
                    Client #{{ delivery.clientId }} · {{ delivery.channel }} · {{ delivery.status }}
                    <span v-if="delivery.reason">— {{ delivery.reason }}</span>
                    <button v-if="delivery.source !== 'schedule_notice' && ['failed', 'skipped'].includes(delivery.status)" class="acw-btn" type="button" :disabled="change.saving.value" @click="change.retryNotification(delivery.id)">Recheck and retry</button>
                  </li>
                </ul>
              </div>
              <label v-if="!change.workflow.value || change.workflow.value.status === 'draft'" class="acw-field">
                <span>Additional comments (optional)</span>
                <textarea v-model="change.facts.additionalComments" class="acw-textarea" rows="3" @change="onCommentsChange" />
              </label>
            </div>
            <aside class="acw-side">
              <div v-if="change.workflow.value?.waiver" class="acw-consequence-card">
                <h4 class="acw-h4">Waiver review</h4>
                <strong>{{ change.workflow.value.waiver.status === 'pending' ? 'Awaiting billing review' : change.workflow.value.waiver.status === 'documenting' ? 'Decision recorded — documentation pending' : change.workflow.value.waiver.status }}</strong>
                <p>{{ change.workflow.value.waiver.addendum || 'The recommendation is in the appointment waiver review queue. The original consequence remains until approval.' }}</p>
              </div>
              <h4 class="acw-h4">Workflow summary</h4>
              <ul class="acw-check">
                <li>Event type: {{ eventLabel }}</li>
                <li>Classification: {{ change.preview.value?.classification || '—' }}</li>
                <li>Consequence: {{ change.preview.value?.consequence?.model || 'none' }}</li>
                <li>Next session: {{ change.preview.value?.nextAppointment?.displayWhen || 'None scheduled' }}</li>
                <li>Audit trail preserved: Yes</li>
              </ul>
            </aside>
          </section>
        </div>

        <p v-if="change.error.value" class="acw-error">{{ change.error.value }}</p>

        <footer class="acw-footer">
          <button v-if="!change.workflow.value || change.workflow.value.status === 'draft'" type="button" class="acw-btn ghost" :disabled="change.saving.value || change.loading.value" @click="onSaveDraft">Save Draft</button>
          <span v-else class="muted">{{ change.workflow.value.status === 'completed' ? 'Signed note preserved on this session.' : 'Finish the saved signing request.' }}</span>
          <div class="acw-footer-right">
            <button v-if="change.step.value > 1 && (!change.workflow.value || change.workflow.value.status === 'draft')" type="button" class="acw-btn" :disabled="change.saving.value" @click="change.goBack()">Back</button>
            <button
              v-if="change.step.value < 4"
              type="button"
              class="acw-btn primary"
              :disabled="change.loading.value || !change.canContinueFromStep(change.step.value)"
              @click="change.goNext()"
            >Continue →</button>
            <template v-else-if="change.workflow.value?.status !== 'completed'">
            <label><input v-model="change.signatureConfirmed.value" type="checkbox" /> I reviewed this note and confirm my signature.</label>
            <button
              type="button"
              class="acw-btn primary"
              :disabled="change.saving.value || change.loading.value || !change.signatureConfirmed.value"
              @click="onSign"
            >{{ change.saving.value ? 'Signing…' : change.facts.waiver?.action === 'recommend' ? 'Sign & Send for Review →' : 'Sign & Complete →' }}</button>
            </template>
            <button v-else type="button" class="acw-btn primary" @click="onClose">Back to appointment</button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, watch } from 'vue';
import {
  CANCEL_INITIATORS,
  CANCEL_REASONS,
  OUTREACH_OPTIONS,
  WAIVER_REASONS,
  TERMINATION_WAIVE_REASONS
} from '../../utils/appointmentChangeNarrative.js';

const props = defineProps({
  change: { type: Object, required: true }
});

const emit = defineEmits(['closed', 'completed']);

const steps = [
  { n: 1, label: 'Event' },
  { n: 2, label: 'Details' },
  { n: 3, label: 'Consequence' },
  { n: 4, label: 'Review & Sign' }
];

const events = [
  { id: 'canceled', label: 'Canceled', hint: 'Client or provider canceled the appointment.', icon: '✕', tone: 'red' },
  { id: 'rescheduled', label: 'Rescheduled', hint: 'Move this appointment to a new date and time.', icon: '↻', tone: 'teal' },
  { id: 'no_show', label: 'No-show', hint: 'Client did not attend and did not cancel.', icon: '⊘', tone: 'amber' },
  { id: 'void', label: 'Void / Delete Appointment', hint: 'Remove this appointment (completed in error, duplicate, etc).', icon: '🗑', tone: 'gray' }
];

const initials = computed(() => {
  const n = String(props.change.context.clientName || 'ET').trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return n.slice(0, 2).toUpperCase() || 'CL';
});

const eventLabel = computed(() => {
  const hit = events.find((e) => e.id === props.change.facts.eventType);
  return hit?.label || '—';
});

const initiatorLabel = computed(() => {
  const hit = CANCEL_INITIATORS.find((i) => i.id === props.change.facts.initiator);
  return hit?.label || '';
});

const noticeLabel = computed(() => {
  const h = props.change.preview.value?.evaluation?.noticeHours;
  return h != null ? `${h} hours (before start time)` : 'Agency policy';
});

const timingLabel = computed(() => {
  const p = props.change.preview.value;
  if (!p) return '—';
  if (props.change.facts.eventType === 'no_show') return 'Did not attend';
  return p.isLate ? 'Late' : 'Advance / within notice';
});
const followUpLabel = computed(() => ({
  keep_next: nextAppointmentMessage.value,
  keep_next_or_support: nextAppointmentMessage.value,
  private_slots: `Open Appointments in your client portal to choose one of the private replacement times offered by your provider, or decline. This offer expires after ${props.change.facts.offerDays} days. A selected time is reserved for care-team confirmation. ${nextAppointmentMessage.value}`,
  portal_booking: `Open Appointments in your client portal to choose an available current-client replacement time, or decline. This offer expires after ${props.change.facts.offerDays} days. A selected time is reserved for care-team confirmation. ${nextAppointmentMessage.value}`,
  client_contact_support: 'Please contact our support team to arrange another appointment.',
  replacement_booked: 'A replacement appointment has been scheduled. Please review its current date and time in your portal.',
  support_will_contact: 'Our support team will contact you to arrange another appointment.',
  none: 'No action is required. Other scheduled appointments remain unchanged.'
}[props.change.facts.followUpAction || 'client_contact_support']));
const nextAppointmentMessage = computed(() => {
  const next = props.change.preview.value?.nextAppointment || props.change.replacementOptions?.value?.nextAppointment;
  return next ? `Your next appointment remains scheduled for ${next.displayWhen}${next.timeZone ? ` (${next.timeZone})` : ''}. You do not need to book it again.` : 'No next appointment is currently scheduled. Please contact support to arrange your next visit.';
});
function onNotificationModeChange() {
  if (props.change.facts.notificationMode === 'none' && ['private_slots', 'portal_booking'].includes(props.change.facts.followUpAction)) props.change.facts.followUpAction = 'keep_next_or_support';
}
const deliveryNeedsAttention = computed(() => {
  const result = props.change.workflow.value?.result?.notificationDelivery;
  return result && (result.failed || result.held || result.skipped);
});

const showWaiverUi = computed(() => {
  const w = props.change.preview.value?.waiverOptions;
  if (!w) return false;
  return !!(w.showFeeActions || w.showPackageActions || w.canRecommendWaiveTermination);
});

watch(
  () => props.change.facts.eventType,
  async (v) => {
    if (v && props.change.step.value >= 2) await props.change.refreshPreview();
  }
);

async function onCommentsChange() {
  await props.change.refreshPreview();
}

function onClose() {
  props.change.closeWizard();
  emit('closed');
}

async function onSaveDraft() {
  if (await props.change.saveDraft()) onClose();
}

async function onSign() {
  const result = await props.change.complete();
  if (result?.ok) {
    emit('completed', result);
    props.change.workflow.value = { status: 'completed', result, facts: { ...props.change.facts }, narrative: result.narrative };
  }
}
</script>

<style scoped>
.acw-offer-slots{max-height:240px;overflow:auto;border-block:1px solid #dce4ee;margin:10px 0}.acw-offers{padding:12px;background:#f0f7ff;border-radius:8px}
.acw-client-notice { margin-top: 18px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 12px; background: #f8fafc; }
.acw-client-notice legend { font-weight: 700; }
.acw-overlay {
  position: fixed;
  inset: 0;
  z-index: 5200;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 12px;
  overflow: auto;
}
.acw {
  width: min(1100px, 100%);
  margin: auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 24px);
  overflow: hidden;
}
.acw-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  padding: 16px 20px 8px;
}
.acw-title { margin: 0; font-size: 1.25rem; font-weight: 800; color: #0f172a; }
.acw-sub { margin: 4px 0 0; color: #64748b; font-size: 13px; }
.acw-link {
  border: none;
  background: none;
  color: var(--primary, #0f766e);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.acw-context {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin: 0 16px;
  padding: 10px 12px;
  background: #f1f5f9;
  border-radius: 12px;
}
.acw-ctx-item { display: flex; gap: 8px; align-items: center; min-width: 0; }
.acw-avatar {
  width: 36px; height: 36px; border-radius: 999px;
  background: #0f766e; color: #fff; display: grid; place-items: center;
  font-weight: 800; font-size: 12px; flex-shrink: 0;
}
.acw-ctx-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
.acw-ctx-val { font-size: 13px; font-weight: 650; color: #0f172a; }
.acw-steps {
  display: flex; gap: 8px; flex-wrap: wrap;
  padding: 14px 20px 0;
}
.acw-step {
  display: inline-flex; align-items: center; gap: 6px;
  color: #94a3b8; font-size: 13px; font-weight: 650;
}
.acw-step.on { color: #0f766e; }
.acw-step.done { color: #059669; }
.acw-step-num {
  width: 22px; height: 22px; border-radius: 999px;
  display: grid; place-items: center; font-size: 11px;
  background: #e2e8f0; color: inherit;
}
.acw-step.on .acw-step-num { background: #0f766e; color: #fff; }
.acw-step.done .acw-step-num { background: #059669; color: #fff; }
.acw-body { padding: 16px 20px; overflow: auto; flex: 1; }
.acw-h { margin: 0 0 12px; font-size: 1.05rem; font-weight: 800; }
.acw-h4 { margin: 14px 0 8px; font-size: 0.9rem; font-weight: 750; }
.acw-event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}
.acw-event-card {
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  background: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.acw-event-card.on { border-color: #0f766e; box-shadow: inset 0 0 0 1px #0f766e; background: #f0fdfa; }
.acw-event-card.tone-red .acw-event-ico { color: #dc2626; }
.acw-event-card.tone-teal .acw-event-ico { color: #0f766e; }
.acw-event-card.tone-amber .acw-event-ico { color: #d97706; }
.acw-event-card.tone-gray .acw-event-ico { color: #64748b; }
.acw-event-ico { font-size: 1.4rem; font-weight: 800; }
.acw-info {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: 13px;
  line-height: 1.45;
}
.acw-panel--split {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(220px, 0.8fr);
  gap: 16px;
}
@media (max-width: 800px) {
  .acw-panel--split { grid-template-columns: 1fr; }
}
.acw-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.acw-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
}
.acw-chip.on { background: #0f766e; border-color: #0f766e; color: #fff; font-weight: 700; }
.acw-side {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  background: #f8fafc;
}
.acw-dl { margin: 10px 0 0; display: grid; gap: 8px; }
.acw-dl dt { font-size: 11px; color: #64748b; text-transform: uppercase; }
.acw-dl dd { margin: 0; font-weight: 650; font-size: 13px; }
.acw-result {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}
.acw-result.late { background: #fff7ed; border-color: #fed7aa; }
.acw-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin: 0 0 14px;
}
.acw-summary-grid dt { font-size: 11px; color: #64748b; }
.acw-summary-grid dd { margin: 2px 0 0; font-weight: 700; }
.acw-consequence-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  margin-bottom: 12px;
}
.acw-balance { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
.acw-balance th, .acw-balance td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; }
.badge {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #e2e8f0;
  font-weight: 700;
}
.badge.ok { background: #d1fae5; color: #065f46; }
.acw-bullets { margin: 0; padding-left: 18px; font-size: 13px; color: #334155; line-height: 1.5; }
.acw-narrative {
  white-space: pre-wrap;
  line-height: 1.55;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  min-height: 120px;
  font-size: 14px;
  color: #0f172a;
}
.acw-note-head { display: flex; align-items: center; gap: 10px; }
.acw-check { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; }
.acw-field { display: grid; gap: 6px; margin-top: 12px; font-size: 13px; font-weight: 650; }
.acw-input, .acw-textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  font-weight: 400;
}
.acw-error { color: #b91c1c; padding: 0 20px; font-size: 13px; }
.acw-footer {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 20px 16px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}
.acw-footer-right { display: flex; gap: 8px; }
.acw-btn {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 700;
  cursor: pointer;
}
.acw-btn.ghost { border-style: dashed; }
.acw-btn.primary {
  background: #0f766e;
  border-color: #0f766e;
  color: #fff;
}
.acw-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.muted { color: #64748b; font-weight: 400; }
</style>
