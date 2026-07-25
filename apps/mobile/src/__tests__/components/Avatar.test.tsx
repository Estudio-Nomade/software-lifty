import { render } from '@testing-library/react-native';
import React from 'react';
import { Avatar } from '../../components/Avatar';

describe('Avatar', () => {
  test('renders image when uri is provided', async () => {
    const { getByTestId } = await render(
      <Avatar uri="https://example.com/photo.jpg" name="John Doe" size={48} />,
    );

    const image = getByTestId('avatar-image');
    expect(image).toBeTruthy();
    expect(image.props.source).toEqual({ uri: 'https://example.com/photo.jpg' });
  });

  test('renders fallback with initials when uri is null', async () => {
    const { getByTestId, getByText } = await render(
      <Avatar uri={null} name="Jane Doe" size={48} />,
    );

    const fallback = getByTestId('avatar-fallback');
    expect(fallback).toBeTruthy();
    expect(getByText('J')).toBeTruthy();
  });

  test('uppercases the first character of name', async () => {
    const { getByText } = await render(<Avatar uri={null} name="bob" size={40} />);

    expect(getByText('B')).toBeTruthy();
  });

  test('applies correct size to fallback circle', async () => {
    const { getByTestId } = await render(<Avatar uri={null} name="Test" size={56} />);

    const fallback = getByTestId('avatar-fallback');
    expect(fallback.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 56,
          height: 56,
          borderRadius: 28,
        }),
      ]),
    );
  });
});
