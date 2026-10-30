// Cliente mínimo do Upstash Redis (REST), sem dependências.
// A integração da Vercel cria KV_REST_API_URL/KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_*).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const configurado = () => Boolean(URL_ && TOKEN);

async function pipeline(cmds) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

const redis = async (...cmd) => (await pipeline([cmd]))[0];

module.exports = { configurado, pipeline, redis };
