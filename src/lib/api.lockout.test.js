import { afterEach, describe, expect, it, vi } from "vitest";

const { signInWithPassword, profileQuery, client } = vi.hoisted(() => {
  const login = vi.fn();
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(),
  };
  return {
    signInWithPassword: login,
    profileQuery: query,
    client: {
      auth: { signInWithPassword: login, signOut: vi.fn() },
      from: vi.fn(() => query),
    },
  };
});

vi.mock("./supabase", () => ({
  supabaseConfigured: true,
  supabase: client,
}));

const { pinLogin } = await import("./api.js");

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("pin login lockout", () => {
  it("blocks the attempt after five consecutive failures", async () => {
    signInWithPassword.mockRejectedValue(new Error("Invalid login credentials"));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(pinLogin({ username: "five-failures", pin: "0000" })).rejects.toThrow(
        "Invalid login credentials"
      );
    }

    await expect(pinLogin({ username: "five-failures", pin: "0000" })).rejects.toThrow(
      "Too many attempts. Try again in 30s."
    );
    expect(signInWithPassword).toHaveBeenCalledTimes(5);
  });

  it("resets the failure counter after a successful login", async () => {
    signInWithPassword.mockRejectedValue(new Error("Invalid login credentials"));
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        pinLogin({ username: "reset-after-success", pin: "0000" })
      ).rejects.toThrow();
    }

    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    profileQuery.single.mockResolvedValue({
      data: { id: "user-1", role: "attendant" },
      error: null,
    });
    await expect(
      pinLogin({ username: "reset-after-success", pin: "0000" })
    ).resolves.toMatchObject({ uid: "user-1" });

    signInWithPassword.mockRejectedValue(new Error("Invalid login credentials"));
    await expect(
      pinLogin({ username: "reset-after-success", pin: "0000" })
    ).rejects.toThrow("Invalid login credentials");
    expect(signInWithPassword).toHaveBeenCalledTimes(6);
  });

  it("allows attempts again after the cooldown expires", async () => {
    vi.useFakeTimers();
    signInWithPassword.mockRejectedValue(new Error("Invalid login credentials"));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(pinLogin({ username: "cooldown", pin: "0000" })).rejects.toThrow();
    }
    await expect(pinLogin({ username: "cooldown", pin: "0000" })).rejects.toThrow(
      "Too many attempts"
    );

    vi.advanceTimersByTime(30_000);
    await expect(pinLogin({ username: "cooldown", pin: "0000" })).rejects.toThrow(
      "Invalid login credentials"
    );
    expect(signInWithPassword).toHaveBeenCalledTimes(6);
  });
});
