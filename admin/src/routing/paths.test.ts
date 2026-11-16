import { describe, expect, it } from "vitest";
import { adminReturnPath, isAdminPath } from "./paths";

describe("admin route boundaries", () => {
  it("restores the original admin route with its search and anchor", () => {
    expect(adminReturnPath("/admin/models?page=2#channels")).toBe(
      "/admin/models?page=2#channels",
    );
    expect(isAdminPath("/admin")).toBe(true);
  });

  it.each([
    "https://elsewhere.test/admin",
    "//elsewhere.test/admin",
    "/\\elsewhere.test/admin",
    "/admin/../studio",
    "/admin-login",
    "/admin/login?next=/admin/settings",
    null,
  ])("returns to admin home for invalid or recursive targets %s", (target) => {
    expect(adminReturnPath(target)).toBe("/admin/");
  });
});
