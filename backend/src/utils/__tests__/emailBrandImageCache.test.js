import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshEmailBrandImageUrls } from '../emailBrandImageCache.js';

test('refreshes owned branding, photos and footer backgrounds without changing image identity or dimensions', () => {
  const html = '<img src="https://app.example.org/uploads/user_photos/michael.jpg" width="80" height="80">' +
    '<img src="https://app.example.org/email-signatures/staff-html/social-twitter.png?v=6">' +
    '<td background="https://app.example.org/uploads/logos/footer.png">';
  const result = refreshEmailBrandImageUrls(html, ['https://app.example.org']);
  assert.match(result, /michael\.jpg\?pt_email_asset=20261020" width="80" height="80"/);
  assert.match(result, /social-twitter\.png\?v=6&amp;pt_email_asset=20261020/);
  assert.match(result, /footer\.png\?pt_email_asset=20261020/);
  assert.equal(refreshEmailBrandImageUrls(result, ['https://app.example.org']), result);
});

test('preserves third-party, signed, private and data images and all destination links', () => {
  const html = '<img src="https://external.example.org/uploads/logos/a.png">' +
    '<img src="https://app.example.org/uploads/logos/a.png?X-Goog-Signature=abc">' +
    '<img src="https://app.example.org/uploads/private/a.png">' +
    '<img src="data:image/png;base64,abc">' +
    '<a href="https://app.example.org/email-branding/itsco/header.png">Open</a>';
  assert.equal(refreshEmailBrandImageUrls(html, ['https://app.example.org']), html);
});
