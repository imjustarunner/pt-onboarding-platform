export const nluPath = section => `/p/nlu${section ? '/'+section : ''}`;
export const nluHeroes = {
 home:['Academic support. Emotional support.','Academic Support.\nEmotional Support.','A Program That Bridges Both.','Every student has potential. We connect individualized tutoring, counseling, and cognitive and emotional enrichment — because learning and well-being work best together.','family.png'],
 tutoring:['Academic support for a brighter tomorrow','Tutoring','Build skills. Close gaps. Gain confidence.','Personalized tutoring meets your student where they are. From homework help to foundational skill building, we help make learning feel possible and progress measurable.','learning.png'],
 counseling:['Counseling','Counseling That Supports','Growth, Resilience, and Brighter Tomorrows.','Individualized support for children and teens navigating anxiety, stress, emotional regulation, behavior concerns, and school-related challenges. A place to feel heard and build skills for everyday life.','family.png'],
 'therapy-tutoring':['Cognitive & Emotional Enrichment Program','When the barrier to learning isn’t the lesson.','Therapy + Tutoring','Some students know the material, but attention, stress, confidence, or emotional challenges get in the way. We connect academic support with the right emotional and behavioral supports.','student.png'],
 'how-it-works':['Cognitive & Emotional Enrichment Program','How the Program Works','A simple path to meaningful progress.','A personalized, collaborative process connects academic support with emotional and behavioral support, helping students move forward with confidence.','student.png'],
 'get-started':['Your student’s next chapter','Getting Started','Is Simple.','Tell us about your student. We’ll help you understand the options, answer questions, and find the right starting point for your family.','family.png'],
 about:['Our story. A brighter tomorrow.','About Next Level Up','Academic support. Emotional support. A path forward.','We believe every student has potential. We help students thrive by connecting academic support and emotional support — because learning and well-being work best together.','family.png'],
 'academic-acceleration':['Build skills. Close gaps. Gain confidence.','Next Level Academic Acceleration Program','Eight weeks. Sixteen focused sessions. One individualized path.','A planned intensive academic program in reading, math, or both, designed to identify learning gaps and build foundational skills with input from licensed teachers.','student.png'],
 'learning-center':['Learn today. Brighter tomorrows.','Next Level Learning Center','Learn what you need. Build what comes next.','Individualized learning for children, teens, and adults. Explore tutoring now and the learning pathways we’re developing for the future.','learning.png'],
 providers:['Our providers','Real People.','The Right Support for Your Student.','Explore our published counseling and tutoring providers. Their profiles show their experience, services, and current appointment options.','family.png'],
 resources:['For families','A Little Guidance.','A Confident Next Step.','Find answers, compare services, and connect with the people who can help you move forward.','learning.png'],
 contact:['We’re here to help','Let’s Find Your Next Step.','Talk with our team.','Questions about services, enrollment, or the right support for your student? Send our team a message.','family.png']
};
export const nluServices=[
 {slug:'tutoring',icon:'school',title:'Tutoring',subtitle:'Build skills. Gain confidence.',body:'Personalized support in academics, study skills, and executive functioning.',items:['Reading, writing, and math','Homework and subject support','Study strategies and organization','Individualized learning goals']},
 {slug:'therapy-tutoring',icon:'target',title:'Cognitive & Emotional Enrichment Program',subtitle:'Therapy + Tutoring',body:'An integrated approach for students whose emotional or behavioral challenges affect learning.',items:['Academic and emotional support','Coping and regulation skills','Attention and persistence','A coordinated, individualized plan']},
 {slug:'counseling',icon:'heart',title:'Counseling',subtitle:'Support today. Brighter tomorrows.',body:'A compassionate space to work on stress, confidence, coping, and school or life challenges.',items:['Emotional support','Behavior and regulation','Social skills and life transitions','Family collaboration']}
];
export const nluSteps=[
 ['Initial inquiry','Tell us about your student’s strengths, needs, goals, and current challenges. We’ll answer questions and explain next steps.','chat'],
 ['Assessment & matching','We learn about academic needs and relevant emotional or behavioral challenges, then help identify the right support.','people'],
 ['Individualized plan','Together, we set priorities and create a plan based on the student’s needs and the provider’s qualifications.','target'],
 ['Ongoing support','Your student works toward their goals. We review progress, adjust support, and stay connected with your family.','calendar'],
 ['Growth & independence','We help your student practice the skills and confidence they can carry into school and everyday life.','chart']
];
export const nluLearning=[
 ['Individual Tutoring','school','Consistent, personalized K–12 academic support.',['Reading and writing','Math','Science and social studies','Homework support','Study skills and test preparation'],'tutoring',true],
 ['Academic Acceleration','chart','Intensive academic intervention with an individualized learning plan.',['Reading and math intervention','Foundational skill recovery','Eight weeks • sixteen sessions','Teacher-informed planning','Progress monitoring'],'academic-acceleration',false],
 ['Language Learning','chat','Build communication skills and explore a new language.',['English for beginners','Conversational Spanish','Academic language skills','Other world languages'],'contact',false],
 ['Literacy Center','school','Learn to read. Read to learn.',['Early literacy and phonics','Decoding and reading fluency','Comprehension and vocabulary','Writing development'],'contact',false],
 ['Study & Learning Skills','target','Learn how to learn more effectively.',['Organization and time management','Note taking and study strategies','Breaking down assignments','Independent learning'],'contact',false],
 ['College & Career','mountain','Prepare for what comes next.',['College learning support','Research and writing skills','Resume and interview preparation','Career exploration'],'contact',false],
 ['School Readiness','people','Build a foundation for lifelong learning.',['Early literacy and numeracy','Learning routines','Kindergarten readiness'],'contact',false],
 ['Enrichment','leaf','Discover new interests and build new skills.',['Personal learning goals','Creative exploration','Lifelong learning'],'contact',false]
];
export const nluSkills=[
 ['Reading skills','school',['Phonics and decoding','Reading fluency','Vocabulary and comprehension','Identifying main ideas','Written responses to reading','Grade-level reading strategies']],
 ['Math skills','chart',['Number sense','Addition and subtraction','Multiplication and division','Fractions and decimals','Algebraic thinking and geometry','Problem-solving strategies']]
];
export const nluFaqs=[
 ['How do we choose between tutoring and counseling?','Tutoring focuses on academic skills and learning strategies. Counseling focuses on emotional and behavioral needs. If both affect your student, ask our team about coordinated support.'],
 ['What does the combined program include?','The plan may include academic support, skill development, and counseling, based on your student’s needs. Clinical services are provided only by appropriately qualified providers within their training and scope.'],
 ['Can we use insurance?','Coverage depends on the service, provider, and your specific plan. Ask our team to confirm benefits and costs before starting. Tutoring and academic services may require self-pay.'],
 ['Are in-person and virtual options available?','Options vary by provider and service. Use the provider directory to explore current formats and appointment availability.'],
 ['What should we have ready?','Your goals and questions are a good starting point. Relevant school information can help with academic planning. Complete personal and clinical information through the enrollment forms.'],
 ['Are all Learning Center programs open?','K–12 individual tutoring is available now. The additional Learning Center programs shown as Coming soon are being developed. Contact us to learn about updates.']
];
export const nluFamilies=[
 ['Getting started','Everything you need to take the next step.','people',[['New families','get-started'],['How it works','how-it-works'],['Schedule an assessment','get-started#start'],['Get matched with a provider','providers']]],
 ['Services for your student','Support designed for the whole student.','school',[['Tutoring','tutoring'],['Counseling','counseling'],['Therapy + Tutoring','therapy-tutoring'],['Learning Center','learning-center']]],
 ['Helpful resources','Practical guidance at every step.','target',[['Parent FAQs','resources#faqs'],['Insurance & billing','resources#insurance'],['Forms & enrollment','get-started#start'],['Academic acceleration','academic-acceleration']]],
 ['Stay connected','We’re in this together.','heart',[['Client portal','/nlu/login'],['Contact us','contact'],['School-year support','tutoring'],['Virtual & in-person options','providers']]]
];
