// Painel de gestão (computador): consumo, alertas e retiradas chegando ao vivo.

const $ = (s) => document.querySelector(s);
const st = { empresa: 'todas', dias: 30, busca: '', area: 'todas', limite: 40, lista: [], conhecidos: null, assinatura: '' };
const MOTIVOS_EX = ['Danificado', 'Desgaste precoce', 'Perdido'];

const num = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const pct = (a, b) => Math.round((a / b - 1) * 100);

// ---------- Preparação dos dados ----------
// Marca cada retirada feita antes do prazo de troca do item (mesmo funcionário + material).
function marcarAntecipadas(lista) {
  const ult = {};
  [...lista].sort((a, b) => a.quando.localeCompare(b.quando)).forEach((r, i) => {
    const { m } = achar(r);
    const k = r.empresaId + '|' + r.funcionario + '|' + r.matId;
    const t = new Date(r.quando).getTime();
    r._ant = null;
    // nos dados de exemplo (sorteados), só uma parte vira alerta, para ficar realista
    if (ult[k] != null && m && (!r.exemplo || i % 4 === 0)) {
      const gap = Math.floor((t - ult[k]) / DIA);
      if (gap < m.vida) r._ant = { gap, motivo: r.motivo || MOTIVOS_EX[i % 3] };
    }
    ult[k] = t;
  });
  return lista;
}

const daEmpresa = (r) => st.empresa === 'todas' || r.empresaId === st.empresa;
const noPeriodo = (r, dias = st.dias, fim = Date.now()) => {
  const t = new Date(r.quando).getTime();
  return t <= fim && t > fim - dias * DIA;
};
const empresasVisiveis = () => EMPRESAS.filter((e) => st.empresa === 'todas' || e.id === st.empresa);

function foto(r, cls = '') {
  if (r.foto) return `<img class="ft ${cls}" src="${esc(r.foto)}" alt="" data-zoom="${esc(r.id)}">`;
  return `<div class="ft av ${cls}">${iniciais(r.funcionario)}</div>`;
}

// ---------- Render ----------
function render() {
  const base = st.lista.filter(daEmpresa);
  const periodo = base.filter((r) => noPeriodo(r));
  const anterior = base.filter((r) => noPeriodo(r, st.dias, Date.now() - st.dias * DIA));

  // Realizado x planejado
  const linhas = [];
  empresasVisiveis().forEach((e) => e.areas.forEach((a) => a.materiais.forEach((m) => {
    const real = periodo.filter((r) => r.empresaId === e.id && r.areaId === a.id && r.matId === m.id).reduce((s, r) => s + r.qtd, 0);
    const plan = m.plan * st.dias / 30;
    linhas.push({ e, a, m, real, plan, over: real > plan });
  })));

  // KPIs
  const itens = periodo.reduce((s, r) => s + r.qtd, 0);
  const itensAnt = anterior.reduce((s, r) => s + r.qtd, 0);
  const ants = periodo.filter((r) => r._ant);
  $('#kRet').textContent = periodo.length;
  $('#kRetSub').textContent = `últimos ${st.dias} dias`;
  $('#kItens').textContent = itens;
  $('#kItensSub').textContent = itensAnt ? `${pct(itens, itensAnt) >= 0 ? '+' : ''}${pct(itens, itensAnt)}% vs. período anterior` : '';
  $('#kAcima').textContent = linhas.filter((l) => l.over).length;
  $('#kAnt').textContent = ants.length;

  renderRxp(linhas);
  renderFeed(base);
  renderAlertas(linhas, ants);
  renderFuncionarios(periodo);
  renderDias(periodo);
  renderHistorico(periodo);
}

function renderRxp(linhas) {
  const max = Math.max(1, ...linhas.map((l) => Math.max(l.real, l.plan))) * 1.05;
  let grupo = '';
  $('#rxp').innerHTML = linhas.map((l) => {
    const g = st.empresa === 'todas' ? `${l.e.nome} · ${l.a.nome}` : l.a.nome;
    const cab = g !== grupo ? `<div class="rxp-grupo">${esc(g)}</div>` : '';
    grupo = g;
    const p = pct(l.real, l.plan);
    const tip = `${l.m.nome} — ${l.a.nome}: ${l.real} ${l.m.unid} retirados, ${num(l.plan)} planejados (${p >= 0 ? '+' : ''}${p}%)`;
    return cab + `
      <div class="rxp-row" data-tip="${esc(tip)}">
        <span class="rxp-nome">${esc(l.m.nome)}</span>
        <div class="rxp-track">
          <div class="rxp-bar${l.over ? ' over' : ''}" style="width:${(l.real / max) * 100}%"></div>
          <div class="rxp-plan" style="left:${(l.plan / max) * 100}%"></div>
        </div>
        <span class="rxp-val${l.over ? ' over' : ''}">${l.over ? `▲ +${p}% · ` : ''}${l.real}/${num(l.plan)}</span>
      </div>`;
  }).join('');
}

