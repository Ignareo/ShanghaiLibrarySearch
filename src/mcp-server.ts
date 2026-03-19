import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { SERVER_NAME, SERVER_VERSION } from "./config.js";
import {
  AdvancedSearchOptionsResponseSchema,
  AdvancedSearchRequestSchema,
  AdvancedSearchResponseSchema,
  AvailabilityCategory,
  AvailabilityCategorySchema,
  BatchSearchResponseSchema,
  type BatchSearchItem,
  FindMatchingBooksResponseSchema,
  RecordHoldingsSchema,
  SearchResponseSchema,
  type HoldingItem,
} from "./models.js";
import { normalizeStringList } from "./normalization.js";
import { LibrarySearchService, filterHoldings } from "./service.js";

const SearchBooksInputSchema = z.object({
  query: z.string().trim().min(1, "query must not be empty"),
  page: z.number().int().min(1).default(1),
});

const GetAdvancedSearchOptionsInputSchema = z.object({
  refresh: z.boolean().default(false),
});

const GetRecordHoldingsInputSchema = z.object({
  record_id: z.string().trim().min(1, "record_id must not be empty"),
});

const BatchSearchInputSchema = z.object({
  queries: z.array(z.string()).min(1),
  max_candidates_per_query: z.number().int().min(1).max(10).default(3),
  include_holdings: z.boolean().default(false),
  available_only: z.boolean().default(false),
  availability_filters: z.array(AvailabilityCategorySchema).default([]),
  raw_status_filters: z.array(z.string()).default([]),
  circulation_type_filters: z.array(z.string()).default([]),
});

