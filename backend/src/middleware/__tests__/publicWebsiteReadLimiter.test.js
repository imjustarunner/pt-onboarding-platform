import {describe,it,expect,vi} from 'vitest';
vi.mock('express-rate-limit',()=>({default:options=>options}));
vi.mock('../../config/config.js',()=>({default:{nodeEnv:'production'}}));
vi.mock('../../utils/ipAddress.util.js',()=>({getClientIpAddress:req=>req.ip}));
import {publicWebsiteReadLimiter as reads,publicMarketingPageMetricsLimiter as metrics} from '../rateLimiter.middleware.js';
describe('public navigation rate limits',()=>{
 it('does not exhaust the directory budget while reading partners or metrics',()=>{
  const req={ip:'203.0.113.10',route:{path:'/partners'}};
  const partners=reads.keyGenerator(req),directory=reads.keyGenerator({...req,route:{path:'/itsco/website-data'}});
  expect(partners).not.toBe(directory);expect(directory).not.toBe(metrics.keyGenerator(req));
  expect(reads.windowMs).toBeLessThan(metrics.windowMs);expect(reads.max).toBeGreaterThan(40);
 });
 it('keeps separate budgets for different visiting networks and retains throttling',()=>{
  const req={ip:'203.0.113.10',path:'/itsco/website-data'};
  expect(reads.keyGenerator(req)).not.toBe(reads.keyGenerator({...req,ip:'203.0.113.11'}));
  expect(reads.max).toBeLessThanOrEqual(120);expect(reads.standardHeaders).toBe(true);
 });
});
