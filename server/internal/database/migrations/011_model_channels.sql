-- No legacy binding import and no deletion of test or wallet data.
ALTER TABLE public_models DROP COLUMN endpoint_id;
ALTER TABLE public_models ADD COLUMN capabilities JSONB NOT NULL DEFAULT '{"referenceImages":true,"aspectRatios":["1:1","3:4","4:3","9:16","16:9"],"resolutions":["1K","2K","4K"]}'::jsonb;
ALTER TABLE operation_settings DROP COLUMN models_migrated;
CREATE TABLE public_model_channels (
 id TEXT PRIMARY KEY,
 public_model_id TEXT NOT NULL REFERENCES public_models(id) ON DELETE CASCADE,
 endpoint_id TEXT NOT NULL REFERENCES ai_endpoints(id) ON DELETE RESTRICT,
 upstream_model_id TEXT NOT NULL CHECK(length(trim(upstream_model_id)) BETWEEN 1 AND 200),
 enabled BOOLEAN NOT NULL DEFAULT true,
 is_active BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(public_model_id,endpoint_id),
 CHECK(NOT is_active OR enabled)
);
CREATE UNIQUE INDEX public_model_channels_active ON public_model_channels(public_model_id) WHERE is_active;
CREATE INDEX public_model_channels_endpoint ON public_model_channels(endpoint_id);
-- These aliases are configuration protocol names, not a compatibility execution path.
UPDATE ai_endpoints SET capabilities=capabilities-'async' WHERE purpose='image';
UPDATE ai_endpoints SET protocol=CASE protocol WHEN 'openai_image' THEN 'openai_images' WHEN 'gemini_generate_content' THEN 'gemini_native' ELSE protocol END;
-- Existing models become drafts. Administrators explicitly configure their new bindings.
UPDATE public_models SET enabled=false,is_default=false,version=version+1;

CREATE FUNCTION validate_model_channel() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(79140001);
 IF NEW.is_active AND NOT EXISTS(SELECT 1 FROM ai_endpoints WHERE id=NEW.endpoint_id AND enabled AND purpose='image') THEN
  RAISE EXCEPTION 'active channel requires an enabled image endpoint';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_model_channel BEFORE INSERT OR UPDATE ON public_model_channels FOR EACH ROW EXECUTE FUNCTION validate_model_channel();
CREATE FUNCTION protect_active_endpoint() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(79140001);
 IF (NOT NEW.enabled OR NEW.purpose<>'image') AND EXISTS(SELECT 1 FROM public_model_channels WHERE endpoint_id=NEW.id AND is_active) THEN
  RAISE EXCEPTION 'switch or clear active model channels before disabling endpoint';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_active_endpoint BEFORE UPDATE ON ai_endpoints FOR EACH ROW EXECUTE FUNCTION protect_active_endpoint();
