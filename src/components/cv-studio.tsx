'use client';

import {useMemo, useState} from 'react';
import type {OpportunityView} from '@/lib/opportunities/view-model';

type Language = 'en' | 'hr';
type FactLanguage = 'EN' | 'HR';
type FactCategory = 'HEADLINE' | 'SUMMARY' | 'EXPERIENCE' | 'SKILL' | 'EDUCATION' | 'CONTACT';
type ActionState = {kind: 'idle' | 'loading' | 'success' | 'error'; message?: string};
type SourceFact = {
  id: string;
  language: FactLanguage;
  category: FactCategory;
  statement: string;
  evidence: string;
  sourceCvVersionId: string;
  sourceHash: string;
  sourceLocator: string;
  verificationMethod: string;
};
type FactDraft = {sourceFactId: string; category: 'EXPERIENCE' | 'SKILL'; text: string; locator: string};
type TailorResponse = {
  draft?: {
    headline?: {text?: string};
    summary?: {text?: string};
    bulletChanges?: Array<{sourceBulletId: string; text: string}>;
    gaps?: string[];
    warnings?: string[];
  };
  error?: string;
  aiRunId?: string;
};
type SaveResponse = {version?: {version?: number}; error?: string};

function languageFacts(facts: SourceFact[], language: Language) {
  return facts.filter((fact) => fact.language === language.toUpperCase());
}

function sourceProfile(facts: SourceFact[], language: Language) {
  const selected = languageFacts(facts, language);
  const identity = selected.find(
    (fact) => fact.category === 'CONTACT' && /identity|identitet/i.test(fact.sourceLocator),
  );
  const contacts = selected.filter((fact) => fact.category === 'CONTACT' && fact.id !== identity?.id);
  return {
    name:
      identity?.statement ??
      (language === 'hr' ? 'Identitet nije povezan s izvorom' : 'Source-linked identity unavailable'),
    title: selected.find((fact) => fact.category === 'HEADLINE')?.statement ?? '',
    summary: selected.find((fact) => fact.category === 'SUMMARY')?.statement ?? '',
    contacts,
    education: selected.filter((fact) => fact.category === 'EDUCATION'),
    drafts: selected
      .filter(
        (fact): fact is SourceFact & {category: 'EXPERIENCE' | 'SKILL'} =>
          fact.category === 'EXPERIENCE' || fact.category === 'SKILL',
      )
      .map((fact) => ({
        sourceFactId: fact.id,
        category: fact.category,
        text: fact.statement,
        locator: fact.sourceLocator,
      })),
    sourceHash: selected[0]?.sourceHash ?? '',
    sourceVersionId: selected[0]?.sourceCvVersionId ?? '',
  };
}

