-- keting.eu.org 留言板表（Supabase SQL 编辑器运行一次即可）
-- 与 functions/api/messages.js 配套：GET 走 anon select，POST 走 anon insert

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  nickname text not null default '匿名访客',
  content text not null,
  tool text,
  created_at timestamptz not null default now()
);

-- 开启 RLS：未开启时 anon 角色无法访问
alter table public.messages enable row level security;

-- 匿名可读（留言板公开）
drop policy if exists "messages anon read" on public.messages;
create policy "messages anon read"
  on public.messages for select
  to anon
  using (true);

-- 匿名可写（限长由 Functions 侧清洗校验；这里再兜一层长度约束）
drop policy if exists "messages anon insert" on public.messages;
create policy "messages anon insert"
  on public.messages for insert
  to anon
  with check (char_length(content) between 2 and 300 and char_length(nickname) <= 20);

-- 只允许通过 Functions（service 侧）删除，anon 不开放 delete/update
-- 索引：按时间倒序查最近 N 条
create index if not exists messages_created_at_idx on public.messages (created_at desc);
