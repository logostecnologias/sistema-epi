const { configurado, pipeline, redis } = require('./_redis');

const LISTA = 'epi:retiradas';
const MAX = 500;
const CAMPOS = ['quando', 'empresaId', 'areaId', 'matId', 'funcionario', 'qtd', 'antecipada', 'motivo'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configurado()) return res.status(503).json({ erro: 'banco não configurado' });

  try {
    if (req.method === 'GET') {
      const itens = (await redis('LRANGE', LISTA, 0, MAX - 1)).map((s) => JSON.parse(s));
      return res.json({ items: itens });
    }

    if (req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      if (!b.funcionario || !b.matId || !b.empresaId) return res.status(400).json({ erro: 'dados incompletos' });
      if (b.foto && (typeof b.foto !== 'string' || !b.foto.startsWith('data:image/jpeg;base64,') || b.foto.length > 600000)) {
        return res.status(400).json({ erro: 'foto inválida' });
      }
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const item = { id };
      CAMPOS.forEach((k) => { if (b[k] !== undefined) item[k] = b[k]; });
      item.qtd = Math.max(1, Math.min(99, Number(item.qtd) || 1));
      item.quando = new Date().toISOString();
      item.foto = b.foto ? 'api/foto?id=' + id : null;

      const cmds = [];
      if (b.foto) cmds.push(['SET', 'epi:foto:' + id, b.foto]);
      cmds.push(['LPUSH', LISTA, JSON.stringify(item)], ['LTRIM', LISTA, 0, MAX - 1]);
      await pipeline(cmds);
      return res.status(201).json({ item });
    }

    if (req.method === 'DELETE') {
      const itens = (await redis('LRANGE', LISTA, 0, -1)).map((s) => JSON.parse(s));
      const chaves = itens.map((i) => 'epi:foto:' + i.id);
      await redis('DEL', LISTA, ...chaves);
      return res.json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
};
