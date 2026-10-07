# Kraków Second Hands

Map of every second hand, lumpeks, vintage, charity shop and flea market in Kraków (124 places, from Google Maps, October 2026).

Features: clustered map, open-now status and weekly hours (Kraków time), delivery-day notes from reviews plus your own per-shop delivery day, saved shops, a thrift route planner that opens in Google Maps, shareable links (`/?shop=<place_id>`, `/?route=<id>,<id>`), PL/EN, light/dark map that follows the system, tags for what each shop sells, and an installable offline app (service worker in `sw.js`; "Save map offline" pre-downloads ~35 MB of Kraków vector tiles).

Plain static site, no build step: `index.html`, `app.js`, `hours.js`, `i18n.js`, `select.js`, `sheet.js`, `offline.js`, `sw.js`, `styles.css`, `data/shops.json`. If you change the files listed in `sw.js` `SHELL_FILES`, bump `SHELL` so old caches clear. Saved shops, route and delivery days live in the browser's localStorage.

## Run locally

    python3 -m http.server 8000   # then open http://localhost:8000

## Deploy to Vercel

Import the repo at vercel.com/new (framework preset "Other", no build command). Every push to `main` redeploys.

## Data

`data/shops.json` entries:

    { name, place_id, address, lat, lng, rating, total_ratings, cat,
      hours,      // 7 lists (Mon..Sun) of [startMin, endMin], end may pass 1440; null = unknown
      website, phone, cards, delivery, note }

`cat` is one of `lump`, `sh`, `vin`, `char`, `flea`. `tags` uses `byweight`, `men`, `kids`, `shoes`, `home`, `designer`, `books`; the evidence for each is in `review/tags.md`. `delivery` and `note` are summaries of Google reviews.

Refresh hours, ratings and closures from the Places API (needs a key with Places API (New) enabled; about 124 requests):

    GOOGLE_MAPS_API_KEY=... node scripts/refresh.mjs

Map: © OpenFreeMap, © OpenStreetMap contributors.
