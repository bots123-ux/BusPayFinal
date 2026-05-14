/**
 * Global PWA install prompt store.
 * The beforeinstallprompt event fires very early — capture it at module level.
 */
let _prompt: any = null;
let _installed = false;

window.addEventListener("beforeinstallprompt", (e: any) => {
  e.preventDefault();
  _prompt = e;
});

window.addEventListener("appinstalled", () => {
  _installed = true;
  _prompt = null;
});

// Check if already running as standalone PWA
if (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true) {
  _installed = true;
}

export function getInstallPrompt() { return _prompt; }
export function isInstalled() { return _installed; }
export function clearPrompt() { _prompt = null; }
export function setInstalled(v: boolean) { _installed = v; }
