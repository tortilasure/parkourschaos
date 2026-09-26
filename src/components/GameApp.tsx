"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type FinishResult, type HudState, type RoomInfo } from "@/game/engine";
import { sfx } from "@/game/audio";
import {
  ACHIEVEMENTS, BOT_DIFF_ICON, EMOJI_PACKS, FREE_BODY_COLORS, NICK_COLOR_PRICE, NICK_COLORS, QUALITY_PRESETS, SHOP, achName, defaultProfile, fmtTime, itemName,
  mergeProfile, nextColorPrice, rarityLabel, RARITY_COLOR, weeklyChallengeLabel, type BotDiff, type CaseDef, type CaseResult, type Profile, type Settings, type Stats,
} from "@/game/data";
import { SECTION_TYPES } from "@/game/course";
import { SECTION_COUNT } from "@/game/course";
import { detectLang, setLang, t, type Lang } from "@/game/i18n";
import {
  loadCrazyGamesSDK, gameplayStart, gameplayStop,
  requestMidgameAd, requestRewardedAd, ROUNDS_PER_MIDROLL, isCrazyGamesAvailable,
} from "@/lib/crazygames";
import {
  AchievementsModal, AuthModal, Btn, CaseOpenOverlay, CreateLobbyModal, LeaderboardModal, LobbyBrowserModal,
  ProfileModal, ReactionOverlay, ResultsModal, SettingsModal, ShopModal, addScore, miniValueText, type ScoreKey,
} from "./Menus";

const REWARD_COINS = 50;
const AD_REWARD_CD_MS = 30_000;
const AD_REWARD_LS_KEY = "rpm_ad_reward_at";

type ModalKind = "shop" | "profile" | "ach" | "settings" | "board" | "browse" | "create" | "auth" | "practice" | "trade" | null;
interface Popup { id: number; text: string; color: string; big: boolean; }
interface Toast { id: number; text: string; icon: string; }
interface User { id: number; username: string; profile: unknown; }

let popupId = 1;

function pEquippedAbility(p: Profile) {
  const id = p.equipped?.ability ?? "ab_hit";
  if (id !== "ab_hit" && !p.owned.includes(id)) return "ab_hit";
  return id;
}
function lookFrom(p: Profile) {
  return {
    color: p.color, hat: p.equipped.hat, skin: p.equipped.skin, footprint: p.equipped.footprint,
    landing: p.equipped.landing, death: p.equipped.death, aura: p.equipped.aura, trail: p.equipped.trail,
  };
}
function loadLocalSettings(): Partial<Settings> {
  try {
    const raw = JSON.parse(localStorage.getItem("rpm_settings") || "{}") as Partial<Settings>;
    if (raw.quality && !QUALITY_PRESETS[raw.quality]) delete raw.quality;
    return raw;
  } catch { return {}; }
}

