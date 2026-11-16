import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const cleanBaseUrl = (value, fallback) => (value || fallback).replace(/\/$/, "");

export const config = {
  port: Number(process.env.PORT || 3000),
  marqeta: {
    baseUrl: cleanBaseUrl(process.env.MARQETA_BASE_URL, "https://sandbox-api.marqeta.com/v3"),
    applicationToken: process.env.MARQETA_APPLICATION_TOKEN || "",
    adminAccessToken: process.env.MARQETA_ADMIN_ACCESS_TOKEN || "",
    cardProductToken: process.env.MARQETA_CARD_PRODUCT_TOKEN || ""
  },
  pix: {
    baseUrl: cleanBaseUrl(process.env.PAYZU_BASE_URL, "https://pix.sandbox.payzu.dev/v1"),
    token: process.env.PAYZU_SANDBOX_TOKEN || ""
  },
  promptpay: {
    baseUrl: cleanBaseUrl(process.env.OMISE_BASE_URL, "https://api.omise.co"),
    secretKey: process.env.OMISE_SECRET_KEY || ""
  },
  qris: {
    baseUrl: cleanBaseUrl(process.env.MIDTRANS_BASE_URL, "https://api.sandbox.midtrans.com"),
    serverKey: process.env.MIDTRANS_SERVER_KEY || ""
  }
};

const requirements = {
  marqeta: ["MARQETA_APPLICATION_TOKEN", "MARQETA_ADMIN_ACCESS_TOKEN"],
  pix: ["PAYZU_SANDBOX_TOKEN"],
  promptpay: ["OMISE_SECRET_KEY"],
  qris: ["MIDTRANS_SERVER_KEY"]
};

export function configurationStatus(env = process.env) {
  return Object.fromEntries(
    Object.entries(requirements).map(([rail, keys]) => {
      const missing = keys.filter((key) => !env[key]);
      return [rail, { configured: missing.length === 0, missing }];
    })
  );
}
