import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Runs `fn` whenever Kar comes back on screen: the app returns to the foreground, or the browser tab becomes
 * visible again. Used to re-check location after the user changes it in their settings.
 */
export function useOnReturn(fn: () => void) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const onVisible = () => {
        if (document.visibilityState === 'visible') latest.current();
      };
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('focus', onVisible);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('focus', onVisible);
      };
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') latest.current();
    });
    return () => sub.remove();
  }, []);
}
