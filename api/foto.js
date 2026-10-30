const { configurado, redis } = require('./_redis');

module.exports = async (req, res) => {
  const id = String(req.query.id || '');
  if (!configurado() || !/^[a-z0-9]+$/.test(id)) return res.status(404).end();

  const dataUrl = await redis('GET', 'epi:foto:' + id).catch(() => null);
  if (!dataUrl) return res.status(404).end();

  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.end(buf);
};
