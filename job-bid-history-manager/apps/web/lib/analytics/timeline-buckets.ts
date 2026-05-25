import type { TimelineBucketKey } from "@jbhm/shared";

const MS_1H = 3600 * 1000;

/** Local calendar day key (matches table dates; avoids UTC slice bugs on 1d buckets). */
export function localDayBucketStart(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00`;
}

/** Local hour bucket (matches “May 22, 2 PM” in the table). */
export function localHourBucketStart(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:00:00`;
}

export function floorBucket(iso: string, bucket: TimelineBucketKey): string {
  const d = new Date(iso);
  if (bucket === "1month") {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  }
  if (bucket === "1d") {
    return localDayBucketStart(iso);
  }
  if (bucket === "1h") {
    return localHourBucketStart(iso);
  }
  if (bucket === "30m") {
    const t = Math.floor(d.getTime() / (30 * 60 * 1000)) * (30 * 60 * 1000);
    return new Date(t).toISOString();
  }
  const t = Math.floor(d.getTime() / (5 * 60 * 1000)) * (5 * 60 * 1000);
  return new Date(t).toISOString();
}

export function addBucket(slot: string, bucket: TimelineBucketKey): string {
  if (bucket === "1month") {
    const d = new Date(slot);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  }
  if (bucket === "1d") {
    const d = new Date(slot);
    d.setDate(d.getDate() + 1);
    return localDayBucketStart(d.toISOString());
  }
  if (bucket === "1h") {
    const d = new Date(slot);
    d.setTime(d.getTime() + MS_1H);
    return localHourBucketStart(d.toISOString());
  }
  if (bucket === "30m") {
    return new Date(new Date(slot).getTime() + 30 * 60 * 1000).toISOString();
  }
  return new Date(new Date(slot).getTime() + 5 * 60 * 1000).toISOString();
}

export function jobTimestampInRange(
  capturedAt: string,
  startIso: string,
  endIso: string,
): boolean {
  const t = new Date(capturedAt).getTime();
  return t >= new Date(startIso).getTime() && t <= new Date(endIso).getTime();
}
