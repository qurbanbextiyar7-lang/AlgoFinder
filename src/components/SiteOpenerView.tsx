import { useState, useEffect, FormEvent, MouseEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  RotateCw,
  Lock,
  AlertCircle,
  Play,
  Search,
  Layout,
  FileText,
  Link2,
  Monitor,
  Home,
  X,
} from 'lucide-react';
import type { OpenSiteResponse } from '../types';
import { ResilientImage } from './ResilientImage';
import { ChromeHttpCanvas } from './ChromeHttpCanvas';
import { EdgeLiveViewport, type BrowserInteractResponse } from './EdgeLiveViewport';

interface SiteOpenerViewProps {
  siteData: OpenSiteResponse | null;
  loading: boolean;
  error: string | null;
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (url: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onGoHome: () => void;
  onSearchFromOmnibox?: (query: string) => void;
  onViewportUpdate?: (update: BrowserInteractResponse) => void;
}

type OpenerRenderMode = 'live' | 'youtube' | 'chrome' | 'reader';

function looksLikeDirectUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/.*)?$/.test(trimmed);
}

export function SiteOpenerView({
  siteData,
  loading,
  error,
  currentUrl,
  canGoBack,
  canGoForward,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onGoHome,
  onSearchFromOmnibox,
  onViewportUpdate,
}: SiteOpenerViewProps) {
  const [addressInput, setAddressInput] = useState(currentUrl);
  const [ytSearchInput, setYtSearchInput] = useState('');
  const [siteSearchInput, setSiteSearchInput] = useState('');
  const [showYouTubePlayer, setShowYouTubePlayer] = useState(false);
  const [renderMode, setRenderMode] = useState<OpenerRenderMode>('live');
  const [showLinksDrawer, setShowLinksDrawer] = useState(false);
  const [navBusy, setNavBusy] = useState(false);

  useEffect(() => {
    setAddressInput(siteData?.finalUrl || currentUrl);
    if (siteData?.youtubeData?.searchQuery) {
      setYtSearchInput(siteData.youtubeData.searchQuery);
    }
    if (siteData?.siteSearch?.currentQuery) {
      setSiteSearchInput(siteData.siteSearch.currentQuery);
    } else {
      setSiteSearchInput('');
    }
    setShowYouTubePlayer(false);
    setShowLinksDrawer(false);
  }, [
    currentUrl,
    siteData?.finalUrl,
    siteData?.youtubeData?.searchQuery,
    siteData?.siteSearch?.currentQuery,
  ]);

  useEffect(() => {
    if (!siteData) return;
    if (siteData.youtubeData) {
      setRenderMode('youtube');
    } else if (siteData.liveViewport) {
      setRenderMode('live');
    } else if (siteData.chromeDocument) {
      setRenderMode('chrome');
    } else {
      setRenderMode('reader');
    }
  }, [
    siteData?.requestedUrl,
    Boolean(siteData?.youtubeData),
    Boolean(siteData?.liveViewport),
    Boolean(siteData?.chromeDocument),
  ]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = addressInput.trim();
    if (!cleaned) return;
    if (looksLikeDirectUrl(cleaned) || !onSearchFromOmnibox) {
      onNavigate(cleaned);
    } else {
      onSearchFromOmnibox(cleaned);
    }
  };

  const handleYouTubeSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = ytSearchInput.trim();
    if (!q) return;
    onNavigate(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
  };

  const handleInSiteSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = siteSearchInput.trim();
    if (!q || !siteData?.siteSearch) return;
    const target = siteData.siteSearch.urlTemplate.replace('{q}', encodeURIComponent(q));
    onNavigate(target);
  };

  const handleContentClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest('a[data-algofind-link="true"]') as HTMLAnchorElement | null;
    if (anchor?.href) {
      e.preventDefault();
      onNavigate(anchor.href);
    }
  };

  const runSessionNav = async (action: 'back' | 'forward' | 'reload'): Promise<boolean> => {
    const sessionId = siteData?.liveViewport?.sessionId;
    if (!sessionId) return false;
    setNavBusy(true);
    try {
      const res = await fetch('/api/browser/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action }),
      });
      if (res.status === 404 || res.status === 410) {
        return false;
      }
      if (!res.ok) return false;
      const updated = (await res.json()) as BrowserInteractResponse;
      if (updated.finalUrl) setAddressInput(updated.finalUrl);
      onViewportUpdate?.(updated);
      return true;
    } catch {
      return false;
    } finally {
      setNavBusy(false);
    }
  };

  const handleToolbarBack = async () => {
    if (renderMode === 'live' && siteData?.liveViewport?.canGoBack) {
      const ok = await runSessionNav('back');
      if (ok) return;
    }
    onBack();
  };

  const handleToolbarForward = async () => {
    if (renderMode === 'live' && siteData?.liveViewport?.canGoForward) {
      const ok = await runSessionNav('forward');
      if (ok) return;
    }
    onForward();
  };

  const handleToolbarReload = async () => {
    if (renderMode === 'live' && siteData?.liveViewport?.sessionId) {
      const ok = await runSessionNav('reload');
      if (ok) return;
    }
    onReload();
  };

  const activeUrl = siteData?.finalUrl || currentUrl;
  const hasLiveViewport = Boolean(siteData?.liveViewport);
  const hasChromeDoc = Boolean(siteData?.chromeDocument);
  const effectiveCanGoBack =
    renderMode === 'live'
      ? Boolean(siteData?.liveViewport?.canGoBack || canGoBack)
      : canGoBack;
  const effectiveCanGoForward =
    renderMode === 'live'
      ? Boolean(siteData?.liveViewport?.canGoForward || canGoForward)
      : canGoForward;
  const isBusy = loading || navBusy;

  return (
    <section className="flex-1 w-full flex flex-col bg-white min-h-0">
      {/* Chrome-Style Single-Row Omnibox & Navigation Toolbar */}
      <div className="flex items-center gap-2 px-2.5 sm:px-3 h-11 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleToolbarBack()}
            disabled={!effectiveCanGoBack || isBusy}
            aria-label="Geri"
            title="Geri"
            className="h-8 w-8 inline-flex items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleToolbarForward()}
            disabled={!effectiveCanGoForward || isBusy}
            aria-label="İleri"
            title="İleri"
            className="h-8 w-8 inline-flex items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleToolbarReload()}
            disabled={!activeUrl || isBusy}
            aria-label="Yenile"
            title="Yenile"
            className="h-8 w-8 inline-flex items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onGoHome}
            aria-label="AlgOFind Ana Sayfa"
            title="AlgOFind Arama / Ana Sayfa"
            className="h-8 w-8 inline-flex items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Chrome Pill Omnibox */}
        <form onSubmit={handleSubmit} className="flex-1 min-w-0 flex items-center">
          <div className="relative w-full flex items-center bg-[#F1F3F4] hover:bg-[#E8EAED] focus-within:bg-white border border-transparent focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 rounded-full px-3.5 h-8 transition-all">
            <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0 mr-2" />
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="AlgOFind ile arayın veya bir web adresi yazın..."
              aria-label="Adres ve arama çubuğu"
              className="w-full bg-transparent text-[13px] text-slate-900 placeholder:text-slate-500 focus:outline-none truncate"
            />
          </div>
        </form>

        {/* Compact Mode Controls & External Open */}
        <div className="flex items-center gap-1.5 shrink-0">
          {siteData && (siteData.youtubeData || hasLiveViewport || hasChromeDoc) && (
            <div className="hidden md:inline-flex items-center p-0.5 bg-[#F1F3F4] rounded-lg">
              {siteData.youtubeData && (
                <button
                  type="button"
                  onClick={() => setRenderMode('youtube')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    renderMode === 'youtube'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Play className="w-3 h-3" />
                  <span>Video</span>
                </button>
              )}
              {hasLiveViewport && (
                <button
                  type="button"
                  onClick={() => setRenderMode('live')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    renderMode === 'live'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Monitor className="w-3 h-3" />
                  <span>Canlı</span>
                </button>
              )}
              {hasChromeDoc && (
                <button
                  type="button"
                  onClick={() => setRenderMode('chrome')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    renderMode === 'chrome'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layout className="w-3 h-3" />
                  <span>CSS</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setRenderMode('reader')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  renderMode === 'reader'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>Okuyucu</span>
              </button>
            </div>
          )}

          {siteData && renderMode !== 'youtube' && siteData.links.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLinksDrawer((prev) => !prev)}
              title="Sayfadaki bağlantılar"
              className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                showLinksDrawer
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline tabular-nums">{siteData.links.length}</span>
            </button>
          )}

          {activeUrl && (
            <a
              href={activeUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Dış tarayıcıda yeni sekmede aç"
              className="h-8 w-8 inline-flex items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Empty Initial State (Chrome New Tab style quick grid) */}
      {!activeUrl && !loading && !error && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center bg-white">
          <img
            src="/assets/aistudio/image_062eca8b.png"
            alt="AlgOFind"
            className="h-16 w-auto mb-5 object-contain"
          />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            Yeni Sekme — AlgOFind Tarayıcı
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mb-7">
            Yukarıdaki adres çubuğuna bir web sitesi yazın veya aşağıdaki popüler sitelerden birini
            tam ekran açın.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
            {[
              'https://tr.wikipedia.org/wiki/Türkiye',
              'https://github.com',
              'https://www.youtube.com',
              'https://chatgpt.com',
              'https://openai.com',
              'https://www.bbc.com/turkce',
              'https://news.ycombinator.com',
              'https://developer.mozilla.org/en-US/',
              'https://stackoverflow.com',
              'https://sozluk.gov.tr',
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => onNavigate(sample)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {sample.replace(/^https?:\/\/(www\.)?/, '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full-Width Chrome Loading Skeleton */}
      {loading && (
        <div className="flex-1 w-full bg-white flex flex-col" aria-busy="true">
          <div className="h-0.5 w-full bg-blue-100 overflow-hidden">
            <div className="h-full w-1/3 bg-blue-600 animate-pulse" />
          </div>
          <div className="p-8 max-w-4xl space-y-5">
            <div className="h-4 w-56 bg-slate-200 rounded animate-pulse" />
            <div className="h-8 w-3/4 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
            <div className="h-4 w-11/12 bg-slate-100 rounded animate-pulse" />
            <div className="h-72 w-full bg-slate-100 rounded-xl animate-pulse" />
          </div>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-14 text-center bg-white">
          <div className="w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Sayfa Açılamadı</h3>
          <p className="text-sm text-slate-600 mb-6 max-w-md">{error}</p>
          {activeUrl && (
            <a
              href={activeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <span>Siteye Direkt Yönlen</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      )}

      {/* Full-Screen Populated Page Area */}
      {!loading && !error && siteData && (
        <div className="flex-1 w-full min-h-0 flex flex-col">
          {siteData.notice && (
            <div className="px-4 py-1.5 border-b border-slate-200 bg-slate-50 text-xs text-slate-600 shrink-0">
              {siteData.notice}
            </div>
          )}

          {renderMode === 'youtube' && siteData.youtubeData ? (
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 bg-white">
              <div className="max-w-7xl mx-auto space-y-6">
                <form
                  onSubmit={handleYouTubeSearch}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pb-5 border-b border-slate-200"
                >
                  <div className="flex items-center gap-2 pr-2 shrink-0">
                    <span className="inline-flex items-center justify-center w-8 h-6 rounded-md bg-red-600 text-white">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </span>
                    <span className="text-base font-bold tracking-tight text-slate-900">
                      YouTube
                    </span>
                  </div>
                  <div className="flex items-center flex-1 bg-slate-50 border border-slate-300 focus-within:border-blue-600 focus-within:bg-white rounded-full px-4 h-10 transition-colors">
                    <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
                    <input
                      type="text"
                      value={ytSearchInput}
                      onChange={(e) => setYtSearchInput(e.target.value)}
                      placeholder="YouTube içinde video veya kanal arayın..."
                      aria-label="YouTube video ara"
                      className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-10 px-5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    YouTube’da Ara
                  </button>
                </form>

                {siteData.youtubeData.mode === 'watch' && siteData.youtubeData.activeVideo ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-8 space-y-4">
                      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950 border border-slate-200">
                        {showYouTubePlayer ? (
                          <iframe
                            src={siteData.youtubeData.activeVideo.embedUrl}
                            title={siteData.youtubeData.activeVideo.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full border-0"
                          />
                        ) : (
                          <>
                            <ResilientImage
                              src={siteData.youtubeData.activeVideo.thumbnailUrl}
                              alt={siteData.youtubeData.activeVideo.title}
                              className="w-full h-full object-cover opacity-90"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent flex flex-col items-center justify-center gap-3 p-4">
                              <button
                                type="button"
                                onClick={() => setShowYouTubePlayer(true)}
                                className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-sm font-semibold shadow-lg transition-colors cursor-pointer"
                              >
                                <Play className="w-4 h-4 fill-current" />
                                <span>Videoyu Oynat</span>
                              </button>
                              <a
                                href={siteData.finalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-white/85 hover:text-white underline underline-offset-2"
                              >
                                veya YouTube’da Yeni Sekmede Aç
                              </a>
                            </div>
                          </>
                        )}
                      </div>

                      <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug mb-2">
                          {siteData.youtubeData.activeVideo.title}
                        </h1>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mb-4">
                          <span className="font-semibold text-slate-900">
                            {siteData.youtubeData.activeVideo.channel}
                          </span>
                          {siteData.youtubeData.activeVideo.views && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {siteData.youtubeData.activeVideo.views}
                              </span>
                            </>
                          )}
                        </div>
                        {siteData.youtubeData.activeVideo.description && (
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-60 overflow-y-auto">
                            {siteData.youtubeData.activeVideo.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <aside className="lg:col-span-4 space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Sıradaki Videolar
                      </h3>
                      <div className="space-y-3">
                        {siteData.youtubeData.videos.slice(0, 10).map((video) => (
                          <button
                            key={video.videoId}
                            type="button"
                            onClick={() => onNavigate(video.url)}
                            className="w-full flex items-start gap-3 text-left group cursor-pointer"
                          >
                            <div className="relative w-32 aspect-video rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                              <ResilientImage
                                src={video.thumbnailUrl}
                                alt={video.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />
                              {video.duration && (
                                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-slate-950/85 text-white text-[10px] font-mono tabular-nums">
                                  {video.duration}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 group-hover:text-blue-600 line-clamp-2 leading-snug">
                                {video.title}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1 truncate">
                                {video.channel}
                              </div>
                              {video.views && (
                                <div className="text-[11px] text-slate-400 tabular-nums">
                                  {video.views}
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </aside>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <h1 className="text-lg font-bold text-slate-900">{siteData.title}</h1>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {siteData.youtubeData.videos.length} video ayrıştırıldı
                      </span>
                    </div>

                    {siteData.youtubeData.videos.length === 0 ? (
                      <p className="text-sm text-slate-600 py-8">
                        Video listesi alınamadı. Yukarıdaki YouTube arama kutusundan farklı bir
                        kelime aramayı deneyin.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {siteData.youtubeData.videos.map((video) => (
                          <button
                            key={video.videoId}
                            type="button"
                            onClick={() => onNavigate(video.url)}
                            className="group text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-xl"
                          >
                            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                              <ResilientImage
                                src={video.thumbnailUrl}
                                alt={video.title}
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity w-11 h-11 rounded-full bg-white/95 text-slate-900 flex items-center justify-center shadow-md">
                                  <Play className="w-4 h-4 fill-current ml-0.5" />
                                </span>
                              </div>
                              {video.duration && (
                                <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-slate-950/85 text-white text-[11px] font-mono tabular-nums">
                                  {video.duration}
                                </span>
                              )}
                            </div>
                            <div className="mt-2.5">
                              <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 line-clamp-2 leading-snug transition-colors">
                                {video.title}
                              </h3>
                              <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-1.5 tabular-nums">
                                <span className="truncate max-w-[180px]">{video.channel}</span>
                                {video.views && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{video.views}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : renderMode === 'live' && siteData.liveViewport ? (
            <div className="relative flex-1 min-h-0 flex">
              <div className="flex-1 min-w-0 min-h-0 flex">
                <EdgeLiveViewport
                  viewport={siteData.liveViewport}
                  onViewportUpdate={(updated) => {
                    if (updated.finalUrl) setAddressInput(updated.finalUrl);
                    onViewportUpdate?.(updated);
                  }}
                  onSessionExpired={onReload}
                />
              </div>

              {showLinksDrawer && (
                <aside className="w-80 shrink-0 border-l border-slate-200 bg-slate-50 p-4 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Sayfadaki Bağlantılar
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowLinksDrawer(false)}
                      aria-label="Bağlantı panelini kapat"
                      className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-200/80">
                    {siteData.links.map((link, idx) => (
                      <li key={`${link.href}-${idx}`} className="py-2.5">
                        <button
                          type="button"
                          onClick={() => onNavigate(link.href)}
                          className="w-full text-left group cursor-pointer"
                        >
                          <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 line-clamp-1 transition-colors">
                            {link.text}
                          </div>
                          <div className="text-xs font-mono text-slate-400 truncate mt-0.5">
                            {link.href.replace(/^https?:\/\//, '')}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
            </div>
          ) : renderMode === 'chrome' && siteData.chromeDocument ? (
            <div className="relative flex-1 min-h-0 flex">
              <div className="flex-1 min-w-0 overflow-y-auto">
                <ChromeHttpCanvas
                  chromeDocument={siteData.chromeDocument}
                  baseUrl={siteData.finalUrl}
                  onNavigate={onNavigate}
                />
              </div>

              {showLinksDrawer && (
                <aside className="w-80 shrink-0 border-l border-slate-200 bg-slate-50 p-4 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Sayfadaki Bağlantılar
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowLinksDrawer(false)}
                      aria-label="Bağlantı panelini kapat"
                      className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-200/80">
                    {siteData.links.map((link, idx) => (
                      <li key={`${link.href}-${idx}`} className="py-2.5">
                        <button
                          type="button"
                          onClick={() => onNavigate(link.href)}
                          className="w-full text-left group cursor-pointer"
                        >
                          <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 line-clamp-1 transition-colors">
                            {link.text}
                          </div>
                          <div className="text-xs font-mono text-slate-400 truncate mt-0.5">
                            {link.href.replace(/^https?:\/\//, '')}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 bg-white">
              <div
                className="lg:col-span-8 p-6 sm:p-10 lg:border-r lg:border-slate-200"
                onClick={handleContentClick}
              >
                <div className="max-w-3xl mx-auto">
                  {siteData.siteSearch && (
                    <form
                      onSubmit={handleInSiteSearch}
                      className="flex items-center gap-2 mb-6 pb-6 border-b border-slate-200"
                    >
                      <div className="flex items-center flex-1 bg-slate-50 border border-slate-300 focus-within:border-blue-600 focus-within:bg-white rounded-lg px-3.5 h-10 transition-colors">
                        <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                        <input
                          type="text"
                          value={siteSearchInput}
                          onChange={(e) => setSiteSearchInput(e.target.value)}
                          placeholder={siteData.siteSearch.placeholder}
                          className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        className="h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Site İçi Ara
                      </button>
                    </form>
                  )}

                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight mb-3 text-balance">
                    {siteData.title}
                  </h1>
                  {siteData.description && (
                    <p className="text-base text-slate-600 leading-relaxed pb-6 mb-6 border-b border-slate-200">
                      {siteData.description}
                    </p>
                  )}

                  {siteData.blocks.length === 0 ? (
                    <div className="py-6 text-sm text-slate-600">
                      Sağdaki sayfa bağlantılarından ilgili bölümlere geçebilir veya üstteki dış
                      bağlantı simgesini kullanabilirsiniz.
                    </div>
                  ) : (
                    <div className="space-y-4 text-[15px] leading-relaxed text-slate-800">
                      {siteData.blocks.map((block, idx) => {
                        if (block.type === 'heading') {
                          const sizeClass =
                            block.level === 1
                              ? 'text-xl font-bold text-slate-900 pt-4'
                              : block.level === 2
                                ? 'text-lg font-semibold text-slate-900 pt-3'
                                : 'text-base font-semibold text-slate-900 pt-2';
                          return (
                            <h2 key={idx} className={sizeClass}>
                              {block.text}
                            </h2>
                          );
                        }
                        if (block.type === 'paragraph') {
                          if (block.html) {
                            return (
                              <p
                                key={idx}
                                className="text-slate-700 leading-7"
                                dangerouslySetInnerHTML={{ __html: block.html }}
                              />
                            );
                          }
                          return (
                            <p key={idx} className="text-slate-700 leading-7">
                              {block.text}
                            </p>
                          );
                        }
                        if (block.type === 'list' && block.items) {
                          const ListTag = block.ordered ? 'ol' : 'ul';
                          return (
                            <ListTag
                              key={idx}
                              className={`pl-5 space-y-1.5 text-slate-700 ${
                                block.ordered ? 'list-decimal' : 'list-disc'
                              }`}
                            >
                              {block.items.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ListTag>
                          );
                        }
                        if (block.type === 'blockquote') {
                          return (
                            <blockquote
                              key={idx}
                              className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 italic"
                            >
                              {block.text}
                            </blockquote>
                          );
                        }
                        if (block.type === 'code') {
                          return (
                            <pre
                              key={idx}
                              className="p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto text-xs font-mono"
                            >
                              <code>{block.text}</code>
                            </pre>
                          );
                        }
                        if (block.type === 'image' && block.src) {
                          return (
                            <figure key={idx} className="my-5">
                              <ResilientImage
                                src={block.src}
                                alt={block.alt || siteData.title}
                                className="w-full max-h-[380px] object-contain rounded-lg border border-slate-200 bg-slate-50"
                              />
                              {block.alt && (
                                <figcaption className="mt-2 text-xs text-slate-500">
                                  {block.alt}
                                </figcaption>
                              )}
                            </figure>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              </div>

              <aside className="lg:col-span-4 p-6 bg-slate-50/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Sayfadaki Bağlantılar
                  </h3>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {siteData.links.length} link
                  </span>
                </div>
                {siteData.links.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Bu sayfada gezinilebilir alt bağlantı bulunamadı.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-200/80">
                    {siteData.links.map((link, idx) => (
                      <li key={`${link.href}-${idx}`} className="py-2.5">
                        <button
                          type="button"
                          onClick={() => onNavigate(link.href)}
                          className="w-full text-left group cursor-pointer"
                        >
                          <div className="text-sm font-medium text-slate-800 group-hover:text-blue-600 line-clamp-1 transition-colors">
                            {link.text}
                          </div>
                          <div className="text-xs font-mono text-slate-400 truncate mt-0.5">
                            {link.href.replace(/^https?:\/\//, '')}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
