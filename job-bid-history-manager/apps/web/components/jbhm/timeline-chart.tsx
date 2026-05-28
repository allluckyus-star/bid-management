import type { TimelineBucketKey } from "@jbhm/shared";
import type { EChartsType } from "echarts";
import ReactECharts from "echarts-for-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimelineResponse } from "@jbhm/shared";
import {
  colorForUser,
  sortedUserNames,
  userColorMap,
  userMarkerHtml,
} from "@/lib/jbhm/user-colors";
import {
  canPanNewer,
  canPanOlder,
  dataAwareInitialRange,
  initialRange,
  parseHistoryBounds,
  shiftLoadedRange,
  visibleAbsoluteRange,
  zoomPreservingVisibleRange,
  type HistoryBounds,
  type ZoomRange,
} from "@/lib/jbhm/timeline-window";
import {
  bucketAxisLabel,
  dayBoundsFromBucketKey,
  formatBucketRange,
} from "@/lib/datetime/chart-format";
import {
  DEFAULT_TEAM_TIMEZONE,
  endOfZonedMonthMs,
  getZonedParts,
  normalizeTimeZone,
} from "@/lib/datetime/zoned";
import { cn } from "@/lib/utils";

let chartTimeZone = DEFAULT_TEAM_TIMEZONE;

function setChartTimeZone(tz: string) {
  chartTimeZone = normalizeTimeZone(tz);
}

const BUCKETS: { key: TimelineBucketKey; label: string }[] = [
  { key: "1h", label: "Hour" },
  { key: "1d", label: "Day" },
  { key: "1month", label: "Month" },
];

/** Legend at top; time slider at bottom; grid bottom clears slider + x-axis labels. */
const TIMELINE_LEGEND_TOP = 4;
const TIMELINE_GRID_TOP = 36;
const TIMELINE_SLIDER_HEIGHT = 20;
const TIMELINE_SLIDER_BOTTOM = 6;
/** Gap between top of slider and bottom of rotated x-axis labels */
const TIMELINE_XAXIS_SLIDER_GAP = 14;
/** Space for x-axis tick labels (up to ~35° rotation) above the slider */
const TIMELINE_XAXIS_LABEL_RESERVE = 52;
const TIMELINE_GRID_BOTTOM_ZOOM =
  TIMELINE_SLIDER_BOTTOM +
  TIMELINE_SLIDER_HEIGHT +
  TIMELINE_XAXIS_SLIDER_GAP +
  TIMELINE_XAXIS_LABEL_RESERVE;
const TIMELINE_GRID_BOTTOM_NO_ZOOM = 56;

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

/** Distinct from user palette; readable on light and dark chart backgrounds */
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
  "5m": 48,
  "30m": 48,
  "1month": 24,
  "1d": 31,
  "1h": 40,
};

