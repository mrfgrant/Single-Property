import dns from "node:dns/promises";

const STREET_TYPE_ABBREVS: Record<string, string> = {
  avenue: "ave",
  boulevard: "blvd",
  circle: "cir",
  court: "ct",
  drive: "dr",
  highway: "hwy",
  lane: "ln",
  parkway: "pkwy",
  place: "pl",
  road: "rd",
  street: "st",
  terrace: "ter",
  trail: "trl",
  way: "way",
};

function sanitize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^-+|-+$/g, "");
}

function normalizeStreetType(word: string): string {
  return STREET_TYPE_ABBREVS[word.toLowerCase()] ?? word.toLowerCase();
}

export interface ParsedAddress {
  number: string;
  streetName: string;
  streetType: string;
  city: string;
}

export function parseAddress(address: string, city: string): ParsedAddress {
  const parts = address.trim().split(/\s+/);
  const number = sanitize(parts[0] ?? "");
  const rest = parts.slice(1);

  const lastWord = rest[rest.length - 1] ?? "";
  const isKnownType = Object.keys(STREET_TYPE_ABBREVS).includes(lastWord.toLowerCase()) ||
    Object.values(STREET_TYPE_ABBREVS).includes(lastWord.toLowerCase());

  let streetType = "";
  let streetNameParts: string[];

  if (isKnownType && rest.length > 1) {
    streetType = normalizeStreetType(lastWord);
    streetNameParts = rest.slice(0, -1);
  } else {
    streetType = normalizeStreetType(lastWord);
    streetNameParts = rest.slice(0, -1);
  }

  const streetName = streetNameParts.map(sanitize).join("");

  return {
    number,
    streetName,
    streetType: sanitize(streetType),
    city: sanitize(city),
  };
}

export function generateCandidates(address: string, city: string): string[] {
  const { number, streetName, streetType, city: sanitizedCity } = parseAddress(address, city);

  const candidates = [
    `${number}${streetName}.com`,
    `${number}${streetName}${streetType}.com`,
    `${number}${streetName}${sanitizedCity}.com`,
    `${number}${streetName}${streetType}${sanitizedCity}.com`,
  ].filter((d, i, arr) => arr.indexOf(d) === i);

  return candidates;
}

export async function isDomainAvailable(domain: string): Promise<boolean> {
  try {
    await dns.resolve(domain);
    return false;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return true;
    return false;
  }
}

export async function pickAvailableDomain(
  address: string,
  city: string,
): Promise<string | null> {
  const candidates = generateCandidates(address, city);
  for (const domain of candidates) {
    if (await isDomainAvailable(domain)) return domain;
  }
  return null;
}
