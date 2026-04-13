// CRA auto-loads this before any test file.
// Adds jest-dom matchers like toBeInTheDocument.
import '@testing-library/jest-dom';

// jsdom does not implement ResizeObserver, and Recharts'
// <ResponsiveContainer> expects it. A no-op stub is enough for tests —
// layout happens in real browsers, not here.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
