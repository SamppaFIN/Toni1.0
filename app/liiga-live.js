// Jaakiekon live-data Liiga.fi:sta suoraan selaimesta
//
// SAMA PERIAATE KUIN football-espn.js:LLA: Liiga.fi:n /api/v2/games palvelee
// julkisesti Access-Control-Allow-Origin: *. Selain voi siis hakea sen
// suoraan ilman palvelinkierrosta — ei kvoottaa, ei cron-viivetta, tilanne
// paivittyy aidosti livena. Vahvistettu kasin ennen kirjoittamista.
//
// DOKUMENTOIMATON RAJAPINTA, sama varaus kuin ESPN:lla: se voi muuttua tai
// kadota ilman varoitusta. Jokainen haku on try/catchissa kutsujan paassa;
// epaonnistuminen nakyy tekstina eika kaada nakymaa.
//
// EI SHOTS ON GOAL -LUKUA: talta paatteelta ei loytynyt laukaustilastoa,
// vain PP/AV-instanssit ja xG. Ei keksita puuttuvaa lukua.

const BASE = 'https://liiga.fi/api/v2';

/** Kyselyväli kun ottelu on käynnissä. Älä kiristä — tämä on toisen palvelin. */
export const POLL_MS = 30_000;

/** Sama kausilaskenta kuin src/ingest/stats-liiga.ts:n seasonYear() */
function seasonYear(now = new Date()) {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Liiga.fi ${res.status}`);
  return res.json();
}

function mmss(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Eran nimi: 1./2./3. erä, JA = jatkoaika, VL = voittolaukaisukilpailu */
function periodLabel(index) {
  if (index === 4) return 'JA';
  if (index === 5) return 'VL';
  return index ? `${index}. erä` : '';
}

function fullName(p) {
  if (!p) return '?';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || '?';
}

/** Yhden joukkueen maalit muunnettuna yhteiseen muotoon, molemmat puolet yhdistetaan ja jarjestetaan kutsujassa */
function goalsFor(team, side) {
  return (team?.goalEvents ?? []).map((e) => ({
    side,
    minute: Math.max(1, Math.round((e.gameTime ?? 0) / 60)),
    period: e.period ?? null,
    scorer: fullName(e.scorerPlayer),
    assists: (e.assistantPlayers ?? []).map(fullName),
    homeScore: e.homeTeamScore ?? null,
    awayScore: e.awayTeamScore ?? null,
    // Raakakoodit Liiga.fi:sta sellaisenaan (YV, AV, TM, RL, VL...) — ei
    // tulkittu, koska osa merkityksista ei ole varmistettu.
    types: e.goalTypes ?? [],
  }));
}

/** Yhden pelin raakadata normalisoituun muotoon — sama kenttanimista kuin football-espn.js:n parseEvent() jotta renderointi voi olla samankaltainen */
export function parseGame(g) {
  const home = g.homeTeam ?? {};
  const away = g.awayTeam ?? {};
  const period = (g.periods ?? []).find((p) => p.index === g.currentPeriod) ?? null;
  const elapsedInPeriod = period ? Math.max(0, (g.gameTime ?? 0) - period.startTime) : null;
  const periodLen = period ? period.endTime - period.startTime : null;
  const remaining = period && periodLen !== null ? Math.max(0, periodLen - elapsedInPeriod) : null;

  const num = (v) => (Number.isFinite(v) ? v : null);

  return {
    id: String(g.id),
    home: home.teamName ?? '',
    away: away.teamName ?? '',
    homeScore: num(home.goals),
    awayScore: num(away.goals),
    inPlay: g.started === true && g.ended !== true,
    completed: g.ended === true,
    clock: remaining !== null ? mmss(remaining) : '',
    detail: g.ended ? 'päättynyt' : g.started ? periodLabel(g.currentPeriod) : 'alkamassa',
    kickoff: g.start ?? null,
    pp: {
      home: { instances: home.powerplayInstances ?? 0, goals: home.powerplayGoals ?? 0 },
      away: { instances: away.powerplayInstances ?? 0, goals: away.powerplayGoals ?? 0 },
    },
    sh: {
      home: { instances: home.shortHandedInstances ?? 0, goals: home.shortHandedGoals ?? 0 },
      away: { instances: away.shortHandedInstances ?? 0, goals: away.shortHandedGoals ?? 0 },
    },
    xg: { home: num(home.expectedGoals), away: num(away.expectedGoals) },
    goals: [...goalsFor(home, 'home'), ...goalsFor(away, 'away')].sort((a, b) => a.minute - b.minute),
  };
}

/** Kaikki kauden ottelut, parsittuna. Ei suodata paivalla — kutsuja valitsee kaynnissa olevat/paattyneet. */
export async function fetchLiigaGames(now = new Date()) {
  const data = await getJson(`${BASE}/games?tournament=runkosarja&season=${seasonYear(now)}`);
  if (!Array.isArray(data)) throw new Error('Liiga.fi: odottamaton vastausmuoto');
  return data.map(parseGame);
}
