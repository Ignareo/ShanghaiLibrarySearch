import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";

import {
  AdvancedSearchFieldType,
  type AdvancedSearchOptionsResponse,
  AdvancedSearchOptionsResponseSchema,
  type AdvancedSearchRequest,
  type DistrictLibraryGroup,
  type LibraryOption,
  type SearchOptionItem,
} from "./models.js";
import { normalizeStringList, normalizeWhitespace } from "./normalization.js";

const COLLECTION_PLACE_PATTERN = /var\s+collection_place\s*=\s*(\[.*?\]);/su;
const LIBRARY_PREFIX = "library_name:";

interface RawDistrictLibrary {
  display?: boolean;
  displayname?: string;
  libraryname?: string;
  branches?: RawDistrictLibrary[];
}

interface RawDistrictGroup {
  disName?: string;
  disLibrary?: RawDistrictLibrary[];
}

export function parseAdvancedSearchOptions(
  html: string,
): AdvancedSearchOptionsResponse {
  const $ = load(html);
  const fieldTypes = parseSelectOptions($('select[name="type0[]"]').first());
  const classificationFilters = parseSelectOptions(
    $("#limit_callnumber-first").first(),
  );
  const languageFilters = parseSelectOptions($("#limit_language").first());
  const formatFilters = parseSelectOptions($("#limit_format").first());
  const librariesByDistrict = parseDistrictLibraryGroups(html);

  return AdvancedSearchOptionsResponseSchema.parse({
    field_types: fieldTypes,
    districts: librariesByDistrict.map((group) => group.district),
    libraries_by_district: librariesByDistrict,
    classification_filters: classificationFilters,
    language_filters: languageFilters,
    format_filters: formatFilters,
  });
}

export function buildAdvancedSearchParams(
  request: AdvancedSearchRequest,
  options: AdvancedSearchOptionsResponse,
): Array<[string, string]> {
  const params: Array<[string, string]> = [["join", "AND"]];
  const terms = buildSearchTerms(request);

  for (const [fieldType, value] of terms) {
    params.push(["lookfor0[]", value]);
    params.push(["type0[]", fieldType]);
  }

  for (let index = 0; index < Math.max(0, terms.length - 1); index += 1) {
    params.push(["bool0[]", "AND"]);
  }

  const districtLibraryFilters = resolveDistrictFilters(
    request.district_filters,
    options,
  );
  const explicitLibraryFilters = resolveOptionValues(
    request.library_filters,
    iterateLibraryOptions(options),
  );

  for (const value of deduplicatePreserveOrder([
    ...districtLibraryFilters,
    ...explicitLibraryFilters,
  ])) {
    params.push(["filter[]", value]);
  }

  for (const value of resolveOptionValues(
    request.classification_filters,
    options.classification_filters,
  )) {
    params.push(["filter[]", value]);
  }
  for (const value of resolveOptionValues(
    request.language_filters,
    options.language_filters,
  )) {
    params.push(["filter[]", value]);
  }
  for (const value of resolveOptionValues(
    request.format_filters,
    options.format_filters,
  )) {
    params.push(["filter[]", value]);
  }

  if (request.publish_year_start || request.publish_year_end) {
    params.push(["daterange[]", "publishDate"]);
    if (request.publish_year_start) {
      params.push(["publishDatefrom", request.publish_year_start]);
    }
    if (request.publish_year_end) {
      params.push(["publishDateto", request.publish_year_end]);
    }
  }

  return params;
}

export function summarizeAdvancedSearch(
  request: AdvancedSearchRequest,
): string {
  const parts: string[] = [];
  const labelledFields: Array<[string, string | undefined]> = [
    ["keyword", request.keyword],
    ["title", request.title],
    ["author", request.author],
    ["subject", request.subject],
    ["call_number", request.call_number],
    ["isbn", request.isbn],
    ["issn", request.issn],
    ["publisher", request.publisher],
    ["publisher_address", request.publisher_address],
    ["series", request.series],
  ];

  for (const [label, value] of labelledFields) {
    if (value) {
      parts.push(`${label}:${value}`);
    }
  }
  if (request.district_filters.length) {
    parts.push(`districts:${request.district_filters.join(",")}`);
  }
  if (request.library_filters.length) {
    parts.push(`libraries:${request.library_filters.join(",")}`);
  }
  if (request.language_filters.length) {
    parts.push(`languages:${request.language_filters.join(",")}`);
  }
  if (request.classification_filters.length) {
    parts.push(`classifications:${request.classification_filters.join(",")}`);
  }
  if (request.format_filters.length) {
    parts.push(`formats:${request.format_filters.join(",")}`);
  }
  if (request.publish_year_start || request.publish_year_end) {
    parts.push(
      `publish_year:${request.publish_year_start ?? ""}-${request.publish_year_end ?? ""}`,
    );
  }

  return parts.length ? parts.join(" | ") : "advanced_search";
}

function buildSearchTerms(
  request: AdvancedSearchRequest,
): Array<[string, string]> {
  const fieldMap: Array<[string | undefined, string]> = [
    [request.keyword, AdvancedSearchFieldType.ALL_FIELDS],
    [request.title, AdvancedSearchFieldType.TITLE],
    [request.author, AdvancedSearchFieldType.AUTHOR],
    [request.subject, AdvancedSearchFieldType.SUBJECT],
    [request.call_number, AdvancedSearchFieldType.CALL_NUMBER],
    [request.isbn, AdvancedSearchFieldType.ISBN],
    [request.issn, AdvancedSearchFieldType.ISSN],
    [request.publisher, AdvancedSearchFieldType.PUBLISHER],
    [request.publisher_address, AdvancedSearchFieldType.PUBLISHER_ADDRESS],
    [request.series, AdvancedSearchFieldType.SERIES],
  ];

  return fieldMap.filter((entry): entry is [string, string] =>
    Boolean(entry[0]),
  );
}

