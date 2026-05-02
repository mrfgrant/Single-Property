import { PAGE_TITLE, PAGE_DESCRIPTION } from "./copy";

function setMeta(selector: string, value: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) {
    el.setAttribute("content", value);
  }
}

export function applySeoFromCopy() {
  document.title = PAGE_TITLE;

  setMeta('meta[name="description"]', PAGE_DESCRIPTION);

  setMeta('meta[property="og:title"]', PAGE_TITLE);
  setMeta('meta[property="og:description"]', PAGE_DESCRIPTION);

  setMeta('meta[name="twitter:title"]', PAGE_TITLE);
  setMeta('meta[name="twitter:description"]', PAGE_DESCRIPTION);
}
