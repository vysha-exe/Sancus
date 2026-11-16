import { redact } from "./redact.mjs";

export class ProviderError extends Error {
  constructor(provider, status, message, details) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.details = redact(details);
  }
}

export const basicAuth = (username, password = "") =>
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

export async function providerFetch(provider, url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(15_000)
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const message = body?.message || body?.error || `${provider} returned HTTP ${response.status}`;
    throw new ProviderError(provider, response.status, String(message), body);
  }

  return body;
}
