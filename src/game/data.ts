import { t } from "./i18n";

export type Category = "skin" | "footprint" | "landing" | "death" | "aura" | "trail" | "emoji" | "hat" | "badge" | "ability";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface ShopItem {
  id: string;
  cat: Category;
  price: number;
  color: string;
  color2?: string;
  icon: string;
  style?: string;
  rarity: Rarity;
}

export const CATEGORIES: Category[] = ["skin", "hat", "footprint", "landing", "death", "aura", "trail", "emoji", "badge", "ability"];
export const RARITY_COLOR: Record<Rarity, string> = { common: "#b8c0d8", rare: "#4cc9f0", epic: "#d36bff", legendary: "#ff9f1c" };
export function itemName(id: string) { return t(`item.${id}`); }
export function catLabel(c: Category) { return t(`cat.${c}`); }
export function rarityLabel(r: Rarity) { return t(`rarity.${r}`); }

const mk = (id: string, cat: Category, price: number, color: string, icon: string, rarity: Rarity, extra: Partial<ShopItem> = {}): ShopItem =>
  ({ id, cat, price, color, icon, rarity, ...extra });

export const SHOP: ShopItem[] = [
  // ---- skins ----
  mk("skin_bean", "skin", 0, "#ffffff", "🫘", "common"),
  mk("skin_blocky", "skin", 250, "#ffb703", "🧱", "common"),
  mk("skin_slime", "skin", 500, "#57ff9d", "🟢", "rare"),
  mk("skin_robot", "skin", 650, "#9aa5ce", "🤖", "rare", { color2: "#ff3355" }),
  mk("skin_ninja", "skin", 700, "#3a3f55", "🥷", "rare", { color2: "#ff2d6f" }),
  mk("skin_dino", "skin", 1200, "#4ad66d", "🦖", "epic", { color2: "#ffd23f" }),
  mk("skin_alien", "skin", 1400, "#8cff5e", "👽", "epic", { color2: "#111122" }),
  mk("skin_knight", "skin", 1600, "#c9d1e8", "🛡️", "epic", { color2: "#ffd23f" }),
  mk("skin_ghost", "skin", 1800, "#dcd7ff", "👻", "epic"),

  // ---- footprints ----
  mk("fp_basic", "footprint", 0, "#ffffff", "👣", "common"),
  mk("fp_neon", "footprint", 150, "#39ff14", "💚", "common"),
  mk("fp_fire", "footprint", 300, "#ff5a1f", "🔥", "rare", { color2: "#ffd21f" }),
  mk("fp_ice", "footprint", 300, "#8fe9ff", "❄️", "rare"),
  mk("fp_rainbow", "footprint", 600, "#ff00aa", "🌈", "rare", { style: "rainbow" }),
  mk("fp_gold", "footprint", 900, "#ffd700", "🏅", "epic"),

  // ---- landing ----
  mk("ld_dust", "landing", 0, "#e8dcc8", "💨", "common"),
  mk("ld_stars", "landing", 200, "#ffe14d", "⭐", "common"),
  mk("ld_hearts", "landing", 250, "#ff4d8d", "💖", "common"),
  mk("ld_shock", "landing", 450, "#4dd2ff", "💥", "rare", { style: "ring" }),
  mk("ld_confetti", "landing", 500, "#ff00ff", "🎉", "rare", { style: "rainbow" }),

  // ---- death ----
  mk("dt_poof", "death", 0, "#ffffff", "☁️", "common"),
  mk("dt_pixel", "death", 250, "#7cff4d", "👾", "common"),
  mk("dt_boom", "death", 400, "#ff7a1a", "💣", "rare", { color2: "#ffdd00" }),
  mk("dt_ghost", "death", 500, "#c9b6ff", "👻", "rare", { style: "rise" }),
  mk("dt_rainbow", "death", 800, "#ff00aa", "🦄", "epic", { style: "rainbow" }),

  // ---- auras ----
  mk("au_none", "aura", 0, "#000000", "⭕", "common"),
  mk("au_sparkle", "aura", 350, "#fff27a", "✨", "rare"),
  mk("au_flame", "aura", 600, "#ff6a00", "🔥", "rare"),
  mk("au_frost", "aura", 600, "#9ff3ff", "🧊", "rare"),
  mk("au_void", "aura", 1000, "#9b30ff", "🌀", "epic"),
  mk("au_rainbow", "aura", 1500, "#ff00aa", "🌈", "epic", { style: "rainbow" }),

  // ---- trails ----
  mk("tr_none", "trail", 0, "#000000", "➖", "common"),
  mk("tr_white", "trail", 200, "#ffffff", "☁️", "common"),
  mk("tr_pink", "trail", 350, "#ff5fc8", "🍬", "rare"),
  mk("tr_lightning", "trail", 600, "#59e1ff", "⚡", "rare"),
  mk("tr_gold", "trail", 900, "#ffcc00", "💰", "epic"),
  mk("tr_rainbow", "trail", 1300, "#ff00aa", "🌈", "epic", { style: "rainbow" }),

  // ---- emoji packs ----
  mk("em_basic", "emoji", 0, "#ffd84d", "😀", "common"),
  mk("em_hype", "emoji", 250, "#ff5a5a", "🔥", "common"),
  mk("em_animals", "emoji", 300, "#8bd46e", "🐸", "rare"),
  mk("em_food", "emoji", 300, "#ffa94d", "🍕", "rare"),
  mk("em_spooky", "emoji", 400, "#9b7bff", "💀", "rare"),

  // ---- hats ----
  mk("hat_none", "hat", 0, "#000000", "🙂", "common"),
  mk("hat_party", "hat", 150, "#ff4fa3", "🥳", "common", { color2: "#ffe14d" }),
  mk("hat_cap", "hat", 200, "#2f7bff", "🧢", "common"),
  mk("hat_ears", "hat", 300, "#ff9ec7", "🐱", "rare"),
  mk("hat_shades", "hat", 350, "#111111", "😎", "rare"),
  mk("hat_top", "hat", 500, "#222222", "🎩", "rare", { color2: "#e0213a" }),
  mk("hat_propeller", "hat", 600, "#ffcc00", "🚁", "rare", { color2: "#ff3355" }),
  mk("hat_horns", "hat", 700, "#ff2d2d", "😈", "epic"),
  mk("hat_halo", "hat", 900, "#fff27a", "😇", "epic"),
  mk("hat_crown", "hat", 1500, "#ffd700", "👑", "epic", { color2: "#ff2d6f" }),

  // ---- extra skins ----
  mk("skin_pumpkin", "skin", 180, "#ff8c1a", "🎃", "common"),
  mk("skin_snow", "skin", 220, "#e8f4ff", "☃️", "common"),
  mk("skin_fox", "skin", 550, "#ff7a3d", "🦊", "rare", { color2: "#fff3e0" }),
  mk("skin_bee", "skin", 600, "#ffd23f", "🐝", "rare", { color2: "#1b1440" }),
  mk("skin_dragon", "skin", 1700, "#ff3355", "🐉", "epic", { color2: "#ffd23f" }),
  mk("skin_nebula", "skin", 1900, "#7b5cff", "🌌", "epic", { color2: "#ff5fc8" }),

  // ---- extra footprints ----
  mk("fp_pixels", "footprint", 120, "#7cff4d", "🟦", "common"),
  mk("fp_hearts", "footprint", 180, "#ff4d8d", "💗", "common"),
  mk("fp_stars", "footprint", 350, "#ffe14d", "✨", "rare"),
  mk("fp_void", "footprint", 700, "#6b30ff", "🌑", "epic"),

  // ---- extra landing ----
  mk("ld_bubbles", "landing", 160, "#7ad7ff", "🫧", "common"),
  mk("ld_leaves", "landing", 180, "#57cc99", "🍃", "common"),
  mk("ld_sparks", "landing", 420, "#ff9f1c", "🎇", "rare"),
  mk("ld_galaxy", "landing", 850, "#9b5de5", "🌠", "epic", { style: "rainbow" }),

  // ---- extra death ----
  mk("dt_splash", "death", 180, "#4cc9f0", "💦", "common"),
  mk("dt_smoke", "death", 200, "#9aa5ce", "💨", "common"),
  mk("dt_lightning", "death", 480, "#59e1ff", "⚡", "rare"),
  mk("dt_void", "death", 900, "#5b2cff", "🕳️", "epic"),

  // ---- extra auras ----
  mk("au_bubbles", "aura", 280, "#7ad7ff", "🫧", "common"),
  mk("au_hearts", "aura", 300, "#ff5fc8", "💕", "common"),
  mk("au_electric", "aura", 650, "#4cc9f0", "⚡", "rare"),
  mk("au_solar", "aura", 1400, "#ffd23f", "☀️", "epic"),

  // ---- extra trails ----
  mk("tr_green", "trail", 180, "#57ff9d", "🌿", "common"),
  mk("tr_blue", "trail", 200, "#4cc9f0", "💙", "common"),
  mk("tr_fire", "trail", 550, "#ff5a1f", "🔥", "rare", { color2: "#ffd21f" }),
  mk("tr_stars", "trail", 1100, "#ffe14d", "⭐", "epic"),

  // ---- extra emoji packs ----
  mk("em_sports", "emoji", 200, "#06d6a0", "⚽", "common"),
  mk("em_faces", "emoji", 220, "#ffd84d", "🤩", "common"),
  mk("em_space", "emoji", 380, "#9b7bff", "🚀", "rare"),
  mk("em_chaos", "emoji", 420, "#ff4d6d", "💥", "rare"),
  mk("em_legend", "emoji", 900, "#ffd700", "👑", "epic"),

  // ---- extra hats ----
  mk("hat_beanie", "hat", 120, "#3a86ff", "🧶", "common"),
  mk("hat_flower", "hat", 160, "#ff5fc8", "🌸", "common"),
  mk("hat_wizard", "hat", 550, "#7b5cff", "🧙", "rare", { color2: "#ffd23f" }),
  mk("hat_astronaut", "hat", 1200, "#c9d1e8", "👨‍🚀", "epic"),

  // ---- badges (lobby only) ----
  mk("badge_none", "badge", 0, "#888888", "—", "common"),
  mk("badge_rookie", "badge", 150, "#7dffb0", "🌱", "common"),
  mk("badge_star", "badge", 300, "#ffd23f", "⭐", "rare"),
  mk("badge_fire", "badge", 400, "#ff5a1f", "🔥", "rare"),
  mk("badge_crown", "badge", 900, "#ffd700", "👑", "epic"),
  mk("badge_neon", "badge", 1100, "#ff00aa", "💫", "epic"),
  mk("badge_legend", "badge", 2500, "#ff9f1c", "🏆", "legendary"),

  // ---- abilities ----
  mk("ab_hit", "ability", 0, "#ffffff", "👊", "common"),
  mk("ab_shove", "ability", 2500, "#ff3d7f", "🫸", "legendary"),
  mk("ab_blind", "ability", 2000, "#1b1440", "🌑", "epic"),
  mk("ab_anchor", "ability", 1200, "#7dffb0", "🛡️", "rare"),
  mk("ab_dash", "ability", 1500, "#4cc9f0", "💨", "rare"),
  mk("ab_clone", "ability", 1800, "#d36bff", "👥", "epic"),
  mk("ab_oil", "ability", 1400, "#c9a36b", "🛢️", "rare"),
  mk("ab_double", "ability", 2200, "#7dffb0", "🐇", "epic"),
];

