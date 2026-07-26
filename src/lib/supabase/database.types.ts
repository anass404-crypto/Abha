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
  | "cancelled_admin"
  | "cancelled_card_effect";

export type LedgerType =
  | "correct_answer"
  | "reveal_gain"
  | "admin_adjustment"
  | "exposed_reset"
  | "card_purchase"
  | "card_refund";

export type CardEffectKey =
  | "shadow_shield"
  | "double_vision"
  | "double_points"
  | "reveal_freeze"
  | "temp_exclusion"
  | "protected_copy";

export type CardUsageTiming = "before_round" | "during_open" | "after_answer_before_close" | "next_round";

export type CardAcquireSource = "purchase" | "auto_grant" | "admin_grant" | "seasonal_reward" | "admin_compensation";

export type PlayerCardStatus = "available" | "reserved" | "used" | "expired" | "cancelled";

export type CardUsageStatus =
  | "reserved"
  | "applied"
  | "failed"
  | "cancelled"
  | "pending_admin_approval"
  | "rejected";

export type CardInventoryChangeType =
  | "initial_stock"
  | "stock_increase"
  | "stock_decrease"
  | "purchase"
  | "admin_grant"
  | "admin_revoke"
  | "usage_cancel_return"
  | "expiry_release"
  | "rule_grant";

export type RuleConditionType =
  | "most_targeted_unexposed"
  | "consecutive_participation"
  | "consecutive_correct_answers"
  | "first_successful_reveal"
  | "largest_balance_transfer"
  | "survivor_rounds"
  | "balance_threshold"
  | "leaderboard_rank";

export type RuleScope = "per_round" | "end_of_competition";

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
  show_reveal_log: boolean;
  enable_action_cards: boolean;
  enable_messaging: boolean;
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
  voided_by_exclusion: boolean;
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
  execution_eligible: boolean | null;
  blocking_effect_id: string | null;
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
  card_usage_id: string | null;
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

export type RevealLogEntry = {
  round_id: string;
  round_number: number;
  revealer_id: string;
  revealer_display_name: string;
  revealer_emoji: string | null;
  target_id: string;
  target_display_name: string;
  target_emoji: string | null;
  target_real_name: string | null;
  outcome: "exposed" | "incomplete";
  sequence_in_round: number | null;
  processed_at: string | null;
};

export type RoundParticipationStatus = {
  excluded: boolean;
  reveal_frozen: boolean;
};

export type CardRarity = "common" | "rare" | "epic" | "legendary";

export type CardShopEntry = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  image_url: string | null;
  rarity: CardRarity;
  effect_key: CardEffectKey | null;
  price_points: number;
  remaining_copies: number;
  sold_out: boolean;
  usage_timing: CardUsageTiming;
  requires_target: boolean;
  max_per_student: number | null;
  is_purchasable: boolean;
  is_undiscovered: boolean;
};

export type MyActionCard = {
  id: string;
  card_name: string;
  card_icon: string | null;
  card_description: string | null;
  rarity: CardRarity;
  effect_key: CardEffectKey;
  requires_target: boolean;
  status: PlayerCardStatus;
  acquired_source: CardAcquireSource;
  acquired_at: string;
  expires_at: string | null;
  reserved_round_id: string | null;
  used_round_id: string | null;
};

