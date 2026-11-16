import test from "node:test";
import assert from "node:assert/strict";
import { configurationStatus } from "../src/config.mjs";
import { redact } from "../src/redact.mjs";
import { runPix } from "../src/adapters/pix.mjs";
import { runQris } from "../src/adapters/qris.mjs";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" }
});

test("configurationStatus reports missing credentials", () => {
  const status = configurationStatus({ OMISE_SECRET_KEY: "test" });
  assert.equal(status.promptpay.configured, true);
  assert.equal(status.pix.configured, false);
  assert.deepEqual(status.pix.missing, ["PAYZU_SANDBOX_TOKEN"]);
});

test("redact removes nested secrets, signatures, and card data", () => {
  assert.deepEqual(redact({ token: "safe-object-token", secretKey: "secret", signature_key: "signed", card: { pan: "4111" } }), {
    token: "safe-object-token",
    secretKey: "[REDACTED]",
    signature_key: "[REDACTED]",
    card: { pan: "[REDACTED]" }
  });
});

test("PayZu adapter normalizes QR response", async () => {
  const result = await runPix(
    { baseUrl: "https://pix.example/v1", token: "sbx" },
    { amount: 10, reference: "demo" },
    async () => jsonResponse({ id: "pix_1", status: "PENDING", qrCodeText: "000201", qrCodeBase64: "abc" })
  );
  assert.equal(result.providerId, "pix_1");
  assert.equal(result.qrImageUrl, "data:image/png;base64,abc");
  assert.equal(result.safeResponse.qrCodeBase64, "[QR IMAGE]");
});

test("Midtrans adapter selects the QR action and lookup id", async () => {
  const result = await runQris(
    { baseUrl: "https://midtrans.example", serverKey: "server" },
    { amount: 25_000, reference: "order-1" },
    async () => jsonResponse({
      transaction_id: "tx-1",
      order_id: "order-1",
      transaction_status: "pending",
      actions: [{ name: "generate-qr-code", url: "https://qr.example/1" }]
    })
  );
  assert.equal(result.providerId, "tx-1");
  assert.equal(result.statusLookupId, "tx-1");
  assert.equal(result.qrImageUrl, "https://qr.example/1");
});
