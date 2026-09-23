// 领域共享：常量、状态、派生规则。三个业务模块共用，不放任何业务动作。

export const HOUR_LIMIT = 800; // 累计寿命上限（小时）
export const RETEST_GAP_MS = 15 * 60 * 1000; // 换管复测两次读数间隔（15 分钟）

export const ORDER_STATUS = {
  PENDING: "待判定",
  ACTIVE: "已放行",
  DONE: "已完成",
  REJECTED: "已拒绝",
};

// 准入判定不通过原因（整单拒绝，且不占灯管）
export const REASONS = {
  lamp_not_found: "灯管不存在",
  lamp_retesting: "灯管换管后复测未放行",
  lamp_busy: "同一灯管尚有未完成曝光，不得再分配",
  hours_limit: "累计使用时长已达 800 小时寿命上限",
  calibration_expired: "灯管校准已过期",
  irradiance_low: "开灯实测辐照低于曝光单最低要求",
  bad_irradiance: "实测辐照数值无效",
  bad_light_on_at: "开灯时刻无效",
  same_person: "第二次复测须由另一人执行",
  too_soon: "两次复测间隔不足 15 分钟",
};

export function rid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function activeOrders(db) {
  return db.orders.filter((o) => o.status === ORDER_STATUS.ACTIVE);
}

export function lampBusyOrder(db, lampId, ignoreOrderId = null) {
  return activeOrders(db).find(
    (o) => o.currentVersionId &&
      versionLampId(o, o.currentVersionId) === lampId &&
      o.id !== ignoreOrderId,
  ) || null;
}

function versionLampId(order, versionId) {
  const v = order.versions.find((x) => x.id === versionId);
  return v ? v.lampId : null;
}

export function currentVersion(order) {
  return order.versions.find((v) => v.id === order.currentVersionId) || null;
}

// 校准有效期到某日末；以开灯时刻为准
export function calibrationValid(lamp, atMs) {
  const end = Date.parse(`${lamp.calibrationExpireAt}T23:59:59`);
  if (!Number.isFinite(end)) return false;
  return end >= atMs;
}

// 灯管状态权威派生：待复测 > 占用 > 空闲；寿限另由累计时长标记
export function effectiveLampStatus(db, lamp) {
  if (lamp.awaitingRetest) return "待复测";
  return lampBusyOrder(db, lamp.id) ? "占用" : "空闲";
}

// 同步存量 status 字段，保证刷新 / 重启后列表与履历一致
export function reconcile(db) {
  for (const lamp of db.lamps) {
    lamp.status = effectiveLampStatus(db, lamp);
  }
}

export function reasonText(code, extra = {}) {
  const base = REASONS[code] || code;
  if (code === "lamp_busy" && extra.by) return `${base}（占用中：${extra.by}）`;
  if (code === "too_soon" && extra.waitMinutes) {
    return `${base}（还需等待约 ${extra.waitMinutes} 分钟）`;
  }
  return base;
}

// 纯判定：只读 db，绝不改任何状态。通过后由调用方占用灯管。
export function evaluate(db, lampId, order, input = {}) {
  const lamp = db.lamps.find((l) => l.id === lampId);
  const reasons = [];
  if (!lamp) {
    reasons.push({ code: "lamp_not_found" });
    return { lamp: null, reasons };
  }

  if (lamp.awaitingRetest) reasons.push({ code: "lamp_retesting" });

  const busy = lampBusyOrder(db, lampId, order ? order.id : null);
  if (busy) reasons.push({ code: "lamp_busy", by: busy.code });

  if (Number(lamp.cumulativeHours) >= HOUR_LIMIT) reasons.push({ code: "hours_limit" });

  const atMs = Number.isFinite(Date.parse(input.lightOnAt || ""))
    ? Date.parse(input.lightOnAt)
    : Date.now();
  if (!calibrationValid(lamp, atMs)) reasons.push({ code: "calibration_expired" });

  const irradiance = Number(input.irradiance);
  if (!Number.isFinite(irradiance) || irradiance <= 0) {
    reasons.push({ code: "bad_irradiance" });
  } else if (order && irradiance < Number(order.minIrradiance)) {
    reasons.push({ code: "irradiance_low", required: order.minIrradiance, actual: irradiance });
  }

  if (input.lightOnAt && !Number.isFinite(Date.parse(input.lightOnAt))) {
    reasons.push({ code: "bad_light_on_at" });
  }

  return { lamp, reasons };
}
