'use client';

import { AvatarPhotoBadge } from '../avatar-photo-badge';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fetchUserRole, type SessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Breadcrumbs } from '../breadcrumbs';
import { DashboardNavButtons } from '../nav-buttons';
import { setTimeFormat, useTimeFormat, type TimeFormat } from '@/lib/time-format';
import { getLanguagePreference, getTemperatureUnit, languageOptions, setSavedLanguagePreference, type LanguagePreference, type TemperatureUnit } from '@/lib/temperature';
import { estimateRemainingDays, getZodiacSign, type ProfileGender } from '@/lib/profile-insights';

type SolarProperty = {
  id: string;
  name: string;
  address: string;
  enabled: boolean;
  siteId: string;
  clientId: string;
  hasClientSecret: boolean;
  connectedAt: string | null;
};
type SolarSettings = {
  apiBaseUrl: string;
  authorizeUrl: string;
  tokenUrl: string;
  originUrl: string;
  callbackUrl: string;
  encryptionConfigured: boolean;
};
type SolarDraft = { clientId: string; clientSecret: string; siteId: string };

const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600';

export default function SettingsPage() {
  const router = useRouter();
  const timeFormat = useTimeFormat();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [properties, setProperties] = useState<SolarProperty[]>([]);
  const [solarSettings, setSolarSettings] = useState<SolarSettings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SolarDraft>>({});
  const [loadingSolar, setLoadingSolar] = useState(true);
  const [savingPropertyId, setSavingPropertyId] = useState('');
  const [connectingPropertyId, setConnectingPropertyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [temperatureUnit, setTemperatureUnit] = useState<TemperatureUnit>('fahrenheit');
  const [language, setLanguage] = useState<LanguagePreference>('en');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState<ProfileGender | ''>('');
  const [horoscope, setHoroscope] = useState<{ key: string; text: string; date: string } | null>(null);
  const [horoscopeError, setHoroscopeError] = useState('');
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');
  const [preferencesNotice, setPreferencesNotice] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  useEffect(() => {
    void (async () => {
      const client = supabase;
      const sessionUser = (await client?.auth.getSession())?.data.session?.user;
      if (!sessionUser) {
        router.replace('/login');
        return;
      }
      const accessToken = (await client?.auth.getSession())?.data.session?.access_token;
      if (accessToken) {
        const profileResponse = await fetch('/api/me', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
        const profileResult = await profileResponse.json().catch(() => ({}));
        if (profileResponse.ok) setAvatarUrl(typeof profileResult.avatarUrl === 'string' ? profileResult.avatarUrl : '');
        try {
          const response = await fetch('/api/account-preferences', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
          const preferences = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(preferences.error || 'Account preferences could not be loaded.');
          setTemperatureUnit(getTemperatureUnit(preferences.temperature_unit));
          setLanguage(getLanguagePreference(preferences.language));
          setBirthdate(typeof preferences.birthdate === 'string' ? preferences.birthdate : '');
          setGender(preferences.gender === 'female' || preferences.gender === 'male' || preferences.gender === 'non_binary' ? preferences.gender : '');
        } catch (preferenceError) {
          setPreferencesError(preferenceError instanceof Error ? preferenceError.message : 'Account preferences could not be loaded.');
        }
      }
      const role = await fetchUserRole(sessionUser.email, client);
      setSession({
        id: sessionUser.id,
        name: sessionUser.user_metadata?.full_name || sessionUser.email || 'User',
        email: sessionUser.email || '',
        role,
      });
      if (role !== 'owner' && role !== 'manager') {
        setLoadingSolar(false);
        return;
      }

      try {
        const token = (await client?.auth.getSession())?.data.session?.access_token;
        const response = await fetch('/api/solar-power/settings', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Solar settings could not be loaded.');
        setProperties(result.properties ?? []);
        setSolarSettings({
          apiBaseUrl: result.apiBaseUrl,
          authorizeUrl: result.authorizeUrl,
          tokenUrl: result.tokenUrl,
          originUrl: result.originUrl,
          callbackUrl: result.callbackUrl,
          encryptionConfigured: result.encryptionConfigured,
        });
        setDrafts(Object.fromEntries((result.properties ?? []).map((property: SolarProperty) => [property.id, {
          clientId: property.clientId,
          clientSecret: '',
          siteId: property.siteId,
        }])));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Solar settings could not be loaded.');
      } finally {
        setLoadingSolar(false);
      }
    })();
  }, [router]);

  const zodiacSign = birthdate ? getZodiacSign(birthdate) : null;

  useEffect(() => {
    if (!zodiacSign) return;
    const controller = new AbortController();
    let active = true;
    const key = `${zodiacSign}:${language}`;
    void (async () => {
      try {
        const token = (await supabase?.auth.getSession())?.data.session?.access_token;
        if (!token) return;
        const query = new URLSearchParams({ sign: zodiacSign, language });
        const response = await fetch(`/api/horoscope?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Today’s horoscope is unavailable.');
        if (active) {
          setHoroscope({ key, text: result.horoscope, date: result.date });
          setHoroscopeError('');
        }
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setHoroscopeError(error instanceof Error ? error.message : 'Today’s horoscope is unavailable.');
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [zodiacSign, language]);

  async function savePreferences() {
    setSavingPreferences(true);
    setPreferencesError('');
    setPreferencesNotice('');
    try {
      if (birthdate && birthdate > new Date().toISOString().slice(0, 10)) {
        throw new Error('Birthday cannot be in the future.');
      }
      if (!supabase) throw new Error('Account settings are unavailable.');
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const response = await fetch('/api/account-preferences', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ temperature_unit: temperatureUnit, language, birthdate, gender: gender || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Preferences could not be saved.');
      setSavedLanguagePreference(language);
      setPreferencesNotice('Preferences saved.');
    } catch (saveError) {
      setPreferencesError(saveError instanceof Error ? saveError.message : 'Preferences could not be saved.');
    } finally {
      setSavingPreferences(false);
    }
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarError('');
    setPreferencesNotice('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error('Sign in is required.');
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/me/avatar', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Avatar could not be uploaded.');
      setAvatarUrl(result.avatarUrl);
      window.dispatchEvent(new Event('landbaron-profile-avatar-changed'));
      setPreferencesNotice('Profile photo saved.');
    } catch (uploadError) {
      setAvatarError(uploadError instanceof Error ? uploadError.message : 'Avatar could not be uploaded.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveProperty(propertyId: string, enabled: boolean) {
    const draft = drafts[propertyId];
    if (!draft) return;
    setSavingPropertyId(propertyId);
    setError('');
    setNotice('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const response = await fetch('/api/solar-power/settings', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, enabled, ...draft }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Solar settings could not be saved.');
      setProperties((current) => current.map((property) => property.id === propertyId ? {
        ...property,
        enabled,
        clientId: result.clientId ?? property.clientId,
        siteId: result.siteId ?? property.siteId,
        hasClientSecret: result.hasClientSecret,
        connectedAt: result.connectedAt,
      } : property));
      setDrafts((current) => ({ ...current, [propertyId]: { ...current[propertyId], clientSecret: '' } }));
      setNotice('Solar settings saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Solar settings could not be saved.');
    } finally {
      setSavingPropertyId('');
    }
  }

  async function connectProperty(propertyId: string) {
    setConnectingPropertyId(propertyId);
    setError('');
    try {
      const token = (await supabase?.auth.getSession())?.data.session?.access_token;
      const response = await fetch('/api/solar-power/oauth/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'SolarEdge authorization could not be started.');
      window.location.assign(result.authorizeUrl);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'SolarEdge authorization could not be started.');
      setConnectingPropertyId('');
    }
  }

  const canManageSolar = session?.role === 'owner' || session?.role === 'manager';

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings', href: '/dashboard/settings' }]} />
        <h1 className="mt-3 text-2xl font-semibold">Settings</h1>
        {session && <div className="mt-4 flex flex-wrap gap-2"><DashboardNavButtons role={session.role} /></div>}
        <section className="mt-7 flex flex-wrap items-center gap-5 border-t border-slate-300 bg-white px-5 py-5 sm:px-6">
          <label htmlFor="profile-avatar-upload" title="Add or change your profile photo" className={`relative block size-24 shrink-0 cursor-pointer ${uploadingAvatar ? 'pointer-events-none opacity-50' : ''}`}>
            <img src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(session?.name ?? 'User')}&background=0f766e&color=fff&size=240`} alt={`${session?.name ?? 'User'} profile`} className="size-24 rounded-full border border-slate-200 object-cover" />
            <AvatarPhotoBadge avatarUrl={avatarUrl} />
          </label>
          <div><h2 className="text-base font-semibold">Profile photo</h2><p className="mt-1 text-sm text-slate-600">Shown in your account avatar.</p><label className={`mt-3 inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 ${uploadingAvatar ? 'pointer-events-none opacity-50' : ''}`}>{uploadingAvatar ? 'Uploading...' : 'Upload new photo'}<input id="profile-avatar-upload" aria-label="Add or change your profile photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" className="sr-only" disabled={uploadingAvatar} onChange={(event) => void uploadAvatar(event)} /></label>{avatarError && <p role="alert" className="mt-2 text-sm text-rose-700">{avatarError}</p>}</div>
        </section>
        <section className="mt-7 border-t border-slate-300 bg-white px-5 py-5 sm:px-6">
          <h2 className="text-base font-semibold">Time display</h2>
          <p className="mt-1 text-sm text-slate-600">Choose how times appear on this device.</p>
          <fieldset className="mt-4 flex w-fit overflow-hidden rounded-md border border-slate-300" aria-label="Time format">
            {(['12', '24'] as TimeFormat[]).map((format) => (
              <button key={format} type="button" aria-pressed={timeFormat === format} onClick={() => setTimeFormat(format)} className={`px-4 py-2 text-sm font-medium ${timeFormat === format ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                {format}-hour
              </button>
            ))}
          </fieldset>
        </section>

        <section className="mt-7 border-t border-slate-300 bg-white px-5 py-5 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="text-base font-semibold">Temperature Units</h2>
              <fieldset className="mt-3 inline-flex overflow-hidden rounded-md border border-slate-300" aria-label="Temperature unit">
                {([{ value: 'fahrenheit', label: '°F Fahrenheit' }, { value: 'celsius', label: '°C Celsius' }] as const).map((option) => (
                  <button key={option.value} type="button" aria-pressed={temperatureUnit === option.value} onClick={() => setTemperatureUnit(option.value)} className={`px-3 py-2 text-sm font-medium ${temperatureUnit === option.value ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                    {option.label}
                  </button>
                ))}
              </fieldset>
            </div>
            <div>
              <label className="block text-base font-semibold text-slate-900" htmlFor="language">Language</label>
              <select id="language" className={inputClass} value={language} onChange={(event) => setLanguage(getLanguagePreference(event.target.value))}>
                {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-base font-semibold text-slate-900" htmlFor="birthdate">What&apos;s your birthday?</label>
              <input id="birthdate" className={inputClass} type="date" max={new Date().toISOString().slice(0, 10)} value={birthdate} onChange={(event) => setBirthdate(event.target.value)} />
              <p className="mt-2 text-sm text-slate-600">Zodiac sign: <span className="font-medium text-slate-900">{zodiacSign ?? 'Not set'}</span></p>
              {zodiacSign && <div className="mt-3 border-l-2 border-emerald-600 pl-3" aria-live="polite">
                <p className="text-sm font-semibold text-slate-800">Today&apos;s horoscope</p>
                {horoscope?.key === `${zodiacSign}:${language}` ? <p className="mt-1 text-sm text-slate-600">{horoscope.text}</p> : horoscopeError ? <p className="mt-1 text-sm text-slate-500">{horoscopeError}</p> : <p className="mt-1 text-sm text-slate-500">Loading horoscope...</p>}
              </div>}
            </div>
            <div>
              <label className="block text-base font-semibold text-slate-900" htmlFor="gender">Gender</label>
              <select id="gender" className={inputClass} value={gender} onChange={(event) => setGender(event.target.value as ProfileGender | '')}>
                <option value="">Select gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
              </select>
              {birthdate && gender && <div className="mt-3 border-l-2 border-slate-300 pl-3">
                <p className="text-sm font-semibold text-slate-800">Estimated days remaining</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{estimateRemainingDays(birthdate, gender).toLocaleString()}</p>
                <p className="mt-1 text-xs text-slate-500">A rough U.S. population estimate based on age and sex-specific <a className="underline" href="https://www.ssa.gov/oact/STATS/table4c6.html" target="_blank" rel="noreferrer">SSA life tables</a>, not an individual prediction. Non-binary uses the midpoint of the female and male estimates.</p>
              </div>}
            </div>
          </div>
          {preferencesError && <p role="alert" className="mt-4 text-sm text-rose-700">{preferencesError}</p>}
          {preferencesNotice && <p role="status" className="mt-4 text-sm text-emerald-700">{preferencesNotice}</p>}
          <button type="button" onClick={() => void savePreferences()} disabled={savingPreferences} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{savingPreferences ? 'Saving...' : 'Save preferences'}</button>
        </section>

        <section className="mt-7 border-t border-slate-300 bg-white px-5 py-5 sm:px-6">
          <h2 className="text-base font-semibold">Solar Power</h2>
          <p className="mt-1 text-sm text-slate-600">Enable SolarEdge monitoring for properties with a solar system.</p>
          {error && <p role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {notice && <p role="status" className="mt-4 text-sm text-emerald-700">{notice}</p>}
          {!canManageSolar && session && <p className="mt-4 text-sm text-slate-600">Solar integration settings are managed by an owner or manager.</p>}
          {loadingSolar ? <p className="mt-4 text-sm text-slate-500">Loading properties...</p> : canManageSolar && (
            <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
              {properties.length === 0 && <p className="py-5 text-sm text-slate-500">No properties found.</p>}
              {properties.map((property) => {
                const draft = drafts[property.id];
                return <article key={property.id} className="py-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div><h3 className="font-semibold">{property.name}</h3><p className="text-sm text-slate-500">{property.address}</p></div>
                    <fieldset disabled={savingPropertyId === property.id} className="flex items-center gap-4" aria-label={`Solar power for ${property.name}`}>
                      <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name={`solar-${property.id}`} checked={property.enabled} onChange={() => void saveProperty(property.id, true)} />Enabled</label>
                      <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name={`solar-${property.id}`} checked={!property.enabled} onChange={() => void saveProperty(property.id, false)} />Disabled</label>
                    </fieldset>
                  </div>
                  {property.enabled && draft && solarSettings && <div className="mt-5 border-l-2 border-teal-600 pl-4">
                    {!solarSettings.encryptionConfigured && <p role="alert" className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Set `SOLAREDGE_ENCRYPTION_KEY` to a base64-encoded 32-byte key in the server environment before saving credentials.</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-slate-600">OAuth Client ID<input className={inputClass} autoComplete="off" value={draft.clientId} onChange={(event) => setDrafts((current) => ({ ...current, [property.id]: { ...current[property.id], clientId: event.target.value } }))} /></label>
                      <label className="text-xs font-semibold text-slate-600">OAuth Client Secret<input className={inputClass} type="password" autoComplete="new-password" placeholder={property.hasClientSecret ? 'Secret saved; enter a new value to replace' : 'Client secret'} value={draft.clientSecret} onChange={(event) => setDrafts((current) => ({ ...current, [property.id]: { ...current[property.id], clientSecret: event.target.value } }))} /></label>
                      <label className="text-xs font-semibold text-slate-600">SolarEdge Site ID<input className={inputClass} autoComplete="off" value={draft.siteId} onChange={(event) => setDrafts((current) => ({ ...current, [property.id]: { ...current[property.id], siteId: event.target.value } }))} placeholder="Filled in after authorization" /></label>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {([['Authorization URL', solarSettings.authorizeUrl], ['Token URL', solarSettings.tokenUrl], ['API Base URL', solarSettings.apiBaseUrl], ['Allowed Origin URL', solarSettings.originUrl], ['Registered Callback URL', solarSettings.callbackUrl]] as const).map(([label, value]) => <label key={label} className="text-xs font-semibold text-slate-600">{label}<input className={inputClass} readOnly value={value} onFocus={(event) => event.currentTarget.select()} /></label>)}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">Register the callback URL in your SolarEdge Site Access application. OAuth requests `SITE_DATA` and `DEVICE_DATA`; site authorization must be completed for each property.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" disabled={savingPropertyId === property.id || !draft.clientId || (!property.hasClientSecret && !draft.clientSecret) || !solarSettings.encryptionConfigured} onClick={() => void saveProperty(property.id, true)} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{savingPropertyId === property.id ? 'Saving...' : 'Save credentials'}</button>
                      <button type="button" disabled={savingPropertyId === property.id || connectingPropertyId === property.id || !property.hasClientSecret || !property.clientId} onClick={() => void connectProperty(property.id)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">{connectingPropertyId === property.id ? 'Opening SolarEdge...' : property.connectedAt ? 'Reconnect SolarEdge' : 'Connect SolarEdge'}</button>
                    </div>
                    {property.connectedAt && <p className="mt-3 text-xs text-emerald-700">Connected {new Date(property.connectedAt).toLocaleString()}</p>}
                  </div>}
                </article>;
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}