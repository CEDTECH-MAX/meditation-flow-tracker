INSERT INTO public.profiles (id, full_name, email, institution, job_title, is_active)
VALUES ('d59cac42-8975-43d7-a32b-fbd8e1887f0e', 'Platform Developer', 'rifumoced@gmail.com', 'MII', 'Software Developer', true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, is_active = true;

INSERT INTO public.user_roles (user_id, role)
VALUES ('d59cac42-8975-43d7-a32b-fbd8e1887f0e', 'developer')
ON CONFLICT (user_id, role) DO NOTHING;