import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import TicketDeskView from '../TicketDeskView.vue';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  auth: { user: null },
  agency: {},
  route: { query: {}, params: {} },
  router: { replace: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('../../../services/api', () => ({ default: mocks.api }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => mocks.auth }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => mocks.agency }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => mocks.router }));

const assignedTicket = {
  id: 101, agency_id: 2, subject: 'Assigned support request',
  created_by_user_id: 99, claimed_by_user_id: 7,
  status: 'open', display_status: 'in_progress', source_channel: 'portal'
};
const otherTicket = { ...assignedTicket, id: 102, subject: 'Another request', claimed_by_user_id: 8 };
let wrapper;
const button = (label) => wrapper.findAll('button').find((b) => b.text() === label);
const queueCalls = () => mocks.api.get.mock.calls.filter(([url]) => url === '/support-tickets');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.post.mockReset().mockResolvedValue({ data: {} });
  sessionStorage.clear();
  mocks.auth.user = { id: 7, role: 'super_admin' };
  const tenant = { id: 2, name: 'ITSCO', organization_type: 'agency' };
  Object.assign(mocks.agency, { currentAgency: tenant, agencies: [tenant], userAgencies: [tenant] });
  mocks.route.query = {};
  mocks.api.get.mockImplementation(async (url, options) => {
    if (url === '/support-tickets') {
      const params = options.params;
      let rows = params.mine ? [assignedTicket] : [assignedTicket, otherTicket];
      if (params.displayStatus) rows = rows.filter((t) => t.display_status === params.displayStatus);
      return { data: rows };
    }
    // The current user did not submit either queue ticket.
    if (url === '/support-tickets/mine') return { data: [] };
    if (url === '/support-tickets/metrics') return { data: { open: 0, in_progress: 2, mine: 1 } };
    if (url === '/support-tickets/101/messages') return {
      data: { ticket: assignedTicket, messages: [{ id: 1, body: 'Please help with this request', author_user_id: 99 }] }
    };
    return { data: {} };
  });
});

afterEach(() => wrapper?.unmount());

async function render(props = {}, stubs = {}) {
  wrapper = shallowMount(TicketDeskView, { props, global: { stubs: { RouterLink: true, ...stubs } } });
  await flushPromises();
}

describe('TicketDeskView queue navigation', () => {
  it('opens an embedded ticket without fetching a queue or changing the Messages URL', async () => {
    mocks.route.query = { channel: 'groups', conversationId: '500' };
    await render({ embedded: true, initialTicketId: 101, agencyId: 2, syncRoute: false });
    expect(wrapper.find('.detail-id').text()).toBe('Ticket #101');
    expect(wrapper.text()).toContain('Please help with this request');
    expect(wrapper.find('.list-pane').exists()).toBe(false);
    expect(wrapper.find('.desk-header').exists()).toBe(false);
    expect(wrapper.find('.btn-exit-ticket').exists()).toBe(false);
    expect(button('Previous')).toBeUndefined();
    expect(queueCalls()).toHaveLength(0);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.route.query).toEqual({ channel: 'groups', conversationId: '500' });
  });

  it('opens an assigned ticket from My tickets without switching to submitted tickets', async () => {
    await render();
    await button('My tickets').trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params).toMatchObject({ agencyId: 2, mine: true });
    expect(mocks.api.get.mock.calls.some(([url]) => url === '/support-tickets/mine')).toBe(false);
    expect(wrapper.findAll('.ticket-row')).toHaveLength(1);
    await wrapper.find('.ticket-row').trigger('click');
    await flushPromises();
    expect(wrapper.find('.detail-id').text()).toBe('Ticket #101');
    expect(wrapper.text()).toContain('Please help with this request');
  });

  it('clears the Open-only filter when switching to My tickets or back to all', async () => {
    mocks.route.query = { status: 'open' };
    await render();
    expect(wrapper.findAll('.ticket-row')).toHaveLength(0);
    await button('My tickets').trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params.displayStatus).toBeUndefined();
    expect(wrapper.findAll('.ticket-row')).toHaveLength(1);
    await button('Show all tickets').trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params.mine).toBeUndefined();
    expect(wrapper.findAll('.ticket-row')).toHaveLength(2);
  });

  it('loads assigned in-progress tickets from a My tickets link and refreshes metrics', async () => {
    mocks.route.query = { mine: 'true', status: 'in_progress' };
    await render();
    expect(wrapper.findAll('.ticket-row')).toHaveLength(1);
    expect(queueCalls().at(-1)[1].params).toMatchObject({ mine: true, displayStatus: 'in_progress' });
    expect(wrapper.findAll('.metric-value').map((el) => el.text())).toEqual(['0', '2', '0', '0']);
    await button('Refresh').trigger('click');
    await flushPromises();
    expect(mocks.api.get.mock.calls.filter(([url]) => url === '/support-tickets/metrics')).toHaveLength(2);
  });

  it('loads the in-progress queue when its metric is clicked', async () => {
    mocks.route.query = { status: 'open' };
    await render();
    await wrapper.findAll('.metric-card')[1].trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params.displayStatus).toBe('in_progress');
    expect(wrapper.findAll('.ticket-row')).toHaveLength(2);
  });

  it('clears an empty status filter while preserving the tenant and assignment scope', async () => {
    mocks.route.query = { mine: 'true', status: 'open' };
    await render();
    await button('Clear filters').trigger('click');
    await flushPromises();
    expect(queueCalls().at(-1)[1].params).toEqual({ limit: 80, agencyId: 2, mine: true });
    expect(wrapper.findAll('.ticket-row')).toHaveLength(1);
  });

  it.each([
    ['school_staff', {}],
    ['super_admin', { mode: 'mine' }]
  ])('keeps submitted-ticket access for %s with %j', async (role, props) => {
    mocks.auth.user.role = role;
    await render(props);
    expect(mocks.api.get).toHaveBeenCalledWith('/support-tickets/mine', expect.any(Object));
    expect(queueCalls()).toHaveLength(0);
  });
});

