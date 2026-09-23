import http from "node:http";
import { createOrder } from "./modules/intake.js";
import {
  decide, complete, correct, replace, retestFirst, retestSecond,
} from "./modules/admission.js";
import { board, lampHistory, archivedOrders } from "./modules/archive.js";
import { page } from "./ui.js";

const port = Number(process.env.PORT || 3040);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function fail(res, error) {
  send(res, error.status || 500, {
    error: error.code || "internal_error",
    message: error.message || String(error),
    reasons: error.reasons || undefined,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    if (req.method === "GET" && p === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page());
    }

    // ── 共享只读视图：灯管、列表、履历同源，刷新后一致 ──
    if (req.method === "GET" && p === "/api/board") return send(res, 200, await board());

    // ── 入口模块 ──
    if (req.method === "POST" && p === "/api/intake/orders") {
      return send(res, 201, await createOrder(await body(req)));
    }

    // ── 判定模块 ──
    let m;
    m = p.match(/^\/api\/admission\/orders\/([^/]+)\/decide$/);
    if (m && req.method === "POST") return send(res, 200, await decide(m[1], await body(req)));
    m = p.match(/^\/api\/admission\/orders\/([^/]+)\/complete$/);
    if (m && req.method === "POST") return send(res, 200, await complete(m[1], await body(req)));
    m = p.match(/^\/api\/admission\/orders\/([^/]+)\/correct$/);
    if (m && req.method === "POST") return send(res, 200, await correct(m[1], await body(req)));
    m = p.match(/^\/api\/admission\/lamps\/([^/]+)\/replace$/);
    if (m && req.method === "POST") return send(res, 200, await replace(m[1], await body(req)));
    m = p.match(/^\/api\/admission\/lamps\/([^/]+)\/retest\/(first|second)$/);
    if (m && req.method === "POST") {
      const action = m[2] === "first" ? retestFirst : retestSecond;
      return send(res, 200, await action(m[1], await body(req)));
    }

    // ── 存档模块 ──
    if (req.method === "GET" && p === "/api/archive/orders") return send(res, 200, await archivedOrders());
    m = p.match(/^\/api\/archive\/lamps\/([^/]+)\/history$/);
    if (m && req.method === "GET") {
      const hist = await lampHistory(m[1]);
      if (!hist) return send(res, 404, { error: "lamp_not_found", message: "灯管不存在" });
      return send(res, 200, hist);
    }

    send(res, 404, { error: "not_found", message: "路径不存在" });
  } catch (error) {
    fail(res, error);
  }
});

server.listen(port, () => console.log("曝光灯管寿命与辐照准入台 listening on http://localhost:" + port));
