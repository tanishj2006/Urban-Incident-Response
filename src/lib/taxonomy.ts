import type { IncidentCategory, PriorityBand, DepartmentRouting } from './types';

/**
 * Policy tables. These are deliberately NOT model-generated:
 * which department owns a category, and how fast they must respond, are
 * administrative decisions. The model classifies; the table routes.
 * Department names follow the Mumbai municipal corporation structure.
 */

export const CATEGORY_LABELS: Record<IncidentCategory, string> = {
  road_accident: 'Road accident',
  fire: 'Fire',
  flooding: 'Flooding / water-logging',
  pothole: 'Pothole / road damage',
  garbage: 'Garbage accumulation',
  water_leak: 'Water pipeline leak',
  fallen_tree: 'Fallen tree / branch',
  streetlight: 'Streetlight failure',
  sewage: 'Sewage overflow',
  building_collapse: 'Building / structure collapse',
  other: 'Other civic issue',
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as IncidentCategory[];

interface DeptSpec {
  code: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  secondary: string[];
}

export const DEPARTMENTS: Record<IncidentCategory, DeptSpec> = {
  road_accident: {
    code: 'TRF',
    name: 'Traffic Police Control Room',
    contactEmail: 'control.traffic@city.gov.in',
    contactPhone: '103',
    secondary: ['Emergency Medical Services (108)', 'Roads & Bridges'],
  },
  fire: {
    code: 'FIRE',
    name: 'Fire Brigade — Central Control',
    contactEmail: 'control.fire@city.gov.in',
    contactPhone: '101',
    secondary: ['Emergency Medical Services (108)', 'Disaster Management Cell'],
  },
  flooding: {
    code: 'SWD',
    name: 'Storm Water Drains Department',
    contactEmail: 'swd.control@city.gov.in',
    contactPhone: '1916',
    secondary: ['Disaster Management Cell', 'Traffic Police Control Room'],
  },
  pothole: {
    code: 'RNB',
    name: 'Roads & Bridges Department',
    contactEmail: 'roads.maintenance@city.gov.in',
    contactPhone: '1916',
    secondary: [],
  },
  garbage: {
    code: 'SWM',
    name: 'Solid Waste Management',
    contactEmail: 'swm.ward@city.gov.in',
    contactPhone: '1916',
    secondary: [],
  },
  water_leak: {
    code: 'HYD',
    name: 'Hydraulic Engineering (Water Supply)',
    contactEmail: 'hydraulic.leaks@city.gov.in',
    contactPhone: '1916',
    secondary: ['Roads & Bridges'],
  },
  fallen_tree: {
    code: 'GRD',
    name: 'Gardens & Tree Authority',
    contactEmail: 'tree.authority@city.gov.in',
    contactPhone: '1916',
    secondary: ['Electrical Maintenance Cell', 'Traffic Police Control Room'],
  },
  streetlight: {
    code: 'ELE',
    name: 'Electrical Maintenance Cell',
    contactEmail: 'street.lighting@city.gov.in',
    contactPhone: '1916',
    secondary: [],
  },
  sewage: {
    code: 'SEW',
    name: 'Sewerage Operations',
    contactEmail: 'sewerage.ops@city.gov.in',
    contactPhone: '1916',
    secondary: ['Public Health Department'],
  },
  building_collapse: {
    code: 'DMC',
    name: 'Disaster Management Cell',
    contactEmail: 'dmc.control@city.gov.in',
    contactPhone: '1916',
    secondary: ['Fire Brigade — Central Control', 'Emergency Medical Services (108)'],
  },
  other: {
    code: 'GEN',
    name: 'Ward Grievance Desk',
    contactEmail: 'ward.grievance@city.gov.in',
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

/** Response-time commitments, in minutes, by computed priority band. */
export const SLA_MINUTES: Record<PriorityBand, number> = {
  P1: 30,
  P2: 120,
  P3: 1440,
  P4: 4320,
};

export const PRIORITY_LABELS: Record<PriorityBand, string> = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

/**
 * Per-category gates for duplicate detection. A pothole reported 400 m away is a
 * different pothole; a flood reported 400 m away is very likely the same flood.
 * These gates run BEFORE any model call — they keep the LLM adjudication cheap.
 */
export const DEDUPE_GATES: Record<IncidentCategory, { radiusM: number; windowMinutes: number }> = {
  road_accident: { radiusM: 150, windowMinutes: 120 },
  fire: { radiusM: 250, windowMinutes: 180 },
  flooding: { radiusM: 400, windowMinutes: 720 },
  pothole: { radiusM: 60, windowMinutes: 43200 },
  garbage: { radiusM: 80, windowMinutes: 10080 },
  water_leak: { radiusM: 120, windowMinutes: 2880 },
  fallen_tree: { radiusM: 120, windowMinutes: 1440 },
  streetlight: { radiusM: 50, windowMinutes: 20160 },
  sewage: { radiusM: 100, windowMinutes: 2880 },
  building_collapse: { radiusM: 200, windowMinutes: 1440 },
  other: { radiusM: 100, windowMinutes: 1440 },
};

export const CHANNEL_LABELS: Record<string, string> = {
  citizen_app: 'Citizen app',
  phone_call: 'Phone call',
  sms: 'SMS',
  social_media: 'Social media',
  field_officer: 'Field officer',
};

export const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved_pending_verification: 'Awaiting verification',
  verified_closed: 'Verified & closed',
  reopened: 'Reopened',
  escalated: 'Escalated',
};
