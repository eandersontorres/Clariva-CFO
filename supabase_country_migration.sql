-- ─── COUNTRY AS A TENANT DIMENSION ──────────────────────────────────────────
--
-- Country is an ECOSYSTEM concern, not a CFO one: Kitchen, POS, Purchase and
-- Book all need to know which market a tenant operates in, and if each module
-- resolves it independently they drift (a BR tenant showing "$" in Kitchen and
-- "R$" in CFO). So it lives on r7_tenants, in the shared Supabase project, and
-- every module reads it from there.
--
-- Promoted to real columns rather than buried in the settings JSONB because
-- these are read on every page load by five apps, and because tax_regime is
-- about to drive report structure — it deserves a constraint, not a free string.
--
-- Safe on the live database: every column is nullable-with-default, and the
-- defaults reproduce today's hardcoded behaviour. Existing tenants become 'US'
-- and nothing changes for them.

ALTER TABLE r7_tenants ADD COLUMN IF NOT EXISTS country    TEXT NOT NULL DEFAULT 'US';
ALTER TABLE r7_tenants ADD COLUMN IF NOT EXISTS currency   TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE r7_tenants ADD COLUMN IF NOT EXISTS locale     TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE r7_tenants ADD COLUMN IF NOT EXISTS tax_regime TEXT;

-- ISO 3166-1 alpha-2. Constrained to what a country pack actually exists for —
-- widen this deliberately when adding src/lib/country/<xx>.js, so an unknown
-- code can't reach the frontend and silently fall back to US formatting.
ALTER TABLE r7_tenants DROP CONSTRAINT IF EXISTS r7_tenants_country_check;
ALTER TABLE r7_tenants ADD CONSTRAINT r7_tenants_country_check
  CHECK (country IN ('US', 'BR'));

-- ISO 4217.
ALTER TABLE r7_tenants DROP CONSTRAINT IF EXISTS r7_tenants_currency_check;
ALTER TABLE r7_tenants ADD CONSTRAINT r7_tenants_currency_check
  CHECK (currency IN ('USD', 'BRL'));

COMMENT ON COLUMN r7_tenants.country IS
  'ISO 3166-1 alpha-2. Selects the country pack (src/lib/country/) that drives formatting, statement parsing, chart-of-accounts reporting lines, payment rails, and which screens are shown.';
COMMENT ON COLUMN r7_tenants.tax_regime IS
  'US: filing basis (Schedule C). BR: Simples Nacional | Lucro Presumido | Lucro Real | MEI. Drives report structure, not just labels.';

-- ─── Timezone backfill ───────────────────────────────────────────────────────
-- settings.timezone already exists and is read by the Square sync jobs. Give it
-- an explicit value wherever it was relying on the America/Chicago fallback, so
-- the default can eventually be removed from the code.
UPDATE r7_tenants
   SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('timezone', 'America/Chicago')
 WHERE country = 'US'
   AND (settings->>'timezone') IS NULL;

-- ─── Pilot: the Brazilian lanchonete ─────────────────────────────────────────
-- Fill in the tenant id, confirm the regime with the accountant, then run.
--
-- UPDATE r7_tenants
--    SET country    = 'BR',
--        currency   = 'BRL',
--        locale     = 'pt-BR',
--        tax_regime = 'Simples Nacional',
--        settings   = COALESCE(settings, '{}'::jsonb) || '{"timezone":"America/Sao_Paulo"}'::jsonb
--  WHERE id = '<tenant_uuid_da_lanchonete>';

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- SELECT id, name, country, currency, locale, tax_regime, settings->>'timezone' AS tz
--   FROM r7_tenants ORDER BY name;
