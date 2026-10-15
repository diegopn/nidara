export function publicationTypeFilterVisible(view) {
  return view === "publications";
}

export function searchTypeForView(view, publicationType) {
  if (view === "datasets") return "dataset";
  if (view === "authors") return "all";
  return publicationType;
}