export const SKIN_IDS = SHOP.filter((s) => s.cat === "skin").map((s) => s.id);

/** Exactly four emojis per pack — they map to keys 1-4. */
export const EMOJI_PACKS: Record<string, string[]> = {
  em_basic: ["😀", "😂", "👍", "😭"],
  em_hype: ["🔥", "💯", "🚀", "🏆"],
  em_animals: ["🐸", "🐱", "🦄", "🐧"],
  em_food: ["🍕", "🍩", "🍉", "🌮"],
  em_spooky: ["💀", "👻", "🎃", "😈"],
  em_sports: ["⚽", "🏀", "🎯", "🥇"],
  em_faces: ["🤩", "😎", "🥳", "😴"],
  em_space: ["🚀", "👽", "🌌", "🪐"],
  em_chaos: ["💥", "🌪️", "⚡", "🔥"],
  em_legend: ["👑", "💎", "🏆", "⭐"],
};

/** 6 free starter colours (green, red, blue, yellow, purple, pink) */
export const FREE_BODY_COLORS = ["#06d6a0", "#ff4d6d", "#3a86ff", "#ffd60a", "#8338ec", "#ff5fc8"];
/** All body colours (20). Changing between unlocked colours is free. */
export const BODY_COLORS = [
  ...FREE_BODY_COLORS,
  "#ff9f1c", "#2ec4b6", "#f15bb5", "#00bbf9",
  "#ffffff", "#1b1440", "#57ff9d", "#ff7a1a",
  "#c9d1e8", "#ff3355", "#9b5de5", "#ffe14d",
  "#4cc9f0", "#111122",
  // 10 new (case / shop only)
  "#00ff9f", "#ff006e", "#8338ec", "#fb5607",
  "#3a86ff", "#ffbe0b", "#8ac926", "#1982c4",
  "#6a4c93", "#ff99c8",
];
/** Base price for first paid colour; each further unlock +40 */
export const COLOR_UNLOCK_BASE = 60;
export const COLOR_UNLOCK_STEP = 40;
/** @deprecated use nextColorPrice() */
export const COLOR_UNLOCK_PRICE = COLOR_UNLOCK_BASE;
/** Paid body colours (everything except the 6 free starters) */
export const PAID_BODY_COLORS = BODY_COLORS.filter((c) => !FREE_BODY_COLORS.includes(c));

