import { defineSiteConfig } from "astro-theme-university/types";
import { withBase } from "astro-theme-university/url";
import { slopBranding } from "astro-theme-slop";
import { courseMeta } from "./course-config";

// The underlying collection and URL remain `sessions`; these labels are the
// language students see. Change them to Studios, Tutorials, Expeditions, etc.
export const sessionLabels = {
  singular: "Dailies",
  plural: "Dailies",
} as const;

export const graphCollections = ["sessions", "assessments", "lectures", "people"];

export const courseApiCollections = [
  ...graphCollections.map((key) => ({ key })),
  { key: "policies", dir: "pages/policies" },
];

export const siteConfig = defineSiteConfig({
  ...slopBranding,
  // Short form of courseMeta.title: what fits in a browser tab and a footer
  // credit. The full title and the "Slop University" institution live on the
  // home page.
  name: "Slop Opera",

  links: [
    { text: "Lectures", href: "/lectures/" },
    { text: sessionLabels.plural, href: "/sessions/" },
    { text: "Assessment", href: "/assessments/" },
    { text: "People", href: "/people/" },
    { text: "Policies", href: "/policies/" },
  ],

  licence: "CC-BY-NC-SA-4.0",
  socialImage: "/src/assets/images/card.png",
  socialImageAlt: `A preview card for ${courseMeta.code}: ${courseMeta.title}`,

  // Footer.astro always renders the legal nav's separator ahead of the theme
  // toggle; with no legalLinks it's an orphan "|" with nothing before it.
  // Footer.astro renders legalLinks hrefs as-is (unlike Nav, which resolves
  // its own links through withBase), so resolve the base path here.
  legalLinks: [{ text: "Policies and support", href: withBase("/policies/") }],
});
