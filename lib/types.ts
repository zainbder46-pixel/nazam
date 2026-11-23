export type Role = "owner" | "editor" | "viewer";

export type Workspace = {
  id: string; name: string; icon: string; color: string;
  is_personal: boolean; kind: "life" | "work"; owner_id: string; created_at: string;
  role?: Role;
};

export type Profile = {
  id: string; email: string | null; full_name: string | null;
  city: string; quran_daily_goal: number; currency: string;
  save_fixed_pct?: number; save_var_pct?: number;
};

export type Member = { workspace_id: string; user_id: string; role: Role; profile?: Profile };

export type Invite = {
  id: string; workspace_id: string; email: string; role: Role;
  status: "pending" | "accepted" | "declined"; created_at: string;
  workspace?: Pick<Workspace, "name" | "icon">;
};

export type TaskList = { id: string; workspace_id: string; name: string; color: string; position: number };

export type Area = "life" | "work" | "faith" | "finance" | "study" | "health";
export type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export type Task = {
  id: string; workspace_id: string; list_id: string | null; parent_id: string | null;
  title: string; notes: string | null; status: "todo" | "doing" | "done";
  priority: number; area: Area; due_date: string | null; due_time: string | null;
  recurrence: Recurrence; assignee_id: string | null; position: number;
  completed_at: string | null; created_by: string | null; created_at: string;
  kind?: "task" | "meeting"; location?: string | null; end_time?: string | null; remind_before?: number | null;
};

export type Attendee = { task_id: string; user_id: string; workspace_id: string; response: "invited" | "yes" | "no" | "maybe" };
export type Message = {
  id: string; workspace_id: string; user_id: string; body: string; task_id: string | null;
  reply_to: string | null; mentions: string[]; edited_at: string | null; created_at: string;
};

export type BlockType = "p" | "h1" | "h2" | "h3" | "todo" | "bullet" | "number" | "quote" | "callout" | "divider";
export type Block = { id: string; type: BlockType; text: string; checked?: boolean };

export type Page = {
  id: string; workspace_id: string; parent_id: string | null; title: string; icon: string;
  content: Block[]; is_favorite: boolean; position: number; updated_at: string;
};

export type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type PrayerStatus = "jamaah" | "ontime" | "late" | "missed";
export type PrayerLog = { date: string; prayer: PrayerKey; status: PrayerStatus; sunnah: boolean };

export type Habit = { id: string; name: string; icon: string; category: string; target: number; active: boolean; position: number };
export type HabitLog = { habit_id: string; date: string; count: number };

export type Category = { id: string; name: string; type: "expense" | "income"; icon: string; color: string; monthly_budget: number | null; kind?: "normal" | "debt" };
export type Transaction = {
  id: string; date: string; amount: number; type: "expense" | "income" | "transfer"; category_id: string | null; note: string | null;
  account_id?: string | null; to_account_id?: string | null; created_at?: string;
  nature?: "custody" | null; income_id?: string | null;
};
export type Wallet = {
  id: string; workspace_id: string; name: string; icon: string; color: string; note: string | null;
  monthly_amount: number | null; monthly_day: number | null; archived: boolean; position: number;
  kind: "mine" | "custody" | "savings"; owner_name: string | null;
};
export type Income = {
  id: string; workspace_id: string; name: string; icon: string; amount: number; min_amount: number | null;
  day: number | null; variable: boolean; account_id: string | null; category_id: string | null; active: boolean; position: number;
};
export type AccountType = "bank" | "cash" | "card" | "savings" | "ewallet";
export type Account = {
  id: string; workspace_id: string; wallet_id: string; name: string; type: AccountType;
  opening_balance: number; is_default: boolean; position: number; balance?: number;
};
export type Obligation = {
  id: string; name: string; kind: "bill" | "installment" | "debt_owed" | "debt_lent";
  amount: number; total_amount: number | null; paid_amount: number; due_day: number | null;
  due_date: string | null; counterparty: string | null; active: boolean;
};
export type Goal = { id: string; name: string; icon: string; target: number; saved: number; deadline: string | null; monthly?: number | null; note?: string | null; priority?: number };
