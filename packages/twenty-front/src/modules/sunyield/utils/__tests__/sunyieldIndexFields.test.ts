import { createStore } from 'jotai';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { visibleRecordFieldsComponentSelector } from '@/object-record/record-field/states/visibleRecordFieldsComponentSelector';
import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { SUNYIELD_WORKSPACE_ID } from '@/sunyield/constants/SUNYIELD_WORKSPACE_ID';
import { mockedUserData } from '~/testing/mock-data/users';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';
import { PermissionFlagType } from '~/generated-metadata/graphql';

const build = (workspaceId: string, isAdmin = false) => {
  const store = createStore();
  const template = getMockObjectMetadataItemOrThrow('company');
  const fieldTemplate = template.fields.find((field) => field.name === 'name')!;
  const fields = [
    'createdAt',
    'name',
    'area',
    'rawPhone',
    'status',
    'owner',
  ].map((name) => ({
    ...fieldTemplate,
    id: 'field-' + name,
    name,
    objectMetadataId: template.id,
  }));
  const object = {
    ...template,
    nameSingular: 'lead',
    namePlural: 'leads',
    fields,
    readableFields: fields,
    labelIdentifierFieldMetadataId: 'field-name',
  };
  setTestObjectMetadataItemsInMetadataStore(store, [object]);
  store.set(currentWorkspaceState.atom, {
    ...mockedUserData.currentWorkspace,
    workspaceCustomApplication: null,
    installedApplications: [],
    id: workspaceId,
  });
  store.set(currentUserWorkspaceState.atom, {
    ...mockedUserData.currentUserWorkspace,
    permissionFlags: isAdmin ? [PermissionFlagType.WORKSPACE_MEMBERS] : [],
  });
  const key = { instanceId: 'daily-index' };
  store.set(
    currentRecordFieldsComponentState.atomFamily(key),
    fields.map((field, index) => ({
      id: field.id,
      fieldMetadataItemId: field.id,
      position: index,
      isVisible: field.name !== 'rawPhone',
      size: 180,
    })),
  );
  return { store, key };
};
it('keeps Sunyield headers, rows and keyboard metadata on the same ordered field set', () => {
  const { store, key } = build(SUNYIELD_WORKSPACE_ID);
  expect(
    store
      .get(visibleRecordFieldsComponentSelector.selectorFamily(key))
      .map((field) => field.fieldMetadataItemId),
  ).toEqual(['field-name', 'field-status', 'field-rawPhone', 'field-area']);
  expect(
    store
      .get(currentRecordFieldsComponentState.atomFamily(key))
      .find((field) => field.fieldMetadataItemId === 'field-rawPhone')
      ?.isVisible,
  ).toBe(false);
});
it('preserves other workspaces and original fields in customization mode', () => {
  const { store, key } = build('locus-workspace');
  const original = [
    'field-createdAt',
    'field-name',
    'field-area',
    'field-status',
    'field-owner',
  ];
  expect(
    store
      .get(visibleRecordFieldsComponentSelector.selectorFamily(key))
      .map((field) => field.fieldMetadataItemId),
  ).toEqual(original);
  store.set(currentWorkspaceState.atom, {
    ...mockedUserData.currentWorkspace,
    workspaceCustomApplication: null,
    installedApplications: [],
    id: SUNYIELD_WORKSPACE_ID,
  });
  store.set(isLayoutCustomizationModeEnabledState.atom, true);
  expect(
    store
      .get(visibleRecordFieldsComponentSelector.selectorFamily(key))
      .map((field) => field.fieldMetadataItemId),
  ).toEqual(original);
});
