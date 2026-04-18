// cra auto-loads this before any test file.
// adds jest-dom matchers like toBeInTheDocument.
import '@testing-library/jest-dom';

// jsdom doesn't implement ResizeObserver, but recharts' ResponsiveContainer
// needs it. no-op stub is fine since layout only matters in real browsers.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
