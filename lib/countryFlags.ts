// Country -> flag asset lookup for player cards, keyed off the exact
// `country` value already in the `players` table. Deliberately NOT derived
// from a generic ISO-country-name library, because two values in this
// dataset aren't real ISO countries: "West Indies" (a composite cricket
// team, not a nation) and "England" (a UK constituent country, so a normal
// "GB" lookup would incorrectly give the Union Jack instead of the St.
// George's Cross). Both are hand-mapped below to their own flag files.
//
// Flag files live in /public/flags -- standard ones are unmodified copies
// of the flag-icons package's 4x3 SVGs; eng.svg and wi.svg are hand-built
// (see their own files for notes on why).
const COUNTRY_TO_FLAG_CODE: Record<string, string> = {
  India: "in",
  Australia: "au",
  "South Africa": "za",
  England: "eng",
  "West Indies": "wi",
  "Sri Lanka": "lk",
  "New Zealand": "nz",
  Afghanistan: "af",
  Pakistan: "pk",
  Bangladesh: "bd",
  USA: "us",
  "United States": "us",
  Zimbabwe: "zw",
  UAE: "ae",
  "United Arab Emirates": "ae",
  Netherlands: "nl",
  Namibia: "na",
  Canada: "ca",
  Ireland: "ie",
  Samoa: "ws",
  Portugal: "pt",
  Nepal: "np",
};

// Falls back to a generic "unknown flag" look (a blank silver pennant)
// rather than throwing, so one unexpected country string in the data
// doesn't take down the whole draft board -- worth checking this map
// against the real `players.country` values if a flag ever shows blank.
export function flagAssetPath(country: string): string {
  const code = COUNTRY_TO_FLAG_CODE[country.trim()];
  return code ? `/flags/${code}.svg` : "/flags/unknown.svg";
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
