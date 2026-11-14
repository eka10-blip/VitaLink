-- Run this once in the Supabase SQL Editor.
-- Adds a source label for vitals without changing existing columns/data.
-- Existing rows stay NULL (treated as "source not recorded", NOT camera-estimated).

alter table public.vitals
add column if not exists measurement_source text;

alter table public.vitals
drop constraint if exists vitals_measurement_source_check;

alter table public.vitals
add constraint vitals_measurement_source_check
check (
  measurement_source is null
  or measurement_source in ('manual', 'camera_estimated')
);

comment on column public.vitals.measurement_source is
  'manual = entered for testing/demo; camera_estimated = from camera pipeline. Not clinically validated.';
