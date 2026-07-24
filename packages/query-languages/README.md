# @poc/query-languages — Linguagens de Consulta

> DDIA cap. 2 — "Query Languages for Data": declarativo vs imperativo e MapReduce.

Usa o exemplo do próprio livro — observações de animais marinhos (tubarões).

## Declarativo vs Imperativo

- **Imperativo** (`sharksImperative`): um loop que descreve o *como* passo a passo.
- **Declarativo** (`sharksDeclarative`): `filter(a => a.family === 'Sharks')` —
  descreve o *o quê*; o runtime decide o *como* (podendo paralelizar, otimizar).
  É o argumento do livro a favor de SQL/CSS.

## MapReduce

`sharksPerMonthMapReduce` mostra o modelo **map → reduce**: a fase *map* emite
`(mês, quantidade)` para cada observação de tubarão; a fase *reduce* soma por
mês. `sharksPerMonthDeclarative` é o equivalente declarativo (como uma
aggregation pipeline do MongoDB, ver [`@poc/document`](../document)).

Rodar a demo:

```bash
npm run cli -- query-languages
```

Código em [`sharks.ts`](./sharks.ts).
