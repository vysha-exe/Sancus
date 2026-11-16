const sensitiveKey = /(secret|password|authorization|signature.*key|admin.*token|application.*token|access.*token|api.*key|server.*key|cvv|cvc|pan|card.*number|security.*code)/i;

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveKey.test(key) ? "[REDACTED]" : redact(child)
    ])
  );
}

export function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]").slice(0, 500);
}
