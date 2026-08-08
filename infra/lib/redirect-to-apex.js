/**
 * CloudFront viewer-request function: 301 any `www.` host to the apex, so the
 * site has exactly one canonical origin.
 *
 * This is an auth fix as much as a tidiness one. `www` and the apex are
 * separate browser origins and so keep separate localStorage, which is where
 * the OIDC session lives — serving the app from both meant signing in once per
 * host, with nothing on screen to explain why.
 *
 * The query string has to survive the redirect: App.tsx persists the whole view
 * in it (preset or date range, expanded player keys, open details, view and
 * kind tabs), so dropping it would turn every shared `www` link into a bare
 * homepage on today's date.
 *
 * The apex is derived from the Host header rather than hardcoded, so this keeps
 * working if the domain ever changes.
 */
function handler(event) {
  var request = event.request;
  var host = request.headers.host && request.headers.host.value;

  if (!host || host.indexOf('www.') !== 0) return request;

  var query = '';
  for (var name in request.querystring) {
    var param = request.querystring[name];
    // A repeated key arrives as multiValue, where the flat .value is only the
    // first of them — `expanded` is routinely repeated.
    var values = param.multiValue || [param];
    for (var i = 0; i < values.length; i++) {
      query += query ? '&' : '?';
      query += encodeURIComponent(name);
      // CloudFront hands these over decoded, so they need re-encoding on the
      // way back out. A valueless param (`?sim`) stays bare.
      if (values[i].value !== '') query += '=' + encodeURIComponent(values[i].value);
    }
  }

  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: { value: 'https://' + host.slice(4) + request.uri + query },
      // Permanent, but not cached so hard that a mistake here is unfixable.
      'cache-control': { value: 'max-age=3600' },
    },
  };
}
