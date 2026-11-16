import { randomUUID } from "node:crypto";
import { basicAuth, providerFetch } from "../http.mjs";
import { redact } from "../redact.mjs";

export async function runMarqeta(config, input = {}, fetchImpl = fetch) {
  const authorization = basicAuth(config.applicationToken, config.adminAccessToken);
  const headers = { authorization, "content-type": "application/json", accept: "application/json" };
  const token = randomUUID().replaceAll("-", "");

  const user = await providerFetch(
    "marqeta",
    `${config.baseUrl}/users`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        token,
        first_name: input.firstName || "Sandbox",
        last_name: input.lastName || "Demo",
        active: true
      })
    },
    fetchImpl
  );

  let cardProductToken = config.cardProductToken;
  if (!cardProductToken) {
    const products = await providerFetch(
      "marqeta",
      `${config.baseUrl}/cardproducts?count=10&start_index=0`,
      { headers },
      fetchImpl
    );
    cardProductToken = products?.data?.find((product) => product.active !== false)?.token;
  }

  if (!cardProductToken) {
    throw new Error("Marqeta authenticated, but no active card product was found. Set MARQETA_CARD_PRODUCT_TOKEN.");
  }

  const card = await providerFetch(
    "marqeta",
    `${config.baseUrl}/cards`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_token: user.token,
        card_product_token: cardProductToken
      })
    },
    fetchImpl
  );

  return {
    provider: "marqeta",
    ok: true,
    providerId: card.token,
    statusLookupId: card.token,
    status: card.state || card.status || "created",
    card: { token: card.token, lastFour: card.last_four || card.lastFour },
    safeResponse: redact({ user: { token: user.token, active: user.active }, card })
  };
}
