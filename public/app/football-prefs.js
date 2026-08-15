// Tiketti #39: Näyttöasetukset — mitä ottelukortilla näytetään
//
// Kortti kasvoi kolmesta osiosta neljään ja sai päälleen Elo-luvut ja
// laskentaerittelyn. Kaikki kerralla on liikaa puhelimen ruudulle, ja eri
// käyttäjä haluaa eri asiat: joku katsoo pelkkiä kertoimia, toinen haluaa
// nähdä jokaisen välivaiheen.
//
// Asetukset ovat pelkkiä näyttölippuja. Ne EIVÄT vaikuta laskentaan eivätkä
// analyysin tuloksiin — piilotettu luku on laskettu silti, se on vain
// poissa näkyvistä. Näin asetus ei voi vahingossa muuttaa sitä mitä malli
// sanoo, vain sen mitä siitä kerrotaan.

const STORAGE_KEY = 'bt_display_prefs';

/**
 * Näyttövalinnat järjestyksessä. `default` on se mitä uusi käyttäjä näkee:
 * perusnäkymä auki, raskaat erittelyt suljettuina.
 */
export const DISPLAY_OPTIONS = [
  { key: 'elo', label: 'Elo-luvut', hint: 'Kauden Elo joukkueen nimen alla', default: true },
  { key: 'probs', label: 'Todennäköisyyspalkki', hint: 'Mallin 1X2-jakauma palkkina', default: true },
  { key: 'odds', label: 'Kerroinvertailu', hint: 'Kaikkien toimistojen hinnat', default: true },
  { key: 'stats', label: 'Tunnusluvut', hint: 'Sarjasija, muoto, maalit per peli', default: true },
  { key: 'news', label: 'Uutiset', hint: 'Otteluun liitetyt uutiset', default: true },
  { key: 'analysis', label: 'Analyysi', hint: 'Malli vs markkina, edge, Kelly-panos', default: true },
  { key: 'calc', label: 'Laskennan vaiheet', hint: 'Jokainen välitulos kaavoineen — pitkä', default: false },
];

const DEFAULTS = Object.fromEntries(DISPLAY_OPTIONS.map((o) => [o.key, o.default]));

let cache = null;

export function getPrefs() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    // Vioittunut tallennus ei ole virhetilanne — oletukset kelpaavat
  }
  // Oletukset pohjalle: uusi valinta ilmestyy näkyviin ilman että vanha
  // tallennus pitäisi migratoida
  cache = { ...DEFAULTS, ...stored };
  return cache;
}

export function isVisible(key) {
  return getPrefs()[key] !== false;
}

export function setPref(key, value) {
  const next = { ...getPrefs(), [key]: !!value };
  cache = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function togglePref(key) {
  return setPref(key, !isVisible(key));
}

export function resetPrefs() {
  cache = { ...DEFAULTS };
  localStorage.removeItem(STORAGE_KEY);
  return cache;
}
