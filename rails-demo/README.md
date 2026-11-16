# Sandbox Rail Checker

A zero-dependency hackathon console that calls four real payment-provider sandboxes:

- Marqeta virtual-card issuance
- PayZu Pix QR charges
- Omise PromptPay QR charges
- Midtrans QRIS charges

There is no database. The browser keeps the current results, and the backend polls provider status APIs.

## Run locally

```bash
cp .env.example .env
# Fill in the sandbox credentials you have.
npm start
```

Open <http://localhost:3000>. Rails without credentials appear as **Not configured**; the others can be tested independently.

For a container or cloud deployment, set `HOST=0.0.0.0`.

## Required sandbox credentials

```text
MARQETA_APPLICATION_TOKEN
MARQETA_ADMIN_ACCESS_TOKEN
PAYZU_SANDBOX_TOKEN
OMISE_SECRET_KEY
MIDTRANS_SERVER_KEY
```

`MARQETA_CARD_PRODUCT_TOKEN` is optional. If omitted, the adapter selects the first active card product returned by the sandbox.

## What each test does

- **Marqeta:** creates a test user, finds a card product, and issues a card.
- **Pix:** creates a PayZu sandbox QR charge. The public sandbox normally changes it from `PENDING` to `COMPLETED` after about ten seconds; use **Refresh status**.
- **PromptPay:** creates a server-side Omise PromptPay source and charge. Mark it successful or failed from the Omise test dashboard, then refresh.
- **QRIS:** creates a Midtrans QRIS charge. Open the Midtrans simulator, paste/scan the generated QR, complete it, then refresh.

## Verify the project

```bash
npm test
npm start
curl http://localhost:3000/api/config
```

The UI receives only redacted provider responses. Never expose the `.env` file or production credentials.

## Official references

- [Marqeta sandbox simulations](https://www.marqeta.com/blog/introducing-simulations-2-0)
- [PayZu Pix sandbox](https://docs.payzu.com.br/docs/pix-processamento/sandbox)
- [Omise PromptPay](https://docs.omise.co/promptpay)
- [Midtrans QRIS](https://docs.midtrans.com/reference/qris)
