-- ============================================================================
-- Seed the six named action cards as global templates (action_card_templates).
-- These are the system-wide bank entries every stage admin can instantiate
-- into their own stage_action_cards row (price/stock/limits are per-stage,
-- configured later from the admin UI — not seeded here).
-- ============================================================================

insert into action_card_templates (code, effect_key, name, description, icon, default_config, rarity)
values
  (
    'shadow_shield', 'shadow_shield', 'درع الظل',
    'يحمي حاملها من أي محاولة كشف هوية ضده خلال هذه الجولة، دون أن يعلم أحد أن المحاولة حُجبت.',
    '🛡️', '{}', 'rare'
  ),
  (
    'double_vision', 'double_vision', 'الرؤية المزدوجة',
    'يمنح محاولة كشف هوية إضافية في هذه الجولة، ولا تُفعَّل إلا إذا كانت إجابة السؤال صحيحة.',
    '👁️', '{}', 'rare'
  ),
  (
    'double_points', 'double_points', 'مضاعفة النقاط',
    'يضاعف نقاط السؤال في هذه الجولة، ويمكن للمشرف توسيعها لتضاعف مكسب الكشف أيضًا.',
    '✨', '{"scope": "question_only"}', 'epic'
  ),
  (
    'reveal_freeze', 'reveal_freeze', 'تجميد الكشف',
    'يمنع لاعبًا مستهدفًا من تنفيذ أي محاولة كشف هوية في الجولة القادمة.',
    '❄️', '{}', 'epic'
  ),
  (
    'temp_exclusion', 'temp_exclusion', 'الإقصاء المؤقت',
    'يقصي لاعبًا مستهدفًا بالكامل عن المشاركة في الجولة القادمة (لا إجابة ولا كشف).',
    '⛔', '{}', 'epic'
  ),
  (
    'protected_copy', 'protected_copy', 'النسخة المحمية',
    'حماية كاملة من كشف الهوية ومن انتقال الرصيد خلال هذه الجولة — أندر وأغلى من درع الظل.',
    '💎', '{}', 'legendary'
  )
on conflict (code) do nothing;
