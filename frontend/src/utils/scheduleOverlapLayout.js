/** Pack an entire day's intervals, so long events keep a lane across row boundaries. */
export function assignOverlapLanes(items = []) {
  const sorted = items.filter(i => Number.isFinite(i.startMs) && Number.isFinite(i.endMs) && i.endMs > i.startMs)
    .slice().sort((a,b) => a.startMs-b.startMs || b.endMs-a.endMs || String(a.key).localeCompare(String(b.key)));
  const result = new Map();
  let cluster = [], ends = [], clusterEnd = -Infinity;
  const finish = () => {
    for (const item of cluster) result.set(item.key, { col:item.col, cols:ends.length });
    cluster=[];ends=[];
  };
  for (const item of sorted) {
    if (item.startMs >= clusterEnd) finish();
    let col=ends.findIndex(end => end <= item.startMs);
    if (col < 0) col=ends.length;
    ends[col]=item.endMs;
    cluster.push({...item,col});
    clusterEnd=Math.max(clusterEnd,item.endMs);
  }
  finish();
  return result;
}

export const scheduleBlockPlacementKey = (hour, minute, key) => `${hour}:${minute}:${key}`;

/** Timed spans, published openings, and whole-cell overlays share one coordinate system. */
export function layoutScheduleDayBlocks(cells, rowMinutes = 60) {
  const intervals=[];
  for (const {hour,minute=0,blocks=[]} of cells) {
    for (const block of blocks) {
      const slice=block.timedSlice || block.virtualSlice;
      const top=Number(slice?.topPct || 0);
      const height=Number(slice?.heightPct ?? 100);
      const startMs=hour*60+minute+rowMinutes*top/100;
      intervals.push({key:scheduleBlockPlacementKey(hour,minute,block.key),startMs,endMs:startMs+rowMinutes*height/100, context:block.kind === 'sevt' && block.eventKind === 'SCHEDULE_HOLD' && !block.isCancelled, cancelled:!!block.isCancelled});
    }
  }
  const background = intervals.filter(item => item.context && intervals.some(other =>
    !other.context && !other.cancelled && item.startMs < other.endMs && other.startMs < item.endMs));
  const backgroundKeys = new Set(background.map(item => item.key));
  const layout = assignOverlapLanes(intervals.filter(item => !backgroundKeys.has(item.key)));
  for (const item of background) layout.set(item.key, {col:0, cols:1, background:true});
  return layout;
}
