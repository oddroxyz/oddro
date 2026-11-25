import { BRAND } from "@/config/brand";

export const NAV = [
  { href: "/desk", label: "Desk" },
  { href: "/history", label: "History" },
  { href: "/method", label: "Method" },
  { href: "/token", label: BRAND.symbol },
] as const;

/** Every public route, for the sitemap. */
export const ROUTES = ["/", "/desk", "/history", "/method", "/token"] as const;
