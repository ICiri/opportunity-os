export type GraphNode = {
  id: string;
  label: string;
  type: 'USER' | 'CONTACT' | 'COMPANY' | 'THREAD' | 'REFERRAL';
  x: number;
  y: number;
};

export type GraphEdge = {
  from: string;
  to: string;
  label: string;
  provenance: 'FACT' | 'INFERENCE' | 'UNKNOWN';
  evidence: string;
};

export type RelationshipGraphModel = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height: number;
  title: string;
};

export const emptyRelationshipGraph = (title = 'No persisted relationship evidence'): RelationshipGraphModel => ({
  nodes: [],
  edges: [],
  height: 430,
  title,
});

export function validateRelationshipGraph(graph: RelationshipGraphModel) {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const findings: string[] = [];
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) findings.push(`DANGLING_EDGE:${edge.from}:${edge.to}`);
    if (!edge.evidence.trim()) findings.push(`MISSING_EVIDENCE:${edge.from}:${edge.to}`);
  }
  return findings;
}