export type ActionCardTemplate = {
  id: string;
  code: string;
  effect_key: CardEffectKey;
  name: string;
  description: string;
  icon: string | null;
  image_url: string | null;
  default_config: Record<string, unknown>;
  rarity: CardRarity;
  is_globally_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StageActionCard = {
  id: string;
  stage_id: string;
  template_id: string;
  effect_key: CardEffectKey;
  name: string;
  description: string;
  icon: string | null;
  image_url: string | null;
  rarity: CardRarity;
  price_points: number;
  total_copies: number;
  remaining_copies: number;
  sold_count: number;
  granted_count: number;
  used_count: number;
  expired_count: number;
  cancelled_count: number;
  is_active: boolean;
  is_purchasable: boolean;
  is_auto_grantable: boolean;
  is_manual_grantable: boolean;
  max_per_student: number | null;
  validity_hours: number | null;
  usage_timing: CardUsageTiming;
  requires_target: boolean;
  requires_admin_approval: boolean;
  stackable_with_other_cards: boolean;
  conflict_priority: number;
  allows_student_cancel: boolean;
  reveal_effect_source_to_target: boolean;
  effect_config: Record<string, unknown>;
  discovery_hidden_until_first_reveal: boolean;
  discovered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlayerActionCard = {
  id: string;
  stage_id: string;
  student_id: string;
  stage_action_card_id: string;
  status: PlayerCardStatus;
  acquired_source: CardAcquireSource;
  acquired_at: string;
  expires_at: string | null;
  reserved_round_id: string | null;
  used_round_id: string | null;
  used_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  admin_note: string | null;
  created_at: string;
};

export type ActionCardPurchase = {
  id: string;
  stage_id: string;
  student_id: string;
  stage_action_card_id: string;
  player_action_card_id: string;
  price_paid: number;
  balance_before: number;
  balance_after: number;
  purchased_at: string;
};

export type ActionCardUsage = {
  id: string;
  stage_id: string;
  player_action_card_id: string;
  stage_action_card_id: string;
  student_id: string;
  target_student_id: string | null;
  round_id: string;
  effective_round_id: string;
  status: CardUsageStatus;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
};

export type ActionCardEffect = {
  id: string;
  stage_id: string;
  round_id: string;
  usage_id: string;
  stage_action_card_id: string;
  effect_key: CardEffectKey;
  student_id: string;
  target_student_id: string | null;
  outcome: "applied" | "no_effect" | "blocked_by_conflict" | "superseded";
  detail: Record<string, unknown>;
  priority_used: number;
  created_at: string;
};

export type RevealAttemptStatusHistory = {
  id: string;
  reveal_attempt_id: string;
  from_status: RevealStatus | null;
  to_status: RevealStatus;
  changed_at: string;
  changed_by: string | null;
  internal_reason: string | null;
  card_effect_id: string | null;
};

export type CardInventoryTransaction = {
  id: string;
  stage_id: string;
  stage_action_card_id: string;
  change_type: CardInventoryChangeType;
  delta: number;
  remaining_before: number;
  remaining_after: number;
  related_purchase_id: string | null;
  related_player_action_card_id: string | null;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
};

export type ActionCardRule = {
  id: string;
  stage_id: string;
  code: string;
  name: string;
  description: string | null;
  condition_type: RuleConditionType;
  condition_config: Record<string, unknown>;
  target_value: number | null;
  repeatable: boolean;
  scope: RuleScope;
  max_grants: number | null;
  priority: number;
  requires_admin_approval: boolean;
  status: "active" | "disabled";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ActionCardRuleReward = {
  id: string;
  rule_id: string;
  stage_action_card_id: string;
  quantity: number;
  validity_hours_override: number | null;
  reserved_for_next_round: boolean;
};

export type ActionCardRuleGrant = {
  id: string;
  stage_id: string;
  rule_id: string;
  student_id: string;
  round_id: string | null;
  evaluation_key: string;
  approved: boolean;
  player_action_card_id: string | null;
  triggered_at: string;
};

export type MessageRow = {
  id: string;
  stage_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  is_anonymous: boolean;
  reply_to_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type InboxMessage = {
  id: string;
  sender_id: string | null;
  sender_display_name: string | null;
  sender_emoji: string | null;
  is_anonymous: boolean;
  body: string;
  reply_to_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type SentMessage = {
  id: string;
  recipient_id: string;
  recipient_display_name: string;
  recipient_emoji: string | null;
  is_anonymous: boolean;
  body: string;
  reply_to_id: string | null;
  created_at: string;
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
      action_card_templates: TableDef<ActionCardTemplate>;
      stage_action_cards: TableDef<StageActionCard>;
      player_action_cards: TableDef<PlayerActionCard>;
      action_card_purchases: TableDef<ActionCardPurchase>;
      action_card_usages: TableDef<ActionCardUsage>;
      action_card_effects: TableDef<ActionCardEffect>;
      reveal_attempt_status_history: TableDef<RevealAttemptStatusHistory>;
      card_inventory_transactions: TableDef<CardInventoryTransaction>;
      action_card_rules: TableDef<ActionCardRule>;
      action_card_rule_rewards: TableDef<ActionCardRuleReward>;
      action_card_rule_grants: TableDef<ActionCardRuleGrant>;
      messages: TableDef<MessageRow>;
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
      get_stage_reveal_log: {
        Args: {
          p_stage_id: string;
          p_round_id?: string | null;
          p_revealer_id?: string | null;
          p_target_id?: string | null;
          p_outcome?: string | null;
        };
        Returns: RevealLogEntry[];
      };
      get_round_participation_status: { Args: { p_round_id: string }; Returns: RoundParticipationStatus[] };
      get_stage_card_shop: { Args: { p_stage_id: string }; Returns: CardShopEntry[] };
      get_my_action_cards: { Args: { p_stage_id: string }; Returns: MyActionCard[] };
      purchase_action_card: { Args: { p_stage_action_card_id: string }; Returns: string };
      use_action_card: {
        Args: { p_player_action_card_id: string; p_round_id: string; p_target_student_id?: string | null };
        Returns: string;
      };
      cancel_action_card_usage: { Args: { p_usage_id: string }; Returns: void };
      admin_grant_action_card: {
        Args: {
          p_student_id: string;
          p_stage_action_card_id: string;
          p_quantity: number;
          p_reason: string;
          p_expires_at?: string | null;
          p_reserved_round_id?: string | null;
        };
        Returns: void;
      };
      admin_revoke_action_card: { Args: { p_player_action_card_id: string; p_reason: string }; Returns: void };
      admin_cancel_card_usage: { Args: { p_usage_id: string; p_reason: string }; Returns: void };
      admin_cancel_reveal_attempt: { Args: { p_attempt_id: string; p_reason: string }; Returns: void };
      admin_adjust_card_stock: {
        Args: { p_stage_action_card_id: string; p_delta: number; p_reason: string };
        Returns: void;
      };
      evaluate_action_card_rules: { Args: { p_round_id: string }; Returns: void };
      evaluate_end_of_competition_rules: { Args: { p_stage_id: string }; Returns: void };
      approve_rule_grant: { Args: { p_grant_id: string }; Returns: void };
      send_message: {
        Args: {
          p_stage_id: string;
          p_recipient_id: string | null;
          p_body: string;
          p_anonymous?: boolean;
          p_reply_to_id?: string | null;
        };
        Returns: string;
      };
      get_my_inbox: { Args: { p_stage_id: string }; Returns: InboxMessage[] };
      get_my_sent_messages: { Args: { p_stage_id: string }; Returns: SentMessage[] };
    };
    Enums: {
      user_role: UserRole;
      player_status: PlayerStatus;
      round_status: RoundStatus;
      publish_mode: PublishMode;
      reveal_status: RevealStatus;
      ledger_type: LedgerType;
      card_effect_key: CardEffectKey;
      card_usage_timing: CardUsageTiming;
      card_acquire_source: CardAcquireSource;
      player_card_status: PlayerCardStatus;
      card_usage_status: CardUsageStatus;
      card_inventory_change_type: CardInventoryChangeType;
      rule_condition_type: RuleConditionType;
      rule_scope: RuleScope;
    };
    CompositeTypes: Record<string, never>;
  };
}
