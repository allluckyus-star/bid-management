import type { JobFilters, TimelineBucketKey } from "@jbhm/shared";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fetchTimeline } from "@/lib/api";
import {
  canPanNewer,
  canPanOlder,
  initialRange,
  parseHistoryBounds,
  shiftLoadedRange,
  visibleAbsoluteRange,
  zoomPreservingVisibleRange,
  type HistoryBounds,
  type ZoomRange,
} from "@/lib/timeline-window";

/** Bids in table (filled) vs hidden by table filters (outline, no fill) */
const OUTLINE_BORDER_WIDTH = 3;

const BUCKETS: { key: TimelineBucketKey; label: string }[] = [
  { key: "1h", label: "1 hour" },
  { key: "1d", label: "1 day" },
  { key: "1month", label: "1 month" },
];

const USER_COLORS = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#ec4899", "#06b6d4"];

function dataZoomSliderStyle(dark: boolean) {
  if (dark) {
    return {
      backgroundColor: "#1a2030",
      borderColor: "#334155",
      fillerColor: "rgba(96, 165, 250, 0.32)",
      handleStyle: { color: "#252d3d", borderColor: "#64748b", borderWidth: 1 },
      moveHandleStyle: { color: "#334155", borderColor: "#64748b", borderWidth: 1 },
      emphasis: {
        handleStyle: { color: "#334155", borderColor: "#94a3b8" },
        moveHandleStyle: { color: "#475569", borderColor: "#94a3b8" },
      },
      dataBackground: {
        lineStyle: { color: "#475569", width: 1 },
        areaStyle: { color: "rgba(71, 85, 105, 0.4)" },
      },
      selectedDataBackground: {
        lineStyle: { color: "#94a3b8", width: 1 },
        areaStyle: { color: "rgba(148, 163, 184, 0.22)" },
      },
      textStyle: { color: "#94a3b8" },
    };
  }
  return {
    backgroundColor: "#f1f5f9",
    borderColor: "#cbd5e1",
    fillerColor: "rgba(59, 130, 246, 0.22)",
    handleStyle: { color: "#ffffff", borderColor: "#94a3b8", borderWidth: 1 },
    moveHandleStyle: { color: "#e2e8f0", borderColor: "#94a3b8", borderWidth: 1 },
    dataBackground: {
      lineStyle: { color: "#cbd5e1", width: 1 },
      areaStyle: { color: "rgba(148, 163, 184, 0.25)" },
    },
    selectedDataBackground: {
      lineStyle: { color: "#64748b", width: 1 },
      areaStyle: { color: "rgba(100, 116, 139, 0.3)" },
    },
  };
}

/** Distinct from USER_COLORS; readable on light and dark chart backgrounds */
function nowMarkerTheme(dark: boolean) {
  return dark
    ? {
        line: "#fb7185",
        labelText: "#ffe4e6",
        labelBg: "rgba(76, 5, 25, 0.94)",
        labelBorder: "#fb7185",
      }
    : {
        line: "#e11d48",
        labelText: "#9f1239",
        labelBg: "rgba(255, 241, 242, 0.96)",
        labelBorder: "#e11d48",
      };
}

/** Extra y-axis space above tallest visible stack so the Now pill clears bars. */
const NOW_HEADROOM_MIN = 3;
const NOW_HEADROOM_RATIO = 0.22;

function maxVisibleStackedBids(
  series: { buckets: { count: number }[] }[],
  zoom: ZoomRange,
): number {
  const n = series[0]?.buckets.length ?? 0;
  if (!n) return 0;
  const { startIdx, endIdx } = visibleBucketWindow(n, zoom);
  let max = 0;
  for (let i = startIdx; i < endIdx; i++) {
    let stack = 0;
    for (const s of series) {
      stack += s.buckets[i]?.count ?? 0;
    }
    max = Math.max(max, stack);
  }
  return max;
}

function yAxisMaxWithNowHeadroom(stackMax: number): number {
  if (stackMax <= 0) return 5;
  const headroom = Math.max(
    NOW_HEADROOM_MIN,
    Math.ceil(stackMax * NOW_HEADROOM_RATIO),
  );
  return stackMax + headroom;
}

/** Full-height line + label in headroom band; moves with x-axis zoom/pan. */
function buildNowMarkLine(nowCategory: string, yMax: number, dark: boolean) {
  const t = nowMarkerTheme(dark);
  return {
    silent: true,
    symbol: ["none", "none"] as const,
    z: 20,
    lineStyle: { color: t.line, type: "solid" as const, width: 2, opacity: 0.95 },
    label: {
      show: true,
      formatter: "Now",
      color: t.labelText,
      backgroundColor: t.labelBg,
      borderColor: t.labelBorder,
      borderWidth: 1,
      borderRadius: 4,
      padding: [3, 8] as [number, number],
      fontSize: 11,
      fontWeight: 600,
      position: "end" as const,
      distance: 2,
      align: "center" as const,
      verticalAlign: "bottom" as const,
    },
    data: [
      [
        { coord: [nowCategory, 0] },
        { coord: [nowCategory, yMax] },
      ],
    ],
  };
}

