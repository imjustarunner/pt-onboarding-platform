// Public planning estimates, not invoices, metering or provisioning policy.
// Existing contracts require an explicit agreement before pricing changes.
export const PLOTLINE_PRODUCT = Object.freeze({
  id:'plotline', name:'Plotline', publisher:'PlotTwistCo', domain:'plotlinepo.com',
  currency:'USD', interval:'month', monthlyMinimumCents:2900,
  employeeBands:Object.freeze([
    Object.freeze({through:25, cents:300}),
    Object.freeze({through:100, cents:250}),
    Object.freeze({through:100000, cents:200})
  ]),
  screeningCents:200, interviewParticipantMinuteCents:10, onboardingCents:2000,
  pilot:Object.freeze({days:30, interviews:5, minutesPerInterview:60, participants:5, screenings:10, employees:10}),
  includedFeatures:Object.freeze(['hiringEnabled','peopleOpsEnabled','onboardingTraining'])
});

function wholeCount(value, label, max) {
  if (!Number.isSafeInteger(value) || value<0 || value>max) throw new RangeError(`Enter a whole ${label} count from 0 to ${max.toLocaleString('en-US')}.`);
}

export function plotlineParticipantMinutes(roomMinutes,participants) {
  wholeCount(roomMinutes,'room-minute',1000000);
  wholeCount(participants,'participant',25);
  if(participants<1)throw new RangeError('Choose at least one participant.');
  return roomMinutes*participants;
}

export function estimatePlotlinePrice(input={}, pricing=PLOTLINE_PRODUCT) {
  if(Object.hasOwn(input,'interviewMinutes'))throw new RangeError('Recalculate room-time estimates using participant minutes.');
  const {employees=10,screenings=0,participantMinutes=0,onboardings=0}=input;
  wholeCount(employees,'employee',100000);
  wholeCount(screenings,'screening',1000000);
  wholeCount(participantMinutes,'participant-minute',25000000);
  wholeCount(onboardings,'onboarding',1000000);
  let remaining=employees, previous=0;
  const employeeBreakdown=pricing.employeeBands.map(band=>{
    const count=Math.min(remaining,band.through-previous);
    remaining-=count;previous=band.through;
    return {count,rateCents:band.cents,cents:count*band.cents};
  });
  const employeeCents=employeeBreakdown.reduce((total,band)=>total+band.cents,0);
  const minimumAdjustmentCents=Math.max(0,pricing.monthlyMinimumCents-employeeCents);
  const recurringCents=employeeCents+minimumAdjustmentCents;
  const screeningCents=screenings*pricing.screeningCents;
  // Charge each participant’s connected time once; never assume a fixed panel size.
  const interviewCents=participantMinutes*pricing.interviewParticipantMinuteCents;
  const onboardingCents=onboardings*pricing.onboardingCents;
  return {employees,screenings,participantMinutes,onboardings,employeeBreakdown,employeeCents,minimumAdjustmentCents,recurringCents,screeningCents,interviewCents,onboardingCents,usageCents:screeningCents+interviewCents,monthlyCents:recurringCents+screeningCents+interviewCents+onboardingCents};
}

// Carry only a complete, validated public estimate to the established inquiry.
export function plotlineQuoteFromQuery(query={}) {
  if (query.plan!=='usage' || Object.hasOwn(query,'interviewMinutes')) return null;
  const count=key=>typeof query[key]==='string' && /^\d{1,8}$/.test(query[key])?Number(query[key]):NaN;
  try{return estimatePlotlinePrice({employees:count('employees'),screenings:count('screenings'),participantMinutes:count('participantMinutes'),onboardings:count('onboardings')});}catch{return null;}
}
export const formatPlotlineMoney=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:cents%100===0?0:2}).format(cents/100);
