#!/usr/bin/env python3
"""Build the static root, English, and Spanish routes from one page template."""

import argparse
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
CANONICAL = re.compile(r'(<link rel="canonical" href=")[^"]+(">)')


def build_site(output: Path) -> None:
    output = output.expanduser().resolve()
    if output != (ROOT / "dist").resolve():
        raise ValueError("The output directory must be the repository's dist directory.")
    source = (ROOT / "index.html").read_text(encoding="utf-8")
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
    shutil.copy2(ROOT / "LICENSE", output / "LICENSE")

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
            page = page.replace('src="./js/app.js"', 'src="../js/app.js"', 1)
            page = page.replace('href="./LICENSE"', 'href="../LICENSE"', 1)
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
