import { stripHtml } from '../../lib/stripHtml';

describe('stripHtml', () => {
  test('removes HTML tags', () => {
    expect(stripHtml('<p>Hola <b>mundo</b></p>')).toBe('Hola mundo');
  });

  test('returns plain text unchanged', () => {
    expect(stripHtml('sin tags')).toBe('sin tags');
  });

  test('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });
});
