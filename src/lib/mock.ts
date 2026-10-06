import type { AffectedScale, HazardFlags, IncidentCategory, SeverityBand } from './types';
import { EMPTY_HAZARDS } from './types';
import { CATEGORY_LABELS } from './taxonomy';

/**
 * Deterministic rule engine used when no live model is configured.
 *
 * It is a keyword classifier, and it is honest about that — results produced
 * here are tagged engine:'mock' and badged in the UI. Its purpose is to keep
 * every downstream stage (scoring, routing, dispatch, escalation) exercisable
 * and demonstrable without a network dependency.
 */

const CATEGORY_KEYWORDS: Record<IncidentCategory, string[]> = {
  accident: ['accident', 'crash', 'collision', 'collided', 'overturn', 'bike fell', 'rammed', 'knocked down'],
  fire: ['fire', 'burning', 'smoke', 'flames', 'blaze', 'short circuit', 'ablaze'],
  flooding: ['flood', 'waterlogging', 'water logging', 'knee deep', 'submerged', 'inundated', 'water filled', 'standing water'],
  garbage: ['garbage', 'trash', 'rubbish', 'dump', 'waste', 'litter', 'kachra', 'stinking', 'bin'],
  pothole: ['pothole', 'crater', 'gaddha', 'hole in the road', 'cavity'],
  fallen_tree: ['tree', 'branch', 'uprooted', 'fallen tree'],
  water_leak: ['leak', 'pipeline burst', 'water pipe', 'gushing', 'burst pipe', 'seepage'],
  road_damage: ['road damage', 'broken road', 'cracked road', 'subsided', 'caved in', 'uneven road'],
  streetlight: ['streetlight', 'street light', 'lamp post', 'dark road', 'light not working'],
  other: [],
};

const SEVERITY_KEYWORDS: Record<SeverityBand, string[]> = {
  critical: ['trapped', 'unconscious', 'bleeding', 'serious', 'critical', 'dead', 'collapse', 'explosion', 'child'],
  high: ['injured', 'blocking', 'blocked', 'dangerous', 'urgent', 'heavy', 'spreading', 'deep'],
  medium: ['slow', 'inconvenience', 'smell', 'daily', 'repeated', 'since'],
  low: ['minor', 'small', 'slight'],
};

const HAZARD_KEYWORDS: Record<keyof HazardFlags, string[]> = {
  injuriesLikely: ['injur', 'bleed', 'hurt', 'unconscious', 'trapped', 'ambulance', 'victim'],
  fireOrSmoke: ['fire', 'smoke', 'burning', 'flames', 'blaze'],
  structuralRisk: ['collapse', 'crack', 'slab', 'wall', 'tilting', 'unsafe building'],
  electricalRisk: ['wire', 'cable', 'electric', 'short circuit', 'transformer', 'live wire'],
  blockingTraffic: ['blocking', 'blocked', 'jam', 'traffic', 'road closed', 'lane'],
  waterLogging: ['water', 'flood', 'submerged', 'knee deep', 'logging'],
};

const DEFAULT_SEVERITY: Record<IncidentCategory, SeverityBand> = {
  accident: 'high',
  fire: 'critical',
  flooding: 'high',
  garbage: 'low',
  pothole: 'medium',
  fallen_tree: 'high',
  water_leak: 'medium',
  road_damage: 'medium',
  streetlight: 'low',
  other: 'medium',
};

const DEFAULT_SCALE: Record<IncidentCategory, AffectedScale> = {
  accident: 'street',
  fire: 'neighbourhood',
  flooding: 'neighbourhood',
  garbage: 'street',
  pothole: 'street',
  fallen_tree: 'street',
  water_leak: 'street',
  road_damage: 'street',
  streetlight: 'individual',
  other: 'individual',
};

function countHits(haystack: string, needles: string[]): number {
  return needles.reduce((n, k) => (haystack.includes(k) ? n + 1 : n), 0);
}

export interface MockExtraction {
  category: IncidentCategory;
  subtype: string;
  summary: string;
  severityBand: SeverityBand;
  hazards: HazardFlags;
  affectedScale: AffectedScale;
  observedObjects: string[];
  confidence: number;
  needsHumanReview: boolean;
  rationale: string;
}

