CREATE TYPE public.student_gender AS ENUM ('male','female');
CREATE TYPE public.student_classification AS ENUM ('meditator','rising_siddha','siddha');

ALTER TABLE public.profiles
  ADD COLUMN gender public.student_gender,
  ADD COLUMN classification public.student_classification;