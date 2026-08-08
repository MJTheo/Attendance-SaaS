-- Backs the daily closeout job: a record that's still open (no clock_out)
-- once its day has fully ended gets flagged missed_clockout instead of
-- looking like an ongoing open shift forever. Corrected the normal way,
-- through `corrections`, once the staff member is back.

alter type attendance_status add value 'missed_clockout';
