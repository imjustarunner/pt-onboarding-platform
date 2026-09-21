import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/LetterheadTemplate.model.js', () => ({ default: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), setActive: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../services/storage.service.js', () => ({ default: {} }));
import { duplicateLetterheadTemplate, updateLetterheadTemplate, archiveLetterheadTemplate } from '../letterheadTemplate.controller.js';
import LetterheadTemplate from '../../models/LetterheadTemplate.model.js';
import User from '../../models/User.model.js';
const source = { id: 3, name: 'Formal', agency_id: 2, organization_id: null, template_type: 'png', file_path: 'uploads/letterheads/formal.png', page_size: 'a4', orientation: 'landscape', margin_top: 60, margin_bottom: 60, margin_left: 40, margin_right: 40, header_height: 72, footer_height: 40 };
let req, res, next;
beforeEach(() => { vi.resetAllMocks(); req = { user: { id: 7, role: 'admin' }, params: { id: '3' }, body: {} }; res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn(); User.getAgencies.mockResolvedValue([{ id: 2 }]); LetterheadTemplate.findById.mockResolvedValue(source); });
describe('letterhead versions', () => {
  it('duplicates all asset and page settings into a separately named version', async () => {
    LetterheadTemplate.create.mockResolvedValue({ id: 4 }); await duplicateLetterheadTemplate(req, res, next);
    expect(next).not.toHaveBeenCalled(); expect(LetterheadTemplate.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Formal — Copy', agencyId: 2, filePath: source.file_path, pageSize: 'a4', orientation: 'landscape', marginTop: 60, headerHeight: 72, createdByUserId: 7 }));
    expect(LetterheadTemplate.update).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(201);
  });
  it('rejects duplication and archival by an unrelated agency admin', async () => {
    User.getAgencies.mockResolvedValue([{ id: 99 }]); await duplicateLetterheadTemplate(req, res, next); await archiveLetterheadTemplate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403); expect(LetterheadTemplate.create).not.toHaveBeenCalled(); expect(LetterheadTemplate.setActive).not.toHaveBeenCalled();
  });
  it('preserves page settings when changing only the version name', async () => {
    req.body = { name: 'Formal v2' }; await updateLetterheadTemplate(req, res, next);
    expect(next).not.toHaveBeenCalled(); expect(LetterheadTemplate.update).toHaveBeenCalledWith(3, { name: 'Formal v2', agencyId: 2, organizationId: null });
  });
  it('rejects moving a version into an unauthorized agency', async () => {
    req.body = { agencyId: 99 }; await updateLetterheadTemplate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403); expect(LetterheadTemplate.update).not.toHaveBeenCalled();
  });
});
