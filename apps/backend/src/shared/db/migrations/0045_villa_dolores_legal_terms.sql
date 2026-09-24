-- Seed jurisdictional terms summary for Villa Dolores (in-app annex).
-- Source: docs/legal/terminos-y-condiciones-lifty-borrador.md (Parte II summary).
-- Full ordinance text must be verified with the Municipality before production publish.

UPDATE "districts"
SET
  terms_and_conditions = $terms$
AVISO: resumen del Anexo jurisdiccional Villa Dolores (borrador). La numeración y el texto completo de la ordenanza municipal deben verificarse con el Municipio/Concejo Deliberante antes de publicarse como versión definitiva.

1. Ámbito
Se aplica a viajes urbanos en la Ciudad de Villa Dolores, Provincia de Córdoba, y a la habilitación de conductores/vehículos para operar allí mediante Lifty.

2. Autoridad
Según información pública, la autoridad de aplicación es la Dirección de Transporte de Villa Dolores, con participación de Seguridad Ciudadana y Tránsito. Lifty y los conductores deben cooperar con requerimientos legítimos de fiscalización.

3. Registro municipal
Existe un Registro Municipal de Propietarios, Vehículos y Choferes. Conductor y vehículo deben estar inscriptos cuando la norma lo exija y mantener la inscripción vigente. Lifty puede condicionar la asignación de viajes a esa acreditación.

4. Solicitud solo por app
Los viajes deben solicitarse mediante la aplicación. El viaje debe poder acreditarse mostrando la app activa con información de conductor, pasajero y destino.

5. Prohibiciones
Queda prohibido levantar pasajeros sin registro previo en la plataforma; captar en paradas de taxis; captar en paradas de colectivos; o cualquier captación informal prohibida por la ordenanza. El incumplimiento es falta grave frente a Lifty (suspensión/baja) sin perjuicio de sanciones municipales.

6. Conductor (requisitos de alto nivel)
Según información pública: certificado de antecedentes; inscripción en registros fiscales y laborales; licencia profesional (categoría exacta a confirmar con texto oficial). Documentación auténtica y vigente.

7. Vehículo (requisitos de alto nivel)
Según información pública: antigüedad inferior a 10 años; inspección técnica periódica (informada cada 4 meses); seguro exigido; aire acondicionado; baúl de tamaño mínimo; identificación con sticker oficial. Detalle exacto pendiente de texto oficial. Lifty no asigna viajes si no se acreditan requisitos vigentes.

8. Tarifas y pagos
El precio lo determina la plataforma. El usuario debe poder conocer/calcular el costo anticipadamente. Medios de pago electrónicos; efectivo solo de forma excepcional si la norma y Lifty lo habilitan. Prohibido cobrar sumas no informadas por la app.

9. Seguros
El conductor/propietario mantiene los seguros exigidos por la legislación y la norma municipal. Lifty puede bloquear si la cobertura obligatoria está vencida o no acreditada. No se fijan aquí compañías ni montos.

10. Sanciones
La ordenanza contempla multas, inhabilitaciones y, en su caso, secuestro del vehículo. Faltas graves mencionadas públicamente incluyen levantar sin app, adulterar documentación y agredir inspectores. Lifty no sustituye el régimen municipal: puede suspender la cuenta además de lo que resuelva la autoridad.

11. Rol de Lifty en Villa Dolores
Operar conforme a la norma vigente una vez verificado el texto oficial; no asignar viajes a no habilitados; facilitar la acreditación del viaje en app; informar tarifas; ofrecer pagos electrónicos; gestionar reclamos; conservar registros según ley. No sustituye el poder de policía municipal.

12. Prevalencia
Si este resumen difiere del texto oficial de la ordenanza o su reglamentación, prevalece la norma oficial.
$terms$,
  privacy_policy = $privacy$
AVISO: borrador breve. La Política de Privacidad completa de Lifty es un documento separado y debe validarse legalmente antes de publicarse.

Lifty trata datos personales conforme a la Ley 25.326. En el marco del servicio en Villa Dolores pueden tratarse, entre otros: identidad y contacto; datos de cuenta; ubicación/GPS e historial de viajes; datos del vehículo y del conductor; información de pago; datos técnicos del dispositivo; datos de seguridad y prevención de fraude.

Finalidades principales: prestar el servicio de movilidad, asignar y registrar viajes, cobros, seguridad, reclamos, prevención de fraude y cumplimiento de obligaciones legales y municipales.

Podés ejercer derechos de acceso, rectificación, actualización y supresión en los términos de la ley, a través de los canales que indique la Política de Privacidad definitiva.

La geolocalización es necesaria para la prestación del servicio. El detalle de bases de legitimación, encargados, plazos de conservación y transferencias se publicará en la Política completa.
$privacy$
WHERE name = 'Villa Dolores'
  AND province = 'Córdoba';
