-- Payments move from Billplz to CHIP (chip-in.asia), with automatic refunds through CHIP's refund API.
-- A refund is claimed (pending → processing) before CHIP is called, so two runs can never send it twice.

alter type payment_status add value if not exists 'processing';

-- Refund rows inserted by the booking functions (decline, cancel, no-show, expiry, rejected ID) go to CHIP.
alter table payments alter column gateway set default 'chip';

-- Manual fallback in the admin screen: also covers a refund stuck in 'processing'
-- (check the CHIP dashboard first: CHIP may already have sent it).
create or replace function public.admin_mark_refund_paid(p_id uuid, bank_ref text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update payments set status = 'paid',
    raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('bank_ref', bank_ref, 'paid_at', now(), 'paid_by', auth.uid())
  where id = p_id and type = 'refund' and status::text in ('pending', 'processing');
  if not found then raise exception 'Refund is not pending'; end if;
end $$;
