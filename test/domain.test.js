import test from "node:test";
import assert from "node:assert/strict";
import {
  createState, registerLamp, admitExposure, completeExposure,
  replaceLamp, submitRetest, correctExposure, archiveExposure,
  listView, lampHistory, lampStatus, DomainError,
  LAMP_LIFE_LIMIT_HOURS,
} from "../src/domain.js";

const T0 = "2026-09-23T08:00:00.000Z";
const T = (mins) => new Date(Date.parse(T0) + mins * 60000).toISOString();
const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const past = (days) => new Date(Date.now() - days * 86400000).toISOString();

function makeLamp(state, overrides = {}) {
  return registerLamp(state, {
    code: overrides.code || "UV-T1",
    ratedIrradiance: overrides.ratedIrradiance ?? 8,
    irradiance: overrides.irradiance ?? 9,
    totalHours: overrides.totalHours ?? 0,
    calibratedUntil: overrides.calibratedUntil ?? future(30),
  }, overrides.at || T0);
}
function admit(state, lamp, overrides = {}) {
  return admitExposure(state, {
    negativeCode: overrides.negativeCode || "CN-1",
    lampId: lamp.id,
    requiredMinutes: overrides.requiredMinutes ?? 60,
    targetIrradiance: overrides.targetIrradiance ?? 7,
    lightOnAt: overrides.lightOnAt ?? T(0),
  }, overrides.at || T(0));
}
function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof DomainError, "期望 DomainError，实际：" + err);
    return err.code;
  }
  assert.fail("期望抛出 DomainError，但没有抛出");
}

test("同一灯管未完成曝光前不得再分配", () => {
  const s = createState();
  const lamp = makeLamp(s);
  const ex = admit(s, lamp, { negativeCode: "CN-1" });
  assert.equal(ex.status, "已放行");
  assert.equal(lamp.currentExposureId, ex.id);

  const err = codeOf(() => admit(s, lamp, { negativeCode: "CN-2" }));
  assert.equal(err, "LAMP_BUSY");
  // 冲突不建单：只有 CN-1 一张单
  assert.equal(s.exposures.length, 1);
  // 完成后才能再分配
  completeExposure(s, ex.id, T(60));
  const ex2 = admit(s, lamp, { negativeCode: "CN-2" });
  assert.equal(ex2.status, "已放行");
});

test("累计八百小时：整单拒绝且不占灯管", () => {
  const s = createState();
  const lamp = makeLamp(s, { totalHours: LAMP_LIFE_LIMIT_HOURS });
  const ex = admit(s, lamp, { targetIrradiance: 1 });
  assert.equal(ex.status, "已拒绝");
  assert.match(ex.reason, /800/);
  assert.equal(lamp.currentExposureId, null, "拒绝不得占用灯管");
});

test("校准过期：整单拒绝且不占灯管", () => {
  const s = createState();
  const lamp = makeLamp(s, { calibratedUntil: past(1), totalHours: 0 });
  const ex = admit(s, lamp, { targetIrradiance: 1 });
  assert.equal(ex.status, "已拒绝");
  assert.match(ex.reason, /校准已过期/);
  assert.equal(lamp.currentExposureId, null);
});

test("辐照不足：整单拒绝且不占灯管", () => {
  const s = createState();
  const lamp = makeLamp(s, { irradiance: 6 });
  const ex = admit(s, lamp, { targetIrradiance: 8 });
  assert.equal(ex.status, "已拒绝");
  assert.match(ex.reason, /辐照不足/);
  assert.equal(lamp.currentExposureId, null);
});

test("三项同时不达标时原因全部列出", () => {
  const s = createState();
  const lamp = makeLamp(s, { totalHours: 800, calibratedUntil: past(2), irradiance: 4 });
  const ex = admit(s, lamp, { targetIrradiance: 9 });
  assert.equal(ex.status, "已拒绝");
  assert.match(ex.reason, /800/);
  assert.match(ex.reason, /校准已过期/);
  assert.match(ex.reason, /辐照不足/);
  assert.equal(lamp.currentExposureId, null);
});

test("完成曝光累计时长并释放灯管", () => {
  const s = createState();
  const lamp = makeLamp(s, { totalHours: 10 });
  const ex = admit(s, lamp, { requiredMinutes: 90 });
  completeExposure(s, ex.id, T(90));
  assert.equal(lamp.totalHours, 11.5);
  assert.equal(lamp.currentExposureId, null);
  assert.equal(ex.status, "已曝光");
});