/** Progressive: 60, 100, 140, 180… by number of paid colours already unlocked */
export function nextColorPrice(unlockedColors: string[]): number {
  const paidUnlocked = unlockedColors.filter((c) => !FREE_BODY_COLORS.includes(c)).length;
  return COLOR_UNLOCK_BASE + COLOR_UNLOCK_STEP * paidUnlocked;
}

export interface CaseDef {
  id: string;
  price: number;
  icon: string;
  color: string;
  /** weights for [common, rare, epic] */
  odds: [number, number, number];
}

export const CASES: CaseDef[] = [
  { id: "case_common", price: 200, icon: "📦", color: "#b8c0d8", odds: [78, 19, 3] },
  { id: "case_rare", price: 450, icon: "🎁", color: "#4cc9f0", odds: [40, 48, 12] },
  { id: "case_epic", price: 900, icon: "💎", color: "#d36bff", odds: [14, 41, 45] },
];

export const CASE_DUPLICATE_REFUND = 0.35;

export interface CaseResult {
  item: ShopItem | null;
  /** unlocked body colour hex (from case colour drop) */
  color?: string;
  duplicate: boolean;
  refund: number;
}

/**
 * Rolls a case reward.
 * - Epic case (`case_epic`): 5% chance to unlock a random paid body colour.
 * - Other cases: small colour chance (1% / 2.5%).
 * Duplicates → coin refund.
 */
