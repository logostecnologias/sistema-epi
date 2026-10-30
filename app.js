// App da operação (celular): registro de retirada com foto automática.

const $ = (s) => document.querySelector(s);
const state = { empresa: EMPRESAS[0], area: null, func: null, mat: null, qtd: 1, motivo: null, antecipada: null };

// ---------- Formulário ----------
function renderEmpresas() {
  $('#empresa').innerHTML = EMPRESAS.map((e) => `<option value="${e.id}">${e.nome}</option>`).join('');
  $('#empresa').onchange = (ev) => {
    state.empresa = EMPRESAS.find((e) => e.id === ev.target.value);
    state.func = null; state.mat = null;
    renderForm();
    renderHistorico();
  };
}

function renderForm() {
  const e = state.empresa;
  $('#empresaLabel').textContent = `${e.nome} · CNPJ ${e.cnpj}`;

  $('#funcionarios').innerHTML = e.funcionarios.map((f) =>
    `<button type="button" class="chip${state.func === f ? ' sel' : ''}" data-f="${f}"><span class="av">${iniciais(f)}</span>${f}</button>`
  ).join('');
  $('#funcionarios').querySelectorAll('.chip').forEach((b) => b.onclick = () => {
    state.func = b.dataset.f; renderForm();
  });

  if (!state.area || !e.areas.includes(state.area)) state.area = e.areas[0];
  $('#area').innerHTML = e.areas.map((a) => `<option value="${a.id}"${a === state.area ? ' selected' : ''}>${a.nome}</option>`).join('');
  $('#area').onchange = (ev) => {
    state.area = e.areas.find((a) => a.id === ev.target.value);
    state.mat = null; renderForm();
  };

  $('#materiais').innerHTML = state.area.materiais.map((m) =>
    `<button type="button" class="mat${state.mat === m ? ' sel' : ''}" data-m="${m.id}"><strong>${m.nome}</strong><small>Troca a cada ${m.vida} dias</small></button>`
  ).join('');
  $('#materiais').querySelectorAll('.mat').forEach((b) => b.onclick = () => {
    state.mat = state.area.materiais.find((m) => m.id === b.dataset.m); renderForm();
  });

  $('#qtd').textContent = state.qtd;
  $('#confirmar').disabled = !(state.func && state.mat);
}

$('#menos').onclick = () => { state.qtd = Math.max(1, state.qtd - 1); renderForm(); };
$('#mais').onclick = () => { state.qtd = Math.min(99, state.qtd + 1); renderForm(); };

// ---------- Confirmar: checa prazo de troca antes da foto ----------
$('#confirmar').onclick = async () => {
  state.motivo = null; state.antecipada = null;
  let lista = [];
  try { lista = await Store.listar(); } catch (_) {}
  const ant = retiradaAntecipada(lista, state.empresa.id, state.func, state.mat.id, state.mat.vida);
  if (!ant) return abrirCamera();

  state.antecipada = ant;
  const quando = ant.dias === 0 ? 'hoje' : ant.dias === 1 ? 'ontem' : `há ${ant.dias} dias`;
  $('#avisoTxt').innerHTML =
    `<strong>${esc(state.func)}</strong> já retirou <strong>${esc(state.mat.nome)}</strong> ${quando}. ` +
    `O prazo de troca deste item é de ${state.mat.vida} dias. Informe o motivo para continuar — fica registrado no painel.`;
  $('#motivos').querySelectorAll('.chip').forEach((c) => c.classList.remove('sel'));
  $('#avisoOk').disabled = true;
  $('#aviso').hidden = false;
};
$('#motivos').querySelectorAll('.chip').forEach((c) => c.onclick = () => {
  $('#motivos').querySelectorAll('.chip').forEach((x) => x.classList.toggle('sel', x === c));
  state.motivo = c.textContent;
  $('#avisoOk').disabled = false;
});
$('#avisoCancel').onclick = () => { $('#aviso').hidden = true; };
$('#avisoOk').onclick = () => { $('#aviso').hidden = true; abrirCamera(); };

