-- Modelo RELACIONAL (DDIA cap. 2 — "Relational vs Document" e "Graph queries in SQL")
--
-- A hierarquia de lugares é modelada com uma tabela AUTO-REFERENCIADA (`within_id`).
-- O grafo social vira uma tabela de junção (`friendships`), e o emprego uma FK
-- (`persons.company_id`) — many-to-one clássico. Tudo por IDs, não texto livre.

DROP TABLE IF EXISTS friendships;
DROP TABLE IF EXISTS persons;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS locations;

CREATE TABLE locations (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL CHECK (type IN ('continent','country','state','city','neighborhood')),
  within_id TEXT REFERENCES locations (id)
);

CREATE TABLE companies (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- `manager_id` é uma FK auto-referenciada: o organograma (many-to-one recursivo).
CREATE TABLE persons (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  born_in_id  TEXT NOT NULL REFERENCES locations (id),
  lives_in_id TEXT NOT NULL REFERENCES locations (id),
  company_id  TEXT NOT NULL REFERENCES companies (id),
  manager_id  TEXT REFERENCES persons (id)
);

-- Amizade é NÃO-DIRECIONADA: guardamos um par (a,b) e simetrizamos nas consultas.
CREATE TABLE friendships (
  a TEXT NOT NULL REFERENCES persons (id),
  b TEXT NOT NULL REFERENCES persons (id),
  PRIMARY KEY (a, b)
);

CREATE INDEX idx_locations_within ON locations (within_id);
CREATE INDEX idx_persons_born ON persons (born_in_id);
CREATE INDEX idx_persons_lives ON persons (lives_in_id);
CREATE INDEX idx_persons_company ON persons (company_id);
CREATE INDEX idx_persons_manager ON persons (manager_id);
