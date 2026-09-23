// 业务模块三：存档
// 只读查询（统一列表、灯管履历）与工单归档。归档/失效记录一律只读，拒绝任何写操作。
import { archiveExposure, listView, lampHistory, findExposure, DomainError } from "./domain.js";

export const archiveRoutes = [
  {
    method: "GET",
    path: "/api/state",
    note: "统一列表：灯管 + 曝光工单（刷新后一致）",
    handle: (state) => listView(state),
  },
  {
    method: "GET",
    path: /^\/api\/lamps\/([^/]+)\/history$/,
    note: "单根灯管履历",
    handle: (state, _body, match) => lampHistory(state, match[1]),
  },
  {
    method: "GET",
    path: /^\/api\/exposures\/([^/]+)$/,
    note: "工单详情（只读）",
    handle: (state, _body, match) => {
      const ex = findExposure(state, match[1]);
      if (!ex) throw new DomainError("EXPOSURE_NOT_FOUND", "曝光工单不存在：" + match[1]);
      return ex;
    },
  },
  {
    method: "POST",
    path: /^\/api\/exposures\/([^/]+)\/archive$/,
    note: "工单归档只读",
    handle: (state, body, match) => archiveExposure(state, match[1], body.at),
  },
];
