# Nidara

Plataforma de pesquisa e descoberta científica em fontes acadêmicas abertas, criada por Diego Pereira do Nascimento.

## Idiomas

- Português brasileiro: <https://diegopn.github.io/nidara/>
- English: <https://diegopn.github.io/nidara/en/>
- Español: <https://diegopn.github.io/nidara/es/>

O idioma selecionado aparece no endereço da página. Links compartilhados preservam a pesquisa, os filtros e o idioma.

## Pesquisa

- Consulta OpenAlex e Crossref em paralelo, com indicação das fontes e de eventuais respostas parciais.
- Filtros por intervalo de anos e tipo de publicação, ordenação e paginação.
- Deduplicação por DOI sem combinar publicações que só tenham títulos parecidos.
- Itens salvos neste navegador e exportação BibTeX, RIS ou CSV.
- Tema claro ou escuro e layout adaptado a telas pequenas.

## Publicação

O GitHub Actions verifica o site e publica as três rotas no GitHub Pages quando há um novo envio para `main`. A fonte do GitHub Pages deve estar configurada como **GitHub Actions**.

## Licença

O código está sob a [PolyForm Noncommercial 1.0.0](LICENSE), que permite usos não comerciais e exige que cópias distribuídas incluam o texto ou link da licença e o aviso de copyright com o endereço do projeto. Ela não autoriza uso comercial sem uma autorização separada. Por restringir o uso comercial, esta é uma licença de código-fonte disponível, não uma licença open source segundo a definição da OSI. A licença não exige que cada uso seja comunicado diretamente ao autor.

## Fontes e limites

- [OpenAlex](https://docs.openalex.org/): catálogo bibliográfico consultado pela API pública; o acesso sem chave pode atingir o limite disponível.
- [Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/): metadados públicos de trabalhos registrados, com cobertura variável conforme a publicação.

Os metadados e resumos são fornecidos pelas fontes. Confira a publicação original para validar completude, disponibilidade e licença. Itens salvos permanecem no armazenamento local do navegador.

## Organização dos arquivos

```text
index.html              # página-base em português brasileiro
scripts/build_site.py   # gera as rotas estáticas de inglês e espanhol
css/                    # estilos
js/core/                # busca, normalização, exportação e traduções
js/providers/           # integrações com cada fonte
tests/                  # verificações executadas antes da publicação
.github/workflows/      # validação e publicação automática
```
