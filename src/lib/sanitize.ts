// Strip control characters / dangerous markup pieces from form inputs.
// Defense in depth — React already escapes JSX, but we sanitize before sending to DB and external systems.
export function sanitizeText(input: string, maxLen = 200): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\u0000-\u001F\u007F]/g, "") // control chars
    .replace(/<\/?[a-zA-Z][^>]*>/g, "") // strip any html tags
    .trim()
    .slice(0, maxLen);
}

export function sanitizePhone(input: string): string {
  return input.replace(/[^\d+]/g, "").slice(0, 16);
}

export function sanitizeEmail(input: string): string {
  return input.replace(/[\s<>"']/g, "").trim().toLowerCase().slice(0, 254);
}
