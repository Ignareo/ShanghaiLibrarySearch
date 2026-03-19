import { z } from "zod";

export const AvailabilityCategorySchema = z.enum([
  "available",
  "not_available",
  "in_library_only",
  "unknown",
]);
export type AvailabilityCategory = z.infer<typeof AvailabilityCategorySchema>;

export const AvailabilityCategory = {
  AVAILABLE: "available",
  NOT_AVAILABLE: "not_available",
  IN_LIBRARY_ONLY: "in_library_only",
  UNKNOWN: "unknown",
} as const satisfies Record<string, AvailabilityCategory>;

export const SearchResultItemSchema = z.object({
  record_id: z.string(),
  title: z.string(),
  record_url: z.string().url(),
  authors: z.array(z.string()).default([]),
  published: z.string().nullable().default(null),
  publisher: z.string().nullable().default(null),
  published_year: z.string().nullable().default(null),
  call_number: z.string().nullable().default(null),
  material_type: z.string().nullable().default(null),
});
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  page: z.number().int().min(1),
  total_results: z.number().int().nullable().default(null),
  total_pages: z.number().int().nullable().default(null),
  has_next_page: z.boolean().default(false),
  has_previous_page: z.boolean().default(false),
  items: z.array(SearchResultItemSchema).default([]),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const SearchOptionItemSchema = z.object({
  value: z.string(),
  label: z.string(),
});
export type SearchOptionItem = z.infer<typeof SearchOptionItemSchema>;

export const LibraryOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  library_name: z.string(),
});
export type LibraryOption = z.infer<typeof LibraryOptionSchema>;

export const DistrictLibraryGroupSchema = z.object({
  district: z.string(),
  libraries: z.array(LibraryOptionSchema).default([]),
});
export type DistrictLibraryGroup = z.infer<typeof DistrictLibraryGroupSchema>;

export const AdvancedSearchOptionsResponseSchema = z.object({
  field_types: z.array(SearchOptionItemSchema).default([]),
  districts: z.array(z.string()).default([]),
  libraries_by_district: z.array(DistrictLibraryGroupSchema).default([]),
  classification_filters: z.array(SearchOptionItemSchema).default([]),
  language_filters: z.array(SearchOptionItemSchema).default([]),
  format_filters: z.array(SearchOptionItemSchema).default([]),
});
export type AdvancedSearchOptionsResponse = z.infer<
  typeof AdvancedSearchOptionsResponseSchema
>;

export const AdvancedSearchFieldType = {
  ALL_FIELDS: "AllFields",
  TITLE: "Title",
  AUTHOR: "Author",
  SUBJECT: "Subject",
  CALL_NUMBER: "CallNumber",
  ISSN: "ISSN",
  ISBN: "ISBN",
  PUBLISHER: "publisher",
  PUBLISHER_ADDRESS: "PublisherAddres",
  SERIES: "Series",
  ORDER_NUMBER: "OrderNumber",
  NATIONAL_STANDARD_ATLAS_NUMBER: "NationalStandardAtlasNumber",
} as const;
export type AdvancedSearchFieldType =
  (typeof AdvancedSearchFieldType)[keyof typeof AdvancedSearchFieldType];

const OptionalTextSchema = z.string().trim().min(1).optional();
const YearSchema = z
  .string()
  .regex(/^\d{4}$/u, "publish year must be a four-digit year")
  .optional();

export const AdvancedSearchRequestSchema = z
  .object({
    keyword: OptionalTextSchema,
    title: OptionalTextSchema,
    author: OptionalTextSchema,
    subject: OptionalTextSchema,
    call_number: OptionalTextSchema,
    isbn: OptionalTextSchema,
    issn: OptionalTextSchema,
    publisher: OptionalTextSchema,
    publisher_address: OptionalTextSchema,
    series: OptionalTextSchema,
    district_filters: z.array(z.string()).default([]),
    library_filters: z.array(z.string()).default([]),
    classification_filters: z.array(z.string()).default([]),
    language_filters: z.array(z.string()).default([]),
    format_filters: z.array(z.string()).default([]),
    publish_year_start: YearSchema,
    publish_year_end: YearSchema,
    page: z.number().int().min(1).default(1),
  })
  .superRefine((value, ctx) => {
    const hasTerm = Boolean(
      value.keyword ??
      value.title ??
      value.author ??
      value.subject ??
      value.call_number ??
      value.isbn ??
      value.issn ??
      value.publisher ??
      value.publisher_address ??
      value.series,
    );
    const hasFilter = Boolean(
      value.district_filters.length ||
      value.library_filters.length ||
      value.classification_filters.length ||
      value.language_filters.length ||
      value.format_filters.length ||
      value.publish_year_start ||
      value.publish_year_end,
    );

    if (!hasTerm && !hasFilter) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "advanced search requires at least one search field or filter",
      });
    }

    if (
      value.publish_year_start &&
      value.publish_year_end &&
      value.publish_year_start > value.publish_year_end
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "publish_year_start must be less than or equal to publish_year_end",
      });
    }
  });
