'use client';

import { useSyncExternalStore } from 'react';

export type TimeFormat = '12' | '24';

const KEY = 'landbaron-time-format';
const EVENT = 'landbaron-time-format-changed';

const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
};

const getSnapshot = (): TimeFormat => window.localStorage.getItem(KEY) === '24' ? '24' : '12';
const getServerSnapshot = (): TimeFormat => '12';

export function useTimeFormat() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setTimeFormat(format: TimeFormat) {
  window.localStorage.setItem(KEY, format);
  window.dispatchEvent(new Event(EVENT));
}

export function formatTimestamp(value: string, format: TimeFormat) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', hour12: format === '12' });
}