insert into public.sources(
  name,country,base_url,type,priority,enabled,adapter_name,capabilities,
  terms_checked,robots_checked,health_score,registry_status,coverage_regions,
  freshness_sla_hours,verified_at,last_http_status,terms_url,status_note
) values
  ('Greenhouse · Mesh','MULTI','https://boards-api.greenhouse.io/v1/boards/mesh/jobs?content=true','ATS','S',true,'greenhouse',
    '{"jobs":true,"full_content":true,"incremental":false}'::jsonb,false,false,0,'DISCONNECTED',array['EU'],24,null,null,
    'https://developers.greenhouse.io/job-board.html','Configured official endpoint. A network run must succeed before LIVE is recorded.'),
  ('Greenhouse · Sporty Group','MULTI','https://boards-api.greenhouse.io/v1/boards/sportygroup/jobs?content=true','ATS','A',true,'greenhouse',
    '{"jobs":true,"full_content":true,"incremental":false}'::jsonb,false,false,0,'DISCONNECTED',array['EU'],24,null,null,
    'https://developers.greenhouse.io/job-board.html','Configured official endpoint. A network run must succeed before LIVE is recorded.'),
  ('Greenhouse · Janea Systems','MULTI','https://boards-api.greenhouse.io/v1/boards/janeasystems/jobs?content=true','ATS','A',true,'greenhouse',
    '{"jobs":true,"full_content":true,"incremental":false}'::jsonb,false,false,0,'DISCONNECTED',array['EU','US'],24,null,null,
    'https://developers.greenhouse.io/job-board.html','Configured official endpoint. A network run must succeed before LIVE is recorded.'),
  ('Lever · Fliff','MULTI','https://api.lever.co/v0/postings/Fliff?mode=json','ATS','A',true,'lever',
    '{"jobs":true,"full_content":true,"incremental":false}'::jsonb,false,false,0,'DISCONNECTED',array['EU','US'],24,null,null,
    'https://github.com/lever/postings-api','Configured official endpoint. A network run must succeed before LIVE is recorded.'),
  ('Lever · Yuno','MULTI','https://api.lever.co/v0/postings/yuno?mode=json','ATS','A',true,'lever',
    '{"jobs":true,"full_content":true,"incremental":false}'::jsonb,false,false,0,'DISCONNECTED',array['EU','UK','US'],24,null,null,
    'https://github.com/lever/postings-api','Configured official endpoint. A network run must succeed before LIVE is recorded.'),
  ('EURES','EU_EEA','https://eures.europa.eu/index_en','SEARCH','S',false,null,
    '{"jobs":true,"adapter_ready":false}'::jsonb,false,false,0,'RESEARCH',array['EU','NO','IS'],24,null,null,
    'https://eures.europa.eu/','Official portal is real; automated access is not enabled until an approved interface is verified.'),
  ('USAJOBS','US','https://developer.usajobs.gov/','API','B',false,null,
    '{"jobs":true,"requires_api_key":true}'::jsonb,false,false,0,'DISCONNECTED',array['US'],24,null,null,
    'https://developer.usajobs.gov/TermsOfUse','Requires a separate API key and job-specific work-authorization review.'),
  ('Job Bank Canada','CA','https://www.jobbank.gc.ca/home','SEARCH','B',false,null,
    '{"jobs":true,"feed_access_required":true}'::jsonb,false,false,0,'DISCONNECTED',array['CA'],24,null,null,
    'https://www.jobbank.gc.ca/termsofuseseeker','Feed access is not connected; eligibility outside Canada must remain unknown.'),
  ('Workforce Australia','AU','https://www.workforceaustralia.gov.au/','SEARCH','B',false,null,
    '{"jobs":true,"adapter_ready":false}'::jsonb,false,false,0,'RESEARCH',array['AU'],24,null,null,
    null,'Registered for research; no automated adapter or coverage claim.'),
  ('jobs.govt.nz','NZ','https://jobs.govt.nz/','SEARCH','C',false,null,
    '{"jobs":true,"government_only":true,"adapter_ready":false}'::jsonb,false,false,0,'RESEARCH',array['NZ'],24,null,null,
    null,'Government-role source only; no automated adapter or coverage claim.')
on conflict(name,country) do update set
  base_url=excluded.base_url,type=excluded.type,priority=excluded.priority,
  enabled=excluded.enabled,adapter_name=excluded.adapter_name,capabilities=excluded.capabilities,
  terms_checked=excluded.terms_checked,robots_checked=excluded.robots_checked,
  health_score=excluded.health_score,registry_status=excluded.registry_status,
  coverage_regions=excluded.coverage_regions,freshness_sla_hours=excluded.freshness_sla_hours,
  verified_at=excluded.verified_at,last_http_status=excluded.last_http_status,
  terms_url=excluded.terms_url,status_note=excluded.status_note;
insert into public.principles(id,title,domain,description) values
('VOSS_CALIBRATED_QUESTION','Calibrated question','CONVERSATION','Use an open, low-pressure question to uncover legitimate constraints.'),
('CIALDINI_AUTHORITY_TRUE','Truthful authority','CONVERSATION','Use only relevant, verifiable evidence of capability.'),
('GETTING_TO_YES_INTERESTS','Interests before positions','NEGOTIATION','Address underlying constraints and mutual value rather than fixed positions.'),
('CARNEGIE_GENUINE_INTEREST','Genuine interest','RELATIONSHIP','Keep the counterpart context and interests central.'),
('MADE_TO_STICK_CONCRETE','Concrete and concise','COMMUNICATION','Prefer one memorable, concrete proof point over an inventory of claims.'),
('FEW_AT_A_GLANCE','At-a-glance monitoring','DESIGN','Make exceptions, decisions and comparisons visible without decorative clutter.'),
('NORMAN_ERROR_PREVENTION','Error prevention','DESIGN','Use constraints and feedback to prevent high-cost mistakes.'),
('CAIRO_TRUTHFUL_SCALE','Truthful visualization','DESIGN','Do not distort comparisons through scales, aggregation or framing.')
on conflict(id) do update set title=excluded.title,description=excluded.description;
insert into public.principles(id,title,domain,description) values
('FOUNDING_SALES_STAGE_DISCIPLINE','Stage discipline','SALES','Measure prospecting, qualification, proposal and closing as separate stages.'),
('MOM_TEST_BEHAVIOR_EVIDENCE','Behavioral evidence','DISCOVERY','Prefer concrete past behavior and commitment over compliments or hypothetical intent.'),
('OBVIOUSLY_AWESOME_POSITIONING','Best-fit positioning','POSITIONING','Connect differentiated capability to the segment that values it most and its real alternative.'),
('LEAN_ANALYTICS_OMTM','One metric that matters','ANALYTICS','Prioritize one phase-appropriate metric and retain safety guardrails.'),
('TRUSTED_ADVISOR_CLIENT_FIRST','Client-first trust','RELATIONSHIP','Earn trust through credibility, reliability, context depth and low self-orientation.'),
('CUSTOMER_SUCCESS_OUTCOME','Client outcome continuity','RETENTION','Track desired outcome, value milestones and risks before renewal.'),
('PREDICTABLE_REVENUE_SEGMENT','Separated pipeline stages','SALES','Keep account discovery, qualification and closing stages analytically distinct.')
on conflict(id) do update set title=excluded.title,description=excluded.description;
