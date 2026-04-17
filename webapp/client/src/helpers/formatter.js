// formatting helpers. non-numeric input (null/undefined/nan) renders
// as an em dash so callers don't need to pre-check

const DASH = '—';

function isNumeric(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}

export function formatPercent(value, digits = 2) {
  if (!isNumeric(value)) return DASH;
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function formatNumber(value, digits = 2) {
  if (!isNumeric(value)) return DASH;
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatInteger(value) {
  if (!isNumeric(value)) return DASH;
  return Math.round(Number(value)).toLocaleString();
}

export function formatPrice(value, digits = 2) {
  if (!isNumeric(value)) return DASH;
  return `$${formatNumber(value, digits)}`;
}

// mui palette token for signed values (green/red/default)
export function signedColor(value) {
  if (!isNumeric(value)) return 'text.primary';
  return Number(value) >= 0 ? 'success.main' : 'error.main';
}

export function formatDate(value) {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toISOString().slice(0, 10);
}
