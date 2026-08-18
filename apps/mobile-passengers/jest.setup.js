jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});

jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  const Modal = ({ visible, children }) =>
    visible ? React.createElement(React.Fragment, null, children) : null;
  return { __esModule: true, default: Modal };
});
