export const question='Tell us about a time you helped someone learn something new — what did you do and what was the outcome?';
export const questionnaire={version:3,scale:'1 = needs substantial support · 3 = meets expectations · 5 = consistently excels. Choose Not observed when appropriate.',traits:[
 {key:'communication',label:'Communication',question:'How would you rate their communication?'},
 {key:'reliability',label:'Reliability',question:'How would you rate their reliability?'},
 {key:'collaboration',label:'Collaboration',question:'How would you rate their collaboration?'}
],questions:[{key:'learning',label:'What would help Sofia succeed in a new learning environment?',required:false}]};
export const reference={agencyName:'Next Level Up',candidateLabel:'Sofia Bennett',disclaimer:'Fictional capture only. These answers are not a real hiring reference.',expiresAt:'2026-12-10T23:59:00Z',questionnaire,referenceContact:{referenceName:'Casey Morgan',referenceEmail:'casey@example.invalid',referenceOrganization:'Example Learning Collective',relationshipType:'manager',relationshipDuration:'3_5_years'},contact:{teamLabel:'People Operations',email:'people@example.invalid',supportUrl:'https://plotlinepo.com/support'}};
const steps=[
 {key:'profile',kind:'profile',title:'Your information',complete:true},
 {key:'job-description',kind:'job-description',title:'Role & responsibilities',complete:true},
 {key:'agreement',kind:'task',title:'Employment agreement',task:{id:'agreement',taskType:'document'},complete:true},
 {key:'communications',kind:'staff-communications',title:'Communication choices',complete:true},
 {key:'fingerprinting',kind:'fingerprinting',title:'Fingerprinting guide',complete:false},
 {key:'availability',kind:'school-availability',title:'Your availability',complete:false},
 {key:'welcome',kind:'resource',title:'Meet your team',complete:false},
 {key:'review',kind:'review',title:'Review your package',complete:false}
];
export const prehire={candidate:{firstName:'Sofia',lastName:'Bennett',status:'PREHIRE_OPEN',appliedRole:'Education & Tutoring Candidate'},agency:{id:0,name:'Next Level Up',logoUrl:'/assets/nlu/logo.png',primaryColor:'#174c3d'},portalLink:'https://example.invalid/private-demo-link',workflow:{preferredWorkEmail:'sofia.bennett@example.invalid',config:{tagline:'Your next chapter starts here.',bannerUrl:'/assets/plotline/website/photos/production/mountain-v2.webp'},profile:{firstName:'Sofia',lastName:'Bennett'},steps:{pre_hire:steps},progress:{pre_hire:{total:7,completed:4,percent:57,allDone:false}}},journey:{},tasks:[]};