export function mockExtract(input: {
  text?: string;
  transcript?: string;
  hasImage: boolean;
  address?: string;
}): MockExtraction {
  const blob = `${input.text ?? ''} ${input.transcript ?? ''}`.toLowerCase();

  let category: IncidentCategory = 'other';
  let best = 0;
  for (const cat of Object.keys(CATEGORY_KEYWORDS) as IncidentCategory[]) {
    const hits = countHits(blob, CATEGORY_KEYWORDS[cat]);
    if (hits > best) {
      best = hits;
      category = cat;
    }
  }

  let severity: SeverityBand = DEFAULT_SEVERITY[category];
  for (const band of ['critical', 'high', 'medium', 'low'] as SeverityBand[]) {
    if (countHits(blob, SEVERITY_KEYWORDS[band]) > 0) {
      severity = band;
      break;
    }
  }

  const hazards: HazardFlags = { ...EMPTY_HAZARDS };
  for (const key of Object.keys(HAZARD_KEYWORDS) as (keyof HazardFlags)[]) {
    hazards[key] = countHits(blob, HAZARD_KEYWORDS[key]) > 0;
  }
  if (category === 'fire') hazards.fireOrSmoke = true;
  if (category === 'flooding') hazards.waterLogging = true;
  if (category === 'accident') hazards.blockingTraffic = true;

  // Confidence reflects evidence quality, not keyword count.
  let confidence = 0.42;
  if (best > 0) confidence += 0.18;
  if (best > 1) confidence += 0.1;
  if (input.text && input.text.length > 40) confidence += 0.08;
  if (input.transcript) confidence += 0.05;
  if (input.hasImage) confidence += 0.05;
  confidence = Math.min(0.82, Number(confidence.toFixed(2)));

  const label = CATEGORY_LABELS[category];
  const where = input.address ? ` near ${input.address}` : '';

  return {
    category,
    subtype: best > 0 ? `${label} (keyword-matched)` : 'Unclassified report',
    summary: `${label} reported${where}. ${input.text ? input.text.slice(0, 140) : 'No written description supplied.'}`.trim(),
    severityBand: severity,
    hazards,
    affectedScale: DEFAULT_SCALE[category],
    observedObjects: input.hasImage ? ['image attached — not analysed in rule mode'] : [],
    confidence,
    needsHumanReview: confidence < 0.6 || category === 'other',
    rationale:
      best > 0
        ? `Rule engine: matched ${best} keyword group(s) for "${label}". Severity band from keyword scan, defaulting to ${DEFAULT_SEVERITY[category]} for this category.`
        : 'Rule engine: no category keywords matched. Flagged for human review.',
  };
}

export function mockDedupe(input: {
  distanceM: number;
  elapsedMinutes: number;
  sameCategory: boolean;
  radiusM: number;
  windowMinutes: number;
}): { sameIncident: boolean; confidence: number; reason: string } {
  if (!input.sameCategory) {
    return { sameIncident: false, confidence: 0.9, reason: 'Rule engine: different category.' };
  }
  const distRatio = input.distanceM / input.radiusM;
  const timeRatio = input.elapsedMinutes / input.windowMinutes;
  const score = 1 - (distRatio * 0.65 + timeRatio * 0.35);
  const same = score > 0.55;
  return {
    sameIncident: same,
    confidence: Number(Math.min(0.85, Math.max(0.3, score)).toFixed(2)),
    reason: `Rule engine: ${Math.round(input.distanceM)} m apart (gate ${input.radiusM} m), ${Math.round(input.elapsedMinutes)} min apart (gate ${input.windowMinutes} min) → proximity score ${score.toFixed(2)}.`,
  };
}

export function mockFuse(input: {
  category: IncidentCategory;
  reportCount: number;
  address?: string;
  department: string;
}): {
  title: string;
  situationReport: string;
  contradictions: string[];
  recommendedActions: string[];
} {
  const label = CATEGORY_LABELS[input.category];
  const where = input.address ?? 'the reported location';

  const PLAYBOOK: Record<IncidentCategory, string[]> = {
    accident: ['Dispatch traffic marshals to divert flow around the site', 'Request ambulance standby via 108', 'Clear the carriageway once casualties are moved', 'Record vehicle details for the accident register'],
    fire: ['Dispatch nearest fire tender immediately', 'Cut electrical supply to the affected block', 'Establish a 50 m cordon and evacuate adjacent structures', 'Keep an ambulance on standby'],
    flooding: ['Deploy dewatering pumps to the low point', 'Clear the nearest storm-water drain inlets', 'Barricade the stretch and post diversion signage', 'Warn residents of ground-floor units'],
    garbage: ['Assign the ward collection vehicle on the next round', 'Issue a notice if this is a repeat dumping point', 'Sanitise the spot after clearance'],
    pothole: ['Schedule a cold-mix patching crew', 'Place a hazard marker until repair', 'Log the stretch for the next resurfacing cycle'],
    fallen_tree: ['Dispatch a cutting crew with a chainsaw unit', 'Check for entangled electrical cables before cutting', 'Clear the carriageway and remove debris'],
    water_leak: ['Isolate the affected valve section', 'Dispatch a leak-repair gang', 'Notify residents of the supply interruption window'],
    road_damage: ['Inspect the extent of the subsidence before scheduling works', 'Barricade the affected lane', 'Schedule resurfacing and log the stretch'],
    streetlight: ['Raise a maintenance ticket for the feeder pillar', 'Check whether the whole circuit is affected'],
    other: ['Assign a ward officer to inspect and reclassify', 'Contact the reporter for further detail'],
  };

  return {
    title: `${label} at ${where}`,
    situationReport:
      input.reportCount > 1
        ? `${input.reportCount} independent reports describe a ${label.toLowerCase()} at ${where}. Corroboration across multiple reporters raises confidence that the event is live and as described. Assigned to ${input.department}.`
        : `A single report describes a ${label.toLowerCase()} at ${where}. Awaiting corroboration. Assigned to ${input.department}.`,
    contradictions: [],
    recommendedActions: PLAYBOOK[input.category].slice(0, 4),
  };
}

export function mockVerify(input: { hasAfterImage: boolean; closureNote?: string }): {
  verdict: 'resolved' | 'partial' | 'unresolved';
  confidence: number;
  rationale: string;
} {
  if (!input.hasAfterImage) {
    return {
      verdict: 'unresolved',
      confidence: 0.8,
      rationale:
        'Rule engine: no after-photograph was supplied, so the closure cannot be evidenced. Holding the incident open.',
    };
  }
  return {
    verdict: 'partial',
    confidence: 0.5,
    rationale:
      'Rule engine: an after-photograph was supplied but cannot be visually compared without a live model. Marked partial so a human reviews the closure rather than it passing silently.',
  };
}
