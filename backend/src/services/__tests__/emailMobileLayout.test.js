import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn(async()=>[[]])}}));
import {applyTenantEmailChromeHtml} from '../tenantEmailChrome.service.js';
import {buildClientAssignedEmailHtml,buildContactAssignedReminderEmail} from '../brandedNotificationEmail.service.js';
import {renderPortalEmail} from '../portalEmailBranding.service.js';
import {buildBrandedMessageEmailHtml} from '../hubBrandedEmail.service.js';
const chrome={headerUrl:'https://example.com/header.png',footerUrl:'https://example.com/footer.png',supportUrl:'https://example.com/support',agencyName:'Agency'};
it('does not add a second gutter around an email body that owns its layout',()=>{
 const html=applyTenantEmailChromeHtml(buildClientAssignedEmailHtml({agencyName:'A long school agency name',serviceDay:'Monday',appUrl:'https://example.com'}),chrome);
 expect(html).toContain('class="email-body email-body-owned" style="padding:0;');expect(html).toContain('class="email-content-cell"');expect(html).toContain('.email-frame{padding:0 0 16px!important}');expect(html).toContain('data-email-responsive="1"');
 expect(html).not.toContain('max-height:0;position:relative');expect(html.indexOf('footer.png')).toBeLessThan(html.indexOf('Need Help?'));
});
it('retains one comfortable gutter for plain body fragments and stays idempotent',()=>{
 const once=applyTenantEmailChromeHtml('<p>Message body</p>',chrome);expect(once).toContain('class="email-body" style="padding:20px 24px;');expect(applyTenantEmailChromeHtml(once,chrome)).toBe(once);
});
it('uses stackable brand and agency blocks in clinical portal headers, retaining Spanish and names',()=>{
 const opts={brand:{clinical:true,name:'A long agency name',agencyLogo:'https://example.com/logo.png',displayName:'AuricWell Portal',replyTo:'support@example.com',products:['SchoolCareBridge · school coordination']},text:'Mensaje de prueba',locale:'es'};
 const html=renderPortalEmail(opts);expect(html).toContain('lang="es"');expect(html).toContain('class="email-header-brand"');expect(html).toContain('class="email-header-agency"');expect(html).toContain('.email-header-brand,.email-header-agency{display:block!important');expect(html).toContain('A long agency name');expect(html).toContain('Contacte a su equipo');expect(renderPortalEmail({...opts,html})).toBe(html);
});
it('covers contact reminders and secure-message notices through the shared mobile rules',()=>{
 expect(buildContactAssignedReminderEmail({agencyName:'Agency',clientInitials:'QA'}).html).toContain('class="email-stack"');
 expect(buildBrandedMessageEmailHtml({agencyName:'Agency',bodyText:'Open the portal'})).toContain('data-email-responsive="1"');
});