const emailTicket = { ...assignedTicket, source_channel: 'email', source_email_from: 'school@example.org', subject: 'School email' };
const emailOptions = [{ id: 12, identityKey: 'schools', fromEmail: 'schools@itsco.health', teamDisplayName: 'ITSCO Schools', staffDisplayName: 'Hannah · ITSCO' }];
function emailFixture() {
  const originalGet = mocks.api.get.getMockImplementation();
  mocks.api.get.mockImplementation(async (url, options) => {
    if (url === '/support-tickets') return { data: [emailTicket, { ...otherTicket, claimed_by_user_id: 7 }] };
    if (url === '/support-tickets/101/messages') return { data: { ticket: emailTicket, messages: [], senderOptions: emailOptions, lastMessageId: 41 } };
    if (url === '/support-tickets/102/messages') return { data: { ticket: { ...otherTicket, claimed_by_user_id: 7 }, messages: [{ id: 50, body: 'Second conversation' }] } };
    return originalGet(url, options);
  });
}
describe('Support email composer safeguards', () => {
  it('lets a payroll provider reply from the shared address in the ticket modal using the team display name', async () => {
    mocks.auth.user = { id: 7, role: 'provider', payrollAgencyIds: [2], loginIsGroupEmail: true };
    const payrollTicket = { ...emailTicket, topic: 'payroll' };
    mocks.api.get.mockImplementation(async url => url === '/support-tickets/101/messages' ? { data: {
      ticket: payrollTicket, messages: [], lastMessageId: 41,
      senderOptions: [{ id: 22, identityKey: 'payroll', fromEmail: 'payroll@itsco.health', teamDisplayName: 'ITSCO Payroll', staffDisplayName: 'Sam · ITSCO' }]
    } } : { data: {} });
    mocks.api.post.mockResolvedValue({ data: { emailReply: { status: 'sent', sent: true } } });
    await render({ embedded: true, initialTicketId: 101, agencyId: 2, syncRoute: false });
    expect(wrapper.get('select[aria-label="Email address"]').text()).toContain('payroll@itsco.health');
    expect(wrapper.get('select[aria-label="Name and signature"]').element.value).toBe('team');
    expect(button('AI draft')).toBeUndefined();
    await wrapper.find('.composer-textarea').setValue('Payroll has reviewed your request.');
    await button('Send reply').trigger('click');
    await flushPromises();
    expect(mocks.api.post).toHaveBeenCalledWith('/support-tickets/101/messages', expect.objectContaining({
      senderIdentityId: 22, senderMode: 'team', expectedLastMessageId: 41, isInternal: false
    }));
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(wrapper.emitted('updated')).toHaveLength(1);
  });

  it('keeps private notes separate from external replies across navigation and reload', async () => {
    emailFixture(); await render();
    await wrapper.find('.ticket-row').trigger('click'); await flushPromises();
    await wrapper.find('.composer-textarea').setValue('Hello, here is the answer.');
    await button('Internal note').trigger('click');
    expect(wrapper.find('.composer-textarea').element.value).toBe('');
    await wrapper.find('.composer-textarea').setValue('Private staff discussion');
    await button('Reply').trigger('click');
    expect(wrapper.find('.composer-textarea').element.value).toBe('Hello, here is the answer.');
    await button('Next').trigger('click'); await flushPromises();
    expect(wrapper.find('.composer-textarea').element.value).toBe('');
    await button('Previous').trigger('click'); await flushPromises();
    expect(wrapper.find('.composer-textarea').element.value).toBe('Hello, here is the answer.');
    await button('Internal note').trigger('click');
    expect(wrapper.find('.composer-textarea').element.value).toBe('Private staff discussion');
    wrapper.unmount(); await render();
    await wrapper.find('.ticket-row').trigger('click'); await flushPromises();
    expect(wrapper.find('.composer-textarea').element.value).toBe('Private staff discussion');
    await button('Reply').trigger('click');
    expect(wrapper.find('.composer-textarea').element.value).toBe('Hello, here is the answer.');
  });

  it('does not replace the selected conversation with a late response from another ticket', async () => {
    let resolveFirst;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    emailFixture(); const originalGet = mocks.api.get.getMockImplementation();
    mocks.api.get.mockImplementation((url, options) => url === '/support-tickets/101/messages' ? first : originalGet(url, options));
    await render(); await wrapper.find('.ticket-row').trigger('click');
    await button('Next').trigger('click'); await flushPromises();
    resolveFirst({ data: { ticket: emailTicket, messages: [{ id: 41, body: 'Wrong late conversation' }] } });
    await flushPromises();
    expect(wrapper.find('.detail-id').text()).toBe('Ticket #102');
    expect(wrapper.text()).toContain('Second conversation');
    expect(wrapper.text()).not.toContain('Wrong late conversation');
  });

  it('keeps a failed reply and reuses its request identity instead of submitting another email', async () => {
    emailFixture(); mocks.api.post.mockResolvedValue({ data: { emailReply: { status: 'failed', sent: false } } });
    await render(); await wrapper.find('.ticket-row').trigger('click'); await flushPromises();
    await wrapper.find('.composer-textarea').setValue('A human response');
    await button('Send reply').trigger('click'); await flushPromises();
    expect(wrapper.find('.composer-textarea').element.value).toBe('A human response');
    expect(wrapper.text()).toContain('Delivery was not confirmed');
    const firstRequest = mocks.api.post.mock.calls[0][1];
    expect(firstRequest).toMatchObject({ body: 'A human response', senderIdentityId: 12, senderMode: 'staff', expectedLastMessageId: 41, isInternal: false });
    expect(firstRequest.clientRequestId).toBeTruthy();
    await button('Send reply').trigger('click'); await flushPromises();
    expect(mocks.api.post.mock.calls[1][1].clientRequestId).toBe(firstRequest.clientRequestId);
  });

  it('keeps a new draft on a different ticket when an earlier send finishes', async () => {
    emailFixture(); let finishSend;
    mocks.api.post.mockImplementation(() => new Promise((resolve) => { finishSend = resolve; }));
    await render(); await wrapper.find('.ticket-row').trigger('click'); await flushPromises();
    await wrapper.find('.composer-textarea').setValue('First ticket reply');
    await button('Send reply').trigger('click');
    await button('Next').trigger('click'); await flushPromises();
    await wrapper.find('.composer-textarea').setValue('Second ticket work');
    finishSend({ data: { emailReply: { status: 'sent', sent: true } } }); await flushPromises();
    expect(wrapper.find('.detail-id').text()).toBe('Ticket #102');
    expect(wrapper.find('.composer-textarea').element.value).toBe('Second ticket work');
  });
});

