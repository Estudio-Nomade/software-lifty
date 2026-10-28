-- Launch cluster districts: San Pedro + Villa Sarmiento (Córdoba).
-- Draft jurisdictional annex pattern from 0045_villa_dolores_legal_terms.sql.
-- Hubs (reference only; geofence = later PR):
--   San Pedro: -31.936553, -65.2189268
--   Villa Sarmiento: -31.9358863, -65.1915949
-- Choice: fill terms when NULL or still draft AVISO family only.
-- Does not clobber finalized legal text; does not touch Villa Dolores.

-- 1) San Pedro row if missing
INSERT INTO "districts" (name, province, status)
SELECT 'San Pedro', 'Córdoba', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM "districts" WHERE name = 'San Pedro' AND province = 'Córdoba'
);

-- 2) Villa Sarmiento if missing (normally seeded in 0007; some DBs only have VD)
INSERT INTO "districts" (name, province, status)
SELECT 'Villa Sarmiento', 'Córdoba', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM "districts" WHERE name = 'Villa Sarmiento' AND province = 'Córdoba'
);

UPDATE "districts"
SET status = 'active'
WHERE name = 'Villa Sarmiento' AND province = 'Córdoba';

-- 3a) Terms + privacy — San Pedro
UPDATE "districts"
SET
  terms_and_conditions = $terms_sp$
AVISO: resumen del Anexo jurisdiccional San Pedro (borrador). La numeración y el texto completo de la ordenanza municipal deben verificarse con el Municipio/Concejo Deliberante antes de publicarse como versión definitiva. Localidad del cluster launch Traslasierra / lindante a Villa Dolores.

1. Ámbito
Se aplica a viajes urbanos en la localidad de San Pedro, Provincia de Córdoba (cluster launch Traslasierra, lindante al servicio con Villa Dolores), y a la habilitación de conductores/vehículos para operar allí mediante Lifty.

2. Autoridad
Según información pública, la autoridad de aplicación es la Dirección de Transporte u organismo municipal competente de San Pedro, con participación de Seguridad Ciudadana y Tránsito cuando corresponda. Lifty y los conductores deben cooperar con requerimientos legítimos de fiscalización.

3. Registro municipal
Existe o puede exigirse un Registro Municipal de Propietarios, Vehículos y Choferes. Conductor y vehículo deben estar inscriptos cuando la norma lo exija y mantener la inscripción vigente. Lifty puede condicionar la asignación de viajes a esa acreditación.

4. Solicitud solo por app
Los viajes deben solicitarse mediante la aplicación. El viaje debe poder acreditarse mostrando la app activa con información de conductor, pasajero y destino.

5. Prohibiciones
Queda prohibido levantar pasajeros sin registro previo en la plataforma; captar en paradas de taxis; captar en paradas de colectivos; o cualquier captación informal prohibida por la ordenanza. El incumplimiento es falta grave frente a Lifty (suspensión/baja) sin perjuicio de sanciones municipales.

6. Conductor (requisitos de alto nivel)
Según información pública: certificado de antecedentes; inscripción en registros fiscales y laborales; licencia profesional (categoría exacta a confirmar con texto oficial). Documentación auténtica y vigente.

7. Vehículo (requisitos de alto nivel)
Según información pública: antigüedad, inspección técnica periódica, seguro exigido e identificación con sticker oficial según norma local. Detalle exacto pendiente de texto oficial. Lifty no asigna viajes si no se acreditan requisitos vigentes.

8. Tarifas y pagos
El precio lo determina la plataforma. El usuario debe poder conocer/calcular el costo anticipadamente. Medios de pago electrónicos; efectivo solo de forma excepcional si la norma y Lifty lo habilitan. Prohibido cobrar sumas no informadas por la app.

9. Seguros
El conductor/propietario mantiene los seguros exigidos por la legislación y la norma municipal. Lifty puede bloquear si la cobertura obligatoria está vencida o no acreditada. No se fijan aquí compañías ni montos.

10. Sanciones
La ordenanza contempla multas, inhabilitaciones y, en su caso, secuestro del vehículo. Faltas graves mencionadas públicamente incluyen levantar sin app, adulterar documentación y agredir inspectores. Lifty no sustituye el régimen municipal: puede suspender la cuenta además de lo que resuelva la autoridad.

11. Rol de Lifty en San Pedro
Operar conforme a la norma vigente una vez verificado el texto oficial; no asignar viajes a no habilitados; facilitar la acreditación del viaje en app; informar tarifas; ofrecer pagos electrónicos; gestionar reclamos; conservar registros según ley. No sustituye el poder de policía municipal.

12. Prevalencia
Si este resumen difiere del texto oficial de la ordenanza o su reglamentación, prevalece la norma oficial.
$terms_sp$,
  privacy_policy = $privacy_sp$
AVISO: borrador breve. La Política de Privacidad completa de Lifty es un documento separado y debe validarse legalmente antes de publicarse.

Lifty trata datos personales conforme a la Ley 25.326. En el marco del servicio en San Pedro (Córdoba, cluster launch Traslasierra / lindante a Villa Dolores) pueden tratarse, entre otros: identidad y contacto; datos de cuenta; ubicación/GPS e historial de viajes; datos del vehículo y del conductor; información de pago; datos técnicos del dispositivo; datos de seguridad y prevención de fraude.

Finalidades principales: prestar el servicio de movilidad, asignar y registrar viajes, cobros, seguridad, reclamos, prevención de fraude y cumplimiento de obligaciones legales y municipales.

