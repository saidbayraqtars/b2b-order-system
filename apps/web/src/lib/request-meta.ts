import { headers } from "next/headers";
import type { RequestMeta } from "@repo/services";

/**
 * Client IP + user agent for the audit trail.
 *
 * `x-forwarded-for` is client-controlled unless a trusted proxy overwrites it,
 * so treat the value as a hint for reading the log, never as an access-control
 * input. Only the first hop is kept; the rest is proxy chatter.
 */
export function requestMeta(channel: "web" | "mobile" = "web"): RequestMeta {
  const h = headers();
  const forwarded = h.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;
  return { ip, userAgent: h.get("user-agent"), channel };
}

/** Same, from a Request object (Auth.js callbacks don't run inside next/headers). */
export function requestMetaFrom(
  req: Request | undefined,
  channel: "web" | "mobile" = "web",
): RequestMeta {
  if (!req) return { ip: null, userAgent: null, channel };
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  return { ip, userAgent: req.headers.get("user-agent"), channel };
}
