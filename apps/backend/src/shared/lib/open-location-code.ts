/**
 * Minimal Open Location Code (Plus Code) helpers — Apache-2.0 algorithm
 * aligned with google/open-location-code (encode / decode / recoverNearest).
 * Only what Lifty autocomplete needs; not a full OLC SDK.
 */

const SEPARATOR = '+';
const SEPARATOR_POSITION = 8;
const PADDING = '0';
const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
const ENCODING_BASE = CODE_ALPHABET.length;
const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;
const MIN_DIGIT_COUNT = 2;
const MAX_DIGIT_COUNT = 15;
const PAIR_CODE_LENGTH = 10;
const PAIR_PRECISION = ENCODING_BASE ** 3;
const PAIR_FIRST_PLACE_VALUE = ENCODING_BASE ** (PAIR_CODE_LENGTH / 2 - 1);
const PAIR_RESOLUTIONS = [20.0, 1.0, 0.05, 0.0025, 0.000125] as const;
const GRID_CODE_LENGTH = MAX_DIGIT_COUNT - PAIR_CODE_LENGTH;
/** Official JS/Python: 4 columns × 5 rows per grid digit. */
const GRID_COLUMNS = 4;
const GRID_ROWS = 5;
const FINAL_LAT_PRECISION = ENCODING_BASE ** 3 * GRID_ROWS ** GRID_CODE_LENGTH;
const FINAL_LNG_PRECISION = ENCODING_BASE ** 3 * GRID_COLUMNS ** GRID_CODE_LENGTH;
const GRID_LAT_FIRST_PLACE_VALUE = GRID_ROWS ** (GRID_CODE_LENGTH - 1);
const GRID_LNG_FIRST_PLACE_VALUE = GRID_COLUMNS ** (GRID_CODE_LENGTH - 1);

export type CodeArea = {
  latitudeLo: number;
  longitudeLo: number;
  latitudeHi: number;
  longitudeHi: number;
  latitudeCenter: number;
  longitudeCenter: number;
  codeLength: number;
};

function alphabetIndex(ch: string): number {
  return CODE_ALPHABET.indexOf(ch);
}

/** Loose OLC body match (with optional + and padding). */
const OLC_BODY_RE = /^[2-9CFGHJMPQRVWX]+$/i;

export function extractPlusCode(input: string): string | null {
  const upper = input.toUpperCase();
  // Full or short with separator, optional surrounding text.
  const withSep = upper.match(/\b([2-9CFGHJMPQRVWX]{2,8}\+[2-9CFGHJMPQRVWX]{2,7})\b/);
  if (withSep?.[1] && isValid(withSep[1])) return withSep[1];
  // Rare: full code without + in paste (8+2+)
  const noSep = upper.match(/\b([2-9CFGHJMPQRVWX]{10,15})\b/);
  if (noSep?.[1]) {
    const body = noSep[1];
    const candidate = `${body.slice(0, 8)}+${body.slice(8)}`;
    if (isValid(candidate)) return candidate;
  }
  return null;
}

export function isValid(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  let c = code.trim().toUpperCase();
  if (c.length < 2) return false;

  const sepPos = c.indexOf(SEPARATOR);
  if (sepPos === -1) return false;
  if (sepPos > SEPARATOR_POSITION || sepPos % 2 === 1) return false;
  if (c.lastIndexOf(SEPARATOR) !== sepPos) return false;

  if (c.includes(PADDING)) {
    if (sepPos < SEPARATOR_POSITION) return false;
    const padPos = c.indexOf(PADDING);
    if (padPos < 0) return false;
    const padMatch = c.match(/0+/);
    if (!padMatch || padMatch[0].length % 2 === 1) return false;
    if (c[c.length - 1] !== SEPARATOR) return false;
  }

  c = c.replaceAll(SEPARATOR, '').replaceAll(PADDING, '');
  if (c.length < MIN_DIGIT_COUNT || c.length > MAX_DIGIT_COUNT) return false;
  if (c.length % 2 === 1 && c.length < PAIR_CODE_LENGTH) return false;
  return OLC_BODY_RE.test(c);
}

export function isShort(code: string): boolean {
  if (!isValid(code)) return false;
  const sepPos = code.indexOf(SEPARATOR);
  return sepPos >= 0 && sepPos < SEPARATOR_POSITION;
}

export function isFull(code: string): boolean {
  if (!isValid(code) || isShort(code)) return false;
  const firstLat = alphabetIndex(code[0].toUpperCase()) * ENCODING_BASE;
  if (firstLat >= LATITUDE_MAX * 2) return false;
  if (code.length > 1) {
    const firstLng = alphabetIndex(code[1].toUpperCase()) * ENCODING_BASE;
    if (firstLng >= LONGITUDE_MAX * 2) return false;
  }
  return true;
}

