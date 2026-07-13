/* Peruso admin API — runs on Vercel.
   Secrets live in environment variables (Vercel → Settings → Environment Variables):
     ADMIN_PASSWORD  — the password for admin.html
     GITHUB_TOKEN    — fine-grained token, Contents: Read/write on the repo
     GITHUB_REPO     — optional, defaults to mimindel/peruso-love               */

const crypto = require("node:crypto");

const REPO = process.env.GITHUB_REPO || "mimindel/peruso-love";
const BRANCH = "main";
const SAFE_PATH = /^assets\/[a-z0-9][a-z0-9._-]{0,80}\.(webp|jpg|jpeg|png)$/i;

function passwordOk(req) {
  const given = String(req.headers["x-admin-password"] || "");
  const want = String(process.env.ADMIN_PASSWORD || "");
  if (!want) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

function gh(path, opts = {}) {
  const query = opts.method ? "" : `?ref=${BRANCH}&t=${Date.now()}`;
  return fetch(`https://api.github.com/repos/${REPO}/contents/${path}${query}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "peruso-admin",
      ...(opts.headers || {}),
    },
  });
}

async function getSha(path) {
  const r = await gh(path);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${path}: GitHub ${r.status}`);
  return (await r.json()).sha;
}

async function putFile(path, contentB64, message) {
  const sha = await getSha(path);
  const r = await gh(path, {
    method: "PUT",
    body: JSON.stringify({ message, content: contentB64, branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`${path}: GitHub ${r.status} ${j.message || ""}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!passwordOk(req)) return res.status(401).json({ error: "Falsches Passwort" });

  const body = req.body || {};
  try {
    if (body.action === "check") {
      return res.status(200).json({ ok: true });
    }

    if (body.action === "get") {
      const r = await gh("assets/items.json");
      if (!r.ok) throw new Error("items.json: GitHub " + r.status);
      const j = await r.json();
      const data = JSON.parse(Buffer.from(j.content, "base64").toString("utf8"));
      return res.status(200).json(data);
    }

    if (body.action === "upload") {
      const { path, content } = body;
      if (!SAFE_PATH.test(path || "")) return res.status(400).json({ error: "Ungültiger Dateiname" });
      if (!content || typeof content !== "string" || content.length > 4_000_000) {
        return res.status(400).json({ error: "Bild fehlt oder ist zu gross" });
      }
      await putFile(path, content, "Bild hinzugefügt: " + path);
      return res.status(200).json({ ok: true });
    }

    if (body.action === "save") {
      const items = (Array.isArray(body.items) ? body.items : [])
        .map((it) => ({
          img: String(it.img || ""),
          ...(it.w ? { w: +it.w } : {}),
          ...(it.h ? { h: +it.h } : {}),
          year: String(it.year || "").slice(0, 12),
          name: String(it.name || "").slice(0, 60),
          alt: String(it.alt || "").slice(0, 200),
        }))
        .filter((it) => SAFE_PATH.test(it.img));
      const json = JSON.stringify({ items }, null, 2) + "\n";
      await putFile(
        "assets/items.json",
        Buffer.from(json, "utf8").toString("base64"),
        `Carousel aktualisiert (${items.length} Stücke)`
      );
      return res.status(200).json({ ok: true, count: items.length });
    }

    return res.status(400).json({ error: "Unbekannte Aktion" });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
