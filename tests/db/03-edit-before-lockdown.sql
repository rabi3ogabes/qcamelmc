-- Runs between the additive migration and the lockdown: the OLD admin screen is
-- still live during the rollout, so an admin may change gateway settings in the
-- public settings table AFTER they were first copied. The lockdown must not lose that edit.
UPDATE public.settings
   SET sadad_secret = 'secret-edited-in-old-ui',
       webhook_url = 'https://n8n.example/webhook/edited',
       updated_at = now() + interval '1 minute';
