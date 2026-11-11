import { MockedProvider } from '@apollo/client/testing/react';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import {
  SUNYIELD_MAPPING_QUERY,
  useSunyieldMapping,
} from '@/sunyield/hooks/useSunyieldMapping';

const workspaceId = 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6';

describe('live Sunyield mapping', () => {
  it('loads the saved relation without assuming a particular account', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MockedProvider
        mocks={[
          {
            request: {
              query: SUNYIELD_MAPPING_QUERY,
              variables: { memberId: 'new-member' },
            },
            result: {
              data: {
                salespeople: { edges: [{ node: { id: 'new-salesperson' } }] },
              },
            },
          },
        ]}
      >
        {children}
      </MockedProvider>
    );
    const { result } = renderHook(
      () => useSunyieldMapping(workspaceId, 'new-member', true),
      { wrapper },
    );
    expect(result.current).toBeUndefined();
    await waitFor(() =>
      expect(result.current).toEqual({
        memberId: 'new-member',
        salespersonIds: ['new-salesperson'],
      }),
    );
  });
  it('does not query another workspace', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MockedProvider>{children}</MockedProvider>
    );
    const { result } = renderHook(
      () => useSunyieldMapping('locus', 'member', true),
      { wrapper },
    );
    expect(result.current).toBeUndefined();
  });
});
