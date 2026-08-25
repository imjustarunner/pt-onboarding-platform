<template>
  <div class="gem-page">
    <header class="gem-header">
      <div>
        <h1 class="gem-title">Gear, Equipment &amp; Materials</h1>
        <p class="gem-sub">
          Track stock, issued items, sent materials, and reorders across all agencies.
        </p>
      </div>
      <div class="gem-header-actions">
        <button
          v-if="viewMode === 'packages'"
          type="button"
          class="btn btn-primary"
          @click="packagesPanelRef?.startCreate?.()"
        >+ New Package</button>
        <button v-else type="button" class="btn btn-primary" @click="openCreate">+ Add Item</button>
      </div>
    </header>

    <div v-if="loading && !items.length" class="gem-empty">Loading catalog…</div>
    <div v-else-if="error" class="gem-error">{{ error }}</div>

    <template v-else>
      <section class="gem-summary">
        <div class="gem-stat">
          <div class="gem-stat-value">{{ summary.totalItemTypes }}</div>
          <div class="gem-stat-label">Total Item Types</div>
          <div class="gem-stat-hint">Across all categories</div>
        </div>
        <div class="gem-stat">
          <div class="gem-stat-value">{{ formatNum(summary.totalInventory) }}</div>
          <div class="gem-stat-label">Total Inventory</div>
          <div class="gem-stat-hint">Across all agencies</div>
        </div>
        <div class="gem-stat">
          <div class="gem-stat-value">{{ formatNum(summary.issuedSent30d) }}</div>
          <div class="gem-stat-label">Issued / Sent</div>
          <div class="gem-stat-hint">Last 30 days</div>
        </div>
        <div class="gem-stat" :class="{ 'gem-stat--warn': summary.lowStock > 0 }">
          <div class="gem-stat-value">{{ summary.lowStock }}</div>
          <div class="gem-stat-label">Low Stock</div>
          <div class="gem-stat-hint">Reorder suggested</div>
        </div>
        <div class="gem-stat">
          <div class="gem-stat-value">{{ summary.agenciesManaged }}</div>
          <div class="gem-stat-label">Agencies Managed</div>
          <div class="gem-stat-hint">Tenant agencies</div>
        </div>
      </section>

      <div class="gem-view-tabs">
        <button
          type="button"
          class="gem-view-tab"
          :class="{ on: viewMode === 'inventory' }"
          @click="viewMode = 'inventory'"
        >Inventory</button>
        <button
          type="button"
          class="gem-view-tab"
          :class="{ on: viewMode === 'packages' }"
          @click="viewMode = 'packages'; closeDetail()"
        >Packages</button>
      </div>

      <GearPackagesPanel
        v-if="viewMode === 'packages'"
        ref="packagesPanelRef"
        :agencies="agencies"
        :catalog-items="packageCatalogItems.length ? packageCatalogItems : items"
        @issued="reload"
      />

      <template v-else>
      <div class="gem-filters">
        <select v-model="filters.agencyId" class="gem-select" @change="onAgencyFilterChange">
          <option value="">All Agencies</option>
          <option v-for="a in agencies" :key="a.id" :value="String(a.id)">{{ a.name }}</option>
        </select>
        <select v-model="filters.category" class="gem-select" @change="reload">
          <option value="all">All Types</option>
          <option v-for="c in categoryOptions" :key="c" :value="c">{{ labelCat(c) }}</option>
        </select>
        <select v-model="filters.status" class="gem-select" @change="reload">
          <option value="all">All Statuses</option>
          <option value="healthy">Healthy</option>
          <option value="low">Low</option>
          <option value="reorder">Reorder</option>
        </select>
        <select v-model="filters.sort" class="gem-select" @change="reload">
          <option value="type">Sort by Type</option>
          <option value="agency">Sort by Agency count</option>
          <option value="status">Sort by Status</option>
        </select>
        <input
          v-model="filters.search"
          class="gem-search"
          type="search"
          placeholder="Search items…"
          @keydown.enter="reload"
        />
        <button type="button" class="btn btn-secondary btn-sm" @click="reload">Search</button>
      </div>

      <div class="gem-tabs">
        <button
          v-for="tab in categoryTabs"
          :key="tab.id"
          type="button"
          class="gem-tab"
          :class="{ on: filters.category === tab.id }"
          @click="filters.category = tab.id; reload()"
        >{{ tab.label }}</button>
      </div>

      <div class="gem-main" :class="{ 'gem-main--split': !!detail && !detailExpanded, 'gem-main--full': !!detail && detailExpanded }">
        <div v-show="!detailExpanded" class="gem-table-wrap">
          <table class="gem-table">
            <thead>
              <tr>
                <th></th>
                <th>Item Type</th>
                <th>Category</th>
                <th>Agencies</th>
                <th>Stock Mode</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Available</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in items"
                :key="item.id"
                :class="{ selected: selectedId === item.id }"
                @click="openItem(item)"
              >
                <td>
                  <div class="gem-thumb">
                    <img v-if="item.primaryImage?.url" :src="item.primaryImage.url" :alt="item.name" />
                    <span v-else class="gem-thumb-ph">{{ initials(item.name) }}</span>
                  </div>
                </td>
                <td class="gem-strong">{{ item.name }}</td>
                <td><span class="gem-pill" :class="`cat-${item.category}`">{{ labelCat(item.category) }}</span></td>
                <td>{{ item.agencyCount }} {{ item.agencyCount === 1 ? 'agency' : 'agencies' }}</td>
                <td>{{ item.stockModeLabel }}</td>
                <td>
                  <span v-if="item.ownerDisplay?.name">{{ item.ownerDisplay.name }}</span>
                  <span v-else class="muted">Unassigned</span>
                </td>
                <td>
                  <span class="gem-status" :class="item.status">{{ statusLabel(item.status) }}</span>
                </td>
                <td>
                  <span>{{ item.availableDisplay }}</span>
                  <div v-if="item.agencyCount > 1" class="muted gem-avail-sub">across agencies</div>
                </td>
              </tr>
              <tr v-if="!items.length">
                <td colspan="8" class="gem-empty-row">No catalog items yet. Add an item to get started.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside v-if="detail" class="gem-detail" :class="{ 'gem-detail--expanded': detailExpanded }">
          <div class="gem-detail-head">
            <div>
              <h2>{{ detail.name }}</h2>
              <span class="gem-pill" :class="`cat-${detail.category}`">{{ labelCat(detail.category) }}</span>
            </div>
            <div class="gem-detail-head-btns">
              <button
                type="button"
                class="gem-icon-btn"
                :title="detailExpanded ? 'Exit full window' : 'Full window'"
                @click="detailExpanded = !detailExpanded"
              >{{ detailExpanded ? '⤢' : '⛶' }}</button>
              <button type="button" class="gem-close" @click="closeDetail">×</button>
            </div>
          </div>

          <div class="gem-detail-actions">
            <button type="button" class="btn btn-secondary btn-sm" @click="openEdit(detail)">Edit Item</button>
            <button
              v-if="detail.stockMode === 'COUNTED' && detail.trackingMode !== 'UNIQUE_ASSET'"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="!detailAgencyId"
              @click="focusAddInventory"
            >
              + Add Inventory
            </button>
            <button
              v-if="detail.stockMode === 'COUNTED'"
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="!detailAgencyId"
              @click="focusIssue"
            >
              Issue Gear
            </button>
          </div>

          <div class="gem-agency-picker">
            <label class="gem-agency-picker-label">Working agency</label>
            <div class="gem-agency-chips">
              <button
                v-for="ag in detail.agencies"
                :key="ag.agencyId"
                type="button"
                class="gem-chip"
                :class="{ on: Number(detailAgencyId) === Number(ag.agencyId) }"
                @click="setDetailAgency(ag.agencyId)"
              >
                {{ ag.agencyName }}
                <span class="muted"> · {{ ag.available ?? '—' }}</span>
              </button>
            </div>
            <p v-if="!detailAgencyId" class="gem-hint gem-hint--warn">
              Select an agency above (or filter the list by agency) before managing size inventory or issuing gear.
            </p>
          </div>

          <div class="gem-detail-summary">
            <div class="gem-photos gem-photos--compact">
              <div class="gem-photo-main">
                <img v-if="activePhoto" :src="activePhoto.url" :alt="detail.name" />
                <div v-else class="gem-photo-empty">No photo</div>
              </div>
              <div class="gem-photo-thumbs">
                <button
                  v-for="img in detail.images || []"
                  :key="img.id"
                  type="button"
                  class="gem-photo-thumb"
                  :class="{ on: activePhotoId === img.id }"
                  @click="activePhotoId = img.id"
                >
                  <img :src="img.url" alt="" />
                </button>
                <label class="gem-photo-add">
                  +
                  <input type="file" accept="image/*" hidden @change="onUploadPhoto" />
                </label>
              </div>
            </div>
            <dl class="gem-meta">
              <div><dt>Description</dt><dd>{{ detail.description || '—' }}</dd></div>
              <div><dt>SKU</dt><dd>{{ detail.sku || '—' }}</dd></div>
              <div><dt>Unit</dt><dd>{{ detail.unit || 'Each' }}</dd></div>
              <div><dt>Stock mode</dt><dd>{{ detail.stockModeLabel }}</dd></div>
              <div><dt>Reorder / low</dt><dd>{{ detail.defaultLowStockThreshold }} units</dd></div>
            </dl>
          </div>

          <template v-if="detailAgencyId && selectedEnrollment">
            <div class="gem-owner-row">
              <div>
                <div class="muted">Responsible for {{ selectedEnrollment.agencyName }}</div>
                <PersonSearchSelect
                  :model-value="selectedEnrollment.responsibleUserId || 0"
                  :options="personOptionsFor(selectedEnrollment.agencyId)"
                  placeholder="Search owner…"
                  @update:model-value="onAssignOwner(selectedEnrollment.agencyId, $event || '')"
                />
              </div>
              <span class="gem-status" :class="selectedEnrollment.status">{{ statusLabel(selectedEnrollment.status) }}</span>
            </div>

            <!-- Size inventory -->
            <section v-if="detail.stockMode === 'COUNTED' && detail.trackingMode !== 'UNIQUE_ASSET'" class="gem-section">
              <div class="gem-section-head">
                <h3>Size Inventory</h3>
                <span class="muted" v-if="stockLoading">Loading…</span>
              </div>
              <div class="gem-size-filters" v-if="hasVariantColumns || detail.isGendered">
                <select v-if="detail.isGendered || genderFilterOptions.length" v-model="sizeFilters.gender" class="gem-select gem-select--sm">
                  <option value="">All genders</option>
                  <option v-for="g in genderFilterOptions" :key="g" :value="g">{{ g === 'women' ? "Women's" : g === 'men' ? "Men's" : g }}</option>
                </select>
                <select v-if="colorFilterOptions.length" v-model="sizeFilters.color" class="gem-select gem-select--sm">
                  <option value="">All colors</option>
                  <option v-for="c in colorFilterOptions" :key="c" :value="c">{{ c }}</option>
                </select>
                <select v-if="decorationFilterOptions.length" v-model="sizeFilters.decoration" class="gem-select gem-select--sm">
                  <option value="">All decorations</option>
                  <option v-for="d in decorationFilterOptions" :key="d" :value="d">{{ d }}</option>
                </select>
              </div>
              <div v-if="actionError" class="gem-error">{{ actionError }}</div>
              <table class="gem-mini-table">
                <thead>
                  <tr>
                    <th v-if="detail.isGendered || hasGenderInStock">
                      <button type="button" class="gem-th-sort" @click="toggleSizeSort('gender')">
                        Gender {{ sizeSortIndicator('gender') }}
                      </button>
                    </th>
                    <th>
                      <button type="button" class="gem-th-sort" @click="toggleSizeSort('size')">
                        Size {{ sizeSortIndicator('size') }}
                      </button>
                    </th>
                    <th v-if="hasVariantColumns || colorFilterOptions.length">
                      <button type="button" class="gem-th-sort" @click="toggleSizeSort('color')">
                        Color {{ sizeSortIndicator('color') }}
                      </button>
                    </th>
                    <th v-if="hasVariantColumns || decorationFilterOptions.length">
                      <button type="button" class="gem-th-sort" @click="toggleSizeSort('decoration')">
                        Decoration {{ sizeSortIndicator('decoration') }}
                      </button>
                    </th>
                    <th>
                      <button type="button" class="gem-th-sort" @click="toggleSizeSort('amount')">
                        Available {{ sizeSortIndicator('amount') }}
                      </button>
                    </th>
                    <th>
                      <button type="button" class="gem-th-sort" @click="toggleSizeSort('status')">
                        Status {{ sizeSortIndicator('status') }}
                      </button>
                    </th>
                    <th>Quick add</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in displayedSizeRows" :key="row.key">
                    <td v-if="detail.isGendered || hasGenderInStock">{{ row.genderLabel || '—' }}</td>
                    <td>{{ row.sizeLabel }}</td>
                    <td v-if="hasVariantColumns || colorFilterOptions.length">{{ row.color || '—' }}</td>
                    <td v-if="hasVariantColumns || decorationFilterOptions.length">{{ row.decoration || '—' }}</td>
                    <td><strong>{{ row.quantityOnHand }}</strong></td>
                    <td>
                      <span class="gem-status" :class="row.isLow ? 'low' : 'healthy'">
                        {{ row.isLow ? 'Low' : 'Healthy' }}
                      </span>
                    </td>
                    <td>
                      <div class="gem-inline-add">
                        <input
                          :value="quickAddValue(row.key)"
                          type="number"
                          min="1"
                          class="gem-qty"
                          @input="quickAddByKey[row.key] = Number($event.target.value) || 1"
                        />
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          :disabled="saving"
                          @click="addStockForSize(row)"
                        >Add</button>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!displayedSizeRows.length && !stockLoading">
                    <td :colspan="sizeTableColspan" class="muted">No size rows yet — add inventory below to create sizes.</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="displayedSizeRows.length" class="gem-hint" style="margin-top:8px">
                Showing {{ displayedSizeRows.length }} row(s)
                <span v-if="sizeFilters.color || sizeFilters.decoration || sizeFilters.gender">
                  · filtered · {{ filteredAvailableTotal }} available
                </span>
              </p>
            </section>

            <div class="gem-ops-grid">
              <section
                v-if="detail.stockMode === 'COUNTED' && detail.trackingMode !== 'UNIQUE_ASSET'"
                class="gem-section"
                ref="addSectionRef"
              >
                <h3>Add Inventory</h3>
                <label>
                  Size
                  <select v-model="addForm.sizeLabel" class="gem-select">
                    <option disabled value="">Select size</option>
                    <option v-for="s in sizeOptionsForAgency" :key="s" :value="s">{{ s }}</option>
                  </select>
                </label>
                <label v-if="detail.isGendered">
                  Gender
                  <select v-model="addForm.gender" class="gem-select">
                    <option value="">—</option>
                    <option value="women">Women's</option>
                    <option value="men">Men's</option>
                  </select>
                </label>
                <label>
                  Color
                  <select v-model="addForm.color" class="gem-select">
                    <option value="">— (none)</option>
                    <option v-for="c in colorOptionsForItem" :key="c" :value="c">{{ c }}</option>
                  </select>
                </label>
                <input
                  v-model="addForm.colorCustom"
                  type="text"
                  class="gem-select"
                  placeholder="Or type a new color…"
                  @change="applyCustomColor"
                />
                <label>
                  Decoration / finish
                  <select v-model="addForm.decoration" class="gem-select">
                    <option value="">— (none)</option>
                    <option v-for="d in decorationOptionsForItem" :key="d" :value="d">{{ d }}</option>
                  </select>
                </label>
                <label>
                  Quantity
                  <input v-model.number="addForm.quantity" type="number" min="1" class="gem-select" />
                </label>
                <label>
                  Notes
                  <input v-model="addForm.notes" type="text" class="gem-select" placeholder="Optional" />
                </label>
                <button type="button" class="btn btn-primary" :disabled="saving || !addForm.sizeLabel" @click="submitAddInventory">
                  Add Inventory
                </button>
              </section>

              <section class="gem-section">
                <h3>Agency Breakdown</h3>
                <table class="gem-mini-table">
                  <thead>
                    <tr>
                      <th>Agency</th>
                      <th>Available</th>
                      <th>Owner</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="ag in detail.agencies"
                      :key="ag.agencyId"
                      :class="{ selected: Number(detailAgencyId) === Number(ag.agencyId) }"
                      @click="setDetailAgency(ag.agencyId)"
                    >
                      <td>{{ ag.agencyName }}</td>
                      <td>{{ ag.available ?? '—' }}</td>
                      <td>{{ ag.owner?.name || 'Unassigned' }}</td>
                      <td><span class="gem-status" :class="ag.status">{{ statusLabel(ag.status) }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section v-if="detail.stockMode === 'COUNTED'" class="gem-section" ref="issueSectionRef">
                <h3>Issue Gear</h3>
                <p class="gem-hint">Issues one unit to a staff member and shows on their employee Lifecycle gear panel.</p>
                <label>
                  Person
                  <PersonSearchSelect
                    v-model="issueForm.userId"
                    :options="personOptionsFor(detailAgencyId)"
                    placeholder="Search staff…"
                  />
                </label>
                <template v-if="(issuable?.trackingMode || detail.trackingMode) === 'UNIQUE_ASSET'">
                  <label>
                    Asset
                    <select v-model.number="issueForm.uniqueAssetId" class="gem-select">
                      <option disabled :value="0">Select asset…</option>
                      <option
                        v-for="a in issuableAssets"
                        :key="a.id"
                        :value="a.id"
                      >{{ a.assetCode || a.displayLabel || `#${a.id}` }}</option>
                    </select>
                  </label>
                </template>
                <template v-else>
                  <label v-if="detail.isGendered || issuable?.isGendered">
                    Gender
                    <select v-model="issueForm.gender" class="gem-select">
                      <option value="">—</option>
                      <option value="women">Women's</option>
                      <option value="men">Men's</option>
                    </select>
                  </label>
                  <label v-if="colorFilterOptions.length || decorationFilterOptions.length">
                    Color
                    <select v-model="issueForm.color" class="gem-select">
                      <option value="">—</option>
                      <option v-for="c in colorFilterOptions" :key="c" :value="c">{{ c }}</option>
                    </select>
                  </label>
                  <label v-if="decorationFilterOptions.length || colorFilterOptions.length">
                    Decoration
                    <select v-model="issueForm.decoration" class="gem-select">
                      <option value="">—</option>
                      <option v-for="d in decorationFilterOptions" :key="d" :value="d">{{ d }}</option>
                    </select>
                  </label>
                  <label>
                    Size / variant
                    <select v-model="issueForm.variantKey" class="gem-select">
                      <option disabled value="">Select…</option>
                      <option
                        v-for="row in issuableSizeRows"
                        :key="row.key || `${row.gender}-${row.sizeLabel}-${row.color}-${row.decoration}`"
                        :value="issueVariantKey(row)"
                        :disabled="Number(row.quantityOnHand) < 1"
                      >
                        {{ row.displayLabel || row.sizeLabel }} ({{ row.quantityOnHand }})
                      </option>
                    </select>
                  </label>
                </template>
                <label>
                  Notes
                  <input v-model="issueForm.notes" type="text" class="gem-select" placeholder="Optional" />
                </label>
                <button
                  type="button"
                  class="btn btn-primary"
                  :disabled="saving || !canSubmitIssue"
                  @click="submitIssue"
                >
                  Issue Gear
                </button>
                <p v-if="issueSuccess" class="gem-success">{{ issueSuccess }}</p>
              </section>
            </div>
          </template>

          <section class="gem-section gem-low-alert">
            <h3>Low Stock &amp; Reorder</h3>
            <p class="gem-hint">
              Marks this item low for the working agency and emails the assigned owner so they can reorder.
              Reply-to uses materials@.
            </p>
            <div v-if="!selectedEnrollment?.responsibleUserId && detailAgencyId" class="gem-hint gem-hint--warn">
              Assign a responsible owner above before notifying — alerts need an owner email.
            </div>
            <div v-if="alertFeedback" class="gem-alert-feedback" :class="{ ok: alertFeedback.ok }">
              {{ alertFeedback.message }}
            </div>
            <div class="gem-detail-actions" style="margin: 8px 0 0">
              <button
                type="button"
                class="btn btn-danger-outline btn-sm"
                :disabled="!detailAgencyId || saving"
                @click="markLowSelected"
              >Mark Item as Low Stock</button>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="!detailAgencyId || saving"
                @click="reorderSelected"
              >Notify Owner / Reorder</button>
              <button
                v-if="selectedEnrollment?.manualIsLow"
                type="button"
                class="btn btn-secondary btn-sm"
                :disabled="!detailAgencyId || saving"
                @click="clearLowSelected"
              >Clear Low</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="showSend = true">Send / Event</button>
            </div>
          </section>

          <section class="gem-section">
            <h3>Recent Activity</h3>
            <ul class="gem-activity">
              <li v-for="a in detail.recentActivity || []" :key="a.id">
                <strong>{{ a.movementType }}</strong>
                <span class="muted"> · {{ a.agencyName }} · {{ fmtWhen(a.createdAt) }}</span>
                <div v-if="a.reason" class="muted">{{ a.reason }}</div>
              </li>
              <li v-if="!(detail.recentActivity || []).length" class="muted">No recent activity.</li>
            </ul>
          </section>
        </aside>
      </div>

      <section class="gem-activity-section">
        <h2>Issued / Sent Activity</h2>
        <table class="gem-table gem-table--activity">
          <thead>
            <tr>
              <th>Date</th>
              <th>Item</th>
              <th>Type</th>
              <th>Sent To / Event</th>
              <th>Agency</th>
              <th>Qty</th>
              <th>Sent By</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in activity" :key="row.id">
              <td>{{ fmtWhen(row.date) }}</td>
              <td>
                <div class="gem-item-cell">
                  <div class="gem-thumb gem-thumb--sm">
                    <img v-if="row.imageUrl" :src="row.imageUrl" alt="" />
                    <span v-else class="gem-thumb-ph">{{ initials(row.itemName) }}</span>
                  </div>
                  {{ row.itemName }}
                </div>
              </td>
              <td><span class="gem-pill">{{ row.typeLabel }}</span></td>
              <td>{{ row.sentTo || '—' }}</td>
              <td>{{ row.agencyName }}</td>
              <td>{{ row.quantity ?? '—' }}</td>
              <td>{{ row.sentBy || '—' }}</td>
            </tr>
            <tr v-if="!activity.length">
              <td colspan="7" class="gem-empty-row">No issued/sent activity yet.</td>
            </tr>
          </tbody>
        </table>
      </section>
      </template>
    </template>

    <div v-if="showForm" class="gem-modal-backdrop" @click.self="showForm = false">
      <div class="gem-modal">
        <h3>{{ editingId ? 'Edit Item' : 'Add Item' }}</h3>
        <div v-if="modalError" class="gem-error">{{ modalError }}</div>
        <label>Name<input v-model="form.name" type="text" /></label>
        <label>Category
          <select v-model="form.category">
            <option v-for="c in categoryOptions" :key="c" :value="c">{{ labelCat(c) }}</option>
          </select>
        </label>
        <label>Stock mode
          <select v-model="form.stockMode">
            <option value="COUNTED">Counted</option>
            <option value="MANUAL_LOW">Manual Low (materials)</option>
          </select>
        </label>
        <label v-if="form.stockMode === 'COUNTED'">Tracking
          <select v-model="form.trackingMode">
            <option value="SIZED_STOCK">Sized stock</option>
            <option value="UNIQUE_ASSET">Unique asset</option>
          </select>
        </label>
        <label>Description<textarea v-model="form.description" rows="2" /></label>
        <label>SKU<input v-model="form.sku" type="text" /></label>
        <label>Unit<input v-model="form.unit" type="text" /></label>
        <label>Default low threshold
          <input v-model.number="form.defaultLowStockThreshold" type="number" min="0" />
        </label>
        <label v-if="form.stockMode === 'COUNTED' && form.trackingMode === 'SIZED_STOCK'">
          Sizes (comma-separated)
          <input v-model="form.sizeOptionsText" type="text" />
        </label>
        <label v-if="form.stockMode === 'COUNTED' && form.trackingMode === 'SIZED_STOCK'">
          Colors (comma-separated)
          <input v-model="form.variantColorsText" type="text" placeholder="Navy, Black, White" />
        </label>
        <label v-if="form.stockMode === 'COUNTED' && form.trackingMode === 'SIZED_STOCK'">
          Decorations (comma-separated)
          <input v-model="form.variantDecorationsText" type="text" placeholder="Embroidered, Screened, Plain" />
        </label>
        <fieldset class="gem-agencies-pick">
          <legend>Enroll agencies</legend>
          <label v-for="a in agencies" :key="a.id" class="gem-check">
            <input v-model="form.agencyIds" type="checkbox" :value="a.id" />
            {{ a.name }}
          </label>
        </fieldset>
        <div class="gem-modal-actions">
          <button type="button" class="btn btn-secondary" @click="showForm = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveForm">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showSend && detail" class="gem-modal-backdrop" @click.self="showSend = false">
      <div class="gem-modal">
        <h3>Send / Event — {{ detail.name }}</h3>
        <div v-if="modalError" class="gem-error">{{ modalError }}</div>
        <label>Agency
          <select v-model="sendForm.agencyId">
            <option v-for="ag in detail.agencies" :key="ag.agencyId" :value="ag.agencyId">{{ ag.agencyName }}</option>
          </select>
        </label>
        <label>Activity type
          <select v-model="sendForm.activityType">
            <option value="sent_to_event">Sent to Event</option>
            <option value="issued_to_person">Issued to Person</option>
          </select>
        </label>
        <label>Destination / Event<input v-model="sendForm.destinationLabel" type="text" /></label>
        <label>Quantity<input v-model.number="sendForm.quantity" type="number" min="1" /></label>
        <div class="gem-modal-actions">
          <button type="button" class="btn btn-secondary" @click="showSend = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="doSend">Send</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import api from '../../services/api';
import GearPackagesPanel from '../../components/admin/GearPackagesPanel.vue';
import PersonSearchSelect from '../../components/schedule/PersonSearchSelect.vue';

const DEFAULT_DECORATIONS = ['Embroidered', 'Screened', 'Plain'];

function sizeSortRank(sizeLabel) {
  const raw = String(sizeLabel || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return 9999;
  const named = {
    XXS: 10, '2XS': 10,
    XS: 20,
    S: 30, SM: 30, SMALL: 30,
    M: 40, MD: 40, MED: 40, MEDIUM: 40,
    L: 50, LG: 50, LARGE: 50,
    XL: 60, XLARGE: 60,
    XXL: 70, '2XL': 70, '2X': 70,
    XXXL: 80, '3XL': 80, '3X': 80,
    '4XL': 90, '4X': 90,
    '5XL': 100, '5X': 100,
    OS: 200, ONESIZE: 200,
  };
  if (named[raw] != null) return named[raw];
  const m = raw.match(/^(\d+)/);
  if (m) return 500 + Number(m[1]);
  return 800 + (raw.charCodeAt(0) || 0);
}

const categoryOptions = ['gear', 'equipment', 'materials', 'promotional', 'outreach'];
const categoryTabs = [
  { id: 'all', label: 'All' },
  { id: 'gear', label: 'Gear' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'materials', label: 'Materials' },
  { id: 'promotional', label: 'Promotional' },
  { id: 'outreach', label: 'Outreach' },
];

const packageCatalogItems = ref([]);
const loading = ref(false);
const stockLoading = ref(false);
const saving = ref(false);
const error = ref('');
const actionError = ref('');
const modalError = ref('');
const issueSuccess = ref('');
const alertFeedback = ref(null);
const viewMode = ref('inventory');
const detailExpanded = ref(false);
const packagesPanelRef = ref(null);

async function loadPackageCatalog() {
  try {
    const res = await api.get('/gear-inventory/catalog', { params: { sort: 'type' } });
    packageCatalogItems.value = Array.isArray(res.data) ? res.data : [];
  } catch {
    packageCatalogItems.value = items.value || [];
  }
}

watch(viewMode, (mode) => {
  if (mode === 'packages') loadPackageCatalog();
});
const summary = ref({
  totalItemTypes: 0,
  totalInventory: 0,
  issuedSent30d: 0,
  lowStock: 0,
  agenciesManaged: 0,
});
const items = ref([]);
const activity = ref([]);
const agencies = ref([]);
const selectedId = ref(null);
const detail = ref(null);
const detailAgencyId = ref(null);
const sizeStock = ref([]);
const quickAddByKey = reactive({});
const issuable = ref(null);
const usersByAgency = reactive({});
const activePhotoId = ref(null);
const showForm = ref(false);
const showSend = ref(false);
const editingId = ref(null);
const addSectionRef = ref(null);
const issueSectionRef = ref(null);

const filters = reactive({
  agencyId: '',
  category: 'all',
  status: 'all',
  sort: 'type',
  search: '',
});

const form = reactive({
  name: '',
  category: 'gear',
  stockMode: 'COUNTED',
  trackingMode: 'SIZED_STOCK',
  description: '',
  sku: '',
  unit: 'Each',
  defaultLowStockThreshold: 2,
  sizeOptionsText: 'XS, S, M, L, XL',
  variantColorsText: '',
  variantDecorationsText: 'Embroidered, Screened, Plain',
  agencyIds: [],
});

const sendForm = reactive({
  agencyId: null,
  activityType: 'sent_to_event',
  destinationLabel: '',
  quantity: 1,
});

const addForm = reactive({
  sizeLabel: '',
  gender: '',
  color: '',
  colorCustom: '',
  decoration: '',
  quantity: 1,
  notes: '',
});

const issueForm = reactive({
  userId: 0,
  gender: '',
  sizeLabel: '',
  color: '',
  decoration: '',
  variantKey: '',
  uniqueAssetId: 0,
  notes: '',
});

const sizeFilters = reactive({
  gender: '',
  color: '',
  decoration: '',
});

const sizeSort = reactive({
  key: 'size',
  dir: 'asc',
});

const activePhoto = computed(() => {
  const imgs = detail.value?.images || [];
  if (!imgs.length) return null;
  return imgs.find((i) => i.id === activePhotoId.value) || imgs[0];
});

const selectedEnrollment = computed(() => {
  if (!detail.value || !detailAgencyId.value) return null;
  return (detail.value.agencies || []).find(
    (a) => Number(a.agencyId) === Number(detailAgencyId.value)
  ) || null;
});

const sizeOptionsForAgency = computed(() => {
  const fromCatalog = detail.value?.sizeOptions || [];
  const fromStock = sizeStock.value.map((s) => s.sizeLabel).filter(Boolean);
  return [...new Set([...fromCatalog, ...fromStock])];
});

const sizeRows = computed(() => {
  const threshold = Number(detail.value?.defaultLowStockThreshold ?? 2);
  const byKey = new Map();
  for (const s of sizeStock.value) {
    const key = `${s.gender || ''}|${s.sizeLabel}|${s.color || ''}|${s.decoration || ''}`;
    byKey.set(key, {
      key,
      gender: s.gender || '',
      genderLabel: s.genderLabel || (s.gender === 'women' ? "Women's" : s.gender === 'men' ? "Men's" : ''),
      sizeLabel: s.sizeLabel,
      color: s.color || '',
      decoration: s.decoration || '',
      displayLabel: s.displayLabel || s.sizeLabel,
      quantityOnHand: Number(s.quantityOnHand || 0),
      isLow: Number(s.quantityOnHand || 0) <= threshold,
      sizeSortRank: s.sizeSortRank ?? sizeSortRank(s.sizeLabel),
    });
  }
  for (const size of detail.value?.sizeOptions || []) {
    const key = `|${size}||`;
    if (!byKey.has(key) && !detail.value?.isGendered) {
      byKey.set(key, {
        key,
        gender: '',
        genderLabel: '',
        sizeLabel: size,
        color: '',
        decoration: '',
        displayLabel: size,
        quantityOnHand: 0,
        isLow: true,
        sizeSortRank: sizeSortRank(size),
      });
    }
  }
  return [...byKey.values()];
});

const hasGenderInStock = computed(() => sizeRows.value.some((r) => r.gender));
const hasVariantColumns = computed(() =>
  sizeRows.value.some((r) => r.color || r.decoration)
  || (detail.value?.variantColors || []).length > 0
  || (detail.value?.variantDecorations || []).length > 0
);

const genderFilterOptions = computed(() =>
  [...new Set(sizeRows.value.map((r) => r.gender).filter(Boolean))]
);
const colorFilterOptions = computed(() => {
  const fromStock = sizeRows.value.map((r) => r.color).filter(Boolean);
  const fromCatalog = detail.value?.variantColors || [];
  return [...new Set([...fromCatalog, ...fromStock])];
});
const decorationFilterOptions = computed(() => {
  const fromStock = sizeRows.value.map((r) => r.decoration).filter(Boolean);
  const fromCatalog = detail.value?.variantDecorations || [];
  const base = fromCatalog.length ? fromCatalog : DEFAULT_DECORATIONS;
  return [...new Set([...base, ...fromStock])];
});

const colorOptionsForItem = computed(() => colorFilterOptions.value);
const decorationOptionsForItem = computed(() => decorationFilterOptions.value);

const displayedSizeRows = computed(() => {
  let rows = sizeRows.value.slice();
  if (sizeFilters.gender) rows = rows.filter((r) => r.gender === sizeFilters.gender);
  if (sizeFilters.color) rows = rows.filter((r) => r.color === sizeFilters.color);
  if (sizeFilters.decoration) rows = rows.filter((r) => r.decoration === sizeFilters.decoration);

  const dir = sizeSort.dir === 'desc' ? -1 : 1;
  const key = sizeSort.key;
  rows.sort((a, b) => {
    let cmp = 0;
    if (key === 'size') cmp = a.sizeSortRank - b.sizeSortRank || String(a.sizeLabel).localeCompare(String(b.sizeLabel));
    else if (key === 'amount') cmp = a.quantityOnHand - b.quantityOnHand;
    else if (key === 'status') cmp = Number(a.isLow) - Number(b.isLow);
    else if (key === 'gender') cmp = String(a.gender).localeCompare(String(b.gender));
    else if (key === 'color') cmp = String(a.color).localeCompare(String(b.color));
    else if (key === 'decoration') cmp = String(a.decoration).localeCompare(String(b.decoration));
    if (cmp === 0 && key !== 'size') {
      cmp = a.sizeSortRank - b.sizeSortRank;
    }
    return cmp * dir;
  });
  return rows;
});

const filteredAvailableTotal = computed(() =>
  displayedSizeRows.value.reduce((sum, r) => sum + Number(r.quantityOnHand || 0), 0)
);

const sizeTableColspan = computed(() => {
  let n = 4; // size, available, status, quick add
  if (detail.value?.isGendered || hasGenderInStock.value) n += 1;
  if (hasVariantColumns.value || colorFilterOptions.value.length) n += 1;
  if (hasVariantColumns.value || decorationFilterOptions.value.length) n += 1;
  return n;
});

const issuableSizeRows = computed(() => {
  let sizes = (issuable.value?.sizes || sizeRows.value).map((s) => ({
    ...s,
    key: s.key || `${s.gender || ''}|${s.sizeLabel}|${s.color || ''}|${s.decoration || ''}`,
    sizeSortRank: s.sizeSortRank ?? sizeSortRank(s.sizeLabel),
  }));
  if (detail.value?.isGendered || issuable.value?.isGendered) {
    const g = String(issueForm.gender || '').toLowerCase();
    if (g) sizes = sizes.filter((r) => String(r.gender || '').toLowerCase() === g);
  }
  if (issueForm.color) sizes = sizes.filter((r) => r.color === issueForm.color);
  if (issueForm.decoration) sizes = sizes.filter((r) => r.decoration === issueForm.decoration);
  sizes.sort((a, b) => a.sizeSortRank - b.sizeSortRank);
  return sizes;
});

const issuableAssets = computed(() => issuable.value?.assets || []);

const canSubmitIssue = computed(() => {
  if (!issueForm.userId || !selectedEnrollment.value) return false;
  const mode = issuable.value?.trackingMode || detail.value?.trackingMode;
  if (mode === 'UNIQUE_ASSET') return Number(issueForm.uniqueAssetId) > 0;
  return !!issueForm.variantKey || !!issueForm.sizeLabel;
});

function personOptionsFor(agencyId) {
  return usersByAgency[agencyId] || [];
}

function issueVariantKey(row) {
  return `${row.gender || ''}|${row.sizeLabel}|${row.color || ''}|${row.decoration || ''}`;
}

function parseVariantKey(key) {
  const [gender = '', sizeLabel = '', color = '', decoration = ''] = String(key || '').split('|');
  return { gender, sizeLabel, color, decoration };
}

function toggleSizeSort(key) {
  if (sizeSort.key === key) {
    sizeSort.dir = sizeSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    sizeSort.key = key;
    sizeSort.dir = key === 'amount' ? 'desc' : 'asc';
  }
}

function sizeSortIndicator(key) {
  if (sizeSort.key !== key) return '';
  return sizeSort.dir === 'asc' ? '↑' : '↓';
}

function applyCustomColor() {
  const c = String(addForm.colorCustom || '').trim();
  if (c) addForm.color = c;
}

function quickAddValue(key) {
  const n = Number(quickAddByKey[key]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function labelCat(c) {
  const map = {
    gear: 'Gear',
    equipment: 'Equipment',
    materials: 'Materials',
    promotional: 'Promotional',
    outreach: 'Outreach',
  };
  return map[c] || c;
}

function statusLabel(s) {
  if (s === 'reorder') return 'Reorder';
  if (s === 'low') return 'Low';
  return 'Healthy';
}

function formatNum(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v.toLocaleString() : '0';
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

function fmtWhen(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(d);
  }
}

function catalogParams() {
  const params = { sort: filters.sort };
  if (filters.agencyId) params.agencyId = filters.agencyId;
  if (filters.category && filters.category !== 'all') params.category = filters.category;
  if (filters.status && filters.status !== 'all') params.status = filters.status;
  if (filters.search.trim()) params.search = filters.search.trim();
  return params;
}

function resolveInitialAgency(itemDetail) {
  const enrollments = itemDetail?.agencies || [];
  if (!enrollments.length) return null;
  const filterAid = Number(filters.agencyId || 0);
  if (filterAid && enrollments.some((a) => Number(a.agencyId) === filterAid)) {
    return filterAid;
  }
  if (enrollments.length === 1) return Number(enrollments[0].agencyId);
  return null;
}

async function reload() {
  loading.value = true;
  error.value = '';
  try {
    const [sumRes, listRes, actRes, agRes] = await Promise.all([
      api.get('/gear-inventory/catalog/summary'),
      api.get('/gear-inventory/catalog', { params: catalogParams() }),
      api.get('/gear-inventory/catalog/activity', { params: { limit: 60 } }),
      api.get('/gear-inventory/catalog/agencies'),
    ]);
    summary.value = sumRes.data || summary.value;
    items.value = Array.isArray(listRes.data) ? listRes.data : [];
    activity.value = Array.isArray(actRes.data) ? actRes.data : [];
    agencies.value = Array.isArray(agRes.data) ? agRes.data : [];
    if (selectedId.value) {
      const still = items.value.find((i) => i.id === selectedId.value);
      if (still) await loadDetail(selectedId.value, { keepAgency: true });
      else closeDetail();
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || e.message || 'Failed to load catalog';
  } finally {
    loading.value = false;
  }
}

function onAgencyFilterChange() {
  reload();
}

async function loadAgencyUsers(agencyId) {
  if (!agencyId) return;
  try {
    const res = await api.get(`/gear-inventory/catalog/agencies/${agencyId}/users`);
    usersByAgency[agencyId] = Array.isArray(res.data) ? res.data : [];
  } catch {
    usersByAgency[agencyId] = [];
  }
}

async function loadSizeStock(agencyId, typeId) {
  if (!agencyId || !typeId) {
    sizeStock.value = [];
    issuable.value = null;
    return;
  }
  stockLoading.value = true;
  actionError.value = '';
  try {
    const [stockRes, issuableRes] = await Promise.all([
      api.get(`/gear-inventory/${agencyId}/stock`),
      api.get(`/gear-inventory/${agencyId}/types/${typeId}/issuable`).catch(() => ({ data: null })),
    ]);
    const all = Array.isArray(stockRes.data) ? stockRes.data : [];
    sizeStock.value = all.filter((s) => Number(s.gearItemTypeId) === Number(typeId));
    issuable.value = issuableRes.data || null;
  } catch (e) {
    sizeStock.value = [];
    issuable.value = null;
    actionError.value = e?.response?.data?.error?.message || 'Failed to load size inventory';
  } finally {
    stockLoading.value = false;
  }
}

async function setDetailAgency(agencyId) {
  detailAgencyId.value = Number(agencyId) || null;
  issueSuccess.value = '';
  actionError.value = '';
  issueForm.userId = 0;
  issueForm.sizeLabel = '';
  issueForm.color = '';
  issueForm.decoration = '';
  issueForm.variantKey = '';
  issueForm.uniqueAssetId = 0;
  issueForm.gender = '';
  addForm.sizeLabel = '';
  addForm.color = '';
  addForm.decoration = '';
  addForm.colorCustom = '';
  sizeFilters.gender = '';
  sizeFilters.color = '';
  sizeFilters.decoration = '';
  if (!detailAgencyId.value || !selectedEnrollment.value) {
    sizeStock.value = [];
    issuable.value = null;
    return;
  }
  await loadAgencyUsers(detailAgencyId.value);
  await loadSizeStock(detailAgencyId.value, selectedEnrollment.value.gearItemTypeId);
}

async function loadDetail(id, { keepAgency = false } = {}) {
  selectedId.value = id;
  const res = await api.get(`/gear-inventory/catalog/${id}`);
  detail.value = res.data;
  activePhotoId.value = detail.value?.primaryImage?.id || detail.value?.images?.[0]?.id || null;
  sendForm.agencyId = detail.value?.agencies?.[0]?.agencyId || null;

  const prev = keepAgency ? detailAgencyId.value : null;
  const next =
    (prev && (detail.value.agencies || []).some((a) => Number(a.agencyId) === Number(prev))
      ? prev
      : resolveInitialAgency(detail.value));

  for (const ag of detail.value?.agencies || []) {
    await loadAgencyUsers(ag.agencyId);
  }
  await setDetailAgency(next);
}

async function openItem(item) {
  try {
    await loadDetail(item.id);
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load item';
  }
}

function closeDetail() {
  selectedId.value = null;
  detail.value = null;
  detailAgencyId.value = null;
  sizeStock.value = [];
  issuable.value = null;
  issueSuccess.value = '';
  actionError.value = '';
  alertFeedback.value = null;
  detailExpanded.value = false;
}

function focusAddInventory() {
  addSectionRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

function focusIssue() {
  issueSectionRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

async function addStockForSize(row) {
  const qty = quickAddValue(row.key);
  if (!qty || !selectedEnrollment.value) return;
  saving.value = true;
  actionError.value = '';
  try {
    await api.post(`/gear-inventory/${detailAgencyId.value}/stock/adjust`, {
      gearItemTypeId: selectedEnrollment.value.gearItemTypeId,
      sizeLabel: row.sizeLabel,
      gender: row.gender || '',
      color: row.color || '',
      decoration: row.decoration || '',
      delta: qty,
      reason: 'Added from Gear catalog',
    });
    await loadSizeStock(detailAgencyId.value, selectedEnrollment.value.gearItemTypeId);
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Add stock failed';
  } finally {
    saving.value = false;
  }
}

async function submitAddInventory() {
  if (!selectedEnrollment.value || !addForm.sizeLabel) return;
  saving.value = true;
  actionError.value = '';
  try {
    const color = (addForm.colorCustom || '').trim() || addForm.color || '';
    await api.post(`/gear-inventory/${detailAgencyId.value}/stock/adjust`, {
      gearItemTypeId: selectedEnrollment.value.gearItemTypeId,
      sizeLabel: addForm.sizeLabel,
      gender: addForm.gender || '',
      color,
      decoration: addForm.decoration || '',
      delta: Number(addForm.quantity || 1),
      reason: addForm.notes || 'Added from Gear catalog',
    });
    // Persist new color on catalog options when typed
    if (color && detail.value && !(detail.value.variantColors || []).includes(color)) {
      try {
        await api.patch(`/gear-inventory/catalog/${detail.value.id}`, {
          variantColors: [...(detail.value.variantColors || []), color],
          variantDecorations: detail.value.variantDecorations?.length
            ? detail.value.variantDecorations
            : DEFAULT_DECORATIONS,
        });
      } catch { /* non-blocking */ }
    }
    addForm.quantity = 1;
    addForm.notes = '';
    await loadSizeStock(detailAgencyId.value, selectedEnrollment.value.gearItemTypeId);
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Add inventory failed';
  } finally {
    saving.value = false;
  }
}

async function submitIssue() {
  if (!selectedEnrollment.value || !issueForm.userId || !canSubmitIssue.value) return;
  saving.value = true;
  actionError.value = '';
  issueSuccess.value = '';
  try {
    const mode = issuable.value?.trackingMode || detail.value?.trackingMode;
    const payload = {
      gearItemTypeId: selectedEnrollment.value.gearItemTypeId,
      notes: issueForm.notes || null,
    };
    if (mode === 'UNIQUE_ASSET') {
      payload.uniqueAssetId = issueForm.uniqueAssetId || null;
    } else {
      const parsed = issueForm.variantKey
        ? parseVariantKey(issueForm.variantKey)
        : {
          gender: issueForm.gender || '',
          sizeLabel: issueForm.sizeLabel,
          color: issueForm.color || '',
          decoration: issueForm.decoration || '',
        };
      payload.sizeLabel = parsed.sizeLabel;
      payload.gender = parsed.gender || issueForm.gender || '';
      payload.color = parsed.color || '';
      payload.decoration = parsed.decoration || '';
    }
    await api.post(
      `/gear-inventory/${detailAgencyId.value}/users/${issueForm.userId}/issue`,
      payload
    );
    const person = (usersByAgency[detailAgencyId.value] || []).find(
      (u) => Number(u.id) === Number(issueForm.userId)
    );
    issueSuccess.value = `Issued to ${person?.name || 'staff'} — visible on their Lifecycle gear panel.`;
    issueForm.sizeLabel = '';
    issueForm.variantKey = '';
    issueForm.uniqueAssetId = 0;
    issueForm.notes = '';
    await loadSizeStock(detailAgencyId.value, selectedEnrollment.value.gearItemTypeId);
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    actionError.value = e?.response?.data?.error?.message || 'Issue failed';
  } finally {
    saving.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  modalError.value = '';
  Object.assign(form, {
    name: '',
    category: 'materials',
    stockMode: 'MANUAL_LOW',
    trackingMode: 'NONE',
    description: '',
    sku: '',
    unit: 'Each',
    defaultLowStockThreshold: 2,
    sizeOptionsText: 'XS, S, M, L, XL',
    variantColorsText: '',
    variantDecorationsText: 'Embroidered, Screened, Plain',
    agencyIds: agencies.value.map((a) => a.id),
  });
  showForm.value = true;
}

function openEdit(item) {
  editingId.value = item.id;
  modalError.value = '';
  Object.assign(form, {
    name: item.name,
    category: item.category,
    stockMode: item.stockMode,
    trackingMode: item.trackingMode === 'NONE' ? 'SIZED_STOCK' : item.trackingMode,
    description: item.description || '',
    sku: item.sku || '',
    unit: item.unit || 'Each',
    defaultLowStockThreshold: item.defaultLowStockThreshold ?? 2,
    sizeOptionsText: (item.sizeOptions || []).join(', ') || 'XS, S, M, L, XL',
    variantColorsText: (item.variantColors || []).join(', '),
    variantDecorationsText: (item.variantDecorations || []).join(', ') || 'Embroidered, Screened, Plain',
    agencyIds: (item.agencies || []).map((a) => a.agencyId),
  });
  showForm.value = true;
}

watch(
  () => form.category,
  (cat) => {
    if (['materials', 'promotional', 'outreach'].includes(cat) && !editingId.value) {
      form.stockMode = 'MANUAL_LOW';
    }
  }
);

async function saveForm() {
  saving.value = true;
  modalError.value = '';
  try {
    const sizeOptions = String(form.sizeOptionsText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const variantColors = String(form.variantColorsText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const variantDecorations = String(form.variantDecorationsText || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      name: form.name,
      category: form.category,
      stockMode: form.stockMode,
      trackingMode: form.stockMode === 'MANUAL_LOW' ? 'NONE' : form.trackingMode,
      description: form.description,
      sku: form.sku,
      unit: form.unit,
      defaultLowStockThreshold: form.defaultLowStockThreshold,
      sizeOptions,
      variantColors,
      variantDecorations: variantDecorations.length ? variantDecorations : DEFAULT_DECORATIONS,
      agencyIds: form.agencyIds,
      allowManualLow: true,
    };
    let id = editingId.value;
    if (editingId.value) {
      await api.patch(`/gear-inventory/catalog/${editingId.value}`, payload);
      await api.put(`/gear-inventory/catalog/${editingId.value}/agencies`, {
        agencies: form.agencyIds.map((agencyId) => ({
          agencyId,
          isActive: true,
          responsibleUserId:
            detail.value?.agencies?.find((a) => a.agencyId === agencyId)?.responsibleUserId || null,
          manualIsLow: detail.value?.agencies?.find((a) => a.agencyId === agencyId)?.manualIsLow || false,
          lowStockThreshold: null,
        })),
      });
    } else {
      const res = await api.post('/gear-inventory/catalog', payload);
      id = res.data?.id;
    }
    showForm.value = false;
    await reload();
    if (id) await loadDetail(id);
  } catch (e) {
    modalError.value = e?.response?.data?.error?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function onAssignOwner(agencyId, userId) {
  if (!detail.value) return;
  try {
    const agenciesPayload = detail.value.agencies.map((ag) => ({
      agencyId: ag.agencyId,
      responsibleUserId: ag.agencyId === agencyId ? (userId ? Number(userId) : null) : ag.responsibleUserId,
      manualIsLow: ag.manualIsLow,
      lowStockThreshold: ag.lowStockThreshold,
      isActive: true,
    }));
    await api.put(`/gear-inventory/catalog/${detail.value.id}/agencies`, { agencies: agenciesPayload });
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to assign owner';
  }
}

function formatAlertResult(alert, actionLabel) {
  if (!alert) return { ok: false, message: `${actionLabel}: no alert response.` };
  if (alert.sent) {
    return { ok: true, message: `${actionLabel}: email sent to the assigned owner.` };
  }
  const reasons = {
    no_responsible_user: 'no owner assigned (or owner has no email) — assign a responsible person first',
    not_low: 'item not considered low yet — Mark Low first, or stock is still above threshold',
    debounced: 'alert was recently sent (debounced 24h)',
    no_sender_identity: 'no email sender identity configured',
    send_failed: `email failed${alert.error ? `: ${alert.error}` : ''}`,
    enrollment_not_found: 'agency not enrolled for this item',
    missing_ids: 'missing agency or item',
  };
  return {
    ok: false,
    message: `${actionLabel}: not emailed — ${reasons[alert.reason] || alert.reason || 'unknown'}`,
  };
}

async function markLowSelected() {
  if (!detail.value || !detailAgencyId.value) {
    alertFeedback.value = { ok: false, message: 'Select a working agency first.' };
    return;
  }
  const ag = selectedEnrollment.value;
  if (!ag) return;
  saving.value = true;
  alertFeedback.value = null;
  try {
    const res = await api.post(`/gear-inventory/catalog/${detail.value.id}/mark-low`, {
      agencyId: ag.agencyId,
      low: true,
      reason: 'Manually marked low from console',
    });
    alertFeedback.value = formatAlertResult(res.data?.alert, 'Mark Low');
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    alertFeedback.value = { ok: false, message: e?.response?.data?.error?.message || 'Mark low failed' };
  } finally {
    saving.value = false;
  }
}

async function reorderSelected() {
  if (!detail.value || !detailAgencyId.value) {
    alertFeedback.value = { ok: false, message: 'Select a working agency first.' };
    return;
  }
  const ag = selectedEnrollment.value;
  if (!ag) return;
  saving.value = true;
  alertFeedback.value = null;
  try {
    const res = await api.post(`/gear-inventory/catalog/${detail.value.id}/mark-low`, {
      agencyId: ag.agencyId,
      low: true,
      reason: 'Reorder requested from console — notify owner',
    });
    alertFeedback.value = formatAlertResult(res.data?.alert, 'Reorder notify');
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    alertFeedback.value = { ok: false, message: e?.response?.data?.error?.message || 'Reorder alert failed' };
  } finally {
    saving.value = false;
  }
}

async function clearLowSelected() {
  if (!detail.value || !detailAgencyId.value) return;
  saving.value = true;
  alertFeedback.value = null;
  try {
    await api.post(`/gear-inventory/catalog/${detail.value.id}/clear-low`, {
      agencyId: detailAgencyId.value,
      reason: 'Cleared low from console',
    });
    alertFeedback.value = { ok: true, message: 'Low flag cleared.' };
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    alertFeedback.value = { ok: false, message: e?.response?.data?.error?.message || 'Clear low failed' };
  } finally {
    saving.value = false;
  }
}

async function onUploadPhoto(ev) {
  const file = ev.target?.files?.[0];
  if (!file || !detail.value) return;
  const fd = new FormData();
  fd.append('image', file);
  fd.append('isPrimary', detail.value.images?.length ? '0' : '1');
  try {
    await api.post(`/gear-inventory/catalog/${detail.value.id}/images`, fd);
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Photo upload failed';
  } finally {
    ev.target.value = '';
  }
}

async function doSend() {
  if (!detail.value) return;
  saving.value = true;
  modalError.value = '';
  try {
    await api.post(`/gear-inventory/catalog/${detail.value.id}/send`, {
      agencyId: sendForm.agencyId,
      activityType: sendForm.activityType,
      destinationLabel: sendForm.destinationLabel,
      quantity: sendForm.quantity,
    });
    showSend.value = false;
    await loadDetail(detail.value.id, { keepAgency: true });
    await reload();
  } catch (e) {
    modalError.value = e?.response?.data?.error?.message || 'Send failed';
  } finally {
    saving.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.gem-page {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 16px 20px 40px;
  box-sizing: border-box;
  color: #0f172a;
}
.gem-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.gem-title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.gem-sub { margin: 6px 0 0; color: #64748b; }
.gem-empty, .gem-empty-row { padding: 24px; color: #64748b; text-align: center; }
.gem-error { color: #b91c1c; margin: 8px 0; font-size: 0.88rem; }
.gem-success { color: #166534; margin: 8px 0 0; font-size: 0.85rem; font-weight: 600; }

.gem-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.gem-stat {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
}
.gem-stat--warn { background: #fff7ed; border-color: #fed7aa; }
.gem-stat-value { font-size: 1.6rem; font-weight: 800; }
.gem-stat-label { font-size: 0.8rem; font-weight: 700; color: #334155; margin-top: 2px; }
.gem-stat-hint { font-size: 0.72rem; color: #94a3b8; margin-top: 2px; }

.gem-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}
.gem-select, .gem-search, .gem-modal input, .gem-modal select, .gem-modal textarea, .gem-qty {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  background: #fff;
}
.gem-qty { width: 64px; padding: 4px 8px; }
.gem-search { min-width: 180px; flex: 1; }

.gem-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.gem-tab {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.gem-tab.on { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }

.gem-main {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  align-items: start;
}
.gem-main--split {
  grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.9fr);
}
.gem-main--full {
  grid-template-columns: 1fr;
}
.gem-view-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.gem-view-tab {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 700;
  cursor: pointer;
  font: inherit;
}
.gem-view-tab.on {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}
.gem-header-actions { display: flex; gap: 8px; }
.gem-detail-head-btns { display: flex; gap: 4px; align-items: center; }
.gem-icon-btn {
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  width: 32px;
  height: 32px;
  cursor: pointer;
  font-size: 0.95rem;
}
.gem-detail--expanded {
  max-height: none;
  position: static;
}
.gem-low-alert {
  background: #fff7ed;
  border-color: #fed7aa;
}
.gem-alert-feedback {
  font-size: 0.85rem;
  font-weight: 600;
  color: #9a3412;
  margin: 6px 0;
}
.gem-alert-feedback.ok { color: #166534; }
.btn-danger-outline {
  background: #fff;
  border-color: #fca5a5;
  color: #b91c1c;
}
.gem-table-wrap {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: auto;
}
.gem-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.gem-table th, .gem-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
  vertical-align: middle;
}
.gem-table th {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  background: #f8fafc;
}
.gem-table tbody tr { cursor: pointer; }
.gem-table tbody tr:hover,
.gem-table tbody tr.selected,
.gem-mini-table tbody tr.selected { background: #f1f5f9; }
.gem-strong { font-weight: 700; }
.muted { color: #64748b; }
.gem-avail-sub { font-size: 0.7rem; margin-top: 2px; }

.gem-thumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: #e2e8f0;
  display: grid;
  place-items: center;
}
.gem-thumb--sm { width: 28px; height: 28px; border-radius: 6px; }
.gem-thumb img { width: 100%; height: 100%; object-fit: cover; }
.gem-thumb-ph { font-size: 0.7rem; font-weight: 800; color: #475569; }

.gem-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: #e2e8f0;
  color: #334155;
}
.cat-gear { background: #dbeafe; color: #1d4ed8; }
.cat-equipment { background: #e0e7ff; color: #4338ca; }
.cat-materials { background: #dcfce7; color: #166534; }
.cat-promotional { background: #fef9c3; color: #854d0e; }
.cat-outreach { background: #ffedd5; color: #9a3412; }

.gem-status {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}
.gem-status.healthy { background: #dcfce7; color: #166534; }
.gem-status.low { background: #ffedd5; color: #9a3412; }
.gem-status.reorder { background: #fee2e2; color: #b91c1c; }

.gem-detail {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px;
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 88px);
  overflow: auto;
}
.gem-detail-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.gem-detail-head h2 { margin: 0 0 6px; font-size: 1.2rem; }
.gem-close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
  color: #64748b;
  line-height: 1;
}
.gem-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 12px;
}
.gem-detail-actions--foot { margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 12px; }

.gem-agency-picker {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 12px;
  background: #f8fafc;
}
.gem-agency-picker-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.gem-agency-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.gem-chip {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
.gem-chip.on { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
.gem-chip.on .muted { color: #bfdbfe; }

.gem-detail-summary {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.gem-photos--compact .gem-photo-main {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: #f1f5f9;
  margin-bottom: 6px;
}
.gem-photo-main img { width: 100%; height: 100%; object-fit: cover; }
.gem-photo-empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: #94a3b8;
  font-size: 0.8rem;
}
.gem-photo-thumbs { display: flex; gap: 4px; flex-wrap: wrap; }
.gem-photo-thumb, .gem-photo-add {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
  background: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  font-size: 0.85rem;
}
.gem-photo-thumb.on { outline: 2px solid #1d4ed8; }
.gem-photo-thumb img { width: 100%; height: 100%; object-fit: cover; }

.gem-meta {
  display: grid;
  gap: 6px;
  margin: 0;
  align-content: start;
}
.gem-meta div { display: grid; grid-template-columns: 88px 1fr; gap: 6px; font-size: 0.84rem; }
.gem-meta dt { color: #64748b; margin: 0; }
.gem-meta dd { margin: 0; font-weight: 600; }

.gem-owner-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: end;
  margin-bottom: 12px;
}
.gem-owner-row .gem-select { min-width: 200px; margin-top: 4px; }

.gem-section {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fff;
}
.gem-section h3 {
  margin: 0 0 10px;
  font-size: 0.95rem;
}
.gem-section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.gem-section-head h3 { margin: 0; }
.gem-section label {
  display: grid;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 8px;
}
.gem-hint { font-size: 0.82rem; color: #64748b; margin: 0 0 8px; line-height: 1.4; }
.gem-hint--warn { color: #9a3412; }

.gem-ops-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.gem-mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}
.gem-mini-table th, .gem-mini-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
}
.gem-mini-table th {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}
.gem-size-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.gem-select--sm { padding: 5px 8px; font-size: 0.8rem; }
.gem-th-sort {
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-weight: 700;
  text-transform: inherit;
  letter-spacing: inherit;
  color: inherit;
  cursor: pointer;
}
.gem-th-sort:hover { color: #1d4ed8; }

.gem-activity { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.gem-activity li { font-size: 0.85rem; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }

.gem-activity-section { margin-top: 28px; }
.gem-activity-section h2 { margin: 0 0 10px; font-size: 1.1rem; }
.gem-item-cell { display: flex; align-items: center; gap: 8px; }

.gem-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 80;
  padding: 16px;
}
.gem-modal {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  width: min(520px, 100%);
  max-height: 90vh;
  overflow: auto;
  display: grid;
  gap: 10px;
}
.gem-modal h3 { margin: 0; }
.gem-modal label { display: grid; gap: 4px; font-size: 0.85rem; font-weight: 600; }
.gem-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.gem-agencies-pick {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 8px 10px;
  max-height: 160px;
  overflow: auto;
}
.gem-check { display: flex; align-items: center; gap: 8px; font-weight: 500; margin: 4px 0; }

.btn {
  border-radius: 8px;
  padding: 8px 12px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  font: inherit;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 5px 10px; font-size: 0.82rem; }
.btn-primary { background: #1d4ed8; color: #fff; }
.btn-secondary { background: #fff; border-color: #cbd5e1; color: #0f172a; }

@media (max-width: 1100px) {
  .gem-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gem-main--split { grid-template-columns: 1fr; }
  .gem-detail { position: static; max-height: none; }
  .gem-detail-summary { grid-template-columns: 1fr; }
}
</style>
