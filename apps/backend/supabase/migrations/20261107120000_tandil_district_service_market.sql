-- Tandil legal district + link to service market (multi-city municipality gate).
-- Without this row, coords inside Tandil pickup still yield municipality_status=waitlisted
-- because matchDistrict only knows Córdoba launch-cluster districts.

INSERT INTO "districts" (name, province, status, terms_and_conditions, privacy_policy)
SELECT
  'Tandil',
  'Buenos Aires',
  'active',
  $terms$
<h2>Términos y Condiciones — Tandil</h2>
<p>Al operar como conductor en Tandil, aceptás cumplir con las normativas municipales de transporte, mantener tu vehículo en condiciones óptimas, y respetar las tarifas establecidas por la plataforma Lifty. El incumplimiento de estas condiciones puede resultar en la suspensión de tu cuenta.</p>
$terms$,
  $privacy$
<h2>Política de Privacidad — Tandil</h2>
<p>Lifty trata tus datos de conductor conforme a la legislación argentina vigente y a la política general de la plataforma. Los datos de domicilio y documentación se usan solo para habilitación operativa y cumplimiento local.</p>
$privacy$
WHERE NOT EXISTS (
  SELECT 1 FROM "districts" WHERE name = 'Tandil' AND province = 'Buenos Aires'
);

UPDATE "districts"
SET
  status = 'active',
  terms_and_conditions = COALESCE(
    NULLIF(BTRIM(terms_and_conditions), ''),
    $terms$
<h2>Términos y Condiciones — Tandil</h2>
<p>Al operar como conductor en Tandil, aceptás cumplir con las normativas municipales de transporte, mantener tu vehículo en condiciones óptimas, y respetar las tarifas establecidas por la plataforma Lifty. El incumplimiento de estas condiciones puede resultar en la suspensión de tu cuenta.</p>
$terms$
  ),
  privacy_policy = COALESCE(
    NULLIF(BTRIM(privacy_policy), ''),
    $privacy$
<h2>Política de Privacidad — Tandil</h2>
<p>Lifty trata tus datos de conductor conforme a la legislación argentina vigente y a la política general de la plataforma. Los datos de domicilio y documentación se usan solo para habilitación operativa y cumplimiento local.</p>
$privacy$
  )
WHERE name = 'Tandil' AND province = 'Buenos Aires';

-- Link market → district only when unset (admin SoT).
UPDATE "service_markets" m
SET default_district_id = d.id
FROM "districts" d
WHERE m.slug = 'tandil'
  AND m.default_district_id IS NULL
  AND d.name = 'Tandil'
  AND d.province = 'Buenos Aires';
