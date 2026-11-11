import { SUNYIELD_LEGACY_STATUS_COMMAND_ID } from '@/sunyield/constants/SUNYIELD_LEGACY_STATUS_COMMAND_ID';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { SUNYIELD_LEGACY_STATUS_COMMAND_IDENTIFIER } from '@/sunyield/constants/SUNYIELD_LEGACY_STATUS_COMMAND_IDENTIFIER';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { type FlatCommandMenuItem } from '@/metadata-store/types/FlatCommandMenuItem';
import { type FlatFrontComponent } from '@/metadata-store/types/FlatFrontComponent';
import { createAtomSelector } from '@/ui/utilities/state/jotai/utils/createAtomSelector';
import { isDefined } from 'twenty-shared/utils';
import { type CommandMenuItemFieldsFragment } from '~/generated-metadata/graphql';

const SUNYIELD_OPTIONAL_COMMAND_KEYS = new Set<string>([
  'ASK_AI',
  'NEW_AI_CHAT',
  'VIEW_PREVIOUS_AI_CHATS',
  'COMPOSE_EMAIL',
  'REPLY_TO_EMAIL_THREAD',
  'COMPOSE_CAMPAIGN',
]);

export const commandMenuItemsSelector = createAtomSelector<
  CommandMenuItemFieldsFragment[]
>({
  key: 'commandMenuItemsSelector',
  get: ({ get }) => {
    const workspaceId = get(currentWorkspaceState)?.id;
    const commandMenuItems = get(metadataStoreState, 'commandMenuItems')
      .current as FlatCommandMenuItem[];
    const flatFrontComponents = get(metadataStoreState, 'frontComponents')
      .current as FlatFrontComponent[];

    const frontComponentsById = new Map(
      flatFrontComponents.map((frontComponent) => [
        frontComponent.id,
        frontComponent,
      ]),
    );

    return commandMenuItems
      .filter(
        (item) =>
          item.isActive &&
          (workspaceId !== SUNYIELD_WORKSPACE_ID ||
            (item.id !== SUNYIELD_LEGACY_STATUS_COMMAND_ID &&
              item.universalIdentifier !==
                SUNYIELD_LEGACY_STATUS_COMMAND_IDENTIFIER &&
              !SUNYIELD_OPTIONAL_COMMAND_KEYS.has(
                item.engineComponentKey ?? '',
              ))),
      )
      .map((item) => ({
        ...item,
        frontComponent: isDefined(item.frontComponentId)
          ? (frontComponentsById.get(item.frontComponentId) ??
            item.frontComponent ??
            null)
          : null,
      })) as CommandMenuItemFieldsFragment[];
  },
});
