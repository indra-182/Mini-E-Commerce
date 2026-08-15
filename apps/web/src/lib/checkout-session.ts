export type CheckoutRequest = {
  customer: {
    name: string;
    email: string;
  };
  shippingAddress: {
    line1: string;
    city: string;
    postalCode: string;
    countryCode: "ID";
  };
  shippingMethod: "REGULAR";
};

type StoredCheckoutIntent = {
  fingerprint: string;
  key: string;
};

const storageKey = "mini-e-commerce.checkout-idempotency";
let memoryIntent: StoredCheckoutIntent | null = null;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// ponytail: short local fingerprint only selects a retry key; the server still validates the full body and hash.
export function checkoutIntentFingerprint(
  input: CheckoutRequest,
  cartVersion: number,
): string {
  const value = JSON.stringify({ cartVersion, input });
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return `${cartVersion}:${(hash >>> 0).toString(16)}`;
}

function newUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function readIntent(): StoredCheckoutIntent | null {
  const currentStorage = storage();
  if (!currentStorage) return memoryIntent;

  try {
    const value = currentStorage.getItem(storageKey);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<StoredCheckoutIntent>;
    if (
      typeof parsed.fingerprint !== "string" ||
      typeof parsed.key !== "string"
    )
      return null;
    return parsed as StoredCheckoutIntent;
  } catch {
    return null;
  }
}

function writeIntent(intent: StoredCheckoutIntent): void {
  memoryIntent = intent;
  const currentStorage = storage();
  if (!currentStorage) return;

  try {
    currentStorage.setItem(storageKey, JSON.stringify(intent));
  } catch {
    // The in-memory value still protects same-page uncertain retries.
  }
}

export function getCheckoutIdempotencyKey(
  input: CheckoutRequest,
  cartVersion: number,
): string {
  const fingerprint = checkoutIntentFingerprint(input, cartVersion);
  const current = readIntent();
  if (current?.fingerprint === fingerprint) return current.key;

  const intent = { fingerprint, key: newUuid() };
  writeIntent(intent);
  return intent.key;
}

export function clearCheckoutIdempotencyKey(): void {
  memoryIntent = null;
  const currentStorage = storage();
  if (!currentStorage) return;

  try {
    currentStorage.removeItem(storageKey);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}
