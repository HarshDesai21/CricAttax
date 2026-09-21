// Country -> flag asset lookup for player cards, keyed off the exact
// `country` value already in the `players` table. Deliberately NOT derived
// from a generic ISO-country-name library, because two values in this
// dataset aren't real ISO countries: "West Indies" (a composite cricket
// team, not a nation) and "England" (a UK constituent country, so a normal
// "GB" lookup would incorrectly give the Union Jack instead of the St.
// George's Cross). Both are hand-mapped below to their own flag files.
//
// Values are full public paths (not bare codes) because the assets aren't
// all the same format: the standard ones are flag-icons' 4x3 SVGs, but
// England and West Indies are user-supplied raster images (a real England
// flag photo and the official Cricket West Indies crest) -- see the
// licensing watch-list note in the project doc re: the WI crest.
const COUNTRY_TO_FLAG_PATH: Record<string, string> = {
  India: "/flags/in.svg",
  Australia: "/flags/au.svg",
  "South Africa": "/flags/za.svg",
  England: "/flags/eng.jpg",
  "West Indies": "/flags/wi.webp",
  "Sri Lanka": "/flags/lk.svg",
  "New Zealand": "/flags/nz.svg",
  Afghanistan: "/flags/af.svg",
  Pakistan: "/flags/pk.svg",
  Bangladesh: "/flags/bd.svg",
  USA: "/flags/us.svg",
  "United States": "/flags/us.svg",
  Zimbabwe: "/flags/zw.svg",
  UAE: "/flags/ae.svg",
  "United Arab Emirates": "/flags/ae.svg",
  Netherlands: "/flags/nl.svg",
  Namibia: "/flags/na.svg",
  Canada: "/flags/ca.svg",
  Ireland: "/flags/ie.svg",
  Samoa: "/flags/ws.svg",
  Portugal: "/flags/pt.svg",
  Nepal: "/flags/np.svg",
};

// Falls back to a generic "unknown flag" look (a blank silver pennant)
// rather than throwing, so one unexpected country string in the data
// doesn't take down the whole draft board -- worth checking this map
// against the real `players.country` values if a flag ever shows blank.
export function flagAssetPath(country: string): string {
  return COUNTRY_TO_FLAG_PATH[country.trim()] ?? "/flags/unknown.svg";
}

// Short corner-index text shown under the flag on a card (e.g. "IND", "WI"),
// per the card design doc's top-left corner index. Separate from the flag
// image lookup since these are cricket-convention abbreviations, not ISO
// codes (e.g. South Africa is "RSA" in cricket, not "ZA").
const COUNTRY_TO_CODE_TEXT: Record<string, string> = {
  India: "IND",
  Australia: "AUS",
  "South Africa": "RSA",
  England: "ENG",
  "West Indies": "WI",
  "Sri Lanka": "SL",
  "New Zealand": "NZ",
  Afghanistan: "AFG",
  Pakistan: "PAK",
  Bangladesh: "BAN",
  USA: "USA",
  "United States": "USA",
  Zimbabwe: "ZIM",
  UAE: "UAE",
  "United Arab Emirates": "UAE",
  Netherlands: "NED",
  Namibia: "NAM",
  Canada: "CAN",
  Ireland: "IRE",
  Samoa: "SAM",
  Portugal: "POR",
  Nepal: "NEP",
};

export function countryCodeText(country: string): string {
  return COUNTRY_TO_CODE_TEXT[country.trim()] ?? country.trim().slice(0, 3).toUpperCase();
}
