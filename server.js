import http from "node:http";
import { loadDb, saveDb } from "./src/store.js";
import { entryRoutes } from "./src/entry.js";
import { decisionRoutes } from "./src/decision.js";
import { archiveRoutes } from "./src/archive.js";
import { DomainError } from "./src/domain.js";
import { page } from "./src/page.js";

const port = Number(process.env.PORT || 3040);

// 三个业务模块的路由表（入口、判定、存档分置）。
const routeModules = [
  { name: "入口", routes: entryRoutes, writable: true },
  { name: "判定", routes: decisionRoutes, writable: true },
  { name: "存档", routes: archiveRoutes, writable: false },
];

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DomainError("BAD_JSON", "请求体不是合法 JSON");
  }
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function matchRoute(method, pathname) {
  for (const mod of routeModules) {
    for (const route of mod.routes) {
      if (route.method !== method) continue;
      if (typeof route.path === "string") {
        if (route.path === pathname) return { mod, route, match: [pathname] };
      } else if (route.path.test(pathname)) {
        return { mod, route, match: pathname.match(route.path) };
      }
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page());
    }

    const found = matchRoute(req.method, url.pathname);
    if (!found) return send(res, 404, { error: "not_found" });

    const state = await loadDb();
    const body = await readBody(req);
    let result;
    try {
      result = found.route.handle(state, body, found.match);
    } catch (error) {
      if (error instanceof DomainError) {
        const status = statusFor(error.code);
        return send(res, status, { error: error.code, message: error.message });
      }
      throw error;
    }
    // 写操作落盘；存档模块查询不写盘。GET 永不写盘。
    if (req.method !== "GET") await saveDb(state);
    return send(res, 200, result);
  } catch (error) {
    send(res, 500, { error: "internal_error", message: error.message });
  }
});

// 冲突类（不占管/不建单）409；输入问题 400；找不到 404。
function statusFor(code) {
  if (code === "LAMP_BUSY" || code === "LAMP_RETEST_PENDING" || code === "RETEST_SAME_INSPECTOR" || code === "RETEST_TOO_SOON") return 409;
  if (code.endsWith("_NOT_FOUND")) return 404;
  if (code === "LAMP_DUPLICATED") return 409;
  if (code === "RECORD_READONLY" || code === "INVALID_STATE") return 409;
  return 400;
}

server.listen(port, () => {
  console.log("曝光灯管寿命与辐照准入台 listening on http://localhost:" + port);
});
