// Synthetic public-demo data only. No production accounts or member information.
export const leaderboard = {
  individual: [
    {user_id:1,first_name:'Alex',last_name:'Summit',total_points:420,total_miles:32.5},
    {user_id:2,first_name:'Jamie',last_name:'Trail',total_points:385,total_miles:28.2},
    {user_id:3,first_name:'Sam',last_name:'Peak',total_points:360,total_miles:26.4}
  ],
  team: [{team_id:1,team_name:'Trailblazers',total_points:1240},{team_id:2,team_name:'Peak Pursuit',total_points:1180},{team_id:3,team_name:'Stride Society',total_points:1095}]
};
export const workouts = leaderboard.individual.slice(0,2).map((person,i) => ({
  ...person,id:i+1,team_id:i+1,team_name:leaderboard.team[i].team_name,
  activity_type:i?'walking':'running',terrain:i?'Trail':'Road',
  completed_at:'2026-10-05T14:00:00Z',distance_value:i?2.4:5,duration_minutes:i?42:45,
  points:i?24:50,kudos_count:i?3:5,proof_status:'approved',weekly_task_name:i?'Explore a new route':'Go the distance'
}));
export const tasks = [
  {id:1,title:'Go the distance',name:'Go the distance',description:'Complete a five-mile run and tag your workout for your team.',mode:'individual',points:50,bonus_points:50,icon:'🏃',activity_type:'running'},
  {id:2,title:'Explore a new route',name:'Explore a new route',description:'Head outside for a walk on a trail you have not tried before.',mode:'individual',points:30,bonus_points:30,icon:'🥾',activity_type:'walking'}
];
