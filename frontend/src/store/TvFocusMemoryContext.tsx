/**
 * KIZILKAN PLAYER — TV Focus Memory / Restore (v17.0.0)
 *
 * Hedef:
 * - Player/modal gibi geçici yüzeyler odağı çaldıktan sonra alttaki ekranda
 *   kullanıcının bıraktığı öğeyi tekrar odaklamak.
 * - Index tabanlı değil stable key tabanlı çalışmak; liste sırası değişse bile
 *   yanlış karta dönmemek.
 * - Telefon dokunmatik davranışını etkilememek.
 */
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { usePathname } from "expo-router";
import { useTv } from "@/src/store/TvContext";

type RestoreRequest = { scope: string; key: string; nonce: number } | null;

type TvFocusMemoryValue = {
  scope: string;
  remember: (scope: string, key: string) => void;
  rememberedKey: (scope: string) => string | null;
  requestRestore: (scope?: string) => void;
  restoreRequest: RestoreRequest;
  routeScope: string;
};

const FocusMemoryContext = createContext<TvFocusMemoryValue | null>(null);
const FocusScopeContext = createContext<string | null>(null);

export function TvFocusMemoryProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isTv } = useTv();
  const routeScope = `route:${pathname || "/"}`;
  const rememberedRef = useRef(new Map<string, string>());
  const [restoreRequest, setRestoreRequest] = useState<RestoreRequest>(null);
  const restoreNonceRef = useRef(0);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remember = useCallback((scope: string, key: string) => {
    if (!isTv || !scope || !key) return;
    rememberedRef.current.set(scope, key);
  }, [isTv]);

  const rememberedKey = useCallback((scope: string) => rememberedRef.current.get(scope) || null, []);

  const requestRestore = useCallback((requestedScope?: string) => {
    if (!isTv) return;
    const scope = requestedScope || routeScope;
    const key = rememberedRef.current.get(scope);
    if (!key) return;
    const nonce = ++restoreNonceRef.current;
    setRestoreRequest({ scope, key, nonce });
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    // hasTVPreferredFocus prop değişimini native focus engine'in görmesi için
    // kısa bir pencere bırakılır; kalıcı preferred focus tutulmaz.
    clearTimerRef.current = setTimeout(() => {
      setRestoreRequest(prev => prev?.nonce === nonce ? null : prev);
      clearTimerRef.current = null;
    }, 350);
  }, [isTv, routeScope]);

  const value = useMemo<TvFocusMemoryValue>(() => ({
    scope: routeScope,
    remember,
    rememberedKey,
    requestRestore,
    restoreRequest,
    routeScope,
  }), [routeScope, remember, rememberedKey, requestRestore, restoreRequest]);

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
    const requested = !!stableKey && ctx?.restoreRequest?.scope === scope && ctx.restoreRequest.key === stableKey;
    return {
      hasTVPreferredFocus: requested,
      rememberFocus: () => { if (stableKey) ctx?.remember(scope, stableKey); },
    };
  }, [ctx, scope]);

  const requestRestore = useCallback((targetScope?: string) => { ctx?.requestRestore(targetScope || scope); }, [ctx, scope]);
  const requestRouteRestore = useCallback(() => { if (ctx) ctx.requestRestore(ctx.routeScope); }, [ctx]);

  return {
    scope,
    bind,
    requestRestore,
    requestRouteRestore,
    routeScope: ctx?.routeScope || scope,
  };
}
