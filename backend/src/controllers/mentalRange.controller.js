import pool from '../config/database.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { listClinicalFacetsForUsers } from '../services/providerClinicalFacets.service.js';
import { getProviderDetail } from './publicAgencyServices.controller.js';
import { createMentalRangeHandlers } from '../services/mentalRangeHandlers.service.js';
export const { rangePartners, rangeProviders, rangeAvailability, getRangeMembership, saveRangeMembership } = createMentalRangeHandlers({ pool, publicUploadsUrlFromStoredPath, listClinicalFacetsForUsers, getProviderDetail });
