import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const patchBridge = (source) => {
  const replace = (before, after) => {
    if (!source.includes(before)) throw Error('Pinned bridge anchor changed');
    source = source.replace(before, after);
  };
  const start = source.indexOf("  sock.ev.on('messages.update'");
  const end = source.indexOf('\n}\n\n// HTTP server', start);
  if (start < 0 || end < 0) throw Error('Pinned bridge handlers changed');
  source =
    source.slice(0, start) +
    `  sock.ev.on('messages.update', updates => {\n    for(const {key,update} of updates || []) if(update?.status !== undefined) enqueueDeliveryStatus({key,update});\n  });\n  sock.ev.on('messages.upsert', async () => {});` +
    source.slice(end);
  replace(
    "const logger = pino({ level: 'warn' });",
    "const logger = pino({ level: 'silent' });",
  );
  replace(
    'syncFullHistory: false,',
    'syncFullHistory: false,\n    shouldSyncHistoryMessage: () => false,',
  );
  replace(
    'status: connectionState,',
    "status: connectionState,\n    sender: sock?.user?.id ? '+' + sock.user.id.split('@')[0].split(':')[0] : null,",
  );
  replace(
    'const msgs = messageQueue.splice(0, messageQueue.length).concat(deliveryQueue.splice(0, deliveryQueue.length));',
    'const msgs = deliveryQueue.splice(0, deliveryQueue.length);',
  );
  replace(
    "let connectionState = 'disconnected';",
    "let connectionState = 'disconnected';\nlet intentionalLogout = false;",
  );
  replace(
    '        process.exit(1);',
    '        if(!intentionalLogout) process.exit(1);',
  );
  replace(
    '// Poll for new messages (long-poll style)',
    `app.post('/logout', async (_request,response) => {
  if(!sock || connectionState !== 'connected')return response.status(503).json({error:'Disconnected'});
  intentionalLogout=true;
  try{await sock.logout();response.json({success:true});}catch{intentionalLogout=false;response.status(503).json({error:'Logout unconfirmed'});}
});
// Poll for new messages (long-poll style)`,
  );
  return source;
};
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const path = process.argv[2];
  await writeFile(path, patchBridge(await readFile(path, 'utf8')));
}
