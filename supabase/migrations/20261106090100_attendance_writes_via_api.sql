-- Part 2 of 2 for shift times. Apply only AFTER the backend that writes
-- clock-ins/outs with the service-role client is deployed: until then the
-- backend still writes them with the caller's own client, which this
-- migration stops being allowed to.
--
-- With shifts, a record's status decides late/early, so it has to be the
-- API's computation, not whatever a client sends. Until now staff could
-- insert their own attendance rows (any clock_in time, any status) and
-- update their open one straight through PostgREST. Clock-in/out now go
-- only through the backend, which computes the status and writes with the
-- service-role client using the caller's verified identity. Reads are
-- unchanged: RLS still scopes every SELECT to the caller's org.
drop policy "staff can clock in for themselves" on attendance_records;
drop policy "staff can clock out their own open record" on attendance_records;
revoke insert, update on attendance_records from authenticated;
