import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StyleProvider } from '@ant-design/cssinjs';
import { RouterProvider } from 'react-router';
import Router from '@/routes';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StyleProvider layer>
    <StrictMode>
      <RouterProvider router={Router} />
    </StrictMode>
  </StyleProvider>,
);
