# MLB Stats API — Endpoint Reference

This documents every endpoint exposed by the `MLB-StatsAPI` Python SDK
(`../../MLB-StatsAPI/statsapi/endpoints.py`), which is itself a thin wrapper
around the public MLB Stats API at `https://statsapi.mlb.com/api/`.

**Prefer an interactive view?** [`mlb-stats-api.openapi.yaml`](mlb-stats-api.openapi.yaml)
is a full OpenAPI 3.0 spec of everything below, rendered by
[`api-docs.html`](api-docs.html) (Swagger UI). Run `npm run docs` from the
project root and open `http://localhost:4001/api-docs.html` — the API is
public and CORS-open, so "Try it out" fires real requests from your browser.

Every endpoint follows the same request/response conventions:

- **Base URL pattern:** `https://statsapi.mlb.com/api/{ver}/...` — `ver` defaults
  to `v1` (or `v1.1` for the live game feed) and is rarely overridden.
- **Response envelope:** every response is `{"copyright": "...", <payload>}`.
  Collection-style endpoints (`teams`, `people`, `stats/leaders`, ...) return
  the payload as an array even when looking up a single ID.
- **`link` vs. `hydrate`:** nested objects are returned as a stub with just an
  `id` and a relative `link` (e.g. `/api/v1/teams/147`) unless you opt in to
  embedding the full sub-object via the `hydrate` query param. Hydrate syntax
  varies per endpoint — simple comma-separated keys (`hydrate=linescore,decisions`)
  or parenthesized/parameterized forms (`hydrate=stats(group=hitting,type=season)`).
