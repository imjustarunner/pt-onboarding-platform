<template>
  <div class="container">
    <div class="page-header" data-tour="payroll-header">
      <div>
        <h1 data-tour="payroll-title">Payroll</h1>
        <p class="subtitle">Upload your billing report. We’ll auto-detect the correct pay period (Sat→Fri, every 2 weeks).</p>
      </div>
    </div>

    <div class="org-bar" data-tour="payroll-org-bar">
      <div class="org-bar-left">
        <div class="org-bar-label">Organization</div>
        <div v-if="!showOrgPicker" class="org-bar-value">
          <strong>{{ agencyStore.currentAgency?.name || '—' }}</strong>
        </div>
        <div v-else class="org-bar-controls">
          <select v-model="selectedOrgId" :key="`org-bar-${(filteredAgencies || []).length}`">
            <option :value="null" disabled>Select an organization…</option>
            <option v-for="a in filteredAgencies" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
          <input v-model="orgSearch" type="text" placeholder="Search…" />
        </div>
      </div>
    </div>

    <div class="card wizard-hero" style="margin-bottom: 12px;" data-tour="payroll-wizard-hero">
      <div class="wizard-hero-head">
        <div>
          <h2 class="card-title" style="margin-bottom: 4px;">Payroll Wizard</h2>
          <div class="hint">
            Step-by-step guide for submitting payroll. Select a pay period here; it will drive the whole page.
          </div>
        </div>
      </div>

      <div class="wizard-hero-controls" data-tour="payroll-wizard-controls">
        <div class="field wizard-period" data-tour="payroll-period-picker">
          <label>Pay period</label>
          <select v-model="selectedPeriodId" :disabled="!agencyId || !(periods || []).length">
            <option :value="null" disabled>Select a pay period…</option>
            <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
          </select>
          <div class="hint" v-if="selectedPeriodForUi" style="margin-top: 6px;">
            Current: <strong>{{ periodRangeLabel(selectedPeriodForUi) }}</strong>
          </div>
        </div>

        <div class="wizard-cta" data-tour="payroll-open-wizard">
          <button class="btn btn-primary wizard-btn" type="button" @click="openPayrollWizard" :disabled="!selectedPeriodId">
            Open Payroll Wizard
          </button>
          <div class="hint" style="margin-top: 8px;">
            Saves progress as you go. Uses explicit “Save & exit” / “Don’t save & exit”.
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-box">{{ error }}</div>

    <!-- Global modals (must not be nested under Payroll Stage) -->
    <teleport to="body">
      <div v-if="showTodoModal" class="modal-backdrop">
        <div class="modal" style="width: min(920px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Payroll To‑Dos</div>
              <div class="hint">These block running payroll until marked Done.</div>
            </div>
            <div class="actions" style="margin: 0;">
              <button class="btn btn-secondary btn-sm" type="button" @click="showTodoModal = false">Close</button>
            </div>
          </div>

          <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
            <button class="btn btn-secondary btn-sm" type="button" @click="todoTab = 'period'">This pay period</button>
            <button class="btn btn-secondary btn-sm" type="button" @click="todoTab = 'templates'">Recurring templates</button>
          </div>

          <div v-if="todoTab === 'period'">
            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Add a To‑Do (single)</h3>
              <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
                <div class="field">
                  <label>Scope</label>
                  <select v-model="newTodoDraft.scope">
                    <option value="agency">Agency-wide</option>
                    <option value="provider">Per-provider</option>
                  </select>
                </div>
                <div v-if="newTodoDraft.scope === 'provider'" class="field">
                  <label>Provider</label>
                  <select v-model="newTodoDraft.targetUserId">
                    <option :value="null">Select provider…</option>
                    <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                  </select>
                </div>
              </div>
              <div class="field" style="margin-top: 10px;">
                <label>Title</label>
                <input v-model="newTodoDraft.title" type="text" placeholder="e.g., Verify X before running payroll" />
              </div>
              <div class="field" style="margin-top: 10px;">
                <label>Description (optional)</label>
                <textarea v-model="newTodoDraft.description" rows="3" placeholder="Optional details…" />
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-primary" type="button" @click="createTodoForPeriod" :disabled="!String(newTodoDraft.title||'').trim()">
                  Add To‑Do
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">To‑Dos for this pay period</h3>
              <div v-if="payrollTodosError" class="warn-box" style="margin-top: 8px;">{{ payrollTodosError }}</div>
              <div v-if="payrollTodosLoading" class="muted" style="margin-top: 8px;">Loading…</div>
              <div v-else-if="!(payrollTodos||[]).length" class="muted" style="margin-top: 8px;">No To‑Dos yet.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 90px;">Done</th>
                      <th>To‑Do</th>
                      <th style="width: 220px;">Scope</th>
                      <th style="width: 160px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in payrollTodos" :key="t.id">
                      <td>
                        <input
                          type="checkbox"
                          :checked="String(t.status || '').toLowerCase() === 'done'"
                          :disabled="updatingPayrollTodoId === t.id"
                          @change="togglePayrollTodoDone(t, $event.target.checked)"
                        />
                      </td>
                      <td>
                        <div v-if="editingPeriodTodoId !== t.id">
                          <div><strong>{{ t.title }}</strong></div>
                          <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                        </div>
                        <div v-else>
                          <div class="field">
                            <label style="margin-bottom: 4px;">Title</label>
                            <input v-model="editPeriodTodoDraft.title" type="text" />
                          </div>
                          <div class="field" style="margin-top: 8px;">
                            <label style="margin-bottom: 4px;">Description</label>
                            <textarea v-model="editPeriodTodoDraft.description" rows="2" />
                          </div>
                        </div>
                      </td>
                      <td class="muted">
                        <div v-if="editingPeriodTodoId !== t.id">
                          <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                          <span v-else>Agency-wide</span>
                        </div>
                        <div v-else>
                          <div class="field">
                            <label style="margin-bottom: 4px;">Scope</label>
                            <select v-model="editPeriodTodoDraft.scope">
                              <option value="agency">Agency-wide</option>
                              <option value="provider">Per-provider</option>
                            </select>
                          </div>
                          <div class="field" style="margin-top: 8px;" v-if="editPeriodTodoDraft.scope === 'provider'">
                            <label style="margin-bottom: 4px;">Provider</label>
                            <select v-model="editPeriodTodoDraft.targetUserId">
                              <option :value="null">Select provider…</option>
                              <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                            </select>
                          </div>
                        </div>
                      </td>
                      <td class="right">
                        <div v-if="editingPeriodTodoId !== t.id">
                          <button class="btn btn-secondary btn-sm" type="button" @click="beginEditPeriodTodo(t)" :disabled="updatingPayrollTodoId === t.id">
                            Edit
                          </button>
                          <button
                            v-if="!t.template_id"
                            class="btn btn-danger btn-sm"
                            type="button"
                            style="margin-left: 8px;"
                            @click="deletePeriodTodo(t)"
                            :disabled="updatingPayrollTodoId === t.id"
                            title="Deletes only ad-hoc To-Dos (recurring template items cannot be deleted here)."
                          >
                            Delete
                          </button>
                        </div>
                        <div v-else>
                          <button class="btn btn-secondary btn-sm" type="button" @click="cancelEditPeriodTodo" :disabled="savingPeriodTodoEdits">
                            Cancel
                          </button>
                          <button class="btn btn-primary btn-sm" type="button" @click="savePeriodTodoEdits" :disabled="savingPeriodTodoEdits">
                            {{ savingPeriodTodoEdits ? 'Saving…' : 'Save' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div v-else>
            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Create recurring template</h3>
              <div v-if="todoTemplatesError" class="warn-box" style="margin-top: 8px;">{{ todoTemplatesError }}</div>
              <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
                <div class="field">
                  <label>Scope</label>
                  <select v-model="templateDraft.scope">
                    <option value="agency">Agency-wide</option>
                    <option value="provider">Per-provider</option>
                  </select>
                </div>
                <div v-if="templateDraft.scope === 'provider'" class="field">
                  <label>Provider</label>
                  <select v-model="templateDraft.targetUserId">
                    <option :value="null">Select provider…</option>
                    <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                  </select>
                </div>
              </div>
              <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
                <div class="field">
                  <label>Start at pay period</label>
                  <select v-model="templateDraft.startPayrollPeriodId">
                    <option :value="null">Start immediately</option>
                    <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>Active</label>
                  <select v-model="templateDraft.isActive">
                    <option :value="true">Active</option>
                    <option :value="false">Inactive</option>
                  </select>
                </div>
              </div>
              <div class="field" style="margin-top: 10px;">
                <label>Title</label>
                <input v-model="templateDraft.title" type="text" placeholder="e.g., Confirm XYZ is correct" />
              </div>
              <div class="field" style="margin-top: 10px;">
                <label>Description (optional)</label>
                <textarea v-model="templateDraft.description" rows="3" placeholder="Optional details…" />
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-primary" type="button" @click="createTodoTemplate" :disabled="savingTodoTemplate || !String(templateDraft.title||'').trim()">
                  {{ savingTodoTemplate ? 'Saving…' : 'Create template' }}
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Templates</h3>
              <div v-if="todoTemplatesLoading" class="muted" style="margin-top: 8px;">Loading templates…</div>
              <div v-else-if="!(todoTemplates||[]).length" class="muted" style="margin-top: 8px;">No templates yet.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 90px;">Active</th>
                      <th>Template</th>
                      <th style="width: 240px;">Starts</th>
                      <th style="width: 120px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in todoTemplates" :key="t.id">
                      <td>
                        <input
                          type="checkbox"
                          :checked="Number(t.is_active) === 1"
                          :disabled="deletingTodoTemplateId === t.id"
                          @change="toggleTodoTemplateActive(t, $event.target.checked)"
                        />
                      </td>
                      <td>
                        <div><strong>{{ t.title }}</strong></div>
                        <div class="muted" style="margin-top: 4px;">
                          <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                          <span v-else>Agency-wide</span>
                        </div>
                        <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                      </td>
                      <td class="muted">
                        <span v-if="Number(t.start_payroll_period_id||0) > 0">From period #{{ t.start_payroll_period_id }}</span>
                        <span v-else>Immediately</span>
                      </td>
                      <td class="right">
                        <button class="btn btn-secondary btn-sm" type="button" @click="openEditTodoTemplate(t)" :disabled="deletingTodoTemplateId === t.id">
                          Edit
                        </button>
                        <button class="btn btn-danger btn-sm" type="button" :disabled="deletingTodoTemplateId === t.id" @click="deleteTodoTemplate(t)">
                          {{ deletingTodoTemplateId === t.id ? 'Deleting…' : 'Delete' }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="editTodoTemplateOpen" class="modal-backdrop" @click.self="closeEditTodoTemplate">
        <div class="modal" style="width: min(760px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Edit recurring To‑Do template</div>
              <div class="hint">Edits affect future pay periods. Existing period To‑Dos are unchanged.</div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" @click="closeEditTodoTemplate">Close</button>
          </div>

          <div v-if="editTodoTemplateError" class="warn-box" style="margin-top: 10px;">{{ editTodoTemplateError }}</div>

          <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
            <div class="field">
              <label>Scope</label>
              <select v-model="editTodoTemplateDraft.scope">
                <option value="agency">Agency-wide</option>
                <option value="provider">Per-provider</option>
              </select>
            </div>
            <div v-if="editTodoTemplateDraft.scope === 'provider'" class="field">
              <label>Provider</label>
              <select v-model="editTodoTemplateDraft.targetUserId">
                <option :value="null">Select provider…</option>
                <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
              </select>
            </div>
          </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Start at pay period</label>
              <select v-model="editTodoTemplateDraft.startPayrollPeriodId">
                <option :value="null">Start immediately</option>
                <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field">
              <label>Active</label>
              <select v-model="editTodoTemplateDraft.isActive">
                <option :value="true">Active</option>
                <option :value="false">Inactive</option>
              </select>
            </div>
          </div>

          <div class="field" style="margin-top: 10px;">
            <label>Title</label>
            <input v-model="editTodoTemplateDraft.title" type="text" />
          </div>

          <div class="field" style="margin-top: 10px;">
            <label>Description (optional)</label>
            <textarea v-model="editTodoTemplateDraft.description" rows="3" />
          </div>

          <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-secondary" type="button" @click="closeEditTodoTemplate" :disabled="savingEditTodoTemplate">
              Cancel
            </button>
            <button class="btn btn-primary" type="button" @click="saveEditTodoTemplate" :disabled="savingEditTodoTemplate || !String(editTodoTemplateDraft.title||'').trim()">
              {{ savingEditTodoTemplate ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="showPayrollWizardModal" class="modal-backdrop">
        <div class="modal" style="width: min(980px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Payroll Wizard</div>
              <div class="hint">Step-by-step guide. Save anytime; no click-out close.</div>
            </div>
            <div class="actions" style="margin: 0;">
              <button class="btn btn-secondary btn-sm" type="button" @click="wizardSaveAndExit" :disabled="wizardSaving">Save edits & exit</button>
              <button class="btn btn-danger btn-sm" type="button" @click="wizardDiscardAndExit" :disabled="wizardSaving" style="margin-left: 8px;">Don’t save & exit</button>
            </div>
          </div>

          <div v-if="wizardError" class="warn-box" style="margin-top: 10px;">{{ wizardError }}</div>
          <div v-if="wizardLoading" class="muted" style="margin-top: 10px;">Loading wizard…</div>
          <div v-else style="margin-top: 10px;">
            <div class="card">
              <div class="hint" style="font-weight: 700;">Step {{ wizardStepIdx + 1 }} of {{ wizardSteps.length }} — {{ wizardStep?.title }}</div>
              <div class="hint" style="margin-top: 6px;">You can use Back/Next; the wizard saves progress as you move.</div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Current step actions</h3>

              <div v-if="wizardStep?.key === 'prior'" class="hint">
                Start here: <strong>Process Changes</strong> for any prior pay periods you edited (late notes, manual pay fixes, etc).
                <div class="hint" style="margin-top: 6px;">
                  You can run this more than once before continuing — for example, process <strong>two pay periods ago</strong> first, then process <strong>one pay period ago</strong>.
                  Each time, upload the updated report for that prior period and choose the correct prior pay period.
                </div>
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardGoToProcessChanges" :disabled="!selectedPeriodId">Go to Process Changes</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'review'" class="hint">
                Review changes between runs (No-note/Draft Unpaid workflow).
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="openCarryoverModal" :disabled="!selectedPeriodId || isPeriodPosted">Open No-note/Draft Unpaid</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'apply'" class="hint">
                Apply changes (carryover) into the current pay period, then continue.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="openCarryoverModal" :disabled="!selectedPeriodId || isPeriodPosted">Open carryover tool</button>
                  <button class="btn btn-secondary" type="button" @click="showStageModal = true" :disabled="!selectedPeriodId" style="margin-left: 8px;">Open Payroll Stage</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'drafts'" class="hint">
                Edit draft-payable decisions in Raw Import (Draft Audit).
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('draft_audit')" :disabled="!selectedPeriodId">Open Raw Import (Draft Audit)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'h0031'" class="hint">
                Process H0031 minutes + mark Done.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h0031')" :disabled="!selectedPeriodId">Open Raw Import (H0031)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'h0032'" class="hint">
                Process H0032 minutes + mark Done.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h0032')" :disabled="!selectedPeriodId">Open Raw Import (H0032)</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'stage'" class="hint">
                Review Payroll Stage workspace edits, claims, To‑Dos, and adjustments.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="showStageModal = true" :disabled="!selectedPeriodId">Open Payroll Stage</button>
                  <button class="btn btn-secondary" type="button" @click="openTodoModal" :disabled="!selectedPeriodId" style="margin-left: 8px;">Manage To‑Dos</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'run'" class="hint">
                Run payroll to compute totals (blocked if To‑Dos or submissions are pending).
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-primary" type="button" @click="runPayroll" :disabled="runningPayroll || isPeriodPosted || !selectedPeriodId">
                    {{ runningPayroll ? 'Running…' : 'Run Payroll' }}
                  </button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'preview'" class="hint">
                Preview provider view + post-time notifications.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="openPreviewPostModalV2" :disabled="!selectedPeriodId || !canSeeRunResults">Open Preview Post</button>
                </div>
              </div>

              <div v-else-if="wizardStep?.key === 'post'" class="hint">
                Post payroll to make it visible to providers.
                <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-primary" type="button" @click="postPayroll" :disabled="postingPayroll || isPeriodPosted || selectedPeriodStatus !== 'ran'">
                    {{ postingPayroll ? 'Posting…' : 'Post Payroll' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="actions" style="margin-top: 12px; justify-content: space-between;">
              <button class="btn btn-secondary" type="button" @click="wizardBack" :disabled="wizardStepIdx <= 0 || wizardSaving">Back</button>
              <button class="btn btn-primary" type="button" @click="wizardNext" :disabled="wizardStepIdx >= wizardSteps.length - 1 || wizardSaving">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </teleport>

    <!-- V2 modals: isolated from page state -->
    <teleport to="body">
      <div v-if="showRunModalV2" class="modal-backdrop" @click.self="showRunModalV2 = false">
        <div class="modal">
          <div class="modal-header">
            <div>
              <div class="modal-title">Ran Payroll</div>
              <div class="hint">Read-only viewer (loads directly from the API).</div>
            </div>
            <div class="actions" style="margin: 0;">
              <button class="btn btn-secondary btn-sm" type="button" @click="refreshRunModalV2" :disabled="runModalV2Loading">
                {{ runModalV2Loading ? 'Loading…' : 'Refresh' }}
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="showRunModalV2 = false" style="margin-left: 8px;">Close</button>
            </div>
          </div>
          <div v-if="runModalV2Error" class="warn-box">{{ runModalV2Error }}</div>
          <div v-else-if="runModalV2Loading" class="muted">Loading…</div>
          <div v-else class="table-wrap">
            <div class="field-row" style="grid-template-columns: 1fr auto; gap: 10px; align-items: end; margin: 8px 0 10px 0;">
              <div class="field">
                <label>Search provider</label>
                <input v-model="runModalV2Search" type="text" placeholder="Type a name…" />
              </div>
              <div class="field">
                <label>Sort</label>
                <select v-model="runModalV2SortKey">
                  <option value="provider">Provider</option>
                  <option value="total_hours">Total Hours</option>
                  <option value="subtotal_amount">Subtotal</option>
                  <option value="adjustments_amount">Adjustments</option>
                  <option value="total_amount">Total</option>
                </select>
                <div class="hint" style="margin-top: 4px;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="runModalV2SortDir = (runModalV2SortDir === 'asc' ? 'desc' : 'asc')">
                    {{ runModalV2SortDir === 'asc' ? 'Asc' : 'Desc' }}
                  </button>
                </div>
              </div>
            </div>

            <table class="table">
              <thead>
                <tr>
                  <th>
                    <button class="link-btn" type="button" @click="setRunModalV2Sort('provider')">
                      Provider <span class="muted" v-if="runModalV2SortIndicator('provider')">{{ runModalV2SortIndicator('provider') }}</span>
                    </button>
                  </th>
                  <th class="right">
                    <button class="link-btn right" type="button" @click="setRunModalV2Sort('total_hours')">
                      Total Hours <span class="muted" v-if="runModalV2SortIndicator('total_hours')">{{ runModalV2SortIndicator('total_hours') }}</span>
                    </button>
                  </th>
                  <th class="right">
                    <button class="link-btn right" type="button" @click="setRunModalV2Sort('subtotal_amount')">
                      Subtotal <span class="muted" v-if="runModalV2SortIndicator('subtotal_amount')">{{ runModalV2SortIndicator('subtotal_amount') }}</span>
                    </button>
                  </th>
                  <th class="right">
                    <button class="link-btn right" type="button" @click="setRunModalV2Sort('adjustments_amount')">
                      Adjustments <span class="muted" v-if="runModalV2SortIndicator('adjustments_amount')">{{ runModalV2SortIndicator('adjustments_amount') }}</span>
                    </button>
                  </th>
                  <th class="right">
                    <button class="link-btn right" type="button" @click="setRunModalV2Sort('total_amount')">
                      Total <span class="muted" v-if="runModalV2SortIndicator('total_amount')">{{ runModalV2SortIndicator('total_amount') }}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in (runModalV2Rows || [])" :key="s.id || `${s.user_id}`">
                  <td>{{ s.last_name }}, {{ s.first_name }}</td>
                  <td class="right">{{ fmtNum(s.total_hours ?? 0) }}</td>
                  <td class="right">{{ fmtMoney(s.subtotal_amount ?? 0) }}</td>
                  <td class="right">{{ fmtMoney(s.adjustments_amount ?? 0) }}</td>
                  <td class="right"><strong>{{ fmtMoney(s.total_amount ?? 0) }}</strong></td>
                </tr>
                <tr v-if="!(runModalV2Rows || []).length">
                  <td colspan="5" class="muted">No results found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </teleport>

    <teleport to="body">
      <div v-if="showPreviewPostModalV2" class="modal-backdrop" @click.self="showPreviewPostModalV2 = false">
        <div class="modal">
          <div class="modal-header">
            <div>
              <div class="modal-title">Preview Post</div>
              <div class="hint">Read-only provider view (loads directly from the API).</div>
            </div>
            <div class="actions" style="margin: 0;">
              <button class="btn btn-secondary btn-sm" type="button" @click="refreshPreviewPostModalV2" :disabled="previewPostV2Loading">
                {{ previewPostV2Loading ? 'Loading…' : 'Refresh' }}
              </button>
              <button class="btn btn-secondary btn-sm" type="button" @click="showPreviewPostModalV2 = false" style="margin-left: 8px;">Close</button>
            </div>
          </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 8px;">
            <div class="field">
              <label>Provider</label>
              <div class="row" style="gap: 8px; align-items: center;">
                <select v-model="previewPostV2UserId" :disabled="previewPostV2Loading" style="flex: 1 1 auto;">
                <option :value="null" disabled>Select a provider…</option>
                <option v-for="s in (previewPostV2ProviderOptions || [])" :key="s.user_id" :value="s.user_id">{{ s.last_name }}, {{ s.first_name }}</option>
                </select>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="previewPostV2PrevUser"
                  :disabled="previewPostV2Loading || !previewPostV2CanPrev"
                  title="Previous employee"
                >
                  Prev
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="previewPostV2NextUser"
                  :disabled="previewPostV2Loading || !previewPostV2CanNext"
                  title="Next employee"
                >
                  Next
                </button>
              </div>
            </div>
            <div class="field">
              <label>Pay period</label>
              <div class="hint">{{ periodRangeLabel(selectedPeriodForUi) }}</div>
            </div>
          </div>

          <div v-if="previewPostV2Error" class="warn-box" style="margin-top: 10px;">{{ previewPostV2Error }}</div>
          <div v-else-if="previewPostV2Loading" class="muted" style="margin-top: 10px;">Loading…</div>
          <div v-else class="card" style="margin-top: 12px;">
            <div v-if="!previewPostV2UserId" class="muted">Select a provider.</div>
            <div v-else-if="previewPostV2Summary">
              <div v-if="auditForPreviewProviderV2 && auditForPreviewProviderV2.flags?.length" class="warn-box" style="margin: 10px 0;">
                <div><strong>Audit flags (review recommended)</strong></div>
                <div v-for="(f, i) in auditForPreviewProviderV2.flags" :key="`v2-audit:${i}`" class="muted">{{ f }}</div>
              </div>

              <!-- These match provider-facing notices in My Payroll -->
              <div class="warn-box prior-notes-included" v-if="previewPostV2CarryoverNotes > 0" style="margin-bottom: 10px;">
                <div><strong>Prior notes included in this payroll:</strong> {{ fmtNum(previewPostV2CarryoverNotes) }} notes</div>
                <div class="muted">Reminder: complete prior-period notes by Sunday 11:59pm after the pay period ends to avoid compensation delays.</div>
              </div>

              <div
                class="warn-box"
                v-if="previewPostV2PriorStillUnpaid.totalUnits > 0"
                style="margin-bottom: 10px; border: 1px solid #ffb5b5; background: #ffecec;"
              >
                <div>
                  <strong>Still unpaid from the prior pay period (not paid this period):</strong>
                  {{ fmtNum(previewPostV2PriorStillUnpaid.totalUnits) }} units
                </div>
                <div class="muted" style="margin-top: 4px;" v-if="previewPostV2PriorStillUnpaid.periodStart">
                  {{ previewPostV2PriorStillUnpaid.periodStart }} → {{ previewPostV2PriorStillUnpaid.periodEnd }}
                </div>
                <div class="muted" style="margin-top: 6px;" v-if="(previewPostV2PriorStillUnpaid.lines || []).length">
                  <div><strong>Details:</strong></div>
                  <div v-for="(l, i) in (previewPostV2PriorStillUnpaid.lines || [])" :key="`v2-prior-unpaid:${l.serviceCode}:${i}`">
                    - {{ l.serviceCode }}: {{ fmtNum(l.unpaidUnits) }} units
                  </div>
                </div>
              </div>

              <div
                class="warn-box"
                v-if="previewPostV2UnpaidInPeriod.total > 0"
                style="margin-bottom: 10px; border: 1px solid #ffd8a8; background: #fff4e6;"
              >
                <div><strong>Unpaid notes in this pay period</strong></div>
                <div style="margin-top: 6px;">
                  <strong>No Note:</strong> {{ fmtNum(previewPostV2UnpaidInPeriod.noNote) }} notes
                  <span class="muted">•</span>
                  <strong>Draft:</strong> {{ fmtNum(previewPostV2UnpaidInPeriod.draft) }} notes
                </div>
                <div class="muted" style="margin-top: 6px;">
                  These notes were not paid this period. Complete outstanding notes to be included in a future payroll.
                </div>
              </div>

              <div class="row"><strong>Total Pay:</strong> {{ fmtMoney(previewPostV2Summary.total_amount ?? 0) }}</div>
              <div class="row"><strong>Total Credits/Hours:</strong> {{ fmtNum(previewPostV2Summary.total_hours ?? 0) }}</div>
              <div class="row"><strong>Tier Credits (Final):</strong> {{ fmtNum(previewPostV2Summary.tier_credits_final ?? previewPostV2Summary.tier_credits_current ?? 0) }}</div>

              <div class="card" style="margin-top: 10px;" v-if="previewPostV2Summary.breakdown && previewPostV2Summary.breakdown.__tier">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier</h3>
                <div class="row"><strong>{{ previewPostV2Summary.breakdown.__tier.label }}</strong></div>
                <div class="row"><strong>Status:</strong> {{ previewPostV2Summary.breakdown.__tier.status }}</div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Direct / Indirect Totals</h3>
                <div class="row">
                  <strong>Direct:</strong>
                  {{ fmtNum(previewPostV2Summary.direct_hours ?? 0) }} hrs •
                  {{ fmtMoney(payTotalsFromBreakdown(previewPostV2Summary.breakdown).directAmount ?? 0) }}
                </div>
                <div class="row">
                  <strong>Indirect:</strong>
                  {{ fmtNum(previewPostV2Summary.indirect_hours ?? 0) }} hrs •
                  {{ fmtMoney(payTotalsFromBreakdown(previewPostV2Summary.breakdown).indirectAmount ?? 0) }}
                </div>
              </div>

              <h3 class="card-title" style="margin-top: 12px;">Service Codes</h3>
              <div class="muted" v-if="!previewPostV2Summary.breakdown || !Object.keys(previewPostV2Summary.breakdown).length">No breakdown available.</div>
              <div v-else class="codes">
                <div class="codes-head">
                  <div>Code</div>
                  <div class="right">No Note</div>
                  <div class="right">Draft</div>
                  <div class="right">Finalized</div>
                  <div class="right">Credits/Hours</div>
                  <div class="right">Rate</div>
                  <div class="right">Amount</div>
                </div>
                <div v-for="l in (previewPostV2ServiceLines || []).filter(Boolean)" :key="`v2-line:${l?.code || '—'}`" class="code-row">
                  <div class="code">{{ l?.code || '—' }}</div>
                  <div class="right muted">{{ fmtNum(l?.noNoteUnits ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l?.draftUnits ?? 0) }}</div>
                  <div class="right">{{ fmtNum(l?.finalizedUnits ?? l?.units ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l?.hours ?? 0) }}</div>
                  <div class="right muted">{{ fmtMoney(l?.rateAmount ?? 0) }}</div>
                  <div class="right">{{ fmtMoney(l?.amount ?? 0) }}</div>
                </div>
              </div>

              <div class="card" style="margin-top: 10px;" v-if="previewPostV2Summary.breakdown && previewPostV2Summary.breakdown.__adjustments">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Additional Pay / Overrides</h3>
                <div class="muted" v-if="!(previewPostV2Summary.breakdown.__adjustments.lines || []).length">
                  No adjustments.
                </div>
                <div v-else>
                  <div v-for="(l, i) in (previewPostV2Summary.breakdown.__adjustments.lines || [])" :key="`v2-adj:${l.type}:${i}`" class="row" style="margin-top: 6px;">
                    <div>
                      <strong>{{ l.label }}</strong>
                      <span class="muted" v-if="l.taxable === false"> (non-taxable)</span>
                      <span class="muted" v-else> (taxable)</span>
                      <span class="muted" v-if="l.meta && (l.meta.hours || l.meta.rate)"> • {{ fmtNum(l.meta.hours ?? 0) }} hrs @ {{ fmtMoney(l.meta.rate ?? 0) }}</span>
                    </div>
                    <div class="right">{{ fmtMoney(l.amount ?? 0) }}</div>
                  </div>
                </div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Notifications (sent on Post)</h3>
                <div class="muted" v-if="!(previewPostV2Notifications || []).length">No post-time notifications for this provider.</div>
                <div v-else>
                  <div v-for="(n, idx) in (previewPostV2Notifications || [])" :key="`v2-n:${idx}`" class="row" style="margin-top: 6px;">
                    <div><strong>{{ n.title || n.type }}</strong></div>
                    <div class="muted">{{ n.message }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="muted">No run results found for this provider.</div>
          </div>
        </div>
      </div>
    </teleport>

    <!-- Payroll Tools modal (no persistence) -->
    <div v-if="showPayrollToolsModal" class="modal-backdrop" @click.self="showPayrollToolsModal = false">
      <div class="modal" style="width: min(1100px, 100%);">
        <div class="modal-header">
          <div>
            <div class="modal-title">Payroll Tools (Checker)</div>
            <div class="hint">
              This modal does <strong>not</strong> import, stage, run, post, or save anything. Each run overwrites the prior results.
            </div>
          </div>
          <div class="actions" style="margin: 0; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" @click="showPayrollToolsModal = false">Close</button>
          </div>
        </div>

        <div class="card" style="margin-top: 12px;">
          <div v-if="!agencyId" class="warn-box" style="margin-bottom: 10px;">
            Select an organization first to use Payroll Tools.
          </div>
          <div class="actions" style="margin: 0 0 10px 0; justify-content: flex-start; gap: 8px;">
            <button class="btn btn-secondary btn-sm" :class="{ active: payrollToolsTab === 'compare' }" @click="payrollToolsTab = 'compare'">
              Compare files
            </button>
            <button class="btn btn-secondary btn-sm" :class="{ active: payrollToolsTab === 'viewer' }" @click="payrollToolsTab = 'viewer'">
              Viewer (staging-like)
            </button>
          </div>

          <div v-if="payrollToolsTab === 'compare'">
            <div class="field-row" style="grid-template-columns: 1fr 1fr auto; align-items: end;">
              <div class="field">
                <label>Document 1</label>
                <input type="file" accept=".csv,.xlsx,.xls" @change="onToolsFile1" />
              </div>
              <div class="field">
                <label>Document 2</label>
                <input type="file" accept=".csv,.xlsx,.xls" @change="onToolsFile2" />
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <button class="btn btn-primary" @click="runPayrollToolsCompare" :disabled="payrollToolsLoading || !toolsFile1 || !toolsFile2 || !agencyId">
                  {{ payrollToolsLoading ? 'Comparing…' : 'Compare' }}
                </button>
              </div>
            </div>

            <div v-if="payrollToolsError" class="error-box" style="margin-top: 10px;">{{ payrollToolsError }}</div>

            <div v-if="payrollToolsCompareResult" style="margin-top: 12px;">
              <div class="field-row" style="grid-template-columns: 1fr 1fr auto; margin-top: 10px; align-items: end;">
                <div class="field">
                  <label>Filter</label>
                  <select v-model="payrollToolsCompareFilter">
                    <option value="changed">Changed only</option>
                    <option value="added">Added only</option>
                    <option value="removed">Removed only</option>
                    <option value="all">All (added/removed/changed)</option>
                  </select>
                </div>
                <div class="field">
                  <label>Sort</label>
                  <select v-model="payrollToolsCompareSort">
                    <option value="human">Provider (A → Z)</option>
                    <option value="change">Change type</option>
                    <option value="code">Service code</option>
                    <option value="date">Date (newest → oldest)</option>
                  </select>
                </div>
                <div class="field">
                  <label>&nbsp;</label>
                  <button class="btn btn-secondary btn-sm" type="button" @click="payrollToolsCompareMode = (payrollToolsCompareMode === 'detail' ? 'summary' : 'detail')">
                    {{ payrollToolsCompareMode === 'detail' ? 'Summarize (Provider + Code)' : 'Back to detail' }}
                  </button>
                </div>
              </div>

              <div class="hint">
                <strong>Summary:</strong>
                {{ payrollToolsCompareResult.summary?.changed || 0 }} changed •
                {{ payrollToolsCompareResult.summary?.added || 0 }} added •
                {{ payrollToolsCompareResult.summary?.removed || 0 }} removed •
                {{ payrollToolsCompareResult.summary?.unchanged || 0 }} unchanged
                <span v-if="Number(payrollToolsCompareResult.summary?.lateAddedFinalizedUnitsTotal || 0) > 0">
                  • <strong>Late added FINAL:</strong> {{ fmtNum(payrollToolsCompareResult.summary?.lateAddedFinalizedUnitsTotal || 0) }}
                </span>
              </div>

              <div v-if="payrollToolsCompareMode === 'summary'" class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Code</th>
                      <th class="right">Doc1 NO_NOTE</th>
                      <th class="right">Doc1 DRAFT</th>
                      <th class="right">Doc1 FINAL</th>
                      <th class="right">Doc2 NO_NOTE</th>
                      <th class="right">Doc2 DRAFT</th>
                      <th class="right">Doc2 FINAL</th>
                      <th>Net change</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in payrollToolsSummaryRows" :key="`sum-${idx}`">
                      <td>{{ r.providerName }}</td>
                      <td>{{ r.serviceCode }}</td>
                      <td class="right">{{ fmtNum(r.doc1.NO_NOTE) }}</td>
                      <td class="right">{{ fmtNum(r.doc1.DRAFT) }}</td>
                      <td class="right">{{ fmtNum(r.doc1.FINALIZED) }}</td>
                      <td class="right">{{ fmtNum(r.doc2.NO_NOTE) }}</td>
                      <td class="right">{{ fmtNum(r.doc2.DRAFT) }}</td>
                      <td class="right">{{ fmtNum(r.doc2.FINALIZED) }}</td>
                      <td class="muted">{{ r.narrative }}</td>
                    </tr>
                    <tr v-if="!(payrollToolsSummaryRows || []).length">
                      <td colspan="9" class="muted">No rows in this filter.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>Provider</th>
                      <th>First name</th>
                      <th>Code</th>
                      <th>Date</th>
                      <th class="right">Doc1 NO_NOTE</th>
                      <th class="right">Doc1 DRAFT</th>
                      <th class="right">Doc1 FINAL</th>
                      <th class="right">Doc2 NO_NOTE</th>
                      <th class="right">Doc2 DRAFT</th>
                      <th class="right">Doc2 FINAL</th>
                      <th class="right">Late add FINAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="(c, idx) in payrollToolsCompareRows" :key="`cmp-${idx}`">
                      <tr>
                        <td>
                          <strong v-if="c.changeType === 'added'">late_added</strong>
                          <strong v-else>{{ c.changeType }}</strong>
                        </td>
                        <td>{{ (c.after || c.before)?.providerName || '—' }}</td>
                        <td>{{ (c.after || c.before)?.patientFirstName || '—' }}</td>
                        <td>{{ (c.after || c.before)?.serviceCode || '—' }}</td>
                        <td>{{ (c.after || c.before)?.dos || '—' }}</td>
                        <td class="right">{{ fmtNum((c.before?.unitsByStatus?.NO_NOTE || 0)) }}</td>
                        <td class="right">{{ fmtNum((c.before?.unitsByStatus?.DRAFT || 0)) }}</td>
                        <td class="right">{{ fmtNum((c.before?.unitsByStatus?.FINALIZED || 0)) }}</td>
                        <td class="right">{{ fmtNum((c.after?.unitsByStatus?.NO_NOTE || 0)) }}</td>
                        <td class="right">{{ fmtNum((c.after?.unitsByStatus?.DRAFT || 0)) }}</td>
                        <td class="right">{{ fmtNum((c.after?.unitsByStatus?.FINALIZED || 0)) }}</td>
                        <td class="right">
                          <strong v-if="Number(c?.metrics?.lateAddedFinalizedUnits || 0) > 0">{{ fmtNum(c.metrics.lateAddedFinalizedUnits) }}</strong>
                          <span v-else class="muted">—</span>
                        </td>
                      </tr>
                      <tr v-if="c.changeType === 'added' || Number(c?.metrics?.lateAddedFinalizedUnits || 0) > 0">
                        <td colspan="12" class="muted">
                          <span v-if="c.changeType === 'added'">
                            Late added service (present only in Doc2). If FINALIZED it should be paid; if DRAFT it should be reviewed; if NO_NOTE it should be carried forward.
                          </span>
                          <span v-else>
                            Late added FINAL indicates finalized units beyond the unpaid drop (helps catch new services added late).
                          </span>
                        </td>
                      </tr>
                    </template>
                    <tr v-if="!(payrollToolsCompareRows || []).length">
                      <td colspan="12" class="muted">No rows in this filter.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div v-else>
            <div class="field-row" style="grid-template-columns: 1fr auto; align-items: end;">
              <div class="field">
                <label>Document</label>
                <input type="file" accept=".csv,.xlsx,.xls" @change="onToolsViewerFile" />
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <button class="btn btn-primary" @click="runPayrollToolsViewer" :disabled="payrollToolsLoading || !toolsViewerFile || !agencyId">
                  {{ payrollToolsLoading ? 'Loading…' : 'Open Viewer' }}
                </button>
              </div>
            </div>

            <div v-if="payrollToolsError" class="error-box" style="margin-top: 10px;">{{ payrollToolsError }}</div>

            <div v-if="payrollToolsViewerResult" style="margin-top: 12px;">
              <div class="hint">
                <strong>Matched:</strong> {{ (payrollToolsViewerResult.matched || []).length }}
                • <strong>Unmatched:</strong> {{ (payrollToolsViewerResult.unmatched || []).length }}
              </div>

              <div class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Code</th>
                      <th class="right">No Note</th>
                      <th class="right">Draft</th>
                      <th class="right">Finalized</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in (payrollToolsViewerResult.matched || [])" :key="`vw-m-${idx}`">
                      <td>{{ r.lastName ? `${r.lastName}, ${r.firstName || ''}` : (r.providerName || '—') }}</td>
                      <td>{{ r.serviceCode }}</td>
                      <td class="right">{{ fmtNum(r.raw?.noNoteUnits || 0) }}</td>
                      <td class="right">{{ fmtNum(r.raw?.draftUnits || 0) }}</td>
                      <td class="right">{{ fmtNum(r.raw?.finalizedUnits || 0) }}</td>
                    </tr>
                    <tr v-if="(payrollToolsViewerResult.unmatched || []).length">
                      <td colspan="5" class="muted"><strong>Unmatched providers</strong> (couldn’t map provider name to a user)</td>
                    </tr>
                    <tr v-for="(r, idx) in (payrollToolsViewerResult.unmatched || [])" :key="`vw-u-${idx}`">
                      <td>{{ r.providerName || '—' }}</td>
                      <td>{{ r.serviceCode }}</td>
                      <td class="right">{{ fmtNum(r.raw?.noNoteUnits || 0) }}</td>
                      <td class="right">{{ fmtNum(r.raw?.draftUnits || 0) }}</td>
                      <td class="right">{{ fmtNum(r.raw?.finalizedUnits || 0) }}</td>
                    </tr>
                    <tr v-if="!(payrollToolsViewerResult.matched || []).length && !(payrollToolsViewerResult.unmatched || []).length">
                      <td colspan="5" class="muted">No rows parsed from this file.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div ref="processChangesCard" class="card" v-if="agencyId" style="margin-bottom: 12px;">
      <h2 class="card-title">Process Changes</h2>
      <div class="hint">
        Use this when you re-run a <strong>prior</strong> pay period report to catch late notes. The system will auto-detect which prior pay period the upload belongs to, compare “then vs now”, and let you add only the differences into the <strong>present</strong> pay period.
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 1fr 1fr;">
        <div class="field">
          <label>Present pay period (destination)</label>
          <div class="hint">
            This will add differences into your currently selected pay period:
            <strong>{{ selectedPeriodForUi ? periodRangeLabel(selectedPeriodForUi) : '—' }}</strong>
          </div>
          <div class="hint muted">To change the destination, select a different pay period at the top of this page.</div>
        </div>
          <div class="field">
          <label>Upload updated prior pay period report</label>
          <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onProcessFilePick" />
          <div class="hint" v-if="processDetectedHint">{{ processDetectedHint }}</div>
          </div>
          <div class="field">
          <label>Next</label>
          <div class="actions" style="margin: 0;">
            <button class="btn btn-secondary" @click="processAutoImport" :disabled="processingChanges || !processImportFile || !agencyId">
              {{ processingChanges ? 'Detecting...' : 'Detect prior period (choose)' }}
            </button>
            <button class="btn btn-primary" @click="processRunAndCompare" :disabled="processingChanges || !processSourcePeriodId || !selectedPeriodId">
              {{ processingChanges ? 'Working...' : 'Run & compare (then → now)' }}
            </button>
          </div>
          <div class="hint" v-if="processSourcePeriodLabel">
            Prior period detected: {{ processSourcePeriodLabel }}
          </div>
          <div class="hint" v-if="selectedPeriodForUi">
            Will add differences into: {{ periodRangeLabel(selectedPeriodForUi) }}
          </div>
          <div class="warn-box" v-if="processError">{{ processError }}</div>
          </div>
        </div>

      <!-- Process Changes: prior-period confirmation modal -->
      <div v-if="processConfirmOpen" class="modal-backdrop" @click.self="processConfirmOpen = false">
        <div class="modal" style="width: min(800px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Confirm Prior Pay Period</div>
              <div class="hint">Verify the prior pay period before importing the updated report.</div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="processConfirmOpen = false">Close</button>
          </div>

          <div class="warn-box" v-if="processDetectResult?.detected">
            Detected: <strong>{{ processDetectResult.detected.periodStart }} → {{ processDetectResult.detected.periodEnd }}</strong>
            <span v-if="processDetectResult.detected.maxServiceDate" class="muted"> • max DOS {{ processDetectResult.detected.maxServiceDate }}</span>
          </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Import mode</label>
              <select v-model="processChoiceMode">
                <option value="detected" v-if="processDetectResult?.detected">Use detected period</option>
                <option value="existing">Choose an existing period</option>
              </select>
            </div>
            <div class="field" v-if="processChoiceMode === 'existing'">
              <label>Existing prior pay period</label>
              <select v-model="processExistingPeriodId">
                <option :value="null" disabled>Select a pay period…</option>
                <option v-for="p in processPriorPeriodOptions" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field" v-else-if="processChoiceMode === 'detected'">
              <label>Detected prior period</label>
              <div class="hint">
                {{ processDetectResult?.detected?.periodStart }} → {{ processDetectResult?.detected?.periodEnd }}
                <span v-if="processExistingPeriodId" class="muted"> • matched existing period #{{ processExistingPeriodId }}</span>
                <span v-else class="muted"> • no matching period found — choose an existing prior period</span>
              </div>
            </div>
          </div>

          <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-primary" @click="confirmProcessImport" :disabled="processingChanges || !processImportFile || !agencyId">
              {{ processingChanges ? 'Working...' : 'Confirm prior period' }}
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Process Changes Aggregate (scoped to current agency) -->
    <div class="card" v-if="(processChangesAggregateForAgency || []).length" style="margin-bottom: 12px;">
      <div class="actions" style="justify-content: space-between;">
        <div>
          <h2 class="card-title" style="margin-bottom: 4px;">Process Changes Aggregate</h2>
          <div class="hint">
            Tracks carryover you’ve applied for this agency.
          </div>
        </div>
        <div class="actions" style="margin: 0;">
          <button class="btn btn-secondary" type="button" @click="clearProcessChangesAggregate">
            Clear
          </button>
        </div>
      </div>

      <div class="field-row" style="grid-template-columns: repeat(4, 1fr); margin-top: 10px;">
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Agencies</div>
          <div style="font-size: 18px;"><strong>{{ processChangesAggregateTotals.agencyCount }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Total units applied</div>
          <div style="font-size: 18px;"><strong>{{ fmtNum(processChangesAggregateTotals.unitsAppliedTotal) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Notes (rows) applied</div>
          <div style="font-size: 18px;"><strong>{{ fmtNum(processChangesAggregateTotals.notesAppliedTotal) }}</strong></div>
        </div>
        <div class="card" style="padding: 10px;">
          <div class="hint muted">Rows inserted</div>
          <div style="font-size: 18px;"><strong>{{ fmtNum(processChangesAggregateTotals.rowsInsertedTotal) }}</strong></div>
        </div>
      </div>

      <div class="table-wrap" style="margin-top: 10px;">
        <table class="table">
          <thead>
            <tr>
              <th>Agency</th>
              <th>Prior period</th>
              <th>Destination period</th>
              <th class="right">Units applied</th>
              <th class="right">Rows inserted</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in (processChangesAggregateForAgency || [])" :key="r.key">
              <td><strong>{{ r.agencyName || `Agency #${r.agencyId}` }}</strong></td>
              <td>{{ r.priorPeriodLabel || (r.priorPeriodId ? `Period #${r.priorPeriodId}` : '—') }}</td>
              <td>{{ r.destinationPeriodLabel || (r.destinationPeriodId ? `Period #${r.destinationPeriodId}` : '—') }}</td>
              <td class="right"><strong>{{ fmtNum(r.unitsApplied || 0) }}</strong></td>
              <td class="right">{{ fmtNum(r.rowsInserted || 0) }}</td>
              <td class="muted">{{ String(r.appliedAt || '').slice(0, 19) || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" v-if="agencyId" style="margin-bottom: 12px;">
      <h2 class="card-title">Current Payroll Run</h2>
      <div class="hint">
        Import the current billing report, stage edits, run payroll, and post payroll. Providers will see posted payroll and any “prior notes included”.
      </div>

      <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr 2fr;">
        <div class="field">
          <label>Pay period</label>
          <select v-model="selectedPeriodId" :key="`period-top-${agencyId || 'none'}-${(periods || []).length}`">
            <option :value="null" disabled>Select a pay period…</option>
            <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
          </select>
        </div>
        <div class="field">
          <label>Import billing report</label>
          <input
            ref="currentPayrollFileInput"
            type="file"
            accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            @change="onFilePick"
            style="display: none;"
          />
          <div class="actions" style="margin-top: 8px; justify-content: flex-start;">
            <button
              :class="importFile ? 'btn btn-secondary' : 'btn btn-primary'"
              type="button"
              @click="triggerCurrentPayrollUpload"
              :disabled="!agencyId || importing"
            >
              Upload Current Pay Period
            </button>
            <button class="btn btn-secondary" type="button" @click="clearImportFile" :disabled="importing || !importFile">
              Remove file
            </button>
            <button class="btn btn-primary" type="button" @click="openImportConfirmModal" :disabled="importing || !importFile || !selectedPeriodId">
              {{ importing ? 'Importing...' : 'Import' }}
            </button>
          </div>
          <div class="hint" v-if="importFile">
            Selected file: <strong>{{ importFile.name }}</strong>
          </div>
          <div class="hint" v-if="detectedPeriodHint">{{ detectedPeriodHint }}</div>
        </div>
      </div>

      <!-- Auto-detect confirmation modal -->
      <div v-if="confirmAutoImportOpen" class="modal-backdrop" @click.self="confirmAutoImportOpen = false">
        <div class="modal" style="width: min(800px, 100%);">
          <div class="modal-header">
            <div>
              <div class="modal-title">Confirm Pay Period</div>
              <div class="hint">Verify which existing pay period to import into.</div>
            </div>
            <button class="btn btn-secondary btn-sm" @click="confirmAutoImportOpen = false">Close</button>
          </div>

          <div class="warn-box" v-if="autoDetectResult?.detected">
            Detected: <strong>{{ autoDetectResult.detected.periodStart }} → {{ autoDetectResult.detected.periodEnd }}</strong>
            <span v-if="autoDetectResult.detected.maxServiceDate" class="muted"> • max DOS {{ autoDetectResult.detected.maxServiceDate }}</span>
          </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Import mode</label>
              <select v-model="autoImportChoiceMode">
                <option value="detected" v-if="autoDetectResult?.detected">Use detected period</option>
                <option value="existing">Choose an existing period</option>
              </select>
            </div>
            <div class="field" v-if="autoImportChoiceMode === 'existing'">
              <label>Existing pay period</label>
              <select v-model="autoImportExistingPeriodId">
                <option :value="null" disabled>Select a pay period…</option>
                <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
              </select>
            </div>
            <div class="field" v-else-if="autoImportChoiceMode === 'detected'">
              <label>Detected period</label>
              <div class="hint">
                {{ autoDetectResult?.detected?.periodStart }} → {{ autoDetectResult?.detected?.periodEnd }}
                <span v-if="autoImportExistingPeriodId" class="muted"> • will import into existing period #{{ autoImportExistingPeriodId }}</span>
                <span v-else class="muted"> • no matching period found — choose an existing period</span>
              </div>
            </div>
          </div>

          <div class="actions" style="margin-top: 12px; justify-content: flex-end;">
            <button class="btn btn-primary" @click="confirmAutoImport" :disabled="autoImporting || !importFile || isPeriodPosted">
              {{ autoImporting ? 'Importing...' : 'Confirm & Import' }}
            </button>
          </div>
        </div>
      </div>

      <div class="actions" style="margin-top: 10px;">
        <button class="btn btn-secondary" @click="openRawModal" :disabled="!selectedPeriodId">
          Raw Import (View)
        </button>
        <button class="btn btn-secondary" @click="openCarryoverModal" :disabled="!selectedPeriodId || isPeriodPosted">
          No-note/Draft Unpaid
        </button>
        <button class="btn btn-secondary" @click="openPayrollToolsModal">
          Payroll Tools (Checker)
        </button>
        <button class="btn btn-secondary" type="button" @click="openSubmitOnBehalfModal" :disabled="!agencyId">
          Submit on behalf
        </button>
        <button class="btn btn-secondary" type="button" @click="openTodoModal" :disabled="!selectedPeriodId">
          Add Single/Recurring Note or To Do
        </button>
        <button class="btn btn-secondary" @click="showStageModal = true" :disabled="!selectedPeriodId">
          Payroll Stage
        </button>
        <button class="btn btn-primary" @click="runPayroll" :disabled="runningPayroll || isPeriodPosted || !selectedPeriodId">
          {{
            runningPayroll
              ? 'Running...'
              : (isPeriodPosted ? 'Locked' : (canSeeRunResults ? 'Re-run Payroll' : 'Run Payroll'))
          }}
        </button>
        <button
          v-if="canSeeRunResults"
          class="btn btn-secondary"
          type="button"
          @click.prevent.stop="openRunResultsModalV2"
          :disabled="!selectedPeriodId"
        >
          View Ran Payroll
        </button>
        <button
          v-if="canSeeRunResults"
          class="btn btn-secondary"
          type="button"
          @click.prevent.stop="openPreviewPostModalV2"
          :disabled="!selectedPeriodId"
        >
          Preview Post
        </button>
        <button
          class="btn btn-secondary"
          type="button"
          @click.prevent.stop="openPayrollReports"
          :disabled="!selectedPeriodId"
        >
          Reports
        </button>
        <button class="btn btn-primary" @click="postPayroll" :disabled="postingPayroll || isPeriodPosted || selectedPeriodStatus !== 'ran'">
          {{ postingPayroll ? 'Posting...' : (isPeriodPosted ? 'Posted' : 'Post Payroll') }}
        </button>
        <button
          v-if="isSuperAdmin && isPeriodPosted"
          class="btn btn-danger"
          type="button"
          @click.prevent.stop="unpostPayroll"
          :disabled="unpostingPayroll || !selectedPeriodId"
          title="Super admin only: revert a posted period back to Ran"
        >
          {{ unpostingPayroll ? 'Unposting...' : 'Unpost (Super Admin)' }}
        </button>
        <button class="btn btn-danger" @click="resetPeriod" :disabled="resettingPeriod || !selectedPeriodId">
          {{ resettingPeriod ? 'Resetting...' : 'Reset Pay Period' }}
        </button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2 class="card-title">Pay Periods (History)</h2>
        <div class="hint">Pay periods are created automatically when you import a report.</div>

        <div class="field" style="margin-top: 10px;">
          <label style="display: inline-flex; gap: 8px; align-items: center; font-weight: 600;">
            <input type="checkbox" v-model="showOffSchedulePeriods" @change="loadPeriods" />
            Show off-schedule periods
          </label>
          <div class="hint" style="margin-top: 4px;">
            Off-schedule periods are legacy/incorrect date ranges (e.g., 01/10→01/23) that don’t match this agency’s configured cadence.
          </div>
        </div>

        <div class="field" style="margin-top: 10px;">
          <input
            v-model="historySearch"
            type="text"
            placeholder="Search pay periods…"
            style="padding: 8px 12px; border: 1px solid var(--border, #dee2e6); border-radius: 6px; font-size: 14px; width: 100%;"
          />
        </div>

        <div class="list">
          <button
            v-for="p in historyPeriodsFiltered"
            :key="p.id"
            class="list-item"
            :class="{ active: selectedPeriodId === p.id }"
            @click="selectPeriod(p.id)"
          >
            <div class="list-item-title">{{ periodRangeLabel(p) }}</div>
            <div class="list-item-meta">
              {{ p.status }}
              <span v-if="p.status === 'finalized' && (p.finalized_by_first_name || p.finalized_by_last_name || p.finalized_at)">
                • Ran by {{ p.finalized_by_first_name }} {{ p.finalized_by_last_name }} <span v-if="p.finalized_at">({{ fmtDateTime(p.finalized_at) }})</span>
              </span>
            </div>
          </button>
        </div>
      </div>

      <div class="card" v-if="selectedPeriodForUi">
        <h2 class="card-title">Period Details</h2>
        <div class="field-row" style="margin-top: 8px;">
          <div class="field">
            <label>Pay Period</label>
            <select v-model="selectedPeriodId" :key="`period-details-${agencyId || 'none'}-${(periods || []).length}`">
              <option :value="null" disabled>Select a pay period…</option>
              <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
            </select>
          </div>
          <div class="field">
            <label>Provider</label>
            <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end;">
              <select v-model="selectedUserId">
                <option :value="null" disabled>Select a provider…</option>
                <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
              </select>
              <button class="btn btn-secondary btn-sm" @click="clearSelectedProvider" :disabled="!selectedUserId">
                Clear
              </button>
            </div>
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <div class="hint">Use this to filter Payroll Stage and review provider totals.</div>
          </div>
        </div>
        <div class="period-meta">
          <div><strong>Pay Period:</strong> {{ periodRangeLabel(selectedPeriodForUi) }}</div>
          <div><strong>Status:</strong> {{ selectedPeriodStatus }}</div>
          <div v-if="selectedPeriodStatus === 'ran'">
            <strong>Ran:</strong>
            <span v-if="selectedPeriodForUi?.ran_at">{{ fmtDateTime(selectedPeriodForUi.ran_at) }}</span>
          </div>
          <div v-if="selectedPeriodStatus === 'posted' || selectedPeriodStatus === 'finalized'">
            <strong>Posted:</strong>
            <span v-if="selectedPeriodForUi?.posted_at">{{ fmtDateTime(selectedPeriodForUi.posted_at) }}</span>
          </div>
        </div>

        <div v-if="canSeeRunResults">
          <h3 class="section-title">Run Payroll (Totals)</h3>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Provider</th>
                  <th class="right">No Note</th>
                  <th class="right">Draft</th>
                  <th class="right">Finalized</th>
                  <th class="right">Tier (Final)</th>
                  <th class="right">Credits/Hours</th>
                  <th class="right">Direct Credits</th>
                  <th class="right">Indirect Credits</th>
                  <th class="right">Other Credits</th>
                <th class="right">Subtotal</th>
                  <th class="right">Direct Hourly Rate</th>
                  <th class="right">Indirect Hourly Rate</th>
                  <th class="right">Effective Hourly Rate</th>
                  <th class="right">Adjustments</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
                <tr v-for="s in summariesSortedByProvider" :key="s.id" @click="selectSummary(s)" class="clickable">
                  <!-- compute pay totals from breakdown (non-flat only) -->
                  <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <td>{{ s.first_name }} {{ s.last_name }}</td>
                  <td class="right">{{ fmtNum(s.no_note_units ?? 0) }}</td>
                  <td class="right">{{ fmtNum(s.draft_units ?? 0) }}</td>
                  <td class="right">{{ fmtNum(s.finalized_units ?? s.total_units ?? 0) }}</td>
                  <td class="right">
                    {{ fmtNum(s.tier_credits_final ?? s.tier_credits_current ?? 0) }}
                    <span v-if="s.grace_active" class="muted"> (grace)</span>
                  </td>
                  <td class="right">{{ fmtNum(s.total_hours ?? 0) }}</td>
                  <td class="right">{{ fmtNum(s.direct_hours ?? 0) }}</td>
                  <td class="right">{{ fmtNum(s.indirect_hours ?? 0) }}</td>
                  <td class="right">{{ fmtNum(((s.total_hours ?? 0) - (s.direct_hours ?? 0) - (s.indirect_hours ?? 0)) || 0) }}</td>
                <td class="right">{{ fmtMoney(s.subtotal_amount) }}</td>
                  <td class="right muted">
                    {{
                      (() => {
                        const { directAmount } = payTotalsFromBreakdown(s.breakdown);
                        const h = Number(s.direct_hours || 0);
                        return h > 0 ? fmtMoney(directAmount / h) : '—';
                      })()
                    }}
                  </td>
                  <td class="right muted">
                    {{
                      (() => {
                        const { indirectAmount } = payTotalsFromBreakdown(s.breakdown);
                        const h = Number(s.indirect_hours || 0);
                        return h > 0 ? fmtMoney(indirectAmount / h) : '—';
                      })()
                    }}
                  </td>
                  <td class="right muted">
                    {{
                      (() => {
                        const total = Number(s.total_hours || 0);
                        const directH = Number(s.direct_hours || 0);
                        const indirectH = Number(s.indirect_hours || 0);
                        const otherH = Math.max(0, total - directH - indirectH);
                        if (directH > 0 && indirectH <= 1e-9 && otherH <= 1e-9) {
                          const { directAmount } = payTotalsFromBreakdown(s.breakdown);
                          return fmtMoney(directAmount / (total || 1));
                        }
                        return '—';
                      })()
                    }}
                  </td>
                  <td class="right">{{ fmtMoney(s.adjustments_amount) }}</td>
                <td class="right">{{ fmtMoney(s.total_amount) }}</td>
              </tr>
              <tr v-if="!summaries.length">
                  <td colspan="15" class="muted">No run results yet. Click “Run Payroll”.</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
        <div v-else class="hint" style="margin-top: 10px;">
          Run results are private until you click <strong>Run Payroll</strong>. Providers will not see anything until <strong>Post Payroll</strong>.
        </div>

        <!-- Submit on behalf modal -->
        <teleport to="body">
          <div v-if="showSubmitOnBehalfModal" class="modal-backdrop" @click.self="closeSubmitOnBehalfModal">
            <div class="modal" style="width: min(1100px, 100%);">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Submit on behalf</div>
                  <div class="hint">
                    Submit payroll requests on behalf of a provider. These will appear in their history and in the normal payroll queues.
                  </div>
                </div>
                <div class="actions" style="margin: 0; justify-content: flex-end;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="closeSubmitOnBehalfModal">Close</button>
                </div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <div v-if="!agencyId" class="warn-box">
                  Select an organization first to use Submit on behalf.
                </div>

                <div v-else>
                  <div class="field-row" style="grid-template-columns: 1fr 1fr auto; align-items: end; gap: 10px;">
                    <div class="field">
                      <label>Search provider</label>
                      <input v-model="submitOnBehalfSearch" type="text" placeholder="Search name or email…" />
                    </div>
                    <div class="field">
                      <label>Provider</label>
                      <select v-model="submitOnBehalfUserId">
                        <option :value="null" disabled>Select a provider…</option>
                        <option v-for="u in submitOnBehalfUsers" :key="u.id" :value="u.id">
                          {{ u.last_name }}, {{ u.first_name }} <span v-if="u.email">({{ u.email }})</span>
                        </option>
                      </select>
                      <div class="hint" style="margin-top: 6px;">
                        {{ submitOnBehalfUserId ? `Selected: ${submitOnBehalfUserName}` : 'Select a provider to submit requests.' }}
                      </div>
                      <div v-if="submitOnBehalfUserId && submitOnBehalfTierUi" class="hint" style="margin-top: 6px;">
                        {{ submitOnBehalfTierUi.label }}
                      </div>
                    </div>
                    <div class="actions" style="margin: 0; justify-content: flex-end; gap: 8px;">
                      <button class="btn btn-secondary btn-sm" type="button" @click="clearSubmitOnBehalfProvider" :disabled="!submitOnBehalfUserId">
                        Clear
                      </button>
                      <button class="btn btn-secondary btn-sm" type="button" @click="nextSubmitOnBehalfProvider" :disabled="!submitOnBehalfUsers.length">
                        Next
                      </button>
                    </div>
                  </div>

                  <div v-if="loadingUsers" class="muted" style="margin-top: 10px;">Loading providers…</div>
                  <div v-else-if="submitOnBehalfUserId" style="margin-top: 10px;">
                    <AdminPayrollSubmitOverride
                      :agency-id="agencyId"
                      :user-id="submitOnBehalfUserId"
                      :user-name="submitOnBehalfUserName"
                      :user-medcancel-rate-schedule="submitOnBehalfUser?.medcancel_rate_schedule || null"
                    />
                  </div>
                  <div v-else class="hint" style="margin-top: 10px;">
                    Pick a provider above to begin submitting.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="showHolidayHoursModal" class="modal-backdrop">
            <div class="modal" style="width: min(980px, 100%);">
              <div class="modal-header">
                <div>
                  <div class="modal-title">Holiday hours (review)</div>
                  <div class="hint">Payable services from the latest import that occurred on configured holiday dates.</div>
                </div>
                <div class="actions" style="margin: 0;">
                  <button class="btn btn-secondary btn-sm" type="button" @click="loadHolidayHoursReport" :disabled="holidayHoursLoading || !selectedPeriodId">
                    Refresh
                  </button>
                  <button class="btn btn-secondary btn-sm" type="button" @click="showHolidayHoursModal = false" style="margin-left: 8px;">
                    Close
                  </button>
                </div>
              </div>

              <div v-if="holidayHoursError" class="warn-box" style="margin-top: 12px;">{{ holidayHoursError }}</div>
              <div v-if="holidayHoursLoading" class="muted" style="margin-top: 12px;">Loading holiday hours…</div>

              <div v-else style="margin-top: 12px;">
                <div v-if="!(holidayHoursMatched || []).length" class="muted">
                  No payable services on configured holiday dates were found for this pay period (latest import).
                </div>

                <div v-else class="table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Service code</th>
                        <th>Holiday dates</th>
                        <th class="right">Sessions</th>
                        <th class="right">Units</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in holidayHoursMatched" :key="`${r.user_id}:${r.service_code}`">
                        <td>{{ holidayHoursProviderLabel(r) }}</td>
                        <td>{{ r.service_code }}</td>
                        <td class="muted">{{ r.holiday_dates_csv || '—' }}</td>
                        <td class="right">{{ fmtNum(Number(r.session_count || 0)) }}</td>
                        <td class="right"><strong>{{ fmtNum(Number(r.units_total || 0)) }}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-if="(holidayHoursUnmatched || []).length" class="warn-box" style="margin-top: 12px;">
                  <div><strong>Unmatched providers</strong> (no user match on import row):</div>
                  <div class="muted" style="margin-top: 6px;">
                    {{ holidayHoursUnmatched.slice(0, 25).map((x) => `${x.provider_name || '—'} (${x.service_code})`).join(', ') }}
                    <span v-if="holidayHoursUnmatched.length > 25" class="muted">… (+{{ holidayHoursUnmatched.length - 25 }} more)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </teleport>

        <!-- Payroll Stage modal -->
        <div v-show="showStageModal" class="modal-backdrop" @click.self="showStageModal = false">
          <div class="modal" style="width: min(95vw, 1800px); max-height: 95vh;">
            <div class="modal-header">
              <div>
                <div class="modal-title">Payroll Stage</div>
                <div class="hint">Edit the workspace + per-user adjustments before running payroll.</div>
              </div>
              <div class="actions" style="margin: 0; justify-content: flex-end;">
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="restagePeriod"
                  :disabled="restagingPeriod || isPeriodPosted || selectedPeriodStatus !== 'ran'"
                  :title="isPeriodPosted ? 'This pay period is posted. Unpost first if you need to restage.' : 'Clear run results and return this pay period to staging (does not delete imports or edits).'"
                >
                  {{ restagingPeriod ? 'Restaging…' : 'Restage' }}
                </button>
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  @click="openHolidayHoursModal"
                  :disabled="!selectedPeriodId"
                  style="margin-left: 8px;"
                  title="Review payable imported services that occurred on configured holiday dates (latest import)."
                >
                  Review holiday hours
                </button>
                <button
                  v-if="isSuperAdmin && isPeriodPosted"
                  class="btn btn-danger btn-sm"
                  type="button"
                  @click.prevent.stop="unpostPayroll"
                  style="margin-left: 8px;"
                  title="Super admin only: revert posted → ran"
                >
                  Unpost
                </button>
                <button class="btn btn-secondary btn-sm" @click="showStageModal = false" style="margin-left: 8px;">Close</button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px; border-left: 4px solid var(--danger);">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Blocking Payroll To‑Dos</h3>
              <div class="hint">Payroll cannot be run until all To‑Dos for this pay period are marked Done.</div>
              <div v-if="payrollTodosError" class="warn-box" style="margin-top: 8px;">{{ payrollTodosError }}</div>
              <div v-if="payrollTodosLoading" class="muted" style="margin-top: 8px;">Loading To‑Dos…</div>
              <div v-else-if="!(payrollTodos || []).length" class="muted" style="margin-top: 8px;">No To‑Dos yet.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 90px;">Done</th>
                      <th>To‑Do</th>
                      <th style="width: 220px;">Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in payrollTodos" :key="t.id">
                      <td>
                        <input
                          type="checkbox"
                          :checked="String(t.status || '').toLowerCase() === 'done'"
                          :disabled="updatingPayrollTodoId === t.id"
                          @change="togglePayrollTodoDone(t, $event.target.checked)"
                        />
                      </td>
                      <td>
                        <div><strong>{{ t.title }}</strong></div>
                        <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                      </td>
                      <td class="muted">
                        <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                        <span v-else>Agency-wide</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" type="button" @click="openTodoModal" :disabled="!selectedPeriodId">
                  Manage To‑Dos
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Providers in this payroll (Tier — live)</h3>
              <div class="hint">
                Based on the raw import for this pay period. Tier preview updates as you save workspace edits / draft-payable decisions.
              </div>
              <div class="field-row" style="grid-template-columns: 1fr auto; margin-top: 10px; align-items: end;">
                <div />
                <div class="field" style="min-width: 220px;">
                  <label>Sort</label>
                  <select v-model="payrollStageTierSort">
                    <option value="tier_desc">Tier (high → low)</option>
                    <option value="tier_asc">Tier (low → high)</option>
                    <option value="name_asc">Name (A → Z)</option>
                  </select>
                </div>
              </div>
              <div v-if="!(payrollStageProviderTierRows.matched || []).length && !(payrollStageProviderTierRows.unmatched || []).length" class="muted" style="margin-top: 8px;">
                No providers found in the raw import yet.
              </div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th class="right">Salary</th>
                      <th>Current (this pay period)</th>
                      <th>Last pay period tier</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in (payrollStageProviderTierRows.matched || [])" :key="p.key">
                      <td>{{ p.name }}</td>
                      <td class="right" :title="p.salaryTooltip || ''">
                        <strong v-if="p.salaryAmount !== null">{{ fmtMoney(p.salaryAmount) }}</strong>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="muted" :title="p.currentTooltip || ''">
                        <span>{{ p.currentLabel }}</span>
                        <span v-if="p.currentStatus" class="tier-chip" :class="{ grace: p.currentStatus === 'Grace' }">
                          {{ p.currentStatus }}
                        </span>
                      </td>
                      <td class="muted">{{ p.lastTierLabel }}</td>
                    </tr>
                    <tr v-if="(payrollStageProviderTierRows.unmatched || []).length">
                      <td colspan="4" class="warn-box" style="margin-top: 8px;">
                        <div><strong>Unmatched provider names in raw import</strong> (no user match):</div>
                        <div class="muted" style="margin-top: 6px;">
                          {{ (payrollStageProviderTierRows.unmatched || []).slice(0, 25).join(', ') }}
                          <span v-if="(payrollStageProviderTierRows.unmatched || []).length > 25" class="muted">
                            … (+{{ (payrollStageProviderTierRows.unmatched || []).length - 25 }} more)
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Mileage Submissions (Pending)</h3>
              <div class="hint">Payroll cannot be run while mileage submissions for this pay period are still pending approval.</div>
              <div v-if="pendingMileageError" class="warn-box" style="margin-top: 8px;">{{ pendingMileageError }}</div>
              <div v-if="pendingMileageLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingMileageClaims.length" class="muted" style="margin-top: 8px;">No pending mileage submissions for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Submitted</th>
                      <th>Submitted by</th>
                      <th>Date</th>
                      <th class="right">Eligible miles</th>
                      <th class="right">Tier</th>
                      <th class="right">Pay period</th>
                      <th class="right">Est.</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingMileageClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ submittedAtYmd(c) }}</td>
                      <td>{{ submitterLabel(c) }}</td>
                      <td>{{ c.drive_date }}</td>
                      <td class="right">
                        {{ fmtNum(Number(c.eligible_miles ?? c.miles ?? 0)) }}
                      </td>
                      <td class="right">
                        <select v-model="mileageTierByClaimId[c.id]" :disabled="approvingMileageClaimId === c.id">
                          <option :value="1">Tier 1</option>
                          <option :value="2">Tier 2</option>
                          <option :value="3">Tier 3</option>
                        </select>
                      </td>
                      <td class="right">
                        <select v-model="mileageTargetPeriodByClaimId[c.id]" :disabled="approvingMileageClaimId === c.id">
                          <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right" :title="estimateMileageTitle(c)">
                        {{ estimateMileageDisplay(c) }}
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button class="btn btn-secondary btn-sm" @click="openMileageDetails(c)">
                            View
                          </button>
                          <button class="btn btn-primary btn-sm" @click="approveMileageClaim(c)" :disabled="approvingMileageClaimId === c.id || !isValidTargetPeriodId(mileageTargetPeriodByClaimId[c.id]) || isTargetPeriodLocked(mileageTargetPeriodByClaimId[c.id])">
                            {{ approvingMileageClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnMileageClaim(c)" :disabled="approvingMileageClaimId === c.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectMileageClaim(c)" :disabled="approvingMileageClaimId === c.id">
                            Reject
                          </button>
            </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
            </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingMileageClaims" :disabled="pendingMileageLoading || !agencyId">
                  Refresh pending
                </button>
                <button class="btn btn-secondary" @click="loadPendingMileageClaims" :disabled="pendingMileageLoading || !selectedPeriodId">
                  This pay period only
                </button>
                <button class="btn btn-secondary" @click="loadAllPendingMileageClaims" :disabled="pendingMileageLoading || !agencyId">
                  Show all pending (any period)
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">MedCancel Submissions (Pending)</h3>
              <div class="hint">Payroll cannot be run while MedCancel submissions for this pay period are still pending approval.</div>
              <div v-if="pendingMedcancelError" class="warn-box" style="margin-top: 8px;">{{ pendingMedcancelError }}</div>
              <div v-if="pendingMedcancelLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingMedcancelClaims.length" class="muted" style="margin-top: 8px;">No pending MedCancel submissions for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Submitted</th>
                      <th>Submitted by</th>
                      <th>Date</th>
                      <th class="right">Units</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingMedcancelClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ submittedAtYmd(c) }}</td>
                      <td>{{ submitterLabel(c) }}</td>
                      <td>{{ c.claim_date }}</td>
                      <td class="right">{{ fmtNum(Number(c.units ?? 0)) }}</td>
                      <td class="right">
                        <select v-model="medcancelTargetPeriodByClaimId[c.id]" :disabled="approvingMedcancelClaimId === c.id">
                          <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button class="btn btn-primary btn-sm" @click="approveMedcancelClaim(c)" :disabled="approvingMedcancelClaimId === c.id || !isValidTargetPeriodId(medcancelTargetPeriodByClaimId[c.id]) || isTargetPeriodLocked(medcancelTargetPeriodByClaimId[c.id])">
                            {{ approvingMedcancelClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnMedcancelClaim(c)" :disabled="approvingMedcancelClaimId === c.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectMedcancelClaim(c)" :disabled="approvingMedcancelClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingMedcancelClaims" :disabled="pendingMedcancelLoading || !agencyId">
                  Refresh pending
                </button>
                <button class="btn btn-secondary" @click="loadPendingMedcancelClaims" :disabled="pendingMedcancelLoading || !selectedPeriodId">
                  This pay period only
                </button>
                <button class="btn btn-secondary" @click="loadAllPendingMedcancelClaims" :disabled="pendingMedcancelLoading || !agencyId">
                  Show all pending (any period)
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Reimbursement Submissions (Pending)</h3>
              <div class="hint">Approved reimbursements are added as adjustments in the selected pay period.</div>
              <div v-if="pendingReimbursementError" class="warn-box" style="margin-top: 8px;">{{ pendingReimbursementError }}</div>
              <div v-if="pendingReimbursementLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingReimbursementClaims.length" class="muted" style="margin-top: 8px;">No pending reimbursements for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Submitted</th>
                      <th>Submitted by</th>
                      <th>Date</th>
                      <th class="right">Amount</th>
                      <th>Details</th>
                      <th>Receipt</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingReimbursementClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ submittedAtYmd(c) }}</td>
                      <td>{{ submitterLabel(c) }}</td>
                      <td>{{ c.expense_date }}</td>
                      <td class="right">{{ fmtMoney(Number(c.amount || 0)) }}</td>
                      <td>
                        <div class="muted" style="line-height: 1.25;">
                          <div v-if="c.payment_method"><strong>Payment:</strong> {{ String(c.payment_method || '').replaceAll('_',' ') }}</div>
                          <div v-if="c.purchase_approved_by"><strong>Approver:</strong> {{ c.purchase_approved_by }}</div>
                          <div v-if="c.project_ref"><strong>Project:</strong> {{ c.project_ref }}</div>
                          <div v-if="c.reason"><strong>Reason:</strong> {{ c.reason }}</div>
                          <div v-if="splitSummary(c)"><strong>Split:</strong> {{ splitSummary(c) }}</div>
                        </div>
                      </td>
                      <td>
                        <a v-if="c.receipt_file_path" :href="receiptUrl(c)" target="_blank" rel="noopener noreferrer">View</a>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">
                        <select v-model="reimbursementTargetPeriodByClaimId[c.id]" :disabled="approvingReimbursementClaimId === c.id">
                          <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-primary btn-sm"
                            @click="approveReimbursementClaim(c)"
                            :disabled="approvingReimbursementClaimId === c.id || !isValidTargetPeriodId(reimbursementTargetPeriodByClaimId[c.id]) || isTargetPeriodLocked(reimbursementTargetPeriodByClaimId[c.id])"
                          >
                            {{ approvingReimbursementClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnReimbursementClaim(c)" :disabled="approvingReimbursementClaimId === c.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectReimbursementClaim(c)" :disabled="approvingReimbursementClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingReimbursementClaims" :disabled="pendingReimbursementLoading || !agencyId">
                  Show all pending (any period)
                </button>
                <button class="btn btn-secondary" @click="loadPendingReimbursementClaims" :disabled="pendingReimbursementLoading || !selectedPeriodId">
                  This pay period only
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Time Claims (Pending)</h3>
              <div class="hint">Meeting/training, excess/holiday, service corrections, and overtime evaluations.</div>
              <div v-if="pendingTimeError" class="warn-box" style="margin-top: 8px;">{{ pendingTimeError }}</div>
              <div v-if="pendingTimeLoading" class="muted" style="margin-top: 8px;">Loading pending submissions…</div>
              <div v-else-if="!pendingTimeClaims.length" class="muted" style="margin-top: 8px;">No pending time claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Submitted</th>
                      <th>Submitted by</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th class="right">Bucket</th>
                      <th class="right">Hours/Credits</th>
                      <th class="right">Applied $</th>
                      <th class="right">Pay period</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingTimeClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ submittedAtYmd(c) }}</td>
                      <td>{{ submitterLabel(c) }}</td>
                      <td>{{ c.claim_date }}</td>
                      <td>{{ timeTypeLabel(c) }}</td>
                      <td class="right">
                        <select v-model="timeBucketByClaimId[c.id]" :disabled="approvingTimeClaimId === c.id">
                          <option value="indirect">Indirect</option>
                          <option value="direct">Direct</option>
                        </select>
                      </td>
                      <td class="right">
                        <input
                          v-model="timeCreditsHoursByClaimId[c.id]"
                          type="number"
                          step="0.01"
                          placeholder="(blank)"
                          :disabled="approvingTimeClaimId === c.id"
                          style="width: 120px;"
                        />
                      </td>
                      <td class="right">
                        <input
                          v-model="timeAppliedAmountOverrideByClaimId[c.id]"
                          type="number"
                          step="0.01"
                          placeholder="(blank)"
                          :disabled="approvingTimeClaimId === c.id"
                          style="width: 120px;"
                        />
                      </td>
                      <td class="right">
                        <select v-model="timeTargetPeriodByClaimId[c.id]" :disabled="approvingTimeClaimId === c.id">
                          <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                        </select>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-primary btn-sm"
                            @click="approveTimeClaim(c)"
                            :disabled="approvingTimeClaimId === c.id || !isValidTargetPeriodId(timeTargetPeriodByClaimId[c.id]) || isTargetPeriodLocked(timeTargetPeriodByClaimId[c.id])"
                          >
                            {{ approvingTimeClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnTimeClaim(c)" :disabled="approvingTimeClaimId === c.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectTimeClaim(c)" :disabled="approvingTimeClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingTimeClaims" :disabled="pendingTimeLoading || !agencyId">
                  Show all pending (any period)
                </button>
                <button class="btn btn-secondary" @click="loadPendingTimeClaims" :disabled="pendingTimeLoading || !selectedPeriodId">
                  This pay period only
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Holiday Bonus (Pending)</h3>
              <div class="hint">
                System-generated approvals when payable services occur on configured agency holiday dates. Approve/reject to include/exclude Holiday Bonus in payroll.
              </div>
              <div v-if="pendingHolidayBonusError" class="warn-box" style="margin-top: 8px;">{{ pendingHolidayBonusError }}</div>
              <div v-if="pendingHolidayBonusLoading" class="muted" style="margin-top: 8px;">Loading pending holiday bonuses…</div>
              <div v-else-if="!pendingHolidayBonusClaims.length" class="muted" style="margin-top: 8px;">No pending holiday bonuses for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Holiday dates</th>
                      <th class="right">Base service pay</th>
                      <th class="right">%</th>
                      <th class="right">Bonus</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in pendingHolidayBonusClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td class="muted">{{ holidayBonusDatesLabel(c) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.base_service_pay_amount || 0)) }}</td>
                      <td class="right">{{ fmtNum(Number(c.holiday_bonus_percent || 0)) }}</td>
                      <td class="right"><strong>{{ fmtMoney(Number(c.applied_amount || 0)) }}</strong></td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-primary btn-sm"
                            @click="approveHolidayBonusClaim(c)"
                            :disabled="updatingHolidayBonusClaimId === c.id"
                          >
                            {{ updatingHolidayBonusClaimId === c.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectHolidayBonusClaim(c)" :disabled="updatingHolidayBonusClaimId === c.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingHolidayBonusClaims" :disabled="pendingHolidayBonusLoading || !agencyId">
                  Show all pending (any period)
                </button>
                <button class="btn btn-secondary" @click="loadPendingHolidayBonusClaims" :disabled="pendingHolidayBonusLoading || !selectedPeriodId">
                  This pay period only
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">PTO Requests (Pending)</h3>
              <div class="hint">Approve to deduct PTO balances and post PTO pay into payroll adjustments (uses agency default PTO rate).</div>
              <div v-if="pendingPtoError" class="warn-box" style="margin-top: 8px;">{{ pendingPtoError }}</div>
              <div v-if="pendingPtoLoading" class="muted" style="margin-top: 8px;">Loading pending requests…</div>
              <div v-else-if="!pendingPtoRequests.length" class="muted" style="margin-top: 8px;">No pending PTO requests.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Created</th>
                      <th>Submitted by</th>
                      <th>Type</th>
                      <th class="right">Hours</th>
                      <th class="right">Starting balance</th>
                      <th class="right">New balance</th>
                      <th>First date</th>
                      <th>Proof</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in pendingPtoRequests" :key="r.id">
                      <td>{{ nameForUserId(r.user_id) }}</td>
                      <td>{{ String(r.created_at || '').slice(0, 10) }}</td>
                      <td>{{ submitterLabel(r) }}</td>
                      <td>{{ String(r.request_type || '').toLowerCase() === 'training' ? 'Training PTO' : 'Sick Leave' }}</td>
                      <td class="right">{{ fmtNum(Number(r.total_hours || 0)) }}</td>
                      <td class="right">
                        {{ fmtNum(ptoBalancePreviewForRequest(r).start) }}
                      </td>
                      <td class="right">
                        <span :class="ptoBalancePreviewForRequest(r).next < -1e-9 ? 'warn' : ''">
                          {{ fmtNum(ptoBalancePreviewForRequest(r).next) }}
                        </span>
                      </td>
                      <td>
                        {{
                          (() => {
                            const items = Array.isArray(r?.items) ? r.items : [];
                            const dates = items
                              .map((it) => String(it?.request_date || it?.requestDate || '').slice(0, 10))
                              .filter(Boolean)
                              .sort();
                            return dates[0] || '—';
                          })()
                        }}
                      </td>
                      <td>
                        <a v-if="r.proof_file_path" :href="receiptUrl({ receipt_file_path: r.proof_file_path })" target="_blank" rel="noopener noreferrer">View</a>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button class="btn btn-primary btn-sm" @click="approvePtoRequest(r)" :disabled="approvingPtoRequestId === r.id">
                            {{ approvingPtoRequestId === r.id ? 'Approving…' : 'Approve' }}
                          </button>
                          <button class="btn btn-secondary btn-sm" @click="returnPtoRequest(r)" :disabled="approvingPtoRequestId === r.id">
                            Send back…
                          </button>
                          <button class="btn btn-danger btn-sm" @click="rejectPtoRequest(r)" :disabled="approvingPtoRequestId === r.id">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadAllPendingPtoRequests" :disabled="pendingPtoLoading || !agencyId">
                  Show all pending (any period)
                </button>
                <button class="btn btn-secondary" @click="loadPendingPtoRequests" :disabled="pendingPtoLoading || !selectedPeriodId">
                  This pay period only
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Supervision Hours (Import CSV)</h3>
              <div class="hint">
                Upload a CSV for this pay period. Columns: <code>email</code> (or <code>user_id</code>), <code>individual_hours</code>, <code>group_hours</code>.
              </div>
              <div v-if="supervisionImportError" class="warn-box" style="margin-top: 8px;">{{ supervisionImportError }}</div>

              <div class="field-row" style="margin-top: 10px; grid-template-columns: 1fr auto;">
                <div class="field">
                  <input type="file" accept=".csv,text/csv" @change="onSupervisionCsvPick" />
                  <div class="muted" v-if="supervisionCsvName" style="margin-top: 6px;">Selected: <strong>{{ supervisionCsvName }}</strong></div>
                </div>
                <div class="actions" style="justify-content: flex-end; margin-top: 0;">
                  <button class="btn btn-primary" @click="uploadSupervisionCsv" :disabled="supervisionImporting || !supervisionCsvFile || !selectedPeriodId">
                    {{ supervisionImporting ? 'Uploading…' : 'Upload' }}
                  </button>
                </div>
              </div>

              <div v-if="supervisionImportResult" class="muted" style="margin-top: 10px;">
                Applied {{ supervisionImportResult.counts?.ok || 0 }} rows; skipped {{ supervisionImportResult.counts?.skipped || 0 }}.
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Mileage (This pay period)</h3>
              <div class="hint">After approval, claims leave “Pending” and appear here (and in provider totals).</div>
              <div v-if="approvedMileageListError" class="warn-box" style="margin-top: 8px;">{{ approvedMileageListError }}</div>
              <div v-if="approvedMileageListLoading" class="muted" style="margin-top: 8px;">Loading approved mileage…</div>
              <div v-else-if="!approvedMileageClaims.length" class="muted" style="margin-top: 8px;">No approved mileage claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Eligible miles</th>
                      <th class="right">Move to</th>
                      <th class="right">Amount</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedMileageClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.drive_date }}</td>
                      <td class="right">{{ fmtNum(Number(c.eligible_miles ?? c.miles ?? 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <select
                            v-model="approvedMileageMoveTargetByClaimId[c.id]"
                            :disabled="movingMileageClaimId === c.id"
                          >
                            <option v-for="p in periods" :key="p.id" :value="p.id">
                              {{ periodRangeLabel(p) }}
                            </option>
                          </select>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="moveApprovedMileageClaim(c)"
                            :disabled="
                              movingMileageClaimId === c.id ||
                              !isValidTargetPeriodId(approvedMileageMoveTargetByClaimId[c.id]) ||
                              isTargetPeriodLocked(approvedMileageMoveTargetByClaimId[c.id])
                            "
                          >
                            {{ movingMileageClaimId === c.id ? 'Moving…' : 'Move' }}
                          </button>
                        </div>
                      </td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveMileageClaim(c)"
                            :disabled="movingMileageClaimId === c.id || isTargetPeriodLocked(c.target_payroll_period_id)"
                          >
                            Unapprove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedMileageClaimsList" :disabled="approvedMileageListLoading || !selectedPeriodId">
                  Refresh approved mileage
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Med Cancel (This pay period)</h3>
              <div class="hint">After approval, claims leave “Pending” and appear here (and in provider totals).</div>
              <div v-if="approvedMedcancelListError" class="warn-box" style="margin-top: 8px;">{{ approvedMedcancelListError }}</div>
              <div v-if="approvedMedcancelListLoading" class="muted" style="margin-top: 8px;">Loading approved Med Cancel…</div>
              <div v-else-if="!approvedMedcancelClaims.length" class="muted" style="margin-top: 8px;">No approved Med Cancel claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Services</th>
                      <th class="right">Amount</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedMedcancelClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.claim_date }}</td>
                      <td class="right">{{ fmtNum(Number(c.units ?? 0)) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveMedcancelClaim(c)"
                            :disabled="unapprovingMedcancelClaimId === c.id || isTargetPeriodLocked(c.target_payroll_period_id)"
                          >
                            {{ unapprovingMedcancelClaimId === c.id ? 'Unapproving…' : 'Unapprove' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedMedcancelClaimsList" :disabled="approvedMedcancelListLoading || !selectedPeriodId">
                  Refresh approved Med Cancel
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Reimbursements (This pay period)</h3>
              <div class="hint">Approved reimbursements contribute to payroll adjustments for this pay period.</div>
              <div v-if="approvedReimbursementListError" class="warn-box" style="margin-top: 8px;">{{ approvedReimbursementListError }}</div>
              <div v-if="approvedReimbursementListLoading" class="muted" style="margin-top: 8px;">Loading approved reimbursements…</div>
              <div v-else-if="!approvedReimbursementClaims.length" class="muted" style="margin-top: 8px;">No approved reimbursements for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th class="right">Amount</th>
                      <th>Receipt</th>
                      <th class="right">Move to</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedReimbursementClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.expense_date }}</td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || c.amount || 0)) }}</td>
                      <td>
                        <a v-if="c.receipt_file_path" :href="receiptUrl(c)" target="_blank" rel="noopener noreferrer">View</a>
                        <span v-else class="muted">—</span>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <select v-model="approvedReimbursementMoveTargetByClaimId[c.id]" :disabled="movingReimbursementClaimId === c.id">
                            <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                          </select>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="moveApprovedReimbursementClaim(c)"
                            :disabled="
                              movingReimbursementClaimId === c.id ||
                              !isValidTargetPeriodId(approvedReimbursementMoveTargetByClaimId[c.id]) ||
                              isTargetPeriodLocked(approvedReimbursementMoveTargetByClaimId[c.id])
                            "
                          >
                            {{ movingReimbursementClaimId === c.id ? 'Moving…' : 'Move' }}
                          </button>
                        </div>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveReimbursementClaim(c)"
                            :disabled="movingReimbursementClaimId === c.id || isTargetPeriodLocked(c.target_payroll_period_id)"
                          >
                            Unapprove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedReimbursementClaimsList" :disabled="approvedReimbursementListLoading || !selectedPeriodId">
                  Refresh approved reimbursements
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Holiday Bonus (This pay period)</h3>
              <div class="hint">Approved holiday bonuses contribute as a single “Holiday Bonus” line item in payroll adjustments.</div>
              <div v-if="approvedHolidayBonusListError" class="warn-box" style="margin-top: 8px;">{{ approvedHolidayBonusListError }}</div>
              <div v-if="approvedHolidayBonusListLoading" class="muted" style="margin-top: 8px;">Loading approved holiday bonuses…</div>
              <div v-else-if="!approvedHolidayBonusClaims.length" class="muted" style="margin-top: 8px;">No approved holiday bonuses for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Holiday dates</th>
                      <th class="right">Base service pay</th>
                      <th class="right">%</th>
                      <th class="right">Bonus</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedHolidayBonusClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td class="muted">{{ holidayBonusDatesLabel(c) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.base_service_pay_amount || 0)) }}</td>
                      <td class="right">{{ fmtNum(Number(c.holiday_bonus_percent || 0)) }}</td>
                      <td class="right"><strong>{{ fmtMoney(Number(c.applied_amount || 0)) }}</strong></td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveHolidayBonusClaim(c)"
                            :disabled="unapprovingHolidayBonusClaimId === c.id || isTargetPeriodLocked(Number(c.payroll_period_id || selectedPeriodId))"
                          >
                            {{ unapprovingHolidayBonusClaimId === c.id ? 'Unapproving…' : 'Unapprove' }}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedHolidayBonusClaimsList" :disabled="approvedHolidayBonusListLoading || !selectedPeriodId">
                  Refresh approved holiday bonuses
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Approved Time Claims (This pay period)</h3>
              <div class="hint">Approved time claims contribute to payroll adjustments for this pay period.</div>
              <div v-if="approvedTimeListError" class="warn-box" style="margin-top: 8px;">{{ approvedTimeListError }}</div>
              <div v-if="approvedTimeListLoading" class="muted" style="margin-top: 8px;">Loading approved time claims…</div>
              <div v-else-if="!approvedTimeClaims.length" class="muted" style="margin-top: 8px;">No approved time claims for this pay period.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th class="right">Bucket</th>
                      <th class="right">Hours/Credits</th>
                      <th class="right">Amount</th>
                      <th class="right">Move to</th>
                      <th class="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in approvedTimeClaims" :key="c.id">
                      <td>{{ nameForUserId(c.user_id) }}</td>
                      <td>{{ c.claim_date }}</td>
                      <td>{{ timeTypeLabel(c) }}</td>
                      <td class="right">{{ String(c.bucket || 'indirect').toLowerCase() === 'direct' ? 'Direct' : 'Indirect' }}</td>
                      <td class="right">{{ fmtNum(Number(c.credits_hours ?? c.creditsHours ?? 0)) }}</td>
                      <td class="right">{{ fmtMoney(Number(c.applied_amount || 0)) }}</td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <select v-model="approvedTimeMoveTargetByClaimId[c.id]" :disabled="movingTimeClaimId === c.id">
                            <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                          </select>
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="moveApprovedTimeClaim(c)"
                            :disabled="
                              movingTimeClaimId === c.id ||
                              !isValidTargetPeriodId(approvedTimeMoveTargetByClaimId[c.id]) ||
                              isTargetPeriodLocked(approvedTimeMoveTargetByClaimId[c.id])
                            "
                          >
                            {{ movingTimeClaimId === c.id ? 'Moving…' : 'Move' }}
                          </button>
                        </div>
                      </td>
                      <td class="right">
                        <div class="actions" style="justify-content: flex-end; margin: 0;">
                          <button
                            class="btn btn-secondary btn-sm"
                            type="button"
                            @click="unapproveTimeClaim(c)"
                            :disabled="movingTimeClaimId === c.id || isTargetPeriodLocked(c.target_payroll_period_id)"
                          >
                            Unapprove
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="loadApprovedTimeClaimsList" :disabled="approvedTimeListLoading || !selectedPeriodId">
                  Refresh approved time claims
                </button>
              </div>
            </div>

            <div class="card" style="margin-top: 12px;">
              <h3 class="card-title" style="margin: 0 0 6px 0;">Manual Pay Lines (This pay period)</h3>
              <div class="hint">
                One-off fixes that should appear in Run Payroll and Posted Payroll for this pay period.
              </div>
              <div v-if="manualPayLinesError" class="warn-box" style="margin-top: 8px;">{{ manualPayLinesError }}</div>

              <div class="hint" style="margin-top: 8px;">
                Add as many rows as you need, then save them in one click. Amount can be negative for corrections.
              </div>

              <div v-if="isPeriodPosted" class="muted" style="margin-top: 8px;">This pay period is posted (manual lines are locked).</div>

              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th style="width: 120px;">Type</th>
                      <th style="width: 260px;">Provider</th>
                      <th style="width: 130px;">Bucket</th>
                      <th class="right" style="width: 140px;">Hours/Credits</th>
                      <th>Service / note</th>
                      <th class="right" style="width: 160px;">Amount ($)</th>
                      <th class="right" style="width: 140px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, idx) in manualPayLineDraftRows" :key="r._key">
                      <td>
                        <select v-model="r.lineType" :disabled="savingManualPayLines">
                          <option value="pay">Pay</option>
                          <option value="pto">PTO</option>
                        </select>
                      </td>
                      <td>
                        <select v-model="r.userId" :disabled="savingManualPayLines">
                          <option :value="null">Select provider…</option>
                          <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                        </select>
                      </td>
                      <td>
                        <select v-if="String(r.lineType||'pay') !== 'pto'" v-model="r.category" :disabled="savingManualPayLines">
                          <option value="direct">Direct</option>
                          <option value="indirect">Indirect</option>
                        </select>
                        <select v-else v-model="r.ptoBucket" :disabled="savingManualPayLines">
                          <option value="sick">Sick PTO</option>
                          <option value="training">Training PTO</option>
                        </select>
                      </td>
                      <td class="right">
                        <input
                          v-model="r.creditsHours"
                          type="number"
                          step="0.01"
                          :placeholder="String(r.lineType||'pay') === 'pto' ? 'required' : '(blank)'"
                          :disabled="savingManualPayLines"
                          style="width: 120px;"
                        />
                      </td>
                      <td>
                        <input v-model="r.label" type="text" placeholder="e.g., Manual correction" :disabled="savingManualPayLines" />
                      </td>
                      <td class="right">
                        <input
                          v-model="r.amount"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          :disabled="savingManualPayLines || String(r.lineType||'pay') === 'pto'"
                        />
                      </td>
                      <td class="right">
                        <button
                          class="btn btn-secondary btn-sm"
                          type="button"
                          @click="removeManualPayLineDraftRow(idx)"
                          :disabled="savingManualPayLines || manualPayLineDraftRows.length <= 1"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="actions" style="margin-top: 10px; justify-content: space-between;">
                <button class="btn btn-secondary" type="button" @click="addManualPayLineDraftRow" :disabled="savingManualPayLines || isPeriodPosted">
                  Add another row
                </button>
                <button
                  class="btn btn-primary"
                  type="button"
                  @click="saveManualPayLines"
                  :disabled="savingManualPayLines || isPeriodPosted || !hasValidManualPayLineDraft"
                >
                  {{ savingManualPayLines ? 'Saving…' : 'Save manual lines' }}
                </button>
              </div>

              <div v-if="manualPayLinesLoading" class="muted" style="margin-top: 8px;">Loading manual pay lines…</div>
              <div v-else-if="!manualPayLines.length" class="muted" style="margin-top: 8px;">No manual lines yet.</div>
              <div v-else class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Category</th>
                      <th>Service</th>
                      <th class="right">Amount</th>
                      <th class="right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="l in manualPayLines" :key="l.id">
                      <td>{{ nameForUserId(l.user_id) }}</td>
                      <td class="muted">{{ String(l.category || 'direct').toUpperCase() }}</td>
                      <td>{{ l.label }}</td>
                      <td class="right">{{ fmtMoney(Number(l.amount || 0)) }}</td>
                      <td class="right">
                        <button
                          class="btn btn-danger btn-sm"
                          type="button"
                          @click="deleteManualPayLine(l)"
                          :disabled="isPeriodPosted || deletingManualPayLineId === l.id"
                        >
                          {{ deletingManualPayLineId === l.id ? 'Deleting…' : 'Delete' }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Mileage details modal -->
            <div v-if="showMileageDetailsModal" class="modal-backdrop" @click.self="closeMileageDetails">
              <div class="modal" style="width: min(820px, 100%);">
                <div class="modal-header">
                  <div>
                    <div class="modal-title">Mileage Submission Details</div>
                    <div class="hint">This is what the provider submitted (auto or manual).</div>
                  </div>
                  <button class="btn btn-secondary btn-sm" @click="closeMileageDetails">Close</button>
                </div>

                <div v-if="selectedMileageClaim" style="margin-top: 10px;">
                  <div class="row"><strong>Provider:</strong> {{ nameForUserId(selectedMileageClaim.user_id) }}</div>
                  <div class="row"><strong>Submitted:</strong> {{ submittedAtYmd(selectedMileageClaim) }}</div>
                  <div class="row"><strong>Submitted by:</strong> {{ submitterLabel(selectedMileageClaim) }}</div>
                  <div class="row"><strong>Date:</strong> {{ selectedMileageClaim.drive_date }}</div>
                  <div class="row"><strong>Type:</strong> {{ String(selectedMileageClaim.claim_type || '').toLowerCase() === 'school_travel' ? 'School Mileage' : 'Other Mileage' }}</div>
                  <div class="row"><strong>Status:</strong> {{ String(selectedMileageClaim.status || '').toUpperCase() }}</div>
                  <div class="row"><strong>Eligible miles:</strong> {{ fmtNum(Number(selectedMileageClaim.eligible_miles ?? selectedMileageClaim.miles ?? 0)) }}</div>
                  <div class="row"><strong>Claim miles (stored):</strong> {{ fmtNum(Number(selectedMileageClaim.miles ?? 0)) }}</div>
                  <div class="row"><strong>Home↔School RT:</strong> {{ fmtNum(Number(selectedMileageClaim.home_school_roundtrip_miles ?? 0)) }}</div>
                  <div class="row"><strong>Home↔Office RT:</strong> {{ fmtNum(Number(selectedMileageClaim.home_office_roundtrip_miles ?? 0)) }}</div>
                  <div class="row"><strong>School org id:</strong> {{ selectedMileageClaim.school_organization_id }}</div>
                  <div class="row"><strong>Office location id:</strong> {{ selectedMileageClaim.office_location_id }}</div>
                  <div class="row"><strong>Start location:</strong> {{ selectedMileageClaim.start_location || '—' }}</div>
                  <div class="row"><strong>End location:</strong> {{ selectedMileageClaim.end_location || '—' }}</div>
                  <div v-if="String(selectedMileageClaim.claim_type || '').toLowerCase() !== 'school_travel'" class="card" style="margin-top: 10px;">
                    <h3 class="card-title" style="margin: 0 0 6px 0;">Trip details (Other Mileage)</h3>
                    <div class="row"><strong>Approved by:</strong> {{ selectedMileageClaim.trip_approved_by || '—' }}</div>
                    <div class="row">
                      <strong>Pre-approved:</strong>
                      {{
                        selectedMileageClaim.trip_preapproved === 1
                          ? 'Yes'
                          : (selectedMileageClaim.trip_preapproved === 0 ? 'No' : '—')
                      }}
                    </div>
                    <div class="row"><strong>Purpose:</strong> {{ selectedMileageClaim.trip_purpose || '—' }}</div>
                    <div class="row"><strong>Cost center / client / school:</strong> {{ selectedMileageClaim.cost_center || '—' }}</div>
                  </div>
                  <div class="row"><strong>Notes:</strong> {{ selectedMileageClaim.notes || '—' }}</div>
                </div>
              </div>
            </div>

            <div class="rates-box" style="padding: 0; border: none;">
              <h3 class="section-title">Staging Workspace (Editable Output)</h3>
              <div class="hint">
                Adjust only these three columns: No Note / Draft / Finalized. Changes will not affect totals until you click <strong>Run Payroll</strong>.
              </div>

          <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
            <div class="field">
              <label>Search (service code / provider)</label>
              <input v-model="workspaceSearch" type="text" placeholder="Search service code or provider…" />
              <div class="hint" style="margin-top: 6px;" v-if="priorStillUnpaidStageError">
                <span class="error-box" style="display: inline-block; padding: 6px 10px;">{{ priorStillUnpaidStageError }}</span>
              </div>
            </div>
            <div class="field">
              <label>Provider</label>
              <div style="display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end;">
                <select v-model="selectedUserId">
                  <option :value="null">All providers</option>
                  <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                </select>
                <button class="btn btn-secondary btn-sm" @click="clearSelectedProvider" :disabled="!selectedUserId">
                  Clear
                </button>
              </div>
              <div class="hint" style="margin-top: 6px;">
                {{ selectedUserId ? `Showing: ${selectedUserName}` : 'Showing: all providers' }}
              </div>
            </div>
            <div class="field">
              <label>Status</label>
              <div class="hint" v-if="isPeriodPosted">Posted (editing disabled)</div>
              <div class="hint" v-else>Editable</div>
              <div class="actions" style="margin: 6px 0 0 0; justify-content: flex-start;">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="loadPriorStillUnpaidForStage"
                  :disabled="loadingPriorStillUnpaidForStage || !selectedPeriodId"
                  title="Reload prior-period still-unpaid snapshot (drives the red indicators)"
                >
                  {{ loadingPriorStillUnpaidForStage ? 'Loading…' : 'Reload prior unpaid' }}
                </button>
                <button
                  v-if="!stageCarryoverEditMode"
                  type="button"
                  class="btn btn-secondary btn-sm"
                  @click="beginStageCarryoverEdit"
                  :disabled="isPeriodPosted || !selectedPeriodId"
                  title="Edit Old Done Notes (yellow) and Prior still unpaid (red)"
                  style="margin-left: 8px;"
                >
                  Edit carryover columns
                </button>
                <span v-else>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click="saveStageCarryoverEdits"
                    :disabled="savingStageCarryoverEdits || isPeriodPosted"
                    style="margin-left: 8px;"
                  >
                    {{ savingStageCarryoverEdits ? 'Saving…' : 'Save Old Done Notes' }}
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    @click="saveStagePriorUnpaidEdits"
                    :disabled="savingStagePriorUnpaidEdits || isPeriodPosted"
                    style="margin-left: 8px;"
                  >
                    {{ savingStagePriorUnpaidEdits ? 'Saving…' : 'Save Prior still unpaid' }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="cancelStageCarryoverEdit" style="margin-left: 8px;">
                    Cancel
                  </button>
                </span>
              </div>
            </div>
          </div>

          <div v-if="stagingLoading" class="muted">Loading staging...</div>
          <div v-else-if="stagingError" class="error-box">{{ stagingError }}</div>
          <div v-else class="table-wrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Service Code</th>
                  <th class="right">Raw No Note</th>
                  <th class="right">Raw Draft</th>
                  <th class="right">Raw Finalized</th>
                  <th class="right">No Note</th>
                  <th class="right">Draft</th>
                  <th class="right">Finalized</th>
                  <th class="right">Old Done Notes</th>
                  <th class="right">
                    Prior still unpaid
                    <span
                      class="muted"
                      v-if="(carryoverPriorStillUnpaid || []).length"
                      title="Count of provider+code rows from the selected prior period comparison run that still have unpaid units."
                    >
                      ({{ (carryoverPriorStillUnpaid || []).length }})
                    </span>
                    <div class="hint" style="margin-top: 2px;" v-if="carryoverPriorStillUnpaidPeriodLabel">
                      {{ carryoverPriorStillUnpaidPeriodLabel }}
                    </div>
                  </th>
                  <th class="right">Effective Finalized</th>
                  <th class="right">Pay Divisor</th>
                  <th class="right">Pay-hours</th>
                  <th class="right">Credits/Hours</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="priorStillUnpaidOrphanRowsForStage.length" class="prior-unpaid-row">
                  <td colspan="15">
                    <strong>Still unpaid from prior period (no matching row in this pay period)</strong>
                    <span class="muted" v-if="carryoverPriorStillUnpaidPeriodLabel">({{ carryoverPriorStillUnpaidPeriodLabel }})</span>
                    <span class="muted">— these won’t show inline because this pay period has no row for that code</span>
                  </td>
                </tr>
                <tr
                  v-for="p in priorStillUnpaidOrphanRowsForStage"
                  :key="`prior-unpaid-orphan:${p.userId}:${p.serviceCode}`"
                  class="prior-unpaid-row"
                >
                  <td>{{ p.lastName ? `${p.lastName}, ${p.firstName || ''}` : (p.providerName || '—') }}</td>
                  <td>{{ p.serviceCode }}</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right prior-unpaid-cell">{{ fmtNum(Number(p.stillUnpaidUnits || 0)) }}</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                  <td class="right muted">—</td>
                </tr>
                <tr v-for="r in workspaceMatchedRows" :key="stagingKey(r)" :class="{ 'carryover-row': (r.carryover?.oldDoneNotesUnits || 0) > 0 }">
                  <td>{{ r.lastName ? `${r.lastName}, ${r.firstName || ''}` : (r.providerName || '—') }}</td>
                  <td>{{ r.serviceCode }}</td>
                  <td class="right">{{ fmtNum(r.raw?.noNoteUnits ?? 0) }}</td>
                  <td class="right">{{ fmtNum(r.raw?.draftUnits ?? 0) }}</td>
                  <td class="right">{{ fmtNum(r.raw?.finalizedUnits ?? 0) }}</td>
                  <td class="right">
                    <input
                      v-model.number="(stagingEdits[stagingKey(r)] || (stagingEdits[stagingKey(r)] = { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 })).noNoteUnits"
                      class="stage-num-input"
                      type="number"
                      inputmode="numeric"
                      step="1"
                      :disabled="isPeriodPosted"
                    />
                  </td>
                  <td class="right">
                    <input
                      v-model.number="(stagingEdits[stagingKey(r)] || (stagingEdits[stagingKey(r)] = { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 })).draftUnits"
                      class="stage-num-input"
                      type="number"
                      inputmode="numeric"
                      step="1"
                      :disabled="isPeriodPosted"
                    />
                  </td>
                  <td class="right">
                    <input
                      v-model.number="(stagingEdits[stagingKey(r)] || (stagingEdits[stagingKey(r)] = { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 })).finalizedUnits"
                      class="stage-num-input"
                      type="number"
                      inputmode="numeric"
                      step="1"
                      :disabled="isPeriodPosted"
                    />
                  </td>
                  <td class="right carryover-cell">
                    <span v-if="stageCarryoverEditMode">
                      <input
                        v-model.number="stageCarryoverEdits[stagingKey(r)]"
                        class="stage-num-input"
                        type="number"
                        inputmode="numeric"
                        step="1"
                        :disabled="isPeriodPosted"
                      />
                    </span>
                    <span v-else>
                      {{ fmtNum(r.carryover?.oldDoneNotesUnits ?? 0) }}
                    </span>
                  </td>
                  <td
                    class="right"
                    :class="{ 'prior-unpaid-cell': Number(priorStillUnpaidUnitsByStageKey[stageKeyNormalized(r.userId, r.serviceCode)] || 0) > 0 }"
                    :title="Number(priorStillUnpaidUnitsByStageKey[stageKeyNormalized(r.userId, r.serviceCode)] || 0) > 0 ? 'Still unpaid in the prior pay period after the selected comparison run.' : ''"
                  >
                    <span v-if="stageCarryoverEditMode">
                      <input
                        v-model.number="stagePriorUnpaidEdits[stagingKey(r)]"
                        class="stage-num-input"
                        type="number"
                        inputmode="decimal"
                        step="0.01"
                        :disabled="isPeriodPosted"
                      />
                    </span>
                    <span v-else>
                      {{
                        Number(priorStillUnpaidUnitsByStageKey[stageKeyNormalized(r.userId, r.serviceCode)] || 0) > 0
                          ? fmtNum(priorStillUnpaidUnitsByStageKey[stageKeyNormalized(r.userId, r.serviceCode)])
                          : '—'
                      }}
                    </span>
                  </td>
                  <td class="right">
                    {{
                      fmtNum(
                        Number(stagingEdits[stagingKey(r)]?.finalizedUnits || 0) + Number(r.carryover?.oldDoneNotesUnits || 0)
                      )
                    }}
                  </td>
                  <td class="right muted">{{ fmtNum(payDivisorForRow(r)) }}</td>
                  <td class="right muted">{{ fmtNum(payHoursForRow(r)) }}</td>
                  <td class="right muted">{{ fmtNum(creditsHoursForRow(r)) }}</td>
                  <td class="right">
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="saveStagingRow(r)"
                      :disabled="savingStaging || isPeriodPosted"
                    >
                      Save
                    </button>
                  </td>
                </tr>
                <tr v-if="!workspaceMatchedRows.length">
                  <td colspan="15" class="muted">No rows found. Import the billing report for this period to populate the workspace.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="stagingUnmatched?.length" class="warn-box" style="margin-top: 12px;">
            <div><strong>Unmatched rows</strong> (couldn’t map provider name to a user in this org):</div>
            <div class="hint">These rows are not editable until the provider name matches a user (first+last) in this organization.</div>
            <div class="table-wrap" style="margin-top: 8px;">
              <table class="table">
                <thead>
                  <tr>
                    <th>Provider Name</th>
                    <th>Service Code</th>
                    <th class="right">No Note</th>
                    <th class="right">Draft</th>
                    <th class="right">Finalized</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(u, idx) in stagingUnmatched" :key="idx">
                    <td>{{ u.providerName }}</td>
                    <td>{{ u.serviceCode }}</td>
                    <td class="right">{{ fmtNum(u.effective?.noNoteUnits ?? 0) }}</td>
                    <td class="right">{{ fmtNum(u.effective?.draftUnits ?? 0) }}</td>
                    <td class="right">{{ fmtNum(u.effective?.finalizedUnits ?? 0) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="actions" style="margin-top: 16px; justify-content: flex-end;">
            <button v-if="selectedUserId" class="btn btn-secondary" @click="clearSelectedProvider">
              Clear Provider
            </button>
            <button class="btn btn-primary" @click="nextProvider">
              Next Employee
            </button>
          </div>

          <!-- Keep this section mounted when modals are open (even if no provider is selected yet). -->
          <div v-if="selectedUserId || showRunModal || showPreviewPostModal || showRawModal">
          <h3 class="section-title" style="margin-top: 16px;">Adjustments (Add-ons / Overrides) — {{ selectedUserName }}</h3>
          <div class="card" style="margin-top: 10px;">
            <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier (Preview)</h3>
            <div v-if="selectedTier">
              <div class="row"><strong>{{ selectedTier.label }}</strong></div>
              <div class="row"><strong>Status:</strong> {{ selectedTier.status }}</div>
            </div>
            <div v-else class="muted">No tier preview available.</div>
          </div>
          <div v-if="adjustmentsError" class="error-box">{{ adjustmentsError }}</div>
          <div v-if="adjustmentsLoading" class="muted">Loading adjustments...</div>
          <div v-else class="adjustments-grid">
            <div class="field">
              <label>Manual Mileage Override ($)</label>
              <input v-model="adjustments.mileageAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved mileage claims (auto): {{ approvedMileageClaimsLoading ? 'Loading…' : fmtMoney(approvedMileageClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Manual Med Cancel Override ($)</label>
              <input v-model="adjustments.medcancelAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved Med Cancel claims (auto): {{ approvedMedcancelClaimsLoading ? 'Loading…' : fmtMoney(approvedMedcancelClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Other Taxable ($)</label>
              <input v-model="adjustments.otherTaxableAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
              <div class="field">
                <label>IMatter ($)</label>
                <input v-model="adjustments.imatterAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              </div>
              <div class="field">
                <label>Missed Appointments ($)</label>
                <input v-model="adjustments.missedAppointmentsAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              </div>
            <div class="field">
              <label>Bonus ($)</label>
              <input v-model="adjustments.bonusAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved Holiday Bonus (auto): {{ approvedHolidayBonusClaimsLoading ? 'Loading…' : fmtMoney(approvedHolidayBonusClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Manual Reimbursement Override ($)</label>
              <input v-model="adjustments.reimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">
                Approved reimbursement claims (auto): {{ approvedReimbursementClaimsLoading ? 'Loading…' : fmtMoney(approvedReimbursementClaimsAmount || 0) }}
              </div>
            </div>
            <div class="field">
              <label>Tuition Reimbursement (Tax-exempt) ($)</label>
              <input v-model="adjustments.tuitionReimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">Shows as a separate non-taxable line item on export + pay statement.</div>
            </div>
            <div class="field">
              <label>{{ otherRateTitlesForAdjustments.title1 }} hours</label>
              <input v-model="adjustments.otherRate1Hours" type="number" step="0.01" min="0" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">Paid at the provider’s configured rate card.</div>
            </div>
            <div class="field">
              <label>{{ otherRateTitlesForAdjustments.title2 }} hours</label>
              <input v-model="adjustments.otherRate2Hours" type="number" step="0.01" min="0" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">Paid at the provider’s configured rate card.</div>
            </div>
            <div class="field">
              <label>{{ otherRateTitlesForAdjustments.title3 }} hours</label>
              <input v-model="adjustments.otherRate3Hours" type="number" step="0.01" min="0" :disabled="isPeriodPosted" />
              <div class="hint" style="margin-top: 4px;">Paid at the provider’s configured rate card.</div>
            </div>
            <div class="field">
              <label>Salary Override ($)</label>
              <input v-model="adjustments.salaryAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
              <div
                class="hint"
                style="margin-top: 4px;"
                v-if="Number(adjustments.salaryAmount || 0) <= 0 && String(adjustments.salarySource || '') === 'position' && Number(adjustments.salaryEffectiveAmount || 0) > 0"
              >
                Auto from profile salary: {{ fmtMoney(adjustments.salaryEffectiveAmount) }}
                <span class="muted" v-if="adjustments.salaryIsProrated"> (prorated)</span>
                <span class="muted" v-if="adjustments.salaryIncludeServicePay"> • includes service pay</span>
              </div>
            </div>
            <div class="field">
              <label>PTO Hours</label>
              <input v-model="adjustments.ptoHours" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>PTO Rate ($/hr)</label>
              <input v-model="adjustments.ptoRate" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="actions">
              <button class="btn btn-secondary" @click="saveAdjustments" :disabled="savingAdjustments || isPeriodPosted">
                {{ savingAdjustments ? 'Saving...' : 'Save Adjustments' }}
              </button>
            </div>
          </div>

          <h3 class="section-title" style="margin-top: 16px;">Multi-rate Card (Direct / Indirect / Other)</h3>
          <div v-if="rateCardError" class="error-box">{{ rateCardError }}</div>
          <div v-if="rateCardLoading" class="muted">Loading rate card...</div>
          <div v-else class="adjustments-grid">
            <div class="field">
              <label>Direct Rate ($/hr)</label>
              <input v-model="rateCard.directRate" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Indirect Rate ($/hr)</label>
              <input v-model="rateCard.indirectRate" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Other Rate 1 ($/hr)</label>
              <input v-model="rateCard.otherRate1" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Other Rate 2 ($/hr)</label>
              <input v-model="rateCard.otherRate2" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="field">
              <label>Other Rate 3 ($/hr)</label>
              <input v-model="rateCard.otherRate3" type="number" step="0.01" :disabled="isPeriodPosted" />
            </div>
            <div class="actions">
              <button class="btn btn-secondary" @click="saveRateCard" :disabled="savingRateCard || isPeriodPosted">
                {{ savingRateCard ? 'Saving...' : 'Save Rate Card' }}
              </button>
              <div class="hint">If a rate card exists, payroll uses it (hourly). Otherwise it falls back to per-service-code rates.</div>
            </div>
          </div>

          <h3 class="section-title" style="margin-top: 16px;">Rates & Breakdown</h3>
          <div class="hint" v-if="!selectedSummary">No computed pay yet for this provider in this period. Import the report to populate totals.</div>

          <div v-if="selectedSummary" class="table-wrap" style="margin-top: 10px;">
            <table class="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th class="right">Finalized</th>
                  <th class="right">Pay Divisor</th>
                  <th class="right">Pay-hours</th>
                  <th class="right">Duration (min)</th>
                  <th class="right">Credits/Hours</th>
                  <th class="right">Rate</th>
                  <th class="right">Amount</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                <!-- eslint-disable-next-line vue/no-use-v-if-with-v-for -->
                <tr v-for="(v, code) in (selectedSummary?.breakdown || {})" :key="code" v-if="!String(code).startsWith('_')">
                  <td class="code">{{ code }}</td>
                  <td class="right">{{ fmtNum(v?.finalizedUnits ?? v?.units ?? 0) }}</td>
                  <td class="right muted">{{ fmtNum(v?.payDivisor ?? 1) }}</td>
                  <td class="right muted">{{ fmtNum(v?.payHours ?? 0) }}</td>
                  <td class="right muted">{{ fmtNum(v?.durationMinutes ?? 0) }}</td>
                  <td class="right muted">{{ fmtNum(v?.hours ?? 0) }}</td>
                  <td class="right muted">{{ fmtMoney(v?.rateAmount ?? 0) }}</td>
                  <td class="right">{{ fmtMoney(v?.amount ?? 0) }}</td>
                  <td class="muted">{{ v?.rateSource || '—' }}</td>
                </tr>
                <tr v-if="!selectedSummary?.breakdown || !Object.keys(selectedSummary.breakdown).filter((k) => !String(k).startsWith('_')).length">
                  <td colspan="9" class="muted">No breakdown available.</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="5" class="right"><strong>Total</strong></td>
                  <td class="right"><strong>{{ fmtNum(selectedSummary.total_hours ?? 0) }}</strong></td>
                  <td class="right muted"><strong>—</strong></td>
                  <td class="right"><strong>{{ fmtMoney(selectedSummary.total_amount ?? 0) }}</strong></td>
                  <td class="muted"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="rate-editor">
            <div class="field-row">
              <div class="field">
                <label>Service Code</label>
                <input v-model="rateServiceCode" type="text" placeholder="e.g., 97110" />
              </div>
              <div class="field">
                <label>Rate</label>
                <input v-model="rateAmount" type="number" step="0.01" placeholder="0.00" />
              </div>
            </div>
            <button class="btn btn-secondary" @click="saveRate" :disabled="savingRate || isPeriodPosted || !rateServiceCode || !selectedUserId">
              {{ savingRate ? 'Saving...' : 'Save Rate' }}
            </button>
            <div class="hint">After saving, re-import (or add a recompute button later) to refresh totals.</div>
          </div>

          </div>
        </div>

        <!-- View Ran Payroll modal -->
        <teleport to="body">
          <div v-if="showRunModal" class="modal-backdrop" @click.self="showRunModal = false">
            <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">Ran Payroll (Private Totals)</div>
                <div class="hint">Review totals and add manual pay variables (mileage/bonus/etc.) before posting. If you change add-ons, click Re-run Payroll.</div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" @click="nextFlaggedRunProvider" :disabled="(auditFlaggedProviders || []).length <= 0">
                  Next Flagged ({{ (auditFlaggedProviders || []).length }})
                </button>
                <button class="btn btn-secondary btn-sm" @click="nextRunProvider" :disabled="(summaries || []).length <= 1">
                  Next Provider
                </button>
                <button class="btn btn-secondary btn-sm" @click="showRunModal = false">Close</button>
              </div>
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th class="right">Credits/Hours</th>
                    <th class="right">Subtotal</th>
                    <th class="right">Direct Hours</th>
                    <th class="right">Direct Pay</th>
                    <th class="right">Direct Hourly Rate</th>
                    <th class="right">Indirect Hours</th>
                    <th class="right">Indirect Pay</th>
                    <th class="right">Indirect Hourly Rate</th>
                    <th class="right">Effective Hourly Rate</th>
                    <th class="right">Adjustments</th>
                    <th class="right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in summaries" :key="s.id" class="clickable" @click="selectSummary(s)">
                    <td>{{ s.first_name }} {{ s.last_name }}</td>
                    <td class="right">{{ fmtNum(s.total_hours ?? 0) }}</td>
                    <td class="right">{{ fmtMoney(s.subtotal_amount) }}</td>
                    <td class="right">{{ fmtNum(s.direct_hours ?? 0) }}</td>
                    <td class="right">{{ fmtMoney((payTotalsFromBreakdown(s.breakdown).directAmount ?? 0)) }}</td>
                    <td class="right muted">
                      {{
                        (() => {
                          const { directAmount } = payTotalsFromBreakdown(s.breakdown);
                          const h = Number(s.direct_hours || 0);
                          return h > 0 ? fmtMoney(directAmount / h) : '—';
                        })()
                      }}
                    </td>
                    <td class="right">{{ fmtNum(s.indirect_hours ?? 0) }}</td>
                    <td class="right">{{ fmtMoney((payTotalsFromBreakdown(s.breakdown).indirectAmount ?? 0)) }}</td>
                    <td class="right muted">
                      {{
                        (() => {
                          const { indirectAmount } = payTotalsFromBreakdown(s.breakdown);
                          const h = Number(s.indirect_hours || 0);
                          return h > 0 ? fmtMoney(indirectAmount / h) : '—';
                        })()
                      }}
                    </td>
                    <td class="right muted">
                      {{
                        (() => {
                          const total = Number(s.total_hours || 0);
                          const directH = Number(s.direct_hours || 0);
                          const indirectH = Number(s.indirect_hours || 0);
                          const otherH = Math.max(0, total - directH - indirectH);
                          if (directH > 0 && indirectH <= 1e-9 && otherH <= 1e-9) {
                            const { directAmount } = payTotalsFromBreakdown(s.breakdown);
                            return fmtMoney(directAmount / (total || 1));
                          }
                          return '—';
                        })()
                      }}
                    </td>
                    <td class="right">{{ fmtMoney(s.adjustments_amount) }}</td>
                    <td class="right">{{ fmtMoney(s.total_amount) }}</td>
                  </tr>
                  <tr v-if="!summaries.length">
                    <td colspan="12" class="muted">No run results yet. Click Run Payroll first.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="selectedSummary" class="card" style="margin-top: 12px;">
              <h3 class="card-title">Provider Detail (What will be posted)</h3>
              <div class="row"><strong>Provider:</strong> {{ selectedSummary.first_name }} {{ selectedSummary.last_name }}</div>
              <div class="row"><strong>Total:</strong> {{ fmtMoney(selectedSummary.total_amount ?? 0) }}</div>

              <div class="card" style="margin-top: 10px;" v-if="selectedSummary.breakdown && selectedSummary.breakdown.__tier">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier</h3>
                <div class="row"><strong>{{ selectedSummary.breakdown.__tier.label }}</strong></div>
                <div class="row"><strong>Status:</strong> {{ selectedSummary.breakdown.__tier.status }}</div>
              </div>

              <h3 class="card-title" style="margin-top: 10px;">Service Codes</h3>
              <div class="muted" v-if="!selectedSummary.breakdown || !Object.keys(selectedSummary.breakdown).length">No breakdown available.</div>
              <div v-else class="codes">
                <div class="codes-head">
                  <div>Code</div>
                  <div class="right">No Note</div>
                  <div class="right">Draft</div>
                  <div class="right">Finalized</div>
                  <div class="right">Pay-hours</div>
                  <div class="right">Credits/Hours</div>
                  <div class="right">Rate</div>
                  <div class="right">Amount</div>
                </div>
                <div v-for="l in selectedSummaryServiceLines" :key="l.code" class="code-row">
                  <div class="code">{{ l.code }}</div>
                  <div class="right muted">{{ fmtNum(l.noNoteUnits ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.draftUnits ?? 0) }}</div>
                  <div class="right">{{ fmtNum(l.finalizedUnits ?? l.units ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.payHours ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.hours ?? 0) }}</div>
                  <div class="right muted">{{ fmtMoney(l.rateAmount ?? 0) }}</div>
                  <div class="right">{{ fmtMoney(l.amount ?? 0) }}</div>
                </div>
              </div>

              <div style="margin-top: 12px;">
                <h3 class="card-title">Manual Add-ons / Overrides</h3>
                <div class="hint">These are included after you Re-run Payroll.</div>
                <div v-if="adjustmentsError" class="error-box">{{ adjustmentsError }}</div>
                <div v-if="adjustmentsLoading" class="muted">Loading adjustments...</div>
                <div v-else class="adjustments-grid">
                  <div class="field">
                    <label>Mileage ($)</label>
                    <input v-model="adjustments.mileageAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>Other Taxable ($)</label>
                    <input v-model="adjustments.otherTaxableAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>Bonus ($)</label>
                    <input v-model="adjustments.bonusAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                    <div class="hint" style="margin-top: 4px;">
                      Approved Holiday Bonus (auto): {{ approvedHolidayBonusClaimsLoading ? 'Loading…' : fmtMoney(approvedHolidayBonusClaimsAmount || 0) }}
                    </div>
                  </div>
                  <div class="field">
                    <label>Manual Reimbursement Override ($)</label>
                    <input v-model="adjustments.reimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                    <div class="hint" style="margin-top: 4px;">
                      Approved reimbursement claims (auto): {{ approvedReimbursementClaimsLoading ? 'Loading…' : fmtMoney(approvedReimbursementClaimsAmount || 0) }}
                    </div>
                  </div>
                  <div class="field">
                    <label>Tuition Reimbursement (Tax-exempt) ($)</label>
                    <input v-model="adjustments.tuitionReimbursementAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                    <div class="hint" style="margin-top: 4px;">Shows as a separate non-taxable line item on export + pay statement.</div>
                  </div>
                  <div class="field">
                    <label>Salary Override ($)</label>
                    <input v-model="adjustments.salaryAmount" type="number" step="0.01" :disabled="isPeriodPosted" />
                    <div
                      class="hint"
                      style="margin-top: 4px;"
                      v-if="Number(adjustments.salaryAmount || 0) <= 0 && String(adjustments.salarySource || '') === 'position' && Number(adjustments.salaryEffectiveAmount || 0) > 0"
                    >
                      Auto from profile salary: {{ fmtMoney(adjustments.salaryEffectiveAmount) }}
                      <span class="muted" v-if="adjustments.salaryIsProrated"> (prorated)</span>
                      <span class="muted" v-if="adjustments.salaryIncludeServicePay"> • includes service pay</span>
                    </div>
                  </div>
                  <div class="field">
                    <label>PTO Hours</label>
                    <input v-model="adjustments.ptoHours" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
                  <div class="field">
                    <label>PTO Rate ($/hr)</label>
                    <input v-model="adjustments.ptoRate" type="number" step="0.01" :disabled="isPeriodPosted" />
                  </div>
        <div class="actions">
                    <button class="btn btn-secondary" @click="saveAdjustments" :disabled="savingAdjustments || isPeriodPosted">
                      {{ savingAdjustments ? 'Saving...' : 'Save Add-ons' }}
          </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </teleport>

        <!-- Preview Post modal -->
        <teleport to="body">
          <div v-if="showPreviewPostModal" class="modal-backdrop" @click.self="showPreviewPostModal = false">
            <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">Preview Post (Provider View)</div>
                <div class="hint">This is what providers will see after you click Post Payroll.</div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" @click="nextFlaggedPreviewProvider" :disabled="(auditFlaggedProviders || []).length <= 0">
                  Next Flagged ({{ (auditFlaggedProviders || []).length }})
                </button>
                <button class="btn btn-secondary btn-sm" @click="nextPreviewProvider" :disabled="(summaries || []).length <= 1">
                  Next Provider
                </button>
                <button class="btn btn-secondary btn-sm" @click="showPreviewPostModal = false">Close</button>
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <div class="field">
                <label>Provider</label>
                <select v-model="previewUserId">
                  <option :value="null" disabled>Select a provider…</option>
                  <option v-for="s in summariesSortedByProvider" :key="s.user_id" :value="s.user_id">{{ s.last_name }}, {{ s.first_name }}</option>
                </select>
              </div>
              <div class="field">
                <label>Pay period</label>
                <div class="hint">{{ periodRangeLabel(selectedPeriod) }}</div>
              </div>
              <div class="field">
                <label>Status</label>
                <div class="hint">{{ selectedPeriod?.status }}</div>
              </div>
            </div>

            <div v-if="previewSummary" class="card" style="margin-top: 12px;">
              <h3 class="card-title">Totals</h3>
              <div v-if="auditForPreviewProvider && auditForPreviewProvider.flags?.length" class="warn-box" style="margin: 10px 0;">
                <div><strong>Audit flags (review recommended)</strong></div>
                <div v-for="(f, i) in auditForPreviewProvider.flags" :key="i" class="muted">{{ f }}</div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Notifications (sent on Post)</h3>
                <div class="hint">These are alerts that will be created when you click Post Payroll (if applicable).</div>
                <div v-if="previewPostNotificationsError" class="warn-box" style="margin-top: 8px;">{{ previewPostNotificationsError }}</div>
                <div v-else-if="previewPostNotificationsLoading" class="muted" style="margin-top: 8px;">Loading notifications…</div>
                <div v-else-if="!(previewPostNotifications || []).length" class="muted" style="margin-top: 8px;">No post-time notifications for this provider.</div>
                <div v-else style="margin-top: 8px;">
                  <div v-for="(n, idx) in previewPostNotifications" :key="idx" class="row" style="margin-top: 6px;">
                    <div><strong>{{ n.title || n.type }}</strong></div>
                    <div class="muted">{{ n.message }}</div>
                  </div>
                </div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Provider payroll notices</h3>
                <div class="hint">These messages appear in the provider’s My Payroll breakdown.</div>
                <div v-if="previewUserPayrollHistoryError" class="warn-box" style="margin-top: 8px;">{{ previewUserPayrollHistoryError }}</div>
                <div v-else-if="previewUserPayrollHistoryLoading" class="muted" style="margin-top: 8px;">Loading notices…</div>
                <div v-else style="margin-top: 8px;">
                  <div v-if="previewCarryoverNotes > 0" class="warn-box" style="margin-top: 8px;">
                    <div><strong>Prior notes included in this payroll:</strong> {{ fmtNum(previewCarryoverNotes) }} notes</div>
                    <div class="muted">Reminder: complete prior-period notes by Sunday 11:59pm after the pay period ends to avoid compensation delays.</div>
                  </div>

                  <div v-if="previewTwoPeriodsAgoUnpaid.total > 0" class="warn-box" style="margin-top: 8px; border: 1px solid #ffb5b5; background: #ffecec;">
                    <div><strong>Reminder: unpaid notes from 2 pay periods ago</strong></div>
                    <div class="muted" style="margin-top: 4px;"><strong>{{ previewTwoPeriodsAgoUnpaid.periodStart }} → {{ previewTwoPeriodsAgoUnpaid.periodEnd }}</strong></div>
                    <div style="margin-top: 6px;">
                      <strong>No Note:</strong> {{ fmtNum(previewTwoPeriodsAgoUnpaid.noNote) }} notes
                      <span class="muted">•</span>
                      <strong>Draft:</strong> {{ fmtNum(previewTwoPeriodsAgoUnpaid.draft) }} notes
                    </div>
                    <div class="muted" style="margin-top: 6px;">Complete outstanding notes to be included in a future payroll.</div>
                  </div>

                  <div v-if="previewUnpaidInPeriod.total > 0" class="warn-box" style="margin-top: 8px; border: 1px solid #ffd8a8; background: #fff4e6;">
                    <div><strong>Unpaid notes in this pay period</strong></div>
                    <div style="margin-top: 6px;">
                      <strong>No Note:</strong> {{ fmtNum(previewUnpaidInPeriod.noNote) }} notes
                      <span class="muted">•</span>
                      <strong>Draft:</strong> {{ fmtNum(previewUnpaidInPeriod.draft) }} notes
                    </div>
                    <div class="muted" style="margin-top: 6px;">
                      These notes were not paid this period. Complete outstanding notes to be included in a future payroll.
                    </div>
                    <div class="muted" style="margin-top: 6px;">
                      Due to our EHR system, we are unable to differentiate a note that is incomplete for a session that did occur from a note that is incomplete for a session that did not occur.
                    </div>
                  </div>

                  <div v-if="previewCarryoverNotes <= 0 && previewTwoPeriodsAgoUnpaid.total <= 0 && previewUnpaidInPeriod.total <= 0" class="muted" style="margin-top: 8px;">
                    No provider payroll notices for this period.
                  </div>
                </div>
              </div>
              <div class="row"><strong>Total Pay:</strong> {{ fmtMoney(previewSummary.total_amount ?? 0) }}</div>
              <div class="row"><strong>Total Credits/Hours:</strong> {{ fmtNum(previewSummary.total_hours ?? 0) }}</div>
              <div class="row"><strong>Tier Credits (Final):</strong> {{ fmtNum(previewSummary.tier_credits_final ?? previewSummary.tier_credits_current ?? 0) }}</div>

              <div class="card" style="margin-top: 10px;" v-if="previewSummary.breakdown && previewSummary.breakdown.__tier">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Benefit Tier</h3>
                <div class="row"><strong>{{ previewSummary.breakdown.__tier.label }}</strong></div>
                <div class="row"><strong>Status:</strong> {{ previewSummary.breakdown.__tier.status }}</div>
              </div>

              <div class="card" style="margin-top: 10px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Direct / Indirect Totals</h3>
                <div class="row">
                  <strong>Direct:</strong>
                  {{ fmtNum(previewSummary.direct_hours ?? 0) }} hrs •
                  {{ fmtMoney(payTotalsFromBreakdown(previewSummary.breakdown).directAmount ?? 0) }} •
                  <span class="muted">
                    rate {{
                      (() => {
                        const h = Number(previewSummary.direct_hours || 0);
                        const amt = Number(payTotalsFromBreakdown(previewSummary.breakdown).directAmount || 0);
                        return h > 0 ? fmtMoney(amt / h) : '—';
                      })()
                    }}
                  </span>
                </div>
                <div class="row">
                  <strong>Indirect:</strong>
                  {{ fmtNum(previewSummary.indirect_hours ?? 0) }} hrs •
                  {{ fmtMoney(payTotalsFromBreakdown(previewSummary.breakdown).indirectAmount ?? 0) }} •
                  <span class="muted">
                    rate {{
                      (() => {
                        const h = Number(previewSummary.indirect_hours || 0);
                        const amt = Number(payTotalsFromBreakdown(previewSummary.breakdown).indirectAmount || 0);
                        return h > 0 ? fmtMoney(amt / h) : '—';
                      })()
                    }}
                  </span>
                </div>
              </div>

              <h3 class="card-title" style="margin-top: 12px;">Service Codes</h3>
              <div class="muted" v-if="!previewSummary.breakdown || !Object.keys(previewSummary.breakdown).length">No breakdown available.</div>
              <div v-else class="codes">
                <div class="codes-head">
                  <div>Code</div>
                  <div class="right">No Note</div>
                  <div class="right">Draft</div>
                  <div class="right">Finalized</div>
                  <div class="right">Credits/Hours</div>
                  <div class="right">Rate</div>
                  <div class="right">Amount</div>
                </div>
                <div v-for="l in previewSummaryServiceLines" :key="l.code" class="code-row">
                  <div class="code">{{ l.code }}</div>
                  <div class="right muted">{{ fmtNum(l.noNoteUnits ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.draftUnits ?? 0) }}</div>
                  <div class="right">{{ fmtNum(l.finalizedUnits ?? l.units ?? 0) }}</div>
                  <div class="right muted">{{ fmtNum(l.hours ?? 0) }}</div>
                  <div class="right muted">{{ fmtMoney(l.rateAmount ?? 0) }}</div>
                  <div class="right">{{ fmtMoney(l.amount ?? 0) }}</div>
                </div>
              </div>

              <h3 class="card-title" style="margin-top: 12px;">Adjustments (Included in ran payroll)</h3>
              <div v-if="previewAdjustmentsFromRun" class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th class="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Mileage</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.mileageAmount ?? 0) }}</td></tr>
                    <tr><td>Other Taxable</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.otherTaxableAmount ?? 0) }}</td></tr>
                    <tr><td>IMatter</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.imatterAmount ?? 0) }}</td></tr>
                    <tr><td>Missed Appointments</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.missedAppointmentsAmount ?? 0) }}</td></tr>
                    <tr><td>Bonus</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.bonusAmount ?? 0) }}</td></tr>
                    <tr><td>Reimbursement</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.reimbursementAmount ?? 0) }}</td></tr>
                    <tr><td>Tuition Reimbursement (Tax-exempt)</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.tuitionReimbursementAmount ?? 0) }}</td></tr>
                    <tr><td>PTO Pay</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.ptoPay ?? 0) }}</td></tr>
                    <tr><td>Salary Override</td><td class="right">{{ fmtMoney(previewAdjustmentsFromRun.salaryAmount ?? 0) }}</td></tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td class="right"><strong>Adjustments Total</strong></td>
                      <td class="right"><strong>{{ fmtMoney(previewSummary.adjustments_amount ?? 0) }}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div v-else class="muted">
                No adjustments were included in this run.
              </div>

              <div v-if="previewAdjustmentsError" class="warn-box" style="margin-top: 10px;">
                {{ previewAdjustmentsError }}
              </div>
            </div>
            <div v-else class="muted">Select a provider to preview.</div>
            </div>
          </div>
        </teleport>

        <!-- Raw import modal -->
        <teleport to="body">
          <div v-if="showRawModal" class="modal-backdrop" @click.self="showRawModal = false">
            <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">
                  <span v-if="rawMode === 'draft_audit'">Raw Import (Draft Audit)</span>
                  <span v-else-if="rawMode === 'process_h0031'">Raw Import (Process H0031)</span>
                  <span v-else-if="rawMode === 'process_h0032'">Raw Import (Process H0032)</span>
                  <span v-else-if="rawMode === 'missed_appts_paid_in_full'">Raw Import (Missed Appointments • Paid in Full)</span>
                  <span v-else>Raw Import (Processed)</span>
                </div>
                <div class="hint">
                  <span v-if="rawMode === 'draft_audit'">
                    Review only DRAFT rows and mark which drafts are payable (default) vs not payable. This updates Payroll Stage immediately.
                  </span>
                  <span v-else-if="rawMode === 'process_h0031'">
                    Enter the correct minutes for H0031 rows, then mark Done. Payroll cannot run until these are processed.
                  </span>
                  <span v-else-if="rawMode === 'process_h0032'">
                    Enter the correct minutes for H0032 Cat1 Hour rows, then mark Done. Payroll cannot run until these are processed. (Cat2 Flat providers do not appear here; they default to 30 minutes per line.)
                  </span>
                  <span v-else-if="rawMode === 'missed_appts_paid_in_full'">
                    Flags from the billing report upload where Type contains "Missed Appointment" and Patient Balance Status is "Paid in Full". Display-only (no pay math).
                  </span>
                  <span v-else>
                    Review rows that have been processed (Done).
                  </span>
                </div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'draft_audit'">Draft Audit</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'process_h0031'">Process H0031</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'process_h0032'">Process H0032</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'missed_appts_paid_in_full'">Missed Appts (Paid in Full)</button>
                <button class="btn btn-secondary btn-sm" @click="rawMode = 'processed'">Processed</button>
                <button class="btn btn-secondary btn-sm" @click="downloadRawCsv" :disabled="!selectedPeriodId">
                  Download CSV
                </button>
                <button class="btn btn-secondary btn-sm" @click="showRawModal = false">Close</button>
              </div>
            </div>
            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
              <div class="field">
                <label>Search</label>
                <input
                  v-model="rawDraftSearch"
                  type="text"
                  :placeholder="rawMode === 'missed_appts_paid_in_full' ? 'Search provider…' : 'Search provider / code / DOS…'"
                />
              </div>
              <div class="field">
                <label>Rows</label>
                <div class="hint" v-if="rawMode !== 'draft_audit'">Filtered by mode</div>
                <select v-else v-model="rawDraftOnly">
                  <option :value="true">Draft only</option>
                  <option :value="false">All (read-only)</option>
                </select>
              </div>
              <div class="field">
                <label>Status</label>
                <div class="hint" v-if="isPeriodPosted">
                  Posted (locked)
                  <span v-if="rawMode === 'process_h0031' || rawMode === 'process_h0032'">
                    •
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      style="margin-left: 8px;"
                      @click="unlockPostedRawProcessing"
                    >
                      {{ rawPostedProcessingUnlocked ? 'Unlocked' : 'Unlock H0031/H0032 editing' }}
                    </button>
                  </span>
                </div>
                <div class="hint" v-else>{{ updatingDraftPayable ? 'Saving…' : 'Editable' }}</div>
              </div>
            </div>
            <div v-if="rawDraftError" class="error-box">{{ rawDraftError }}</div>
            <div
              v-if="isPeriodPosted && rawPostedProcessingUnlocked && (rawMode === 'process_h0031' || rawMode === 'process_h0032')"
              class="warn-box"
              style="margin-top: 10px;"
            >
              You are editing a <strong>posted</strong> period. This is allowed only for H0031/H0032 minutes + Done processing.
              It updates Raw Import and Payroll Stage totals, but does not automatically recompute posted payroll totals.
            </div>
            <div class="table-wrap">
              <table v-if="rawMode !== 'missed_appts_paid_in_full'" class="table">
                <thead>
                  <tr>
                    <th class="th-sortable" @click="toggleRawSort('provider_name')">
                      Provider Name <span class="th-sort-indicator">{{ rawSortIndicator('provider_name') }}</span>
                    </th>
                    <th class="th-sortable" @click="toggleRawSort('client')">
                      Client <span class="th-sort-indicator">{{ rawSortIndicator('client') }}</span>
                    </th>
                    <th class="th-sortable" @click="toggleRawSort('service_code')">
                      Service Code <span class="th-sort-indicator">{{ rawSortIndicator('service_code') }}</span>
                    </th>
                    <th class="th-sortable" @click="toggleRawSort('service_date')">
                      DOS <span class="th-sort-indicator">{{ rawSortIndicator('service_date') }}</span>
                    </th>
                    <th class="right">
                      <span v-if="rawMode === 'draft_audit'">Units</span>
                      <span v-else>Minutes</span>
                    </th>
                    <th class="th-sortable" @click="toggleRawSort('note_status')">
                      Note Status <span class="th-sort-indicator">{{ rawSortIndicator('note_status') }}</span>
                    </th>
                    <th v-if="rawMode === 'draft_audit'">Draft Payable?</th>
                    <th v-else>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rawModeRowsLimited" :key="r.id">
                    <td>{{ r.provider_name }}</td>
                    <td class="muted">{{ rawClientHint(r) || '—' }}</td>
                    <td>{{ r.service_code }}</td>
                    <td class="muted">{{ ymd(r.service_date) }}</td>
                    <td class="right">
                      <span v-if="rawMode === 'draft_audit'">{{ fmtNum(r.unit_count) }}</span>
                      <input
                        v-else
                        type="number"
                        step="1"
                        min="1"
                        :value="Number(r.unit_count || 0)"
                        :disabled="isPeriodPosted && !rawPostedProcessingUnlocked"
                        style="width: 90px;"
                        @change="updateRawMinutes(r, $event.target.value)"
                      />
                    </td>
                    <td>{{ r.note_status || '' }}</td>
                    <td v-if="rawMode === 'draft_audit'">
                      <select
                        v-if="String(r.note_status || '').toUpperCase() === 'DRAFT'"
                        :disabled="isPeriodPosted || !rawDraftOnly"
                        :value="Number(r.draft_payable) ? 'payable' : 'not_payable'"
                        @change="toggleDraftPayable(r, $event.target.value === 'payable')"
                      >
                        <option value="payable">Payable (default)</option>
                        <option value="not_payable">Not payable</option>
                      </select>
                      <span v-else class="muted">—</span>
                    </td>
                    <td v-else>
                      <div style="display: flex; align-items: center; gap: 10px; justify-content: flex-end;">
                        <label
                          v-if="rawMode === 'process_h0031' || rawMode === 'process_h0032'"
                          class="muted"
                          style="display: inline-flex; align-items: center; gap: 6px; margin-right: 6px;"
                          title="Local checklist only (not saved)"
                        >
                          <input
                            type="checkbox"
                            :checked="!!(rawProcessChecklistByRowId || {})[Number(r.id)]"
                            @change="setRawProcessChecked(r.id, $event.target.checked)"
                          />
                          <span>Check</span>
                        </label>
                        <span class="muted">{{ r.processed_at ? 'Done' : 'Not done' }}</span>
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          :disabled="(isPeriodPosted && !rawPostedProcessingUnlocked) || !(Number(r.requires_processing) === 1)"
                          @click="toggleRawProcessed(r, !r.processed_at)"
                        >
                          {{ r.processed_at ? 'Undo' : 'Mark done' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!rawModeRows.length">
                    <td colspan="7" class="muted">No rows found.</td>
                  </tr>
                </tbody>
              </table>

              <table v-else class="table">
                <thead>
                  <tr>
                    <th>Clinician Name</th>
                    <th class="right">Total Patient Amount Paid</th>
                    <th class="right">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in missedAppointmentsPaidInFullRows" :key="r.clinician_name">
                    <td>{{ r.clinician_name }}</td>
                    <td class="right">{{ fmtMoney(Number(r.total_patient_amount_paid || 0)) }}</td>
                    <td class="right">{{ fmtNum(Number(r.row_count || 0)) }}</td>
                  </tr>
                  <tr v-if="!missedAppointmentsPaidInFullRows.length">
                    <td colspan="3" class="muted">No Paid-in-Full missed appointment rows were detected in the latest billing import.</td>
                  </tr>
                </tbody>
              </table>

              <div
                v-if="rawMode !== 'missed_appts_paid_in_full'"
                class="actions"
                style="margin-top: 10px; justify-content: space-between; align-items: center;"
              >
                <div style="display: flex; align-items: center; gap: 10px;" v-if="rawModeRows.length">
                  <div class="hint">
                    Showing {{ Math.min(rawModeRows.length, rawRowLimit) }} of {{ rawModeRows.length }} rows.
                  </div>
                  <label class="muted" style="display: inline-flex; align-items: center; gap: 6px;">
                    Show
                    <select v-model.number="rawRowLimit">
                      <option :value="200">200</option>
                      <option :value="500">500</option>
                      <option :value="1000">1000</option>
                      <option :value="rawModeRows.length">All</option>
                    </select>
                  </label>
                </div>
                <div class="actions" style="margin: 0;" v-if="rawModeRows.length > rawRowLimit">
                  <button type="button" class="btn btn-secondary btn-sm" @click="showNextRawRows">
                    Show next 200
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" style="margin-left: 8px;" @click="rawRowLimit = rawModeRows.length">
                    Show all
                  </button>
                </div>
              </div>
            </div>
            </div>
          </div>
        </teleport>

        <!-- No-note/Draft Unpaid carryover modal -->
        <teleport to="body">
          <div v-if="showCarryoverModal" class="modal-backdrop" @click.self="showCarryoverModal = false">
            <div class="modal">
            <div class="modal-header">
              <div>
                <div class="modal-title">No-note/Draft Unpaid (Detect Changes)</div>
                <div class="hint">
                  Select the prior pay period and compare two “Run Payroll” snapshots. If No-note/Draft unpaid drops, those units are treated as “Old Done Notes” to add into the current pay period.
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" @click="showCarryoverModal = false">Close</button>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <div class="field">
                <label>Current pay period</label>
                <div class="hint">{{ periodRangeLabel(selectedPeriod) }}</div>
              </div>
              <div class="field">
                <label>Prior pay period</label>
                <select v-model="carryoverPriorPeriodId" :disabled="carryoverLoading">
                  <option :value="null" disabled>Select a prior period…</option>
                  <option v-for="p in carryoverCompareOptions" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Status</label>
                <div class="hint" v-if="isPeriodPosted">Posted (locked)</div>
                <div class="hint" v-else>Editable</div>
              </div>
            </div>

            <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 8px;">
              <div class="field">
                <label>Baseline run (used as “before”)</label>
                <select v-model="carryoverBaselineRunId" :disabled="carryoverLoading || !carryoverRuns.length">
                  <option :value="null" disabled>Select baseline run…</option>
                  <option v-for="r in carryoverRuns" :key="r.id" :value="r.id">{{ fmtDateTime(r.ran_at) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Compare run (used as “after”)</label>
                <select v-model="carryoverCompareRunId" :disabled="carryoverLoading || !carryoverRuns.length">
                  <option :value="null" disabled>Select compare run…</option>
                  <option v-for="r in carryoverRuns" :key="r.id" :value="r.id">{{ fmtDateTime(r.ran_at) }}</option>
                </select>
              </div>
              <div class="field">
                <label>Tip</label>
                <div class="hint">If the prior period was only run once, there may be no changes to detect.</div>
              </div>
            </div>

            <div v-if="carryoverError" class="error-box">{{ carryoverError }}</div>
            <div v-if="carryoverApplyResult" class="warn-box" style="margin-top: 10px;">
              <div><strong>Applied carryover:</strong> {{ Number(carryoverApplyResult.inserted || 0) }} row(s) added to payroll stage.</div>
              <div v-if="(carryoverApplyResult.warnings || []).length" class="hint" style="margin-top: 6px;">
                <div><strong>Warnings:</strong></div>
                <div v-for="(w, idx) in (carryoverApplyResult.warnings || [])" :key="idx">
                  - {{ w?.message || String(w) }}
                </div>
              </div>
              <div class="hint" style="margin-top: 6px;">
                Next: open <strong>Payroll Stage</strong> and verify the destination staging rows (especially H0031/H0032) before running payroll.
              </div>
            </div>

            <div v-if="!isPeriodPosted && (carryoverDraftReviewFiltered || []).length" class="card" style="margin-top: 10px;">
              <h3 class="section-title" style="margin-top: 0;">Draft items needing confirmation</h3>
              <div class="hint">
                These are <strong>DRAFT</strong> rows in the <strong>current</strong> pay period that match a prior <strong>NO_NOTE</strong> or a prior <strong>DRAFT not payable</strong>.
                Confirm whether each draft should be payable. Finalized rows are not shown here.
              </div>

              <div class="field-row" style="grid-template-columns: 1fr auto; align-items: end; margin-top: 10px;">
                <div class="field">
                  <label>Search</label>
                  <input v-model="carryoverDraftReviewSearch" type="text" placeholder="Search provider / code / DOS / client…" />
                </div>
                <div class="hint muted">Showing {{ carryoverDraftReviewFiltered.length }} row(s)</div>
              </div>

              <div class="table-wrap" style="margin-top: 10px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th style="width: 90px;">Client</th>
                      <th style="width: 110px;">Code</th>
                      <th style="width: 120px;">DOS</th>
                      <th class="right" style="width: 110px;">Units</th>
                      <th style="width: 170px;">Current draft payable?</th>
                      <th>Why flagged</th>
                      <th style="width: 210px;">Prior</th>
                      <th style="width: 240px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="r in carryoverDraftReviewFiltered" :key="r.rowId">
                      <td>{{ r.providerName || '—' }}</td>
                      <td class="muted">{{ r.clientHint || '—' }}</td>
                      <td>{{ r.serviceCode || '—' }}</td>
                      <td class="muted">{{ r.serviceDate || '—' }}</td>
                      <td class="right">{{ fmtNum(Number(r.unitCount || 0)) }}</td>
                      <td>
                        <span v-if="Number(r.draftPayable) === 1">Payable</span>
                        <span v-else class="muted">Not payable</span>
                      </td>
                      <td>
                        <div v-for="(c, idx) in (r.reasons || [])" :key="`${r.rowId}:reason:${idx}`" class="muted">
                          - {{ carryoverDraftReasonLabel(c) }}
                        </div>
                      </td>
                      <td class="muted">
                        <div v-for="(p, idx) in (r.prior || []).slice(0, 2)" :key="`${r.rowId}:prior:${idx}`">
                          {{ p.periodStart }}→{{ p.periodEnd }} • {{ p.noteStatus }}{{ p.noteStatus === 'DRAFT' ? (p.draftPayable ? ' (payable)' : ' (not payable)') : '' }}
                        </div>
                      </td>
                      <td class="right">
                        <button
                          class="btn btn-secondary btn-sm"
                          type="button"
                          @click="setDraftPayableByRowId(r.rowId, true)"
                          :disabled="updatingDraftPayable || updatingCarryoverDraftRowId === r.rowId"
                        >
                          Mark payable
                        </button>
                        <button
                          class="btn btn-secondary btn-sm"
                          type="button"
                          style="margin-left: 8px;"
                          @click="setDraftPayableByRowId(r.rowId, false)"
                          :disabled="updatingDraftPayable || updatingCarryoverDraftRowId === r.rowId"
                        >
                          Mark not payable
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div v-if="carryoverLoading" class="muted">Computing differences...</div>
            <div v-if="!carryoverLoading" class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Service Code</th>
                    <th class="right">Prev Unpaid</th>
                    <th class="right">Current Unpaid</th>
                    <th class="right">Finalized Δ</th>
                    <th>Type</th>
                    <th class="right">Old Done Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(d, idx) in carryoverPreview"
                    :key="idx"
                  >
                    <td>{{ d.lastName ? `${d.lastName}, ${d.firstName || ''}` : (d.providerName || '—') }}</td>
                    <td>{{ d.serviceCode }}</td>
                    <td class="right">{{ fmtNum(d.prevUnpaidUnits) }}</td>
                    <td class="right">{{ fmtNum(d.currUnpaidUnits) }}</td>
                    <td class="right">{{ fmtNum(d.finalizedDelta ?? 0) }}</td>
                    <td>
                      <span v-if="d.type === 'manual'">Manual entry</span>
                      <span v-else-if="d.type === 'late_note_completion'">Late note completion</span>
                      <span v-else-if="d.type === 'code_changed'">
                        Code changed
                        <span v-if="d.codeChangedStatus" class="muted">({{ d.codeChangedStatus }})</span>
                        <span v-if="d.fromServiceCode && d.toServiceCode" class="muted"> • {{ d.fromServiceCode }} → {{ d.toServiceCode }}</span>
                      </span>
                      <span v-else-if="d.type === 'late_added_service'">
                        Late added service
                        <span v-if="d.lateAddedStatus" class="muted">({{ d.lateAddedStatus }})</span>
                      </span>
                      <span v-else>—</span>
                      <button
                        v-if="d.type === 'manual'"
                        class="btn btn-secondary btn-sm"
                        style="margin-left: 8px;"
                        @click="removeCarryoverRow(idx)"
                        :disabled="isPeriodPosted"
                      >
                        Remove
                      </button>
                    </td>
                    <td class="right carryover-cell">{{ fmtNum(d.carryoverFinalizedUnits) }}</td>
                  </tr>
                  <tr v-if="!carryoverPreview.length">
                    <td colspan="7" class="muted">No changes detected.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="actions" style="margin-top: 12px; justify-content: space-between;">
              <button class="btn btn-secondary" @click="manualCarryoverEnabled = !manualCarryoverEnabled" :disabled="isPeriodPosted">
                {{ manualCarryoverEnabled ? 'Hide Manual Add' : 'Manual Add' }}
              </button>
              <button class="btn btn-primary" @click="applyCarryover" :disabled="applyingCarryover || !carryoverPriorPeriodId || !carryoverPreview.length || isPeriodPosted">
                {{ applyingCarryover ? 'Applying...' : 'Add to current pay period payroll stage' }}
              </button>
            </div>

            <div v-if="manualCarryoverEnabled" class="card" style="margin-top: 10px;">
              <h3 class="section-title" style="margin-top: 0;">Manual Add (rare)</h3>
              <div class="hint">
                Manually add “Old Done Notes” units into the current pay period payroll stage.
              </div>
              <div class="field-row" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 10px;">
                <div class="field">
                  <label>Provider</label>
                  <select v-model="manualCarryover.userId">
                    <option :value="null" disabled>Select a provider…</option>
                    <option v-for="u in agencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                  </select>
                </div>
                <div class="field">
                  <label>Service Code</label>
                  <input v-model="manualCarryover.serviceCode" type="text" placeholder="e.g., 97110" />
                </div>
                <div class="field">
                  <label>Old Done Notes units</label>
                  <input v-model="manualCarryover.oldDoneNotesUnits" type="number" step="0.01" placeholder="0.00" />
                </div>
              </div>
              <div class="actions" style="margin: 0; justify-content: flex-end;">
                <button class="btn btn-secondary" @click="addManualCarryoverRow" :disabled="isPeriodPosted">
                  Add row
                </button>
              </div>
            </div>
            </div>
          </div>
        </teleport>

      </div>

      <div class="card" v-if="!selectedPeriod">
        <h2 class="card-title">Period Details</h2>
        <div class="muted">Upload a payroll report and we’ll auto-detect the correct pay period (Sat→Fri, 14 days).</div>
        <div class="import-box" style="margin-top: 12px;">
          <div class="import-title">Import Billing Report</div>
          <div class="import-subtitle">CSV/XLSX supported. Must include a service date column (e.g., “Date of Service” / “DOS”).</div>
          <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" @change="onFilePick" />
          <div class="hint" v-if="detectedPeriodHint">{{ detectedPeriodHint }}</div>
          <button class="btn btn-primary" @click="autoImport" :disabled="autoImporting || !importFile || !agencyId">
            {{ autoImporting ? 'Detecting...' : 'Auto-detect Pay Period & Import' }}
          </button>
          <div class="hint" v-if="!agencyId">Select an organization first.</div>
        </div>
      </div>

      <!-- Payroll To-Dos modal -->
      <teleport to="body">
        <div v-if="false && showTodoModal" class="modal-backdrop">
          <div class="modal" style="width: min(920px, 100%);">
            <div class="modal-header">
              <div>
                <div class="modal-title">Payroll To‑Dos</div>
                <div class="hint">These block running payroll until marked Done.</div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" type="button" @click="showTodoModal = false">Close</button>
              </div>
            </div>

            <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
              <button class="btn btn-secondary btn-sm" type="button" @click="todoTab = 'period'">This pay period</button>
              <button class="btn btn-secondary btn-sm" type="button" @click="todoTab = 'templates'">Recurring templates</button>
            </div>

            <div v-if="todoTab === 'period'">
              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Add a To‑Do (single)</h3>
                <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
                  <div class="field">
                    <label>Scope</label>
                    <select v-model="newTodoDraft.scope">
                      <option value="agency">Agency-wide</option>
                      <option value="provider">Per-provider</option>
                    </select>
                  </div>
                  <div v-if="newTodoDraft.scope === 'provider'" class="field">
                    <label>Provider</label>
                    <select v-model="newTodoDraft.targetUserId">
                      <option :value="null">Select provider…</option>
                      <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                    </select>
                  </div>
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Title</label>
                  <input v-model="newTodoDraft.title" type="text" placeholder="e.g., Verify X before running payroll" />
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Description (optional)</label>
                  <textarea v-model="newTodoDraft.description" rows="3" placeholder="Optional details…" />
                </div>
                <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                  <button class="btn btn-primary" type="button" @click="createTodoForPeriod" :disabled="!String(newTodoDraft.title||'').trim()">
                    Add To‑Do
                  </button>
                </div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">To‑Dos for this pay period</h3>
                <div v-if="payrollTodosError" class="warn-box" style="margin-top: 8px;">{{ payrollTodosError }}</div>
                <div v-if="payrollTodosLoading" class="muted" style="margin-top: 8px;">Loading…</div>
                <div v-else-if="!(payrollTodos||[]).length" class="muted" style="margin-top: 8px;">No To‑Dos yet.</div>
                <div v-else class="table-wrap" style="margin-top: 10px;">
                  <table class="table">
                    <thead>
                      <tr>
                        <th style="width: 90px;">Done</th>
                        <th>To‑Do</th>
                        <th style="width: 220px;">Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="t in payrollTodos" :key="t.id">
                        <td>
                          <input
                            type="checkbox"
                            :checked="String(t.status || '').toLowerCase() === 'done'"
                            :disabled="updatingPayrollTodoId === t.id"
                            @change="togglePayrollTodoDone(t, $event.target.checked)"
                          />
                        </td>
                        <td>
                          <div><strong>{{ t.title }}</strong></div>
                          <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                        </td>
                        <td class="muted">
                          <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                          <span v-else>Agency-wide</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div v-else>
              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Create recurring template</h3>
                <div v-if="todoTemplatesError" class="warn-box" style="margin-top: 8px;">{{ todoTemplatesError }}</div>
                <div class="field-row" style="grid-template-columns: 180px 1fr; margin-top: 10px;">
                  <div class="field">
                    <label>Scope</label>
                    <select v-model="templateDraft.scope">
                      <option value="agency">Agency-wide</option>
                      <option value="provider">Per-provider</option>
                    </select>
                  </div>
                  <div v-if="templateDraft.scope === 'provider'" class="field">
                    <label>Provider</label>
                    <select v-model="templateDraft.targetUserId">
                      <option :value="null">Select provider…</option>
                      <option v-for="u in sortedAgencyUsers" :key="u.id" :value="u.id">{{ u.last_name }}, {{ u.first_name }}</option>
                    </select>
                  </div>
                </div>
                <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
                  <div class="field">
                    <label>Start at pay period</label>
                    <select v-model="templateDraft.startPayrollPeriodId">
                      <option :value="null">Start immediately</option>
                      <option v-for="p in periods" :key="p.id" :value="p.id">{{ periodRangeLabel(p) }}</option>
                    </select>
                  </div>
                  <div class="field">
                    <label>Active</label>
                    <select v-model="templateDraft.isActive">
                      <option :value="true">Active</option>
                      <option :value="false">Inactive</option>
                    </select>
                  </div>
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Title</label>
                  <input v-model="templateDraft.title" type="text" placeholder="e.g., Confirm XYZ is correct" />
                </div>
                <div class="field" style="margin-top: 10px;">
                  <label>Description (optional)</label>
                  <textarea v-model="templateDraft.description" rows="3" placeholder="Optional details…" />
                </div>
                <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                  <button class="btn btn-primary" type="button" @click="createTodoTemplate" :disabled="savingTodoTemplate || !String(templateDraft.title||'').trim()">
                    {{ savingTodoTemplate ? 'Saving…' : 'Create template' }}
                  </button>
                </div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Templates</h3>
                <div v-if="todoTemplatesLoading" class="muted" style="margin-top: 8px;">Loading templates…</div>
                <div v-else-if="!(todoTemplates||[]).length" class="muted" style="margin-top: 8px;">No templates yet.</div>
                <div v-else class="table-wrap" style="margin-top: 10px;">
                  <table class="table">
                    <thead>
                      <tr>
                        <th style="width: 90px;">Active</th>
                        <th>Template</th>
                        <th style="width: 240px;">Starts</th>
                        <th style="width: 120px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="t in todoTemplates" :key="t.id">
                        <td>
                          <input
                            type="checkbox"
                            :checked="Number(t.is_active) === 1"
                            :disabled="deletingTodoTemplateId === t.id"
                            @change="toggleTodoTemplateActive(t, $event.target.checked)"
                          />
                        </td>
                        <td>
                          <div><strong>{{ t.title }}</strong></div>
                          <div class="muted" style="margin-top: 4px;">
                            <span v-if="String(t.scope||'agency')==='provider'">Provider: {{ nameForUserId(Number(t.target_user_id || 0)) }}</span>
                            <span v-else>Agency-wide</span>
                          </div>
                          <div v-if="t.description" class="muted" style="margin-top: 4px;">{{ t.description }}</div>
                        </td>
                        <td class="muted">
                          <span v-if="Number(t.start_payroll_period_id||0) > 0">From period #{{ t.start_payroll_period_id }}</span>
                          <span v-else>Immediately</span>
                        </td>
                        <td class="right">
                          <button class="btn btn-danger btn-sm" type="button" :disabled="deletingTodoTemplateId === t.id" @click="deleteTodoTemplate(t)">
                            {{ deletingTodoTemplateId === t.id ? 'Deleting…' : 'Delete' }}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </teleport>

      <!-- Payroll Wizard modal (no click-out close) -->
      <teleport to="body">
        <div v-if="false && showPayrollWizardModal" class="modal-backdrop">
          <div class="modal" style="width: min(980px, 100%);">
            <div class="modal-header">
              <div>
                <div class="modal-title">Payroll Wizard</div>
                <div class="hint">Step-by-step guide. Save anytime; no click-out close.</div>
              </div>
              <div class="actions" style="margin: 0;">
                <button class="btn btn-secondary btn-sm" type="button" @click="wizardSaveAndExit" :disabled="wizardSaving">Save edits & exit</button>
                <button class="btn btn-danger btn-sm" type="button" @click="wizardDiscardAndExit" :disabled="wizardSaving" style="margin-left: 8px;">Don’t save & exit</button>
              </div>
            </div>

            <div v-if="wizardError" class="warn-box" style="margin-top: 10px;">{{ wizardError }}</div>
            <div v-if="wizardLoading" class="muted" style="margin-top: 10px;">Loading wizard…</div>
            <div v-else style="margin-top: 10px;">
              <div class="card">
                <div class="hint" style="font-weight: 700;">Step {{ wizardStepIdx + 1 }} of {{ wizardSteps.length }} — {{ wizardStep?.title }}</div>
                <div class="hint" style="margin-top: 6px;">You can use Back/Next; the wizard saves progress as you move.</div>
              </div>

              <div class="card" style="margin-top: 12px;">
                <h3 class="card-title" style="margin: 0 0 6px 0;">Current step actions</h3>

              <div v-if="wizardStep?.key === 'prior'" class="hint">
                Post the <strong>prior</strong> pay period first so you can properly process late notes/changes.
                Then use <strong>Process Changes</strong> to re-run the prior report and compare “then → now”.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="wizardGoToProcessChanges" :disabled="!selectedPeriodId">Go to Process Changes</button>
                  </div>
                </div>

              <div v-else-if="wizardStep?.key === 'apply'" class="hint">
                Post the <strong>differences</strong> into the current pay period (carryover), then continue.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="openCarryoverModal" :disabled="!selectedPeriodId || isPeriodPosted">Open carryover tool</button>
                  <button class="btn btn-secondary" type="button" @click="showStageModal = true" :disabled="!selectedPeriodId" style="margin-left: 8px;">Open Payroll Stage</button>
                  </div>
                </div>

              <div v-else-if="wizardStep?.key === 'review'" class="hint">
                Review what changed (No-note/Draft unpaid → Old Done Notes) before running payroll.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                  <button class="btn btn-secondary" type="button" @click="openCarryoverModal" :disabled="!selectedPeriodId || isPeriodPosted">Open No-note/Draft Unpaid</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'drafts'" class="hint">
                  Edit draft-payable decisions in Raw Import (Draft Audit).
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('draft_audit')" :disabled="!selectedPeriodId">Open Raw Import (Draft Audit)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'h0031'" class="hint">
                  Process H0031 minutes + mark Done.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h0031')" :disabled="!selectedPeriodId">Open Raw Import (H0031)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'h0032'" class="hint">
                  Process H0032 minutes + mark Done.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="wizardOpenRawMode('process_h0032')" :disabled="!selectedPeriodId">Open Raw Import (H0032)</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'stage'" class="hint">
                  Review Payroll Stage workspace edits, claims, To‑Dos, and adjustments.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="showStageModal = true" :disabled="!selectedPeriodId">Open Payroll Stage</button>
                    <button class="btn btn-secondary" type="button" @click="openTodoModal" :disabled="!selectedPeriodId" style="margin-left: 8px;">Manage To‑Dos</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'run'" class="hint">
                  Run payroll to compute totals (blocked if To‑Dos or submissions are pending).
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-primary" type="button" @click="runPayroll" :disabled="runningPayroll || isPeriodPosted || !selectedPeriodId">
                      {{ runningPayroll ? 'Running…' : 'Run Payroll' }}
                    </button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'preview'" class="hint">
                  Preview provider view + post-time notifications.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-secondary" type="button" @click="openPreviewPostModalV2" :disabled="!selectedPeriodId || !canSeeRunResults">Open Preview Post</button>
                  </div>
                </div>

                <div v-else-if="wizardStep?.key === 'post'" class="hint">
                  Post payroll to make it visible to providers.
                  <div class="actions" style="margin-top: 10px; justify-content: flex-start;">
                    <button class="btn btn-primary" type="button" @click="postPayroll" :disabled="postingPayroll || isPeriodPosted || selectedPeriodStatus !== 'ran'">
                      {{ postingPayroll ? 'Posting…' : 'Post Payroll' }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="actions" style="margin-top: 12px; justify-content: space-between;">
                <button class="btn btn-secondary" type="button" @click="wizardBack" :disabled="wizardStepIdx <= 0 || wizardSaving">Back</button>
                <button class="btn btn-primary" type="button" @click="wizardNext" :disabled="wizardStepIdx >= wizardSteps.length - 1 || wizardSaving">
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </teleport>
    </div>

    <!-- Rate Sheet Import removed (no longer needed) -->
    </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../services/api';
import { useAgencyStore } from '../../store/agency';
import { useOrganizationStore } from '../../store/organization';
import { useAuthStore } from '../../store/auth';
import { useBrandingStore } from '../../store/branding';
import AdminPayrollSubmitOverride from '../../components/admin/AdminPayrollSubmitOverride.vue';

const router = useRouter();
const route = useRoute();
const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();
const authStore = useAuthStore();
const brandingStore = useBrandingStore();

const isSuperAdmin = computed(() => String(authStore.user?.role || '').toLowerCase() === 'super_admin');

const openPayrollReports = async () => {
  const pid = Number(selectedPeriodId.value || 0);
  if (!pid) return;
  const slug = String(
    route.params?.organizationSlug ||
    agencyStore.currentAgency?.slug ||
    organizationStore.organizationContext?.slug ||
    ''
  ).trim();
  const path = slug ? `/${slug}/admin/payroll/reports` : '/admin/payroll/reports';
  await router.push({ path, query: { periodId: String(pid) } });
};

// super-admin-only rate sheet import removed

const orgSearch = ref('');
const historySearch = ref('');
const selectedOrgId = ref(null);

const agencyId = computed(() => {
  const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
  return a?.id || organizationStore.organizationContext?.id || null;
});

const periods = ref([]);
const selectedPeriodId = ref(null);
const selectedPeriod = ref(null);
const summaries = ref([]);
const error = ref('');

const formatPayrollImportError = (e, fallbackMessage) => {
  const msg = e?.response?.data?.error?.message || e?.message || fallbackMessage || 'Request failed';
  const meta = e?.response?.data?.error?.errorMeta || null;
  const parts = [String(msg)];
  if (meta?.rowNumber) parts.push(`Row: ${meta.rowNumber}`);
  if (Array.isArray(meta?.detectedHeaders) && meta.detectedHeaders.length) {
    parts.push(`Detected columns: ${meta.detectedHeaders.slice(0, 30).join(', ')}`);
  }
  return parts.join(' | ');
};

const importFile = ref(null);
const importing = ref(false);
const unmatchedProviders = ref([]);
const createdUsers = ref([]);
const autoImporting = ref(false);
const detectedPeriodHint = ref('');
const currentPayrollFileInput = ref(null);
const confirmAutoImportOpen = ref(false);
const autoDetecting = ref(false);
const autoDetectResult = ref(null); // { detected, existingPeriodId }
const autoImportChoiceMode = ref('detected'); // 'detected' | 'existing'
const autoImportExistingPeriodId = ref(null);

const triggerCurrentPayrollUpload = () => {
  try {
    if (currentPayrollFileInput.value) currentPayrollFileInput.value.click();
  } catch {
    // ignore
  }
};

const clearImportFile = () => {
  importFile.value = null;
  detectedPeriodHint.value = '';
  autoDetectResult.value = null;
  try {
    if (currentPayrollFileInput.value) currentPayrollFileInput.value.value = '';
  } catch {
    // ignore
  }
};

// rate sheet import removed

const selectedSummary = ref(null);
const selectedUserId = ref(null);
const agencyUsers = ref([]);
const loadingUsers = ref(false);
const sortedAgencyUsers = computed(() => {
  const list = (agencyUsers.value || []).slice();
  list.sort((a, b) => {
    const al = String(a?.last_name || '').trim().toLowerCase();
    const bl = String(b?.last_name || '').trim().toLowerCase();
    const af = String(a?.first_name || '').trim().toLowerCase();
    const bf = String(b?.first_name || '').trim().toLowerCase();
    return al.localeCompare(bl) || af.localeCompare(bf) || (Number(a?.id || 0) - Number(b?.id || 0));
  });
  return list;
});

const summariesSortedByProvider = computed(() => {
  const list = (summaries.value || []).slice();
  list.sort((a, b) => {
    const al = String(a?.last_name || '').trim().toLowerCase();
    const bl = String(b?.last_name || '').trim().toLowerCase();
    const af = String(a?.first_name || '').trim().toLowerCase();
    const bf = String(b?.first_name || '').trim().toLowerCase();
    return al.localeCompare(bl) || af.localeCompare(bf) || (Number(a?.user_id || 0) - Number(b?.user_id || 0));
  });
  return list;
});
const rateServiceCode = ref('');
const rateAmount = ref('');
const savingRate = ref(false);
const submitting = ref(false);

const stagingMatched = ref([]);
const stagingUnmatched = ref([]);
const stagingLoading = ref(false);
const stagingError = ref('');
const tierByUserId = ref({});
const salaryByUserId = ref({});
const stagingEdits = ref({});
const stagingEditsBaseline = ref({});
const savingStaging = ref(false);
const workspaceSearch = ref('');
const showStageModal = ref(false);
const showRawModal = ref(false);
const showRunModal = ref(false);
const showPayrollToolsModal = ref(false);
const showSubmitOnBehalfModal = ref(false);
const showTodoModal = ref(false);
const showHolidayHoursModal = ref(false);
const showPayrollWizardModal = ref(false);
const payrollToolsTab = ref('compare'); // compare | viewer
const payrollToolsLoading = ref(false);
const payrollToolsError = ref('');
const toolsFile1 = ref(null);
const toolsFile2 = ref(null);
const toolsViewerFile = ref(null);
const payrollToolsCompareResult = ref(null);
const payrollToolsViewerResult = ref(null);

const holidayHoursLoading = ref(false);
const holidayHoursError = ref('');
const holidayHoursMatched = ref([]);
const holidayHoursUnmatched = ref([]);

// Compare controls
const payrollToolsCompareMode = ref('detail'); // detail | summary
const payrollToolsCompareFilter = ref('changed'); // all | changed | added | removed
const payrollToolsCompareSort = ref('human'); // human | change | code | date

const submitOnBehalfSearch = ref('');
const submitOnBehalfUserId = ref(null);
const submitOnBehalfTierLoading = ref(false);
const submitOnBehalfTierError = ref('');
const submitOnBehalfTierResp = ref(null); // { payrollPeriodId, periodStart, periodEnd, graceActive, tier }

const submitOnBehalfUsers = computed(() => {
  const qRaw = String(submitOnBehalfSearch.value || '').trim().toLowerCase();
  const list = sortedAgencyUsers.value || [];
  if (!qRaw) return list;
  // Support multi-word searches like "john sm" or "smith john".
  const tokens = qRaw
    .replace(/,+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return list;
  return list.filter((u) => {
    const first = String(u?.first_name || '').trim().toLowerCase();
    const last = String(u?.last_name || '').trim().toLowerCase();
    const email = String(u?.email || '').trim().toLowerCase();
    const hay = `${first} ${last} ${last}, ${first} ${email}`.trim();
    return tokens.every((t) => hay.includes(t));
  });
});

const loadSubmitOnBehalfTier = async () => {
  const uid = submitOnBehalfUserId.value ? Number(submitOnBehalfUserId.value) : null;
  const aid = agencyId.value ? Number(agencyId.value) : null;
  if (!uid || !aid) {
    submitOnBehalfTierResp.value = null;
    submitOnBehalfTierError.value = '';
    return;
  }
  try {
    submitOnBehalfTierLoading.value = true;
    submitOnBehalfTierError.value = '';
    const resp = await api.get(`/payroll/users/${uid}/current-tier`, { params: { agencyId: aid } });
    submitOnBehalfTierResp.value = resp.data || null;
  } catch (e) {
    submitOnBehalfTierError.value = e.response?.data?.error?.message || e.message || 'Failed to load provider tier';
    submitOnBehalfTierResp.value = null;
  } finally {
    submitOnBehalfTierLoading.value = false;
  }
};

const submitOnBehalfTierUi = computed(() => {
  const r = submitOnBehalfTierResp.value || null;
  if (!submitOnBehalfUserId.value) return null;
  if (submitOnBehalfTierLoading.value) return { label: 'Loading tier…' };
  if (String(submitOnBehalfTierError.value || '').trim()) return { label: `Tier: — (${submitOnBehalfTierError.value})` };
  const tier = r?.tier || null;
  if (!r?.payrollPeriodId || !tier) return { label: 'Most recent tier: — (no posted payroll yet)' };
  const grace = r?.graceActive ? 'Grace' : 'Current';
  const tierLabel = String(tier?.label || '').trim() || `Tier ${Number(tier?.tierLevel || 0) || '—'}`;
  const range = (r?.periodStart && r?.periodEnd) ? `${String(r.periodStart).slice(0, 10)} → ${String(r.periodEnd).slice(0, 10)}` : null;
  return { label: `Most recent tier: ${tierLabel} (${grace})${range ? ` • ${range}` : ''}` };
});

// UX: when the search narrows to a single provider, auto-select them so the UI doesn't
// misleadingly stay on the placeholder ("Select a provider…") while the dropdown only has one option.
watch([showSubmitOnBehalfModal, submitOnBehalfSearch, submitOnBehalfUsers], () => {
  if (!showSubmitOnBehalfModal.value) return;
  const q = String(submitOnBehalfSearch.value || '').trim();
  if (!q) return;
  const matches = submitOnBehalfUsers.value || [];
  const ids = matches.map((u) => u?.id).filter(Boolean);
  if (ids.length === 1) {
    submitOnBehalfUserId.value = ids[0];
    return;
  }
  // If the current selection is no longer visible in the filtered results, clear it.
  if (submitOnBehalfUserId.value && !ids.includes(submitOnBehalfUserId.value)) {
    submitOnBehalfUserId.value = null;
  }
});

watch([showSubmitOnBehalfModal, submitOnBehalfUserId, agencyId], async () => {
  if (!showSubmitOnBehalfModal.value) return;
  await loadSubmitOnBehalfTier();
});
const submitOnBehalfUserName = computed(() => {
  const id = submitOnBehalfUserId.value ? Number(submitOnBehalfUserId.value) : null;
  const u = (agencyUsers.value || []).find((x) => Number(x?.id) === id) || null;
  if (!u) return id ? `User #${id}` : '';
  const ln = String(u.last_name || '').trim();
  const fn = String(u.first_name || '').trim();
  return (ln || fn) ? `${ln}${ln && fn ? ', ' : ''}${fn}` : `User #${id}`;
});

const submitOnBehalfUser = computed(() => {
  const id = submitOnBehalfUserId.value ? Number(submitOnBehalfUserId.value) : null;
  return (agencyUsers.value || []).find((x) => Number(x?.id) === id) || null;
});

const payrollToolsCompareAllRows = computed(() => {
  const r = payrollToolsCompareResult.value;
  const rows = Array.isArray(r?.changes) ? r.changes : [];
  return rows.filter((x) => x && x.changeType);
});

const payrollToolsCompareFilteredRows = computed(() => {
  const rows = payrollToolsCompareAllRows.value || [];
  switch (String(payrollToolsCompareFilter.value || 'changed')) {
    case 'all':
      return rows;
    case 'added':
      return rows.filter((r) => r.changeType === 'added');
    case 'removed':
      return rows.filter((r) => r.changeType === 'removed');
    case 'changed':
    default:
      return rows.filter((r) => r.changeType === 'changed');
  }
});

const toolsProviderKey = (row) => {
  const x = row?.after || row?.before || null;
  return String(x?.providerName || '').trim().toLowerCase();
};
const toolsCodeKey = (row) => {
  const x = row?.after || row?.before || null;
  return String(x?.serviceCode || '').trim().toUpperCase();
};
const toolsDateKey = (row) => {
  const x = row?.after || row?.before || null;
  return String(x?.ymd || '').trim(); // YYYY-MM-DD
};
const toolsChangeKey = (row) => {
  const t = String(row?.changeType || '');
  // Sort order: changed > added > removed (most relevant first)
  if (t === 'changed') return 0;
  if (t === 'added') return 1;
  if (t === 'removed') return 2;
  return 9;
};

const payrollToolsCompareRows = computed(() => {
  const rows = (payrollToolsCompareFilteredRows.value || []).slice();
  const sortKey = String(payrollToolsCompareSort.value || 'human');
  rows.sort((a, b) => {
    if (sortKey === 'change') {
      const d = toolsChangeKey(a) - toolsChangeKey(b);
      if (d) return d;
    }
    if (sortKey === 'code') {
      const d = toolsCodeKey(a).localeCompare(toolsCodeKey(b));
      if (d) return d;
    }
    if (sortKey === 'date') {
      const d = toolsDateKey(b).localeCompare(toolsDateKey(a)); // desc
      if (d) return d;
    }
    // default/human
    const d = toolsProviderKey(a).localeCompare(toolsProviderKey(b));
    if (d) return d;
    const c = toolsCodeKey(a).localeCompare(toolsCodeKey(b));
    if (c) return c;
    return toolsDateKey(b).localeCompare(toolsDateKey(a));
  });
  // Keep UI responsive.
  return rows.slice(0, 2500);
});

const payrollToolsSummaryRows = computed(() => {
  // Summarize ONLY over the filtered set (so you can summarize "changed only", etc.)
  const rows = payrollToolsCompareFilteredRows.value || [];
  const by = new Map(); // `${provider}|${code}` -> agg
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  for (const r of rows) {
    const x = r?.after || r?.before || null;
    if (!x) continue;
    const providerName = String(x.providerName || '').trim() || '—';
    const serviceCode = String(x.serviceCode || '').trim() || '—';
    const k = `${providerName.toLowerCase()}|${serviceCode.toUpperCase()}`;
    if (!by.has(k)) {
      by.set(k, {
        providerName,
        serviceCode,
        doc1: { NO_NOTE: 0, DRAFT: 0, FINALIZED: 0 },
        doc2: { NO_NOTE: 0, DRAFT: 0, FINALIZED: 0 }
      });
    }
    const agg = by.get(k);
    const b = r.before?.unitsByStatus || {};
    const a = r.after?.unitsByStatus || {};
    agg.doc1.NO_NOTE += num(b.NO_NOTE);
    agg.doc1.DRAFT += num(b.DRAFT);
    agg.doc1.FINALIZED += num(b.FINALIZED);
    agg.doc2.NO_NOTE += num(a.NO_NOTE);
    agg.doc2.DRAFT += num(a.DRAFT);
    agg.doc2.FINALIZED += num(a.FINALIZED);
  }
  const out = Array.from(by.values()).map((x) => {
    const dNo = Number((x.doc2.NO_NOTE - x.doc1.NO_NOTE).toFixed(2));
    const dDr = Number((x.doc2.DRAFT - x.doc1.DRAFT).toFixed(2));
    const dFi = Number((x.doc2.FINALIZED - x.doc1.FINALIZED).toFixed(2));
    const narrativeParts = [];
    if (Math.abs(dNo) > 1e-9) narrativeParts.push(`NO_NOTE ${dNo > 0 ? '+' : ''}${dNo}`);
    if (Math.abs(dDr) > 1e-9) narrativeParts.push(`DRAFT ${dDr > 0 ? '+' : ''}${dDr}`);
    if (Math.abs(dFi) > 1e-9) narrativeParts.push(`FINAL ${dFi > 0 ? '+' : ''}${dFi}`);
    const narrative = narrativeParts.length ? narrativeParts.join(', ') : 'no net change';
    return { ...x, delta: { NO_NOTE: dNo, DRAFT: dDr, FINALIZED: dFi }, narrative };
  });
  const sortKey = String(payrollToolsCompareSort.value || 'human');
  out.sort((a, b) => {
    if (sortKey === 'code') return String(a.serviceCode).localeCompare(String(b.serviceCode));
    if (sortKey === 'human') return String(a.providerName).localeCompare(String(b.providerName), undefined, { sensitivity: 'base' }) || String(a.serviceCode).localeCompare(String(b.serviceCode));
    // For change sorting in summary, sort by absolute finalized delta desc.
    if (sortKey === 'change') return Math.abs(Number(b.delta.FINALIZED || 0)) - Math.abs(Number(a.delta.FINALIZED || 0));
    return String(a.providerName).localeCompare(String(b.providerName), undefined, { sensitivity: 'base' }) || String(a.serviceCode).localeCompare(String(b.serviceCode));
  });
  return out.slice(0, 5000);
});

const openPayrollToolsModal = () => {
  payrollToolsTab.value = 'compare';
  payrollToolsLoading.value = false;
  payrollToolsError.value = '';
  toolsFile1.value = null;
  toolsFile2.value = null;
  toolsViewerFile.value = null;
  payrollToolsCompareResult.value = null;
  payrollToolsViewerResult.value = null;
  payrollToolsCompareMode.value = 'detail';
  payrollToolsCompareFilter.value = 'changed';
  payrollToolsCompareSort.value = 'human';
  showPayrollToolsModal.value = true;
};

const onToolsFile1 = (e) => { toolsFile1.value = e?.target?.files?.[0] || null; };
const onToolsFile2 = (e) => { toolsFile2.value = e?.target?.files?.[0] || null; };
const onToolsViewerFile = (e) => { toolsViewerFile.value = e?.target?.files?.[0] || null; };

const runPayrollToolsCompare = async () => {
  if (!agencyId.value || !toolsFile1.value || !toolsFile2.value) return;
  try {
    payrollToolsLoading.value = true;
    payrollToolsError.value = '';
    payrollToolsCompareResult.value = null;
    payrollToolsViewerResult.value = null;
    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('file1', toolsFile1.value);
    fd.append('file2', toolsFile2.value);
    const resp = await api.post('/payroll/tools/payroll/compare', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    payrollToolsCompareResult.value = resp.data || null;
  } catch (e) {
    payrollToolsError.value = e.response?.data?.error?.message || e.message || 'Failed to compare files';
  } finally {
    payrollToolsLoading.value = false;
  }
};

const runPayrollToolsViewer = async () => {
  if (!agencyId.value || !toolsViewerFile.value) return;
  try {
    payrollToolsLoading.value = true;
    payrollToolsError.value = '';
    payrollToolsViewerResult.value = null;
    payrollToolsCompareResult.value = null;
    const fd = new FormData();
    fd.append('agencyId', String(agencyId.value));
    fd.append('file', toolsViewerFile.value);
    const resp = await api.post('/payroll/tools/payroll/viewer', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    payrollToolsViewerResult.value = resp.data || null;
  } catch (e) {
    payrollToolsError.value = e.response?.data?.error?.message || e.message || 'Failed to open viewer';
  } finally {
    payrollToolsLoading.value = false;
  }
};

const showPreviewPostModal = ref(false);
const previewPostNotificationsLoading = ref(false);
const previewPostNotificationsError = ref('');
const previewPostNotifications = ref([]);
const previewUserPayrollHistoryLoading = ref(false);
const previewUserPayrollHistoryError = ref('');
const previewUserPayrollHistory = ref([]); // PayrollSummary.listForUser rows (includes period_start/end/status)

const previewCarryoverNotes = computed(() => {
  const b = previewSummary.value?.breakdown || null;
  const n = Number(b?.__carryover?.carryoverNotesTotal ?? b?.__carryover?.oldDoneNotesNotesTotal ?? 0);
  return Number.isFinite(n) ? n : 0;
});

const previewUnpaidInPeriod = computed(() => {
  const b = previewSummary.value?.breakdown || null;
  const c = b?.__unpaidNotesCounts || null;
  const noNote = Number(c?.noNoteNotes || 0);
  const draft = Number(c?.draftNotes || 0);
  const safeNo = Number.isFinite(noNote) ? noNote : 0;
  const safeDr = Number.isFinite(draft) ? draft : 0;
  return { noNote: safeNo, draft: safeDr, total: safeNo + safeDr };
});

const previewTwoPeriodsAgoRow = computed(() => {
  const rows = previewUserPayrollHistory.value || [];
  if (!selectedPeriodId.value || !previewUserId.value) return null;
  const idx = rows.findIndex((r) => Number(r.payroll_period_id) === Number(selectedPeriodId.value));
  if (idx < 0) return null;
  // rows are ordered DESC by period_start; 2 periods ago is +2
  return rows[idx + 2] || null;
});

const previewTwoPeriodsAgoUnpaid = computed(() => {
  const r = previewTwoPeriodsAgoRow.value;
  if (!r) return { noNote: 0, draft: 0, total: 0, periodStart: '', periodEnd: '' };
  const c = r?.unpaidNotesCounts || null;
  const noNote = Number(c?.noNote ?? 0);
  const draft = Number(c?.draft ?? 0);
  const safeNo = Number.isFinite(noNote) ? noNote : 0;
  const safeDr = Number.isFinite(draft) ? draft : 0;
  return {
    noNote: safeNo,
    draft: safeDr,
    total: safeNo + safeDr,
    periodStart: String(r.period_start || '').slice(0, 10),
    periodEnd: String(r.period_end || '').slice(0, 10)
  };
});
const showCarryoverModal = ref(false);
const rawImportRows = ref([]);
const missedAppointmentsPaidInFull = ref([]); // display-only flags from billing import
const rawDraftSearch = ref('');
const rawDraftOnly = ref(true);
const rawRowLimit = ref(200);
const rawSortColumn = ref('service_date'); // provider_name | client | service_code | service_date | unit_count | note_status | draft_payable
const rawSortDirection = ref('desc'); // asc | desc
const rawProcessChecklistByRowId = ref({}); // UI-only checklist (not saved anywhere)
const rawPostedProcessingUnlocked = ref(false);
const updatingDraftPayable = ref(false);
const rawDraftError = ref('');
const runningPayroll = ref(false);
const postingPayroll = ref(false);
const unpostingPayroll = ref(false);
const resettingPeriod = ref(false);
const restagingPeriod = ref(false);
const previewUserId = ref(null);
const previewAdjustments = ref(null);
const previewAdjustmentsLoading = ref(false);
const previewAdjustmentsError = ref('');

const mileageRatesLoading = ref(false);
const savingMileageRates = ref(false);
const mileageRatesError = ref('');
const mileageRatesDraft = ref({ tier1: 0, tier2: 0, tier3: 0 });

const pendingMileageClaims = ref([]);
const pendingMileageLoading = ref(false);
const pendingMileageError = ref('');
const approvingMileageClaimId = ref(null);
const mileageTierByClaimId = ref({});
const mileageTargetPeriodByClaimId = ref({});
// Preserve the user's view when approving (all pending vs this period only)
const pendingMileageMode = ref('period'); // 'period' | 'all'

const showMileageDetailsModal = ref(false);
const selectedMileageClaim = ref(null);

const pendingMedcancelClaims = ref([]);
const pendingMedcancelLoading = ref(false);
const pendingMedcancelError = ref('');
const approvingMedcancelClaimId = ref(null);
const medcancelTargetPeriodByClaimId = ref({});
const pendingMedcancelMode = ref('period'); // 'period' | 'all'

const pendingReimbursementClaims = ref([]);
const pendingReimbursementLoading = ref(false);
const pendingReimbursementError = ref('');
const approvingReimbursementClaimId = ref(null);
const reimbursementTargetPeriodByClaimId = ref({});
const pendingReimbursementMode = ref('period'); // 'period' | 'all'

const pendingTimeClaims = ref([]);
const pendingTimeLoading = ref(false);
const pendingTimeError = ref('');
const approvingTimeClaimId = ref(null);
const timeTargetPeriodByClaimId = ref({});
const pendingTimeMode = ref('period'); // 'period' | 'all'

const pendingHolidayBonusClaims = ref([]);
const pendingHolidayBonusLoading = ref(false);
const pendingHolidayBonusError = ref('');
const updatingHolidayBonusClaimId = ref(null);
const pendingHolidayBonusMode = ref('period'); // 'period' | 'all'

const pendingPtoRequests = ref([]);
const pendingPtoLoading = ref(false);
const pendingPtoError = ref('');
const approvingPtoRequestId = ref(null);
const ptoBalancesByUserId = ref({}); // userId -> { sickHours, trainingHours }
const pendingPtoMode = ref('period'); // 'period' | 'all'

const serviceCodeRules = ref([]);
const serviceCodeRulesLoading = ref(false);
const serviceCodeRulesError = ref('');

// Process Changes workflow (late notes carryover)
const processImportFile = ref(null);
const processingChanges = ref(false);
const processError = ref('');
const processDetectedHint = ref('');
const processSourcePeriodId = ref(null);
const processSourcePeriodLabel = ref('');

const processPriorPeriodOptions = computed(() => {
  const dest = selectedPeriodForUi.value || selectedPeriod.value || null;
  const destStart = String(dest?.period_start || '').slice(0, 10);
  const destId = Number(selectedPeriodId.value || 0);
  const list = Array.isArray(periods.value) ? periods.value : [];
  const filtered = list.filter((p) => {
    if (!p?.id) return false;
    const pid = Number(p.id || 0);
    if (destId && pid === destId) return false;
    if (String(p?.status || '').toLowerCase() === 'draft') return false;
    if (destStart) {
      const end = String(p?.period_end || '').slice(0, 10);
      if (end && end >= destStart) return false;
    }
    return true;
  });
  filtered.sort((a, b) => String(b?.period_end || '').localeCompare(String(a?.period_end || '')));
  return filtered;
});

const processConfirmOpen = ref(false);
const processDetectResult = ref(null); // { detected, existingPeriodId }
const processChoiceMode = ref('detected'); // 'detected' | 'existing'
const processExistingPeriodId = ref(null);

// Legacy (removed from UI)
const applyToCurrentPeriodId = ref(null); // keep to avoid breaking older helpers
const lastImportedPeriodId = ref(null);

const carryoverPriorPeriodId = ref(null);
const carryoverRuns = ref([]);
const carryoverBaselineRunId = ref(null);
const carryoverCompareRunId = ref(null);
const carryoverLoading = ref(false);
const carryoverError = ref('');
const carryoverPreview = ref([]);
const carryoverDraftReview = ref([]); // destination/current period DRAFT rows that likely need draft-pay confirmation
const carryoverDraftReviewSearch = ref('');
const updatingCarryoverDraftRowId = ref(null);
const carryoverPriorStillUnpaid = ref([]); // rows in the prior period that are STILL unpaid after the comparison run
const carryoverPriorStillUnpaidMeta = ref(null); // { priorPeriodId, baselineRunId, compareRunId }
const loadingPriorStillUnpaidForStage = ref(false);
const priorStillUnpaidStageError = ref('');
const applyingCarryover = ref(false);
const carryoverApplyResult = ref(null); // { inserted: number, warnings?: any[] }
const manualCarryoverEnabled = ref(false);

// Stage editing for yellow/red columns (persisted)
const stageCarryoverEditMode = ref(false);
const stageCarryoverEdits = ref({}); // key -> number (old done notes)
const stagePriorUnpaidEdits = ref({}); // key -> number (prior still unpaid)
const savingStageCarryoverEdits = ref(false);
const savingStagePriorUnpaidEdits = ref(false);
const manualCarryover = ref({
  userId: null,
  serviceCode: '',
  oldDoneNotesUnits: ''
});

const adjustments = ref({
  mileageAmount: 0,
  medcancelAmount: 0,
  otherTaxableAmount: 0,
  imatterAmount: 0,
  missedAppointmentsAmount: 0,
  bonusAmount: 0,
  reimbursementAmount: 0,
  tuitionReimbursementAmount: 0,
  otherRate1Hours: 0,
  otherRate2Hours: 0,
  otherRate3Hours: 0,
  salaryAmount: 0,
  // Display-only: derived from payroll salary positions when no manual override exists.
  salaryEffectiveAmount: 0,
  salarySource: 'none', // none | position | manual_override
  salaryPerPayPeriod: 0,
  salaryIncludeServicePay: 0,
  salaryIsProrated: 0,
  ptoHours: 0,
  ptoRate: 0
});

const otherRateTitlesForAdjustments = ref({ title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' });
const loadOtherRateTitlesForAdjustments = async () => {
  const uid = selectedUserId.value;
  if (!agencyId.value || !uid) {
    otherRateTitlesForAdjustments.value = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' };
    return;
  }
  try {
    const resp = await api.get('/payroll/other-rate-titles', { params: { agencyId: agencyId.value, userId: uid } });
    otherRateTitlesForAdjustments.value = {
      title1: resp.data?.title1 || 'Other 1',
      title2: resp.data?.title2 || 'Other 2',
      title3: resp.data?.title3 || 'Other 3'
    };
  } catch {
    otherRateTitlesForAdjustments.value = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' };
  }
};

const approvedMileageClaimsLoading = ref(false);
const approvedMileageClaimsAmount = ref(0);

const loadApprovedMileageClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedMileageClaimsAmount.value = 0;
    return;
  }
  try {
    approvedMileageClaimsLoading.value = true;
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: pid,
        userId: uid
      }
    });
    const rows = resp.data || [];
    approvedMileageClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
  } catch {
    approvedMileageClaimsAmount.value = 0;
  } finally {
    approvedMileageClaimsLoading.value = false;
  }
};

const approvedMedcancelClaimsLoading = ref(false);
const approvedMedcancelClaimsAmount = ref(0);

const loadApprovedMedcancelClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedMedcancelClaimsAmount.value = 0;
    return;
  }
  try {
    approvedMedcancelClaimsLoading.value = true;
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        userId: uid,
        status: 'approved',
        targetPeriodId: pid
      }
    });
    const rows = resp.data || [];
    approvedMedcancelClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
  } catch {
    approvedMedcancelClaimsAmount.value = 0;
  } finally {
    approvedMedcancelClaimsLoading.value = false;
  }
};

const approvedReimbursementClaimsLoading = ref(false);
const approvedReimbursementClaimsAmount = ref(0);

// Supervision import (CSV per pay period)
const supervisionImporting = ref(false);
const supervisionImportError = ref('');
const supervisionImportResult = ref(null);
const supervisionCsvFile = ref(null);
const supervisionCsvName = ref('');

const loadApprovedReimbursementClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedReimbursementClaimsAmount.value = 0;
    return;
  }
  try {
    approvedReimbursementClaimsLoading.value = true;
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: pid,
        userId: uid
      }
    });
    const rows = resp.data || [];
    approvedReimbursementClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || c?.amount || 0), 0);
  } catch {
    approvedReimbursementClaimsAmount.value = 0;
  } finally {
    approvedReimbursementClaimsLoading.value = false;
  }
};

const approvedHolidayBonusClaimsLoading = ref(false);
const approvedHolidayBonusClaimsAmount = ref(0);

const loadApprovedHolidayBonusClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedHolidayBonusClaimsAmount.value = 0;
    return;
  }
  try {
    approvedHolidayBonusClaimsLoading.value = true;
    const resp = await api.get('/payroll/holiday-bonus-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        payrollPeriodId: pid,
        userId: uid
      }
    });
    const rows = resp.data || [];
    approvedHolidayBonusClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
  } catch {
    approvedHolidayBonusClaimsAmount.value = 0;
  } finally {
    approvedHolidayBonusClaimsLoading.value = false;
  }
};

const loadApprovedTimeClaimsAmount = async () => {
  const uid = selectedUserId.value;
  const pid = selectedPeriodId.value;
  if (!agencyId.value || !uid || !pid) {
    approvedTimeClaimsAmount.value = 0;
    return;
  }
  try {
    approvedTimeClaimsLoading.value = true;
    const resp = await api.get('/payroll/time-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: pid,
        userId: uid
      }
    });
    const rows = resp.data || [];
    approvedTimeClaimsAmount.value = rows.reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
  } catch {
    approvedTimeClaimsAmount.value = 0;
  } finally {
    approvedTimeClaimsLoading.value = false;
  }
};

const approvedMileageListLoading = ref(false);
const approvedMileageListError = ref('');
const approvedMileageClaims = ref([]);
const approvedMileageMoveTargetByClaimId = ref({});
const movingMileageClaimId = ref(null);

const approvedMedcancelListLoading = ref(false);
const approvedMedcancelListError = ref('');
const approvedMedcancelClaims = ref([]);
const unapprovingMedcancelClaimId = ref(null);

const approvedReimbursementListLoading = ref(false);
const approvedReimbursementListError = ref('');
const approvedReimbursementClaims = ref([]);
const approvedReimbursementMoveTargetByClaimId = ref({});
const movingReimbursementClaimId = ref(null);

const approvedHolidayBonusListLoading = ref(false);
const approvedHolidayBonusListError = ref('');
const approvedHolidayBonusClaims = ref([]);
const unapprovingHolidayBonusClaimId = ref(null);

const approvedTimeClaimsLoading = ref(false);
const approvedTimeClaimsAmount = ref(0);
const approvedTimeListLoading = ref(false);
const approvedTimeListError = ref('');
const approvedTimeClaims = ref([]);
const approvedTimeMoveTargetByClaimId = ref({});
const movingTimeClaimId = ref(null);
const timeBucketByClaimId = ref({});
const timeCreditsHoursByClaimId = ref({});
const timeAppliedAmountOverrideByClaimId = ref({});

// Manual pay lines (one-off corrections)
const manualPayLinesLoading = ref(false);
const manualPayLinesError = ref('');
const manualPayLines = ref([]);
const savingManualPayLines = ref(false);
const deletingManualPayLineId = ref(null);
const manualPayLineDraftRowSeq = ref(1);
const manualPayLineDraftRows = ref([
  { _key: manualPayLineDraftRowSeq.value++, userId: null, lineType: 'pay', category: 'indirect', ptoBucket: 'sick', creditsHours: '', label: '', amount: '' }
]);

const addManualPayLineDraftRow = () => {
  manualPayLineDraftRows.value = [
    ...(manualPayLineDraftRows.value || []),
    { _key: manualPayLineDraftRowSeq.value++, userId: null, lineType: 'pay', category: 'indirect', ptoBucket: 'sick', creditsHours: '', label: '', amount: '' }
  ];
};

const removeManualPayLineDraftRow = (idx) => {
  const rows = [...(manualPayLineDraftRows.value || [])];
  rows.splice(idx, 1);
  manualPayLineDraftRows.value = rows.length
    ? rows
    : [{ _key: manualPayLineDraftRowSeq.value++, userId: null, lineType: 'pay', category: 'indirect', ptoBucket: 'sick', creditsHours: '', label: '', amount: '' }];
};

const isValidManualPayLineDraftRow = (r) => {
  const uid = Number(r?.userId || 0);
  const lineType = String(r?.lineType || 'pay').trim().toLowerCase() === 'pto' ? 'pto' : 'pay';
  const label = String(r?.label || '').trim();
  const cat = String(r?.category || 'indirect').trim().toLowerCase();
  const amount = (r?.amount === null || r?.amount === undefined || r?.amount === '') ? null : Number(r?.amount);
  const hrsRaw = (r?.creditsHours === null || r?.creditsHours === undefined || r?.creditsHours === '') ? null : Number(r?.creditsHours);
  if (!uid || !label) return false;
  if (lineType === 'pto') {
    // PTO adjustments: creditsHours required and can be +/-.
    if (hrsRaw === null || !Number.isFinite(hrsRaw) || Math.abs(hrsRaw) < 1e-9) return false;
    return true;
  }
  if (!(cat === 'direct' || cat === 'indirect')) return false;
  if (hrsRaw !== null && (!Number.isFinite(hrsRaw) || hrsRaw < 0)) return false;
  if (!Number.isFinite(amount) || Math.abs(amount) < 1e-9) return false;
  return true;
};

const hasValidManualPayLineDraft = computed(() => (manualPayLineDraftRows.value || []).some(isValidManualPayLineDraftRow));

const loadManualPayLines = async () => {
  if (!selectedPeriodId.value) return;
  try {
    manualPayLinesLoading.value = true;
    manualPayLinesError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/manual-pay-lines`);
    manualPayLines.value = resp.data || [];
  } catch (e) {
    manualPayLinesError.value = e.response?.data?.error?.message || e.message || 'Failed to load manual pay lines';
    manualPayLines.value = [];
  } finally {
    manualPayLinesLoading.value = false;
  }
};

// Payroll To-Dos (blocking)
const payrollTodosLoading = ref(false);
const payrollTodosError = ref('');
const payrollTodos = ref([]);
const updatingPayrollTodoId = ref(null);
const editingPeriodTodoId = ref(null);
const savingPeriodTodoEdits = ref(false);
const editPeriodTodoDraft = ref({ title: '', description: '', scope: 'agency', targetUserId: null });
const editPeriodTodoDraftBefore = ref({ title: '', description: '', scope: 'agency', targetUserId: null });

const beginEditPeriodTodo = (t) => {
  if (!t?.id) return;
  editingPeriodTodoId.value = t.id;
  editPeriodTodoDraft.value = {
    title: String(t.title || ''),
    description: String(t.description || ''),
    scope: String(t.scope || 'agency') === 'provider' ? 'provider' : 'agency',
    targetUserId: Number(t.target_user_id || 0) || null
  };
  editPeriodTodoDraftBefore.value = { ...editPeriodTodoDraft.value };
};

const cancelEditPeriodTodo = () => {
  editPeriodTodoDraft.value = { ...editPeriodTodoDraftBefore.value };
  editingPeriodTodoId.value = null;
};

const savePeriodTodoEdits = async () => {
  if (!selectedPeriodId.value || !editingPeriodTodoId.value) return;
  const todoId = editingPeriodTodoId.value;
  const title = String(editPeriodTodoDraft.value?.title || '').trim();
  const description = String(editPeriodTodoDraft.value?.description || '').trim();
  const scope = String(editPeriodTodoDraft.value?.scope || 'agency') === 'provider' ? 'provider' : 'agency';
  const targetUserId = Number(editPeriodTodoDraft.value?.targetUserId || 0);
  if (!title) return;
  if (scope === 'provider' && !(targetUserId > 0)) return;
  try {
    savingPeriodTodoEdits.value = true;
    payrollTodosError.value = '';
    await api.patch(`/payroll/periods/${selectedPeriodId.value}/todos/${todoId}`, {
      title,
      description: description || null,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0
    });
    editingPeriodTodoId.value = null;
    await loadPayrollTodos();
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to update To‑Do';
  } finally {
    savingPeriodTodoEdits.value = false;
  }
};

const deletePeriodTodo = async (t) => {
  if (!selectedPeriodId.value || !t?.id) return;
  if (t.template_id) {
    alert('This To‑Do comes from a recurring template. Edit or delete the template instead.');
    return;
  }
  const ok = window.confirm('Delete this To‑Do for this pay period?');
  if (!ok) return;
  try {
    updatingPayrollTodoId.value = t.id;
    payrollTodosError.value = '';
    await api.delete(`/payroll/periods/${selectedPeriodId.value}/todos/${t.id}`);
    await loadPayrollTodos();
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to delete To‑Do';
  } finally {
    updatingPayrollTodoId.value = null;
  }
};

const loadPayrollTodos = async () => {
  if (!selectedPeriodId.value) return;
  try {
    payrollTodosLoading.value = true;
    payrollTodosError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/todos`);
    payrollTodos.value = resp.data || [];
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to load payroll To-Dos';
    payrollTodos.value = [];
  } finally {
    payrollTodosLoading.value = false;
  }
};

const togglePayrollTodoDone = async (t, done) => {
  if (!selectedPeriodId.value || !t?.id) return;
  try {
    updatingPayrollTodoId.value = t.id;
    payrollTodosError.value = '';
    await api.patch(`/payroll/periods/${selectedPeriodId.value}/todos/${t.id}`, { status: done ? 'done' : 'pending' });
    await loadPayrollTodos();
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to update To-Do';
  } finally {
    updatingPayrollTodoId.value = null;
  }
};

// To-Do modal: templates + ad-hoc
const todoTab = ref('period'); // period | templates
const todoTemplatesLoading = ref(false);
const todoTemplatesError = ref('');
const todoTemplates = ref([]);
const savingTodoTemplate = ref(false);
const deletingTodoTemplateId = ref(null);

const editTodoTemplateOpen = ref(false);
const editTodoTemplateError = ref('');
const savingEditTodoTemplate = ref(false);
const editTodoTemplateId = ref(null);
const editTodoTemplateDraft = ref({ scope: 'agency', targetUserId: null, startPayrollPeriodId: null, title: '', description: '', isActive: true });

const openEditTodoTemplate = (t) => {
  if (!t?.id) return;
  editTodoTemplateError.value = '';
  editTodoTemplateOpen.value = true;
  editTodoTemplateId.value = t.id;
  editTodoTemplateDraft.value = {
    scope: String(t.scope || 'agency') === 'provider' ? 'provider' : 'agency',
    targetUserId: Number(t.target_user_id || 0) || null,
    startPayrollPeriodId: Number(t.start_payroll_period_id || 0) > 0 ? Number(t.start_payroll_period_id) : null,
    title: String(t.title || ''),
    description: String(t.description || ''),
    isActive: Number(t.is_active) === 1
  };
};

const closeEditTodoTemplate = () => {
  editTodoTemplateOpen.value = false;
  editTodoTemplateId.value = null;
  editTodoTemplateError.value = '';
};

const saveEditTodoTemplate = async () => {
  if (!agencyId.value || !editTodoTemplateId.value) return;
  const id = editTodoTemplateId.value;
  const title = String(editTodoTemplateDraft.value?.title || '').trim();
  const description = String(editTodoTemplateDraft.value?.description || '').trim();
  const scope = String(editTodoTemplateDraft.value?.scope || 'agency') === 'provider' ? 'provider' : 'agency';
  const targetUserId = Number(editTodoTemplateDraft.value?.targetUserId || 0);
  const startPayrollPeriodIdRaw = editTodoTemplateDraft.value?.startPayrollPeriodId;
  const startPayrollPeriodId = startPayrollPeriodIdRaw ? Number(startPayrollPeriodIdRaw) : null;
  const isActive = !!editTodoTemplateDraft.value?.isActive;
  if (!title) return;
  if (scope === 'provider' && !(targetUserId > 0)) return;
  try {
    savingEditTodoTemplate.value = true;
    editTodoTemplateError.value = '';
    await api.patch(`/payroll/todo-templates/${id}`, {
      agencyId: agencyId.value,
      title,
      description: description || null,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0,
      startPayrollPeriodId: startPayrollPeriodId || null,
      isActive
    });
    await loadTodoTemplates();
    closeEditTodoTemplate();
  } catch (e) {
    editTodoTemplateError.value = e.response?.data?.error?.message || e.message || 'Failed to update template';
  } finally {
    savingEditTodoTemplate.value = false;
  }
};

const newTodoDraft = ref({ scope: 'agency', targetUserId: null, title: '', description: '' });
const templateDraft = ref({ scope: 'agency', targetUserId: null, startPayrollPeriodId: null, title: '', description: '', isActive: true });

const loadTodoTemplates = async () => {
  if (!agencyId.value) return;
  try {
    todoTemplatesLoading.value = true;
    todoTemplatesError.value = '';
    const resp = await api.get('/payroll/todo-templates', { params: { agencyId: agencyId.value } });
    todoTemplates.value = resp.data || [];
  } catch (e) {
    todoTemplatesError.value = e.response?.data?.error?.message || e.message || 'Failed to load recurring To-Do templates';
    todoTemplates.value = [];
  } finally {
    todoTemplatesLoading.value = false;
  }
};

const createTodoForPeriod = async () => {
  if (!selectedPeriodId.value) return;
  const title = String(newTodoDraft.value?.title || '').trim();
  const description = String(newTodoDraft.value?.description || '').trim();
  const scope = String(newTodoDraft.value?.scope || 'agency') === 'provider' ? 'provider' : 'agency';
  const targetUserId = Number(newTodoDraft.value?.targetUserId || 0);
  if (!title) return;
  if (scope === 'provider' && !(targetUserId > 0)) return;
  try {
    payrollTodosError.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/todos`, {
      title,
      description: description || null,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0
    });
    newTodoDraft.value = { scope: 'agency', targetUserId: null, title: '', description: '' };
    await loadPayrollTodos();
  } catch (e) {
    payrollTodosError.value = e.response?.data?.error?.message || e.message || 'Failed to create To-Do';
  }
};

const createTodoTemplate = async () => {
  if (!agencyId.value) return;
  const title = String(templateDraft.value?.title || '').trim();
  const description = String(templateDraft.value?.description || '').trim();
  const scope = String(templateDraft.value?.scope || 'agency') === 'provider' ? 'provider' : 'agency';
  const targetUserId = Number(templateDraft.value?.targetUserId || 0);
  const startPayrollPeriodIdRaw = templateDraft.value?.startPayrollPeriodId;
  const startPayrollPeriodId = startPayrollPeriodIdRaw ? Number(startPayrollPeriodIdRaw) : null;
  const isActive = templateDraft.value?.isActive ? true : false;
  if (!title) return;
  if (scope === 'provider' && !(targetUserId > 0)) return;
  try {
    savingTodoTemplate.value = true;
    todoTemplatesError.value = '';
    await api.post('/payroll/todo-templates', {
      agencyId: agencyId.value,
      title,
      description: description || null,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0,
      startPayrollPeriodId: startPayrollPeriodId || null,
      isActive
    });
    templateDraft.value = { scope: 'agency', targetUserId: null, startPayrollPeriodId: null, title: '', description: '', isActive: true };
    await loadTodoTemplates();
  } catch (e) {
    todoTemplatesError.value = e.response?.data?.error?.message || e.message || 'Failed to create recurring To-Do template';
  } finally {
    savingTodoTemplate.value = false;
  }
};

const toggleTodoTemplateActive = async (tpl, nextActive) => {
  if (!tpl?.id || !agencyId.value) return;
  try {
    deletingTodoTemplateId.value = tpl.id;
    await api.patch(`/payroll/todo-templates/${tpl.id}`, { agencyId: agencyId.value, ...tpl, isActive: !!nextActive, targetUserId: tpl.target_user_id, startPayrollPeriodId: tpl.start_payroll_period_id });
    await loadTodoTemplates();
  } catch (e) {
    todoTemplatesError.value = e.response?.data?.error?.message || e.message || 'Failed to update template';
  } finally {
    deletingTodoTemplateId.value = null;
  }
};

const deleteTodoTemplate = async (tpl) => {
  if (!tpl?.id || !agencyId.value) return;
  const ok = window.confirm('Delete this recurring To-Do template? (Existing pay period To-Dos will remain.)');
  if (!ok) return;
  try {
    deletingTodoTemplateId.value = tpl.id;
    await api.delete(`/payroll/todo-templates/${tpl.id}`, { params: { agencyId: agencyId.value } });
    await loadTodoTemplates();
  } catch (e) {
    todoTemplatesError.value = e.response?.data?.error?.message || e.message || 'Failed to delete template';
  } finally {
    deletingTodoTemplateId.value = null;
  }
};

const openTodoModal = async () => {
  if (!selectedPeriodId.value) return;
  showTodoModal.value = true;
  todoTab.value = 'period';
  await loadPayrollTodos();
  await loadTodoTemplates();
};

// ==========================
// Payroll Wizard (step-by-step)
// ==========================

const wizardLoading = ref(false);
const wizardError = ref('');
const wizardSaving = ref(false);
const wizardStepIdx = ref(0);
const wizardState = ref(null); // { stepIdx, priorPeriodId, completed?: any }

const wizardSteps = computed(() => {
  // Always show; if this is the first payroll, we skip the prior-payroll step.
  const hasAnyPosted = (periods.value || []).some((p) => ['posted', 'finalized'].includes(String(p?.status || '').toLowerCase()));
  const steps = [];
  if (hasAnyPosted) {
    steps.push({ key: 'prior', title: 'Post prior period (process changes)' });
  }
  steps.push(
    { key: 'apply', title: 'Post differences to current payroll' },
    { key: 'review', title: 'Review differences' },
    { key: 'drafts', title: 'Raw import: Draft audit' },
    { key: 'h0031', title: 'Process H0031' },
    { key: 'h0032', title: 'Process H0032' },
    { key: 'stage', title: 'Payroll Stage' },
    { key: 'run', title: 'Run payroll' },
    { key: 'preview', title: 'Preview post' },
    { key: 'post', title: 'Post payroll' }
  );
  return steps;
});

const wizardStep = computed(() => wizardSteps.value[wizardStepIdx.value] || wizardSteps.value[0] || null);

const loadPayrollWizardProgress = async () => {
  if (!selectedPeriodId.value) return;
  try {
    wizardLoading.value = true;
    wizardError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/wizard-progress`);
    const state = resp.data?.state || null;
    wizardState.value = state && typeof state === 'object' ? state : null;
    let idx = Number(wizardState.value?.stepIdx || 0);
    const key = String(wizardState.value?.stepKey || '').trim();
    if (key) {
      const byKey = wizardSteps.value.findIndex((s) => s?.key === key);
      if (byKey >= 0) idx = byKey;
    }
    wizardStepIdx.value = Number.isFinite(idx) && idx >= 0 ? Math.min(idx, Math.max(0, wizardSteps.value.length - 1)) : 0;
  } catch (e) {
    wizardError.value = e.response?.data?.error?.message || e.message || 'Failed to load wizard progress';
    wizardState.value = null;
    wizardStepIdx.value = 0;
  } finally {
    wizardLoading.value = false;
  }
};

const processChangesCard = ref(null);
const wizardGoToProcessChanges = async () => {
  // Wizard is a modal; close it then scroll to the Process Changes section.
  showPayrollWizardModal.value = false;
  await nextTick();
  try {
    processChangesCard.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  } catch {
    // ignore
  }
};

const savePayrollWizardProgress = async () => {
  if (!selectedPeriodId.value) return;
  try {
    wizardSaving.value = true;
    const state = {
      ...(wizardState.value && typeof wizardState.value === 'object' ? wizardState.value : {}),
      stepIdx: wizardStepIdx.value,
      stepKey: wizardStep.value?.key || null,
      updatedAt: new Date().toISOString()
    };
    const resp = await api.put(`/payroll/periods/${selectedPeriodId.value}/wizard-progress`, { state });
    wizardState.value = resp.data?.state || state;
  } finally {
    wizardSaving.value = false;
  }
};

const openPayrollWizard = async () => {
  if (!selectedPeriodId.value) return;
  showPayrollWizardModal.value = true;
  await loadPayrollWizardProgress();
  // Always start the wizard at the beginning (Process Changes). This avoids reopening at the end
  // due to saved stepIdx from a prior run of the wizard.
  wizardStepIdx.value = 0;
  try {
    await savePayrollWizardProgress();
  } catch {
    // best-effort; don't block opening the wizard if progress save fails
  }
};

const wizardNext = async () => {
  if (!wizardSteps.value.length) return;
  await savePayrollWizardProgress();
  wizardStepIdx.value = Math.min(wizardStepIdx.value + 1, wizardSteps.value.length - 1);
  await savePayrollWizardProgress();
};

const wizardBack = async () => {
  if (!wizardSteps.value.length) return;
  await savePayrollWizardProgress();
  wizardStepIdx.value = Math.max(0, wizardStepIdx.value - 1);
  await savePayrollWizardProgress();
};

const wizardSaveAndExit = async () => {
  await savePayrollWizardProgress();
  showPayrollWizardModal.value = false;
};

const wizardDiscardAndExit = async () => {
  if (!selectedPeriodId.value) {
    showPayrollWizardModal.value = false;
    return;
  }
  // Best-effort: overwrite with empty progress so reopening starts fresh.
  try {
    await api.put(`/payroll/periods/${selectedPeriodId.value}/wizard-progress`, { state: {} });
  } catch {
    // ignore
  }
  wizardState.value = null;
  wizardStepIdx.value = 0;
  showPayrollWizardModal.value = false;
};

const wizardOpenRawMode = async (mode) => {
  rawMode.value = mode;
  showRawModal.value = true;
};


const saveManualPayLines = async () => {
  if (!selectedPeriodId.value) return;
  try {
    savingManualPayLines.value = true;
    manualPayLinesError.value = '';
    const rows = [...(manualPayLineDraftRows.value || [])];
    const kept = [];
    for (const r of rows) {
      if (!isValidManualPayLineDraftRow(r)) {
        kept.push(r);
        continue;
      }
      const uid = Number(r.userId || 0);
      const lineType = String(r?.lineType || 'pay').trim().toLowerCase() === 'pto' ? 'pto' : 'pay';
      const category = String(r.category || 'indirect').trim().toLowerCase();
      const ptoBucket = String(r?.ptoBucket || 'sick').trim().toLowerCase() === 'training' ? 'training' : 'sick';
      const creditsHours = (r?.creditsHours === null || r?.creditsHours === undefined || r?.creditsHours === '') ? null : Number(r?.creditsHours);
      const label = String(r.label || '').trim();
      const amount = lineType === 'pto' ? 0 : Number(r.amount);
      await api.post(`/payroll/periods/${selectedPeriodId.value}/manual-pay-lines`, { userId: uid, lineType, ptoBucket, category, creditsHours, label, amount });
    }
    manualPayLineDraftRows.value = kept.length
      ? kept
      : [{ _key: manualPayLineDraftRowSeq.value++, userId: null, lineType: 'pay', category: 'indirect', ptoBucket: 'sick', creditsHours: '', label: '', amount: '' }];
    await loadManualPayLines();
    await loadPeriodDetails();
  } catch (e) {
    manualPayLinesError.value = e.response?.data?.error?.message || e.message || 'Failed to add manual pay line';
  } finally {
    savingManualPayLines.value = false;
  }
};

const deleteManualPayLine = async (line) => {
  if (!selectedPeriodId.value || !line?.id) return;
  const ok = window.confirm('Delete this manual pay line?');
  if (!ok) return;
  try {
    deletingManualPayLineId.value = line.id;
    manualPayLinesError.value = '';
    await api.delete(`/payroll/periods/${selectedPeriodId.value}/manual-pay-lines/${line.id}`);
    await loadManualPayLines();
    await loadPeriodDetails();
  } catch (e) {
    manualPayLinesError.value = e.response?.data?.error?.message || e.message || 'Failed to delete manual pay line';
  } finally {
    deletingManualPayLineId.value = null;
  }
};

const receiptUrl = (c) => {
  const raw = String(c?.receipt_file_path || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/uploads/${raw.substring('uploads/'.length)}`;
  // Legacy: some rows stored only the basename (no folder prefix)
  if (raw.startsWith('reimbursement-')) return `/uploads/reimbursements/${raw}`;
  if (raw.startsWith('company-card-expense-')) return `/uploads/company_card_expenses/${raw}`;
  return `/uploads/${raw}`;
};

const onSupervisionCsvPick = (e) => {
  const file = e?.target?.files?.[0] || null;
  supervisionCsvFile.value = file;
  supervisionCsvName.value = file?.name || '';
};

const uploadSupervisionCsv = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  if (!supervisionCsvFile.value) return;
  try {
    supervisionImporting.value = true;
    supervisionImportError.value = '';
    supervisionImportResult.value = null;
    const fd = new FormData();
    fd.append('file', supervisionCsvFile.value);
    const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/supervision/import`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    supervisionImportResult.value = resp.data || null;
  } catch (e) {
    supervisionImportError.value = e.response?.data?.error?.message || e.message || 'Failed to import supervision CSV';
  } finally {
    supervisionImporting.value = false;
  }
};

const splitSummary = (c) => {
  const raw = String(c?.splits_json || '').trim();
  if (!raw) return '';
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return '';
    return arr
      .map((s) => {
        const cat = String(s?.category || '').trim();
        const amt = Number(s?.amount || 0);
        if (!cat || !(amt > 0)) return null;
        return `${cat} ${fmtMoney(amt)}`;
      })
      .filter(Boolean)
      .join(', ');
  } catch {
    return '';
  }
};

const timeTypeLabel = (c) => {
  const t = String(c?.claim_type || '').toLowerCase();
  if (t === 'meeting_training') return 'Meeting/Training';
  if (t === 'excess_holiday') return 'Excess/Holiday';
  if (t === 'service_correction') return 'Service correction';
  if (t === 'overtime_evaluation') return 'Overtime eval';
  return t || 'Time';
};

const loadApprovedHolidayBonusClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedHolidayBonusListLoading.value = true;
    approvedHolidayBonusListError.value = '';
    const resp = await api.get('/payroll/holiday-bonus-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        payrollPeriodId: selectedPeriodId.value
      }
    });
    approvedHolidayBonusClaims.value = resp.data || [];
  } catch (e) {
    approvedHolidayBonusListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved holiday bonuses';
    approvedHolidayBonusClaims.value = [];
  } finally {
    approvedHolidayBonusListLoading.value = false;
  }
};

const loadApprovedMileageClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedMileageListLoading.value = true;
    approvedMileageListError.value = '';
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: selectedPeriodId.value
      }
    });
    approvedMileageClaims.value = resp.data || [];
    const next = { ...(approvedMileageMoveTargetByClaimId.value || {}) };
    for (const c of approvedMileageClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.target_payroll_period_id || selectedPeriodId.value;
    }
    approvedMileageMoveTargetByClaimId.value = next;
  } catch (e) {
    approvedMileageListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved mileage claims';
    approvedMileageClaims.value = [];
  } finally {
    approvedMileageListLoading.value = false;
  }
};

const unapproveMileageClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this mileage claim? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    movingMileageClaimId.value = c.id;
    approvedMileageListError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedMileageClaimsList();
    await reloadPendingMileageClaims();
  } catch (e) {
    approvedMileageListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove mileage claim';
  } finally {
    movingMileageClaimId.value = null;
  }
};

const moveApprovedMileageClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(approvedMileageMoveTargetByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  if (isTargetPeriodLocked(targetPayrollPeriodId)) {
    approvedMileageListError.value = 'Target pay period is locked (posted/finalized).';
    return;
  }
  const ok = window.confirm('Move this approved claim to the selected pay period?');
  if (!ok) return;
  try {
    movingMileageClaimId.value = c.id;
    approvedMileageListError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'move', targetPayrollPeriodId });
    await loadApprovedMileageClaimsList();
    await loadApprovedMileageClaimsAmount();
  } catch (e) {
    approvedMileageListError.value = e.response?.data?.error?.message || e.message || 'Failed to move mileage claim';
  } finally {
    movingMileageClaimId.value = null;
  }
};

const loadApprovedMedcancelClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedMedcancelListLoading.value = true;
    approvedMedcancelListError.value = '';
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: selectedPeriodId.value
      }
    });
    approvedMedcancelClaims.value = resp.data || [];
  } catch (e) {
    approvedMedcancelListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved Med Cancel claims';
    approvedMedcancelClaims.value = [];
  } finally {
    approvedMedcancelListLoading.value = false;
  }
};

const unapproveMedcancelClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this Med Cancel claim? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    unapprovingMedcancelClaimId.value = c.id;
    approvedMedcancelListError.value = '';
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedMedcancelClaimsList();
    await reloadPendingMedcancelClaims();
    await loadPeriodDetails();
    await loadApprovedMedcancelClaimsAmount();
  } catch (e) {
    approvedMedcancelListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove Med Cancel claim';
  } finally {
    unapprovingMedcancelClaimId.value = null;
  }
};

const loadApprovedReimbursementClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedReimbursementListLoading.value = true;
    approvedReimbursementListError.value = '';
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: selectedPeriodId.value
      }
    });
    approvedReimbursementClaims.value = resp.data || [];
    const next = { ...(approvedReimbursementMoveTargetByClaimId.value || {}) };
    for (const c of approvedReimbursementClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.target_payroll_period_id || selectedPeriodId.value;
    }
    approvedReimbursementMoveTargetByClaimId.value = next;
  } catch (e) {
    approvedReimbursementListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved reimbursements';
    approvedReimbursementClaims.value = [];
  } finally {
    approvedReimbursementListLoading.value = false;
  }
};

const loadApprovedTimeClaimsList = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  try {
    approvedTimeListLoading.value = true;
    approvedTimeListError.value = '';
    const resp = await api.get('/payroll/time-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'approved',
        targetPeriodId: selectedPeriodId.value
      }
    });
    approvedTimeClaims.value = resp.data || [];
    const next = { ...(approvedTimeMoveTargetByClaimId.value || {}) };
    for (const c of approvedTimeClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.target_payroll_period_id || selectedPeriodId.value;
    }
    approvedTimeMoveTargetByClaimId.value = next;
  } catch (e) {
    approvedTimeListError.value = e.response?.data?.error?.message || e.message || 'Failed to load approved time claims';
    approvedTimeClaims.value = [];
  } finally {
    approvedTimeListLoading.value = false;
  }
};

const loadPendingReimbursementClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  pendingReimbursementMode.value = 'period';
  try {
    pendingReimbursementLoading.value = true;
    pendingReimbursementError.value = '';
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: { agencyId: agencyId.value, status: 'submitted', targetPeriodId: selectedPeriodId.value }
    });
    pendingReimbursementClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    const next = { ...(reimbursementTargetPeriodByClaimId.value || {}) };
    for (const c of pendingReimbursementClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || selectedPeriodId.value;
    }
    reimbursementTargetPeriodByClaimId.value = next;
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending reimbursements';
    pendingReimbursementClaims.value = [];
  } finally {
    pendingReimbursementLoading.value = false;
  }
};

const loadAllPendingReimbursementClaims = async () => {
  if (!agencyId.value) return;
  pendingReimbursementMode.value = 'all';
  try {
    pendingReimbursementLoading.value = true;
    pendingReimbursementError.value = '';
    const resp = await api.get('/payroll/reimbursement-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingReimbursementClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    const next = { ...(reimbursementTargetPeriodByClaimId.value || {}) };
    for (const c of pendingReimbursementClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.suggested_payroll_period_id || selectedPeriodId.value;
    }
    reimbursementTargetPeriodByClaimId.value = next;
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending reimbursements';
    pendingReimbursementClaims.value = [];
  } finally {
    pendingReimbursementLoading.value = false;
  }
};

const reloadPendingReimbursementClaims = async () => {
  if (pendingReimbursementMode.value === 'all') return await loadAllPendingReimbursementClaims();
  return await loadPendingReimbursementClaims();
};

const loadPendingTimeClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  pendingTimeMode.value = 'period';
  try {
    pendingTimeLoading.value = true;
    pendingTimeError.value = '';
    const resp = await api.get('/payroll/time-claims', {
      params: { agencyId: agencyId.value, status: 'submitted', targetPeriodId: selectedPeriodId.value }
    });
    pendingTimeClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    const next = { ...(timeTargetPeriodByClaimId.value || {}) };
    const bNext = { ...(timeBucketByClaimId.value || {}) };
    const hNext = { ...(timeCreditsHoursByClaimId.value || {}) };
    const aNext = { ...(timeAppliedAmountOverrideByClaimId.value || {}) };
    for (const c of pendingTimeClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || selectedPeriodId.value;
      bNext[c.id] = bNext[c.id] || 'indirect';
      if (hNext[c.id] === undefined) hNext[c.id] = '';
      if (aNext[c.id] === undefined) aNext[c.id] = '';
    }
    timeTargetPeriodByClaimId.value = next;
    timeBucketByClaimId.value = bNext;
    timeCreditsHoursByClaimId.value = hNext;
    timeAppliedAmountOverrideByClaimId.value = aNext;
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending time claims';
    pendingTimeClaims.value = [];
  } finally {
    pendingTimeLoading.value = false;
  }
};

const loadAllPendingTimeClaims = async () => {
  if (!agencyId.value) return;
  pendingTimeMode.value = 'all';
  try {
    pendingTimeLoading.value = true;
    pendingTimeError.value = '';
    const resp = await api.get('/payroll/time-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingTimeClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    const next = { ...(timeTargetPeriodByClaimId.value || {}) };
    const bNext = { ...(timeBucketByClaimId.value || {}) };
    const hNext = { ...(timeCreditsHoursByClaimId.value || {}) };
    const aNext = { ...(timeAppliedAmountOverrideByClaimId.value || {}) };
    for (const c of pendingTimeClaims.value || []) {
      if (!c?.id) continue;
      next[c.id] = next[c.id] || c.suggested_payroll_period_id || selectedPeriodId.value;
      bNext[c.id] = bNext[c.id] || 'indirect';
      if (hNext[c.id] === undefined) hNext[c.id] = '';
      if (aNext[c.id] === undefined) aNext[c.id] = '';
    }
    timeTargetPeriodByClaimId.value = next;
    timeBucketByClaimId.value = bNext;
    timeCreditsHoursByClaimId.value = hNext;
    timeAppliedAmountOverrideByClaimId.value = aNext;
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending time claims';
    pendingTimeClaims.value = [];
  } finally {
    pendingTimeLoading.value = false;
  }
};

const reloadPendingTimeClaims = async () => {
  if (pendingTimeMode.value === 'all') return await loadAllPendingTimeClaims();
  return await loadPendingTimeClaims();
};

const loadPendingHolidayBonusClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  pendingHolidayBonusMode.value = 'period';
  try {
    pendingHolidayBonusLoading.value = true;
    pendingHolidayBonusError.value = '';
    const resp = await api.get('/payroll/holiday-bonus-claims', {
      params: { agencyId: agencyId.value, status: 'submitted', payrollPeriodId: selectedPeriodId.value }
    });
    pendingHolidayBonusClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    pendingHolidayBonusError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending holiday bonuses';
    pendingHolidayBonusClaims.value = [];
  } finally {
    pendingHolidayBonusLoading.value = false;
  }
};

const loadAllPendingHolidayBonusClaims = async () => {
  if (!agencyId.value) return;
  pendingHolidayBonusMode.value = 'all';
  try {
    pendingHolidayBonusLoading.value = true;
    pendingHolidayBonusError.value = '';
    const resp = await api.get('/payroll/holiday-bonus-claims', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingHolidayBonusClaims.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    pendingHolidayBonusError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending holiday bonuses';
    pendingHolidayBonusClaims.value = [];
  } finally {
    pendingHolidayBonusLoading.value = false;
  }
};

const reloadPendingHolidayBonusClaims = async () => {
  if (pendingHolidayBonusMode.value === 'all') return await loadAllPendingHolidayBonusClaims();
  return await loadPendingHolidayBonusClaims();
};

const approveHolidayBonusClaim = async (c) => {
  if (!c?.id) return;
  try {
    updatingHolidayBonusClaimId.value = c.id;
    pendingHolidayBonusError.value = '';
    await api.patch(`/payroll/holiday-bonus-claims/${c.id}`, { action: 'approve' });
    await reloadPendingHolidayBonusClaims();
    await loadApprovedHolidayBonusClaimsList();
    await loadApprovedHolidayBonusClaimsAmount();
    await loadPeriodDetails();
  } catch (e) {
    pendingHolidayBonusError.value = e.response?.data?.error?.message || e.message || 'Failed to approve holiday bonus';
  } finally {
    updatingHolidayBonusClaimId.value = null;
  }
};

const rejectHolidayBonusClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason || '').trim()) return;
  try {
    updatingHolidayBonusClaimId.value = c.id;
    pendingHolidayBonusError.value = '';
    await api.patch(`/payroll/holiday-bonus-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    await reloadPendingHolidayBonusClaims();
    await loadPeriodDetails();
  } catch (e) {
    pendingHolidayBonusError.value = e.response?.data?.error?.message || e.message || 'Failed to reject holiday bonus';
  } finally {
    updatingHolidayBonusClaimId.value = null;
  }
};

const unapproveHolidayBonusClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this holiday bonus? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    unapprovingHolidayBonusClaimId.value = c.id;
    approvedHolidayBonusListError.value = '';
    await api.patch(`/payroll/holiday-bonus-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedHolidayBonusClaimsList();
    await reloadPendingHolidayBonusClaims();
    await loadApprovedHolidayBonusClaimsAmount();
    await loadPeriodDetails();
  } catch (e) {
    approvedHolidayBonusListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove holiday bonus';
  } finally {
    unapprovingHolidayBonusClaimId.value = null;
  }
};

const isPtoRequestInSelectedPeriod = (r) => {
  const p = selectedPeriod.value || null;
  if (!p) return true; // if no selection, treat as visible
  const start = String(p.period_start || '').slice(0, 10);
  const end = String(p.period_end || '').slice(0, 10);
  if (!start || !end) return true;
  const items = Array.isArray(r?.items) ? r.items : [];
  return items.some((it) => {
    const d = String(it?.request_date || it?.requestDate || '').slice(0, 10);
    return d && d >= start && d <= end;
  });
};

const fetchAllPendingPtoRequests = async () => {
  if (!agencyId.value) return;
  try {
    pendingPtoLoading.value = true;
    pendingPtoError.value = '';
    const resp = await api.get('/payroll/pto-requests', {
      params: { agencyId: agencyId.value, status: 'submitted' }
    });
    pendingPtoRequests.value = (resp.data || []).filter((r) => !!r && typeof r === 'object');

    // Fetch balances for preview (starting balance / projected balance).
    const ids = Array.from(
      new Set((pendingPtoRequests.value || []).map((x) => Number(x?.user_id || 0)).filter((n) => Number.isFinite(n) && n > 0))
    );
    const next = { ...(ptoBalancesByUserId.value || {}) };
    await Promise.all(
      ids
        .filter((uid) => next[uid] === undefined)
        .map(async (uid) => {
          try {
            const b = await api.get(`/payroll/users/${uid}/pto-balances`, { params: { agencyId: agencyId.value } });
            next[uid] = {
              sickHours: Number(b.data?.balances?.sickHours ?? 0),
              trainingHours: Number(b.data?.balances?.trainingHours ?? 0)
            };
          } catch {
            next[uid] = { sickHours: 0, trainingHours: 0 };
          }
        })
    );
    ptoBalancesByUserId.value = next;
  } catch (e) {
    pendingPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending PTO requests';
    pendingPtoRequests.value = [];
  } finally {
    pendingPtoLoading.value = false;
  }
};

const loadAllPendingPtoRequests = async () => {
  pendingPtoMode.value = 'all';
  await fetchAllPendingPtoRequests();
};

const loadPendingPtoRequests = async () => {
  pendingPtoMode.value = 'period';
  await fetchAllPendingPtoRequests();
  if (!selectedPeriodId.value) return;
  pendingPtoRequests.value = (pendingPtoRequests.value || []).filter(isPtoRequestInSelectedPeriod);
};

const reloadPendingPtoRequests = async () => {
  if (pendingPtoMode.value === 'all') return await loadAllPendingPtoRequests();
  return await loadPendingPtoRequests();
};

const ptoBalancePreviewForRequest = (r) => {
  const uid = Number(r?.user_id || 0);
  const b = ptoBalancesByUserId.value?.[uid] || { sickHours: 0, trainingHours: 0 };
  const hours = Number(r?.total_hours || 0);
  const bucket = String(r?.request_type || '').toLowerCase() === 'training' ? 'training' : 'sick';
  const start = bucket === 'training' ? Number(b.trainingHours || 0) : Number(b.sickHours || 0);
  const requested = Number.isFinite(hours) ? hours : 0;
  const next = start - requested;
  return { bucket, start, requested, next };
};

const approvePtoRequest = async (r) => {
  if (!r?.id) return;
  try {
    approvingPtoRequestId.value = r.id;
    pendingPtoError.value = '';
    try {
      await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'approve' });
    } catch (e) {
      const status = e.response?.status || 0;
      const msg = e.response?.data?.error?.message || e.message || '';
      const lower = String(msg).toLowerCase();
      const looksLikeDeadline = lower.includes('deadline') || lower.includes('cutoff') || lower.includes('past the submission deadline');
      const looksLikeBalance = lower.includes('insufficient pto balance');

      if (looksLikeBalance) {
        const ok = window.confirm(
          `${msg}\n\nApprove anyway using an admin override? (This can result in a negative PTO balance.)`
        );
        if (!ok) throw e;
        await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'approve', overrideBalance: true });
      } else if ((status === 409 || status === 500) && looksLikeDeadline) {
        const ok = window.confirm(
          `${msg || 'This request was submitted after the cutoff for the intended pay period.'}\n\nApprove anyway using an admin override?`
        );
        if (!ok) throw e;
        await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'approve', overrideDeadline: true });
      } else {
        throw e;
      }
    }
    await reloadPendingPtoRequests();
    // Refresh balances for this user so previews reflect the approval.
    try {
      const uid = Number(r?.user_id || 0);
      if (uid && agencyId.value) {
        const b = await api.get(`/payroll/users/${uid}/pto-balances`, { params: { agencyId: agencyId.value } });
        ptoBalancesByUserId.value = {
          ...(ptoBalancesByUserId.value || {}),
          [uid]: {
            sickHours: Number(b.data?.balances?.sickHours ?? 0),
            trainingHours: Number(b.data?.balances?.trainingHours ?? 0)
          }
        };
      }
    } catch { /* best-effort */ }
    await loadPeriodDetails();
  } catch (e) {
    pendingPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to approve PTO request';
  } finally {
    approvingPtoRequestId.value = null;
  }
};

const rejectPtoRequest = async (r) => {
  if (!r?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingPtoRequestId.value = r.id;
    pendingPtoError.value = '';
    await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    await reloadPendingPtoRequests();
  } catch (e) {
    pendingPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to reject PTO request';
  } finally {
    approvingPtoRequestId.value = null;
  }
};

const returnPtoRequest = async (r) => {
  if (!r?.id) return;
  const reason = window.prompt('Send back note (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingPtoRequestId.value = r.id;
    pendingPtoError.value = '';
    await api.patch(`/payroll/pto-requests/${r.id}`, { action: 'return', reason: String(reason).trim() });
    await reloadPendingPtoRequests();
  } catch (e) {
    pendingPtoError.value = e.response?.data?.error?.message || e.message || 'Failed to send back PTO request';
  } finally {
    approvingPtoRequestId.value = null;
  }
};

const approveTimeClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(timeTargetPeriodByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  const bucket = String(timeBucketByClaimId.value?.[c.id] || 'indirect').trim().toLowerCase() === 'direct' ? 'direct' : 'indirect';
  const creditsRaw = timeCreditsHoursByClaimId.value?.[c.id];
  const creditsHours = (creditsRaw === null || creditsRaw === undefined || String(creditsRaw).trim() === '') ? null : Number(creditsRaw);
  if (creditsHours !== null && (!Number.isFinite(creditsHours) || creditsHours < 0)) {
    pendingTimeError.value = 'Hours/Credits must be a non-negative number (or blank).';
    return;
  }
  const overrideRaw = timeAppliedAmountOverrideByClaimId.value?.[c.id];
  const appliedAmount = (overrideRaw === null || overrideRaw === undefined || String(overrideRaw).trim() === '') ? null : Number(overrideRaw);
  if (appliedAmount !== null && (!Number.isFinite(appliedAmount) || appliedAmount < 0)) {
    pendingTimeError.value = 'Applied amount must be a non-negative number (or blank).';
    return;
  }
  try {
    approvingTimeClaimId.value = c.id;
    pendingTimeError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, {
      action: 'approve',
      targetPayrollPeriodId,
      bucket,
      creditsHours,
      appliedAmount
    });
    await reloadPendingTimeClaims();
    await loadApprovedTimeClaimsList();
    await loadApprovedTimeClaimsAmount();
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to approve time claim';
  } finally {
    approvingTimeClaimId.value = null;
  }
};

const rejectTimeClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingTimeClaimId.value = c.id;
    pendingTimeError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    await reloadPendingTimeClaims();
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to reject time claim';
  } finally {
    approvingTimeClaimId.value = null;
  }
};

const returnTimeClaim = async (c) => {
  if (!c?.id) return;
  const note = window.prompt('Send back note (required):', '') || '';
  if (!String(note).trim()) return;
  try {
    approvingTimeClaimId.value = c.id;
    pendingTimeError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, { action: 'return', note: String(note).trim() });
    await reloadPendingTimeClaims();
    await loadApprovedTimeClaimsList();
    await loadApprovedTimeClaimsAmount();
  } catch (e) {
    pendingTimeError.value = e.response?.data?.error?.message || e.message || 'Failed to send back time claim';
  } finally {
    approvingTimeClaimId.value = null;
  }
};

const unapproveTimeClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this time claim? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    movingTimeClaimId.value = c.id;
    approvedTimeListError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedTimeClaimsList();
    await reloadPendingTimeClaims();
    await loadApprovedTimeClaimsAmount();
  } catch (e) {
    approvedTimeListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove time claim';
  } finally {
    movingTimeClaimId.value = null;
  }
};

const moveApprovedTimeClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(approvedTimeMoveTargetByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  if (isTargetPeriodLocked(targetPayrollPeriodId)) {
    approvedTimeListError.value = 'Target pay period is locked (posted/finalized).';
    return;
  }
  const ok = window.confirm('Move this approved time claim to the selected pay period?');
  if (!ok) return;
  try {
    movingTimeClaimId.value = c.id;
    approvedTimeListError.value = '';
    await api.patch(`/payroll/time-claims/${c.id}`, { action: 'move', targetPayrollPeriodId });
    await loadApprovedTimeClaimsList();
    await loadApprovedTimeClaimsAmount();
  } catch (e) {
    approvedTimeListError.value = e.response?.data?.error?.message || e.message || 'Failed to move time claim';
  } finally {
    movingTimeClaimId.value = null;
  }
};
const approveReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(reimbursementTargetPeriodByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  try {
    approvingReimbursementClaimId.value = c.id;
    pendingReimbursementError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId });
    await reloadPendingReimbursementClaims();
    await loadApprovedReimbursementClaimsList();
    await loadApprovedReimbursementClaimsAmount();
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to approve reimbursement';
  } finally {
    approvingReimbursementClaimId.value = null;
  }
};

const rejectReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingReimbursementClaimId.value = c.id;
    pendingReimbursementError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'reject', rejectionReason: String(reason).trim() });
    await reloadPendingReimbursementClaims();
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to reject reimbursement';
  } finally {
    approvingReimbursementClaimId.value = null;
  }
};

const returnReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const note = window.prompt('Send back note (required):', '') || '';
  if (!String(note).trim()) return;
  try {
    approvingReimbursementClaimId.value = c.id;
    pendingReimbursementError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'return', note: String(note).trim() });
    await reloadPendingReimbursementClaims();
    await loadApprovedReimbursementClaimsList();
    await loadApprovedReimbursementClaimsAmount();
  } catch (e) {
    pendingReimbursementError.value = e.response?.data?.error?.message || e.message || 'Failed to send back reimbursement';
  } finally {
    approvingReimbursementClaimId.value = null;
  }
};

const unapproveReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const ok = window.confirm('Unapprove this reimbursement? It will return to Pending for re-approval.');
  if (!ok) return;
  try {
    movingReimbursementClaimId.value = c.id;
    approvedReimbursementListError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'unapprove' });
    await loadApprovedReimbursementClaimsList();
    await reloadPendingReimbursementClaims();
    await loadApprovedReimbursementClaimsAmount();
  } catch (e) {
    approvedReimbursementListError.value = e.response?.data?.error?.message || e.message || 'Failed to unapprove reimbursement';
  } finally {
    movingReimbursementClaimId.value = null;
  }
};

const moveApprovedReimbursementClaim = async (c) => {
  if (!c?.id) return;
  const targetPayrollPeriodId = Number(approvedReimbursementMoveTargetByClaimId.value?.[c.id] || 0);
  if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) return;
  if (isTargetPeriodLocked(targetPayrollPeriodId)) {
    approvedReimbursementListError.value = 'Target pay period is locked (posted/finalized).';
    return;
  }
  const ok = window.confirm('Move this approved reimbursement to the selected pay period?');
  if (!ok) return;
  try {
    movingReimbursementClaimId.value = c.id;
    approvedReimbursementListError.value = '';
    await api.patch(`/payroll/reimbursement-claims/${c.id}`, { action: 'move', targetPayrollPeriodId });
    await loadApprovedReimbursementClaimsList();
    await loadApprovedReimbursementClaimsAmount();
  } catch (e) {
    approvedReimbursementListError.value = e.response?.data?.error?.message || e.message || 'Failed to move reimbursement';
  } finally {
    movingReimbursementClaimId.value = null;
  }
};
const adjustmentsLoading = ref(false);
const adjustmentsError = ref('');
const savingAdjustments = ref(false);

const rateCard = ref({
  directRate: 0,
  indirectRate: 0,
  otherRate1: 0,
  otherRate2: 0,
  otherRate3: 0
});
const rateCardLoading = ref(false);
const rateCardError = ref('');
const savingRateCard = ref(false);

const stagingKey = (r) => `${r.userId}:${r.serviceCode}`;
const normalizeServiceCodeKey = (v) => String(v || '').trim().toUpperCase();
const stageKeyNormalized = (userId, serviceCode) => `${Number(userId)}:${normalizeServiceCodeKey(serviceCode)}`;

const ruleByCode = computed(() => {
  const m = new Map();
  for (const r of serviceCodeRules.value || []) {
    const k = String(r?.service_code || '').trim().toUpperCase();
    if (k) m.set(k, r);
  }
  return m;
});

const getRuleForCode = (serviceCode) => {
  const k = String(serviceCode || '').trim().toUpperCase();
  return ruleByCode.value.get(k) || null;
};

const payDivisorForRow = (r) => {
  const rule = getRuleForCode(r?.serviceCode);
  const d = Number(rule?.pay_divisor ?? 1);
  return Number.isFinite(d) && d > 0 ? d : 1;
};

const creditValueForRow = (r) => {
  const rule = getRuleForCode(r?.serviceCode);
  const cv = Number(rule?.credit_value ?? 0);
  return Number.isFinite(cv) && cv >= 0 ? cv : 0;
};

const payHoursForRow = (r) => {
  const d = payDivisorForRow(r);
  const effFinal = Number(stagingEdits.value?.[stagingKey(r)]?.finalizedUnits || 0) + Number(r?.carryover?.oldDoneNotesUnits || 0);
  return d > 0 ? (effFinal / d) : 0;
};

const creditsHoursForRow = (r) => {
  const cv = creditValueForRow(r);
  const effFinal = Number(stagingEdits.value?.[stagingKey(r)]?.finalizedUnits || 0) + Number(r?.carryover?.oldDoneNotesUnits || 0);
  return effFinal * cv;
};

const workspaceMatchedRows = computed(() => {
  let rows = (stagingMatched.value || []).slice();

  if (selectedUserId.value) {
    rows = rows.filter((r) => r.userId === selectedUserId.value);
  }

  const q = String(workspaceSearch.value || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const provider = `${r.firstName || ''} ${r.lastName || ''}`.trim().toLowerCase();
      const providerAlt = String(r.providerName || '').toLowerCase();
      const code = String(r.serviceCode || '').toLowerCase();
      return provider.includes(q) || providerAlt.includes(q) || code.includes(q);
    });
  }

  rows.sort((a, b) => {
    const aLast = String(a.lastName || '').toLowerCase();
    const bLast = String(b.lastName || '').toLowerCase();
    if (aLast && bLast && aLast !== bLast) return aLast.localeCompare(bLast);
    const aFirst = String(a.firstName || '').toLowerCase();
    const bFirst = String(b.firstName || '').toLowerCase();
    if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
    return String(a.serviceCode || '').localeCompare(String(b.serviceCode || ''), undefined, { sensitivity: 'base' });
  });

  return rows;
});

const carryoverPriorStillUnpaidPeriodLabel = computed(() => {
  const priorId = carryoverPriorStillUnpaidMeta.value?.priorPeriodId || carryoverPriorPeriodId.value || null;
  if (!priorId) return '';
  const p = (periods.value || []).find((x) => Number(x.id) === Number(priorId)) || null;
  return p ? periodRangeLabel(p) : `Pay period #${priorId}`;
});

const priorStillUnpaidUnitsByStageKey = computed(() => {
  // Guard against showing stale comparison results when switching pay periods.
  if (
    carryoverPriorStillUnpaidMeta.value?.currentPeriodId &&
    Number(carryoverPriorStillUnpaidMeta.value.currentPeriodId) !== Number(selectedPeriodId.value)
  ) {
    return {};
  }
  const m = {};
  for (const r of carryoverPriorStillUnpaid.value || []) {
    if (!r?.userId || !r?.serviceCode) continue;
    const k = stageKeyNormalized(r.userId, r.serviceCode);
    const v = Number(r.stillUnpaidUnits || 0);
    if (Number.isFinite(v) && v > 0) m[k] = v;
  }
  return m;
});

const priorStillUnpaidOrphanRowsForStage = computed(() => {
  // Orphans = still unpaid rows from prior period that do NOT have a matching row
  // in the current staging table (so they can’t be displayed inline).
  if (
    carryoverPriorStillUnpaidMeta.value?.currentPeriodId &&
    Number(carryoverPriorStillUnpaidMeta.value.currentPeriodId) !== Number(selectedPeriodId.value)
  ) {
    return [];
  }

  const stagingKeys = new Set(
    (stagingMatched.value || []).map((r) => stageKeyNormalized(r?.userId, r?.serviceCode))
  );

  let rows = (carryoverPriorStillUnpaid.value || [])
    .filter((r) => !!r?.userId && !!r?.serviceCode && Number(r?.stillUnpaidUnits || 0) > 0)
    .filter((r) => !stagingKeys.has(stageKeyNormalized(r.userId, r.serviceCode)));

  if (selectedUserId.value) {
    rows = rows.filter((r) => Number(r.userId) === Number(selectedUserId.value));
  }

  const q = String(workspaceSearch.value || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const provider = `${r.firstName || ''} ${r.lastName || ''}`.trim().toLowerCase();
      const providerAlt = String(r.providerName || '').toLowerCase();
      const code = String(r.serviceCode || '').toLowerCase();
      return provider.includes(q) || providerAlt.includes(q) || code.includes(q);
    });
  }

  rows.sort((a, b) => {
    const aLast = String(a.lastName || '').toLowerCase();
    const bLast = String(b.lastName || '').toLowerCase();
    if (aLast && bLast && aLast !== bLast) return aLast.localeCompare(bLast);
    const aFirst = String(a.firstName || '').toLowerCase();
    const bFirst = String(b.firstName || '').toLowerCase();
    if (aFirst !== bFirst) return aFirst.localeCompare(bFirst);
    return String(a.serviceCode || '').localeCompare(String(b.serviceCode || ''), undefined, { sensitivity: 'base' });
  });

  return rows;
});

const payrollAgencyOptions = computed(() => {
  // Pinia unwraps refs, so these are usually plain arrays here.
  const ua = agencyStore.userAgencies?.value ?? agencyStore.userAgencies;
  const aa = agencyStore.agencies?.value ?? agencyStore.agencies;

  // Super admins should always see the full org list from /agencies, even if some
  // other view populated userAgencies earlier (which may be a subset).
  const role = String(authStore.user?.role || '').trim().toLowerCase();
  const base = (role === 'super_admin')
    ? (Array.isArray(aa) ? aa : [])
    : ((Array.isArray(ua) && ua.length > 0) ? ua : (Array.isArray(aa) ? aa : []));

  // Payroll only runs at the Agency org level.
  //
  // Important: some child orgs (schools/programs) may appear here depending on how the
  // org list is hydrated. We treat any org with an active `affiliated_agency_id` as a child
  // org and exclude it, even if organization_type is missing/incorrect.
  return base.filter((a) => {
    const orgType = String(a?.organization_type || '').toLowerCase();
    const isAgencyType = !orgType || orgType === 'agency';
    const isAffiliatedChildOrg = Number(a?.affiliated_agency_id || 0) > 0;
    return isAgencyType && !isAffiliatedChildOrg;
  });
});

const filteredAgencies = computed(() => {
  const all = (payrollAgencyOptions.value || []).slice();
  all.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
  const q = String(orgSearch.value || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((a) => String(a?.name || '').toLowerCase().includes(q));
});

const showOrgPicker = computed(() => {
  // Only show the organization selector if the user can actually switch payroll orgs.
  // Super admins can always switch; others only if they have more than one payroll agency option.
  if (isSuperAdmin.value) return true;
  return (payrollAgencyOptions.value || []).length > 1;
});

const sortedPeriods = computed(() => {
  const all = (periods.value || []).slice();
  // Prefer sorting by period_end desc, then id desc
  all.sort((a, b) => {
    const ae = String(a?.period_end || '');
    const be = String(b?.period_end || '');
    if (ae !== be) return be.localeCompare(ae);
    return (b?.id || 0) - (a?.id || 0);
  });
  return all;
});

// History list should show past + at most one upcoming pay period.
// Keep full `periods` for dropdowns (claim targeting / reimbursements into the future).
const historyPeriods = computed(() => {
  const all = (sortedPeriods.value || []).slice();
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const pastOrCurrent = all.filter((p) => String(p?.period_start || '') <= todayYmd);
  const future = all
    .filter((p) => String(p?.period_start || '') > todayYmd)
    // sort by period_start asc so "next" is first
    .sort((a, b) => String(a?.period_start || '').localeCompare(String(b?.period_start || '')));

  const next = future.length ? [future[0]] : [];
  return [...pastOrCurrent, ...next];
});

const historyPeriodsFiltered = computed(() => {
  const all = (historyPeriods.value || []).slice();
  const q = String(historySearch.value || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((p) => {
    const label = String(periodRangeLabel(p) || '').toLowerCase();
    const status = String(p?.status || '').toLowerCase();
    const ranBy = `${p?.finalized_by_first_name || ''} ${p?.finalized_by_last_name || ''}`.trim().toLowerCase();
    const ranAt = String(p?.finalized_at || '').slice(0, 19).toLowerCase();
    return (
      label.includes(q) ||
      status.includes(q) ||
      ranBy.includes(q) ||
      ranAt.includes(q)
    );
  });
});


const selectedUserName = computed(() => {
  const u = agencyUsers.value.find((x) => x.id === selectedUserId.value);
  if (u) return `${u.first_name} ${u.last_name}`.trim();
  if (selectedSummary.value) return `${selectedSummary.value.first_name} ${selectedSummary.value.last_name}`.trim();
  return 'Provider';
});

// Selected period status can temporarily be null if `loadPeriodDetails` fails.
// Use the cached period list as a fallback so core actions (view/export) don't "silently disable".
const selectedPeriodStatus = computed(() => {
  const id = Number(selectedPeriodId.value || 0);
  const cur = selectedPeriod.value && Number(selectedPeriod.value.id) === id ? selectedPeriod.value : null;
  const fromList = !cur && id ? (periods.value || []).find((p) => Number(p?.id) === id) : null;
  const st = String((cur || fromList)?.status || '').trim().toLowerCase();
  return st;
});

const selectedPeriodForUi = computed(() => {
  const id = Number(selectedPeriodId.value || 0);
  if (!id) return selectedPeriod.value || null;
  if (selectedPeriod.value && Number(selectedPeriod.value.id) === id) return selectedPeriod.value;
  return (periods.value || []).find((p) => Number(p?.id) === id) || selectedPeriod.value || null;
});

const isPeriodPosted = computed(() => selectedPeriodStatus.value === 'posted' || selectedPeriodStatus.value === 'finalized');

const isPeriodRan = computed(() => selectedPeriodStatus.value === 'ran');

// V2 modal state (isolated: always fetches fresh from API on open)
const showRunModalV2 = ref(false);
const runModalV2Loading = ref(false);
const runModalV2Error = ref('');
const runModalV2Summaries = ref([]);
const runModalV2Search = ref('');
const runModalV2SortKey = ref('provider'); // provider | total_hours | subtotal_amount | adjustments_amount | total_amount
const runModalV2SortDir = ref('asc'); // asc | desc

const runModalV2SortIndicator = (key) => {
  if (runModalV2SortKey.value !== key) return '';
  return runModalV2SortDir.value === 'asc' ? '▲' : '▼';
};

const setRunModalV2Sort = (key) => {
  if (runModalV2SortKey.value === key) {
    runModalV2SortDir.value = runModalV2SortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    runModalV2SortKey.value = key;
    runModalV2SortDir.value = key === 'provider' ? 'asc' : 'desc';
  }
};

const runModalV2Rows = computed(() => {
  const q = String(runModalV2Search.value || '').trim().toLowerCase();
  const base = (runModalV2Summaries.value || []).slice();

  const filtered = !q ? base : base.filter((s) => {
    const name = `${s?.last_name || ''}, ${s?.first_name || ''}`.toLowerCase();
    return name.includes(q);
  });

  const dir = runModalV2SortDir.value === 'asc' ? 1 : -1;
  const key = runModalV2SortKey.value;

  filtered.sort((a, b) => {
    if (key === 'provider') {
      const an = `${a?.last_name || ''}, ${a?.first_name || ''}`.trim();
      const bn = `${b?.last_name || ''}, ${b?.first_name || ''}`.trim();
      return dir * an.localeCompare(bn, undefined, { sensitivity: 'base' });
    }
    const av = Number(a?.[key] ?? 0);
    const bv = Number(b?.[key] ?? 0);
    if (av === bv) {
      const an = `${a?.last_name || ''}, ${a?.first_name || ''}`.trim();
      const bn = `${b?.last_name || ''}, ${b?.first_name || ''}`.trim();
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    }
    return dir * (av - bv);
  });

  return filtered;
});

const showPreviewPostModalV2 = ref(false);
const previewPostV2Loading = ref(false);
const previewPostV2Error = ref('');
const previewPostV2Summaries = ref([]);
const previewPostV2UserId = ref(null);
const previewPostV2Notifications = ref([]);

const previewPostV2ProviderOptions = computed(() => {
  const base = (previewPostV2Summaries.value || []).slice();
  base.sort((a, b) => {
    const al = String(a?.last_name || '').trim();
    const bl = String(b?.last_name || '').trim();
    const af = String(a?.first_name || '').trim();
    const bf = String(b?.first_name || '').trim();
    return al.localeCompare(bl, undefined, { sensitivity: 'base' })
      || af.localeCompare(bf, undefined, { sensitivity: 'base' })
      || (Number(a?.user_id || 0) - Number(b?.user_id || 0));
  });
  return base;
});

const previewPostV2UserIndex = computed(() => {
  const uid = Number(previewPostV2UserId.value || 0);
  if (!uid) return -1;
  return (previewPostV2ProviderOptions.value || []).findIndex((s) => Number(s.user_id) === uid);
});

const previewPostV2CanPrev = computed(() => previewPostV2UserIndex.value > 0);
const previewPostV2CanNext = computed(() => {
  const idx = previewPostV2UserIndex.value;
  const n = (previewPostV2ProviderOptions.value || []).length;
  return idx >= 0 && idx < n - 1;
});

const previewPostV2PrevUser = () => {
  const idx = previewPostV2UserIndex.value;
  if (idx <= 0) return;
  const next = previewPostV2ProviderOptions.value[idx - 1];
  previewPostV2UserId.value = next?.user_id || null;
};

const previewPostV2NextUser = () => {
  const idx = previewPostV2UserIndex.value;
  const next = previewPostV2ProviderOptions.value[idx + 1];
  if (!next?.user_id) return;
  previewPostV2UserId.value = next.user_id;
};

const previewPostV2Summary = computed(() => {
  const uid = Number(previewPostV2UserId.value || 0);
  if (!uid) return null;
  return (previewPostV2Summaries.value || []).find((s) => Number(s.user_id) === uid) || null;
});

const previewPostV2ServiceLines = computed(() => splitBreakdownForDisplay(previewPostV2Summary.value?.breakdown || null));

const previewPostV2CarryoverNotes = computed(() => {
  const b = previewPostV2Summary.value?.breakdown || null;
  return Number(b?.__carryover?.carryoverNotesTotal ?? b?.__carryover?.oldDoneNotesNotesTotal ?? 0);
});

const previewPostV2PriorStillUnpaid = computed(() => {
  const b = previewPostV2Summary.value?.breakdown || null;
  const p = b?.__priorStillUnpaid || null;
  return {
    totalUnits: Number(p?.totalUnits || 0),
    periodStart: String(p?.periodStart || ''),
    periodEnd: String(p?.periodEnd || ''),
    lines: Array.isArray(p?.lines) ? p.lines : []
  };
});

const previewPostV2UnpaidInPeriod = computed(() => {
  const b = previewPostV2Summary.value?.breakdown || null;
  const c = b?.__unpaidNotesCounts || null;
  const noNote = Number(c?.noNoteNotes || 0);
  const draft = Number(c?.draftNotes || 0);
  return { noNote, draft, total: noNote + draft };
});

const previewPostV2Totals = computed(() => {
  const uid = Number(previewPostV2UserId.value || 0);
  const s = (previewPostV2Summaries.value || []).find((x) => Number(x.user_id) === uid) || null;
  return {
    total: Number(s?.total_amount || 0),
    noNote: Number(s?.no_note_units || 0),
    draft: Number(s?.draft_units || 0)
  };
});

const refreshRunModalV2 = async () => {
  if (!selectedPeriodId.value) return;
  runModalV2Loading.value = true;
  runModalV2Error.value = '';
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
    const next = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    runModalV2Summaries.value = next;
  } catch (e) {
    runModalV2Error.value = e.response?.data?.error?.message || e.message || 'Failed to load ran payroll';
    runModalV2Summaries.value = [];
  } finally {
    runModalV2Loading.value = false;
  }
};

const openRunResultsModalV2 = async () => {
  if (!selectedPeriodId.value) return;
  runModalV2Search.value = '';
  runModalV2SortKey.value = 'provider';
  runModalV2SortDir.value = 'asc';
  showRunModalV2.value = true;
  await refreshRunModalV2();
};

const loadPreviewPostV2Notifications = async () => {
  if (!selectedPeriodId.value) return;
  const uid = Number(previewPostV2UserId.value || 0);
  if (!uid) {
    previewPostV2Notifications.value = [];
    return;
  }
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/post/preview`, { params: { userId: uid } });
    previewPostV2Notifications.value = resp.data?.notifications || [];
  } catch (e) {
    // Keep modal usable even if notification preview fails.
    previewPostV2Notifications.value = [];
    previewPostV2Error.value = e.response?.data?.error?.message || e.message || 'Failed to load post preview';
  }
};

const refreshPreviewPostModalV2 = async () => {
  if (!selectedPeriodId.value) return;
  previewPostV2Loading.value = true;
  previewPostV2Error.value = '';
  try {
    // Used for audit flags (compare to immediately prior period).
    await loadImmediatePriorSummaries();
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
    const next = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    previewPostV2Summaries.value = next;
    if (!previewPostV2UserId.value && (previewPostV2Summaries.value || []).length) {
      previewPostV2UserId.value = (previewPostV2Summaries.value[0] || {}).user_id || null;
    }
    await loadPreviewPostV2Notifications();
  } catch (e) {
    previewPostV2Error.value = e.response?.data?.error?.message || e.message || 'Failed to load preview post';
    previewPostV2Summaries.value = [];
    previewPostV2Notifications.value = [];
  } finally {
    previewPostV2Loading.value = false;
  }
};

const openPreviewPostModalV2 = async () => {
  if (!selectedPeriodId.value) return;
  showPreviewPostModalV2.value = true;
  await refreshPreviewPostModalV2();
};

const isTargetPeriodLocked = (periodId) => {
  const pid = Number(periodId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  const p = (periods.value || []).find((x) => Number(x.id) === pid) || null;
  const st = String(p?.status || '').toLowerCase();
  return st === 'posted' || st === 'finalized';
};

const isValidTargetPeriodId = (periodId) => {
  const pid = Number(periodId || 0);
  if (!Number.isFinite(pid) || pid <= 0) return false;
  return Boolean((periods.value || []).find((x) => Number(x.id) === pid));
};

const mileageRateForTier = (tierLevel) => {
  const t = Number(tierLevel || 0);
  if (![1, 2, 3].includes(t)) return 0;
  const raw = mileageRatesDraft.value?.[`tier${t}`];
  const n = Number(raw || 0);
  return Number.isFinite(n) ? n : 0;
};

const billableMilesForClaim = (c) => {
  const claimType = String(c?.claim_type || '').toLowerCase();
  const eligibleMiles = Number(c?.eligible_miles ?? c?.miles ?? 0);
  const miles = Number.isFinite(eligibleMiles) ? eligibleMiles : 0;
  if (claimType === 'school_travel') return Math.max(0, miles);
  const roundTrip = c?.round_trip === 1 || c?.round_trip === true;
  return roundTrip ? (Math.max(0, miles) * 2) : Math.max(0, miles);
};

const estimateMileageAmount = (c) => {
  const tierLevel = Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0);
  const rate = mileageRateForTier(tierLevel);
  const miles = billableMilesForClaim(c);
  if (!(rate > 0) || !(miles > 0)) return null;
  return Math.round((miles * rate) * 100) / 100;
};

const estimateMileageDisplay = (c) => {
  const tierLevel = Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0);
  const rate = mileageRateForTier(tierLevel);
  if (!(rate > 0)) return '—';
  const est = estimateMileageAmount(c);
  return est !== null ? fmtMoney(est) : '—';
};

const estimateMileageTitle = (c) => {
  const tierLevel = Number(mileageTierByClaimId.value?.[c?.id] || c?.tier_level || 0);
  const rate = mileageRateForTier(tierLevel);
  if (!(rate > 0)) return `Tier ${tierLevel || '—'} mileage rate is not configured`;
  const miles = billableMilesForClaim(c);
  if (!(miles > 0)) return 'No billable miles';
  return `Estimated = ${fmtNum(miles)} mi × ${fmtMoney(rate)}/mi`;
};

const canSeeRunResults = computed(() => {
  const st = selectedPeriodStatus.value;
  return st === 'ran' || st === 'posted' || st === 'finalized';
});

const previewSummary = computed(() => {
  if (!previewUserId.value) return null;
  return (summaries.value || []).find((s) => s.user_id === previewUserId.value) || null;
});

const previewAdjustmentsFromRun = computed(() => {
  const s = previewSummary.value;
  const b = s?.breakdown || null;
  const a = b && typeof b === 'object' ? b.__adjustments : null;
  return a && typeof a === 'object' ? a : null;
});

const immediatePriorPeriod = computed(() => {
  const cur = selectedPeriod.value;
  const start = String(cur?.period_start || '').slice(0, 10);
  if (!start) return null;
  // prior.period_end = current.period_start - 1 day
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - 1);
  const end = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return (periods.value || []).find((p) => String(p?.period_end || '').slice(0, 10) === end) || null;
});

const priorSummaries = ref([]);
const priorSummariesLoading = ref(false);
const priorSummariesError = ref('');

const loadImmediatePriorSummaries = async () => {
  const p = immediatePriorPeriod.value;
  if (!p?.id) {
    priorSummaries.value = [];
    priorSummariesError.value = '';
    return;
  }
  try {
    priorSummariesLoading.value = true;
    priorSummariesError.value = '';
    const resp = await api.get(`/payroll/periods/${p.id}`);
    const next = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    priorSummaries.value = next;
  } catch (e) {
    priorSummariesError.value = e.response?.data?.error?.message || e.message || 'Failed to load prior period summaries';
    priorSummaries.value = [];
  } finally {
    priorSummariesLoading.value = false;
  }
};

const priorSummaryByUserId = computed(() => {
  const m = new Map();
  for (const s of priorSummaries.value || []) m.set(s.user_id, s);
  return m;
});

const agencyUserById = computed(() => {
  const m = new Map();
  for (const u of agencyUsers.value || []) {
    if (u?.id) m.set(Number(u.id), u);
  }
  return m;
});

const isSupervisorUserId = (uid) => {
  const u = agencyUserById.value.get(Number(uid)) || null;
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  if (role === 'supervisor') return true;
  // Backward-compat flag in some DBs
  return u.has_supervisor_privileges === 1 || u.has_supervisor_privileges === true || u.has_supervisor_privileges === '1';
};

const isCpaUserId = (uid) => {
  const u = agencyUserById.value.get(Number(uid)) || null;
  if (!u) return false;
  return String(u.role || '').toLowerCase() === 'clinical_practice_assistant';
};

const median = (nums) => {
  const a = (nums || []).filter((n) => Number.isFinite(n)).slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

const auditProviders = computed(() => {
  const cur = (summaries.value || []).slice();
  const priorMap = priorSummaryByUserId.value;
  const totals = cur.map((s) => Number(s.total_amount || 0)).filter((n) => Number.isFinite(n));
  const med = median(totals);

  const out = [];
  for (const s of cur) {
    const uid = s.user_id;
    const prior = priorMap.get(uid) || null;
    const curTotal = Number(s.total_amount || 0);
    const curHours = Number(s.total_hours || 0);
    const curAdj = Number(s.adjustments_amount || 0);
    const curEff = curHours > 0 ? (curTotal / curHours) : 0;

    const flags = [];
    let score = 0;

    // Always-on sanity checks
    if (curAdj >= 250) { flags.push(`Large adjustments: ${fmtMoney(curAdj)}`); score += 2; }
    if (curHours > 0 && curEff >= 65) { flags.push(`High effective hourly: ${fmtMoney(curEff)}/hr`); score += 2; }
    if (curHours > 0 && curEff > 0 && curEff <= 12 && curTotal >= 200) { flags.push(`Low effective hourly: ${fmtMoney(curEff)}/hr`); score += 1; }
    if (med > 0 && curTotal >= med * 2.75 && curTotal >= 800) { flags.push(`High total vs peers: ${fmtMoney(curTotal)} (median ${fmtMoney(med)})`); score += 1; }

    // Supervisors should not be paid under 99414.
    try {
      const b = s?.breakdown || null;
      const has99414 = b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(b, '99414');
      const v = has99414 ? b['99414'] : null;
      const amt = Number(v?.amount || 0);
      const units = Number(v?.finalizedUnits ?? v?.units ?? 0);
      if (has99414 && isSupervisorUserId(uid) && (amt > 1e-9 || units > 1e-9)) {
        flags.push('Supervisor has service code 99414 (should not be included)');
        score += 3;
      }
    } catch { /* ignore */ }

    // 99415 should only be used by supervisors / CPA.
    try {
      const b = s?.breakdown || null;
      const has99415 = b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(b, '99415');
      const v = has99415 ? b['99415'] : null;
      const amt = Number(v?.amount || 0);
      const units = Number(v?.finalizedUnits ?? v?.units ?? 0);
      if (has99415 && !isSupervisorUserId(uid) && !isCpaUserId(uid) && (amt > 1e-9 || units > 1e-9)) {
        flags.push('Non-supervisor/CPA has service code 99415 (review recommended)');
        score += 3;
      }
    } catch { /* ignore */ }

    const tierStatus = s?.breakdown?.__tier?.status;
    if (tierStatus && String(tierStatus).toLowerCase().includes('out of compliance')) { flags.push('Out of compliance tier'); score += 1; }

    // Compare to immediately prior period (if available for this user)
    if (prior) {
      const priorTotal = Number(prior.total_amount || 0);
      const delta = curTotal - priorTotal;
      const absDelta = Math.abs(delta);
      const pct = priorTotal > 0 ? (delta / priorTotal) : null;
      if (absDelta >= 250 && priorTotal > 0 && pct !== null && Math.abs(pct) >= 0.25) {
        flags.push(`Big pay change vs prior: ${fmtMoney(delta)} (${(pct * 100).toFixed(0)}%)`);
        score += 3;
      } else if (absDelta >= 400) {
        flags.push(`Big pay change vs prior: ${fmtMoney(delta)}`);
        score += 2;
      }

      const priorHours = Number(prior.total_hours || 0);
      const priorEff = priorHours > 0 ? (priorTotal / priorHours) : 0;
      if (priorHours > 0 && curHours > 0) {
        const effDelta = curEff - priorEff;
        if (Math.abs(effDelta) >= 15) {
          flags.push(`Effective hourly changed vs prior: ${fmtMoney(effDelta)}/hr`);
          score += 2;
        }
      }
    }

    out.push({
      userId: uid,
      name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      flags,
      score
    });
  }

  out.sort((a, b) => (b.score - a.score) || (b.flags.length - a.flags.length) || String(a.name).localeCompare(String(b.name)));
  return out;
});

const auditFlaggedProviders = computed(() => (auditProviders.value || []).filter((x) => (x.flags || []).length > 0));

const auditForPreviewProvider = computed(() => {
  const uid = previewUserId.value;
  if (!uid) return null;
  return (auditProviders.value || []).find((x) => x.userId === uid) || null;
});

// V2 Preview Post uses isolated summaries; compute the same audit flags against the V2 dataset.
const auditProvidersV2 = computed(() => {
  const cur = (previewPostV2Summaries.value || []).slice();
  const priorMap = priorSummaryByUserId.value;
  const totals = cur.map((s) => Number(s.total_amount || 0)).filter((n) => Number.isFinite(n));
  const med = median(totals);

  const out = [];
  for (const s of cur) {
    const uid = s.user_id;
    const prior = priorMap.get(uid) || null;
    const curTotal = Number(s.total_amount || 0);
    const curHours = Number(s.total_hours || 0);
    const curAdj = Number(s.adjustments_amount || 0);
    const curEff = curHours > 0 ? (curTotal / curHours) : 0;

    const flags = [];
    let score = 0;

    // Always-on sanity checks
    if (curAdj >= 250) { flags.push(`Large adjustments: ${fmtMoney(curAdj)}`); score += 2; }
    if (curHours > 0 && curEff >= 65) { flags.push(`High effective hourly: ${fmtMoney(curEff)}/hr`); score += 2; }
    if (curHours > 0 && curEff > 0 && curEff <= 12 && curTotal >= 200) { flags.push(`Low effective hourly: ${fmtMoney(curEff)}/hr`); score += 1; }
    if (med > 0 && curTotal >= med * 2.75 && curTotal >= 800) { flags.push(`High total vs peers: ${fmtMoney(curTotal)} (median ${fmtMoney(med)})`); score += 1; }

    // Supervisors should not be paid under 99414.
    try {
      const b = s?.breakdown || null;
      const has99414 = b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(b, '99414');
      const v = has99414 ? b['99414'] : null;
      const amt = Number(v?.amount || 0);
      const units = Number(v?.finalizedUnits ?? v?.units ?? 0);
      if (has99414 && isSupervisorUserId(uid) && (amt > 1e-9 || units > 1e-9)) {
        flags.push('Supervisor has service code 99414 (should not be included)');
        score += 3;
      }
    } catch { /* ignore */ }

    // 99415 should only be used by supervisors / CPA.
    try {
      const b = s?.breakdown || null;
      const has99415 = b && typeof b === 'object' && Object.prototype.hasOwnProperty.call(b, '99415');
      const v = has99415 ? b['99415'] : null;
      const amt = Number(v?.amount || 0);
      const units = Number(v?.finalizedUnits ?? v?.units ?? 0);
      if (has99415 && !isSupervisorUserId(uid) && !isCpaUserId(uid) && (amt > 1e-9 || units > 1e-9)) {
        flags.push('Non-supervisor/CPA has service code 99415 (review recommended)');
        score += 3;
      }
    } catch { /* ignore */ }

    const tierStatus = s?.breakdown?.__tier?.status;
    if (tierStatus && String(tierStatus).toLowerCase().includes('out of compliance')) { flags.push('Out of compliance tier'); score += 1; }

    // Compare to immediately prior period (if available for this user)
    if (prior) {
      const priorTotal = Number(prior.total_amount || 0);
      const delta = curTotal - priorTotal;
      const absDelta = Math.abs(delta);
      const pct = priorTotal > 0 ? (delta / priorTotal) : null;
      if (absDelta >= 250 && priorTotal > 0 && pct !== null && Math.abs(pct) >= 0.25) {
        flags.push(`Big pay change vs prior: ${fmtMoney(delta)} (${(pct * 100).toFixed(0)}%)`);
        score += 3;
      } else if (absDelta >= 400) {
        flags.push(`Big pay change vs prior: ${fmtMoney(delta)}`);
        score += 2;
      }

      const priorHours = Number(prior.total_hours || 0);
      const priorEff = priorHours > 0 ? (priorTotal / priorHours) : 0;
      if (priorHours > 0 && curHours > 0) {
        const effDelta = curEff - priorEff;
        if (Math.abs(effDelta) >= 15) {
          flags.push(`Effective hourly changed vs prior: ${fmtMoney(effDelta)}/hr`);
          score += 2;
        }
      }
    }

    out.push({
      userId: uid,
      name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
      flags,
      score
    });
  }

  out.sort((a, b) => (b.score - a.score) || (b.flags.length - a.flags.length) || String(a.name).localeCompare(String(b.name)));
  return out;
});

const auditForPreviewProviderV2 = computed(() => {
  const uid = Number(previewPostV2UserId.value || 0);
  if (!uid) return null;
  return (auditProvidersV2.value || []).find((x) => Number(x.userId) === uid) || null;
});

const fmtMoney = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
};
const fmtNum = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const fmtInt = (v) => {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const nameForUserId = (uid) => {
  const id = Number(uid || 0);
  const u = (agencyUsers.value || []).find((x) => Number(x.id) === id) || null;
  if (!u) return `User #${id}`;
  return `${u.first_name || ''} ${u.last_name || ''}`.trim();
};

const submittedAtYmd = (row) => String(row?.created_at || '').slice(0, 10) || '—';
const submitterLabel = (row) => {
  const submittedById = row?.submitted_by_user_id === null || row?.submitted_by_user_id === undefined ? null : Number(row.submitted_by_user_id);
  const fn = String(row?.submitted_by_first_name || '').trim();
  const ln = String(row?.submitted_by_last_name || '').trim();
  const email = String(row?.submitted_by_email || '').trim();

  if (ln || fn) return `${ln}${ln && fn ? ', ' : ''}${fn}`;
  if (email) return email;
  if (submittedById) return nameForUserId(submittedById);
  return '—';
};

const holidayBonusDatesLabel = (row) => {
  const raw = row?.holiday_dates_json ?? row?.holidayDatesJson ?? null;
  let arr = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [];
    } catch {
      arr = raw.split(',').map((s) => String(s || '').trim()).filter(Boolean);
    }
  }
  const uniq = Array.from(new Set((arr || []).map((x) => String(x || '').slice(0, 10)).filter((x) => /^\\d{4}-\\d{2}-\\d{2}$/.test(x)))).sort();
  return uniq.length ? uniq.join(', ') : '—';
};

const loadMileageRates = async () => {
  if (!agencyId.value) return;
  try {
    mileageRatesLoading.value = true;
    mileageRatesError.value = '';
    const resp = await api.get('/payroll/mileage-rates', { params: { agencyId: agencyId.value } });
    const rates = resp.data?.rates || [];
    const byTier = new Map((rates || []).map((r) => [Number(r.tierLevel), Number(r.ratePerMile || 0)]));
    mileageRatesDraft.value = {
      tier1: byTier.get(1) || 0,
      tier2: byTier.get(2) || 0,
      tier3: byTier.get(3) || 0
    };
  } catch (e) {
    mileageRatesError.value = e.response?.data?.error?.message || e.message || 'Failed to load mileage rates';
  } finally {
    mileageRatesLoading.value = false;
  }
};

const saveMileageRates = async () => {
  if (!agencyId.value) return;
  try {
    savingMileageRates.value = true;
    mileageRatesError.value = '';
    const t1 = Number(mileageRatesDraft.value.tier1 || 0);
    const t2 = Number(mileageRatesDraft.value.tier2 || 0);
    const t3 = Number(mileageRatesDraft.value.tier3 || 0);
    await api.put('/payroll/mileage-rates', {
      rates: [
        { tierLevel: 1, ratePerMile: t1 },
        { tierLevel: 2, ratePerMile: t2 },
        { tierLevel: 3, ratePerMile: t3 }
      ]
    }, { params: { agencyId: agencyId.value } });
    await loadMileageRates();
  } catch (e) {
    mileageRatesError.value = e.response?.data?.error?.message || e.message || 'Failed to save mileage rates';
  } finally {
    savingMileageRates.value = false;
  }
};

const loadPendingMileageClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  pendingMileageMode.value = 'period';
  try {
    pendingMileageLoading.value = true;
    pendingMileageError.value = '';
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted',
        suggestedPeriodId: selectedPeriodId.value
      }
    });
    const rows = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    pendingMileageClaims.value = rows;

    // Seed defaults for per-row controls
    const nextTier = { ...(mileageTierByClaimId.value || {}) };
    const nextTarget = { ...(mileageTargetPeriodByClaimId.value || {}) };
    for (const c of rows) {
      if (!nextTier[c.id]) nextTier[c.id] = Number(c.tier_level || 1);
      if (!nextTarget[c.id]) nextTarget[c.id] = Number(c.suggested_payroll_period_id || selectedPeriodId.value);
    }
    mileageTierByClaimId.value = nextTier;
    mileageTargetPeriodByClaimId.value = nextTarget;
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending mileage submissions';
    pendingMileageClaims.value = [];
  } finally {
    pendingMileageLoading.value = false;
  }
};

const loadAllPendingMileageClaims = async () => {
  if (!agencyId.value) return;
  pendingMileageMode.value = 'all';
  try {
    pendingMileageLoading.value = true;
    pendingMileageError.value = '';
    const resp = await api.get('/payroll/mileage-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted'
      }
    });
    const rows = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    pendingMileageClaims.value = rows;

    const nextTier = { ...(mileageTierByClaimId.value || {}) };
    const nextTarget = { ...(mileageTargetPeriodByClaimId.value || {}) };
    for (const c of rows) {
      if (!nextTier[c.id]) nextTier[c.id] = Number(c.tier_level || 1);
      if (!nextTarget[c.id]) nextTarget[c.id] = Number(c.suggested_payroll_period_id || selectedPeriodId.value || 0) || null;
    }
    mileageTierByClaimId.value = nextTier;
    mileageTargetPeriodByClaimId.value = nextTarget;
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending mileage submissions';
    pendingMileageClaims.value = [];
  } finally {
    pendingMileageLoading.value = false;
  }
};

const reloadPendingMileageClaims = async () => {
  if (pendingMileageMode.value === 'all') return await loadAllPendingMileageClaims();
  return await loadPendingMileageClaims();
};

const openMileageDetails = (c) => {
  selectedMileageClaim.value = c || null;
  showMileageDetailsModal.value = true;
};

const closeMileageDetails = () => {
  showMileageDetailsModal.value = false;
  selectedMileageClaim.value = null;
};

const approveMileageClaim = async (c) => {
  if (!c?.id) return;
  try {
    approvingMileageClaimId.value = c.id;
    pendingMileageError.value = '';
    const tierLevel = Number(mileageTierByClaimId.value?.[c.id] || 1);
    const targetPayrollPeriodId = Number(mileageTargetPeriodByClaimId.value?.[c.id] || selectedPeriodId.value);
    if (isTargetPeriodLocked(targetPayrollPeriodId)) {
      pendingMileageError.value = 'Target pay period is posted (locked). Choose an open pay period.';
      return;
    }
    try {
      await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'approve', tierLevel, targetPayrollPeriodId });
    } catch (e) {
      const status = e.response?.status || 0;
      const msg = e.response?.data?.error?.message || e.message || '';
      const looksLikeDeadline =
        String(msg).toLowerCase().includes('deadline') ||
        String(msg).toLowerCase().includes('submitted after') ||
        String(msg).toLowerCase().includes('cannot be added to an earlier pay period');
      if (status === 409 && looksLikeDeadline) {
        const ok = window.confirm(
          'This claim was submitted after the cutoff for this pay period.\n\nApprove anyway using an admin override?'
        );
        if (!ok) throw e;
        await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'approve', tierLevel, targetPayrollPeriodId, overrideDeadline: true });
      } else {
        throw e;
      }
    }
    await reloadPendingMileageClaims();
    await loadPeriodDetails();
    await loadApprovedMileageClaimsAmount();
    await loadApprovedMileageClaimsList();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to approve mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const deferMileageClaim = async (c) => {
  if (!c?.id) return;
  try {
    approvingMileageClaimId.value = c.id;
    pendingMileageError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'defer' });
    await reloadPendingMileageClaims();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to defer mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const rejectMileageClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingMileageClaimId.value = c.id;
    pendingMileageError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'reject', rejectionReason: reason });
    await reloadPendingMileageClaims();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to reject mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const returnMileageClaim = async (c) => {
  if (!c?.id) return;
  const note = window.prompt('Send back note (required):', '') || '';
  if (!String(note).trim()) return;
  try {
    approvingMileageClaimId.value = c.id;
    pendingMileageError.value = '';
    await api.patch(`/payroll/mileage-claims/${c.id}`, { action: 'return', note: String(note).trim() });
    await reloadPendingMileageClaims();
  } catch (e) {
    pendingMileageError.value = e.response?.data?.error?.message || e.message || 'Failed to send back mileage claim';
  } finally {
    approvingMileageClaimId.value = null;
  }
};

const loadPendingMedcancelClaims = async () => {
  if (!agencyId.value || !selectedPeriodId.value) return;
  pendingMedcancelMode.value = 'period';
  try {
    pendingMedcancelLoading.value = true;
    pendingMedcancelError.value = '';
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted',
        suggestedPeriodId: selectedPeriodId.value
      }
    });
    const rows = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    pendingMedcancelClaims.value = rows;

    // Seed defaults for per-row controls
    const nextTarget = { ...(medcancelTargetPeriodByClaimId.value || {}) };
    for (const c of rows) {
      if (!nextTarget[c.id]) nextTarget[c.id] = Number(selectedPeriodId.value);
    }
    medcancelTargetPeriodByClaimId.value = nextTarget;
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending MedCancel submissions';
    pendingMedcancelClaims.value = [];
  } finally {
    pendingMedcancelLoading.value = false;
  }
};

const loadAllPendingMedcancelClaims = async () => {
  if (!agencyId.value) return;
  pendingMedcancelMode.value = 'all';
  try {
    pendingMedcancelLoading.value = true;
    pendingMedcancelError.value = '';
    const resp = await api.get('/payroll/medcancel-claims', {
      params: {
        agencyId: agencyId.value,
        status: 'submitted'
      }
    });
    const rows = (resp.data || []).filter((r) => !!r && typeof r === 'object');
    pendingMedcancelClaims.value = rows;

    const nextTarget = { ...(medcancelTargetPeriodByClaimId.value || {}) };
    for (const c of rows) {
      if (!nextTarget[c.id]) nextTarget[c.id] = Number(selectedPeriodId.value || c.suggested_payroll_period_id || 0) || null;
    }
    medcancelTargetPeriodByClaimId.value = nextTarget;
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to load pending MedCancel submissions';
    pendingMedcancelClaims.value = [];
  } finally {
    pendingMedcancelLoading.value = false;
  }
};

const reloadPendingMedcancelClaims = async () => {
  if (pendingMedcancelMode.value === 'all') return await loadAllPendingMedcancelClaims();
  return await loadPendingMedcancelClaims();
};

const approveMedcancelClaim = async (c) => {
  if (!c?.id) return;
  try {
    approvingMedcancelClaimId.value = c.id;
    pendingMedcancelError.value = '';
    const targetPayrollPeriodId = Number(medcancelTargetPeriodByClaimId.value?.[c.id] || selectedPeriodId.value);
    if (isTargetPeriodLocked(targetPayrollPeriodId)) {
      pendingMedcancelError.value = 'Target pay period is posted (locked). Choose an open pay period.';
      return;
    }
    try {
      await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId });
    } catch (e) {
      const status = e.response?.status || 0;
      const msg = e.response?.data?.error?.message || e.message || '';
      const looksLikeDeadline =
        String(msg).toLowerCase().includes('deadline') ||
        String(msg).toLowerCase().includes('submitted after') ||
        String(msg).toLowerCase().includes('cannot be added to an earlier pay period');
      if (status === 409 && looksLikeDeadline) {
        const ok = window.confirm(
          'This claim was submitted after the cutoff for this pay period.\n\nApprove anyway using an admin override?'
        );
        if (!ok) throw e;
        await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'approve', targetPayrollPeriodId, overrideDeadline: true });
      } else {
        throw e;
      }
    }
    await reloadPendingMedcancelClaims();
    await loadPeriodDetails();
    await loadApprovedMedcancelClaimsAmount();
    await loadApprovedMedcancelClaimsList();
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to approve MedCancel claim';
  } finally {
    approvingMedcancelClaimId.value = null;
  }
};

const deferMedcancelClaim = async (c) => {
  if (!c?.id) return;
  try {
    approvingMedcancelClaimId.value = c.id;
    pendingMedcancelError.value = '';
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'defer' });
    await reloadPendingMedcancelClaims();
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to defer MedCancel claim';
  } finally {
    approvingMedcancelClaimId.value = null;
  }
};

const rejectMedcancelClaim = async (c) => {
  if (!c?.id) return;
  const reason = window.prompt('Rejection reason (required):', '') || '';
  if (!String(reason).trim()) return;
  try {
    approvingMedcancelClaimId.value = c.id;
    pendingMedcancelError.value = '';
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'reject', rejectionReason: reason });
    await reloadPendingMedcancelClaims();
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to reject MedCancel claim';
  } finally {
    approvingMedcancelClaimId.value = null;
  }
};

const returnMedcancelClaim = async (c) => {
  if (!c?.id) return;
  const note = window.prompt('Send back note (required):', '') || '';
  if (!String(note).trim()) return;
  try {
    approvingMedcancelClaimId.value = c.id;
    pendingMedcancelError.value = '';
    await api.patch(`/payroll/medcancel-claims/${c.id}`, { action: 'return', note: String(note).trim() });
    await reloadPendingMedcancelClaims();
  } catch (e) {
    pendingMedcancelError.value = e.response?.data?.error?.message || e.message || 'Failed to send back Med Cancel claim';
  } finally {
    approvingMedcancelClaimId.value = null;
  }
};

const payBucketForCategory = (category) => {
  const c = String(category || '').trim().toLowerCase();
  if (c === 'indirect' || c === 'admin' || c === 'meeting') return 'indirect';
  if (c === 'other' || c === 'tutoring') return 'other';
  if (c === 'mileage' || c === 'bonus' || c === 'reimbursement' || c === 'other_pay') return 'flat';
  return 'direct';
};

const payTotalsFromBreakdown = (breakdown) => {
  const out = { directAmount: 0, indirectAmount: 0, otherAmount: 0, flatAmount: 0 };
  if (!breakdown || typeof breakdown !== 'object') return out;
  for (const [code, v] of Object.entries(breakdown)) {
    if (String(code).startsWith('_')) continue;
    const amt = Number(v?.amount || 0);
    const bucket = v?.bucket ? String(v.bucket).trim().toLowerCase() : payBucketForCategory(v?.category);
    if (bucket === 'indirect') out.indirectAmount += amt;
    else if (bucket === 'other') out.otherAmount += amt;
    else if (bucket === 'flat') out.flatAmount += amt;
    else out.directAmount += amt;
  }
  return out;
};

const splitBreakdownForDisplay = (breakdown) => {
  const out = [];
  if (!breakdown || typeof breakdown !== 'object') return out;
  for (const [code, vRaw] of Object.entries(breakdown)) {
    if (String(code).startsWith('_')) continue;
    const v = vRaw || {};
    const finalizedUnits = Number(v.finalizedUnits ?? v.units ?? 0);
    const rateAmount = Number(v.rateAmount || 0);
    const payDivisor = Number(v.payDivisor || 1);
    const safeDiv = Number.isFinite(payDivisor) && payDivisor > 0 ? payDivisor : 1;
    const creditValue = Number(v.creditValue || 0);
    const safeCv = Number.isFinite(creditValue) ? creditValue : 0;
    const bucket = v?.bucket ? String(v.bucket).trim().toLowerCase() : payBucketForCategory(v.category);
    const rateUnit = String(v.rateUnit || '');

    const oldNoteUnits = Number(v.oldNoteUnits ?? v.oldDoneNotesUnits ?? 0);
    const codeChangedUnits = Number(v.codeChangedUnits || 0);
    const lateAdditionUnits = Number(v.lateAdditionUnits || 0);
    const carryUnits = Math.max(0, oldNoteUnits) + Math.max(0, codeChangedUnits) + Math.max(0, lateAdditionUnits);

    // If there's no carryover, or this is a flat line, show as-is.
    if (!(carryUnits > 1e-9) || rateUnit === 'flat') {
      out.push({ code, ...v });
      continue;
    }

    const totalAmount = Number(v.amount || 0);
    const totalUnits = Math.max(0, finalizedUnits);
    const baseUnits = Math.max(0, totalUnits - carryUnits);

    const allocAmount = (u) => (totalUnits > 1e-9 ? Number((totalAmount * (u / totalUnits)).toFixed(2)) : 0);
    const oldNoteAmount = allocAmount(Math.max(0, oldNoteUnits));
    const codeChangedAmount = allocAmount(Math.max(0, codeChangedUnits));
    const lateAdditionAmount = allocAmount(Math.max(0, lateAdditionUnits));
    const carryAmountSum = Number((oldNoteAmount + codeChangedAmount + lateAdditionAmount).toFixed(2));
    const baseAmount = Math.max(0, Number((totalAmount - carryAmountSum).toFixed(2)));

    // Base row
    if (baseUnits > 1e-9 && baseAmount > 1e-9) {
      out.push({
        code,
        ...v,
        finalizedUnits: baseUnits,
        units: baseUnits,
        payHours: bucket !== 'flat' ? (baseUnits / safeDiv) : (v.payHours ?? 0),
        hours: baseUnits * safeCv,
        creditsHours: baseUnits * safeCv,
        amount: baseAmount
      });
    }

    // Old Note row (display only)
    if (oldNoteUnits > 1e-9 && oldNoteAmount > 1e-9) {
      const oldPayHours = bucket !== 'flat' ? (oldNoteUnits / safeDiv) : 0;
      out.push({
        code: `${code} (Old Note)`,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: oldNoteUnits,
        units: oldNoteUnits,
        payHours: bucket !== 'flat' ? oldPayHours : 0,
        hours: oldNoteUnits * safeCv,
        creditsHours: oldNoteUnits * safeCv,
        amount: oldNoteAmount
      });
    }

    if (codeChangedUnits > 1e-9 && codeChangedAmount > 1e-9) {
      const fromCodes = Array.isArray(v.codeChangedFromCodes) ? v.codeChangedFromCodes.filter(Boolean) : [];
      const label = (fromCodes.length === 1)
        ? `${code} (Code Changed: ${fromCodes[0]}→${code})`
        : `${code} (Code Changed)`;
      const payHours = bucket !== 'flat' ? (codeChangedUnits / safeDiv) : 0;
      out.push({
        code: label,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: codeChangedUnits,
        units: codeChangedUnits,
        payHours: bucket !== 'flat' ? payHours : 0,
        hours: codeChangedUnits * safeCv,
        creditsHours: codeChangedUnits * safeCv,
        amount: codeChangedAmount
      });
    }

    if (lateAdditionUnits > 1e-9 && lateAdditionAmount > 1e-9) {
      const payHours = bucket !== 'flat' ? (lateAdditionUnits / safeDiv) : 0;
      out.push({
        code: `${code} (Late Addition)`,
        ...v,
        noNoteUnits: 0,
        draftUnits: 0,
        finalizedUnits: lateAdditionUnits,
        units: lateAdditionUnits,
        payHours: bucket !== 'flat' ? payHours : 0,
        hours: lateAdditionUnits * safeCv,
        creditsHours: lateAdditionUnits * safeCv,
        amount: lateAdditionAmount
      });
    }
  }
  return out;
};

const selectedSummaryServiceLines = computed(() => splitBreakdownForDisplay(selectedSummary.value?.breakdown || null));
const previewSummaryServiceLines = computed(() => splitBreakdownForDisplay(previewSummary.value?.breakdown || null));

const fmtDateTime = (v) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : (v || '');
};

const ymd = (v) => {
  if (!v) return '';
  const s = String(v);
  // Prefer showing stored YYYY-MM-DD without timezone conversions.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
};

const rawDraftRows = computed(() => {
  const all = (rawImportRows.value || []).slice();
  let rows = rawDraftOnly.value ? all.filter((r) => String(r.note_status || '').toUpperCase() === 'DRAFT') : all;
  const q = String(rawDraftSearch.value || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const prov = String(r.provider_name || '').toLowerCase();
      const code = String(r.service_code || '').toLowerCase();
      const dos = String(r.service_date || '').toLowerCase();
      return prov.includes(q) || code.includes(q) || dos.includes(q);
    });
  }
  // Prefer most recent first (service_date may be null)
  rows.sort((a, b) => String(b.service_date || '').localeCompare(String(a.service_date || '')));
  return rows;
});

const rawMode = ref('draft_audit'); // draft_audit | process_h0031 | process_h0032 | processed | missed_appts_paid_in_full

const rawModeRowsLimited = computed(() => {
  const all = rawModeRows.value || [];
  const lim = Number(rawRowLimit.value || 200);
  if (!Number.isFinite(lim) || lim <= 0) return all.slice(0, 200);
  return all.slice(0, lim);
});

const showNextRawRows = () => {
  rawRowLimit.value = Number(rawRowLimit.value || 0) + 200;
};

const rawClientHint = (r) => {
  const raw = String(r?.patient_first_name || '').trim();
  if (!raw) return '';
  const firstToken = raw.split(/\s+/)[0] || '';
  return String(firstToken || '').slice(0, 3).toUpperCase();
};

const toggleRawSort = (column) => {
  const col = String(column || '').trim();
  if (!col) return;
  if (rawSortColumn.value === col) {
    rawSortDirection.value = rawSortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  rawSortColumn.value = col;
  // Default direction: numbers/dates descend, strings ascend.
  if (col === 'service_date' || col === 'unit_count' || col === 'draft_payable') rawSortDirection.value = 'desc';
  else rawSortDirection.value = 'asc';
};

const rawSortIndicator = (column) => {
  const col = String(column || '').trim();
  if (!col || rawSortColumn.value !== col) return '';
  return rawSortDirection.value === 'asc' ? '↑' : '↓';
};

const setRawProcessChecked = (rowId, checked) => {
  const id = Number(rowId || 0);
  if (!Number.isFinite(id) || id <= 0) return;
  rawProcessChecklistByRowId.value = { ...(rawProcessChecklistByRowId.value || {}), [id]: !!checked };
};

watch([rawMode, rawDraftSearch, rawDraftOnly, showRawModal], ([mode, q, only, open]) => {
  // Reset paging when changing modes/search or reopening modal.
  if (open) rawRowLimit.value = 200;
});

const rawModeRows = computed(() => {
  const all = (rawImportRows.value || []).slice();
  const mode = String(rawMode.value || 'draft_audit');
  const q = String(rawDraftSearch.value || '').trim().toLowerCase();

  let rows = all;
  if (mode === 'missed_appts_paid_in_full') {
    return [];
  }
  const willBePaid = (r) => {
    const st = String(r?.note_status || '').trim().toUpperCase();
    if (st === 'FINALIZED') return true;
    if (st === 'DRAFT') return Number(r?.draft_payable) === 1;
    return false;
  };
  if (mode === 'draft_audit') {
    rows = rawDraftOnly.value ? rows.filter((r) => String(r.note_status || '').toUpperCase() === 'DRAFT') : rows;
  } else if (mode === 'process_h0031') {
    rows = rows.filter((r) =>
      Number(r.requires_processing) === 1 &&
      willBePaid(r) &&
      String(r.service_code || '').trim().toUpperCase() === 'H0031'
    );
  } else if (mode === 'process_h0032') {
    rows = rows.filter((r) =>
      Number(r.requires_processing) === 1 &&
      willBePaid(r) &&
      String(r.service_code || '').trim().toUpperCase() === 'H0032'
    );
  } else {
    // processed
    rows = rows.filter((r) => Number(r.requires_processing) === 1 && !!r.processed_at && willBePaid(r));
  }

  if (q) {
    rows = rows.filter((r) => {
      const prov = String(r.provider_name || '').toLowerCase();
      const code = String(r.service_code || '').toLowerCase();
      const dos = String(r.service_date || '').toLowerCase();
      return prov.includes(q) || code.includes(q) || dos.includes(q);
    });
  }
  const processedRank = (r) => (r?.processed_at ? 1 : 0);
  rows.sort((a, b) => {
    // In processing views, keep unfinished rows at the top and done rows at the bottom,
    // so users can undo mistakes without rows disappearing.
    if (mode === 'process_h0031' || mode === 'process_h0032') {
      const ra = processedRank(a);
      const rb = processedRank(b);
      if (ra !== rb) return ra - rb;
    }
    const dir = rawSortDirection.value === 'asc' ? 1 : -1;
    const col = String(rawSortColumn.value || 'service_date');
    const s = (v) => String(v || '').trim().toLowerCase();
    const dateStr = (v) => String(v || '').slice(0, 10); // YYYY-MM-DD

    let cmp = 0;
    if (col === 'provider_name') cmp = s(a?.provider_name).localeCompare(s(b?.provider_name));
    else if (col === 'client') cmp = s(rawClientHint(a)).localeCompare(s(rawClientHint(b)));
    else if (col === 'service_code') cmp = s(a?.service_code).localeCompare(s(b?.service_code));
    else if (col === 'note_status') cmp = s(a?.note_status).localeCompare(s(b?.note_status));
    else if (col === 'unit_count') cmp = (Number(a?.unit_count || 0) - Number(b?.unit_count || 0));
    else if (col === 'draft_payable') cmp = (Number(a?.draft_payable || 0) - Number(b?.draft_payable || 0));
    else cmp = dateStr(a?.service_date).localeCompare(dateStr(b?.service_date));

    if (cmp) return cmp * dir;
    // Tie-breaker: most recent DOS first, then provider name.
    const dos = dateStr(b?.service_date).localeCompare(dateStr(a?.service_date));
    if (dos) return dos;
    return s(a?.provider_name).localeCompare(s(b?.provider_name));
  });
  return rows;
});

const missedAppointmentsPaidInFullRows = computed(() => {
  const all = (missedAppointmentsPaidInFull.value || []).slice();
  const q = String(rawDraftSearch.value || '').trim().toLowerCase();
  let rows = all;
  if (q) {
    rows = rows.filter((r) => String(r?.clinician_name || '').toLowerCase().includes(q));
  }
  rows.sort((a, b) => String(a?.clinician_name || '').localeCompare(String(b?.clinician_name || '')));
  return rows;
});

const carryoverDraftReviewFiltered = computed(() => {
  const all = Array.isArray(carryoverDraftReview.value) ? carryoverDraftReview.value : [];
  const q = String(carryoverDraftReviewSearch.value || '').trim().toLowerCase();
  if (!q) return all;
  return all.filter((r) => {
    const prov = String(r?.providerName || '').toLowerCase();
    const code = String(r?.serviceCode || '').toLowerCase();
    const dos = String(r?.serviceDate || '').toLowerCase();
    const client = String(r?.clientHint || '').toLowerCase();
    return prov.includes(q) || code.includes(q) || dos.includes(q) || client.includes(q);
  });
});

const carryoverDraftReasonLabel = (code) => {
  const c = String(code || '').trim().toLowerCase();
  if (c === 'prior_no_note') return 'Was NO_NOTE in a prior pay period';
  if (c === 'prior_draft_unpaid') return 'Was DRAFT not payable in a prior pay period';
  return String(code || '');
};

const setDraftPayableByRowId = async (rowId, nextVal) => {
  const id = Number(rowId || 0);
  if (!Number.isFinite(id) || id <= 0) return;
  if (isPeriodPosted.value) return;
  try {
    updatingDraftPayable.value = true;
    updatingCarryoverDraftRowId.value = id;
    rawDraftError.value = '';
    carryoverError.value = '';

    const resp = await api.patch(`/payroll/import-rows/${id}`, { draftPayable: !!nextVal });

    // Update local raw row state
    const idx = (rawImportRows.value || []).findIndex((r) => Number(r?.id) === id);
    if (idx >= 0) {
      rawImportRows.value[idx] = { ...rawImportRows.value[idx], draft_payable: nextVal ? 1 : 0 };
    }

    // Update local carryover draft review state
    const didx = (carryoverDraftReview.value || []).findIndex((r) => Number(r?.rowId) === id);
    if (didx >= 0) {
      carryoverDraftReview.value[didx] = { ...carryoverDraftReview.value[didx], draftPayable: nextVal ? 1 : 0 };
    }

    // If period already ran, backend can return refreshed summaries.
    if (resp?.data?.period) selectedPeriod.value = resp.data.period;
    if (Array.isArray(resp?.data?.summaries)) {
      const nextSummaries = resp.data.summaries.map((s) => {
        if (typeof s.breakdown === 'string') {
          try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
        }
        return s;
      });
      summaries.value = nextSummaries;
      if (selectedUserId.value) {
        const found = nextSummaries.find((x) => x.user_id === selectedUserId.value);
        if (found) selectedSummary.value = found;
      }
    }
    await loadStaging();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to update draft payable';
    rawDraftError.value = msg;
    carryoverError.value = msg;
  } finally {
    updatingCarryoverDraftRowId.value = null;
    updatingDraftPayable.value = false;
  }
};

const toggleDraftPayable = async (row, nextVal) => {
  if (!row?.id) return;
  await setDraftPayableByRowId(row.id, nextVal);
};

const updateRawMinutes = async (row, nextValRaw) => {
  if (!row?.id) return;
  if (isPeriodPosted.value && !rawPostedProcessingUnlocked.value) return;
  if (Number(row.requires_processing) !== 1) return;
  try {
    const nextMinutes = Math.round(Number(nextValRaw));
    if (!Number.isFinite(nextMinutes) || nextMinutes <= 0) return;
    updatingDraftPayable.value = true;
    rawDraftError.value = '';
    const qs = (isPeriodPosted.value && rawPostedProcessingUnlocked.value) ? '?allowPostedProcessing=true' : '';
    const resp = await api.patch(`/payroll/import-rows/${row.id}${qs}`, { unitCount: nextMinutes });
    const idx = (rawImportRows.value || []).findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      rawImportRows.value[idx] = { ...rawImportRows.value[idx], unit_count: nextMinutes };
    }
    if (resp?.data?.period) selectedPeriod.value = resp.data.period;
    if (Array.isArray(resp?.data?.summaries)) {
      const nextSummaries = resp.data.summaries.map((s) => {
        if (typeof s.breakdown === 'string') {
          try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
        }
        return s;
      });
      summaries.value = nextSummaries;
      if (selectedUserId.value) {
        const found = nextSummaries.find((x) => x.user_id === selectedUserId.value);
        if (found) selectedSummary.value = found;
      }
    }
    await loadStaging();
  } catch (e) {
    rawDraftError.value = e.response?.data?.error?.message || e.message || 'Failed to update minutes';
  } finally {
    updatingDraftPayable.value = false;
  }
};

const toggleRawProcessed = async (row, nextDone) => {
  if (!row?.id) return;
  if (isPeriodPosted.value && !rawPostedProcessingUnlocked.value) return;
  if (Number(row.requires_processing) !== 1) return;
  try {
    updatingDraftPayable.value = true;
    rawDraftError.value = '';
    const qs = (isPeriodPosted.value && rawPostedProcessingUnlocked.value) ? '?allowPostedProcessing=true' : '';
    const resp = await api.patch(`/payroll/import-rows/${row.id}${qs}`, { processed: !!nextDone });
    const idx = (rawImportRows.value || []).findIndex((r) => r.id === row.id);
    if (idx >= 0) {
      rawImportRows.value[idx] = {
        ...rawImportRows.value[idx],
        processed_at: nextDone ? (new Date().toISOString()) : null
      };
    }
    if (resp?.data?.period) selectedPeriod.value = resp.data.period;
    if (Array.isArray(resp?.data?.summaries)) {
      const nextSummaries = resp.data.summaries.map((s) => {
        if (typeof s.breakdown === 'string') {
          try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
        }
        return s;
      });
      summaries.value = nextSummaries;
      if (selectedUserId.value) {
        const found = nextSummaries.find((x) => x.user_id === selectedUserId.value);
        if (found) selectedSummary.value = found;
      }
    }
    await loadStaging();
  } catch (e) {
    rawDraftError.value = e.response?.data?.error?.message || e.message || 'Failed to update processed status';
  } finally {
    updatingDraftPayable.value = false;
  }
};

const unlockPostedRawProcessing = () => {
  if (!isPeriodPosted.value) return;
  if (!(rawMode.value === 'process_h0031' || rawMode.value === 'process_h0032')) return;
  if (rawPostedProcessingUnlocked.value) return;
  const ok = window.confirm(
    'Unlock editing for a POSTED pay period?\n\nThis will allow editing H0031/H0032 minutes and marking Done in Raw Import so you can correct time for Category-1 providers.\n\nIt does NOT automatically recompute posted payroll totals.'
  );
  if (ok) rawPostedProcessingUnlocked.value = true;
};

watch([showRawModal, rawMode, selectedPeriodId], ([open, mode]) => {
  // Default back to locked when reopening/switching.
  if (!open) rawPostedProcessingUnlocked.value = false;
  if (!(mode === 'process_h0031' || mode === 'process_h0032')) rawPostedProcessingUnlocked.value = false;
});

const periodRangeLabel = (p) => {
  if (!p) return '';
  return `${ymd(p.period_start)} → ${ymd(p.period_end)}`;
};

const anchorPayPeriodEndYmd = '2025-08-01';
const suggestedCurrentPeriodLabel = computed(() => {
  // Compute suggested current pay period based on today's date and anchor end date.
  try {
    const anchor = new Date(`${anchorPayPeriodEndYmd}T00:00:00Z`);
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // last Friday on or before today (UTC)
    const day = todayUtc.getUTCDay(); // Sunday=0 ... Friday=5
    const diffToFri = (day - 5 + 7) % 7;
    const lastFri = new Date(todayUtc.getTime());
    lastFri.setUTCDate(lastFri.getUTCDate() - diffToFri);

    const daysSinceAnchor = Math.floor((lastFri.getTime() - anchor.getTime()) / 86400000);
    const cycles = Math.floor(daysSinceAnchor / 14);
    const end = new Date(anchor.getTime());
    end.setUTCDate(end.getUTCDate() + cycles * 14);
    // Ensure end is not after lastFri
    while (end.getTime() > lastFri.getTime()) end.setUTCDate(end.getUTCDate() - 14);

    const start = new Date(end.getTime());
    start.setUTCDate(start.getUTCDate() - 13);
    const ymdUtc = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return `${ymdUtc(start)} → ${ymdUtc(end)}`;
  } catch {
    return '';
  }
});

const suggestedCurrentPeriodId = computed(() => {
  const label = suggestedCurrentPeriodLabel.value;
  if (!label) return null;
  const [start, end] = label.split('→').map((s) => String(s || '').trim());
  const match = (periods.value || []).find((p) => String(p?.period_start || '') === start && String(p?.period_end || '') === end);
  return match?.id || null;
});

const suggestedCurrentPeriodRange = computed(() => {
  const label = suggestedCurrentPeriodLabel.value;
  if (!label) return null;
  const [start, end] = label.split('→').map((s) => String(s || '').trim());
  if (!start || !end) return null;
  return { start, end, label };
});

const LS_LAST_ORG_ID = 'payroll:lastOrgId';
const lsLastPeriodKey = (agencyIdVal) => `payroll:lastPeriodId:${agencyIdVal}`;
const LS_PROCESS_CHANGES_AGGREGATE = 'payroll:processChangesAggregate:v1';

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

// ---- Process Changes aggregate (cross-agency) ----
// Persisted so super admins can switch orgs while processing and still see totals.
const processChangesAggregate = ref(
  safeJsonParse(localStorage.getItem(LS_PROCESS_CHANGES_AGGREGATE) || '[]', [])
);

const processChangesAggregateForAgency = computed(() => {
  const aid = Number(agencyId.value || 0);
  if (!aid) return [];
  const rows = Array.isArray(processChangesAggregate.value) ? processChangesAggregate.value : [];
  return rows.filter((r) => Number(r?.agencyId || 0) === aid);
});

const persistProcessChangesAggregate = () => {
  try {
    localStorage.setItem(LS_PROCESS_CHANGES_AGGREGATE, JSON.stringify(processChangesAggregate.value || []));
  } catch {
    // ignore
  }
};

const clearProcessChangesAggregate = () => {
  processChangesAggregate.value = [];
  try {
    localStorage.removeItem(LS_PROCESS_CHANGES_AGGREGATE);
  } catch {
    // ignore
  }
};

const recordProcessChangesAggregateEntry = (entry) => {
  const e = entry || {};
  const agencyIdVal = Number(e.agencyId || 0) || null;
  if (!agencyIdVal) return;
  const next = Array.isArray(processChangesAggregate.value) ? processChangesAggregate.value.slice() : [];
  // De-dupe: same agency + destination + prior => update, else append.
  const key = `${agencyIdVal}:${Number(e.destinationPeriodId || 0) || 0}:${Number(e.priorPeriodId || 0) || 0}`;
  const idx = next.findIndex((x) => String(x?.key || '') === key);
  const row = {
    key,
    agencyId: agencyIdVal,
    agencyName: String(e.agencyName || '').trim() || `Agency #${agencyIdVal}`,
    destinationPeriodId: Number(e.destinationPeriodId || 0) || null,
    destinationPeriodLabel: String(e.destinationPeriodLabel || '').trim() || '',
    priorPeriodId: Number(e.priorPeriodId || 0) || null,
    priorPeriodLabel: String(e.priorPeriodLabel || '').trim() || '',
    unitsApplied: Number(e.unitsApplied || 0) || 0,
    notesApplied: Number(e.notesApplied || 0) || 0,
    rowsInserted: Number(e.rowsInserted || 0) || 0,
    appliedAt: String(e.appliedAt || new Date().toISOString())
  };
  if (idx >= 0) next[idx] = row;
  else next.unshift(row);
  processChangesAggregate.value = next;
  persistProcessChangesAggregate();
};

const processChangesAggregateTotals = computed(() => {
  const rows = Array.isArray(processChangesAggregateForAgency.value) ? processChangesAggregateForAgency.value : [];
  let units = 0;
  let notes = 0;
  let inserted = 0;
  const agencies = new Set();
  for (const r of rows) {
    agencies.add(Number(r?.agencyId || 0));
    units += Number(r?.unitsApplied || 0) || 0;
    notes += Number(r?.notesApplied || 0) || 0;
    inserted += Number(r?.rowsInserted || 0) || 0;
  }
  return {
    agencyCount: Array.from(agencies).filter((x) => x > 0).length,
    unitsAppliedTotal: Number(units.toFixed(2)),
    notesAppliedTotal: Math.max(0, parseInt(notes, 10) || 0),
    rowsInsertedTotal: inserted
  };
});

const showOffSchedulePeriods = ref(false);

const loadPeriods = async () => {
  if (!agencyId.value) return;
  try {
    // Ensure upcoming pay periods exist so claims can be approved/targeted without waiting for a billing import.
    // Idempotent: creates only missing periods.
    await api.post('/payroll/periods/ensure-future', { months: 6, pastPeriods: 2 }, { params: { agencyId: agencyId.value } });
  const resp = await api.get('/payroll/periods', {
    params: { agencyId: agencyId.value, alignedOnly: showOffSchedulePeriods.value ? 'false' : 'true' }
  });
  periods.value = resp.data || [];
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load pay periods';
    periods.value = [];
  }
};

const selectPeriod = async (id) => {
  selectedPeriodId.value = id;
  selectedSummary.value = null;
  rateServiceCode.value = '';
  rateAmount.value = '';
  await loadPeriodDetails();
};

const loadPeriodDetails = async () => {
  if (!selectedPeriodId.value) return;
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}`);
    selectedPeriod.value = resp.data?.period || null;
    rawImportRows.value = resp.data?.rows || [];
    missedAppointmentsPaidInFull.value = resp.data?.missedAppointmentsPaidInFull || [];
    const nextSummaries = (resp.data?.summaries || []).map((s) => {
      if (typeof s.breakdown === 'string') {
        try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
      }
      return s;
    });
    summaries.value = nextSummaries;
    if (selectedUserId.value) {
      const found = nextSummaries.find((x) => x.user_id === selectedUserId.value);
      if (found) selectedSummary.value = found;
    }
    if (!previewUserId.value && summariesSortedByProvider.value.length) {
      previewUserId.value = summariesSortedByProvider.value[0].user_id;
    }
    // Staging failures should not wipe period state or break view/export modals.
    try {
      await loadStaging();
    } catch {
      // `loadStaging` already sets `stagingError`/`error`; keep the rest of the page functional.
    }
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to load pay period details';
    // Preserve the last-known selectedPeriod (or fall back to the cached period list) so modals can still mount.
    const id = Number(selectedPeriodId.value || 0);
    if (!selectedPeriod.value && id) {
      selectedPeriod.value = (periods.value || []).find((p) => Number(p?.id) === id) || null;
    }
  }
};

const openRawModal = async () => {
  if (!selectedPeriodId.value) return;
  error.value = '';
  // Open immediately so a failed refresh doesn't feel like a dead click.
  showRawModal.value = true;
  // If the raw rows haven't loaded yet (or were cleared), refresh once in the background.
  if (!Array.isArray(rawImportRows.value) || rawImportRows.value.length === 0) {
    try { await loadPeriodDetails(); } catch { /* surfaced via error.value */ }
  }
  rawProcessChecklistByRowId.value = {};
  rawRowLimit.value = 200;
};

const loadAgencyUsers = async () => {
  if (!agencyId.value) return;
  try {
    loadingUsers.value = true;
    const resp = await api.get('/payroll/agency-users', { params: { agencyId: agencyId.value } });
    agencyUsers.value = resp.data || [];
  } finally {
    loadingUsers.value = false;
  }
};

// rate sheet import removed

const loadStaging = async () => {
  if (!selectedPeriodId.value) return;
  try {
    stagingLoading.value = true;
    stagingError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/staging`);
    stagingMatched.value = (resp.data?.matched || []).filter((r) => !!r && typeof r === 'object');
    stagingUnmatched.value = (resp.data?.unmatched || []).filter((r) => !!r && typeof r === 'object');
    tierByUserId.value = resp.data?.tierByUserId || {};
    salaryByUserId.value = resp.data?.salaryByUserId || {};
    // Use persisted prior-unpaid snapshot (red column) if present.
    if (Array.isArray(resp.data?.priorStillUnpaid)) {
      carryoverPriorStillUnpaid.value = resp.data.priorStillUnpaid.map((d) => ({
        userId: d.userId,
        serviceCode: d.serviceCode,
        stillUnpaidUnits: Number(d.stillUnpaidUnits || 0),
        firstName: d.firstName,
        lastName: d.lastName,
        providerName: d.providerName
      }));
      carryoverPriorStillUnpaidMeta.value = {
        currentPeriodId: Number(selectedPeriodId.value),
        priorPeriodId: resp.data?.priorStillUnpaidMeta?.sourcePayrollPeriodId || null,
        baselineRunId: null,
        compareRunId: null
      };
    }
    seedStagingEdits();
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to load staging';
    stagingError.value = msg;
    // Ensure failures aren't silent (e.g., if stage modal isn't open yet).
    error.value = msg;
  } finally {
    stagingLoading.value = false;
  }
};

const loadHolidayHoursReport = async () => {
  if (!selectedPeriodId.value) return;
  try {
    holidayHoursLoading.value = true;
    holidayHoursError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/reports/holiday-hours`);
    holidayHoursMatched.value = (resp.data?.matched || []).filter((r) => !!r && typeof r === 'object');
    holidayHoursUnmatched.value = (resp.data?.unmatched || []).filter((r) => !!r && typeof r === 'object');
  } catch (e) {
    holidayHoursError.value = e.response?.data?.error?.message || e.message || 'Failed to load holiday hours report';
    holidayHoursMatched.value = [];
    holidayHoursUnmatched.value = [];
  } finally {
    holidayHoursLoading.value = false;
  }
};

const openHolidayHoursModal = async () => {
  showHolidayHoursModal.value = true;
  await loadHolidayHoursReport();
};

const holidayHoursProviderLabel = (r) => {
  const uid = Number(r?.user_id || 0);
  if (uid > 0) return nameForUserId(uid);
  const raw = String(r?.provider_name || '').trim();
  return raw || '—';
};

const beginStageCarryoverEdit = () => {
  stageCarryoverEditMode.value = true;
  const nextCarry = {};
  const nextPrior = {};
  for (const r of stagingMatched.value || []) {
    if (!r?.userId || !r?.serviceCode) continue;
    const k = stagingKey(r);
    nextCarry[k] = Number(r?.carryover?.oldDoneNotesUnits || 0);
    // prefer backend-provided persisted value if present
    nextPrior[k] = Number(r?.carryover?.priorStillUnpaidUnits || 0);
  }
  stageCarryoverEdits.value = nextCarry;
  stagePriorUnpaidEdits.value = nextPrior;
};

const cancelStageCarryoverEdit = () => {
  stageCarryoverEditMode.value = false;
  stageCarryoverEdits.value = {};
  stagePriorUnpaidEdits.value = {};
};

const saveStageCarryoverEdits = async () => {
  if (!selectedPeriodId.value) return;
  try {
    savingStageCarryoverEdits.value = true;
    stagingError.value = '';
    const rows = Object.entries(stageCarryoverEdits.value || {}).map(([k, v]) => {
      const [userId, serviceCode] = String(k).split(':');
      return { userId: Number(userId), serviceCode, carryoverFinalizedUnits: Number(v || 0) };
    });
    const doApply = async (params) => {
      const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/carryover/apply`, { rows }, { params });
      return resp?.data || null;
    };
    try {
      await doApply(undefined);
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || '';
      // Catch-up workflow: allow explicit bypass of H0031/H0032 processing gates for carryover edits.
      if (e.response?.status === 409 && (String(msg).includes('H0031') || String(msg).includes('H0032') || e.response?.data?.pendingProcessing)) {
        const ok = window.confirm(
          'Old Done Notes is blocked by H0031/H0032 processing requirements.\n\nSave anyway (skip processing gate)?\n\nUse this only for catch-up/backfill. You must verify/correct final units in the destination payroll stage before running payroll.'
        );
        if (!ok) throw e;
        await doApply({ skipProcessingGate: 'true' });
      } else {
        throw e;
      }
    }
    await loadStaging();
  } catch (e) {
    stagingError.value = e.response?.data?.error?.message || e.message || 'Failed to save Old Done Notes edits';
  } finally {
    savingStageCarryoverEdits.value = false;
  }
};

const saveStagePriorUnpaidEdits = async () => {
  if (!selectedPeriodId.value) return;
  try {
    savingStagePriorUnpaidEdits.value = true;
    priorStillUnpaidStageError.value = '';
    const rows = Object.entries(stagePriorUnpaidEdits.value || {}).map(([k, v]) => {
      const [userId, serviceCode] = String(k).split(':');
      return { userId: Number(userId), serviceCode, stillUnpaidUnits: Number(v || 0) };
    });
    await api.put(`/payroll/periods/${selectedPeriodId.value}/prior-unpaid`, {
      sourcePayrollPeriodId: carryoverPriorStillUnpaidMeta.value?.priorPeriodId || null,
      rows
    });
    await loadStaging();
  } catch (e) {
    priorStillUnpaidStageError.value = e.response?.data?.error?.message || e.message || 'Failed to save Prior still unpaid edits';
  } finally {
    savingStagePriorUnpaidEdits.value = false;
  }
};

const selectedTier = computed(() => {
  const uid = selectedUserId.value;
  if (!uid) return null;
  return tierByUserId.value?.[uid] || null;
});

const payrollStageTierSort = ref('tier_desc'); // tier_desc | tier_asc | name_asc

const payrollStageProviderTierRows = computed(() => {
  const rows = rawImportRows.value || [];

  const matchedUserIds = new Set();
  const unmatchedNames = new Set();
  for (const r of rows || []) {
    const uid = Number(r?.user_id || r?.userId || 0);
    if (Number.isFinite(uid) && uid > 0) matchedUserIds.add(uid);
    else {
      const nm = String(r?.provider_name || r?.providerName || '').trim();
      if (nm) unmatchedNames.add(nm);
    }
  }

  const out = [];
  for (const uid of Array.from(matchedUserIds)) {
    const tier = tierByUserId.value?.[uid] || null;
    const sal = salaryByUserId.value?.[uid] || null;
    const currentTierLevel = Number(tier?.currentPeriodTierLevel ?? tier?.rolling?.displayTierLevel ?? tier?.tierLevel ?? 0);
    const lastTierLevel = Number(tier?.lastPayPeriodTierLevel ?? tier?.rolling?.lastPayPeriod?.tierLevel ?? 0);
    const graceActive = Number(tier?.graceActive || 0) === 1;
    const currentStatus = graceActive ? 'Grace' : (currentTierLevel >= 1 ? 'Current' : 'Out of Compliance');
    const salaryAmount = (sal && typeof sal === 'object' && sal.salaryAmount !== undefined && sal.salaryAmount !== null)
      ? Number(sal.salaryAmount || 0)
      : null;
    const salaryTooltip = (() => {
      if (!sal || typeof sal !== 'object') return '';
      const rec = Number(sal.recordId || 0);
      const per = Number(sal.salaryPerPayPeriod || 0);
      const inc = !!sal.includeServicePay;
      const pro = !!sal.prorateByDays;
      const ad = Number(sal.activeDays || 0);
      const pd = Number(sal.periodDays || 0);
      const parts = [];
      if (rec) parts.push(`Salary record #${rec}`);
      if (per > 0) parts.push(`Per pay period: ${fmtMoney(per)}`);
      parts.push(`Include service pay: ${inc ? 'Yes' : 'No'}`);
      if (pro && pd > 0 && ad > 0) parts.push(`Prorated: ${ad}/${pd} days`);
      return parts.join(' • ');
    })();
    out.push({
      key: `u:${uid}`,
      userId: uid,
      name: nameForUserId(uid),
      salaryAmount,
      salaryTooltip,
      tierLevel: currentTierLevel,
      currentLabel: currentTierLevel >= 1 ? `Tier ${currentTierLevel}` : 'Out of Compliance',
      currentStatus,
      currentTooltip: tier?.label || tier?.status || '',
      lastTierLabel: lastTierLevel >= 1 ? `Tier ${lastTierLevel}` : '—'
    });
  }

  out.sort((a, b) => {
    const byName = String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
    const byTierAsc = (Number(a.tierLevel || 0) - Number(b.tierLevel || 0)) || byName;
    const byTierDesc = (Number(b.tierLevel || 0) - Number(a.tierLevel || 0)) || byName;
    switch (String(payrollStageTierSort.value || 'tier_desc')) {
      case 'tier_asc':
        return byTierAsc;
      case 'name_asc':
        return byName;
      case 'tier_desc':
      default:
        return byTierDesc;
    }
  });

  const unmatched = Array.from(unmatchedNames).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return { matched: out, unmatched };
});

const loadServiceCodeRules = async () => {
  if (!agencyId.value) return;
  try {
    serviceCodeRulesLoading.value = true;
    serviceCodeRulesError.value = '';
    const resp = await api.get('/payroll/service-code-rules', { params: { agencyId: agencyId.value } });
    serviceCodeRules.value = resp.data || [];
  } catch (e) {
    serviceCodeRulesError.value = e.response?.data?.error?.message || e.message || 'Failed to load service code rules';
    serviceCodeRules.value = [];
  } finally {
    serviceCodeRulesLoading.value = false;
  }
};

const restoreSelectionFromStorage = async () => {
  // If browser restored <select> UI without Vue state, force Vue state from localStorage or defaults.
  try {
    if (!selectedOrgId.value) {
      const savedOrg = localStorage.getItem(LS_LAST_ORG_ID);
      if (savedOrg) selectedOrgId.value = Number(savedOrg) || null;
    }
  } catch { /* ignore */ }

  // Wait for periods to be loaded for current agency before picking a period.
  if (!agencyId.value || !(periods.value || []).length) return;
  if (selectedPeriodId.value) {
    // If Vue state is set (or browser restored the UI) but no watcher fired, force-load details.
    if (selectedPeriod.value?.id !== selectedPeriodId.value) {
      await loadPeriodDetails();
    }
    return;
  }

  try {
    const savedPeriod = localStorage.getItem(lsLastPeriodKey(agencyId.value));
    const savedId = savedPeriod ? Number(savedPeriod) : null;
    const exists = savedId && (periods.value || []).some((p) => p.id === savedId);
    if (exists) {
      selectedPeriodId.value = savedId;
      await loadPeriodDetails();
      return;
    }
  } catch { /* ignore */ }

  // Default: most recent period by end date (same sort logic as UI).
  const ordered = (sortedPeriods.value || []).slice();
  const mostRecentNonDraft = ordered.find((p) => String(p?.status || '').toLowerCase() !== 'draft') || null;
  const mostRecent = mostRecentNonDraft || ordered[0] || null;
  if (mostRecent?.id) {
    selectedPeriodId.value = mostRecent.id;
    await loadPeriodDetails();
  }
};

const seedStagingEdits = () => {
  const next = {};
  for (const r of stagingMatched.value || []) {
    if (!r?.userId || !r?.serviceCode) continue;
    const base = r.override ? {
      noNoteUnits: Number(r.override.noNoteUnits ?? 0),
      draftUnits: Number(r.override.draftUnits ?? 0),
      finalizedUnits: Number(r.override.finalizedUnits ?? 0)
    } : (r.raw || { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 });
    next[stagingKey(r)] = {
      noNoteUnits: String(base.noNoteUnits ?? 0),
      draftUnits: String(base.draftUnits ?? 0),
      finalizedUnits: String(base.finalizedUnits ?? 0)
    };
  }
  stagingEdits.value = next;
  // Keep a snapshot so we can detect unsaved edits and preserve them across reruns.
  stagingEditsBaseline.value = JSON.parse(JSON.stringify(next));
};

const dirtyStagingKeys = computed(() => {
  const keys = new Set([
    ...Object.keys(stagingEdits.value || {}),
    ...Object.keys(stagingEditsBaseline.value || {})
  ]);
  const dirty = [];
  for (const k of keys) {
    const cur = stagingEdits.value?.[k] || null;
    const base = stagingEditsBaseline.value?.[k] || null;
    if (!cur || !base) continue;
    if (String(cur.noNoteUnits) !== String(base.noNoteUnits) ||
        String(cur.draftUnits) !== String(base.draftUnits) ||
        String(cur.finalizedUnits) !== String(base.finalizedUnits)) {
      dirty.push(k);
    }
  }
  return dirty;
});

const saveAllDirtyStagingEdits = async () => {
  if (!selectedPeriodId.value) return;
  const keys = dirtyStagingKeys.value || [];
  if (!keys.length) return;
  try {
    savingStaging.value = true;
    stagingError.value = '';
    for (const k of keys) {
      const [userIdStr, serviceCode] = String(k).split(':');
      const row = stagingEdits.value?.[k];
      if (!row) continue;
      await api.patch(`/payroll/periods/${selectedPeriodId.value}/staging`, {
        userId: Number(userIdStr),
        serviceCode,
        noNoteUnits: Number(row.noNoteUnits),
        draftUnits: Number(row.draftUnits),
        finalizedUnits: Number(row.finalizedUnits)
      });
      // Update baseline for that key after successful save
      if (stagingEditsBaseline.value?.[k]) {
        stagingEditsBaseline.value[k] = { ...stagingEdits.value[k] };
      }
    }
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message || 'Failed to save staging edits';
    stagingError.value = msg;
    error.value = msg;
    throw e;
  } finally {
    savingStaging.value = false;
  }
};

const carryoverCompareOptions = computed(() => {
  const all = (periods.value || []).filter((p) => p?.id && p.id !== selectedPeriodId.value);
  // Prefer earlier periods (by end date desc in list, but this dropdown should include all prior)
  all.sort((a, b) => String(b?.period_end || '').localeCompare(String(a?.period_end || '')));
  return all;
});

const defaultPriorPeriodId = computed(() => {
  // Choose the most recent period that ends before the current period end (if possible).
  const curEnd = String(selectedPeriod.value?.period_end || '');
  const options = carryoverCompareOptions.value || [];
  const prior = options.find((p) => String(p?.period_end || '') < curEnd) || options[0] || null;
  return prior?.id || null;
});

const openCarryoverModal = async () => {
  showCarryoverModal.value = true;
  carryoverError.value = '';
  carryoverApplyResult.value = null;
  carryoverPreview.value = [];
  carryoverPriorStillUnpaid.value = [];
  carryoverPriorStillUnpaidMeta.value = null;
  carryoverRuns.value = [];
  carryoverBaselineRunId.value = null;
  carryoverCompareRunId.value = null;
  manualCarryoverEnabled.value = false;
  manualCarryover.value = { userId: null, serviceCode: '', oldDoneNotesUnits: '' };
  carryoverPriorPeriodId.value = defaultPriorPeriodId.value;
  if (carryoverPriorPeriodId.value) {
    await loadCarryoverRuns();
    await loadCarryoverPreview();
  }
};

const openCarryoverForPrior = async () => {
  if (!lastImportedPeriodId.value || !applyToCurrentPeriodId.value) {
    openCarryoverModal();
    return;
  }
  // Ensure the "current" period is selected for applying carryover.
  if (selectedPeriodId.value !== applyToCurrentPeriodId.value) {
    await selectPeriod(applyToCurrentPeriodId.value);
  }
  showCarryoverModal.value = true;
  carryoverError.value = '';
  carryoverApplyResult.value = null;
  carryoverPreview.value = [];
  carryoverPriorStillUnpaid.value = [];
  carryoverPriorStillUnpaidMeta.value = null;
  carryoverRuns.value = [];
  carryoverBaselineRunId.value = null;
  carryoverCompareRunId.value = null;
  carryoverPriorPeriodId.value = lastImportedPeriodId.value;
  await loadCarryoverRuns();
  await loadCarryoverPreview();
};

const loadCarryoverRuns = async () => {
  if (!carryoverPriorPeriodId.value) return;
  const resp = await api.get(`/payroll/periods/${carryoverPriorPeriodId.value}/runs`);
  carryoverRuns.value = resp.data || [];
  if (carryoverRuns.value.length) {
    carryoverBaselineRunId.value = carryoverRuns.value[0].id;
    carryoverCompareRunId.value = carryoverRuns.value[carryoverRuns.value.length - 1].id;
  }
};

const loadPriorStillUnpaidForStage = async () => {
  if (!selectedPeriodId.value) return;
  try {
    loadingPriorStillUnpaidForStage.value = true;
    priorStillUnpaidStageError.value = '';

    const priorId = defaultPriorPeriodId.value || null;
    if (!priorId) {
      carryoverPriorStillUnpaid.value = [];
      carryoverPriorStillUnpaidMeta.value = null;
      return;
    }

    // Choose baseline+compare runs from the prior period (first and last).
    const runsResp = await api.get(`/payroll/periods/${priorId}/runs`);
    const runs = runsResp.data || [];
    if (!runs.length) {
      carryoverPriorStillUnpaid.value = [];
      carryoverPriorStillUnpaidMeta.value = { currentPeriodId: Number(selectedPeriodId.value), priorPeriodId: Number(priorId), baselineRunId: null, compareRunId: null };
      return;
    }
    const baselineId = runs[0].id;
    const compareId = runs[runs.length - 1].id;

    const previewResp = await api.get(`/payroll/periods/${selectedPeriodId.value}/carryover/preview`, {
      params: { priorPeriodId: priorId, baselineRunId: baselineId, compareRunId: compareId }
    });

    const still = Array.isArray(previewResp.data?.stillUnpaid) ? previewResp.data.stillUnpaid : [];
    carryoverPriorStillUnpaid.value = still.map((d) => ({
      userId: d.userId,
      serviceCode: d.serviceCode,
      stillUnpaidUnits: Number(d.stillUnpaidUnits || 0),
      firstName: d.firstName,
      lastName: d.lastName,
      providerName: d.providerName
    }));
    carryoverPriorStillUnpaidMeta.value = {
      currentPeriodId: Number(selectedPeriodId.value),
      priorPeriodId: Number(priorId),
      baselineRunId: Number(baselineId),
      compareRunId: Number(compareId)
    };
  } catch (e) {
    priorStillUnpaidStageError.value = e.response?.data?.error?.message || e.message || 'Failed to load prior unpaid snapshot';
  } finally {
    loadingPriorStillUnpaidForStage.value = false;
  }
};

const loadCarryoverPreview = async () => {
  if (!selectedPeriodId.value || !carryoverPriorPeriodId.value || !carryoverBaselineRunId.value || !carryoverCompareRunId.value) return;
  try {
    carryoverLoading.value = true;
    carryoverError.value = '';
    carryoverDraftReview.value = [];
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/carryover/preview`, {
      params: {
        priorPeriodId: carryoverPriorPeriodId.value,
        baselineRunId: carryoverBaselineRunId.value,
        compareRunId: carryoverCompareRunId.value
      }
    });
    const deltas = resp.data?.deltas || [];
    carryoverPreview.value = deltas.map((d) => ({
      ...d,
      firstName: d.firstName,
      lastName: d.lastName
    }));
    carryoverDraftReview.value = Array.isArray(resp.data?.draftReview) ? resp.data.draftReview : [];

    // Track rows that are STILL unpaid in the prior period after the selected comparison run.
    // Backend provides this explicitly because `deltas` only includes rows where finalized increased.
    const still = Array.isArray(resp.data?.stillUnpaid) ? resp.data.stillUnpaid : null;
    if (still) {
      carryoverPriorStillUnpaid.value = still.map((d) => ({
        userId: d.userId,
        serviceCode: d.serviceCode,
        stillUnpaidUnits: Number(d.stillUnpaidUnits || 0),
        firstName: d.firstName,
        lastName: d.lastName,
        providerName: d.providerName
      }));
    } else {
      // Backward compatible fallback (older backend)
      carryoverPriorStillUnpaid.value = (deltas || [])
        .filter((d) => !!d?.userId && !!d?.serviceCode && Number(d?.currUnpaidUnits || 0) > 0)
        .map((d) => ({
          userId: d.userId,
          serviceCode: d.serviceCode,
          stillUnpaidUnits: Number(d.currUnpaidUnits || 0),
          firstName: d.firstName,
          lastName: d.lastName,
          providerName: d.providerName
        }));
    }
    carryoverPriorStillUnpaidMeta.value = {
      currentPeriodId: Number(selectedPeriodId.value),
      priorPeriodId: Number(carryoverPriorPeriodId.value),
      baselineRunId: Number(carryoverBaselineRunId.value),
      compareRunId: Number(carryoverCompareRunId.value)
    };
  } catch (e) {
    carryoverError.value = e.response?.data?.error?.message || e.message || 'Failed to compute differences';
  } finally {
    carryoverLoading.value = false;
  }
};

watch(carryoverPriorPeriodId, async () => {
  if (!showCarryoverModal.value) return;
  try {
    carryoverLoading.value = true;
    carryoverError.value = '';
    carryoverPreview.value = [];
    carryoverDraftReview.value = [];
    carryoverDraftReviewSearch.value = '';
    carryoverPriorStillUnpaid.value = [];
    carryoverPriorStillUnpaidMeta.value = null;
    await loadCarryoverRuns();
  } catch (e) {
    carryoverError.value = e.response?.data?.error?.message || e.message || 'Failed to load prior period runs';
  } finally {
    carryoverLoading.value = false;
  }
  await loadCarryoverPreview();
});

watch([carryoverBaselineRunId, carryoverCompareRunId], async () => {
  if (!showCarryoverModal.value) return;
  await loadCarryoverPreview();
});

const applyCarryover = async () => {
  if (!selectedPeriodId.value || !carryoverPriorPeriodId.value || !(carryoverPreview.value || []).length) return;
  try {
    applyingCarryover.value = true;
    carryoverError.value = '';
    carryoverApplyResult.value = null;
    const keyed = new Map(); // `${userId}:${CODE}` -> merged row
    for (const d of (carryoverPreview.value || [])) {
      const userId = Number(d?.userId || 0);
      const serviceCode = String(d?.serviceCode || '').trim().toUpperCase();
      const units = Number(d?.carryoverFinalizedUnits || 0);
      const noteCount = Number(d?.noteCount || 0);
      if (!userId || !serviceCode || !(units > 1e-9)) continue;

      const patchMeta =
        d?.type === 'code_changed'
          ? { categories: { code_changed: { units, notes: noteCount, fromCodes: [d?.fromServiceCode].filter(Boolean) } } }
          : (d?.type === 'late_added_service'
            ? { categories: { late_addition: { units, notes: noteCount } } }
            : (d?.type === 'late_note_completion'
              ? { categories: { old_note: { units, notes: noteCount } } }
              : null));

      const k = `${userId}:${serviceCode}`;
      if (!keyed.has(k)) {
        keyed.set(k, {
          userId,
          serviceCode,
          carryoverFinalizedUnits: 0,
          carryoverFinalizedRowCount: 0,
          carryoverMeta: null
        });
      }
      const t = keyed.get(k);
      t.carryoverFinalizedUnits = Number((Number(t.carryoverFinalizedUnits || 0) + units).toFixed(2));
      t.carryoverFinalizedRowCount = Math.max(0, parseInt(Number(t.carryoverFinalizedRowCount || 0) + (noteCount || 0), 10) || 0);

      if (patchMeta && !t.carryoverMeta) {
        t.carryoverMeta = { categories: { old_note: { units: 0, notes: 0 }, late_addition: { units: 0, notes: 0 }, code_changed: { units: 0, notes: 0, fromCodes: [] } } };
      }
      const cats = (t.carryoverMeta && t.carryoverMeta.categories) ? t.carryoverMeta.categories : null;
      const patchCats = patchMeta?.categories || null;
      if (cats && patchCats) {
        if (patchCats.old_note) {
          cats.old_note.units = Number((Number(cats.old_note.units || 0) + Number(patchCats.old_note.units || 0)).toFixed(2));
          cats.old_note.notes = Math.max(0, parseInt(Number(cats.old_note.notes || 0) + Number(patchCats.old_note.notes || 0), 10) || 0);
        }
        if (patchCats.late_addition) {
          cats.late_addition.units = Number((Number(cats.late_addition.units || 0) + Number(patchCats.late_addition.units || 0)).toFixed(2));
          cats.late_addition.notes = Math.max(0, parseInt(Number(cats.late_addition.notes || 0) + Number(patchCats.late_addition.notes || 0), 10) || 0);
        }
        if (patchCats.code_changed) {
          cats.code_changed.units = Number((Number(cats.code_changed.units || 0) + Number(patchCats.code_changed.units || 0)).toFixed(2));
          cats.code_changed.notes = Math.max(0, parseInt(Number(cats.code_changed.notes || 0) + Number(patchCats.code_changed.notes || 0), 10) || 0);
          const from = Array.isArray(cats.code_changed.fromCodes) ? cats.code_changed.fromCodes : [];
          const add = Array.isArray(patchCats.code_changed.fromCodes) ? patchCats.code_changed.fromCodes : [];
          const merged = Array.from(new Set([...from, ...add].map((x) => String(x || '').trim()).filter(Boolean)));
          cats.code_changed.fromCodes = merged;
        }
      }
    }

    const rows = Array.from(keyed.values()).filter((r) => Number(r?.carryoverFinalizedUnits || 0) > 1e-9);

    const unitsApplied = (rows || []).reduce((acc, r) => acc + (Number(r?.carryoverFinalizedUnits || 0) || 0), 0);
    const notesApplied = (rows || []).reduce((acc, r) => acc + (Number(r?.carryoverFinalizedRowCount || 0) || 0), 0);

    const doApply = async (params) => {
      const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/carryover/apply`, { rows }, { params });
      return resp?.data || null;
    };

    // IMPORTANT: Express json parser is strict; do not send `null`.
    try {
      const data = await doApply({
        priorPeriodId: carryoverPriorPeriodId.value,
        baselineRunId: carryoverBaselineRunId.value || undefined,
        compareRunId: carryoverCompareRunId.value || undefined
      });
      carryoverApplyResult.value = data ? { inserted: Number(data.inserted || 0), warnings: data.warnings || [] } : { inserted: rows.length, warnings: [] };
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || '';
      // Catch-up workflow: allow explicit bypass of H0031/H0032 processing gates for carryover apply.
      if (e.response?.status === 409 && (String(msg).includes('H0031') || String(msg).includes('H0032') || e.response?.data?.pendingProcessing)) {
        const ok = window.confirm(
          'Carryover is blocked by H0031/H0032 processing requirements.\n\nApply carryover anyway (skip processing gate)?\n\nUse this only for catch-up/backfill. You must verify/correct final units in the destination payroll stage before running payroll.'
        );
        if (ok) {
          const data2 = await doApply({
            priorPeriodId: carryoverPriorPeriodId.value,
            baselineRunId: carryoverBaselineRunId.value || undefined,
            compareRunId: carryoverCompareRunId.value || undefined,
            skipProcessingGate: 'true'
          });
          carryoverApplyResult.value = data2 ? { inserted: Number(data2.inserted || 0), warnings: data2.warnings || [] } : { inserted: rows.length, warnings: [] };
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    // Record cross-agency aggregate so users can switch agencies and still see totals.
    try {
      const a = agencyStore.currentAgency?.value || agencyStore.currentAgency;
      const agencyName = String(a?.name || '').trim();
      const destLabel = selectedPeriodForUi.value ? periodRangeLabel(selectedPeriodForUi.value) : '';
      const prior = (periods.value || []).find((p) => Number(p?.id) === Number(carryoverPriorPeriodId.value)) || null;
      const priorLabel = prior ? periodRangeLabel(prior) : (carryoverPriorPeriodId.value ? `Period #${carryoverPriorPeriodId.value}` : '');
      recordProcessChangesAggregateEntry({
        agencyId: agencyId.value,
        agencyName: agencyName || undefined,
        destinationPeriodId: selectedPeriodId.value,
        destinationPeriodLabel: destLabel || undefined,
        priorPeriodId: carryoverPriorPeriodId.value,
        priorPeriodLabel: priorLabel || undefined,
        unitsApplied: Number(unitsApplied.toFixed(2)),
        notesApplied: Math.max(0, parseInt(notesApplied, 10) || 0),
        rowsInserted: Number(carryoverApplyResult.value?.inserted || 0) || rows.length
      });
    } catch {
      // ignore (best-effort)
    }

    await loadStaging();
  } catch (e) {
    carryoverError.value = e.response?.data?.error?.message || e.message || 'Failed to apply differences';
  } finally {
    applyingCarryover.value = false;
  }
};

const addManualCarryoverRow = () => {
  carryoverError.value = '';
  const userId = manualCarryover.value.userId;
  const serviceCode = String(manualCarryover.value.serviceCode || '').trim();
  const carry = Number(manualCarryover.value.oldDoneNotesUnits);

  if (!userId) {
    carryoverError.value = 'Select a provider for the manual row.';
    return;
  }
  if (!serviceCode) {
    carryoverError.value = 'Enter a service code for the manual row.';
    return;
  }
  if (!Number.isFinite(carry) || carry <= 1e-9) {
    carryoverError.value = 'Old Done Notes units must be a positive number.';
    return;
  }

  const u = (agencyUsers.value || []).find((x) => x.id === userId) || null;
  const firstName = u?.first_name || null;
  const lastName = u?.last_name || null;
  const providerName = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : null;

  const next = (carryoverPreview.value || []).slice();
  next.push({
    userId,
    serviceCode,
    // Keep these populated for table display even though we’re manually forcing the carryover.
    prevUnpaidUnits: Number(carry.toFixed(2)),
    currUnpaidUnits: 0,
    prevFinalizedUnits: null,
    currFinalizedUnits: null,
    finalizedDelta: null,
    carryoverFinalizedUnits: Number(carry.toFixed(2)),
    type: 'manual',
    flagged: 0,
    firstName,
    lastName,
    providerName
  });
  carryoverPreview.value = next;
  manualCarryover.value = { userId: null, serviceCode: '', oldDoneNotesUnits: '' };
};

const removeCarryoverRow = (idx) => {
  const next = (carryoverPreview.value || []).slice();
  next.splice(idx, 1);
  carryoverPreview.value = next;
};

const downloadRawCsv = async () => {
  if (!selectedPeriodId.value) return;
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/raw.csv`, { responseType: 'blob' });
    const blob = new Blob([resp.data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-raw-period-${selectedPeriodId.value}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download raw CSV';
  }
};

const downloadExportCsv = async () => {
  if (!selectedPeriodId.value) return;
  try {
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/export.csv`, { responseType: 'blob' });
    const blob = new Blob([resp.data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-export-period-${selectedPeriodId.value}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to download export CSV';
  }
};

// Some large sections (including the Run/Preview modals) are currently nested under provider-selection UI.
// Ensure we have a selected provider before opening those modals so the modal DOM is mounted.
const ensureProviderSelectedForModals = async () => {
  if (selectedUserId.value) return;
  const list = (summariesSortedByProvider.value || []).slice();
  const first = list[0] || null;
  const uid = first?.user_id || null;
  if (!uid) return;
  selectedUserId.value = uid;
  selectedSummary.value = (summaries.value || []).find((s) => s.user_id === uid) || null;
  if (!previewUserId.value) previewUserId.value = uid;
  await nextTick();
};

// Explicit open handlers (some browsers + forms can swallow plain ref-assign clicks)
const openRunResultsModal = async () => {
  if (!selectedPeriodId.value) return;
  error.value = '';
  await ensureProviderSelectedForModals();
  showRunModal.value = true; // open immediately
  if (!canSeeRunResults.value) {
    // Still open the modal (it will show "No run results yet"), but show an explicit message.
    error.value = 'No run results yet for this pay period. Click Run Payroll first.';
    return;
  }
  // Best-effort; do not block modal open if this fails.
  try { await loadImmediatePriorSummaries(); } catch { /* ignore */ }
};

const openPreviewPostModal = async () => {
  if (!selectedPeriodId.value) return;
  error.value = '';
  await ensureProviderSelectedForModals();
  showPreviewPostModal.value = true; // open immediately
  if (!canSeeRunResults.value) {
    error.value = 'No run results yet for this pay period. Click Run Payroll first.';
    return;
  }
  try { await loadImmediatePriorSummaries(); } catch { /* ignore */ }
};

const exportPayrollCsv = async () => {
  if (!selectedPeriodId.value) return;
  error.value = '';
  if (!canSeeRunResults.value) {
    // Try anyway; backend will respond with a helpful error if it can't export.
    error.value = 'This pay period has no run results yet. Export may fail until you Run Payroll.';
  }
  await downloadExportCsv();
};

const onFilePick = (evt) => {
  importFile.value = evt.target.files?.[0] || null;
  detectedPeriodHint.value = '';
  autoDetectResult.value = null;
};

const autoImport = async () => {
  try {
    if (!agencyId.value) {
      error.value = 'Select an organization first.';
      return;
    }
    if (!importFile.value) return;
    error.value = '';
    autoDetecting.value = true;
    unmatchedProviders.value = [];
    createdUsers.value = [];
    detectedPeriodHint.value = '';

    const fd = new FormData();
    fd.append('file', importFile.value);
    fd.append('agencyId', String(agencyId.value));
    const resp = await api.post('/payroll/periods/auto/detect', fd);
    autoDetectResult.value = resp.data || null;
    const detected = autoDetectResult.value?.detected;
    if (detected?.periodStart && detected?.periodEnd) {
      detectedPeriodHint.value = `Detected pay period: ${detected.periodStart} → ${detected.periodEnd} (Sat→Fri, 14 days). Please confirm.`;
    }
    // Default confirmation choice
    autoImportChoiceMode.value = 'detected';
    autoImportExistingPeriodId.value = autoDetectResult.value?.existingPeriodId || null;
    confirmAutoImportOpen.value = true;
  } catch (e) {
    error.value = formatPayrollImportError(e, 'Failed to auto-import payroll report');
  } finally {
    autoDetecting.value = false;
  }
};

const confirmAutoImport = async () => {
  try {
    if (!agencyId.value) return;
    if (!importFile.value) return;
    error.value = '';
    autoImporting.value = true;
    createdUsers.value = [];
    unmatchedProviders.value = [];

    let targetPeriodId = null;
    if (autoImportChoiceMode.value === 'existing') {
      targetPeriodId = autoImportExistingPeriodId.value;
      if (!targetPeriodId) {
        error.value = 'Select an existing pay period.';
        return;
      }
    } else {
      // detected
      if (!autoDetectResult.value?.detected?.periodStart || !autoDetectResult.value?.detected?.periodEnd) {
        error.value = 'No detected pay period available. Choose an existing period.';
        return;
      }
      targetPeriodId = autoImportExistingPeriodId.value;
      if (!targetPeriodId) {
        error.value = 'No existing pay period matched the detected period. Choose an existing pay period (or sync future drafts / show off-schedule periods).';
        return;
      }
    }
    if (!targetPeriodId) {
      error.value = 'Could not determine a pay period to import into.';
      return;
    }

    // Import into the selected/created period.
    selectedPeriodId.value = targetPeriodId;
    await uploadCsv();
    confirmAutoImportOpen.value = false;
  } finally {
    autoImporting.value = false;
  }
};

const uploadCsv = async () => {
  try {
    error.value = '';
    importing.value = true;
    unmatchedProviders.value = [];
    createdUsers.value = [];
    const fd = new FormData();
    fd.append('file', importFile.value);
    const resp = await api.post(`/payroll/periods/${selectedPeriodId.value}/import`, fd);
    createdUsers.value = resp.data?.createdUsers || [];
    unmatchedProviders.value = Array.from(new Set(resp.data?.unmatchedProvidersSample || []));
    importFile.value = null;
    lastImportedPeriodId.value = selectedPeriodId.value;
    await loadPeriodDetails();
  } catch (e) {
    error.value = formatPayrollImportError(e, 'Failed to import payroll report');
  } finally {
    importing.value = false;
  }
};

// Manual import should use the SAME confirmation modal as auto-detect.
// This lets admins override dates or choose a different pay period before importing.
const openImportConfirmModal = async () => {
  if (!importFile.value) return;
  if (!agencyId.value) return;

  // Detect in the background so we can pre-select the "right" existing pay period,
  // but never create a pay period from this flow.
  error.value = '';
  autoDetecting.value = true;
  detectedPeriodHint.value = '';
  autoDetectResult.value = null;

  try {
    const fd = new FormData();
    fd.append('file', importFile.value);
    fd.append('agencyId', String(agencyId.value));
    const resp = await api.post('/payroll/periods/auto/detect', fd);
    autoDetectResult.value = resp.data || null;

    const detected = autoDetectResult.value?.detected;
    if (detected?.periodStart && detected?.periodEnd) {
      detectedPeriodHint.value = `Detected pay period: ${detected.periodStart} → ${detected.periodEnd} (Sat→Fri, 14 days). Please confirm.`;
    }
  } catch (e) {
    // If detect fails, still allow manual selection via existing periods.
    autoDetectResult.value = null;
  } finally {
    autoDetecting.value = false;
  }

  // Default selection:
  // - Prefer the detected match (existingPeriodId)
  // - Otherwise fall back to the currently selected pay period
  autoImportExistingPeriodId.value = autoDetectResult.value?.existingPeriodId || selectedPeriodId.value || null;
  autoImportChoiceMode.value = autoDetectResult.value?.detected ? 'detected' : 'existing';
  confirmAutoImportOpen.value = true;
};

const selectSummary = (s) => {
  selectedSummary.value = s;
  selectedUserId.value = s.user_id;
  loadAdjustments();
  loadRateCard();
};

const clearSelectedProvider = () => {
  selectedUserId.value = null;
  selectedSummary.value = null;
};

const nextProvider = () => {
  const ids = (sortedAgencyUsers.value || []).map((u) => u.id).filter(Boolean);
  if (!ids.length) return;
  if (!selectedUserId.value) {
    selectedUserId.value = ids[0];
    selectedSummary.value = (summaries.value || []).find((x) => x.user_id === selectedUserId.value) || null;
    return;
  }
  const idx = ids.indexOf(selectedUserId.value);
  const nextIdx = idx >= 0 ? (idx + 1) % ids.length : 0;
  selectedUserId.value = ids[nextIdx];
  selectedSummary.value = (summaries.value || []).find((x) => x.user_id === selectedUserId.value) || null;
};

const openSubmitOnBehalfModal = async () => {
  showSubmitOnBehalfModal.value = true;
  // Ensure provider list is available (shared with staging selector).
  try {
    if (agencyId.value && !(agencyUsers.value || []).length && !loadingUsers.value) {
      await loadAgencyUsers();
    }
  } catch {
    // ignore; UI will show loading/errors elsewhere
  }
};

const closeSubmitOnBehalfModal = () => {
  showSubmitOnBehalfModal.value = false;
};

const clearSubmitOnBehalfProvider = () => {
  submitOnBehalfUserId.value = null;
};

const nextSubmitOnBehalfProvider = () => {
  const ids = (submitOnBehalfUsers.value || []).map((u) => u.id).filter(Boolean);
  if (!ids.length) return;
  if (!submitOnBehalfUserId.value || !ids.includes(submitOnBehalfUserId.value)) {
    submitOnBehalfUserId.value = ids[0];
    return;
  }
  const idx = ids.indexOf(submitOnBehalfUserId.value);
  const nextIdx = idx >= 0 ? (idx + 1) % ids.length : 0;
  submitOnBehalfUserId.value = ids[nextIdx];
};

const nextRunProvider = () => {
  const list = (summariesSortedByProvider.value || []).slice();
  if (!list.length) return;
  // If nothing selected yet, select first.
  if (!selectedSummary.value) {
    selectSummary(list[0]);
    return;
  }
  const idx = list.findIndex((s) => s.id === selectedSummary.value?.id);
  const nextIdx = idx >= 0 ? (idx + 1) % list.length : 0;
  selectSummary(list[nextIdx]);
};

const nextPreviewProvider = () => {
  const list = (summariesSortedByProvider.value || []).slice();
  if (!list.length) return;
  if (!previewUserId.value) {
    previewUserId.value = list[0].user_id;
    return;
  }
  const idx = list.findIndex((s) => s.user_id === previewUserId.value);
  const nextIdx = idx >= 0 ? (idx + 1) % list.length : 0;
  previewUserId.value = list[nextIdx].user_id;
};

const nextFlaggedPreviewProvider = () => {
  const flagged = (auditFlaggedProviders.value || []).slice();
  if (!flagged.length) return;
  const ids = flagged.map((x) => x.userId);
  if (!previewUserId.value || !ids.includes(previewUserId.value)) {
    previewUserId.value = ids[0];
    return;
  }
  const idx = ids.indexOf(previewUserId.value);
  const nextIdx = idx >= 0 ? (idx + 1) % ids.length : 0;
  previewUserId.value = ids[nextIdx];
};

const nextFlaggedRunProvider = () => {
  const flagged = (auditFlaggedProviders.value || []).slice();
  if (!flagged.length) return;
  const ids = flagged.map((x) => x.userId);
  const currentUid = selectedSummary.value?.user_id || null;
  if (!currentUid || !ids.includes(currentUid)) {
    const s0 = (summaries.value || []).find((s) => s.user_id === ids[0]) || null;
    if (s0) selectSummary(s0);
    return;
  }
  const idx = ids.indexOf(currentUid);
  const nextIdx = idx >= 0 ? (idx + 1) % ids.length : 0;
  const nextSummary = (summaries.value || []).find((s) => s.user_id === ids[nextIdx]) || null;
  if (nextSummary) selectSummary(nextSummary);
};

const loadAdjustments = async () => {
  const uid = selectedUserId.value;
  if (!uid || !selectedPeriodId.value) return;
  try {
    adjustmentsLoading.value = true;
    adjustmentsError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/adjustments`, { params: { userId: uid } });
    const a = resp.data || {};
    adjustments.value = {
      mileageAmount: Number(a.mileage_amount || 0),
      medcancelAmount: Number(a.medcancel_amount || 0),
      otherTaxableAmount: Number(a.other_taxable_amount || 0),
      imatterAmount: Number(a.imatter_amount || 0),
      missedAppointmentsAmount: Number(a.missed_appointments_amount || 0),
      bonusAmount: Number(a.bonus_amount || 0),
      reimbursementAmount: Number(a.reimbursement_amount || 0),
      tuitionReimbursementAmount: Number(a.tuition_reimbursement_amount || 0),
      otherRate1Hours: Number(a.other_rate_1_hours || 0),
      otherRate2Hours: Number(a.other_rate_2_hours || 0),
      otherRate3Hours: Number(a.other_rate_3_hours || 0),
      salaryAmount: Number(a.salary_amount || 0),
      salaryEffectiveAmount: Number(a.salary_effective_amount || 0),
      salarySource: String(a.salary_effective_source || 'none'),
      salaryPerPayPeriod: Number(a.salary_per_pay_period || 0),
      salaryIncludeServicePay: Number(a.salary_include_service_pay || 0),
      salaryIsProrated: Number(a.salary_is_prorated || 0),
      ptoHours: Number(a.pto_hours || 0),
      ptoRate: Number(a.pto_rate || 0)
    };
    await loadOtherRateTitlesForAdjustments();
  } catch (e) {
    adjustmentsError.value = e.response?.data?.error?.message || e.message || 'Failed to load adjustments';
  } finally {
    adjustmentsLoading.value = false;
  }
};

const saveAdjustments = async () => {
  const uid = selectedUserId.value;
  if (!uid || !selectedPeriodId.value) return;
  try {
    savingAdjustments.value = true;
    adjustmentsError.value = '';
    const resp = await api.put(`/payroll/periods/${selectedPeriodId.value}/adjustments/${uid}`, {
      mileageAmount: Number(adjustments.value.mileageAmount || 0),
      medcancelAmount: Number(adjustments.value.medcancelAmount || 0),
      otherTaxableAmount: Number(adjustments.value.otherTaxableAmount || 0),
      imatterAmount: Number(adjustments.value.imatterAmount || 0),
      missedAppointmentsAmount: Number(adjustments.value.missedAppointmentsAmount || 0),
      bonusAmount: Number(adjustments.value.bonusAmount || 0),
      reimbursementAmount: Number(adjustments.value.reimbursementAmount || 0),
      tuitionReimbursementAmount: Number(adjustments.value.tuitionReimbursementAmount || 0),
      otherRate1Hours: Number(adjustments.value.otherRate1Hours || 0),
      otherRate2Hours: Number(adjustments.value.otherRate2Hours || 0),
      otherRate3Hours: Number(adjustments.value.otherRate3Hours || 0),
      salaryAmount: Number(adjustments.value.salaryAmount || 0),
      ptoHours: Number(adjustments.value.ptoHours || 0),
      ptoRate: Number(adjustments.value.ptoRate || 0)
    });
    // If backend returned refreshed summaries (period already ran), update without wiping the run.
    if (resp?.data?.period || resp?.data?.summaries) {
      if (resp.data?.period) selectedPeriod.value = resp.data.period;
      if (Array.isArray(resp.data?.summaries)) {
        const nextSummaries = resp.data.summaries.map((s) => {
          if (typeof s.breakdown === 'string') {
            try { s.breakdown = JSON.parse(s.breakdown); } catch { /* ignore */ }
          }
          return s;
        });
        summaries.value = nextSummaries;
        if (selectedUserId.value) {
          const found = nextSummaries.find((x) => x.user_id === selectedUserId.value);
          if (found) selectedSummary.value = found;
        }
      } else {
        await loadPeriodDetails();
      }
    } else {
      await loadPeriodDetails();
    }
  } catch (e) {
    adjustmentsError.value = e.response?.data?.error?.message || e.message || 'Failed to save adjustments';
  } finally {
    savingAdjustments.value = false;
  }
};

const loadRateCard = async () => {
  const uid = selectedUserId.value;
  if (!uid || !agencyId.value) return;
  try {
    rateCardLoading.value = true;
    rateCardError.value = '';
    const resp = await api.get('/payroll/rate-cards', { params: { agencyId: agencyId.value, userId: uid } });
    const rc = resp.data || {};
    rateCard.value = {
      directRate: Number(rc.direct_rate || 0),
      indirectRate: Number(rc.indirect_rate || 0),
      otherRate1: Number(rc.other_rate_1 || 0),
      otherRate2: Number(rc.other_rate_2 || 0),
      otherRate3: Number(rc.other_rate_3 || 0)
    };
  } catch (e) {
    rateCardError.value = e.response?.data?.error?.message || e.message || 'Failed to load rate card';
  } finally {
    rateCardLoading.value = false;
  }
};

const saveRateCard = async () => {
  const uid = selectedUserId.value;
  if (!uid || !agencyId.value) return;
  try {
    savingRateCard.value = true;
    rateCardError.value = '';
    await api.post('/payroll/rate-cards', {
      agencyId: agencyId.value,
      userId: uid,
      directRate: Number(rateCard.value.directRate || 0),
      indirectRate: Number(rateCard.value.indirectRate || 0),
      otherRate1: Number(rateCard.value.otherRate1 || 0),
      otherRate2: Number(rateCard.value.otherRate2 || 0),
      otherRate3: Number(rateCard.value.otherRate3 || 0)
    });
    await loadPeriodDetails();
  } catch (e) {
    rateCardError.value = e.response?.data?.error?.message || e.message || 'Failed to save rate card';
  } finally {
    savingRateCard.value = false;
  }
};

const saveStagingRow = async (r) => {
  const uid = r?.userId;
  const serviceCode = r?.serviceCode;
  if (!uid || !serviceCode) return;
  const row = stagingEdits.value?.[stagingKey(r)];
  if (!row) return;
  try {
    savingStaging.value = true;
    stagingError.value = '';
    await api.patch(`/payroll/periods/${selectedPeriodId.value}/staging`, {
      userId: uid,
      serviceCode,
      noNoteUnits: Number(row.noNoteUnits),
      draftUnits: Number(row.draftUnits),
      finalizedUnits: Number(row.finalizedUnits)
    });
    await loadPeriodDetails();
  } catch (e) {
    stagingError.value = e.response?.data?.error?.message || e.message || 'Failed to save staging row';
  } finally {
    savingStaging.value = false;
  }
};

const saveRate = async () => {
  try {
    if (!selectedUserId.value) return;
    savingRate.value = true;
    error.value = '';
    await api.post('/payroll/rates', {
      agencyId: agencyId.value,
      userId: selectedUserId.value,
      serviceCode: rateServiceCode.value,
      rateAmount: rateAmount.value
    });
    rateServiceCode.value = '';
    rateAmount.value = '';
    // We don't auto-recompute yet; CSV import already triggers recompute.
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to save rate';
  } finally {
    savingRate.value = false;
  }
};

const runPayroll = async () => {
  try {
    if (!selectedPeriodId.value) return;
    // If you edited staging but didn’t click Save, persist before rerun so results match.
    await saveAllDirtyStagingEdits();
    runningPayroll.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/run`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    // If trying to re-run a historical pay period just to compare unpaid/no-note changes,
    // allow bypassing the H0031/H0032 processing gate.
    if (e.response?.status === 409 && e.response?.data?.pendingProcessing && selectedPeriod.value?.period_end) {
      const endYmd = String(selectedPeriod.value.period_end || '').slice(0, 10);
      const now = new Date();
      const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const isHistorical = endYmd && endYmd < todayYmd;
      if (isHistorical) {
        const ok = window.confirm(
          'This looks like an older pay period. Run payroll anyway (skip H0031/H0032 minutes gate) so you can compare No-note/Draft unpaid?\n\nThis is intended for historical checks; do not use if you are paying this period.'
        );
        if (ok) {
          try {
            await api.post(`/payroll/periods/${selectedPeriodId.value}/run`, {}, { params: { skipProcessingGate: 'true' } });
            await loadPeriods();
            await loadPeriodDetails();
            return;
          } catch (e2) {
            const msg2 = e2.response?.data?.error?.message || e2.message || 'Failed to run payroll';
            error.value = msg2;
          }
        }
      }
    }

    const msg = e.response?.data?.error?.message || e.message || 'Failed to run payroll';
    error.value = msg;
    // If blocked due to pending mileage approvals, open Payroll Stage and show the list.
    if (e.response?.status === 409 && e.response?.data?.pendingMileage) {
      showStageModal.value = true;
      await loadPendingMileageClaims();
    }
    if (e.response?.status === 409 && e.response?.data?.pendingMedcancel) {
      showStageModal.value = true;
      await loadPendingMedcancelClaims();
    }
      if (e.response?.status === 409 && e.response?.data?.pendingTodos) {
        showStageModal.value = true;
        try { await loadPayrollTodos(); } catch { /* ignore */ }
      }
  } finally {
    runningPayroll.value = false;
  }
};

const postPayroll = async () => {
  try {
    if (!selectedPeriodId.value) return;
    postingPayroll.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/post`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to post payroll';
  } finally {
    postingPayroll.value = false;
  }
};

const unpostPayroll = async () => {
  try {
    if (!selectedPeriodId.value) return;
    if (!isSuperAdmin.value) return;
    const ok = window.confirm('UNPOST this pay period? This will revert it back to Ran so you can correct settings and re-run/post. It does not delete imports or run results.');
    if (!ok) return;
    unpostingPayroll.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/unpost`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to unpost pay period';
  } finally {
    unpostingPayroll.value = false;
  }
};

const resetPeriod = async () => {
  try {
    if (!selectedPeriodId.value) return;
    const ok = window.confirm('Reset this pay period back to Draft and clear ALL related data (imports, staging, adjustments, run results)? The pay period will remain.');
    if (!ok) return;
    resettingPeriod.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/reset`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to reset pay period';
  } finally {
    resettingPeriod.value = false;
  }
};

const restagePeriod = async () => {
  try {
    if (!selectedPeriodId.value) return;
    if (!isPeriodRan.value) return;
    const ok = window.confirm('Restage this pay period? This will clear Run Payroll results and return the period to Staged (does not delete imports or staging edits).');
    if (!ok) return;
    restagingPeriod.value = true;
    error.value = '';
    await api.post(`/payroll/periods/${selectedPeriodId.value}/restage`);
    await loadPeriods();
    await loadPeriodDetails();
  } catch (e) {
    error.value = e.response?.data?.error?.message || e.message || 'Failed to restage pay period';
  } finally {
    restagingPeriod.value = false;
  }
};


watch(agencyId, async () => {
  selectedPeriodId.value = null;
  selectedPeriod.value = null;
  summaries.value = [];
  selectedUserId.value = null;
  selectedSummary.value = null;
  await loadAgencyUsers();
  await loadPeriods();
  await restoreSelectionFromStorage();
});

watch(filteredAgencies, () => {
  // Keep selection stable when filtering
  if (selectedOrgId.value) return;
  const existing = agencyId.value;
  if (existing) {
    selectedOrgId.value = existing;
    return;
  }
  if (filteredAgencies.value.length === 1) {
    selectedOrgId.value = filteredAgencies.value[0].id;
  }
});

watch(selectedOrgId, async (id) => {
  if (!id) return;
  try { localStorage.setItem(LS_LAST_ORG_ID, String(id)); } catch { /* ignore */ }
  const found = (payrollAgencyOptions.value || []).find((x) => x.id === id);
  if (found) {
    agencyStore.setCurrentAgency(found);
    organizationStore.setCurrentOrganization(found);

    // Ensure we have the full agency record (theme settings, parsed palettes).
    const hydrated = await agencyStore.hydrateAgencyById(found.id);
    const org = hydrated || found;

    // Apply theme immediately (so the user sees the branding switch right away).
    try {
      const paletteRaw = org?.color_palette ?? org?.colorPalette ?? null;
      const themeRaw = org?.theme_settings ?? org?.themeSettings ?? null;
      const colorPalette = typeof paletteRaw === 'string' ? JSON.parse(paletteRaw) : (paletteRaw || {});
      const themeSettings = typeof themeRaw === 'string' ? JSON.parse(themeRaw) : (themeRaw || {});
      brandingStore.applyTheme({
        brandingAgencyId: org?.id,
        agencyId: org?.id,
        colorPalette,
        themeSettings
      });
    } catch {
      // ignore
    }

    // Update the URL to the org-scoped payroll route for a clean context switch.
    const slug = String(org?.slug || org?.portal_url || '').trim();
    const curSlug = String(route.params?.organizationSlug || '').trim();
    if (slug && slug !== curSlug) {
      try {
        await router.push(`/${slug}/admin/payroll`);
      } catch {
        // ignore - router will remain on current route
      }
    }
  }
});

watch(selectedPeriodId, async (id) => {
  if (!id) return;
  try {
    if (agencyId.value) localStorage.setItem(lsLastPeriodKey(agencyId.value), String(id));
  } catch { /* ignore */ }
  await loadPeriodDetails();
  await loadApprovedMileageClaimsAmount();
  await loadApprovedMedcancelClaimsAmount();
  await loadApprovedHolidayBonusClaimsAmount();
  await loadApprovedMileageClaimsList();
  await loadApprovedMedcancelClaimsList();
  await loadApprovedHolidayBonusClaimsList();
  await loadManualPayLines();
  await loadPayrollTodos();
});

watch(showStageModal, async (open) => {
  if (!open) return;
  await loadServiceCodeRules();
  await loadMileageRates();
  // Default to *all* pending so nothing “disappears” between pay periods.
  await loadAllPendingMileageClaims();
  await loadAllPendingMedcancelClaims();
  await loadAllPendingReimbursementClaims();
  await loadAllPendingTimeClaims();
  await loadPendingHolidayBonusClaims();
  await loadAllPendingPtoRequests();
  await loadApprovedMileageClaimsAmount();
  await loadApprovedMedcancelClaimsAmount();
  await loadApprovedHolidayBonusClaimsAmount();
  await loadApprovedReimbursementClaimsAmount();
  await loadApprovedMileageClaimsList();
  await loadApprovedMedcancelClaimsList();
  await loadApprovedHolidayBonusClaimsList();
  await loadApprovedReimbursementClaimsList();
  await loadManualPayLines();
  await loadPayrollTodos();

  // Also load prior-period still-unpaid snapshot so the red backlog indicators persist
  // even if the user doesn’t reopen the comparison modal.
  await loadPriorStillUnpaidForStage();
});

watch(selectedUserId, async () => {
  await loadAdjustments();
  await loadRateCard();
  await loadApprovedMileageClaimsAmount();
  await loadApprovedMedcancelClaimsAmount();
  await loadApprovedHolidayBonusClaimsAmount();
  await loadApprovedReimbursementClaimsAmount();
});

watch(previewUserId, async () => {
  if (!previewUserId.value || !selectedPeriodId.value) {
    previewAdjustments.value = null;
    previewAdjustmentsError.value = '';
    previewPostNotifications.value = [];
    previewPostNotificationsError.value = '';
    previewUserPayrollHistory.value = [];
    previewUserPayrollHistoryError.value = '';
    return;
  }
  try {
    previewAdjustmentsLoading.value = true;
    previewAdjustmentsError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/adjustments`, { params: { userId: previewUserId.value } });
    previewAdjustments.value = resp.data || null;
  } catch (e) {
    previewAdjustmentsError.value = e.response?.data?.error?.message || e.message || 'Failed to load adjustments';
    previewAdjustments.value = null;
  } finally {
    previewAdjustmentsLoading.value = false;
  }

  // Load post-time notifications preview for this provider.
  try {
    previewPostNotificationsLoading.value = true;
    previewPostNotificationsError.value = '';
    const resp = await api.get(`/payroll/periods/${selectedPeriodId.value}/post/preview`, { params: { userId: previewUserId.value } });
    previewPostNotifications.value = resp.data?.notifications || [];
  } catch (e) {
    previewPostNotificationsError.value = e.response?.data?.error?.message || e.message || 'Failed to load post preview notifications';
    previewPostNotifications.value = [];
  } finally {
    previewPostNotificationsLoading.value = false;
  }

  // Load provider payroll history so we can show the same "old/unpaid notes" banners they see.
  try {
    if (!agencyId.value) return;
    previewUserPayrollHistoryLoading.value = true;
    previewUserPayrollHistoryError.value = '';
    const resp = await api.get(`/payroll/users/${previewUserId.value}/periods`, { params: { agencyId: agencyId.value } });
    previewUserPayrollHistory.value = resp.data || [];
  } catch (e) {
    previewUserPayrollHistoryError.value = e.response?.data?.error?.message || e.message || 'Failed to load provider payroll history';
    previewUserPayrollHistory.value = [];
  } finally {
    previewUserPayrollHistoryLoading.value = false;
  }
});

watch(previewPostV2UserId, async () => {
  if (!showPreviewPostModalV2.value) return;
  if (previewPostV2Loading.value) return;
  previewPostV2Error.value = '';
  await loadPreviewPostV2Notifications();
});

watch(
  [showRunModal, showPreviewPostModal, selectedPeriodId],
  async () => {
    if (!selectedPeriodId.value) return;
    if (!canSeeRunResults.value) return;
    if (!showRunModal.value && !showPreviewPostModal.value) return;
    await loadImmediatePriorSummaries();
  }
);

onMounted(async () => {
  // Ensure an org list exists even if user didn't pick one elsewhere
  // - super_admin: load all agencies
  // - others: load assigned agencies
  if (authStore.user?.role === 'super_admin') {
    await agencyStore.fetchAgencies();
  } else {
    await agencyStore.fetchUserAgencies();
  }
  // Fallback: if assigned agencies are empty (some edge cases), load all.
  if (!(agencyStore.userAgencies?.length || agencyStore.userAgencies?.value?.length) && !(agencyStore.agencies?.length || agencyStore.agencies?.value?.length)) {
    await agencyStore.fetchAgencies();
  }
  // Seed selector from any pre-existing context
  if (agencyId.value) selectedOrgId.value = agencyId.value;
  await loadAgencyUsers();
  await loadPeriods();
  await restoreSelectionFromStorage();
});

const onProcessFilePick = (evt) => {
  processImportFile.value = evt.target.files?.[0] || null;
};

const processAutoImport = async () => {
  try {
    if (!agencyId.value) return;
    if (!processImportFile.value) return;
    processingChanges.value = true;
    processError.value = '';
    processDetectedHint.value = '';
    processSourcePeriodId.value = null;
    processSourcePeriodLabel.value = '';

    const fd = new FormData();
    fd.append('file', processImportFile.value);
    fd.append('agencyId', String(agencyId.value));
    const resp = await api.post('/payroll/periods/auto/detect', fd);
    processDetectResult.value = resp.data || null;
    const detected = processDetectResult.value?.detected;
    if (detected?.periodStart && detected?.periodEnd) {
      processDetectedHint.value = `Detected prior pay period: ${detected.periodStart} → ${detected.periodEnd}`;
    }
    processChoiceMode.value = 'detected';
    processExistingPeriodId.value = processDetectResult.value?.existingPeriodId || null;
    // Ensure suggested match is actually a valid "prior period" option for this destination period.
    if (processExistingPeriodId.value && !(processPriorPeriodOptions.value || []).some((p) => Number(p?.id) === Number(processExistingPeriodId.value))) {
      processExistingPeriodId.value = null;
    }
    processConfirmOpen.value = true;
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to auto-detect/import prior pay period';
  } finally {
    processingChanges.value = false;
  }
};

const confirmProcessImport = async () => {
  try {
    if (!agencyId.value) return;
    if (!processImportFile.value) return;
    processingChanges.value = true;
    processError.value = '';

    let sourcePeriodId = null;
    if (processChoiceMode.value === 'existing') {
      sourcePeriodId = processExistingPeriodId.value;
      if (!sourcePeriodId) {
        processError.value = 'Select an existing prior pay period.';
        return;
      }
    } else {
      const detected = processDetectResult.value?.detected;
      if (!detected?.periodStart || !detected?.periodEnd) {
        processError.value = 'No detected prior pay period available. Choose an existing period.';
        return;
      }
      sourcePeriodId = processExistingPeriodId.value;
      if (!sourcePeriodId) {
        processError.value = 'No existing pay period matched the detected prior period. Choose an existing prior pay period (or enable off-schedule periods / sync drafts).';
        return;
      }
    }
    if (!sourcePeriodId) {
      processError.value = 'Could not determine a prior pay period to import into.';
      return;
    }

    await loadPeriods();
    const p = (periods.value || []).find((x) => x.id === sourcePeriodId) || null;
    processSourcePeriodId.value = sourcePeriodId;
    processSourcePeriodLabel.value = p ? periodRangeLabel(p) : `Period #${sourcePeriodId}`;

    processConfirmOpen.value = false;
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to select prior pay period for comparison';
  } finally {
    processingChanges.value = false;
  }
};

const processRunAndCompare = async () => {
  try {
    if (!processSourcePeriodId.value) return;
    if (!selectedPeriodId.value) return;
    processingChanges.value = true;
    processError.value = '';

    // Create a snapshot-only run from the uploaded report (does NOT modify the old pay period).
    if (!processImportFile.value) {
      processError.value = 'Please choose the updated prior-period report file again.';
      return;
    }
    const fd = new FormData();
    fd.append('file', processImportFile.value);
    await api.post(`/payroll/periods/${processSourcePeriodId.value}/runs/snapshot-from-file`, fd);

    // Switch UI context to the present pay period (destination) and open compare modal.
    await selectPeriod(selectedPeriodId.value);
    showCarryoverModal.value = true;
    carryoverPriorPeriodId.value = processSourcePeriodId.value;
    await loadCarryoverRuns();
    await loadCarryoverPreview();
  } catch (e) {
    processError.value = e.response?.data?.error?.message || e.message || 'Failed to run prior period and compare changes';
  } finally {
    processingChanges.value = false;
  }
};
</script>

<style scoped>
.th-sortable {
  cursor: pointer;
  user-select: none;
}
.th-sort-indicator {
  margin-left: 6px;
  opacity: 0.7;
  font-size: 12px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 18px;
}
.card {
  background: white;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
}
.card-title {
  margin: 0 0 12px 0;
}
.subtitle {
  margin: 6px 0 0;
  color: var(--text-secondary);
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1.5fr;
  gap: 10px;
  margin-bottom: 12px;
}
.field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
input[type='text'],
input[type='date'],
input[type='number'] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.link-btn {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-decoration: underline;
}
.link-btn.right {
  width: 100%;
  text-align: right;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  flex-direction: row;
}

/* Keep payroll buttons compact (text-sized) */
.btn {
  padding: 6px 10px;
  font-size: 13px;
  line-height: 1.2;
}
.btn.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}
.actions .btn {
  width: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  white-space: nowrap;
}
.hint {
  font-size: 12px;
  color: var(--text-secondary);
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.list-item {
  text-align: left;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}
.list-item.active {
  border-color: #334155;
}
.list-item-title {
  font-weight: 600;
}
.list-item-meta {
  color: var(--text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.period-meta {
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
  color: var(--text-primary);
}
.import-box {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 14px;
}
.import-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.import-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.warn-box {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
}
.warn {
  color: var(--danger);
  font-weight: 700;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  z-index: 9999;
}
.modal {
  width: min(1100px, 100%);
  max-height: 85vh;
  overflow: auto;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
}

.wizard-hero {
  border: 1px solid rgba(59, 130, 246, 0.35);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.10), rgba(99, 102, 241, 0.06));
}
.org-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0 10px 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fff;
}
.org-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.org-bar-label {
  font-weight: 800;
  letter-spacing: 0.2px;
}
.org-bar-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.org-bar select,
.org-bar input {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  font-size: 14px;
}
.org-bar input {
  min-width: 200px;
}
.org-bar-value {
  color: var(--text-primary);
}
.wizard-hero-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.wizard-hero-controls {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 14px;
  margin-top: 12px;
  align-items: end;
}
.wizard-btn {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.2px;
  border-radius: 12px;
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.25);
}
.wizard-btn:disabled {
  box-shadow: none;
}
@media (max-width: 900px) {
  .wizard-hero-controls {
    grid-template-columns: 1fr;
  }
  .org-bar input {
    min-width: 160px;
    width: 100%;
  }
}
.modal .table th,
.modal .table td {
  padding: 8px 10px;
}
.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.modal-title {
  font-weight: 700;
  font-size: 16px;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.carryover-row {
  background: #fff9db;
}
.carryover-cell {
  background: #fff3bf;
  font-weight: 700;
}
.prior-unpaid-row {
  background: #ffecec;
}
.prior-unpaid-cell {
  background: #ffd6d6;
  font-weight: 700;
  color: #b00020;
}
.right {
  text-align: right;
}
.stage-num-input {
  width: 80px;
  min-width: 80px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.stage-num-input:disabled {
  background: #f3f4f6;
  color: #6b7280;
}
.muted {
  color: var(--text-secondary);
}
.tier-chip {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #f8fafc;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  vertical-align: middle;
}
.tier-chip.grace {
  border-color: rgba(245, 158, 11, 0.35);
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
}
.clickable {
  cursor: pointer;
}
.section-title {
  margin: 16px 0 10px;
}
.rates-box {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.breakdown {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}
.breakdown-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
}

.codes {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.codes-head,
.code-row {
  display: grid;
  grid-template-columns:
    minmax(110px, 1.2fr)
    90px
    90px
    90px
    90px
    90px
    110px
    120px;
  align-items: center;
}

.codes-head {
  font-weight: 700;
  background: var(--bg-alt, #f8fafc);
  border-bottom: 1px solid var(--border);
}

.codes-head > div,
.code-row > div {
  padding: 8px 10px;
}

.code-row {
  border-bottom: 1px solid var(--border);
}

.code-row:last-child {
  border-bottom: none;
}

.code-row .code {
  font-weight: 600;
}
.code {
  font-weight: 600;
}
.rate-editor .field-row {
  grid-template-columns: 1fr 1fr;
}
.adjustments-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 8px;
}
.adjustments-grid .actions {
  grid-column: 1 / -1;
  margin: 0;
}
.error-box {
  background: #fee;
  border: 1px solid #fcc;
  padding: 10px 12px;
  border-radius: 10px;
  margin-bottom: 12px;
}
@media (max-width: 980px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>

