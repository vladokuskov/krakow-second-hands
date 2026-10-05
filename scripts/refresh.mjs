// Refresh data/shops.json from the Google Places API (New).
// Usage: GOOGLE_MAPS_API_KEY=... node scripts/refresh.mjs
// Updates name, address, location, rating, hours, website, phone and payment info,
// drops places Google marks CLOSED_PERMANENTLY, and keeps cat / delivery / note as they are.
import { readFile, writeFile } from "node:fs/promises";

const KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!KEY) { console.error("Set GOOGLE_MAPS_API_KEY"); process.exit(1); }
const FILE = new URL("../data/shops.json", import.meta.url);
const FIELDS = "displayName,formattedAddress,location,rating,userRatingCount,regularOpeningHours,businessStatus,websiteUri,nationalPhoneNumber,paymentOptions";

// Places periods (day 0 = Sunday) -> our format: 7 lists (Mon..Sun) of [startMin, endMin]
function toHours(oh) {
  if (!oh?.periods?.length) return null;
  const out = [[], [], [], [], [], [], []];
  for (const p of oh.periods) {
    if (!p.close) return out.map(() => [[0, 1440]]); // open 24/7
    const day = (p.open.day + 6) % 7;
    const start = p.open.hour * 60 + p.open.minute;
    const span = ((p.close.day - p.open.day + 7) % 7) * 1440;
    out[day].push([start, span + p.close.hour * 60 + p.close.minute]);
  }
  return out;
}

const shops = JSON.parse(await readFile(FILE, "utf8"));
const kept = [];
for (const s of shops) {
  const r = await fetch(`https://places.googleapis.com/v1/places/${s.place_id}?languageCode=en`, {
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": FIELDS },
  });
  if (!r.ok) { console.warn(`! ${s.name}: HTTP ${r.status}, kept unchanged`); kept.push(s); continue; }
  const p = await r.json();
  if (p.businessStatus === "CLOSED_PERMANENTLY") { console.log(`- closed: ${s.name}`); continue; }
  const pay = p.paymentOptions || {};
  kept.push({
    ...s,
    name: p.displayName?.text ?? s.name,
    address: p.formattedAddress ?? s.address,
    lat: p.location?.latitude ?? s.lat,
    lng: p.location?.longitude ?? s.lng,
    rating: p.rating ?? 0,
    total_ratings: p.userRatingCount ?? 0,
    hours: toHours(p.regularOpeningHours) ?? s.hours,
    website: p.websiteUri ?? s.website ?? "",
    phone: p.nationalPhoneNumber ?? s.phone ?? "",
    cards: pay.acceptsCreditCards || pay.acceptsDebitCards ? true : pay.acceptsCashOnly ? false : s.cards ?? null,
  });
}
await writeFile(FILE, JSON.stringify(kept));
console.log(`${kept.length} shops written (${shops.length - kept.length} removed)`);
