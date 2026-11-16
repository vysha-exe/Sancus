import { randomUUID } from "node:crypto";
import { basicAuth, providerFetch } from "../http.mjs";
import { redact } from "../redact.mjs";

const headersFor = (serverKey) => ({
  authorization: basicAuth(serverKey),
  "content-type": "application/json",
  accept: "application/json"
});

export async function runQris(config, input = {}, fetchImpl = fetch) {
  const orderId = input.reference || `demo-${randomUUID()}`;
  const amount = Math.round(Number(input.amount || 25_000));
  const transaction = await providerFetch(
    "qris",
    `${config.baseUrl}/v2/charge`,
    {
      method: "POST",
      headers: headersFor(config.serverKey),
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: { order_id: orderId, gross_amount: amount },
        qris: { acquirer: "gopay" }
      })
    },
    fetchImpl
  );

  const qrAction = transaction?.actions?.find((action) =>
    ["generate-qr-code", "generate-qr-code-v2"].includes(action.name)
  );
  return {
    provider: "qris",
    ok: true,
    providerId: transaction.transaction_id || orderId,
    statusLookupId: transaction.transaction_id || transaction.order_id || orderId,
    status: transaction.transaction_status || transaction.status_code,
    qrImageUrl: qrAction?.url,
    simulatorUrl: "https://simulator.sandbox.midtrans.com/openapi/qris/index",
    safeResponse: redact(transaction)
  };
}

export async function getQrisStatus(config, id, fetchImpl = fetch) {
  const transaction = await providerFetch(
    "qris",
    `${config.baseUrl}/v2/${encodeURIComponent(id)}/status`,
    { headers: headersFor(config.serverKey) },
    fetchImpl
  );
  return {
    provider: "qris",
    ok: true,
    providerId: transaction.transaction_id || id,
    statusLookupId: id,
    status: transaction.transaction_status || transaction.status_code || "unknown",
    safeResponse: redact(transaction)
  };
}
