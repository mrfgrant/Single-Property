/**
 * Phone-number selection logic for cold outreach SMS.
 *
 * MLS agent records carry multiple phones with different mobile-confidence
 * levels. We only text numbers we believe to be mobile, in this priority:
 *   1. ListAgentMobilePhone — explicit mobile, highest confidence.
 *   2. ListAgentDirectPhone — could be cell or desk; acceptable fallback.
 *   3. ListAgentOfficePhone — brokerage line; NEVER text.
 *
 * If no eligible number is found, the caller should send email only and
 * skip SMS entirely.
 */
export interface MlsAgentPhones {
  mobilePhone?: string | null;
  directPhone?: string | null;
  officePhone?: string | null;
}

export interface PickedPhone {
  phone: string;
  source: "mobile" | "direct";
}

export function pickAgentMobile(phones: MlsAgentPhones): PickedPhone | null {
  const m = normalize(phones.mobilePhone);
  if (m) return { phone: m, source: "mobile" };
  const d = normalize(phones.directPhone);
  if (d) return { phone: d, source: "direct" };
  return null;
}

/**
 * Best-effort E.164 normalization for US numbers. Strips formatting,
 * accepts 10-digit (assumes +1) or 11-digit starting with 1, and rejects
 * anything that doesn't fit. Returns the E.164 string or null.
 */
export function normalize(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Already E.164-ish, longer international.
  if (input.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}
