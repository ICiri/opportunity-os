import {ApplicationBatchPreview} from '@/components/application-batch-preview';
import {loadVerifiedCareerFacts} from '@/lib/ai/repository';
import {applicationMessagePreview, OUTREACH_PRINCIPLES} from '@/lib/applications/outreach-policy';
import {applicationKey, assessFractionalTarget} from '@/lib/applications/targeting';
import {loadPreviouslyContactedCompanies} from '@/lib/applications/repository';
import {analyzeRoleFit} from '@/lib/cv-agent/role-fit';
import {loadRoleFitOverrides} from '@/lib/cv-agent/repository';
import {loadPersistedHunterJobs} from '@/lib/hunter/persistence';
import {reviewableRemoteJobs} from '@/lib/opportunities/view-model';

export const dynamic = 'force-dynamic';
const LOCAL_USER_ID = process.env.OPPORTUNITY_LOCAL_USER_ID ?? '20000000-0000-4000-8000-000000000001';

export default async function AdditionalJobsPage() {
  const [jobs, contacted, facts, overrides] = await Promise.all([
    loadPersistedHunterJobs(500),
    loadPreviouslyContactedCompanies(),
    loadVerifiedCareerFacts(LOCAL_USER_ID, 'EN'),
    loadRoleFitOverrides(LOCAL_USER_ID),
  ]);
  const candidates = reviewableRemoteJobs(jobs)
    .map((job) => ({job, target: assessFractionalTarget(job)}))
    .filter(({target}) => target.track === 'ADDITIONAL_FREELANCE')
    .map(({job, target}) => {
      const roleFit = analyzeRoleFit(job.description, facts);
      return {
        id: job.id,
        company: job.company,
        title: job.title,
        location: job.location,
        url: job.url,
        applicationKey: applicationKey(job),
        messagePreview: applicationMessagePreview(job.company, job.title, target.track),
        principles: OUTREACH_PRINCIPLES.map(({id, source}) => ({id, source})),
        target,
        roleFit,
        roleFitOverridden: overrides.some(
          (item) => item.jobPostingId === job.id && item.analysisHash === roleFit.analysisHash,
        ),
        previouslyContacted: contacted.has(job.company.trim().toLowerCase().replaceAll(' ', '-')),
      };
    });

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="kicker">Dedicated daily queue</span>
          <h1>Additional / Freelance jobs</h1>
          <p>All current remote contract opportunities in one place, with advertisement, message and CV preview.</p>
        </div>
        <div className="planning-status">
          <span>Current candidates</span>
          <b>{candidates.length}</b>
          <small>Refreshed from the latest persisted hunter run</small>
        </div>
      </div>
      <ApplicationBatchPreview candidates={candidates} initialTrack="ADDITIONAL_FREELANCE" singleTrack />
    </div>
  );
}
