import { RecordPageSidePanelCommandMenuDropdown } from '@/command-menu-item/components/RecordPageSidePanelCommandMenuDropdown';
import { CommandMenuContext } from '@/command-menu-item/contexts/CommandMenuContext';
import { createMockCommandMenuItems } from '@/command-menu-item/mock/command-menu-items.mock';
import { render, screen } from '@testing-library/react';
import { type ReactNode, useContext } from 'react';
import { CommandMenuItemAvailabilityType } from '~/generated-metadata/graphql';

let mockEnabled = true;
jest.mock('@/sunyield/hooks/useSunyieldLayout', () => ({
  useSunyieldLayout: () => ({ enabled: mockEnabled }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [],
}));
jest.mock(
  '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow',
  () => ({
    useAvailableComponentInstanceIdOrThrow: () => 'test-menu',
  }),
);
jest.mock(
  '@/command-menu-item/hooks/useSidePanelFooterPinnedItemsAvailableWidth',
  () => ({
    useSidePanelFooterPinnedItemsAvailableWidth: () => 400,
  }),
);
jest.mock(
  '@/command-menu-item/display/hooks/usePinnedCommandMenuItemsInlineLayout',
  () => ({
    usePinnedCommandMenuItemsInlineLayout: () => ({
      pinnedOverflowCommandMenuItems: [],
    }),
  }),
);
jest.mock('@/side-panel/components/SidePanelOptionsDropdown', () => ({
  SidePanelOptionsDropdown: ({ children }: { children: ReactNode }) => (
    <>
      <button>Options</button>
      {children}
    </>
  ),
}));
jest.mock(
  '@/command-menu-item/display/components/CommandMenuDropdownActionItem',
  () => ({
    CommandMenuDropdownActionItem: () => <button>Delete Lead</button>,
  }),
);
const Options = ({ withAction = false }: { withAction?: boolean }) => {
  const context = useContext(CommandMenuContext);
  const commandMenuItems = withAction
    ? [
        {
          ...createMockCommandMenuItems()[0],
          isPinned: false,
          availabilityType: CommandMenuItemAvailabilityType.RECORD_SELECTION,
        },
      ]
    : [];
  return (
    <CommandMenuContext.Provider value={{ ...context, commandMenuItems }}>
      <RecordPageSidePanelCommandMenuDropdown />
    </CommandMenuContext.Provider>
  );
};
beforeEach(() => {
  mockEnabled = true;
});
it('hides an empty Sunyield overflow menu', () => {
  render(<Options />);
  expect(
    screen.queryByRole('button', { name: 'Options' }),
  ).not.toBeInTheDocument();
});
it('keeps useful admin actions available', () => {
  render(<Options withAction />);
  expect(screen.getByRole('button', { name: 'Options' })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Delete Lead' }),
  ).toBeInTheDocument();
});
it('preserves other workspaces', () => {
  mockEnabled = false;
  render(<Options />);
  expect(screen.getByRole('button', { name: 'Options' })).toBeInTheDocument();
});
