import { basicAuth, providerFetch } from "../http.mjs";
import { redact } from "../redact.mjs";

const headersFor = (secretKey) => ({
  authorization: basicAuth(secretKey),
  "content-type": "application/x-www-form-urlencoded",
  accept: "application/json"
});

export async function runPromptPay(config, input = {}, fetchImpl = fetch) {
  const form = new URLSearchParams();
  form.set("amount", String(Math.round(Number(input.amount || 100) * 100)));
  form.set("currency", "THB");
  form.set("source[type]", "promptpay");

  const charge = await providerFetch(
    "promptpay",
    `${config.baseUrl}/charges`,
    { method: "POST", headers: headersFor(config.secretKey), body: form },
    fetchImpl
  );

  const qrImageUrl = charge?.source?.scannable_code?.image?.download_uri;
  return {
    provider: "promptpay",
    ok: true,
    providerId: charge.id,
    statusLookupId: charge.id,
    status: charge.status,
    qrImageUrl,
    simulatorUrl: "https://dashboard.omise.co/test/charges",
    safeResponse: redact(charge)
  };
}

export async function getPromptPayStatus(config, id, fetchImpl = fetch) {
  const charge = await providerFetch(
    "promptpay",
    `${config.baseUrl}/charges/${encodeURIComponent(id)}`,
    { headers: headersFor(config.secretKey) },
    fetchImpl
  );
  return {
    provider: "promptpay",
    ok: true,
    providerId: charge.id || id,
    statusLookupId: id,
    status: charge.status || "unknown",
    qrImageUrl: charge?.source?.scannable_code?.image?.download_uri,
    safeResponse: redact(charge)
  };
}
