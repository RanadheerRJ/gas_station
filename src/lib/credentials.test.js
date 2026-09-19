import { describe, expect, it } from "vitest";
import { staffLoginEmail, staffPinPassword } from "./credentials";

describe("staff Supabase credentials", () => {
  it("normalises the visible username into a non-deliverable Auth email", () => {
    expect(staffLoginEmail("  RaviKumar2 ")).toBe("ravikumar2@station-ledger.invalid");
  });

  it("binds a PIN-derived Auth password to the username", () => {
    expect(staffPinPassword("ravi", "4827")).toBe("station-ledger/ravi/4827");
    expect(staffPinPassword("suresh", "4827")).not.toBe(staffPinPassword("ravi", "4827"));
  });
});
