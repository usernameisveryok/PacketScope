import React, { useState, useMemo } from 'react';
import { Resizable } from 'react-resizable';
import classNames from 'classnames';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { HolderOutlined } from '@ant-design/icons';

interface SortableHeaderCellProps extends React.HTMLAttributes<HTMLTableCellElement> {
  id: string;
  width?: number;
  onResize?: (e: React.SyntheticEvent, { size }: { size: { width: number; height: number } }) => void;
  isDrag?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const SortableHeaderCell: React.FC<SortableHeaderCellProps> = ({
  id,
  width,
  onResize,
  isDrag = true,
  children,
  onContextMenu,
  ...restProps
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = useMemo<React.CSSProperties>(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      position: 'relative',
      background: '#fafafa',
      padding: '8px',
      borderBottom: '1px solid #f0f0f0',
    }),
    [transform, transition, isDragging],
  );

  const renderTitle = () => {
    return (
      <div className="flex overflow-hidden h-[20px]">
        <div className="whitespace-nowrap flex">
          {typeof children[1] === 'string' ? <span className="flex items-center">{children}</span> : children}
          {isDrag && (
            <div
              className={classNames(
                'flex cursor-grab text-gray-30 ml-2 hover:text-blue-500 hover:bg-blue-50 text-base px-3 py-1 rounded select-none transition-colors duration-300 z-20',
                { hidden: isResizing },
              )}
              {...attributes}
              {...listeners}
            >
              <HolderOutlined className="text-[14px]" />
            </div>
          )}
        </div>
      </div>
    );
  };

  const content = (
    <th
      ref={setNodeRef}
      {...restProps}
      style={style}
      className={classNames('cursor-default', { 'z-10': isDragging })}
      onContextMenu={onContextMenu}
    >
      {renderTitle()}
    </th>
  );

  return width && onResize ? (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className={classNames('absolute right-0 top-0 h-full w-[12px] cursor-col-resize translate-x-[50%] z-10 transform-gpu', {
            hidden: isDragging,
          })}
          onClick={(e) => e.stopPropagation()}
        />
      }
      onResize={onResize}
      onResizeStart={() => setIsResizing(true)}
      onResizeStop={() => setIsResizing(false)}
      draggableOpts={{ enableUserSelectHack: true }}
    >
      {content}
    </Resizable>
  ) : (
    content
  );
};

SortableHeaderCell.displayName = 'SortableHeaderCell';

export default SortableHeaderCell;
