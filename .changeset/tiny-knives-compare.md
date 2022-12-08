---
"wrangler": minor
---

feat: support bundling the raw Pages `_worker.js` before deploying

Previously, if you provided a `_worker.js` file, then Pages would simply deploy
it without doing any processing on the file. Apart from preventing such files from
containing imports to other JS files, this also prevents us from benefitting from
Wrangler shims such as the one for the D1 alpha release.

This change adds the ability to tell Wrangler to pass the `_worker.js` through the
normal Wrangler bundling process before deploying by setting the `--bundle-worker`
command line argument to `wrangler pages dev` and `wrangler pages publish`. For
backward compatibility this flag defaults to `false` if not provided.
