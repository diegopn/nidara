import { searchWorks } from "./providers/openalex.js";
const form = document.querySelector("#search-form");
const list = document.querySelector("#results-list");
const status = document.querySelector("#status");
const title = document.querySelector("#results-title");
const count = document.querySelector("#count");
const more = document.querySelector("#more");
let controller;
let page = 1;
let current = null;
let total = 0;
function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = String(value);
  return node;
}
function resultCard(work) {
  const article = el("article", "result");
  article.append(el("span", "tag", work.provider));
  const heading = el("h3");
  const link = el("a", null, work.title);
  link.href = work.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  heading.append(link);
  article.append(heading);
  const details = [work.authors.join(", "), work.year, work.journal, work.citations + " citações", work.openAccess ? "Acesso aberto" : ""].filter(Boolean).join(" · ");
  article.append(el("p", "meta", details));
  if (work.abstract) article.append(el("p", "abstract", work.abstract + (work.abstract.length >= 520 ? "…" : "")));
  return article;
}
async function run(append = false) {
  if (controller) controller.abort();
  controller = new AbortController();
  const signal = controller.signal;
  if (!append) { page = 1; list.replaceChildren(); total = 0; }
  more.disabled = true;
  more.hidden = true;
  status.textContent = "Consultando OpenAlex…";
  try {
    const result = await searchWorks({ ...current, page, signal });
    if (signal.aborted) return;
    total = result.total;
    list.append(...result.items.map(resultCard));
    title.textContent = "Resultados para “" + current.query + "”";
    count.textContent = new Intl.NumberFormat("pt-BR").format(total) + " registros";
    status.textContent = result.items.length ? "Fonte: OpenAlex · Dados atualizados pela API no momento da consulta." : "Nenhum resultado encontrado. Experimente outros termos.";
    more.hidden = list.children.length >= total || result.items.length === 0;
  } catch (error) {
    if (signal.aborted) return;
    status.textContent = "Não foi possível consultar a fonte agora. " + (error instanceof TypeError ? "Verifique a conexão ou tente novamente." : error.message);
    more.hidden = list.children.length === 0;
  } finally { if (!signal.aborted) more.disabled = false; }
}
form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  current = { query: String(data.get("q")).trim(), year: String(data.get("year") || ""), sort: String(data.get("sort")) };
  if (current.query.length < 2) return;
  const url = new URL(location.href);
  url.searchParams.set("q", current.query);
  history.replaceState(null, "", url);
  run();
});
more.addEventListener("click", () => { page += 1; run(true); });
const initialQuery = new URL(location.href).searchParams.get("q");
if (initialQuery) { document.querySelector("#query").value = initialQuery; form.requestSubmit(); }