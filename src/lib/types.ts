/**
 * Domain model for the Multimodal Urban Incident Response system.
 *
 * Design note: every AI-derived field is kept SEPARATE from every
 * deterministically-computed field. Extraction/fusion/verification come from the
 * model; priority score, department routing and SLA come from transparent rules.
 * This split is deliberate — an auditor (or examiner) must be able to ask
 * "why is this P1?" and get an arithmetic answer, not "the model said so".
 */

export type IncidentCategory =
  | 'road_accident'
  | 'fire'
  | 'flooding'
  | 'pothole'
  | 'garbage'
  | 'water_leak'
  | 'fallen_tree'
  | 'streetlight'
  | 'sewage'
  | 'building_collapse'
  | 'other';

export type SeverityBand = 'critical' | 'high' | 'medium' | 'low';
export type PriorityBand = 'P1' | 'P2' | 'P3' | 'P4';
export type AffectedScale = 'individual' | 'street' | 'neighbourhood' | 'wide_area';

export type Channel = 'citizen_app' | 'phone_call' | 'sms' | 'social_media' | 'field_officer';
export type Modality = 'image' | 'text' | 'voice' | 'location';

export type IncidentStatus =
  | 'new'
  | 'acknowledged'
  | 'assigned'
  | 'in_progress'
  | 'resolved_pending_verification'
  | 'verified_closed'
  | 'reopened'
  | 'escalated';

/** Which inference engine produced a given AI artifact. Surfaced in the UI. */
export type Engine = 'gemini' | 'mock';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM?: number;
  address?: string;
  ward?: string;
}

/** A single inbound citizen/officer report, before fusion. */
export interface RawReport {
  id: string;
  receivedAt: string;
  channel: Channel;
  modalities: Modality[];
  reporterName?: string;
  reporterPhoneMasked?: string;
  text?: string;
  voiceTranscript?: string;
  imagePath?: string;
  location: GeoPoint;
}

export interface HazardFlags {
  injuriesLikely: boolean;
  fireOrSmoke: boolean;
  structuralRisk: boolean;
  electricalRisk: boolean;
  blockingTraffic: boolean;
  waterLogging: boolean;
}

export const EMPTY_HAZARDS: HazardFlags = {
  injuriesLikely: false,
  fireOrSmoke: false,
  structuralRisk: false,
  electricalRisk: false,
  blockingTraffic: false,
  waterLogging: false,
};

/** Model output for ONE report (stage: Understand). */
export interface Extraction {
  reportId: string;
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
  engine: Engine;
  modelLatencyMs: number;
}

/** External real-time context (stage: Understand / enrich). */
export interface IncidentContext {
  weather?: {
    tempC: number;
    precipitationMm: number;
    windKph: number;
    description: string;
    source: string;
  };
  traffic?: {
    congestionLevel: 'free' | 'moderate' | 'heavy' | 'gridlock';
    note: string;
    /** true = provider is a local simulation, not a real traffic feed. */
    simulated: boolean;
    source: string;
  };
  timeOfDay: 'night' | 'early_morning' | 'morning' | 'afternoon' | 'evening';
  fetchedAt: string;
}

/** One addend in the transparent priority calculation. */
export interface ScoreFactor {
  label: string;
  points: number;
  detail?: string;
}

export interface PriorityResult {
  score: number;
  band: PriorityBand;
  factors: ScoreFactor[];
}

export interface DepartmentRouting {
  code: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  secondary: string[];
  reason: string;
}

/** The structured packet handed to the responsible authority (stage: Notify). */
export interface DispatchPayload {
  payloadId: string;
  generatedAt: string;
  incidentId: string;
  priority: PriorityBand;
  department: string;
  subject: string;
  body: string;
  locationLine: string;
  evidenceCount: number;
  recommendedActions: string[];
  /** Honest status: nothing is transmitted to a real municipal endpoint. */
  deliveryChannel: 'in_app_outbox';
  deliveryNote: string;
}

export interface TimelineEntry {
  at: string;
  actor: string;
  event: string;
  detail?: string;
}

export interface VerificationResult {
  at: string;
  verdict: 'resolved' | 'partial' | 'unresolved';
  confidence: number;
  rationale: string;
  afterImagePath?: string;
  engine: Engine;
}

export interface Escalation {
  at: string;
  level: number;
  reason: string;
  notified: string;
}

/** A fused incident: one real-world event, possibly many reports. */
export interface Incident {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  category: IncidentCategory;
  subtype: string;
  fusedSummary: string;
  location: GeoPoint;
  reports: RawReport[];
  extractions: Extraction[];
  context: IncidentContext;
  priority: PriorityResult;
  department: DepartmentRouting;
  recommendedActions: string[];
  status: IncidentStatus;
  assignee?: string;
  slaDueAt: string;
  slaBreached: boolean;
  dispatch?: DispatchPayload;
  verification?: VerificationResult;
  escalations: Escalation[];
  timeline: TimelineEntry[];
  /** Audit trail of merge decisions made by the dedupe stage. */
  mergeLog: {
    at: string;
    reportId: string;
    confidence: number;
    reason: string;
    engine: Engine;
  }[];
}

export interface Database {
  incidents: Incident[];
  counter: number;
}
