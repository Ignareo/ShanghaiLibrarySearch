import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SERVER_PATH = new URL("../../dist/index.js", import.meta.url);
const SERVER_FILE_PATH = fileURLToPath(SERVER_PATH);
const KNOWN_RECORD_ID = "3eafb7ae-4d32-485c-9ba6-96cba6561683";

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

async function createConnectedClient(): Promise<{
  client: Client;
  transport: StdioClientTransport;
}> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_FILE_PATH],
    cwd: process.cwd(),
    stderr: "pipe",
    env: {
      ...process.env,
    } as Record<string, string>,
  });

  const client = new Client({
    name: "integration-test-client",
    version: "0.1.0",
  });
  await client.connect(transport);
  return { client, transport };
}

describe("MCP stdio integration", () => {
  it("exposes renamed tools and core resources", async () => {
    const { client, transport } = await createConnectedClient();

    try {
      const tools = await client.listTools();
      const toolNames = new Set(tools.tools.map((tool) => tool.name));
      expect(toolNames.has("search_books")).toBe(true);
      expect(toolNames.has("get_advanced_search_options")).toBe(true);
      expect(toolNames.has("search_books_advanced")).toBe(true);
      expect(toolNames.has("get_record_holdings")).toBe(true);
      expect(toolNames.has("batch_search_records")).toBe(true);
      expect(toolNames.has("find_matching_books")).toBe(true);

      const resources = await client.listResources();
      const uris = new Set(resources.resources.map((resource) => resource.uri));
      expect(uris.has("library://availability-categories")).toBe(true);
      expect(uris.has("library://server-info")).toBe(true);
      expect(uris.has("library://advanced-search-options-summary")).toBe(true);
    } finally {
      await transport.close();
      await client.close();
    }
  });

  it("can execute keyword search, advanced search, holdings, and resources", async () => {
    const { client, transport } = await createConnectedClient();

    try {
      const searchResult = await client.callTool({
        name: "search_books",
        arguments: { query: "金融", page: 1 },
      });
      const searchContent = asRecord(searchResult.structuredContent);
      expect(searchResult.isError).not.toBe(true);
      expect(searchResult.structuredContent).toBeDefined();
      expect(searchContent.query).toBe("金融");
      expect(Array.isArray(searchContent.items)).toBe(true);
      expect((searchContent.items as unknown[]).length).toBeGreaterThan(0);

      const advancedResult = await client.callTool({
        name: "search_books_advanced",
        arguments: {
          title: "Harland Miller - XXX",
          language_filters: ["English"],
          format_filters: ["Book"],
        },
      });
      const advancedContent = asRecord(advancedResult.structuredContent);
      expect(advancedResult.isError).not.toBe(true);
      expect(asRecord(advancedContent.search_context).mode).toBe("advanced");
      expect(Array.isArray(advancedContent.items)).toBe(true);

      const holdingsResult = await client.callTool({
        name: "get_record_holdings",
        arguments: { record_id: KNOWN_RECORD_ID },
      });
      const holdingsContent = asRecord(holdingsResult.structuredContent);
      expect(holdingsResult.isError).not.toBe(true);
      expect(holdingsContent.record_id).toBe(KNOWN_RECORD_ID);
      expect(Array.isArray(holdingsContent.holdings)).toBe(true);
      expect((holdingsContent.holdings as unknown[]).length).toBeGreaterThan(0);

      const matchingResult = await client.callTool({
        name: "find_matching_books",
        arguments: {
          topic: "金融",
          target_count: 1,
          max_pages: 2,
          max_candidates: 5,
        },
      });
      const matchingContent = asRecord(matchingResult.structuredContent);
      expect(matchingResult.isError).not.toBe(true);
      expect(asRecord(matchingContent.query_context).topic).toBe("金融");
      expect(asRecord(matchingContent.availability_summary).target_count).toBe(
        1,
      );

      const resourceResult = await client.readResource({
        uri: "library://server-info",
      });
      const firstResource = resourceResult.contents[0];
      expect(
        firstResource && "text" in firstResource ? firstResource.text : "",
      ).toContain("shanghai-library-mcp");
    } finally {
      await transport.close();
      await client.close();
    }
  });
});
