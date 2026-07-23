// Hand-written types mirroring supabase/migrations/0001_init.sql.
// Regenerate/replace with `supabase gen types typescript` once the project
// is linked to a real Supabase instance — kept manual for now so the app
// compiles without network access to a live project.

export type UserRole = "system_admin" | "stage_admin" | "student";

export type PlayerStatus =
  | "pending"
  | "rejected"
  | "active"
  | "suspended"
  | "excluded"
  | "exposed";

export type RoundStatus =
  | "draft"
  | "scheduled"
  | "open"
  | "closed"
  | "calculating"
  | "calculated"
  | "published";

export type PublishMode = "manual" | "auto";

export type RevealStatus =
  | "pending"
  | "executed"
  | "wrong_guess"
  | "cancelled_wrong_answer"
  | "cancelled_target_exposed"
  | "cancelled_revealer_exposed"
  | "cancelled_admin";

export type LedgerType =
  | "correct_answer"
  | "reveal_gain"
  | "admin_adjustment"
  | "exposed_reset";

export type StageColors = {
  primary: string;
  secondary: string;
  background: string;
};

export type Stage = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  colors: StageColors;
  terminology: Record<string, string>;
  extra_field_defs: { key: string; label: string; required: boolean }[];
  registration_open: boolean;
  auto_approve: boolean;
  starting_balance: number;
  show_leaderboard: boolean;
  show_balances: boolean;
  enable_risk_indicator: boolean;
  enable_most_wanted: boolean;
  enable_badges: boolean;
  enable_streak: boolean;
  enable_sound_fx: boolean;
  default_reveal_attempts: number;
  allow_answer_edit: boolean;
  results_publish_mode: PublishMode;
  created_at: string;
};

export type Profile = {
  id: string;
  stage_id: string | null;
  role: UserRole;
  real_name: string | null;
  display_name: string | null;
  phone: string | null;
  username: string | null;
  emoji: string | null;
  auth_email: string;
  extra_fields: Record<string, unknown>;
  status: PlayerStatus;
  balance: number;
  exposed_by: string | null;
  exposed_round_id: string | null;
  approved_at: string | null;
  last_login_at: string | null;
  created_at: string;
};

export type Round = {
  id: string;
  stage_id: string;
  round_number: number;
  title: string;
  question: string;
  options: Record<string, string>;
  correct_option: string;
  points: number;
  reveal_attempts_allowed: number;
  reveal_enabled: boolean;
  opens_at: string | null;
  closes_at: string | null;
  publish_mode: PublishMode;
  results_published_at: string | null;
  open_message: string | null;
  closing_soon_message: string | null;
  post_submit_message: string;
  attachment_url: string | null;
  status: RoundStatus;
  calculated_at: string | null;
  created_at: string;
};

export type Submission = {
  id: string;
  round_id: string;
  student_id: string;
  selected_option: string;
  is_correct: boolean | null;
  points_awarded: number | null;
  submitted_at: string;
  edited_at: string | null;
};

export type RevealAttempt = {
  id: string;
  round_id: string;
  submission_id: string;
  revealer_id: string;
  target_id: string;
  guessed_real_name: string;
  is_correct: boolean | null;
  status: RevealStatus;
  cancel_reason: string | null;
  attempt_index: number;
  sequence_in_round: number | null;
  submitted_at: string;
  processed_at: string | null;
};

export type BalanceLedgerEntry = {
  id: string;
  stage_id: string;
  student_id: string;
  round_id: string | null;
  type: LedgerType;
  amount: number;
  balance_before: number;
  balance_after: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  stage_id: string;
  student_id: string | null;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type EventLogRow = {
  id: string;
  stage_id: string;
  round_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  visible_to_students: boolean;
  created_at: string;
};

export type PlayerCard = {
  id: string;
  display_name: string;
  emoji: string | null;
  balance: number;
  status: PlayerStatus;
  real_name: string | null;
  exposed_by: string | null;
  exposed_round_id: string | null;
};

type TableDef<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type Badge = {
  id: string;
  stage_id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
};

export interface Database {
  public: {
    Tables: {
      stages: TableDef<Stage>;
      profiles: TableDef<Profile>;
      rounds: TableDef<Round>;
      submissions: TableDef<Submission>;
      reveal_attempts: TableDef<RevealAttempt>;
      balance_ledger: TableDef<BalanceLedgerEntry>;
      notifications: TableDef<NotificationRow>;
      events_log: TableDef<EventLogRow>;
      badges: TableDef<Badge>;
    };
    Views: Record<string, never>;
    Functions: {
      get_login_email: { Args: { p_stage_slug: string; p_identifier: string }; Returns: string | null };
      get_stage_player_cards: { Args: { p_stage_id: string }; Returns: PlayerCard[] };
      get_stage_real_names: { Args: { p_stage_id: string }; Returns: string[] };
      submit_round: { Args: { p_round_id: string; p_selected_option: string; p_reveal_targets: unknown }; Returns: string };
      calculate_round: { Args: { p_round_id: string }; Returns: void };
      publish_round: { Args: { p_round_id: string }; Returns: void };
      undo_calculation: { Args: { p_round_id: string }; Returns: void };
      admin_adjust_balance: { Args: { p_student_id: string; p_amount: number; p_reason: string }; Returns: void };
      admin_expose_player: { Args: { p_student_id: string; p_reason: string }; Returns: void };
      delete_stage_completely: { Args: { p_stage_id: string }; Returns: void };
    };
    Enums: {
      user_role: UserRole;
      player_status: PlayerStatus;
      round_status: RoundStatus;
      publish_mode: PublishMode;
      reveal_status: RevealStatus;
      ledger_type: LedgerType;
    };
    CompositeTypes: Record<string, never>;
  };
}
