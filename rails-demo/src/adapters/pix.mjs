import { randomUUID } from "node:crypto";
import { providerFetch } from "../http.mjs";
import { redact } from "../redact.mjs";

const headersFor = (token) => ({
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
  accept: "application/json"
});

export async function runPix(config, input = {}, fetchImpl = fetch) {
  const amount = Number(input.amount || 10);
  const charge = await providerFetch(
    "pix",
    `${config.baseUrl}/pix`,
    {
      method: "POST",
      headers: headersFor(config.token),
      body: JSON.stringify({
        amount,
        expiresIn: Number(input.expiresIn || 600),
        clientReference: input.reference || `demo-${randomUUID()}`
      })
    },
    fetchImpl
  );

  return {
    provider: "pix",
    ok: true,
    providerId: charge.id,
    statusLookupId: charge.id,
    status: charge.status,
    qrImageUrl: charge.qrCodeBase64 ? `data:image/png;base64,${charge.qrCodeBase64}` : undefined,
    qrPayload: charge.qrCodeText,
    safeResponse: redact({ ...charge, qrCodeBase64: charge.qrCodeBase64 ? "[QR IMAGE]" : undefined })
  };
}

export async function getPixStatus(config, id, fetchImpl = fetch) {
  const charge = await providerFetch(
    "pix",
    `${config.baseUrl}/pix?id=${encodeURIComponent(id)}`,
    { headers: headersFor(config.token) },
    fetchImpl
  );
  const result = Array.isArray(charge) ? charge[0] : charge?.data?.[0] || charge;
  return {
    provider: "pix",
    ok: true,
    providerId: result?.id || id,
    statusLookupId: id,
    status: result?.status || "unknown",
    safeResponse: redact(result)
  };
}
