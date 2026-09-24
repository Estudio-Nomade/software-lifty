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
    body: 'Lifty es una plataforma tecnológica de movilidad que te permite solicitar viajes con conductores habilitados. Lifty gestiona la app, la asignación, el registro del viaje, los pagos habilitados y el soporte, y asume las obligaciones que la ley y las normas municipales le impongan como plataforma. No se presenta como un intermediario sin deberes propios.',
  },
  {
    heading: '2. Aceptación',
    body: 'Al usar Lifty aceptás estos Términos Generales y la Política de Privacidad (documento separado). En relaciones de consumo rige la Ley 24.240: tenés derecho a información clara, trato digno y a no renunciar a derechos irrenunciables. Si no estás de acuerdo, no uses la aplicación.',
  },
  {
    heading: '3. Tu cuenta',
    body: 'Registrate con datos reales y mantené la confidencialidad de tu acceso. La cuenta es personal. Lifty puede rechazar o suspender cuentas falsas, fraudulentas o que pongan en riesgo la seguridad de otros usuarios.',
  },
  {
    heading: '4. Solicitud de viajes',
    body: 'Los viajes se piden solo por la app. Antes de confirmar vas a ver, en la medida de lo posible, estimación de tarifa, datos del conductor y del vehículo cuando haya asignación, y medios de pago. Verificá conductor y vehículo antes de subir.',
  },
  {
    heading: '5. Tarifas y pagos',
    body: 'El precio del viaje lo determina la plataforma. Debés poder conocer o calcular el costo de forma anticipada cuando sea técnicamente posible. El pago se hace con los medios electrónicos habilitados; el efectivo solo si está permitido y habilitado. Aceptás el cargo del viaje y los cargos legítimos informados (por ejemplo cancelación fuera de plazo, cuando aplique).',
  },
  {
    heading: '6. Cancelaciones y reembolsos',
    body: 'Podés cancelar según las reglas de la app. Pueden aplicarse cargos claros y no abusivos. Si hubo un cobro incorrecto o el viaje no se prestó por causas imputables al servicio, podés pedir ajuste o reembolso por soporte. También podés reclamar ante defensa del consumidor.',
  },
  {
    heading: '7. Conducta y seguridad',
    body: 'Tratá con respeto al conductor. No dañes el vehículo ni uses el servicio para fines ilícitos. Usá el cinturón y seguí las indicaciones de seguridad. En emergencia, contactá primero a los servicios públicos (por ejemplo 911) y, si está disponible, el SOS de la app.',
  },
  {
    heading: '8. Calificaciones y objetos perdidos',
    body: 'Al finalizar podés calificar el viaje de forma honesta. Si olvidás algo en el auto, reportalo por la app; Lifty facilita el contacto cuando sea posible, sin garantizar la recuperación.',
  },
  {
    heading: '9. Datos personales',
    body: 'Tratamos nombre, contacto, ubicación/GPS, historial de viajes, datos de pago y del dispositivo según la Ley 25.326 y la Política de Privacidad. La ubicación es necesaria para el servicio. El detalle completo estará en la Política de Privacidad definitiva.',
  },
  {
    heading: '10. Responsabilidad',
    body: 'Lifty responde por el funcionamiento de la plataforma, la información que te brinda y las obligaciones legales que le correspondan. El conductor responde por la conducción y el estado del vehículo. Vos respondés por tu conducta y el pago. No hay una cláusula de “Lifty no se responsabiliza de nada”. Los hechos se analizan según la ley, los seguros y el caso concreto.',
  },
  {
    heading: '11. Dónde opera Lifty',
    body: 'El lanzamiento inicial está pensado para Villa Dolores, Córdoba, como servicio urbano. Pueden sumarse otros municipios con condiciones particulares. Si una norma local imperativa dice otra cosa, prevalece esa norma.',
  },
  {
    heading: '12. Cambios y reclamos',
    body: 'Podemos actualizar estos términos avisando con anticipación razonable cuando el cambio sea sustancial. Podés reclamar por soporte in-app o los canales de contacto publicados, y ante las autoridades competentes. Ley aplicable: República Argentina.',
  },
];
