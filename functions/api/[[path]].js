
const out = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

const parseJson = (value, fallback = {}) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
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
      !u.username &&
      !u.password &&
      host !== "localhost" &&
      !host.endsWith(".local") &&
      !host.endsWith(".internal") &&
      !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) &&
      !host.includes(":")
    );
  } catch {
    return false;
  }
}

function parsePage(html, url) {
  const text = value =>
    String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();

  const title = text(
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ""
  );

  function meta(name) {
    const tags = html.match(/<meta\b[^>]*>/gi) || [];

    for (const tag of tags) {
      const attrs = {};

      for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
        attrs[match[1].toLowerCase()] = match[3];
      }

      if (
        (attrs.name || attrs.property || "").toLowerCase() ===
        name.toLowerCase()
      ) {
        return text(attrs.content || "");
      }
    }

    return "";
  }

  const body = text(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<(nav|footer|header|noscript)\b[\s\S]*?<\/\1>/gi, " ")
  ).slice(0, 6000);

  return {
    url,
    domain: domain(url),
    title,
    description: meta("description") || meta("og:description"),
    ogTitle: meta("og:title"),
    excerpt: body.slice(0, 4000),
    collectedAt: now(),
    status: "ESTIME",
    method: "EXTRACTION_PAGE_PUBLIQUE",
    note: "Extraction indicative. Vérifie les informations sur la page source."
  };
}