const FindMatchingBooksInputSchema = z.object({
  topic: z.string().trim().min(1, "topic must not be empty"),
  target_count: z.number().int().min(1).default(3),
  max_pages: z.number().int().min(1).default(5),
  max_candidates: z.number().int().min(1).default(30),
  availability_filters: z.array(AvailabilityCategorySchema).default([]),
  raw_status_filters: z.array(z.string()).default([]),
  circulation_type_filters: z.array(z.string()).default([]),
});

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  registerTools(server);
  registerResources(server);

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} ${SERVER_VERSION} running on stdio`);
}

function registerTools(server: McpServer): void {
  server.registerTool(
    "search_books",
    {
      title: "Keyword Search",
      description:
        "Search books by keyword and return structured search results.",
      inputSchema: SearchBooksInputSchema,
      outputSchema: SearchResponseSchema,
    },
    async ({ query, page }) => {
      const service = new LibrarySearchService();
      const result = await service.searchBooks(query, page);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    "get_advanced_search_options",
    {
      title: "Advanced Search Options",
      description:
        "Get advanced search option metadata, including districts, libraries, languages, classifications, and formats.",
      inputSchema: GetAdvancedSearchOptionsInputSchema,
      outputSchema: AdvancedSearchOptionsResponseSchema,
    },
    async ({ refresh }) => {
      const service = new LibrarySearchService();
      const result = await service.getAdvancedSearchOptions(refresh);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    "search_books_advanced",
    {
      title: "Advanced Book Search",
      description:
        "Run structured advanced search across title, author, subject, call number, library, district, year, language, classification, and format filters.",
      inputSchema: AdvancedSearchRequestSchema,
      outputSchema: AdvancedSearchResponseSchema,
    },
    async (arguments_) => {
      const request = AdvancedSearchRequestSchema.parse({
        ...arguments_,
        district_filters: normalizeStringList(arguments_.district_filters),
        library_filters: normalizeStringList(arguments_.library_filters),
        classification_filters: normalizeStringList(
          arguments_.classification_filters,
        ),
        language_filters: normalizeStringList(arguments_.language_filters),
        format_filters: normalizeStringList(arguments_.format_filters),
      });
      const service = new LibrarySearchService();
      const result = await service.searchBooksAdvanced(request);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    "get_record_holdings",
    {
      title: "Record Holdings",
      description:
        "Get holdings for a record id, including branch/library, location, circulation type, and raw status.",
      inputSchema: GetRecordHoldingsInputSchema,
      outputSchema: RecordHoldingsSchema,
    },
    async ({ record_id }) => {
      const service = new LibrarySearchService();
      const result = await service.getRecordHoldings(record_id);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    "batch_search_records",
    {
      title: "Batch Search Records",
      description:
        "Run grouped batch search with optional holdings filters on availability and status fields.",
      inputSchema: BatchSearchInputSchema,
      outputSchema: BatchSearchResponseSchema,
    },
    async ({
      queries,
      max_candidates_per_query,
      include_holdings,
      available_only,
      availability_filters,
      raw_status_filters,
      circulation_type_filters,
    }) => {
      const cleanedQueries = normalizeStringList(queries);
      if (!cleanedQueries.length) {
        throw new Error("queries must contain at least one non-empty item");
      }

      const service = new LibrarySearchService();
      const result = await service.batchSearchRecords({
        queries: cleanedQueries,
        maxCandidatesPerQuery: max_candidates_per_query,
        includeHoldings: include_holdings,
        availableOnly: available_only,
        availabilityFilters: availability_filters,
        rawStatusFilters: raw_status_filters,
        circulationTypeFilters: circulation_type_filters,
      });
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    "find_matching_books",
    {
      title: "Find Matching Books",
      description:
        "Find books for a topic with holdings filtered by availability and raw holdings fields.",
      inputSchema: FindMatchingBooksInputSchema,
      outputSchema: FindMatchingBooksResponseSchema,
    },
    async ({
      topic,
      target_count,
      max_pages,
      max_candidates,
      availability_filters,
      raw_status_filters,
      circulation_type_filters,
    }) => {
      const service = new LibrarySearchService();
      const normalizedRawStatus = normalizeStringList(raw_status_filters);
      const normalizedCirculationType = normalizeStringList(
        circulation_type_filters,
      );
      const shouldOnlyAvailable =
        availability_filters.length === 0 &&
        normalizedRawStatus.length === 0 &&
        normalizedCirculationType.length === 0;

      const startedAt = performance.now();
      const items: BatchSearchItem[] = [];
      const errors: Array<{ record_id: string; error: string }> = [];
      const warnings: string[] = [];
      let scannedCandidates = 0;
      let processedPages = 0;

      for (let page = 1; page <= max_pages; page += 1) {
        processedPages = page;
        const searchResult = await service.searchBooks(topic, page);

        if (!searchResult.items.length) {
          warnings.push(`page ${page} returned no candidates`);
          break;
        }

        for (const record of searchResult.items) {
          if (scannedCandidates >= max_candidates) {
            warnings.push("max_candidates reached before target_count");
            break;
          }

          scannedCandidates += 1;
          try {
            const holdingsResult = await service.getRecordHoldings(
              record.record_id,
            );
            const filteredHoldings = filterHoldings(holdingsResult.holdings, {
              onlyAvailable: shouldOnlyAvailable,
              availabilityFilters: availability_filters,
              rawStatusFilters: normalizedRawStatus,
              circulationTypeFilters: normalizedCirculationType,
            });
            if (!filteredHoldings.length) {
              continue;
            }
            items.push({ record, holdings: filteredHoldings });
          } catch (error) {
            errors.push({
              record_id: record.record_id,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }

          if (items.length >= target_count) {
            break;
          }
        }

        if (
          items.length >= target_count ||
          scannedCandidates >= max_candidates
        ) {
          break;
        }
      }

      const elapsedMs = Number((performance.now() - startedAt).toFixed(2));
      const status = items.length >= target_count ? "fulfilled" : "partial";
      if (status === "partial") {
        warnings.push("target_count not reached within current limits");
      }

      return createJsonToolResult({
        query_context: {
          topic,
          target_count,
          max_pages,
          max_candidates,
          availability_filters,
          raw_status_filters: normalizedRawStatus,
          circulation_type_filters: normalizedCirculationType,
        },
        items,
        availability_summary: {
          matched_books: items.length,
          target_count,
          status,
        },
        errors,
        warnings,
        stats: {
          processed_pages: processedPages,
          scanned_candidates: scannedCandidates,
          returned_items: items.length,
          elapsed_ms: elapsedMs,
        },
      });
    },
  );
}

function registerResources(server: McpServer): void {
  server.registerResource(
    "availability-categories",
    "library://availability-categories",
    {
      title: "Availability Categories",
      description: "Normalized availability categories for holdings filtering.",
      mimeType: "application/json",
    },
    async (uri) =>
      createJsonResourceResult(uri.href, {
        [AvailabilityCategory.AVAILABLE]:
          "Item appears available for borrowing",
        [AvailabilityCategory.NOT_AVAILABLE]:
          "Item currently not available for borrowing",
        [AvailabilityCategory.IN_LIBRARY_ONLY]:
          "Item is likely in-library use only",
        [AvailabilityCategory.UNKNOWN]:
          "Availability cannot be determined reliably",
      }),
  );

  server.registerResource(
    "server-info",
    "library://server-info",
    {
      title: "Server Info",
      description:
        "Version and design summary for the Shanghai Library MCP server.",
      mimeType: "application/json",
    },
    async (uri) =>
      createJsonResourceResult(uri.href, {
        name: SERVER_NAME,
        version: SERVER_VERSION,
        runtime: "node",
        transport: "stdio",
        tool_set: [
          "search_books",
          "get_advanced_search_options",
          "search_books_advanced",
          "get_record_holdings",
          "batch_search_records",
          "find_matching_books",
        ],
      }),
  );

  server.registerResource(
    "advanced-search-options-summary",
    "library://advanced-search-options-summary",
    {
      title: "Advanced Search Summary",
      description: "Compact summary of advanced search facets and districts.",
      mimeType: "application/json",
    },
    async (uri) => {
      const service = new LibrarySearchService();
      const options = await service.getAdvancedSearchOptions();
      return createJsonResourceResult(uri.href, {
        districts: options.districts,
        district_count: options.districts.length,
        classification_filter_count: options.classification_filters.length,
        language_filter_count: options.language_filters.length,
        format_filter_count: options.format_filters.length,
      });
    },
  );
}

function createJsonToolResult<T>(data: T): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: T;
} {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

function createJsonResourceResult(
  uri: string,
  data: unknown,
): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
