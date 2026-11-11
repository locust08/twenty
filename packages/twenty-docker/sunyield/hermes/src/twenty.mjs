import { WORKSPACE_ID } from './policy.mjs';
export class Twenty {
  constructor(baseUrl, token) {
    if (baseUrl !== 'https://crm-sunyield.up.railway.app')
      throw Error('Sunyield URL guard failed');
    this.baseUrl = baseUrl;
    this.token = token;
  }
  async page(query) {
    const response = await fetch(
      this.baseUrl +
        '/sunyield-integration/lead-feed?' +
        new URLSearchParams(query),
      {
        headers: { 'X-Sunyield-Feed-Key': this.token },
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      },
    );
    if (!response.ok) throw Error('Lead feed unavailable');
    const value = await response.json();
    if (
      value.workspaceId !== WORKSPACE_ID ||
      !Array.isArray(value.leads) ||
      value.leads.length > 100
    )
      throw Error('Invalid lead feed');
    this.recipientsConfigured = value.recipientsConfigured === true;
    return value;
  }
  async *scan(cutoff) {
    let cursor = {},
      previous = '';
    for (;;) {
      const page = await this.page({ cutoff, ...cursor });
      for (const lead of page.leads) yield lead;
      if (!page.next) break;
      const next = JSON.stringify(page.next);
      if (next === previous) throw Error('Lead feed cursor stalled');
      previous = next;
      cursor = page.next;
    }
  }
  async get(id) {
    return (
      (await this.page({ cutoff: '2026-01-01T00:00:00Z', id })).leads[0] || null
    );
  }
}
