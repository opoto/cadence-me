importScripts('https://storage.googleapis.com/workbox-cdn/releases/3.6.1/workbox-sw.js');

if (workbox) {

  /* *
  workbox.setConfig({
    debug: true
  });
  workbox.core.setLogLevel(workbox.core.LOG_LEVELS.debug);
  /* */

  workbox.routing.registerRoute(
    new RegExp('/cadence-me/.*'),
    workbox.strategies.networkFirst({
      cacheName: 'cadenceme:local',
    })
  );

  workbox.routing.registerRoute(
    new RegExp('.*'),
    workbox.strategies.staleWhileRevalidate({
      cacheName: 'cadenceme:ext',
    })
  );


} else {
  console.log(`Workbox didn't load 😬`);
}
