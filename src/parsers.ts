import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";

import { BASE_URL } from "./config.js";
import {
  type HoldingItem,
  type RecordHoldings,
  RecordHoldingsSchema,
  type SearchResponse,
  SearchResponseSchema,
  type SearchResultItem,
} from "./models.js";
import { classifyAvailability, normalizeWhitespace } from "./normalization.js";

const RECORD_ID_PATTERN = /\/Record\/([0-9a-fA-F-]+)/u;
const HOLDING_LINE_PATTERN =
  /(?:Call Number|索书号):\s*(?<call_number>.*?)(?:\s+(?:barcode|条码号):\s*(?<barcode>\S+))?\s+(?:Circulation Type|借阅类型):\s*(?<circulation_type>.*?)\s+(?:Circulation Status|当前状态):\s*(?<status>.*)/iu;
const SKIP_TITLES = new Set([
  "save to list",
  "email this",
  "export record",
  "cite this",
  "封面仅供参考",
]);
const TOTAL_RESULTS_PATTERN = /共\s*([\d,]+)\s*条/u;
const LAST_PAGE_PATTERN = /^\[(\d+)\]$/u;

export function parseSearchResults(
  html: string,
  query: string,
  page = 1,
  baseUrl = BASE_URL,
): SearchResponse {
  const $ = load(html);
  const items: SearchResultItem[] = [];
  const seenRecordIds = new Set<string>();

  $("div.result-body").each((_, element) => {
    const resultBody = $(element);
    const anchor = resultBody.find("a.title.getFull[href]").first();
    const href = anchor.attr("href");
    if (!href) {
      return;
    }

    const match = RECORD_ID_PATTERN.exec(href);
    if (!match) {
      return;
    }

    const recordId = match[1];
    if (!recordId) {
      return;
    }
    if (seenRecordIds.has(recordId)) {
      return;
    }

    const title = normalizeWhitespace(anchor.text())
      .replace(/^\/+|\/+$/gu, "")
      .trim();
    if (
      !title ||
      SKIP_TITLES.has(title.toLocaleLowerCase()) ||
      title.length <= 1
    ) {
      return;
    }

    seenRecordIds.add(recordId);
    const metadata = extractSearchMetadata($, resultBody);
    items.push({
      record_id: recordId,
      title,
      record_url: new URL(`/Record/${recordId}`, baseUrl).toString(),
      authors: metadata.authors,
      published: metadata.published,
      publisher: metadata.publisher,
      published_year: metadata.published_year,
      call_number: metadata.call_number,
      material_type: metadata.material_type,
    });
  });

  const pagination = extractPaginationMetadata($, page);
  return SearchResponseSchema.parse({
    query,
    page: pagination.current_page,
    total_results: pagination.total_results,
    total_pages: pagination.total_pages,
    has_next_page: pagination.has_next_page,
    has_previous_page: pagination.has_previous_page,
    items,
  });
}

export function parseRecordHoldings(
  html: string,
  recordId: string,
  baseUrl = BASE_URL,
  recordHtml?: string,
): RecordHoldings {
  const $ = load(html);
  const title = extractRecordTitle(recordHtml) ?? extractTitle($);
  const parsedFromTables = parseHoldingsTables($);

  if (parsedFromTables.length) {
    return RecordHoldingsSchema.parse({
      record_id: recordId,
      title,
      record_url: new URL(`/Record/${recordId}`, baseUrl).toString(),
      holdings: parsedFromTables,
    });
  }

  const textChunks = $.root()
    .text()
    .split(/\n+/u)
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);

  let currentBranch: string | null = null;
  let currentLocation: string | null = null;
  const holdings: HoldingItem[] = [];

  for (const text of textChunks) {
    if (text.startsWith("Branch:") || text.startsWith("所属馆:")) {
      currentBranch = text.split(":", 2)[1]?.trim() ?? null;
      currentLocation = null;
      continue;
    }

    if (
      (text.includes("Call Number:") || text.includes("索书号:")) &&
      (text.includes("Circulation Status:") || text.includes("当前状态:"))
    ) {
      const parsed = parseHoldingLine(text, currentBranch, currentLocation);
      if (parsed) {
        holdings.push(parsed);
      }
      continue;
    }

    if (currentBranch && !currentLocation && looksLikeLocationLine(text)) {
      currentLocation = text;
    }
  }

  return RecordHoldingsSchema.parse({
    record_id: recordId,
    title,
    record_url: new URL(`/Record/${recordId}`, baseUrl).toString(),
    holdings,
  });
}

