import {CVStudio} from '@/components/cv-studio';
import {loadPersistedHunterJobs} from '@/lib/hunter/persistence';
import {reviewableRemoteJobs, toOpportunityView} from '@/lib/opportunities/view-model';
import {loadVerifiedCareerFacts} from '@/lib/ai/repository';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export default async function CVStudioPage({
  searchParams,
}: {
  searchParams: Promise<{opportunity?: string; language?: string}>;
}) {
  const query = await searchParams;
  const [persistedJobs, englishFacts, croatianFacts] = await Promise.all([
    loadPersistedHunterJobs(500),
    loadVerifiedCareerFacts(LOCAL_USER_ID, 'EN'),
    loadVerifiedCareerFacts(LOCAL_USER_ID, 'HR'),
  ]);
  const selected = persistedJobs.find((job) => job.id === query.opportunity);
  const ordered = reviewableRemoteJobs(selected ? [selected, ...persistedJobs] : persistedJobs);
  const canonicalKeys = new Set<string>();
  const opportunities = ordered
    .filter((job) => {
      if (canonicalKeys.has(job.canonicalKey)) return false;
      canonicalKeys.add(job.canonicalKey);
      return true;
    })
    .map(toOpportunityView);

  return (
    <div className="page cv-page">
      <div className="topbar">
        <div>
          <span className="kicker">Encrypted English + Croatian source PDFs</span>
          <h1>CV Studio</h1>
          <p>
            Prepare a role-focused draft from a real persisted remote listing and hash-linked career facts. Every saved
            version remains a review-required draft.
          </p>
        </div>
      </div>
      <CVStudio
        initialOpportunity={query.opportunity}
        initialLanguage={query.language}
        opportunities={opportunities}
        facts={[...englishFacts, ...croatianFacts]}
      />
    </div>
  );
}