export type AdvancedSearchRequest = z.infer<typeof AdvancedSearchRequestSchema>;

export const ResolvedParamSchema = z.object({
  key: z.string(),
  value: z.string(),
});
export type ResolvedParam = z.infer<typeof ResolvedParamSchema>;

export const AdvancedSearchResponseSchema = SearchResponseSchema.extend({
  search_context: z.object({
    mode: z.literal("advanced"),
    request: z.record(z.string(), z.unknown()),
    resolved_params: z.array(ResolvedParamSchema),
  }),
});
export type AdvancedSearchResponse = z.infer<
  typeof AdvancedSearchResponseSchema
>;

export const HoldingItemSchema = z.object({
  branch: z.string().nullable().default(null),
  library: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  call_number: z.string().nullable().default(null),
  barcode: z.string().nullable().default(null),
  circulation_type: z.string().nullable().default(null),
  raw_status: z.string().nullable().default(null),
  availability: AvailabilityCategorySchema.default(
    AvailabilityCategory.UNKNOWN,
  ),
});
export type HoldingItem = z.infer<typeof HoldingItemSchema>;

export const RecordHoldingsSchema = z.object({
  record_id: z.string(),
  title: z.string().nullable().default(null),
  record_url: z.string().url(),
  holdings: z.array(HoldingItemSchema).default([]),
});
export type RecordHoldings = z.infer<typeof RecordHoldingsSchema>;

export const BatchSearchItemSchema = z.object({
  record: SearchResultItemSchema,
  holdings: z.array(HoldingItemSchema).default([]),
});
export type BatchSearchItem = z.infer<typeof BatchSearchItemSchema>;

export const BatchSearchQueryResultSchema = z.object({
  query: z.string(),
  total_candidates: z.number().int().default(0),
  returned_candidates: z.number().int().default(0),
  items: z.array(BatchSearchItemSchema).default([]),
  error: z.string().nullable().default(null),
});
export type BatchSearchQueryResult = z.infer<
  typeof BatchSearchQueryResultSchema
>;

export const BatchSearchSummarySchema = z.object({
  total_queries: z.number().int(),
  successful_queries: z.number().int().default(0),
  empty_queries: z.number().int().default(0),
  failed_queries: z.number().int().default(0),
});
export type BatchSearchSummary = z.infer<typeof BatchSearchSummarySchema>;

export const BatchSearchResponseSchema = z.object({
  summary: BatchSearchSummarySchema,
  results: z.array(BatchSearchQueryResultSchema).default([]),
});
export type BatchSearchResponse = z.infer<typeof BatchSearchResponseSchema>;

export const BatchSearchRequestSchema = z.object({
  queries: z.array(z.string()).min(1),
  max_candidates_per_query: z.number().int().min(1).max(10).default(3),
  include_holdings: z.boolean().default(false),
  available_only: z.boolean().default(false),
  availability_filters: z.array(AvailabilityCategorySchema).default([]),
  raw_status_filters: z.array(z.string()).default([]),
  circulation_type_filters: z.array(z.string()).default([]),
});
export type BatchSearchRequest = z.infer<typeof BatchSearchRequestSchema>;

export const FindMatchingBooksResponseSchema = z.object({
  query_context: z.object({
    topic: z.string(),
    target_count: z.number().int().min(1),
    max_pages: z.number().int().min(1),
    max_candidates: z.number().int().min(1),
    availability_filters: z.array(AvailabilityCategorySchema),
    raw_status_filters: z.array(z.string()),
    circulation_type_filters: z.array(z.string()),
  }),
  items: z.array(BatchSearchItemSchema),
  availability_summary: z.object({
    matched_books: z.number().int().min(0),
    target_count: z.number().int().min(1),
    status: z.enum(["fulfilled", "partial"]),
  }),
  errors: z.array(
    z.object({
      record_id: z.string(),
      error: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
  stats: z.object({
    processed_pages: z.number().int().min(0),
    scanned_candidates: z.number().int().min(0),
    returned_items: z.number().int().min(0),
    elapsed_ms: z.number().min(0),
  }),
});
export type FindMatchingBooksResponse = z.infer<
  typeof FindMatchingBooksResponseSchema
>;
