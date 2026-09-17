-- ============================================================================
-- 0014 — unavailability periods that cannot double-book a car
--
-- Run after 0013. Idempotent (create or replace only; no data is touched).
--
-- The owner's request (2026-09-16): on the model page, mark a car
-- « indisponible du … au … » — typically a booking taken by phone — and have
-- the website stop offering those dates. The review of that feature
-- (2026-09-17) found four ways the existing block machinery could quietly
-- sell a car twice or lose a period. Each is closed here, in Postgres,
-- because availability truth lives in the database (CLAUDE.md rule 5).
--
--   1. free_units() subtracted a block on a unit it had never counted: a car
--      at the garage (status maintenance) with a « maintenance » period took a
--      SECOND, working car off the site.
--   2. mark_unit_ready() deleted every cleaning/transfer block that had not
--      ended yet — including one planned for next week — so « Marquer prête »
--      put a car back on sale for dates it would be in another city.
--      refresh_cleaning_blocks() had the mirror bug: a future cleaning period
--      counted as the live one, so a dirty car got no safety-net block.
--   3. A block was a plain INSERT. The trigger from 0004 only sees
--      reservations that already have a plate and are confirmed, so a block
--      could take the last car of a model while a website request (pending,
--      no plate yet) was counting on it. create_block() is the one door now:
--      it refuses, and names the booking, when the model could no longer honour
--      every booking over the period.
--   4. Deleting a block took no reason. delete_block() requires one and writes
--      it to the audit trail in the same transaction (rule 5).
--
-- The trigger from 0004 is left exactly as it is. The automatic cleaning
-- blocks written by complete_return() and refresh_cleaning_blocks() go through
-- it, and a capacity refusal there would abort a car's return.
-- ============================================================================

-- ---------------------------------------------------------------- 1. free units
-- Identical to 0008 except for ONE line, marked below.
create or replace function free_units(p_vehicle_id uuid, p_start timestamptz, p_end timestamptz)
returns int
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  win        tstzrange := booking_window(p_vehicle_id, p_start, p_end);
  total      int;
  taken_unit int;
  blocked    int;
  unassigned int;
  held       int;
begin
  if win is null then return 0; end if;

  select count(*) into total
    from units u
   where u.vehicle_id = p_vehicle_id and unit_is_bookable(u.status);

  if total = 0 then return 0; end if;

  -- Units occupied by a reservation that has been assigned a car. Not filtered
  -- on status: a booking pinned to a car that has since gone to the garage
  -- still needs A car, so it still consumes one.
  select count(distinct r.unit_id) into taken_unit
    from reservations r
   where r.vehicle_id = p_vehicle_id
     and r.unit_id is not null
     and reservation_occupies(r.status)
     and r.period && win;

  -- Units taken out of service for this window. Counted separately from the
  -- line above so a unit that is both blocked and reserved is not subtracted
  -- twice — hence the `not exists` guard.
  select count(distinct b.unit_id) into blocked
    from blocks b
    join units u on u.id = b.unit_id
   where u.vehicle_id = p_vehicle_id
     and unit_is_bookable(u.status)          -- 0014: `total` never counted the others
     and b.period && win
     and not exists (
       select 1 from reservations r
        where r.unit_id = b.unit_id and reservation_occupies(r.status) and r.period && win
     );

  -- Reservations still waiting for a unit. They consume a car at the model
  -- level even though no plate has been chosen yet.
  select count(*) into unassigned
    from reservations r
   where r.vehicle_id = p_vehicle_id
     and r.unit_id is null
     and reservation_occupies(r.status)
     and r.period && win;

  -- Live holds: not released, not expired.
  select count(*) into held
    from holds h
   where h.vehicle_id = p_vehicle_id
     and h.released_at is null
     and h.expires_at > now()
     and h.period && win;

  return greatest(total - taken_unit - blocked - unassigned - held, 0);
end $$;

