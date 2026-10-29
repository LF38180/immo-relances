// Cache hors ligne de l'application.
//
// Le nom du cache porte une version : sans elle, l'ancien cache n'était jamais
// supprimé et resservait indéfiniment des fichiers périmés — un agent pouvait
// travailler des jours sur une version corrigée depuis longtemps, sans aucun
// moyen de s'en apercevoir. À incrémenter à chaque livraison qui change le
// comportement de l'application.
const CACHE_NAME = 'immo-relances-v9';

self.addEventListener('install', () => {
  // Pas de pré-chargement : l'index mis en cache à l'installation fige les
  // références vers les fichiers de cette version-là. On laisse le réseau
  // remplir le cache au fil des visites.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // L'API n'est jamais mise en cache.
  if (url.pathname.startsWith('/api/')) return;

  // La page elle-même vient toujours du réseau quand il répond : c'est elle
  // qui désigne les fichiers à charger, et une version figée en cache renvoie
  // vers des fichiers qui n'existent plus. Le cache ne sert qu'en secours,
  // hors ligne.
  const estLaPage = event.request.mode === 'navigate'
    || url.pathname === '/' || url.pathname.endsWith('.html');

  if (estLaPage) {
    event.respondWith(
      fetch(event.request)
        .then(reponse => {
          if (reponse.ok) {
            const copie = reponse.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copie));
          }
          return reponse;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('/')))
    );
    return;
  }

  // Les fichiers versionnés (leur nom contient une empreinte) ne changent
  // jamais de contenu : le cache d'abord, c'est plus rapide et c'est sûr.
  event.respondWith(
    caches.match(event.request).then(enCache => enCache || fetch(event.request)
      .then(reponse => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copie));
        }
        return reponse;
      }))
  );
});
