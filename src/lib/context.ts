import type { GeoPoint, IncidentContext } from './types';

/**
 * Real-time context enrichment.
 *
 * Weather and reverse-geocoding are genuine keyless public APIs.
 * Traffic is a SIMULATED provider: no free real-time traffic API exists for this
 * region, so rather than pretend, the provider is isolated behind the same
 * interface and flags itself simulated:true, which the UI renders as a warning.
 * Swapping in a real feed later means replacing one function.
 */

const WMO: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
  55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Slight snow', 73: 'Moderate snow',
  75: 'Heavy snow', 80: 'Slight rain showers', 81: 'Moderate rain showers',
  82: 'Violent rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

export async function fetchWeather(p: GeoPoint): Promise<IncidentContext['weather']> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}` +
      `&current=temperature_2m,precipitation,weather_code,wind_speed_10m`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return undefined;
    const j = await res.json();
    const c = j?.current;
    if (!c) return undefined;
    return {
      tempC: Number(c.temperature_2m ?? 0),
      precipitationMm: Number(c.precipitation ?? 0),
      windKph: Number(c.wind_speed_10m ?? 0),
      description: WMO[Number(c.weather_code)] ?? 'Unknown',
      source: 'Open-Meteo (live)',
    };
  } catch {
    return undefined;
  }
}

export async function reverseGeocode(p: GeoPoint): Promise<{ address?: string; ward?: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=17`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'UrbanIncidentResponse/1.0 (academic project)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return {};
    const j = await res.json();
    const a = j?.address ?? {};
    const parts = [a.road, a.suburb || a.neighbourhood, a.city_district || a.city].filter(Boolean);
    return {
      address: parts.length ? parts.join(', ') : j?.display_name?.split(',').slice(0, 3).join(','),
      ward: a.city_district || a.suburb,
    };
  } catch {
    return {};
  }
}

/**
 * SIMULATED traffic provider. Derives a stable pseudo-congestion value from the
 * hour of day and a hash of the coordinates, so the same place reads the same
 * way within a demo. Clearly flagged as simulated everywhere it surfaces.
 */
export function fetchTrafficSimulated(p: GeoPoint, when: Date): IncidentContext['traffic'] {
  const hour = when.getHours();
  const hash = Math.abs(Math.round((p.lat * 1000 + p.lng * 1000) * 7919)) % 100;
  const peak = (hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 21);
  const base = peak ? 62 : hour >= 0 && hour <= 5 ? 8 : 32;
  const score = Math.min(99, base + (hash % 35));

  const congestionLevel =
    score > 80 ? 'gridlock' : score > 58 ? 'heavy' : score > 32 ? 'moderate' : 'free';

  return {
    congestionLevel,
    note: `Congestion index ${score}/100${peak ? ' (peak hour)' : ''}.`,
    simulated: true,
    source: 'Local simulation — no live traffic feed connected',
  };
}

export function timeOfDay(d: Date): IncidentContext['timeOfDay'] {
  const h = d.getHours();
  if (h < 5) return 'night';
  if (h < 8) return 'early_morning';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

export async function buildContext(p: GeoPoint, when = new Date()): Promise<IncidentContext> {
  const [weather] = await Promise.all([fetchWeather(p)]);
  return {
    weather,
    traffic: fetchTrafficSimulated(p, when),
    timeOfDay: timeOfDay(when),
    fetchedAt: when.toISOString(),
  };
}

export function describeContext(c: IncidentContext): string {
  const bits: string[] = [];
  if (c.weather) {
    bits.push(
      `${c.weather.description}, ${c.weather.tempC}°C, ${c.weather.precipitationMm} mm precipitation, wind ${c.weather.windKph} km/h`,
    );
  }
  if (c.traffic) bits.push(`traffic ${c.traffic.congestionLevel} (simulated)`);
  bits.push(`time of day: ${c.timeOfDay.replace('_', ' ')}`);
  return bits.join('; ');
}

/** Haversine distance in metres. Used by the dedupe gate. */
export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
