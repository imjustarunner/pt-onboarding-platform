import { after, afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDocumentHtml, sanitizeLetterheadHtml, validateDocumentBranding, resolveDocumentLetterhead, buildDocumentRender } from '../libraryDocument.service.js';
import LetterheadTemplate from '../../models/LetterheadTemplate.model.js';
import Library from '../../models/Library.model.js';
import pool from '../../config/database.js';
afterEach(() => mock.restoreAll());
after(() => pool.end());
describe('library document rendering and permissions', () => {
  it('removes active content and network requests, preserving supported formatting', () => {
    const html = sanitizeDocumentHtml('<script>alert(1)</script><iframe src="http://localhost"></iframe><p onclick="steal()" style="color:#123456;background-image:url(http://localhost)"><strong>Hello</strong></p><a href="jav&#x61;script:alert(1)">bad</a><img src="http://localhost"><table><tr><td colspan="2">Cell</td></tr></table><div class="page-break"></div><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>Done</p></div></li></ul>');
    assert.doesNotMatch(html, /script|iframe|onclick|localhost|background-image|<img/);
    assert.match(html, /color:#123456/); assert.match(html, /colspan="2"/); assert.match(html, /page-break/); assert.match(html, /data-checked="true"/); assert.match(html, /disabled/);
  });
  it('blocks remote images and active styles in legacy letterhead fragments', () => {
    const html = sanitizeLetterheadHtml('<img src="http://127.0.0.1/secrets"><p style="background:url(http://localhost);font-size:12pt" onmouseover="alert(1)">Header</p>');
    assert.doesNotMatch(html, /127\.0|localhost|onmouseover|background/); assert.match(html, /font-size:12pt/);
  });
  it('rejects inactive, other-agency and other-organization letterheads', async () => {
    const find = mock.method(LetterheadTemplate, 'findById');
    for (const row of [null, { is_active: 0 }, { is_active: 1, agency_id: 9 }, { is_active: 1, agency_id: 2, organization_id: 99 }]) {
      find.mock.mockImplementation(async () => row);
      await assert.rejects(validateDocumentBranding({ agencyId: 2, brandingMode: 'letterhead', letterheadTemplateId: 1 }), { status: 400 });
    }
    find.mock.mockImplementation(async () => ({ is_active: 1, agency_id: null, organization_id: null }));
    assert.ok(await validateDocumentBranding({ agencyId: 2, brandingMode: 'letterhead', letterheadTemplateId: 1 }));
  });
  it('uses letterhead size, orientation and safe margins in the exact preview/export renderer', async () => {
    const plain = await resolveDocumentLetterhead({ brandingMode: 'plain' });
    const rendered = buildDocumentRender({ name: '<unsafe>', bodyHtml: '<h1>Example</h1><div class="page-break"></div><p>Next page</p>' }, { ...plain, pageSize: 'a4', orientation: 'landscape', headerHeight: 80, footerHeight: 40 });
    assert.equal(rendered.options.width, `${841.89 / 72}in`); assert.equal(rendered.options.height, `${595.28 / 72}in`);
    assert.equal(rendered.options.margin.top, `${98 / 72}in`); assert.equal(rendered.options.margin.bottom, `${58 / 72}in`);
    assert.equal(rendered.options.disableFallback, true); assert.match(rendered.html, /&lt;unsafe&gt;/); assert.match(rendered.html, /default-src 'none'/); assert.match(rendered.html, /break-after:page/); assert.match(rendered.options.footerTemplate, /pageNumber/);
  });
  it('uses an atomic version predicate and stops on conflict before altering tags', async () => {
    const execute = mock.method(pool, 'execute', async () => [{ affectedRows: 0 }]);
    const tags = mock.method(Library, 'setResourceTags', async () => {});
    await assert.rejects(Library.updateResource(10, 2, { bodyHtml: '<p>changed</p>', expectedVersion: 4, tags: ['new'] }), { status: 409 });
    assert.match(execute.mock.calls[0].arguments[0], /version = version \+ 1.*AND version = \?/s);
    assert.deepEqual(execute.mock.calls[0].arguments[1], ['<p>changed</p>', 10, 2, 4]); assert.equal(tags.mock.callCount(), 0);
  });
  it('enforces ownership or an explicit share when retrieving personal resources', async () => {
    const execute = mock.method(pool, 'execute', async () => [[]]);
    assert.equal(await Library.findResource(10, 2, { userId: 7 }), null);
    const [sql, params] = execute.mock.calls[0].arguments;
    assert.match(sql, /r.owner_user_id = \?/); assert.match(sql, /p.agency_id = r.agency_id/); assert.match(sql, /p.resource_id = r.id OR p.folder_id = r.folder_id/); assert.deepEqual(params, [7, 10, 2, 7, '7']);
  });
  it('honors a folder edit grant even when a direct view grant also exists', async () => {
    const execute = mock.method(pool, 'execute', async () => [[{ permission: 'view' }, { permission: 'edit' }]]);
    assert.equal(await Library.userHasResourcePermission(10, 2, 7, 'edit'), true);
    assert.match(execute.mock.calls[0].arguments[0], /p.folder_id = r.folder_id/);
  });

});
