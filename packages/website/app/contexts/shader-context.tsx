import React, { createContext, useCallback, useContext, useState } from "react";

interface ShaderContextValue {
  /** Accent hue (degrees) the wallpaper tints toward — the colour of the
   *  current page's key visual. */
  accentHue: number;
  /** Set the accent hue AND trigger a (re)animation. Called by each page on
   *  mount/navigation with its key-visual colour. */
  reveal: (hue: number) => void;
  /** Increments on every reveal(); the renderer animates whenever it changes. */
  revealId: number;
}

const ShaderContext = createContext<ShaderContextValue | undefined>(undefined);

export function ShaderProvider({ children }: { children: React.ReactNode }) {
  const [accentHue, setAccentHue] = useState<number>(210);
  const [revealId, setRevealId] = useState<number>(0);

  const reveal = useCallback((hue: number) => {
    setAccentHue(hue);
    setRevealId((n) => n + 1);
  }, []);

  return (
    <ShaderContext.Provider value={{ accentHue, reveal, revealId }}>
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
