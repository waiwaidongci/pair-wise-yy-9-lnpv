// 持久化层：三个业务模块读写同一份 JSON 状态，保证刷新后列表与履历一致。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createState } from "./domain.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "..", "data", "exposure-lamp-bench.json");

// 演示用初始数据：一根可用灯管、一根临近寿命灯管、一根待复测灯管。
function seedState() {
  const state = createState();
  const iso = (d) => new Date(d).toISOString();
  const future = iso(Date.now() + 365 * 86400000);
  const past = iso(Date.now() - 86400000);
  state.lamps.push(
    {
      id: "L-seed01",
      code: "UV-A01",
      ratedIrradiance: 8.0,
      irradiance: 8.6,
      totalHours: 312.5,
      calibratedUntil: future,
      installedAt: iso(Date.now() - 200 * 86400000),
      currentExposureId: null,
      retest: null,
      history: [{ at: iso(Date.now() - 200 * 86400000), type: "建档", detail: { code: "UV-A01" } }],
    },
    {
      id: "L-seed02",
      code: "UV-A02",
      ratedIrradiance: 8.0,
      irradiance: 6.1,
      totalHours: 798.0,
      calibratedUntil: past,
      installedAt: iso(Date.now() - 400 * 86400000),
      currentExposureId: null,
      retest: null,
      history: [{ at: iso(Date.now() - 400 * 86400000), type: "建档", detail: { code: "UV-A02" } }],
    },
    {
      id: "L-seed03",
      code: "UV-B01",
      ratedIrradiance: 9.0,
      irradiance: 9.4,
      totalHours: 0,
      calibratedUntil: future,
      installedAt: iso(Date.now() - 2 * 86400000),
      currentExposureId: null,
      retest: { replacedBy: "周师傅", readings: [], streak: [], status: "pending", replacedAt: iso(Date.now() - 2 * 86400000) },
      history: [{ at: iso(Date.now() - 2 * 86400000), type: "换管", detail: { replacedBy: "周师傅", previousHours: 812 } }],
    }
  );
  return state;
}

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seedState(), null, 2));
  }
  const raw = JSON.parse(await readFile(dbPath, "utf8"));
  if (!Array.isArray(raw.lamps) || !Array.isArray(raw.exposures)) {
    throw new Error("数据文件缺少 lamps/exposures 结构");
  }
  return raw;
}
export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}
