// services/api.js
//
// THE ONE FETCH SEAM.
// Every component in the app imports `api` from this file and nothing
// else — they never call fetch() directly. That single rule is what
// makes the whole mock-mode toggle work:
//
//   REACT_APP_USE_MOCKS=true  -> resolves to ./api.mock (static JSON)
//   REACT_APP_USE_MOCKS=false -> resolves to ./api.real  (fetch -> API)
//
// Both modules export an object with the SAME method names and the
// SAME return shapes. Swapping implementations must not require any
// change to callers.

const useMocks = process.env.REACT_APP_USE_MOCKS === 'true';

// eslint-disable-next-line global-require
const impl = useMocks ? require('../mocks').default : require('./api.real').default;

export const api = impl;
export default api;
