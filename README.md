# Nidara

**Explore. Conecte. Descubra.**

Nidara é uma plataforma aberta e multidisciplinar de descoberta científica. O nome é provisório.

## Estado atual

Protótipo funcional: busca de publicações na API do OpenAlex, filtro por ano, ordenação, paginação e links para os trabalhos. Outras fontes ainda não estão integradas.

## Arquitetura

- HTML5, CSS3 e JavaScript nativo (ES Modules), sem Node.js ou framework.
- GitHub Pages para hospedagem estática.
- Conectores independentes em `js/providers/`.
- Python + GitHub Actions para processamento periódico futuro.
- IndexedDB, deduplicação, exportação, datasets, repositórios e análises: planejados, ainda não implementados.

## Desenvolvimento local

Execute `python3 -m http.server 8000` e abra http://localhost:8000. A abertura por `file://` pode bloquear ES Modules.

## Fontes

Primeira integração: [OpenAlex](https://docs.openalex.org/). Planejadas: Crossref, DataCite, OpenAIRE, Zenodo, arXiv, Europe PMC, GitHub, Hugging Face e repositórios institucionais. Cada integração depende de CORS, autenticação, limites de uso e licenças.

## Princípios

Acessibilidade, desempenho, transparência da origem dos dados e segurança (sem credenciais no navegador).

## Publicação

O workflow `.github/workflows/pages.yml` publica o site no GitHub Pages. Em **Settings → Pages**, selecione **GitHub Actions** como fonte.

## Licença

A definir antes de aceitar contribuições externas.
