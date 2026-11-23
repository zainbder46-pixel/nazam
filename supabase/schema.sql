-- =====================================================================
--  نظام — قاعدة البيانات الكاملة
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1) الملفات الشخصية
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  city text not null default 'jeddah',
  quran_daily_goal int not null default 4,
  currency text not null default 'ر.س',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) المساحات والأعضاء والدعوات
-- ---------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default '📁',
  color text not null default '#0f766e',
  is_personal boolean not null default false,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner','editor','viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('editor','viewer')),
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now()
);
create index if not exists invites_email_idx on public.workspace_invites (lower(email));

-- دوال مساعدة للصلاحيات (security definer لتجنب التكرار في RLS)
create or replace function public.is_member(ws uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

create or replace function public.can_edit(ws uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role in ('owner','editor'));
$$;

create or replace function public.is_owner(ws uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.shares_workspace(other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from workspace_members a join workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------------------------------------------------------------------
-- 3) المهام والقوائم
-- ---------------------------------------------------------------------
create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#0f766e',
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  list_id uuid references public.task_lists(id) on delete set null,
  parent_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  priority int not null default 0 check (priority between 0 and 3),
  area text not null default 'life' check (area in ('life','work','faith','finance','study','health')),
  due_date date,
  due_time time,
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekdays','weekly','monthly','yearly')),
  assignee_id uuid references auth.users(id) on delete set null,
  position double precision not null default 0,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists tasks_ws_idx on public.tasks (workspace_id, status);
create index if not exists tasks_due_idx on public.tasks (due_date);

-- ---------------------------------------------------------------------
-- 4) الصفحات (مثل نوشن)
-- ---------------------------------------------------------------------
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  parent_id uuid references public.pages(id) on delete cascade,
  title text not null default 'صفحة بدون عنوان',
  icon text not null default '📄',
  content jsonb not null default '[]'::jsonb,
  is_favorite boolean not null default false,
  position double precision not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pages_ws_idx on public.pages (workspace_id, parent_id);

-- ---------------------------------------------------------------------
-- 5) العبادات (خاصة بكل مستخدم)
-- ---------------------------------------------------------------------
create table if not exists public.prayer_logs (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  prayer text not null check (prayer in ('fajr','dhuhr','asr','maghrib','isha')),
  status text not null check (status in ('jamaah','ontime','late','missed')),
  sunnah boolean not null default false,
  primary key (user_id, date, prayer)
);

create table if not exists public.quran_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null default current_date,
  pages int not null check (pages > 0),
  kind text not null default 'read' check (kind in ('read','memorize','review')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  icon text not null default '✨',
  category text not null default 'faith' check (category in ('faith','life','health','work')),
  target int not null default 1,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  count int not null default 1,
  primary key (habit_id, date)
);

create table if not exists public.fasting_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  kind text not null default 'nafl' check (kind in ('nafl','qada','ramadan','kaffarah')),
  note text,
  unique (user_id, date)
);

create table if not exists public.sadaqah_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null default current_date,
  amount numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6) المالية (خاصة بكل مستخدم)
-- ---------------------------------------------------------------------
create table if not exists public.fin_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  type text not null check (type in ('expense','income')),
  icon text not null default '💳',
  color text not null default '#0f766e',
  monthly_budget numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null default current_date,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('expense','income')),
  category_id uuid references public.fin_categories(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists tx_user_date_idx on public.transactions (user_id, date);

create table if not exists public.obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  kind text not null check (kind in ('bill','installment','debt_owed','debt_lent')),
  amount numeric(12,2) not null default 0,       -- قيمة القسط/الفاتورة الشهرية
  total_amount numeric(12,2),                   -- إجمالي الدين/القرض
  paid_amount numeric(12,2) not null default 0, -- المسدد حتى الآن
  due_day int check (due_day between 1 and 31), -- يوم الاستحقاق الشهري
  due_date date,                                -- أو تاريخ محدد
  counterparty text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  icon text not null default '🎯',
  target numeric(12,2) not null check (target > 0),
  saved numeric(12,2) not null default 0,
  deadline date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7) تفعيل RLS والسياسات
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.pages enable row level security;
alter table public.prayer_logs enable row level security;
alter table public.quran_logs enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.fasting_logs enable row level security;
alter table public.sadaqah_logs enable row level security;
alter table public.fin_categories enable row level security;
alter table public.transactions enable row level security;
alter table public.obligations enable row level security;
alter table public.savings_goals enable row level security;

