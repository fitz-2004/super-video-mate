// postMessage channel between the sidebar iframe and content.js on youtube.com.
const PARENT_ORIGIN = 'https://www.youtube.com';

export function send(type, payload = {}) {
  window.parent.postMessage({ svm: 1, type, ...payload }, PARENT_ORIGIN);
}

export function listen(handler) {
  const fn = (e) => {
    if (e.origin !== PARENT_ORIGIN || e.source !== window.parent || !e.data?.svm) return;
    handler(e.data);
  };
  window.addEventListener('message', fn);
  return () => window.removeEventListener('message', fn);
}
