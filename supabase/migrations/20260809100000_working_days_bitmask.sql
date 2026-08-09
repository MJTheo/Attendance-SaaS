-- Replace the "first N weekdays" working_days int (5/6/7, always
-- Monday-first) with a day-of-week bitmask, so an org can express an
-- arbitrary set of working days — e.g. Tue-Sat — not just "the first N days
-- starting Monday". Bit i = weekday i is a working day, Monday=0..Sunday=6,
-- matching Python's date.weekday() (see repositories/organizations.py,
-- which is the only place that converts between the mask and a plain list
-- of weekday indices — every caller above that works with the list).
--
-- The backfill preserves exact prior semantics: old value N meant "weekdays
-- 0..N-1 are working days", which is exactly the bitmask (1 << N) - 1.

alter table organizations add column working_days_mask smallint;

update organizations set working_days_mask = (1 << working_days) - 1;

alter table organizations
  alter column working_days_mask set not null,
  alter column working_days_mask set default 31, -- Mon-Fri (bits 0-4) — same default the old int column had (5)
  add constraint organizations_working_days_mask_range check (working_days_mask between 1 and 127);

alter table organizations drop column working_days;

alter table organizations rename column working_days_mask to working_days;
