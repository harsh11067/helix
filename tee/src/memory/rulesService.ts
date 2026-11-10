// rulesService — N2 Ulysses Rules HTTP API (stub until N2 lands). Flag: FEATURE_RULES=1.
export const rulesEnabled = () => process.env.FEATURE_RULES === '1';
export function rulesRoutes(): Record<string, (...a: any[]) => unknown> {
  if (!rulesEnabled()) return {};
  return {};
}
