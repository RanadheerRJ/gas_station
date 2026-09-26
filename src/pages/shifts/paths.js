/**
 * Route helpers for the shift screens, per role.
 *
 * The same components serve three route prefixes — an attendant's `/today`,
 * a manager's `/station` and an owner's `/owner/shifts` — so "where do I go
 * back to" and "what is this shift's close URL" are decided here, once,
 * instead of being re-derived in every screen.
 *
 * Every role exposes the same core keys — `home`, `start`, `list`,
 * `detail(id)` and `close(id)` — so a screen can use any of them without
 * first asking which role it is serving. The attendant additionally has
 * `run(id)`, the live shift screen; managers and owners deliberately have
 * none (they review shifts, they don't run them), and anything that wants
 * the running screen falls back to `list` when `run` is absent.
 */
export const SHIFT_PATHS = {
  attendant: {
    home: "/today",
    start: "/today/start",
    list: "/today/history",
    detail: (id) => `/today/history/${id}`,
    // A sent-back shift is closed, not running. Its correction form therefore
    // lives under history rather than pretending it can be closed again.
    correct: (id) => `/today/history/${id}/edit`,
    run: (id) => `/today/shift/${id}`,
    close: (id) => `/today/shift/${id}/close`,
  },
  manager: {
    home: "/station",
    start: "/station/start",
    list: "/station",
    detail: (id) => `/station/shift/${id}`,
    close: (id) => `/station/shift/${id}/close`,
  },
  owner: {
    home: "/owner/shifts",
    start: "/owner/shifts/start",
    list: "/owner/shifts",
    detail: (id) => `/owner/shifts/${id}`,
    close: (id) => `/owner/shifts/${id}/close`,
  },
};

export function shiftPaths(role) {
  return SHIFT_PATHS[role] || SHIFT_PATHS.manager;
}
