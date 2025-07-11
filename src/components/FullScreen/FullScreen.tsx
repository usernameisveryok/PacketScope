import React, { FC, HTMLProps } from 'react';
import { Tooltip } from 'antd';
import { useFullscreen } from 'ahooks';
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import type { BasicTarget } from 'ahooks/lib/utils/domTarget';
import type { Options } from 'ahooks/lib/useFullscreen';
import { useIntl } from 'react-intl';

const FullScreen: FC<
  {
    target: BasicTarget;
    options?: Options;
  } & Omit<HTMLProps<HTMLDivElement>, 'target'>
> = ({ target, options, ...restProps }) => {
  const intl = useIntl();
  // const fullScreenClassName = useEmotionCss(({ token }) => ({
  //   fontSize: 16,
  //   '&:hover': {
  //     color: token.colorPrimary,
  //     cursor: 'pointer',
  //   },
  // }));
  const [isFullscreen, { toggleFullscreen, isEnabled }] = useFullscreen(target, options);

  return isEnabled ? (
    <Tooltip
      title={intl.formatMessage({
        id: `fullScreen.${isFullscreen ? 'exit' : 'enter'}`,
      })}
    >
      <span
        className="full"
        {...restProps}
        onClick={() => {
          console.log(isFullscreen);
          toggleFullscreen();
        }}
      >
        {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
      </span>
    </Tooltip>
  ) : null;
};

export default FullScreen;