function renderFeed(base) {
  const novos = st.novos || new Set();
  const ult = base.slice(0, 12);
  $('#feed').innerHTML = ult.length ? ult.map((r) => {
    const { a, m } = achar(r);
    return `
    <div class="feed-item${novos.has(r.id) ? ' novo' : ''}">
      ${foto(r)}
      <div class="info">
        <strong>${esc(r.funcionario)}</strong>
        <span>${r.qtd}× ${m ? esc(m.nome) : ''} · ${a ? esc(a.nome) : ''}</span>
        <time>${dataHora(r.quando)}</time>
      </div>
      ${r._ant ? '<span class="tag amber">antes do prazo</span>' : ''}
    </div>`;
  }).join('') : '<div class="vazio">Nenhuma retirada.</div>';
}

function renderAlertas(linhas, ants) {
  const acima = linhas.filter((l) => l.over).sort((x, y) => pct(y.real, y.plan) - pct(x.real, x.plan));
  const html = acima.map((l) => `
    <div class="al red"><span class="ic">▲</span><div>
      <b>Consumo acima do planejado</b>
      ${esc(l.m.nome)} em ${esc(l.a.nome)}${st.empresa === 'todas' ? ` (${esc(l.e.nome)})` : ''}: ${l.real} ${l.m.unid} retirados, ${num(l.plan)} planejados — <strong>+${pct(l.real, l.plan)}%</strong>
    </div></div>`);
  ants.slice(0, 8).forEach((r) => {
    const { m } = achar(r);
    html.push(`
    <div class="al amber"><span class="ic">!</span><div>
      <b>Retirada antes do prazo</b>
      ${esc(r.funcionario)} retirou ${esc(m.nome)} ${r._ant.gap === 0 ? 'no mesmo dia da' : `${r._ant.gap} dia${r._ant.gap > 1 ? 's' : ''} após a`} retirada anterior (troca a cada ${m.vida} dias). Motivo: ${esc(r._ant.motivo)} · ${dataHora(r.quando)}
    </div></div>`);
  });
  $('#alertas').innerHTML = html.join('') || '<div class="vazio">Nenhum alerta no período.</div>';
}

function renderFuncionarios(periodo) {
  const por = {};
  periodo.forEach((r) => {
    const k = r.empresaId + '|' + r.funcionario;
    por[k] = por[k] || { nome: r.funcionario, emp: achar(r).e.nome, ret: 0, itens: 0, ant: 0 };
    por[k].ret++; por[k].itens += r.qtd; if (r._ant) por[k].ant++;
  });
  const rows = Object.values(por).sort((a, b) => b.itens - a.itens).slice(0, 8);
  $('#tFunc').innerHTML = `
    <tr><th>Funcionário</th><th class="n">Retiradas</th><th class="n">Itens</th><th class="n">Antes do prazo</th></tr>
    ${rows.map((f) => `<tr>
      <td>${esc(f.nome)}${st.empresa === 'todas' ? `<br><small style="color:var(--muted)">${esc(f.emp)}</small>` : ''}</td>
      <td class="n">${f.ret}</td><td class="n">${f.itens}</td>
      <td class="n">${f.ant ? `<span class="tag amber">${f.ant}</span>` : '—'}</td>
    </tr>`).join('')}`;
}

