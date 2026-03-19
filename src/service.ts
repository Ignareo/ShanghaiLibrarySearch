import {
  buildAdvancedSearchParams,
  parseAdvancedSearchOptions,
  summarizeAdvancedSearch,
} from "./advanced-search.js";
import {
  ShanghaiLibraryClient,
  type ShanghaiLibraryClientOptions,
} from "./client.js";
import {
  type AdvancedSearchOptionsResponse,
  type AdvancedSearchRequest,
  AdvancedSearchResponseSchema,
  type AvailabilityCategory,
  type BatchSearchResponse,
  BatchSearchResponseSchema,
  type HoldingItem,
  type RecordHoldings,
  type SearchResponse,
} from "./models.js";
import { normalizeStringList } from "./normalization.js";
import { parseRecordHoldings, parseSearchResults } from "./parsers.js";

export interface FilterHoldingsOptions {
  onlyAvailable?: boolean;
  availabilityFilters?: AvailabilityCategory[];
  rawStatusFilters?: string[];
  circulationTypeFilters?: string[];
}

export class LibrarySearchService {
  private readonly client: ShanghaiLibraryClient;
  private advancedSearchOptionsCache: AdvancedSearchOptionsResponse | null =
    null;

  public constructor(clientOptions?: ShanghaiLibraryClientOptions) {
    this.client = new ShanghaiLibraryClient(clientOptions);
  }

  public async searchBooks(query: string, page = 1): Promise<SearchResponse> {
    const html = await this.client.fetchSearchHtml(query, page);
    return parseSearchResults(html, query, page, this.client.baseUrl);
  }

  public async getAdvancedSearchOptions(
    refresh = false,
  ): Promise<AdvancedSearchOptionsResponse> {
    if (refresh || !this.advancedSearchOptionsCache) {
      const html = await this.client.fetchAdvancedSearchHtml();
      this.advancedSearchOptionsCache = parseAdvancedSearchOptions(html);
    }
    return this.advancedSearchOptionsCache;
  }

  public async searchBooksAdvanced(
    request: AdvancedSearchRequest,
  ): Promise<ReturnType<typeof AdvancedSearchResponseSchema.parse>> {
    const options = await this.getAdvancedSearchOptions();
    const params = buildAdvancedSearchParams(request, options);
    const html = await this.client.fetchAdvancedSearchResultsHtml(
      params,
      request.page,
    );
    const parsed = parseSearchResults(
      html,
      summarizeAdvancedSearch(request),
      request.page,
      this.client.baseUrl,
    );

    return AdvancedSearchResponseSchema.parse({
      ...parsed,
      search_context: {
        mode: "advanced",
        request,
        resolved_params: params.map(([key, value]) => ({ key, value })),
      },
    });
  }

  public async getRecordHoldings(recordId: string): Promise<RecordHoldings> {
    const freshClient = new ShanghaiLibraryClient({
      baseUrl: this.client.baseUrl,
      language: this.client.language,
    });
    const html = await freshClient.fetchHoldingsHtml(recordId);
    let recordHtml: string | undefined;
    try {
      recordHtml = await freshClient.fetchRecordHtml(recordId);
    } catch {
      recordHtml = undefined;
    }
    return parseRecordHoldings(html, recordId, this.client.baseUrl, recordHtml);
  }

  public async batchSearchRecords(options: {
    queries: string[];
    maxCandidatesPerQuery?: number;
    includeHoldings?: boolean;
    availableOnly?: boolean;
    availabilityFilters?: AvailabilityCategory[];
    rawStatusFilters?: string[];
    circulationTypeFilters?: string[];
  }): Promise<BatchSearchResponse> {
    const queries = normalizeStringList(options.queries);
    const maxCandidatesPerQuery = options.maxCandidatesPerQuery ?? 3;
    const includeHoldings = options.includeHoldings ?? false;
    const availableOnly = options.availableOnly ?? false;
    const availabilityFilters = options.availabilityFilters ?? [];
    const rawStatusFilters = normalizeStringList(options.rawStatusFilters);
    const circulationTypeFilters = normalizeStringList(
      options.circulationTypeFilters,
    );

    let successfulQueries = 0;
    let emptyQueries = 0;
    let failedQueries = 0;
    const results: BatchSearchResponse["results"] = [];
    const shouldFetchHoldings =
      includeHoldings ||
      availableOnly ||
      availabilityFilters.length > 0 ||
      rawStatusFilters.length > 0 ||
      circulationTypeFilters.length > 0;

    for (const query of queries) {
      try {
        const searchResult = await this.searchBooks(query);
        const items: BatchSearchResponse["results"][number]["items"] = [];

        for (const record of searchResult.items) {
          let holdings: HoldingItem[] = [];
          if (shouldFetchHoldings) {
            try {
              const holdingsResult = await this.getRecordHoldings(
                record.record_id,
              );
              holdings = filterHoldings(holdingsResult.holdings, {
                onlyAvailable: availableOnly,
                availabilityFilters,
                rawStatusFilters,
                circulationTypeFilters,
              });
            } catch {
              continue;
            }

            if (!holdings.length) {
              continue;
            }
          }

          items.push({ record, holdings });
          if (items.length >= maxCandidatesPerQuery) {
            break;
          }
        }

        if (items.length) {
          successfulQueries += 1;
        } else {
          emptyQueries += 1;
        }

        results.push({
          query,
          total_candidates: searchResult.items.length,
          returned_candidates: items.length,
          items,
          error: null,
        });
      } catch (error) {
        failedQueries += 1;
        results.push({
          query,
          total_candidates: 0,
          returned_candidates: 0,
          items: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return BatchSearchResponseSchema.parse({
      summary: {
        total_queries: queries.length,
        successful_queries: successfulQueries,
        empty_queries: emptyQueries,
        failed_queries: failedQueries,
      },
      results,
    });
  }
}

export function filterHoldings(
  holdings: HoldingItem[],
  options: FilterHoldingsOptions = {},
): HoldingItem[] {
  const onlyAvailable = options.onlyAvailable ?? false;
  const allowedAvailability = new Set(options.availabilityFilters ?? []);
  const rawStatusKeywords = normalizeStringList(options.rawStatusFilters).map(
    (item) => item.toLocaleLowerCase(),
  );
  const circulationTypeKeywords = normalizeStringList(
    options.circulationTypeFilters,
  ).map((item) => item.toLocaleLowerCase());

  return holdings.filter((holding) => {
    if (
      onlyAvailable &&
      holding.availability !== "available" &&
      holding.availability !== "in_library_only"
    ) {
      return false;
    }
    if (
      allowedAvailability.size &&
      !allowedAvailability.has(holding.availability)
    ) {
      return false;
    }
    if (rawStatusKeywords.length) {
      const rawStatus = (holding.raw_status ?? "").toLocaleLowerCase();
      if (!rawStatusKeywords.some((keyword) => rawStatus.includes(keyword))) {
        return false;
      }
    }
    if (circulationTypeKeywords.length) {
      const circulationType = (
        holding.circulation_type ?? ""
      ).toLocaleLowerCase();
      if (
        !circulationTypeKeywords.some((keyword) =>
          circulationType.includes(keyword),
        )
      ) {
        return false;
      }
    }
    return true;
  });
}
