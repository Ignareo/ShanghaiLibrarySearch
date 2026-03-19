#!/usr/bin/env node

import { startStdioServer } from "./mcp-server.js";

startStdioServer().catch((error: unknown) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
