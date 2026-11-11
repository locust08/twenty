import { parseCanonicalTipTapJsonDocument } from 'twenty-shared/utils';
import { normalizeSunyieldTaskBody } from '@/sunyield/utils/normalizeSunyieldTaskBody';
import { getRichTextFieldTextLines } from '@/object-record/record-field/ui/utils/getRichTextFieldTextLines';
const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const document = (content: unknown[]) =>
  JSON.stringify({ type: 'doc', attrs: { schemaVersion: 1 }, content });
describe('Sunyield legacy task Body display', () => {
  it.each([false, true])(
    'reads a nested document, retains later remarks and never mutates storage (escaped=%s)',
    (escaped) => {
      const inner = document([paragraph('Original task instruction')]);
      const body = {
        tiptap: document([
          paragraph(escaped ? inner.replaceAll('"', '\\"') : inner),
          paragraph('Later user remark'),
        ]),
        markdown: '',
      };
      const original = JSON.stringify(body);
      const normalized = normalizeSunyieldTaskBody(body);
      expect(getRichTextFieldTextLines(normalized)).toEqual([
        'Original task instruction',
        'Later user remark',
      ]);
      expect(JSON.stringify(body)).toBe(original);
    },
  );
  it('preserves normal text, arbitrary JSON, code and marked paragraphs', () => {
    for (const node of [
      paragraph('Ordinary remarks'),
      paragraph('{"customer":"A"}'),
      {
        type: 'codeBlock',
        content: [{ type: 'text', text: document([paragraph('Code sample')]) }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            marks: [{ type: 'code' }],
            text: document([paragraph('Inline code')]),
          },
        ],
      },
    ]) {
      const body = { tiptap: document([node]) };
      expect(normalizeSunyieldTaskBody(body)).toBe(body);
    }
  });
  it('retains structured legacy content and outer attachments', () => {
    const content = [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Follow-up' }],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [paragraph('Call customer')] }],
      },
      { type: 'image', attrs: { src: '/files/test-image' } },
    ];
    const attachment = {
      type: 'file',
      attrs: { src: '/files/outer-attachment' },
    };
    const body = {
      tiptap: document([
        paragraph(document(content)),
        attachment,
        paragraph('Later remark'),
      ]),
    };
    expect(
      JSON.parse(normalizeSunyieldTaskBody(body)?.tiptap ?? '{}').content,
    ).toEqual([...content, attachment, paragraph('Later remark')]);
  });
  it('provides the native editor a canonical document for unversioned legacy task bodies', () => {
    const body = {
      tiptap: JSON.stringify({
        type: 'doc',
        content: [paragraph('Legacy unversioned task')],
      }),
    };
    const normalized = normalizeSunyieldTaskBody(body);
    expect(
      parseCanonicalTipTapJsonDocument(normalized?.tiptap ?? '')?.content,
    ).toEqual([paragraph('Legacy unversioned task')]);
    expect(body.tiptap).not.toContain('schemaVersion');
  });
  it('preserves missing or malformed values', () => {
    expect(normalizeSunyieldTaskBody(undefined)).toBeUndefined();
    const body = { tiptap: '{invalid' };
    expect(normalizeSunyieldTaskBody(body)).toBe(body);
  });
});
