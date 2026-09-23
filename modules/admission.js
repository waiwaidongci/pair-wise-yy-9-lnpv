// 判定模块：辐照准入、曝光完成、更正重算、换管复测。
// 规则：同一灯管未完成曝光前不得再分配；累计 800 小时 / 校准过期 / 辐照不足整单拒绝且不占灯管。

import { update } from "../store.js";
import {
  ORDER_STATUS, HOUR_LIMIT, RETEST_GAP_MS, evaluate, currentVersion,
  reconcile, rid, reasonText,
} from "./domain.js";
import { httpError } from "./intake.js";

function findOrder(db, id) {
  return db.orders.find((o) => o.id === id || o.code === id);
}
function findLamp(db, id) {
  return db.lamps.find((l) => l.id === id || l.code === id);
}
function appendLedger(db, entry) {
  db.ledger.push({ id: rid("E"), at: new Date().toISOString(), ...entry });
}
function reasonsView(reasons) {
  return reasons.map((r) => ({ code: r.code, text: reasonText(r.code, r), ...r }));
}

// ── 准入判定：先纯校验，全部通过才占用灯管；拒绝不写任何占用 ──
export async function decide(orderId, input) {
  return update((db) => {
    const order = findOrder(db, orderId);
    if (!order) throw httpError(404, "order_not_found", "曝光单不存在");
    if (order.status !== ORDER_STATUS.PENDING) {
      throw httpError(409, "not_pending", `曝光单当前为「${order.status}」，不可再判定`);
    }
    const lampId = String(input.lampId || "").trim();
    if (!lampId) throw httpError(400, "lamp_required", "请选择灯管");
    const irradiance = Number(input.irradiance);
    if (!Number.isFinite(irradiance) || irradiance <= 0) {
      throw httpError(400, "bad_irradiance", "请填写有效的开灯实测辐照（mW/cm²）");
    }
    const lightOnAt = String(input.lightOnAt || "").trim();
    if (!lightOnAt || !Number.isFinite(Date.parse(lightOnAt))) {
      throw httpError(400, "bad_light_on_at", "请选择开灯时刻");
    }

    const verdict = evaluate(db, lampId, order, { irradiance, lightOnAt });
    const now = new Date().toISOString();
    const decidedBy = String(input.decidedBy || "").trim() || "值班员";
    const lampCode = verdict.lamp ? verdict.lamp.code : lampId;

    if (verdict.reasons.length > 0) {
      // 整单拒绝：只记只读版本，不占灯管
      order.versions.push({
        id: rid("V"), v: order.versions.length + 1,
        lampId: verdict.lamp ? verdict.lamp.id : lampId, lampCode,
        irradiance, lightOnAt, decidedAt: now, decidedBy,
        result: "拒绝", reasons: reasonsView(verdict.reasons),
      });
      order.status = ORDER_STATUS.REJECTED;
      order.archivedAt = now;
      appendLedger(db, {
        lampId: verdict.lamp ? verdict.lamp.id : lampId, lampCode,
        type: "准入拒绝", detail: `曝光单 ${order.code} 整单拒绝，未占用灯管：${verdict.reasons.map((r) => reasonText(r.code, r)).join("；")}`,
        orderId: order.id, occupied: false,
      });
      reconcile(db);
      return { ok: false, order, reasons: reasonsView(verdict.reasons) };
    }

    const version = {
      id: rid("V"), v: 1,
      lampId: verdict.lamp.id, lampCode: verdict.lamp.code,
      irradiance, lightOnAt, decidedAt: now, decidedBy,
      result: "放行", reasons: [],
    };
    order.versions.push(version);
    order.currentVersionId = version.id;
    order.status = ORDER_STATUS.ACTIVE;
    appendLedger(db, {
      lampId: verdict.lamp.id, lampCode: verdict.lamp.code,
      type: "准入放行",
      detail: `曝光单 ${order.code} 判定放行，占用灯管（计划 ${order.requiredMinutes} 分钟，实测 ${irradiance} mW/cm²）`,
      orderId: order.id, occupied: true,
    });
    reconcile(db);
    return { ok: true, order, version };
  });
}

