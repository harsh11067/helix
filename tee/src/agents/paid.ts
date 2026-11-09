// paid — Credibility-as-a-Service (WIN_FEATURES.md W4). Kill switch: FEATURE_PAYMENTS.
// Until the full 402 → pay → 200 loop is verified end-to-end, this feature is OFF and
// exposes no routes (a half-working paywall is worse than none).

export function paidRoutes(): Record<string, (...a: any[]) => unknown> {
  if (process.env.FEATURE_PAYMENTS !== '1') return {};
  return {};
}