it('offers private files on the exact external reply ticket and hides the control for an internal note',async()=>{
 await render({embedded:true,initialTicketId:101,agencyId:2,syncRoute:false});
 expect(wrapper.findComponent({name:'TicketAttachmentComposer'}).props('ticketId')).toBe(101);
 await button('Internal note').trigger('click');
 expect(wrapper.find('ticket-attachment-composer-stub').exists()).toBe(false);
});

it('keeps both reply and official answer disabled while the private file is uploading',async()=>{
 await render({embedded:true,initialTicketId:101,agencyId:2,syncRoute:false});
 await wrapper.find('.composer-textarea').setValue('Keep this reply with its attachment');
 const files=wrapper.findComponent({name:'TicketAttachmentComposer'});files.vm.$emit('busy',true);await flushPromises();
 expect(button('Send reply').attributes('disabled')).toBeDefined();
 await button('Official answer').trigger('click');
 await wrapper.find('.composer-textarea').setValue('Official answer with its attachment');
 expect(button('Send answer').attributes('disabled')).toBeDefined();
 expect(mocks.api.post).not.toHaveBeenCalled();
 files.vm.$emit('busy',false);await flushPromises();
 expect(button('Send answer').attributes('disabled')).toBeUndefined();
 await button('Reply').trigger('click');
 expect(wrapper.find('.composer-textarea').element.value).toBe('Keep this reply with its attachment');
});

