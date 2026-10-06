// The Worker's entry: headcount's edge wrapper around the static assets.
// headcount (David's own analytics) counts likely-human visits; the wrapper
// adds one same-origin script tag to HTML pages, stores nothing on the
// device, and on any error serves the page untouched. Only the paths in
// wrangler.jsonc's run_worker_first reach this file; everything else is
// served straight from public/.
import { withHeadcount } from './headcount.js';

export default withHeadcount({ fetch: (request, env) => env.ASSETS.fetch(request) }, { site: 'chartrank.app' });
