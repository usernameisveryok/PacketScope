import { useState, useRef, useEffect } from 'react';
import { Table, ConfigProvider } from 'antd';
import type { TableProps, TableColumnType } from 'antd';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Menu, Item, useContextMenu } from 'react-contexify';
import 'react-contexify/ReactContexify.css';
import SortableHeaderCell from './SortableHeaderCell';

// Define table data item interface
export interface TableDataItem {
  key: string | number;
  id: number;
  name: string;
  time: string;
  pid: number;
  tid: number;
  status: string;
  info: string;
  [key: string]: any; // Allow other properties
}

// Define resizable column type, extending from Ant Design's TableColumnType
export interface ResizableColumnType<T> extends TableColumnType<T> {
  width?: number;
  onHeaderCell?: (column: ResizableColumnType<T>) => object;
  visible?: boolean; // Add visible property for column visibility control
}

// Define component props interface
interface ResizableSortableTableProps {
  dataSource: TableDataItem[];
  initialColumns: ResizableColumnType<TableDataItem>[];
  contentHeight: number;
  selectedRowKey: string | number | null;
  onRowClick: (key: string | number) => void;
  isAutoScroll: boolean;
  onScroll: (isAtBottom: boolean) => void;
}

const HEADER_CONTEXT_MENU_ID = 'table-header-context-menu';

const ResizableSortableTable: React.FC<ResizableSortableTableProps> = ({
  dataSource,
  initialColumns,
  contentHeight,
  selectedRowKey,
  onRowClick,
  isAutoScroll,
  onScroll,
}) => {
  const tableRef = useRef<any>(null);
  const [tableHeadHeight, setTableHeadHeight] = useState<number>(0);
  const [columns, setColumns] = useState<ResizableColumnType<TableDataItem>[]>(initialColumns.map((col) => ({ ...col, visible: true })));
  const [rightClickedColumn, setRightClickedColumn] = useState<string | null>(null);

  // Context menu hook
  const { show } = useContextMenu({
    id: HEADER_CONTEXT_MENU_ID,
  });

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Handle column resize
  const handleResize =
    (index: number) =>
    (_e: React.SyntheticEvent, { size }: { size: { width: number } }) => {
      _e.preventDefault();
      const nextCols = [...columns];
      nextCols[index] = {
        ...nextCols[index],
        width: size.width,
      };
      setColumns(nextCols);
    };

  // Handle drag end for reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = columns.findIndex((c) => c.key === active.id);
      const newIndex = columns.findIndex((c) => c.key === over.id);
      const newCols = arrayMove(columns, oldIndex, newIndex);
      setColumns(newCols);
    }
  };

  // Handle right-click on header cell
  const handleHeaderContextMenu = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    setRightClickedColumn(columnKey);
    show({ event: e });
  };

  // Toggle column visibility
  const toggleColumnVisibility = (columnKey: string) => {
    setColumns((prevColumns) => prevColumns.map((col) => (col.key === columnKey ? { ...col, visible: !col.visible } : col)));
  };

  // Get visible columns
  const visibleColumns = columns.filter((col) => col.visible !== false);

  // Reset all columns to visible
  const showAllColumns = () => {
    setColumns((prevColumns) => prevColumns.map((col) => ({ ...col, visible: true })));
  };

  // Add resize handlers and context menu to columns
  const mergedColumns = visibleColumns.map((col, index) => ({
    ...col,
    onHeaderCell: (column: ResizableColumnType<TableDataItem>) => ({
      width: column.width,
      onResize: index !== visibleColumns.length - 1 ? handleResize(index) : undefined,
      id: column.key as string,
      // onContextMenu: (e: React.MouseEvent) => handleHeaderContextMenu(e, column.key as string),
    }),
  }));

  // Auto-scroll effect
  useEffect(() => {
    if (!tableRef.current || !dataSource.length || !isAutoScroll) return;

    const scrollToBottom = () => {
      const body = tableRef.current.nativeElement.querySelector('.ant-table-tbody-virtual-holder');
      if (body) {
        setTimeout(() => {
          body.scrollTop = body.scrollHeight;
        }, 0);
      }
    };

    const frameId = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frameId);
  }, [dataSource, isAutoScroll]);

  // Scroll event listener
  useEffect(() => {
    if (!tableRef.current) return;

    const body = tableRef.current.nativeElement.querySelector('.ant-table-tbody-virtual-holder');
    if (!body) return;

    const handleScrollEvent = () => {
      const distanceToBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
      const atBottom = distanceToBottom < 20;
      onScroll(atBottom);
    };

    body.addEventListener('scroll', handleScrollEvent);
    return () => {
      body.removeEventListener('scroll', handleScrollEvent);
    };
  }, [tableRef.current, onScroll]);

  useEffect(() => {
    if (!tableRef.current) return;
    setTableHeadHeight(tableRef.current.nativeElement.querySelector('th')?.offsetHeight ?? 0);
  }, [tableRef]);

  return (
    <ConfigProvider
      theme={{
        components: {
          Table: {
            headerBorderRadius: 0,
            cellFontSize: 12,
            rowSelectedBg: '#e6f4ff',
            rowHoverBg: '#e6f4ff',
            bodySortBg: '#1677ff29',
            cellPaddingBlockSM: 0,
          },
        },
      }}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleColumns.map((col) => col.key?.toString() || '')} strategy={horizontalListSortingStrategy}>
          <Table
            rootClassName="w-full h-full"
            dataSource={dataSource}
            columns={mergedColumns}
            style={{ minHeight: contentHeight }}
            ref={tableRef}
            virtual
            showSorterTooltip={{ target: 'sorter-icon' }}
            components={{
              header: {
                cell: SortableHeaderCell as React.FC<any>,
              },
            }}
            pagination={false}
            rowClassName={(record: TableDataItem) => {
              let klassnames: string[] = [];
              if (record.key === selectedRowKey) {
                klassnames.push('bg-blue-100');
              }
              if (record.status === 'Inactive' && klassnames.length === 0) {
                klassnames.push('bg-red-100');
              }
              return klassnames.join(' ');
            }}
            onRow={(record: TableDataItem) => ({
              onClick: () => onRowClick(record.key),
            })}
            bordered
            size="small"
            scroll={{ y: contentHeight - tableHeadHeight, x: 'max-content' }}
          />
        </SortableContext>
      </DndContext>

      {/* Context menu for column visibility control */}
      <Menu id={HEADER_CONTEXT_MENU_ID} animation="fade">
        <Item onClick={() => rightClickedColumn && toggleColumnVisibility(rightClickedColumn)}>
          {rightClickedColumn && columns.find((col) => col.key === rightClickedColumn)?.visible
            ? `Hide "${columns.find((col) => col.key === rightClickedColumn)?.title || rightClickedColumn}" column`
            : `Show "${columns.find((col) => col.key === rightClickedColumn)?.title || rightClickedColumn}" column`}
        </Item>
        <Item onClick={showAllColumns}>Show all columns</Item>
        <Item disabled>Column visibility:</Item>
        {columns.map((column) => (
          <Item key={column.key as string} onClick={() => toggleColumnVisibility(column.key as string)}>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={column.visible !== false}
                onChange={() => toggleColumnVisibility(column.key as string)}
                className="mr-2"
              />
              {column.title as string}
            </div>
          </Item>
        ))}
      </Menu>
    </ConfigProvider>
  );
};

export default ResizableSortableTable;
