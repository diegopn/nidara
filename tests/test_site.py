import json
import re
import subprocess
import sys
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]


class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.local_assets = []
        self.external_links = []
        self.labels_for = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "label" and "for" in attrs:
            self.labels_for.append(attrs["for"])
        for attribute in ("href", "src"):
            value = attrs.get(attribute, "")
            parsed = urlsplit(value)
            if not value or parsed.scheme or parsed.netloc or value.startswith("#"):
                if parsed.scheme == "https":
                    self.external_links.append(value)
                continue
            self.local_assets.append(value)


class SiteIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, str(ROOT / "scripts/build_site.py"), "--output", str(ROOT / "dist")], check=True)
        cls.site = ROOT / "dist"
        cls.html = (cls.site / "index.html").read_text(encoding="utf-8")
        cls.app = (ROOT / "js/app.js").read_text(encoding="utf-8")
        cls.parser = SiteParser()
        cls.parser.feed(cls.html)

    def test_document_ids_are_unique_and_app_selectors_exist(self):
        self.assertEqual(len(self.parser.ids), len(set(self.parser.ids)), "HTML IDs must be unique")
        app_ids = set(re.findall(r'querySelector(?:All)?\(["\']#([\w-]+)', self.app))
        self.assertTrue(app_ids)
        self.assertFalse(app_ids - set(self.parser.ids), f"Missing app elements: {sorted(app_ids - set(self.parser.ids))}")

    def test_hidden_controls_remain_hidden_when_component_styles_set_display(self):
        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        self.assertRegex(css, r"\[hidden\]\s*\{[^}]*display:\s*none\s*!important")

    def test_labeled_controls_have_matching_ids(self):
        self.assertFalse(set(self.parser.labels_for) - set(self.parser.ids))

    def test_site_defaults_to_portuguese_and_translates_every_message(self):
        language_select = re.search(r'<nav\b[^>]*id="language-switcher"[^>]*>(.*?)</nav>', self.html, re.DOTALL)
        self.assertIsNotNone(language_select, "The site needs a clear, accessible language navigation")
        languages = re.findall(r'data-locale="([^"]+)"', language_select.group(1))
        self.assertEqual(languages, ["pt-BR", "en", "es"])
        self.assertIn('aria-current="page"', language_select.group(1))
        self.assertEqual(
            {locale: href for href, locale in re.findall(r'<a href="([^"]+)" data-locale="([^"]+)"', language_select.group(1))},
            {"pt-BR": "./", "en": "./en/", "es": "./es/"},
        )
        self.assertEqual(re.findall(r'<a\b[^>]*data-locale="[^"]+"[^>]*>(.*?)</a>', language_select.group(1)), ["PT", "EN", "ES"])
        self.assertRegex(self.html, r'<html\s+lang="pt-BR">')

        messages = json.loads((self.site / "js/core/translations.json").read_text(encoding="utf-8"))
        self.assertEqual(set(messages), {"pt-BR", "en", "es"})
        keys = [set(locale_messages) for locale_messages in messages.values()]
        self.assertTrue(keys[0])
        self.assertTrue(all(locale_keys == keys[0] for locale_keys in keys[1:]), "Every message must be translated in all three languages")
        self.assertTrue(all(isinstance(value, str) and value for locale_messages in messages.values() for value in locale_messages.values()))
        referenced_keys = set(re.findall(r'data-i18n(?:-placeholder|-aria-label)?="([\w-]+)"', self.html))
        for source in (self.site / "js").rglob("*.js"):
            code = source.read_text(encoding="utf-8")
            referenced_keys.update(re.findall(r'\bt\("([\w-]+)"', code))
        plural_keys = {suffix for base in ("savedCount", "citationCount", "authorWorkCount") for suffix in (base + "One", base + "Other")}
        self.assertFalse((referenced_keys | plural_keys) - keys[0], f"Missing translation messages: {sorted((referenced_keys | plural_keys) - keys[0])}")

    def test_search_results_are_split_into_publications_authors_and_datasets(self):
        for element_id in ("publications-tab", "authors-tab", "datasets-tab", "authors-scope", "results-list"):
            self.assertIn(f'id="{element_id}"', self.html, f"Missing result area {element_id}")
        self.assertIn('role="tablist"', self.html)
        self.assertIn('data-view="authors"', self.html)
        self.assertIn('data-view="datasets"', self.html)
        self.assertIn('data-i18n="authorScope"', self.html)

    def test_reference_dialog_contains_list_and_export_controls(self):
        listing_toolbar = re.search(r'<div class="listing-toolbar" id="listing-toolbar">([\s\S]*?)</div>\s*<p id="view-note"', self.html)
        self.assertIsNotNone(listing_toolbar)
        toolbar = listing_toolbar.group(1)
        self.assertIn('id="sort"', toolbar)
        self.assertNotIn('id="export-button"', toolbar)
        self.assertNotIn('class="listing-export"', toolbar)
        dialog = re.search(r'<dialog\b(?=[^>]*id="references-dialog")([\s\S]*?)</dialog>', self.html)
        self.assertIsNotNone(dialog, "The saved-reference control must open a native modal dialog")
        self.assertIn('id="references-dialog-title"', dialog.group(1))
        self.assertIn('id="references-list"', dialog.group(1))
        self.assertIn('id="references-empty"', dialog.group(1))
        self.assertIn('id="export-button"', dialog.group(1))
        self.assertIn('class="export-button"', dialog.group(1))
        self.assertNotIn('id="reference-list-tools"', self.html)

        messages = json.loads((self.site / "js/core/translations.json").read_text(encoding="utf-8"))
        self.assertEqual({locale: values["exportSelected"] for locale, values in messages.items()}, {
            "pt-BR": "Exportar lista",
            "en": "Export list",
            "es": "Exportar lista",
        })

    def test_reference_list_uses_a_bookmark_and_exports_the_entire_selection(self):
        self.assertIn('data-i18n="selectionCart"', self.html)
        self.assertIn('id="saved-toggle"', self.html)
        self.assertIn('id="saved-count"', self.html)
        self.assertIn('class="bookmark-icon"', self.html)
        self.assertIn('aria-haspopup="dialog"', self.html)
        self.assertIn('aria-controls="references-dialog"', self.html)
        self.assertIn('data-i18n="exportSelected"', self.html)
        self.assertIn('id="export-count"', self.html)
        self.assertRegex(self.app, r'exportButton\.disabled\s*=\s*favorites\.size\s*===\s*0')
        self.assertIn("referencesDialog.showModal()", self.app)
        self.assertIn("renderSavedReferences()", self.app)
        self.assertRegex(
            self.app,
            r'exportWorks\(\[\.\.\.favorites\.values\(\)\],\s*exportFormat\.value',
        )
        self.assertNotRegex(self.app, r'exportWorks\(visibleWorks\(')
        self.assertIn('localStorage.setItem(FAVORITES_KEY', self.app)
        self.assertNotIn("favorites.clear()", self.app)

        submit_handler = re.search(r'form\.addEventListener\("submit", event => \{([\s\S]*?)\n\}\);', self.app)
        self.assertIsNotNone(submit_handler)
        self.assertNotIn("favorites =", submit_handler.group(1))
        self.assertNotIn("persistFavorites", submit_handler.group(1))

        messages = json.loads((self.site / "js/core/translations.json").read_text(encoding="utf-8"))
        self.assertEqual({locale: values["selectionCart"] for locale, values in messages.items()}, {
            "pt-BR": "Lista de referências",
            "en": "Reference list",
            "es": "Lista de referencias",
        })

    def test_result_cards_are_compact_and_add_references_at_the_bottom(self):
        card = re.search(r"function resultCard\(work\) \{([\s\S]*?)\n\}\n\nfunction toggleFavorite", self.app)
        self.assertIsNotNone(card)
        self.assertNotIn("work.abstract", card.group(1))
        self.assertNotIn('t("fieldAbstract")', card.group(1))
        self.assertNotIn("headingRow.append(save)", card.group(1))
        self.assertIn("actions.append(save)", card.group(1))
        self.assertGreater(card.group(1).index("article.append(actions)"), card.group(1).index("actions.append(save)"))

        messages = json.loads((self.site / "js/core/translations.json").read_text(encoding="utf-8"))
        self.assertNotIn("fieldAbstract", messages["pt-BR"])
        self.assertEqual({locale: values["addToCart"] for locale, values in messages.items()}, {
            "pt-BR": "Adicionar referência à lista",
            "en": "Add reference to list",
            "es": "Añadir referencia a la lista",
        })

    def test_h1_and_h2_use_semibold_weight(self):
        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        heading_rule = re.search(r"h1, h2\s*\{([^}]*)\}", css)
        self.assertIsNotNone(heading_rule)
        self.assertRegex(heading_rule.group(1), r"font-weight:\s*600")
        hero_heading = re.search(r"\.hero h1\s*\{([^}]*)\}", css)
        self.assertIsNotNone(hero_heading)
        self.assertRegex(hero_heading.group(1), r"font-weight:\s*600")

    def test_mobile_reference_dialog_export_format_keeps_its_full_label_visible(self):
        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        mobile = css.split("@media (max-width: 760px)", 1)[1].split("@media (max-width: 390px)", 1)[0]
        format_control = re.search(r"\.references-dialog #export-format\s*\{([^}]*)\}", mobile)
        self.assertIsNotNone(format_control)
        self.assertRegex(format_control.group(1), r"min-width:\s*88px")

    def test_search_uses_default_sources_and_sorting_is_in_results(self):
        search_form = re.search(r'<form\b[^>]*id="search-form"[^>]*>(.*?)</form>', self.html, re.DOTALL)
        self.assertIsNotNone(search_form)
        self.assertNotIn('name="sources"', search_form.group(1))
        self.assertNotIn('id="sort"', search_form.group(1))
        self.assertLess(self.html.index('id="result-tabs"'), self.html.index('id="sort"'))
        self.assertLess(self.html.index('id="sort"'), self.html.index('id="view-note"'))
        self.assertIn('const DEFAULT_SOURCES = ["openalex", "crossref"]', self.app)
        self.assertRegex(self.app, r'sortSelect\.addEventListener\("change"[\s\S]{0,220}form\.requestSubmit\(\)')

    def test_mobile_search_button_follows_the_year_fields(self):
        search_form = re.search(r'<form\b[^>]*id="search-form"[^>]*>(.*?)</form>', self.html, re.DOTALL)
        self.assertIsNotNone(search_form)
        self.assertGreater(search_form.group(1).index('id="search-button"'), search_form.group(1).index("</fieldset>"))

        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        mobile = css.split("@media (max-width: 760px)", 1)[1].split("@media (max-width: 390px)", 1)[0]
        form_style = re.search(r"#search-form\s*\{([^}]*)\}", mobile)
        self.assertIsNotNone(form_style)
        self.assertRegex(form_style.group(1), r"grid-template-columns:\s*minmax\(0,\s*1fr\)")
        button_style = re.search(r"#search-button\s*\{([^}]*)\}", mobile)
        self.assertIsNotNone(button_style)
        self.assertRegex(button_style.group(1), r"width:\s*100%")

    def test_provider_years_stay_within_the_supported_publication_range(self):
        utilities = (ROOT / "js/core/work-utils.js").read_text(encoding="utf-8")
        self.assertRegex(utilities, r'export function normalizePublicationYear\([\s\S]*?year >= 1900 && year <= 2100')
        for provider in ("crossref", "openalex"):
            source = (ROOT / f"js/providers/{provider}.js").read_text(encoding="utf-8")
            self.assertIn("normalizePublicationYear", source, f"{provider} years must use shared validation")

    def test_brand_icon_is_used_as_site_icon_and_header_mark(self):
        self.assertRegex(self.html, r'rel="icon" type="image/svg\+xml" href="\./assets/nidara-mark\.svg\?v=[a-f0-9]{12}"')
        self.assertRegex(self.html, r'class="brand-mark" src="\./assets/nidara-mark\.svg\?v=[a-f0-9]{12}"')
        icon = self.site / "assets/nidara-mark.svg"
        self.assertTrue(icon.is_file())
        self.assertIn('viewBox="0 0 64 64"', icon.read_text(encoding="utf-8"))
        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        self.assertIn("--page-surface: #fbfaf7", css)
        self.assertIn("--accent: #426b62", css)

    def test_footer_places_the_project_mark_left_and_creator_link_right(self):
        footer = re.search(r"<footer>([\s\S]*?)</footer>", self.html)
        self.assertIsNotNone(footer)
        self.assertRegex(footer.group(1), r'<div class="footer-brand">\s*<img class="footer-mark" src="\./assets/nidara-mark\.svg\?v=[a-f0-9]{12}" alt="">\s*<strong>Nidara</strong>\s*</div>')
        self.assertRegex(footer.group(1), r'<a\b(?=[^>]*href="https://diegopn\.github\.io/")[^>]*>Diego Pereira</a>')
        self.assertLess(footer.group(1).index('class="footer-brand"'), footer.group(1).index('class="footer-author"'))
        self.assertNotIn('class="footer-links"', footer.group(1))

        messages = json.loads((self.site / "js/core/translations.json").read_text(encoding="utf-8"))
        for values in messages.values():
            self.assertFalse({"createdBy", "repository", "license"} & set(values))

        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        desktop_footer = re.search(r"\.footer-inner\s*\{([^}]*)\}", css)
        self.assertIsNotNone(desktop_footer)
        self.assertIn("justify-content: space-between", desktop_footer.group(1))
        mobile = css.split("@media (max-width: 760px)", 1)[1].split("@media (max-width: 390px)", 1)[0]
        mobile_footer = re.search(r"\.footer-inner\s*\{([^}]*)\}", mobile)
        self.assertIsNotNone(mobile_footer)
        self.assertIn("align-items: center", mobile_footer.group(1))
        self.assertIn("flex-direction: column", mobile_footer.group(1))

    def test_hero_and_search_filters_share_one_section_with_clear_headline(self):
        hero = re.search(r'<section class="hero"[\s\S]*?</section>', self.html)
        self.assertIsNotNone(hero)
        self.assertIn('id="search-form"', hero.group(0))
        self.assertNotIn('<section class="search-area"', self.html)
        messages = json.loads((ROOT / "js/core/translations.json").read_text(encoding="utf-8"))
        self.assertEqual(
            {locale: values["heroTitle"] for locale, values in messages.items()},
            {
                "pt-BR": "Encontre conhecimento científico aberto.",
                "en": "Find open scientific knowledge.",
                "es": "Encuentra conocimiento científico abierto.",
            },
        )

    def test_dark_theme_uses_soft_slate_colors_instead_of_green_surfaces(self):
        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        self.assertIn("--page-surface: #171b24", css)
        self.assertIn("--hero-surface: #1e2430", css)
        self.assertIn("--research-surface: #272e3b", css)
        self.assertNotIn("--page-surface: #18221f", css)
        self.assertNotIn("--research-surface: #202e29", css)

        dark = re.search(r':root\[data-theme="dark"\]\s*\{([^}]*)\}', css)
        self.assertIsNotNone(dark)
        self.assertIn("--button-bg: #426b62", dark.group(1))
        self.assertIn("--button-text: #ffffff", dark.group(1))
        self.assertIn("--button-hover: #527d72", dark.group(1))

    def test_hero_heading_uses_amiri(self):
        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        hero_heading = re.search(r"\.hero h1\s*\{([^}]*)\}", css)
        self.assertIsNotNone(hero_heading)
        self.assertRegex(hero_heading.group(1), r"font-family:\s*var\(--serif\)")
        self.assertIn('--serif: "Amiri", Georgia, serif', css)

    def test_mobile_header_actions_stay_on_the_brand_row(self):
        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        mobile = css.split("@media (max-width: 760px)", 1)[1].split("@media (max-width: 390px)", 1)[0]
        topbar = re.search(r"\.topbar\s*\{([^}]*)\}", mobile)
        actions = re.search(r"\.header-actions\s*\{([^}]*)\}", mobile)
        self.assertIsNotNone(topbar)
        self.assertIsNotNone(actions)
        self.assertIn("flex-wrap: nowrap", topbar.group(1))
        self.assertNotIn("100%", actions.group(1))

    def test_mobile_sections_have_eighty_pixel_vertical_padding(self):
        css = (ROOT / "css/style.css").read_text(encoding="utf-8")
        mobile = css.split("@media (max-width: 760px)", 1)[1].split("@media (max-width: 390px)", 1)[0]
        for selector in (r"\.hero", r"\.results"):
            rules = re.search(selector + r"\s*\{([^}]*)\}", mobile)
            self.assertIsNotNone(rules)
            self.assertRegex(rules.group(1), r"padding-block:\s*80px")

        hero_content = re.search(r"\.hero > \.content-width\s*\{([^}]*)\}", mobile)
        hero_copy = re.search(r"\.hero-inner\s*\{([^}]*)\}", mobile)
        hero_search = re.search(r"\.search-area\s*\{([^}]*)\}", mobile)
        self.assertIsNotNone(hero_content)
        self.assertIn("gap: 24px", hero_content.group(1))
        self.assertIsNotNone(hero_copy)
        self.assertIn("padding-block: 0", hero_copy.group(1))
        self.assertIsNotNone(hero_search)
        self.assertIn("padding-block: 0", hero_search.group(1))

    def test_author_and_saved_counts_match_the_visible_scope(self):
        self.assertRegex(self.app, r'selectedAuthor\s*\?\s*t\("authorWorksCount"')
        saved_references = re.search(r"function renderSavedReferences\(\) \{([\s\S]*?)\n\}", self.app)
        self.assertIsNotNone(saved_references)
        self.assertIn('pluralMessage("savedCount", works.length)', saved_references.group(1))
        self.assertIn('[...favorites.values()]', saved_references.group(1))

    def test_locale_routes_keep_canonical_language_and_resolve_assets(self):
        for locale in ("en", "es"):
            route = self.site / locale / "index.html"
            self.assertTrue(route.is_file(), f"Missing /{locale}/ route")
            html = route.read_text(encoding="utf-8")
            self.assertIn(f'<html lang="{locale}">', html)
            self.assertIn(f'href="https://diegopn.github.io/nidara/{locale}/"', html)
            self.assertRegex(html, r'href="\.\./css/style\.css\?v=[a-f0-9]{12}"')
            self.assertRegex(html, r'src="\.\./js/app\.js\?v=[a-f0-9]{12}"')
            self.assertRegex(html, r'href="\.\./assets/nidara-mark\.svg\?v=[a-f0-9]{12}"')
            self.assertRegex(html, r'src="\.\./assets/nidara-mark\.svg\?v=[a-f0-9]{12}"')
            self.assertIn('href="../"', html)
            self.assertEqual(len(re.findall(r'src="\.\./assets/nidara-mark\.svg\?v=[a-f0-9]{12}"', html)), 2)
            language_nav = re.search(r'<nav\b[^>]*id="language-switcher"[^>]*>(.*?)</nav>', html, re.DOTALL)
            self.assertIsNotNone(language_nav)
            language_links = {target_locale: href for href, target_locale in re.findall(r'<a href="([^"]+)" data-locale="([^"]+)"', language_nav.group(1))}
            expected_links = {"pt-BR": "../", "en": "./" if locale == "en" else "../en/", "es": "./" if locale == "es" else "../es/"}
            self.assertEqual(language_links, expected_links, f"Broken locale switch from /{locale}/")
            for asset in ("../css/style.css", "../js/app.js", "../assets/nidara-mark.svg"):
                self.assertTrue((route.parent / asset).resolve().is_file(), f"Broken {locale} asset: {asset}")

    def test_generated_pages_and_module_imports_share_a_build_version(self):
        script = re.search(r'<script type="module" src="\./js/app\.js\?v=([a-f0-9]{12})">', self.html)
        stylesheet = re.search(r'<link rel="stylesheet" href="\./css/style\.css\?v=([a-f0-9]{12})">', self.html)
        self.assertIsNotNone(script, "The generated page must refresh cached JavaScript after a deployment")
        self.assertIsNotNone(stylesheet, "The generated page must refresh cached styles after a deployment")
        version = script.group(1)
        self.assertEqual(stylesheet.group(1), version)

        for locale in ("en", "es"):
            html = (self.site / locale / "index.html").read_text(encoding="utf-8")
            self.assertIn(f'src="../js/app.js?v={version}"', html)
            self.assertIn(f'href="../css/style.css?v={version}"', html)

        for source in (self.site / "js").rglob("*.js"):
            imports = re.findall(r'\b(?:from|import)\s*["\']((?:\.\.?/)[^"\']+)["\']', source.read_text(encoding="utf-8"))
            for specifier in imports:
                self.assertEqual(urlsplit(specifier).query, f"v={version}", f"Unversioned module import in {source.name}: {specifier}")

    def test_distributed_license_requires_the_project_notice(self):
        license_text = (self.site / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("PolyForm Noncommercial License 1.0.0", license_text)
        self.assertIn("https://polyformproject.org/licenses/noncommercial/1.0.0", license_text)
        self.assertIn("Required Notice: Copyright Diego Pereira do Nascimento (https://github.com/diegopn/nidara)", license_text)

    def test_local_assets_and_module_imports_exist(self):
        for asset in self.parser.local_assets:
            path = (self.site / urlsplit(asset).path).resolve()
            self.assertTrue(path.is_relative_to(ROOT), f"Asset escapes repository: {asset}")
            if path.is_dir():
                path = path / "index.html"
            self.assertTrue(path.is_file(), f"Missing local asset: {asset}")

        for source in (self.site / "js").rglob("*.js"):
            code = source.read_text(encoding="utf-8")
            imports = re.findall(r'(?:from\s*|import\s*)["\']([^"\']+\.js)["\']', code)
            imports.extend(re.findall(r'import\s+[^;]+?\s+from\s+["\']([^"\']+\.json)["\']', code))
            for module in imports:
                if module.startswith("."):
                    self.assertTrue((source.parent / urlsplit(module).path).resolve().is_file(), f"Missing module {module} in {source.relative_to(ROOT)}")

    def test_rendering_uses_text_apis_for_external_metadata(self):
        sources = [path.read_text(encoding="utf-8") for path in (ROOT / "js").rglob("*.js")]
        code = "\n".join(sources)
        for unsafe in ("innerHTML", "outerHTML", "insertAdjacentHTML", "document.write(", "eval(", "new Function("):
            self.assertNotIn(unsafe, code, f"Avoid unsafe HTML/code sink: {unsafe}")

    def test_actions_verifies_before_deploying_on_every_main_push(self):
        workflow = (ROOT / ".github/workflows/pages.yml").read_text(encoding="utf-8")
        self.assertRegex(workflow, r"(?m)^\s*push:\s*$")
        self.assertRegex(workflow, r"(?m)^\s*branches:\s*\[main\]")
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("verify:", workflow)
        self.assertIn("needs: verify", workflow)
        self.assertIn("actions/upload-pages-artifact@v3", workflow)
        self.assertIn("actions/deploy-pages@v4", workflow)
        self.assertIn("scripts/build_site.py --output dist", workflow)
        self.assertIn("path: dist", workflow)


if __name__ == "__main__":
    unittest.main()
