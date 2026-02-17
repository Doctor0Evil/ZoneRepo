import RightsZoneEngine, { buildRegionalZoneIndex } from '../src/policy/rightsZoneEngine.js';

const engine = new RightsZoneEngine();

const items = [
  {
    id: 'policy-housing-phx',
    kind: 'housing-policy',
    text: `
      This residential housing policy guarantees freedom of movement,
      prohibits forced relocation, and requires informed consent for any data sharing.
      All enforcement actions are subject to due process and public oversight.
    `,
    meta: { region: 'US', territory: 'Arizona', tags: ['housing', 'residential'] },
  },
  {
    id: 'license-med-data',
    kind: 'healthcare-license',
    text: `
      This license uses non-disclosure clauses and proprietary algorithms
      to make binding decisions on patient eligibility without public audit.
    `,
    meta: { region: 'US', territory: 'Arizona', tags: ['healthcare', 'licensing'] },
  },
];

const result = engine.classifyItems(items);
const index = buildRegionalZoneIndex(result);

console.log(JSON.stringify({ result, index }, null, 2));
