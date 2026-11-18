# @formularios/cli

Gera em lote as páginas de um projeto — a pasta com `pages/` e `components/`, ou
o zip de projeto da interface web — numa pasta de saída pronta para publicar.
Detalhes: §10.1 do `agentes.md`.

```bash
formularios build <projeto> <saída> [--force] [--no-runtime] [--no-stub] [--no-script]
formularios check <projeto>
```

Não depende do pacote `web`: lê o zip com o próprio leitor (`src/zip.js`,
`node:zlib`). Os testes usam `@formularios/web` só para gerar zips reais e
conferir a compatibilidade.
