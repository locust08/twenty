import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

export const SUNYIELD_MAPPING_QUERY = gql`
  query SunyieldMapping($memberId: UUID!) {
    salespeople(filter: { workspaceMemberId: { eq: $memberId } }, first: 2) {
      edges {
        node {
          id
        }
      }
    }
  }
`;

type MappingResult = { salespeople: { edges: { node: { id: string } }[] } };

export const useSunyieldMapping = (
  workspaceId: string | undefined,
  memberId: string | undefined,
  enabled: boolean,
) => {
  const client = useApolloCoreClient();
  const skip =
    !enabled ||
    workspaceId !== 'e7e7d4f2-0f82-4a72-a12e-1f61494c61c6' ||
    !memberId;
  const { data, error } = useQuery<MappingResult>(SUNYIELD_MAPPING_QUERY, {
    client,
    variables: { memberId },
    skip,
    fetchPolicy: 'cache-and-network',
    pollInterval: 30000,
    skipPollAttempt: () => document.visibilityState !== 'visible',
  });

  if (skip || !memberId || error || !data) return undefined;

  return {
    memberId,
    salespersonIds: data.salespeople.edges.map(({ node }) => node.id),
  };
};
