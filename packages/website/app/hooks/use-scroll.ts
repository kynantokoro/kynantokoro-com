import { useEffect, useState } from 'react';

export function useScrollPosition() {
  const [scrollY, setScrollY] = useState(0);
  const [isAtTop, setIsAtTop] = useState<boolean | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);
      setIsAtTop(currentScrollY < 10);
    };

    handleScroll(); // Set initial values
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return { scrollY, isAtTop };
}