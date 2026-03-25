UPDATE auth.users 
SET raw_user_meta_data = 
    COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"role": "super_admin"}'::jsonb
WHERE id = 'fdcd94ce-fcfd-451b-bf04-a6f1ce4597ce';