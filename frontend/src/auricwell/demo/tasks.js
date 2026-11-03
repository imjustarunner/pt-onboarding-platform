// Read-only examples for the app's existing TasksHub, SharedListsView and TaskListView.
export function createDemoTaskFixtures({practice,actor,staff,weekStart}) {
 const lists=[{id:990601,name:'Clinical follow-up',my_role:'editor',task_count:2,shared_with_label:'Avery Lane and Jordan Reed'},{id:990602,name:'Practice launch checklist',my_role:'editor',task_count:1,shared_with_label:'Avery Lane, Quinn Parker and Riley Hayes'}].map(list=>({...list,agency_id:practice.id,created_by_user_id:actor.id}));
 const tasks=[
  {id:990501,title:'Review treatment goal ratings',description:'Review Emerson Cole’s clinician-recorded objective ratings before the next session. Fictional example.',status:'pending',urgency:'high',task_list_id:990601},
  {id:990502,title:'Prepare for supervision',description:'Review the two fictional notes awaiting Tessa’s co-sign and bring questions to supervision.',status:'in_progress',urgency:'medium',task_list_id:990601},
  {id:990503,title:'Review the next appointment reminders',description:'Check the fictional confirmed and pending reminder examples. No messages are sent in this demo.',status:'pending',urgency:'medium',task_list_id:null},
  {id:990504,title:'Check the practice billing checklist',description:'Review sample payer and billing information with Quinn. No financial changes are connected.',status:'pending',urgency:'low',task_list_id:990602,assigned_to_user_id:990115},
  {id:990505,title:'Review the consent checklist',description:'The fictional consent checklist has been reviewed.',status:'completed',urgency:'low',task_list_id:990601}
 ].map(task=>({...task,agency_id:practice.id,agency_name:practice.name,task_type:'custom',assigned_to_user_id:actor.id,created_by_user_id:actor.id,assignee_first_name:'Avery',assignee_last_name:'Lane',creator_first_name:'Avery',creator_last_name:'Lane',created_at:`${weekStart}T16:00:00Z`,due_date:weekStart,is_private:0,...task}));
 const membersFor=listId=>staff.filter(person=>(listId===990601?[990111,990112]:[990111,990115,990116]).includes(person.id)).map(person=>({user_id:person.id,first_name:person.first_name,last_name:person.last_name,role:'editor'}));
 for(const task of tasks){const assignee=staff.find(person=>person.id===task.assigned_to_user_id);task.assignee_first_name=assignee?.first_name||'';task.assignee_last_name=assignee?.last_name||'';}
 const select=q=>tasks.filter(task=>(!q.view||q.view==='all'||q.view==='mine'||q.view==='watchlist'||task.assigned_to_user_id===actor.id)&&(!q.taskListId||task.task_list_id===Number(q.taskListId))&&(!q.status||q.status==='all'||(q.status==='open'?task.status!=='completed':task.status===q.status))&&(!q.urgency||task.urgency===q.urgency)&&(!q.unassignedFromList||!task.task_list_id));
 function response(path,q={}) {
  if(path==='/tasks'||path==='/me/tasks')return select(q);
  if(path==='/tasks/counts')return {assigned:3,mine:4,all:4,watchlist:2,shared_lists:2,projects:0,action_items:0,pending:3,in_progress:1,completed:1,open:4,overdue:0};
  if(path==='/tasks/search')return {results:tasks.filter(task=>task.title.toLowerCase().includes(String(q.q||q.search||'').toLowerCase())).map(task=>({entity_type:'task',entity_id:task.id,title:task.title,subtitle:'Fictional example'}))};
  if(path==='/task-lists'||path==='/task-lists/team')return lists;
  if(path==='/tasks/countersignatures')return {items:[]};
  if(path==='/task-types'||path==='/task-action-items'||path==='/task-projects')return [];
  if(path===`/agencies/${practice.id}/departments`)return [];
  if(path===`/agencies/${practice.id}/users`)return staff;
  const list=path.match(/^\/task-lists\/(\d+)(?:\/(tasks|team-tasks|agency-users))?$/);
  if(list){const row=lists.find(item=>item.id===Number(list[1]));if(!row)throw new Error('That list is outside this fictional demo.');if(list[2]==='tasks'||list[2]==='team-tasks')return select({...q,taskListId:row.id});if(list[2]==='agency-users')return staff;return {...row,members:membersFor(row.id)};}
  const task=path.match(/^\/(?:me\/)?tasks\/(\d+)(?:\/(collaborators|dependencies|comments|attachments|links))?$/);
  if(task){const row=tasks.find(item=>item.id===Number(task[1]));if(!row)throw new Error('That task is outside this fictional demo.');return task[2]?[]:row;}
  return undefined;
 }
 return {tasks,lists,response};
}