const MIN_LABEL_SPACING_PX = 10;
const CHART_LABEL_WIDTH_PX = 680;
const DATA_ZOOM_ANIM_MS = 200;
const FULL_ZOOM: ZoomRange = { start: 0, end: 100 };
const EDGE_PAN_THRESHOLD_PCT = 4;
/** Scroll without modifier pans the visible time window */
const WHEEL_PAN_STEP_RATIO = 0.1;
/** Above this many x-axis slots, use lighter rendering (hour view) */
const HEAVY_CATEGORY_COUNT = 80;

/** Max bars visible when fully zoomed out (zoom cannot show more than this at once) */
const MAX_VISIBLE_IN_VIEW: Record<TimelineBucketKey, number> = {
  "1month": 24,
  "1d": 31,
  "1h": 40,
};

/** Bars visible on first load, centered on now */
const INITIAL_VIEW: Record<TimelineBucketKey, { before: number; after: number }> = {
  "1month": { before: 1, after: 1 },
  "1d": { before: 10, after: 10 },
  "1h": { before: 8, after: 8 },
};

function maxZoomSpanPercent(categoryCount: number, bucketKey: TimelineBucketKey): number {
  const cap = MAX_VISIBLE_IN_VIEW[bucketKey];
  if (categoryCount <= cap) return 100;
  return (cap / categoryCount) * 100;
}

function clampZoomRange(start: number, end: number, maxSpan: number): ZoomRange {
  let s = Math.max(0, start);
  let e = Math.min(100, end);
  if (e - s > maxSpan) {
    e = s + maxSpan;
  }
  if (e - s < 2) {
    e = Math.min(100, s + 2);
  }
  if (s < 0) {
    e -= s;
    s = 0;
  }
  if (e > 100) {
    s -= e - 100;
    e = 100;
  }
  s = Math.max(0, s);
  return { start: s, end: e };
}

function applyWheelZoom(zoom: ZoomRange, deltaY: number, maxSpan: number): ZoomRange {
  const span = zoom.end - zoom.start;
  const center = (zoom.start + zoom.end) / 2;
  const abs = Math.abs(deltaY);
  const factor = abs > 3 ? 1.14 : abs > 1 ? 1.08 : 1.04;
  const scale = deltaY > 0 ? factor : 1 / factor;
  const newSpan = Math.min(maxSpan, Math.max(2, span * scale));
  return clampZoomRange(center - newSpan / 2, center + newSpan / 2, maxSpan);
}

function zoomRangesEqual(a: ZoomRange, b: ZoomRange): boolean {
  return Math.abs(a.start - b.start) < 0.01 && Math.abs(a.end - b.end) < 0.01;
}

/** Pan only — preserves window width; no-op at start/end (never shrinks span like zoom). */
function applyWheelPan(zoom: ZoomRange, deltaY: number, maxSpan: number): ZoomRange {
  const span = zoom.end - zoom.start;
  if (span <= 0) return zoom;

  const step = Math.max(0.5, span * WHEEL_PAN_STEP_RATIO);
  const shift = deltaY > 0 ? step : -step;

  if (shift > 0 && zoom.end >= 100) return zoom;
  if (shift < 0 && zoom.start <= 0) return zoom;

  let newStart = zoom.start + shift;
  let newEnd = zoom.end + shift;

  if (newEnd > 100) {
    newEnd = 100;
    newStart = newEnd - span;
  }
  if (newStart < 0) {
    newStart = 0;
    newEnd = newStart + span;
  }
  if (newEnd - newStart > maxSpan) {
    newEnd = newStart + maxSpan;
  }

  return { start: newStart, end: newEnd };
}

