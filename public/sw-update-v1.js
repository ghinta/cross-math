// Also refresh clients running early releases that have no working update UI.
const replacesPreviousWorker = !!self.registration.active;
self.addEventListener('activate', event => {
  if (!replacesPreviousWorker) return;
  event.waitUntil((async () => {
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.filter(client => client.url.startsWith(self.registration.scope)).map(async client => {
      // Current clients flush their saves. Old clients already keep a synchronous
      // backup on every move; the grace period lets pending render effects finish.
      const saved = await new Promise(resolve => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => { channel.port1.close(); resolve(true); }, 1500);
        channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data === 'saved'); };
        client.postMessage({ type: 'PWA_UPDATE_PREPARE' }, [channel.port2]);
      });
      if (!saved) return;
      // Do not await navigation in activate: its fetches wait for activation.
      void client.navigate(client.url).catch(() => {});
    }));
  })());
});
