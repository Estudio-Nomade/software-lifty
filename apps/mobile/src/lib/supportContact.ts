export const SUPPORT_EMAIL = 'admin@liftyviajes.com';
export const SUPPORT_WHATSAPP_NUMBER = '2266515776';

const SUPPORT_WHATSAPP_TEXT = [
  'Hola, soy conductor de Lifty y necesito ayuda.',
  '',
  'Qué me pasó:',
  '-',
  '',
  'Qué estaba haciendo justo antes:',
  '-',
  '',
  'Qué botones toqué:',
  '-',
  '',
  'Pantalla en la que estaba:',
  '-',
  '',
  '¿Me aparece algún mensaje de error? (copialo si podés):',
  '-',
].join('\n');

const SUPPORT_MAIL_SUBJECT = '[Lifty Conductor] Reporte de error';

const SUPPORT_MAIL_BODY = [
  'Hola equipo Lifty,',
  '',
  'Quiero reportar un problema en la app de conductor.',
  '',
  '1) Qué estaba intentando hacer:',
  '-',
  '',
  '2) Qué hice justo antes de que fallara (pasos):',
  '   1.',
  '   2.',
  '   3.',
  '',
  '3) Qué botones o pantallas toqué:',
  '-',
  '',
  '4) Qué esperaba que pasara:',
  '-',
  '',
  '5) Qué pasó en cambio (mensaje de error, pantalla en blanco, se cerró, etc.):',
  '-',
  '',
  '6) ¿Se puede repetir? Sí / No. Cómo:',
  '-',
  '',
  '7) Celular y versión de la app (si la sabés):',
  '-',
  '',
  'Gracias.',
].join('\n');

export function buildSupportWhatsAppUrl(): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(SUPPORT_WHATSAPP_TEXT)}`;
}

export function buildSupportMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(SUPPORT_MAIL_SUBJECT)}&body=${encodeURIComponent(SUPPORT_MAIL_BODY)}`;
}
