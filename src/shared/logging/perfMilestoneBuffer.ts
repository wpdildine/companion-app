/**
 * Lightweight in-memory ring buffer of recent perf milestones for frame-gap attribution.
 * perfTrace() pushes here; starvation detector reads milestones between previous and current frame.
 * No file output, no heavy serialization.
 */

const BUFFER_SIZE = 128;

const PERF_BUFFER_INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function getPerfBufferInstanceId(): string {
  return PERF_BUFFER_INSTANCE_ID;
}

export function getPerfMilestoneBufferSize(): number {
  return count;
}

export interface PerfMilestoneEntry {
  name: string;
  timestamp: number;
  scope: string;
  requestId?: number;
}

const buffer: PerfMilestoneEntry[] = new Array(BUFFER_SIZE);
let index = 0;
let count = 0;

function nextIdx(): number {
  const i = index;
  index = (index + 1) % BUFFER_SIZE;
  if (count < BUFFER_SIZE) count++;
  return i;
}

export function pushPerfMilestone(entry: PerfMilestoneEntry): void {
  buffer[nextIdx()] = entry;
}

/** When not full, valid slots are 0..count-1. When full, oldest is at index, newest at index-1 (mod SIZE). */
function iterSlots(fn: (k: number) => void): void {
  const len = count;
  if (len === 0) return;
  const startSlot = count < BUFFER_SIZE ? 0 : index;
  for (let i = 0; i < len; i++) {
    const k = (startSlot + i) % BUFFER_SIZE;
    fn(k);
  }
}

/**
 * Returns milestones with timestamp in [fromMs, toMs] (inclusive), sorted by timestamp.
 * Use previousFrameAtMs and currentFrameAtMs to get "what happened during the frame gap".
 */
export function getMilestonesBetween(fromMs: number, toMs: number): PerfMilestoneEntry[] {
  const out: PerfMilestoneEntry[] = [];
  iterSlots(k => {
    const e = buffer[k];
    if (!e) return;
    if (e.timestamp >= fromMs && e.timestamp <= toMs) out.push(e);
  });
  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}

/**
 * Returns the most recent `limit` milestones with timestamp <= toMs, sorted ascending.
 */
export function getRecentMilestonesBefore(toMs: number, limit: number): PerfMilestoneEntry[] {
  const out: PerfMilestoneEntry[] = [];
  iterSlots(k => {
    const e = buffer[k];
    if (!e) return;
    if (e.timestamp <= toMs) out.push(e);
  });
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out.slice(0, limit).reverse();
}

export function getPerfMilestoneBufferDebugState(): {
  instanceId: string;
  count: number;
  writeIndex: number;
  capacity: number;
  newestTimestamp?: number;
  oldestTimestamp?: number;
} {
  let newest: number | undefined;
  let oldest: number | undefined;
  iterSlots(k => {
    const e = buffer[k];
    if (!e) return;
    const t = e.timestamp;
    if (newest === undefined || t > newest) newest = t;
    if (oldest === undefined || t < oldest) oldest = t;
  });
  return {
    instanceId: PERF_BUFFER_INSTANCE_ID,
    count,
    writeIndex: index,
    capacity: BUFFER_SIZE,
    ...(newest !== undefined && { newestTimestamp: newest }),
    ...(oldest !== undefined && { oldestTimestamp: oldest }),
  };
}

export function getLastNMilestonesRaw(limit: number): PerfMilestoneEntry[] {
  const out: PerfMilestoneEntry[] = [];
  iterSlots(k => {
    const e = buffer[k];
    if (e) out.push(e);
  });
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out.slice(0, limit);
}
