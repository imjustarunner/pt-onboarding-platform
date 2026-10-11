import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../models/HiringJobDescription.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../../services/contractGenerator.service.js',()=>({listConfigs:vi.fn()}));
vi.mock('../../services/contractCompensation.service.js',()=>({contractCompensationLevels:vi.fn().mockResolvedValue([])}));
vi.mock('../../services/contractMerge.service.js',()=>({getAgencyBuilderDefaults:vi.fn().mockResolvedValue({agency:{name:'ITSCO'},offices:[]}),loadContractBundle:vi.fn().mockResolvedValue({clauses:[{body_html:'{{START_DATE}} {{EMPLOYEE_FULL_NAME}}'}]}),renderContractHtml:vi.fn(),applyContractTokens:vi.fn(html=>html),inferCompensationFromCredential:vi.fn()}));
import Jobs from '../../models/HiringJobDescription.model.js';
import {renderContractHtml} from '../contractMerge.service.js';
import {packetPreviewContract,previewAgency} from '../../controllers/hirePacketPreview.controller.js';
const response=()=>({set:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();Jobs.findById.mockResolvedValue({id:8,agency_id:2,is_active:1,title:'Facilitator',job_desc_clause_key:'JOB_DESC_GENERIC',default_contract_config_id:3});renderContractHtml.mockResolvedValue({html:'<body>Populated agreement</body>',tokens:{},unresolvedTokens:[]});});
describe('capability packet scope',()=>{
 it('pins the agency to the verified capability regardless of request parameters',async()=>{expect(await previewAgency({rehearsalAccess:{agencyId:2},body:{agencyId:9},query:{agencyId:7}})).toBe(2);});
 it('rejects a job belonging to a different agency',async()=>{Jobs.findById.mockResolvedValue({id:8,agency_id:9,is_active:1});const next=vi.fn();await packetPreviewContract({rehearsalAccess:{agencyId:2},body:{jobId:8,category:1,level:1},query:{}},response(),next);expect(next.mock.calls[0][0].status).toBe(404);expect(renderContractHtml).not.toHaveBeenCalled();});
 it('forces fictional seeded values on a capability request',async()=>{const res=response();await packetPreviewContract({rehearsalAccess:{agencyId:2},body:{jobId:8,category:1,level:1,seeded:false},query:{}},res,vi.fn());expect(renderContractHtml.mock.calls[0][0].tokens.EMPLOYEE_FULL_NAME).toBe('Alex Demo');expect(renderContractHtml.mock.calls[0][0].tokens.START_DATE).toBeTruthy();expect(res.json.mock.calls[0][0].seeded).toBe(true);});
 it('returns a complete marked sample when the real contract setup is incomplete',async()=>{renderContractHtml.mockRejectedValue(Object.assign(new Error('Missing pay rate'),{status:400}));const res=response();await packetPreviewContract({rehearsalAccess:{agencyId:2},body:{jobId:8,category:1,level:1},query:{}},res,vi.fn());expect(res.json.mock.calls[0][0].sampleContract).toBe(true);expect(res.json.mock.calls[0][0].html).toContain('Alex Demo');});
});
