// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusForm } from '../src/status-form';

vi.mock('twenty-sdk/front-component', () => ({
  t: (descriptor: { message: string }) => descriptor.message,
}));

afterEach(cleanup);
const lead = {
  id: 'lead',
  status: 'NEW',
  updatedAt: 'version',
  assignedSalespersonId: 'salesperson',
  deletedAt: null,
};
const statuses = [
  { label: 'New', value: 'NEW' },
  { label: 'Callback', value: 'CALLBACK' },
];

describe('integrated status form', () => {
  it('loads a selected lead and sends only status with the version it displayed', async () => {
    const sent: unknown[] = [];
    const user = userEvent.setup();
    render(
      <StatusForm
        recordIds={['lead']}
        statuses={statuses}
        load={async () => lead}
        save={async (payload) => {
          sent.push(payload);
          return { ...lead, status: 'CALLBACK' };
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Load lead' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Status' }),
      'CALLBACK',
    );
    await user.click(screen.getByRole('button', { name: 'Update status' }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Status updated. Refresh the lead view to see the change.',
    );
    expect(sent).toEqual([
      { recordId: 'lead', status: 'CALLBACK', expectedUpdatedAt: 'version' },
    ]);
  });

  it('requires exactly one selected lead', () => {
    render(
      <StatusForm
        recordIds={['one', 'two']}
        statuses={statuses}
        load={async () => lead}
        save={async () => lead}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Select exactly one lead',
    );
    expect(screen.queryByRole('button', { name: 'Load lead' })).toBeNull();
  });

  it('displays a rejected update and forces a fresh load before another attempt', async () => {
    const user = userEvent.setup();
    render(
      <StatusForm
        recordIds={['lead']}
        statuses={statuses}
        load={async () => lead}
        save={async () => {
          throw new Error('The lead changed or was reassigned. Refresh it.');
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Load lead' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Status' }),
      'CALLBACK',
    );
    await user.click(screen.getByRole('button', { name: 'Update status' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'reassigned',
    );
    expect(screen.queryByRole('button', { name: 'Update status' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Load lead' })).toBeTruthy();
  });
});
