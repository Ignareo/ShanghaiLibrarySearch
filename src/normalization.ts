import { AvailabilityCategory } from "./models.js";

export function normalizeWhitespace(value: string): string {
  return value.split(/\s+/u).filter(Boolean).join(" ");
}

export function normalizeStringList(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  const normalized: string[] = [];
  for (const value of values) {
    const cleaned = normalizeWhitespace(value).trim();
    if (cleaned && !normalized.includes(cleaned)) {
      normalized.push(cleaned);
    }
  }
  return normalized;
}

export function classifyAvailability(
  rawStatus: string | null | undefined,
  circulationType?: string | null,
): AvailabilityCategory {
  const statusText = normalizeWhitespace(rawStatus ?? "").toLowerCase();
  const circulationText = normalizeWhitespace(
    circulationType ?? "",
  ).toLowerCase();
  const combined = `${statusText} ${circulationText}`.trim();

  if (!combined) {
    return AvailabilityCategory.UNKNOWN;
  }

  const inLibraryMarkers = [
    "in-library",
    "in library",
    "馆内",
    "仅供阅览",
    "阅览",
    "reference",
  ];
  const notAvailableMarkers = [
    "checked out",
    "on loan",
    "borrowed",
    "not for borrowing",
    "cataloging",
    "processing",
    "预约",
    "借出",
    "处理中",
    "不可借",
    "暂不可借",
  ];
  const availableMarkers = ["available", "可借", "在架", "shelf"];

  if (inLibraryMarkers.some((marker) => combined.includes(marker))) {
    return AvailabilityCategory.IN_LIBRARY_ONLY;
  }
  if (notAvailableMarkers.some((marker) => combined.includes(marker))) {
    return AvailabilityCategory.NOT_AVAILABLE;
  }
  if (availableMarkers.some((marker) => combined.includes(marker))) {
    return AvailabilityCategory.AVAILABLE;
  }
  return AvailabilityCategory.UNKNOWN;
}