// ── 曝光完成：累计灯管时长；达到 800 小时即刻寿限，需换管复测才能再放行 ──
export async function complete(orderId, input) {
  return update((db) => {
    const order = findOrder(db, orderId);
    if (!order) throw httpError(404, "order_not_found", "曝光单不存在");
    if (order.status !== ORDER_STATUS.ACTIVE) {
      throw httpError(409, "not_active", `曝光单当前为「${order.status}」，无未完成曝光`);
    }
    const version = currentVersion(order);
    const lamp = findLamp(db, version.lampId);
    if (!lamp) throw httpError(409, "lamp_missing", "放行记录中的灯管已不存在");

    const minutes = Number(input.minutes ?? order.requiredMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw httpError(400, "bad_minutes", "实际曝光时长必须是正数（分钟）");
    }
    const added = +(minutes / 60).toFixed(4);
    lamp.cumulativeHours = +(Number(lamp.cumulativeHours) + added).toFixed(4);
    const reachedLimit = lamp.cumulativeHours >= HOUR_LIMIT;

    const now = new Date().toISOString();
    order.completion = {
      versionId: version.id, minutes, addedHours: added,
      at: now, by: String(input.by || "").trim() || "值班员",
    };
    order.status = ORDER_STATUS.DONE;
    order.archivedAt = now;
    appendLedger(db, {
      lampId: lamp.id, lampCode: lamp.code,
      type: "曝光完成",
      detail: `曝光单 ${order.code} 完成，实际 ${minutes} 分钟（+${added}h），累计 ${lamp.cumulativeHours}h${reachedLimit ? "，已达 800h 寿限" : ""}`,
      orderId: order.id, occupied: false,
    });
    reconcile(db);
    return { order, reachedLimit };
  });
}

// ── 更正灯管 / 辐照 / 开灯时刻：旧放行只读冻结，按新值重算准入 ──
export async function correct(orderId, input) {
  return update((db) => {
    const order = findOrder(db, orderId);
    if (!order) throw httpError(404, "order_not_found", "曝光单不存在");
    if (order.status !== ORDER_STATUS.ACTIVE) {
      throw httpError(409, "not_active", `仅「已放行」的进行中曝光可更正，当前为「${order.status}」`);
    }
    const old = currentVersion(order);
    if (!old) throw httpError(409, "no_release", "没有可更正的放行记录");

    const newLampInput = input.lampId !== undefined && input.lampId !== ""
      ? String(input.lampId).trim() : old.lampId;
    const newIrradianceInput = input.irradiance !== undefined && input.irradiance !== ""
      ? Number(input.irradiance) : Number(old.irradiance);
    const newLightOnInput = input.lightOnAt !== undefined && input.lightOnAt !== ""
      ? String(input.lightOnAt) : String(old.lightOnAt);

    if (!Number.isFinite(Number(newIrradianceInput)) || Number(newIrradianceInput) <= 0) {
      throw httpError(400, "bad_irradiance", "更正辐照必须是正数（mW/cm²）");
    }
    if (!Number.isFinite(Date.parse(newLightOnInput))) {
      throw httpError(400, "bad_light_on_at", "更正开灯时刻无效");
    }
    const changes = [];
    if (newLampInput !== old.lampId) changes.push("灯管");
    if (Number(newIrradianceInput) !== Number(old.irradiance)) changes.push("辐照");
    if (newLightOnInput !== String(old.lightOnAt)) changes.push("开灯时刻");
    if (!changes.length) throw httpError(400, "no_change", "没有任何更正项");

    const verdict = evaluate(db, newLampInput, order, {
      irradiance: newIrradianceInput, lightOnAt: newLightOnInput,
    });
    if (verdict.reasons.length > 0) {
      // 新值不过准入：驳回本次更正，原放行保持有效（不提前失效、不搬灯管）
      const err = httpError(422, "recalc_rejected",
        `按新值重算未过准入：${verdict.reasons.map((r) => reasonText(r.code, r)).join("；")}`);
      err.reasons = reasonsView(verdict.reasons);
      throw err;
    }

    const now = new Date().toISOString();
    const correctedBy = String(input.correctedBy || "").trim() || "值班员";
    // 旧记录只读冻结
    old.status = "已失效";
    old.supersededAt = now;
    const version = {
      id: rid("V"), v: order.versions.length + 1,
      lampId: verdict.lamp.id, lampCode: verdict.lamp.code,
      irradiance: Number(newIrradianceInput), lightOnAt: String(newLightOnInput),
      decidedAt: now, decidedBy: correctedBy,
      result: "放行", reasons: [],
      correctionOf: old.id, changes,
    };
    order.versions.push(version);
    order.currentVersionId = version.id;

    appendLedger(db, {
      lampId: old.lampId, lampCode: old.lampCode,
      type: "放行失效",
      detail: `曝光单 ${order.code} 更正${changes.join("、")}，旧放行（V${old.v}）只读失效${old.lampId === verdict.lamp.id ? "" : "，灯管释放"}`,
      orderId: order.id, occupied: false,
    });
    appendLedger(db, {
      lampId: verdict.lamp.id, lampCode: verdict.lamp.code,
      type: "更正重算放行",
      detail: `曝光单 ${order.code} 按新值重算放行（V${version.v}），占用灯管`,
      orderId: order.id, occupied: true,
    });
    reconcile(db);
    return { order, version, changes };
  });
}

