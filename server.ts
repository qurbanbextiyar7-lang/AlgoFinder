import "dotenv/config";
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import * as cheerio from "cheerio";
import {
  chromium as webEngineCore,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
} from "playwright-core";
import type {
  AnalyzedResearchSource,
  ChromeDocumentPayload,
  ChromeStyleSheet,
  ImageResult,
  ImageSearchResponse,
  OpenSiteResponse,
  PageLink,
  PopularSiteShortcut,
  ReaderBlock,
  ResearchReport,
  SearchMode,
  SearchResponse,
  SearchResultItem,
  YouTubePageData,
  YouTubeVideoItem,
} from "./src/types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

const POPULAR_SITES: PopularSiteShortcut[] = [
  {
    name: "Vikipedi (Türkçe)",
    domain: "tr.wikipedia.org",
    url: "https://tr.wikipedia.org/wiki/Anasayfa",
    category: "Ansiklopedi",
    description: "Özgür, hızlı ve reklam içermeyen küresel bilgi ansiklopedisi.",
    keywords: ["vikipedi", "wikipedia", "wiki", "ansiklopedi", "bilgi"],
  },
  {
    name: "YouTube",
    domain: "www.youtube.com",
    url: "https://www.youtube.com",
    category: "Video",
    description: "Dünyanın en popüler video paylaşım ve canlı yayın platformu.",
    keywords: ["youtube", "yt", "video", "izle", "müzik"],
  },
  {
    name: "GitHub",
    domain: "github.com",
    url: "https://github.com",
    category: "Yazılım",
    description: "Açık kaynak projeler, kod depoları ve geliştirici topluluğu.",
    keywords: ["github", "git", "kod", "yazılım", "repo", "open source"],
  },
  {
    name: "BBC News Türkçe",
    domain: "www.bbc.com",
    url: "https://www.bbc.com/turkce",
    category: "Haber",
    description: "Türkiye ve dünyadan güncel haberler, analizler ve dosya konuları.",
    keywords: ["bbc", "bbc türkçe", "haber", "haberler", "gündem", "dünya"],
  },
  {
    name: "TDK Sözlük",
    domain: "sozluk.gov.tr",
    url: "https://sozluk.gov.tr",
    category: "Dil & Kaynak",
    description: "Türk Dil Kurumu güncel Türkçe sözlük ve yazım kılavuzu.",
    keywords: ["tdk", "sözlük", "türkçe", "yazım", "anlam", "kelime"],
  },
  {
    name: "MDN Web Docs",
    domain: "developer.mozilla.org",
    url: "https://developer.mozilla.org/en-US/",
    category: "Geliştirici",
    description: "Web standartları, HTML, CSS ve JavaScript referans dokümantasyonu.",
    keywords: ["mdn", "mozilla", "javascript", "html", "css", "web"],
  },
  {
    name: "Wikimedia Commons",
    domain: "commons.wikimedia.org",
    url: "https://commons.wikimedia.org/wiki/Main_Page",
    category: "Fotoğraf",
    description: "Milyonlarca özgür lisanslı fotoğraf, illüstrasyon ve medya arşivi.",
    keywords: ["wikimedia", "commons", "fotoğraf", "resim", "görsel"],
  },
  {
    name: "Hacker News",
    domain: "news.ycombinator.com",
    url: "https://news.ycombinator.com",
    category: "Teknoloji",
    description: "Teknoloji, girişimcilik ve bilgisayar bilimleri gündem akışı.",
    keywords: ["hacker news", "hn", "ycombinator", "teknoloji", "startup"],
  },
  {
    name: "TRT Haber",
    domain: "www.trthaber.com",
    url: "https://www.trthaber.com",
    category: "Haber",
    description: "Son dakika haberleri, ekonomi, spor ve teknoloji gelişmeleri.",
    keywords: ["trt", "trt haber", "son dakika", "haberler", "türkiye"],
  },
  {
    name: "Stack Overflow",
    domain: "stackoverflow.com",
    url: "https://stackoverflow.com",
    category: "Yazılım",
    description: "Programlama soru-cevap arşivi ve teknik çözüm topluluğu.",
    keywords: ["stack overflow", "stackoverflow", "programlama", "hata", "python", "react"],
  },
  {
    name: "ChatGPT",
    domain: "chatgpt.com",
    url: "https://chatgpt.com",
    category: "Yapay Zeka",
    description: "Soruları yanıtlamak, yazmak, kod yazmak ve üretkenlik için OpenAI yapay zeka asistanı.",
    keywords: ["chatgpt", "chat.openai.com", "chatgpt.com", "sohbet ai"],
  },
  {
    name: "OpenAI",
    domain: "openai.com",
    url: "https://openai.com",
    category: "Yapay Zeka",
    description: "Yapay zeka araştırmaları, modeller ve ürün duyuruları.",
    keywords: ["openai", "yapay zeka", "ai"],
  },
  {
    name: "e-Devlet Kapısı",
    domain: "www.turkiye.gov.tr",
    url: "https://www.turkiye.gov.tr",
    category: "Kamu",
    description: "Türkiye Cumhuriyeti resmi dijital kamu hizmetleri kapısı.",
    keywords: ["edevlet", "e-devlet", "turkiye.gov.tr", "resmi", "kamu"],
  },
];

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Upgrade-Insecure-Requests": "1",
};

function isPrivateOrBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }
  const ipv4Match = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }
  return false;
}

function normalizeUrlInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    if (!/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/.*)?$/.test(candidate)) {
      return null;
    }
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname.includes(".")) return null;
    if (isPrivateOrBlockedHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getDomain(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, "");
  } catch {
    return urlStr;
  }
}

function findInstantPopularMatch(query: string): PopularSiteShortcut | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  for (const site of POPULAR_SITES) {
    if (
      site.name.toLowerCase() === q ||
      site.domain.toLowerCase().replace(/^www\./, "") === q.replace(/^www\./, "") ||
      site.keywords.some((kw) => kw === q)
    ) {
      return site;
    }
  }

  // Only match multi-word queries if they look like a direct site-opening command (<= 3 words)
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length <= 3) {
    const hasNavIntent = words.some((w) =>
      ["aç", "git", "sitesi", "giriş", "ana", "sayfa", "app", "web"].includes(w)
    );
    if (hasNavIntent) {
      for (const site of POPULAR_SITES) {
        if (
          site.keywords.some((kw) => words.includes(kw)) ||
          words.some((w) => site.domain.toLowerCase().includes(w) && w.length >= 4)
        ) {
          return site;
        }
      }
    }
  }

  return null;
}

async function resolveRedirectUrl(url: string): Promise<string> {
  if (!url.includes("vertexaisearch.cloud.google.com/grounding-api-redirect")) {
    return url;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
    const loc = res.headers.get("location");
    if (loc && /^https?:\/\//i.test(loc)) {
      return loc;
    }
    const getRes = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
    if (getRes.url && !getRes.url.includes("vertexaisearch.cloud.google.com")) {
      return getRes.url;
    }
  } catch {
    // Keep original url on timeout
  } finally {
    clearTimeout(timeout);
  }
  return url;
}

async function fetchWikipediaFastResults(query: string): Promise<{
  summary: string;
  results: SearchResultItem[];
}> {
  const encoded = encodeURIComponent(query);
  const endpoints = [
    `https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srlimit=4&format=json&utf8=1`,
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srlimit=3&format=json&utf8=1`,
  ];

  const results: SearchResultItem[] = [];
  let summary = "";

  try {
    const responses = await Promise.all(
      endpoints.map(async (ep) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
          const r = await fetch(ep, { signal: controller.signal, headers: BROWSER_HEADERS });
          if (!r.ok) return null;
          return (await r.json()) as {
            query?: { search?: Array<{ title: string; snippet: string; pageid: number }> };
          };
        } catch {
          return null;
        } finally {
          clearTimeout(timer);
        }
      })
    );

    const langHosts = ["tr.wikipedia.org", "en.wikipedia.org"];
    responses.forEach((data, idx) => {
      const host = langHosts[idx];
      const items = data?.query?.search ?? [];
      for (const item of items) {
        const cleanSnippet = cheerio.load(item.snippet).text().replace(/\s+/g, " ").trim();
        const pageUrl = `https://${host}/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
        if (!summary && idx === 0 && cleanSnippet) {
          summary = cleanSnippet;
        }
        results.push({
          id: `wiki-${idx}-${item.pageid}`,
          title: `${item.title} — Vikipedi`,
          url: pageUrl,
          domain: host,
          snippet: cleanSnippet || `${item.title} hakkında ansiklopedik bilgi ve kaynaklar.`,
          popularityLabel: idx === 0 ? "Popüler Türkçe Kaynak" : "Küresel Referans",
        });
      }
    });
  } catch {
    // ignore
  }

  return { summary, results };
}

async function fetchDuckDuckGoHtmlSearch(
  query: string,
  limit = 10
): Promise<SearchResultItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: {
          ...BROWSER_HEADERS,
          Referer: "https://html.duckduckgo.com/",
        },
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const items: SearchResultItem[] = [];
    const seenDomains = new Set<string>();

    $(".result").each((idx, el) => {
      if (items.length >= limit) return;
      if ($(el).hasClass("result--ad")) return;
      const $a = $(el).find(".result__a").first();
      const title = $a.text().replace(/\s+/g, " ").trim();
      const rawHref = $a.attr("href") ?? "";
      if (!title || !rawHref) return;

      let resolvedUrl = rawHref;
      try {
        const ddgUrl = new URL(rawHref, "https://duckduckgo.com");
        const uddg = ddgUrl.searchParams.get("uddg");
        if (uddg) resolvedUrl = uddg;
      } catch {
        // keep rawHref
      }

      if (resolvedUrl.includes("duckduckgo.com/y.js")) return;
      const validUrl = normalizeUrlInput(resolvedUrl);
      if (!validUrl) return;
      const dom = getDomain(validUrl);
      if (seenDomains.has(dom) && items.length < 6) return;
      seenDomains.add(dom);

      const snippet = $(el).find(".result__snippet").text().replace(/\s+/g, " ").trim();
      items.push({
        id: `ddg-${idx}-${dom}`,
        title,
        url: validUrl,
        domain: dom,
        snippet: snippet || `${dom} üzerinden açık web sonucu.`,
        popularityLabel: items.length === 0 ? "En Popüler Web Sonucu" : "Açık İnternet Kaynağı",
      });
    });

    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDuckDuckGoLiteSearch(
  query: string,
  limit = 8
): Promise<SearchResultItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: {
          ...BROWSER_HEADERS,
          Referer: "https://lite.duckduckgo.com/",
        },
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const items: SearchResultItem[] = [];
    const seen = new Set<string>();

    $("a.result-link").each((idx, el) => {
      if (items.length >= limit) return;
      const title = $(el).text().replace(/\s+/g, " ").trim();
      let href = $(el).attr("href") ?? "";
      try {
        const u = new URL(href, "https://lite.duckduckgo.com");
        const uddg = u.searchParams.get("uddg");
        if (uddg) href = uddg;
      } catch {
        // ignore
      }
      if (!title || href.includes("duckduckgo.com/y.js")) return;
      const validUrl = normalizeUrlInput(href);
      if (!validUrl || seen.has(validUrl)) return;
      seen.add(validUrl);

      const snippet = $(el)
        .closest("tr")
        .next("tr")
        .find(".result-snippet")
        .text()
        .replace(/\s+/g, " ")
        .trim();

      const dom = getDomain(validUrl);
      items.push({
        id: `ddglite-${idx}-${dom}`,
        title,
        url: validUrl,
        domain: dom,
        snippet: snippet || `${dom} açık web sonucu.`,
        popularityLabel: "Açık Web Dizini",
      });
    });

    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function isGoogleLogoAsset(title: string, urlStr: string): boolean {
  const combined = `${title} ${urlStr}`.toLowerCase();
  return (
    combined.includes("google.com/images/branding") ||
    combined.includes("gstatic.com") ||
    combined.includes("googlelogo") ||
    /google.*(logo|wordmark|icon|doodle|favicon|brand|badge)/i.test(combined) ||
    /(logo|wordmark|icon|doodle).*google/i.test(combined)
  );
}

function isGoogleSearchDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return (
    /^(?:[a-z0-9-]+\.)*google(?:\.[a-z]{2,3})+$/i.test(lower) ||
    lower.includes("vertexaisearch.cloud.google.com")
  );
}

function decodeBingRedirectUrl(rawHref: string): string {
  try {
    const u = new URL(rawHref, "https://www.bing.com");
    if (u.hostname.endsWith("bing.com") && u.pathname.startsWith("/ck/")) {
      const encoded = u.searchParams.get("u");
      if (encoded && encoded.startsWith("a1")) {
        const b64 = encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/");
        const decoded = Buffer.from(b64, "base64").toString("utf8");
        if (/^https?:\/\//i.test(decoded)) {
          return decoded;
        }
      }
    }
  } catch {
    // ignore
  }
  return rawHref;
}

