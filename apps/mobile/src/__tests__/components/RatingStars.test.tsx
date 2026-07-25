import { render } from '@testing-library/react-native';
import React from 'react';
import { RatingStars } from '../../components/RatingStars';

describe('RatingStars', () => {
  test('renders correct number of filled stars', async () => {
    const { getByTestId } = await render(<RatingStars rating={3.0} />);

    const container = getByTestId('rating-stars');
    expect(container).toBeTruthy();

    const starsText = container.children[0] as unknown as { props: { children: string } };
    expect(starsText.props.children).toBe('★★★☆☆');
  });

  test('renders 5 filled stars for rating 5.0', async () => {
    const { getByTestId } = await render(<RatingStars rating={5.0} />);

    const container = getByTestId('rating-stars');
    const starsText = container.children[0] as unknown as { props: { children: string } };
    expect(starsText.props.children).toBe('★★★★★');
  });

  test('renders 0 filled stars for rating under 1', async () => {
    const { getByTestId } = await render(<RatingStars rating={0.5} />);

    const container = getByTestId('rating-stars');
    const starsText = container.children[0] as unknown as { props: { children: string } };
    expect(starsText.props.children).toBe('☆☆☆☆☆');
  });

  test('displays numeric rating value', async () => {
    const { getByText } = await render(<RatingStars rating={4.8} />);

    expect(getByText('4.8')).toBeTruthy();
  });

  test('displays numeric rating value with one decimal', async () => {
    const { getByText } = await render(<RatingStars rating={3.0} />);

    expect(getByText('3.0')).toBeTruthy();
  });

  test('renders amber-colored star text and rating value', async () => {
    const { getByTestId } = await render(<RatingStars rating={4.2} />);

    const container = getByTestId('rating-stars');
    const starsText = container.children[0] as unknown as { props: { children: string } };
    const valueText = container.children[1] as unknown as { props: { children: string } };
    expect(starsText.props.children).toBe('★★★★☆');
    expect(valueText.props.children).toBe('4.2');
  });

  test('uses default size 14 when size prop is not provided', async () => {
    const { getByText } = await render(<RatingStars rating={4.0} />);

    const valueText = getByText('4.0') as unknown as {
      props: { style: Array<{ fontSize?: number }> };
    };
    const inlineStyle = valueText.props.style.find(
      (s) => s?.fontSize !== undefined,
    );
    expect(inlineStyle?.fontSize).toBe(14);
  });

  test('applies custom size 20 prop', async () => {
    const { getByText } = await render(<RatingStars rating={4.5} size={20} />);

    const valueText = getByText('4.5') as unknown as {
      props: { style: Array<{ fontSize?: number }> };
    };
    const inlineStyle = valueText.props.style.find(
      (s) => s?.fontSize !== undefined,
    );
    expect(inlineStyle?.fontSize).toBe(20);
  });
});
