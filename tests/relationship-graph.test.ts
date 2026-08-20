import {describe, expect, it} from 'vitest';
import {
  emptyRelationshipGraph,
  validateRelationshipGraph,
  type RelationshipGraphModel,
} from '../src/lib/relationships/graph';

describe('relationship provenance', () => {
  it('keeps an unavailable graph empty instead of inserting sample people', () => {
    expect(emptyRelationshipGraph().nodes).toEqual([]);
    expect(emptyRelationshipGraph().edges).toEqual([]);
  });

  it('requires every persisted edge to reference nodes and carry evidence', () => {
    const graph: RelationshipGraphModel = {
      title: 'Recorded evidence',
      height: 430,
      nodes: [
        {id: 'person', label: 'Person', type: 'CONTACT', x: 10, y: 10},
        {id: 'company', label: 'Company', type: 'COMPANY', x: 30, y: 10},
      ],
      edges: [
        {
          from: 'person',
          to: 'company',
          label: 'ASSOCIATED',
          provenance: 'INFERENCE',
          evidence: 'Persisted thread association; employment not independently verified.',
        },
      ],
    };
    expect(validateRelationshipGraph(graph)).toEqual([]);
    expect(graph.edges[0]?.provenance).toBe('INFERENCE');
  });

  it('rejects dangling or unsupported edges', () => {
    const graph: RelationshipGraphModel = {
      title: 'Invalid evidence',
      height: 430,
      nodes: [],
      edges: [{from: 'missing-a', to: 'missing-b', label: 'CLAIM', provenance: 'FACT', evidence: ''}],
    };
    expect(validateRelationshipGraph(graph)).toEqual([
      'DANGLING_EDGE:missing-a:missing-b',
      'MISSING_EVIDENCE:missing-a:missing-b',
    ]);
  });
});
