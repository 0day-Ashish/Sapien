import { SITE_URL } from "@/lib/site";

// /.well-known/api-catalog (RFC 9727): where to find this site's API and its description.
export function GET() {
  const body = {
    linkset: [
      {
        anchor: `${SITE_URL}/api/v1`,
        "service-desc": [{ href: `${SITE_URL}/openapi.json`, type: "application/openapi+json" }],
        "service-doc": [{ href: `${SITE_URL}/llms.txt`, type: "text/plain" }],
      },
    ],
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"', "access-control-allow-origin": "*" },
  });
}
