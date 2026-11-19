import { generateMapHtml } from '../../components/Map/mapHtml';

describe('mapHtml destination pin', () => {
  const html = generateMapHtml({ primary: '#00C2B3', lightGray: '#F1F4F6' });

  test('destination uses square pin CSS, not circle avatar', () => {
    expect(html).toContain('.destination-pin');
    expect(html).toContain('border-radius: 3px');
    expect(html).not.toMatch(/\.destination-pin\s*\{[^}]*border-radius:\s*50%/);
  });

  test('updateMarkers never paints person icon for destination', () => {
    expect(html).not.toContain('ion-icon name="person"');
    expect(html).toContain("mk.icon === 'destination'");
    expect(html).toContain("el.className = 'destination-pin'");
  });
});
