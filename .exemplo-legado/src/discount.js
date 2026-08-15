// Percentage discount codes. Added for a single promotion two years ago and
// never removed because nobody was sure what still depended on it.

const CODES = {
  LAUNCH10: 0.1,
  LAUNCH20: 0.2,
};

export function applyDiscount(subtotal, code) {
  const pct = CODES[code];
  if (!pct) return subtotal;
  return Math.round(subtotal * (1 - pct) * 100) / 100;
}
