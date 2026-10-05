import type {
  AffectedScale,
  Channel,
  Database,
  Extraction,
  HazardFlags,
  Incident,
  IncidentCategory,
  IncidentStatus,
  RawReport,
  SeverityBand,
} from './types';
import { EMPTY_HAZARDS } from './types';
import { CATEGORY_LABELS, SLA_MINUTES, routeToDepartment } from './taxonomy';
import { computePriority, buildDispatch } from './pipeline';
import { fetchTrafficSimulated, timeOfDay } from './context';

/**
 * Controlled test scenarios.
 *
 * The project brief calls for "a small controlled set of test scenarios
 * created only for evaluating the system during development" — this is it.
 * These are not training data; they exist so the dashboard, the escalation
 * sweep and the verification loop are all demonstrable from a cold start.
 *
 * Note incident 1: three separate citizen reports of one crash, already merged
 * by the Combine stage. That is the duplicate-collapse behaviour, visible.
 */

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

let seq = 0;
const rid = () => `RPT-S${String(++seq).padStart(3, '0')}`;

// Separate counter: extractions are built after their reports, so reusing `seq`
// gave every extraction in a cluster the same latency, which reads as fabricated.
let exSeq = 0;

function mkReport(p: {
  channel: Channel;
  minutesAgo: number;
  text: string;
  lat: number;
  lng: number;
  address: string;
  reporter?: string;
  image?: string;
  voice?: string;
}): RawReport {
  return {
    id: rid(),
    receivedAt: ago(p.minutesAgo),
    channel: p.channel,
    modalities: [
      'text',
      'location',
      ...(p.image ? (['image'] as const) : []),
      ...(p.voice ? (['voice'] as const) : []),
    ],
    reporterName: p.reporter,
    reporterPhoneMasked: '+91 ••••• ••' + String(10 + (seq % 89)),
    text: p.text,
    voiceTranscript: p.voice,
    imagePath: p.image,
    location: { lat: p.lat, lng: p.lng, accuracyM: 8 + (seq % 20), address: p.address },
  };
}

function mkExtraction(p: {
  report: RawReport;
  category: IncidentCategory;
  subtype: string;
  summary: string;
  severity: SeverityBand;
  hazards: Partial<HazardFlags>;
  scale: AffectedScale;
  objects: string[];
  confidence: number;
  rationale: string;
}): Extraction {
  return {
    reportId: p.report.id,
    category: p.category,
    subtype: p.subtype,
    summary: p.summary,
    severityBand: p.severity,
    hazards: { ...EMPTY_HAZARDS, ...p.hazards },
    affectedScale: p.scale,
    observedObjects: p.objects,
    confidence: p.confidence,
    needsHumanReview: p.confidence < 0.6,
    rationale: p.rationale,
    engine: 'mock',
    modelLatencyMs: 320 + (++exSeq * 271) % 1180,
  };
}

