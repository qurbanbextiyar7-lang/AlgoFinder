import {
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ArrowDown, ArrowUp, CornerDownLeft, Keyboard, RefreshCw, X } from 'lucide-react';
import type { LiveBrowserViewport } from '../types';

export interface BrowserInteractResponse {
  ok?: boolean;
  sessionId: string;
  finalUrl?: string;
  domain?: string;
  title?: string;
  isEditable?: boolean;
  liveViewport?: LiveBrowserViewport;
}

interface EdgeLiveViewportProps {
  viewport: LiveBrowserViewport;
  onViewportUpdate: (update: BrowserInteractResponse) => void;
  onSessionExpired?: () => void;
}

export function EdgeLiveViewport({
  viewport,
  onViewportUpdate,
  onSessionExpired,
}: EdgeLiveViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const imeRef = useRef<HTMLTextAreaElement>(null);

  const [activeCursor, setActiveCursor] = useState<string>('default');
  const [isEditableFocused, setIsEditableFocused] = useState(false);
  const [isNavBusy, setIsNavBusy] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [showQuickBar, setShowQuickBar] = useState(false);
  const [clickPulse, setClickPulse] = useState<{ xPct: number; yPct: number; id: number } | null>(
    null
  );

  // Direct DOM + RAF frame buffer (zero React re-renders during 30 FPS scrolling)
  const pendingFrameB64Ref = useRef<string | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Wheel coalescing queue: at most 1 wheel POST in flight at any moment
  const wheelInFlightRef = useRef(false);
  const pendingWheelRef = useRef({ dx: 0, dy: 0 });
  const lastWheelAtRef = useRef(0);
  const lastPointerRef = useRef({
    x: Math.round(viewport.viewportWidth / 2),
    y: Math.round(viewport.viewportHeight / 2),
  });

  const resizeTimerRef = useRef<number | null>(null);
  const cursorInFlightRef = useRef(false);
  const lastCursorSentAtRef = useRef(0);
  const latestSizeRef = useRef({
    width: viewport.viewportWidth,
    height: viewport.viewportHeight,
  });

  const latestViewportRef = useRef(viewport);
  latestViewportRef.current = viewport;
  const onViewportUpdateRef = useRef(onViewportUpdate);
  onViewportUpdateRef.current = onViewportUpdate;
  const onSessionExpiredRef = useRef(onSessionExpired);
  onSessionExpiredRef.current = onSessionExpired;

  // Apply initial frame cleanly when prop changes
  useEffect(() => {
    if (viewport.frameDataUrl && imgRef.current) {
      imgRef.current.src = viewport.frameDataUrl;
    }
  }, [viewport.sessionId, viewport.frameDataUrl]);

  // Connect real-time SSE screencast stream & paint frames via RAF without React re-renders
  useEffect(() => {
    const es = new EventSource(`/api/browser/stream/${encodeURIComponent(viewport.sessionId)}`);

    const schedulePaint = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        const nextB64 = pendingFrameB64Ref.current;
        pendingFrameB64Ref.current = null;
        if (nextB64 && imgRef.current) {
          imgRef.current.src = `data:image/jpeg;base64,${nextB64}`;
        }
      });
    };

    es.addEventListener('frame', (ev) => {
      const data = (ev as MessageEvent<string>).data;
      if (data) {
        pendingFrameB64Ref.current = data;
        schedulePaint();
      }
    });

    es.addEventListener('meta', (ev) => {
      try {
        const meta = JSON.parse((ev as MessageEvent<string>).data) as {
          finalUrl: string;
          domain: string;
          title: string;
          canGoBack: boolean;
          canGoForward: boolean;
        };
        const cur = latestViewportRef.current;
        onViewportUpdateRef.current({
          sessionId: cur.sessionId,
          finalUrl: meta.finalUrl,
          domain: meta.domain,
          title: meta.title,
          liveViewport: {
            ...cur,
            frameDataUrl: '',
            canGoBack: meta.canGoBack,
            canGoForward: meta.canGoForward,
          },
        });
      } catch {
        // ignore malformed meta
      }
    });

    return () => {
      es.close();
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [viewport.sessionId]);

  const sendInteract = async (
    payload: Record<string, unknown>,
    showSpinner = false
  ): Promise<BrowserInteractResponse | null> => {
    if (showSpinner) setIsNavBusy(true);
    try {
      const res = await fetch('/api/browser/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: latestViewportRef.current.sessionId,
          viewportWidth: latestSizeRef.current.width,
          viewportHeight: latestSizeRef.current.height,
          ...payload,
        }),
      });

      if (res.status === 404 || res.status === 410) {
        onSessionExpiredRef.current?.();
        return null;
      }
      if (!res.ok) return null;

      const data = (await res.json()) as BrowserInteractResponse;
      if (data.liveViewport?.frameDataUrl && imgRef.current) {
        imgRef.current.src = data.liveViewport.frameDataUrl;
      }
      if (data.finalUrl) {
        onViewportUpdateRef.current(data);
      }
      return data;
    } catch {
      return null;
    } finally {
      if (showSpinner) setIsNavBusy(false);
    }
  };

  // Match engine viewport 1:1 with full browser container dimensions on mount & resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const checkResize = () => {
      const w = Math.max(360, Math.min(1920, Math.round(el.clientWidth)));
      const h = Math.max(480, Math.min(1200, Math.round(el.clientHeight)));
      if (w < 360 || h < 480) return;

      latestSizeRef.current = { width: w, height: h };
      const diffW = Math.abs(w - latestViewportRef.current.viewportWidth);
      const diffH = Math.abs(h - latestViewportRef.current.viewportHeight);
      if (diffW > 24 || diffH > 24) {
        if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = window.setTimeout(() => {
          void sendInteract(
            {
              action: 'resize',
              viewportWidth: w,
              viewportHeight: h,
            },
            true
          );
        }, 280);
      }
    };

    checkResize();
    const observer = new ResizeObserver(checkResize);
    observer.observe(el);

    return () => {
      observer.disconnect();
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
    };
  }, [viewport.sessionId]);

  useEffect(() => {
    return () => {
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
    };
  }, []);

  const mapPointerCoords = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return {
      relX,
      relY,
      x: Math.round(relX * latestViewportRef.current.viewportWidth),
      y: Math.round(relY * latestViewportRef.current.viewportHeight),
    };
  };

  // Throttled real-time Chrome cursor detection (paused briefly during scrolling so zero contention)
  const handleMouseMove = (e: MouseEvent<HTMLImageElement>) => {
    const coords = mapPointerCoords(e.clientX, e.clientY);
    if (!coords) return;
    lastPointerRef.current = { x: coords.x, y: coords.y };

    const now = performance.now();
    if (now - lastWheelAtRef.current < 260) return;
    if (cursorInFlightRef.current || now - lastCursorSentAtRef.current < 65) return;

    cursorInFlightRef.current = true;
    lastCursorSentAtRef.current = now;
    void fetch('/api/browser/cursor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: latestViewportRef.current.sessionId,
        x: coords.x,
        y: coords.y,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { cursor?: string; isEditable?: boolean } | null) => {
        if (res?.cursor) {
          setActiveCursor(res.cursor);
        }
      })
      .catch(() => {
        // ignore hover errors
      })
      .finally(() => {
        cursorInFlightRef.current = false;
      });
  };

  const handleViewportClick = (e: MouseEvent<HTMLImageElement>) => {
    const coords = mapPointerCoords(e.clientX, e.clientY);
    if (!coords) return;
    lastPointerRef.current = { x: coords.x, y: coords.y };

    setClickPulse({ xPct: coords.relX * 100, yPct: coords.relY * 100, id: Date.now() });
    window.setTimeout(() => {
      setClickPulse((prev) => (prev && Date.now() - prev.id >= 240 ? null : prev));
    }, 260);

    if (activeCursor === 'text') {
      setIsEditableFocused(true);
      imeRef.current?.focus({ preventScroll: true });
    } else {
      containerRef.current?.focus({ preventScroll: true });
    }

    void sendInteract({ action: 'click', x: coords.x, y: coords.y }).then((res) => {
      if (res?.isEditable) {
        setIsEditableFocused(true);
        imeRef.current?.focus({ preventScroll: true });
      } else if (res && res.isEditable === false && activeCursor !== 'text') {
        setIsEditableFocused(false);
      }
    });
  };

  const handleSpecialKey = (e: KeyboardEvent<HTMLElement>) => {
    const mappedSpecialKeys: Record<string, string> = {
      Enter: 'Enter',
      Backspace: 'Backspace',
      Tab: 'Tab',
      Escape: 'Escape',
      Delete: 'Delete',
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
    };

    if (e.key in mappedSpecialKeys) {
      e.preventDefault();
      void sendInteract({ action: 'key', key: mappedSpecialKeys[e.key] });
      return;
    }

    if (e.key === ' ' && document.activeElement !== imeRef.current) {
      e.preventDefault();
      void sendInteract({ action: 'key', key: 'Space' });
    }
  };

  const handleContainerKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (
      document.activeElement === imeRef.current ||
      document.activeElement instanceof HTMLInputElement
    ) {
      return;
    }

    handleSpecialKey(e);
    if (e.defaultPrevented) return;

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      void sendInteract({ action: 'type', text: e.key });
    }
  };

  const handleImeInput = () => {
    const el = imeRef.current;
    if (!el) return;
    const val = el.value;
    if (!val) return;
    el.value = '';
    void sendInteract({ action: 'type', text: val });
  };

  // Coalesced wheel pump: 0 request pileup even during fast trackpad/wheel flicks on GitHub
  const flushWheelQueue = () => {
    if (wheelInFlightRef.current) return;
    const { dx, dy } = pendingWheelRef.current;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    pendingWheelRef.current = { dx: 0, dy: 0 };
    wheelInFlightRef.current = true;
    void sendInteract({
      action: 'wheel',
      x: lastPointerRef.current.x,
      y: lastPointerRef.current.y,
      deltaX: Math.round(dx),
      deltaY: Math.round(dy),
    }).finally(() => {
      wheelInFlightRef.current = false;
      if (
        Math.abs(pendingWheelRef.current.dx) >= 1 ||
        Math.abs(pendingWheelRef.current.dy) >= 1
      ) {
        flushWheelQueue();
      }
    });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onNativeWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      lastWheelAtRef.current = performance.now();
      const mult = e.deltaMode === 1 ? 36 : e.deltaMode === 2 ? latestSizeRef.current.height * 0.85 : 1;
      pendingWheelRef.current.dx += e.deltaX * mult;
      pendingWheelRef.current.dy += e.deltaY * mult;
      flushWheelQueue();
    };

    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  const handleQuickTextSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = quickText;
    if (!text.trim()) return;
    setQuickText('');
    void sendInteract({ action: 'typeAndEnter', text });
  };

  return (
    <div className="relative flex-1 w-full h-full flex flex-col bg-white overflow-hidden">
      {isNavBusy && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-20 bg-blue-100 overflow-hidden">
          <div className="h-full w-1/3 bg-blue-600 animate-pulse" />
        </div>
      )}

      <textarea
        ref={imeRef}
        aria-label="Metin giriş yakalayıcı"
        tabIndex={isEditableFocused ? 0 : -1}
        onInput={handleImeInput}
        onKeyDown={handleSpecialKey}
        className="fixed -left-[9999px] top-0 w-px h-px opacity-0 pointer-events-none"
      />

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleContainerKeyDown}
        aria-label="Tam ekran canlı web görünümü"
        className="relative flex-1 w-full h-full bg-white outline-none select-none overflow-hidden"
      >
        <img
          ref={imgRef}
          src={viewport.frameDataUrl}
          alt="Canlı Web Görünümü"
          draggable={false}
          decoding="sync"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setActiveCursor('default')}
          onClick={handleViewportClick}
          style={{ cursor: activeCursor }}
          className="w-full h-full object-fill block"
        />

        {clickPulse && (
          <span
            style={{ left: `${clickPulse.xPct}%`, top: `${clickPulse.yPct}%` }}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-blue-500 bg-blue-500/20 animate-ping"
          />
        )}
      </div>

      {showQuickBar ? (
        <div className="fixed bottom-4 right-4 z-30 w-[min(460px,calc(100vw-2rem))] bg-white/95 backdrop-blur-md border border-slate-300 rounded-xl shadow-lg p-2.5 flex flex-col gap-2">
          <form onSubmit={handleQuickTextSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="Sayfadaki alana metin yazıp Enter gönderin..."
              autoFocus
              className="flex-1 h-8 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
            />
            <button
              type="submit"
              disabled={!quickText.trim()}
              className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
              <span>Gönder</span>
            </button>
            <button
              type="button"
              onClick={() => setShowQuickBar(false)}
              aria-label="Yardımcıyı kapat"
              className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
          <div className="flex items-center justify-end gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => void sendInteract({ action: 'wheel', deltaX: 0, deltaY: -480 })}
              className="h-7 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowUp className="w-3 h-3" />
              <span>Yukarı</span>
            </button>
            <button
              type="button"
              onClick={() => void sendInteract({ action: 'wheel', deltaX: 0, deltaY: 480 })}
              className="h-7 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <ArrowDown className="w-3 h-3" />
              <span>Aşağı</span>
            </button>
            <button
              type="button"
              onClick={() => void sendInteract({ action: 'refresh' }, true)}
              disabled={isNavBusy}
              className="h-7 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isNavBusy ? 'animate-spin' : ''}`} />
              <span>Tazele</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-3 right-3 z-30 flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg shadow-sm p-1">
          <button
            type="button"
            onClick={() => void sendInteract({ action: 'wheel', deltaX: 0, deltaY: -420 })}
            title="Yukarı kaydır"
            className="h-7 w-7 rounded-md hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center cursor-pointer"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void sendInteract({ action: 'wheel', deltaX: 0, deltaY: 420 })}
            title="Aşağı kaydır"
            className="h-7 w-7 rounded-md hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center cursor-pointer"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowQuickBar(true)}
            title="Hızlı metin yaz"
            className="h-7 px-2 rounded-md hover:bg-slate-100 text-slate-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Yaz</span>
          </button>
        </div>
      )}
    </div>
  );
}
