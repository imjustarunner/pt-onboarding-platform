<template>
  <div class="card" style="margin-top: 10px;">
    <h3 class="card-title" style="margin: 0 0 6px 0;">Admin Request Override (Submit on behalf)</h3>
    <div class="hint">
      Submit the same requests providers can submit, but on behalf of <strong>{{ userName || `User #${userId}` }}</strong>.
      These will land in the normal payroll review queues.
    </div>

    <div v-if="!agencyId || !userId" class="warn-box" style="margin-top: 10px;">
      Select an organization and a provider first.
    </div>

    <div v-else class="actions" style="margin-top: 10px; justify-content: flex-start; flex-wrap: wrap; gap: 8px;">
      <button class="btn btn-secondary btn-sm" type="button" @click="openMileageModal('school_travel')">
        School Mileage
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="openMileageModal('standard')">
        Other Mileage
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="openMedcancelModal">
        {{ medcancelDisplayName }}
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="openReimbursementModal">
        Reimbursement
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="openCompanyCardExpenseModal">
        Company Card Expense
      </button>

      <button class="btn btn-secondary btn-sm" type="button" @click="openTimeMeetingModal">
        Time Claim (3A)
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="openTimeExcessModal">
        Excess Time (3B)
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="openTimeCorrectionModal">
        Time Claim (3C)
      </button>
      <button class="btn btn-secondary btn-sm" type="button" @click="openTimeOvertimeModal">
        Time Claim (3D)
      </button>

      <button class="btn btn-secondary btn-sm" type="button" @click="openPtoChooserModal">
        PTO Request
      </button>
    </div>

    <div v-if="submitSuccess" class="success-box" style="margin-top: 10px;">{{ submitSuccess }}</div>

    <div v-if="(sessionSubmissions || []).length" class="card" style="margin-top: 10px;">
      <div class="section-header" style="margin: 0;">
        <h3 class="card-title" style="margin: 0;">This session’s submissions</h3>
        <div class="actions" style="margin: 0; justify-content: flex-end;">
          <button class="btn btn-secondary btn-sm" type="button" @click="clearSessionSubmissions">Clear list</button>
        </div>
      </div>
      <div class="hint" style="margin-top: 6px;">
        Keeps a running list while you submit on behalf, so you don’t lose your place.
      </div>
      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th style="width: 170px;">Time</th>
              <th style="width: 170px;">Type</th>
              <th>Details</th>
              <th style="width: 120px;" class="right">ID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(e, idx) in sessionSubmissions" :key="`${e.ts}-${idx}`">
              <td class="muted">{{ fmtTsLocal(e.ts) }}</td>
              <td><strong>{{ e.type }}</strong></td>
              <td>{{ e.details || '—' }}</td>
              <td class="right">{{ e.id || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Mileage submission modal -->
  <div v-if="showMileageModal" class="modal-backdrop" @click.self="closeMileageModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Submit Mileage (Admin Override)</div>
          <div class="hint">Submitting on behalf of {{ userName || `User #${userId}` }}.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeMileageModal">Close</button>
      </div>

      <div v-if="submitMileageError" class="warn-box" style="margin-top: 10px;">{{ submitMileageError }}</div>

      <div class="hint" style="margin-top: 10px;">
        <template v-if="mileageForm.claimType === 'school_travel'">
          School Mileage (auto): eligible miles are calculated as (Home↔School RT − Home↔Office RT).
        </template>
        <template v-else>
          Other Mileage (manual): enter miles and include who approved the trip + what it was for.
        </template>
      </div>

      <div v-if="mileageForm.claimType === 'school_travel'" class="card" style="margin-top: 10px;">
        <div class="section-header" style="margin: 0;">
          <h3 class="card-title" style="margin: 0;">Home address</h3>
          <div class="actions" style="margin: 0; justify-content: flex-end;">
            <button
              v-if="!editingHomeAddress"
              class="btn btn-secondary btn-sm"
              type="button"
              @click="editingHomeAddress = true"
            >
              {{ hasHomeAddress ? 'Update home address' : 'Enter home address' }}
            </button>
            <template v-else>
              <button
                class="btn btn-secondary btn-sm"
                type="button"
                @click="cancelHomeAddressEdit"
                :disabled="savingHomeAddress"
              >
                Cancel
              </button>
              <button class="btn btn-primary btn-sm" type="button" @click="saveHomeAddress" :disabled="savingHomeAddress">
                {{ savingHomeAddress ? 'Saving…' : 'Save' }}
              </button>
            </template>
          </div>
        </div>
        <div class="hint" style="margin-top: 6px;">
          Required for School Mileage auto-calculation.
        </div>

        <div v-if="!editingHomeAddress" style="margin-top: 10px;">
          <div v-if="hasHomeAddress" class="row">
            <strong>Using:</strong>
            {{ mileageForm.homeStreetAddress }}, {{ mileageForm.homeCity }}, {{ mileageForm.homeState }} {{ mileageForm.homePostalCode }}
          </div>
          <div v-else class="warn-box">
            No home address on file. Click <strong>Enter home address</strong> to save it.
          </div>
        </div>

        <div v-else>
          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Street</label>
              <input v-model="mileageForm.homeStreetAddress" type="text" placeholder="123 Main St" />
            </div>
            <div class="field">
              <label>City</label>
              <input v-model="mileageForm.homeCity" type="text" placeholder="City" />
            </div>
          </div>
          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>State</label>
              <input v-model="mileageForm.homeState" type="text" placeholder="State" />
            </div>
            <div class="field">
              <label>Postal code</label>
              <input v-model="mileageForm.homePostalCode" type="text" placeholder="ZIP" />
            </div>
          </div>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date of drive</label>
          <input v-model="mileageForm.driveDate" type="date" />
        </div>
        <div class="field" v-if="mileageForm.claimType === 'school_travel'">
          <label>School</label>
          <select v-model="mileageForm.schoolOrganizationId">
            <option :value="null" disabled>Select a school…</option>
            <option v-for="s in mileageSchools" :key="s.schoolOrganizationId" :value="s.schoolOrganizationId">
              {{ s.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field" v-if="mileageForm.claimType === 'school_travel'">
          <label>Assigned building office</label>
          <select v-model="mileageForm.officeLocationId">
            <option :value="null" disabled>Select an assigned office…</option>
            <option v-for="o in mileageOfficeOptions" :key="o.id" :value="o.id">
              {{ o.name }}{{ o.isPrimary ? ' (Primary)' : '' }}{{ o.addressLine ? ` — ${o.addressLine}` : '' }}
            </option>
          </select>
          <div class="hint" style="margin-top: 6px;">
            {{ (mileageAssignedOffices || []).length
              ? 'Mileage mapping uses this assigned building address.'
              : 'No explicit building assignment found yet; office selection uses agency offices.' }}
          </div>
          <div v-if="selectedMileageOffice?.addressLine" class="muted" style="margin-top: 4px;">
            Using address: {{ selectedMileageOffice.addressLine }}
          </div>
        </div>
        <div class="field" v-if="mileageForm.claimType === 'school_travel'">
          <label>Tier (for rate)</label>
          <select v-model="mileageForm.tierLevel">
            <option :value="null">Unknown / Other</option>
            <option :value="1">Tier 1</option>
            <option :value="2">Tier 2</option>
            <option :value="3">Tier 3</option>
          </select>
        </div>
      </div>

      <div
        v-if="mileageForm.claimType === 'school_travel' && schoolTravelManualMilesMode"
        class="card"
        style="margin-top: 10px;"
      >
        <h3 class="card-title" style="margin: 0 0 6px 0;">Manual miles (temporary fallback)</h3>
        <div class="hint">
          Auto-calculation is unavailable. Enter the <strong>eligible miles</strong> you want reimbursed.
        </div>
        <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr;">
          <div class="field">
            <label>Eligible miles</label>
            <input v-model="mileageForm.miles" type="number" min="0" step="0.01" placeholder="0" />
          </div>
        </div>
      </div>

      <div v-if="mileageForm.claimType !== 'school_travel'" class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Trip details</h3>
        <div class="hint">These details help payroll validate that the trip was approved and eligible.</div>
        <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label>Who approved the trip? (required)</label>
            <input v-model="mileageForm.tripApprovedBy" type="text" placeholder="Name or email" />
          </div>
          <div class="field">
            <label>Was this trip pre-approved? (required)</label>
            <select v-model="mileageForm.tripPreapproved">
              <option :value="null" disabled>Select…</option>
              <option :value="true">Yes</option>
              <option :value="false">No</option>
            </select>
          </div>
        </div>
        <div class="field" style="margin-top: 10px;">
          <label>What was the trip for? (required)</label>
          <textarea v-model="mileageForm.tripPurpose" rows="2" placeholder="Brief purpose…"></textarea>
        </div>
        <div class="field" style="margin-top: 10px;">
          <label>Cost center / client / school (optional)</label>
          <input v-model="mileageForm.costCenter" type="text" placeholder="Optional" />
        </div>
      </div>

      <div v-if="mileageForm.claimType !== 'school_travel'" class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Miles</label>
          <input v-model="mileageForm.miles" type="number" min="0" step="0.01" placeholder="0" />
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <label class="control" style="display: flex; gap: 10px; align-items: center;">
            <input v-model="mileageForm.roundTrip" type="checkbox" />
            <span>Round trip</span>
          </label>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Start location (optional)</label>
          <input v-model="mileageForm.startLocation" type="text" placeholder="Address or description…" />
        </div>
        <div class="field">
          <label>End location (optional)</label>
          <input v-model="mileageForm.endLocation" type="text" placeholder="Address or description…" />
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (optional)</label>
        <textarea v-model="mileageForm.notes" rows="3" placeholder="Add any context for payroll review…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="mileageForm.attestation" type="checkbox" />
        <span>I certify this mileage claim is accurate and has not been submitted elsewhere.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button
          class="btn btn-secondary"
          type="button"
          @click="queueMileageAndReset"
          :disabled="submittingMileage"
          style="margin-right: 8px;"
          title="Queue this entry and start another (not submitted yet)"
        >
          + Add another entry
        </button>
        <button class="btn btn-primary" @click="submitMileage" :disabled="submittingMileage">
          {{ submittingMileage ? 'Submitting…' : ((mileageQueuedClaims || []).length ? `Submit all (${(mileageQueuedClaims || []).length + 1})` : 'Submit for approval') }}
        </button>
      </div>

      <div v-if="(mileageQueuedClaims || []).length" class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Queued entries (not submitted yet)</h3>
        <div class="table-wrap" style="margin-top: 10px;">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Details</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, idx) in mileageQueuedClaims" :key="idx">
                <td>{{ String(c.driveDate || '').slice(0,10) }}</td>
                <td><strong>{{ String(c.claimType || '').toLowerCase()==='school_travel' ? 'School Mileage' : 'Other Mileage' }}</strong></td>
                <td>
                  <template v-if="String(c.claimType || '').toLowerCase()==='school_travel'">
                    School #{{ c.schoolOrganizationId || '—' }} • Office #{{ c.officeLocationId || '—' }}
                  </template>
                  <template v-else>
                    Miles {{ String(c.miles || '').trim() || '—' }}
                  </template>
                </td>
                <td class="right">
                  <button class="btn btn-danger btn-sm" type="button" @click="removeQueuedMileageClaim(idx)" :disabled="submittingMileage">
                    Remove
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- MedCancel submission modal -->
  <div v-if="showMedcancelModal" class="modal-backdrop" @click.self="closeMedcancelModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Submit {{ medcancelDisplayName }} (Admin Override)</div>
          <div class="hint">Submitting on behalf of {{ userName || `User #${userId}` }}.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeMedcancelModal">Close</button>
      </div>

      <div v-if="submitMedcancelError" class="warn-box" style="margin-top: 10px;">{{ submitMedcancelError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date</label>
          <input v-model="medcancelForm.claimDate" type="date" />
        </div>
        <div class="field">
          <label>School</label>
          <select v-model="medcancelForm.schoolOrganizationId">
            <option :value="null" disabled>Select a school…</option>
            <option v-for="s in mileageSchools" :key="s.schoolOrganizationId" :value="s.schoolOrganizationId">
              {{ s.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Missed services (one date)</h3>
        <div class="muted">Add one entry per missed encounter (90832, 90834, 90837). Each requires a note + certification.</div>

        <div class="hint" style="margin-top: 8px;">
          Estimated amount (if approved): <strong>{{ fmtMoney(medcancelEstimatedAmount) }}</strong>
          <span v-if="String(userMedcancelRateSchedule||'').trim()" class="muted" style="margin-left: 8px;">
            (Schedule: {{ String(userMedcancelRateSchedule).toLowerCase() }})
          </span>
        </div>

        <div v-for="(it, idx) in medcancelForm.items" :key="idx" class="card" style="margin-top: 10px;">
          <div class="field-row" style="grid-template-columns: 200px 1fr; align-items: end;">
            <div class="field">
              <label>Missed service code</label>
              <select v-model="it.missedServiceCode">
                <option value="90832">90832</option>
                <option value="90834">90834</option>
                <option value="90837">90837</option>
              </select>
            </div>
            <div class="field">
              <label>Note (required)</label>
              <textarea v-model="it.note" rows="2" placeholder="Why was the client missing? What did you do to attempt the session?"></textarea>
            </div>
          </div>
          <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
            <div class="field">
              <label>Client initials (required)</label>
              <input v-model="it.clientInitials" type="text" placeholder="e.g., AB" />
            </div>
            <div class="field">
              <label>Session time (required)</label>
              <input v-model="it.sessionTime" type="time" />
            </div>
          </div>
          <label class="control" style="margin-top: 8px; display: flex; gap: 10px; align-items: center;">
            <input v-model="it.attestation" type="checkbox" />
            <span>I certify I attempted this session and it was missed.</span>
          </label>
          <div class="actions" style="margin-top: 8px; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" type="button" @click="removeMedcancelItem(idx)" :disabled="submittingMedcancel">
              Remove
            </button>
          </div>
        </div>

        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="addMedcancelItem" :disabled="submittingMedcancel">
            + Add another missed service (same date)
          </button>
        </div>

        <div class="actions" style="margin-top: 10px; justify-content: flex-start; gap: 8px; flex-wrap: wrap;">
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            @click="queueMedcancelAndReset"
            :disabled="submittingMedcancel"
            title="Queue this date and start another date (still not submitted yet)"
          >
            + Add another date (queue this one)
          </button>
        </div>

        <div v-if="(medcancelQueuedClaims || []).length" class="card" style="margin-top: 10px;">
          <h3 class="card-title" style="margin: 0 0 6px 0;">Queued dates (not submitted yet)</h3>
          <div class="table-wrap" style="margin-top: 10px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>School</th>
                  <th class="right">Items</th>
                  <th class="right">Est.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(c, idx) in medcancelQueuedClaims" :key="idx">
                  <td>{{ String(c.claimDate || '').slice(0,10) }}</td>
                  <td>{{ c.schoolOrganizationId ? `#${c.schoolOrganizationId}` : '—' }}</td>
                  <td class="right">{{ Array.isArray(c.items) ? c.items.length : 0 }}</td>
                  <td class="right">{{ fmtMoney(estimateMedcancelAmountForClaim(c)) }}</td>
                  <td class="right">
                    <button class="btn btn-danger btn-sm" type="button" @click="removeQueuedMedcancelClaim(idx)" :disabled="submittingMedcancel">
                      Remove
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitMedcancel" :disabled="submittingMedcancel">
          {{ submittingMedcancel ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>

  <!-- PTO chooser modal -->
  <div v-if="showPtoChooser" class="modal-backdrop" @click.self="closePtoChooserModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Request PTO (Admin Override)</div>
          <div class="hint">Submitting on behalf of {{ userName || `User #${userId}` }}.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closePtoChooserModal">Close</button>
      </div>

      <div v-if="submitPtoError" class="warn-box" style="margin-top: 10px;">{{ submitPtoError }}</div>

      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Bucket</th>
              <th class="right">Balance (hours)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sick Leave</td>
              <td class="right">{{ fmtNum(ptoBalances.sickHours || 0) }}</td>
            </tr>
            <tr>
              <td>Training PTO</td>
              <td class="right">{{ (ptoPolicy?.trainingPtoEnabled === true && ptoAccount?.training_pto_eligible) ? fmtNum(ptoBalances.trainingHours || 0) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-secondary" type="button" @click="openPtoSick">Sick Leave Request</button>
        <button class="btn btn-secondary" type="button" @click="openPtoTraining" :disabled="ptoPolicy?.trainingPtoEnabled !== true || !ptoAccount?.training_pto_eligible">
          Training PTO Request
        </button>
      </div>
    </div>
  </div>

  <!-- PTO: Sick Leave request modal -->
  <div v-if="showPtoSickModal" class="modal-backdrop" @click.self="closePtoSick">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">PTO Request — Sick Leave (Admin Override)</div>
          <div class="hint">Submitting on behalf of {{ userName || `User #${userId}` }}.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closePtoSick">Close</button>
      </div>

      <div v-if="submitPtoError" class="warn-box" style="margin-top: 10px;">{{ submitPtoError }}</div>

      <div class="card" style="margin-top: 12px;">
        <div class="muted"><strong>Entries</strong></div>
        <div v-for="(it, idx) in (ptoSickForm.items || [])" :key="idx" class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label>Date</label>
            <input v-model="it.date" type="date" />
          </div>
          <div class="field">
            <label>Hours</label>
            <input v-model="it.hours" type="number" step="0.25" min="0" placeholder="0" />
          </div>
          <div class="actions" style="grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="removePtoItem(ptoSickForm, idx)" :disabled="(ptoSickForm.items || []).length <= 1 || submittingPtoRequest">
              Remove
            </button>
          </div>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="addPtoItem(ptoSickForm)" :disabled="submittingPtoRequest">
            + Add date
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (optional)</label>
        <textarea v-model="ptoSickForm.notes" rows="3" placeholder="Any additional context…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="ptoSickForm.attestation" type="checkbox" />
        <span>I certify this request is accurate.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitPtoSick" :disabled="submittingPtoRequest">
          {{ submittingPtoRequest ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>

  <!-- PTO: Training request modal -->
  <div v-if="showPtoTrainingModal" class="modal-backdrop" @click.self="closePtoTraining">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">PTO Request — Training (Admin Override)</div>
          <div class="hint">Submitting on behalf of {{ userName || `User #${userId}` }}.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closePtoTraining">Close</button>
      </div>

      <div v-if="submitPtoError" class="warn-box" style="margin-top: 10px;">{{ submitPtoError }}</div>

      <div class="card" style="margin-top: 12px;">
        <div class="muted"><strong>Entries</strong></div>
        <div v-for="(it, idx) in (ptoTrainingForm.items || [])" :key="idx" class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
          <div class="field">
            <label>Date</label>
            <input v-model="it.date" type="date" />
          </div>
          <div class="field">
            <label>Hours</label>
            <input v-model="it.hours" type="number" step="0.25" min="0" placeholder="0" />
          </div>
          <div class="actions" style="grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="removePtoItem(ptoTrainingForm, idx)" :disabled="(ptoTrainingForm.items || []).length <= 1 || submittingPtoRequest">
              Remove
            </button>
          </div>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="addPtoItem(ptoTrainingForm)" :disabled="submittingPtoRequest">
            + Add date
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Description (required)</label>
        <textarea v-model="ptoTrainingForm.description" rows="3" placeholder="Brief description of the training…"></textarea>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Proof of participation (required)</label>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/gif,image/webp" @change="onPtoProofPick" />
        <div class="hint" v-if="ptoTrainingForm.proofName">Selected: <strong>{{ ptoTrainingForm.proofName }}</strong></div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (optional)</label>
        <textarea v-model="ptoTrainingForm.notes" rows="3" placeholder="Any additional context…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="ptoTrainingForm.attestation" type="checkbox" />
        <span>I certify this request is accurate and I have provided required documentation.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitPtoTraining" :disabled="submittingPtoRequest">
          {{ submittingPtoRequest ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Reimbursement submission modal -->
  <div v-if="showReimbursementModal" class="modal-backdrop" @click.self="closeReimbursementModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Submit Reimbursement (Admin Override)</div>
          <div class="hint">Submitting on behalf of {{ userName || `User #${userId}` }}.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeReimbursementModal">Close</button>
      </div>

      <div v-if="submitReimbursementError" class="warn-box" style="margin-top: 10px;">{{ submitReimbursementError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Expense date</label>
          <input v-model="reimbursementForm.expenseDate" type="date" />
        </div>
        <div class="field">
          <label>Amount</label>
          <input v-model="reimbursementForm.amount" type="number" step="0.01" min="0" placeholder="0.00" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Payment method (required)</label>
          <select v-model="reimbursementForm.paymentMethod">
            <option :value="null" disabled>Select…</option>
            <option value="personal_card">Personal card</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field">
          <label>Project / school / client initials (optional)</label>
          <input v-model="reimbursementForm.projectRef" type="text" placeholder="Optional" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Supervisor / approver (required)</label>
          <input v-model="reimbursementForm.purchaseApprovedBy" type="text" placeholder="Name (or name + email)" />
        </div>
        <div class="field">
          <label>Was it pre-approved? (required)</label>
          <select v-model="reimbursementForm.purchasePreapproved">
            <option :value="null" disabled>Select…</option>
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </select>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Vendor (optional)</label>
          <input v-model="reimbursementForm.vendor" type="text" placeholder="Vendor" />
        </div>
        <div class="field">
          <label>Reason (required)</label>
          <input v-model="reimbursementForm.reason" type="text" placeholder="Why was this expense needed?" />
        </div>
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Category split (optional)</h3>
        <div class="hint">If you split the amount across categories, the split total must match the amount.</div>
        <div
          v-for="(s, idx) in (reimbursementForm.splits || [])"
          :key="idx"
          class="field-row"
          style="margin-top: 10px; grid-template-columns: 1fr 180px;"
        >
          <div class="field">
            <label>Category</label>
            <input v-model="s.category" type="text" placeholder="e.g., Supplies" />
          </div>
          <div class="field">
            <label>Amount</label>
            <input v-model="s.amount" type="number" step="0.01" min="0" placeholder="0.00" />
          </div>
          <div class="actions" style="grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="(reimbursementForm.splits || []).splice(idx, 1)" :disabled="(reimbursementForm.splits || []).length <= 1 || submittingReimbursement">
              Remove
            </button>
          </div>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="(reimbursementForm.splits || []).push({ category: '', amount: '' })" :disabled="submittingReimbursement">
            + Add split
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (required)</label>
        <textarea v-model="reimbursementForm.notes" rows="3" placeholder="Add any context for payroll review…"></textarea>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Receipt (required)</label>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/gif,image/webp" @change="onReceiptPick" />
        <div class="hint" v-if="reimbursementForm.receiptName">Selected: <strong>{{ reimbursementForm.receiptName }}</strong></div>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="reimbursementForm.attestation" type="checkbox" />
        <span>I certify this reimbursement is accurate and I have not submitted it elsewhere.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitReimbursement" :disabled="submittingReimbursement">
          {{ submittingReimbursement ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Company card expense submission modal -->
  <div v-if="showCompanyCardExpenseModal" class="modal-backdrop" @click.self="closeCompanyCardExpenseModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Submit Expense (Company Card) (Admin Override)</div>
          <div class="hint">Submitting on behalf of {{ userName || `User #${userId}` }}.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeCompanyCardExpenseModal">Close</button>
      </div>

      <div v-if="submitCompanyCardExpenseError" class="warn-box" style="margin-top: 10px;">{{ submitCompanyCardExpenseError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Expense date</label>
          <input v-model="companyCardExpenseForm.expenseDate" type="date" />
        </div>
        <div class="field">
          <label>Amount</label>
          <input v-model="companyCardExpenseForm.amount" type="number" step="0.01" min="0" placeholder="0.00" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Payment method</label>
          <input :value="'Company card'" type="text" disabled />
        </div>
        <div class="field">
          <label>Project / school / client initials (optional)</label>
          <input v-model="companyCardExpenseForm.projectRef" type="text" placeholder="Optional" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Supervisor / approver (required)</label>
          <input v-model="companyCardExpenseForm.supervisorName" type="text" placeholder="Name (or name + email)" />
        </div>
        <div class="field">
          <label>Reason / purpose (required)</label>
          <input v-model="companyCardExpenseForm.purpose" type="text" placeholder="What was this for?" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Vendor (optional)</label>
          <input v-model="companyCardExpenseForm.vendor" type="text" placeholder="Vendor" />
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <div class="hint">Tip: use project/client initials so payroll can allocate correctly.</div>
        </div>
      </div>

      <div class="card" style="margin-top: 10px;">
        <h3 class="card-title" style="margin: 0 0 6px 0;">Category split (optional)</h3>
        <div class="hint">If you split the amount across categories, the split total must match the amount.</div>
        <div
          v-for="(s, idx) in (companyCardExpenseForm.splits || [])"
          :key="idx"
          class="field-row"
          style="margin-top: 10px; grid-template-columns: 1fr 180px;"
        >
          <div class="field">
            <label>Category</label>
            <input v-model="s.category" type="text" placeholder="e.g., Training" />
          </div>
          <div class="field">
            <label>Amount</label>
            <input v-model="s.amount" type="number" step="0.01" min="0" placeholder="0.00" />
          </div>
          <div class="actions" style="grid-column: 1 / -1; justify-content: flex-end; margin-top: 6px;">
            <button class="btn btn-secondary btn-sm" type="button" @click="(companyCardExpenseForm.splits || []).splice(idx, 1)" :disabled="(companyCardExpenseForm.splits || []).length <= 1 || submittingCompanyCardExpense">
              Remove
            </button>
          </div>
        </div>
        <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
          <button class="btn btn-secondary btn-sm" type="button" @click="(companyCardExpenseForm.splits || []).push({ category: '', amount: '' })" :disabled="submittingCompanyCardExpense">
            + Add split
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes (required)</label>
        <textarea v-model="companyCardExpenseForm.notes" rows="3" placeholder="Describe the purchase and business purpose…"></textarea>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Receipt (required)</label>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/jpg,image/gif,image/webp" @change="onCompanyCardReceiptPick" />
        <div class="hint" v-if="companyCardExpenseForm.receiptName">Selected: <strong>{{ companyCardExpenseForm.receiptName }}</strong></div>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="companyCardExpenseForm.attestation" type="checkbox" />
        <span>I certify this purchase was for business use and the details above are accurate.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitCompanyCardExpense" :disabled="submittingCompanyCardExpense">
          {{ submittingCompanyCardExpense ? 'Submitting…' : 'Submit for review' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Time Claim: Meeting/Training modal -->
  <div v-if="showTimeMeetingModal" class="modal-backdrop" @click.self="closeTimeMeetingModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Time Claim — Meeting / Training (Admin Override)</div>
          <div class="hint">Module 3A: Log attendance for meeting or training.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeTimeMeetingModal">Close</button>
      </div>

      <div v-if="submitTimeClaimError" class="warn-box" style="margin-top: 10px;">{{ submitTimeClaimError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date</label>
          <input v-model="timeMeetingForm.claimDate" type="date" />
        </div>
        <div class="field">
          <label>Meeting type</label>
          <select v-model="timeMeetingForm.meetingType">
            <option>Admin Update Meeting</option>
            <option>Admin Meeting</option>
            <option>Leadership Circle Meeting</option>
            <option>Admin Town Hall Meeting</option>
            <option>Training</option>
            <option>Evaluation</option>
            <option>Not listed</option>
          </select>
        </div>
      </div>

      <div class="field" v-if="timeMeetingForm.meetingType === 'Not listed'" style="margin-top: 10px;">
        <label>Other meeting not listed</label>
        <input v-model="timeMeetingForm.otherMeeting" type="text" placeholder="Describe the meeting" />
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr 1fr;">
        <div class="field">
          <label>Start time</label>
          <input v-model="timeMeetingForm.startTime" type="time" />
        </div>
        <div class="field">
          <label>End time</label>
          <input v-model="timeMeetingForm.endTime" type="time" />
        </div>
        <div class="field">
          <label>Total minutes</label>
          <input v-model="timeMeetingForm.totalMinutes" type="number" step="1" min="0" placeholder="0" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Platform</label>
          <select v-model="timeMeetingForm.platform">
            <option>Google Meet</option>
            <option>In-Person</option>
            <option>Other</option>
          </select>
        </div>
        <div class="field">
          <label>&nbsp;</label>
          <div class="hint">Tip: enter Total Minutes directly if you don’t want to track start/end times.</div>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Event summary</label>
        <textarea v-model="timeMeetingForm.summary" rows="3" placeholder="Include purpose…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="timeMeetingForm.attestation" type="checkbox" />
        <span>I certify that the information is accurate, complete, and in compliance with the workplace handbook.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitTimeMeeting" :disabled="submittingTimeClaim">
          {{ submittingTimeClaim ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Time Claim: Excess Time modal -->
  <div v-if="showTimeExcessModal" class="modal-backdrop" @click.self="closeTimeExcessModal">
    <div class="modal" style="width: min(800px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Time Claim — Excess Time (Admin Override)</div>
          <div class="hint">Select service codes and enter direct/indirect minutes. Excess beyond the included span is paid at the provider's rates.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeTimeExcessModal">Close</button>
      </div>

      <div v-if="submitTimeClaimError" class="warn-box" style="margin-top: 10px;">{{ submitTimeClaimError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date of services</label>
          <input v-model="timeExcessForm.claimDate" type="date" />
        </div>
      </div>

      <div class="card" style="margin-top: 12px;">
        <h4 style="margin: 0 0 8px 0;">Service code entries</h4>
        <div v-if="excessRulesLoading" class="muted">Loading rules…</div>
        <div v-else-if="!excessRules.length" class="muted">
          No excess compensation rules configured. Add service codes in Payroll Settings → Excess Time Rules.
        </div>
        <div v-else>
          <div
            v-for="(item, idx) in timeExcessForm.items"
            :key="idx"
            class="field-row"
            style="margin-top: 10px; grid-template-columns: 140px 1fr 1fr 1fr auto; align-items: end; gap: 10px;"
          >
            <div class="field">
              <label>Service Code</label>
              <select v-model="item.serviceCode">
                <option value="">Select…</option>
                <option v-for="r in excessRules" :key="r.service_code" :value="r.service_code">{{ r.service_code }}</option>
              </select>
            </div>
            <div class="field" v-if="item.serviceCode && excessRuleByCode[item.serviceCode]">
              <label>Direct (mins)</label>
              <input v-model.number="item.directMinutes" type="number" step="1" min="0" placeholder="0" />
              <div class="hint" style="font-size: 11px;">Included: {{ excessRuleByCode[item.serviceCode].direct_service_included_max }} mins</div>
            </div>
            <div class="field" v-else>
              <label>Direct (mins)</label>
              <input v-model.number="item.directMinutes" type="number" step="1" min="0" placeholder="0" />
            </div>
            <div class="field" v-if="item.serviceCode && excessRuleByCode[item.serviceCode]">
              <label>Indirect/Admin (mins)</label>
              <input v-model.number="item.indirectMinutes" type="number" step="1" min="0" placeholder="0" />
              <div class="hint" style="font-size: 11px;">Included: {{ excessRuleByCode[item.serviceCode].admin_included_max }} mins</div>
            </div>
            <div class="field" v-else>
              <label>Indirect/Admin (mins)</label>
              <input v-model.number="item.indirectMinutes" type="number" step="1" min="0" placeholder="0" />
            </div>
            <div class="field">
              <button type="button" class="btn btn-danger btn-sm" @click="removeExcessItem(idx)" :disabled="timeExcessForm.items.length <= 1">
                Remove
              </button>
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 10px;" @click="addExcessItem" :disabled="!excessRules.length">
            + Add another code
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Reason for extended time (optional)</label>
        <textarea v-model="timeExcessForm.reason" rows="2" placeholder="e.g., Documentation, care coordination…"></textarea>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="timeExcessForm.attestation" type="checkbox" />
        <span>I certify that the information is accurate, complete, and in compliance with the workplace handbook.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitTimeExcess" :disabled="submittingTimeClaim || !hasValidExcessItems || !timeExcessForm.attestation">
          {{ submittingTimeClaim ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Time Claim: Service Correction modal -->
  <div v-if="showTimeCorrectionModal" class="modal-backdrop" @click.self="closeTimeCorrectionModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Time Claim — Service Correction (Admin Override)</div>
          <div class="hint">Module 3C: Submit service correction.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeTimeCorrectionModal">Close</button>
      </div>

      <div v-if="submitTimeClaimError" class="warn-box" style="margin-top: 10px;">{{ submitTimeClaimError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Date</label>
          <input v-model="timeCorrectionForm.claimDate" type="date" />
        </div>
        <div class="field">
          <label>Client initials</label>
          <input v-model="timeCorrectionForm.clientInitials" type="text" placeholder="e.g., AB" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Original service</label>
          <input v-model="timeCorrectionForm.originalService" type="text" placeholder="What was recorded?" />
        </div>
        <div class="field">
          <label>Corrected service</label>
          <input v-model="timeCorrectionForm.correctedService" type="text" placeholder="What should it be?" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Duration</label>
          <input v-model="timeCorrectionForm.duration" type="text" placeholder="e.g., 45 min" />
        </div>
        <div class="field">
          <label>Reason</label>
          <input v-model="timeCorrectionForm.reason" type="text" placeholder="Why is a correction needed?" />
        </div>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="timeCorrectionForm.attestation" type="checkbox" />
        <span>I certify that the information is accurate, complete, and in compliance with the workplace handbook.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitTimeCorrection" :disabled="submittingTimeClaim">
          {{ submittingTimeClaim ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>

  <!-- Time Claim: Overtime Evaluation modal -->
  <div v-if="showTimeOvertimeModal" class="modal-backdrop" @click.self="closeTimeOvertimeModal">
    <div class="modal" style="width: min(720px, 100%);">
      <div class="modal-header">
        <div>
          <div class="modal-title">Time Claim — Overtime Evaluation (Admin Override)</div>
          <div class="hint">Module 3D: Overtime evaluation.</div>
        </div>
        <button class="btn btn-secondary btn-sm" @click="closeTimeOvertimeModal">Close</button>
      </div>

      <div v-if="submitTimeClaimError" class="warn-box" style="margin-top: 10px;">{{ submitTimeClaimError }}</div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Week of (date)</label>
          <input v-model="timeOvertimeForm.claimDate" type="date" />
        </div>
        <div class="field">
          <label>Worked over 12 hours in a day?</label>
          <select v-model="timeOvertimeForm.workedOver12Hours">
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </select>
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Dates and hours (required)</label>
        <textarea v-model="timeOvertimeForm.datesAndHours" rows="3" placeholder="List dates and hours worked…"></textarea>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Estimated workweek hours</label>
          <input v-model="timeOvertimeForm.estimatedWorkweekHours" type="number" min="0" step="0.1" />
        </div>
        <div class="field">
          <label>All direct service recorded?</label>
          <select v-model="timeOvertimeForm.allDirectServiceRecorded">
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </select>
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr;">
        <div class="field">
          <label>Overtime approved?</label>
          <select v-model="timeOvertimeForm.overtimeApproved">
            <option :value="true">Yes</option>
            <option :value="false">No</option>
          </select>
        </div>
        <div class="field">
          <label>Approved by (required)</label>
          <input v-model="timeOvertimeForm.approvedBy" type="text" placeholder="Name or email" />
        </div>
      </div>

      <div class="field" style="margin-top: 10px;">
        <label>Notes for payroll (required)</label>
        <textarea v-model="timeOvertimeForm.notesForPayroll" rows="3" placeholder="Any context for payroll…"></textarea>
      </div>

      <div v-if="isOfficeStaff" class="card" style="margin-top: 12px;">
        <h4 style="margin: 0 0 8px 0;">Holiday pay (office staff only)</h4>
        <div class="hint" style="margin-bottom: 8px;">Request pay for {{ userName || `User #${userId}` }} working on an approved agency holiday.</div>
        <label class="control" style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
          <input v-model="timeOvertimeForm.requestHolidayPay" type="checkbox" />
          <span>Request holiday pay (worked on approved holiday)</span>
        </label>
        <div v-if="timeOvertimeForm.requestHolidayPay" class="field-row" style="grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="field">
            <label>Holiday date</label>
            <select v-model="timeOvertimeForm.holidayDate">
              <option value="">Select approved holiday…</option>
              <option v-for="h in agencyHolidays" :key="h.holiday_date" :value="String(h.holiday_date || '').slice(0, 10)">
                {{ String(h.holiday_date || '').slice(0, 10) }} — {{ h.name || 'Holiday' }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>Hours worked</label>
            <input v-model.number="timeOvertimeForm.holidayHoursWorked" type="number" step="0.25" min="0" placeholder="e.g., 4" />
          </div>
        </div>
      </div>

      <label class="control" style="margin-top: 10px; display: flex; gap: 10px; align-items: center;">
        <input v-model="timeOvertimeForm.attestation" type="checkbox" />
        <span>I certify that the information is accurate, complete, and in compliance with the workplace handbook.</span>
      </label>

      <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
        <button class="btn btn-primary" @click="submitTimeOvertime" :disabled="submittingTimeClaim">
          {{ submittingTimeClaim ? 'Submitting…' : 'Submit for approval' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import api from '../../services/api';
import { useAuthStore } from '../../store/auth';

const props = defineProps({
  agencyId: { type: Number, required: false, default: null },
  userId: { type: Number, required: false, default: null },
  userName: { type: String, required: false, default: '' },
  userRole: { type: String, required: false, default: '' },
  userMedcancelRateSchedule: { type: [String, null], required: false, default: null }
});

const OFFICE_STAFF_ROLES = ['staff', 'admin', 'support', 'clinical_practice_assistant', 'supervisor'];
const isOfficeStaff = computed(() => {
  const r = String(props.userRole || '').trim().toLowerCase();
  return OFFICE_STAFF_ROLES.includes(r);
});

const authStore = useAuthStore();

const submitSuccess = ref('');
const sessionSubmissions = ref([]); // [{ ts, type, details, id }]

const clearSessionSubmissions = () => {
  sessionSubmissions.value = [];
};

const fmtTsLocal = (iso) => {
  try {
    const d = new Date(String(iso || ''));
    if (Number.isNaN(d.getTime())) return String(iso || '');
    return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(iso || '');
  }
};

const pushSessionSubmission = ({ type, details = '', id = null }) => {
  const entry = {
    ts: new Date().toISOString(),
    type: String(type || '').trim() || 'Submission',
    details: String(details || '').trim(),
    id: (id === null || id === undefined || id === '') ? null : String(id)
  };
  sessionSubmissions.value = [...(sessionSubmissions.value || []), entry];
};

const showMileageModal = ref(false);
const showMedcancelModal = ref(false);
const showReimbursementModal = ref(false);
const showCompanyCardExpenseModal = ref(false);
const showTimeMeetingModal = ref(false);
const showTimeExcessModal = ref(false);
const showTimeCorrectionModal = ref(false);
const showTimeOvertimeModal = ref(false);
const showPtoChooser = ref(false);
const showPtoSickModal = ref(false);
const showPtoTrainingModal = ref(false);

const submittingMileage = ref(false);
const submittingMedcancel = ref(false);
const submittingReimbursement = ref(false);
const submittingCompanyCardExpense = ref(false);
const submittingTimeClaim = ref(false);
const submittingPtoRequest = ref(false);

const submitMileageError = ref('');
const submitMedcancelError = ref('');
const submitReimbursementError = ref('');
const submitCompanyCardExpenseError = ref('');
const submitTimeClaimError = ref('');
const submitPtoError = ref('');

const mileageSchools = ref([]);
const mileageOffices = ref([]);
const mileageAssignedOffices = ref([]);
const schoolTravelManualMilesMode = ref(false);
const mileageQueuedClaims = ref([]); // queued mileage form snapshots (same claimType as current)

const mileageForm = ref({
  claimType: 'school_travel',
  driveDate: '',
  schoolOrganizationId: null,
  officeLocationId: null,
  tierLevel: null,
  miles: '',
  roundTrip: false,
  startLocation: '',
  endLocation: '',
  notes: '',
  tripApprovedBy: '',
  tripPreapproved: null,
  tripPurpose: '',
  costCenter: '',
  attestation: false,
  homeStreetAddress: '',
  homeCity: '',
  homeState: '',
  homePostalCode: ''
});
const mileageOfficeOptions = computed(() => {
  const assigned = Array.isArray(mileageAssignedOffices.value) ? mileageAssignedOffices.value : [];
  if (assigned.length) return assigned;
  return Array.isArray(mileageOffices.value) ? mileageOffices.value : [];
});
const selectedMileageOffice = computed(() => {
  const id = Number(mileageForm.value.officeLocationId || 0);
  if (!id) return null;
  return mileageOfficeOptions.value.find((o) => Number(o?.id) === id) || null;
});

const lastLoadedHomeAddress = ref({ homeStreetAddress: '', homeCity: '', homeState: '', homePostalCode: '' });
const editingHomeAddress = ref(false);
const savingHomeAddress = ref(false);

const hasHomeAddress = computed(() => {
  const s = String(mileageForm.value.homeStreetAddress || '').trim();
  const c = String(mileageForm.value.homeCity || '').trim();
  const st = String(mileageForm.value.homeState || '').trim();
  const z = String(mileageForm.value.homePostalCode || '').trim();
  return Boolean(s && c && st && z);
});

const medcancelForm = ref({
  claimDate: '',
  schoolOrganizationId: null,
  items: [{ missedServiceCode: '90832', clientInitials: '', sessionTime: '', note: '', attestation: false }]
});
const medcancelQueuedClaims = ref([]); // [{ claimDate, schoolOrganizationId, items }]

const medcancelPolicyLoading = ref(false);
const medcancelPolicy = ref(null); // { policy: { serviceCode, schedules: { low, high } } }
const loadMedcancelPolicy = async () => {
  if (!props.agencyId) return;
  try {
    medcancelPolicyLoading.value = true;
    const resp = await api.get('/payroll/medcancel-policy', { params: { agencyId: props.agencyId } });
    medcancelPolicy.value = resp.data || null;
  } catch {
    medcancelPolicy.value = null;
  } finally {
    medcancelPolicyLoading.value = false;
  }
};

const normalizeMedcancelSchedule = (v) => {
  const s = String(v || '').trim().toLowerCase();
  return (s === 'low' || s === 'high' || s === 'none') ? s : 'none';
};

const medcancelEstimatedAmount = computed(() => {
  const schedule = normalizeMedcancelSchedule(props.userMedcancelRateSchedule);
  const items = Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items : [];
  const pol = medcancelPolicy.value?.policy || null;
  const scheduleRates =
    schedule === 'high'
      ? (pol?.schedules?.high || {})
      : (schedule === 'low' ? (pol?.schedules?.low || {}) : {});
  let sum = 0;
  for (const it of items) {
    const code = String(it?.missedServiceCode || '').trim();
    sum += Number(scheduleRates?.[code] || 0);
  }
  sum = Math.round(sum * 100) / 100;
  return Number.isFinite(sum) ? sum : 0;
});

const estimateMedcancelAmountForClaim = (claim) => {
  const schedule = normalizeMedcancelSchedule(props.userMedcancelRateSchedule);
  const pol = medcancelPolicy.value?.policy || null;
  const scheduleRates =
    schedule === 'high'
      ? (pol?.schedules?.high || {})
      : (schedule === 'low' ? (pol?.schedules?.low || {}) : {});
  const items = Array.isArray(claim?.items) ? claim.items : [];
  let sum = 0;
  for (const it of items) {
    const code = String(it?.missedServiceCode || it?.missed_service_code || '').trim();
    sum += Number(scheduleRates?.[code] || 0);
  }
  sum = Math.round(sum * 100) / 100;
  return Number.isFinite(sum) ? sum : 0;
};

const medcancelDisplayName = computed(() => {
  const name = medcancelPolicy.value?.policy?.displayName;
  return String(name || 'Med Cancel').trim() || 'Med Cancel';
});

const queueCurrentMedcancelClaim = () => {
  const schedule = normalizeMedcancelSchedule(props.userMedcancelRateSchedule);
  if (schedule !== 'low' && schedule !== 'high') {
    submitMedcancelError.value = 'This provider is not enabled for Med Cancel (schedule is None).';
    return false;
  }
  const items = Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items : [];
  if (!items.length) {
    submitMedcancelError.value = 'Add at least one missed service.';
    return false;
  }
  for (const it of items) {
    if (!String(it.missedServiceCode || '').trim()) { submitMedcancelError.value = 'Each missed service requires a code.'; return false; }
    if (!String(it.clientInitials || '').trim()) { submitMedcancelError.value = 'Each missed service requires client initials.'; return false; }
    if (!String(it.sessionTime || '').trim()) { submitMedcancelError.value = 'Each missed service requires the session time.'; return false; }
    if (!String(it.note || '').trim()) { submitMedcancelError.value = 'Each missed service requires a note.'; return false; }
    if (!it.attestation) { submitMedcancelError.value = 'Each missed service requires attestation.'; return false; }
  }
  const snapshot = JSON.parse(JSON.stringify({
    claimDate: medcancelForm.value.claimDate,
    schoolOrganizationId: medcancelForm.value.schoolOrganizationId,
    items
  }));
  medcancelQueuedClaims.value = [...(medcancelQueuedClaims.value || []), snapshot];
  return true;
};

const removeQueuedMedcancelClaim = (idx) => {
  const next = (medcancelQueuedClaims.value || []).slice();
  next.splice(idx, 1);
  medcancelQueuedClaims.value = next;
};

const todayYmd = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const queueMedcancelAndReset = () => {
  submitMedcancelError.value = '';
  if (!queueCurrentMedcancelClaim()) return;
  medcancelForm.value = {
    claimDate: todayYmd(),
    schoolOrganizationId: null,
    items: [{ missedServiceCode: '90832', clientInitials: '', sessionTime: '', note: '', attestation: false }]
  };
};

const reimbursementForm = ref({
  expenseDate: '',
  amount: '',
  paymentMethod: null,
  vendor: '',
  purchaseApprovedBy: '',
  purchasePreapproved: null,
  projectRef: '',
  reason: '',
  splits: [{ category: '', amount: '' }],
  notes: '',
  attestation: false,
  receiptFile: null,
  receiptName: ''
});

const companyCardExpenseForm = ref({
  expenseDate: '',
  amount: '',
  paymentMethod: 'company_card',
  vendor: '',
  supervisorName: '',
  projectRef: '',
  splits: [{ category: '', amount: '' }],
  purpose: '',
  notes: '',
  attestation: false,
  receiptFile: null,
  receiptName: ''
});

const timeMeetingForm = ref({
  claimDate: '',
  meetingType: 'Admin Update Meeting',
  otherMeeting: '',
  startTime: '',
  endTime: '',
  totalMinutes: '',
  platform: 'Google Meet',
  summary: '',
  attestation: false
});

const timeExcessForm = ref({
  claimDate: '',
  items: [{ serviceCode: '', directMinutes: 0, indirectMinutes: 0 }],
  reason: '',
  attestation: false
});

const excessRules = ref([]);
const excessRulesLoading = ref(false);
const excessRuleByCode = computed(() => {
  const map = {};
  for (const r of excessRules.value) {
    map[r.service_code] = r;
  }
  return map;
});
const hasValidExcessItems = computed(() => {
  const items = timeExcessForm.value.items || [];
  return items.some(
    (it) =>
      it.serviceCode &&
      (Number(it.directMinutes || 0) > 0 || Number(it.indirectMinutes || 0) > 0)
  );
});

const addExcessItem = () => {
  timeExcessForm.value.items = [...(timeExcessForm.value.items || []), { serviceCode: '', directMinutes: 0, indirectMinutes: 0 }];
};
const removeExcessItem = (idx) => {
  const items = [...(timeExcessForm.value.items || [])];
  if (items.length <= 1) return;
  items.splice(idx, 1);
  timeExcessForm.value.items = items;
};

const timeCorrectionForm = ref({
  claimDate: '',
  clientInitials: '',
  originalService: '',
  correctedService: '',
  duration: '',
  reason: '',
  attestation: false
});

const timeOvertimeForm = ref({
  claimDate: '',
  workedOver12Hours: false,
  datesAndHours: '',
  estimatedWorkweekHours: '',
  allDirectServiceRecorded: true,
  overtimeApproved: false,
  approvedBy: '',
  notesForPayroll: '',
  requestHolidayPay: false,
  holidayDate: '',
  holidayHoursWorked: 0,
  attestation: false
});

const agencyHolidays = ref([]);

const ptoPolicy = ref(null);
const ptoAccount = ref(null);
const ptoBalances = ref({ sickHours: 0, trainingHours: 0 });
const ptoSickForm = ref({ items: [{ date: '', hours: '' }], notes: '', attestation: false });
const ptoTrainingForm = ref({ items: [{ date: '', hours: '' }], description: '', notes: '', proofFile: null, proofName: '', attestation: false });

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const apiBase = computed(() => (props.userId ? `/payroll/users/${props.userId}` : '/payroll/users/0'));

watch(
  () => `${props.agencyId || ''}:${props.userId || ''}`,
  () => {
    // Treat switching provider/org as a new "session" for the on-behalf flow.
    submitSuccess.value = '';
    sessionSubmissions.value = [];
  }
);

const loadMileageSchools = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    // Use the provider's assigned schools so distance calculation uses the right Home↔School baseline.
    const resp = await api.get(`${apiBase.value}/assigned-schools`, { params: { agencyId: props.agencyId } });
    mileageSchools.value = resp.data || [];
  } catch {
    mileageSchools.value = [];
  }
};

const loadMileageOffices = async () => {
  if (!props.agencyId) return;
  try {
    const resp = await api.get('/payroll/office-locations', { params: { agencyId: props.agencyId } });
    mileageOffices.value = resp.data || [];
  } catch {
    mileageOffices.value = [];
  }
};

const loadMileageAssignedOffices = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    const resp = await api.get(`${apiBase.value}/assigned-offices`, { params: { agencyId: props.agencyId } });
    mileageAssignedOffices.value = resp.data || [];
  } catch {
    mileageAssignedOffices.value = [];
  }
};

const loadUserHomeAddress = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    const resp = await api.get(`${apiBase.value}/home-address`, { params: { agencyId: props.agencyId } });
    const d = resp.data || {};
    mileageForm.value.homeStreetAddress = d.homeStreetAddress || '';
    mileageForm.value.homeCity = d.homeCity || '';
    mileageForm.value.homeState = d.homeState || '';
    mileageForm.value.homePostalCode = d.homePostalCode || '';

    lastLoadedHomeAddress.value = {
      homeStreetAddress: mileageForm.value.homeStreetAddress || '',
      homeCity: mileageForm.value.homeCity || '',
      homeState: mileageForm.value.homeState || '',
      homePostalCode: mileageForm.value.homePostalCode || ''
    };

    if (mileageForm.value.claimType === 'school_travel') {
      editingHomeAddress.value = !hasHomeAddress.value;
    }
  } catch {
    // best-effort
  }
};

const cancelHomeAddressEdit = () => {
  mileageForm.value.homeStreetAddress = lastLoadedHomeAddress.value.homeStreetAddress || '';
  mileageForm.value.homeCity = lastLoadedHomeAddress.value.homeCity || '';
  mileageForm.value.homeState = lastLoadedHomeAddress.value.homeState || '';
  mileageForm.value.homePostalCode = lastLoadedHomeAddress.value.homePostalCode || '';
  editingHomeAddress.value = false;
};

const saveHomeAddress = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    savingHomeAddress.value = true;
    await api.put(
      `${apiBase.value}/home-address`,
      {
        homeStreetAddress: mileageForm.value.homeStreetAddress,
        homeCity: mileageForm.value.homeCity,
        homeState: mileageForm.value.homeState,
        homePostalCode: mileageForm.value.homePostalCode
      },
      { params: { agencyId: props.agencyId } }
    );
    lastLoadedHomeAddress.value = {
      homeStreetAddress: mileageForm.value.homeStreetAddress || '',
      homeCity: mileageForm.value.homeCity || '',
      homeState: mileageForm.value.homeState || '',
      homePostalCode: mileageForm.value.homePostalCode || ''
    };
    editingHomeAddress.value = false;
  } catch (e) {
    submitMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to save home address';
  } finally {
    savingHomeAddress.value = false;
  }
};

const openMileageModal = async (claimType = 'school_travel') => {
  if (!props.agencyId || !props.userId) return;
  submitMileageError.value = '';
  schoolTravelManualMilesMode.value = false;
  await Promise.all([loadMileageSchools(), loadMileageOffices(), loadMileageAssignedOffices()]);
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  mileageForm.value = {
    ...mileageForm.value,
    claimType: String(claimType || 'school_travel'),
    driveDate: ymd,
    schoolOrganizationId: null,
    officeLocationId: null,
    tierLevel: null,
    roundTrip: false,
    startLocation: '',
    endLocation: '',
    notes: '',
    tripApprovedBy: '',
    tripPreapproved: null,
    tripPurpose: '',
    costCenter: '',
    attestation: false
  };
  if (String(claimType || 'school_travel') === 'school_travel') {
    const assigned = Array.isArray(mileageAssignedOffices.value) ? mileageAssignedOffices.value : [];
    if (assigned.length) {
      const primary = assigned.find((o) => Boolean(o?.isPrimary || o?.is_primary || o?.isPrimaryAssigned));
      mileageForm.value.officeLocationId = Number(primary?.id || assigned[0]?.id || 0) || null;
    }
  }
  await loadUserHomeAddress();
  showMileageModal.value = true;
};

const snapshotMileageForm = () =>
  JSON.parse(JSON.stringify({
    claimType: mileageForm.value.claimType || 'school_travel',
    driveDate: mileageForm.value.driveDate,
    schoolOrganizationId: mileageForm.value.schoolOrganizationId,
    officeLocationId: mileageForm.value.officeLocationId,
    tierLevel: mileageForm.value.tierLevel,
    miles: mileageForm.value.miles,
    roundTrip: !!mileageForm.value.roundTrip,
    startLocation: mileageForm.value.startLocation,
    endLocation: mileageForm.value.endLocation,
    notes: mileageForm.value.notes,
    tripApprovedBy: mileageForm.value.tripApprovedBy,
    tripPreapproved: mileageForm.value.tripPreapproved,
    tripPurpose: mileageForm.value.tripPurpose,
    costCenter: mileageForm.value.costCenter,
    attestation: !!mileageForm.value.attestation
  }));

const validateMileageSnapshot = (snap) => {
  const claimType = String(snap?.claimType || 'school_travel').trim().toLowerCase();
  const driveDate = String(snap?.driveDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(driveDate)) return 'Drive date is required.';
  if (!snap?.attestation) return 'Attestation is required.';

  if (claimType === 'school_travel') {
    if (!hasHomeAddress.value && !(schoolTravelManualMilesMode.value && String(snap?.miles || '').trim() !== '')) {
      return 'Home address is required for School Mileage. Click “Enter home address” and save it first.';
    }
    if (!snap?.schoolOrganizationId) return 'School is required for School Mileage.';
    if (!snap?.officeLocationId) return 'Office is required for School Mileage.';
    // Optional: allow manual miles if auto unavailable; if provided, must be valid.
    if (snap?.miles !== null && snap?.miles !== undefined && String(snap.miles).trim() !== '') {
      const n = Number(snap.miles);
      if (!Number.isFinite(n) || n < 0) return 'Enter a non-negative number of miles.';
    }
    if (snap?.tierLevel !== null && snap?.tierLevel !== undefined && snap?.tierLevel !== '') {
      const t = Number(snap.tierLevel);
      if (![1, 2, 3].includes(t)) return 'Tier must be 1, 2, 3, or blank.';
    }
    return null;
  }

  // Other Mileage
  const miles = Number(snap?.miles || 0);
  if (!Number.isFinite(miles) || miles < 0) return 'Miles must be a non-negative number.';
  if (!String(snap?.tripApprovedBy || '').trim()) return 'Trip approver is required for Other Mileage.';
  if (snap?.tripPreapproved !== true && snap?.tripPreapproved !== false) return 'Please select whether the trip was pre-approved.';
  if (!String(snap?.tripPurpose || '').trim()) return 'Trip purpose is required for Other Mileage.';
  return null;
};

const queueMileageAndReset = () => {
  submitMileageError.value = '';
  const snap = snapshotMileageForm();
  const err = validateMileageSnapshot(snap);
  if (err) {
    submitMileageError.value = err;
    return;
  }
  mileageQueuedClaims.value = [...(mileageQueuedClaims.value || []), snap];

  // Reset for next entry (keep claim type)
  const nextDate = todayYmd();
  mileageForm.value = {
    ...mileageForm.value,
    driveDate: nextDate,
    schoolOrganizationId: null,
    officeLocationId: null,
    tierLevel: null,
    miles: '',
    roundTrip: false,
    startLocation: '',
    endLocation: '',
    notes: '',
    tripApprovedBy: '',
    tripPreapproved: null,
    tripPurpose: '',
    costCenter: '',
    attestation: false
  };
};

const removeQueuedMileageClaim = (idx) => {
  const next = (mileageQueuedClaims.value || []).slice();
  next.splice(idx, 1);
  mileageQueuedClaims.value = next;
};

const closeMileageModal = () => {
  showMileageModal.value = false;
  editingHomeAddress.value = false;
  schoolTravelManualMilesMode.value = false;
  mileageQueuedClaims.value = [];
};

const submitMileage = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    submittingMileage.value = true;
    submitMileageError.value = '';

    const claimsToSend = [...(mileageQueuedClaims.value || []), snapshotMileageForm()];
    for (const c of claimsToSend) {
      const err = validateMileageSnapshot(c);
      if (err) {
        submitMileageError.value = err;
        return;
      }
    }

    let sent = 0;
    for (const c of claimsToSend) {
      const resp = await api.post(`${apiBase.value}/mileage-claims`, {
        agencyId: props.agencyId,
        claimType: c.claimType || 'school_travel',
        driveDate: c.driveDate,
        schoolOrganizationId: c.schoolOrganizationId,
        officeLocationId: c.officeLocationId,
        tierLevel: c.tierLevel,
        miles: c.miles,
        roundTrip: !!c.roundTrip,
        startLocation: c.startLocation,
        endLocation: c.endLocation,
        notes: c.notes,
        tripApprovedBy: c.tripApprovedBy,
        tripPreapproved: c.tripPreapproved,
        tripPurpose: c.tripPurpose,
        costCenter: c.costCenter,
        attestation: !!c.attestation
      });
      sent += 1;
      const claimId = resp?.data?.claim?.id || resp?.data?.id || null;
      const ct = String(c.claimType || '').toLowerCase() === 'school_travel' ? 'School Mileage' : 'Other Mileage';
      const dt = String(c.driveDate || '').slice(0, 10);
      pushSessionSubmission({
        type: ct,
        details: ct === 'School Mileage'
          ? `Date ${dt} • School #${c.schoolOrganizationId || '—'} • Office #${c.officeLocationId || '—'}`
          : `Date ${dt} • Miles ${String(c.miles || '').trim() || '—'}`,
        id: claimId
      });
    }

    mileageQueuedClaims.value = [];
    showMileageModal.value = false;
    submitSuccess.value = sent > 1 ? `Mileage submissions sent successfully (${sent}).` : 'Mileage submission sent successfully.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to submit mileage';
    if (String(msg).includes('GOOGLE_MAPS_API_KEY')) {
      schoolTravelManualMilesMode.value = true;
      submitMileageError.value = 'Automatic mileage is unavailable right now. Enter eligible miles manually below and resubmit.';
      return;
    }
    submitMileageError.value = msg;
  } finally {
    submittingMileage.value = false;
  }
};

const openMedcancelModal = async () => {
  if (!props.agencyId || !props.userId) return;
  submitMedcancelError.value = '';
  await loadMileageSchools();
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  medcancelForm.value = {
    claimDate: ymd,
    schoolOrganizationId: null,
    items: [{ missedServiceCode: '90832', clientInitials: '', sessionTime: '', note: '', attestation: false }]
  };
  showMedcancelModal.value = true;
};
const closeMedcancelModal = () => { showMedcancelModal.value = false; };
const addMedcancelItem = () => {
  const next = Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items.slice() : [];
  next.push({ missedServiceCode: '90832', clientInitials: '', sessionTime: '', note: '', attestation: false });
  medcancelForm.value.items = next;
};
const removeMedcancelItem = (idx) => {
  const next = Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items.slice() : [];
  next.splice(idx, 1);
  medcancelForm.value.items = next;
};
const submitMedcancel = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    submittingMedcancel.value = true;
    submitMedcancelError.value = '';
    const schedule = normalizeMedcancelSchedule(props.userMedcancelRateSchedule);
    if (schedule !== 'low' && schedule !== 'high') {
      submitMedcancelError.value = 'This provider is not enabled for Med Cancel (schedule is None).';
      return;
    }

    const claimsToSend = [
      ...(medcancelQueuedClaims.value || []),
      {
        claimDate: medcancelForm.value.claimDate,
        schoolOrganizationId: medcancelForm.value.schoolOrganizationId,
        items: Array.isArray(medcancelForm.value.items) ? medcancelForm.value.items : []
      }
    ];

    const normalizeItems = (items) =>
      (items || []).map((it) => ({
        missedServiceCode: String(it.missedServiceCode || '').trim(),
        clientInitials: String(it.clientInitials || '').trim(),
        sessionTime: String(it.sessionTime || '').trim(),
        note: String(it.note || '').trim(),
        attestation: !!it.attestation
      }));

    // Validate all claims before sending (so you don't lose ordering mid-batch).
    for (const c of claimsToSend) {
      const items = Array.isArray(c.items) ? c.items : [];
      if (!items.length) {
        submitMedcancelError.value = 'Each queued date must include at least one missed service.';
        return;
      }
      for (const it of items) {
        if (!String(it.missedServiceCode || '').trim()) { submitMedcancelError.value = 'Each missed service requires a code.'; return; }
        if (!String(it.clientInitials || '').trim()) { submitMedcancelError.value = 'Each missed service requires client initials.'; return; }
        if (!String(it.sessionTime || '').trim()) { submitMedcancelError.value = 'Each missed service requires the session time.'; return; }
        if (!String(it.note || '').trim()) { submitMedcancelError.value = 'Each missed service requires a note.'; return; }
        if (!it.attestation) { submitMedcancelError.value = 'Each missed service requires attestation.'; return; }
      }
    }

    let sent = 0;
    for (const c of claimsToSend) {
      const items = Array.isArray(c.items) ? c.items : [];
      const resp = await api.post(`${apiBase.value}/medcancel-claims`, {
        agencyId: props.agencyId,
        claimDate: c.claimDate,
        schoolOrganizationId: c.schoolOrganizationId,
        items: normalizeItems(items)
      });
      sent += 1;
      const claimId = resp?.data?.claim?.id || resp?.data?.id || null;
      pushSessionSubmission({
        type: medcancelDisplayName.value,
        details: `Date ${String(c.claimDate || '').slice(0, 10)} • Items ${items.length}`,
        id: claimId
      });
    }

    medcancelQueuedClaims.value = [];
    showMedcancelModal.value = false;
    submitSuccess.value = sent > 1 ? `${medcancelDisplayName.value} submissions sent successfully (${sent}).` : `${medcancelDisplayName.value} submission sent successfully.`;
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
  } catch (e) {
    submitMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to submit MedCancel';
  } finally {
    submittingMedcancel.value = false;
  }
};

const openReimbursementModal = () => {
  if (!props.agencyId || !props.userId) return;
  submitReimbursementError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  reimbursementForm.value = {
    expenseDate: ymd,
    amount: '',
    paymentMethod: null,
    vendor: '',
    purchaseApprovedBy: '',
    purchasePreapproved: null,
    projectRef: '',
    reason: '',
    splits: [{ category: '', amount: '' }],
    notes: '',
    attestation: false,
    receiptFile: null,
    receiptName: ''
  };
  showReimbursementModal.value = true;
};
const closeReimbursementModal = () => { showReimbursementModal.value = false; };
const onReceiptPick = (e) => {
  const file = e?.target?.files?.[0] || null;
  reimbursementForm.value.receiptFile = file;
  reimbursementForm.value.receiptName = file?.name || '';
};
const submitReimbursement = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    submittingReimbursement.value = true;
    submitReimbursementError.value = '';

    const expenseDate = String(reimbursementForm.value.expenseDate || '').slice(0, 10);
    const amount = Number(reimbursementForm.value.amount || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      submitReimbursementError.value = 'Expense date is required.';
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      submitReimbursementError.value = 'Amount must be greater than 0.';
      return;
    }
    if (!String(reimbursementForm.value.paymentMethod || '').trim()) {
      submitReimbursementError.value = 'Payment method is required.';
      return;
    }
    if (!String(reimbursementForm.value.purchaseApprovedBy || '').trim()) {
      submitReimbursementError.value = 'Who approved this purchase is required.';
      return;
    }
    if (reimbursementForm.value.purchasePreapproved !== true && reimbursementForm.value.purchasePreapproved !== false) {
      submitReimbursementError.value = 'Please select whether the purchase was pre-approved.';
      return;
    }
    if (!String(reimbursementForm.value.reason || '').trim()) {
      submitReimbursementError.value = 'Reason is required.';
      return;
    }
    if (!String(reimbursementForm.value.notes || '').trim()) {
      submitReimbursementError.value = 'Notes are required.';
      return;
    }
    if (!reimbursementForm.value.receiptFile) {
      submitReimbursementError.value = 'Receipt file is required.';
      return;
    }
    if (!reimbursementForm.value.attestation) {
      submitReimbursementError.value = 'Attestation is required.';
      return;
    }

    const rawSplits = Array.isArray(reimbursementForm.value.splits) ? reimbursementForm.value.splits : [];
    const splits = rawSplits
      .map((s) => ({ category: String(s?.category || '').trim(), amount: Number(s?.amount || 0) }))
      .filter((s) => s.category && Number.isFinite(s.amount) && s.amount > 0);
    if (splits.length) {
      const sum = Math.round(splits.reduce((a, s) => a + Number(s.amount || 0), 0) * 100) / 100;
      const amt = Math.round(amount * 100) / 100;
      if (Math.abs(sum - amt) > 0.009) {
        submitReimbursementError.value = `Category splits must add up to ${amt.toFixed(2)}.`;
        return;
      }
    }

    const fd = new FormData();
    fd.append('agencyId', String(props.agencyId));
    fd.append('expenseDate', expenseDate);
    fd.append('amount', String(amount));
    fd.append('paymentMethod', String(reimbursementForm.value.paymentMethod || '').trim());
    if (String(reimbursementForm.value.vendor || '').trim()) fd.append('vendor', String(reimbursementForm.value.vendor || '').trim());
    fd.append('purchaseApprovedBy', String(reimbursementForm.value.purchaseApprovedBy || '').trim());
    fd.append('purchasePreapproved', reimbursementForm.value.purchasePreapproved ? '1' : '0');
    if (String(reimbursementForm.value.projectRef || '').trim()) fd.append('projectRef', String(reimbursementForm.value.projectRef || '').trim());
    fd.append('reason', String(reimbursementForm.value.reason || '').trim());
    if (splits.length) fd.append('splits', JSON.stringify(splits));
    fd.append('notes', String(reimbursementForm.value.notes || '').trim());
    fd.append('attestation', reimbursementForm.value.attestation ? '1' : '0');
    fd.append('receipt', reimbursementForm.value.receiptFile);

    const resp = await api.post(`${apiBase.value}/reimbursement-claims`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    showReimbursementModal.value = false;
    submitSuccess.value = 'Reimbursement submitted successfully.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    const claimId = resp?.data?.claim?.id || resp?.data?.id || null;
    pushSessionSubmission({
      type: 'Reimbursement',
      details: `Date ${expenseDate} • ${fmtMoney(amount)}`,
      id: claimId
    });
  } catch (e) {
    submitReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to submit reimbursement';
  } finally {
    submittingReimbursement.value = false;
  }
};

const openCompanyCardExpenseModal = () => {
  if (!props.agencyId || !props.userId) return;
  submitCompanyCardExpenseError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  companyCardExpenseForm.value = {
    expenseDate: ymd,
    amount: '',
    paymentMethod: 'company_card',
    vendor: '',
    supervisorName: '',
    projectRef: '',
    splits: [{ category: '', amount: '' }],
    purpose: '',
    notes: '',
    attestation: false,
    receiptFile: null,
    receiptName: ''
  };
  showCompanyCardExpenseModal.value = true;
};
const closeCompanyCardExpenseModal = () => { showCompanyCardExpenseModal.value = false; };
const onCompanyCardReceiptPick = (e) => {
  const file = e?.target?.files?.[0] || null;
  companyCardExpenseForm.value.receiptFile = file;
  companyCardExpenseForm.value.receiptName = file?.name || '';
};
const submitCompanyCardExpense = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    submittingCompanyCardExpense.value = true;
    submitCompanyCardExpenseError.value = '';

    const expenseDate = String(companyCardExpenseForm.value.expenseDate || '').slice(0, 10);
    const amount = Number(companyCardExpenseForm.value.amount || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      submitCompanyCardExpenseError.value = 'Expense date is required.';
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      submitCompanyCardExpenseError.value = 'Amount must be greater than 0.';
      return;
    }
    if (!String(companyCardExpenseForm.value.supervisorName || '').trim()) {
      submitCompanyCardExpenseError.value = 'Supervisor / approver is required.';
      return;
    }
    if (!String(companyCardExpenseForm.value.purpose || '').trim()) {
      submitCompanyCardExpenseError.value = 'Reason / purpose is required.';
      return;
    }
    if (!String(companyCardExpenseForm.value.notes || '').trim()) {
      submitCompanyCardExpenseError.value = 'Notes are required.';
      return;
    }
    if (!companyCardExpenseForm.value.receiptFile) {
      submitCompanyCardExpenseError.value = 'Receipt file is required.';
      return;
    }
    if (!companyCardExpenseForm.value.attestation) {
      submitCompanyCardExpenseError.value = 'Attestation is required.';
      return;
    }

    const rawSplits = Array.isArray(companyCardExpenseForm.value.splits) ? companyCardExpenseForm.value.splits : [];
    const splits = rawSplits
      .map((s) => ({ category: String(s?.category || '').trim(), amount: Number(s?.amount || 0) }))
      .filter((s) => s.category && Number.isFinite(s.amount) && s.amount > 0);
    if (splits.length) {
      const sum = Math.round(splits.reduce((a, s) => a + Number(s.amount || 0), 0) * 100) / 100;
      const amt = Math.round(amount * 100) / 100;
      if (Math.abs(sum - amt) > 0.009) {
        submitCompanyCardExpenseError.value = `Category splits must add up to ${amt.toFixed(2)}.`;
        return;
      }
    }

    const fd = new FormData();
    fd.append('agencyId', String(props.agencyId));
    fd.append('expenseDate', expenseDate);
    fd.append('amount', String(amount));
    fd.append('paymentMethod', 'company_card');
    if (String(companyCardExpenseForm.value.vendor || '').trim()) fd.append('vendor', String(companyCardExpenseForm.value.vendor || '').trim());
    fd.append('supervisorName', String(companyCardExpenseForm.value.supervisorName || '').trim());
    if (String(companyCardExpenseForm.value.projectRef || '').trim()) fd.append('projectRef', String(companyCardExpenseForm.value.projectRef || '').trim());
    fd.append('purpose', String(companyCardExpenseForm.value.purpose || '').trim());
    if (splits.length) fd.append('splits', JSON.stringify(splits));
    fd.append('notes', String(companyCardExpenseForm.value.notes || '').trim());
    fd.append('attestation', companyCardExpenseForm.value.attestation ? '1' : '0');
    fd.append('receipt', companyCardExpenseForm.value.receiptFile);

    const resp = await api.post(`${apiBase.value}/company-card-expenses`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    showCompanyCardExpenseModal.value = false;
    submitSuccess.value = 'Company card expense submitted successfully.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    const expenseId = resp?.data?.expense?.id || resp?.data?.id || null;
    pushSessionSubmission({
      type: 'Company card expense',
      details: `Date ${expenseDate} • ${fmtMoney(amount)} • ${String(companyCardExpenseForm.value.vendor || '').trim() || '—'}`,
      id: expenseId
    });
  } catch (e) {
    submitCompanyCardExpenseError.value = e.response?.data?.error?.message || e.message || 'Failed to submit company card expense';
  } finally {
    submittingCompanyCardExpense.value = false;
  }
};

const submitTimeClaim = async ({ claimType, claimDate, payload }) => {
  if (!props.agencyId || !props.userId) return;
  try {
    submittingTimeClaim.value = true;
    submitTimeClaimError.value = '';
    const resp = await api.post(`${apiBase.value}/time-claims`, {
      agencyId: props.agencyId,
      claimType,
      claimDate,
      payload
    });
    submitSuccess.value = 'Time claim submitted successfully.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    const claimId = resp?.data?.claim?.id || resp?.data?.id || null;
    const typeLabel = String(claimType || '').trim() ? String(claimType).replace(/_/g, ' ') : 'time claim';
    pushSessionSubmission({
      type: `Time claim (${typeLabel})`,
      details: claimDate ? `Date ${String(claimDate).slice(0, 10)}` : '',
      id: claimId
    });
  } catch (e) {
    submitTimeClaimError.value = e.response?.data?.error?.message || e.message || 'Failed to submit time claim';
  } finally {
    submittingTimeClaim.value = false;
  }
};

const openTimeMeetingModal = () => {
  if (!props.agencyId || !props.userId) return;
  submitTimeClaimError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  timeMeetingForm.value = {
    claimDate: ymd,
    meetingType: 'Admin Update Meeting',
    otherMeeting: '',
    startTime: '',
    endTime: '',
    totalMinutes: '',
    platform: 'Google Meet',
    summary: '',
    attestation: false
  };
  showTimeMeetingModal.value = true;
};
const closeTimeMeetingModal = () => { showTimeMeetingModal.value = false; };
const submitTimeMeeting = async () => {
  await submitTimeClaim({
    claimType: 'meeting_training',
    claimDate: timeMeetingForm.value.claimDate,
    payload: {
      meetingType: timeMeetingForm.value.meetingType,
      otherMeeting: timeMeetingForm.value.otherMeeting,
      startTime: timeMeetingForm.value.startTime,
      endTime: timeMeetingForm.value.endTime,
      totalMinutes: Number(timeMeetingForm.value.totalMinutes || 0),
      platform: timeMeetingForm.value.platform,
      summary: timeMeetingForm.value.summary,
      attestation: !!timeMeetingForm.value.attestation
    }
  });
  if (!submitTimeClaimError.value) closeTimeMeetingModal();
};

const loadExcessRules = async () => {
  if (!props.agencyId) return;
  excessRulesLoading.value = true;
  try {
    const resp = await api.get('/payroll/excess-compensation-rules', { params: { agencyId: props.agencyId } });
    excessRules.value = Array.isArray(resp?.data) ? resp.data : [];
  } catch {
    excessRules.value = [];
  } finally {
    excessRulesLoading.value = false;
  }
};

const loadAgencyHolidays = async () => {
  if (!props.agencyId) return;
  try {
    const resp = await api.get('/payroll/holidays', { params: { agencyId: props.agencyId } });
    agencyHolidays.value = Array.isArray(resp?.data?.holidays) ? resp.data.holidays : [];
  } catch {
    agencyHolidays.value = [];
  }
};

const openTimeExcessModal = () => {
  if (!props.agencyId || !props.userId) return;
  submitTimeClaimError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  timeExcessForm.value = {
    claimDate: ymd,
    items: [{ serviceCode: '', directMinutes: 0, indirectMinutes: 0 }],
    reason: '',
    attestation: false
  };
  showTimeExcessModal.value = true;
  loadExcessRules();
};
const closeTimeExcessModal = () => { showTimeExcessModal.value = false; };
const submitTimeExcess = async () => {
  const items = (timeExcessForm.value.items || [])
    .filter((it) => it.serviceCode && (Number(it.directMinutes || 0) > 0 || Number(it.indirectMinutes || 0) > 0))
    .map((it) => ({
      serviceCode: it.serviceCode,
      directMinutes: Number(it.directMinutes || 0),
      indirectMinutes: Number(it.indirectMinutes || 0)
    }));
  await submitTimeClaim({
    claimType: 'excess_holiday',
    claimDate: timeExcessForm.value.claimDate,
    payload: {
      items,
      reason: timeExcessForm.value.reason,
      attestation: !!timeExcessForm.value.attestation
    }
  });
  if (!submitTimeClaimError.value) closeTimeExcessModal();
};

const openTimeCorrectionModal = () => {
  if (!props.agencyId || !props.userId) return;
  submitTimeClaimError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  timeCorrectionForm.value = { claimDate: ymd, clientInitials: '', originalService: '', correctedService: '', duration: '', reason: '', attestation: false };
  showTimeCorrectionModal.value = true;
};
const closeTimeCorrectionModal = () => { showTimeCorrectionModal.value = false; };
const submitTimeCorrection = async () => {
  await submitTimeClaim({
    claimType: 'service_correction',
    claimDate: timeCorrectionForm.value.claimDate,
    payload: {
      clientInitials: timeCorrectionForm.value.clientInitials,
      originalService: timeCorrectionForm.value.originalService,
      correctedService: timeCorrectionForm.value.correctedService,
      duration: timeCorrectionForm.value.duration,
      reason: timeCorrectionForm.value.reason,
      attestation: !!timeCorrectionForm.value.attestation
    }
  });
  if (!submitTimeClaimError.value) closeTimeCorrectionModal();
};

const openTimeOvertimeModal = () => {
  if (!props.agencyId || !props.userId) return;
  submitTimeClaimError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  timeOvertimeForm.value = {
    claimDate: ymd,
    workedOver12Hours: false,
    datesAndHours: '',
    estimatedWorkweekHours: '',
    allDirectServiceRecorded: true,
    overtimeApproved: false,
    approvedBy: '',
    notesForPayroll: '',
    requestHolidayPay: false,
    holidayDate: '',
    holidayHoursWorked: 0,
    attestation: false
  };
  showTimeOvertimeModal.value = true;
  if (isOfficeStaff.value) loadAgencyHolidays();
};
const closeTimeOvertimeModal = () => { showTimeOvertimeModal.value = false; };
const submitTimeOvertime = async () => {
  await submitTimeClaim({
    claimType: 'overtime_evaluation',
    claimDate: timeOvertimeForm.value.claimDate,
    payload: {
      workedOver12Hours: !!timeOvertimeForm.value.workedOver12Hours,
      datesAndHours: timeOvertimeForm.value.datesAndHours,
      estimatedWorkweekHours: Number(timeOvertimeForm.value.estimatedWorkweekHours || 0),
      allDirectServiceRecorded: !!timeOvertimeForm.value.allDirectServiceRecorded,
      overtimeApproved: !!timeOvertimeForm.value.overtimeApproved,
      approvedBy: timeOvertimeForm.value.approvedBy,
      notesForPayroll: timeOvertimeForm.value.notesForPayroll,
      attestation: !!timeOvertimeForm.value.attestation
    }
  });
  if (submitTimeClaimError.value) return;

  const f = timeOvertimeForm.value;
  if (f.requestHolidayPay && f.holidayDate && Number(f.holidayHoursWorked || 0) > 0) {
    await submitTimeClaim({
      claimType: 'holiday_pay',
      claimDate: String(f.holidayDate).slice(0, 10),
      payload: {
        holidayDate: String(f.holidayDate).slice(0, 10),
        hoursWorked: Number(f.holidayHoursWorked || 0),
        attestation: !!f.attestation
      }
    });
  }

  if (!submitTimeClaimError.value) closeTimeOvertimeModal();
};

const loadPto = async () => {
  if (!props.agencyId || !props.userId) return;
  try {
    const resp = await api.get(`${apiBase.value}/pto-balances`, { params: { agencyId: props.agencyId } });
    ptoPolicy.value = resp.data?.policy || null;
    ptoAccount.value = resp.data?.account || null;
    ptoBalances.value = {
      sickHours: Number(resp.data?.balances?.sickHours || 0),
      trainingHours: Number(resp.data?.balances?.trainingHours || 0)
    };
  } catch (e) {
    submitPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to load PTO';
    ptoPolicy.value = null;
    ptoAccount.value = null;
    ptoBalances.value = { sickHours: 0, trainingHours: 0 };
  }
};

const openPtoChooserModal = async () => {
  if (!props.agencyId || !props.userId) return;
  submitPtoError.value = '';
  await loadPto();
  showPtoChooser.value = true;
};
const closePtoChooserModal = () => { showPtoChooser.value = false; };

const addPtoItem = (formRef) => {
  const next = Array.isArray(formRef.value.items) ? formRef.value.items.slice() : [];
  next.push({ date: '', hours: '' });
  formRef.value.items = next;
};
const removePtoItem = (formRef, idx) => {
  const next = Array.isArray(formRef.value.items) ? formRef.value.items.slice() : [];
  next.splice(idx, 1);
  formRef.value.items = next;
};

const openPtoSick = () => {
  submitPtoError.value = '';
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  ptoSickForm.value = { items: [{ date: ymd, hours: '' }], notes: '', attestation: false };
  showPtoChooser.value = false;
  showPtoSickModal.value = true;
};
const closePtoSick = () => { showPtoSickModal.value = false; };

const openPtoTraining = () => {
  submitPtoError.value = '';
  if (ptoPolicy.value?.trainingPtoEnabled !== true) {
    submitPtoError.value = 'Training PTO is disabled for this organization.';
    showPtoChooser.value = false;
    return;
  }
  if (!ptoAccount.value?.training_pto_eligible) {
    submitPtoError.value = 'Training PTO is not enabled for this account.';
    showPtoChooser.value = false;
    return;
  }
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  ptoTrainingForm.value = { items: [{ date: ymd, hours: '' }], description: '', notes: '', proofFile: null, proofName: '', attestation: false };
  showPtoChooser.value = false;
  showPtoTrainingModal.value = true;
};
const closePtoTraining = () => { showPtoTrainingModal.value = false; };
const onPtoProofPick = (e) => {
  const file = e?.target?.files?.[0] || null;
  ptoTrainingForm.value.proofFile = file;
  ptoTrainingForm.value.proofName = file?.name || '';
};

const submitPto = async ({ requestType, form }) => {
  if (!props.agencyId || !props.userId) return;
  try {
    submittingPtoRequest.value = true;
    submitPtoError.value = '';

    const items = (form.value.items || [])
      .map((it) => ({ date: String(it?.date || '').slice(0, 10), hours: Number(it?.hours || 0) }))
      .filter((it) => /^\d{4}-\d{2}-\d{2}$/.test(it.date) && Number.isFinite(it.hours) && it.hours > 0);

    if (!items.length) {
      submitPtoError.value = 'Add at least one PTO entry (date + hours).';
      return;
    }
    if (!form.value.attestation) {
      submitPtoError.value = 'Attestation is required.';
      return;
    }
    if (requestType === 'training') {
      if (!String(form.value.description || '').trim()) {
        submitPtoError.value = 'Training description is required.';
        return;
      }
      if (!form.value.proofFile) {
        submitPtoError.value = 'Proof upload is required for Training PTO.';
        return;
      }
    }

    const fd = new FormData();
    fd.append('agencyId', String(props.agencyId));
    fd.append('requestType', requestType);
    fd.append('items', JSON.stringify(items));
    if (String(form.value.notes || '').trim()) fd.append('notes', String(form.value.notes || '').trim());
    if (requestType === 'training') {
      fd.append('trainingDescription', String(form.value.description || '').trim());
      fd.append('proof', form.value.proofFile);
    }
    fd.append('policyAck', JSON.stringify({ attested: true }));

    const resp = await api.post(`${apiBase.value}/pto-requests`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });

    showPtoSickModal.value = false;
    showPtoTrainingModal.value = false;
    submitSuccess.value = 'PTO request submitted successfully.';
    window.setTimeout(() => { submitSuccess.value = ''; }, 5000);
    const reqId = resp?.data?.request?.id || resp?.data?.id || null;
    const typeLabel = requestType === 'training' ? 'Training PTO' : 'Sick PTO';
    const start = items?.[0]?.date || null;
    pushSessionSubmission({
      type: `PTO (${typeLabel})`,
      details: `${start ? `Starts ${String(start).slice(0, 10)} • ` : ''}Items ${items.length}`,
      id: reqId
    });
    await loadPto();
  } catch (e) {
    submitPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to submit PTO request';
  } finally {
    submittingPtoRequest.value = false;
  }
};
const submitPtoSick = async () => submitPto({ requestType: 'sick', form: ptoSickForm });
const submitPtoTraining = async () => submitPto({ requestType: 'training', form: ptoTrainingForm });

watch(
  () => [props.agencyId, props.userId],
  async () => {
    submitSuccess.value = '';
    submitMileageError.value = '';
    submitMedcancelError.value = '';
    submitReimbursementError.value = '';
    submitCompanyCardExpenseError.value = '';
    submitTimeClaimError.value = '';
    submitPtoError.value = '';
    if (!props.agencyId || !props.userId) return;
    await Promise.all([loadMileageSchools(), loadMileageOffices(), loadMileageAssignedOffices(), loadUserHomeAddress(), loadPto(), loadMedcancelPolicy()]);
  },
  { immediate: true }
);
</script>

