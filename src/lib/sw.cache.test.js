/**
 * Behaviour of `public/sw.js`, driven through a stub service-worker scope.
 *
 * The worker cannot have a test file next to it: everything in `public/` is
 * copied verbatim into the build, so a test there would be published. It is
 * loaded here as source and evaluated with fake `self`, `caches` and `fetch`,
 * which is enough to pin the two rules that matter on a phone:
 *
 *   1. A navigation asks the network first. The cached shell names
 *      content-hashed bundles, so serving it first re-runs the previous
 *      deploy against filenames that may no longer exist.
 *   2. The cached shell still answers when the network genuinely fails, and
 *      every successful navigation refreshes it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

// Read the version out of the worker rather than repeating it: bumping the
// cache version is a routine part of shipping a UI change (see
// scripts/checkSwVersion.mjs), and it must not drag a test edit along with it.
const VERSION = /const VERSION = "(v\d+)";/.exec(source)?.[1];
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PREVIOUS = `shell-v${Number(VERSION.slice(1)) - 1}`;

const keyOf = (request) => (typeof request === "string" ? request : request.url);

class FakeCache {
  constructor(fetchImpl) {
    this.store = new Map();
    this.fetchImpl = fetchImpl;
  }
  async put(request, response) {
    this.store.set(keyOf(request), response);
  }
  async match(request) {
    return this.store.get(keyOf(request));
  }
  async addAll(urls) {
    for (const url of urls) {
      const res = await this.fetchImpl(url);
      if (!res || !res.ok) throw new Error(`addAll failed for ${url}`);
      this.store.set(keyOf(url), res);
    }
  }
}

class FakeCacheStorage {
  constructor(fetchImpl) {
    this.named = new Map();
    this.fetchImpl = fetchImpl;
  }
  async open(name) {
    if (!this.named.has(name)) this.named.set(name, new FakeCache(this.fetchImpl));
    return this.named.get(name);
  }
  async keys() {
    return [...this.named.keys()];
  }
  async delete(name) {
    return this.named.delete(name);
  }
  async match(request) {
    for (const cache of this.named.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }
}

/** Let the worker's un-awaited cache writes settle. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function bootWorker() {
  const listeners = new Map();
  const fetchImpl = vi.fn(async () => new Response("network", { status: 200 }));

  const self = {
    location: { pathname: "/gas_station/sw.js", origin: "https://example.test" },
    addEventListener: (type, handler) => listeners.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  };
  // `self.location.origin` is what the worker compares request origins against.
  const cacheStorage = new FakeCacheStorage((url) => fetchImpl(url));

  const run = new Function(
    "self",
    "caches",
    "fetch",
    "Response",
    "URL",
    `${source}\n//# sourceURL=sw.js`
  );
  run(self, cacheStorage, (...args) => fetchImpl(...args), Response, URL);

  const dispatch = (type, event) => {
    const handler = listeners.get(type);
    if (!handler) throw new Error(`No ${type} listener registered`);
    handler(event);
  };

  /** Fire a fetch event and return what the worker chose to respond with. */
  const request = async (req) => {
    let responded;
    dispatch("fetch", {
      request: req,
      respondWith: (value) => {
        responded = value;
      },
    });
    const result = responded === undefined ? undefined : await responded;
    await settle();
    return result;
  };

  const navigation = (url = "https://example.test/gas_station/owner/staff") => ({
    url,
    method: "GET",
    mode: "navigate",
  });

  const asset = (url) => ({ url, method: "GET", mode: "no-cors" });

  return { self, cacheStorage, fetchImpl, dispatch, request, navigation, asset, settle };
}

const SHELL_URL = "/gas_station/index.html";

