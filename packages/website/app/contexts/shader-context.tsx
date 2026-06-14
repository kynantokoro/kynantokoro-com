import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_PARAMS, DEFAULT_SHADER, isShaderId, type ShaderId } from "../lib/shaders";

const STORAGE_KEY = "bg-shader";
const PARAMS_KEY = "bg-params";

interface ShaderContextValue {
  /** Currently selected wallpaper ("off" = solid background). */
  shader: ShaderId;
  setShader: (id: ShaderId) => void;
  /** Accent hue (degrees) the wallpaper tints toward. Synced from the home
   *  page key visual so the background echoes its randomised colour. */
  accentHue: number;
  setAccentHue: (hue: number) => void;
  /** Live-tunable look parameters (see PARAM_DEFS / ShaderTunePanel). */
  params: Record<string, number>;
  setParam: (key: string, value: number) => void;
  resetParams: () => void;
}

const ShaderContext = createContext<ShaderContextValue | undefined>(undefined);

export function ShaderProvider({ children }: { children: React.ReactNode }) {
  // SSR-stable defaults; stored preferences are applied after mount to avoid
  // hydration mismatches.
  const [shader, setShaderState] = useState<ShaderId>(DEFAULT_SHADER);
  const [accentHue, setAccentHue] = useState<number>(210);
  const [params, setParams] = useState<Record<string, number>>(DEFAULT_PARAMS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isShaderId(stored)) setShaderState(stored);
    } catch {
      // localStorage unavailable — keep the default.
    }
    try {
      const raw = localStorage.getItem(PARAMS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, number>;
        setParams((prev) => ({ ...prev, ...saved }));
      }
    } catch {
      // Ignore malformed stored params.
    }
  }, []);

  const setShader = useCallback((id: ShaderId) => {
    setShaderState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore persistence failures.
    }
  }, []);

  const setParam = useCallback((key: string, value: number) => {
    setParams((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(PARAMS_KEY, JSON.stringify(next));
      } catch {
        // Ignore persistence failures.
      }
      return next;
    });
  }, []);

  const resetParams = useCallback(() => {
    setParams(DEFAULT_PARAMS);
    try {
      localStorage.removeItem(PARAMS_KEY);
    } catch {
      // Ignore persistence failures.
    }
  }, []);

  return (
    <ShaderContext.Provider
      value={{ shader, setShader, accentHue, setAccentHue, params, setParam, resetParams }}
    >
      {children}
    </ShaderContext.Provider>
  );
}

export function useShader(): ShaderContextValue {
  const context = useContext(ShaderContext);
  if (!context) {
    throw new Error("useShader must be used within a ShaderProvider");
  }
  return context;
}
