// 入口模块：只负责曝光单登记。入口不触碰灯管、不做占用。

import { update, read } from "../store.js";
import { ORDER_STATUS, rid } from "./domain.js";

export async function createOrder(input) {
  const requiredMinutes = Number(input.requiredMinutes);
  const minIrradiance = Number(input.minIrradiance);
  const code = String(input.code || "").trim();
  if (!code) throw httpError(400, "code_required", "曝光单编号不能为空");
  if (!Number.isFinite(requiredMinutes) || requiredMinutes <= 0) {
    throw httpError(400, "bad_minutes", "曝光时长必须是正数（分钟）");
  }
  if (!Number.isFinite(minIrradiance) || minIrradiance <= 0) {
    throw httpError(400, "bad_min_irradiance", "最低辐照必须是正数（mW/cm²）");
  }

  return update((db) => {
    if (db.orders.some((o) => o.code === code)) {
      throw httpError(409, "duplicate_code", `曝光单 ${code} 已存在`);
    }
    const order = {
      id: rid("EX"),
      code,
      plateSize: String(input.plateSize || "").trim(),
      chemicalBatch: String(input.chemicalBatch || "").trim(),
      requiredMinutes,
      minIrradiance,
      note: String(input.note || "").trim(),
      status: ORDER_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      versions: [],
      currentVersionId: null,
      completion: null,
      archivedAt: null,
    };
    db.orders.unshift(order);
    return order;
  });
}

export async function pendingOrders() {
  const db = await read();
  return db.orders.filter((o) => o.status === ORDER_STATUS.PENDING);
}

export function httpError(status, code, message) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}
