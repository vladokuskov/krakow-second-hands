# Kraków Second Hands

Map of every second hand, lumpeks, vintage, charity shop and flea market in Kraków (128 places, from Google Maps, October 2026).

Plain static site, no build step: `index.html`, `app.js`, `styles.css`, `data/shops.json`.

## Run locally

    python3 -m http.server 8000   # then open http://localhost:8000

## Deploy to Vercel

    npx vercel          # preview deploy (first run asks to log in and link a project)
    npx vercel --prod   # production

Or push this folder to GitHub and import it at vercel.com/new. Framework preset: "Other", no build command, output directory = root.

## Updating the data

Edit `data/shops.json`. Each entry:

    { "name", "place_id", "address", "lat", "lng", "rating", "total_ratings", "cat" }

`cat` is one of `lump`, `sh`, `vin`, `char`, `flea`.

`artifact/` holds the single-file version published as a claude.ai artifact and is excluded from deploys via `.vercelignore`.

Map tiles: © OpenStreetMap contributors (fine for a low-traffic personal site; switch to MapTiler/Stadia with a key if it gets real traffic).
