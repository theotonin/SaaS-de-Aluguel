import { isIP } from "node:net";
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
