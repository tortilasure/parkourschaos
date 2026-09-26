/**
 * CrazyGames HTML5 SDK v2 wrapper.
 * Ads ONLY work inside Crazy Games (real SDK). No Netlify fallback overlays.
 * - midgame: every N finished rounds
 * - rewarded: coins only if adFinished (no skip reward)
 */

type AdType = "midgame" | "rewarded";

export type AdCallbacks = {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
};

type CrazySDK = {
  ad: {
    requestAd: (type: AdType, callbacks: AdCallbacks) => void;
    hasAdblock?: (cb: (err: unknown, result: boolean) => void) => void;
  };
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    happytime?: () => void;
    loadingStart?: () => void;
    loadingStop?: () => void;
  };
  init?: () => Promise<void>;
};

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazySDK };
  }
}

const SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v2.js";

/** Midgame interstitial after this many finished rounds */
export const ROUNDS_PER_MIDROLL = 3;

let loadPromise: Promise<CrazySDK | null> | null = null;
let available = false;
let gameplayActive = false;
let pendingStart = false;
let sdkReady: CrazySDK | null = null;

export function isCrazyGamesAvailable(): boolean {
  return available && !!getSDK()?.ad?.requestAd;
}

export function loadCrazyGamesSDK(): Promise<CrazySDK | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (sdkReady) return Promise.resolve(sdkReady);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const done = async (sdk: CrazySDK | null) => {
      if (!sdk) {
        resolve(null);
        return;
      }
      try {
        if (typeof sdk.init === "function") await sdk.init();
      } catch { /* */ }
      available = true;
      sdkReady = sdk;
      if (pendingStart) {
        pendingStart = false;
        try {
          sdk.game.gameplayStart();
          gameplayActive = true;
        } catch { /* */ }
      }
      resolve(sdk);
    };

    if (window.CrazyGames?.SDK) {
      void done(window.CrazyGames.SDK);
      return;
    }
    const existing = document.querySelector(`script[src="${SDK_URL}"]`);
    if (existing) {
      let tries = 0;
      const check = () => {
        if (window.CrazyGames?.SDK) void done(window.CrazyGames.SDK);
        else if (tries++ < 50) setTimeout(check, 100);
        else resolve(null);
      };
      check();
      return;
    }
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => void done(window.CrazyGames?.SDK ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return loadPromise;
}

function getSDK(): CrazySDK | null {
  return sdkReady ?? window.CrazyGames?.SDK ?? null;
}

export function gameplayStart() {
  const sdk = getSDK();
  if (!sdk?.game?.gameplayStart) {
    pendingStart = true;
    void loadCrazyGamesSDK();
    return;
  }
  if (gameplayActive) return;
  try {
    sdk.game.gameplayStart();
    gameplayActive = true;
    pendingStart = false;
  } catch {
    /* outside CrazyGames */
  }
}

export function gameplayStop() {
  if (!gameplayActive) return;
  const sdk = getSDK();
  if (!sdk?.game?.gameplayStop) return;
  try {
    sdk.game.gameplayStop();
    gameplayActive = false;
  } catch {
    /* */
  }
}

/**
 * Request a real CrazyGames ad. No fake overlays on Netlify.
 * Resolves "unavailable" when not on Crazy Games / no fill.
 */
export function requestAd(
  type: AdType,
  opts: {
    onMute?: () => void;
    onUnmute?: () => void;
  } = {},
): Promise<"finished" | "error" | "unavailable"> {
  return new Promise((resolve) => {
    const run = (sdk: CrazySDK | null) => {
      if (!sdk?.ad?.requestAd) {
        resolve("unavailable");
        return;
      }

      gameplayStop();
      let settled = false;
      const done = (r: "finished" | "error" | "unavailable") => {
        if (settled) return;
        settled = true;
        try {
          opts.onUnmute?.();
        } catch { /* */ }
        resolve(r);
      };

      try {
        sdk.ad.requestAd(type, {
          adStarted: () => {
            try {
              opts.onMute?.();
            } catch { /* */ }
          },
          // Only "finished" means the player watched enough — used for rewarded coins
          adFinished: () => done("finished"),
          adError: () => done("error"),
        });
      } catch {
        done("unavailable");
      }
    };

    const existing = getSDK();
    if (existing) {
      run(existing);
      return;
    }
    void loadCrazyGamesSDK().then(run);
  });
}

export async function requestMidgameAd(opts?: {
  onMute?: () => void;
  onUnmute?: () => void;
}): Promise<"finished" | "error" | "unavailable"> {
  return requestAd("midgame", opts);
}

export async function requestRewardedAd(opts?: {
  onMute?: () => void;
  onUnmute?: () => void;
}): Promise<"finished" | "error" | "unavailable"> {
  return requestAd("rewarded", opts);
}
