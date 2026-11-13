# Brouillon : équipe L_Sim (BigDFT, PyBigDFT, V_Sim)

À n'envoyer que si vous n'avez pas déjà ces réponses en interne. Canal : les mainteneurs via <https://gitlab.com/l_sim> ou vos contacts directs.

---

**Objet : Interface web pour BigDFT, quatre questions techniques**

Bonjour,

Nous construisons un atelier web pour BigDFT : on y assemble un calcul autour d'une scène 3D, il est exécuté par PyBigDFT dans un conteneur ou sur une machine distante, et les résultats reviennent dans la page. L'interface est générée à partir de `input_variables_definition.yaml` (BigDFT, PSolver, CheSS), que nous lisons directement dans `bigdft-suite`.

Quatre points sur lesquels votre avis nous éviterait des erreurs :

1. **Stabilité du schéma d'entrée.** Pouvons-nous considérer ces fichiers YAML comme l'interface publique des variables ? Y a-t-il des variables dépréciées ou des profils (`linear_laura`, noté « temporary ») à ne pas exposer ?
2. **Image de conteneur de référence.** Quelle image recommandez-vous pour exécuter BigDFT et PyBigDFT en production (CPU et GPU), et à quelle version la figer ?
3. **Suivi en direct.** Pour afficher la convergence pendant le calcul, nous lisons le logfile YAML au fil de l'eau. L'option `perf.signaling` est-elle une meilleure voie ?
4. **V_Sim.** Nous aimerions réutiliser ce qui existe plutôt que le réécrire : un rendu sans affichage côté serveur pour les figures de publication est-il envisageable ? Les lecteurs de formats (grilles d'ondelettes, densités) sont-ils utilisables comme bibliothèque ?

Nous citons les références depuis `bigdft_bibliography.yaml` et serions heureux de vous montrer la maquette.

Bien cordialement,

[Nom, fonction, organisme, courriel]
