import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../middleware/auth.middleware.js', () => ({ authenticate: (req,res,next) => { if (!req.identity) return res.status(401).json({});req.user=req.identity;next(); }, requireCapability: () => (req,res,next) => req.user.hiring ? next() : res.status(403).json({}) }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(async () => [{ id: 9000 }]) } }));
vi.mock('../../controllers/contractGenerator.controller.js', () => Object.fromEntries(['getContractLibrary','postEmploymentStarter','getCandidateWizardContextHandler','listContractCandidates','inferContractCompensation','postContractTemplate','patchContractTemplate','postContractClause','patchContractClause','postContractConfig','patchContractConfig','previewContractForCandidate','generateContractForCandidate'].map(key => [key,(_req,res) => res.json({})])));
vi.mock('../../services/hireFingerprintingGuide.service.js', () => ({ readHireFingerprintingScreenshot: vi.fn(async () => Buffer.from('synthetic image')) }));
import router from '../contractGenerator.routes.js';
import { readHireFingerprintingScreenshot } from '../../services/hireFingerprintingGuide.service.js';
beforeEach(() => vi.clearAllMocks());
function request(identity,agencyId=9000) {
 return new Promise((resolve,reject) => {
  const req={method:'GET',url:'/fingerprinting-screenshots/'+ 'a'.repeat(64),originalUrl:'/fingerprinting-screenshots/'+ 'a'.repeat(64),identity,query:{agencyId},body:{},headers:{}};
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){resolve({status:this.statusCode,body});},set(){return this;},type(){return this;},send(body){resolve({status:this.statusCode,body});}};
  router.handle(req,res,error=>error?reject(error):resolve({status:404}));
 });
}
it('requires staff authentication before serving image bytes',async()=>{expect((await request(null)).status).toBe(401);expect(readHireFingerprintingScreenshot).not.toHaveBeenCalled();});
it('requires the existing hiring capability',async()=>{expect((await request({id:9100,role:'admin',hiring:false})).status).toBe(403);expect(readHireFingerprintingScreenshot).not.toHaveBeenCalled();});
it('does not let staff request another organization through query parameters',async()=>{expect((await request({id:9100,role:'admin',hiring:true},9001)).status).toBe(403);expect(readHireFingerprintingScreenshot).not.toHaveBeenCalled();});
it('serves an authorized hiring staff member inside their organization',async()=>{expect((await request({id:9100,role:'admin',hiring:true})).status).toBe(200);expect(readHireFingerprintingScreenshot).toHaveBeenCalledWith(9000,'a'.repeat(64));});
