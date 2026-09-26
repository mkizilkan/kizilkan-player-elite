/**
 * KIZILKAN PLAYER — TV Focus Memory / Restore (v17.0.0 → v18.0.0)
 *
 * Hedef:
 * - Player/modal gibi geçici yüzeyler odağı çaldıktan sonra alttaki ekranda
 *   kullanıcının bıraktığı öğeyi tekrar odaklamak.
 * - Index tabanlı değil stable key tabanlı çalışmak; liste sırası değişse bile
 *   yanlış karta dönmemek.
 * - Telefon dokunmatik davranışını etkilememek.
 *
 * v18.0.0 — ODAK GERİ YÜKLEME SÖZLEŞMESİ:
 * - İstek artık sabit kısa bir süre sonra (220/420 ms) SİLİNMEZ. TV'de hedef
 *   öğe gerçekten odak aldığında (bind().rememberFocus) "fulfilled" olur;
 *   telefonda ekran ortalamayı bitirince clearRestore(nonce, "centered") çağırır.
 *   Hiçbiri olmazsa üst sınır (TV 4 sn / telefon 2,5 sn) isteği kapatır.
 * - Her isteğin sonucu FOCUS_RESTORE_RESULT olarak kayda geçer (sessiz çıkış yok).
 * - remember() telefon için de basış anında çağrılabilir (dokunma focus olayı üretmez).
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { usePathname } from "expo-router";
import { useTv } from "@/src/store/TvContext";
import { recordDiagnostic } from "@/src/utils/diagnostics";

type RestoreRequest = { scope: string; key: string; nonce: number; startedAt: number; source: string } | null;

type TvFocusMemoryValue = {
  scope: string;
  isTv: boolean;
  remember: (scope: string, key: string) => void;
  rememberedKey: (scope: string) => string | null;
  requestRestore: (scope?: string, key?: string, source?: string) => void;
  restoreRequest: RestoreRequest;
  clearRestore: (nonce?: number, reason?: string) => void;
  fulfillRestore: (nonce: number, via: string) => void;
  routeScope: string;
};

const FocusMemoryContext = createContext<TvFocusMemoryValue | null>(null);
const FocusScopeContext = createContext<string | null>(null);

/** v18.0.0: hedef satırın büyük listede ölçülüp mount olması için tanınan üst süre. */
const RESTORE_TIMEOUT_TV_MS = 4000;
const RESTORE_TIMEOUT_TOUCH_MS = 2500;

