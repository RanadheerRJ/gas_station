-- Run with: supabase test db
--
-- These migration-level tests are intentionally independent of a hosted
-- project. They confirm that the money/shift mutation surface is implemented
-- as PostgreSQL functions and that browser tables use row-level security.

begin;
select plan(8);

select has_table('public', 'shifts', 'shift records are stored relationally');
select has_table('public', 'shift_nozzles', 'open nozzle ownership is relational');
select has_table('public', 'customer_transactions', 'customer balance changes are auditable');
select has_function('public', 'open_shift', array['uuid', 'uuid[]', 'text'], 'open_shift RPC exists');
select has_function('public', 'close_shift', array['uuid', 'uuid', 'jsonb', 'jsonb', 'jsonb', 'text', 'jsonb'], 'close_shift RPC exists');
select has_function('public', 'record_customer_transaction', array['uuid', 'uuid', 'text', 'numeric', 'text', 'date'], 'balance RPC exists');
select has_index('public', 'shift_nozzles', 'shift_nozzles_one_open_shift', 'one active shift per nozzle is enforced');
select row_security_active('public', 'credit_customers', 'credit balances are protected by RLS');

select * from finish();
rollback;
