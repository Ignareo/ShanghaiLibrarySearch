import {
  BASE_URL,
  DEFAULT_LANGUAGE,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  HOLDINGS_SUCCESS_MARKERS,
} from "./config.js";

export interface ShanghaiLibraryClientOptions {
  baseUrl?: string;
  language?: string;
  timeoutMs?: number;
}

export class ShanghaiLibraryClient {
  public readonly baseUrl: string;
  public readonly language: string;
  private readonly timeoutMs: number;

  public constructor(options: ShanghaiLibraryClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? BASE_URL).replace(/\/$/u, "");
    this.language = options.language ?? DEFAULT_LANGUAGE;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async fetchSearchHtml(query: string, page = 1): Promise<string> {
    const params = new URLSearchParams({
      lookfor: query,
      type: "AllFields",
      searchtype: "vague",
      lng: this.language,
    });
    if (page > 1) {
      params.set("page", String(page));
    }
    return this.getText(`/Search/Results?${params.toString()}`);
  }

  public async fetchAdvancedSearchHtml(): Promise<string> {
    return this.getText(
      `/Search/Advanced?lng=${encodeURIComponent(this.language)}`,
    );
  }

  public async fetchAdvancedSearchResultsHtml(
    params: Array<[string, string]>,
    page = 1,
  ): Promise<string> {
    const searchParams = new URLSearchParams(params);
    searchParams.append("lng", this.language);
    if (page > 1) {
      searchParams.append("page", String(page));
    }
    return this.getText(`/Search/Results?${searchParams.toString()}`);
  }

  public async fetchHoldingsHtml(recordId: string): Promise<string> {
    const body = new URLSearchParams({
      tab: "holdings",
      folioLocations: "",
      libraryId: "",
    });
    const response = await this.fetchWithRetry(`/Record/${recordId}/AjaxTab`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
    });

    const html = await response.text();
    if (HOLDINGS_SUCCESS_MARKERS.some((marker) => html.includes(marker))) {
      return html;
    }

    return this.getText(
      `/Record/${recordId}/Holdings?lng=${encodeURIComponent(this.language)}`,
    );
  }

  public async fetchRecordHtml(recordId: string): Promise<string> {
    return this.getText(
      `/Record/${recordId}?lng=${encodeURIComponent(this.language)}`,
    );
  }

  private async getText(path: string): Promise<string> {
    const response = await this.fetchWithRetry(path, { method: "GET" });
    return response.text();
  }

  private async fetchWithRetry(
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await this.fetchOnce(path, init, this.timeoutMs);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "TimeoutError") {
        throw error;
      }
      return this.fetchOnce(
        path,
        init,
        Math.max(this.timeoutMs, DEFAULT_READ_TIMEOUT_MS),
      );
    }
  }

  private async fetchOnce(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        ...(init.headers ?? {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `Shanghai Library request failed: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  }
}