describe("service worker", () => {
  let worker;

  beforeEach(() => {
    worker = bootWorker();
  });

  it("names its caches after a bumped version", () => {
    expect(VERSION).toMatch(/^v\d+$/);
    // v7 is the release that made navigations network-first; nothing may go back.
    expect(Number(VERSION.slice(1))).toBeGreaterThanOrEqual(7);
  });

  it("caches the shell on install", async () => {
    const waits = [];
    worker.dispatch("install", { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    const shell = await worker.cacheStorage.open(SHELL);
    expect([...shell.store.keys()]).toContain(SHELL_URL);
    expect(worker.self.skipWaiting).toHaveBeenCalled();
  });

  it("drops caches from earlier versions on activate", async () => {
    await worker.cacheStorage.open(PREVIOUS);
    await worker.cacheStorage.open(`assets-v${Number(VERSION.slice(1)) - 1}`);
    await worker.cacheStorage.open(SHELL);
    const waits = [];
    worker.dispatch("activate", { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    expect(await worker.cacheStorage.keys()).toEqual([SHELL]);
  });

  describe("navigations", () => {
    it("prefers the network over a cached shell from an older deploy", async () => {
      const shell = await worker.cacheStorage.open(SHELL);
      await shell.put(SHELL_URL, new Response("OLD SHELL — asset-abc123.js"));
      worker.fetchImpl.mockResolvedValue(new Response("NEW SHELL — asset-def456.js"));

      const res = await worker.request(worker.navigation());

      expect(worker.fetchImpl).toHaveBeenCalled();
      expect(await res.text()).toContain("NEW SHELL");
    });

    it("refreshes the cached shell after every successful fetch", async () => {
      worker.fetchImpl.mockResolvedValue(new Response("NEW SHELL"));

      await worker.request(worker.navigation());

      const shell = await worker.cacheStorage.open(SHELL);
      const cached = await shell.match(SHELL_URL);
      expect(await cached.text()).toBe("NEW SHELL");
    });

    it("falls back to the cached shell when the network fails", async () => {
      const shell = await worker.cacheStorage.open(SHELL);
      await shell.put(SHELL_URL, new Response("CACHED SHELL"));
      worker.fetchImpl.mockRejectedValue(new TypeError("Failed to fetch"));

      const res = await worker.request(worker.navigation());

      expect(await res.text()).toBe("CACHED SHELL");
    });

    it("does not cache an error page the server returned", async () => {
      const shell = await worker.cacheStorage.open(SHELL);
      await shell.put(SHELL_URL, new Response("CACHED SHELL"));
      worker.fetchImpl.mockResolvedValue(new Response("404 page", { status: 404 }));

      const res = await worker.request(worker.navigation());

      // The response is passed through — GitHub Pages answers deep links with
      // a 404 that is itself the app shell — but it never replaces the cache.
      expect(res.status).toBe(404);
      const cached = await shell.match(SHELL_URL);
      expect(await cached.text()).toBe("CACHED SHELL");
    });

    it("returns a network error when offline with nothing cached", async () => {
      worker.fetchImpl.mockRejectedValue(new TypeError("Failed to fetch"));
      const res = await worker.request(worker.navigation());
      expect(res.type).toBe("error");
    });
  });

  describe("other requests", () => {
    it("serves content-hashed assets from the cache when present", async () => {
      const assets = await worker.cacheStorage.open(ASSETS);
      const url = "https://example.test/gas_station/assets/index-abc123.js";
      await assets.put({ url }, new Response("CACHED ASSET"));

      const res = await worker.request(worker.asset(url));

      expect(worker.fetchImpl).not.toHaveBeenCalled();
      expect(await res.text()).toBe("CACHED ASSET");
    });

    it("never touches Supabase traffic", async () => {
      const res = await worker.request({
        url: "https://project.supabase.co/rest/v1/profiles",
        method: "GET",
        mode: "cors",
      });
      expect(res).toBeUndefined();
    });

    it("ignores non-GET requests", async () => {
      const res = await worker.request({
        url: "https://example.test/gas_station/index.html",
        method: "POST",
        mode: "navigate",
      });
      expect(res).toBeUndefined();
    });
  });
});
