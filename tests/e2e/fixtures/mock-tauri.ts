/**
 * Mocks the window.__TAURI_INTERNALS__ and invoke mechanisms.
 * Injected into the browser context before the app loads.
 */
export const mockTauriInitScript = `
  window.__TAURI_INTERNALS__ = {};
  window.__TEST_SQL_LOG__ = [];  // Initialize log
  
  // Mock Storage for persistence
  const mockStorage = new Map();
  
  // Mock IPC Handler
  window.__TAURI__ = {
    core: {
      invoke: async (cmd, args) => {
        console.log("[Tauri Mock] Invoke:", cmd, args);
        
        switch (cmd) {
          case "get_local_ip":
            return "127.0.0.1";
            
          case "get_version":
            return "0.1.8-test";
            
          case "store_credentials":
            mockStorage.set("credentials", args);
            return null;
            
          case "get_credentials":
            return mockStorage.get("credentials") || null;
            
          case "read_dj_history":
          case "read_virtualdj_history":
             // This can be controlled via a dedicated "test-driver" global if needed
             if (window.__TEST_DRIVER_HISTORY__) {
                 // If array (history), return first item or logic
                 // But watcher expects a single track or history?
                 // VirtualDJWatcher expects "HistoryTrack | null" (single object)
                 const history = window.__TEST_DRIVER_HISTORY__;
                 return Array.isArray(history) ? history[0] : history;
             }
             return null;
             
          case "plugin:sql|load":
             return "mock-db-path";

          case "plugin:sql|execute":
             // Extremely basic mock for SQLite execution to prevent crashes
             // In a real robust suite, we'd use better-sqlite3 in-memory
             if (!window.__TEST_SQL_LOG__) window.__TEST_SQL_LOG__ = [];
             window.__TEST_SQL_LOG__.push({ query: args.query, values: args.values });
             // Fix: Return tuple [rowsAffected, lastInsertId] as expected by tauri-plugin-sql
             // See node_modules/@tauri-apps/plugin-sql/dist-js/index.js
             return [1, Date.now()];
             
          case "plugin:sql|select":
             // Mock session select (uuid check)
             if (args.query?.includes("FROM sessions WHERE uuid")) {
                 return [{
                     id: 1,
                     uuid: "mock-uuid",
                     cloud_session_id: "mock-cloud-id",
                     dj_identity: "Default",
                     name: "Test Session",
                     started_at: 1234567890,
                     ended_at: null
                 }];
             }
             // Mock plays select (for verification)
             if (args.query?.includes("FROM plays WHERE session_id")) {
                 return [{
                     id: 1,
                     session_id: 1,
                     track_id: 1,
                     played_at: Date.now() / 1000
                 }];
             }
             return [];

          default:
            console.warn("[Tauri Mock] Unhandled command:", cmd);
            return null;
        }
      }
    },
    // Mock other Tauri APIs if used
    event: {
        emit: async () => {},
        listen: async () => { return () => {} }
    }
  };
  
  // Polyfill internals if accessed directly
  window.__TAURI_INTERNALS__.invoke = window.__TAURI__.core.invoke;
  window.__TAURI_INTERNALS__.transformCallback = (result) => result;
  window.__TAURI_INTERNALS__.metadata = { currentWindow: { label: "main" } };
`;
