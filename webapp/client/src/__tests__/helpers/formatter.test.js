import {
  formatPercent,
  formatNumber,
  formatInteger,
  formatDate,
  formatPrice,
  signedColor,
} from '../../helpers/formatter';

describe('formatPercent', () => {
  test('formats a fractional value', () => {
    expect(formatPercent(0.1234)).toBe('12.34%');
  });
  test('returns dash for null / NaN', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('formatNumber', () => {
  test('rounds to two digits', () => {
    expect(formatNumber(1234.567)).toMatch(/1,234\.57/);
  });
  test('accepts numeric strings', () => {
    expect(formatNumber('1.2')).toMatch(/1\.20/);
  });
});

describe('formatInteger', () => {
  test('adds thousands separators', () => {
    expect(formatInteger(1234567)).toBe('1,234,567');
  });
});

describe('formatPrice', () => {
  test('prefixes a dollar sign', () => {
    expect(formatPrice(12.345)).toMatch(/^\$12\.35/);
  });
  test('returns dash for null', () => {
    expect(formatPrice(null)).toBe('—');
  });
});

describe('signedColor', () => {
  test('green for non-negative', () => {
    expect(signedColor(0)).toBe('success.main');
    expect(signedColor(0.01)).toBe('success.main');
  });
  test('red for negative', () => {
    expect(signedColor(-0.01)).toBe('error.main');
  });
  test('default for non-numeric', () => {
    expect(signedColor(null)).toBe('text.primary');
    expect(signedColor(undefined)).toBe('text.primary');
  });
});

describe('formatDate', () => {
  test('accepts an ISO string', () => {
    expect(formatDate('2022-12-12')).toBe('2022-12-12');
  });
  test('returns dash for garbage', () => {
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDate(null)).toBe('—');
  });
});
