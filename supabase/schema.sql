-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor) to create tables and RLS.

-- Topics: one per user search
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  created_at timestamptz not null default now()
);

-- Threads: main post + replies for a topic
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  main_post text not null,
  replies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Follow-up Q&A within a thread
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_question text not null,
  ai_answer text not null,
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists topics_user_id_idx on public.topics(user_id);
create index if not exists topics_created_at_idx on public.topics(created_at desc);
create index if not exists threads_topic_id_idx on public.threads(topic_id);
create index if not exists follow_ups_thread_id_idx on public.follow_ups(thread_id);

-- User interests (tags for Home feed)
create table if not exists public.user_interests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tags text[] not null default '{}'
);

-- Stored Home tweet suggestions (persisted, sent to AI as "already covered")
create table if not exists public.user_home_suggestions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suggestions text[] not null default '{}'
);

-- RLS: users can only access their own data
alter table public.topics enable row level security;
alter table public.threads enable row level security;
alter table public.follow_ups enable row level security;
alter table public.user_interests enable row level security;
alter table public.user_home_suggestions enable row level security;

-- User interests: own row only (select + insert/update for upsert)
create policy "Users can view own interests"
  on public.user_interests for select
  using (auth.uid() = user_id);
create policy "Users can insert own interests"
  on public.user_interests for insert
  with check (auth.uid() = user_id);
create policy "Users can update own interests"
  on public.user_interests for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- User home suggestions: own row only (for server-side use; service role in functions)
create policy "Users can view own home suggestions"
  on public.user_home_suggestions for select
  using (auth.uid() = user_id);
create policy "Users can insert own home suggestions"
  on public.user_home_suggestions for insert
  with check (auth.uid() = user_id);
create policy "Users can update own home suggestions"
  on public.user_home_suggestions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Topics: CRUD for own rows
create policy "Users can manage own topics"
  on public.topics for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Threads: select/insert for threads whose topic belongs to user
create policy "Users can view threads of own topics"
  on public.threads for select
  using (
    exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid())
  );
create policy "Users can insert threads for own topics"
  on public.threads for insert
  with check (
    exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid())
  );

-- Follow-ups: select/insert for threads owned by user
create policy "Users can view follow_ups of own threads"
  on public.follow_ups for select
  using (
    exists (
      select 1 from public.threads th
      join public.topics t on t.id = th.topic_id
      where th.id = thread_id and t.user_id = auth.uid()
    )
  );
create policy "Users can insert follow_ups for own threads"
  on public.follow_ups for insert
  with check (
    exists (
      select 1 from public.threads th
      join public.topics t on t.id = th.topic_id
      where th.id = thread_id and t.user_id = auth.uid()
    )
  );
