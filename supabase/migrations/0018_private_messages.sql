-- ============================================================================
-- Private messages between competitors: max 160 chars, sent by nickname,
-- sender can choose to appear anonymous to the recipient, recipient can
-- reply. Same privacy pattern as action_card_usages/reveal_attempts:
-- students get NO direct table access — everything goes through
-- SECURITY DEFINER functions that mask the sender's identity when the
-- message was sent anonymously. The admin always sees the real sender,
-- and gets a stage-level on/off toggle.
-- ============================================================================

alter table stages add column enable_messaging boolean not null default true;

create table messages (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 160),
  is_anonymous boolean not null default false,
  reply_to_id uuid references messages (id),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index messages_recipient_idx on messages (recipient_id, created_at);
create index messages_sender_idx on messages (sender_id, created_at);
create index messages_stage_idx on messages (stage_id, created_at);

alter table messages enable row level security;

-- No student select/insert policy at all — anonymity masking can only be
-- guaranteed by never letting a student query the raw sender_id column.
create policy messages_admin_all on messages
  for all using (is_system_admin() or is_stage_admin(stage_id))
  with check (is_system_admin() or is_stage_admin(stage_id));

-- ---------------------------------------------------------------------------
-- send_message: also handles replies — the reply's real recipient is taken
-- from the original message's sender_id server-side (never trusted from
-- the client), and only that original message's actual recipient is
-- allowed to reply to it.
-- ---------------------------------------------------------------------------
create or replace function send_message(
  p_stage_id uuid,
  p_recipient_id uuid,
  p_body text,
  p_anonymous boolean default false,
  p_reply_to_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sender profiles;
  v_recipient profiles;
  v_original messages;
  v_actual_recipient_id uuid;
  v_body text;
  v_new_id uuid;
begin
  select * into v_sender from profiles where id = auth.uid();
  if v_sender.id is null or v_sender.role <> 'student' or v_sender.status <> 'active' or v_sender.stage_id <> p_stage_id then
    raise exception 'not an active competitor in this stage';
  end if;

  if not (select enable_messaging from stages where id = p_stage_id) then
    raise exception 'messaging is disabled for this stage';
  end if;

  v_body := trim(p_body);
  if v_body = '' or char_length(v_body) > 160 then
    raise exception 'message must be between 1 and 160 characters';
  end if;

  if p_reply_to_id is not null then
    select * into v_original from messages where id = p_reply_to_id;
    if v_original.id is null or v_original.stage_id <> p_stage_id or v_original.recipient_id <> v_sender.id then
      raise exception 'cannot reply to this message';
    end if;
    v_actual_recipient_id := v_original.sender_id;
  else
    v_actual_recipient_id := p_recipient_id;
  end if;

  if v_actual_recipient_id = v_sender.id then
    raise exception 'cannot message yourself';
  end if;

  select * into v_recipient from profiles where id = v_actual_recipient_id;
  if v_recipient.id is null or v_recipient.role <> 'student' or v_recipient.status <> 'active' or v_recipient.stage_id <> p_stage_id then
    raise exception 'recipient is not an active competitor in this stage';
  end if;

  insert into messages (stage_id, sender_id, recipient_id, body, is_anonymous, reply_to_id)
  values (p_stage_id, v_sender.id, v_actual_recipient_id, v_body, coalesce(p_anonymous, false), p_reply_to_id)
  returning id into v_new_id;

  insert into notifications (stage_id, student_id, type, title, body, data)
  values (p_stage_id, v_actual_recipient_id, 'message_received', 'رسالة جديدة',
    case when p_anonymous then 'وصلتك رسالة من مجهول' else 'وصلتك رسالة من ' || v_sender.display_name end,
    jsonb_build_object('message_id', v_new_id));

  return v_new_id;
end;
$$;

grant execute on function send_message(uuid, uuid, text, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_inbox: masks sender identity for anonymous messages. Marks
-- fetched messages as read as a side effect (viewing the inbox is reading it).
-- ---------------------------------------------------------------------------
create or replace function get_my_inbox(p_stage_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_display_name text,
  sender_emoji text,
  is_anonymous boolean,
  body text,
  reply_to_id uuid,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  update messages m set read_at = now()
  where m.recipient_id = auth.uid() and m.stage_id = p_stage_id and m.read_at is null;

  return query
    select
      m.id,
      case when m.is_anonymous then null else m.sender_id end,
      case when m.is_anonymous then null else p.display_name end,
      case when m.is_anonymous then null else p.emoji end,
      m.is_anonymous,
      m.body,
      m.reply_to_id,
      m.read_at,
      m.created_at
    from messages m
    join profiles p on p.id = m.sender_id
    where m.recipient_id = auth.uid() and m.stage_id = p_stage_id
    order by m.created_at desc;
end;
$$;

grant execute on function get_my_inbox(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_sent_messages: sender always knows the recipient they picked, so
-- no masking here — is_anonymous is shown only as a fact about how it was
-- delivered to them.
-- ---------------------------------------------------------------------------
create or replace function get_my_sent_messages(p_stage_id uuid)
returns table (
  id uuid,
  recipient_id uuid,
  recipient_display_name text,
  recipient_emoji text,
  is_anonymous boolean,
  body text,
  reply_to_id uuid,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  return query
    select m.id, m.recipient_id, p.display_name, p.emoji, m.is_anonymous, m.body, m.reply_to_id, m.created_at
    from messages m
    join profiles p on p.id = m.recipient_id
    where m.sender_id = auth.uid() and m.stage_id = p_stage_id
    order by m.created_at desc;
end;
$$;

grant execute on function get_my_sent_messages(uuid) to authenticated;
