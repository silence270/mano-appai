/* Lapas — duomenų sluoksnis.
 *
 * Visa kriptografija gyvena vault.js. Čia — tik app'o sąvokos: dienos,
 * nustatymai, vienos dienos įrašo sujungimas. Duomenys laikomi atmintyje,
 * kol app'as atrakintas, ir įrašomi po kiekvieno pakeitimo.
 */

'use strict';

import * as V from './vault.js';
import { sanitizeDays, sanitizeSettings } from './sanitize.js';

export const DEFAULT_SETTINGS = {
  lang: null,
  theme: 'auto',
  mode: 'track',
  avgCycle: 28,
  avgPeriod: 5,
  birthYear: null,
  contraceptionStoppedAt: null,
  pregnancyStart: null,
  weekStart: 1,
  units: 'metric',
  showFertile: true,
  backupReminderAt: null,
  recoveryShownAt: null,
  onboarded: false,
};

let _cache = null;      // { days, settings } atrakintame app'e

async function load() {
  if (_cache) return _cache;
  const raw = await V.readAll();
  _cache = {
    days: sanitizeDays(raw.days).days,
    settings: { ...DEFAULT_SETTINGS, ...sanitizeSettings(raw.settings) },
  };
  return _cache;
}

async function flush() {
  if (!_cache) return;
  await V.writeAll({ days: _cache.days, settings: _cache.settings });
}

// ------------------------------------------------------------- užraktas

export const isInitialised = () => V.isInitialised();
export const isLocked = () => !V.isUnlocked();
export const isDecoy = () => V.isDecoy();

export async function unlock(secret, now = Date.now()) {
  const r = await V.unlock(secret, now);
  if (r.ok) _cache = null;
  return r;
}

/** Atrakinimas veidu — per tą patį kelią, kad kešas būtų išvalytas. */
export async function unlockBiometric(now = Date.now()) {
  const r = await V.unlockBiometric(now);
  if (r.ok) _cache = null;
  return r;
}

export const enableBiometrics = pin => V.enableBiometrics(pin);
export const disableBiometrics = () => V.disableBiometrics();
export const biometricsAvailable = () => V.biometricsAvailable();
export const biometricsEnabled = () => V.biometricsEnabled();

export function lock() {
  V.lock();
  _cache = null;          // atmintyje nelieka nieko, ką būtų galima perskaityti
}

export const guardState = now => V.guardState(now);

/** Pirmas paleidimas. @returns {string} atkūrimo kodas */
export async function initialise(pin, seed) {
  const code = await V.initialise(pin, {
    days: sanitizeDays(seed?.days || {}).days,
    settings: { ...DEFAULT_SETTINGS, ...sanitizeSettings(seed?.settings || {}) },
  });
  _cache = null;
  return code;
}

export const changePin = (oldSecret, newPin) => V.changePin(oldSecret, newPin);
export const resetRecoveryCode = pin => V.resetRecoveryCode(pin);
export const setDecoyPin = (pin, seed) => V.setDecoyPin(pin, seed);
export const reversePin = pin => V.reversePin(pin);

// -------------------------------------------------------------- duomenys

export async function getDays() { return (await load()).days; }
export async function getSettings() { return (await load()).settings; }

export async function putDays(days) {
  const c = await load();
  c.days = sanitizeDays(days).days;
  await flush();
}

export async function putSettings(s) {
  const c = await load();
  c.settings = { ...DEFAULT_SETTINGS, ...sanitizeSettings(s) };
  await flush();
}

export async function updateSettings(patch) {
  const c = await load();
  c.settings = { ...c.settings, ...sanitizeSettings({ ...c.settings, ...patch }) };
  await flush();
  return c.settings;
}

/** Vienos dienos įrašas — sujungiamas, o ne perrašomas. Tušti laukai išvalomi. */
export async function saveDay(iso, patch) {
  const c = await load();
  const merged = { ...(c.days[iso] || {}), ...patch };
  for (const [k, v] of Object.entries(merged)) {
    if (v === false) { delete merged[k]; continue; }
    if (v === null || v === undefined || v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (k === 'flow' && v === 0)) delete merged[k];
  }
  if (Object.keys(merged).length === 0) delete c.days[iso];
  else c.days[iso] = merged;
  c.days = sanitizeDays(c.days).days;
  await flush();
  return c.days;
}

export async function wipe() {
  _cache = null;
  await V.wipe();
}

// -------------------------------------------------------------- saugykla

export async function storageInfo() {
  const out = { usage: null, persisted: false };
  try {
    if (navigator.storage?.estimate) out.usage = (await navigator.storage.estimate()).usage;
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
  } catch {}
  return out;
}

export async function requestPersistence() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; }
  catch { return false; }
}
