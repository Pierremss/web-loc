# Swipe Upgrade Plan

This document captures the data contract and scoring rules for the upcoming swipe improvements.

## API Contract Overview

### `GET /api/swipe/deck`

Returns an array of candidate profiles with enriched metadata and compatibility metrics.

```jsonc
{
  "items": [
    {
      "id": 123,
      "name": "Player One",
      "nickname": "player1",
      "avatar_url": "https://...",
      "game_style": "Competitivo",
      "platforms": [
        { "id": 2, "name": "Xbox" },
        { "id": 4, "name": "PC" }
      ],
      "compatibility": {
        "score": 78,           // 0-100 scaled
        "weights": {
          "games": 0.5,
          "platforms": 0.25,
          "style": 0.15,
          "schedule": 0.10
        },
        "commonGames": [
          { "id": 8, "name": "Valorant" },
          { "id": 15, "name": "Rocket League" }
        ],
        "sharedPlatforms": [
          { "id": 4, "name": "PC" }
        ],
        "styleMatch": true,
        "scheduleOverlap": [
          { "day": "Sexta", "periods": ["Noite", "Madrugada"] }
        ]
      },
      "summary": {
        "bio": "Descrição curta (primeiros 120 caracteres)",
        "favoriteCount": 5,
        "availableTimes": "{...raw JSON...}"
      }
    }
  ],
  "filters": {
    "applied": {
      "platformIds": [4],
      "gameStyle": "Competitivo",
      "period": "Noite"
    }
  }
}
```

### `GET /api/swipe/profile/:id`

Provides the detailed profile used by the modal. Payload adds:

- `profile` (full description)
- `availableTimes` parsed into day → periods array
- `favoriteGames`: list with id/name/created_at
- `platforms`: reused from deck response
- `recentMatches`: optional future expansion placeholder

### `GET /api/swipe/preferences`

(Planned) Persisted user filters. Optional for v1 but included for completeness. Body example:

```json
{
  "platformIds": [4, 2],
  "gameStyles": ["Competitivo", "Cooperativo"],
  "periods": ["Noite"],
  "minCompatibility": 50
}
```

### `POST /api/swipe/preferences`

Saves filter preferences for the authenticated user. Not essential to implement immediately; UI can operate using query params only.

## Compatibility Score Formula

Let:

- `G = common games count`
- `P = shared platforms count`
- `S = game style match (0 or 1)`
- `H = schedule overlap slots count`
- `G_total`, `P_total`, `H_total` represent the max possible counts (min of user vs candidate totals)

Weights:

- Games: 50%
- Platforms: 25%
- Style: 15%
- Schedule: 10%

Computation:

```
score_games = (G / max(1, G_total)) * 50
score_platforms = (P / max(1, P_total)) * 25
score_style = (S ? 1 : 0) * 15
score_schedule = (H / max(1, H_total)) * 10
compatibility = Math.round(score_games + score_platforms + score_style + score_schedule)
```

The API returns rounded score plus breakdown totals for UI display.

## Data Extraction Notes

- **Platforms**: reuse `users.platforms` CSV until a normalized table is introduced for users. Split on comma, trimmed; map each entry to `platforms` table by name.
- **Games**: join `user_games` ↔ `games` to obtain favorites quickly.
- **Schedules**: `users.available_times` already stores JSON string. Parse into dictionary and compare intersections.
- **Caching**: For the deck, compute compatibility server-side in SQL+JS (after retrieving candidates) to keep TypeScript simple.

## Minimal Schema Adjustments

- Add generated column or view is optional. For now we rely on existing schema; no migration is required.
- Optional future improvement: create `user_platforms` table to normalize player platforms, but outside the current scope.

## Frontend UI Summary

- `SwipePage` receives enriched deck payload.
- New `SwipeProfileModalComponent` (Ionic modal) displays detailed profile: description, badges for games/platforms, schedule table.
- Compatibility badge shown on card with tooltip listing `commonGames`, `sharedPlatforms`, `scheduleOverlap`.
- Filter bar on top of swipe page with `IonSegment`/chips for platform/style/time preferences.

## Open Questions / Stretch Ideas

- Should matches with very low score be hidden by default (`minCompatibility`)?
- Add toggle to prefer newly joined players (based on `created_at`).
- Integrate analytics to monitor like/pass rate per compatibility bucket.
