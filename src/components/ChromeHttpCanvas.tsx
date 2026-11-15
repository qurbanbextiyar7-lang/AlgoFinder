import { useEffect, useRef } from 'react';
import type { ChromeDocumentPayload } from '../types';

interface ChromeHttpCanvasProps {
  chromeDocument: ChromeDocumentPayload;
  baseUrl: string;
  onNavigate: (url: string) => void;
}

export function ChromeHttpCanvas({
  chromeDocument,
  baseUrl,
  onNavigate,
}: ChromeHttpCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onNavigateRef = useRef(onNavigate);
  onNavigateRef.current = onNavigate;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '';

    // 1. Minimal Chrome-like root defaults (placed first so target site styles win)
    const baseStyle = document.createElement('style');
    baseStyle.textContent = `
      :host {
        display: block;
        width: 100%;
        color: #0f172a;
        background-color: #ffffff;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.5;
        text-size-adjust: 100%;
      }
      .af-doc-html {
        display: block;
        width: 100%;
        min-height: 70vh;
        position: relative;
      }
      .af-doc-body {
        display: block;
        width: 100%;
        min-height: 70vh;
        margin: 0;
        position: relative;
      }
      img, video, svg {
        max-width: 100%;
      }
      a[data-af-href] {
        cursor: pointer;
      }
    `;
    shadow.appendChild(baseStyle);

    // 2. Append site's fetched & inline CSS stylesheets in exact source order
    for (const sheet of chromeDocument.styles) {
      if (!sheet.css) continue;
      const styleEl = document.createElement('style');
      if (sheet.media && sheet.media !== 'all') {
        styleEl.media = sheet.media;
      }
      styleEl.textContent = sheet.css;
      shadow.appendChild(styleEl);
    }

    // 3. Reconstruct html + body wrappers preserving classes, data attributes & inline styles
    const htmlDiv = document.createElement('div');
    const htmlAttrs = chromeDocument.htmlAttrs || {};
    for (const [key, val] of Object.entries(htmlAttrs)) {
      if (key === 'class') continue;
      if (key === 'style') {
        htmlDiv.setAttribute('style', val);
        continue;
      }
      if (/^[a-zA-Z0-9_-]+$/.test(key)) {
        htmlDiv.setAttribute(key, val);
      }
    }
    htmlDiv.className = ['af-doc-html', htmlAttrs.class || ''].filter(Boolean).join(' ');

    const bodyDiv = document.createElement('div');
    bodyDiv.className = ['af-doc-body', chromeDocument.bodyClass || ''].filter(Boolean).join(' ');
    if (chromeDocument.bodyStyle) {
      bodyDiv.setAttribute('style', chromeDocument.bodyStyle);
    }
    bodyDiv.innerHTML = chromeDocument.bodyHtml;

    htmlDiv.appendChild(bodyDiv);
    shadow.appendChild(htmlDiv);

    // 4. Intercept link clicks & anchor jumps via composedPath (Zero iframe navigation)
    const handleClick = (e: Event) => {
      const path = e.composedPath();
      for (const node of path) {
        if (node instanceof HTMLAnchorElement) {
          const rawHref = node.getAttribute('data-af-href') || node.getAttribute('href') || '';
          if (!rawHref) return;

          if (rawHref.startsWith('#')) {
            e.preventDefault();
            const targetId = rawHref.slice(1);
            if (targetId) {
              const targetEl = shadow.getElementById(targetId);
              targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
          }

          if (/^https?:\/\//i.test(rawHref)) {
            e.preventDefault();
            e.stopPropagation();
            onNavigateRef.current(rawHref);
            return;
          }
        }
      }
    };

    // 5. Intercept in-site search/filter GET forms inside rendered pages
    const handleSubmit = (e: Event) => {
      const submitEvent = e as SubmitEvent;
      const path = e.composedPath();
      for (const node of path) {
        if (node instanceof HTMLFormElement) {
          e.preventDefault();
          e.stopPropagation();
          const action = node.getAttribute('data-af-action') || baseUrl;
          try {
            const target = new URL(action, baseUrl);
            const formData = new FormData(node);
            if (
              submitEvent.submitter instanceof HTMLButtonElement ||
              submitEvent.submitter instanceof HTMLInputElement
            ) {
              if (submitEvent.submitter.name) {
                formData.append(submitEvent.submitter.name, submitEvent.submitter.value);
              }
            }
            for (const [k, v] of formData.entries()) {
              if (typeof v === 'string') {
                target.searchParams.set(k, v);
              }
            }
            onNavigateRef.current(target.toString());
          } catch {
            // ignore invalid form URL
          }
          return;
        }
      }
    };

    shadow.addEventListener('click', handleClick);
    shadow.addEventListener('submit', handleSubmit);

    return () => {
      shadow.removeEventListener('click', handleClick);
      shadow.removeEventListener('submit', handleSubmit);
    };
  }, [chromeDocument, baseUrl]);

  return (
    <div
      ref={hostRef}
      className="relative isolate w-full min-h-[70vh] overflow-x-auto bg-white translate-z-0"
    />
  );
}
