import { type FieldRichTextValue } from '@/object-record/record-field/ui/types/FieldMetadata';
import { getRichTextFieldSerializedContent } from '@/object-record/record-field/ui/utils/getRichTextFieldSerializedContent';
import {
  isDefined,
  parseTipTapJsonDocument,
  TIPTAP_NODE_TYPES,
  TIPTAP_DOCUMENT_SCHEMA_VERSION,
} from 'twenty-shared/utils';

export const normalizeSunyieldTaskBody = (
  value: FieldRichTextValue | undefined,
): FieldRichTextValue | undefined => {
  const serialized = getRichTextFieldSerializedContent(value);
  const document = isDefined(serialized)
    ? parseTipTapJsonDocument(serialized)
    : undefined;
  if (!document?.content) return value;
  let changed = false;
  const content = document.content.flatMap((node) => {
    const textNode = node.content?.[0];
    if (
      node.type !== TIPTAP_NODE_TYPES.PARAGRAPH ||
      node.content?.length !== 1 ||
      textNode?.type !== TIPTAP_NODE_TYPES.TEXT ||
      textNode.marks?.length ||
      !textNode.text
    )
      return [node];
    const nested =
      parseTipTapJsonDocument(textNode.text) ??
      parseTipTapJsonDocument(textNode.text.replaceAll('\\"', '"'));
    if (!nested?.content?.length) return [node];
    changed = true;
    return nested.content;
  });
  const needsVersion = document.attrs?.schemaVersion === undefined;
  return changed || needsVersion
    ? {
        ...value,
        tiptap: JSON.stringify({
          ...document,
          content,
          attrs: {
            ...document.attrs,
            schemaVersion:
              document.attrs?.schemaVersion ?? TIPTAP_DOCUMENT_SCHEMA_VERSION,
          },
        }),
      }
    : value;
};