// ── 换管登记：灯进入待复测；占用中的灯管不得换 ──
export async function replace(lampId, input) {
  return update((db) => {
    const lamp = findLamp(db, lampId);
    if (!lamp) throw httpError(404, "lamp_not_found", "灯管不存在");
    if (lamp.awaitingRetest) throw httpError(409, "already_retesting", "该灯管已在换管复测流程中");
    const busy = db.orders.find((o) =>
      o.status === ORDER_STATUS.ACTIVE && currentVersion(o) && currentVersion(o).lampId === lamp.id);
    if (busy) throw httpError(409, "lamp_busy", `灯管有未完成曝光 ${busy.code}，不得换管`);

    const tubeNoNew = String(input.tubeNoNew || "").trim();
    if (!tubeNoNew) throw httpError(400, "tube_required", "请填写新管编号");
    const now = new Date().toISOString();
    lamp.awaitingRetest = true;
    lamp.status = "待复测";
    const retest = {
      id: rid("RT"), lampId: lamp.id, lampCode: lamp.code,
      tubeNoOld: lamp.tubeNo, tubeNoNew,
      stage: "待一次复测", createdAt: now, closedAt: null,
      first: null, second: null,
    };
    db.retests.push(retest);
    appendLedger(db, {
      lampId: lamp.id, lampCode: lamp.code,
      type: "换管登记",
      detail: `${lamp.tubeNo} 换为 ${tubeNoNew}，进入换管复测；累计 ${lamp.cumulativeHours}h 待归零`,
      occupied: false,
    });
    return { lamp, retest };
  });
}

function openRetest(db, lamp) {
  return db.retests.find((r) => r.lampId === lamp.id && !r.closedAt) || null;
}

