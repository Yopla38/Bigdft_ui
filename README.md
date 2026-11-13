# Bigdft_ui

Un atelier web pour BigDFT : construire une simulation autour d'une scène 3D, la lancer, l'analyser, la partager, la publier.

Le dossier de proposition est dans [`docs/PROPOSITION.md`](docs/PROPOSITION.md). Nom de travail : Ondelette.

## Contenu

| Chemin | Rôle |
|---|---|
| `docs/PROPOSITION.md` | Vision, analyse des paramètres, architecture, ordre de construction, questions ouvertes |
| `docs/courriers/` | Brouillons de courriers (OneAngstrom, L_Sim) |
| `schema/bigdft-input.schema.json` | Les 313 variables d'entrée de BigDFT, PSolver et CheSS, extraites de la source |
| `schema/ui-tiers.yaml` | Décision produit : brique et profondeur de chaque variable |
| `ontology/atelier.ttl` | Ontologie non instanciée pour une mémoire AOM |
| `ontology/corpus/` | Corpus généré pour `aom_ingest` |
| `prototype/` | Maquette immersive (page unique, three.js, sans étape de construction) |
| `tools/` | Extraction du schéma, génération du catalogue et du corpus, serveur d'aperçu |

## Voir la maquette

```bash
python tools/preview.py        # http://localhost:8765
```

## Régénérer après une montée de version de BigDFT

```bash
git clone --depth 1 https://gitlab.com/l_sim/bigdft-suite.git /tmp/bigdft-suite
python tools/extract_schema.py /tmp/bigdft-suite     # schema/bigdft-input.schema.json
python tools/build_prototype_schema.py               # prototype/js/schema.js, échoue si la curation est périmée
python tools/build_aom_corpus.py                     # ontology/corpus/bigdft-variables.md
```

Dépendance : Python 3.10 ou plus récent, et PyYAML.