function parseLocalYmd(iso: string): { year: number; month: number; day: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** One local calendar day: 00:00:00.000 – 23:59:59.999 (matches API 1d buckets). */
function localCalendarDayBounds(startIso: string): { startMs: number; endMs: number } {
  const p = parseLocalYmd(startIso);
  if (p) {
    return {
      startMs: new Date(p.year, p.month - 1, p.day, 0, 0, 0, 0).getTime(),
      endMs: new Date(p.year, p.month - 1, p.day, 23, 59, 59, 999).getTime(),
    };
  }
  const anchor = new Date(startIso);
  const y = anchor.getFullYear();
  const mo = anchor.getMonth();
  const d = anchor.getDate();
  return {
    startMs: new Date(y, mo, d, 0, 0, 0, 0).getTime(),
    endMs: new Date(y, mo, d, 23, 59, 59, 999).getTime(),
  };
}

function bucketEndMs(startIso: string, bucketKey: TimelineBucketKey): number {
  const p = parseUtcYearMonth(startIso);
  if (bucketKey === "1month" && p) {
    return Date.UTC(p.year, p.month, 0, 23, 59, 59, 999);
  }
  if (bucketKey === "1d") return localCalendarDayBounds(startIso).endMs;
  const start = new Date(startIso).getTime();
  return start + 3600000 - 1;
}

function bucketStartMs(startIso: string, bucketKey: TimelineBucketKey): number {
  if (bucketKey === "1d") return localCalendarDayBounds(startIso).startMs;
  return new Date(startIso).getTime();
}

/** Local calendar day key — matches day-axis labels (toLocaleDateString). */
function localMonthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

/** Index of the bucket that contains the current time, or -1 if not in loaded range. */
function findNowBucketIndex(categories: string[], bucketKey: TimelineBucketKey): number {
  if (!categories.length) return -1;
  const now = Date.now();

  if (bucketKey === "1d") {
    return categories.findIndex((iso) => {
      const { startMs, endMs } = localCalendarDayBounds(iso);
      return now >= startMs && now <= endMs;
    });
  }

  if (bucketKey === "1month") {
    const thisMonth = localMonthKey(now);
    return categories.findIndex((iso) => localMonthKey(new Date(iso).getTime()) === thisMonth);
  }

  for (let i = 0; i < categories.length; i++) {
    const start = bucketStartMs(categories[i], bucketKey);
    const end = bucketEndMs(categories[i], bucketKey);
    if (now >= start && now <= end) return i;
  }
  return -1;
}

/** Closest bucket to now — only for initial zoom when now is outside the first loaded window. */
function findNearestBucketIndex(categories: string[], bucketKey: TimelineBucketKey): number {
  if (!categories.length) return 0;
  const now = Date.now();
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < categories.length; i++) {
    const { startMs, endMs } =
      bucketKey === "1d"
        ? localCalendarDayBounds(categories[i])
        : { startMs: new Date(categories[i]).getTime(), endMs: bucketEndMs(categories[i], bucketKey) };
    const dist = Math.min(Math.abs(now - startMs), Math.abs(now - endMs));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function initialZoomAroundNow(categories: string[], bucketKey: TimelineBucketKey): ZoomRange {
  const n = categories.length;
  if (n <= 1) return FULL_ZOOM;

  const cap = MAX_VISIBLE_IN_VIEW[bucketKey];
  let nowIdx = findNowBucketIndex(categories, bucketKey);
  if (nowIdx < 0) nowIdx = findNearestBucketIndex(categories, bucketKey);
  const { before, after } = INITIAL_VIEW[bucketKey];

  let startIdx = Math.max(0, nowIdx - before);
  let endIdx = Math.min(n, nowIdx + after + 1);
  if (endIdx - startIdx > cap) {
    startIdx = Math.max(0, nowIdx - Math.floor(cap / 2));
    endIdx = Math.min(n, startIdx + cap);
    startIdx = Math.max(0, endIdx - cap);
  }

  return {
    start: (startIdx / n) * 100,
    end: (endIdx / n) * 100,
  };
}

function parseUtcYearMonth(iso: string): { year: number; month: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Calendar month from bucket_start (UTC): Apr 1 – Apr 30 */
function formatMonthBucketRange(bucketStartIso: string): string {
  const p = parseUtcYearMonth(bucketStartIso);
  if (!p) return bucketStartIso;
  const start = new Date(Date.UTC(p.year, p.month - 1, 1));
  const end = new Date(Date.UTC(p.year, p.month, 0));
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatMonthAxisLabel(bucketStartIso: string): string {
  const p = parseUtcYearMonth(bucketStartIso);
  if (!p) return bucketStartIso;
  return new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

function formatDayBucketRange(bucketStartIso: string): string {
  const { startMs, endMs } = localCalendarDayBounds(bucketStartIso);
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(startMs)} 00:00 – ${fmt(endMs)} 23:59`;
}

function formatBucketRange(startIso: string, endIso: string, bucket: TimelineBucketKey): string {
  if (bucket === "1month") {
    return formatMonthBucketRange(startIso);
  }
  if (bucket === "1d") {
    return formatDayBucketRange(startIso);
  }
  const s = new Date(startIso);
  const e = new Date(endIso);
  return `${s.toLocaleString()} – ${e.toLocaleString()}`;
}

function bucketAxisLabel(iso: string, bucket: TimelineBucketKey): string {
  if (bucket === "1month") {
    return formatMonthAxisLabel(iso);
  }
  const d = new Date(iso);
  if (bucket === "1d") {
    const p = parseLocalYmd(iso);
    if (!p) return iso;
    return new Date(p.year, p.month - 1, p.day).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${datePart}\n${timePart}`;
}

function visibleBucketWindow(total: number, zoom: { start: number; end: number }) {
  const startIdx = Math.floor((total * zoom.start) / 100);
  const endIdx = Math.min(total, Math.max(startIdx + 1, Math.ceil((total * zoom.end) / 100)));
  return { startIdx, endIdx, visibleCount: endIdx - startIdx };
}

function computeMajorLabelIndices(
  total: number,
  minPx = MIN_LABEL_SPACING_PX,
  chartWidth = CHART_LABEL_WIDTH_PX,
): number[] {
  if (total <= 0) return [];
  if (total === 1) return [0];
  const maxLabels = Math.max(2, Math.floor(chartWidth / minPx));
  if (total <= maxLabels) {
    return Array.from({ length: total }, (_, i) => i);
  }
  const step = Math.ceil((total - 1) / (maxLabels - 1));
  const indices = [0];
  for (let i = step; i < total - 1; i += step) indices.push(i);
  if (indices[indices.length - 1] !== total - 1) indices.push(total - 1);
  return indices;
}

function resolveCategoryIndex(index: number, value: string, categories: string[]): number {
  const byValue = categories.indexOf(String(value));
  return byValue >= 0 ? byValue : index;
}

function buildVisibleLabelIndices(
  total: number,
  zoom: ZoomRange,
  majorIndices: number[],
  minPx = MIN_LABEL_SPACING_PX,
  chartWidth = CHART_LABEL_WIDTH_PX,
): Set<number> {
  const { startIdx, endIdx, visibleCount } = visibleBucketWindow(total, zoom);
  const show = new Set<number>();
  if (visibleCount <= 0) return show;

  const pxPerBucket = chartWidth / visibleCount;

  for (const idx of majorIndices) {
    if (idx >= startIdx && idx < endIdx) show.add(idx);
  }

  if (pxPerBucket >= minPx) {
    for (let i = startIdx; i < endIdx; i++) show.add(i);
    return show;
  }

  const anchors = [...new Set([startIdx, ...majorIndices, endIdx - 1])]
    .filter((i) => i >= startIdx && i < endIdx)
    .sort((a, b) => a - b);

  for (let k = 0; k < anchors.length - 1; k++) {
    const from = anchors[k];
    const to = anchors[k + 1];
    if (to <= from + 1) continue;

    const spanBuckets = to - from;
    const spanPx = spanBuckets * pxPerBucket;
    const extraSlots = Math.floor(spanPx / minPx) - 1;
    if (extraSlots < 1) continue;

    const minorStep = Math.max(1, Math.ceil(spanBuckets / (extraSlots + 1)));
    for (let i = from + minorStep; i < to; i += minorStep) show.add(i);
  }

  return show;
}

const labelState = {
  categories: [] as string[],
  majorIndices: [] as number[],
  zoom: FULL_ZOOM,
};

function createStableAxisLabelConfig(bucketKey: TimelineBucketKey) {
  const total = labelState.categories.length;
  const visibleCount = total
    ? visibleBucketWindow(total, labelState.zoom).visibleCount
    : 0;
  const rotate = visibleCount > 16 ? 35 : visibleCount > 8 ? 25 : 0;

  return {
    color: "#94a3b8",
    show: true,
    interval: (index: number, value: string) => {
      const categories = labelState.categories;
      if (!categories.length) return false;
      const idx = resolveCategoryIndex(index, value, categories);
      return buildVisibleLabelIndices(
        categories.length,
        labelState.zoom,
        labelState.majorIndices,
      ).has(idx);
    },
    hideOverlap: false,
    showMinLabel: true,
    showMaxLabel: true,
    rotate,
    fontSize: 10,
    formatter: (value: string) => bucketAxisLabel(String(value), bucketKey),
  };
}

type TooltipParam = {
  seriesName?: string;
  value?: number;
  marker?: string;
  data?: {
    bucket_start?: string;
    bucket_end?: string;
    captured_by?: string;
    total_count?: number;
    table_count?: number;
    hidden_count?: number;
    segment?: "in_table" | "filtered_out";
    top_companies?: { company: string; count: number }[];
  };
};

function formatBucketTooltip(
  items: TooltipParam[],
  bucket: TimelineBucketKey,
  tableFiltersActive: boolean,
): string {
  const first = items[0]?.data;
  const timeLine =
    first?.bucket_start && first?.bucket_end
      ? formatBucketRange(first.bucket_start, first.bucket_end, bucket)
      : "";

  type UserBucket = {
    marker: string;
    inTable: number;
    hidden: number;
    total: number;
    tops: { company: string; count: number }[];
  };
  const byUser = new Map<string, UserBucket>();

  for (const p of items) {
    const v = Number(p.value ?? 0);
    if (v <= 0) continue;
    const d = p.data;
    const user = d?.captured_by ?? p.seriesName ?? "";
    if (!user) continue;
    const row = byUser.get(user) ?? {
      marker: p.marker ?? "",
      inTable: 0,
      hidden: 0,
      total: d?.total_count ?? 0,
      tops: d?.top_companies ?? [],
    };
    if (d?.segment === "filtered_out") {
      row.hidden += v;
    } else {
      row.inTable += v;
      row.marker = p.marker ?? row.marker;
      if (d?.top_companies?.length) row.tops = d.top_companies;
    }
    if (!row.total && d?.total_count) row.total = d.total_count;
    byUser.set(user, row);
  }

  const users = [...byUser.values()];
  const totalBids = users.reduce((s, u) => s + (u.total || u.inTable + u.hidden), 0);
  const inTableBids = users.reduce((s, u) => s + u.inTable, 0);
  const hiddenBids = users.reduce((s, u) => s + u.hidden, 0);

  const userLines =
    users.length > 0
      ? [...byUser.entries()].map(([name, u]) => {
          const tops = u.tops
            .slice(0, 3)
            .map((c) => `&nbsp;&nbsp;• ${c.company} (${c.count})`)
            .join("<br/>");
          const detail = tableFiltersActive
            ? u.hidden > 0 && u.inTable === 0
              ? `${u.hidden} bid${u.hidden === 1 ? "" : "s"} (hidden from table)`
              : `${u.inTable} in table${u.hidden ? ` · ${u.hidden} hidden` : ""}`
            : `${u.inTable || u.total} bid${(u.inTable || u.total) === 1 ? "" : "s"}`;
          return [`${u.marker} <b>${name}</b>: ${detail}`, tops || ""].join("<br/>");
        })
      : ["<span style='opacity:0.7'>No bids in this period</span>"];

  const totalLine = tableFiltersActive
    ? `<b>Total: ${totalBids} bids</b> (${inTableBids} in table${hiddenBids ? ` · ${hiddenBids} hidden` : ""})`
    : `<b>Total: ${totalBids} bids</b>${users.length ? ` (${users.length} user${users.length === 1 ? "" : "s"})` : ""}`;

  return [
    `<b>Time bucket</b>`,
    timeLine,
    totalLine,
    "<hr style='margin:6px 0;border-color:#334155'/>",
    users.length ? "<b>By user:</b>" : "",
    ...userLines,
  ].join("<br/>");
}

function hasTableHighlight(ctx: JobFilters): boolean {
  return !!(
    ctx.tags?.length ||
    ctx.captured_by ||
    ctx.date_from ||
    ctx.date_to ||
    Object.keys(ctx.column_search ?? {}).length ||
    Object.keys(ctx.column_in ?? {}).length
  );
}

/** Checked values in Captured By column filter (table shows only these users). */
function capturedByAllowList(ctx: JobFilters): string[] | null {
  const list = ctx.column_in?.captured_by?.map((v) => v.trim()).filter(Boolean);
  return list?.length ? list : null;
}

function isUserHiddenFromTable(capturedBy: string, allow: string[] | null): boolean {
  return allow !== null && !allow.includes(capturedBy);
}

function colorForUser(capturedBy: string, allUsers: string[]): string {
  const idx = allUsers.indexOf(capturedBy);
  return USER_COLORS[(idx >= 0 ? idx : 0) % USER_COLORS.length];
}

type BarItemStyle = {
  color: string;
  opacity: number;
  borderColor?: string;
  borderWidth?: number;
  borderType?: "solid" | "dashed" | "dotted";
};

function filledBarStyle(color: string): BarItemStyle {
  return { color, opacity: 1 };
}

function outlineBarStyle(color: string): BarItemStyle {
  return {
    color: "transparent",
    opacity: 1,
    borderColor: color,
    borderWidth: OUTLINE_BORDER_WIDTH,
    borderType: "solid",
  };
}

type Props = {
  tableHighlightContext: JobFilters;
  dark?: boolean;
};

export function TimelineChart({ tableHighlightContext, dark = false }: Props) {
  const [bucket, setBucket] = useState<TimelineBucketKey>("1d");
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchTimeline>> | null>(null);
  const [pinnedZoom, setPinnedZoom] = useState<ZoomRange | null>(null);
  const [labelRefresh, setLabelRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [panLoading, setPanLoading] = useState(false);
  const chartRef = useRef<InstanceType<typeof ReactECharts> | null>(null);
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const wheelDispatchRef = useRef(false);
  const debouncedHighlight = useDebouncedValue(tableHighlightContext, 300);
  const highlightActive = hasTableHighlight(debouncedHighlight);

  const loadGenRef = useRef(0);
  const bucketLoadRef = useRef(0);
  const highlightKeyRef = useRef<string | null>(null);
  const historyBoundsRef = useRef<HistoryBounds>({ minMs: null, maxMs: null });
  const pendingEdgeRef = useRef<"older" | "newer" | null>(null);
  const isPanShiftRef = useRef(false);
  const dataRef = useRef(data);
  const bucketRef = useRef(bucket);
  const highlightRef = useRef(debouncedHighlight);
  dataRef.current = data;
  bucketRef.current = bucket;
  highlightRef.current = debouncedHighlight;

  const bindChartWheel = useCallback((chart: ReturnType<InstanceType<typeof ReactECharts>["getEchartsInstance"]>) => {
    const zr = chart.getZr();
    const handler = (ev: { event?: WheelEvent; stop?: () => void }) => {
      const e = ev.event;
      if (!e) return;
      const cats = dataRef.current?.series[0]?.buckets.length ?? 0;
      if (cats <= 1) return;

      e.preventDefault();
      ev.stop?.();

      const maxSpan = maxZoomSpanPercent(cats, bucketRef.current);
      const prev = labelState.zoom;
      const next =
        e.ctrlKey || e.metaKey
          ? applyWheelZoom(prev, e.deltaY, maxSpan)
          : applyWheelPan(prev, e.deltaY, maxSpan);

      if (zoomRangesEqual(prev, next)) return;

      labelState.zoom = next;
      setPinnedZoom(null);
      setLabelRefresh((n) => n + 1);

      wheelDispatchRef.current = true;
      chart.dispatchAction({
        type: "dataZoom",
        start: next.start,
        end: next.end,
      });
    };
    zr.on("mousewheel", handler);
    return () => zr.off("mousewheel", handler);
  }, []);

  const setupChartWheel = useCallback(
    (chart: ReturnType<InstanceType<typeof ReactECharts>["getEchartsInstance"]>) => {
      wheelCleanupRef.current?.();
      wheelCleanupRef.current = bindChartWheel(chart);
    },
    [bindChartWheel],
  );

  useEffect(() => () => wheelCleanupRef.current?.(), []);

  type LoadOpts = {
    resetView?: boolean;
    range?: { start: string; end: string };
    zoomAfter?: ZoomRange;
    panShift?: boolean;
    preserveVisible?: { startMs: number; endMs: number };
  };

  const load = useCallback(async (bucketKey: TimelineBucketKey, highlight: JobFilters, opts: LoadOpts = {}) => {
    const { resetView = false, range, zoomAfter, panShift = false, preserveVisible } = opts;
    const gen = ++loadGenRef.current;
    if (resetView) setLoading(true);
    else if (panShift) setPanLoading(true);
    try {
      const effectiveRange =
        range ?? initialRange(bucketKey, historyBoundsRef.current);
      const res = await fetchTimeline(bucketKey, effectiveRange, highlight);
      if (gen !== loadGenRef.current) return;

      historyBoundsRef.current = parseHistoryBounds(res.history_start, res.history_end);

      const categories = res.series[0]?.buckets.map((b) => b.bucket_start) ?? [];
      let zoom: ZoomRange;
      if (zoomAfter) {
        zoom = zoomAfter;
      } else if (preserveVisible && categories.length) {
        zoom = zoomPreservingVisibleRange(
          { start: res.start, end: res.end },
          categories,
          preserveVisible,
          MAX_VISIBLE_IN_VIEW[bucketKey],
        );
      } else if (resetView) {
        zoom = initialZoomAroundNow(categories, bucketKey);
      } else {
        zoom = labelState.zoom;
      }
      labelState.zoom = zoom;
      setPinnedZoom(zoom);
      setData(res);
    } catch {
      if (gen === loadGenRef.current) setData(null);
    } finally {
      if (gen === loadGenRef.current) {
        if (resetView) setLoading(false);
        if (panShift) setPanLoading(false);
        isPanShiftRef.current = false;
      }
    }
  }, []);

  useEffect(() => {
    highlightKeyRef.current = null;
    pendingEdgeRef.current = null;
    const token = ++bucketLoadRef.current;
    void load(bucket, debouncedHighlight, {
      resetView: true,
      range: initialRange(bucket, historyBoundsRef.current),
    });
    return () => {
      bucketLoadRef.current = token + 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bucket switch only
  }, [bucket, load]);

  useEffect(() => {
    const key = JSON.stringify(debouncedHighlight);
    if (highlightKeyRef.current === null) {
      highlightKeyRef.current = key;
      return;
    }
    if (highlightKeyRef.current === key) return;
    highlightKeyRef.current = key;
    if (!data) return;
    void load(bucket, debouncedHighlight, {
      range: { start: data.start, end: data.end },
    });
  }, [debouncedHighlight, bucket, data, load]);

  const chartKey = useMemo(
    () =>
      `timeline-${bucket}-${data?.start ?? ""}-${data?.end ?? ""}-${data?.series[0]?.buckets.length ?? 0}`,
    [bucket, data?.start, data?.end, data?.series],
  );

  useEffect(() => {
    if (loading) return;
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) setupChartWheel(chart);
  }, [chartKey, loading, setupChartWheel]);

  const option = useMemo(() => {
    if (!data?.series.length) {
      return {
        title: {
          text: "No bids recorded yet",
          left: "center",
          top: "center",
          textStyle: { color: "#94a3b8", fontSize: 13 },
        },
      };
    }

    const categories = data.series[0].buckets.map((b) => b.bucket_start);
    const isHeavy = categories.length >= HEAVY_CATEGORY_COUNT;
    labelState.categories = categories;
    labelState.majorIndices = computeMajorLabelIndices(categories.length);
    // labelState.zoom updated by datazoom handler (not React state — avoids fighting the slider)

    const visibleCount = visibleBucketWindow(categories.length, labelState.zoom).visibleCount;
    const barMaxWidth = visibleCount > 72 ? 10 : visibleCount > 40 ? 16 : 28;

    const nowIdx = findNowBucketIndex(categories, bucket);
    const { startIdx, endIdx } = visibleBucketWindow(categories.length, labelState.zoom);
    const nowInLoadedRange = nowIdx >= 0;
    const nowCategory = nowInLoadedRange ? categories[nowIdx] : undefined;
    const nowVisible = nowInLoadedRange && nowIdx >= startIdx && nowIdx < endIdx;
    const stackMax = maxVisibleStackedBids(data.series, labelState.zoom);
    const yMax = yAxisMaxWithNowHeadroom(stackMax);

    const barSeriesBase = {
      type: "bar" as const,
      stack: "total_bids",
      barMaxWidth,
      large: isHeavy,
      largeThreshold: 80,
      progressive: isHeavy ? 200 : 0,
      progressiveThreshold: isHeavy ? 300 : 3000,
      emphasis: { focus: "series" as const },
      animationDuration: 0,
      animationDurationUpdate: isHeavy ? 0 : DATA_ZOOM_ANIM_MS,
    };

    const allUsers = data.series.map((s) => s.captured_by);
    const capturedByAllow = capturedByAllowList(debouncedHighlight);
    const perUserCapturedByFilter = capturedByAllow !== null;

    type ChartSeries = (typeof barSeriesBase) & {
      name: string;
      data: object[];
      markLine?: object;
      large?: boolean;
    };

    const buildSeriesList = (): ChartSeries[] => {
      const out: ChartSeries[] = [];

      data.series.forEach((s, idx) => {
        const color = colorForUser(s.captured_by, allUsers);
        const userHidden = perUserCapturedByFilter
          ? isUserHiddenFromTable(s.captured_by, capturedByAllow)
          : false;

        const bucketMeta = (b: (typeof s.buckets)[number]) => {
          const total = b.count;
          const table = b.table_count ?? 0;
          return {
            total_count: total,
            table_count: table,
            hidden_count: highlightActive ? Math.max(0, total - table) : 0,
            bucket_start: b.bucket_start,
            bucket_end: b.bucket_end,
            captured_by: s.captured_by,
            top_companies: b.top_companies,
          };
        };

        type BarPoint = ReturnType<typeof bucketMeta> & {
          value: number;
          segment: string;
          itemStyle: BarItemStyle;
        };

        const pushSeries = (
          name: string,
          points: BarPoint[],
          opts?: { markLine?: object; large?: boolean },
        ) => {
          out.push({
            ...barSeriesBase,
            name,
            large: opts?.large ?? barSeriesBase.large,
            data: points,
            ...(opts?.markLine ? { markLine: opts.markLine } : {}),
          });
        };

        if (!highlightActive) {
          pushSeries(
            s.captured_by,
            s.buckets.map((b) => ({
              ...bucketMeta(b),
              value: b.count,
              segment: "in_table",
              itemStyle: filledBarStyle(color),
            })),
            idx === 0 && nowCategory && nowVisible
              ? { markLine: buildNowMarkLine(nowCategory, yMax, dark) }
              : undefined,
          );
          return;
        }

        if (perUserCapturedByFilter) {
          pushSeries(
            s.captured_by,
            s.buckets.map((b) => ({
              ...bucketMeta(b),
              value: b.count,
              segment: userHidden ? "filtered_out" : "in_table",
              itemStyle: userHidden ? outlineBarStyle(color) : filledBarStyle(color),
            })),
            {
              large: isHeavy && !userHidden,
              ...(idx === 0 && nowCategory && nowVisible
                ? { markLine: buildNowMarkLine(nowCategory, yMax, dark) }
                : {}),
            },
          );
          return;
        }

        const inTablePoints = s.buckets.map((b) => {
          const meta = bucketMeta(b);
          return {
            ...meta,
            value: meta.table_count,
            segment: "in_table",
            itemStyle: filledBarStyle(color),
          };
        });
        pushSeries(s.captured_by, inTablePoints, {
          ...(idx === 0 && nowCategory && nowVisible
            ? { markLine: buildNowMarkLine(nowCategory, yMax, dark) }
            : {}),
        });
        pushSeries(
          `${s.captured_by}__filtered`,
          s.buckets.map((b) => {
            const meta = bucketMeta(b);
            return {
              ...meta,
              value: meta.hidden_count,
              segment: "filtered_out",
              itemStyle: outlineBarStyle(color),
            };
          }),
          { large: false },
        );
      });

      return out;
    };

    const series = buildSeriesList();

    const needsZoom = categories.length > 1;
    const axisLabel = createStableAxisLabelConfig(bucket);

    const maxSpan = maxZoomSpanPercent(categories.length, bucket);

    const dataZoomCommon = {
      xAxisIndex: 0,
      filterMode: "none" as const,
      realtime: !isHeavy,
      zoomLock: false,
      maxSpan,
      moveOnMouseMove: true,
      animation: !isHeavy,
      animationDuration: isHeavy ? 0 : DATA_ZOOM_ANIM_MS,
      animationEasing: "cubicOut" as const,
      throttle: isHeavy ? 50 : undefined,
      ...(pinnedZoom ? { start: pinnedZoom.start, end: pinnedZoom.end } : {}),
    };

    return {
      animation: !isHeavy,
      animationDuration: 0,
      animationDurationUpdate: isHeavy ? 0 : DATA_ZOOM_ANIM_MS,
      animationEasingUpdate: "cubicOut",
      tooltip: {
        trigger: "axis" as const,
        axisPointer: { type: "shadow" as const },
        confine: true,
        formatter: (params: unknown) =>
          formatBucketTooltip(
            (Array.isArray(params) ? params : [params]) as TooltipParam[],
            bucket,
            highlightActive,
          ),
      },
      legend: {
        bottom: 0,
        textStyle: { color: "#94a3b8" },
        data: data.series.map((s) => s.captured_by),
      },
      grid: { left: 48, right: 16, top: 32, bottom: needsZoom ? 72 : 56 },
      xAxis: {
        type: "category" as const,
        data: categories,
        boundaryGap: true,
        animation: true,
        animationDurationUpdate: DATA_ZOOM_ANIM_MS,
        animationEasingUpdate: "cubicOut",
        axisLabel,
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: "value" as const,
        min: 0,
        max: yMax,
        minInterval: 1,
        axisLabel: { color: "#94a3b8" },
        name: "Bids",
        nameTextStyle: { color: "#94a3b8", fontSize: 11 },
      },
      dataZoom: needsZoom
        ? [
            {
              ...dataZoomCommon,
              type: "inside" as const,
              zoomOnMouseWheel: false,
              moveOnMouseWheel: false,
              moveOnMouseMove: false,
            },
            {
              ...dataZoomCommon,
              ...dataZoomSliderStyle(dark),
              type: "slider" as const,
              height: 18,
              bottom: 28,
              brushSelect: false,
            },
          ]
        : [
            {
              ...dataZoomCommon,
              type: "inside" as const,
              zoomOnMouseWheel: false,
              moveOnMouseWheel: false,
              moveOnMouseMove: false,
            },
          ],
      series,
    };
  }, [data, bucket, pinnedZoom, labelRefresh, highlightActive, dark]);

  const runEdgePanShift = useCallback(
    (direction: "older" | "newer") => {
      const d = dataRef.current;
      const b = bucketRef.current;
      if (!d?.series.length || isPanShiftRef.current) return;

      const bounds = historyBoundsRef.current;
      if (direction === "older" && !canPanOlder(d.start, bounds, b)) return;
      if (direction === "newer" && !canPanNewer(d.end, bounds, b)) return;

      const preserveVisible = visibleAbsoluteRange(
        { start: d.start, end: d.end },
        { ...labelState.zoom },
      );

      isPanShiftRef.current = true;
      const range = shiftLoadedRange(
        { start: d.start, end: d.end },
        direction,
        b,
        bounds,
      );

      void load(b, highlightRef.current, {
        panShift: true,
        range,
        preserveVisible,
      });
    },
    [load],
  );

  useEffect(() => {
    const onMouseUp = () => {
      const edge = pendingEdgeRef.current;
      pendingEdgeRef.current = null;
      if (!edge) return;
      runEdgePanShift(edge);
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [runEdgePanShift]);

  const onEvents = useMemo(
    () => ({
      datazoom: (params: {
        batch?: Array<{ start?: number; end?: number }>;
        start?: number;
        end?: number;
      }) => {
        const patch = params.batch?.[0] ?? params;
        const zoom: ZoomRange = {
          start: patch.start ?? 0,
          end: patch.end ?? 100,
        };
        labelState.zoom = zoom;
        setPinnedZoom(null);
        setLabelRefresh((n) => n + 1);

        if (isPanShiftRef.current) return;

        const d = dataRef.current;
        const b = bucketRef.current;
        if (!d?.series.length) return;

        const bounds = historyBoundsRef.current;
        pendingEdgeRef.current = null;

        if (wheelDispatchRef.current) {
          wheelDispatchRef.current = false;
          return;
        }

        if (zoom.start <= EDGE_PAN_THRESHOLD_PCT && canPanOlder(d.start, bounds, b)) {
          pendingEdgeRef.current = "older";
        } else if (zoom.end >= 100 - EDGE_PAN_THRESHOLD_PCT && canPanNewer(d.end, bounds, b)) {
          pendingEdgeRef.current = "newer";
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (!data?.series.length) return;
    const t = window.setTimeout(() => setPinnedZoom(null), 200);
    return () => window.clearTimeout(t);
  }, [chartKey]);

  return (
    <div className="mb-4 rounded-xl border bg-card/50 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Bid timeline</h3>
        </div>
        <div className="flex flex-wrap gap-1">
          {BUCKETS.map((b) => (
            <Button
              key={b.key}
              size="sm"
              variant={bucket === b.key ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setBucket(b.key)}
            >
              {b.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative">
        {panLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/40 text-xs text-muted-foreground">
            Loading more…
          </div>
        )}
        {loading ? (
          <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
            Loading chart…
          </div>
        ) : (
          <ReactECharts
            ref={chartRef}
            key={chartKey}
            option={option}
            style={{ height: 320 }}
            notMerge={false}
            lazyUpdate
            onEvents={onEvents}
            onChartReady={(instance) => setupChartWheel(instance)}
          />
        )}
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Hover bars for bucket details · Scroll to pan · Ctrl+scroll to zoom · Drag time bar to select range
      </p>
    </div>
  );
}
