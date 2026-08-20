'use client';

import {useState} from 'react';
import type {RelationshipGraphModel} from '@/lib/relationships/graph';

export function RelationshipGraph({graph, compact = false}: {graph: RelationshipGraphModel; compact?: boolean}) {
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string>();
  const node = graph.nodes.find((item) => item.id === selected);
  const evidence = selected ? graph.edges.filter((edge) => edge.from === selected || edge.to === selected) : [];

  if (!graph.nodes.length)
    return (
      <section className="graph-shell empty-state" aria-label="Relationship graph">
        <h2>No persisted graph evidence</h2>
        <p>The graph stays empty instead of drawing sample people or relationships.</p>
      </section>
    );

  return (
    <section className={`graph-shell ${compact ? 'compact' : ''}`} aria-label="Relationship graph">
      <div className="graph-toolbar">
        <div>
          <span className="legend fact">Fact</span>
          <span className="legend inference">Inference</span>
          <span className="legend unknown">Unknown</span>
        </div>
        <div>
          <button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.6, value - 0.15))}>
            −
          </button>
          <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
          <button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.6, value + 0.15))}>
            +
          </button>
        </div>
      </div>
      <div className="graph-viewport">
        <svg viewBox={`0 0 900 ${graph.height}`}>
          <title>{graph.title}</title>
          <g style={{transform: `scale(${zoom})`, transformOrigin: 'center'}}>
            {graph.edges.map((edge, index) => {
              const from = graph.nodes.find((item) => item.id === edge.from);
              const to = graph.nodes.find((item) => item.id === edge.to);
              if (!from || !to) return null;
              return (
                <g key={`${edge.from}:${edge.to}:${index}`}>
                  <line
                    className={`edge ${edge.provenance.toLowerCase()}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                  />
                  <text className="edge-label" x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 7}>
                    {edge.label}
                  </text>
                </g>
              );
            })}
            {graph.nodes.map((item) => (
              <g
                key={item.id}
                className={`graph-node ${item.type.toLowerCase()} ${selected === item.id ? 'selected' : ''}`}
                onClick={() => setSelected(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && setSelected(item.id)}
                aria-label={`${item.label}, ${item.type}`}
              >
                <circle cx={item.x} cy={item.y} r="29" />
                <text x={item.x} y={item.y + 4} textAnchor="middle">
                  {item.label.split(' ')[0]}
                </text>
                <text className="node-type" x={item.x} y={item.y + 48} textAnchor="middle">
                  {item.type}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      {node && (
        <div className="graph-evidence">
          <div>
            <span className="kicker">Selected persisted node</span>
            <b>{node.label}</b>
            <small>{node.type}</small>
            {evidence.map((edge) => (
              <small key={`${edge.from}:${edge.to}:${edge.label}`}>
                {edge.provenance} · {edge.label} · {edge.evidence}
              </small>
            ))}
          </div>
          <button onClick={() => setSelected(undefined)} aria-label="Close node details">
            ×
          </button>
        </div>
      )}
    </section>
  );
}