async function fetchHackerNewsAlgolia(
  query: string,
  limit = 4
): Promise<SearchResultItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3200);
  try {
    const res = await fetch(
      `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${limit}&tags=story`,
      { signal: controller.signal, headers: BROWSER_HEADERS }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      hits?: Array<{
        objectID?: string;
        title?: string;
        url?: string;
        points?: number;
        num_comments?: number;
      }>;
    };
    const items: SearchResultItem[] = [];
    for (const hit of data.hits ?? []) {
      if (!hit.title) continue;
      const targetUrl = hit.url
        ? normalizeUrlInput(hit.url)
        : `https://news.ycombinator.com/item?id=${hit.objectID}`;
      if (!targetUrl) continue;
      const dom = getDomain(targetUrl);
      items.push({
        id: `hn-${hit.objectID ?? Math.random()}`,
        title: hit.title,
        url: targetUrl,
        domain: dom,
        snippet: `${hit.points ?? 0} puan · ${hit.num_comments ?? 0} yorum — küresel teknoloji ve araştırma tartışması.`,
        popularityLabel: "Küresel Teknoloji Tartışması",
      });
    }
    return items;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGitHubReposForQuery(
  query: string,
  limit = 3
): Promise<SearchResultItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3200);
  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "AlgoFind-Research/1.0",
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        id: number;
        full_name: string;
        html_url: string;
        description?: string;
        stargazers_count?: number;
        language?: string;
      }>;
    };
    return (data.items ?? []).map((repo) => ({
      id: `gh-${repo.id}`,
      title: `${repo.full_name} — GitHub`,
      url: repo.html_url,
      domain: "github.com",
      snippet: `${repo.description ? `${repo.description} ` : ""}(${(repo.stargazers_count ?? 0).toLocaleString("tr-TR")} yıldız${repo.language ? ` · ${repo.language}` : ""})`,
      popularityLabel: "Açık Kaynak Proje",
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function readLiveWebPagesForResearch(
  candidates: SearchResultItem[],
  maxPages = 4
): Promise<AnalyzedResearchSource[]> {
  const selected: SearchResultItem[] = [];
  const seenHosts = new Set<string>();

  for (const item of candidates) {
    if (selected.length >= maxPages) break;
    const dom = item.domain.toLowerCase();
    if (seenHosts.has(dom)) continue;
    // Skip video watch pages or binary files where live text reading adds little
    if (dom.includes("youtube.com") || dom.includes("youtu.be") || /\.(pdf|zip|jpg|png)$/i.test(item.url)) {
      continue;
    }
    seenHosts.add(dom);
    selected.push(item);
  }

  const fetched = await Promise.all(
    selected.map(async (item, idx): Promise<AnalyzedResearchSource | null> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3600);
      try {
        const res = await fetch(item.url, {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
          headers: BROWSER_HEADERS,
        });
        if (!res.ok) return null;
        const ctype = res.headers.get("content-type") ?? "";
        if (!ctype.includes("text/html") && !ctype.includes("application/xhtml")) return null;
        const html = await res.text();
        const $ = cheerio.load(html);
        $("script, style, noscript, iframe, svg, canvas, footer, nav, aside, form").remove();

        const title = $("title").first().text().replace(/\s+/g, " ").trim() || item.title;
        const root = $("main").first().length > 0 ? $("main").first() : $("article").first().length > 0 ? $("article").first() : $("body").first();

        const headings: string[] = [];
        root.find("h1, h2, h3").each((_, h) => {
          if (headings.length >= 5) return;
          const t = $(h).text().replace(/\s+/g, " ").trim();
          if (t.length >= 4 && t.length <= 120 && !headings.includes(t)) {
            headings.push(t);
          }
        });

        const paragraphs: string[] = [];
        root.find("p").each((_, p) => {
          if (paragraphs.length >= 4) return;
          const t = $(p).text().replace(/\s+/g, " ").trim();
          if (t.length >= 45 && t.length <= 420 && !/cookie|çerez|javascript|subscribe/i.test(t)) {
            paragraphs.push(t);
          }
        });

        const excerpt =
          paragraphs.join(" ").slice(0, 600).trim() ||
          $('meta[name="description"]').attr("content")?.trim() ||
          item.snippet;

        if (!excerpt || excerpt.length < 25) return null;

        return {
          index: idx + 1,
          title: title.slice(0, 130),
          url: res.url || item.url,
          domain: getDomain(res.url || item.url),
          excerpt,
          headings,
        };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const valid: AnalyzedResearchSource[] = [];
  for (const s of fetched) {
    if (s) {
      valid.push({ ...s, index: valid.length + 1 });
    }
  }
  return valid;
}

async function synthesizeOpenResearchReport(
  query: string,
  sourcesAnalyzed: AnalyzedResearchSource[],
  fallbackItems: SearchResultItem[],
  wikiSummary: string
): Promise<ResearchReport | undefined> {
  if (sourcesAnalyzed.length === 0 && !wikiSummary && fallbackItems.length === 0) {
    return undefined;
  }

  // Try Gemini synthesis grounded with live HTTP page excerpts when API key is configured
  if (ai && (sourcesAnalyzed.length > 0 || fallbackItems.length > 0)) {
    try {
      const sourceContext = sourcesAnalyzed
        .map(
          (s) =>
            `[${s.index}] ${s.title} (${s.domain})\nBaşlıklar: ${s.headings.join(" | ")}\nÖzet Metin: ${s.excerpt}`
        )
        .join("\n\n");

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Kullanıcının açık internet araştırma sorgusu: "${query}"

Aşağıda canlı web sayfalarından HTTP ile okunan güncel kaynak içerikleri yer alıyor:
${sourceContext || fallbackItems.slice(0, 5).map((f, i) => `[${i + 1}] ${f.title} (${f.domain}): ${f.snippet}`).join("\n")}

Görev: Bu kaynakları ve Google Arama bilgisini birleştirerek Türkçe, nesnel, kaynak numaralı ([1], [2] gibi) bir açık internet araştırma raporu üret.
Tam JSON döndür:
{
  "overview": "3-4 cümlelik kapsamlı, doğrudan soruyu yanıtlayan Türkçe araştırma özeti ([1], [2] kaynak atıflarıyla).",
  "keyFindings": [
    "Net ve somut bulgu 1 [1]",
    "Net ve somut bulgu 2 [2]"
  ],
  "relatedTopics": ["İlgili araştırma konusu 1", "İlgili araştırma konusu 2", "İlgili araştırma konusu 3", "İlgili araştırma konusu 4"]
}`,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text ?? "").trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          overview?: string;
          keyFindings?: string[];
          relatedTopics?: string[];
        };
        if (parsed.overview && Array.isArray(parsed.keyFindings) && parsed.keyFindings.length > 0) {
          return {
            overview: parsed.overview.trim(),
            keyFindings: parsed.keyFindings.slice(0, 6).map((f) => f.trim()),
            sourcesAnalyzed,
            relatedTopics: (parsed.relatedTopics ?? []).slice(0, 5).map((t) => t.trim()),
          };
        }
      }
    } catch {
      // Fall through to deterministic pure-HTTP multi-source synthesis
    }
  }

  // Deterministic Pure-HTTP Multi-Source Extractive Synthesis (Zero API key required)
  const keyFindings: string[] = [];
  const seenSentences = new Set<string>();

  for (const src of sourcesAnalyzed) {
    const sentences = src.excerpt
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 35 && s.length <= 240);
    for (const sentence of sentences.slice(0, 2)) {
      const norm = sentence.toLowerCase().slice(0, 50);
      if (seenSentences.has(norm)) continue;
      seenSentences.add(norm);
      keyFindings.push(`${sentence} [${src.index} · ${src.domain}]`);
      if (keyFindings.length >= 5) break;
    }
    if (keyFindings.length >= 5) break;
  }

  if (keyFindings.length < 3) {
    for (let i = 0; i < fallbackItems.length && keyFindings.length < 5; i++) {
      const it = fallbackItems[i];
      if (!it.snippet || it.snippet.length < 25) continue;
      const norm = it.snippet.toLowerCase().slice(0, 50);
      if (seenSentences.has(norm)) continue;
      seenSentences.add(norm);
      keyFindings.push(`${it.snippet} (${it.domain})`);
    }
  }

  const overviewParts: string[] = [];
  if (wikiSummary) overviewParts.push(wikiSummary);
  if (sourcesAnalyzed[0] && !wikiSummary.includes(sourcesAnalyzed[0].excerpt.slice(0, 40))) {
    const firstSentence = sourcesAnalyzed[0].excerpt.split(/(?<=[.!?])\s+/)[0] ?? "";
    if (firstSentence.length >= 30) {
      overviewParts.push(`${firstSentence} [${sourcesAnalyzed[0].index}]`);
    }
  }
  if (sourcesAnalyzed.length > 1) {
    overviewParts.push(
      `Bu açık internet araştırması için ${sourcesAnalyzed.length} farklı canlı web kaynağı HTTP üzerinden okunarak çapraz özet çıkarıldı.`
    );
  }

  const relatedTopics = Array.from(
    new Set(
      sourcesAnalyzed
        .flatMap((s) => s.headings)
        .filter((h) => h.length >= 4 && h.length <= 45)
    )
  ).slice(0, 4);

  return {
    overview:
      overviewParts.join(" ").trim() ||
      fallbackItems[0]?.snippet ||
      `“${query}” hakkında açık internet kaynakları tarandı.`,
    keyFindings,
    sourcesAnalyzed,
    relatedTopics,
  };
}

async function fetchImagesFast(query: string, limit = 16): Promise<ImageResult[]> {
  const encoded = encodeURIComponent(query);
  const images: ImageResult[] = [];
  const seen = new Set<string>();

  const commonsUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encoded}&gsrlimit=${limit}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=640&format=json`;
  const trWikiUrl = `https://tr.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encoded}&gsrlimit=8&prop=pageimages|info&piprop=thumbnail|original&pithumbsize=640&inprop=url&format=json`;
  const enWikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encoded}&gsrlimit=8&prop=pageimages|info&piprop=thumbnail|original&pithumbsize=640&inprop=url&format=json`;

  const fetchJson = async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: BROWSER_HEADERS });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const [trWikiData, enWikiData, commonsData] = await Promise.all([
    fetchJson(trWikiUrl),
    fetchJson(enWikiUrl),
    fetchJson(commonsUrl),
  ]);

  const addWikiPages = (data: Record<string, unknown> | null, host: string) => {
    const queryObj = data?.query as { pages?: Record<string, Record<string, unknown>> } | undefined;
    if (!queryObj?.pages) return;
    for (const page of Object.values(queryObj.pages)) {
      const thumb = page.thumbnail as { source?: string; width?: number; height?: number } | undefined;
      const orig = page.original as { source?: string; width?: number; height?: number } | undefined;
      const thumbUrl = thumb?.source || orig?.source;
      const fullUrl = orig?.source || thumb?.source;
      if (!thumbUrl || !fullUrl) continue;
      if (/\.(svg|tif|tiff|pdf|ogv|webm)$/i.test(fullUrl)) continue;
      if (seen.has(fullUrl)) continue;
      seen.add(fullUrl);
      images.push({
        id: `wiki-img-${host}-${String(page.pageid ?? Math.random())}`,
        title: String(page.title ?? query),
        thumbnailUrl: thumbUrl,
        fullUrl,
        sourceUrl: String(page.fullurl ?? `https://${host}`),
        domain: host,
        width: orig?.width ?? thumb?.width ?? 800,
        height: orig?.height ?? thumb?.height ?? 600,
      });
    }
  };

  addWikiPages(trWikiData as Record<string, unknown> | null, "tr.wikipedia.org");
  addWikiPages(enWikiData as Record<string, unknown> | null, "en.wikipedia.org");

  const commonsPages = (
    commonsData as { query?: { pages?: Record<string, Record<string, unknown>> } } | null
  )?.query?.pages;
  if (commonsPages) {
    for (const page of Object.values(commonsPages)) {
      const infoArr = page.imageinfo as
        | Array<{
            url?: string;
            thumburl?: string;
            descriptionurl?: string;
            width?: number;
            height?: number;
            mime?: string;
            extmetadata?: { Artist?: { value?: string } };
          }>
        | undefined;
      const info = infoArr?.[0];
      if (!info) continue;
      if (!info.mime || !/^image\/(jpeg|jpg|png|webp)$/i.test(info.mime)) continue;
      const thumbUrl = info.thumburl || info.url;
      const fullUrl = info.url || info.thumburl;
      if (!thumbUrl || !fullUrl || seen.has(fullUrl)) continue;
      seen.add(fullUrl);
      const rawTitle = String(page.title ?? query)
        .replace(/^File:/i, "")
        .replace(/\.[^.]+$/, "")
        .replace(/_/g, " ");
      const rawArtist = info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "").trim();
      images.push({
        id: `commons-${String(page.pageid ?? Math.random())}`,
        title: rawTitle,
        thumbnailUrl: thumbUrl,
        fullUrl,
        sourceUrl: info.descriptionurl ?? "https://commons.wikimedia.org",
        domain: "commons.wikimedia.org",
        width: info.width ?? 800,
        height: info.height ?? 600,
        author: rawArtist ? rawArtist.slice(0, 60) : undefined,
      });
    }
  }

  return images.slice(0, limit);
}

async function translateQueryForImages(query: string): Promise<string> {
  if (!ai) return query;
  try {
    const res = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `Convert this search query into a short 2-4 word English keyword phrase optimized for finding photography on Wikimedia Commons. Output ONLY the keywords, nothing else. Query: "${query}"`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const text = (res.text ?? "").trim().replace(/["\n]/g, "");
    if (text && text.length > 1 && text.length < 60) {
      return text;
    }
  } catch {
    // Fallback to original query
  }
  return query;
}

async function searchWithGeminiGrounding(query: string): Promise<{
  summary: string;
  results: SearchResultItem[];
} | null> {
  if (!ai) return null;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: `Kullanıcı araması: "${query}"

AlgoFind, açık interneti tarayıp EN POPÜLER, güvenilir ve doğrudan kaynakları öne çıkaran bir arama ve araştırma motorudur.
Görev:
1. İlk olarak kullanıcı araması için 2-3 cümlelik net, doğal bir Türkçe özet yaz.
2. Ardından bu arama için internetteki EN POPÜLER ve en yetkili 8 web sitesini sırala.

Yanıtını tam olarak şu JSON formatında ver:
{
  "summary": "2-3 cümlelik kısa ve doğru Türkçe özet.",
  "items": [
    {
      "title": "Site veya Sayfa Başlığı",
      "url": "https://...",
      "snippet": "Tek veya iki cümlelik net açıklama.",
      "popularityLabel": "En Popüler Resmi Site"
    }
  ]
}`,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const rawText = (response.text ?? "").trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    let parsedSummary = "";
    const parsedItems: SearchResultItem[] = [];

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as {
          summary?: string;
          items?: Array<{
            title?: string;
            url?: string;
            snippet?: string;
            popularityLabel?: string;
          }>;
        };
        if (parsed.summary) parsedSummary = parsed.summary.trim();
        if (Array.isArray(parsed.items)) {
          for (let i = 0; i < parsed.items.length; i++) {
            const it = parsed.items[i];
            if (!it?.title || !it?.url) continue;
            const validUrl = normalizeUrlInput(it.url);
            if (!validUrl) continue;
            parsedItems.push({
              id: `gemini-item-${i}`,
              title: it.title.trim(),
              url: validUrl,
              domain: getDomain(validUrl),
              snippet: (it.snippet ?? "").trim(),
              popularityLabel: (it.popularityLabel ?? "Popüler Kaynak").trim(),
              isOfficialMatch: i === 0,
            });
          }
        }
      } catch {
        // Fallback to grounding chunks below
      }
    }

    if (!parsedSummary && rawText && !rawText.startsWith("{")) {
      parsedSummary = rawText.slice(0, 360);
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const chunkWebEntries = chunks
      .map((c) => c.web)
      .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri));

    const resolvedChunkUrls = await Promise.all(
      chunkWebEntries.slice(0, 8).map(async (w) => ({
        title: w.title || getDomain(w.uri),
        url: await resolveRedirectUrl(w.uri),
      }))
    );

    const existingDomains = new Set(parsedItems.map((i) => i.domain));
    for (let i = 0; i < resolvedChunkUrls.length; i++) {
      const c = resolvedChunkUrls[i];
      if (c.url.includes("vertexaisearch.cloud.google.com")) continue;
      const dom = getDomain(c.url);
      if (existingDomains.has(dom)) continue;
      existingDomains.add(dom);
      parsedItems.push({
        id: `grounding-${i}`,
        title: c.title,
        url: c.url,
        domain: dom,
        snippet: `${dom} üzerinden doğrulanmış popüler web kaynağı.`,
        popularityLabel: "Popüler Web Kaynağı",
      });
    }

    if (parsedItems.length === 0 && !parsedSummary) {
      return null;
    }

    return {
      summary: parsedSummary,
      results: parsedItems.slice(0, 10),
    };
  } catch (err) {
    console.error("Gemini search error:", err);
    return null;
  }
}

