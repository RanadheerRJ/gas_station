// @vitest-environment jsdom
/**
 * Login, pinned.
 *
 * The sign-in screen's contract: the staff/developer switch is a real
 * segmented control, the PIN is four boxes that auto-advance and accept a
 * pasted code, the sign-in pill is disabled with a stated reason until the
 * form can sign in, and errors land inline with an icon — never colour
 * alone. The auth calls themselves are stubbed; only presentation is tested.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login.jsx";
import { ThemeProvider } from "../state/ThemeContext.jsx";
import { LanguageProvider } from "../state/LanguageContext.jsx";

const auth = vi.hoisted(() => ({
  login: vi.fn(),
  developerLogin: vi.fn(),
}));

vi.mock("../state/AuthContext", () => ({
  useAuth: () => ({
    login: auth.login,
    developerLogin: auth.developerLogin,
  }),
}));

// The unconfigured-build warning is a Notice; keep it out of the way so the
// tests exercise the happy path. The real module is untouched.
vi.mock("../lib/supabase", () => ({
  supabaseConfigured: true,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Fire a React-visible change on a controlled input. */
async function type(input, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    ).set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function press(input, key) {
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
    );
  });
}

describe("Login", () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    auth.login.mockReset();
    auth.developerLogin.mockReset();
  });

  async function renderLogin() {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter>
          <ThemeProvider>
            <LanguageProvider>
              <Login />
            </LanguageProvider>
          </ThemeProvider>
        </MemoryRouter>
      );
    });
  }

  const pinBoxes = () => Array.from(container.querySelectorAll(".pin-box"));
  const cta = () => container.querySelector(".sticky-cta .cta");
  const hint = () => container.querySelector(".sticky-cta__hint");

  it("switches between staff and developer with a segmented control", async () => {
    await renderLogin();

    const options = Array.from(container.querySelectorAll(".segmented button"));
    expect(options.map((o) => o.textContent)).toEqual(["Staff", "Developer"]);
    expect(options[0].getAttribute("aria-selected")).toBe("true");

    await click(options[1]);
    expect(container.querySelector('input[type="email"]')).toBeTruthy();
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector(".pin-box")).toBeNull();
  });

  it("auto-advances the PIN boxes and fills from a paste", async () => {
    await renderLogin();

    const boxes = pinBoxes();
    expect(boxes).toHaveLength(4);

    // One digit at a time lands in successive boxes.
    await type(boxes[0], "1");
    expect(container.querySelectorAll(".pin-box")[1] === boxes[1]).toBe(true);
    await type(boxes[1], "2");
    await type(container.querySelectorAll(".pin-box")[2], "3");
    await type(container.querySelectorAll(".pin-box")[3], "4");
    expect(pinBoxes().map((b) => b.value)).toEqual(["1", "2", "3", "4"]);

    // A paste into the first box fills everything from there.
    await type(pinBoxes()[0], "5678");
    expect(pinBoxes().map((b) => b.value)).toEqual(["5", "6", "7", "8"]);
  });

  it("keeps the pill disabled with a reason until the form is valid", async () => {
    await renderLogin();
    expect(cta().disabled).toBe(true);
    expect(hint().textContent).toBe("Enter your username.");

    await type(container.querySelector('input[autocomplete="username"]'), "ravi");
    expect(cta().disabled).toBe(true);
    expect(hint().textContent).toBe("Enter the 4-digit PIN.");

    await type(pinBoxes()[0], "1234");
    expect(cta().disabled).toBe(false);
    // Nothing is missing any more, so the bar stops explaining itself.
    expect(hint()).toBeNull();
  });

  it("signs the staff member in from the pinned pill", async () => {
    auth.login.mockResolvedValue(undefined);
    await renderLogin();
    await type(container.querySelector('input[autocomplete="username"]'), "Ravi");
    await type(pinBoxes()[0], "1234");
    await click(cta());
    expect(auth.login).toHaveBeenCalledWith({ username: "ravi", pin: "1234" });
  });

  it("shows a wrong PIN inline with an icon, and clears the boxes", async () => {
    auth.login.mockRejectedValue(new Error("That PIN is not right."));
    await renderLogin();
    await type(container.querySelector('input[autocomplete="username"]'), "ravi");
    await type(pinBoxes()[0], "1234");
    await click(cta());

    const error = container.querySelector(".login-error");
    expect(error).toBeTruthy();
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.querySelector("svg")).toBeTruthy();
    expect(error.textContent).toContain("That PIN is not right.");
    expect(pinBoxes().map((b) => b.value)).toEqual(["", "", "", ""]);
  });

  it("offers the three languages as pills, marking the active one", async () => {
    await renderLogin();
    const pills = Array.from(container.querySelectorAll(".login-lang .chip"));
    expect(pills.map((p) => p.textContent)).toEqual(["English", "తెలుగు", "हिंदी"]);
    expect(pills[0].getAttribute("aria-pressed")).toBe("true");

    await click(pills[1]);
    expect(
      Array.from(container.querySelectorAll(".login-lang .chip"))[1].getAttribute(
        "aria-pressed"
      )
    ).toBe("true");
  });
});
