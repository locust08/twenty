import { render } from '@testing-library/react';
import { SunyieldLeadUnavailableNotificationEffect } from '@/sunyield/components/SunyieldLeadUnavailableNotificationEffect';
const mockEnqueueToast = jest.fn();
let mockWorkspaceId = 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6';
jest.mock('twenty-ui/components/feedback', () => ({
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({ id: mockWorkspaceId }),
}));
beforeEach(() => {
  mockEnqueueToast.mockClear();
  mockWorkspaceId = 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6';
  window.history.replaceState(
    {},
    '',
    '/objects/leads?viewId=saved&sunyieldLeadUnavailable=1',
  );
});
it('explains a denied lead after the cache-clearing redirect, once', () => {
  const view = render(<SunyieldLeadUnavailableNotificationEffect />);
  expect(mockEnqueueToast).toHaveBeenCalledWith(
    expect.objectContaining({
      children:
        'This lead is unavailable or you don’t have permission to view it',
    }),
  );
  expect(window.location.search).toBe('?viewId=saved');
  view.unmount();
  render(<SunyieldLeadUnavailableNotificationEffect />);
  expect(mockEnqueueToast).toHaveBeenCalledTimes(1);
});
it('does not show a denial on ordinary visits', () => {
  window.history.replaceState({}, '', '/objects/leads');
  render(<SunyieldLeadUnavailableNotificationEffect />);
  expect(mockEnqueueToast).not.toHaveBeenCalled();
});
it('leaves other workspaces unchanged', () => {
  mockWorkspaceId = 'other';
  render(<SunyieldLeadUnavailableNotificationEffect />);
  expect(mockEnqueueToast).not.toHaveBeenCalled();
  expect(window.location.search).toContain('sunyieldLeadUnavailable=1');
});
