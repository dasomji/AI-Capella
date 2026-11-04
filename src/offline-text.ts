import { lang } from './i18n';
const text = {
 prepare: ['Für offline vorbereiten', 'Make available offline'],
 remove: ['Offline-Daten entfernen', 'Remove offline data'],
 available: ['Offline verfügbar', 'Available offline'],
 unavailable: ['Nicht offline verfügbar', 'Not available offline'],
 banner: ['Offline – vorbereitete Stücke sind verfügbar', 'Offline – prepared pieces are available'],
 online: ['Bitte online verbinden', 'Please connect online'],
 together: ['Gemeinsam proben benötigt eine Verbindung', 'Rehearsing together requires a connection'],
 update: ['Neue Version verfügbar – neu laden', 'New version available – reload'],
 cancel: ['Vorbereitung abbrechen', 'Cancel preparation'],
 progress: ['Vorbereitung', 'Preparing'],
 usage: ['Stücke', 'pieces'],
} as const;
export const off = (key: keyof typeof text) => text[key][lang === 'de' ? 0 : 1];