- **`fields`:** a flat, comma-separated allowlist of key names (order and
  nesting don't matter) used to prune large payloads — essential for the live
  game feed and boxscore endpoints, which are huge unfiltered.
- **Required parameters:** each endpoint declares one or more *sets* of
  required query params; satisfying any one full set is sufficient. "None"
  means the endpoint works with no query params at all.

Two endpoints are commented out in the SDK because they require
authentication the SDK doesn't support: `v1/analytics` and
`v1/game/{gamePk}/guids` (Statcast tracking data).

Endpoints marked 📄 have a worked request/response example in
[Examples](#examples) below.

---

## Game data

| Endpoint | URL | Query params | Required | Notes |
|---|---|---|---|---|
| `game` 📄 | `/api/v1.1/game/{gamePk}/feed/live` | `timecode`, `hydrate`, `fields` | none | Full live feed — `gameData` + `liveData` (play-by-play, linescore, boxscore). Huge unfiltered; always use `fields`. |
| `game_diff` | `/api/v1.1/game/{gamePk}/feed/live/diffPatch` | `startTimecode`, `endTimecode` | both | Diff between two timecodes of the live feed |
| `game_timestamps` | `/api/v1.1/game/{gamePk}/feed/live/timestamps` | — | none | Returns array of valid timecodes for `game`/`game_diff` |
| `game_changes` | `/api/v1/game/changes` | `updatedSince`, `sportId`, `gameType`, `season`, `fields` | `updatedSince` | Games updated since a timestamp |
| `game_contextMetrics` | `/api/v1/game/{gamePk}/contextMetrics` | `timecode`, `fields` | none | Win probability & context metrics |
| `game_winProbability` | `/api/v1/game/{gamePk}/winProbability` | `timecode`, `fields` | none | Win probability by play; for just current WP, prefer `game_contextMetrics` |
| `game_boxscore` 📄 | `/api/v1/game/{gamePk}/boxscore` | `timecode`, `fields` | none | Batting/pitching boxscore |
| `game_content` | `/api/v1/game/{gamePk}/content` | `highlightLimit` | none | Media/highlights for a game |
| `game_color` | `/api/v1/game/{gamePk}/feed/color` | `timecode`, `fields` | none | Legacy "color" feed variant of `game` |
| `game_color_diff` | `/api/v1/game/{gamePk}/feed/color/diffPatch` | `startTimecode`, `endTimecode` | both | Legacy variant of `game_diff` |
| `game_color_timestamps` | `/api/v1/game/{gamePk}/feed/color/timestamps` | — | none | Legacy variant of `game_timestamps` |
| `game_linescore` | `/api/v1/game/{gamePk}/linescore` | `timecode`, `fields` | none | Inning-by-inning line score |
| `game_playByPlay` | `/api/v1/game/{gamePk}/playByPlay` | `timecode`, `fields` | none | Full play-by-play |
| `game_uniforms` | `/api/v1/uniforms/game` | `gamePks`, `fields` | `gamePks` | Uniforms worn in given game(s) |
| `gamePace` | `/api/v1/gamePace` | `season`, `teamIds`, `leagueIds`, `leagueListId`, `sportId`, `gameType`, `startDate`, `endDate`, `venueIds`, `orgType`, `includeChildren`, `fields` | `season` | Pace-of-play stats |
| `highLow` | `/api/v1/highLow/{orgType}` | `statGroup`, `sortStat`, `season`, `gameType`, `teamId`, `leagueId`, `sportIds`, `limit`, `fields` | `sortStat` + `season` | `orgType` path param: `player`, `team`, `division`, `league`, `sport`, `types` |
| `homeRunDerby` | `/api/v1/homeRunDerby/{gamePk}` (`/bracket`, `/pool`) | `fields` | none | `bracket`/`pool` are boolean path toggles, not query params |

---

## People / players

| Endpoint | URL | Query params | Required | Notes |
|---|---|---|---|---|
| `people` | `/api/v1/people` | `personIds`, `hydrate`, `fields` | `personIds` | Bulk lookup by ID |
| `person` 📄 | `/api/v1/people/{personId}` | `hydrate`, `fields` | none | Single player bio. No stats by default — add `hydrate=stats(group=[hitting],type=season)` |
| `person_stats` | `/api/v1/people/{personId}/stats/game/{gamePk}` | `fields` | none | Pass `"current"` as `gamePk` for in-progress game stats |
| `people_changes` | `/api/v1/people/changes` | `updatedSince`, `fields` | none | People updated since a timestamp |
| `people_freeAgents` | `/api/v1/people/freeAgents` | `order`, `hydrate`, `fields` | none | Free agent list |
| `sports_players` | `/api/v1/sports/{sportId}/players` | `season`, `gameType`, `fields` | `season` | All players for a sport/season. No server-side name filter — `lookup_player()` pulls the full list and filters client-side |

---

## Teams

| Endpoint | URL | Query params | Required | Notes |
|---|---|---|---|---|
| `teams` | `/api/v1/teams` | `season`, `activeStatus`, `leagueIds`, `sportId`, `sportIds`, `gameType`, `hydrate`, `fields` | none | List teams |
| `team` 📄 | `/api/v1/teams/{teamId}` | `season`, `sportId`, `hydrate`, `fields` | none | Single team info |
| `teams_history` | `/api/v1/teams/history` | `teamIds`, `startSeason`, `endSeason`, `fields` | `teamIds` | Historical team org/name data |
| `teams_stats` | `/api/v1/teams/stats` | `season`, `sportIds`, `group`, `gameType`, `stats`, `order`, `sortStat`, `fields`, `startDate`, `endDate` | `season` + `group` + `stats` | League-wide team stats. Use `meta('statGroups')`/`meta('statTypes')` for valid values |
| `team_stats` | `/api/v1/teams/{teamId}/stats` | `season`, `group`, `gameType`, `stats`, `sportIds`, `sitCodes`, `fields` | `season` + `group` | Single-team stats; `sitCodes` used with `stats=statSplits` |
| `teams_affiliates` | `/api/v1/teams/affiliates` | `teamIds`, `sportId`, `season`, `hydrate`, `fields` | `teamIds` | Farm system affiliates |
| `team_alumni` | `/api/v1/teams/{teamId}/alumni` | `season`, `group`, `hydrate`, `fields` | `season` + `group` | |
| `team_coaches` | `/api/v1/teams/{teamId}/coaches` | `season`, `date`, `fields` | none | |
| `team_personnel` | `/api/v1/teams/{teamId}/personnel` | `date`, `fields` | none | |
| `team_leaders` | `/api/v1/teams/{teamId}/leaders` | `leaderCategories`, `season`, `leaderGameTypes`, `hydrate`, `limit`, `fields` | `leaderCategories` + `season` | Team stat leaders |
| `team_roster` | `/api/v1/teams/{teamId}/roster` | `rosterType`, `season`, `date`, `hydrate`, `fields` | none | |
| `team_uniforms` | `/api/v1/uniforms/team` | `teamIds`, `season`, `fields` | `teamIds` | |

---

## Schedule

| Endpoint | URL | Query params | Required | Notes |
|---|---|---|---|---|
| `schedule` 📄 | `/api/v1/schedule` | `scheduleType`, `eventTypes`, `hydrate`, `teamId`, `leagueId`, `sportId`, `gamePk`, `gamePks`, `venueIds`, `gameTypes`, `date`, `startDate`, `endDate`, `opponentId`, `fields`, `season` | one of `sportId`, `gamePk`, `gamePks` | The main schedule query |
| `schedule_tied` | `/api/v1/schedule/games/tied` | `gameTypes`, `season`, `hydrate`, `fields` | `season` | Games that ended tied |
| `schedule_postseason` | `/api/v1/schedule/postseason` | `gameTypes`, `seriesNumber`, `teamId`, `sportId`, `season`, `hydrate`, `fields` | none | |
| `schedule_postseason_series` | `/api/v1/schedule/postseason/series` | `gameTypes`, `seriesNumber`, `teamId`, `sportId`, `season`, `fields` | none | |
| `schedule_postseason_tuneIn` | `/api/v1/schedule/postseason/tuneIn` | `teamId`, `sportId`, `season`, `hydrate`, `fields` | none | Broadcast tune-in info — per SDK note, appears to return no data |

---

## Stats & leaders

| Endpoint | URL | Query params | Required | Notes |
|---|---|---|---|---|
| `stats` | `/api/v1/stats` | `stats`, `playerPool`, `position`, `teamId`, `leagueId`, `limit`, `offset`, `group`, `gameType`, `season`, `sportIds`, `sortStat`, `order`, `hydrate`, `fields`, `personId`, `metrics`, `startDate`, `endDate` | `stats` + `group` | Capped at 50 records if no `limit` given |
| `stats_leaders` 📄 | `/api/v1/stats/leaders` | `leaderCategories`, `playerPool`, `leaderGameTypes`, `statGroup`, `season`, `leagueId`, `sportId`, `hydrate`, `limit`, `fields`, `statType` | `leaderCategories` | See gotcha in [Examples](#examples) re: omitting `statGroup`. For all-time leaders, add `statType=statsSingleSeason` |
| `stats_streaks` | `/api/v1/stats/streaks` | `streakType`, `streakSpan`, `gameType`, `season`, `sportId`, `limit`, `hydrate`, `fields` | all of `streakType`, `streakSpan`, `season`, `sportId`, `limit` | `streakType`: `hittingStreakOverall/Home/Away`, `onBaseOverall/Home/Away`. `streakSpan`: `career`, `season`, `currentStreak`, `currentStreakInSeason`, `notable`, `notableInSeason` |

---

## League / org structure

| Endpoint | URL | Query params | Required | Notes |
|---|---|---|---|---|
| `league` | `/api/v1/league` | `sportId`, `leagueIds`, `seasons`, `fields` | `sportId` or `leagueIds` | |
| `league_allStarBallot` | `/api/v1/league/{leagueId}/allStarBallot` | `season`, `fields` | `season` | |
| `league_allStarWriteIns` | `/api/v1/league/{leagueId}/allStarWriteIns` | `season`, `fields` | `season` | |
| `league_allStarFinalVote` | `/api/v1/league/{leagueId}/allStarFinalVote` | `season`, `fields` | `season` | |
| `divisions` | `/api/v1/divisions` | `divisionId`, `leagueId`, `sportId`, `season` | none | Call with no params to list all divisions |
| `conferences` | `/api/v1/conferences` | `conferenceId`, `season`, `fields` | none | |
| `sports` | `/api/v1/sports` | `sportId`, `fields` | none | |
| `seasons` | `/api/v1/seasons` (`/all`) | `season`, `sportId`, `divisionId`, `leagueId`, `fields` | `sportId`, `divisionId`, or `leagueId` | `all=True` queries every season |
| `season` | `/api/v1/seasons/{seasonId}` | `sportId`, `fields` | `sportId` | Singular — one season's info |
| `standings` 📄 | `/api/v1/standings` | `leagueId`, `season`, `standingsTypes`, `date`, `hydrate`, `fields` | `leagueId` | Add `hydrate=team(division)` for division names inline |

---

## Misc / reference

| Endpoint | URL | Query params | Required | Notes |
|---|---|---|---|---|
| `attendance` | `/api/v1/attendance` | `teamId`, `leagueId`, `season`, `date`, `leagueListId`, `gameType`, `fields` | `teamId`, `leagueId`, or `leagueListId` | |
| `awards` | `/api/v1/awards` (`/{awardId}`, `/recipients`) | `sportId`, `leagueId`, `season`, `hydrate`, `fields` | none | Call with no params to list valid `awardId`s |
| `draft` | `/api/v1/draft` (`/prospects`, `/{year}`, `/latest`) | `limit`, `fields`, `round`, `name`, `school`, `state`, `country`, `position`, `teamId`, `playerId`, `bisPlayerId` | none | Query params ignored when `latest` used (year still required); `prospects` + `latest` can't combine |
| `jobs` | `/api/v1/jobs` | `jobType`, `sportId`, `date`, `fields` | `jobType` | |
| `jobs_umpires` | `/api/v1/jobs/umpires` | `sportId`, `date`, `fields` | none | |
| `jobs_umpire_games` | `/api/v1/jobs/umpires/games/{umpireId}` | `season`, `fields` | `season` | |
| `jobs_datacasters` | `/api/v1/jobs/datacasters` | `sportId`, `date`, `fields` | none | |
| `jobs_officialScorers` | `/api/v1/jobs/officialScorers` | `timecode`, `fields` | none | |
| `transactions` | `/api/v1/transactions` | `teamId`, `playerId`, `date`, `startDate`, `endDate`, `sportId`, `fields` | one of `teamId`, `playerId`, `date`, or `startDate`+`endDate` | Trades, signings, roster moves |
| `venue` | `/api/v1/venues` | `venueIds`, `season`, `hydrate`, `fields` | `venueIds` | |
| `meta` | `/api/v1/{type}` | — | `type` | Lookup tables — see below |

`meta` `type` values: `awards`, `baseballStats`, `eventTypes`, `gameStatus`,
`gameTypes`, `hitTrajectories`, `jobTypes`, `languages`, `leagueLeaderTypes`,
`logicalEvents`, `metrics`, `pitchCodes`, `pitchTypes`, `platforms`,
`positions`, `reviewReasons`, `rosterTypes`, `scheduleEventTypes`,
`situationCodes`, `sky`, `standingsTypes`, `statGroups`, `statTypes`,
`windDirection`. Use it to validate/discover values passed to other endpoints
(e.g. `group`/`stats` for `team_stats`, `sitCodes` for `stats=statSplits`).

### Unimplemented (require auth)
- `v1/analytics`
- `v1/game/{gamePk}/guids` — Statcast pitch-tracking data

---

## Examples

Concrete request/response pairs, pulled live from the API, for the endpoints
whose shape isn't obvious from the param table alone.

### `game` — full live game feed
```
GET /api/v1.1/game/744834/feed/live?fields=gameData,game,pk,status,detailedState,teams,away,home,name,liveData,plays,currentPlay,result,description,linescore,innings,num,runs
```
```json
{
  "gameData": {
    "game": { "pk": 744834 },
    "status": { "detailedState": "Final" },
    "teams": { "away": { "name": "New York Mets" }, "home": { "name": "Washington Nationals" } }
  },
  "liveData": {
    "plays": { "currentPlay": { "result": { "description": "Brandon Nimmo strikes out swinging." } } },
    "linescore": {
      "innings": [ { "num": 1, "home": { "runs": 0 }, "away": { "runs": 0 } }, "...7 more..." ],
      "teams": { "home": { "runs": 1 }, "away": { "runs": 0 } }
    }
  }
}
```

### `game_boxscore` — batting/pitching boxscore
```
GET /api/v1/game/744834/boxscore?fields=teams,away,home,teamStats,batting,runs,hits,homeRuns,pitching,strikeOuts,players
```
```json
{
  "teams": {
    "away": {
      "teamStats": {
        "batting": { "runs": 0, "homeRuns": 0, "strikeOuts": 10, "hits": 1 },
        "pitching": { "runs": 1, "homeRuns": 1, "strikeOuts": 3, "hits": 5 }
      },
      "players": {
        "ID518617": {
          "jerseyNumber": "30",
          "stats": { "batting": {}, "pitching": {} },
          "seasonStats": {
            "batting": { "runs": 0, "homeRuns": 0, "strikeOuts": 0, "hits": 0 },
            "pitching": { "runs": 18, "homeRuns": 3, "strikeOuts": 31, "hits": 15 }
          }
        }
      }
    }
  }
}
```
Players are keyed `"ID<personId>"`. Each has `stats.*` (this game) and
`seasonStats.*` (season-to-date).

### `person` — single player bio
```
GET /api/v1/people/592450
```
```json
{
  "people": [
    {
      "id": 592450,
      "fullName": "Aaron Judge",
      "primaryPosition": { "code": "9", "name": "Outfielder", "abbreviation": "RF" },
      "batSide": { "code": "R", "description": "Right" },
      "pitchHand": { "code": "R", "description": "Right" },
      "mlbDebutDate": "2016-08-13",
      "strikeZoneTop": 3.523,
      "strikeZoneBottom": 1.778
    }
  ]
}
```
Note the response is always `people: [...]`, even for one ID. No stats are
included by default — add `hydrate=stats(group=[hitting],type=season)` to
embed season/career numbers in the same call.

### `team` — single team info
```
GET /api/v1/teams/147
```
```json
{
  "teams": [
    {
      "id": 147,
      "name": "New York Yankees",
      "abbreviation": "NYY",
      "teamName": "Yankees",
      "locationName": "Bronx",
      "venue": { "id": 3313, "name": "Yankee Stadium" },
      "league": { "id": 103, "name": "American League" },
      "division": { "id": 201, "name": "American League East" },
      "firstYearOfPlay": "1903"
    }
  ]
}
```

### `schedule` — games for a date
```
GET /api/v1/schedule?sportId=1&date=2024-07-04
```
```json
{
  "totalItems": 15,
  "totalGames": 15,
  "dates": [
    {
      "date": "2024-07-04",
      "games": [
        {
          "gamePk": 744834,
          "gameDate": "2024-07-04T15:05:00Z",
          "status": { "abstractGameState": "Final", "detailedState": "Final" },
          "teams": {
            "away": { "team": { "id": 121, "name": "New York Mets" }, "score": 0, "isWinner": false },
            "home": { "team": { "id": 120, "name": "Washington Nationals" }, "score": 1, "isWinner": true }
          }
        }
      ]
    }
  ]
}
```
Add `&hydrate=linescore,decisions,probablePitcher(note),broadcasts,seriesStatus`
to enrich each game inline instead of following `link`s (this is exactly what
the SDK's `schedule()` convenience function does).

### `standings`
```
GET /api/v1/standings?leagueId=103,104&season=2024
```
```json
{
  "records": [
    {
      "standingsType": "regularSeason",
      "teamRecords": [
        {
          "team": { "id": 147, "name": "New York Yankees" },
          "divisionRank": "1",
          "wins": 94,
          "losses": 68,
          "gamesBack": "-",
          "wildCardRank": "1",
          "wildCardGamesBack": "-"
        }
      ]
    }
  ]
}
```
Add `&hydrate=team(division)` to get division names inline instead of just IDs.

### `stats_leaders` — league leaderboards
```
GET /api/v1/stats/leaders?leaderCategories=homeRuns&season=2024&limit=5
```
```json
{
  "leagueLeaders": [
    {
      "leaderCategory": "homeRuns",
      "season": "2024",
      "statGroup": "hitting",
      "leaders": [
        {
          "rank": 1,
          "value": "58",
          "team": { "id": 147, "name": "New York Yankees" },
          "league": { "id": 103, "name": "AL" },
          "person": { "id": 592450, "fullName": "Aaron Judge" }
        }
      ],
      "totalSplits": 522
    }
  ]
}
```
**Gotcha confirmed live:** omitting `statGroup` returns *multiple* leader
blocks for the same category — e.g. `leaderCategories=homeRuns` without
`statGroup` returned separate `hitting`, `catching`, and `pitching` blocks
(pitchers can hit home runs off too). Always pass `statGroup=hitting`
explicitly unless you want all of them. Also: to get all-time leaders
(omitting `season`), include `statType=statsSingleSeason` or you'll likely
get no results.
