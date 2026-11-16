const adminHome = "/admin/";

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function adminReturnPath(value: string | null) {
  if (!value || !value.startsWith("/")) return adminHome;
  const origin = "https://admin.istudio.invalid";
  try {
    const url = new URL(value, origin);
    if (
      url.origin === origin &&
      isAdminPath(url.pathname) &&
      url.pathname !== "/admin/login" &&
      !url.pathname.startsWith("/admin/login/")
    ) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    // Malformed or external targets go to the administrative home.
  }
  return adminHome;
}

export function studioHref(path = "/") {
  const front =
    import.meta.env.VITE_WEB_ORIGIN ||
    (import.meta.env.DEV ? "http://127.0.0.1:33000" : window.location.origin);
  return new URL(path, front).href;
}
