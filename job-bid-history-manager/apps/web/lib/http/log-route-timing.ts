type TimingExtra = Record<string, string | number | boolean | null | undefined>;

/** Safe serverless timing logs — never pass tokens, raw JD, or emails. */
export function logRouteTiming(
  route: string,
  step: string,
  startedAt: number,
  extra?: TimingExtra,
): void {
  const durationMs = Date.now() - startedAt;
  console.info("[route-timing]", {
    route,
    step,
    durationMs,
    success: extra?.success ?? true,
    ...extra,
  });
}
