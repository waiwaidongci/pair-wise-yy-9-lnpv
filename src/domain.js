// 曝光灯管寿命与辐照准入台 —— 核心业务规则（纯逻辑，可直接单测）
// 入口、判定、存档三个业务模块共用这一份状态与规则。

export const LAMP_LIFE_LIMIT_HOURS = 800; // 累计寿命上限
export const RETEST_GAP_MINUTES = 15; // 换管复测两次达标最小间隔
const RETEST_GAP_MS = RETEST_GAP_MINUTES * 60 * 1000;

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function createState() {
  return { lamps: [], exposures: [] };
}

function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function toIso(at) {
  if (at === undefined || at === null || at === "") return new Date().toISOString();
  const t = Date.parse(at);
  if (Number.isNaN(t)) throw new DomainError("BAD_TIME", "时间格式无法识别：" + at);
  return new Date(t).toISOString();
}
function num(value, label, { min = 0, allowNull = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (allowNull) return null;
    throw new DomainError("BAD_INPUT", label + "必填");
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new DomainError("BAD_INPUT", label + "不合法");
  return n;
}
function text(value, label) {
  const s = String(value ?? "").trim();
  if (!s) throw new DomainError("BAD_INPUT", label + "必填");
  return s;
}
function record(target, type, detail, at) {
  target.history.push({ at: toIso(at), type, detail: detail ?? {} });
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

export function findLamp(state, idOrCode) {
  const key = String(idOrCode ?? "");
  return state.lamps.find(l => l.id === key || l.code === key) || null;
}
export function findExposure(state, id) {
  return state.exposures.find(e => e.id === id) || null;
}
function lampById(state, id) {
  const lamp = findLamp(state, id);
  if (!lamp) throw new DomainError("LAMP_NOT_FOUND", "灯管不存在：" + id);
  return lamp;
}
function exposureById(state, id) {
  const ex = findExposure(state, id);
  if (!ex) throw new DomainError("EXPOSURE_NOT_FOUND", "曝光工单不存在：" + id);
  return ex;
}
function assertWritable(exposure) {
  if (exposure.frozen) {
    throw new DomainError("RECORD_READONLY", "旧记录已只读封存，不得更改：" + exposure.id);
  }
}

// 灯管当前业务状态：待复测（换管未放行）优先，其次使用中，否则可用。
export function lampStatus(lamp, at = Date.now()) {
  if (lamp.retest && lamp.retest.status === "pending") return "待复测";
  if (lamp.currentExposureId) return "使用中";
  return "可用";
}
export function lampView(lamp) {
  const now = Date.now();
  return {
    ...lamp,
    status: lampStatus(lamp, now),
    lifeLimit: LAMP_LIFE_LIMIT_HOURS,
    calibrationExpired: Date.parse(lamp.calibratedUntil) <= now,
  };
}

// ---------- 入口模块：灯管建档 ----------
export function registerLamp(state, input, at) {
  const code = text(input.code, "灯管编号");
  if (findLamp(state, code)) throw new DomainError("LAMP_DUPLICATED", "灯管编号已存在：" + code);
  const ratedIrradiance = num(input.ratedIrradiance, "额定辐照");
  const irradiance = num(input.irradiance, "当前辐照");
  const totalHours = num(input.totalHours, "累计时长", { allowNull: true }) ?? 0;
  const calibratedUntil = toIso(input.calibratedUntil);
  const lamp = {
    id: uid("L-"),
    code,
    ratedIrradiance,
    irradiance,
    totalHours: round3(totalHours),
    calibratedUntil,
    installedAt: toIso(at),
    currentExposureId: null,
    retest: null,
    history: [],
  };
  record(lamp, "建档", { code, ratedIrradiance, irradiance, totalHours: lamp.totalHours, calibratedUntil }, at);
  state.lamps.push(lamp);
  return lamp;
}

// ---------- 入口模块：曝光准入申请（整单判定） ----------
export function admitExposure(state, input, at = null, extras = {}) {
  const negativeCode = text(input.negativeCode, "底片编号");
  const requiredMinutes = num(input.requiredMinutes, "曝光分钟数", { min: 0.01 });
  const targetIrradiance = num(input.targetIrradiance, "要求辐照");
  const lamp = lampById(state, input.lampId);
  const lightOnAt = toIso(input.lightOnAt ?? at);

  // 占用 / 待复测属于分配冲突：不建单、不占灯管，直接拒绝请求。
  if (lamp.currentExposureId) {
    throw new DomainError("LAMP_BUSY", "灯管「" + lamp.code + "」尚有未完成曝光，不得再分配");
  }
  if (lamp.retest && lamp.retest.status === "pending") {
    throw new DomainError("LAMP_RETEST_PENDING", "灯管「" + lamp.code + "」换管复测未放行，暂不可用");
  }
  const reasons = evaluateLampReasons(lamp, targetIrradiance);

  const exposure = {
    id: uid("EX-"),
    negativeCode,
    lampId: lamp.id,
    lampCode: lamp.code,
    requiredMinutes,
    targetIrradiance,
    lightOnAt,
    status: reasons.length ? "已拒绝" : "已放行",
    reason: reasons.length ? reasons.join("；") : "",
    revisionOf: extras.revisionOf || null,
    frozen: false,
    admittedAt: toIso(at),
    history: [],
  };
  record(exposure, "准入申请", {
    lampCode: lamp.code,
    requiredMinutes,
    targetIrradiance,
    lightOnAt,
    result: exposure.status,
    reason: exposure.reason,
    revisionOf: exposure.revisionOf,
  }, at);

  if (reasons.length) {
    // 整单拒绝：只留拒绝履历，不占用灯管。
    record(lamp, "准入拒绝（未占管）", { exposureId: exposure.id, negativeCode, reason: exposure.reason }, at);
    state.exposures.unshift(exposure);
    return exposure;
  }

  lamp.currentExposureId = exposure.id;
  record(lamp, "分配曝光", { exposureId: exposure.id, negativeCode, lightOnAt }, at);
  state.exposures.unshift(exposure);
  return exposure;
}
// 占用/复测检查与三项硬判定拆开，冲突直接抛错。
function evaluateLampReasons(lamp, targetIrradiance) {
  const reasons = [];
  if (lamp.totalHours >= LAMP_LIFE_LIMIT_HOURS) {
    reasons.push("累计光照已达 " + lamp.totalHours + " 小时（上限 " + LAMP_LIFE_LIMIT_HOURS + " 小时）");
  }
  if (Date.parse(lamp.calibratedUntil) <= Date.now()) {
    reasons.push("校准已过期（有效期至 " + lamp.calibratedUntil + "）");
  }
  if (lamp.irradiance < targetIrradiance) {
    reasons.push("辐照不足：灯管 " + lamp.irradiance + " mW/cm²，低于要求 " + targetIrradiance + " mW/cm²");
  }
  return reasons;
}

// ---------- 判定模块：完成曝光，释放灯管并累计时长 ----------
export function completeExposure(state, id, at) {
  const ex = exposureById(state, id);
  assertWritable(ex);
  if (ex.status !== "已放行") throw new DomainError("INVALID_STATE", "仅已放行曝光可完成，当前：" + ex.status);
  const lamp = lampById(state, ex.lampId);
  const added = round3(ex.requiredMinutes / 60);
  lamp.totalHours = round3(lamp.totalHours + added);
  lamp.currentExposureId = null;
  ex.status = "已曝光";
  record(ex, "曝光完成", { minutes: ex.requiredMinutes, hoursAdded: added }, at);
  record(lamp, "曝光完成收管", { exposureId: ex.id, hoursAdded: added, totalHours: lamp.totalHours }, at);
  return ex;
}

// ---------- 判定模块：换管（累计时长归零，进入待复测） ----------
export function replaceLamp(state, id, input, at) {
  const lamp = lampById(state, id);
  const replacedBy = text(input.replacedBy, "换管人");
  if (lamp.currentExposureId) {
    throw new DomainError("LAMP_BUSY", "灯管仍有未完成曝光，不能换管");
  }
  const irradiance = num(input.irradiance, "新管辐照");
  const ratedIrradiance = num(input.ratedIrradiance, "额定辐照", { allowNull: true }) ?? lamp.ratedIrradiance;
  const calibratedUntil = toIso(input.calibratedUntil);
  const previousHours = lamp.totalHours;

  lamp.ratedIrradiance = ratedIrradiance;
  lamp.irradiance = irradiance;
  lamp.totalHours = 0; // 换管后累计时长归零
  lamp.calibratedUntil = calibratedUntil;
  lamp.retest = { replacedBy, readings: [], streak: [], status: "pending", replacedAt: toIso(at) };
  record(lamp, "换管", { replacedBy, previousHours, irradiance, ratedIrradiance, calibratedUntil }, at);
  return lamp;
}

// ---------- 判定模块：换管复测 ----------
// 另一人（非换管人）隔 15 分钟连续两次达标，才放行；任一次不达标连续次数清零。
export function submitRetest(state, id, input, at) {
  const lamp = lampById(state, id);
  const inspector = text(input.inspector, "复测人");
  const measured = num(input.measuredIrradiance, "实测辐照");
  const time = Date.parse(toIso(at));
  if (!lamp.retest || lamp.retest.status !== "pending") {
    throw new DomainError("RETEST_NOT_PENDING", "灯管不在待复测状态");
  }
  const r = lamp.retest;
  if (inspector === r.replacedBy) {
    throw new DomainError("RETEST_SAME_INSPECTOR", "复测须由换管人以外的另一人执行（换管人：" + r.replacedBy + "）");
  }
  const pass = measured >= lamp.ratedIrradiance;
  const reading = { inspector, measuredIrradiance: measured, at: new Date(time).toISOString(), pass };
  r.readings.push(reading);
  record(lamp, "复测读数", reading, at);

  if (!pass) {
    r.streak = [];
    return { released: false, lamp, reason: "实测未达标，连续达标次数清零" };
  }
  if (r.streak.length === 0) {
    r.streak.push(reading);
    return {
      released: false,
      lamp,
      reason: "首次达标，须由另一人在 15 分钟后复测第二次",
      nextAfter: new Date(time + RETEST_GAP_MS).toISOString(),
    };
  }
  const first = r.streak[0];
  const gap = time - Date.parse(first.at);
  if (gap < RETEST_GAP_MS) {
    throw new DomainError("RETEST_TOO_SOON", "两次复测间隔不足 15 分钟（还差 " + Math.ceil((RETEST_GAP_MS - gap) / 60000) + " 分钟）");
  }
  r.streak.push(reading);
  r.status = "passed";
  r.releasedAt = reading.at;
  lamp.retest = r;
  record(lamp, "复测放行", { readings: r.readings.length, releasedBy: inspector }, at);
  return { released: true, lamp };
}

// ---------- 判定模块：更正灯管 / 辐照 / 开灯时刻 ----------
// 已放行曝光一旦更正即失效并冻结为只读旧记录，按新值重新准入判定。
export function correctExposure(state, id, patch, at) {
  const ex = exposureById(state, id);
  assertWritable(ex);
  if (ex.status !== "已放行") {
    throw new DomainError("INVALID_STATE", "仅已放行曝光可更正，当前：" + ex.status);
  }
  const nextLampId = patch.lampId ? text(patch.lampId, "灯管") : ex.lampId;
  const nextLamp = lampById(state, nextLampId);
  const nextIrradiance = patch.targetIrradiance !== undefined && patch.targetIrradiance !== ""
    ? num(patch.targetIrradiance, "要求辐照")
    : ex.targetIrradiance;
  const nextLightOnAt = patch.lightOnAt ? toIso(patch.lightOnAt) : ex.lightOnAt;

  // 先做分配冲突预检（占用/待复测），避免旧单失效后新单无处可去。
  if (nextLamp.currentExposureId && nextLamp.currentExposureId !== ex.id) {
    throw new DomainError("LAMP_BUSY", "灯管「" + nextLamp.code + "」尚有未完成曝光，不得再分配");
  }
  if (nextLamp.retest && nextLamp.retest.status === "pending") {
    throw new DomainError("LAMP_RETEST_PENDING", "灯管「" + nextLamp.code + "」换管复测未放行，暂不可用");
  }

  // 旧记录失效、冻结、只读，并让出原灯管。
  const oldLamp = lampById(state, ex.lampId);
  if (oldLamp.currentExposureId === ex.id) oldLamp.currentExposureId = null;
  ex.status = "已失效";
  ex.frozen = true;
  record(ex, "更正失效（旧记录只读）", {
    lampCode: nextLamp.code,
    targetIrradiance: nextIrradiance,
    lightOnAt: nextLightOnAt,
  }, at);
  record(oldLamp, "曝光更正释放", { exposureId: ex.id }, at);

  // 按新值重算：可能再次放行，也可能整单拒绝（同样不占灯管）。
  const fresh = admitExposure(state, {
    negativeCode: ex.negativeCode,
    lampId: nextLamp.id,
    requiredMinutes: ex.requiredMinutes,
    targetIrradiance: nextIrradiance,
    lightOnAt: nextLightOnAt,
  }, at, { revisionOf: ex.id });
  return { old: ex, fresh };
}

// ---------- 存档模块：归档只读 ----------
const ARCHIVABLE = new Set(["已曝光", "已拒绝", "已失效"]);
export function archiveExposure(state, id, at) {
  const ex = exposureById(state, id);
  assertWritable(ex);
  if (!ARCHIVABLE.has(ex.status)) {
    throw new DomainError("INVALID_STATE", "当前状态不可归档：" + ex.status);
  }
  ex.status = "已存档";
  ex.frozen = true;
  ex.archivedAt = toIso(at);
  record(ex, "归档", {}, at);
  const lamp = findLamp(state, ex.lampId);
  if (lamp) record(lamp, "工单归档", { exposureId: ex.id, negativeCode: ex.negativeCode }, at);
  return ex;
}

// ---------- 列表与履历：同一份状态派生，刷新后必然一致 ----------
export function listView(state) {
  const lampIndex = new Map(state.lamps.map(l => [l.id, lampView(l)]));
  return {
    lamps: [...lampIndex.values()],
    exposures: state.exposures.map(e => ({
      ...e,
      lampStatus: lampIndex.get(e.lampId)?.status || "灯管缺失",
    })),
  };
}
export function lampHistory(state, idOrCode) {
  const lamp = lampById(state, idOrCode);
  return { id: lamp.id, code: lamp.code, totalHours: lamp.totalHours, history: lamp.history };
}