export function rollCase(
  def: CaseDef,
  owned: string[],
  unlockedColors: string[] = [],
  rnd: () => number = Math.random,
): CaseResult {
  // colour drop chance
  const colorChance = def.id === "case_epic" ? 0.05 : def.id === "case_rare" ? 0.025 : 0.01;
  if (rnd() < colorChance) {
    const locked = PAID_BODY_COLORS.filter((c) => !unlockedColors.includes(c) && !FREE_BODY_COLORS.includes(c));
    const pool = locked.length ? locked : PAID_BODY_COLORS;
    const color = pool[Math.floor(rnd() * pool.length)];
    const already = unlockedColors.includes(color) || FREE_BODY_COLORS.includes(color);
    return {
      item: null,
      color,
      duplicate: already,
      refund: already ? 40 : 0,
    };
  }

  const order: Rarity[] = ["common", "rare", "epic", "legendary"];
  const total = def.odds[0] + def.odds[1] + def.odds[2];
  let r = rnd() * total;
  let rarity: Rarity = "common";
  for (let i = 0; i < 3; i++) {
    r -= def.odds[i];
    if (r <= 0) { rarity = order[i]; break; }
  }
  const inRarity = SHOP.filter((it) => it.rarity === rarity && it.price > 0);
  const pool = inRarity.length ? inRarity : SHOP.filter((it) => it.price > 0);
  const fresh = pool.filter((it) => !owned.includes(it.id));
  const pick = (arr: ShopItem[]) => arr[Math.floor(rnd() * arr.length)];
  const item = fresh.length ? pick(fresh) : pick(pool);
  const duplicate = owned.includes(item.id);
  return { item, duplicate, refund: duplicate ? Math.max(20, Math.round(item.price * CASE_DUPLICATE_REFUND)) : 0 };
}