export function TvFocusMemoryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isTv } = useTv();
  const routeScope = `route:${pathname || "/"}`;
  const rememberedRef = useRef(new Map<string, string>());
  const [restoreRequest, setRestoreRequest] = useState<RestoreRequest>(null);
  const restoreRequestRef = useRef<RestoreRequest>(null);
  const restoreNonceRef = useRef(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback((nonce: number | undefined, outcome: string, via: string) => {
    const current = restoreRequestRef.current;
    if (!current || (nonce !== undefined && current.nonce !== nonce)) return;
    restoreRequestRef.current = null;
    setRestoreRequest(prev => (prev && prev.nonce === current.nonce) ? null : prev);
    if (clearTimerRef.current) { clearTimeout(clearTimerRef.current); clearTimerRef.current = null; }
    void recordDiagnostic("navigation", "FOCUS_RESTORE_RESULT", {
      scope: current.scope, key: current.key, source: current.source, outcome, via, isTv,
      elapsedMs: Date.now() - current.startedAt,
    }, { stage: "focus-restore", outcome, durationMs: Date.now() - current.startedAt });
  }, [isTv]);

  const remember = useCallback((scope: string, key: string) => {
    // v17.10.0: konum hafızası artık yalnız TV focus hafızası değil. Telefon/tablet
    // Player dönüşünde de aynı stable key kullanılır; native preferred-focus ise
    // yalnız TV tarafında uygulanmaya devam eder.
    if (!scope || !key) return;
    rememberedRef.current.set(scope, key);
  }, []);

  const rememberedKey = useCallback((scope: string) => rememberedRef.current.get(scope) || null, []);

  const requestRestore = useCallback((requestedScope?: string, requestedKey?: string, source?: string) => {
    const scope = requestedScope || routeScope;
    const key = requestedKey || rememberedRef.current.get(scope);
    if (!key) {
      void recordDiagnostic("navigation", "FOCUS_RESTORE_SKIP", { scope, source: source || "unknown", reason: "no-remembered-key", isTv }, { stage: "focus-restore", outcome: "skipped" });
      return;
    }
    if (requestedKey) rememberedRef.current.set(scope, requestedKey);
    // Önceki istek hâlâ açıksa yenisi onu devralır; sonucu kayda geçsin.
    if (restoreRequestRef.current) finish(restoreRequestRef.current.nonce, "superseded", "new-request");
    const nonce = ++restoreNonceRef.current;
    const req = { scope, key, nonce, startedAt: Date.now(), source: source || "unknown" };
    restoreRequestRef.current = req;
    setRestoreRequest(req);
    void recordDiagnostic("navigation", "FOCUS_RESTORE_REQUEST", { scope, key, source: req.source, isTv }, { stage: "focus-restore", outcome: "started" });
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    // hasTVPreferredFocus prop değişimini native focus engine'in görmesi için
    // pencere bırakılır; kalıcı preferred focus tutulmaz. Hedef odak alırsa
    // (fulfillRestore) pencere erken kapanır.
    clearTimerRef.current = setTimeout(() => {
      clearTimerRef.current = null;
      finish(nonce, isTv ? "timeout" : "window-closed", "timer");
    }, isTv ? RESTORE_TIMEOUT_TV_MS : RESTORE_TIMEOUT_TOUCH_MS);
  }, [isTv, routeScope, finish]);

  const clearRestore = useCallback((nonce?: number, reason?: string) => {
    finish(nonce, "cleared", reason || "explicit");
  }, [finish]);

  const fulfillRestore = useCallback((nonce: number, via: string) => {
    finish(nonce, "success", via);
  }, [finish]);

  const value = useMemo<TvFocusMemoryValue>(() => ({
    scope: routeScope,
    isTv,
    remember,
    rememberedKey,
    requestRestore,
    restoreRequest,
    clearRestore,
    fulfillRestore,
    routeScope,
  }), [routeScope, isTv, remember, rememberedKey, requestRestore, restoreRequest, clearRestore, fulfillRestore]);

  return <FocusMemoryContext.Provider value={value}>{children}</FocusMemoryContext.Provider>;
}

export function TvFocusScope({ scope, children }: { scope: string; children: React.ReactNode }) {
  return <FocusScopeContext.Provider value={scope}>{children}</FocusScopeContext.Provider>;
}

export function useTvFocusMemory(explicitScope?: string) {
  const ctx = useContext(FocusMemoryContext);
  const nestedScope = useContext(FocusScopeContext);
  const scope = explicitScope || nestedScope || ctx?.routeScope || "route:/";

  const bind = useCallback((key?: string | null) => {
    const stableKey = key || "";
    const req = ctx?.restoreRequest;
    const requested = !!ctx?.isTv && !!stableKey && req?.scope === scope && req.key === stableKey;
    return {
      hasTVPreferredFocus: requested,
      rememberFocus: () => {
        if (!stableKey) return;
        ctx?.remember(scope, stableKey);
        // v18.0.0: hedef öğe gerçekten odak aldı → geri yükleme tamamlandı.
        if (requested && req) ctx?.fulfillRestore(req.nonce, "focus");
      },
    };
  }, [ctx, scope]);

  const requestRestore = useCallback((targetScope?: string, targetKey?: string, source?: string) => { ctx?.requestRestore(targetScope || scope, targetKey, source); }, [ctx, scope]);
  const requestRouteRestore = useCallback(() => { if (ctx) ctx.requestRestore(ctx.routeScope, undefined, "route"); }, [ctx]);
  /** v18.0.0: telefonda basış anında hedefi kaydetmek için (dokunma focus olayı üretmez). */
  const remember = useCallback((key: string) => { ctx?.remember(scope, key); }, [ctx, scope]);
  const rememberedKey = useCallback(() => ctx?.rememberedKey(scope) || null, [ctx, scope]);

  return {
    scope,
    isTv: !!ctx?.isTv,
    bind,
    remember,
    rememberedKey,
    requestRestore,
    requestRouteRestore,
    routeScope: ctx?.routeScope || scope,
    restoreRequest: ctx?.restoreRequest?.scope === scope ? ctx.restoreRequest : null,
    clearRestore: ctx?.clearRestore || (() => {}),
  };
}
