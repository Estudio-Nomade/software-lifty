import { getStepEndpoint, maneuverToText } from '../../lib/maneuver';

describe('maneuverToText', () => {
  test('depart returns empty string', () => {
    expect(maneuverToText('depart')).toBe('');
  });

  test('arrive with no modifier returns llegando', () => {
    expect(maneuverToText('arrive')).toBe('Llegando a destino');
  });

  test('arrive left', () => {
    expect(maneuverToText('arrive', 'left')).toBe('Destino a la izquierda');
  });

  test('arrive right', () => {
    expect(maneuverToText('arrive', 'right')).toBe('Destino a la derecha');
  });

  test('turn left', () => {
    expect(maneuverToText('turn', 'left')).toBe('Girar a la izquierda');
  });

  test('turn right', () => {
    expect(maneuverToText('turn', 'right')).toBe('Girar a la derecha');
  });

  test('turn slight left', () => {
    expect(maneuverToText('turn', 'slight left')).toBe('Girar ligeramente a la izquierda');
  });

  test('roundabout', () => {
    expect(maneuverToText('roundabout')).toBe('Continuar en la rotonda');
  });

  test('roundabout left', () => {
    expect(maneuverToText('roundabout', 'left')).toBe('En la rotonda, girar a la izquierda');
  });

  test('merge', () => {
    expect(maneuverToText('merge')).toBe('Incorporarse');
  });

  test('fork left', () => {
    expect(maneuverToText('fork', 'left')).toBe('Mantenerse a la izquierda');
  });

  test('new name', () => {
    expect(maneuverToText('new name')).toBe('Continuar por');
  });

  test('unknown type returns continuar', () => {
    expect(maneuverToText('unknown_type')).toBe('Continuar');
  });

  test('uturn', () => {
    expect(maneuverToText('turn', 'uturn')).toBe('Hacer un giro en U');
  });

  test('end of road', () => {
    expect(maneuverToText('end of road', 'left')).toBe('Al final, Girar a la izquierda');
  });

  test('sharp turn', () => {
    expect(maneuverToText('turn', 'sharp left')).toBe('Girar cerradamente a la izquierda');
  });

  test('turn with no modifier defaults to girar', () => {
    expect(maneuverToText('turn')).toBe('Girar');
  });

  test('continue', () => {
    expect(maneuverToText('continue')).toBe('Continuar');
  });
});

describe('getStepEndpoint', () => {
  test('returns last coordinate of decoded polyline', () => {
    const endpoint = getStepEndpoint('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(endpoint).not.toBeNull();
    expect(endpoint!).toHaveLength(2);
    expect(typeof endpoint![0]).toBe('number');
    expect(typeof endpoint![1]).toBe('number');
  });

  test('returns null for empty geometry', () => {
    expect(getStepEndpoint('')).toBeNull();
  });
});
