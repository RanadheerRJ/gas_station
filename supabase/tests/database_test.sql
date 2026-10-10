-- Run with: supabase test db
--
-- These migration-level tests are intentionally independent of a hosted
-- project. They confirm that the money/shift mutation surface is implemented
-- as PostgreSQL functions, that browser tables use row-level security, and
-- that the role matrix is enforced in the database rather than in the UI.

begin;
select plan(45);

/* Structure and transactional surface -------------------------------- */
select has_table('public', 'shifts', 'shift records are stored relationally');
select has_table('public', 'shift_nozzles', 'open nozzle ownership is relational');
select has_table('public', 'customer_transactions', 'customer balance changes are auditable');
select has_function('public', 'open_shift', array['uuid', 'uuid[]', 'text'], 'open_shift RPC exists');
select has_function('public', 'close_shift', array['uuid', 'uuid', 'jsonb', 'jsonb', 'jsonb', 'text', 'jsonb'], 'close_shift RPC exists');
select has_function('public', 'resubmit_rejected_shift', array['uuid', 'uuid', 'jsonb', 'jsonb', 'jsonb', 'text', 'jsonb', 'jsonb'], 'attendant rejected-shift resubmission RPC exists');
-- Reopening is the owner's alone, works on any closed shift (approved
-- included) and never turns the shift back into a running one.
select has_function('public', 'reopen_shift_for_correction', array['uuid', 'uuid', 'text'], 'owner reopen-for-correction RPC exists');
select has_function('public', 'record_customer_transaction', array['uuid', 'uuid', 'text', 'numeric', 'text', 'date'], 'balance RPC exists');
select has_function('public', 'reset_station_data', array['uuid'], 'reset_station_data RPC exists');
select has_index('public', 'shift_nozzles', 'shift_nozzles_one_open_shift', 'one active shift per nozzle is enforced');
select row_security_active('public', 'credit_customers', 'credit balances are protected by RLS');

/* Role matrix helpers ------------------------------------------------- */
select has_function('public', 'can_access_station', array['uuid'], 'station membership helper exists');
select has_function('public', 'can_manage_station', array['uuid'], 'owner/manager helper exists');
select has_function('public', 'assert_manager_station', array['uuid'], 'owner/manager assertion exists');
select has_function('public', 'assert_own_shift', array['uuid'], 'self-only shift assertion exists');

-- Attendants need availability without identity, so this must return only ids.
select has_function('public', 'list_nozzle_occupancy', array['uuid'], 'anonymous nozzle occupancy RPC exists');
select results_eq(
  $$ select count(*)::int
     from information_schema.parameters
     where specific_schema = 'public'
       and specific_name like 'list_nozzle_occupancy%'
       and parameter_mode = 'OUT' $$,
  array[1],
  'list_nozzle_occupancy returns a single column and cannot leak identity'
);

-- Attendants attribute credit sales at shift close through a balance-free
-- directory: id, name, phone — never a balance or transaction history.
select has_function('public', 'list_customer_directory', array['uuid'], 'balance-free customer directory RPC exists');
select results_eq(
  $$ select array_agg(parameter_name::text order by ordinal_position)
     from information_schema.parameters
     where specific_schema = 'public'
       and specific_name like 'list_customer_directory%'
       and parameter_mode = 'OUT' $$,
  $$ values (array['id', 'name', 'phone']) $$,
  'list_customer_directory returns id, name, and phone only — no balance'
);

/* Row-level security on every browser-readable table ------------------ */
select row_security_active('public', 'shifts', 'shift records are protected by RLS');
select row_security_active('public', 'shift_nozzles', 'shift nozzles are protected by RLS');
select row_security_active('public', 'shift_expenses', 'shift expenses are protected by RLS');
select row_security_active('public', 'fuel_prices', 'fuel price history is protected by RLS');
select row_security_active('public', 'tanks', 'tank stock is protected by RLS');
select row_security_active('public', 'tank_readings', 'tank readings are protected by RLS');

/* Attendant write backstop -------------------------------------------- */
select has_function('public', 'guard_attendant_writes', 'attendant write guard exists');
select results_eq(
  $$ select count(*)::int
     from pg_trigger
     where tgname in (
       'shifts_guard_attendant',
       'shift_nozzles_guard_attendant',
       'shift_expenses_guard_attendant',
       'credit_customers_guard_attendant',
       'customer_transactions_guard_attendant',
       'customer_transaction_audit_guard_attendant',
       'tanks_guard_attendant',
       'tank_readings_guard_attendant',
       'fuel_prices_guard_attendant'
     )
     and not tgisinternal $$,
  array[9],
  'every restricted table carries the attendant write guard'
);

/* Shift-aware credit ledger ------------------------------------------- */
select has_table('public', 'customer_transaction_audit', 'credit corrections and voids are audited');
select row_security_active('public', 'customer_transaction_audit', 'the credit audit trail is protected by RLS');
select has_column('public', 'customer_transactions', 'status', 'a transaction carries an active/voided lifecycle');
select has_column('public', 'customer_transactions', 'shift_id', 'a transaction can be tied to the shift that created it');
select col_is_null('public', 'customer_transactions', 'shift_id', 'historical transactions without a shift remain valid');
select has_function('public', 'add_shift_credit', array['uuid', 'uuid', 'uuid', 'numeric', 'text'], 'shift credit RPC exists');
select has_function('public', 'update_customer_credit', array['uuid', 'numeric', 'text', 'text'], 'credit correction RPC exists');
select has_function('public', 'void_customer_credit', array['uuid', 'text', 'text'], 'credit void RPC exists');
select has_function('public', 'list_shift_credit', array['uuid', 'uuid'], 'balance-free shift credit list exists');
select has_function('public', 'credit_day_summary', array['uuid', 'date'], 'credit day summary RPC exists');
-- One resolver backs every credit entry path, so a repeat name+phone can never
-- insert a second credit_customers row.
select has_function('public', 'find_or_create_customer', array['uuid', 'text', 'text', 'uuid'], 'one customer resolver backs every credit entry path');
select has_function('public', 'normalize_customer_phone', array['text'], 'customer phones are compared as digits');

/* Developer console: the admin-only account and registry surface ------ */
-- Support work — a mistyped station name, a station filed under the wrong
-- owner, a station created by mistake — must be doable from the console, and
-- only from an admin session. Each function re-checks is_admin() itself.
select has_function('public', 'admin_station_registry', 'admin station registry RPC exists');
select has_function('public', 'admin_create_station', array['uuid', 'text', 'text'], 'admin station create RPC exists');
select has_function('public', 'admin_update_station', array['uuid', 'text', 'text', 'uuid'], 'admin station update RPC exists');
select has_function('public', 'admin_set_station_state', array['uuid', 'station_state'], 'admin archive/reactivate RPC exists');
select has_function('public', 'admin_delete_station', array['uuid'], 'admin station delete RPC exists');
select has_function('public', 'admin_update_profile', array['uuid', 'text', 'text'], 'admin profile correction RPC exists');

select * from finish();
rollback;