export type BotDiff = "easy" | "mid" | "hard" | "mixed";
export const BOT_DIFFS: BotDiff[] = ["easy", "mid", "hard", "mixed"];
export const BOT_DIFF_ICON: Record<Exclude<BotDiff, "mixed">, string> = { easy: "🟢", mid: "🟡", hard: "🔴" };
export const BOT_DIFF_STATS: Record<Exclude<BotDiff, "mixed">, { speed: [number, number]; fail: number; pushCd: [number, number]; emoji: [number, number] }> = {
  easy: { speed: [4.9, 5.9], fail: 0.14, pushCd: [18, 32], emoji: [4, 14] },
  mid: { speed: [6.2, 7.2], fail: 0.07, pushCd: [15, 24], emoji: [8, 22] },
  hard: { speed: [7.6, 8.7], fail: 0.022, pushCd: [15, 18], emoji: [14, 30] },
};

/** Per-bot flavour so a lobby never feels like a pack of clones. */
export interface BotStyle {
  /** 0 = careful (short hops, waits), 1 = aggressive (long risky leaps) */
  aggression: number;
  /** multiplies emoji frequency */
  chatty: number;
  /** multiplies reaction delay after landing */
  reaction: number;
  /** extra chance to attempt a risky shortcut jump */
  risk: number;
  /** celebrates other players finishing/falling */
  cheerful: boolean;
}

export interface Stats {
  matches: number; wins: number; winStreak: number; bestStreak: number; podiums: number; perfectJumps: number;
  nearMisses: number; pushes: number; pushedTimes: number; deaths: number; jumps: number; sectionsCleared: number;
  soloRuns: number; taRuns: number; taBest: number; soloBest: number; emojis: number; coinsEarned: number;
  minigames: number; bounces: number; wallJumps: number; portals: number;
}

export type Quality = "low" | "mid" | "high";
export type ShadowMode = "off" | "self" | "on";

export type SkyTheme = "day" | "night" | "neon";
export type Weather = "clear" | "rain" | "snow" | "wind";

export interface Settings {
  volume: number; music: boolean; quality: Quality; sensitivity: number; invertY: boolean;
  shake: boolean; showFps: boolean; lang: "de" | "en" | "ru";
  // performance
  particles: number;        // 0..1 multiplier
  shadows: ShadowMode;
  drawDistance: number;     // sections rendered around the player (1..4)
  postFx: boolean;          // reflections / fancy materials
  fpsLimit: 30 | 60 | 0;    // 0 = uncapped
  // mobile
  gyro: boolean;
  gyroSens: number;
  touchScale: number;       // control size multiplier
  leftHanded: boolean;
  deadzone: number;
  // visuals
  skyTheme: SkyTheme;
  weather: Weather;
}

export const QUALITY_PRESETS: Record<Quality, Partial<Settings>> = {
  low: { particles: 0.25, shadows: "off", drawDistance: 1, postFx: false, fpsLimit: 30 },
  mid: { particles: 0.6, shadows: "self", drawDistance: 2, postFx: false, fpsLimit: 60 },
  high: { particles: 1, shadows: "on", drawDistance: 3, postFx: true, fpsLimit: 0 },
};

export interface Profile {
  coins: number;
  owned: string[];
  equipped: Record<Category, string>;
  color: string;
  /** unlocked body colours (hex). Free colours always available. */
  unlockedColors: string[];
  /** nick colour hex for lobby display */
  nickColor: string;
  unlockedNickColors: string[];
  stats: Stats;
  achievements: string[];
  settings: Settings;
}

export const NICK_COLOR_PRICE = 200;
export const NICK_COLORS = [
  "#ffffff", "#ff4d6d", "#ff9f1c", "#ffd60a", "#06d6a0", "#3a86ff",
  "#8338ec", "#ff5fc8", "#00bbf9", "#ffd700", "#7dffb0", "#ff3355",
];