function clipLatitude(lat: number): number {
  return Math.min(LATITUDE_MAX, Math.max(-LATITUDE_MAX, lat));
}

function normalizeLongitude(lng: number): number {
  let x = lng;
  while (x < -LONGITUDE_MAX) x += LONGITUDE_MAX * 2;
  while (x >= LONGITUDE_MAX) x -= LONGITUDE_MAX * 2;
  return x;
}

function locationToIntegers(latitude: number, longitude: number): [number, number] {
  let latVal = Math.floor(latitude * FINAL_LAT_PRECISION);
  latVal += LATITUDE_MAX * FINAL_LAT_PRECISION;
  if (latVal < 0) latVal = 0;
  else if (latVal >= 2 * LATITUDE_MAX * FINAL_LAT_PRECISION) {
    latVal = 2 * LATITUDE_MAX * FINAL_LAT_PRECISION - 1;
  }

  let lngVal = Math.floor(longitude * FINAL_LNG_PRECISION);
  lngVal += LONGITUDE_MAX * FINAL_LNG_PRECISION;
  if (lngVal < 0) {
    lngVal =
      ((lngVal % (2 * LONGITUDE_MAX * FINAL_LNG_PRECISION)) +
        2 * LONGITUDE_MAX * FINAL_LNG_PRECISION) %
      (2 * LONGITUDE_MAX * FINAL_LNG_PRECISION);
  } else if (lngVal >= 2 * LONGITUDE_MAX * FINAL_LNG_PRECISION) {
    lngVal %= 2 * LONGITUDE_MAX * FINAL_LNG_PRECISION;
  }
  return [latVal, lngVal];
}

export function encode(latitude: number, longitude: number, codeLength = PAIR_CODE_LENGTH): string {
  let codeLen = codeLength;
  if (codeLen < MIN_DIGIT_COUNT || (codeLen < PAIR_CODE_LENGTH && codeLen % 2 === 1)) {
    throw new Error(`Invalid Open Location Code length - ${codeLen}`);
  }
  codeLen = Math.min(codeLen, MAX_DIGIT_COUNT);

  let [latVal, lngVal] = locationToIntegers(clipLatitude(latitude), normalizeLongitude(longitude));
  let code = '';

  if (codeLen > PAIR_CODE_LENGTH) {
    for (let i = 0; i < MAX_DIGIT_COUNT - PAIR_CODE_LENGTH; i++) {
      const latDigit = latVal % GRID_ROWS;
      const lngDigit = lngVal % GRID_COLUMNS;
      const ndx = latDigit * GRID_COLUMNS + lngDigit;
      code = CODE_ALPHABET[ndx] + code;
      latVal = Math.floor(latVal / GRID_ROWS);
      lngVal = Math.floor(lngVal / GRID_COLUMNS);
    }
  } else {
    latVal = Math.floor(latVal / GRID_ROWS ** GRID_CODE_LENGTH);
    lngVal = Math.floor(lngVal / GRID_COLUMNS ** GRID_CODE_LENGTH);
  }

  for (let i = 0; i < PAIR_CODE_LENGTH / 2; i++) {
    code = CODE_ALPHABET[lngVal % ENCODING_BASE] + code;
    code = CODE_ALPHABET[latVal % ENCODING_BASE] + code;
    latVal = Math.floor(latVal / ENCODING_BASE);
    lngVal = Math.floor(lngVal / ENCODING_BASE);
  }

  code = `${code.slice(0, SEPARATOR_POSITION)}${SEPARATOR}${code.slice(SEPARATOR_POSITION)}`;

  if (codeLen >= SEPARATOR_POSITION) {
    return code.slice(0, codeLen + 1);
  }
  return `${code.slice(0, codeLen)}${PADDING.repeat(SEPARATOR_POSITION - codeLen)}${SEPARATOR}`;
}

