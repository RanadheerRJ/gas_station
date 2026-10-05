/**
 * The developer console's account/station contract with the `accounts` Edge
 * Function, and how a half-finished deploy is reported.
 *
 * The browser bundle and the Edge Function both ship automatically on merge;
 * database migrations are applied by hand. That asymmetry is real and it has
 * already shipped a Delete button with no `admin_delete_station` behind it,
 * so the "the migration is not applied" path is pinned here as a behaviour,
 * not left to whatever sentence PostgREST happens to produce.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const { invoke, client } = vi.hoisted(() => {
  const invokeFn = vi.fn(async () => ({ data: { ok: true }, error: null }));
  const getSessionFn = vi.fn(async () => ({
    data: { session: { access_token: "token-123" } },
    error: null,
  }));
  return {
    invoke: invokeFn,
    client: {
      functions: { invoke: invokeFn },
      auth: { getSession: getSessionFn },
      rpc: vi.fn(),
      from: vi.fn(),
    },
  };
});

vi.mock("./supabase", () => ({ supabaseConfigured: true, supabase: client }));

const api = await import("./api.js");

afterEach(() => vi.clearAllMocks());

describe("developer console account requests", () => {
  it("deletes a station by id through the accounts function", async () => {
    await api.deleteStation("station-1");
    expect(invoke).toHaveBeenCalledWith("accounts", {
      body: { action: "delete_station", stationId: "station-1" },
      headers: { Authorization: "Bearer token-123" },
    });
  });

  it("deletes a login by uid through the accounts function", async () => {
    await api.deleteAccount("uid-9");
    const [, options] = invoke.mock.calls[0];
    expect(options.body).toEqual({ action: "delete_account", uid: "uid-9" });
  });

  it("surfaces the function's own message instead of the transport's", async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "Developer access required." }) },
      },
    });
    await expect(api.deleteStation("station-1")).rejects.toThrow(
      "Developer access required."
    );
  });
});

describe("readableError on a half-applied deploy", () => {
  it("turns PostgREST's missing-function code into an actionable instruction", () => {
    const message = api.readableError({
      code: "PGRST202",
      message:
        "Could not find the function public.admin_delete_station(p_station_id) in the schema cache",
    });
    expect(message).toMatch(/supabase db push/i);
  });

  it("recognises the message alone, as relayed by the Edge Function", () => {
    // The Edge Function forwards text, not a PostgrestError, so the code is
    // gone by the time the browser sees it.
    const message = api.readableError(
      new Error(
        "Could not find the function public.admin_delete_station(p_station_id) in the schema cache"
      )
    );
    expect(message).toMatch(/supabase db push/i);
  });

  it("recognises PostgreSQL's own undefined_function", () => {
    const message = api.readableError({
      code: "42883",
      message: "function public.admin_delete_station(uuid) does not exist",
    });
    expect(message).toMatch(/supabase db push/i);
  });

  it("does not mistake a missing row for a missing migration", () => {
    // "does not exist" is also how the app reports a bad id. Translating that
    // into "apply a migration" would send a developer the wrong way.
    expect(api.readableError(new Error("That account does not exist."))).toBe(
      "That account does not exist."
    );
    expect(api.readableError(new Error("Station not found."))).toBe("Station not found.");
  });
});
