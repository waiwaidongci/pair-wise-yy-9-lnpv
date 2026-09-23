// 业务模块二：判定
// 负责完成曝光、换管、换管复测（另一人隔十五分钟连续两次达标才放行，累计时长归零）、
// 以及对已放行曝光的灯管/辐照/开灯时刻更正（旧记录失效只读，按新值重算）。
import {
  completeExposure,
  replaceLamp,
  submitRetest,
  correctExposure,
} from "./domain.js";

export const decisionRoutes = [
  {
    method: "POST",
    path: /^\/api\/exposures\/([^/]+)\/complete$/,
    note: "完成曝光并收管累计",
    handle: (state, body, match) => completeExposure(state, match[1], body.at),
  },
  {
    method: "POST",
    path: /^\/api\/lamps\/([^/]+)\/replace$/,
    note: "换管，累计时长归零",
    handle: (state, body, match) => replaceLamp(state, match[1], body, body.at),
  },
  {
    method: "POST",
    path: /^\/api\/lamps\/([^/]+)\/retest$/,
    note: "换管复测读数",
    handle: (state, body, match) => submitRetest(state, match[1], body, body.at),
  },
  {
    method: "POST",
    path: /^\/api\/exposures\/([^/]+)\/correct$/,
    note: "更正灯管/辐照/开灯时刻，旧单失效重算",
    handle: (state, body, match) => correctExposure(state, match[1], body),
  },
];
