import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import App from './App.jsx';
import './styles/global.css';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, sans-serif',
  colors: {
    dark: [
      '#d5e1f4',
      '#b7c7df',
      '#95abc8',
      '#748eb2',
      '#58739b',
      '#466287',
      '#385070',
      '#2d4058',
      '#223041',
      '#15202b'
    ]
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <App />
    </MantineProvider>
  </React.StrictMode>
);