test("换管：累计时长归零且进入待复测，期间不可准入", () => {
  const s = createState();
  const lamp = makeLamp(s, { totalHours: 799 });
  replaceLamp(s, lamp.id, { replacedBy: "周师傅", irradiance: 9.2, calibratedUntil: future(180) }, T(0));
  assert.equal(lamp.totalHours, 0);
  assert.equal(lampStatus(lamp), "待复测");
  assert.equal(
    codeOf(() => admit(s, lamp, {})),
    "LAMP_RETEST_PENDING"
  );
  assert.equal(s.exposures.length, 0, "待复测不建单");
});

test("换管复测：另一人隔十五分钟连续两次达标才放行", () => {
  const s = createState();
  const lamp = makeLamp(s);
  replaceLamp(s, lamp.id, { replacedBy: "周师傅", irradiance: 9.2, calibratedUntil: future(180) }, T(0));

  // 换管人本人复测不行
  assert.equal(
    codeOf(() => submitRetest(s, lamp.id, { inspector: "周师傅", measuredIrradiance: 9.5 }, T(5))),
    "RETEST_SAME_INSPECTOR"
  );

  // 第一次达标（另一人）
  let r1 = submitRetest(s, lamp.id, { inspector: "林姐", measuredIrradiance: 9.5 }, T(5));
  assert.equal(r1.released, false);
  assert.equal(lampStatus(lamp), "待复测");

  // 间隔不足 15 分钟不放行
  assert.equal(
    codeOf(() => submitRetest(s, lamp.id, { inspector: "林姐", measuredIrradiance: 9.5 }, T(19))),
    "RETEST_TOO_SOON"
  );

  // 满 15 分钟第二次达标 → 放行
  let r2 = submitRetest(s, lamp.id, { inspector: "林姐", measuredIrradiance: 9.6 }, T(20));
  assert.equal(r2.released, true);
  assert.equal(lampStatus(lamp), "可用");
  assert.equal(lamp.retest.status, "passed");
  assert.equal(lamp.totalHours, 0);

  // 放行后可正常准入
  const ex = admit(s, lamp, {});
  assert.equal(ex.status, "已放行");
});

test("复测任一次不达标，连续次数清零需重来", () => {
  const s = createState();
  const lamp = makeLamp(s);
  replaceLamp(s, lamp.id, { replacedBy: "甲", irradiance: 9.2, calibratedUntil: future(30) }, T(0));
  submitRetest(s, lamp.id, { inspector: "乙", measuredIrradiance: 9.5 }, T(1));
  const r = submitRetest(s, lamp.id, { inspector: "乙", measuredIrradiance: 7.9 }, T(20));
  assert.equal(r.released, false);
  assert.equal(lamp.retest.streak.length, 0);
  assert.equal(lampStatus(lamp), "待复测");
});

test("更正要求辐照：旧单失效只读并按新值重算（新值不达标则拒绝）", () => {
  const s = createState();
  const lamp = makeLamp(s, { irradiance: 8.5 });
  const ex = admit(s, lamp, { targetIrradiance: 8 });
  assert.equal(ex.status, "已放行");
  assert.equal(lamp.currentExposureId, ex.id);

  const { old, fresh } = correctExposure(s, ex.id, { targetIrradiance: 9 }, T(30));
  assert.equal(old.status, "已失效");
  assert.equal(old.frozen, true);
  assert.equal(fresh.status, "已拒绝");
  assert.match(fresh.reason, /辐照不足/);
  assert.equal(lamp.currentExposureId, null, "重算拒绝后不占灯管");
  assert.equal(fresh.revisionOf, old.id);

  // 旧记录只读：完成/再更正/归档均拒绝
  assert.equal(
    codeOf(() => completeExposure(s, old.id, T(40))),
    "RECORD_READONLY"
  );
  assert.equal(
    codeOf(() => correctExposure(s, old.id, { targetIrradiance: 5 }, T(40))),
    "RECORD_READONLY"
  );
  assert.equal(
    codeOf(() => archiveExposure(s, old.id, T(40))),
    "RECORD_READONLY"
  );
});

