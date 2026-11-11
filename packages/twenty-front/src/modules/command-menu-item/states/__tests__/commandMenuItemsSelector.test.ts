import { createStore } from 'jotai';
import {
  currentWorkspaceState,
  type CurrentWorkspace,
} from '@/auth/states/currentWorkspaceState';
import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { commandMenuItemsSelector } from '@/command-menu-item/states/commandMenuItemsSelector';
const legacy = {
  id: 'legacy',
  universalIdentifier: '229b4cb9-3e8d-45ae-971d-7cff04adb2f1',
  label: 'Update Status',
  isActive: true,
};
const native = { id: 'native', label: 'Create note', isActive: true };
const prepare = (workspaceId: string) => {
  const store = createStore();
  store.set(currentWorkspaceState.atom, {
    id: workspaceId,
  } as CurrentWorkspace);
  store.set(metadataStoreState.atomFamily('commandMenuItems'), {
    current: [legacy, native, { id: 'inactive', isActive: false }],
    draft: [],
    status: 'up-to-date',
  });
  return store;
};
it('removes only the legacy Sunyield status action from all command consumers', () => {
  const store = prepare('e7e7d4f2-0f82-4a72-a12e-1f61494c61c6');
  expect(
    store.get(commandMenuItemsSelector.atom).map((item) => item.id),
  ).toEqual(['native']);
});
it('retains the same command and other active actions in other workspaces', () => {
  const store = prepare('other');
  expect(
    store.get(commandMenuItemsSelector.atom).map((item) => item.id),
  ).toEqual(['legacy', 'native']);
});

it('removes the installed legacy command when upgraded metadata has no universal identifier', () => {
  const store = prepare('e7e7d4f2-0f82-4a72-a12e-1f61494c61c6');
  store.set(metadataStoreState.atomFamily('commandMenuItems'), {
    current: [
      {
        ...legacy,
        id: '711308fe-4738-4f7e-a4f2-5be23cae52ac',
        universalIdentifier: null,
      },
      native,
    ],
    draft: [],
    status: 'up-to-date',
  });
  expect(
    store.get(commandMenuItemsSelector.atom).map((item) => item.id),
  ).toEqual(['native']);
});

it.each(['e7e7d4f2-0f82-4a72-a12e-1f61494c61c6', 'other'])(
  'scopes optional AI and mailbox commands without mutating stored metadata (%s)',
  (workspaceId) => {
    const store = prepare(workspaceId);
    const current = [
      native,
      { id: 'ai', isActive: true, engineComponentKey: 'ASK_AI' },
      { id: 'mail', isActive: true, engineComponentKey: 'COMPOSE_EMAIL' },
    ];
    store.set(metadataStoreState.atomFamily('commandMenuItems'), {
      current,
      draft: [],
      status: 'up-to-date',
    });
    expect(
      store.get(commandMenuItemsSelector.atom).map((item) => item.id),
    ).toEqual(workspaceId === 'other' ? ['native', 'ai', 'mail'] : ['native']);
    expect(
      store.get(metadataStoreState.atomFamily('commandMenuItems')).current,
    ).toEqual(current);
  },
);
