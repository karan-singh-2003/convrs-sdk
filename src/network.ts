
// src/web/network.ts
function createFetchNetworkAdapter() {
  return {
    async isConnected() {
      return true;
    },
    onConnectionChange(callback: (isConnected: boolean) => void) {
      const handleOnline = () => callback(true);
      const handleOffline = () => callback(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  };
}
