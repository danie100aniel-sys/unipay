'use client';

import { useEffect, useCallback } from 'react';

export function useAutoLock(onLock: () => void, timeoutMs: number = 3 * 60 * 1000) {
  const handleLock = useCallback(() => {
  localStorage.removeItem('unipay_token');
  onLock();
}, [onLock]);
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(handleLock, timeoutMs);
    };

    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [handleLock, timeoutMs]);
}