function parseSelectOptions(selectTag: Cheerio<AnyNode>): SearchOptionItem[] {
  const options: SearchOptionItem[] = [];
  selectTag.find("option").each((_: number, option: AnyNode) => {
    const optionNode = load(option);
    const value = normalizeWhitespace(
      optionNode("option").attr("value") ??
        optionNode.root().attr("value") ??
        "",
    );
    const label = normalizeWhitespace(optionNode.text());
    if (value && label) {
      options.push({ value, label });
    }
  });
  return options;
}

function parseDistrictLibraryGroups(html: string): DistrictLibraryGroup[] {
  const match = COLLECTION_PLACE_PATTERN.exec(html);
  if (!match) {
    return [];
  }

  const rawJson = match[1];
  if (!rawJson) {
    return [];
  }

  const rawData = JSON.parse(rawJson) as RawDistrictGroup[];
  const groups: DistrictLibraryGroup[] = [];

  for (const district of rawData) {
    const districtName = normalizeWhitespace(district.disName ?? "");
    if (!districtName) {
      continue;
    }

    const seenValues = new Set<string>();
    const libraries: LibraryOption[] = [];

    for (const library of district.disLibrary ?? []) {
      if (library.display) {
        const option = buildLibraryOption(
          library.displayname,
          library.libraryname,
        );
        if (option && !seenValues.has(option.value)) {
          seenValues.add(option.value);
          libraries.push(option);
        }
      }

      for (const branch of library.branches ?? []) {
        if (!branch.display) {
          continue;
        }
        const option = buildLibraryOption(
          branch.displayname,
          branch.libraryname,
        );
        if (option && !seenValues.has(option.value)) {
          seenValues.add(option.value);
          libraries.push(option);
        }
      }
    }

    groups.push({ district: districtName, libraries });
  }

  return groups;
}

function buildLibraryOption(
  displayName: string | undefined,
  libraryName: string | undefined,
): LibraryOption | null {
  const normalizedLibraryName = normalizeWhitespace(libraryName ?? "");
  if (!normalizedLibraryName) {
    return null;
  }

  return {
    value: `${LIBRARY_PREFIX}${normalizedLibraryName}`,
    label: normalizeWhitespace(displayName ?? normalizedLibraryName),
    library_name: normalizedLibraryName,
  };
}

function resolveDistrictFilters(
  requestedDistricts: string[],
  options: AdvancedSearchOptionsResponse,
): string[] {
  const normalizedDistricts = normalizeStringList(requestedDistricts);
  if (!normalizedDistricts.length) {
    return [];
  }

  const districtMap = new Map(
    options.libraries_by_district.map((group) => [
      group.district.toLocaleLowerCase(),
      group,
    ]),
  );
  const resolved: string[] = [];

  for (const district of normalizedDistricts) {
    const group = districtMap.get(district.toLocaleLowerCase());
    if (!group) {
      throw new Error(`unknown district filter: ${district}`);
    }
    resolved.push(...group.libraries.map((option) => option.value));
  }

  return deduplicatePreserveOrder(resolved);
}

function resolveOptionValues(
  requestedValues: string[],
  availableOptions: Iterable<SearchOptionItem | LibraryOption>,
): string[] {
  const requested = normalizeStringList(requestedValues);
  if (!requested.length) {
    return [];
  }

  const options = Array.from(availableOptions);
  const resolved: string[] = [];

  for (const requestValue of requested) {
    const matched = matchOptionValue(requestValue, options);
    if (!matched) {
      throw new Error(`unknown advanced search option: ${requestValue}`);
    }
    resolved.push(matched);
  }

  return deduplicatePreserveOrder(resolved);
}

function matchOptionValue(
  requested: string,
  options: Array<SearchOptionItem | LibraryOption>,
): string | null {
  const requestedCasefold = requested.toLocaleLowerCase();

  for (const option of options) {
    const candidates = new Set<string>([
      option.value.toLocaleLowerCase(),
      option.label.toLocaleLowerCase(),
    ]);

    if ("library_name" in option) {
      candidates.add(option.library_name.toLocaleLowerCase());
      candidates.add(
        option.value.replace(LIBRARY_PREFIX, "").toLocaleLowerCase(),
      );
    }

    const quoted = extractQuotedValue(option.value);
    if (quoted) {
      candidates.add(quoted.toLocaleLowerCase());
    }

    if (candidates.has(requestedCasefold)) {
      return option.value;
    }
  }

  return null;
}

function extractQuotedValue(value: string): string | null {
  const match = /"([^"]+)"/u.exec(value);
  const quotedValue = match?.[1];
  return quotedValue ? normalizeWhitespace(quotedValue) : null;
}

function* iterateLibraryOptions(
  options: AdvancedSearchOptionsResponse,
): IterableIterator<LibraryOption> {
  for (const group of options.libraries_by_district) {
    for (const option of group.libraries) {
      yield option;
    }
  }
}

function deduplicatePreserveOrder(values: string[]): string[] {
  return [...new Set(values)];
}
