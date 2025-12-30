import React, { createContext, useContext, useState } from 'react';

interface FooterMarginContextValue {
  hasBottomMargin: boolean;
  setHasBottomMargin: (value: boolean) => void;
}

const FooterMarginContext = createContext<FooterMarginContextValue | undefined>(undefined);

interface FooterMarginProviderProps {
  children: React.ReactNode;
}

export function FooterMarginProvider({ children }: FooterMarginProviderProps) {
  const [hasBottomMargin, setHasBottomMargin] = useState(false);

  return (
    <FooterMarginContext.Provider value={{ hasBottomMargin, setHasBottomMargin }}>
      {children}
    </FooterMarginContext.Provider>
  );
}

export function useFooterMargin() {
  const context = useContext(FooterMarginContext);
  if (!context) {
    throw new Error('useFooterMargin must be used within a FooterMarginProvider');
  }
  return context;
}
