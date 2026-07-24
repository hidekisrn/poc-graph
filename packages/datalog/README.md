# @poc/datalog — Datalog

> DDIA cap. 2 — "Graph-Like Data Models → The Foundation: Datalog".

## O que este pacote ilustra

O DDIA apresenta Datalog como a **fundação** dos modelos de grafo: em vez de
descrever um caminho, você declara **fatos** e **regras**, e o motor deriva
todas as conclusões possíveis por **ponto-fixo**. Regras recursivas expressam
fechos transitivos (`within_rec`, `reach`); `!=` e `not` expressam as exclusões.

```datalog
% amizade não-direcionada
friend(A, B) :- knows(A, B).
friend(A, B) :- knows(B, A).

% fecho transitivo reflexivo de within (parte reflexiva de forma segura)
within_rec(A, A) :- within(A, B).
within_rec(B, B) :- within(A, B).
within_rec(A, C) :- within(A, B), within_rec(B, C).

emigrant(P)   :- born_in(P, B), within_rec(B, usa), lives_in(P, L), within_rec(L, europe).
colleague(P)  :- works_at(lucy, C), works_at(P, C), P != lucy.
fof(P)        :- friend(lucy, F), friend(F, P), P != lucy, not friend(lucy, P).
reach(P)      :- friend(lucy, P).
reach(P)      :- reach(Q), friend(Q, P).
network(P)    :- reach(P), P != lucy.
compatriot(P) :- country_of(lucy, C), country_of(P, C), P != lucy.
```

Consultas: `?- emigrant(P).`, `?- fof(P).`, `?- network(P).`, etc. (uma relação
IDB por pergunta). Regras completas em [`rules.datalog`](./rules.datalog).

> O motor suporta **desigualdade** (`!=`) e **negação estratificada** (`not`).
> A negação é segura: as variáveis já vêm ligadas por átomos positivos e a ordem
> das regras garante que a relação negada (`friend`) esteja completa antes de `fof`.

## Nota de implementação

A POC usa um **motor Datalog em TypeScript puro** ([`engine.ts`](./engine.ts),
compacto e legível) em vez de um banco Datalog externo (ex.: CozoDB). Motivo: zero
dependência de binário nativo e — mais importante para fins didáticos — o
algoritmo de avaliação (parsing, unificação, ponto-fixo) fica **legível e
auditável** ao lado das regras. As regras em [`rules.datalog`](./rules.datalog)
são a fonte real (parseadas em runtime); os fatos (EDB) vêm do dataset canônico.

Para trocar por um engine real depois, basta reimplementar `ModelAdapter`
mantendo `rules.datalog` como referência.
