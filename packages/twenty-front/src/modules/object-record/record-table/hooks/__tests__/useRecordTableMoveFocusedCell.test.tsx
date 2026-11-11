import { renderHook, act } from '@testing-library/react';
import { useRecordTableMoveFocusedCell } from '@/object-record/record-table/hooks/useRecordTableMoveFocusedCell';
const mockFocus = jest.fn();
let mockSunyield = true;
let mockPosition = { row: 0, column: 3 };
jest.mock('@/sunyield/hooks/useSunyieldLayout', () => ({
  useSunyieldLayout: () => ({ enabled: mockSunyield, isAdmin: false }),
}));
jest.mock(
  '@/object-record/record-table/record-table-cell/hooks/useFocusRecordTableCell',
  () => ({
    useFocusRecordTableCell: () => ({ focusRecordTableCell: mockFocus }),
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({
    useAtomComponentStateCallbackState: (state: { key: string }) => state.key,
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorCallbackState',
  () => ({
    useAtomComponentSelectorCallbackState: (state: { key: string }) =>
      state.key,
  }),
);
jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => ({
    get: (key: string) => {
      if (key === 'recordTableFocusPositionComponentState') return mockPosition;
      if (key === 'recordIndexAllRecordIdsComponentSelector')
        return ['first', 'second'];
      if (key === 'visibleRecordFieldsComponentSelector') return Array(4);
      if (key === 'currentRecordFieldsComponentState') return Array(20);
      throw Error(key);
    },
  }),
}));
afterEach(() => {
  mockFocus.mockReset();
  mockSunyield = true;
  mockPosition = { row: 0, column: 3 };
});
it('moves from the last visible Sunyield column to the next row', () => {
  const { result } = renderHook(() => useRecordTableMoveFocusedCell('table'));
  act(() => result.current.moveRight());
  expect(mockFocus).toHaveBeenCalledWith({ row: 1, column: 0 });
});
it('moves left to the prior row last visible column', () => {
  mockPosition = { row: 1, column: 0 };
  const { result } = renderHook(() => useRecordTableMoveFocusedCell('table'));
  act(() => result.current.moveLeft());
  expect(mockFocus).toHaveBeenCalledWith({ row: 0, column: 3 });
});
it('preserves another workspace keyboard behavior', () => {
  mockSunyield = false;
  const { result } = renderHook(() => useRecordTableMoveFocusedCell('table'));
  act(() => result.current.moveRight());
  expect(mockFocus).toHaveBeenCalledWith({ row: 0, column: 4 });
});
