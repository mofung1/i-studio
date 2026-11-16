import { useRouter } from "@tanstack/react-router";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { isAdminPath, studioHref } from "./paths";

/** Connect the ported pages to this SPA and keep public studio links on its origin. */
export default forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(function AdminLink({ href, onClick, target, download, ...props }, ref) {
  const router = useRouter();
  const internal = Boolean(
    href?.startsWith("/") && isAdminPath(href.split(/[?#]/)[0] || "/"),
  );
  const destination =
    href && href.startsWith("/") && !href.startsWith("//") && !internal
      ? studioHref(href)
      : href;
  return (
    <a
      {...props}
      ref={ref}
      href={destination}
      target={target}
      download={download}
      onClick={(event) => {
        onClick?.(event);
        if (
          !internal ||
          !href ||
          event.defaultPrevented ||
          event.button !== 0 ||
          (target && target !== "_self") ||
          download !== undefined ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        router.history.push(href);
      }}
    />
  );
});
