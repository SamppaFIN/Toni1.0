// Jalkapalloseurojen nimennormalisointi (tiketit #57, #105)
//
// MIKSI OMA TIEDOSTO: tama funktio asui `publish/live-snapshot.ts`:ssa, joka
// on putken ylin kerros — se tuo kerroinhaun, tilastot, uutiset ja Elon. Kun
// kasisyottomoduulit (`odds-manual`, `context-manual`) tarvitsivat saman
// normalisoinnin, tuonti olisi ollut syklinen: live-snapshot tuo ne, ne
// toisivat live-snapshotin.
//
// Sykli olisi ratkennut myos kopiolla, ja juuri se oli aiemmin tilanne:
// kasisyotto normalisoi kevyemmin kuin muu putki. Seuraus oli hiljainen ja
// oikea vika — "AFC Bournemouth" ei tasmannyt "Bournemouthiin" eika
// "Brighton & Hove Albion" "Brighton and Hove Albioniin", joten kahdelta
// Valioliigan ottelulta putosi seka Veikkauksen kasin syotetty kerroin etta
// kasin syotetty ottelukonteksti. Kortti naytti normaalilta: siina oli 10
// toimistoa 11:n sijaan eika yhtaan varoitusta.
//
// PERIAATE (tiketti #57): kolme lahdetta kirjoittaa saman joukkueen eri
// tavoin, joten seuramuodot ja valimerkit poistetaan ja jaljelle jaavaa
// verrataan. EROTTELEVAT sanat ("united", "city", "forest") jatetaan
// paikoilleen — liian aggressiivinen normalisointi yhdistaisi kaksi eri
// joukkuetta, mika on pahempi virhe kuin tasmaamatta jaanyt rivi.

const DIACRITICS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/** Seuramuodot jotka eivat erottele joukkueita toisistaan */
const CLUB_FORMS = new Set(['afc', 'fc', 'cf', 'sc', 'ac', 'if', 'ifk', 'club']);

export function normalizeClubName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/&/g, ' and ')
    // Sanoittain eika regexin sanarajoilla: token-vertailu on tassa seka
    // selkeampi etta turvallisempi. Korvaus ilman sanarajaa silpoisi nimia
    // keskelta -- "palace" sisaltaa "ac" ja muuttuisi muotoon "pale",
    // jolloin kaksi eri joukkuetta voisi normalisoitua samaksi.
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !CLUB_FORMS.has(t))
    .join('');
}
