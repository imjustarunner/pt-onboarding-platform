<template>
  <div class="container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <h1>Budget Management</h1>
        <p class="subtitle">Manage fiscal year budgets, department allocations, and expense tracking.</p>
      </div>
      <button v-if="agencyId" class="btn btn-primary" @click="showSubmitModal = true">Submit Expenses</button>
    </div>

    <BudgetSubmitExpensesModal
      v-if="showSubmitModal && agencyId"
      :agency-id="agencyId"
      :show="showSubmitModal"
      @close="showSubmitModal = false"
      @submitted="showSubmitModal = false"
    />

    <div class="org-bar">
      <div class="org-bar-left">
        <div class="org-bar-label">Organization</div>
        <div class="org-bar-value">
          <strong>{{ effectiveAgency?.name || '—' }}</strong>
        </div>
      </div>
      <div v-if="myDepartments.length && agencyId" class="org-bar-right" style="display: flex; align-items: center; gap: 8px;">
        <span class="muted">Department:</span>
        <div class="dept-cards" style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button
            v-for="d in myDepartments"
            :key="d.id"
            class="btn btn-sm"
            :class="selectedDepartmentId === d.id ? 'btn-primary' : 'btn-secondary'"
            @click="selectedDepartmentId = selectedDepartmentId === d.id ? null : d.id"
          >
            {{ d.name }}
          </button>
          <button
            v-if="myDepartments.length > 1"
            class="btn btn-sm btn-secondary"
            :class="{ active: !selectedDepartmentId }"
            @click="selectedDepartmentId = null"
          >
            All
          </button>
        </div>
      </div>
    </div>

    <div v-if="!agencyId" class="card" style="margin-top: 24px; padding: 24px;">
      <p class="muted">Select an agency to manage budgets.</p>
    </div>

    <template v-else>
      <div class="budget-tabs" style="display: flex; gap: 8px; margin-top: 24px; border-bottom: 1px solid var(--border-color, #ddd);">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="btn btn-secondary btn-sm"
          :class="{ active: activeTab === t.id }"
          @click="activeTab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-show="activeTab === 'fiscal'" class="card" style="margin-top: 24px;">
        <h2 style="margin: 0 0 12px 0;">Fiscal Year</h2>
        <p class="muted" style="margin-bottom: 16px;">Set the total operating budget for each fiscal year (Jul 1 – Jun 30).</p>
        <div class="field-row" style="display: flex; gap: 12px; align-items: flex-end; margin-bottom: 16px;">
          <div class="field">
            <label>Fiscal year</label>
            <select v-model="selectedFiscalYearId">
              <option value="">Select…</option>
              <option v-for="fy in fiscalYears" :key="fy.id" :value="String(fy.id)">
                {{ fy.fiscal_year_start }} – {{ fy.fiscal_year_end }}
              </option>
            </select>
          </div>
          <div class="field" v-if="selectedFiscalYear">
            <label>Total operating budget ($)</label>
            <input v-model.number="totalBudgetEdit" type="number" min="0" step="0.01" />
          </div>
          <button class="btn btn-primary" :disabled="savingFy" @click="saveFiscalYear">
            {{ savingFy ? 'Saving…' : 'Save' }}
          </button>
          <button class="btn btn-secondary" @click="openNewFiscalYear">New fiscal year</button>
        </div>
        <div v-if="showNewFyForm" class="form-row" style="display: flex; gap: 12px; align-items: flex-end;">
          <div class="field">
            <label>Year (start July)</label>
            <input v-model.number="newFyYear" type="number" min="2020" max="2030" />
          </div>
          <div class="field">
            <label>Total budget ($)</label>
            <input v-model.number="newFyBudget" type="number" min="0" step="0.01" />
          </div>
          <button class="btn btn-primary" :disabled="savingFy" @click="createFiscalYear">Create</button>
          <button class="btn btn-secondary" @click="showNewFyForm = false">Cancel</button>
        </div>
        <div v-if="fyError" class="error-box" style="margin-top: 10px;">{{ fyError }}</div>
      </div>

      <div v-show="activeTab === 'fiscal'" class="card" style="margin-top: 24px;" v-if="selectedFiscalYearId">
        <h2 style="margin: 0 0 12px 0;">Department Allocations</h2>
        <p class="muted" style="margin-bottom: 16px;">Assign budget amounts to each department. Total cannot exceed the fiscal year budget.</p>
        <div v-if="allocationsLoading" class="muted">Loading…</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Department</th>
                <th class="right">Allocated ($)</th>
                <th class="right">Spent ($)</th>
                <th class="right">Remaining ($)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in allocationsWithDepts" :key="a.department_id" :class="{ 'over-budget': a.spent_amount > (a.allocated_amount || 0) }">
                <td>{{ a.department_name }}</td>
                <td class="right">
                  <input v-model.number="allocationEdits[a.department_id]" type="number" min="0" step="0.01" style="width: 120px; text-align: right;" />
                </td>
                <td class="right">{{ a.spent_amount.toFixed(2) }}</td>
                <td class="right">{{ a.remaining_amount.toFixed(2) }}</td>
              </tr>
              <tr v-if="!allocationsWithDepts.length">
                <td colspan="4" class="muted">No departments. Add them in Settings → Workflow → Departments.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top: 12px;">
          <span class="muted">Total allocated: {{ totalAllocated.toFixed(2) }} / {{ (selectedFiscalYear?.total_operating_budget || 0).toFixed(2) }}</span>
          <span class="muted" style="margin-left: 16px;">Total spent: {{ totalSpent.toFixed(2) }}</span>
          <button class="btn btn-primary" style="margin-left: 16px;" :disabled="savingAlloc || totalAllocated > (selectedFiscalYear?.total_operating_budget || 0)" @click="saveAllocations">
            {{ savingAlloc ? 'Saving…' : 'Save allocations' }}
          </button>
        </div>
        <div v-if="allocError" class="error-box" style="margin-top: 10px;">{{ allocError }}</div>
      </div>

      <!-- Expenses tab -->
      <div v-show="activeTab === 'expenses'" class="card" style="margin-top: 24px;">
        <h2 style="margin: 0 0 12px 0;">Expenses</h2>
        <p class="muted" style="margin-bottom: 16px;">Search and filter submitted expenses. Export to CSV or get AI insights.</p>
        <div class="expense-filters" style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
          <div class="field" style="min-width: 140px;">
            <label>Search</label>
            <input v-model="expenseFilters.q" type="text" placeholder="Vendor, place, purpose…" />
          </div>
          <div class="field" style="min-width: 120px;">
            <label>Department</label>
            <select v-model="expenseFilters.departmentId">
              <option value="">All</option>
              <option v-for="d in departments" :key="d.id" :value="String(d.id)">{{ d.name }}</option>
            </select>
          </div>
          <div class="field" style="min-width: 120px;">
            <label>Category</label>
            <select v-model="expenseFilters.categoryId">
              <option value="">All</option>
              <option v-for="c in expenseCategories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
            </select>
          </div>
          <div class="field" style="min-width: 120px;">
            <label>Status</label>
            <select v-model="expenseFilters.status">
              <option value="">All</option>
              <option value="submitted">Pending approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div class="field" style="min-width: 100px;">
            <label>From</label>
            <input v-model="expenseFilters.dateFrom" type="date" />
          </div>
          <div class="field" style="min-width: 100px;">
            <label>To</label>
            <input v-model="expenseFilters.dateTo" type="date" />
          </div>
          <button class="btn btn-primary" :disabled="expensesLoading" @click="loadExpenses">Search</button>
          <button class="btn btn-secondary" :disabled="expensesLoading" @click="exportExpensesCsv">Export CSV</button>
          <button class="btn btn-secondary" :disabled="aiAnalyzing" @click="loadAiInsights">{{ aiAnalyzing ? 'Analyzing…' : 'AI Insights' }}</button>
        </div>
        <div v-if="aiSuggestions.length" class="ai-insights-box" style="margin-bottom: 16px; padding: 12px; background: #f0f7ff; border-radius: 8px;">
          <strong>AI Suggestions</strong>
          <ul style="margin: 8px 0 0 0; padding-left: 20px;">
            <li v-for="(s, i) in aiSuggestions" :key="i">{{ s }}</li>
          </ul>
        </div>
        <div v-if="expensesLoading" class="muted">Loading…</div>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Department</th>
                <th>Category</th>
                <th>Place</th>
                <th>Vendor</th>
                <th>User</th>
                <th>Status</th>
                <th v-if="expenses.some((e) => e.status === 'submitted')">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in expenses" :key="e.id" :class="{ 'row-highlight': highlightedExpenseId === e.id }">
                <td>{{ e.expense_date }}</td>
                <td class="right">${{ Number(e.amount).toFixed(2) }}</td>
                <td>{{ e.department_name }}</td>
                <td>{{ e.category_name }}</td>
                <td>{{ e.place }}</td>
                <td>{{ e.vendor || '—' }}</td>
                <td>{{ e.user_first_name }} {{ e.user_last_name }}</td>
                <td>{{ e.status }}</td>
                <td v-if="expenses.some((x) => x.status === 'submitted')">
                  <template v-if="e.status === 'submitted'">
                    <button class="btn btn-primary btn-sm" :disabled="expenseActionLoading === e.id" @click="approveExpense(e)">Approve</button>
                    <button class="btn btn-danger btn-sm" :disabled="expenseActionLoading === e.id" @click="rejectExpense(e)">Reject</button>
                  </template>
                  <span v-else class="muted">—</span>
                </td>
              </tr>
              <tr v-if="!expenses.length"><td :colspan="expenses.some((e) => e.status === 'submitted') ? 9 : 8" class="muted">No expenses found.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Reports tab -->
      <div v-show="activeTab === 'reports'" class="card" style="margin-top: 24px;">
        <h2 style="margin: 0 0 12px 0;">Expense Reports</h2>
        <p class="muted" style="margin-bottom: 16px;">Breakdowns by category, department, business purpose, and event.</p>
        <div class="report-filters" style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
          <div class="field" style="min-width: 120px;">
            <label>Department</label>
            <select v-model="reportFilters.departmentId">
              <option value="">All</option>
              <option v-for="d in departments" :key="d.id" :value="String(d.id)">{{ d.name }}</option>
            </select>
          </div>
          <div class="field" style="min-width: 120px;">
            <label>Category</label>
            <select v-model="reportFilters.categoryId">
              <option value="">All</option>
              <option v-for="c in expenseCategories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
            </select>
          </div>
          <div class="field" style="min-width: 100px;">
            <label>From</label>
            <input v-model="reportFilters.dateFrom" type="date" />
          </div>
          <div class="field" style="min-width: 100px;">
            <label>To</label>
            <input v-model="reportFilters.dateTo" type="date" />
          </div>
          <div class="field" style="min-width: 120px;">
            <label>Status</label>
            <select v-model="reportFilters.status">
              <option value="approved">Approved</option>
              <option value="all">All</option>
              <option value="submitted">Pending</option>
            </select>
          </div>
          <div class="field" style="align-self: flex-end;">
            <button class="btn btn-primary" :disabled="reportLoading" @click="loadReport">{{ reportLoading ? 'Loading…' : 'Apply' }}</button>
          </div>
        </div>
        <div v-if="reportLoading" class="muted">Loading report…</div>
        <div v-else-if="reportError" class="error-box">{{ reportError }}</div>
        <div v-else-if="expenseReport" class="report-summary">
          <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
            <button class="btn btn-primary" @click="exportReportPdf">
              Export PDF
            </button>
          </div>
          <div ref="reportContentRef" class="report-printable">
            <header class="report-header">
              <img v-if="reportLogoUrl" :src="reportLogoUrl" alt="" class="report-logo" />
              <div class="report-header-text">
                <h1 class="report-title">{{ effectiveAgency?.name || 'Agency' }} — Expense Report</h1>
                <p class="report-meta">
                  {{ reportFilters.dateFrom || 'All' }} – {{ reportFilters.dateTo || 'All' }}
                  · {{ reportFilters.status === 'approved' ? 'Approved' : reportFilters.status === 'all' ? 'All statuses' : 'Pending' }}
                </p>
              </div>
            </header>
            <div class="report-total-card">
              <span class="report-total-label">Total Expenses</span>
              <span class="report-total-value">${{ expenseReport.total.toFixed(2) }}</span>
              <span class="report-total-count">{{ expenseReport.count }} expenses</span>
            </div>
            <div class="report-charts">
              <div class="report-chart-card">
                <h3>By Category</h3>
                <div class="chart-container">
                  <canvas ref="chartCategoryRef"></canvas>
                </div>
                <table class="report-mini-table">
                  <tr v-for="row in expenseReport.byCategory" :key="row.name">
                    <td>{{ row.name }}</td>
                    <td class="right">${{ row.amount.toFixed(2) }}</td>
                  </tr>
                </table>
              </div>
              <div class="report-chart-card">
                <h3>By Department</h3>
                <div class="chart-container">
                  <canvas ref="chartDepartmentRef"></canvas>
                </div>
                <table class="report-mini-table">
                  <tr v-for="row in expenseReport.byDepartment" :key="row.name">
                    <td>{{ row.name }}</td>
                    <td class="right">${{ row.amount.toFixed(2) }}</td>
                  </tr>
                </table>
              </div>
            </div>
            <div class="report-tables">
              <div class="report-table-card">
                <h3>By Business Purpose</h3>
                <table class="table">
                  <thead><tr><th>Purpose</th><th class="right">Amount</th></tr></thead>
                  <tbody>
                    <tr v-for="row in expenseReport.byBusinessPurpose" :key="row.name">
                      <td>{{ row.name }}</td>
                      <td class="right">${{ row.amount.toFixed(2) }}</td>
                    </tr>
                    <tr v-if="!expenseReport.byBusinessPurpose?.length"><td colspan="2" class="muted">No data</td></tr>
                  </tbody>
                </table>
              </div>
              <div class="report-table-card">
                <h3>By Event</h3>
                <table class="table">
                  <thead><tr><th>Event</th><th class="right">Amount</th></tr></thead>
                  <tbody>
                    <tr v-for="row in expenseReport.byEvent" :key="row.name">
                      <td>{{ row.name }}</td>
                      <td class="right">${{ row.amount.toFixed(2) }}</td>
                    </tr>
                    <tr v-if="!expenseReport.byEvent?.length"><td colspan="2" class="muted">No data</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="muted">Click Apply to load the report.</div>
      </div>

      <!-- Expense Categories -->
      <div v-show="activeTab === 'categories'" class="card" style="margin-top: 24px;">
        <h2 style="margin: 0 0 12px 0;">Expense Categories</h2>
        <p class="muted" style="margin-bottom: 16px;">Agency-level expense categories (e.g. Travel, Meals, Hotel, Mileage).</p>
        <div class="form-row" style="display: flex; gap: 12px; align-items: flex-end; margin-bottom: 16px;">
          <div class="field" style="flex: 1;">
            <label>Category name</label>
            <input v-model="newCategoryName" type="text" placeholder="e.g. Travel, Meals" />
          </div>
          <div class="field" style="width: 80px;">
            <label>Order</label>
            <input v-model.number="newCategoryOrder" type="number" min="0" />
          </div>
          <button class="btn btn-primary" :disabled="catSaving || !newCategoryName?.trim()" @click="addCategory">Add</button>
        </div>
        <div v-if="catError" class="error-box" style="margin-bottom: 12px;">{{ catError }}</div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Order</th><th>Name</th><th>Slug</th><th></th></tr></thead>
            <tbody>
              <tr v-for="c in expenseCategories" :key="c.id">
                <td>{{ c.display_order }}</td>
                <td>
                  <input v-if="editingCatId === c.id" v-model="editCatName" style="width: 100%;" />
                  <span v-else>{{ c.name }}</span>
                </td>
                <td class="muted">{{ c.slug }}</td>
                <td>
                  <template v-if="editingCatId === c.id">
                    <button class="btn btn-primary btn-sm" :disabled="catSaving" @click="saveCategory">Save</button>
                    <button class="btn btn-secondary btn-sm" @click="editingCatId = null">Cancel</button>
                  </template>
                  <template v-else>
                    <button class="btn btn-secondary btn-sm" @click="startEditCategory(c)">Edit</button>
                    <button class="btn btn-danger btn-sm" :disabled="catSaving" @click="deleteCategory(c)">Delete</button>
                  </template>
                </td>
              </tr>
              <tr v-if="!expenseCategories.length && !catLoading"><td colspan="4" class="muted">No categories yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Budget Events -->
      <div v-show="activeTab === 'events'" class="card" style="margin-top: 24px;">
        <h2 style="margin: 0 0 12px 0;">Events</h2>
        <p class="muted" style="margin-bottom: 16px;">Events for business purposes (e.g. DEI Alliance Meeting, East Coast Selection).</p>
        <div class="form-row" style="display: flex; gap: 12px; align-items: flex-end; margin-bottom: 16px;">
          <div class="field" style="flex: 1;">
            <label>Event name</label>
            <input v-model="newEventName" type="text" placeholder="e.g. DEI Alliance Meeting" />
          </div>
          <div class="field" style="flex: 1;">
            <label>Description</label>
            <input v-model="newEventDesc" type="text" placeholder="Optional" />
          </div>
          <button class="btn btn-primary" :disabled="evtSaving || !newEventName?.trim()" @click="addEvent">Add</button>
        </div>
        <div v-if="evtError" class="error-box" style="margin-bottom: 12px;">{{ evtError }}</div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Name</th><th>Slug</th><th>Description</th><th>Portal</th><th></th></tr></thead>
            <tbody>
              <tr v-for="e in budgetEvents" :key="e.id">
                <td>
                  <input v-if="editingEvtId === e.id" v-model="editEvtName" style="width: 100%;" />
                  <span v-else>{{ e.name }}</span>
                </td>
                <td class="muted">{{ e.slug }}</td>
                <td>
                  <input v-if="editingEvtId === e.id" v-model="editEvtDesc" style="width: 100%;" />
                  <span v-else class="muted">{{ e.description || '—' }}</span>
                </td>
                <td>
                  <template v-if="editingEvtId === e.id">
                    <label class="checkbox-label"><input v-model="editEvtPortalEnabled" type="checkbox" /> Portal</label>
                  </template>
                  <template v-else>
                    <a v-if="getEventSettings(e)?.portalEnabled && orgSlug" :href="eventPortalUrl(e)" target="_blank" rel="noopener">View portal</a>
                    <span v-else class="muted">—</span>
                  </template>
                </td>
                <td>
                  <template v-if="editingEvtId === e.id">
                    <button class="btn btn-primary btn-sm" :disabled="evtSaving" @click="saveEvent">Save</button>
                    <button class="btn btn-secondary btn-sm" @click="editingEvtId = null">Cancel</button>
                  </template>
                  <template v-else>
                    <button class="btn btn-secondary btn-sm" @click="startEditEvent(e)">Edit</button>
                    <button class="btn btn-danger btn-sm" :disabled="evtSaving" @click="deleteEvent(e)">Delete</button>
                  </template>
                </td>
              </tr>
              <tr v-if="!budgetEvents.length && !evtLoading"><td colspan="5" class="muted">No events yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Business Purposes -->
      <div v-show="activeTab === 'purposes'" class="card" style="margin-top: 24px;">
        <h2 style="margin: 0 0 12px 0;">Business Purposes</h2>
        <p class="muted" style="margin-bottom: 16px;">Business purposes linked to events for expense tracking.</p>
        <div class="form-row" style="display: flex; gap: 12px; align-items: flex-end; margin-bottom: 16px;">
          <div class="field" style="flex: 1;">
            <label>Purpose name</label>
            <input v-model="newPurposeName" type="text" placeholder="e.g. Staff training" />
          </div>
          <div class="field" style="flex: 1;">
            <label>Event</label>
            <select v-model="newPurposeEventId">
              <option value="">— None —</option>
              <option v-for="e in budgetEvents" :key="e.id" :value="String(e.id)">{{ e.name }}</option>
            </select>
          </div>
          <button class="btn btn-primary" :disabled="bpSaving || !newPurposeName?.trim()" @click="addPurpose">Add</button>
        </div>
        <div v-if="bpError" class="error-box" style="margin-bottom: 12px;">{{ bpError }}</div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Name</th><th>Event</th><th></th></tr></thead>
            <tbody>
              <tr v-for="p in businessPurposes" :key="p.id">
                <td>
                  <input v-if="editingBpId === p.id" v-model="editBpName" style="width: 100%;" />
                  <span v-else>{{ p.name }}</span>
                </td>
                <td>
                  <select v-if="editingBpId === p.id" v-model="editBpEventId">
                    <option value="">— None —</option>
                    <option v-for="e in budgetEvents" :key="e.id" :value="String(e.id)">{{ e.name }}</option>
                  </select>
                  <span v-else>{{ p.event_name || '—' }}</span>
                </td>
                <td>
                  <template v-if="editingBpId === p.id">
                    <button class="btn btn-primary btn-sm" :disabled="bpSaving" @click="savePurpose">Save</button>
                    <button class="btn btn-secondary btn-sm" @click="editingBpId = null">Cancel</button>
                  </template>
                  <template v-else>
                    <button class="btn btn-secondary btn-sm" @click="startEditPurpose(p)">Edit</button>
                    <button class="btn btn-danger btn-sm" :disabled="bpSaving" @click="deletePurpose(p)">Delete</button>
                  </template>
                </td>
              </tr>
              <tr v-if="!businessPurposes.length && !bpLoading"><td colspan="3" class="muted">No business purposes yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Department Accounts -->
      <div v-show="activeTab === 'accounts'" class="card" style="margin-top: 24px;">
        <h2 style="margin: 0 0 12px 0;">Department Accounts</h2>
        <p class="muted" style="margin-bottom: 16px;">Account numbers per department (e.g. 01-61502-01: O.O. Staff Training &amp; Development).</p>
        <div v-for="dept in departments" :key="dept.id" class="dept-accounts-block" style="margin-bottom: 24px; padding: 16px; border: 1px solid var(--border-color, #ddd); border-radius: 8px;">
          <h3 style="margin: 0 0 12px 0;">{{ dept.name }}</h3>
          <div class="form-row" style="display: flex; gap: 12px; align-items: flex-end; margin-bottom: 12px;">
            <div class="field" style="width: 180px;">
              <label>Account number</label>
              <input v-model="newAccountByDept[dept.id].number" type="text" placeholder="e.g. 01-61502-01" />
            </div>
            <div class="field" style="flex: 1;">
              <label>Label</label>
              <input v-model="newAccountByDept[dept.id].label" type="text" placeholder="e.g. O.O. Staff Training & Development" />
            </div>
            <button class="btn btn-primary btn-sm" :disabled="accSaving || !newAccountByDept[dept.id]?.number?.trim() || !newAccountByDept[dept.id]?.label?.trim()" @click="addAccount(dept.id)">
              Add
            </button>
          </div>
          <div v-if="accErrorByDept[dept.id]" class="error-box" style="margin-bottom: 8px;">{{ accErrorByDept[dept.id] }}</div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Account #</th><th>Label</th><th></th></tr></thead>
              <tbody>
                <tr v-for="a in (accountsByDept[dept.id] || [])" :key="a.id">
                  <td>
                    <input v-if="editingAccId === a.id" v-model="editAccNumber" style="width: 140px;" />
                    <span v-else>{{ a.account_number }}</span>
                  </td>
                  <td>
                    <input v-if="editingAccId === a.id" v-model="editAccLabel" style="width: 100%;" />
                    <span v-else>{{ a.label }}</span>
                  </td>
                  <td>
                    <template v-if="editingAccId === a.id">
                      <button class="btn btn-primary btn-sm" :disabled="accSaving" @click="saveAccount(a)">Save</button>
                      <button class="btn btn-secondary btn-sm" @click="editingAccId = null">Cancel</button>
                    </template>
                    <template v-else>
                      <button class="btn btn-secondary btn-sm" @click="startEditAccount(a)">Edit</button>
                      <button class="btn btn-danger btn-sm" :disabled="accSaving" @click="deleteAccount(a)">Delete</button>
                    </template>
                  </td>
                </tr>
                <tr v-if="!accountsByDept[dept.id]?.length && !accLoadingByDept[dept.id]"><td colspan="3" class="muted">No accounts for this department.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-if="!departments.length" class="muted">Add departments in Settings → Workflow → Departments first.</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.budget-tabs .btn.active {
  font-weight: 600;
  border-bottom-color: transparent;
  margin-bottom: -1px;
}
.checkbox-label { display: flex; align-items: center; gap: 6px; font-weight: normal; }
.row-highlight { background: rgba(var(--primary-rgb, 59, 130, 246), 0.12); }
.over-budget { background: rgba(220, 53, 69, 0.08); }