-- ---------------------------------------------------------------- 2a. mark_unit_ready
-- Identical to 0012 except that only the block live NOW is closed.
create or replace function mark_unit_ready(p_unit uuid, p_reason text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  u        units%rowtype;
  v_closed int := 0;
  v_reason text := coalesce(nullif(btrim(p_reason), ''), 'véhicule prêt');
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;

  select * into u from units where id = p_unit for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if u.status = 'rented' then
    return jsonb_build_object('ok', false, 'error', 'UNIT_OUT');
  end if;

  perform set_reason(v_reason);

  insert into vehicle_events (unit_id, type, actor_id, mileage_km, fuel_pct, notes, reason)
  values (p_unit, 'CLEANING_COMPLETED', auth.uid(), u.mileage_km, u.fuel_pct, null, v_reason);

  update units set status = 'available', updated_at = now() where id = p_unit;

  -- The cleaning or transfer block that is running right now ends now. A
  -- period planned for later (« Transfert du 25 au 27 ») is a different fact
  -- and stays. Deleted rather than truncated: a zero-length range is not a
  -- fact anyone needs, and the audit trigger on `blocks` records the deletion
  -- with the reason.
  delete from blocks
   where unit_id = p_unit
     and kind in ('cleaning', 'transfer')
     and period @> now();                    -- 0014: was `upper(period) > now()`
  get diagnostics v_closed = row_count;

  return jsonb_build_object('ok', true, 'from', u.status, 'blocksClosed', v_closed);
end $$;

-- ---------------------------------------------------------------- 2b. refresh_cleaning_blocks
-- Identical to 0012 except that only a cleaning block live NOW counts as one.
-- If a later period starts inside the new window, the insert hits the
-- exclusion constraint and is skipped for that unit, exactly as before.
create or replace function refresh_cleaning_blocks()
returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_minutes int;
  n int := 0;
  u record;
begin
  select coalesce(cleaning_minutes, 120) into v_minutes from settings where id = 1;
  v_minutes := coalesce(v_minutes, 120);

  for u in
    select id from units
     where status = 'cleaning'
       and not exists (
         select 1 from blocks b
          where b.unit_id = units.id and b.kind = 'cleaning' and b.period @> now()   -- 0014
       )
  loop
    begin
      insert into blocks (unit_id, kind, period, reason)
      values (u.id, 'cleaning', tstzrange(now(), now() + make_interval(mins => v_minutes), '[)'),
              'nettoyage en cours');
      n := n + 1;
    exception when others then
      null;   -- a booking or another period already owns that window; leave it alone
    end;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- 3. create_block
-- The only way the admin takes a car out of availability. Every refusal is an
-- answer the operator can act on, never an exception:
--   FORBIDDEN        not owner/manager (the `blocks manage` policy, 0005)
--   REASON_REQUIRED  rule 5
--   BAD_DATES        end not after start
--   PAST             the period is already over
--   TOO_LONG         more than 366 days (a typo, not a plan)
--   NOT_FOUND        no such unit
--   BLOCK_OVERLAP    this car is already unavailable on part of the period
--   CONFLICT         a booking already holds THIS car on the period
--                    (any occupying status — a pending request included)
--   CAPACITY         blocking this car would leave the model unable to honour
--                    the bookings that have no car yet; names the first one
create or replace function create_block(
  p_unit   uuid,
  p_start  timestamptz,
  p_end    timestamptz,
  p_kind   block_kind default 'maintenance',
  p_reason text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  u         units%rowtype;
  v_range   tstzrange;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_total   int;
  v_taken   int;
  v_blocked int;
  v_waiting int;
  v_id      uuid;
  hit       record;
begin
  if not can_manage_pricing() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    return jsonb_build_object('ok', false, 'error', 'BAD_DATES');
  end if;
  if p_end <= now() then
    return jsonb_build_object('ok', false, 'error', 'PAST');
  end if;
  if p_end - p_start > interval '366 days' then
    return jsonb_build_object('ok', false, 'error', 'TOO_LONG');
  end if;

  select * into u from units where id = p_unit;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  -- create_reservation() locks the same vehicle row, so a website booking and
  -- a block on the same model are decided one after the other, never both
  -- against the same stale count.
  perform 1 from vehicles where id = u.vehicle_id for update;

  -- Blocks are stored as given (never widened); reservations.period is
  -- already widened by the prep buffer, so comparing the two directly is the
  -- same comparison the 0004 trigger makes.
  v_range := tstzrange(p_start, p_end, '[)');

  select b.kind, lower(b.period) as starts, upper(b.period) as ends
    into hit
    from blocks b
   where b.unit_id = p_unit and b.period && v_range
   order by lower(b.period)
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'BLOCK_OVERLAP',
      'kind', hit.kind, 'from', hit.starts, 'to', hit.ends);
  end if;

  select r.reference, r.status, r.start_at, r.end_at
    into hit
    from reservations r
   where r.unit_id = p_unit
     and reservation_occupies(r.status)
     and r.period && v_range
   order by lower(r.period)
   limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'CONFLICT',
      'reference', hit.reference, 'status', hit.status, 'from', hit.start_at, 'to', hit.end_at);
  end if;

  -- A car that is not bookable is already off the site; blocking it changes
  -- no count, so there is nothing to protect.
  if unit_is_bookable(u.status) then
    select count(*) into v_total
      from units x
     where x.vehicle_id = u.vehicle_id and unit_is_bookable(x.status);

    select count(distinct r.unit_id) into v_taken
      from reservations r
     where r.vehicle_id = u.vehicle_id
       and r.unit_id is not null
       and reservation_occupies(r.status)
       and r.period && v_range;

    select count(distinct b.unit_id) into v_blocked
      from blocks b
      join units x on x.id = b.unit_id
     where x.vehicle_id = u.vehicle_id
       and unit_is_bookable(x.status)
       and b.period && v_range
       and not exists (
         select 1 from reservations r
          where r.unit_id = b.unit_id and reservation_occupies(r.status) and r.period && v_range
       );

    select count(*) into v_waiting
      from reservations r
     where r.vehicle_id = u.vehicle_id
       and r.unit_id is null
       and reservation_occupies(r.status)
       and r.period && v_range;

    -- This unit is neither taken nor blocked (checked above), so it is one of
    -- the (total − taken − blocked) cars the waiting bookings rely on.
    if v_waiting > 0 and v_total - v_taken - v_blocked - 1 < v_waiting then
      select r.reference, r.status, r.source, r.start_at, r.end_at
        into hit
        from reservations r
       where r.vehicle_id = u.vehicle_id
         and r.unit_id is null
         and reservation_occupies(r.status)
         and r.period && v_range
       order by r.start_at
       limit 1;
      return jsonb_build_object('ok', false, 'error', 'CAPACITY',
        'reference', hit.reference, 'status', hit.status, 'source', hit.source,
        'from', hit.start_at, 'to', hit.end_at, 'waiting', v_waiting);
    end if;
  end if;

  perform set_reason(v_reason);

  insert into blocks (unit_id, kind, period, reason, created_by)
  values (p_unit, coalesce(p_kind, 'maintenance'), v_range, v_reason, auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'unitId', p_unit,
    'kind', coalesce(p_kind, 'maintenance'), 'startAt', p_start, 'endAt', p_end, 'reason', v_reason);
exception
  when exclusion_violation then
    -- A race the checks above could not see (or the 0004 trigger). Same answer.
    return jsonb_build_object('ok', false, 'error', 'CONFLICT');
end $$;

-- ---------------------------------------------------------------- 4. delete_block
-- Giving dates back to the site is as sensitive as cancelling a booking: it
-- takes a reason, recorded by audit_row() in the same transaction.
create or replace function delete_block(p_id uuid, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  b        blocks%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not can_manage_pricing() then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if v_reason is null then
    return jsonb_build_object('ok', false, 'error', 'REASON_REQUIRED');
  end if;

  select * into b from blocks where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  perform set_reason(v_reason);
  delete from blocks where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'unitId', b.unit_id);
end $$;

-- ---------------------------------------------------------------- grants
revoke all on function create_block(uuid, timestamptz, timestamptz, block_kind, text) from public;
revoke all on function delete_block(uuid, text) from public;

-- `authenticated` only; both re-check can_manage_pricing() inside, so a
-- signed-in agent gets FORBIDDEN rather than a write.
grant execute on function create_block(uuid, timestamptz, timestamptz, block_kind, text) to authenticated;
grant execute on function delete_block(uuid, text) to authenticated;
