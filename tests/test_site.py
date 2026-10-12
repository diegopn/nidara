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
        self.assertIn('Português', language_select.group(1))
        self.assertIn('English', language_select.group(1))
        self.assertIn('Español', language_select.group(1))
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

    def test_source_changes_refresh_an_existing_search(self):
        self.assertRegex(
            self.app,
            r'input\[name="sources"\][\s\S]*?addEventListener\("change"',
            "Changing a source must have an explicit live behavior",
        )
        self.assertIn("form.requestSubmit()", self.app)

    def test_author_and_saved_counts_match_the_visible_scope(self):
        self.assertRegex(self.app, r'selectedAuthor\s*\?\s*t\("authorWorksCount"')
        self.assertIn('pluralMessage("savedCount", items.length)', self.app)

    def test_locale_routes_keep_canonical_language_and_resolve_assets(self):
        for locale in ("en", "es"):
            route = self.site / locale / "index.html"
            self.assertTrue(route.is_file(), f"Missing /{locale}/ route")
            html = route.read_text(encoding="utf-8")
            self.assertIn(f'<html lang="{locale}">', html)
            self.assertIn(f'href="https://diegopn.github.io/nidara/{locale}/"', html)
            self.assertIn('href="../css/style.css"', html)
            self.assertIn('src="../js/app.js"', html)
            self.assertIn('href="../"', html)
            self.assertIn('href="../LICENSE"', html)
            language_nav = re.search(r'<nav\b[^>]*id="language-switcher"[^>]*>(.*?)</nav>', html, re.DOTALL)
            self.assertIsNotNone(language_nav)
            language_links = {target_locale: href for href, target_locale in re.findall(r'<a href="([^"]+)" data-locale="([^"]+)"', language_nav.group(1))}
            expected_links = {"pt-BR": "../", "en": "./" if locale == "en" else "../en/", "es": "./" if locale == "es" else "../es/"}
            self.assertEqual(language_links, expected_links, f"Broken locale switch from /{locale}/")
            for asset in ("../css/style.css", "../js/app.js"):
                self.assertTrue((route.parent / asset).resolve().is_file(), f"Broken {locale} asset: {asset}")

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
                    self.assertTrue((source.parent / module).resolve().is_file(), f"Missing module {module} in {source.relative_to(ROOT)}")

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