function assemble(p: {
  id: string;
  reports: RawReport[];
  extractions: Extraction[];
  category: IncidentCategory;
  subtype: string;
  title: string;
  summary: string;
  actions: string[];
  status: IncidentStatus;
  assignee?: string;
  createdMinutesAgo: number;
  rainMm?: number;
}): Incident {
  const createdAt = ago(p.createdMinutesAgo);
  const base = p.reports[0];
  const when = new Date(createdAt);

  const incident: Incident = {
    id: p.id,
    createdAt,
    updatedAt: ago(Math.max(0, p.createdMinutesAgo - 12)),
    title: p.title,
    category: p.category,
    subtype: p.subtype,
    fusedSummary: p.summary,
    location: { ...base.location },
    reports: p.reports,
    extractions: p.extractions,
    context: {
      weather: {
        tempC: 29.4,
        precipitationMm: p.rainMm ?? 0,
        windKph: 14.8,
        description: (p.rainMm ?? 0) > 0 ? 'Moderate rain' : 'Partly cloudy',
        source: 'Open-Meteo (cached at seed time)',
      },
      traffic: fetchTrafficSimulated(base.location, when),
      timeOfDay: timeOfDay(when),
      fetchedAt: createdAt,
    },
    priority: { score: 0, band: 'P4', factors: [] },
    department: routeToDepartment(p.category, []),
    recommendedActions: p.actions,
    status: p.status,
    assignee: p.assignee,
    slaDueAt: createdAt,
    slaBreached: false,
    escalations: [],
    timeline: [
      {
        at: createdAt,
        actor: 'System',
        event: 'Incident created',
        detail: `From report ${base.id} (${base.channel}).`,
      },
    ],
    mergeLog: [],
  };

  const rain = (p.rainMm ?? 0) > 0.2;
  const heavy =
    incident.context.traffic?.congestionLevel === 'heavy' ||
    incident.context.traffic?.congestionLevel === 'gridlock';
  incident.priority = computePriority(p.extractions, p.reports.length, { rain, heavyTraffic: heavy }, createdAt);
  incident.slaDueAt = new Date(
    new Date(createdAt).getTime() + SLA_MINUTES[incident.priority.band] * 60_000,
  ).toISOString();
  incident.slaBreached =
    Date.now() > new Date(incident.slaDueAt).getTime() &&
    !['verified_closed', 'resolved_pending_verification'].includes(p.status);
  incident.dispatch = buildDispatch(incident);

  if (p.status !== 'new') {
    incident.timeline.push({
      at: ago(Math.max(1, p.createdMinutesAgo - 6)),
      actor: incident.department.name,
      event: 'Dispatch acknowledged',
      detail: `Packet ${incident.dispatch.payloadId} received.`,
    });
  }
  if (p.assignee) {
    incident.timeline.push({
      at: ago(Math.max(1, p.createdMinutesAgo - 10)),
      actor: 'Control room',
      event: 'Crew assigned',
      detail: p.assignee,
    });
  }
  return incident;
}