it('retains the answer and selected file when its upload fails, without posting an answer',async()=>{
 const upload=vi.fn().mockResolvedValue(false);
 const Files=defineComponent({name:'TicketAttachmentComposer',setup(_props,{expose}){expose({hasFile:()=>true,uploadPending:upload});return()=>null;}});
 await render({embedded:true,initialTicketId:101,agencyId:2,syncRoute:false},{TicketAttachmentComposer:Files});
 await button('Official answer').trigger('click');await wrapper.find('.composer-textarea').setValue('Answer that must retain its file');
 await button('Send answer').trigger('click');await flushPromises();
 expect(upload).toHaveBeenCalledWith(101);expect(mocks.api.post).not.toHaveBeenCalled();
 expect(wrapper.find('.composer-textarea').element.value).toBe('Answer that must retain its file');
 expect(wrapper.text()).toContain('Add the file successfully before sending');
});

function ownedPortalQueue() {
 const original=mocks.api.get.getMockImplementation();
 mocks.api.get.mockImplementation(async (url,options) => {
  if(url==='/support-tickets')return{data:[assignedTicket,{...otherTicket,claimed_by_user_id:7}]};
  if(url==='/support-tickets/102/messages')return{data:{ticket:{...otherTicket,claimed_by_user_id:7},messages:[]}};
  return original(url,options);
 });
}
it('sends the clicked official-answer snapshot after upload and preserves text edited while waiting',async()=>{
 let finishUpload;const pending=new Promise(resolve=>{finishUpload=resolve;});
 const Files=defineComponent({name:'TicketAttachmentComposer',setup(_props,{expose}){expose({hasFile:()=>true,uploadPending:()=>pending});return()=>null;}});
 await render({embedded:true,initialTicketId:101,agencyId:2,syncRoute:false},{TicketAttachmentComposer:Files});
 await button('Official answer').trigger('click');await wrapper.find('.composer-textarea').setValue('Answer reviewed at the click');
 await wrapper.get('.promote-library-check input').setValue(true);await wrapper.get('.promote-library-title').setValue('Original library title');
 await button('Send answer').trigger('click');await wrapper.find('.composer-textarea').setValue('New draft typed during upload');
 await wrapper.get('.promote-library-title').setValue('New library work');
 finishUpload(true);await flushPromises();
 expect(mocks.api.post).toHaveBeenCalledWith('/support-tickets/101/answer',expect.objectContaining({answer:'Answer reviewed at the click',promoteToLibrary:{title:'Original library title'}}));
 expect(wrapper.find('.composer-textarea').element.value).toBe('New draft typed during upload');
 expect(wrapper.get('.promote-library-title').element.value).toBe('New library work');
});
it('does not clear a new answer after a ticket A-to-B-to-A transition while an earlier answer finishes',async()=>{
 ownedPortalQueue();let finishAnswer;mocks.api.post.mockImplementation(()=>new Promise(resolve=>{finishAnswer=resolve;}));
 await render();await wrapper.find('.ticket-row').trigger('click');await flushPromises();
 await button('Official answer').trigger('click');await wrapper.find('.composer-textarea').setValue('Original answer');await button('Send answer').trigger('click');
 await button('Next').trigger('click');await flushPromises();await button('Previous').trigger('click');await flushPromises();
 await wrapper.find('.composer-textarea').setValue('Fresh work after returning to A');
 finishAnswer({data:{}});await flushPromises();
 expect(wrapper.find('.composer-textarea').element.value).toBe('Fresh work after returning to A');
 expect(button('Send answer').attributes('disabled')).toBeUndefined();
});
it('allows sending the next ticket and does not let an old answer release the new request’s busy state',async()=>{
 ownedPortalQueue();let finishFirst,finishSecond;
 mocks.api.post.mockImplementation(url=>new Promise(resolve=>{if(url==='/support-tickets/101/answer')finishFirst=resolve;else finishSecond=resolve;}));
 await render();await wrapper.find('.ticket-row').trigger('click');await flushPromises();
 await button('Official answer').trigger('click');await wrapper.find('.composer-textarea').setValue('First answer');await button('Send answer').trigger('click');
 await button('Next').trigger('click');await flushPromises();await button('Official answer').trigger('click');await wrapper.find('.composer-textarea').setValue('Second answer');
 expect(button('Send answer').attributes('disabled')).toBeUndefined();await button('Send answer').trigger('click');
 finishFirst({data:{}});await flushPromises();expect(button('Sending…').attributes('disabled')).toBeDefined();
 finishSecond({data:{}});await flushPromises();await wrapper.find('.composer-textarea').setValue('Next independent draft');
 expect(button('Send reply').attributes('disabled')).toBeUndefined();
});
it('does not show an old upload failure or post its answer after moving to another ticket',async()=>{
 ownedPortalQueue();let finishUpload;const pending=new Promise(resolve=>{finishUpload=resolve;});
 const Files=defineComponent({name:'TicketAttachmentComposer',setup(_props,{expose}){expose({hasFile:()=>true,uploadPending:()=>pending});return()=>null;}});
 await render({}, {TicketAttachmentComposer:Files});await wrapper.find('.ticket-row').trigger('click');await flushPromises();
 await button('Official answer').trigger('click');await wrapper.find('.composer-textarea').setValue('Old answer');await button('Send answer').trigger('click');
 await button('Next').trigger('click');await flushPromises();await wrapper.find('.composer-textarea').setValue('Current ticket draft');
 finishUpload(false);await flushPromises();expect(mocks.api.post).not.toHaveBeenCalled();
 expect(wrapper.find('.composer-textarea').element.value).toBe('Current ticket draft');expect(wrapper.text()).not.toContain('Add the file successfully before sending');
 expect(button('Send reply').attributes('disabled')).toBeUndefined();
});
it('releases the parent attachment-busy flag when changing to an internal note during a real upload',async()=>{
 let finishUpload;mocks.api.post.mockImplementation(()=>new Promise(resolve=>{finishUpload=resolve;}));
 await render({embedded:true,initialTicketId:101,agencyId:2,syncRoute:false},{TicketAttachmentComposer:false});
 const input=wrapper.get('input[type="file"]');Object.defineProperty(input.element,'files',{value:[new File(['%PDF'],'qa.pdf',{type:'application/pdf'})],configurable:true});await input.trigger('change');
 await button('Add file to ticket').trigger('click');await button('Internal note').trigger('click');await wrapper.find('.composer-textarea').setValue('Internal work after changing mode');
 expect(button('Add note').attributes('disabled')).toBeUndefined();
 finishUpload({data:{attachment:{id:900,file_name:'qa.pdf'}}});await flushPromises();
 expect(wrapper.find('.composer-textarea').element.value).toBe('Internal work after changing mode');
 expect(mocks.api.post.mock.calls.map(([url])=>url)).toEqual(['/support-tickets/101/attachments']);
});

