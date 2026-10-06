/**
 * Domain model for the Multimodal Urban Incident Response system.
 *
 * Design note: every AI-derived field is kept SEPARATE from every
 * deterministically-computed field. Extraction/fusion/verification come from the
 * model; priority score, department routing and SLA come from transparent rules.
 * This split is deliberate — an auditor (or examiner) must be able to ask
 * "why is this P1?" and get an arithmetic answer, not "the model said so".
 */

/** The ten categories of Stage 1, Table 2.2. Closed set, with "other" as the
 *  absorbing class so a report is never forced into a wrong category. */
export type IncidentCategory =
  | 'accident'
  | 'fire'
  | 'flooding'
  | 'garbage'
  | 'pothole'
  | 'fallen_tree'
  | 'water_leak'
  | 'road_damage'
  | 'streetlight'
  | 'other';

export type SeverityBand = 'critical' | 'high' | 'medium' | 'low';
export type PriorityBand = 'P1' | 'P2' | 'P3' | 'P4';
export type AffectedScale = 'individual' | 'street' | 'neighbourhood' | 'wide_area';

export type Channel = 'citizen_app' | 'phone_call' | 'sms' | 'social_media' | 'field_officer';
export type Modality = 'image' | 'text' | 'voice' | 'location';

/**
 * The lifecycle of Stage 1, Table 2.5 and Figure 2.2.
 *
 * `resolved` means the department has reported completion and submitted
 * post-action evidence. `closed` means an authorised official has confirmed it.
 * Nothing in this system may move an incident to `closed` on its own — see
 * Stage 1 §1.3.2, which excludes "final closure without human confirmation".
 */
export type IncidentStatus =
  | 'reported'
  | 'verified'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed'
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

  /** What the scoring rules computed. Never mutated by an official. */
  recommendedPriority: PriorityResult;
  /**
   * An official's override. Stage 1 §2.2 Step 6: "The system records both the
   * recommended and the final priority so that disagreements can be reviewed
   * later." Hence two fields rather than one mutable one.
   */
  priorityOverride?: { band: PriorityBand; by: string; at: string; reason?: string };

  /** An official's re-categorisation, when the model got it wrong or deferred. */
  categoryOverride?: { from: IncidentCategory; to: IncidentCategory; by: string; at: string };

  /**
   * Set when no extraction reached the confidence threshold, or extractions
   * disagree. Stage 1 §2.2 Step 4: such a report "is not forced into a
   * category: it is flagged for manual categorisation on the dashboard".
   */
  needsManualCategorisation: boolean;

  department: DepartmentRouting;
  recommendedActions: string[];
  status: IncidentStatus;
  assignee?: string;
  slaDueAt: string;
  slaBreached: boolean;
  dispatch?: DispatchPayload;

  /** Advisory only. Closure is `closure` below, which requires a human. */
  verification?: VerificationResult;
  /** Recorded only when an authorised official confirms closure. */
  closure?: { by: string; at: string; note?: string };

  escalations: Escalation[];
  timeline: TimelineEntry[];

  /**
   * Audit trail of linking decisions. Stage 1 §2.2 Step 5 is explicit that
   * "linking does not mean merging" — a grouping an official disagrees with
   * must be separable, so separations are recorded here too.
   */
  linkLog: {
    at: string;
    action: 'linked' | 'separated';
    reportId: string;
    confidence?: number;
    reason: string;
    engine?: Engine;
    by?: string;
  }[];
}

/** Effective priority = official's override if present, else the recommendation. */
export function effectivePriority(i: Incident): PriorityResult {
  if (!i.priorityOverride) return i.recommendedPriority;
  return {
    ...i.recommendedPriority,
    band: i.priorityOverride.band,
  };
}

export interface Database {
  incidents: Incident[];
  counter: number;
}
