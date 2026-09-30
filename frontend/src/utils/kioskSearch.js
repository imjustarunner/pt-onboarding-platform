export const normalizeSearch=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,'');
export function kioskMatches(value,query){
 const text=normalizeSearch(value),words=text.split(/\s+/);
 return normalizeSearch(query).split(/\s+/).filter(Boolean).every(token=>{
 if(text.includes(token))return true;
 let i=0;for(const char of text)if(char===token[i])i++;if(i===token.length)return true;
 return token.length>=4&&words.some(word=>{if(Math.abs(word.length-token.length)>1)return false;const dp=Array.from({length:token.length+1},(_,i)=>i);for(let j=1;j<=word.length;j++){let old=dp[0];dp[0]=j;for(let k=1;k<=token.length;k++){const prev=dp[k];dp[k]=Math.min(dp[k]+1,dp[k-1]+1,old+(token[k-1]===word[j-1]?0:1));old=prev;}}return dp[token.length]<=1;});
 });
}
