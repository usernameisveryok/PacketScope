import type { SpinProps } from 'antd';
import { Spin } from 'antd';
import React from 'react';
const PageLoading: React.FC<SpinProps & any> = ({ ...reset }) => (
  <div style={{ paddingBlockStart: 300, textAlign: 'center' }}>
    <Spin size="large" {...reset} />
  </div>
);

export default PageLoading;
