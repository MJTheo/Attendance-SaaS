-- Every "what day is it" calculation (closeout job, streak, calendar,
-- once-per-day clock-in cap) has so far assumed UTC midnight == the org's
-- local midnight, which is wrong for any org outside UTC. This column is
-- the source of truth for that going forward — an IANA zone name (e.g.
-- "Asia/Manila"), validated app-side via Python's zoneinfo (not here: a
-- CHECK constraint can't validate against pg_timezone_names, since CHECK
-- expressions can't reference other tables/views).

alter table organizations add column timezone text not null default 'UTC';
