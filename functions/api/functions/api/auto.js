// functions/api/auto.js
// POST /api/auto  { studyId }
// 1. choisit des mots-clés de l'étude
// 2. les cherche sur Google (Serper, pays Maroc)
// 3. ajoute les boutiques trouvées comme concurrents
// 4. lit leur page publique (titre, description, prix visibles)

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}

function domain(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function publicUrl(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return (
      ["http:", "https:"].includes(u.protocol) &&
      !u.username && !u.password &&
      host !== "localhost" &&
      !host.endsWith(".local") && !host.endsWith(".internal") &&
      !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) &&
      !host.includes(":")
    );
  } catch {
    return false;
  }
}

// Sites qui ne sont pas des concurrents
const SKIP = /(^|\.)(google|youtube|youtu|wikipedia|pinterest|bing|reddit|linkedin|twitter|x|amazon|aliexpress|alibaba|ebay|temu|shein)\.[a-z.]+$/i;
// Réseaux sociaux : on garde le lien, mais on ne peut pas lire la page
const SOCIAL = /(^|\.)(facebook|instagram|tiktok)\.com$/i;

// Un concurrent = un domaine, sauf les réseaux sociaux (un lien par page)
function keyOf(url) {
  const d = domain(url);
  if (!d) return "";
  return SOCIAL.test(d) ? url.split("?")[0].replace(/\/+$/, "") : d;
}

const clean = s =>
  String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

function parsePage(html, url) {
  html = html.slice(0, 150000);
  const title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");

  let description = "";
  for (const tag of (html.slice(0, 40000).match(/<meta\b[^>]*>/gi) || [])) {
    if (/(name|property)\s*=\s*["'](description|og:description)["']/i.test(tag)) {
      const m = tag.match(/content\s*=\s*(["'])([\s\S]*?)\1/i);
      if (m) { description = clean(m[2]); break; }
    }
  }

  const text = clean(
    html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  ).slice(0, 20000);

  const prices = [];
  for (const m of text.matchAll(/(\d[\d\s.,]{0,8})\s?(DH|MAD|dhs?|درهم)/gi)) {
    const p = m[0].replace(/\s+/g, " ").trim();
    if (!prices.includes(p)) prices.push(p);
    if (prices.length >= 5) break;
  }

  return {
    url,
    domain: domain(url),
    title,
    description,
    prices,
    excerpt: text.slice(0, 1500),
    collectedAt: now(),
    status: "ESTIME",
    method: "EXTRACTION_AUTOMATIQUE",
    note: "Extraction indicative. Vérifie les informations sur la page source."
  };
}

async function readPage(url) {
  try {
    let current = url;
    let response;
    for (let i = 0; i < 3; i++) {
      if (!publicUrl(current)) return null;
      response = await fetch(current, {
        redirect: "manual",
        headers: {
          "user-agent": "PackMA-ResearchBot/1.0",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"
        },
        signal: AbortSignal.timeout(7000)
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const loc = response.headers.get("location");
        if (!loc) break;
        current = new URL(loc, current).href;
        continue;
      }
      break;
    }
    if (!response || !response.ok) return null;
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") || "")) return null;
    return parsePage(await response.text(), current);
  } catch {
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Binding D1 manquant : le binding doit être nommé DB." }, 500);
  if (!env.PACK_ACCESS_KEY) return json({ error: "PACK_ACCESS_KEY absent. Configure le secret serveur." }, 500);

  const authorization = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!equal(authorization, env.PACK_ACCESS_KEY)) {
    return json({ error: "Non autorisé : mot de passe Pack.ma requis." }, 401);
  }

  if (!env.SERPER_API_KEY) {
    return json({ error: "SERPER_API_KEY absent. Ajoute ce secret dans Cloudflare Pages (Paramètres, Variables et secrets)." }, 500);
  }

  try {
    const body = await request.json();
    const studyId = String(body.studyId || "");
    const study = await env.DB.prepare("SELECT * FROM studies WHERE id=?").bind(studyId).first();
    if (!study) return json({ error: "Étude introuvable." }, 404);

    let keywords = [];
    try { keywords = JSON.parse(study.keywords_json || "[]"); } catch {}

    // Mots-clés d'achat (FR et AR) : "acheter ... Maroc", "prix ... Maroc", "شراء ...", "سعر ..."
    let queries = keywords.filter(k => /^(acheter|prix) |^(شراء|سعر) /.test(k)).slice(0, 6);
    if (!queries.length) queries = [`${study.product} Maroc`];

    // 1. Recherche Google (Serper), en parallèle
    const searches = await Promise.all(queries.map(q =>
      fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": env.SERPER_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({ q, gl: "ma", hl: "fr", num: 10 })
      })
        .then(async r => (r.ok ? await r.json() : { error: "HTTP " + r.status }))
        .catch(() => ({ error: "réseau" }))
    ));

    if (searches.every(s => s.error)) {
      return json({ error: "La recherche a échoué (" + searches[0].error + "). Vérifie la clé SERPER_API_KEY." }, 502);
    }

    // 2. Boutiques trouvées (sans doublons)
    const { results: existingRows = [] } = await env.DB
      .prepare("SELECT url FROM competitors WHERE study_id=?").bind(studyId).all();
    const known = new Set(existingRows.map(r => keyOf(r.url || "")));

    const found = new Map();
    searches.forEach((s, i) => {
      for (const o of (s.organic || [])) {
        const d = domain(o.link);
        if (!d || SKIP.test(d) || !publicUrl(o.link)) continue;
        const key = keyOf(o.link);
        if (known.has(key) || found.has(key)) continue;
        found.set(key, { url: o.link, title: o.title || "", snippet: o.snippet || "", query: queries[i] });
      }
    });

    const picked = [...found.values()].slice(0, 12);

    // 3. Lecture des pages (en parallèle)
    const pages = await Promise.all(picked.map(p => (SOCIAL.test(domain(p.url)) ? null : readPage(p.url))));

    // 4. Enregistrement dans la base partagée (visible dans Robot 2)
    const names = [];
    for (let i = 0; i < picked.length; i++) {
      const p = picked[i];
      const page = pages[i];
      const name = (clean(page?.title || p.title) || domain(p.url)).slice(0, 120);
      const timestamp = now();
      const data = {
        auto: { source: "SERPER", query: p.query, snippet: p.snippet, foundAt: timestamp }
      };
      if (page) data.publicPage = page;

      await env.DB.prepare("INSERT INTO competitors VALUES(?,?,?,?,?,?,?,?,?)").bind(
        uid(), studyId, name, domain(p.url), p.url, "ESTIME",
        JSON.stringify(data), timestamp, timestamp
      ).run();
      names.push(name);
    }

    return json({
      added: names.length,
      queries: queries.length,
      withPage: pages.filter(Boolean).length,
      names
    });
  } catch (error) {
    return json({ error: error?.message || "Erreur serveur." }, 500);
  }
}
