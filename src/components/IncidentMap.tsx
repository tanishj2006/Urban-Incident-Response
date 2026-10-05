'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import type { PriorityBand } from '@/lib/types';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  band: PriorityBand;
  reports: number;
}

const BAND_COLOR: Record<PriorityBand, string> = {
  P1: '#a3261d',
  P2: '#8f5505',
  P3: '#3b6a61',
  P4: '#6b655b',
};

/**
 * Leaflet is imported dynamically inside an effect: it touches `window` at
 * module scope and would break server rendering otherwise. Circle markers are
 * used rather than pin icons so no image assets need resolving through the
 * bundler — one less thing to fail on a demo machine.
 */
export default function IncidentMap({ points, height = 420 }: { points: MapPoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !ref.current || mapRef.current) return;

      const map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      if (points.length === 0) {
        map.setView([19.05, 72.89], 12);
        return;
      }

      const group = L.featureGroup(
        points.map((p) =>
          L.circleMarker([p.lat, p.lng], {
            radius: 6 + Math.min(p.reports - 1, 3) * 2,
            color: BAND_COLOR[p.band],
            fillColor: BAND_COLOR[p.band],
            fillOpacity: 0.55,
            weight: 2,
          }).bindPopup(
            `<div style="font-size:13px;line-height:1.4">
               <strong>${p.band}</strong> · ${p.id}<br/>${p.title}
               ${p.reports > 1 ? `<br/><span style="color:#7d7669">${p.reports} merged reports</span>` : ''}
               <br/><a href="/incidents/${p.id}" style="color:#1a4d8f">Open incident →</a>
             </div>`,
          ),
        ),
      ).addTo(map);

      map.fitBounds(group.getBounds().pad(0.25));
    })();

    return () => {
      cancelled = true;
      const m = mapRef.current as { remove?: () => void } | null;
      if (m?.remove) m.remove();
      mapRef.current = null;
    };
  }, [points]);

  return <div ref={ref} style={{ height }} className="w-full rounded-sm border border-line" />;
}
