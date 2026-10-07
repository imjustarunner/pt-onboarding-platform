import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{}}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../emailSenderIdentityResolver.service.js',()=>({resolveSenderIdentityForSend:vi.fn()}));
vi.mock('../emailTemplate.service.js',()=>({default:{}}));
import {renderAdminUpdateHtml} from '../adminUpdate.service.js';
it('renders a body-only newsletter section and strips executable markup',()=>{const html=renderAdminUpdateHtml({title:'October',topics:[{id:1,enabled:1,topic_key:'notes',title:'Notes Workspace',body_html:'<h3>Read this</h3><a href="https://example.com">Terms</a><a href="javascript:bad()">unsafe</a><script>bad()</script>',color:'#336644',items:[]}]},{name:'ITSCO'});expect(html).toContain('Notes Workspace');expect(html).toContain('https://example.com');expect(html).not.toContain('No items in this section yet');expect(html).not.toMatch(/javascript:|<script>/);});
