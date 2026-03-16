<template>
  <div class="club-store">
    <div v-if="loading" class="loading">Loading store…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else class="store-content">
      <div class="store-header">
        <router-link :to="backRoute" class="back-link">← Back</router-link>
        <h1>{{ clubName || 'Club Store' }}</h1>
        <p class="store-subtitle">Browse and redeem rewards from your club.</p>
      </div>

      <div class="store-tabs">
        <button
          :class="['tab', { active: activeTab === 'products' }]"
          @click="activeTab = 'products'"
        >
          Products
        </button>
        <button
          :class="['tab', { active: activeTab === 'orders' }]"
          @click="activeTab = 'orders'"
        >
          My Orders
        </button>
        <button
          v-if="canManage"
          :class="['tab', { active: activeTab === 'admin' }]"
          @click="activeTab = 'admin'"
        >
          Manage
        </button>
      </div>

      <!-- Products (participant) -->
      <div v-show="activeTab === 'products'" class="tab-panel">
        <div v-if="productsLoading" class="loading-inline">Loading products…</div>
        <div v-else-if="!products.length" class="empty-state">No products available yet.</div>
        <div v-else class="products-grid">
          <div v-for="p in products" :key="p.id" class="product-card">
            <div v-if="p.image_path" class="product-image">
              <img :src="imageUrl(p.image_path)" :alt="p.name" />
            </div>
            <div v-else class="product-image-placeholder">No image</div>
            <div class="product-info">
              <h3>{{ p.name }}</h3>
              <p v-if="p.description" class="product-desc">{{ p.description }}</p>
              <div class="product-price">
                <span v-if="p.price_points != null" class="price-points">{{ p.price_points }} pts</span>
                <span v-if="p.price_points != null && p.price_cents != null" class="price-sep"> or </span>
                <span v-if="p.price_cents != null" class="price-cents">${{ (p.price_cents / 100).toFixed(2) }}</span>
              </div>
              <button
                class="btn btn-primary btn-sm"
                :disabled="addingToCart === p.id"
                @click="addToCart(p)"
              >
                {{ addingToCart === p.id ? 'Adding…' : 'Add to Cart' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Cart summary -->
        <div v-if="cart.length" class="cart-summary">
          <h3>Cart ({{ cart.length }} items)</h3>
          <ul class="cart-list">
            <li v-for="(item, i) in cart" :key="i" class="cart-item">
              <span>{{ item.name }} × {{ item.quantity }}</span>
              <span class="cart-item-price">
                <template v-if="item.pricePoints != null">{{ item.pricePoints * item.quantity }} pts</template>
                <template v-else-if="item.priceCents != null">${{ ((item.priceCents * item.quantity) / 100).toFixed(2) }}</template>
              </span>
              <button type="button" class="btn-link" @click="removeFromCart(i)">Remove</button>
            </li>
          </ul>
          <div class="cart-total">
            <span v-if="cartTotalPoints">Total: {{ cartTotalPoints }} pts</span>
            <span v-if="cartTotalPoints && cartTotalCents"> + </span>
            <span v-if="cartTotalCents">${{ (cartTotalCents / 100).toFixed(2) }}</span>
          </div>
          <button
            class="btn btn-primary"
            :disabled="checkoutSubmitting"
            @click="checkout"
          >
            {{ checkoutSubmitting ? 'Placing order…' : 'Checkout' }}
          </button>
        </div>
      </div>

      <!-- My Orders -->
      <div v-show="activeTab === 'orders'" class="tab-panel">
        <div v-if="ordersLoading" class="loading-inline">Loading orders…</div>
        <div v-else-if="!myOrders.length" class="empty-state">You have no orders yet.</div>
        <div v-else class="orders-list">
          <div v-for="o in myOrders" :key="o.id" class="order-card">
            <div class="order-header">
              <span class="order-id">Order #{{ o.id }}</span>
              <span class="order-status" :class="'status-' + (o.status || '')">{{ formatStatus(o.status) }}</span>
            </div>
            <div class="order-meta">
              <span v-if="o.total_points">{{ o.total_points }} pts</span>
              <span v-if="o.total_points && o.total_cents"> · </span>
              <span v-if="o.total_cents">${{ (o.total_cents / 100).toFixed(2) }}</span>
              <span class="order-date">{{ formatDate(o.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Admin: Manage products & orders -->
      <div v-show="activeTab === 'admin' && canManage" class="tab-panel">
        <div class="admin-section">
          <h3>Products</h3>
          <div v-if="adminProductsLoading" class="loading-inline">Loading…</div>
          <div v-else class="admin-products">
            <button class="btn btn-secondary btn-sm" @click="openProductModal()">Add Product</button>
            <div v-for="p in adminProducts" :key="p.id" class="admin-product-row">
              <span>{{ p.name }}</span>
              <span class="product-prices">
                <template v-if="p.price_points != null">{{ p.price_points }} pts</template>
                <template v-if="p.price_points != null && p.price_cents != null"> / </template>
                <template v-if="p.price_cents != null">${{ (p.price_cents / 100).toFixed(2) }}</template>
              </span>
              <span :class="['product-active', p.is_active ? 'active' : 'inactive']">{{ p.is_active ? 'Active' : 'Inactive' }}</span>
              <button class="btn btn-sm" @click="openProductModal(p)">Edit</button>
              <button class="btn btn-sm btn-danger" @click="deleteProduct(p.id)">Delete</button>
            </div>
          </div>
        </div>
        <div class="admin-section">
          <h3>Orders</h3>
          <div v-if="adminOrdersLoading" class="loading-inline">Loading…</div>
          <div v-else class="admin-orders">
            <div v-for="o in adminOrders" :key="o.id" class="admin-order-row">
              <span>#{{ o.id }}</span>
              <span>{{ o.user_first_name }} {{ o.user_last_name }}</span>
              <span>{{ formatDate(o.created_at) }}</span>
              <span :class="['order-status', 'status-' + (o.status || '')]">{{ formatStatus(o.status) }}</span>
              <button class="btn btn-sm" @click="openOrderDetail(o)">View</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Product modal (admin) -->
      <div v-if="showProductModal" class="modal-overlay" @click.self="showProductModal = false">
        <div class="modal-content">
          <h2>{{ editingProduct ? 'Edit Product' : 'Add Product' }}</h2>
          <form @submit.prevent="saveProduct">
            <div class="form-row">
              <label>Name</label>
              <input v-model="productForm.name" required />
            </div>
            <div class="form-row">
              <label>Description</label>
              <textarea v-model="productForm.description" rows="2" />
            </div>
            <div class="form-row">
              <label>Price (points)</label>
              <input v-model.number="productForm.pricePoints" type="number" min="0" placeholder="Optional" />
            </div>
            <div class="form-row">
              <label>Price (cents)</label>
              <input v-model.number="productForm.priceCents" type="number" min="0" placeholder="Optional" />
            </div>
            <div class="form-row">
              <label>
                <input v-model="productForm.isActive" type="checkbox" />
                Active
              </label>
            </div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" @click="showProductModal = false">Cancel</button>
              <button type="submit" class="btn btn-primary" :disabled="productSaving">{{ productSaving ? 'Saving…' : 'Save' }}</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Order detail modal (admin) -->
      <div v-if="selectedOrder" class="modal-overlay" @click.self="selectedOrder = null">
        <div class="modal-content">
          <h2>Order #{{ selectedOrder.id }}</h2>
          <p>{{ selectedOrder.user_first_name }} {{ selectedOrder.user_last_name }} · {{ formatStatus(selectedOrder.status) }}</p>
          <ul v-if="selectedOrder.items?.length" class="order-items-list">
            <li v-for="i in selectedOrder.items" :key="i.id">
              {{ i.product_name }} × {{ i.quantity }}
              <span v-if="i.price_points">{{ i.price_points * i.quantity }} pts</span>
              <span v-else-if="i.price_cents">${{ ((i.price_cents * i.quantity) / 100).toFixed(2) }}</span>
            </li>
          </ul>
          <div class="form-actions">
            <select v-model="selectedOrderStatus" @change="updateOrderStatus">
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button type="button" class="btn btn-secondary" @click="selectedOrder = null">Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '../services/api';

const route = useRoute();
const orgId = computed(() => route.params.orgId);

const loading = ref(true);
const error = ref(null);
const clubName = ref('');
const canManage = ref(false);

const activeTab = ref('products');
const products = ref([]);
const productsLoading = ref(false);
const myOrders = ref([]);
const ordersLoading = ref(false);
const adminProducts = ref([]);
const adminProductsLoading = ref(false);
const adminOrders = ref([]);
const adminOrdersLoading = ref(false);

const cart = ref([]);
const addingToCart = ref(null);
const checkoutSubmitting = ref(false);

const showProductModal = ref(false);
const editingProduct = ref(null);
const productForm = ref({ name: '', description: '', pricePoints: null, priceCents: null, isActive: true });
const productSaving = ref(false);

const selectedOrder = ref(null);
const selectedOrderStatus = ref('');

const backRoute = computed(() => '/dashboard');

const cartTotalPoints = computed(() => cart.value.reduce((s, i) => s + (i.pricePoints || 0) * i.quantity, 0) || null);
const cartTotalCents = computed(() => cart.value.reduce((s, i) => s + (i.priceCents || 0) * i.quantity, 0) || null);

const imageUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const base = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  return `${base.replace(/\/api\/?$/, '')}/uploads/${path.replace(/^\/?uploads\//, '')}`;
};

const loadStore = async () => {
  const id = orgId.value;
  if (!id) {
    error.value = 'Invalid store';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const r = await api.get(`/club-store/${id}/products`, { skipGlobalLoading: true });
    products.value = Array.isArray(r.data?.products) ? r.data.products : [];
    clubName.value = r.data?.organizationName || '';
    canManage.value = false;
    try {
      const adminR = await api.get(`/club-store/${id}/admin/products`, { skipGlobalLoading: true });
      canManage.value = true;
    } catch {
      canManage.value = false;
    }
  } catch (e) {
    error.value = e?.response?.data?.error?.message || 'Failed to load store';
  } finally {
    loading.value = false;
  }
};

const loadProducts = async () => {
  const id = orgId.value;
  if (!id) return;
  productsLoading.value = true;
  try {
    const r = await api.get(`/club-store/${id}/products`, { skipGlobalLoading: true });
    products.value = Array.isArray(r.data?.products) ? r.data.products : [];
  } catch {
    products.value = [];
  } finally {
    productsLoading.value = false;
  }
};

const loadMyOrders = async () => {
  const id = orgId.value;
  if (!id) return;
  ordersLoading.value = true;
  try {
    const r = await api.get(`/club-store/${id}/orders/my`, { skipGlobalLoading: true });
    myOrders.value = Array.isArray(r.data?.orders) ? r.data.orders : [];
  } catch {
    myOrders.value = [];
  } finally {
    ordersLoading.value = false;
  }
};

const loadAdminProducts = async () => {
  const id = orgId.value;
  if (!id) return;
  adminProductsLoading.value = true;
  try {
    const r = await api.get(`/club-store/${id}/admin/products`, { skipGlobalLoading: true });
    adminProducts.value = Array.isArray(r.data?.products) ? r.data.products : [];
  } catch {
    adminProducts.value = [];
  } finally {
    adminProductsLoading.value = false;
  }
};

const loadAdminOrders = async () => {
  const id = orgId.value;
  if (!id) return;
  adminOrdersLoading.value = true;
  try {
    const r = await api.get(`/club-store/${id}/admin/orders`, { skipGlobalLoading: true });
    adminOrders.value = Array.isArray(r.data?.orders) ? r.data.orders : [];
  } catch {
    adminOrders.value = [];
  } finally {
    adminOrdersLoading.value = false;
  }
};

const addToCart = (p) => {
  const existing = cart.value.find((x) => x.productId === p.id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.value.push({
      productId: p.id,
      name: p.name,
      quantity: 1,
      pricePoints: p.price_points,
      priceCents: p.price_cents
    });
  }
};

const removeFromCart = (index) => {
  cart.value.splice(index, 1);
};

const checkout = async () => {
  const id = orgId.value;
  if (!id || !cart.value.length) return;
  checkoutSubmitting.value = true;
  try {
    await api.post(`/club-store/${id}/orders`, {
      items: cart.value.map((c) => ({
        productId: c.productId,
        quantity: c.quantity,
        pricePoints: c.pricePoints,
        priceCents: c.priceCents
      }))
    });
    cart.value = [];
    await loadMyOrders();
    activeTab.value = 'orders';
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to place order');
  } finally {
    checkoutSubmitting.value = false;
  }
};

const openProductModal = (p = null) => {
  editingProduct.value = p;
  productForm.value = {
    name: p?.name || '',
    description: p?.description || '',
    pricePoints: p?.price_points ?? null,
    priceCents: p?.price_cents ?? null,
    isActive: p != null ? !!p.is_active : true
  };
  showProductModal.value = true;
};

const saveProduct = async () => {
  const id = orgId.value;
  if (!id) return;
  productSaving.value = true;
  try {
    if (editingProduct.value) {
      await api.put(`/club-store/${id}/admin/products/${editingProduct.value.id}`, productForm.value);
    } else {
      await api.post(`/club-store/${id}/admin/products`, productForm.value);
    }
    showProductModal.value = false;
    await Promise.all([loadProducts(), loadAdminProducts()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to save product');
  } finally {
    productSaving.value = false;
  }
};

const deleteProduct = async (productId) => {
  const id = orgId.value;
  if (!id || !confirm('Delete this product?')) return;
  try {
    await api.delete(`/club-store/${id}/admin/products/${productId}`);
    await Promise.all([loadProducts(), loadAdminProducts()]);
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to delete product');
  }
};

const openOrderDetail = async (o) => {
  const id = orgId.value;
  if (!id) return;
  try {
    const r = await api.get(`/club-store/${id}/admin/orders/${o.id}`, { skipGlobalLoading: true });
    selectedOrder.value = r.data;
    selectedOrderStatus.value = r.data?.status || 'pending';
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to load order');
  }
};

const updateOrderStatus = async () => {
  const id = orgId.value;
  const order = selectedOrder.value;
  if (!id || !order) return;
  try {
    await api.put(`/club-store/${id}/admin/orders/${order.id}/status`, { status: selectedOrderStatus.value });
    selectedOrder.value = { ...order, status: selectedOrderStatus.value };
    await loadAdminOrders();
  } catch (e) {
    alert(e?.response?.data?.error?.message || 'Failed to update status');
  }
};

const formatStatus = (s) => {
  const v = String(s || '').toLowerCase();
  if (v === 'pending') return 'Pending';
  if (v === 'paid') return 'Paid';
  if (v === 'fulfilled') return 'Fulfilled';
  if (v === 'cancelled') return 'Cancelled';
  return v || '—';
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

onMounted(async () => {
  await loadStore();
  if (!error.value) {
    loadMyOrders();
    if (canManage.value) {
      loadAdminProducts();
      loadAdminOrders();
    }
  }
});

watch(activeTab, (tab) => {
  if (tab === 'orders') loadMyOrders();
  if (tab === 'admin' && canManage.value) {
    loadAdminProducts();
    loadAdminOrders();
  }
});

watch(orgId, () => loadStore());
</script>

<style scoped>
.club-store {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}
.store-header {
  margin-bottom: 24px;
}
.back-link {
  display: inline-block;
  margin-bottom: 12px;
  color: var(--link-color, #0066cc);
  text-decoration: none;
}
.store-header h1 {
  margin: 0 0 4px 0;
}
.store-subtitle {
  margin: 0;
  color: var(--text-muted, #666);
}
.store-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}
.tab {
  padding: 8px 16px;
  border: 1px solid var(--border-color, #ddd);
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}
.tab.active {
  background: var(--primary, #0066cc);
  color: #fff;
  border-color: var(--primary, #0066cc);
}
.tab-panel {
  padding: 16px 0;
}
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.product-card {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  overflow: hidden;
}
.product-image,
.product-image-placeholder {
  height: 120px;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.product-info {
  padding: 12px;
}
.product-info h3 {
  margin: 0 0 8px 0;
  font-size: 1em;
}
.product-desc {
  font-size: 0.9em;
  color: var(--text-muted, #666);
  margin: 0 0 8px 0;
}
.product-price {
  margin-bottom: 8px;
}
.price-points {
  color: var(--primary, #0066cc);
  font-weight: 600;
}
.cart-summary {
  margin-top: 24px;
  padding: 16px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
}
.cart-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px 0;
}
.cart-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.cart-item-price {
  margin-left: auto;
}
.btn-link {
  background: none;
  border: none;
  color: var(--link-color, #0066cc);
  cursor: pointer;
  font-size: 0.9em;
}
.admin-product-row,
.admin-order-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  max-width: 480px;
  width: 90vw;
}
.form-row {
  margin-bottom: 12px;
}
.form-row label {
  display: block;
  margin-bottom: 4px;
}
.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
.status-pending { color: #f57c00; }
.status-paid { color: #2e7d32; }
.status-fulfilled { color: #1b5e20; }
.status-cancelled { color: #666; }
</style>
