# Shanghai Library MCP

A TypeScript-native MCP server for the public Shanghai Library catalog. It exposes structured tools for keyword search, advanced search, holdings lookup, batch search, and topic-based matching so MCP hosts such as Claude Code, VS Code, and Cherry Studio can query the catalog directly.

## Overview

This project is a local MCP server that adapts a public HTML-based catalog into stable, structured MCP tools.

- **Runtime**: Node.js + TypeScript
- **Protocol**: MCP
- **Default transport**: `stdio`
- **Distribution**: `npm` / `npx`
- **Data source**: public Shanghai Library catalog pages

Typical use cases:

- Search catalog records by keyword from an AI client
- Combine title, author, subject, district, library, year, and format filters with advanced search
- Retrieve holdings and normalized availability for a known record
- Run grouped batch queries with optional holdings filters
- Find candidate books around a topic with availability constraints

## Features

### 1. Keyword Search

Returns structured search results including title, authors, publisher, publication year, call number, material type, and pagination metadata.

### 2. Advanced Search

Supports title, author, subject, call number, ISBN, ISSN, publisher, publication place, publication year range, district filters, library filters, classification filters, language filters, and format filters.

### 3. Holdings Lookup

Fetches holdings for a `record_id`, including branch, location, call number, circulation type, raw status, and normalized availability.

### 4. Batch Search

Executes multiple queries in one request and can optionally attach holdings plus availability-based filtering.

### 5. Topic Matching

Scans result pages for a topic and returns better-fit candidate books using holdings-based filtering.

## Architecture

The server follows a fetch → parse → orchestrate → expose pattern:

- `src/index.ts`: CLI entrypoint that starts the MCP server
- `src/mcp-server.ts`: registers MCP tools and resources, validates input and output boundaries
- `src/service.ts`: orchestrates search, advanced search, holdings, batch search, and matching flows
- `src/client.ts`: performs HTTP requests against the Shanghai Library site
- `src/parsers.ts`: parses search and holdings HTML
- `src/advanced-search.ts`: discovers advanced-search options and builds request parameters
- `src/models.ts`: shared Zod schemas and domain contracts

Key design goals:

1. Keep the external MCP contract stable while adapting to an HTML source site
2. Discover advanced-search facets dynamically instead of hardcoding site catalogs
3. Normalize holdings status into stable availability categories
4. Return structured data that AI hosts can consume directly

## MCP Interface

### Tools

| Tool                          | Purpose                                          | Main inputs                                              |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `search_books`                | Search catalog records by keyword                | `query`, `page`                                          |
| `get_advanced_search_options` | Fetch current advanced-search option metadata    | `refresh`                                                |
| `search_books_advanced`       | Run structured advanced search                   | title, author, subject, year, classification, library... |
| `get_record_holdings`         | Retrieve holdings for one catalog record         | `record_id`                                              |
| `batch_search_records`        | Run grouped batch search with optional filtering | `queries`, `include_holdings`, `available_only`, ...     |
| `find_matching_books`         | Find candidate books for a topic                 | `topic`, `target_count`, `availability_filters`, ...     |

### Resources

| Resource                                    | Purpose                                   |
| ------------------------------------------- | ----------------------------------------- |
| `library://availability-categories`         | Describes normalized availability values  |
| `library://server-info`                     | Server version, runtime, transport, tools |
| `library://advanced-search-options-summary` | Compact advanced-search options summary   |

## Requirements

- Node.js `20.18.1+`
- npm / npx

## Local Development

Install dependencies and run the validation suite:

```bash
npm install
npm run build
npm run test
npm run format:check
```

Run in development mode:

```bash
npx tsx src/index.ts
```

Run the built server:

```bash
node dist/index.js
```

## Install and Run

Recommended zero-install usage:

```bash
npx -y shanghai-library-mcp
```

Optional global install for repeated CLI use:

```bash
npm install -g shanghai-library-mcp
shanghai-library-mcp
```

Install as a project dependency only when you want to run it from a specific workspace:

```bash
npm install shanghai-library-mcp
npx shanghai-library-mcp
```

`npm install shanghai-library-mcp` is a local install and writes to the current directory's `node_modules`, so run it inside a project folder rather than a system directory such as `C:\Windows\System32`.

## Publish and npx Usage

Recommended post-publish startup command:

```bash
npx -y shanghai-library-mcp
```

Run the full pre-publish checks:

```bash
npm run check
npm run pack:dry-run
npm publish --dry-run
```

Publish publicly to npm:

```bash
npm publish
```

After publishing, users can launch the server directly with `npx -y shanghai-library-mcp`.

## MCP Host Setup

### Claude Code

Windows:

```powershell
claude mcp add --transport stdio --scope project shanghai-library-search -- cmd /c npx -y shanghai-library-mcp
```

macOS / Linux / WSL:

```bash
claude mcp add --transport stdio --scope project shanghai-library-search -- npx -y shanghai-library-mcp
```

### VS Code

Add this to `.vscode/mcp.json`:

```json
{
  "servers": {
    "shanghaiLibrarySearch": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "shanghai-library-mcp"]
    }
  }
}
```

### Cherry Studio

Import this configuration:

```json
{
  "mcpServers": {
    "shanghai-library-search": {
      "name": "Shanghai Library Search",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "shanghai-library-mcp"],
      "env": {}
    }
  }
}
```

## Result Shape

The server returns structured data rather than raw page fragments:

- search results include record metadata and pagination
- holdings include raw status plus normalized `availability`
- advanced search returns structured option catalogs and resolved request parameters
- batch and matching flows include summaries, warnings, errors, and matched items

## Project Structure

```text
src/     TypeScript source for the MCP server, services, client, parsers, and schemas
tests/   Live integration tests
```

## License

MIT
