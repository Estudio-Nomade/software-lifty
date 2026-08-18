import {
  buildSosWhatsAppUrl,
  buildSupportMailtoUrl,
  buildSupportWhatsAppUrl,
} from '../../lib/supportContact';

describe('supportContact', () => {
  test('buildSupportWhatsAppUrl incluye wa.me y el texto de ayuda', () => {
    const url = buildSupportWhatsAppUrl();

    expect(url).toContain('wa.me/2266515776');
    expect(decodeURIComponent(url)).toContain('necesito ayuda');
  });

  test('buildSosWhatsAppUrl incluye SOS LIFTY y no el texto de soporte', () => {
    const url = buildSosWhatsAppUrl();
    const decoded = decodeURIComponent(url);

    expect(decoded).toContain('SOS LIFTY');
    expect(decoded).not.toContain('necesito ayuda');
  });

  test('buildSosWhatsAppUrl con trip incluye el id del viaje', () => {
    const url = buildSosWhatsAppUrl({
      trip: {
        id: 'trip-123',
        status: 'in_trip',
        origin_address: 'Av. Origen 1',
        dest_address: 'Calle Destino 2',
      },
    });

    expect(decodeURIComponent(url)).toContain('trip-123');
  });

  test('buildSosWhatsAppUrl sin trip no imprime undefined', () => {
    const url = buildSosWhatsAppUrl();

    expect(decodeURIComponent(url)).not.toContain('undefined');
  });

  test('buildSupportMailtoUrl prefillea subject y body', () => {
    const url = buildSupportMailtoUrl();
    const decoded = decodeURIComponent(url);

    expect(url.startsWith('mailto:admin@liftyviajes.com')).toBe(true);
    expect(decoded).toContain('Reporte de error');
    expect(decoded).toContain('Qué estaba intentando hacer');
  });
});
