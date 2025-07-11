import { createHashRouter, RouteObject } from 'react-router';
import Layout from '@/layouts';
import Guarder from '@/pages/Guarder';
import Locator from '@/pages/Locator';
import Monitor from '@/pages/Monitor';
import ErrorPage from '@/pages/ErrorPage'; // 引入 ErrorPage
import ServiceReadinessGate from '@/pages/ServiceReadinessGate';

export const routerObjects: RouteObject[] = [
  {
    path: '/',
    element: <ServiceReadinessGate />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: '/',
        element: <Layout />,
        children: [
          {
            element: <Monitor />,
            index: true,
          },
          {
            path: 'guarder',
            element: <Guarder />,
          },
          {
            path: 'locator',
            element: <Locator />,
          },
        ],
      },
    ],
  },
];
const Router = createHashRouter(routerObjects);
export default Router;