export function decode(code: string): CodeArea {
  if (!isFull(code)) {
    throw new Error(`Passed Open Location Code is not a valid full code - ${code}`);
  }
  let cleaned = code.replaceAll(SEPARATOR, '').replaceAll(PADDING, '').toUpperCase();
  cleaned = cleaned.slice(0, MAX_DIGIT_COUNT);

  let normalLat = -LATITUDE_MAX * PAIR_PRECISION;
  let normalLng = -LONGITUDE_MAX * PAIR_PRECISION;
  let gridLat = 0;
  let gridLng = 0;

  const pairDigits = Math.min(cleaned.length, PAIR_CODE_LENGTH);
  let pv = PAIR_FIRST_PLACE_VALUE;
  for (let i = 0; i < pairDigits; i += 2) {
    normalLat += alphabetIndex(cleaned[i]) * pv;
    normalLng += alphabetIndex(cleaned[i + 1]) * pv;
    if (i < pairDigits - 2) pv = Math.floor(pv / ENCODING_BASE);
  }

  let latPrecision = pv / PAIR_PRECISION;
  let lngPrecision = pv / PAIR_PRECISION;

  if (cleaned.length > PAIR_CODE_LENGTH) {
    let rowPv = GRID_LAT_FIRST_PLACE_VALUE;
    let colPv = GRID_LNG_FIRST_PLACE_VALUE;
    const digits = Math.min(cleaned.length, MAX_DIGIT_COUNT);
    for (let i = PAIR_CODE_LENGTH; i < digits; i++) {
      const digitVal = alphabetIndex(cleaned[i]);
      const row = Math.floor(digitVal / GRID_COLUMNS);
      const col = digitVal % GRID_COLUMNS;
      gridLat += row * rowPv;
      gridLng += col * colPv;
      if (i < digits - 1) {
        rowPv = Math.floor(rowPv / GRID_ROWS);
        colPv = Math.floor(colPv / GRID_COLUMNS);
      }
    }
    latPrecision = rowPv / FINAL_LAT_PRECISION;
    lngPrecision = colPv / FINAL_LNG_PRECISION;
  }

  const lat = normalLat / PAIR_PRECISION + gridLat / FINAL_LAT_PRECISION;
  const lng = normalLng / PAIR_PRECISION + gridLng / FINAL_LNG_PRECISION;
  const latitudeLo = round14(lat);
  const longitudeLo = round14(lng);
  const latitudeHi = round14(lat + latPrecision);
  const longitudeHi = round14(lng + lngPrecision);
  return {
    latitudeLo,
    longitudeLo,
    latitudeHi,
    longitudeHi,
    latitudeCenter: Math.min(latitudeLo + (latitudeHi - latitudeLo) / 2, LATITUDE_MAX),
    longitudeCenter: Math.min(longitudeLo + (longitudeHi - longitudeLo) / 2, LONGITUDE_MAX),
    codeLength: Math.min(cleaned.length, MAX_DIGIT_COUNT),
  };
}

function round14(n: number): number {
  return Math.round(n * 1e14) / 1e14;
}

export function recoverNearest(
  shortCode: string,
  referenceLat: number,
  referenceLng: number,
): string {
  if (!isShort(shortCode)) {
    if (isFull(shortCode)) return shortCode.toUpperCase();
    throw new Error(`Passed short code is not valid - ${shortCode}`);
  }
  const code = shortCode.trim().toUpperCase();
  const refLat = clipLatitude(referenceLat);
  const refLng = normalizeLongitude(referenceLng);

  const prefixLen = SEPARATOR_POSITION - code.indexOf(SEPARATOR);
  const resolution = PAIR_RESOLUTIONS[(prefixLen / 2) as 0 | 1 | 2 | 3 | 4] ?? PAIR_RESOLUTIONS[0];

  const halfRes = resolution / 2;
  const areaCode = encode(refLat, refLng).slice(0, prefixLen);
  const encodedArea = areaCode + code;
  const decoded = decode(encodedArea);

  let latitude = decoded.latitudeCenter;
  let longitude = decoded.longitudeCenter;

  if (refLat + halfRes < latitude && latitude - resolution >= -LATITUDE_MAX) {
    latitude -= resolution;
  } else if (refLat - halfRes > latitude && latitude + resolution < LATITUDE_MAX) {
    latitude += resolution;
  }

  if (refLng + halfRes < longitude) longitude -= resolution;
  else if (refLng - halfRes > longitude) longitude += resolution;

  return encode(latitude, longitude, decoded.codeLength);
}

/** Resolve plus code (short or full) to center coords using optional bias for short codes. */
export function resolvePlusCodeCenter(
  codeOrText: string,
  biasLat?: number,
  biasLng?: number,
): { lat: number; lng: number; fullCode: string } | null {
  try {
    const extracted = extractPlusCode(codeOrText) ?? codeOrText.trim().toUpperCase();
    let full = extracted.trim().toUpperCase();
    if (isShort(full)) {
      if (
        typeof biasLat !== 'number' ||
        !Number.isFinite(biasLat) ||
        typeof biasLng !== 'number' ||
        !Number.isFinite(biasLng)
      ) {
        return null;
      }
      full = recoverNearest(full, biasLat, biasLng);
    } else if (!isFull(full)) {
      return null;
    }
    const area = decode(full);
    return {
      lat: area.latitudeCenter,
      lng: area.longitudeCenter,
      fullCode: full,
    };
  } catch {
    return null;
  }
}
