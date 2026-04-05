/**
 * Summit Stats Team Challenge: Club Store routes
 * Mounted at /api/club-store, paths: /:orgId/products, /:orgId/orders, etc.
 */
import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listProducts,
  getProduct,
  createOrder,
  listMyOrders,
  listAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listAdminOrders,
  getAdminOrder,
  updateOrderStatus
} from '../controllers/clubStore.controller.js';

const router = express.Router();
const storeRouter = express.Router({ mergeParams: true });

router.use(authenticate);
router.use('/:orgId', storeRouter);

// Participant: browse and buy
storeRouter.get('/products', listProducts);
storeRouter.get('/products/:productId', getProduct);
storeRouter.post('/orders', createOrder);
storeRouter.get('/orders/my', listMyOrders);

// Admin (Program Manager): manage products and orders
storeRouter.get('/admin/products', listAdminProducts);
storeRouter.post('/admin/products', createProduct);
storeRouter.put('/admin/products/:productId', updateProduct);
storeRouter.delete('/admin/products/:productId', deleteProduct);
storeRouter.get('/admin/orders', listAdminOrders);
storeRouter.get('/admin/orders/:orderId', getAdminOrder);
storeRouter.put('/admin/orders/:orderId/status', updateOrderStatus);

export default router;
