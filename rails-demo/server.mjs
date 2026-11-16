import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { config, configurationStatus } from "./src/config.mjs";
import { ProviderError } from "./src/http.mjs";
import { safeMessage } from "./src/redact.mjs";
import { runMarqeta } from "./src/adapters/marqeta.mjs";
import { getPixStatus, runPix } from "./src/adapters/pix.mjs";
import { getPromptPayStatus, runPromptPay } from "./src/adapters/promptpay.mjs";
import { getQrisStatus, runQris } from "./src/adapters/qris.mjs";

const publicDir = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const demoRunners = {
  marqeta: (input) => runMarqeta(config.marqeta, input),
  pix: (input) => runPix(config.pix, input),
  promptpay: (input) => runPromptPay(config.promptpay, input),
  qris: (input) => runQris(config.qris, input)
};
const statusRunners = {
  pix: (id) => getPixStatus(config.pix, id),
  promptpay: (id) => getPromptPayStatus(config.promptpay, id),
  qris: (id) => getQrisStatus(config.qris, id)
};

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store"
  });
  response.end(payload);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(publicDir, safePath);
  try {
    const data = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mime[extname(filePath)] || "application/octet-stream",
      "content-length": data.length
    });
    response.end(data);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

export function createServer() {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    try {
      if (request.method === "GET" && url.pathname === "/api/config") {
        return sendJson(response, 200, { rails: configurationStatus() });
      }

      const runMatch = request.method === "POST" && url.pathname.match(/^\/api\/demo\/(marqeta|pix|promptpay|qris)$/);
      if (runMatch) {
        const rail = runMatch[1];
        const state = configurationStatus()[rail];
        if (!state.configured) {
          return sendJson(response, 400, {
            ok: false,
            provider: rail,
            error: `Missing environment variables: ${state.missing.join(", ")}`
          });
        }
        const result = await demoRunners[rail](await readJson(request));
        return sendJson(response, 200, result);
      }

      const statusMatch = request.method === "GET" && url.pathname.match(/^\/api\/demo\/(pix|promptpay|qris)\/([^/]+)\/status$/);
      if (statusMatch) {
        const [, rail, encodedId] = statusMatch;
        const state = configurationStatus()[rail];
        if (!state.configured) {
          return sendJson(response, 400, { ok: false, provider: rail, error: `Missing: ${state.missing.join(", ")}` });
        }
        const result = await statusRunners[rail](decodeURIComponent(encodedId));
        return sendJson(response, 200, result);
      }

      if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
        return serveStatic(url.pathname, response);
      }

      return sendJson(response, 404, { ok: false, error: "Route not found" });
    } catch (error) {
      const status = error instanceof ProviderError ? 502 : error instanceof SyntaxError ? 400 : 500;
      return sendJson(response, status, {
        ok: false,
        provider: error.provider,
        error: safeMessage(error),
        providerStatus: error.status,
        details: error.details
      });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || "127.0.0.1";
  createServer().listen(config.port, host, () => {
    console.log(`Sandbox Rail Checker: http://${host}:${config.port}`);
  });
}