function resolveHref(href: string | undefined, baseUrl: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return null;
  }
  try {
    const abs = new URL(trimmed, baseUrl);
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
    if (isPrivateOrBlockedHost(abs.hostname)) return null;
    return abs.toString();
  } catch {
    return null;
  }
}

function sanitizeInlineHtml($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>, baseUrl: string): string {
  const clone = el.clone();
  clone.find("script, style, noscript, iframe, svg, button, input, form").remove();
  clone.find("*").each((_, node) => {
    const $n = $(node);
    const tag = node.type === "tag" ? node.name.toLowerCase() : "";
    const allowedAttrs = tag === "a" ? ["href", "title"] : [];
    const attribs = (node as unknown as { attribs?: Record<string, string> }).attribs || {};
    for (const attr of Object.keys(attribs)) {
      if (!allowedAttrs.includes(attr)) {
        $n.removeAttr(attr);
      }
    }
    if (tag === "a") {
      const resolved = resolveHref($n.attr("href"), baseUrl);
      if (resolved) {
        $n.attr("href", resolved);
        $n.attr("data-algofind-link", "true");
        $n.attr("class", "text-blue-600 hover:underline underline-offset-2 font-medium");
      } else {
        $n.replaceWith($n.text());
      }
    }
  });
  return clone.html()?.trim() ?? "";
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, engine: "algofind-native-web-engine" });
  });

  const searchResultCache = new Map<
    string,
    { payload: SearchResponse; expiresAt: number }
  >();

  app.post("/api/search", async (req, res) => {
    const startedAt = Date.now();
    const rawQuery = String(req.body?.query ?? "").trim();
    const requestedMode: SearchMode =
      req.body?.mode === "research" ? "research" : "popular";

    if (!rawQuery) {
      return res.status(400).json({ error: "Lütfen bir arama kelimesi veya site adresi girin." });
    }

    const cacheKey = `${requestedMode}::${rawQuery.toLowerCase()}`;
    const cachedSearch = searchResultCache.get(cacheKey);
    if (cachedSearch && cachedSearch.expiresAt > Date.now()) {
      return res.json({
        ...cachedSearch.payload,
        durationMs: Date.now() - startedAt,
      });
    }

    const detectedUrl = normalizeUrlInput(rawQuery);
    const instantMatch = findInstantPopularMatch(rawQuery);
    const searchTerm = detectedUrl ? getDomain(detectedUrl) : rawQuery;

    const isTechOrCode =
      /\b(api|sdk|react|node|python|rust|typescript|javascript|linux|git|github|kod|yazılım|framework|docker|ai|yapay zeka)\b/i.test(
        searchTerm
      );

    const [geminiRes, engineSearchRes, ddgHtmlRes, wikiRes, hnRes, ghRes, rawPreviewImages] =
      await Promise.all([
        searchWithGeminiGrounding(searchTerm),
        searchOpenWebWithChromium(searchTerm, 10),
        fetchDuckDuckGoHtmlSearch(searchTerm, 8),
        fetchWikipediaFastResults(searchTerm),
        requestedMode === "research" || isTechOrCode
          ? fetchHackerNewsAlgolia(searchTerm, 4)
          : Promise.resolve([]),
        requestedMode === "research" && isTechOrCode
          ? fetchGitHubReposForQuery(searchTerm, 3)
          : Promise.resolve([]),
        fetchImagesFast(searchTerm, 8),
      ]);

    const previewImages = rawPreviewImages
      .filter((img) => !isGoogleLogoAsset(img.title, img.fullUrl) && !isGoogleLogoAsset(img.title, img.thumbnailUrl))
      .slice(0, 4);

    const ddgLiteRes =
      engineSearchRes.length < 3 && ddgHtmlRes.length < 3
        ? await fetchDuckDuckGoLiteSearch(searchTerm, 8)
        : [];

    const combinedResults: SearchResultItem[] = [];
    const seenDomains = new Set<string>();
    const seenUrls = new Set<string>();

    let directMatch: SearchResultItem | null = null;

    if (detectedUrl) {
      const dom = getDomain(detectedUrl);
      directMatch = {
        id: "direct-url",
        title: `${dom} — Doğrudan Site Adresi`,
        url: detectedUrl,
        domain: dom,
        snippet:
          "Girdiğiniz adres doğrudan algılandı. AlgOFind yerleşik web motoru ile doğrudan açabilir veya siteye gidebilirsiniz.",
        popularityLabel: "Doğrudan Adres",
        isOfficialMatch: true,
      };
      seenDomains.add(dom);
      seenUrls.add(detectedUrl);
    } else if (instantMatch) {
      const dom = getDomain(instantMatch.url);
      directMatch = {
        id: `instant-${dom}`,
        title: instantMatch.name,
        url: instantMatch.url,
        domain: dom,
        snippet: instantMatch.description,
        popularityLabel: `En Popüler · ${instantMatch.category}`,
        isOfficialMatch: true,
      };
      seenDomains.add(dom);
      seenUrls.add(instantMatch.url);
    }

    const allCandidates = [
      ...(geminiRes?.results ?? []),
      ...engineSearchRes,
      ...ddgHtmlRes,
      ...ddgLiteRes,
      ...wikiRes.results,
      ...ghRes,
      ...hnRes,
    ];

    const maxListResults = requestedMode === "research" ? 10 : 8;
    for (const item of allCandidates) {
      if (!detectedUrl && isGoogleSearchDomain(item.domain)) continue;
      if (seenUrls.has(item.url)) continue;
      if (seenDomains.has(item.domain) && combinedResults.length >= 4) continue;
      if (!directMatch) {
        directMatch = {
          ...item,
          isOfficialMatch: true,
          popularityLabel: item.popularityLabel || "En Popüler Sonuç",
        };
        seenDomains.add(item.domain);
        seenUrls.add(item.url);
        continue;
      }
      seenDomains.add(item.domain);
      seenUrls.add(item.url);
      combinedResults.push(item);
      if (combinedResults.length >= maxListResults) break;
    }

    // Live Open-Internet Research: read top live pages & synthesize multi-source report
    const shouldRunDeepRead =
      !detectedUrl &&
      (requestedMode === "research" ||
        rawQuery.trim().split(/\s+/).length >= 2);

    let researchReport: ResearchReport | undefined;
    if (shouldRunDeepRead) {
      const livePool = [
        ...(directMatch && !instantMatch ? [directMatch] : []),
        ...combinedResults,
      ];
      const sourcesAnalyzed = await readLiveWebPagesForResearch(
        livePool,
        requestedMode === "research" ? 4 : 3
      );
      researchReport = await synthesizeOpenResearchReport(
        rawQuery,
        sourcesAnalyzed,
        livePool,
        wikiRes.summary
      );
    }

    const summary =
      researchReport?.overview ||
      geminiRes?.summary ||
      wikiRes.summary ||
      ddgHtmlRes[0]?.snippet ||
      ddgLiteRes[0]?.snippet ||
      (directMatch
        ? `${directMatch.title} (${directMatch.domain}), “${rawQuery}” araması için en popüler ve doğrudan sonuç olarak öne çıkarıldı.`
        : `“${rawQuery}” için açık internetten en popüler kaynaklar derlendi.`);

    const payload: SearchResponse = {
      query: rawQuery,
      normalizedQuery: rawQuery.toLowerCase(),
      mode: requestedMode,
      detectedUrl,
      directMatch,
      summary,
      researchReport,
      results: combinedResults,
      relatedImages: previewImages,
      durationMs: Date.now() - startedAt,
      engine: geminiRes ? "algofind-popularity-grounding" : "algofind-http-index",
    };

    if (payload.results.length > 0 || payload.directMatch) {
      if (searchResultCache.size >= 120) {
        const oldest = searchResultCache.keys().next().value;
        if (oldest) searchResultCache.delete(oldest);
      }
      searchResultCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + 3 * 60 * 1000,
      });
    }

    res.json(payload);
  });

  app.post("/api/search-images", async (req, res) => {
    const startedAt = Date.now();
    const rawQuery = String(req.body?.query ?? "").trim();
    if (!rawQuery) {
      return res.status(400).json({ error: "Fotoğraf araması için bir kelime girin." });
    }

    const translated = await translateQueryForImages(rawQuery);
    const shouldQueryBoth = translated.toLowerCase() !== rawQuery.toLowerCase();

    const [primaryImgs, translatedImgs] = await Promise.all([
      fetchImagesFast(rawQuery, 16),
      shouldQueryBoth ? fetchImagesFast(translated, 16) : Promise.resolve([]),
    ]);

    const merged: ImageResult[] = [];
    const seen = new Set<string>();
    for (const img of [...primaryImgs, ...translatedImgs]) {
      if (isGoogleLogoAsset(img.title, img.fullUrl) || isGoogleLogoAsset(img.title, img.thumbnailUrl)) {
        continue;
      }
      if (seen.has(img.fullUrl)) continue;
      seen.add(img.fullUrl);
      merged.push(img);
      if (merged.length >= 24) break;
    }

    const payload: ImageSearchResponse = {
      query: rawQuery,
      translatedQuery: shouldQueryBoth ? translated : undefined,
      images: merged,
      durationMs: Date.now() - startedAt,
    };
    res.json(payload);
  });

function extractBalancedJsonObject(source: string, marker: string): string | null {
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = source.indexOf("{", markerIdx + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }
  return null;
}

function readYtText(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const rec = obj as { simpleText?: string; runs?: Array<{ text?: string }> };
  if (typeof rec.simpleText === "string") return rec.simpleText;
  if (Array.isArray(rec.runs)) {
    return rec.runs.map((r) => r.text ?? "").join("");
  }
  return "";
}

function collectYouTubeVideos(root: unknown, limit = 24): YouTubeVideoItem[] {
  const videos: YouTubeVideoItem[] = [];
  const seenIds = new Set<string>();
  const stack: unknown[] = [root];

  while (stack.length > 0 && videos.length < limit) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;

    if (Array.isArray(cur)) {
      for (let i = cur.length - 1; i >= 0; i--) {
        stack.push(cur[i]);
      }
      continue;
    }

    const record = cur as Record<string, unknown>;
    const renderer =
      (record.videoRenderer as Record<string, unknown> | undefined) ||
      (record.compactVideoRenderer as Record<string, unknown> | undefined) ||
      (record.gridVideoRenderer as Record<string, unknown> | undefined);

    if (renderer && typeof renderer.videoId === "string") {
      const videoId = renderer.videoId;
      const title = readYtText(renderer.title).trim();
      if (videoId && title && !seenIds.has(videoId)) {
        seenIds.add(videoId);
        const channel =
          readYtText(renderer.ownerText) ||
          readYtText(renderer.longBylineText) ||
          readYtText(renderer.shortBylineText) ||
          "YouTube Kanalı";
        const duration = readYtText(renderer.lengthText) || undefined;
        const views =
          readYtText(renderer.shortViewCountText) ||
          readYtText(renderer.viewCountText) ||
          undefined;
        const published = readYtText(renderer.publishedTimeText) || undefined;

        videos.push({
          videoId,
          title,
          channel,
          duration,
          views,
          published,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        });
      }
    }

    const lockup = record.lockupViewModel as Record<string, unknown> | undefined;
    if (lockup) {
      const contentImage = lockup.contentImage as
        | {
            thumbnailViewModel?: {
              image?: { sources?: Array<{ url?: string }> };
              overlays?: Array<{
                thumbnailBottomOverlayViewModel?: {
                  badges?: Array<{
                    thumbnailBadgeViewModel?: {
                      text?: string;
                      animationActivationTargetId?: string;
                    };
                  }>;
                };
              }>;
            };
          }
        | undefined;
      const thumbUrl = contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url ?? "";
      const idFromThumb = thumbUrl.match(/\/vi\/([a-zA-Z0-9_-]{11})\//)?.[1];
      const badge =
        contentImage?.thumbnailViewModel?.overlays?.[0]?.thumbnailBottomOverlayViewModel?.badges?.[0]
          ?.thumbnailBadgeViewModel;
      const contentId =
        (typeof lockup.contentId === "string" ? lockup.contentId : "") ||
        badge?.animationActivationTargetId ||
        idFromThumb ||
        "";

      const meta = (
        lockup.metadata as {
          lockupMetadataViewModel?: {
            title?: { content?: string };
            metadata?: {
              contentMetadataViewModel?: {
                metadataRows?: Array<{
                  metadataParts?: Array<{ text?: { content?: string } }>;
                }>;
              };
            };
          };
        }
      )?.lockupMetadataViewModel;

      const title = meta?.title?.content?.trim() || "";
      if (/^[a-zA-Z0-9_-]{11}$/.test(contentId) && title && !seenIds.has(contentId)) {
        seenIds.add(contentId);
        const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
        const channel = rows[0]?.metadataParts?.[0]?.text?.content?.trim() || "YouTube Kanalı";
        const views = rows[1]?.metadataParts?.[0]?.text?.content?.trim();
        const published = rows[1]?.metadataParts?.[1]?.text?.content?.trim();
        const duration = badge?.text?.trim();

        videos.push({
          videoId: contentId,
          title,
          channel,
          duration,
          views,
          published,
          thumbnailUrl: `https://i.ytimg.com/vi/${contentId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${contentId}`,
        });
      }
    }

    for (const val of Object.values(record)) {
      if (val && typeof val === "object") {
        stack.push(val);
      }
    }
  }

  return videos;
}

