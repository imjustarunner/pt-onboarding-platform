import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PLOTLINE_PRODUCT,estimatePlotlinePrice,plotlineQuoteFromQuery,formatPlotlineMoney} from '../src/config/plotlineProduct.js';

test('the organization minimum includes employee fees rather than adding another platform fee',()=>{
 for(const employees of [0,1,5,9])assert.equal(estimatePlotlinePrice({employees}).recurringCents,2900);
 assert.equal(estimatePlotlinePrice({employees:10}).recurringCents,3000);
 const quote=estimatePlotlinePrice({employees:5});
 assert.equal(quote.employeeCents,1500);assert.equal(quote.minimumAdjustmentCents,1400);assert.equal(quote.monthlyCents,2900);
});
test('employee volume rates are graduated across the 25 and 100 boundaries',()=>{
 for(const [employees,cents] of [[25,7500],[26,7750],[30,8750],[100,26250],[101,26450],[100000,20006250]])assert.equal(estimatePlotlinePrice({employees}).employeeCents,cents);
 assert.deepEqual(estimatePlotlinePrice({employees:101}).employeeBreakdown.map(b=>b.count),[25,75,1]);
});
test('activity charges are separated from the recurring platform and one-time onboarding',()=>{
 const q=estimatePlotlinePrice({employees:5,screenings:10,interviewMinutes:60,onboardings:1});
 assert.equal(q.recurringCents,2900);assert.equal(q.screeningCents,2000);assert.equal(q.interviewCents,1200);assert.equal(q.onboardingCents,2000);assert.equal(q.monthlyCents,8100);
 assert.equal(estimatePlotlinePrice({employees:5}).monthlyCents,2900);
});
test('aggregate interview minutes prorate once to cents, with no per-session rounding minimum',()=>{
 for(const [minutes,cents] of [[0,0],[1,20],[2,40],[30,600],[60,1200],[90,1800]])assert.equal(estimatePlotlinePrice({interviewMinutes:minutes}).interviewCents,cents);
});
test('invalid, fractional and unsafe input cannot produce a quote',()=>{
 for(const key of ['employees','screenings','interviewMinutes','onboardings'])for(const value of [-1,0.5,NaN,Infinity,'10','',null,Number.MAX_SAFE_INTEGER])assert.throws(()=>estimatePlotlinePrice({[key]:value}),RangeError);
 assert.throws(()=>estimatePlotlinePrice({employees:100001}),RangeError);
 for(const key of ['screenings','interviewMinutes','onboardings'])assert.throws(()=>estimatePlotlinePrice({[key]:1000001}),RangeError);
});
test('only complete validated usage inputs are carried into the inquiry; query prices are ignored',()=>{
 const query={plan:'usage',employees:'5',screenings:'10',interviewMinutes:'60',onboardings:'1',price:'0'};
 assert.equal(plotlineQuoteFromQuery(query).monthlyCents,8100);
 for(const change of [{plan:'pilot'},{employees:['5','6']},{onboardings:undefined},{screenings:'1e2'},{interviewMinutes:'-1'},{employees:'1.2'},{employees:'100001'},{plan:'toString'}])assert.equal(plotlineQuoteFromQuery({...query,...change}),null);
});
test('pilot scope and money formatting preserve the public offer without a payment action',()=>{
 assert.deepEqual(PLOTLINE_PRODUCT.pilot,{days:30,interviews:5,minutesPerInterview:60,screenings:10,employees:10});
 assert.equal(formatPlotlineMoney(2900),'$29');assert.equal(formatPlotlineMoney(8750),'$87.50');assert.equal(formatPlotlineMoney(13),'$0.13');
});