async function extract(url) {
  if (!publicUrl(url)) {
    throw new Error("URL refusée : indique une adresse HTTP(S) publique valide.");
  }

  let current = url;
  let response;

  for (let i = 0; i < 4; i++) {
    if (!publicUrl(current)) {
      throw new Error("Redirection non autorisée.");
    }

    response = await fetch(current, {
      redirect: "manual",
      headers: {
        "user-agent": "PackMA-ResearchBot/1.0",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"
      },
      signal: AbortSignal.timeout(10000)
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) break;
      current = new URL(location, current).href;
      continue;
    }

    break;
  }

  if (!response?.ok) {
    throw new Error(
      "Le site a répondu HTTP " + (response?.status || "sans réponse") +
      ". Il peut bloquer l'extraction."
    );
  }

  if (!/text\/html|application\/xhtml\+xml/i.test(
    response.headers.get("content-type") || ""
  )) {
    throw new Error("La réponse n'est pas une page HTML publique.");
  }

  const html = (await response.text()).slice(0, 1000000);
  return parsePage(html, current);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/health") {
    return out({
      ok: true,
      service: "Pack.ma API",
      databaseConfigured: !!env.DB,
      time: now()
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (!env.DB) {
    return out({
      error: "Binding D1 manquant : le binding doit être nommé DB."
    }, 500);
  }

  if (!env.PACK_ACCESS_KEY) {
    return out({
      error: "PACK_ACCESS_KEY absent. Configure le secret serveur."
    }, 500);
  }

  const authorization = (
    request.headers.get("authorization") || ""
  ).replace(/^Bearer\s+/i, "");

  if (!equal(authorization, env.PACK_ACCESS_KEY)) {
    return out({ error: "Non autorisé : mot de passe Pack.ma requis." }, 401);
  }

  try {
    // Liste des études
    if (path === "/api/studies" && request.method === "GET") {
      const { results = [] } = await env.DB.prepare(
        "SELECT * FROM studies ORDER BY updated_at DESC LIMIT 100"
      ).all();

      return out({
        studies: results.map(row => ({
          ...row,
          variants: parseJson(row.variants_json, []),
          keywords: parseJson(row.keywords_json, [])
        }))
      });
    }

    // Créer une étude
    if (path === "/api/studies" && request.method === "POST") {
      const body = await request.json();
      const product = String(body.product || "").trim().slice(0, 200);

      if (!product) {
        return out({ error: "Le nom du produit est obligatoire." }, 400);
      }

      const id = uid();
      const timestamp = now();
      const market = String(body.market || "Maroc").slice(0, 100);
      const variants = Array.isArray(body.variants)
        ? body.variants.slice(0, 50)
        : [];
      const keywords = Array.isArray(body.keywords)
        ? body.keywords.slice(0, 200)
        : [];

      await env.DB.prepare(
        "INSERT INTO studies VALUES(?,?,?,?,?,?,?)"
      ).bind(
        id,
        product,
        market,
        JSON.stringify(variants),
        JSON.stringify(keywords),
        timestamp,
        timestamp
      ).run();

      return out({
        study: {
          id,
          product,
          market,
          variants,
          keywords,
          created_at: timestamp,
          updated_at: timestamp
        }
      }, 201);
    }

    // Liste des concurrents d'une étude
    if (path === "/api/competitors" && request.method === "GET") {
      const studyId = url.searchParams.get("studyId");

      if (!studyId) {
        return out({ error: "studyId est obligatoire." }, 400);
      }

      const { results = [] } = await env.DB.prepare(
        "SELECT * FROM competitors WHERE study_id=? ORDER BY updated_at DESC"
      ).bind(studyId).all();

      return out({
        competitors: results.map(row => ({
          ...row,
          data: parseJson(row.data_json, {})
        }))
      });
    }

    // Ajouter un concurrent
    if (path === "/api/competitors" && request.method === "POST") {
      const body = await request.json();
      const studyId = String(body.studyId || "");
      const name = String(body.name || "").trim().slice(0, 200);
      const site = String(body.url || "").trim();

      if (!studyId || !name) {
        return out({
          error: "studyId et nom du concurrent sont obligatoires."
        }, 400);
      }

      const study = await env.DB.prepare(
        "SELECT id FROM studies WHERE id=?"
      ).bind(studyId).first();

      if (!study) {
        return out({ error: "Étude introuvable." }, 404);
      }

      if (site && !publicUrl(site)) {
        return out({ error: "URL publique invalide." }, 400);
      }

      const id = uid();
      const timestamp = now();
      const data = body.data && typeof body.data === "object"
        ? body.data
        : {};

      await env.DB.prepare(
        "INSERT INTO competitors VALUES(?,?,?,?,?,?,?,?,?)"
      ).bind(
        id,
        studyId,
        name,
        site ? domain(site) : "",
        site,
        "A_VERIFIER",
        JSON.stringify(data),
        timestamp,
        timestamp
      ).run();

      return out({
        competitor: {
          id,
          study_id: studyId,
          name,
          domain: site ? domain(site) : "",
          url: site,
          status: "A_VERIFIER",
          data,
          created_at: timestamp,
          updated_at: timestamp
        }
      }, 201);
    }

    // Modifier un concurrent
    if (path === "/api/competitors" && request.method === "PATCH") {
      const body = await request.json();
      const id = String(body.id || "");

      if (!id) {
        return out({ error: "id est obligatoire." }, 400);
      }

      const old = await env.DB.prepare(
        "SELECT * FROM competitors WHERE id=?"
      ).bind(id).first();

      if (!old) {
        return out({ error: "Concurrent introuvable." }, 404);
      }

      const name = body.name == null
        ? old.name
        : String(body.name).trim().slice(0, 200);

      const site = body.url == null
        ? (old.url || "")
        : String(body.url).trim();

      if (site && !publicUrl(site)) {
        return out({ error: "URL invalide." }, 400);
      }

      const data = body.data && typeof body.data === "object"
        ? body.data
        : parseJson(old.data_json, {});

      const status = String(body.status || old.status || "A_VERIFIER");

      await env.DB.prepare(
        "UPDATE competitors SET name=?,domain=?,url=?,status=?,data_json=?,updated_at=? WHERE id=?"
      ).bind(
        name,
        site ? domain(site) : "",
        site,
        status,
        JSON.stringify(data),
        now(),
        id
      ).run();

      const row = await env.DB.prepare(
        "SELECT * FROM competitors WHERE id=?"
      ).bind(id).first();

      return out({
        competitor: {
          ...row,
          data: parseJson(row.data_json, {})
        }
      });
    }

    // Extraction indicative d'une page publique
    if (path === "/api/collect" && request.method === "POST") {
      const body = await request.json();
      const result = await extract(String(body.url || ""));
      return out({ result });
    }

    // Historique des observations d'un concurrent
    if (path === "/api/observations" && request.method === "GET") {
      const competitorId = url.searchParams.get("competitorId");

      if (!competitorId) {
        return out({ error: "competitorId est obligatoire." }, 400);
      }

      const { results = [] } = await env.DB.prepare(
        "SELECT * FROM observations WHERE competitor_id=? ORDER BY period_start DESC,collected_at DESC LIMIT 500"
      ).bind(competitorId).all();

      return out({ observations: results });
    }

    // Ajouter une observation
    if (path === "/api/observations" && request.method === "POST") {
      const body = await request.json();
      const competitorId = String(body.competitorId || "");
      const metric = String(body.metric || "").trim().slice(0, 100);

      if (!competitorId || !metric) {
        return out({
          error: "competitorId et metric sont obligatoires."
        }, 400);
      }

      const competitor = await env.DB.prepare(
        "SELECT id FROM competitors WHERE id=?"
      ).bind(competitorId).first();

      if (!competitor) {
        return out({ error: "Concurrent introuvable." }, 404);
      }

      const value = body.value === "" || body.value == null
        ? null
        : Number(body.value);

      if (value !== null && !Number.isFinite(value)) {
        return out({ error: "Valeur numérique invalide." }, 400);
      }

      const id = uid();
      const timestamp = now();

      const observation = {
        id,
        competitor_id: competitorId,
        metric,
        value,
        unit: String(body.unit || ""),
        period_start: String(body.periodStart || ""),
        period_end: String(body.periodEnd || ""),
        collected_at: String(body.collectedAt || timestamp),
        source_url: String(body.sourceUrl || ""),
        method: String(body.method || "MANUEL"),
        status: String(body.status || "A_VERIFIER"),
        evidence: String(body.evidence || ""),
        created_at: timestamp
      };

      await env.DB.prepare(
        "INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
      ).bind(
        observation.id,
        observation.competitor_id,
        observation.metric,
        observation.value,
        observation.unit,
        observation.period_start,
        observation.period_end,
        observation.collected_at,
        observation.source_url,
        observation.method,
        observation.status,
        observation.evidence,
        observation.created_at
      ).run();

      return out({ observation }, 201);
    }

    return out({ error: "Route ou méthode inconnue." }, 404);
  } catch (error) {
    return out({
      error: error?.message || "Erreur serveur."
    }, 500);
  }
}