export const DEFAULT_EQUIP: Record<Category, string> = {
  skin: "skin_bean", footprint: "fp_basic", landing: "ld_dust", death: "dt_poof",
  aura: "au_none", trail: "tr_none", emoji: "em_basic", hat: "hat_none",
  badge: "badge_none", ability: "ab_hit",
};

export function defaultProfile(): Profile {
  const startColor = FREE_BODY_COLORS[Math.floor(Math.random() * FREE_BODY_COLORS.length)];
  return {
    coins: 100,
    owned: SHOP.filter((s) => s.price === 0).map((s) => s.id),
    equipped: { ...DEFAULT_EQUIP },
    color: startColor,
    unlockedColors: [...FREE_BODY_COLORS],
    nickColor: "#ffffff",
    unlockedNickColors: ["#ffffff"],
    stats: {
      matches: 0, wins: 0, winStreak: 0, bestStreak: 0, podiums: 0, perfectJumps: 0, nearMisses: 0,
      pushes: 0, pushedTimes: 0, deaths: 0, jumps: 0, sectionsCleared: 0, soloRuns: 0, taRuns: 0,
      taBest: 0, soloBest: 0, emojis: 0, coinsEarned: 0, minigames: 0, bounces: 0, wallJumps: 0, portals: 0,
    },
    achievements: [],
    settings: {
      volume: 0.7, music: true, quality: "high", sensitivity: 1, invertY: false, shake: true, showFps: false, lang: "en",
      particles: 1, shadows: "on", drawDistance: 3, postFx: true, fpsLimit: 0,
      gyro: false, gyroSens: 1, touchScale: 1, leftHanded: false, deadzone: 0.12,
      skyTheme: "day", weather: "clear",
    },
  };
}

export function mergeProfile(raw: unknown): Profile {
  const d = defaultProfile();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<Profile>;
  const equipped = { ...d.equipped, ...(r.equipped ?? {}) };
  for (const k of CATEGORIES) if (!SHOP.some((s) => s.id === equipped[k])) equipped[k] = d.equipped[k];
  const unlockedColors = Array.isArray((r as Profile).unlockedColors)
    ? Array.from(new Set([...FREE_BODY_COLORS, ...(r as Profile).unlockedColors]))
    : [...FREE_BODY_COLORS];
  let color = typeof r.color === "string" ? r.color : d.color;
  if (!unlockedColors.includes(color) && !FREE_BODY_COLORS.includes(color)) {
    color = FREE_BODY_COLORS[0];
  }
  return {
    coins: typeof r.coins === "number" ? r.coins : d.coins,
    owned: Array.isArray(r.owned) ? Array.from(new Set([...d.owned, ...r.owned])) : d.owned,
    equipped,
    color,
    unlockedColors,
    nickColor: typeof (r as Profile).nickColor === "string" ? (r as Profile).nickColor : d.nickColor,
    unlockedNickColors: Array.isArray((r as Profile).unlockedNickColors)
      ? Array.from(new Set(["#ffffff", ...(r as Profile).unlockedNickColors]))
      : d.unlockedNickColors,
    stats: { ...d.stats, ...(r.stats ?? {}) },
    achievements: Array.isArray(r.achievements) ? r.achievements : [],
    settings: { ...d.settings, ...(r.settings ?? {}), skyTheme: (r.settings as Settings)?.skyTheme ?? d.settings.skyTheme, weather: (r.settings as Settings)?.weather ?? d.settings.weather },
  };
}

