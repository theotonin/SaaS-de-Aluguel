import { isIP } from "node:net";
// Only called by the Vercel entry: that platform overwrites this header.
export function vercelClientAddress(remote: string | undefined, forwarded: string | string[] | undefined): string {
  return typeof forwarded === 'string' && isIP(forwarded.trim()) ? forwarded.trim() : remote ?? 'unknown';
}
export function clientAddress(
  remote: string | undefined,
  forwarded: string | string[] | undefined,
  trustedProxy?: string,
): string {
  if (
    trustedProxy &&
    remote === trustedProxy &&
    typeof forwarded === "string" &&
    isIP(forwarded.trim())
  )
    return forwarded.trim();
  return remote ?? "unknown";
}
