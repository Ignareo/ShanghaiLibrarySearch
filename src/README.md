# Source Layout

This directory contains the TypeScript implementation of the Shanghai Library MCP server.

## Contents

- `index.ts`: CLI entrypoint that starts the MCP server over stdio.
- `mcp-server.ts`: Official MCP SDK server registration for tools and resources.
- `service.ts`: Search, advanced-search, holdings, and batch orchestration logic.
- `client.ts`: HTTP client for Shanghai Library pages.
- `parsers.ts`: Search-result and holdings HTML parsers.
- `advanced-search.ts`: Advanced-search option parsing and parameter mapping.
- `models.ts`: Shared Zod schemas and domain types.
- `normalization.ts`: Availability and whitespace normalization helpers.
- `config.ts`: Runtime constants and server metadata.