export interface Achievement {
  id: string; icon: string; reward: number; goal: number; value: (s: Stats) => number;
}
export function achName(a: Achievement) { return t(`ach.${a.id}.n`); }
export function achDesc(a: Achievement) { return t(`ach.${a.id}.d`); }

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_steps", icon: "👟", reward: 25, goal: 10, value: (s) => s.sectionsCleared },
  { id: "sections_500", icon: "🏃", reward: 250, goal: 500, value: (s) => s.sectionsCleared },
  { id: "first_win", icon: "🥇", reward: 50, goal: 1, value: (s) => s.wins },
  { id: "wins_10", icon: "🏆", reward: 150, goal: 10, value: (s) => s.wins },
  { id: "wins_50", icon: "👑", reward: 500, goal: 50, value: (s) => s.wins },
  { id: "streak_3", icon: "🔥", reward: 100, goal: 3, value: (s) => s.bestStreak },
  { id: "streak_10", icon: "☄️", reward: 750, goal: 10, value: (s) => s.bestStreak },
  { id: "perfect_10", icon: "🎯", reward: 25, goal: 10, value: (s) => s.perfectJumps },
  { id: "perfect_100", icon: "💎", reward: 200, goal: 100, value: (s) => s.perfectJumps },
  { id: "push_10", icon: "🫸", reward: 25, goal: 10, value: (s) => s.pushes },
  { id: "push_100", icon: "💥", reward: 250, goal: 100, value: (s) => s.pushes },
  { id: "near_25", icon: "😰", reward: 75, goal: 25, value: (s) => s.nearMisses },
  { id: "deaths_50", icon: "🤕", reward: 50, goal: 50, value: (s) => s.deaths },
  { id: "jumps_1000", icon: "🦗", reward: 100, goal: 1000, value: (s) => s.jumps },
  { id: "ta_done", icon: "⏱️", reward: 50, goal: 1, value: (s) => s.taRuns },
  { id: "ta_120", icon: "⚡", reward: 300, goal: 1, value: (s) => (s.taBest > 0 && s.taBest < 120000 ? 1 : 0) },
  { id: "ta_90", icon: "🌩️", reward: 750, goal: 1, value: (s) => (s.taBest > 0 && s.taBest < 90000 ? 1 : 0) },
  { id: "solo_5", icon: "🧍", reward: 75, goal: 5, value: (s) => s.soloRuns },
  { id: "emoji_50", icon: "💬", reward: 50, goal: 50, value: (s) => s.emojis },
  { id: "bounce_100", icon: "🍄", reward: 100, goal: 100, value: (s) => s.bounces },
  { id: "walljump_50", icon: "🕷️", reward: 125, goal: 50, value: (s) => s.wallJumps },
  { id: "mini_20", icon: "🎮", reward: 75, goal: 20, value: (s) => s.minigames },
  { id: "rich", icon: "💰", reward: 250, goal: 5000, value: (s) => s.coinsEarned },
];

export const BOT_NAMES = [
  // en
  "Zippy", "BeanKing", "Wobbles", "NoobMaster", "Sk8rBoi", "JumpJunkie", "Pixelz", "TurboTaco", "Poggers",
  "Gigachad", "Pancake", "Rocket", "Fluffy", "Snek", "ZoomZoom", "Chungus", "Tofu", "Yeet", "Wiggles",
  "SirHops", "LagSpike", "ToastCrumb", "NoScope", "BigYoshi", "Slippy", "Dr_Bounce", "MintChip", "Grumbles",
  "CaptainOof", "SoggyFries", "TinyTitan", "Blobfish", "JellyBean", "Moonwalk", "Spaghetti", "PogChimp",
  // de
  "Klaus", "Bruno", "Lotte", "Fritz", "Waffel", "Krümel", "Zwerg", "Hüpfer", "Brezel", "Kartoffel",
  "Schnitzel", "Gurke", "Wurstfinger", "Flitzer", "Mausi", "Donnerkeil", "Kekskrieger", "Purzel",
  // ru
  "Kirill_228", "Sasha", "Dimon", "LenaPro", "Ninja_Kot", "Pelmen", "Sgushonka", "Barsik", "Zhabka",
  "Kompot", "Valera", "Tapok", "Bublik", "Kotleta", "Pirojok", "Sonya", "Vitalya", "Shaurma", "Kvas",
  // misc / intl
  "Mochi", "Vortex", "Blinky", "Noodle", "Bubbles", "CrazyFrog", "Taco", "Kimchi", "Baguette", "Churro",
  "Pierogi", "Sushi", "Falafel", "Nacho", "Gelato", "Poutine", "Croissant", "Tiramisu",
];

export function fmtTime(ms: number): string {
  if (!ms || ms < 0) return "--:--.--";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export const COIN_BY_PLACE = [75, 50, 38, 28, 23, 20, 18, 15, 13, 11, 10, 9];


/** ISO week-based seed (changes every Monday UTC). */
export function weeklyChallengeSeed(d = new Date()): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return (t.getUTCFullYear() * 100 + week) * 9973;
}

export function weeklyChallengeLabel(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
