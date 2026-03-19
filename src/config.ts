export const SERVER_NAME = "shanghai-library-mcp";
export const SERVER_VERSION = "0.1.0";
export const BASE_URL = "https://vufind.library.sh.cn";
export const DEFAULT_LANGUAGE = "zh-cn";
export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_READ_TIMEOUT_MS = 35_000;
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
export const HOLDINGS_SUCCESS_MARKERS = [
  "Call Number",
  "Circulation Status",
  "barcode",
] as const;
