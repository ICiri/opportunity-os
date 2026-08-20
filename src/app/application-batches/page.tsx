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

export default async function ApplicationBatchesPage() {
  const [jobs, contacted, facts, overrides] = await Promise.all([
    loadPersistedHunterJobs(500),
    loadPreviouslyContactedCompanies(),
    loadVerifiedCareerFacts(LOCAL_USER_ID, 'EN'),
    loadRoleFitOverrides(LOCAL_USER_ID),
  ]);
  const candidates = reviewableRemoteJobs(jobs).map((job) => {
    const roleFit = analyzeRoleFit(job.description, facts);
    const target = assessFractionalTarget(job);
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
          <span className="kicker">Advertisement → message → CV</span>
          <h1>Application batches</h1>
          <p>Review Additional / Freelance and Full-time opportunities in separate batches of 20.</p>
        </div>
        <div className="planning-status">
          <span>Review candidates</span>
          <b>{candidates.length}</b>
          <small>
            {candidates.filter((candidate) => candidate.target.eligible && !candidate.previouslyContacted).length} pass
            current targeting
          </small>
        </div>
      </div>
      <ApplicationBatchPreview candidates={candidates} />
    </div>
  );
}