export default function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [started, setStarted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [profile, setProfile] = useState<Profile>(() => {
    const p = defaultProfile();
    const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    p.settings = { ...p.settings, quality: isMobile ? "low" : "high", lang: detectLang(), ...loadLocalSettings() };
    setLang(p.settings.lang as Lang);
    return p;
  });
  const profileRef = useRef(profile);
  const [name, setName] = useState("Guest");
  const nameRef = useRef(name);
  const [hud, setHud] = useState<HudState | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<ModalKind>(null);
  const [results, setResults] = useState<{ r: FinishResult; best: boolean; rank: number; submitMsg: string } | null>(null);
  const [reaction, setReaction] = useState(false);
  const [openCase, setOpenCase] = useState<CaseDef | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<{ id: number; from: string; text: string }[]>([]);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineList, setOnlineList] = useState<{ id: string; name: string; registered: boolean }[]>([]);
  const chatId = useRef(1);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [adBusy, setAdBusy] = useState(false);
  const [adCdLeft, setAdCdLeft] = useState(0);
  const roundsSinceAd = useRef(0);
  const [isTouch, setIsTouch] = useState(false);
  const [menuOpen, setMenuOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const saveTimer = useRef<number | null>(null);

  // ---------- helpers
  const popup = useCallback((text: string, color = "#ffffff", big = false) => {
    const id = popupId++;
    setPopups((p) => [...p.slice(-4), { id, text, color, big }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), big ? 1000 : 1550);
  }, []);
  const toast = useCallback((text: string, icon = "💬") => {
    const id = popupId++;
    setToasts((x) => [...x.slice(-3), { id, text, icon }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 3300);
  }, []);

  const scheduleSave = useCallback(() => {
    localStorage.setItem("rpm_settings", JSON.stringify(profileRef.current.settings));
    if (!userRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: profileRef.current }) });
    }, 1500);
  }, []);

  const mutate = useCallback((fn: (p: Profile) => Profile) => {
    let next = fn(profileRef.current);
    const newly = ACHIEVEMENTS.filter((a) => !next.achievements.includes(a.id) && a.value(next.stats) >= a.goal);
    if (newly.length) {
      const reward = newly.reduce((s, a) => s + a.reward, 0);
      next = { ...next, achievements: [...next.achievements, ...newly.map((a) => a.id)], coins: next.coins + reward, stats: { ...next.stats, coinsEarned: next.stats.coinsEarned + reward } };
      for (const a of newly) toast(t("toast.achievement", { n: achName(a), c: a.reward }), a.icon);
      sfx.achievement();
    }
    profileRef.current = next;
    setProfile(next);
    scheduleSave();
  }, [scheduleSave, toast]);

  const addStat = useCallback((key: keyof Stats, n: number) => {
    mutate((p) => ({ ...p, stats: { ...p.stats, [key]: (p.stats[key] as number) + n } }));
  }, [mutate]);

  // ---------- engine callbacks kept fresh via ref
  const onFinish = (r: FinishResult) => {
    gameplayStop();
    // Count every finished race once (solo/ta/weekly/multi) toward midroll
    roundsSinceAd.current += 1;
    let best = false, rank = 0;
    mutate((p) => {
      const s = { ...p.stats };
      if (r.mode === "multi") {
        s.matches++;
        if (!r.dnf && r.place === 1) { s.wins++; s.winStreak++; s.bestStreak = Math.max(s.bestStreak, s.winStreak); }
        else s.winStreak = 0;
        if (!r.dnf && r.place <= 3) s.podiums++;
      } else if (r.mode === "solo" && !r.dnf) {
        s.soloRuns++;
        if (!s.soloBest || r.timeMs < s.soloBest) s.soloBest = r.timeMs;
      } else if (r.mode === "ta" && !r.dnf) {
        s.taRuns++;
        if (!s.taBest || r.timeMs < s.taBest) s.taBest = r.timeMs;
      }
      s.coinsEarned += r.coins;
      return { ...p, coins: p.coins + r.coins, stats: s };
    });
    if (!r.dnf && (r.mode === "solo" || r.mode === "ta")) {
      const res = addScore(r.mode as ScoreKey, r.timeMs, nameRef.current);
      best = res.best; rank = res.rank;
    }
    sfx.coin();
    setResults({ r, best, rank, submitMsg: "" });
    if (r.mode === "ta" && !r.dnf) {
      if (userRef.current) {
        fetch("/api/leaderboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeMs: r.timeMs }) })
          .then((x) => x.json())
          .then((j: { improved?: boolean; error?: string }) => setResults((cur) => cur && { ...cur, submitMsg: j.error ? j.error : j.improved ? t("res.improved") : t("res.submitted") }))
          .catch(() => {});
      } else {
        setResults((cur) => cur && { ...cur, submitMsg: t("res.loginForTop") });
      }
    }
    if (r.mode === "weekly" && !r.dnf) {
      const wname = `W:${weeklyChallengeLabel()}:${nameRef.current}`.slice(0, 16);
      fetch("/api/miniboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: wname, timeMs: r.timeMs }) }).catch(() => {});
      setResults((cur) => cur && { ...cur, submitMsg: t("board.weekly") });
    }
  };
  const onMini = (key: string, v: number) => {
    const label = t(`mini.${key}`);
    const value = miniValueText(key, v);
    const res = addScore(key as ScoreKey, v, nameRef.current);
    const coins = res.best ? 15 : 5;
    mutate((p) => ({ ...p, coins: p.coins + coins, stats: { ...p.stats, minigames: p.stats.minigames + 1, coinsEarned: p.stats.coinsEarned + coins } }));
    popup(`${label}: ${value}${res.best ? ` ${t("pop.record")}` : ""}`, res.best ? "#ffe14d" : "#ffffff");
    toast(t("toast.mini", { n: label, v: value, c: coins }), res.best ? "🏆" : "🎮");
  };
  const handlers = useRef({ onFinish, onMini });
  handlers.current = { onFinish, onMini };

  const muteForAd = useCallback(() => {
    sfx.setVolume(0);
  }, []);
  const unmuteAfterAd = useCallback(() => {
    sfx.setVolume(profileRef.current.settings.volume);
  }, []);

  /** Show midgame ad every ROUNDS_PER_MIDROLL finished rounds (not during play, not on entry). */
  const maybeMidroll = useCallback(async (): Promise<void> => {
    if (adBusy) return;
    // Threshold counted in onFinish — show ad only every N finished rounds
    if (roundsSinceAd.current < ROUNDS_PER_MIDROLL) return;
    await loadCrazyGamesSDK();
    if (!isCrazyGamesAvailable()) {
      // Outside Crazy Games: no ads
      return;
    }
    roundsSinceAd.current = 0;
    setAdBusy(true);
    toast(t("ad.midroll"), "📺");
    await requestMidgameAd({ onMute: muteForAd, onUnmute: unmuteAfterAd });
    setAdBusy(false);
  }, [adBusy, muteForAd, unmuteAfterAd, toast]);

  const watchAdForCoins = useCallback(async () => {
    if (adBusy) return;
    const last = Number(localStorage.getItem(AD_REWARD_LS_KEY) || 0);
    const left = AD_REWARD_CD_MS - (Date.now() - last);
    if (left > 0) {
      setAdCdLeft(Math.ceil(left / 1000));
      toast(t("ad.cooldown", { n: Math.ceil(left / 1000) }), "⏳");
      return;
    }
    await loadCrazyGamesSDK();
    if (!isCrazyGamesAvailable()) {
      toast(t("ad.rewardFail"), "📺");
      return;
    }
    setAdBusy(true);
    const result = await requestRewardedAd({ onMute: muteForAd, onUnmute: unmuteAfterAd });
    setAdBusy(false);
    // Coins ONLY if player finished the ad (no skip)
    if (result === "finished") {
      localStorage.setItem(AD_REWARD_LS_KEY, String(Date.now()));
      setAdCdLeft(30);
      mutate((p) => ({
        ...p,
        coins: p.coins + REWARD_COINS,
        stats: { ...p.stats, coinsEarned: p.stats.coinsEarned + REWARD_COINS },
      }));
      sfx.coin();
      toast(t("ad.rewardOk"), "🪙");
    } else {
      toast(t("ad.rewardFail"), "📺");
    }
  }, [adBusy, muteForAd, unmuteAfterAd, mutate, toast]);

  // Tick rewarded-ad cooldown display
  useEffect(() => {
    const tick = () => {
      const last = Number(localStorage.getItem(AD_REWARD_LS_KEY) || 0);
      const left = Math.max(0, Math.ceil((AD_REWARD_CD_MS - (Date.now() - last)) / 1000));
      setAdCdLeft(left);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Load CrazyGames SDK (no ad on entry)
  useEffect(() => {
    void loadCrazyGamesSDK();
  }, []);

  // Pause / results / modal → stop gameplay signal for ads pacing
  useEffect(() => {
    if (pauseOpen || results || modal) gameplayStop();
  }, [pauseOpen, results, modal]);

  // ---------- boot
  useEffect(() => {
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
    let pid = localStorage.getItem("rpm_pid");
    if (!pid) { pid = Math.random().toString(36).slice(2, 12); localStorage.setItem("rpm_pid", pid); }
    let nm = localStorage.getItem("rpm_name");
    if (!nm) { nm = `Guest${Math.floor(1000 + Math.random() * 9000)}`; localStorage.setItem("rpm_name", nm); }
    setName(nm); nameRef.current = nm;
    const p = profileRef.current;
    const eng = new Engine(canvasRef.current!, {
      pid, name: nm, look: lookFrom(p), quality: p.settings.quality,
      cb: {
        hud: (h) => setHud(h),
        popup: (text, c, b) => popup(text, c, b),
        stat: (k, n) => addStat(k, n),
        finish: (r) => handlers.current.onFinish(r),
        reaction: () => { engineRef.current?.input.exitLock(); setReaction(true); },
        mini: (n, v) => handlers.current.onMini(n, v),
        toast: (m) => toast(m),
        matchStarted: () => { setModal(null); setResults(null); setReaction(false); toast(t("toast.matchFound"), "🏁"); gameplayStart(); },
        practice: () => setModal("practice"),
        chat: (from, text) => {
          const id = chatId.current++;
          setChatLog((prev) => [...prev.slice(-40), { id, from, text }]);
        },
      },
    });
    engineRef.current = eng;
    (window as unknown as { __rpm?: Engine }).__rpm = eng;
    fetch("/api/auth")
      .then(async (r) => {
        const text = await r.text();
        if (!text) return;
        try {
          const j = JSON.parse(text) as { user: User | null };
          if (j.user) applyUser(j.user);
        } catch { /* ignore empty / non-JSON */ }
      })
      .catch(() => {});
    return () => { eng.dispose(); engineRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyUser = (u: User) => {
    userRef.current = u;
    setUser(u);
    const hasProfile = u.profile && typeof u.profile === "object" && Object.keys(u.profile as object).length > 0;
    const prof = hasProfile ? mergeProfile(u.profile) : profileRef.current;
    if (hasProfile) { prof.settings.lang = profileRef.current.settings.lang; setLang(prof.settings.lang as Lang); }
    profileRef.current = prof;
    setProfile(prof);
    setName(u.username); nameRef.current = u.username;
    engineRef.current?.setName(u.username);
    engineRef.current?.relocalize();
    if (!hasProfile) scheduleSave();
  };

  // settings → engine (audio + full performance block)
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    const s = profile.settings;
    sfx.setVolume(s.volume);
    sfx.setMusic(s.music);
    e.applyPerf(s);
    e.setVisuals?.(s.skyTheme ?? "day", s.weather ?? "clear");
    e.activeAbility = pEquippedAbility(profileRef.current);
  }, [profile.settings, profile.equipped]);
  const lastLang = useRef(profile.settings.lang);
  useEffect(() => {
    if (lastLang.current !== profile.settings.lang) {
      lastLang.current = profile.settings.lang;
      setLang(profile.settings.lang as Lang);
      engineRef.current?.relocalize();
    }
  }, [profile.settings.lang]);
  useEffect(() => { engineRef.current?.setLook(lookFrom(profile)); }, [profile.color, profile.equipped]); // eslint-disable-line react-hooks/exhaustive-deps

  const pack = EMOJI_PACKS[profile.equipped.emoji] ?? EMOJI_PACKS.em_basic;
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.emojiSlot = (i) => { if (pack[i]) e.emoji(pack[i]); };
  }, [pack]);

  useEffect(() => { engineRef.current?.setPaused(pauseOpen); }, [pauseOpen]);
  useEffect(() => {
    const id = setInterval(() => {
      const e = engineRef.current;
      if (e?.onlineList) setOnlineList(e.onlineList);
    }, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.input.enabled = !modal && !results && !reaction && !pauseOpen && started;
    if (!e.input.enabled) e.input.exitLock();
  }, [modal, results, reaction, pauseOpen, started]);

  const mode = hud?.mode ?? "hub";
  const inRace = mode !== "hub";

  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === "INPUT" || (ev.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (!started) { if (ev.code === "Enter" || ev.code === "Space") startGame(); return; }
      if (ev.code === "Enter" && !modal && !results && !chatOpen) {
        ev.preventDefault();
        setChatOpen(true);
        return;
      }
      if (ev.code === "Escape" && chatOpen) { setChatOpen(false); return; }
      // T — toggle mouse cursor (unlock pointer so UI menus are clickable)
      if (ev.code === "KeyT" && started && !chatOpen) {
        const inp = engineRef.current?.input;
        if (inp) {
          if (inp.locked) inp.exitLock();
          else {
            try {
              const canvas = document.querySelector("canvas");
              void canvas?.requestPointerLock();
            } catch { /* */ }
          }
        }
        return;
      }
      if ((ev.code === "Escape" || ev.code === "KeyP") && inRace && !results && !modal) setPauseOpen((o) => !o);
      if (ev.code === "KeyR" && (mode === "solo" || mode === "ta") && !results && !modal) restart();
      if (ev.code === "KeyO" && !modal && started) setOnlineOpen((o) => !o);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- actions
  const startGame = async () => {
    sfx.unlock();
    if (!user) {
      const nm = (nameRef.current || "Guest").trim().slice(0, 16);
      try {
        const r = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "checkName", username: nm, password: "xxxx" }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          toast(j.error || t("auth.nameTaken"), "🚫");
          return;
        }
      } catch { /* allow offline */ }
      localStorage.setItem("rpm_name", nm);
      nameRef.current = nm;
      setName(nm);
      engineRef.current?.setName(nm);
    }
    setStarted(true);
    // Ensure SDK is ready so CrazyGames detects first gameplayStart
    await loadCrazyGamesSDK();
    gameplayStart();
  };
  const leaveRoom = () => engineRef.current?.setRoom(null);
  const startSolo = () => { leaveRoom(); setModal(null); setResults(null); setPauseOpen(false); engineRef.current?.startSolo(); gameplayStart(); };
  const startTA = () => { leaveRoom(); setModal(null); setResults(null); setPauseOpen(false); engineRef.current?.startTA(); gameplayStart(); };
  const leaveResults = async (next: () => void) => {
    setResults(null);
    setPauseOpen(false);
    await maybeMidroll();
    next();
  };
  const restart = () => { void leaveResults(() => { engineRef.current?.restart(); gameplayStart(); }); };
  const toHub = () => { void leaveResults(() => { leaveRoom(); engineRef.current?.enterHub(); gameplayStart(); }); };
  const quickPlay = async () => {
    const e = engineRef.current;
    if (!e) return;
    try {
      const j = await e.post({ op: "quick" });
      e.setRoom((j as { room: RoomInfo }).room);
      toast(t("toast.searching"), "🌍");
    } catch (err) { toast((err as Error).message, "⚠️"); }
  };
  const openCaseNow = (def: CaseDef) => {
    if (profileRef.current.coins < def.price) { toast(t("case.noCoins"), "🪙"); return; }
    mutate((p) => ({ ...p, coins: p.coins - def.price }));
    sfx.buy();
    setOpenCase(def);
  };
  const caseResult = (res: CaseResult) => {
    mutate((p) => {
      if (res.color) {
        if (res.duplicate) {
          return { ...p, coins: p.coins + res.refund, stats: { ...p.stats, coinsEarned: p.stats.coinsEarned + res.refund } };
        }
        toast(t("case.colorDrop"), "🎨");
        return {
          ...p,
          unlockedColors: Array.from(new Set([...(p.unlockedColors ?? FREE_BODY_COLORS), res.color!])),
          color: res.color!,
        };
      }
      if (!res.item) return p;
      if (res.duplicate) {
        return { ...p, coins: p.coins + res.refund, stats: { ...p.stats, coinsEarned: p.stats.coinsEarned + res.refund } };
      }
      return { ...p, owned: p.owned.includes(res.item.id) ? p.owned : [...p.owned, res.item.id] };
    });
  };
  const createRoom = async (o: { name: string; maxPlayers: number; isPublic: boolean; botCount: number; botDiff: BotDiff; sectionMin: number; sectionMax: number }) => {
    const e = engineRef.current!;
    const j = await e.post({
      op: "create", roomName: o.name, maxPlayers: o.maxPlayers, isPublic: o.isPublic,
      botCount: o.botCount, botDiff: o.botDiff, sectionMin: o.sectionMin, sectionMax: o.sectionMax,
    });
    e.setRoom((j as { room: RoomInfo }).room);
    setModal(null);
  };
  const joinRoom = async (code: string) => {
    const e = engineRef.current!;
    const j = await e.post({ op: "join", code });
    e.setRoom((j as { room: RoomInfo }).room);
    setModal(null);
    toast(t("toast.inLobby"), "🎉");
  };
  const listRooms = async () => (await engineRef.current!.post({ op: "list" }) as { rooms: RoomInfo[] }).rooms;
  const setBots = async (count: number, diff: BotDiff) => {
    const e = engineRef.current!;
    if (!e.room) return;
    try {
      const j = await e.post({ op: "bots", roomId: e.room.id, botCount: count, botDiff: diff });
      e.room = (j as { room: RoomInfo }).room;
    } catch (err) { toast((err as Error).message, "⚠️"); }
  };
  const hostStart = async (fillBots: boolean) => {
    const e = engineRef.current!;
    if (!e.room) return;
    try { await e.post({ op: "start", roomId: e.room.id, fillBots }); } catch (err) { toast((err as Error).message, "⚠️"); }
  };
  const buy = (id: string) => {
    const it = SHOP.find((s) => s.id === id);
    if (!it || profileRef.current.coins < it.price) return;
    sfx.buy();
    mutate((p) => ({ ...p, coins: p.coins - it.price, owned: [...p.owned, id], equipped: { ...p.equipped, [it.cat]: id } }));
    toast(t("toast.bought", { n: itemName(it.id) }), it.icon);
  };
  const equip = (id: string) => {
    const it = SHOP.find((s) => s.id === id);
    if (!it) return;
    mutate((p) => ({ ...p, equipped: { ...p.equipped, [it.cat]: id } }));
  };
  const auth = async (m: "login" | "register", u: string, pw: string) => {
    const r = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: m, username: u, password: pw, profile: profileRef.current }),
    });
    const text = await r.text();
    let j: { error?: string; user?: User } = {};
    try {
      j = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Ошибка сервера (пустой ответ). Проверьте DATABASE_URL и таблицы в Supabase.");
    }
    if (!r.ok) throw new Error(j.error || "Error");
    if (!j.user) throw new Error("Ошибка сервера: нет данных пользователя");
    applyUser(j.user);
    setModal(null);
    toast(m === "login" ? t("toast.welcome", { n: j.user.username }) : t("toast.accCreated"), "✅");
  };
  const logout = async () => {
    await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    userRef.current = null;
    setUser(null);
    const p = defaultProfile();
    p.settings = profileRef.current.settings;
    profileRef.current = p;
    setProfile(p);
    const nm = localStorage.getItem("rpm_name") || "Guest";
    setName(nm); nameRef.current = nm;
    engineRef.current?.setName(nm);
    setModal(null);
    toast(t("toast.loggedOut"), "👋");
  };

  const room = hud?.room ?? null;
  const pid = typeof window !== "undefined" ? localStorage.getItem("rpm_pid") : "";
  const isHost = room?.hostId === pid;
  const respawning = !!hud && hud.respawn > 0 && mode !== "hub";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1b1440]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      <BlindOverlay engine={engineRef} />

      {/* Chat log */}
      {started && (
        <div className="pointer-events-none absolute bottom-24 left-3 z-30 flex max-h-40 w-72 flex-col justify-end gap-1 overflow-hidden">
          {chatLog.slice(-6).map((m) => (
            <div key={m.id} className="rounded-lg bg-[#1b1440]/75 px-2 py-1 text-sm text-white backdrop-blur">
              <span className="font-black text-[#ffd23f]">{m.from}:</span> {m.text}
            </div>
          ))}
        </div>
      )}
      {chatOpen && (
        <div className="absolute bottom-16 left-3 z-40 flex w-[min(90vw,20rem)] gap-2">
          <input
            autoFocus
            value={chatInput}
            maxLength={120}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const msg = chatInput.trim();
                if (msg) engineRef.current?.sendChat(msg);
                setChatInput("");
                setChatOpen(false);
              }
              if (e.key === "Escape") setChatOpen(false);
            }}
            placeholder={t("chat.placeholder")}
            className="flex-1 rounded-xl border-2 border-[#7b5cff] bg-[#1b1440]/95 px-3 py-2 text-sm font-bold text-white outline-none"
          />
        </div>
      )}
      {/* Online players */}
      {started && (
        <button
          onClick={() => setOnlineOpen((o) => !o)}
          className="pointer-events-auto absolute right-3 top-20 z-30 rounded-xl bg-[#1b1440]/80 px-3 py-1.5 text-xs font-black text-white backdrop-blur"
        >
          👥 {Math.max(onlineList.length, hud?.online || 1)}
        </button>
      )}
      {onlineOpen && started && (
        <div className="absolute right-3 top-32 z-40 max-h-64 w-56 overflow-y-auto rounded-2xl bg-[#1b1440]/95 p-3 text-white shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between text-sm font-black">
            <span>{t("online.title")}</span>
            <button onClick={() => setOnlineOpen(false)} className="text-white/60">✕</button>
          </div>
          <div className="space-y-1">
            {(onlineList.length ? onlineList : [{ id: "me", name, registered: !!user }]).map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5 text-sm">
                <span className="truncate font-bold">{p.name}</span>
                <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${p.registered || (p.id === "me" && user) ? "bg-[#06d6a0]/30 text-[#7dffb0]" : "bg-white/10 text-white/50"}`}>
                  {p.registered || (p.id === "me" && user) ? t("online.reg") : t("online.guest")}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-white/40">{t("online.hint")}</div>
        </div>
      )}


      <div className="pointer-events-none absolute inset-0 z-20">
        {popups.map((p, i) =>
          p.big ? (
            <div key={p.id} className="bigpop-anim stroke-text absolute left-1/2 top-[40%] text-8xl font-black md:text-9xl" style={{ color: p.color }}>{p.text}</div>
          ) : (
            <div key={p.id} className="popup-anim stroke-text absolute left-1/2 whitespace-nowrap text-2xl font-black md:text-4xl" style={{ color: p.color, top: `${22 + (i % 5) * 7}%` }}>{p.text}</div>
          ),
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-3 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((x) => (
          <div key={x.id} className="toast-anim flex items-center gap-2 rounded-2xl bg-[#1b1440]/90 px-4 py-2 font-extrabold text-white shadow-xl ring-2 ring-[#ffd23f]">
            <span className="text-2xl">{x.icon}</span>{x.text}
          </div>
        ))}
      </div>

      {started && hud && (
        <>
          {/* top bar */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-2 md:p-3">
            <div className="pointer-events-auto flex items-center gap-2">
              {mode === "hub" ? (
                <div className="rounded-2xl bg-[#1b1440]/70 px-3 py-1.5 text-white backdrop-blur">
                  <div className="game-title text-lg leading-none md:text-2xl">{t("app.title")}</div>
                  <div className="text-xs font-bold text-[#7dffb0]">{t("hud.online", { n: Math.max(1, hud.online), s: SECTION_COUNT })}</div>
                </div>
              ) : (
                <button onClick={() => setPauseOpen(true)} className="btn-candy bg-[#7b5cff] px-3 py-2 text-xl">⏸</button>
              )}
            </div>
            {inRace && (
              <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 text-center">
                <div className="stroke-text font-mono text-4xl font-black text-white md:text-5xl">{fmtTime(Math.max(0.001, hud.time * 1000))}</div>
                <div className="mt-1 rounded-full bg-[#1b1440]/70 px-4 py-1 text-sm font-extrabold text-white backdrop-blur">
                  {t("hud.section", { a: hud.section, b: hud.sectionCount })} · <span className="text-[#ffd23f]">{hud.sectionName}</span>
                </div>
                <div className="mx-auto mt-1 h-2.5 w-56 overflow-hidden rounded-full bg-black/40">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#7dffb0] to-[#ffd23f] transition-all" style={{ width: `${((hud.section - 1) / Math.max(1, hud.sectionCount)) * 100}%` }} />
                </div>
                {mode === "ta" && profile.stats.taBest > 0 && <div className="mt-1 text-xs font-bold text-white/80">{t("hud.record", { t: fmtTime(profile.stats.taBest) })}</div>}
                {hud.combo > 1 && <div className="stroke-text mt-1 text-xl font-black text-[#ffe14d]">{t("hud.combo", { n: hud.combo })}</div>}
              </div>
            )}
            <div className="pointer-events-auto flex items-center gap-2">
              {profile.settings.showFps && <div className="rounded-lg bg-black/50 px-2 py-1 font-mono text-xs text-white">{hud.fps} FPS</div>}
              <div className="rounded-full bg-[#1b1440]/75 px-3 py-1.5 text-lg font-black text-[#ffd23f] backdrop-blur">🪙 {profile.coins}</div>
              {mode === "hub" && (
                <button onClick={() => setModal(user ? "profile" : "auth")} className="btn-candy bg-[#06d6a0] px-3 py-1.5 text-sm">
                  {user ? `👤 ${user.username}` : t("ui.login")}
                </button>
              )}
            </div>
          </div>

          {/* small course minimap — purely informational, doesn't affect gameplay */}
          {inRace && (
            <div className="pointer-events-none absolute right-2 top-16 z-10 flex flex-col items-center gap-1 md:right-3 md:top-20">
              <span className="text-xs">🏁</span>
              <div className="relative h-32 w-3 overflow-hidden rounded-full bg-[#1b1440]/55 backdrop-blur md:h-40">
                <div
                  className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-[#7dffb0]/70 to-[#ffd23f]/70"
                  style={{ height: `${Math.min(100, Math.max(0, ((hud.section - 1) / Math.max(1, hud.sectionCount)) * 100))}%` }}
                />
                {mode === "multi"
                  ? hud.roster.map((r) => (
                      <div
                        key={r.id}
                        className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${r.me ? "z-10 h-2.5 w-2.5 ring-2 ring-white" : "h-1.5 w-1.5 ring-1 ring-black/40"}`}
                        style={{ background: r.color, bottom: `${Math.min(97, Math.max(0, r.progress * 100))}%` }}
                      />
                    ))
                  : (
                      <div
                        className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-[#ffd23f]"
                        style={{ bottom: `${Math.min(97, Math.max(0, ((hud.section - 1) / Math.max(1, hud.sectionCount)) * 100))}%` }}
                      />
                    )}
              </div>
              <span className="text-xs opacity-80">🏳️</span>
            </div>
          )}

          {/* multiplayer roster */}
          {mode === "multi" && (
            <div className="pointer-events-none absolute left-2 top-16 z-10 w-44 space-y-1 md:w-56">
              <div className="stroke-text text-3xl font-black text-[#ffd23f]">{hud.place}<span className="text-lg text-white">/{hud.roster.length}</span></div>
              {hud.roster.slice(0, 12).map((r, i) => (
                <div key={r.id} className={`flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-bold ${r.me ? "bg-[#ffd23f] text-[#1b1440]" : "bg-[#1b1440]/65 text-white"}`}>
                  <span className="w-4">{i + 1}</span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                  <span className="flex-1 truncate">{r.name}</span>
                  {r.finishMs !== null ? <span>🏁</span> : <span className="h-1.5 w-10 overflow-hidden rounded-full bg-black/30"><span className="block h-full bg-[#7dffb0]" style={{ width: `${r.progress * 100}%` }} /></span>}
                </div>
              ))}
            </div>
          )}

          {/* hub side menu */}
          {mode === "hub" && (
            <div className="absolute left-2 top-20 z-10 flex max-h-[calc(100%-9rem)] flex-col gap-1.5 overflow-y-auto pb-2 md:top-24 md:gap-2">
              <button onClick={() => setMenuOpen((o) => !o)} className="btn-candy mb-1 w-fit bg-[#ff5fc8] px-3 py-1.5 text-sm md:hidden">{menuOpen ? t("menu.hide") : t("menu.show")}</button>
              {menuOpen && !room && (
                <button onClick={() => { sfx.click(); quickPlay(); }} className="btn-candy pulse-glow slide-in mb-1 flex w-32 flex-col items-start bg-gradient-to-b from-[#ff7ad9] to-[#ff2d8f] px-2.5 py-2 text-left md:w-48 md:px-3 md:py-3">
                  <span className="text-sm font-black leading-tight md:text-lg">{t("quick.title")}</span>
                  <span className="text-[10px] font-bold opacity-90 md:text-xs">{t("quick.sub")}</span>
                </button>
              )}
              {menuOpen && ([
                ["🏠", t("menu.create"), "#7b5cff", () => setModal("create"), false],
                ["🔎", t("menu.find"), "#3a86ff", () => setModal("browse"), false],
                ["🧍", t("menu.solo"), "#06d6a0", startSolo, false],
                ["⏱️", t("menu.ta"), "#ff9f1c", startTA, false],
                ["🛒", t("menu.shop"), "#ffbe0b", () => setModal("shop"), false],
                ["🏅", t("menu.ach"), "#f15bb5", () => setModal("ach"), false],
                ["🏆", t("menu.records"), "#00bbf9", () => setModal("board"), false],
                ["👤", t("menu.profile"), "#8338ec", () => setModal("profile"), false],
                ["⚙️", t("menu.settings"), "#6c757d", () => setModal("settings"), false],
              ] as [string, string, string, () => void, boolean][]).map(([icon, label, color, fn, glow], i) => (
                <button key={label} onClick={() => { sfx.click(); fn(); }} className={`btn-candy slide-in flex w-32 items-center gap-1.5 px-2.5 py-1 text-left text-xs md:w-48 md:gap-2 md:px-3 md:py-2.5 md:text-base ${glow ? "pulse-glow" : ""}`} style={{ background: color, animationDelay: `${i * 0.03}s` }}>
                  <span className="text-base md:text-2xl">{icon}</span><span className="leading-tight">{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* room panel */}
          {mode === "hub" && room && (room.quick ? (
            <QuickSearchPanel room={room} onCancel={leaveRoom} />
          ) : (
            <RoomPanel room={room} isHost={!!isHost} onLeave={leaveRoom} onBots={setBots} onStart={hostStart} />
          ))}

          {/* hub minigame status */}
          {mode === "hub" && hud.mini && (
            <div className="pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2 text-center">
              <div className="stroke-text font-mono text-5xl font-black text-[#7dffcf]">
                {hud.mini.name === "balance" || hud.mini.name === "coins" || hud.mini.name === "race" ? hud.miniInfo : fmtTime(hud.mini.time)}
              </div>
              <div className="text-sm font-black text-white">
                {t(`mini.${hud.mini.name}`)}{hud.mini.name !== "balance" ? ` · ${fmtTime(hud.mini.time)}` : ""}
              </div>
            </div>
          )}
          {mode === "hub" && !isTouch && !hud.mini && (
            <div className="pointer-events-none absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#1b1440]/70 px-4 py-1.5 text-center text-xs font-bold text-white/90 backdrop-blur">
              {t("hud.hubHint")}
            </div>
          )}

          {!results && !hud.spectating && <ActionBar isTouch={isTouch} hud={hud} engine={engineRef} pack={pack} scale={profile.settings.touchScale} left={profile.settings.leftHanded} />}
          {isTouch && !results && !modal && !hud.spectating && <Joystick engine={engineRef} scale={profile.settings.touchScale} left={profile.settings.leftHanded} />}
          {hud.spectating && !results && (
            <SpectatorBar hud={hud} engine={engineRef} isTouch={isTouch} />
          )}

          {hud.stunned && !respawning && <div className="stroke-text pointer-events-none absolute left-1/2 top-[60%] z-10 -translate-x-1/2 text-3xl font-black text-[#ff8fa3]">{t("hud.stunned")}</div>}
          {respawning && (
            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center">
              <div className="stroke-text text-9xl font-black text-[#ff4d6d] md:text-[10rem]" key={Math.ceil(hud.respawn)} style={{ animation: "bigPop 1s ease-out" }}>{Math.ceil(hud.respawn)}</div>
              <div className="stroke-text text-2xl font-black text-white">{t("hud.respawn")}…</div>
            </div>
          )}
          {!isTouch && !hud.locked && inRace && !pauseOpen && !results && hud.phase !== "finished" && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white">{t("hud.clickCamera")}</div>
          )}
        </>
      )}

      {/* start screen */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gradient-to-b from-[#1b1440]/30 via-transparent to-[#1b1440]/70 p-4">
          <div className="game-title wobble text-center text-6xl leading-[0.9] md:text-8xl">PARKOUR<br />CHAOS</div>
          <div className="mt-3 rounded-full bg-[#1b1440]/70 px-4 py-1 text-center text-sm font-bold text-white md:text-base">{t("app.tagline", { n: SECTION_COUNT })}</div>
          <div className="panel mt-6 w-full max-w-sm p-4 text-white">
            {user ? (
              <div className="text-center text-lg font-black">{t("ui.hi", { n: user.username })}</div>
            ) : (
              <input value={name} maxLength={16} onChange={(e) => { setName(e.target.value); nameRef.current = e.target.value || "Guest"; }} className="w-full rounded-xl bg-black/30 px-4 py-3 text-center text-lg font-black outline-none ring-[#ffd23f] focus:ring-2" placeholder={t("ui.name")} />
            )}
            <button onClick={startGame} className="btn-candy pulse-glow mt-3 w-full bg-gradient-to-b from-[#ff7ad9] to-[#ff3d9a] py-4 text-3xl">{t("ui.play")}</button>
            {!user && <button onClick={() => { startGame(); setModal("auth"); }} className="btn-candy mt-2 w-full bg-[#3a86ff] py-2 text-lg">{t("ui.loginRegister")}</button>}
            <div className="mt-3 flex justify-center gap-2">
              {(["de", "en", "ru"] as Lang[]).map((l) => (
                <button key={l} onClick={() => { sfx.click(); mutate((p) => ({ ...p, settings: { ...p.settings, lang: l } })); }} className={`rounded-lg px-2 py-1 text-xl transition ${profile.settings.lang === l ? "scale-110 bg-[#ffd23f]" : "bg-white/10"}`}>
                  {l === "de" ? "🇩🇪" : l === "en" ? "🇬🇧" : "🇷🇺"}
                </button>
              ))}
            </div>
            <div className="mt-3 text-center text-xs text-white/60">{isTouch ? t("ui.hintTouch") : t("ui.hintDesktop")}</div>
          </div>
        </div>
      )}

      {/* pause */}
      {pauseOpen && !results && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0d0826]/60 backdrop-blur-sm">
          <div className="panel modal-anim w-full max-w-xs p-5 text-center text-white">
            <div className="game-title text-5xl">{t("pause.title")}</div>
            {mode === "multi" && <div className="mt-1 text-xs text-white/60">{t("pause.matchContinues")}</div>}
            <div className="mt-4 flex flex-col gap-2">
              <Btn className="py-3 text-xl" color="#06d6a0" onClick={() => { setPauseOpen(false); gameplayStart(); }}>{t("pause.resume")}</Btn>
              {(mode === "solo" || mode === "ta") && <Btn className="py-3 text-xl" color="#ff9f1c" onClick={restart}>{t("pause.restart")}</Btn>}
              <Btn className="py-3 text-xl" color="#6c757d" onClick={() => setModal("settings")}>{t("pause.settings")}</Btn>
              <Btn className="py-3 text-xl" color="#ff4d6d" onClick={toHub}>{t("pause.toHub")}</Btn>
            </div>
          </div>
        </div>
      )}

      {results && (
        <ResultsModal
          r={results.r} best={results.best} rank={results.rank} submitMsg={results.submitMsg}
          onAgain={results.r.mode === "solo" || results.r.mode === "ta" ? restart : undefined}
          onHub={toHub}
          onBoard={results.r.mode === "ta" ? () => setModal("board") : undefined}
        />
      )}
      {reaction && <ReactionOverlay onClose={() => setReaction(false)} onDone={(ms) => handlers.current.onMini("reaction", ms)} />}
      {openCase && (
        <CaseOpenOverlay
          def={openCase}
          owned={profile.owned}
          unlockedColors={profile.unlockedColors ?? FREE_BODY_COLORS}
          onDone={(res) => caseResult(res)}
          onEquip={equip}
          onClose={() => setOpenCase(null)}
        />
      )}

      {modal === "shop" && (
        <ShopModal
          profile={profile}
          onBuy={buy}
          onEquip={equip}
          onOpenCase={openCaseNow}
          onClose={() => setModal(null)}
          onWatchAd={watchAdForCoins}
          adBusy={adBusy}
          adCdLeft={adCdLeft}
        />
      )}
      {modal === "profile" && <ProfileModal profile={profile} name={name} user={user} onClose={() => setModal(null)} onAuth={() => setModal("auth")} onLogout={logout}
        onColor={(c) => mutate((p) => {
                  const unlockedList = p.unlockedColors ?? FREE_BODY_COLORS;
                  const unlocked = FREE_BODY_COLORS.includes(c) || unlockedList.includes(c);
                  if (unlocked) return { ...p, color: c };
                  const price = nextColorPrice(unlockedList);
                  if (p.coins < price) { toast(t("prof.colorNoCoins"), "🪙"); return p; }
                  toast(t("prof.colorBought"), "🎨");
                  sfx.buy();
                  return {
                    ...p,
                    coins: p.coins - price,
                    color: c,
                    unlockedColors: Array.from(new Set([...unlockedList, c])),
                  };
                })}
        onNickColor={(c) => mutate((p) => {
                  const unlocked = (p.unlockedNickColors ?? ["#ffffff"]).includes(c);
                  if (!unlocked) { toast(t("prof.colorLocked"), "🔒"); return p; }
                  return { ...p, nickColor: c };
                })}
        onName={async (n) => {
          const nm = n.trim().slice(0, 16) || "Guest";
          // Logged-in users keep their account name — no guest name check
          if (user) {
            setName(user.username); nameRef.current = user.username;
            localStorage.setItem("rpm_name", user.username);
            engineRef.current?.setName(user.username);
            return;
          }
          try {
            const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "checkName", username: nm, password: "xxxx" }) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { toast(j.error || t("auth.nameTaken"), "🚫"); return; }
          } catch { /* offline */ }
          setName(nm); nameRef.current = nm; localStorage.setItem("rpm_name", nm); engineRef.current?.setName(nm);
        }} />}
      {modal === "ach" && <AchievementsModal profile={profile} onClose={() => setModal(null)} />}
      {modal === "settings" && (
        <SettingsModal
          settings={profile.settings}
          isTouch={isTouch}
          onClose={() => setModal(null)}
          onChange={(s) => mutate((p) => ({ ...p, settings: s }))}
          onGyroRequest={async () => (await engineRef.current?.requestGyro()) ?? false}
          onGyroCalibrate={() => engineRef.current?.calibrateGyro()}
        />
      )}
      {modal === "board" && <LeaderboardModal loggedIn={!!user} onClose={() => setModal(null)} />}
      {modal === "browse" && <LobbyBrowserModal onClose={() => setModal(null)} onList={listRooms} onJoin={joinRoom} />}
      {modal === "create" && <CreateLobbyModal defaultName={name} onClose={() => setModal(null)} onCreate={createRoom} />}
      {modal === "auth" && <AuthModal onClose={() => setModal(null)} onDone={auth} />}

      {modal === "practice" && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0d0826]/60 p-3 backdrop-blur-sm">
          <div className="panel modal-anim max-h-[80vh] w-full max-w-lg overflow-y-auto p-4 text-white">
            <div className="mb-3 flex items-center justify-between">
              <div className="game-title text-3xl">{t("mode.practice")}</div>
              <button className="btn-candy bg-white/10 px-3 py-1" onClick={() => setModal(null)}>✕</button>
            </div>
            <p className="mb-3 text-sm text-white/70">{t("mode.practiceHint")}</p>
            <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {SECTION_TYPES.filter((id) => id !== "start" && id !== "finish").map((id) => (
                <button key={id} className="btn-candy bg-[#3a86ff]/80 px-2 py-2 text-left text-sm font-bold"
                  onClick={() => { setModal(null); engineRef.current?.startPractice(id); toast(t("toast.practice", { n: t(`sec.${id}`) }), "🎯"); gameplayStart(); }}>
                  {t(`sec.${id}`)}
                </button>
              ))}
            </div>
            <button className="btn-candy mt-3 w-full bg-[#ffd23f] py-3 text-lg font-black text-[#1b1440]"
              onClick={() => { setModal(null); engineRef.current?.startWeekly(); toast(t("toast.weekly", { w: weeklyChallengeLabel() }), "📅"); gameplayStart(); }}>
              📅 {t("mode.weekly")} — {weeklyChallengeLabel()}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ---------------- quick search ----------------
