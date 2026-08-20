import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import {lintChart} from '../src/lib/design/chart-lint';
describe('deterministic design audit', () => {
  it('flags misleading chart fixtures', () => {
    expect(lintChart({type: 'bar', min: 90, max: 100, context: 'comparison'})).toContain('TRUNCATED_BAR_AXIS');
    expect(lintChart({type: 'pie', categories: 8, context: 'distribution'})).toContain('TOO_MANY_PIE_CATEGORIES');
  });
  it('requires decision context', () => expect(lintChart({type: 'line'})).toContain('MISSING_DECISION_CONTEXT'));
  it('has mobile, forecast-priority and reduced-motion rules', () => {
    const css = fs.readFileSync('src/app/styles.css', 'utf8');
    expect(css).toMatch(/@media\s*\(max-width:\s*680px\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*390px\)/);
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toMatch(/\.forecast-row\s*>\s*:nth-child\(2\)/);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
  });
  it('exposes accessible graph and modal semantics', () => {
    const graph = fs.readFileSync('src/components/relationship-graph.tsx', 'utf8'),
      conversation = fs.readFileSync('src/components/conversation-workspace.tsx', 'utf8');
    expect(graph).toContain('<title>{graph.title}</title>');
    expect(graph).not.toContain('role="img"');
    expect(graph).toContain('aria-label="Zoom in"');
    expect(conversation).toContain('aria-modal="true"');
    expect(conversation).toContain('role="tablist"');
    expect(conversation).toMatch(/event\.key\s*===\s*'Escape'/);
  });
});