function renderDias(periodo) {
  const el = $('#dias');
  const W = el.clientWidth || 360, H = 190, padB = 22, padT = 10;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = [];
  for (let i = st.dias - 1; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * DIA);
    const doDia = periodo.filter((r) => { const t = new Date(r.quando); t.setHours(0, 0, 0, 0); return t.getTime() === d.getTime(); });
    dias.push({ d, itens: doDia.reduce((s, r) => s + r.qtd, 0), ret: doDia.length });
  }
  const max = Math.max(1, ...dias.map((x) => x.itens));
  const slot = W / dias.length;
  const bw = Math.max(2, slot - 2);
  const y = (v) => H - padB - (v / max) * (H - padB - padT);
  const fmtD = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const rotulos = new Set([0, Math.floor(dias.length / 2), dias.length - 1]);

  $('#diaHint').textContent = `itens · máx. ${max}/dia`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Itens retirados por dia">
    <line x1="0" x2="${W}" y1="${y(max)}" y2="${y(max)}"/>
    <line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}"/>
    ${dias.map((x, i) => {
      const x0 = i * slot + 1, top = y(x.itens), h = H - padB - top, r = Math.min(4, bw / 2, h);
      const barra = x.itens ? `<path class="c" d="M${x0},${H - padB} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${H - padB} Z"/>` : '';
      return `<g data-tip="${fmtD(x.d)} · ${x.itens} itens em ${x.ret} retirada${x.ret === 1 ? '' : 's'}">
        <rect class="hit" x="${i * slot}" y="0" width="${slot}" height="${H - padB}"/>${barra}
        ${rotulos.has(i) ? `<text x="${x0 + bw / 2}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === dias.length - 1 ? 'end' : 'middle'}">${fmtD(x.d)}</text>` : ''}
      </g>`;
    }).join('')}
  </svg>`;
}

function filtrosHistorico(periodo) {
  const q = st.busca.trim().toLowerCase();
  return periodo.filter((r) => {
    if (st.area !== 'todas' && `${r.empresaId}|${r.areaId}` !== st.area) return false;
    if (!q) return true;
    const { m } = achar(r);
    return r.funcionario.toLowerCase().includes(q) || (m && m.nome.toLowerCase().includes(q));
  });
}

function renderHistorico(periodo) {
  const rows = filtrosHistorico(periodo);
  $('#tHist').innerHTML = `
    <tr><th>Foto</th><th>Data e hora</th><th>Funcionário</th><th>Empresa · Área</th><th>Material</th><th class="n">Qtd</th><th>Situação</th></tr>
    ${rows.slice(0, st.limite).map((r) => {
      const { e, a, m } = achar(r);
      const sit = r._ant ? `<span class="tag amber">antes do prazo · ${esc(r._ant.motivo)}</span>` : r.exemplo ? '<span class="tag cinza">exemplo</span>' : '';
      return `<tr>
        <td>${foto(r, 'sm')}</td>
        <td>${dataHora(r.quando)}</td>
        <td>${esc(r.funcionario)}</td>
        <td>${esc(e.nome)} · ${esc(a.nome)}</td>
        <td>${esc(m.nome)}</td>
        <td class="n">${r.qtd}</td>
        <td>${sit}</td>
      </tr>`;
    }).join('')}`;
  if (!rows.length) $('#tHist').innerHTML += '<tr><td colspan="7"><div class="vazio">Nada encontrado.</div></td></tr>';
  $('#mais').hidden = rows.length <= st.limite;
}

function renderFiltroArea() {
  const op = ['<option value="todas">Todas as áreas</option>'];
  empresasVisiveis().forEach((e) => e.areas.forEach((a) =>
    op.push(`<option value="${e.id}|${a.id}">${st.empresa === 'todas' ? e.nome + ' · ' : ''}${a.nome}</option>`)));
  $('#fArea').innerHTML = op.join('');
  st.area = 'todas';
}

// ---------- Ao vivo ----------
let audio = null;
document.addEventListener('pointerdown', () => {
  if (!audio) try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
}, { once: true });

function bip() {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine'; o.frequency.value = 880;
  g.gain.setValueAtTime(0.0001, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.15, audio.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.35);
  o.connect(g).connect(audio.destination);
  o.start(); o.stop(audio.currentTime + 0.4);
}

function toast(r) {
  const { a, m } = achar(r);
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${r.foto ? `<img src="${esc(r.foto)}" alt="">` : ''}<div><b>Nova retirada</b><span>${esc(r.funcionario)} — ${r.qtd}× ${esc(m.nome)} · ${esc(a.nome)}</span></div>`;
  $('#toasts').prepend(el);
  setTimeout(() => el.remove(), 7000);
}

async function carregar() {
  let lista;
  try { lista = await Store.listar(); } catch (_) { $('#live').classList.remove('on'); return; }
  $('#live').classList.toggle('on', Store.modo === 'nuvem');
  const assinatura = lista.length + '|' + (lista[0] && lista[0].id);
  if (assinatura === st.assinatura) return;
  st.assinatura = assinatura;

  const novos = st.conhecidos ? lista.filter((r) => !st.conhecidos.has(r.id)) : [];
  st.conhecidos = new Set(lista.map((r) => r.id));
  st.novos = new Set(novos.map((r) => r.id));
  st.lista = marcarAntecipadas(lista);
  render();
  novos.filter(daEmpresa).reverse().forEach(toast);
  if (novos.length) bip();
}