/** Bars visible on first load: “now” in view with bucket-specific future buckets to the right. */
const INITIAL_VIEW: Record<TimelineBucketKey, { before: number; after: number }> = {
  "5m": { before: 18, after: 6 },
  "30m": { before: 8, after: 6 },
  "1h": { before: 6, after: 5 },
  "1d": { before: 10, after: 2 },
  "1month": { before: 1, after: 1 },
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

function bucketEndMs(startIso: string, bucketKey: TimelineBucketKey): number {
  if (bucketKey === "1month") {
    return endOfZonedMonthMs(new Date(startIso).getTime(), chartTimeZone);
  }
  if (bucketKey === "1d") return dayBoundsFromBucketKey(startIso, chartTimeZone).endMs;
  const start = new Date(startIso).getTime();
  if (bucketKey === "30m") return start + 30 * 60 * 1000 - 1;
  if (bucketKey === "5m") return start + 5 * 60 * 1000 - 1;
  return start + 3600000 - 1;
}

function bucketStartMs(startIso: string, bucketKey: TimelineBucketKey): number {
  if (bucketKey === "1d") return dayBoundsFromBucketKey(startIso, chartTimeZone).startMs;
  return new Date(startIso).getTime();
}

function zonedYearMonthKey(ms: number): string {
  const p = getZonedParts(ms, chartTimeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function monthBucketKey(bucketStartIso: string): string {
  return zonedYearMonthKey(new Date(bucketStartIso).getTime());
}

/** Index of the bucket that contains the current time, or -1 if not in loaded range. */
function findNowBucketIndex(categories: string[], bucketKey: TimelineBucketKey): number {
  if (!categories.length) return -1;
  const now = Date.now();

  if (bucketKey === "1d") {
    return categories.findIndex((iso) => {
      const { startMs, endMs } = dayBoundsFromBucketKey(iso, chartTimeZone);
      return now >= startMs && now <= endMs;
    });
  }

  if (bucketKey === "1month") {
    const thisMonth = zonedYearMonthKey(now);
    return categories.findIndex((iso) => monthBucketKey(iso) === thisMonth);
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
        ? dayBoundsFromBucketKey(categories[i], chartTimeZone)
        : { startMs: new Date(categories[i]).getTime(), endMs: bucketEndMs(categories[i], bucketKey) };
    const dist = Math.min(Math.abs(now - startMs), Math.abs(now - endMs));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Zoom so every bucket that has bids is visible (not only “now” at the right edge). */
function initialZoomToDataExtent(
  data: TimelineResponse,
  categories: string[],
  bucketKey: TimelineBucketKey,
): ZoomRange {
  const n = categories.length;
  if (n <= 1) return FULL_ZOOM;

  const cap = MAX_VISIBLE_IN_VIEW[bucketKey];
  if (n <= cap) return FULL_ZOOM;

  let firstIdx = n;
  let lastIdx = -1;
  for (const s of data.series) {
    for (let i = 0; i < s.buckets.length; i++) {
      if ((s.buckets[i]?.count ?? 0) > 0) {
        if (i < firstIdx) firstIdx = i;
        if (i > lastIdx) lastIdx = i;
      }
    }
  }
  if (lastIdx < 0) return initialZoomAroundNow(categories, bucketKey);

  const pad = bucketKey === "1month" ? 1 : bucketKey === "1d" ? 2 : 4;
  let startIdx = Math.max(0, firstIdx - pad);
  let endIdx = Math.min(n, lastIdx + pad + 1);
  if (endIdx - startIdx >= n) return FULL_ZOOM;

  if (endIdx - startIdx > cap) {
    const mid = (startIdx + endIdx) / 2;
    const half = Math.floor(cap / 2);
    startIdx = Math.max(0, Math.floor(mid - half));
    endIdx = Math.min(n, startIdx + cap);
    startIdx = Math.max(0, endIdx - cap);
  }

  return {
    start: (startIdx / n) * 100,
    end: (endIdx / n) * 100,
  };
}

function initialZoomAroundNow(categories: string[], bucketKey: TimelineBucketKey): ZoomRange {
  const n = categories.length;
  if (n <= 1) return FULL_ZOOM;

  const { before, after } = INITIAL_VIEW[bucketKey];
  const windowBars = before + after + 1;
  if (n <= windowBars) return FULL_ZOOM;

  const cap = MAX_VISIBLE_IN_VIEW[bucketKey];
  let nowIdx = findNowBucketIndex(categories, bucketKey);
  if (nowIdx < 0) nowIdx = findNearestBucketIndex(categories, bucketKey);

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
    formatter: (value: string) => bucketAxisLabel(String(value), bucketKey, chartTimeZone),
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
    top_companies?: { company: string; count: number }[];
  };
};

function formatBucketTooltip(
  items: TooltipParam[],
  bucket: TimelineBucketKey,
  colors: Map<string, string>,
): string {
  const first = items[0]?.data;
  const timeLine =
    first?.bucket_start && first?.bucket_end
      ? formatBucketRange(first.bucket_start, first.bucket_end, bucket, chartTimeZone)
      : "";

  type UserBucket = {
    marker: string;
    count: number;
    tops: { company: string; count: number }[];
  };
  const byUser = new Map<string, UserBucket>();

  for (const p of items) {
    const v = Number(p.value ?? 0);
    if (v <= 0) continue;
    const d = p.data;
    const user = d?.captured_by ?? p.seriesName ?? "";
    if (!user || user.includes("__filtered")) continue;
    const marker = userMarkerHtml(colors.get(user) ?? colorForUser(user, [...colors.keys()]));
    const row = byUser.get(user) ?? {
      marker,
      count: 0,
      tops: d?.top_companies ?? [],
    };
    row.count += v;
    row.marker = marker;
    if (d?.top_companies?.length) row.tops = d.top_companies;
    byUser.set(user, row);
  }

  const users = [...byUser.values()];
  const totalBids = users.reduce((s, u) => s + u.count, 0);

  const userLines =
    users.length > 0
      ? [...byUser.entries()].map(([name, u]) => {
          const tops = u.tops
            .slice(0, 3)
            .map((c) => `&nbsp;&nbsp;• ${c.company} (${c.count})`)
            .join("<br/>");
          const detail = `${u.count} bid${u.count === 1 ? "" : "s"}`;
          return [`${u.marker} <b>${name}</b>: ${detail}`, tops || ""].join("<br/>");
        })
      : ["<span style='opacity:0.7'>No bids in this period</span>"];

  const totalLine = `<b>Total: ${totalBids} bids</b>${users.length ? ` (${users.length} user${users.length === 1 ? "" : "s"})` : ""}`;

  return [
    `<b>Time bucket</b>`,
    timeLine,
    totalLine,
    "<hr style='margin:6px 0;border-color:#334155'/>",
    users.length ? "<b>By user:</b>" : "",
    ...userLines,
  ].join("<br/>");
}

type BarItemStyle = {
  color: string;
  opacity: number;
};

function filledBarStyle(color: string): BarItemStyle {
  return { color, opacity: 1 };
}

export type TimelineChartProps = {
  dark?: boolean;
  timeZone: string;
  bucket: TimelineBucketKey;
  data: TimelineResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onRequestRange: (
    bucket: TimelineBucketKey,
    range: { start: string; end: string },
    opts?: {
      resetView?: boolean;
      preserveVisible?: { startMs: number; endMs: number };
    },
  ) => void;
};

export function TimelineChart({
  dark = false,
  timeZone,
  bucket,
  data,
  loading,
  error,
  onRetry,
  onRequestRange,
}: TimelineChartProps) {
  setChartTimeZone(data?.timezone ?? timeZone);
  const tz = chartTimeZone;
  const [pinnedZoom, setPinnedZoom] = useState<ZoomRange | null>(null);
  const [labelRefresh, setLabelRefresh] = useState(0);
  const chartRef = useRef<{ getEchartsInstance: () => EChartsType } | null>(null);
  const wheelCleanupRef = useRef<(() => void) | null>(null);
  const wheelDispatchRef = useRef(false);
  const bucketLoadRef = useRef(0);
  const historyBoundsRef = useRef<HistoryBounds>({ minMs: null, maxMs: null });
  const pendingResetRef = useRef(true);
  const rangeAlignedRef = useRef(false);
  const loadedWindowKeyRef = useRef<string | null>(null);
  const pendingEdgeRef = useRef<"older" | "newer" | null>(null);
  const isPanShiftRef = useRef(false);
  const dataRef = useRef(data);
  const bucketRef = useRef(bucket);
  const loadingRef = useRef(loading);
  dataRef.current = data;
  bucketRef.current = bucket;
  loadingRef.current = loading;

  const bindChartWheel = useCallback((chart: EChartsType) => {
    const zr = chart.getZr();
    const handler = (ev: { event?: WheelEvent; stop?: () => void }) => {
      if (loadingRef.current) return;
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
      setPinnedZoom(next);
      setLabelRefresh((n) => n + 1);

      wheelDispatchRef.current = true;
      chart.dispatchAction({
        type: "dataZoom",
        dataZoomIndex: 1,
        start: next.start,
        end: next.end,
      });
    };
    zr.on("mousewheel", handler);
    return () => zr.off("mousewheel", handler);
  }, []);

  const setupChartWheel = useCallback(
    (chart: EChartsType) => {
      wheelCleanupRef.current?.();
      wheelCleanupRef.current = bindChartWheel(chart);
    },
    [bindChartWheel],
  );

  useEffect(() => () => wheelCleanupRef.current?.(), []);

  const syncZoomFromData = useCallback(
    (
      res: TimelineResponse,
      bucketKey: TimelineBucketKey,
      opts?: { resetView?: boolean; preserveVisible?: { startMs: number; endMs: number } },
    ) => {
      historyBoundsRef.current = parseHistoryBounds(res.history_start, res.history_end);
      const categories = res.series[0]?.buckets.map((b) => b.bucket_start) ?? [];
      let zoom: ZoomRange;
      if (opts?.preserveVisible && categories.length) {
        zoom = zoomPreservingVisibleRange(
          { start: res.start, end: res.end },
          categories,
          opts.preserveVisible,
          MAX_VISIBLE_IN_VIEW[bucketKey],
        );
      } else if (opts?.resetView) {
        zoom = initialZoomToDataExtent(res, categories, bucketKey);
      } else {
        zoom = labelState.zoom;
      }
      labelState.zoom = zoom;
      setPinnedZoom(zoom);
      isPanShiftRef.current = false;
    },
    [],
  );

  /** Match Day-button load: same range + bounds as clicking Day after first response. */
  useEffect(() => {
    if (!data || rangeAlignedRef.current) return;
    rangeAlignedRef.current = true;
    const bounds = parseHistoryBounds(data.history_start, data.history_end);
    historyBoundsRef.current = bounds;
    pendingResetRef.current = true;
    onRequestRange(bucket, dataAwareInitialRange(bucket, bounds, tz), { resetView: true });
  }, [data, bucket, onRequestRange, tz]);

  useEffect(() => {
    setPinnedZoom(null);
    pendingResetRef.current = true;
    loadedWindowKeyRef.current = null;
    rangeAlignedRef.current = false;
  }, [bucket]);

  useEffect(() => {
    if (!data?.series.length) return;
    const windowKey = `${bucket}|${data.start}|${data.end}`;
    const shouldReset =
      pendingResetRef.current || loadedWindowKeyRef.current !== windowKey;
    loadedWindowKeyRef.current = windowKey;
    syncZoomFromData(data, bucket, { resetView: shouldReset });
    pendingResetRef.current = false;
  }, [data, bucket, syncZoomFromData]);

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
    if (!data) {
      return {};
    }

    const categories =
      data.series[0]?.buckets.map((b) => b.bucket_start) ??
      [];

    if (!categories.length) {
      return {
        title: {
          text: "No bids recorded yet",
          left: "center",
          top: "center",
          textStyle: { color: "#94a3b8", fontSize: 13 },
        },
      };
    }
    const isHeavy = categories.length >= HEAVY_CATEGORY_COUNT;
    labelState.categories = categories;
    labelState.majorIndices = computeMajorLabelIndices(categories.length);

    const zoomForView =
      pinnedZoom ??
      (categories.length > 1 ? initialZoomToDataExtent(data, categories, bucket) : FULL_ZOOM);
    labelState.zoom = zoomForView;

    const visibleCount = visibleBucketWindow(categories.length, zoomForView).visibleCount;
    const barMaxWidth = visibleCount > 72 ? 10 : visibleCount > 40 ? 16 : 28;

    let nowIdx = findNowBucketIndex(categories, bucket);
    if (nowIdx < 0) nowIdx = findNearestBucketIndex(categories, bucket);
    const { startIdx, endIdx } = visibleBucketWindow(categories.length, zoomForView);
    const nowInLoadedRange = nowIdx >= 0;
    const nowCategory = nowInLoadedRange ? categories[nowIdx] : undefined;
    const nowVisible =
      nowInLoadedRange && nowIdx >= startIdx && nowIdx < endIdx;
    const stackMax = maxVisibleStackedBids(data.series, zoomForView);
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

    const sortedUsers = sortedUserNames(data.series.map((s) => s.captured_by));
    const colors = userColorMap(sortedUsers);
    const seriesByUser = new Map(data.series.map((s) => [s.captured_by, s]));

    type ChartSeries = (typeof barSeriesBase) & {
      name: string;
      color: string;
      data: object[];
      markLine?: object;
    };

    const series: ChartSeries[] = sortedUsers.map((userName, idx) => {
      const s = seriesByUser.get(userName)!;
      const color = colors.get(userName)!;
      return {
        ...barSeriesBase,
        name: userName,
        color,
        itemStyle: filledBarStyle(color),
        data: s.buckets.map((b) => ({
          value: b.count,
          bucket_start: b.bucket_start,
          bucket_end: b.bucket_end,
          captured_by: s.captured_by,
          top_companies: b.top_companies,
        })),
        ...(idx === 0 && nowCategory && nowVisible
          ? { markLine: buildNowMarkLine(nowCategory, yMax, dark) }
          : {}),
      };
    });

    const needsZoom = categories.length > 1;
    const axisLabel = createStableAxisLabelConfig(bucket);

    const maxSpan = maxZoomSpanPercent(categories.length, bucket);

    const activeZoom = zoomForView;
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
      start: activeZoom.start,
      end: activeZoom.end,
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
            colors,
          ),
      },
      legend: {
        top: TIMELINE_LEGEND_TOP,
        left: "center",
        orient: "horizontal" as const,
        itemGap: 14,
        padding: 0,
        textStyle: { color: "#94a3b8", fontSize: 11 },
        data: sortedUsers,
      },
      grid: {
        left: 48,
        right: 16,
        top: TIMELINE_GRID_TOP,
        bottom: needsZoom ? TIMELINE_GRID_BOTTOM_ZOOM : TIMELINE_GRID_BOTTOM_NO_ZOOM,
      },
      xAxis: {
        type: "category" as const,
        data: categories,
        boundaryGap: true,
        animation: true,
        animationDurationUpdate: DATA_ZOOM_ANIM_MS,
        animationEasingUpdate: "cubicOut",
        axisLabel: {
          ...axisLabel,
          margin: needsZoom ? 10 : 8,
        },
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
              id: "timeline-range-slider",
              type: "slider" as const,
              height: TIMELINE_SLIDER_HEIGHT,
              bottom: TIMELINE_SLIDER_BOTTOM,
              z: 10,
              brushSelect: false,
              showDetail: false,
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
  }, [data, bucket, pinnedZoom, labelRefresh, dark]);

  const runEdgePanShift = useCallback(
    (direction: "older" | "newer") => {
      const d = dataRef.current;
      const b = bucketRef.current;
      if (!d?.series.length || isPanShiftRef.current) return;

      const bounds = historyBoundsRef.current;
      if (direction === "older" && !canPanOlder(d.start, bounds, b, tz)) return;
      if (direction === "newer" && !canPanNewer(d.end, bounds, b, tz)) return;

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
        tz,
      );

      onRequestRange(b, range, { preserveVisible });
    },
    [onRequestRange, tz],
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
        setPinnedZoom(zoom);
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

        if (zoom.start <= EDGE_PAN_THRESHOLD_PCT && canPanOlder(d.start, bounds, b, tz)) {
          pendingEdgeRef.current = "older";
        } else if (zoom.end >= 100 - EDGE_PAN_THRESHOLD_PCT && canPanNewer(d.end, bounds, b, tz)) {
          pendingEdgeRef.current = "newer";
        }
      },
    }),
    [],
  );

  useEffect(() => {
    if (!data?.series.length) return;
    setPinnedZoom(labelState.zoom);
  }, [chartKey, data?.series.length]);

  const showChart = !error && data != null;
  const blockInteraction = loading;

  return (
    <div
      className={cn(
        "mb-4 rounded-xl border bg-card/50 p-4",
        blockInteraction && "select-none",
      )}
      aria-busy={blockInteraction}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Bid timeline</h3>
          <p className="text-[10px] text-muted-foreground">{tz}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {BUCKETS.map((b) => (
            <Button
              key={b.key}
              size="sm"
              variant={bucket === b.key ? "default" : "outline"}
              className="h-7 text-xs"
              disabled={blockInteraction}
              onClick={() => {
                pendingResetRef.current = true;
                onRequestRange(
                  b.key,
                  dataAwareInitialRange(b.key, historyBoundsRef.current, tz),
                  { resetView: true },
                );
              }}
            >
              {b.label}
            </Button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "relative h-[348px] overflow-hidden",
          blockInteraction && "touch-none overscroll-none",
        )}
      >
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
            <p className="text-destructive">{error}</p>
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Retry chart
            </Button>
          </div>
        ) : showChart ? (
          <div className={cn("h-full w-full", blockInteraction && "pointer-events-none")}>
            <ReactECharts
              ref={chartRef}
              key={chartKey}
              option={option}
              style={{ height: 348 }}
              notMerge={false}
              lazyUpdate={false}
              replaceMerge={["series", "legend", "dataZoom", "grid"]}
              onEvents={blockInteraction ? undefined : onEvents}
              onChartReady={(instance) => {
                if (!loadingRef.current) setupChartWheel(instance);
              }}
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading chart…
          </div>
        )}
        {blockInteraction && !error ? (
          <div
            className="absolute inset-0 z-20 flex cursor-wait flex-col items-center justify-center gap-2 bg-background/75 backdrop-blur-[2px] touch-none overscroll-none"
            role="status"
            aria-live="polite"
            aria-label="Loading chart"
            onWheel={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading chart…</span>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Hover bars for bucket details · Scroll to pan · Ctrl+scroll to zoom · Drag time bar to select range
      </p>
    </div>
  );
}