// ---------- Câmera ----------
let stream = null;
let cancelado = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function pararCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  $('#video').srcObject = null;
}

function fecharCamera() {
  cancelado = true;
  pararCamera();
  $('#camera').hidden = true;
}

async function abrirCamera() {
  cancelado = false;
  $('#camNome').textContent = state.func;
  $('#camItem').textContent = `${state.qtd}× ${state.mat.nome} · ${state.area.nome}`;
  $('#camErro').hidden = true;
  $('#countdown').textContent = '';
  $('#camMsg').textContent = 'Abrindo câmera…';
  $('#camera').hidden = false;

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return erroCamera('A câmera só funciona em conexão segura (https). Abra pelo link da Vercel.');
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
  } catch (err) {
    const msg = err.name === 'NotAllowedError'
      ? 'O acesso à câmera foi negado. Libere a câmera para este site nas configurações do navegador e tente de novo.'
      : err.name === 'NotFoundError'
        ? 'Nenhuma câmera encontrada neste aparelho.'
        : 'Não foi possível abrir a câmera (' + err.name + ').';
    return erroCamera(msg);
  }
  if (cancelado) return pararCamera();

  const video = $('#video');
  video.srcObject = stream;
  try { await video.play(); } catch (_) {}
  while (!video.videoWidth && !cancelado) await wait(50);

  // dá um tempo pro sensor ajustar a exposição
  $('#camMsg').textContent = 'Olhe para a câmera';
  await wait(700);

  for (const n of [3, 2, 1]) {
    if (cancelado) return;
    const c = $('#countdown');
    c.textContent = n;
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    await wait(850);
  }
  if (cancelado) return;

  $('#countdown').textContent = '';
  const f = $('#flash');
  f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');

  const foto = capturar(video);
  pararCamera();
  $('#camMsg').textContent = 'Enviando…';
  try {
    await salvar(foto);
  } catch (_) {
    erroCamera('Não foi possível salvar a retirada. Verifique a internet e tente de novo.');
  }
}

function erroCamera(msg) {
  pararCamera();
  $('#camErroTxt').textContent = msg;
  $('#camErro').hidden = false;
}

