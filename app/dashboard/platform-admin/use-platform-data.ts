'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type LoadState<T> = {
  url: string;
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function usePlatformData<T>(url: string) {
  const [state, setState] = useState<LoadState<T>>({ url, data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const session = (await supabase?.auth.getSession())?.data.session;
        if (!session) throw new Error('Sign in with a Platform Admin account to access this page.');
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Platform Admin data could not be loaded.');
        if (!controller.signal.aborted) setState({ url, data: result, loading: false, error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({ url, data: null, loading: false, error: error instanceof Error ? error.message : 'Platform Admin data could not be loaded.' });
        }
      }
    };
    void load();
    const listener = supabase?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        controller.abort();
        setState({ url, data: null, loading: true, error: null });
        setRevision((current) => current + 1);
      }
    });
    return () => {
      controller.abort();
      listener?.data.subscription.unsubscribe();
    };
  }, [url, revision]);

  return state.url === url ? state : { url, data: null, loading: true, error: null };
}
