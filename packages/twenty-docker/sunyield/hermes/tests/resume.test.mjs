import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.mjs';
import { ResumeControl } from '../src/resume.mjs';
import { observe,Dispatcher } from '../src/dispatcher.mjs';
const setup = (enabled = true) => {
  const ledger = new Ledger(':memory:');
  ledger.activate('2026-11-04T00:00:00Z');
  const reader = {
    recipientsConfigured: true,
    page: async () => ({ recipientsConfigured: reader.recipientsConfigured }),
  };
  const bridge = {
    health: async () => ({ connected: true, sender: '+60123456789' }),
  };
  const control = new ResumeControl({
    ledger,
    reader,
    bridge,
    enabled,
    expectedSender: '+60123456789',
  });
  return { ledger, reader, bridge, control };
};
test('Resume cannot override a disabled deployment, even with activation and valid recipients', async () => {
  const value = setup(false);
  try {
    assert.deepEqual(await value.control.readiness(), {
      canResume: false,
      resumeBlockedReason: 'production_disabled',
    });
    await assert.rejects(value.control.resume(true));
    assert.equal(value.ledger.setting('paused'), 'true');
  } finally {
    value.ledger.database.close();
  }
});
test('a guarded acknowledged Resume releases only pause and preserves cutoff and existing job history', async () => {
  const value = setup();
  try {
    value.ledger.put(
      { id: 'already-submitted' },
      'submitted',
      null,
      null,
      null,
    );
    value.ledger.put({ id: 'uncertain' }, 'delivery-unknown', null, null, null);
    const jobs = value.ledger.list(),
      cutoff = value.ledger.setting('activation');
    await assert.rejects(value.control.resume(false));
    await value.control.resume(true);
    assert.equal(value.ledger.setting('paused'), 'false');
    assert.equal(value.ledger.setting('activation'), cutoff);
    assert.deepEqual(value.ledger.list(), jobs);
  } finally {
    value.ledger.database.close();
  }
});
test('missing activation, unavailable recipients and a wrong or disconnected sender cannot Resume', async () => {
  for (const issue of [
    'activation',
    'recipients',
    'sender',
    'disconnected',
    'feed',
  ]) {
    const value = setup();
    try {
      if (issue === 'activation')
        value.ledger.database
          .prepare("DELETE FROM settings WHERE key='activation'")
          .run();
      if (issue === 'recipients') value.reader.recipientsConfigured = false;
      if (issue === 'sender')
        value.bridge.health = async () => ({
          connected: true,
          sender: '+60999999999',
        });
      if (issue === 'disconnected')
        value.bridge.health = async () => ({
          connected: false,
          sender: '+60123456789',
        });
      if (issue === 'feed')
        value.reader.page = async () => {
          throw Error('Offline');
        };
      await assert.rejects(value.control.resume(true));
      assert.equal(value.ledger.setting('paused'), 'true');
    } finally {
      value.ledger.database.close();
    }
  }
});
test('Pause and a completed device change fence an in-flight valid Resume', async () => {
  for (const change of ['pause', 'device']) {
    const value = setup();
    try {
      let resolveHealth;
      value.bridge.health = () =>
        new Promise((resolve) => {
          resolveHealth = resolve;
        });
      const resuming = value.control.resume(true);
      while (!resolveHealth)
        await new Promise((resolve) => setImmediate(resolve));
      if (change === 'pause') value.control.pause();
      else {
        value.control.setDeviceChanging(true);
        value.control.setDeviceChanging(false);
      }
      resolveHealth({ connected: true, sender: '+60123456789' });
      await assert.rejects(resuming);
      assert.equal(value.ledger.setting('paused'), 'true');
    } finally {
      value.ledger.database.close();
    }
  }
});
test('overlapping device changes are rejected so one operation cannot release another guard', async () => {
  const value = setup();
  try {
    value.control.setDeviceChanging(true);
    assert.throws(() => value.control.setDeviceChanging(true));
    await assert.rejects(value.control.resume(true));
    assert.equal(value.ledger.setting('paused'), 'true');
    value.control.setDeviceChanging(false);
    await value.control.resume(true);
    assert.equal(value.ledger.setting('paused'), 'false');
  } finally {
    value.ledger.database.close();
  }
});
test('Resume uses the readiness response rather than another concurrent reader request cached flag', async () => {
  const value = setup();
  try {
    value.reader.page = async () => ({ recipientsConfigured: false });
    value.reader.recipientsConfigured = true;
    await assert.rejects(value.control.resume(true));
    assert.equal(value.ledger.setting('paused'), 'true');
  } finally {
    value.ledger.database.close();
  }
});
test('isolated Resume lets the normal dispatcher submit only pending work without replaying submitted or uncertain jobs',async()=>{
  const value=setup();try{
    const lead={id:'11111111-1111-4111-8111-111111111111',createdAt:'2026-11-04T01:00:00Z',assignmentState:'ASSIGNED',assignedSalespersonId:'salesperson',assignedAt:'2026-11-04T01:00:01Z',workspaceMemberId:'member',mappingCount:1,recipient:'+60123456789'};
    observe(value.ledger,lead);value.ledger.put({id:'old-submitted'},'submitted',null,null,null);value.ledger.put({id:'old-unknown'},'delivery-unknown',null,null,null);
    let submissions=0;value.reader.get=async()=>lead;value.bridge.send=async()=>{submissions++;return 'new-message';};
    const dispatcher=new Dispatcher({...value,enabled:true,expectedSender:'+60123456789'});
    await dispatcher.tick();assert.equal(submissions,0);await value.control.resume(true);await dispatcher.tick();await dispatcher.tick();
    assert.equal(submissions,1);assert.equal(value.ledger.get(lead.id).state,'submitted');assert.equal(value.ledger.get('old-submitted').state,'submitted');assert.equal(value.ledger.get('old-unknown').state,'delivery-unknown');
  }finally{value.ledger.database.close();}
});
