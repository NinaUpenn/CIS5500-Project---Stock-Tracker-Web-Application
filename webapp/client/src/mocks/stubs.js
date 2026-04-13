// Shared 501 response shape for deferred endpoints.
//
// Both the mock layer (when REACT_APP_USE_MOCKS=true) and the real
// server respond with the same envelope, so the UI can render
// <ComingSoonCard /> without branching on which source it came from.
//
//   { data: null, status: 501, stub: { phase, reason } }

export function stub501(phase, reason) {
  return Promise.resolve({
    data: null,
    status: 501,
    stub: { phase, reason },
  });
}
