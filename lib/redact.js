// Log hygiene (shared by the order form and the admin Worker): error texts
// from Resend, Google or D1 can echo an email address or a visitor's input.
// Logs keep ids, status codes and the error text with addresses masked.

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Error or value → short, single-line string with email addresses masked. */
export function redact(value) {
  const text = value instanceof Error ? value.message : typeof value === "string" ? value : JSON.stringify(value);
  return String(text ?? "").replace(EMAIL_RE, "[email]").replace(/\s+/g, " ").slice(0, 300);
}
