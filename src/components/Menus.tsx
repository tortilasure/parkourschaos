"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ACHIEVEMENTS, BODY_COLORS, CASES, CATEGORIES, EMOJI_PACKS, FREE_BODY_COLORS, NICK_COLOR_PRICE, NICK_COLORS, QUALITY_PRESETS, RARITY_COLOR, SHOP, nextColorPrice,
  achDesc, achName, catLabel, fmtTime, itemName, rarityLabel, rollCase, type CaseResult,
  type BotDiff, type CaseDef, type Category, type Profile, type Quality, type Rarity, type Settings, type ShopItem, type SkyTheme, type Weather,
} from "@/game/data";
import type { FinishResult, RoomInfo } from "@/game/engine";
import { LANGS, t, type Lang } from "@/game/i18n";
import { sfx } from "@/game/audio";

// ---------------- local high scores ----------------
export type ScoreKey = "solo" | "ta" | "parkour" | "tower" | "precision" | "reaction" | "coins" | "balance" | "race";
export interface LocalScore { v: number; name: string; date: number; }
const LOWER_BETTER: Record<ScoreKey, boolean> = {
  solo: true, ta: true, parkour: true, tower: true, precision: false, reaction: true, coins: true, balance: false, race: true,
};
const EMPTY: Record<ScoreKey, LocalScore[]> = { solo: [], ta: [], parkour: [], tower: [], precision: [], reaction: [], coins: [], balance: [], race: [] };

export function loadScores(): Record<ScoreKey, LocalScore[]> {
  try {
    const raw = JSON.parse(localStorage.getItem("rpm_scores") || "{}");
    const out = { ...EMPTY } as Record<ScoreKey, LocalScore[]>;
    for (const k of Object.keys(EMPTY) as ScoreKey[]) out[k] = Array.isArray(raw[k]) ? raw[k] : [];
    return out;
  } catch {
    return { ...EMPTY };
  }
}
export function addScore(k: ScoreKey, v: number, name: string): { rank: number; best: boolean } {
  const all = loadScores();
  const list = all[k];
  const prevBest = list[0]?.v;
  const entry = { v, name, date: Date.now() };
  list.push(entry);
  list.sort((a, b) => (LOWER_BETTER[k] ? a.v - b.v : b.v - a.v));
  all[k] = list.slice(0, 10);
  localStorage.setItem("rpm_scores", JSON.stringify(all));
  const rank = all[k].indexOf(entry) + 1;
  const best = prevBest === undefined || (LOWER_BETTER[k] ? v < prevBest : v > prevBest);
  return { rank, best };
}
export function miniValueText(key: string, v: number) {
  if (key === "precision") return t("mini.points", { n: Math.round(v) });
  if (key === "reaction") return t("mini.ms", { n: Math.round(v) });
  if (key === "balance") return t("mini.sec", { n: v.toFixed(1) });
  return fmtTime(v);
}

