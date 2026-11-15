import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Clock,
  Compass,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Plus,
  Search,
  X,
  Zap,
} from 'lucide-react';
import type {
  ImageSearchResponse,
  OpenSiteResponse,
  PopularSiteShortcut,
  SearchMode,
  SearchResponse,
  SearchTab,
} from './types';
import { WebResultsView } from './components/WebResultsView';
import { ImageSearchView } from './components/ImageSearchView';
import { SiteOpenerView } from './components/SiteOpenerView';
import type { BrowserInteractResponse } from './components/EdgeLiveViewport';

const HISTORY_STORAGE_KEY = 'algofind_recent_queries_v1';

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  sessionId?: string;
  siteData: OpenSiteResponse | null;
  loading: boolean;
  error: string | null;
  history: string[];
  historyIndex: number;
}

function detectDirectUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/.*)?$/.test(trimmed)
      ? `https://${trimmed}`
      : null;
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.hostname.includes('.') ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function getDomainLabel(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./, '');
  } catch {
    return urlStr;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<SearchTab>('web');
  const [searchMode, setSearchMode] = useState<SearchMode>('research');
  const [queryInput, setQueryInput] = useState('');
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const [directRedirectMode, setDirectRedirectMode] = useState(false);

  const [popularSites, setPopularSites] = useState<PopularSiteShortcut[]>([]);
  const [recentQueries, setRecentQueries] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Web search state
  const [webData, setWebData] = useState<SearchResponse | null>(null);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  // Image search state
  const [imageData, setImageData] = useState<ImageSearchResponse | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Chrome-style multi-tab site browser state
  const [browserTabs, setBrowserTabs] = useState<BrowserTab[]>([]);
  const [activeBrowserTabId, setActiveBrowserTabId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const typedUrl = useMemo(() => detectDirectUrl(queryInput), [queryInput]);
  const currentBrowserTab = useMemo(
    () => browserTabs.find((t) => t.id === activeBrowserTabId) ?? null,
    [browserTabs, activeBrowserTabId]
  );

  useEffect(() => {
    fetch('/api/popular-sites')
      .then((r) => r.json())
      .then((d: { sites?: PopularSiteShortcut[] }) => {
        if (Array.isArray(d.sites)) setPopularSites(d.sites);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const saveRecentQuery = (q: string) => {
    const cleaned = q.trim();
    if (!cleaned) return;
    setRecentQueries((prev) => {
      const next = [cleaned, ...prev.filter((item) => item.toLowerCase() !== cleaned.toLowerCase())].slice(0, 6);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const clearRecentQueries = () => {
    setRecentQueries([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const updateTabById = (tabId: string, updater: (prev: BrowserTab) => BrowserTab) => {
    setBrowserTabs((prev) => prev.map((t) => (t.id === tabId ? updater(t) : t)));
  };

  const loadSiteInOpener = async (
    rawUrl: string,
    options?: { targetTabId?: string; pushHistory?: boolean; createNewTab?: boolean }
  ) => {
    const normalized = detectDirectUrl(rawUrl) || rawUrl.trim();
    if (!normalized) return;

    const pushHistory = options?.pushHistory ?? true;
    let tabId = options?.targetTabId;
    let existingSessionId = '';

    if (!tabId) {
      if (!options?.createNewTab && activeTab === 'opener' && activeBrowserTabId) {
        tabId = activeBrowserTabId;
        existingSessionId =
          browserTabs.find((t) => t.id === tabId)?.sessionId ?? '';
      } else {
        const existingSameUrl = browserTabs.find(
          (t) => t.url === normalized || t.siteData?.finalUrl === normalized
        );
        if (existingSameUrl && !options?.createNewTab) {
          setActiveTab('opener');
          setActiveBrowserTabId(existingSameUrl.id);
          return;
        }
        tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newTab: BrowserTab = {
          id: tabId,
          url: normalized,
          title: getDomainLabel(normalized),
          siteData: null,
          loading: true,
          error: null,
          history: [normalized],
          historyIndex: 0,
        };
        setBrowserTabs((prev) => [...prev.slice(-5), newTab]);
      }
    }

    const resolvedTabId = tabId;
    if (!existingSessionId) {
      existingSessionId =
        browserTabs.find((t) => t.id === resolvedTabId)?.sessionId ?? '';
    }

    setActiveBrowserTabId(resolvedTabId);
    setActiveTab('opener');

    updateTabById(resolvedTabId, (t) => {
      let nextHistory = t.history;
      let nextIdx = t.historyIndex;
      if (pushHistory) {
        const sliced = t.history.slice(0, t.historyIndex + 1);
        if (sliced[sliced.length - 1] !== normalized) {
          sliced.push(normalized);
        }
        nextHistory = sliced;
        nextIdx = sliced.length - 1;
      }
      return {
        ...t,
        url: normalized,
        title: t.siteData?.title || getDomainLabel(normalized),
        loading: true,
        error: null,
        history: nextHistory,
        historyIndex: nextIdx,
      };
    });

    const vpW = Math.max(360, Math.min(1920, window.innerWidth));
    const vpH = Math.max(480, Math.min(1200, window.innerHeight - 84));

    try {
      const sessionParam = existingSessionId
        ? `&sessionId=${encodeURIComponent(existingSessionId)}`
        : '';
      const res = await fetch(
        `/api/open-site?url=${encodeURIComponent(normalized)}&vpWidth=${vpW}&vpHeight=${vpH}${sessionParam}`
      );
      const json = (await res.json()) as OpenSiteResponse & { error?: string };
      if (!res.ok) {
        updateTabById(resolvedTabId, (t) => ({
          ...t,
          siteData: null,
          loading: false,
          error: json.error || 'Site açılamadı.',
        }));
      } else {
        updateTabById(resolvedTabId, (t) => ({
          ...t,
          url: json.finalUrl || normalized,
          title: json.title || json.domain,
          favicon: json.favicon || t.favicon,
          sessionId: json.liveViewport?.sessionId || t.sessionId,
          siteData: json,
          loading: false,
          error: null,
        }));
      }
    } catch {
      updateTabById(resolvedTabId, (t) => ({
        ...t,
        siteData: null,
        loading: false,
        error: 'Bağlantı sırasında beklenmeyen bir ağ hatası oluştu.',
      }));
    }
  };

  const handleOpenBlankBrowserTab = () => {
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const blankTab: BrowserTab = {
      id: tabId,
      url: '',
      title: 'Yeni Sekme',
      siteData: null,
      loading: false,
      error: null,
      history: [],
      historyIndex: -1,
    };
    setBrowserTabs((prev) => [...prev.slice(-5), blankTab]);
    setActiveBrowserTabId(tabId);
    setActiveTab('opener');
  };

  const handleCloseBrowserTab = (tabId: string) => {
    setBrowserTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      const next = prev.filter((t) => t.id !== tabId);
      if (activeBrowserTabId === tabId) {
        if (next.length > 0) {
          const fallback = next[Math.min(idx, next.length - 1)];
          setActiveBrowserTabId(fallback.id);
        } else {
          setActiveBrowserTabId(null);
          setActiveTab('web');
        }
      }
      return next;
    });
  };

  const handleViewportUpdate = (update: BrowserInteractResponse) => {
    if (!activeBrowserTabId) return;
    updateTabById(activeBrowserTabId, (t) => ({
      ...t,
      url: update.finalUrl || t.url,
      title: update.title || t.title,
      sessionId: update.sessionId,
      siteData: t.siteData
        ? {
            ...t.siteData,
            finalUrl: update.finalUrl || t.siteData.finalUrl,
            domain: update.domain || t.siteData.domain,
            title: update.title || t.siteData.title,
            liveViewport: update.liveViewport
              ? {
                  ...update.liveViewport,
                  frameDataUrl:
                    update.liveViewport.frameDataUrl ||
                    t.siteData.liveViewport?.frameDataUrl ||
                    '',
                }
              : t.siteData.liveViewport,
          }
        : t.siteData,
    }));
  };

  const runWebSearch = async (query: string, modeOverride?: SearchMode) => {
    const q = query.trim();
    if (!q) return;
    const effectiveMode = modeOverride ?? searchMode;

    saveRecentQuery(q);
    setLastSearchedQuery(q);
    setQueryInput(q);
    setActiveTab('web');
    setSearchMode(effectiveMode);
    setWebLoading(true);
    setWebError(null);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, mode: effectiveMode }),
      });
      const json = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) {
        setWebError(json.error || 'Arama gerçekleştirilemedi.');
        setWebData(null);
      } else {
        setWebData(json);
        if (directRedirectMode && json.directMatch?.url) {
          void loadSiteInOpener(json.directMatch.url, { createNewTab: true });
        }
      }
    } catch {
      setWebError('Arama servisine bağlanılamadı.');
      setWebData(null);
    } finally {
      setWebLoading(false);
    }
  };

  const runImageSearch = async (query: string) => {
    const q = query.trim();
    if (!q) return;

    saveRecentQuery(q);
    setLastSearchedQuery(q);
    setActiveTab('images');
    setImageLoading(true);
    setImageError(null);

    try {
      const res = await fetch('/api/search-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const json = (await res.json()) as ImageSearchResponse & { error?: string };
      if (!res.ok) {
        setImageError(json.error || 'Fotoğraf araması başarısız oldu.');
        setImageData(null);
      } else {
        setImageData(json);
      }
    } catch {
      setImageError('Fotoğraf arama servisine erişilemedi.');
      setImageData(null);
    } finally {
      setImageLoading(false);
    }
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = queryInput.trim();
    if (!q) return;

    if (typedUrl) {
      void loadSiteInOpener(typedUrl, { createNewTab: true });
      return;
    }

    if (activeTab === 'images') {
      void runImageSearch(q);
      return;
    }

    void runWebSearch(q);
  };

  const handleTabSwitch = (nextTab: SearchTab) => {
    if (nextTab === 'opener') {
      if (browserTabs.length === 0) {
        handleOpenBlankBrowserTab();
      } else {
        if (!activeBrowserTabId) setActiveBrowserTabId(browserTabs[0].id);
        setActiveTab('opener');
      }
      return;
    }

    setActiveTab(nextTab);
    const activeQuery = queryInput.trim() || lastSearchedQuery;
    if (nextTab === 'images' && activeQuery && (!imageData || imageData.query !== activeQuery)) {
      void runImageSearch(activeQuery);
    } else if (nextTab === 'web' && activeQuery && (!webData || webData.query !== activeQuery)) {
      void runWebSearch(activeQuery);
    }
  };

  const handleModeSwitch = (nextMode: SearchMode) => {
    setSearchMode(nextMode);
    setActiveTab('web');
    const activeQuery = queryInput.trim() || lastSearchedQuery;
    if (activeQuery && (webData?.query === activeQuery ? webData.mode !== nextMode : true)) {
      void runWebSearch(activeQuery, nextMode);
    }
  };

  const handleResetHome = () => {
    setActiveTab('web');
    setQueryInput('');
    setLastSearchedQuery('');
    setWebData(null);
    setWebError(null);
    setImageData(null);
    setImageError(null);
    window.setTimeout(() => searchInputRef.current?.focus(), 40);
  };

  const handleOpenerBack = () => {
    if (!currentBrowserTab || currentBrowserTab.historyIndex <= 0) return;
    const nextIdx = currentBrowserTab.historyIndex - 1;
    const targetUrl = currentBrowserTab.history[nextIdx];
    updateTabById(currentBrowserTab.id, (t) => ({ ...t, historyIndex: nextIdx }));
    void loadSiteInOpener(targetUrl, {
      targetTabId: currentBrowserTab.id,
      pushHistory: false,
    });
  };

  const handleOpenerForward = () => {
    if (
      !currentBrowserTab ||
      currentBrowserTab.historyIndex >= currentBrowserTab.history.length - 1
    ) {
      return;
    }
    const nextIdx = currentBrowserTab.historyIndex + 1;
    const targetUrl = currentBrowserTab.history[nextIdx];
    updateTabById(currentBrowserTab.id, (t) => ({ ...t, historyIndex: nextIdx }));
    void loadSiteInOpener(targetUrl, {
      targetTabId: currentBrowserTab.id,
      pushHistory: false,
    });
  };

  const isHomeState =
    activeTab === 'web' && !webData && !webLoading && !webError;
  const isBrowserFullScreen = activeTab === 'opener';

  return (
    <div
      className={
        isBrowserFullScreen
          ? 'h-screen w-screen overflow-hidden flex flex-col bg-[#DEE1E6] text-[#0F172A]'
          : 'min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]'
      }
    >
      {/* Chrome-Style Top Tab Strip */}
      <div className="h-10 px-2 pt-1.5 flex items-end gap-1 bg-[#DEE1E6] border-b border-slate-300/80 overflow-x-auto shrink-0 select-none">
        {/* Pinned Search / Home Tab (AlgOFind) */}
        <button
          type="button"
          onClick={() => setActiveTab('web')}
          className={`h-8.5 px-3.5 rounded-t-lg inline-flex items-center gap-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            !isBrowserFullScreen
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-700 hover:bg-white/55'
          }`}
        >
          <img
            src="/assets/aistudio/image_062eca8b.png"
            alt=""
            className="h-4 w-auto object-contain"
          />
          <span>AlgOFind Arama</span>
        </button>

        {/* Open Site Tabs */}
        {browserTabs.map((tab) => {
          const isActive = isBrowserFullScreen && tab.id === activeBrowserTabId;
          return (
            <div
              key={tab.id}
              onClick={() => {
                setActiveBrowserTabId(tab.id);
                setActiveTab('opener');
              }}
              role="tab"
              aria-selected={isActive}
              className={`group h-8.5 pl-3 pr-1.5 max-w-[210px] min-w-[120px] rounded-t-lg inline-flex items-center justify-between gap-2 text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-700 hover:bg-white/55'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {tab.loading ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin shrink-0" />
                ) : tab.favicon ? (
                  <img
                    src={tab.favicon}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                    className="w-3.5 h-3.5 rounded-xs object-contain shrink-0"
                  />
                ) : (
                  <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                )}
                <span className="truncate">{tab.title}</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseBrowserTab(tab.id);
                }}
                aria-label={`${tab.title} sekmesini kapat`}
                className="h-5 w-5 rounded-full inline-flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-900 shrink-0 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}

        {/* Chrome '+' New Tab Button */}
        <button
          type="button"
          onClick={handleOpenBlankBrowserTab}
          title="Yeni tarayıcı sekmesi aç"
          aria-label="Yeni sekme"
          className="h-7.5 w-7.5 mb-0.5 ml-0.5 rounded-full inline-flex items-center justify-center text-slate-700 hover:bg-white/70 transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Editorial Navigation Bar (Shown only on Search / Images / Popular tabs, hidden on Full-Screen Browser tabs) */}
      {!isBrowserFullScreen && (
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
            <button
              type="button"
              onClick={handleResetHome}
              aria-label="AlgOFind Ana Sayfa"
              className="inline-flex items-center whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
            >
              <img
                src="/assets/aistudio/image_062eca8b.png"
                alt="AlgOFind"
                className="h-8 sm:h-9 w-auto object-contain"
              />
            </button>

            <nav
              aria-label="Ana gezinme"
              className="hidden md:flex items-center gap-7 text-sm font-medium"
            >
              <button
                type="button"
                onClick={() => handleTabSwitch('web')}
                className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'web'
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Ana Merkez
              </button>
              <button
                type="button"
                onClick={() => handleTabSwitch('images')}
                className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'images'
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Fotoğraf Arama
              </button>
              <button
                type="button"
                onClick={() => handleTabSwitch('popular')}
                className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'popular'
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Popüler Siteler
              </button>
            </nav>

            <div className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (typedUrl) {
                    void loadSiteInOpener(typedUrl, { createNewTab: true });
                  } else {
                    handleTabSwitch('opener');
                  }
                }}
                className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Tarayıcı Sekmesi Aç
              </button>
            </div>
          </div>

          <div className="md:hidden bg-white border-t border-slate-100 px-4 py-1.5 flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: 'web', label: 'Web' },
                { id: 'images', label: 'Fotoğraflar' },
                { id: 'popular', label: 'Popüler Siteler' },
                { id: 'opener', label: 'Tarayıcı' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabSwitch(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>
      )}

      {/* Main Content */}
      <main className={isBrowserFullScreen ? 'flex-1 w-full min-h-0 flex flex-col' : 'flex-1'}>
        {!isBrowserFullScreen && (
          <section
            className={
              isHomeState
                ? 'mx-auto max-w-4xl px-4 sm:px-6 pt-12 pb-10'
                : 'bg-white border-b border-slate-200 py-5'
            }
          >
            <div className={isHomeState ? '' : 'mx-auto max-w-5xl px-4 sm:px-6'}>
              {isHomeState && (
                <div className="text-center max-w-2xl mx-auto mb-8">
                  <img
                    src="/assets/aistudio/image_062eca8b.png"
                    alt="AlgOFind"
                    className="h-20 sm:h-24 w-auto mx-auto mb-5 object-contain mix-blend-multiply"
                  />
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-3 text-balance">
                    Açık internette araştırın, siteleri tam ekran açın.
                  </h1>
                  <p className="text-base text-slate-600 leading-relaxed">
                    AlgOFind, açık interneti tarayıp kaynaklardan araştırma özeti çıkarır ve
                    istediğiniz web sitelerini tam ekran sekme deneyimiyle doğrudan açar.
                  </p>
                </div>
              )}

              <form onSubmit={handleSearchSubmit} className="space-y-3">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1 flex items-center bg-white border border-slate-300 focus-within:border-blue-600 focus-within:ring-3 focus-within:ring-blue-600/15 rounded-xl px-4 h-14 shadow-xs transition-all">
                    <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      placeholder="Açık internette araştırın veya site adresi yazın (github.com, youtube.com, chatgpt.com)..."
                      aria-label="Arama veya site adresi"
                      className="w-full bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    {queryInput && (
                      <button
                        type="button"
                        onClick={() => setQueryInput('')}
                        aria-label="Temizle"
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="h-14 px-7 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {typedUrl
                      ? 'Tam Ekran Aç'
                      : activeTab === 'images'
                        ? 'Fotoğraf Ara'
                        : searchMode === 'research'
                          ? 'Araştır ve Bul'
                          : 'AlgoFind ile Ara'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('research')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeTab === 'web' && searchMode === 'research'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      Açık İnternet Araştırması
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeSwitch('popular')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeTab === 'web' && searchMode === 'popular'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Compass className="w-3.5 h-3.5" />
                      Popüler Arama
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTabSwitch('images')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        activeTab === 'images'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Fotoğraflar
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDirectRedirectMode((prev) => !prev)}
                    aria-pressed={directRedirectMode}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      directRedirectMode
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>
                      Direkt Siteye Yönlendirme: {directRedirectMode ? 'Açık' : 'Kapalı'}
                    </span>
                  </button>
                </div>

                {typedUrl && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white border border-blue-200 rounded-xl">
                    <div className="text-sm text-slate-700">
                      Doğrudan site adresi algılandı:{' '}
                      <span className="font-mono font-medium text-slate-900">{typedUrl}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void loadSiteInOpener(typedUrl, { createNewTab: true })}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Sekmede Tam Ekran Aç</span>
                      </button>
                      <a
                        href={typedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium transition-colors whitespace-nowrap"
                      >
                        <span>Dış Sekmede Git</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}
              </form>

              {isHomeState && (
                <div className="mt-8 space-y-8">
                  {recentQueries.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Son Aramalar</span>
                        </div>
                        <button
                          type="button"
                          onClick={clearRecentQueries}
                          className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                        >
                          Temizle
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {recentQueries.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => {
                              setQueryInput(q);
                              void runWebSearch(q);
                            }}
                            className="px-3.5 py-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-3">
                      Doğrudan Sekmede Aç veya Hızlı Ara
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'youtube.com', type: 'site' as const, url: 'https://www.youtube.com' },
                        { label: 'chatgpt.com', type: 'site' as const, url: 'https://chatgpt.com' },
                        { label: 'github.com', type: 'site' as const, url: 'https://github.com' },
                        { label: 'tr.wikipedia.org', type: 'site' as const, url: 'https://tr.wikipedia.org/wiki/T%C3%BCrkiye' },
                        { label: 'bbc.com/turkce', type: 'site' as const, url: 'https://www.bbc.com/turkce' },
                        { label: 'Kuantum bilgisayar nasıl çalışır', type: 'web' as const, url: '' },
                        { label: 'İstanbul Boğazı fotoğrafları', type: 'images' as const, url: '' },
                      ].map((sample) => (
                        <button
                          key={sample.label}
                          type="button"
                          onClick={() => {
                            if (sample.type === 'site') {
                              void loadSiteInOpener(sample.url, { createNewTab: true });
                            } else if (sample.type === 'images') {
                              setQueryInput(sample.label);
                              void runImageSearch(sample.label);
                            } else {
                              setQueryInput(sample.label);
                              void runWebSearch(sample.label, 'research');
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-xs font-medium text-slate-800 transition-colors cursor-pointer"
                        >
                          {sample.type === 'site' ? (
                            <Globe className="w-3.5 h-3.5 text-blue-600" />
                          ) : sample.type === 'images' ? (
                            <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                          )}
                          <span>{sample.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'web' && !isHomeState && (
          <WebResultsView
            data={webData}
            loading={webLoading}
            error={webError}
            onOpenSite={(url) => void loadSiteInOpener(url, { createNewTab: true })}
            onSwitchToImages={() => handleTabSwitch('images')}
            onSearchTopic={(topic) => {
              setQueryInput(topic);
              void runWebSearch(topic, 'research');
            }}
          />
        )}

        {activeTab === 'images' && (
          <ImageSearchView
            data={imageData}
            loading={imageLoading}
            error={imageError}
            query={queryInput}
            onOpenSite={(url) => void loadSiteInOpener(url, { createNewTab: true })}
          />
        )}

        {isBrowserFullScreen && (
          <SiteOpenerView
            siteData={currentBrowserTab?.siteData ?? null}
            loading={currentBrowserTab?.loading ?? false}
            error={currentBrowserTab?.error ?? null}
            currentUrl={currentBrowserTab?.url ?? ''}
            canGoBack={(currentBrowserTab?.historyIndex ?? 0) > 0}
            canGoForward={
              currentBrowserTab
                ? currentBrowserTab.historyIndex < currentBrowserTab.history.length - 1
                : false
            }
            onNavigate={(url) => {
              if (currentBrowserTab) {
                void loadSiteInOpener(url, { targetTabId: currentBrowserTab.id });
              } else {
                void loadSiteInOpener(url, { createNewTab: true });
              }
            }}
            onBack={handleOpenerBack}
            onForward={handleOpenerForward}
            onReload={() => {
              if (currentBrowserTab?.url) {
                void loadSiteInOpener(currentBrowserTab.url, {
                  targetTabId: currentBrowserTab.id,
                  pushHistory: false,
                });
              }
            }}
            onGoHome={() => setActiveTab('web')}
            onSearchFromOmnibox={(q) => void runWebSearch(q)}
            onViewportUpdate={handleViewportUpdate}
          />
        )}

        {(isHomeState || activeTab === 'popular') && (
          <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
            <div className="flex flex-wrap items-baseline justify-between gap-4 pb-4 mb-6 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Popüler Siteler — Tek Tıkla Tam Ekran Aç
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  AlgOFind tarayıcı sekmelerinde tam ekran açabileceğiniz popüler kaynaklar
                </p>
              </div>
              <span className="text-xs text-slate-500 tabular-nums">
                {popularSites.length} popüler site
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {popularSites.map((site) => (
                <div
                  key={site.domain}
                  className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                      <span className="font-mono truncate">{site.domain}</span>
                      <span className="shrink-0">{site.category}</span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-1">
                      <button
                        type="button"
                        onClick={() => void loadSiteInOpener(site.url, { createNewTab: true })}
                        className="text-left hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        {site.name}
                      </button>
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {site.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-2 border-t border-slate-100 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => void loadSiteInOpener(site.url, { createNewTab: true })}
                      className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Sekmede Aç</span>
                    </button>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 ml-auto"
                    >
                      <span>Direkt Git</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {!isBrowserFullScreen && (
        <footer className="border-t border-slate-200 bg-white mt-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <span>AlgOFind · Tam ekran sekmeli hızlı arama ve yerleşik web tarayıcı</span>
            <span>Popülerlik odaklı sıralama · Gizli Edge uyumlu motor</span>
          </div>
        </footer>
      )}
    </div>
  );
}
