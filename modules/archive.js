// 存档模块：只读视图。归档单（已完成 / 已拒绝）、冻结版本链、灯管履历台账。
// 灯管占用 / 空闲一律由「进行中曝光单」派生，刷新后列表与履历必然一致。

import { read } from "../store.js";
import {
  ORDER_STATUS, HOUR_LIMIT, currentVersion, effectiveLampStatus, lampBusyOrder,
  activeOrders, calibrationValid, reasonText,
} from "./domain.js";

function orderView(db, order) {
  const cur = currentVersion(order);
  const busyLampId = cur && order.status === ORDER_STATUS.ACTIVE ? cur.lampId : null;
  return {
    ...order,
    current: cur ? { ...cur } : null,
    currentLampId: busyLampId,
    currentLampCode: cur ? cur.lampCode : null,
    versions: order.versions.map((v) => ({ ...v })), // 深一层拷贝，前端只读展示
  };
}

function lampView(db, lamp) {
  const busyOrder = lamp.awaitingRetest ? null : lampBusyOrder(db, lamp.id);
  return {
    id: lamp.id,
    code: lamp.code,
    name: lamp.name,
    tubeNo: lamp.tubeNo,
    cumulativeHours: lamp.cumulativeHours,
    calibrationExpireAt: lamp.calibrationExpireAt,
    targetIrradiance: lamp.targetIrradiance,
    awaitingRetest: !!lamp.awaitingRetest,
    status: effectiveLampStatus(db, lamp),
    reachedLimit: Number(lamp.cumulativeHours) >= HOUR_LIMIT,
    calibrationExpired: !calibrationValid(lamp, Date.now()),
    busyOrderCode: busyOrder ? busyOrder.code : null,
  };
}

export async function board() {
  const db = await read();
  return {
    lamps: db.lamps.map((l) => lampView(db, l)),
    orders: db.orders.map((o) => orderView(db, o)),
    pending: db.orders.filter((o) => o.status === ORDER_STATUS.PENDING).map((o) => orderView(db, o)),
    active: activeOrders(db).map((o) => orderView(db, o)),
    archived: db.orders
      .filter((o) => o.status === ORDER_STATUS.DONE || o.status === ORDER_STATUS.REJECTED)
      .map((o) => orderView(db, o)),
    retests: db.retests.map((r) => ({ ...r })),
    generatedAt: new Date().toISOString(),
  };
}

export async function lampHistory(lampId) {
  const db = await read();
  const lamp = db.lamps.find((l) => l.id === lampId || l.code === lampId);
  if (!lamp) return null;
  const events = db.ledger
    .filter((e) => e.lampId === lamp.id)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  const orders = db.orders
    .filter((o) => o.versions.some((v) => v.lampId === lamp.id))
    .map((o) => orderView(db, o));
  return {
    lamp: lampView(db, lamp),
    events,
    orders,
    retests: db.retests.filter((r) => r.lampId === lamp.id).map((r) => ({ ...r })),
  };
}

export async function archivedOrders() {
  const db = await read();
  return db.orders
    .filter((o) => o.status === ORDER_STATUS.DONE || o.status === ORDER_STATUS.REJECTED)
    .map((o) => orderView(db, o));
}

export { reasonText };