// ---------------- primitives ----------------
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0d0826]/60 p-2 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`panel modal-anim relative flex max-h-[94vh] w-full flex-col text-white ${wide ? "max-w-4xl" : "max-w-xl"}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="stroke-text text-2xl font-black tracking-tight md:text-3xl">{title}</h2>
          <button onClick={() => { sfx.click(); onClose(); }} className="btn-candy h-10 w-10 bg-[#ff4d6d] text-xl">✕</button>
        </div>
        <div className="scroll-thin overflow-y-auto p-4 md:p-5">{children}</div>
      </div>
    </div>
  );
}

export function Btn({ children, onClick, color = "#7b5cff", className = "", disabled, title }: { children: ReactNode; onClick?: () => void; color?: string; className?: string; disabled?: boolean; title?: string }) {
  return (
    <button title={title} disabled={disabled} onClick={() => { sfx.click(); onClick?.(); }} className={`btn-candy px-4 py-2 ${className}`} style={{ background: color }}>
      {children}
    </button>
  );
}

// ---------------- Shop ----------------
export function ShopModal({ profile, onBuy, onEquip, onOpenCase, onClose, onWatchAd, adBusy = false, adCdLeft = 0 }: {
  profile: Profile; onBuy: (id: string) => void; onEquip: (id: string) => void;
  onOpenCase: (c: CaseDef) => void; onClose: () => void;
  onWatchAd?: () => void; adBusy?: boolean; adCdLeft?: number;
}) {
  const [cat, setCat] = useState<Category | "case">("case");
  const items = cat === "case" ? [] : SHOP.filter((s) => s.cat === cat);
  const cdSec: number = Math.max(0, Math.floor(Number(adCdLeft) || 0));
  const onCd = cdSec > 0;
  return (
    <Modal title={t("shop.title")} onClose={onClose} wide>
      {onWatchAd && (
        <div className="mb-3">
          <Btn className="w-full py-3 text-base" color={adBusy || onCd ? "#555" : "#06d6a0"} disabled={!!adBusy || onCd} onClick={onWatchAd}>
            {adBusy ? t("ad.watching") : onCd ? t("ad.cdBtn", { n: cdSec }) : t("ad.watchCoins")}
          </Btn>
        </div>
      )}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(["case", ...CATEGORIES] as (Category | "case")[]).map((c) => (
            <button key={c} onClick={() => { sfx.click(); setCat(c); }} className={`rounded-full px-3 py-1.5 text-sm font-extrabold transition ${cat === c ? "scale-105 bg-[#ffd23f] text-[#1b1440]" : "bg-white/10 hover:bg-white/20"}`}>
              {c === "case" ? `📦 ${t("cat.case")}` : catLabel(c)}
            </button>
          ))}
        </div>
        <div className="shrink-0 rounded-full bg-black/30 px-3 py-1.5 text-lg font-black text-[#ffd23f]">🪙 {profile.coins}</div>
      </div>
      {cat === "case" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {CASES.map((cs) => {
            const can = profile.coins >= cs.price;
            const odds = [`${cs.odds[0]}%`, `${cs.odds[1]}%`, `${cs.odds[2]}%`];
            return (
              <div key={cs.id} className="flex flex-col items-center rounded-2xl border-2 p-4" style={{ borderColor: `${cs.color}99`, background: `linear-gradient(180deg, ${cs.color}26, rgba(255,255,255,0.04))` }}>
                <div className="relative mb-2 flex h-24 w-24 items-center justify-center">
                  <div className="rays absolute inset-0 rounded-full opacity-40" style={{ background: `conic-gradient(${cs.color}, transparent 25%, ${cs.color} 50%, transparent 75%, ${cs.color})` }} />
                  <span className="relative text-6xl drop-shadow-lg">{cs.icon}</span>
                </div>
                <div className="text-center text-lg font-black" style={{ color: cs.color }}>{t(`case.${cs.id}`)}</div>
                <div className="mb-2 text-center text-xs text-white/70">{t(`case.desc_${cs.id.split("_")[1]}`)}</div>
                <div className="mb-3 flex w-full justify-between rounded-xl bg-black/30 px-2 py-1 text-[11px] font-bold">
                  <span style={{ color: RARITY_COLOR.common }}>{odds[0]}</span>
                  <span style={{ color: RARITY_COLOR.rare }}>{odds[1]}</span>
                  <span style={{ color: RARITY_COLOR.epic }}>{odds[2]}</span>
                </div>
                <Btn className="w-full" color={can ? "#ff9f1c" : "#555"} disabled={!can} onClick={() => onOpenCase(cs)}>
                  🪙 {cs.price} · {t("case.open")}
                </Btn>
              </div>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((it) => {
          const pack = it.cat === "emoji" ? EMOJI_PACKS[it.id] : null;
          const unlocked = profile.unlockedEmojis ?? [];
          const packHave = pack ? pack.filter((e) => unlocked.includes(e)).length : 0;
          const packComplete = !!(pack && packHave >= 4);
          // each owned emoji from pack makes pack 15% cheaper
          const price = pack && it.price > 0
            ? Math.max(0, Math.round(it.price * (1 - 0.15 * packHave)))
            : it.price;
          const owned = profile.owned.includes(it.id) || packComplete;
          const equipped = profile.equipped[it.cat] === it.id;
          const canBuy = profile.coins >= price && !packComplete;
          const rc = RARITY_COLOR[it.rarity];
          return (
            <div key={it.id} className="relative flex flex-col items-center rounded-2xl border-2 p-3 transition" style={{ borderColor: equipped ? "#7dffb0" : `${rc}88`, background: equipped ? "rgba(125,255,176,0.14)" : `linear-gradient(180deg, ${rc}22, rgba(255,255,255,0.04))` }}>
              <div className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black uppercase" style={{ background: rc, color: "#1b1440" }}>{rarityLabel(it.rarity)}</div>
              <div className="mb-1 mt-4 flex h-16 w-16 items-center justify-center rounded-full text-4xl" style={{ background: it.style === "rainbow" ? "conic-gradient(red,orange,yellow,lime,cyan,blue,magenta,red)" : `radial-gradient(circle, ${it.color}66, transparent 70%)` }}>
                {it.icon}
              </div>
              <div className="text-center text-sm font-extrabold">{itemName(it.id)}</div>
              {cat === "emoji" && <div className="mt-1 text-center text-lg leading-tight">{EMOJI_PACKS[it.id]?.join("")}</div>}
              {pack && <div className="mt-0.5 text-[10px] font-bold text-white/50">{packHave}/4</div>}
              <div className="mt-2 w-full">
                {packComplete ? (
                  <div className="rounded-xl bg-[#7dffb0]/80 py-1.5 text-center text-sm font-black text-[#1b1440]">Разблокировано</div>
                ) : equipped ? (
                  <div className="rounded-xl bg-[#7dffb0] py-1.5 text-center text-sm font-black text-[#1b1440]">{t("shop.equipped")}</div>
                ) : owned && !pack ? (
                  <Btn className="w-full text-sm" color="#3a86ff" onClick={() => onEquip(it.id)}>{t("shop.equip")}</Btn>
                ) : owned && pack ? (
                  <Btn className="w-full text-sm" color="#3a86ff" onClick={() => onEquip(it.id)}>{t("shop.equip")}</Btn>
                ) : (
                  <Btn className="w-full text-sm" color={canBuy ? "#ff9f1c" : "#555"} disabled={!canBuy} onClick={() => onBuy(it.id)}>
                    🪙 {price}{price < it.price ? <span className="ml-1 text-[10px] line-through opacity-70">{it.price}</span> : null}
                  </Btn>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-sm text-white/60">{t("shop.hint")}</p>
    </Modal>
  );
}

// ---------------- Case opening ----------------
export function CaseOpenOverlay({ def, owned, unlockedColors, unlockedEmojis = [], onDone, onClose, onEquip }: {
  def: CaseDef; owned: string[]; unlockedColors: string[]; unlockedEmojis?: string[];
  onDone: (res: CaseResult) => void;
  onClose: () => void; onEquip: (id: string) => void;
}) {
  const [phase, setPhase] = useState<"shake" | "reel" | "done">("shake");
  const [reelIdx, setReelIdx] = useState(0);
  const resultRef = useRef(rollCase(def, owned, unlockedColors, Math.random, unlockedEmojis));
  const reported = useRef(false);
  const strip = useRef<(ShopItem | { icon: string; rarity: Rarity; id: string; cat: Category })[]>([]);
  if (!strip.current.length) {
    const pool = SHOP.filter((i) => i.price > 0);
    const arr: typeof strip.current = [];
    for (let i = 0; i < 26; i++) arr.push(pool[Math.floor(Math.random() * pool.length)]);
    const r = resultRef.current;
    if (r.emoji) {
      arr[24] = { id: "emoji_drop", icon: r.emoji, rarity: "rare", cat: "emoji" };
    } else if (r.color) {
      arr[24] = { id: "color_drop", icon: "🎨", rarity: def.id === "case_epic" ? "legendary" : "epic", cat: "skin" };
    } else if (r.item) {
      arr[24] = r.item;
    }
    strip.current = arr;
  }
  useEffect(() => {
    const t1 = setTimeout(() => { setPhase("reel"); sfx.beep(); }, 700);
    return () => clearTimeout(t1);
  }, []);
  useEffect(() => {
    if (phase !== "reel") return;
    let i = 0;
    let delay = 45;
    let stop = false;
    const tick = () => {
      if (stop) return;
      i++;
      setReelIdx(i);
      sfx.click();
      if (i >= 24) {
        setPhase("done");
        const r = resultRef.current;
        if (r.duplicate) sfx.coin(); else sfx.achievement();
        if (!reported.current) { reported.current = true; onDone(r); }
        return;
      }
      delay = i > 16 ? delay * 1.22 : 45;
      setTimeout(tick, delay);
    };
    setTimeout(tick, delay);
    return () => { stop = true; };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = resultRef.current;
  const shown = phase === "done"
    ? (res.emoji
      ? { icon: res.emoji, rarity: "rare" as Rarity, id: "emoji_drop", cat: "emoji" as Category }
      : res.color
        ? { icon: "🎨", rarity: (def.id === "case_epic" ? "legendary" : "epic") as Rarity, id: "color_drop", cat: "skin" as Category }
        : res.item!)
    : strip.current[reelIdx % strip.current.length];
  const rc = RARITY_COLOR[shown?.rarity ?? "common"] ?? "#b8c0d8";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0826]/80 p-3 backdrop-blur-sm">
      <div className="panel modal-anim w-full max-w-md p-6 text-center text-white">
        <div className="text-sm font-bold text-white/60">{t(`case.${def.id}`)}</div>
        {phase !== "done" ? (
          <>
            <div className={`mx-auto mt-4 text-8xl ${phase === "shake" ? "case-shake" : ""}`}>{def.icon}</div>
            <div className={`mt-6 flex h-28 items-center justify-center rounded-2xl ${phase === "reel" ? "reel-glow" : ""}`} style={{ background: `${rc}33`, border: `3px solid ${rc}` }}>
              <span className="text-6xl">{shown.icon}</span>
            </div>
            <div className="mt-3 text-lg font-black">{t("case.opening")}</div>
          </>
        ) : (
          <>
            <div className="relative mx-auto mt-4 flex h-40 w-40 items-center justify-center">
              <div className="rays absolute inset-[-30%] rounded-full opacity-50" style={{ background: `conic-gradient(${rc}, transparent 20%, ${rc} 40%, transparent 60%, ${rc} 80%, transparent)` }} />
              <div className="case-burst relative flex h-32 w-32 items-center justify-center rounded-3xl" style={{ background: `${rc}33`, border: `4px solid ${rc}`, boxShadow: `0 0 40px ${rc}` }}>
                {res.emoji ? (
                  <span className="text-7xl">{res.emoji}</span>
                ) : res.color ? (
                  <div className="h-16 w-16 rounded-full border-4 border-white shadow-lg" style={{ background: res.color }} />
                ) : (
                  <span className="text-7xl">{res.item?.icon ?? "🎁"}</span>
                )}
              </div>
            </div>
            <div className="mt-4 text-xs font-black uppercase tracking-widest" style={{ color: rc }}>{rarityLabel(shown.rarity)}</div>
            <div className="text-3xl font-black">
              {res.emoji ? res.emoji : res.color ? t("case.colorDrop") : res.item ? itemName(res.item.id) : "?"}
            </div>
            <div className="mt-1 text-sm text-white/60">
              {res.emoji ? t("cat.emoji") : res.color ? t("case.colorHint") : res.item ? catLabel(res.item.cat) : ""}
            </div>
            {res.duplicate ? (
              <div className="mt-3 rounded-xl bg-[#ffd23f]/20 py-2 text-lg font-black text-[#ffd23f]">{t("case.duplicate", { n: res.refund })}</div>
            ) : (
              <div className="shine mt-3 rounded-xl py-2 text-lg font-black" style={{ background: rc, color: "#1b1440" }}>{t("case.got")}</div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {!res.duplicate && res.item && <Btn className="flex-1" color="#3a86ff" onClick={() => { onEquip(res.item!.id); onClose(); }}>{t("case.equipNow")}</Btn>}
              <Btn className="flex-1" color="#7b5cff" onClick={onClose}>{t("ui.close")}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- Profile ----------------
export function ProfileModal({ profile, name, user, onColor, onNickColor, onName, onClose, onAuth, onLogout, onDesign }: {
  profile: Profile; name: string; user: { username: string } | null;
  /** Select unlocked colour, or buy+select locked one */
  onColor: (c: string) => void; onNickColor?: (c: string) => void; onName: (n: string) => void; onClose: () => void; onAuth: () => void; onLogout: () => void;
  onDesign?: () => void;
}) {
  const s = profile.stats;
  const [nm, setNm] = useState(name);
  const rows: [string, string | number][] = [
    ["matches", s.matches], ["wins", s.wins], ["winStreak", s.winStreak], ["bestStreak", s.bestStreak], ["podiums", s.podiums],
    ["perfectJumps", s.perfectJumps], ["nearMisses", s.nearMisses], ["pushes", s.pushes], ["pushedTimes", s.pushedTimes],
    ["deaths", s.deaths], ["jumps", s.jumps], ["wallJumps", s.wallJumps], ["sectionsCleared", s.sectionsCleared],
    ["soloRuns", s.soloRuns], ["soloBest", fmtTime(s.soloBest)], ["taRuns", s.taRuns], ["taBest", fmtTime(s.taBest)],
    ["emojis", s.emojis], ["minigames", s.minigames], ["coinsEarned", s.coinsEarned],
  ];
  return (
    <Modal title={t("prof.title")} onClose={onClose} wide>
      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div className="rounded-2xl bg-white/5 p-3">
            {user ? (
              <>
                <div className="text-sm text-white/60">{t("prof.account")}</div>
                <div className="text-2xl font-black">{user.username}</div>
                <div className="mt-1 text-xs text-[#7dffb0]">{t("prof.cloud")}</div>
                <Btn className="mt-3 w-full text-sm" color="#ff4d6d" onClick={onLogout}>{t("prof.logout")}</Btn>
              </>
            ) : (
              <>
                <div className="text-sm text-white/60">{t("prof.guest")}</div>
                <input value={nm} maxLength={16} onChange={(e) => setNm(e.target.value)} onBlur={() => onName(nm.trim() || name)} className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2 font-bold outline-none ring-[#ffd23f] focus:ring-2" />
                <div className="mt-2 text-xs text-[#ffb3c1]">{t("prof.guestWarn")}</div>
                <Btn className="mt-3 w-full text-sm" color="#06d6a0" onClick={onAuth}>{t("prof.loginBtn")}</Btn>
              </>
            )}
          </div>
          {onDesign && (
            <Btn className="w-full text-sm" color="#7b5cff" onClick={onDesign}>🎨 Дизайн персонажа</Btn>
          )}
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="mb-2 text-sm font-bold text-white/70">{t("prof.color")}</div>
            <div className="mb-2 text-[11px] text-white/50">{t("prof.colorHintCase")}</div>
            <div className="mb-2 text-center text-sm font-black text-[#ffd23f]">
              {t("prof.colorBuy", { n: nextColorPrice(profile.unlockedColors ?? FREE_BODY_COLORS) })}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {BODY_COLORS.map((c) => {
                const unlocked = FREE_BODY_COLORS.includes(c) || (profile.unlockedColors ?? FREE_BODY_COLORS).includes(c);
                const selected = profile.color === c;
                const price = nextColorPrice(profile.unlockedColors ?? FREE_BODY_COLORS);
                return (
                  <button
                    key={c}
                    title={unlocked ? c : t("prof.colorBuy", { n: price })}
                    onClick={() => { sfx.click(); onColor(c); }}
                    className={`relative h-9 w-9 rounded-full border-4 transition ${selected ? "scale-110 border-white" : "border-transparent"} ${unlocked ? "" : "opacity-55"}`}
                    style={{ background: c }}
                  >
                    {!unlocked && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-0.5 text-[8px] font-black text-[#ffd23f]">
                        🪙{price}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 p-3">
            <div className="mb-2 text-sm font-bold text-white/70">{t("prof.nickColor")}</div>
            <div className="mb-1 text-[11px] text-white/50">{t("prof.nickColorHint")}</div>
            <div className="grid grid-cols-6 gap-2">
              {NICK_COLORS.map((c) => {
                const unlocked = (profile.unlockedNickColors ?? ["#ffffff"]).includes(c);
                return (
                  <button key={c} onClick={() => { if (!unlocked) return; onNickColor?.(c); }}
                    className={`relative h-8 w-8 rounded-full border-2 ${profile.nickColor === c ? "border-white scale-110" : "border-transparent"} ${unlocked ? "" : "opacity-35 grayscale"}`}
                    style={{ background: c }} title={unlocked ? c : t("prof.colorLocked")} />
                );
              })}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/5 px-3 py-2">
              <div className="text-xs text-white/60">{t(`stat.${k}`)}</div>
              <div className="text-xl font-black text-[#ffd23f]">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Achievements ----------------
export function AchievementsModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  return (
    <Modal title={t("ach.title", { a: profile.achievements.length, b: ACHIEVEMENTS.length })} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {ACHIEVEMENTS.map((a) => {
          const got = profile.achievements.includes(a.id);
          const v = Math.min(a.goal, a.value(profile.stats));
          return (
            <div key={a.id} className={`flex items-center gap-3 rounded-2xl p-3 ${got ? "bg-gradient-to-r from-[#ffd23f]/30 to-[#ff9f1c]/20 ring-2 ring-[#ffd23f]" : "bg-white/5"}`}>
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${got ? "bg-[#ffd23f]" : "bg-black/30 grayscale"}`}>{a.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-black">{achName(a)}</div>
                  <div className="shrink-0 text-xs font-bold text-[#ffd23f]">🪙 {a.reward}</div>
                </div>
                <div className="text-xs text-white/70">{achDesc(a)}</div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-black/40">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#7dffb0] to-[#06d6a0]" style={{ width: `${(v / a.goal) * 100}%` }} />
                </div>
                <div className="mt-0.5 text-right text-[10px] text-white/50">{got ? t("ach.done") : `${v}/${a.goal}`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------------- Settings ----------------
export function SettingsModal({ settings, onChange, onClose, onGyroRequest, onGyroCalibrate, isTouch }: {
  settings: Settings; onChange: (s: Settings) => void; onClose: () => void;
  onGyroRequest: () => Promise<boolean>; onGyroCalibrate: () => void; isTouch: boolean;
}) {
  const [tab, setTab] = useState<"game" | "perf" | "touch" | "admin">("game");
  const [gyroMsg, setGyroMsg] = useState("");
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const setQuality = (q: Quality) => onChange({ ...settings, quality: q, ...QUALITY_PRESETS[q] } as Settings);

  const Toggle = ({ k, label }: { k: "music" | "invertY" | "shake" | "showFps" | "postFx" | "leftHanded"; label: string }) => (
    <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/5 px-4 py-3">
      <span className="font-bold">{label}</span>
      <button onClick={() => { sfx.click(); set(k, !settings[k] as never); }} className={`relative h-8 w-14 rounded-full transition ${settings[k] ? "bg-[#06d6a0]" : "bg-white/20"}`}>
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${settings[k] ? "left-7" : "left-1"}`} />
      </button>
    </label>
  );
  const Slider = ({ k, label, min, max, step, fmt }: { k: keyof Settings; label: string; min: number; max: number; step: number; fmt?: (v: number) => string }) => (
    <div className="rounded-xl bg-white/5 px-4 py-3">
      <div className="mb-1 flex justify-between font-bold"><span>{label}</span><span>{fmt ? fmt(settings[k] as number) : (settings[k] as number).toFixed(1)}</span></div>
      <input type="range" min={min} max={max} step={step} value={settings[k] as number} onChange={(e) => set(k, +e.target.value as never)} className="w-full accent-[#ffd23f]" />
    </div>
  );
  const Seg = <T extends string | number>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) => (
    <div className="flex gap-1.5">
      {options.map(([v, label]) => (
        <button key={String(v)} onClick={() => { sfx.click(); onPick(v); }} className={`flex-1 rounded-xl px-2 py-1.5 text-sm font-black transition ${value === v ? "scale-[1.03] bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Modal title={t("set.title")} onClose={onClose}>
      <div className="mb-4 flex gap-2">
        {([["game", t("set.tabGame")], ["perf", t("set.tabPerf")], ["touch", t("set.tabTouch")], ["admin", "🛡️ Admin"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => { sfx.click(); setTab(id); }} className={`flex-1 rounded-xl py-2 font-black ${tab === id ? "bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>{label}</button>
        ))}
      </div>

      {tab === "game" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <div className="mb-2 font-bold">{t("set.lang")}</div>
            <div className="flex gap-2">
              {LANGS.map((l) => (
                <button key={l.id} onClick={() => { sfx.click(); set("lang", l.id as Lang); }} className={`flex-1 rounded-xl py-2 font-black transition ${settings.lang === l.id ? "scale-105 bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>
                  <span className="mr-1 text-lg">{l.flag}</span>{l.label}
                </button>
              ))}
            </div>
          </div>
          <Slider k="volume" label={t("set.volume")} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider k="sensitivity" label={t("set.sens")} min={0.3} max={2.5} step={0.1} />
          <Toggle k="music" label={t("set.music")} />
          <Toggle k="shake" label={t("set.shake")} />
          <Toggle k="invertY" label={t("set.invert")} />
          <Toggle k="showFps" label={t("set.showFps")} />
          <div className="rounded-xl bg-black/20 p-3 text-sm text-white/70" dangerouslySetInnerHTML={{ __html: t("set.controls") }} />
        </div>
      )}

      {tab === "perf" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <div className="mb-2 font-bold">{t("set.quality")}</div>
            <Seg<Quality> value={settings.quality} options={[["low", t("set.qLow")], ["mid", t("set.qMid")], ["high", t("set.qHigh")]]} onPick={setQuality} />
            <div className="mb-2 mt-3 font-bold">{t("set.sky")}</div>
            <Seg<SkyTheme> value={settings.skyTheme ?? "day"} options={[["day", t("set.skyDay")], ["night", t("set.skyNight")], ["neon", t("set.skyNeon")]]} onPick={(v) => set("skyTheme", v)} />
            <div className="mb-2 mt-3 font-bold">{t("set.weather")}</div>
            <Seg<Weather> value={settings.weather ?? "clear"} options={[["clear", t("set.wClear")], ["rain", t("set.wRain")], ["snow", t("set.wSnow")], ["wind", t("set.wWind")]]} onPick={(v) => set("weather", v)} />
          </div>
          <Slider k="particles" label={t("set.particles")} min={0} max={1} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} />
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <div className="mb-2 font-bold">{t("set.shadows")}</div>
            <Seg value={settings.shadows} options={[["off", t("set.shOff")], ["self", t("set.shSelf")], ["on", t("set.shOn")]]} onPick={(v) => set("shadows", v)} />
          </div>
          <Slider k="drawDistance" label={t("set.draw")} min={1} max={4} step={1} fmt={(v) => String(v)} />
          <Toggle k="postFx" label={t("set.postFx")} />
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <div className="mb-2 font-bold">{t("set.fps")}</div>
            <Seg value={settings.fpsLimit} options={[[30, "30"], [60, "60"], [0, t("set.unlimited")]]} onPick={(v) => set("fpsLimit", v as 0 | 30 | 60)} />
          </div>
        </div>
      )}

      {tab === "touch" && (
        <div className="space-y-3">
          <Slider k="touchScale" label={t("set.touchScale")} min={0.75} max={1.6} step={0.05} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider k="deadzone" label={t("set.deadzone")} min={0} max={0.35} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Toggle k="leftHanded" label={t("set.leftHanded")} />
          <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/5 px-4 py-3">
            <span className="font-bold">{t("set.gyro")}</span>
            <button
              onClick={async () => {
                sfx.click();
                if (!settings.gyro) {
                  const ok = await onGyroRequest();
                  if (!ok) { setGyroMsg(t("set.gyroDenied")); return; }
                  setGyroMsg("");
                }
                set("gyro", !settings.gyro);
              }}
              className={`relative h-8 w-14 rounded-full transition ${settings.gyro ? "bg-[#06d6a0]" : "bg-white/20"}`}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${settings.gyro ? "left-7" : "left-1"}`} />
            </button>
          </label>
          {settings.gyro && (
            <>
              <Slider k="gyroSens" label={t("set.gyroSens")} min={0.3} max={3} step={0.1} />
              <Btn className="w-full" color="#3a86ff" onClick={() => { onGyroCalibrate(); setGyroMsg(t("set.gyroCalDone")); }}>🎯 {t("set.gyroCal")}</Btn>
            </>
          )}
          {gyroMsg && <div className="rounded-xl bg-[#06d6a0]/20 p-2 text-center text-sm font-bold">{gyroMsg}</div>}
          <div className="rounded-xl bg-black/20 p-3 text-sm text-white/70">{t("set.gyroHint")}</div>
          {!isTouch && <div className="rounded-xl bg-black/20 p-3 text-xs text-white/50">🖥️ {t("ui.hintDesktop")}</div>}
        </div>
      )}

      {tab === "admin" && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[#ff4d6d]/15 p-3 text-sm font-bold text-white/90">
            Режим админа доступен для ников: tortiladev, Andi
          </div>
          <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white/5 px-4 py-3">
            <span className="font-bold">🛡️ Режим админа</span>
            <button
              onClick={() => { sfx.click(); set("adminEnabled", !settings.adminEnabled as never); }}
              className={`relative h-8 w-14 rounded-full transition ${settings.adminEnabled ? "bg-[#ff4d6d]" : "bg-white/20"}`}
            >
              <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${settings.adminEnabled ? "left-7" : "left-1"}`} />
            </button>
          </label>
          <div className="rounded-xl bg-black/20 p-3 text-xs text-white/70 space-y-1">
            <div className="font-black text-white">Команды чата (T):</div>
            <div>/help — список</div>
            <div>/fly — полёт по лобби и уровням</div>
            <div>/god — бессмертие</div>
            <div>/coins N — выдать себе монеты</div>
            <div>/give NAME N — выдать другому (локально)</div>
            <div>/kick NAME · /ban NAME</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------- Leaderboard ----------------
export function LeaderboardModal({ onClose, loggedIn }: { onClose: () => void; loggedIn: boolean }) {
  const [tab, setTab] = useState<"global" | "local">("global");
  const [data, setData] = useState<{ top: { username: string; timeMs: number; attempts: number }[]; me: { timeMs: number; rank: number } | null } | null>(null);
  const [mini, setMini] = useState<{ name: string; timeMs: number }[] | null>(null);
  const [err, setErr] = useState("");
  const scores = useMemo(() => (typeof window !== "undefined" ? loadScores() : null), []);
  useEffect(() => {
    fetch("/api/leaderboard").then((r) => r.json()).then(setData).catch(() => setErr(t("board.loadFail")));
    fetch("/api/miniboard").then((r) => r.json()).then((j) => setMini(j.top ?? [])).catch(() => {});
  }, []);
  const medals = ["🥇", "🥈", "🥉"];
  const localRows: [ScoreKey, string][] = [
    ["ta", t("board.ta")], ["solo", t("board.solo")], ["parkour", t("mini.parkour")],
    ["tower", t("mini.tower")], ["precision", t("mini.precision")], ["reaction", t("mini.reaction")],
    ["coins", t("mini.coins")], ["balance", t("mini.balance")], ["race", t("mini.race")],
  ];
  return (
    <Modal title={t("board.title")} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setTab("global")} className={`rounded-full px-4 py-2 font-black ${tab === "global" ? "bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>{t("board.global")}</button>
        <button onClick={() => setTab("local")} className={`rounded-full px-4 py-2 font-black ${tab === "local" ? "bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>{t("board.local")}</button>
      </div>
      {tab === "global" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 font-black text-[#ffd23f]">{t("board.ta")}</div>
            {!loggedIn && <div className="mb-3 rounded-xl bg-[#ff4d6d]/20 p-3 text-sm">{t("board.loginHint")}</div>}
            {data?.me && <div className="mb-3 rounded-xl bg-[#06d6a0]/20 p-3 font-bold">{t("board.yourPlace", { n: data.me.rank, t: fmtTime(data.me.timeMs) })}</div>}
            {err && <div className="text-[#ff8fa3]">{err}</div>}
            {!data && !err && <div className="animate-pulse py-8 text-center">{t("ui.loading")}</div>}
            {data && data.top.length === 0 && <div className="py-8 text-center text-white/60">{t("board.empty")}</div>}
            <div className="space-y-1.5">
              {data?.top.map((r, i) => (
                <div key={r.username} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${i < 3 ? "bg-gradient-to-r from-[#ffd23f]/25 to-transparent" : "bg-white/5"}`}>
                  <div className="w-10 text-center text-xl font-black">{medals[i] ?? `#${i + 1}`}</div>
                  <div className="flex-1 truncate font-extrabold">{r.username}</div>
                  <div className="text-xs text-white/50">{t("board.attempts", { n: r.attempts })}</div>
                  <div className="w-24 text-right font-mono text-lg font-black text-[#ffd23f]">{fmtTime(r.timeMs)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 font-black text-[#7dffcf]">{t("mini.parkour")} 🌍</div>
            {!mini && <div className="animate-pulse py-8 text-center">{t("ui.loading")}</div>}
            {mini && mini.length === 0 && <div className="py-8 text-center text-white/60">{t("board.empty")}</div>}
            <div className="space-y-1.5">
              {mini?.map((r, i) => (
                <div key={r.name + i} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${i < 3 ? "bg-gradient-to-r from-[#7dffcf]/25 to-transparent" : "bg-white/5"}`}>
                  <div className="w-10 text-center text-xl font-black">{medals[i] ?? `#${i + 1}`}</div>
                  <div className="flex-1 truncate font-extrabold">{r.name}</div>
                  <div className="w-24 text-right font-mono text-lg font-black text-[#7dffcf]">{fmtTime(r.timeMs)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {localRows.map(([k, label]) => (
            <div key={k} className="rounded-2xl bg-white/5 p-3">
              <div className="mb-2 font-black">{label}</div>
              {(scores?.[k] ?? []).length === 0 && <div className="text-sm text-white/50">{t("board.noResults")}</div>}
              {(scores?.[k] ?? []).slice(0, 5).map((s, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{medals[i] ?? `#${i + 1}`} {s.name}</span>
                  <span className="font-mono font-bold text-[#ffd23f]">{miniValueText(k, s.v)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------- Lobby browser / create ----------------
export function LobbyBrowserModal({ onClose, onList, onJoin }: { onClose: () => void; onList: () => Promise<RoomInfo[]>; onJoin: (code: string) => Promise<void> }) {
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const refresh = () => { onList().then(setRooms).catch(() => setRooms([])); };
  useEffect(() => { refresh(); const id = setInterval(refresh, 3000); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const join = (c: string) => { setErr(""); onJoin(c).catch((e: Error) => setErr(e.message)); };
  return (
    <Modal title={t("lobby.findTitle")} onClose={onClose}>
      <div className="mb-4 flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("lobby.codePlaceholder")} maxLength={5} className="flex-1 rounded-xl bg-black/30 px-4 py-2 font-mono text-xl font-black tracking-widest outline-none ring-[#ffd23f] focus:ring-2" />
        <Btn color="#06d6a0" onClick={() => join(code)} disabled={code.length < 5}>{t("lobby.join")}</Btn>
      </div>
      {err && <div className="mb-3 rounded-xl bg-[#ff4d6d]/25 p-2 text-sm font-bold">{err}</div>}
      <div className="mb-2 flex items-center justify-between text-sm text-white/70"><span>{t("lobby.open")}</span><button onClick={refresh} className="underline">{t("lobby.refresh")}</button></div>
      {rooms === null && <div className="animate-pulse py-6 text-center">{t("ui.loading")}</div>}
      {rooms?.length === 0 && <div className="rounded-xl bg-white/5 py-6 text-center text-white/60">{t("lobby.none")}</div>}
      <div className="space-y-2">
        {rooms?.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="flex-1">
              <div className="font-black">{r.name}</div>
              <div className="text-xs text-white/60">{r.quick ? t("lobby.quickMatch") : t("lobby.lobby")} · {t("room.code")} {r.code}</div>
            </div>
            <div className="font-black text-[#ffd23f]">{r.players.length}/{r.maxPlayers}</div>
            <Btn color="#3a86ff" className="text-sm" onClick={() => join(r.code)}>{t("lobby.join")}</Btn>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function CreateLobbyModal({ onClose, onCreate, defaultName }: {
  onClose: () => void;
  onCreate: (o: { name: string; maxPlayers: number; isPublic: boolean; botCount: number; botDiff: BotDiff; sectionMin: number; sectionMax: number }) => Promise<void>;
  defaultName: string;
}) {
  const [name, setName] = useState(t("lobby.defaultName", { n: defaultName }));
  const [max, setMax] = useState(12);
  const [pub, setPub] = useState(true);
  const [bots, setBots] = useState(3);
  const [diff, setDiff] = useState<BotDiff>("mixed");
  const [secMin, setSecMin] = useState(5);
  const [secMax, setSecMax] = useState(15);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const maxBots = Math.max(0, max - 1);
  const botCount = Math.min(bots, maxBots);
  const lo = Math.min(secMin, secMax), hi = Math.max(secMin, secMax);
  return (
    <Modal title={t("lobby.createTitle")} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <div className="mb-1 text-sm font-bold text-white/70">{t("lobby.name")}</div>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl bg-black/30 px-4 py-2 font-bold outline-none ring-[#ffd23f] focus:ring-2" />
        </div>
        <div className="rounded-xl bg-white/5 px-4 py-3">
          <div className="mb-1 flex justify-between text-sm font-bold"><span>{t("lobby.maxPlayers")}</span><span className="text-[#ffd23f]">{max}</span></div>
          <input type="range" min={2} max={12} value={max} onChange={(e) => { const v = +e.target.value; setMax(v); if (bots > v - 1) setBots(v - 1); }} className="w-full accent-[#ffd23f]" />
        </div>
        <div className="rounded-xl bg-white/5 px-4 py-3">
          <div className="mb-1 flex justify-between text-sm font-bold"><span>🤖 {t("lobby.bots")}</span><span className="text-[#ffd23f]">{botCount} / {maxBots}</span></div>
          <input type="range" min={0} max={maxBots} value={botCount} onChange={(e) => setBots(+e.target.value)} className="w-full accent-[#ffd23f]" />
          <div className="mt-2 text-sm font-bold text-white/70">{t("lobby.botDiff")}</div>
          <div className="mt-1 flex gap-1.5">
            {(["easy", "mid", "hard", "mixed"] as BotDiff[]).map((d) => (
              <button key={d} onClick={() => { sfx.click(); setDiff(d); }} className={`flex-1 rounded-lg py-1.5 text-xs font-black ${diff === d ? "bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>
                {d === "mixed" ? "🎲" : d === "easy" ? "🟢" : d === "mid" ? "🟡" : "🔴"} {t(`diff.${d}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-white/5 px-4 py-3">
          <div className="mb-1 flex justify-between text-sm font-bold">
            <span>🏁 {t("lobby.sections")}</span>
            <span className="text-[#ffd23f]">{t("lobby.sectionsRange", { a: lo, b: hi })}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-8 text-xs text-white/60">{t("lobby.min")}</span>
            <input type="range" min={5} max={25} value={secMin} onChange={(e) => { const v = +e.target.value; setSecMin(v); if (v > secMax) setSecMax(v); }} className="flex-1 accent-[#7dffb0]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-8 text-xs text-white/60">{t("lobby.max")}</span>
            <input type="range" min={5} max={25} value={secMax} onChange={(e) => { const v = +e.target.value; setSecMax(v); if (v < secMin) setSecMin(v); }} className="flex-1 accent-[#7dffb0]" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPub(true)} className={`flex-1 rounded-xl py-2 font-black ${pub ? "bg-[#06d6a0] text-[#1b1440]" : "bg-white/10"}`}>{t("lobby.public")}</button>
          <button onClick={() => setPub(false)} className={`flex-1 rounded-xl py-2 font-black ${!pub ? "bg-[#ff9f1c] text-[#1b1440]" : "bg-white/10"}`}>{t("lobby.private")}</button>
        </div>
        <div className="rounded-xl bg-black/20 p-2 text-center text-sm font-bold text-white/80">
          {t("lobby.summary", { p: max, b: botCount, s: t("lobby.sectionsRange", { a: lo, b: hi }) })}
        </div>
        {err && <div className="rounded-xl bg-[#ff4d6d]/25 p-2 text-sm font-bold">{err}</div>}
        <Btn className="w-full py-3 text-xl" color="#ff5fc8" disabled={busy}
          onClick={() => {
            setBusy(true);
            onCreate({ name, maxPlayers: max, isPublic: pub, botCount, botDiff: diff, sectionMin: lo, sectionMax: hi })
              .catch((e: Error) => { setErr(e.message); setBusy(false); });
          }}>{t("lobby.create")}</Btn>
      </div>
    </Modal>
  );
}

// ---------------- Auth ----------------
export function AuthModal({ onClose, onDone }: { onClose: () => void; onDone: (mode: "login" | "register", u: string, p: string) => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = () => { setBusy(true); setErr(""); onDone(mode, u, p).catch((e: Error) => { setErr(e.message); setBusy(false); }); };
  return (
    <Modal title={mode === "login" ? t("auth.login") : t("auth.register")} onClose={onClose}>
      <div className="mb-4 flex gap-2">
        <button onClick={() => setMode("register")} className={`flex-1 rounded-xl py-2 font-black ${mode === "register" ? "bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>{t("auth.tabRegister")}</button>
        <button onClick={() => setMode("login")} className={`flex-1 rounded-xl py-2 font-black ${mode === "login" ? "bg-[#ffd23f] text-[#1b1440]" : "bg-white/10"}`}>{t("auth.tabLogin")}</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
        <input value={u} onChange={(e) => setU(e.target.value)} placeholder={t("auth.nick")} maxLength={16} autoComplete="username" className="w-full rounded-xl bg-black/30 px-4 py-3 font-bold outline-none ring-[#ffd23f] focus:ring-2" />
        <input value={p} onChange={(e) => setP(e.target.value)} placeholder={t("auth.password")} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className="w-full rounded-xl bg-black/30 px-4 py-3 font-bold outline-none ring-[#ffd23f] focus:ring-2" />
        {err && <div className="rounded-xl bg-[#ff4d6d]/25 p-2 text-sm font-bold">{err}</div>}
        <button type="submit" disabled={busy} className="btn-candy w-full bg-[#06d6a0] py-3 text-xl">{mode === "login" ? t("auth.tabLogin") : t("auth.create")}</button>
        {mode === "register" && <p className="text-center text-xs text-white/60">{t("auth.transfer")}</p>}
      </form>
    </Modal>
  );
}

// ---------------- Results ----------------
export function ResultsModal({ r, best, rank, onAgain, onHub, onBoard, submitMsg }: { r: FinishResult; best: boolean; rank: number; onAgain?: () => void; onHub: () => void; onBoard?: () => void; submitMsg: string }) {
  const title = r.dnf ? t("res.timeUp") : r.mode === "multi" ? (r.place === 1 ? t("res.victory") : t("res.place", { n: r.place })) : t("res.finish");
  const [coinsShown, setCoinsShown] = useState(0);
  useEffect(() => {
    let v = 0;
    const id = setInterval(() => { v = Math.min(r.coins, v + Math.max(1, Math.ceil(r.coins / 25))); setCoinsShown(v); if (v % 3 === 0) sfx.click(); if (v >= r.coins) clearInterval(id); }, 40);
    return () => clearInterval(id);
  }, [r.coins]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === "KeyR" && onAgain) onAgain(); if (e.code === "Enter") onHub(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onAgain, onHub]);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0d0826]/55 p-2 backdrop-blur-sm">
      <div className="panel modal-anim w-full max-w-lg p-5 text-white">
        <div className="text-center">
          <div className="text-6xl">{r.dnf ? "⌛" : r.mode === "multi" ? (medals[r.place - 1] ?? "🏁") : "🏁"}</div>
          <div className="game-title text-5xl md:text-6xl">{title}</div>
          <div className="mt-1 text-sm font-bold text-white/60">{r.mode === "multi" ? t("res.multi", { n: r.sections }) : r.mode === "ta" ? t("res.taMode") : t("res.soloMode")}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[[t("res.time"), r.dnf ? "—" : fmtTime(r.timeMs)], [t("res.score"), r.score.toLocaleString()], [t("res.perfect"), r.perfects], [t("res.deaths"), r.deaths]].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl bg-white/10 p-2 text-center">
              <div className="text-xs text-white/60">{k}</div>
              <div className="text-lg font-black">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#ffd23f]/30 to-[#ff9f1c]/30 py-3 text-3xl font-black text-[#ffd23f]">
          🪙 +{coinsShown}
        </div>
        {best && !r.dnf && r.mode !== "multi" && <div className="shine mt-2 rounded-xl bg-[#ff5fc8] py-2 text-center text-lg font-black">{t("res.newRecord", { r: rank > 0 ? t("res.localRank", { n: rank }) : "" })}</div>}
        {submitMsg && <div className="mt-2 text-center text-sm font-bold text-[#7dffb0]">{submitMsg}</div>}
        {r.mode === "multi" && (
          <div className="scroll-thin mt-3 max-h-48 space-y-1 overflow-y-auto">
            {r.roster.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${p.me ? "bg-[#ffd23f] font-black text-[#1b1440]" : "bg-white/5"}`}>
                <span className="w-7">{medals[i] ?? `#${i + 1}`}</span>
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-mono">{p.finishMs !== null ? fmtTime(p.finishMs) : `${Math.round(p.progress * 100)}%`}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {onAgain && <Btn className="pulse-glow flex-1 py-3 text-lg" color="#06d6a0" onClick={onAgain}>{t("res.again")}</Btn>}
          {onBoard && <Btn className="flex-1 py-3 text-lg" color="#ff9f1c" onClick={onBoard}>{t("res.top")}</Btn>}
          <Btn className="flex-1 py-3 text-lg" color="#7b5cff" onClick={onHub}>{t("pause.toHub")}</Btn>
        </div>
      </div>
    </div>
  );
}

// ---------------- Reaction minigame ----------------
export function ReactionOverlay({ onDone, onClose }: { onDone: (ms: number) => void; onClose: () => void }) {
  const [state, setState] = useState<"wait" | "ready" | "go" | "early" | "done">("wait");
  const [ms, setMs] = useState(0);
  const goAt = useRef(0);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    timer.current = window.setTimeout(() => setState("ready"), 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, []);
  useEffect(() => {
    if (state === "ready") {
      timer.current = window.setTimeout(() => { goAt.current = performance.now(); setState("go"); sfx.beep(true); }, 1200 + Math.random() * 2600);
    }
  }, [state]);
  const tap = () => {
    if (state === "ready") { if (timer.current) clearTimeout(timer.current); setState("early"); sfx.lose(); }
    else if (state === "go") { const v = performance.now() - goAt.current; setMs(v); setState("done"); sfx.perfect(); onDone(v); }
    else if (state === "early" || state === "done") { setState("ready"); }
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); tap(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const bg = state === "go" ? "#06d6a0" : state === "ready" ? "#ef233c" : state === "early" ? "#ff9f1c" : "#3a2a7a";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) tap(); }} style={{ background: `${bg}dd` }}>
      <div className="pointer-events-none text-center text-white">
        <div className="stroke-text text-5xl font-black md:text-7xl">
          {state === "wait" && t("react.title")}
          {state === "ready" && t("react.wait")}
          {state === "go" && t("react.go")}
          {state === "early" && t("react.early")}
          {state === "done" && t("mini.ms", { n: Math.round(ms) })}
        </div>
        <div className="mt-4 text-lg font-bold opacity-80">
          {state === "done" ? `${ms < 220 ? t("react.fast") : ms < 300 ? t("react.good") : t("react.ok")} ${t("react.again")}` : state === "early" ? t("react.retry") : t("react.hint")}
        </div>
      </div>
      <button onClick={onClose} className="btn-candy absolute right-4 top-4 bg-[#ff4d6d] px-4 py-2 text-lg">✕ {t("ui.close")}</button>
    </div>
  );
}


// ---------------- Character Designer ----------------
export function CharacterDesignerModal({ profile, onEquip, onSlots, onColor, onClose, onRotate }: {
  profile: Profile;
  onEquip: (id: string) => void;
  onSlots: (slots: [string, string, string, string]) => void;
  onColor: (c: string) => void;
  onClose: () => void;
  onRotate?: () => void;
}) {
  const [tab, setTab] = useState<Category | "color" | "slots">("skin");
  const owned = new Set(profile.owned);
  // badges: shop badges + achievement icons as wearable badges
  const achBadges = (profile.achievements ?? []).map((id) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    return a ? { id: `achbadge_${a.id}`, cat: "badge" as Category, price: 0, color: "#ffd23f", icon: a.icon, rarity: "rare" as const } : null;
  }).filter(Boolean) as typeof SHOP;
  const items = tab === "color" || tab === "slots" ? []
    : tab === "badge"
      ? [...SHOP.filter((s) => s.cat === "badge" && (s.price === 0 || owned.has(s.id))), ...achBadges]
      : SHOP.filter((s) => s.cat === tab && (s.price === 0 || owned.has(s.id)));
  const slots = profile.emojiSlots ?? ["😀", "😂", "👍", "😭"];
  const unlocked = profile.unlockedEmojis ?? slots;
  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Back button — top left */}
      <button
        onClick={onClose}
        className="pointer-events-auto btn-candy absolute left-3 top-3 z-50 bg-[#1b1440]/90 px-4 py-2 text-sm font-black text-white shadow-lg"
      >
        ← Выйти назад
      </button>
      {/* Rotate camera — top center */}
      <button
        onClick={() => onRotate?.()}
        className="pointer-events-auto btn-candy absolute left-1/2 top-3 z-50 -translate-x-1/2 bg-[#7b5cff] px-5 py-2 text-sm font-black text-white shadow-lg"
      >
        🔄 Вращать
      </button>
      {/* Right panel only — no overlay blur, so 3D stays sharp */}
      <div className="pointer-events-auto absolute bottom-0 right-0 top-0 flex w-full max-w-md flex-col overflow-y-auto bg-[#1b1440]/92 p-4 text-white shadow-2xl md:w-[28rem]">
        <div className="mb-3 game-title text-2xl">🎨 Дизайн персонажа</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {(["skin", "hat", "footprint", "landing", "death", "aura", "trail", "emoji", "badge", "color", "slots"] as const).map((c) => (
            <button key={c} onClick={() => setTab(c)}
              className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${tab === c ? "bg-[#ffd23f] text-[#1b1440]" : "bg-white/10 text-white"}`}>
              {c === "color" ? "🎨 Цвет" : c === "slots" ? "1–4 Эмодзи" : catLabel(c as Category)}
            </button>
          ))}
        </div>
        {tab === "color" && (
          <div className="grid grid-cols-6 gap-2">
            {(profile.unlockedColors ?? []).map((c) => (
              <button key={c} onClick={() => onColor(c)} className="h-10 rounded-xl border-2" style={{ background: c, borderColor: profile.color === c ? "#fff" : "transparent" }} />
            ))}
          </div>
        )}
        {tab === "slots" && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((slot) => (
              <div key={slot} className="rounded-xl bg-white/5 p-2">
                <div className="mb-1 text-xs font-bold text-white/60">Слот {slot + 1}: {slots[slot]}</div>
                <div className="flex flex-wrap gap-1">
                  {unlocked.map((e) => {
                    const usedElsewhere = slots.some((s, i) => i !== slot && s === e);
                    return (
                      <button key={e + slot} disabled={usedElsewhere}
                        onClick={() => {
                          if (usedElsewhere) return;
                          const next = [...slots] as [string, string, string, string];
                          next[slot] = e;
                          onSlots(next);
                        }}
                        className={`rounded-lg px-2 py-1 text-lg ${slots[slot] === e ? "bg-[#06d6a0]" : usedElsewhere ? "bg-white/5 opacity-30" : "bg-white/10"}`}
                      >{e}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab !== "color" && tab !== "slots" && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {items.map((it) => (
              <button key={it.id} onClick={() => onEquip(it.id)}
                className={`flex flex-col items-center rounded-xl border-2 p-2 ${profile.equipped[tab as Category] === it.id ? "border-[#7dffb0] bg-[#7dffb033]" : "border-white/10 bg-white/5"}`}>
                <span className="text-2xl">{it.icon}</span>
                <span className="mt-1 text-[10px] font-bold text-white/80">{itemName(it.id)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
