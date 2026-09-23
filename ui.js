// 三业务模块页面：入口 / 判定 / 存档；顶部灯管看板与所有列表同源刷新。

export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>曝光灯管寿命与辐照准入台</title>
  <style>
    :root { --bg:#eef1ea; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d2dccd; --accent:#3f6b38; --accent2:#5b7c55; --warn:#9b3f2e; --blue:#35597d; --gold:#8a6d1f; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif; }
    header { padding:18px 26px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
    h1 { margin:0; font-size:22px; } h2 { margin:0 0 10px; font-size:16px; } h3 { margin:0; font-size:15px; }
    .meta { color:var(--muted); font-size:12.5px; }
    main { padding:18px 26px 40px; }
    .panel, form, .card, .lamp { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
    .cols { display:grid; grid-template-columns:380px 1fr; gap:16px; align-items:start; }
    .col2 { display:grid; gap:14px; }
    label { display:block; margin:8px 0 4px; color:var(--muted); font-size:12.5px; }
    input, select { width:100%; border:1px solid var(--line); border-radius:6px; padding:8px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:8px 12px; font-weight:700; cursor:pointer; margin-top:10px; }
    button.sec { background:var(--accent2); } button.blue { background:var(--blue); } button.gold { background:var(--gold); } button.danger { background:var(--warn); } button.small { padding:5px 9px; font-size:12px; margin-top:6px; }
    nav { display:flex; gap:8px; }
    nav button { background:#dde5d8; color:var(--ink); margin:0; }
    nav button.on { background:var(--accent); color:#fff; }
    .lamps { display:grid; grid-template-columns:repeat(auto-fill,minmax(215px,1fr)); gap:10px; margin-bottom:16px; }
    .lamp { display:grid; gap:4px; cursor:pointer; }
    .lamp.bad { border-color:var(--warn); background:#fbf0ee; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 9px; font-size:11.5px; }
    .pill.green { background:#e7f0e2; border-color:#b9cdb0; }
    .pill.red { background:#f8e5e0; border-color:#d8b0a6; color:var(--warn); }
    .pill.gold { background:#f5eecf; border-color:#d8c890; color:var(--gold); }
    .pill.blue { background:#e3ecf4; border-color:#a9bfd3; color:var(--blue); }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:12px; }
    .card { display:grid; gap:7px; }
    .versions { border-top:1px dashed var(--line); margin-top:6px; padding-top:6px; display:grid; gap:5px; }
    .ver { font-size:12px; border-left:3px solid var(--line); padding:2px 8px; background:#fafcf8; }
    .ver.dead { border-left-color:var(--warn); background:#faf3f2; color:#7a554e; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .row > * { flex:1; min-width:110px; }
    .toast { position:fixed; right:18px; bottom:18px; max-width:380px; display:grid; gap:8px; z-index:9; }
    .toast div { padding:10px 14px; border-radius:8px; color:#fff; font-size:13px; box-shadow:0 4px 14px rgba(0,0,0,.18); }
    .toast .ok { background:var(--accent); } .toast .err { background:var(--warn); }
    .inline { display:none; margin-top:8px; border-top:1px dashed var(--line); padding-top:8px; }
    .inline.open { display:block; }
    table { width:100%; border-collapse:collapse; font-size:12.5px; }
    td, th { border-bottom:1px solid var(--line); padding:6px 8px; text-align:left; vertical-align:top; }
    .hidden { display:none; }
    @media (max-width:960px){ .cols{grid-template-columns:1fr;} main,header{padding-left:14px;padding-right:14px;} }
  </style>
</head>
<body>
<header>
  <div>
    <h1>曝光灯管寿命与辐照准入台</h1>
    <div class="meta">古法蓝晒底片整理室 · 入口登记 → 辐照准入判定 → 完成 / 换管复测 / 存档履历</div>
  </div>
  <nav>
    <button data-tab="intake">① 入口</button>
    <button data-tab="admission">② 判定</button>
    <button data-tab="archive">③ 存档</button>
    <button class="sec" id="reload">刷新</button>
  </nav>
</header>
<main>
  <div class="lamps" id="lampStrip"></div>

  <section id="tab-intake">
    <div class="cols">
      <form id="createForm">
        <h2>入口：登记曝光单</h2>
        <div class="meta">只建档排队，不触碰灯管；判定在「② 判定」进行。</div>
        <label>曝光单编号 *</label><input name="code" required placeholder="如 CN-20260923-02">
        <label>玻璃板尺寸</label><input name="plateSize" placeholder="如 18x24cm">
        <label>药液批次</label><input name="chemicalBatch" placeholder="如 B-0901">
        <div class="row"><div><label>计划曝光（分钟）*</label><input name="requiredMinutes" type="number" min="1" step="1" required></div>
        <div><label>最低辐照（mW/cm²）*</label><input name="minIrradiance" type="number" min="0" step="0.1" required value="9"></div></div>
        <label>备注</label><input name="note">
        <button>提交入口登记</button>
      </form>
      <div class="col2">
        <div class="panel"><h2>待判定队列 <span id="pendingCount" class="pill"></span></h2><div class="grid" id="pendingList"></div></div>
      </div>
    </div>
  </section>

  <section id="tab-admission" class="hidden">
    <div class="col2">
      <div class="panel"><h2>准入判定</h2><div class="meta">同一灯管未完成曝光前不得再分配；累计 800 小时、校准过期或辐照不足时整单拒绝，且不占灯管。</div><div class="grid" id="decideList" style="margin-top:10px"></div></div>
      <div class="panel"><h2>进行中曝光（灯管占用中）</h2><div class="grid" id="activeList" style="margin-top:10px"></div></div>
      <div class="panel"><h2>灯管寿命与换管复测</h2>
        <div class="meta">换管后须由另一人在 ≥15 分钟后连续第二次复测达标，方放行且累计时长归零。</div>
        <div class="grid" id="lampMgmt" style="margin-top:10px"></div>
      </div>
    </div>
  </section>

  <section id="tab-archive" class="hidden">
    <div class="cols">
      <div class="panel"><h2>存档：已完成 / 已拒绝曝光单</h2><div class="meta">旧记录只读；更正前的放行版本以「已失效」冻结留档。</div><div class="grid" id="archivedList" style="margin-top:10px"></div></div>
      <div class="panel"><h2>灯管履历</h2><div id="historyBox"><div class="meta">点击上方任一根灯管查看完整履历。</div></div></div>
    </div>
  </section>
</main>
<div class="toast" id="toast"></div>

<script>
const HOUR_LIMIT = 800;
let state = { lamps: [], orders: [], pending: [], active: [], archived: [], retests: [] };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

async function api(path, options) {
  const res = await fetch(path, options && options.body
    ? { ...options, headers: { 'Content-Type': 'application/json' } } : options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data && data.message) || '请求失败');
    e.reasons = data && data.reasons;
    throw e;
  }
  return data;
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmt(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return esc(s);
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function nowLocal() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function toast(msg, ok = true) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = ok ? 'ok' : 'err';
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 5200);
}
function reasonsHtml(reasons) {
  return (reasons || []).map(r => '<div class="meta warn" style="color:#9b3f2e">✗ ' + esc(r.text || r.code) + '</div>').join('');
}

// ── 灯管看板（所有 tab 共用，与列表同源刷新）──
function lampBadge(l) {
  if (l.awaitingRetest) return '<span class="pill gold">待复测</span>';
  if (l.reachedLimit) return '<span class="pill red">寿限 800h</span>';
  if (l.status === '占用') return '<span class="pill blue">占用·' + esc(l.busyOrderCode || '') + '</span>';
  return '<span class="pill green">空闲</span>';
}
function renderLampStrip() {
  $('#lampStrip').innerHTML = state.lamps.map(l => {
    const bad = l.reachedLimit || l.awaitingRetest || l.calibrationExpired;
    return '<div class="lamp ' + (bad ? 'bad' : '') + '" data-history="' + esc(l.id) + '">'
      + '<div class="row" style="align-items:center"><b>' + esc(l.name) + '（' + esc(l.code) + '）</b>' + lampBadge(l) + '</div>'
      + '<div class="meta">管号 ' + esc(l.tubeNo) + '</div>'
      + '<div class="meta">累计 ' + esc(l.cumulativeHours) + ' / 800 h</div>'
      + '<div class="meta">校准有效至 ' + esc(l.calibrationExpireAt) + '</div>'
      + '</div>';
  }).join('');
  $$('#lampStrip [data-history]').forEach(el => el.onclick = () => {
    switchTab('archive'); loadHistory(el.dataset.history);
  });
}

// ── 入口 ──
function renderIntake() {
  $('#pendingCount').textContent = state.pending.length + ' 单';
  $('#pendingList').innerHTML = state.pending.length ? state.pending.map(o =>
    '<article class="card"><h3>' + esc(o.code) + ' <span class="pill">' + esc(o.status) + '</span></h3>'
    + '<div class="meta">' + esc(o.plateSize) + ' · 药液 ' + esc(o.chemicalBatch) + '</div>'
    + '<div>计划 ' + esc(o.requiredMinutes) + ' 分钟 · 最低辐照 ' + esc(o.minIrradiance) + ' mW/cm²</div>'
    + (o.note ? '<div class="meta">备注：' + esc(o.note) + '</div>' : '')
    + '<div class="meta">入口登记于 ' + fmt(o.createdAt) + '</div>'
    + '<button class="blue small" data-go="' + esc(o.id) + '">去判定</button></article>'
  ).join('') : '<div class="meta">暂无待判定曝光单。</div>';
  $$('#pendingList [data-go]').forEach(b => b.onclick = () => switchTab('admission'));
}

// ── 判定：准入表单 ──
function lampOptions(selectId) {
  return state.lamps.map(l => {
    const warns = [];
    if (l.awaitingRetest) warns.push('待复测');
    if (l.reachedLimit) warns.push('寿限');
    if (l.status === '占用') warns.push('占用:' + (l.busyOrderCode || ''));
    if (l.calibrationExpired) warns.push('校准过期');
    return '<option value="' + esc(l.id) + '"' + (selectId === l.id ? ' selected' : '') + '>'
      + esc(l.code) + ' ' + esc(l.name) + '（' + esc(l.cumulativeHours) + 'h，校准至 ' + esc(l.calibrationExpireAt)
      + (warns.length ? '｜' + warns.join('，') : '') + '）</option>';
  }).join('');
}
function renderDecide() {
  $('#decideList').innerHTML = state.pending.length ? state.pending.map(o =>
    '<form class="card" data-decide="' + esc(o.id) + '">'
    + '<h3>' + esc(o.code) + '</h3>'
    + '<div class="meta">' + esc(o.plateSize) + ' · ' + esc(o.requiredMinutes) + ' 分钟 · 最低辐照 ' + esc(o.minIrradiance) + ' mW/cm²</div>'
    + '<label>分配灯管 *</label><select name="lampId">' + lampOptions() + '</select>'
    + '<div class="row"><div><label>开灯实测辐照 *</label><input name="irradiance" type="number" step="0.1" min="0" required placeholder="mW/cm²"></div>'
    + '<div><label>开灯时刻 *</label><input name="lightOnAt" type="datetime-local" required value="' + nowLocal() + '"></div></div>'
    + '<label>判定人</label><input name="decidedBy" placeholder="姓名">'
    + '<button>准入判定（通过才占用灯管）</button></form>'
  ).join('') : '<div class="meta">入口暂无待判定单。</div>';
  $$('#decideList form').forEach(f => f.onsubmit = async e => {
    e.preventDefault();
    const id = f.dataset.decide;
    const payload = Object.fromEntries(new FormData(f).entries());
    try {
      const r = await api('/api/admission/orders/' + encodeURIComponent(id) + '/decide', { method: 'POST', body: JSON.stringify(payload) });
      if (r.ok) toast('已放行并占用灯管 ' + (r.version.lampCode));
      else toast('整单拒绝，未占灯管：' + (r.reasons || []).map(x => x.text).join('；'), false);
    } catch (err) { toast(err.message, false); }
    await load();
  });
}

// ── 判定：进行中曝光（完成 / 更正）──
function versionsHtml(o) {
  return '<div class="versions">' + o.versions.slice().reverse().map(v =>
    '<div class="ver ' + (v.status === '已失效' ? 'dead' : '') + '"><b>V' + esc(v.v) + ' · ' + esc(v.result)
    + (v.status === '已失效' ? ' · 已失效（只读）' : '') + '</b><br>'
    + esc(v.lampCode) + ' · ' + esc(v.irradiance) + ' mW/cm² · 开灯 ' + fmt(v.lightOnAt) + '<br>'
    + '<span class="meta">' + esc(v.decidedBy) + ' 于 ' + fmt(v.decidedAt) + (v.changes ? '（更正' + esc(v.changes.join('、')) + '）' : '') + '</span>'
    + reasonsHtml(v.reasons) + '</div>'
  ).join('') + '</div>';
}
function renderActive() {
  $('#activeList').innerHTML = state.active.length ? state.active.map(o =>
    '<article class="card"><h3>' + esc(o.code) + ' <span class="pill blue">占用 ' + esc(o.currentLampCode) + '</span></h3>'
    + '<div class="meta">实测 ' + esc(o.current.irradiance) + ' mW/cm² · 开灯 ' + fmt(o.current.lightOnAt) + '</div>'
    + '<div class="row">'
    + '<button data-complete="' + esc(o.id) + '">完成曝光</button>'
    + '<button class="gold" data-correct="' + esc(o.id) + '">更正灯管/辐照/开灯时刻</button></div>'
    + '<div class="inline" id="complete-' + esc(o.id) + '">'
    +   '<div class="row"><div><label>实际分钟</label><input value="' + esc(o.requiredMinutes) + '" id="cm-' + esc(o.id) + '"></div>'
    +   '<div><label>记录人</label><input id="cb-' + esc(o.id) + '"></div></div>'
    +   '<button class="small" data-docomplete="' + esc(o.id) + '">确认完成并累计时长</button></div>'
    + '<div class="inline" id="correct-' + esc(o.id) + '">'
    +   '<div class="meta">留空表示该项不改；新值不达标则原放行继续有效。</div>'
    +   '<label>更正灯管</label><select id="xl-' + esc(o.id) + '"><option value="">不变（' + esc(o.currentLampCode) + '）</option>' + lampOptions(o.currentLampId) + '</select>'
    +   '<div class="row"><div><label>更正辐照</label><input id="xi-' + esc(o.id) + '" type="number" step="0.1" placeholder="新实测值"></div>'
    +   '<div><label>更正开灯时刻</label><input id="xt-' + esc(o.id) + '" type="datetime-local"></div></div>'
    +   '<label>更正人</label><input id="xb-' + esc(o.id) + '">'
    +   '<button class="gold small" data-docorrect="' + esc(o.id) + '">按新值重算（旧放行冻结只读）</button></div>'
    + versionsHtml(o) + '</article>'
  ).join('') : '<div class="meta">当前没有进行中的曝光，所有灯管均可被准入分配（在寿命与校准允许范围内）。</div>';

  $$('#activeList [data-complete]').forEach(b => b.onclick = () => $('#complete-' + b.dataset.complete).classList.toggle('open'));
  $$('#activeList [data-correct]').forEach(b => b.onclick = () => $('#correct-' + b.dataset.correct).classList.toggle('open'));
  $$('#activeList [data-docomplete]').forEach(b => b.onclick = async () => {
    const id = b.dataset.docomplete;
    try {
      const r = await api('/api/admission/orders/' + encodeURIComponent(id) + '/complete',
        { method: 'POST', body: JSON.stringify({ minutes: Number($('#cm-' + id).value), by: $('#cb-' + id).value }) });
      toast('曝光已完成并存档；灯管累计 ' + (r.reachedLimit ? '已达 800h 寿限，须换管复测' : '正常'));
    } catch (e) { toast(e.message, false); }
    await load();
  });
  $$('#activeList [data-docorrect]').forEach(b => b.onclick = async () => {
    const id = b.dataset.docorrect;
    const payload = {
      lampId: $('#xl-' + id).value, irradiance: $('#xi-' + id).value,
      lightOnAt: $('#xt-' + id).value, correctedBy: $('#xb-' + id).value,
    };
    try {
      await api('/api/admission/orders/' + encodeURIComponent(id) + '/correct', { method: 'POST', body: JSON.stringify(payload) });
      toast('已按新值重算放行，旧版本冻结为已失效');
    } catch (e) {
      toast(e.message + (e.reasons ? '：' + e.reasons.map(x => x.text).join('；') : ''), false);
    }
    await load();
  });
}

// ── 判定：灯管换管与复测 ──
function openRetestOf(lampId) {
  return state.retests.find(r => r.lampId === lampId && !r.closedAt) || null;
}
function renderLampMgmt() {
  $('#lampMgmt').innerHTML = state.lamps.map(l => {
    const rt = openRetestOf(l.id);
    let block = '';
    if (rt) {
      block = '<div class="meta">新管 ' + esc(rt.tubeNoNew) + '：' + esc(rt.stage) + '</div>'
        + '<div class="row">'
        + '<div><label>复测时刻</label><input type="datetime-local" value="' + nowLocal() + '" id="r1t-' + esc(l.id) + '"></div>'
        + '<div><label>复测人</label><input id="r1b-' + esc(l.id) + '"></div>'
        + '<div><label>读数 mW/cm²</label><input type="number" step="0.1" id="r1v-' + esc(l.id) + '"></div></div>'
        + '<button class="small" data-r1="' + esc(l.id) + '">提交第一次复测</button>';
      if (rt.first && rt.first.ok) {
        block += '<div class="row" style="margin-top:8px">'
          + '<div><label>二次时刻（≥15 分钟后）</label><input type="datetime-local" id="r2t-' + esc(l.id) + '"></div>'
          + '<div><label>另一复测人</label><input id="r2b-' + esc(l.id) + '"></div>'
          + '<div><label>读数 mW/cm²</label><input type="number" step="0.1" id="r2v-' + esc(l.id) + '"></div></div>'
          + '<button class="small sec" data-r2="' + esc(l.id) + '">提交第二次复测并放行</button>';
      }
      if (rt.first) block += '<div class="meta">一次：' + esc(rt.first.by) + ' ' + fmt(rt.first.at) + ' ' + esc(rt.first.irradiance) + '（' + (rt.first.ok ? '达标' : '未达标') + '）</div>';
      if (rt.second) block += '<div class="meta">二次：' + esc(rt.second.by) + ' ' + fmt(rt.second.at) + ' ' + esc(rt.second.irradiance) + '（' + (rt.second.ok ? '达标' : '未达标') + '）</div>';
    } else {
      block = '<div class="inline" id="rep-' + esc(l.id) + '"><label>新管编号</label><input id="rp-' + esc(l.id) + '" placeholder="如 T-3105">'
        + '<button class="gold small" data-dorep="' + esc(l.id) + '">确认换管，进入复测</button></div>'
        + '<button class="gold small" data-rep="' + esc(l.id) + '"' + (l.status === '占用' ? ' title="占用中不得换管"' : '') + '>换管</button>';
    }
    return '<article class="card"><h3>' + esc(l.name) + '（' + esc(l.code) + '）</h3>' + lampBadge(l)
      + '<div class="meta">管号 ' + esc(l.tubeNo) + ' · 累计 ' + esc(l.cumulativeHours) + '/800h · 校准至 ' + esc(l.calibrationExpireAt) + ' · 达标线 ' + esc(l.targetIrradiance) + '</div>'
      + block + '</article>';
  }).join('');

  $$('[data-rep]').forEach(b => b.onclick = () => $('#rep-' + b.dataset.rep).classList.toggle('open'));
  $$('[data-dorep]').forEach(b => b.onclick = async () => {
    const id = b.dataset.dorep;
    try {
      await api('/api/admission/lamps/' + encodeURIComponent(id) + '/replace',
        { method: 'POST', body: JSON.stringify({ tubeNoNew: $('#rp-' + id).value }) });
      toast('换管已登记，等待复测');
    } catch (e) { toast(e.message, false); }
    await load();
  });
  $$('[data-r1]').forEach(b => b.onclick = async () => {
    const id = b.dataset.r1;
    try {
      const r = await api('/api/admission/lamps/' + encodeURIComponent(id) + '/retest/first', {
        method: 'POST', body: JSON.stringify({ at: $('#r1t-' + id).value, by: $('#r1b-' + id).value, irradiance: Number($('#r1v-' + id).value) }),
      });
      toast(r.ok ? '第一次复测达标，15 分钟后由另一人复测' : '第一次复测未达标，可重测', r.ok);
    } catch (e) { toast(e.message, false); }
    await load();
  });
  $$('[data-r2]').forEach(b => b.onclick = async () => {
    const id = b.dataset.r2;
    try {
      const r = await api('/api/admission/lamps/' + encodeURIComponent(id) + '/retest/second', {
        method: 'POST', body: JSON.stringify({ at: $('#r2t-' + id).value, by: $('#r2b-' + id).value, irradiance: Number($('#r2v-' + id).value) }),
      });
      toast(r.passed ? '两次复测达标，灯管放行，累计时长已归零' : '第二次未达标，不放行', r.passed);
    } catch (e) { toast(e.message, false); }
    await load();
  });
}

// ── 存档 ──
function renderArchive() {
  $('#archivedList').innerHTML = state.archived.length ? state.archived.map(o => {
    const done = o.status === '已完成';
    return '<article class="card"><h3>' + esc(o.code) + ' '
      + '<span class="pill ' + (done ? 'green' : 'red') + '">' + esc(o.status) + '</span></h3>'
      + '<div class="meta">' + esc(o.plateSize) + ' · 药液 ' + esc(o.chemicalBatch) + ' · ' + esc(o.requiredMinutes) + ' 分钟</div>'
      + (o.completion ? '<div class="meta">实际 ' + esc(o.completion.minutes) + ' 分钟（+' + esc(o.completion.addedHours) + 'h），' + esc(o.completion.by) + ' 于 ' + fmt(o.completion.at) + '</div>' : '')
      + versionsHtml(o)
      + '<button class="blue small" data-hl="' + esc(o.versions.length ? o.versions[0].lampId : '') + '">查看该灯管履历</button></article>';
  }).join('') : '<div class="meta">暂无存档。</div>';
  $$('#archivedList [data-hl]').forEach(b => b.onclick = () => loadHistory(b.dataset.hl));
}
async function loadHistory(lampId) {
  try {
    const h = await api('/api/archive/lamps/' + encodeURIComponent(lampId) + '/history');
    const rows = h.events.map(e => '<tr><td>' + fmt(e.at) + '</td><td><span class="pill ' + (e.occupied ? 'blue' : 'gold') + '">' + (e.occupied ? '占用' : '释放/其他') + '</span></td><td>' + esc(e.type) + '</td><td>' + esc(e.detail) + '</td></tr>').join('');
    const rts = h.retests.length ? '<h3 style="margin-top:12px">换管复测记录</h3>' + h.retests.slice().reverse().map(r =>
      '<div class="ver"><b>' + esc(r.tubeNoOld) + ' → ' + esc(r.tubeNoNew) + '</b> · ' + esc(r.stage)
      + '<br><span class="meta">一次：' + (r.first ? esc(r.first.by) + ' ' + esc(r.first.irradiance) + ' ' + (r.first.ok ? '达标' : '未达标') : '—')
      + '；二次：' + (r.second ? esc(r.second.by) + ' ' + esc(r.second.irradiance) + ' ' + (r.second.ok ? '达标' : '未达标') : '—') + '</span></div>').join('') : '';
    $('#historyBox').innerHTML = '<h2>' + esc(h.lamp.name) + '（' + esc(h.lamp.code) + '）履历</h2>'
      + '<div class="meta">管号 ' + esc(h.lamp.tubeNo) + ' · 累计 ' + esc(h.lamp.cumulativeHours) + '/800h · 校准至 ' + esc(h.lamp.calibrationExpireAt) + '</div>'
      + rts + '<table style="margin-top:10px"><tr><th>时刻</th><th>占用</th><th>事件</th><th>明细</th></tr>' + rows + '</table>';
  } catch (e) { toast(e.message, false); }
}

// ── tab & refresh ──
function switchTab(tab) {
  ['intake', 'admission', 'archive'].forEach(t => {
    $('#tab-' + t).classList.toggle('hidden', t !== tab);
    $$('nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  });
}
$$('nav [data-tab]').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

async function load() {
  state = await api('/api/board');
  renderLampStrip();
  renderIntake();
  renderDecide();
  renderActive();
  renderLampMgmt();
  renderArchive();
}

$('#createForm').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/intake/orders', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(f).entries())) });
    toast('入口登记成功，已进入待判定队列');
    f.reset();
  } catch (err) { toast(err.message, false); }
  await load();
};
$('#reload').onclick = load;

switchTab('intake');
load();
</script>
</body>
</html>`;
}