-- profiles
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select
  using (id = auth.uid() or public.shares_workspace(id));
drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles for update using (id = auth.uid());

-- workspaces
drop policy if exists "ws read" on public.workspaces;
create policy "ws read" on public.workspaces for select
  using (public.is_member(id) or owner_id = auth.uid()
         or exists (select 1 from workspace_invites i where i.workspace_id = workspaces.id and lower(i.email) = lower(auth.jwt()->>'email') and i.status = 'pending'));
drop policy if exists "ws insert" on public.workspaces;
create policy "ws insert" on public.workspaces for insert with check (owner_id = auth.uid());
drop policy if exists "ws update" on public.workspaces;
create policy "ws update" on public.workspaces for update using (public.is_owner(id));
drop policy if exists "ws delete" on public.workspaces;
create policy "ws delete" on public.workspaces for delete using (public.is_owner(id) and not is_personal);

-- members
drop policy if exists "members read" on public.workspace_members;
create policy "members read" on public.workspace_members for select using (public.is_member(workspace_id));
drop policy if exists "members manage" on public.workspace_members;
create policy "members manage" on public.workspace_members for update
  using (public.is_owner(workspace_id) and role <> 'owner') with check (role in ('editor','viewer'));
drop policy if exists "members delete" on public.workspace_members;
create policy "members delete" on public.workspace_members for delete
  using ((public.is_owner(workspace_id) and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

-- invites
drop policy if exists "invites read" on public.workspace_invites;
create policy "invites read" on public.workspace_invites for select
  using (public.is_member(workspace_id) or lower(email) = lower(auth.jwt()->>'email'));
drop policy if exists "invites insert" on public.workspace_invites;
create policy "invites insert" on public.workspace_invites for insert with check (public.is_owner(workspace_id));
drop policy if exists "invites delete" on public.workspace_invites;
create policy "invites delete" on public.workspace_invites for delete using (public.is_owner(workspace_id));
drop policy if exists "invites update" on public.workspace_invites;
create policy "invites update" on public.workspace_invites for update
  using (lower(email) = lower(auth.jwt()->>'email'));

-- task_lists / tasks / pages  (حسب عضوية المساحة)
drop policy if exists "lists read" on public.task_lists;
create policy "lists read" on public.task_lists for select using (public.is_member(workspace_id));
drop policy if exists "lists write" on public.task_lists;
create policy "lists write" on public.task_lists for all using (public.can_edit(workspace_id)) with check (public.can_edit(workspace_id));

drop policy if exists "tasks read" on public.tasks;
create policy "tasks read" on public.tasks for select using (public.is_member(workspace_id));
drop policy if exists "tasks write" on public.tasks;
create policy "tasks write" on public.tasks for all using (public.can_edit(workspace_id)) with check (public.can_edit(workspace_id));

drop policy if exists "pages read" on public.pages;
create policy "pages read" on public.pages for select using (public.is_member(workspace_id));
drop policy if exists "pages write" on public.pages;
create policy "pages write" on public.pages for all using (public.can_edit(workspace_id)) with check (public.can_edit(workspace_id));

-- الجداول الخاصة: المالك فقط
do $$
declare t text;
begin
  foreach t in array array['prayer_logs','quran_logs','habits','habit_logs','fasting_logs','sadaqah_logs',
                           'fin_categories','transactions','obligations','savings_goals']
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8) إضافة المالك كعضو تلقائيًا عند إنشاء مساحة
-- ---------------------------------------------------------------------
create or replace function public.handle_new_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into workspace_members (workspace_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- ---------------------------------------------------------------------
-- 9) تجهيز المستخدم الجديد: ملف + مساحة شخصية + بيانات افتراضية
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));

  insert into workspaces (name, icon, is_personal, owner_id)
  values ('مساحتي', '🏠', true, new.id) returning id into ws;

  insert into task_lists (workspace_id, name, color, position) values
    (ws, 'الحياة', '#0f766e', 0), (ws, 'العمل', '#2563eb', 1), (ws, 'الدراسة', '#7c3aed', 2);

  insert into pages (workspace_id, title, icon, created_by, content) values
    (ws, 'ابدأ من هنا', '👋', new.id,
     '[{"id":"b1","type":"h1","text":"أهلًا بك في نظامك"},
       {"id":"b2","type":"p","text":"اكتب / في بداية أي سطر لتغيير نوعه: عنوان، قائمة، مهمة، اقتباس."},
       {"id":"b3","type":"todo","text":"جرّب إضافة مهمة من زر + أو اضغط N","checked":false},
       {"id":"b4","type":"todo","text":"سجّل صلاتك اليوم من قسم العبادات","checked":false},
       {"id":"b5","type":"todo","text":"أنشئ مساحة مشتركة وادعُ زميلك","checked":false}]'::jsonb);

  insert into habits (user_id, name, icon, category, position) values
    (new.id, 'أذكار الصباح', '🌅', 'faith', 0),
    (new.id, 'أذكار المساء', '🌇', 'faith', 1),
    (new.id, 'صلاة الضحى', '☀️', 'faith', 2),
    (new.id, 'الوتر', '🌙', 'faith', 3),
    (new.id, 'رياضة', '🏃', 'health', 4),
    (new.id, 'قراءة', '📚', 'life', 5);

  insert into fin_categories (user_id, name, type, icon, color) values
    (new.id, 'أكل ومطاعم', 'expense', '🍽️', '#ea580c'),
    (new.id, 'مواصلات', 'expense', '🚗', '#2563eb'),
    (new.id, 'سكن وفواتير', 'expense', '🏠', '#7c3aed'),
    (new.id, 'تسوق', 'expense', '🛍️', '#db2777'),
    (new.id, 'صحة', 'expense', '💊', '#dc2626'),
    (new.id, 'ترفيه', 'expense', '🎮', '#0891b2'),
    (new.id, 'أخرى', 'expense', '📦', '#64748b'),
    (new.id, 'راتب', 'income', '💼', '#16a34a'),
    (new.id, 'دخل إضافي', 'income', '💰', '#0f766e');

  -- إذا كان له دعوات سابقة تبقى معلقة حتى يقبلها من داخل التطبيق
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 10) قبول/رفض الدعوة
-- ---------------------------------------------------------------------
create or replace function public.respond_invite(invite uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare inv workspace_invites;
begin
  select * into inv from workspace_invites
   where id = invite and lower(email) = lower(auth.jwt()->>'email') and status = 'pending';
  if not found then raise exception 'الدعوة غير موجودة'; end if;

  if accept then
    insert into workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, auth.uid(), inv.role) on conflict do nothing;
    update workspace_invites set status = 'accepted' where id = invite;
  else
    update workspace_invites set status = 'declined' where id = invite;
  end if;
end $$;

-- تحديث وقت تعديل الصفحة
create or replace function public.touch_page()
returns trigger language plpgsql as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
drop trigger if exists pages_touch on public.pages;
create trigger pages_touch before update on public.pages for each row execute function public.touch_page();

-- ---------------------------------------------------------------------
-- 11) التحديث اللحظي للمساحات المشتركة
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.pages;
exception when others then null; end $$;
