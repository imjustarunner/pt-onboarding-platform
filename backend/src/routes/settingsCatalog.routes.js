import express from 'express';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
  getProviderCredentialInsuranceRules,
  upsertProviderCredentialInsuranceRules
} from '../controllers/settingsCatalog.controller.js';

const router = express.Router();

// Catalogs (agency-scoped)
// GET/POST/PUT:
//  /api/settings-catalogs/:agencyId/:catalog
// Where :catalog is one of:
//  client_statuses | paperwork_statuses | paperwork_deliveries | insurances | provider_credentials
router.get('/:agencyId/:catalog', authenticate, requireAgencyAdmin, listCatalog);
router.post('/:agencyId/:catalog', authenticate, requireAgencyAdmin, createCatalogItem);
router.put('/:agencyId/:catalog/:id', authenticate, requireAgencyAdmin, updateCatalogItem);

// Credential -> insurance rules
router.get('/:agencyId/provider-credential-insurance-rules', authenticate, requireAgencyAdmin, getProviderCredentialInsuranceRules);
router.put('/:agencyId/provider-credential-insurance-rules', authenticate, requireAgencyAdmin, upsertProviderCredentialInsuranceRules);

export default router;

