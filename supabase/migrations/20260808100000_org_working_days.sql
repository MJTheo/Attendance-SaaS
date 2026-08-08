-- Lets each org declare how many days a week it operates (Mon-first, so 5 =
-- Mon-Fri, 6 = Mon-Sat, 7 = Mon-Sun). Analytics/streak logic use this instead
-- of assuming a Mon-Fri schedule for everyone.

alter table organizations
  add column working_days smallint not null default 5
  constraint organizations_working_days_range check (working_days between 5 and 7);
