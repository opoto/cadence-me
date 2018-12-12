importScripts('https://storage.googleapis.com/workbox-cdn/releases/3.6.1/workbox-sw.js');

if (workbox) {
  workbox.routing.registerRoute(
    /index\.html/,
    // https://developers.google.com/web/tools/workbox/reference-docs/latest/workbox.strategies
    workbox.strategies.networkFirst({
      cacheName: 'cadenceme:html',
    })
  );

  workbox.routing.registerRoute(
    /\//,
    // https://developers.google.com/web/tools/workbox/reference-docs/latest/workbox.strategies
    workbox.strategies.networkFirst({
      cacheName: 'cadenceme:html',
    })
  );

  workbox.routing.registerRoute(
    new RegExp('.*\.js'),
    workbox.strategies.networkFirst({
      cacheName: 'cadenceme:js',
    })
  );

  workbox.routing.registerRoute(
    // Cache CSS files
    /.*\.(?:css|png|ico)/,
    // Use cache but update in the background ASAP
    workbox.strategies.staleWhileRevalidate({
      // Use a custom cache name
      cacheName: 'cadenceme:css',
    })
  );

} else {
  console.log(`Workbox didn't load 😬`);
}
