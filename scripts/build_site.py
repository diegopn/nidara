#!/usr/bin/env python3
"""Build the static root, English, and Spanish routes from one page template."""

import argparse
import hashlib
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
CANONICAL = re.compile(r'(<link rel="canonical" href=")[^"]+(">)')
MODULE_IMPORT = re.compile(r'(?P<prefix>\b(?:from|import)\s*)(?P<quote>["\'])(?P<specifier>(?:\.\.?/)[^"\']+)(?P=quote)')


def build_version(source: str) -> str:
    digest = hashlib.sha256(source.encode("utf-8"))
    digest.update((ROOT / "scripts/build_site.py").read_bytes())
    for directory in ("assets", "css", "js"):
        for path in sorted((ROOT / directory).rglob("*")):
            if not path.is_file():
                continue
            digest.update(path.relative_to(ROOT).as_posix().encode("utf-8"))
            digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


def version_module_imports(source: str, version: str) -> str:
    def version_import(match: re.Match) -> str:
        specifier = match.group("specifier")
        separator = "&" if "?" in specifier else "?"
        return f'{match.group("prefix")}{match.group("quote")}{specifier}{separator}v={version}{match.group("quote")}'

    return MODULE_IMPORT.sub(version_import, source)


def build_site(output: Path) -> None:
    output = output.expanduser().resolve()
    if output != (ROOT / "dist").resolve():
        raise ValueError("The output directory must be the repository's dist directory.")
    source = (ROOT / "index.html").read_text(encoding="utf-8")
    version = build_version(source)
    canonical_match = CANONICAL.search(source)
    if not canonical_match:
        raise ValueError("The source page needs a canonical URL.")
    base_path = urlsplit(canonical_match.group(0).split('href="', 1)[1].split('"', 1)[0]).path
    if not base_path.endswith("/"):
        base_path += "/"

    if output.exists():
        shutil.rmtree(output)
    (output / "css").mkdir(parents=True)
    shutil.copytree(ROOT / "css", output / "css", dirs_exist_ok=True)
    shutil.copytree(ROOT / "js", output / "js", dirs_exist_ok=True)
    shutil.copytree(ROOT / "assets", output / "assets", dirs_exist_ok=True)
    shutil.copy2(ROOT / "LICENSE", output / "LICENSE")
    for module in (output / "js").rglob("*.js"):
        module.write_text(version_module_imports(module.read_text(encoding="utf-8"), version), encoding="utf-8")

    for locale in ("pt-BR", "en", "es"):
        page = source.replace('<html lang="pt-BR">', f'<html lang="{locale}">', 1)
        locale_path = "" if locale == "pt-BR" else locale.lower() + "/"
        page = CANONICAL.sub(rf'\1https://diegopn.github.io{base_path}{locale_path}\2', page, count=1)
        for target in ("pt-BR", "en", "es"):
            if target == locale:
                relative_path = "./"
            elif locale == "pt-BR":
                relative_path = f"./{target.lower()}/"
            else:
                relative_path = "../" if target == "pt-BR" else f"../{target.lower()}/"
            source_path = "./" if target == "pt-BR" else f"./{target.lower()}/"
            page = page.replace(
                f'href="{source_path}" data-locale="{target}"',
                f'href="{relative_path}" data-locale="{target}"',
                1,
            )
        if locale != "pt-BR":
            page = page.replace('<a class="brand" href="./"', '<a class="brand" href="../"', 1)
            page = page.replace('href="./css/style.css"', 'href="../css/style.css"', 1)
            page = page.replace('href="./assets/nidara-mark.svg"', 'href="../assets/nidara-mark.svg"', 1)
            page = page.replace('src="./assets/nidara-mark.svg"', 'src="../assets/nidara-mark.svg"')
            page = page.replace('src="./js/app.js"', 'src="../js/app.js"', 1)
        asset_root = "./" if locale == "pt-BR" else "../"
        for attribute, asset in (
            ("href", "css/style.css"),
            ("src", "js/app.js"),
            ("href", "assets/nidara-mark.svg"),
            ("src", "assets/nidara-mark.svg"),
        ):
            path = f"{asset_root}{asset}"
            page = page.replace(f'{attribute}="{path}"', f'{attribute}="{path}?v={version}"')
        if locale != "pt-BR":
            route = output / locale.lower()
            route.mkdir(parents=True)
            (route / "index.html").write_text(page, encoding="utf-8")
        else:
            (output / "index.html").write_text(page, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist", help="directory for the deployable static site")
    args = parser.parse_args()
    build_site(args.output)


if __name__ == "__main__":
    main()