function QuickSearchPanel({ room, onCancel }: { room: RoomInfo; onCancel: () => void }) {
  const found = room.players.length;
  const secs = Math.ceil((room.waitLeft ?? 0) / 1000);
  const pct = Math.min(100, (found / 12) * 100);
  return (
    <div className="panel modal-anim absolute right-2 top-16 z-10 w-64 p-3 text-white md:w-72">
      <div className="flex items-center justify-between">
        <div className="text-lg font-black text-[#ff7ad9]">{t("quick.title")}</div>
        <button onClick={onCancel} className="rounded-full bg-[#ff4d6d] px-2 text-sm font-black">✕</button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-gradient-to-r from-[#7dffb0] to-[#ffd23f] transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="shine h-2.5 w-2.5 rounded-full bg-[#7dffb0]" />
      </div>
      <div className="mt-2 text-sm font-black">{t("quick.status", { n: found })}</div>
      <div className="mt-0.5 text-xs text-white/70">{t("quick.fill")}</div>
      {room.status === "waiting" ? (
        <div className="mt-2 rounded-xl bg-black/30 py-1.5 text-center text-2xl font-black text-[#ffd23f]">{secs}s</div>
      ) : (
        <div className="mt-2 rounded-xl bg-[#06d6a0]/25 py-1.5 text-center font-black">{t("room.starting")}</div>
      )}
      <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
        {room.players.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1 text-sm font-bold">
            <span className="h-3 w-3 rounded-full" style={{ background: p.look?.color || "#fff" }} />
            <span className="flex-1 truncate">{p.name}</span>
          </div>
        ))}
        {Array.from({ length: Math.max(0, 12 - found) }).slice(0, 4).map((_, i) => (
          <div key={`slot${i}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-sm font-bold text-white/50">
            <span>🤖</span><span className="flex-1 truncate">{t("room.botSlot", { d: t("diff.mixed") })}</span>
          </div>
        ))}
      </div>
      <Btn className="mt-2 w-full text-sm" color="#6c757d" onClick={onCancel}>{t("quick.cancel")}</Btn>
      <div className="mt-2 text-center text-[11px] text-white/60">{t("room.playMinigames")}</div>
    </div>
  );
}

// ---------------- room panel with bot controls ----------------
function RoomPanel({ room, isHost, onLeave, onBots, onStart }: {
  room: RoomInfo; isHost: boolean; onLeave: () => void; onBots: (n: number, d: BotDiff) => void; onStart: (fill: boolean) => void;
}) {
  const [count, setCount] = useState(room.botCount ?? 0);
  const [diff, setDiff] = useState<BotDiff>((room.botDiff as BotDiff) ?? "mixed");
  const maxBots = Math.max(0, room.maxPlayers - room.players.length);
  const apply = (n: number, d: BotDiff) => { setCount(n); setDiff(d); onBots(n, d); };
  return (
    <div className="panel modal-anim absolute right-2 top-16 z-10 w-64 p-3 text-white md:w-72">
      <div className="flex items-center justify-between">
        <div className="font-black">{room.quick ? t("room.searching") : `🏠 ${room.name}`}</div>
        <button onClick={onLeave} className="rounded-full bg-[#ff4d6d] px-2 text-sm font-black">✕</button>
      </div>
      {!room.quick && <div className="mt-1 text-sm">{t("room.code")} <span className="font-mono text-lg font-black tracking-widest text-[#ffd23f]">{room.code}</span></div>}
      <div className="mt-1 text-xs text-white/70">
        {room.status === "waiting" ? (room.quick ? t("room.startIn", { n: Math.ceil((room.waitLeft ?? 0) / 1000) }) : t("room.waitHost")) : t("room.starting")}
      </div>
      <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
        {room.players.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-lg bg-white/10 px-2 py-1 text-sm font-bold">
            <span className="h-3 w-3 rounded-full" style={{ background: p.look?.color || "#fff" }} />
            <span className="flex-1 truncate">{p.name}</span>
            {p.id === room.hostId && <span>👑</span>}
          </div>
        ))}
        {Array.from({ length: Math.min(count, maxBots) }).map((_, i) => (
          <div key={`bot${i}`} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-sm font-bold text-white/70">
            <span>{diff === "mixed" ? "🤖" : BOT_DIFF_ICON[diff as "easy" | "mid" | "hard"]}</span>
            <span className="flex-1 truncate">{t("room.botSlot", { d: t(`diff.${diff}`) })}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-right text-xs text-white/60">{room.players.length + Math.min(count, maxBots)}/{room.maxPlayers}</div>
      {!room.quick && isHost && room.status === "waiting" && (
        <div className="mt-2 space-y-2 rounded-xl bg-black/25 p-2">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>{t("room.botCount", { n: Math.min(count, maxBots) })}</span>
            <div className="flex gap-1">
              <button onClick={() => apply(Math.max(0, count - 1), diff)} className="h-7 w-7 rounded-lg bg-white/15 font-black">−</button>
              <button onClick={() => apply(Math.min(maxBots, count + 1), diff)} className="h-7 w-7 rounded-lg bg-white/15 font-black">+</button>
            </div>
          </div>
          <div className="flex gap-1">
            {(["easy", "mid", "hard", "mixed"] as BotDiff[]).map((d) => (
              <button key={d} onClick={() => apply(count, d)} className={`flex-1 rounded-lg py-1 text-[11px] font-black ${diff === d ? "bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>
                {d === "mixed" ? "🎲" : BOT_DIFF_ICON[d as "easy" | "mid" | "hard"]} {t(`diff.${d}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Btn className="flex-1 text-sm" color="#06d6a0" disabled={room.players.length < 2 && count < 1} onClick={() => onStart(false)}>{t("room.start")}</Btn>
            <Btn className="flex-1 text-sm" color="#ff9f1c" onClick={() => onStart(true)}>🤖 {t("room.startWithBots")}</Btn>
          </div>
        </div>
      )}
      <div className="mt-2 text-center text-[11px] text-white/60">{t("room.playMinigames")}</div>
    </div>
  );
}

// ---------------- spectator ----------------
function SpectatorBar({ hud, engine, isTouch }: { hud: HudState; engine: React.RefObject<Engine | null>; isTouch: boolean }) {
  const racing = hud.roster.filter((r) => r.finishMs === null);
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2 text-center md:top-28">
        <div className="stroke-text text-2xl font-black text-[#ffd23f] md:text-4xl">👁️ {t("spec.title")}</div>
        <div className="mt-1 rounded-full bg-[#1b1440]/75 px-4 py-1 text-sm font-extrabold text-white backdrop-blur">
          {hud.specFree ? t("spec.free") : t("spec.watching", { n: hud.specName || "—" })}
        </div>
        {hud.myPlace > 0 && <div className="mt-1 text-sm font-bold text-white/80">{t("spec.finished", { n: hud.myPlace })}</div>}
      </div>

      <div className="pointer-events-none absolute left-2 top-16 z-20 w-40 space-y-1 md:w-52">
        <div className="rounded-lg bg-[#1b1440]/80 px-2 py-1 text-xs font-black text-[#7dffb0]">{t("spec.remaining", { n: racing.length })}</div>
        {hud.roster.slice(0, 12).map((r, i) => (
          <div key={r.id} className={`flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-bold ${r.me ? "bg-[#ffd23f] text-[#1b1440]" : r.name === hud.specName ? "bg-[#7b5cff] text-white" : "bg-[#1b1440]/65 text-white"}`}>
            <span className="w-4">{i + 1}</span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="flex-1 truncate">{r.name}</span>
            {r.finishMs !== null ? <span>🏁</span> : <span className="h-1.5 w-8 overflow-hidden rounded-full bg-black/30"><span className="block h-full bg-[#7dffb0]" style={{ width: `${r.progress * 100}%` }} /></span>}
          </div>
        ))}
      </div>

      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        <button onPointerDown={(e) => { e.preventDefault(); engine.current?.cycleSpectator(-1); }} className="btn-candy bg-[#7b5cff] px-5 py-3 text-lg">{t("spec.prev")}</button>
        <button onPointerDown={(e) => { e.preventDefault(); engine.current?.toggleFreeCam(); }} className={`btn-candy px-4 py-3 text-lg ${hud.specFree ? "bg-[#ffd23f] text-[#1b1440]" : "bg-[#3a86ff]"}`}>🎥</button>
        <button onPointerDown={(e) => { e.preventDefault(); engine.current?.cycleSpectator(1); }} className="btn-candy bg-[#7b5cff] px-5 py-3 text-lg">{t("spec.next")}</button>
      </div>
      <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-xs font-bold text-white">
        {isTouch ? t("spec.hint") : "◀ ▶ / A D"}
      </div>
      <button onClick={() => engine.current?.stopSpectating()} className="btn-candy absolute bottom-4 right-3 z-20 bg-[#ff4d6d] px-4 py-3 text-sm md:right-5">{t("spec.skip")}</button>
    </>
  );
}

// ---------------- action bar + emoji bar ----------------
function ActionBar({ isTouch, hud, engine, pack, scale, left }: {
  isTouch: boolean; hud: HudState; engine: React.RefObject<Engine | null>; pack: string[]; scale: number; left: boolean;
}) {
  const cd = hud.pushCd;
  const ready = cd <= 0;
  const active = ready && hud.pushNear;
  const deg = (1 - cd) * 360;
  const k = isTouch ? Math.max(0.75, Math.min(1.6, scale)) : 1;
  const px = (n: number) => `${Math.round(n * k)}px`;
  const side = left ? { left: "0.75rem" } : { right: "0.75rem" };
  return (
    <>
      <div
        className="absolute left-1/2 z-20 flex -translate-x-1/2 gap-1.5 rounded-2xl bg-[#1b1440]/70 p-1.5 backdrop-blur"
        style={{ bottom: isTouch ? `max(0.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.4rem))` : "0.6rem" }}
      >
        {pack.slice(0, 4).map((e, i) => (
          <button
            key={e + i}
            onPointerDown={(ev) => { ev.preventDefault(); engine.current?.emoji(e); }}
            className="btn-candy relative flex items-center justify-center bg-white/10"
            style={{ width: px(52), height: px(52), fontSize: px(26) }}
          >
            {e}
            <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-black/60 px-1 text-[9px] font-black text-white">{i + 1}</span>
          </button>
        ))}
      </div>

      <div className="absolute z-20 flex items-end gap-3" style={{ bottom: "0.9rem", ...side, flexDirection: left ? "row-reverse" : "row" }}>
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-full" style={{ background: `conic-gradient(${active ? "#ffd23f" : ready ? "#8888aa" : "#ff5fc8"} ${deg}deg, rgba(0,0,0,0.35) ${deg}deg)` }} />
          <button
            onPointerDown={(e) => { e.preventDefault(); engine.current?.input.pressPush(); }}
            className={`relative flex flex-col items-center justify-center rounded-full font-black text-white transition ${active ? "pulse-glow scale-110 bg-[#ff3d7f]" : "bg-[#3a2a7a] opacity-80"}`}
            style={{ width: px(64), height: px(64) }}
          >
            <span style={{ fontSize: px(24), lineHeight: 1 }}>
              {hud.abilityId === "ab_double" ? "🐇" : hud.abilityId === "ab_dash" ? "💨" : hud.abilityId === "ab_anchor" ? "🛡️" : hud.abilityId === "ab_clone" ? "👥" : hud.abilityId === "ab_oil" ? "🛢️" : hud.abilityId === "ab_blind" ? "🌑" : "🫸"}
            </span>
            <span className="text-[10px] leading-none">
              {hud.abilityId === "ab_double"
                ? (hud.abilityCharges !== undefined && hud.abilityCharges >= 0 && cd <= 0
                    ? t("hud.charges", { n: hud.abilityCharges })
                    : `${Math.ceil(cd * 18)}s`)
                : ready
                  ? (isTouch ? t("hud.push") : "F")
                  : `${Math.ceil(cd * 16)}s`}
            </span>
          </button>
        </div>
        {isTouch && (
          <button
            onPointerDown={(e) => { e.preventDefault(); engine.current?.input.pressJump(); }}
            onPointerUp={() => engine.current?.input.releaseJump()}
            onPointerCancel={() => engine.current?.input.releaseJump()}
            onPointerLeave={() => engine.current?.input.releaseJump()}
            className="btn-candy flex items-center justify-center rounded-full bg-gradient-to-b from-[#7dffb0] to-[#06d6a0]"
            style={{ width: px(104), height: px(104), fontSize: px(42), borderRadius: "9999px" }}
          >
            ⤒
          </button>
        )}
      </div>
    </>
  );
}

// ---------------- joystick ----------------
function Joystick({ engine, scale, left }: { engine: React.RefObject<Engine | null>; scale: number; left: boolean }) {
  const [knob, setKnob] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const idRef = useRef<number | null>(null);
  const k = Math.max(0.75, Math.min(1.6, scale));
  const R = 62 * k;
  const update = (cx: number, cy: number, ox: number, oy: number) => {
    let dx = cx - ox, dy = cy - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob({ ox, oy, x: dx, y: dy });
    const e = engine.current;
    if (e) { e.input.joyX = dx / R; e.input.joyY = -dy / R; }
  };
  const end = () => {
    idRef.current = null;
    setKnob(null);
    const e = engine.current;
    if (e) { e.input.joyX = 0; e.input.joyY = 0; }
  };
  return (
    <div
      className="absolute bottom-0 z-10 touch-none"
      style={{ width: "48%", height: "48%", left: left ? undefined : 0, right: left ? 0 : undefined }}
      onPointerDown={(e) => { if (idRef.current !== null) return; idRef.current = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId); update(e.clientX, e.clientY, e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (e.pointerId !== idRef.current || !knob) return; update(e.clientX, e.clientY, knob.ox, knob.oy); }}
      onPointerUp={(e) => { if (e.pointerId === idRef.current) end(); }}
      onPointerCancel={(e) => { if (e.pointerId === idRef.current) end(); }}
    >
      {knob ? (
        <div className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white/40 bg-white/10"
          style={{ left: knob.ox, top: knob.oy, width: R * 2.2, height: R * 2.2 }}>
          <div className="absolute left-1/2 top-1/2 rounded-full bg-white/80 shadow-lg"
            style={{ width: R * 0.95, height: R * 0.95, transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
        </div>
      ) : (
        <div className="pointer-events-none absolute rounded-full border-4 border-white/25 bg-white/5"
          style={{ bottom: 28, [left ? "right" : "left"]: 28, width: R * 2, height: R * 2 } as React.CSSProperties}>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40" style={{ width: R * 0.85, height: R * 0.85 }} />
        </div>
      )}
    </div>
  );
}


function BlindOverlay({ engine }: { engine: React.RefObject<Engine | null> }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const e = engine.current;
      setOn(!!e && performance.now() < (e.blindUntil || 0));
    }, 100);
    return () => clearInterval(id);
  }, [engine]);
  if (!on) return null;
  return <div className="pointer-events-none absolute inset-0 z-30 bg-black/90" />;
}