function parseHoldingsTables($: CheerioAPI): HoldingItem[] {
  const holdings: HoldingItem[] = [];

  $("h2").each((_, element) => {
    const branchHeader = $(element);
    const branchText = normalizeWhitespace(branchHeader.text());
    if (!branchText.startsWith("Branch:")) {
      return;
    }

    const branch = branchText.split(":", 2)[1]?.trim() ?? null;
    let sibling = branchHeader.next();
    while (sibling.length) {
      if (sibling.is("h2")) {
        break;
      }
      if (sibling.is("div.location-item")) {
        const location =
          normalizeWhitespace(sibling.find("h3").first().text()) || null;
        sibling.find("tr[vocab='http://schema.org/']").each((__, row) => {
          const parsed = parseHoldingRow($(row), branch, location);
          if (parsed) {
            holdings.push(parsed);
          }
        });
      }
      sibling = sibling.next();
    }
  });

  return holdings;
}

function extractTitle($: CheerioAPI): string | null {
  for (const selector of ["h3", "h2", "title"]) {
    const text = normalizeWhitespace($(selector).first().text())
      .replace(/^\/+|\/+$/gu, "")
      .trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function extractRecordTitle(recordHtml: string | undefined): string | null {
  if (!recordHtml) {
    return null;
  }

  const $ = load(recordHtml);
  for (const selector of [".media-body h3", ".mainbody h3", "h3", "title"]) {
    const text = normalizeWhitespace($(selector).first().text())
      .replace(/^\/+|\/+$/gu, "")
      .trim();
    if (text && text !== "馆藏书目查询系统 - 上海图书馆") {
      return text;
    }
  }
  return null;
}

function extractPaginationMetadata(
  $: CheerioAPI,
  page: number,
): {
  current_page: number;
  total_results: number | null;
  total_pages: number | null;
  has_next_page: boolean;
  has_previous_page: boolean;
} {
  const totalResults = extractTotalResults($);
  const totalPages = extractTotalPages($);

  let currentPage = page;
  const activeText = normalizeWhitespace(
    $("ul.pagination li.active").first().text(),
  );
  if (/^\d+$/u.test(activeText)) {
    currentPage = Number(activeText);
  }

  let hasNextPage = $("ul.pagination a.page-next").length > 0;
  const hasPreviousPage = currentPage > 1;
  if (totalPages !== null) {
    hasNextPage = currentPage < totalPages;
  }

  return {
    current_page: currentPage,
    total_results: totalResults,
    total_pages: totalPages,
    has_next_page: hasNextPage,
    has_previous_page: hasPreviousPage,
  };
}

function extractTotalResults($: CheerioAPI): number | null {
  const statsText = normalizeWhitespace($(".search-stats").first().text());
  const match = TOTAL_RESULTS_PATTERN.exec(statsText);
  const total = match?.[1];
  return total ? Number(total.replaceAll(",", "")) : null;
}

function extractTotalPages($: CheerioAPI): number | null {
  const lastPageText = normalizeWhitespace(
    $("ul.pagination a[href*='page=']").last().text(),
  );
  const lastMatch = LAST_PAGE_PATTERN.exec(lastPageText);
  if (lastMatch) {
    return Number(lastMatch[1]);
  }

  let maxPage: number | null = null;
  $("ul.pagination li, ul.pagination a, ul.pagination span").each(
    (_, element) => {
      const text = normalizeWhitespace($(element).text());
      if (/^\d+$/u.test(text)) {
        maxPage = Math.max(maxPage ?? 0, Number(text));
        return;
      }
      const match = LAST_PAGE_PATTERN.exec(text);
      if (match) {
        maxPage = Math.max(maxPage ?? 0, Number(match[1]));
      }
    },
  );

  return maxPage;
}

function extractSearchMetadata(
  $: CheerioAPI,
  resultBody: Cheerio<AnyNode>,
): {
  authors: string[];
  published: string | null;
  publisher: string | null;
  published_year: string | null;
  call_number: string | null;
  material_type: string | null;
} {
  const metadataBlock = getSearchMetadataBlock($, resultBody);
  const authors = extractAuthors(metadataBlock);
  const publisher = extractMetadataValue(metadataBlock, "出版社");
  const publishedYear = extractMetadataValue(metadataBlock, "出版时间");
  const callNumber = extractMetadataValue(metadataBlock, "索书号");
  const materialType = extractMaterialType(resultBody);
  const publishedParts = [publisher, publishedYear].filter(
    (part): part is string => Boolean(part),
  );

  return {
    authors,
    published: publishedParts.length ? publishedParts.join(" | ") : null,
    publisher,
    published_year: publishedYear,
    call_number: callNumber,
    material_type: materialType,
  };
}

function getSearchMetadataBlock(
  $: CheerioAPI,
  resultBody: Cheerio<AnyNode>,
): Cheerio<AnyNode> | null {
  const children = resultBody.children("div");
  for (const child of children.toArray()) {
    const element = $(child);
    const classes = new Set(
      (child.attribs.class ?? "").split(/\s+/u).filter(Boolean),
    );
    if (
      classes.has("callnumAndLocation") ||
      classes.has("result-formats") ||
      classes.has("result-previews") ||
      element.find("a.title.getFull[href]").length > 0
    ) {
      continue;
    }
    return element;
  }
  return null;
}

function extractAuthors(metadataBlock: Cheerio<AnyNode> | null): string[] {
  if (!metadataBlock) {
    return [];
  }

  const authors: string[] = [];
  metadataBlock.find("span.author-data").each((_, element) => {
    const authorBlock = load(element);
    const linkedAuthors = authorBlock("a")
      .toArray()
      .map((anchor) => normalizeWhitespace(authorBlock(anchor).text()))
      .filter(Boolean);

    if (linkedAuthors.length) {
      for (const author of linkedAuthors) {
        if (!authors.includes(author)) {
          authors.push(author);
        }
      }
      return;
    }

    for (const text of authorBlock.root().text().split(/\n+/u)) {
      const normalized = normalizeWhitespace(text);
      if (!normalized || /^\(.*\)$/u.test(normalized)) {
        continue;
      }
      if (!authors.includes(normalized)) {
        authors.push(normalized);
      }
    }
  });
  return authors;
}

function extractMetadataValue(
  metadataBlock: Cheerio<AnyNode> | null,
  label: string,
): string | null {
  if (!metadataBlock) {
    return null;
  }

  const pattern = new RegExp(`^${escapeRegExp(label)}\\s*:\\s*(.+)$`, "u");
  for (const text of metadataBlock.text().split(/\n+/u)) {
    const normalized = normalizeWhitespace(text);
    const match = pattern.exec(normalized);
    const value = match?.[1];
    if (value) {
      return value.trim() || null;
    }
  }
  return null;
}

function extractMaterialType(resultBody: Cheerio<AnyNode>): string | null {
  const text = normalizeWhitespace(
    resultBody.find("div.result-formats span.format").first().text(),
  );
  return text || null;
}

function looksLikeLocationLine(text: string): boolean {
  const lowered = text.toLocaleLowerCase();
  if (text.startsWith("上海图书馆")) {
    return true;
  }
  const disallowedMarkers = [
    "call number:",
    "索书号:",
    "circulation status:",
    "当前状态:",
    "circulation type:",
    "借阅类型:",
    "holdings",
    "related book recommendations",
    "full description",
  ];
  return (
    !disallowedMarkers.some((marker) => lowered.includes(marker)) &&
    text.length > 3
  );
}

function parseHoldingLine(
  text: string,
  branch: string | null,
  location: string | null,
): HoldingItem | null {
  const match = HOLDING_LINE_PATTERN.exec(text);
  if (!match?.groups) {
    return null;
  }

  const callNumber =
    normalizeWhitespace(match.groups.call_number ?? "") || null;
  const barcode = normalizeWhitespace(match.groups.barcode ?? "") || null;
  const circulationType =
    normalizeWhitespace(match.groups.circulation_type ?? "") || null;
  const rawStatus = normalizeWhitespace(match.groups.status ?? "") || null;

  return {
    branch,
    library: branch,
    location,
    call_number: callNumber,
    barcode,
    circulation_type: circulationType,
    raw_status: rawStatus,
    availability: classifyAvailability(rawStatus, circulationType),
  };
}

function parseHoldingRow(
  row: Cheerio<AnyNode>,
  branch: string | null,
  location: string | null,
): HoldingItem | null {
  const columns = row.find("td").toArray();
  if (columns.length < 4) {
    return null;
  }

  const [
    callNumberColumn,
    barcodeColumn,
    circulationTypeColumn,
    rawStatusColumn,
  ] = columns;
  if (
    !callNumberColumn ||
    !barcodeColumn ||
    !circulationTypeColumn ||
    !rawStatusColumn
  ) {
    return null;
  }
  const callNumber = normalizeWhitespace(load(callNumberColumn).text()) || null;
  const barcode = normalizeWhitespace(load(barcodeColumn).text()) || null;
  const circulationType =
    normalizeWhitespace(load(circulationTypeColumn).text()) || null;
  const rawStatus = normalizeWhitespace(load(rawStatusColumn).text()) || null;

  return {
    branch,
    library: branch,
    location,
    call_number: callNumber,
    barcode,
    circulation_type: circulationType,
    raw_status: rawStatus,
    availability: classifyAvailability(rawStatus, circulationType),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
