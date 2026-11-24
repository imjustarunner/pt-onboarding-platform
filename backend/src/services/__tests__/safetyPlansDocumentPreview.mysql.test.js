import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({
  default: { execute: (...args) => fixture.db.execute(...args) }, onTableWrite: () => {}
}));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: async id => ({
  id, agency_id: 2, full_name: 'Synthetic client', client_type: 'clinical', status: 'ACTIVE',
  date_of_birth: '1990-01-01', guardian_portal_enabled: 1, email: 'synthetic@example.invalid'
}) } }));
vi.mock('../safetyPlans/access.js', () => ({
  clientAccess: async (_actor, id) => ({ id, agency_id: 2, full_name: 'Synthetic client' }),
  recipientAccess: async () => {}
}));
vi.mock('../familyNotificationChoices.service.js', () => ({ familyNotificationDeliveryGate: async () => ({ allowed: true }) }));

import { eligibleDocumentRecipients } from '../clinicalDocumentShareRecipients.js';
import { previewDocumentShare } from '../clinicalDocumentShares.service.js';

const socketPath = process.env.CLINICAL_DOCUMENT_TEST_SOCKET;
const clientId = 41;
const assessmentKeys = ['phq-9', 'phq-a', 'gad-7', 'gad-2', 'phq-9-adolescent'];
const documents = assessmentKeys.map(assessmentKey => ({ assessmentKey }));
let root, database;

describe.skipIf(!socketPath)('document share preview on the chart schema', () => {
  beforeAll(async () => {
    root = await mysql.createConnection({ socketPath, user: 'root' });
    database = 'clinical_preview_test_' + randomUUID().replaceAll('-', '');
    await root.query('CREATE DATABASE ' + database);
    fixture.db = mysql.createPool({ socketPath, user: 'root', database });
    // The directory schema keeps portal language on the chart and relationship.
    for (const statement of [
      'CREATE TABLE clients (id INT PRIMARY KEY, preferred_language VARCHAR(50), onboarding_docs_json JSON)',
      `CREATE TABLE users (id INT PRIMARY KEY, first_name VARCHAR(50), last_name VARCHAR(50), email VARCHAR(255),
        phone_number VARCHAR(20), personal_phone VARCHAR(20), is_active BOOLEAN, is_archived BOOLEAN,
        status VARCHAR(30), role VARCHAR(50), terminated_at TIMESTAMP, status_expires_at TIMESTAMP)`,
      `CREATE TABLE client_guardians (client_id INT, guardian_user_id INT, relationship_type VARCHAR(30),
        access_enabled BOOLEAN, permissions_json JSON)`,
      'CREATE TABLE user_activity_log (user_id INT, action_type VARCHAR(30))',
      'CREATE TABLE intake_links (id INT PRIMARY KEY, language_code VARCHAR(10))',
      'CREATE TABLE intake_submissions (id INT PRIMARY KEY, intake_link_id INT, guardian_user_id INT, status VARCHAR(30), submitted_at TIMESTAMP)',
      'CREATE TABLE intake_submission_clients (intake_submission_id INT, client_id INT)',
      "INSERT INTO clients VALUES (41, 'English', NULL), (42, NULL, NULL)",
      `INSERT INTO users (id, first_name, last_name, email, is_active, is_archived, status, role)
        VALUES (20, 'Synthetic', 'Client', 'synthetic@example.invalid', 1, 0, 'PENDING_SETUP', 'client')`,
      `INSERT INTO client_guardians VALUES (41, 20, 'self', 1, '{"portalLanguage":"es"}')`
    ]) await fixture.db.query(statement);
  });

  afterAll(async () => {
    await fixture.db?.end();
    if (root) {
      await root.query('DROP DATABASE IF EXISTS ' + database);
      await root.end();
    }
  });

  it('offers email and portal setup for all five assessments and uses the recipient locale', async () => {
    const preview = await previewDocumentShare({ id: 8, role: 'provider' }, clientId, { agencyId: 2, documents });
    const keys = assessmentKeys.map(key => `${clientId}:assessment:${key}`);
    expect(preview.items.map(item => item.key)).toEqual(keys);
    expect(preview.recipients).toMatchObject([{
      key: 'user:20', kind: 'client', portal: 'setup',
      items: keys.map(key => ({ key, channels: { email: true, sms: false, portal: true } }))
    }]);
    const recipients = await eligibleDocumentRecipients({ client_id: clientId, agency_id: 2, respondent: 'client' });
    expect(recipients).toMatchObject([{ key: 'user:20', locale: 'es' }]);
  });

  it('offers a direct link to an adult without a linked portal account', async () => {
    const preview = await previewDocumentShare({ id: 8, role: 'provider' }, 42, { agencyId: 2, documents });
    expect(preview.recipients).toMatchObject([{
      key: 'client:42', kind: 'client', portal: null,
      items: assessmentKeys.map(key => ({ key: `42:assessment:${key}`, channels: { email: true, sms: false, portal: false } }))
    }]);
  });
});
