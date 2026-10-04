import { tasks, workouts } from './fixtures.js';
export default {
  async get(url) {
    if (url.endsWith('/weekly-tasks')) return {data:{tasks,isPublishedForMembers:true,showWeeklySplash:false}};
    if (url.endsWith('/workouts')) return {data:{workouts}};
    return {data:{assignments:[],teams:[],byeWeeks:[],blockedUsers:[],class:{season_settings_json:{}}}};
  },
  async post() { throw new Error('The interface capture cannot write data.'); },
  async put() { throw new Error('The interface capture cannot write data.'); },
  async patch() { throw new Error('The interface capture cannot write data.'); },
  async delete() { throw new Error('The interface capture cannot write data.'); }
};
export const isApiRateLimited = () => false;
