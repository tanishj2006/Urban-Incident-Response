import { ALL_CATEGORIES, CATEGORY_DESCRIPTIONS, CATEGORY_LABELS } from './taxonomy';

/**
 * The prompt library.
 *
 * Every prompt the system uses lives here as a data object, not inline in the
 * call site. Two reasons: (1) the /prompts page renders this same array, so the
 * documented prompt can never drift from the executed one; (2) the response
 * schema travels with the template, which is what actually forces valid JSON.
 */

export interface PromptSpec {
  id: string;
  stage: string;
  title: string;
  purpose: string;
  /** Why the prompt is worded the way it is. Shown in the UI. */
  designNotes: string[];
  system: string;
  buildUser: (vars: Record<string, string>) => string;
  responseSchema: Record<string, unknown>;
}

const CATEGORY_ENUM = [...ALL_CATEGORIES];
const SEVERITY_ENUM = ['critical', 'high', 'medium', 'low'];
const SCALE_ENUM = ['individual', 'street', 'neighbourhood', 'wide_area'];

const hazardSchema = {
  type: 'object',
  properties: {
    injuriesLikely: { type: 'boolean' },
    fireOrSmoke: { type: 'boolean' },
    structuralRisk: { type: 'boolean' },
    electricalRisk: { type: 'boolean' },
    blockingTraffic: { type: 'boolean' },
    waterLogging: { type: 'boolean' },
  },
  required: [
    'injuriesLikely',
    'fireOrSmoke',
    'structuralRisk',
    'electricalRisk',
    'blockingTraffic',
    'waterLogging',
  ],
};

export const EXTRACTION_PROMPT: PromptSpec = {
  id: 'p1-extract',
  stage: 'Understand',
  title: 'Multimodal incident extraction',
  purpose:
    'Convert one raw report (photo + free text + voice transcript + location) into a single structured record.',
  designNotes: [
    'Severity is requested as a BAND, never as a number. Models are poor at consistent numeric scoring across calls; bands are stable and are converted to points by deterministic code afterwards.',
    'Hazard flags are separate booleans rather than free text, so the scoring function can consume them without any further parsing.',
    'The model is told to rely only on what is visible or stated. Without this, it reliably invents casualty counts for any accident photo.',
    'A needsHumanReview flag is demanded whenever evidence is thin — this is the escape hatch that keeps a low-confidence guess from silently becoming a P1 dispatch.',
    'confidence is defined explicitly in the prompt, otherwise every report comes back as 0.9.',
    'The category list is given with a one-line definition of each, not just the label. "Pothole" and "Road damage" are otherwise routinely confused, and they route to the same department but carry different repair work.',
    'The model is told it may answer "other" rather than force a fit, because a wrongly confident category produces a wrongly routed dispatch.',
  ],
  system: [
    'You are an intake analyst for a municipal emergency coordination centre.',
    'You convert messy citizen reports into structured incident records.',
    '',
    'The category must be exactly one of these:',
    ...ALL_CATEGORIES.map((c) => `  - ${c}: ${CATEGORY_LABELS[c]} — ${CATEGORY_DESCRIPTIONS[c]}`),
    'If the report does not clearly fit one of the first nine, answer "other". Do not force a fit.',
    '',
    'Rules you must follow:',
    '1. Describe ONLY what is visible in the image or stated in the text/transcript. Never infer casualty counts, causes, or damage you cannot see.',
    '2. If the evidence is ambiguous or thin, say so by setting needsHumanReview to true and lowering confidence.',
    '3. confidence means: how certain you are of the CATEGORY and SEVERITY, where 0.9+ means the evidence is unambiguous, 0.5-0.7 means plausible but under-evidenced, below 0.5 means guessing.',
    '4. Severity bands: critical = risk to life right now; high = risk of injury or major disruption; medium = significant inconvenience or slow-building risk; low = cosmetic or routine maintenance.',
    '5. Write the summary as one factual sentence a control-room operator can read aloud. No adjectives for drama.',
    'Return JSON only, conforming exactly to the provided schema.',
  ].join('\n'),
  buildUser: (v) =>
    [
      'Analyse this incident report.',
      '',
      `Channel: ${v.channel}`,
      `Reported at: ${v.receivedAt}`,
      `Location: ${v.location}`,
      v.address ? `Resolved address: ${v.address}` : '',
      '',
      v.text ? `Citizen description: "${v.text}"` : 'Citizen description: (none provided)',
      v.transcript ? `Voice note transcript: "${v.transcript}"` : '',
      v.hasImage === 'yes'
        ? 'An image from the scene is attached. Treat it as the primary evidence.'
        : 'No image was attached. Work from the text alone and lower your confidence accordingly.',
      '',
      'Produce the structured record.',
    ]
      .filter(Boolean)
      .join('\n'),
  responseSchema: {
    type: 'object',
    properties: {
      category: { type: 'string', enum: CATEGORY_ENUM },
      subtype: { type: 'string' },
      summary: { type: 'string' },
      severityBand: { type: 'string', enum: SEVERITY_ENUM },
      hazards: hazardSchema,
      affectedScale: { type: 'string', enum: SCALE_ENUM },
      observedObjects: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' },
      needsHumanReview: { type: 'boolean' },
      rationale: { type: 'string' },
    },
    required: [
      'category',
      'subtype',
      'summary',
      'severityBand',
      'hazards',
      'affectedScale',
      'observedObjects',
      'confidence',
      'needsHumanReview',
      'rationale',
    ],
  },
};

