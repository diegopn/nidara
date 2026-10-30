# Guia para agentes

Este arquivo dá contexto e orienta assistentes de programação que trabalham no repositório Nidara.

## O projeto

Nidara é uma plataforma web estática de descoberta científica aberta, criada por Diego Pereira do Nascimento. Ajuda pesquisadores a encontrar publicações, autores e conjuntos de dados em catálogos acadêmicos públicos.

O português brasileiro é o idioma padrão. As versões em inglês e espanhol ficam nas rotas `/en/` e `/es/`. A busca consulta OpenAlex e Crossref para publicações e autores e DataCite para conjuntos de dados. A cobertura e a qualidade dos metadados variam entre fontes; o sistema pode apresentar resultados parciais.

## Comportamentos a preservar

- Mantenha as três categorias de resultados, a busca direcionada de datasets, os filtros, a paginação e a ordenação.
- Preserve a lista de referências no navegador, sua disponibilidade durante novas buscas e as opções BibTeX, RIS, CSV geral e CSV de datasets.
- Preserve os filtros e a consulta nos links compartilháveis e mantenha as rotas e traduções de PT-BR, inglês e espanhol coerentes.
- Deduplicate registros pelo DOI quando possível; não una publicações apenas porque os títulos são parecidos.
- Trate licença, links de dados, documentação e relações como informações fornecidas pela fonte. Não presuma que um dado está aberto, disponível ou adequado ao estudo quando os metadados não dizem isso.
- A ordenação por completude mede a presença de metadados; não deve ser descrita como relevância ou qualidade científica.
- Preserve acessibilidade, navegação por teclado, estados de carregamento e adaptação a telas pequenas.

## Organização

- `index.html`: página-base em português brasileiro e estrutura da interface.
- `css/style.css`: estilos, temas e regras responsivas.
- `js/app.js`: inicialização, interação da interface e coordenação das buscas.
- `js/core/`: funções reutilizáveis para busca federada, autores, datasets, filtros, URLs, traduções, exportação e normalização.
- `js/providers/`: consultas e normalização das respostas de OpenAlex, Crossref e DataCite.
- `js/core/translations.json`: textos da interface. Toda chave usada deve existir em `pt-BR`, `en` e `es`.
- `assets/`: ícones e demais arquivos estáticos.
- `scripts/build_site.py`: gera as rotas estáticas e os arquivos prontos para publicação em `dist/` a partir dos arquivos-fonte.
- `tests/`: verificações Python e testes de comportamento JavaScript.
- `.github/workflows/pages.yml`: verifica o projeto em pull requests e publica o site após atualizações de `main`.
- `LICENSE` e `SECURITY.md`: licença e política de segurança; alterações nesses documentos devem ser intencionais e consistentes com o pedido do mantenedor.

## Regras para mudanças

- Prefira a menor alteração que resolva o problema e reutilize as funções existentes antes de criar novas camadas ou dependências.
- Coloque cada novo texto visível em `translations.json` nos três idiomas; mantenha PT-BR como padrão.
- Trate respostas externas como dados não confiáveis. Insira texto com APIs seguras do DOM, valide URLs externas e não interprete metadados como HTML.
- Edite os arquivos-fonte, não o conteúdo gerado em `dist/`.
- O README é voltado à apresentação pública do projeto; não acrescente instruções para executar o projeto localmente.
- Preserve os créditos e avisos de direitos autorais definidos em `LICENSE`.

## Verificação

- Para a suíte usada na publicação, execute `python3 -m unittest discover -s tests -v`. Em ambientes sem Node.js, os testes JavaScript chamados pela suíte são ignorados; registre essa limitação ao relatar a verificação.
- Depois de alterar páginas, rotas ou ativos de publicação, gere o site com `python3 scripts/build_site.py --output dist` e confira as rotas principal, `/en/` e `/es/`.
- Antes de concluir, verifique o diff e confirme que as alterações não removem comportamentos listados acima.
