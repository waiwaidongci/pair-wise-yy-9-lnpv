// 前端：入口、判定、存档三个业务模块分置于同一页面，
// 每次写操作后统一拉取 /api/state，列表与灯管履历保持一致。
export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>曝光灯管寿命与辐照准入台</title>
  <style>
    :root { --bg:#eef1ea; --panel:#fff; --ink:#1f241d; --muted:#6a7366; --line:#cfd8ca; --accent:#3f6b4b; --warn:#a8432f; --info:#3a5f8a; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif; }
    header { padding:20px 26px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:14px; }
    h1 { margin:0; font-size:23px; } h2 { margin:0 0 10px; font-size:16px; } h3 { margin:0; font-size:15px; }
    .meta { color:var(--muted); font-size:12.5px; }
    main { padding:20px 26px; display:grid; grid-template-columns:330px 1fr 380px; gap:16px; align-items:start; }
    .module { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:15px; }
    .module > .tag { display:inline-block; font-size:11px; letter-spacing:2px; color:#fff; background:var(--accent); border-radius:4px; padding:2px 8px; margin-bottom:8px; }
    .module.judge > .tag { background:var(--info); }
    .module.archive > .tag { background:var(--muted); }
    label { display:block; margin:9px 0 4px; color:var(--muted); font-size:12.5px; }
    input,select { width:100%; border:1px solid var(--line); border-radius:6px; padding:8px; font:inherit; background:#fff; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:8px 11px; font-weight:700; cursor:pointer; font-size:12.5px; }
    button.info { background:var(--info); } button.ghost { background:#5c665e; } button.warn { background:var(--warn); }
    button:disabled { opacity:.45; cursor:not-allowed; }
    form + form { margin-top:16px; border-top:1px dashed var(--line); padding-top:12px; }
    .divider { height:1px;background:var(--line);margin:14px 0; }
    .card { border:1px solid var(--line); border-radius:8px; padding:11px; margin-bottom:10px; background:#fcfdfb; }
    .card.readonly { background:#f4f4f2; }
    .row { display:flex; justify-content:space-between; gap:8px; align-items:center; }
    .actions { display:flex; gap:6px; flex-wrap:wrap; margin-top:9px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 9px; font-size:11.5px; }
    .pill.ok { color:var(--accent); border-color:var(--accent); }
    .pill.busy { color:var(--info); border-color:var(--info); }
    .pill.bad { color:var(--warn); border-color:var(--warn); }
    .pill.mute { color:var(--muted); }
    .reason { color:var(--warn); font-size:12px; margin-top:5px; }
    .kv { display:grid; grid-template-columns:auto 1fr; gap:2px 10px; font-size:12.5px; margin-top:7px; }
    .kv .k { color:var(--muted); }
    .history { margin-top:8px; max-height:220px; overflow:auto; border-top:1px solid var(--line); padding-top:7px; font-size:12px; }
    .history div { padding:2px 0; border-bottom:1px dotted #e3e7e0; }
    #toast { position:fixed; right:18px; bottom:18px; max-width:380px; display:grid; gap:8px; z-index:9; }
    .toast { background:#26302a; color:#fff; padding:10px 14px; border-radius:8px; font-size:13px; }
    .toast.err { background:var(--warn); }
    .toolbar { display:flex; gap:8px; margin-bottom:10px; }
    .toolbar select,.toolbar input { width:auto; flex:1; }
    .lifebar { height:6px; background:#e6eae4; border-radius:99px; margin-top:6px; overflow:hidden; }
    .lifebar i { display:block; height:100%; background:var(--accent); }
    .lifebar i.hot { background:var(--warn); }
    @media (max-width:1100px){ main{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header>
    <div><h1>曝光灯管寿命与辐照准入台</h1>
      <div class="meta">古法蓝晒 · 灯管寿命 800 小时上限 · 校准有效期 · 辐照达标准入 · 换管复测双签</div></div>
    <button id="reload" class="ghost">刷新列表</button>
  </header>

  <main>
    <!-- 模块一：入口 -->
    <section class="module entry">
      <span class="tag">入口</span>
      <form id="lampForm">
        <h2>灯管建档</h2>
        <label>灯管编号 *</label><input name="code" required placeholder="如 UV-A03">
        <label>额定辐照 mW/cm² *</label><input name="ratedIrradiance" type="number" step="0.1" required>
        <label>当前实测辐照 mW/cm² *</label><input name="irradiance" type="number" step="0.1" required>
        <label>初始累计小时数</label><input name="totalHours" type="number" step="0.1" value="0">
        <label>校准有效期至 *</label><input name="calibratedUntil" type="datetime-local" required>
        <div class="actions"><button>建档灯管</button></div>
      </form>
      <form id="admitForm">
        <h2>曝光准入申请（整单判定）</h2>
        <label>底片编号 *</label><input name="negativeCode" required placeholder="如 CN-002">
        <label>指定灯管 *</label><select name="lampId" id="admitLamp"></select>
        <label>需要曝光分钟数 *</label><input name="requiredMinutes" type="number" step="0.1" required>
        <label>要求辐照 mW/cm² *</label><input name="targetIrradiance" type="number" step="0.1" required>
        <label>开灯时刻</label><input name="lightOnAt" type="datetime-local">
        <div class="actions"><button>提交准入</button></div>
      </form>
    </section>

    <!-- 模块二：判定 -->
    <section class="module judge">
      <span class="tag">判定</span>
      <h2>灯管与在制曝光</h2>
      <div class="toolbar">
        <select id="lampFilter"><option value="">全部灯管状态</option><option>可用</option><option>使用中</option><option>待复测</option></select>
      </div>
      <div id="lampList"></div>
      <div class="divider"></div>
      <h2>曝光工单</h2>
      <div class="toolbar">
        <select id="exFilter"><option value="">全部工单状态</option><option>已放行</option><option>已曝光</option><option>已拒绝</option><option>已失效</option><option>已存档</option></select>
        <input id="search" placeholder="搜索底片/灯管/工单号">
      </div>
      <div id="exList"></div>
    </section>

    <!-- 模块三：存档 -->
    <section class="module archive">
      <span class="tag">存档</span>
      <h2>灯管履历（刷新一致）</h2>
      <select id="historyLamp"></select>
      <div class="history" id="lampHistory"></div>
      <div class="divider"></div>
      <h2>只读工单档案</h2>
      <div class="meta">已存档、已失效（更正前旧记录）均只读。下方列表与判定模块共用同一数据源。</div>
      <div id="archiveList" style="margin-top:10px;"></div>
    </section>
  </main>

  <div id="toast"></div>

  <script>
    const LIFE_LIMIT = 800;
    let state = { lamps: [], exposures: [] };

    async function api(path, options) {
      const res = await fetch(path, options && options.body
        ? { ...options, headers: { 'Content-Type': 'application/json' } }
        : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || '请求失败');
      return data;
    }
    function toast(msg, isErr) {
      const box = document.querySelector('#toast');
      const el = document.createElement('div');
      el.className = 'toast' + (isErr ? ' err' : '');
      el.textContent = msg;
      box.appendChild(el);
      setTimeout(() => el.remove(), 4200);
    }
    function fmt(v) { return v === undefined || v === null || v === '' ? '—' : v; }
    function shortIso(s) { return s ? s.replace('T', ' ').slice(0, 16) : '—'; }
    function pill(status) {
      const cls = { '可用': 'ok', '已放行': 'ok', '已曝光': 'mute', '使用中': 'busy', '待复测': 'busy',
        '已拒绝': 'bad', '已失效': 'bad', '已存档': 'mute' }[status] || 'mute';
      return '<span class="pill ' + cls + '">' + status + '</span>';
    }
    function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    async function refresh() {
      state = await api('/api/state');
      render();
    }
    async function act(label, fn) {
      try { await fn(); await refresh(); toast(label + '完成'); }
      catch (e) { toast(label + '失败：' + e.message, true); }
    }

    // ---------- 渲染 ----------
    function render() {
      renderAdmitLampOptions();
      renderLampList();
      renderExposureList();
      renderHistoryLampOptions();
      renderLampHistory();
      renderArchiveList();
    }

    function renderAdmitLampOptions() {
      const sel = document.querySelector('#admitLamp');
      const cur = sel.value;
      sel.innerHTML = state.lamps.map(l => '<option value="' + l.id + '">' + l.code + ' · ' + l.status +
        ' · ' + l.totalHours + 'h · ' + l.irradiance + 'mW</option>').join('');
      if (cur) sel.value = cur;
    }

    function lampCard(l) {
      const pct = Math.min(100, Math.round(l.totalHours / LIFE_LIMIT * 100));
      const hot = l.totalHours >= LIFE_LIMIT;
      const cal = l.calibrationExpired ? '<div class="reason">校准已过期（' + shortIso(l.calibratedUntil) + '）</div>'
        : '<div class="meta">校准有效至 ' + shortIso(l.calibratedUntil) + '</div>';
      let actions = '';
      if (l.status === '待复测') {
        actions = '<div class="kv"><span class="k">换管人</span><span>' + esc(l.retest.replacedBy) + '</span>'
          + '<span class="k">已达标</span><span>' + l.retest.streak.length + ' / 2 次</span></div>'
          + '<div class="actions"><input class="retest-inspector" placeholder="复测人（须另一人）" style="flex:1">'
          + '<input class="retest-measured" type="number" step="0.1" placeholder="实测辐照" style="width:120px">'
          + '<button class="info" data-retest="' + l.id + '">提交复测</button></div>';
      } else if (l.status === '可用') {
        actions = '<div class="actions"><button class="warn" data-replace="' + l.id + '">换管</button></div>';
      } else {
        actions = '<div class="meta">占用中：' + esc(l.currentExposureId) + '</div>';
      }
      return '<article class="card"><div class="row"><h3>' + esc(l.code) + '</h3>' + pill(l.status) + '</div>'
        + '<div class="kv">'
        + '<span class="k">累计时长</span><span>' + l.totalHours + ' / ' + LIFE_LIMIT + ' 小时</span>'
        + '<span class="k">额定/实测</span><span>' + l.ratedIrradiance + ' / ' + l.irradiance + ' mW/cm²</span></div>'
        + '<div class="lifebar"><i class="' + (hot ? 'hot' : '') + '" style="width:' + pct + '%"></i></div>'
        + cal + actions + '</article>';
    }
    function renderLampList() {
      const f = document.querySelector('#lampFilter').value;
      const lamps = state.lamps.filter(l => !f || l.status === f);
      document.querySelector('#lampList').innerHTML = lamps.map(lampCard).join('') || '<div class="meta">暂无灯管</div>';

      document.querySelectorAll('[data-replace]').forEach(btn => btn.onclick = () => {
        const replacedBy = prompt('换管人姓名（换管后累计时长归零，需另一人复测）');
        if (replacedBy === null) return;
        const irradiance = prompt('新管实测辐照 mW/cm²');
        if (irradiance === null) return;
        const calibratedUntil = prompt('新管校准有效期（格式 2027-09-23T10:00）', new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 16));
        if (calibratedUntil === null) return;
        act('换管', () => api('/api/lamps/' + btn.dataset.replace + '/replace', {
          method: 'POST', body: JSON.stringify({ replacedBy, irradiance, calibratedUntil })
        }));
      });
      document.querySelectorAll('[data-retest]').forEach(btn => btn.onclick = () => {
        const card = btn.closest('.card');
        const inspector = card.querySelector('.retest-inspector').value.trim();
        const measuredIrradiance = card.querySelector('.retest-measured').value;
        if (!inspector || !measuredIrradiance) return toast('复测人与实测辐照必填', true);
        act('复测', () => api('/api/lamps/' + btn.dataset.retest + '/retest', {
          method: 'POST', body: JSON.stringify({ inspector, measuredIrradiance })
        }));
      });
    }

    function exCard(e) {
      const ro = e.frozen;
      const reason = e.reason ? '<div class="reason">拒绝原因：' + esc(e.reason) + '</div>' : '';
      const rev = e.revisionOf ? '<div class="meta">由旧单 ' + esc(e.revisionOf) + ' 更正重算</div>' : '';
      let actions = '';
      if (e.status === '已放行' && !ro) {
        actions = '<div class="actions">'
          + '<button class="info" data-complete="' + e.id + '">完成曝光</button>'
          + '<button class="warn" data-correct="' + e.id + '">更正</button></div>';
      }
      if ((e.status === '已曝光' || e.status === '已拒绝' || e.status === '已失效') && !ro) {
        actions = '<div class="actions"><button class="ghost" data-archive="' + e.id + '">归档</button></div>';
      }
      if (ro && e.status === '已失效') actions = '<div class="meta">旧记录只读（已被更正取代）</div>';
      if (ro && e.status === '已存档') actions = '<div class="meta">已归档只读</div>';
      return '<article class="card' + (ro ? ' readonly' : '') + '"><div class="row"><h3>' + esc(e.negativeCode)
        + ' <span class="meta">' + esc(e.id) + '</span></h3>' + pill(e.status) + '</div>'
        + '<div class="kv">'
        + '<span class="k">灯管</span><span>' + esc(e.lampCode) + '（' + e.lampStatus + '）</span>'
        + '<span class="k">曝光</span><span>' + e.requiredMinutes + ' 分钟</span>'
        + '<span class="k">要求辐照</span><span>' + e.targetIrradiance + ' mW/cm²</span>'
        + '<span class="k">开灯时刻</span><span>' + shortIso(e.lightOnAt) + '</span></div>'
        + reason + rev + actions + '</article>';
    }
    function renderExposureList() {
      const f = document.querySelector('#exFilter').value;
      const q = document.querySelector('#search').value.trim();
      const list = state.exposures.filter(e =>
        (!f || e.status === f) &&
        (!q || [e.negativeCode, e.lampCode, e.id, e.reason].join(' ').includes(q)));
      document.querySelector('#exList').innerHTML = list.map(exCard).join('') || '<div class="meta">暂无工单</div>';

      document.querySelectorAll('[data-complete]').forEach(btn => btn.onclick = () =>
        act('完成曝光', () => api('/api/exposures/' + btn.dataset.complete + '/complete', { method: 'POST', body: '{}' })));
      document.querySelectorAll('[data-archive]').forEach(btn => btn.onclick = () =>
        act('归档', () => api('/api/exposures/' + btn.dataset.archive + '/archive', { method: 'POST', body: '{}' })));
      document.querySelectorAll('[data-correct]').forEach(btn => btn.onclick = () => openCorrect(btn.dataset.correct));
    }

    function openCorrect(id) {
      const e = state.exposures.find(x => x.id === id);
      const field = prompt('更正哪一项？输入 lamp（灯管）/ irr（要求辐照）/ on（开灯时刻）', 'irr');
      if (!field) return;
      let patch = {};
      if (field === 'lamp') {
        const lampId = prompt('新灯管编号（' + state.lamps.map(l => l.code + '=' + l.status).join('，') + '），可填 id');
        if (!lampId) return;
        const l = state.lamps.find(x => x.code === lampId || x.id === lampId);
        if (!l) return toast('灯管不存在', true);
        patch.lampId = l.id;
      } else if (field === 'irr') {
        const v = prompt('新的要求辐照 mW/cm²', e.targetIrradiance);
        if (v === null) return; patch.targetIrradiance = v;
      } else if (field === 'on') {
        const v = prompt('新开灯时刻（格式 2026-09-23T10:00）', (e.lightOnAt || '').slice(0, 16));
        if (v === null) return; patch.lightOnAt = v;
      } else return;
      if (!confirm('更正会使已放行曝光失效，旧记录冻结只读，并按新值重新判定。确认？')) return;
      act('更正重算', () => api('/api/exposures/' + id + '/correct', {
        method: 'POST', body: JSON.stringify(patch)
      }));
    }

    function renderHistoryLampOptions() {
      const sel = document.querySelector('#historyLamp');
      const cur = sel.value;
      sel.innerHTML = state.lamps.map(l => '<option value="' + l.id + '">' + l.code + '（累计 ' + l.totalHours + 'h）</option>').join('');
      if (cur) sel.value = cur;
    }
    function renderLampHistory() {
      const sel = document.querySelector('#historyLamp');
      const l = state.lamps.find(x => x.id === sel.value) || state.lamps[0];
      const box = document.querySelector('#lampHistory');
      if (!l) { box.innerHTML = '<div class="meta">暂无灯管</div>'; return; }
      box.innerHTML = l.history.slice().reverse().map(h =>
        '<div><b>' + esc(h.type) + '</b> · ' + shortIso(h.at) + '<br><span class="meta">' +
        esc(JSON.stringify(h.detail)) + '</span></div>').join('');
    }

    function renderArchiveList() {
      const ro = state.exposures.filter(e => e.frozen);
      document.querySelector('#archiveList').innerHTML = ro.map(e =>
        '<article class="card readonly"><div class="row"><h3>' + esc(e.negativeCode) +
        ' <span class="meta">' + esc(e.id) + '</span></h3>' + pill(e.status) + '</div>'
        + '<div class="meta">灯管 ' + esc(e.lampCode) + ' · ' + e.requiredMinutes + ' 分钟 · 开灯 ' + shortIso(e.lightOnAt) + '</div></article>'
      ).join('') || '<div class="meta">暂无只读档案</div>';
    }

    // ---------- 表单 ----------
    document.querySelector('#lampForm').onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target;
      const body = {
        code: f.code.value, ratedIrradiance: f.ratedIrradiance.value, irradiance: f.irradiance.value,
        totalHours: f.totalHours.value, calibratedUntil: f.calibratedUntil.value,
      };
      await act('灯管建档', () => api('/api/lamps', { method: 'POST', body: JSON.stringify(body) }));
      f.reset(); f.totalHours.value = '0';
    };
    document.querySelector('#admitForm').onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target;
      const body = {
        negativeCode: f.negativeCode.value, lampId: f.lampId.value,
        requiredMinutes: f.requiredMinutes.value, targetIrradiance: f.targetIrradiance.value,
        lightOnAt: f.lightOnAt.value || undefined,
      };
      const result = await api('/api/admissions', { method: 'POST', body: JSON.stringify(body) });
      await refresh();
      toast(result.status === '已拒绝' ? '整单拒绝：' + result.reason : '准入已放行并占用灯管', result.status === '已拒绝');
      f.negativeCode.value = '';
    };
    document.querySelector('#lampFilter').onchange = renderLampList;
    document.querySelector('#exFilter').onchange = renderExposureList;
    document.querySelector('#search').oninput = renderExposureList;
    document.querySelector('#historyLamp').onchange = renderLampHistory;
    document.querySelector('#reload').onclick = () => refresh().then(() => toast('已刷新'));

    refresh();
  </script>
</body>
</html>`;
}