export const DEDUPE_PROMPT: PromptSpec = {
  id: 'p2-dedupe',
  stage: 'Combine',
  title: 'Same-incident adjudication',
  purpose:
    'Decide whether a new report describes the SAME real-world event as an existing open incident.',
  designNotes: [
    'This prompt only ever runs on candidates that already passed a geographic and temporal gate, so the model is never asked to compare a pothole in one ward with a fire in another.',
    'The question is framed as "same physical event", not "similar text". Two different potholes on the same road produce near-identical descriptions, and a text-similarity framing merges them wrongly.',
    'The model must give a reason string; it is stored in the merge log and shown to the operator, who can split the incident back apart.',
    'Distance and elapsed time are supplied as computed facts rather than leaving the model to reason over raw coordinates, which it does badly.',
  ],
  system: [
    'You decide whether two municipal reports describe the SAME physical real-world event.',
    'Same event means: one occurrence, at one place, at one time, that one crew would be dispatched to resolve.',
    'Two separate potholes on the same street are NOT the same event, even if described identically.',
    'Two photos of one burning building from different angles ARE the same event.',
    'A recurring problem reported weeks apart is NOT the same event unless it was never resolved.',
    'Be conservative: if you are not reasonably confident they are the same event, answer false.',
    'Return JSON only.',
  ].join('\n'),
  buildUser: (v) =>
    [
      'EXISTING OPEN INCIDENT',
      `Category: ${v.existingCategory}`,
      `Summary: ${v.existingSummary}`,
      `First reported: ${v.existingTime}`,
      `Evidence so far: ${v.existingEvidence}`,
      '',
      'NEW REPORT',
      `Category: ${v.newCategory}`,
      `Summary: ${v.newSummary}`,
      `Reported: ${v.newTime}`,
      '',
      'COMPUTED RELATIONSHIP',
      `Distance between the two locations: ${v.distance} metres`,
      `Time elapsed between them: ${v.elapsed}`,
      '',
      'Are these the same physical event?',
    ].join('\n'),
  responseSchema: {
    type: 'object',
    properties: {
      sameIncident: { type: 'boolean' },
      confidence: { type: 'number' },
      reason: { type: 'string' },
    },
    required: ['sameIncident', 'confidence', 'reason'],
  },
};