// ── 第一次复测读数 ──
export async function retestFirst(lampId, input) {
  return update((db) => {
    const lamp = findLamp(db, lampId);
    if (!lamp) throw httpError(404, "lamp_not_found", "灯管不存在");
    if (!lamp.awaitingRetest) throw httpError(409, "not_retesting", "该灯管不在换管复测流程中");
    const at = String(input.at || "").trim();
    const by = String(input.by || "").trim();
    const irradiance = Number(input.irradiance);
    if (!at || !Number.isFinite(Date.parse(at))) throw httpError(400, "bad_at", "请选择复测时刻");
    if (!by) throw httpError(400, "bad_by", "请填写复测人");
    if (!Number.isFinite(irradiance) || irradiance <= 0) throw httpError(400, "bad_irradiance", "辐照数值无效");

    let retest = openRetest(db, lamp);
    if (!retest) {
      retest = { id: rid("RT"), lampId: lamp.id, lampCode: lamp.code,
        tubeNoOld: lamp.tubeNo, tubeNoNew: lamp.tubeNo, stage: "待一次复测",
        createdAt: new Date().toISOString(), closedAt: null, first: null, second: null };
      db.retests.push(retest);
    }
    if (retest.second) throw httpError(409, "retest_closed", "该灯管复测流程已结束");

    const ok = irradiance >= Number(lamp.targetIrradiance);
    retest.first = { at, by, irradiance, ok };
    retest.second = null;
    retest.stage = ok ? "一次达标，待十五分钟后二次复测" : "一次未达标，可重测";
    appendLedger(db, {
      lampId: lamp.id, lampCode: lamp.code,
      type: "复测一次",
      detail: `${by} 读数 ${irradiance} mW/cm²，${ok ? "达标" : `未达 ${lamp.targetIrradiance}`}`,
      occupied: false,
    });
    return { retest, ok };
  });
}

// ── 第二次复测：必须另一人、间隔 ≥15 分钟、再次达标，才放行并归零 ──
export async function retestSecond(lampId, input) {
  return update((db) => {
    const lamp = findLamp(db, lampId);
    if (!lamp) throw httpError(404, "lamp_not_found", "灯管不存在");
    if (!lamp.awaitingRetest) throw httpError(409, "not_retesting", "该灯管不在换管复测流程中");
    const retest = openRetest(db, lamp);
    if (!retest || !retest.first || !retest.first.ok) {
      throw httpError(409, "need_first", "第一次复测尚未达标，不能做第二次");
    }
    const at = String(input.at || "").trim();
    const by = String(input.by || "").trim();
    const irradiance = Number(input.irradiance);
    if (!at || !Number.isFinite(Date.parse(at))) throw httpError(400, "bad_at", "请选择复测时刻");
    if (!by) throw httpError(400, "bad_by", "请填写复测人");
    if (!Number.isFinite(irradiance) || irradiance <= 0) throw httpError(400, "bad_irradiance", "辐照数值无效");

    if (by === retest.first.by) throw httpError(400, "same_person", reasonText("same_person"));
    const gap = Date.parse(at) - Date.parse(retest.first.at);
    if (gap < RETEST_GAP_MS) {
      const waitMinutes = Math.ceil((RETEST_GAP_MS - gap) / 60000);
      throw httpError(400, "too_soon", reasonText("too_soon", { waitMinutes }));
    }
    const ok = irradiance >= Number(lamp.targetIrradiance);
    if (!ok) {
      retest.second = { at, by, irradiance, ok };
      retest.stage = "二次未达标，需重新复测";
      appendLedger(db, {
        lampId: lamp.id, lampCode: lamp.code,
        type: "复测二次驳回",
        detail: `${by} 读数 ${irradiance} mW/cm²，未达 ${lamp.targetIrradiance}，不放行`,
        occupied: false,
      });
      return { retest, ok: false, passed: false };
    }

    const now = new Date().toISOString();
    retest.second = { at, by, irradiance, ok };
    retest.stage = "两次达标放行";
    retest.closedAt = now;
    lamp.awaitingRetest = false;
    lamp.cumulativeHours = 0;
    appendLedger(db, {
      lampId: lamp.id, lampCode: lamp.code,
      type: "复测放行",
      detail: `${retest.first.by} 与 ${by} 间隔 15 分钟以上连续两次达标（${retest.first.irradiance}、${irradiance} mW/cm²），换管复测放行，累计时长归零`,
      occupied: false,
    });
    reconcile(db);
    return { retest, ok: true, passed: true };
  });
}
