export type SearchTab = 'web' | 'images' | 'opener' | 'popular';
export type SearchMode = 'popular' | 'research';

export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  popularityLabel: string;
  isOfficialMatch?: boolean;
}

export interface AnalyzedResearchSource {
  index: number;
  title: string;
  url: string;
  domain: string;
  excerpt: string;
  headings: string[];
}

export interface ResearchReport {
  overview: string;
  keyFindings: string[];
  sourcesAnalyzed: AnalyzedResearchSource[];
  relatedTopics: string[];
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  mode: SearchMode;
  detectedUrl: string | null;
  directMatch: SearchResultItem | null;
  summary: string;
  researchReport?: ResearchReport;
  results: SearchResultItem[];
  relatedImages: ImageResult[];
  durationMs: number;
  engine: 'algofind-popularity-grounding' | 'algofind-http-index';
}

export interface ImageResult {
  id: string;
  title: string;
  thumbnailUrl: string;
  fullUrl: string;
  sourceUrl: string;
  domain: string;
  width: number;
  height: number;
  author?: string;
}

export interface ImageSearchResponse {
  query: string;
  translatedQuery?: string;
  images: ImageResult[];
  durationMs: number;
}

export interface PageLink {
  text: string;
  href: string;
}

export interface ReaderBlock {
  type: 'heading' | 'paragraph' | 'list' | 'blockquote' | 'image' | 'code';
  level?: number;
  text?: string;
  html?: string;
  items?: string[];
  ordered?: boolean;
  src?: string;
  alt?: string;
}

export interface ChromeStyleSheet {
  css: string;
  media?: string;
}

export interface ChromeDocumentPayload {
  styles: ChromeStyleSheet[];
  htmlAttrs: Record<string, string>;
  bodyClass: string;
  bodyStyle: string;
  bodyHtml: string;
  stylesheetCount: number;
}

export interface YouTubeVideoItem {
  videoId: string;
  title: string;
  channel: string;
  duration?: string;
  views?: string;
  published?: string;
  thumbnailUrl: string;
  url: string;
}

export interface YouTubePageData {
  mode: 'watch' | 'feed';
  searchQuery?: string;
  activeVideo?: {
    videoId: string;
    title: string;
    channel: string;
    views?: string;
    description: string;
    thumbnailUrl: string;
    embedUrl: string;
  };
  videos: YouTubeVideoItem[];
}

export interface LiveBrowserViewport {
  sessionId: string;
  frameDataUrl: string;
  viewportWidth: number;
  viewportHeight: number;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface OpenSiteResponse {
  requestedUrl: string;
  finalUrl: string;
  domain: string;
  title: string;
  description: string;
  favicon: string;
  lang: string;
  durationMs: number;
  byteSize: number;
  statusCode: number;
  retrievalMethod: 'algofind-engine' | 'direct-http' | 'youtube-http' | 'api-http' | 'smart-recovery';
  notice?: string;
  siteSearch?: {
    placeholder: string;
    urlTemplate: string; // e.g. https://sozluk.gov.tr/?ara={q}
    currentQuery?: string;
  };
  liveViewport?: LiveBrowserViewport;
  chromeDocument?: ChromeDocumentPayload;
  youtubeData?: YouTubePageData;
  blocks: ReaderBlock[];
  links: PageLink[];
}

export interface PopularSiteShortcut {
  name: string;
  domain: string;
  url: string;
  category: string;
  description: string;
  keywords: string[];
}
