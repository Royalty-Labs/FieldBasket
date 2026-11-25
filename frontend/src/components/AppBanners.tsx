import { useEffect, useState, useSyncExternalStore } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "fieldbasket.install-dismissed";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Offline notice, "new version" prompt and the Android install offer. */
export function AppBanners() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(readDismissed);

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    }
    function onInstalled() {
      setInstallEvent(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismissInstall() {
    setInstallDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private browsing: the offer simply comes back next visit.
    }
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return (
    <div className="app-banners" aria-live="polite">
      {!online && (
        <div className="app-banner app-banner--offline" role="status">
          You're offline. Saved produce is still visible; orders need a connection.
        </div>
      )}
      {needRefresh && (
        <div className="app-banner">
          <span>A new version of FieldBasket is ready.</span>
          <button className="app-banner__action" onClick={() => updateServiceWorker(true)}>
            Refresh
          </button>
        </div>
      )}
      {installEvent && !installDismissed && !needRefresh && (
        <div className="app-banner">
          <span>Add FieldBasket to your home screen for quick access.</span>
          <span className="app-banner__buttons">
            <button className="app-banner__action" onClick={install}>
              Install
            </button>
            <button className="app-banner__close" aria-label="Not now" onClick={dismissInstall}>
              ×
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
