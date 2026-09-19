/**
 * Route helpers for the shift screens, per role.
 *
 * The same components serve three route prefixes — an attendant's `/today`,
 * a manager's `/station` and an owner's `/owner/shifts` — so "where do I go
 * back to" and "what is this shift's close URL" are decided here, once,
 * instead of being re-derived in every screen.
 */
export const SHIFT_PATHS = {
  attendant: {
    home: "/today",
    run: (id) => `/today/shift/${id}`,
    close: (id) => `/today/shift/${id}/close`,
    history: "/today/history",
    settled: (id) => `/today/history/${id}`,
  },
  manager: {
    home: "/station",
    list: "/station",
    detail: (id) => `/station/shift/${id}`,
    close: (id) => `/station/shift/${id}/close`,
  },
  owner: {
    home: "/owner/shifts",
    list: "/owner/shifts",
    detail: (id) => `/owner/shifts/${id}`,
    close: (id) => `/owner/shifts/${id}/close`,
  },
};

export function shiftPaths(role) {
  return SHIFT_PATHS[role] || SHIFT_PATHS.manager;
}
