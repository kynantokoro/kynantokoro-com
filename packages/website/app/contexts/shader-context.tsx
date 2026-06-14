import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_SHADER, isShaderId, type ShaderId } from "../lib/shaders";

const STORAGE_KEY = "bg-shader";

interface ShaderContextValue {
  /** Currently selected wallpaper ("off" = solid background). */
  shader: ShaderId;
  setShader: (id: ShaderId) => void;
  /** Accent hue (degrees) the wallpaper tints toward. Synced from the home
   *  page key visual so the background echoes its randomised colour. */
  accentHue: number;
  setAccentHue: (hue: number) => void;
}

const ShaderContext = createContext<ShaderContextValue | undefined>(undefined);

export function ShaderProvider({ children }: { children: React.ReactNode }) {
  // SSR-stable defaults; the stored preference is applied after mount to avoid
  // hydration mismatches. The inline script in root.tsx mirrors this default
  // when deciding whether to make the page background transparent on first
  // paint, so there is no flash.
  const [shader, setShaderState] = useState<ShaderId>(DEFAULT_SHADER);
  const [accentHue, setAccentHue] = useState<number>(210);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isShaderId(stored)) setShaderState(stored);
    } catch {
      // localStorage unavailable (e.g. privacy mode) — keep the default.
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

  return (
    <ShaderContext.Provider value={{ shader, setShader, accentHue, setAccentHue }}>
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