export const FUSION_PROMPT: PromptSpec = {
  id: 'p3-fuse',
  stage: 'Combine',
  title: 'Multi-report situation report',
  purpose:
    'Merge several corroborating reports into one situation report and a set of recommended response steps.',
  designNotes: [
    'The model is explicitly instructed to flag CONTRADICTIONS between reports rather than averaging them away. Disagreement between witnesses is operationally important.',
    'Recommended actions are constrained to the dispatching department\'s actual remit, which stops the model from recommending "evacuate the city" for a pothole.',
    'Live weather and traffic are injected as context so the advice can reference them; the prompt says to ignore them when irrelevant, preventing shoehorned weather mentions.',
    'Output length is capped in the instructions — control-room staff will not read a five-paragraph brief.',
  ],
  system: [
    'You write situation reports for a municipal control room.',
    'You will be given several citizen reports that have been confirmed to describe ONE event.',
    'Your job: merge them into a single factual brief, and list the concrete next actions.',
    'Rules:',
    '1. If reports CONTRADICT each other, state the contradiction explicitly. Do not silently pick one.',
    '2. Note what corroboration adds: more reports from more angles means higher certainty, say so.',
    '3. Recommended actions must be within the remit of the named department and must be concrete and orderable. No generic advice.',
    '4. The situation report must be at most 3 sentences. Give between 2 and 5 recommended actions.',
    '5. Only mention weather or traffic if it actually changes the response.',
    'Return JSON only.',
  ].join('\n'),
  buildUser: (v) =>
    [
      `Event category: ${v.category}`,
      `Dispatching department: ${v.department}`,
      `Location: ${v.address}`,
      `Live context: ${v.context}`,
      '',
      'REPORTS CONFIRMED AS THE SAME EVENT:',
      v.reports,
      '',
      'Write the situation report and recommended actions.',
    ].join('\n'),
  responseSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      situationReport: { type: 'string' },
      contradictions: { type: 'array', items: { type: 'string' } },
      recommendedActions: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'situationReport', 'contradictions', 'recommendedActions'],
  },
};

export const VERIFICATION_PROMPT: PromptSpec = {
  id: 'p4-verify',
  stage: 'Verify Resolution',
  title: 'Resolution verification from after-evidence',
  purpose:
    'Given the original complaint and an "after" photo, judge whether the problem was actually fixed.',
  designNotes: [
    'The model is given the ORIGINAL summary as the specific thing to check against. Asked only "is this fixed?", it rubber-stamps any tidy-looking photo.',
    'A "partial" verdict exists because the binary version forces the model to call half-cleared garbage "resolved".',
    'The prompt explicitly warns that the after-photo may show a different location or angle — a common way field crews close tickets without doing the work.',
    'This stage is what closes the loop: an unresolved verdict feeds straight back into the escalation rules.',
  ],
  system: [
    'You verify whether a reported municipal problem has actually been resolved.',
    'You are given the original complaint and a photograph taken afterwards.',
    'Rules:',
    '1. Check for the SPECIFIC problem described in the original complaint. Do not pass a photo merely because it looks tidy.',
    '2. If the after-photo appears to show a different location, a different angle that hides the problem area, or is too unclear to judge, return unresolved and say why.',
    '3. Use "partial" when the problem is visibly reduced but not eliminated.',
    '4. Be strict. A false "resolved" means a real hazard gets closed and forgotten.',
    'Return JSON only.',
  ].join('\n'),
  buildUser: (v) =>
    [
      'ORIGINAL COMPLAINT',
      `Category: ${v.category}`,
      `Reported problem: ${v.summary}`,
      `Location: ${v.address}`,
      '',
      `Crew closure note: ${v.closureNote || '(none supplied)'}`,
      '',
      'An "after" photograph is attached. Has the specific reported problem been resolved?',
    ].join('\n'),
  responseSchema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['resolved', 'partial', 'unresolved'] },
      confidence: { type: 'number' },
      rationale: { type: 'string' },
    },
    required: ['verdict', 'confidence', 'rationale'],
  },
};

export const ALL_PROMPTS: PromptSpec[] = [
  EXTRACTION_PROMPT,
  DEDUPE_PROMPT,
  FUSION_PROMPT,
  VERIFICATION_PROMPT,
];
