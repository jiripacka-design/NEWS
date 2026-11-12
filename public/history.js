/* History & backups (v3.13.0): every change people (and re-checks) made, with Undo; the email alerts; weekly backups.
   Mounted by pm.js's window.CIPM, like collect.js. */
(function () {
  'use strict';
  const X = window.CIPM; if (!X) return;
  const { S, api, RENDER, mkView, mkNav, go, C } = X, { $, esc, toast } = C;
  const K = window.CICollect || {}, LBL = Object.assign({ status: 'On sale / discontinued', discontinuedAt: 'Discontinued on', retail: 'Street prices', lastVerified: 'Last verified', photo: 'Picture', photoSource: 'Picture source', watch: 'On the watchlist', threat: 'Threat level', threatReason: 'Why that threat level', isUs: 'This is us', sources: 'Sources', regions: 'Countries', na: 'Not published', removed: 'Removed', custom: 'Added by us' }, K.BLABEL || {}, K.LABEL || {});
  const ui = { tab: 'changes', kind: '', who: '', q: '', data: null, alerts: null, backups: null, more: 60 };
  const root = mkView('history', ''); mkNav('history', 'History');
  const VIA = { edit: 'by hand', collect: 'Collect data', 're-check': 're-check', 'ai-check': 'AI re-check', import: 'import', undo: 'undo', restore: 'restore' };
  const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const money = (k, v) => ({ priceGBP: '£', priceEUR: '€', priceUSD: '$' }[k] || '') + Number(v).toLocaleString('en-GB');
  function val(k, v) {
    if (v == null || v === '') return '<span class="muted">empty</span>';
    if (/^price(GBP|EUR|USD)$/.test(k)) return esc(money(k, v));
    if (k === 'retail' && Array.isArray(v)) return esc(v.map((r) => `${r.shop}${r.price != null ? ' £' + r.price : ''}`).join(', ') || 'none');
    if (k === 'status') return v === 'discontinued' ? 'Discontinued' : 'On sale';
    if (k === 'photo') return 'a picture';
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    if (typeof v === 'object') { const t = Array.isArray(v) ? v.join(', ') : Object.entries(v).filter(([, x]) => x !== '' && x != null).map(([a, b]) => `${a}: ${b}`).join('; '); return esc(t.length > 140 ? t.slice(0, 139) + '…' : t || 'empty'); }
    const t = String(v); return esc(t.length > 140 ? t.slice(0, 139) + '…' : t);
  }
  function fields(e) {
    if (e.action === 'add') return `<span class="muted">${e.kind === 'model' ? 'Model added' : 'Competitor added'}</span>`;
    if (e.action === 'remove') return `<span class="muted">${e.kind === 'model' ? 'Model deleted' : 'Competitor removed'}</span>`;
    if (e.action === 'restore') return '<span class="muted">All data replaced by the backup</span>';
    const ks = Object.keys(e.after || {}).filter((k) => !['photoSource', 'updatedAt'].includes(k));
    return `<ul class="hx-f">${ks.slice(0, 8).map((k) => `<li><span class="hx-k">${esc(LBL[k] || k)}</span> ${val(k, e.before[k])} <span class="hx-arrow">→</span> <b>${val(k, e.after[k])}</b></li>`).join('')}${ks.length > 8 ? `<li class="muted">and ${ks.length - 8} more</li>` : ''}</ul>`;
  }
  async function load() {
    try { ui.data = await api('GET', '/api/history?limit=1500'); } catch (e) { ui.data = { entries: [], error: e.message }; }
    render();
  }
  async function loadAlerts() { try { ui.alerts = await api('GET', '/api/alerts'); } catch (e) { ui.alerts = { alerts: [], error: e.message }; } render(); }
  async function loadBackups() { try { ui.backups = (await api('GET', '/api/backup')).backups; } catch (e) { ui.backups = []; toast(e.message); } render(); }

  function changesHtml() {
    if (!ui.data) return '<div class="source-empty">Loading the history…</div>';
    const all = ui.data.entries || [], people = [...new Set(all.map((e) => e.by))].sort(), q = ui.q.toLowerCase();
    const list = all.filter((e) => (!ui.kind || e.kind === ui.kind) && (!ui.who || e.by === ui.who) && (!q || `${e.name} ${e.by} ${Object.keys(e.after || {}).map((k) => LBL[k] || k).join(' ')}`.toLowerCase().includes(q)));
    let lastDay = '';
    const rows = list.slice(0, ui.more).map((e) => {
      const d = day(e.at), head = d !== lastDay ? `<div class="hx-day">${esc(d)}</div>` : ''; lastDay = d;
      const can = !e.undone && !e.noUndo && e.action !== 'restore';
      return `${head}<div class="hx-row${e.undone ? ' undone' : ''}"><div class="hx-t">${new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div><div class="hx-b"><div class="hx-h"><strong>${esc(e.name || e.key)}</strong><span class="hx-who">${esc(e.by)}</span><span class="hx-via">${esc(VIA[e.via] || e.via)}</span>${e.undone ? `<span class="hx-undone">Undone by ${esc(e.undone.by)}, ${esc(when(e.undone.at))}</span>` : ''}</div>${fields(e)}</div><div class="hx-a">${can ? `<button type="button" class="imagebtn" data-undo="${esc(e.id)}" title="Put back the values from before this change">Undo</button>` : ''}</div></div>`;
    }).join('');
    return `<div class="cl-row"><label class="ctl"><span>Show</span><select class="field" id="hxKind"><option value="">Everything</option><option value="model"${ui.kind === 'model' ? ' selected' : ''}>Models</option><option value="brand"${ui.kind === 'brand' ? ' selected' : ''}>Brand profiles</option></select></label><label class="ctl"><span>Who</span><select class="field" id="hxWho"><option value="">Everyone</option>${people.map((p) => `<option${p === ui.who ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label><label class="ctl hx-q"><span>Find</span><input class="field" id="hxQ" placeholder="Model, brand, person or field" value="${esc(ui.q)}"></label><span class="muted hx-count">${list.length} change${list.length === 1 ? '' : 's'}</span></div>
      ${rows || '<div class="pm-empty"><strong>No changes yet</strong><span>Every save from now on is listed here, with who made it. Changes made before v3.13 are not in the history.</span></div>'}
      ${list.length > ui.more ? `<button type="button" class="imagebtn hx-more" id="hxMore">Show more (${list.length - ui.more} older)</button>` : ''}`;
  }
  const TYPE = { price: 'List price', street: 'Street price', 'new-model': 'New model', discontinued: 'Discontinued', back: 'Back on sale', 'page-gone': 'Page gone', recheck: 'Spec change' };
  function alertsHtml() {
    const a = ui.alerts; if (!a) return '<div class="source-empty">Loading alerts…</div>';
    return `<div class="hx-status ${a.email ? 'on' : 'off'}"><strong>${a.email ? 'Email alerts are on' : 'Email alerts are off'}</strong><span>${a.email ? `Sent to ${esc((a.to || []).join(', '))}, at most once a day (after the morning scan) and after the Monday re-check.${a.lastSent ? ' Last sent ' + esc(when(a.lastSent)) + '.' : ''}` : 'To switch them on, add RESEND_API_KEY (from resend.com) and ALERTS_TO (one or more email addresses, comma separated) in Vercel › Settings › Environment Variables. DIGEST_TO is used if ALERTS_TO is not set.'}</span>${a.unsent ? `<div class="cl-row tight"><span>${a.unsent} waiting: “${esc(a.preview)}”</span>${a.email ? '<button type="button" class="primary" id="alSend">Send now</button>' : ''}</div>` : ''}</div>
      <p class="sub">Alerts are raised for list price changes, street price changes, new and discontinued models, product pages that have gone, and spec changes a re-check finds.</p>
      ${(a.alerts || []).length ? `<div class="tbl-wrap"><table class="pm-table"><thead><tr><th>When</th><th>What</th><th>Details</th><th>Email</th></tr></thead><tbody>${a.alerts.slice(0, 100).map((x) => `<tr><td class="nowrap">${esc(when(x.at))}</td><td><span class="hx-via">${esc(TYPE[x.type] || x.type)}</span></td><td>${esc(x.text)}${x.by && x.via !== 're-check' ? ` <span class="muted">· ${esc(x.by)}</span>` : ''}</td><td class="muted nowrap">${x.sent ? 'sent' : 'waiting'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="pm-empty"><strong>No alerts yet</strong><span>They appear when prices or line-ups change.</span></div>'}`;
  }
  const kb = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
  function backupsHtml() {
    const b = ui.backups; if (!b) return '<div class="source-empty">Loading backups…</div>';
    return `<p class="sub">A backup of everything entered (models, brands, sources, tags, edit and price history, alerts) is made every Monday and the last 12 are kept. Uploaded pictures are not in the file. Download one now and then to keep a copy of your own.</p>
      <div class="cl-row"><button type="button" class="primary" id="bkNow">Make a backup now</button><a class="imagebtn" href="/api/backup?download=now" download>Download the current data</a><button type="button" class="imagebtn" id="bkFile">Restore from a file…</button><input type="file" id="bkFileIn" accept=".json,application/json" hidden></div>
      ${b.length ? `<div class="tbl-wrap"><table class="pm-table"><thead><tr><th>Made</th><th>By</th><th class="num">Models</th><th class="num">Brands</th><th class="num">Sources</th><th class="num">Size</th><th></th></tr></thead><tbody>${b.map((x) => `<tr><td>${esc(when(x.at))}</td><td>${esc(x.by || '')}</td><td class="num">${x.models}</td><td class="num">${x.brands}</td><td class="num">${x.sources}</td><td class="num">${kb(x.bytes || 0)}</td><td class="acts"><a class="linkbtn" href="/api/backup?download=${encodeURIComponent(x.id)}" download>Download</a><button type="button" class="linkbtn danger" data-restore="${esc(x.id)}" data-when="${esc(when(x.at))}">Restore</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="pm-empty"><strong>No backups yet</strong><span>The first one is made next Monday, or select Make a backup now.</span></div>'}`;
  }
  function render() {
    const tabs = [['changes', 'Changes'], ['alerts', 'Email alerts'], ['backups', 'Backups']];
    const body = ui.tab === 'changes' ? changesHtml() : ui.tab === 'alerts' ? alertsHtml() : backupsHtml();
    const keepFocus = document.activeElement && document.activeElement.id === 'hxQ', pos = keepFocus ? document.activeElement.selectionStart : 0;
    root.innerHTML = `<div class="head"><div><h2>History & backups</h2><div class="sub">Who changed what and when, with Undo. Email alerts for market changes. Weekly backups.${S.me ? ` You are signed in as <strong>${esc(S.me)}</strong>.` : ''}</div></div></div>
      <div class="tabs2" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === ui.tab}" class="${k === ui.tab ? 'on' : ''}" data-hxtab="${k}">${l}</button>`).join('')}</div><div class="panel hx-panel">${body}</div>`;
    if (keepFocus) { const q = $('#hxQ', root); q.focus(); q.setSelectionRange(pos, pos); }
  }
  async function doUndo(id, force) {
    try {
      const r = await api('POST', '/api/history', { undo: id, force: !!force });
      if (r.kind === 'model') S.products = r.products || S.products; else { X.setBrandData(r); X.applyBrands(); }
      toast('Undone'); load();
    } catch (e) {
      // 409 "Changed again since": offer to undo anyway
      if (/Changed again since/.test(e.message) && !force && confirm('Those fields have been changed again since. Undo anyway and put back the older values?')) return doUndo(id, true);
      if (!/Changed again since/.test(e.message)) toast(e.message);
    }
  }
  async function doRestore(payload, label) {
    if (!confirm(`Restore ${label}?\n\nThis replaces all models, brand profiles, sources and history with the backup. A backup of the current data is made first, so you can go back.`)) return;
    try { const r = await api('POST', '/api/backup', { ...payload, confirm: 'RESTORE' }); toast(`Restored: ${r.restored.length} parts. Reloading…`); setTimeout(() => location.reload(), 900); } catch (e) { toast('Not restored: ' + e.message); }
  }
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.hxtab) { ui.tab = t.dataset.hxtab; render(); if (ui.tab === 'alerts') loadAlerts(); if (ui.tab === 'backups') loadBackups(); return; }
    if (t.dataset.undo) return doUndo(t.dataset.undo);
    if (t.id === 'hxMore') { ui.more += 100; return render(); }
    if (t.id === 'alSend') { t.disabled = true; t.textContent = 'Sending…'; try { const r = await api('POST', '/api/alerts'); toast(r.sent ? `Sent ${r.count} alerts` : r.reason || 'Not sent'); } catch (err) { toast('Not sent: ' + err.message); } return loadAlerts(); }
    if (t.id === 'bkNow') { t.disabled = true; t.textContent = 'Backing up…'; try { const r = await api('POST', '/api/backup', { create: true }); ui.backups = r.backups; toast('Backup made'); } catch (err) { toast(err.message); } return render(); }
    if (t.id === 'bkFile') return $('#bkFileIn', root).click();
    if (t.dataset.restore) return doRestore({ restore: t.dataset.restore }, 'the backup from ' + t.dataset.when);
  });
  root.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.id === 'hxKind') { ui.kind = t.value; return render(); }
    if (t.id === 'hxWho') { ui.who = t.value; return render(); }
    if (t.id === 'bkFileIn') { const f = t.files[0]; t.value = ''; if (!f) return; let data; try { data = JSON.parse(await f.text()); } catch (err) { return toast('That file is not a backup (not JSON)'); } return doRestore({ restore: 'file', data }, `the backup file from ${String(data.createdAt || '?').slice(0, 10)}`); }
  });
  let qt = null; root.addEventListener('input', (e) => { if (e.target.id === 'hxQ') { ui.q = e.target.value; clearTimeout(qt); qt = setTimeout(render, 200); } });
  RENDER.history = () => { render(); load(); if (ui.tab === 'alerts') loadAlerts(); if (ui.tab === 'backups') loadBackups(); };
  // Model history, for the Collect data model card: the last few changes to one model.
  X.modelHistory = async (id) => { try { return (await api('GET', '/api/history?kind=model&key=' + encodeURIComponent(id) + '&limit=8')).entries; } catch (e) { return []; } };
})();
