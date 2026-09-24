export const GENERAL_TERMS_VERSION = '0.1-borrador';
export const GENERAL_TERMS_UPDATED_LABEL = 'Borrador legal — septiembre 2026';

export type TermsBlock = {
  heading?: string;
  body: string;
};

/**
 * In-app summary of docs/legal/terminos-y-condiciones-lifty-borrador.md
 * Full counsel-reviewed text is not embedded here.
 */
export const GENERAL_TERMS_SUMMARY: TermsBlock[] = [
  {
    body: 'AVISO: este texto es un resumen del borrador de Términos y Condiciones de Lifty. Debe ser revisado y validado por un abogado matriculado antes de publicarse como versión definitiva. El documento completo está en la documentación legal interna de Lifty.',
  },
  {
    heading: '1. Qué es Lifty',
    body: 'Lifty es una plataforma tecnológica de movilidad que facilita la solicitud, asignación, registro, cobro y gestión de viajes de transporte de pasajeros con conductores habilitados. Lifty asume las obligaciones que le correspondan como operador de la plataforma y las que la normativa aplicable atribuya a las plataformas de transporte. No se presume que Lifty sea un mero intermediario sin deberes propios.',
  },
  {
    heading: '2. Aceptación',
    body: 'Al usar la aplicación aceptás estos Términos Generales, la Política de Privacidad (documento separado) y, cuando corresponda, el Anexo de la jurisdicción donde se presta el viaje (por ejemplo, Villa Dolores). Si no estás de acuerdo, no uses la plataforma. Ninguna cláusula puede interpretarse como renuncia a derechos irrenunciables del consumidor (Ley 24.240).',
  },
  {
    heading: '3. Cuenta y verificación',
    body: 'Debés registrarte con datos veraces y mantener actualizada tu documentación. Los conductores deben completar la verificación de identidad y los requisitos de habilitación de Lifty y de la jurisdicción. La cuenta es personal e intransferible. Lifty puede suspender o dar de baja cuentas por fraude, riesgo de seguridad o incumplimiento normativo.',
  },
  {
    heading: '4. Viajes, tarifas y pagos',
    body: 'Los viajes se solicitan y registran mediante la aplicación. El precio lo determina la plataforma y debe poder conocerse o estimarse antes de confirmar, en la medida de lo posible. Se ofrecen medios de pago electrónicos; el efectivo solo si la normativa y la configuración lo permiten. Está prohibido exigir cobros no informados por la app, salvo conceptos habilitados y transparentes (por ejemplo peajes reales).',
  },
  {
    heading: '5. Conducta, seguridad y emergencias',
    body: 'Pasajeros y conductores deben un trato respetuoso, cumplir normas de tránsito y priorizar la seguridad. En emergencia contactá primero a los servicios públicos (por ejemplo 911) y, si está disponible, usá los canales de la app (SOS). Lifty no sustituye a los servicios de emergencia. Conductas graves pueden derivar en suspensión y reporte a la autoridad.',
  },
  {
    heading: '6. Datos personales',
    body: 'Lifty trata datos de cuenta, viajes, ubicación/GPS, dispositivo, pagos y seguridad conforme a la Ley 25.326 y a la Política de Privacidad. La geolocalización es necesaria para prestar el servicio. El detalle de finalidades, derechos y retención está en la Política de Privacidad (documento separado, pendiente de versión definitiva).',
  },
  {
    heading: '7. Responsabilidad',
    body: 'Lifty responde, en la medida legal, por el funcionamiento de la plataforma, la gestión de cuentas y asignación, la información que brinda, las medidas de seguridad que implemente y las obligaciones que la ley o la norma municipal le impongan. El conductor responde por la conducción, el vehículo, licencias, seguros y su conducta. El pasajero responde por su información, conducta y el pago. No hay exoneración absoluta de responsabilidad frente al consumidor. Los accidentes se rigen por el Código Civil y Comercial, seguros y normas aplicables, caso por caso.',
  },
  {
    heading: '8. Jurisdicción inicial y anexos',
    body: 'El servicio inicial está pensado para Villa Dolores, Córdoba (servicio urbano). Cada municipio puede tener un Anexo de condiciones particulares. Si hay contradicción entre estos términos generales y una norma imperativa local, prevalece la norma. Al elegir un municipio como conductor, debés aceptar también sus términos específicos.',
  },
  {
    heading: '9. Comisión (conductores)',
    body: 'Lifty puede aplicar una comisión sobre viajes completados según la política comercial vigente (incluyendo etapas de lanzamiento). El detalle se informa en la app y/o en comunicaciones a conductores.',
  },
  {
    heading: '10. Cancelaciones',
    body: 'Las cancelaciones se rigen por las reglas de la plataforma. Pueden aplicarse cargos o efectos sobre métricas cuando sean claros, razonables y no abusivos. Causas de fuerza mayor o seguridad pueden moderar consecuencias.',
  },
  {
    heading: '11. Cambios',
    body: 'Lifty puede modificar estos términos. Los cambios sustanciales se comunican por medios razonables antes de su vigencia, salvo urgencia legal o de seguridad. El uso continuado puede importar aceptación, sin perjuicio de tu derecho a dar de baja la cuenta y de los derechos del consumidor.',
  },
  {
    heading: '12. Reclamos y ley aplicable',
    body: 'Podés reclamar por los canales de soporte de Lifty y también ante defensa del consumidor, protección de datos, autoridades de transporte o la justicia competente. Estos términos se rigen por las leyes de la República Argentina y las normas locales del lugar del viaje.',
  },
];