export function buildSeed(): Database {
  seq = 0;
  exSeq = 0;
  const incidents: Incident[] = [];

  // ── 1. Road accident at Sion Circle — THREE reports collapsed into one ──────
  const a1 = mkReport({
    channel: 'citizen_app', minutesAgo: 41, lat: 19.04012, lng: 72.86255,
    address: 'Sion Circle, Sion, Mumbai', reporter: 'R. Deshmukh', image: '/uploads/sample-accident.svg',
    text: 'Two-wheeler and auto collided at the circle. Rider is on the road and not getting up. Traffic completely stuck.',
  });
  const a2 = mkReport({
    channel: 'phone_call', minutesAgo: 38, lat: 19.04028, lng: 72.86291,
    address: 'Sion Circle, Sion, Mumbai', reporter: 'Anonymous caller',
    text: 'Accident near Sion circle signal, one person injured, please send ambulance.',
    voice: 'There has been an accident at Sion circle, a bike has hit an auto rickshaw, one man is injured and bleeding from the leg, please send an ambulance quickly.',
  });
  const a3 = mkReport({
    channel: 'social_media', minutesAgo: 33, lat: 19.03985, lng: 72.86218,
    address: 'Sion Circle, Sion, Mumbai', reporter: '@mumbai_traffic_watch',
    text: 'Massive jam at Sion circle because of a bike accident. Avoid this route, nothing moving for 20 mins.',
    image: '/uploads/sample-accident-2.svg',
  });
  const e1 = mkExtraction({
    report: a1, category: 'road_accident', subtype: 'Two-wheeler vs three-wheeler collision',
    summary: 'Collision between a two-wheeler and an auto-rickshaw at Sion Circle; one rider is immobile on the carriageway and traffic is obstructed.',
    severity: 'critical', hazards: { injuriesLikely: true, blockingTraffic: true }, scale: 'street',
    objects: ['motorcycle on its side', 'auto-rickshaw', 'person lying on road', 'stopped vehicles'],
    confidence: 0.88, rationale: 'Image shows a person on the carriageway beside an overturned two-wheeler; text explicitly reports the rider is not getting up.',
  });
  const e2 = mkExtraction({
    report: a2, category: 'road_accident', subtype: 'Collision with injury',
    summary: 'Caller reports a bike-auto collision at Sion Circle with one person bleeding from the leg.',
    severity: 'critical', hazards: { injuriesLikely: true, blockingTraffic: true }, scale: 'street',
    objects: [], confidence: 0.79, rationale: 'Voice transcript states visible bleeding; no image to corroborate, so confidence held below the image-backed report.',
  });
  const e3 = mkExtraction({
    report: a3, category: 'road_accident', subtype: 'Traffic obstruction from collision',
    summary: 'Social post reports a bike accident at Sion Circle causing a 20-minute standstill.',
    severity: 'high', hazards: { blockingTraffic: true }, scale: 'street',
    objects: ['queued traffic'], confidence: 0.72,
    rationale: 'Post focuses on congestion; injury not mentioned, so severity assessed one band lower than the direct reports.',
  });
  const inc1 = assemble({
    id: 'INC-2026-0001', reports: [a1, a2, a3], extractions: [e1, e2, e3],
    category: 'road_accident', subtype: 'Two-wheeler vs three-wheeler collision',
    title: 'Road accident at Sion Circle',
    summary: 'Three independent reports confirm a collision between a two-wheeler and an auto-rickshaw at Sion Circle. At least one rider is injured and immobile on the carriageway; the junction is fully obstructed with queues reported for 20 minutes. Corroboration across app, phone and social channels makes the injury report reliable.',
    actions: ['Dispatch ambulance via 108 to the north arm of the junction', 'Deploy traffic marshals to divert flow via Sion Hospital Road', 'Clear the carriageway once the casualty is moved', 'Record vehicle registration details for the accident register'],
    status: 'assigned', assignee: 'Traffic unit TRF-07 + EMS-114', createdMinutesAgo: 41,
  });
  inc1.mergeLog = [
    { at: ago(38), reportId: a2.id, confidence: 0.91, reason: 'Same junction (38 m apart), 3 minutes apart, both describe a two-wheeler collision with an injured rider. One event seen by two reporters.', engine: 'mock' },
    { at: ago(33), reportId: a3.id, confidence: 0.84, reason: 'Within 45 m and 8 minutes of the existing incident; describes the same collision from the congestion side rather than the casualty side.', engine: 'mock' },
  ];
  inc1.timeline.push(
    { at: ago(38), actor: 'System', event: 'Corroborating report merged', detail: `Report ${a2.id} via phone_call. Evidence now 2 reports.` },
    { at: ago(33), actor: 'System', event: 'Corroborating report merged', detail: `Report ${a3.id} via social_media. Evidence now 3 reports.` },
  );
  incidents.push(inc1);

  // ── 2. Fire — Kurla West ────────────────────────────────────────────────────
  const b1 = mkReport({
    channel: 'phone_call', minutesAgo: 22, lat: 19.07261, lng: 72.88452,
    address: 'LBS Marg, Kurla West, Mumbai', reporter: 'Shop owner',
    text: 'Fire in the godown behind our shop, thick black smoke coming out, people are running out.',
    voice: 'There is a big fire in the godown behind LBS Marg, lot of black smoke, I think there are gas cylinders inside, please send fire brigade fast.',
  });
  const f1 = mkExtraction({
    report: b1, category: 'fire', subtype: 'Commercial godown fire',
    summary: 'Active fire with heavy black smoke in a godown off LBS Marg, Kurla West; occupants evacuating and cylinders possibly stored on site.',
    severity: 'critical', hazards: { fireOrSmoke: true, injuriesLikely: true, structuralRisk: true, electricalRisk: true }, scale: 'neighbourhood',
    objects: [], confidence: 0.81,
    rationale: 'Caller reports visible flames and dense smoke with possible cylinder storage. No image supplied; confidence capped accordingly.',
  });
  incidents.push(assemble({
    id: 'INC-2026-0002', reports: [b1], extractions: [f1], category: 'fire',
    subtype: 'Commercial godown fire', title: 'Godown fire off LBS Marg, Kurla West',
    summary: 'A single phone report describes an active godown fire off LBS Marg with heavy black smoke and possible cylinder storage. Occupants are self-evacuating. Awaiting corroboration but severity does not permit waiting.',
    actions: ['Dispatch nearest fire tender and a water bowser immediately', 'Cut electrical supply to the affected block', 'Establish a 50 m cordon and evacuate adjacent structures', 'Position an ambulance at the cordon edge'],
    status: 'in_progress', assignee: 'Fire station Kurla — Tender FB-03', createdMinutesAgo: 22,
  }));

  // ── 3. Flooding — Hindmata, overdue, will escalate ──────────────────────────
  const c1 = mkReport({
    channel: 'citizen_app', minutesAgo: 260, lat: 19.00742, lng: 72.84083,
    address: 'Hindmata Junction, Dadar East, Mumbai', reporter: 'S. Kulkarni', image: '/uploads/sample-flood.svg',
    text: 'Knee deep water at Hindmata again. Buses are stuck, water is entering ground floor shops.',
  });
  const c2 = mkReport({
    channel: 'sms', minutesAgo: 240, lat: 19.00801, lng: 72.84132,
    address: 'Hindmata Junction, Dadar East, Mumbai',
    text: 'Water logging near Hindmata cinema, road not visible, two wheelers stalling.',
  });
  const g1 = mkExtraction({
    report: c1, category: 'flooding', subtype: 'Street-level water-logging',
    summary: 'Knee-deep water-logging across Hindmata Junction with buses immobilised and water entering ground-floor shops.',
    severity: 'high', hazards: { waterLogging: true, blockingTraffic: true }, scale: 'neighbourhood',
    objects: ['submerged carriageway', 'stationary bus', 'shopfront with water at threshold'],
    confidence: 0.86, rationale: 'Image shows water above wheel-hub height on a stationary bus, consistent with the knee-deep description.',
  });
  const g2 = mkExtraction({
    report: c2, category: 'flooding', subtype: 'Street-level water-logging',
    summary: 'SMS reports water-logging near Hindmata cinema with two-wheelers stalling and road markings submerged.',
    severity: 'high', hazards: { waterLogging: true, blockingTraffic: true }, scale: 'street',
    objects: [], confidence: 0.68, rationale: 'Text-only report; corroborates the first but adds no independent visual evidence.',
  });
  incidents.push(assemble({
    id: 'INC-2026-0003', reports: [c1, c2], extractions: [g1, g2], category: 'flooding',
    subtype: 'Street-level water-logging', title: 'Water-logging at Hindmata Junction',
    summary: 'Two reports confirm knee-deep water-logging across Hindmata Junction. Buses are immobilised, two-wheelers are stalling and water is entering ground-floor shops. Active rainfall means the level is likely still rising.',
    actions: ['Deploy dewatering pumps at the Hindmata low point', 'Clear storm-water drain inlets along the junction', 'Barricade the stretch and post diversion signage', 'Warn ground-floor shop occupants to lift stock'],
    status: 'acknowledged', createdMinutesAgo: 260, rainMm: 4.6,
  }));

  // ── 4. Fallen tree — Chembur ────────────────────────────────────────────────
  const d1 = mkReport({
    channel: 'field_officer', minutesAgo: 75, lat: 19.05223, lng: 72.90051,
    address: 'Central Avenue, Chembur, Mumbai', reporter: 'Ward officer M-East',
    text: 'Large branch down across the service road, one electrical cable pulled down with it. Road blocked for cars.',
    image: '/uploads/sample-tree.svg',
  });
  const h1 = mkExtraction({
    report: d1, category: 'fallen_tree', subtype: 'Fallen branch with cable entanglement',
    summary: 'A large branch has fallen across the Central Avenue service road in Chembur, pulling down an electrical cable and blocking vehicle access.',
    severity: 'high', hazards: { blockingTraffic: true, electricalRisk: true }, scale: 'street',
    objects: ['fallen branch', 'sagging cable', 'blocked service road'],
    confidence: 0.9, rationale: 'Officer-supplied image clearly shows both the branch across the carriageway and the displaced cable.',
  });
  incidents.push(assemble({
    id: 'INC-2026-0004', reports: [d1], extractions: [h1], category: 'fallen_tree',
    subtype: 'Fallen branch with cable entanglement', title: 'Fallen branch with live cable, Central Avenue Chembur',
    summary: 'A ward officer reports a large branch across the Central Avenue service road in Chembur with an electrical cable pulled down alongside it. Vehicle access is blocked. The cable must be isolated before any cutting work begins.',
    actions: ['Confirm with the electrical cell that the cable is de-energised before cutting', 'Dispatch a cutting crew with a chainsaw unit', 'Barricade both approaches to the service road', 'Remove debris and restore access'],
    status: 'acknowledged', createdMinutesAgo: 75,
  }));

  // ── 5. Water leak — Ghatkopar ───────────────────────────────────────────────
  const i1 = mkReport({
    channel: 'citizen_app', minutesAgo: 540, lat: 19.08604, lng: 72.90812,
    address: 'Jawahar Road, Ghatkopar East, Mumbai', reporter: 'P. Shetty',
    text: 'Water gushing out of the road near the junction since morning, lot of wastage, road is getting damaged.',
    image: '/uploads/sample-leak.svg',
  });
  const j1 = mkExtraction({
    report: i1, category: 'water_leak', subtype: 'Pipeline leak with road scour',
    summary: 'Continuous water discharge from beneath the carriageway on Jawahar Road, Ghatkopar East, with visible scouring of the road surface.',
    severity: 'medium', hazards: { waterLogging: true }, scale: 'street',
    objects: ['water jet from road surface', 'eroded asphalt', 'wet carriageway'],
    confidence: 0.83, rationale: 'Image shows water emerging under pressure with surrounding surface erosion, consistent with a pressurised main rather than surface runoff.',
  });
  incidents.push(assemble({
    id: 'INC-2026-0005', reports: [i1], extractions: [j1], category: 'water_leak',
    subtype: 'Pipeline leak with road scour', title: 'Pipeline leak on Jawahar Road, Ghatkopar East',
    summary: 'A resident reports continuous pressurised water discharge from beneath Jawahar Road since the morning, with visible scouring of the surface. Ongoing loss and progressive road damage if not isolated.',
    actions: ['Isolate the affected valve section', 'Dispatch a leak-repair gang with excavation support', 'Notify residents of the supply interruption window', 'Raise a follow-on ticket with Roads & Bridges for resurfacing'],
    status: 'assigned', assignee: 'Leak gang HYD-12', createdMinutesAgo: 540,
  }));

  // ── 6. Pothole — awaiting verification ──────────────────────────────────────
  const k1 = mkReport({
    channel: 'citizen_app', minutesAgo: 2600, lat: 19.04805, lng: 72.92803,
    address: 'Sion–Panvel Highway, Mankhurd, Mumbai', reporter: 'A. Qureshi', image: '/uploads/sample-pothole.svg',
    text: 'Deep pothole in the left lane, two-wheelers are swerving into the next lane to avoid it. Very dangerous at night.',
  });
  const l1 = mkExtraction({
    report: k1, category: 'pothole', subtype: 'Deep pothole in running lane',
    summary: 'A deep pothole in the left lane of the Sion–Panvel Highway at Mankhurd is causing two-wheelers to swerve into adjacent traffic.',
    severity: 'high', hazards: { blockingTraffic: true }, scale: 'street',
    objects: ['pothole with exposed aggregate', 'standing water in cavity', 'highway lane markings'],
    confidence: 0.87, rationale: 'Image shows a cavity deeper than the surrounding wearing course with exposed aggregate; swerving behaviour is stated in the report.',
  });
  const inc6 = assemble({
    id: 'INC-2026-0006', reports: [k1], extractions: [l1], category: 'pothole',
    subtype: 'Deep pothole in running lane', title: 'Deep pothole, Sion–Panvel Highway at Mankhurd',
    summary: 'A deep pothole in the left running lane of the Sion–Panvel Highway at Mankhurd is forcing two-wheelers into the adjacent lane. Hazard increases after dark and in rain when the cavity fills.',
    actions: ['Schedule a cold-mix patching crew', 'Place a hazard marker and cone the lane until repair', 'Log the stretch for the next resurfacing cycle'],
    status: 'resolved_pending_verification', assignee: 'Patching crew RNB-04', createdMinutesAgo: 2600,
  });
  inc6.timeline.push({
    at: ago(90), actor: 'Patching crew RNB-04', event: 'Marked resolved by crew',
    detail: 'Cold-mix patch applied. Awaiting photographic verification.',
  });
  incidents.push(inc6);

  // ── 7. Garbage — verified and closed ────────────────────────────────────────
  const m1 = mkReport({
    channel: 'citizen_app', minutesAgo: 4300, lat: 19.05501, lng: 72.91802,
    address: 'Shivaji Nagar, Govandi, Mumbai', reporter: 'N. Ansari', image: '/uploads/sample-garbage.svg',
    text: 'Garbage piled up at the corner for four days now, stinking badly and dogs are spreading it on the road.',
  });
  const n1 = mkExtraction({
    report: m1, category: 'garbage', subtype: 'Uncollected accumulation at a collection point',
    summary: 'Accumulated uncollected waste at a Shivaji Nagar street corner, spreading onto the carriageway.',
    severity: 'medium', hazards: {}, scale: 'street',
    objects: ['piled refuse bags', 'scattered waste on road', 'collection bin overflowing'],
    confidence: 0.84, rationale: 'Image shows refuse volume well beyond bin capacity with spread onto the road surface.',
  });
  const inc7 = assemble({
    id: 'INC-2026-0007', reports: [m1], extractions: [n1], category: 'garbage',
    subtype: 'Uncollected accumulation at a collection point', title: 'Uncollected waste at Shivaji Nagar, Govandi',
    summary: 'Waste has accumulated beyond bin capacity at a Shivaji Nagar collection point over four days and is being spread across the carriageway by animals. Reported as a recurring location.',
    actions: ['Assign the ward collection vehicle on the next round', 'Issue a notice if this is a repeat dumping point', 'Sanitise the spot after clearance'],
    status: 'verified_closed', assignee: 'SWM vehicle M-E/14', createdMinutesAgo: 4300,
  });
  inc7.verification = {
    at: ago(1200), verdict: 'resolved', confidence: 0.88,
    rationale: 'After-photograph shows the same corner with the bin upright and in place, no refuse bags on the ground and a clear carriageway. The specific accumulation described in the complaint is no longer present.',
    afterImagePath: '/uploads/sample-garbage-after.svg', engine: 'mock',
  };
  inc7.timeline.push(
    { at: ago(1260), actor: 'SWM vehicle M-E/14', event: 'Marked resolved by crew', detail: 'Point cleared and sanitised.' },
    { at: ago(1200), actor: 'System', event: 'Resolution verified', detail: 'After-evidence accepted at 0.88 confidence. Incident closed.' },
  );
  incidents.push(inc7);

  // ── 8. Streetlight — new, low priority ──────────────────────────────────────
  const o1 = mkReport({
    channel: 'sms', minutesAgo: 150, lat: 19.04851, lng: 72.89903,
    address: 'Chembur Camp Road, Chembur, Mumbai',
    text: 'Three street lights not working near the camp road bus stop, completely dark at night.',
  });
  const p1 = mkExtraction({
    report: o1, category: 'streetlight', subtype: 'Multiple lamp failure on one circuit',
    summary: 'Three consecutive street lights are out near the Chembur Camp Road bus stop, leaving the stretch unlit after dark.',
    severity: 'medium', hazards: {}, scale: 'street',
    objects: [], confidence: 0.64,
    rationale: 'Text-only report. Three consecutive failures suggest a feeder or circuit fault rather than individual lamps, but this cannot be confirmed without inspection.',
  });
  incidents.push(assemble({
    id: 'INC-2026-0008', reports: [o1], extractions: [p1], category: 'streetlight',
    subtype: 'Multiple lamp failure on one circuit', title: 'Unlit stretch at Chembur Camp Road bus stop',
    summary: 'An SMS report describes three consecutive street lights out near the Chembur Camp Road bus stop. The consecutive pattern points to a circuit or feeder-pillar fault rather than individual lamp failures.',
    actions: ['Raise a maintenance ticket against the feeder pillar', 'Check whether the whole circuit is affected before replacing lamps'],
    status: 'new', createdMinutesAgo: 150,
  }));

  // ── 9. Sewage — reopened after a rejected closure ───────────────────────────
  const q1 = mkReport({
    channel: 'citizen_app', minutesAgo: 3000, lat: 19.04702, lng: 72.93301,
    address: 'Mankhurd Link Road, Mankhurd, Mumbai', reporter: 'F. Khan', image: '/uploads/sample-sewage.svg',
    text: 'Manhole overflowing onto the footpath, children walk through this to school every morning.',
  });
  const r1 = mkExtraction({
    report: q1, category: 'sewage', subtype: 'Manhole overflow onto pedestrian route',
    summary: 'A manhole on Mankhurd Link Road is overflowing across the footpath used as a school route.',
    severity: 'high', hazards: { waterLogging: true }, scale: 'street',
    objects: ['overflowing manhole', 'effluent across footpath', 'pedestrian route'],
    confidence: 0.85, rationale: 'Image shows discharge from the manhole cover spreading across the full footpath width.',
  });
  const inc9 = assemble({
    id: 'INC-2026-0009', reports: [q1], extractions: [r1], category: 'sewage',
    subtype: 'Manhole overflow onto pedestrian route', title: 'Manhole overflow on Mankhurd Link Road',
    summary: 'A manhole on Mankhurd Link Road is discharging across the footpath used by children walking to school. A first closure was rejected at verification because the overflow was still visible in the after-evidence.',
    actions: ['Dispatch a jetting and suction unit', 'Check for a downstream blockage before re-closing', 'Disinfect the footpath after clearance', 'Re-verify with a photograph taken from the original angle'],
    status: 'reopened', assignee: 'Jetting unit SEW-09', createdMinutesAgo: 3000,
  });
  inc9.verification = {
    at: ago(400), verdict: 'unresolved', confidence: 0.76,
    rationale: 'The after-photograph is taken from a different angle and shows a dry section of footpath, but the manhole itself is out of frame. The specific overflow described in the complaint cannot be confirmed as cleared.',
    afterImagePath: '/uploads/sample-sewage-after.svg', engine: 'mock',
  };
  inc9.timeline.push(
    { at: ago(430), actor: 'Jetting unit SEW-09', event: 'Marked resolved by crew', detail: 'Reported cleared.' },
    { at: ago(400), actor: 'System', event: 'Closure rejected at verification', detail: 'After-evidence does not show the reported manhole. Incident reopened.' },
  );
  incidents.push(inc9);

  return { incidents, counter: incidents.length };
}
