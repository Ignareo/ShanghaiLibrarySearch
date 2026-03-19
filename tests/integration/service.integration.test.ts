import { LibrarySearchService } from "../../src/service.js";
import { describe, expect, it } from "vitest";

const KNOWN_RECORD_ID = "3eafb7ae-4d32-485c-9ba6-96cba6561683";

describe("LibrarySearchService integration", () => {
  it("returns search candidates with pagination metadata", async () => {
    const service = new LibrarySearchService();
    const result = await service.searchBooks("金融");

    expect(result.query).toBe("金融");
    expect(result.total_pages).not.toBeNull();
    expect((result.total_pages ?? 0) >= 1).toBe(true);
    expect(result.has_next_page).toBe(true);
    expect(result.has_previous_page).toBe(false);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]?.record_id).toBeTruthy();
    expect(result.items[0]?.authors.length).toBeGreaterThan(0);
  });

  it("returns holdings for the known record", async () => {
    const service = new LibrarySearchService();
    const result = await service.getRecordHoldings(KNOWN_RECORD_ID);

    expect(result.record_id).toBe(KNOWN_RECORD_ID);
    expect(result.title).toBe("Harland Miller - XXX");
    expect(result.holdings.length).toBeGreaterThan(0);
    expect(result.holdings.some((item) => Boolean(item.call_number))).toBe(
      true,
    );
  });
});