export function CVStudio({
  initialOpportunity,
  initialLanguage,
  opportunities,
  facts,
}: {
  initialOpportunity?: string;
  initialLanguage?: string;
  opportunities: OpportunityView[];
  facts: SourceFact[];
}) {
  const initialId = opportunities.some((item) => item.id === initialOpportunity)
    ? initialOpportunity!
    : (opportunities[0]?.id ?? '');
  const initialLanguageValue: Language = initialLanguage === 'hr' ? 'hr' : 'en';
  const initialProfile = sourceProfile(facts, initialLanguageValue);
  const [language, setLanguage] = useState<Language>(initialLanguageValue);
  const [opportunityId, setOpportunityId] = useState(initialId);
  const [title, setTitle] = useState(initialProfile.title);
  const [summary, setSummary] = useState(initialProfile.summary);
  const [factDrafts, setFactDrafts] = useState<FactDraft[]>(initialProfile.drafts);
  const [aiRunId, setAiRunId] = useState<string>();
  const [action, setAction] = useState<ActionState>({kind: 'idle'});
  const [tailorGaps, setTailorGaps] = useState<string[]>([]);
  const opportunity = useMemo(
    () => opportunities.find((item) => item.id === opportunityId),
    [opportunityId, opportunities],
  );
  const profile = useMemo(() => sourceProfile(facts, language), [facts, language]);
  const sourceReady = Boolean(profile.sourceVersionId && profile.sourceHash && title && summary && factDrafts.length);
  const experienceDrafts = factDrafts.filter((draft) => draft.category === 'EXPERIENCE');
  const skillDrafts = factDrafts.filter((draft) => draft.category === 'SKILL');

  const resetFromSource = (next: Language) => {
    const nextProfile = sourceProfile(facts, next);
    setLanguage(next);
    setTitle(nextProfile.title);
    setSummary(nextProfile.summary);
    setFactDrafts(nextProfile.drafts);
    setAiRunId(undefined);
    setAction({kind: 'idle'});
    setTailorGaps([]);
  };

  const tailor = async () => {
    if (!opportunity || !sourceReady) {
      setAction({kind: 'error', message: 'A live persisted opportunity and source-linked CV facts are required.'});
      return;
    }
    setAction({kind: 'loading', message: 'Calling the real server-side OpenAI provider…'});
    try {
      const response = await fetch('/api/ai/cv-tailor', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({language, opportunityId: opportunity.id}),
      });
      const payload = (await response.json()) as TailorResponse;
      if (!response.ok) {
        setAction({
          kind: 'error',
          message:
            payload.error === 'OPENAI_DISCONNECTED'
              ? 'OpenAI is not connected. Add the server-side key and model; no fallback draft was generated.'
              : `Tailoring stopped: ${payload.error ?? 'unknown error'}.`,
        });
        return;
      }
      if (!payload.draft?.headline?.text || !payload.draft.summary?.text)
        throw new Error('Structured draft is incomplete.');
      const changes = new Map(
        (payload.draft.bulletChanges ?? []).map((change) => [change.sourceBulletId, change.text]),
      );
      setTitle(payload.draft.headline.text);
      setSummary(payload.draft.summary.text);
      setFactDrafts((current) =>
        current.map((draft) => ({
          ...draft,
          text: changes.get(`fact-${draft.sourceFactId}`) ?? draft.text,
        })),
      );
      setAiRunId(payload.aiRunId);
      setTailorGaps([...(payload.draft.gaps ?? []), ...(payload.draft.warnings ?? [])]);
      setAction({kind: 'success', message: 'Source-linked OpenAI draft is ready for human review. Nothing was sent.'});
    } catch (error) {
      setAction({kind: 'error', message: error instanceof Error ? error.message : 'Tailoring failed.'});
    }
  };

  const save = async () => {
    if (!opportunity || !sourceReady) {
      setAction({
        kind: 'error',
        message: 'A real persisted opportunity and source-linked CV facts are required before saving.',
      });
      return;
    }
    setAction({kind: 'loading', message: 'Encrypting and saving the review-required draft…'});
    try {
      const response = await fetch('/api/cv-versions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          language: language.toUpperCase(),
          opportunityId: opportunity.id,
          title,
          summary,
          factDrafts: factDrafts.map(({sourceFactId, category, text}) => ({sourceFactId, category, text})),
          aiRunId,
        }),
      });
      const payload = (await response.json()) as SaveResponse;
      if (!response.ok) throw new Error(payload.error ?? 'Save failed.');
      setAction({
        kind: 'success',
        message: `Encrypted CV draft v${payload.version?.version ?? '?'} saved with source provenance. Human review is still required.`,
      });
    } catch (error) {
      setAction({kind: 'error', message: error instanceof Error ? error.message : 'Save failed.'});
    }
  };

  return (
    <div className="cv-studio-layout">
      <aside className="cv-controls">
        <span className="kicker">Hash-linked source editor</span>
        <div className="language-switch">
          <button aria-pressed={language === 'en'} onClick={() => resetFromSource('en')}>
            English
          </button>
          <button aria-pressed={language === 'hr'} onClick={() => resetFromSource('hr')}>
            Hrvatski
          </button>
        </div>
        <label>
          Opportunity
          <select
            aria-label="CV opportunity"
            value={opportunityId}
            disabled={!opportunities.length}
            onChange={(event) => {
              setOpportunityId(event.target.value);
              setAiRunId(undefined);
              setAction({kind: 'idle'});
              setTailorGaps([]);
            }}
          >
            {!opportunities.length && <option value="">No persisted live opportunity</option>}
            {opportunities.map((item) => (
              <option value={item.id} key={item.id}>
                {item.company} — {item.title}
              </option>
            ))}
          </select>
        </label>
        {opportunity && (
          <p className="safe-note">
            {opportunity.eligibility.replaceAll('_', ' ')} · {opportunity.eligibilityReason}
          </p>
        )}
        <label>
          Professional title
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Summary
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
        </label>
        <button
          className="primary-control"
          onClick={tailor}
          disabled={action.kind === 'loading' || !opportunity || !sourceReady}
        >
          Generate source-linked OpenAI draft
        </button>
        <button onClick={save} disabled={action.kind === 'loading' || !opportunity || !sourceReady}>
          Save encrypted draft
        </button>
        <button onClick={() => window.print()} disabled={!sourceReady}>
          Print / Save PDF
        </button>
        {action.kind !== 'idle' && (
          <p role="status" className={action.kind === 'error' ? 'error' : 'approval-status'}>
            {action.message}
          </p>
        )}
        {tailorGaps.length > 0 && (
          <div className="integrity-note">
            <span>!</span>
            <div>
              <b>Gaps and warnings</b>
              <p>{tailorGaps.join(' · ')}</p>
            </div>
          </div>
        )}
        {profile.sourceHash ? (
          <p className="source-proof">
            <b>Approved source</b>
            <span>SHA-256 {profile.sourceHash.slice(0, 16)}…</span>
            <span>{profile.sourceVersionId}</span>
          </p>
        ) : (
          <p role="alert" className="error">
            No hash-linked {language.toUpperCase()} facts are available. Generation and saving are disabled.
          </p>
        )}
        <a href={`/api/cv-files/${language === 'en' ? 'english' : 'croatian'}`} target="_blank" rel="noreferrer">
          Open encrypted source {language === 'en' ? 'English' : 'Croatian'} PDF ↗
        </a>
        <p className="safe-note">
          Facts were manually transcribed from the hash-matched approved PDF. OpenAI is constrained to their IDs and
          fails closed when disconnected; automated checks do not prove semantic truth. Review every line before use.
          The app never submits an application.
        </p>
      </aside>
      <article className="cv-sheet" aria-label="Source-linked CV preview">
        <aside>
          <h3>{language === 'hr' ? 'KONTAKT' : 'CONTACT'}</h3>
          {profile.contacts.length ? (
            profile.contacts.flatMap((fact) => fact.statement.split(/\s*·\s*/)).map((line) => <p key={line}>{line}</p>)
          ) : (
            <p>{language === 'hr' ? 'Nema povezane kontaktne činjenice.' : 'No source-linked contact fact.'}</p>
          )}
          <h3>{language === 'hr' ? 'TEHNOLOGIJE' : 'CORE TECHNOLOGIES'}</h3>
          {skillDrafts.length ? (
            skillDrafts.map((draft) => <p key={draft.sourceFactId}>{draft.text}</p>)
          ) : (
            <p>{language === 'hr' ? 'Nema povezanih vještina.' : 'No source-linked skills.'}</p>
          )}
          <h3>{language === 'hr' ? 'OBRAZOVANJE' : 'EDUCATION'}</h3>
          {profile.education.length ? (
            profile.education.map((fact) => <p key={fact.id}>{fact.statement}</p>)
          ) : (
            <p>{language === 'hr' ? 'Nema povezanih činjenica o obrazovanju.' : 'No source-linked education facts.'}</p>
          )}
        </aside>
        <section className="cv-main">
          <header>
            <h1>{profile.name}</h1>
            <p>{title || (language === 'hr' ? 'Naslov nije povezan' : 'No source-linked headline')}</p>
          </header>
          <h2>{language === 'hr' ? 'SAŽETAK' : 'SUMMARY'}</h2>
          <p>{summary || (language === 'hr' ? 'Sažetak nije povezan s izvorom.' : 'No source-linked summary.')}</p>
          <h2>{language === 'hr' ? 'RADNO ISKUSTVO' : 'WORK EXPERIENCE'}</h2>
          {experienceDrafts.length ? (
            experienceDrafts.map((draft) => (
              <article className="cv-fact" key={draft.sourceFactId}>
                <p>{draft.text}</p>
                <small>{draft.locator}</small>
              </article>
            ))
          ) : (
            <p>{language === 'hr' ? 'Nema povezanih činjenica o iskustvu.' : 'No source-linked experience facts.'}</p>
          )}
        </section>
      </article>
    </div>
  );
}
