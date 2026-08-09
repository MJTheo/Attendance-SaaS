-- New enum value only — Postgres won't let a value be used in the same
-- transaction it's added in, so this is split into its own migration file,
-- same pattern as 20260808130000_missed_clockout_status.sql.

alter type user_role add value 'super_admin';