test("更正灯管：换到合格灯管则重新放行并占用新管", () => {
  const s = createState();
  const a = makeLamp(s, { code: "UV-A", irradiance: 8.5 });
  const b = makeLamp(s, { code: "UV-B", irradiance: 9.5 });
  const ex = admit(s, a, { targetIrradiance: 8 });
  assert.equal(a.currentExposureId, ex.id);

  const { old, fresh } = correctExposure(s, ex.id, { lampId: b.id }, T(10));
  assert.equal(old.status, "已失效");
  assert.equal(a.currentExposureId, null, "原灯管释放");
  assert.equal(fresh.status, "已放行");
  assert.equal(b.currentExposureId, fresh.id, "新灯管被占用");
});

test("更正目标灯管被占用时冲突驳回，旧单仍有效", () => {
  const s = createState();
  const a = makeLamp(s, { code: "UV-A" });
  const b = makeLamp(s, { code: "UV-B" });
  const exA = admit(s, a, { negativeCode: "CN-A" });
  const exB = admit(s, b, { negativeCode: "CN-B" });
  assert.equal(
    codeOf(() => correctExposure(s, exA.id, { lampId: b.id }, T(10))),
    "LAMP_BUSY"
  );
  // 旧单未被破坏
  assert.equal(exA.status, "已放行");
  assert.equal(a.currentExposureId, exA.id);
  assert.equal(b.currentExposureId, exB.id);
});

test("更正开灯时刻：按新时刻重算，旧单只读", () => {
  const s = createState();
  const lamp = makeLamp(s);
  const ex = admit(s, lamp, { lightOnAt: T(0) });
  const { old, fresh } = correctExposure(s, ex.id, { lightOnAt: T(120) }, T(10));
  assert.equal(old.status, "已失效");
  assert.equal(fresh.lightOnAt, T(120));
  assert.equal(fresh.status, "已放行");
  assert.equal(lamp.currentExposureId, fresh.id);
});

test("归档后只读", () => {
  const s = createState();
  const lamp = makeLamp(s);
  const ex = admit(s, lamp, {});
  completeExposure(s, ex.id, T(60));
  archiveExposure(s, ex.id, T(70));
  assert.equal(ex.status, "已存档");
  assert.equal(ex.frozen, true);
  assert.equal(
    codeOf(() => archiveExposure(s, ex.id, T(80))),
    "RECORD_READONLY"
  );
  assert.equal(
    codeOf(() => correctExposure(s, ex.id, { targetIrradiance: 1 }, T(80))),
    "RECORD_READONLY"
  );
});

test("已拒绝工单可直接归档，已放行不可归档", () => {
  const s = createState();
  const bad = makeLamp(s, { code: "UV-R", irradiance: 3 });
  const rejected = admit(s, bad, { targetIrradiance: 9 });
  assert.doesNotThrow(() => archiveExposure(s, rejected.id, T(5)));

  const good = makeLamp(s, { code: "UV-G" });
  const running = admit(s, good, {});
  assert.equal(
    codeOf(() => archiveExposure(s, running.id, T(5))),
    "INVALID_STATE"
  );
});

test("列表与灯管履历由同一状态派生，刷新后一致", () => {
  const s = createState();
  const lamp = makeLamp(s, { totalHours: 10 });
  const ex = admit(s, lamp, { requiredMinutes: 60 });
  completeExposure(s, ex.id, T(60));

  const v1 = listView(s);
  const h1 = lampHistory(s, lamp.id);
  assert.equal(v1.lamps[0].totalHours, h1.totalHours);
  // 履历包含建档、分配、拒绝/完成等事件
  const types = h1.history.map(h => h.type);
  assert.ok(types.includes("建档"));
  assert.ok(types.includes("分配曝光"));
  assert.ok(types.some(t => t.includes("曝光完成")));
  // 再次派生结果一致（纯函数，无副作用）
  const v2 = listView(s);
  assert.deepEqual(v2.lamps.map(l => l.totalHours), v1.lamps.map(l => l.totalHours));
});

test("拒绝工单同样写入灯管履历（标注未占管）", () => {
  const s = createState();
  const lamp = makeLamp(s, { irradiance: 3 });
  admit(s, lamp, { targetIrradiance: 9 });
  const h = lampHistory(s, lamp.id);
  assert.ok(h.history.some(x => x.type === "准入拒绝（未占管）"));
});