Podés ejercer derechos de acceso, rectificación, actualización y supresión en los términos de la ley, a través de los canales que indique la Política de Privacidad definitiva.

La geolocalización es necesaria para la prestación del servicio. El detalle de bases de legitimación, encargados, plazos de conservación y transferencias se publicará en la Política completa.
$privacy_sp$
WHERE name = 'San Pedro'
  AND province = 'Córdoba'
  AND (
    terms_and_conditions IS NULL
    OR terms_and_conditions LIKE 'AVISO:%'
  );

-- 3b) Terms + privacy — Villa Sarmiento
UPDATE "districts"
SET
  terms_and_conditions = $terms_vs$
AVISO: resumen del Anexo jurisdiccional Villa Sarmiento (borrador). La numeración y el texto completo de la ordenanza municipal deben verificarse con el Municipio/Concejo Deliberante antes de publicarse como versión definitiva. Localidad del cluster launch Traslasierra / lindante a Villa Dolores.

1. Ámbito
Se aplica a viajes urbanos en la localidad de Villa Sarmiento, Provincia de Córdoba (cluster launch Traslasierra, lindante al servicio con Villa Dolores), y a la habilitación de conductores/vehículos para operar allí mediante Lifty.

2. Autoridad
Según información pública, la autoridad de aplicación es la Dirección de Transporte u organismo municipal competente de Villa Sarmiento, con participación de Seguridad Ciudadana y Tránsito cuando corresponda. Lifty y los conductores deben cooperar con requerimientos legítimos de fiscalización.

3. Registro municipal
Existe o puede exigirse un Registro Municipal de Propietarios, Vehículos y Choferes. Conductor y vehículo deben estar inscriptos cuando la norma lo exija y mantener la inscripción vigente. Lifty puede condicionar la asignación de viajes a esa acreditación.

4. Solicitud solo por app
Los viajes deben solicitarse mediante la aplicación. El viaje debe poder acreditarse mostrando la app activa con información de conductor, pasajero y destino.

5. Prohibiciones
Queda prohibido levantar pasajeros sin registro previo en la plataforma; captar en paradas de taxis; captar en paradas de colectivos; o cualquier captación informal prohibida por la ordenanza. El incumplimiento es falta grave frente a Lifty (suspensión/baja) sin perjuicio de sanciones municipales.

6. Conductor (requisitos de alto nivel)
Según información pública: certificado de antecedentes; inscripción en registros fiscales y laborales; licencia profesional (categoría exacta a confirmar con texto oficial). Documentación auténtica y vigente.

7. Vehículo (requisitos de alto nivel)
Según información pública: antigüedad, inspección técnica periódica, seguro exigido e identificación con sticker oficial según norma local. Detalle exacto pendiente de texto oficial. Lifty no asigna viajes si no se acreditan requisitos vigentes.

8. Tarifas y pagos
El precio lo determina la plataforma. El usuario debe poder conocer/calcular el costo anticipadamente. Medios de pago electrónicos; efectivo solo de forma excepcional si la norma y Lifty lo habilitan. Prohibido cobrar sumas no informadas por la app.

9. Seguros
El conductor/propietario mantiene los seguros exigidos por la legislación y la norma municipal. Lifty puede bloquear si la cobertura obligatoria está vencida o no acreditada. No se fijan aquí compañías ni montos.

10. Sanciones
La ordenanza contempla multas, inhabilitaciones y, en su caso, secuestro del vehículo. Faltas graves mencionadas públicamente incluyen levantar sin app, adulterar documentación y agredir inspectores. Lifty no sustituye el régimen municipal: puede suspender la cuenta además de lo que resuelva la autoridad.

11. Rol de Lifty en Villa Sarmiento
Operar conforme a la norma vigente una vez verificado el texto oficial; no asignar viajes a no habilitados; facilitar la acreditación del viaje en app; informar tarifas; ofrecer pagos electrónicos; gestionar reclamos; conservar registros según ley. No sustituye el poder de policía municipal.

12. Prevalencia
Si este resumen difiere del texto oficial de la ordenanza o su reglamentación, prevalece la norma oficial.
$terms_vs$,
  privacy_policy = $privacy_vs$
AVISO: borrador breve. La Política de Privacidad completa de Lifty es un documento separado y debe validarse legalmente antes de publicarse.

Lifty trata datos personales conforme a la Ley 25.326. En el marco del servicio en Villa Sarmiento (Córdoba, cluster launch Traslasierra / lindante a Villa Dolores) pueden tratarse, entre otros: identidad y contacto; datos de cuenta; ubicación/GPS e historial de viajes; datos del vehículo y del conductor; información de pago; datos técnicos del dispositivo; datos de seguridad y prevención de fraude.

Finalidades principales: prestar el servicio de movilidad, asignar y registrar viajes, cobros, seguridad, reclamos, prevención de fraude y cumplimiento de obligaciones legales y municipales.

Podés ejercer derechos de acceso, rectificación, actualización y supresión en los términos de la ley, a través de los canales que indique la Política de Privacidad definitiva.

La geolocalización es necesaria para la prestación del servicio. El detalle de bases de legitimación, encargados, plazos de conservación y transferencias se publicará en la Política completa.
$privacy_vs$
WHERE name = 'Villa Sarmiento'
  AND province = 'Córdoba'
  AND (
    terms_and_conditions IS NULL
    OR terms_and_conditions LIKE 'AVISO:%'
  );
