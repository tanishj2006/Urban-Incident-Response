import type { IncidentCategory, PriorityBand, DepartmentRouting } from './types';

/**
 * Policy tables, matching Stage 1.
 *
 * These are deliberately NOT model-generated: which department owns a category,
 * and how fast they must respond, are administrative decisions. The model
 * classifies; the table routes. Stage 1 §2.2 Step 7 requires exactly this —
 * "the mapping is therefore held in a configuration table that an administrator
 * can edit, rather than being written into the code".
 */

/** Stage 1, Table 2.2. */
export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  accident: 'Accident',
  fire: 'Fire',
  flooding: 'Flooding / waterlogging',
  garbage: 'Garbage',
  pothole: 'Pothole',
  fallen_tree: 'Fallen tree',
  water_leak: 'Water leakage',
  road_damage: 'Road damage',
  streetlight: 'Streetlight issue',
  other: 'Other',
};

/** Stage 1, Table 2.2 — the "typical report" column, used in the prompt. */
export const CATEGORY_DESCRIPTIONS: Record<IncidentCategory, string> = {
  accident: 'Vehicle collision or overturned vehicle on a road',
  fire: 'Visible fire or smoke in a building or open area',
  flooding: 'Standing water on roads or in low-lying areas',
  garbage: 'Uncollected or overflowing waste',
  pothole: 'Cavity or depression in the road surface',
  fallen_tree: 'Tree or large branch obstructing a road or footpath',
  water_leak: 'Leaking pipeline or continuously running water',
  road_damage: 'Cracked, broken or subsided road surface',
  streetlight: 'Non-functioning or damaged street lighting',
  other: 'Any civic issue outside the categories above',
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as IncidentCategory[];

interface DeptSpec {
  code: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  secondary: string[];
}

/** Stage 1, Table 2.4. */
export const DEPARTMENTS: Record<IncidentCategory, DeptSpec> = {
  accident: {
    code: 'TRF',
    name: 'Traffic Police / Emergency Services',
    contactEmail: 'control.traffic@city.gov.in',
    contactPhone: '103',
    secondary: ['Emergency Medical Services (108)', 'Roads / Public Works Department'],
  },
  fire: {
    code: 'FIRE',
    name: 'Fire and Emergency Services',
    contactEmail: 'control.fire@city.gov.in',
    contactPhone: '101',
    secondary: ['Emergency Medical Services (108)', 'Disaster Management Cell'],
  },
  flooding: {
    code: 'SWD',
    name: 'Storm Water Drainage / Municipal Engineering',
    contactEmail: 'swd.control@city.gov.in',
    contactPhone: '1916',
    secondary: ['Disaster Management Cell', 'Traffic Police / Emergency Services'],
  },
  garbage: {
    code: 'SWM',
    name: 'Municipal Sanitation / Solid Waste Management',
    contactEmail: 'swm.ward@city.gov.in',
    contactPhone: '1916',
    secondary: [],
  },
  pothole: {
    code: 'RNB',
    name: 'Roads / Public Works Department',
    contactEmail: 'roads.maintenance@city.gov.in',
    contactPhone: '1916',
    secondary: [],
  },
  fallen_tree: {
    code: 'GRD',
    name: 'Garden / Tree Maintenance Department',
    contactEmail: 'tree.authority@city.gov.in',
    contactPhone: '1916',
    secondary: ['Electrical / Street Lighting Department', 'Traffic Police / Emergency Services'],
  },
  water_leak: {
    code: 'HYD',
    name: 'Water Supply Department',
    contactEmail: 'water.leaks@city.gov.in',
    contactPhone: '1916',
    secondary: ['Roads / Public Works Department'],
  },
  road_damage: {
    code: 'RNB',
    name: 'Roads / Public Works Department',
    contactEmail: 'roads.maintenance@city.gov.in',
    contactPhone: '1916',
    secondary: [],
  },
  streetlight: {
    code: 'ELE',
    name: 'Electrical / Street Lighting Department',
    contactEmail: 'street.lighting@city.gov.in',
    contactPhone: '1916',
    secondary: [],
  },
  other: {
    code: 'GEN',
    name: 'Central Control Room for manual assignment',
    contactEmail: 'control.room@city.gov.in',
    contactPhone: '1916',
    secondary: [],
  },
};

export function routeToDepartment(
  category: IncidentCategory,
  hazardNotes: string[],
): DepartmentRouting {
  const spec = DEPARTMENTS[category];
  const reason =
    hazardNotes.length > 0
      ? `Category "${CATEGORY_LABELS[category]}" maps to ${spec.name}. Secondary units added for: ${hazardNotes.join(', ')}.`
      : `Category "${CATEGORY_LABELS[category]}" maps to ${spec.name} under the standing allocation table.`;
  return { ...spec, reason };
}

/**
 * Response-time commitments, in minutes, by priority band. Stage 1 §2.2 Step 9:
 * "Different thresholds are proposed for different priority levels, so that a
 * Critical incident is escalated after a much shorter interval than a Low one."
 */
export const SLA_MINUTES: Record<PriorityBand, number> = {
  P1: 30,
  P2: 120,
  P3: 1440,
  P4: 4320,
};

/** Stage 1 §2.2 Step 6 names the four levels. */
export const PRIORITY_LABELS: Record<PriorityBand, string> = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

export const PRIORITY_BANDS: PriorityBand[] = ['P1', 'P2', 'P3', 'P4'];

/**
 * Per-category gates for duplicate detection. A pothole reported 400 m away is a
 * different pothole; a flood reported 400 m away is very likely the same flood.
 * These gates run BEFORE any model call — they keep the adjudication cheap, and
 * they implement the location- and time-proximity dimensions of Stage 1,
 * Table 2.3.
 */
export const DEDUPE_GATES: Record<IncidentCategory, { radiusM: number; windowMinutes: number }> = {
  accident: { radiusM: 150, windowMinutes: 120 },
  fire: { radiusM: 250, windowMinutes: 180 },
  flooding: { radiusM: 400, windowMinutes: 720 },
  garbage: { radiusM: 80, windowMinutes: 10080 },
  pothole: { radiusM: 60, windowMinutes: 43200 },
  fallen_tree: { radiusM: 120, windowMinutes: 1440 },
  water_leak: { radiusM: 120, windowMinutes: 2880 },
  road_damage: { radiusM: 80, windowMinutes: 43200 },
  streetlight: { radiusM: 50, windowMinutes: 20160 },
  other: { radiusM: 100, windowMinutes: 1440 },
};

export const CHANNEL_LABELS: Record<string, string> = {
  citizen_app: 'Citizen app',
  phone_call: 'Phone call',
  sms: 'SMS',
  social_media: 'Social media',
  field_officer: 'Field officer',
};

/** Stage 1, Table 2.5. */
export const STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  verified: 'Verified',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  escalated: 'Escalated',
};

export const STATUS_MEANINGS: Record<string, string> = {
  reported: 'Received and processed by the pipeline, but no official has reviewed it yet.',
  verified: 'An official has reviewed the report and confirmed it describes a genuine incident.',
  assigned: 'Allocated to a specific department or field officer.',
  in_progress: 'Work on the incident has begun.',
  resolved: 'The department has reported completion and submitted post-action evidence.',
  closed: 'An authorised official has confirmed the resolution and closed the incident.',
  escalated:
    'Unresolved beyond the time threshold for its priority level, and brought to the attention of a higher authority.',
};

/** The order an official moves an incident through. Closure is not here — it
 *  has its own confirmed action, because it cannot be reached automatically. */
export const STATUS_FLOW: string[] = ['verified', 'assigned', 'in_progress', 'resolved'];

/** Below this, the system refuses to commit to a category (Stage 1 §2.2 Step 4). */
export const CONFIDENCE_THRESHOLD = 0.55;
