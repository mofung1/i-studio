import {
  useLocation,
  useRouter as useTanStackRouter,
} from "@tanstack/react-router";

export function useSearchParams() {
  return useLocation({
    select: (location) => new URLSearchParams(location.searchStr),
  });
}

export function useRouter() {
  const router = useTanStackRouter();
  return {
    push: (href: string) => router.history.push(href),
    refresh: () => void router.invalidate(),
  };
}
