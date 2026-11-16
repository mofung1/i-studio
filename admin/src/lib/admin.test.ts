// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { adminRequest } from "./admin";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("uses the independent administrator session and same-origin API", async () => {
  localStorage.setItem("istudio-admin-token", "admin-token");
  localStorage.setItem("istudio-access-token", "front-token");
  const fetch = vi.fn(async (_input: string, _init: RequestInit) =>
    Response.json({ saved: true }),
  );
  vi.stubGlobal("fetch", fetch);
  expect(await adminRequest("models/demo", "PUT", { version: 2 })).toEqual({
    saved: true,
  });
  const [path, options] = fetch.mock.calls[0]!;
  expect(path).toBe("/v1/admin/models/demo");
  expect(new Headers(options.headers).get("Authorization")).toBe(
    "Bearer admin-token",
  );
  await expect(adminRequest("assets")).rejects.toThrow("管理接口");
  await expect(adminRequest("models/%2e%2e")).rejects.toThrow("管理接口");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("expires only the rejected administrator session", async () => {
  localStorage.setItem("istudio-admin-token", "expired");
  localStorage.setItem("istudio-access-token", "front-token");
  const refresh = vi.fn();
  window.addEventListener("istudio-admin-refresh", refresh, { once: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ message: "登录已过期" }, { status: 401 }),
    ),
  );
  await expect(adminRequest("overview")).rejects.toThrow("登录已过期");
  expect(localStorage.getItem("istudio-admin-token")).toBeNull();
  expect(localStorage.getItem("istudio-access-token")).toBe("front-token");
  expect(refresh).toHaveBeenCalledTimes(1);
});
