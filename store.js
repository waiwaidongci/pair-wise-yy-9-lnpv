import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "data", "exposure-lamp-console.json");

// 初始台账：一号可用、二号达寿限、三号校准过期、四号被一张未完成曝光单占用
const seed = {
  lamps: [
    {
      id: "L-UV-01",
      code: "UV-01",
      name: "一号灯管",
      tubeNo: "T-3101",
      cumulativeHours: 126.5,
      calibrationExpireAt: "2027-06-30",
      targetIrradiance: 10,
      awaitingRetest: false,
      status: "空闲",
    },
    {
      id: "L-UV-02",
      code: "UV-02",
      name: "二号灯管",
      tubeNo: "T-3102",
      cumulativeHours: 803.5,
      calibrationExpireAt: "2027-01-31",
      targetIrradiance: 10,
      awaitingRetest: false,
      status: "空闲",
    },
    {
      id: "L-UV-03",
      code: "UV-03",
      name: "三号灯管",
      tubeNo: "T-3103",
      cumulativeHours: 210,
      calibrationExpireAt: "2026-03-01",
      targetIrradiance: 10,
      awaitingRetest: false,
      status: "空闲",
    },
    {
      id: "L-UV-04",
      code: "UV-04",
      name: "四号灯管",
      tubeNo: "T-3104",
      cumulativeHours: 542,
      calibrationExpireAt: "2027-09-30",
      targetIrradiance: 10,
      awaitingRetest: false,
      status: "占用",
    },
  ],
  orders: [
    {
      id: "EX-SEED-01",
      code: "CN-20260920-07",
      plateSize: "18x24cm",
      chemicalBatch: "B-0620",
      requiredMinutes: 12,
      minIrradiance: 9,
      note: "阴天补时的长曝单",
      status: "已放行",
      createdAt: "2026-09-23T08:10:00+08:00",
      versions: [
        {
          id: "V-SEED-01",
          v: 1,
          lampId: "L-UV-04",
          lampCode: "UV-04",
          irradiance: 11.2,
          lightOnAt: "2026-09-23T09:30",
          decidedAt: "2026-09-23T09:28:00+08:00",
          decidedBy: "周师傅",
          result: "放行",
          reasons: [],
        },
      ],
      currentVersionId: "V-SEED-01",
      completion: null,
      archivedAt: null,
    },
    {
      id: "EX-SEED-02",
      code: "CN-20260923-01",
      plateSize: "12x17cm",
      chemicalBatch: "B-0901",
      requiredMinutes: 8,
      minIrradiance: 9,
      note: "待判定入口样例",
      status: "待判定",
      createdAt: "2026-09-23T10:05:00+08:00",
      versions: [],
      currentVersionId: null,
      completion: null,
      archivedAt: null,
    },
  ],
  retests: [],
  ledger: [
    { id: "E-SEED-1", at: "2026-01-05T09:00:00+08:00", lampId: "L-UV-01", lampCode: "UV-01", type: "建档", detail: "灯管建档 T-3101", occupied: false },
    { id: "E-SEED-2", at: "2026-01-05T09:00:00+08:00", lampId: "L-UV-02", lampCode: "UV-02", type: "建档", detail: "灯管建档 T-3102", occupied: false },
    { id: "E-SEED-3", at: "2026-01-05T09:00:00+08:00", lampId: "L-UV-03", lampCode: "UV-03", type: "建档", detail: "灯管建档 T-3103", occupied: false },
    { id: "E-SEED-4", at: "2026-01-05T09:00:00+08:00", lampId: "L-UV-04", lampCode: "UV-04", type: "建档", detail: "灯管建档 T-3104", occupied: false },
    { id: "E-SEED-5", at: "2026-09-23T09:28:00+08:00", lampId: "L-UV-04", lampCode: "UV-04", type: "准入放行", detail: "曝光单 CN-20260920-07 判定放行，占用灯管（12 分钟）", orderId: "EX-SEED-01", occupied: true },
  ],
};

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
  }
  return JSON.parse(await readFile(dbPath, "utf8"));
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

// 所有写操作串行化，避免两张曝光单并发抢到同一根灯管。
// 单次事务失败（如准入拒绝）只 reject 给调用方，绝不能毒化后续事务链。
let chain = Promise.resolve();
export function update(mutator) {
  const run = chain.then(async () => {
    const db = await loadDb();
    const result = await mutator(db);
    await saveDb(db);
    return result;
  });
  chain = run.then(() => {}, () => {});
  return run;
}

export async function read() {
  return loadDb();
}