// ---------- Interações ----------
$('#fEmpresa').innerHTML = '<option value="todas">Todas as empresas</option>' +
  EMPRESAS.map((e) => `<option value="${e.id}">${e.nome}</option>`).join('');
$('#fEmpresa').onchange = (ev) => { st.empresa = ev.target.value; st.novos = null; renderFiltroArea(); render(); };
$('#fPeriodo').querySelectorAll('button').forEach((b) => b.onclick = () => {
  $('#fPeriodo').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  st.dias = Number(b.dataset.d); st.novos = null; render();
});
$('#busca').oninput = (ev) => { st.busca = ev.target.value; st.limite = 40; render(); };
$('#fArea').onchange = (ev) => { st.area = ev.target.value; st.limite = 40; render(); };
$('#mais').onclick = () => { st.limite += 40; render(); };

// tooltip
const tip = $('#tip');
document.addEventListener('mousemove', (ev) => {
  const alvo = ev.target.closest('[data-tip]');
  if (!alvo) { tip.hidden = true; return; }
  tip.textContent = alvo.dataset.tip;
  tip.style.left = ev.clientX + 'px';
  tip.style.top = ev.clientY - 8 + 'px';
  tip.hidden = false;
});

// foto ampliada
document.addEventListener('click', (ev) => {
  const img = ev.target.closest('[data-zoom]');
  if (!img) return;
  const r = st.lista.find((x) => x.id === img.dataset.zoom);
  if (!r) return;
  const { e, a, m } = achar(r);
  $('#zoomImg').src = r.foto;
  $('#zoomCap').textContent = `${r.funcionario} · ${r.qtd}× ${m.nome} · ${a.nome} · ${e.nome} · ${dataHora(r.quando)}`;
  $('#zoom').hidden = false;
});
document.querySelectorAll('.modal').forEach((md) => md.addEventListener('click', (ev) => {
  if (ev.target === md || ev.target.closest('[data-fechar]') || md.id === 'zoom') md.hidden = true;
}));

// QR para abrir o app no celular
$('#btnQr').onclick = () => {
  const url = new URL('./', location.href).href;
  $('#qr').innerHTML = '';
  if (window.QRCode) new QRCode($('#qr'), { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  $('#qrUrl').textContent = url;
  $('#qrModal').hidden = false;
};

// exportação
$('#btnExport').onclick = () => {
  if (!window.XLSX) return alert('Não foi possível carregar o exportador. Verifique a internet.');
  const rows = filtrosHistorico(st.lista.filter(daEmpresa).filter((r) => noPeriodo(r))).map((r) => {
    const { e, a, m } = achar(r);
    const d = new Date(r.quando);
    return {
      'Data': d.toLocaleDateString('pt-BR'),
      'Hora': d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      'Empresa': e.nome, 'CNPJ': e.cnpj, 'Área': a.nome,
      'Funcionário': r.funcionario, 'Material': m.nome, 'Quantidade': r.qtd, 'Unidade': m.unid,
      'Antes do prazo': r._ant ? `Sim (${r._ant.gap} dias) — ${r._ant.motivo}` : 'Não',
      'Foto': r.foto ? (r.foto.startsWith('data:') ? 'salva no aparelho' : new URL(r.foto, location.href).href) : '',
      'Origem': r.exemplo ? 'Exemplo' : 'Registro real',
    };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [10, 7, 18, 20, 14, 18, 22, 11, 8, 30, 50, 14].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Retiradas');
  XLSX.writeFile(wb, `retiradas-epi-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

$('#limpar').onclick = async () => {
  if (!confirm('Apagar todas as retiradas de teste (as feitas pelo app)? Os dados de exemplo continuam.')) return;
  await Store.limpar();
  st.conhecidos = null; st.assinatura = '';
  carregar();
};

let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(render, 150); });

(async () => {
  await Store.init();
  $('#modoTxt').textContent = Store.modo === 'nuvem'
    ? 'online, sincronizado com o app'
    : 'modo local (banco não configurado — dados só neste navegador)';
  renderFiltroArea();
  await carregar();
  setInterval(carregar, 4000);
})();
