// single fetch seam. everyone imports `api` from here. swaps between
// real and mock impls via react_app_use_mocks

const useMocks = process.env.REACT_APP_USE_MOCKS === 'true';

// eslint-disable-next-line global-require
const impl = useMocks ? require('../mocks').default : require('./api.real').default;

export const api = impl;
export default api;
