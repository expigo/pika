export {};

declare global {
  interface Window {
    __TAURI_INTERNALS__: any;
    __TAURI__: any;
    __TEST_DRIVER_HISTORY__: any[];
    __TEST_SQL_LOG__: { query: string; values: any[] }[];
  }
}