it('shows website email senders, assignment provenance and truthful delivery receipts',async()=>{
 const website={...emailTicket,source_channel:'public_web'};
 const original=mocks.api.get.getMockImplementation();
 mocks.api.get.mockImplementation(async(url,options)=>url==='/support-tickets/101/messages'?{data:{ticket:website,messages:[],senderOptions:[...emailOptions,{id:81,fromEmail:'support@innerstrengthin.com',agencyName:'Inner Strength',teamDisplayName:'Inner Strength',staffDisplayName:'Michael · Inner Strength'}],lastMessageId:0,
 assignmentHistory:[{id:1,kind:'assigned',actorName:'Hannah Inyart',at:'2026-11-10T12:00:00Z'}],emailReceipts:[{id:8,direction:'outbound',from_email:'support@itsco.health',send_status:'sent',to:['visitor@example.org'],has_preview:true,communication_id:6479}]}}:original(url,options));
 await render({embedded:true,initialTicketId:101,agencyId:2,syncRoute:false});
 expect(wrapper.get('[aria-label="Email address"]').text()).toContain('support@innerstrengthin.com');
 expect(wrapper.get('[aria-label="Assignment history"]').text()).toContain('Assigned by Hannah Inyart');
 const receipts=wrapper.get('[aria-label="Email delivery and sent copies"]');expect(receipts.text()).toContain('Sent to mail provider');expect(receipts.text()).toContain('Delivery confirmation: Not recorded');expect(receipts.text()).toContain('View sent email');
});
