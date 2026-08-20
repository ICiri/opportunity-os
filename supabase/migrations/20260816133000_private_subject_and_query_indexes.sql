-- Gmail subjects already exist in authenticated private ciphertext for every imported message.
-- Remove the redundant plaintext copy before a future browser/Supabase client is enabled.
update public.email_threads set subject=null where subject is not null;

alter table public.email_threads
  add constraint email_threads_subject_private_check check (subject is null);

create index if not exists email_messages_user_thread_sent_idx
  on public.email_messages(user_id,thread_id,sent_at,id);

create index if not exists job_postings_user_company_availability_idx
  on public.job_postings(user_id,company_id,availability_status);

comment on column public.email_threads.subject is
  'Must remain NULL. Subjects are encrypted in private.gmail_message_payloads and decrypted server-side.';
