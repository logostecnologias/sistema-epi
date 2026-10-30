// Dados e armazenamento compartilhados entre o app (index.html) e o painel (painel.html).
// plan = consumo planejado por mês na área · vida = prazo de troca em dias por funcionário

const EMPRESAS = [
  {
    id: 'alfa', nome: 'Alfa Serviços', cnpj: '12.345.678/0001-90',
    funcionarios: ['João Silva', 'Maria Souza', 'Carlos Lima', 'Ana Costa', 'Pedro Rocha'],
    areas: [
      { id: 'manut', nome: 'Manutenção', materiais: [
        { id: 'luva-vaq', nome: 'Luva de vaqueta', unid: 'par', plan: 12, vida: 15 },
        { id: 'oculos', nome: 'Óculos de proteção', unid: 'un', plan: 4, vida: 60 },
        { id: 'protetor', nome: 'Protetor auricular', unid: 'par', plan: 15, vida: 7 },
        { id: 'capacete', nome: 'Capacete', unid: 'un', plan: 2, vida: 365 },
      ]},
      { id: 'limpeza', nome: 'Limpeza', materiais: [
        { id: 'luva-lat', nome: 'Luva de látex', unid: 'par', plan: 20, vida: 5 },
        { id: 'mascara', nome: 'Máscara PFF2', unid: 'un', plan: 25, vida: 3 },
        { id: 'bota', nome: 'Bota de PVC', unid: 'par', plan: 2, vida: 180 },
        { id: 'avental', nome: 'Avental impermeável', unid: 'un', plan: 3, vida: 90 },
      ]},
    ],
  },
  {
    id: 'beta', nome: 'Beta Engenharia', cnpj: '98.765.432/0001-10',
    funcionarios: ['Lucas Alves', 'Fernanda Dias', 'Rafael Melo', 'Juliana Reis'],
    areas: [
      { id: 'obra', nome: 'Obra', materiais: [
        { id: 'capacete', nome: 'Capacete', unid: 'un', plan: 3, vida: 365 },
        { id: 'cinto', nome: 'Cinto paraquedista', unid: 'un', plan: 1, vida: 365 },
        { id: 'luva-vaq', nome: 'Luva de vaqueta', unid: 'par', plan: 16, vida: 15 },
        { id: 'botina', nome: 'Botina de segurança', unid: 'par', plan: 2, vida: 180 },
      ]},
      { id: 'almox', nome: 'Almoxarifado', materiais: [
        { id: 'luva-mal', nome: 'Luva multitato', unid: 'par', plan: 8, vida: 20 },
        { id: 'oculos', nome: 'Óculos de proteção', unid: 'un', plan: 2, vida: 60 },
      ]},
    ],
  },
];

const DIA = 86400000;

function achar(r) {
  const e = EMPRESAS.find((x) => x.id === r.empresaId);
  const a = e && e.areas.find((x) => x.id === r.areaId);
  const m = a && a.materiais.find((x) => x.id === r.matId);
  return { e, a, m };
}

const iniciais = (n) => n.split(' ').map((p) => p[0]).slice(0, 2).join('');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Histórico de exemplo (gerado, sempre igual) ----------
// Dá corpo ao painel na demonstração. Fica marcado como "exemplo" e não tem foto.
function gerarExemplos() {
  let s = 20261028;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  // fator de consumo por material: alguns acima do planejado para gerar alertas
  const fator = { 'alfa|manut|luva-vaq': 1.35, 'alfa|limpeza|mascara': 1.2, 'beta|obra|luva-vaq': 1.25 };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const out = [];
  EMPRESAS.forEach((e) => e.areas.forEach((a) => a.materiais.forEach((m) => {
    const f = fator[`${e.id}|${a.id}|${m.id}`] || (0.55 + rnd() * 0.35);
    // 60 dias de histórico
    let total = Math.round(m.plan * 2 * f);
    while (total > 0) {
      const qtd = m.plan >= 10 ? 1 + Math.floor(rnd() * 2) : 1;
      const dias = Math.floor(rnd() * 60) + 1;
      const d = new Date(hoje.getTime() - dias * DIA);
      d.setHours(6 + Math.floor(rnd() * 11), Math.floor(rnd() * 60));
      out.push({
        id: 'ex-' + out.length, exemplo: true, quando: d.toISOString(),
        empresaId: e.id, areaId: a.id, matId: m.id,
        funcionario: e.funcionarios[Math.floor(rnd() * e.funcionarios.length)],
        qtd, foto: null,
      });
      total -= qtd;
    }
  })));
  return out;
}

// ---------- Armazenamento ----------
// "nuvem": API da Vercel (todos os aparelhos veem os mesmos dados)
// "local": só neste navegador (quando o banco ainda não foi ligado na Vercel)
const Store = (() => {
  let modo = null;
  let idb;
  const abrirIdb = () => idb || (idb = new Promise((res, rej) => {
    const r = indexedDB.open('epi-proto', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('retiradas', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await abrirIdb();
    return new Promise((res, rej) => {
      const t = d.transaction('retiradas', mode);
      const req = fn(t.objectStore('retiradas'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  const exemplos = gerarExemplos();

  return {
    get modo() { return modo; },
    async init() {
      try {
        const r = await fetch('api/retiradas', { cache: 'no-store' });
        modo = r.ok ? 'nuvem' : 'local';
      } catch (_) { modo = 'local'; }
      return modo;
    },
    async reais() {
      if (!modo) await this.init();
      if (modo === 'nuvem') {
        const r = await fetch('api/retiradas', { cache: 'no-store' });
        if (!r.ok) throw new Error('falha ao carregar');
        return (await r.json()).items;
      }
      return (await tx('readonly', (s) => s.getAll())).map((x) => ({ ...x, id: 'l-' + x.id }));
    },
    async listar() {
      return [...(await this.reais()), ...exemplos].sort((a, b) => b.quando.localeCompare(a.quando));
    },
    async adicionar(reg) {
      if (!modo) await this.init();
      if (modo === 'nuvem') {
        const r = await fetch('api/retiradas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reg),
        });
        if (!r.ok) throw new Error('falha ao salvar');
        return (await r.json()).item;
      }
      const id = await tx('readwrite', (s) => s.add(reg));
      return { ...reg, id: 'l-' + id };
    },
    async limpar() {
      if (modo === 'nuvem') await fetch('api/retiradas', { method: 'DELETE' });
      else await tx('readwrite', (s) => s.clear());
    },
  };
})();

// Última retirada do mesmo item pelo mesmo funcionário dentro do prazo de troca
function retiradaAntecipada(lista, empresaId, funcionario, matId, vida, agora = Date.now()) {
  const ult = lista.find((r) => r.empresaId === empresaId && r.funcionario === funcionario && r.matId === matId);
  if (!ult) return null;
  const dias = Math.floor((agora - new Date(ult.quando).getTime()) / DIA);
  return dias < vida ? { ult, dias } : null;
}
