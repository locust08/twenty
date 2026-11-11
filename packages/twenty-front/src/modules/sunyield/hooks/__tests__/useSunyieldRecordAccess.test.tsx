import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { useSunyieldRecordAccess } from '@/sunyield/hooks/useSunyieldRecordAccess';
import { act, renderHook, waitFor } from '@testing-library/react';

let mockMemberId = 'member-a';
const ORIGINAL_FETCH = global.fetch;
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: (state: unknown) => ({
    id: state === currentWorkspaceState ? SUNYIELD_WORKSPACE_ID : mockMemberId,
  }),
}));

const allowedResponse = (id: string) =>
  ({
    status: 200,
    ok: true,
    json: async () => ({
      record: { id, updatedAt: '2026-11-10T00:00:00Z', deletedAt: null },
      isAdmin: false,
      canEdit: true,
      editableFields: ['status'],
    }),
  }) as Response;

beforeEach(() => {
  mockMemberId = 'member-a';
  global.fetch = jest.fn();
});
afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = ORIGINAL_FETCH;
});

it('does not show late access from a preceding record or member', async () => {
  let releaseFirst: (response: Response) => void = () => {};
  const first = new Promise<Response>((resolve) => {
    releaseFirst = resolve;
  });
  jest
    .spyOn(global, 'fetch')
    .mockImplementation((input) =>
      String(input).includes('recordId=first')
        ? first
        : Promise.resolve(allowedResponse('second')),
    );
  const { result, rerender } = renderHook(
    ({ recordId }) => useSunyieldRecordAccess('lead', recordId),
    { initialProps: { recordId: 'first' } },
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  rerender({ recordId: 'second' });
  expect(result.current).toBeUndefined();
  await waitFor(() => expect(result.current?.record.id).toBe('second'));
  await act(async () => {
    releaseFirst(allowedResponse('first'));
  });
  expect(result.current?.record.id).toBe('second');
  mockMemberId = 'member-b';
  rerender({ recordId: 'second' });
  expect(result.current).toBeUndefined();
  await waitFor(() => expect(result.current?.record.id).toBe('second'));
});

it('withholds access on a transient failure and recovers on focus revalidation', async () => {
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce({ status: 500, ok: false } as Response)
    .mockResolvedValueOnce(allowedResponse('recovered'));
  const { result } = renderHook(() =>
    useSunyieldRecordAccess('lead', 'recovered'),
  );
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(result.current).toBeUndefined();
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() => expect(result.current?.record.id).toBe('recovered'));
});
