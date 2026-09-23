// 业务模块一：入口
// 负责灯管建档与曝光准入申请。占用/复测冲突直接驳回；寿命、校准、辐照不达标整单拒绝且不占灯管。
import { registerLamp, admitExposure } from "./domain.js";

export const entryRoutes = [
  {
    method: "POST",
    path: "/api/lamps",
    note: "灯管建档",
    handle: (state, body) => registerLamp(state, body, body.at),
  },
  {
    method: "POST",
    path: "/api/admissions",
    note: "曝光准入申请",
    handle: (state, body) => admitExposure(state, body, body.at),
  },
];