function findWatchOverlayDetails(root: unknown): {
  title?: string;
  channel?: string;
  views?: string;
} {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    const rec = cur as Record<string, unknown>;
    const overlay = rec.playerOverlayVideoDetailsRenderer as
      | {
          title?: { simpleText?: string };
          subtitle?: { runs?: Array<{ text?: string }> };
        }
      | undefined;
    if (overlay) {
      const title = overlay.title?.simpleText?.trim();
      const runs = (overlay.subtitle?.runs ?? [])
        .map((r) => r.text?.trim() ?? "")
        .filter(Boolean);
      return {
        title,
        channel: runs[0],
        views: runs[1],
      };
    }
    for (const val of Object.values(rec)) {
      if (val && typeof val === "object") stack.push(val);
    }
  }
  return {};
}

function extractYouTubeVideoId(parsedUrl: URL): string | null {
  const host = parsedUrl.hostname.toLowerCase();
  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = parsedUrl.pathname.replace(/^\//, "").split("/")[0];
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  }
  const v = parsedUrl.searchParams.get("v");
  if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
  const pathMatch = parsedUrl.pathname.match(/^\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
  return pathMatch ? pathMatch[1] : null;
}

async function openYouTubeDirect(
  targetUrl: string,
  startedAt: number
): Promise<OpenSiteResponse | null> {
  const parsed = new URL(targetUrl);
  const videoId = extractYouTubeVideoId(parsed);
  const isBareHome =
    !videoId &&
    (parsed.pathname === "/" || parsed.pathname === "") &&
    !parsed.searchParams.get("search_query");

  const fetchUrl = isBareHome
    ? "https://www.youtube.com/results?search_query=teknoloji+ve+g%C3%BCndem+videolar"
    : targetUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const [response, oembedRes] = await Promise.all([
      fetch(fetchUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          ...BROWSER_HEADERS,
          Cookie: "SOCS=CAI; PREF=hl=tr&gl=TR",
        },
      }),
      videoId
        ? fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(
              `https://www.youtube.com/watch?v=${videoId}`
            )}&format=json`,
            { signal: controller.signal, headers: BROWSER_HEADERS }
          )
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const html = await response.text();
    const byteSize = Buffer.byteLength(html, "utf8");

    const initialDataRaw =
      extractBalancedJsonObject(html, "var ytInitialData = ") ||
      extractBalancedJsonObject(html, 'window["ytInitialData"] = ');
    const initialData = initialDataRaw ? (JSON.parse(initialDataRaw) as Record<string, unknown>) : null;
    const videos = initialData ? collectYouTubeVideos(initialData, 24) : [];

    const playerRaw =
      extractBalancedJsonObject(html, "var ytInitialPlayerResponse = ") ||
      extractBalancedJsonObject(html, "ytInitialPlayerResponse = ");
    let playerData: {
      videoDetails?: {
        videoId?: string;
        title?: string;
        author?: string;
        viewCount?: string;
        shortDescription?: string;
      };
    } | null = null;
    if (playerRaw) {
      try {
        playerData = JSON.parse(playerRaw);
      } catch {
        playerData = null;
      }
    }

    let youtubeData: YouTubePageData;
    let pageTitle = "YouTube — AlgOFind Hızlı Görünüm";
    let pageDescription = "YouTube videolarını doğrudan AlgOFind üzerinden arayın ve izleyin.";

    if (videoId) {
      const details = playerData?.videoDetails;
      const overlay = initialData ? findWatchOverlayDetails(initialData) : {};
      const oembed = oembedRes as { title?: string; author_name?: string } | null;

      const vTitle = details?.title || overlay.title || oembed?.title || "YouTube Videosu";
      const vAuthor = details?.author || overlay.channel || oembed?.author_name || "YouTube Kanalı";
      const vViews = details?.viewCount
        ? `${Number(details.viewCount).toLocaleString("tr-TR")} görüntüleme`
        : overlay.views;
      const vDesc = details?.shortDescription || "";

      pageTitle = `${vTitle} — YouTube`;
      pageDescription = vDesc.slice(0, 220) || `${vAuthor} tarafından paylaşılan video.`;

      youtubeData = {
        mode: "watch",
        activeVideo: {
          videoId,
          title: vTitle,
          channel: vAuthor,
          views: vViews,
          description: vDesc,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=1`,
        },
        videos: videos.filter((v) => v.videoId !== videoId),
      };
    } else {
      const searchQuery = parsed.searchParams.get("search_query") || undefined;
      pageTitle = searchQuery ? `${searchQuery} — YouTube Arama` : "YouTube — Popüler Videolar";
      youtubeData = {
        mode: "feed",
        searchQuery,
        videos,
      };
    }

    const links: PageLink[] = videos.slice(0, 15).map((v) => ({
      text: v.title,
      href: v.url,
    }));

    return {
      requestedUrl: targetUrl,
      finalUrl: targetUrl,
      domain: "youtube.com",
      title: pageTitle,
      description: pageDescription,
      favicon: "https://www.youtube.com/s/desktop/bb2198ae/img/favicon_32x32.png",
      lang: "tr",
      durationMs: Date.now() - startedAt,
      byteSize,
      statusCode: response.status,
      retrievalMethod: "youtube-http",
      notice:
        "YouTube sayfası AlgOFind motoruyla hızlı video akışı olarak ayrıştırıldı.",
      youtubeData,
      blocks: [],
      links,
    };
  } catch (err) {
    console.error("YouTube open error:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function openStackOverflowDirect(
  targetUrl: string,
  startedAt: number
): Promise<OpenSiteResponse | null> {
  const parsed = new URL(targetUrl);
  const qMatch = parsed.pathname.match(/^\/questions\/(\d+)/);
  const searchQuery = parsed.searchParams.get("q")?.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    if (qMatch) {
      const questionId = qMatch[1];
      const [qRes, aRes] = await Promise.all([
        fetch(
          `https://api.stackexchange.com/2.3/questions/${questionId}?order=desc&sort=activity&site=stackoverflow&filter=withbody`,
          { signal: controller.signal }
        ).then((r) => r.json()) as Promise<{
          items?: Array<{
            title?: string;
            body?: string;
            score?: number;
            view_count?: number;
            tags?: string[];
            owner?: { display_name?: string };
          }>;
        }>,
        fetch(
          `https://api.stackexchange.com/2.3/questions/${questionId}/answers?order=desc&sort=votes&site=stackoverflow&filter=withbody&pagesize=5`,
          { signal: controller.signal }
        ).then((r) => r.json()) as Promise<{
          items?: Array<{
            body?: string;
            score?: number;
            is_accepted?: boolean;
            owner?: { display_name?: string };
          }>;
        }>,
      ]);

      const question = qRes.items?.[0];
      if (!question) return null;

      const blocks: ReaderBlock[] = [];
      const qHtml = cheerio.load(question.body ?? "");
      qHtml("p, pre, ul, ol").each((_, node) => {
        const tag = node.type === "tag" ? node.name.toLowerCase() : "";
        if (tag === "pre") {
          blocks.push({ type: "code", text: qHtml(node).text().trim() });
        } else if (tag === "p") {
          const text = qHtml(node).text().trim();
          if (text) blocks.push({ type: "paragraph", text });
        }
      });

      const answers = aRes.items ?? [];
      answers.forEach((ans, idx) => {
        blocks.push({
          type: "heading",
          level: 2,
          text: `${idx + 1}. Yanıt (${ans.score ?? 0} oy${ans.is_accepted ? " · Kabul Edilen" : ""}) — ${ans.owner?.display_name ?? "Geliştirici"}`,
        });
        const aHtml = cheerio.load(ans.body ?? "");
        aHtml("p, pre").each((_, node) => {
          const tag = node.type === "tag" ? node.name.toLowerCase() : "";
          if (tag === "pre") {
            blocks.push({ type: "code", text: aHtml(node).text().trim() });
          } else {
            const text = aHtml(node).text().trim();
            if (text) blocks.push({ type: "paragraph", text });
          }
        });
      });

      return {
        requestedUrl: targetUrl,
        finalUrl: targetUrl,
        domain: "stackoverflow.com",
        title: cheerio.load(question.title ?? "Stack Overflow").text(),
        description: `${question.owner?.display_name ?? "Kullanıcı"} · ${question.score ?? 0} oy · ${(question.tags ?? []).join(", ")}`,
        favicon: "https://stackoverflow.com/favicon.ico",
        lang: "en",
        durationMs: Date.now() - startedAt,
        byteSize: JSON.stringify(qRes).length,
        statusCode: 200,
        retrievalMethod: "api-http",
        notice: "Stack Overflow sorusu ve en çok oy alan yanıtlar AlgOFind tarafından açıldı.",
        siteSearch: {
          placeholder: "Stack Overflow’da soru veya hata arayın...",
          urlTemplate: "https://stackoverflow.com/search?q={q}",
        },
        blocks,
        links: [
          { text: "Stack Overflow Popüler Sorular", href: "https://stackoverflow.com" },
        ],
      };
    }

    const endpoint = searchQuery
      ? `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(searchQuery)}&site=stackoverflow&pagesize=15`
      : `https://api.stackexchange.com/2.3/questions?order=desc&sort=hot&site=stackoverflow&pagesize=15`;

    const data = (await fetch(endpoint, { signal: controller.signal }).then((r) =>
      r.json()
    )) as {
      items?: Array<{
        question_id: number;
        title: string;
        link: string;
        score: number;
        answer_count: number;
        tags?: string[];
      }>;
    };

    const items = data.items ?? [];
    if (items.length === 0) return null;

    const blocks: ReaderBlock[] = [
      {
        type: "heading",
        level: 2,
        text: searchQuery
          ? `“${searchQuery}” için Popüler Stack Overflow Soruları`
          : "Günün Popüler Stack Overflow Soruları",
      },
      {
        type: "list",
        ordered: true,
        items: items.map(
          (q) =>
            `${cheerio.load(q.title).text()} (${q.score} oy · ${q.answer_count} yanıt · ${(q.tags ?? []).slice(0, 3).join(", ")})`
        ),
      },
    ];

    const links: PageLink[] = items.map((q) => ({
      text: cheerio.load(q.title).text(),
      href: q.link,
    }));

    return {
      requestedUrl: targetUrl,
      finalUrl: targetUrl,
      domain: "stackoverflow.com",
      title: searchQuery
        ? `${searchQuery} — Stack Overflow`
        : "Stack Overflow — Geliştirici Soru & Cevap",
      description:
        "Programlama soruları ve en popüler teknik çözümler doğrudan AlgOFind motoruyla getirildi.",
      favicon: "https://stackoverflow.com/favicon.ico",
      lang: "en",
      durationMs: Date.now() - startedAt,
      byteSize: JSON.stringify(data).length,
      statusCode: 200,
      retrievalMethod: "api-http",
      notice:
        "Stack Overflow soruları AlgOFind motoru üzerinden hızlı geliştirici görünümüyle açıldı.",
      siteSearch: {
        placeholder: "Stack Overflow’da soru veya hata arayın...",
        urlTemplate: "https://stackoverflow.com/search?q={q}",
        currentQuery: searchQuery,
      },
      blocks,
      links,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function openTdkDirect(
  targetUrl: string,
  startedAt: number
): Promise<OpenSiteResponse | null> {
  const parsed = new URL(targetUrl);
  const word = parsed.searchParams.get("ara")?.trim() || "bilim";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(
      `https://sozluk.gov.tr/gts?ara=${encodeURIComponent(word)}`,
      { signal: controller.signal, headers: BROWSER_HEADERS }
    );
    const data = (await res.json()) as
      | Array<{
          madde?: string;
          lisan?: string;
          anlamlarListe?: Array<{
            anlam?: string;
            orneklerListe?: Array<{ ornek?: string }>;
          }>;
        }>
      | { error?: string };

    const entry = Array.isArray(data) ? data[0] : null;
    const blocks: ReaderBlock[] = [];

    if (entry?.madde) {
      blocks.push({
        type: "heading",
        level: 2,
        text: `${entry.madde}${entry.lisan ? ` (${entry.lisan})` : ""}`,
      });
      const meanings = (entry.anlamlarListe ?? []).map((a, idx) => {
        const ex = a.orneklerListe?.[0]?.ornek;
        return ex ? `${idx + 1}. ${a.anlam} — Örnek: “${ex}”` : `${idx + 1}. ${a.anlam}`;
      });
      if (meanings.length > 0) {
        blocks.push({ type: "list", ordered: false, items: meanings });
      }
    } else {
      blocks.push({
        type: "paragraph",
        text: `“${word}” kelimesi için TDK sözlüğünde kayıt bulunamadı. Yukarıdaki sözlük arama kutusundan başka bir kelime deneyebilirsiniz.`,
      });
    }

    const sampleWords = ["bilim", "teknoloji", "arayüz", "algoritma", "hız", "kaynak"];
    return {
      requestedUrl: targetUrl,
      finalUrl: targetUrl,
      domain: "sozluk.gov.tr",
      title: `TDK Güncel Türkçe Sözlük — ${word}`,
      description: "Türk Dil Kurumu resmi güncel Türkçe sözlük ve kelime anlamları.",
      favicon: "https://sozluk.gov.tr/favicon.ico",
      lang: "tr",
      durationMs: Date.now() - startedAt,
      byteSize: JSON.stringify(data).length,
      statusCode: 200,
      retrievalMethod: "api-http",
      notice: "TDK Sözlük verileri AlgOFind hızlı sözlük servisi üzerinden açıldı.",
      siteSearch: {
        placeholder: "TDK Sözlükte kelime arayın (ör. algoritma, bilim)...",
        urlTemplate: "https://sozluk.gov.tr/?ara={q}",
        currentQuery: word,
      },
      blocks,
      links: sampleWords.map((w) => ({
        text: `Kelime anlamı: ${w}`,
        href: `https://sozluk.gov.tr/?ara=${encodeURIComponent(w)}`,
      })),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function recoverSiteWithHttpIndex(
  targetUrl: string,
  startedAt: number,
  statusCode: number,
  reason: string
): Promise<OpenSiteResponse | null> {
  const domain = getDomain(targetUrl);

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: `Kullanıcı AlgOFind Site Açıcısı üzerinden "${targetUrl}" adresini açmak istiyor.
Hedef site (${reason}) nedeniyle doğrudan içerik veremedi. Bu sitenin güncel içeriğini ve resmi alt sayfalarını JSON formatında özetle:
{
  "title": "Sitenin resmi başlığı",
  "description": "Sitenin kısa ve net Türkçe açıklaması",
  "sections": [{ "heading": "Bölüm Başlığı", "paragraphs": ["Paragraf."], "bullets": ["Madde"] }],
  "subpages": [{ "text": "Alt sayfa başlığı", "href": "https://${domain}/..." }]
}`,
        config: {
          tools: [{ urlContext: {} }, { googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawText = (response.text ?? "").trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          title?: string;
          description?: string;
          sections?: Array<{ heading?: string; paragraphs?: string[]; bullets?: string[] }>;
          subpages?: Array<{ text?: string; href?: string }>;
        };
        const blocks: ReaderBlock[] = [];
        const links: PageLink[] = [];
        const seen = new Set<string>();

        for (const sec of parsed.sections ?? []) {
          if (sec.heading) blocks.push({ type: "heading", level: 2, text: sec.heading.trim() });
          for (const p of sec.paragraphs ?? []) {
            if (p.trim()) blocks.push({ type: "paragraph", text: p.trim() });
          }
          if (Array.isArray(sec.bullets) && sec.bullets.length > 0) {
            blocks.push({ type: "list", ordered: false, items: sec.bullets.filter(Boolean) });
          }
        }
        for (const sp of parsed.subpages ?? []) {
          const valid = sp.href ? normalizeUrlInput(sp.href) : null;
          if (valid && sp.text && !seen.has(valid)) {
            seen.add(valid);
            links.push({ text: sp.text.trim(), href: valid });
          }
        }
        if (blocks.length > 0 || links.length > 0) {
          return {
            requestedUrl: targetUrl,
            finalUrl: targetUrl,
            domain,
            title: parsed.title?.trim() || domain,
            description: parsed.description?.trim() || "",
            favicon: `https://${domain}/favicon.ico`,
            lang: "tr",
            durationMs: Date.now() - startedAt,
            byteSize: Buffer.byteLength(rawText, "utf8"),
            statusCode: statusCode || 200,
            retrievalMethod: "smart-recovery",
            notice:
              "Hedef site erişim kısıtı uyguladığı için içerik AlgOFind akıllı dizini ile açıldı.",
            blocks,
            links,
          };
        }
      }
    } catch {
      // Fall through to pure HTTP DuckDuckGo + Wikipedia recovery
    }
  }

  const [sitePages, wikiInfo] = await Promise.all([
    fetchDuckDuckGoHtmlSearch(`site:${domain}`, 10),
    fetchWikipediaFastResults(domain.replace(/\.(com|org|net|tr|io|dev|gov).*$/i, "")),
  ]);

  if (sitePages.length === 0 && wikiInfo.results.length === 0) {
    return null;
  }

  const blocks: ReaderBlock[] = [];
  if (wikiInfo.summary) {
    blocks.push({ type: "heading", level: 2, text: `${domain} Hakkında` });
    blocks.push({ type: "paragraph", text: wikiInfo.summary });
  }
  if (sitePages.length > 0) {
    blocks.push({
      type: "heading",
      level: 2,
      text: `${domain} Üzerindeki Popüler Sayfalar ve Bölümler`,
    });
    blocks.push({
      type: "list",
      ordered: false,
      items: sitePages.map((p) => `${p.title} — ${p.snippet}`),
    });
  }

  const links: PageLink[] = [
    ...sitePages.map((p) => ({ text: p.title, href: p.url })),
    ...wikiInfo.results.slice(0, 3).map((w) => ({ text: w.title, href: w.url })),
  ];

  return {
    requestedUrl: targetUrl,
    finalUrl: targetUrl,
    domain,
    title: sitePages[0]?.title || domain,
    description:
      wikiInfo.summary ||
      sitePages[0]?.snippet ||
      `${domain} sitesi için AlgOFind dizininden elde edilen sayfalar.`,
    favicon: `https://${domain}/favicon.ico`,
    lang: "tr",
    durationMs: Date.now() - startedAt,
    byteSize: JSON.stringify(sitePages).length,
    statusCode: statusCode || 200,
    retrievalMethod: "smart-recovery",
    notice:
      "Hedef site kısıtlı yanıt verdiği için alt sayfalar ve özetler AlgOFind dizini üzerinden açıldı.",
    blocks,
    links,
  };
}

function getSiteSearchConfig(domain: string, urlObj: URL): OpenSiteResponse["siteSearch"] {
  if (domain.endsWith("wikipedia.org")) {
    return {
      placeholder: "Vikipedi içinde başlık arayın...",
      urlTemplate: `https://${urlObj.hostname}/w/index.php?search={q}`,
      currentQuery: urlObj.searchParams.get("search") ?? undefined,
    };
  }
  if (domain === "github.com") {
    return {
      placeholder: "GitHub’da depo veya proje arayın...",
      urlTemplate: "https://github.com/search?q={q}",
      currentQuery: urlObj.searchParams.get("q") ?? undefined,
    };
  }
  if (domain === "developer.mozilla.org") {
    return {
      placeholder: "MDN belgelerinde arayın...",
      urlTemplate: "https://developer.mozilla.org/en-US/search?q={q}",
      currentQuery: urlObj.searchParams.get("q") ?? undefined,
    };
  }
  if (domain === "commons.wikimedia.org") {
    return {
      placeholder: "Wikimedia Commons’da medya arayın...",
      urlTemplate: "https://commons.wikimedia.org/w/index.php?search={q}",
      currentQuery: urlObj.searchParams.get("search") ?? undefined,
    };
  }
  return undefined;
}

async function openChatGptDirect(
  targetUrl: string,
  startedAt: number
): Promise<OpenSiteResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const [overviewRes, chatHomeRes] = await Promise.all([
      fetch("https://openai.com/chatgpt/overview/", {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: BROWSER_HEADERS,
      }).catch(() => null),
      fetch("https://chatgpt.com/", {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: BROWSER_HEADERS,
      }).catch(() => null),
    ]);

    const overviewHtml = overviewRes && overviewRes.ok ? await overviewRes.text() : "";
    const chatHtml = chatHomeRes && chatHomeRes.ok ? await chatHomeRes.text() : "";
    const byteSize = Buffer.byteLength(overviewHtml || chatHtml, "utf8");

    if (!overviewHtml && !chatHtml) return null;

    const rawHtml = overviewHtml || chatHtml;
    const baseSourceUrl = overviewHtml ? "https://openai.com/chatgpt/overview/" : "https://chatgpt.com/";
    const $ = cheerio.load(rawHtml);

    const chromeDocument = overviewHtml
      ? await compileChromeDocument(rawHtml, baseSourceUrl, "https://chatgpt.com/")
      : undefined;

    const title =
      $("title").first().text().trim() || "ChatGPT — OpenAI";
    const description =
      $('meta[name="description"]').attr("content")?.trim() ||
      $('meta[property="og:description"]').attr("content")?.trim() ||
      "Soruları yanıtlamak, yazmak, görsel oluşturmak ve kod yazmak için ChatGPT.";

    const links: PageLink[] = [
      { text: "ChatGPT Fiyatlandırma ve Planlar", href: "https://openai.com/chatgpt/pricing/" },
      { text: "ChatGPT İndir (Masaüstü / Mobil)", href: "https://openai.com/chatgpt/download/" },
      { text: "ChatGPT İşletme Çözümleri", href: "https://openai.com/chatgpt/enterprise/" },
      { text: "OpenAI Ana Sayfa", href: "https://openai.com/" },
    ];
    const seenLinks = new Set<string>(links.map((l) => l.href));

    $("a[href]").each((_, el) => {
      if (links.length >= 28) return;
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const href = resolveHref($(el).attr("href"), baseSourceUrl);
      if (!href || text.length < 3 || text.length > 90) return;
      if (/cookie|çerez|privacy|gizlilik|terms|şartlar/i.test(text)) return;
      if (seenLinks.has(href)) return;
      seenLinks.add(href);
      links.push({ text, href });
    });

    $("script, style, noscript, iframe, svg, canvas, footer, nav, aside, form").remove();
    const contentRoot = $("main").first().length > 0 ? $("main").first() : $("body").first();
    const blocks: ReaderBlock[] = [];
    const seenTexts = new Set<string>();

    contentRoot.find("h1, h2, h3, p, ul, ol").each((_, node) => {
      if (blocks.length >= 60) return;
      const tag = node.type === "tag" ? node.name.toLowerCase() : "";
      const $el = $(node);
      if (tag === "p" && $el.parents("li").length > 0) return;

      if (tag === "h1" || tag === "h2" || tag === "h3") {
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text.length < 2 || seenTexts.has(text)) return;
        seenTexts.add(text);
        blocks.push({ type: "heading", level: Number(tag[1]), text });
      } else if (tag === "p") {
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text.length < 15 || seenTexts.has(text)) return;
        seenTexts.add(text);
        blocks.push({ type: "paragraph", text });
      } else if (tag === "ul" || tag === "ol") {
        const items: string[] = [];
        $el.children("li").each((__, li) => {
          const t = $(li).text().replace(/\s+/g, " ").trim();
          if (t.length >= 3 && items.length < 18) items.push(t);
        });
        if (items.length > 0) {
          blocks.push({ type: "list", ordered: tag === "ol", items });
        }
      }
    });

    return {
      requestedUrl: targetUrl,
      finalUrl: targetUrl,
      domain: "chatgpt.com",
      title: title.includes("OpenAI") ? title : `${title} — ChatGPT`,
      description,
      favicon: "https://chatgpt.com/unauth-mweb/favicon.ico",
      lang: "tr",
      durationMs: Date.now() - startedAt,
      byteSize,
      statusCode: 200,
      retrievalMethod: "direct-http",
      notice:
        "ChatGPT sayfası AlgOFind motoru üzerinden tam görsel düzeniyle açıldı.",
      chromeDocument,
      blocks,
      links,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// In-memory CSS stylesheet cache (5 min TTL, max 200 entries) for near-instant Chrome-fidelity subpage loads
const cssStylesheetCache = new Map<string, { css: string; expiresAt: number }>();

function buildAssetProxyUrl(absUrl: string, refererUrl: string): string {
  return `/api/asset-proxy?url=${encodeURIComponent(absUrl)}&ref=${encodeURIComponent(refererUrl)}`;
}

function rewriteCssUrlsAndImports(
  css: string,
  cssBaseUrl: string,
  pageReferer: string
): string {
  // Rewrite url(...) except data:/blob:/#fragment
  let out = css.replace(/url\(\s*(['"]?)([^)'"]+?)\1\s*\)/gi, (full, _q, rawRef) => {
    const ref = String(rawRef).trim();
    if (
      !ref ||
      ref.startsWith("data:") ||
      ref.startsWith("blob:") ||
      ref.startsWith("#")
    ) {
      return full;
    }
    const resolved = resolveHref(ref, cssBaseUrl);
    if (!resolved) return full;
    return `url("${buildAssetProxyUrl(resolved, pageReferer)}")`;
  });

  // Rewrite @import "..." that wasn't already inside url(...)
  out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (full, _q, rawRef) => {
    const resolved = resolveHref(String(rawRef).trim(), cssBaseUrl);
    if (!resolved) return full;
    return `@import url("${buildAssetProxyUrl(resolved, pageReferer)}")`;
  });

  return out;
}

function transformSelectorPreludeForShadow(prelude: string): string {
  return prelude
    .replace(/:root\b/gi, ":host, .af-doc-html")
    .replace(/(^|[\s,>+~(])html(?=$|[\s,.:#[>{+~)])/gi, "$1.af-doc-html")
    .replace(/(^|[\s,>+~(])body(?=$|[\s,.:#[>{+~)])/gi, "$1.af-doc-body");
}

function scopeCssSelectorsOutsideBlocks(css: string): string {
  let out = "";
  let i = 0;
  let tokenStart = 0;

  while (i < css.length) {
    const ch = css[i];

    // Skip comments
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }

    // Skip quoted strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < css.length) {
        if (css[i] === "\\") {
          i += 2;
          continue;
        }
        if (css[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // Found opening brace for a rule or @-rule
    if (ch === "{") {
      const prelude = css.slice(tokenStart, i);
      // Find matching closing brace cleanly
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        const c = css[j];
        if (c === "/" && css[j + 1] === "*") {
          const end = css.indexOf("*/", j + 2);
          j = end === -1 ? css.length : end + 2;
          continue;
        }
        if (c === '"' || c === "'") {
          const q = c;
          j++;
          while (j < css.length) {
            if (css[j] === "\\") {
              j += 2;
              continue;
            }
            if (css[j] === q) {
              j++;
              break;
            }
            j++;
          }
          continue;
        }
        if (c === "{") depth++;
        else if (c === "}") depth--;
        j++;
      }

      const inner = css.slice(i + 1, Math.max(i + 1, j - 1));
      const trimmedPrelude = prelude.trimStart();

      if (trimmedPrelude.startsWith("@")) {
        const isNestedRuleAt =
          /^@(?:media|supports|layer|container|document|scope)\b/i.test(trimmedPrelude);
        out += prelude + "{" + (isNestedRuleAt ? scopeCssSelectorsOutsideBlocks(inner) : inner) + "}";
      } else {
        out += transformSelectorPreludeForShadow(prelude) + "{" + inner + "}";
      }

      i = j;
      tokenStart = i;
      continue;
    }

    if (ch === ";") {
      // Statement rule such as @import ...; or @charset ...;
      out += css.slice(tokenStart, i + 1);
      i++;
      tokenStart = i;
      continue;
    }

    i++;
  }

  if (tokenStart < css.length) {
    out += css.slice(tokenStart);
  }
  return out;
}

function transformCssForShadowDom(
  rawCss: string,
  cssBaseUrl: string,
  pageReferer: string
): string {
  const rewritten = rewriteCssUrlsAndImports(rawCss, cssBaseUrl, pageReferer);
  return scopeCssSelectorsOutsideBlocks(rewritten);
}

async function fetchExternalCssCached(
  cssUrl: string,
  pageReferer: string
): Promise<string> {
  const cleanUrl = cssUrl.split("#")[0];
  const cached = cssStylesheetCache.get(cleanUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return transformCssForShadowDom(cached.css, cleanUrl, pageReferer);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3200);
  try {
    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": BROWSER_HEADERS["User-Agent"],
        Accept: "text/css,*/*;q=0.1",
        Referer: pageReferer,
      },
    });
    if (!res.ok) return "";
    const text = await res.text();
    if (text.length > 2_500_000) return "";
    if (cssStylesheetCache.size >= 200) {
      const oldestKey = cssStylesheetCache.keys().next().value;
      if (oldestKey) cssStylesheetCache.delete(oldestKey);
    }
    cssStylesheetCache.set(cleanUrl, {
      css: text,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return transformCssForShadowDom(text, cleanUrl, pageReferer);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function rewriteSrcset(srcset: string, baseUrl: string): string {
  return srcset
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return "";
      const spaceIdx = trimmed.search(/\s/);
      const urlPart = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const desc = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx);
      const resolved = resolveHref(urlPart, baseUrl);
      if (!resolved) return "";
      return `${buildAssetProxyUrl(resolved, baseUrl)}${desc}`;
    })
    .filter(Boolean)
    .join(", ");
}

async function compileChromeDocument(
  rawHtml: string,
  finalUrl: string,
  cssBaseUrl = finalUrl
): Promise<ChromeDocumentPayload | undefined> {
  try {
    const $ = cheerio.load(rawHtml);

    // 1. Collect <link rel="stylesheet"> & <style> in exact DOM source order
    type StyleSource =
      | { kind: "link"; url: string; media?: string }
      | { kind: "inline"; css: string; media?: string };
    const styleQueue: StyleSource[] = [];
    const seenCssUrls = new Set<string>();

    $("link[rel], style").each((_, el) => {
      const tag = el.type === "tag" ? el.name.toLowerCase() : "";
      const $el = $(el);
      const media = $el.attr("media")?.trim();
      if (media && media.toLowerCase() === "print") return;

      if (tag === "link") {
        if ($el.attr("disabled") !== undefined) return;
        const rel = ($el.attr("rel") ?? "").toLowerCase().split(/\s+/);
        if (!rel.includes("stylesheet")) return;
        const resolved = resolveHref($el.attr("href"), cssBaseUrl);
        if (!resolved) return;
        const clean = resolved.split("#")[0];
        if (seenCssUrls.has(clean) || seenCssUrls.size >= 24) return;
        seenCssUrls.add(clean);
        styleQueue.push({ kind: "link", url: clean, media });
      } else if (tag === "style") {
        const cssText = $el.html() ?? "";
        if (cssText.trim()) {
          styleQueue.push({ kind: "inline", css: cssText, media });
        }
      }
    });

    const uniqueLinks = Array.from(seenCssUrls);
    const fetchedCssMap = new Map<string, string>();
    await Promise.all(
      uniqueLinks.map(async (u) => {
        const css = await fetchExternalCssCached(u, cssBaseUrl);
        if (css) fetchedCssMap.set(u, css);
      })
    );

    const styles: ChromeStyleSheet[] = [];
    for (const item of styleQueue) {
      if (item.kind === "link") {
        const css = fetchedCssMap.get(item.url);
        if (css) styles.push({ css, media: item.media });
      } else {
        const css = transformCssForShadowDom(item.css, finalUrl, finalUrl);
        if (css) styles.push({ css, media: item.media });
      }
    }

    // 2. Preserve <html> attributes (class, lang, dir, theme data-* attrs)
    const htmlEl = $("html").first();
    const htmlAttrs: Record<string, string> = {};
    const rawHtmlAttribs =
      (htmlEl.get(0) as unknown as { attribs?: Record<string, string> } | undefined)?.attribs ?? {};
    for (const [k, v] of Object.entries(rawHtmlAttribs)) {
      if (!k.toLowerCase().startsWith("on")) {
        htmlAttrs[k] = v;
      }
    }

    const $body = $("body").first();
    const bodyClass = $body.attr("class")?.trim() ?? "";
    const bodyStyleRaw = $body.attr("style")?.trim() ?? "";
    const bodyStyle = bodyStyleRaw
      ? rewriteCssUrlsAndImports(bodyStyleRaw, finalUrl, finalUrl)
      : "";

    // 3. Remove active scripts, iframes, and dangerous elements
    $body
      .find("script, noscript, iframe, frame, frameset, object, embed, applet, base, meta[http-equiv='refresh']")
      .remove();

    // 4. Sanitize attributes and proxy visual assets + tag interactive links/forms
    $body.find("*").each((_, node) => {
      const $n = $(node);
      const tag = node.type === "tag" ? node.name.toLowerCase() : "";
      const attribs =
        (node as unknown as { attribs?: Record<string, string> }).attribs ?? {};

      for (const attrName of Object.keys(attribs)) {
        const lower = attrName.toLowerCase();
        if (lower.startsWith("on")) {
          $n.removeAttr(attrName);
          continue;
        }
        const val = attribs[attrName] ?? "";
        if (/^\s*(javascript|vbscript):/i.test(val)) {
          $n.removeAttr(attrName);
        }
      }

      const inlineStyle = $n.attr("style");
      if (inlineStyle && inlineStyle.includes("url(")) {
        $n.attr("style", rewriteCssUrlsAndImports(inlineStyle, finalUrl, finalUrl));
      }

      if (tag === "img") {
        const currentSrc = $n.attr("src")?.trim() ?? "";
        const lazySrc =
          $n.attr("data-src") ||
          $n.attr("data-original") ||
          $n.attr("data-lazy-src") ||
          $n.attr("data-url") ||
          "";
        const effectiveSrc =
          !currentSrc ||
          /^data:image\/(?:gif|svg\+xml);base64,/i.test(currentSrc) ||
          currentSrc.includes("1x1")
            ? lazySrc || currentSrc
            : currentSrc;

        if (effectiveSrc && !effectiveSrc.startsWith("data:")) {
          const abs = resolveHref(effectiveSrc, finalUrl);
          if (abs) {
            $n.attr("src", buildAssetProxyUrl(abs, finalUrl));
          }
        }
        const srcset = $n.attr("srcset") || $n.attr("data-srcset");
        if (srcset) {
          const rewritten = rewriteSrcset(srcset, finalUrl);
          if (rewritten) $n.attr("srcset", rewritten);
          else $n.removeAttr("srcset");
        }
      } else if (tag === "source") {
        const src = $n.attr("src");
        if (src && !src.startsWith("data:")) {
          const abs = resolveHref(src, finalUrl);
          if (abs) $n.attr("src", buildAssetProxyUrl(abs, finalUrl));
        }
        const srcset = $n.attr("srcset");
        if (srcset) {
          const rewritten = rewriteSrcset(srcset, finalUrl);
          if (rewritten) $n.attr("srcset", rewritten);
          else $n.removeAttr("srcset");
        }
      } else if (tag === "video") {
        const poster = $n.attr("poster");
        if (poster && !poster.startsWith("data:")) {
          const abs = resolveHref(poster, finalUrl);
          if (abs) $n.attr("poster", buildAssetProxyUrl(abs, finalUrl));
        }
      } else if (tag === "image") {
        const hrefAttr = $n.attr("href") || $n.attr("xlink:href");
        if (hrefAttr && !hrefAttr.startsWith("data:") && !hrefAttr.startsWith("#")) {
          const abs = resolveHref(hrefAttr, finalUrl);
          if (abs) {
            $n.attr("href", buildAssetProxyUrl(abs, finalUrl));
            $n.removeAttr("xlink:href");
          }
        }
      } else if (tag === "a") {
        const rawHref = $n.attr("href")?.trim() ?? "";
        $n.removeAttr("target");
        if (rawHref.startsWith("#")) {
          $n.attr("data-af-href", rawHref);
        } else {
          const abs = resolveHref(rawHref, finalUrl);
          if (abs) {
            $n.attr("href", abs);
            $n.attr("data-af-href", abs);
          } else {
            $n.removeAttr("href");
          }
        }
      } else if (tag === "form") {
        const rawAction = $n.attr("action")?.trim() || finalUrl;
        const absAction = resolveHref(rawAction, finalUrl) || finalUrl;
        $n.attr("data-af-form", "true");
        $n.attr("data-af-action", absAction);
        $n.attr("data-af-method", ($n.attr("method") ?? "get").toLowerCase());
      }
    });

    const bodyHtml = $body.html() ?? "";
    if (!bodyHtml.trim()) return undefined;

    return {
      styles,
      htmlAttrs,
      bodyClass,
      bodyStyle,
      bodyHtml,
      stylesheetCount: styles.length,
    };
  } catch (err) {
    console.error("compileChromeDocument error:", err);
    return undefined;
  }
}

// ============================================================================
// Hidden Edge-Masked Web Engine Pool & Interactive Session Manager
// ============================================================================
const EDGE_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";

interface EngineTabSession {
  id: string;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession | null;
  screencastActive: boolean;
  latestFrameDataUrl?: string;
  streamClients: Set<express.Response>;
  viewportWidth: number;
  viewportHeight: number;
  historyUrls: string[];
  historyIndex: number;
  lastActiveAt: number;
}

let sharedEngineBrowser: Browser | null = null;
let sharedEngineLaunchPromise: Promise<Browser> | null = null;
const engineSessions = new Map<string, EngineTabSession>();

function resolveEngineBinaryPath(): string | undefined {
  const candidates = [
    process.env.ALGOFIND_ENGINE_PATH,
    "/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell",
  ].filter((p): p is string => Boolean(p));

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const def = webEngineCore.executablePath();
    if (def && fs.existsSync(def)) return def;
  } catch {
    // ignore
  }
  return undefined;
}

async function getSharedEngineBrowser(): Promise<Browser> {
  if (sharedEngineBrowser && sharedEngineBrowser.isConnected()) {
    return sharedEngineBrowser;
  }
  if (sharedEngineLaunchPromise) {
    return sharedEngineLaunchPromise;
  }

  sharedEngineLaunchPromise = (async () => {
    const executablePath = resolveEngineBinaryPath();
    const browser = await webEngineCore.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-smooth-scrolling",
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });
    browser.on("disconnected", () => {
      sharedEngineBrowser = null;
      engineSessions.clear();
    });
    sharedEngineBrowser = browser;
    return browser;
  })();

  try {
    return await sharedEngineLaunchPromise;
  } finally {
    sharedEngineLaunchPromise = null;
  }
}

async function searchOpenWebWithChromium(
  query: string,
  limit = 10
): Promise<SearchResultItem[]> {
  let ctx: BrowserContext | null = null;
  try {
    const browser = await getSharedEngineBrowser();
    const context = await browser.newContext({
      userAgent: EDGE_USER_AGENT,
      locale: "tr-TR",
      timezoneId: "Europe/Istanbul",
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        "sec-ch-ua": '"Microsoft Edge";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });
    ctx = context;
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const rtype = route.request().resourceType();
      if (rtype === "image" || rtype === "stylesheet" || rtype === "font" || rtype === "media") {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=tr`, {
      waitUntil: "domcontentloaded",
      timeout: 5500,
    });
    await page.waitForSelector("li.b_algo h2 a", { timeout: 2200 }).catch(() => {});

    const rawEntries = await page.evaluate((maxCount) => {
      const out: Array<{ title: string; href: string; snippet: string }> = [];
      for (const el of Array.from(document.querySelectorAll("li.b_algo"))) {
        if (out.length >= maxCount) break;
        const a = el.querySelector("h2 a");
        const title = a?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        const href = a?.getAttribute("href") ?? "";
        const snipEl = el.querySelector(".b_caption p, .b_lineclamp2, .b_algoSlug, p");
        const snippet = snipEl?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (title && href) {
          out.push({ title, href, snippet });
        }
      }
      return out;
    }, limit + 4);

    const items: SearchResultItem[] = [];
    const seenDomains = new Set<string>();
    for (let idx = 0; idx < rawEntries.length; idx++) {
      if (items.length >= limit) break;
      const entry = rawEntries[idx];
      const decoded = decodeBingRedirectUrl(entry.href);
      const validUrl = normalizeUrlInput(decoded);
      if (!validUrl) continue;
      const dom = getDomain(validUrl);
      if (dom.includes("bing.com") || dom.includes("microsoft.com/fwlink")) continue;
      if (isGoogleSearchDomain(dom)) continue;
      if (seenDomains.has(dom) && items.length < 6) continue;
      seenDomains.add(dom);

      items.push({
        id: `engine-web-${idx}-${dom}`,
        title: entry.title,
        url: validUrl,
        domain: dom,
        snippet: entry.snippet || `${dom} üzerinden canlı web sonucu.`,
        popularityLabel: items.length === 0 ? "En Popüler Web Sonucu" : "Açık İnternet Kaynağı",
      });
    }
    return items;
  } catch {
    return [];
  } finally {
    if (ctx) {
      await ctx.close().catch(() => {});
    }
  }
}

async function createStealthEngineSession(
  viewportWidth = 1280,
  viewportHeight = 800
): Promise<EngineTabSession> {
  const w = Math.max(390, Math.min(1440, Math.round(viewportWidth)));
  const h = Math.max(540, Math.min(960, Math.round(viewportHeight)));

  // Evict oldest if >= 5 active sessions
  if (engineSessions.size >= 5) {
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    for (const [sid, sess] of engineSessions.entries()) {
      if (sess.lastActiveAt < oldestTime) {
        oldestTime = sess.lastActiveAt;
        oldestId = sid;
      }
    }
    if (oldestId) {
      const old = engineSessions.get(oldestId);
      engineSessions.delete(oldestId);
      await old?.context.close().catch(() => {});
    }
  }

  const browser = await getSharedEngineBrowser();
  const context = await browser.newContext({
    userAgent: EDGE_USER_AGENT,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    extraHTTPHeaders: {
      "sec-ch-ua": '"Microsoft Edge";v="131", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    },
  });

  // Edge-like stealth fingerprint masking (zero automation or Chromium hints)
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
        configurable: true,
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["tr-TR", "tr", "en-US", "en"],
        configurable: true,
      });
      Object.defineProperty(navigator, "platform", {
        get: () => "Win32",
        configurable: true,
      });
      Object.defineProperty(navigator, "userAgentData", {
        get: () => ({
          brands: [
            { brand: "Microsoft Edge", version: "131" },
            { brand: "Not_A Brand", version: "24" },
          ],
          mobile: false,
          platform: "Windows",
          getHighEntropyValues: async () => ({
            architecture: "x86",
            bitness: "64",
            brands: [
              { brand: "Microsoft Edge", version: "131" },
              { brand: "Not_A Brand", version: "24" },
            ],
            fullVersionList: [
              { brand: "Microsoft Edge", version: "131.0.2903.112" },
              { brand: "Not_A Brand", version: "24.0.0.0" },
            ],
            mobile: false,
            model: "",
            platform: "Windows",
            platformVersion: "15.0.0",
            uaFullVersion: "131.0.2903.112",
          }),
        }),
        configurable: true,
      });
      const wAny = window as unknown as Record<string, unknown>;
      if (!wAny.chrome) {
        wAny.chrome = {
          runtime: {},
          app: { isInstalled: false },
          csi: () => ({}),
          loadTimes: () => ({}),
        };
      }
    } catch {
      // ignore
    }
  });

  const page = await context.newPage();
  const id = crypto.randomUUID();
  const session: EngineTabSession = {
    id,
    context,
    page,
    cdp: null,
    screencastActive: false,
    streamClients: new Set(),
    viewportWidth: w,
    viewportHeight: h,
    historyUrls: [],
    historyIndex: -1,
    lastActiveAt: Date.now(),
  };

  try {
    const cdp = await context.newCDPSession(page);
    session.cdp = cdp;
    cdp.on("Page.screencastFrame", async (ev: { data: string; sessionId: number }) => {
      session.latestFrameDataUrl = `data:image/jpeg;base64,${ev.data}`;
      for (const client of session.streamClients) {
        try {
          client.write(`event: frame\ndata: ${ev.data}\n\n`);
        } catch {
          session.streamClients.delete(client);
        }
      }
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId });
      } catch {
        // ignore ack race on close
      }
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 58,
      maxWidth: w,
      maxHeight: h,
      everyNthFrame: 2,
    });
    session.screencastActive = true;
  } catch {
    session.screencastActive = false;
  }

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const navUrl = frame.url();
    if (!navUrl || navUrl === "about:blank") return;
    const sliced = session.historyUrls.slice(0, session.historyIndex + 1);
    if (sliced[sliced.length - 1] !== navUrl) {
      sliced.push(navUrl);
      session.historyUrls = sliced;
      session.historyIndex = sliced.length - 1;
    }
    void page
      .title()
      .catch(() => getDomain(navUrl))
      .then((t) => {
        const metaPayload = JSON.stringify({
          finalUrl: navUrl,
          domain: getDomain(navUrl),
          title: t || getDomain(navUrl),
          canGoBack: session.historyIndex > 0,
          canGoForward: session.historyIndex < session.historyUrls.length - 1,
        });
        for (const client of session.streamClients) {
          try {
            client.write(`event: meta\ndata: ${metaPayload}\n\n`);
          } catch {
            session.streamClients.delete(client);
          }
        }
      });
  });

  engineSessions.set(id, session);
  return session;
}

async function restartSessionScreencast(session: EngineTabSession): Promise<void> {
  if (!session.cdp) return;
  try {
    await session.cdp.send("Page.stopScreencast").catch(() => {});
    await session.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 58,
      maxWidth: session.viewportWidth,
      maxHeight: session.viewportHeight,
      everyNthFrame: 2,
    });
    session.screencastActive = true;
  } catch {
    session.screencastActive = false;
  }
}

// Cleanup idle sessions older than 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [sid, sess] of engineSessions.entries()) {
    if (sess.lastActiveAt < cutoff) {
      engineSessions.delete(sid);
      void sess.context.close().catch(() => {});
    }
  }
}, 60 * 1000).unref();

function extractReaderDataFromHtml(html: string, finalUrl: string) {
  const $ = cheerio.load(html);
  const finalParsed = new URL(finalUrl);

  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    getDomain(finalUrl);

  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";

  const rawIcon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    "/favicon.ico";
  const favicon = resolveHref(rawIcon, finalUrl) ?? "";
  const lang = $("html").attr("lang")?.trim() || "tr";

  const links: PageLink[] = [];
  const seenLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    if (links.length >= 35) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const href = resolveHref($(el).attr("href"), finalUrl);
    if (!href || text.length < 2 || text.length > 120) return;
    if (seenLinks.has(href)) return;
    seenLinks.add(href);
    links.push({ text, href });
  });

  const blocks: ReaderBlock[] = [];
  const seenTexts = new Set<string>();

  if (finalParsed.hostname.includes("news.ycombinator.com")) {
    const stories: string[] = [];
    $("tr.athing").each((_, row) => {
      if (stories.length >= 25) return;
      const rank = $(row).find("span.rank").text().trim();
      const $titleLink = $(row).find("span.titleline > a").first();
      const stTitle = $titleLink.text().trim();
      const stSite = $(row).find("span.sitestr").text().trim();
      if (stTitle) {
        stories.push(`${rank} ${stTitle}${stSite ? ` (${stSite})` : ""}`);
      }
    });
    if (stories.length > 0) {
      blocks.push({ type: "heading", level: 2, text: "Öne Çıkan Teknoloji Haberleri" });
      blocks.push({ type: "list", ordered: false, items: stories });
    }
  }

  $("script, style, noscript, iframe, svg, canvas, footer, nav, aside, form").remove();
  $('[aria-hidden="true"], .cookie-banner, #cookie-banner, .advertisement, .ads').remove();

  const contentRoot =
    $("main").first().length > 0
      ? $("main").first()
      : $("article").first().length > 0
        ? $("article").first()
        : $("body").first();

  contentRoot.find("h1, h2, h3, h4, p, ul, ol, blockquote, pre, img, dt, dd").each((_, node) => {
    if (blocks.length >= 85) return;
    const tag = node.type === "tag" ? node.name.toLowerCase() : "";
    const $el = $(node);

    if (tag === "p" && $el.parents("blockquote, li").length > 0) return;
    if (tag === "img" && $el.parents("a").length > 0 && $el.closest("p").length > 0) return;

    if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4" || tag === "dt") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text.length < 2 || seenTexts.has(text)) return;
      seenTexts.add(text);
      blocks.push({ type: "heading", level: tag === "dt" ? 3 : Number(tag[1]), text });
    } else if (tag === "p" || tag === "dd") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text.length < 10 || seenTexts.has(text)) return;
      seenTexts.add(text);
      const inlineHtml = sanitizeInlineHtml($, $el, finalUrl);
      blocks.push({ type: "paragraph", text, html: inlineHtml });
    } else if (tag === "ul" || tag === "ol") {
      if ($el.parents("ul, ol").length > 0) return;
      const items: string[] = [];
      $el.children("li").each((__, li) => {
        const liText = $(li).text().replace(/\s+/g, " ").trim();
        if (liText.length >= 2 && items.length < 25) items.push(liText);
      });
      if (items.length > 0) {
        blocks.push({ type: "list", ordered: tag === "ol", items });
      }
    } else if (tag === "blockquote") {
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text.length >= 10 && !seenTexts.has(text)) {
        seenTexts.add(text);
        blocks.push({ type: "blockquote", text });
      }
    } else if (tag === "pre") {
      const text = $el.text().trim();
      if (text.length >= 4) {
        blocks.push({ type: "code", text: text.slice(0, 1500) });
      }
    } else if (tag === "img") {
      const src = resolveHref($el.attr("src") || $el.attr("data-src"), finalUrl);
      const alt = ($el.attr("alt") ?? "").trim();
      const widthAttr = Number($el.attr("width") ?? 0);
      if (!src) return;
      if (/pixel|tracker|spacer|1x1|logo.*\.svg/i.test(src)) return;
      if (widthAttr > 0 && widthAttr < 48) return;
      blocks.push({ type: "image", src, alt });
    }
  });

  return { title, description, favicon, lang, links, blocks };
}

async function openWithStealthEngine(
  targetUrl: string,
  startedAt: number,
  existingSessionId?: string,
  vpWidth = 1366,
  vpHeight = 820,
  includeCss = false
): Promise<OpenSiteResponse | null> {
  const targetW = Math.max(360, Math.min(1920, Math.round(vpWidth)));
  const targetH = Math.max(480, Math.min(1200, Math.round(vpHeight)));

  let session = existingSessionId ? engineSessions.get(existingSessionId) : undefined;
  if (!session || session.page.isClosed()) {
    session = await createStealthEngineSession(targetW, targetH);
  } else if (
    Math.abs(session.viewportWidth - targetW) > 12 ||
    Math.abs(session.viewportHeight - targetH) > 12
  ) {
    await session.page.setViewportSize({ width: targetW, height: targetH }).catch(() => {});
    session.viewportWidth = targetW;
    session.viewportHeight = targetH;
    await restartSessionScreencast(session);
  }
  session.lastActiveAt = Date.now();

  try {
    const navRes = await session.page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 12000,
    });
    // Short settle only; CDP Screencast streams subsequent paints and hydration smoothly in real time
    await session.page.waitForTimeout(120);

    const finalUrl = session.page.url() || targetUrl;
    const finalParsed = new URL(finalUrl);
    if (isPrivateOrBlockedHost(finalParsed.hostname)) {
      return null;
    }

    // Track browser tab navigation history
    const sliced = session.historyUrls.slice(0, session.historyIndex + 1);
    if (sliced[sliced.length - 1] !== finalUrl) {
      sliced.push(finalUrl);
      session.historyUrls = sliced;
      session.historyIndex = sliced.length - 1;
    }

    const statusCode = navRes?.status() ?? 200;
    const [screenshotBuf, hydratedHtml] = await Promise.all([
      session.page.screenshot({ type: "jpeg", quality: 78 }),
      session.page.content(),
    ]);

    const byteSize = Buffer.byteLength(hydratedHtml, "utf8");
    const readerData = extractReaderDataFromHtml(hydratedHtml, finalUrl);

    let chromeDocument: ChromeDocumentPayload | undefined;
    if (includeCss) {
      chromeDocument = await compileChromeDocument(hydratedHtml, finalUrl);
      const runtimeCss = await session.page
        .evaluate(() => {
          const rules: string[] = [];
          try {
            for (const sheet of Array.from(document.styleSheets)) {
              if (!sheet.href) {
                try {
                  for (const rule of Array.from(sheet.cssRules)) {
                    rules.push(rule.cssText);
                  }
                } catch {
                  // cross-origin
                }
              }
            }
          } catch {
            // ignore
          }
          return rules.join("\n").slice(0, 350_000);
        })
        .catch(() => "");
      if (chromeDocument && runtimeCss) {
        chromeDocument.styles.push({
          css: transformCssForShadowDom(runtimeCss, finalUrl, finalUrl),
        });
      }
    }

    const domain = getDomain(finalUrl);
    const lowerTitle = readerData.title.toLowerCase();
    const isBlockedChallenge =
      statusCode === 403 ||
      lowerTitle.includes("just a moment") ||
      lowerTitle.includes("attention required");

    // If Cloudflare blocked even the stealth engine (e.g. Stack Overflow challenge), recover cleanly
    if (isBlockedChallenge && readerData.blocks.length < 2) {
      return null;
    }

    const frameDataUrl = `data:image/jpeg;base64,${screenshotBuf.toString("base64")}`;
    session.latestFrameDataUrl = frameDataUrl;

    return {
      requestedUrl: targetUrl,
      finalUrl,
      domain,
      title: readerData.title,
      description: readerData.description,
      favicon: readerData.favicon,
      lang: readerData.lang,
      durationMs: Date.now() - startedAt,
      byteSize,
      statusCode,
      retrievalMethod: "algofind-engine",
      siteSearch: getSiteSearchConfig(domain, finalParsed),
      liveViewport: {
        sessionId: session.id,
        frameDataUrl,
        viewportWidth: session.viewportWidth,
        viewportHeight: session.viewportHeight,
        canGoBack: session.historyIndex > 0,
        canGoForward: session.historyIndex < session.historyUrls.length - 1,
      },
      chromeDocument,
      blocks: readerData.blocks,
      links: readerData.links,
    };
  } catch (err) {
    console.error("Stealth engine open error:", err);
    return null;
  }
}

  // Real-Time SSE Screencast Frame Stream (zero polling lag)
  app.get("/api/browser/stream/:sessionId", (req, res) => {
    const session = engineSessions.get(req.params.sessionId);
    if (!session || session.page.isClosed()) {
      return res.status(410).end();
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    session.streamClients.add(res);
    session.lastActiveAt = Date.now();

    if (session.latestFrameDataUrl) {
      const b64 = session.latestFrameDataUrl.replace(/^data:image\/jpeg;base64,/, "");
      res.write(`event: frame\ndata: ${b64}\n\n`);
    }

    const keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clearInterval(keepAlive);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      session.streamClients.delete(res);
    });
  });

  // Ultra-fast hover & Chrome-style cursor detection (I-beam 'text' over inputs/text, 'pointer' over links/buttons)
  app.post("/api/browser/cursor", async (req, res) => {
    const { sessionId, x, y } = req.body ?? {};
    const session = typeof sessionId === "string" ? engineSessions.get(sessionId) : undefined;
    if (!session || session.page.isClosed()) {
      return res.status(410).json({ cursor: "default", isEditable: false });
    }
    if (typeof x !== "number" || typeof y !== "number") {
      return res.json({ cursor: "default", isEditable: false });
    }

    session.lastActiveAt = Date.now();
    try {
      if (session.cdp) {
        await session.cdp.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x,
          y,
        });
      } else {
        await session.page.mouse.move(x, y);
      }
      const result = await session.page.evaluate(({ px, py }) => {
        const el = document.elementFromPoint(px, py) as HTMLElement | null;
        if (!el) return { cursor: "default", isEditable: false };

        const editableSelector =
          'textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="password"], input[type="tel"], input[type="number"]';
        const editableMatch = el.closest(editableSelector);
        if (editableMatch) {
          return { cursor: "text", isEditable: true };
        }

        const styleCursor = getComputedStyle(el).cursor;
        if (styleCursor === "text") {
          return { cursor: "text", isEditable: false };
        }

        const clickableMatch = el.closest(
          'a[href], button, [role="button"], summary, select, label[for], input[type="submit"], input[type="button"], input[type="checkbox"], input[type="radio"]'
        );
        if (clickableMatch || styleCursor === "pointer") {
          return { cursor: "pointer", isEditable: false };
        }

        if (styleCursor && styleCursor !== "auto" && styleCursor !== "default") {
          return { cursor: styleCursor, isEditable: false };
        }

        // In Chrome, hovering over readable text turns cursor into I-beam 'text'
        if (
          el.matches("p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, code, pre, dt, dd, strong, em, b, i") &&
          (el.textContent?.trim().length ?? 0) > 0
        ) {
          return { cursor: "text", isEditable: false };
        }

        return { cursor: "default", isEditable: false };
      }, { px: x, py: y });

      res.json(result);
    } catch {
      res.json({ cursor: "default", isEditable: false });
    }
  });

  app.post("/api/browser/interact", async (req, res) => {
    const {
      sessionId,
      action,
      x,
      y,
      text,
      key,
      deltaX,
      deltaY,
      viewportWidth,
      viewportHeight,
    } = req.body ?? {};
    const session = typeof sessionId === "string" ? engineSessions.get(sessionId) : undefined;
    if (!session || session.page.isClosed()) {
      return res.status(410).json({ error: "Oturum süresi doldu, sayfa yeniden yükleniyor." });
    }

    session.lastActiveAt = Date.now();
    try {
      let needFreshScreenshot = !session.screencastActive || !session.latestFrameDataUrl;
      let isEditable = false;

      if (
        typeof viewportWidth === "number" &&
        typeof viewportHeight === "number" &&
        viewportWidth >= 360 &&
        viewportHeight >= 480
      ) {
        const w = Math.max(360, Math.min(1920, Math.round(viewportWidth)));
        const h = Math.max(480, Math.min(1200, Math.round(viewportHeight)));
        if (Math.abs(session.viewportWidth - w) > 12 || Math.abs(session.viewportHeight - h) > 12) {
          await session.page.setViewportSize({ width: w, height: h });
          session.viewportWidth = w;
          session.viewportHeight = h;
          await restartSessionScreencast(session);
          needFreshScreenshot = true;
        }
      }

      if (action === "wheel") {
        const dx = Number(deltaX) || 0;
        const dy = Number(deltaY) || 0;
        const px = typeof x === "number" ? x : Math.round(session.viewportWidth / 2);
        const py = typeof y === "number" ? y : Math.round(session.viewportHeight / 2);
        if (session.screencastActive && session.cdp) {
          const scrolled = await session.page
            .evaluate(
              ({ posX, posY, dX, dY }) => {
                let cur = document.elementFromPoint(posX, posY) as HTMLElement | null;
                while (cur && cur !== document.body && cur !== document.documentElement) {
                  const st = getComputedStyle(cur);
                  const canY =
                    (st.overflowY === "auto" ||
                      st.overflowY === "scroll" ||
                      st.overflowY === "overlay") &&
                    cur.scrollHeight > cur.clientHeight + 1;
                  const canX =
                    (st.overflowX === "auto" ||
                      st.overflowX === "scroll" ||
                      st.overflowX === "overlay") &&
                    cur.scrollWidth > cur.clientWidth + 1;
                  if (canY || canX) {
                    const prevTop = cur.scrollTop;
                    const prevLeft = cur.scrollLeft;
                    cur.scrollBy({
                      left: canX ? dX : 0,
                      top: canY ? dY : 0,
                      behavior: "instant" as ScrollBehavior,
                    });
                    if (cur.scrollTop !== prevTop || cur.scrollLeft !== prevLeft) {
                      return true;
                    }
                  }
                  cur = cur.parentElement;
                }
                const prevWinY = window.scrollY;
                const prevWinX = window.scrollX;
                window.scrollBy({
                  left: dX,
                  top: dY,
                  behavior: "instant" as ScrollBehavior,
                });
                return window.scrollY !== prevWinY || window.scrollX !== prevWinX;
              },
              { posX: px, posY: py, dX: dx, dY: dy }
            )
            .catch(() => false);

          if (!scrolled) {
            void session.cdp
              .send("Input.dispatchMouseEvent", {
                type: "mouseWheel",
                x: px,
                y: py,
                deltaX: dx,
                deltaY: dy,
              })
              .catch(() => {});
          }
          return res.json({ ok: true, sessionId: session.id });
        }
        await session.page.mouse.wheel(dx, dy);
        await session.page.waitForTimeout(80);
        needFreshScreenshot = true;
      } else if (action === "click" && typeof x === "number" && typeof y === "number") {
        await session.page.mouse.click(x, y);
        isEditable = await session.page
          .evaluate(({ px, py }) => {
            const active = document.activeElement as HTMLElement | null;
            const edSel =
              'textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"], input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="password"], input[type="tel"], input[type="number"]';
            if (active && active.matches(edSel)) return true;
            const el = document.elementFromPoint(px, py) as HTMLElement | null;
            return Boolean(el?.closest(edSel));
          }, { px: x, py: y })
          .catch(() => false);
        if (!session.screencastActive) {
          await session.page.waitForTimeout(250);
          needFreshScreenshot = true;
        }
      } else if (action === "type" && typeof text === "string") {
        await session.page.keyboard.insertText(text);
        if (session.screencastActive) {
          return res.json({ ok: true, sessionId: session.id });
        }
        needFreshScreenshot = true;
      } else if (action === "typeAndEnter" && typeof text === "string") {
        await session.page.keyboard.insertText(text);
        await session.page.keyboard.press("Enter");
        if (!session.screencastActive) {
          await session.page.waitForTimeout(350);
          needFreshScreenshot = true;
        }
      } else if (action === "key" && typeof key === "string") {
        await session.page.keyboard.press(key);
        if (session.screencastActive && key !== "Enter") {
          return res.json({ ok: true, sessionId: session.id });
        }
        if (!session.screencastActive) {
          await session.page.waitForTimeout(120);
          needFreshScreenshot = true;
        }
      } else if (action === "back") {
        await session.page.goBack({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
        if (session.historyIndex > 0) session.historyIndex--;
        needFreshScreenshot = true;
      } else if (action === "forward") {
        await session.page.goForward({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
        if (session.historyIndex < session.historyUrls.length - 1) session.historyIndex++;
        needFreshScreenshot = true;
      } else if (action === "reload") {
        await session.page.reload({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
        needFreshScreenshot = true;
      } else if (action === "resize") {
        await session.page.waitForTimeout(80);
        needFreshScreenshot = true;
      } else if (action === "refresh") {
        needFreshScreenshot = true;
      }

      const finalUrl = session.page.url();
      const sliced = session.historyUrls.slice(0, session.historyIndex + 1);
      if (action !== "back" && action !== "forward" && sliced[sliced.length - 1] !== finalUrl) {
        sliced.push(finalUrl);
        session.historyUrls = sliced;
        session.historyIndex = sliced.length - 1;
      }

      let frameDataUrl = needFreshScreenshot ? "" : "";
      if (needFreshScreenshot || !session.latestFrameDataUrl) {
        const screenshotBuf = await session.page.screenshot({ type: "jpeg", quality: 72 });
        frameDataUrl = `data:image/jpeg;base64,${screenshotBuf.toString("base64")}`;
        session.latestFrameDataUrl = frameDataUrl;
      }
      const title = await session.page.title().catch(() => getDomain(finalUrl));

      res.json({
        sessionId: session.id,
        finalUrl,
        domain: getDomain(finalUrl),
        title: title || getDomain(finalUrl),
        isEditable,
        liveViewport: {
          sessionId: session.id,
          frameDataUrl,
          viewportWidth: session.viewportWidth,
          viewportHeight: session.viewportHeight,
          canGoBack: session.historyIndex > 0,
          canGoForward: session.historyIndex < session.historyUrls.length - 1,
        },
      });
    } catch (err) {
      console.error("Browser interact error:", err);
      res.status(500).json({ error: "Etkileşim işlenemedi." });
    }
  });

  app.get("/api/open-site", async (req, res) => {
    const startedAt = Date.now();
    const rawUrl = String(req.query.url ?? "").trim();
    const existingSessionId = String(req.query.sessionId ?? "").trim() || undefined;
    const reqVpWidth = Number(req.query.vpWidth) || 1366;
    const reqVpHeight = Number(req.query.vpHeight) || 820;
    const includeCss = req.query.includeCss === "1";
    const matchedShortcut = findInstantPopularMatch(rawUrl);
    const targetUrl = normalizeUrlInput(rawUrl) || matchedShortcut?.url || null;

    if (!targetUrl) {
      return res.status(400).json({
        error: "Geçerli bir web adresi (ör. wikipedia.org, youtube.com, chatgpt.com) girin.",
      });
    }

    const parsedTarget = new URL(targetUrl);
    const hostLower = parsedTarget.hostname.toLowerCase();

    const isYouTube =
      hostLower === "youtube.com" ||
      hostLower === "www.youtube.com" ||
      hostLower === "m.youtube.com" ||
      hostLower === "youtu.be" ||
      hostLower === "www.youtu.be";

    // Primary path: open with hidden Edge-masked engine (in parallel with YouTube feed data if YouTube)
    const [enginePayload, ytDirect] = await Promise.all([
      openWithStealthEngine(
        targetUrl,
        startedAt,
        existingSessionId,
        reqVpWidth,
        reqVpHeight,
        includeCss
      ),
      isYouTube ? openYouTubeDirect(targetUrl, startedAt) : Promise.resolve(null),
    ]);

    if (enginePayload) {
      if (ytDirect?.youtubeData) {
        enginePayload.youtubeData = ytDirect.youtubeData;
      }
      return res.json(enginePayload);
    }

    if (ytDirect) {
      return res.json(ytDirect);
    }

    if (
      (hostLower === "chatgpt.com" ||
        hostLower === "www.chatgpt.com" ||
        hostLower === "chat.openai.com") &&
      (parsedTarget.pathname === "/" || parsedTarget.pathname === "")
    ) {
      const chatPayload = await openChatGptDirect(targetUrl, startedAt);
      if (chatPayload) {
        return res.json(chatPayload);
      }
    }

    if (hostLower === "sozluk.gov.tr" || hostLower === "www.sozluk.gov.tr") {
      const tdkPayload = await openTdkDirect(targetUrl, startedAt);
      if (tdkPayload) {
        return res.json(tdkPayload);
      }
    }

    if (hostLower === "stackoverflow.com" || hostLower === "www.stackoverflow.com") {
      const soPayload = await openStackOverflowDirect(targetUrl, startedAt);
      if (soPayload) {
        return res.json(soPayload);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: BROWSER_HEADERS,
      });

      const finalUrl = response.url || targetUrl;
      const finalParsed = new URL(finalUrl);
      if (isPrivateOrBlockedHost(finalParsed.hostname)) {
        return res.status(403).json({ error: "Bu ağ adresine erişim engellendi." });
      }

      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        const recovered = await recoverSiteWithHttpIndex(
          finalUrl,
          startedAt,
          response.status,
          `HTTP ${response.status}`
        );
        if (recovered) {
          return res.json(recovered);
        }
      }

      const html = await response.text();
      const byteSize = Buffer.byteLength(html, "utf8");
      const readerData = extractReaderDataFromHtml(html, finalUrl);
      const chromeDocument = await compileChromeDocument(html, finalUrl);

      const lowerTitle = readerData.title.toLowerCase();
      const isChallengeOrEmptySpa =
        lowerTitle.includes("just a moment") ||
        lowerTitle.includes("attention required") ||
        (readerData.blocks.length < 2 &&
          readerData.links.length < 3 &&
          (!chromeDocument || chromeDocument.bodyHtml.length < 300));

      if (isChallengeOrEmptySpa) {
        const recovered = await recoverSiteWithHttpIndex(
          finalUrl,
          startedAt,
          response.status,
          "Erişim koruması"
        );
        if (recovered) {
          return res.json(recovered);
        }
      }

      if (readerData.blocks.length < 3 && readerData.links.length > 0) {
        if (readerData.description) {
          readerData.blocks.push({ type: "paragraph", text: readerData.description });
        }
        readerData.blocks.push({
          type: "heading",
          level: 2,
          text: "Sayfadaki Öne Çıkan Bölümler",
        });
        readerData.blocks.push({
          type: "list",
          ordered: false,
          items: readerData.links.slice(0, 14).map((l) => l.text),
        });
      }

      const domain = getDomain(finalUrl);
      const payload: OpenSiteResponse = {
        requestedUrl: targetUrl,
        finalUrl,
        domain,
        title: readerData.title,
        description: readerData.description,
        favicon: readerData.favicon,
        lang: readerData.lang,
        durationMs: Date.now() - startedAt,
        byteSize,
        statusCode: response.status,
        retrievalMethod: "direct-http",
        siteSearch: getSiteSearchConfig(domain, finalParsed),
        chromeDocument,
        blocks: readerData.blocks,
        links: readerData.links,
      };

      res.json(payload);
    } catch (err) {
      const recovered = await recoverSiteWithHttpIndex(
        targetUrl,
        startedAt,
        0,
        "Doğrudan bağlantı reddedildi veya zaman aşımı"
      );
      if (recovered) {
        return res.json(recovered);
      }

      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Site yanıt süresi zaman aşımına uğradı (9 sn)."
          : "Site içeriği alınamadı. Hedef sunucu bağlantıyı kısıtlıyor olabilir.";
      res.status(502).json({
        error: message,
        requestedUrl: targetUrl,
        domain: getDomain(targetUrl),
      });
    } finally {
      clearTimeout(timer);
    }
  });

  app.get("/api/asset-proxy", async (req, res) => {
    const rawUrl = String(req.query.url ?? "").trim();
    const rawRef = String(req.query.ref ?? "").trim();
    const targetUrl = normalizeUrlInput(rawUrl);
    if (!targetUrl) {
      return res.status(400).send("Invalid URL");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const refererOrigin =
        normalizeUrlInput(rawRef)
          ? `${new URL(normalizeUrlInput(rawRef)!).origin}/`
          : `${new URL(targetUrl).origin}/`;

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": BROWSER_HEADERS["User-Agent"],
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,text/css,font/woff2,font/woff,*/*;q=0.8",
          Referer: refererOrigin,
        },
      });
      if (!response.ok) {
        return res.status(response.status).send("Upstream asset error");
      }

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";
      if (contentType.includes("text/html")) {
        return res.status(415).send("HTML blocked on asset proxy");
      }

      if (contentType.includes("text/css")) {
        const cssText = await response.text();
        const rewritten = transformCssForShadowDom(
          cssText,
          response.url || targetUrl,
          rawRef || targetUrl
        );
        res.setHeader("Content-Type", "text/css; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(rewritten);
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(502).send("Asset proxy failed");
    } finally {
      clearTimeout(timer);
    }
  });

  app.get("/api/image-proxy", async (req, res) => {
    const rawUrl = String(req.query.url ?? "").trim();
    const targetUrl = normalizeUrlInput(rawUrl);
    if (!targetUrl) {
      return res.status(400).send("Invalid URL");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": BROWSER_HEADERS["User-Agent"],
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });
      if (!response.ok) {
        return res.status(response.status).send("Upstream image error");
      }
      const contentType = response.headers.get("content-type") ?? "image/jpeg";
      if (!contentType.startsWith("image/")) {
        return res.status(415).send("Not an image");
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch {
      res.status(502).send("Image proxy failed");
    } finally {
      clearTimeout(timer);
    }
  });

  app.get("/api/popular-sites", (_req, res) => {
    res.json({ sites: POPULAR_SITES });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AlgoFind web server running on http://0.0.0.0:${PORT}`);
    // Pre-warm stealth web engine quietly in background for instant first-tab open
    void getSharedEngineBrowser().catch(() => {});
  });
}

startServer();
