import React from 'react';
import { useRouteError } from 'react-router';

const ErrorPage: React.FC = () => {
  const error = useRouteError() as { status?: number; statusText?: string; message?: string };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-100 text-gray-900">
      <h1 className="text-4xl font-bold">Oops! 出错了</h1>
      <p className="mt-2 text-lg">我们无法找到您请求的页面。</p>
      {error?.status && (
        <p className="mt-2 text-gray-600">
          错误 {error.status}: {error.statusText || error.message}
        </p>
      )}
      <a href="/" className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md shadow-md hover:bg-blue-700">
        返回首页
      </a>
    </div>
  );
};

export default ErrorPage;
