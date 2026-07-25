import { decodePolyline } from './polyline';

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function modifierToText(modifier: string): string {
  switch (modifier) {
    case 'left':
      return 'girar a la izquierda';
    case 'right':
      return 'girar a la derecha';
    case 'slight left':
      return 'girar ligeramente a la izquierda';
    case 'slight right':
      return 'girar ligeramente a la derecha';
    case 'sharp left':
      return 'girar cerradamente a la izquierda';
    case 'sharp right':
      return 'girar cerradamente a la derecha';
    case 'straight':
      return 'seguir derecho';
    case 'uturn':
      return 'hacer un giro en U';
    default:
      return modifier;
  }
}

export function maneuverToText(type: string, modifier?: string): string {
  if (type === 'depart') return '';

  if (type === 'arrive') {
    if (modifier === 'left') return 'Destino a la izquierda';
    if (modifier === 'right') return 'Destino a la derecha';
    return 'Llegando a destino';
  }

  if (type === 'new name') return 'Continuar por';

  if (type === 'roundabout') {
    if (modifier === 'straight' || !modifier) return 'Continuar en la rotonda';
    return `En la rotonda, ${modifierToText(modifier)}`;
  }

  if (type === 'merge') return 'Incorporarse';
  if (type === 'fork') {
    if (modifier === 'left') return 'Mantenerse a la izquierda';
    if (modifier === 'right') return 'Mantenerse a la derecha';
    if (modifier === 'straight') return 'Mantenerse derecho';
    return modifier ? `Mantenerse a la ${modifierToText(modifier)}` : 'Mantenerse';
  }

  if (type === 'continue') return 'Continuar';
  if (type === 'end of road') {
    return modifier ? `Al final, ${capitalize(modifierToText(modifier))}` : 'Al final de la calle';
  }

  if (type === 'turn') {
    const action = modifier ? modifierToText(modifier) : 'girar';
    return capitalize(action);
  }

  return 'Continuar';
}

export function getStepEndpoint(encodedGeometry: string): [number, number] | null {
  const coords = decodePolyline(encodedGeometry);
  if (coords.length === 0) return null;
  return coords[coords.length - 1];
}
