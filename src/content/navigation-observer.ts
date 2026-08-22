export function observeYouTubeNavigation(onNavigate: (url: string) => void) {
  let currentUrl = location.href;
  let scheduled = 0;
  const check = () => {
    clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      if (location.href === currentUrl) return;
      currentUrl = location.href;
      onNavigate(currentUrl);
    }, 50);
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function (...args) { originalPushState.apply(this, args); check(); };
  history.replaceState = function (...args) { originalReplaceState.apply(this, args); check(); };
  window.addEventListener("yt-navigate-finish", check);
  window.addEventListener("popstate", check);

  const observer = new MutationObserver(check);
  observer.observe(document.body || document.documentElement, { childList: true, subtree: false });

  return () => {
    clearTimeout(scheduled);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener("yt-navigate-finish", check);
    window.removeEventListener("popstate", check);
    observer.disconnect();
  };
}

export function isValidWatchRoute(url = new URL(location.href)) {
  return url.pathname === "/watch" && Boolean(url.searchParams.get("v")?.trim());
}

export function isTrackableVideoRoute(url = new URL(location.href)) {
  return isValidWatchRoute(url)
    || (url.pathname.startsWith("/shorts/") && Boolean(url.pathname.split("/").filter(Boolean)[1]?.trim()));
}

export function currentTrackableVideoElement() {
  if (location.pathname.startsWith("/shorts/")) {
    return document.querySelector<HTMLVideoElement>("ytd-reel-video-renderer[is-active] video.html5-main-video, ytd-reel-video-renderer[aria-hidden='false'] video.html5-main-video")
      ?? document.querySelector<HTMLVideoElement>("video.html5-main-video");
  }
  return document.querySelector<HTMLVideoElement>("video.html5-main-video");
}

export async function waitForVideoElement(timeoutMs = 15_000): Promise<HTMLVideoElement | null> {
  const existing = currentTrackableVideoElement();
  if (existing) return existing;
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
    const observer = new MutationObserver(() => {
      const video = currentTrackableVideoElement();
      if (video) {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(video);
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true });
  });
}