function capturar(video) {
  const W = 720;
  const H = Math.round(W * video.videoHeight / video.videoWidth);
  const band = 92;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H + band;
  const ctx = cv.getContext('2d');

  // espelhada, igual ao que a pessoa viu na tela
  ctx.save();
  ctx.translate(W, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore();

  // faixa de identificação gravada na própria foto
  const agora = new Date();
  ctx.fillStyle = '#0E0E10';
  ctx.fillRect(0, H, W, band);
  ctx.fillStyle = '#F47B20';
  ctx.fillRect(0, H, W, 5);
  ctx.fillStyle = '#fff';
  ctx.font = '600 24px Poppins, sans-serif';
  ctx.fillText(`${state.func} — ${state.qtd}× ${state.mat.nome}`, 20, H + 40);
  ctx.fillStyle = '#B5B5BD';
  ctx.font = '400 18px Poppins, sans-serif';
  ctx.fillText(`${state.empresa.nome} · ${state.area.nome} · ${agora.toLocaleString('pt-BR')}`, 20, H + 72);

  return { dataUrl: cv.toDataURL('image/jpeg', 0.72), quando: agora.toISOString() };
}

async function salvar({ dataUrl, quando }) {
  const reg = {
    quando,
    empresaId: state.empresa.id, areaId: state.area.id, matId: state.mat.id,
    funcionario: state.func, qtd: state.qtd,
    foto: dataUrl,
  };
  if (state.antecipada) { reg.antecipada = state.antecipada.dias; reg.motivo = state.motivo; }
  const salvo = await Store.adicionar(reg);
  $('#camera').hidden = true;
  mostrarSucesso({ ...salvo, foto: dataUrl });
}

function mostrarSucesso(r) {
  const { e, a, m } = achar(r);
  $('#okFoto').src = r.foto;
  const linhas = [
    ['Funcionário', r.funcionario],
    ['Material', `${r.qtd} ${m.unid} · ${m.nome}`],
    ['Área', a.nome],
    ['Empresa', e.nome],
    ['Data e hora', new Date(r.quando).toLocaleString('pt-BR')],
  ];
  if (r.motivo) linhas.push(['Antes do prazo', r.motivo]);
  $('#okDados').innerHTML = linhas.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('#sucesso').hidden = false;
  $('#sucesso').scrollTop = 0;
}

$('#camCancel').onclick = fecharCamera;
$('#camErroCancel').onclick = fecharCamera;
$('#camRetry').onclick = abrirCamera;
$('#novaRetirada').onclick = () => {
  $('#sucesso').hidden = true;
  state.func = null; state.mat = null; state.qtd = 1;
  renderForm();
  renderHistorico();
};

// ---------- Retiradas recentes (só as reais, com foto) ----------
async function renderHistorico() {
  let todos = [];
  try { todos = (await Store.reais()).filter((r) => r.empresaId === state.empresa.id); } catch (_) {}
  todos.sort((a, b) => b.quando.localeCompare(a.quando));
  $('#histCount').textContent = todos.length;

  if (!todos.length) {
    $('#lista').innerHTML = '<div class="vazio">Nenhuma retirada registrada ainda.<br>Faça uma na aba Retirar.</div>';
    return;
  }
  $('#lista').innerHTML = todos.map((r, i) => {
    const { a, m } = achar(r);
    return `
    <div class="item">
      ${r.foto ? `<img src="${r.foto}" alt="" data-i="${i}">` : '<img alt="">'}
      <div class="info">
        <strong>${esc(r.funcionario)}${r.motivo ? '<span class="tag-ant">antes do prazo</span>' : ''}</strong>
        <span>${m ? m.nome : r.matId} · ${a ? a.nome : r.areaId}</span>
        <time>${new Date(r.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
      </div>
      <div class="q">${r.qtd}</div>
    </div>`;
  }).join('');
  $('#lista').querySelectorAll('img[data-i]').forEach((img) => img.onclick = () => {
    $('#zoomImg').src = todos[img.dataset.i].foto;
    $('#zoom').hidden = false;
  });
}
$('#zoom').onclick = () => { $('#zoom').hidden = true; };

// ---------- Abas ----------
document.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + t.dataset.view));
  if (t.dataset.view === 'historico') renderHistorico();
  window.scrollTo(0, 0);
});

// ---------- Instalação (PWA) ----------
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
let dispensado = false;
try { dispensado = localStorage.getItem('install-dismiss') === '1'; } catch (_) {}
let promptInstall = null;

$('#installClose').onclick = () => {
  $('#installHint').hidden = true;
  try { localStorage.setItem('install-dismiss', '1'); } catch (_) {}
};
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstall = e;
  if (dispensado || standalone) return;
  $('#installTxt').textContent = 'Instale o app na tela inicial do celular.';
  $('#installBtn').hidden = false;
  $('#installHint').hidden = false;
});
$('#installBtn').onclick = async () => {
  if (!promptInstall) return;
  promptInstall.prompt();
  await promptInstall.userChoice;
  promptInstall = null;
  $('#installHint').hidden = true;
};
if (isIOS && !standalone && !dispensado) {
  $('#installTxt').textContent = 'Para instalar: toque em Compartilhar e depois em "Adicionar à Tela de Início".';
  $('#installHint').hidden = false;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

renderEmpresas();
renderForm();
Store.init().then((modo) => {
  const el = $('#modo');
  el.className = 'modo ' + modo;
  el.title = modo === 'nuvem' ? 'Online — sincronizado com o painel' : 'Modo local — dados só neste aparelho';
});
