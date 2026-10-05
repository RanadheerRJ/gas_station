/**
 * The credit ledger's API contract.
 *
 * The browser never computes a balance and never passes one: it names a
 * transaction, an amount, and a reason, and the database does the money. These
 * assertions pin the RPC names and argument shapes so a rename on either side
 * fails here rather than silently posting nothing.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const { rpc, client } = vi.hoisted(() => {
  const call = vi.fn(async () => ({ data: { ok: true }, error: null }));
  return { rpc: call, client: { rpc: call, auth: {}, from: vi.fn() } };
});

vi.mock("./supabase", () => ({ supabaseConfigured: true, supabase: client }));

const api = await import("./api.js");

afterEach(() => vi.clearAllMocks());

describe("shift-aware credit API", () => {
  it("posts credit against the station, shift, and customer", async () => {
    await api.addShiftCredit("s1", "sh-1", {
      customerId: "c1",
      amount: "2500",
      note: " Diesel ",
    });
    expect(rpc).toHaveBeenCalledWith("add_shift_credit", {
      p_station_id: "s1",
      p_shift_id: "sh-1",
      p_customer_id: "c1",
      p_amount: 2500,
      p_note: " Diesel ",
    });
  });

  it("sends a correction as an amount and a reason, never a balance", async () => {
    await api.updateCustomerCredit("t1", "500", "Wrong amount");
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("update_customer_credit");
    expect(args).toMatchObject({
      p_transaction_id: "t1",
      p_amount: 500,
      p_reason: "Wrong amount",
    });
    expect(Object.keys(args).join(",")).not.toMatch(/balance/);
  });

  it("voids with a reason and an optional note", async () => {
    await api.voidCustomerCredit("t1", "Other", "Keyed twice");
    expect(rpc).toHaveBeenCalledWith("void_customer_credit", {
      p_transaction_id: "t1",
      p_reason: "Other",
      p_note: "Keyed twice",
    });
  });

  it("passes every ledger filter to the database rather than filtering locally", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await api.listCustomerTransactions("s1", {
      customerId: "c1",
      recordedBy: "u1",
      shiftId: "sh-1",
      status: "voided",
      from: "2026-10-01",
      to: "2026-10-05",
    });
    expect(rpc).toHaveBeenCalledWith("list_customer_transactions", {
      p_station_id: "s1",
      p_customer_id: "c1",
      p_recorded_by: "u1",
      p_shift_id: "sh-1",
      p_status: "voided",
      p_from: "2026-10-01",
      p_to: "2026-10-05",
      p_limit: 500,
    });
  });

  it("defaults the ledger read to the whole station and every status", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await api.listCustomerTransactions("s1");
    expect(rpc).toHaveBeenCalledWith(
      "list_customer_transactions",
      expect.objectContaining({
        p_station_id: "s1",
        p_customer_id: null,
        p_status: "all",
      })
    );
  });

  it("reads the attendant's shift credit without asking for a balance", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ id: "t1", customer_name: "Ramesh Kumar", amount: 500 }],
      error: null,
    });
    const rows = await api.listShiftCredit("s1", "sh-1");
    expect(rpc).toHaveBeenCalledWith("list_shift_credit", {
      p_station_id: "s1",
      p_shift_id: "sh-1",
    });
    expect(rows[0]).toEqual({ id: "t1", customerName: "Ramesh Kumar", amount: 500 });
  });

  it("asks for today's summary as one aggregate", async () => {
    await api.creditDaySummary("s1");
    expect(rpc).toHaveBeenCalledWith("credit_day_summary", {
      p_station_id: "s1",
      p_day: null,
    });
  });

  it("degrades to no indicators when the review RPC is not deployed yet", async () => {
    rpc.mockRejectedValueOnce(
      Object.assign(new Error("Could not find the function"), { code: "PGRST202" })
    );
    await expect(api.shiftCreditReview("s1", "sh-1")).resolves.toBeNull();
  });
});