/* Report styling */
.report-printable {
  background: #fff;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.report-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--primary, #3b82f6);
}
.report-logo {
  max-height: 64px;
  max-width: 180px;
  object-fit: contain;
}
.report-header-text { flex: 1; }
.report-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary, #111);
}
.report-meta {
  margin: 6px 0 0 0;
  font-size: 0.9rem;
  color: var(--text-muted, #6b7280);
}
.report-total-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  margin-bottom: 24px;
  background: linear-gradient(135deg, var(--primary, #3b82f6) 0%, #2563eb 100%);
  color: #fff;
  border-radius: 12px;
}
.report-total-label { font-size: 0.875rem; opacity: 0.9; }
.report-total-value { font-size: 2rem; font-weight: 700; margin: 4px 0; }
.report-total-count { font-size: 0.875rem; opacity: 0.85; }
.report-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  margin-bottom: 24px;
}
.report-chart-card {
  padding: 20px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 12px;
  border: 1px solid var(--border-color, #e5e7eb);
}
.report-chart-card h3 {
  margin: 0 0 16px 0;
  font-size: 1rem;
  font-weight: 600;
}
.chart-container {
  position: relative;
  height: 220px;
  margin-bottom: 12px;
}
.report-mini-table {
  width: 100%;
  font-size: 0.875rem;
}
.report-mini-table td { padding: 4px 0; }
.report-tables {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
.report-table-card {
  padding: 16px;
  background: var(--bg-secondary, #f9fafb);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
}
.report-table-card h3 { margin: 0 0 12px 0; font-size: 0.95rem; font-weight: 600; }
</style>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useAgencyStore } from '../../store/agency';
import { useOrganizationStore } from '../../store/organization';
import api from '../../services/api';
import BudgetSubmitExpensesModal from '../../components/budget/BudgetSubmitExpensesModal.vue';
import { toUploadsUrl } from '../../utils/uploadsUrl';
import { Chart, ArcElement, Tooltip, Legend } from 'chart.js';

Chart.register(ArcElement, Tooltip, Legend);

const agencyStore = useAgencyStore();
const organizationStore = useOrganizationStore();
const route = useRoute();
// Prefer organization from route slug (e.g. when navigating from notifications) so we show the correct agency's budget
const effectiveAgency = computed(() => {
  const slug = route.params.organizationSlug;
  if (slug && organizationStore.currentOrganization?.id) return organizationStore.currentOrganization;
  return agencyStore.currentAgency;
});
const agencyId = computed(() => effectiveAgency.value?.id || null);
const orgSlug = computed(() => effectiveAgency.value?.slug || effectiveAgency.value?.portal_url || '');
const reportLogoUrl = computed(() => {
  const a = effectiveAgency.value;
  if (a?.logo_path) return toUploadsUrl(a.logo_path);
  return a?.logo_url || null;
});

function getEventSettings(e) {
  try {
    const s = e?.settings_json;
    return typeof s === 'string' ? JSON.parse(s || '{}') : (s || {});
  } catch { return {}; }
}

function eventPortalUrl(e) {
  const slug = orgSlug.value || effectiveAgency.value?.slug;
  return slug ? `/${slug}/event/${e.slug}` : '#';
}

const tabs = [
  { id: 'fiscal', label: 'Fiscal Year & Allocations' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'reports', label: 'Reports' },
  { id: 'categories', label: 'Expense Categories' },
  { id: 'events', label: 'Events' },
  { id: 'purposes', label: 'Business Purposes' },
  { id: 'accounts', label: 'Department Accounts' }
];
const activeTab = ref('fiscal');
const showSubmitModal = ref(false);

const fiscalYears = ref([]);
const selectedFiscalYearId = ref('');
const totalBudgetEdit = ref(0);
const savingFy = ref(false);
const fyError = ref('');
const showNewFyForm = ref(false);
const newFyYear = ref(new Date().getFullYear());
const newFyBudget = ref(0);

const allocations = ref([]);
const allocationsLoading = ref(false);
const allocationEdits = ref({});
const savingAlloc = ref(false);
const allocError = ref('');
const departments = ref([]);

// Expense categories
const expenseCategories = ref([]);
const catLoading = ref(false);
const catSaving = ref(false);
const catError = ref('');
const newCategoryName = ref('');
const newCategoryOrder = ref(0);
const editingCatId = ref(null);
const editCatName = ref('');

// Budget events
const budgetEvents = ref([]);
const evtLoading = ref(false);
const evtSaving = ref(false);
const evtError = ref('');
const newEventName = ref('');
const newEventDesc = ref('');
const editingEvtId = ref(null);
const editEvtName = ref('');
const editEvtDesc = ref('');
const editEvtPortalEnabled = ref(false);

// Business purposes
const businessPurposes = ref([]);
const bpLoading = ref(false);
const bpSaving = ref(false);
const bpError = ref('');
const newPurposeName = ref('');
const newPurposeEventId = ref('');
const editingBpId = ref(null);
const editBpName = ref('');
const editBpEventId = ref('');

// Department accounts
const accountsByDept = ref({});
const accSaving = ref(false);
const accErrorByDept = ref({});
const accLoadingByDept = ref({});
const newAccountByDept = ref({});
const editingAccId = ref(null);
const editAccNumber = ref('');
const editAccLabel = ref('');
const editAccDepartmentId = ref(null);

// Department switcher (for assistant_admin/provider_plus)
const myDepartments = ref([]);
const selectedDepartmentId = ref(null);

// Expenses tab
const expenses = ref([]);
const expensesLoading = ref(false);
const expenseFilters = ref({ q: '', departmentId: '', categoryId: '', status: '', dateFrom: '', dateTo: '' });
const expenseActionLoading = ref(null);
const highlightedExpenseId = ref(null);
const aiSuggestions = ref([]);
const aiAnalyzing = ref(false);

const reportFilters = ref({ departmentId: '', categoryId: '', dateFrom: '', dateTo: '', status: 'approved' });
const reportLoading = ref(false);
const reportError = ref('');
const expenseReport = ref(null);
const reportContentRef = ref(null);
const chartCategoryRef = ref(null);
const chartDepartmentRef = ref(null);
let chartCategory = null;
let chartDepartment = null;

const selectedFiscalYear = computed(() =>
  fiscalYears.value.find((fy) => String(fy.id) === selectedFiscalYearId.value)
);

const allocationsWithDepts = computed(() => {
  const allocMap = new Map((allocations.value || []).map((a) => [a.department_id, a]));
  const result = [];
  for (const d of departments.value || []) {
    const alloc = allocMap.get(d.id);
    const allocated = allocationEdits.value[d.id] ?? alloc?.allocated_amount ?? 0;
    const spent = Number(alloc?.spent_amount) || 0;
    const remaining = Number(alloc?.remaining_amount) ?? Math.max(0, (Number(allocated) || 0) - spent);
    result.push({
      department_id: d.id,
      department_name: d.name,
      allocated_amount: allocated,
      spent_amount: spent,
      remaining_amount: remaining
    });
  }
  return result;
});

const totalAllocated = computed(() =>
  allocationsWithDepts.value.reduce((s, a) => s + (Number(allocationEdits.value[a.department_id]) || 0), 0)
);
const totalSpent = computed(() =>
  allocationsWithDepts.value.reduce((s, a) => s + (Number(a.spent_amount) || 0), 0)
);

async function loadFiscalYears() {
  if (!agencyId.value) return;
  try {
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/fiscal-years`);
    fiscalYears.value = data || [];
    if (!selectedFiscalYearId.value && fiscalYears.value.length) {
      selectedFiscalYearId.value = String(fiscalYears.value[0].id);
    }
  } catch (e) {
    fyError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
  }
}

async function loadDepartments() {
  if (!agencyId.value) return;
  try {
    const { data } = await api.get(`/agencies/${agencyId.value}/departments`);
    departments.value = data || [];
  } catch {
    departments.value = [];
  }
}

async function loadAllocations() {
  if (!selectedFiscalYearId.value) return;
  allocationsLoading.value = true;
  allocError.value = '';
  try {
    const { data } = await api.get(`/budget/fiscal-years/${selectedFiscalYearId.value}/allocations`);
    allocations.value = data || [];
    const edits = {};
    for (const a of allocations.value) {
      edits[a.department_id] = Number(a.allocated_amount) || 0;
    }
    for (const d of departments.value || []) {
      if (!(d.id in edits)) edits[d.id] = 0;
    }
    allocationEdits.value = edits;
  } catch (e) {
    allocError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    allocationsLoading.value = false;
  }
}

async function loadExpenseCategories() {
  if (!agencyId.value) return;
  catLoading.value = true;
  catError.value = '';
  try {
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/expense-categories`);
    expenseCategories.value = data || [];
  } catch (e) {
    catError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    catLoading.value = false;
  }
}

async function loadBudgetEvents() {
  if (!agencyId.value) return;
  evtLoading.value = true;
  evtError.value = '';
  try {
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/events`);
    budgetEvents.value = data || [];
  } catch (e) {
    evtError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    evtLoading.value = false;
  }
}

async function loadBusinessPurposes() {
  if (!agencyId.value) return;
  bpLoading.value = true;
  bpError.value = '';
  try {
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/business-purposes`);
    businessPurposes.value = data || [];
  } catch (e) {
    bpError.value = e.response?.data?.error?.message || e.message || 'Failed to load';
  } finally {
    bpLoading.value = false;
  }
}

async function loadAccountsForDepartment(deptId) {
  accLoadingByDept.value = { ...accLoadingByDept.value, [deptId]: true };
  accErrorByDept.value = { ...accErrorByDept.value, [deptId]: '' };
  try {
    const { data } = await api.get(`/budget/departments/${deptId}/accounts`);
    accountsByDept.value = { ...accountsByDept.value, [deptId]: data || [] };
  } catch (e) {
    accErrorByDept.value = { ...accErrorByDept.value, [deptId]: e.response?.data?.error?.message || e.message || 'Failed to load' };
  } finally {
    accLoadingByDept.value = { ...accLoadingByDept.value, [deptId]: false };
  }
}

async function loadAllAccounts() {
  for (const d of departments.value || []) {
    await loadAccountsForDepartment(d.id);
  }
}

async function loadExpenses() {
  if (!agencyId.value) return;
  expensesLoading.value = true;
  try {
    const params = new URLSearchParams();
    if (expenseFilters.value.q) params.set('q', expenseFilters.value.q);
    const deptId = expenseFilters.value.departmentId || selectedDepartmentId.value;
    if (deptId) params.set('departmentId', deptId);
    if (expenseFilters.value.categoryId) params.set('categoryId', expenseFilters.value.categoryId);
    if (expenseFilters.value.dateFrom) params.set('dateFrom', expenseFilters.value.dateFrom);
    if (expenseFilters.value.dateTo) params.set('dateTo', expenseFilters.value.dateTo);
    if (expenseFilters.value.status) params.set('status', expenseFilters.value.status);
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/expenses?${params}`);
    expenses.value = data.items || [];
  } catch (e) {
    expenses.value = [];
  } finally {
    expensesLoading.value = false;
  }
}

async function approveExpense(e) {
  if (!agencyId.value || !e?.id) return;
  expenseActionLoading.value = e.id;
  try {
    await api.put(`/budget/agencies/${agencyId.value}/expenses/${e.id}`, { status: 'approved' });
    await Promise.all([loadExpenses(), loadAllocations()]);
    highlightedExpenseId.value = null;
  } catch (err) {
    alert(err?.response?.data?.error?.message || err?.message || 'Failed to approve');
  } finally {
    expenseActionLoading.value = null;
  }
}

async function rejectExpense(e) {
  if (!agencyId.value || !e?.id) return;
  const note = window.prompt('Rejection reason (optional):');
  if (note === null) return; // user cancelled
  expenseActionLoading.value = e.id;
  try {
    await api.put(`/budget/agencies/${agencyId.value}/expenses/${e.id}`, { status: 'rejected', rejectionNote: note || undefined });
    await loadExpenses();
    highlightedExpenseId.value = null;
  } catch (err) {
    alert(err?.response?.data?.error?.message || err?.message || 'Failed to reject');
  } finally {
    expenseActionLoading.value = null;
  }
}

async function exportExpensesCsv() {
  if (!agencyId.value) return;
  try {
    const params = new URLSearchParams();
    if (expenseFilters.value.q) params.set('q', expenseFilters.value.q);
    if (expenseFilters.value.departmentId) params.set('departmentId', expenseFilters.value.departmentId);
    if (expenseFilters.value.categoryId) params.set('categoryId', expenseFilters.value.categoryId);
    if (expenseFilters.value.dateFrom) params.set('dateFrom', expenseFilters.value.dateFrom);
    if (expenseFilters.value.dateTo) params.set('dateTo', expenseFilters.value.dateTo);
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/expenses/export.csv?${params}`, { responseType: 'blob' });
    const blob = new Blob([data], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budget-expenses-${agencyId.value}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    console.error('Export failed:', e);
  }
}

async function loadAiInsights() {
  if (!agencyId.value) return;
  aiAnalyzing.value = true;
  aiSuggestions.value = [];
  try {
    const { data } = await api.post(`/budget/agencies/${agencyId.value}/expenses/analyze`);
    aiSuggestions.value = data.suggestions || [];
  } catch (e) {
    aiSuggestions.value = [e.response?.data?.error?.message || e.message || 'Failed to analyze'];
  } finally {
    aiAnalyzing.value = false;
  }
}

async function loadReport() {
  if (!agencyId.value) return;
  reportLoading.value = true;
  reportError.value = '';
  expenseReport.value = null;
  try {
    const params = new URLSearchParams();
    if (reportFilters.value.departmentId) params.set('departmentId', reportFilters.value.departmentId);
    if (reportFilters.value.categoryId) params.set('categoryId', reportFilters.value.categoryId);
    if (reportFilters.value.dateFrom) params.set('dateFrom', reportFilters.value.dateFrom);
    if (reportFilters.value.dateTo) params.set('dateTo', reportFilters.value.dateTo);
    if (reportFilters.value.status) params.set('status', reportFilters.value.status);
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/expenses/report?${params}`);
    expenseReport.value = data;
    await nextTick();
    createReportCharts();
  } catch (e) {
    reportError.value = e.response?.data?.error?.message || e.message || 'Failed to load report';
  } finally {
    reportLoading.value = false;
  }
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

function createReportCharts() {
  destroyReportCharts();
  const report = expenseReport.value;
  if (!report) return;
  if (chartCategoryRef.value && report.byCategory?.length) {
    chartCategory = new Chart(chartCategoryRef.value, {
      type: 'doughnut',
      data: {
        labels: report.byCategory.map((r) => r.name),
        datasets: [{
          data: report.byCategory.map((r) => r.amount),
          backgroundColor: CHART_COLORS,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                const pct = report.total ? ((v / report.total) * 100).toFixed(1) : 0;
                return `$${v.toFixed(2)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }
  if (chartDepartmentRef.value && report.byDepartment?.length) {
    chartDepartment = new Chart(chartDepartmentRef.value, {
      type: 'doughnut',
      data: {
        labels: report.byDepartment.map((r) => r.name),
        datasets: [{
          data: report.byDepartment.map((r) => r.amount),
          backgroundColor: CHART_COLORS,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                const pct = report.total ? ((v / report.total) * 100).toFixed(1) : 0;
                return `$${v.toFixed(2)} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  }
}

function destroyReportCharts() {
  if (chartCategory) {
    chartCategory.destroy();
    chartCategory = null;
  }
  if (chartDepartment) {
    chartDepartment.destroy();
    chartDepartment = null;
  }
}

async function exportReportPdf() {
  if (!reportContentRef.value) return;
  try {
    const html2canvas = (await import('html2canvas')).default;
    const { PDFDocument } = await import('pdf-lib');
    const canvas = await html2canvas(reportContentRef.value, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    const imgData = canvas.toDataURL('image/png');
    const base64 = imgData.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([canvas.width, canvas.height]);
    const pngImage = await pdfDoc.embedPng(bytes);
    page.drawImage(pngImage, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-report-${effectiveAgency.value?.name || 'agency'}-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('PDF export failed:', e);
    alert(e?.message || 'Failed to export PDF');
  }
}

onBeforeUnmount(() => {
  destroyReportCharts();
});

async function loadMyDepartments() {
  if (!agencyId.value) return;
  try {
    const { data } = await api.get(`/budget/agencies/${agencyId.value}/my-departments`);
    myDepartments.value = data || [];
    if (myDepartments.value.length === 1) selectedDepartmentId.value = myDepartments.value[0].id;
    else selectedDepartmentId.value = null;
  } catch {
    myDepartments.value = [];
  }
}

watch(agencyId, () => {
  loadFiscalYears();
  loadDepartments();
  loadExpenseCategories();
  loadBudgetEvents();
  loadBusinessPurposes();
  loadMyDepartments();
  if (activeTab.value === 'expenses') loadExpenses();
}, { immediate: true });

watch(departments, (depts) => {
  const next = {};
  for (const d of depts || []) {
    next[d.id] = newAccountByDept.value[d.id] ?? { number: '', label: '' };
  }
  newAccountByDept.value = next;
  if (agencyId.value && depts?.length) loadAllAccounts();
}, { immediate: true });

watch([activeTab, selectedDepartmentId], () => {
  if (activeTab.value === 'accounts' && departments.value?.length) loadAllAccounts();
  if (activeTab.value === 'expenses' && agencyId.value) loadExpenses();
  if (activeTab.value === 'reports' && agencyId.value && !expenseReport.value && !reportLoading.value) loadReport();
});

watch([selectedFiscalYearId, departments], () => {
  if (selectedFiscalYearId.value) loadAllocations();
  if (selectedFiscalYear.value) {
    totalBudgetEdit.value = Number(selectedFiscalYear.value.total_operating_budget) || 0;
  }
}, { immediate: true });

watch(selectedFiscalYear, (fy) => {
  if (fy) totalBudgetEdit.value = Number(fy.total_operating_budget) || 0;
}, { immediate: true });

onMounted(() => {
  const q = route.query || {};
  if (q.tab === 'expenses') {
    activeTab.value = 'expenses';
    if (q.status) expenseFilters.value.status = q.status;
    if (q.expenseId) {
      highlightedExpenseId.value = parseInt(q.expenseId, 10);
      setTimeout(() => { highlightedExpenseId.value = null; }, 3000);
    }
  }
});

function openNewFiscalYear() {
  showNewFyForm.value = true;
  newFyYear.value = new Date().getFullYear();
  newFyBudget.value = 0;
}

async function createFiscalYear() {
  if (!agencyId.value) return;
  savingFy.value = true;
  fyError.value = '';
  try {
    await api.post(`/budget/agencies/${agencyId.value}/fiscal-years`, {
      year: newFyYear.value,
      totalOperatingBudget: newFyBudget.value
    });
    showNewFyForm.value = false;
    await loadFiscalYears();
    selectedFiscalYearId.value = String(fiscalYears.value[0]?.id || '');
  } catch (e) {
    fyError.value = e.response?.data?.error?.message || e.message || 'Failed to create';
  } finally {
    savingFy.value = false;
  }
}

async function saveFiscalYear() {
  if (!selectedFiscalYearId.value || !agencyId.value) return;
  savingFy.value = true;
  fyError.value = '';
  try {
    await api.put(`/budget/agencies/${agencyId.value}/fiscal-years/${selectedFiscalYearId.value}`, {
      totalOperatingBudget: totalBudgetEdit.value
    });
    await loadFiscalYears();
  } catch (e) {
    fyError.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    savingFy.value = false;
  }
}

async function saveAllocations() {
  if (!selectedFiscalYearId.value) return;
  savingAlloc.value = true;
  allocError.value = '';
  try {
    const payload = allocationsWithDepts.value.map((a) => ({
      departmentId: a.department_id,
      allocatedAmount: Number(allocationEdits.value[a.department_id]) || 0
    }));
    await api.put(`/budget/fiscal-years/${selectedFiscalYearId.value}/allocations`, { allocations: payload });
    await loadAllocations();
  } catch (e) {
    allocError.value = e.response?.data?.error?.message || e.message || 'Failed to save';
  } finally {
    savingAlloc.value = false;
  }
}

// Expense categories CRUD
async function addCategory() {
  if (!agencyId.value || !newCategoryName.value?.trim()) return;
  catSaving.value = true;
  catError.value = '';
  try {
    await api.post(`/budget/agencies/${agencyId.value}/expense-categories`, {
      name: newCategoryName.value.trim(),
      displayOrder: Number(newCategoryOrder.value) || 0
    });
    newCategoryName.value = '';
    newCategoryOrder.value = 0;
    await loadExpenseCategories();
  } catch (e) {
    catError.value = e.response?.data?.error?.message || e.message || 'Failed to add';
  } finally {
    catSaving.value = false;
  }
}

function startEditCategory(c) {
  editingCatId.value = c.id;
  editCatName.value = c.name;
}

async function saveCategory() {
  if (!agencyId.value || !editingCatId.value || !editCatName.value?.trim()) return;
  catSaving.value = true;
  catError.value = '';
  try {
    await api.put(`/budget/agencies/${agencyId.value}/expense-categories/${editingCatId.value}`, {
      name: editCatName.value.trim()
    });
    editingCatId.value = null;
    editCatName.value = '';
    await loadExpenseCategories();
  } catch (e) {
    catError.value = e.response?.data?.error?.message || e.message || 'Failed to update';
  } finally {
    catSaving.value = false;
  }
}

async function deleteCategory(c) {
  if (!confirm(`Delete category "${c.name}"?`)) return;
  catSaving.value = true;
  catError.value = '';
  try {
    await api.delete(`/budget/agencies/${agencyId.value}/expense-categories/${c.id}`);
    if (editingCatId.value === c.id) editingCatId.value = null;
    await loadExpenseCategories();
  } catch (e) {
    catError.value = e.response?.data?.error?.message || e.message || 'Failed to delete';
  } finally {
    catSaving.value = false;
  }
}

// Budget events CRUD
async function addEvent() {
  if (!agencyId.value || !newEventName.value?.trim()) return;
  evtSaving.value = true;
  evtError.value = '';
  try {
    await api.post(`/budget/agencies/${agencyId.value}/events`, {
      name: newEventName.value.trim(),
      description: newEventDesc.value?.trim() || null
    });
    newEventName.value = '';
    newEventDesc.value = '';
    await loadBudgetEvents();
    await loadBusinessPurposes();
  } catch (e) {
    evtError.value = e.response?.data?.error?.message || e.message || 'Failed to add';
  } finally {
    evtSaving.value = false;
  }
}

function startEditEvent(e) {
  editingEvtId.value = e.id;
  editEvtName.value = e.name;
  editEvtDesc.value = e.description || '';
  editEvtPortalEnabled.value = !!getEventSettings(e).portalEnabled;
}

async function saveEvent() {
  if (!agencyId.value || !editingEvtId.value || !editEvtName.value?.trim()) return;
  evtSaving.value = true;
  evtError.value = '';
  try {
    await api.put(`/budget/agencies/${agencyId.value}/events/${editingEvtId.value}`, {
      name: editEvtName.value.trim(),
      description: editEvtDesc.value?.trim() || null,
      settings: { portalEnabled: editEvtPortalEnabled.value }
    });
    editingEvtId.value = null;
    editEvtName.value = '';
    editEvtDesc.value = '';
    await loadBudgetEvents();
    await loadBusinessPurposes();
  } catch (e) {
    evtError.value = e.response?.data?.error?.message || e.message || 'Failed to update';
  } finally {
    evtSaving.value = false;
  }
}

async function deleteEvent(e) {
  if (!confirm(`Delete event "${e.name}"?`)) return;
  evtSaving.value = true;
  evtError.value = '';
  try {
    await api.delete(`/budget/agencies/${agencyId.value}/events/${e.id}`);
    if (editingEvtId.value === e.id) editingEvtId.value = null;
    await loadBudgetEvents();
    await loadBusinessPurposes();
  } catch (err) {
    evtError.value = err.response?.data?.error?.message || err.message || 'Failed to delete';
  } finally {
    evtSaving.value = false;
  }
}

// Business purposes CRUD
async function addPurpose() {
  if (!agencyId.value || !newPurposeName.value?.trim()) return;
  bpSaving.value = true;
  bpError.value = '';
  try {
    await api.post(`/budget/agencies/${agencyId.value}/business-purposes`, {
      name: newPurposeName.value.trim(),
      eventId: newPurposeEventId.value ? parseInt(newPurposeEventId.value, 10) : null
    });
    newPurposeName.value = '';
    newPurposeEventId.value = '';
    await loadBusinessPurposes();
  } catch (e) {
    bpError.value = e.response?.data?.error?.message || e.message || 'Failed to add';
  } finally {
    bpSaving.value = false;
  }
}

function startEditPurpose(p) {
  editingBpId.value = p.id;
  editBpName.value = p.name;
  editBpEventId.value = p.event_id ? String(p.event_id) : '';
}

async function savePurpose() {
  if (!agencyId.value || !editingBpId.value || !editBpName.value?.trim()) return;
  bpSaving.value = true;
  bpError.value = '';
  try {
    await api.put(`/budget/agencies/${agencyId.value}/business-purposes/${editingBpId.value}`, {
      name: editBpName.value.trim(),
      eventId: editBpEventId.value ? parseInt(editBpEventId.value, 10) : null
    });
    editingBpId.value = null;
    editBpName.value = '';
    editBpEventId.value = '';
    await loadBusinessPurposes();
  } catch (e) {
    bpError.value = e.response?.data?.error?.message || e.message || 'Failed to update';
  } finally {
    bpSaving.value = false;
  }
}

async function deletePurpose(p) {
  if (!confirm(`Delete business purpose "${p.name}"?`)) return;
  bpSaving.value = true;
  bpError.value = '';
  try {
    await api.delete(`/budget/agencies/${agencyId.value}/business-purposes/${p.id}`);
    if (editingBpId.value === p.id) editingBpId.value = null;
    await loadBusinessPurposes();
  } catch (e) {
    bpError.value = e.response?.data?.error?.message || e.message || 'Failed to delete';
  } finally {
    bpSaving.value = false;
  }
}

// Department accounts CRUD
async function addAccount(deptId) {
  const n = newAccountByDept.value[deptId];
  if (!n?.number?.trim() || !n?.label?.trim()) return;
  accSaving.value = true;
  accErrorByDept.value = { ...accErrorByDept.value, [deptId]: '' };
  try {
    await api.post(`/budget/departments/${deptId}/accounts`, {
      accountNumber: n.number.trim(),
      label: n.label.trim()
    });
    newAccountByDept.value = { ...newAccountByDept.value, [deptId]: { number: '', label: '' } };
    await loadAccountsForDepartment(deptId);
  } catch (e) {
    accErrorByDept.value = { ...accErrorByDept.value, [deptId]: e.response?.data?.error?.message || e.message || 'Failed to add' };
  } finally {
    accSaving.value = false;
  }
}

function startEditAccount(a) {
  editingAccId.value = a.id;
  editAccNumber.value = a.account_number;
  editAccLabel.value = a.label;
  editAccDepartmentId.value = a.department_id;
}

async function saveAccount(a) {
  if (!editingAccId.value || !editAccNumber.value?.trim() || !editAccLabel.value?.trim()) return;
  accSaving.value = true;
  accErrorByDept.value = { ...accErrorByDept.value, [a.department_id]: '' };
  try {
    await api.put(`/budget/departments/${a.department_id}/accounts/${a.id}`, {
      accountNumber: editAccNumber.value.trim(),
      label: editAccLabel.value.trim()
    });
    editingAccId.value = null;
    editAccNumber.value = '';
    editAccLabel.value = '';
    editAccDepartmentId.value = null;
    await loadAccountsForDepartment(a.department_id);
  } catch (e) {
    accErrorByDept.value = { ...accErrorByDept.value, [a.department_id]: e.response?.data?.error?.message || e.message || 'Failed to update' };
  } finally {
    accSaving.value = false;
  }
}

async function deleteAccount(a) {
  if (!confirm(`Delete account "${a.account_number}"?`)) return;
  accSaving.value = true;
  accErrorByDept.value = { ...accErrorByDept.value, [a.department_id]: '' };
  try {
    await api.delete(`/budget/departments/${a.department_id}/accounts/${a.id}`);
    if (editingAccId.value === a.id) editingAccId.value = null;
    await loadAccountsForDepartment(a.department_id);
  } catch (e) {
    accErrorByDept.value = { ...accErrorByDept.value, [a.department_id]: e.response?.data?.error?.message || e.message || 'Failed to delete' };
  } finally {
    accSaving.value = false;
  }
}
</script>
